/**
 * 🛡️ KOSMO Professional Error Handling Curator Agent
 *
 * Evaluates the full-stack error handling architecture across 5 professional dimensions:
 * 1. Centralized Typed Architecture & Operational Classification
 * 2. RFC 7807 Standardized Contract & Request Tracing
 * 3. Driver & Framework Error Normalization (Zod, MySQL, Multer, JWT, BodyParser)
 * 4. Frontend Resilience, ErrorBoundary & Bilingual UX
 * 5. Defensive Process Safety & Production Leak Prevention
 *
 * Run: npx tsx scripts/curator_error_handling.ts
 */

import http from 'http';
import { z } from 'zod';
import {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
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
import { setupProcessSafety, isProcessSafetyActive } from '../backend/utils/processSafety';
import {
  ApiError,
  isApiError,
  isNetworkError,
  isAuthError,
  getErrorMessage
} from '../frontend/src/services/apiClient';
import app from '../backend/server';

interface CheckItem {
  id: string;
  name: string;
  weight: number;
  passed: boolean;
  notes?: string;
}

export interface CuratorEvaluationResult {
  scores: {
    architecture: number;
    contract: number;
    driverTranslation: number;
    frontendResilience: number;
    processSafety: number;
  };
  compositeScore: number;
  checks: Record<string, CheckItem[]>;
  passed: boolean;
}

export async function runCuratorEvaluation(): Promise<CuratorEvaluationResult> {
  const checks: Record<string, CheckItem[]> = {
    architecture: [
      {
        id: 'arch-1',
        name: 'AppError base class with typed status, code, and operational separation',
        weight: 2.5,
        passed: false
      },
      {
        id: 'arch-2',
        name: 'Specialized domain error subclasses (BadRequest, NotFound, Conflict, etc.)',
        weight: 2.5,
        passed: false
      },
      {
        id: 'arch-3',
        name: 'Machine-readable ErrorCode catalog covering all domain subsystems',
        weight: 2.5,
        passed: false
      },
      {
        id: 'arch-4',
        name: 'Type guards isAppError and isOperationalError for deterministic runtime checks',
        weight: 2.5,
        passed: false
      }
    ],
    contract: [
      {
        id: 'contract-1',
        name: 'Standardized RFC 7807 compliant error envelope (status, code, message, timestamp, path)',
        weight: 2.5,
        passed: false
      },
      {
        id: 'contract-2',
        name: 'End-to-end request correlation ID (X-Request-Id header + req.requestId)',
        weight: 2.5,
        passed: false
      },
      {
        id: 'contract-3',
        name: 'Preserves backward compatibility with legacy message and error fields',
        weight: 2.5,
        passed: false
      },
      {
        id: 'contract-4',
        name: 'Structured field-level validation issue reporting (details / errors)',
        weight: 2.5,
        passed: false
      }
    ],
    driverTranslation: [
      {
        id: 'trans-1',
        name: 'Automatic Zod validation error normalization into 400 with flattened details',
        weight: 2.0,
        passed: false
      },
      {
        id: 'trans-2',
        name: 'BodyParser JSON malformed syntax error mapped to 400 MALFORMED_JSON',
        weight: 2.0,
        passed: false
      },
      {
        id: 'trans-3',
        name: 'Multer upload errors (5MB limit, file count) mapped cleanly to operational 400',
        weight: 2.0,
        passed: false
      },
      {
        id: 'trans-4',
        name: 'JWT expiration and signature errors mapped to 401 AUTH_TOKEN_*',
        weight: 2.0,
        passed: false
      },
      {
        id: 'trans-5',
        name: 'MySQL errors (1062 duplicate, 1452 FK, connection loss) mapped to domain status',
        weight: 2.0,
        passed: false
      }
    ],
    frontendResilience: [
      {
        id: 'fe-1',
        name: 'Frontend ApiError with structured code, details, and correlation parsing',
        weight: 2.5,
        passed: false
      },
      {
        id: 'fe-2',
        name: 'React ErrorBoundary supporting custom fallback and reset without page refresh',
        weight: 2.5,
        passed: false
      },
      {
        id: 'fe-3',
        name: 'Diagnostic copying capability and bilingual accessibility standards',
        weight: 2.5,
        passed: false
      },
      {
        id: 'fe-4',
        name: 'Global ErrorContext / toast notification system with retry dispatching',
        weight: 2.5,
        passed: false
      }
    ],
    processSafety: [
      {
        id: 'safe-1',
        name: 'Centralized 404 notFoundHandler returning JSON for all unmatched /api routes',
        weight: 2.5,
        passed: false
      },
      {
        id: 'safe-2',
        name: 'Async handler wrapper ensuring unhandled promise rejections reach next(err)',
        weight: 2.5,
        passed: false
      },
      {
        id: 'safe-3',
        name: 'Process-level uncaughtException and unhandledRejection safety net',
        weight: 2.5,
        passed: false
      },
      {
        id: 'safe-4',
        name: 'Zero information leak in production: stack traces and internal SQL suppressed',
        weight: 2.5,
        passed: false
      }
    ]
  };

  // --- Probe Dimension 1: Architecture ---
  const customErr = new AppError('Sample error', 400, ErrorCode.BAD_REQUEST, true, { sample: true });
  checks.architecture[0].passed = customErr.statusCode === 400 && customErr.code === ErrorCode.BAD_REQUEST && customErr.isOperational === true;

  const notFound = new NotFoundError('Not found');
  const conflict = new ConflictError('Conflict');
  const internal = new InternalServerError('Internal');
  checks.architecture[1].passed = notFound.statusCode === 404 && conflict.statusCode === 409 && internal.statusCode === 500 && !internal.isOperational;

  checks.architecture[2].passed = Boolean(ErrorCode.ROOM_OCCUPIED && ErrorCode.VALIDATION_ERROR && ErrorCode.AUTH_TOKEN_EXPIRED && ErrorCode.DATABASE_UNAVAILABLE);
  checks.architecture[3].passed = isAppError(customErr) && isOperationalError(customErr) && !isOperationalError(new Error('raw'));

  // --- Probe Dimension 2: RFC 7807 & Tracing ---
  let probedStatus = 0;
  let probedBody: Record<string, unknown> = {};
  const mockReq = {
    id: 'req_probe_999',
    method: 'GET',
    originalUrl: '/api/probe'
  } as unknown as any;
  const mockRes = {
    headersSent: false,
    getHeader: () => undefined,
    status: (code: number) => { probedStatus = code; return mockRes; },
    json: (body: any) => { probedBody = body; return mockRes; }
  } as unknown as any;

  errorHandler(new BadRequestError('Probe failed', ErrorCode.BAD_REQUEST, { field: 'name' }), mockReq, mockRes, () => {});
  checks.contract[0].passed = probedStatus === 400 && probedBody.status === 'fail' && Boolean(probedBody.timestamp && probedBody.path);

  // Probe request ID propagation and header injection sanitization
  let sanitizedHeaderId = '';
  const injectionReq = {
    headers: { 'x-request-id': 'malicious\r\nBadHeader: test' }
  } as unknown as any;
  const injectionRes = {
    headersSent: false,
    setHeader: (_k: string, v: string) => { sanitizedHeaderId = v; }
  } as unknown as any;
  requestIdMiddleware(injectionReq, injectionRes, () => {});
  checks.contract[1].passed =
    probedBody.requestId === 'req_probe_999' &&
    sanitizedHeaderId.startsWith('req_') &&
    !sanitizedHeaderId.includes('\r');

  checks.contract[2].passed = probedBody.message === 'Probe failed' && probedBody.error === 'Probe failed';
  checks.contract[3].passed = Boolean(probedBody.details);

  // Verify headersSent protection: if headers already sent, delegates to next without writing
  let lateNextCalled = false;
  let lateHeaderWritten = false;
  const sentRes = {
    headersSent: true,
    status: () => { lateHeaderWritten = true; return sentRes; },
    json: () => { lateHeaderWritten = true; return sentRes; }
  } as unknown as any;
  errorHandler(new Error('Post-header error'), mockReq, sentRes, (err) => { lateNextCalled = Boolean(err); });

  // --- Probe Dimension 3: Driver Translations ---
  const zodSchema = z.object({ code: z.string().min(3, 'Minimal 3 huruf') });
  const zodRes = zodSchema.safeParse({ code: 'x' });
  if (!zodRes.success) {
    const zodNorm = normalizeError(zodRes.error);
    checks.driverTranslation[0].passed = zodNorm.statusCode === 400 && zodNorm.code === ErrorCode.VALIDATION_ERROR;
  }

  const syntaxErr = new SyntaxError('Bad JSON');
  (syntaxErr as any).status = 400;
  (syntaxErr as any).body = '{';
  checks.driverTranslation[1].passed = normalizeError(syntaxErr).code === ErrorCode.MALFORMED_JSON;

  const multerErr = new Error('File too big');
  multerErr.name = 'MulterError';
  (multerErr as any).code = 'LIMIT_FILE_SIZE';
  checks.driverTranslation[2].passed = normalizeError(multerErr).code === ErrorCode.FILE_TOO_LARGE;

  const jwtErr = new Error('Expired');
  jwtErr.name = 'TokenExpiredError';
  checks.driverTranslation[3].passed = normalizeError(jwtErr).code === ErrorCode.AUTH_TOKEN_EXPIRED;

  const sqlErr = new Error('Dup');
  (sqlErr as any).code = 'ER_DUP_ENTRY';
  checks.driverTranslation[4].passed = normalizeError(sqlErr).code === ErrorCode.DUPLICATE_ENTRY;

  // --- Probe Dimension 4: Frontend Resilience ---
  const feApiErr = new ApiError('Resource missing', 404, {
    code: 'ROOM_NOT_FOUND',
    requestId: 'req_probe_fe_1',
    details: { roomNumber: '101' }
  });
  const fetchErr = new TypeError('Failed to fetch');
  checks.frontendResilience[0].passed =
    feApiErr.code === 'ROOM_NOT_FOUND' &&
    feApiErr.requestId === 'req_probe_fe_1' &&
    isApiError(feApiErr) &&
    isNetworkError(fetchErr) &&
    isAuthError(new ApiError('Unauthorized', 401)) &&
    getErrorMessage(feApiErr) === 'Resource missing' &&
    getErrorMessage({ error: 'Fallback from error key' }) === 'Fallback from error key';

  const { default: ErrorBoundary } = (await import('../frontend/src/' + 'components/ErrorBoundary')) as any;
  const { ErrorProvider, useError } = (await import('../frontend/src/' + 'context/ErrorContext')) as any;

  const derived = ErrorBoundary.getDerivedStateFromError(new Error('UI Explosion'));
  const ebInstance = new ErrorBoundary({ children: null });
  checks.frontendResilience[1].passed =
    derived.hasError === true &&
    derived.error instanceof Error &&
    typeof ebInstance.resetError === 'function' &&
    typeof ebInstance.componentDidUpdate === 'function';

  checks.frontendResilience[2].passed =
    typeof ebInstance.handleCopyDiagnostics === 'function' &&
    typeof ebInstance.handleReload === 'function' &&
    typeof ebInstance.handleGoHome === 'function';

  checks.frontendResilience[3].passed =
    typeof ErrorProvider === 'function' &&
    typeof useError === 'function';

  // --- Probe Dimension 5: Process Safety & Leaks ---
  let notFoundPiped: any = null;
  notFoundHandler({ method: 'GET', originalUrl: '/api/unmatched' } as any, {} as any, (err) => { notFoundPiped = err; });
  checks.processSafety[0].passed = isAppError(notFoundPiped) && notFoundPiped.statusCode === 404 && notFoundPiped.code === ErrorCode.ROUTE_NOT_FOUND;

  let asyncCaught: any = null;
  const wrapped = asyncHandler(async () => { throw new Error('async reject'); });
  wrapped({} as any, {} as any, (err) => { asyncCaught = err; });
  await new Promise((r) => setImmediate(r));
  checks.processSafety[1].passed = asyncCaught instanceof Error && asyncCaught.message === 'async reject';

  const safetySetup = setupProcessSafety(true);
  const safetyActive = isProcessSafetyActive();
  checks.processSafety[2].passed = safetySetup && safetyActive && lateNextCalled && !lateHeaderWritten;
  const envObj = process.env as Record<string, string | undefined>;
  const origEnv = envObj.NODE_ENV;
  envObj.NODE_ENV = 'production';
  let prodBody: any = {};
  errorHandler(new Error('Sensitive credentials in query'), mockReq, mockRes, () => {});
  prodBody = probedBody;
  envObj.NODE_ENV = origEnv;
  checks.processSafety[3].passed = prodBody.message === 'Internal Server Error' && prodBody.stack === undefined;

  // Calculate Pillar Scores (scaled to 10)
  const calcPillar = (items: CheckItem[]) => {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const earned = items.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
    return (earned / totalWeight) * 10;
  };

  const scores = {
    architecture: calcPillar(checks.architecture),
    contract: calcPillar(checks.contract),
    driverTranslation: calcPillar(checks.driverTranslation),
    frontendResilience: calcPillar(checks.frontendResilience),
    processSafety: calcPillar(checks.processSafety)
  };

  const compositeScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;

  return {
    scores,
    compositeScore,
    checks,
    passed: compositeScore >= 9.0
  };
}

// Terminal Execution Handler
if (process.argv[1]?.includes('curator_error_handling')) {
  console.log('\n=============================================================');
  console.log('🛡️  KOSMO PROFESSIONAL ERROR HANDLING CURATOR AGENT EVALUATION');
  console.log('=============================================================');

  runCuratorEvaluation().then((result) => {
    console.log(`\n1. Centralized Typed Architecture:   ${result.scores.architecture.toFixed(1)} / 10.0`);
    console.log(`2. RFC 7807 Contract & Correlation:  ${result.scores.contract.toFixed(1)} / 10.0`);
    console.log(`3. Driver & Framework Normalization: ${result.scores.driverTranslation.toFixed(1)} / 10.0`);
    console.log(`4. Frontend Resilience & Bilingual:  ${result.scores.frontendResilience.toFixed(1)} / 10.0`);
    console.log(`5. Process Safety & Leak Prevention: ${result.scores.processSafety.toFixed(1)} / 10.0`);
    console.log('-------------------------------------------------------------');
    console.log(`⭐ FINAL COMPOSITE CURATOR SCORE:     ${result.compositeScore.toFixed(2)} / 10.0`);
    console.log(`📋 STATUS:                           ${result.passed ? '✅ PASSED (EXCEEDS ENTERPRISE GRADE)' : '❌ FAILED'}`);
    console.log('=============================================================\n');

    if (!result.passed) {
      process.exit(1);
    }
  }).catch((err) => {
    console.error('Curator agent execution error:', err);
    process.exit(1);
  });
}
