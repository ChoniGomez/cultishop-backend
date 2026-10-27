import { Request, Response } from 'express';
import { pool } from '../config/database';
import { cache } from '../utils/cache';

/**
 * Publicaciones y videos de Instagram por defecto (respaldo de contingencia)
 */
export const DEFAULT_INSTAGRAM_VIDEOS = [
  {
    id: 1,
    title: 'Guía de Nutrición: Cómo usar Oro Negro y Amazonia de Namasté',
    post_url: 'https://www.instagram.com/culti.shopp/',
    thumbnail_url: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=800',
    order_index: 1,
    is_active: true
  },
  {
    id: 2,
    title: 'Combate definitivo contra trips y arañuela roja con Sanidad Mamboretá',
    post_url: 'https://www.instagram.com/culti.shopp/',
    thumbnail_url: 'https://images.unsplash.com/photo-1536939459926-301728717817?auto=format&fit=crop&q=80&w=800',
    order_index: 2,
    is_active: true
  },
  {
    id: 3,
    title: 'Montaje de Carpas Indoor e Iluminación LED de Alta Eficiencia',
    post_url: 'https://www.instagram.com/culti.shopp/',
    thumbnail_url: 'https://images.unsplash.com/photo-1624990833801-56c1b6a56ba7?auto=format&fit=crop&q=80&w=800',
    order_index: 3,
    is_active: true
  },
  {
    id: 4,
    title: 'Recorrido por nuestro local oficial en Posadas • Av. López y Planes casi Lavalle ("adentro del ACUARIUM")',
    post_url: 'https://www.instagram.com/culti.shopp/',
    thumbnail_url: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=800',
    order_index: 4,
    is_active: true
  }
];

/**
 * Garantiza que la tabla instagram_videos exista en Neon DB
 */
export const ensureInstagramTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS instagram_videos (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255),
      post_url TEXT NOT NULL,
      thumbnail_url TEXT,
      order_index INT DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

/**
 * Siembra los videos iniciales de Instagram si la tabla está vacía
 */
export const seedDefaultInstagramVideos = async () => {
  try {
    await ensureInstagramTable();
    const countRes = await pool.query('SELECT COUNT(*) FROM instagram_videos');
    const count = parseInt(countRes.rows[0]?.count || '0', 10);
    if (count === 0) {
      for (const item of DEFAULT_INSTAGRAM_VIDEOS) {
        await pool.query(
          `INSERT INTO instagram_videos (title, post_url, thumbnail_url, order_index, is_active)
           VALUES ($1, $2, $3, $4, $5)`,
          [item.title, item.post_url, item.thumbnail_url, item.order_index, item.is_active]
        );
      }
    }
  } catch (err: any) {
    console.warn('Aviso en seedDefaultInstagramVideos:', err?.message || err);
  }
};

/**
 * Obtener listado de videos y publicaciones de Instagram activos
 * GET /api/instagram
 */
