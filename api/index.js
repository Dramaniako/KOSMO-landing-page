// backend/server.ts
import express2 from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import bodyParser from "body-parser";
import morgan from "morgan";

// backend/db.ts
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
try {
  const possibleEnvPaths = [
    path.resolve(".env"),
    path.resolve("backend", ".env")
  ];
  for (const envPath of possibleEnvPaths) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf8");
      envContent.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const [key, ...valParts] = trimmed.split("=");
        if (key && valParts.length > 0 && !process.env[key.trim()]) {
          process.env[key.trim()] = valParts.join("=").trim();
        }
      });
    }
  }
} catch (e) {
  console.warn("Failed to load .env file:", e);
}
var host = process.env.DB_HOST || "localhost";
var isTiDB = host.includes("tidbcloud.com");
var isSSLFalse = process.env.DB_SSL === "false";
var sslOption = isSSLFalse ? void 0 : {
  minVersion: "TLSv1.2",
  rejectUnauthorized: false
};
var dbConfig = {
  host,
  port: parseInt(process.env.DB_PORT || (isTiDB ? "4000" : "3306"), 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "kosmo_db",
  ...sslOption ? { ssl: sslOption } : {},
  connectTimeout: 1e4,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || "5", 10),
  maxIdle: 5,
  idleTimeout: 6e4,
  enableKeepAlive: true,
  keepAliveInitialDelay: 1e4,
  queueLimit: 0
};
var activePool = null;
function getPool() {
  if (!activePool) {
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    activePool = mysql.createPool({
      ...dbConfig,
      connectionLimit: isServerless ? 2 : parseInt(process.env.DB_CONNECTION_LIMIT || "10", 10),
      maxIdle: isServerless ? 1 : 5,
      idleTimeout: isServerless ? 1e4 : 6e4,
      queueLimit: 0
    });
    const rawPool = activePool?.pool;
    rawPool?.on?.("error", (err) => {
      console.error("MySQL/TiDB Pool Error Event:", err?.message || err);
      const code = err?.code;
      if (code === "PROTOCOL_CONNECTION_LOST" || code === "ECONNRESET") {
        activePool = null;
      }
    });
  }
  return activePool;
}
var pool = getPool();
var initPromise = null;
var isInitialized = false;
async function ensureDbReady() {
  if (isInitialized) return;
  await initDb();
}
async function ensureIndexes() {
  if (process.env.VERCEL) return;
  const indexStatements = [
    "ALTER TABLE properties ADD INDEX idx_properties_district_price (district, price)",
    "ALTER TABLE properties ADD INDEX idx_properties_owner (ownerId)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_tenant_status (tenantId, status)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_property_status (propertyId, status)",
    "ALTER TABLE visitor_tracking ADD INDEX idx_visited_at (visited_at)",
    "ALTER TABLE withdrawals ADD INDEX idx_withdrawals_user_date (userId, date)",
    "ALTER TABLE withdrawals ADD INDEX idx_withdrawals_user_status (userId, status)",
    "ALTER TABLE reviews ADD INDEX idx_reviews_property (propertyId)",
    "ALTER TABLE reviews ADD INDEX idx_reviews_user (userId)"
  ];
  for (const sql of indexStatements) {
    try {
      await pool.query(sql);
    } catch {
    }
  }
}
async function initDb() {
  if (isInitialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      if (!process.env.VERCEL && process.env.NODE_ENV !== "production") {
        try {
          const baseConnection = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password,
            ...sslOption ? { ssl: sslOption } : {}
          });
          await baseConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database || "kosmo_db"}\`;`);
          await baseConnection.end();
        } catch {
        }
      }
      const [tableRows] = await pool.query("SHOW TABLES");
      const existingTables = tableRows.map((row) => Object.values(row)[0].toLowerCase());
      const requiredTables = [
        "users",
        "properties",
        "property_facilities",
        "reviews",
        "withdrawals",
        "visitor_tracking",
        "rentals"
      ];
      const missingTables = requiredTables.filter((t) => !existingTables.includes(t));
      if (missingTables.length === 0) {
        isInitialized = true;
        console.log("MySQL Database Kosmo tables already initialized.");
        return;
      }
      console.log(`Database tables missing: ${missingTables.join(", ")}. Initializing...`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(50) PRIMARY KEY,
          email VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(100) NOT NULL,
          name VARCHAR(100) NOT NULL,
          role ENUM('admin', 'landlord', 'tenant') NOT NULL,
          phone VARCHAR(20) DEFAULT '',
          paymentMethod VARCHAR(100) DEFAULT 'Virtual Account',
          avatar LONGTEXT,
          notifications BOOLEAN DEFAULT TRUE,
          language VARCHAR(20) DEFAULT 'Indonesia',
          balance DECIMAL(15, 2) DEFAULT 0.00,
          totalRevenue DECIMAL(15, 2) DEFAULT 0.00,
          totalWithdrawn DECIMAL(15, 2) DEFAULT 0.00,
          bankName VARCHAR(50) DEFAULT '',
          bankAccountNumber VARCHAR(50) DEFAULT '',
          bankAccountHolder VARCHAR(100) DEFAULT ''
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS properties (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          district VARCHAR(50) NOT NULL,
          address TEXT NOT NULL,
          price INT NOT NULL,
          rating DECIMAL(3, 1) DEFAULT 0.0,
          image LONGTEXT,
          description LONGTEXT,
          latitude VARCHAR(50) DEFAULT '-8.6500',
          longitude VARCHAR(50) DEFAULT '115.2166',
          totalRooms INT NOT NULL,
          occupiedRooms INT DEFAULT 0,
          ownerId VARCHAR(50),
          document VARCHAR(100) DEFAULT 'sertifikat_kepemilikan.pdf',
          FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      try {
        await pool.query("ALTER TABLE properties MODIFY image LONGTEXT");
        await pool.query("ALTER TABLE properties MODIFY description LONGTEXT");
        await pool.query("ALTER TABLE users MODIFY avatar LONGTEXT");
      } catch (e) {
      }
      await pool.query(`
        CREATE TABLE IF NOT EXISTS property_facilities (
          propertyId VARCHAR(50),
          facility VARCHAR(50),
          PRIMARY KEY (propertyId, facility),
          FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS reviews (
          id VARCHAR(50) PRIMARY KEY,
          propertyId VARCHAR(50) NOT NULL,
          propertyName VARCHAR(100) NOT NULL,
          userId VARCHAR(50) NOT NULL,
          userName VARCHAR(100) NOT NULL,
          rating INT NOT NULL,
          comment TEXT NOT NULL,
          date VARCHAR(50) NOT NULL,
          FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawals (
          id VARCHAR(50) PRIMARY KEY,
          userId VARCHAR(50) NOT NULL,
          bankName VARCHAR(50) NOT NULL,
          accountNumber VARCHAR(50) NOT NULL,
          accountHolder VARCHAR(100) DEFAULT '',
          amount DECIMAL(15, 2) NOT NULL,
          date VARCHAR(50) NOT NULL,
          status ENUM('pending','processing','completed','rejected') DEFAULT 'pending',
          referenceId VARCHAR(100) DEFAULT '',
          rejectionReason TEXT,
          processedAt VARCHAR(50) DEFAULT '',
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS visitor_tracking (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ip_address VARCHAR(50),
          user_agent VARCHAR(255),
          visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS rentals (
          id VARCHAR(50) PRIMARY KEY,
          tenantId VARCHAR(50) NOT NULL,
          propertyId VARCHAR(50) NOT NULL,
          propertyName VARCHAR(100) NOT NULL,
          price INT NOT NULL,
          startDate VARCHAR(50) NOT NULL,
          status ENUM('pending','active','completed','terminated','cancelled') DEFAULT 'active',
          document VARCHAR(255) DEFAULT 'kontrak_sewa.pdf',
          FOREIGN KEY (tenantId) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      try {
        await pool.query("ALTER TABLE rentals MODIFY status ENUM('pending','active','completed','terminated','cancelled') DEFAULT 'pending'");
      } catch (e) {
      }
      try {
        await pool.query("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS accountHolder VARCHAR(100) DEFAULT ''");
      } catch (e) {
      }
      try {
        await pool.query("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS referenceId VARCHAR(100) DEFAULT ''");
      } catch (e) {
      }
      try {
        await pool.query("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS rejectionReason TEXT");
      } catch (e) {
      }
      try {
        await pool.query("ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS processedAt VARCHAR(50) DEFAULT ''");
      } catch (e) {
      }
      await ensureIndexes();
      const [userRows] = await pool.query("SELECT COUNT(*) as count FROM users");
      if (userRows[0].count === 0) {
        const adminHash = bcrypt.hashSync("admin", 10);
        const landlordHash = bcrypt.hashSync("landlord", 10);
        const tenantHash = bcrypt.hashSync("tenant", 10);
        await pool.query(`
          INSERT INTO users (id, email, password, name, role, phone, paymentMethod, avatar, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder)
          VALUES 
            ('user-admin', 'admin@kosmo.com', ?, 'Admin Super', 'admin', '+62 888-8888-8888', 'Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', ''),
            ('user-landlord', 'landlord@kosmo.com', ?, 'Admin Landlord', 'landlord', '+62 811-2233-4455', 'Virtual Account', NULL, 650000.0, 1650000.0, 1000000.0, 'BCA', '1234567890', 'Admin Landlord'),
            ('user-tenant', 'tenant@kosmo.com', ?, 'Bayu', 'tenant', '+62 812-3456-7890', 'Kartu Kredit, Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '');
        `, [adminHash, landlordHash, tenantHash]);
        await pool.query(`
          INSERT INTO withdrawals (id, userId, bankName, accountNumber, amount, date, status)
          VALUES ('w-01', 'user-landlord', 'BCA', '1234567890', 1000000.0, '3 Jun 2026', 'completed');
        `);
      } else {
        const [existing] = await pool.query("SELECT id, password FROM users");
        for (const u of existing) {
          if (u.password) {
            const isHashed = u.password.startsWith("$2a$") || u.password.startsWith("$2b$") || u.password.startsWith("$2y$");
            if (!isHashed) {
              const hashed = bcrypt.hashSync(u.password, 10);
              await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashed, u.id]);
            }
          }
        }
      }
      const [propRows] = await pool.query("SELECT COUNT(*) as count FROM properties");
      if (propRows[0].count === 0) {
        await pool.query(`
          INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document)
          VALUES 
            ('prop-01', 'KOSMO Hub Denpasar', 'Denpasar', 'Jl. Teuku Umar No. 14, Denpasar, Bali', 3500000, 4.7, 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80', 'Modern co-living space di Denpasar dengan konsep smart home. Dilengkapi dengan communal area luas, rooftop area, cafe, gym kecil, dan coworking space untuk penghuni. Fasilitas listrik, air, wifi, kebersihan, keamanan, dan parkir.', '-8.6725', '115.2166', 10, 8, 'user-landlord', 'sertifikat_denpasar.pdf'),
            ('prop-02', 'KOSMO Hub Seminyak', 'Badung', 'Jl. Sunset Road No. 88, Badung, Bali', 4500000, 4.8, 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80', 'Premium co-living space di Seminyak dekat pantai. Sangat cocok untuk digital nomad dengan internet super cepat, area kerja nyaman, kolam renang, dan parkir luas.', '-8.6913', '115.1682', 8, 5, 'user-landlord', 'sertifikat_seminyak.pdf'),
            ('prop-03', 'KOSMO Hub Ubud', 'Gianyar', 'Jl. Raya Ubud No. 12, Gianyar, Bali', 2500000, 4.5, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80', 'Co-living asri di Ubud yang dikelilingi sawah. Dilengkapi dengan kitchen bersama, yoga shala, dan suasana tenang untuk fokus bekerja atau bersantai.', '-8.5069', '115.2625', 12, 6, 'user-landlord', 'sertifikat_ubud.pdf');
        `);
        await pool.query(`
          INSERT INTO property_facilities (propertyId, facility)
          VALUES 
            ('prop-01', 'Listrik'), ('prop-01', 'Air'), ('prop-01', 'Wifi'), ('prop-01', 'Kebersihan'), ('prop-01', 'Keamanan'), ('prop-01', 'Parkir'),
            ('prop-02', 'Wifi'), ('prop-02', 'Air'), ('prop-02', 'Keamanan'), ('prop-02', 'Parkir'), ('prop-02', 'Listrik'),
            ('prop-03', 'Wifi'), ('prop-03', 'Kebersihan'), ('prop-03', 'Air'), ('prop-03', 'Keamanan');
        `);
      }
      const [revRows] = await pool.query("SELECT COUNT(*) as count FROM reviews");
      if (revRows[0].count === 0) {
        await pool.query(`
          INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date)
          VALUES 
            ('rev-01', 'prop-01', 'KOSMO Hub Denpasar', 'user-tenant', 'Bayu', 5, 'Sangat nyaman dan lokasinya sangat strategis di Denpasar! Internetnya cepat banget cocok buat WFH.', '15 Jun 2026'),
            ('rev-02', 'prop-01', 'KOSMO Hub Denpasar', 'user-landlord', 'Admin Landlord', 4, 'Fasilitas lengkap dan bersih, parkirannya luas. Hanya saja jalan di depan agak macet kalau sore.', '10 Jun 2026'),
            ('rev-03', 'prop-02', 'KOSMO Hub Seminyak', 'user-tenant', 'Bayu', 5, 'Keren banget kolam renangnya! Kamar bersih dan smart lock-nya aman sekali.', '18 Jun 2026');
        `);
      }
      isInitialized = true;
      console.log("MySQL Database Kosmo initialized, tables created, and seeded successfully!");
    } catch (err) {
      console.error("Failed to initialize database tables or seed default values:", err);
      initPromise = null;
    }
  })();
  return initPromise;
}

// backend/router.ts
import express from "express";
import XLSX from "xlsx";
import multer from "multer";
import bcrypt2 from "bcryptjs";
import crypto2 from "crypto";
import rateLimit from "express-rate-limit";
import midtransClient from "midtrans-client";

// backend/services/contract.ts
import PDFDocument from "pdfkit";
import fs2 from "fs";
import path2 from "path";
import os from "os";
function generateRentalContractPdf(data, outputDir) {
  return new Promise((resolve, reject) => {
    try {
      const targetDir = outputDir || (process.env.VERCEL ? path2.join(os.tmpdir(), "kosmo_uploads") : path2.join(process.cwd(), "backend", "uploads"));
      try {
        if (!fs2.existsSync(targetDir)) {
          fs2.mkdirSync(targetDir, { recursive: true });
        }
      } catch {
      }
      const fileName = `contract_${data.rentalId}.pdf`;
      const fullFilePath = path2.join(targetDir, fileName);
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => {
        const finalBuffer = Buffer.concat(buffers);
        try {
          fs2.writeFileSync(fullFilePath, finalBuffer);
        } catch {
        }
        resolve({
          filePath: `/uploads/${fileName}`,
          fileName,
          buffer: finalBuffer
        });
      });
      doc.on("error", (err) => reject(err));
      doc.fontSize(18).font("Helvetica-Bold").text("SURAT PERJANJIAN SEWA KOS KOSMO", { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica").text(`Nomor Kontrak: KOSMO/${data.rentalId.toUpperCase()} \u2022 Tanggal: ${data.startDate}`, { align: "center" });
      doc.moveDown(1.2);
      doc.fontSize(10).font("Helvetica").text(
        "Pada hari ini telah disepakati bersama perjanjian sewa menyewa unit kamar kos dengan rincian identitas dan ketentuan sebagai berikut:"
      );
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").text("1. IDENTITAS PENYEWA (TENANT)");
      doc.font("Helvetica").text(`   \u2022 Nama Lengkap   : ${data.tenantName}`).text(`   \u2022 Email          : ${data.tenantEmail}`).text(`   \u2022 Nomor Telepon  : ${data.tenantPhone || "-"}`);
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").text("2. OBJEK DAN BIAYA SEWA");
      doc.font("Helvetica").text(`   \u2022 Nama Properti  : ${data.propertyName}`).text(`   \u2022 Alamat         : ${data.propertyAddress || "Bali, Indonesia"}`).text(`   \u2022 Biaya Sewa     : Rp ${data.pricePerMonth.toLocaleString("id-ID")} / bulan`).text(`   \u2022 Tanggal Mulai  : ${data.startDate}`).text(`   \u2022 Durasi Sewa    : ${data.durationMonths || 1} Bulan`);
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").text("3. KETENTUAN DAN TATA TERTIB SEWA");
      doc.font("Helvetica").text("   a. Pembayaran sewa dilakukan di awal periode sewa melalui platform digital KOSMO.").text("   b. Penyewa wajib menjaga kebersihan, ketertiban umum, dan fasilitas yang disediakan.").text("   c. Dilarang memindahtangankan sewa kepada pihak ketiga tanpa persetujuan tertulis.").text("   d. Pengakhiran masa sewa dapat dilakukan melalui dashboard KOSMO dengan verifikasi kata sandi.");
      doc.moveDown(1.2);
      doc.font("Helvetica-Bold").text("4. PENGESAHAN & TANDA TANGAN DIGITAL");
      doc.moveDown(0.5);
      if (data.signatureBase64 && data.signatureBase64.startsWith("data:image")) {
        try {
          const base64Data = data.signatureBase64.replace(/^data:image\/\w+;base64,/, "");
          const imgBuffer = Buffer.from(base64Data, "base64");
          doc.image(imgBuffer, { width: 140, height: 60 });
          doc.moveDown(0.5);
        } catch {
          doc.font("Helvetica-Oblique").text("[Tanda Tangan Digital Terverifikasi Melalui Sistem KOSMO]");
          doc.moveDown(0.5);
        }
      } else {
        doc.font("Helvetica-Oblique").text("[Tanda Tangan Digital Terverifikasi Melalui Sistem KOSMO]");
        doc.moveDown(0.5);
      }
      doc.font("Helvetica").fontSize(10).text(`Nama Penyewa : ${data.tenantName}`);
      doc.text(`Waktu Tanda Tangan: ${(/* @__PURE__ */ new Date()).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// backend/services/cache.ts
var InMemoryCache = class {
  store = /* @__PURE__ */ new Map();
  maxEntries;
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }
  set(key, data, ttlSeconds = 60) {
    if (this.store.size >= this.maxEntries) {
      this.purgeExpired();
      if (this.store.size >= this.maxEntries) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey) {
          this.store.delete(oldestKey);
        }
      }
    }
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1e3
    });
  }
  del(key) {
    this.store.delete(key);
  }
  invalidatePattern(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
  purgeExpired() {
    const now = Date.now();
    let purgedCount = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        purgedCount++;
      }
    }
    return purgedCount;
  }
  clear() {
    this.store.clear();
  }
  size() {
    return this.store.size;
  }
};
var apiCache = new InMemoryCache();

