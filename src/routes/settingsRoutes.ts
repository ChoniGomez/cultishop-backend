import { Router } from 'express';
import { 
  getPaymentSettings, 
  updatePaymentSettings,
  getLocationSettings,
  updateLocationSettings
} from '../controllers/settingsController';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Endpoints públicos para consultar datos de pago (Checkout, Carrito, etc.)
router.get('/', getPaymentSettings);
router.get('/payment', getPaymentSettings);

// Endpoint administrativo para modificar alias, CBU y datos de pago
router.put('/payment', requireAuth, requireAdmin, updatePaymentSettings);

// Endpoints para consultar y modificar ubicación del local y mapa de Google Maps
router.get('/location', getLocationSettings);
router.get('/store', getLocationSettings);
router.put('/location', requireAuth, requireAdmin, updateLocationSettings);
router.put('/store', requireAuth, requireAdmin, updateLocationSettings);

export default router;
