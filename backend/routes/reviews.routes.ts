import type { Request, Response, Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import { apiCache } from '../services/cache';
import type { PropertyRow } from '../services/transformers';
import { authenticateToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { reviewSchema, validateBody } from '../middleware/validation';
import { generateId } from '../utils/id';
import type { UserRow } from './auth.routes';

interface ReviewRow extends RowDataPacket {
  id: string;
  propertyId: string;
  propertyName: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
}

export function registerReviewRoutes(router: Router): void {
  router.get('/reviews', async (req: Request, res: Response) => {
    const { propertyId, userId } = req.query;
    const cacheKey = `reviews:${propertyId || 'all'}:${userId || 'all'}`;

    const cachedReviews = apiCache.get<ReviewRow[]>(cacheKey);
    if (cachedReviews) {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      return res.json(cachedReviews);
    }

    try {
      let sql = 'SELECT * FROM reviews WHERE 1=1';
      const params: string[] = [];

      if (propertyId) {
        sql += ' AND propertyId = ?';
        params.push(String(propertyId));
      }
      if (userId) {
        sql += ' AND userId = ?';
        params.push(String(userId));
      }

      const [rows] = await pool.query<ReviewRow[]>(sql, params);
      apiCache.set(cacheKey, rows, 60);

      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      res.json(rows);
    } catch (err: unknown) {
      console.error("Error in GET /api/reviews:", err);
      res.status(500).json({ error: 'Internal Server Error', message: "Gagal mengambil data review." });
    }
  });

  router.post(
    '/reviews',
    authenticateToken,
    validateBody(reviewSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const { propertyId, rating, comment } = req.body as { propertyId: string; rating: number | string; comment: string };
      const authUser = req.user;
      if (!authUser?.id) {
        return res.status(401).json({ message: "Akses ditolak. Token otentikasi diperlukan." });
      }
      const userId = authUser.id;

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [propRows] = await connection.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [propertyId]);
        const property = propRows[0];
        if (!property) {
          await connection.rollback();
          return res.status(404).json({ message: "Properti tidak ditemukan." });
        }

        // Fetch user name from database or fallback to user email
        const [userRows] = await connection.query<UserRow[]>('SELECT name FROM users WHERE id = ?', [userId]);
        const userName = userRows[0]?.name || authUser.email.split('@')[0] || "Anonim";

        const revId = generateId("rev");
        const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

        await connection.query(
          `INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [revId, propertyId, property.name, userId, userName, parseInt(String(rating), 10), comment, dateStr]
        );

        // Recalculate average rating for property
        await connection.query(`
          UPDATE properties
          SET rating = COALESCE((
            SELECT ROUND(AVG(rating), 1)
            FROM reviews
            WHERE propertyId = ?
          ), 0.0)
          WHERE id = ?
        `, [propertyId, propertyId]);

        await connection.commit();
        apiCache.invalidatePattern('reviews');
        apiCache.invalidatePattern('properties');
        res.status(201).json({ message: "Review berhasil ditambahkan!" });
      } catch (err) {
        await connection.rollback();
        console.error("Create review error:", err);
        res.status(500).json({ message: "Gagal menyimpan review." });
      } finally {
        connection.release();
      }
    }
  );

  router.put('/reviews/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const authUser = req.user;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<ReviewRow[]>('SELECT * FROM reviews WHERE id = ?', [id]);
      const review = rows[0];
      if (!review) {
        await connection.rollback();
        return res.status(404).json({ message: "Review tidak ditemukan." });
      }

      if (authUser?.role !== 'admin' && review.userId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: "Akses ditolak. Anda tidak memiliki izin untuk mengubah ulasan ini." });
      }

      const updatedRating = rating !== undefined ? parseInt(String(rating), 10) : review.rating;
      const updatedComment = comment !== undefined ? comment : review.comment;

      await connection.query(
        'UPDATE reviews SET rating = ?, comment = ? WHERE id = ?',
        [updatedRating, updatedComment, id]
      );

      // Recalculate average rating for property
      await connection.query(`
        UPDATE properties
        SET rating = COALESCE((
          SELECT ROUND(AVG(rating), 1)
          FROM reviews
          WHERE propertyId = ?
        ), 0.0)
        WHERE id = ?
      `, [review.propertyId, review.propertyId]);

      await connection.commit();
      apiCache.invalidatePattern('reviews');
      apiCache.invalidatePattern('properties');
      res.json({ message: "Review berhasil diperbarui!" });
    } catch (err) {
      await connection.rollback();
      console.error("Update review error:", err);
      res.status(500).json({ message: "Gagal memperbarui review." });
    } finally {
      connection.release();
    }
  });

  router.delete('/reviews/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const authUser = req.user;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<ReviewRow[]>('SELECT * FROM reviews WHERE id = ?', [id]);
      const review = rows[0];
      if (!review) {
        await connection.rollback();
        return res.status(404).json({ message: "Review tidak ditemukan." });
      }

      if (authUser?.role !== 'admin' && review.userId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: "Akses ditolak. Anda tidak memiliki izin untuk menghapus ulasan ini." });
      }

      await connection.query('DELETE FROM reviews WHERE id = ?', [id]);

      // Recalculate average rating for property
      await connection.query(`
        UPDATE properties
        SET rating = COALESCE((
          SELECT ROUND(AVG(rating), 1)
          FROM reviews
          WHERE propertyId = ?
        ), 0.0)
        WHERE id = ?
      `, [review.propertyId, review.propertyId]);

      await connection.commit();
      apiCache.invalidatePattern('reviews');
      apiCache.invalidatePattern('properties');
      res.json({ message: "Review berhasil dihapus!" });
    } catch (err) {
      await connection.rollback();
      console.error("Delete review error:", err);
      res.status(500).json({ message: "Gagal menghapus review." });
    } finally {
      connection.release();
    }
  });
}
