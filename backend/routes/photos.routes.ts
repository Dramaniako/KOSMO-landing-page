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

    // Parse and validate pagination parameters (Issue #82)
    let limit: number | undefined = undefined;
    let offset = 0;

    if (req.query.limit !== undefined) {
      const parsedLimit = parseInt(String(req.query.limit), 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({ message: 'Parameter limit harus berupa bilangan bulat positif (1-100).' });
      }
      limit = Math.min(parsedLimit, 100);
    }

    if (req.query.offset !== undefined) {
      const parsedOffset = parseInt(String(req.query.offset), 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return res.status(400).json({ message: 'Parameter offset harus berupa bilangan bulat non-negatif (>= 0).' });
      }
      offset = parsedOffset;
    }

    const cacheKey = `properties:${id}:photos:${categoryQuery || 'all'}:${roomIdQuery || 'all'}:${limit ?? 'all'}:${offset}`;
    const cached = apiCache.get<{ photos: PropertyPhoto[]; total: number; latestTimestamp: number } | PropertyPhoto[]>(cacheKey);
    if (cached) {
      const photos = Array.isArray(cached) ? cached : cached.photos;
      const total = Array.isArray(cached) ? cached.length : cached.total;
      const latestTimestamp = Array.isArray(cached)
        ? photos.reduce((max, p) => Math.max(max, new Date(p.updatedAt || p.createdAt || 0).getTime()), 0)
        : cached.latestTimestamp;

      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      res.setHeader('X-Total-Count', String(total));
      res.setHeader('X-Page-Limit', String(limit !== undefined ? limit : total));
      res.setHeader('X-Page-Offset', String(offset));

      if (latestTimestamp > 0) {
        const lastModifiedStr = new Date(latestTimestamp).toUTCString();
        res.setHeader('Last-Modified', lastModifiedStr);

        const ifModifiedSince = req.headers['if-modified-since'];
        if (ifModifiedSince && new Date(ifModifiedSince).getTime() >= Math.floor(latestTimestamp / 1000) * 1000) {
          return res.status(304).end();
        }
      }

      return res.json(photos);
    }

    try {
      const [propRows] = await pool.query<PropertyRow[]>(
        'SELECT id FROM properties WHERE id = ?',
        [id]
      );
      if (propRows.length === 0) {
        return res.status(404).json({ message: 'Properti tidak ditemukan.' });
      }

      let baseWhere = 'WHERE propertyId = ?';
      const baseParams: (string | number | null)[] = [id];

      if (categoryQuery) {
        baseWhere += ' AND category = ?';
        baseParams.push(categoryQuery);
      }

      // Clean SQL without disjunction for roomId (Issue #90)
      if (roomIdQuery !== undefined) {
        if (roomIdQuery.toLowerCase() === 'null' || roomIdQuery.toLowerCase() === 'property') {
          baseWhere += ' AND roomId IS NULL';
        } else {
          baseWhere += ' AND roomId = ?';
          baseParams.push(roomIdQuery);
        }
      }

      // Explicit column projection (Issue #79)
      let dataSql = `
        SELECT id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt, updatedAt
        FROM property_photos
        ${baseWhere}
        ORDER BY orderIndex ASC, createdAt ASC
      `;
      const dataParams: (string | number | null)[] = [...baseParams];

      if (limit !== undefined) {
        dataSql += ' LIMIT ? OFFSET ?';
        dataParams.push(limit, offset);
      }

      let photos: PropertyPhoto[];
      let total: number;
      let latestTimestamp = 0;

      if (limit !== undefined) {
        const countSql = `
          SELECT COUNT(*) as total, MAX(COALESCE(updatedAt, createdAt)) as maxModified
          FROM property_photos
          ${baseWhere}
        `;
        const [[countRows], [rows]] = await Promise.all([
          pool.query<RowDataPacket[]>(countSql, baseParams),
          pool.query<PropertyPhotoRow[]>(dataSql, dataParams)
        ]);
        total = Number(countRows[0]?.total ?? rows.length);
        photos = rows.map(formatPhotoResponse);
        if (countRows[0]?.maxModified) {
          latestTimestamp = new Date(countRows[0].maxModified).getTime();
        }
      } else {
        const [rows] = await pool.query<PropertyPhotoRow[]>(dataSql, dataParams);
        total = rows.length;
        photos = rows.map(formatPhotoResponse);
        latestTimestamp = photos.reduce((max, p) => {
          const t = new Date(p.updatedAt || p.createdAt || 0).getTime();
          return t > max ? t : max;
        }, 0);
      }

      apiCache.set(cacheKey, { photos, total, latestTimestamp }, 30);

      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      res.setHeader('X-Total-Count', String(total));
      res.setHeader('X-Page-Limit', String(limit !== undefined ? limit : total));
      res.setHeader('X-Page-Offset', String(offset));

      // HTTP 304 conditional caching (Issue #87)
      if (latestTimestamp > 0) {
        const lastModifiedStr = new Date(latestTimestamp).toUTCString();
        res.setHeader('Last-Modified', lastModifiedStr);

        const ifModifiedSince = req.headers['if-modified-since'];
        if (ifModifiedSince && new Date(ifModifiedSince).getTime() >= Math.floor(latestTimestamp / 1000) * 1000) {
          return res.status(304).end();
        }
      }

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

        const cleanRoomId = rawRoomId || null;
        const createdPhotos: PropertyPhoto[] = [];
        const valuePlaceholders: string[] = [];
        const flatParams: (string | number | null)[] = [];
        const now = new Date();

        for (let i = 0; i < uploadResults.length; i++) {
          const uploadRes = uploadResults[i];
          const photoId = generateId('photo');
          const currentOrder = nextOrder + i;

          valuePlaceholders.push('(?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())');
          flatParams.push(
            photoId,
            propertyId,
            cleanRoomId,
            uploadRes.secure_url,
            uploadRes.public_id,
            targetCategory,
            caption,
            currentOrder
          );

          createdPhotos.push(
            formatPhotoResponse({
              id: photoId,
              propertyId,
              roomId: cleanRoomId,
              url: uploadRes.secure_url,
              publicId: uploadRes.public_id,
              category: targetCategory,
              caption,
              orderIndex: currentOrder,
              createdAt: now,
              updatedAt: now
            })
          );
        }

        if (valuePlaceholders.length > 0) {
          await connection.query(
            `INSERT INTO property_photos (
              id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt, updatedAt
            ) VALUES ${valuePlaceholders.join(', ')}`,
            flatParams
          );
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
        apiCache.invalidatePattern('rooms');

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

        const reorderedSet = new Set(photoIds);
        const remaining = existingPhotos
          .filter((p) => !reorderedSet.has(p.id))
          .sort((a, b) => Number(a.orderIndex) - Number(b.orderIndex));

        const updates: { id: string; orderIndex: number }[] = [];
        for (let i = 0; i < photoIds.length; i++) {
          updates.push({ id: photoIds[i], orderIndex: i });
        }
        for (let j = 0; j < remaining.length; j++) {
          updates.push({ id: remaining[j].id, orderIndex: photoIds.length + j });
        }

        if (updates.length > 0) {
          const caseClauses = updates.map(() => 'WHEN ? THEN ?').join(' ');
          const caseParams: (string | number)[] = [];
          updates.forEach((u) => caseParams.push(u.id, u.orderIndex));
          const ids = updates.map((u) => u.id);
          const placeholders = ids.map(() => '?').join(', ');

          await connection.query(
            `UPDATE property_photos 
             SET orderIndex = CASE id ${caseClauses} END 
             WHERE id IN (${placeholders}) AND propertyId = ?`,
            [...caseParams, ...ids, propertyId]
          );
        }

        const [updatedRows] = await connection.query<PropertyPhotoRow[]>(
          `SELECT id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt, updatedAt
           FROM property_photos
           WHERE propertyId = ?
           ORDER BY orderIndex ASC, createdAt ASC`,
          [propertyId]
        );

        await connection.commit();
        apiCache.invalidatePattern('properties');
        apiCache.invalidatePattern('rooms');

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
      apiCache.invalidatePattern('rooms');

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
