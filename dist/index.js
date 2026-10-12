"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const productRoutes_1 = __importDefault(require("./routes/productRoutes"));
const orderRoutes_1 = __importDefault(require("./routes/orderRoutes"));
const initDb_1 = require("./config/initDb");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Inicializar verificación de esquema y usuario administrador
(0, initDb_1.initDb)().catch(err => console.error('Error al iniciar base de datos:', err));
// Rutas de la API
app.use('/api/auth', authRoutes_1.default);
app.use('/api/products', productRoutes_1.default);
app.use('/api/orders', orderRoutes_1.default);
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
        res.status(500).json({ error: err?.message || 'Error interno del servidor.' });
    }
});
app.listen(PORT, () => {
    console.log(`🌿 Servidor CultiShop corriendo en el puerto ${PORT}`);
});
