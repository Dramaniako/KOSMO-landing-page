import express from 'express';
import type { Request, Response, Router, NextFunction } from 'express';
import { pool } from './db.ts';
import XLSX from 'xlsx';
import multer from 'multer';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import midtransClient from 'midtrans-client';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import fs from 'fs';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { generateRentalContractPdf } from './services/contract.ts';
import {
  generateJwtToken,
  verifyJwtToken,
  authenticateToken,
  requireRole
} from './middleware/auth.ts';
import type { JWTPayload, AuthenticatedRequest } from './middleware/auth.ts';
import {
  loginSchema,
  registerSchema,
  propertySchema,
  validateBody
} from './middleware/validation.ts';
import type {
  KosRoom,
  Booking,
  User,
  UserRole,
  Amenity,
  BookingStatus
} from './types/index.ts';

export {
  generateJwtToken,
  verifyJwtToken,
  authenticateToken,
  requireRole
};
export type { JWTPayload, AuthenticatedRequest };

// Rate Limiter for Authentication Endpoints (max 10 requests per minute)
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak percobaan masuk/daftar. Silakan coba lagi dalam 1 menit.' }
});

const router: Router = express.Router();

import { uploadImageStream } from './services/cloudinary.ts';

export const ALLOWED_IMAGE_MIMETYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
  'image/gif'
] as const;

export function validateImageMimeType(mimetype: string): boolean {
  if (!mimetype) return false;
  return ALLOWED_IMAGE_MIMETYPES.includes(mimetype.toLowerCase() as typeof ALLOWED_IMAGE_MIMETYPES[number]);
}

// Multer in-memory file upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Generic Upload endpoint
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

router.post('/upload', upload.single('image'), async (req: MulterRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Tidak ada file yang diunggah.' });
  }

  if (!validateImageMimeType(req.file.mimetype)) {
    return res.status(400).json({
      message: 'Format file tidak didukung. Harap unggah gambar (JPEG, PNG, WebP, GIF).'
    });
  }

  try {
    const result = await uploadImageStream(req.file.buffer, 'kosmo_properties');
    res.json({
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (err: unknown) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ message: 'Gagal mengunggah gambar ke Cloudinary.' });
  }
});

// ID Generator
const generateId = (prefix: string): string => `${prefix}-${Math.random().toString(36).substring(2, 9)}`;

// ==========================================
// Authentication Endpoints
// ==========================================
interface LoginBody {
  email?: string;
  password?: string;
}

interface RegisterBody {
  email?: string;
  password?: string;
  name?: string;
  phone?: string;
}

interface UserRow extends RowDataPacket {
  id: string;
  email: string;
  password?: string;
  name: string;
  role: UserRole;
  phone: string;
  paymentMethod?: string;
  avatar?: string | null;
  notifications?: boolean | number;
  language?: string;
  balance?: number | string;
  totalRevenue?: number | string;
  totalWithdrawn?: number | string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
}

router.post('/auth/login', authLimiter, validateBody(loginSchema), async (req: Request<Record<string, never>, unknown, LoginBody>, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email dan password wajib diisi." });
  }

  try {
    const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user || !user.password || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    // Exclude password from the returned object
    const safeUser: Partial<UserRow> = { ...user };
    delete safeUser.password;
    const token = generateJwtToken({
      id: user.id,
      email: user.email,
      role: user.role
    });

    res.json({
      message: "Login berhasil!",
      user: safeUser,
      token
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});

router.post('/auth/register', authLimiter, validateBody(registerSchema), async (req: Request<Record<string, never>, unknown, RegisterBody>, res: Response) => {
  const { email, password, name, phone } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ message: "Nama, email, dan password wajib diisi." });
  }

  try {
    const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      return res.status(400).json({ message: "Email sudah terdaftar." });
    }

    const userId = generateId("user");
    const hashedPassword = bcrypt.hashSync(password, 10);
    await pool.query(
      `INSERT INTO users (id, email, password, name, role, phone, paymentMethod) 
       VALUES (?, ?, ?, ?, 'tenant', ?, 'Virtual Account')`,
      [userId, email, hashedPassword, name, phone || '']
    );

    const [newUsers] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [userId]);
    const newUser = newUsers[0];
    const safeUser: Partial<UserRow> = { ...newUser };
    delete safeUser.password;
    const token = generateJwtToken({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role
    });

    res.status(201).json({
      message: "Registrasi berhasil!",
      user: safeUser,
      token
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});

// ==========================================
// User Profiles & Admin User Management (CRUD)
// ==========================================
interface UserProfileBody {
  name?: string;
  phone?: string;
  paymentMethod?: string;
  notifications?: boolean;
  language?: string;
}

interface AdminCreateUserBody {
  email?: string;
  password?: string;
  name?: string;
  role?: UserRole;
  phone?: string;
  paymentMethod?: string;
}

interface AdminUpdateUserBody {
  name?: string;
  email?: string;
  role?: UserRole;
  phone?: string;
  paymentMethod?: string;
  password?: string;
}

router.get('/users/profile/:id', authenticateToken, async (req: Request<{ id: string }>, res: Response) => {
  try {
    const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [req.params.id]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    const safeUser: Partial<UserRow> = { ...user };
    delete safeUser.password;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil profil user." });
  }
});

router.put('/users/profile/:id', authenticateToken, async (req: Request<{ id: string }, unknown, UserProfileBody>, res: Response) => {
  const { id } = req.params;
  const { name, phone, paymentMethod, notifications, language } = req.body;

  try {
    const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    const notifVal = notifications !== undefined ? (notifications ? 1 : 0) : 1;

    await pool.query(
      `UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), 
       paymentMethod = COALESCE(?, paymentMethod), notifications = ?, language = COALESCE(?, language) 
       WHERE id = ?`,
      [name, phone, paymentMethod, notifVal, language, id]
    );

    const [updatedUsers] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
    const updatedUser = updatedUsers[0];
    const safeUser: Partial<UserRow> = { ...updatedUser };
    delete safeUser.password;
    res.json({
      message: "Profil berhasil diperbarui!",
      user: safeUser
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ message: "Gagal memperbarui profil." });
  }
});

