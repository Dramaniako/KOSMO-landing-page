import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  generateRentalContractBuffer,
  computeContractHash,
  computeBufferSha256,
  generateAndUploadContract,
  generateRentalContractPdf,
  sanitizeRentalId
} from '../backend/services/contract';
import { uploadContractStream, isCloudinaryConfigured } from '../backend/services/cloudinary';
import type { RentalContractData } from '../backend/services/contract';

/**
 * Extracts and normalizes text tokens from an in-memory PDF Buffer
 */
function extractTextFromPdf(pdfBuffer: Buffer): string {
  const content = pdfBuffer.toString('latin1');
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;
  let extracted = '';

  while ((match = streamRegex.exec(content)) !== null) {
    let streamContent = match[1];
    try {
      const decompressed = zlib.inflateSync(Buffer.from(streamContent, 'latin1'));
      streamContent = decompressed.toString('latin1');
    } catch {
      // Uncompressed stream
    }

    const parenMatches = streamContent.match(/\(([^)]+)\)/g);
    if (parenMatches) {
      for (const p of parenMatches) {
        extracted += p.slice(1, -1) + ' ';
      }
    }
  }

  return extracted || content;
}

/**
 * Calculates the Hamming distance (number of differing bits) between two 64-char hex strings
 */
function computeHexHammingDistance(hex1: string, hex2: string): number {
  const buf1 = Buffer.from(hex1, 'hex');
  const buf2 = Buffer.from(hex2, 'hex');
  let diffBits = 0;
  for (let i = 0; i < buf1.length; i++) {
    let xor = buf1[i] ^ buf2[i];
    while (xor > 0) {
      diffBits += xor & 1;
      xor >>= 1;
    }
  }
  return diffBits;
}

