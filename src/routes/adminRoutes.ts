import { Router } from 'express';
import { getAdminStats } from '../controllers/adminController';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Métricas y conteos ultraligeros del panel de control
router.get('/stats', requireAuth, requireAdmin, getAdminStats);
router.get('/summary', requireAuth, requireAdmin, getAdminStats);

export default router;