// Admin Route: Get all users
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, email, name, role, phone, paymentMethod, balance, totalRevenue, totalWithdrawn FROM users'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data user." });
  }
});

// Admin Route: Create user
router.post('/users', async (req: Request<Record<string, never>, unknown, AdminCreateUserBody>, res: Response) => {
  const { email, password, name, role, phone, paymentMethod } = req.body;
  if (!email || !password || !name || !role) {
    return res.status(400).json({ message: "Nama, email, password, dan role wajib diisi." });
  }

  try {
    const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      return res.status(400).json({ message: "Email sudah terdaftar." });
    }

    const userId = generateId("user");
    const hashedPassword = bcrypt.hashSync(password, 10);
    await pool.query(
      `INSERT INTO users (id, email, password, name, role, phone, paymentMethod) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, hashedPassword, name, role, phone || '', paymentMethod || 'Virtual Account']
    );

    res.status(201).json({ message: "User berhasil dibuat!" });
  } catch (err) {
    res.status(500).json({ message: "Gagal membuat user." });
  }
});

// Admin Route: Update user role / details
router.put('/users/:id', async (req: Request<{ id: string }, unknown, AdminUpdateUserBody>, res: Response) => {
  const { id } = req.params;
  const { name, email, role, phone, paymentMethod, password } = req.body;

  try {
    const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      await pool.query(
        `UPDATE users SET name = ?, email = ?, role = ?, phone = ?, paymentMethod = ?, password = ? WHERE id = ?`,
        [name, email, role, phone || '', paymentMethod || '', hashedPassword, id]
      );
    } else {
      await pool.query(
        `UPDATE users SET name = ?, email = ?, role = ?, phone = ?, paymentMethod = ? WHERE id = ?`,
        [name, email, role, phone || '', paymentMethod || '', id]
      );
    }

    res.json({ message: "User berhasil diperbarui!" });
  } catch (err) {
    res.status(500).json({ message: "Gagal memperbarui user." });
  }
});

// Admin Route: Delete user
router.delete('/users/:id', async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  if (id === 'user-admin') {
    return res.status(400).json({ message: "Admin utama tidak dapat dihapus." });
  }

  try {
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: "User berhasil dihapus!" });
  } catch (err) {
    res.status(500).json({ message: "Gagal menghapus user." });
  }
});

// ==========================================
// Properties API (CRUD)
// ==========================================
interface PropertyRow extends RowDataPacket {
  id: string;
  name: string;
  district: string;
  address: string;
  price: number;
  rating: number;
  image: string;
  description: string;
  latitude: string;
  longitude: string;
  totalRooms: number;
  occupiedRooms: number;
  ownerId: string | null;
  document: string;
  facilities?: Amenity[] | string[];
}

interface FacilityRow extends RowDataPacket {
  facility: string;
}

interface CreatePropertyBody {
  name?: string;
  district?: string;
  address?: string;
  price?: number | string;
  description?: string;
  facilities?: string[];
  latitude?: string;
  longitude?: string;
  totalRooms?: number | string;
  image?: string;
  ownerId?: string;
}

function normalizeProperty(p: PropertyRow): PropertyRow {
  return {
    ...p,
    price: Number(p.price) || 0,
    totalRooms: Number(p.totalRooms) || 0,
    occupiedRooms: Number(p.occupiedRooms) || 0,
    rating: Number(p.rating) || 0,
    image: p.image && p.image.trim() !== ''
      ? p.image
      : 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
    facilities: Array.isArray(p.facilities) ? p.facilities : []
  };
}

router.get('/properties', async (req: Request, res: Response) => {
  const { district, priceMin, priceMax, facility } = req.query;

  try {
    let sql = 'SELECT * FROM properties WHERE 1=1';
    const params: (string | number)[] = [];

    if (district && district !== 'Semua') {
      sql += ' AND district = ?';
      params.push(String(district));
    }
    if (priceMin) {
      sql += ' AND price >= ?';
      params.push(parseInt(String(priceMin), 10));
    }
    if (priceMax) {
      sql += ' AND price <= ?';
      params.push(parseInt(String(priceMax), 10));
    }

    const [properties] = await pool.query<PropertyRow[]>(sql, params);

    // Fetch facilities for each property
    for (const prop of properties) {
      const [facRows] = await pool.query<FacilityRow[]>('SELECT facility FROM property_facilities WHERE propertyId = ?', [prop.id]);
      prop.facilities = facRows.map(r => r.facility);
    }

    // Filter by facility in JS if requested
    let filteredProperties = properties;
    if (facility) {
      const facilitiesList = Array.isArray(facility) ? facility.map(String) : [String(facility)];
      filteredProperties = properties.filter(p =>
        facilitiesList.every(f => (p.facilities || []).map(item => item.toLowerCase()).includes(f.toLowerCase()))
      );
    }

    res.json(filteredProperties.map(normalizeProperty));
  } catch (err: unknown) {
    console.error("Get properties error:", err);
    try {
      const errorMsg = err instanceof Error ? err.stack || err.message : String(err);
      fs.appendFileSync('db_error.log', `[${new Date().toISOString()}] GET /properties error: ${errorMsg}\n`);
    } catch (e) {}
    res.status(500).json({ message: "Gagal mengambil properti." });
  }
});

router.get('/properties/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const [rows] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    const prop = rows[0];
    const [facRows] = await pool.query<FacilityRow[]>('SELECT facility FROM property_facilities WHERE propertyId = ?', [prop.id]);
    prop.facilities = facRows.map(r => r.facility);

    res.json(normalizeProperty(prop));
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil detail properti." });
  }
});

router.post('/properties', authenticateToken, requireRole(['admin', 'landlord', 'owner']), validateBody(propertySchema), async (req: Request<Record<string, never>, unknown, CreatePropertyBody>, res: Response) => {
  const { name, district, address, price, description, facilities, latitude, longitude, totalRooms, image, ownerId } = req.body;

  if (!name || !district || !address || !price) {
    return res.status(400).json({ message: "Nama, wilayah, alamat, dan harga wajib diisi." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const propId = generateId("prop");
    const landlordId = ownerId || 'user-landlord';

    await connection.query(
      `INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document) 
       VALUES (?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, 0, ?, 'sertifikat_kepemilikan.pdf')`,
      [
        propId, name, district, address, parseInt(String(price), 10), 
        image || "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80",
        description || "", latitude || "-8.6500", longitude || "115.2166", 
        parseInt(String(totalRooms || '5'), 10), landlordId
      ]
    );

    if (facilities && facilities.length > 0) {
      for (const fac of facilities) {
        await connection.query(
          'INSERT INTO property_facilities (propertyId, facility) VALUES (?, ?)', 
          [propId, fac]
        );
      }
    }

    await connection.commit();
    res.status(201).json({ message: "Properti berhasil ditambahkan!" });
  } catch (err) {
    await connection.rollback();
    console.error("Create property error:", err);
    res.status(500).json({ message: "Gagal menyimpan properti." });
  } finally {
    connection.release();
  }
});

router.put('/properties/:id', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: Request<{ id: string }, unknown, CreatePropertyBody>, res: Response) => {
  const { id } = req.params;
  const { name, district, address, price, description, facilities, latitude, longitude, totalRooms, image } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    await connection.query(
      `UPDATE properties SET name = ?, district = ?, address = ?, price = ?, description = ?, 
       latitude = ?, longitude = ?, totalRooms = ?, image = ? 
       WHERE id = ?`,
      [
        name, district, address, parseInt(String(price || 0), 10), description, 
        latitude, longitude, parseInt(String(totalRooms || 0), 10), image, id
      ]
    );

    if (facilities !== undefined) {
      await connection.query('DELETE FROM property_facilities WHERE propertyId = ?', [id]);
      if (facilities.length > 0) {
        for (const fac of facilities) {
          await connection.query('INSERT INTO property_facilities (propertyId, facility) VALUES (?, ?)', [id, fac]);
        }
      }
    }

    await connection.commit();
    res.json({ message: "Properti berhasil diperbarui!" });
  } catch (err) {
    await connection.rollback();
    console.error("Update property error:", err);
    res.status(500).json({ message: "Gagal memperbarui properti." });
  } finally {
    connection.release();
  }
});

interface DeletePropertyBody {
  password?: string;
  landlordId?: string;
}

router.delete('/properties/:id', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: Request<{ id: string }, unknown, DeletePropertyBody>, res: Response) => {
  const { id } = req.params;
  const { password, landlordId } = req.body;

  if (!password || !landlordId) {
    return res.status(400).json({ message: "Password dan landlordId diperlukan." });
  }

  try {
    const [propRows] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [id]);
    const property = propRows[0];
    if (!property) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    if (property.ownerId !== landlordId) {
      return res.status(403).json({ message: "Anda bukan pemilik properti ini." });
    }

    // Verify landlord password
    const [userRows] = await pool.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [landlordId]);
    const user = userRows[0];
    if (!user || !user.password || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: "Password salah." });
    }

    await pool.query('DELETE FROM properties WHERE id = ?', [id]);
    res.json({ message: "Properti berhasil dihapus!" });
  } catch (err) {
    console.error("Delete property error:", err);
    res.status(500).json({ message: "Gagal menghapus properti." });
  }
});

// ==========================================
// Reviews API (CRUD)
// ==========================================
interface ReviewRow extends RowDataPacket {
  id: string;
  propertyId: string;
  propertyName: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
}

interface CreateReviewBody {
  propertyId?: string;
  userId?: string;
  userName?: string;
  rating?: number | string;
  comment?: string;
}

router.get('/reviews', async (req: Request, res: Response) => {
  const { propertyId, userId } = req.query;

  try {
    let sql = 'SELECT * FROM reviews WHERE 1=1';
    const params: string[] = [];

    if (propertyId) {
      sql += ' AND propertyId = ?';
      params.push(String(propertyId));
    }
    if (userId) {
      sql += ' AND userId = ?';
      params.push(String(userId));
    }

    const [rows] = await pool.query<ReviewRow[]>(sql, params);
    res.json(rows);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: "Gagal mengambil data review: " + errorMsg });
  }
});

router.post('/reviews', async (req: Request<Record<string, never>, unknown, CreateReviewBody>, res: Response) => {
  const { propertyId, userId, userName, rating, comment } = req.body;

  if (!propertyId || !userId || !rating || !comment) {
    return res.status(400).json({ message: "Property ID, User ID, rating, dan komentar wajib diisi." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [propRows] = await connection.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [propertyId]);
    const property = propRows[0];
    if (!property) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    const revId = generateId("rev");
    const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

    await connection.query(
      `INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [revId, propertyId, property.name, userId, userName || "Anonim", parseInt(String(rating), 10), comment, dateStr]
    );

    // Recalculate average rating
    const [revRows] = await connection.query<ReviewRow[]>('SELECT rating FROM reviews WHERE propertyId = ?', [propertyId]);
    const avgRating = revRows.reduce((sum, r) => sum + r.rating, 0) / revRows.length;

    await connection.query('UPDATE properties SET rating = ? WHERE id = ?', [parseFloat(avgRating.toFixed(1)), propertyId]);

    await connection.commit();
    res.status(201).json({ message: "Review berhasil ditambahkan!" });
  } catch (err) {
    await connection.rollback();
    console.error("Create review error:", err);
    res.status(500).json({ message: "Gagal menyimpan review." });
  } finally {
    connection.release();
  }
});

