import path from 'path';
import fs from 'fs';
import { Request, Response } from 'express';
import { pool } from '../config/database';
import { cache } from '../utils/cache';
import { processAnyImageInput, deleteOldImageFile, UPLOADS_DIR } from '../utils/imageProcessor';

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

// Helper para parsear JSON seguro con fallback
const parseJsonField = (val: any, fallback: any = null) => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

// Helper para normalizar listas de texto (viñetas, pasos, opciones)
const normalizeStringArray = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    // Si viene como JSON stringificado
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed.map(item => String(item).trim()).filter(Boolean);
      }
    } catch {}
    // Si viene como texto separado por saltos de línea
    return val
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  }
  return [];
};

// Sanitizador y migrador en segundo plano de imágenes Base64 hacia archivos WebP deterministas
const sanitizeAndMigrateImage = (imageUrl: string | null | undefined, productId: number): string => {
  if (!imageUrl || typeof imageUrl !== 'string') return '';
  const trimmed = imageUrl.trim();
  if (!trimmed.startsWith('data:image/')) return trimmed;

  const targetFilename = `product-${productId}.webp`;
  const targetWebp = `/uploads/${targetFilename}`;
  const targetFilePath = path.join(UPLOADS_DIR, targetFilename);

  // Si el archivo físico ya existe en el disco, devolver la URL WebP de inmediato
  if (fs.existsSync(targetFilePath)) {
    return targetWebp;
  }

  // Disparar procesamiento asíncrono con Sharp guardando EXACTAMENTE con ese nombre determinista
  processAnyImageInput(trimmed, `product-${productId}`, 85, targetFilename)
    .then((finalUrl) => {
      if (finalUrl && finalUrl !== trimmed) {
        pool.query('UPDATE products SET image_url = $1 WHERE id = $2', [targetWebp, productId]).catch(() => {});
      }
    })
    .catch((err) => {
      console.warn(`[ImageMigration] No se pudo guardar imagen WebP de producto ${productId}:`, err?.message || err);
    });

  // Retornar la cadena Base64 mientras se completa la persistencia para que el cliente no quede en blanco
  return trimmed;
};

