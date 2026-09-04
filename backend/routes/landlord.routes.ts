import type { Request, Response, Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import { apiCache } from '../services/cache';
import { authenticateToken, requireRole } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { generateId } from '../utils/id';
import type { UserRow } from './auth.routes';

export interface WithdrawalRow extends RowDataPacket {
  id: string;
  userId: string;
  bankName: string;
  accountNumber: string;
  accountHolder?: string;
  amount: number | string;
  date: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  referenceId?: string;
  rejectionReason?: string;
  processedAt?: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
}

interface PropertyStatsAgg extends RowDataPacket {
  totalProperti: number;
  totalRooms: number;
  occupiedRooms: number;
}

interface ReviewCountAgg extends RowDataPacket {
  reviewsCount: number;
}

interface MonthlyRevenueAgg extends RowDataPacket {
  month: string;
  revenue: number;
  transactions: number;
}

interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  propertyName?: string;
  price?: number;
  startDate?: string;
  status: 'active' | 'terminated' | 'pending' | 'cancelled';
}

const handleLandlordStats = async (req: AuthenticatedRequest, res: Response) => {
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }

  const landlordId = authUser.role === 'admin' && req.query.landlordId
    ? String(req.query.landlordId)
    : authUser.id;

  const cacheKey = `landlord:stats:${landlordId}`;
  const cached = apiCache.get<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const [
      [userRows],
      [propAggRows],
      [reviewCountRows],
      [withdrawals]
    ] = await Promise.all([
      pool.query<UserRow[]>('SELECT id, balance, totalRevenue, totalWithdrawn FROM users WHERE id = ?', [landlordId]),
      pool.query<PropertyStatsAgg[]>(
        `SELECT 
           COUNT(id) as totalProperti,
           COALESCE(SUM(totalRooms), 0) as totalRooms,
           COALESCE(SUM(occupiedRooms), 0) as occupiedRooms
         FROM properties
         WHERE ownerId = ?`,
        [landlordId]
      ),
      pool.query<ReviewCountAgg[]>(
        `SELECT COUNT(r.id) as reviewsCount
         FROM reviews r 
         JOIN properties p ON r.propertyId = p.id 
         WHERE p.ownerId = ?`, 
        [landlordId]
      ),
      pool.query<WithdrawalRow[]>(
        'SELECT * FROM withdrawals WHERE userId = ? ORDER BY date DESC LIMIT 50', 
        [landlordId]
      )
    ]);

    const landlord = userRows[0];
    if (!landlord) {
      return res.status(404).json({ message: "Landlord tidak ditemukan." });
    }

    const totalProperti = Number(propAggRows[0]?.totalProperti || 0);
    const totalRooms = Number(propAggRows[0]?.totalRooms || 0);
    const occupiedRooms = Number(propAggRows[0]?.occupiedRooms || 0);
    const occupancyRate = totalRooms > 0 ? parseFloat(((occupiedRooms / totalRooms) * 100).toFixed(1)) : 0;
    const reviewsCount = Number(reviewCountRows[0]?.reviewsCount || 0);

    const responseData = {
      balance: parseFloat(String(landlord.balance || 0)),
      totalRevenue: parseFloat(String(landlord.totalRevenue || 0)),
      totalWithdrawn: parseFloat(String(landlord.totalWithdrawn || 0)),
      totalProperti,
      totalRooms,
      occupiedRooms,
      occupancyRate,
      activeTenants: occupiedRooms,
      withdrawals,
      reviewsCount
    };

    apiCache.set(cacheKey, responseData, 15000);
    res.json(responseData);
  } catch (err) {
    console.error("Get stats error:", err);
    res.status(500).json({ message: "Gagal memuat statistik dasbor." });
  }
};

