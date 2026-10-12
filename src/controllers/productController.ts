import { Request, Response } from 'express';
import { pool } from '../config/database';

// Helper para convertir título a slug amigable para URLs
const slugify = (text: string) => {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
};

/**
 * Obtener todos los productos (catálogo completo)
 */
export const getProducts = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.title,
        p.slug,
        p.description,
        p.price,
        p.discount_price,
        p.stock,
        p.image_url,
        p.badge,
        p.badge_type,
        p.options,
        p.is_active,
        p.category_id,
        c.name as category,
        c.slug as category_slug,
        p.created_at,
        p.updated_at
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.id ASC
    `);

    // Mapear para compatibilidad total con el frontend
    const products = result.rows.map(row => ({
      ...row,
      price: typeof row.price === 'number' ? row.price : parseFloat(row.price) || 0,
      image: row.image_url,
      category: row.category || 'Varios',
      options: Array.isArray(row.options) ? row.options : (typeof row.options === 'string' ? JSON.parse(row.options) : ['Estándar'])
    }));

    return res.json({ products });
  } catch (error: any) {
    console.error('Error en getProducts:', error);
    return res.status(500).json({ error: 'Error al obtener productos de la base de datos.' });
  }
};

/**
 * Obtener producto por ID o slug
 */
export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const isNumeric = /^\d+$/.test(id);

    const query = isNumeric
      ? 'SELECT p.*, c.name as category FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = $1'
      : 'SELECT p.*, c.name as category FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = $1';

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const row = result.rows[0];
    return res.json({
      product: {
        ...row,
        price: typeof row.price === 'number' ? row.price : parseFloat(row.price) || 0,
        image: row.image_url,
        category: row.category || 'Varios',
        options: Array.isArray(row.options) ? row.options : (typeof row.options === 'string' ? JSON.parse(row.options) : ['Estándar'])
      }
    });
  } catch (error: any) {
    console.error('Error en getProductById:', error);
    return res.status(500).json({ error: 'Error al consultar producto.' });
  }
};

/**
 * Crear nuevo producto (Solo Admin)
 */
export const createProduct = async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      price,
      stock = 10,
      image_url,
      image,
      category,
      category_id,
      badge = 'STOCK DISPONIBLE',
      badge_type = 'gold',
      options = ['Estándar']
    } = req.body;

    if (!title || price === undefined || price === null) {
      return res.status(400).json({ error: 'Título y precio son obligatorios.' });
    }

    const finalImage = image_url || image || 'https://images.unsplash.com/photo-1603909223429-69bb7101f420?auto=format&fit=crop&q=80&w=600';
    const numPrice = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.-]/g, '')) || 0 : Number(price);
    const numStock = parseInt(stock, 10) || 0;

    // Resolver categoría
    let resolvedCategoryId = category_id || null;
    if (!resolvedCategoryId && category) {
      const catCheck = await pool.query(
        'SELECT id FROM categories WHERE LOWER(name) = $1 OR LOWER(slug) = $1',
        [category.toString().trim().toLowerCase()]
      );
      if (catCheck.rows.length > 0) {
        resolvedCategoryId = catCheck.rows[0].id;
      }
    }

    // Generar slug único
    let baseSlug = slugify(title);
    let finalSlug = baseSlug;
    let counter = 1;
    while (true) {
      const slugCheck = await pool.query('SELECT id FROM products WHERE slug = $1', [finalSlug]);
      if (slugCheck.rows.length === 0) break;
      finalSlug = `${baseSlug}-${counter++}`;
    }

    const optionsJson = JSON.stringify(Array.isArray(options) ? options : [options]);

    const insertResult = await pool.query(`
      INSERT INTO products (
        title, slug, description, price, stock, image_url, 
        badge, badge_type, options, category_id, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      RETURNING *
    `, [
      title.trim(),
      finalSlug,
      description || '',
      numPrice,
      numStock,
      finalImage,
      badge,
      badge_type,
      optionsJson,
      resolvedCategoryId
    ]);

    const newProd = insertResult.rows[0];

    return res.status(201).json({
      message: 'Producto creado exitosamente.',
      product: {
        ...newProd,
        image: newProd.image_url,
        options: Array.isArray(newProd.options) ? newProd.options : JSON.parse(newProd.options || '[]')
      }
    });
  } catch (error: any) {
    console.error('Error en createProduct:', error);
    return res.status(500).json({ error: error.message || 'Error al crear el producto.' });
  }
};

/**
 * Modificar/Actualizar producto existente (Solo Admin)
 */
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      price,
      stock,
      image_url,
      image,
      category,
      category_id,
      badge,
      badge_type,
      options,
      is_active
    } = req.body;

    const isNumeric = /^\d+$/.test(id);
    const existingCheck = isNumeric
      ? await pool.query('SELECT * FROM products WHERE id = $1', [parseInt(id, 10)])
      : await pool.query('SELECT * FROM products WHERE slug = $1', [id]);

    if (existingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const current = existingCheck.rows[0];
    const targetId = current.id;

    // Resolver categoría si se actualizó
    let resolvedCategoryId = current.category_id;
    if (category_id !== undefined) {
      resolvedCategoryId = category_id;
    } else if (category) {
      const catCheck = await pool.query(
        'SELECT id FROM categories WHERE LOWER(name) = $1 OR LOWER(slug) = $1',
        [category.toString().trim().toLowerCase()]
      );
      if (catCheck.rows.length > 0) {
        resolvedCategoryId = catCheck.rows[0].id;
      }
    }

    const finalTitle = title !== undefined ? title.trim() : current.title;
    const finalDescription = description !== undefined ? description : current.description;
    const finalPrice = price !== undefined ? (typeof price === 'string' ? parseFloat(price.replace(/[^0-9.-]/g, '')) || 0 : Number(price)) : current.price;
    const finalStock = stock !== undefined ? parseInt(stock, 10) : current.stock;
    const finalImage = (image_url || image) !== undefined ? (image_url || image) : current.image_url;
    const finalBadge = badge !== undefined ? badge : current.badge;
    const finalBadgeType = badge_type !== undefined ? badge_type : current.badge_type;
    const finalIsActive = is_active !== undefined ? is_active : current.is_active;

    let finalOptionsJson = current.options;
    if (options !== undefined) {
      finalOptionsJson = JSON.stringify(Array.isArray(options) ? options : [options]);
    }

    const updateResult = await pool.query(`
      UPDATE products SET
        title = $1,
        description = $2,
        price = $3,
        stock = $4,
        image_url = $5,
        badge = $6,
        badge_type = $7,
        options = $8,
        category_id = $9,
        is_active = $10,
        updated_at = NOW()
      WHERE id = $11
      RETURNING *
    `, [
      finalTitle,
      finalDescription,
      finalPrice,
      finalStock,
      finalImage,
      finalBadge,
      finalBadgeType,
      finalOptionsJson,
      resolvedCategoryId,
      finalIsActive,
      targetId
    ]);

    const updated = updateResult.rows[0];

    return res.json({
      message: 'Producto actualizado con éxito.',
      product: {
        ...updated,
        image: updated.image_url,
        price: typeof updated.price === 'number' ? updated.price : parseFloat(updated.price) || 0,
        options: Array.isArray(updated.options) ? updated.options : (typeof updated.options === 'string' ? JSON.parse(updated.options) : ['Estándar'])
      }
    });
  } catch (error: any) {
    console.error('Error en updateProduct:', error);
    return res.status(500).json({ error: error.message || 'Error al actualizar el producto.' });
  }
};

/**
 * Eliminar producto del catálogo (Solo Admin)
 */
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const isNumeric = /^\d+$/.test(id);
    const check = isNumeric
      ? await pool.query('SELECT id, title FROM products WHERE id = $1', [parseInt(id, 10)])
      : await pool.query('SELECT id, title FROM products WHERE slug = $1', [id]);

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    await pool.query('DELETE FROM products WHERE id = $1', [check.rows[0].id]);

    return res.json({
      message: `Producto "${check.rows[0].title}" eliminado correctamente del catálogo.`
    });
  } catch (error: any) {
    console.error('Error en deleteProduct:', error);
    return res.status(500).json({ error: 'Error al eliminar el producto de la base de datos.' });
  }
};
