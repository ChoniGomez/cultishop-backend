"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settingsController_1 = require("../controllers/settingsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Endpoint público para consultar datos de pago (Checkout, Carrito, etc.)
router.get('/', settingsController_1.getPaymentSettings);
router.get('/payment', settingsController_1.getPaymentSettings);
// Endpoint administrativo para modificar alias, CBU y datos de pago
router.put('/payment', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, settingsController_1.updatePaymentSettings);
exports.default = router;
