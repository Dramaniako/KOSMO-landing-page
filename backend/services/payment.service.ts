import crypto from 'crypto';
import midtransClient from 'midtrans-client';
import type { RowDataPacket, PoolConnection } from 'mysql2/promise';
import { pool, syncPropertyRoomCounts } from '../db';
import { apiCache } from './cache';
import type { JWTPayload } from '../middleware/auth';
import type { PropertyRow } from './transformers';
import type { RoomRow } from '../types/index';
import type { UserRow } from '../routes/auth.routes';
import type { RentalRow } from '../routes/rentals.routes';
import { generateId } from '../utils/id';
import {
  paymentRepository,
  type PaymentRepository
} from '../repositories/payment.repository';

export interface MySQLErrorLike {
  code?: string;
  errno?: number;
  message?: string;
}

export function isLockContentionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const dbErr = err as MySQLErrorLike;
  return (
    dbErr.code === 'ER_LOCK_WAIT_TIMEOUT' ||
    dbErr.errno === 1205 ||
    dbErr.code === 'ER_LOCK_DEADLOCK' ||
    dbErr.errno === 1213 ||
    (typeof dbErr.message === 'string' &&
      (dbErr.message.includes('Lock wait timeout exceeded') ||
        dbErr.message.includes('Deadlock found')))
  );
}

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
  if (MIDTRANS_PLACEHOLDERS.some((p) => s.includes(p))) return false;
  if (MIDTRANS_PLACEHOLDERS.some((p) => c.includes(p))) return false;
  return true;
}

export interface MidtransStatusResponse {
  status_code: string;
  status_message?: string;
  transaction_id?: string;
  order_id: string;
  gross_amount: string;
  currency?: string;
  payment_type?: string;
  transaction_time?: string;
  transaction_status: string;
  fraud_status?: string;
  signature_key?: string;
}

export async function fetchMidtransTransactionStatus(
  orderId: string,
  options?: { serverKey?: string; isProduction?: boolean; timeoutMs?: number }
): Promise<MidtransStatusResponse> {
  const isProd = options?.isProduction ?? process.env.MIDTRANS_IS_PRODUCTION === 'true';
  const serverKey = options?.serverKey || process.env.MIDTRANS_SERVER_KEY || '';
  const baseUrl = isProd ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  const url = `${baseUrl}/v2/${encodeURIComponent(orderId)}/status`;
  const timeoutMs = options?.timeoutMs ?? 6000;

  const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Midtrans status API error [HTTP ${response.status}]: ${errorBody || response.statusText}`
    );
  }

  return (await response.json()) as MidtransStatusResponse;
}

export const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-placeholder'
});

export function configureSnapClient(): typeof snap {
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
  const serverKey = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder';
  const clientKey = process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-placeholder';

  snap.apiConfig.set({
    isProduction,
    serverKey,
    clientKey
  });

  if (process.env.MIDTRANS_SNAP_URL) {
    const customBase = process.env.MIDTRANS_SNAP_URL.replace(/\/transactions\/?$/, '');
    snap.apiConfig.getSnapApiBaseUrl = () => customBase;
  }

  return snap;
}

export function getSnapRedirectUrl(rentalId: string): string {
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
  if (process.env.MIDTRANS_SNAP_URL) {
    try {
      const parsed = new URL(process.env.MIDTRANS_SNAP_URL);
      return `${parsed.protocol}//${parsed.host}/snap/v2/vtweb/${rentalId}`;
    } catch {
      // Fall through to default
    }
  }
  const baseUrl = isProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
  return `${baseUrl}/snap/v2/vtweb/${rentalId}`;
}

