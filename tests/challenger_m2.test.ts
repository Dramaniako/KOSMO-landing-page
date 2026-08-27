import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import {
  generateRentalContractBuffer,
  computeContractHash,
  computeBufferSha256,
  generateAndUploadContract,
  generateRentalContractPdf,
  sanitizeRentalId,
  RentalContractData
} from '../backend/services/contract';
import {
  uploadContractStream,
  isCloudinaryConfigured
} from '../backend/services/cloudinary';

/**
 * Deep PDF Parser & FlateDecode Stream Decompressor
 * Extracts and parses all PDF objects, streams, and text tokens.
 */
interface DecompressedPdfAnalysis {
  streamCount: number;
  decompressedStreamCount: number;
  decompressedText: string;
  allRawTokens: string[];
  pageCount: number;
  hasCatalog: boolean;
  hasPages: boolean;
  hasInfo: boolean;
  hasFont: boolean;
}

function parseAndDecompressPdf(pdfBuffer: Buffer): DecompressedPdfAnalysis {
  const content = pdfBuffer.toString('latin1');
  
  // Verify PDF header and trailer
  assert.ok(pdfBuffer.subarray(0, 4).toString('ascii') === '%PDF', 'Must start with %PDF magic header');
  assert.ok(content.includes('%%EOF'), 'Must contain %%EOF trailer');

  let streamCount = 0;
  let decompressedStreamCount = 0;
  let decompressedText = '';
  const allRawTokens: string[] = [];

  // Match all object streams: stream ... endstream
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(content)) !== null) {
    streamCount++;
    const rawStream = match[1];
    let decompressed: Buffer;

    try {
      decompressed = zlib.inflateSync(Buffer.from(rawStream, 'latin1'));
      decompressedStreamCount++;
      const textChunk = decompressed.toString('latin1');
      decompressedText += textChunk + '\n';

      // Extract bracketed text: (Hello World)
      const bracketMatches = textChunk.match(/\((.*?)\)/gs);
      if (bracketMatches) {
        for (const bm of bracketMatches) {
          const unescaped = bm.slice(1, -1).replace(/\\([()\\])/g, '$1');
          allRawTokens.push(unescaped);
        }
      }

      // Extract hex strings: <48656c6c6f>
      const hexMatches = textChunk.match(/<([0-9a-fA-F]+)>/g);
      if (hexMatches) {
        for (const hm of hexMatches) {
          const hex = hm.slice(1, -1);
          if (hex.length % 2 === 0) {
            allRawTokens.push(Buffer.from(hex, 'hex').toString('utf-8'));
          }
        }
      }
    } catch {
      // Stream is uncompressed or raw binary image data
      decompressedText += rawStream + '\n';
    }
  }

  // Count /Type /Page objects
  const pageMatches = content.match(/\/Type\s*\/Page\b/g);
  const pageCount = pageMatches ? pageMatches.length : 1;

  return {
    streamCount,
    decompressedStreamCount,
    decompressedText,
    allRawTokens,
    pageCount,
    hasCatalog: content.includes('/Type /Catalog') || content.includes('/Catalog'),
    hasPages: content.includes('/Type /Pages') || content.includes('/Pages'),
    hasInfo: content.includes('/Title') && content.includes('/Author'),
    hasFont: content.includes('/Font')
  };
}

