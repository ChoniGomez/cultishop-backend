import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { processBufferToWebp } from '../utils/imageProcessor';

// Almacenamiento en memoria para permitir el procesamiento con Sharp antes de escribir en disco
const storage = multer.memoryStorage();

// Filtro de tipos de archivo permitidos
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif'
  ];

  if (allowedMimes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no admitido. Selecciona una imagen válida (JPG, PNG, WebP o AVIF).'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024 // Límite de 15MB por archivo
  }
});

/**
 * Middleware que intercepta la imagen subida con Multer en memoria,
 * la convierte automáticamente a WebP al 85% de calidad y añade la URL WebP resultante al objeto req.file.
 */
export const convertUploadToWebp = (prefix: string = 'img') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.file || !req.file.buffer) {
      return next();
    }

    try {
      const processed = await processBufferToWebp(req.file.buffer, prefix, 85);
      
      // Actualizar metadatos de req.file con la versión WebP
      req.file.filename = processed.filename;
      req.file.path = processed.url;
      req.file.mimetype = 'image/webp';
      if (processed.size) {
        req.file.size = processed.size;
      }

      next();
    } catch (error: any) {
      console.error('Error en middleware convertUploadToWebp:', error);
      return res.status(400).json({
        error: `Error al procesar y convertir la imagen a WebP: ${error.message || error}`
      });
    }
  };
};

