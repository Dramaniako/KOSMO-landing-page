import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

export const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi')
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Nama wajib diisi minimal 2 karakter'),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  phone: z
    .string({ message: 'Nomor telepon wajib diisi saat mendaftar akun' })
    .trim()
    .min(9, 'Nomor telepon minimal 9 digit')
    .max(20, 'Nomor telepon maksimal 20 digit')
    .regex(
      /^(?:\+?\d{9,16}|08\d{7,13}|0\d{8,14})$/,
      'Format nomor telepon tidak valid (contoh: 08123456789 atau +628123456789)'
    )
});

export const adminCreateUserSchema = z.object({
  name: z.string().min(2, 'Nama wajib diisi minimal 2 karakter'),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  role: z.enum(['admin', 'landlord', 'tenant'], { message: 'Role harus admin, landlord, atau tenant' }),
  phone: z.string().optional().or(z.literal('')),
  paymentMethod: z.string().optional().or(z.literal(''))
});

export const adminUpdateUserSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter').optional(),
  email: z.string().email('Format email tidak valid').optional(),
  password: z.string().min(6, 'Password minimal 6 karakter').optional().or(z.literal('')),
  role: z.enum(['admin', 'landlord', 'tenant'], { message: 'Role harus admin, landlord, atau tenant' }).optional(),
  phone: z.string().optional().or(z.literal('')),
  paymentMethod: z.string().optional().or(z.literal(''))
});

export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter').optional(),
  phone: z
    .string()
    .trim()
    .min(9, 'Nomor telepon minimal 9 digit')
    .max(20, 'Nomor telepon maksimal 20 digit')
    .regex(
      /^(?:\+?\d{9,16}|08\d{7,13}|0\d{8,14})$/,
      'Format nomor telepon tidak valid (contoh: 08123456789 atau +628123456789)'
    )
    .optional(),
  paymentMethod: z.string().optional(),
  notifications: z
    .preprocess((val) => {
      if (typeof val === 'number') return val === 1;
      if (typeof val === 'string') return val === 'true' || val === '1';
      return val;
    }, z.boolean())
    .optional(),
  language: z.string().optional(),
  identity_type: z.enum(['NIK', 'PASSPORT']).optional(),
  identity_number: z
    .string()
    .trim()
    .regex(
      /^(?:\d{16}|[A-Za-z0-9]{6,12})$/,
      'NIK harus 16 digit angka atau Paspor 6-12 karakter alfanumerik'
    )
    .optional()
    .or(z.literal('')),
  address: z.string().min(5, 'Alamat domisili minimal 5 karakter').optional().or(z.literal('')),
  occupation: z.string().min(2, 'Pekerjaan/Profesi minimal 2 karakter').optional().or(z.literal('')),
  emergency_contact_name: z.string().min(2, 'Nama kontak darurat minimal 2 karakter').optional().or(z.literal('')),
  emergency_contact_relation: z.string().optional().or(z.literal('')),
  emergency_contact_phone: z
    .string()
    .trim()
    .min(9, 'Nomor telepon kontak darurat minimal 9 digit')
    .max(20, 'Nomor telepon kontak darurat maksimal 20 digit')
    .regex(
      /^(?:\+?\d{9,16}|08\d{7,13}|0\d{8,14})$/,
      'Format nomor telepon kontak darurat tidak valid'
    )
    .optional()
    .or(z.literal('')),
  date_of_birth: z.string().optional().or(z.literal('')),
  gender: z.string().optional().or(z.literal(''))
});

export const propertySchema = z.object({
  name: z.string().min(1, 'Nama properti wajib diisi'),
  district: z.string().min(1, 'Kabupaten/Kota wajib diisi'),
  address: z.string().min(1, 'Alamat wajib diisi'),
  price: z.number().positive('Harga harus lebih besar dari 0'),
  totalRooms: z.number().int().positive('Total kamar harus lebih besar dari 0'),
  ownerId: z.string().min(1, 'ownerId wajib diisi').optional()
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
  signatureBase64: z.string().max(1_000_000, 'Ukuran data tanda tangan digital melebihi batas maksimum 1MB').optional(),
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
    .max(1_000_000, 'Ukuran data tanda tangan digital melebihi batas maksimum 1MB')
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
