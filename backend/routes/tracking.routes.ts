import type { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import XLSX from 'xlsx';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import { authenticateToken, requireRole, generateJwtToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { PropertyRow } from '../services/transformers';
import type { UserRow } from './auth.routes';
import { apiCache } from '../services/cache';
import { validateBody, interactionTelemetrySchema, visitorTrackingSchema } from '../middleware/validation';
import { recommendationService, type InteractionType } from '../services/recommendation.service';
import { trackingLimiter } from '../middleware/rateLimiter';

export { trackingLimiter };

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

export const handleRecordVisit = async (req: Request, res: Response): Promise<Response | void> => {
  const rawIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const firstIp = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
  const ip = firstIp.split(',')[0].trim().substring(0, 255);
  const userAgent = String(req.headers['user-agent'] || '').substring(0, 1000);

  const cacheKey = `tracking:ip:${ip}`;

  // 1. In-Memory Cache Deduplication Check (Fast-path: TTL 15 minutes = 900s)
  if (apiCache.get<boolean>(cacheKey)) {
    return res.status(200).json({
      success: true,
      message: 'Kunjungan telah dicatat.',
      deduplicated: true
    });
  }

  // Acquire optimistic cache reservation immediately upon receiving the request
  // before the asynchronous database query/insert.
  // This eliminates the TOCTOU window under concurrent flood.
  apiCache.set(cacheKey, true, 900);

  try {
    // 2. Database Fallback Deduplication Check (within last 15 minutes)
    const [recentVisits] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM visitor_tracking WHERE ip_address = ? AND visited_at >= NOW() - INTERVAL 15 MINUTE LIMIT 1',
      [ip]
    );

    if (recentVisits.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Kunjungan telah dicatat.',
        deduplicated: true
      });
    }

    // 3. Insert fresh visit record
    await pool.query(
      'INSERT INTO visitor_tracking (ip_address, user_agent) VALUES (?, ?)',
      [ip, userAgent]
    );

    // 4. Invalidate admin stats
    apiCache.del('admin:stats');

    return res.status(201).json({
      success: true,
      message: 'Kunjungan berhasil dilacak.'
    });
  } catch (err: unknown) {
    // Release the reservation if the database insertion throws an error
    if (typeof (apiCache as unknown as { invalidate?: (k: string) => void }).invalidate === 'function') {
      (apiCache as unknown as { invalidate: (k: string) => void }).invalidate(cacheKey);
    } else {
      apiCache.del(cacheKey);
    }
    console.error('Error in visitor tracking:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Gagal melacak kunjungan.' });
  }
};

export function registerTrackingRoutes(router: Router): void {
  router.post(
    '/tracking/interaction',
    trackingLimiter,
    validateBody(interactionTelemetrySchema),
    async (req: Request, res: Response) => {
      try {
        const { propertyId, interactionType, userId, deviceToken, metadata } = req.body as {
          propertyId: string;
          interactionType: InteractionType;
          userId?: string;
          deviceToken?: string;
          metadata?: Record<string, unknown>;
        };

        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anon';
        const firstIp = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
        const userKey = String(userId || deviceToken || req.headers['x-device-token'] || firstIp);

        let targetProp: PropertyRow | undefined;
        try {
          const [rows] = await pool.query<PropertyRow[]>(
            'SELECT * FROM properties WHERE id = ? LIMIT 1',
            [propertyId]
          );
          targetProp = rows[0];
        } catch {
          // Non-blocking lookup
        }

        const { event, updatedWeights } = recommendationService.recordInteraction({
          userKey,
          propertyId,
          interactionType,
          property: targetProp,
          metadata
        });

        res.status(201).json({
          success: true,
          message: 'Interaksi berhasil dicatat dan bobot preferensi diperbarui.',
          event,
          weights: updatedWeights
        });
      } catch (err: unknown) {
        console.error('Error in POST /api/tracking/interaction:', err);
        res.status(500).json({ message: 'Gagal mencatat interaksi pengguna.' });
      }
    }
  );

  const trackVisitHandler = handleRecordVisit;

  // Mount on both /tracking and /tracking/visit
  router.post('/tracking', trackingLimiter, validateBody(visitorTrackingSchema), trackVisitHandler);
  router.post('/tracking/visit', trackingLimiter, validateBody(visitorTrackingSchema), trackVisitHandler);

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

  // Support short-lived download token generation (valid 60 seconds)
  router.post('/reports/download-token', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: 'Otentikasi diperlukan.' });
    }
    const downloadToken = generateJwtToken(authUser, undefined, '60s');
    res.json({ downloadToken, expiresInSeconds: 60 });
  });

  router.get('/reports/landlord/excel', authenticateToken, requireRole(['admin', 'landlord', 'owner']), handleLandlordExcelReport);
}

export const handleLandlordExcelReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const authUser = req.user;
  if (!authUser) {
    res.status(401).json({ message: 'Otentikasi diperlukan.' });
    return;
  }

  const landlordId = authUser.role === 'admin' && req.query.landlordId
    ? String(req.query.landlordId)
    : authUser.id;

  if (!landlordId) {
    res.status(400).json({ message: 'landlordId diperlukan.' });
    return;
  }
  try {
    const [landlords] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [landlordId]);
    const landlord = landlords[0];
    if (!landlord) {
      res.status(404).json({ message: 'Landlord tidak ditemukan.' });
      return;
    }

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
};
