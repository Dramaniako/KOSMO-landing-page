import express from 'express';
import type { Request, Response, Router } from 'express';
import { pool } from './db';
import XLSX from 'xlsx';
import multer from 'multer';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import midtransClient from 'midtrans-client';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import {
  generateRentalContractPdf,
  generateRentalContractBuffer,
  computeContractHash,
  generateAndUploadContract,
  sanitizeRentalId
} from './services/contract';
import { apiCache } from './services/cache';
import { normalizeProperty, normalizePropertySummary } from './services/transformers';
import type { PropertyRow } from './services/transformers';
import {
  generateJwtToken,
  verifyJwtToken,
  authenticateToken,
  requireRole
} from './middleware/auth';
import type { JWTPayload, AuthenticatedRequest } from './middleware/auth';
import {
  loginSchema,
  registerSchema,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  updateProfileSchema,
  propertySchema,
  reviewSchema,
  previewContractSchema,
  signContractSchema,
  validateBody
} from './middleware/validation';
import type {
  KosRoom,
  Booking,
  User,
  UserRole,
  IdentityType,
  Amenity,
  BookingStatus,
  RentalContractData,
  RentalContractJoinedRow
} from './types/index';
import { isUserProfileComplete } from './types/index';

export {
  generateJwtToken,
  verifyJwtToken,
  authenticateToken,
  requireRole
};
export type { JWTPayload, AuthenticatedRequest };

// Rate Limiter for Authentication Endpoints
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak percobaan masuk/daftar. Silakan coba lagi dalam 1 menit.' }
});

// Rate Limiter for Uploads
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak unggahan berkas. Silakan coba lagi nanti.' }
});

// Rate Limiter for Visitor Tracking
export const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak permintaan pelacakan.' }
});

const router: Router = express.Router();

// System & Infrastructure Health Check
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT 1 AS healthy, NOW() AS db_time');
    res.json({
      status: 'ok',
      service: 'kosmo-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: 'connected',
        queryOk: Array.isArray(rows) && rows.length > 0
      }
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Database ping failed';
    res.status(503).json({
      status: 'degraded',
      service: 'kosmo-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: 'disconnected',
        error: errorMsg
      }
    });
  }
});

import { uploadImageStream } from './services/cloudinary';

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

router.post('/upload', authenticateToken, uploadLimiter, upload.single('image'), async (req: AuthenticatedRequest & MulterRequest, res: Response) => {
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
const generateId = (prefix: string): string => {
  // 🛡️ SECURITY: Use cryptographically secure random numbers instead of weak Math.random()
  // Math.random() is predictable and can lead to ID collision or guessing attacks
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
};

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
  identity_type?: IdentityType;
  identity_number?: string;
  address?: string;
  occupation?: string;
  emergency_contact_name?: string;
  emergency_contact_relation?: string;
  emergency_contact_phone?: string;
  date_of_birth?: string;
  gender?: string;
}

export function formatSafeUser(user: UserRow): Partial<UserRow> & {
  isProfileComplete: boolean;
  missingProfileFields: string[];
  missingProfileFieldLabels: string[];
} {
  const safeUser: Partial<UserRow> = { ...user };
  delete safeUser.password;
  const profileStatus = isUserProfileComplete(user);
  return {
    ...safeUser,
    notifications: user.notifications !== undefined ? (typeof user.notifications === 'number' ? user.notifications === 1 : Boolean(user.notifications)) : true,
    isProfileComplete: profileStatus.complete,
    missingProfileFields: profileStatus.missingFields,
    missingProfileFieldLabels: profileStatus.missingFieldLabels
  };
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

    const safeUser = formatSafeUser(user);
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
  if (!email || !password || !name || !phone) {
    return res.status(400).json({ message: "Nama, email, password, dan nomor telepon wajib diisi." });
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
      [userId, email, hashedPassword, name, phone.trim()]
    );

    const [newUsers] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [userId]);
    const newUser = newUsers[0];
    const safeUser = formatSafeUser(newUser);
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
  identity_type?: IdentityType;
  identity_number?: string;
  address?: string;
  occupation?: string;
  emergency_contact_name?: string;
  emergency_contact_relation?: string;
  emergency_contact_phone?: string;
  date_of_birth?: string;
  gender?: string;
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

// Current User Profile Getter
router.get('/auth/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "Otentikasi diperlukan." });

  try {
    const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ message: "User tidak ditemukan." });
    res.json(formatSafeUser(user));
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil profil user." });
  }
});

router.get('/users/profile/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const authUser = req.user;

  if (authUser?.role !== 'admin' && authUser?.id !== id) {
    return res.status(403).json({ message: "Akses ditolak. Anda tidak memiliki izin untuk melihat profil ini." });
  }

  try {
    const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    res.json(formatSafeUser(user));
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil profil user." });
  }
});

router.put('/users/profile/:id', authenticateToken, validateBody(updateProfileSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const authUser = req.user;
  const {
    name,
    phone,
    paymentMethod,
    notifications,
    language,
    identity_type,
    identity_number,
    address,
    occupation,
    emergency_contact_name,
    emergency_contact_relation,
    emergency_contact_phone,
    date_of_birth,
    gender
  } = req.body as UserProfileBody;

  if (authUser?.role !== 'admin' && authUser?.id !== id) {
    return res.status(403).json({ message: "Akses ditolak. Anda tidak dapat mengubah profil pengguna lain." });
  }

  try {
    const [rows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    const notifVal = notifications !== undefined ? (notifications ? 1 : 0) : 1;

    await pool.query(
      `UPDATE users SET 
        name = COALESCE(?, name), 
        phone = COALESCE(?, phone), 
        paymentMethod = COALESCE(?, paymentMethod), 
        notifications = ?, 
        language = COALESCE(?, language),
        identity_type = COALESCE(?, identity_type),
        identity_number = COALESCE(?, identity_number),
        address = COALESCE(?, address),
        occupation = COALESCE(?, occupation),
        emergency_contact_name = COALESCE(?, emergency_contact_name),
        emergency_contact_relation = COALESCE(?, emergency_contact_relation),
        emergency_contact_phone = COALESCE(?, emergency_contact_phone),
        date_of_birth = COALESCE(?, date_of_birth),
        gender = COALESCE(?, gender)
      WHERE id = ?`,
      [
        name,
        phone,
        paymentMethod,
        notifVal,
        language,
        identity_type,
        identity_number,
        address,
        occupation,
        emergency_contact_name,
        emergency_contact_relation,
        emergency_contact_phone,
        date_of_birth,
        gender,
        id
      ]
    );

    const [updatedUsers] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
    const updatedUser = updatedUsers[0];
    const safeUser = formatSafeUser(updatedUser);
    res.json({
      message: "Profil berhasil diperbarui!",
      user: safeUser
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ message: "Gagal memperbarui profil." });
  }
});

// User Profile Update (Authenticated User alias)
router.put('/auth/profile', authenticateToken, validateBody(updateProfileSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "Otentikasi diperlukan." });
  const {
    name,
    phone,
    paymentMethod,
    notifications,
    language,
    identity_type,
    identity_number,
    address,
    occupation,
    emergency_contact_name,
    emergency_contact_relation,
    emergency_contact_phone,
    date_of_birth,
    gender
  } = req.body as UserProfileBody;

  try {
    const notifVal = notifications !== undefined ? (notifications ? 1 : 0) : 1;

    await pool.query(
      `UPDATE users SET 
        name = COALESCE(?, name), 
        phone = COALESCE(?, phone), 
        paymentMethod = COALESCE(?, paymentMethod), 
        notifications = ?, 
        language = COALESCE(?, language),
        identity_type = COALESCE(?, identity_type),
        identity_number = COALESCE(?, identity_number),
        address = COALESCE(?, address),
        occupation = COALESCE(?, occupation),
        emergency_contact_name = COALESCE(?, emergency_contact_name),
        emergency_contact_relation = COALESCE(?, emergency_contact_relation),
        emergency_contact_phone = COALESCE(?, emergency_contact_phone),
        date_of_birth = COALESCE(?, date_of_birth),
        gender = COALESCE(?, gender)
      WHERE id = ?`,
      [
        name,
        phone,
        paymentMethod,
        notifVal,
        language,
        identity_type,
        identity_number,
        address,
        occupation,
        emergency_contact_name,
        emergency_contact_relation,
        emergency_contact_phone,
        date_of_birth,
        gender,
        userId
      ]
    );

    const [updatedUsers] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [userId]);
    const updatedUser = updatedUsers[0];
    if (!updatedUser) return res.status(404).json({ message: "User tidak ditemukan." });
    const safeUser = formatSafeUser(updatedUser);
    res.json({
      message: "Profil berhasil diperbarui!",
      user: safeUser
    });
  } catch (err) {
    console.error("Auth profile update error:", err);
    res.status(500).json({ message: "Gagal memperbarui profil." });
  }
});

// Admin Route: Get all users
router.get('/users', authenticateToken, requireRole(['admin']), async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, email, name, role, phone, paymentMethod, balance, totalRevenue, totalWithdrawn FROM users ORDER BY id DESC LIMIT 50'
    );
    res.json(rows);
  } catch (err: unknown) {
    console.error("Get users error:", err);
    res.status(500).json({ message: "Gagal mengambil data user." });
  }
});

router.get('/admin/users', authenticateToken, requireRole(['admin']), async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, email, name, role, phone, paymentMethod, balance, totalRevenue, totalWithdrawn FROM users ORDER BY id DESC LIMIT 50'
    );
    res.json(rows);
  } catch (err: unknown) {
    console.error("Get admin users error:", err);
    res.status(500).json({ message: "Gagal mengambil data user admin." });
  }
});

