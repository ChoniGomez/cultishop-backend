import { Request, Response } from 'express';
import { pool } from '../config/database';

/**
 * Obtener listado de preguntas frecuentes activas para la vista pública (/faq)
 * GET /api/faqs
 */
export const getActiveFaqs = async (req: Request, res: Response) => {
  try {
    const includeAll = req.query.all === 'true' || req.query.admin === 'true';
    const query = includeAll
      ? `
        SELECT 
          id,
          question,
          answer,
          category,
          order_index,
          is_active,
          created_at,
          updated_at
        FROM faqs
        ORDER BY order_index ASC, id ASC
      `
      : `
        SELECT 
          id,
          question,
          answer,
          category,
          order_index,
          is_active,
          created_at,
          updated_at
        FROM faqs
        WHERE is_active = true
        ORDER BY order_index ASC, id ASC
      `;

    const result = await pool.query(query);

    return res.json({
      faqs: result.rows,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error en getActiveFaqs:', error);
    return res.status(500).json({ error: 'Error al obtener preguntas frecuentes.' });
  }
};

/**
 * Obtener todas las preguntas frecuentes (activas e inactivas) para el panel de administración
 * GET /api/faqs/admin/all
 */
export const getAllFaqsAdmin = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        question,
        answer,
        category,
        order_index,
        is_active,
        created_at,
        updated_at
      FROM faqs
      ORDER BY order_index ASC, id ASC
    `);

    return res.json({
      faqs: result.rows,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error en getAllFaqsAdmin:', error);
    return res.status(500).json({ error: 'Error al obtener preguntas frecuentes para administración.' });
  }
};

/**
 * Obtener una pregunta frecuente por ID
 * GET /api/faqs/:id
 */
export const getFaqById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM faqs WHERE id = $1',
      [parseInt(id, 10)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pregunta frecuente no encontrada.' });
    }

    return res.json({
      faq: result.rows[0],
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en getFaqById:', error);
    return res.status(500).json({ error: 'Error al obtener la pregunta frecuente.' });
  }
};

/**
 * Crear una nueva pregunta frecuente (Solo Admin)
 * POST /api/faqs
 */
export const createFaq = async (req: Request, res: Response) => {
  try {
    const {
      question,
      answer,
      category,
      order_index,
      is_active
    } = req.body;

    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'La pregunta es obligatoria.' });
    }

    if (!answer || !String(answer).trim()) {
      return res.status(400).json({ error: 'La respuesta es obligatoria.' });
    }

    let parsedOrder = 0;
    if (order_index !== undefined && order_index !== null && order_index !== '') {
      parsedOrder = parseInt(String(order_index), 10) || 0;
    } else {
      const maxOrderRes = await pool.query('SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM faqs');
      parsedOrder = maxOrderRes.rows[0]?.next_order || 1;
    }

    const finalIsActive = is_active !== undefined ? Boolean(is_active) : true;
    const finalCategory = category && String(category).trim() ? String(category).trim() : 'General';

    const result = await pool.query(
      `
      INSERT INTO faqs (
        question,
        answer,
        category,
        order_index,
        is_active
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        String(question).trim(),
        String(answer).trim(),
        finalCategory,
        parsedOrder,
        finalIsActive
      ]
    );

    return res.status(201).json({
      message: 'Pregunta frecuente creada exitosamente.',
      faq: result.rows[0],
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en createFaq:', error);
    return res.status(500).json({ error: 'Error al crear la pregunta frecuente.' });
  }
};

/**
 * Modificar pregunta frecuente existente (Solo Admin)
 * PUT /api/faqs/:id
 */
export const updateFaq = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const faqId = parseInt(id, 10);

    const existing = await pool.query('SELECT * FROM faqs WHERE id = $1', [faqId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Pregunta frecuente no encontrada.' });
    }

    const current = existing.rows[0];
    const {
      question,
      answer,
      category,
      order_index,
      is_active
    } = req.body;

    const newQuestion = question !== undefined ? String(question).trim() : current.question;
    const newAnswer = answer !== undefined ? String(answer).trim() : current.answer;
    const newCategory = category !== undefined ? (String(category).trim() || 'General') : current.category;

    if (!newQuestion) {
      return res.status(400).json({ error: 'La pregunta no puede quedar vacía.' });
    }
    if (!newAnswer) {
      return res.status(400).json({ error: 'La respuesta no puede quedar vacía.' });
    }

    let newOrder = current.order_index;
    if (order_index !== undefined && order_index !== null && order_index !== '') {
      newOrder = parseInt(String(order_index), 10) || 0;
    }

    const newIsActive = is_active !== undefined ? Boolean(is_active) : current.is_active;

    const result = await pool.query(
      `
      UPDATE faqs
      SET question = $1,
          answer = $2,
          category = $3,
          order_index = $4,
          is_active = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
      `,
      [newQuestion, newAnswer, newCategory, newOrder, newIsActive, faqId]
    );

    return res.json({
      message: 'Pregunta frecuente actualizada exitosamente.',
      faq: result.rows[0],
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en updateFaq:', error);
    return res.status(500).json({ error: 'Error al actualizar la pregunta frecuente.' });
  }
};

/**
 * Eliminar pregunta frecuente (Solo Admin)
 * DELETE /api/faqs/:id
 */
export const deleteFaq = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const faqId = parseInt(id, 10);

    const result = await pool.query(
      'DELETE FROM faqs WHERE id = $1 RETURNING id, question',
      [faqId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pregunta frecuente no encontrada para eliminar.' });
    }

    return res.json({
      message: `Pregunta frecuente eliminada correctamente.`,
      id: result.rows[0].id
    });
  } catch (error: any) {
    console.error('Error en deleteFaq:', error);
    return res.status(500).json({ error: 'Error al eliminar la pregunta frecuente.' });
  }
};

/**
 * Alternar visibilidad activa de una pregunta frecuente (Solo Admin)
 * PATCH /api/faqs/:id/toggle
 */
export const toggleFaqActive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const faqId = parseInt(id, 10);

    const result = await pool.query(
      `
      UPDATE faqs
      SET is_active = NOT is_active,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, question, is_active
      `,
      [faqId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pregunta frecuente no encontrada.' });
    }

    const stateText = result.rows[0].is_active ? 'publicada' : 'oculta';
    return res.json({
      message: `Pregunta ahora está ${stateText}.`,
      faq: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en toggleFaqActive:', error);
    return res.status(500).json({ error: 'Error al alternar estado de la pregunta frecuente.' });
  }
};

