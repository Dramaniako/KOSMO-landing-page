import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

export const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi')
});

export const registerSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  phone: z.string().optional()
});

export const propertySchema = z.object({
  name: z.string().min(1, 'Nama properti wajib diisi'),
  district: z.string().min(1, 'Kabupaten/Kota wajib diisi'),
  address: z.string().min(1, 'Alamat wajib diisi'),
  price: z.number().positive('Harga harus lebih besar dari 0'),
  totalRooms: z.number().int().positive('Total kamar harus lebih besar dari 0'),
  ownerId: z.string().min(1, 'ownerId wajib diisi')
});

export const withdrawalSchema = z.object({
  amount: z.number().positive('Jumlah penarikan harus lebih besar dari 0'),
  bankName: z.string().min(1, 'Nama bank wajib diisi'),
  accountNumber: z.string().min(1, 'Nomor rekening wajib diisi'),
  accountHolder: z.string().optional()
});

export const reviewSchema = z.object({
  propertyId: z.string().min(1, 'propertyId wajib diisi'),
  comment: z.string().min(1, 'Komentar ulasan wajib diisi'),
  rating: z.number().int().min(1, 'Rating minimal 1').max(5, 'Rating maksimal 5')
});

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errorMessages = result.error.issues.map((e: z.ZodIssue) => e.message).join(', ');
      res.status(400).json({ message: errorMessages, errors: result.error.flatten() });
      return;
    }
    next();
  };
}
