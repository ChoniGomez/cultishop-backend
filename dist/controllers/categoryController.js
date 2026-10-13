"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCategories = void 0;
const database_1 = require("../config/database");
/**
 * Obtener listado de categorías y sus subcategorías asociadas
 */
const getCategories = async (req, res) => {
    try {
        const result = await database_1.pool.query(`
      SELECT 
        id, 
        parent_id, 
        name, 
        slug, 
        description, 
        display_order, 
        is_visible
      FROM categories
      WHERE is_visible = true OR is_visible IS NULL
      ORDER BY display_order ASC, name ASC
    `);
        const allCategories = result.rows;
        // Separar principales de subcategorías
        const mainCategories = allCategories.filter(cat => cat.parent_id === null || cat.parent_id === undefined);
        // Armar estructura jerárquica
        const structured = mainCategories.map(main => {
            const subcategories = allCategories.filter(cat => cat.parent_id === main.id);
            return {
                ...main,
                subcategories: subcategories.map(sub => ({
                    id: sub.id,
                    parent_id: sub.parent_id,
                    name: sub.name,
                    slug: sub.slug,
                    description: sub.description
                }))
            };
        });
        return res.json({
            categories: structured,
            all_categories: allCategories
        });
    }
    catch (error) {
        console.error('Error en getCategories:', error);
        return res.status(500).json({ error: 'Error al obtener categorías de la base de datos.' });
    }
};
exports.getCategories = getCategories;
