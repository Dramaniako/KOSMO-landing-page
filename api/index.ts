import type { Request, Response } from 'express';
import app from '../backend/server.ts';

export default async function handler(req: Request, res: Response) {
  return app(req, res);
}
