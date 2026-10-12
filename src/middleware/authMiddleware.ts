import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET || 'cultishop_secret_jwt_token_2026';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    name: string;
    email: string;
    role: string;
    is_adult?: boolean;
  };
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado. Se requiere token de sesión.' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación no válido.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    // Buscar datos actualizados del usuario en la base de datos
    const userResult = await pool.query(
      'SELECT id, name, email, role, is_adult FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'El usuario asociado a este token no existe.' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error: any) {
    console.error('Error en requireAuth:', error.message);
    return res.status(401).json({ error: 'Sesión expirada o token inválido.' });
  }
};

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
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
