/**
 * CultiShop - Script de Migración y Optimización Masiva de Imágenes a WebP
 * 
 * Este script inspecciona las tablas principales de la base de datos PostgreSQL (Neon):
 * - products (columna image_url)
 * - banners (columna image_url)
 * - about_sections (columna image_url)
 * - instagram_videos (columna thumbnail_url)
 * 
 * Acciones:
 * 1. Identifica imágenes en formato Base64 (data:image/...) o archivos locales no-WebP (.png, .jpg, .jpeg, etc.).
 * 2. Convierte cada imagen al formato .webp comprimido (calidad 85%, dimensiones optimizadas) usando sharp.
 * 3. Guarda el nuevo archivo .webp en la carpeta backend/uploads/ con nombre criptográficamente único.
 * 4. Actualiza la fila correspondiente en la base de datos con la ruta relativa (/uploads/archivo.webp).
 * 5. Si existía un archivo local anterior no-webp, lo limpia para ahorrar espacio.
 * 6. Reporta el progreso paso a paso, los bytes ahorrados y genera un resumen final.
 * 
 * Ejecución:
 *   node backend/scripts/migrateImagesToWebp.js
 *   (o desde backend/: npm run migrate:images)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Localizar rutas del backend
const backendDir = path.resolve(__dirname, '..');
const uploadsDir = path.resolve(backendDir, 'uploads');
const envPath = path.resolve(backendDir, '.env');

// Cargar variables de entorno
require(path.join(backendDir, 'node_modules', 'dotenv')).config({ path: envPath });
const { Pool } = require(path.join(backendDir, 'node_modules', 'pg'));
const sharp = require(path.join(backendDir, 'node_modules', 'sharp'));

// Asegurar que la carpeta uploads exista
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configurar conexión a la base de datos
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ ERROR: DATABASE_URL no está definida en backend/.env');
  process.exit(1);
}

const isSslDisabled = dbUrl.includes('sslmode=disable');
const pool = new Pool({
  connectionString: dbUrl,
  ...(isSslDisabled ? { ssl: false } : { ssl: { rejectUnauthorized: false } })
});

// Métricas de migración
const stats = {
  scanned: 0,
  converted: 0,
  updatedInDb: 0,
  alreadyWebp: 0,
  skippedExternal: 0,
  errors: 0,
  bytesBefore: 0,
  bytesAfter: 0,
  tables: {}
};

/**
 * Formatea bytes a KB o MB legibles
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Genera un nombre de archivo único para la imagen WebP
 */
function generateFilename(prefix = 'img') {
  const cleanPrefix = prefix.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(4).toString('hex');
  return `${cleanPrefix}-${timestamp}-${randomHex}.webp`;
}

/**
 * Convierte un buffer de imagen a WebP con sharp y lo guarda en uploads/
 */
async function convertBufferToWebp(buffer, prefix = 'migrated', quality = 85) {
  const originalSize = buffer.length;
  const filename = generateFilename(prefix);
  const destPath = path.join(uploadsDir, filename);

  const pipeline = sharp(buffer)
    .rotate()
    .resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({
      quality,
      effort: 4,
      lossless: false
    });

  const webpBuffer = await pipeline.toBuffer();
  await fs.promises.writeFile(destPath, webpBuffer);

  return {
    filename,
    relativePath: `/uploads/${filename}`,
    originalSize,
    webpSize: webpBuffer.length
  };
}

/**
 * Procesa una imagen si es Base64 o archivo local no-webp
 */
