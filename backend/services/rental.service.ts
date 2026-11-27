import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, syncPropertyRoomCounts } from '../db';
import { apiCache } from './cache';
import {
  RentalsRepository,
  rentalsRepository,
  type RentalRow
} from '../repositories/rentals.repository';
import type { JWTPayload } from '../middleware/auth';
import type { PropertyRow } from './transformers';
import type { RoomRow } from '../types/index';
import type { UserRow } from '../routes/auth.routes';
import { isUserProfileComplete } from '../types/index';
import { generateId } from '../utils/id';
import { snap, isMidtransConfigured, configureSnapClient, getSnapRedirectUrl } from '../routes/payment.routes';
import { paymentRepository } from '../repositories/payment.repository';

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

export interface EnrichedRentalRow extends RentalRow {
  nextPaymentDate: string;
  nextPaymentDateISO: string;
  daysRemaining: number;
  paymentStatus: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  leaseEndDateISO?: string;
  totalDurationMonths?: number;
}

export interface CreateBookingInput {
  authUser: JWTPayload;
  tenantId: string;
  propertyId: string;
  propertyName?: string;
  price?: number;
  durationMonths?: number;
  signature?: string;
  roomId?: string;
  rentalId?: string;
  startDate?: string;
}

export class RentalServiceError extends Error {
  constructor(public statusCode: number, message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'RentalServiceError';
  }
}

export class RentalService {
  constructor(private repo: RentalsRepository = rentalsRepository) {}

  private parseFlexibleStartDate(startDateStr: string, fallback: Date): Date {
    if (!startDateStr || typeof startDateStr !== 'string') {
      return new Date(fallback);
    }
    const trimmed = startDateStr.trim();
    const direct = new Date(trimmed);
    if (!isNaN(direct.getTime())) {
      return direct;
    }
    const idMonthMap: Record<string, string> = {
      januari: 'January',
      februari: 'February',
      maret: 'March',
      april: 'April',
      mei: 'May',
      juni: 'June',
      juli: 'July',
      agustus: 'August',
      agu: 'Aug',
      ags: 'Aug',
      september: 'September',
      oktober: 'October',
      okt: 'Oct',
      november: 'November',
      nopember: 'November',
      desember: 'December',
      des: 'Dec'
    };
    const normalized = trimmed.replace(
      /\b(januari|februari|maret|april|mei|juni|juli|agustus|agu|ags|september|oktober|okt|november|nopember|desember|des)\b/gi,
      (match) => idMonthMap[match.toLowerCase()] || match
    );
    const parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
  }

