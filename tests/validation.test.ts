import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  validateBody,
  loginSchema,
  registerSchema,
  propertySchema
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
});