// backend/middleware/auth.ts
import jwt from "jsonwebtoken";
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("FATAL: JWT_SECRET environment variable is missing in production.");
  }
  return secret || "super-secret-jwt-key-with-high-entropy-minimum-32-chars";
}
function generateJwtToken(payload, secret = getJwtSecret(), expiresIn = "7d") {
  const options = {
    algorithm: "HS256"
  };
  if (expiresIn !== void 0) {
    options.expiresIn = expiresIn;
  }
  return jwt.sign(payload, secret, options);
}
function verifyJwtToken(token, secret = getJwtSecret()) {
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid token payload");
  }
  const { id, email, role } = decoded;
  if (!id || !email || !role) {
    throw new Error("Malformed token claims");
  }
  return { id, email, role };
}
var authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
  if (!token) {
    res.status(401).json({ message: "Akses ditolak. Token otentikasi diperlukan." });
    return;
  }
  try {
    const user = verifyJwtToken(token);
    req.user = user;
    next();
  } catch (err) {
    res.status(403).json({ message: "Token tidak valid atau telah kedaluwarsa." });
  }
};
var requireRole = (allowedRoles) => {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: "Akses ditolak. Token otentikasi diperlukan." });
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ message: "Akses ditolak. Peran Anda tidak memiliki izin untuk tindakan ini." });
      return;
    }
    next();
  };
};

