import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  validateBody,
  loginSchema,
  registerSchema,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  updateProfileSchema,
  propertySchema,
  withdrawalSchema,
  reviewSchema,
  previewContractSchema,
  signContractSchema
} from '../backend/middleware/validation';
import { isUserProfileComplete } from '../backend/types/index';
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

  await t.test('signContractSchema rejects empty, malformed, or oversized digital signatures (> 1MB)', () => {
    const base = {
      propertyId: 'prop-01',
      durationMonths: 1,
      startDate: '2026-09-01',
      tenantNikPassport: '5171012308980001',
      affirmativeConsent: true
    };

    assert.equal(signContractSchema.safeParse({ ...base, signatureBase64: '' }).success, false);
    assert.equal(signContractSchema.safeParse({ ...base, signatureBase64: 'short' }).success, false);

    // Oversized signature payload > 1MB
    const oversizedSig = 'data:image/png;base64,' + 'A'.repeat(1_000_100);
    const oversizedResult = signContractSchema.safeParse({ ...base, signatureBase64: oversizedSig });
    assert.equal(oversizedResult.success, false);
  });

  await t.test('registerSchema strictly requires valid phone number', () => {
    const valid = registerSchema.safeParse({
      name: 'Budi Santoso',
      email: 'budi@example.com',
      password: 'password123',
      phone: '08123456789'
    });
    assert.equal(valid.success, true);

    const missingPhone = registerSchema.safeParse({
      name: 'Budi Santoso',
      email: 'budi@example.com',
      password: 'password123'
    });
    assert.equal(missingPhone.success, false);

    const shortPhone = registerSchema.safeParse({
      name: 'Budi Santoso',
      email: 'budi@example.com',
      password: 'password123',
      phone: '12345'
    });
    assert.equal(shortPhone.success, false);
  });

  await t.test('updateProfileSchema validates legal identity and KYC fields', () => {
    const valid = updateProfileSchema.safeParse({
      name: 'Bayu Wipradnyana',
      phone: '+6281234567890',
      identity_type: 'NIK',
      identity_number: '5171012308980001',
      address: 'Jl. Teuku Umar No. 88, Denpasar, Bali',
      occupation: 'Software Engineer',
      emergency_contact_name: 'Made Wipradnyana',
      emergency_contact_relation: 'Orang Tua',
      emergency_contact_phone: '+6281234567899'
    });
    assert.equal(valid.success, true);

    const invalidNik = updateProfileSchema.safeParse({
      identity_number: '123'
    });
    assert.equal(invalidNik.success, false);
  });

  await t.test('isUserProfileComplete evaluates KYC profile requirements according to statutory standards', () => {
    const completeUser = {
      id: 'user-01',
      email: 'bayu@example.com',
      name: 'Bayu Wipradnyana',
      role: 'tenant' as const,
      phone: '081234567890',
      identity_type: 'NIK' as const,
      identity_number: '5171012308980001',
      address: 'Jl. Teuku Umar No. 88, Denpasar, Bali',
      occupation: 'Software Engineer',
      emergency_contact_name: 'Made Wipradnyana',
      emergency_contact_phone: '081234567899'
    };

    const completeResult = isUserProfileComplete(completeUser);
    assert.equal(completeResult.complete, true);
    assert.equal(completeResult.missingFields.length, 0);

    const incompleteUser = {
      ...completeUser,
      address: '',
      emergency_contact_phone: ''
    };

    const incompleteResult = isUserProfileComplete(incompleteUser);
    assert.equal(incompleteResult.complete, false);
    assert.ok(incompleteResult.missingFields.includes('address'));
    assert.ok(incompleteResult.missingFields.includes('emergency_contact_phone'));
  });

  await t.test('adminCreateUserSchema validates full user creation by administrator', () => {
    const valid = adminCreateUserSchema.safeParse({
      name: 'Admin User',
      email: 'newadmin@kosmo.id',
      password: 'password123',
      role: 'admin',
      phone: '08123456789',
      paymentMethod: 'Bank Transfer'
    });
    assert.equal(valid.success, true);

    const validLandlordWithoutPhone = adminCreateUserSchema.safeParse({
      name: 'Landlord User',
      email: 'landlord@kosmo.id',
      password: 'password123',
      role: 'landlord',
      phone: '',
      paymentMethod: ''
    });
    assert.equal(validLandlordWithoutPhone.success, true);

    const invalidRole = adminCreateUserSchema.safeParse({
      name: 'Invalid Role User',
      email: 'test@kosmo.id',
      password: 'password123',
      role: 'superman'
    });
    assert.equal(invalidRole.success, false);
  });

  await t.test('adminUpdateUserSchema allows partial updates and optional password', () => {
    const valid = adminUpdateUserSchema.safeParse({
      name: 'Updated Name',
      role: 'landlord',
      phone: '081999888777'
    });
    assert.equal(valid.success, true);

    const validWithEmptyPassword = adminUpdateUserSchema.safeParse({
      password: ''
    });
    assert.equal(validWithEmptyPassword.success, true);
  });
});
