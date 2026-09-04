import type { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import { authenticateToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { uploadImageStream } from '../services/cloudinary';

// Rate Limiter for Uploads
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak unggahan berkas. Silakan coba lagi nanti.' }
});

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
      const errorMsg = error instanceof Error ? error.message : 'Database ping failed';
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

  // Generic Upload endpoint
  router.post(
    '/upload',
    authenticateToken,
    uploadLimiter,
    upload.single('image'),
    async (req: AuthenticatedRequest & MulterRequest, res: Response) => {
      if (!req.file) {
        return res.status(400).json({ message: 'Tidak ada file yang diunggah.' });
      }

      if (!validateImageMimeType(req.file.mimetype)) {
        return res.status(400).json({
          message: 'Format file tidak didukung. Harap unggah gambar (JPEG, PNG, WebP, GIF).'
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