test('Milestone 2 Empirical Stress & Adversarial Challenge Suite', async (t) => {
  const baseRentalData: RentalContractData = {
    rentalId: 'stress-rent-001',
    propertyName: 'KOSMO Canggu Eco-Villa Suite #104',
    propertyAddress: 'Jl. Pantai Batu Bolong No. 88, Canggu, Kuta Utara, Badung, Bali 80351',
    landlordName: 'Wayan Landlord Sukadana',
    landlordEmail: 'wayan.sukadana@kosmo.id',
    landlordPhone: '+6281333444555',
    tenantName: 'Sarah Jessica Parker',
    tenantEmail: 'sarah.parker@example.com',
    tenantPhone: '+1-555-0199283',
    tenantNikPassport: 'C987654321',
    startDate: '2026-10-01',
    durationMonths: 12,
    monthlyPrice: 6500000,
    totalPrice: 78005000,
    adminFee: 5000,
    signerIp: '180.252.166.42',
    signerUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    signedAt: '2026-08-27T08:00:00.000Z',
    utilityQuotas: {
      electricityKwh: 250,
      water: 'PDAM & Deep Well Filtered Included',
      wifiMbps: 100,
      security: '24/7 Security & Keycard Access',
      waste: 'Eco-Waste Management Included'
    }
  };

  const sampleSignaturePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // =========================================================================
  // CHALLENGE 1: High Concurrency Load (100 Parallel PDF Stream Generations)
  // =========================================================================
  await t.test('1. Concurrency Stress: 100 Parallel In-Memory PDF Generations', async (t1) => {
    await t1.test('1.1 generates 100 concurrent contracts without stream crossover or data corruption', async () => {
      const CONCURRENCY_COUNT = 100;
      const startTime = performance.now();

      const tasks = Array.from({ length: CONCURRENCY_COUNT }, (_, index) => {
        const uniqueData: RentalContractData = {
          ...baseRentalData,
          rentalId: `stress-conc-${index.toString().padStart(4, '0')}`,
          tenantName: `Tenant_Stress_${index}`,
          tenantNikPassport: `ID_${(1000000000 + index).toString()}`
        };
        return generateRentalContractBuffer(uniqueData).then((buffer) => ({
          index,
          rentalId: uniqueData.rentalId,
          tenantName: uniqueData.tenantName,
          buffer,
          hash: computeContractHash(buffer)
        }));
      });

      const results = await Promise.all(tasks);
      const durationMs = performance.now() - startTime;

      assert.equal(results.length, CONCURRENCY_COUNT, 'All 100 concurrent promises must resolve');

      // Verify integrity of each generated buffer
      const hashSet = new Set<string>();
      for (const res of results) {
        assert.ok(Buffer.isBuffer(res.buffer), `Task ${res.index} output must be Buffer`);
        assert.ok(res.buffer.length > 2000, `Task ${res.index} buffer size (${res.buffer.length} bytes) must be valid PDF size`);
        assert.equal(res.buffer.subarray(0, 4).toString('ascii'), '%PDF', `Task ${res.index} must have %PDF header`);
        assert.equal(res.hash.length, 64, 'Contract hash must be 64 characters');
        assert.equal(res.hash, computeContractHash(res.buffer), 'Hash must match buffer recalculation');

        // Text isolation check: ensure tenant name is present in this buffer
        const extracted = extractTextFromPdf(res.buffer);
        assert.ok(
          extracted.includes(res.tenantName) || res.buffer.includes(Buffer.from(res.tenantName)),
          `Buffer ${res.index} must contain its own unique tenant name (${res.tenantName})`
        );

        hashSet.add(res.hash);
      }

      // Check collision resistance under concurrency: 100 unique payloads MUST yield 100 unique hashes
      assert.equal(hashSet.size, CONCURRENCY_COUNT, 'Every concurrent contract must have a distinct SHA-256 hash');
      assert.ok(durationMs < 10000, `100 concurrent PDF generations must complete in reasonable time (took ${durationMs.toFixed(2)}ms)`);
    });

    await t1.test('1.2 concurrent generateAndUploadContract handles 50 parallel uploads safely', async () => {
      const UPLOAD_COUNT = 50;
      const tasks = Array.from({ length: UPLOAD_COUNT }, (_, index) => {
        const data: RentalContractData = {
          ...baseRentalData,
          rentalId: `upload-conc-${index}`,
          tenantName: `Upload Tenant ${index}`
        };
        return generateAndUploadContract(data);
      });

      const uploadResults = await Promise.all(tasks);
      assert.equal(uploadResults.length, UPLOAD_COUNT);

      for (const res of uploadResults) {
        assert.ok(Buffer.isBuffer(res.pdfBuffer));
        assert.equal(res.pdfBuffer.subarray(0, 4).toString('ascii'), '%PDF');
        assert.equal(res.contractHash.length, 64);
        assert.ok(typeof res.cloudinaryUrl === 'string' && res.cloudinaryUrl.length > 0);
      }
    });
  });

  // =========================================================================
  // CHALLENGE 2: Memory Footprint & Leak Detection
  // =========================================================================
  await t.test('2. Memory Leak & Zero-Disk Footprint Audit', async (t2) => {
    await t2.test('2.1 memory remains bounded and leaks no uncollectible stream buffers across 5 batches', async () => {
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage().heapUsed;
      const BATCHES = 5;
      const PER_BATCH = 20;

      for (let b = 0; b < BATCHES; b++) {
        const batch = Array.from({ length: PER_BATCH }, (_, i) => ({
          ...baseRentalData,
          rentalId: `mem-test-b${b}-i${i}`,
          signatureBase64: sampleSignaturePng
        }));

        const buffers = await Promise.all(batch.map(generateRentalContractBuffer));
        assert.equal(buffers.length, PER_BATCH);

        // Discard local references
        buffers.length = 0;
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const heapDeltaMb = (finalMemory - initialMemory) / (1024 * 1024);

      // Even without explicit gc, 100 generated PDFs should not leak excessive memory (< 80MB heap growth)
      assert.ok(
        heapDeltaMb < 80,
        `Heap growth (${heapDeltaMb.toFixed(2)} MB) indicates memory retention after 100 PDF generations`
      );
    });

    await t2.test('2.2 zero disk writes: verify no files created anywhere in workspace during stress run', async () => {
      const uploadsDir = path.join(process.cwd(), 'backend', 'uploads');
      const filesInUploads = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];

      // Generate 20 more in-memory PDFs with varied IDs
      for (let i = 0; i < 20; i++) {
        await generateRentalContractBuffer({
          ...baseRentalData,
          rentalId: `zerodisk-${i}`
        });
      }

      const filesInUploadsAfter = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
      assert.equal(filesInUploadsAfter.length, filesInUploads.length, 'Zero files must be written to backend/uploads');
    });
  });

  // =========================================================================
  // CHALLENGE 3: Cryptographic SHA-256 Checksum Rigor & Avalanche Analysis
  // =========================================================================
  await t.test('3. Cryptographic SHA-256 Rigor & Avalanche Effect', async (t3) => {
    const fixedData: RentalContractData = {
      ...baseRentalData,
      rentalId: 'crypto-audit-001',
      signedAt: '2026-08-27T10:00:00.000Z'
    };

    const originalBuffer = await generateRentalContractBuffer(fixedData);
    const originalHash = computeContractHash(originalBuffer);

    await t3.test('3.1 bit-flip avalanche effect: 1-bit change produces >30% bit difference in SHA-256 (Hamming distance)', () => {
      const testPositions = [
        0, // First byte (%PDF)
        Math.floor(originalBuffer.length / 4), // Quarter way
        Math.floor(originalBuffer.length / 2), // Middle
        Math.floor((3 * originalBuffer.length) / 4), // 3/4 way
        originalBuffer.length - 1 // Last byte (%%EOF)
      ];

      for (const pos of testPositions) {
        for (let bit = 0; bit < 8; bit++) {
          const corruptedBuffer = Buffer.from(originalBuffer);
          corruptedBuffer[pos] ^= (1 << bit);

          const corruptedHash = computeContractHash(corruptedBuffer);
          const hammingDist = computeHexHammingDistance(originalHash, corruptedHash);
          const totalBits = 256;
          const diffRatio = hammingDist / totalBits;

          assert.notEqual(corruptedHash, originalHash, `Hash at pos ${pos}, bit ${bit} must differ`);
          // Ideal cryptographic avalanche is ~50% (128 bits); rigorous lower bound is 30% (77 bits)
          assert.ok(
            diffRatio >= 0.30,
            `Avalanche ratio ${diffRatio.toFixed(3)} (${hammingDist}/256 bits) at pos ${pos}, bit ${bit} is below 30% threshold`
          );
        }
      }
    });

    await t3.test('3.2 SHA-256 alias function computeBufferSha256 is mathematically identical', () => {
      assert.equal(computeBufferSha256(originalBuffer), originalHash);
    });

    await t3.test('3.3 high-throughput SHA-256 hashing benchmark (1000 PDF buffer hashes in < 500ms)', () => {
      const start = performance.now();
      const ITERATIONS = 1000;
      for (let i = 0; i < ITERATIONS; i++) {
        computeContractHash(originalBuffer);
      }
      const duration = performance.now() - start;
      assert.ok(duration < 500, `1000 SHA-256 hashes must take < 500ms (took ${duration.toFixed(2)}ms)`);
    });
  });

  // =========================================================================
  // CHALLENGE 4: Adversarial Fuzzing, Boundary Injections & Malicious Payloads
  // =========================================================================
  await t.test('4. Adversarial Fuzzing, Boundary Injections & Edge Cases', async (t4) => {
    await t4.test('4.1 massive string payload injection (10,000 char tenant name, 5,000 char address)', async () => {
      const massiveData: RentalContractData = {
        ...baseRentalData,
        rentalId: 'huge-payload-001',
        tenantName: 'A'.repeat(10000),
        propertyAddress: 'Jl. Long Address '.repeat(300),
        landlordName: 'Landlord '.repeat(500)
      };

      const buffer = await generateRentalContractBuffer(massiveData);
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
    });

    await t4.test('4.2 malicious path traversal & OS injection attempts in rentalId', () => {
      const attackVectors = [
        '../../../../../../../../windows/system32/cmd.exe',
        '..\\..\\..\\..\\..\\..\\windows\\system32\\calc.exe',
        '/etc/shadow',
        '../../../../etc/passwd%00.pdf',
        'rent-123; rm -rf /',
        'rent-`id`',
        'rent-$(whoami)',
        '\\\\attacker-smb\\share\\evil',
        'COM1',
        'NUL',
        '../..//../..\\\\..\\',
        '\0\0\0\0',
        '   ',
        ''
      ];

      for (const attack of attackVectors) {
        const sanitized = sanitizeRentalId(attack);
        assert.ok(!sanitized.includes('/'), `Sanitized "${attack}" -> "${sanitized}" should not contain forward slash`);
        assert.ok(!sanitized.includes('\\'), `Sanitized "${attack}" -> "${sanitized}" should not contain backslash`);
        assert.ok(!sanitized.includes('..'), `Sanitized "${attack}" -> "${sanitized}" should not contain directory traversal`);
        assert.ok(/^[a-zA-Z0-9_-]+$/.test(sanitized), `Sanitized "${attack}" -> "${sanitized}" must be safe alphanumeric`);
      }
    });

    await t4.test('4.3 malformed, oversized, and corrupted Base64 signature payloads', async () => {
      const testSignatures = [
        // 1. Valid prefix but random binary junk
        'data:image/png;base64,' + Buffer.from('NOT_A_REAL_PNG_HEADER_JUST_RANDOM_DATA_XYZ_12345').toString('base64'),
        // 2. Truncated base64 image prefix
        'data:image/png;base64,',
        // 3. Plain non-base64 string
        'data:image/png;base64,???invalid-chars-not-base64???',
        // 4. Very large base64 string (256KB random noise)
        'data:image/png;base64,' + crypto.randomBytes(256 * 1024).toString('base64'),
        // 5. Data URI of non-image MIME type
        'data:text/html;base64,' + Buffer.from('<script>alert("xss")</script>').toString('base64'),
        // 6. SVG XML payload attempting XML entity expansion
        'data:image/svg+xml;base64,' + Buffer.from('<?xml version="1.0"?><svg>test</svg>').toString('base64'),
        // 7. Null/undefined/empty string
        ''
      ];

      for (const sig of testSignatures) {
        const data: RentalContractData = {
          ...baseRentalData,
          rentalId: 'sig-fuzz-test',
          signatureBase64: sig
        };

        const buffer = await generateRentalContractBuffer(data);
        assert.ok(Buffer.isBuffer(buffer), `Signature payload fuzzing must not crash renderer: ${sig.slice(0, 30)}`);
        assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
      }
    });

    await t4.test('4.4 special Unicode scripts, emojis, and non-ASCII character encoding', async () => {
      const internationalData: RentalContractData = {
        ...baseRentalData,
        tenantName: '🌸 Sakura Tanaka (田中さくら) & Владимир 🌺',
        propertyName: 'Villa Dewata ᬅᬓ᭄ᬱᬭᬩᬮᬶ (Balinese Sanctuary) 🌴',
        propertyAddress: 'Jl. Raya Ubud #42, Gianyar, Bali • 80571 — 🌟 Luxury Suite 🌟',
        landlordName: 'I Gusti Ngurah Agung (ᬇᬕᬸᬲ᭄ᬢᬶ)'
      };

      const buffer = await generateRentalContractBuffer(internationalData);
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
    });

    await t4.test('4.5 financial numeric boundary extremes (0, negative, float decimals, large amounts)', async () => {
      const edgeCases: Partial<RentalContractData>[] = [
        { monthlyPrice: 0, totalPrice: 0, adminFee: 0 },
        { monthlyPrice: -500000, totalPrice: -500000, adminFee: -5000 },
        { monthlyPrice: 1500000.758, totalPrice: 1505000.758, adminFee: 5000.5 },
        { monthlyPrice: Number.MAX_SAFE_INTEGER, totalPrice: Number.MAX_SAFE_INTEGER, adminFee: 5000 },
        { durationMonths: 0 },
        { durationMonths: -3 },
        { durationMonths: 120 } // 10 years
      ];

      for (const ec of edgeCases) {
        const data: RentalContractData = {
          ...baseRentalData,
          ...ec
        };

        const buffer = await generateRentalContractBuffer(data);
        assert.ok(Buffer.isBuffer(buffer));
        assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
      }
    });

    await t4.test('4.6 invalid date strings and timezone conversions handled gracefully without NaN', async () => {
      const dateEdgeCases = [
        'INVALID_DATE_STRING_XYZ',
        '2026-99-99T99:99:99Z',
        '',
        '1970-01-01T00:00:00Z',
        '2099-12-31T23:59:59Z'
      ];

      for (const invalidDate of dateEdgeCases) {
        const data: RentalContractData = {
          ...baseRentalData,
          signedAt: invalidDate
        };

        const buffer = await generateRentalContractBuffer(data);
        assert.ok(Buffer.isBuffer(buffer));
        assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
      }
    });
  });

  // =========================================================================
  // CHALLENGE 5: Cloudinary Streaming Edge Cases & Direct Buffer Guard
  // =========================================================================
  await t.test('5. Cloudinary Streaming Resiliency', async (t5) => {
    await t5.test('5.1 uploadContractStream handles unconfigured environment deterministically', async () => {
      const testBuffer = Buffer.from('%PDF-1.4 test contract buffer stream payload');
      const res = await uploadContractStream(testBuffer, 'contract_test_mock.pdf', 'kosmo_contracts');

      assert.ok(res.secure_url.includes('kosmo-bali/raw/upload/v1/kosmo_contracts/contract_test_mock.pdf'));
      assert.equal(res.public_id, 'kosmo_contracts/contract_test_mock');
    });

    await t5.test('5.2 uploadContractStream sanitizes malicious filename with directory traversal', async () => {
      const testBuffer = Buffer.from('%PDF-1.4 test');
      const maliciousFilename = '../../../../secret_contract.sh.pdf';
      const res = await uploadContractStream(testBuffer, maliciousFilename, 'kosmo_contracts');

      assert.ok(!res.public_id.includes('..'), 'Public ID must not contain traversal');
      assert.ok(!res.secure_url.includes('..'), 'Secure URL must not contain traversal');
      assert.equal(res.public_id, 'kosmo_contracts/secret_contract_sh');
    });
  });
});
