import type { Request, Response, Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import { apiCache } from '../services/cache';
import { authenticateToken, requireRole } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { uploadLimiter } from './system.routes';
import {
  handleMultiPhotoUpload,
  extractUploadedFiles,
  validateImageMimeType,
  type MulterFilesRequest
} from '../middleware/upload';
import { uploadImageStream, deleteCloudinaryImage } from '../services/cloudinary';
import { reorderPhotosSchema, validateBody } from '../middleware/validation';
import { generateId } from '../utils/id';
import {
  VALID_PHOTO_CATEGORIES,
  type PropertyPhoto,
  type PropertyPhotoRow,
  type PhotoCategory
} from '../types/index';
import type { PropertyRow } from '../services/transformers';

interface PhotoWithPropertyRow extends RowDataPacket {
  id: string;
  propertyId: string;
  roomId: string | null;
  url: string;
  publicId: string | null;
  category: PhotoCategory;
  caption: string | null;
  orderIndex: number;
  createdAt: Date | string;
  ownerId: string;
  propertyImage: string | null;
}

export function formatPhotoResponse(row: {
  id: string;
  propertyId: string;
  roomId?: string | null;
  url: string;
  publicId?: string | null;
  category: PhotoCategory | string;
  caption?: string | null;
  orderIndex: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}): PropertyPhoto {
  return {
    id: String(row.id),
    propertyId: String(row.propertyId),
    roomId: row.roomId ? String(row.roomId) : null,
    url: String(row.url),
    publicId: row.publicId ? String(row.publicId) : null,
    category: row.category as PhotoCategory,
    caption: row.caption ? String(row.caption) : '',
    orderIndex: Number(row.orderIndex),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function registerPhotoRoutes(router: Router): void {
  // -------------------------------------------------------------------------
  // 1. GET /api/properties/:id/photos
  // -------------------------------------------------------------------------
  router.get('/properties/:id/photos', async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const categoryQuery = typeof req.query.category === 'string' ? req.query.category.trim() : undefined;
    const roomIdQuery = typeof req.query.roomId === 'string' ? req.query.roomId.trim() : undefined;

    if (categoryQuery && !VALID_PHOTO_CATEGORIES.includes(categoryQuery as PhotoCategory)) {
      return res.status(400).json({
        message: `Kategori foto '${categoryQuery}' tidak valid. Pilihan: ${VALID_PHOTO_CATEGORIES.join(', ')}`
      });
    }

    const cacheKey = `properties:${id}:photos:${categoryQuery || 'all'}:${roomIdQuery || 'all'}`;
    const cached = apiCache.get<PropertyPhoto[]>(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      return res.json(cached);
    }

    try {
      const [propRows] = await pool.query<PropertyRow[]>(
        'SELECT id FROM properties WHERE id = ?',
        [id]
      );
      if (propRows.length === 0) {
        return res.status(404).json({ message: 'Properti tidak ditemukan.' });
      }

      let sql = 'SELECT * FROM property_photos WHERE propertyId = ?';
      const params: (string | null)[] = [id];

      if (categoryQuery) {
        sql += ' AND category = ?';
        params.push(categoryQuery);
      }

      if (roomIdQuery !== undefined) {
        if (roomIdQuery.toLowerCase() === 'null' || roomIdQuery.toLowerCase() === 'property') {
          sql += ' AND (roomId IS NULL OR roomId = "")';
        } else {
          sql += ' AND roomId = ?';
          params.push(roomIdQuery);
        }
      }

      sql += ' ORDER BY orderIndex ASC, createdAt ASC';

      const [rows] = await pool.query<PropertyPhotoRow[]>(sql, params);
      const photos: PropertyPhoto[] = rows.map(formatPhotoResponse);

      apiCache.set(cacheKey, photos, 30);
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      return res.json(photos);
    } catch (err: unknown) {
      console.error('GET /api/properties/:id/photos error:', err);
      return res.status(500).json({ message: 'Gagal mengambil galeri foto properti.' });
    }
  });

  // -------------------------------------------------------------------------
  // 2. POST /api/properties/:id/photos
  // -------------------------------------------------------------------------
  router.post(
    '/properties/:id/photos',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    uploadLimiter,
    handleMultiPhotoUpload,
    async (req: AuthenticatedRequest, res: Response) => {
      const propertyId = String(req.params.id);
      const authUser = req.user;
      const files = extractUploadedFiles(req as MulterFilesRequest);

      if (files.length === 0) {
        return res.status(400).json({ message: 'Minimal 1 file foto wajib diunggah dalam field "images".' });
      }
      if (files.length > 10) {
        return res.status(400).json({ message: 'Maksimal 10 file foto dapat diunggah sekaligus.' });
      }

      for (const file of files) {
        if (!validateImageMimeType(file.mimetype)) {
          return res.status(400).json({
            message: `Format file '${file.originalname}' tidak didukung. Harap unggah gambar (JPEG, PNG, WebP, GIF).`
          });
        }
      }

      const rawCategory = typeof req.body.category === 'string' ? req.body.category.trim() : undefined;
      if (rawCategory !== undefined && (!rawCategory || !VALID_PHOTO_CATEGORIES.includes(rawCategory as PhotoCategory))) {
        return res.status(400).json({
          message: `Kategori '${req.body.category}' tidak valid. Pilihan: ${VALID_PHOTO_CATEGORIES.join(', ')}`
        });
      }
      const targetCategory: PhotoCategory = (rawCategory as PhotoCategory) || 'other';

      const rawRoomId = typeof req.body.roomId === 'string' && req.body.roomId.trim() ? req.body.roomId.trim() : null;
      const caption = typeof req.body.caption === 'string' ? req.body.caption.trim().slice(0, 255) : '';

      // Verify property existence & ownership
      const [propRows] = await pool.query<PropertyRow[]>(
        'SELECT id, ownerId, image FROM properties WHERE id = ?',
        [propertyId]
      );
      if (propRows.length === 0) {
        return res.status(404).json({ message: 'Properti tidak ditemukan.' });
      }
      const property = propRows[0];

      if (authUser?.role !== 'admin' && property.ownerId !== authUser?.id) {
        return res.status(403).json({ message: 'Akses ditolak. Anda bukan pemilik properti ini.' });
      }

      // Verify room ownership if roomId provided
      if (rawRoomId) {
        const [roomRows] = await pool.query<RowDataPacket[]>(
          'SELECT id FROM rooms WHERE id = ? AND propertyId = ?',
          [rawRoomId, propertyId]
        );
        if (roomRows.length === 0) {
          return res.status(400).json({ message: 'Kamar tidak ditemukan pada properti ini.' });
        }
      }

      // Stream buffers to Cloudinary
      let uploadResults;
      try {
        uploadResults = await Promise.all(
          files.map((file) => uploadImageStream(file.buffer, 'kosmo_properties'))
        );
      } catch (cloudErr) {
        console.error('Cloudinary multi-photo upload error:', cloudErr);
        return res.status(500).json({ message: 'Gagal mengunggah foto ke Cloudinary.' });
      }

      // Database transaction
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [maxRows] = await connection.query<RowDataPacket[]>(
          'SELECT COALESCE(MAX(orderIndex), -1) AS maxOrder FROM property_photos WHERE propertyId = ? FOR UPDATE',
          [propertyId]
        );
        let nextOrder = Number(maxRows[0]?.maxOrder ?? -1) + 1;

        const createdPhotos: PropertyPhoto[] = [];

        for (let i = 0; i < uploadResults.length; i++) {
          const uploadRes = uploadResults[i];
          const photoId = generateId('photo');

          await connection.query(
            `INSERT INTO property_photos (
              id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [photoId, propertyId, rawRoomId, uploadRes.secure_url, uploadRes.public_id, targetCategory, caption, nextOrder]
          );

          createdPhotos.push(
            formatPhotoResponse({
              id: photoId,
              propertyId,
              roomId: rawRoomId,
              url: uploadRes.secure_url,
              publicId: uploadRes.public_id,
              category: targetCategory,
              caption,
              orderIndex: nextOrder,
              createdAt: new Date()
            })
          );

          nextOrder++;
        }

        // If property has no image or category is 'thumbnail', update property image
        if ((!property.image || property.image.trim() === '' || targetCategory === 'thumbnail') && createdPhotos.length > 0) {
          await connection.query(
            'UPDATE properties SET image = ? WHERE id = ?',
            [createdPhotos[0].url, propertyId]
          );
        }

        await connection.commit();
        apiCache.invalidatePattern('properties');

        return res.status(201).json({
          message: `${createdPhotos.length} foto berhasil diunggah`,
          photos: createdPhotos
        });
      } catch (dbErr) {
        await connection.rollback();
        console.error('Database insertion error for property photos:', dbErr);
        return res.status(500).json({ message: 'Gagal menyimpan data foto properti.' });
      } finally {
        connection.release();
      }
    }
  );

  // -------------------------------------------------------------------------
  // 3. PUT /api/properties/:id/photos/reorder
  // -------------------------------------------------------------------------
  router.put(
    '/properties/:id/photos/reorder',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    validateBody(reorderPhotosSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const propertyId = String(req.params.id);
      const authUser = req.user;
      const { photoIds } = req.body as { photoIds: string[] };

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [propRows] = await connection.query<PropertyRow[]>(
          'SELECT id, ownerId FROM properties WHERE id = ? FOR UPDATE',
          [propertyId]
        );
        if (propRows.length === 0) {
          await connection.rollback();
          return res.status(404).json({ message: 'Properti tidak ditemukan.' });
        }
        const property = propRows[0];

        if (authUser?.role !== 'admin' && property.ownerId !== authUser?.id) {
          await connection.rollback();
          return res.status(403).json({ message: 'Akses ditolak. Anda bukan pemilik properti ini.' });
        }

        const [existingPhotos] = await connection.query<RowDataPacket[]>(
          'SELECT id, orderIndex FROM property_photos WHERE propertyId = ? FOR UPDATE',
          [propertyId]
        );
        const existingMap = new Set(existingPhotos.map((p) => p.id));

        const invalidIds = photoIds.filter((id) => !existingMap.has(id));
        if (invalidIds.length > 0) {
          await connection.rollback();
          return res.status(400).json({
            message: `Satu atau lebih foto tidak ditemukan pada properti ini: ${invalidIds.join(', ')}`
          });
        }

        for (let i = 0; i < photoIds.length; i++) {
          await connection.query(
            'UPDATE property_photos SET orderIndex = ? WHERE id = ? AND propertyId = ?',
            [i, photoIds[i], propertyId]
          );
        }

        // Offset any remaining photos not included in photoIds
        const reorderedSet = new Set(photoIds);
        const remaining = existingPhotos
          .filter((p) => !reorderedSet.has(p.id))
          .sort((a, b) => Number(a.orderIndex) - Number(b.orderIndex));
        for (let j = 0; j < remaining.length; j++) {
          await connection.query(
            'UPDATE property_photos SET orderIndex = ? WHERE id = ? AND propertyId = ?',
            [photoIds.length + j, remaining[j].id, propertyId]
          );
        }

        const [updatedRows] = await connection.query<PropertyPhotoRow[]>(
          'SELECT * FROM property_photos WHERE propertyId = ? ORDER BY orderIndex ASC, createdAt ASC',
          [propertyId]
        );

        await connection.commit();
        apiCache.invalidatePattern('properties');

        return res.json({
          message: 'Urutan foto berhasil diperbarui',
          photos: updatedRows.map(formatPhotoResponse)
        });
      } catch (err: unknown) {
        await connection.rollback();
        console.error('PUT /api/properties/:id/photos/reorder error:', err);
        return res.status(500).json({ message: 'Gagal memperbarui urutan foto.' });
      } finally {
        connection.release();
      }
    }
  );

  // -------------------------------------------------------------------------
  // 4. DELETE /api/properties/:id/photos/:photoId & DELETE /api/photos/:photoId
  // -------------------------------------------------------------------------
  const handleDeletePhoto = async (req: AuthenticatedRequest, res: Response) => {
    const targetPhotoId = String(req.params.photoId || req.params.id);
    const targetPropertyId = req.params.id ? String(req.params.id) : null;
    const authUser = req.user;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let querySql = `
        SELECT ph.id, ph.propertyId, ph.publicId, ph.url, ph.orderIndex, p.ownerId, p.image AS propertyImage
        FROM property_photos ph
        JOIN properties p ON ph.propertyId = p.id
        WHERE ph.id = ?
      `;
      const queryParams: string[] = [targetPhotoId];
      if (targetPropertyId) {
        querySql += ' AND ph.propertyId = ?';
        queryParams.push(targetPropertyId);
      }
      querySql += ' FOR UPDATE';

      const [rows] = await connection.query<PhotoWithPropertyRow[]>(querySql, queryParams);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Foto tidak ditemukan.' });
      }
      const photo = rows[0];

      if (authUser?.role !== 'admin' && photo.ownerId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: 'Akses ditolak. Anda bukan pemilik properti ini.' });
      }

      await connection.query('DELETE FROM property_photos WHERE id = ?', [targetPhotoId]);

      // Promote next photo if deleted photo was cover
      if (photo.propertyImage === photo.url) {
        const [nextPhotos] = await connection.query<PropertyPhotoRow[]>(
          'SELECT url FROM property_photos WHERE propertyId = ? ORDER BY orderIndex ASC LIMIT 1',
          [photo.propertyId]
        );
        if (nextPhotos.length > 0) {
          await connection.query('UPDATE properties SET image = ? WHERE id = ?', [nextPhotos[0].url, photo.propertyId]);
        }
      }

      await connection.commit();
      apiCache.invalidatePattern('properties');

      // Async Cloudinary deletion (resilient to external CDN errors)
      if (photo.publicId) {
        deleteCloudinaryImage(photo.publicId).catch((delErr) => {
          console.warn(`[Cloudinary] Non-fatal deletion error for ${photo.publicId}:`, delErr);
        });
      }

      return res.json({ message: 'Foto berhasil dihapus' });
    } catch (err: unknown) {
      await connection.rollback();
      console.error('DELETE photo error:', err);
      return res.status(500).json({ message: 'Gagal menghapus foto.' });
    } finally {
      connection.release();
    }
  };

  router.delete(
    '/properties/:id/photos/:photoId',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    handleDeletePhoto
  );
  router.delete(
    '/photos/:photoId',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    handleDeletePhoto
  );
}
