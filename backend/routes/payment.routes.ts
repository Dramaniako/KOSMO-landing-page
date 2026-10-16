import type { Request, Response, Router } from 'express';
import crypto from 'crypto';
import midtransClient from 'midtrans-client';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, syncPropertyRoomCounts } from '../db';
import { apiCache } from '../services/cache';
import { authenticateToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { PropertyRow } from '../services/transformers';
import type { RoomRow } from '../types/index';
import { generateId } from '../utils/id';
import type { UserRow } from './auth.routes';
import type { RentalRow } from './rentals.routes';

const MIDTRANS_PLACEHOLDERS = [
  'placeholder',
  'your-server-key',
  'your_server_key',
  'your-client-key',
  'your_client_key',
  'dummy',
  'sample',
  'sb-mid-server-placeholder',
  'sb-mid-client-placeholder'
];

export function isMidtransConfigured(): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  if (!serverKey || !clientKey) return false;
  const s = serverKey.trim().toLowerCase();
  const c = clientKey.trim().toLowerCase();
  if (s === '' || c === '') return false;
  if (MIDTRANS_PLACEHOLDERS.some(p => s.includes(p))) return false;
  if (MIDTRANS_PLACEHOLDERS.some(p => c.includes(p))) return false;
  return true;
}

export const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-placeholder'
});

