"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleAboutSectionActive = exports.deleteAboutSection = exports.updateAboutSection = exports.createAboutSection = exports.getAboutSectionById = exports.getAllAboutSectionsAdmin = exports.getActiveAboutSections = void 0;
const database_1 = require("../config/database");
/**
 * Obtener listado de bloques institucionales activos para la vista pública "Sobre Nosotros"
 * GET /api/about
 */
const getActiveAboutSections = async (req, res) => {
    try {
        const includeAll = req.query.all === 'true' || req.query.admin === 'true';
        const query = includeAll
            ? `
        SELECT 
          id,
          title,
          subtitle,
          content,
          image_url,
          order_index,
          is_active,
          created_at,
          updated_at
        FROM about_sections
        ORDER BY order_index ASC, id ASC
      `
            : `
        SELECT 
          id,
          title,
          subtitle,
          content,
          image_url,
          order_index,
          is_active,
          created_at,
          updated_at
        FROM about_sections
        WHERE is_active = true
        ORDER BY order_index ASC, id ASC
      `;
        const result = await database_1.pool.query(query);
        return res.json({
            sections: result.rows,
            data: result.rows
        });
    }
    catch (error) {
        console.error('Error en getActiveAboutSections:', error);
        return res.status(500).json({ error: 'Error al obtener secciones de Sobre Nosotros.' });
    }
};
exports.getActiveAboutSections = getActiveAboutSections;
/**
 * Obtener todos los bloques (activos e inactivos) para el panel de administración
 * GET /api/about/admin/all
 */
const getAllAboutSectionsAdmin = async (req, res) => {
    try {
        const result = await database_1.pool.query(`
      SELECT 
        id,
        title,
        subtitle,
        content,
        image_url,
        order_index,
        is_active,
        created_at,
        updated_at
      FROM about_sections
      ORDER BY order_index ASC, id ASC
    `);
        return res.json({
            sections: result.rows,
            data: result.rows
        });
    }
    catch (error) {
        console.error('Error en getAllAboutSectionsAdmin:', error);
        return res.status(500).json({ error: 'Error al obtener secciones de administración.' });
    }
};
exports.getAllAboutSectionsAdmin = getAllAboutSectionsAdmin;
/**
 * Obtener una sección por ID
 * GET /api/about/:id
 */
const getAboutSectionById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await database_1.pool.query('SELECT * FROM about_sections WHERE id = $1', [parseInt(id, 10)]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Bloque institucional no encontrado.' });
        }
        return res.json({
            section: result.rows[0],
            data: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error en getAboutSectionById:', error);
        return res.status(500).json({ error: 'Error al obtener el bloque institucional.' });
    }
};
exports.getAboutSectionById = getAboutSectionById;
/**
 * Crear un nuevo bloque institucional (Solo Admin)
 * POST /api/about
 */
