import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Higher-order utility to wrap async route handlers.
 * Guarantees that any uncaught rejected promise is piped to Express next(err) middleware.
 */
export function asyncHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = qs.ParsedQs
>(
  fn: (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction
  ) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(
      fn(
        req as unknown as Request<P, ResBody, ReqBody, ReqQuery>,
        res as unknown as Response<ResBody>,
        next
      )
    ).catch(next);
  };
}
