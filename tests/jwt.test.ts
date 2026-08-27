import test from 'node:test';
import assert from 'node:assert/strict';
import { generateJwtToken, verifyJwtToken, authenticateToken } from '../backend/router';
import type { JWTPayload } from '../backend/router';
import type { Request, Response, NextFunction } from 'express';

test('Signed JWT Authentication & Middleware', async (t) => {
  const secret = 'test-secret-key-high-entropy-min-32-chars-long';
  const mockPayload: JWTPayload = {
    id: 'user-tenant-101',
    email: 'tenant@kosmo.id',
    role: 'tenant'
  };

  await t.test('generates valid JWT signed token with user claims', () => {
    const token = generateJwtToken(mockPayload, secret, '1h');
    assert.equal(typeof token, 'string');
    assert.ok(token.split('.').length === 3, 'JWT should contain 3 dot-separated parts');
  });

  await t.test('verifies and decodes valid JWT token claims', () => {
    const token = generateJwtToken(mockPayload, secret, '1h');
    const decoded = verifyJwtToken(token, secret);

    assert.equal(decoded.id, mockPayload.id);
    assert.equal(decoded.email, mockPayload.email);
    assert.equal(decoded.role, mockPayload.role);
  });

  await t.test('rejects token signed with incorrect secret', () => {
    const token = generateJwtToken(mockPayload, secret, '1h');
    const wrongSecret = 'wrong-secret-key-high-entropy-32-chars-x';

    assert.throws(
      () => verifyJwtToken(token, wrongSecret),
      (err: Error) => err.name === 'JsonWebTokenError'
    );
  });

  await t.test('rejects expired JWT token', async () => {
    // Generate token with 0s or -1s expiration
    const expiredToken = generateJwtToken(mockPayload, secret, -1);

    assert.throws(
      () => verifyJwtToken(expiredToken, secret),
      (err: Error) => err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError'
    );
  });

  await t.test('rejects malformed token string', () => {
    assert.throws(
      () => verifyJwtToken('not.a.valid.jwt.token', secret),
      (err: Error) => err.name === 'JsonWebTokenError'
    );
  });

  await t.test('authenticateToken middleware accepts valid Bearer token and calls next()', () => {
    const token = generateJwtToken(mockPayload);
    let nextCalled = false;

    const mockReq = {
      headers: {
        authorization: `Bearer ${token}`
      }
    } as unknown as Request;

    const mockRes = {
      status: () => mockRes,
      json: () => mockRes
    } as unknown as Response;

    const mockNext: NextFunction = () => {
      nextCalled = true;
    };

    authenticateToken(mockReq, mockRes, mockNext);
    assert.equal(nextCalled, true);
    assert.equal((mockReq as { user?: JWTPayload }).user?.id, mockPayload.id);
  });

  await t.test('authenticateToken middleware accepts valid token from query params and calls next()', () => {
    const token = generateJwtToken(mockPayload);
    let nextCalled = false;

    const mockReq = {
      headers: {},
      query: { token }
    } as unknown as Request;

    const mockRes = {
      status: () => mockRes,
      json: () => mockRes
    } as unknown as Response;

    const mockNext: NextFunction = () => {
      nextCalled = true;
    };

    authenticateToken(mockReq, mockRes, mockNext);
    assert.equal(nextCalled, true);
    assert.equal((mockReq as { user?: JWTPayload }).user?.id, mockPayload.id);
  });

  await t.test('authenticateToken middleware returns 401 when Authorization header and query token are missing', () => {
    let statusCode = 0;
    let responseBody: unknown = null;

    const mockReq = {
      headers: {}
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

    authenticateToken(mockReq, mockRes, mockNext);
    assert.equal(statusCode, 401);
    assert.ok(responseBody && typeof responseBody === 'object' && 'message' in responseBody);
  });

  await t.test('authenticateToken middleware returns 403 when Bearer token is invalid', () => {
    let statusCode = 0;
    let responseBody: unknown = null;

    const mockReq = {
      headers: {
        authorization: 'Bearer invalid.token.value'
      }
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

    authenticateToken(mockReq, mockRes, mockNext);
    assert.equal(statusCode, 403);
    assert.ok(responseBody && typeof responseBody === 'object' && 'message' in responseBody);
  });

  await t.test('verifies JWT is signed with HS256 header', () => {
    const token = generateJwtToken(mockPayload, secret, '1h');
    const headerBase64 = token.split('.')[0];
    const headerJson = Buffer.from(headerBase64, 'base64url').toString('utf8');
    const header = JSON.parse(headerJson) as { alg: string; typ: string };
    assert.equal(header.alg, 'HS256');
    assert.equal(header.typ, 'JWT');
  });

  await t.test('generateJwtToken succeeds without explicit secret using getJwtSecret fallback', async () => {
    const token = generateJwtToken(mockPayload);
    assert.equal(typeof token, 'string');
    const decoded = verifyJwtToken(token);
    assert.equal(decoded.id, mockPayload.id);
  });
});
