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
    "ALTER TABLE rentals ADD INDEX idx_rentals_contract_hash (contract_hash)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_signed_at (contract_signed_at)",
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
async function createSchemaTables(p) {
  await p.query(`
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
      bankAccountHolder VARCHAR(100) DEFAULT '',
      identity_type VARCHAR(20) DEFAULT 'NIK',
      identity_number VARCHAR(50) DEFAULT '',
      address TEXT,
      occupation VARCHAR(100) DEFAULT '',
      emergency_contact_name VARCHAR(100) DEFAULT '',
      emergency_contact_relation VARCHAR(50) DEFAULT '',
      emergency_contact_phone VARCHAR(50) DEFAULT '',
      date_of_birth VARCHAR(30) DEFAULT '',
      gender VARCHAR(20) DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await p.query(`
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
  await p.query(`
    CREATE TABLE IF NOT EXISTS property_facilities (
      propertyId VARCHAR(50),
      facility VARCHAR(50),
      PRIMARY KEY (propertyId, facility),
      FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await p.query(`
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
  await p.query(`
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
  await p.query(`
    CREATE TABLE IF NOT EXISTS visitor_tracking (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ip_address VARCHAR(255),
      user_agent TEXT,
      visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS rentals (
      id VARCHAR(50) PRIMARY KEY,
      tenantId VARCHAR(50) NOT NULL,
      propertyId VARCHAR(50) NOT NULL,
      propertyName VARCHAR(100) NOT NULL,
      price INT NOT NULL,
      startDate VARCHAR(50) NOT NULL,
      status ENUM('pending','active','completed','terminated','cancelled') DEFAULT 'pending',
      document VARCHAR(255) DEFAULT 'kontrak_sewa.pdf',
      contract_url VARCHAR(500),
      contract_hash VARCHAR(64),
      contract_signed_at DATETIME,
      signer_ip VARCHAR(50),
      signer_user_agent VARCHAR(255),
      tenant_nik_passport VARCHAR(50),
      tenant_signature_data LONGTEXT,
      admin_fee_amount DECIMAL(10,2) DEFAULT 5000.00,
      duration_months INT DEFAULT 1,
      FOREIGN KEY (tenantId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}
async function applyTableMigrations(p) {
  const alterQueries = [
    "ALTER TABLE properties MODIFY image LONGTEXT",
    "ALTER TABLE properties MODIFY description LONGTEXT",
    "ALTER TABLE users MODIFY avatar LONGTEXT",
    "ALTER TABLE visitor_tracking MODIFY ip_address VARCHAR(255)",
    "ALTER TABLE visitor_tracking MODIFY user_agent TEXT",
    "ALTER TABLE rentals MODIFY status ENUM('pending','active','completed','terminated','cancelled') DEFAULT 'pending'",
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS accountHolder VARCHAR(100) DEFAULT ''",
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS referenceId VARCHAR(100) DEFAULT ''",
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS rejectionReason TEXT",
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS processedAt VARCHAR(50) DEFAULT ''",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_url VARCHAR(500)",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_hash VARCHAR(64)",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_signed_at DATETIME",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS signer_ip VARCHAR(50)",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS signer_user_agent VARCHAR(255)",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS tenant_nik_passport VARCHAR(50)",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS tenant_signature_data LONGTEXT",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS admin_fee_amount DECIMAL(10,2) DEFAULT 5000.00",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS duration_months INT DEFAULT 1",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_type VARCHAR(20) DEFAULT 'NIK'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_number VARCHAR(50) DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation VARCHAR(100) DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100) DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR(50) DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(50) DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth VARCHAR(30) DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20) DEFAULT ''"
  ];
  for (const query of alterQueries) {
    try {
      await p.query(query);
    } catch {
    }
  }
  await ensureIndexes();
}
async function seedDefaultUsers(p) {
  const [userRows] = await p.query("SELECT COUNT(*) as count FROM users");
  if (userRows[0].count === 0) {
    const adminHash = bcrypt.hashSync("admin", 10);
    const landlordHash = bcrypt.hashSync("landlord", 10);
    const tenantHash = bcrypt.hashSync("tenant", 10);
    await p.query(`
      INSERT INTO users (
        id, email, password, name, role, phone, paymentMethod, avatar, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder,
        identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_relation, emergency_contact_phone
      )
      VALUES 
        ('user-admin', 'admin@kosmo.com', ?, 'Admin Super', 'admin', '+62 888-8888-8888', 'Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171010000000001', 'Kantor Pusat KOSMO Bali, Denpasar', 'Platform Administrator', 'Support Center', 'Kantor', '+628888888888'),
        ('user-landlord', 'landlord@kosmo.com', ?, 'Admin Landlord', 'landlord', '+62 811-2233-4455', 'Virtual Account', NULL, 650000.0, 1650000.0, 1000000.0, 'BCA', '1234567890', 'Admin Landlord', 'NIK', '5171012204850002', 'Jl. Sunset Road No. 88, Seminyak, Badung, Bali', 'Pengelola Properti', 'Wayan Landlord', 'Keluarga', '+6281122334400'),
        ('user-tenant', 'tenant@kosmo.com', ?, 'Bayu', 'tenant', '+62 812-3456-7890', 'Kartu Kredit, Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171012308980001', 'Jl. Teuku Umar No. 88, Denpasar Barat, Kota Denpasar, Bali', 'Software Engineer', 'Made Wipradnyana', 'Orang Tua', '+6281234567899');
    `, [adminHash, landlordHash, tenantHash]);
    await p.query(`
      INSERT INTO withdrawals (id, userId, bankName, accountNumber, amount, date, status)
      VALUES ('w-01', 'user-landlord', 'BCA', '1234567890', 1000000.0, '3 Jun 2026', 'completed');
    `);
  } else {
    const [existing] = await p.query("SELECT id, password FROM users");
    const updatePromises = [];
    for (const u of existing) {
      if (u.password) {
        const isHashed = u.password.startsWith("$2a$") || u.password.startsWith("$2b$") || u.password.startsWith("$2y$");
        if (!isHashed) {
          const hashed = bcrypt.hashSync(u.password, 10);
          updatePromises.push(p.query("UPDATE users SET password = ? WHERE id = ?", [hashed, u.id]));
        }
      }
    }
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }
  }
}
async function seedDefaultPropertiesAndReviews(p) {
  const [propRows] = await p.query("SELECT COUNT(*) as count FROM properties");
  if (propRows[0].count === 0) {
    await p.query(`
      INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document)
      VALUES 
        ('prop-01', 'KOSMO Hub Denpasar', 'Denpasar', 'Jl. Teuku Umar No. 14, Denpasar, Bali', 3500000, 4.7, 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80', 'Modern co-living space di Denpasar dengan konsep smart home. Dilengkapi dengan communal area luas, rooftop area, cafe, gym kecil, dan coworking space untuk penghuni. Fasilitas listrik, air, wifi, kebersihan, keamanan, dan parkir.', '-8.6725', '115.2166', 10, 8, 'user-landlord', 'sertifikat_denpasar.pdf'),
        ('prop-02', 'KOSMO Hub Seminyak', 'Badung', 'Jl. Sunset Road No. 88, Badung, Bali', 4500000, 4.8, 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80', 'Premium co-living space di Seminyak dekat pantai. Sangat cocok untuk digital nomad dengan internet super cepat, area kerja nyaman, kolam renang, dan parkir luas.', '-8.6913', '115.1682', 8, 5, 'user-landlord', 'sertifikat_seminyak.pdf'),
        ('prop-03', 'KOSMO Hub Ubud', 'Gianyar', 'Jl. Raya Ubud No. 12, Gianyar, Bali', 2500000, 4.5, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80', 'Co-living asri di Ubud yang dikelilingi sawah. Dilengkapi dengan kitchen bersama, yoga shala, dan suasana tenang untuk fokus bekerja atau bersantai.', '-8.5069', '115.2625', 12, 6, 'user-landlord', 'sertifikat_ubud.pdf');
    `);
    await p.query(`
      INSERT INTO property_facilities (propertyId, facility)
      VALUES 
        ('prop-01', 'Listrik'), ('prop-01', 'Air'), ('prop-01', 'Wifi'), ('prop-01', 'Kebersihan'), ('prop-01', 'Keamanan'), ('prop-01', 'Parkir'),
        ('prop-02', 'Wifi'), ('prop-02', 'Air'), ('prop-02', 'Keamanan'), ('prop-02', 'Parkir'), ('prop-02', 'Listrik'),
        ('prop-03', 'Wifi'), ('prop-03', 'Kebersihan'), ('prop-03', 'Air'), ('prop-03', 'Keamanan');
    `);
  }
  const [revRows] = await p.query("SELECT COUNT(*) as count FROM reviews");
  if (revRows[0].count === 0) {
    await p.query(`
      INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date)
      VALUES 
        ('rev-01', 'prop-01', 'KOSMO Hub Denpasar', 'user-tenant', 'Bayu', 5, 'Sangat nyaman dan lokasinya sangat strategis di Denpasar! Internetnya cepat banget cocok buat WFH.', '15 Jun 2026'),
        ('rev-02', 'prop-01', 'KOSMO Hub Denpasar', 'user-landlord', 'Admin Landlord', 4, 'Fasilitas lengkap dan bersih, parkirannya luas. Hanya saja jalan di depan agak macet kalau sore.', '10 Jun 2026'),
        ('rev-03', 'prop-02', 'KOSMO Hub Seminyak', 'user-tenant', 'Bayu', 5, 'Keren banget kolam renangnya! Kamar bersih dan smart lock-nya aman sekali.', '18 Jun 2026');
    `);
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
        await applyTableMigrations(pool);
        isInitialized = true;
        console.log("MySQL Database Kosmo tables already initialized and migrations applied.");
        return;
      }
      console.log(`Database tables missing: ${missingTables.join(", ")}. Initializing...`);
      await createSchemaTables(pool);
      await applyTableMigrations(pool);
      await seedDefaultUsers(pool);
      await seedDefaultPropertiesAndReviews(pool);
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
import crypto3 from "crypto";
import rateLimit from "express-rate-limit";
import midtransClient from "midtrans-client";

// backend/services/contract.ts
import PDFDocument from "pdfkit";
import crypto2 from "crypto";
import fs2 from "fs";
import path3 from "path";

// backend/services/cloudinary.ts
import crypto from "crypto";
import path2 from "path";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
  secure: true
});
function isCloudinaryConfigured() {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!name || name === "kosmo-bali" || !secret || secret.includes("sample")) {
    return false;
  }
  return true;
}
function uploadImageStream(buffer, folder = "kosmo_properties") {
  return new Promise((resolve, reject) => {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reject(new Error("Image buffer cannot be empty"));
    }
    if (!isCloudinaryConfigured()) {
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
    readableStream.on("error", reject);
    readableStream.pipe(uploadStream);
  });
}
function uploadContractStream(buffer, filename, folder = "kosmo_contracts") {
  return new Promise((resolve, reject) => {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reject(new Error("Contract buffer cannot be empty"));
    }
    const sanitizedBase = filename ? path2.basename(filename.replace(/\\/g, "/")).replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_") : `contract_${Date.now()}`;
    const cleanPublicId = sanitizedBase || `contract_${Date.now()}`;
    const fullPublicId = `${folder}/${cleanPublicId}`;
    if (!isCloudinaryConfigured()) {
      const mockUrl = `https://res.cloudinary.com/kosmo-bali/raw/upload/v1/${fullPublicId}.pdf`;
      return resolve({
        secure_url: mockUrl,
        public_id: fullPublicId
      });
    }
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: cleanPublicId,
        resource_type: "raw",
        overwrite: true
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error("Upload PDF contract to Cloudinary failed"));
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
    readableStream.on("error", reject);
    readableStream.pipe(uploadStream);
  });
}

