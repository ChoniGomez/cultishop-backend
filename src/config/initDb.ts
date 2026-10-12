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

    // 3. Asegurar columnas en products
    await pool.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS badge VARCHAR(50);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS badge_type VARCHAR(20) DEFAULT 'gold';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS options JSONB;
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
