import { Router } from 'express';
import { register, login, googleAuth, getMe } from '../controllers/authController';

const router = Router();

// Endpoints oficiales solicitados
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.get('/me', getMe);

export default router;