export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  signatureKey: string
): boolean {
  if (!orderId || !statusCode || !grossAmount || !serverKey || !signatureKey) {
    return false;
  }
  // Normalize grossAmount string (Midtrans might format with or without .00)
  const normalizedAmount = grossAmount.includes('.') ? parseFloat(grossAmount).toFixed(2) : grossAmount;
  const payload = `${orderId}${statusCode}${normalizedAmount}${serverKey}`;
  const calculatedHash = crypto.createHash('sha512').update(payload).digest('hex').toLowerCase();
  const targetSig = signatureKey.toLowerCase();

  const calculatedBuffer = Buffer.from(calculatedHash, 'utf8');
  const targetBuffer = Buffer.from(targetSig, 'utf8');

  if (calculatedBuffer.length !== targetBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(calculatedBuffer, targetBuffer);
}

interface PaymentTokenBody {
  propertyId?: string;
  tenantId?: string;
  durationMonths?: number;
}

interface MidtransWebhookBody {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
  payment_type?: string;
}

export function extractOrderRentalId(orderIdOrRentalId: string): { rentalId: string; isRenewal: boolean } {
  const trimmed = orderIdOrRentalId.trim();
  const isRenewal = trimmed.startsWith('RENEW-');
  if (isRenewal) {
    const withoutPrefix = trimmed.slice(6);
    const cleaned = withoutPrefix
      .replace(/(?:-\d{4})?-\d{9,}$/, '')
      .replace(/-\d{4}$/, '');
    return { rentalId: cleaned || withoutPrefix, isRenewal: true };
  }
  const rentMatch = trimmed.match(/^(rent-[a-zA-Z0-9]+)(?:-\d+)?$/);
  if (rentMatch && rentMatch[1]) {
    return { rentalId: rentMatch[1], isRenewal: false };
  }
  return { rentalId: trimmed, isRenewal: false };
}

export async function settleRentalPayment(
  orderIdOrRentalId: string,
  paidAmount?: number
): Promise<{ success: boolean; statusCode?: number; message: string; rental?: RentalRow }> {
  const { rentalId: targetRentalId, isRenewal } = extractOrderRentalId(orderIdOrRentalId);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Early lookup to discover propertyId for lock hierarchy compliance
    const [earlyRentalRows] = await connection.query<RentalRow[]>(
      'SELECT id, propertyId, status FROM rentals WHERE id = ? OR id = ?',
      [targetRentalId, orderIdOrRentalId.trim()]
    );
    const earlyRental = earlyRentalRows[0];

    if (!earlyRental) {
      await connection.rollback();
      return { success: false, statusCode: 404, message: "Data sewa tidak ditemukan." };
    }

    // Strict Lock Hierarchy: properties -> users (landlord) -> rentals -> rooms
    // 1. Properties row lock
    let property: PropertyRow | undefined;
    if (earlyRental.propertyId) {
      const [propRows] = await connection.query<PropertyRow[]>(
        'SELECT id, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ? FOR UPDATE',
        [earlyRental.propertyId]
      );
      property = propRows[0];
    }

    // 2. Landlord user row lock (Pessimistic lock for balance safety)
    if (property && property.ownerId) {
      await connection.query<UserRow[]>(
        'SELECT id, balance, totalRevenue FROM users WHERE id = ? FOR UPDATE',
        [property.ownerId]
      );
    }

    // 3. Rentals row lock
    const [rentalRows] = await connection.query<RentalRow[]>(
      'SELECT * FROM rentals WHERE id = ? OR id = ? FOR UPDATE',
      [targetRentalId, orderIdOrRentalId.trim()]
    );
    const rental = rentalRows[0];

    if (!rental) {
      await connection.rollback();
      return { success: false, statusCode: 404, message: "Data sewa tidak ditemukan." };
    }

    const resolvedRentalId = rental.id;
    const monthlyPrice = Number(rental.price || 0);
    const durationMonths = Number(rental.duration_months || 1);
    const adminFee = Number(
      rental.admin_fee_amount !== undefined && rental.admin_fee_amount !== null
        ? rental.admin_fee_amount
        : 5000
    );

    if (isRenewal) {
      let renewedMonths = 1;
      if (paidAmount !== undefined && !isNaN(paidAmount) && monthlyPrice > 0) {
        const netPaid = paidAmount >= adminFee ? paidAmount - adminFee : paidAmount;
        const calculatedMonths = Math.round(netPaid / monthlyPrice);
        if (calculatedMonths > 0) {
          renewedMonths = calculatedMonths;
        }
      }

      if (paidAmount !== undefined && !isNaN(paidAmount)) {
        const expectedRenewalWithAdmin = (monthlyPrice * renewedMonths) + adminFee;
        const expectedRenewalBase = monthlyPrice * renewedMonths;
        const isPriceMatch =
          Math.abs(paidAmount - expectedRenewalWithAdmin) <= 1.0 ||
          Math.abs(paidAmount - expectedRenewalBase) <= 1.0 ||
          Math.abs(paidAmount - (monthlyPrice + adminFee)) <= 1.0;

        if (!isPriceMatch) {
          await connection.rollback();
          console.error(`Midtrans renewal gross_amount mismatch: expected ${expectedRenewalWithAdmin} or ${expectedRenewalBase}, got ${paidAmount}`);
          return { success: false, statusCode: 400, message: "Jumlah nominal pembayaran tidak sesuai dengan biaya perpanjangan sewa." };
        }
      }

      await connection.query(
        "UPDATE rentals SET status = 'active', duration_months = COALESCE(duration_months, 1) + ? WHERE id = ?",
        [renewedMonths, resolvedRentalId]
      );

      if (property && property.ownerId) {
        const grossRent = monthlyPrice * renewedMonths;
        const platformCommission = Math.round(grossRent * 0.03);
        const landlordNetRent = grossRent - platformCommission;

        await connection.query(
          'UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?',
          [landlordNetRent, grossRent, property.ownerId]
        );
      }

      await connection.commit();
      apiCache.invalidatePattern('properties');
      apiCache.invalidatePattern('rentals');

      return {
        success: true,
        statusCode: 200,
        message: "Pembayaran perpanjangan sewa berhasil diproses.",
        rental: {
          ...rental,
          status: 'active',
          duration_months: durationMonths + renewedMonths
        }
      };
    }

    const expectedWithAdmin = (monthlyPrice * durationMonths) + adminFee;
    const expectedBase = monthlyPrice * durationMonths;

    if (paidAmount !== undefined && !isNaN(paidAmount)) {
      const isPriceMatch =
        Math.abs(paidAmount - expectedWithAdmin) <= 1.0 ||
        Math.abs(paidAmount - expectedBase) <= 1.0 ||
        Math.abs(paidAmount - monthlyPrice) <= 1.0;

      if (!isPriceMatch) {
        await connection.rollback();
        console.error(`Midtrans gross_amount mismatch: expected ${expectedWithAdmin} or ${expectedBase}, got ${paidAmount}`);
        return { success: false, statusCode: 400, message: "Jumlah nominal pembayaran tidak sesuai dengan harga sewa." };
      }
    }

    // Check if already processed to prevent duplicate room increments or balance credits
    if (rental.status !== 'active') {
      // 🛡️ Concurrency Guard: Single Active Tenancy Check at settlement time
      const [activeRentals] = await connection.query<RentalRow[]>(
        "SELECT id FROM rentals WHERE tenantId = ? AND status = 'active' AND id != ? FOR UPDATE",
        [rental.tenantId, resolvedRentalId]
      );
      if (activeRentals.length > 0) {
        await connection.rollback();
        return {
          success: false,
          statusCode: 409,
          message: "Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif."
        };
      }

      // 🛡️ Concurrency Guard: Discrete Room Row Lock & Availability Check
      let lockedRoom: RoomRow | undefined;
      let targetRoomId = rental.roomId;

      if (targetRoomId) {
        const [roomRows] = await connection.query<RoomRow[]>(
          'SELECT id, propertyId, roomNumber, status FROM rooms WHERE id = ? FOR UPDATE',
          [targetRoomId]
        );
        lockedRoom = roomRows[0];
        if (!lockedRoom || lockedRoom.status !== 'available') {
          await connection.rollback();
          console.error(`Overbooking conflict detected for room ${targetRoomId}, status: ${lockedRoom?.status}`);
          return { success: false, statusCode: 409, message: "Kamar sudah terisi atau tidak tersedia." };
        }
      } else {
        // Auto-assign lowest available room if property has discrete inventory
        const [availableRooms] = await connection.query<RoomRow[]>(
          "SELECT id, propertyId, roomNumber, status FROM rooms WHERE propertyId = ? AND status = 'available' ORDER BY roomNumber ASC, id ASC LIMIT 1 FOR UPDATE",
          [rental.propertyId]
        );
        if (availableRooms.length > 0) {
          lockedRoom = availableRooms[0];
          targetRoomId = lockedRoom.id;
        } else {
          const [discreteCountRows] = await connection.query<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?',
            [rental.propertyId]
          );
          if (Number(discreteCountRows[0]?.count || 0) > 0) {
            await connection.rollback();
            return { success: false, statusCode: 409, message: "Kamar sudah terisi atau tidak tersedia." };
          }
          if (property && property.occupiedRooms >= property.totalRooms) {
            await connection.rollback();
            console.error(`Overbooking conflict detected for property ${property.id}, rental ${resolvedRentalId}`);
            return { success: false, statusCode: 409, message: "Kamar sudah penuh, pembayaran memerlukan penanganan manual." };
          }
        }
      }

      await connection.query(
        "UPDATE rentals SET status = 'active', roomId = COALESCE(roomId, ?) WHERE id = ?",
        [targetRoomId || null, resolvedRentalId]
      );

      if (lockedRoom) {
        await connection.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [lockedRoom.id]);
        await syncPropertyRoomCounts(connection, rental.propertyId);
      } else {
        await connection.query(
          'UPDATE properties SET occupiedRooms = LEAST(totalRooms, occupiedRooms + 1) WHERE id = ?',
          [rental.propertyId]
        );
      }

      if (property && property.ownerId) {
        const grossRent = monthlyPrice * durationMonths;
        const platformCommission = Math.round(grossRent * 0.03);
        const netLandlordCredit = grossRent - platformCommission;
        await connection.query(
          'UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?',
          [netLandlordCredit, grossRent, property.ownerId]
        );
      }
    }

    await connection.commit();
    apiCache.invalidatePattern('properties');
    apiCache.invalidatePattern('rentals');
    return {
      success: true,
      statusCode: 200,
      message: "Pembayaran berhasil diproses dan status rental diaktifkan.",
      rental: { ...rental, status: 'active' }
    };
  } catch (err: unknown) {
    await connection.rollback();
    console.error("Settle rental payment error:", err);
    return { success: false, statusCode: 500, message: "Gagal memproses transaksi sewa." };
  } finally {
    connection.release();
  }
}