// Helper común para formatear la fila del producto
const formatProductRow = (row: any) => {
  if (!row) return null;

  let categoryName = row.category_name;
  let categorySlug = row.category_slug;
  let categoryId = row.category_id;
  let subcategoryName = row.subcategory_name;
  let subcategorySlug = row.subcategory_slug;
  let subcategoryId = row.subcategory_id;

  // Si category_parent_id existe (legacy: el category_id del producto apuntaba a una subcategoría)
  if (row.category_parent_id) {
    categoryName = row.parent_category_name || 'Varios';
    categorySlug = row.parent_category_slug || '';
    categoryId = row.category_parent_id;
    subcategoryName = row.category_name;
    subcategorySlug = row.category_slug;
    subcategoryId = row.category_id;
  } else if (!categoryId && row.subcategory_parent_id) {
    // Si el producto no tenía category_id directo pero sí subcategoría con categoría padre
    categoryName = row.sub_parent_name || 'Varios';
    categorySlug = row.sub_parent_slug || '';
    categoryId = row.subcategory_parent_id;
  }

  const defaultStock = typeof row.stock === 'number' ? row.stock : parseInt(row.stock, 10) || 0;
  const defaultPrice = typeof row.price === 'number' ? row.price : parseFloat(row.price) || 0;
  const rawOptions = Array.isArray(row.options) ? row.options : parseJsonField(row.options, []);
  const formattedOptions = Array.isArray(rawOptions) && rawOptions.length > 0 ? rawOptions.map((opt: any) => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        name: String(opt.name || opt.title || 'Estándar').trim(),
        price: typeof opt.price === 'number' ? opt.price : (parseFloat(opt.price) || defaultPrice),
        stock: opt.stock !== undefined && opt.stock !== null && opt.stock !== '' ? parseInt(String(opt.stock), 10) : defaultStock
      };
    }
    return {
      name: String(opt).trim(),
      price: defaultPrice,
      stock: defaultStock
    };
  }) : [{ name: 'Estándar', price: defaultPrice, stock: defaultStock }];

  // Calcular precio mínimo, máximo y stock total a partir de las variantes
  const variantPrices = formattedOptions.map((o: any) => o.price).filter((p: number) => !isNaN(p) && p >= 0);
  const minPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : defaultPrice;
  const maxPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : defaultPrice;
  const totalStock = formattedOptions.reduce((acc: number, o: any) => acc + (Number(o.stock) || 0), 0);

  // Sanitizar Base64 hacia URL WebP ultraligera
  const cleanImage = sanitizeAndMigrateImage(row.image_url, row.id);

  // Extraer y normalizar galería de múltiples imágenes
  let rawImagesList: string[] = [];
  if (row.images) {
    if (Array.isArray(row.images)) {
      rawImagesList = row.images;
    } else if (typeof row.images === 'string') {
      try {
        const parsed = JSON.parse(row.images);
        if (Array.isArray(parsed)) rawImagesList = parsed;
      } catch {}
    }
  }

  const cleanImages = rawImagesList
    .map((img: any) => {
      const imgStr = typeof img === 'string' ? img.trim() : (img?.url ? String(img.url).trim() : '');
      return imgStr;
    })
    .filter(Boolean);

  if (cleanImage && !cleanImages.includes(cleanImage)) {
    cleanImages.unshift(cleanImage);
  } else if (cleanImages.length === 0 && cleanImage) {
    cleanImages.push(cleanImage);
  }

  // --- Cálculo dinámico de Ofertas y Descuentos ---
  const rawDiscountPrice = typeof row.discount_price === 'number' 
    ? row.discount_price 
    : (row.discount_price ? parseFloat(row.discount_price) : 0);
  const rawDiscountPct = typeof row.discount_percentage === 'number'
    ? row.discount_percentage
    : (row.discount_percentage ? parseInt(row.discount_percentage, 10) : 0);

  // --- Vigencia y Fechas en Ofertas ---
  const now = new Date();
  const rawStartDate = row.offer_start_date ? new Date(row.offer_start_date) : null;
  const rawEndDate = row.offer_end_date ? new Date(row.offer_end_date) : null;
  const untilStockOut = row.offer_until_stock_out !== false;

  let isOfferExpired = false;
  let isOfferScheduled = false;

  if (rawStartDate && !isNaN(rawStartDate.getTime()) && rawStartDate > now) {
    isOfferScheduled = true;
  }
  if (rawEndDate && !isNaN(rawEndDate.getTime()) && rawEndDate < now) {
    isOfferExpired = true;
  }
  if (untilStockOut && totalStock <= 0) {
    isOfferExpired = true;
  }

  // Una oferta solo está verdaderamente activa si el admin la activó y no expiró
  const isCurrentlyEffective = row.is_offer_active === true && !isOfferExpired && !isOfferScheduled;
  
  let isOnOffer = false;
  let originalPrice = minPrice;
  let finalPrice = minPrice;
  let discountPercentage = rawDiscountPct > 0 ? rawDiscountPct : 0;
  let savingsAmount = 0;
  let offerCondition: string | null = null;

  if (isCurrentlyEffective) {
    isOnOffer = true;
    originalPrice = minPrice;
    if (rawDiscountPct > 0) {
      discountPercentage = rawDiscountPct;
      finalPrice = Math.round(originalPrice * (1 - discountPercentage / 100) * 100) / 100;
    } else if (rawDiscountPrice > 0 && rawDiscountPrice < minPrice) {
      finalPrice = rawDiscountPrice;
      discountPercentage = Math.round(((originalPrice - finalPrice) / originalPrice) * 100);
    } else {
      // Valor por defecto si se activó la oferta sin porcentaje explícito
      discountPercentage = 15;
      finalPrice = Math.round(originalPrice * (1 - discountPercentage / 100) * 100) / 100;
    }
    savingsAmount = Math.max(0, originalPrice - finalPrice);
  } else if (!row.is_offer_active && rawDiscountPrice > 0 && rawDiscountPrice < minPrice) {
    // Descuento explícito en columna discount_price
    isOnOffer = true;
    originalPrice = minPrice;
    finalPrice = rawDiscountPrice;
    discountPercentage = rawDiscountPct > 0 ? rawDiscountPct : Math.round(((originalPrice - finalPrice) / originalPrice) * 100);
    savingsAmount = Math.max(0, originalPrice - finalPrice);
  } else if (!row.is_offer_active && rawDiscountPrice > 0 && rawDiscountPrice > minPrice) {
    // Si discount_price guardó el precio de lista anterior y price el promocional
    isOnOffer = true;
    originalPrice = rawDiscountPrice;
    finalPrice = minPrice;
    discountPercentage = rawDiscountPct > 0 ? rawDiscountPct : Math.round(((originalPrice - finalPrice) / originalPrice) * 100);
    savingsAmount = Math.max(0, originalPrice - finalPrice);
  }

  // Condición de oferta legible para el usuario
  if (row.offer_condition && typeof row.offer_condition === 'string' && row.offer_condition.trim()) {
    offerCondition = row.offer_condition.trim();
  } else if (isOfferExpired) {
    offerCondition = 'Oferta finalizada';
  } else if (isOfferScheduled && rawStartDate) {
    const sStr = rawStartDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    offerCondition = `Inicia el ${sStr}`;
  } else if (rawEndDate && !isOfferExpired) {
    const eStr = rawEndDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    offerCondition = `Válido hasta ${eStr}`;
  } else if (totalStock > 0 && totalStock <= 5) {
    offerCondition = `¡Últimas ${totalStock} unidades!`;
  } else if (untilStockOut) {
    offerCondition = 'Hasta agotar stock';
  } else if (isOnOffer) {
    offerCondition = 'Promoción especial';
  }

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    price: isOnOffer ? finalPrice : minPrice,
    original_price: originalPrice,
    final_price: finalPrice,
    min_price: minPrice,
    max_price: maxPrice,
    discount_price: isOnOffer ? finalPrice : (rawDiscountPrice > 0 ? rawDiscountPrice : null),
    discount_percentage: isOnOffer ? discountPercentage : (rawDiscountPct > 0 ? rawDiscountPct : 0),
    savings_amount: isOnOffer ? savingsAmount : 0,
    is_on_offer: isOnOffer,
    is_offer_active: row.is_offer_active === true,
    is_offer_expired: isOfferExpired,
    is_offer_scheduled: isOfferScheduled,
    offer_start_date: rawStartDate && !isNaN(rawStartDate.getTime()) ? rawStartDate.toISOString().split('T')[0] : null,
    offer_end_date: rawEndDate && !isNaN(rawEndDate.getTime()) ? rawEndDate.toISOString().split('T')[0] : null,
    offer_until_stock_out: untilStockOut,
    offer_condition: offerCondition,
    stock: totalStock,
    total_stock: totalStock,
    image: cleanImage || (cleanImages.length > 0 ? cleanImages[0] : (row.image_url || row.image || '')),
    image_url: cleanImage || (cleanImages.length > 0 ? cleanImages[0] : (row.image_url || row.image || '')),
    imageUrl: cleanImage || (cleanImages.length > 0 ? cleanImages[0] : (row.image_url || row.image || '')),
    imagen: cleanImage || (cleanImages.length > 0 ? cleanImages[0] : (row.image_url || row.image || '')),
    images: cleanImages.length > 0 ? cleanImages : (cleanImage ? [cleanImage] : []),
    imagenes: cleanImages.length > 0 ? cleanImages : (cleanImage ? [cleanImage] : []),
    badge: row.badge,
    badge_type: row.badge_type,
    is_active: row.is_active,
    is_featured: row.is_featured === true || Boolean(row.is_featured) || (row.badge && /destacad/i.test(row.badge)),
    category: categoryName || 'Varios',
    category_slug: categorySlug || '',
    category_id: categoryId || null,
    subcategory: subcategoryName || null,
    subcategory_slug: subcategorySlug || null,
    subcategory_id: subcategoryId || null,
    brand: row.brand || null,
    origin: row.origin || null,
    format: row.format || null,
    cultivation_stage: row.cultivation_stage || null,
    dosage: row.dosage || null,
    ph_recommended: row.ph_recommended || null,
    ec_recommended: row.ec_recommended || null,
    suitable_for: row.suitable_for || null,
    options: formattedOptions,
    key_benefits: row.key_benefits !== undefined ? (Array.isArray(row.key_benefits) ? row.key_benefits : parseJsonField(row.key_benefits, [])) : undefined,
    application_guide: row.application_guide !== undefined ? (Array.isArray(row.application_guide) ? row.application_guide : parseJsonField(row.application_guide, [])) : undefined,
    cannabis_specs: row.cannabis_specs !== undefined ? parseJsonField(row.cannabis_specs, null) : undefined,
    details: row.details !== undefined ? parseJsonField(row.details, null) : undefined,
    shipping_info: row.shipping_info !== undefined ? row.shipping_info : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

// Proyección ligera de campos para listados, home, catálogos y búsquedas (omite JSONB pesados)
const SELECT_PRODUCT_SUMMARY_FIELDS = `
  SELECT 
    p.id,
    p.title,
    p.slug,
    p.description,
    p.price,
    p.discount_price,
    p.discount_percentage,
    p.stock,
    p.image_url,
    p.images,
    p.badge,
    p.badge_type,
    p.options,
    p.is_active,
    p.is_offer_active,
    p.offer_start_date,
    p.offer_end_date,
    p.offer_until_stock_out,
    p.offer_condition,
    p.category_id,
    p.subcategory_id,
    p.brand,
    p.origin,
    p.format,
    c.name as category_name,
    c.slug as category_slug,
    c.parent_id as category_parent_id,
    pcat.name as parent_category_name,
    pcat.slug as parent_category_slug,
    sub.name as subcategory_name,
    sub.slug as subcategory_slug,
    sub.parent_id as subcategory_parent_id,
    sub_parent.name as sub_parent_name,
    sub_parent.slug as sub_parent_slug,
    p.created_at,
    p.updated_at
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN categories pcat ON c.parent_id = pcat.id
  LEFT JOIN categories sub ON p.subcategory_id = sub.id
  LEFT JOIN categories sub_parent ON sub.parent_id = sub_parent.id
`;

