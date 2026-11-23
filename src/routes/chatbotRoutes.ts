import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getChatbotResponse } from '../services/chatbotService';

const router = Router();

function resolveSessionId(req: { headers?: Record<string, unknown>; body?: Record<string, unknown> }): string {
  const authHeader = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
  if (authHeader.startsWith('Bearer ') && process.env.JWT_SECRET) {
    try {
      const decoded = jwt.verify(authHeader.slice(7).trim(), process.env.JWT_SECRET) as { id?: number | string };
      if (decoded?.id !== undefined && decoded?.id !== null) {
        return `user_${decoded.id}`;
      }
    } catch {
      // Token inválido o expirado: usar sessionId enviado por el cliente
    }
  }

  const rawSessionId = req.body?.sessionId;
  if (typeof rawSessionId === 'string' && rawSessionId.trim()) {
    return rawSessionId.trim().slice(0, 128);
  }

  return 'guest_anon';
}

router.post('/web', async (req, res) => {
  const { mensaje } = req.body || {};

  if (typeof mensaje !== 'string' || !mensaje.trim()) {
    return res.status(400).json({ error: 'El campo "mensaje" es obligatorio.' });
  }

  const sessionId = resolveSessionId(req);
  const respuesta = await getChatbotResponse(mensaje.trim(), sessionId);
  return res.json({ respuesta, sessionId });
});

export default router;