const createAboutSection = async (req, res) => {
    try {
        const { title, subtitle, content, image_url, order_index, is_active } = req.body;
        if (!title || !String(title).trim()) {
            return res.status(400).json({ error: 'El título del bloque es obligatorio.' });
        }
        if (!content || !String(content).trim()) {
            return res.status(400).json({ error: 'El contenido del bloque es obligatorio.' });
        }
        let parsedOrder = 0;
        if (order_index !== undefined && order_index !== null && order_index !== '') {
            parsedOrder = parseInt(String(order_index), 10) || 0;
        }
        else {
            const maxOrderRes = await database_1.pool.query('SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM about_sections');
            parsedOrder = maxOrderRes.rows[0]?.next_order || 1;
        }
        const finalIsActive = is_active !== undefined ? Boolean(is_active) : true;
        const finalImage = image_url && String(image_url).trim() ? String(image_url).trim() : null;
        const finalSubtitle = subtitle && String(subtitle).trim() ? String(subtitle).trim() : null;
        const result = await database_1.pool.query(`
      INSERT INTO about_sections (
        title,
        subtitle,
        content,
        image_url,
        order_index,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `, [
            String(title).trim(),
            finalSubtitle,
            String(content).trim(),
            finalImage,
            parsedOrder,
            finalIsActive
        ]);
        return res.status(201).json({
            message: 'Bloque institucional creado exitosamente.',
            section: result.rows[0],
            data: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error en createAboutSection:', error);
        return res.status(500).json({ error: 'Error al crear el bloque institucional.' });
    }
};
exports.createAboutSection = createAboutSection;
/**
 * Modificar bloque institucional existente (Solo Admin)
 * PUT /api/about/:id
 */
const updateAboutSection = async (req, res) => {
    try {
        const { id } = req.params;
        const sectionId = parseInt(id, 10);
        const existing = await database_1.pool.query('SELECT * FROM about_sections WHERE id = $1', [sectionId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Bloque institucional no encontrado.' });
        }
        const current = existing.rows[0];
        const { title, subtitle, content, image_url, order_index, is_active } = req.body;
        const finalTitle = title !== undefined ? String(title).trim() : current.title;
        const finalSubtitle = subtitle !== undefined
            ? (String(subtitle).trim() || null)
            : current.subtitle;
        const finalContent = content !== undefined ? String(content).trim() : current.content;
        const finalImage = image_url !== undefined
            ? (String(image_url).trim() || null)
            : current.image_url;
        const finalOrder = order_index !== undefined ? (parseInt(String(order_index), 10) || 0) : current.order_index;
        const finalIsActive = is_active !== undefined ? Boolean(is_active) : current.is_active;
        if (!finalTitle) {
            return res.status(400).json({ error: 'El título no puede estar vacío.' });
        }
        if (!finalContent) {
            return res.status(400).json({ error: 'El contenido no puede estar vacío.' });
        }
        const result = await database_1.pool.query(`
      UPDATE about_sections
      SET 
        title = $1,
        subtitle = $2,
        content = $3,
        image_url = $4,
        order_index = $5,
        is_active = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
      `, [
            finalTitle,
            finalSubtitle,
            finalContent,
            finalImage,
            finalOrder,
            finalIsActive,
            sectionId
        ]);
        return res.json({
            message: 'Bloque institucional actualizado exitosamente.',
            section: result.rows[0],
            data: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error en updateAboutSection:', error);
        return res.status(500).json({ error: 'Error al actualizar el bloque institucional.' });
    }
};
exports.updateAboutSection = updateAboutSection;
/**
 * Eliminar bloque institucional (Solo Admin)
 * DELETE /api/about/:id
 */
const deleteAboutSection = async (req, res) => {
    try {
        const { id } = req.params;
        const sectionId = parseInt(id, 10);
        const result = await database_1.pool.query('DELETE FROM about_sections WHERE id = $1 RETURNING id, title', [sectionId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Bloque institucional no encontrado para eliminar.' });
        }
        return res.json({
            message: `Bloque "${result.rows[0].title}" eliminado correctamente.`,
            id: result.rows[0].id
        });
    }
    catch (error) {
        console.error('Error en deleteAboutSection:', error);
        return res.status(500).json({ error: 'Error al eliminar el bloque institucional.' });
    }
};
exports.deleteAboutSection = deleteAboutSection;
/**
 * Alternar visibilidad de un bloque institucional (Solo Admin)
 * PATCH /api/about/:id/toggle
 */
const toggleAboutSectionActive = async (req, res) => {
    try {
        const { id } = req.params;
        const sectionId = parseInt(id, 10);
        const result = await database_1.pool.query(`
      UPDATE about_sections
      SET is_active = NOT is_active,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, title, is_active
      `, [sectionId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Bloque institucional no encontrado.' });
        }
        const stateText = result.rows[0].is_active ? 'publicado' : 'oculto';
        return res.json({
            message: `Bloque "${result.rows[0].title}" ahora está ${stateText}.`,
            section: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error en toggleAboutSectionActive:', error);
        return res.status(500).json({ error: 'Error al alternar estado del bloque institucional.' });
    }
};
exports.toggleAboutSectionActive = toggleAboutSectionActive;