const handlePaymentNotification = async (req: Request<Record<string, never>, unknown, MidtransWebhookBody>, res: Response) => {
  const isProduction = (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)) && process.env.NODE_ENV !== 'test';
  const hasMidtransConfig = isMidtransConfigured();

  if (!hasMidtransConfig && isProduction) {
    return res.status(500).json({
      message: "Midtrans server key belum dikonfigurasi pada server produksi."
    });
  }

  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status,
    fraud_status
  } = req.body;

  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return res.status(400).json({ message: "Data notifikasi tidak lengkap." });
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder';
  const isValidSignature = verifyMidtransSignature(
    order_id,
    status_code,
    gross_amount,
    serverKey,
    signature_key
  );

  if (!isValidSignature) {
    return res.status(403).json({ message: "Signature Midtrans tidak valid." });
  }

  // Handle settlement or accepted capture
  const isSettlement = transaction_status === 'settlement';
  const isCaptureSuccess = transaction_status === 'capture' && fraud_status === 'accept';

  if (isSettlement || isCaptureSuccess) {
    const paidAmount = parseFloat(gross_amount);
    const result = await settleRentalPayment(order_id, isNaN(paidAmount) ? undefined : paidAmount);
    return res.status(result.statusCode || (result.success ? 200 : 400)).json({ message: result.message });
  }

  // Handle cancel, deny, or expire
  if (transaction_status === 'cancel' || transaction_status === 'deny' || transaction_status === 'expire') {
    try {
      if (order_id.trim().startsWith('RENEW-')) {
        return res.json({ message: `Status perpanjangan sewa dibatalkan (${transaction_status}).` });
      }
      const { rentalId: targetRentalId } = extractOrderRentalId(order_id);
      await pool.query("UPDATE rentals SET status = 'cancelled' WHERE (id = ? OR id = ?) AND status = 'pending'", [targetRentalId, order_id.trim()]);
      apiCache.invalidatePattern('properties');
      apiCache.invalidatePattern('rentals');
      return res.json({ message: `Status transaksi dibatalkan (${transaction_status}).` });
    } catch (err: unknown) {
      console.error("Cancel rental error:", err);
      return res.status(500).json({ message: "Gagal memperbarui status transaksi." });
    }
  }

  res.json({ message: "Status notifikasi diterima." });
};

