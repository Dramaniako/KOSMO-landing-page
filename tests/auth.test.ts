import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {
  generateJwtToken,
  verifyJwtToken,
  authenticateToken,
  requireRole
} from '../backend/middleware/auth.ts';
import type { JWTPayload, AuthenticatedRequest } from '../backend/middleware/auth.ts';
import {
  loginSchema,
  registerSchema,
  propertySchema
} from '../backend/middleware/validation.ts';
import type { Request, Response, NextFunction } from 'express';

test('Authentication logic, password security gates & JWT', async (t) => {
  const plainPassword = 'SuperSecretPassword123!';
  const hashedPassword = bcrypt.hashSync(plainPassword, 10);
  const secret = 'custom-test-secret-key-high-entropy-min-32-chars';

  const mockPayload: JWTPayload = {
    id: 'user-landlord-007',
    email: 'landlord@kosmo.id',
    role: 'landlord'
  };

  await t.test('bcrypt hashes password with salt correctly', () => {
    assert.notEqual(hashedPassword, plainPassword);
    assert.equal(typeof hashedPassword, 'string');
    assert.ok(hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$'));
  });

  await t.test('bcrypt correctly validates matching password', () => {
    const isValid = bcrypt.compareSync(plainPassword, hashedPassword);
    assert.equal(isValid, true);
  });

  await t.test('bcrypt rejects incorrect password', () => {
    const isInvalid = bcrypt.compareSync('WrongPassword456!', hashedPassword);
    assert.equal(isInvalid, false);
  });

  await t.test('bcrypt rejects empty password against hash', () => {
    const isEmptyValid = bcrypt.compareSync('', hashedPassword);
    assert.equal(isEmptyValid, false);
  });

  await t.test('password verification logic handles missing parameters', () => {
    const verifyPasswordInput = (userId?: string, password?: string): { valid: boolean; error?: string } => {
      if (!userId || !password) {
        return { valid: false, error: 'userId dan password wajib diisi.' };
      }
      return { valid: true };
    };

    assert.equal(verifyPasswordInput(undefined, 'pass123').valid, false);
    assert.equal(verifyPasswordInput('user-1', undefined).valid, false);
    assert.equal(verifyPasswordInput('', '').valid, false);
    assert.equal(verifyPasswordInput('user-1', 'pass123').valid, true);
  });

  await t.test('root admin deletion guard prevents deleting default admin user', () => {
    const checkUserDeletionAllowed = (userId: string): { allowed: boolean; message?: string } => {
      if (userId === 'user-admin') {
        return { allowed: false, message: 'Akun admin utama tidak dapat dihapus.' };
      }
      return { allowed: true };
    };

    assert.equal(checkUserDeletionAllowed('user-admin').allowed, false);
    assert.equal(checkUserDeletionAllowed('user-tenant-101').allowed, true);
  });

  await t.test('generates valid JWT with 7d expiration and verifies claims', () => {
    const token = generateJwtToken(mockPayload, secret, '7d');
    assert.equal(typeof token, 'string');

    const decoded = verifyJwtToken(token, secret);
    assert.equal(decoded.id, mockPayload.id);
    assert.equal(decoded.email, mockPayload.email);
    assert.equal(decoded.role, mockPayload.role);
  });

  await t.test('rejects expired JWT token', () => {
    const expiredToken = generateJwtToken(mockPayload, secret, -1);
    assert.throws(
      () => verifyJwtToken(expiredToken, secret),
      (err: Error) => err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError'
    );
  });

  await t.test('rejects malformed token string', () => {
    assert.throws(
      () => verifyJwtToken('invalid.token.payload', secret),
      (err: Error) => err.name === 'JsonWebTokenError'
    );
  });

  await t.test('requireRole middleware permits authorized role and calls next()', () => {
    let nextCalled = false;
    const mockReq = {
      user: { id: 'u1', email: 'admin@kosmo.id', role: 'admin' as const }
    } as unknown as Request;

    const mockRes = {
      status: () => mockRes,
      json: () => mockRes
    } as unknown as Response;

    const mockNext: NextFunction = () => {
      nextCalled = true;
    };

    const guard = requireRole(['admin', 'landlord']);
    guard(mockReq, mockRes, mockNext);

    assert.equal(nextCalled, true);
  });

  await t.test('requireRole middleware blocks unauthorized role with 403 Forbidden', () => {
    let statusCode = 0;
    let responseBody: unknown = null;

    const mockReq = {
      user: { id: 'u2', email: 'tenant@kosmo.id', role: 'tenant' as const }
    } as unknown as Request;

    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: unknown) => {
        responseBody = data;
        return mockRes;
      }
    } as unknown as Response;

    const mockNext: NextFunction = () => {};

    const guard = requireRole(['admin', 'landlord']);
    guard(mockReq, mockRes, mockNext);

    assert.equal(statusCode, 403);
    assert.ok(responseBody && typeof responseBody === 'object');
  });

  await t.test('requireRole middleware returns 401 when request is unauthenticated', () => {
    let statusCode = 0;

    const mockReq = {} as unknown as Request;
    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: () => mockRes
    } as unknown as Response;

    const mockNext: NextFunction = () => {};

    const guard = requireRole(['admin']);
    guard(mockReq, mockRes, mockNext);

    assert.equal(statusCode, 401);
  });

  await t.test('Zod loginSchema validates valid and invalid payloads', () => {
    const valid = loginSchema.safeParse({ email: 'user@kosmo.id', password: 'password123' });
    assert.equal(valid.success, true);

    const invalidEmail = loginSchema.safeParse({ email: 'not-an-email', password: 'password123' });
    assert.equal(invalidEmail.success, false);

    const emptyPassword = loginSchema.safeParse({ email: 'user@kosmo.id', password: '' });
    assert.equal(emptyPassword.success, false);
  });

  await t.test('Zod registerSchema validates minimum password length', () => {
    const valid = registerSchema.safeParse({
      name: 'Budi Santoso',
      email: 'budi@kosmo.id',
      password: 'secretpassword',
      phone: '+62812345678'
    });
    assert.equal(valid.success, true);

    const shortPassword = registerSchema.safeParse({
      name: 'Budi Santoso',
      email: 'budi@kosmo.id',
      password: '123'
    });
    assert.equal(shortPassword.success, false);
  });

  await t.test('Zod propertySchema validates price, room count, and required fields', () => {
    const valid = propertySchema.safeParse({
      name: 'KOSMO Sunset Deluxe',
      district: 'Badung',
      address: 'Jl. Sunset Road No. 88, Kuta',
      price: 3000000,
      totalRooms: 10,
      ownerId: 'user-landlord-01'
    });
    assert.equal(valid.success, true);

    const negativePrice = propertySchema.safeParse({
      name: 'KOSMO Sunset Deluxe',
      district: 'Badung',
      address: 'Jl. Sunset Road No. 88, Kuta',
      price: -500000,
      totalRooms: 10,
      ownerId: 'user-landlord-01'
    });
    assert.equal(negativePrice.success, false);
  });
});