const SELECT_PRODUCT_FIELDS = `
  SELECT 
    p.id,
    p.title,
    p.slug,
    p.description,
    p.price,
    p.discount_price,
    p.discount_percentage,
    p.stock,
    p.image_url,
    p.images,
    p.badge,
    p.badge_type,
    p.options,
    p.is_active,
    p.is_offer_active,
    p.offer_start_date,
    p.offer_end_date,
    p.offer_until_stock_out,
    p.offer_condition,
    p.category_id,
    p.subcategory_id,
    p.brand,
    p.origin,
    p.format,
    p.cultivation_stage,
    p.dosage,
    p.ph_recommended,
    p.ec_recommended,
    p.suitable_for,
    p.key_benefits,
    p.application_guide,
    p.cannabis_specs,
    p.shipping_info,
    p.details,
    c.name as category_name,
    c.slug as category_slug,
    c.parent_id as category_parent_id,
    pcat.name as parent_category_name,
    pcat.slug as parent_category_slug,
    sub.name as subcategory_name,
    sub.slug as subcategory_slug,
    sub.parent_id as subcategory_parent_id,
    sub_parent.name as sub_parent_name,
    sub_parent.slug as sub_parent_slug,
    p.created_at,
    p.updated_at
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN categories pcat ON c.parent_id = pcat.id
  LEFT JOIN categories sub ON p.subcategory_id = sub.id
  LEFT JOIN categories sub_parent ON sub.parent_id = sub_parent.id
`;

/**
 * Obtener todos los productos (catálogo completo o filtrado por categoría/subcategoría)
 */
export const getProducts = async (req: Request, res: Response) => {
  try {
    const { 
      category, 
      category_id, 
      subcategory, 
      subcategory_id, 
      search, 
      all, 
      limit, 
      page,
      sort, 
      featured 
    } = req.query;

    // Delegar al selector dinámico con jerarquía y aleatoriedad si se solicita featured=true
    if (featured === 'true' || sort === 'featured') {
      return getFeaturedProducts(req, res);
    }

    // Delegar al selector de ofertas si se solicita offers/ofertas=true
    if (req.query.offers === 'true' || req.query.ofertas === 'true' || sort === 'offers' || sort === 'ofertas') {
      return getOffersProducts(req, res);
    }

    const cacheKey = `products:${JSON.stringify(req.query)}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const whereConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Filtro de productos activos (a menos que se especifique all=true)
    if (all !== 'true') {
      whereConditions.push(`(p.is_active = true OR p.is_active IS NULL)`);
    }

    // Filtro de búsqueda textual opcional
    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchParam = `%${search.trim().toLowerCase()}%`;
      queryParams.push(searchParam);
      whereConditions.push(`(
        LOWER(p.title) LIKE $${paramIndex} OR 
        LOWER(COALESCE(p.description, '')) LIKE $${paramIndex} OR 
        LOWER(COALESCE(p.brand, '')) LIKE $${paramIndex}
      )`);
      paramIndex++;
    }

    // Resolución de categoría principal y subcategoría
    let targetCatId: number | null = null;
    let targetSubcatId: number | null = null;

    if (category_id && !isNaN(Number(category_id))) {
      targetCatId = parseInt(String(category_id), 10);
    } else if (category && typeof category === 'string' && category.trim() !== '' && category.toLowerCase() !== 'todos') {
      const catClean = category.trim().toLowerCase();
      const catRes = await pool.query(
        `SELECT id, parent_id FROM categories WHERE LOWER(slug) = $1 OR LOWER(name) = $1 LIMIT 1`,
        [catClean]
      );
      if (catRes.rows.length > 0) {
        if (catRes.rows[0].parent_id) {
          // El slug recibido era directamente una subcategoría
          targetSubcatId = catRes.rows[0].id;
          targetCatId = catRes.rows[0].parent_id;
        } else {
          targetCatId = catRes.rows[0].id;
        }
      }
    }

    if (subcategory_id && !isNaN(Number(subcategory_id))) {
      targetSubcatId = parseInt(String(subcategory_id), 10);
    } else if (subcategory && typeof subcategory === 'string' && subcategory.trim() !== '') {
      const subClean = subcategory.trim().toLowerCase();
      const subRes = await pool.query(
        `SELECT id FROM categories WHERE (LOWER(slug) = $1 OR LOWER(name) = $1) ${targetCatId ? 'AND parent_id = $2' : ''} LIMIT 1`,
        targetCatId ? [subClean, targetCatId] : [subClean]
      );
      if (subRes.rows.length > 0) {
        targetSubcatId = subRes.rows[0].id;
      }
    }

    // 1. Si se filtró por una subcategoría específica
    if (targetSubcatId) {
      queryParams.push(targetSubcatId);
      whereConditions.push(`(p.subcategory_id = $${paramIndex} OR p.category_id = $${paramIndex})`);
      paramIndex++;
    } else if (targetCatId) {
      // 2. Si se filtró por una categoría principal:
      // Debe incluir todos los productos que pertenezcan directamente a la categoría
      // O a cualquiera de sus subcategorías hijas asociadas
      const subRes = await pool.query(
        `SELECT id FROM categories WHERE parent_id = $1`,
        [targetCatId]
      );
      const childSubIds = subRes.rows.map((r: any) => r.id);

      if (childSubIds.length > 0) {
        queryParams.push(targetCatId);
        const catIdx = paramIndex++;
        queryParams.push(childSubIds);
        const subIdsIdx = paramIndex++;
        whereConditions.push(`(
          p.category_id = $${catIdx} 
          OR p.category_id = ANY($${subIdsIdx}) 
          OR p.subcategory_id = ANY($${subIdsIdx})
        )`);
      } else {
        queryParams.push(targetCatId);
        whereConditions.push(`(p.category_id = $${paramIndex} OR p.subcategory_id = $${paramIndex})`);
        paramIndex++;
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Conteo total para metadatos de paginación
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN categories pcat ON c.parent_id = pcat.id
      LEFT JOIN categories sub ON p.subcategory_id = sub.id
      LEFT JOIN categories sub_parent ON sub.parent_id = sub_parent.id
      ${whereClause}
    `;
    const countResult = await pool.query(countSql, [...queryParams]);
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    // Configuración de paginación (skip y take / OFFSET y LIMIT)
    const isUnlimited = limit === 'all' || limit === 'unlimited';
    const pageNumber = Math.max(1, parseInt(String(page || 1), 10));
    // Por defecto 50 productos por página como requiere la especificación
    const pageSize = isUnlimited ? Math.max(1, total) : Math.max(1, Math.min(200, parseInt(String(limit || 50), 10)));
    const skip = (pageNumber - 1) * pageSize;
    const take = pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    let orderByClause = 'ORDER BY p.id ASC';
    if (featured === 'true' || sort === 'featured') {
      orderByClause = `ORDER BY 
        CASE 
          WHEN p.badge IS NOT NULL AND p.badge != '' AND p.badge != 'SIN STOCK' THEN 0 
          ELSE 1 
        END,
        p.id DESC`;
    } else if (sort === 'recent' || sort === 'newest' || sort === 'desc') {
      orderByClause = 'ORDER BY p.id DESC';
    }

    let paginationClause = '';
    if (!isUnlimited) {
      queryParams.push(take);
      const limitParamIdx = paramIndex++;
      queryParams.push(skip);
      const offsetParamIdx = paramIndex++;
      paginationClause = `LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`;
    }

    const result = await pool.query(`
      ${SELECT_PRODUCT_SUMMARY_FIELDS}
      ${whereClause}
      ${orderByClause}
      ${paginationClause}
    `, queryParams);

    const products = result.rows.map(formatProductRow);

    const meta = {
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages
    };

    const responseData = {
      data: products,
      products,
      meta
    };

    // Caché en memoria por 60 segundos
    cache.set(cacheKey, responseData, 60);

    return res.json(responseData);
  } catch (error: any) {
    console.error('Error en getProducts:', error);
    return res.status(500).json({ error: 'Error al obtener productos de la base de datos.' });
  }
};

/**
 * Helper de barajado aleatorio (Fisher-Yates) para Node.js
 */
const shuffleArray = <T>(array: T[]): T[] => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * Helper para verificar si un producto cuenta con stock disponible
 */
