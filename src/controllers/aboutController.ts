import { Request, Response } from 'express';
import { pool } from '../config/database';
import { cache } from '../utils/cache';
import { ensureInstagramTable, DEFAULT_INSTAGRAM_VIDEOS } from './instagramController';
import { DEFAULT_LOCATION_SETTINGS } from './settingsController';

/**
 * Bloques institucionales por defecto de CultiShop (respaldo de contingencia)
 */
export const DEFAULT_ABOUT_SECTIONS = [
  {
    id: 1,
    title: 'Nuestra Historia & Pasión por el Cultivo',
    subtitle: 'Desde Posadas hacia toda la provincia y región',
    content: 'CultiShop nació con una misión clara: brindar a la comunidad de cultivadores insumos de máxima pureza, asesoramiento técnico genuino y soluciones reales adaptadas a nuestro clima subtropical. Creemos en el autocultivo consciente, responsable y medicinal, promoviendo cosechas de calidad superior con el respaldo de las mejores marcas del mercado nacional e internacional.',
    image_url: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=1200',
    order_index: 1,
    is_active: true
  },
  {
    id: 2,
    title: 'Asesoramiento Técnico & Cercanía',
    subtitle: 'Acompañamiento en cada etapa de tu ciclo',
    content: 'Ya sea que estés dando tus primeros pasos con tu primera planta o gestionando salas indoor automatizadas de alta exigencia, te acompañamos en cada fase: germinación, vegetativo, floración y curado. En nuestro local físico en Av. López y Planes casi Lavalle ("adentro del ACUARIUM") y en nuestros canales digitales encontrás respuestas claras, tablas de nutrición y diagnóstico preventivo de plagas.',
    image_url: 'https://images.unsplash.com/photo-1536939459926-301728717817?auto=format&fit=crop&q=80&w=1200',
    order_index: 2,
    is_active: true
  },
  {
    id: 3,
    title: 'Compromiso con la Calidad y la Ley 27.350',
    subtitle: 'Insumos certificados para cultivo medicinal',
    content: 'Trabajamos exclusivamente con líneas oficiales y certificadas como Namasté Nutrientes, Sanidad Vegetal Mamboretá, Treemix, Mad Grow y Top Crop. Apoyamos y fomentamos el marco regulatorio del Reprocann (Ley 27.350), garantizando que cuentes con sustratos libres de patógenos, fertilizantes de grado agronómico y equipamiento de medición de precisión.',
    image_url: 'https://images.unsplash.com/photo-1603909223429-69bb7101f420?auto=format&fit=crop&q=80&w=1200',
    order_index: 3,
    is_active: true
  }
];

/**
 * Garantiza que la tabla about_sections exista en Neon DB
 */
