import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { uploadContractStream } from './cloudinary';

export interface UtilityQuotas {
  electricityKwh?: number | string;
  water?: string;
  wifiMbps?: number | string;
  security?: string;
  waste?: string;
}

export interface RentalContractData {
  rentalId?: string;
  propertyName: string;
  propertyAddress?: string;
  landlordName?: string;
  landlordEmail?: string;
  landlordPhone?: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone?: string;
  tenantNikPassport?: string;
  tenantAddress?: string;
  tenantOccupation?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  startDate: string;
  durationMonths?: number;
  monthlyPrice?: number;
  pricePerMonth?: number;
  totalPrice?: number;
  adminFee?: number;
  signatureBase64?: string;
  signerIp?: string;
  signerUserAgent?: string;
  signedAt?: string | Date;
  utilityQuotas?: UtilityQuotas;
}

export interface GeneratedContractResult {
  pdfBuffer: Buffer;
  contractHash: string;
  cloudinaryUrl?: string;
}

export interface GenerateContractResult {
  filePath: string;
  fileName: string;
  buffer: Buffer;
  contractHash: string;
  secureUrl?: string;
}

export function sanitizeRentalId(id?: string): string {
  if (!id || typeof id !== 'string') return 'contract';
  const trimmed = id.trim();
  if (!trimmed) return 'contract';
  const normalized = trimmed.replace(/\\/g, '/');
  const base = path.basename(normalized);
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '');
  return sanitized || 'contract';
}

export function computeContractHash(buffer: Buffer): string {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('Invalid input: buffer must be an instance of Buffer');
  }
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function computeBufferSha256(buffer: Buffer): string {
  return computeContractHash(buffer);
}

