"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateLocationSettings = exports.getLocationSettings = exports.sanitizeGoogleMapsEmbedUrl = exports.DEFAULT_LOCATION_SETTINGS = exports.updatePaymentSettings = exports.getPaymentSettings = void 0;
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
exports.DEFAULT_LOCATION_SETTINGS = {
    store_address: 'Av. López y Planes 2919 (entre Lavalle y Santa Catalina)',
    store_city: 'Posadas, Misiones, Argentina',
    store_hours: 'Lunes a Sábado de 09:00 a 13:00 y de 16:30 a 20:30 hs',
    store_phone: '+54 9 376 435-6995',
    google_maps_url: 'https://maps.google.com/?q=Av.+López+y+Planes+2919,+Posadas',
    google_maps_embed_url: 'https://maps.google.com/maps?q=Av.+L%C3%B3pez+y+Planes+2919,+Posadas,+Misiones,+Argentina&t=&z=16&ie=UTF8&iwloc=&output=embed'
};
const sanitizeGoogleMapsEmbedUrl = (raw) => {
    if (!raw || typeof raw !== 'string')
        return exports.DEFAULT_LOCATION_SETTINGS.google_maps_embed_url;
    const trimmed = raw.trim();
    const iframeMatch = trimmed.match(/src=["']([^"']+)["']/i);
    if (iframeMatch && iframeMatch[1]) {
        return iframeMatch[1];
    }
    return trimmed;
};
exports.sanitizeGoogleMapsEmbedUrl = sanitizeGoogleMapsEmbedUrl;
const getLocationSettings = async (req, res) => {
    try {
        const result = await database_1.pool.query("SELECT value FROM settings WHERE key = 'location' LIMIT 1");
        if (result.rows.length === 0) {
            return res.json({ location: exports.DEFAULT_LOCATION_SETTINGS });
        }
        const value = result.rows[0].value;
        const location = typeof value === 'string' ? JSON.parse(value) : value;
        return res.json({
            location: {
                ...exports.DEFAULT_LOCATION_SETTINGS,
                ...location
            }
        });
    }
    catch (error) {
        console.error('Error en getLocationSettings:', error.message);
        return res.json({ location: exports.DEFAULT_LOCATION_SETTINGS });
    }
};
exports.getLocationSettings = getLocationSettings;
const updateLocationSettings = async (req, res) => {
    try {
        const { store_address, store_city, store_hours, store_phone, google_maps_url, google_maps_embed_url } = req.body;
        const currentRes = await database_1.pool.query("SELECT value FROM settings WHERE key = 'location' LIMIT 1");
        let currentSettings = exports.DEFAULT_LOCATION_SETTINGS;
        if (currentRes.rows.length > 0) {
            const val = currentRes.rows[0].value;
            currentSettings = {
                ...exports.DEFAULT_LOCATION_SETTINGS,
                ...(typeof val === 'string' ? JSON.parse(val) : val)
            };
        }
        const sanitizedEmbedUrl = google_maps_embed_url !== undefined
            ? (0, exports.sanitizeGoogleMapsEmbedUrl)(google_maps_embed_url)
            : currentSettings.google_maps_embed_url;
        const updatedLocation = {
            store_address: typeof store_address === 'string' && store_address.trim() ? store_address.trim() : currentSettings.store_address,
            store_city: typeof store_city === 'string' && store_city.trim() ? store_city.trim() : currentSettings.store_city,
            store_hours: typeof store_hours === 'string' && store_hours.trim() ? store_hours.trim() : currentSettings.store_hours,
            store_phone: typeof store_phone === 'string' && store_phone.trim() ? store_phone.trim() : currentSettings.store_phone,
            google_maps_url: typeof google_maps_url === 'string' && google_maps_url.trim() ? google_maps_url.trim() : currentSettings.google_maps_url,
            google_maps_embed_url: sanitizedEmbedUrl
        };
        const upsertRes = await database_1.pool.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('location', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE 
        SET value = $1::jsonb, updated_at = NOW()
      RETURNING value, updated_at
    `, [JSON.stringify(updatedLocation)]);
        const savedValue = upsertRes.rows[0].value;
        const finalLocation = typeof savedValue === 'string' ? JSON.parse(savedValue) : savedValue;
        return res.json({
            message: 'Ubicación y mapa de Google Maps actualizados exitosamente.',
            location: finalLocation
        });
    }
    catch (error) {
        console.error('Error en updateLocationSettings:', error.message);
        return res.status(500).json({ error: 'Error al actualizar configuración de ubicación y mapa.' });
    }
};
exports.updateLocationSettings = updateLocationSettings;
