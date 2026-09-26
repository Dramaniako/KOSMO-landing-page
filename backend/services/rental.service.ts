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
import { snap } from '../routes/payment.routes';

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
}

export class RentalServiceError extends Error {
  constructor(public statusCode: number, message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'RentalServiceError';
  }
}

export class RentalService {
  constructor(private repo: RentalsRepository = rentalsRepository) {}

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

    const rawStart = new Date(startDateStr);
    const start = isNaN(rawStart.getTime()) ? new Date(now) : new Date(rawStart);
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
        console.warn('Midtrans status check warning:', midtransErr);
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const tenant = await this.repo.findUserById(tenantId, connection, true);
      if (!tenant) {
        await connection.rollback();
        throw new RentalServiceError(404, 'Pengguna tidak ditemukan.');
      }

      const property = await this.repo.findPropertyById(propertyId, connection, true);
      if (!property) {
        await connection.rollback();
        throw new RentalServiceError(404, 'Properti tidak ditemukan.');
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

      if (property.occupiedRooms >= property.totalRooms) {
        await connection.rollback();
        throw new RentalServiceError(400, 'Kamar kos sudah penuh.');
      }

      let assignedRoom: RoomRow | undefined;
      const targetRoomId = roomId || existingRental?.roomId;
      if (targetRoomId) {
        assignedRoom = await this.repo.findRoomById(targetRoomId, propertyId, connection, true);
        if (!assignedRoom) {
          await connection.rollback();
          throw new RentalServiceError(404, 'Kamar tidak ditemukan pada properti ini.');
        }
        if (assignedRoom.status !== 'available') {
          await connection.rollback();
          throw new RentalServiceError(409, 'Kamar yang Anda pilih sudah tidak tersedia.');
        }
      } else {
        const availableRoom = await this.repo.findAvailableRoom(propertyId, connection, true);
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
      const effectivePrice =
        assignedRoom && typeof assignedRoom.price === 'number' && assignedRoom.price > 0
          ? Number(assignedRoom.price)
          : Number(price || property.price || 0);

      const addedRevenue = effectivePrice * duration;
      const startDateStr = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      const resolvedPropertyName = propertyName || property.name || 'Kos KOSMO';
      const documentUrl = `/uploads/rental_contract_${rentalId}.pdf`;

      if (assignedRoom) {
        await this.repo.setRoomStatus(assignedRoom.id, 'occupied', connection);
      }
      await this.repo.incrementPropertyOccupied(propertyId, connection);

      if (property.ownerId) {
        await this.repo.creditLandlordBalance(property.ownerId, addedRevenue, connection);
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

      if (assignedRoom) {
        try {
          await syncPropertyRoomCounts(connection, propertyId);
        } catch {
          // Non-blocking sync
        }
      }

      return {
        message: 'Penyewaan kos berhasil dibuat!',
        rentalId,
        document: documentUrl,
        roomId: assignedRoom ? assignedRoom.id : null,
        roomNumber: assignedRoom ? assignedRoom.roomNumber : null
      };
    } catch (err) {
      await connection.rollback();
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

      return { message: 'Sewa kos berhasil diberhentikan.' };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

export const rentalService = new RentalService();
