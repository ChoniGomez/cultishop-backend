"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const categoryController_1 = require("../controllers/categoryController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Rutas públicas (lectura de categorías estructuradas para el frontend y Navbar)
router.get('/', categoryController_1.getCategories);
// Rutas protegidas exclusivas de administradores (CRUD completo de categorías)
router.post('/', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, categoryController_1.createCategory);
router.put('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, categoryController_1.updateCategory);
router.patch('/:id/toggle-visibility', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, categoryController_1.toggleCategoryVisibility);
router.delete('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, categoryController_1.deleteCategory);
exports.default = router;
