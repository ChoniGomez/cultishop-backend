"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const orderController_1 = require("../controllers/orderController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Crear pedido (consumidores registrados o invitados)
router.post('/', orderController_1.createOrder);
// Ver mis pedidos (usuario autenticado)
router.get('/my-orders', authMiddleware_1.requireAuth, orderController_1.getMyOrders);
// Gestión de pedidos (Solo Admin)
router.get('/', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, orderController_1.getAllOrders);
router.patch('/:id/status', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, orderController_1.updateOrderStatus);
router.delete('/:id', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, orderController_1.deleteOrder);
exports.default = router;
