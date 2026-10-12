import { Router } from 'express';
import { getCategories } from '../controllers/categoryController';

const router = Router();

// Ruta pública para obtener categorías y subcategorías
router.get('/', getCategories);

export default router;

