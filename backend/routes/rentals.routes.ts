import type { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, syncPropertyRoomCounts } from '../db';
import { apiCache } from '../services/cache';
import { authenticateToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { PropertyRow } from '../services/transformers';
import type { RoomRow } from '../types/index';
import { generateRentalContractPdf } from '../services/contract';
import { isUserProfileComplete } from '../types/index';
import { generateId } from '../utils/id';
import type { UserRow } from './auth.routes';
import { snap } from './payment.routes';

export interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  roomId?: string | null;
  roomNumber?: string | null;
  roomFloor?: number | null;
  roomType?: string | null;
  propertyName?: string;
  price?: number;
  startDate?: string;
  status: 'active' | 'terminated' | 'pending' | 'cancelled';
  duration_months?: number;
  contract_url?: string;
  contract_hash?: string;
  contract_signed_at?: Date | string;
  signer_ip?: string;
  signer_user_agent?: string;
  tenant_nik_passport?: string;
  tenant_signature_data?: string;
  admin_fee_amount?: number;
  document?: string;
}

export interface PaymentSchedule {
  nextPaymentDate: string;
  nextPaymentDateISO: string;
  daysRemaining: number;
  paymentStatus: 'Lunas (Periode Berjalan)' | 'Menjelang Jatuh Tempo' | 'Menunggu Pembayaran' | 'Penyewaan Selesai';
  leaseStartDate?: string;
  leaseEndDate?: string;
  leaseEndDateISO?: string;
  totalDurationMonths?: number;
}

export function computePaymentSchedule(
  startDateStr: string,
  status: string,
  durationMonthsOrRef?: number | Date,
  referenceDate?: Date
): PaymentSchedule {
  let effectiveDuration = 1;
  let isBoundedDuration = false;
  let effectiveRef: Date = new Date();

  if (durationMonthsOrRef instanceof Date) {
    effectiveRef = durationMonthsOrRef;
    isBoundedDuration = false;
  } else {
    if (typeof durationMonthsOrRef === 'number' && !isNaN(durationMonthsOrRef)) {
      effectiveDuration = Math.max(1, Math.floor(durationMonthsOrRef));
      isBoundedDuration = true;
    }
    if (referenceDate instanceof Date) {
      effectiveRef = referenceDate;
    }
  }

  const now = new Date(effectiveRef);
  now.setHours(0, 0, 0, 0);

  const rawStart = new Date(startDateStr);
  const start = isNaN(rawStart.getTime()) ? new Date(now) : new Date(rawStart);
  start.setHours(0, 0, 0, 0);

  const startDay = start.getDate();

  const getClampedDate = (months: number): Date => {
    const totalMonths = start.getMonth() + months;
    const year = start.getFullYear() + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12 + 12) % 12;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(startDay, daysInMonth), 0, 0, 0, 0);
  };

  const pad = (n: number) => n.toString().padStart(2, '0');
  const leaseEnd = getClampedDate(effectiveDuration);
  const leaseStartDate = start.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const leaseEndDate = leaseEnd.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const leaseEndDateISO = `${leaseEnd.getFullYear()}-${pad(leaseEnd.getMonth() + 1)}-${pad(leaseEnd.getDate())}`;

  if (status !== 'active' || (isBoundedDuration && now > leaseEnd)) {
    return {
      nextPaymentDate: '-',
      nextPaymentDateISO: '',
      daysRemaining: 0,
      paymentStatus: 'Penyewaan Selesai',
      leaseStartDate,
      leaseEndDate,
      leaseEndDateISO,
      totalDurationMonths: effectiveDuration
    };
  }

  let addedMonths = 1;
  let due = getClampedDate(addedMonths);
  while (due < now && (!isBoundedDuration || addedMonths < effectiveDuration)) {
    addedMonths += 1;
    due = getClampedDate(addedMonths);
  }

  const diffMs = due.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));

  const iso = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
  const formatted = due.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  let paymentStatus: PaymentSchedule['paymentStatus'] = 'Lunas (Periode Berjalan)';
  if (daysRemaining === 0) {
    paymentStatus = 'Menunggu Pembayaran';
  } else if (daysRemaining <= 3) {
    paymentStatus = 'Menjelang Jatuh Tempo';
  }

  return {
    nextPaymentDate: formatted,
    nextPaymentDateISO: iso,
    daysRemaining,
    paymentStatus,
    leaseStartDate,
    leaseEndDate,
    leaseEndDateISO,
    totalDurationMonths: effectiveDuration
  };
}

