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
  signContractSchema,
  terminateRentalSchema,
  propertyUpdateSchema,
  reviewUpdateSchema,
  verifyPasswordSchema,
  processWithdrawalSchema,
  rejectWithdrawalSchema,
  createRentalSchema,
  sanitizeText,
  createPaymentTokenSchema,
  paymentNotificationSchema,
  visitorTrackingSchema
} from '../backend/middleware/validation';
import { isUserProfileComplete } from '../backend/types/index';
import { shouldSkipRateLimit } from '../backend/middleware/rateLimiter';
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

  await t.test('validateBody properly mutates req.body to match sanitized and transformed data', () => {
    // 1. XSS Tag Sanitization on req.body
    let nextCalled = false;
    const mockReqXss = {
      body: {
        propertyId: 'prop-101',
        comment: '<script>alert("XSS")</script>Kos sangat bersih dan nyaman!',
        rating: 5
      }
    } as unknown as Request;

    const mockRes = {
      status: () => mockRes,
      json: () => mockRes
    } as unknown as Response;

    const middlewareXss = validateBody(reviewSchema);
    middlewareXss(mockReqXss, mockRes, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(
      mockReqXss.body.comment,
      'Kos sangat bersih dan nyaman!',
      'validateBody must mutate req.body.comment to strip script tags via sanitizeText'
    );
    assert.ok(!mockReqXss.body.comment.includes('<script>'));

    // 2. Default Value Population on req.body
    let nextCalledDefaults = false;
    const mockReqDefaults = {
      body: {
        propertyId: 'prop-101'
      }
    } as unknown as Request;

    const middlewareDefaults = validateBody(previewContractSchema);
    middlewareDefaults(mockReqDefaults, mockRes, () => {
      nextCalledDefaults = true;
    });

    assert.equal(nextCalledDefaults, true);
    assert.equal(
      mockReqDefaults.body.durationMonths,
      1,
      'validateBody must populate default values (durationMonths = 1) onto req.body'
    );

    // 3. Unrecognized Key Stripping (Mass-Assignment Protection)
    let nextCalledPruning = false;
    const mockReqExtra = {
      body: {
        email: 'tenant@kosmo.id',
        password: 'password123',
        injectedRole: 'admin',
        injectedBalance: 10000000
      }
    } as unknown as Request;

    const middlewareLogin = validateBody(loginSchema);
    middlewareLogin(mockReqExtra, mockRes, () => {
      nextCalledPruning = true;
    });

    assert.equal(nextCalledPruning, true);
    assert.equal(mockReqExtra.body.email, 'tenant@kosmo.id');
    assert.equal(mockReqExtra.body.password, 'password123');
    assert.equal(
      (mockReqExtra.body as Record<string, unknown>).injectedRole,
      undefined,
      'validateBody must strip unknown fields to prevent mass assignment'
    );
    assert.equal(
      (mockReqExtra.body as Record<string, unknown>).injectedBalance,
      undefined,
      'validateBody must strip unknown fields to prevent mass assignment'
    );

    // 4. Passthrough Schema Field Preservation
    let nextCalledPassthrough = false;
    const mockReqWebhook = {
      body: {
        order_id: 'rent-101',
        status_code: '200',
        gross_amount: '3500000.00',
        signature_key: 'abc123sha512',
        va_numbers: [{ bank: 'bca', va_number: '12345678' }],
        custom_midtrans_meta: 'gateway_metadata'
      }
    } as unknown as Request;

    const middlewareWebhook = validateBody(paymentNotificationSchema);
    middlewareWebhook(mockReqWebhook, mockRes, () => {
      nextCalledPassthrough = true;
    });

    assert.equal(nextCalledPassthrough, true);
    assert.deepEqual(
      (mockReqWebhook.body as Record<string, unknown>).va_numbers,
      [{ bank: 'bca', va_number: '12345678' }],
      'validateBody must preserve passthrough fields on paymentNotificationSchema'
    );
    assert.equal(
      (mockReqWebhook.body as Record<string, unknown>).custom_midtrans_meta,
      'gateway_metadata'
    );
  });

  await t.test('propertySchema passthrough preserves additional creation fields', () => {
    const rawData = {
      name: 'Kos Canggu Modern',
      district: 'Badung',
      address: 'Jl. Pantai Batu Bolong No. 10',
      price: 4500000,
      totalRooms: 10,
      description: 'Kos eksklusif dekat pantai',
      facilities: ['WiFi 100 Mbps', 'AC', 'Water Heater'],
      latitude: -8.6500,
      longitude: 115.1300,
      image: 'https://res.cloudinary.com/demo/image/upload/sample.webp'
    };
    const parsed = propertySchema.safeParse(rawData);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal((parsed.data as Record<string, unknown>).description, 'Kos eksklusif dekat pantai');
      assert.deepEqual((parsed.data as Record<string, unknown>).facilities, ['WiFi 100 Mbps', 'AC', 'Water Heater']);
      assert.equal((parsed.data as Record<string, unknown>).latitude, -8.6500);
      assert.equal((parsed.data as Record<string, unknown>).longitude, 115.1300);
      assert.equal((parsed.data as Record<string, unknown>).image, 'https://res.cloudinary.com/demo/image/upload/sample.webp');
    }
  });

  await t.test('Rate Limiter Bypass Security: shouldSkipRateLimit guardrails', () => {
    const env = process.env as Record<string, string | undefined>;
    const originalNodeEnv = env.NODE_ENV;
    const originalNoListen = env.NO_LISTEN;
    const originalSecret = env.RATE_LIMIT_BYPASS_SECRET;

    try {
      // 1. Production Mode: Reject x-test-bypass: true
      env.NODE_ENV = 'production';
      delete env.NO_LISTEN;
      delete env.RATE_LIMIT_BYPASS_SECRET;

      const reqBypassTrue = { headers: { 'x-test-bypass': 'true' } } as unknown as Request;
      assert.equal(
        shouldSkipRateLimit(reqBypassTrue),
        false,
        'shouldSkipRateLimit must strictly reject x-test-bypass: true in production'
      );

      // 2. Production Mode: Reject x-bypass-rate-limit: true
      const reqBypassAlt = { headers: { 'x-bypass-rate-limit': 'true' } } as unknown as Request;
      assert.equal(
        shouldSkipRateLimit(reqBypassAlt),
        false,
        'shouldSkipRateLimit must strictly reject x-bypass-rate-limit: true in production'
      );

      // 3. Production Mode: Reject array header
      const reqBypassArray = { headers: { 'x-test-bypass': ['true'] } } as unknown as Request;
      assert.equal(
        shouldSkipRateLimit(reqBypassArray),
        false,
        'shouldSkipRateLimit must reject array header in production'
      );

      // 4. Production Mode: Reject normal request
      const reqNormal = { headers: {} } as unknown as Request;
      assert.equal(
        shouldSkipRateLimit(reqNormal),
        false,
        'shouldSkipRateLimit must reject unauthenticated request in production'
      );

      // 5. Test Environment Safety: Bypasses when NODE_ENV === "test"
      env.NODE_ENV = 'test';
      delete env.NO_LISTEN;
      assert.equal(
        shouldSkipRateLimit(reqNormal),
        true,
        'shouldSkipRateLimit must allow bypass when NODE_ENV === "test" to prevent test suite false-failures'
      );

      // 6. Test Environment Safety: Bypasses when NO_LISTEN === "true"
      env.NODE_ENV = 'production';
      env.NO_LISTEN = 'true';
      assert.equal(
        shouldSkipRateLimit(reqNormal),
        true,
        'shouldSkipRateLimit must allow bypass when NO_LISTEN === "true"'
      );

      // 7. Development Environment: Allows "true" bypass without secret
      env.NODE_ENV = 'development';
      delete env.NO_LISTEN;
      assert.equal(
        shouldSkipRateLimit(reqBypassTrue),
        true,
        'shouldSkipRateLimit permits x-test-bypass: true in development mode'
      );

      // 8. Development Environment: Allows secret match
      env.RATE_LIMIT_BYPASS_SECRET = 'dev-secret-token';
      const reqSecretMatch = { headers: { 'x-test-bypass': 'dev-secret-token' } } as unknown as Request;
      assert.equal(
        shouldSkipRateLimit(reqSecretMatch),
        true,
        'shouldSkipRateLimit permits valid bypass secret in development mode'
      );
      const reqSecretMismatch = { headers: { 'x-test-bypass': 'wrong-token' } } as unknown as Request;
      assert.equal(
        shouldSkipRateLimit(reqSecretMismatch),
        false,
        'shouldSkipRateLimit rejects invalid bypass secret in development mode'
      );
    } finally {
      env.NODE_ENV = originalNodeEnv;
      env.NO_LISTEN = originalNoListen;
      env.RATE_LIMIT_BYPASS_SECRET = originalSecret;
    }
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

    // Verify MySQL TINYINT(1) number and string representation normalization for notifications
    const validWithNumberNotification = updateProfileSchema.safeParse({
      name: 'Bayu Wipradnyana',
      notifications: 1
    });
    assert.equal(validWithNumberNotification.success, true);
    if (validWithNumberNotification.success) {
      assert.equal(validWithNumberNotification.data.notifications, true);
    }

    const validWithZeroNotification = updateProfileSchema.safeParse({
      name: 'Bayu Wipradnyana',
      notifications: 0
    });
    assert.equal(validWithZeroNotification.success, true);
    if (validWithZeroNotification.success) {
      assert.equal(validWithZeroNotification.data.notifications, false);
    }

    const validWithStringNotification = updateProfileSchema.safeParse({
      name: 'Bayu Wipradnyana',
      notifications: 'true'
    });
    assert.equal(validWithStringNotification.success, true);
    if (validWithStringNotification.success) {
      assert.equal(validWithStringNotification.data.notifications, true);
    }

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

  await t.test('terminateRentalSchema requires password confirmation', () => {
    const valid = terminateRentalSchema.safeParse({
      password: 'mypassword123',
      reason: 'Pindah kerja'
    });
    assert.equal(valid.success, true);

    const missingPassword = terminateRentalSchema.safeParse({});
    assert.equal(missingPassword.success, false);

    const emptyPassword = terminateRentalSchema.safeParse({ password: '' });
    assert.equal(emptyPassword.success, false);
  });

  await t.test('propertyUpdateSchema validates partial property update payloads', () => {
    const validPartial = propertyUpdateSchema.safeParse({
      name: 'Villa Baru',
      price: 3500000,
      facilities: ['Wifi', 'AC', 'Kolam']
    });
    assert.equal(validPartial.success, true);

    const validFacilitiesOnly = propertyUpdateSchema.safeParse({
      facilities: ['Wifi', 'Air', 'Gym']
    });
    assert.equal(validFacilitiesOnly.success, true);

    const invalidPrice = propertyUpdateSchema.safeParse({
      price: -500
    });
    assert.equal(invalidPrice.success, false);

    const invalidRooms = propertyUpdateSchema.safeParse({
      totalRooms: 0
    });
    assert.equal(invalidRooms.success, false);
  });

  await t.test('reviewUpdateSchema validates partial review updates', () => {
    const validRating = reviewUpdateSchema.safeParse({ rating: 4 });
    assert.equal(validRating.success, true);

    const validComment = reviewUpdateSchema.safeParse({ comment: 'Sangat nyaman dan tenang' });
    assert.equal(validComment.success, true);

    const validBoth = reviewUpdateSchema.safeParse({ rating: 5, comment: 'Luar biasa!' });
    assert.equal(validBoth.success, true);

    const invalidRatingLow = reviewUpdateSchema.safeParse({ rating: 0 });
    assert.equal(invalidRatingLow.success, false);

    const invalidRatingHigh = reviewUpdateSchema.safeParse({ rating: 6 });
    assert.equal(invalidRatingHigh.success, false);

    const emptyBoth = reviewUpdateSchema.safeParse({});
    assert.equal(emptyBoth.success, false);
  });

  await t.test('verifyPasswordSchema strictly requires non-empty password', () => {
    const valid = verifyPasswordSchema.safeParse({ password: 'secretpassword' });
    assert.equal(valid.success, true);

    const validWithUserId = verifyPasswordSchema.safeParse({ password: 'secretpassword', userId: 'user-123' });
    assert.equal(validWithUserId.success, true);

    const missingPassword = verifyPasswordSchema.safeParse({});
    assert.equal(missingPassword.success, false);

    const emptyPassword = verifyPasswordSchema.safeParse({ password: '' });
    assert.equal(emptyPassword.success, false);
  });

  await t.test('processWithdrawalSchema and rejectWithdrawalSchema validate status and reasons', () => {
    const validProcess = processWithdrawalSchema.safeParse({ status: 'completed', referenceId: 'REF-001' });
    assert.equal(validProcess.success, true);

    const defaultProcess = processWithdrawalSchema.safeParse({});
    assert.equal(defaultProcess.success, true);
    if (defaultProcess.success) {
      assert.equal(defaultProcess.data.status, 'completed');
    }

    const invalidProcessStatus = processWithdrawalSchema.safeParse({ status: 'rejected' });
    assert.equal(invalidProcessStatus.success, false);

    const validReject = rejectWithdrawalSchema.safeParse({
      password: 'adminSecretPassword',
      reason: 'Nomor rekening tidak valid'
    });
    assert.equal(validReject.success, true);

    const validRejectNoReason = rejectWithdrawalSchema.safeParse({
      password: 'adminSecretPassword'
    });
    assert.equal(validRejectNoReason.success, true);

    const missingRejectPassword = rejectWithdrawalSchema.safeParse({
      reason: 'Nomor rekening tidak valid'
    });
    assert.equal(missingRejectPassword.success, false);

    const emptyRejectPassword = rejectWithdrawalSchema.safeParse({
      password: '',
      reason: 'Nomor rekening tidak valid'
    });
    assert.equal(emptyRejectPassword.success, false);

    const emptyRejectReason = rejectWithdrawalSchema.safeParse({
      password: 'adminSecretPassword',
      reason: ''
    });
    assert.equal(emptyRejectReason.success, false);
  });

  await t.test('createRentalSchema validates booking creation parameters', () => {
    const valid = createRentalSchema.safeParse({
      propertyId: 'prop-101',
      price: 2500000,
      durationMonths: 3
    });
    assert.equal(valid.success, true);

    const missingProp = createRentalSchema.safeParse({
      price: 2500000
    });
    assert.equal(missingProp.success, false);

    const invalidDuration = createRentalSchema.safeParse({
      propertyId: 'prop-101',
      durationMonths: 0
    });
    assert.equal(invalidDuration.success, false);
  });

  await t.test('visitorTrackingSchema accepts empty, optional, and valid telemetry payloads', () => {
    const emptyPayload = visitorTrackingSchema.safeParse({});
    assert.equal(emptyPayload.success, true);

    const undefinedPayload = visitorTrackingSchema.safeParse(undefined);
    assert.equal(undefinedPayload.success, true);

    const validPayload = visitorTrackingSchema.safeParse({
      pageUrl: 'https://kosmobali.my.id/property/prop-101',
      referrer: 'https://google.com',
      sessionId: 'sess-xyz-123',
      deviceType: 'mobile'
    });
    assert.equal(validPayload.success, true);

    const oversizedUrl = visitorTrackingSchema.safeParse({
      pageUrl: 'a'.repeat(501)
    });
    assert.equal(oversizedUrl.success, false);
  });

  await t.test('sanitizeText strips script and HTML tags while preserving text', () => {
    assert.equal(sanitizeText('<script>alert(1)</script>Kos Nyaman'), 'Kos Nyaman');
    assert.equal(sanitizeText('<img src=x onerror=alert("XSS")>'), '');
    assert.equal(sanitizeText('<b>Bagus</b> sekali & ramah!'), 'Bagus sekali & ramah!');
    assert.equal(sanitizeText('Jl. Sunset Road\0 No. 10'), 'Jl. Sunset Road No. 10');
  });

  await t.test('createPaymentTokenSchema validates required fields and defaults duration', () => {
    const valid = createPaymentTokenSchema.safeParse({
      propertyId: 'prop-01',
      tenantId: 'user-01'
    });
    assert.equal(valid.success, true);
    if (valid.success) {
      assert.equal(valid.data.durationMonths, 1);
    }

    const missingProp = createPaymentTokenSchema.safeParse({ tenantId: 'user-01' });
    assert.equal(missingProp.success, false);
  });

  await t.test('paymentNotificationSchema validates webhook payload and passes through extra gateway fields', () => {
    const valid = paymentNotificationSchema.safeParse({
      order_id: 'rent-101',
      status_code: '200',
      gross_amount: '3500000.00',
      signature_key: 'abcdef123456',
      transaction_status: 'settlement',
      va_numbers: [{ bank: 'bca', va_number: '12345678' }]
    });
    assert.equal(valid.success, true);

    const missingSig = paymentNotificationSchema.safeParse({
      order_id: 'rent-101',
      status_code: '200',
      gross_amount: '3500000.00'
    });
    assert.equal(missingSig.success, false);
  });
});