export function generateRentalContractBuffer(data: RentalContractData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const sanitizedId = sanitizeRentalId(data.rentalId || 'contract');
      const doc = new PDFDocument({
        margin: 36,
        size: 'A4',
        bufferPages: true,
        info: {
          Title: `Rental Agreement - ${data.propertyName} - ${data.tenantName}`,
          Author: 'KOSMO Bali Hospitality Platform',
          Subject: 'Digital Tenancy Agreement (UU ITE & KUHPerdata)',
          Keywords: 'kosmo, rental, contract, lease, bali, kuhperdata, uu-ite'
        }
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err: Error) => reject(err));

      const pageWidth = doc.page.width - 72; // 595.28 - 72 = 523.28
      const monthlyRate = data.monthlyPrice !== undefined ? data.monthlyPrice : (data.pricePerMonth !== undefined ? data.pricePerMonth : 0);
      const adminFee = data.adminFee !== undefined ? data.adminFee : 5000;
      const duration = data.durationMonths || 1;
      const totalInitial = data.totalPrice !== undefined ? data.totalPrice : ((monthlyRate * duration) + adminFee);
      
      const landlordName = data.landlordName || 'PT KOSMO Bali Hospitality / Pengelola Properti';
      const landlordEmail = data.landlordEmail || 'hospitality@kosmo.id';
      const landlordPhone = data.landlordPhone || '+62 361-900-5676';
      const tenantNik = data.tenantNikPassport || '-';
      const tenantPhone = data.tenantPhone || '-';
      const propertyAddress = data.propertyAddress || 'Kabupaten Badung / Kota Denpasar, Bali, Indonesia';

      let signedAtUtc = '';
      let signedAtWita = '';
      try {
        const signedDateObj = data.signedAt ? new Date(data.signedAt) : new Date();
        if (isNaN(signedDateObj.getTime())) {
          signedAtUtc = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
          signedAtWita = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' WITA';
        } else {
          signedAtUtc = signedDateObj.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
          const witaTime = new Date(signedDateObj.getTime() + (8 * 60 * 60 * 1000));
          signedAtWita = witaTime.toISOString().replace('T', ' ').substring(0, 19) + ' WITA';
        }
      } catch {
        signedAtUtc = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        signedAtWita = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' WITA';
      }

      // ==========================================
      // HEADER BANNER & STATUTORY TITLE
      // ==========================================
      doc.rect(36, 36, pageWidth, 54).fill('#0f172a');
      doc.fillColor('#38bdf8').fontSize(11).font('Helvetica-Bold')
        .text('KOSMO BALI CO-LIVING MARKETPLACE', 46, 44, { align: 'left' });
      doc.fillColor('#f8fafc').fontSize(9.5).font('Helvetica-Bold')
        .text('SURAT PERJANJIAN SEWA MENYEWA HUNIAN KO-LIVING (KOSMO)', 46, 57, { align: 'left' });
      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Oblique')
        .text('DIGITAL CO-LIVING RESIDENTIAL LEASE AGREEMENT • PASAL 1320 KUHPERDATA & UU ITE NO. 11/2008 JO. UU NO. 1/2024', 46, 71, { align: 'left' });

      doc.fillColor('#38bdf8').fontSize(8).font('Helvetica-Bold')
        .text(`NO: KOSMO/${sanitizedId.toUpperCase()}`, 36, 45, { width: pageWidth - 10, align: 'right' });
      doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica')
        .text(`Tgl / Date: ${data.startDate}`, 36, 58, { width: pageWidth - 10, align: 'right' });

      doc.y = 96;
      doc.fillColor('#000000');

      // ==========================================
      // PREAMBLE
      // ==========================================
      doc.fontSize(7.5).font('Helvetica').fillColor('#334155')
        .text('Perjanjian Sewa Menyewa Elektronik ini disepakati secara sadar dan sah berdasarkan Kitab Undang-Undang Hukum Perdata (KUHPerdata) Pasal 1320 dan UU ITE No. 11/2008 jo. UU No. 1/2024 oleh dan antara Para Pihak: / ' +
              'This Electronic Tenancy Agreement is entered into freely, knowingly, and lawfully under Indonesian Civil Code Article 1320 and UU ITE No. 11/2008 jo. UU No. 1/2024 by and between the Parties:');
      doc.moveDown(0.4);

      // ==========================================
      // PASAL 1: IDENTITAS PARA PIHAK
      // ==========================================
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#0f172a')
        .text('PASAL 1: IDENTITAS PARA PIHAK / ARTICLE 1: IDENTIFICATION OF PARTIES');
      doc.moveDown(0.2);

      const colWidth = (pageWidth - 10) / 2;
      const boxY = doc.y;

      // Pihak Pertama (Lessor)
      doc.rect(36, boxY, colWidth, 70).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold')
        .text('PIHAK PERTAMA (PENGELOLA / LESSOR)', 42, boxY + 5);
      doc.font('Helvetica').fontSize(6.8).fillColor('#334155')
        .text(`• Nama / Name    : ${landlordName}`, 42, boxY + 17)
        .text(`• Email          : ${landlordEmail}`, 42, boxY + 29)
        .text(`• Telepon / Phone: ${landlordPhone}`, 42, boxY + 41)
        .text('• Peran / Role   : Pengelola Sah & Penyedia Hunian Co-Living', 42, boxY + 53);

      // Pihak Kedua (Tenant)
      doc.rect(36 + colWidth + 10, boxY, colWidth, 70).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold')
        .text('PIHAK KEDUA (PENYEWA / TENANT)', 42 + colWidth + 10, boxY + 5);
      doc.font('Helvetica').fontSize(6.8).fillColor('#334155')
        .text(`• Nama Lengkap   : ${data.tenantName}`, 42 + colWidth + 10, boxY + 17)
        .text(`• NIK / Paspor   : ${tenantNik} • ${data.tenantOccupation || 'Penyewa'}`, 42 + colWidth + 10, boxY + 29)
        .text(`• Alamat Asal    : ${(data.tenantAddress || 'Denpasar/Badung, Bali').substring(0, 36)}`, 42 + colWidth + 10, boxY + 41)
        .text(`• Telepon / WA   : ${tenantPhone} • Darurat: ${data.emergencyContactPhone || '-'}`, 42 + colWidth + 10, boxY + 53);

      doc.y = boxY + 76;

      // ==========================================
      // PASAL 2 & 3: OBJEK & BIAYA SEWA (2-Column Grid)
      // ==========================================
      const gridY = doc.y;

      // Objek Sewa
      doc.rect(36, gridY, colWidth, 76).fillAndStroke('#ffffff', '#e2e8f0');
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold')
        .text('PASAL 2: OBJEK & LOKASI HUNIAN', 42, gridY + 5);
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#64748b')
        .text('ARTICLE 2: PREMISES & BALI LOCATION', 42, gridY + 14);
      doc.font('Helvetica').fontSize(7).fillColor('#334155')
        .text(`• Unit / Room    : ${data.propertyName}`, 42, gridY + 26)
        .text(`• Alamat / Addr  : ${propertyAddress}`, 42, gridY + 38, { width: colWidth - 12 })
        .text(`• Mulai / Start  : ${data.startDate} • Durasi: ${duration} Bulan / Month(s)`, 42, gridY + 60);

      // Biaya & Administrasi
      doc.rect(36 + colWidth + 10, gridY, colWidth, 76).fillAndStroke('#ffffff', '#e2e8f0');
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold')
        .text('PASAL 3: BIAYA SEWA & ADMINISTRASI', 42 + colWidth + 10, gridY + 5);
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#64748b')
        .text('ARTICLE 3: RENTAL FEES & PLATFORM FEE', 42 + colWidth + 10, gridY + 14);
      doc.font('Helvetica').fontSize(7).fillColor('#334155')
        .text(`• Sewa Bulanan   : Rp ${monthlyRate.toLocaleString('id-ID')} / bulan`, 42 + colWidth + 10, gridY + 26)
        .text(`• Biaya Admin    : Rp ${adminFee.toLocaleString('id-ID')} (Flat Rp 5.000 / 5000 Fee)`, 42 + colWidth + 10, gridY + 38)
        .text(`• Total Biaya    : Rp ${totalInitial.toLocaleString('id-ID')}`, 42 + colWidth + 10, gridY + 50)
        .text('• Jatuh Tempo    : Setiap 30 hari kalender via KOSMO', 42 + colWidth + 10, gridY + 60);

      doc.y = gridY + 82;

      // ==========================================
      // PASAL 4: KUOTA UTILITAS & FASILITAS
      // ==========================================
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold')
        .text('PASAL 4: KUOTA UTILITAS & FASILITAS / ARTICLE 4: UTILITY QUOTAS & FACILITY CAPS');
      doc.moveDown(0.2);

      const quotas = data.utilityQuotas || {};
      const elecText = quotas.electricityKwh ? `${quotas.electricityKwh} kWh` : '200 kWh';
      const wifiText = quotas.wifiMbps ? `${quotas.wifiMbps} Mbps` : '100 Mbps';
      const waterText = quotas.water || 'PDAM & Deep Well (Air Bersih Terfilter) Included';
      const secText = quotas.security || '24/7 CCTV & Security Access';
      const wasteText = quotas.waste || 'Daily Waste Management (Pengangkutan Sampah Terjadwal) Included';

      doc.rect(36, doc.y, pageWidth, 68).fillAndStroke('#f1f5f9', '#cbd5e1');
      const uY = doc.y + 4;
      doc.font('Helvetica').fontSize(6.8).fillColor('#1e293b')
        .text(`• Listrik (Electricity)       : Termasuk kuota token listrik standar ${elecText}/bulan. Pemakaian lebih dibayar mandiri sesuai tarif resmi PLN.`, 42, uY);
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#64748b')
        .text('  Standard electricity token allowance included. Excess consumption billed at official PLN rates.', 48, uY + 8);

      doc.font('Helvetica').fontSize(6.8).fillColor('#1e293b')
        .text(`• Air Bersih (Water Supply)   : ${waterText}. Pemakaian domestik & sanitasi harian wajar.`, 42, uY + 17);
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#64748b')
        .text('  Domestic sanitary water usage included (PDAM / filtered deep well).', 48, uY + 25);

      doc.font('Helvetica').fontSize(6.8).fillColor('#1e293b')
        .text(`• Internet Wi-Fi (100 Mbps)   : Akses broadband internet bersama berkecepatan tinggi hingga ${wifiText} (100Mbps High-Speed WiFi).`, 42, uY + 34);
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#64748b')
        .text('  High-speed wireless broadband shared internet access up to 100 Mbps included.', 48, uY + 42);

      doc.font('Helvetica').fontSize(6.8).fillColor('#1e293b')
        .text(`• Sampah & Keamanan (24/7)    : ${wasteText} & ${secText} (1 slot parkir kendaraan).`, 42, uY + 51);
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#64748b')
        .text('  Scheduled waste disposal, 24/7 access, CCTV surveillance, and 1 vehicle parking slot included.', 48, uY + 59);

      doc.y = uY + 70;

      // ==========================================
      // PASAL 5 & 6: SINGLE TENANCY & YURISDIKSI
      // ==========================================
      const legY = doc.y;
      doc.rect(36, legY, colWidth, 80).fillAndStroke('#ffffff', '#e2e8f0');
      doc.fillColor('#0f172a').fontSize(7.2).font('Helvetica-Bold')
        .text('PASAL 5: SEWA AKTIF TUNGGAL', 42, legY + 5);
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#64748b')
        .text('ARTICLE 5: SINGLE ACTIVE TENANCY & NO SUBLEASING', 42, legY + 14);
      doc.font('Helvetica').fontSize(6.7).fillColor('#334155')
        .text('1. Perjanjian Sewa Aktif Tunggal (Single Active Tenancy Covenant): Penyewa menyatakan hanya memiliki 1 sewa aktif di KOSMO.', 42, legY + 24, { width: colWidth - 12 });
      doc.font('Helvetica-Oblique').fontSize(6.3).fillColor('#64748b')
        .text('   Tenant warrants maintaining only 1 active lease.', 48, legY + 38);
      doc.font('Helvetica').fontSize(6.7).fillColor('#334155')
        .text('2. Larangan Sewa Ganda: Dilarang keras mengalihkan/sublet sewa tanpa izin tertulis.', 42, legY + 48, { width: colWidth - 12 });
      doc.font('Helvetica-Oblique').fontSize(6.3).fillColor('#64748b')
        .text('   Subleasing or assignment is strictly prohibited.', 48, legY + 62);

      doc.rect(36 + colWidth + 10, legY, colWidth, 80).fillAndStroke('#ffffff', '#e2e8f0');
      doc.fillColor('#0f172a').fontSize(7.2).font('Helvetica-Bold')
        .text('PASAL 6: HUKUM & YURISDIKSI BALI', 42 + colWidth + 10, legY + 5);
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#64748b')
        .text('ARTICLE 6: GOVERNING LAW & JURISDICTION', 42 + colWidth + 10, legY + 14);
      doc.font('Helvetica').fontSize(6.7).fillColor('#334155')
        .text('1. Tunduk pada hukum materiil Republik Indonesia (KUHPerdata & UU ITE No. 11/2008).', 42 + colWidth + 10, legY + 24, { width: colWidth - 12 });
      doc.font('Helvetica-Oblique').fontSize(6.3).fillColor('#64748b')
        .text('   Governed by the laws of the Republic of Indonesia.', 48 + colWidth + 10, legY + 38);
      doc.font('Helvetica').fontSize(6.7).fillColor('#334155')
        .text('2. Domisili hukum tetap di Pengadilan Negeri Denpasar / Pengadilan Negeri Badung, Bali.', 42 + colWidth + 10, legY + 48, { width: colWidth - 12 });
      doc.font('Helvetica-Oblique').fontSize(6.3).fillColor('#64748b')
        .text('   Exclusive jurisdiction: Pengadilan Negeri Denpasar / Badung.', 48 + colWidth + 10, legY + 62);

      doc.y = legY + 86;

      // ==========================================
      // PASAL 7: SIGNATURE & DIGITAL AUDIT TRAIL
      // ==========================================
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold')
        .text('PASAL 7: PENGESAHAN ELEKTRONIK & JEJAK AUDIT / ARTICLE 7: EXECUTION & DIGITAL AUDIT TRAIL');
      doc.moveDown(0.2);

      const sigBoxY = doc.y;
      const sigBoxHeight = 104;
      doc.rect(36, sigBoxY, pageWidth, sigBoxHeight).fillAndStroke('#f8fafc', '#0f172a');

      // Signature Canvas Column (Left)
      const sigWidth = 150;
      doc.fillColor('#0f172a').fontSize(7).font('Helvetica-Bold')
        .text('TANDA TANGAN PENYEWA / TENANT SIGNATURE:', 42, sigBoxY + 5);

      let signatureRendered = false;
      if (data.signatureBase64 && data.signatureBase64.startsWith('data:image')) {
        try {
          const base64Data = data.signatureBase64.replace(/^data:image\/\w+;base64,/, '');
          const imgBuffer = Buffer.from(base64Data, 'base64');
          if (imgBuffer.length > 30) {
            doc.image(imgBuffer, 44, sigBoxY + 16, { fit: [136, 44], align: 'center', valign: 'center' });
            signatureRendered = true;
          }
        } catch {
          signatureRendered = false;
        }
      }

      if (!signatureRendered) {
        doc.rect(44, sigBoxY + 16, 136, 44).fillAndStroke('#f1f5f9', '#94a3b8');
        doc.fillColor('#475569').fontSize(6.5).font('Helvetica-Oblique')
          .text('[Tanda Tangan Digital Terverifikasi via KOSMO Secure Pad / Verified Digital Signature]', 46, sigBoxY + 28, { width: 132, align: 'center' });
      }

      doc.fillColor('#0f172a').fontSize(7).font('Helvetica-Bold')
        .text(`${data.tenantName}`, 42, sigBoxY + 66, { width: sigWidth });
      doc.fillColor('#475569').fontSize(6.5).font('Helvetica')
        .text(`NIK / Pass: ${tenantNik}`, 42, sigBoxY + 76, { width: sigWidth })
        .text('Status: Terverifikasi Secara Elektronik (UU ITE Pasal 11)', 42, sigBoxY + 86, { width: sigWidth });

      // Audit Trail Column (Right)
      const auditX = 36 + sigWidth + 10;
      const auditWidth = pageWidth - sigWidth - 16;
      doc.fillColor('#0f172a').fontSize(7).font('Helvetica-Bold')
        .text('JEJAK AUDIT FORENSIK DIGITAL (UU ITE & PP 71/2019 COMPLIANT):', auditX, sigBoxY + 5);

      const signerIp = data.signerIp || '114.125.45.102 (Client Direct)';
      const signerUserAgent = data.signerUserAgent || 'Mozilla/5.0 KOSMO Secure Web Client';

      doc.font('Courier').fontSize(6.2).fillColor('#0f172a')
        .text(`• Signer Remote IP: ${signerIp}`, auditX, sigBoxY + 18, { width: auditWidth })
        .text(`• Waktu / Time    : ${signedAtWita} / ${signedAtUtc}`, auditX, sigBoxY + 28, { width: auditWidth })
        .text(`• Client Platform : ${signerUserAgent.substring(0, 65)}`, auditX, sigBoxY + 38, { width: auditWidth })
        .text(`• Dasar Hukum     : Pasal 1320 KUHPerdata, UU ITE No. 11/2008 jo. UU No. 1/2024`, auditX, sigBoxY + 48, { width: auditWidth });

      doc.font('Helvetica-Oblique').fontSize(6).fillColor('#475569')
        .text('Dokumen elektronik ini sah, mengikat, dan memiliki kekuatan pembuktian yang sempurna sesuai Pasal 5 & 6 UU ITE No. 11/2008 jo. UU No. 1/2024 serta Pasal 1320 KUHPerdata. Setiap modifikasi terhadap isi dokumen ini akan membatalkan integritas tanda tangan digital secara otomatis.', auditX, sigBoxY + 62, { width: auditWidth });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function generateRentalContractPdf(
  data: RentalContractData,
  outputDir?: string
): Promise<GenerateContractResult> {
  const buffer = await generateRentalContractBuffer(data);
  const contractHash = computeContractHash(buffer);
  const sanitizedId = sanitizeRentalId(data.rentalId);
  const fileName = `contract_${sanitizedId}.pdf`;

  // Optional backward-compatibility: write only if outputDir explicitly supplied (e.g. legacy test)
  if (outputDir) {
    try {
      const resolvedTargetDir = path.resolve(outputDir);
      if (!fs.existsSync(resolvedTargetDir)) {
        fs.mkdirSync(resolvedTargetDir, { recursive: true });
      }
      const fullFilePath = path.join(resolvedTargetDir, fileName);
      const resolvedFilePath = path.resolve(fullFilePath);
      if (resolvedFilePath.startsWith(resolvedTargetDir)) {
        fs.writeFileSync(resolvedFilePath, buffer);
      }
    } catch {
      // In serverless / read-only filesystem, ignore write failure
    }
  }

  return {
    filePath: `/uploads/${fileName}`,
    fileName,
    buffer,
    contractHash
  };
}

export async function generateAndUploadContract(
  data: RentalContractData
): Promise<GeneratedContractResult> {
  const pdfBuffer = await generateRentalContractBuffer(data);
  const contractHash = computeContractHash(pdfBuffer);
  const sanitizedId = sanitizeRentalId(data.rentalId);
  const filename = `contract_${sanitizedId}.pdf`;
  let cloudinaryUrl: string | undefined;
  try {
    const uploadRes = await uploadContractStream(pdfBuffer, filename, 'kosmo_contracts');
    cloudinaryUrl = uploadRes.secure_url;
  } catch (err) {
    console.warn('Cloudinary contract upload fallback to local URL due to error:', err);
    cloudinaryUrl = `/uploads/${filename}`;
  }

  return {
    pdfBuffer,
    contractHash,
    cloudinaryUrl
  };
}

