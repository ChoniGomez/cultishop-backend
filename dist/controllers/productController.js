"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProduct = exports.updateProduct = exports.createProduct = exports.getProductById = exports.getProducts = void 0;
const database_1 = require("../config/database");
// Helper para convertir título a slug amigable para URLs
const slugify = (text) => {
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
const parseJsonField = (val, fallback = null) => {
    if (val === null || val === undefined)
        return fallback;
    if (typeof val === 'object')
        return val;
    try {
        return JSON.parse(val);
    }
    catch {
        return fallback;
    }
};
// Helper para normalizar listas de texto (viñetas, pasos, opciones)
const normalizeStringArray = (val) => {
    if (!val)
        return [];
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
        }
        catch { }
        // Si viene como texto separado por saltos de línea
        return val
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
    }
    return [];
};
// Helper común para formatear la fila del producto
const formatProductRow = (row) => {
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
    }
    const defaultStock = typeof row.stock === 'number' ? row.stock : parseInt(row.stock, 10) || 10;
    const defaultPrice = typeof row.price === 'number' ? row.price : parseFloat(row.price) || 0;
    const rawOptions = Array.isArray(row.options) ? row.options : parseJsonField(row.options, ['Estándar']);
    const formattedOptions = Array.isArray(rawOptions) ? rawOptions.map((opt) => {
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
    return {
        ...row,
        price: defaultPrice,
        image: row.image_url,
        category: categoryName || 'Varios',
        category_slug: categorySlug || '',
        category_id: categoryId || null,
        subcategory: subcategoryName || null,
        subcategory_slug: subcategorySlug || null,
        subcategory_id: subcategoryId || null,
        options: formattedOptions,
        key_benefits: Array.isArray(row.key_benefits) ? row.key_benefits : parseJsonField(row.key_benefits, []),
        application_guide: Array.isArray(row.application_guide) ? row.application_guide : parseJsonField(row.application_guide, []),
        cannabis_specs: parseJsonField(row.cannabis_specs, null),
        details: parseJsonField(row.details, null)
    };
};
const SELECT_PRODUCT_FIELDS = `
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
    p.created_at,
    p.updated_at
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN categories pcat ON c.parent_id = pcat.id
  LEFT JOIN categories sub ON p.subcategory_id = sub.id
`;
/**
 * Obtener todos los productos (catálogo completo)
 */
const getProducts = async (req, res) => {
    try {
        const result = await database_1.pool.query(`
      ${SELECT_PRODUCT_FIELDS}
      ORDER BY p.id ASC
    `);
        const products = result.rows.map(formatProductRow);
        return res.json({ products });
    }
    catch (error) {
        console.error('Error en getProducts:', error);
        return res.status(500).json({ error: 'Error al obtener productos de la base de datos.' });
    }
};
exports.getProducts = getProducts;
/**
 * Obtener producto por ID o slug
 */
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const isNumeric = /^\d+$/.test(id);
        const param = isNumeric ? parseInt(id, 10) : id;
        const query = isNumeric
            ? `${SELECT_PRODUCT_FIELDS} WHERE p.id = $1`
            : `${SELECT_PRODUCT_FIELDS} WHERE p.slug = $1`;
        const result = await database_1.pool.query(query, [param]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado.' });
        }
        const product = formatProductRow(result.rows[0]);
        return res.json({ product });
    }
    catch (error) {
        console.error('Error en getProductById:', error);
        return res.status(500).json({ error: 'Error al consultar producto.' });
    }
};
exports.getProductById = getProductById;
/**
 * Helper para resolver categoría y subcategoría desde datos recibidos
 */