export const ensureAboutTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS about_sections (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      subtitle VARCHAR(255),
      content TEXT NOT NULL,
      image_url TEXT,
      order_index INT DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

/**
 * Siembra los bloques institucionales por defecto si la tabla está vacía
 */
export const seedDefaultAboutSections = async () => {
  try {
    await ensureAboutTable();
    const countRes = await pool.query('SELECT COUNT(*) FROM about_sections');
    const count = parseInt(countRes.rows[0]?.count || '0', 10);
    if (count === 0) {
      for (const item of DEFAULT_ABOUT_SECTIONS) {
        await pool.query(
          `INSERT INTO about_sections (title, subtitle, content, image_url, order_index, is_active)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [item.title, item.subtitle, item.content, item.image_url, item.order_index, item.is_active]
        );
      }
    }
  } catch (err: any) {
    console.warn('Aviso en seedDefaultAboutSections:', err?.message || err);
  }
};

/**
 * Endpoint Consolidado Institucional (Sobre Nosotros + Instagram + FAQ + Ubicación)
 * Reduce 3-4 peticiones HTTP y consultas de base de datos a una sola llamada ultrarrápida
 * GET /api/about/bundle
 */
export const getInstitutionalBundle = async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'institutional:bundle';
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    await Promise.all([
      ensureAboutTable(),
      ensureInstagramTable()
    ]);

    // Ejecutar consultas seleccionando estrictamente las columnas necesarias
    const [aboutRes, instaRes, faqRes, locRes] = await Promise.all([
      pool.query(`
        SELECT id, title, subtitle, content, image_url, order_index
        FROM about_sections
        WHERE is_active = true
        ORDER BY order_index ASC, id ASC
      `),
      pool.query(`
        SELECT id, title, post_url, thumbnail_url, order_index
        FROM instagram_videos
        WHERE is_active = true
        ORDER BY order_index ASC, id ASC
      `),
      pool.query(`
        SELECT id, question, answer, category, order_index
        FROM faqs
        WHERE is_active = true
        ORDER BY order_index ASC, id ASC
      `),
      pool.query(`
        SELECT value FROM settings WHERE key = 'location' LIMIT 1
      `)
    ]);

    const about = aboutRes.rows && aboutRes.rows.length > 0 ? aboutRes.rows : DEFAULT_ABOUT_SECTIONS;
    const instagram = instaRes.rows && instaRes.rows.length > 0 ? instaRes.rows : DEFAULT_INSTAGRAM_VIDEOS;
    const faqs = faqRes.rows || [];

    let location = DEFAULT_LOCATION_SETTINGS;
    if (locRes.rows.length > 0) {
      const val = locRes.rows[0].value;
      const parsed = typeof val === 'string' ? JSON.parse(val) : val;
      location = { ...DEFAULT_LOCATION_SETTINGS, ...parsed };
    }

    const bundle = {
      about,
      instagram,
      faqs,
      location
    };

    // Almacenar en caché por 300 segundos (5 minutos)
    cache.set(cacheKey, bundle, 300);

    return res.json(bundle);
  } catch (error: any) {
    console.error('Error en getInstitutionalBundle (retornando respaldo):', error?.message || error);
    return res.json({
      about: DEFAULT_ABOUT_SECTIONS,
      instagram: DEFAULT_INSTAGRAM_VIDEOS,
      faqs: [],
      location: DEFAULT_LOCATION_SETTINGS,
      fallback: true
    });
  }
};

/**
 * Obtener listado de bloques institucionales activos para la vista pública "Sobre Nosotros"
 * GET /api/about
 */
export const getActiveAboutSections = async (req: Request, res: Response) => {
  try {
    const includeAll = req.query.all === 'true' || req.query.admin === 'true';
    const cacheKey = includeAll ? 'about:admin:all' : 'about:public:active';

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
            is_active
          FROM about_sections
          WHERE is_active = true
          ORDER BY order_index ASC, id ASC
        `;

      const result = await pool.query(query);
      rows = result.rows || [];
    } catch (queryErr: any) {
      console.warn('Tabla about_sections no accesible inmediatamente, asegurando esquema:', queryErr?.message);
      await seedDefaultAboutSections();
      const retryRes = await pool.query(
        includeAll
          ? `SELECT id, title, subtitle, content, image_url, order_index, is_active, created_at, updated_at FROM about_sections ORDER BY order_index ASC, id ASC`
          : `SELECT id, title, subtitle, content, image_url, order_index, is_active FROM about_sections WHERE is_active = true ORDER BY order_index ASC, id ASC`
      );
      rows = retryRes.rows || [];
    }

    if (rows.length === 0) {
      await seedDefaultAboutSections();
      const retryRes = await pool.query(
        includeAll
          ? `SELECT id, title, subtitle, content, image_url, order_index, is_active, created_at, updated_at FROM about_sections ORDER BY order_index ASC, id ASC`
          : `SELECT id, title, subtitle, content, image_url, order_index, is_active FROM about_sections WHERE is_active = true ORDER BY order_index ASC, id ASC`
      );
      rows = retryRes.rows && retryRes.rows.length > 0 ? retryRes.rows : DEFAULT_ABOUT_SECTIONS;
    }

    const responseData = {
      sections: rows,
      data: rows
    };

    if (!includeAll) {
      cache.set(cacheKey, responseData, 300);
    }

    return res.json(responseData);
  } catch (error: any) {
    console.error('Recuperando de error en getActiveAboutSections (retornando respaldo):', error?.message || error);
    return res.json({
      sections: DEFAULT_ABOUT_SECTIONS,
      data: DEFAULT_ABOUT_SECTIONS,
      fallback: true
    });
  }
};

/**
 * Obtener todos los bloques (activos e inactivos) para el panel de administración
 * GET /api/about/admin/all
 */
export const getAllAboutSectionsAdmin = async (req: Request, res: Response) => {
  try {
    let rows: any[] = [];
    try {
      const result = await pool.query(`
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
      rows = result.rows || [];
    } catch (queryErr: any) {
      console.warn('Tabla about_sections no accesible en admin, asegurando esquema:', queryErr?.message);
      await seedDefaultAboutSections();
      const retryRes = await pool.query(`
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
      rows = retryRes.rows || [];
    }

    if (rows.length === 0) {
      await seedDefaultAboutSections();
      const retryRes = await pool.query(`
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
      rows = retryRes.rows && retryRes.rows.length > 0 ? retryRes.rows : DEFAULT_ABOUT_SECTIONS;
    }

    return res.json({
      sections: rows,
      data: rows
    });
  } catch (error: any) {
    console.error('Error en getAllAboutSectionsAdmin (retornando respaldo):', error?.message || error);
    return res.json({
      sections: DEFAULT_ABOUT_SECTIONS,
      data: DEFAULT_ABOUT_SECTIONS,
      fallback: true
    });
  }
};

/**
 * Obtener una sección por ID
 * GET /api/about/:id
 */
export const getAboutSectionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);

    let result;
    try {
      result = await pool.query(
        'SELECT id, title, subtitle, content, image_url, order_index, is_active, created_at, updated_at FROM about_sections WHERE id = $1',
        [parsedId]
      );
    } catch (err) {
      await ensureAboutTable();
      result = await pool.query(
        'SELECT id, title, subtitle, content, image_url, order_index, is_active, created_at, updated_at FROM about_sections WHERE id = $1',
        [parsedId]
      );
    }

    if (!result || result.rows.length === 0) {
      const fallbackItem = DEFAULT_ABOUT_SECTIONS.find(s => s.id === parsedId);
      if (fallbackItem) {
        return res.json({
          section: fallbackItem,
          data: fallbackItem
        });
      }
      return res.status(404).json({ error: 'Bloque institucional no encontrado.' });
    }

    return res.json({
      section: result.rows[0],
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en getAboutSectionById:', error);
    return res.status(500).json({ error: 'Error al obtener el bloque institucional.' });
  }
};

/**
 * Crear un nuevo bloque institucional (Solo Admin)
 * POST /api/about
 */
export const createAboutSection = async (req: Request, res: Response) => {
  try {
    await ensureAboutTable();

    const {
      title,
      subtitle,
      content,
      image_url,
      order_index,
      is_active
    } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'El título del bloque es obligatorio.' });
    }

    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'El contenido del bloque es obligatorio.' });
    }

    let parsedOrder = 0;
    if (order_index !== undefined && order_index !== null && order_index !== '') {
      parsedOrder = parseInt(String(order_index), 10) || 0;
    } else {
      const maxOrderRes = await pool.query('SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM about_sections');
      parsedOrder = maxOrderRes.rows[0]?.next_order || 1;
    }

    const finalIsActive = is_active !== undefined ? Boolean(is_active) : true;
    const finalImage = image_url && String(image_url).trim() ? String(image_url).trim() : null;
    const finalSubtitle = subtitle && String(subtitle).trim() ? String(subtitle).trim() : null;

    const result = await pool.query(
      `
      INSERT INTO about_sections (
        title,
        subtitle,
        content,
        image_url,
        order_index,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, title, subtitle, content, image_url, order_index, is_active, created_at, updated_at
      `,
      [
        String(title).trim(),
        finalSubtitle,
        String(content).trim(),
        finalImage,
        parsedOrder,
        finalIsActive
      ]
    );

    // Invalidar caché en memoria
    cache.invalidate('about');
    cache.invalidate('institutional');

    return res.status(201).json({
      message: 'Bloque institucional creado exitosamente.',
      section: result.rows[0],
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en createAboutSection:', error);
    return res.status(500).json({ error: 'Error al crear el bloque institucional.' });
  }
};

/**
 * Modificar bloque institucional existente (Solo Admin)
 * PUT /api/about/:id
 */
export const updateAboutSection = async (req: Request, res: Response) => {
  try {
    await ensureAboutTable();

    const { id } = req.params;
    const sectionId = parseInt(id, 10);

    const existing = await pool.query('SELECT id, title, subtitle, content, image_url, order_index, is_active FROM about_sections WHERE id = $1', [sectionId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Bloque institucional no encontrado.' });
    }

    const current = existing.rows[0];
    const {
      title,
      subtitle,
      content,
      image_url,
      order_index,
      is_active
    } = req.body;

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

    const result = await pool.query(
      `
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
      RETURNING id, title, subtitle, content, image_url, order_index, is_active, created_at, updated_at
      `,
      [
        finalTitle,
        finalSubtitle,
        finalContent,
        finalImage,
        finalOrder,
        finalIsActive,
        sectionId
      ]
    );

    // Invalidar caché en memoria
    cache.invalidate('about');
    cache.invalidate('institutional');

    return res.json({
      message: 'Bloque institucional actualizado exitosamente.',
      section: result.rows[0],
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en updateAboutSection:', error);
    return res.status(500).json({ error: 'Error al actualizar el bloque institucional.' });
  }
};

/**
 * Eliminar bloque institucional (Solo Admin)
 * DELETE /api/about/:id
 */
export const deleteAboutSection = async (req: Request, res: Response) => {
  try {
    await ensureAboutTable();

    const { id } = req.params;
    const sectionId = parseInt(id, 10);

    const result = await pool.query(
      'DELETE FROM about_sections WHERE id = $1 RETURNING id, title',
      [sectionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bloque institucional no encontrado para eliminar.' });
    }

    // Invalidar caché en memoria
    cache.invalidate('about');
    cache.invalidate('institutional');

    return res.json({
      message: `Bloque "${result.rows[0].title}" eliminado correctamente.`,
      id: result.rows[0].id
    });
  } catch (error: any) {
    console.error('Error en deleteAboutSection:', error);
    return res.status(500).json({ error: 'Error al eliminar el bloque institucional.' });
  }
};

/**
 * Alternar visibilidad de un bloque institucional (Solo Admin)
 * PATCH /api/about/:id/toggle
 */
export const toggleAboutSectionActive = async (req: Request, res: Response) => {
  try {
    await ensureAboutTable();

    const { id } = req.params;
    const sectionId = parseInt(id, 10);

    const result = await pool.query(
      `
      UPDATE about_sections
      SET is_active = NOT is_active,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, title, is_active
      `,
      [sectionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bloque institucional no encontrado.' });
    }

    // Invalidar caché en memoria
    cache.invalidate('about');
    cache.invalidate('institutional');

    const stateText = result.rows[0].is_active ? 'publicado' : 'oculto';
    return res.json({
      message: `Bloque "${result.rows[0].title}" ahora está ${stateText}.`,
      section: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error en toggleAboutSectionActive:', error);
    return res.status(500).json({ error: 'Error al alternar estado del bloque institucional.' });
  }
};
