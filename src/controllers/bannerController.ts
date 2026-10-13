import { Request, Response } from 'express';
import { pool } from '../config/database';

/**
 * Obtener listado de banners activos para el slider público
 * GET /api/banners
 */
export const getActiveBanners = async (req: Request, res: Response) => {
  try {
    const includeAll = req.query.all === 'true' || req.query.admin === 'true';
    const query = includeAll
      ? `
        SELECT 
          id,
          title,
          subtitle,
          image_url,
          link_url,
          button_text,
          display_order,
          is_active,
          created_at,
          updated_at
        FROM banners
        ORDER BY display_order ASC, id ASC
      `
      : `
        SELECT 
          id,
          title,
          subtitle,
          image_url,
          link_url,
          button_text,
          display_order,
          is_active,
          created_at,
          updated_at
        FROM banners
        WHERE is_active = true
        ORDER BY display_order ASC, id ASC
      `;

    const result = await pool.query(query);

    const formattedRows = result.rows.map((row) => ({
      ...row,
      image: row.image_url,
      cta_text: row.button_text,
      cta_link: row.link_url
    }));

    return res.json({
      banners: formattedRows,
      data: formattedRows
    });
  } catch (error: any) {
    console.error('Error en getActiveBanners:', error);
    return res.status(500).json({ error: 'Error al obtener banners activos.' });
  }
};

/**
 * Obtener todos los banners (activos e inactivos) para el panel de administración
 * GET /api/banners/admin/all
 */
export const getAllBannersAdmin = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        title,
        subtitle,
        image_url,
        link_url,
        button_text,
        display_order,
        is_active,
        created_at,
        updated_at
      FROM banners
      ORDER BY display_order ASC, id ASC
    `);

    const formattedRows = result.rows.map((row) => ({
      ...row,
      image: row.image_url,
      cta_text: row.button_text,
      cta_link: row.link_url
    }));

    return res.json({
      banners: formattedRows,
      data: formattedRows
    });
  } catch (error: any) {
    console.error('Error en getAllBannersAdmin:', error);
    return res.status(500).json({ error: 'Error al obtener listado de banners para administración.' });
  }
};

/**
 * Obtener un banner por ID
 * GET /api/banners/:id
 */
export const getBannerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bannerId = parseInt(id, 10);
    if (isNaN(bannerId)) {
      return res.status(400).json({ error: 'ID de banner no válido.' });
    }

    const result = await pool.query('SELECT * FROM banners WHERE id = $1', [bannerId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Banner no encontrado.' });
    }

    return res.json({ banner: result.rows[0] });
  } catch (error: any) {
    console.error('Error en getBannerById:', error);
    return res.status(500).json({ error: 'Error al buscar banner.' });
  }
};

/**
 * Crear nuevo banner (Solo Admin)
 * POST /api/banners
 */
export const createBanner = async (req: Request, res: Response) => {
  try {
    const {
      title,
      subtitle,
      image_url,
      link_url,
      button_text = 'Ver Más',
      display_order = 0,
      is_active = true
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'El título del banner es obligatorio.' });
    }

    if (!image_url || !image_url.trim()) {
      return res.status(400).json({ error: 'La URL de la imagen horizontal del banner es obligatoria.' });
    }

    const numOrder = parseInt(display_order, 10) || 0;
    const activeBool = is_active !== false && is_active !== 'false';

    const insertResult = await pool.query(`
      INSERT INTO banners (
        title,
        subtitle,
        image_url,
        link_url,
        button_text,
        display_order,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `, [
      title.trim(),
      subtitle ? subtitle.trim() : null,
      image_url.trim(),
      link_url ? link_url.trim() : null,
      button_text ? button_text.trim() : 'Ver Más',
      numOrder,
      activeBool
    ]);

    const newBanner = insertResult.rows[0];

    return res.status(201).json({
      message: 'Banner publicitario creado con éxito.',
      banner: newBanner
    });
  } catch (error: any) {
    console.error('Error en createBanner:', error);
    return res.status(500).json({ error: error.message || 'Error al crear el banner.' });
  }
};

/**
 * Actualizar banner existente (Solo Admin)
 * PUT /api/banners/:id o PATCH /api/banners/:id
 */
export const updateBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bannerId = parseInt(id, 10);
    if (isNaN(bannerId)) {
      return res.status(400).json({ error: 'ID de banner no válido.' });
    }

    const existingCheck = await pool.query('SELECT * FROM banners WHERE id = $1', [bannerId]);
    if (existingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'El banner no existe.' });
    }

    const current = existingCheck.rows[0];
    const {
      title,
      subtitle,
      image_url,
      link_url,
      button_text,
      display_order,
      is_active
    } = req.body;

    const finalTitle = title !== undefined ? title.trim() : current.title;
    if (!finalTitle) {
      return res.status(400).json({ error: 'El título no puede estar vacío.' });
    }

    const finalImage = image_url !== undefined ? image_url.trim() : current.image_url;
    if (!finalImage) {
      return res.status(400).json({ error: 'La URL de la imagen no puede estar vacía.' });
    }

    const finalSubtitle = subtitle !== undefined ? (subtitle ? subtitle.trim() : null) : current.subtitle;
    const finalLink = link_url !== undefined ? (link_url ? link_url.trim() : null) : current.link_url;
    const finalButtonText = button_text !== undefined ? (button_text ? button_text.trim() : 'Ver Más') : current.button_text;
    const finalOrder = display_order !== undefined ? (parseInt(display_order, 10) || 0) : current.display_order;
    const finalIsActive = is_active !== undefined ? (is_active !== false && is_active !== 'false') : current.is_active;

    const updateResult = await pool.query(`
      UPDATE banners
      SET 
        title = $1,
        subtitle = $2,
        image_url = $3,
        link_url = $4,
        button_text = $5,
        display_order = $6,
        is_active = $7,
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [
      finalTitle,
      finalSubtitle,
      finalImage,
      finalLink,
      finalButtonText,
      finalOrder,
      finalIsActive,
      bannerId
    ]);

    return res.json({
      message: 'Banner actualizado exitosamente.',
      banner: updateResult.rows[0]
    });
  } catch (error: any) {
    console.error('Error en updateBanner:', error);
    return res.status(500).json({ error: error.message || 'Error al actualizar el banner.' });
  }
};

