"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.requireAdmin = exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../config/database");
const JWT_SECRET = process.env.JWT_SECRET || 'cultishop_secret_jwt_token_2026';
const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No autorizado. Se requiere token de sesión.' });
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Token de autenticación no válido.' });
        }
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (!decoded || !decoded.id) {
            return res.status(401).json({ error: 'Token inválido o expirado.' });
        }
        // Buscar datos actualizados del usuario en la base de datos
        const userResult = await database_1.pool.query('SELECT id, name, email, role, is_adult FROM users WHERE id = $1', [decoded.id]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'El usuario asociado a este token no existe.' });
        }
        req.user = userResult.rows[0];
        next();
    }
    catch (error) {
        console.error('Error en requireAuth:', error.message);
        return res.status(401).json({ error: 'Sesión expirada o token inválido.' });
    }
};
exports.requireAuth = requireAuth;
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Autenticación requerida.' });
    }
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Acceso restringido. Se requieren permisos de administrador para realizar esta acción.'
        });
    }
    next();
};
exports.requireAdmin = requireAdmin;
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            if (token) {
                const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
                if (decoded && decoded.id) {
                    const userResult = await database_1.pool.query('SELECT id, name, email, role, is_adult FROM users WHERE id = $1', [decoded.id]);
                    if (userResult.rows.length > 0) {
                        req.user = userResult.rows[0];
                    }
                }
            }
        }
    }
    catch (err) {
        // Si el token es inválido o no existe, simplemente continúa sin autenticar
    }
    next();
};
exports.optionalAuth = optionalAuth;
