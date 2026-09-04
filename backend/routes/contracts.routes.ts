import type { Request, Response, Router } from 'express';
import { pool } from '../db';
import { apiCache } from '../services/cache';
import { authenticateToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  previewContractSchema,
  signContractSchema,
  validateBody
} from '../middleware/validation';
import type { PropertyRow } from '../services/transformers';
import {
  generateRentalContractBuffer,
  computeContractHash,
  generateAndUploadContract,
  sanitizeRentalId
} from '../services/contract';
import type { RentalContractData, RentalContractJoinedRow } from '../types/index';
import { isUserProfileComplete } from '../types/index';
import { generateId } from '../utils/id';
import type { UserRow } from './auth.routes';
import type { RentalRow } from './rentals.routes';

export function registerContractRoutes(router: Router): void {
  // Digital Rental Contract Preview Generator
  router.post(
    '/rentals/contract/preview',
    authenticateToken,
    validateBody(previewContractSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: 'Akses ditolak. Token otentikasi diperlukan.' });
      }

      const {
        propertyId,
        durationMonths,
        startDate,
        tenantNikPassport,
        signatureBase64,
        rentalId: customRentalId
      } = req.body;

      try {
        const [propRows] = await pool.query<PropertyRow[]>(
          'SELECT id, name, address, price, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ?',
          [propertyId]
        );
        const property = propRows[0];
        if (!property) {
          return res.status(404).json({ success: false, message: 'Properti tidak ditemukan.' });
        }

        const [userRows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [authUser.id]);
        const tenant = userRows[0];

        let landlord: UserRow | undefined;
        if (property.ownerId) {
          const [landlordRows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [property.ownerId]);
          landlord = landlordRows[0];
        }

        const signerIp =
          (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
          req.ip ||
          req.socket.remoteAddress ||
          '127.0.0.1';
        const signerUserAgent = (req.headers['user-agent'] as string) || 'Mozilla/5.0 (KOSMO Secure Client)';
        const signedAtDate = new Date();
        const signedAtIso = signedAtDate.toISOString();
        const duration = Number(durationMonths) || 1;
        const monthlyPrice = Number(property.price) || 0;
        const adminFee = 5000;
        const totalPrice = (monthlyPrice * duration) + adminFee;
        const startDateStr =
          startDate ||
          signedAtIso.split('T')[0];
        const rentalId =
          customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== ''
            ? customRentalId.trim()
            : 'preview-draft';

        const contractData: RentalContractData = {
          rentalId,
          propertyName: property.name,
          propertyAddress: property.address || 'Kabupaten Badung / Kota Denpasar, Bali, Indonesia',
          landlordName: landlord ? landlord.name : 'PT KOSMO Bali Hospitality / Pengelola Properti',
          landlordEmail: landlord ? landlord.email : 'hospitality@kosmo.id',
          landlordPhone: landlord ? landlord.phone : '+62 361-900-5676',
          tenantName: tenant ? tenant.name : authUser.email,
          tenantEmail: tenant ? tenant.email : authUser.email,
          tenantPhone: tenant ? (tenant.phone || '') : '',
          tenantNikPassport: tenantNikPassport || (tenant ? tenant.identity_number : '') || '-',
          tenantAddress: tenant ? (tenant.address || '') : '',
          tenantOccupation: tenant ? (tenant.occupation || '') : '',
          emergencyContactName: tenant ? (tenant.emergency_contact_name || '') : '',
          emergencyContactPhone: tenant ? (tenant.emergency_contact_phone || '') : '',
          emergencyContactRelation: tenant ? (tenant.emergency_contact_relation || '') : '',
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
        const profileStatus = tenant ? isUserProfileComplete(tenant) : { complete: false, missingFields: ['user'], missingFieldLabels: ['Data Pengguna'] };

        return res.status(200).json({
          success: true,
          contractData,
          contractHash,
          monthlyPrice,
          adminFee,
          totalPrice,
          totalAmount: totalPrice,
          isProfileComplete: profileStatus.complete,
          missingProfileFields: profileStatus.missingFields,
          missingProfileFieldLabels: profileStatus.missingFieldLabels
        });
      } catch (err: unknown) {
        console.error('Contract preview error:', err);
        return res.status(500).json({ success: false, message: 'Gagal membuat pratinjau kontrak digital.' });
      }
    }
  );

  // Digital Rental Contract Transactional Signing
  router.post(
    '/rentals/contract/sign',
    authenticateToken,
    validateBody(signContractSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: 'Akses ditolak. Token otentikasi diperlukan.' });
      }

      const {
        propertyId,
        durationMonths,
        startDate,
        tenantNikPassport,
        signatureBase64,
        rentalId: customRentalId
      } = req.body;

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // 🛡️ Concurrency Guard 1: Tenant Exclusive Row Lock & Single Active Tenancy Check
        const [userRows] = await connection.query<UserRow[]>('SELECT * FROM users WHERE id = ? FOR UPDATE', [authUser.id]);
        const tenant = userRows[0];
        if (!tenant) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
        }

        // 🛡️ Legal Profile Integrity Gate: Enforce Complete Tenant Identity & KYC (KUHPerdata Art. 1320 & UU ITE)
        const profileCheck = isUserProfileComplete(tenant);
        if (!profileCheck.complete) {
          await connection.rollback();
          return res.status(422).json({
            success: false,
            message:
              'Profil identitas hukum penyewa belum lengkap. Berdasarkan Pasal 1320 KUHPerdata & UU ITE, Anda wajib melengkapi data identitas (NIK/Paspor, Alamat Domisili, Pekerjaan, dan Kontak Darurat) pada profil Anda sebelum menyewa kos.',
            missingFields: profileCheck.missingFields,
            missingFieldLabels: profileCheck.missingFieldLabels
          });
        }

        const [activeRentals] = await connection.query<RentalRow[]>(
          "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' FOR UPDATE",
          [authUser.id]
        );
        if (activeRentals.length > 0) {
          await connection.rollback();
          return res.status(409).json({
            success: false,
            message:
              'Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru.'
          });
        }

        // 🛡️ Concurrency Guard 2: Property Room Availability Row Lock
        const [propRows] = await connection.query<PropertyRow[]>(
          'SELECT id, name, address, price, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ? FOR UPDATE',
          [propertyId]
        );
        const property = propRows[0];
        if (!property) {
          await connection.rollback();
          return res.status(404).json({ success: false, message: 'Properti tidak ditemukan.' });
        }

        if (property.occupiedRooms >= property.totalRooms) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Kamar kos sudah penuh.' });
        }

        let landlord: UserRow | undefined;
        if (property.ownerId) {
          const [landlordRows] = await connection.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [property.ownerId]);
          landlord = landlordRows[0];
        }

        // Audit Trail Capture & Timestamps
        const signerIp =
          (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
          req.ip ||
          req.socket.remoteAddress ||
          '127.0.0.1';
        const signerUserAgent = (req.headers['user-agent'] as string) || 'Mozilla/5.0 (KOSMO Secure Client)';
        const signedAtDate = new Date();
        const signedAtIso = signedAtDate.toISOString();
        const duration = Number(durationMonths) || 1;
        const adminFee = 5000.0;
        const rentalPrice = Number(property.price) || 0;
        const totalAmount = (rentalPrice * duration) + adminFee;
        const rentalId =
          customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== ''
            ? customRentalId.trim()
            : generateId('rent');
        const startDateStr =
          startDate ||
          signedAtIso.split('T')[0];

        // Generate in-memory PDF and stream directly to Cloudinary
        const contractData: RentalContractData = {
          rentalId,
          propertyName: property.name,
          propertyAddress: property.address || 'Kabupaten Badung / Kota Denpasar, Bali, Indonesia',
          landlordName: landlord ? landlord.name : 'PT KOSMO Bali Hospitality / Pengelola Properti',
          landlordEmail: landlord ? landlord.email : 'hospitality@kosmo.id',
          landlordPhone: landlord ? landlord.phone : '+62 361-900-5676',
          tenantName: tenant ? tenant.name : authUser.email,
          tenantEmail: tenant ? tenant.email : authUser.email,
          tenantPhone: tenant ? (tenant.phone || '') : '',
          tenantNikPassport: tenantNikPassport || (tenant ? tenant.identity_number : '') || '-',
          tenantAddress: tenant ? (tenant.address || '') : '',
          tenantOccupation: tenant ? (tenant.occupation || '') : '',
          emergencyContactName: tenant ? (tenant.emergency_contact_name || '') : '',
          emergencyContactPhone: tenant ? (tenant.emergency_contact_phone || '') : '',
          emergencyContactRelation: tenant ? (tenant.emergency_contact_relation || '') : '',
          startDate: startDateStr,
          durationMonths: duration,
          monthlyPrice: rentalPrice,
          pricePerMonth: rentalPrice,
          totalPrice: totalAmount,
          adminFee,
          signatureBase64,
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

        const uploadResult = await generateAndUploadContract(contractData);
        const contractUrl = uploadResult.cloudinaryUrl || `/uploads/contract_${sanitizeRentalId(rentalId)}.pdf`;
        const contractHash = uploadResult.contractHash;

        // Atomic Insert with 8 Audit Columns and duration_months (status: pending until payment settlement)
        await connection.query(
          `INSERT INTO rentals (
            id, tenantId, propertyId, propertyName, price, startDate, status,
            document, contract_url, contract_hash, contract_signed_at,
            signer_ip, signer_user_agent, tenant_nik_passport, tenant_signature_data, admin_fee_amount, duration_months
          ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rentalId,
            authUser.id,
            propertyId,
            property.name,
            rentalPrice,
            startDateStr,
            contractUrl,
            contractUrl,
            contractHash,
            signedAtDate,
            signerIp,
            signerUserAgent,
            tenantNikPassport,
            signatureBase64,
            adminFee,
            duration
          ]
        );

        await connection.commit();
        apiCache.invalidatePattern('properties');
        apiCache.invalidatePattern('rentals');

        return res.status(201).json({
          success: true,
          message: 'Kontrak digital berhasil ditandatangani. Silakan selesaikan pembayaran.',
          rentalId,
          contractUrl,
          contractHash,
          adminFee,
          totalAmount,
          signedAt: signedAtIso
        });
      } catch (err: unknown) {
        await connection.rollback();
        console.error('Contract sign error:', err);
        return res.status(500).json({ success: false, message: 'Gagal memproses penandatanganan kontrak digital.' });
      } finally {
        connection.release();
      }
    }
  );

  router.get(
    '/rentals/:id/contract',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const authUser = req.user;

      if (!authUser) {
        return res.status(401).json({ message: 'Akses ditolak. Token otentikasi diperlukan.' });
      }

      try {
        const [rows] = await pool.query<RentalContractJoinedRow[]>(
          `SELECT 
            r.id AS rental_id,
            r.tenantId AS rental_tenant_id,
            r.propertyId AS rental_property_id,
            r.propertyName AS rental_property_name,
            r.price AS rental_price,
            r.startDate AS rental_start_date,
            r.status AS rental_status,
            r.document AS rental_document,
            r.contract_url,
            r.contract_hash,
            r.contract_signed_at,
            r.signer_ip,
            r.signer_user_agent,
            r.tenant_nik_passport,
            r.tenant_signature_data,
            r.admin_fee_amount,
            r.duration_months,
            p.name AS property_name,
            p.address AS property_address,
            p.price AS property_price,
            p.ownerId AS property_owner_id,
            u.name AS tenant_name,
            u.email AS tenant_email,
            u.phone AS tenant_phone,
            u.address AS tenant_address,
            u.occupation AS tenant_occupation,
            u.emergency_contact_name AS tenant_emergency_contact_name,
            u.emergency_contact_phone AS tenant_emergency_contact_phone,
            u.emergency_contact_relation AS tenant_emergency_contact_relation,
            l.name AS landlord_name,
            l.email AS landlord_email,
            l.phone AS landlord_phone
          FROM rentals r
          LEFT JOIN properties p ON r.propertyId = p.id
          LEFT JOIN users u ON r.tenantId = u.id
          LEFT JOIN users l ON p.ownerId = l.id
          WHERE r.id = ?`,
          [id]
        );

        const rental = rows[0];
        if (!rental) {
          return res.status(404).json({ message: 'Data sewa tidak ditemukan.' });
        }

        // RBAC Gate: Tenant, Property Landlord/Owner, or Admin
        const isTenant = authUser.id === rental.rental_tenant_id;
        const isOwner = Boolean(rental.property_owner_id && authUser.id === rental.property_owner_id);
        const isAdmin = authUser.role === 'admin';

        if (!isTenant && !isOwner && !isAdmin) {
          return res.status(403).json({ message: 'Akses ditolak ke dokumen kontrak ini.' });
        }

        const contractDuration = Number(rental.duration_months || 1);
        const contractMonthlyPrice = Number(rental.rental_price || rental.property_price || 0);
        const contractAdminFee =
          rental.admin_fee_amount !== undefined && rental.admin_fee_amount !== null
            ? Number(rental.admin_fee_amount)
            : 5000;
        const contractTotalPrice = (contractMonthlyPrice * contractDuration) + contractAdminFee;

        // Prepare contract data model with complete audit trail
        const contractData: RentalContractData = {
          rentalId: rental.rental_id,
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

        const isDownload = req.query.download === 'true' || req.query.download === '1';
        const dispositionType = isDownload ? 'attachment' : 'inline';

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${dispositionType}; filename="kontrak_sewa_${safeId}.pdf"`);
        res.setHeader('X-Contract-Hash', contractHash);
        res.setHeader('Content-Length', pdfBuffer.length.toString());
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');

        res.end(pdfBuffer);
      } catch (err: unknown) {
        console.error('Get contract PDF error:', err);
        res.status(500).json({ message: 'Gagal membuat dokumen kontrak PDF.' });
      }
    }
  );
}
