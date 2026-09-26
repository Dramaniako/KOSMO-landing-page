import { pool } from '../db';
import { apiCache } from './cache';
import {
  generateRentalContractBuffer,
  computeContractHash,
  generateAndUploadContract,
  sanitizeRentalId
} from './contract';
import {
  ContractsRepository,
  contractsRepository
} from '../repositories/contracts.repository';
import type { RentalContractData, RoomRow } from '../types/index';
import { isUserProfileComplete } from '../types/index';
import { generateId } from '../utils/id';
import type { JWTPayload } from '../middleware/auth';

export interface ContractPreviewInput {
  authUser: JWTPayload;
  propertyId: string;
  durationMonths?: number | string;
  startDate?: string;
  roomId?: string;
  tenantNikPassport?: string;
  signatureBase64?: string;
  rentalId?: string;
  signerIp: string;
  signerUserAgent: string;
}

export interface ContractSignInput {
  authUser: JWTPayload;
  propertyId: string;
  durationMonths?: number | string;
  startDate?: string;
  roomId?: string;
  tenantNikPassport?: string;
  signatureBase64: string;
  rentalId?: string;
  signerIp: string;
  signerUserAgent: string;
}

export class ContractServiceError extends Error {
  constructor(public statusCode: number, message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'ContractServiceError';
  }
}

export class ContractService {
  constructor(private repo: ContractsRepository = contractsRepository) {}

  async generatePreview(input: ContractPreviewInput) {
    const {
      authUser,
      propertyId,
      durationMonths,
      startDate,
      roomId,
      tenantNikPassport,
      signatureBase64,
      rentalId: customRentalId,
      signerIp,
      signerUserAgent
    } = input;

    const property = await this.repo.findPropertyById(propertyId);
    if (!property) {
      throw new ContractServiceError(404, 'Properti tidak ditemukan.');
    }

    let room: RoomRow | undefined;
    if (roomId && typeof roomId === 'string' && roomId.trim() !== '') {
      room = await this.repo.findRoomById(roomId.trim(), propertyId);
      if (!room) {
        throw new ContractServiceError(404, 'Kamar tidak ditemukan pada properti ini.');
      }
    }

    const tenant = await this.repo.findUserById(authUser.id);
    let landlord = property.ownerId ? await this.repo.findUserById(property.ownerId) : undefined;

    const signedAtDate = new Date();
    const signedAtIso = signedAtDate.toISOString();
    const duration = Number(durationMonths) || 1;
    const monthlyPrice =
      room && typeof room.price === 'number' && room.price > 0
        ? Number(room.price)
        : Number(property.price) || 0;
    const adminFee = 5000;
    const totalPrice = monthlyPrice * duration + adminFee;
    const startDateStr = startDate || signedAtIso.split('T')[0];
    const rentalId =
      customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== ''
        ? customRentalId.trim()
        : 'preview-draft';

    const contractData: RentalContractData = {
      rentalId,
      roomId: room ? room.id : undefined,
      roomNumber: room ? room.roomNumber : undefined,
      propertyName: property.name,
      propertyAddress: property.address || 'Kabupaten Badung / Kota Denpasar, Bali, Indonesia',
      landlordName: landlord ? landlord.name : 'PT KOSMO Bali Hospitality / Pengelola Properti',
      landlordEmail: landlord ? landlord.email : 'hospitality@kosmo.id',
      landlordPhone: landlord ? landlord.phone : '+62 361-900-5676',
      tenantName: tenant ? tenant.name : authUser.email,
      tenantEmail: tenant ? tenant.email : authUser.email,
      tenantPhone: tenant ? tenant.phone || '' : '',
      tenantNikPassport: tenantNikPassport || (tenant ? tenant.identity_number : '') || '-',
      tenantAddress: tenant ? tenant.address || '' : '',
      tenantOccupation: tenant ? tenant.occupation || '' : '',
      emergencyContactName: tenant ? tenant.emergency_contact_name || '' : '',
      emergencyContactPhone: tenant ? tenant.emergency_contact_phone || '' : '',
      emergencyContactRelation: tenant ? tenant.emergency_contact_relation || '' : '',
      startDate: startDateStr,
      durationMonths: duration,
      monthlyPrice,
      pricePerMonth: monthlyPrice,
      totalPrice,
      adminFee,
      signatureBase64: signatureBase64 || undefined,
      signerIp,
      signerUserAgent,
      signedAt: signedAtIso,
      utilityQuotas: {
        electricityKwh: 200,
        water: 'PDAM & Deep Well (Air Bersih Terfilter) Included',
        wifiMbps: 100,
        security: '24/7 CCTV & Security Access',
        waste: 'Daily Waste Management Included'
      }
    };

    const pdfBuffer = await generateRentalContractBuffer(contractData);
    const contractHash = computeContractHash(pdfBuffer);
    const profileStatus = tenant
      ? isUserProfileComplete(tenant)
      : { complete: false, missingFields: ['user'], missingFieldLabels: ['Data Pengguna'] };

    return {
      success: true,
      contractData,
      contractHash,
      monthlyPrice,
      adminFee,
      totalPrice,
      totalAmount: totalPrice,
      room: room
        ? {
            id: room.id,
            roomNumber: room.roomNumber,
            floor: room.floor,
            type: room.type,
            price: room.price,
            effectivePrice: monthlyPrice,
            status: room.status
          }
        : null,
      isProfileComplete: profileStatus.complete,
      missingProfileFields: profileStatus.missingFields,
      missingProfileFieldLabels: profileStatus.missingFieldLabels
    };
  }

