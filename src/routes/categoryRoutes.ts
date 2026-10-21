import { Router } from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryVisibility
} from '../controllers/categoryController';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Rutas públicas (lectura de categorías estructuradas para el frontend y Navbar)
router.get('/', getCategories);

// Rutas protegidas exclusivas de administradores (CRUD completo de categorías)
router.post('/', requireAuth, requireAdmin, createCategory);
router.put('/:id', requireAuth, requireAdmin, updateCategory);
router.patch('/:id/toggle-visibility', requireAuth, requireAdmin, toggleCategoryVisibility);
router.delete('/:id', requireAuth, requireAdmin, deleteCategory);

export default router;
