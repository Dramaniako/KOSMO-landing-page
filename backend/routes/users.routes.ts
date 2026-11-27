import type { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import { apiCache } from '../services/cache';
import { authenticateToken, requireRole } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  validateBody
} from '../middleware/validation';
import type { UserRole } from '../types/index';
import { generateId } from '../utils/id';
import type { UserRow } from './auth.routes';

interface AdminCreateUserBody {
  email?: string;
  password?: string;
  name?: string;
  role?: UserRole;
  phone?: string;
  paymentMethod?: string;
}

interface AdminUpdateUserBody {
  name?: string;
  email?: string;
  role?: UserRole;
  phone?: string;
  paymentMethod?: string;
  password?: string;
}

export function registerUserRoutes(router: Router): void {
  // Admin Route: Get all users (with limit/page/offset pagination & X-Total-Count)
  const handleGetUsers = async (req: Request, res: Response) => {
    try {
      const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
      const rawPage = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
      const rawOffset = req.query.offset
        ? parseInt(String(req.query.offset), 10)
        : (page - 1) * limit;
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

      const [[rows], [countRows]] = await Promise.all([
        pool.query<UserRow[]>(
          'SELECT id, email, name, role, phone, paymentMethod, balance, totalRevenue, totalWithdrawn FROM users ORDER BY id DESC LIMIT ? OFFSET ?',
          [limit, offset]
        ),
        pool.query<RowDataPacket[]>('SELECT COUNT(*) as total FROM users')
      ]);

      const totalCount = Number(countRows[0]?.total || rows.length);
      res.setHeader('X-Total-Count', String(totalCount));
      res.json(rows);
    } catch (err: unknown) {
      console.error("Get users error:", err);
      res.status(500).json({ message: "Gagal mengambil data user." });
    }
  };

  router.get('/users', authenticateToken, requireRole(['admin']), handleGetUsers);
  router.get('/admin/users', authenticateToken, requireRole(['admin']), handleGetUsers);

  // Admin Route: Create user
  router.post(
    '/users',
    authenticateToken,
    requireRole(['admin']),
    validateBody(adminCreateUserSchema),
    async (req: Request<Record<string, never>, unknown, AdminCreateUserBody>, res: Response) => {
      const { email, password, name, role, phone, paymentMethod } = req.body;
      if (!email || !password || !name || !role) {
        return res.status(400).json({ message: "Nama, email, password, dan role wajib diisi." });
      }

      try {
        const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length > 0) {
          return res.status(400).json({ message: "Email sudah terdaftar." });
        }

        const userId = generateId("user");
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
          `INSERT INTO users (id, email, password, name, role, phone, paymentMethod) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, email, hashedPassword, name, role, phone || '', paymentMethod || 'Virtual Account']
        );

        apiCache.invalidatePattern('admin:');
        res.status(201).json({ message: "User berhasil dibuat!" });
      } catch (err) {
        res.status(500).json({ message: "Gagal membuat user." });
      }
    }
  );

  // Admin Route: Update user role / details
  router.put(
    '/users/:id',
    authenticateToken,
    requireRole(['admin']),
    validateBody(adminUpdateUserSchema),
    async (req: Request<{ id: string }, unknown, AdminUpdateUserBody>, res: Response) => {
      const { id } = req.params;
      const { name, email, role, phone, paymentMethod, password } = req.body;

      try {
        const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
        if (rows.length === 0) {
          return res.status(404).json({ message: "User tidak ditemukan." });
        }

        if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          await pool.query(
            `UPDATE users SET name = ?, email = ?, role = ?, phone = ?, paymentMethod = ?, password = ? WHERE id = ?`,
            [name, email, role, phone || '', paymentMethod || '', hashedPassword, id]
          );
        } else {
          await pool.query(
            `UPDATE users SET name = ?, email = ?, role = ?, phone = ?, paymentMethod = ? WHERE id = ?`,
            [name, email, role, phone || '', paymentMethod || '', id]
          );
        }

        apiCache.invalidatePattern('admin:');
        apiCache.invalidatePattern('landlord:');
        res.json({ message: "User berhasil diperbarui!" });
      } catch (err) {
        res.status(500).json({ message: "Gagal memperbarui user." });
      }
    }
  );

  // Admin Route: Delete user
  router.delete('/users/:id', authenticateToken, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { password } = (req.body || {}) as { password?: string };
    const authUser = req.user;

    if (id === 'user-admin') {
      return res.status(400).json({ message: "Admin utama tidak dapat dihapus." });
    }

    if (authUser?.id === id) {
      return res.status(400).json({ message: "Anda tidak dapat menghapus akun Anda sendiri." });
    }

    if (!password) {
      return res.status(400).json({ message: "Password konfirmasi administrator diperlukan." });
    }

    try {
      const [adminRows] = await pool.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [authUser?.id]);
      const admin = adminRows[0];
      const isMatch = (admin && admin.password) ? await bcrypt.compare(password, admin.password) : false;
      if (!admin || !admin.password || !isMatch) {
        return res.status(401).json({ message: "Password administrator salah." });
      }

      // Guard 1: Prevent deleting user with active or pending rentals to avoid inventory allocation leak
      const [activeRentals] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) as activeCount FROM rentals WHERE tenantId = ? AND status IN ('active', 'pending')",
        [id]
      );
      if (Number(activeRentals[0]?.activeCount || 0) > 0) {
        return res.status(409).json({
          message: "Pengguna tidak dapat dihapus karena masih memiliki sewa aktif atau pesanan menunggu pembayaran."
        });
      }

      // Guard 2: Prevent deleting landlord who still owns properties
      const [ownedProps] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) as propCount FROM properties WHERE ownerId = ?',
        [id]
      );
      if (Number(ownedProps[0]?.propCount || 0) > 0) {
        return res.status(409).json({
          message: "Pengguna tidak dapat dihapus karena masih memiliki properti kos yang terdaftar."
        });
      }

      await pool.query('DELETE FROM users WHERE id = ?', [id]);
      apiCache.invalidatePattern('admin:');
      apiCache.invalidatePattern('landlord:');
      res.json({ message: "User berhasil dihapus!" });
    } catch (err) {
      res.status(500).json({ message: "Gagal menghapus user." });
    }
  });
}
