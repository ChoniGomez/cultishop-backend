import bcrypt from 'bcryptjs';
import { pool } from './database';

export const ADMIN_EMAIL = 'chonidacharygomez@gmail.com';
export const ADMIN_DEFAULT_PASSWORD = '15525503pololo';

export async function initDb() {
  try {
    console.log('Inicializando verificaciones de esquema y usuario administrador...');

    // 1. Asegurar rol por defecto consumidor en la tabla users
    await pool.query(`
      ALTER TABLE users ALTER COLUMN role SET DEFAULT 'consumidor';
      UPDATE users SET role = 'consumidor' WHERE role = 'customer' OR role IS NULL;
    `);

    // 2. Asegurar columnas en orders por si hiciera falta
    await pool.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB;
    `);

    // 3. Asegurar columnas en products (incluyendo subcategorías y pestañas de información detallada)
    await pool.query(`
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
    await pool.query(`
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
    const bannerCount = await pool.query('SELECT COUNT(*) FROM banners');
    if (parseInt(bannerCount.rows[0].count, 10) === 0) {
      await pool.query(`
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
      console.log('✅ Banners publicitarios iniciales configurados en la base de datos');
    }

    // 3.2 Asegurar categorías y subcategorías oficiales en la base de datos
    await pool.query(`
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

      -- Categorías Principales
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

    // 4. Sembrar o actualizar usuario Administrador oficial
    const adminCheck = await pool.query(
      'SELECT id, email, role FROM users WHERE LOWER(email) = $1',
      [ADMIN_EMAIL.toLowerCase()]
    );

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(ADMIN_DEFAULT_PASSWORD, salt);

    if (adminCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (name, email, password, role, is_adult, is_verified)
         VALUES ($1, $2, $3, 'admin', true, true)`,
        ['Administrador CultiShop', ADMIN_EMAIL.toLowerCase(), hashedPassword]
      );
      console.log(`✅ Usuario Administrador creado exitosamente: ${ADMIN_EMAIL}`);
    } else {
      // Aseguramos rol 'admin' y contraseña actualizada
      await pool.query(
        `UPDATE users 
         SET role = 'admin', password = $1, is_adult = true, is_verified = true, updated_at = NOW()
         WHERE id = $2`,
        [hashedPassword, adminCheck.rows[0].id]
      );
      console.log(`✅ Usuario Administrador verificado y actualizado con rol 'admin': ${ADMIN_EMAIL}`);
    }

    // 5. Actualizar imágenes obsoletas en Neon DB hacia fotos temáticas verificadas
    const defaultCannabisImages: { [key: number]: string } = {
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
      await pool.query(
        `UPDATE products 
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
         )`,
        [imgUrl, prodId]
      );
    }
  } catch (err: any) {
    console.error('Advertencia al inicializar esquema y admin en la BD:', err.message);
  }
}