const checkProductHasStock = (prod: any): boolean => {
  if (!prod) return false;
  const badgeStr = String(prod.badge || '').toUpperCase();
  if (badgeStr === 'SIN STOCK') return false;
  if (typeof prod.stock === 'number' && prod.stock > 0) return true;
  if (Array.isArray(prod.options) && prod.options.some((o: any) => Number(o?.stock) > 0)) return true;
  return Number(prod.stock) > 0;
};

/**
 * Endpoint para productos destacados y novedades de la página principal (Home)
 * 
 * Implementa la jerarquía comercial solicitada:
 * 1ª Prioridad: Productos marcados explícitamente como "destacados" (is_featured = true o badges TOP VENTAS / DESTACADO / OFERTA).
 * 2ª Prioridad: Productos con etiqueta "nuevo ingreso" o los más recientes incorporados al catálogo.
 * 3ª Prioridad: Productos con stock disponible para asegurar disponibilidad inmediata.
 * 
 * Factor de aleatoriedad (Fisher-Yates):
 * En cada visita o recarga, se barajan los candidatos de cada nivel para generar
 * una combinación comercial fresca, dinámica y no estática.
 */
export const getFeaturedProducts = async (req: Request, res: Response) => {
  try {
    const rawLimit = req.query.limit;
    const limit = Math.max(1, Math.min(24, parseInt(String(rawLimit || 8), 10)));

    // Reutilizar el pool de candidatos en memoria durante 30s para proteger la base de datos Postgres,
    // pero barajar y componer aleatoriamente la selección en CADA request individual
    const CANDIDATES_CACHE_KEY = 'products:featured:candidates_pool';
    let candidates = cache.get<any[]>(CANDIDATES_CACHE_KEY);

    if (!candidates) {
      // Traer una muestra amplia de productos activos (últimos 150) con proyección ligera optimizada
      const sql = `
        ${SELECT_PRODUCT_SUMMARY_FIELDS}
        WHERE (p.is_active = true OR p.is_active IS NULL)
        ORDER BY p.id DESC
        LIMIT 150
      `;
      const result = await pool.query(sql);
      candidates = result.rows.map(formatProductRow).filter(Boolean);
      cache.set(CANDIDATES_CACHE_KEY, candidates, 30);
    }

    if (!candidates || candidates.length === 0) {
      return res.json({
        success: true,
        data: [],
        products: [],
        meta: { total: 0, count: 0, limit }
      });
    }

    // Clasificar en las 3 prioridades comerciales
    const tier1: any[] = []; // 1ª Prioridad: Destacados explícitos
    const tier2: any[] = []; // 2ª Prioridad: Nuevos ingresos o más recientes
    const tier3: any[] = []; // 3ª Prioridad: Con stock disponible

    // Umbral de IDs recientes (últimos 50 productos ingresados a la tienda)
    const maxId = Math.max(...candidates.map((c: any) => Number(c.id) || 0));
    const recentThresholdId = Math.max(0, maxId - 50);

    for (const prod of candidates) {
      const badgeUpper = String(prod.badge || '').toUpperCase();
      const isExplicitFeatured = prod.is_featured === true || 
        badgeUpper.includes('DESTACAD') || 
        badgeUpper.includes('TOP') || 
        badgeUpper.includes('OFERTA') || 
        badgeUpper.includes('RECOMENDAD');

      const isNewArrival = badgeUpper.includes('NUEVO') || 
        badgeUpper.includes('INGRESO') || 
        Number(prod.id) >= recentThresholdId;

      const hasStock = checkProductHasStock(prod);

      if (isExplicitFeatured) {
        tier1.push(prod);
      } else if (isNewArrival) {
        tier2.push(prod);
      } else if (hasStock) {
        tier3.push(prod);
      }
    }

    // Dentro de cada nivel, dar preferencia a aquellos que cuentan con stock disponible
    const tier1InStock = tier1.filter(checkProductHasStock);
    const tier1OutStock = tier1.filter(p => !checkProductHasStock(p));
    const tier2InStock = tier2.filter(checkProductHasStock);
    const tier2OutStock = tier2.filter(p => !checkProductHasStock(p));
    const tier3InStock = tier3; // Ya filtrados con stock

    // Barajar aleatoriamente cada grupo con Fisher-Yates
    const shuffledTier1 = [...shuffleArray(tier1InStock), ...shuffleArray(tier1OutStock)];
    const shuffledTier2 = [...shuffleArray(tier2InStock), ...shuffleArray(tier2OutStock)];
    const shuffledTier3 = shuffleArray(tier3InStock);

    const selectedProducts: any[] = [];
    const selectedIds = new Set<number>();

    const addProduct = (p: any) => {
      if (!p || selectedIds.has(p.id) || selectedProducts.length >= limit) return false;
      selectedIds.add(p.id);
      selectedProducts.push(p);
      return true;
    };

    // 1ª Prioridad: Asignar hasta el 60% de los espacios a Destacados (mínimo 3 si existen),
    // asegurando cupo para novedades para reflejar la sección "Últimos Ingresos y Destacados"
    const desiredTier1Slots = Math.min(
      shuffledTier1.length,
      Math.max(3, limit - Math.min(shuffledTier2.length, 3))
    );

    for (let i = 0; i < desiredTier1Slots; i++) {
      addProduct(shuffledTier1[i]);
    }

    // 2ª Prioridad: Completar con Nuevos Ingresos y más recientes
    for (const prod of shuffledTier2) {
      if (selectedProducts.length >= limit) break;
      addProduct(prod);
    }

    // Si aún quedan vacantes, completar con más destacados si había disponibles
    for (const prod of shuffledTier1) {
      if (selectedProducts.length >= limit) break;
      addProduct(prod);
    }

    // 3ª Prioridad: Productos con stock disponible
    for (const prod of shuffledTier3) {
      if (selectedProducts.length >= limit) break;
      addProduct(prod);
    }

    // Fallback de seguridad: cualquier producto restante si aún no alcanzamos el límite
    if (selectedProducts.length < limit) {
      for (const prod of shuffleArray(candidates)) {
        if (selectedProducts.length >= limit) break;
        addProduct(prod);
      }
    }

    // Barajar armónicamente la grilla final para que destacados y novedades
    // aparezcan intercalados de forma atractiva y dinámica en la Home
    const randomizedGrid = shuffleArray(selectedProducts);

    return res.json({
      success: true,
      data: randomizedGrid,
      products: randomizedGrid,
      meta: {
        total: randomizedGrid.length,
        count: randomizedGrid.length,
        limit,
        fresh: true
      }
    });
  } catch (error: any) {
    console.error('Error en getFeaturedProducts:', error);
    return res.status(500).json({ error: 'Error al obtener productos destacados dinámicos.' });
  }
};

/**
 * Endpoint dedicado a productos en OFERTA y promociones especiales (/api/products/offers)
 */
