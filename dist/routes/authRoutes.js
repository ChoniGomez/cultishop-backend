"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Endpoints de autenticación
router.post('/register', authController_1.register);
router.post('/login', authController_1.login);
router.post('/google', authController_1.googleAuth);
router.get('/me', authMiddleware_1.requireAuth, authController_1.getMe);
// Gestión de perfil y contraseña segura
router.put('/change-password', authMiddleware_1.requireAuth, authController_1.changePassword);
exports.default = router;