export function assertMidtransProductionConfig(options?: { throwOnMismatch?: boolean }): {
  isProduction: boolean;
  isSandboxKey: boolean;
  valid: boolean;
  warning?: string;
} {
  const isProduction =
    process.env.MIDTRANS_IS_PRODUCTION === 'true' || process.env.NODE_ENV === 'production';
  const serverKey = (process.env.MIDTRANS_SERVER_KEY || '').trim();
  const isSandboxKey = serverKey.startsWith('SB-Mid-');

  let warning: string | undefined;
  let valid = true;

  if (isProduction && isSandboxKey) {
    valid = false;
    warning = `[SECURITY WARNING] Detected sandbox MIDTRANS_SERVER_KEY prefix ('SB-Mid-') while running in production mode (MIDTRANS_IS_PRODUCTION=true or NODE_ENV=production). Live transactions will fail. Please configure production Midtrans credentials.`;
    console.warn(warning);
    if (options?.throwOnMismatch) {
      throw new Error(warning);
    }
  }

  return { isProduction, isSandboxKey, valid, warning };
}

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
  const targetSig = signatureKey.trim().toLowerCase();
  if (targetSig.length !== 128 || !/^[0-9a-f]{128}$/.test(targetSig)) {
    return false;
  }

  const rawPayload = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  const rawHash = crypto.createHash('sha512').update(rawPayload).digest('hex').toLowerCase();

  const targetBuffer = Buffer.from(targetSig, 'hex');
  const rawBuffer = Buffer.from(rawHash, 'hex');

  if (targetBuffer.length === 64 && rawBuffer.length === 64 && crypto.timingSafeEqual(rawBuffer, targetBuffer)) {
    return true;
  }

  const parsedAmount = parseFloat(grossAmount);
  if (!isNaN(parsedAmount)) {
    const normalizedAmount = parsedAmount.toFixed(2);
    if (normalizedAmount !== grossAmount) {
      const altPayload = `${orderId}${statusCode}${normalizedAmount}${serverKey}`;
      const altHash = crypto.createHash('sha512').update(altPayload).digest('hex').toLowerCase();
      const altBuffer = Buffer.from(altHash, 'hex');
      if (altBuffer.length === 64 && crypto.timingSafeEqual(altBuffer, targetBuffer)) {
        return true;
      }
    }
  }

  return false;
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

function isRoomActivelyHeldByOther(room: RoomRow, rentalId: string): boolean {
  if (!room.reserved_by_rental_id || room.reserved_by_rental_id === rentalId) {
    return false;
  }
  return Number(room.holdRemainingSeconds || 0) > 0;
}

export interface CreatePaymentTokenInput {
  authUser?: JWTPayload;
  propertyId?: string;
  tenantId?: string;
  durationMonths?: number;
  roomId?: string | null;
  customRentalId?: string;
  rentalId?: string;
  startDate?: string;
}