export const getOffersProducts = async (req: Request, res: Response) => {
  try {
    const { category, category_id, search, limit, page, sort } = req.query;
    const cacheKey = `products:offers:${JSON.stringify(req.query)}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Solo exponer productos existentes que el administrador haya activado como oferta y cuya vigencia sea válida.
    const sql = `
      ${SELECT_PRODUCT_SUMMARY_FIELDS}
      WHERE (p.is_active = true OR p.is_active IS NULL)
        AND p.is_offer_active = true
        AND (p.offer_start_date IS NULL OR p.offer_start_date <= NOW())
        AND (p.offer_end_date IS NULL OR p.offer_end_date >= NOW())
        AND (p.offer_until_stock_out IS NOT TRUE OR p.stock > 0)
      ORDER BY p.id DESC
      LIMIT 200
    `;
    const result = await pool.query(sql);
    const allProducts: any[] = result.rows
      .map(formatProductRow)
      .filter((p): p is NonNullable<typeof p> => Boolean(p && p.is_on_offer && !p.is_offer_expired));

    let offerProducts: any[] = allProducts;

    // Filtrado por categoría opcional
    if (category_id && !isNaN(Number(category_id))) {
      const targetCatId = parseInt(String(category_id), 10);
      offerProducts = offerProducts.filter((p: any) => p.category_id === targetCatId || p.subcategory_id === targetCatId);
    } else if (category && typeof category === 'string' && category.toLowerCase() !== 'todos') {
      const catNorm = category.toLowerCase().trim();
      offerProducts = offerProducts.filter((p: any) => 
        (p.category && p.category.toLowerCase().includes(catNorm)) ||
        (p.category_slug && p.category_slug.toLowerCase() === catNorm)
      );
    }

    // Filtrado por búsqueda de texto opcional
    if (search && typeof search === 'string' && search.trim() !== '') {
      const s = search.toLowerCase().trim();
      offerProducts = offerProducts.filter((p: any) => 
        (p.title && p.title.toLowerCase().includes(s)) ||
        (p.description && p.description.toLowerCase().includes(s)) ||
        (p.brand && p.brand.toLowerCase().includes(s))
      );
    }

    // Ordenamiento
    if (sort === 'discount_desc' || sort === 'discount' || sort === 'offers') {
      offerProducts.sort((a: any, b: any) => (b.discount_percentage || 0) - (a.discount_percentage || 0));
    } else if (sort === 'price_asc' || sort === 'price-asc') {
      offerProducts.sort((a: any, b: any) => (a.final_price || a.price) - (b.final_price || b.price));
    } else if (sort === 'price_desc' || sort === 'price-desc') {
      offerProducts.sort((a: any, b: any) => (b.final_price || b.price) - (a.final_price || a.price));
    } else if (sort === 'newest') {
      offerProducts.sort((a: any, b: any) => Number(b.id) - Number(a.id));
    }

    const total = offerProducts.length;
    const pageNumber = Math.max(1, parseInt(String(page || 1), 10));
    const isUnlimited = limit === 'all' || limit === 'unlimited';
    const pageSize = isUnlimited ? Math.max(1, total) : Math.max(1, Math.min(100, parseInt(String(limit || 50), 10)));
    const skip = (pageNumber - 1) * pageSize;
    const paginated = offerProducts.slice(skip, skip + pageSize);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const responseData = {
      success: true,
      data: paginated,
      products: paginated,
      meta: {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages
      }
    };

    cache.set(cacheKey, responseData, 45);
    return res.json(responseData);
  } catch (error: any) {
    console.error('Error en getOffersProducts:', error);
    return res.status(500).json({ error: 'Error al obtener productos en oferta.' });
  }
};

export const getOfferManagementProducts = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || 20), 10)));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const filter = typeof req.query.filter === 'string' ? req.query.filter.trim().toLowerCase() : 'all';

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Filtro por estado de oferta
    if (filter === 'active') {
      conditions.push(`p.is_offer_active = true`);
    } else if (filter === 'inactive') {
      conditions.push(`(p.is_offer_active = false OR p.is_offer_active IS NULL)`);
    }

    // Filtro de búsqueda rápida
    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(
        p.title ILIKE $${paramIndex} OR 
        p.brand ILIKE $${paramIndex} OR 
        c.name ILIKE $${paramIndex} OR
        sub.name ILIKE $${paramIndex}
      )`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Conteo total para paginación
    const countSql = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN categories sub ON p.subcategory_id = sub.id
      ${whereClause}
    `;
    const countRes = await pool.query(countSql, values);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    // Conteo global de ofertas activas para el badge de cabecera
    const activeCountRes = await pool.query(`
      SELECT COUNT(*) as count 
      FROM products 
      WHERE is_offer_active = true
        AND (offer_start_date IS NULL OR offer_start_date <= NOW())
        AND (offer_end_date IS NULL OR offer_end_date >= NOW())
        AND (offer_until_stock_out IS NOT TRUE OR stock > 0)
    `);
    const activeCount = parseInt(activeCountRes.rows[0]?.count || '0', 10);

    // Parámetros para paginar en base de datos sin sobrecargar la memoria
    const offset = (page - 1) * limit;
    values.push(limit);
    const limitParam = `$${paramIndex++}`;
    values.push(offset);
    const offsetParam = `$${paramIndex++}`;

    const dataSql = `
      ${SELECT_PRODUCT_SUMMARY_FIELDS}
      ${whereClause}
      ORDER BY p.is_offer_active DESC NULLS LAST, p.title ASC, p.id ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const result = await pool.query(dataSql, values);
    const products = result.rows
      .map(formatProductRow)
      .filter((product): product is NonNullable<typeof product> => Boolean(product));

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.status(200).json({
      success: true,
      data: products,
      products,
      meta: {
        total,
        page,
        limit,
        totalPages,
        activeCount
      }
    });
  } catch (error: any) {
    console.error('Error al listar productos para gestión de ofertas:', error);
    return res.status(500).json({ error: 'Error al cargar productos para gestión de ofertas.' });
  }
};

export const setProductOfferStatus = async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.id);
    const { 
      is_offer_active, 
      discount_percentage,
      offer_start_date,
      offer_end_date,
      offer_until_stock_out,
      offer_condition
    } = req.body;

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Identificador de producto no válido.' });
    }
    if (typeof is_offer_active !== 'boolean') {
      return res.status(400).json({ error: 'is_offer_active debe ser un valor booleano.' });
    }

    // Verificar existencia del producto
    const currentRes = await pool.query(
      `SELECT id, price, discount_price, discount_percentage, offer_start_date, offer_end_date, offer_until_stock_out, offer_condition FROM products WHERE id = $1`,
      [productId]
    );

    if (currentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const current = currentRes.rows[0];
    const basePrice = Number(current.price) || 0;

    let targetPct = current.discount_percentage || 15;
    if (discount_percentage !== undefined && discount_percentage !== null && !isNaN(Number(discount_percentage))) {
      targetPct = Math.min(95, Math.max(1, Math.round(Number(discount_percentage))));
    }
    if (targetPct <= 0) targetPct = 15;

    const targetDiscountPrice = Math.round(basePrice * (1 - targetPct / 100) * 100) / 100;

    // Normalizar vigencia y fechas
    const startDate = offer_start_date !== undefined 
      ? (offer_start_date ? new Date(offer_start_date) : null) 
      : current.offer_start_date;
    const endDate = offer_end_date !== undefined 
      ? (offer_end_date ? new Date(offer_end_date) : null) 
      : current.offer_end_date;
    const untilStock = offer_until_stock_out !== undefined 
      ? Boolean(offer_until_stock_out) 
      : (current.offer_until_stock_out !== false);

    let cond = offer_condition !== undefined ? (offer_condition ? String(offer_condition).trim() : null) : current.offer_condition;
    if (!cond) {
      if (untilStock) {
        cond = 'Hasta agotar stock';
      } else if (endDate) {
        cond = `Válido hasta ${new Date(endDate).toLocaleDateString('es-AR')}`;
      }
    }

    if (is_offer_active) {
      await pool.query(
        `UPDATE products
         SET is_offer_active = true,
             discount_percentage = $1,
             discount_price = $2,
             offer_start_date = $3,
             offer_end_date = $4,
             offer_until_stock_out = $5,
             offer_condition = $6,
             updated_at = NOW()
         WHERE id = $7`,
        [targetPct, targetDiscountPrice, startDate, endDate, untilStock, cond, productId]
      );
    } else {
      await pool.query(
        `UPDATE products
         SET is_offer_active = false,
             updated_at = NOW()
         WHERE id = $1`,
        [productId]
      );
    }

    // Recuperar el registro completo con proyecciones y categorías para el frontend
    const updatedRes = await pool.query(
      `${SELECT_PRODUCT_SUMMARY_FIELDS} WHERE p.id = $1`,
      [productId]
    );

    const formattedProduct = updatedRes.rows.length > 0 ? formatProductRow(updatedRes.rows[0]) : null;

    // Total de ofertas activas no expiradas
    const activeCountRes = await pool.query(`
      SELECT COUNT(*) as count 
      FROM products 
      WHERE is_offer_active = true
        AND (offer_start_date IS NULL OR offer_start_date <= NOW())
        AND (offer_end_date IS NULL OR offer_end_date >= NOW())
        AND (offer_until_stock_out IS NOT TRUE OR stock > 0)
    `);
    const activeCount = parseInt(activeCountRes.rows[0]?.count || '0', 10);

    cache.invalidate('products');
    return res.json({ 
      success: true, 
      product: formattedProduct,
      meta: { activeCount }
    });
  } catch (error: any) {
    console.error('Error al actualizar estado de oferta del producto:', error);
    return res.status(500).json({ error: 'Error al actualizar el estado de oferta.' });
  }
};

