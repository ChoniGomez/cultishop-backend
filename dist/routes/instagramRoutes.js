"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const instagramController_1 = require("../controllers/instagramController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Rutas de Lectura (Públicas y para administración)
router.get('/', instagramController_1.getActiveInstagramVideos);
router.get('/all', instagramController_1.getAllInstagramVideosAdmin);
router.get('/admin/all', instagramController_1.getAllInstagramVideosAdmin);
// Rutas Protegidas de Administración (Crear, Modificar, Eliminar)
router.post('/', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, instagramController_1.createInstagramVideo);
router.put('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, instagramController_1.updateInstagramVideo);
router.patch('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, instagramController_1.updateInstagramVideo);
router.patch('/:id/toggle', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, instagramController_1.toggleInstagramVideoActive);
router.delete('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, instagramController_1.deleteInstagramVideo);
// Obtener video individual por ID
router.get('/:id', instagramController_1.getInstagramVideoById);
exports.default = router;
