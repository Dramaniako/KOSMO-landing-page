import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  validateBody,
  loginSchema,
  registerSchema,
  propertySchema,
  withdrawalSchema,
  reviewSchema,
  previewContractSchema,
  signContractSchema
} from '../backend/middleware/validation';
import type { Request, Response, NextFunction } from 'express';

test('Zod request body validation middleware & schemas', async (t) => {
  await t.test('validateBody middleware invokes next() on valid schema payload', () => {
    let nextCalled = false;
    const testSchema = z.object({
      title: z.string().min(1),
      count: z.number().int().positive()
    });

    const mockReq = {
      body: {
        title: 'Valid Title',
        count: 5
      }
    } as unknown as Request;

    const mockRes = {
      status: () => mockRes,
      json: () => mockRes
    } as unknown as Response;

    const mockNext: NextFunction = () => {
      nextCalled = true;
    };

    const middleware = validateBody(testSchema);
    middleware(mockReq, mockRes, mockNext);

    assert.equal(nextCalled, true);
  });

  await t.test('validateBody middleware returns 400 and structured error on invalid payload', () => {
    let nextCalled = false;
    let statusCode = 0;
    let responseBody: { message?: string; errors?: unknown } | null = null;

    const testSchema = z.object({
      email: z.string().email('Invalid email address')
    });

    const mockReq = {
      body: {
        email: 'invalid-email-string'
      }
    } as unknown as Request;

    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: { message?: string; errors?: unknown }) => {
        responseBody = data;
        return mockRes;
      }
    } as unknown as Response;

    const mockNext: NextFunction = () => {
      nextCalled = true;
    };

    const middleware = validateBody(testSchema);
    middleware(mockReq, mockRes, mockNext);

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 400);
    assert.ok(responseBody);
    assert.equal(responseBody.message, 'Invalid email address');
    assert.ok(responseBody.errors);
  });

  await t.test('loginSchema validates properly and catches edge cases', () => {
    const valid = loginSchema.safeParse({
      email: 'tenant@kosmo.id',
      password: 'password123'
    });
    assert.equal(valid.success, true);

    const missingPassword = loginSchema.safeParse({
      email: 'tenant@kosmo.id'
    });
    assert.equal(missingPassword.success, false);

    const emptyEmail = loginSchema.safeParse({
      email: '',
      password: 'password123'
    });
    assert.equal(emptyEmail.success, false);
  });

  await t.test('registerSchema rejects invalid email or short password', () => {
    const valid = registerSchema.safeParse({
      name: 'Andi Pratama',
      email: 'andi@kosmo.id',
      password: 'securePassword99',
      phone: '+628987654321'
    });
    assert.equal(valid.success, true);

    const shortPass = registerSchema.safeParse({
      name: 'Andi Pratama',
      email: 'andi@kosmo.id',
      password: '123'
    });
    assert.equal(shortPass.success, false);

    const emptyName = registerSchema.safeParse({
      name: '',
      email: 'andi@kosmo.id',
      password: 'securePassword99'
    });
    assert.equal(emptyName.success, false);
  });

  await t.test('propertySchema enforces positive price and positive integer room count', () => {
    const valid = propertySchema.safeParse({
      name: 'KOSMO Sunset Deluxe',
      district: 'Badung',
      address: 'Jl. Sunset No. 10',
      price: 2500000,
      totalRooms: 8,
      ownerId: 'landlord-10'
    });
    assert.equal(valid.success, true);

    const zeroRooms = propertySchema.safeParse({
      name: 'KOSMO Sunset Deluxe',
      district: 'Badung',
      address: 'Jl. Sunset No. 10',
      price: 2500000,
      totalRooms: 0,
      ownerId: 'landlord-10'
    });
    assert.equal(zeroRooms.success, false);

    const nonIntegerRooms = propertySchema.safeParse({
      name: 'KOSMO Sunset Deluxe',
      district: 'Badung',
      address: 'Jl. Sunset No. 10',
      price: 2500000,
      totalRooms: 4.5,
      ownerId: 'landlord-10'
    });
    assert.equal(nonIntegerRooms.success, false);

    const zeroPrice = propertySchema.safeParse({
      name: 'KOSMO Sunset Deluxe',
      district: 'Badung',
      address: 'Jl. Sunset No. 10',
      price: 0,
      totalRooms: 5,
      ownerId: 'landlord-10'
    });
    assert.equal(zeroPrice.success, false);
  });

  await t.test('withdrawalSchema validates positive amount and required banking details', () => {
    const valid = withdrawalSchema.safeParse({
      amount: 1500000,
      bankName: 'BCA',
      accountNumber: '1234567890',
      accountHolder: 'Budi Santoso'
    });
    assert.equal(valid.success, true);

    const negativeAmount = withdrawalSchema.safeParse({
      amount: -500000,
      bankName: 'BCA',
      accountNumber: '1234567890'
    });
    assert.equal(negativeAmount.success, false);

    const missingBank = withdrawalSchema.safeParse({
      amount: 500000,
      bankName: '',
      accountNumber: '1234567890'
    });
    assert.equal(missingBank.success, false);
  });

  await t.test('reviewSchema validates rating between 1 and 5 and non-empty comments', () => {
    const valid = reviewSchema.safeParse({
      propertyId: 'prop-101',
      comment: 'Tempat kos sangat nyaman dan bersih!',
      rating: 5
    });
    assert.equal(valid.success, true);

    const outOfBoundsRating = reviewSchema.safeParse({
      propertyId: 'prop-101',
      comment: 'Bagus',
      rating: 6
    });
    assert.equal(outOfBoundsRating.success, false);

    const emptyComment = reviewSchema.safeParse({
      propertyId: 'prop-101',
      comment: '',
      rating: 4
    });
    assert.equal(emptyComment.success, false);
  });

  await t.test('previewContractSchema allows minimal valid payload with defaults', () => {
    const result = previewContractSchema.safeParse({
      propertyId: 'prop-01'
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.durationMonths, 1);
    }
  });

  await t.test('previewContractSchema validates full optional draft data', () => {
    const result = previewContractSchema.safeParse({
      propertyId: 'prop-01',
      durationMonths: 6,
      startDate: '2026-09-01',
      tenantNikPassport: '5171012308980001',
      signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    });
    assert.equal(result.success, true);
  });

  await t.test('previewContractSchema rejects empty propertyId or invalid duration', () => {
    assert.equal(previewContractSchema.safeParse({ propertyId: '' }).success, false);
    assert.equal(previewContractSchema.safeParse({ propertyId: 'prop-01', durationMonths: 0 }).success, false);
    assert.equal(previewContractSchema.safeParse({ propertyId: 'prop-01', durationMonths: -3 }).success, false);
    assert.equal(previewContractSchema.safeParse({ propertyId: 'prop-01', durationMonths: 2.5 }).success, false);
  });

  await t.test('signContractSchema accepts valid Indonesian 16-digit NIK', () => {
    const valid = signContractSchema.safeParse({
      propertyId: 'prop-01',
      durationMonths: 3,
      startDate: '2026-09-01',
      tenantNikPassport: '3201012804900002',
      signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      affirmativeConsent: true
    });
    assert.equal(valid.success, true);
  });

  await t.test('signContractSchema accepts valid International Passport numbers', () => {
    const validPassports = ['A1234567', 'B98765432', 'PA0123456', 'K12345678901'];
    for (const passport of validPassports) {
      const result = signContractSchema.safeParse({
        propertyId: 'prop-01',
        durationMonths: 1,
        startDate: '2026-09-01',
        tenantNikPassport: passport,
        signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        affirmativeConsent: true
      });
      assert.equal(result.success, true, `Passport ${passport} should be valid`);
    }
  });

  await t.test('signContractSchema rejects invalid NIK lengths and illegal characters', () => {
    const invalidNiks = [
      '320101280490000',     // 15 digits
      '32010128049000021',   // 17 digits
      '320101280490000A',   // 16 chars but contains letter
      '12345',              // 5 chars
      'PASS@1234'           // Special chars
    ];
    for (const nik of invalidNiks) {
      const result = signContractSchema.safeParse({
        propertyId: 'prop-01',
        durationMonths: 1,
        startDate: '2026-09-01',
        tenantNikPassport: nik,
        signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        affirmativeConsent: true
      });
      assert.equal(result.success, false, `NIK/Passport ${nik} should be rejected`);
    }
  });

  await t.test('signContractSchema strictly requires affirmativeConsent to be true', () => {
    const base = {
      propertyId: 'prop-01',
      durationMonths: 1,
      startDate: '2026-09-01',
      tenantNikPassport: '5171012308980001',
      signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    };

    assert.equal(signContractSchema.safeParse({ ...base, affirmativeConsent: false }).success, false);
    assert.equal(signContractSchema.safeParse({ ...base, affirmativeConsent: undefined }).success, false);
    assert.equal(signContractSchema.safeParse({ ...base, affirmativeConsent: null }).success, false);
    assert.equal(signContractSchema.safeParse({ ...base, affirmativeConsent: 'true' }).success, false);
  });

  await t.test('signContractSchema rejects empty or malformed digital signatures', () => {
    const base = {
      propertyId: 'prop-01',
      durationMonths: 1,
      startDate: '2026-09-01',
      tenantNikPassport: '5171012308980001',
      affirmativeConsent: true
    };

    assert.equal(signContractSchema.safeParse({ ...base, signatureBase64: '' }).success, false);
    assert.equal(signContractSchema.safeParse({ ...base, signatureBase64: 'short' }).success, false);
  });
});
