"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchInstagramThumbnail = exports.extractInstagramShortcode = exports.toggleInstagramVideoActive = exports.deleteInstagramVideo = exports.updateInstagramVideo = exports.createInstagramVideo = exports.getInstagramVideoById = exports.getAllInstagramVideosAdmin = exports.getActiveInstagramVideos = exports.seedDefaultInstagramVideos = exports.ensureInstagramTable = exports.DEFAULT_INSTAGRAM_VIDEOS = void 0;
const database_1 = require("../config/database");
const cache_1 = require("../utils/cache");
const imageProcessor_1 = require("../utils/imageProcessor");
/**
 * Publicaciones y videos de Instagram por defecto (respaldo de contingencia)
 */
exports.DEFAULT_INSTAGRAM_VIDEOS = [
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
        title: 'Recorrido por nuestro local oficial en Posadas • Av. López y Planes casi Lavalle (adentro del ACUARIUM), Posadas, Misiones',
        post_url: 'https://www.instagram.com/culti.shopp/',
        thumbnail_url: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=800',
        order_index: 4,
        is_active: true
    }
];
/**
 * Garantiza que la tabla instagram_videos exista en la base de datos
 */
const ensureInstagramTable = async () => {
    await database_1.pool.query(`
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
exports.ensureInstagramTable = ensureInstagramTable;
/**
 * Siembra los videos iniciales de Instagram si la tabla está vacía y repara miniaturas duplicadas
 */
const seedDefaultInstagramVideos = async () => {
    try {
        await (0, exports.ensureInstagramTable)();
        const countRes = await database_1.pool.query('SELECT COUNT(*) FROM instagram_videos');
        const count = parseInt(countRes.rows[0]?.count || '0', 10);
        if (count === 0) {
            for (const item of exports.DEFAULT_INSTAGRAM_VIDEOS) {
                await database_1.pool.query(`INSERT INTO instagram_videos (title, post_url, thumbnail_url, order_index, is_active)
           VALUES ($1, $2, $3, $4, $5)`, [item.title, item.post_url, item.thumbnail_url, item.order_index, item.is_active]);
            }
        }
        else {
            // Corregir imágenes duplicadas en los videos predeterminados para que cada uno tenga su portada diferenciada
            await database_1.pool.query(`
        UPDATE instagram_videos 
        SET thumbnail_url = 'https://images.unsplash.com/photo-1536939459926-301728717817?auto=format&fit=crop&q=80&w=800'
        WHERE id = 2 AND (thumbnail_url = 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=800' OR thumbnail_url IS NULL);

        UPDATE instagram_videos 
        SET thumbnail_url = 'https://images.unsplash.com/photo-1624990833801-56c1b6a56ba7?auto=format&fit=crop&q=80&w=800'
        WHERE id = 3 AND (thumbnail_url = 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=800' OR thumbnail_url IS NULL);

        UPDATE instagram_videos 
        SET thumbnail_url = 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=800'
        WHERE id = 4 AND (thumbnail_url = 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=800' OR thumbnail_url IS NULL);
      `);
        }
    }
    catch (err) {
        console.warn('Aviso en seedDefaultInstagramVideos:', err?.message || err);
    }
};
exports.seedDefaultInstagramVideos = seedDefaultInstagramVideos;
/**
 * Obtener listado de videos y publicaciones de Instagram activos
 * GET /api/instagram
 */
const getActiveInstagramVideos = async (req, res) => {
    try {
        const includeAll = req.query.all === 'true' || req.query.admin === 'true';
        const cacheKey = includeAll ? 'instagram:admin:all' : 'instagram:public:active';
        if (!includeAll) {
            const cached = cache_1.cache.get(cacheKey);
            if (cached) {
                return res.json(cached);
            }
        }
        let rows = [];
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
            const result = await database_1.pool.query(query);
            rows = result.rows || [];
        }
        catch (queryErr) {
            console.warn('Tabla instagram_videos no disponible, asegurando esquema:', queryErr?.message);
            await (0, exports.seedDefaultInstagramVideos)();
            const retryRes = await database_1.pool.query(includeAll
                ? `SELECT id, title, post_url, thumbnail_url, order_index, is_active, created_at, updated_at FROM instagram_videos ORDER BY order_index ASC, id ASC`
                : `SELECT id, title, post_url, thumbnail_url, order_index, is_active FROM instagram_videos WHERE is_active = true ORDER BY order_index ASC, id ASC`);
            rows = retryRes.rows || [];
        }
        if (rows.length === 0) {
            await (0, exports.seedDefaultInstagramVideos)();
            const retryRes = await database_1.pool.query(includeAll
                ? `SELECT id, title, post_url, thumbnail_url, order_index, is_active, created_at, updated_at FROM instagram_videos ORDER BY order_index ASC, id ASC`
                : `SELECT id, title, post_url, thumbnail_url, order_index, is_active FROM instagram_videos WHERE is_active = true ORDER BY order_index ASC, id ASC`);
            rows = retryRes.rows && retryRes.rows.length > 0 ? retryRes.rows : exports.DEFAULT_INSTAGRAM_VIDEOS;
        }
        const responseData = {
            videos: rows,
            data: rows
        };
        if (!includeAll) {
            cache_1.cache.set(cacheKey, responseData, 300);
        }
        return res.json(responseData);
    }
    catch (error) {
        console.error('Recuperando de error en getActiveInstagramVideos (retornando respaldo):', error?.message || error);
        return res.json({
            videos: exports.DEFAULT_INSTAGRAM_VIDEOS,
            data: exports.DEFAULT_INSTAGRAM_VIDEOS,
            fallback: true
        });
    }
};
exports.getActiveInstagramVideos = getActiveInstagramVideos;
/**
 * Obtener todos los videos de Instagram para administración
 * GET /api/instagram/admin/all
 */
const getAllInstagramVideosAdmin = async (req, res) => {
    try {
        let rows = [];
        try {
            const result = await database_1.pool.query(`
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
        }
        catch (queryErr) {
            console.warn('Tabla instagram_videos no disponible en admin, asegurando esquema:', queryErr?.message);
            await (0, exports.seedDefaultInstagramVideos)();
            const retryRes = await database_1.pool.query(`
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
            await (0, exports.seedDefaultInstagramVideos)();
            const retryRes = await database_1.pool.query(`
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
            rows = retryRes.rows && retryRes.rows.length > 0 ? retryRes.rows : exports.DEFAULT_INSTAGRAM_VIDEOS;
        }
        return res.json({
            videos: rows,
            data: rows
        });
    }
    catch (error) {
        console.error('Error en getAllInstagramVideosAdmin (retornando respaldo):', error?.message || error);
        return res.json({
            videos: exports.DEFAULT_INSTAGRAM_VIDEOS,
            data: exports.DEFAULT_INSTAGRAM_VIDEOS,
            fallback: true
        });
    }
};
exports.getAllInstagramVideosAdmin = getAllInstagramVideosAdmin;
/**
 * Obtener video individual por ID
 * GET /api/instagram/:id
 */
const getInstagramVideoById = async (req, res) => {
    try {
        const { id } = req.params;
        const parsedId = parseInt(id, 10);
        let result;
        try {
            result = await database_1.pool.query('SELECT id, title, post_url, thumbnail_url, order_index, is_active, created_at, updated_at FROM instagram_videos WHERE id = $1', [parsedId]);
        }
        catch (err) {
            await (0, exports.ensureInstagramTable)();
            result = await database_1.pool.query('SELECT id, title, post_url, thumbnail_url, order_index, is_active, created_at, updated_at FROM instagram_videos WHERE id = $1', [parsedId]);
        }
        if (!result || result.rows.length === 0) {
            const fallbackItem = exports.DEFAULT_INSTAGRAM_VIDEOS.find(v => v.id === parsedId);
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
    }
    catch (error) {
        console.error('Error en getInstagramVideoById:', error);
        return res.status(500).json({ error: 'Error al obtener el video de Instagram.' });
    }
};
exports.getInstagramVideoById = getInstagramVideoById;
/**
 * Crear nueva publicación/video de Instagram (Solo Admin)
 * POST /api/instagram
 */
const createInstagramVideo = async (req, res) => {
    try {
        await (0, exports.ensureInstagramTable)();
        const { title, post_url, thumbnail_url, order_index, is_active } = req.body;
        if (!post_url || !String(post_url).trim()) {
            return res.status(400).json({ error: 'El enlace (URL) de Instagram es obligatorio.' });
        }
        let parsedOrder = 0;
        if (order_index !== undefined && order_index !== null && order_index !== '') {
            parsedOrder = parseInt(String(order_index), 10) || 0;
        }
        else {
            const maxOrderRes = await database_1.pool.query('SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM instagram_videos');
            parsedOrder = maxOrderRes.rows[0]?.next_order || 1;
        }
        const finalIsActive = is_active !== undefined ? Boolean(is_active) : true;
        const processedThumbnail = await (0, imageProcessor_1.processAnyImageInput)(thumbnail_url, 'reel', 85);
        const finalThumbnail = processedThumbnail && String(processedThumbnail).trim() ? String(processedThumbnail).trim() : null;
        const finalTitle = title && String(title).trim() ? String(title).trim() : 'Video CultiShop @culti.shopp';
        const result = await database_1.pool.query(`
      INSERT INTO instagram_videos (
        title,
        post_url,
        thumbnail_url,
        order_index,
        is_active
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, title, post_url, thumbnail_url, order_index, is_active, created_at, updated_at
      `, [
            finalTitle,
            String(post_url).trim(),
            finalThumbnail,
            parsedOrder,
            finalIsActive
        ]);
        // Invalidar caché
        cache_1.cache.invalidate('instagram');
        cache_1.cache.invalidate('institutional');
        return res.status(201).json({
            message: 'Video de Instagram registrado exitosamente.',
            video: result.rows[0],
            data: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error en createInstagramVideo:', error);
        return res.status(500).json({ error: 'Error al registrar video de Instagram.' });
    }
};
exports.createInstagramVideo = createInstagramVideo;
/**
 * Modificar publicación/video de Instagram existente (Solo Admin)
 * PUT /api/instagram/:id
 */
const updateInstagramVideo = async (req, res) => {
    try {
        await (0, exports.ensureInstagramTable)();
        const { id } = req.params;
        const videoId = parseInt(id, 10);
        const existing = await database_1.pool.query('SELECT id, title, post_url, thumbnail_url, order_index, is_active FROM instagram_videos WHERE id = $1', [videoId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Video de Instagram no encontrado.' });
        }
        const current = existing.rows[0];
        const { title, post_url, thumbnail_url, order_index, is_active } = req.body;
        const finalTitle = title !== undefined ? String(title).trim() : current.title;
        const finalPostUrl = post_url !== undefined ? String(post_url).trim() : current.post_url;
        let finalThumbnail = current.thumbnail_url;
        if (thumbnail_url !== undefined) {
            if (!thumbnail_url || !String(thumbnail_url).trim()) {
                finalThumbnail = null;
                if (current.thumbnail_url) {
                    await (0, imageProcessor_1.deleteOldImageFile)(current.thumbnail_url);
                }
            }
            else if (thumbnail_url !== current.thumbnail_url) {
                finalThumbnail = await (0, imageProcessor_1.processAnyImageInput)(thumbnail_url, 'reel', 85);
                if (current.thumbnail_url && current.thumbnail_url !== finalThumbnail) {
                    await (0, imageProcessor_1.deleteOldImageFile)(current.thumbnail_url);
                }
            }
        }
        const finalOrder = order_index !== undefined ? (parseInt(String(order_index), 10) || 0) : current.order_index;
        const finalIsActive = is_active !== undefined ? Boolean(is_active) : current.is_active;
        if (!finalPostUrl) {
            return res.status(400).json({ error: 'El enlace de la publicación no puede estar vacío.' });
        }
        const result = await database_1.pool.query(`
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
      `, [
            finalTitle || 'Video CultiShop @culti.shopp',
            finalPostUrl,
            finalThumbnail,
            finalOrder,
            finalIsActive,
            videoId
        ]);
        // Invalidar caché
        cache_1.cache.invalidate('instagram');
        cache_1.cache.invalidate('institutional');
        return res.json({
            message: 'Video de Instagram actualizado exitosamente.',
            video: result.rows[0],
            data: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error en updateInstagramVideo:', error);
        return res.status(500).json({ error: 'Error al actualizar video de Instagram.' });
    }
};
exports.updateInstagramVideo = updateInstagramVideo;
/**
 * Eliminar video de Instagram (Solo Admin)
 * DELETE /api/instagram/:id
 */
const deleteInstagramVideo = async (req, res) => {
    try {
        await (0, exports.ensureInstagramTable)();
        const { id } = req.params;
        const videoId = parseInt(id, 10);
        const result = await database_1.pool.query('DELETE FROM instagram_videos WHERE id = $1 RETURNING id, title, thumbnail_url', [videoId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Video de Instagram no encontrado para eliminar.' });
        }
        if (result.rows[0].thumbnail_url) {
            await (0, imageProcessor_1.deleteOldImageFile)(result.rows[0].thumbnail_url);
        }
        // Invalidar caché
        cache_1.cache.invalidate('instagram');
        cache_1.cache.invalidate('institutional');
        return res.json({
            message: `Publicación "${result.rows[0].title}" eliminada correctamente.`,
            id: result.rows[0].id
        });
    }
    catch (error) {
        console.error('Error en deleteInstagramVideo:', error);
        return res.status(500).json({ error: 'Error al eliminar el video de Instagram.' });
    }
};
exports.deleteInstagramVideo = deleteInstagramVideo;
/**
 * Alternar visibilidad de un video de Instagram (Solo Admin)
 * PATCH /api/instagram/:id/toggle
 */
const toggleInstagramVideoActive = async (req, res) => {
    try {
        await (0, exports.ensureInstagramTable)();
        const { id } = req.params;
        const videoId = parseInt(id, 10);
        const result = await database_1.pool.query(`
      UPDATE instagram_videos
      SET is_active = NOT is_active,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, title, is_active
      `, [videoId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Video de Instagram no encontrado.' });
        }
        // Invalidar caché
        cache_1.cache.invalidate('instagram');
        cache_1.cache.invalidate('institutional');
        const stateText = result.rows[0].is_active ? 'visible en galería' : 'oculto';
        return res.json({
            message: `Video "${result.rows[0].title}" ahora está ${stateText}.`,
            video: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error en toggleInstagramVideoActive:', error);
        return res.status(500).json({ error: 'Error al alternar estado del video de Instagram.' });
    }
};
exports.toggleInstagramVideoActive = toggleInstagramVideoActive;
/**
 * Helper para extraer el shortcode de una URL de Instagram
 */
const extractInstagramShortcode = (url) => {
    if (!url)
        return null;
    const cleaned = url.trim();
    const match = cleaned.match(/(?:instagram\.com|instagr\.am)\/(?:[a-zA-Z0-9._-]+\/)?(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i)
        || cleaned.match(/(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
    return match ? match[1] : null;
};
exports.extractInstagramShortcode = extractInstagramShortcode;
/**
 * Obtener miniatura y título de forma automática desde Instagram
 * GET/POST /api/instagram/fetch-thumbnail
 */
const fetchInstagramThumbnail = async (req, res) => {
    try {
        const rawUrl = req.query.url || req.body?.url;
        if (!rawUrl || !rawUrl.trim()) {
            return res.status(400).json({ error: 'La URL de Instagram es obligatoria.' });
        }
        const shortcode = (0, exports.extractInstagramShortcode)(rawUrl);
        if (!shortcode) {
            return res.status(400).json({
                error: 'No se pudo identificar el código de publicación o Reel en el enlace proporcionado. Asegúrate de que sea un enlace del tipo https://www.instagram.com/reel/C... o /p/C...'
            });
        }
        let thumbnailUrl = null;
        let title = null;
        // 1. Intentar consultar la página oficial de embed de Instagram (sin muro de login)
        try {
            const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
            const embedRes = await fetch(embedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
                }
            });
            if (embedRes.ok) {
                const html = await embedRes.text();
                // Buscar imagen EmbeddedMediaImage o display_url
                const imgMatch = html.match(/class=["']EmbeddedMediaImage["'][^>]*src=["']([^"']+)["']/i)
                    || html.match(/<img[^>]*class=["'][^"']*EmbeddedMediaImage[^"']*["'][^>]*src=["']([^"']+)["']/i)
                    || html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
                    || html.match(/"display_url"\s*:\s*"([^"]+)"/i)
                    || html.match(/"thumbnail_src"\s*:\s*"([^"]+)"/i);
                if (imgMatch && imgMatch[1]) {
                    thumbnailUrl = imgMatch[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
                }
                // Buscar título o descripción del caption
                const captionMatch = html.match(/class=["']Caption["'][^>]*>([^<]+)</i)
                    || html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
                if (captionMatch && captionMatch[1]) {
                    title = captionMatch[1].trim();
                }
            }
        }
        catch (embedErr) {
            console.warn('Fallo consulta embed de Instagram:', embedErr);
        }
        // 2. Si no se obtuvo con embed, intentar con User-Agent de crawler de redes sociales (OpenGraph)
        if (!thumbnailUrl) {
            try {
                const postUrl = `https://www.instagram.com/p/${shortcode}/`;
                const crawlerRes = await fetch(postUrl, {
                    headers: {
                        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                if (crawlerRes.ok) {
                    const html = await crawlerRes.text();
                    const ogImgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
                        || html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
                    if (ogImgMatch && ogImgMatch[1]) {
                        thumbnailUrl = ogImgMatch[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
                    }
                    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
                    if (ogTitleMatch && ogTitleMatch[1]) {
                        title = title || ogTitleMatch[1].trim();
                    }
                }
            }
            catch (crawlerErr) {
                console.warn('Fallo consulta crawler OpenGraph Instagram:', crawlerErr);
            }
        }
        if (thumbnailUrl) {
            return res.json({
                success: true,
                shortcode,
                thumbnail_url: thumbnailUrl,
                title: title || undefined
            });
        }
        // Si Instagram bloquea la consulta externa o el reel es privado
        return res.json({
            success: false,
            shortcode,
            message: 'No fue posible obtener la miniatura automáticamente de Instagram debido a protecciones de privacidad del contenido. Puedes subir una imagen o ingresar la URL de la portada manualmente.'
        });
    }
    catch (error) {
        console.error('Error en fetchInstagramThumbnail:', error);
        return res.status(500).json({ error: 'Error al procesar el enlace de Instagram.' });
    }
};
exports.fetchInstagramThumbnail = fetchInstagramThumbnail;