router.put('/reviews/:id', async (req: Request<{ id: string }, unknown, { rating?: number | string; comment?: string }>, res: Response) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<ReviewRow[]>('SELECT * FROM reviews WHERE id = ?', [id]);
    const review = rows[0];
    if (!review) {
      return res.status(404).json({ message: "Review tidak ditemukan." });
    }

    await connection.query(
      'UPDATE reviews SET rating = ?, comment = ? WHERE id = ?',
      [parseInt(String(rating || 0), 10), comment, id]
    );

    // Recalculate average rating for property
    const [revRows] = await connection.query<ReviewRow[]>('SELECT rating FROM reviews WHERE propertyId = ?', [review.propertyId]);
    const avgRating = revRows.reduce((sum, r) => sum + r.rating, 0) / revRows.length;

    await connection.query('UPDATE properties SET rating = ? WHERE id = ?', [parseFloat(avgRating.toFixed(1)), review.propertyId]);

    await connection.commit();
    res.json({ message: "Review berhasil diperbarui!" });
  } catch (err) {
    await connection.rollback();
    console.error("Update review error:", err);
    res.status(500).json({ message: "Gagal memperbarui review." });
  } finally {
    connection.release();
  }
});

router.delete('/reviews/:id', async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<ReviewRow[]>('SELECT * FROM reviews WHERE id = ?', [id]);
    const review = rows[0];
    if (!review) {
      return res.status(404).json({ message: "Review tidak ditemukan." });
    }

    await connection.query('DELETE FROM reviews WHERE id = ?', [id]);

    // Recalculate average rating for property
    const [revRows] = await connection.query<ReviewRow[]>('SELECT rating FROM reviews WHERE propertyId = ?', [review.propertyId]);
    let avgRating = 0.0;
    if (revRows.length > 0) {
      avgRating = revRows.reduce((sum, r) => sum + r.rating, 0) / revRows.length;
    }

    await connection.query('UPDATE properties SET rating = ? WHERE id = ?', [parseFloat(avgRating.toFixed(1)), review.propertyId]);

    await connection.commit();
    res.json({ message: "Review berhasil dihapus!" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: "Gagal menghapus review." });
  } finally {
    connection.release();
  }
});