// Admin Route: Create user
router.post('/users', authenticateToken, requireRole(['admin']), validateBody(adminCreateUserSchema), async (req: Request<Record<string, never>, unknown, AdminCreateUserBody>, res: Response) => {
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
router.put('/users/:id', authenticateToken, requireRole(['admin']), validateBody(adminUpdateUserSchema), async (req: Request<{ id: string }, unknown, AdminUpdateUserBody>, res: Response) => {
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
router.delete('/users/:id', authenticateToken, requireRole(['admin']), async (req: Request<{ id: string }>, res: Response) => {
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
  occupiedRooms?: number | string;
  image?: string;
  ownerId?: string;
}

router.get('/properties', async (req: Request, res: Response) => {
  const { district, priceMin, priceMax, minPrice, maxPrice, facility, ownerId, owner } = req.query;
  const targetOwner = ownerId || owner;
  const effectiveMin = priceMin !== undefined ? priceMin : minPrice;
  const effectiveMax = priceMax !== undefined ? priceMax : maxPrice;
  const cacheKey = `properties:${district || 'all'}:${effectiveMin || 0}:${effectiveMax || 0}:${facility || 'all'}:${targetOwner || 'all'}`;

  const cachedData = apiCache.get<PropertyRow[]>(cacheKey);
  if (cachedData) {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    return res.json(cachedData);
  }

  try {
    let sql = `
      SELECT p.*, GROUP_CONCAT(pf.facility SEPARATOR ',') as facilitiesString
      FROM properties p
      LEFT JOIN property_facilities pf ON p.id = pf.propertyId
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (targetOwner) {
      sql += ' AND p.ownerId = ?';
      params.push(String(targetOwner));
    }
    if (district && district !== 'Semua') {
      sql += ' AND p.district = ?';
      params.push(String(district));
    }
    if (effectiveMin !== undefined && effectiveMin !== '') {
      sql += ' AND p.price >= ?';
      params.push(parseInt(String(effectiveMin), 10));
    }
    if (effectiveMax !== undefined && effectiveMax !== '') {
      sql += ' AND p.price <= ?';
      params.push(parseInt(String(effectiveMax), 10));
    }

    sql += ' GROUP BY p.id';

    const [properties] = await pool.query<(PropertyRow & { facilitiesString?: string })[]>(sql, params);

    for (const prop of properties) {
      prop.facilities = prop.facilitiesString ? prop.facilitiesString.split(',').filter(Boolean) : [];
      delete prop.facilitiesString;
    }

    // Filter by facility in JS if requested
    let filteredProperties = properties;
    if (facility) {
      const facilitiesList = Array.isArray(facility) ? facility.map(String) : [String(facility)];
      filteredProperties = properties.filter(p =>
        facilitiesList.every(f => (p.facilities || []).map(item => item.toLowerCase()).includes(f.toLowerCase()))
      );
    }

    const normalized = filteredProperties.map(normalizePropertySummary);
    apiCache.set(cacheKey, normalized, 60);

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json(normalized);
  } catch (err: unknown) {
    console.error("Error in GET /api/properties:", err);
    res.status(500).json({ error: 'Internal Server Error', message: "Gagal mengambil properti." });
  }
});

router.get('/properties/:id', async (req: Request<{ id: string }>, res: Response) => {
  const cacheKey = `properties:detail:${req.params.id}`;
  const cached = apiCache.get<PropertyRow>(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    return res.json(cached);
  }

  try {
    const [rows] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    const prop = rows[0];
    const [facRows] = await pool.query<FacilityRow[]>('SELECT facility FROM property_facilities WHERE propertyId = ?', [prop.id]);
    prop.facilities = facRows.map(r => r.facility);

    const normalized = normalizeProperty(prop);
    apiCache.set(cacheKey, normalized, 60);

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json(normalized);
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
    apiCache.invalidatePattern('properties');
    res.status(201).json({ message: "Properti berhasil ditambahkan!" });
  } catch (err) {
    await connection.rollback();
    console.error("Create property error:", err);
    res.status(500).json({ message: "Gagal menyimpan properti." });
  } finally {
    connection.release();
  }
});

router.put('/properties/:id', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, district, address, price, description, facilities, latitude, longitude, totalRooms, occupiedRooms, image } = req.body;
  const authUser = req.user;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ? FOR UPDATE', [id]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    const existing = rows[0];
    if (authUser?.role !== 'admin' && existing.ownerId !== authUser?.id) {
      await connection.rollback();
      return res.status(403).json({ message: "Akses ditolak. Anda bukan pemilik properti ini." });
    }

    const updatedName = name !== undefined ? name : existing.name;
    const updatedDistrict = district !== undefined ? district : existing.district;
    const updatedAddress = address !== undefined ? address : existing.address;
    const updatedPrice = price !== undefined ? parseInt(String(price), 10) : existing.price;
    const updatedDesc = description !== undefined ? description : existing.description;
    const updatedLat = latitude !== undefined ? latitude : existing.latitude;
    const updatedLng = longitude !== undefined ? longitude : existing.longitude;
    const updatedRooms = totalRooms !== undefined ? parseInt(String(totalRooms), 10) : existing.totalRooms;
    const updatedOccupied = occupiedRooms !== undefined ? parseInt(String(occupiedRooms), 10) : existing.occupiedRooms;
    const updatedImage = image !== undefined ? image : existing.image;

    await connection.query(
      `UPDATE properties SET name = ?, district = ?, address = ?, price = ?, description = ?, 
       latitude = ?, longitude = ?, totalRooms = ?, occupiedRooms = ?, image = ? 
       WHERE id = ?`,
      [
        updatedName, updatedDistrict, updatedAddress, updatedPrice, updatedDesc, 
        updatedLat, updatedLng, updatedRooms, updatedOccupied, updatedImage, id
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
    apiCache.invalidatePattern('properties');
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

router.delete('/properties/:id', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { password, landlordId } = req.body as DeletePropertyBody;
  const authUser = req.user;
  const callerId = authUser?.id;
  const callerRole = authUser?.role;

  if (!password) {
    return res.status(400).json({ message: "Password konfirmasi diperlukan." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [propRows] = await connection.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ? FOR UPDATE', [id]);
    const property = propRows[0];
    if (!property) {
      await connection.rollback();
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    if (callerRole !== 'admin' && property.ownerId !== callerId) {
      await connection.rollback();
      return res.status(403).json({ message: "Anda bukan pemilik properti ini." });
    }

    // Guard: Prevent deletion of properties with active leases
    const [activeRentals] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) as activeCount FROM rentals WHERE propertyId = ? AND status = 'active'",
      [id]
    );
    if (Number(activeRentals[0]?.activeCount || 0) > 0) {
      await connection.rollback();
      return res.status(409).json({ 
        message: "Properti tidak dapat dihapus karena masih memiliki sewa aktif berjalan." 
      });
    }

    // Verify caller's own password
    const [userRows] = await connection.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [callerId]);
    const caller = userRows[0];
    if (!caller || !caller.password || !bcrypt.compareSync(password, caller.password)) {
      await connection.rollback();
      return res.status(401).json({ message: "Password salah." });
    }

    await connection.query('DELETE FROM properties WHERE id = ?', [id]);
    await connection.commit();
    apiCache.invalidatePattern('properties');
    res.json({ message: "Properti berhasil dihapus!" });
  } catch (err) {
    await connection.rollback();
    console.error("Delete property error:", err);
    res.status(500).json({ message: "Gagal menghapus properti." });
  } finally {
    connection.release();
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
  const cacheKey = `reviews:${propertyId || 'all'}:${userId || 'all'}`;

  const cachedReviews = apiCache.get<ReviewRow[]>(cacheKey);
  if (cachedReviews) {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    return res.json(cachedReviews);
  }

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
    apiCache.set(cacheKey, rows, 60);

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json(rows);
  } catch (err: unknown) {
    console.error("Error in GET /api/reviews:", err);
    res.status(500).json({ error: 'Internal Server Error', message: "Gagal mengambil data review." });
  }
});

router.post('/reviews', authenticateToken, validateBody(reviewSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { propertyId, rating, comment } = req.body as { propertyId: string; rating: number | string; comment: string };
  const authUser = req.user;
  if (!authUser?.id) {
    return res.status(401).json({ message: "Akses ditolak. Token otentikasi diperlukan." });
  }
  const userId = authUser.id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [propRows] = await connection.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [propertyId]);
    const property = propRows[0];
    if (!property) {
      await connection.rollback();
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    // Fetch user name from database or fallback to user email
    const [userRows] = await connection.query<UserRow[]>('SELECT name FROM users WHERE id = ?', [userId]);
    const userName = userRows[0]?.name || authUser.email.split('@')[0] || "Anonim";

    const revId = generateId("rev");
    const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

    await connection.query(
      `INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [revId, propertyId, property.name, userId, userName, parseInt(String(rating), 10), comment, dateStr]
    );

    // Recalculate average rating
    const [revRows] = await connection.query<ReviewRow[]>('SELECT rating FROM reviews WHERE propertyId = ?', [propertyId]);
    const avgRating = revRows.reduce((sum, r) => sum + r.rating, 0) / revRows.length;

    await connection.query('UPDATE properties SET rating = ? WHERE id = ?', [parseFloat(avgRating.toFixed(1)), propertyId]);

    await connection.commit();
    apiCache.invalidatePattern('reviews');
    apiCache.invalidatePattern('properties');
    res.status(201).json({ message: "Review berhasil ditambahkan!" });
  } catch (err) {
    await connection.rollback();
    console.error("Create review error:", err);
    res.status(500).json({ message: "Gagal menyimpan review." });
  } finally {
    connection.release();
  }
});

router.put('/reviews/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { rating, comment } = req.body;
  const authUser = req.user;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<ReviewRow[]>('SELECT * FROM reviews WHERE id = ?', [id]);
    const review = rows[0];
    if (!review) {
      await connection.rollback();
      return res.status(404).json({ message: "Review tidak ditemukan." });
    }

    if (authUser?.role !== 'admin' && review.userId !== authUser?.id) {
      await connection.rollback();
      return res.status(403).json({ message: "Akses ditolak. Anda tidak memiliki izin untuk mengubah ulasan ini." });
    }

    const updatedRating = rating !== undefined ? parseInt(String(rating), 10) : review.rating;
    const updatedComment = comment !== undefined ? comment : review.comment;

    await connection.query(
      'UPDATE reviews SET rating = ?, comment = ? WHERE id = ?',
      [updatedRating, updatedComment, id]
    );

    // Recalculate average rating for property
    const [revRows] = await connection.query<ReviewRow[]>('SELECT rating FROM reviews WHERE propertyId = ?', [review.propertyId]);
    const avgRating = revRows.reduce((sum, r) => sum + r.rating, 0) / revRows.length;

    await connection.query('UPDATE properties SET rating = ? WHERE id = ?', [parseFloat(avgRating.toFixed(1)), review.propertyId]);

    await connection.commit();
    apiCache.invalidatePattern('reviews');
    apiCache.invalidatePattern('properties');
    res.json({ message: "Review berhasil diperbarui!" });
  } catch (err) {
    await connection.rollback();
    console.error("Update review error:", err);
    res.status(500).json({ message: "Gagal memperbarui review." });
  } finally {
    connection.release();
  }
});

router.delete('/reviews/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const authUser = req.user;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<ReviewRow[]>('SELECT * FROM reviews WHERE id = ?', [id]);
    const review = rows[0];
    if (!review) {
      await connection.rollback();
      return res.status(404).json({ message: "Review tidak ditemukan." });
    }

    if (authUser?.role !== 'admin' && review.userId !== authUser?.id) {
      await connection.rollback();
      return res.status(403).json({ message: "Akses ditolak. Anda tidak memiliki izin untuk menghapus ulasan ini." });
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
    apiCache.invalidatePattern('reviews');
    apiCache.invalidatePattern('properties');
    res.json({ message: "Review berhasil dihapus!" });
  } catch (err) {
    await connection.rollback();
    console.error("Delete review error:", err);
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
  accountHolder?: string;
  amount: number | string;
  date: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  referenceId?: string;
  rejectionReason?: string;
  processedAt?: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
}

interface PropertyStatsAgg extends RowDataPacket {
  totalProperti: number;
  totalRooms: number;
  occupiedRooms: number;
}

interface ReviewCountAgg extends RowDataPacket {
  reviewsCount: number;
}

interface MonthlyRevenueAgg extends RowDataPacket {
  month: string;
  revenue: number;
  transactions: number;
}

const handleLandlordStats = async (req: AuthenticatedRequest, res: Response) => {
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }

  const landlordId = authUser.role === 'admin' && req.query.landlordId
    ? String(req.query.landlordId)
    : authUser.id;

  try {
    const [
      [userRows],
      [propAggRows],
      [reviewCountRows],
      [withdrawals]
    ] = await Promise.all([
      pool.query<UserRow[]>('SELECT id, balance, totalRevenue, totalWithdrawn FROM users WHERE id = ?', [landlordId]),
      pool.query<PropertyStatsAgg[]>(
        `SELECT 
           COUNT(id) as totalProperti,
           COALESCE(SUM(totalRooms), 0) as totalRooms,
           COALESCE(SUM(occupiedRooms), 0) as occupiedRooms
         FROM properties
         WHERE ownerId = ?`,
        [landlordId]
      ),
      pool.query<ReviewCountAgg[]>(
        `SELECT COUNT(r.id) as reviewsCount
         FROM reviews r 
         JOIN properties p ON r.propertyId = p.id 
         WHERE p.ownerId = ?`, 
        [landlordId]
      ),
      pool.query<WithdrawalRow[]>(
        'SELECT * FROM withdrawals WHERE userId = ? ORDER BY date DESC LIMIT 50', 
        [landlordId]
      )
    ]);

    const landlord = userRows[0];
    if (!landlord) {
      return res.status(404).json({ message: "Landlord tidak ditemukan." });
    }

    const totalProperti = Number(propAggRows[0]?.totalProperti || 0);
    const totalRooms = Number(propAggRows[0]?.totalRooms || 0);
    const occupiedRooms = Number(propAggRows[0]?.occupiedRooms || 0);
    const occupancyRate = totalRooms > 0 ? parseFloat(((occupiedRooms / totalRooms) * 100).toFixed(1)) : 0;
    const reviewsCount = Number(reviewCountRows[0]?.reviewsCount || 0);

    res.json({
      balance: parseFloat(String(landlord.balance || 0)),
      totalRevenue: parseFloat(String(landlord.totalRevenue || 0)),
      totalWithdrawn: parseFloat(String(landlord.totalWithdrawn || 0)),
      totalProperti,
      totalRooms,
      occupiedRooms,
      occupancyRate,
      activeTenants: occupiedRooms,
      withdrawals,
      reviewsCount
    });
  } catch (err) {
    console.error("Get stats error:", err);
    res.status(500).json({ message: "Gagal memuat statistik dasbor." });
  }
};

router.get('/stats', authenticateToken, requireRole(['admin', 'landlord', 'owner']), handleLandlordStats);
router.get('/landlord/stats', authenticateToken, requireRole(['admin', 'landlord', 'owner']), handleLandlordStats);

router.get('/landlord/financials', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: AuthenticatedRequest, res: Response) => {
  const landlordId = String(req.query.landlordId || req.user?.id || 'user-landlord');

  try {
    const [
      [userRows],
      [propAggRows],
      [monthlyRevenueRows],
      [withdrawals]
    ] = await Promise.all([
      pool.query<UserRow[]>('SELECT id, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder FROM users WHERE id = ?', [landlordId]),
      pool.query<PropertyStatsAgg[]>(
        `SELECT 
           COUNT(id) as totalProperti,
           COALESCE(SUM(totalRooms), 0) as totalRooms,
           COALESCE(SUM(occupiedRooms), 0) as occupiedRooms
         FROM properties
         WHERE ownerId = ?`,
        [landlordId]
      ),
      pool.query<MonthlyRevenueAgg[]>(
        `SELECT 
           DATE_FORMAT(STR_TO_DATE(r.startDate, '%Y-%m-%d'), '%Y-%m') as month,
           COALESCE(SUM(r.price), 0) as revenue,
           COUNT(r.id) as transactions
         FROM rentals r
         JOIN properties p ON r.propertyId = p.id
         WHERE p.ownerId = ? AND r.status IN ('active', 'completed')
         GROUP BY DATE_FORMAT(STR_TO_DATE(r.startDate, '%Y-%m-%d'), '%Y-%m')
         ORDER BY month DESC
         LIMIT 12`,
        [landlordId]
      ),
      pool.query<WithdrawalRow[]>(
        'SELECT * FROM withdrawals WHERE userId = ? ORDER BY id DESC LIMIT 50',
        [landlordId]
      )
    ]);

    const landlord = userRows[0];
    if (!landlord) {
      return res.status(404).json({ message: "Landlord tidak ditemukan." });
    }

    const totalProperti = Number(propAggRows[0]?.totalProperti || 0);
    const totalRooms = Number(propAggRows[0]?.totalRooms || 0);
    const occupiedRooms = Number(propAggRows[0]?.occupiedRooms || 0);
    const occupancyRate = totalRooms > 0 ? parseFloat(((occupiedRooms / totalRooms) * 100).toFixed(1)) : 0;

    res.json({
      balance: parseFloat(String(landlord.balance || 0)),
      totalRevenue: parseFloat(String(landlord.totalRevenue || 0)),
      totalWithdrawn: parseFloat(String(landlord.totalWithdrawn || 0)),
      bankName: landlord.bankName || '',
      bankAccountNumber: landlord.bankAccountNumber || '',
      bankAccountHolder: landlord.bankAccountHolder || '',
      totalProperti,
      totalRooms,
      occupiedRooms,
      occupancyRate,
      activeTenants: occupiedRooms,
      monthlyRevenue: monthlyRevenueRows,
      withdrawals
    });
  } catch (err) {
    console.error("Get landlord financials error:", err);
    res.status(500).json({ message: "Gagal memuat data keuangan landlord." });
  }
});

router.get('/withdrawals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }

  const targetUserId = authUser.role === 'admin'
    ? (req.query.userId ? String(req.query.userId) : null)
    : authUser.id;

  try {
    let sql = 'SELECT * FROM withdrawals WHERE 1=1';
    const params: string[] = [];
    if (targetUserId) {
      sql += ' AND userId = ?';
      params.push(targetUserId);
    }
    sql += ' ORDER BY id DESC LIMIT 50';
    const [rows] = await pool.query<WithdrawalRow[]>(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data penarikan." });
  }
});

router.get('/withdrawals/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }
  const userId = authUser.id;
  try {
    const [rows] = await pool.query<WithdrawalRow[]>('SELECT * FROM withdrawals WHERE userId = ? ORDER BY id DESC LIMIT 50', [userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data penarikan." });
  }
});

router.get('/landlord/rentals', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: AuthenticatedRequest, res: Response) => {
  const landlordId = String(req.query.landlordId || req.user?.id || 'user-landlord');
  try {
    const [rows] = await pool.query<RentalRow[]>(
      `SELECT r.*, p.name as propertyName FROM rentals r 
       JOIN properties p ON r.propertyId = p.id 
       WHERE p.ownerId = ? ORDER BY r.id DESC LIMIT 50`,
      [landlordId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Get landlord rentals error:", err);
    res.status(500).json({ message: "Gagal mengambil data sewa landlord." });
  }
});

interface WithdrawBody {
  amount?: number | string;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  userId?: string;
}

router.post('/withdraw', authenticateToken, requireRole(['admin', 'landlord']), async (req: AuthenticatedRequest, res: Response) => {
  const { amount, bankName, accountNumber, accountHolder, userId } = req.body;
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }

  if (!amount || !bankName || !accountNumber) {
    return res.status(400).json({ message: "Jumlah, nama bank, dan nomor rekening wajib diisi." });
  }

  const targetUserId = (authUser.role === 'admin' && userId) ? userId : authUser.id;
  const withdrawAmount = parseFloat(String(amount));

  if (withdrawAmount <= 0 || isNaN(withdrawAmount)) {
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

    // Deduct balance upfront (totalWithdrawn is incremented only when admin marks status as completed)
    const newBalance = parseFloat(String(user.balance || 0)) - withdrawAmount;
    const currentWithdrawn = parseFloat(String(user.totalWithdrawn || 0));

    await connection.query(
      'UPDATE users SET balance = ? WHERE id = ?',
      [newBalance, targetUserId]
    );

    const withdrawalId = generateId("w");
    const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const holder = accountHolder || user.bankAccountHolder || user.name || '';

    await connection.query(
      `INSERT INTO withdrawals (id, userId, bankName, accountNumber, accountHolder, amount, date, status, referenceId, rejectionReason, processedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '', '', '')`,
      [withdrawalId, targetUserId, bankName, accountNumber, holder, withdrawAmount, dateStr]
    );

    await connection.commit();
    res.json({
      message: "Permintaan penarikan dana berhasil diajukan dan sedang menunggu proses.",
      withdrawalId,
      balance: newBalance,
      totalWithdrawn: currentWithdrawn,
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

router.get('/admin/withdrawals', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
  const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
  const offsetParam = req.query.offset ? parseInt(String(req.query.offset), 10) : (limitParam ? (pageParam - 1) * limitParam : 0);

  try {
    let sql = `
      SELECT w.*, u.name as userName, u.email as userEmail, u.phone as userPhone
      FROM withdrawals w
      LEFT JOIN users u ON w.userId = u.id
      ORDER BY w.date DESC
    `;
    const params: (string | number)[] = [];

    if (limitParam && limitParam > 0) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(limitParam, Math.max(0, offsetParam));
    }

    const [rows] = await pool.query<WithdrawalRow[]>(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Get admin withdrawals error:", err);
    res.status(500).json({ message: "Gagal mengambil data penarikan dana." });
  }
});

router.post('/admin/withdrawals/:id/process', authenticateToken, requireRole(['admin']), async (req: Request<{ id: string }, unknown, { status?: 'processing' | 'completed'; referenceId?: string }>, res: Response) => {
  const { id } = req.params;
  const targetStatus = req.body?.status || 'completed';
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

    const refId = req.body?.referenceId || withdrawal.referenceId || `REF-${Date.now().toString(36).toUpperCase()}`;
    const processedAt = new Date().toISOString();

    // Increment totalWithdrawn upon successful completion
    if (targetStatus === 'completed') {
      await connection.query(
        'UPDATE users SET totalWithdrawn = totalWithdrawn + ? WHERE id = ?',
        [withdrawal.amount, withdrawal.userId]
      );
    }

    await connection.query(
      "UPDATE withdrawals SET status = ?, referenceId = ?, processedAt = ? WHERE id = ?", 
      [targetStatus, refId, processedAt, id]
    );

    await connection.commit();
    res.json({
      message: targetStatus === 'completed' 
        ? "Disbursement berhasil diproses dan status diselesaikan." 
        : "Status pencairan dana diperbarui ke sedang diproses.",
      withdrawalId: id,
      status: targetStatus,
      referenceId: refId,
      processedAt
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

    // Reverse balance deduction
    await connection.query(
      'UPDATE users SET balance = balance + ? WHERE id = ?',
      [withdrawAmount, withdrawal.userId]
    );

    const rejectionReason = reason || "Pencairan dana ditolak oleh administrator";
    const processedAt = new Date().toISOString();

    await connection.query(
      "UPDATE withdrawals SET status = 'rejected', rejectionReason = ?, processedAt = ? WHERE id = ?", 
      [rejectionReason, processedAt, id]
    );

    await connection.commit();
    res.json({
      message: "Penarikan berhasil ditolak dan saldo telah dikembalikan ke akun landlord.",
      withdrawalId: id,
      status: 'rejected',
      reason: rejectionReason,
      processedAt
    });
  } catch (err: unknown) {
    await connection.rollback();
    console.error("Reject withdrawal error:", err);
    res.status(500).json({ message: "Gagal menolak penarikan dana." });
  } finally {
    connection.release();
  }
});

// ==========================================
// Tracking & Admin Stats API
// ==========================================
router.post('/tracking/visit', trackingLimiter, async (req: Request, res: Response) => {
  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const firstIp = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
  const ip = firstIp.split(',')[0].trim().substring(0, 255);
  const userAgent = String(req.headers['user-agent'] || '').substring(0, 1000);
  try {
    await pool.query(
      'INSERT INTO visitor_tracking (ip_address, user_agent) VALUES (?, ?)',
      [ip, userAgent]
    );
    res.status(201).json({ message: "Kunjungan berhasil dilacak." });
  } catch (err: unknown) {
    console.error("Error in POST /api/tracking/visit:", err);
    res.status(500).json({ error: 'Internal Server Error', message: "Gagal melacak kunjungan." });
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
    const [
      [visitorRows],
      [userRows],
      [landlordRows],
      [propertyRows],
      [roomsRows]
    ] = await Promise.all([
      pool.query<CountRow[]>('SELECT COUNT(*) as count FROM visitor_tracking'),
      pool.query<CountRow[]>('SELECT COUNT(*) as count FROM users'),
      pool.query<CountRow[]>("SELECT COUNT(*) as count FROM users WHERE role = 'landlord'"),
      pool.query<CountRow[]>('SELECT COUNT(*) as count FROM properties'),
      pool.query<SumRow[]>('SELECT COALESCE(SUM(totalRooms), 0) as sum FROM properties')
    ]);

    const totalVisitors = visitorRows[0]?.count || 0;
    const totalUsers = userRows[0]?.count || 0;
    const totalLandlords = landlordRows[0]?.count || 0;
    const totalProperties = propertyRows[0]?.count || 0;
    const totalRooms = roomsRows[0]?.sum || 0;

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
  status: 'active' | 'terminated' | 'pending' | 'cancelled';
}

router.get('/reports/landlord/excel', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: AuthenticatedRequest, res: Response) => {
  const authUser = req.user;
  if (!authUser) return res.status(401).json({ message: 'Otentikasi diperlukan.' });

  const landlordId = authUser.role === 'admin' && req.query.landlordId
    ? String(req.query.landlordId)
    : authUser.id;

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
router.post('/auth/verify-password', authLimiter, authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { password, userId } = req.body;
  if (!password) {
    return res.status(400).json({ message: "password wajib diisi." });
  }
  const authUser = req.user;
  const targetUserId = (authUser?.role === 'admin' && userId) ? userId : (authUser?.id || userId);
  try {
    const [rows] = await pool.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [targetUserId]);
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
// Rentals / Booking Endpoints & Payment Schedule
// ==========================================
export interface PaymentSchedule {
  nextPaymentDate: string;
  nextPaymentDateISO: string;
  daysRemaining: number;
  paymentStatus: 'Lunas (Periode Berjalan)' | 'Menjelang Jatuh Tempo' | 'Menunggu Pembayaran' | 'Penyewaan Selesai';
  leaseStartDate?: string;
  leaseEndDate?: string;
  leaseEndDateISO?: string;
  totalDurationMonths?: number;
}

export function computePaymentSchedule(
  startDateStr: string,
  status: string,
  durationMonthsOrRef?: number | Date,
  referenceDate?: Date
): PaymentSchedule {
  let effectiveDuration = 1;
  let isBoundedDuration = false;
  let effectiveRef: Date = new Date();

  if (durationMonthsOrRef instanceof Date) {
    effectiveRef = durationMonthsOrRef;
    isBoundedDuration = false;
  } else {
    if (typeof durationMonthsOrRef === 'number' && !isNaN(durationMonthsOrRef)) {
      effectiveDuration = Math.max(1, Math.floor(durationMonthsOrRef));
      isBoundedDuration = true;
    }
    if (referenceDate instanceof Date) {
      effectiveRef = referenceDate;
    }
  }

  const now = new Date(effectiveRef);
  now.setHours(0, 0, 0, 0);

  const rawStart = new Date(startDateStr);
  const start = isNaN(rawStart.getTime()) ? new Date(now) : new Date(rawStart);
  start.setHours(0, 0, 0, 0);

  const startDay = start.getDate();

  const getClampedDate = (months: number): Date => {
    const totalMonths = start.getMonth() + months;
    const year = start.getFullYear() + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12 + 12) % 12;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(startDay, daysInMonth), 0, 0, 0, 0);
  };

  const pad = (n: number) => n.toString().padStart(2, '0');
  const leaseEnd = getClampedDate(effectiveDuration);
  const leaseStartDate = start.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const leaseEndDate = leaseEnd.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const leaseEndDateISO = `${leaseEnd.getFullYear()}-${pad(leaseEnd.getMonth() + 1)}-${pad(leaseEnd.getDate())}`;

  if (status !== 'active' || (isBoundedDuration && now > leaseEnd)) {
    return {
      nextPaymentDate: '-',
      nextPaymentDateISO: '',
      daysRemaining: 0,
      paymentStatus: 'Penyewaan Selesai',
      leaseStartDate,
      leaseEndDate,
      leaseEndDateISO,
      totalDurationMonths: effectiveDuration
    };
  }

  let addedMonths = 1;
  let due = getClampedDate(addedMonths);
  while (due < now && (!isBoundedDuration || addedMonths < effectiveDuration)) {
    addedMonths += 1;
    due = getClampedDate(addedMonths);
  }

  const diffMs = due.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));

  const iso = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
  const formatted = due.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  let paymentStatus: PaymentSchedule['paymentStatus'] = 'Lunas (Periode Berjalan)';
  if (daysRemaining === 0) {
    paymentStatus = 'Menunggu Pembayaran';
  } else if (daysRemaining <= 3) {
    paymentStatus = 'Menjelang Jatuh Tempo';
  }

  return {
    nextPaymentDate: formatted,
    nextPaymentDateISO: iso,
    daysRemaining,
    paymentStatus,
    leaseStartDate,
    leaseEndDate,
    leaseEndDateISO,
    totalDurationMonths: effectiveDuration
  };
}

router.get('/rentals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }

  const { tenantId } = req.query;
  const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
  const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
  const offsetParam = req.query.offset ? parseInt(String(req.query.offset), 10) : (limitParam ? (pageParam - 1) * limitParam : 0);

  try {
    let sql = 'SELECT * FROM rentals WHERE 1=1';
    const params: (string | number)[] = [];

    if (authUser.role === 'tenant') {
      sql += ' AND tenantId = ?';
      params.push(authUser.id);
    } else if (authUser.role === 'landlord') {
      sql += ' AND propertyId IN (SELECT id FROM properties WHERE ownerId = ?)';
      params.push(authUser.id);
    } else if (authUser.role === 'admin' && tenantId) {
      sql += ' AND tenantId = ?';
      params.push(String(tenantId));
    }
    sql += ' ORDER BY id DESC';

    if (limitParam && limitParam > 0) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(limitParam, Math.max(0, offsetParam));
    }

    const [rows] = await pool.query<RentalRow[]>(sql, params);
    const enrichedRows = rows.map((r) => {
      const duration = Number(r.duration_months || 1);
      const schedule = computePaymentSchedule(r.startDate || new Date().toISOString(), r.status, duration);
      return {
        ...r,
        duration_months: duration,
        nextPaymentDate: schedule.nextPaymentDate,
        nextPaymentDateISO: schedule.nextPaymentDateISO,
        daysRemaining: schedule.daysRemaining,
        paymentStatus: schedule.paymentStatus,
        leaseStartDate: schedule.leaseStartDate,
        leaseEndDate: schedule.leaseEndDate,
        leaseEndDateISO: schedule.leaseEndDateISO,
        totalDurationMonths: schedule.totalDurationMonths
      };
    });
    res.json(enrichedRows);
  } catch (err) {
    console.error("Get rentals error:", err);
    res.status(500).json({ message: "Gagal mengambil data sewa." });
  }
});

router.get('/tenant/rentals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = (req.query.tenantId as string) || req.user?.id;
  if (!tenantId) {
    return res.status(400).json({ message: "tenantId diperlukan." });
  }

  try {
    const [rows] = await pool.query<RentalRow[]>(
      'SELECT * FROM rentals WHERE tenantId = ? ORDER BY id DESC',
      [tenantId]
    );
    const enrichedRows = rows.map((r) => {
      const duration = Number(r.duration_months || 1);
      const schedule = computePaymentSchedule(r.startDate || new Date().toISOString(), r.status, duration);
      return {
        ...r,
        duration_months: duration,
        nextPaymentDate: schedule.nextPaymentDate,
        nextPaymentDateISO: schedule.nextPaymentDateISO,
        daysRemaining: schedule.daysRemaining,
        paymentStatus: schedule.paymentStatus,
        leaseStartDate: schedule.leaseStartDate,
        leaseEndDate: schedule.leaseEndDate,
        leaseEndDateISO: schedule.leaseEndDateISO,
        totalDurationMonths: schedule.totalDurationMonths
      };
    });
    res.json(enrichedRows);
  } catch (err) {
    console.error("Get tenant rentals error:", err);
    res.status(500).json({ message: "Gagal mengambil data sewa tenant." });
  }
});

// ==========================================
// Digital Rental Contract Preview Generator
// ==========================================
router.post(
  '/rentals/contract/preview',
  authenticateToken,
  validateBody(previewContractSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: 'Akses ditolak. Token otentikasi diperlukan.' });
    }

    const {
      propertyId,
      durationMonths,
      startDate,
      tenantNikPassport,
      signatureBase64,
      rentalId: customRentalId
    } = req.body;

    try {
      const [propRows] = await pool.query<PropertyRow[]>(
        'SELECT id, name, address, price, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ?',
        [propertyId]
      );
      const property = propRows[0];
      if (!property) {
        return res.status(404).json({ success: false, message: 'Properti tidak ditemukan.' });
      }

      const [userRows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [authUser.id]);
      const tenant = userRows[0];

      let landlord: UserRow | undefined;
      if (property.ownerId) {
        const [landlordRows] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [property.ownerId]);
        landlord = landlordRows[0];
      }

      const signerIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        '127.0.0.1';
      const signerUserAgent = (req.headers['user-agent'] as string) || 'Mozilla/5.0 (KOSMO Secure Client)';
      const signedAtDate = new Date();
      const signedAtIso = signedAtDate.toISOString();
      const duration = Number(durationMonths) || 1;
      const monthlyPrice = Number(property.price) || 0;
      const adminFee = 5000;
      const totalPrice = (monthlyPrice * duration) + adminFee;
      const startDateStr =
        startDate ||
        signedAtDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const rentalId =
        customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== ''
          ? customRentalId.trim()
          : 'preview-draft';

      const contractData: RentalContractData = {
        rentalId,
        propertyName: property.name,
        propertyAddress: property.address || 'Kabupaten Badung / Kota Denpasar, Bali, Indonesia',
        landlordName: landlord ? landlord.name : 'PT KOSMO Bali Hospitality / Pengelola Properti',
        landlordEmail: landlord ? landlord.email : 'hospitality@kosmo.id',
        landlordPhone: landlord ? landlord.phone : '+62 361-900-5676',
        tenantName: tenant ? tenant.name : authUser.email,
        tenantEmail: tenant ? tenant.email : authUser.email,
        tenantPhone: tenant ? (tenant.phone || '') : '',
        tenantNikPassport: tenantNikPassport || (tenant ? tenant.identity_number : '') || '-',
        tenantAddress: tenant ? (tenant.address || '') : '',
        tenantOccupation: tenant ? (tenant.occupation || '') : '',
        emergencyContactName: tenant ? (tenant.emergency_contact_name || '') : '',
        emergencyContactPhone: tenant ? (tenant.emergency_contact_phone || '') : '',
        emergencyContactRelation: tenant ? (tenant.emergency_contact_relation || '') : '',
        startDate: startDateStr,
        durationMonths: duration,
        monthlyPrice,
        pricePerMonth: monthlyPrice,
        totalPrice,
        adminFee,
        signatureBase64: signatureBase64 || undefined,
        signerIp,
        signerUserAgent,
        signedAt: signedAtIso,
        utilityQuotas: {
          electricityKwh: 200,
          water: 'PDAM & Deep Well (Air Bersih Terfilter) Included',
          wifiMbps: 100,
          security: '24/7 CCTV & Security Access',
          waste: 'Daily Waste Management Included'
        }
      };

      const pdfBuffer = await generateRentalContractBuffer(contractData);
      const contractHash = computeContractHash(pdfBuffer);
      const profileStatus = tenant ? isUserProfileComplete(tenant) : { complete: false, missingFields: ['user'], missingFieldLabels: ['Data Pengguna'] };

      return res.status(200).json({
        success: true,
        contractData,
        contractHash,
        monthlyPrice,
        adminFee,
        totalPrice,
        totalAmount: totalPrice,
        isProfileComplete: profileStatus.complete,
        missingProfileFields: profileStatus.missingFields,
        missingProfileFieldLabels: profileStatus.missingFieldLabels
      });
    } catch (err: unknown) {
      console.error('Contract preview error:', err);
      return res.status(500).json({ success: false, message: 'Gagal membuat pratinjau kontrak digital.' });
    }
  }
);