  computePaymentSchedule(
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

    const start = this.parseFlexibleStartDate(startDateStr, now);
    start.setHours(0, 0, 0, 0);

    const startDay = start.getDate();

    const getClampedDate = (months: number): Date => {
      const totalMonths = start.getMonth() + months;
      const year = start.getFullYear() + Math.floor(totalMonths / 12);
      const month = ((totalMonths % 12) + 12) % 12;
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
    const leaseEndDateISO = `${leaseEnd.getFullYear()}-${pad(leaseEnd.getMonth() + 1)}-${pad(
      leaseEnd.getDate()
    )}`;

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

  private enrichRental(r: RentalRow): EnrichedRentalRow {
    const duration = Number(r.duration_months || 1);
    const schedule = this.computePaymentSchedule(
      r.startDate || new Date().toISOString(),
      r.status,
      duration
    );
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
  }

  async getRentals(
    authUser: JWTPayload,
    tenantIdFilter?: string,
    limit?: number,
    offset = 0
  ): Promise<EnrichedRentalRow[]> {
    const rows = await this.repo.findRentalsByFilter(
      authUser.role,
      authUser.id,
      tenantIdFilter,
      limit,
      offset
    );
    return rows.map((r) => this.enrichRental(r));
  }

  async getTenantRentals(tenantId: string): Promise<EnrichedRentalRow[]> {
    const rows = await this.repo.findTenantRentals(tenantId);
    return rows.map((r) => this.enrichRental(r));
  }

  async getRentalById(rentalId: string, authUser: JWTPayload): Promise<EnrichedRentalRow> {
    const rental = await this.repo.findRentalById(rentalId);
    if (!rental) {
      throw new RentalServiceError(404, 'Data sewa tidak ditemukan.');
    }

    const isTenant = authUser.id === rental.tenantId;
    const isOwner = Boolean(
      (rental as unknown as { propertyOwnerId?: string }).propertyOwnerId &&
        authUser.id === (rental as unknown as { propertyOwnerId?: string }).propertyOwnerId
    );
    const isAdmin = authUser.role === 'admin';

    if (!isTenant && !isOwner && !isAdmin) {
      throw new RentalServiceError(403, 'Akses ditolak ke data sewa ini.');
    }

    return this.enrichRental(rental);
  }

  async createBooking(input: CreateBookingInput) {
    const {
      authUser,
      tenantId,
      propertyId,
      propertyName,
      price,
      durationMonths,
      signature,
      roomId,
      rentalId: customRentalId
    } = input;

    if (!tenantId || !propertyId) {
      throw new RentalServiceError(400, 'tenantId dan propertyId wajib diisi.');
    }

    if (authUser.role !== 'admin' && authUser.id !== tenantId) {
      throw new RentalServiceError(
        403,
        'Akses ditolak. Anda tidak dapat memesan atas nama akun lain.'
      );
    }

    const rentalId =
      customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== ''
        ? customRentalId.trim()
        : generateId('rent');

    const isProdBookingGuard =
      (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)) &&
      process.env.NODE_ENV !== 'test' &&
      authUser.role !== 'admin';

    if (isProdBookingGuard && !isMidtransConfigured()) {
      throw new RentalServiceError(
        500,
        'Konfigurasi payment gateway Midtrans belum diatur di server produksi.'
      );
    }

    if (
      process.env.MIDTRANS_SERVER_KEY &&
      !process.env.MIDTRANS_SERVER_KEY.includes('placeholder') &&
      !process.env.MIDTRANS_SERVER_KEY.includes('your-server-key')
    ) {
      try {
        const snapApi = snap as unknown as {
          transaction?: {
            status: (orderId: string) => Promise<{
              transaction_status: string;
              fraud_status?: string;
              gross_amount: string;
            }>;
          };
        };
        if (snapApi.transaction?.status) {
          const statusResponse = await snapApi.transaction.status(rentalId);
          const isValidPayment =
            statusResponse.transaction_status === 'settlement' ||
            (statusResponse.transaction_status === 'capture' &&
              statusResponse.fraud_status === 'accept');
          if (!isValidPayment) {
            throw new RentalServiceError(
              402,
              'Pembayaran belum diselesaikan pada payment gateway Midtrans.'
            );
          }
        }
      } catch (midtransErr) {
        if (midtransErr instanceof RentalServiceError) throw midtransErr;
        if (isProdBookingGuard) {
          const errMsg = midtransErr instanceof Error ? midtransErr.message : String(midtransErr);
          if (errMsg.includes('404')) {
            throw new RentalServiceError(
              402,
              'Pembayaran belum ditemukan atau belum diselesaikan pada Midtrans.'
            );
          }
          throw new RentalServiceError(
            502,
            'Gagal memverifikasi status transaksi pada payment gateway Midtrans.'
          );
        }
        console.warn('Midtrans status check warning:', midtransErr);
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.query('SET SESSION innodb_lock_wait_timeout = 5;');
      await connection.beginTransaction();

      // Canonical Lock Order: properties -> rooms -> users -> rentals
      const property = await this.repo.findPropertyById(propertyId, connection, true);
      if (!property) {
        await connection.rollback();
        throw new RentalServiceError(404, 'Properti tidak ditemukan.');
      }

      if (property.occupiedRooms >= property.totalRooms) {
        await connection.rollback();
        throw new RentalServiceError(400, 'Kamar kos sudah penuh.');
      }

      const [existingPre] = await connection.query<RentalRow[]>(
        'SELECT roomId FROM rentals WHERE id = ?',
        [rentalId]
      );
      const targetRoomId = roomId || existingPre[0]?.roomId;

      let assignedRoom: RoomRow | undefined;
      if (targetRoomId) {
        assignedRoom = await this.repo.findRoomById(targetRoomId, propertyId, connection, true);
        if (!assignedRoom) {
          await connection.rollback();
          throw new RentalServiceError(404, 'Kamar tidak ditemukan pada properti ini.');
        }
        const heldByOther =
          Boolean(assignedRoom.reserved_by_rental_id) &&
          assignedRoom.reserved_by_rental_id !== rentalId &&
          Number(assignedRoom.holdRemainingSeconds || 0) > 0;
        if (assignedRoom.status !== 'available' || heldByOther) {
          await connection.rollback();
          throw new RentalServiceError(409, 'Kamar yang Anda pilih sudah tidak tersedia.');
        }
      } else {
        const availableRoom = await this.repo.findAvailableRoom(
          propertyId,
          connection,
          true,
          rentalId
        );
        if (availableRoom) {
          assignedRoom = availableRoom;
        } else {
          const discreteCount = await this.repo.countRoomsByPropertyId(propertyId, connection);
          if (discreteCount > 0) {
            await connection.rollback();
            throw new RentalServiceError(409, 'Kamar yang Anda pilih sudah tidak tersedia.');
          }
        }
      }

      const tenant = await this.repo.findUserById(tenantId, connection, true);
      if (!tenant) {
        await connection.rollback();
        throw new RentalServiceError(404, 'Pengguna tidak ditemukan.');
      }

      const existingRental = await this.repo.findExistingRentalForUpdate(rentalId, connection);
      if (existingRental && existingRental.status === 'active') {
        await connection.commit();
        return {
          message: 'Penyewaan kos sudah aktif!',
          rentalId,
          document: existingRental.document || 'sertifikat_kepemilikan.pdf'
        };
      }

      const activeRentals = await this.repo.findActiveRentalsByTenantId(tenantId, connection, true);
      const isCurrentRentalActive = activeRentals.some((r) => r.id === rentalId);
      if (activeRentals.length > 0 && !isCurrentRentalActive) {
        await connection.rollback();
        throw new RentalServiceError(
          409,
          'Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru.'
        );
      }

      const profileCheck = isUserProfileComplete(tenant);
      if (!profileCheck.complete) {
        await connection.rollback();
        throw new RentalServiceError(
          422,
          'Profil identitas hukum penyewa belum lengkap. Berdasarkan Pasal 1320 KUHPerdata & UU ITE, Anda wajib melengkapi data identitas (NIK/Paspor, Alamat Domisili, Pekerjaan, dan Kontak Darurat) pada profil Anda sebelum menyewa kos.',
          {
            missingFields: profileCheck.missingFields,
            missingFieldLabels: profileCheck.missingFieldLabels
          }
        );
      }

      const duration = Number(durationMonths) || 1;
      // Compute effectivePrice strictly from authoritative DB room/property price (ignore client-supplied price)
      const effectivePrice =
        assignedRoom &&
        assignedRoom.price !== null &&
        assignedRoom.price !== undefined &&
        Number(assignedRoom.price) > 0
          ? Number(assignedRoom.price)
          : Number(property.price || 0);

      const addedRevenue = effectivePrice * duration;
      const startDateStr =
        input.startDate && typeof input.startDate === 'string' && input.startDate.trim() !== ''
          ? input.startDate.trim()
          : new Date().toISOString().split('T')[0];
      const resolvedPropertyName = propertyName || property.name || 'Kos KOSMO';
      const documentUrl = `/uploads/rental_contract_${rentalId}.pdf`;

      if (assignedRoom) {
        await this.repo.setRoomStatus(assignedRoom.id, 'occupied', connection);
        // Atomically synchronize property occupiedRooms count within the active transaction
        await syncPropertyRoomCounts(connection, propertyId);
      } else {
        // Fallback for legacy properties without discrete room rows
        await this.repo.incrementPropertyOccupied(propertyId, connection);
      }

      if (property.ownerId) {
        const platformCommission = Math.round(addedRevenue * 0.03);
        const netLandlordCredit = addedRevenue - platformCommission;
        await this.repo.creditLandlordNetBalance(
          property.ownerId,
          netLandlordCredit,
          addedRevenue,
          connection
        );
      }

      if (existingRental) {
        await this.repo.activateExistingRental(rentalId, effectivePrice, documentUrl, duration, connection);
      } else {
        await this.repo.insertRentalBooking(
          {
            id: rentalId,
            tenantId,
            propertyId,
            roomId: assignedRoom ? assignedRoom.id : null,
            propertyName: resolvedPropertyName,
            price: effectivePrice,
            startDate: startDateStr,
            status: 'active',
            document: documentUrl,
            durationMonths: duration
          },
          connection
        );
      }

      await connection.commit();
      apiCache.invalidatePattern('properties');
      apiCache.invalidatePattern('rentals');
      apiCache.invalidatePattern('landlord:');
      apiCache.invalidatePattern('admin:');

      return {
        message: 'Penyewaan kos berhasil dibuat!',
        rentalId,
        document: documentUrl,
        roomId: assignedRoom ? assignedRoom.id : null,
        roomNumber: assignedRoom ? assignedRoom.roomNumber : null
      };
    } catch (err) {
      await connection.rollback().catch((rbErr: unknown) => {
        console.warn('[Rental Service] createBooking rollback warning:', rbErr);
      });
      throw err;
    } finally {
      connection.release();
    }
  }

  async terminateRental(rentalId: string, authUser: JWTPayload, password?: string) {
    if (!password) {
      throw new RentalServiceError(400, 'Password wajib dimasukkan.');
    }

    const connection = await pool.getConnection();
    try {
      await connection.query('SET SESSION innodb_lock_wait_timeout = 5;');
      await connection.beginTransaction();

      const earlyRental = await this.repo.findRentalSummaryById(rentalId, connection);
      if (!earlyRental) {
        await connection.rollback();
        throw new RentalServiceError(404, 'Data sewa tidak ditemukan.');
      }
      if (earlyRental.status === 'terminated') {
        await connection.rollback();
        throw new RentalServiceError(400, 'Sewa sudah pernah diberhentikan.');
      }

      const caller = await this.repo.findUserPasswordById(authUser.id, connection);
      const isMatch = caller?.password ? await bcrypt.compare(password, caller.password) : false;
      if (!caller || !caller.password || !isMatch) {
        await connection.rollback();
        throw new RentalServiceError(401, 'Password salah.');
      }

      const property = await this.repo.findPropertyById(earlyRental.propertyId, connection, true);

      const isTenant = authUser.id === earlyRental.tenantId;
      const isOwner = Boolean(property && authUser.id === property.ownerId);
      const isAdmin = authUser.role === 'admin';

      if (!isTenant && !isOwner && !isAdmin) {
        await connection.rollback();
        throw new RentalServiceError(
          403,
          'Akses ditolak. Anda tidak berhak memberhentikan sewa ini.'
        );
      }

      const rental = await this.repo.findRentalForUpdate(rentalId, connection);
      if (!rental) {
        await connection.rollback();
        throw new RentalServiceError(404, 'Data sewa tidak ditemukan.');
      }
      if (rental.status === 'terminated') {
        await connection.rollback();
        throw new RentalServiceError(400, 'Sewa sudah pernah diberhentikan.');
      }

      if (rental.status === 'active') {
        if (rental.roomId) {
          await this.repo.lockRoomById(rental.roomId, connection);
          await this.repo.setRoomStatus(rental.roomId, 'available', connection);
          try {
            await syncPropertyRoomCounts(connection, rental.propertyId);
          } catch {
            // Non-blocking sync
          }
        } else {
          await this.repo.decrementPropertyOccupied(rental.propertyId, connection);
        }
      }

      await this.repo.updateRentalStatus(rentalId, 'terminated', connection);

      await connection.commit();
      apiCache.invalidatePattern('properties');
      apiCache.invalidatePattern('rentals');
      apiCache.invalidatePattern('landlord:');
      apiCache.invalidatePattern('admin:');

      return { message: 'Sewa kos berhasil diberhentikan.' };
    } catch (err) {
      await connection.rollback().catch((rbErr: unknown) => {
        console.warn('[Rental Service] terminateRental rollback warning:', rbErr);
      });
      throw err;
    } finally {
      connection.release();
    }
  }

  async cancelPendingRental(
    rentalId: string,
    authUser: JWTPayload
  ): Promise<{ message: string; rentalId: string }> {
    if (!rentalId || typeof rentalId !== 'string' || rentalId.trim() === '') {
      throw new RentalServiceError(400, 'rentalId wajib diisi.');
    }

    const resolvedRentalId = rentalId.trim();
    const connection = await pool.getConnection();
    try {
      await connection.query('SET SESSION innodb_lock_wait_timeout = 5;');
      await connection.beginTransaction();

      const rental = await this.repo.findRentalForUpdate(resolvedRentalId, connection);
      if (!rental) {
        await connection.rollback();
        throw new RentalServiceError(404, 'Data sewa tidak ditemukan.');
      }

      const isTenant = authUser.id === rental.tenantId;
      const isAdmin = authUser.role === 'admin';
      if (!isTenant && !isAdmin) {
        await connection.rollback();
        throw new RentalServiceError(
          403,
          'Akses ditolak. Anda tidak berhak membatalkan pesanan sewa ini.'
        );
      }

      if (rental.status === 'cancelled') {
        await connection.commit();
        return {
          message: 'Pesanan sewa sudah dibatalkan.',
          rentalId: resolvedRentalId
        };
      }

      if (rental.status !== 'pending') {
        await connection.rollback();
        throw new RentalServiceError(
          400,
          'Hanya pesanan sewa yang menunggu pembayaran (pending) yang dapat dibatalkan.'
        );
      }

      await this.repo.clearRoomHoldByRentalId(resolvedRentalId, connection);
      await this.repo.updateRentalStatus(resolvedRentalId, 'cancelled', connection);
      await connection.commit();

      apiCache.invalidatePattern('properties');
      apiCache.invalidatePattern('rentals');
      apiCache.invalidatePattern('rooms');
      apiCache.invalidatePattern('landlord:');
      apiCache.invalidatePattern('admin:');

      return {
        message: 'Pesanan sewa berhasil dibatalkan.',
        rentalId: resolvedRentalId
      };
    } catch (err) {
      await connection.rollback().catch((rbErr: unknown) => {
        console.warn('[Rental Service] cancelPendingRental rollback warning:', rbErr);
      });
      throw err;
    } finally {
      connection.release();
    }
  }

  async createRenewalToken(
    rentalId: string,
    authUser: JWTPayload,
    months = 1
  ): Promise<{
    message: string;
    token: string;
    redirect_url: string;
    rentalId: string;
    orderId: string;
    grossAmount: number;
  }> {
    if (!rentalId || typeof rentalId !== 'string' || rentalId.trim() === '') {
      throw new RentalServiceError(400, 'rentalId wajib diisi.');
    }

    const durationMonths = Math.max(1, Math.floor(months || 1));
    const resolvedRentalId = rentalId.trim();

    let tenantName = '';
    let tenantEmail = '';
    let tenantPhone = '';
    let propertyId = '';
    let propertyName = '';
    let monthlyRent = 0;
    const adminFee = 5000.0;
    let totalGrossAmount = 0;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Early lookup for propertyId to preserve strict lock hierarchy: users -> properties -> rentals
      const earlyRental = await this.repo.findRentalSummaryById(resolvedRentalId, connection);
      if (!earlyRental) {
        await connection.rollback();
        throw new RentalServiceError(404, 'Data sewa tidak ditemukan.');
      }

      // 1. Lock tenant row in users
      const tenant = await this.repo.findUserById(authUser.id, connection, true);
      if (!tenant) {
        await connection.rollback();
        throw new RentalServiceError(404, 'Pengguna tidak ditemukan.');
      }
      tenantName = tenant.name;
      tenantEmail = tenant.email;
      tenantPhone = tenant.phone || '';

      // 2. Lock property row in properties
      propertyId = earlyRental.propertyId;
      const property = await this.repo.findPropertyById(propertyId, connection, true);
      if (!property) {
        await connection.rollback();
        throw new RentalServiceError(404, 'Properti tidak ditemukan.');
      }
      propertyName = property.name;

      // 3. Lock rental row in rentals
      const [rentalRows] = await connection.query<RentalRow[]>(
        'SELECT * FROM rentals WHERE id = ? FOR UPDATE',
        [resolvedRentalId]
      );
      const rental = rentalRows[0];
      if (!rental) {
        await connection.rollback();
        throw new RentalServiceError(404, 'Data sewa tidak ditemukan.');
      }

      if (authUser.role !== 'admin' && authUser.id !== rental.tenantId) {
        await connection.rollback();
        throw new RentalServiceError(403, 'Akses ditolak. Anda tidak dapat memperpanjang sewa akun lain.');
      }

      if (rental.status !== 'active') {
        await connection.rollback();
        throw new RentalServiceError(
          400,
          `Hanya sewa dengan status aktif yang dapat diperpanjang. Status sewa saat ini: ${rental.status}`
        );
      }

      // Single Active Tenancy Guard: verify no OTHER active rental exists for this tenant
      const [conflictingRentals] = await connection.query<RentalRow[]>(
        "SELECT id FROM rentals WHERE tenantId = ? AND status = 'active' AND id != ? FOR UPDATE",
        [rental.tenantId, resolvedRentalId]
      );
      if (conflictingRentals.length > 0) {
        await connection.rollback();
        throw new RentalServiceError(
          409,
          'Single Active Tenancy Violation: Anda memiliki sewa kos aktif lain yang bertentangan.'
        );
      }

      monthlyRent = Number(rental.price || property.price || 0);
      totalGrossAmount = (monthlyRent * durationMonths) + adminFee;

      // Commit DB transaction BEFORE external Midtrans HTTP call
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    const now = new Date();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const yy = String(now.getUTCFullYear()).slice(-2);
    const attemptOrderId = `RENEW-${resolvedRentalId}-${mm}${yy}-${Date.now()}`;

    const parameter = {
      transaction_details: {
        order_id: attemptOrderId,
        gross_amount: totalGrossAmount
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
          quantity: durationMonths,
          name: `Perpanjangan Sewa - ${propertyName.substring(0, 28)}`
        },
        {
          id: 'ADMIN_FEE',
          price: adminFee,
          quantity: 1,
          name: 'Biaya Administrasi & Layanan'
        }
      ],
      custom_field1: resolvedRentalId,
      expiry: {
        unit: 'minutes',
        duration: 15
      }
    };

    try {
      await paymentRepository.upsertPendingTransaction({
        orderId: attemptOrderId,
        rentalId: resolvedRentalId,
        txType: 'renewal',
        grossAmount: totalGrossAmount,
        months: durationMonths
      });
    } catch (txErr) {
      console.warn('[Renewal Token] Could not persist payment_transactions ledger entry:', txErr);
    }

    const isProduction = (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)) && process.env.NODE_ENV !== 'test';
    const hasMidtransConfig = isMidtransConfigured();

    if (!hasMidtransConfig && isProduction) {
      throw new RentalServiceError(
        500,
        'Konfigurasi payment gateway Midtrans belum diatur di server produksi.'
      );
    }

    let transactionToken = `snap-token-renewal-${resolvedRentalId}`;
    let redirectUrl = getSnapRedirectUrl(resolvedRentalId);

    if (hasMidtransConfig) {
      try {
        configureSnapClient();
        const transaction = await snap.createTransaction(parameter);
        transactionToken = transaction.token;
        redirectUrl = transaction.redirect_url;
      } catch (snapErr: unknown) {
        console.error('Midtrans renewal createTransaction error:', snapErr);
        const errMsg = snapErr instanceof Error ? snapErr.message : String(snapErr);
        throw new RentalServiceError(502, `Gagal membuat transaksi di Midtrans: ${errMsg}`);
      }
    }

    return {
      message: 'Token perpanjangan sewa berhasil dibuat.',
      token: transactionToken,
      redirect_url: redirectUrl,
      rentalId: resolvedRentalId,
      orderId: attemptOrderId,
      grossAmount: totalGrossAmount
    };
  }
}

export const rentalService = new RentalService();

