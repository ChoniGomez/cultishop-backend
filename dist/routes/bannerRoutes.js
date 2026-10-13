"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bannerController_1 = require("../controllers/bannerController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Rutas de Lectura de Banners (Carrusel público y panel de administración)
router.get('/', bannerController_1.getActiveBanners);
router.get('/all', bannerController_1.getAllBannersAdmin);
router.get('/admin/all', bannerController_1.getAllBannersAdmin);
// Rutas Protegidas de Administración (Crear, Modificar, Eliminar)
router.post('/', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, bannerController_1.createBanner);
router.put('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, bannerController_1.updateBanner);
router.patch('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, bannerController_1.updateBanner);
router.patch('/:id/toggle', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, bannerController_1.toggleBannerActive);
router.delete('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, bannerController_1.deleteBanner);
// Ruta por ID pública o general (después de /admin/all para no colisionar)
router.get('/:id', bannerController_1.getBannerById);
exports.default = router;
