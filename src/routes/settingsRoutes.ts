import { Router } from 'express';
import { getPaymentSettings, updatePaymentSettings } from '../controllers/settingsController';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Endpoint público para consultar datos de pago (Checkout, Carrito, etc.)
router.get('/', getPaymentSettings);
router.get('/payment', getPaymentSettings);

// Endpoint administrativo para modificar alias, CBU y datos de pago
router.put('/payment', requireAuth, requireAdmin, updatePaymentSettings);

export default router;