/**
 * Obtener producto por ID o slug con soporte dual numérico y textual
 */
export const getProductById = async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    if (!rawId || !String(rawId).trim() || rawId === 'undefined' || rawId === 'null') {
      return res.status(400).json({ error: 'Identificador de producto no válido.' });
    }

    const cleanId = String(rawId).trim();
    const cacheKey = `products:item:${cleanId.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const isNumeric = /^\d+$/.test(cleanId);
    let result;

    if (isNumeric) {
      const numId = parseInt(cleanId, 10);
      result = await pool.query(
        `${SELECT_PRODUCT_FIELDS} WHERE p.id = $1 LIMIT 1`,
        [numId]
      );

      // Si no se encontró por ID numérico directo, intentar por slug exacto
      if (result.rows.length === 0) {
        result = await pool.query(
          `${SELECT_PRODUCT_FIELDS} WHERE LOWER(p.slug) = LOWER($1) LIMIT 1`,
          [cleanId]
        );
      }
    } else {
      // Coincidencia insensible a mayúsculas/minúsculas por slug
      result = await pool.query(
        `${SELECT_PRODUCT_FIELDS} WHERE LOWER(p.slug) = LOWER($1) OR p.slug = $1 LIMIT 1`,
        [cleanId]
      );

      // Si no se encontró por slug directo, verificar si tiene prefijo numérico (ej: "677-nombre")
      if (result.rows.length === 0) {
        const prefixMatch = cleanId.match(/^(\d+)(?:-|_|$)/);
        if (prefixMatch) {
          const prefixId = parseInt(prefixMatch[1], 10);
          if (!isNaN(prefixId)) {
            result = await pool.query(
              `${SELECT_PRODUCT_FIELDS} WHERE p.id = $1 LIMIT 1`,
              [prefixId]
            );
          }
        }
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Insumo no encontrado en el inventario.' });
    }

    const product = formatProductRow(result.rows[0]);
    if (!product) {
      return res.status(404).json({ error: 'Insumo no encontrado en el inventario.' });
    }

    const responseData = { 
      success: true,
      product,
      data: product
    };

    // Caché individual por 60 segundos
    cache.set(cacheKey, responseData, 60);

    return res.json(responseData);
  } catch (error: any) {
    console.error('Error en getProductById:', error);
    return res.status(500).json({ error: 'Error al consultar producto en el servidor.' });
  }
};

/**
 * Helper para resolver categoría y subcategoría desde datos recibidos
 */
const resolveCategories = async (
  category_id?: any,
  category?: any,
  subcategory_id?: any,
  subcategory?: any
) => {
  let resolvedCatId: number | null = null;
  let resolvedSubcatId: number | null = null;

  // 1. Resolver Categoría Principal
  if (category_id && !isNaN(Number(category_id))) {
    resolvedCatId = parseInt(category_id, 10);
  } else if (category) {
    const catCheck = await pool.query(
      `SELECT id FROM categories WHERE (LOWER(name) = $1 OR LOWER(slug) = $1) AND parent_id IS NULL LIMIT 1`,
      [category.toString().trim().toLowerCase()]
    );
    if (catCheck.rows.length > 0) {
      resolvedCatId = catCheck.rows[0].id;
    } else {
      // Búsqueda general
      const generalCheck = await pool.query(
        `SELECT id FROM categories WHERE LOWER(name) = $1 OR LOWER(slug) = $1 LIMIT 1`,
        [category.toString().trim().toLowerCase()]
      );
      if (generalCheck.rows.length > 0) {
        resolvedCatId = generalCheck.rows[0].id;
      }
    }
  }

  // 2. Resolver Subcategoría
  if (subcategory_id && !isNaN(Number(subcategory_id))) {
    resolvedSubcatId = parseInt(subcategory_id, 10);
  } else if (subcategory && subcategory.toString().trim() !== '') {
    const subCheck = resolvedCatId 
      ? await pool.query(
          `SELECT id FROM categories WHERE (LOWER(name) = $1 OR LOWER(slug) = $1) AND parent_id = $2 LIMIT 1`,
          [subcategory.toString().trim().toLowerCase(), resolvedCatId]
        )
      : await pool.query(
          `SELECT id FROM categories WHERE (LOWER(name) = $1 OR LOWER(slug) = $1) AND parent_id IS NOT NULL LIMIT 1`,
          [subcategory.toString().trim().toLowerCase()]
        );
    if (subCheck.rows.length > 0) {
      resolvedSubcatId = subCheck.rows[0].id;
    }
  }

  return { resolvedCatId, resolvedSubcatId };
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
      discount_price,
      stock = 10,
      image_url,
      image,
      images,
      category,
      category_id,
      subcategory,
      subcategory_id,
      badge = 'STOCK DISPONIBLE',
      badge_type = 'gold',
      options = ['Estándar'],
      brand,
      origin,
      format,
      cultivation_stage,
      dosage,
      ph_recommended,
      ec_recommended,
      suitable_for,
      key_benefits,
      application_guide,
      cannabis_specs,
      shipping_info,
      details
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'El título del producto es obligatorio.' });
    }

    // 1. Recopilar candidatos de múltiples imágenes (Multer req.files + req.body.images + image_url)
    let rawImagesList: string[] = [];

    if (images) {
      if (Array.isArray(images)) {
        rawImagesList.push(...images);
      } else if (typeof images === 'string') {
        try {
          const parsed = JSON.parse(images);
          if (Array.isArray(parsed)) rawImagesList.push(...parsed);
          else if (images.trim()) rawImagesList.push(images.trim());
        } catch {
          if (images.trim()) rawImagesList.push(images.trim());
        }
      }
    }

    const multerUploaded = (req as any).uploadedImages || [];
    if (Array.isArray(multerUploaded) && multerUploaded.length > 0) {
      rawImagesList.push(...multerUploaded);
    }

    if (rawImagesList.length === 0) {
      if (image_url && typeof image_url === 'string') rawImagesList.push(image_url.trim());
      if (image && typeof image === 'string') rawImagesList.push(image.trim());
    }

    if (rawImagesList.length === 0) {
      rawImagesList.push('https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=600');
    }

    const uniqueRawImages = Array.from(new Set(rawImagesList.map(img => String(img).trim()).filter(Boolean)));
    const processedImages: string[] = [];
    for (const raw of uniqueRawImages) {
      const webpUrl = await processAnyImageInput(raw, 'product', 85);
      if (webpUrl && !processedImages.includes(webpUrl)) {
        processedImages.push(webpUrl);
      }
    }

    const finalImage = processedImages[0] || '';
    const imagesJson = JSON.stringify(processedImages);
    const numDiscount = discount_price !== undefined && discount_price !== null && discount_price !== '' ? Number(discount_price) : null;

    // Normalizar opciones con precio y stock independiente (fuente de verdad obligatoria)
    let normalizedOptions: any[] = [];
    if (Array.isArray(options) && options.length > 0) {
      normalizedOptions = options.map((o: any) => {
        if (typeof o === 'object' && o !== null) {
          const optName = String(o.name || o.title || '').trim();
          const optPrice = typeof o.price === 'string' ? parseFloat(o.price.replace(/[^0-9.-]/g, '')) || 0 : Number(o.price) || 0;
          const optStock = o.stock !== undefined && o.stock !== null && o.stock !== ''
            ? Math.max(0, parseInt(String(o.stock), 10) || 0)
            : 0;
          return { name: optName, price: optPrice, stock: optStock };
        }
        return { name: String(o).trim(), price: 0, stock: 0 };
      }).filter((o: any) => o.name.length > 0);
    }

    // Si aún se envió con precio legado y sin variantes
    if (normalizedOptions.length === 0) {
      if (price !== undefined && price !== null && price !== '') {
        const fallbackPrice = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.-]/g, '')) || 0 : Number(price) || 0;
        const fallbackStock = parseInt(stock, 10) || 0;
        normalizedOptions = [{ name: 'Estándar', price: fallbackPrice, stock: fallbackStock }];
      } else {
        return res.status(400).json({ error: 'Debes definir al menos una medida o presentación en la tabla con su precio y stock.' });
      }
    }

    // Calcular automáticamente precio base y stock total a partir de las variantes
    const optionPrices: number[] = normalizedOptions
      .map((o: any) => o.price)
      .filter((p: number): p is number => !isNaN(p) && p >= 0);

    const calculatedPrice = optionPrices.length > 0 ? Math.min(...optionPrices) : 0;
    const totalVariantStock = normalizedOptions.reduce((acc: number, curr: any) => acc + (curr.stock || 0), 0);

    const numPrice = calculatedPrice;
    const numStock = totalVariantStock;

    let finalBadge: string | null = badge !== undefined && badge !== null ? String(badge).trim() : 'STOCK DISPONIBLE';
    if (finalBadge === 'none' || (finalBadge && finalBadge.toLowerCase() === 'sin etiqueta') || finalBadge === '') {
      finalBadge = null;
    }
    let finalBadgeType = badge_type || 'gold';
    if (numStock <= 0) {
      finalBadge = 'SIN STOCK';
      finalBadgeType = 'red';
    }

    // Resolver categorías
    const { resolvedCatId, resolvedSubcatId } = await resolveCategories(
      category_id,
      category,
      subcategory_id,
      subcategory
    );

    // Generar slug único
    let baseSlug = slugify(title);
    let finalSlug = baseSlug;
    let counter = 1;
    while (true) {
      const slugCheck = await pool.query('SELECT id FROM products WHERE slug = $1', [finalSlug]);
      if (slugCheck.rows.length === 0) break;
      finalSlug = `${baseSlug}-${counter++}`;
    }

    const optionsJson = JSON.stringify(normalizedOptions);
    const benefitsArray = normalizeStringArray(key_benefits);
    const guideArray = normalizeStringArray(application_guide);
    const specsJson = cannabis_specs ? JSON.stringify(cannabis_specs) : null;
    const detailsJson = details ? JSON.stringify(details) : null;

    const insertResult = await pool.query(`
      INSERT INTO products (
        title, slug, description, price, discount_price, stock, image_url, images,
        badge, badge_type, options, category_id, subcategory_id, is_active,
        brand, origin, format, cultivation_stage, dosage, ph_recommended, ec_recommended,
        suitable_for, key_benefits, application_guide, cannabis_specs, shipping_info, details
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, true,
        $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26
      )
      RETURNING id
    `, [
      title.trim(),
      finalSlug,
      description || '',
      numPrice,
      numDiscount,
      numStock,
      finalImage,
      imagesJson,
      finalBadge,
      finalBadgeType,
      optionsJson,
      resolvedCatId,
      resolvedSubcatId,
      brand || null,
      origin || null,
      format || null,
      cultivation_stage || null,
      dosage || null,
      ph_recommended || null,
      ec_recommended || null,
      suitable_for || null,
      JSON.stringify(benefitsArray),
      JSON.stringify(guideArray),
      specsJson,
      shipping_info || null,
      detailsJson
    ]);

    const newId = insertResult.rows[0].id;
    const fetchNew = await pool.query(`${SELECT_PRODUCT_FIELDS} WHERE p.id = $1`, [newId]);
    const createdProduct = formatProductRow(fetchNew.rows[0]);

    // Invalidar caché
    cache.invalidate('products');
    cache.invalidate('categories');

    return res.status(201).json({
      message: 'Producto creado exitosamente.',
      product: createdProduct
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
      discount_price,
      stock,
      image_url,
      image,
      images,
      category,
      category_id,
      subcategory,
      subcategory_id,
      badge,
      badge_type,
      options,
      brand,
      origin,
      format,
      cultivation_stage,
      dosage,
      ph_recommended,
      ec_recommended,
      suitable_for,
      key_benefits,
      application_guide,
      cannabis_specs,
      shipping_info,
      details,
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

    // Resolver categorías
    const { resolvedCatId, resolvedSubcatId } = await resolveCategories(
      category_id !== undefined ? category_id : current.category_id,
      category,
      subcategory_id !== undefined ? subcategory_id : current.subcategory_id,
      subcategory
    );

    const finalTitle = title !== undefined ? title.trim() : current.title;
    const finalDescription = description !== undefined ? description : current.description;
    let finalPrice = price !== undefined ? (typeof price === 'string' ? parseFloat(price.replace(/[^0-9.-]/g, '')) || 0 : Number(price)) : current.price;
    const finalDiscount = discount_price !== undefined ? Number(discount_price) : current.discount_price;
    let finalStock = stock !== undefined ? parseInt(stock, 10) : current.stock;
    if (isNaN(finalStock)) finalStock = 0;

    // Procesar galería de múltiples imágenes si se enviaron cambios
    let finalImagesJson = current.images;
    let finalImage = current.image_url;

    const multerUploaded = (req as any).uploadedImages || [];
    const hasImagesUpdate = images !== undefined || image_url !== undefined || image !== undefined || multerUploaded.length > 0;

    if (hasImagesUpdate) {
      let candidateImages: string[] = [];

      if (images !== undefined) {
        if (Array.isArray(images)) {
          candidateImages.push(...images);
        } else if (typeof images === 'string') {
          try {
            const parsed = JSON.parse(images);
            if (Array.isArray(parsed)) candidateImages.push(...parsed);
            else if (images.trim()) candidateImages.push(images.trim());
          } catch {
            if (images.trim()) candidateImages.push(images.trim());
          }
        }
      }

      if (multerUploaded.length > 0) {
        candidateImages.push(...multerUploaded);
      }

      if (candidateImages.length === 0) {
        if (image_url !== undefined && typeof image_url === 'string' && image_url.trim()) {
          candidateImages.push(image_url.trim());
        }
        if (image !== undefined && typeof image === 'string' && image.trim()) {
          candidateImages.push(image.trim());
        }
      }

      const uniqueCandidates = Array.from(new Set(candidateImages.map(img => String(img).trim()).filter(Boolean)));

      if (uniqueCandidates.length > 0) {
        const processedImages: string[] = [];
        for (const raw of uniqueCandidates) {
          const webpUrl = await processAnyImageInput(raw, 'product', 85);
          if (webpUrl && !processedImages.includes(webpUrl)) {
            processedImages.push(webpUrl);
          }
        }
        if (processedImages.length > 0) {
          finalImage = processedImages[0];
          finalImagesJson = JSON.stringify(processedImages);
        }
      }
    }

    // Si la imagen principal cambió y la anterior era un archivo local, limpiar el archivo viejo
    if (current.image_url && current.image_url !== finalImage) {
      await deleteOldImageFile(current.image_url);
    }
    let finalBadge: string | null = badge !== undefined ? (badge !== null ? String(badge).trim() : null) : current.badge;
    if (finalBadge === 'none' || (finalBadge && finalBadge.toLowerCase() === 'sin etiqueta') || finalBadge === '') {
      finalBadge = null;
    }
    let finalBadgeType = badge_type !== undefined ? badge_type : current.badge_type;
    const finalIsActive = is_active !== undefined ? is_active : current.is_active;

    let finalOptionsJson = current.options;
    if (options !== undefined) {
      let normalizedOptions: any[] = [];
      if (Array.isArray(options) && options.length > 0) {
        normalizedOptions = options.map((o: any) => {
          if (typeof o === 'object' && o !== null) {
            const optName = String(o.name || o.title || 'Estándar').trim();
            const optPrice = typeof o.price === 'string' ? parseFloat(o.price.replace(/[^0-9.-]/g, '')) || 0 : Number(o.price) || 0;
            const optStock = o.stock !== undefined && o.stock !== null && o.stock !== ''
              ? Math.max(0, parseInt(String(o.stock), 10) || 0)
              : finalStock;
            return { name: optName, price: optPrice, stock: optStock };
          }
          return { name: String(o).trim(), price: finalPrice, stock: finalStock };
        }).filter((o: any) => o.name.length > 0);
      }

      if (normalizedOptions.length > 0) {
        const optionPrices: number[] = normalizedOptions
          .map((o: any) => o.price)
          .filter((p: number): p is number => !isNaN(p) && p >= 0);
        if (optionPrices.length > 0) {
          finalPrice = Math.min(...optionPrices);
        }

        const totalVariantStock = normalizedOptions.reduce((acc: number, curr: any) => acc + (curr.stock || 0), 0);
        finalStock = totalVariantStock;
        finalOptionsJson = JSON.stringify(normalizedOptions);
      } else {
        finalOptionsJson = JSON.stringify([{ name: 'Estándar', price: finalPrice, stock: finalStock }]);
      }
    }

    if (finalStock <= 0) {
      finalBadge = 'SIN STOCK';
      finalBadgeType = 'red';
    } else if (finalBadge === 'SIN STOCK') {
      finalBadge = 'STOCK DISPONIBLE';
      finalBadgeType = 'gold';
    }

    const finalBrand = brand !== undefined ? brand : current.brand;
    const finalOrigin = origin !== undefined ? origin : current.origin;
    const finalFormat = format !== undefined ? format : current.format;
    const finalCultivationStage = cultivation_stage !== undefined ? cultivation_stage : current.cultivation_stage;
    const finalDosage = dosage !== undefined ? dosage : current.dosage;
    const finalPh = ph_recommended !== undefined ? ph_recommended : current.ph_recommended;
    const finalEc = ec_recommended !== undefined ? ec_recommended : current.ec_recommended;
    const finalSuitableFor = suitable_for !== undefined ? suitable_for : current.suitable_for;

    let finalBenefitsJson = current.key_benefits;
    if (key_benefits !== undefined) {
      finalBenefitsJson = JSON.stringify(normalizeStringArray(key_benefits));
    }

    let finalGuideJson = current.application_guide;
    if (application_guide !== undefined) {
      finalGuideJson = JSON.stringify(normalizeStringArray(application_guide));
    }

    let finalCannabisSpecsJson = current.cannabis_specs;
    if (cannabis_specs !== undefined) {
      finalCannabisSpecsJson = cannabis_specs ? JSON.stringify(cannabis_specs) : null;
    }

    const finalShippingInfo = shipping_info !== undefined ? shipping_info : current.shipping_info;

    let finalDetailsJson = current.details;
    if (details !== undefined) {
      finalDetailsJson = details ? JSON.stringify(details) : null;
    }

    await pool.query(`
      UPDATE products SET
        title = $1,
        description = $2,
        price = $3,
        discount_price = $4,
        stock = $5,
        image_url = $6,
        images = $7,
        badge = $8,
        badge_type = $9,
        options = $10,
        category_id = $11,
        subcategory_id = $12,
        brand = $13,
        origin = $14,
        format = $15,
        cultivation_stage = $16,
        dosage = $17,
        ph_recommended = $18,
        ec_recommended = $19,
        suitable_for = $20,
        key_benefits = $21,
        application_guide = $22,
        cannabis_specs = $23,
        shipping_info = $24,
        details = $25,
        is_active = $26,
        updated_at = NOW()
      WHERE id = $27
    `, [
      finalTitle,
      finalDescription,
      finalPrice,
      finalDiscount,
      finalStock,
      finalImage,
      finalImagesJson,
      finalBadge,
      finalBadgeType,
      finalOptionsJson,
      resolvedCatId,
      resolvedSubcatId,
      finalBrand,
      finalOrigin,
      finalFormat,
      finalCultivationStage,
      finalDosage,
      finalPh,
      finalEc,
      finalSuitableFor,
      finalBenefitsJson,
      finalGuideJson,
      finalCannabisSpecsJson,
      finalShippingInfo,
      finalDetailsJson,
      finalIsActive,
      targetId
    ]);

    const fetchUpdated = await pool.query(`${SELECT_PRODUCT_FIELDS} WHERE p.id = $1`, [targetId]);
    const updatedProduct = formatProductRow(fetchUpdated.rows[0]);

    // Invalidar caché
    cache.invalidate('products');
    cache.invalidate('categories');

    return res.json({
      message: 'Producto actualizado con éxito.',
      product: updatedProduct
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
      ? await pool.query('SELECT id, title, image_url FROM products WHERE id = $1', [parseInt(id, 10)])
      : await pool.query('SELECT id, title, image_url FROM products WHERE slug = $1', [id]);

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const deletedImage = check.rows[0].image_url;
    await pool.query('DELETE FROM products WHERE id = $1', [check.rows[0].id]);

    // Eliminar archivo local asociado si existía
    if (deletedImage) {
      await deleteOldImageFile(deletedImage);
    }

    // Invalidar caché
    cache.invalidate('products');
    cache.invalidate('categories');

    return res.json({
      message: `Producto "${check.rows[0].title}" eliminado correctamente del catálogo.`
    });
  } catch (error: any) {
    console.error('Error en deleteProduct:', error);
    return res.status(500).json({ error: 'Error al eliminar el producto de la base de datos.' });
  }
};