  async signContract(input: ContractSignInput) {
    const {
      authUser,
      propertyId,
      durationMonths,
      startDate,
      roomId,
      tenantNikPassport,
      signatureBase64,
      rentalId: customRentalId,
      signerIp,
      signerUserAgent
    } = input;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Guard 1: Tenant row lock & single active tenancy check
      const tenant = await this.repo.findUserById(authUser.id, connection, true);
      if (!tenant) {
        await connection.rollback();
        throw new ContractServiceError(404, 'Pengguna tidak ditemukan.');
      }

      const profileCheck = isUserProfileComplete(tenant);
      if (!profileCheck.complete) {
        await connection.rollback();
        throw new ContractServiceError(
          422,
          'Profil identitas hukum penyewa belum lengkap. Berdasarkan Pasal 1320 KUHPerdata & UU ITE, Anda wajib melengkapi data identitas (NIK/Paspor, Alamat Domisili, Pekerjaan, dan Kontak Darurat) pada profil Anda sebelum menyewa kos.',
          {
            missingFields: profileCheck.missingFields,
            missingFieldLabels: profileCheck.missingFieldLabels
          }
        );
      }

      const activeRentals = await this.repo.findActiveRentalsByTenantId(authUser.id, connection, true);
      if (activeRentals.length > 0) {
        await connection.rollback();
        throw new ContractServiceError(
          409,
          'Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru.'
        );
      }

      // Guard 2: Property availability row lock
      const property = await this.repo.findPropertyById(propertyId, connection, true);
      if (!property) {
        await connection.rollback();
        throw new ContractServiceError(404, 'Properti tidak ditemukan.');
      }

      if (property.occupiedRooms >= property.totalRooms) {
        await connection.rollback();
        throw new ContractServiceError(400, 'Kamar kos sudah penuh.');
      }

      // Guard 3: Discrete room selection & row lock
      let selectedRoom: RoomRow | undefined;
      if (roomId && typeof roomId === 'string' && roomId.trim() !== '') {
        selectedRoom = await this.repo.findRoomById(roomId.trim(), propertyId, connection, true);
        if (!selectedRoom) {
          await connection.rollback();
          throw new ContractServiceError(404, 'Kamar tidak ditemukan pada properti ini.');
        }
        if (selectedRoom.status !== 'available') {
          await connection.rollback();
          throw new ContractServiceError(409, 'Kamar yang Anda pilih sudah tidak tersedia.');
        }
      } else {
        const availableRoom = await this.repo.findAvailableRoom(propertyId, connection, true);
        if (availableRoom) {
          selectedRoom = availableRoom;
        } else {
          const discreteCount = await this.repo.countRoomsByPropertyId(propertyId, connection);
          if (discreteCount > 0) {
            await connection.rollback();
            throw new ContractServiceError(409, 'Kamar yang Anda pilih sudah tidak tersedia.');
          }
        }
      }

      let landlord = property.ownerId
        ? await this.repo.findUserById(property.ownerId, connection)
        : undefined;

      const signedAtDate = new Date();
      const signedAtIso = signedAtDate.toISOString();
      const duration = Number(durationMonths) || 1;
      const rentalPrice =
        selectedRoom && typeof selectedRoom.price === 'number' && selectedRoom.price > 0
          ? Number(selectedRoom.price)
          : Number(property.price) || 0;
      const adminFee = 5000;
      const totalAmount = rentalPrice * duration + adminFee;
      const startDateStr = startDate || signedAtIso.split('T')[0];
      const rentalId =
        customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== ''
          ? customRentalId.trim()
          : generateId('rent');

      const contractData: RentalContractData = {
        rentalId,
        roomId: selectedRoom ? selectedRoom.id : undefined,
        roomNumber: selectedRoom ? selectedRoom.roomNumber : undefined,
        propertyName: property.name,
        propertyAddress: property.address || 'Kabupaten Badung / Kota Denpasar, Bali, Indonesia',
        landlordName: landlord ? landlord.name : 'PT KOSMO Bali Hospitality / Pengelola Properti',
        landlordEmail: landlord ? landlord.email : 'hospitality@kosmo.id',
        landlordPhone: landlord ? landlord.phone : '+62 361-900-5676',
        tenantName: tenant.name,
        tenantEmail: tenant.email,
        tenantPhone: tenant.phone || '',
        tenantNikPassport: tenantNikPassport || tenant.identity_number || '-',
        tenantAddress: tenant.address || '',
        tenantOccupation: tenant.occupation || '',
        emergencyContactName: tenant.emergency_contact_name || '',
        emergencyContactPhone: tenant.emergency_contact_phone || '',
        emergencyContactRelation: tenant.emergency_contact_relation || '',
        startDate: startDateStr,
        durationMonths: duration,
        monthlyPrice: rentalPrice,
        pricePerMonth: rentalPrice,
        totalPrice: totalAmount,
        adminFee,
        signatureBase64,
        signerIp,
        signerUserAgent,
        signedAt: signedAtDate,
        utilityQuotas: {
          electricityKwh: 200,
          water: 'PDAM & Deep Well (Air Bersih Terfilter) Included',
          wifiMbps: 100,
          security: '24/7 CCTV & Security Access',
          waste: 'Daily Waste Management Included'
        }
      };

      const uploadResult = await generateAndUploadContract(contractData);
      const contractUrl =
        uploadResult.cloudinaryUrl || `/uploads/contract_${sanitizeRentalId(rentalId)}.pdf`;
      const contractHash = uploadResult.contractHash;

      await this.repo.insertContractRental(
        {
          rentalId,
          tenantId: authUser.id,
          propertyId,
          roomId: selectedRoom ? selectedRoom.id : null,
          propertyName: property.name,
          rentalPrice,
          startDateStr,
          contractUrl,
          contractHash,
          signedAtDate,
          signerIp,
          signerUserAgent,
          tenantNikPassport: tenantNikPassport || tenant.identity_number || '-',
          signatureBase64,
          adminFee,
          duration
        },
        connection
      );

      await connection.commit();
      apiCache.invalidatePattern('properties');
      apiCache.invalidatePattern('rentals');

      return {
        success: true,
        message: 'Kontrak digital berhasil ditandatangani. Silakan selesaikan pembayaran.',
        rentalId,
        roomId: selectedRoom ? selectedRoom.id : null,
        roomNumber: selectedRoom ? selectedRoom.roomNumber : null,
        contractUrl,
        contractHash,
        adminFee,
        totalAmount,
        signedAt: signedAtIso
      };
    } catch (err: unknown) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async getContractPdf(rentalId: string, authUser: JWTPayload) {
    const rental = await this.repo.findRentalContractJoinedById(rentalId);
    if (!rental) {
      throw new ContractServiceError(404, 'Data sewa tidak ditemukan.');
    }

    const isTenant = authUser.id === rental.rental_tenant_id;
    const isOwner = Boolean(rental.property_owner_id && authUser.id === rental.property_owner_id);
    const isAdmin = authUser.role === 'admin';

    if (!isTenant && !isOwner && !isAdmin) {
      throw new ContractServiceError(403, 'Akses ditolak ke dokumen kontrak ini.');
    }

    const contractDuration = Number(rental.duration_months || 1);
    const contractMonthlyPrice = Number(rental.rental_price || rental.property_price || 0);
    const contractAdminFee =
      rental.admin_fee_amount !== undefined && rental.admin_fee_amount !== null
        ? Number(rental.admin_fee_amount)
        : 5000;
    const contractTotalPrice = contractMonthlyPrice * contractDuration + contractAdminFee;

    const contractData: RentalContractData = {
      rentalId: rental.rental_id,
      roomId: rental.rental_room_id || undefined,
      roomNumber: rental.room_number || undefined,
      propertyName: rental.rental_property_name || rental.property_name || 'Unit KOSMO Bali',
      propertyAddress: rental.property_address || 'Kabupaten Badung / Kota Denpasar, Bali, Indonesia',
      landlordName: rental.landlord_name || 'PT KOSMO Bali Hospitality / Pengelola Properti',
      landlordEmail: rental.landlord_email || 'hospitality@kosmo.id',
      landlordPhone: rental.landlord_phone || '+62 361-900-5676',
      tenantName: rental.tenant_name || 'Penyewa KOSMO',
      tenantEmail: rental.tenant_email || '',
      tenantPhone: rental.tenant_phone || '',
      tenantNikPassport: rental.tenant_nik_passport || '-',
      tenantAddress: rental.tenant_address || '',
      tenantOccupation: rental.tenant_occupation || '',
      emergencyContactName: rental.tenant_emergency_contact_name || '',
      emergencyContactPhone: rental.tenant_emergency_contact_phone || '',
      emergencyContactRelation: rental.tenant_emergency_contact_relation || '',
      startDate:
        rental.rental_start_date ||
        new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
      durationMonths: contractDuration,
      monthlyPrice: contractMonthlyPrice,
      pricePerMonth: contractMonthlyPrice,
      totalPrice: contractTotalPrice,
      adminFee: contractAdminFee,
      signatureBase64: rental.tenant_signature_data || undefined,
      signerIp: rental.signer_ip || undefined,
      signerUserAgent: rental.signer_user_agent || undefined,
      signedAt: rental.contract_signed_at ? new Date(rental.contract_signed_at).toISOString() : undefined,
      utilityQuotas: {
        electricityKwh: 200,
        water: 'PDAM & Deep Well (Air Bersih Terfilter) Included',
        wifiMbps: 100,
        security: '24/7 CCTV & Security Access',
        waste: 'Daily Waste Management Included'
      }
    };

    const pdfBuffer = await generateRentalContractBuffer(contractData);
    const computedHash = computeContractHash(pdfBuffer);
    const contractHash = rental.contract_hash || computedHash;
    const safeId = sanitizeRentalId(rental.rental_id);

    return {
      pdfBuffer,
      contractHash,
      safeId
    };
  }
}

export const contractService = new ContractService();
