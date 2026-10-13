import { Router } from 'express';
import {
  getActiveBanners,
  getAllBannersAdmin,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
  toggleBannerActive
} from '../controllers/bannerController';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Rutas de Lectura de Banners (Carrusel público y panel de administración)
router.get('/', getActiveBanners);
router.get('/all', getAllBannersAdmin);
router.get('/admin/all', getAllBannersAdmin);

// Rutas Protegidas de Administración (Crear, Modificar, Eliminar)
router.post('/', requireAuth, requireAdmin, createBanner);
router.put('/:id', requireAuth, requireAdmin, updateBanner);
router.patch('/:id', requireAuth, requireAdmin, updateBanner);
router.patch('/:id/toggle', requireAuth, requireAdmin, toggleBannerActive);
router.delete('/:id', requireAuth, requireAdmin, deleteBanner);

// Ruta por ID pública o general (después de /admin/all para no colisionar)
router.get('/:id', getBannerById);

export default router;