// ==========================================
// Digital Rental Contract Transactional Signing
// ==========================================
router.post(
  '/rentals/contract/sign',
  authenticateToken,
  validateBody(signContractSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: 'Akses ditolak. Token otentikasi diperlukan.' });
    }

    const {
      propertyId,
      durationMonths,
      startDate,
      tenantNikPassport,
      signatureBase64,
      rentalId: customRentalId
    } = req.body;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 🛡️ Concurrency Guard 1: Tenant Exclusive Row Lock & Single Active Tenancy Check
      const [userRows] = await connection.query<UserRow[]>('SELECT * FROM users WHERE id = ? FOR UPDATE', [authUser.id]);
      const tenant = userRows[0];
      if (!tenant) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
      }

      // 🛡️ Legal Profile Integrity Gate: Enforce Complete Tenant Identity & KYC (KUHPerdata Art. 1320 & UU ITE)
      const profileCheck = isUserProfileComplete(tenant);
      if (!profileCheck.complete) {
        await connection.rollback();
        return res.status(422).json({
          success: false,
          message:
            'Profil identitas hukum penyewa belum lengkap. Berdasarkan Pasal 1320 KUHPerdata & UU ITE, Anda wajib melengkapi data identitas (NIK/Paspor, Alamat Domisili, Pekerjaan, dan Kontak Darurat) pada profil Anda sebelum menyewa kos.',
          missingFields: profileCheck.missingFields,
          missingFieldLabels: profileCheck.missingFieldLabels
        });
      }

      const [activeRentals] = await connection.query<RentalRow[]>(
        "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' FOR UPDATE",
        [authUser.id]
      );
      if (activeRentals.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message:
            'Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru.'
        });
      }

      // 🛡️ Concurrency Guard 2: Property Room Availability Row Lock
      const [propRows] = await connection.query<PropertyRow[]>(
        'SELECT id, name, address, price, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ? FOR UPDATE',
        [propertyId]
      );
      const property = propRows[0];
      if (!property) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Properti tidak ditemukan.' });
      }

      if (property.occupiedRooms >= property.totalRooms) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Kamar kos sudah penuh.' });
      }

      let landlord: UserRow | undefined;
      if (property.ownerId) {
        const [landlordRows] = await connection.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [property.ownerId]);
        landlord = landlordRows[0];
      }

      // Audit Trail Capture & Timestamps
      const signerIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        '127.0.0.1';
      const signerUserAgent = (req.headers['user-agent'] as string) || 'Mozilla/5.0 (KOSMO Secure Client)';
      const signedAtDate = new Date();
      const signedAtIso = signedAtDate.toISOString();
      const duration = Number(durationMonths) || 1;
      const adminFee = 5000.0;
      const rentalPrice = Number(property.price) || 0;
      const totalAmount = (rentalPrice * duration) + adminFee;
      const rentalId =
        customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== ''
          ? customRentalId.trim()
          : generateId('rent');
      const startDateStr =
        startDate ||
        signedAtDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

      // Generate in-memory PDF and stream directly to Cloudinary
      const contractData: RentalContractData = {
        rentalId,
        propertyName: property.name,
        propertyAddress: property.address || 'Kabupaten Badung / Kota Denpasar, Bali, Indonesia',
        landlordName: landlord ? landlord.name : 'PT KOSMO Bali Hospitality / Pengelola Properti',
        landlordEmail: landlord ? landlord.email : 'hospitality@kosmo.id',
        landlordPhone: landlord ? landlord.phone : '+62 361-900-5676',
        tenantName: tenant ? tenant.name : authUser.email,
        tenantEmail: tenant ? tenant.email : authUser.email,
        tenantPhone: tenant ? (tenant.phone || '') : '',
        tenantNikPassport: tenantNikPassport || (tenant ? tenant.identity_number : '') || '-',
        tenantAddress: tenant ? (tenant.address || '') : '',
        tenantOccupation: tenant ? (tenant.occupation || '') : '',
        emergencyContactName: tenant ? (tenant.emergency_contact_name || '') : '',
        emergencyContactPhone: tenant ? (tenant.emergency_contact_phone || '') : '',
        emergencyContactRelation: tenant ? (tenant.emergency_contact_relation || '') : '',
        startDate: startDateStr,
        durationMonths: duration,
        monthlyPrice: rentalPrice,
        pricePerMonth: rentalPrice,
        totalPrice: totalAmount,
        adminFee,
        signatureBase64,
        signerIp,
        signerUserAgent,
        signedAt: signedAtIso,
        utilityQuotas: {
          electricityKwh: 200,
          water: 'PDAM & Deep Well (Air Bersih Terfilter) Included',
          wifiMbps: 100,
          security: '24/7 CCTV & Security Access',
          waste: 'Daily Waste Management Included'
        }
      };

      const uploadResult = await generateAndUploadContract(contractData);
      const contractUrl = uploadResult.cloudinaryUrl || `/uploads/contract_${sanitizeRentalId(rentalId)}.pdf`;
      const contractHash = uploadResult.contractHash;

      // Atomic Insert with 8 Audit Columns and duration_months (status: pending until payment settlement)
      await connection.query(
        `INSERT INTO rentals (
          id, tenantId, propertyId, propertyName, price, startDate, status,
          document, contract_url, contract_hash, contract_signed_at,
          signer_ip, signer_user_agent, tenant_nik_passport, tenant_signature_data, admin_fee_amount, duration_months
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rentalId,
          authUser.id,
          propertyId,
          property.name,
          rentalPrice,
          startDateStr,
          contractUrl,
          contractUrl,
          contractHash,
          signedAtDate,
          signerIp,
          signerUserAgent,
          tenantNikPassport,
          signatureBase64,
          adminFee,
          duration
        ]
      );

      await connection.commit();
      apiCache.invalidatePattern('properties');
      apiCache.invalidatePattern('rentals');

      return res.status(201).json({
        success: true,
        message: 'Kontrak digital berhasil ditandatangani. Silakan selesaikan pembayaran.',
        rentalId,
        contractUrl,
        contractHash,
        adminFee,
        totalAmount,
        signedAt: signedAtIso
      });
    } catch (err: unknown) {
      await connection.rollback();
      console.error('Contract sign error:', err);
      return res.status(500).json({ success: false, message: 'Gagal memproses penandatanganan kontrak digital.' });
    } finally {
      connection.release();
    }
  }
);

interface CreateRentalBody {
  rentalId?: string;
  tenantId?: string;
  propertyId?: string;
  propertyName?: string;
  price?: number;
  durationMonths?: number;
  signature?: string;
}

router.post('/rentals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { tenantId, propertyId, propertyName, price, durationMonths, signature } = req.body;
  const authUser = req.user;
  if (!tenantId || !propertyId) {
    return res.status(400).json({ message: "tenantId dan propertyId wajib diisi." });
  }

  // Authorization check: non-admins can only book for themselves
  if (authUser?.role !== 'admin' && authUser?.id !== tenantId) {
    return res.status(403).json({ message: "Akses ditolak. Anda tidak dapat memesan atas nama akun lain." });
  }

  const rentalId = (req.body.rentalId && typeof req.body.rentalId === 'string' && req.body.rentalId.trim() !== '')
    ? req.body.rentalId
    : generateId("rent");

  // Optional: Verify Midtrans status if configured
  if (process.env.MIDTRANS_SERVER_KEY && !process.env.MIDTRANS_SERVER_KEY.includes('placeholder') && !process.env.MIDTRANS_SERVER_KEY.includes('your-server-key')) {
    try {
      const snapApi = snap as unknown as { transaction?: { status: (orderId: string) => Promise<{ transaction_status: string; fraud_status?: string; gross_amount: string }> } };
      if (snapApi.transaction?.status) {
        const statusResponse = await snapApi.transaction.status(rentalId);
        const isValidPayment = 
          statusResponse.transaction_status === 'settlement' || 
          (statusResponse.transaction_status === 'capture' && statusResponse.fraud_status === 'accept');
        if (!isValidPayment) {
          return res.status(402).json({ message: "Pembayaran belum diselesaikan pada payment gateway Midtrans." });
        }
      }
    } catch (midtransErr) {
      // In development or simulation environments, allow proceeding if token was minted
      console.warn("Midtrans status check warning:", midtransErr);
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [propRows] = await connection.query<PropertyRow[]>(
      'SELECT totalRooms, occupiedRooms, price, name, address, ownerId FROM properties WHERE id = ? FOR UPDATE',
      [propertyId]
    );
    const property = propRows[0];
    if (!property) {
      await connection.rollback();
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    const [existingRentals] = await connection.query<RentalRow[]>(
      'SELECT id, status, document FROM rentals WHERE id = ? FOR UPDATE',
      [rentalId]
    );

    // Idempotency: If webhook already activated this lease, return success immediately
    if (existingRentals.length > 0 && existingRentals[0].status === 'active') {
      await connection.commit();
      return res.status(200).json({
        message: "Penyewaan kos sudah aktif!",
        rentalId,
        document: existingRentals[0].document || 'sertifikat_kepemilikan.pdf'
      });
    }

    if (property.occupiedRooms >= property.totalRooms) {
      await connection.rollback();
      return res.status(400).json({ message: "Kamar kos sudah penuh." });
    }

    const [userRows] = await connection.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [tenantId]);
    const tenant = userRows[0];
    if (!tenant) {
      await connection.rollback();
      return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }

    // Check legal profile completeness
    const profileCheck = isUserProfileComplete(tenant);
    if (!profileCheck.complete) {
      await connection.rollback();
      return res.status(422).json({
        message: "Profil identitas hukum penyewa belum lengkap. Lengkapi profil Anda terlebih dahulu sebelum menyewa.",
        missingFields: profileCheck.missingFields,
        missingFieldLabels: profileCheck.missingFieldLabels
      });
    }

    // Check single active tenancy rule
    const [activeRentals] = await connection.query<RentalRow[]>(
      "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' AND id != ? LIMIT 1",
      [tenantId, rentalId]
    );
    if (activeRentals.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        message: "Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru."
      });
    }

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
        tenantNikPassport: tenant ? tenant.identity_number : '',
        tenantAddress: tenant ? tenant.address : '',
        tenantOccupation: tenant ? tenant.occupation : '',
        emergencyContactName: tenant ? tenant.emergency_contact_name : '',
        emergencyContactPhone: tenant ? tenant.emergency_contact_phone : '',
        emergencyContactRelation: tenant ? tenant.emergency_contact_relation : '',
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

    const rentalDuration = durationMonths && durationMonths > 0 ? durationMonths : 1;

    if (existingRentals.length > 0) {
      await connection.query(
        `UPDATE rentals 
         SET status = 'active', document = ?, propertyName = ?, price = ?, startDate = ?, duration_months = ? 
         WHERE id = ?`,
        [documentPath, rentalName, rentalPrice, startDate, rentalDuration, rentalId]
      );
    } else {
      await connection.query(
        `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, document, duration_months) 
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [rentalId, tenantId, propertyId, rentalName, rentalPrice, startDate, documentPath, rentalDuration]
      );
    }

    await connection.query(
      'UPDATE properties SET occupiedRooms = LEAST(totalRooms, occupiedRooms + 1) WHERE id = ?',
      [propertyId]
    );

    if (property.ownerId) {
      await connection.query(
        'UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?',
        [rentalPrice * rentalDuration, rentalPrice * rentalDuration, property.ownerId]
      );
    }

    await connection.commit();
    apiCache.invalidatePattern('properties');
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

