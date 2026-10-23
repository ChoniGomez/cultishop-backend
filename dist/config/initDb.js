"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_DEFAULT_PASSWORD = exports.ADMIN_EMAIL = void 0;
exports.initDb = initDb;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("./database");
exports.ADMIN_EMAIL = 'chonidacharygomez@gmail.com';
exports.ADMIN_DEFAULT_PASSWORD = '15525503pololo';
async function initDb() {
    try {
        // 1. Asegurar rol por defecto consumidor en la tabla users
        await database_1.pool.query(`
      ALTER TABLE users ALTER COLUMN role SET DEFAULT 'consumidor';
      UPDATE users SET role = 'consumidor' WHERE role = 'customer' OR role IS NULL;
    `);
        // 2. Asegurar columnas en orders para checkout y envíos
        await database_1.pool.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(50);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Argentina';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS street_address TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS apartment TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS city VARCHAR(100);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS state VARCHAR(100);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS postal_code VARCHAR(50);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(100);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method VARCHAR(100);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB;

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id) ON DELETE SET NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(12, 2) NOT NULL,
        selected_option VARCHAR(100)
      );
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_option VARCHAR(100);
    `);
        // 3. Asegurar columnas en products (incluyendo subcategorías y pestañas de información detallada)
        await database_1.pool.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS badge VARCHAR(50);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS badge_type VARCHAR(20) DEFAULT 'gold';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS options JSONB;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id INT REFERENCES categories(id) ON DELETE SET NULL;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(255);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS origin VARCHAR(100);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS format VARCHAR(255);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS cultivation_stage VARCHAR(255);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS dosage TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS ph_recommended VARCHAR(50);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS ec_recommended VARCHAR(50);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS suitable_for TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS key_benefits JSONB;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS application_guide JSONB;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS cannabis_specs JSONB;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS shipping_info TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS details JSONB;
      CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON products(subcategory_id);
    `);
        // 3.1 Asegurar tabla de banners publicitarios (Hero Carousel)
        await database_1.pool.query(`
      CREATE TABLE IF NOT EXISTS banners (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        subtitle TEXT,
        image_url TEXT NOT NULL,
        link_url TEXT,
        button_text VARCHAR(100) DEFAULT 'Ver Más',
        display_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        show_text BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE banners ADD COLUMN IF NOT EXISTS show_text BOOLEAN DEFAULT TRUE;
    `);
        // Sembrar banners iniciales si la tabla está vacía
        const bannerCount = await database_1.pool.query('SELECT COUNT(*) FROM banners');
        if (parseInt(bannerCount.rows[0].count, 10) === 0) {
            await database_1.pool.query(`
        INSERT INTO banners (title, subtitle, image_url, link_url, button_text, display_order, is_active) VALUES
        (
          'PROTEGÉ TU CULTIVO CONTRA TODO TIPO DE PLAGAS',
          'Soluciones confiables y sanidad vegetal Mamboretá oficiales (D, CONFI, FOLI, ABA, OIL). Resultados comprobados para mantener tu jardín sano.',
          'https://images.unsplash.com/photo-1536939459926-301728717817?auto=format&fit=crop&q=80&w=1800',
          '/categoria/control-de-plagas',
          'Ver Control de Plagas',
          1,
          true
        ),
        (
          'EXPLOSIÓN DE RESINA, FLORES Y RAÍCES FUERTES',
          'Línea completa Namasté Nutrientes: Oro Negro, Amazonia Micorrizas, Flora Booster y Trico+. Stock permanente para cada etapa de tu cultivo.',
          'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=1800',
          '/categoria/fertilizantes',
          'Ver Fertilizantes',
          2,
          true
        ),
        (
          'VISITANOS EN NUESTRO LOCAL • HORARIOS DE ATENCIÓN',
          'Av. López y Planes 2919 (entre Lavalle y Santa Catalina) • Posadas, Misiones. Vení a conocer todo nuestro catálogo con asesoramiento profesional.',
          'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=1800',
          'https://maps.google.com/?q=Av.+López+y+Planes+2919,+Posadas',
          'Cómo Llegar (Google Maps)',
          3,
          true
        ),
        (
          'CARPAS, MEDICIÓN Y KITS COMPLETOS DE CULTIVO',
          'Tecnología y precisión para tu espacio: carpas indoor, paneles LED de alta eficiencia, instrumentos PH/EC y kits completos.',
          'https://images.unsplash.com/photo-1624990833801-56c1b6a56ba7?auto=format&fit=crop&q=80&w=1800',
          '/categoria/indoor',
          'Explorar Indoor',
          4,
          true
        );
      `);
        }
        // 3.1b Asegurar tabla de configuración de tienda (settings: pagos, alias, datos comerciales)
        await database_1.pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO settings (key, value) VALUES (
        'payment',
        '{"bank_alias": "CULTISHOP.POSADAS", "bank_cbu": "", "bank_name": "Mercado Pago / Billeteras Virtuales", "account_holder": "CultiShop Posadas", "payment_notes": "Al confirmar el pedido podrás enviar el comprobante de transferencia directamente por WhatsApp."}'::jsonb
      ) ON CONFLICT (key) DO NOTHING;
    `);
        // 3.1c Asegurar tabla de bloques institucionales "Sobre Nosotros" (about_sections)
        await database_1.pool.query(`
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
        // Sembrar bloques institucionales si la tabla está vacía
        const aboutCount = await database_1.pool.query('SELECT COUNT(*) FROM about_sections');
        if (parseInt(aboutCount.rows[0].count, 10) === 0) {
            await database_1.pool.query(`
        INSERT INTO about_sections (title, subtitle, content, image_url, order_index, is_active) VALUES
        (
          'Nuestra Historia & Pasión por el Cultivo',
          'Desde Posadas hacia toda la provincia y región',
          'CultiShop nació con una misión clara: brindar a la comunidad de cultivadores insumos de máxima pureza, asesoramiento técnico genuino y soluciones reales adaptadas a nuestro clima. Creemos en el autocultivo consciente, responsable y medicinal, promoviendo cosechas de calidad superior con el respaldo de las mejores marcas del mercado nacional e internacional.',
          'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=1200',
          1,
          true
        ),
        (
          'Asesoramiento Técnico & Cercanía',
          'Acompañamiento en cada etapa de tu ciclo',
          'Ya sea que estés dando tus primeros pasos con tu primera planta o gestionando salas indoor automatizadas de alta exigencia, te acompañamos en cada fase: germinación, vegetativo, floración y curado. En nuestro local físico en Av. López y Planes 2919 y en nuestros canales digitales encontrás respuestas claras, tablas de nutrición y diagnóstico preventivo de plagas.',
          'https://images.unsplash.com/photo-1536939459926-301728717817?auto=format&fit=crop&q=80&w=1200',
          2,
          true
        ),
        (
          'Compromiso con la Calidad y la Ley 27.350',
          'Insumos certificados para cultivo medicinal',
          'Trabajamos exclusivamente con líneas oficiales y certificadas como Namasté Nutrientes, Sanidad Vegetal Mamboretá, Treemix, Mad Grow y Top Crop. Apoyamos y fomentamos el marco regulatorio del Reprocann (Ley 27.350), garantizando que cuentes con sustratos libres de patógenos, fertilizantes de grado agronómico y equipamiento de medición de precisión.',
          'https://images.unsplash.com/photo-1603909223429-69bb7101f420?auto=format&fit=crop&q=80&w=1200',
          3,
          true
        );
      `);
        }
        // 3.1d Asegurar tabla de videos y publicaciones de Instagram (instagram_videos)
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
        // Sembrar videos/publicaciones de Instagram iniciales si la tabla está vacía
        const instaCount = await database_1.pool.query('SELECT COUNT(*) FROM instagram_videos');
        if (parseInt(instaCount.rows[0].count, 10) === 0) {
            await database_1.pool.query(`
        INSERT INTO instagram_videos (title, post_url, thumbnail_url, order_index, is_active) VALUES
        (
          'Guía de Nutrición: Cómo usar Oro Negro y Amazonia de Namasté',
          'https://www.instagram.com/culti.shopp/',
          'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=800',
          1,
          true
        ),
        (
          'Combate definitivo contra trips y arañuela roja con Sanidad Mamboretá',
          'https://www.instagram.com/culti.shopp/',
          'https://images.unsplash.com/photo-1536939459926-301728717817?auto=format&fit=crop&q=80&w=800',
          2,
          true
        ),
        (
          'Montaje de Carpas Indoor e Iluminación LED de Alta Eficiencia',
          'https://www.instagram.com/culti.shopp/',
          'https://images.unsplash.com/photo-1624990833801-56c1b6a56ba7?auto=format&fit=crop&q=80&w=800',
          3,
          true
        ),
        (
          'Recorrido por nuestro local oficial en Posadas • Av. López y Planes 2919',
          'https://www.instagram.com/culti.shopp/',
          'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=800',
          4,
          true
        );
      `);
        }
        // 3.1e Asegurar tabla de Preguntas Frecuentes (faqs)
        await database_1.pool.query(`
      CREATE TABLE IF NOT EXISTS faqs (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        category VARCHAR(100) DEFAULT 'General',
        order_index INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        // Sembrar preguntas frecuentes iniciales si la tabla está vacía
        const faqCount = await database_1.pool.query('SELECT COUNT(*) FROM faqs');
        if (parseInt(faqCount.rows[0].count, 10) === 0) {
            await database_1.pool.query(`
        INSERT INTO faqs (question, answer, category, order_index, is_active) VALUES
        (
          '¿Cómo realizo una compra y cuáles son los medios de pago?',
          'Podés armar tu pedido directamente agregando productos al carrito. Aceptamos transferencias bancarias, Mercado Pago, billeteras virtuales y efectivo en nuestro local. Al confirmar tu pedido podés coordinar el pago y la entrega rápidamente por WhatsApp con nuestro equipo.',
          'Compras & Pagos',
          1,
          true
        ),
        (
          '¿Hacen envíos en Posadas y al interior de Misiones o el país?',
          '¡Sí! Realizamos envíos rápidos en Posadas (cadetería o retiro en tienda) y despachamos encomiendas seguras y embaladas discretamente a toda la provincia de Misiones y a todo el país a través de expresos y empresas de transporte oficial.',
          'Envíos & Entregas',
          2,
          true
        ),
        (
          '¿Dónde queda el local físico y cuáles son los horarios de atención?',
          'Estamos ubicados en Av. López y Planes 2919, Posadas, Misiones. Te invitamos a visitarnos para conocer todos los productos exhibidos y recibir asesoramiento técnico personalizado para tus cultivos.',
          'Local & Horarios',
          3,
          true
        ),
        (
          '¿Qué fertilizantes y marcas oficiales trabajan?',
          'Trabajamos únicamente con marcas oficiales y reconocidas por su pureza y eficacia: Namasté Nutrientes, Sanidad Vegetal Mamboretá, Treemix, Mad Grow, Top Crop, sustratos profesionales Grow Mix y Klasmann, iluminación LED de alta eficiencia y parafernalia de primer nivel.',
          'Cultivo & Insumos',
          4,
          true
        ),
        (
          '¿Los insumos son aptos para cultivo medicinal bajo Ley 27.350 (Reprocann)?',
          'Sí, todos nuestros fertilizantes, sustratos y preventivos orgánicos cumplen con los estándares agronómicos para el cultivo medicinal responsable amparado por el marco regulatorio del Reprocann (Ley 27.350).',
          'Cultivo & Normativa',
          5,
          true
        ),
        (
          '¿Brindan asesoramiento técnico si recién estoy comenzando?',
          '¡Absolutamente! Nuestro equipo cuenta con amplia experiencia y te acompaña en cada fase: germinación, vegetativo, floración, lavado de raíces y curado. No dudes en consultarnos por WhatsApp o en el local ante cualquier duda sobre plagas, deficiencias o dosificación.',
          'Asesoramiento',
          6,
          true
        );
      `);
        }
        // 3.2 Asegurar categorías y subcategorías oficiales en la base de datos
        await database_1.pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        parent_id INT REFERENCES categories(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        display_order INT DEFAULT 0,
        is_visible BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Categorías Principales (8 Oficiales)
      INSERT INTO categories (name, slug, display_order) VALUES
      ('Fertilizantes', 'fertilizantes', 1),
      ('Indoor', 'indoor', 2),
      ('Iluminación', 'iluminacion', 3),
      ('Medición', 'medicion', 4),
      ('Kits', 'kits', 5),
      ('Parafernalia', 'parafernalia', 6),
      ('Sustratos/Macetas', 'sustratos-macetas', 7),
      ('Semillas', 'semillas', 8)
      ON CONFLICT (slug) DO NOTHING;

      -- Corregir jerarquía si existían como categorías independientes
      UPDATE categories 
      SET parent_id = (SELECT id FROM categories WHERE slug = 'fertilizantes'),
          display_order = 6
      WHERE slug = 'lavado-de-raices';

      UPDATE categories 
      SET parent_id = (SELECT id FROM categories WHERE slug = 'parafernalia'),
          display_order = 8
      WHERE slug = 'accesorios';

      -- Subcategorías Fertilizantes
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Aditivos', 'aditivos', 1 FROM categories WHERE slug = 'fertilizantes'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Bases de Crecimiento', 'bases-de-crecimiento', 2 FROM categories WHERE slug = 'fertilizantes'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Bases de Floración', 'bases-de-floracion', 3 FROM categories WHERE slug = 'fertilizantes'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Control de Plagas', 'control-de-plagas', 4 FROM categories WHERE slug = 'fertilizantes'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Radiculares', 'radiculares', 5 FROM categories WHERE slug = 'fertilizantes'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Lavado de Raíces', 'lavado-de-raices', 6 FROM categories WHERE slug = 'fertilizantes'
      ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, display_order = EXCLUDED.display_order;

      -- Subcategorías Indoor
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Accesorios Indoor', 'accesorios-indoor', 1 FROM categories WHERE slug = 'indoor'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Armado de Salas', 'armado-de-salas', 2 FROM categories WHERE slug = 'indoor'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Carpas de Cultivo', 'carpas-de-cultivo', 3 FROM categories WHERE slug = 'indoor'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Control Ambiental', 'control-ambiental', 4 FROM categories WHERE slug = 'indoor'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Extracción y Ventilación', 'extraccion-y-ventilacion', 5 FROM categories WHERE slug = 'indoor'
      ON CONFLICT (slug) DO NOTHING;

      -- Subcategorías Iluminación
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Halogenados', 'halogenados', 1 FROM categories WHERE slug = 'iluminacion'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Leds', 'leds', 2 FROM categories WHERE slug = 'iluminacion'
      ON CONFLICT (slug) DO NOTHING;

      -- Subcategorías Medición
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Monitores Continuos', 'monitores-continuos', 1 FROM categories WHERE slug = 'medicion'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'PH y EC', 'ph-y-ec', 2 FROM categories WHERE slug = 'medicion'
      ON CONFLICT (slug) DO NOTHING;

      -- Subcategorías Kits
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Kits Fertilizantes', 'kits-fertilizantes', 1 FROM categories WHERE slug = 'kits'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Kits Indoor', 'kits-indoor', 2 FROM categories WHERE slug = 'kits'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Kits Parafernalia', 'kits-parafernalia', 3 FROM categories WHERE slug = 'kits'
      ON CONFLICT (slug) DO NOTHING;

      -- Subcategorías Parafernalia
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Armadores', 'armadores', 1 FROM categories WHERE slug = 'parafernalia'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Bandejas y Ceniceros', 'bandejas-y-ceniceros', 2 FROM categories WHERE slug = 'parafernalia'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Bongs y Pipas', 'bongs-y-pipas', 3 FROM categories WHERE slug = 'parafernalia'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Encendedores', 'encendedores', 4 FROM categories WHERE slug = 'parafernalia'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Filtros', 'filtros', 5 FROM categories WHERE slug = 'parafernalia'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Picadores', 'picadores', 6 FROM categories WHERE slug = 'parafernalia'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Sedas', 'sedas', 7 FROM categories WHERE slug = 'parafernalia'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Accesorios', 'accesorios', 8 FROM categories WHERE slug = 'parafernalia'
      ON CONFLICT (slug) DO UPDATE SET parent_id = EXCLUDED.parent_id, display_order = EXCLUDED.display_order;

      -- Subcategorías Sustratos/Macetas
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Coco', 'coco', 1 FROM categories WHERE slug = 'sustratos-macetas'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Macetas', 'macetas', 2 FROM categories WHERE slug = 'sustratos-macetas'
      ON CONFLICT (slug) DO NOTHING;
      INSERT INTO categories (parent_id, name, slug, display_order)
      SELECT id, 'Sustratos', 'sustratos', 3 FROM categories WHERE slug = 'sustratos-macetas'
      ON CONFLICT (slug) DO NOTHING;
    `);
        // 4. Sembrar cuenta de administrador inicial únicamente si no existe ningún admin en la BD
        const adminCheck = await database_1.pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
        if (adminCheck.rows.length === 0) {
            const initialEmail = process.env.INITIAL_ADMIN_EMAIL || exports.ADMIN_EMAIL;
            const salt = await bcryptjs_1.default.genSalt(10);
            const hashedPassword = await bcryptjs_1.default.hash(exports.ADMIN_DEFAULT_PASSWORD, salt);
            await database_1.pool.query(`INSERT INTO users (name, email, password, role, is_adult, is_verified)
         VALUES ($1, $2, $3, 'admin', true, true)
         ON CONFLICT (email) DO UPDATE SET role = 'admin'`, ['Administrador CultiShop', initialEmail.toLowerCase(), hashedPassword]);
        }
        // 5. Actualizar imágenes obsoletas en Neon DB hacia fotos temáticas verificadas
        const defaultCannabisImages = {
            1: 'https://images.unsplash.com/photo-1624990833801-56c1b6a56ba7?auto=format&fit=crop&q=80&w=600',
            2: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=600',
            3: 'https://images.unsplash.com/photo-1603909223429-69bb7101f420?auto=format&fit=crop&q=80&w=600',
            4: 'https://images.unsplash.com/photo-1536939459926-301728717817?auto=format&fit=crop&q=80&w=600',
            5: 'https://images.unsplash.com/photo-1602928321679-560bb453f190?auto=format&fit=crop&q=80&w=600',
            6: 'https://images.unsplash.com/photo-1536257104079-aa99c6460a5a?auto=format&fit=crop&q=80&w=600',
            7: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&q=80&w=600',
            8: 'https://images.unsplash.com/photo-1568644396922-5c3bfae12521?auto=format&fit=crop&q=80&w=600',
            9: 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?auto=format&fit=crop&q=80&w=600',
            10: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&q=80&w=600',
            11: 'https://images.unsplash.com/photo-1527842891421-42eec6e703ea?auto=format&fit=crop&q=80&w=600',
            12: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&q=80&w=600'
        };
        for (const [idStr, imgUrl] of Object.entries(defaultCannabisImages)) {
            const prodId = parseInt(idStr, 10);
            await database_1.pool.query(`UPDATE products 
         SET image_url = $1 
         WHERE id = $2 AND (
           image_url LIKE '%photo-1585320806297%' OR 
           image_url LIKE '%photo-1592417817098%' OR 
           image_url LIKE '%photo-1628543606553%' OR 
           image_url LIKE '%photo-1615485290382%' OR 
           image_url LIKE '%photo-1584308666744%' OR 
           image_url LIKE '%photo-1530836369250%' OR 
           image_url LIKE '%photo-1598880940371%' OR 
           image_url LIKE '%photo-1618221195710%' OR
           image_url IS NULL
         )`, [imgUrl, prodId]);
        }
    }
    catch (err) {
        console.error('Advertencia al inicializar esquema y admin en la BD:', err.message);
    }
}