// backend/services/contract.ts
function sanitizeRentalId(id) {
  if (!id || typeof id !== "string") return "contract";
  const trimmed = id.trim();
  if (!trimmed) return "contract";
  const normalized = trimmed.replace(/\\/g, "/");
  const base = path3.basename(normalized);
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, "");
  return sanitized || "contract";
}
function computeContractHash(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("Invalid input: buffer must be an instance of Buffer");
  }
  return crypto2.createHash("sha256").update(buffer).digest("hex");
}
function generateRentalContractBuffer(data) {
  return new Promise((resolve, reject) => {
    try {
      const sanitizedId = sanitizeRentalId(data.rentalId || "contract");
      const doc = new PDFDocument({
        margin: 36,
        size: "A4",
        bufferPages: true,
        info: {
          Title: `Rental Agreement - ${data.propertyName} - ${data.tenantName}`,
          Author: "KOSMO Bali Hospitality Platform",
          Subject: "Digital Tenancy Agreement (UU ITE & KUHPerdata)",
          Keywords: "kosmo, rental, contract, lease, bali, kuhperdata, uu-ite"
        }
      });
      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));
      const pageWidth = doc.page.width - 72;
      const monthlyRate = data.monthlyPrice !== void 0 ? data.monthlyPrice : data.pricePerMonth !== void 0 ? data.pricePerMonth : 0;
      const adminFee = data.adminFee !== void 0 ? data.adminFee : 5e3;
      const duration = data.durationMonths || 1;
      const totalInitial = data.totalPrice !== void 0 ? data.totalPrice : monthlyRate * duration + adminFee;
      const landlordName = data.landlordName || "PT KOSMO Bali Hospitality / Pengelola Properti";
      const landlordEmail = data.landlordEmail || "hospitality@kosmo.id";
      const landlordPhone = data.landlordPhone || "+62 361-900-5676";
      const tenantNik = data.tenantNikPassport || "-";
      const tenantPhone = data.tenantPhone || "-";
      const propertyAddress = data.propertyAddress || "Kabupaten Badung / Kota Denpasar, Bali, Indonesia";
      let signedAtUtc = "";
      let signedAtWita = "";
      try {
        const signedDateObj = data.signedAt ? new Date(data.signedAt) : /* @__PURE__ */ new Date();
        if (isNaN(signedDateObj.getTime())) {
          signedAtUtc = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").substring(0, 19) + " UTC";
          signedAtWita = new Date(Date.now() + 8 * 60 * 60 * 1e3).toISOString().replace("T", " ").substring(0, 19) + " WITA";
        } else {
          signedAtUtc = signedDateObj.toISOString().replace("T", " ").substring(0, 19) + " UTC";
          const witaTime = new Date(signedDateObj.getTime() + 8 * 60 * 60 * 1e3);
          signedAtWita = witaTime.toISOString().replace("T", " ").substring(0, 19) + " WITA";
        }
      } catch {
        signedAtUtc = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").substring(0, 19) + " UTC";
        signedAtWita = new Date(Date.now() + 8 * 60 * 60 * 1e3).toISOString().replace("T", " ").substring(0, 19) + " WITA";
      }
      doc.rect(36, 36, pageWidth, 54).fill("#0f172a");
      doc.fillColor("#38bdf8").fontSize(11).font("Helvetica-Bold").text("KOSMO BALI CO-LIVING MARKETPLACE", 46, 44, { align: "left" });
      doc.fillColor("#f8fafc").fontSize(9.5).font("Helvetica-Bold").text("SURAT PERJANJIAN SEWA MENYEWA HUNIAN KO-LIVING (KOSMO)", 46, 57, { align: "left" });
      doc.fillColor("#94a3b8").fontSize(7).font("Helvetica-Oblique").text("DIGITAL CO-LIVING RESIDENTIAL LEASE AGREEMENT \u2022 PASAL 1320 KUHPERDATA & UU ITE NO. 11/2008 JO. UU NO. 1/2024", 46, 71, { align: "left" });
      doc.fillColor("#38bdf8").fontSize(8).font("Helvetica-Bold").text(`NO: KOSMO/${sanitizedId.toUpperCase()}`, 36, 45, { width: pageWidth - 10, align: "right" });
      doc.fillColor("#94a3b8").fontSize(7.5).font("Helvetica").text(`Tgl / Date: ${data.startDate}`, 36, 58, { width: pageWidth - 10, align: "right" });
      doc.y = 96;
      doc.fillColor("#000000");
      doc.fontSize(7.5).font("Helvetica").fillColor("#334155").text("Perjanjian Sewa Menyewa Elektronik ini disepakati secara sadar dan sah berdasarkan Kitab Undang-Undang Hukum Perdata (KUHPerdata) Pasal 1320 dan UU ITE No. 11/2008 jo. UU No. 1/2024 oleh dan antara Para Pihak: / This Electronic Tenancy Agreement is entered into freely, knowingly, and lawfully under Indonesian Civil Code Article 1320 and UU ITE No. 11/2008 jo. UU No. 1/2024 by and between the Parties:");
      doc.moveDown(0.4);
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#0f172a").text("PASAL 1: IDENTITAS PARA PIHAK / ARTICLE 1: IDENTIFICATION OF PARTIES");
      doc.moveDown(0.2);
      const colWidth = (pageWidth - 10) / 2;
      const boxY = doc.y;
      doc.rect(36, boxY, colWidth, 70).fillAndStroke("#f8fafc", "#cbd5e1");
      doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("PIHAK PERTAMA (PENGELOLA / LESSOR)", 42, boxY + 5);
      doc.font("Helvetica").fontSize(6.8).fillColor("#334155").text(`\u2022 Nama / Name    : ${landlordName}`, 42, boxY + 17).text(`\u2022 Email          : ${landlordEmail}`, 42, boxY + 29).text(`\u2022 Telepon / Phone: ${landlordPhone}`, 42, boxY + 41).text("\u2022 Peran / Role   : Pengelola Sah & Penyedia Hunian Co-Living", 42, boxY + 53);
      doc.rect(36 + colWidth + 10, boxY, colWidth, 70).fillAndStroke("#f8fafc", "#cbd5e1");
      doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("PIHAK KEDUA (PENYEWA / TENANT)", 42 + colWidth + 10, boxY + 5);
      doc.font("Helvetica").fontSize(6.8).fillColor("#334155").text(`\u2022 Nama Lengkap   : ${data.tenantName}`, 42 + colWidth + 10, boxY + 17).text(`\u2022 NIK / Paspor   : ${tenantNik} \u2022 ${data.tenantOccupation || "Penyewa"}`, 42 + colWidth + 10, boxY + 29).text(`\u2022 Alamat Asal    : ${(data.tenantAddress || "Denpasar/Badung, Bali").substring(0, 36)}`, 42 + colWidth + 10, boxY + 41).text(`\u2022 Telepon / WA   : ${tenantPhone} \u2022 Darurat: ${data.emergencyContactPhone || "-"}`, 42 + colWidth + 10, boxY + 53);
      doc.y = boxY + 76;
      const gridY = doc.y;
      doc.rect(36, gridY, colWidth, 76).fillAndStroke("#ffffff", "#e2e8f0");
      doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("PASAL 2: OBJEK & LOKASI HUNIAN", 42, gridY + 5);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("ARTICLE 2: PREMISES & BALI LOCATION", 42, gridY + 14);
      doc.font("Helvetica").fontSize(7).fillColor("#334155").text(`\u2022 Unit / Room    : ${data.propertyName}`, 42, gridY + 26).text(`\u2022 Alamat / Addr  : ${propertyAddress}`, 42, gridY + 38, { width: colWidth - 12 }).text(`\u2022 Mulai / Start  : ${data.startDate} \u2022 Durasi: ${duration} Bulan / Month(s)`, 42, gridY + 60);
      doc.rect(36 + colWidth + 10, gridY, colWidth, 76).fillAndStroke("#ffffff", "#e2e8f0");
      doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("PASAL 3: BIAYA SEWA & ADMINISTRASI", 42 + colWidth + 10, gridY + 5);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("ARTICLE 3: RENTAL FEES & PLATFORM FEE", 42 + colWidth + 10, gridY + 14);
      doc.font("Helvetica").fontSize(7).fillColor("#334155").text(`\u2022 Sewa Bulanan   : Rp ${monthlyRate.toLocaleString("id-ID")} / bulan`, 42 + colWidth + 10, gridY + 26).text(`\u2022 Biaya Admin    : Rp ${adminFee.toLocaleString("id-ID")} (Flat Rp 5.000 / 5000 Fee)`, 42 + colWidth + 10, gridY + 38).text(`\u2022 Total Biaya    : Rp ${totalInitial.toLocaleString("id-ID")}`, 42 + colWidth + 10, gridY + 50).text("\u2022 Jatuh Tempo    : Setiap 30 hari kalender via KOSMO", 42 + colWidth + 10, gridY + 60);
      doc.y = gridY + 82;
      doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("PASAL 4: KUOTA UTILITAS & FASILITAS / ARTICLE 4: UTILITY QUOTAS & FACILITY CAPS");
      doc.moveDown(0.2);
      const quotas = data.utilityQuotas || {};
      const elecText = quotas.electricityKwh ? `${quotas.electricityKwh} kWh` : "200 kWh";
      const wifiText = quotas.wifiMbps ? `${quotas.wifiMbps} Mbps` : "100 Mbps";
      const waterText = quotas.water || "PDAM & Deep Well (Air Bersih Terfilter) Included";
      const secText = quotas.security || "24/7 CCTV & Security Access";
      const wasteText = quotas.waste || "Daily Waste Management (Pengangkutan Sampah Terjadwal) Included";
      doc.rect(36, doc.y, pageWidth, 68).fillAndStroke("#f1f5f9", "#cbd5e1");
      const uY = doc.y + 4;
      doc.font("Helvetica").fontSize(6.8).fillColor("#1e293b").text(`\u2022 Listrik (Electricity)       : Termasuk kuota token listrik standar ${elecText}/bulan. Pemakaian lebih dibayar mandiri sesuai tarif resmi PLN.`, 42, uY);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("  Standard electricity token allowance included. Excess consumption billed at official PLN rates.", 48, uY + 8);
      doc.font("Helvetica").fontSize(6.8).fillColor("#1e293b").text(`\u2022 Air Bersih (Water Supply)   : ${waterText}. Pemakaian domestik & sanitasi harian wajar.`, 42, uY + 17);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("  Domestic sanitary water usage included (PDAM / filtered deep well).", 48, uY + 25);
      doc.font("Helvetica").fontSize(6.8).fillColor("#1e293b").text(`\u2022 Internet Wi-Fi (100 Mbps)   : Akses broadband internet bersama berkecepatan tinggi hingga ${wifiText} (100Mbps High-Speed WiFi).`, 42, uY + 34);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("  High-speed wireless broadband shared internet access up to 100 Mbps included.", 48, uY + 42);
      doc.font("Helvetica").fontSize(6.8).fillColor("#1e293b").text(`\u2022 Sampah & Keamanan (24/7)    : ${wasteText} & ${secText} (1 slot parkir kendaraan).`, 42, uY + 51);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("  Scheduled waste disposal, 24/7 access, CCTV surveillance, and 1 vehicle parking slot included.", 48, uY + 59);
      doc.y = uY + 70;
      const legY = doc.y;
      doc.rect(36, legY, colWidth, 80).fillAndStroke("#ffffff", "#e2e8f0");
      doc.fillColor("#0f172a").fontSize(7.2).font("Helvetica-Bold").text("PASAL 5: SEWA AKTIF TUNGGAL", 42, legY + 5);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("ARTICLE 5: SINGLE ACTIVE TENANCY & NO SUBLEASING", 42, legY + 14);
      doc.font("Helvetica").fontSize(6.7).fillColor("#334155").text("1. Perjanjian Sewa Aktif Tunggal (Single Active Tenancy Covenant): Penyewa menyatakan hanya memiliki 1 sewa aktif di KOSMO.", 42, legY + 24, { width: colWidth - 12 });
      doc.font("Helvetica-Oblique").fontSize(6.3).fillColor("#64748b").text("   Tenant warrants maintaining only 1 active lease.", 48, legY + 38);
      doc.font("Helvetica").fontSize(6.7).fillColor("#334155").text("2. Larangan Sewa Ganda: Dilarang keras mengalihkan/sublet sewa tanpa izin tertulis.", 42, legY + 48, { width: colWidth - 12 });
      doc.font("Helvetica-Oblique").fontSize(6.3).fillColor("#64748b").text("   Subleasing or assignment is strictly prohibited.", 48, legY + 62);
      doc.rect(36 + colWidth + 10, legY, colWidth, 80).fillAndStroke("#ffffff", "#e2e8f0");
      doc.fillColor("#0f172a").fontSize(7.2).font("Helvetica-Bold").text("PASAL 6: HUKUM & YURISDIKSI BALI", 42 + colWidth + 10, legY + 5);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("ARTICLE 6: GOVERNING LAW & JURISDICTION", 42 + colWidth + 10, legY + 14);
      doc.font("Helvetica").fontSize(6.7).fillColor("#334155").text("1. Tunduk pada hukum materiil Republik Indonesia (KUHPerdata & UU ITE No. 11/2008).", 42 + colWidth + 10, legY + 24, { width: colWidth - 12 });
      doc.font("Helvetica-Oblique").fontSize(6.3).fillColor("#64748b").text("   Governed by the laws of the Republic of Indonesia.", 48 + colWidth + 10, legY + 38);
      doc.font("Helvetica").fontSize(6.7).fillColor("#334155").text("2. Domisili hukum tetap di Pengadilan Negeri Denpasar / Pengadilan Negeri Badung, Bali.", 42 + colWidth + 10, legY + 48, { width: colWidth - 12 });
      doc.font("Helvetica-Oblique").fontSize(6.3).fillColor("#64748b").text("   Exclusive jurisdiction: Pengadilan Negeri Denpasar / Badung.", 48 + colWidth + 10, legY + 62);
      doc.y = legY + 86;
      doc.fillColor("#0f172a").fontSize(7.5).font("Helvetica-Bold").text("PASAL 7: PENGESAHAN ELEKTRONIK & JEJAK AUDIT / ARTICLE 7: EXECUTION & DIGITAL AUDIT TRAIL");
      doc.moveDown(0.2);
      const sigBoxY = doc.y;
      const sigBoxHeight = 104;
      doc.rect(36, sigBoxY, pageWidth, sigBoxHeight).fillAndStroke("#f8fafc", "#0f172a");
      const sigWidth = 150;
      doc.fillColor("#0f172a").fontSize(7).font("Helvetica-Bold").text("TANDA TANGAN PENYEWA / TENANT SIGNATURE:", 42, sigBoxY + 5);
      let signatureRendered = false;
      if (data.signatureBase64 && data.signatureBase64.startsWith("data:image")) {
        try {
          const base64Data = data.signatureBase64.replace(/^data:image\/\w+;base64,/, "");
          const imgBuffer = Buffer.from(base64Data, "base64");
          if (imgBuffer.length > 30) {
            doc.image(imgBuffer, 44, sigBoxY + 16, { fit: [136, 44], align: "center", valign: "center" });
            signatureRendered = true;
          }
        } catch {
          signatureRendered = false;
        }
      }
      if (!signatureRendered) {
        doc.rect(44, sigBoxY + 16, 136, 44).fillAndStroke("#f1f5f9", "#94a3b8");
        doc.fillColor("#475569").fontSize(6.5).font("Helvetica-Oblique").text("[Tanda Tangan Digital Terverifikasi via KOSMO Secure Pad / Verified Digital Signature]", 46, sigBoxY + 28, { width: 132, align: "center" });
      }
      doc.fillColor("#0f172a").fontSize(7).font("Helvetica-Bold").text(`${data.tenantName}`, 42, sigBoxY + 66, { width: sigWidth });
      doc.fillColor("#475569").fontSize(6.5).font("Helvetica").text(`NIK / Pass: ${tenantNik}`, 42, sigBoxY + 76, { width: sigWidth }).text("Status: Terverifikasi Secara Elektronik (UU ITE Pasal 11)", 42, sigBoxY + 86, { width: sigWidth });
      const auditX = 36 + sigWidth + 10;
      const auditWidth = pageWidth - sigWidth - 16;
      doc.fillColor("#0f172a").fontSize(7).font("Helvetica-Bold").text("JEJAK AUDIT FORENSIK DIGITAL (UU ITE & PP 71/2019 COMPLIANT):", auditX, sigBoxY + 5);
      const signerIp = data.signerIp || "114.125.45.102 (Client Direct)";
      const signerUserAgent = data.signerUserAgent || "Mozilla/5.0 KOSMO Secure Web Client";
      doc.font("Courier").fontSize(6.2).fillColor("#0f172a").text(`\u2022 Signer Remote IP: ${signerIp}`, auditX, sigBoxY + 18, { width: auditWidth }).text(`\u2022 Waktu / Time    : ${signedAtWita} / ${signedAtUtc}`, auditX, sigBoxY + 28, { width: auditWidth }).text(`\u2022 Client Platform : ${signerUserAgent.substring(0, 65)}`, auditX, sigBoxY + 38, { width: auditWidth }).text(`\u2022 Dasar Hukum     : Pasal 1320 KUHPerdata, UU ITE No. 11/2008 jo. UU No. 1/2024`, auditX, sigBoxY + 48, { width: auditWidth });
      doc.font("Helvetica-Oblique").fontSize(6).fillColor("#475569").text("Dokumen elektronik ini sah, mengikat, dan memiliki kekuatan pembuktian yang sempurna sesuai Pasal 5 & 6 UU ITE No. 11/2008 jo. UU No. 1/2024 serta Pasal 1320 KUHPerdata. Setiap modifikasi terhadap isi dokumen ini akan membatalkan integritas tanda tangan digital secara otomatis.", auditX, sigBoxY + 62, { width: auditWidth });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
async function generateRentalContractPdf(data, outputDir) {
  const buffer = await generateRentalContractBuffer(data);
  const contractHash = computeContractHash(buffer);
  const sanitizedId = sanitizeRentalId(data.rentalId);
  const fileName = `contract_${sanitizedId}.pdf`;
  if (outputDir) {
    try {
      const resolvedTargetDir = path3.resolve(outputDir);
      if (!fs2.existsSync(resolvedTargetDir)) {
        fs2.mkdirSync(resolvedTargetDir, { recursive: true });
      }
      const fullFilePath = path3.join(resolvedTargetDir, fileName);
      const resolvedFilePath = path3.resolve(fullFilePath);
      if (resolvedFilePath.startsWith(resolvedTargetDir)) {
        fs2.writeFileSync(resolvedFilePath, buffer);
      }
    } catch {
    }
  }
  return {
    filePath: `/uploads/${fileName}`,
    fileName,
    buffer,
    contractHash
  };
}
async function generateAndUploadContract(data) {
  const pdfBuffer = await generateRentalContractBuffer(data);
  const contractHash = computeContractHash(pdfBuffer);
  const sanitizedId = sanitizeRentalId(data.rentalId);
  const filename = `contract_${sanitizedId}.pdf`;
  let cloudinaryUrl;
  try {
    const uploadRes = await uploadContractStream(pdfBuffer, filename, "kosmo_contracts");
    cloudinaryUrl = uploadRes.secure_url;
  } catch (err) {
    console.warn("Cloudinary contract upload fallback to local URL due to error:", err);
    cloudinaryUrl = `/uploads/${filename}`;
  }
  return {
    pdfBuffer,
    contractHash,
    cloudinaryUrl
  };
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

// backend/services/transformers.ts
var DEFAULT_PROPERTY_IMAGE = "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80";
function normalizeProperty(p) {
  return {
    ...p,
    price: Number(p.price) || 0,
    totalRooms: Number(p.totalRooms) || 0,
    occupiedRooms: Number(p.occupiedRooms) || 0,
    rating: Number(p.rating) || 0,
    image: p.image && p.image.trim() !== "" ? p.image : DEFAULT_PROPERTY_IMAGE,
    facilities: Array.isArray(p.facilities) ? p.facilities : []
  };
}
function normalizePropertySummary(p) {
  const norm = normalizeProperty(p);
  if (norm.image && norm.image.startsWith("data:image") && norm.image.length > 2048) {
    norm.image = DEFAULT_PROPERTY_IMAGE;
  }
  return norm;
}

// backend/middleware/auth.ts
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
var defaultSecret = null;
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim() !== "") {
    return secret;
  }
  if (!defaultSecret) {
    if (process.env.NODE_ENV === "production") {
      console.warn("\u26A0\uFE0F [Auth Warning] JWT_SECRET environment variable is missing in production. Using fallback secret.");
      defaultSecret = process.env.JWT_FALLBACK_SECRET || "kosmo-bali-production-jwt-default-secret-key-2026";
    } else {
      defaultSecret = randomBytes(32).toString("hex");
    }
  }
  return defaultSecret;
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
  let token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
  if (!token && typeof req.query?.token === "string") {
    token = req.query.token.trim();
  }
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
  name: z.string().min(2, "Nama wajib diisi minimal 2 karakter"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  phone: z.string({ message: "Nomor telepon wajib diisi saat mendaftar akun" }).trim().min(9, "Nomor telepon minimal 9 digit").max(20, "Nomor telepon maksimal 20 digit").regex(
    /^(?:\+?\d{9,16}|08\d{7,13}|0\d{8,14})$/,
    "Format nomor telepon tidak valid (contoh: 08123456789 atau +628123456789)"
  )
});
var adminCreateUserSchema = z.object({
  name: z.string().min(2, "Nama wajib diisi minimal 2 karakter"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  role: z.enum(["admin", "landlord", "tenant"], { message: "Role harus admin, landlord, atau tenant" }),
  phone: z.string().optional().or(z.literal("")),
  paymentMethod: z.string().optional().or(z.literal(""))
});
var adminUpdateUserSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").optional(),
  email: z.string().email("Format email tidak valid").optional(),
  password: z.string().min(6, "Password minimal 6 karakter").optional().or(z.literal("")),
  role: z.enum(["admin", "landlord", "tenant"], { message: "Role harus admin, landlord, atau tenant" }).optional(),
  phone: z.string().optional().or(z.literal("")),
  paymentMethod: z.string().optional().or(z.literal(""))
});
var updateProfileSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").optional(),
  phone: z.string().trim().min(9, "Nomor telepon minimal 9 digit").max(20, "Nomor telepon maksimal 20 digit").regex(
    /^(?:\+?\d{9,16}|08\d{7,13}|0\d{8,14})$/,
    "Format nomor telepon tidak valid (contoh: 08123456789 atau +628123456789)"
  ).optional(),
  paymentMethod: z.string().optional(),
  notifications: z.preprocess((val) => {
    if (typeof val === "number") return val === 1;
    if (typeof val === "string") return val === "true" || val === "1";
    return val;
  }, z.boolean()).optional(),
  language: z.string().optional(),
  identity_type: z.enum(["NIK", "PASSPORT"]).optional(),
  identity_number: z.string().trim().regex(
    /^(?:\d{16}|[A-Za-z0-9]{6,12})$/,
    "NIK harus 16 digit angka atau Paspor 6-12 karakter alfanumerik"
  ).optional().or(z.literal("")),
  address: z.string().min(5, "Alamat domisili minimal 5 karakter").optional().or(z.literal("")),
  occupation: z.string().min(2, "Pekerjaan/Profesi minimal 2 karakter").optional().or(z.literal("")),
  emergency_contact_name: z.string().min(2, "Nama kontak darurat minimal 2 karakter").optional().or(z.literal("")),
  emergency_contact_relation: z.string().optional().or(z.literal("")),
  emergency_contact_phone: z.string().trim().min(9, "Nomor telepon kontak darurat minimal 9 digit").max(20, "Nomor telepon kontak darurat maksimal 20 digit").regex(
    /^(?:\+?\d{9,16}|08\d{7,13}|0\d{8,14})$/,
    "Format nomor telepon kontak darurat tidak valid"
  ).optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  gender: z.string().optional().or(z.literal(""))
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
var previewContractSchema = z.object({
  propertyId: z.string().min(1, "ID properti wajib diisi"),
  durationMonths: z.number().int("Durasi sewa harus berupa bilangan bulat").min(1, "Durasi sewa minimal 1 bulan").max(120, "Durasi sewa maksimal 120 bulan").optional().default(1),
  startDate: z.string().optional(),
  tenantNikPassport: z.string().trim().regex(
    /^(?:\d{16}|[A-Za-z0-9]{6,12})$/,
    "NIK harus 16 digit angka atau nomor Paspor 6-12 karakter alfanumerik"
  ).optional().or(z.literal("")),
  signatureBase64: z.string().max(1e6, "Ukuran data tanda tangan digital melebihi batas maksimum 1MB").optional(),
  rentalId: z.string().optional()
});
var signContractSchema = z.object({
  propertyId: z.string().min(1, "ID properti wajib diisi"),
  durationMonths: z.number().int("Durasi sewa harus berupa bilangan bulat").min(1, "Durasi sewa minimal 1 bulan").max(120, "Durasi sewa maksimal 120 bulan"),
  startDate: z.string().min(1, "Tanggal mulai sewa wajib diisi"),
  tenantNikPassport: z.string().trim().min(1, "NIK / Nomor Paspor wajib diisi").regex(
    /^(?:\d{16}|[A-Za-z0-9]{6,12})$/,
    "NIK harus berupa 16 digit angka atau nomor Paspor yang valid (6-12 karakter alfanumerik)"
  ),
  signatureBase64: z.string().min(20, "Tanda tangan digital wajib diisi").max(1e6, "Ukuran data tanda tangan digital melebihi batas maksimum 1MB").refine(
    (val) => /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(val) || /^[A-Za-z0-9+/=]{20,}$/.test(val),
    {
      message: "Tanda tangan digital harus berupa data URL gambar base64 yang valid"
    }
  ),
  affirmativeConsent: z.literal(true, {
    message: "Penyewa wajib menyetujui syarat dan ketentuan perjanjian sewa (affirmative clickwrap consent)"
  }),
  rentalId: z.string().optional()
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

// backend/types/index.ts
function isUserProfileComplete(user) {
  const missingFields = [];
  const missingFieldLabels = [];
  if (!user) {
    return {
      complete: false,
      missingFields: ["user"],
      missingFieldLabels: ["Data Pengguna"]
    };
  }
  if (!user.name || user.name.trim().length < 2) {
    missingFields.push("name");
    missingFieldLabels.push("Nama Lengkap (min. 2 karakter)");
  }
  if (!user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email.trim())) {
    missingFields.push("email");
    missingFieldLabels.push("Alamat Email Valid");
  }
  const cleanPhone = (user.phone || "").trim().replace(/[\s-]/g, "");
  if (!cleanPhone || cleanPhone.length < 9) {
    missingFields.push("phone");
    missingFieldLabels.push("Nomor HP/WhatsApp (min. 9 digit)");
  }
  const idType = user.identity_type || "NIK";
  const cleanId = (user.identity_number || "").trim();
  if (idType === "NIK") {
    if (!/^\d{16}$/.test(cleanId)) {
      missingFields.push("identity_number");
      missingFieldLabels.push("Nomor NIK KTP (tepat 16 digit angka)");
    }
  } else {
    if (!/^[A-Za-z0-9]{6,12}$/.test(cleanId)) {
      missingFields.push("identity_number");
      missingFieldLabels.push("Nomor Paspor (6-12 karakter alfanumerik)");
    }
  }
  if (!user.address || user.address.trim().length < 5) {
    missingFields.push("address");
    missingFieldLabels.push("Alamat Domisili/KTP (min. 5 karakter)");
  }
  if (!user.occupation || user.occupation.trim().length < 2) {
    missingFields.push("occupation");
    missingFieldLabels.push("Pekerjaan/Profesi/Instansi");
  }
  if (!user.emergency_contact_name || user.emergency_contact_name.trim().length < 2) {
    missingFields.push("emergency_contact_name");
    missingFieldLabels.push("Nama Kontak Darurat");
  }
  const cleanEmerPhone = (user.emergency_contact_phone || "").trim().replace(/[\s-]/g, "");
  if (!cleanEmerPhone || cleanEmerPhone.length < 9) {
    missingFields.push("emergency_contact_phone");
    missingFieldLabels.push("Nomor Telepon Kontak Darurat");
  }
  return {
    complete: missingFields.length === 0,
    missingFields,
    missingFieldLabels
  };
}

// backend/router.ts
var authLimiter = rateLimit({
  windowMs: 60 * 1e3,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Terlalu banyak percobaan masuk/daftar. Silakan coba lagi dalam 1 menit." }
});
var uploadLimiter = rateLimit({
  windowMs: 60 * 1e3,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Terlalu banyak unggahan berkas. Silakan coba lagi nanti." }
});
var trackingLimiter = rateLimit({
  windowMs: 60 * 1e3,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Terlalu banyak permintaan pelacakan." }
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
router.post("/upload", authenticateToken, uploadLimiter, upload.single("image"), async (req, res) => {
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
  return `${prefix}-${crypto3.randomBytes(4).toString("hex")}`;
};
function formatSafeUser(user) {
  const safeUser = { ...user };
  delete safeUser.password;
  const profileStatus = isUserProfileComplete(user);
  return {
    ...safeUser,
    notifications: user.notifications !== void 0 ? typeof user.notifications === "number" ? user.notifications === 1 : Boolean(user.notifications) : true,
    isProfileComplete: profileStatus.complete,
    missingProfileFields: profileStatus.missingFields,
    missingProfileFieldLabels: profileStatus.missingFieldLabels
  };
}
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
router.post("/auth/register", authLimiter, validateBody(registerSchema), async (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!email || !password || !name || !phone) {
    return res.status(400).json({ message: "Nama, email, password, dan nomor telepon wajib diisi." });
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
      [userId, email, hashedPassword, name, phone.trim()]
    );
    const [newUsers] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
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
router.get("/auth/me", authenticateToken, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "Otentikasi diperlukan." });
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ message: "User tidak ditemukan." });
    res.json(formatSafeUser(user));
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil profil user." });
  }
});
router.get("/users/profile/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const authUser = req.user;
  if (authUser?.role !== "admin" && authUser?.id !== id) {
    return res.status(403).json({ message: "Akses ditolak. Anda tidak memiliki izin untuk melihat profil ini." });
  }
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    res.json(formatSafeUser(user));
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil profil user." });
  }
});
router.put("/users/profile/:id", authenticateToken, validateBody(updateProfileSchema), async (req, res) => {
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
  } = req.body;
  if (authUser?.role !== "admin" && authUser?.id !== id) {
    return res.status(403).json({ message: "Akses ditolak. Anda tidak dapat mengubah profil pengguna lain." });
  }
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    const notifVal = notifications !== void 0 ? notifications ? 1 : 0 : 1;
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
    const [updatedUsers] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
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
router.put("/auth/profile", authenticateToken, validateBody(updateProfileSchema), async (req, res) => {
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
  } = req.body;
  try {
    const notifVal = notifications !== void 0 ? notifications ? 1 : 0 : 1;
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
    const [updatedUsers] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
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
router.post("/users", authenticateToken, requireRole(["admin"]), validateBody(adminCreateUserSchema), async (req, res) => {
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
router.put("/users/:id", authenticateToken, requireRole(["admin"]), validateBody(adminUpdateUserSchema), async (req, res) => {
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
      const facilitiesList = (Array.isArray(facility) ? facility.map(String) : [String(facility)]).map((f) => f.toLowerCase());
      filteredProperties = properties.filter((p) => {
        const propFacSet = new Set((p.facilities || []).map((item) => item.toLowerCase()));
        return facilitiesList.every((f) => propFacSet.has(f));
      });
    }
    const normalized = filteredProperties.map(normalizePropertySummary);
    apiCache.set(cacheKey, normalized, 60);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.json(normalized);
  } catch (err) {
    console.error("Error in GET /api/properties:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Gagal mengambil properti." });
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
      const facilityValues = facilities.map((fac) => [propId, fac]);
      await connection.query(
        "INSERT INTO property_facilities (propertyId, facility) VALUES ?",
        [facilityValues]
      );
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
        const facilityValues = facilities.map((fac) => [id, fac]);
        await connection.query(
          "INSERT INTO property_facilities (propertyId, facility) VALUES ?",
          [facilityValues]
        );
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
    console.error("Error in GET /api/reviews:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Gagal mengambil data review." });
  }
});
router.post("/reviews", authenticateToken, validateBody(reviewSchema), async (req, res) => {
  const { propertyId, rating, comment } = req.body;
  const authUser = req.user;
  if (!authUser?.id) {
    return res.status(401).json({ message: "Akses ditolak. Token otentikasi diperlukan." });
  }
  const userId = authUser.id;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [propRows] = await connection.query("SELECT * FROM properties WHERE id = ?", [propertyId]);
    const property = propRows[0];
    if (!property) {
      await connection.rollback();
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    const [userRows] = await connection.query("SELECT name FROM users WHERE id = ?", [userId]);
    const userName = userRows[0]?.name || authUser.email.split("@")[0] || "Anonim";
    const revId = generateId("rev");
    const dateStr = (/* @__PURE__ */ new Date()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    await connection.query(
      `INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [revId, propertyId, property.name, userId, userName, parseInt(String(rating), 10), comment, dateStr]
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
router.put("/reviews/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;
  const authUser = req.user;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM reviews WHERE id = ?", [id]);
    const review = rows[0];
    if (!review) {
      await connection.rollback();
      return res.status(404).json({ message: "Review tidak ditemukan." });
    }
    if (authUser?.role !== "admin" && review.userId !== authUser?.id) {
      await connection.rollback();
      return res.status(403).json({ message: "Akses ditolak. Anda tidak memiliki izin untuk mengubah ulasan ini." });
    }
    const updatedRating = rating !== void 0 ? parseInt(String(rating), 10) : review.rating;
    const updatedComment = comment !== void 0 ? comment : review.comment;
    await connection.query(
      "UPDATE reviews SET rating = ?, comment = ? WHERE id = ?",
      [updatedRating, updatedComment, id]
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
router.delete("/reviews/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const authUser = req.user;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT * FROM reviews WHERE id = ?", [id]);
    const review = rows[0];
    if (!review) {
      await connection.rollback();
      return res.status(404).json({ message: "Review tidak ditemukan." });
    }
    if (authUser?.role !== "admin" && review.userId !== authUser?.id) {
      await connection.rollback();
      return res.status(403).json({ message: "Akses ditolak. Anda tidak memiliki izin untuk menghapus ulasan ini." });
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
    console.error("Delete review error:", err);
    res.status(500).json({ message: "Gagal menghapus review." });
  } finally {
    connection.release();
  }
});
var handleLandlordStats = async (req, res) => {
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }
  const landlordId = authUser.role === "admin" && req.query.landlordId ? String(req.query.landlordId) : authUser.id;
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
router.get("/stats", authenticateToken, requireRole(["admin", "landlord", "owner"]), handleLandlordStats);
router.get("/landlord/stats", authenticateToken, requireRole(["admin", "landlord", "owner"]), handleLandlordStats);
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
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }
  const targetUserId = authUser.role === "admin" ? req.query.userId ? String(req.query.userId) : null : authUser.id;
  try {
    let sql = "SELECT * FROM withdrawals WHERE 1=1";
    const params = [];
    if (targetUserId) {
      sql += " AND userId = ?";
      params.push(targetUserId);
    }
    sql += " ORDER BY id DESC LIMIT 50";
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data penarikan." });
  }
});
router.get("/withdrawals/me", authenticateToken, async (req, res) => {
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }
  const userId = authUser.id;
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
router.post("/tracking/visit", trackingLimiter, async (req, res) => {
  const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
  const firstIp = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
  const ip = firstIp.split(",")[0].trim().substring(0, 255);
  const userAgent = String(req.headers["user-agent"] || "").substring(0, 1e3);
  try {
    await pool.query(
      "INSERT INTO visitor_tracking (ip_address, user_agent) VALUES (?, ?)",
      [ip, userAgent]
    );
    res.status(201).json({ message: "Kunjungan berhasil dilacak." });
  } catch (err) {
    console.error("Error in POST /api/tracking/visit:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Gagal melacak kunjungan." });
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
  const authUser = req.user;
  if (!authUser) return res.status(401).json({ message: "Otentikasi diperlukan." });
  const landlordId = authUser.role === "admin" && req.query.landlordId ? String(req.query.landlordId) : authUser.id;
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
function computePaymentSchedule(startDateStr, status, durationMonthsOrRef, referenceDate) {
  let effectiveDuration = 1;
  let isBoundedDuration = false;
  let effectiveRef = /* @__PURE__ */ new Date();
  if (durationMonthsOrRef instanceof Date) {
    effectiveRef = durationMonthsOrRef;
    isBoundedDuration = false;
  } else {
    if (typeof durationMonthsOrRef === "number" && !isNaN(durationMonthsOrRef)) {
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
  const getClampedDate = (months) => {
    const totalMonths = start.getMonth() + months;
    const year = start.getFullYear() + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12 + 12) % 12;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(startDay, daysInMonth), 0, 0, 0, 0);
  };
  const pad = (n) => n.toString().padStart(2, "0");
  const leaseEnd = getClampedDate(effectiveDuration);
  const leaseStartDate = start.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const leaseEndDate = leaseEnd.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const leaseEndDateISO = `${leaseEnd.getFullYear()}-${pad(leaseEnd.getMonth() + 1)}-${pad(leaseEnd.getDate())}`;
  if (status !== "active" || isBoundedDuration && now > leaseEnd) {
    return {
      nextPaymentDate: "-",
      nextPaymentDateISO: "",
      daysRemaining: 0,
      paymentStatus: "Penyewaan Selesai",
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
  const daysRemaining = Math.max(0, Math.round(diffMs / (1e3 * 60 * 60 * 24)));
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
    paymentStatus,
    leaseStartDate,
    leaseEndDate,
    leaseEndDateISO,
    totalDurationMonths: effectiveDuration
  };
}
router.get("/rentals", authenticateToken, async (req, res) => {
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }
  const { tenantId } = req.query;
  const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : void 0;
  const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
  const offsetParam = req.query.offset ? parseInt(String(req.query.offset), 10) : limitParam ? (pageParam - 1) * limitParam : 0;
  try {
    let sql = "SELECT * FROM rentals WHERE 1=1";
    const params = [];
    if (authUser.role === "tenant") {
      sql += " AND tenantId = ?";
      params.push(authUser.id);
    } else if (authUser.role === "landlord") {
      sql += " AND propertyId IN (SELECT id FROM properties WHERE ownerId = ?)";
      params.push(authUser.id);
    } else if (authUser.role === "admin" && tenantId) {
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
      const duration = Number(r.duration_months || 1);
      const schedule = computePaymentSchedule(r.startDate || (/* @__PURE__ */ new Date()).toISOString(), r.status, duration);
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
      const duration = Number(r.duration_months || 1);
      const schedule = computePaymentSchedule(r.startDate || (/* @__PURE__ */ new Date()).toISOString(), r.status, duration);
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
router.post(
  "/rentals/contract/preview",
  authenticateToken,
  validateBody(previewContractSchema),
  async (req, res) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Akses ditolak. Token otentikasi diperlukan." });
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
      const [propRows] = await pool.query(
        "SELECT id, name, address, price, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ?",
        [propertyId]
      );
      const property = propRows[0];
      if (!property) {
        return res.status(404).json({ success: false, message: "Properti tidak ditemukan." });
      }
      const [userRows] = await pool.query("SELECT * FROM users WHERE id = ?", [authUser.id]);
      const tenant = userRows[0];
      let landlord;
      if (property.ownerId) {
        const [landlordRows] = await pool.query("SELECT * FROM users WHERE id = ?", [property.ownerId]);
        landlord = landlordRows[0];
      }
      const signerIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip || req.socket.remoteAddress || "127.0.0.1";
      const signerUserAgent = req.headers["user-agent"] || "Mozilla/5.0 (KOSMO Secure Client)";
      const signedAtDate = /* @__PURE__ */ new Date();
      const signedAtIso = signedAtDate.toISOString();
      const duration = Number(durationMonths) || 1;
      const monthlyPrice = Number(property.price) || 0;
      const adminFee = 5e3;
      const totalPrice = monthlyPrice * duration + adminFee;
      const startDateStr = startDate || signedAtDate.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
      const rentalId = customRentalId && typeof customRentalId === "string" && customRentalId.trim() !== "" ? customRentalId.trim() : "preview-draft";
      const contractData = {
        rentalId,
        propertyName: property.name,
        propertyAddress: property.address || "Kabupaten Badung / Kota Denpasar, Bali, Indonesia",
        landlordName: landlord ? landlord.name : "PT KOSMO Bali Hospitality / Pengelola Properti",
        landlordEmail: landlord ? landlord.email : "hospitality@kosmo.id",
        landlordPhone: landlord ? landlord.phone : "+62 361-900-5676",
        tenantName: tenant ? tenant.name : authUser.email,
        tenantEmail: tenant ? tenant.email : authUser.email,
        tenantPhone: tenant ? tenant.phone || "" : "",
        tenantNikPassport: tenantNikPassport || (tenant ? tenant.identity_number : "") || "-",
        tenantAddress: tenant ? tenant.address || "" : "",
        tenantOccupation: tenant ? tenant.occupation || "" : "",
        emergencyContactName: tenant ? tenant.emergency_contact_name || "" : "",
        emergencyContactPhone: tenant ? tenant.emergency_contact_phone || "" : "",
        emergencyContactRelation: tenant ? tenant.emergency_contact_relation || "" : "",
        startDate: startDateStr,
        durationMonths: duration,
        monthlyPrice,
        pricePerMonth: monthlyPrice,
        totalPrice,
        adminFee,
        signatureBase64: signatureBase64 || void 0,
        signerIp,
        signerUserAgent,
        signedAt: signedAtIso,
        utilityQuotas: {
          electricityKwh: 200,
          water: "PDAM & Deep Well (Air Bersih Terfilter) Included",
          wifiMbps: 100,
          security: "24/7 CCTV & Security Access",
          waste: "Daily Waste Management Included"
        }
      };
      const pdfBuffer = await generateRentalContractBuffer(contractData);
      const contractHash = computeContractHash(pdfBuffer);
      const profileStatus = tenant ? isUserProfileComplete(tenant) : { complete: false, missingFields: ["user"], missingFieldLabels: ["Data Pengguna"] };
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
    } catch (err) {
      console.error("Contract preview error:", err);
      return res.status(500).json({ success: false, message: "Gagal membuat pratinjau kontrak digital." });
    }
  }
);
router.post(
  "/rentals/contract/sign",
  authenticateToken,
  validateBody(signContractSchema),
  async (req, res) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Akses ditolak. Token otentikasi diperlukan." });
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
      const [userRows] = await connection.query("SELECT * FROM users WHERE id = ? FOR UPDATE", [authUser.id]);
      const tenant = userRows[0];
      if (!tenant) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: "Pengguna tidak ditemukan." });
      }
      const profileCheck = isUserProfileComplete(tenant);
      if (!profileCheck.complete) {
        await connection.rollback();
        return res.status(422).json({
          success: false,
          message: "Profil identitas hukum penyewa belum lengkap. Berdasarkan Pasal 1320 KUHPerdata & UU ITE, Anda wajib melengkapi data identitas (NIK/Paspor, Alamat Domisili, Pekerjaan, dan Kontak Darurat) pada profil Anda sebelum menyewa kos.",
          missingFields: profileCheck.missingFields,
          missingFieldLabels: profileCheck.missingFieldLabels
        });
      }
      const [activeRentals] = await connection.query(
        "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' FOR UPDATE",
        [authUser.id]
      );
      if (activeRentals.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru."
        });
      }
      const [propRows] = await connection.query(
        "SELECT id, name, address, price, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ? FOR UPDATE",
        [propertyId]
      );
      const property = propRows[0];
      if (!property) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: "Properti tidak ditemukan." });
      }
      if (property.occupiedRooms >= property.totalRooms) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Kamar kos sudah penuh." });
      }
      let landlord;
      if (property.ownerId) {
        const [landlordRows] = await connection.query("SELECT * FROM users WHERE id = ?", [property.ownerId]);
        landlord = landlordRows[0];
      }
      const signerIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip || req.socket.remoteAddress || "127.0.0.1";
      const signerUserAgent = req.headers["user-agent"] || "Mozilla/5.0 (KOSMO Secure Client)";
      const signedAtDate = /* @__PURE__ */ new Date();
      const signedAtIso = signedAtDate.toISOString();
      const duration = Number(durationMonths) || 1;
      const adminFee = 5e3;
      const rentalPrice = Number(property.price) || 0;
      const totalAmount = rentalPrice * duration + adminFee;
      const rentalId = customRentalId && typeof customRentalId === "string" && customRentalId.trim() !== "" ? customRentalId.trim() : generateId("rent");
      const startDateStr = startDate || signedAtDate.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
      const contractData = {
        rentalId,
        propertyName: property.name,
        propertyAddress: property.address || "Kabupaten Badung / Kota Denpasar, Bali, Indonesia",
        landlordName: landlord ? landlord.name : "PT KOSMO Bali Hospitality / Pengelola Properti",
        landlordEmail: landlord ? landlord.email : "hospitality@kosmo.id",
        landlordPhone: landlord ? landlord.phone : "+62 361-900-5676",
        tenantName: tenant ? tenant.name : authUser.email,
        tenantEmail: tenant ? tenant.email : authUser.email,
        tenantPhone: tenant ? tenant.phone || "" : "",
        tenantNikPassport: tenantNikPassport || (tenant ? tenant.identity_number : "") || "-",
        tenantAddress: tenant ? tenant.address || "" : "",
        tenantOccupation: tenant ? tenant.occupation || "" : "",
        emergencyContactName: tenant ? tenant.emergency_contact_name || "" : "",
        emergencyContactPhone: tenant ? tenant.emergency_contact_phone || "" : "",
        emergencyContactRelation: tenant ? tenant.emergency_contact_relation || "" : "",
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
          water: "PDAM & Deep Well (Air Bersih Terfilter) Included",
          wifiMbps: 100,
          security: "24/7 CCTV & Security Access",
          waste: "Daily Waste Management Included"
        }
      };
      const uploadResult = await generateAndUploadContract(contractData);
      const contractUrl = uploadResult.cloudinaryUrl || `/uploads/contract_${sanitizeRentalId(rentalId)}.pdf`;
      const contractHash = uploadResult.contractHash;
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
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("rentals");
      return res.status(201).json({
        success: true,
        message: "Kontrak digital berhasil ditandatangani. Silakan selesaikan pembayaran.",
        rentalId,
        contractUrl,
        contractHash,
        adminFee,
        totalAmount,
        signedAt: signedAtIso
      });
    } catch (err) {
      await connection.rollback();
      console.error("Contract sign error:", err);
      return res.status(500).json({ success: false, message: "Gagal memproses penandatanganan kontrak digital." });
    } finally {
      connection.release();
    }
  }
);
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
    if (!tenant) {
      await connection.rollback();
      return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }
    const profileCheck = isUserProfileComplete(tenant);
    if (!profileCheck.complete) {
      await connection.rollback();
      return res.status(422).json({
        message: "Profil identitas hukum penyewa belum lengkap. Lengkapi profil Anda terlebih dahulu sebelum menyewa.",
        missingFields: profileCheck.missingFields,
        missingFieldLabels: profileCheck.missingFieldLabels
      });
    }
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
        tenantNikPassport: tenant ? tenant.identity_number : "",
        tenantAddress: tenant ? tenant.address : "",
        tenantOccupation: tenant ? tenant.occupation : "",
        emergencyContactName: tenant ? tenant.emergency_contact_name : "",
        emergencyContactPhone: tenant ? tenant.emergency_contact_phone : "",
        emergencyContactRelation: tenant ? tenant.emergency_contact_relation : "",
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
      "UPDATE properties SET occupiedRooms = LEAST(totalRooms, occupiedRooms + 1) WHERE id = ?",
      [propertyId]
    );
    if (property.ownerId) {
      await connection.query(
        "UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?",
        [rentalPrice * rentalDuration, rentalPrice * rentalDuration, property.ownerId]
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
router.get(
  "/rentals/:id/contract",
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Akses ditolak. Token otentikasi diperlukan." });
    }
    try {
      const [rows] = await pool.query(
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
        return res.status(404).json({ message: "Data sewa tidak ditemukan." });
      }
      const isTenant = authUser.id === rental.rental_tenant_id;
      const isOwner = Boolean(rental.property_owner_id && authUser.id === rental.property_owner_id);
      const isAdmin = authUser.role === "admin";
      if (!isTenant && !isOwner && !isAdmin) {
        return res.status(403).json({ message: "Akses ditolak ke dokumen kontrak ini." });
      }
      const contractDuration = Number(rental.duration_months || 1);
      const contractMonthlyPrice = Number(rental.rental_price || rental.property_price || 0);
      const contractAdminFee = rental.admin_fee_amount !== void 0 && rental.admin_fee_amount !== null ? Number(rental.admin_fee_amount) : 5e3;
      const contractTotalPrice = contractMonthlyPrice * contractDuration + contractAdminFee;
      const contractData = {
        rentalId: rental.rental_id,
        propertyName: rental.rental_property_name || rental.property_name || "Unit KOSMO Bali",
        propertyAddress: rental.property_address || "Kabupaten Badung / Kota Denpasar, Bali, Indonesia",
        landlordName: rental.landlord_name || "PT KOSMO Bali Hospitality / Pengelola Properti",
        landlordEmail: rental.landlord_email || "hospitality@kosmo.id",
        landlordPhone: rental.landlord_phone || "+62 361-900-5676",
        tenantName: rental.tenant_name || "Penyewa KOSMO",
        tenantEmail: rental.tenant_email || "",
        tenantPhone: rental.tenant_phone || "",
        tenantNikPassport: rental.tenant_nik_passport || "-",
        tenantAddress: rental.tenant_address || "",
        tenantOccupation: rental.tenant_occupation || "",
        emergencyContactName: rental.tenant_emergency_contact_name || "",
        emergencyContactPhone: rental.tenant_emergency_contact_phone || "",
        emergencyContactRelation: rental.tenant_emergency_contact_relation || "",
        startDate: rental.rental_start_date || (/* @__PURE__ */ new Date()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }),
        durationMonths: contractDuration,
        monthlyPrice: contractMonthlyPrice,
        pricePerMonth: contractMonthlyPrice,
        totalPrice: contractTotalPrice,
        adminFee: contractAdminFee,
        signatureBase64: rental.tenant_signature_data || void 0,
        signerIp: rental.signer_ip || void 0,
        signerUserAgent: rental.signer_user_agent || void 0,
        signedAt: rental.contract_signed_at ? new Date(rental.contract_signed_at).toISOString() : void 0,
        utilityQuotas: {
          electricityKwh: 200,
          water: "PDAM & Deep Well (Air Bersih Terfilter) Included",
          wifiMbps: 100,
          security: "24/7 CCTV & Security Access",
          waste: "Daily Waste Management Included"
        }
      };
      const pdfBuffer = await generateRentalContractBuffer(contractData);
      const computedHash = computeContractHash(pdfBuffer);
      const contractHash = rental.contract_hash || computedHash;
      const safeId = sanitizeRentalId(rental.rental_id);
      const isDownload = req.query.download === "true" || req.query.download === "1";
      const dispositionType = isDownload ? "attachment" : "inline";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${dispositionType}; filename="kontrak_sewa_${safeId}.pdf"`);
      res.setHeader("X-Contract-Hash", contractHash);
      res.setHeader("Content-Length", pdfBuffer.length.toString());
      res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.end(pdfBuffer);
    } catch (err) {
      console.error("Get contract PDF error:", err);
      res.status(500).json({ message: "Gagal membuat dokumen kontrak PDF." });
    }
  }
);
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
  const calculatedHash = crypto3.createHash("sha512").update(payload).digest("hex").toLowerCase();
  const targetSig = signatureKey.toLowerCase();
  const calculatedBuffer = Buffer.from(calculatedHash, "utf8");
  const targetBuffer = Buffer.from(targetSig, "utf8");
  if (calculatedBuffer.length !== targetBuffer.length) {
    return false;
  }
  return crypto3.timingSafeEqual(calculatedBuffer, targetBuffer);
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
    const customRentalId = req.body.rentalId;
    let activeRentalsQuery = "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active'";
    const queryParams = [tenantId];
    if (customRentalId && typeof customRentalId === "string" && customRentalId.trim() !== "") {
      activeRentalsQuery += " AND id != ?";
      queryParams.push(customRentalId.trim());
    }
    activeRentalsQuery += " LIMIT 1";
    const [activeRentals] = await pool.query(activeRentalsQuery, queryParams);
    if (activeRentals.length > 0) {
      return res.status(409).json({
        message: "Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru."
      });
    }
    const rentalId = customRentalId && typeof customRentalId === "string" && customRentalId.trim() !== "" ? customRentalId.trim() : generateId("rent");
    const startDate = (/* @__PURE__ */ new Date()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    const monthlyRent = Number(property.price);
    const adminFee = 5e3;
    const totalAmount = monthlyRent * duration + adminFee;
    const [existingRental] = await pool.query("SELECT id FROM rentals WHERE id = ?", [rentalId]);
    if (existingRental.length === 0) {
      await pool.query(
        `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, admin_fee_amount, duration_months) 
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [rentalId, tenantId, propertyId, property.name, monthlyRent, startDate, adminFee, duration]
      );
    }
    const attemptOrderId = `${rentalId}-${Date.now()}`;
    const parameter = {
      transaction_details: {
        order_id: attemptOrderId,
        gross_amount: totalAmount
      },
      customer_details: {
        first_name: tenant.name,
        email: tenant.email,
        phone: tenant.phone || ""
      },
      item_details: [
        {
          id: property.id,
          price: monthlyRent,
          quantity: duration,
          name: property.name.substring(0, 50)
        },
        {
          id: "ADMIN_FEE",
          price: adminFee,
          quantity: 1,
          name: "Biaya Administrasi & Meterai"
        }
      ],
      custom_field1: rentalId
    };
    let transactionToken = `snap-token-${rentalId}`;
    let redirectUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${rentalId}`;
    if (process.env.MIDTRANS_SERVER_KEY && !process.env.MIDTRANS_SERVER_KEY.includes("your-server-key") && !process.env.MIDTRANS_SERVER_KEY.includes("placeholder")) {
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
  } catch (err) {
    console.error("Create payment token error:", err);
    res.status(500).json({ message: "Gagal membuat token pembayaran Midtrans." });
  }
});
async function settleRentalPayment(orderIdOrRentalId, paidAmount) {
  let targetRentalId = orderIdOrRentalId.trim();
  const rentMatch = targetRentalId.match(/^(rent-[a-zA-Z0-9]+)(?:-\d+)?$/);
  if (rentMatch && rentMatch[1]) {
    targetRentalId = rentMatch[1];
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rentalRows] = await connection.query(
      "SELECT * FROM rentals WHERE id = ? OR id = ? FOR UPDATE",
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
      rental.admin_fee_amount !== void 0 && rental.admin_fee_amount !== null ? rental.admin_fee_amount : 5e3
    );
    const expectedWithAdmin = monthlyPrice * durationMonths + adminFee;
    const expectedBase = monthlyPrice * durationMonths;
    if (paidAmount !== void 0 && !isNaN(paidAmount)) {
      const isPriceMatch = Math.abs(paidAmount - expectedWithAdmin) <= 1 || Math.abs(paidAmount - expectedBase) <= 1 || Math.abs(paidAmount - monthlyPrice) <= 1;
      if (!isPriceMatch) {
        await connection.rollback();
        console.error(`Midtrans gross_amount mismatch: expected ${expectedWithAdmin} or ${expectedBase}, got ${paidAmount}`);
        return { success: false, statusCode: 400, message: "Jumlah nominal pembayaran tidak sesuai dengan harga sewa." };
      }
    }
    if (rental.status !== "active") {
      const [propRows] = await connection.query(
        "SELECT totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ? FOR UPDATE",
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
        "UPDATE properties SET occupiedRooms = LEAST(totalRooms, occupiedRooms + 1) WHERE id = ?",
        [rental.propertyId]
      );
      if (property && property.ownerId) {
        const totalRentalRevenue = monthlyPrice * durationMonths;
        await connection.query(
          "UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?",
          [totalRentalRevenue, totalRentalRevenue, property.ownerId]
        );
      }
    }
    await connection.commit();
    apiCache.invalidatePattern("properties");
    apiCache.invalidatePattern("rentals");
    return {
      success: true,
      statusCode: 200,
      message: "Pembayaran berhasil diproses dan status rental diaktifkan.",
      rental: { ...rental, status: "active" }
    };
  } catch (err) {
    await connection.rollback();
    console.error("Settle rental payment error:", err);
    return { success: false, statusCode: 500, message: "Gagal memproses transaksi sewa." };
  } finally {
    connection.release();
  }
}
var handlePaymentNotification = async (req, res) => {
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
    const paidAmount = parseFloat(gross_amount);
    const result = await settleRentalPayment(order_id, isNaN(paidAmount) ? void 0 : paidAmount);
    return res.status(result.statusCode || (result.success ? 200 : 400)).json({ message: result.message });
  }
  if (transaction_status === "cancel" || transaction_status === "deny" || transaction_status === "expire") {
    try {
      let targetRentalId = order_id.trim();
      const rentMatch = targetRentalId.match(/^(rent-[a-zA-Z0-9]+)(?:-\d+)?$/);
      if (rentMatch && rentMatch[1]) {
        targetRentalId = rentMatch[1];
      }
      await pool.query("UPDATE rentals SET status = 'cancelled' WHERE (id = ? OR id = ?) AND status = 'pending'", [targetRentalId, order_id.trim()]);
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("rentals");
      return res.json({ message: `Status transaksi dibatalkan (${transaction_status}).` });
    } catch (err) {
      console.error("Cancel rental error:", err);
      return res.status(500).json({ message: "Gagal memperbarui status transaksi." });
    }
  }
  res.json({ message: "Status notifikasi diterima." });
};
router.post("/payment/webhook", handlePaymentNotification);
router.post("/payment/notification", handlePaymentNotification);
router.post("/payment/finish", authenticateToken, async (req, res) => {
  const { rentalId } = req.body;
  const authUser = req.user;
  if (!rentalId || typeof rentalId !== "string" || rentalId.trim() === "") {
    return res.status(400).json({ success: false, message: "rentalId wajib diisi." });
  }
  try {
    const [rows] = await pool.query("SELECT * FROM rentals WHERE id = ?", [rentalId.trim()]);
    const rental = rows[0];
    if (!rental) {
      return res.status(404).json({ success: false, message: "Data sewa tidak ditemukan." });
    }
    if (authUser?.role !== "admin" && authUser?.id !== rental.tenantId) {
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
  } catch (err) {
    console.error("Payment finish route error:", err);
    return res.status(500).json({ success: false, message: "Gagal menyelesaikan transaksi pembayaran." });
  }
});
var router_default = router;

// backend/server.ts
import path4 from "path";
import fs3 from "fs";
import { fileURLToPath } from "url";
import os from "os";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path4.dirname(__filename);
var uploadsDir = process.env.VERCEL ? path4.join(os.tmpdir(), "kosmo_uploads") : path4.join(__dirname, "uploads");
try {
  if (!fs3.existsSync(uploadsDir)) {
    fs3.mkdirSync(uploadsDir, { recursive: true });
  }
} catch {
}
var app = express2();
var PORT = parseInt(process.env.PORT || "5000", 10);
app.use(compression());
function isOriginAllowed(origin) {
  if (!origin) return true;
  const envAllowed = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  const defaultAllowed = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5000",
    "https://kosmobali.my.id",
    "https://www.kosmobali.my.id",
    "http://kosmobali.my.id",
    "http://www.kosmobali.my.id"
  ];
  const allowedOrigins = [...defaultAllowed, ...envAllowed];
  const normalizedOrigin = origin.toLowerCase().replace(/\/$/, "");
  const isExactMatch = allowedOrigins.some((allowed) => {
    const normalizedAllowed = allowed.toLowerCase().replace(/\/$/, "");
    if (normalizedAllowed === "*" && process.env.NODE_ENV !== "production") return true;
    return normalizedAllowed === normalizedOrigin;
  });
  if (isExactMatch) return true;
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "kosmobali.my.id" || hostname.endsWith(".kosmobali.my.id") || hostname.endsWith(".vercel.app")) {
      return true;
    }
  } catch {
  }
  return false;
}
var corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS Blocked] Origin '${origin}' is not allowed.`);
      callback(null, false);
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  credentials: true,
  maxAge: 86400
};
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.urlencoded({ limit: "5mb", extended: true }));
app.use(morgan("dev"));
app.use("/uploads", express2.static(uploadsDir));
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api") && req.path !== "/api/health") {
    try {
      await ensureDbReady();
    } catch (error) {
      console.error("Database readiness check failed in middleware:", error);
      return res.status(500).json({
        error: "Database connection failed",
        message: "Unable to reach database cluster"
      });
    }
  }
  next();
});
app.use("/api", router_default);
app.use((err, _req, res, _next) => {
  console.error("Unhandled API Error:", err);
  res.status(500).json({ message: "Internal Server Error", error: "Internal Server Error" });
});
if (!process.env.VERCEL && process.env.NODE_ENV !== "test" && process.env.NO_LISTEN !== "true") {
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
