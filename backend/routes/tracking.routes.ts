import type { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import XLSX from 'xlsx';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import { authenticateToken, requireRole } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { PropertyRow } from '../services/transformers';
import type { UserRow } from './auth.routes';
import { apiCache } from '../services/cache';

// Rate Limiter for Visitor Tracking
export const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak permintaan pelacakan.' }
});

interface CountRow extends RowDataPacket {
  count: number;
}

interface SumRow extends RowDataPacket {
  sum: number | null;
}

interface TrackingHistoryRow extends RowDataPacket {
  label_time?: string;
  label_date?: string;
  count: number;
}

interface VisitorTrackingRow extends RowDataPacket {
  ip_address: string;
  user_agent: string;
  visited_at: Date | string;
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

export function registerTrackingRoutes(router: Router): void {
  router.post('/tracking/visit', trackingLimiter, async (req: Request, res: Response) => {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const firstIp = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
    const ip = firstIp.split(',')[0].trim().substring(0, 255);
    const userAgent = String(req.headers['user-agent'] || '').substring(0, 1000);
    try {
      await pool.query(
        'INSERT INTO visitor_tracking (ip_address, user_agent) VALUES (?, ?)',
        [ip, userAgent]
      );
      apiCache.del('admin:stats');
      res.status(201).json({ message: "Kunjungan berhasil dilacak." });
    } catch (err: unknown) {
      console.error("Error in POST /api/tracking/visit:", err);
      res.status(500).json({ error: 'Internal Server Error', message: "Gagal melacak kunjungan." });
    }
  });

  router.get('/admin/stats', authenticateToken, requireRole(['admin']), async (_req: Request, res: Response) => {
    try {
      const cacheKey = 'admin:stats';
      const cached = apiCache.get<Record<string, number>>(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const [
        [visitorRows],
        [userRows],
        [landlordRows],
        [propertyRows],
        [roomsRows]
      ] = await Promise.all([
        pool.query<CountRow[]>('SELECT COUNT(*) as count FROM visitor_tracking'),
        pool.query<CountRow[]>('SELECT COUNT(*) as count FROM users'),
        pool.query<CountRow[]>("SELECT COUNT(*) as count FROM users WHERE role = 'landlord'"),
        pool.query<CountRow[]>('SELECT COUNT(*) as count FROM properties'),
        pool.query<SumRow[]>('SELECT COALESCE(SUM(totalRooms), 0) as sum FROM properties')
      ]);

      const totalVisitors = visitorRows[0]?.count || 0;
      const totalUsers = userRows[0]?.count || 0;
      const totalLandlords = landlordRows[0]?.count || 0;
      const totalProperties = propertyRows[0]?.count || 0;
      const totalRooms = Number(roomsRows[0]?.sum) || 0;

      const statsData = {
        totalVisitors,
        totalUsers,
        totalLandlords,
        totalProperties,
        totalRooms
      };
      apiCache.set(cacheKey, statsData, 15000);
      res.json(statsData);
    } catch (err) {
      console.error("Admin stats error:", err);
      res.status(500).json({ message: "Gagal mengambil statistik admin." });
    }
  });

  router.get('/admin/tracking-history', authenticateToken, requireRole(['admin']), async (_req: Request, res: Response) => {
    try {
      // 1. Last 24 Hours (grouped by hour)
      const [rows24h] = await pool.query<TrackingHistoryRow[]>(`
        SELECT 
          DATE_FORMAT(visited_at, '%Y-%m-%d %H:00:00') as label_time,
          COUNT(*) as count
        FROM visitor_tracking
        WHERE visited_at >= NOW() - INTERVAL 24 HOUR
        GROUP BY label_time
        ORDER BY label_time ASC
      `);

      // 2. Last 7 Days (grouped by day)
      const [rows7d] = await pool.query<TrackingHistoryRow[]>(`
        SELECT 
          DATE_FORMAT(visited_at, '%Y-%m-%d') as label_date,
          COUNT(*) as count
        FROM visitor_tracking
        WHERE visited_at >= DATE(NOW() - INTERVAL 6 DAY)
        GROUP BY label_date
        ORDER BY label_date ASC
      `);

      // 3. Last 30 Days (grouped by day)
      const [rows30d] = await pool.query<TrackingHistoryRow[]>(`
        SELECT 
          DATE_FORMAT(visited_at, '%Y-%m-%d') as label_date,
          COUNT(*) as count
        FROM visitor_tracking
        WHERE visited_at >= DATE(NOW() - INTERVAL 29 DAY)
        GROUP BY label_date
        ORDER BY label_date ASC
      `);

      // Post-process to fill gaps
      const now = new Date();
      
      // 24h helper
      const data24h: { label: string; count: number }[] = [];
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 60 * 60 * 1000);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const date = String(d.getDate()).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const labelKey = `${year}-${month}-${date} ${hour}:00:00`;
        const hourLabel = `${hour}:00`;
        
        const match = rows24h.find(r => r.label_time === labelKey);
        data24h.push({
          label: hourLabel,
          count: match ? match.count : 0
        });
      }

      // 7d helper
      const data7d: { label: string; count: number }[] = [];
      const daysName = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const date = String(d.getDate()).padStart(2, '0');
        const labelKey = `${year}-${month}-${date}`;
        const dayLabel = daysName[d.getDay()] + ` (${date}/${month})`;

        const match = rows7d.find(r => r.label_date === labelKey);
        data7d.push({
          label: dayLabel,
          count: match ? match.count : 0
        });
      }

      // 30d helper
      const data30d: { label: string; count: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const date = String(d.getDate()).padStart(2, '0');
        const labelKey = `${year}-${month}-${date}`;
        const dayLabel = `${date}/${month}`;

        const match = rows30d.find(r => r.label_date === labelKey);
        data30d.push({
          label: dayLabel,
          count: match ? match.count : 0
        });
      }

      res.json({
        history24h: data24h,
        history7d: data7d,
        history30d: data30d
      });
    } catch (err) {
      console.error("Error fetching tracking history:", err);
      res.status(500).json({ message: "Gagal mengambil riwayat tracking." });
    }
  });

  router.get('/reports/tracking/excel', authenticateToken, requireRole(['admin']), async (_req: Request, res: Response) => {
    try {
      const [visitorRows] = await pool.query<CountRow[]>('SELECT COUNT(*) as count FROM visitor_tracking');
      const [userRows] = await pool.query<CountRow[]>('SELECT COUNT(*) as count FROM users');
      const [landlordRows] = await pool.query<CountRow[]>("SELECT COUNT(*) as count FROM users WHERE role = 'landlord'");
      const totalLandlords = landlordRows[0].count;
      const [propertyRows] = await pool.query<CountRow[]>('SELECT COUNT(*) as count FROM properties');
      const totalProperties = propertyRows[0].count;
      const [roomsRows] = await pool.query<SumRow[]>('SELECT COALESCE(SUM(totalRooms), 0) as sum FROM properties');
      const totalRooms = roomsRows[0].sum || 0;

      const [visitors] = await pool.query<VisitorTrackingRow[]>('SELECT ip_address, user_agent, visited_at FROM visitor_tracking ORDER BY visited_at DESC LIMIT 1000');
      const [users] = await pool.query<UserRow[]>('SELECT id, email, name, role, phone FROM users ORDER BY id DESC');

      const wb = XLSX.utils.book_new();

      // Summary sheet
      const summaryData: (string | number)[][] = [
        ['Metrik', 'Jumlah'],
        ['Total Pengunjung Website', visitorRows[0].count],
        ['Total Pengguna Terdaftar', userRows[0].count],
        ['Total Landlord', totalLandlords],
        ['Total Properti', totalProperties],
        ['Total Kamar', totalRooms]
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Ringkasan');

      // Visitor details sheet
      const visitorData: (string | number)[][] = [['IP Address', 'User Agent', 'Waktu Kunjungan']];
      visitors.forEach(v => visitorData.push([v.ip_address, v.user_agent, v.visited_at ? new Date(v.visited_at).toLocaleString('id-ID') : '']));
      const visitorSheet = XLSX.utils.aoa_to_sheet(visitorData);
      XLSX.utils.book_append_sheet(wb, visitorSheet, 'Pengunjung');

      // Users sheet
      const userData: (string | number)[][] = [['ID', 'Email', 'Nama', 'Role', 'Telepon']];
      users.forEach(u => userData.push([u.id, u.email, u.name, u.role, u.phone]));
      const userSheet = XLSX.utils.aoa_to_sheet(userData);
      XLSX.utils.book_append_sheet(wb, userSheet, 'Pengguna');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', 'attachment; filename=laporan_tracking_kosmo.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(Buffer.from(buf));
    } catch (err) {
      console.error('Excel tracking report error:', err);
      res.status(500).json({ message: 'Gagal menghasilkan laporan Excel.' });
    }
  });

  router.get('/reports/landlord/excel', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) return res.status(401).json({ message: 'Otentikasi diperlukan.' });

    const landlordId = authUser.role === 'admin' && req.query.landlordId
      ? String(req.query.landlordId)
      : authUser.id;

    if (!landlordId) return res.status(400).json({ message: 'landlordId diperlukan.' });
    try {
      const [landlords] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [landlordId]);
      const landlord = landlords[0];
      if (!landlord) return res.status(404).json({ message: 'Landlord tidak ditemukan.' });

      const [properties] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE ownerId = ?', [landlord.id]);
      const [transactions] = await pool.query<RentalRow[]>(
        `SELECT r.*, p.name as propertyName FROM rentals r 
         JOIN properties p ON r.propertyId = p.id 
         WHERE p.ownerId = ? ORDER BY r.id DESC`, [landlord.id]
      );

      const wb = XLSX.utils.book_new();

      // Financial Summary sheet
      const summaryData: (string | number)[][] = [
        ['Laporan Keuangan Landlord'],
        ['Nama', landlord.name],
        ['Email', landlord.email],
        ['Total Pendapatan', landlord.totalRevenue || 0],
        ['Total Penarikan', landlord.totalWithdrawn || 0],
        ['Saldo', landlord.balance || 0],
        [''],
        ['Ringkasan Properti'],
        ['Nama Properti', 'Lokasi', 'Harga', 'Total Kamar', 'Kamar Tersedia']
      ];
      properties.forEach(p => summaryData.push([p.name, p.district, p.price, p.totalRooms, p.totalRooms - p.occupiedRooms]));
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Ringkasan Keuangan');

      // Transactions sheet
      const txData: (string | number)[][] = [['ID Transaksi', 'Properti', 'Tanggal', 'Jumlah', 'Status']];
      transactions.forEach(t => txData.push([t.id, t.propertyName || '', t.startDate || '', t.price || 0, t.status === 'active' ? 'Aktif' : 'Selesai']));
      const txSheet = XLSX.utils.aoa_to_sheet(txData);
      XLSX.utils.book_append_sheet(wb, txSheet, 'Transaksi');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Disposition', `attachment; filename=laporan_keuangan_${landlord.name.replace(/\s+/g, '_')}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(Buffer.from(buf));
    } catch (err) {
      console.error('Excel landlord report error:', err);
      res.status(500).json({ message: 'Gagal menghasilkan laporan Excel.' });
    }
  });
}