const resolveCategories = async (category_id, category, subcategory_id, subcategory) => {
    let resolvedCatId = null;
    let resolvedSubcatId = null;
    // 1. Resolver Categoría Principal
    if (category_id && !isNaN(Number(category_id))) {
        resolvedCatId = parseInt(category_id, 10);
    }
    else if (category) {
        const catCheck = await database_1.pool.query(`SELECT id FROM categories WHERE (LOWER(name) = $1 OR LOWER(slug) = $1) AND parent_id IS NULL LIMIT 1`, [category.toString().trim().toLowerCase()]);
        if (catCheck.rows.length > 0) {
            resolvedCatId = catCheck.rows[0].id;
        }
        else {
            // Búsqueda general
            const generalCheck = await database_1.pool.query(`SELECT id FROM categories WHERE LOWER(name) = $1 OR LOWER(slug) = $1 LIMIT 1`, [category.toString().trim().toLowerCase()]);
            if (generalCheck.rows.length > 0) {
                resolvedCatId = generalCheck.rows[0].id;
            }
        }
    }
    // 2. Resolver Subcategoría
    if (subcategory_id && !isNaN(Number(subcategory_id))) {
        resolvedSubcatId = parseInt(subcategory_id, 10);
    }
    else if (subcategory && subcategory.toString().trim() !== '') {
        const subCheck = resolvedCatId
            ? await database_1.pool.query(`SELECT id FROM categories WHERE (LOWER(name) = $1 OR LOWER(slug) = $1) AND parent_id = $2 LIMIT 1`, [subcategory.toString().trim().toLowerCase(), resolvedCatId])
            : await database_1.pool.query(`SELECT id FROM categories WHERE (LOWER(name) = $1 OR LOWER(slug) = $1) AND parent_id IS NOT NULL LIMIT 1`, [subcategory.toString().trim().toLowerCase()]);
        if (subCheck.rows.length > 0) {
            resolvedSubcatId = subCheck.rows[0].id;
        }
    }
    return { resolvedCatId, resolvedSubcatId };
};
/**
 * Crear nuevo producto (Solo Admin)
 */