// backend/middleware/validation.ts
import { z } from "zod";
var loginSchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(1, "Password wajib diisi")
});
var registerSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  phone: z.string().optional()
});
var propertySchema = z.object({
  name: z.string().min(1, "Nama properti wajib diisi"),
  district: z.string().min(1, "Kabupaten/Kota wajib diisi"),
  address: z.string().min(1, "Alamat wajib diisi"),
  price: z.number().positive("Harga harus lebih besar dari 0"),
  totalRooms: z.number().int().positive("Total kamar harus lebih besar dari 0"),
  ownerId: z.string().min(1, "ownerId wajib diisi")
});
var withdrawalSchema = z.object({
  amount: z.number().positive("Jumlah penarikan harus lebih besar dari 0"),
  bankName: z.string().min(1, "Nama bank wajib diisi"),
  accountNumber: z.string().min(1, "Nomor rekening wajib diisi"),
  accountHolder: z.string().optional()
});
var reviewSchema = z.object({
  propertyId: z.string().min(1, "propertyId wajib diisi"),
  comment: z.string().min(1, "Komentar ulasan wajib diisi"),
  rating: z.number().int().min(1, "Rating minimal 1").max(5, "Rating maksimal 5")
});
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errorMessages = result.error.issues.map((e) => e.message).join(", ");
      res.status(400).json({ message: errorMessages, errors: result.error.flatten() });
      return;
    }
    next();
  };
}

// backend/services/cloudinary.ts
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
  secure: true
});
function uploadImageStream(buffer, folder = "kosmo_properties") {
  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME === "kosmo-bali" || !process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET.includes("sample")) {
      const mockPublicId = `${folder}/prop_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      const mockUrl = `https://res.cloudinary.com/kosmo-bali/image/upload/v1/${mockPublicId}.webp`;
      return resolve({
        secure_url: mockUrl,
        public_id: mockPublicId
      });
    }
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        format: "webp",
        transformation: [
          { fetch_format: "auto", quality: "auto" }
        ]
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error("Upload to Cloudinary failed"));
        }
        resolve({
          secure_url: result.secure_url || result.url,
          public_id: result.public_id
        });
      }
    );
    const readableStream = new Readable({
      read() {
        this.push(buffer);
        this.push(null);
      }
    });
    readableStream.pipe(uploadStream);
  });
}

