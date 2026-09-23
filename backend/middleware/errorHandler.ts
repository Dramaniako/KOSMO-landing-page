import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode, isAppError, isOperationalError } from '../errors/index';

export interface ErrorResponsePayload {
  status: 'fail' | 'error';
  statusCode: number;
  code: string;
  message: string;
  error: string;
  details?: unknown;
  errors?: unknown;
  requestId?: string;
  timestamp: string;
  path?: string;
  stack?: string;
}

/**
 * Type guard for NodeJS/MySQL Error objects with code properties.
 */
interface NodeError extends Error {
  code?: string | number;
  errno?: number;
  sqlState?: string;
  sqlMessage?: string;
  status?: number;
  statusCode?: number;
}

/**
 * Normalizes any unknown thrown error into an AppError instance.
 */
export function normalizeError(err: unknown): AppError {
  if (isAppError(err)) {
    return err;
  }

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    const errorMessages = err.issues.map((issue) => issue.message).join(', ');
    return new AppError(
      errorMessages || 'Validasi data gagal.',
      400,
      ErrorCode.VALIDATION_ERROR,
      true,
      err.flatten()
    );
  }

  const errorObj = err as NodeError;

  // Handle Body-Parser JSON Syntax Error (e.g. malformed JSON body)
  if (errorObj instanceof SyntaxError && 'body' in errorObj && errorObj.status === 400) {
    return new AppError(
      'Format payload JSON tidak valid.',
      400,
      ErrorCode.MALFORMED_JSON,
      true
    );
  }

  // Handle Multer File Upload Errors
  if (errorObj.name === 'MulterError') {
    if (errorObj.code === 'LIMIT_FILE_SIZE') {
      return new AppError('Ukuran file melebihi batas maksimum 5MB.', 400, ErrorCode.FILE_TOO_LARGE, true);
    }
    if (errorObj.code === 'LIMIT_FILE_COUNT') {
      return new AppError('Jumlah file melebihi batas maksimum 10.', 400, ErrorCode.FILE_LIMIT_EXCEEDED, true);
    }
    if (errorObj.code === 'LIMIT_UNEXPECTED_FILE') {
      return new AppError('Field unggahan file tidak valid.', 400, ErrorCode.FILE_UNSUPPORTED_TYPE, true);
    }
    return new AppError(`Kesalahan unggahan file: ${errorObj.message}`, 400, ErrorCode.FILE_UPLOAD_FAILED, true);
  }

  // Handle JWT Errors
  if (errorObj.name === 'TokenExpiredError') {
    return new AppError('Token telah kadaluarsa. Silakan masuk kembali.', 401, ErrorCode.AUTH_TOKEN_EXPIRED, true);
  }
  if (errorObj.name === 'JsonWebTokenError') {
    return new AppError('Token tidak valid.', 401, ErrorCode.AUTH_TOKEN_INVALID, true);
  }

  // Handle MySQL / TiDB Driver Errors
  if (typeof errorObj.code === 'string') {
    if (errorObj.code === 'ER_DUP_ENTRY' || errorObj.errno === 1062) {
      return new AppError(
        'Data sudah ada di sistem (duplikasi entri).',
        409,
        ErrorCode.DUPLICATE_ENTRY,
        true
      );
    }
    if (errorObj.code === 'ER_NO_REFERENCED_ROW' || errorObj.code === 'ER_NO_REFERENCED_ROW_2' || errorObj.errno === 1452) {
      return new AppError(
        'Data referensi tidak ditemukan (Foreign Key Violation).',
        400,
        ErrorCode.FOREIGN_KEY_VIOLATION,
        true
      );
    }
    if (errorObj.code === 'ER_ROW_IS_REFERENCED' || errorObj.code === 'ER_ROW_IS_REFERENCED_2' || errorObj.errno === 1451) {
      return new AppError(
        'Data tidak dapat dihapus karena masih terkait dengan entitas lain.',
        409,
        ErrorCode.CONFLICT,
        true
      );
    }
    if (
      errorObj.code === 'ECONNREFUSED' ||
      errorObj.code === 'ETIMEDOUT' ||
      errorObj.code === 'PROTOCOL_CONNECTION_LOST' ||
      errorObj.code === 'ER_ACCESS_DENIED_ERROR'
    ) {
      return new AppError(
        'Koneksi ke basis data terputus. Silakan coba kembali beberapa saat lagi.',
        503,
        ErrorCode.DATABASE_UNAVAILABLE,
        true
      );
    }
  }

  // Default fallback for unexpected/programmer errors
  const message = errorObj?.message && typeof errorObj.message === 'string'
    ? errorObj.message
    : 'Internal Server Error';

  const statusCode = typeof errorObj?.statusCode === 'number'
    ? errorObj.statusCode
    : typeof errorObj?.status === 'number'
      ? errorObj.status
      : 500;

  return new AppError(message, statusCode, ErrorCode.INTERNAL_SERVER_ERROR, false);
}

/**
 * Centralized Error Handling Middleware for Express.
 * Formats RFC 7807 compatible error payloads, maintains backward compatibility,
 * logs diagnostics, and prevents internal data leaks in production.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const normalized = normalizeError(err);
  const requestId = req.id || req.requestId || (res.getHeader('X-Request-Id') as string) || undefined;
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

  // Operational vs Programmer error handling
  const isOperational = isOperationalError(normalized);
  const statusCode = normalized.statusCode || 500;
  const status = statusCode >= 500 ? 'error' : 'fail';

  // Sanitized message in production for non-operational 5xx errors
  let clientMessage = normalized.message;
  if (!isOperational && statusCode >= 500 && isProduction) {
    clientMessage = 'Internal Server Error';
  }

  // Structured Log Output
  const logPrefix = `[API ${statusCode}] [${normalized.code}]`;
  if (statusCode >= 500) {
    console.error(
      `${logPrefix} ${req.method} ${req.originalUrl || req.url} - RequestID: ${requestId || 'none'}`,
      err
    );
  } else {
    console.warn(
      `${logPrefix} ${req.method} ${req.originalUrl || req.url} - RequestID: ${requestId || 'none'} - ${clientMessage}`
    );
  }

  // Construct RFC 7807 & backward-compatible response payload
  const responsePayload: ErrorResponsePayload = {
    status,
    statusCode,
    code: normalized.code,
    message: clientMessage,
    error: clientMessage,
    timestamp: normalized.timestamp || new Date().toISOString(),
    path: req.originalUrl || req.url
  };

  if (requestId) {
    responsePayload.requestId = requestId;
  }

  if (normalized.details !== undefined) {
    responsePayload.details = normalized.details;
    // For Zod errors, preserve 'errors' field for backward compatibility
    if (normalized.code === ErrorCode.VALIDATION_ERROR) {
      responsePayload.errors = normalized.details;
    }
  }

  // Include stack trace only in non-production environments
  if (!isProduction && err instanceof Error && err.stack) {
    responsePayload.stack = err.stack;
  }

  res.status(statusCode).json(responsePayload);
}
