import { Router } from 'express';
import { 
  createOrder, 
  getAllOrders, 
  getMyOrders, 
  updateOrderStatus, 
  deleteOrder 
} from '../controllers/orderController';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

// Crear pedido (consumidores registrados o invitados)
router.post('/', optionalAuth, createOrder);

// Ver mis pedidos (usuario autenticado)
router.get('/my-orders', requireAuth, getMyOrders);

// Gestión de pedidos (Solo Admin)
router.get('/', requireAuth, requireAdmin, getAllOrders);
router.patch('/:id/status', requireAuth, requireAdmin, updateOrderStatus);
router.delete('/:id', requireAuth, requireAdmin, deleteOrder);

export default router;