async function processImageField(value, prefix = 'img') {
  if (!value || typeof value !== 'string') {
    return { shouldUpdate: false, reason: 'empty' };
  }

  const trimmed = value.trim();

  // Caso 1: Imagen en Base64 (data:image/...)
  if (trimmed.startsWith('data:image/') || /^data:[a-zA-Z0-9\/+-]+;base64,/.test(trimmed)) {
    try {
      const commaIdx = trimmed.indexOf(',');
      const base64Data = commaIdx !== -1 ? trimmed.slice(commaIdx + 1) : trimmed;
      const buffer = Buffer.from(base64Data, 'base64');

      if (!buffer || buffer.length === 0) {
        return { shouldUpdate: false, reason: 'empty_base64_buffer' };
      }

      const result = await convertBufferToWebp(buffer, prefix);
      return {
        shouldUpdate: true,
        newUrl: result.relativePath,
        originalSize: result.originalSize,
        webpSize: result.webpSize,
        type: 'base64'
      };
    } catch (err) {
      return { shouldUpdate: false, error: err.message, type: 'base64' };
    }
  }

  // Caso 2: Ya es un archivo WebP local (/uploads/...webp)
  if (trimmed.toLowerCase().endsWith('.webp')) {
    return { shouldUpdate: false, reason: 'already_webp' };
  }

  // Caso 3: Archivo local no-webp en /uploads/ (ej: /uploads/foto.png, /uploads/banner.jpg)
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
    try {
      const localFilename = trimmed.replace(/^\/?uploads\//, '');
      const localFilePath = path.join(uploadsDir, localFilename);

      if (fs.existsSync(localFilePath)) {
        const buffer = await fs.promises.readFile(localFilePath);
        const result = await convertBufferToWebp(buffer, prefix);

        // Limpiar archivo anterior no-webp para recuperar disco
        try {
          await fs.promises.unlink(localFilePath);
        } catch (unlinkErr) {
          // Ignorar error al borrar archivo previo
        }

        return {
          shouldUpdate: true,
          newUrl: result.relativePath,
          originalSize: result.originalSize,
          webpSize: result.webpSize,
          type: 'local_file'
        };
      } else {
        return { shouldUpdate: false, reason: 'local_file_not_found', path: localFilePath };
      }
    } catch (err) {
      return { shouldUpdate: false, error: err.message, type: 'local_file' };
    }
  }

  // Caso 4: URLs remotas (Unsplash, Cloudinary, etc.)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { shouldUpdate: false, reason: 'external_url' };
  }

  return { shouldUpdate: false, reason: 'unknown_format' };
}

/**
 * Migra una tabla específica
 */
