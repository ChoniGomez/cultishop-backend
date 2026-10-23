import { Router } from 'express';
import {
  getActiveInstagramVideos,
  getAllInstagramVideosAdmin,
  getInstagramVideoById,
  createInstagramVideo,
  updateInstagramVideo,
  deleteInstagramVideo,
  toggleInstagramVideoActive
} from '../controllers/instagramController';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Rutas de Lectura (Públicas y para administración)
router.get('/', getActiveInstagramVideos);
router.get('/all', getAllInstagramVideosAdmin);
router.get('/admin/all', getAllInstagramVideosAdmin);

// Rutas Protegidas de Administración (Crear, Modificar, Eliminar)
router.post('/', requireAuth, requireAdmin, createInstagramVideo);
router.put('/:id', requireAuth, requireAdmin, updateInstagramVideo);
router.patch('/:id', requireAuth, requireAdmin, updateInstagramVideo);
router.patch('/:id/toggle', requireAuth, requireAdmin, toggleInstagramVideoActive);
router.delete('/:id', requireAuth, requireAdmin, deleteInstagramVideo);

// Obtener video individual por ID
router.get('/:id', getInstagramVideoById);

export default router;