/**
 * Alternar visibilidad de banner (Solo Admin)
 * PATCH /api/banners/:id/toggle
 */
export const toggleBannerActive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bannerId = parseInt(id, 10);
    if (isNaN(bannerId)) {
      return res.status(400).json({ error: 'ID de banner no válido.' });
    }

    const updateResult = await pool.query(`
      UPDATE banners
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [bannerId]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Banner no encontrado.' });
    }

    return res.json({
      message: `Banner ${updateResult.rows[0].is_active ? 'activado' : 'desactivado'} con éxito.`,
      banner: updateResult.rows[0]
    });
  } catch (error: any) {
    console.error('Error en toggleBannerActive:', error);
    return res.status(500).json({ error: 'Error al cambiar estado del banner.' });
  }
};

/**
 * Eliminar banner (Solo Admin)
 * DELETE /api/banners/:id
 */
export const deleteBanner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bannerId = parseInt(id, 10);
    if (isNaN(bannerId)) {
      return res.status(400).json({ error: 'ID de banner no válido.' });
    }

    const deleteResult = await pool.query('DELETE FROM banners WHERE id = $1 RETURNING id, title', [bannerId]);
    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Banner no encontrado.' });
    }

    return res.json({
      message: `Banner "${deleteResult.rows[0].title}" eliminado con éxito.`,
      id: bannerId
    });
  } catch (error: any) {
    console.error('Error en deleteBanner:', error);
    return res.status(500).json({ error: 'Error al eliminar el banner.' });
  }
};