// ==========================================
// Statistics & Withdrawal API (Landlord Panel)
// ==========================================
interface WithdrawalRow extends RowDataPacket {
  id: string;
  userId: string;
  bankName: string;
  accountNumber: string;
  amount: number | string;
  date: string;
  status: string;
}

router.get('/stats', async (req: Request, res: Response) => {
  const landlordId = String(req.query.landlordId || 'user-landlord');

  try {
    const [userRows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [landlordId]);
    const landlord = userRows[0];
    if (!landlord) {
      return res.status(404).json({ message: "Landlord tidak ditemukan." });
    }

    const [properties] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE ownerId = ?', [landlordId]);
    const [reviews] = await pool.query<ReviewRow[]>(
      `SELECT r.* FROM reviews r 
       JOIN properties p ON r.propertyId = p.id 
       WHERE p.ownerId = ?`, 
      [landlordId]
    );

    const [withdrawals] = await pool.query<WithdrawalRow[]>(
      'SELECT * FROM withdrawals WHERE userId = ? ORDER BY date DESC', 
      [landlordId]
    );

    let totalRooms = 0;
    let occupiedRooms = 0;

    properties.forEach(p => {
      totalRooms += p.totalRooms || 0;
      occupiedRooms += p.occupiedRooms || 0;
    });

    const occupancyRate = totalRooms > 0 ? parseFloat(((occupiedRooms / totalRooms) * 100).toFixed(1)) : 0;

    res.json({
      balance: parseFloat(String(landlord.balance || 0)),
      totalRevenue: parseFloat(String(landlord.totalRevenue || 0)),
      totalWithdrawn: parseFloat(String(landlord.totalWithdrawn || 0)),
      totalProperti: properties.length,
      totalRooms,
      occupiedRooms,
      occupancyRate,
      activeTenants: occupiedRooms,
      withdrawals,
      reviewsCount: reviews.length
    });
  } catch (err) {
    console.error("Get stats error:", err);
    res.status(500).json({ message: "Gagal memuat statistik dasbor." });
  }
});

interface WithdrawBody {
  amount?: number | string;
  bankName?: string;
  accountNumber?: string;
  userId?: string;
}

