import { Router } from 'express';
import { register, login, googleAuth, getMe, changePassword } from '../controllers/authController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// Endpoints de autenticación
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.get('/me', requireAuth, getMe);

// Gestión de perfil y contraseña segura
router.put('/change-password', requireAuth, changePassword);

export default router;
