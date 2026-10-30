import { Router, Request, Response } from 'express';
import { upload, convertUploadToWebp } from '../middleware/uploadMiddleware';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';
import { processAnyImageInput } from '../utils/imageProcessor';

const router = Router();

/**
 * POST /api/upload
 * Endpoint unificado para subir y optimizar cualquier imagen a WebP.
 * Soporta tanto multipart/form-data (campo 'image' o 'file') como JSON con Base64.
 */
router.post(
  '/',
  requireAuth,
  requireAdmin,
  (req: Request, res: Response, next) => {
    // Si viene como multipart/form-data, ejecutar multer aceptando cualquier campo de imagen
    if (req.is('multipart/form-data')) {
      const uploadHandler = upload.any();
      uploadHandler(req, res, (err) => {
        if (err) {
          return res.status(400).json({ error: err.message || 'Error en la subida del archivo.' });
        }
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
          req.file = (req.files as Express.Multer.File[])[0];
        }
        return next();
      });
    } else {
      return next();
    }
  },
  convertUploadToWebp('upload'),
  async (req: Request, res: Response) => {
    try {
      // 1. Si se procesó un archivo multipart a través del middleware
      if (req.file) {
        return res.status(201).json({
          success: true,
          message: 'Imagen convertida y guardada exitosamente en formato WebP.',
          url: req.file.path,
          filename: req.file.filename,
          format: 'webp',
          size: req.file.size
        });
      }

      // 2. Si vino como cadena en JSON (Base64 o URL directa)
      const rawImage = req.body?.image || req.body?.image_url || req.body?.data;
      if (rawImage && typeof rawImage === 'string') {
        const webpUrl = await processAnyImageInput(rawImage, 'upload', 85);
        return res.status(201).json({
          success: true,
          message: 'Imagen procesada exitosamente a WebP.',
          url: webpUrl,
          format: 'webp'
        });
      }

      return res.status(400).json({
        error: 'No se recibió ninguna imagen para procesar. Envía un archivo o una cadena base64 en el cuerpo de la petición.'
      });
    } catch (error: any) {
      console.error('Error en POST /api/upload:', error);
      return res.status(500).json({
        error: `Error interno al procesar imagen: ${error.message || error}`
      });
    }
  }
);

export default router;

