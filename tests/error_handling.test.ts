import test from 'node:test';
import assert from 'node:assert/strict';
import { ZodError, z } from 'zod';
import {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  DatabaseError,
  ErrorCode,
  isAppError,
  isOperationalError
} from '../backend/errors/index';
import { normalizeError, errorHandler } from '../backend/middleware/errorHandler';
import { notFoundHandler } from '../backend/middleware/notFoundHandler';
import { requestIdMiddleware } from '../backend/middleware/requestId';
import { asyncHandler } from '../backend/utils/asyncHandler';
import type { Request, Response, NextFunction } from 'express';

test('Professional-Grade Error Handling Architecture', async (t) => {

  // =========================================================================
  // 1. Centralized Typed Error Hierarchy & Classification
  // =========================================================================
  await t.test('1.1 AppError hierarchy creates well-typed operational errors with status codes and timestamps', () => {
    const err = new AppError('General application error', 418, 'I_AM_A_TEAPOT', true, { foo: 'bar' });
    assert.equal(err.message, 'General application error');
    assert.equal(err.statusCode, 418);
    assert.equal(err.code, 'I_AM_A_TEAPOT');
    assert.equal(err.isOperational, true);
    assert.deepEqual(err.details, { foo: 'bar' });
    assert.ok(err.timestamp, 'Timestamp must be present');
    assert.ok(err.stack, 'Stack trace must be captured');
    assert.equal(isAppError(err), true);
    assert.equal(isOperationalError(err), true);
  });

  await t.test('1.2 Specialized error subclasses inherit correct HTTP status codes and default codes', () => {
    const badReq = new BadRequestError('Bad input');
    assert.equal(badReq.statusCode, 400);
    assert.equal(badReq.code, ErrorCode.BAD_REQUEST);
    assert.equal(badReq.isOperational, true);

    const valErr = new ValidationError('Schema validation failure', { field: 'email' });
    assert.equal(valErr.statusCode, 400);
    assert.equal(valErr.code, ErrorCode.VALIDATION_ERROR);
    assert.deepEqual(valErr.details, { field: 'email' });

    const unauth = new UnauthorizedError();
    assert.equal(unauth.statusCode, 401);
    assert.equal(unauth.code, ErrorCode.UNAUTHORIZED);

    const forbidden = new ForbiddenError();
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.code, ErrorCode.FORBIDDEN);

    const notFound = new NotFoundError('Listing not found');
    assert.equal(notFound.statusCode, 404);
    assert.equal(notFound.code, ErrorCode.NOT_FOUND);

    const conflict = new ConflictError('Room already occupied', ErrorCode.ROOM_OCCUPIED);
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.code, ErrorCode.ROOM_OCCUPIED);

    const unproc = new UnprocessableEntityError();
    assert.equal(unproc.statusCode, 422);
    assert.equal(unproc.code, ErrorCode.UNPROCESSABLE_ENTITY);

    const rateLimit = new RateLimitError();
    assert.equal(rateLimit.statusCode, 429);
    assert.equal(rateLimit.code, ErrorCode.RATE_LIMIT_EXCEEDED);

    const internal = new InternalServerError();
    assert.equal(internal.statusCode, 500);
    assert.equal(internal.code, ErrorCode.INTERNAL_SERVER_ERROR);
    assert.equal(internal.isOperational, false, 'InternalServerError must be flagged as non-operational');

    const svcUnavailable = new ServiceUnavailableError();
    assert.equal(svcUnavailable.statusCode, 503);
    assert.equal(svcUnavailable.code, ErrorCode.SERVICE_UNAVAILABLE);

    const dbErr = new DatabaseError('Query failed');
    assert.equal(dbErr.statusCode, 500);
    assert.equal(dbErr.code, ErrorCode.DATABASE_ERROR);
  });

  // =========================================================================
  // 2. Framework & Driver Error Translation (normalizeError)
  // =========================================================================
  await t.test('2.1 translates ZodError into 400 ValidationError with flattened issues', () => {
    const testSchema = z.object({
      email: z.string().email('Format email tidak valid'),
      age: z.number().min(18, 'Usia minimal 18 tahun')
    });

    const parsed = testSchema.safeParse({ email: 'bad-email', age: 10 });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const normalized = normalizeError(parsed.error);
      assert.equal(normalized.statusCode, 400);
      assert.equal(normalized.code, ErrorCode.VALIDATION_ERROR);
      assert.ok(normalized.message.includes('Format email tidak valid'));
      assert.ok(normalized.message.includes('Usia minimal 18 tahun'));
      assert.ok(normalized.details);
    }
  });

  await t.test('2.2 translates JSON body-parser SyntaxError into 400 MALFORMED_JSON', () => {
    const syntaxErr = new SyntaxError('Unexpected token } in JSON at position 12');
    (syntaxErr as unknown as { status: number; body: string }).status = 400;
    (syntaxErr as unknown as { status: number; body: string }).body = '{ invalid }';

    const normalized = normalizeError(syntaxErr);
    assert.equal(normalized.statusCode, 400);
    assert.equal(normalized.code, ErrorCode.MALFORMED_JSON);
    assert.equal(normalized.message, 'Format payload JSON tidak valid.');
    assert.equal(normalized.isOperational, true);
  });

  await t.test('2.3 translates Multer upload errors (file size, count, unexpected field)', () => {
    const sizeErr = new Error('File too large');
    sizeErr.name = 'MulterError';
    (sizeErr as unknown as { code: string }).code = 'LIMIT_FILE_SIZE';
    const normSize = normalizeError(sizeErr);
    assert.equal(normSize.statusCode, 400);
    assert.equal(normSize.code, ErrorCode.FILE_TOO_LARGE);
    assert.ok(normSize.message.includes('5MB'));

    const countErr = new Error('Too many files');
    countErr.name = 'MulterError';
    (countErr as unknown as { code: string }).code = 'LIMIT_FILE_COUNT';
    const normCount = normalizeError(countErr);
    assert.equal(normCount.statusCode, 400);
    assert.equal(normCount.code, ErrorCode.FILE_LIMIT_EXCEEDED);

    const fieldErr = new Error('Unexpected field');
    fieldErr.name = 'MulterError';
    (fieldErr as unknown as { code: string }).code = 'LIMIT_UNEXPECTED_FILE';
    const normField = normalizeError(fieldErr);
    assert.equal(normField.statusCode, 400);
    assert.equal(normField.code, ErrorCode.FILE_UNSUPPORTED_TYPE);
  });

  await t.test('2.4 translates JWT token expiration and malformed token errors', () => {
    const expiredErr = new Error('jwt expired');
    expiredErr.name = 'TokenExpiredError';
    const normExpired = normalizeError(expiredErr);
    assert.equal(normExpired.statusCode, 401);
    assert.equal(normExpired.code, ErrorCode.AUTH_TOKEN_EXPIRED);
    assert.ok(normExpired.message.includes('kadaluarsa'));

    const invalidErr = new Error('invalid signature');
    invalidErr.name = 'JsonWebTokenError';
    const normInvalid = normalizeError(invalidErr);
    assert.equal(normInvalid.statusCode, 401);
    assert.equal(normInvalid.code, ErrorCode.AUTH_TOKEN_INVALID);
  });

  await t.test('2.5 translates MySQL / TiDB driver errors into operational domain errors', () => {
    // ER_DUP_ENTRY (1062)
    const dupErr = new Error('Duplicate entry for key users.email');
    (dupErr as unknown as { code: string; errno: number }).code = 'ER_DUP_ENTRY';
    (dupErr as unknown as { code: string; errno: number }).errno = 1062;
    const normDup = normalizeError(dupErr);
    assert.equal(normDup.statusCode, 409);
    assert.equal(normDup.code, ErrorCode.DUPLICATE_ENTRY);
    assert.ok(normDup.message.includes('duplikasi'));

    // Foreign key constraint failure (1452)
    const fkErr = new Error('Cannot add or update a child row');
    (fkErr as unknown as { code: string }).code = 'ER_NO_REFERENCED_ROW_2';
    const normFk = normalizeError(fkErr);
    assert.equal(normFk.statusCode, 400);
    assert.equal(normFk.code, ErrorCode.FOREIGN_KEY_VIOLATION);

    // Database connection failure
    const connErr = new Error('connect ECONNREFUSED 127.0.0.1:3306');
    (connErr as unknown as { code: string }).code = 'ECONNREFUSED';
    const normConn = normalizeError(connErr);
    assert.equal(normConn.statusCode, 503);
    assert.equal(normConn.code, ErrorCode.DATABASE_UNAVAILABLE);
  });

  // =========================================================================
  // 3. Request Correlation & Tracing (requestIdMiddleware)
  // =========================================================================
  await t.test('3.1 generates unique requestId if missing and sets response header', () => {
    let nextCalled = false;
    let headerName = '';
    let headerVal = '';

    const req = {
      headers: {}
    } as unknown as Request;

    const res = {
      setHeader: (name: string, val: string) => {
        headerName = name;
        headerVal = val;
      }
    } as unknown as Response;

    const next: NextFunction = () => {
      nextCalled = true;
    };

    requestIdMiddleware(req, res, next);
    assert.equal(nextCalled, true);
    assert.ok(req.id?.startsWith('req_'));
    assert.equal(req.requestId, req.id);
    assert.equal(headerName, 'X-Request-Id');
    assert.equal(headerVal, req.id);
  });

  await t.test('3.2 preserves incoming X-Request-Id header across pipeline', () => {
    let nextCalled = false;
    let headerVal = '';

    const req = {
      headers: {
        'x-request-id': 'client-correlation-uuid-999'
      }
    } as unknown as Request;

    const res = {
      setHeader: (_name: string, val: string) => {
        headerVal = val;
      }
    } as unknown as Response;

    requestIdMiddleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.id, 'client-correlation-uuid-999');
    assert.equal(headerVal, 'client-correlation-uuid-999');
  });

  // =========================================================================
  // 4. Async Handler Wrapper (asyncHandler)
  // =========================================================================
  await t.test('4.1 asyncHandler catches rejected promises and pipes to Express next(err)', async () => {
    const errorThrown = new Error('Async processing explosion');
    let capturedError: unknown = null;

    const handler = asyncHandler(async (_req, _res) => {
      throw errorThrown;
    });

    const mockReq = {} as Request;
    const mockRes = {} as Response;
    const mockNext: NextFunction = (err) => {
      capturedError = err;
    };

    handler(mockReq, mockRes, mockNext);

    // Yield tick to allow promise rejection to propagate
    await new Promise((r) => setImmediate(r));

    assert.equal(capturedError, errorThrown);
  });

  // =========================================================================
  // 5. 404 Route Not Found Middleware (notFoundHandler)
  // =========================================================================
  await t.test('5.1 notFoundHandler forwards NotFoundError with ROUTE_NOT_FOUND code', () => {
    let capturedErr: unknown = null;
    const mockReq = {
      method: 'POST',
      originalUrl: '/api/v1/ghost-route'
    } as unknown as Request;

    const mockRes = {} as Response;
    const mockNext: NextFunction = (err) => {
      capturedErr = err;
    };

    notFoundHandler(mockReq, mockRes, mockNext);
    assert.ok(isAppError(capturedErr));
    const appErr = capturedErr as AppError;
    assert.equal(appErr.statusCode, 404);
    assert.equal(appErr.code, ErrorCode.ROUTE_NOT_FOUND);
    assert.ok(appErr.message.includes('[POST] /api/v1/ghost-route'));
  });

  // =========================================================================
  // 6. Centralized Error Handler Middleware (errorHandler)
  // =========================================================================
  await t.test('6.1 errorHandler formats RFC 7807 payload with backwards compatibility', () => {
    let statusCode = 0;
    let responseJson: Record<string, unknown> | null = null;

    const mockReq = {
      id: 'req-audit-123',
      method: 'GET',
      originalUrl: '/api/properties/unknown'
    } as unknown as Request;

    const mockRes = {
      getHeader: () => undefined,
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (payload: Record<string, unknown>) => {
        responseJson = payload;
        return mockRes;
      }
    } as unknown as Response;

    const notFound = new NotFoundError('Properti tidak ditemukan.', ErrorCode.PROPERTY_NOT_FOUND);
    errorHandler(notFound, mockReq, mockRes, () => {});

    assert.equal(statusCode, 404);
    assert.ok(responseJson);
    assert.equal(responseJson.status, 'fail');
    assert.equal(responseJson.statusCode, 404);
    assert.equal(responseJson.code, ErrorCode.PROPERTY_NOT_FOUND);
    assert.equal(responseJson.message, 'Properti tidak ditemukan.');
    assert.equal(responseJson.error, 'Properti tidak ditemukan.');
    assert.equal(responseJson.requestId, 'req-audit-123');
    assert.equal(responseJson.path, '/api/properties/unknown');
    assert.ok(responseJson.timestamp);
  });

  await t.test('6.2 errorHandler sanitizes 500 errors in production environment', () => {
    const envObj = process.env as Record<string, string | undefined>;
    const origEnv = envObj.NODE_ENV;
    try {
      envObj.NODE_ENV = 'production';

      let statusCode = 0;
      let responseJson: Record<string, unknown> | null = null;

      const mockReq = {
        method: 'POST',
        originalUrl: '/api/database-action'
      } as unknown as Request;

      const mockRes = {
        getHeader: () => undefined,
        status: (code: number) => {
          statusCode = code;
          return mockRes;
        },
        json: (payload: Record<string, unknown>) => {
          responseJson = payload;
          return mockRes;
        }
      } as unknown as Response;

      const sensitiveError = new Error('SELECT password_hash FROM admin_credentials WHERE syntax error at position 4');
      errorHandler(sensitiveError, mockReq, mockRes, () => {});

      assert.equal(statusCode, 500);
      assert.ok(responseJson);
      assert.equal(responseJson.status, 'error');
      assert.equal(responseJson.statusCode, 500);
      // Sensitive SQL syntax error must NOT leak to client in production
      assert.equal(responseJson.message, 'Internal Server Error');
      assert.equal(responseJson.error, 'Internal Server Error');
      assert.equal(responseJson.stack, undefined, 'Stack trace must be omitted in production');
    } finally {
      envObj.NODE_ENV = origEnv;
    }
  });

  await t.test('6.3 errorHandler delegates to next(err) if res.headersSent is true to prevent ERR_HTTP_HEADERS_SENT', () => {
    let nextCalledWith: unknown = null;
    let statusCalled = false;
    let jsonCalled = false;

    const mockReq = {
      id: 'req_sent_1',
      method: 'GET',
      originalUrl: '/api/stream'
    } as unknown as Request;

    const mockRes = {
      headersSent: true,
      status: () => { statusCalled = true; return mockRes; },
      json: () => { jsonCalled = true; return mockRes; }
    } as unknown as Response;

    const err = new Error('Late stream error');
    errorHandler(err, mockReq, mockRes, (e) => { nextCalledWith = e; });

    assert.equal(nextCalledWith, err, 'next(err) must be invoked');
    assert.equal(statusCalled, false, 'res.status must NOT be called when headersSent is true');
    assert.equal(jsonCalled, false, 'res.json must NOT be called when headersSent is true');
  });

  await t.test('6.4 requestIdMiddleware sanitizes CRLF newline header injection', () => {
    let capturedHeader = '';
    const req = {
      headers: {
        'x-request-id': 'malicious\r\nInjected-Header: evil\r\n'
      }
    } as unknown as Request;

    const res = {
      headersSent: false,
      setHeader: (_k: string, v: string) => { capturedHeader = v; }
    } as unknown as Response;

    requestIdMiddleware(req, res, () => {});
    assert.ok(capturedHeader.startsWith('req_'));
    assert.equal(capturedHeader.includes('\r'), false);
    assert.equal(capturedHeader.includes('\n'), false);
    assert.equal(req.id, capturedHeader);
  });

  await t.test('6.5 requestIdMiddleware truncates/regenerates oversized IDs exceeding 128 chars', () => {
    let capturedHeader = '';
    const req = {
      headers: {
        'x-request-id': 'a'.repeat(200)
      }
    } as unknown as Request;

    const res = {
      headersSent: false,
      setHeader: (_k: string, v: string) => { capturedHeader = v; }
    } as unknown as Response;

    requestIdMiddleware(req, res, () => {});
    assert.ok(capturedHeader.startsWith('req_'));
    assert.ok(capturedHeader.length <= 128);
  });
});
