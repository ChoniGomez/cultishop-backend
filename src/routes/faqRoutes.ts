import { Router } from 'express';
import {
  getActiveFaqs,
  getAllFaqsAdmin,
  getFaqById,
  createFaq,
  updateFaq,
  deleteFaq,
  toggleFaqActive
} from '../controllers/faqController';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Rutas de Lectura (Públicas y para administración)
router.get('/', getActiveFaqs);
router.get('/all', getAllFaqsAdmin);
router.get('/admin/all', getAllFaqsAdmin);

// Rutas Protegidas de Administración (Crear, Modificar, Eliminar)
router.post('/', requireAuth, requireAdmin, createFaq);
router.put('/:id', requireAuth, requireAdmin, updateFaq);
router.patch('/:id', requireAuth, requireAdmin, updateFaq);
router.patch('/:id/toggle', requireAuth, requireAdmin, toggleFaqActive);
router.delete('/:id', requireAuth, requireAdmin, deleteFaq);

// Obtener pregunta individual por ID
router.get('/:id', getFaqById);

export default router;
