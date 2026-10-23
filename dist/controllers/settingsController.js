"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePaymentSettings = exports.getPaymentSettings = void 0;
const database_1 = require("../config/database");
const DEFAULT_PAYMENT_SETTINGS = {
    bank_alias: 'CULTISHOP.POSADAS',
    bank_cbu: '',
    bank_name: 'Mercado Pago / Billeteras Virtuales',
    account_holder: 'CultiShop Posadas',
    payment_notes: 'Al confirmar el pedido podrás enviar el comprobante de transferencia directamente por WhatsApp.'
};
/**
 * Obtener configuración de pagos (Público para checkout y visualización)
 */
const getPaymentSettings = async (req, res) => {
    try {
        const result = await database_1.pool.query("SELECT value FROM settings WHERE key = 'payment' LIMIT 1");
        if (result.rows.length === 0) {
            return res.json({ payment: DEFAULT_PAYMENT_SETTINGS });
        }
        const value = result.rows[0].value;
        const payment = typeof value === 'string' ? JSON.parse(value) : value;
        return res.json({
            payment: {
                ...DEFAULT_PAYMENT_SETTINGS,
                ...payment
            }
        });
    }
    catch (error) {
        console.error('Error en getPaymentSettings:', error.message);
        // En caso de error de BD, retornar defaults para no romper el checkout
        return res.json({ payment: DEFAULT_PAYMENT_SETTINGS });
    }
};
exports.getPaymentSettings = getPaymentSettings;
/**
 * Actualizar configuración de pagos (Solo Administrador)
 */
const updatePaymentSettings = async (req, res) => {
    try {
        const { bank_alias, bank_cbu, bank_name, account_holder, payment_notes } = req.body;
        // Obtener valores actuales o default
        const currentRes = await database_1.pool.query("SELECT value FROM settings WHERE key = 'payment' LIMIT 1");
        let currentSettings = DEFAULT_PAYMENT_SETTINGS;
        if (currentRes.rows.length > 0) {
            const val = currentRes.rows[0].value;
            currentSettings = {
                ...DEFAULT_PAYMENT_SETTINGS,
                ...(typeof val === 'string' ? JSON.parse(val) : val)
            };
        }
        const updatedPayment = {
            bank_alias: typeof bank_alias === 'string' ? bank_alias.trim().toUpperCase() : currentSettings.bank_alias,
            bank_cbu: typeof bank_cbu === 'string' ? bank_cbu.trim() : currentSettings.bank_cbu,
            bank_name: typeof bank_name === 'string' ? bank_name.trim() : currentSettings.bank_name,
            account_holder: typeof account_holder === 'string' ? account_holder.trim() : currentSettings.account_holder,
            payment_notes: typeof payment_notes === 'string' ? payment_notes.trim() : currentSettings.payment_notes
        };
        const upsertRes = await database_1.pool.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('payment', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE 
        SET value = $1::jsonb, updated_at = NOW()
      RETURNING value, updated_at
    `, [JSON.stringify(updatedPayment)]);
        const savedValue = upsertRes.rows[0].value;
        const finalPayment = typeof savedValue === 'string' ? JSON.parse(savedValue) : savedValue;
        return res.json({
            message: 'Configuración de datos de pago actualizada exitosamente.',
            payment: finalPayment
        });
    }
    catch (error) {
        console.error('Error en updatePaymentSettings:', error.message);
        return res.status(500).json({ error: 'Error al actualizar los datos de pago en la base de datos.' });
    }
};
exports.updatePaymentSettings = updatePaymentSettings;