test('CHALLENGER SUITE: M2 In-Memory PDF & Cloudinary Streaming Empirical Audit', async (t) => {
  const sampleContractData: RentalContractData = {
    rentalId: 'rent-audit-999',
    propertyName: 'KOSMO Sunset Loft Canggu',
    propertyAddress: 'Jl. Pantai Batu Bolong No. 88, Canggu, Kuta Utara, Badung, Bali 80361',
    landlordName: 'Wayan Landlord Sukerta',
    landlordEmail: 'wayan@kosmobali.id',
    landlordPhone: '+62 811-2345-6789',
    tenantName: 'Sarah Jenkins',
    tenantEmail: 'sarah.j@example.com',
    tenantPhone: '+62 878-1122-3344',
    tenantNikPassport: 'A12345678',
    startDate: '2026-09-15',
    durationMonths: 3,
    monthlyPrice: 6500000,
    totalPrice: 19505000,
    adminFee: 5000,
    signerIp: '180.252.164.88',
    signerUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    signedAt: '2026-08-27T08:00:00Z',
    utilityQuotas: {
      electricityKwh: 250,
      water: 'PDAM & Deep Well Included',
      wifiMbps: 100,
      security: '24/7 Security Patrol & Access Card',
      waste: 'Eco-Bali Waste Management Included'
    }
  };

  // 1x1 PNG transparent data URI
  const validBase64Signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // =========================================================================
  // CHALLENGE 1: Zero Disk File Pollution Across Massive Repeated Runs
  // =========================================================================
  await t.test('CHALLENGE 1: Zero Disk File Pollution Across 50 Repeated Operations', async (t1) => {
    const uploadsDir = path.join(process.cwd(), 'backend', 'uploads');
    const rootUploadsDir = path.join(process.cwd(), 'uploads');
    const tmpDir = os.tmpdir();

    const getFileSnapshot = (dir: string): string[] => {
      if (!fs.existsSync(dir)) return [];
      try {
        return fs.readdirSync(dir);
      } catch {
        return [];
      }
    };

    const initialUploads = getFileSnapshot(uploadsDir);
    const initialRootUploads = getFileSnapshot(rootUploadsDir);

    // Run 50 generations mixing generateRentalContractBuffer, generateAndUploadContract, and generateRentalContractPdf
    for (let i = 0; i < 50; i++) {
      const data: RentalContractData = {
        ...sampleContractData,
        rentalId: `stress-rent-${i}`,
        tenantName: `Tenant Stress ${i}`
      };

      if (i % 3 === 0) {
        const buf = await generateRentalContractBuffer(data);
        assert.ok(Buffer.isBuffer(buf));
      } else if (i % 3 === 1) {
        const res = await generateAndUploadContract(data);
        assert.ok(Buffer.isBuffer(res.pdfBuffer));
        assert.equal(res.contractHash.length, 64);
      } else {
        // Calling default generateRentalContractPdf without outputDir must NOT write to disk
        const res = await generateRentalContractPdf(data);
        assert.ok(Buffer.isBuffer(res.buffer));
        assert.equal(res.contractHash.length, 64);
      }
    }

    const finalUploads = getFileSnapshot(uploadsDir);
    const finalRootUploads = getFileSnapshot(rootUploadsDir);

    assert.deepEqual(
      finalUploads,
      initialUploads,
      'Disk pollution detected: backend/uploads file list changed during in-memory generation!'
    );
    assert.deepEqual(
      finalRootUploads,
      initialRootUploads,
      'Disk pollution detected: ./uploads file list changed during in-memory generation!'
    );
  });

  // =========================================================================
  // CHALLENGE 2: PDF FlateDecode Stream Decompression & Statutory Clause Audit
  // =========================================================================
  await t.test('CHALLENGE 2: PDF FlateDecode Stream Decompression & Statutory Audit', async (t2) => {
    const pdfBuffer = await generateRentalContractBuffer({
      ...sampleContractData,
      signatureBase64: validBase64Signature
    });

    const analysis = parseAndDecompressPdf(pdfBuffer);

    await t2.test('2.1 zlib.inflateSync successfully decompresses all compressed PDF content streams', () => {
      assert.ok(analysis.streamCount > 0, 'PDF must contain stream objects');
      assert.ok(analysis.decompressedStreamCount > 0, 'At least one stream must be FlateDecode compressed and inflated');
      assert.ok(analysis.decompressedText.length > 500, 'Decompressed text stream must contain substantial content');
    });

    await t2.test('2.2 Document contains valid PDF structural catalog and font dictionaries', () => {
      assert.ok(analysis.hasCatalog, 'PDF must declare /Catalog');
      assert.ok(analysis.hasPages, 'PDF must declare /Pages');
      assert.ok(analysis.hasFont, 'PDF must declare /Font');
      assert.ok(analysis.hasInfo, 'PDF must declare metadata /Title /Author');
      assert.equal(analysis.pageCount, 1, 'Standard rental agreement must be formatted on exactly 1 page');
    });

    const normalizedTextNoSpace = analysis.allRawTokens.join('').replace(/\s+/g, '');
    const allTokensMerged = analysis.allRawTokens.join(' ');

    await t2.test('2.3 Statutory Clause 1: KUHPerdata Article 1320 is explicitly embedded', () => {
      assert.ok(
        normalizedTextNoSpace.includes('1320') && normalizedTextNoSpace.includes('KUHPerdata'),
        'Decompressed PDF text must cite Pasal 1320 KUHPerdata'
      );
    });

    await t2.test('2.4 Statutory Clause 2: UU ITE No. 11/2008 jo. UU No. 1/2024 is explicitly embedded', () => {
      assert.ok(
        normalizedTextNoSpace.includes('UUITE') || (normalizedTextNoSpace.includes('11/2008') && normalizedTextNoSpace.includes('1/2024')),
        'Decompressed PDF text must cite UU ITE electronic contract law'
      );
    });

    await t2.test('2.5 Statutory Clause 3: Dispute jurisdiction (Pengadilan Negeri Denpasar / Badung) is embedded', () => {
      assert.ok(
        normalizedTextNoSpace.includes('Denpasar') || normalizedTextNoSpace.includes('Badung'),
        'Decompressed PDF text must cite Pengadilan Negeri Denpasar / Badung jurisdiction'
      );
    });

    await t2.test('2.6 Statutory Clause 4: Single Active Tenancy covenant is embedded', () => {
      assert.ok(
        normalizedTextNoSpace.includes('SingleActiveTenancy') ||
        normalizedTextNoSpace.includes('SewaAktifTunggal') ||
        normalizedTextNoSpace.includes('LaranganSewaGanda') ||
        normalizedTextNoSpace.includes('SewaAktif'),
        'Decompressed PDF text must cite Single Active Tenancy covenant'
      );
    });

    await t2.test('2.7 Financial Item: Flat Rp 5,000 platform admin fee line item is embedded', () => {
      assert.ok(
        allTokensMerged.includes('5.000') || allTokensMerged.includes('5000'),
        'Decompressed PDF text must show flat Rp 5.000 admin fee'
      );
    });

    await t2.test('2.8 Utility Quotas: Token listrik, PDAM air, 100 Mbps WiFi are embedded', () => {
      assert.ok(
        allTokensMerged.includes('250 kWh') || allTokensMerged.includes('Listrik'),
        'Decompressed PDF text must show electricity allowance'
      );
      assert.ok(
        allTokensMerged.includes('PDAM') || allTokensMerged.includes('Air Bersih'),
        'Decompressed PDF text must show water utility terms'
      );
      assert.ok(
        allTokensMerged.includes('100 Mbps') || allTokensMerged.includes('100Mbps') || allTokensMerged.includes('WiFi'),
        'Decompressed PDF text must show 100 Mbps WiFi'
      );
    });

    await t2.test('2.9 Digital Audit Trail: IP, User-Agent, UTC & WITA timestamps are embedded', () => {
      assert.ok(
        allTokensMerged.includes('180.252.164.88'),
        'Decompressed PDF text must contain signer remote IP'
      );
      assert.ok(
        allTokensMerged.includes('WITA') && allTokensMerged.includes('UTC'),
        'Decompressed PDF text must contain both WITA and UTC signing timestamps'
      );
    });
  });

  // =========================================================================
  // CHALLENGE 3: Adversarial Input & Injection Stress-Testing
  // =========================================================================
  await t.test('CHALLENGE 3: Adversarial Input & Injection Stress-Testing', async (t3) => {
    await t3.test('3.1 XSS and HTML tags in strings are rendered safely without crashing PDF engine', async () => {
      const maliciousData: RentalContractData = {
        ...sampleContractData,
        rentalId: 'rent-xss-001',
        tenantName: '<script>alert("XSS")</script>',
        propertyName: '<img src=x onerror=alert(document.cookie)> Deluxe Villa',
        propertyAddress: '"><svg onload=alert(1)> Jl. Sunset',
        landlordName: 'Landlord <iframe src="evil.com"></iframe>'
      };

      const buffer = await generateRentalContractBuffer(maliciousData);
      assert.ok(Buffer.isBuffer(buffer));
      const analysis = parseAndDecompressPdf(buffer);
      assert.ok(analysis.decompressedStreamCount > 0);
    });

    await t3.test('3.2 Directory traversal attacks in rentalId are strictly sanitized', () => {
      const traversalVectors = [
        '../../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
        '/var/run/secrets/kubernetes.io',
        'C:\\Program Files\\app',
        'contract; rm -rf /',
        '../../../uploads/overwrite.pdf'
      ];

      for (const vec of traversalVectors) {
        const sanitized = sanitizeRentalId(vec);
        assert.ok(!sanitized.includes('/'), `Must not contain forward slash: ${sanitized}`);
        assert.ok(!sanitized.includes('\\'), `Must not contain backslash: ${sanitized}`);
        assert.ok(!sanitized.includes('..'), `Must not contain parent dir: ${sanitized}`);
        assert.ok(/^[a-zA-Z0-9_-]+$/.test(sanitized), `Must only contain alphanumeric, dash, underscore: ${sanitized}`);
      }
    });

    await t3.test('3.3 Corrupted, non-PNG, or truncated base64 signatures fallback safely to verified stamp', async () => {
      const edgeSignatures = [
        'data:image/png;base64,not-base64-at-all!!',
        'data:image/jpeg;base64,SGVsbG8gV29ybGQ=', // Valid base64 but not image
        'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        'data:image/png;base64,',
        'data:image/png;base64,AAA',
        'data:image/png;base64,' + 'A'.repeat(50000), // Huge corrupted base64
        '',
        undefined
      ];

      for (const sig of edgeSignatures) {
        const buffer = await generateRentalContractBuffer({
          ...sampleContractData,
          signatureBase64: sig
        });
        assert.ok(Buffer.isBuffer(buffer));
        assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
      }
    });

    await t3.test('3.4 Unicode / International characters do not crash font rendering', async () => {
      const internationalData: RentalContractData = {
        ...sampleContractData,
        tenantName: 'Björn Åkesson & René François',
        propertyName: 'Villa “Dewata” Canggu #7 — Bali Paradise'
      };

      const buffer = await generateRentalContractBuffer(internationalData);
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
    });

    await t3.test('3.5 Invalid or extreme dates fallback gracefully to UTC/WITA now', async () => {
      const invalidDateData: RentalContractData = {
        ...sampleContractData,
        signedAt: 'invalid-date-string-xyz'
      };

      const buffer = await generateRentalContractBuffer(invalidDateData);
      assert.ok(Buffer.isBuffer(buffer));
      const analysis = parseAndDecompressPdf(buffer);
      const text = analysis.allRawTokens.join(' ');
      assert.ok(text.includes('UTC') && text.includes('WITA'), 'Fallback must produce valid UTC and WITA timestamps');
    });

    await t3.test('3.6 Numerical edge cases (zero values, decimals, missing optional quotas)', async () => {
      const edgeNumData: RentalContractData = {
        propertyName: 'Zero Fee Unit',
        tenantName: 'Budget Tenant',
        tenantEmail: 'budget@test.com',
        startDate: '2026-09-01',
        durationMonths: 1,
        monthlyPrice: 0,
        adminFee: 0,
        totalPrice: 0,
        utilityQuotas: undefined
      };

      const buffer = await generateRentalContractBuffer(edgeNumData);
      assert.ok(Buffer.isBuffer(buffer));
      const hash = computeContractHash(buffer);
      assert.equal(hash.length, 64);
    });

    await t3.test('3.7 Corrupted PNG with valid base64 length (>30 bytes) does not crash via doc.image', async () => {
      // 50 random bytes starting with data:image/png;base64, (not a valid PNG header)
      const fakePngBase64 = 'data:image/png;base64,' + crypto.randomBytes(45).toString('base64');
      const buffer = await generateRentalContractBuffer({
        ...sampleContractData,
        signatureBase64: fakePngBase64
      });
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
    });

    await t3.test('3.8 Massive string payloads (10,000 chars) are handled without crashing', async () => {
      const hugeData: RentalContractData = {
        ...sampleContractData,
        propertyName: 'A'.repeat(5000),
        propertyAddress: 'B'.repeat(5000),
        tenantName: 'C'.repeat(5000),
        signerUserAgent: 'D'.repeat(5000)
      };

      const buffer = await generateRentalContractBuffer(hugeData);
      assert.ok(Buffer.isBuffer(buffer));
      assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
    });

    await t3.test('3.9 Multilingual scripts & Emoji inputs do not cause unhandled stream rejections', async () => {
      const multilingualData: RentalContractData = {
        ...sampleContractData,
        tenantName: '山田 太郎 / Ahmed Al-Mansoor / ᬩᬵᬮᬶ / 🚀✨',
        propertyName: 'Villa 🌟 Bintang Canggu 🏖️'
      };

      // Ensure that even if characters fall outside standard font encoding, generation resolves cleanly
      try {
        const buffer = await generateRentalContractBuffer(multilingualData);
        assert.ok(Buffer.isBuffer(buffer));
      } catch (err: unknown) {
        // If PDFKit throws encoding error on emoji, it should reject promise rather than unhandled crash
        assert.ok(err instanceof Error);
      }
    });
  });

  // =========================================================================
  // CHALLENGE 4: Concurrency, Memory Stress & Hash Determinism Under Load
  // =========================================================================
  await t.test('CHALLENGE 4: Concurrency & Memory Stress (100 Parallel In-Memory Contracts)', async (t4) => {
    const memBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    const tasks = Array.from({ length: 100 }, (_, idx) => {
      return generateRentalContractBuffer({
        ...sampleContractData,
        rentalId: `concurrent-stress-${idx}`,
        tenantName: `Tenant Parallel ${idx}`,
        monthlyPrice: 3000000 + (idx * 50000)
      });
    });

    const buffers = await Promise.all(tasks);
    const duration = Date.now() - startTime;
    const memAfter = process.memoryUsage().heapUsed;

    assert.equal(buffers.length, 100, 'All 100 concurrent contracts must resolve');

    // Verify all 100 buffers are valid distinct PDFs
    const hashes = new Set<string>();
    for (let i = 0; i < buffers.length; i++) {
      const buf = buffers[i];
      assert.ok(Buffer.isBuffer(buf));
      assert.equal(buf.subarray(0, 4).toString('ascii'), '%PDF');
      const hash = computeContractHash(buf);
      hashes.add(hash);
    }

    assert.equal(hashes.size, 100, 'All 100 contracts must have distinct cryptographic hashes (no stream cross-talk)');
    
    // Performance assertion: 100 in-memory PDFs generated in under 8 seconds
    assert.ok(duration < 8000, `100 PDF generation took ${duration}ms, must be < 8000ms`);
  });

  // =========================================================================
  // CHALLENGE 5: Cloudinary Stream Direct Buffer Pipeline & Error Boundaries
  // =========================================================================
  await t.test('CHALLENGE 5: Cloudinary Stream Direct Buffer Pipeline & Error Boundaries', async (t5) => {
    await t5.test('5.1 generateAndUploadContract produces valid result with matching hash and CDN URL', async () => {
      const result = await generateAndUploadContract(sampleContractData);

      assert.ok(result);
      assert.ok(Buffer.isBuffer(result.pdfBuffer));
      assert.equal(result.contractHash, computeContractHash(result.pdfBuffer));
      assert.ok(result.cloudinaryUrl?.includes('kosmo_contracts/contract_rent-audit-999.pdf'));
    });

    await t5.test('5.2 uploadContractStream rejects non-buffer or zero-length buffer inputs', async () => {
      await assert.rejects(
        // @ts-expect-error testing invalid type
        () => uploadContractStream('not a buffer', 'test.pdf'),
        /Contract buffer cannot be empty/
      );
      await assert.rejects(
        () => uploadContractStream(Buffer.alloc(0), 'empty.pdf'),
        /Contract buffer cannot be empty/
      );
    });

    await t5.test('5.3 uploadContractStream sanitizes malicious filename with directory traversal', async () => {
      const testBuffer = Buffer.from('%PDF-1.4 test contract binary buffer');
      const uploadRes = await uploadContractStream(
        testBuffer,
        '../../../../windows/system32/malicious.pdf',
        'kosmo_contracts'
      );

      assert.ok(!uploadRes.public_id.includes('..'));
      assert.ok(!uploadRes.public_id.includes('/windows/system32'));
      assert.ok(uploadRes.public_id.includes('kosmo_contracts/'));
    });

    await t5.test('5.4 isCloudinaryConfigured returns deterministic boolean without throwing', () => {
      const isConfigured = isCloudinaryConfigured();
      assert.equal(typeof isConfigured, 'boolean');
    });
  });
});
