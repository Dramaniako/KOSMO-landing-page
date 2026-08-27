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

/**
 * Zod Schema for POST /api/rentals/contract/preview
 * Allows generating draft preview data and memory PDF preview without persisting tenancy.
 */
export const previewContractSchema = z.object({
  propertyId: z.string().min(1, 'ID properti wajib diisi'),
  durationMonths: z
    .number()
    .int('Durasi sewa harus berupa bilangan bulat')
    .min(1, 'Durasi sewa minimal 1 bulan')
    .max(120, 'Durasi sewa maksimal 120 bulan')
    .optional()
    .default(1),
  startDate: z.string().optional(),
  tenantNikPassport: z
    .string()
    .trim()
    .regex(
      /^(?:\d{16}|[A-Za-z0-9]{6,12})$/,
      'NIK harus 16 digit angka atau nomor Paspor 6-12 karakter alfanumerik'
    )
    .optional()
    .or(z.literal('')),
  signatureBase64: z.string().optional(),
  rentalId: z.string().optional()
});

/**
 * Zod Schema for POST /api/rentals/contract/sign
 * Strictly enforces all evidentiary and statutory requirements for binding execution.
 */
export const signContractSchema = z.object({
  propertyId: z.string().min(1, 'ID properti wajib diisi'),
  durationMonths: z
    .number()
    .int('Durasi sewa harus berupa bilangan bulat')
    .min(1, 'Durasi sewa minimal 1 bulan')
    .max(120, 'Durasi sewa maksimal 120 bulan'),
  startDate: z.string().min(1, 'Tanggal mulai sewa wajib diisi'),
  tenantNikPassport: z
    .string()
    .trim()
    .min(1, 'NIK / Nomor Paspor wajib diisi')
    .regex(
      /^(?:\d{16}|[A-Za-z0-9]{6,12})$/,
      'NIK harus berupa 16 digit angka atau nomor Paspor yang valid (6-12 karakter alfanumerik)'
    ),
  signatureBase64: z
    .string()
    .min(20, 'Tanda tangan digital wajib diisi')
    .refine(
      (val) =>
        /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(val) ||
        /^[A-Za-z0-9+/=]{20,}$/.test(val),
      {
        message: 'Tanda tangan digital harus berupa data URL gambar base64 yang valid'
      }
    ),
  affirmativeConsent: z.literal(true, {
    message: 'Penyewa wajib menyetujui syarat dan ketentuan perjanjian sewa (affirmative clickwrap consent)'
  }),
  rentalId: z.string().optional()
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
