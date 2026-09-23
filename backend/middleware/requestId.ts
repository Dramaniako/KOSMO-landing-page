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

/**
 * Request Correlation ID Middleware.
 * Generates or propagates a unique correlation ID across requests, logs, and error responses.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim().length > 0
    ? incomingId.trim()
    : `req_${crypto.randomUUID()}`;

  req.id = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}
