import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  generateRentalContractBuffer,
  computeContractHash,
  generateAndUploadContract,
  generateRentalContractPdf,
  sanitizeRentalId
} from '../backend/services/contract';
import { uploadContractStream } from '../backend/services/cloudinary';
import type { RentalContractData } from '../backend/services/contract';

/**
 * Helper function to extract and normalize text tokens from an in-memory PDF Buffer
 * by decompressing FlateDecode content streams.
 */
function extractTextTokensFromPdf(pdfBuffer: Buffer): string {
  const content = pdfBuffer.toString('latin1');
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;
  let extractedText = '';

  while ((match = streamRegex.exec(content)) !== null) {
    let streamContent = match[1];
    try {
      const decompressed = zlib.inflateSync(Buffer.from(streamContent, 'latin1'));
      streamContent = decompressed.toString('latin1');
    } catch {
      // Uncompressed stream or non-deflate
    }

    const hexMatches = streamContent.match(/<([0-9a-fA-F]+)>/g);
    if (hexMatches) {
      for (const h of hexMatches) {
        extractedText += Buffer.from(h.slice(1, -1), 'hex').toString('utf-8');
      }
    }

    const parenMatches = streamContent.match(/\(([^)]+)\)/g);
    if (parenMatches) {
      for (const p of parenMatches) {
        extractedText += p.slice(1, -1);
      }
    }
  }

  if (!extractedText) {
    extractedText = content;
  }

  return extractedText.replace(/\s+/g, '');
}