export function registerPaymentRoutes(router: Router): void {
  router.post('/payment/token', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, tenantId, durationMonths, roomId } = req.body;
    const authUser = req.user;
    if (!propertyId || !tenantId) {
      return res.status(400).json({ message: "propertyId dan tenantId wajib diisi." });
    }

    // Authorization check: non-admins can only generate tokens for themselves
    if (authUser?.role !== 'admin' && authUser?.id !== tenantId) {
      return res.status(403).json({ message: "Akses ditolak. Anda tidak dapat membuat token atas nama akun lain." });
    }

    const duration = durationMonths && durationMonths > 0 ? durationMonths : 1;
    const customRentalId = (req.body.customRentalId || req.body.rentalId);
    const resolvedRentalId = (customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== '')
      ? customRentalId.trim()
      : generateId("rent");
    const startDate = (req.body.startDate && typeof req.body.startDate === 'string' && req.body.startDate.trim() !== '')
      ? req.body.startDate.trim()
      : new Date().toISOString().split('T')[0];

    // Data extracted inside transaction to feed external Midtrans Snap call safely
    let tenantName = '';
    let tenantEmail = '';
    let tenantPhone = '';
    let propertyName = '';
    let monthlyRent = 0;
    let adminFee = 5000.0;
    let resolvedDuration = duration;
    let totalAmount = 0;
    let targetRoomId: string | null = null;

    // 🔒 Acquire dedicated connection from pool for pessimistic locking transaction
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Strict Lock Order (users -> properties -> rooms -> rentals)
      // Lock tenant row
      const [userRows] = await connection.query<UserRow[]>(
        'SELECT id, name, email, phone FROM users WHERE id = ? FOR UPDATE',
        [tenantId]
      );
      const tenant = userRows[0];
      if (!tenant) {
        await connection.rollback();
        return res.status(404).json({ message: "Tenant tidak ditemukan." });
      }
      tenantName = tenant.name;
      tenantEmail = tenant.email;
      tenantPhone = tenant.phone || '';

      // 2. Lock property row
      const [propRows] = await connection.query<PropertyRow[]>(
        'SELECT id, name, price, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ? FOR UPDATE',
        [propertyId]
      );
      const property = propRows[0];
      if (!property) {
        await connection.rollback();
        return res.status(404).json({ message: "Properti tidak ditemukan." });
      }
      propertyName = property.name;

      if (property.occupiedRooms >= property.totalRooms) {
        await connection.rollback();
        return res.status(400).json({ message: "Kamar kos sudah penuh." });
      }

      // 3. Discrete Room validation & pessimistic row lock
      let lockedRoom: RoomRow | undefined;
      const requestedRoomId = roomId && typeof roomId === 'string' && roomId.trim() !== '' ? roomId.trim() : undefined;

      if (requestedRoomId) {
        const [roomRows] = await connection.query<RoomRow[]>(
          'SELECT id, propertyId, roomNumber, floor, type, price, status FROM rooms WHERE id = ? AND propertyId = ? FOR UPDATE',
          [requestedRoomId, propertyId]
        );
        lockedRoom = roomRows[0];
        if (!lockedRoom) {
          await connection.rollback();
          return res.status(404).json({ message: "Kamar tidak ditemukan pada properti ini." });
        }
        if (lockedRoom.status !== 'available') {
          await connection.rollback();
          return res.status(409).json({ message: "Kamar yang Anda pilih sudah tidak tersedia." });
        }
        targetRoomId = lockedRoom.id;
      } else {
        // If property has discrete inventory, ensure at least one available room exists
        const [discreteCountRows] = await connection.query<RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?',
          [propertyId]
        );
        const discreteCount = Number(discreteCountRows[0]?.count || 0);
        if (discreteCount > 0) {
          const [availableRooms] = await connection.query<RoomRow[]>(
            "SELECT id, price, status FROM rooms WHERE propertyId = ? AND status = 'available' LIMIT 1 FOR UPDATE",
            [propertyId]
          );
          if (availableRooms.length === 0) {
            await connection.rollback();
            return res.status(409).json({ message: "Kamar yang Anda pilih sudah tidak tersedia." });
          }
        }
      }

      // 4. Single Active Tenancy Check with row-level lock (FOR UPDATE)
      let activeRentalsQuery = "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' FOR UPDATE";
      const queryParams: (string | number)[] = [tenantId];
      if (customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== '') {
        activeRentalsQuery = "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' AND id != ? FOR UPDATE";
        queryParams.push(customRentalId.trim());
      }

      const [activeRentals] = await connection.query<RentalRow[]>(activeRentalsQuery, queryParams);
      if (activeRentals.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          message: "Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru."
        });
      }

      // 5. Existing Rental lookup or pending rental insertion
      const [existingRentalRows] = await connection.query<RentalRow[]>(
        'SELECT * FROM rentals WHERE id = ? FOR UPDATE',
        [resolvedRentalId]
      );
      const existingRental = existingRentalRows[0];

      const roomPriceOverride = (lockedRoom && typeof lockedRoom.price === 'number' && lockedRoom.price > 0)
        ? Number(lockedRoom.price)
        : null;

      monthlyRent = Number(existingRental?.price || roomPriceOverride || property.price);
      adminFee = Number(existingRental?.admin_fee_amount || 5000.0);
      resolvedDuration = (existingRental && existingRental.duration_months)
        ? Number(existingRental.duration_months)
        : duration;
      totalAmount = (monthlyRent * resolvedDuration) + adminFee;

      if (!existingRental) {
        await connection.query(
          `INSERT INTO rentals (id, tenantId, propertyId, roomId, propertyName, price, startDate, status, admin_fee_amount, duration_months) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [resolvedRentalId, tenantId, propertyId, targetRoomId, property.name, monthlyRent, startDate, adminFee, resolvedDuration]
        );
      } else if (targetRoomId && !existingRental.roomId) {
        await connection.query(
          'UPDATE rentals SET roomId = ? WHERE id = ?',
          [targetRoomId, resolvedRentalId]
        );
      }

      // Commit transaction: Row locks are released BEFORE external Midtrans network calls
      await connection.commit();
    } catch (err: unknown) {
      await connection.rollback();
      console.error("Create payment token transaction error:", err);
      return res.status(500).json({ message: "Gagal memproses transaksi pembuatan token pembayaran." });
    } finally {
      // Guaranteed connection release to prevent pool exhaustion
      connection.release();
    }

    // 6. External Midtrans Snap token creation executed OUTSIDE database transaction
    const attemptOrderId = `${resolvedRentalId}-${Date.now()}`;
    const parameter = {
      transaction_details: {
        order_id: attemptOrderId,
        gross_amount: totalAmount
      },
      customer_details: {
        first_name: tenantName,
        email: tenantEmail,
        phone: tenantPhone
      },
      item_details: [
        {
          id: propertyId,
          price: monthlyRent,
          quantity: resolvedDuration,
          name: propertyName.substring(0, 50)
        },
        {
          id: 'ADMIN_FEE',
          price: adminFee,
          quantity: 1,
          name: 'Biaya Administrasi & Meterai'
        }
      ],
      custom_field1: resolvedRentalId
    };

    const isProduction = (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)) && process.env.NODE_ENV !== 'test';
    const hasMidtransConfig = isMidtransConfigured();

    if (!hasMidtransConfig && isProduction) {
      return res.status(500).json({
        message: "Konfigurasi payment gateway Midtrans (MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY) belum diatur di server produksi."
      });
    }

    let transactionToken = `snap-token-${resolvedRentalId}`;
    let redirectUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${resolvedRentalId}`;

    if (hasMidtransConfig) {
      try {
        const transaction = await snap.createTransaction(parameter);
        transactionToken = transaction.token;
        redirectUrl = transaction.redirect_url;
      } catch (snapErr) {
        console.error("Midtrans createTransaction error:", snapErr);
        const errMsg = snapErr instanceof Error ? snapErr.message : String(snapErr);
        return res.status(502).json({
          message: `Gagal membuat transaksi di Midtrans: ${errMsg}`
        });
      }
    }

    return res.json({
      message: "Token pembayaran berhasil dibuat.",
      token: transactionToken,
      redirect_url: redirectUrl,
      rentalId: resolvedRentalId,
      orderId: attemptOrderId
    });
  });

  router.post('/payment/webhook', handlePaymentNotification);
  router.post('/payment/notification', handlePaymentNotification);

  router.post('/payment/finish', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { rentalId } = req.body;
    const authUser = req.user;

    if (!rentalId || typeof rentalId !== 'string' || rentalId.trim() === '') {
      return res.status(400).json({ success: false, message: "rentalId wajib diisi." });
    }

    try {
      const [rows] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [rentalId.trim()]);
      const rental = rows[0];
      if (!rental) {
        return res.status(404).json({ success: false, message: "Data sewa tidak ditemukan." });
      }

      if (authUser?.role !== 'admin' && authUser?.id !== rental.tenantId) {
        return res.status(403).json({ success: false, message: "Akses ditolak ke data sewa ini." });
      }

      const result = await settleRentalPayment(rentalId.trim());
      if (!result.success) {
        return res.status(result.statusCode || 400).json({ success: false, message: result.message });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        rentalId: rentalId.trim()
      });
    } catch (err: unknown) {
      console.error("Payment finish route error:", err);
      return res.status(500).json({ success: false, message: "Gagal menyelesaikan transaksi pembayaran." });
    }
  });
}