export async function createPaymentToken(
  input: CreatePaymentTokenInput,
  repo: PaymentRepository = paymentRepository
): Promise<{
  statusCode: number;
  body: Record<string, unknown>;
}> {
  const { authUser, propertyId, durationMonths, roomId } = input;
  const tenantId = input.tenantId || authUser?.id;

  if (!propertyId || !tenantId) {
    return { statusCode: 400, body: { message: 'propertyId dan tenantId wajib diisi.' } };
  }

  if (authUser?.role !== 'admin' && authUser?.id !== tenantId) {
    return {
      statusCode: 403,
      body: { message: 'Akses ditolak. Anda tidak dapat membuat token atas nama akun lain.' }
    };
  }

  const duration = durationMonths && durationMonths > 0 ? durationMonths : 1;
  const customRentalId = input.customRentalId || input.rentalId;
  const resolvedRentalId =
    customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== ''
      ? customRentalId.trim()
      : generateId('rent');
  const startDate =
    input.startDate && typeof input.startDate === 'string' && input.startDate.trim() !== ''
      ? input.startDate.trim()
      : new Date().toISOString().split('T')[0];
  const startDateIso = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null;

  let tenantName = '';
  let tenantEmail = '';
  let tenantPhone = '';
  let propertyName = '';
  let monthlyRent = 0;
  let adminFee = 5000.0;
  let resolvedDuration = duration;
  let totalAmount = 0;
  let targetRoomId: string | null = null;

  let connection: PoolConnection | null = null;
  let transactionStarted = false;
  let connectionReleased = false;

  const safeRollback = async (reason?: string) => {
    if (connection && transactionStarted) {
      await connection.rollback().catch((rbErr: unknown) => {
        console.warn(`[Payment Token] Rollback swallowed error (${reason || 'unknown'}):`, rbErr);
      });
      transactionStarted = false;
    }
  };

  try {
    connection = await pool.getConnection();
    await connection.query('SET SESSION innodb_lock_wait_timeout = 5;');
    await connection.beginTransaction();
    transactionStarted = true;

    // Canonical Lock Order: properties -> rooms -> users -> rentals
    const [propRows] = await connection.query<PropertyRow[]>(
      'SELECT id, name, price, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ? FOR UPDATE',
      [propertyId]
    );
    const property = propRows[0];
    if (!property) {
      await safeRollback('property missing');
      return { statusCode: 404, body: { message: 'Properti tidak ditemukan.' } };
    }
    propertyName = property.name;

    if (property.occupiedRooms >= property.totalRooms) {
      await safeRollback('property full');
      return { statusCode: 400, body: { message: 'Kamar kos sudah penuh.' } };
    }

    // Lock candidate rooms next (within properties -> rooms -> users -> rentals order)
    const [existingRentalPreRows] = await connection.query<RentalRow[]>(
      'SELECT roomId FROM rentals WHERE id = ?',
      [resolvedRentalId]
    );
    const preOldRoomId = existingRentalPreRows[0]?.roomId || null;
    const requestedRoomId =
      roomId && typeof roomId === 'string' && roomId.trim() !== '' ? roomId.trim() : undefined;
    targetRoomId = requestedRoomId || preOldRoomId;

    let lockedTargetRoom: RoomRow | undefined;
    if (targetRoomId) {
      const roomIdsToLock = Array.from(
        new Set([targetRoomId, preOldRoomId].filter(Boolean) as string[])
      ).sort();
      const [roomRows] = await connection.query<RoomRow[]>(
        `SELECT id, propertyId, roomNumber, floor, type, price, status, reserved_until, reserved_by_rental_id,
                GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
         FROM rooms
         WHERE id IN (${roomIdsToLock.map(() => '?').join(',')}) AND propertyId = ?
         ORDER BY id FOR UPDATE`,
        [...roomIdsToLock, propertyId]
      );

      lockedTargetRoom = roomRows.find((r) => r.id === targetRoomId);
      if (!lockedTargetRoom) {
        await safeRollback('room not found on property');
        return { statusCode: 404, body: { message: 'Kamar tidak ditemukan pada properti ini.' } };
      }
      if (
        lockedTargetRoom.status !== 'available' ||
        isRoomActivelyHeldByOther(lockedTargetRoom, resolvedRentalId)
      ) {
        await safeRollback('room unavailable');
        return { statusCode: 409, body: { message: 'Kamar yang Anda pilih sudah tidak tersedia.' } };
      }
    } else {
      const [discreteCountRows] = await connection.query<RowDataPacket[]>(
        'SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?',
        [propertyId]
      );
      const discreteCount = Number(discreteCountRows[0]?.count || 0);
      if (discreteCount > 0) {
        const [availableRooms] = await connection.query<RoomRow[]>(
          `SELECT id, propertyId, roomNumber, price, status, reserved_until, reserved_by_rental_id,
                  GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
           FROM rooms
           WHERE propertyId = ? AND status = 'available'
             AND (reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL OR reserved_by_rental_id = ?)
           ORDER BY roomNumber ASC, id ASC
           LIMIT 1 FOR UPDATE`,
          [propertyId, resolvedRentalId]
        );
        if (availableRooms.length === 0) {
          await safeRollback('no available rooms');
          return { statusCode: 409, body: { message: 'Kamar yang Anda pilih sudah tidak tersedia.' } };
        }
        lockedTargetRoom = availableRooms[0];
        targetRoomId = lockedTargetRoom.id;
      }
    }

    // Lock tenant row in users
    const [userRows] = await connection.query<UserRow[]>(
      'SELECT id, name, email, phone FROM users WHERE id = ? FOR UPDATE',
      [tenantId]
    );
    const tenant = userRows[0];
    if (!tenant) {
      await safeRollback('tenant missing');
      return { statusCode: 404, body: { message: 'Tenant tidak ditemukan.' } };
    }
    tenantName = tenant.name;
    tenantEmail = tenant.email;
    tenantPhone = tenant.phone || '';

    // Single Active Tenancy Check with row-level lock
    let activeRentalsQuery =
      "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' FOR UPDATE";
    const queryParams: (string | number)[] = [tenantId];
    if (customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== '') {
      activeRentalsQuery =
        "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' AND id != ? FOR UPDATE";
      queryParams.push(customRentalId.trim());
    }

    const [activeRentals] = await connection.query<RentalRow[]>(activeRentalsQuery, queryParams);
    if (activeRentals.length > 0) {
      await safeRollback('single active tenancy');
      return {
        statusCode: 409,
        body: {
          message:
            'Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru.'
        }
      };
    }

    // Lock rental row
    const [existingRentalRows] = await connection.query<RentalRow[]>(
      'SELECT * FROM rentals WHERE id = ? FOR UPDATE',
      [resolvedRentalId]
    );
    const existingRental = existingRentalRows[0];
    if (existingRental && existingRental.status !== 'pending') {
      await safeRollback('rental not pending');
      return { statusCode: 409, body: { message: 'Data sewa sudah tidak dalam status pending.' } };
    }

    const roomPriceOverride =
      lockedTargetRoom && typeof lockedTargetRoom.price === 'number' && lockedTargetRoom.price > 0
        ? Number(lockedTargetRoom.price)
        : null;

    monthlyRent = lockedTargetRoom
      ? roomPriceOverride || Number(property.price)
      : Number(existingRental?.price || property.price);
    adminFee = Number(existingRental?.admin_fee_amount ?? 5000.0);
    resolvedDuration =
      durationMonths && durationMonths > 0
        ? durationMonths
        : existingRental?.duration_months
          ? Number(existingRental.duration_months)
          : 1;
    totalAmount = monthlyRent * resolvedDuration + adminFee;

    if (!existingRental) {
      await connection.query(
        `INSERT INTO rentals (id, tenantId, propertyId, roomId, propertyName, price, startDate, start_date_iso, status, admin_fee_amount, duration_months)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          resolvedRentalId,
          tenantId,
          propertyId,
          targetRoomId,
          property.name,
          monthlyRent,
          startDate,
          startDateIso,
          adminFee,
          resolvedDuration
        ]
      );
    } else {
      const updatedStartIso =
        input.startDate && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate.trim())
          ? input.startDate.trim()
          : null;
      await connection.query(
        `UPDATE rentals
         SET roomId = ?,
             price = ?,
             duration_months = ?,
             startDate = COALESCE(?, startDate),
             start_date_iso = COALESCE(?, start_date_iso)
         WHERE id = ? AND status = 'pending'`,
        [
          targetRoomId,
          monthlyRent,
          resolvedDuration,
          input.startDate || null,
          updatedStartIso,
          resolvedRentalId
        ]
      );
    }

    if (lockedTargetRoom) {
      await connection.query(
        `UPDATE rooms
         SET reserved_until = NULL, reserved_by_rental_id = NULL
         WHERE reserved_by_rental_id = ? AND id != ?`,
        [resolvedRentalId, lockedTargetRoom.id]
      );
      await connection.query(
        `UPDATE rooms
         SET reserved_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE),
             reserved_by_rental_id = ?
         WHERE id = ?`,
        [resolvedRentalId, lockedTargetRoom.id]
      );
    }

    await connection.commit();
    transactionStarted = false;
  } catch (err: unknown) {
    await safeRollback('catch');
    if (isLockContentionError(err)) {
      console.warn(
        '[Payment Token] Lock wait timeout or deadlock (1205/1213):',
        (err as Error)?.message || err
      );
      return {
        statusCode: 409,
        body: {
          message:
            'High contention: unable to reserve room due to concurrent requests. Please retry.'
        }
      };
    }

    console.error('Create payment token transaction error:', err);
    return {
      statusCode: 500,
      body: { message: 'Gagal memproses transaksi pembuatan token pembayaran.' }
    };
  } finally {
    if (connection && !connectionReleased) {
      connectionReleased = true;
      try {
        connection.release();
      } catch (relErr: unknown) {
        console.warn('[Payment Token] Connection release warning:', relErr);
      }
    }
  }

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
    expiry: {
      unit: 'minutes',
      duration: 15
    },
    custom_field1: resolvedRentalId
  };

  try {
    await repo.upsertPendingTransaction({
      orderId: attemptOrderId,
      rentalId: resolvedRentalId,
      txType: 'initial',
      grossAmount: totalAmount,
      months: resolvedDuration
    });
  } catch (txErr) {
    console.warn('[Payment Token] Could not persist payment_transactions ledger entry:', txErr);
  }

  const isProduction =
    (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)) &&
    process.env.NODE_ENV !== 'test';
  const hasMidtransConfig = isMidtransConfigured();

  if (!hasMidtransConfig && isProduction) {
    return {
      statusCode: 500,
      body: {
        message:
          'Konfigurasi payment gateway Midtrans (MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY) belum diatur di server produksi.'
      }
    };
  }

  let transactionToken = `snap-token-${resolvedRentalId}`;
  let redirectUrl = getSnapRedirectUrl(resolvedRentalId);

  if (hasMidtransConfig) {
    try {
      configureSnapClient();
      const transaction = await snap.createTransaction(parameter);
      transactionToken = transaction.token;
      redirectUrl = transaction.redirect_url;
    } catch (snapErr) {
      console.error('Midtrans createTransaction error:', snapErr);
      const errMsg = snapErr instanceof Error ? snapErr.message : String(snapErr);
      return {
        statusCode: 502,
        body: { message: `Gagal membuat transaksi di Midtrans: ${errMsg}` }
      };
    }
  }

  return {
    statusCode: 200,
    body: {
      message: 'Token pembayaran berhasil dibuat.',
      token: transactionToken,
      redirect_url: redirectUrl,
      rentalId: resolvedRentalId,
      orderId: attemptOrderId
    }
  };
}

export async function settleRentalPayment(
  orderIdOrRentalId: string,
  paidAmount?: number,
  options?: { isWebhook?: boolean; repo?: PaymentRepository }
): Promise<{ success: boolean; statusCode?: number; message: string; rental?: RentalRow }> {
  const repo = options?.repo || paymentRepository;
  const trimmedOrderId = orderIdOrRentalId.trim();
  const { rentalId: targetRentalId, isRenewal } = extractOrderRentalId(trimmedOrderId);

  const isProductionMode =
    (process.env.NODE_ENV === 'production' || process.env.MIDTRANS_IS_PRODUCTION === 'true') &&
    process.env.NODE_ENV !== 'test' &&
    process.env.MIDTRANS_SKIP_UPSTREAM_VERIFY !== 'true';

  if (isProductionMode) {
    if (!isMidtransConfigured()) {
      return {
        success: false,
        statusCode: 500,
        message: 'Midtrans server key belum dikonfigurasi pada server produksi.'
      };
    }

    try {
      const upstreamStatus = await fetchMidtransTransactionStatus(trimmedOrderId);
      const isSettled = upstreamStatus.transaction_status === 'settlement';
      const isAcceptedCapture =
        upstreamStatus.transaction_status === 'capture' && upstreamStatus.fraud_status === 'accept';

      if (!isSettled && !isAcceptedCapture) {
        console.warn(
          `[Midtrans Upstream Verification] Order ${trimmedOrderId} rejected: status=${upstreamStatus.transaction_status}, fraud=${upstreamStatus.fraud_status}`
        );
        return {
          success: false,
          statusCode: 400,
          message: `Transaksi belum diselesaikan di Midtrans (status: ${upstreamStatus.transaction_status}).`
        };
      }

      const upstreamAmount = parseFloat(upstreamStatus.gross_amount);
      if (!isNaN(upstreamAmount) && (paidAmount === undefined || isNaN(paidAmount))) {
        paidAmount = upstreamAmount;
      }
    } catch (upstreamErr: unknown) {
      console.error(
        `[Midtrans Upstream Verification] Failed to query status for order ${trimmedOrderId}:`,
        upstreamErr
      );
      return {
        success: false,
        statusCode: 502,
        message: 'Gagal memverifikasi status transaksi ke payment gateway Midtrans.'
      };
    }
  }

  let connection: PoolConnection | null = null;
  let transactionStarted = false;
  let connectionReleased = false;

  const safeRollback = async (reason?: string) => {
    if (connection && transactionStarted) {
      await connection.rollback().catch((rbErr: unknown) => {
        console.warn(`[Settle Payment] Rollback swallowed error (${reason || 'unknown'}):`, rbErr);
      });
      transactionStarted = false;
    }
  };

  try {
    connection = await pool.getConnection();
    await connection.query('SET SESSION innodb_lock_wait_timeout = 5;');
    await connection.beginTransaction();
    transactionStarted = true;

    // Early non-locking lookup to discover propertyId & roomId for canonical lock order
    const [earlyRentalRows] = await connection.query<RentalRow[]>(
      'SELECT id, propertyId, roomId, status FROM rentals WHERE id = ? OR id = ?',
      [targetRentalId, trimmedOrderId]
    );
    const earlyRental = earlyRentalRows[0];

    if (!earlyRental) {
      await safeRollback('early rental missing');
      return { success: false, statusCode: 404, message: 'Data sewa tidak ditemukan.' };
    }

    // Strict Canonical Lock Order: properties -> rooms -> users -> rentals -> payment_transactions
    let property: PropertyRow | undefined;
    if (earlyRental.propertyId) {
      const [propRows] = await connection.query<PropertyRow[]>(
        'SELECT id, totalRooms, occupiedRooms, ownerId, price FROM properties WHERE id = ? FOR UPDATE',
        [earlyRental.propertyId]
      );
      property = propRows[0];
    }

    // Lock room before users/rentals if initial non-active booking
    let preLockedRoom: RoomRow | undefined;
    if (!isRenewal && earlyRental.status !== 'active' && earlyRental.propertyId) {
      if (earlyRental.roomId) {
        const [roomRows] = await connection.query<RoomRow[]>(
          `SELECT id, propertyId, roomNumber, price, status, reserved_until, reserved_by_rental_id,
                  GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
           FROM rooms WHERE id = ? FOR UPDATE`,
          [earlyRental.roomId]
        );
        preLockedRoom = roomRows[0];
      } else {
        const [availableRooms] = await connection.query<RoomRow[]>(
          `SELECT id, propertyId, roomNumber, price, status, reserved_until, reserved_by_rental_id,
                  GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
           FROM rooms
           WHERE propertyId = ? AND status = 'available'
             AND (reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL OR reserved_by_rental_id = ?)
           ORDER BY roomNumber ASC, id ASC
           LIMIT 1 FOR UPDATE`,
          [earlyRental.propertyId, earlyRental.id]
        );
        preLockedRoom = availableRooms[0];
      }
    }

    if (property && property.ownerId) {
      await connection.query<UserRow[]>(
        'SELECT id, balance, totalRevenue FROM users WHERE id = ? FOR UPDATE',
        [property.ownerId]
      );
    }

    const [rentalRows] = await connection.query<RentalRow[]>(
      'SELECT * FROM rentals WHERE id = ? OR id = ? FOR UPDATE',
      [targetRentalId, trimmedOrderId]
    );
    const rental = rentalRows[0];

    if (!rental) {
      await safeRollback('rental missing');
      return { success: false, statusCode: 404, message: 'Data sewa tidak ditemukan.' };
    }

    const resolvedRentalId = rental.id;
    const monthlyPrice = Number(rental.price || 0);
    const durationMonths = Number(rental.duration_months || 1);
    const adminFee = Number(
      rental.admin_fee_amount !== undefined && rental.admin_fee_amount !== null
        ? rental.admin_fee_amount
        : 5000
    );

    const existingTx = await repo.findByOrderIdForUpdate(trimmedOrderId, connection);
    if (existingTx?.status === 'settled') {
      await connection.commit();
      transactionStarted = false;
      return {
        success: true,
        statusCode: 200,
        message: isRenewal
          ? 'Pembayaran perpanjangan sewa sudah diproses sebelumnya.'
          : 'Pembayaran sudah diproses sebelumnya.',
        rental
      };
    }

    if (existingTx?.status === 'refund_required') {
      await connection.commit();
      transactionStarted = false;
      return {
        success: true,
        statusCode: 200,
        message: 'Transaksi sudah tercatat memerlukan refund karena kamar penuh.',
        rental
      };
    }

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
        const expectedRenewalWithAdmin = monthlyPrice * renewedMonths + adminFee;
        const expectedRenewalBase = monthlyPrice * renewedMonths;
        const isPriceMatch =
          Math.abs(paidAmount - expectedRenewalWithAdmin) <= 1.0 ||
          Math.abs(paidAmount - expectedRenewalBase) <= 1.0 ||
          Math.abs(paidAmount - (monthlyPrice + adminFee)) <= 1.0;

        if (!isPriceMatch) {
          await safeRollback('renewal price mismatch');
          console.error(
            `Midtrans renewal gross_amount mismatch: expected ${expectedRenewalWithAdmin} or ${expectedRenewalBase}, got ${paidAmount}`
          );
          return {
            success: false,
            statusCode: 400,
            message: 'Jumlah nominal pembayaran tidak sesuai dengan biaya perpanjangan sewa.'
          };
        }
      }

      const settledAmount =
        paidAmount !== undefined && !isNaN(paidAmount)
          ? paidAmount
          : monthlyPrice * renewedMonths + adminFee;

      await repo.recordFinalTransactionStatus(
        {
          orderId: trimmedOrderId,
          rentalId: resolvedRentalId,
          txType: 'renewal',
          grossAmount: settledAmount,
          months: renewedMonths,
          status: 'settled'
        },
        connection
      );

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
      transactionStarted = false;
      apiCache.invalidatePattern('properties');
      apiCache.invalidatePattern('rentals');
      apiCache.invalidatePattern('landlord:');
      apiCache.invalidatePattern('admin:');

      return {
        success: true,
        statusCode: 200,
        message: 'Pembayaran perpanjangan sewa berhasil diproses.',
        rental: {
          ...rental,
          status: 'active',
          duration_months: durationMonths + renewedMonths
        }
      };
    }

    const expectedWithAdmin = monthlyPrice * durationMonths + adminFee;
    const expectedBase = monthlyPrice * durationMonths;

    if (paidAmount !== undefined && !isNaN(paidAmount)) {
      const isPriceMatch =
        Math.abs(paidAmount - expectedWithAdmin) <= 1.0 ||
        Math.abs(paidAmount - expectedBase) <= 1.0 ||
        Math.abs(paidAmount - monthlyPrice) <= 1.0;

      if (!isPriceMatch) {
        await safeRollback('price mismatch');
        console.error(
          `Midtrans gross_amount mismatch: expected ${expectedWithAdmin} or ${expectedBase}, got ${paidAmount}`
        );
        return {
          success: false,
          statusCode: 400,
          message: 'Jumlah nominal pembayaran tidak sesuai dengan harga sewa.'
        };
      }
    }

    if (rental.status !== 'active') {
      const [activeRentals] = await connection.query<RentalRow[]>(
        "SELECT id FROM rentals WHERE tenantId = ? AND status = 'active' AND id != ? FOR UPDATE",
        [rental.tenantId, resolvedRentalId]
      );
      if (activeRentals.length > 0) {
        await safeRollback('single active tenancy');
        return {
          success: false,
          statusCode: 409,
          message: 'Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif.'
        };
      }

      let lockedRoom: RoomRow | undefined = preLockedRoom;
      let targetRoomId = rental.roomId;

      const isRoomEligible = (room: RoomRow | undefined): boolean =>
        Boolean(
          room &&
            room.status === 'available' &&
            !isRoomActivelyHeldByOther(room, resolvedRentalId)
        );

      if (targetRoomId) {
        if (!lockedRoom || lockedRoom.id !== targetRoomId) {
          const [roomRows] = await connection.query<RoomRow[]>(
            `SELECT id, propertyId, roomNumber, price, status, reserved_until, reserved_by_rental_id,
                    GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
             FROM rooms WHERE id = ? FOR UPDATE`,
            [targetRoomId]
          );
          lockedRoom = roomRows[0];
        }

        if (!isRoomEligible(lockedRoom)) {
          if (options?.isWebhook) {
            const propBasePrice = Number(property?.price || 0);
            const [fallbackRooms] = await connection.query<RoomRow[]>(
              `SELECT id, propertyId, roomNumber, price, status, reserved_until, reserved_by_rental_id,
                      GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
               FROM rooms
               WHERE propertyId = ? AND status = 'available'
                 AND (reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL OR reserved_by_rental_id = ?)
                 AND COALESCE(NULLIF(price, 0), ?) = ?
               ORDER BY roomNumber ASC, id ASC
               LIMIT 1 FOR UPDATE`,
              [rental.propertyId, resolvedRentalId, propBasePrice, monthlyPrice]
            );
            if (fallbackRooms.length > 0) {
              lockedRoom = fallbackRooms[0];
              targetRoomId = lockedRoom.id;
            } else {
              const settledAmount =
                paidAmount !== undefined && !isNaN(paidAmount) ? paidAmount : expectedWithAdmin;
              await repo.recordFinalTransactionStatus(
                {
                  orderId: trimmedOrderId,
                  rentalId: resolvedRentalId,
                  txType: 'initial',
                  grossAmount: settledAmount,
                  months: durationMonths,
                  status: 'refund_required'
                },
                connection
              );
              await repo.clearRoomHoldByRentalId(resolvedRentalId, connection);
              await connection.query(
                "UPDATE rentals SET status = 'cancelled' WHERE id = ? AND status = 'pending'",
                [resolvedRentalId]
              );
              await connection.commit();
              transactionStarted = false;
              apiCache.invalidatePattern('properties');
              apiCache.invalidatePattern('rentals');
              return {
                success: true,
                statusCode: 200,
                message: 'Kamar sudah penuh pada saat pembayaran diterima; transaksi ditandai refund_required.'
              };
            }
          } else {
            await safeRollback('room unavailable');
            console.error(
              `Overbooking conflict detected for room ${targetRoomId}, status: ${lockedRoom?.status}`
            );
            return {
              success: false,
              statusCode: 409,
              message: 'Kamar sudah terisi atau tidak tersedia.'
            };
          }
        }
      } else {
        if (lockedRoom && isRoomEligible(lockedRoom)) {
          targetRoomId = lockedRoom.id;
        } else {
          const [discreteCountRows] = await connection.query<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?',
            [rental.propertyId]
          );
          if (Number(discreteCountRows[0]?.count || 0) > 0) {
            if (options?.isWebhook) {
              const settledAmount =
                paidAmount !== undefined && !isNaN(paidAmount) ? paidAmount : expectedWithAdmin;
              await repo.recordFinalTransactionStatus(
                {
                  orderId: trimmedOrderId,
                  rentalId: resolvedRentalId,
                  txType: 'initial',
                  grossAmount: settledAmount,
                  months: durationMonths,
                  status: 'refund_required'
                },
                connection
              );
              await connection.commit();
              transactionStarted = false;
              return {
                success: true,
                statusCode: 200,
                message: 'Kamar sudah penuh pada saat pembayaran diterima; transaksi ditandai refund_required.'
              };
            }
            await safeRollback('no discrete rooms available');
            return {
              success: false,
              statusCode: 409,
              message: 'Kamar sudah terisi atau tidak tersedia.'
            };
          }
          if (property && property.occupiedRooms >= property.totalRooms) {
            await safeRollback('property full');
            console.error(
              `Overbooking conflict detected for property ${property.id}, rental ${resolvedRentalId}`
            );
            return {
              success: false,
              statusCode: 409,
              message: 'Kamar sudah penuh, pembayaran memerlukan penanganan manual.'
            };
          }
        }
      }

      await connection.query(
        "UPDATE rentals SET status = 'active', roomId = ? WHERE id = ?",
        [targetRoomId || null, resolvedRentalId]
      );

      if (lockedRoom) {
        await connection.query(
          "UPDATE rooms SET status = 'occupied', reserved_until = NULL, reserved_by_rental_id = NULL WHERE id = ?",
          [lockedRoom.id]
        );
        await repo.clearRoomHoldByRentalId(resolvedRentalId, connection);
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

    const settledAmount =
      paidAmount !== undefined && !isNaN(paidAmount) ? paidAmount : expectedWithAdmin;
    await repo.recordFinalTransactionStatus(
      {
        orderId: trimmedOrderId,
        rentalId: resolvedRentalId,
        txType: 'initial',
        grossAmount: settledAmount,
        months: durationMonths,
        status: 'settled'
      },
      connection
    );
    await repo.markPendingInitialTransactionsSettled(resolvedRentalId, connection);

    await connection.commit();
    transactionStarted = false;
    apiCache.invalidatePattern('properties');
    apiCache.invalidatePattern('rentals');
    apiCache.invalidatePattern('rooms');
    apiCache.invalidatePattern('landlord:');
    apiCache.invalidatePattern('admin:');
    return {
      success: true,
      statusCode: 200,
      message: 'Pembayaran berhasil diproses dan status rental diaktifkan.',
      rental: { ...rental, status: 'active' }
    };
  } catch (err: unknown) {
    await safeRollback('catch');
    if (isLockContentionError(err)) {
      console.warn(
        '[Settle Payment] Lock wait timeout or deadlock (1205/1213):',
        (err as Error)?.message || err
      );
      return {
        success: false,
        statusCode: 409,
        message:
          'High contention: unable to settle rental payment due to concurrent lock timeout. Please retry.'
      };
    }
    console.error('Settle rental payment error:', err);
    return { success: false, statusCode: 500, message: 'Gagal memproses transaksi sewa.' };
  } finally {
    if (connection && !connectionReleased) {
      connectionReleased = true;
      try {
        connection.release();
      } catch (relErr: unknown) {
        console.warn('[Settle Payment] Connection release warning:', relErr);
      }
    }
  }
}

export async function handleMidtransWebhookCancellation(
  orderId: string,
  transactionStatus: string,
  repo: PaymentRepository = paymentRepository
): Promise<string> {
  const trimmedOrderId = orderId.trim();
  await repo.markTransactionCancelled(trimmedOrderId);
  if (trimmedOrderId.startsWith('RENEW-')) {
    return `Status perpanjangan sewa dibatalkan (${transactionStatus}).`;
  }
  const { rentalId: targetRentalId } = extractOrderRentalId(trimmedOrderId);
  await repo.clearRoomHoldByRentalId(targetRentalId);
  await pool.query(
    "UPDATE rentals SET status = 'cancelled' WHERE (id = ? OR id = ?) AND status = 'pending'",
    [targetRentalId, trimmedOrderId]
  );
  apiCache.invalidatePattern('properties');
  apiCache.invalidatePattern('rentals');
  apiCache.invalidatePattern('rooms');
  return `Status transaksi dibatalkan (${transactionStatus}).`;
}
