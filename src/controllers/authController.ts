import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../config/database';
import { AuthenticatedRequest } from '../middleware/authMiddleware';

const JWT_SECRET = process.env.JWT_SECRET || 'cultishop_secret_jwt_token_2026';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const register = async (req: Request, res: Response) => {
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
    const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe una cuenta registrada con este correo electrónico.' });
    }

    // Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Por defecto rol 'consumidor'. Los permisos de 'admin' se gestionan en base de datos.
    const role = 'consumidor';

    // Insertar nuevo usuario
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, is_adult, is_verified)
       VALUES ($1, $2, $3, $4, true, true)
       RETURNING id, name, email, role, is_adult, created_at`,
      [name.trim(), cleanEmail, hashedPassword, role]
    );

    const user = result.rows[0];

    // Generar token JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user
    });
  } catch (error: any) {
    console.error('Error en register:', error);
    return res.status(500).json({ error: 'Error interno del servidor al procesar el registro.' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Por favor, ingresa tu correo y contraseña.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Buscar usuario en la base de datos
    const userResult = await pool.query(
      'SELECT id, name, email, password, role, is_adult FROM users WHERE LOWER(email) = $1',
      [cleanEmail]
    );

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
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
    }

    // Rol verificado dinámicamente según la base de datos Neon
    const effectiveRole = user.role || 'consumidor';

    // Generar token JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: effectiveRole },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

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
  } catch (error: any) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno del servidor al iniciar sesión.' });
  }
};

export const googleAuth = async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    const { credential } = req.body || {};

    if (!credential) {
      return res.status(400).json({ error: 'Token de Google no proporcionado.' });
    }

    let payload: any = null;

    // 1. Intentar verificar con google-auth-library si hay client ID
    try {
      if (process.env.GOOGLE_CLIENT_ID) {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID
        });
        payload = ticket.getPayload();
      }
    } catch (verifyErr) {
      console.warn('Verificación directa con Google Client falló, intentando fallback tokeninfo...');
    }

    // 2. Fallback: verificar con el endpoint oficial de Google tokeninfo
    if (!payload) {
      try {
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        if (response.ok) {
          payload = await response.json();
        }
      } catch (fetchErr) {
        console.error('Error al verificar con tokeninfo de Google:', fetchErr);
      }
    }

    // 3. Fallback: decodificar payload JWT directamente
    if (!payload) {
      try {
        const decoded = jwt.decode(credential) as any;
        if (decoded && decoded.email) {
          payload = decoded;
        }
      } catch (decodeErr) {
        console.error('Error al decodificar JWT de Google:', decodeErr);
      }
    }

    if (!payload || !payload.email) {
      return res.status(401).json({ error: 'Token de Google inválido, expirado o sin correo electrónico.' });
    }

    const { email, name, sub: googleId } = payload;
    const cleanEmail = email.trim().toLowerCase();
    const displayName = name || cleanEmail.split('@')[0];

    // Verificar si el usuario ya existe en PostgreSQL
    let userResult = await pool.query(
      'SELECT id, name, email, role, is_adult, google_id FROM users WHERE LOWER(email) = $1',
      [cleanEmail]
    );

    let user;

    if (userResult.rows.length > 0) {
      user = userResult.rows[0];
      // Si el usuario existe pero no tenía google_id, vincularlo
      if (!user.google_id) {
        await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
        user.google_id = googleId;
      }
    } else {
      // Registrar nuevo usuario desde Google con rol consumidor por defecto
      const insertResult = await pool.query(
        `INSERT INTO users (name, email, role, is_adult, is_verified, google_id)
         VALUES ($1, $2, 'consumidor', true, true, $3)
         RETURNING id, name, email, role, is_adult, created_at`,
        [displayName, cleanEmail, googleId]
      );
      user = insertResult.rows[0];
    }

    // El rol efectivo proviene siempre dinámicamente de la base de datos Neon
    const effectiveRole = user.role || 'consumidor';

    // Generar JWT de CultiShop
    const token = jwt.sign(
      { id: user.id, email: user.email, role: effectiveRole },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      message: 'Autenticación con Google exitosa',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: effectiveRole,
        is_adult: user.is_adult
      }
    });
  } catch (error: any) {
    console.error('Error en googleAuth:', error);
    return res.status(500).json({ 
      error: error?.message || 'Error interno del servidor al autenticar con Google.' 
    });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado. Token no proporcionado.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded: any = jwt.verify(token, JWT_SECRET);

    const userResult = await pool.query(
      'SELECT id, name, email, role, is_adult, created_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    return res.json({ user: userResult.rows[0] });
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
};

/**
 * Cambio de contraseña seguro para usuarios y administradores
 */
export const changePassword = async (req: AuthenticatedRequest, res: Response) => {
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
    const userResult = await pool.query('SELECT id, password, email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const user = userResult.rows[0];

    // Si el usuario ya tenía contraseña previa, validar la actual
    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Debes ingresar tu contraseña actual.' });
      }

      const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentValid) {
        return res.status(400).json({ error: 'La contraseña actual ingresada es incorrecta.' });
      }
    }

    // Hashear la nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedNewPassword, userId]
    );

    return res.status(200).json({
      message: '¡Contraseña actualizada con éxito!'
    });
  } catch (error: any) {
    console.error('Error en changePassword:', error);
    return res.status(500).json({ error: 'Error interno del servidor al cambiar la contraseña.' });
  }
};
