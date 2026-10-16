import type { Request, Response, Router } from 'express';
import multer from 'multer';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import { authenticateToken, requireRole } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { uploadImageStream } from '../services/cloudinary';
import { validateImageMagicBytes } from '../middleware/upload';
import { uploadLimiter } from '../middleware/rateLimiter';

export { uploadLimiter };

export const ALLOWED_IMAGE_MIMETYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
  'image/gif'
] as const;

export function validateImageMimeType(mimetype: string): boolean {
  if (!mimetype) return false;
  return ALLOWED_IMAGE_MIMETYPES.includes(mimetype.toLowerCase() as typeof ALLOWED_IMAGE_MIMETYPES[number]);
}

// Multer in-memory file upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export function registerSystemRoutes(router: Router): void {
  // System & Infrastructure Health Check
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<RowDataPacket[]>('SELECT 1 AS healthy, NOW() AS db_time');
      res.json({
        status: 'ok',
        service: 'kosmo-api',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: 'connected',
          queryOk: Array.isArray(rows) && rows.length > 0
        }
      });
    } catch (error: unknown) {
      const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
      const rawErrorMsg = error instanceof Error ? error.message : 'Database ping failed';
      const errorMsg = isProduction ? 'Database unavailable' : rawErrorMsg;
      res.status(503).json({
        status: 'degraded',
        service: 'kosmo-api',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: 'disconnected',
          error: errorMsg
        }
      });
    }
  });

  // Generic Upload endpoint (Restricted to landlords and admins, with magic-byte verification)
  router.post(
    '/upload',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    uploadLimiter,
    upload.single('image'),
    async (req: AuthenticatedRequest & MulterRequest, res: Response) => {
      if (!req.file) {
        return res.status(400).json({ message: 'Tidak ada file yang diunggah.' });
      }

      if (!validateImageMimeType(req.file.mimetype) || !validateImageMagicBytes(req.file.buffer)) {
        return res.status(400).json({
          message: 'Format file tidak didukung atau header berkas tidak valid. Harap unggah gambar (JPEG, PNG, WebP, GIF).'
        });
      }

      try {
        const result = await uploadImageStream(req.file.buffer, 'kosmo_properties');
        res.json({
          url: result.secure_url,
          publicId: result.public_id
        });
      } catch (err: unknown) {
        console.error('Cloudinary upload error:', err);
        res.status(500).json({ message: 'Gagal mengunggah gambar ke Cloudinary.' });
      }
    }
  );
}