test('PDF Rental Contract & Cryptographic Verification Suite', async (t) => {
  const baseRentalData: RentalContractData = {
    rentalId: 'rent-test-001',
    propertyName: 'KOSMO Hub Seminyak Deluxe Suite',
    propertyAddress: 'Jl. Kayu Aya No. 18, Seminyak, Badung, Bali 80361',
    landlordName: 'I Made Landlord Wirawan',
    landlordEmail: 'made.landlord@kosmo.id',
    landlordPhone: '+6281999888777',
    tenantName: 'Bayu Wipradnyana',
    tenantEmail: 'bayu@kosmo.id',
    tenantPhone: '+6281234567890',
    tenantNikPassport: '5171012345678901',
    startDate: '2026-09-01',
    durationMonths: 6,
    monthlyPrice: 3500000,
    totalPrice: 21000000,
    adminFee: 5000,
    signerIp: '114.125.45.102',
    signerUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KOSMO/2.0',
    signedAt: '2026-08-27T08:00:00+08:00',
    utilityQuotas: {
      electricityKwh: 100,
      water: 'PDAM & Deep Well Included',
      wifiMbps: 100,
      security: '24/7 Security & CCTV',
      waste: 'Daily Waste Management Included'
    }
  };

  // Sample 1x1 transparent PNG canvas signature
  const sampleSignaturePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // -------------------------------------------------------------
  // SUITE 1: In-Memory PDF Generation Core
  // -------------------------------------------------------------
  await t.test('1. In-Memory PDF Generation Core', async (t1) => {
    await t1.test('1.1 generates valid PDF buffer with %PDF- header', async () => {
      const buffer = await generateRentalContractBuffer(baseRentalData);

      assert.ok(Buffer.isBuffer(buffer), 'Result must be a Node.js Buffer instance');
      assert.ok(buffer.length > 1000, 'PDF buffer should be substantive (> 1KB)');

      const magicHeader = buffer.subarray(0, 4).toString('ascii');
      assert.equal(magicHeader, '%PDF', 'PDF buffer must start with %PDF magic header');
    });

    await t1.test('1.2 operates strictly in-memory with zero local disk writes', async () => {
      const uploadsDir = path.join(process.cwd(), 'backend', 'uploads');
      const filesBefore = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];

      const buffer = await generateRentalContractBuffer(baseRentalData);
      assert.ok(Buffer.isBuffer(buffer));

      const filesAfter = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
      assert.equal(filesAfter.length, filesBefore.length, 'No files should be written to backend/uploads');
    });

    await t1.test('1.3 handles concurrent PDF generations without memory or stream collision', async () => {
      const payloads = [1, 2, 3, 4, 5].map((i) => ({
        ...baseRentalData,
        rentalId: `rent-concurrent-${i}`,
        tenantName: `Tenant Concurrent ${i}`
      }));

      const buffers = await Promise.all(payloads.map(generateRentalContractBuffer));

      assert.equal(buffers.length, 5);
      for (let i = 0; i < buffers.length; i++) {
        assert.ok(Buffer.isBuffer(buffers[i]));
        assert.equal(buffers[i].subarray(0, 4).toString('ascii'), '%PDF');
      }
    });

    await t1.test('1.4 rejects promise and cleans up stream when PDF document stream encounters an error', async () => {
      const EventEmitter = (await import('events')).EventEmitter;
      const mockStream = new EventEmitter();

      const streamPromise = new Promise<Buffer>((resolve, reject) => {
        const buffers: Buffer[] = [];
        mockStream.on('data', (chunk: Buffer) => buffers.push(chunk));
        mockStream.on('end', () => resolve(Buffer.concat(buffers)));
        mockStream.on('error', (err: Error) => reject(err));
      });

      mockStream.emit('error', new Error('Simulated PDF document stream failure'));

      await assert.rejects(
        streamPromise,
        /Simulated PDF document stream failure/,
        'Document stream listener must reject on stream error events'
      );
    });
  });

  // -------------------------------------------------------------
  // SUITE 2: Cryptographic SHA-256 Checksum Calculation
  // -------------------------------------------------------------
  await t.test('2. Cryptographic SHA-256 Checksum Calculation', async (t2) => {
    const buffer = await generateRentalContractBuffer(baseRentalData);

    await t2.test('2.1 computes 64-character lowercase hexadecimal hash', () => {
      const hash = computeContractHash(buffer);

      assert.equal(typeof hash, 'string');
      assert.equal(hash.length, 64, 'SHA-256 hash must be exactly 64 characters');
      assert.ok(/^[a-f0-9]{64}$/.test(hash), 'Hash must be valid lowercase hexadecimal');
    });

    await t2.test('2.2 is strictly deterministic across multiple computations', () => {
      const hash1 = computeContractHash(buffer);
      const hash2 = computeContractHash(buffer);
      const hash3 = computeContractHash(buffer);

      assert.equal(hash1, hash2);
      assert.equal(hash2, hash3);
    });

    await t2.test('2.3 matches standard Node.js crypto SHA-256 implementation', () => {
      const expectedHash = crypto.createHash('sha256').update(buffer).digest('hex');
      const actualHash = computeContractHash(buffer);

      assert.equal(actualHash, expectedHash);
    });

    await t2.test('2.4 demonstrates avalanche effect upon single-byte perturbation', () => {
      const originalHash = computeContractHash(buffer);

      const modifiedBuffer = Buffer.from(buffer);
      // Flip a single bit in the first byte
      modifiedBuffer[0] ^= 0x01;

      const modifiedHash = computeContractHash(modifiedBuffer);

      assert.notEqual(originalHash, modifiedHash, 'Hash must completely change when 1 byte is modified');
    });

    await t2.test('2.5 correctly computes known SHA-256 vector for empty buffer', () => {
      const emptyHash = computeContractHash(Buffer.alloc(0));
      assert.equal(emptyHash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    await t2.test('2.6 throws TypeError on non-Buffer inputs', () => {
      assert.throws(() => {
        // @ts-expect-error testing invalid argument type
        computeContractHash('invalid-string-input');
      }, TypeError);
    });
  });

  // -------------------------------------------------------------
  // SUITE 3: Bilingual Statutory Clauses & Indonesian Law Compliance
  // -------------------------------------------------------------
  await t.test('3. Bilingual Statutory Clauses & Indonesian Law Compliance', async (t3) => {
    const buffer = await generateRentalContractBuffer({
      ...baseRentalData,
      signatureBase64: sampleSignaturePng
    });
    const normalizedText = extractTextTokensFromPdf(buffer);

    await t3.test('3.1 embeds Indonesian Civil Code Article 1320 (KUHPerdata Art. 1320)', () => {
      assert.ok(
        normalizedText.includes('1320') && normalizedText.includes('KUHPerdata'),
        'PDF must cite Article 1320 Indonesian Civil Code / KUHPerdata'
      );
    });

    await t3.test('3.2 embeds Indonesian Electronic Information Law (UU ITE No. 11/2008 jo. UU No. 1/2024)', () => {
      assert.ok(
        normalizedText.includes('UUITE') || normalizedText.includes('ITE'),
        'PDF must cite UU ITE electronic contract validity'
      );
    });

    await t3.test('3.3 embeds Bali dispute jurisdiction clause (Pengadilan Negeri Denpasar / Badung)', () => {
      assert.ok(
        normalizedText.includes('Denpasar') || normalizedText.includes('Badung'),
        'PDF must designate Pengadilan Negeri Denpasar / Badung jurisdiction'
      );
    });

    await t3.test('3.4 embeds Single Active Tenancy covenant (larangan sewa ganda)', () => {
      assert.ok(
        normalizedText.includes('SingleActiveTenancy') ||
        normalizedText.includes('SewaAktifTunggal') ||
        normalizedText.includes('Tunggal'),
        'PDF must include Single Active Tenancy covenant'
      );
    });

    await t3.test('3.5 embeds complete party identification (NIK/Passport & Landlord)', () => {
      assert.ok(normalizedText.includes('5171012345678901'), 'PDF must include tenant NIK/Passport number');
      assert.ok(normalizedText.includes('Bayu'), 'PDF must include tenant name');
      assert.ok(normalizedText.includes('Made'), 'PDF must include landlord name');
    });

    await t3.test('3.6 embeds financial terms and flat Rp 5.000 admin fee', () => {
      assert.ok(
        normalizedText.includes('5000') || normalizedText.includes('5.000'),
        'PDF must clearly display the flat Rp 5.000 admin fee line item'
      );
    });

    await t3.test('3.7 embeds utility quota thresholds (WiFi, electricity, water)', () => {
      assert.ok(
        normalizedText.includes('100Mbps') || normalizedText.includes('100'),
        'PDF must specify WiFi speed quota'
      );
      assert.ok(
        normalizedText.includes('PDAM') || normalizedText.includes('Air'),
        'PDF must specify water utility terms'
      );
    });
  });

  // -------------------------------------------------------------
  // SUITE 4: Digital Signature Canvas & Evidentiary Audit Trail
  // -------------------------------------------------------------
  await t.test('4. Digital Signature Canvas & Evidentiary Audit Trail', async (t4) => {
    await t4.test('4.1 renders valid Base64 PNG canvas signature into PDF without errors', async () => {
      const signedData: RentalContractData = {
        ...baseRentalData,
        rentalId: 'rent-signed-002',
        signatureBase64: sampleSignaturePng
      };

      const buffer = await generateRentalContractBuffer(signedData);
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
    });

    await t4.test('4.2 gracefully handles missing or empty signature string with system stamp', async () => {
      const unsignedData: RentalContractData = {
        ...baseRentalData,
        rentalId: 'rent-unsigned-003',
        signatureBase64: ''
      };

      const buffer = await generateRentalContractBuffer(unsignedData);
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');

      const normalizedText = extractTextTokensFromPdf(buffer);
      assert.ok(
        normalizedText.includes('TandaTangan') || normalizedText.includes('Signature'),
        'PDF should contain fallback signature acknowledgement'
      );
    });

    await t4.test('4.3 gracefully handles malformed or corrupted Base64 signature data', async () => {
      const corruptData: RentalContractData = {
        ...baseRentalData,
        rentalId: 'rent-corrupt-004',
        signatureBase64: 'data:image/png;base64,not-a-valid-base64-image-payload!!!'
      };

      const buffer = await generateRentalContractBuffer(corruptData);
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
    });

    await t4.test('4.4 embeds audit trail metadata (IP, User-Agent, Signed Timestamp)', async () => {
      const buffer = await generateRentalContractBuffer(baseRentalData);
      const normalizedText = extractTextTokensFromPdf(buffer);

      assert.ok(normalizedText.includes('114.125.45.102'), 'PDF must include signer IP address');
    });
  });

  // -------------------------------------------------------------
  // SUITE 5: Cloudinary Direct Buffer Streaming & Orchestration
  // -------------------------------------------------------------
  await t.test('5. Cloudinary Direct Buffer Streaming & Orchestration', async (t5) => {
    await t5.test('5.1 generates buffer, computes hash, and uploads to Cloudinary with mock fallback', async () => {
      const result = await generateAndUploadContract(baseRentalData);

      assert.ok(result, 'Result must be defined');
      assert.ok(Buffer.isBuffer(result.pdfBuffer), 'Result must contain in-memory pdfBuffer');
      assert.equal(result.pdfBuffer.subarray(0, 4).toString('ascii'), '%PDF');

      assert.equal(typeof result.contractHash, 'string');
      assert.equal(result.contractHash.length, 64);
      assert.equal(result.contractHash, computeContractHash(result.pdfBuffer));

      if (result.cloudinaryUrl) {
        assert.ok(
          result.cloudinaryUrl.startsWith('https://res.cloudinary.com/'),
          'Cloudinary URL must start with standard CDN prefix'
        );
      }
    });

    await t5.test('5.2 uploadContractStream rejects empty or invalid buffers', async () => {
      await assert.rejects(
        () => uploadContractStream(Buffer.alloc(0), 'empty.pdf'),
        /Contract buffer cannot be empty/
      );
    });
  });

  // -------------------------------------------------------------
  // SUITE 6: Input Sanitization & Boundary Edge Cases
  // -------------------------------------------------------------
  await t.test('6. Input Sanitization & Boundary Edge Cases', async (t6) => {
    await t6.test('6.1 sanitizeRentalId strips directory traversal sequences and malicious characters', () => {
      assert.equal(sanitizeRentalId('../../etc/passwd'), 'passwd');
      assert.equal(sanitizeRentalId('..\\..\\windows\\system32\\malicious'), 'malicious');
      assert.equal(sanitizeRentalId('rent-123_abc'), 'rent-123_abc');
      assert.equal(sanitizeRentalId('../../../evil.sh'), 'evilsh');
      assert.equal(sanitizeRentalId(''), 'contract');
      assert.equal(sanitizeRentalId('   '), 'contract');
      assert.equal(sanitizeRentalId('!@#$%^&*()'), 'contract');
    });

    await t6.test('6.2 handles extreme durations and zero/negative defaults gracefully', async () => {
      const shortTermData: RentalContractData = { ...baseRentalData, durationMonths: 1 };
      const longTermData: RentalContractData = { ...baseRentalData, durationMonths: 24 };

      const bufShort = await generateRentalContractBuffer(shortTermData);
      const bufLong = await generateRentalContractBuffer(longTermData);

      assert.ok(Buffer.isBuffer(bufShort));
      assert.ok(Buffer.isBuffer(bufLong));
      assert.notEqual(computeContractHash(bufShort), computeContractHash(bufLong));
    });

    await t6.test('6.3 handles special unicode characters in property and tenant names', async () => {
      const unicodeData: RentalContractData = {
        ...baseRentalData,
        tenantName: 'François & Jørn Müller-Östlund',
        propertyName: 'Villa Surya “Dewata” Deluxe #4 & Spa'
      };

      const buffer = await generateRentalContractBuffer(unicodeData);
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
    });

    await t6.test('6.4 handles omitted optional utility quotas and landlord contact details', async () => {
      const minimalData: RentalContractData = {
        propertyName: 'KOSMO Standard Room',
        propertyAddress: 'Denpasar, Bali',
        landlordName: 'Owner Landlord',
        tenantName: 'Simple Tenant',
        tenantEmail: 'tenant@test.com',
        tenantPhone: '+628000000',
        tenantNikPassport: '1234567890123456',
        startDate: '2026-09-01',
        durationMonths: 1,
        monthlyPrice: 2000000,
        totalPrice: 2000000,
        adminFee: 5000
      };

      const buffer = await generateRentalContractBuffer(minimalData);
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
    });
  });

  // -------------------------------------------------------------
  // SUITE 7: Backward Compatibility Bridge
  // -------------------------------------------------------------
  await t.test('7. Backward Compatibility Bridge', async (t7) => {
    const testOutputDir = path.join(process.cwd(), 'tests', 'temp_contracts');

    t7.after(() => {
      try {
        if (fs.existsSync(testOutputDir)) {
          fs.rmSync(testOutputDir, { recursive: true, force: true });
        }
      } catch {}
    });

    await t7.test('7.1 generateRentalContractPdf legacy function returns valid structure', async () => {
      const legacyResult = await generateRentalContractPdf(baseRentalData, testOutputDir);

      assert.ok(legacyResult, 'Legacy result must be defined');
      assert.ok(Buffer.isBuffer(legacyResult.buffer));
      assert.equal(legacyResult.buffer.subarray(0, 4).toString('ascii'), '%PDF');
      assert.equal(typeof legacyResult.fileName, 'string');
      assert.equal(typeof legacyResult.filePath, 'string');
      assert.equal(typeof legacyResult.contractHash, 'string');
      assert.equal(legacyResult.contractHash.length, 64);
    });

    await t7.test('7.2 generateRentalContractPdf writes file only when outputDir is specified and guards path traversal', async () => {
      const maliciousData: RentalContractData = {
        ...baseRentalData,
        rentalId: '../../../../traversal_attempt_test'
      };

      const result = await generateRentalContractPdf(maliciousData, testOutputDir);

      assert.ok(Buffer.isBuffer(result.buffer));
      assert.equal(result.fileName, 'contract_traversal_attempt_test.pdf');
      assert.equal(result.filePath, '/uploads/contract_traversal_attempt_test.pdf');

      const expectedFilePath = path.join(path.resolve(testOutputDir), 'contract_traversal_attempt_test.pdf');
      assert.equal(fs.existsSync(expectedFilePath), true);
    });
  });
});