router.post('/rentals/:id/terminate', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { password } = req.body;
  const authUser = req.user;
  if (!password) {
    return res.status(400).json({ message: "Password wajib dimasukkan." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rentalRows] = await connection.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ? FOR UPDATE', [id]);
    const rental = rentalRows[0];
    if (!rental) {
      await connection.rollback();
      return res.status(404).json({ message: "Data sewa tidak ditemukan." });
    }
    if (rental.status === 'terminated') {
      await connection.rollback();
      return res.status(400).json({ message: "Sewa sudah pernah diberhentikan." });
    }

    // Check authorization: caller must be tenant, property landlord, or admin
    const [propRows] = await connection.query<PropertyRow[]>('SELECT ownerId FROM properties WHERE id = ?', [rental.propertyId]);
    const property = propRows[0];

    const isTenant = authUser?.id === rental.tenantId;
    const isOwner = property && authUser?.id === property.ownerId;
    const isAdmin = authUser?.role === 'admin';

    if (!isTenant && !isOwner && !isAdmin) {
      await connection.rollback();
      return res.status(403).json({ message: "Akses ditolak. Anda tidak berhak memberhentikan sewa ini." });
    }

    // Verify caller's own password
    const [userRows] = await connection.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [authUser?.id]);
    const caller = userRows[0];
    if (!caller || !caller.password || !bcrypt.compareSync(password, caller.password)) {
      await connection.rollback();
      return res.status(401).json({ message: "Password salah." });
    }

    await connection.query(
      "UPDATE rentals SET status = 'terminated' WHERE id = ?",
      [id]
    );

    if (rental.status === 'active') {
      await connection.query(
        'UPDATE properties SET occupiedRooms = GREATEST(0, occupiedRooms - 1) WHERE id = ?',
        [rental.propertyId]
      );
    }

    await connection.commit();
    apiCache.invalidatePattern('properties');
    res.json({ message: "Sewa kos berhasil diberhentikan." });
  } catch (err) {
    await connection.rollback();
    console.error("Terminate rental error:", err);
    res.status(500).json({ message: "Gagal memberhentikan sewa kos." });
  } finally {
    connection.release();
  }
});