router.post('/withdraw', authenticateToken, async (req: Request<Record<string, never>, unknown, WithdrawBody>, res: Response) => {
  const { amount, bankName, accountNumber, userId } = req.body;
  if (!amount || !bankName || !accountNumber) {
    return res.status(400).json({ message: "Jumlah, nama bank, dan nomor rekening wajib diisi." });
  }

  const targetUserId = userId || 'user-landlord';
  const withdrawAmount = parseFloat(String(amount));

  if (withdrawAmount <= 0) {
    return res.status(400).json({ message: "Jumlah penarikan harus lebih besar dari 0." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<UserRow[]>('SELECT * FROM users WHERE id = ? FOR UPDATE', [targetUserId]);
    const user = rows[0];
    if (!user) {
      await connection.rollback();
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    if (parseFloat(String(user.balance || 0)) < withdrawAmount) {
      await connection.rollback();
      return res.status(400).json({ message: "Saldo tidak mencukupi." });
    }

    // Deduct balance and update withdrawn statistics
    const newBalance = parseFloat(String(user.balance || 0)) - withdrawAmount;
    const newWithdrawn = parseFloat(String(user.totalWithdrawn || 0)) + withdrawAmount;

    await connection.query(
      'UPDATE users SET balance = ?, totalWithdrawn = ? WHERE id = ?',
      [newBalance, newWithdrawn, targetUserId]
    );

    const withdrawalId = generateId("w");
    const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

    await connection.query(
      `INSERT INTO withdrawals (id, userId, bankName, accountNumber, amount, date, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [withdrawalId, targetUserId, bankName, accountNumber, withdrawAmount, dateStr]
    );

    await connection.commit();
    res.json({
      message: "Permintaan penarikan dana berhasil diajukan dan sedang menunggu proses.",
      withdrawalId,
      balance: newBalance,
      totalWithdrawn: newWithdrawn,
      status: 'pending'
    });
  } catch (err) {
    await connection.rollback();
    console.error("Withdrawal error:", err);
    res.status(500).json({ message: "Gagal memproses penarikan dana." });
  } finally {
    connection.release();
  }
});

router.post('/admin/withdrawals/:id/process', authenticateToken, requireRole(['admin']), async (req: Request<{ id: string }>, res: Response) => {
  const { id } = req.params;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<WithdrawalRow[]>('SELECT * FROM withdrawals WHERE id = ? FOR UPDATE', [id]);
    const withdrawal = rows[0];
    if (!withdrawal) {
      await connection.rollback();
      return res.status(404).json({ message: "Permintaan penarikan tidak ditemukan." });
    }

    if (withdrawal.status === 'completed') {
      await connection.rollback();
      return res.status(400).json({ message: "Penarikan sudah berhasil diproses sebelumnya." });
    }

    if (withdrawal.status === 'rejected') {
      await connection.rollback();
      return res.status(400).json({ message: "Penarikan yang sudah ditolak tidak dapat diproses." });
    }

    await connection.query("UPDATE withdrawals SET status = 'completed' WHERE id = ?", [id]);

    await connection.commit();
    res.json({
      message: "Disbursement berhasil diproses dan status diselesaikan.",
      withdrawalId: id,
      status: 'completed'
    });
  } catch (err: unknown) {
    await connection.rollback();
    console.error("Process withdrawal error:", err);
    res.status(500).json({ message: "Gagal memproses pencairan dana." });
  } finally {
    connection.release();
  }
});

router.post('/admin/withdrawals/:id/reject', authenticateToken, requireRole(['admin']), async (req: Request<{ id: string }, unknown, { reason?: string }>, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<WithdrawalRow[]>('SELECT * FROM withdrawals WHERE id = ? FOR UPDATE', [id]);
    const withdrawal = rows[0];
    if (!withdrawal) {
      await connection.rollback();
      return res.status(404).json({ message: "Permintaan penarikan tidak ditemukan." });
    }

    if (withdrawal.status === 'rejected') {
      await connection.rollback();
      return res.status(400).json({ message: "Penarikan sudah pernah ditolak." });
    }

    if (withdrawal.status === 'completed') {
      await connection.rollback();
      return res.status(400).json({ message: "Penarikan yang sudah selesai tidak dapat ditolak." });
    }

    const withdrawAmount = parseFloat(String(withdrawal.amount));

    // Reverse balance deduction and reduce totalWithdrawn
    await connection.query(
      'UPDATE users SET balance = balance + ?, totalWithdrawn = GREATEST(0, totalWithdrawn - ?) WHERE id = ?',
      [withdrawAmount, withdrawAmount, withdrawal.userId]
    );

    await connection.query("UPDATE withdrawals SET status = 'rejected' WHERE id = ?", [id]);

    await connection.commit();
    res.json({
      message: "Penarikan berhasil ditolak dan saldo telah dikembalikan ke akun landlord.",
      withdrawalId: id,
      status: 'rejected',
      reason: reason || "Pencairan dana ditolak oleh administrator"
    });
  } catch (err: unknown) {
    await connection.rollback();
    console.error("Reject withdrawal error:", err);
    res.status(500).json({ message: "Gagal menolak dan mereverse penarikan dana." });
  } finally {
    connection.release();
  }
});

// ==========================================
// Tracking & Admin Stats API
// ==========================================
router.post('/tracking/visit', async (req: Request, res: Response) => {
  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const ip = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
  const userAgent = String(req.headers['user-agent'] || '');
  try {
    await pool.query(
      'INSERT INTO visitor_tracking (ip_address, user_agent) VALUES (?, ?)',
      [ip, userAgent]
    );
    res.status(201).json({ message: "Kunjungan berhasil dilacak." });
  } catch (err: unknown) {
    console.error("Tracking error:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: "Gagal melacak kunjungan: " + errorMsg });
  }
});

interface CountRow extends RowDataPacket {
  count: number;
}

interface SumRow extends RowDataPacket {
  sum: number | null;
}

router.get('/admin/stats', authenticateToken, requireRole(['admin']), async (_req: Request, res: Response) => {
  try {
    const [visitorRows] = await pool.query<CountRow[]>('SELECT COUNT(*) as count FROM visitor_tracking');
    const totalVisitors = visitorRows[0].count;

    const [userRows] = await pool.query<CountRow[]>('SELECT COUNT(*) as count FROM users');
    const totalUsers = userRows[0].count;

    const [landlordRows] = await pool.query<CountRow[]>("SELECT COUNT(*) as count FROM users WHERE role = 'landlord'");
    const totalLandlords = landlordRows[0].count;

    const [propertyRows] = await pool.query<CountRow[]>('SELECT COUNT(*) as count FROM properties');
    const totalProperties = propertyRows[0].count;

    const [roomsRows] = await pool.query<SumRow[]>('SELECT COALESCE(SUM(totalRooms), 0) as sum FROM properties');
    const totalRooms = roomsRows[0].sum || 0;

    res.json({
      totalVisitors,
      totalUsers,
      totalLandlords,
      totalProperties,
      totalRooms
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ message: "Gagal mengambil statistik admin." });
  }
});

interface TrackingHistoryRow extends RowDataPacket {
  label_time?: string;
  label_date?: string;
  count: number;
}

router.get('/admin/tracking-history', authenticateToken, requireRole(['admin']), async (_req: Request, res: Response) => {
  try {
    // 1. Last 24 Hours (grouped by hour)
    const [rows24h] = await pool.query<TrackingHistoryRow[]>(`
      SELECT 
        DATE_FORMAT(visited_at, '%Y-%m-%d %H:00:00') as label_time,
        COUNT(*) as count
      FROM visitor_tracking
      WHERE visited_at >= NOW() - INTERVAL 24 HOUR
      GROUP BY label_time
      ORDER BY label_time ASC
    `);

    // 2. Last 7 Days (grouped by day)
    const [rows7d] = await pool.query<TrackingHistoryRow[]>(`
      SELECT 
        DATE_FORMAT(visited_at, '%Y-%m-%d') as label_date,
        COUNT(*) as count
      FROM visitor_tracking
      WHERE visited_at >= DATE(NOW() - INTERVAL 6 DAY)
      GROUP BY label_date
      ORDER BY label_date ASC
    `);

    // 3. Last 30 Days (grouped by day)
    const [rows30d] = await pool.query<TrackingHistoryRow[]>(`
      SELECT 
        DATE_FORMAT(visited_at, '%Y-%m-%d') as label_date,
        COUNT(*) as count
      FROM visitor_tracking
      WHERE visited_at >= DATE(NOW() - INTERVAL 29 DAY)
      GROUP BY label_date
      ORDER BY label_date ASC
    `);

    // Post-process to fill gaps
    const now = new Date();
    
    // 24h helper
    const data24h: { label: string; count: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const hour = String(d.getHours()).padStart(2, '0');
      const labelKey = `${year}-${month}-${date} ${hour}:00:00`;
      const hourLabel = `${hour}:00`;
      
      const match = rows24h.find(r => r.label_time === labelKey);
      data24h.push({
        label: hourLabel,
        count: match ? match.count : 0
      });
    }

    // 7d helper
    const data7d: { label: string; count: number }[] = [];
    const daysName = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const labelKey = `${year}-${month}-${date}`;
      const dayLabel = daysName[d.getDay()] + ` (${date}/${month})`;

      const match = rows7d.find(r => r.label_date === labelKey);
      data7d.push({
        label: dayLabel,
        count: match ? match.count : 0
      });
    }

    // 30d helper
    const data30d: { label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const labelKey = `${year}-${month}-${date}`;
      const dayLabel = `${date}/${month}`;

      const match = rows30d.find(r => r.label_date === labelKey);
      data30d.push({
        label: dayLabel,
        count: match ? match.count : 0
      });
    }

    res.json({
      history24h: data24h,
      history7d: data7d,
      history30d: data30d
    });
  } catch (err) {
    console.error("Error fetching tracking history:", err);
    res.status(500).json({ message: "Gagal mengambil riwayat tracking." });
  }
});

// ==========================================
// Excel Report Endpoints
// ==========================================
interface VisitorTrackingRow extends RowDataPacket {
  ip_address: string;
  user_agent: string;
  visited_at: Date | string;
}

router.get('/reports/tracking/excel', authenticateToken, requireRole(['admin']), async (_req: Request, res: Response) => {
  try {
    const [visitorRows] = await pool.query<CountRow[]>('SELECT COUNT(*) as count FROM visitor_tracking');
    const [userRows] = await pool.query<CountRow[]>('SELECT COUNT(*) as count FROM users');
    const [landlordRows] = await pool.query<CountRow[]>("SELECT COUNT(*) as count FROM users WHERE role = 'landlord'");
    const totalLandlords = landlordRows[0].count;
    const [propertyRows] = await pool.query<CountRow[]>('SELECT COUNT(*) as count FROM properties');
    const totalProperties = propertyRows[0].count;
    const [roomsRows] = await pool.query<SumRow[]>('SELECT COALESCE(SUM(totalRooms), 0) as sum FROM properties');
    const totalRooms = roomsRows[0].sum || 0;

    const [visitors] = await pool.query<VisitorTrackingRow[]>('SELECT ip_address, user_agent, visited_at FROM visitor_tracking ORDER BY visited_at DESC LIMIT 1000');
    const [users] = await pool.query<UserRow[]>('SELECT id, email, name, role, phone FROM users ORDER BY id DESC');

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData: (string | number)[][] = [
      ['Metrik', 'Jumlah'],
      ['Total Pengunjung Website', visitorRows[0].count],
      ['Total Pengguna Terdaftar', userRows[0].count],
      ['Total Landlord', totalLandlords],
      ['Total Properti', totalProperties],
      ['Total Kamar', totalRooms]
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Ringkasan');

    // Visitor details sheet
    const visitorData: (string | number)[][] = [['IP Address', 'User Agent', 'Waktu Kunjungan']];
    visitors.forEach(v => visitorData.push([v.ip_address, v.user_agent, v.visited_at ? new Date(v.visited_at).toLocaleString('id-ID') : '']));
    const visitorSheet = XLSX.utils.aoa_to_sheet(visitorData);
    XLSX.utils.book_append_sheet(wb, visitorSheet, 'Pengunjung');

    // Users sheet
    const userData: (string | number)[][] = [['ID', 'Email', 'Nama', 'Role', 'Telepon']];
    users.forEach(u => userData.push([u.id, u.email, u.name, u.role, u.phone]));
    const userSheet = XLSX.utils.aoa_to_sheet(userData);
    XLSX.utils.book_append_sheet(wb, userSheet, 'Pengguna');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=laporan_tracking_kosmo.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('Excel tracking report error:', err);
    res.status(500).json({ message: 'Gagal menghasilkan laporan Excel.' });
  }
});

interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  propertyName?: string;
  price?: number;
  startDate?: string;
  status: 'active' | 'terminated';
}

router.get('/reports/landlord/excel', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: Request, res: Response) => {
  const landlordId = String(req.query.landlordId || '');
  if (!landlordId) return res.status(400).json({ message: 'landlordId diperlukan.' });
  try {
    const [landlords] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [landlordId]);
    const landlord = landlords[0];
    if (!landlord) return res.status(404).json({ message: 'Landlord tidak ditemukan.' });

    const [properties] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE ownerId = ?', [landlord.id]);
    const [transactions] = await pool.query<RentalRow[]>(
      `SELECT r.*, p.name as propertyName FROM rentals r 
       JOIN properties p ON r.propertyId = p.id 
       WHERE p.ownerId = ? ORDER BY r.id DESC`, [landlord.id]
    );

    const wb = XLSX.utils.book_new();

    // Financial Summary sheet
    const summaryData: (string | number)[][] = [
      ['Laporan Keuangan Landlord'],
      ['Nama', landlord.name],
      ['Email', landlord.email],
      ['Total Pendapatan', landlord.totalRevenue || 0],
      ['Total Penarikan', landlord.totalWithdrawn || 0],
      ['Saldo', landlord.balance || 0],
      [''],
      ['Ringkasan Properti'],
      ['Nama Properti', 'Lokasi', 'Harga', 'Total Kamar', 'Kamar Tersedia']
    ];
    properties.forEach(p => summaryData.push([p.name, p.district, p.price, p.totalRooms, p.totalRooms - p.occupiedRooms]));
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Ringkasan Keuangan');

    // Transactions sheet
    const txData: (string | number)[][] = [['ID Transaksi', 'Properti', 'Tanggal', 'Jumlah', 'Status']];
    transactions.forEach(t => txData.push([t.id, t.propertyName || '', t.startDate || '', t.price || 0, t.status === 'active' ? 'Aktif' : 'Selesai']));
    const txSheet = XLSX.utils.aoa_to_sheet(txData);
    XLSX.utils.book_append_sheet(wb, txSheet, 'Transaksi');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename=laporan_keuangan_${landlord.name.replace(/\s+/g, '_')}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('Excel landlord report error:', err);
    res.status(500).json({ message: 'Gagal menghasilkan laporan Excel.' });
  }
});

// ==========================================
// Password Verification Endpoint
// ==========================================
router.post('/auth/verify-password', async (req: Request<Record<string, never>, unknown, { userId?: string; password?: string }>, res: Response) => {
  const { userId, password } = req.body;
  if (!userId || !password) {
    return res.status(400).json({ message: "userId dan password wajib diisi." });
  }
  try {
    const [rows] = await pool.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [userId]);
    const user = rows[0];
    if (!user || !user.password) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    const valid = bcrypt.compareSync(password, user.password);
    res.json({ valid });
  } catch (err) {
    console.error("Password verification error:", err);
    res.status(500).json({ message: "Gagal memverifikasi password." });
  }
});

// ==========================================
// Rentals / Booking Endpoints
// ==========================================
router.get('/rentals', authenticateToken, async (req: Request, res: Response) => {
  const { tenantId } = req.query;
  try {
    let sql = 'SELECT * FROM rentals WHERE 1=1';
    const params: string[] = [];
    if (tenantId) {
      sql += ' AND tenantId = ?';
      params.push(String(tenantId));
    }
    const [rows] = await pool.query<RentalRow[]>(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Get rentals error:", err);
    res.status(500).json({ message: "Gagal mengambil data sewa." });
  }
});

interface CreateRentalBody {
  tenantId?: string;
  propertyId?: string;
  propertyName?: string;
  price?: number;
  durationMonths?: number;
  signature?: string;
}

router.post('/rentals', authenticateToken, async (req: Request<Record<string, never>, unknown, CreateRentalBody>, res: Response) => {
  const { tenantId, propertyId, propertyName, price, durationMonths, signature } = req.body;
  if (!tenantId || !propertyId) {
    return res.status(400).json({ message: "tenantId dan propertyId wajib diisi." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [propRows] = await connection.query<PropertyRow[]>('SELECT totalRooms, occupiedRooms, price, name, address, ownerId FROM properties WHERE id = ?', [propertyId]);
    const property = propRows[0];
    if (!property) {
      await connection.rollback();
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    if (property.occupiedRooms >= property.totalRooms) {
      await connection.rollback();
      return res.status(400).json({ message: "Kamar kos sudah penuh." });
    }

    const [userRows] = await connection.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [tenantId]);
    const tenant = userRows[0];

    const rentalId = generateId("rent");
    const startDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const rentalPrice = price || property.price;
    const rentalName = propertyName || property.name;

    let documentPath = 'sertifikat_kepemilikan.pdf';
    try {
      const contractResult = await generateRentalContractPdf({
        rentalId,
        tenantName: tenant ? tenant.name : 'Penyewa',
        tenantEmail: tenant ? tenant.email : '',
        tenantPhone: tenant ? tenant.phone : '',
        propertyName: rentalName,
        propertyAddress: property.address || '',
        pricePerMonth: rentalPrice,
        startDate,
        durationMonths: durationMonths || 1,
        signatureBase64: signature
      });
      documentPath = contractResult.filePath;
    } catch (contractErr) {
      console.warn("PDF contract generation warning:", contractErr);
    }

    await connection.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, document) 
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [rentalId, tenantId, propertyId, rentalName, rentalPrice, startDate, documentPath]
    );

    await connection.query(
      'UPDATE properties SET occupiedRooms = occupiedRooms + 1 WHERE id = ?',
      [propertyId]
    );

    if (property.ownerId) {
      await connection.query(
        'UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?',
        [rentalPrice, rentalPrice, property.ownerId]
      );
    }

    await connection.commit();
    res.status(201).json({
      message: "Penyewaan kos berhasil diproses!",
      rentalId,
      document: documentPath
    });
  } catch (err) {
    await connection.rollback();
    console.error("Create rental error:", err);
    res.status(500).json({ message: "Gagal memproses penyewaan kos." });
  } finally {
    connection.release();
  }
});

router.post('/rentals/:id/terminate', authenticateToken, async (req: Request<{ id: string }, unknown, { password?: string }>, res: Response) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ message: "Password wajib dimasukkan." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rentalRows] = await connection.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [id]);
    const rental = rentalRows[0];
    if (!rental) {
      await connection.rollback();
      return res.status(404).json({ message: "Data sewa tidak ditemukan." });
    }
    if (rental.status === 'terminated') {
      await connection.rollback();
      return res.status(400).json({ message: "Sewa sudah pernah diberhentikan." });
    }

    const [userRows] = await connection.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [rental.tenantId]);
    const user = userRows[0];
    if (!user || !user.password || !bcrypt.compareSync(password, user.password)) {
      await connection.rollback();
      return res.status(401).json({ message: "Password salah." });
    }

    await connection.query(
      "UPDATE rentals SET status = 'terminated' WHERE id = ?",
      [id]
    );

    await connection.query(
      'UPDATE properties SET occupiedRooms = GREATEST(0, occupiedRooms - 1) WHERE id = ?',
      [rental.propertyId]
    );

    await connection.commit();
    res.json({ message: "Sewa kos berhasil diberhentikan." });
  } catch (err) {
    await connection.rollback();
    console.error("Terminate rental error:", err);
    res.status(500).json({ message: "Gagal memberhentikan sewa kos." });
  } finally {
    connection.release();
  }
});

// ==========================================
// Midtrans Snap Sandbox Payment Gateway
// ==========================================
export const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-placeholder'
});

export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  signatureKey: string
): boolean {
  if (!orderId || !statusCode || !grossAmount || !serverKey || !signatureKey) {
    return false;
  }
  const payload = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  const calculatedHash = crypto.createHash('sha512').update(payload).digest('hex');
  return calculatedHash.toLowerCase() === signatureKey.toLowerCase();
}

interface PaymentTokenBody {
  propertyId?: string;
  tenantId?: string;
  durationMonths?: number;
}

router.post('/payment/token', authenticateToken, async (req: Request<Record<string, never>, unknown, PaymentTokenBody>, res: Response) => {
  const { propertyId, tenantId, durationMonths } = req.body;
  if (!propertyId || !tenantId) {
    return res.status(400).json({ message: "propertyId dan tenantId wajib diisi." });
  }

  const duration = durationMonths && durationMonths > 0 ? durationMonths : 1;

  try {
    const [propRows] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [propertyId]);
    const property = propRows[0];
    if (!property) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    if (property.occupiedRooms >= property.totalRooms) {
      return res.status(400).json({ message: "Kamar kos sudah penuh." });
    }

    const [userRows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [tenantId]);
    const tenant = userRows[0];
    if (!tenant) {
      return res.status(404).json({ message: "Tenant tidak ditemukan." });
    }

    const rentalId = generateId("rent");
    const startDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const totalPrice = property.price * duration;

    // Insert pending rental record (do NOT increment occupiedRooms yet)
    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [rentalId, tenantId, propertyId, property.name, totalPrice, startDate]
    );

    // Create Snap transaction parameters
    const parameter = {
      transaction_details: {
        order_id: rentalId,
        gross_amount: totalPrice
      },
      customer_details: {
        first_name: tenant.name,
        email: tenant.email,
        phone: tenant.phone || ''
      },
      item_details: [
        {
          id: property.id,
          price: property.price,
          quantity: duration,
          name: property.name.substring(0, 50)
        }
      ]
    };

    const transaction = await snap.createTransaction(parameter);

    res.json({
      message: "Token pembayaran berhasil dibuat.",
      token: transaction.token,
      redirect_url: transaction.redirect_url,
      rentalId
    });
  } catch (err: unknown) {
    console.error("Create payment token error:", err);
    res.status(500).json({ message: "Gagal membuat token pembayaran Midtrans." });
  }
});

interface MidtransWebhookBody {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
  payment_type?: string;
}

router.post('/payment/webhook', async (req: Request<Record<string, never>, unknown, MidtransWebhookBody>, res: Response) => {
  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status,
    fraud_status
  } = req.body;

  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return res.status(400).json({ message: "Data notifikasi tidak lengkap." });
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder';
  const isValidSignature = verifyMidtransSignature(
    order_id,
    status_code,
    gross_amount,
    serverKey,
    signature_key
  );

  if (!isValidSignature) {
    return res.status(403).json({ message: "Signature Midtrans tidak valid." });
  }

  // Handle settlement or accepted capture
  const isSettlement = transaction_status === 'settlement';
  const isCaptureSuccess = transaction_status === 'capture' && fraud_status === 'accept';

  if (isSettlement || isCaptureSuccess) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rentalRows] = await connection.query<RentalRow[]>(
        'SELECT * FROM rentals WHERE id = ? FOR UPDATE',
        [order_id]
      );
      const rental = rentalRows[0];

      if (!rental) {
        await connection.rollback();
        return res.status(404).json({ message: "Data sewa tidak ditemukan." });
      }

      // Check if already processed to prevent duplicate room increments or balance credits
      if (rental.status !== 'active') {
        await connection.query("UPDATE rentals SET status = 'active' WHERE id = ?", [order_id]);

        await connection.query(
          'UPDATE properties SET occupiedRooms = occupiedRooms + 1 WHERE id = ?',
          [rental.propertyId]
        );

        const [propRows] = await connection.query<PropertyRow[]>(
          'SELECT ownerId FROM properties WHERE id = ?',
          [rental.propertyId]
        );
        const property = propRows[0];

        if (property && property.ownerId) {
          const rentalPrice = rental.price || 0;
          await connection.query(
            'UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?',
            [rentalPrice, rentalPrice, property.ownerId]
          );
        }
      }

      await connection.commit();
      return res.json({ message: "Pembayaran berhasil diproses dan status rental diaktifkan." });
    } catch (err: unknown) {
      await connection.rollback();
      console.error("Midtrans webhook processing error:", err);
      return res.status(500).json({ message: "Gagal memproses transaksi sewa." });
    } finally {
      connection.release();
    }
  }

  // Handle cancel, deny, or expire
  if (transaction_status === 'cancel' || transaction_status === 'deny' || transaction_status === 'expire') {
    try {
      await pool.query("UPDATE rentals SET status = 'cancelled' WHERE id = ? AND status = 'pending'", [order_id]);
      return res.json({ message: `Status transaksi dibatalkan (${transaction_status}).` });
    } catch (err: unknown) {
      console.error("Cancel rental error:", err);
      return res.status(500).json({ message: "Gagal memperbarui status transaksi." });
    }
  }

  res.json({ message: "Status notifikasi diterima." });
});

export default router;