export function registerLandlordRoutes(router: Router): void {
  router.get('/stats', authenticateToken, requireRole(['admin', 'landlord', 'owner']), handleLandlordStats);
  router.get('/landlord/stats', authenticateToken, requireRole(['admin', 'landlord', 'owner']), handleLandlordStats);

  router.get('/landlord/financials', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }

    const landlordId = (authUser.role === 'admin' && req.query.landlordId)
      ? String(req.query.landlordId)
      : authUser.id;

    const cacheKey = `landlord:financials:${landlordId}`;
    const cached = apiCache.get<Record<string, unknown>>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    try {
      const [
        [userRows],
        [propAggRows],
        [monthlyRevenueRows],
        [withdrawals]
      ] = await Promise.all([
        pool.query<UserRow[]>('SELECT id, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder FROM users WHERE id = ?', [landlordId]),
        pool.query<PropertyStatsAgg[]>(
          `SELECT 
             COUNT(id) as totalProperti,
             COALESCE(SUM(totalRooms), 0) as totalRooms,
             COALESCE(SUM(occupiedRooms), 0) as occupiedRooms
           FROM properties
           WHERE ownerId = ?`,
          [landlordId]
        ),
        pool.query<MonthlyRevenueAgg[]>(
          `SELECT 
             COALESCE(DATE_FORMAT(STR_TO_DATE(r.startDate, '%Y-%m-%d'), '%Y-%m'), DATE_FORMAT(r.contract_signed_at, '%Y-%m')) as month,
             COALESCE(SUM(r.price), 0) as revenue,
             COUNT(r.id) as transactions
           FROM rentals r
           JOIN properties p ON r.propertyId = p.id
           WHERE p.ownerId = ? AND r.status IN ('active', 'completed')
           GROUP BY month
           ORDER BY month DESC
           LIMIT 12`,
          [landlordId]
        ),
        pool.query<WithdrawalRow[]>(
          'SELECT * FROM withdrawals WHERE userId = ? ORDER BY id DESC LIMIT 50',
          [landlordId]
        )
      ]);

      const landlord = userRows[0];
      if (!landlord) {
        return res.status(404).json({ message: "Landlord tidak ditemukan." });
      }

      const totalProperti = Number(propAggRows[0]?.totalProperti || 0);
      const totalRooms = Number(propAggRows[0]?.totalRooms || 0);
      const occupiedRooms = Number(propAggRows[0]?.occupiedRooms || 0);
      const occupancyRate = totalRooms > 0 ? parseFloat(((occupiedRooms / totalRooms) * 100).toFixed(1)) : 0;

      const responseData = {
        balance: parseFloat(String(landlord.balance || 0)),
        totalRevenue: parseFloat(String(landlord.totalRevenue || 0)),
        totalWithdrawn: parseFloat(String(landlord.totalWithdrawn || 0)),
        bankName: landlord.bankName || '',
        bankAccountNumber: landlord.bankAccountNumber || '',
        bankAccountHolder: landlord.bankAccountHolder || '',
        totalProperti,
        totalRooms,
        occupiedRooms,
        occupancyRate,
        activeTenants: occupiedRooms,
        monthlyRevenue: monthlyRevenueRows,
        withdrawals
      };

      apiCache.set(cacheKey, responseData, 15000);
      res.json(responseData);
    } catch (err) {
      console.error("Get landlord financials error:", err);
      res.status(500).json({ message: "Gagal memuat data keuangan landlord." });
    }
  });

  router.get('/withdrawals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }

    const targetUserId = authUser.role === 'admin'
      ? (req.query.userId ? String(req.query.userId) : null)
      : authUser.id;

    try {
      let sql = 'SELECT * FROM withdrawals WHERE 1=1';
      const params: string[] = [];
      if (targetUserId) {
        sql += ' AND userId = ?';
        params.push(targetUserId);
      }
      sql += ' ORDER BY id DESC LIMIT 50';
      const [rows] = await pool.query<WithdrawalRow[]>(sql, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: "Gagal mengambil data penarikan." });
    }
  });

  router.get('/withdrawals/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }
    const userId = authUser.id;
    try {
      const [rows] = await pool.query<WithdrawalRow[]>('SELECT * FROM withdrawals WHERE userId = ? ORDER BY id DESC LIMIT 50', [userId]);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: "Gagal mengambil data penarikan." });
    }
  });

  router.get('/landlord/rentals', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }

    const landlordId = (authUser.role === 'admin' && req.query.landlordId)
      ? String(req.query.landlordId)
      : authUser.id;
    try {
      const [rows] = await pool.query<RentalRow[]>(
        `SELECT r.*, p.name as propertyName FROM rentals r 
         JOIN properties p ON r.propertyId = p.id 
         WHERE p.ownerId = ? ORDER BY r.id DESC LIMIT 50`,
        [landlordId]
      );
      res.json(rows);
    } catch (err) {
      console.error("Get landlord rentals error:", err);
      res.status(500).json({ message: "Gagal mengambil data sewa landlord." });
    }
  });

  router.post('/withdraw', authenticateToken, requireRole(['admin', 'landlord']), async (req: AuthenticatedRequest, res: Response) => {
    const { amount, bankName, accountNumber, accountHolder, userId } = req.body;
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }

    if (!amount || !bankName || !accountNumber) {
      return res.status(400).json({ message: "Jumlah, nama bank, dan nomor rekening wajib diisi." });
    }

    const targetUserId = (authUser.role === 'admin' && userId) ? userId : authUser.id;
    const withdrawAmount = parseFloat(String(amount));

    if (withdrawAmount <= 0 || isNaN(withdrawAmount)) {
      return res.status(400).json({ message: "Jumlah penarikan harus lebih besar dari 0." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<UserRow[]>('SELECT * FROM users WHERE id = ? FOR UPDATE', [targetUserId]);
      const user = rows[0];
      if (!user) {
        await connection.rollback();
        return res.status(404).json({ message: "User tidak ditemukan." });
      }

      if (parseFloat(String(user.balance || 0)) < withdrawAmount) {
        await connection.rollback();
        return res.status(400).json({ message: "Saldo tidak mencukupi." });
      }

      // Deduct balance upfront (totalWithdrawn is incremented only when admin marks status as completed)
      const newBalance = parseFloat(String(user.balance || 0)) - withdrawAmount;
      const currentWithdrawn = parseFloat(String(user.totalWithdrawn || 0));

      await connection.query(
        'UPDATE users SET balance = ? WHERE id = ?',
        [newBalance, targetUserId]
      );

      const withdrawalId = generateId("w");
      const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const holder = accountHolder || user.bankAccountHolder || user.name || '';

      await connection.query(
        `INSERT INTO withdrawals (id, userId, bankName, accountNumber, accountHolder, amount, date, status, referenceId, rejectionReason, processedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '', '', '')`,
        [withdrawalId, targetUserId, bankName, accountNumber, holder, withdrawAmount, dateStr]
      );

      await connection.commit();
      apiCache.invalidatePattern('landlord:');
      res.json({
        message: "Permintaan penarikan dana berhasil diajukan dan sedang menunggu proses.",
        withdrawalId,
        balance: newBalance,
        totalWithdrawn: currentWithdrawn,
        status: 'pending'
      });
    } catch (err) {
      await connection.rollback();
      console.error("Withdrawal error:", err);
      res.status(500).json({ message: "Gagal memproses penarikan dana." });
    } finally {
      connection.release();
    }
  });

  router.get('/admin/withdrawals', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
    const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const offsetParam = req.query.offset ? parseInt(String(req.query.offset), 10) : (limitParam ? (pageParam - 1) * limitParam : 0);

    try {
      let sql = `
        SELECT w.*, u.name as userName, u.email as userEmail, u.phone as userPhone
        FROM withdrawals w
        LEFT JOIN users u ON w.userId = u.id
        ORDER BY w.date DESC
      `;
      const params: (string | number)[] = [];

      if (limitParam && limitParam > 0) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(limitParam, Math.max(0, offsetParam));
      }

      const [rows] = await pool.query<WithdrawalRow[]>(sql, params);
      res.json(rows);
    } catch (err) {
      console.error("Get admin withdrawals error:", err);
      res.status(500).json({ message: "Gagal mengambil data penarikan dana." });
    }
  });

  router.post('/admin/withdrawals/:id/process', authenticateToken, requireRole(['admin']), async (req: Request<{ id: string }, unknown, { status?: 'processing' | 'completed'; referenceId?: string }>, res: Response) => {
    const { id } = req.params;
    const targetStatus = req.body?.status || 'completed';
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<WithdrawalRow[]>('SELECT * FROM withdrawals WHERE id = ? FOR UPDATE', [id]);
      const withdrawal = rows[0];
      if (!withdrawal) {
        await connection.rollback();
        return res.status(404).json({ message: "Permintaan penarikan tidak ditemukan." });
      }

      if (withdrawal.status === 'completed') {
        await connection.rollback();
        return res.status(400).json({ message: "Penarikan sudah berhasil diproses sebelumnya." });
      }

      if (withdrawal.status === 'rejected') {
        await connection.rollback();
        return res.status(400).json({ message: "Penarikan yang sudah ditolak tidak dapat diproses." });
      }

      const refId = req.body?.referenceId || withdrawal.referenceId || `REF-${Date.now().toString(36).toUpperCase()}`;
      const processedAt = new Date().toISOString();

      // Increment totalWithdrawn upon successful completion
      if (targetStatus === 'completed') {
        await connection.query(
          'UPDATE users SET totalWithdrawn = totalWithdrawn + ? WHERE id = ?',
          [withdrawal.amount, withdrawal.userId]
        );
      }

      await connection.query(
        "UPDATE withdrawals SET status = ?, referenceId = ?, processedAt = ? WHERE id = ?", 
        [targetStatus, refId, processedAt, id]
      );

      await connection.commit();
      apiCache.invalidatePattern('landlord:');
      res.json({
        message: targetStatus === 'completed' 
          ? "Disbursement berhasil diproses dan status diselesaikan." 
          : "Status pencairan dana diperbarui ke sedang diproses.",
        withdrawalId: id,
        status: targetStatus,
        referenceId: refId,
        processedAt
      });
    } catch (err: unknown) {
      await connection.rollback();
      console.error("Process withdrawal error:", err);
      res.status(500).json({ message: "Gagal memproses pencairan dana." });
    } finally {
      connection.release();
    }
  });

  router.post('/admin/withdrawals/:id/reject', authenticateToken, requireRole(['admin']), async (req: Request<{ id: string }, unknown, { reason?: string }>, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<WithdrawalRow[]>('SELECT * FROM withdrawals WHERE id = ? FOR UPDATE', [id]);
      const withdrawal = rows[0];
      if (!withdrawal) {
        await connection.rollback();
        return res.status(404).json({ message: "Permintaan penarikan tidak ditemukan." });
      }

      if (withdrawal.status === 'rejected') {
        await connection.rollback();
        return res.status(400).json({ message: "Penarikan sudah pernah ditolak." });
      }

      if (withdrawal.status === 'completed') {
        await connection.rollback();
        return res.status(400).json({ message: "Penarikan yang sudah selesai tidak dapat ditolak." });
      }

      const withdrawAmount = parseFloat(String(withdrawal.amount));

      // Reverse balance deduction
      await connection.query(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [withdrawAmount, withdrawal.userId]
      );

      const rejectionReason = reason || "Pencairan dana ditolak oleh administrator";
      const processedAt = new Date().toISOString();

      await connection.query(
        "UPDATE withdrawals SET status = 'rejected', rejectionReason = ?, processedAt = ? WHERE id = ?", 
        [rejectionReason, processedAt, id]
      );

      await connection.commit();
      apiCache.invalidatePattern('landlord:');
      res.json({
        message: "Penarikan berhasil ditolak dan saldo telah dikembalikan ke akun landlord.",
        withdrawalId: id,
        status: 'rejected',
        reason: rejectionReason,
        processedAt
      });
    } catch (err: unknown) {
      await connection.rollback();
      console.error("Reject withdrawal error:", err);
      res.status(500).json({ message: "Gagal menolak penarikan dana." });
    } finally {
      connection.release();
    }
  });
}
