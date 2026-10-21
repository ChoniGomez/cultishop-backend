import { Request, Response } from 'express';
import { pool } from '../config/database';

/**
 * Función auxiliar para normalizar texto a slug URL amigable
 */
export function slugify(text: string): string {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar tildes
    .replace(/[^a-z0-9\s-]/g, '') // Eliminar caracteres no alfanuméricos
    .trim()
    .replace(/\s+/g, '-') // Espacios a guiones
    .replace(/-+/g, '-'); // Guiones duplicados
}

/**
 * Generar un slug único en la tabla categories
 */
async function generateUniqueSlug(baseSlug: string, excludeId?: number): Promise<string> {
  let slug = baseSlug || 'categoria';
  let counter = 1;
  while (true) {
    const testSlug = counter === 1 ? slug : `${slug}-${counter}`;
    const query = excludeId 
      ? 'SELECT id FROM categories WHERE slug = $1 AND id != $2'
      : 'SELECT id FROM categories WHERE slug = $1';
    const params = excludeId ? [testSlug, excludeId] : [testSlug];
    const res = await pool.query(query, params);
    if (res.rows.length === 0) {
      return testSlug;
    }
    counter++;
  }
}

/**
 * Obtener listado de categorías y sus subcategorías asociadas
 * Soporta query param ?all=true para incluir ocultas (panel admin)
 */
export const getCategories = async (req: Request, res: Response) => {
  try {
    const includeHidden = req.query.all === 'true' || req.query.include_hidden === 'true';

    const query = `
      SELECT 
        c.id, 
        c.parent_id, 
        c.name, 
        c.slug, 
        c.description, 
        c.display_order, 
        COALESCE(c.is_visible, true) AS is_visible,
        c.created_at,
        (
          SELECT COUNT(*)::int 
          FROM products p 
          WHERE p.category_id = c.id OR p.subcategory_id = c.id
        ) AS products_count
      FROM categories c
      ${includeHidden ? '' : 'WHERE c.is_visible = true OR c.is_visible IS NULL'}
      ORDER BY c.display_order ASC, c.name ASC
    `;

    const result = await pool.query(query);
    const allCategories = result.rows;

    // Separar categorías principales (parent_id IS NULL)
    const mainCategories = allCategories.filter(cat => cat.parent_id === null || cat.parent_id === undefined);

    // Armar estructura jerárquica con conteo acumulado de productos
    const structured = mainCategories.map(main => {
      const subcategories = allCategories.filter(cat => cat.parent_id === main.id);
      const subsTotalProducts = subcategories.reduce((acc, sub) => acc + (Number(sub.products_count) || 0), 0);
      const totalProductsCount = (Number(main.products_count) || 0) + subsTotalProducts;

      return {
        ...main,
        total_products_count: totalProductsCount,
        subcategories: subcategories.map(sub => ({
          id: sub.id,
          parent_id: sub.parent_id,
          name: sub.name,
          slug: sub.slug,
          description: sub.description,
          display_order: sub.display_order,
          is_visible: sub.is_visible,
          created_at: sub.created_at,
          products_count: Number(sub.products_count) || 0
        }))
      };
    });

    return res.json({
      categories: structured,
      all_categories: allCategories
    });
  } catch (error: any) {
    console.error('Error en getCategories:', error);
    return res.status(500).json({ error: 'Error al obtener categorías de la base de datos.' });
  }
};

