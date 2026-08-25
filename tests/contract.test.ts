import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { generateRentalContractPdf, sanitizeRentalId } from '../backend/services/contract';
import type { RentalContractData } from '../backend/services/contract';

test('PDF Rental Contract Generator', async (t) => {
  const testOutputDir = path.join(process.cwd(), 'tests', 'temp_contracts');

  t.after(() => {
    try {
      if (fs.existsSync(testOutputDir)) {
        fs.rmSync(testOutputDir, { recursive: true, force: true });
      }
    } catch {}
  });

  const baseRentalData: RentalContractData = {
    rentalId: 'rent-test-001',
    tenantName: 'Bayu Wipradnyana',
    tenantEmail: 'bayu@kosmo.id',
    tenantPhone: '+6281234567890',
    propertyName: 'KOSMO Hub Seminyak Deluxe',
    propertyAddress: 'Jl. Kayu Aya No. 18, Seminyak, Bali',
    pricePerMonth: 3500000,
    startDate: '16 Agu 2026',
    durationMonths: 6
  };

  await t.test('generates valid PDF buffer with %PDF magic header', async () => {
    const result = await generateRentalContractPdf(baseRentalData, testOutputDir);

    assert.ok(Buffer.isBuffer(result.buffer), 'Result buffer should be a Node.js Buffer');
    assert.ok(result.buffer.length > 500, 'PDF buffer should have reasonable size');
    
    // Check %PDF header
    const pdfHeader = result.buffer.subarray(0, 4).toString('ascii');
    assert.equal(pdfHeader, '%PDF', 'PDF buffer must start with %PDF magic header');

    assert.equal(result.fileName, 'contract_rent-test-001.pdf');
    assert.equal(result.filePath, '/uploads/contract_rent-test-001.pdf');
  });

  await t.test('embeds valid base64 e-signature image into PDF without error', async () => {
    // 1x1 transparent PNG base64 sample
    const sampleSignaturePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const signedRentalData: RentalContractData = {
      ...baseRentalData,
      rentalId: 'rent-test-signed-002',
      signatureBase64: sampleSignaturePng
    };

    const result = await generateRentalContractPdf(signedRentalData, testOutputDir);

    assert.ok(Buffer.isBuffer(result.buffer));
    assert.equal(result.buffer.subarray(0, 4).toString('ascii'), '%PDF');
    assert.equal(result.fileName, 'contract_rent-test-signed-002.pdf');
  });

  await t.test('gracefully handles missing or invalid e-signature data', async () => {
    const unsignedData: RentalContractData = {
      ...baseRentalData,
      rentalId: 'rent-test-unsigned-003',
      signatureBase64: ''
    };

    const result = await generateRentalContractPdf(unsignedData, testOutputDir);

    assert.ok(Buffer.isBuffer(result.buffer));
    assert.equal(result.buffer.subarray(0, 4).toString('ascii'), '%PDF');
  });

  await t.test('sanitizeRentalId strips path traversal sequences and invalid characters', () => {
    assert.equal(sanitizeRentalId('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeRentalId('..\\..\\windows\\system32\\malicious'), 'malicious');
    assert.equal(sanitizeRentalId('rent-123_abc'), 'rent-123_abc');
    assert.equal(sanitizeRentalId('../../../evil.sh'), 'evilsh');
    assert.equal(sanitizeRentalId(''), 'contract');
    assert.equal(sanitizeRentalId('   '), 'contract');
    assert.equal(sanitizeRentalId('!@#$%^&*()'), 'contract');
  });

  await t.test('generateRentalContractPdf neutralizes directory traversal in rentalId', async () => {
    const maliciousRentalData: RentalContractData = {
      ...baseRentalData,
      rentalId: '../../../../traversal_attempt_test'
    };

    const result = await generateRentalContractPdf(maliciousRentalData, testOutputDir);

    assert.ok(Buffer.isBuffer(result.buffer));
    assert.equal(result.fileName, 'contract_traversal_attempt_test.pdf');
    assert.equal(result.filePath, '/uploads/contract_traversal_attempt_test.pdf');
    
    // Ensure the generated file exists strictly inside testOutputDir
    const expectedFilePath = path.join(path.resolve(testOutputDir), 'contract_traversal_attempt_test.pdf');
    assert.equal(fs.existsSync(expectedFilePath), true);
  });
});
