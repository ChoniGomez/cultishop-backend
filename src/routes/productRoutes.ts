import { Router, Request, Response, NextFunction } from 'express';
import { 
  getProducts, 
  getProductById, 
  createProduct, 
  updateProduct, 
  deleteProduct 
} from '../controllers/productController';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';
import { upload, convertMultipleUploadsToWebp } from '../middleware/uploadMiddleware';

const router = Router();

// Middleware para admitir multipart/form-data con Multer para subida directa de archivos
const parseProductMultipart = (req: Request, res: Response, next: NextFunction) => {
  if (req.is('multipart/form-data')) {
    upload.any()(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Error al procesar archivos de imagen.' });
      }
      next();
    });
  } else {
    next();
  }
};

// Rutas públicas para catálogo
router.get('/', getProducts);
router.get('/:id', getProductById);

// Rutas protegidas solo para administradores (soportan JSON y multipart/form-data con múltiples imágenes)
router.post('/', requireAuth, requireAdmin, parseProductMultipart, convertMultipleUploadsToWebp('product'), createProduct);
router.put('/:id', requireAuth, requireAdmin, parseProductMultipart, convertMultipleUploadsToWebp('product'), updateProduct);
router.delete('/:id', requireAuth, requireAdmin, deleteProduct);

export default router;
