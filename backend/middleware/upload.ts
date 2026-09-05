import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';

export const ALLOWED_IMAGE_MIMETYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
  'image/gif'
] as const;

export function validateImageMimeType(mimetype: string): boolean {
  if (!mimetype) return false;
  return ALLOWED_IMAGE_MIMETYPES.includes(
    mimetype.toLowerCase() as typeof ALLOWED_IMAGE_MIMETYPES[number]
  );
}

// Multer memory storage with 5MB per file limit and max 10 files
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 10
  },
  fileFilter: (_req, file, cb) => {
    if (!validateImageMimeType(file.mimetype)) {
      return cb(
        new Error('Format file tidak didukung. Harap unggah gambar (JPEG, PNG, WebP, GIF).')
      );
    }
    cb(null, true);
  }
});

// Accepts up to 10 files under 'images' (with fallback support for 'image')
export const multiPhotoUpload = memoryUpload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'image', maxCount: 10 }
]);

export interface MulterFilesRequest extends Request {
  files?: { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[];
  file?: Express.Multer.File;
}

/**
 * Middleware wrapper to cleanly intercept MulterErrors and return HTTP 400 Bad Request
 */
export function handleMultiPhotoUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  multiPhotoUpload(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            message: 'Ukuran file melebihi batas maksimum 5MB per file.'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            message: 'Jumlah file melebihi batas maksimum atau field tidak valid (maksimal 10 foto pada field "images").'
          });
        }
        return res.status(400).json({
          message: `Gagal memproses file upload: ${err.message}`
        });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      return res.status(400).json({ message: 'Gagal memproses unggahan berkas.' });
    }
    next();
  });
}

/**
 * Helper to extract flattened array of Express.Multer.File from request
 */
export function extractUploadedFiles(req: MulterFilesRequest): Express.Multer.File[] {
  const result: Express.Multer.File[] = [];
  if (Array.isArray(req.files)) {
    result.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    const fieldObj = req.files as Record<string, Express.Multer.File[]>;
    if (Array.isArray(fieldObj.images)) result.push(...fieldObj.images);
    if (Array.isArray(fieldObj.image)) result.push(...fieldObj.image);
  } else if (req.file) {
    result.push(req.file);
  }
  return result;
}