export function registerRentalRoutes(router: Router): void {
  router.get('/rentals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }

    const { tenantId } = req.query;
    const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const offsetParam = req.query.offset ? parseInt(String(req.query.offset), 10) : (limitParam ? (pageParam - 1) * limitParam : 0);

    try {
      let sql = `
        SELECT 
          r.*,
          rm.roomNumber,
          rm.floor AS roomFloor,
          rm.type AS roomType
        FROM rentals r
        LEFT JOIN rooms rm ON r.roomId = rm.id
        WHERE 1=1
      `;
      const params: (string | number)[] = [];

      if (authUser.role === 'tenant') {
        sql += ' AND r.tenantId = ?';
        params.push(authUser.id);
      } else if (authUser.role === 'landlord') {
        sql += ' AND r.propertyId IN (SELECT id FROM properties WHERE ownerId = ?)';
        params.push(authUser.id);
      } else if (authUser.role === 'admin' && tenantId) {
        sql += ' AND r.tenantId = ?';
        params.push(String(tenantId));
      }
      sql += ' ORDER BY r.id DESC';

      if (limitParam && limitParam > 0) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(limitParam, Math.max(0, offsetParam));
      }

      const [rows] = await pool.query<RentalRow[]>(sql, params);
      const enrichedRows = rows.map((r) => {
        const duration = Number(r.duration_months || 1);
        const schedule = computePaymentSchedule(r.startDate || new Date().toISOString(), r.status, duration);
        return {
          ...r,
          duration_months: duration,
          nextPaymentDate: schedule.nextPaymentDate,
          nextPaymentDateISO: schedule.nextPaymentDateISO,
          daysRemaining: schedule.daysRemaining,
          paymentStatus: schedule.paymentStatus,
          leaseStartDate: schedule.leaseStartDate,
          leaseEndDate: schedule.leaseEndDate,
          leaseEndDateISO: schedule.leaseEndDateISO,
          totalDurationMonths: schedule.totalDurationMonths
        };
      });
      res.json(enrichedRows);
    } catch (err) {
      console.error("Get rentals error:", err);
      res.status(500).json({ message: "Gagal mengambil data sewa." });
    }
  });

  router.get('/tenant/rentals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }

    const tenantId = (authUser.role === 'admin' && req.query.tenantId)
      ? String(req.query.tenantId)
      : authUser.id;
    if (!tenantId) {
      return res.status(400).json({ message: "tenantId diperlukan." });
    }

    try {
      const [rows] = await pool.query<RentalRow[]>(
        `SELECT 
          r.*,
          rm.roomNumber,
          rm.floor AS roomFloor,
          rm.type AS roomType
        FROM rentals r
        LEFT JOIN rooms rm ON r.roomId = rm.id
        WHERE r.tenantId = ? 
        ORDER BY r.id DESC`,
        [tenantId]
      );
      const enrichedRows = rows.map((r) => {
        const duration = Number(r.duration_months || 1);
        const schedule = computePaymentSchedule(r.startDate || new Date().toISOString(), r.status, duration);
        return {
          ...r,
          duration_months: duration,
          nextPaymentDate: schedule.nextPaymentDate,
          nextPaymentDateISO: schedule.nextPaymentDateISO,
          daysRemaining: schedule.daysRemaining,
          paymentStatus: schedule.paymentStatus,
          leaseStartDate: schedule.leaseStartDate,
          leaseEndDate: schedule.leaseEndDate,
          leaseEndDateISO: schedule.leaseEndDateISO,
          totalDurationMonths: schedule.totalDurationMonths
        };
      });
      res.json(enrichedRows);
    } catch (err) {
      console.error("Get tenant rentals error:", err);
      res.status(500).json({ message: "Gagal mengambil data sewa tenant." });
    }
  });

  router.post('/rentals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { tenantId, propertyId, propertyName, price, durationMonths, signature, roomId } = req.body;
    const authUser = req.user;
    if (!tenantId || !propertyId) {
      return res.status(400).json({ message: "tenantId dan propertyId wajib diisi." });
    }

    // Authorization check: non-admins can only book for themselves
    if (authUser?.role !== 'admin' && authUser?.id !== tenantId) {
      return res.status(403).json({ message: "Akses ditolak. Anda tidak dapat memesan atas nama akun lain." });
    }

    const rentalId = (req.body.rentalId && typeof req.body.rentalId === 'string' && req.body.rentalId.trim() !== '')
      ? req.body.rentalId
      : generateId("rent");

    // Optional: Verify Midtrans status if configured
    if (process.env.MIDTRANS_SERVER_KEY && !process.env.MIDTRANS_SERVER_KEY.includes('placeholder') && !process.env.MIDTRANS_SERVER_KEY.includes('your-server-key')) {
      try {
        const snapApi = snap as unknown as { transaction?: { status: (orderId: string) => Promise<{ transaction_status: string; fraud_status?: string; gross_amount: string }> } };
        if (snapApi.transaction?.status) {
          const statusResponse = await snapApi.transaction.status(rentalId);
          const isValidPayment = 
            statusResponse.transaction_status === 'settlement' || 
            (statusResponse.transaction_status === 'capture' && statusResponse.fraud_status === 'accept');
          if (!isValidPayment) {
            return res.status(402).json({ message: "Pembayaran belum diselesaikan pada payment gateway Midtrans." });
          }
        }
      } catch (midtransErr) {
        // In development or simulation environments, allow proceeding if token was minted
        console.warn("Midtrans status check warning:", midtransErr);
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Strict Lock Hierarchy: users -> properties -> rentals -> rooms
      const [userRows] = await connection.query<UserRow[]>('SELECT * FROM users WHERE id = ? FOR UPDATE', [tenantId]);
      const tenant = userRows[0];
      if (!tenant) {
        await connection.rollback();
        return res.status(404).json({ message: "Pengguna tidak ditemukan." });
      }

      const [propRows] = await connection.query<PropertyRow[]>(
        'SELECT totalRooms, occupiedRooms, price, name, address, ownerId FROM properties WHERE id = ? FOR UPDATE',
        [propertyId]
      );
      const property = propRows[0];
      if (!property) {
        await connection.rollback();
        return res.status(404).json({ message: "Properti tidak ditemukan." });
      }

      const [existingRentals] = await connection.query<RentalRow[]>(
        'SELECT id, status, document, roomId FROM rentals WHERE id = ? FOR UPDATE',
        [rentalId]
      );

      // Idempotency: If webhook already activated this lease, return success immediately
      if (existingRentals.length > 0 && existingRentals[0].status === 'active') {
        await connection.commit();
        return res.status(200).json({
          message: "Penyewaan kos sudah aktif!",
          rentalId,
          document: existingRentals[0].document || 'sertifikat_kepemilikan.pdf'
        });
      }

      if (property.occupiedRooms >= property.totalRooms) {
        await connection.rollback();
        return res.status(400).json({ message: "Kamar kos sudah penuh." });
      }

      // Discrete Room Lock
      let assignedRoom: RoomRow | undefined;
      const targetRoomId = roomId || existingRentals[0]?.roomId;
      if (targetRoomId) {
        const [roomRows] = await connection.query<RoomRow[]>(
          'SELECT id, propertyId, roomNumber, floor, type, price, status FROM rooms WHERE id = ? AND propertyId = ? FOR UPDATE',
          [targetRoomId, propertyId]
        );
        assignedRoom = roomRows[0];
        if (!assignedRoom) {
          await connection.rollback();
          return res.status(404).json({ message: 'Kamar tidak ditemukan pada properti ini.' });
        }
        if (assignedRoom.status !== 'available') {
          await connection.rollback();
          return res.status(409).json({ message: 'Kamar sudah terisi atau tidak tersedia.' });
        }
      } else {
        const [availRooms] = await connection.query<RoomRow[]>(
          "SELECT id, propertyId, roomNumber, floor, type, price, status FROM rooms WHERE propertyId = ? AND status = 'available' ORDER BY roomNumber ASC, id ASC LIMIT 1 FOR UPDATE",
          [propertyId]
        );
        if (availRooms.length > 0) {
          assignedRoom = availRooms[0];
        } else {
          const [countRows] = await connection.query<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?',
            [propertyId]
          );
          if (Number(countRows[0]?.count || 0) > 0) {
            await connection.rollback();
            return res.status(409).json({ message: 'Kamar sudah terisi atau tidak tersedia.' });
          }
        }
      }

      // Check legal profile completeness
      const profileCheck = isUserProfileComplete(tenant);
      if (!profileCheck.complete) {
        await connection.rollback();
        return res.status(422).json({
          message: "Profil identitas hukum penyewa belum lengkap. Lengkapi profil Anda terlebih dahulu sebelum menyewa.",
          missingFields: profileCheck.missingFields,
          missingFieldLabels: profileCheck.missingFieldLabels
        });
      }

      // Check single active tenancy rule
      const [activeRentals] = await connection.query<RentalRow[]>(
        "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' AND id != ? LIMIT 1",
        [tenantId, rentalId]
      );
      if (activeRentals.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          message: "Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru."
        });
      }

      const startDate = (req.body.startDate && typeof req.body.startDate === 'string' && req.body.startDate.trim() !== '')
        ? req.body.startDate.trim()
        : new Date().toISOString().split('T')[0];
      const rentalPrice = (assignedRoom && typeof assignedRoom.price === 'number' && assignedRoom.price > 0)
        ? Number(assignedRoom.price)
        : (price || property.price);
      const rentalName = propertyName || property.name;

      let documentPath = 'sertifikat_kepemilikan.pdf';
      try {
        const contractResult = await generateRentalContractPdf({
          rentalId,
          tenantName: tenant ? tenant.name : 'Penyewa',
          tenantEmail: tenant ? tenant.email : '',
          tenantPhone: tenant ? tenant.phone : '',
          tenantNikPassport: tenant ? tenant.identity_number : '',
          tenantAddress: tenant ? tenant.address : '',
          tenantOccupation: tenant ? tenant.occupation : '',
          emergencyContactName: tenant ? tenant.emergency_contact_name : '',
          emergencyContactPhone: tenant ? tenant.emergency_contact_phone : '',
          emergencyContactRelation: tenant ? tenant.emergency_contact_relation : '',
          propertyName: rentalName,
          propertyAddress: property.address || '',
          pricePerMonth: rentalPrice,
          startDate,
          durationMonths: durationMonths || 1,
          signatureBase64: signature
        });
        documentPath = contractResult.filePath;
      } catch (contractErr) {
        console.warn("PDF contract generation warning:", contractErr);
      }

      const rentalDuration = durationMonths && durationMonths > 0 ? durationMonths : 1;

      if (existingRentals.length > 0) {
        await connection.query(
          `UPDATE rentals 
           SET status = 'active', document = ?, propertyName = ?, price = ?, startDate = ?, duration_months = ?, roomId = COALESCE(roomId, ?) 
           WHERE id = ?`,
          [documentPath, rentalName, rentalPrice, startDate, rentalDuration, assignedRoom?.id || null, rentalId]
        );
      } else {
        await connection.query(
          `INSERT INTO rentals (id, tenantId, propertyId, roomId, propertyName, price, startDate, status, document, duration_months) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
          [rentalId, tenantId, propertyId, assignedRoom?.id || null, rentalName, rentalPrice, startDate, documentPath, rentalDuration]
        );
      }

      if (assignedRoom) {
        await connection.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [assignedRoom.id]);
        await syncPropertyRoomCounts(connection, propertyId);
      } else {
        await connection.query(
          'UPDATE properties SET occupiedRooms = LEAST(totalRooms, occupiedRooms + 1) WHERE id = ?',
          [propertyId]
        );
      }

      if (property.ownerId) {
        await connection.query(
          'UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?',
          [rentalPrice * rentalDuration, rentalPrice * rentalDuration, property.ownerId]
        );
      }

      await connection.commit();
      apiCache.invalidatePattern('properties');
      res.status(201).json({
        message: "Penyewaan kos berhasil diproses!",
        rentalId,
        document: documentPath
      });
    } catch (err) {
      await connection.rollback();
      console.error("Create rental error:", err);
      res.status(500).json({ message: "Gagal memproses penyewaan kos." });
    } finally {
      connection.release();
    }
  });

  router.post('/rentals/:id/terminate', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { password } = req.body;
    const authUser = req.user;
    if (!password) {
      return res.status(400).json({ message: "Password wajib dimasukkan." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Early lookup of target rental
      const [earlyRentalRows] = await connection.query<RentalRow[]>(
        'SELECT id, tenantId, propertyId, roomId, status FROM rentals WHERE id = ?',
        [id]
      );
      const earlyRental = earlyRentalRows[0];
      if (!earlyRental) {
        await connection.rollback();
        return res.status(404).json({ message: "Data sewa tidak ditemukan." });
      }
      if (earlyRental.status === 'terminated') {
        await connection.rollback();
        return res.status(400).json({ message: "Sewa sudah pernah diberhentikan." });
      }

      // Verify caller's own password
      const [userRows] = await connection.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [authUser?.id]);
      const caller = userRows[0];
      if (!caller || !caller.password || !bcrypt.compareSync(password, caller.password)) {
        await connection.rollback();
        return res.status(401).json({ message: "Password salah." });
      }

      // Strict Lock Hierarchy: users -> properties -> rentals -> rooms
      // 1. Properties row lock
      const [propRows] = await connection.query<PropertyRow[]>(
        'SELECT id, ownerId, totalRooms, occupiedRooms FROM properties WHERE id = ? FOR UPDATE',
        [earlyRental.propertyId]
      );
      const property = propRows[0];

      // Check authorization: caller must be tenant, property landlord, or admin
      const isTenant = authUser?.id === earlyRental.tenantId;
      const isOwner = property && authUser?.id === property.ownerId;
      const isAdmin = authUser?.role === 'admin';

      if (!isTenant && !isOwner && !isAdmin) {
        await connection.rollback();
        return res.status(403).json({ message: "Akses ditolak. Anda tidak berhak memberhentikan sewa ini." });
      }

      // 2. Rentals row lock
      const [rentalRows] = await connection.query<RentalRow[]>(
        'SELECT id, tenantId, propertyId, roomId, status FROM rentals WHERE id = ? FOR UPDATE',
        [id]
      );
      const rental = rentalRows[0];
      if (!rental) {
        await connection.rollback();
        return res.status(404).json({ message: "Data sewa tidak ditemukan." });
      }
      if (rental.status === 'terminated') {
        await connection.rollback();
        return res.status(400).json({ message: "Sewa sudah pernah diberhentikan." });
      }

      // 3. Rooms row lock and release
      if (rental.status === 'active') {
        if (rental.roomId) {
          await connection.query('SELECT id, status FROM rooms WHERE id = ? FOR UPDATE', [rental.roomId]);
          await connection.query("UPDATE rooms SET status = 'available' WHERE id = ?", [rental.roomId]);
          await syncPropertyRoomCounts(connection, rental.propertyId);
        } else {
          await connection.query(
            'UPDATE properties SET occupiedRooms = GREATEST(0, occupiedRooms - 1) WHERE id = ?',
            [rental.propertyId]
          );
        }
      }

      await connection.query(
        "UPDATE rentals SET status = 'terminated' WHERE id = ?",
        [id]
      );

      await connection.commit();
      apiCache.invalidatePattern('properties');
      apiCache.invalidatePattern('rentals');
      res.json({ message: "Sewa kos berhasil diberhentikan." });
    } catch (err) {
      await connection.rollback();
      console.error("Terminate rental error:", err);
      res.status(500).json({ message: "Gagal memberhentikan sewa kos." });
    } finally {
      connection.release();
    }
  });
}