router.get(
  '/rentals/:id/contract',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const authUser = req.user;

    if (!authUser) {
      return res.status(401).json({ message: 'Akses ditolak. Token otentikasi diperlukan.' });
    }

    try {
      const [rows] = await pool.query<RentalContractJoinedRow[]>(
        `SELECT 
          r.id AS rental_id,
          r.tenantId AS rental_tenant_id,
          r.propertyId AS rental_property_id,
          r.propertyName AS rental_property_name,
          r.price AS rental_price,
          r.startDate AS rental_start_date,
          r.status AS rental_status,
          r.document AS rental_document,
          r.contract_url,
          r.contract_hash,
          r.contract_signed_at,
          r.signer_ip,
          r.signer_user_agent,
          r.tenant_nik_passport,
          r.tenant_signature_data,
          r.admin_fee_amount,
          r.duration_months,
          p.name AS property_name,
          p.address AS property_address,
          p.price AS property_price,
          p.ownerId AS property_owner_id,
          u.name AS tenant_name,
          u.email AS tenant_email,
          u.phone AS tenant_phone,
          u.address AS tenant_address,
          u.occupation AS tenant_occupation,
          u.emergency_contact_name AS tenant_emergency_contact_name,
          u.emergency_contact_phone AS tenant_emergency_contact_phone,
          u.emergency_contact_relation AS tenant_emergency_contact_relation,
          l.name AS landlord_name,
          l.email AS landlord_email,
          l.phone AS landlord_phone
        FROM rentals r
        LEFT JOIN properties p ON r.propertyId = p.id
        LEFT JOIN users u ON r.tenantId = u.id
        LEFT JOIN users l ON p.ownerId = l.id
        WHERE r.id = ?`,
        [id]
      );

      const rental = rows[0];
      if (!rental) {
        return res.status(404).json({ message: 'Data sewa tidak ditemukan.' });
      }

      // RBAC Gate: Tenant, Property Landlord/Owner, or Admin
      const isTenant = authUser.id === rental.rental_tenant_id;
      const isOwner = Boolean(rental.property_owner_id && authUser.id === rental.property_owner_id);
      const isAdmin = authUser.role === 'admin';

      if (!isTenant && !isOwner && !isAdmin) {
        return res.status(403).json({ message: 'Akses ditolak ke dokumen kontrak ini.' });
      }

      const contractDuration = Number(rental.duration_months || 1);
      const contractMonthlyPrice = Number(rental.rental_price || rental.property_price || 0);
      const contractAdminFee =
        rental.admin_fee_amount !== undefined && rental.admin_fee_amount !== null
          ? Number(rental.admin_fee_amount)
          : 5000;
      const contractTotalPrice = (contractMonthlyPrice * contractDuration) + contractAdminFee;

      // Prepare contract data model with complete audit trail
      const contractData: RentalContractData = {
        rentalId: rental.rental_id,
        propertyName: rental.rental_property_name || rental.property_name || 'Unit KOSMO Bali',
        propertyAddress: rental.property_address || 'Kabupaten Badung / Kota Denpasar, Bali, Indonesia',
        landlordName: rental.landlord_name || 'PT KOSMO Bali Hospitality / Pengelola Properti',
        landlordEmail: rental.landlord_email || 'hospitality@kosmo.id',
        landlordPhone: rental.landlord_phone || '+62 361-900-5676',
        tenantName: rental.tenant_name || 'Penyewa KOSMO',
        tenantEmail: rental.tenant_email || '',
        tenantPhone: rental.tenant_phone || '',
        tenantNikPassport: rental.tenant_nik_passport || '-',
        tenantAddress: rental.tenant_address || '',
        tenantOccupation: rental.tenant_occupation || '',
        emergencyContactName: rental.tenant_emergency_contact_name || '',
        emergencyContactPhone: rental.tenant_emergency_contact_phone || '',
        emergencyContactRelation: rental.tenant_emergency_contact_relation || '',
        startDate:
          rental.rental_start_date ||
          new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
        durationMonths: contractDuration,
        monthlyPrice: contractMonthlyPrice,
        pricePerMonth: contractMonthlyPrice,
        totalPrice: contractTotalPrice,
        adminFee: contractAdminFee,
        signatureBase64: rental.tenant_signature_data || undefined,
        signerIp: rental.signer_ip || undefined,
        signerUserAgent: rental.signer_user_agent || undefined,
        signedAt: rental.contract_signed_at ? new Date(rental.contract_signed_at).toISOString() : undefined,
        utilityQuotas: {
          electricityKwh: 200,
          water: 'PDAM & Deep Well (Air Bersih Terfilter) Included',
          wifiMbps: 100,
          security: '24/7 CCTV & Security Access',
          waste: 'Daily Waste Management Included'
        }
      };

      const pdfBuffer = await generateRentalContractBuffer(contractData);
      const computedHash = computeContractHash(pdfBuffer);
      const contractHash = rental.contract_hash || computedHash;
      const safeId = sanitizeRentalId(rental.rental_id);

      const isDownload = req.query.download === 'true' || req.query.download === '1';
      const dispositionType = isDownload ? 'attachment' : 'inline';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${dispositionType}; filename="kontrak_sewa_${safeId}.pdf"`);
      res.setHeader('X-Contract-Hash', contractHash);
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');

      res.end(pdfBuffer);
    } catch (err: unknown) {
      console.error('Get contract PDF error:', err);
      res.status(500).json({ message: 'Gagal membuat dokumen kontrak PDF.' });
    }
  }
);

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
  // Normalize grossAmount string (Midtrans might format with or without .00)
  const normalizedAmount = grossAmount.includes('.') ? parseFloat(grossAmount).toFixed(2) : grossAmount;
  const payload = `${orderId}${statusCode}${normalizedAmount}${serverKey}`;
  const calculatedHash = crypto.createHash('sha512').update(payload).digest('hex').toLowerCase();
  const targetSig = signatureKey.toLowerCase();

  const calculatedBuffer = Buffer.from(calculatedHash, 'utf8');
  const targetBuffer = Buffer.from(targetSig, 'utf8');

  if (calculatedBuffer.length !== targetBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(calculatedBuffer, targetBuffer);
}

interface PaymentTokenBody {
  propertyId?: string;
  tenantId?: string;
  durationMonths?: number;
}

router.post('/payment/token', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { propertyId, tenantId, durationMonths } = req.body;
  const authUser = req.user;
  if (!propertyId || !tenantId) {
    return res.status(400).json({ message: "propertyId dan tenantId wajib diisi." });
  }

  // Authorization check: non-admins can only generate tokens for themselves
  if (authUser?.role !== 'admin' && authUser?.id !== tenantId) {
    return res.status(403).json({ message: "Akses ditolak. Anda tidak dapat membuat token atas nama akun lain." });
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

    // Check single active tenancy rule (excluding current rentalId if already signed)
    const customRentalId = req.body.rentalId;
    let activeRentalsQuery = "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active'";
    const queryParams: (string | number)[] = [tenantId];
    if (customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== '') {
      activeRentalsQuery += " AND id != ?";
      queryParams.push(customRentalId.trim());
    }
    activeRentalsQuery += " LIMIT 1";

    const [activeRentals] = await pool.query<RentalRow[]>(activeRentalsQuery, queryParams);
    if (activeRentals.length > 0) {
      return res.status(409).json({
        message: "Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru."
      });
    }

    const rentalId = (customRentalId && typeof customRentalId === 'string' && customRentalId.trim() !== '')
      ? customRentalId.trim()
      : generateId("rent");
    const startDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const monthlyRent = Number(property.price);
    const adminFee = 5000.0;
    const totalAmount = (monthlyRent * duration) + adminFee;

    // If rental record was not pre-created via /rentals/contract/sign, insert pending rental record
    const [existingRental] = await pool.query<RentalRow[]>('SELECT id FROM rentals WHERE id = ?', [rentalId]);
    if (existingRental.length === 0) {
      await pool.query(
        `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, admin_fee_amount, duration_months) 
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [rentalId, tenantId, propertyId, property.name, monthlyRent, startDate, adminFee, duration]
      );
    }

    // Generate unique Midtrans attempt order_id to prevent "order_id has already been taken" error on retries/resumptions
    const attemptOrderId = `${rentalId}-${Date.now()}`;

    // Create Snap transaction parameters
    const parameter = {
      transaction_details: {
        order_id: attemptOrderId,
        gross_amount: totalAmount
      },
      customer_details: {
        first_name: tenant.name,
        email: tenant.email,
        phone: tenant.phone || ''
      },
      item_details: [
        {
          id: property.id,
          price: monthlyRent,
          quantity: duration,
          name: property.name.substring(0, 50)
        },
        {
          id: 'ADMIN_FEE',
          price: adminFee,
          quantity: 1,
          name: 'Biaya Administrasi & Meterai'
        }
      ],
      custom_field1: rentalId
    };

    let transactionToken = `snap-token-${rentalId}`;
    let redirectUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${rentalId}`;

    if (process.env.MIDTRANS_SERVER_KEY && !process.env.MIDTRANS_SERVER_KEY.includes('your-server-key') && !process.env.MIDTRANS_SERVER_KEY.includes('placeholder')) {
      try {
        const transaction = await snap.createTransaction(parameter);
        transactionToken = transaction.token;
        redirectUrl = transaction.redirect_url;
      } catch (snapErr) {
        console.error("Midtrans createTransaction error:", snapErr);
        const errMsg = snapErr instanceof Error ? snapErr.message : String(snapErr);
        return res.status(502).json({
          message: `Gagal membuat transaksi di Midtrans: ${errMsg}`
        });
      }
    }

    res.json({
      message: "Token pembayaran berhasil dibuat.",
      token: transactionToken,
      redirect_url: redirectUrl,
      rentalId,
      orderId: attemptOrderId
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

export async function settleRentalPayment(
  orderIdOrRentalId: string,
  paidAmount?: number
): Promise<{ success: boolean; statusCode?: number; message: string; rental?: RentalRow }> {
  // Extract target rentalId if orderId has attempt timestamp suffix (e.g. 'rent-abc12345-1724783921000' -> 'rent-abc12345')
  let targetRentalId = orderIdOrRentalId.trim();
  const rentMatch = targetRentalId.match(/^(rent-[a-zA-Z0-9]+)(?:-\d+)?$/);
  if (rentMatch && rentMatch[1]) {
    targetRentalId = rentMatch[1];
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rentalRows] = await connection.query<RentalRow[]>(
      'SELECT * FROM rentals WHERE id = ? OR id = ? FOR UPDATE',
      [targetRentalId, orderIdOrRentalId.trim()]
    );
    const rental = rentalRows[0];

    if (!rental) {
      await connection.rollback();
      return { success: false, statusCode: 404, message: "Data sewa tidak ditemukan." };
    }

    const resolvedRentalId = rental.id;
    const monthlyPrice = Number(rental.price || 0);
    const durationMonths = Number(rental.duration_months || 1);
    const adminFee = Number(
      rental.admin_fee_amount !== undefined && rental.admin_fee_amount !== null
        ? rental.admin_fee_amount
        : 5000
    );
    const expectedWithAdmin = (monthlyPrice * durationMonths) + adminFee;
    const expectedBase = monthlyPrice * durationMonths;

    if (paidAmount !== undefined && !isNaN(paidAmount)) {
      const isPriceMatch =
        Math.abs(paidAmount - expectedWithAdmin) <= 1.0 ||
        Math.abs(paidAmount - expectedBase) <= 1.0 ||
        Math.abs(paidAmount - monthlyPrice) <= 1.0;

      if (!isPriceMatch) {
        await connection.rollback();
        console.error(`Midtrans gross_amount mismatch: expected ${expectedWithAdmin} or ${expectedBase}, got ${paidAmount}`);
        return { success: false, statusCode: 400, message: "Jumlah nominal pembayaran tidak sesuai dengan harga sewa." };
      }
    }

    // Check if already processed to prevent duplicate room increments or balance credits
    if (rental.status !== 'active') {
      const [propRows] = await connection.query<PropertyRow[]>(
        'SELECT totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ? FOR UPDATE',
        [rental.propertyId]
      );
      const property = propRows[0];

      if (property && property.occupiedRooms >= property.totalRooms) {
        await connection.rollback();
        console.error(`Overbooking conflict detected for property ${property.id}, rental ${resolvedRentalId}`);
        return { success: false, statusCode: 409, message: "Kamar sudah penuh, pembayaran memerlukan penanganan manual." };
      }

      await connection.query("UPDATE rentals SET status = 'active' WHERE id = ?", [resolvedRentalId]);

      await connection.query(
        'UPDATE properties SET occupiedRooms = LEAST(totalRooms, occupiedRooms + 1) WHERE id = ?',
        [rental.propertyId]
      );

      if (property && property.ownerId) {
        const totalRentalRevenue = monthlyPrice * durationMonths;
        await connection.query(
          'UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?',
          [totalRentalRevenue, totalRentalRevenue, property.ownerId]
        );
      }
    }

    await connection.commit();
    apiCache.invalidatePattern('properties');
    apiCache.invalidatePattern('rentals');
    return {
      success: true,
      statusCode: 200,
      message: "Pembayaran berhasil diproses dan status rental diaktifkan.",
      rental: { ...rental, status: 'active' }
    };
  } catch (err: unknown) {
    await connection.rollback();
    console.error("Settle rental payment error:", err);
    return { success: false, statusCode: 500, message: "Gagal memproses transaksi sewa." };
  } finally {
    connection.release();
  }
}

const handlePaymentNotification = async (req: Request<Record<string, never>, unknown, MidtransWebhookBody>, res: Response) => {
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
    const paidAmount = parseFloat(gross_amount);
    const result = await settleRentalPayment(order_id, isNaN(paidAmount) ? undefined : paidAmount);
    return res.status(result.statusCode || (result.success ? 200 : 400)).json({ message: result.message });
  }

  // Handle cancel, deny, or expire
  if (transaction_status === 'cancel' || transaction_status === 'deny' || transaction_status === 'expire') {
    try {
      let targetRentalId = order_id.trim();
      const rentMatch = targetRentalId.match(/^(rent-[a-zA-Z0-9]+)(?:-\d+)?$/);
      if (rentMatch && rentMatch[1]) {
        targetRentalId = rentMatch[1];
      }
      await pool.query("UPDATE rentals SET status = 'cancelled' WHERE (id = ? OR id = ?) AND status = 'pending'", [targetRentalId, order_id.trim()]);
      apiCache.invalidatePattern('properties');
      apiCache.invalidatePattern('rentals');
      return res.json({ message: `Status transaksi dibatalkan (${transaction_status}).` });
    } catch (err: unknown) {
      console.error("Cancel rental error:", err);
      return res.status(500).json({ message: "Gagal memperbarui status transaksi." });
    }
  }

  res.json({ message: "Status notifikasi diterima." });
};

router.post('/payment/webhook', handlePaymentNotification);
router.post('/payment/notification', handlePaymentNotification);

router.post('/payment/finish', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { rentalId } = req.body;
  const authUser = req.user;

  if (!rentalId || typeof rentalId !== 'string' || rentalId.trim() === '') {
    return res.status(400).json({ success: false, message: "rentalId wajib diisi." });
  }

  try {
    const [rows] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [rentalId.trim()]);
    const rental = rows[0];
    if (!rental) {
      return res.status(404).json({ success: false, message: "Data sewa tidak ditemukan." });
    }

    if (authUser?.role !== 'admin' && authUser?.id !== rental.tenantId) {
      return res.status(403).json({ success: false, message: "Akses ditolak ke data sewa ini." });
    }

    const result = await settleRentalPayment(rentalId.trim());
    if (!result.success) {
      return res.status(result.statusCode || 400).json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      rentalId: rentalId.trim()
    });
  } catch (err: unknown) {
    console.error("Payment finish route error:", err);
    return res.status(500).json({ success: false, message: "Gagal menyelesaikan transaksi pembayaran." });
  }
});

export default router;