// backend/router.ts
var authLimiter = rateLimit({
  windowMs: 60 * 1e3,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Terlalu banyak percobaan masuk/daftar. Silakan coba lagi dalam 1 menit." }
});
var router = express.Router();
router.get("/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS healthy, NOW() AS db_time");
    res.json({
      status: "ok",
      service: "kosmo-api",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptime: process.uptime(),
      database: {
        status: "connected",
        queryOk: Array.isArray(rows) && rows.length > 0
      }
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Database ping failed";
    res.status(503).json({
      status: "degraded",
      service: "kosmo-api",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptime: process.uptime(),
      database: {
        status: "disconnected",
        error: errorMsg
      }
    });
  }
});
var ALLOWED_IMAGE_MIMETYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "image/gif"
];
function validateImageMimeType(mimetype) {
  if (!mimetype) return false;
  return ALLOWED_IMAGE_MIMETYPES.includes(mimetype.toLowerCase());
}
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
  // 5MB limit
});
router.post("/upload", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Tidak ada file yang diunggah." });
  }
  if (!validateImageMimeType(req.file.mimetype)) {
    return res.status(400).json({
      message: "Format file tidak didukung. Harap unggah gambar (JPEG, PNG, WebP, GIF)."
    });
  }
  try {
    const result = await uploadImageStream(req.file.buffer, "kosmo_properties");
    res.json({
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    res.status(500).json({ message: "Gagal mengunggah gambar ke Cloudinary." });
  }
});
var generateId = (prefix) => {
  return `${prefix}-${crypto2.randomBytes(4).toString("hex")}`;
};
router.post("/auth/login", authLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email dan password wajib diisi." });
  }
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    const user = rows[0];
    if (!user || !user.password || !bcrypt2.compareSync(password, user.password)) {
      return res.status(401).json({ message: "Email atau password salah." });
    }
    const safeUser = { ...user };
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
router.post("/auth/register", authLimiter, validateBody(registerSchema), async (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ message: "Nama, email, dan password wajib diisi." });
  }
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length > 0) {
      return res.status(400).json({ message: "Email sudah terdaftar." });
    }
    const userId = generateId("user");
    const hashedPassword = bcrypt2.hashSync(password, 10);
    await pool.query(
      `INSERT INTO users (id, email, password, name, role, phone, paymentMethod) 
       VALUES (?, ?, ?, ?, 'tenant', ?, 'Virtual Account')`,
      [userId, email, hashedPassword, name, phone || ""]
    );
    const [newUsers] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
    const newUser = newUsers[0];
    const safeUser = { ...newUser };
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
router.get("/users/profile/:id", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [req.params.id]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    const safeUser = { ...user };
    delete safeUser.password;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil profil user." });
  }
});
router.put("/users/profile/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, phone, paymentMethod, notifications, language } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    const notifVal = notifications !== void 0 ? notifications ? 1 : 0 : 1;
    await pool.query(
      `UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), 
       paymentMethod = COALESCE(?, paymentMethod), notifications = ?, language = COALESCE(?, language) 
       WHERE id = ?`,
      [name, phone, paymentMethod, notifVal, language, id]
    );
    const [updatedUsers] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    const updatedUser = updatedUsers[0];
    const safeUser = { ...updatedUser };
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
router.put("/auth/profile", authenticateToken, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "Otentikasi diperlukan." });
  const { name, phone, paymentMethod, notifications, language } = req.body;
  try {
    const notifVal = notifications !== void 0 ? notifications ? 1 : 0 : 1;
    await pool.query(
      `UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), 
       paymentMethod = COALESCE(?, paymentMethod), notifications = ?, language = COALESCE(?, language) 
       WHERE id = ?`,
      [name, phone, paymentMethod, notifVal, language, userId]
    );
    const [updatedUsers] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
    const updatedUser = updatedUsers[0];
    if (!updatedUser) return res.status(404).json({ message: "User tidak ditemukan." });
    const safeUser = { ...updatedUser };
    delete safeUser.password;
    res.json({
      message: "Profil berhasil diperbarui!",
      user: safeUser
    });
  } catch (err) {
    console.error("Auth profile update error:", err);
    res.status(500).json({ message: "Gagal memperbarui profil." });
  }
});
router.get("/users", authenticateToken, requireRole(["admin"]), async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, email, name, role, phone, paymentMethod, balance, totalRevenue, totalWithdrawn FROM users ORDER BY id DESC LIMIT 50"
    );
    res.json(rows);
  } catch (err) {
    console.error("Get users error:", err);
    res.status(500).json({ message: "Gagal mengambil data user." });
  }
});
router.get("/admin/users", authenticateToken, requireRole(["admin"]), async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, email, name, role, phone, paymentMethod, balance, totalRevenue, totalWithdrawn FROM users ORDER BY id DESC LIMIT 50"
    );
    res.json(rows);
  } catch (err) {
    console.error("Get admin users error:", err);
    res.status(500).json({ message: "Gagal mengambil data user admin." });
  }
});
router.post("/users", authenticateToken, requireRole(["admin"]), validateBody(registerSchema), async (req, res) => {
  const { email, password, name, role, phone, paymentMethod } = req.body;
  if (!email || !password || !name || !role) {
    return res.status(400).json({ message: "Nama, email, password, dan role wajib diisi." });
  }
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length > 0) {
      return res.status(400).json({ message: "Email sudah terdaftar." });
    }
    const userId = generateId("user");
    const hashedPassword = bcrypt2.hashSync(password, 10);
    await pool.query(
      `INSERT INTO users (id, email, password, name, role, phone, paymentMethod) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, hashedPassword, name, role, phone || "", paymentMethod || "Virtual Account"]
    );
    res.status(201).json({ message: "User berhasil dibuat!" });
  } catch (err) {
    res.status(500).json({ message: "Gagal membuat user." });
  }
});
router.put("/users/:id", authenticateToken, requireRole(["admin"]), async (req, res) => {
  const { id } = req.params;
  const { name, email, role, phone, paymentMethod, password } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    if (password) {
      const hashedPassword = bcrypt2.hashSync(password, 10);
      await pool.query(
        `UPDATE users SET name = ?, email = ?, role = ?, phone = ?, paymentMethod = ?, password = ? WHERE id = ?`,
        [name, email, role, phone || "", paymentMethod || "", hashedPassword, id]
      );
    } else {
      await pool.query(
        `UPDATE users SET name = ?, email = ?, role = ?, phone = ?, paymentMethod = ? WHERE id = ?`,
        [name, email, role, phone || "", paymentMethod || "", id]
      );
    }
    res.json({ message: "User berhasil diperbarui!" });
  } catch (err) {
    res.status(500).json({ message: "Gagal memperbarui user." });
  }
});
router.delete("/users/:id", authenticateToken, requireRole(["admin"]), async (req, res) => {
  const { id } = req.params;
  if (id === "user-admin") {
    return res.status(400).json({ message: "Admin utama tidak dapat dihapus." });
  }
  try {
    await pool.query("DELETE FROM users WHERE id = ?", [id]);
    res.json({ message: "User berhasil dihapus!" });
  } catch (err) {
    res.status(500).json({ message: "Gagal menghapus user." });
  }
});
function normalizeProperty(p) {
  return {
    ...p,
    price: Number(p.price) || 0,
    totalRooms: Number(p.totalRooms) || 0,
    occupiedRooms: Number(p.occupiedRooms) || 0,
    rating: Number(p.rating) || 0,
    image: p.image && p.image.trim() !== "" ? p.image : "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80",
    facilities: Array.isArray(p.facilities) ? p.facilities : []
  };
}
function normalizePropertySummary(p) {
  const norm = normalizeProperty(p);
  if (norm.image && norm.image.startsWith("data:image") && norm.image.length > 2048) {
    norm.image = "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80";
  }
  return norm;
}
router.get("/properties", async (req, res) => {
  const { district, priceMin, priceMax, minPrice, maxPrice, facility, ownerId, owner } = req.query;
  const targetOwner = ownerId || owner;
  const effectiveMin = priceMin !== void 0 ? priceMin : minPrice;
  const effectiveMax = priceMax !== void 0 ? priceMax : maxPrice;
  const cacheKey = `properties:${district || "all"}:${effectiveMin || 0}:${effectiveMax || 0}:${facility || "all"}:${targetOwner || "all"}`;
  const cachedData = apiCache.get(cacheKey);
  if (cachedData) {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return res.json(cachedData);
  }
  try {
    let sql = `
      SELECT p.*, GROUP_CONCAT(pf.facility SEPARATOR ',') as facilitiesString
      FROM properties p
      LEFT JOIN property_facilities pf ON p.id = pf.propertyId
      WHERE 1=1
    `;
    const params = [];
    if (targetOwner) {
      sql += " AND p.ownerId = ?";
      params.push(String(targetOwner));
    }
    if (district && district !== "Semua") {
      sql += " AND p.district = ?";
      params.push(String(district));
    }
    if (effectiveMin !== void 0 && effectiveMin !== "") {
      sql += " AND p.price >= ?";
      params.push(parseInt(String(effectiveMin), 10));
    }
    if (effectiveMax !== void 0 && effectiveMax !== "") {
      sql += " AND p.price <= ?";
      params.push(parseInt(String(effectiveMax), 10));
    }
    sql += " GROUP BY p.id";
    const [properties] = await pool.query(sql, params);
    for (const prop of properties) {
      prop.facilities = prop.facilitiesString ? prop.facilitiesString.split(",").filter(Boolean) : [];
      delete prop.facilitiesString;
    }
    let filteredProperties = properties;
    if (facility) {
      const facilitiesList = Array.isArray(facility) ? facility.map(String) : [String(facility)];
      filteredProperties = properties.filter(
        (p) => facilitiesList.every((f) => (p.facilities || []).map((item) => item.toLowerCase()).includes(f.toLowerCase()))
      );
    }
    const normalized = filteredProperties.map(normalizePropertySummary);
    apiCache.set(cacheKey, normalized, 60);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.json(normalized);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error in GET /api/properties:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Gagal mengambil properti: " + errorMsg });
  }
});
router.get("/properties/:id", async (req, res) => {
  const cacheKey = `properties:detail:${req.params.id}`;
  const cached = apiCache.get(cacheKey);
  if (cached) {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return res.json(cached);
  }
  try {
    const [rows] = await pool.query("SELECT * FROM properties WHERE id = ?", [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    const prop = rows[0];
    const [facRows] = await pool.query("SELECT facility FROM property_facilities WHERE propertyId = ?", [prop.id]);
    prop.facilities = facRows.map((r) => r.facility);
    const normalized = normalizeProperty(prop);
    apiCache.set(cacheKey, normalized, 60);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil detail properti." });
  }
});
router.post("/properties", authenticateToken, requireRole(["admin", "landlord", "owner"]), validateBody(propertySchema), async (req, res) => {
  const { name, district, address, price, description, facilities, latitude, longitude, totalRooms, image, ownerId } = req.body;
  if (!name || !district || !address || !price) {
    return res.status(400).json({ message: "Nama, wilayah, alamat, dan harga wajib diisi." });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const propId = generateId("prop");
    const landlordId = ownerId || "user-landlord";
    await connection.query(
      `INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document) 
       VALUES (?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, 0, ?, 'sertifikat_kepemilikan.pdf')`,
      [
        propId,
        name,
        district,
        address,
        parseInt(String(price), 10),
        image || "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80",
        description || "",
        latitude || "-8.6500",
        longitude || "115.2166",
        parseInt(String(totalRooms || "5"), 10),
        landlordId
      ]
    );
    if (facilities && facilities.length > 0) {
      for (const fac of facilities) {
        await connection.query(
          "INSERT INTO property_facilities (propertyId, facility) VALUES (?, ?)",
          [propId, fac]
        );
      }
    }
    await connection.commit();
    apiCache.invalidatePattern("properties");
    res.status(201).json({ message: "Properti berhasil ditambahkan!" });
  } catch (err) {
    await connection.rollback();
    console.error("Create property error:", err);
    res.status(500).json({ message: "Gagal menyimpan properti." });
  } finally {
    connection.release();
  }
});
router.put("/properties/:id", authenticateToken, requireRole(["admin", "landlord", "owner"]), async (req, res) => {
  const { id } = req.params;
  const { name, district, address, price, description, facilities, latitude, longitude, totalRooms, occupiedRooms, image } = req.body;
  const authUser = req.user;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM properties WHERE id = ? FOR UPDATE", [id]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    const existing = rows[0];
    if (authUser?.role !== "admin" && existing.ownerId !== authUser?.id) {
      await connection.rollback();
      return res.status(403).json({ message: "Akses ditolak. Anda bukan pemilik properti ini." });
    }
    const updatedName = name !== void 0 ? name : existing.name;
    const updatedDistrict = district !== void 0 ? district : existing.district;
    const updatedAddress = address !== void 0 ? address : existing.address;
    const updatedPrice = price !== void 0 ? parseInt(String(price), 10) : existing.price;
    const updatedDesc = description !== void 0 ? description : existing.description;
    const updatedLat = latitude !== void 0 ? latitude : existing.latitude;
    const updatedLng = longitude !== void 0 ? longitude : existing.longitude;
    const updatedRooms = totalRooms !== void 0 ? parseInt(String(totalRooms), 10) : existing.totalRooms;
    const updatedOccupied = occupiedRooms !== void 0 ? parseInt(String(occupiedRooms), 10) : existing.occupiedRooms;
    const updatedImage = image !== void 0 ? image : existing.image;
    await connection.query(
      `UPDATE properties SET name = ?, district = ?, address = ?, price = ?, description = ?, 
       latitude = ?, longitude = ?, totalRooms = ?, occupiedRooms = ?, image = ? 
       WHERE id = ?`,
      [
        updatedName,
        updatedDistrict,
        updatedAddress,
        updatedPrice,
        updatedDesc,
        updatedLat,
        updatedLng,
        updatedRooms,
        updatedOccupied,
        updatedImage,
        id
      ]
    );
    if (facilities !== void 0) {
      await connection.query("DELETE FROM property_facilities WHERE propertyId = ?", [id]);
      if (facilities.length > 0) {
        for (const fac of facilities) {
          await connection.query("INSERT INTO property_facilities (propertyId, facility) VALUES (?, ?)", [id, fac]);
        }
      }
    }
    await connection.commit();
    apiCache.invalidatePattern("properties");
    res.json({ message: "Properti berhasil diperbarui!" });
  } catch (err) {
    await connection.rollback();
    console.error("Update property error:", err);
    res.status(500).json({ message: "Gagal memperbarui properti." });
  } finally {
    connection.release();
  }
});
router.delete("/properties/:id", authenticateToken, requireRole(["admin", "landlord", "owner"]), async (req, res) => {
  const { id } = req.params;
  const { password, landlordId } = req.body;
  const authUser = req.user;
  const callerId = authUser?.id;
  const callerRole = authUser?.role;
  if (!password) {
    return res.status(400).json({ message: "Password konfirmasi diperlukan." });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [propRows] = await connection.query("SELECT * FROM properties WHERE id = ? FOR UPDATE", [id]);
    const property = propRows[0];
    if (!property) {
      await connection.rollback();
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    if (callerRole !== "admin" && property.ownerId !== callerId) {
      await connection.rollback();
      return res.status(403).json({ message: "Anda bukan pemilik properti ini." });
    }
    const [activeRentals] = await connection.query(
      "SELECT COUNT(*) as activeCount FROM rentals WHERE propertyId = ? AND status = 'active'",
      [id]
    );
    if (Number(activeRentals[0]?.activeCount || 0) > 0) {
      await connection.rollback();
      return res.status(409).json({
        message: "Properti tidak dapat dihapus karena masih memiliki sewa aktif berjalan."
      });
    }
    const [userRows] = await connection.query("SELECT password FROM users WHERE id = ?", [callerId]);
    const caller = userRows[0];
    if (!caller || !caller.password || !bcrypt2.compareSync(password, caller.password)) {
      await connection.rollback();
      return res.status(401).json({ message: "Password salah." });
    }
    await connection.query("DELETE FROM properties WHERE id = ?", [id]);
    await connection.commit();
    apiCache.invalidatePattern("properties");
    res.json({ message: "Properti berhasil dihapus!" });
  } catch (err) {
    await connection.rollback();
    console.error("Delete property error:", err);
    res.status(500).json({ message: "Gagal menghapus properti." });
  } finally {
    connection.release();
  }
});
router.get("/reviews", async (req, res) => {
  const { propertyId, userId } = req.query;
  const cacheKey = `reviews:${propertyId || "all"}:${userId || "all"}`;
  const cachedReviews = apiCache.get(cacheKey);
  if (cachedReviews) {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return res.json(cachedReviews);
  }
  try {
    let sql = "SELECT * FROM reviews WHERE 1=1";
    const params = [];
    if (propertyId) {
      sql += " AND propertyId = ?";
      params.push(String(propertyId));
    }
    if (userId) {
      sql += " AND userId = ?";
      params.push(String(userId));
    }
    const [rows] = await pool.query(sql, params);
    apiCache.set(cacheKey, rows, 60);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.json(rows);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error in GET /api/reviews:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Gagal mengambil data review: " + errorMsg });
  }
});
router.post("/reviews", async (req, res) => {
  const { propertyId, userId, userName, rating, comment } = req.body;
  if (!propertyId || !userId || !rating || !comment) {
    return res.status(400).json({ message: "Property ID, User ID, rating, dan komentar wajib diisi." });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [propRows] = await connection.query("SELECT * FROM properties WHERE id = ?", [propertyId]);
    const property = propRows[0];
    if (!property) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    const revId = generateId("rev");
    const dateStr = (/* @__PURE__ */ new Date()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    await connection.query(
      `INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [revId, propertyId, property.name, userId, userName || "Anonim", parseInt(String(rating), 10), comment, dateStr]
    );
    const [revRows] = await connection.query("SELECT rating FROM reviews WHERE propertyId = ?", [propertyId]);
    const avgRating = revRows.reduce((sum, r) => sum + r.rating, 0) / revRows.length;
    await connection.query("UPDATE properties SET rating = ? WHERE id = ?", [parseFloat(avgRating.toFixed(1)), propertyId]);
    await connection.commit();
    apiCache.invalidatePattern("reviews");
    apiCache.invalidatePattern("properties");
    res.status(201).json({ message: "Review berhasil ditambahkan!" });
  } catch (err) {
    await connection.rollback();
    console.error("Create review error:", err);
    res.status(500).json({ message: "Gagal menyimpan review." });
  } finally {
    connection.release();
  }
});
router.put("/reviews/:id", async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM reviews WHERE id = ?", [id]);
    const review = rows[0];
    if (!review) {
      return res.status(404).json({ message: "Review tidak ditemukan." });
    }
    await connection.query(
      "UPDATE reviews SET rating = ?, comment = ? WHERE id = ?",
      [parseInt(String(rating || 0), 10), comment, id]
    );
    const [revRows] = await connection.query("SELECT rating FROM reviews WHERE propertyId = ?", [review.propertyId]);
    const avgRating = revRows.reduce((sum, r) => sum + r.rating, 0) / revRows.length;
    await connection.query("UPDATE properties SET rating = ? WHERE id = ?", [parseFloat(avgRating.toFixed(1)), review.propertyId]);
    await connection.commit();
    apiCache.invalidatePattern("reviews");
    apiCache.invalidatePattern("properties");
    res.json({ message: "Review berhasil diperbarui!" });
  } catch (err) {
    await connection.rollback();
    console.error("Update review error:", err);
    res.status(500).json({ message: "Gagal memperbarui review." });
  } finally {
    connection.release();
  }
});
router.delete("/reviews/:id", async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM reviews WHERE id = ?", [id]);
    const review = rows[0];
    if (!review) {
      return res.status(404).json({ message: "Review tidak ditemukan." });
    }
    await connection.query("DELETE FROM reviews WHERE id = ?", [id]);
    const [revRows] = await connection.query("SELECT rating FROM reviews WHERE propertyId = ?", [review.propertyId]);
    let avgRating = 0;
    if (revRows.length > 0) {
      avgRating = revRows.reduce((sum, r) => sum + r.rating, 0) / revRows.length;
    }
    await connection.query("UPDATE properties SET rating = ? WHERE id = ?", [parseFloat(avgRating.toFixed(1)), review.propertyId]);
    await connection.commit();
    apiCache.invalidatePattern("reviews");
    apiCache.invalidatePattern("properties");
    res.json({ message: "Review berhasil dihapus!" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: "Gagal menghapus review." });
  } finally {
    connection.release();
  }
});
var handleLandlordStats = async (req, res) => {
  const landlordId = String(req.query.landlordId || "user-landlord");
  try {
    const [
      [userRows],
      [propAggRows],
      [reviewCountRows],
      [withdrawals]
    ] = await Promise.all([
      pool.query("SELECT id, balance, totalRevenue, totalWithdrawn FROM users WHERE id = ?", [landlordId]),
      pool.query(
        `SELECT 
           COUNT(id) as totalProperti,
           COALESCE(SUM(totalRooms), 0) as totalRooms,
           COALESCE(SUM(occupiedRooms), 0) as occupiedRooms
         FROM properties
         WHERE ownerId = ?`,
        [landlordId]
      ),
      pool.query(
        `SELECT COUNT(r.id) as reviewsCount
         FROM reviews r 
         JOIN properties p ON r.propertyId = p.id 
         WHERE p.ownerId = ?`,
        [landlordId]
      ),
      pool.query(
        "SELECT * FROM withdrawals WHERE userId = ? ORDER BY date DESC LIMIT 50",
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
    const occupancyRate = totalRooms > 0 ? parseFloat((occupiedRooms / totalRooms * 100).toFixed(1)) : 0;
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
router.get("/stats", handleLandlordStats);
router.get("/landlord/stats", handleLandlordStats);
router.get("/landlord/financials", authenticateToken, requireRole(["admin", "landlord", "owner"]), async (req, res) => {
  const landlordId = String(req.query.landlordId || req.user?.id || "user-landlord");
  try {
    const [
      [userRows],
      [propAggRows],
      [monthlyRevenueRows],
      [withdrawals]
    ] = await Promise.all([
      pool.query("SELECT id, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder FROM users WHERE id = ?", [landlordId]),
      pool.query(
        `SELECT 
           COUNT(id) as totalProperti,
           COALESCE(SUM(totalRooms), 0) as totalRooms,
           COALESCE(SUM(occupiedRooms), 0) as occupiedRooms
         FROM properties
         WHERE ownerId = ?`,
        [landlordId]
      ),
      pool.query(
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
      pool.query(
        "SELECT * FROM withdrawals WHERE userId = ? ORDER BY id DESC LIMIT 50",
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
    const occupancyRate = totalRooms > 0 ? parseFloat((occupiedRooms / totalRooms * 100).toFixed(1)) : 0;
    res.json({
      balance: parseFloat(String(landlord.balance || 0)),
      totalRevenue: parseFloat(String(landlord.totalRevenue || 0)),
      totalWithdrawn: parseFloat(String(landlord.totalWithdrawn || 0)),
      bankName: landlord.bankName || "",
      bankAccountNumber: landlord.bankAccountNumber || "",
      bankAccountHolder: landlord.bankAccountHolder || "",
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
router.get("/withdrawals", authenticateToken, async (req, res) => {
  const userId = String(req.query.userId || req.user?.id || "");
  try {
    let sql = "SELECT * FROM withdrawals WHERE 1=1";
    const params = [];
    if (userId) {
      sql += " AND userId = ?";
      params.push(userId);
    }
    sql += " ORDER BY id DESC LIMIT 50";
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data penarikan." });
  }
});
router.get("/withdrawals/me", authenticateToken, async (req, res) => {
  const userId = String(req.user?.id || req.query.userId || "user-landlord");
  try {
    const [rows] = await pool.query("SELECT * FROM withdrawals WHERE userId = ? ORDER BY id DESC LIMIT 50", [userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data penarikan." });
  }
});
router.get("/landlord/rentals", authenticateToken, requireRole(["admin", "landlord", "owner"]), async (req, res) => {
  const landlordId = String(req.query.landlordId || req.user?.id || "user-landlord");
  try {
    const [rows] = await pool.query(
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
router.post("/withdraw", authenticateToken, requireRole(["admin", "landlord"]), async (req, res) => {
  const { amount, bankName, accountNumber, accountHolder, userId } = req.body;
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }
  if (!amount || !bankName || !accountNumber) {
    return res.status(400).json({ message: "Jumlah, nama bank, dan nomor rekening wajib diisi." });
  }
  const targetUserId = authUser.role === "admin" && userId ? userId : authUser.id;
  const withdrawAmount = parseFloat(String(amount));
  if (withdrawAmount <= 0 || isNaN(withdrawAmount)) {
    return res.status(400).json({ message: "Jumlah penarikan harus lebih besar dari 0." });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM users WHERE id = ? FOR UPDATE", [targetUserId]);
    const user = rows[0];
    if (!user) {
      await connection.rollback();
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    if (parseFloat(String(user.balance || 0)) < withdrawAmount) {
      await connection.rollback();
      return res.status(400).json({ message: "Saldo tidak mencukupi." });
    }
    const newBalance = parseFloat(String(user.balance || 0)) - withdrawAmount;
    const currentWithdrawn = parseFloat(String(user.totalWithdrawn || 0));
    await connection.query(
      "UPDATE users SET balance = ? WHERE id = ?",
      [newBalance, targetUserId]
    );
    const withdrawalId = generateId("w");
    const dateStr = (/* @__PURE__ */ new Date()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    const holder = accountHolder || user.bankAccountHolder || user.name || "";
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
      status: "pending"
    });
  } catch (err) {
    await connection.rollback();
    console.error("Withdrawal error:", err);
    res.status(500).json({ message: "Gagal memproses penarikan dana." });
  } finally {
    connection.release();
  }
});
router.get("/admin/withdrawals", authenticateToken, requireRole(["admin"]), async (req, res) => {
  const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : void 0;
  const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
  const offsetParam = req.query.offset ? parseInt(String(req.query.offset), 10) : limitParam ? (pageParam - 1) * limitParam : 0;
  try {
    let sql = `
      SELECT w.*, u.name as userName, u.email as userEmail, u.phone as userPhone
      FROM withdrawals w
      LEFT JOIN users u ON w.userId = u.id
      ORDER BY w.date DESC
    `;
    const params = [];
    if (limitParam && limitParam > 0) {
      sql += " LIMIT ? OFFSET ?";
      params.push(limitParam, Math.max(0, offsetParam));
    }
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Get admin withdrawals error:", err);
    res.status(500).json({ message: "Gagal mengambil data penarikan dana." });
  }
});
router.post("/admin/withdrawals/:id/process", authenticateToken, requireRole(["admin"]), async (req, res) => {
  const { id } = req.params;
  const targetStatus = req.body?.status || "completed";
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM withdrawals WHERE id = ? FOR UPDATE", [id]);
    const withdrawal = rows[0];
    if (!withdrawal) {
      await connection.rollback();
      return res.status(404).json({ message: "Permintaan penarikan tidak ditemukan." });
    }
    if (withdrawal.status === "completed") {
      await connection.rollback();
      return res.status(400).json({ message: "Penarikan sudah berhasil diproses sebelumnya." });
    }
    if (withdrawal.status === "rejected") {
      await connection.rollback();
      return res.status(400).json({ message: "Penarikan yang sudah ditolak tidak dapat diproses." });
    }
    const refId = req.body?.referenceId || withdrawal.referenceId || `REF-${Date.now().toString(36).toUpperCase()}`;
    const processedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (targetStatus === "completed") {
      await connection.query(
        "UPDATE users SET totalWithdrawn = totalWithdrawn + ? WHERE id = ?",
        [withdrawal.amount, withdrawal.userId]
      );
    }
    await connection.query(
      "UPDATE withdrawals SET status = ?, referenceId = ?, processedAt = ? WHERE id = ?",
      [targetStatus, refId, processedAt, id]
    );
    await connection.commit();
    res.json({
      message: targetStatus === "completed" ? "Disbursement berhasil diproses dan status diselesaikan." : "Status pencairan dana diperbarui ke sedang diproses.",
      withdrawalId: id,
      status: targetStatus,
      referenceId: refId,
      processedAt
    });
  } catch (err) {
    await connection.rollback();
    console.error("Process withdrawal error:", err);
    res.status(500).json({ message: "Gagal memproses pencairan dana." });
  } finally {
    connection.release();
  }
});
router.post("/admin/withdrawals/:id/reject", authenticateToken, requireRole(["admin"]), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM withdrawals WHERE id = ? FOR UPDATE", [id]);
    const withdrawal = rows[0];
    if (!withdrawal) {
      await connection.rollback();
      return res.status(404).json({ message: "Permintaan penarikan tidak ditemukan." });
    }
    if (withdrawal.status === "rejected") {
      await connection.rollback();
      return res.status(400).json({ message: "Penarikan sudah pernah ditolak." });
    }
    if (withdrawal.status === "completed") {
      await connection.rollback();
      return res.status(400).json({ message: "Penarikan yang sudah selesai tidak dapat ditolak." });
    }
    const withdrawAmount = parseFloat(String(withdrawal.amount));
    await connection.query(
      "UPDATE users SET balance = balance + ? WHERE id = ?",
      [withdrawAmount, withdrawal.userId]
    );
    const rejectionReason = reason || "Pencairan dana ditolak oleh administrator";
    const processedAt = (/* @__PURE__ */ new Date()).toISOString();
    await connection.query(
      "UPDATE withdrawals SET status = 'rejected', rejectionReason = ?, processedAt = ? WHERE id = ?",
      [rejectionReason, processedAt, id]
    );
    await connection.commit();
    res.json({
      message: "Penarikan berhasil ditolak dan saldo telah dikembalikan ke akun landlord.",
      withdrawalId: id,
      status: "rejected",
      reason: rejectionReason,
      processedAt
    });
  } catch (err) {
    await connection.rollback();
    console.error("Reject withdrawal error:", err);
    res.status(500).json({ message: "Gagal menolak penarikan dana." });
  } finally {
    connection.release();
  }
});
router.post("/tracking/visit", async (req, res) => {
  const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
  const ip = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
  const userAgent = String(req.headers["user-agent"] || "");
  try {
    await pool.query(
      "INSERT INTO visitor_tracking (ip_address, user_agent) VALUES (?, ?)",
      [ip, userAgent]
    );
    res.status(201).json({ message: "Kunjungan berhasil dilacak." });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error in POST /api/tracking/visit:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Gagal melacak kunjungan: " + errorMsg });
  }
});
router.get("/admin/stats", authenticateToken, requireRole(["admin"]), async (_req, res) => {
  try {
    const [
      [visitorRows],
      [userRows],
      [landlordRows],
      [propertyRows],
      [roomsRows]
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM visitor_tracking"),
      pool.query("SELECT COUNT(*) as count FROM users"),
      pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'landlord'"),
      pool.query("SELECT COUNT(*) as count FROM properties"),
      pool.query("SELECT COALESCE(SUM(totalRooms), 0) as sum FROM properties")
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
router.get("/admin/tracking-history", authenticateToken, requireRole(["admin"]), async (_req, res) => {
  try {
    const [rows24h] = await pool.query(`
      SELECT 
        DATE_FORMAT(visited_at, '%Y-%m-%d %H:00:00') as label_time,
        COUNT(*) as count
      FROM visitor_tracking
      WHERE visited_at >= NOW() - INTERVAL 24 HOUR
      GROUP BY label_time
      ORDER BY label_time ASC
    `);
    const [rows7d] = await pool.query(`
      SELECT 
        DATE_FORMAT(visited_at, '%Y-%m-%d') as label_date,
        COUNT(*) as count
      FROM visitor_tracking
      WHERE visited_at >= DATE(NOW() - INTERVAL 6 DAY)
      GROUP BY label_date
      ORDER BY label_date ASC
    `);
    const [rows30d] = await pool.query(`
      SELECT 
        DATE_FORMAT(visited_at, '%Y-%m-%d') as label_date,
        COUNT(*) as count
      FROM visitor_tracking
      WHERE visited_at >= DATE(NOW() - INTERVAL 29 DAY)
      GROUP BY label_date
      ORDER BY label_date ASC
    `);
    const now = /* @__PURE__ */ new Date();
    const data24h = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1e3);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      const hour = String(d.getHours()).padStart(2, "0");
      const labelKey = `${year}-${month}-${date} ${hour}:00:00`;
      const hourLabel = `${hour}:00`;
      const match = rows24h.find((r) => r.label_time === labelKey);
      data24h.push({
        label: hourLabel,
        count: match ? match.count : 0
      });
    }
    const data7d = [];
    const daysName = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1e3);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      const labelKey = `${year}-${month}-${date}`;
      const dayLabel = daysName[d.getDay()] + ` (${date}/${month})`;
      const match = rows7d.find((r) => r.label_date === labelKey);
      data7d.push({
        label: dayLabel,
        count: match ? match.count : 0
      });
    }
    const data30d = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1e3);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const date = String(d.getDate()).padStart(2, "0");
      const labelKey = `${year}-${month}-${date}`;
      const dayLabel = `${date}/${month}`;
      const match = rows30d.find((r) => r.label_date === labelKey);
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
router.get("/reports/tracking/excel", authenticateToken, requireRole(["admin"]), async (_req, res) => {
  try {
    const [visitorRows] = await pool.query("SELECT COUNT(*) as count FROM visitor_tracking");
    const [userRows] = await pool.query("SELECT COUNT(*) as count FROM users");
    const [landlordRows] = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'landlord'");
    const totalLandlords = landlordRows[0].count;
    const [propertyRows] = await pool.query("SELECT COUNT(*) as count FROM properties");
    const totalProperties = propertyRows[0].count;
    const [roomsRows] = await pool.query("SELECT COALESCE(SUM(totalRooms), 0) as sum FROM properties");
    const totalRooms = roomsRows[0].sum || 0;
    const [visitors] = await pool.query("SELECT ip_address, user_agent, visited_at FROM visitor_tracking ORDER BY visited_at DESC LIMIT 1000");
    const [users] = await pool.query("SELECT id, email, name, role, phone FROM users ORDER BY id DESC");
    const wb = XLSX.utils.book_new();
    const summaryData = [
      ["Metrik", "Jumlah"],
      ["Total Pengunjung Website", visitorRows[0].count],
      ["Total Pengguna Terdaftar", userRows[0].count],
      ["Total Landlord", totalLandlords],
      ["Total Properti", totalProperties],
      ["Total Kamar", totalRooms]
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Ringkasan");
    const visitorData = [["IP Address", "User Agent", "Waktu Kunjungan"]];
    visitors.forEach((v) => visitorData.push([v.ip_address, v.user_agent, v.visited_at ? new Date(v.visited_at).toLocaleString("id-ID") : ""]));
    const visitorSheet = XLSX.utils.aoa_to_sheet(visitorData);
    XLSX.utils.book_append_sheet(wb, visitorSheet, "Pengunjung");
    const userData = [["ID", "Email", "Nama", "Role", "Telepon"]];
    users.forEach((u) => userData.push([u.id, u.email, u.name, u.role, u.phone]));
    const userSheet = XLSX.utils.aoa_to_sheet(userData);
    XLSX.utils.book_append_sheet(wb, userSheet, "Pengguna");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=laporan_tracking_kosmo.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error("Excel tracking report error:", err);
    res.status(500).json({ message: "Gagal menghasilkan laporan Excel." });
  }
});
router.get("/reports/landlord/excel", authenticateToken, requireRole(["admin", "landlord", "owner"]), async (req, res) => {
  const landlordId = String(req.query.landlordId || "");
  if (!landlordId) return res.status(400).json({ message: "landlordId diperlukan." });
  try {
    const [landlords] = await pool.query("SELECT * FROM users WHERE id = ?", [landlordId]);
    const landlord = landlords[0];
    if (!landlord) return res.status(404).json({ message: "Landlord tidak ditemukan." });
    const [properties] = await pool.query("SELECT * FROM properties WHERE ownerId = ?", [landlord.id]);
    const [transactions] = await pool.query(
      `SELECT r.*, p.name as propertyName FROM rentals r 
       JOIN properties p ON r.propertyId = p.id 
       WHERE p.ownerId = ? ORDER BY r.id DESC`,
      [landlord.id]
    );
    const wb = XLSX.utils.book_new();
    const summaryData = [
      ["Laporan Keuangan Landlord"],
      ["Nama", landlord.name],
      ["Email", landlord.email],
      ["Total Pendapatan", landlord.totalRevenue || 0],
      ["Total Penarikan", landlord.totalWithdrawn || 0],
      ["Saldo", landlord.balance || 0],
      [""],
      ["Ringkasan Properti"],
      ["Nama Properti", "Lokasi", "Harga", "Total Kamar", "Kamar Tersedia"]
    ];
    properties.forEach((p) => summaryData.push([p.name, p.district, p.price, p.totalRooms, p.totalRooms - p.occupiedRooms]));
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Ringkasan Keuangan");
    const txData = [["ID Transaksi", "Properti", "Tanggal", "Jumlah", "Status"]];
    transactions.forEach((t) => txData.push([t.id, t.propertyName || "", t.startDate || "", t.price || 0, t.status === "active" ? "Aktif" : "Selesai"]));
    const txSheet = XLSX.utils.aoa_to_sheet(txData);
    XLSX.utils.book_append_sheet(wb, txSheet, "Transaksi");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename=laporan_keuangan_${landlord.name.replace(/\s+/g, "_")}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error("Excel landlord report error:", err);
    res.status(500).json({ message: "Gagal menghasilkan laporan Excel." });
  }
});
router.post("/auth/verify-password", authLimiter, authenticateToken, async (req, res) => {
  const { password, userId } = req.body;
  if (!password) {
    return res.status(400).json({ message: "password wajib diisi." });
  }
  const authUser = req.user;
  const targetUserId = authUser?.role === "admin" && userId ? userId : authUser?.id || userId;
  try {
    const [rows] = await pool.query("SELECT password FROM users WHERE id = ?", [targetUserId]);
    const user = rows[0];
    if (!user || !user.password) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    const valid = bcrypt2.compareSync(password, user.password);
    res.json({ valid });
  } catch (err) {
    console.error("Password verification error:", err);
    res.status(500).json({ message: "Gagal memverifikasi password." });
  }
});
function computePaymentSchedule(startDateStr, status, referenceDate = /* @__PURE__ */ new Date()) {
  if (status !== "active") {
    return {
      nextPaymentDate: "-",
      nextPaymentDateISO: "",
      daysRemaining: 0,
      paymentStatus: "Penyewaan Selesai"
    };
  }
  const now = new Date(referenceDate);
  now.setHours(0, 0, 0, 0);
  const rawStart = new Date(startDateStr);
  const start = isNaN(rawStart.getTime()) ? new Date(now) : new Date(rawStart);
  start.setHours(0, 0, 0, 0);
  const startDay = start.getDate();
  let addedMonths = 1;
  const getClampedDate = (months) => {
    const totalMonths = start.getMonth() + months;
    const year = start.getFullYear() + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12 + 12) % 12;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(startDay, daysInMonth), 0, 0, 0, 0);
  };
  let due = getClampedDate(addedMonths);
  while (due < now) {
    addedMonths += 1;
    due = getClampedDate(addedMonths);
  }
  const diffMs = due.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.round(diffMs / (1e3 * 60 * 60 * 24)));
  const pad = (n) => n.toString().padStart(2, "0");
  const iso = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
  const formatted = due.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  let paymentStatus = "Lunas (Periode Berjalan)";
  if (daysRemaining === 0) {
    paymentStatus = "Menunggu Pembayaran";
  } else if (daysRemaining <= 3) {
    paymentStatus = "Menjelang Jatuh Tempo";
  }
  return {
    nextPaymentDate: formatted,
    nextPaymentDateISO: iso,
    daysRemaining,
    paymentStatus
  };
}
router.get("/rentals", authenticateToken, async (req, res) => {
  const { tenantId } = req.query;
  const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : void 0;
  const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
  const offsetParam = req.query.offset ? parseInt(String(req.query.offset), 10) : limitParam ? (pageParam - 1) * limitParam : 0;
  try {
    let sql = "SELECT * FROM rentals WHERE 1=1";
    const params = [];
    if (tenantId) {
      sql += " AND tenantId = ?";
      params.push(String(tenantId));
    }
    sql += " ORDER BY id DESC";
    if (limitParam && limitParam > 0) {
      sql += " LIMIT ? OFFSET ?";
      params.push(limitParam, Math.max(0, offsetParam));
    }
    const [rows] = await pool.query(sql, params);
    const enrichedRows = rows.map((r) => {
      const schedule = computePaymentSchedule(r.startDate || (/* @__PURE__ */ new Date()).toISOString(), r.status);
      return {
        ...r,
        nextPaymentDate: schedule.nextPaymentDate,
        nextPaymentDateISO: schedule.nextPaymentDateISO,
        daysRemaining: schedule.daysRemaining,
        paymentStatus: schedule.paymentStatus
      };
    });
    res.json(enrichedRows);
  } catch (err) {
    console.error("Get rentals error:", err);
    res.status(500).json({ message: "Gagal mengambil data sewa." });
  }
});
router.get("/tenant/rentals", authenticateToken, async (req, res) => {
  const tenantId = req.query.tenantId || req.user?.id;
  if (!tenantId) {
    return res.status(400).json({ message: "tenantId diperlukan." });
  }
  try {
    const [rows] = await pool.query(
      "SELECT * FROM rentals WHERE tenantId = ? ORDER BY id DESC",
      [tenantId]
    );
    const enrichedRows = rows.map((r) => {
      const schedule = computePaymentSchedule(r.startDate || (/* @__PURE__ */ new Date()).toISOString(), r.status);
      return {
        ...r,
        nextPaymentDate: schedule.nextPaymentDate,
        nextPaymentDateISO: schedule.nextPaymentDateISO,
        daysRemaining: schedule.daysRemaining,
        paymentStatus: schedule.paymentStatus
      };
    });
    res.json(enrichedRows);
  } catch (err) {
    console.error("Get tenant rentals error:", err);
    res.status(500).json({ message: "Gagal mengambil data sewa tenant." });
  }
});
router.post("/rentals", authenticateToken, async (req, res) => {
  const { tenantId, propertyId, propertyName, price, durationMonths, signature } = req.body;
  const authUser = req.user;
  if (!tenantId || !propertyId) {
    return res.status(400).json({ message: "tenantId dan propertyId wajib diisi." });
  }
  if (authUser?.role !== "admin" && authUser?.id !== tenantId) {
    return res.status(403).json({ message: "Akses ditolak. Anda tidak dapat memesan atas nama akun lain." });
  }
  const rentalId = req.body.rentalId && typeof req.body.rentalId === "string" && req.body.rentalId.trim() !== "" ? req.body.rentalId : generateId("rent");
  if (process.env.MIDTRANS_SERVER_KEY && !process.env.MIDTRANS_SERVER_KEY.includes("placeholder") && !process.env.MIDTRANS_SERVER_KEY.includes("your-server-key")) {
    try {
      const snapApi = snap;
      if (snapApi.transaction?.status) {
        const statusResponse = await snapApi.transaction.status(rentalId);
        const isValidPayment = statusResponse.transaction_status === "settlement" || statusResponse.transaction_status === "capture" && statusResponse.fraud_status === "accept";
        if (!isValidPayment) {
          return res.status(402).json({ message: "Pembayaran belum diselesaikan pada payment gateway Midtrans." });
        }
      }
    } catch (midtransErr) {
      console.warn("Midtrans status check warning:", midtransErr);
    }
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [propRows] = await connection.query(
      "SELECT totalRooms, occupiedRooms, price, name, address, ownerId FROM properties WHERE id = ? FOR UPDATE",
      [propertyId]
    );
    const property = propRows[0];
    if (!property) {
      await connection.rollback();
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    const [existingRentals] = await connection.query(
      "SELECT id, status, document FROM rentals WHERE id = ? FOR UPDATE",
      [rentalId]
    );
    if (existingRentals.length > 0 && existingRentals[0].status === "active") {
      await connection.commit();
      return res.status(200).json({
        message: "Penyewaan kos sudah aktif!",
        rentalId,
        document: existingRentals[0].document || "sertifikat_kepemilikan.pdf"
      });
    }
    if (property.occupiedRooms >= property.totalRooms) {
      await connection.rollback();
      return res.status(400).json({ message: "Kamar kos sudah penuh." });
    }
    const [userRows] = await connection.query("SELECT * FROM users WHERE id = ?", [tenantId]);
    const tenant = userRows[0];
    const [activeRentals] = await connection.query(
      "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' AND id != ? LIMIT 1",
      [tenantId, rentalId]
    );
    if (activeRentals.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        message: "Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru."
      });
    }
    const startDate = (/* @__PURE__ */ new Date()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    const rentalPrice = price || property.price;
    const rentalName = propertyName || property.name;
    let documentPath = "sertifikat_kepemilikan.pdf";
    try {
      const contractResult = await generateRentalContractPdf({
        rentalId,
        tenantName: tenant ? tenant.name : "Penyewa",
        tenantEmail: tenant ? tenant.email : "",
        tenantPhone: tenant ? tenant.phone : "",
        propertyName: rentalName,
        propertyAddress: property.address || "",
        pricePerMonth: rentalPrice,
        startDate,
        durationMonths: durationMonths || 1,
        signatureBase64: signature
      });
      documentPath = contractResult.filePath;
    } catch (contractErr) {
      console.warn("PDF contract generation warning:", contractErr);
    }
    if (existingRentals.length > 0) {
      await connection.query(
        `UPDATE rentals 
         SET status = 'active', document = ?, propertyName = ?, price = ?, startDate = ? 
         WHERE id = ?`,
        [documentPath, rentalName, rentalPrice, startDate, rentalId]
      );
    } else {
      await connection.query(
        `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, document) 
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
        [rentalId, tenantId, propertyId, rentalName, rentalPrice, startDate, documentPath]
      );
    }
    await connection.query(
      "UPDATE properties SET occupiedRooms = LEAST(totalRooms, occupiedRooms + 1) WHERE id = ?",
      [propertyId]
    );
    if (property.ownerId) {
      await connection.query(
        "UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?",
        [rentalPrice, rentalPrice, property.ownerId]
      );
    }
    await connection.commit();
    apiCache.invalidatePattern("properties");
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
router.post("/rentals/:id/terminate", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  const authUser = req.user;
  if (!password) {
    return res.status(400).json({ message: "Password wajib dimasukkan." });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rentalRows] = await connection.query("SELECT * FROM rentals WHERE id = ? FOR UPDATE", [id]);
    const rental = rentalRows[0];
    if (!rental) {
      await connection.rollback();
      return res.status(404).json({ message: "Data sewa tidak ditemukan." });
    }
    if (rental.status === "terminated") {
      await connection.rollback();
      return res.status(400).json({ message: "Sewa sudah pernah diberhentikan." });
    }
    const [propRows] = await connection.query("SELECT ownerId FROM properties WHERE id = ?", [rental.propertyId]);
    const property = propRows[0];
    const isTenant = authUser?.id === rental.tenantId;
    const isOwner = property && authUser?.id === property.ownerId;
    const isAdmin = authUser?.role === "admin";
    if (!isTenant && !isOwner && !isAdmin) {
      await connection.rollback();
      return res.status(403).json({ message: "Akses ditolak. Anda tidak berhak memberhentikan sewa ini." });
    }
    const [userRows] = await connection.query("SELECT password FROM users WHERE id = ?", [authUser?.id]);
    const caller = userRows[0];
    if (!caller || !caller.password || !bcrypt2.compareSync(password, caller.password)) {
      await connection.rollback();
      return res.status(401).json({ message: "Password salah." });
    }
    await connection.query(
      "UPDATE rentals SET status = 'terminated' WHERE id = ?",
      [id]
    );
    if (rental.status === "active") {
      await connection.query(
        "UPDATE properties SET occupiedRooms = GREATEST(0, occupiedRooms - 1) WHERE id = ?",
        [rental.propertyId]
      );
    }
    await connection.commit();
    apiCache.invalidatePattern("properties");
    res.json({ message: "Sewa kos berhasil diberhentikan." });
  } catch (err) {
    await connection.rollback();
    console.error("Terminate rental error:", err);
    res.status(500).json({ message: "Gagal memberhentikan sewa kos." });
  } finally {
    connection.release();
  }
});
router.get("/rentals/:id/contract", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const authUser = req.user;
  try {
    const [rentalRows] = await pool.query("SELECT * FROM rentals WHERE id = ?", [id]);
    const rental = rentalRows[0];
    if (!rental) {
      return res.status(404).json({ message: "Data sewa tidak ditemukan." });
    }
    const [propRows] = await pool.query("SELECT * FROM properties WHERE id = ?", [rental.propertyId]);
    const property = propRows[0];
    const isTenant = authUser?.id === rental.tenantId;
    const isOwner = property && authUser?.id === property.ownerId;
    const isAdmin = authUser?.role === "admin";
    if (!isTenant && !isOwner && !isAdmin) {
      return res.status(403).json({ message: "Akses ditolak ke dokumen kontrak ini." });
    }
    const [userRows] = await pool.query("SELECT * FROM users WHERE id = ?", [rental.tenantId]);
    const tenant = userRows[0];
    const { buffer, fileName } = await generateRentalContractPdf({
      rentalId: rental.id,
      tenantName: tenant ? tenant.name : "Penghuni KOSMO",
      tenantEmail: tenant ? tenant.email : "",
      tenantPhone: tenant ? tenant.phone || "" : "",
      propertyName: rental.propertyName || (property ? property.name : "Unit KOSMO Bali"),
      propertyAddress: property ? property.address : "Bali, Indonesia",
      pricePerMonth: rental.price || (property ? property.price : 0),
      startDate: rental.startDate || (/* @__PURE__ */ new Date()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }),
      durationMonths: 1
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error("Get contract PDF error:", err);
    res.status(500).json({ message: "Gagal membuat dokumen kontrak PDF." });
  }
});
var snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY || "SB-Mid-server-placeholder",
  clientKey: process.env.MIDTRANS_CLIENT_KEY || "SB-Mid-client-placeholder"
});
function verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, signatureKey) {
  if (!orderId || !statusCode || !grossAmount || !serverKey || !signatureKey) {
    return false;
  }
  const normalizedAmount = grossAmount.includes(".") ? parseFloat(grossAmount).toFixed(2) : grossAmount;
  const payload = `${orderId}${statusCode}${normalizedAmount}${serverKey}`;
  const calculatedHash = crypto2.createHash("sha512").update(payload).digest("hex").toLowerCase();
  const targetSig = signatureKey.toLowerCase();
  const calculatedBuffer = Buffer.from(calculatedHash, "utf8");
  const targetBuffer = Buffer.from(targetSig, "utf8");
  if (calculatedBuffer.length !== targetBuffer.length) {
    return false;
  }
  return crypto2.timingSafeEqual(calculatedBuffer, targetBuffer);
}
router.post("/payment/token", authenticateToken, async (req, res) => {
  const { propertyId, tenantId, durationMonths } = req.body;
  const authUser = req.user;
  if (!propertyId || !tenantId) {
    return res.status(400).json({ message: "propertyId dan tenantId wajib diisi." });
  }
  if (authUser?.role !== "admin" && authUser?.id !== tenantId) {
    return res.status(403).json({ message: "Akses ditolak. Anda tidak dapat membuat token atas nama akun lain." });
  }
  const duration = durationMonths && durationMonths > 0 ? durationMonths : 1;
  try {
    const [propRows] = await pool.query("SELECT * FROM properties WHERE id = ?", [propertyId]);
    const property = propRows[0];
    if (!property) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    if (property.occupiedRooms >= property.totalRooms) {
      return res.status(400).json({ message: "Kamar kos sudah penuh." });
    }
    const [userRows] = await pool.query("SELECT * FROM users WHERE id = ?", [tenantId]);
    const tenant = userRows[0];
    if (!tenant) {
      return res.status(404).json({ message: "Tenant tidak ditemukan." });
    }
    const [activeRentals] = await pool.query(
      "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' LIMIT 1",
      [tenantId]
    );
    if (activeRentals.length > 0) {
      return res.status(409).json({
        message: "Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru."
      });
    }
    const rentalId = generateId("rent");
    const startDate = (/* @__PURE__ */ new Date()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    const totalPrice = property.price * duration;
    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [rentalId, tenantId, propertyId, property.name, totalPrice, startDate]
    );
    const parameter = {
      transaction_details: {
        order_id: rentalId,
        gross_amount: totalPrice
      },
      customer_details: {
        first_name: tenant.name,
        email: tenant.email,
        phone: tenant.phone || ""
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
    let transactionToken = `snap-token-${rentalId}`;
    let redirectUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${rentalId}`;
    if (process.env.MIDTRANS_SERVER_KEY && !process.env.MIDTRANS_SERVER_KEY.includes("your-server-key") && !process.env.MIDTRANS_SERVER_KEY.includes("placeholder")) {
      try {
        const transaction = await snap.createTransaction(parameter);
        transactionToken = transaction.token;
        redirectUrl = transaction.redirect_url;
      } catch (snapErr) {
        console.warn("Midtrans API call warning:", snapErr);
      }
    }
    res.json({
      message: "Token pembayaran berhasil dibuat.",
      token: transactionToken,
      redirect_url: redirectUrl,
      rentalId
    });
  } catch (err) {
    console.error("Create payment token error:", err);
    res.status(500).json({ message: "Gagal membuat token pembayaran Midtrans." });
  }
});
router.post("/payment/webhook", async (req, res) => {
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
  const serverKey = process.env.MIDTRANS_SERVER_KEY || "SB-Mid-server-placeholder";
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
  const isSettlement = transaction_status === "settlement";
  const isCaptureSuccess = transaction_status === "capture" && fraud_status === "accept";
  if (isSettlement || isCaptureSuccess) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rentalRows] = await connection.query(
        "SELECT * FROM rentals WHERE id = ? FOR UPDATE",
        [order_id]
      );
      const rental = rentalRows[0];
      if (!rental) {
        await connection.rollback();
        return res.status(404).json({ message: "Data sewa tidak ditemukan." });
      }
      const paidAmount = parseFloat(gross_amount);
      const expectedPrice = Number(rental.price || 0);
      if (isNaN(paidAmount) || Math.abs(paidAmount - expectedPrice) > 1) {
        await connection.rollback();
        console.error(`Midtrans gross_amount mismatch: expected ${expectedPrice}, got ${paidAmount}`);
        return res.status(400).json({ message: "Jumlah nominal pembayaran tidak sesuai dengan harga sewa." });
      }
      if (rental.status !== "active") {
        const [propRows] = await connection.query(
          "SELECT totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ? FOR UPDATE",
          [rental.propertyId]
        );
        const property = propRows[0];
        if (property && property.occupiedRooms >= property.totalRooms) {
          await connection.rollback();
          console.error(`Overbooking conflict detected for property ${property.id}, rental ${order_id}`);
          return res.status(409).json({ message: "Kamar sudah penuh, pembayaran memerlukan penanganan manual." });
        }
        await connection.query("UPDATE rentals SET status = 'active' WHERE id = ?", [order_id]);
        await connection.query(
          "UPDATE properties SET occupiedRooms = LEAST(totalRooms, occupiedRooms + 1) WHERE id = ?",
          [rental.propertyId]
        );
        if (property && property.ownerId) {
          const rentalPrice = rental.price || 0;
          await connection.query(
            "UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?",
            [rentalPrice, rentalPrice, property.ownerId]
          );
        }
      }
      await connection.commit();
      apiCache.invalidatePattern("properties");
      return res.json({ message: "Pembayaran berhasil diproses dan status rental diaktifkan." });
    } catch (err) {
      await connection.rollback();
      console.error("Midtrans webhook processing error:", err);
      return res.status(500).json({ message: "Gagal memproses transaksi sewa." });
    } finally {
      connection.release();
    }
  }
  if (transaction_status === "cancel" || transaction_status === "deny" || transaction_status === "expire") {
    try {
      await pool.query("UPDATE rentals SET status = 'cancelled' WHERE id = ? AND status = 'pending'", [order_id]);
      apiCache.invalidatePattern("properties");
      return res.json({ message: `Status transaksi dibatalkan (${transaction_status}).` });
    } catch (err) {
      console.error("Cancel rental error:", err);
      return res.status(500).json({ message: "Gagal memperbarui status transaksi." });
    }
  }
  res.json({ message: "Status notifikasi diterima." });
});
var router_default = router;

// backend/server.ts
import path3 from "path";
import fs3 from "fs";
import { fileURLToPath } from "url";
import os2 from "os";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path3.dirname(__filename);
var uploadsDir = process.env.VERCEL ? path3.join(os2.tmpdir(), "kosmo_uploads") : path3.join(__dirname, "uploads");
try {
  if (!fs3.existsSync(uploadsDir)) {
    fs3.mkdirSync(uploadsDir, { recursive: true });
  }
} catch {
}
var app = express2();
var PORT = parseInt(process.env.PORT || "5000", 10);
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.urlencoded({ limit: "5mb", extended: true }));
app.use(morgan("dev"));
app.use("/uploads", express2.static(uploadsDir));
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api") && req.path !== "/api/health") {
    try {
      await ensureDbReady();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to reach database cluster";
      console.error("Database readiness check failed in middleware:", error);
      return res.status(500).json({
        error: "Database connection failed",
        message: errorMsg
      });
    }
  }
  next();
});
app.use("/api", router_default);
app.use((err, _req, res, _next) => {
  console.error("Unhandled API Error:", err);
  const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
  res.status(500).json({ message: errorMsg, error: errorMsg });
});
if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}
var server_default = app;

// backend/api.ts
var api_default = server_default;
export {
  api_default as default
};
