import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Augment Express Request interface to include request IDs
declare global {
  namespace Express {
    interface Request {
      id?: string;
      requestId?: string;
    }
  }
}

const REQUEST_ID_REGEX = /^[a-zA-Z0-9_.-]{1,128}$/;

/**
 * Request Correlation ID Middleware.
 * Generates or propagates a unique correlation ID across requests, logs, and error responses.
 * Enforces sanitization to prevent HTTP response header injection and malformed headers.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const rawHeader = req.headers['x-request-id'];
  const incomingId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  const requestId = typeof incomingId === 'string' && REQUEST_ID_REGEX.test(incomingId.trim())
    ? incomingId.trim()
    : `req_${crypto.randomUUID()}`;

  req.id = requestId;
  req.requestId = requestId;

  try {
    if (!res.headersSent) {
      res.setHeader('X-Request-Id', requestId);
    }
  } catch {
    // Gracefully ignore header set error if connection aborted or closed
  }

  next();
}
