"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePassword = exports.getMe = exports.googleAuth = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const google_auth_library_1 = require("google-auth-library");
const database_1 = require("../config/database");
const JWT_SECRET = process.env.JWT_SECRET || 'cultishop_secret_jwt_token_2026';
const googleClient = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const ADMIN_EMAIL = 'chonidacharygomez@gmail.com';
const register = async (req, res) => {
    try {
        const { name, email, password, isAdult } = req.body;
        // Validación de campos obligatorios
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Nombre, correo electrónico y contraseña son obligatorios.' });
        }
        // Validación obligatoria de mayoría de edad
        if (isAdult !== true && isAdult !== 'true') {
            return res.status(400).json({ error: 'Debes declarar ser mayor de 18 años para registrarte en CultiShop.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
        }
        const cleanEmail = email.trim().toLowerCase();
        // Verificar si el correo ya existe
        const existingUser = await database_1.pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Ya existe una cuenta registrada con este correo electrónico.' });
        }
        // Encriptar contraseña
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash(password, salt);
        // Asignar rol: 'admin' si es el correo designado, por defecto 'consumidor'
        const role = cleanEmail === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'consumidor';
        // Insertar nuevo usuario
        const result = await database_1.pool.query(`INSERT INTO users (name, email, password, role, is_adult, is_verified)
       VALUES ($1, $2, $3, $4, true, true)
       RETURNING id, name, email, role, is_adult, created_at`, [name.trim(), cleanEmail, hashedPassword, role]);
        const user = result.rows[0];
        // Generar token JWT
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(201).json({
            message: 'Usuario registrado exitosamente',
            token,
            user
        });
    }
    catch (error) {
        console.error('Error en register:', error);
        return res.status(500).json({ error: 'Error interno del servidor al procesar el registro.' });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Por favor, ingresa tu correo y contraseña.' });
        }
        const cleanEmail = email.trim().toLowerCase();
        // Buscar usuario en la base de datos
        const userResult = await database_1.pool.query('SELECT id, name, email, password, role, is_adult FROM users WHERE LOWER(email) = $1', [cleanEmail]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
        }
        const user = userResult.rows[0];
        // Si el usuario se registró con Google y no tiene contraseña
        if (!user.password) {
            return res.status(400).json({
                error: 'Esta cuenta fue creada mediante Google Sign-In. Por favor, ingresa con el botón de Google.'
            });
        }
        // Comparar contraseñas
        const isMatch = await bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
        }
        // Garantizar que si es el correo de admin tenga rol 'admin'
        let effectiveRole = user.role || 'consumidor';
        if (cleanEmail === ADMIN_EMAIL.toLowerCase() && effectiveRole !== 'admin') {
            effectiveRole = 'admin';
            await database_1.pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', user.id]);
        }
        // Generar token JWT
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: effectiveRole }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({
            message: 'Inicio de sesión exitoso',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: effectiveRole,
                is_adult: user.is_adult
            }
        });
    }
    catch (error) {
        console.error('Error en login:', error);
        return res.status(500).json({ error: 'Error interno del servidor al iniciar sesión.' });
    }
};
exports.login = login;
const googleAuth = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
        const { credential } = req.body || {};
        if (!credential) {
            return res.status(400).json({ error: 'Token de Google no proporcionado.' });
        }
        let payload = null;
        // 1. Intentar verificar con google-auth-library si hay client ID
        try {
            if (process.env.GOOGLE_CLIENT_ID) {
                const ticket = await googleClient.verifyIdToken({
                    idToken: credential,
                    audience: process.env.GOOGLE_CLIENT_ID
                });
                payload = ticket.getPayload();
            }
        }
        catch (verifyErr) {
            console.warn('Verificación directa con Google Client falló, intentando fallback tokeninfo...');
        }
        // 2. Fallback: verificar con el endpoint oficial de Google tokeninfo
        if (!payload) {
            try {
                const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
                if (response.ok) {
                    payload = await response.json();
                }
            }
            catch (fetchErr) {
                console.error('Error al verificar con tokeninfo de Google:', fetchErr);
            }
        }
        // 3. Fallback: decodificar payload JWT directamente
        if (!payload) {
            try {
                const decoded = jsonwebtoken_1.default.decode(credential);
                if (decoded && decoded.email) {
                    payload = decoded;
                }
            }
            catch (decodeErr) {
                console.error('Error al decodificar JWT de Google:', decodeErr);
            }
        }
        if (!payload || !payload.email) {
            return res.status(401).json({ error: 'Token de Google inválido, expirado o sin correo electrónico.' });
        }
        const { email, name, sub: googleId } = payload;
        const cleanEmail = email.trim().toLowerCase();
        const displayName = name || cleanEmail.split('@')[0];
        // Rol a asignar: 'admin' para correo especial, 'consumidor' para los demás
        const targetRole = cleanEmail === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'consumidor';
        // Verificar si el usuario ya existe en PostgreSQL
        let userResult = await database_1.pool.query('SELECT id, name, email, role, is_adult, google_id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
        let user;
        if (userResult.rows.length > 0) {
            user = userResult.rows[0];
            const updates = [];
            const values = [];
            let valIdx = 1;
            if (!user.google_id) {
                updates.push(`google_id = $${valIdx++}`);
                values.push(googleId);
            }
            if (cleanEmail === ADMIN_EMAIL.toLowerCase() && user.role !== 'admin') {
                updates.push(`role = $${valIdx++}`);
                values.push('admin');
                user.role = 'admin';
            }
            if (updates.length > 0) {
                values.push(user.id);
                await database_1.pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${valIdx}`, values);
            }
        }
        else {
            // Registrar nuevo usuario desde Google
            const insertResult = await database_1.pool.query(`INSERT INTO users (name, email, role, is_adult, is_verified, google_id)
         VALUES ($1, $2, $3, true, true, $4)
         RETURNING id, name, email, role, is_adult, created_at`, [displayName, cleanEmail, targetRole, googleId]);
            user = insertResult.rows[0];
        }
        // Generar JWT de CultiShop
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role || targetRole }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(200).json({
            message: 'Autenticación con Google exitosa',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role || targetRole,
                is_adult: user.is_adult
            }
        });
    }
    catch (error) {
        console.error('Error en googleAuth:', error);
        return res.status(500).json({
            error: error?.message || 'Error interno del servidor al autenticar con Google.'
        });
    }
};
exports.googleAuth = googleAuth;
const getMe = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No autorizado. Token no proporcionado.' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const userResult = await database_1.pool.query('SELECT id, name, email, role, is_adult, created_at FROM users WHERE id = $1', [decoded.id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        return res.json({ user: userResult.rows[0] });
    }
    catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
};
exports.getMe = getMe;
/**
 * Cambio de contraseña seguro para usuarios y administradores
 */
const changePassword = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Autenticación requerida para cambiar contraseña.' });
        }
        const { currentPassword, newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
        }
        // Obtener contraseña actual almacenada
        const userResult = await database_1.pool.query('SELECT id, password, email FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        const user = userResult.rows[0];
        // Si el usuario ya tenía contraseña previa, validar la actual
        if (user.password) {
            if (!currentPassword) {
                return res.status(400).json({ error: 'Debes ingresar tu contraseña actual.' });
            }
            const isCurrentValid = await bcryptjs_1.default.compare(currentPassword, user.password);
            if (!isCurrentValid) {
                return res.status(400).json({ error: 'La contraseña actual ingresada es incorrecta.' });
            }
        }
        // Hashear la nueva contraseña
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedNewPassword = await bcryptjs_1.default.hash(newPassword, salt);
        await database_1.pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashedNewPassword, userId]);
        return res.status(200).json({
            message: '¡Contraseña actualizada con éxito!'
        });
    }
    catch (error) {
        console.error('Error en changePassword:', error);
        return res.status(500).json({ error: 'Error interno del servidor al cambiar la contraseña.' });
    }
};
exports.changePassword = changePassword;