async function migrateTable(tableName, idColumn, imageColumn, prefix) {
  console.log(`\n📂 Escaneando tabla "${tableName}" (columna "${imageColumn}")...`);
  stats.tables[tableName] = { scanned: 0, converted: 0, errors: 0, bytesSaved: 0 };

  // Verificar si la tabla existe en PostgreSQL
  const tableCheck = await pool.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = $1
    )`,
    [tableName]
  );

  if (!tableCheck.rows[0]?.exists) {
    console.log(`  ℹ️ La tabla "${tableName}" no existe en la base de datos actual. Omitiendo.`);
    return;
  }

  // Consultar filas con campo de imagen no nulo
  const res = await pool.query(
    `SELECT ${idColumn}, ${imageColumn} FROM ${tableName} WHERE ${imageColumn} IS NOT NULL`
  );

  const rows = res.rows || [];
  console.log(`  🔍 Registros encontrados con imagen: ${rows.length}`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const id = row[idColumn];
    const currentImage = row[imageColumn];

    stats.scanned++;
    stats.tables[tableName].scanned++;

    try {
      const processResult = await processImageField(currentImage, prefix);

      if (processResult.shouldUpdate) {
        // Actualizar fila en PostgreSQL
        await pool.query(
          `UPDATE ${tableName} SET ${imageColumn} = $1 WHERE ${idColumn} = $2`,
          [processResult.newUrl, id]
        );

        const saved = processResult.originalSize - processResult.webpSize;
        stats.converted++;
        stats.updatedInDb++;
        stats.bytesBefore += processResult.originalSize;
        stats.bytesAfter += processResult.webpSize;
        stats.tables[tableName].converted++;
        stats.tables[tableName].bytesSaved += Math.max(0, saved);

        console.log(
          `  ✅ [${tableName} id=${id}] Convertido a WebP: ${processResult.newUrl} ` +
          `(${formatBytes(processResult.originalSize)} -> ${formatBytes(processResult.webpSize)}, ` +
          `ahorro: ${formatBytes(saved)})`
        );
      } else if (processResult.reason === 'already_webp') {
        stats.alreadyWebp++;
      } else if (processResult.reason === 'external_url') {
        stats.skippedExternal++;
      } else if (processResult.error) {
        stats.errors++;
        stats.tables[tableName].errors++;
        console.warn(`  ⚠️ [${tableName} id=${id}] Error al procesar imagen: ${processResult.error}`);
      }
    } catch (rowError) {
      stats.errors++;
      stats.tables[tableName].errors++;
      console.warn(`  ⚠️ [${tableName} id=${id}] Excepción inesperada: ${rowError.message}`);
    }
  }
}

/**
 * Escanea archivos existentes en backend/uploads/ para convertir cualquier PNG/JPG residual
 */
async function scanAndOptimizeUploadsFolder() {
  console.log(`\n📁 Verificando archivos huérfanos o sueltos en "${uploadsDir}"...`);
  try {
    const files = await fs.promises.readdir(uploadsDir);
    let localConverted = 0;

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'].includes(ext)) {
        const filePath = path.join(uploadsDir, file);
        try {
          const stat = await fs.promises.stat(filePath);
          if (!stat.isFile()) continue;

          const buffer = await fs.promises.readFile(filePath);
          const baseName = path.basename(file, ext);
          const webpName = `${baseName}.webp`;
          const webpPath = path.join(uploadsDir, webpName);

          if (!fs.existsSync(webpPath)) {
            const webpBuffer = await sharp(buffer)
              .rotate()
              .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 85, effort: 4 })
              .toBuffer();

            await fs.promises.writeFile(webpPath, webpBuffer);
            localConverted++;
            console.log(`  ✅ Archivo local suelto optimizado a WebP: ${file} -> ${webpName}`);
          }
        } catch (fileErr) {
          console.warn(`  ⚠️ Error al procesar archivo suelto ${file}: ${fileErr.message}`);
        }
      }
    }

    if (localConverted === 0) {
      console.log('  ✨ No se detectaron archivos de imagen obsoletos pendientes en uploads/.');
    }
  } catch (dirErr) {
    console.warn('  ⚠️ Error al leer directorio uploads/:', dirErr.message);
  }
}

/**
 * Función principal de ejecución
 */
async function main() {
  console.log('===============================================================');
  console.log('🌿 CultiShop - Migración y Optimización Masiva de Imágenes WebP');
  console.log('===============================================================');
  console.log(`📅 Fecha: ${new Date().toLocaleString()}`);
  console.log(`📁 Directorio de uploads: ${uploadsDir}`);
  console.log(`🔗 Conectando a PostgreSQL...`);

  try {
    await pool.query('SELECT 1');
    console.log('🟢 Conexión a la base de datos establecida con éxito.\n');

    // 1. Migrar tabla products
    await migrateTable('products', 'id', 'image_url', 'product');

    // 2. Migrar tabla banners
    await migrateTable('banners', 'id', 'image_url', 'banner');

    // 3. Migrar tabla about_sections
    await migrateTable('about_sections', 'id', 'image_url', 'about');

    // 4. Migrar tabla instagram_videos
    await migrateTable('instagram_videos', 'id', 'thumbnail_url', 'reel');

    // 5. Escaneo complementario de la carpeta uploads
    await scanAndOptimizeUploadsFolder();

    // Resumen final
    const totalSaved = Math.max(0, stats.bytesBefore - stats.bytesAfter);
    const percentSaved = stats.bytesBefore > 0 
      ? ((totalSaved / stats.bytesBefore) * 100).toFixed(1) 
      : '0';

    console.log('\n===============================================================');
    console.log('📊 REPORTE DE RESULTADOS DE LA MIGRACIÓN A WEBP');
    console.log('===============================================================');
    console.log(`🔍 Total de registros escaneados:   ${stats.scanned}`);
    console.log(`✨ Imágenes convertidas a WebP:     ${stats.converted}`);
    console.log(`💾 Filas actualizadas en la BD:     ${stats.updatedInDb}`);
    console.log(`🟢 Ya en formato WebP:             ${stats.alreadyWebp}`);
    console.log(`🌐 URLs externas (Unsplash/CDN):    ${stats.skippedExternal}`);
    console.log(`⚠️ Advertencias o errores:          ${stats.errors}`);
    console.log(`📉 Peso original procesado:         ${formatBytes(stats.bytesBefore)}`);
    console.log(`⚡ Peso optimizado en WebP:         ${formatBytes(stats.bytesAfter)}`);
    console.log(`🎉 Espacio neto total ahorrado:     ${formatBytes(totalSaved)} (-${percentSaved}%)`);
    console.log('===============================================================\n');

  } catch (error) {
    console.error('❌ Error general durante la migración:', error);
  } finally {
    await pool.end();
    console.log('🔒 Conexión a la base de datos cerrada.');
  }
}

// Ejecutar script
main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

