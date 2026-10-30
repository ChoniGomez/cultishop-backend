"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sharp_1 = __importDefault(require("sharp"));
const database_1 = require("./config/database");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const productRoutes_1 = __importDefault(require("./routes/productRoutes"));
const orderRoutes_1 = __importDefault(require("./routes/orderRoutes"));
const categoryRoutes_1 = __importDefault(require("./routes/categoryRoutes"));
const bannerRoutes_1 = __importDefault(require("./routes/bannerRoutes"));
const settingsRoutes_1 = __importDefault(require("./routes/settingsRoutes"));
const aboutRoutes_1 = __importDefault(require("./routes/aboutRoutes"));
const instagramRoutes_1 = __importDefault(require("./routes/instagramRoutes"));
const faqRoutes_1 = __importDefault(require("./routes/faqRoutes"));
const uploadRoutes_1 = __importDefault(require("./routes/uploadRoutes"));
const initDb_1 = require("./config/initDb");
const imageProcessor_1 = require("./utils/imageProcessor");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Opciones de cabecera para archivos estáticos con caché prolongada
const staticOptions = {
    maxAge: '30d',
    immutable: true,
    fallthrough: true // Permite continuar al siguiente middleware si el archivo no existe en este directorio
};
// 1. Exponer la carpeta de subidas de forma pública (/uploads) soportando múltiples ubicaciones físicas en VPS
app.use('/uploads', express_1.default.static(imageProcessor_1.UPLOADS_DIR, staticOptions));
app.use('/uploads', express_1.default.static(path_1.default.resolve(process.cwd(), 'uploads'), staticOptions));
app.use('/uploads', express_1.default.static(path_1.default.resolve(process.cwd(), 'backend', 'uploads'), staticOptions));
// 2. Exponer idénticamente bajo /api/uploads para compatibilidad directa con proxies Nginx configurados en /api/
app.use('/api/uploads', express_1.default.static(imageProcessor_1.UPLOADS_DIR, staticOptions));
app.use('/api/uploads', express_1.default.static(path_1.default.resolve(process.cwd(), 'uploads'), staticOptions));
app.use('/api/uploads', express_1.default.static(path_1.default.resolve(process.cwd(), 'backend', 'uploads'), staticOptions));
// Píxel WebP transparente 1x1 (26 bytes) para contingencia garantizando que NUNCA se retorne text/html
const TRANSPARENT_WEBP_1X1 = Buffer.from('UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoB+AAAAAD+/uWAAA==', 'base64');
// Manejador dinámico on-demand para generar y servir imágenes WebP si aún no están en disco físico
const handleUploadImageRequest = async (req, res, next) => {
    const filename = req.params.filename;
    if (!filename) {
        return next();
    }
    // Verificar si la petición solicita la imagen determinista de un producto (product-:id.webp)
    const match = filename.match(/^product-(\d+)\.webp$/i);
    if (match) {
        const productId = parseInt(match[1], 10);
        try {
            const dbRes = await database_1.pool.query('SELECT image_url FROM products WHERE id = $1', [productId]);
            if (dbRes.rows.length > 0 && dbRes.rows[0].image_url) {
                const rawImage = String(dbRes.rows[0].image_url).trim();
                // Si la base de datos contiene Base64 original, convertir al vuelo inmediatamente
                if (rawImage.startsWith('data:image/')) {
                    const matches = rawImage.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
                    const base64Data = matches ? matches[2] : rawImage;
                    const buffer = Buffer.from(base64Data, 'base64');
                    if (buffer.length > 0) {
                        const webpBuffer = await (0, sharp_1.default)(buffer)
                            .rotate()
                            .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
                            .webp({ quality: 85, effort: 4 })
                            .toBuffer();
                        // Guardar físicamente en disco para que en adelante express.static la sirva directamente
                        const destinationPath = path_1.default.join(imageProcessor_1.UPLOADS_DIR, filename);
                        fs_1.default.promises.writeFile(destinationPath, webpBuffer).catch(() => { });
                        database_1.pool.query('UPDATE products SET image_url = $1 WHERE id = $2', [`/uploads/${filename}`, productId]).catch(() => { });
                        res.setHeader('Content-Type', 'image/webp');
                        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
                        return res.status(200).send(webpBuffer);
                    }
                }
                else if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
                    return res.redirect(302, rawImage);
                }
            }
        }
        catch (err) {
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
(0, initDb_1.initDb)().catch(err => console.error('Error al iniciar base de datos:', err));
// Rutas de la API
app.use('/api/auth', authRoutes_1.default);
app.use('/api/products', productRoutes_1.default);
app.use('/api/categories', categoryRoutes_1.default);
app.use('/api/orders', orderRoutes_1.default);
app.use('/api/banners', bannerRoutes_1.default);
app.use('/api/settings', settingsRoutes_1.default);
app.use('/api/about', aboutRoutes_1.default);
app.use('/api/instagram', instagramRoutes_1.default);
app.use('/api/faqs', faqRoutes_1.default);
app.use('/api/upload', uploadRoutes_1.default);
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Backend CultiShop funcionando correctamente' });
});
// Manejador para cualquier ruta no encontrada en /api
app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `Ruta de la API no encontrada: ${req.method} ${req.originalUrl}` });
});
// Middleware global de errores en formato JSON
app.use((err, req, res, next) => {
    console.error('Error no capturado en Express:', err);
    if (!res.headersSent) {
        const status = err?.status || err?.statusCode || 500;
        res.status(status).json({ error: err?.message || 'Error interno del servidor.' });
    }
});
app.listen(PORT, () => {
    console.log(`🌿 Servidor CultiShop corriendo en el puerto ${PORT}`);
});
