"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const productController_1 = require("../controllers/productController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const uploadMiddleware_1 = require("../middleware/uploadMiddleware");
const router = (0, express_1.Router)();
// Middleware para admitir multipart/form-data con Multer para subida directa de archivos
const parseProductMultipart = (req, res, next) => {
    if (req.is('multipart/form-data')) {
        uploadMiddleware_1.upload.any()(req, res, (err) => {
            if (err) {
                return res.status(400).json({ error: err.message || 'Error al procesar archivos de imagen.' });
            }
            next();
        });
    }
    else {
        next();
    }
};
// Rutas públicas para catálogo
router.get('/', productController_1.getProducts);
router.get('/:id', productController_1.getProductById);
// Rutas protegidas solo para administradores (soportan JSON y multipart/form-data con múltiples imágenes)
router.post('/', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, parseProductMultipart, (0, uploadMiddleware_1.convertMultipleUploadsToWebp)('product'), productController_1.createProduct);
router.put('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, parseProductMultipart, (0, uploadMiddleware_1.convertMultipleUploadsToWebp)('product'), productController_1.updateProduct);
router.delete('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, productController_1.deleteProduct);
exports.default = router;
