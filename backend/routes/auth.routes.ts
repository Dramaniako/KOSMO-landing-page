import type { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import { generateJwtToken, authenticateToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  loginSchema,
  registerSchema,
  updateProfileSchema,
  validateBody
} from '../middleware/validation';
import type { UserRole, IdentityType } from '../types/index';
import { isUserProfileComplete } from '../types/index';
import { generateId } from '../utils/id';

// Rate Limiter for Authentication Endpoints
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak percobaan masuk/daftar. Silakan coba lagi dalam 1 menit.' }
});

export interface UserRow extends RowDataPacket {
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

export interface UserProfileBody {
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

export function registerAuthRoutes(router: Router): void {
  router.post(
    '/auth/login',
    authLimiter,
    validateBody(loginSchema),
    async (req: Request<Record<string, never>, unknown, LoginBody>, res: Response) => {
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
    }
  );

  router.post(
    '/auth/register',
    authLimiter,
    validateBody(registerSchema),
    async (req: Request<Record<string, never>, unknown, RegisterBody>, res: Response) => {
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
    }
  );

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

  router.put(
    '/users/profile/:id',
    authenticateToken,
    validateBody(updateProfileSchema),
    async (req: AuthenticatedRequest, res: Response) => {
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
    }
  );

  // User Profile Update (Authenticated User alias)
  router.put(
    '/auth/profile',
    authenticateToken,
    validateBody(updateProfileSchema),
    async (req: AuthenticatedRequest, res: Response) => {
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
    }
  );

  // Password Verification Endpoint
  router.post(
    '/auth/verify-password',
    authLimiter,
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response) => {
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
    }
  );
}
