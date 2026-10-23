import { Router } from 'express';
import {
  getInstitutionalBundle,
  getActiveAboutSections,
  getAllAboutSectionsAdmin,
  getAboutSectionById,
  createAboutSection,
  updateAboutSection,
  deleteAboutSection,
  toggleAboutSectionActive
} from '../controllers/aboutController';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Endpoint Consolidado: Obtener en 1 sola llamada Sobre Nosotros + Instagram + FAQ + Ubicación
router.get('/bundle', getInstitutionalBundle);

// Rutas de Lectura (Públicas y para administración)
router.get('/', getActiveAboutSections);
router.get('/all', getAllAboutSectionsAdmin);
router.get('/admin/all', getAllAboutSectionsAdmin);

// Rutas Protegidas de Administración (Crear, Modificar, Eliminar)
router.post('/', requireAuth, requireAdmin, createAboutSection);
router.put('/:id', requireAuth, requireAdmin, updateAboutSection);
router.patch('/:id', requireAuth, requireAdmin, updateAboutSection);
router.patch('/:id/toggle', requireAuth, requireAdmin, toggleAboutSectionActive);
router.delete('/:id', requireAuth, requireAdmin, deleteAboutSection);

// Obtener bloque individual por ID
router.get('/:id', getAboutSectionById);

export default router;