export const getActiveInstagramVideos = async (req: Request, res: Response) => {
  try {
    const includeAll = req.query.all === 'true' || req.query.admin === 'true';
    const cacheKey = includeAll ? 'instagram:admin:all' : 'instagram:public:active';

    if (!includeAll) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }
    }

    let rows: any[] = [];

    try {
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
            is_active
          FROM instagram_videos
          WHERE is_active = true
          ORDER BY order_index ASC, id ASC
        `;

      const result = await pool.query(query);
      rows = result.rows || [];
    } catch (queryErr: any) {
      console.warn('Tabla instagram_videos no disponible, asegurando esquema:', queryErr?.message);
      await seedDefaultInstagramVideos();
      const retryRes = await pool.query(
        includeAll
          ? `SELECT id, title, post_url, thumbnail_url, order_index, is_active, created_at, updated_at FROM instagram_videos ORDER BY order_index ASC, id ASC`
          : `SELECT id, title, post_url, thumbnail_url, order_index, is_active FROM instagram_videos WHERE is_active = true ORDER BY order_index ASC, id ASC`
      );
      rows = retryRes.rows || [];
    }

    if (rows.length === 0) {
      await seedDefaultInstagramVideos();
      const retryRes = await pool.query(
        includeAll
          ? `SELECT id, title, post_url, thumbnail_url, order_index, is_active, created_at, updated_at FROM instagram_videos ORDER BY order_index ASC, id ASC`
          : `SELECT id, title, post_url, thumbnail_url, order_index, is_active FROM instagram_videos WHERE is_active = true ORDER BY order_index ASC, id ASC`
      );
      rows = retryRes.rows && retryRes.rows.length > 0 ? retryRes.rows : DEFAULT_INSTAGRAM_VIDEOS;
    }

    const responseData = {
      videos: rows,
      data: rows
    };

    if (!includeAll) {
      cache.set(cacheKey, responseData, 300);
    }

    return res.json(responseData);
  } catch (error: any) {
    console.error('Recuperando de error en getActiveInstagramVideos (retornando respaldo):', error?.message || error);
    return res.json({
      videos: DEFAULT_INSTAGRAM_VIDEOS,
      data: DEFAULT_INSTAGRAM_VIDEOS,
      fallback: true
    });
  }
};

/**
 * Obtener todos los videos de Instagram para administración
 * GET /api/instagram/admin/all
 */
export const getAllInstagramVideosAdmin = async (req: Request, res: Response) => {
  try {
    let rows: any[] = [];
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
      rows = result.rows || [];
    } catch (queryErr: any) {
      console.warn('Tabla instagram_videos no disponible en admin, asegurando esquema:', queryErr?.message);
      await seedDefaultInstagramVideos();
      const retryRes = await pool.query(`
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
      rows = retryRes.rows || [];
    }

    if (rows.length === 0) {
      await seedDefaultInstagramVideos();
      const retryRes = await pool.query(`
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
      rows = retryRes.rows && retryRes.rows.length > 0 ? retryRes.rows : DEFAULT_INSTAGRAM_VIDEOS;
    }

    return res.json({
      videos: rows,
      data: rows
    });
  } catch (error: any) {
    console.error('Error en getAllInstagramVideosAdmin (retornando respaldo):', error?.message || error);
    return res.json({
      videos: DEFAULT_INSTAGRAM_VIDEOS,
      data: DEFAULT_INSTAGRAM_VIDEOS,
      fallback: true
    });
  }
};

/**
 * Obtener video individual por ID
 * GET /api/instagram/:id
 */
export const getInstagramVideoById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);

    let result;
    try {
      result = await pool.query(
        'SELECT id, title, post_url, thumbnail_url, order_index, is_active, created_at, updated_at FROM instagram_videos WHERE id = $1',
        [parsedId]
      );
    } catch (err) {
      await ensureInstagramTable();
      result = await pool.query(
        'SELECT id, title, post_url, thumbnail_url, order_index, is_active, created_at, updated_at FROM instagram_videos WHERE id = $1',
        [parsedId]
      );
    }

    if (!result || result.rows.length === 0) {
      const fallbackItem = DEFAULT_INSTAGRAM_VIDEOS.find(v => v.id === parsedId);
      if (fallbackItem) {
        return res.json({
          video: fallbackItem,
          data: fallbackItem
        });
      }
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
    await ensureInstagramTable();

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
      RETURNING id, title, post_url, thumbnail_url, order_index, is_active, created_at, updated_at
      `,
      [
        finalTitle,
        String(post_url).trim(),
        finalThumbnail,
        parsedOrder,
        finalIsActive
      ]
    );

    // Invalidar caché
    cache.invalidate('instagram');
    cache.invalidate('institutional');

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
    await ensureInstagramTable();

    const { id } = req.params;
    const videoId = parseInt(id, 10);

    const existing = await pool.query('SELECT id, title, post_url, thumbnail_url, order_index, is_active FROM instagram_videos WHERE id = $1', [videoId]);
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
      RETURNING id, title, post_url, thumbnail_url, order_index, is_active, created_at, updated_at
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

    // Invalidar caché
    cache.invalidate('instagram');
    cache.invalidate('institutional');

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
    await ensureInstagramTable();

    const { id } = req.params;
    const videoId = parseInt(id, 10);

    const result = await pool.query(
      'DELETE FROM instagram_videos WHERE id = $1 RETURNING id, title',
      [videoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video de Instagram no encontrado para eliminar.' });
    }

    // Invalidar caché
    cache.invalidate('instagram');
    cache.invalidate('institutional');

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
    await ensureInstagramTable();

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

    // Invalidar caché
    cache.invalidate('instagram');
    cache.invalidate('institutional');

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
