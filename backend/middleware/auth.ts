import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { UserRole } from '../types/index';

export interface JWTPayload {
  id: string;
  email: string;
  role: UserRole;
}

export function generateJwtToken(
  payload: JWTPayload,
  secret = process.env.JWT_SECRET || 'super-secret-jwt-key-with-high-entropy-minimum-32-chars',
  expiresIn: SignOptions['expiresIn'] = '7d'
): string {
  const options: SignOptions = {};
  if (expiresIn !== undefined) {
    options.expiresIn = expiresIn;
  }
  return jwt.sign(payload, secret, options);
}

export function verifyJwtToken(
  token: string,
  secret = process.env.JWT_SECRET || 'super-secret-jwt-key-with-high-entropy-minimum-32-chars'
): JWTPayload {
  const decoded = jwt.verify(token, secret);
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Invalid token payload');
  }
  const { id, email, role } = decoded as Partial<JWTPayload>;
  if (!id || !email || !role) {
    throw new Error('Malformed token claims');
  }
  return { id, email, role };
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

  if (!token) {
    res.status(401).json({ message: 'Akses ditolak. Token otentikasi diperlukan.' });
    return;
  }

  try {
    const user = verifyJwtToken(token);
    (req as AuthenticatedRequest).user = user;
    next();
  } catch (err: unknown) {
    res.status(403).json({ message: 'Token tidak valid atau telah kedaluwarsa.' });
  }
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json({ message: 'Akses ditolak. Token otentikasi diperlukan.' });
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ message: 'Akses ditolak. Peran Anda tidak memiliki izin untuk tindakan ini.' });
      return;
    }
    next();
  };
};
