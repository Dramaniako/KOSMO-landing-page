import type { Request, Response, NextFunction } from 'express';
import { NotFoundError, ErrorCode } from '../errors/index';

/**
 * 404 Route Not Found Middleware.
 * Catches any unmapped API endpoints and forwards a NotFoundError to the centralized error handler.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  const message = `Endpoint [${req.method}] ${req.originalUrl || req.url} tidak ditemukan.`;
  next(new NotFoundError(message, ErrorCode.ROUTE_NOT_FOUND));
}
