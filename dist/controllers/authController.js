"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.googleAuth = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const google_auth_library_1 = require("google-auth-library");
const database_1 = require("../config/database");
const JWT_SECRET = process.env.JWT_SECRET || 'cultishop_secret_jwt_token_2026';
const googleClient = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
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
        // Insertar nuevo usuario
        const result = await database_1.pool.query(`INSERT INTO users (name, email, password, role, is_adult, is_verified)
       VALUES ($1, $2, $3, 'customer', true, true)
       RETURNING id, name, email, role, is_adult, created_at`, [name.trim(), cleanEmail, hashedPassword]);
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
        // Generar token JWT
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({
            message: 'Inicio de sesión exitoso',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
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
    try {
        const { credential } = req.body;
        if (!credential) {
            return res.status(400).json({ error: 'Token de Google no proporcionado.' });
        }
        let payload = null;
        // Intentar verificar con google-auth-library
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
            console.warn('Verificación directa de Google falló o no tiene Client ID estricto, intentando fallback tokeninfo...');
        }
        // Fallback: verificar con el endpoint oficial de Google tokeninfo
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
        // Si no se pudo obtener payload válido
        if (!payload || !payload.email) {
            return res.status(401).json({ error: 'Token de Google inválido o expirado.' });
        }
        const { email, name, sub: googleId } = payload;
        const cleanEmail = email.trim().toLowerCase();
        const displayName = name || cleanEmail.split('@')[0];
        // Verificar si el usuario ya existe
        let userResult = await database_1.pool.query('SELECT id, name, email, role, is_adult, google_id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
        let user;
        if (userResult.rows.length > 0) {
            user = userResult.rows[0];
            // Si no tiene google_id guardado, actualizarlo
            if (!user.google_id) {
                await database_1.pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
            }
        }
        else {
            // Registrar nuevo usuario desde Google (mayor de edad por política de cuenta de Google)
            const insertResult = await database_1.pool.query(`INSERT INTO users (name, email, role, is_adult, is_verified, google_id)
         VALUES ($1, $2, 'customer', true, true, $3)
         RETURNING id, name, email, role, is_adult, created_at`, [displayName, cleanEmail, googleId]);
            user = insertResult.rows[0];
        }
        // Generar JWT de CultiShop
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({
            message: 'Autenticación con Google exitosa',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                is_adult: user.is_adult
            }
        });
    }
    catch (error) {
        console.error('Error en googleAuth:', error);
        return res.status(500).json({ error: 'Error al autenticar con Google.' });
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
