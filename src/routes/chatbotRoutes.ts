import { Router } from 'express';
import { getChatbotResponse } from '../services/chatbotService';

const router = Router();

router.post('/web', async (req, res) => {
  const { mensaje } = req.body || {};

  if (typeof mensaje !== 'string' || !mensaje.trim()) {
    return res.status(400).json({ error: 'El campo "mensaje" es obligatorio.' });
  }

  const respuesta = await getChatbotResponse(mensaje.trim());
  return res.json({ respuesta });
});

export default router;
