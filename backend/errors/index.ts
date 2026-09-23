/**
 * KOSMO Professional-Grade Centralized Error Architecture
 * Standardized typed error hierarchy, domain error codes, and operational classification.
 */

export const ErrorCode = {
  // General & System
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  BAD_GATEWAY: 'BAD_GATEWAY',
  MALFORMED_JSON: 'MALFORMED_JSON',

  // Database & Persistence
  DATABASE_ERROR: 'DATABASE_ERROR',
  DATABASE_CONNECTION_FAILED: 'DATABASE_CONNECTION_FAILED',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  FOREIGN_KEY_VIOLATION: 'FOREIGN_KEY_VIOLATION',

  // Authentication & Access Control
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_PASSWORD_REQUIRED: 'AUTH_PASSWORD_REQUIRED',
  AUTH_PASSWORD_INCORRECT: 'AUTH_PASSWORD_INCORRECT',
  AUTH_USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  AUTH_EMAIL_EXISTS: 'AUTH_EMAIL_EXISTS',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',

  // Property & Room Inventory
  PROPERTY_NOT_FOUND: 'PROPERTY_NOT_FOUND',
  PROPERTY_ACCESS_DENIED: 'PROPERTY_ACCESS_DENIED',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_OCCUPIED: 'ROOM_OCCUPIED',
  ROOM_MAINTENANCE: 'ROOM_MAINTENANCE',
  ROOM_ALREADY_EXISTS: 'ROOM_ALREADY_EXISTS',
  ROOMS_FULL: 'ROOMS_FULL',

  // Rental & Contract Tenancy
  RENTAL_NOT_FOUND: 'RENTAL_NOT_FOUND',
  RENTAL_ACCESS_DENIED: 'RENTAL_ACCESS_DENIED',
  RENTAL_ALREADY_ACTIVE: 'RENTAL_ALREADY_ACTIVE',
  SINGLE_ACTIVE_TENANCY_VIOLATION: 'SINGLE_ACTIVE_TENANCY_VIOLATION',
  CONTRACT_PREVIEW_FAILED: 'CONTRACT_PREVIEW_FAILED',
  CONTRACT_SIGNING_FAILED: 'CONTRACT_SIGNING_FAILED',
  CONTRACT_AFFIRMATIVE_CONSENT_REQUIRED: 'CONTRACT_AFFIRMATIVE_CONSENT_REQUIRED',

  // Financial & Withdrawal
  WITHDRAWAL_INSUFFICIENT_BALANCE: 'WITHDRAWAL_INSUFFICIENT_BALANCE',
  WITHDRAWAL_INVALID_AMOUNT: 'WITHDRAWAL_INVALID_AMOUNT',
  WITHDRAWAL_ALREADY_PROCESSED: 'WITHDRAWAL_ALREADY_PROCESSED',
  PAYMENT_UNCONFIGURED: 'PAYMENT_UNCONFIGURED',
  PAYMENT_GATEWAY_ERROR: 'PAYMENT_GATEWAY_ERROR',
  PAYMENT_SIGNATURE_INVALID: 'PAYMENT_SIGNATURE_INVALID',

  // Media & Storage
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_UNSUPPORTED_TYPE: 'FILE_UNSUPPORTED_TYPE',
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
  FILE_LIMIT_EXCEEDED: 'FILE_LIMIT_EXCEEDED'
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode] | string;

/**
 * Base Application Error class.
 * All operational, known application errors extend from this class.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeType;
  public readonly isOperational: boolean;
  public readonly details?: unknown;
  public readonly timestamp: string;

  constructor(
    message: string,
    statusCode = 500,
    code: ErrorCodeType = ErrorCode.INTERNAL_SERVER_ERROR,
    isOperational = true,
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Maintain clean stack trace (V8 runtime)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * 400 Bad Request Error
 */
export class BadRequestError extends AppError {
  constructor(message = 'Permintaan tidak valid.', code: ErrorCodeType = ErrorCode.BAD_REQUEST, details?: unknown) {
    super(message, 400, code, true, details);
  }
}

/**
 * 400 Validation Error (e.g. Zod schema or input validation failures)
 */
export class ValidationError extends AppError {
  constructor(message = 'Validasi data gagal.', details?: unknown) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, true, details);
  }
}

/**
 * 401 Unauthorized Error (Authentication failure or missing credentials)
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Autentikasi diperlukan. Silakan masuk terlebih dahulu.', code: ErrorCodeType = ErrorCode.UNAUTHORIZED) {
    super(message, 401, code, true);
  }
}

/**
 * 403 Forbidden Error (Authenticated user lacks sufficient permission/role)
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Akses ditolak. Anda tidak memiliki izin untuk aksi ini.', code: ErrorCodeType = ErrorCode.FORBIDDEN) {
    super(message, 403, code, true);
  }
}

/**
 * 404 Not Found Error (Resource or endpoint does not exist)
 */
export class NotFoundError extends AppError {
  constructor(message = 'Sumber daya yang diminta tidak ditemukan.', code: ErrorCodeType = ErrorCode.NOT_FOUND) {
    super(message, 404, code, true);
  }
}

/**
 * 409 Conflict Error (Resource state conflict, race condition, or unique constraint violation)
 */
export class ConflictError extends AppError {
  constructor(message = 'Terjadi konflik pada status sumber daya.', code: ErrorCodeType = ErrorCode.CONFLICT, details?: unknown) {
    super(message, 409, code, true, details);
  }
}

/**
 * 422 Unprocessable Entity Error
 */
export class UnprocessableEntityError extends AppError {
  constructor(message = 'Entitas tidak dapat diproses.', code: ErrorCodeType = ErrorCode.UNPROCESSABLE_ENTITY, details?: unknown) {
    super(message, 422, code, true, details);
  }
}

/**
 * 429 Too Many Requests Error (Rate limiting)
 */
export class RateLimitError extends AppError {
  constructor(message = 'Terlalu banyak permintaan. Silakan coba beberapa saat lagi.') {
    super(message, 429, ErrorCode.RATE_LIMIT_EXCEEDED, true);
  }
}

/**
 * 500 Internal Server Error (Programmer errors or unexpected internal failures)
 */
export class InternalServerError extends AppError {
  constructor(message = 'Terjadi kesalahan internal pada server.', details?: unknown) {
    super(message, 500, ErrorCode.INTERNAL_SERVER_ERROR, false, details);
  }
}

/**
 * 503 Service Unavailable Error (Downstream database or gateway failure)
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Layanan sementara tidak tersedia. Silakan coba kembali nanti.', code: ErrorCodeType = ErrorCode.SERVICE_UNAVAILABLE) {
    super(message, 503, code, true);
  }
}

/**
 * Database Error (Wraps MySQL failures into operational or non-operational application error)
 */
export class DatabaseError extends AppError {
  constructor(message = 'Terjadi kesalahan pada basis data.', code: ErrorCodeType = ErrorCode.DATABASE_ERROR, isOperational = true, details?: unknown) {
    super(message, 500, code, isOperational, details);
  }
}

/**
 * Type guard to check if an unknown error is an operational AppError.
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard to check if an error is operational (safe to expose client message).
 */
export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}
