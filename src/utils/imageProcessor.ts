import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';

/**
 * Directorio absoluto para almacenar imágenes WebP optimizadas
 */
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

// Garantizar que la carpeta de almacenamiento exista al iniciar el servicio
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface ProcessedImageResult {
  filename: string;
  url: string;
  width?: number;
  height?: number;
  size?: number;
}

/**
 * Genera un nombre de archivo único para la imagen WebP
 */
export const generateUniqueWebpFilename = (prefix: string = 'img'): string => {
  const sanitizedPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'img';
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  return `${sanitizedPrefix}-${timestamp}-${randomSuffix}.webp`;
};

/**
 * Convierte un Buffer de imagen (PNG, JPG, JPEG, etc.) a formato .webp con calidad óptima (85%)
 * y lo almacena de forma persistente en el servidor.
 */
export const processBufferToWebp = async (
  buffer: Buffer,
  prefix: string = 'img',
  quality: number = 85
): Promise<ProcessedImageResult> => {
  try {
    const filename = generateUniqueWebpFilename(prefix);
    const destinationPath = path.join(UPLOADS_DIR, filename);

    // Pipeline Sharp: redimensionar si excede 2048px (sin agrandar) y convertir a WebP
    const imagePipeline = sharp(buffer)
      .rotate() // Respeta orientación EXIF de cámaras y celulares
      .resize({
        width: 2048,
        height: 2048,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({
        quality,
        effort: 4 // Nivel 4 ofrece balance óptimo entre velocidad de compresión y tamaño de archivo
      });

    const info = await imagePipeline.toFile(destinationPath);

    return {
      filename,
      url: `/uploads/${filename}`,
      width: info.width,
      height: info.height,
      size: info.size
    };
  } catch (error: any) {
    console.error('Error procesando buffer de imagen a WebP con Sharp:', error);
    throw new Error(`Fallo en la conversión a formato WebP: ${error.message || error}`);
  }
};

/**
 * Procesa un Data URL (base64) de imagen, lo decodifica a buffer y lo guarda en formato WebP
 */
export const processBase64ToWebp = async (
  dataUrlOrBase64: string,
  prefix: string = 'img',
  quality: number = 85
): Promise<ProcessedImageResult> => {
  try {
    if (!dataUrlOrBase64 || typeof dataUrlOrBase64 !== 'string') {
      throw new Error('El contenido en base64 no es válido.');
    }

    // Extraer datos base64 eliminando encabezado data:image/...;base64,
    const matches = dataUrlOrBase64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    const base64Data = matches ? matches[2] : dataUrlOrBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length === 0) {
      throw new Error('El buffer de la imagen base64 está vacío.');
    }

    return await processBufferToWebp(buffer, prefix, quality);
  } catch (error: any) {
    console.error('Error procesando Base64 a WebP:', error);
    throw error;
  }
};

/**
 * Intercepta cualquier entrada de imagen (Data URL, archivo o URL externa)
 * y garantiza que si es un archivo subido o base64, se guarde como archivo .webp en el servidor.
 */
export const processAnyImageInput = async (
  input: string | null | undefined,
  prefix: string = 'img',
  quality: number = 85
): Promise<string> => {
  if (!input || typeof input !== 'string') {
    return input || '';
  }

  const trimmed = input.trim();

  // 1. Si es un Data URL en Base64 (típico de formularios del panel de administración)
  if (trimmed.startsWith('data:image/')) {
    try {
      const result = await processBase64ToWebp(trimmed, prefix, quality);
      return result.url;
    } catch (err) {
      console.warn('Aviso: No se pudo convertir base64 a WebP, manteniendo original como contingencia:', err);
      return trimmed;
    }
  }

  // 2. Si es una ruta local en uploads que no es WebP (ej: /uploads/foto.png o /uploads/foto.jpg)
  if (trimmed.startsWith('/uploads/') && !trimmed.toLowerCase().endsWith('.webp')) {
    try {
      const existingFilename = path.basename(trimmed);
      const existingFilePath = path.join(UPLOADS_DIR, existingFilename);

      if (fs.existsSync(existingFilePath)) {
        const fileBuffer = await fs.promises.readFile(existingFilePath);
        const result = await processBufferToWebp(fileBuffer, prefix, quality);

        // Eliminar el archivo antiguo no webp
        try {
          await fs.promises.unlink(existingFilePath);
        } catch {}

        return result.url;
      }
    } catch (err) {
      console.warn('Aviso al convertir archivo local existente a WebP:', err);
    }
  }

  // 3. Si ya es una URL externa (Unsplash, etc.) o ya es una ruta WebP, retornar tal cual
  return trimmed;
};

/**
 * Elimina de forma segura una imagen anterior de la carpeta /uploads si fue reemplazada
 */
export const deleteOldImageFile = async (imageUrl: string | null | undefined): Promise<void> => {
  if (!imageUrl || typeof imageUrl !== 'string') return;
  try {
    if (imageUrl.startsWith('/uploads/')) {
      const filename = path.basename(imageUrl);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    }
  } catch (err) {
    console.warn(`Aviso al intentar eliminar imagen anterior ${imageUrl}:`, err);
  }
};

