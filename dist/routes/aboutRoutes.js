"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aboutController_1 = require("../controllers/aboutController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Rutas de Lectura (Públicas y para administración)
router.get('/', aboutController_1.getActiveAboutSections);
router.get('/all', aboutController_1.getAllAboutSectionsAdmin);
router.get('/admin/all', aboutController_1.getAllAboutSectionsAdmin);
// Rutas Protegidas de Administración (Crear, Modificar, Eliminar)
router.post('/', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, aboutController_1.createAboutSection);
router.put('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, aboutController_1.updateAboutSection);
router.patch('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, aboutController_1.updateAboutSection);
router.patch('/:id/toggle', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, aboutController_1.toggleAboutSectionActive);
router.delete('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, aboutController_1.deleteAboutSection);
// Obtener bloque individual por ID
router.get('/:id', aboutController_1.getAboutSectionById);
exports.default = router;
