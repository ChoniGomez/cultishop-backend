"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settingsController_1 = require("../controllers/settingsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Endpoints públicos para consultar datos de pago (Checkout, Carrito, etc.)
router.get('/', settingsController_1.getPaymentSettings);
router.get('/payment', settingsController_1.getPaymentSettings);
// Endpoint administrativo para modificar alias, CBU y datos de pago
router.put('/payment', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, settingsController_1.updatePaymentSettings);
// Endpoints para consultar y modificar ubicación del local y mapa de Google Maps
router.get('/location', settingsController_1.getLocationSettings);
router.get('/store', settingsController_1.getLocationSettings);
router.put('/location', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, settingsController_1.updateLocationSettings);
router.put('/store', authMiddleware_1.requireAuth, authMiddleware_1.requireAdmin, settingsController_1.updateLocationSettings);
exports.default = router;