/**
 * Crear nueva categoría o subcategoría
 */
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, slug, parent_id, description, display_order, is_visible } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la categoría o subcategoría es obligatorio.' });
    }

    const trimmedName = name.trim();
    let parentIdNum: number | null = null;

    if (parent_id !== undefined && parent_id !== null && parent_id !== '' && parent_id !== 'null') {
      const parsed = parseInt(parent_id, 10);
      if (isNaN(parsed)) {
        return res.status(400).json({ error: 'El identificador de categoría padre no es válido.' });
      }

      // Validar existencia de la categoría padre
      const parentCheck = await pool.query('SELECT id, parent_id, name FROM categories WHERE id = $1', [parsed]);
      if (parentCheck.rows.length === 0) {
        return res.status(404).json({ error: 'La categoría padre seleccionada no existe.' });
      }

      // Validar que la categoría padre no sea a su vez una subcategoría (máximo 1 nivel de anidado)
      if (parentCheck.rows[0].parent_id !== null) {
        return res.status(400).json({ 
          error: `No se puede anidar dentro de "${parentCheck.rows[0].name}" porque ya es una subcategoría.` 
        });
      }

      parentIdNum = parsed;
    }

    // Resolver slug único
    const rawSlug = slug && slug.trim() ? slugify(slug) : slugify(trimmedName);
    const finalSlug = await generateUniqueSlug(rawSlug);

    // Calcular orden de visualización si no se especificó
    let finalOrder = 0;
    if (display_order !== undefined && display_order !== null && !isNaN(Number(display_order))) {
      finalOrder = parseInt(display_order, 10);
    } else {
      const orderQuery = parentIdNum === null
        ? 'SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM categories WHERE parent_id IS NULL'
        : 'SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM categories WHERE parent_id = $1';
      const orderParams = parentIdNum === null ? [] : [parentIdNum];
      const orderRes = await pool.query(orderQuery, orderParams);
      finalOrder = orderRes.rows[0]?.next_order || 1;
    }

    const finalVisible = is_visible !== false;
    const finalDescription = description && description.trim() ? description.trim() : null;

    const insertResult = await pool.query(
      `INSERT INTO categories (name, slug, parent_id, description, display_order, is_visible)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [trimmedName, finalSlug, parentIdNum, finalDescription, finalOrder, finalVisible]
    );

    const newCategory = insertResult.rows[0];

    return res.status(201).json({
      message: parentIdNum ? 'Subcategoría creada con éxito.' : 'Categoría creada con éxito.',
      category: {
        ...newCategory,
        products_count: 0,
        subcategories: []
      }
    });
  } catch (error: any) {
    console.error('Error en createCategory:', error);
    return res.status(500).json({ error: error.message || 'Error al crear la categoría en la base de datos.' });
  }
};

/**
 * Modificar categoría o subcategoría existente
 */
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const categoryId = parseInt(id, 10);

    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'ID de categoría no válido.' });
    }

    const currentCheck = await pool.query('SELECT * FROM categories WHERE id = $1', [categoryId]);
    if (currentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'La categoría que intentas modificar no existe.' });
    }

    const current = currentCheck.rows[0];
    const { name, slug, parent_id, description, display_order, is_visible } = req.body;

    const finalName = name !== undefined ? name.trim() : current.name;
    if (!finalName) {
      return res.status(400).json({ error: 'El nombre de la categoría no puede estar vacío.' });
    }

    // Resolver parent_id
    let finalParentId: number | null = current.parent_id;

    if (parent_id !== undefined) {
      if (parent_id === null || parent_id === '' || parent_id === 'null') {
        finalParentId = null;
      } else {
        const parsedParent = parseInt(parent_id, 10);
        if (isNaN(parsedParent)) {
          return res.status(400).json({ error: 'El ID de la categoría padre no es válido.' });
        }

        // Una categoría no puede ser su propio padre
        if (parsedParent === categoryId) {
          return res.status(400).json({ error: 'Una categoría no puede tenerse a sí misma como categoría padre.' });
        }

        // Si esta categoría tiene subcategorías hijas, no puede convertirse en subcategoría
        const childCountRes = await pool.query('SELECT COUNT(*)::int AS count FROM categories WHERE parent_id = $1', [categoryId]);
        if (childCountRes.rows[0].count > 0) {
          return res.status(400).json({ 
            error: 'Esta categoría contiene subcategorías hijas asociadas y no puede ser reasignada como subcategoría de otra.' 
          });
        }

        // Validar categoría padre destino
        const parentTargetCheck = await pool.query('SELECT id, parent_id, name FROM categories WHERE id = $1', [parsedParent]);
        if (parentTargetCheck.rows.length === 0) {
          return res.status(404).json({ error: 'La categoría padre de destino no existe.' });
        }
        if (parentTargetCheck.rows[0].parent_id !== null) {
          return res.status(400).json({ 
            error: `La categoría seleccionada "${parentTargetCheck.rows[0].name}" ya es una subcategoría.` 
          });
        }

        finalParentId = parsedParent;
      }
    }

    // Resolver slug único
    let finalSlug = current.slug;
    if (slug !== undefined && slug.trim() !== '' && slug.trim() !== current.slug) {
      const rawSlug = slugify(slug);
      finalSlug = await generateUniqueSlug(rawSlug, categoryId);
    } else if (name !== undefined && (!current.slug || current.slug === '')) {
      finalSlug = await generateUniqueSlug(slugify(finalName), categoryId);
    }

    // Resolver descripción
    const finalDescription = description !== undefined
      ? (description && description.trim() ? description.trim() : null)
      : current.description;

    // Resolver orden
    const finalOrder = (display_order !== undefined && !isNaN(Number(display_order)))
      ? parseInt(display_order, 10)
      : current.display_order;

    // Resolver visibilidad
    const finalVisible = is_visible !== undefined ? Boolean(is_visible) : current.is_visible;

    const updateRes = await pool.query(
      `UPDATE categories
       SET name = $1,
           slug = $2,
           parent_id = $3,
           description = $4,
           display_order = $5,
           is_visible = $6
       WHERE id = $7
       RETURNING *`,
      [finalName, finalSlug, finalParentId, finalDescription, finalOrder, finalVisible, categoryId]
    );

    return res.json({
      message: 'Categoría actualizada con éxito.',
      category: updateRes.rows[0]
    });
  } catch (error: any) {
    console.error('Error en updateCategory:', error);
    return res.status(500).json({ error: error.message || 'Error al actualizar la categoría.' });
  }
};

/**
 * Alternar visibilidad de categoría (activo / oculto)
 */
export const toggleCategoryVisibility = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const categoryId = parseInt(id, 10);

    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'ID de categoría no válido.' });
    }

    const currentCheck = await pool.query('SELECT id, is_visible FROM categories WHERE id = $1', [categoryId]);
    if (currentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'La categoría no existe.' });
    }

    const currentVisible = currentCheck.rows[0].is_visible !== false;
    const newVisible = !currentVisible;

    const result = await pool.query(
      'UPDATE categories SET is_visible = $1 WHERE id = $2 RETURNING *',
      [newVisible, categoryId]
    );

    return res.json({
      message: newVisible ? 'Categoría visible en la tienda pública.' : 'Categoría ocultada de la tienda pública.',
      category: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en toggleCategoryVisibility:', error);
    return res.status(500).json({ error: 'Error al cambiar visibilidad de la categoría.' });
  }
};

/**
 * Eliminar categoría o subcategoría con validación de impacto en productos
 */
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const categoryId = parseInt(id, 10);

    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'ID de categoría no válido.' });
    }

    const catCheck = await pool.query('SELECT * FROM categories WHERE id = $1', [categoryId]);
    if (catCheck.rows.length === 0) {
      return res.status(404).json({ error: 'La categoría que intentas eliminar no existe.' });
    }

    const categoryToDelete = catCheck.rows[0];

    // Verificar subcategorías hijas si es una categoría principal
    const childrenRes = await pool.query('SELECT id, name FROM categories WHERE parent_id = $1', [categoryId]);
    const childIds = childrenRes.rows.map(r => r.id);

    // Contar productos directamente asociados
    const directProductsRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM products WHERE category_id = $1 OR subcategory_id = $1',
      [categoryId]
    );
    const directProductsCount = directProductsRes.rows[0].count;

    // Contar productos en subcategorías hijas
    let subProductsCount = 0;
    if (childIds.length > 0) {
      const subProductsRes = await pool.query(
        'SELECT COUNT(*)::int AS count FROM products WHERE subcategory_id = ANY($1)',
        [childIds]
      );
      subProductsCount = subProductsRes.rows[0].count;
    }

    const totalAffectedProducts = directProductsCount + subProductsCount;

    // Desasociar productos de forma segura para no romper el catálogo ni órdenes
    await pool.query('UPDATE products SET category_id = NULL WHERE category_id = $1', [categoryId]);
    await pool.query('UPDATE products SET subcategory_id = NULL WHERE subcategory_id = $1', [categoryId]);

    if (childIds.length > 0) {
      await pool.query('UPDATE products SET subcategory_id = NULL WHERE subcategory_id = ANY($1)', [childIds]);
      // Eliminar subcategorías hijas
      await pool.query('DELETE FROM categories WHERE parent_id = $1', [categoryId]);
    }

    // Eliminar la categoría principal o subcategoría
    const deleteRes = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING *', [categoryId]);

    return res.json({
      success: true,
      message: `Categoría "${categoryToDelete.name}" eliminada con éxito.`,
      deleted_category: deleteRes.rows[0],
      deleted_subcategories_count: childIds.length,
      unlinked_products_count: totalAffectedProducts
    });
  } catch (error: any) {
    console.error('Error en deleteCategory:', error);
    return res.status(500).json({ error: error.message || 'Error al eliminar la categoría de la base de datos.' });
  }
};
