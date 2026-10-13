"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const productController_1 = require("../controllers/productController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Rutas públicas para catálogo
router.get('/', productController_1.getProducts);
router.get('/:id', productController_1.getProductById);
// Rutas protegidas solo para administradores
router.post('/', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, productController_1.createProduct);
router.put('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, productController_1.updateProduct);
router.delete('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, productController_1.deleteProduct);
exports.default = router;
