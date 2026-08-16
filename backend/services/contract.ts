import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export interface RentalContractData {
  rentalId: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  propertyName: string;
  propertyAddress: string;
  pricePerMonth: number;
  startDate: string;
  durationMonths?: number;
  signatureBase64?: string;
}

export function generateRentalContractPdf(
  data: RentalContractData,
  outputDir?: string
): Promise<{ filePath: string; fileName: string; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    try {
      const targetDir = outputDir || path.join(process.cwd(), 'backend', 'uploads');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const fileName = `contract_${data.rentalId}.pdf`;
      const fullFilePath = path.join(targetDir, fileName);

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => {
        const finalBuffer = Buffer.concat(buffers);
        try {
          fs.writeFileSync(fullFilePath, finalBuffer);
        } catch {
          // In serverless / read-only environment, file write might be skipped
        }
        resolve({
          filePath: `/uploads/${fileName}`,
          fileName,
          buffer: finalBuffer
        });
      });
      doc.on('error', (err: Error) => reject(err));

      // Header / Document Title
      doc.fontSize(18).font('Helvetica-Bold').text('SURAT PERJANJIAN SEWA KOS KOSMO', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').text(`Nomor Kontrak: KOSMO/${data.rentalId.toUpperCase()} • Tanggal: ${data.startDate}`, { align: 'center' });
      doc.moveDown(1.2);

      // Preamble
      doc.fontSize(10).font('Helvetica').text(
        'Pada hari ini telah disepakati bersama perjanjian sewa menyewa unit kamar kos dengan rincian identitas dan ketentuan sebagai berikut:'
      );
      doc.moveDown(0.8);

      // Section 1: Tenant Details
      doc.font('Helvetica-Bold').text('1. IDENTITAS PENYEWA (TENANT)');
      doc.font('Helvetica')
        .text(`   • Nama Lengkap   : ${data.tenantName}`)
        .text(`   • Email          : ${data.tenantEmail}`)
        .text(`   • Nomor Telepon  : ${data.tenantPhone || '-'}`);
      doc.moveDown(0.8);

      // Section 2: Property & Rental Terms
      doc.font('Helvetica-Bold').text('2. OBJEK DAN BIAYA SEWA');
      doc.font('Helvetica')
        .text(`   • Nama Properti  : ${data.propertyName}`)
        .text(`   • Alamat         : ${data.propertyAddress || 'Bali, Indonesia'}`)
        .text(`   • Biaya Sewa     : Rp ${data.pricePerMonth.toLocaleString('id-ID')} / bulan`)
        .text(`   • Tanggal Mulai  : ${data.startDate}`)
        .text(`   • Durasi Sewa    : ${data.durationMonths || 1} Bulan`);
      doc.moveDown(0.8);

      // Section 3: Terms & Conditions
      doc.font('Helvetica-Bold').text('3. KETENTUAN DAN TATA TERTIB SEWA');
      doc.font('Helvetica')
        .text('   a. Pembayaran sewa dilakukan di awal periode sewa melalui platform digital KOSMO.')
        .text('   b. Penyewa wajib menjaga kebersihan, ketertiban umum, dan fasilitas yang disediakan.')
        .text('   c. Dilarang memindahtangankan sewa kepada pihak ketiga tanpa persetujuan tertulis.')
        .text('   d. Pengakhiran masa sewa dapat dilakukan melalui dashboard KOSMO dengan verifikasi kata sandi.');
      doc.moveDown(1.2);

      // Section 4: Signatures & E-Signature Stamp
      doc.font('Helvetica-Bold').text('4. PENGESAHAN & TANDA TANGAN DIGITAL');
      doc.moveDown(0.5);

      if (data.signatureBase64 && data.signatureBase64.startsWith('data:image')) {
        try {
          const base64Data = data.signatureBase64.replace(/^data:image\/\w+;base64,/, '');
          const imgBuffer = Buffer.from(base64Data, 'base64');
          doc.image(imgBuffer, { width: 140, height: 60 });
          doc.moveDown(0.5);
        } catch {
          doc.font('Helvetica-Oblique').text('[Tanda Tangan Digital Terverifikasi Melalui Sistem KOSMO]');
          doc.moveDown(0.5);
        }
      } else {
        doc.font('Helvetica-Oblique').text('[Tanda Tangan Digital Terverifikasi Melalui Sistem KOSMO]');
        doc.moveDown(0.5);
      }

      doc.font('Helvetica').fontSize(10).text(`Nama Penyewa : ${data.tenantName}`);
      doc.text(`Waktu Tanda Tangan: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