const createProduct = async (req, res) => {
    try {
        const { title, description, price, discount_price, stock = 10, image_url, image, category, category_id, subcategory, subcategory_id, badge = 'STOCK DISPONIBLE', badge_type = 'gold', options = ['Estándar'], brand, origin, format, cultivation_stage, dosage, ph_recommended, ec_recommended, suitable_for, key_benefits, application_guide, cannabis_specs, shipping_info, details } = req.body;
        if (!title || price === undefined || price === null) {
            return res.status(400).json({ error: 'Título y precio son obligatorios.' });
        }
        const finalImage = image_url || image || 'https://images.unsplash.com/photo-1603909223429-69bb7101f420?auto=format&fit=crop&q=80&w=600';
        let numPrice = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.-]/g, '')) || 0 : Number(price);
        const numDiscount = discount_price !== undefined ? Number(discount_price) : null;
        let numStock = parseInt(stock, 10) || 0;
        // Normalizar opciones con precio y stock independiente
        let normalizedOptions = [];
        if (Array.isArray(options) && options.length > 0) {
            normalizedOptions = options.map((o) => {
                if (typeof o === 'object' && o !== null) {
                    const optName = String(o.name || o.title || 'Estándar').trim();
                    const optPrice = typeof o.price === 'string' ? parseFloat(o.price.replace(/[^0-9.-]/g, '')) || 0 : Number(o.price) || 0;
                    const optStock = o.stock !== undefined && o.stock !== null && o.stock !== ''
                        ? Math.max(0, parseInt(String(o.stock), 10) || 0)
                        : numStock;
                    return { name: optName, price: optPrice, stock: optStock };
                }
                return { name: String(o).trim(), price: numPrice, stock: numStock };
            }).filter((o) => o.name.length > 0);
        }
        if (normalizedOptions.length === 0) {
            normalizedOptions = [{ name: 'Estándar', price: numPrice, stock: numStock }];
        }
        const optionPrices = normalizedOptions
            .map((o) => o.price)
            .filter((p) => !isNaN(p) && p > 0);
        if (optionPrices.length > 0 && (!numPrice || numPrice === 0)) {
            numPrice = Math.min(...optionPrices);
        }
        const totalVariantStock = normalizedOptions.reduce((acc, curr) => acc + (curr.stock || 0), 0);
        if (normalizedOptions.length > 1) {
            numStock = totalVariantStock;
        }
        let finalBadge = badge !== undefined && badge !== null ? String(badge).trim() : 'STOCK DISPONIBLE';
        if (finalBadge === 'none' || (finalBadge && finalBadge.toLowerCase() === 'sin etiqueta') || finalBadge === '') {
            finalBadge = null;
        }
        let finalBadgeType = badge_type || 'gold';
        if (numStock <= 0) {
            finalBadge = 'SIN STOCK';
            finalBadgeType = 'red';
        }
        // Resolver categorías
        const { resolvedCatId, resolvedSubcatId } = await resolveCategories(category_id, category, subcategory_id, subcategory);
        // Generar slug único
        let baseSlug = slugify(title);
        let finalSlug = baseSlug;
        let counter = 1;
        while (true) {
            const slugCheck = await database_1.pool.query('SELECT id FROM products WHERE slug = $1', [finalSlug]);
            if (slugCheck.rows.length === 0)
                break;
            finalSlug = `${baseSlug}-${counter++}`;
        }
        const optionsJson = JSON.stringify(normalizedOptions);
        const benefitsArray = normalizeStringArray(key_benefits);
        const guideArray = normalizeStringArray(application_guide);
        const specsJson = cannabis_specs ? JSON.stringify(cannabis_specs) : null;
        const detailsJson = details ? JSON.stringify(details) : null;
        const insertResult = await database_1.pool.query(`
      INSERT INTO products (
        title, slug, description, price, discount_price, stock, image_url, 
        badge, badge_type, options, category_id, subcategory_id, is_active,
        brand, origin, format, cultivation_stage, dosage, ph_recommended, ec_recommended,
        suitable_for, key_benefits, application_guide, cannabis_specs, shipping_info, details
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 
        $8, $9, $10, $11, $12, true,
        $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25
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
        const fetchNew = await database_1.pool.query(`${SELECT_PRODUCT_FIELDS} WHERE p.id = $1`, [newId]);
        const createdProduct = formatProductRow(fetchNew.rows[0]);
        return res.status(201).json({
            message: 'Producto creado exitosamente.',
            product: createdProduct
        });
    }
    catch (error) {
        console.error('Error en createProduct:', error);
        return res.status(500).json({ error: error.message || 'Error al crear el producto.' });
    }
};
exports.createProduct = createProduct;
/**
 * Modificar/Actualizar producto existente (Solo Admin)
 */
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, price, discount_price, stock, image_url, image, category, category_id, subcategory, subcategory_id, badge, badge_type, options, brand, origin, format, cultivation_stage, dosage, ph_recommended, ec_recommended, suitable_for, key_benefits, application_guide, cannabis_specs, shipping_info, details, is_active } = req.body;
        const isNumeric = /^\d+$/.test(id);
        const existingCheck = isNumeric
            ? await database_1.pool.query('SELECT * FROM products WHERE id = $1', [parseInt(id, 10)])
            : await database_1.pool.query('SELECT * FROM products WHERE slug = $1', [id]);
        if (existingCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado.' });
        }
        const current = existingCheck.rows[0];
        const targetId = current.id;
        // Resolver categorías
        const { resolvedCatId, resolvedSubcatId } = await resolveCategories(category_id !== undefined ? category_id : current.category_id, category, subcategory_id !== undefined ? subcategory_id : current.subcategory_id, subcategory);
        const finalTitle = title !== undefined ? title.trim() : current.title;
        const finalDescription = description !== undefined ? description : current.description;
        let finalPrice = price !== undefined ? (typeof price === 'string' ? parseFloat(price.replace(/[^0-9.-]/g, '')) || 0 : Number(price)) : current.price;
        const finalDiscount = discount_price !== undefined ? Number(discount_price) : current.discount_price;
        let finalStock = stock !== undefined ? parseInt(stock, 10) : current.stock;
        if (isNaN(finalStock))
            finalStock = 0;
        const finalImage = (image_url || image) !== undefined ? (image_url || image) : current.image_url;
        let finalBadge = badge !== undefined ? (badge !== null ? String(badge).trim() : null) : current.badge;
        if (finalBadge === 'none' || (finalBadge && finalBadge.toLowerCase() === 'sin etiqueta') || finalBadge === '') {
            finalBadge = null;
        }
        let finalBadgeType = badge_type !== undefined ? badge_type : current.badge_type;
        const finalIsActive = is_active !== undefined ? is_active : current.is_active;
        let finalOptionsJson = current.options;
        if (options !== undefined) {
            let normalizedOptions = [];
            if (Array.isArray(options) && options.length > 0) {
                normalizedOptions = options.map((o) => {
                    if (typeof o === 'object' && o !== null) {
                        const optName = String(o.name || o.title || 'Estándar').trim();
                        const optPrice = typeof o.price === 'string' ? parseFloat(o.price.replace(/[^0-9.-]/g, '')) || 0 : Number(o.price) || 0;
                        const optStock = o.stock !== undefined && o.stock !== null && o.stock !== ''
                            ? Math.max(0, parseInt(String(o.stock), 10) || 0)
                            : finalStock;
                        return { name: optName, price: optPrice, stock: optStock };
                    }
                    return { name: String(o).trim(), price: finalPrice, stock: finalStock };
                }).filter((o) => o.name.length > 0);
            }
            if (normalizedOptions.length > 0) {
                const optionPrices = normalizedOptions
                    .map((o) => o.price)
                    .filter((p) => !isNaN(p) && p > 0);
                if (optionPrices.length > 0 && (!finalPrice || finalPrice === 0)) {
                    finalPrice = Math.min(...optionPrices);
                }
                const totalVariantStock = normalizedOptions.reduce((acc, curr) => acc + (curr.stock || 0), 0);
                if (normalizedOptions.length > 1) {
                    finalStock = totalVariantStock;
                }
                finalOptionsJson = JSON.stringify(normalizedOptions);
            }
            else {
                finalOptionsJson = JSON.stringify([{ name: 'Estándar', price: finalPrice, stock: finalStock }]);
            }
        }
        if (finalStock <= 0) {
            finalBadge = 'SIN STOCK';
            finalBadgeType = 'red';
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
        await database_1.pool.query(`
      UPDATE products SET
        title = $1,
        description = $2,
        price = $3,
        discount_price = $4,
        stock = $5,
        image_url = $6,
        badge = $7,
        badge_type = $8,
        options = $9,
        category_id = $10,
        subcategory_id = $11,
        brand = $12,
        origin = $13,
        format = $14,
        cultivation_stage = $15,
        dosage = $16,
        ph_recommended = $17,
        ec_recommended = $18,
        suitable_for = $19,
        key_benefits = $20,
        application_guide = $21,
        cannabis_specs = $22,
        shipping_info = $23,
        details = $24,
        is_active = $25,
        updated_at = NOW()
      WHERE id = $26
    `, [
            finalTitle,
            finalDescription,
            finalPrice,
            finalDiscount,
            finalStock,
            finalImage,
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
        const fetchUpdated = await database_1.pool.query(`${SELECT_PRODUCT_FIELDS} WHERE p.id = $1`, [targetId]);
        const updatedProduct = formatProductRow(fetchUpdated.rows[0]);
        return res.json({
            message: 'Producto actualizado con éxito.',
            product: updatedProduct
        });
    }
    catch (error) {
        console.error('Error en updateProduct:', error);
        return res.status(500).json({ error: error.message || 'Error al actualizar el producto.' });
    }
};
exports.updateProduct = updateProduct;
/**
 * Eliminar producto del catálogo (Solo Admin)
 */
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const isNumeric = /^\d+$/.test(id);
        const check = isNumeric
            ? await database_1.pool.query('SELECT id, title FROM products WHERE id = $1', [parseInt(id, 10)])
            : await database_1.pool.query('SELECT id, title FROM products WHERE slug = $1', [id]);
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado.' });
        }
        await database_1.pool.query('DELETE FROM products WHERE id = $1', [check.rows[0].id]);
        return res.json({
            message: `Producto "${check.rows[0].title}" eliminado correctamente del catálogo.`
        });
    }
    catch (error) {
        console.error('Error en deleteProduct:', error);
        return res.status(500).json({ error: 'Error al eliminar el producto de la base de datos.' });
    }
};
exports.deleteProduct = deleteProduct;
