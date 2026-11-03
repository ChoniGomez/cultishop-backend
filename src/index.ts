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
import adminRoutes from './routes/adminRoutes';
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

// Directorios físicos candidatos para servir archivos estáticos (soporte local y VPS Linux)
const uploadDirectories = [
  UPLOADS_DIR,
  path.resolve(process.cwd(), 'uploads'),
  path.resolve(process.cwd(), 'backend', 'uploads'),
  path.resolve(__dirname, '../uploads'),
  path.resolve(__dirname, '../../uploads'),
  path.resolve(__dirname, 'uploads'),
  '/var/www/cultishop/backend/uploads',
  '/var/www/cultishop/uploads'
];

// 1. Exponer la carpeta de subidas de forma pública (/uploads y /api/uploads) en todas las ubicaciones posibles
uploadDirectories.forEach((dir) => {
  try {
    if (fs.existsSync(dir)) {
      app.use('/uploads', express.static(dir, staticOptions));
      app.use('/api/uploads', express.static(dir, staticOptions));
    }
  } catch {}
});

// Mapeo temático de imágenes por categoría para insumos de cultivo
const CATEGORY_DEFAULT_IMAGES: { [key: string]: string } = {
  'fertilizantes': 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=600',
  'control-de-plagas': 'https://images.unsplash.com/photo-1536257104079-aa99c6460a5a?auto=format&fit=crop&q=80&w=600',
  'indoor': 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&q=80&w=600',
  'iluminacion': 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=600',
  'medicion': 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=600',
  'kits': 'https://images.unsplash.com/photo-1602928321679-560bb453f190?auto=format&fit=crop&q=80&w=600',
  'parafernalia': 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?auto=format&fit=crop&q=80&w=600',
  'sustratos-macetas': 'https://images.unsplash.com/photo-1592417817098-8f3d691a4bf5?auto=format&fit=crop&q=80&w=600',
  'semillas': 'https://images.unsplash.com/photo-1536939459926-301728717817?auto=format&fit=crop&q=80&w=600',
  'riego': 'https://images.unsplash.com/photo-1527842891421-42eec6e703ea?auto=format&fit=crop&q=80&w=600',
  'default': 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=600'
};

// Mapeo individual por ID de producto hacia su fotografía de insumo oficial
const PRODUCT_SPECIFIC_IMAGES: { [key: number]: string } = {
  1: 'https://images.unsplash.com/photo-1624990833801-56c1b6a56ba7?auto=format&fit=crop&q=80&w=600', // Oro Negro
  2: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=600', // Amazonia
  3: 'https://images.unsplash.com/photo-1628543606553-66239922f533?auto=format&fit=crop&q=80&w=600', // Flora Booster
  4: 'https://images.unsplash.com/photo-1536939459926-301728717817?auto=format&fit=crop&q=80&w=600', // Trico+
  5: 'https://images.unsplash.com/photo-1602928321679-560bb453f190?auto=format&fit=crop&q=80&w=600', // Kit Mamboreta
  6: 'https://images.unsplash.com/photo-1536257104079-aa99c6460a5a?auto=format&fit=crop&q=80&w=600', // Confi
  7: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&q=80&w=600', // Aba
  8: 'https://images.unsplash.com/photo-1568644396922-5c3bfae12521?auto=format&fit=crop&q=80&w=600', // Oil
  9: 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?auto=format&fit=crop&q=80&w=600', // GT5
  10: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&q=80&w=600', // GT25
  11: 'https://images.unsplash.com/photo-1527842891421-42eec6e703ea?auto=format&fit=crop&q=80&w=600', // Pulverizador
  12: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&q=80&w=600', // Regadera
  13: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=600'  // Medidor
};

const GLOBAL_FALLBACK_IMAGE = CATEGORY_DEFAULT_IMAGES.default;

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

  // Comprobar si el archivo físico ya existe en alguno de los directorios de almacenamiento
  for (const dir of uploadDirectories) {
    try {
      const fullPath = path.join(dir, filename);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        res.setHeader('Content-Type', filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        return res.sendFile(fullPath);
      }
    } catch {}
  }

  // Verificar si la petición solicita la imagen determinista de un producto (product-:id.webp)
  const match = filename.match(/^product-(\d+)\.webp$/i);
  if (match) {
    const productId = parseInt(match[1], 10);
    try {
      const dbRes = await pool.query(
        `SELECT p.image_url, p.images, c.slug as category_slug, sub.slug as subcategory_slug 
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id 
         LEFT JOIN categories sub ON p.subcategory_id = sub.id 
         WHERE p.id = $1`,
        [productId]
      );

      if (dbRes.rows.length > 0) {
        const row = dbRes.rows[0];
        let rawImage = row.image_url ? String(row.image_url).trim() : '';

        // Si image_url está vacío pero tiene array de images
        if (!rawImage && Array.isArray(row.images) && row.images.length > 0) {
          rawImage = String(row.images[0]).trim();
        }

        // Si la base de datos contiene Base64 original, convertir al vuelo inmediatamente
        if (rawImage && rawImage.startsWith('data:image/')) {
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
        } else if (rawImage && (rawImage.startsWith('http://') || rawImage.startsWith('https://'))) {
          return res.redirect(302, rawImage);
        }

        // Si no tiene imagen específica cargada en BD, verificar si corresponde a un producto oficial
        if (PRODUCT_SPECIFIC_IMAGES[productId]) {
          return res.redirect(302, PRODUCT_SPECIFIC_IMAGES[productId]);
        }

        // O asignar fallback temático por categoría (ej: fertilizante, medidor, indoor, sustrato)
        const catKey = String(row.subcategory_slug || row.category_slug || '').toLowerCase().trim();
        for (const [key, fallbackUrl] of Object.entries(CATEGORY_DEFAULT_IMAGES)) {
          if (key !== 'default' && catKey.includes(key)) {
            return res.redirect(302, fallbackUrl);
          }
        }
      }

      // Si el producto no existe o no tiene categoría asignada
      if (PRODUCT_SPECIFIC_IMAGES[productId]) {
        return res.redirect(302, PRODUCT_SPECIFIC_IMAGES[productId]);
      }

      return res.redirect(302, GLOBAL_FALLBACK_IMAGE);
    } catch (err: any) {
      console.warn(`[StaticFallback] Error procesando imagen al vuelo para producto ${match[1]}:`, err?.message || err);
    }
  }

  // Para cualquier otro archivo que no exista, redirigir a imagen global temática (nunca devolver 404 en consola)
  return res.redirect(302, GLOBAL_FALLBACK_IMAGE);
};

app.get('/uploads/:filename', handleUploadImageRequest);
app.get('/api/uploads/:filename', handleUploadImageRequest);

// Asegurar que cualquier otra ruta bajo /uploads o /api/uploads que falte redirija limpiamente
app.all(['/uploads/*', '/api/uploads/*'], (req, res) => {
  return res.redirect(302, GLOBAL_FALLBACK_IMAGE);
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
app.use('/api/admin', adminRoutes);

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
