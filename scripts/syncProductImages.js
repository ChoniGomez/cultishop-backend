#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

const BACKEND_DIR = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

const args = new Set(process.argv.slice(2));
const applyChanges = args.has('--apply');
const help = args.has('--help') || args.has('-h');

function getUploadsDir() {
  const configured = process.env.UPLOADS_DIR;
  if (!configured || !configured.trim()) {
    return path.join(BACKEND_DIR, 'uploads');
  }
  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(BACKEND_DIR, configured);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

function basenameFromUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  if (/^(?:data:|blob:)/i.test(value)) return '';

  let pathname = value.trim();
  if (/^https?:\/\//i.test(pathname)) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return '';
    }
  }

  pathname = pathname.split(/[?#]/, 1)[0].replace(/\\/g, '/');
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return '';
  }
  return path.posix.basename(pathname);
}

function findPhysicalImage(product, filesByLowerName, filesByStem) {
  const originalName = basenameFromUrl(product.image_url);
  if (originalName && filesByLowerName.has(originalName.toLowerCase())) {
    return filesByLowerName.get(originalName.toLowerCase());
  }

  const expectedName = `product-${product.id}.webp`;
  if (filesByLowerName.has(expectedName.toLowerCase())) {
    return filesByLowerName.get(expectedName.toLowerCase());
  }

  const titleStem = slugify(product.title);
  const titleMatches = titleStem ? filesByStem.get(titleStem) || [] : [];
  return titleMatches.length === 1 ? titleMatches[0] : null;
}

function quoteCsv(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function displayImageUrl(value) {
  if (typeof value !== 'string') return '';
  if (/^data:image\//i.test(value)) return `[embedded image data, ${value.length} characters]`;
  if (value.length > 500) return `[long image value, ${value.length} characters]`;
  return value;
}

async function main() {
  if (help) {
    console.log('Uso: node scripts/syncProductImages.js [--apply]');
    console.log('Sin --apply solo muestra los cambios; con --apply actualiza image_url en PostgreSQL.');
    console.log('UPLOADS_DIR puede configurarse en backend/.env o por variable de entorno.');
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está configurada en backend/.env ni en el entorno.');
  }

  const uploadsDir = getUploadsDir();
  if (!fs.existsSync(uploadsDir)) {
    throw new Error(`No existe el directorio de imágenes: ${uploadsDir}`);
  }

  const physicalFiles = fs.readdirSync(uploadsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:webp|jpe?g|png|avif|gif)$/i.test(entry.name))
    .map((entry) => entry.name);
  const filesByLowerName = new Map(physicalFiles.map((name) => [name.toLowerCase(), name]));
  const filesByStem = new Map();
  for (const name of physicalFiles) {
    const stem = slugify(path.parse(name).name.replace(/^product-\d+(?:-\d+)?$/i, ''));
    if (!stem) continue;
    filesByStem.set(stem, [...(filesByStem.get(stem) || []), name]);
  }

  const isSslDisabled = process.env.DATABASE_URL.includes('sslmode=disable');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(isSslDisabled ? { ssl: false } : { ssl: { rejectUnauthorized: false } })
  });
  let client;

  try {
    client = await pool.connect();
    const result = await client.query(
      'SELECT id, title, image_url FROM products ORDER BY id'
    );
    const changes = [];
    const unmatched = [];

    for (const product of result.rows) {
      const physicalName = findPhysicalImage(product, filesByLowerName, filesByStem);
      if (!physicalName) {
        if (product.image_url) {
          unmatched.push(product);
        }
        continue;
      }

      const expectedUrl = `/uploads/${physicalName}`;
      if (product.image_url !== expectedUrl) {
        changes.push({ id: product.id, title: product.title, current: product.image_url, target: expectedUrl });
      }
    }

    console.log(`Directorio físico: ${uploadsDir}`);
    console.log(`Archivos de imagen encontrados: ${physicalFiles.length}`);
    console.log(`Productos revisados: ${result.rows.length}`);
    console.log(`URLs para corregir: ${changes.length}`);
    console.log(`Productos con imagen declarada sin archivo local coincidente: ${unmatched.length}`);
    console.log(`Modo: ${applyChanges ? 'APLICAR CAMBIOS' : 'simulación (sin cambios)'}`);

    if (changes.length > 0) {
      console.log('\nproduct_id,title,current_image_url,target_image_url');
      for (const change of changes) {
        console.log([
          change.id,
          change.title,
          displayImageUrl(change.current),
          change.target
        ].map(quoteCsv).join(','));
      }
    }

    if (unmatched.length > 0) {
      console.log('\nProductos sin archivo local coincidente (no se modificarán):');
      for (const product of unmatched) {
        console.log(`${product.id}\t${product.title}\t${displayImageUrl(product.image_url)}`);
      }
    }

    if (!applyChanges || changes.length === 0) return;

    await client.query('BEGIN');
    try {
      for (const change of changes) {
        const updateResult = await client.query(
          'UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2 AND image_url IS NOT DISTINCT FROM $3',
          [change.target, change.id, change.current]
        );
        if (updateResult.rowCount !== 1) {
          throw new Error(`El producto ${change.id} cambió durante la sincronización; se canceló la transacción.`);
        }
      }
      await client.query('COMMIT');
      console.log(`\nActualización completada: ${changes.length} productos.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Error al sincronizar imágenes: ${error.message}`);
  process.exitCode = 1;
});
