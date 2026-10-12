import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import orderRoutes from './routes/orderRoutes';
import categoryRoutes from './routes/categoryRoutes';
import { initDb } from './config/initDb';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Inicializar verificación de esquema y usuario administrador
initDb().catch(err => console.error('Error al iniciar base de datos:', err));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);

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
    res.status(500).json({ error: err?.message || 'Error interno del servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`🌿 Servidor CultiShop corriendo en el puerto ${PORT}`);
});
