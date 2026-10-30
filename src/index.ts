import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { pool } from './config/database';
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import orderRoutes from './routes/orderRoutes';
import categoryRoutes from './routes/categoryRoutes';
import bannerRoutes from './routes/bannerRoutes';
import settingsRoutes from './routes/settingsRoutes';
import aboutRoutes from './routes/aboutRoutes';
import instagramRoutes from './routes/instagramRoutes';
import faqRoutes from './routes/faqRoutes';
import uploadRoutes from './routes/uploadRoutes';
import { initDb } from './config/initDb';
import { UPLOADS_DIR } from './utils/imageProcessor';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Opciones de cabecera para archivos estáticos con caché prolongada
const staticOptions = {
  maxAge: '30d',
  immutable: true,
  fallthrough: true // Permite continuar al siguiente middleware si el archivo no existe en este directorio
};

// 1. Exponer la carpeta de subidas de forma pública (/uploads) soportando múltiples ubicaciones físicas en VPS
app.use('/uploads', express.static(UPLOADS_DIR, staticOptions));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads'), staticOptions));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'backend', 'uploads'), staticOptions));
app.use('/uploads', express.static('uploads', staticOptions));

// 2. Exponer idénticamente bajo /api/uploads para compatibilidad directa con proxies Nginx configurados en /api/
app.use('/api/uploads', express.static(UPLOADS_DIR, staticOptions));
app.use('/api/uploads', express.static(path.resolve(process.cwd(), 'uploads'), staticOptions));
app.use('/api/uploads', express.static(path.resolve(process.cwd(), 'backend', 'uploads'), staticOptions));
app.use('/api/uploads', express.static('uploads', staticOptions));

// Píxel WebP transparente 1x1 (26 bytes) para contingencia garantizando que NUNCA se retorne text/html
const TRANSPARENT_WEBP_1X1 = Buffer.from(
  'UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AAAAAD+/uWAAA==',
  'base64'
);

// Manejador dinámico on-demand para generar y servir imágenes WebP si aún no están en disco físico
const handleUploadImageRequest = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const filename = req.params.filename;
  if (!filename) {
    return next();
  }

  // Verificar si la petición solicita la imagen determinista de un producto (product-:id.webp)
  const match = filename.match(/^product-(\d+)\.webp$/i);
  if (match) {
    const productId = parseInt(match[1], 10);
    try {
      const dbRes = await pool.query('SELECT image_url FROM products WHERE id = $1', [productId]);
      if (dbRes.rows.length > 0 && dbRes.rows[0].image_url) {
        const rawImage = String(dbRes.rows[0].image_url).trim();

        // Si la base de datos contiene Base64 original, convertir al vuelo inmediatamente
        if (rawImage.startsWith('data:image/')) {
          const matches = rawImage.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
          const base64Data = matches ? matches[2] : rawImage;
          const buffer = Buffer.from(base64Data, 'base64');

          if (buffer.length > 0) {
            const webpBuffer = await sharp(buffer)
              .rotate()
              .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 85, effort: 4 })
              .toBuffer();

            // Guardar físicamente en disco para que en adelante express.static la sirva directamente
            const destinationPath = path.join(UPLOADS_DIR, filename);
            fs.promises.writeFile(destinationPath, webpBuffer).catch(() => {});
            pool.query('UPDATE products SET image_url = $1 WHERE id = $2', [`/uploads/${filename}`, productId]).catch(() => {});

            res.setHeader('Content-Type', 'image/webp');
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
            return res.status(200).send(webpBuffer);
          }
        } else if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
          return res.redirect(302, rawImage);
        }
      }
    } catch (err: any) {
      console.warn(`[StaticFallback] Error procesando imagen al vuelo para producto ${match[1]}:`, err?.message || err);
    }
  }

  // Si no existe o no se pudo generar, responder con un WebP transparente de 1x1 (NUNCA HTML)
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(404).send(TRANSPARENT_WEBP_1X1);
};

app.get('/uploads/:filename', handleUploadImageRequest);
app.get('/api/uploads/:filename', handleUploadImageRequest);

// Asegurar que cualquier otra ruta bajo /uploads o /api/uploads que falte devuelva WebP y no HTML
app.all(['/uploads/*', '/api/uploads/*'], (req, res) => {
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(404).send(TRANSPARENT_WEBP_1X1);
});

// Inicializar verificación de esquema y usuario administrador
initDb().catch(err => console.error('Error al iniciar base de datos:', err));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/about', aboutRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Backend CultiShop funcionando correctamente' });
});

// Manejador para cualquier ruta no encontrada en /api
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Ruta de la API no encontrada: ${req.method} ${req.originalUrl}` });
});

// Middleware global de errores en formato JSON
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error no capturado en Express:', err);
  if (!res.headersSent) {
    const status = err?.status || err?.statusCode || 500;
    res.status(status).json({ error: err?.message || 'Error interno del servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`🌿 Servidor CultiShop corriendo en el puerto ${PORT}`);
});
