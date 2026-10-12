import { Router } from 'express';
import { 
  getProducts, 
  getProductById, 
  createProduct, 
  updateProduct, 
  deleteProduct 
} from '../controllers/productController';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Rutas públicas para catálogo
router.get('/', getProducts);
router.get('/:id', getProductById);

// Rutas protegidas solo para administradores
router.post('/', requireAuth, requireAdmin, createProduct);
router.put('/:id', requireAuth, requireAdmin, updateProduct);
router.delete('/:id', requireAuth, requireAdmin, deleteProduct);

export default router;
