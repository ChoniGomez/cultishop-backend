import { Router, Request, Response } from 'express';
import { upload, convertMultipleUploadsToWebp } from '../middleware/uploadMiddleware';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';
import { processAnyImageInput } from '../utils/imageProcessor';

const router = Router();

/**
 * POST /api/upload
 * Endpoint unificado para subir y optimizar una o múltiples imágenes a WebP.
 * Soporta tanto multipart/form-data (campos 'image', 'images', 'files') como JSON (cadena o arreglo Base64/URLs).
 */
router.post(
  '/',
  requireAuth,
  requireAdmin,
  (req: Request, res: Response, next) => {
    if (req.is('multipart/form-data')) {
      const uploadHandler = upload.any();
      uploadHandler(req, res, (err) => {
        if (err) {
          return res.status(400).json({ error: err.message || 'Error en la subida del archivo.' });
        }
        return next();
      });
    } else {
      return next();
    }
  },
  convertMultipleUploadsToWebp('upload'),
  async (req: Request, res: Response) => {
    try {
      // 1. Si se procesaron archivos multipart a través del middleware
      const uploadedImages: string[] = (req as any).uploadedImages || [];
      if (uploadedImages.length > 0) {
        return res.status(201).json({
          success: true,
          message: `${uploadedImages.length} imagen(es) convertida(s) y guardada(s) exitosamente en formato WebP.`,
          urls: uploadedImages,
          url: uploadedImages[0],
          format: 'webp',
          count: uploadedImages.length
        });
      }

      // 2. Si vino como arreglo en JSON (múltiples Base64 o URLs)
      const rawImages = req.body?.images || req.body?.files;
      if (Array.isArray(rawImages) && rawImages.length > 0) {
        const processedUrls: string[] = [];
        for (const raw of rawImages) {
          if (typeof raw === 'string' && raw.trim()) {
            const url = await processAnyImageInput(raw.trim(), 'upload', 85);
            processedUrls.push(url);
          }
        }
        if (processedUrls.length > 0) {
          return res.status(201).json({
            success: true,
            message: `${processedUrls.length} imágenes procesadas exitosamente a WebP.`,
            urls: processedUrls,
            url: processedUrls[0],
            format: 'webp',
            count: processedUrls.length
          });
        }
      }

      // 3. Si vino como cadena única en JSON (Base64 o URL directa)
      const rawImage = req.body?.image || req.body?.image_url || req.body?.data;
      if (rawImage && typeof rawImage === 'string') {
        const webpUrl = await processAnyImageInput(rawImage, 'upload', 85);
        return res.status(201).json({
          success: true,
          message: 'Imagen procesada exitosamente a WebP.',
          urls: [webpUrl],
          url: webpUrl,
          format: 'webp',
          count: 1
        });
      }

      return res.status(400).json({
        error: 'No se recibió ninguna imagen para procesar. Envía uno o varios archivos o cadenas base64 en la petición.'
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

