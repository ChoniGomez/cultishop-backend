import { Request, Response } from 'express';
import { pool } from '../config/database';

/**
 * Obtener listado de videos y publicaciones de Instagram activos
 * GET /api/instagram
 */
export const getActiveInstagramVideos = async (req: Request, res: Response) => {
  try {
    const includeAll = req.query.all === 'true' || req.query.admin === 'true';
    const query = includeAll
      ? `
        SELECT 
          id,
          title,
          post_url,
          thumbnail_url,
          order_index,
          is_active,
          created_at,
          updated_at
        FROM instagram_videos
        ORDER BY order_index ASC, id ASC
      `
      : `
        SELECT 
          id,
          title,
          post_url,
          thumbnail_url,
          order_index,
          is_active,
          created_at,
          updated_at
        FROM instagram_videos
        WHERE is_active = true
        ORDER BY order_index ASC, id ASC
      `;

    const result = await pool.query(query);

    return res.json({
      videos: result.rows,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error en getActiveInstagramVideos:', error);
    return res.status(500).json({ error: 'Error al obtener videos de Instagram.' });
  }
};

/**
 * Obtener todos los videos de Instagram para administración
 * GET /api/instagram/admin/all
 */
export const getAllInstagramVideosAdmin = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        title,
        post_url,
        thumbnail_url,
        order_index,
        is_active,
        created_at,
        updated_at
      FROM instagram_videos
      ORDER BY order_index ASC, id ASC
    `);

    return res.json({
      videos: result.rows,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error en getAllInstagramVideosAdmin:', error);
    return res.status(500).json({ error: 'Error al obtener videos de Instagram.' });
  }
};

/**
 * Obtener video individual por ID
 * GET /api/instagram/:id
 */
export const getInstagramVideoById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM instagram_videos WHERE id = $1',
      [parseInt(id, 10)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video de Instagram no encontrado.' });
    }

    return res.json({
      video: result.rows[0],
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en getInstagramVideoById:', error);
    return res.status(500).json({ error: 'Error al obtener el video de Instagram.' });
  }
};

/**
 * Crear nueva publicación/video de Instagram (Solo Admin)
 * POST /api/instagram
 */
export const createInstagramVideo = async (req: Request, res: Response) => {
  try {
    const {
      title,
      post_url,
      thumbnail_url,
      order_index,
      is_active
    } = req.body;

    if (!post_url || !String(post_url).trim()) {
      return res.status(400).json({ error: 'El enlace (URL) de Instagram es obligatorio.' });
    }

    let parsedOrder = 0;
    if (order_index !== undefined && order_index !== null && order_index !== '') {
      parsedOrder = parseInt(String(order_index), 10) || 0;
    } else {
      const maxOrderRes = await pool.query('SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM instagram_videos');
      parsedOrder = maxOrderRes.rows[0]?.next_order || 1;
    }

    const finalIsActive = is_active !== undefined ? Boolean(is_active) : true;
    const finalThumbnail = thumbnail_url && String(thumbnail_url).trim() ? String(thumbnail_url).trim() : null;
    const finalTitle = title && String(title).trim() ? String(title).trim() : 'Video CultiShop @culti.shopp';

    const result = await pool.query(
      `
      INSERT INTO instagram_videos (
        title,
        post_url,
        thumbnail_url,
        order_index,
        is_active
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        finalTitle,
        String(post_url).trim(),
        finalThumbnail,
        parsedOrder,
        finalIsActive
      ]
    );

    return res.status(201).json({
      message: 'Video de Instagram registrado exitosamente.',
      video: result.rows[0],
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en createInstagramVideo:', error);
    return res.status(500).json({ error: 'Error al registrar video de Instagram.' });
  }
};

/**
 * Modificar publicación/video de Instagram existente (Solo Admin)
 * PUT /api/instagram/:id
 */
export const updateInstagramVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const videoId = parseInt(id, 10);

    const existing = await pool.query('SELECT * FROM instagram_videos WHERE id = $1', [videoId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Video de Instagram no encontrado.' });
    }

    const current = existing.rows[0];
    const {
      title,
      post_url,
      thumbnail_url,
      order_index,
      is_active
    } = req.body;

    const finalTitle = title !== undefined ? String(title).trim() : current.title;
    const finalPostUrl = post_url !== undefined ? String(post_url).trim() : current.post_url;
    const finalThumbnail = thumbnail_url !== undefined 
      ? (String(thumbnail_url).trim() || null) 
      : current.thumbnail_url;
    const finalOrder = order_index !== undefined ? (parseInt(String(order_index), 10) || 0) : current.order_index;
    const finalIsActive = is_active !== undefined ? Boolean(is_active) : current.is_active;

    if (!finalPostUrl) {
      return res.status(400).json({ error: 'El enlace de la publicación no puede estar vacío.' });
    }

    const result = await pool.query(
      `
      UPDATE instagram_videos
      SET 
        title = $1,
        post_url = $2,
        thumbnail_url = $3,
        order_index = $4,
        is_active = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
      `,
      [
        finalTitle || 'Video CultiShop @culti.shopp',
        finalPostUrl,
        finalThumbnail,
        finalOrder,
        finalIsActive,
        videoId
      ]
    );

    return res.json({
      message: 'Video de Instagram actualizado exitosamente.',
      video: result.rows[0],
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en updateInstagramVideo:', error);
    return res.status(500).json({ error: 'Error al actualizar video de Instagram.' });
  }
};

/**
 * Eliminar video de Instagram (Solo Admin)
 * DELETE /api/instagram/:id
 */
export const deleteInstagramVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const videoId = parseInt(id, 10);

    const result = await pool.query(
      'DELETE FROM instagram_videos WHERE id = $1 RETURNING id, title',
      [videoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video de Instagram no encontrado para eliminar.' });
    }

    return res.json({
      message: `Publicación "${result.rows[0].title}" eliminada correctamente.`,
      id: result.rows[0].id
    });
  } catch (error: any) {
    console.error('Error en deleteInstagramVideo:', error);
    return res.status(500).json({ error: 'Error al eliminar el video de Instagram.' });
  }
};

/**
 * Alternar visibilidad de un video de Instagram (Solo Admin)
 * PATCH /api/instagram/:id/toggle
 */
export const toggleInstagramVideoActive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const videoId = parseInt(id, 10);

    const result = await pool.query(
      `
      UPDATE instagram_videos
      SET is_active = NOT is_active,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, title, is_active
      `,
      [videoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video de Instagram no encontrado.' });
    }

    const stateText = result.rows[0].is_active ? 'visible en galería' : 'oculto';
    return res.json({
      message: `Video "${result.rows[0].title}" ahora está ${stateText}.`,
      video: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en toggleInstagramVideoActive:', error);
    return res.status(500).json({ error: 'Error al alternar estado del video de Instagram.' });
  }
};
