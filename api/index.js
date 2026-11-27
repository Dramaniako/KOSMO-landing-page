// backend/server.ts
import express2 from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

// backend/db.ts
import mysql from "mysql2/promise";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
function parseEnvValue(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(['"])(.*)\1$/);
  return match ? match[2] : trimmed;
}
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
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx <= 0) return;
        const key = trimmed.slice(0, eqIdx).trim();
        const rawVal = trimmed.slice(eqIdx + 1);
        if (key && !process.env[key]) {
          process.env[key] = parseEnvValue(rawVal);
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
  rejectUnauthorized: true
};
var dbConfig = {
  host,
  port: parseInt(process.env.DB_PORT || (isTiDB ? "4000" : "3306"), 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "kosmo_db",
  ...sslOption ? { ssl: sslOption } : {},
  connectTimeout: 5e3,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || "5", 10),
  maxIdle: 5,
  idleTimeout: 6e4,
  enableKeepAlive: true,
  keepAliveInitialDelay: 1e4,
  queueLimit: 0
};
function validateDatabaseConfig(config) {
  const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const host2 = String(config.host || "localhost").toLowerCase();
  const isLocalhost = host2 === "localhost" || host2 === "127.0.0.1" || host2.startsWith("192.168.");
  const isRemoteHost = !isLocalhost;
  const user = String(config.user || "").trim();
  const password = String(config.password || "").trim();
  const isPlaceholderPassword = password === "your_database_password" || password.includes("your_password") || password === "placeholder";
  const isPlaceholderUser = user === "your_db_user" || user.includes("your_db_user") || user === "placeholder";
  if (isProduction || isRemoteHost) {
    if (!user || isPlaceholderUser) {
      throw new Error(`[Database Security] Insecure database configuration: DB_USER is required and cannot be empty or placeholder for host "${host2}".`);
    }
    if (!password || isPlaceholderPassword) {
      throw new Error(`[Database Security] Insecure database configuration: DB_PASSWORD is required and cannot be empty or placeholder in production or remote environments (host: "${host2}").`);
    }
  }
}
function getPool() {
  if (!globalThis.__kosmo_tidb_pool) {
    validateDatabaseConfig(dbConfig);
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const poolInstance = mysql.createPool({
      ...dbConfig,
      connectionLimit: isServerless ? 5 : parseInt(process.env.DB_CONNECTION_LIMIT || "5", 10),
      connectTimeout: 5e3,
      waitForConnections: true,
      maxIdle: isServerless ? 2 : 5,
      idleTimeout: isServerless ? 1e4 : 6e4,
      queueLimit: 0
    });
    const rawPool = poolInstance?.pool;
    rawPool?.on?.("error", (err) => {
      console.error("MySQL/TiDB Pool Error Event:", err?.message || err);
      const code = err?.code;
      if (code === "PROTOCOL_CONNECTION_LOST" || code === "ECONNRESET") {
        globalThis.__kosmo_tidb_pool = void 0;
      }
    });
    globalThis.__kosmo_tidb_pool = poolInstance;
  }
  return globalThis.__kosmo_tidb_pool;
}
var pool = getPool();
var initPromise = null;
var isInitialized = false;
async function ensureDbReady() {
  if (isInitialized) return;
  await initDb();
}
var SCHEMA_MIGRATION_VERSION = 2;
async function ensureIndexes(executor = pool) {
  if (process.env.VERCEL) return;
  const indexStatements = [
    "ALTER TABLE properties ADD INDEX idx_properties_district_price (district, price)",
    "ALTER TABLE properties ADD INDEX idx_properties_owner (ownerId)",
    "ALTER TABLE properties ADD INDEX idx_properties_featured (is_featured)",
    "ALTER TABLE properties ADD INDEX idx_properties_featured_until_id (is_featured, featured_until, id)",
    "ALTER TABLE properties ADD INDEX idx_properties_district_badges_price (district, verified_water_tank, verified_wifi_speedtest, price)",
    // ⚡ Bolt Performance Optimization:
    // Added index on property_facilities.propertyId to optimize the GROUP_CONCAT join query in GET /api/properties.
    // Why: property_facilities is frequently joined by propertyId, causing slow full table scans as the table grows.
    // Impact: Significantly reduces query execution time (O(n) -> O(log n)) when filtering or fetching properties with facilities.
    "ALTER TABLE property_facilities ADD INDEX idx_property_facilities_property (propertyId)",
    "ALTER TABLE property_facilities ADD INDEX idx_pf_facility_property (facility, propertyId)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_tenant_status (tenantId, status)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_property_status (propertyId, status)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_prop_status_start (propertyId, status, start_date_iso)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_room (roomId)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_contract_hash (contract_hash)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_signed_at (contract_signed_at)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_terminated_at (terminated_at)",
    "ALTER TABLE rooms ADD INDEX idx_rooms_property_status (propertyId, status)",
    "ALTER TABLE rooms ADD INDEX idx_rooms_prop_status_reserved (propertyId, status, reserved_until)",
    "ALTER TABLE rooms ADD INDEX idx_rooms_prop_floor (propertyId, floor)",
    "ALTER TABLE rooms ADD INDEX idx_rooms_status (status)",
    "ALTER TABLE property_photos ADD INDEX idx_photos_property (propertyId, orderIndex)",
    "ALTER TABLE property_photos ADD INDEX idx_photos_room (roomId, orderIndex)",
    "ALTER TABLE property_photos ADD INDEX idx_photos_category (category)",
    "ALTER TABLE property_photos ADD INDEX idx_photos_prop_cat (propertyId, category, orderIndex)",
    "ALTER TABLE property_photos ADD INDEX idx_photos_prop_room (propertyId, roomId, orderIndex)",
    "ALTER TABLE visitor_tracking ADD INDEX idx_visited_at (visited_at)",
    "ALTER TABLE visitor_tracking ADD INDEX idx_visitor_tracking_ip_time (ip_address, visited_at)",
    "ALTER TABLE withdrawals ADD INDEX idx_withdrawals_user_date (userId, date)",
    "ALTER TABLE withdrawals ADD INDEX idx_withdrawals_user_status (userId, status)",
    "ALTER TABLE withdrawals ADD INDEX idx_withdrawals_user_created (userId, created_at)",
    "ALTER TABLE withdrawals ADD INDEX idx_withdrawals_status (status)",
    "ALTER TABLE users ADD INDEX idx_users_role (role)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_status (status)",
    "ALTER TABLE reviews ADD INDEX idx_reviews_property (propertyId)",
    "ALTER TABLE reviews ADD INDEX idx_reviews_user (userId)",
    "ALTER TABLE reviews ADD INDEX idx_reviews_prop_user (propertyId, userId)",
    "ALTER TABLE maintenance_tickets ADD INDEX idx_tickets_tenant (tenantId)",
    "ALTER TABLE maintenance_tickets ADD INDEX idx_tickets_property (propertyId)",
    "ALTER TABLE maintenance_tickets ADD INDEX idx_tickets_status (status)",
    "ALTER TABLE maintenance_tickets ADD INDEX idx_tickets_prop_status_created (propertyId, status, createdAt)",
    "ALTER TABLE maintenance_tickets ADD INDEX idx_tickets_tenant_status_created (tenantId, status, createdAt)",
    "ALTER TABLE payment_transactions ADD INDEX idx_payment_tx_rental_status (rental_id, status)"
  ];
  await Promise.allSettled(
    indexStatements.map(async (sql) => {
      try {
        await executor.query(sql);
      } catch {
      }
    })
  );
}
async function createTables(executor = pool) {
  await Promise.all([
    executor.query(`
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
        gender VARCHAR(20) DEFAULT '',
        INDEX idx_users_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `),
    executor.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `),
    executor.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        order_id VARCHAR(100) PRIMARY KEY,
        rental_id VARCHAR(50) NOT NULL,
        tx_type ENUM('initial', 'renewal') NOT NULL DEFAULT 'initial',
        gross_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        months INT NOT NULL DEFAULT 1,
        status ENUM('pending', 'settled', 'cancelled', 'refund_required') NOT NULL DEFAULT 'pending',
        settled_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_payment_tx_rental_status (rental_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `),
    executor.query(`
      CREATE TABLE IF NOT EXISTS visitor_tracking (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(255),
        user_agent TEXT,
        visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_visited_at (visited_at),
        INDEX idx_visitor_tracking_ip_time (ip_address, visited_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
  ]);
  await Promise.all([
    executor.query(`
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
        is_featured BOOLEAN DEFAULT FALSE,
        featured_until DATETIME NULL,
        verified_water_tank BOOLEAN DEFAULT FALSE,
        verified_wifi_speedtest BOOLEAN DEFAULT FALSE,
        INDEX idx_properties_district_price (district, price),
        INDEX idx_properties_owner (ownerId),
        INDEX idx_properties_featured (is_featured),
        FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `),
    executor.query(`
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_withdrawals_user_date (userId, date),
        INDEX idx_withdrawals_user_status (userId, status),
        INDEX idx_withdrawals_user_created (userId, created_at),
        INDEX idx_withdrawals_status (status),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
  ]);
  await Promise.all([
    executor.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id VARCHAR(50) PRIMARY KEY,
        propertyId VARCHAR(50) NOT NULL,
        roomNumber VARCHAR(20) NOT NULL,
        floor INT NOT NULL DEFAULT 1,
        type VARCHAR(50) NOT NULL DEFAULT 'Standard',
        price INT NULL,
        status ENUM('available', 'occupied', 'maintenance') NOT NULL DEFAULT 'available',
        reserved_until DATETIME NULL,
        reserved_by_rental_id VARCHAR(50) NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_property_room_number (propertyId, roomNumber),
        INDEX idx_rooms_property_status (propertyId, status),
        INDEX idx_rooms_prop_status_reserved (propertyId, status, reserved_until),
        INDEX idx_rooms_prop_floor (propertyId, floor),
        INDEX idx_rooms_status (status),
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `),
    executor.query(`
      CREATE TABLE IF NOT EXISTS property_facilities (
        propertyId VARCHAR(50),
        facility VARCHAR(50),
        PRIMARY KEY (propertyId, facility),
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `),
    executor.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id VARCHAR(50) PRIMARY KEY,
        propertyId VARCHAR(50) NOT NULL,
        propertyName VARCHAR(100) NOT NULL,
        userId VARCHAR(50) NOT NULL,
        userName VARCHAR(100) NOT NULL,
        rating INT NOT NULL,
        comment TEXT NOT NULL,
        date VARCHAR(50) NOT NULL,
        INDEX idx_reviews_property (propertyId),
        INDEX idx_reviews_user (userId),
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `),
    executor.query(`
      CREATE TABLE IF NOT EXISTS rentals (
        id VARCHAR(50) PRIMARY KEY,
        tenantId VARCHAR(50) NOT NULL,
        propertyId VARCHAR(50) NOT NULL,
        propertyName VARCHAR(100) NOT NULL,
        roomId VARCHAR(50),
        price INT NOT NULL,
        startDate VARCHAR(50) NOT NULL,
        start_date_iso DATE NULL,
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
        terminated_at DATETIME NULL,
        INDEX idx_rentals_tenant_status (tenantId, status),
        INDEX idx_rentals_property_status (propertyId, status),
        INDEX idx_rentals_room (roomId),
        INDEX idx_rentals_contract_hash (contract_hash),
        INDEX idx_rentals_signed_at (contract_signed_at),
        INDEX idx_rentals_terminated_at (terminated_at),
        INDEX idx_rentals_status (status),
        FOREIGN KEY (tenantId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
  ]);
  await Promise.all([
    executor.query(`
      CREATE TABLE IF NOT EXISTS property_photos (
        id VARCHAR(50) PRIMARY KEY,
        propertyId VARCHAR(50) NOT NULL,
        roomId VARCHAR(50) NULL,
        url VARCHAR(500) NOT NULL,
        publicId VARCHAR(255) NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'other',
        caption VARCHAR(255) DEFAULT '',
        orderIndex INT NOT NULL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_photos_property (propertyId, orderIndex),
        INDEX idx_photos_room (roomId, orderIndex),
        INDEX idx_photos_category (category),
        INDEX idx_photos_prop_cat (propertyId, category, orderIndex),
        INDEX idx_photos_prop_room (propertyId, roomId, orderIndex),
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `),
    executor.query(`
      CREATE TABLE IF NOT EXISTS maintenance_tickets (
        id VARCHAR(50) PRIMARY KEY,
        rentalId VARCHAR(50) NOT NULL,
        tenantId VARCHAR(50) NOT NULL,
        propertyId VARCHAR(50) NOT NULL,
        roomId VARCHAR(50) NULL,
        category ENUM('ac', 'plumbing', 'wifi', 'electricity', 'cleaning', 'other') NOT NULL,
        title VARCHAR(150) NOT NULL,
        description TEXT NOT NULL,
        photoUrl VARCHAR(500) NULL,
        status ENUM('open', 'in_progress', 'resolved', 'cancelled') NOT NULL DEFAULT 'open',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        resolvedAt DATETIME NULL,
        INDEX idx_tickets_tenant (tenantId),
        INDEX idx_tickets_property (propertyId),
        INDEX idx_tickets_status (status),
        FOREIGN KEY (tenantId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
  ]);
}
async function syncPropertyRoomCounts(executor, propertyId) {
  const [rows] = await executor.query(
    `SELECT 
       COUNT(*) as total,
       COALESCE(SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END), 0) as occupied
     FROM rooms 
     WHERE propertyId = ?`,
    [propertyId]
  );
  const totalRooms = Number(rows[0]?.total || 0);
  const occupiedRooms = Number(rows[0]?.occupied || 0);
  await executor.query(
    "UPDATE properties SET totalRooms = ?, occupiedRooms = ? WHERE id = ?",
    [totalRooms, occupiedRooms, propertyId]
  );
  return { totalRooms, occupiedRooms };
}
async function backfillDiscreteRooms(executor = pool) {
  const [properties] = await executor.query(
    "SELECT id, name, totalRooms, occupiedRooms, price, image FROM properties ORDER BY id ASC"
  );
  for (const prop of properties) {
    const propId = String(prop.id);
    const total = Number(prop.totalRooms || 0);
    const occupied = Math.max(0, Math.min(total, Number(prop.occupiedRooms || 0)));
    if (total <= 0) continue;
    const [existingRooms] = await executor.query(
      "SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?",
      [propId]
    );
    const roomCount = Number(existingRooms[0]?.count || 0);
    if (roomCount === 0) {
      for (let i = 1; i <= total; i++) {
        const floor = Math.floor((i - 1) / 10) + 1;
        const roomIndex = (i - 1) % 10 + 1;
        const roomNumber = `${floor}${String(roomIndex).padStart(2, "0")}`;
        const rawId = `room-${propId}-${roomNumber}`;
        const roomId = rawId.length <= 50 ? rawId : `rm-${crypto.createHash("md5").update(`${propId}-${roomNumber}`).digest("hex").slice(0, 24)}`;
        const status = i <= occupied ? "occupied" : "available";
        const type = i % 2 === 0 ? "Deluxe" : "Standard";
        await executor.query(
          `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status)
           VALUES (?, ?, ?, ?, ?, NULL, ?)
           ON DUPLICATE KEY UPDATE id = id`,
          [roomId, propId, roomNumber, floor, type, status]
        );
      }
    }
    const imageUrl = typeof prop.image === "string" ? prop.image.trim() : "";
    if (imageUrl.length > 0) {
      const [existingPhotos] = await executor.query(
        "SELECT COUNT(*) as count FROM property_photos WHERE propertyId = ?",
        [propId]
      );
      const photoCount = Number(existingPhotos[0]?.count || 0);
      if (photoCount === 0) {
        const rawPhotoId = `photo-${propId}-thumb`;
        const photoId = rawPhotoId.length <= 50 ? rawPhotoId : `ph-${crypto.createHash("md5").update(`${propId}-thumb`).digest("hex").slice(0, 24)}`;
        const safeUrl = imageUrl.slice(0, 500);
        await executor.query(
          `INSERT INTO property_photos (id, propertyId, roomId, url, category, caption, orderIndex)
           VALUES (?, ?, NULL, ?, 'thumbnail', 'Foto Utama Properti', 0)
           ON DUPLICATE KEY UPDATE url = VALUES(url)`,
          [photoId, propId, safeUrl]
        );
      }
    }
  }
  const [unlinkedRentals] = await executor.query(
    `SELECT id, propertyId FROM rentals 
     WHERE (roomId IS NULL OR roomId = '') AND status = 'active'
     ORDER BY id ASC`
  );
  for (const rental of unlinkedRentals) {
    const rentalId = String(rental.id);
    const propertyId = String(rental.propertyId);
    const [candidateRooms] = await executor.query(
      `SELECT r.id FROM rooms r
       LEFT JOIN rentals ren ON r.id = ren.roomId AND ren.status = 'active'
       WHERE r.propertyId = ? AND r.status = 'occupied' AND ren.id IS NULL
       ORDER BY r.floor ASC, r.roomNumber ASC
       LIMIT 1`,
      [propertyId]
    );
    let targetRoomId = candidateRooms[0]?.id ? String(candidateRooms[0].id) : null;
    if (!targetRoomId) {
      const [fallbackRooms] = await executor.query(
        `SELECT r.id FROM rooms r
         LEFT JOIN rentals ren ON r.id = ren.roomId AND ren.status = 'active'
         WHERE r.propertyId = ? AND r.status = 'available' AND ren.id IS NULL
         ORDER BY r.floor ASC, r.roomNumber ASC
         LIMIT 1`,
        [propertyId]
      );
      if (fallbackRooms.length > 0 && fallbackRooms[0]?.id) {
        targetRoomId = String(fallbackRooms[0].id);
        await executor.query(
          "UPDATE rooms SET status = 'occupied' WHERE id = ?",
          [targetRoomId]
        );
      }
    }
    if (targetRoomId) {
      await executor.query(
        "UPDATE rentals SET roomId = ? WHERE id = ?",
        [targetRoomId, rentalId]
      );
    }
  }
  await executor.query(
    `UPDATE rooms r
     JOIN rentals ren ON r.id = ren.roomId
     SET r.status = 'occupied'
     WHERE ren.status = 'active' AND r.status != 'occupied'`
  );
  for (const prop of properties) {
    await syncPropertyRoomCounts(executor, String(prop.id));
  }
}
async function applyMigrations(executor = pool) {
  const runTableQueries = async (queries) => {
    for (const sql of queries) {
      try {
        await executor.query(sql);
      } catch {
      }
    }
  };
  try {
    await executor.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id VARCHAR(50) PRIMARY KEY,
        propertyId VARCHAR(50) NOT NULL,
        roomNumber VARCHAR(20) NOT NULL,
        floor INT NOT NULL DEFAULT 1,
        type VARCHAR(50) NOT NULL DEFAULT 'Standard',
        price INT NULL,
        status ENUM('available', 'occupied', 'maintenance') NOT NULL DEFAULT 'available',
        reserved_until DATETIME NULL,
        reserved_by_rental_id VARCHAR(50) NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_property_room_number (propertyId, roomNumber),
        INDEX idx_rooms_property_status (propertyId, status),
        INDEX idx_rooms_prop_status_reserved (propertyId, status, reserved_until),
        INDEX idx_rooms_prop_floor (propertyId, floor),
        INDEX idx_rooms_status (status),
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await executor.query(`
      CREATE TABLE IF NOT EXISTS property_photos (
        id VARCHAR(50) PRIMARY KEY,
        propertyId VARCHAR(50) NOT NULL,
        roomId VARCHAR(50) NULL,
        url VARCHAR(500) NOT NULL,
        publicId VARCHAR(255) NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'other',
        caption VARCHAR(255) DEFAULT '',
        orderIndex INT NOT NULL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_photos_property (propertyId, orderIndex),
        INDEX idx_photos_room (roomId, orderIndex),
        INDEX idx_photos_category (category),
        INDEX idx_photos_prop_cat (propertyId, category, orderIndex),
        INDEX idx_photos_prop_room (propertyId, roomId, orderIndex),
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await executor.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await executor.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        order_id VARCHAR(100) PRIMARY KEY,
        rental_id VARCHAR(50) NOT NULL,
        tx_type ENUM('initial', 'renewal') NOT NULL DEFAULT 'initial',
        gross_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        months INT NOT NULL DEFAULT 1,
        status ENUM('pending', 'settled', 'cancelled', 'refund_required') NOT NULL DEFAULT 'pending',
        settled_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_payment_tx_rental_status (rental_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await executor.query(`
      CREATE TABLE IF NOT EXISTS maintenance_tickets (
        id VARCHAR(50) PRIMARY KEY,
        rentalId VARCHAR(50) NOT NULL,
        tenantId VARCHAR(50) NOT NULL,
        propertyId VARCHAR(50) NOT NULL,
        roomId VARCHAR(50) NULL,
        category ENUM('ac', 'plumbing', 'wifi', 'electricity', 'cleaning', 'other') NOT NULL,
        title VARCHAR(150) NOT NULL,
        description TEXT NOT NULL,
        photoUrl VARCHAR(500) NULL,
        status ENUM('open', 'in_progress', 'resolved', 'cancelled') NOT NULL DEFAULT 'open',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        resolvedAt DATETIME NULL,
        INDEX idx_tickets_tenant (tenantId),
        INDEX idx_tickets_property (propertyId),
        INDEX idx_tickets_status (status),
        FOREIGN KEY (tenantId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch {
  }
  const propertiesQueries = [
    "ALTER TABLE properties MODIFY image LONGTEXT",
    "ALTER TABLE properties MODIFY description LONGTEXT",
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE",
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS featured_until DATETIME NULL",
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS verified_water_tank BOOLEAN DEFAULT FALSE",
    "ALTER TABLE properties ADD COLUMN IF NOT EXISTS verified_wifi_speedtest BOOLEAN DEFAULT FALSE"
  ];
  const usersQueries = [
    "ALTER TABLE users MODIFY avatar LONGTEXT",
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
  const visitorTrackingQueries = [
    "ALTER TABLE visitor_tracking MODIFY ip_address VARCHAR(255)",
    "ALTER TABLE visitor_tracking MODIFY user_agent TEXT"
  ];
  const withdrawalsQueries = [
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS accountHolder VARCHAR(100) DEFAULT ''",
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS referenceId VARCHAR(100) DEFAULT ''",
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS rejectionReason TEXT",
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS processedAt VARCHAR(50) DEFAULT ''",
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT CURRENT_TIMESTAMP"
  ];
  const roomsQueries = [
    "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS reserved_until DATETIME NULL",
    "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS reserved_by_rental_id VARCHAR(50) NULL"
  ];
  const rentalsQueries = [
    "ALTER TABLE rentals MODIFY status ENUM('pending','active','completed','terminated','cancelled') DEFAULT 'pending'",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_url VARCHAR(500)",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_hash VARCHAR(64)",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_signed_at DATETIME",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS signer_ip VARCHAR(50)",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS signer_user_agent VARCHAR(255)",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS tenant_nik_passport VARCHAR(50)",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS tenant_signature_data LONGTEXT",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS admin_fee_amount DECIMAL(10,2) DEFAULT 5000.00",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS duration_months INT DEFAULT 1",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS roomId VARCHAR(50)",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS terminated_at DATETIME NULL",
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS start_date_iso DATE NULL",
    "UPDATE rentals SET start_date_iso = STR_TO_DATE(startDate, '%Y-%m-%d') WHERE start_date_iso IS NULL AND startDate REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'"
  ];
  const photosQueries = [
    "ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  ];
  await Promise.all([
    runTableQueries(propertiesQueries),
    runTableQueries(usersQueries),
    runTableQueries(visitorTrackingQueries),
    runTableQueries(withdrawalsQueries),
    runTableQueries(roomsQueries),
    runTableQueries(rentalsQueries),
    runTableQueries(photosQueries)
  ]);
  await ensureIndexes(executor);
  try {
    await backfillDiscreteRooms(executor);
  } catch (err) {
    console.warn("Initial backfillDiscreteRooms skipped or deferred:", err);
  }
  try {
    await executor.query(
      "INSERT INTO schema_migrations (version) VALUES (?) ON DUPLICATE KEY UPDATE applied_at = CURRENT_TIMESTAMP",
      [SCHEMA_MIGRATION_VERSION]
    );
  } catch {
  }
}
async function seedUsers(executor = pool) {
  const [userRows] = await executor.query("SELECT COUNT(*) as count FROM users");
  if (userRows[0].count === 0) {
    const [adminHash, landlordHash, tenantHash] = await Promise.all([
      bcrypt.hash("admin", 10),
      bcrypt.hash("landlord", 10),
      bcrypt.hash("tenant", 10)
    ]);
    await executor.query(`
      INSERT INTO users (
        id, email, password, name, role, phone, paymentMethod, avatar, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder,
        identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_relation, emergency_contact_phone
      )
      VALUES 
        ('user-admin', 'admin@kosmo.com', ?, 'Admin Super', 'admin', '+62 888-8888-8888', 'Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171010000000001', 'Kantor Pusat KOSMO Bali, Jimbaran', 'Platform Administrator', 'Support Center', 'Kantor', '+628888888888'),
        ('user-landlord', 'landlord@kosmo.com', ?, 'Admin Landlord', 'landlord', '+62 811-2233-4455', 'Virtual Account', NULL, 0.00, 0.00, 0.00, 'BCA', '1234567890', 'Admin Landlord', 'NIK', '5171012204850002', 'Jl. Raya Kampus Unud No. 88, Jimbaran, Badung, Bali', 'Pengelola Properti', 'Wayan Landlord', 'Keluarga', '+6281122334400'),
        ('user-tenant', 'tenant@kosmo.com', ?, 'Bayu', 'tenant', '+62 812-3456-7890', 'Kartu Kredit, Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171012308980001', 'Jl. Nuansa Utama No. 12, Jimbaran, Badung, Bali', 'Software Engineer', 'Made Wipradnyana', 'Orang Tua', '+6281234567899'),
        ('user-tenant-01', 'siska.pratiwi@gmail.com', ?, 'Siska Pratiwi', 'tenant', '+62 813-1122-3344', 'Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171015502990003', 'Jl. Danau Buyan No. 24, Jimbaran, Badung, Bali', 'Graphic Designer', 'Agus Pratiwi', 'Orang Tua', '+6281311223300'),
        ('user-tenant-02', 'andrew.k@gmail.com', ?, 'Andrew Kurniawan', 'tenant', '+62 819-3344-5566', 'Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171011806960004', 'Perumahan Taman Griya Blok D No. 5, Jimbaran, Badung, Bali', 'Financial Analyst', 'Budi Kurniawan', 'Keluarga', '+6281933445500'),
        ('user-tenant-03', 'michael.tan@gmail.com', ?, 'Michael Tan', 'tenant', '+62 812-9876-5432', 'Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171011409970005', 'Jl. Raya Kampus Unud No. 15, Jimbaran, Badung, Bali', 'Mahasiswa Universitas Udayana', 'Hendrik Tan', 'Orang Tua', '+6281298765400'),
        ('user-tenant-04', 'aditya.w@gmail.com', ?, 'Aditya Wicaksono', 'tenant', '+62 817-4567-8901', 'Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171012903950006', 'Jl. Goa Gong Gang Sandat No. 3, Jimbaran, Badung, Bali', 'Remote Product Designer', 'Bambang Wicaksono', 'Orang Tua', '+6281745678900'),
        ('user-tenant-05', 'ratna.dewi@gmail.com', ?, 'Ratna Dewi', 'tenant', '+62 813-7788-9900', 'Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171016207980007', 'Jl. Nuansa Kori Utama No. 8, Jimbaran, Badung, Bali', 'Architect', 'I Ketut Sudana', 'Keluarga', '+6281377889911'),
        ('user-tenant-06', 'sarah.jenkins@gmail.com', ?, 'Sarah Jenkins', 'tenant', '+62 812-4455-6677', 'Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'PASSPORT', 'A12894672', 'Jl. Goa Gong No. 19, Jimbaran, Badung, Bali', 'Travel Blogger & Freelancer', 'David Jenkins', 'Keluarga', '+6281244556600');
    `, [adminHash, landlordHash, tenantHash, tenantHash, tenantHash, tenantHash, tenantHash, tenantHash, tenantHash]);
    await executor.query(`
      INSERT INTO withdrawals (id, userId, bankName, accountNumber, amount, date, status)
      VALUES ('w-01', 'user-landlord', 'BCA', '1234567890', 1000000.0, '3 Jun 2026', 'completed');
    `);
  } else {
    const [existing] = await executor.query("SELECT id, password FROM users");
    const updatePromises = [];
    for (const u of existing) {
      if (u.password) {
        const isHashed = u.password.startsWith("$2a$") || u.password.startsWith("$2b$") || u.password.startsWith("$2y$");
        if (!isHashed) {
          const hashed = await bcrypt.hash(u.password, 10);
          updatePromises.push(executor.query("UPDATE users SET password = ? WHERE id = ?", [hashed, u.id]));
        }
      }
    }
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }
  }
}
async function seedPropertiesAndFacilities(executor = pool) {
  const [propRows] = await executor.query("SELECT COUNT(*) as count FROM properties");
  if (propRows[0].count === 0) {
    await executor.query(`
      INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document)
      VALUES 
        ('prop-01', 'Cove Nuansa Home Jimbaran', 'Badung', 'Jl. Nuansa Utama Perum Kori Nuansa II No. 9, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361', 4150000, 4.8, 'https://media.coveliving.io/97696/conversions/Cove-Nuansa-Home_Deluxe-Room-with-Mezzanine-LTS(1)-medium.jpg', 'Co-living modern dan tenang di kawasan residential Kori Nuansa Jimbaran. Hanya 8 menit ke Kampus Universitas Udayana (UNUD) Bukit dan Sidewalk Jimbaran. Dilengkapi kamar mezzanine full furnished, smart lock, AC, WiFi dedicated fiber 100 Mbps, dapur bersama, dan rooftop lounge santai.', '-8.7895', '115.1762', 10, 0, 'user-landlord', 'sertifikat_shm_cove_nuansa.pdf'),
        ('prop-02', 'Kawaii Home Jimbaran', 'Badung', 'Jl. Parigata Gang VIII No. 12, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361', 5300000, 4.7, 'https://images.rukita.co/buildings/building/e3fea989-c2c.jpg', 'Coliving eksklusif dengan sentuhan desain minimalis modern di kawasan strategis Jimbaran. Berjarak hanya 1.5 km dari Universitas Udayana dan 10 menit ke Pantai Jimbaran. Kamar full furnished dengan Queen bed, AC, Smart TV, meja kerja ergonomis, water heater, dan layanan kebersihan kamar rutin.', '-8.7942', '115.1685', 8, 0, 'user-landlord', 'sertifikat_shm_kawaii_home.pdf'),
        ('prop-03', 'Jim''s Coliving Jimbaran', 'Badung', 'Jl. Uluwatu Gang Buanasari No. 88, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361', 3300000, 4.8, 'https://images.rukita.co/buildings/roomvariantphoto/photo/3521c071-be76-4996-8393-88e9b31fc33d.jpeg', 'Coliving favorit mahasiswa dan remote worker di koridor Jl. Uluwatu dan Kampus Unud Jimbaran. Dekat dengan Sidewalk Jimbaran, RS Udayana, dan Pantai Jimbaran. Unit Studio Queen ber-AC, kamar mandi dalam dengan water heater, WiFi kencang, parkir mobil/motor luas, dan dapur bersama.', '-8.7915', '115.1712', 12, 0, 'user-landlord', 'sertifikat_shm_jims_coliving.pdf'),
        ('prop-04', 'Mari Living Jimbaran', 'Badung', 'Gang Sandat No. 88, Jl. Goa Gong, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361', 2900000, 4.8, 'https://picture.rumah123.com/r123-images/720x420-crop/customer/1641111/listing/kss277817/enhanced/df746c60190d4d88cba1a4dc2830badb.jpg', 'Kost eksklusif modern hanya 5 menit dari Rektorat Universitas Udayana Jimbaran dan GWK. Kamar full furnished dengan kasur 160x200, Smart TV 43 inch, meja belajar/kerja, kamar mandi dalam water heater, kulkas bersama per lantai, dan rooftop komunal dengan pemandangan patung GWK.', '-8.7980', '115.1690', 8, 0, 'user-landlord', 'sertifikat_shm_mari_living.pdf'),
        ('prop-05', 'Villa Kori Nuansa Jimbaran', 'Badung', 'Jl. Nuansa Kori Utama Selatan No. 4, Taman Griya, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361', 4800000, 4.7, 'https://ik.imagekit.io/tvlk/apr-asset/dgXfoyh24ryQLRcGq00cIdKHRmotrWLNlvG-TxlcLxGkiDwaUSggleJNPRgIHCX6/hotel/asset/67737083-2880x2007-FIT_AND_TRIM-e28e81b4beba1539ef7cf13fbbae2300.jpeg', 'Hunian bergaya villa coliving asri dan privat di perumahan Taman Griya Jimbaran. Dilengkapi kolam renang outdoor, taman tropis, dapur komunal modern, kamar tidur luas ber-AC dengan kamar mandi pribadi, serta sistem keamanan lingkungan 24 jam.', '-8.7930', '115.1820', 6, 0, 'user-landlord', 'sertifikat_shm_kori_nuansa.pdf'),
        ('prop-06', 'Katsumata Residence Jimbaran', 'Badung', 'Jl. Raya Kampus Unud No. 45, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361', 3500000, 4.6, 'https://static.mamikos.com/uploads/cache/data/style/2025-08-22/njYasdIX-240x320.jpg', 'Kost modern di kawasan strategis Kampus Bukit Jimbaran, hanya 1.6 km dari Sidewalk Mall Jimbaran. Kamar dengan tempat tidur Queen, AC dingin, kamar mandi dalam dengan shower air panas, meja kursi belajar, internet cepat, dan keamanan CCTV 24 jam.', '-8.7960', '115.1740', 10, 0, 'user-landlord', 'sertifikat_shm_katsumata.pdf'),
        ('prop-07', 'DSTAY Kost Bali Jimbaran', 'Badung', 'Jl. Goa Gong No. 19, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361', 2400000, 4.6, 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/180467566.jpg?k=4da0fbd1923e0fc945f5414dbded7017b7cf03e298b8bc06999ffc55c874117a&o=', 'Kost tenang dan berhawa sejuk di kawasan perbukitan Jl. Goa Gong Jimbaran, hanya 5 menit ke kawasan wisata GWK dan 7 menit ke Kampus Bukit Unud. Fasilitas kamar ber-AC, kamar mandi dalam, akses WiFi lancar, taman hijau, dapur bersama, dan area parkir motor/mobil aman.', '-8.8050', '115.1660', 10, 0, 'user-landlord', 'sertifikat_shm_dstay_jimbaran.pdf');
    `);
    await executor.query(`
      INSERT INTO property_facilities (propertyId, facility)
      VALUES 
        ('prop-01', 'Listrik'), ('prop-01', 'Air'), ('prop-01', 'Wifi'), ('prop-01', 'Kebersihan'), ('prop-01', 'Keamanan'), ('prop-01', 'Parkir'),
        ('prop-02', 'Listrik'), ('prop-02', 'Air'), ('prop-02', 'Wifi'), ('prop-02', 'Kebersihan'), ('prop-02', 'Keamanan'), ('prop-02', 'Parkir'),
        ('prop-03', 'Listrik'), ('prop-03', 'Air'), ('prop-03', 'Wifi'), ('prop-03', 'Kebersihan'), ('prop-03', 'Keamanan'), ('prop-03', 'Parkir'),
        ('prop-04', 'Listrik'), ('prop-04', 'Air'), ('prop-04', 'Wifi'), ('prop-04', 'Kebersihan'), ('prop-04', 'Keamanan'), ('prop-04', 'Parkir'),
        ('prop-05', 'Listrik'), ('prop-05', 'Air'), ('prop-05', 'Wifi'), ('prop-05', 'Kebersihan'), ('prop-05', 'Keamanan'), ('prop-05', 'Parkir'),
        ('prop-06', 'Listrik'), ('prop-06', 'Air'), ('prop-06', 'Wifi'), ('prop-06', 'Kebersihan'), ('prop-06', 'Keamanan'), ('prop-06', 'Parkir'),
        ('prop-07', 'Listrik'), ('prop-07', 'Air'), ('prop-07', 'Wifi'), ('prop-07', 'Kebersihan'), ('prop-07', 'Keamanan'), ('prop-07', 'Parkir');
    `);
  }
}
async function seedReviews(executor = pool) {
  const [revRows] = await executor.query("SELECT COUNT(*) as count FROM reviews");
  if (revRows[0].count === 0) {
    await executor.query(`
      INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date)
      VALUES 
        ('rev-01', 'prop-01', 'Cove Nuansa Home Jimbaran', 'user-tenant-01', 'Siska Pratiwi', 5, 'Pelayanan sangat baik dan stafnya sangat ramah serta helpful. Kamarnya nyaman, bersih, wangi, dan fasilitasnya lengkap. Suasananya tenang di kawasan Taman Griya, cocok sekali untuk istirahat maupun kerja.', '14 Jul 2026'),
        ('rev-02', 'prop-01', 'Cove Nuansa Home Jimbaran', 'user-tenant-02', 'Andrew Kurniawan', 5, 'Very clean and cozy room with aesthetic mezzanine design. The communal kitchen and rooftop are great. Dedicated fiber Wi-Fi is super fast and reliable. Staf ramah dan efisien membantu saat check-in.', '22 Jul 2026'),
        ('rev-03', 'prop-02', 'Kawaii Home Jimbaran', 'user-tenant', 'Bayu', 5, 'Coliving yang nyaman dan bersih di Jimbaran. Desain interior modern dengan meja kerja ergonomis, pas banget buat WFH. Lokasi strategis dekat kampus Unud dan pantai Jimbaran, tim manajemen sangat responsif.', '29 Jul 2026'),
        ('rev-04', 'prop-03', 'Jim''s Coliving Jimbaran', 'user-tenant-03', 'Michael Tan', 5, 'Lokasi mantap di koridor Jl. Raya Kampus Unud Jimbaran, dekat dengan Sidewalk Jimbaran dan kampus. Unit Studio Queen bersih, AC dingin, water heater lancar, dan fasilitas dapur bersama sangat memudahkan.', '3 Agu 2026'),
        ('rev-05', 'prop-04', 'Mari Living Jimbaran', 'user-tenant-04', 'Aditya Wicaksono', 5, 'Kost eksklusif yang tenang di area Goa Gong Jimbaran. Kamar mandi dalam bersih, Smart TV, dan rooftop view GWK yang bagus. Tempat parkir motor aman dan lingkungannya tenang.', '8 Agu 2026'),
        ('rev-06', 'prop-05', 'Villa Kori Nuansa Jimbaran', 'user-tenant-05', 'Ratna Dewi', 5, 'Hunian bergaya villa di Taman Griya Jimbaran yang asri dan privat. Kolam renang bersih dan terawat, kamar tidur ber-AC luas dan nyaman. Sangat cocok untuk yang butuh ketenangan.', '12 Agu 2026'),
        ('rev-07', 'prop-07', 'DSTAY Kost Bali Jimbaran', 'user-tenant-06', 'Sarah Jenkins', 5, 'Great value for money! The owner and staff are very friendly and welcoming. Clean, comfortable room with good AC. The rooftop kitchen with sunrise/sunset view of the GWK statue is amazing.', '18 Agu 2026');
    `);
  }
}
async function seedDatabase(executor = pool) {
  await seedUsers(executor);
  await seedPropertiesAndFacilities(executor);
  await seedReviews(executor);
  await backfillDiscreteRooms(executor);
}
async function initDb() {
  if (isInitialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      if (!process.env.VERCEL && process.env.NODE_ENV !== "production" && !isTiDB) {
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
      let tableRows = [];
      let retries = 3;
      while (retries > 0) {
        try {
          const [rows] = await pool.query("SHOW TABLES");
          tableRows = rows;
          break;
        } catch (err) {
          retries--;
          if (retries === 0) throw err;
          console.warn(`[Database Retry] Transient connection/handshake error during SHOW TABLES. Retrying... (${retries} attempts left)`);
          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
      }
      const existingTables = tableRows.map((row) => Object.values(row)[0].toLowerCase());
      const requiredTables = [
        "users",
        "properties",
        "property_facilities",
        "reviews",
        "withdrawals",
        "visitor_tracking",
        "rentals",
        "rooms",
        "property_photos",
        "maintenance_tickets",
        "payment_transactions",
        "schema_migrations"
      ];
      const missingTables = requiredTables.filter((t) => !existingTables.includes(t));
      if (missingTables.length === 0) {
        let currentVersion = 0;
        try {
          const [verRows] = await pool.query(
            "SELECT MAX(version) AS currentVersion FROM schema_migrations"
          );
          currentVersion = Number(verRows[0]?.currentVersion || 0);
        } catch {
          currentVersion = 0;
        }
        if (currentVersion < SCHEMA_MIGRATION_VERSION) {
          await applyMigrations(pool);
        }
        isInitialized = true;
        console.log("MySQL Database Kosmo tables already initialized and migrations up to date.");
        return;
      }
      console.log(`Database tables missing: ${missingTables.join(", ")}. Initializing modular schema...`);
      await createTables(pool);
      await applyMigrations(pool);
      await seedDatabase(pool);
      isInitialized = true;
      console.log("MySQL Database Kosmo initialized, tables created, and seeded successfully!");
    } catch (err) {
      console.error("Failed to initialize database tables or seed default values:", err);
      initPromise = null;
      throw err;
    }
  })();
  return initPromise;
}

// backend/router.ts
import express from "express";

// backend/middleware/auth.ts
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
var defaultSecret = null;
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim() !== "") {
    return secret;
  }
  const isStrictProduction = (process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)) && process.env.NODE_ENV !== "test";
  if (!defaultSecret) {
    if (isStrictProduction && !process.env.JWT_FALLBACK_SECRET) {
      throw new Error(
        "[Auth Security] JWT_SECRET environment variable is required in production."
      );
    }
    if (process.env.NODE_ENV === "production") {
      console.warn("\u26A0\uFE0F [Auth Warning] JWT_SECRET environment variable is missing in production. Using random fallback secret. Sessions will not persist across server restarts.");
      defaultSecret = process.env.JWT_FALLBACK_SECRET || randomBytes(32).toString("hex");
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
  const { id, email, role, purpose } = decoded;
  if (!id || !email || !role) {
    throw new Error("Malformed token claims");
  }
  return purpose ? { id, email, role, purpose } : { id, email, role };
}
function parseCookies(header) {
  if (!header) return {};
  const headerStr = Array.isArray(header) ? header.join("; ") : header;
  if (typeof headerStr !== "string") return {};
  const cookies = {};
  for (const pair of headerStr.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    let val = pair.substring(idx + 1).trim();
    if (!key) continue;
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val.slice(1, -1);
    }
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}
var authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  let token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
  if (!token) {
    const parsedCookies = parseCookies(req.headers.cookie);
    const reqCookies = req.cookies;
    token = reqCookies?.token || parsedCookies["token"] || reqCookies?.auth_token || parsedCookies["auth_token"] || reqCookies?.kosmo_token || parsedCookies["kosmo_token"] || null;
    if (token) token = token.trim();
  }
  if (!token && typeof req.query?.downloadToken === "string") {
    token = req.query.downloadToken.trim();
  } else if (!token && typeof req.query?.token === "string") {
    token = req.query.token.trim();
  }
  if (!token) {
    res.status(401).json({
      status: "fail",
      statusCode: 401,
      code: "AUTH_TOKEN_MISSING",
      message: "Akses ditolak. Token otentikasi diperlukan.",
      error: "Akses ditolak. Token otentikasi diperlukan."
    });
    return;
  }
  try {
    const user = verifyJwtToken(token);
    if (user.purpose === "download_report") {
      const methodAllowed = !req.method || req.method.toUpperCase() === "GET";
      const pathStr = req.path || req.originalUrl || "";
      const pathAllowed = !pathStr || pathStr.includes("/reports/") || pathStr.includes("/contract");
      if (!methodAllowed || !pathAllowed) {
        res.status(403).json({
          status: "fail",
          statusCode: 403,
          code: "AUTH_TOKEN_SCOPE_INVALID",
          message: "Download token hanya berlaku untuk mengunduh laporan/kontrak.",
          error: "Download token hanya berlaku untuk mengunduh laporan/kontrak."
        });
        return;
      }
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(403).json({
      status: "fail",
      statusCode: 403,
      code: "AUTH_TOKEN_INVALID",
      message: "Token tidak valid atau telah kedaluwarsa.",
      error: "Token tidak valid atau telah kedaluwarsa."
    });
  }
};
var requireRole = (allowedRoles) => {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        status: "fail",
        statusCode: 401,
        code: "AUTH_TOKEN_MISSING",
        message: "Akses ditolak. Token otentikasi diperlukan.",
        error: "Akses ditolak. Token otentikasi diperlukan."
      });
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        status: "fail",
        statusCode: 403,
        code: "AUTH_INSUFFICIENT_PERMISSIONS",
        message: "Akses ditolak. Peran Anda tidak memiliki izin untuk tindakan ini.",
        error: "Akses ditolak. Peran Anda tidak memiliki izin untuk tindakan ini."
      });
      return;
    }
    next();
  };
};

// backend/errors/index.ts
var ErrorCode = {
  // General & System
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  BAD_GATEWAY: "BAD_GATEWAY",
  MALFORMED_JSON: "MALFORMED_JSON",
  // Database & Persistence
  DATABASE_ERROR: "DATABASE_ERROR",
  DATABASE_CONNECTION_FAILED: "DATABASE_CONNECTION_FAILED",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
  DUPLICATE_ENTRY: "DUPLICATE_ENTRY",
  FOREIGN_KEY_VIOLATION: "FOREIGN_KEY_VIOLATION",
  // Authentication & Access Control
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_TOKEN_MISSING: "AUTH_TOKEN_MISSING",
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  AUTH_PASSWORD_REQUIRED: "AUTH_PASSWORD_REQUIRED",
  AUTH_PASSWORD_INCORRECT: "AUTH_PASSWORD_INCORRECT",
  AUTH_USER_NOT_FOUND: "AUTH_USER_NOT_FOUND",
  AUTH_EMAIL_EXISTS: "AUTH_EMAIL_EXISTS",
  AUTH_INSUFFICIENT_PERMISSIONS: "AUTH_INSUFFICIENT_PERMISSIONS",
  // Property & Room Inventory
  PROPERTY_NOT_FOUND: "PROPERTY_NOT_FOUND",
  PROPERTY_ACCESS_DENIED: "PROPERTY_ACCESS_DENIED",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  ROOM_OCCUPIED: "ROOM_OCCUPIED",
  ROOM_MAINTENANCE: "ROOM_MAINTENANCE",
  ROOM_ALREADY_EXISTS: "ROOM_ALREADY_EXISTS",
  ROOMS_FULL: "ROOMS_FULL",
  // Rental & Contract Tenancy
  RENTAL_NOT_FOUND: "RENTAL_NOT_FOUND",
  RENTAL_ACCESS_DENIED: "RENTAL_ACCESS_DENIED",
  RENTAL_ALREADY_ACTIVE: "RENTAL_ALREADY_ACTIVE",
  SINGLE_ACTIVE_TENANCY_VIOLATION: "SINGLE_ACTIVE_TENANCY_VIOLATION",
  CONTRACT_PREVIEW_FAILED: "CONTRACT_PREVIEW_FAILED",
  CONTRACT_SIGNING_FAILED: "CONTRACT_SIGNING_FAILED",
  CONTRACT_AFFIRMATIVE_CONSENT_REQUIRED: "CONTRACT_AFFIRMATIVE_CONSENT_REQUIRED",
  // Financial & Withdrawal
  WITHDRAWAL_INSUFFICIENT_BALANCE: "WITHDRAWAL_INSUFFICIENT_BALANCE",
  WITHDRAWAL_INVALID_AMOUNT: "WITHDRAWAL_INVALID_AMOUNT",
  WITHDRAWAL_ALREADY_PROCESSED: "WITHDRAWAL_ALREADY_PROCESSED",
  PAYMENT_UNCONFIGURED: "PAYMENT_UNCONFIGURED",
  PAYMENT_GATEWAY_ERROR: "PAYMENT_GATEWAY_ERROR",
  PAYMENT_SIGNATURE_INVALID: "PAYMENT_SIGNATURE_INVALID",
  // Media & Storage
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  FILE_UNSUPPORTED_TYPE: "FILE_UNSUPPORTED_TYPE",
  FILE_UPLOAD_FAILED: "FILE_UPLOAD_FAILED",
  FILE_LIMIT_EXCEEDED: "FILE_LIMIT_EXCEEDED"
};
var AppError = class extends Error {
  statusCode;
  code;
  isOperational;
  details;
  timestamp;
  constructor(message, statusCode = 500, code = ErrorCode.INTERNAL_SERVER_ERROR, isOperational = true, details) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = (/* @__PURE__ */ new Date()).toISOString();
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
};
var NotFoundError = class extends AppError {
  constructor(message = "Sumber daya yang diminta tidak ditemukan.", code = ErrorCode.NOT_FOUND) {
    super(message, 404, code, true);
  }
};
function isAppError(error) {
  return error instanceof AppError;
}
function isOperationalError(error) {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}

// backend/routes/system.routes.ts
import multer2 from "multer";

// backend/services/cloudinary.ts
import crypto2 from "crypto";
import path2 from "path";
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
  secure: true
});
var PLACEHOLDER_STRINGS = [
  "sample",
  "placeholder",
  "your_",
  "your-",
  "test",
  "123456789012345",
  "kosmo-bali"
];
function isPlaceholder(value) {
  if (!value) return true;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return true;
  return PLACEHOLDER_STRINGS.some((p) => trimmed === p || trimmed.includes(p));
}
function isCloudinaryConfigured() {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (isPlaceholder(name) || isPlaceholder(key) || isPlaceholder(secret)) {
    return false;
  }
  return true;
}
function uploadImageStream(buffer, folder = "kosmo_properties") {
  return new Promise((resolve, reject) => {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return reject(new Error("Image buffer cannot be empty"));
    }
    const isConfigured = isCloudinaryConfigured();
    const isTest = process.env.NODE_ENV === "test";
    const isProduction = (process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)) && !isTest;
    if (!isConfigured) {
      if (isProduction) {
        return reject(new Error("Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are missing or set to placeholder values in production."));
      }
      const mockPublicId = `${folder}/prop_${Date.now()}_${crypto2.randomBytes(3).toString("hex")}`;
      const mockUrl = `https://res.cloudinary.com/kosmo-bali/image/upload/v1/${mockPublicId}.webp`;
      return resolve({
        secure_url: mockUrl,
        public_id: mockPublicId
      });
    }
    if (isTest && process.env.ALLOW_LIVE_CLOUDINARY !== "true") {
      const mockPublicId = `${folder}/prop_${Date.now()}_${crypto2.randomBytes(3).toString("hex")}`;
      const mockUrl = `https://res.cloudinary.com/kosmo-bali/image/upload/v1/${mockPublicId}.webp`;
      return resolve({
        secure_url: mockUrl,
        public_id: mockPublicId
      });
    }
    let settled = false;
    const timeoutMs = Number(process.env.CLOUDINARY_TIMEOUT_MS || 8e3);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      uploadStream.destroy(new Error("Cloudinary image upload timed out"));
      reject(new Error("Cloudinary image upload timed out"));
    }, timeoutMs);
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
        if (settled) return;
        settled = true;
        clearTimeout(timer);
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
    readableStream.on("error", (streamErr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(streamErr);
    });
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
    const isConfigured = isCloudinaryConfigured();
    const isTest = process.env.NODE_ENV === "test";
    const isProduction = (process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)) && !isTest;
    if (!isConfigured) {
      if (isProduction) {
        return reject(new Error("Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are missing or set to placeholder values in production."));
      }
      const mockUrl = `https://res.cloudinary.com/kosmo-bali/raw/upload/v1/${fullPublicId}.pdf`;
      return resolve({
        secure_url: mockUrl,
        public_id: fullPublicId
      });
    }
    if (isTest && process.env.ALLOW_LIVE_CLOUDINARY !== "true") {
      const mockUrl = `https://res.cloudinary.com/kosmo-bali/raw/upload/v1/${fullPublicId}.pdf`;
      return resolve({
        secure_url: mockUrl,
        public_id: fullPublicId
      });
    }
    let settled = false;
    const timeoutMs = Number(process.env.CLOUDINARY_TIMEOUT_MS || 8e3);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      uploadStream.destroy(new Error("Cloudinary contract upload timed out"));
      reject(new Error("Cloudinary contract upload timed out"));
    }, timeoutMs);
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: cleanPublicId,
        resource_type: "raw",
        overwrite: true
      },
      (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
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
    readableStream.on("error", (streamErr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(streamErr);
    });
    readableStream.pipe(uploadStream);
  });
}
function deleteCloudinaryImage(publicId) {
  return new Promise((resolve) => {
    if (!publicId || typeof publicId !== "string" || publicId.trim() === "") {
      return resolve({ result: "not_found" });
    }
    const isConfigured = isCloudinaryConfigured();
    const isTest = process.env.NODE_ENV === "test";
    if (!isConfigured || isTest && process.env.ALLOW_LIVE_CLOUDINARY !== "true") {
      return resolve({ result: "ok" });
    }
    cloudinary.uploader.destroy(
      publicId.trim(),
      { resource_type: "image", invalidate: true },
      (error, result) => {
        if (error) {
          console.warn(`[Cloudinary] Failed to delete image ${publicId}:`, error);
          return resolve({ result: "error" });
        }
        resolve(result || { result: "ok" });
      }
    );
  });
}

// backend/middleware/upload.ts
import multer from "multer";
var ALLOWED_IMAGE_MIMETYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "image/gif"
];
function validateImageMimeType(mimetype) {
  if (!mimetype) return false;
  return ALLOWED_IMAGE_MIMETYPES.includes(
    mimetype.toLowerCase()
  );
}
function validateImageMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return false;
  }
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
    return true;
  }
  if (buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71) {
    return true;
  }
  if (buffer[0] === 82 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 70 && buffer[8] === 87 && buffer[9] === 69 && buffer[10] === 66 && buffer[11] === 80) {
    return true;
  }
  if (buffer[0] === 71 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 56) {
    return true;
  }
  return false;
}
var memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    // 5MB per file
    files: 10
  },
  fileFilter: (_req, file, cb) => {
    if (!validateImageMimeType(file.mimetype)) {
      return cb(
        new Error("Format file tidak didukung. Harap unggah gambar (JPEG, PNG, WebP, GIF).")
      );
    }
    cb(null, true);
  }
});
var multiPhotoUpload = memoryUpload.fields([
  { name: "images", maxCount: 10 },
  { name: "image", maxCount: 10 }
]);
function handleMultiPhotoUpload(req, res, next) {
  multiPhotoUpload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: "Ukuran file melebihi batas maksimum 5MB per file."
          });
        }
        if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            message: 'Jumlah file melebihi batas maksimum atau field tidak valid (maksimal 10 foto pada field "images").'
          });
        }
        return res.status(400).json({
          message: `Gagal memproses file upload: ${err.message}`
        });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      return res.status(400).json({ message: "Gagal memproses unggahan berkas." });
    }
    next();
  });
}
function extractUploadedFiles(req) {
  const result = [];
  if (Array.isArray(req.files)) {
    result.push(...req.files);
  } else if (req.files && typeof req.files === "object") {
    const fieldObj = req.files;
    if (Array.isArray(fieldObj.images)) result.push(...fieldObj.images);
    if (Array.isArray(fieldObj.image)) result.push(...fieldObj.image);
  } else if (req.file) {
    result.push(req.file);
  }
  return result;
}

// backend/middleware/rateLimiter.ts
import rateLimit from "express-rate-limit";
function shouldSkipRateLimit(req) {
  if (process.env.NODE_ENV === "test" || process.env.NO_LISTEN === "true") {
    return true;
  }
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  const rawHeader = req.headers["x-test-bypass"] ?? req.headers["x-bypass-rate-limit"];
  const bypassHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (bypassHeader) {
    if (bypassHeader === "true") {
      return true;
    }
    const bypassSecret = process.env.RATE_LIMIT_BYPASS_SECRET;
    if (bypassSecret && bypassHeader === bypassSecret) {
      return true;
    }
  }
  return false;
}
var authLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: process.env.NODE_ENV === "test" ? 1e4 : 10,
  skip: shouldSkipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "fail",
    statusCode: 429,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Terlalu banyak percobaan masuk/daftar. Silakan coba lagi dalam 15 menit."
  }
});
var trackingLimiter = rateLimit({
  windowMs: 60 * 1e3,
  // 1 minute
  max: process.env.NODE_ENV === "test" ? 1e4 : 30,
  skip: shouldSkipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "fail",
    statusCode: 429,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Terlalu banyak permintaan pelacakan."
  }
});
var uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: process.env.NODE_ENV === "test" ? 1e4 : 30,
  skip: shouldSkipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "fail",
    statusCode: 429,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Terlalu banyak unggahan berkas. Silakan coba lagi nanti."
  }
});
var mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: process.env.NODE_ENV === "test" ? 1e4 : 30,
  skip: shouldSkipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "fail",
    statusCode: 429,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Terlalu banyak permintaan transaksi atau perubahan data. Silakan coba lagi nanti."
  }
});

// backend/routes/system.routes.ts
var ALLOWED_IMAGE_MIMETYPES2 = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "image/gif"
];
function validateImageMimeType2(mimetype) {
  if (!mimetype) return false;
  return ALLOWED_IMAGE_MIMETYPES2.includes(mimetype.toLowerCase());
}
var upload = multer2({
  storage: multer2.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
  // 5MB limit
});
function registerSystemRoutes(router2) {
  router2.get("/health", async (_req, res) => {
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
      const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
      const rawErrorMsg = error instanceof Error ? error.message : "Database ping failed";
      const errorMsg = isProduction ? "Database unavailable" : rawErrorMsg;
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
  router2.post(
    "/upload",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    uploadLimiter,
    upload.single("image"),
    async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ message: "Tidak ada file yang diunggah." });
      }
      if (!validateImageMimeType2(req.file.mimetype) || !validateImageMagicBytes(req.file.buffer)) {
        return res.status(400).json({
          message: "Format file tidak didukung atau header berkas tidak valid. Harap unggah gambar (JPEG, PNG, WebP, GIF)."
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
    }
  );
}

// backend/routes/auth.routes.ts
import bcrypt2 from "bcryptjs";

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

// backend/middleware/validation.ts
import { z } from "zod";
function sanitizeText(input) {
  if (typeof input !== "string") return input;
  return input.replace(/\0/g, "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "").replace(/<[^>]*>?/gm, "").replace(/javascript:/gi, "").trim();
}
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
  ),
  role: z.enum(["tenant", "landlord"]).optional().default("tenant")
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
  name: z.string().transform((val) => sanitizeText(val)).refine((val) => val.length >= 2, { message: "Nama minimal 2 karakter" }).optional(),
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
  address: z.string().transform((val) => sanitizeText(val)).refine((val) => val === "" || val.length >= 5, { message: "Alamat domisili minimal 5 karakter" }).optional().or(z.literal("")),
  occupation: z.string().transform((val) => sanitizeText(val)).refine((val) => val === "" || val.length >= 2, { message: "Pekerjaan/Profesi minimal 2 karakter" }).optional().or(z.literal("")),
  emergency_contact_name: z.string().transform((val) => sanitizeText(val)).refine((val) => val === "" || val.length >= 2, { message: "Nama kontak darurat minimal 2 karakter" }).optional().or(z.literal("")),
  emergency_contact_relation: z.string().transform((val) => sanitizeText(val)).optional().or(z.literal("")),
  emergency_contact_phone: z.string().trim().min(9, "Nomor telepon kontak darurat minimal 9 digit").max(20, "Nomor telepon kontak darurat maksimal 20 digit").regex(
    /^(?:\+?\d{9,16}|08\d{7,13}|0\d{8,14})$/,
    "Format nomor telepon kontak darurat tidak valid"
  ).optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  gender: z.string().optional().or(z.literal("")),
  bankName: z.string().transform((val) => sanitizeText(val)).refine((val) => val === "" || val.length >= 2, { message: "Nama bank minimal 2 karakter" }).optional().or(z.literal("")),
  bankAccountNumber: z.string().trim().regex(/^\d{5,25}$/, "Nomor rekening bank harus 5-25 digit angka").optional().or(z.literal("")),
  bankAccountHolder: z.string().transform((val) => sanitizeText(val)).refine((val) => val === "" || val.length >= 2, { message: "Nama pemilik rekening minimal 2 karakter" }).optional().or(z.literal(""))
});
var propertySchema = z.object({
  name: z.string().min(1, "Nama properti wajib diisi"),
  district: z.string().min(1, "Kabupaten/Kota wajib diisi"),
  address: z.string().min(1, "Alamat wajib diisi"),
  price: z.number().positive("Harga harus lebih besar dari 0"),
  totalRooms: z.number().int().positive("Total kamar harus lebih besar dari 0"),
  image: z.string().max(75e4, "Ukuran gambar sampul terlalu besar. Gunakan unggah foto maksimal 5MB.").optional(),
  ownerId: z.string().min(1, "ownerId wajib diisi").optional()
}).passthrough();
var withdrawalSchema = z.object({
  amount: z.preprocess(
    (val) => typeof val === "string" && val.trim() !== "" ? Number(val) : val,
    z.number().positive("Jumlah penarikan harus lebih besar dari 0")
  ),
  bankName: z.string().min(1, "Nama bank wajib diisi"),
  accountNumber: z.string().min(1, "Nomor rekening wajib diisi"),
  accountHolder: z.string().optional(),
  userId: z.string().optional()
});
var reviewSchema = z.object({
  propertyId: z.string().min(1, "propertyId wajib diisi"),
  comment: z.string().transform((val) => sanitizeText(val)).refine((val) => val.length > 0, { message: "Komentar ulasan wajib diisi" }),
  rating: z.number().int().min(1, "Rating minimal 1").max(5, "Rating maksimal 5")
});
var previewContractSchema = z.object({
  propertyId: z.string().min(1, "ID properti wajib diisi"),
  durationMonths: z.number().int("Durasi sewa harus berupa bilangan bulat").min(1, "Durasi sewa minimal 1 bulan").max(120, "Durasi sewa maksimal 120 bulan").optional().default(1),
  roomId: z.string().optional(),
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
  roomId: z.string().optional(),
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
      res.status(400).json({
        status: "fail",
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: errorMessages,
        error: errorMessages,
        errors: result.error.flatten(),
        details: result.error.flatten()
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
var createRoomSchema = z.object({
  roomNumber: z.string().trim().min(1, "Nomor kamar wajib diisi"),
  floor: z.preprocess(
    (val) => val !== void 0 && val !== null ? Number(val) : 1,
    z.number().int("Nomor lantai harus berupa bilangan bulat").min(0, "Nomor lantai minimal 0")
  ).default(1),
  type: z.string().trim().min(1, "Tipe kamar wajib diisi").default("Standard"),
  price: z.preprocess(
    (val) => val === "" || val === null || val === void 0 ? null : Number(val),
    z.number().positive("Harga kamar harus lebih besar dari 0").nullable().optional()
  ),
  status: z.enum(["available", "occupied", "maintenance"]).default("available")
});
var updateRoomSchema = z.object({
  roomNumber: z.string().trim().min(1, "Nomor kamar tidak boleh kosong").optional(),
  floor: z.preprocess(
    (val) => val !== void 0 && val !== null ? Number(val) : void 0,
    z.number().int("Nomor lantai harus berupa bilangan bulat").min(0, "Nomor lantai minimal 0").optional()
  ),
  type: z.string().trim().min(1, "Tipe kamar tidak boleh kosong").optional(),
  price: z.preprocess(
    (val) => val === "" || val === null || val === void 0 ? null : Number(val),
    z.number().positive("Harga kamar harus lebih besar dari 0").nullable().optional()
  ),
  status: z.enum(["available", "occupied", "maintenance"]).optional()
});
var updateRoomStatusSchema = z.object({
  status: z.enum(["available", "maintenance"], {
    message: "Status kamar hanya dapat diubah antara 'available' atau 'maintenance'"
  })
});
var deleteRoomSchema = z.object({
  password: z.string().min(1, "Password konfirmasi diperlukan")
});
var reorderPhotosSchema = z.object({
  photoIds: z.array(z.string().trim().min(1, "ID foto tidak boleh kosong"), {
    message: "photoIds harus berupa array string ID foto"
  }).min(1, "Daftar ID foto wajib memiliki minimal 1 item").refine(
    (ids) => new Set(ids).size === ids.length,
    "Daftar ID foto tidak boleh mengandung duplikasi"
  )
});
var createTicketSchema = z.object({
  rentalId: z.string().trim().min(1, "rentalId wajib diisi"),
  roomId: z.string().trim().optional().nullable(),
  category: z.enum(["ac", "plumbing", "wifi", "electricity", "cleaning", "other"], {
    message: "Kategori tiket tidak valid"
  }),
  title: z.string().trim().min(3, "Judul minimal 3 karakter").max(150, "Judul maksimal 150 karakter"),
  description: z.string().trim().min(5, "Deskripsi minimal 5 karakter"),
  photoUrl: z.string().trim().max(500, "URL foto maksimal 500 karakter").refine(
    (val) => !val || val.startsWith("/") || /^https?:\/\//i.test(val),
    "Format URL atau path foto tidak valid"
  ).optional().nullable().or(z.literal(""))
});
var updateTicketStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "cancelled"], {
    message: "Status tiket harus salah satu dari: 'open', 'in_progress', 'resolved', 'cancelled'"
  })
});
var terminateRentalSchema = z.object({
  password: z.string().min(1, "Password konfirmasi diperlukan"),
  reason: z.string().optional()
});
var propertyUpdateSchema = z.object({
  name: z.string().trim().min(1, "Nama properti tidak boleh kosong").optional(),
  district: z.string().trim().min(1, "Kabupaten/Kota tidak boleh kosong").optional(),
  address: z.string().trim().min(1, "Alamat tidak boleh kosong").optional(),
  price: z.preprocess((val) => val !== void 0 && val !== null && val !== "" ? Number(val) : void 0, z.number().positive("Harga harus lebih besar dari 0").optional()),
  description: z.string().optional(),
  facilities: z.array(z.string()).optional(),
  latitude: z.preprocess((val) => val !== void 0 && val !== null && val !== "" ? Number(val) : void 0, z.number().optional()),
  longitude: z.preprocess((val) => val !== void 0 && val !== null && val !== "" ? Number(val) : void 0, z.number().optional()),
  totalRooms: z.preprocess((val) => val !== void 0 && val !== null && val !== "" ? Number(val) : void 0, z.number().int().positive("Total kamar harus lebih besar dari 0").optional()),
  occupiedRooms: z.preprocess((val) => val !== void 0 && val !== null && val !== "" ? Number(val) : void 0, z.number().int().min(0).optional()),
  image: z.string().max(75e4, "Ukuran gambar sampul terlalu besar. Gunakan unggah foto maksimal 5MB.").optional(),
  ownerId: z.string().trim().min(1).optional(),
  verified_water_tank: z.boolean().optional(),
  verified_wifi_speedtest: z.boolean().optional()
});
var reviewUpdateSchema = z.object({
  rating: z.preprocess((val) => val !== void 0 && val !== null && val !== "" ? Number(val) : void 0, z.number().int().min(1, "Rating minimal 1").max(5, "Rating maksimal 5").optional()),
  comment: z.string().transform((val) => sanitizeText(val)).refine((val) => val.length > 0, { message: "Komentar ulasan tidak boleh kosong" }).optional()
}).refine((data) => data.rating !== void 0 || data.comment !== void 0, {
  message: "Minimal salah satu dari rating atau comment harus diisi"
});
var verifyPasswordSchema = z.object({
  password: z.string().min(1, "password wajib diisi."),
  userId: z.string().optional()
});
var processWithdrawalSchema = z.object({
  status: z.enum(["processing", "completed"]).optional().default("completed"),
  referenceId: z.string().optional()
});
var rejectWithdrawalSchema = z.object({
  password: z.string({ message: "Password konfirmasi administrator diperlukan" }).min(1, "Password konfirmasi administrator diperlukan"),
  reason: z.string().trim().min(1, "Alasan penolakan wajib diisi").optional()
});
var createRentalSchema = z.object({
  propertyId: z.string().min(1, "ID properti wajib diisi"),
  tenantId: z.string().optional(),
  propertyName: z.string().optional(),
  price: z.preprocess((val) => val !== void 0 && val !== null && val !== "" ? Number(val) : void 0, z.number().positive("Harga sewa harus lebih besar dari 0").optional()),
  durationMonths: z.preprocess((val) => val !== void 0 && val !== null && val !== "" ? Number(val) : 1, z.number().int().min(1, "Durasi sewa minimal 1 bulan").max(120).optional().default(1)),
  roomId: z.string().optional().nullable(),
  rentalId: z.string().optional(),
  signature: z.string().optional()
});
var renewRentalTokenSchema = z.object({
  months: z.preprocess(
    (val) => val !== void 0 && val !== null && val !== "" ? Number(val) : 1,
    z.number().int("Durasi perpanjangan harus berupa bilangan bulat").min(1, "Durasi perpanjangan minimal 1 bulan").max(120, "Durasi perpanjangan maksimal 120 bulan")
  ).optional().default(1)
});
var featurePropertySchema = z.object({
  isFeatured: z.boolean().optional().default(true),
  durationDays: z.preprocess(
    (val) => val !== void 0 && val !== null && val !== "" ? Number(val) : 30,
    z.number().int().min(1, "Durasi minimal 1 hari").max(365, "Durasi maksimal 365 hari")
  ).optional().default(30),
  featuredUntil: z.string().optional()
});
var interactionTelemetrySchema = z.object({
  propertyId: z.string().trim().min(1, "propertyId wajib diisi"),
  interactionType: z.enum(["view", "like", "bookmark", "chat", "booking", "rating", "filter"], {
    message: "interactionType harus salah satu dari: 'view', 'like', 'bookmark', 'chat', 'booking', 'rating', 'filter'"
  }),
  userId: z.string().optional(),
  deviceToken: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
var createPaymentTokenSchema = z.object({
  propertyId: z.string().min(1, "propertyId wajib diisi"),
  tenantId: z.string().optional(),
  propertyName: z.string().optional(),
  price: z.preprocess((val) => val !== void 0 && val !== null && val !== "" ? Number(val) : void 0, z.number().positive("Harga sewa harus lebih besar dari 0").optional()),
  durationMonths: z.preprocess((val) => val !== void 0 && val !== null && val !== "" ? Number(val) : 1, z.number().int().min(1, "Durasi sewa minimal 1 bulan").max(120).optional().default(1)),
  roomId: z.string().optional().nullable(),
  customRentalId: z.string().optional(),
  rentalId: z.string().optional(),
  startDate: z.string().optional()
});
var paymentNotificationSchema = z.object({
  order_id: z.string().min(1, "order_id wajib diisi"),
  status_code: z.string().min(1, "status_code wajib diisi"),
  gross_amount: z.string().min(1, "gross_amount wajib diisi"),
  signature_key: z.string().min(1, "signature_key wajib diisi"),
  transaction_status: z.string().optional(),
  fraud_status: z.string().optional(),
  payment_type: z.string().optional(),
  transaction_time: z.string().optional(),
  transaction_id: z.string().optional()
}).passthrough();
var visitorTrackingSchema = z.object({
  pageUrl: z.string().trim().max(500).optional(),
  referrer: z.string().trim().max(500).optional(),
  sessionId: z.string().trim().max(100).optional(),
  deviceType: z.string().trim().max(50).optional()
}).optional().default({});

// shared/types/index.ts
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

// backend/types/index.ts
var VALID_PHOTO_CATEGORIES = [
  "thumbnail",
  "bedroom",
  "bathroom",
  "kitchen",
  "pool",
  "living_room",
  "wifi_speedtest",
  "exterior",
  "other"
];

// backend/utils/id.ts
import crypto3 from "crypto";
var generateId = (prefix) => {
  return `${prefix}-${crypto3.randomBytes(4).toString("hex")}`;
};

// backend/routes/auth.routes.ts
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
async function applyProfileUpdate(targetUserId, body) {
  const [existingRows] = await pool.query("SELECT id FROM users WHERE id = ?", [targetUserId]);
  if (existingRows.length === 0) {
    return null;
  }
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
    gender,
    bankName,
    bankAccountNumber,
    bankAccountHolder
  } = body;
  const notifVal = notifications !== void 0 ? notifications ? 1 : 0 : null;
  const nonEmptyOrNull = (val) => val && val.trim() !== "" ? val.trim() : null;
  await pool.query(
    `UPDATE users SET 
      name = COALESCE(?, name), 
      phone = COALESCE(?, phone), 
      paymentMethod = COALESCE(?, paymentMethod), 
      notifications = COALESCE(?, notifications), 
      language = COALESCE(?, language),
      identity_type = COALESCE(?, identity_type),
      identity_number = COALESCE(?, identity_number),
      address = COALESCE(?, address),
      occupation = COALESCE(?, occupation),
      emergency_contact_name = COALESCE(?, emergency_contact_name),
      emergency_contact_relation = COALESCE(?, emergency_contact_relation),
      emergency_contact_phone = COALESCE(?, emergency_contact_phone),
      date_of_birth = COALESCE(?, date_of_birth),
      gender = COALESCE(?, gender),
      bankName = COALESCE(?, bankName),
      bankAccountNumber = COALESCE(?, bankAccountNumber),
      bankAccountHolder = COALESCE(?, bankAccountHolder)
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
      nonEmptyOrNull(bankName),
      nonEmptyOrNull(bankAccountNumber),
      nonEmptyOrNull(bankAccountHolder),
      targetUserId
    ]
  );
  apiCache.invalidatePattern("landlord:");
  const [updatedUsers] = await pool.query("SELECT * FROM users WHERE id = ?", [targetUserId]);
  const updatedUser = updatedUsers[0];
  return updatedUser ? formatSafeUser(updatedUser) : null;
}
function registerAuthRoutes(router2) {
  router2.post(
    "/auth/login",
    authLimiter,
    validateBody(loginSchema),
    async (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email dan password wajib diisi." });
      }
      try {
        const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
        const user = rows[0];
        const isMatch = user && user.password ? await bcrypt2.compare(password, user.password) : false;
        if (!user || !user.password || !isMatch) {
          return res.status(401).json({ message: "Email atau password salah." });
        }
        const safeUser = formatSafeUser(user);
        const token = generateJwtToken({
          id: user.id,
          email: user.email,
          role: user.role
        });
        res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.CROSS_SITE_COOKIES === "true" ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1e3,
          path: "/"
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
  router2.post(
    "/auth/register",
    authLimiter,
    validateBody(registerSchema),
    async (req, res) => {
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
        const hashedPassword = await bcrypt2.hash(password, 10);
        const assignedRole = req.body.role === "landlord" ? "landlord" : "tenant";
        await pool.query(
          `INSERT INTO users (id, email, password, name, role, phone, paymentMethod) 
           VALUES (?, ?, ?, ?, ?, ?, 'Virtual Account')`,
          [userId, email, hashedPassword, name, assignedRole, phone.trim()]
        );
        apiCache.invalidatePattern("admin:");
        const [newUsers] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
        const newUser = newUsers[0];
        const safeUser = formatSafeUser(newUser);
        const token = generateJwtToken({
          id: newUser.id,
          email: newUser.email,
          role: newUser.role
        });
        res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.CROSS_SITE_COOKIES === "true" ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1e3,
          path: "/"
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
  router2.post("/auth/logout", (_req, res) => {
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.CROSS_SITE_COOKIES === "true" ? "none" : "lax",
      path: "/"
    };
    res.clearCookie("token", cookieOpts);
    res.clearCookie("auth_token", cookieOpts);
    res.clearCookie("kosmo_token", cookieOpts);
    res.json({ message: "Logout berhasil." });
  });
  router2.get("/auth/me", authenticateToken, async (req, res) => {
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
  router2.get("/users/profile/:id", authenticateToken, async (req, res) => {
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
  router2.put(
    "/users/profile/:id",
    authenticateToken,
    validateBody(updateProfileSchema),
    async (req, res) => {
      const { id } = req.params;
      const authUser = req.user;
      if (authUser?.role !== "admin" && authUser?.id !== id) {
        return res.status(403).json({ message: "Akses ditolak. Anda tidak dapat mengubah profil pengguna lain." });
      }
      try {
        const safeUser = await applyProfileUpdate(String(id), req.body);
        if (!safeUser) {
          return res.status(404).json({ message: "User tidak ditemukan." });
        }
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
  router2.put(
    "/auth/profile",
    authenticateToken,
    validateBody(updateProfileSchema),
    async (req, res) => {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Otentikasi diperlukan." });
      try {
        const safeUser = await applyProfileUpdate(userId, req.body);
        if (!safeUser) {
          return res.status(404).json({ message: "User tidak ditemukan." });
        }
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
  router2.post(
    "/auth/verify-password",
    authLimiter,
    authenticateToken,
    validateBody(verifyPasswordSchema),
    async (req, res) => {
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
        const valid = await bcrypt2.compare(password, user.password);
        res.json({ valid });
      } catch (err) {
        console.error("Password verification error:", err);
        res.status(500).json({ message: "Gagal memverifikasi password." });
      }
    }
  );
}

// backend/routes/users.routes.ts
import bcrypt3 from "bcryptjs";
function registerUserRoutes(router2) {
  const handleGetUsers = async (req, res) => {
    try {
      const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
      const rawPage = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
      const rawOffset = req.query.offset ? parseInt(String(req.query.offset), 10) : (page - 1) * limit;
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
      const [[rows], [countRows]] = await Promise.all([
        pool.query(
          "SELECT id, email, name, role, phone, paymentMethod, balance, totalRevenue, totalWithdrawn FROM users ORDER BY id DESC LIMIT ? OFFSET ?",
          [limit, offset]
        ),
        pool.query("SELECT COUNT(*) as total FROM users")
      ]);
      const totalCount = Number(countRows[0]?.total || rows.length);
      res.setHeader("X-Total-Count", String(totalCount));
      res.json(rows);
    } catch (err) {
      console.error("Get users error:", err);
      res.status(500).json({ message: "Gagal mengambil data user." });
    }
  };
  router2.get("/users", authenticateToken, requireRole(["admin"]), handleGetUsers);
  router2.get("/admin/users", authenticateToken, requireRole(["admin"]), handleGetUsers);
  router2.post(
    "/users",
    authenticateToken,
    requireRole(["admin"]),
    validateBody(adminCreateUserSchema),
    async (req, res) => {
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
        const hashedPassword = await bcrypt3.hash(password, 10);
        await pool.query(
          `INSERT INTO users (id, email, password, name, role, phone, paymentMethod) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, email, hashedPassword, name, role, phone || "", paymentMethod || "Virtual Account"]
        );
        apiCache.invalidatePattern("admin:");
        res.status(201).json({ message: "User berhasil dibuat!" });
      } catch (err) {
        res.status(500).json({ message: "Gagal membuat user." });
      }
    }
  );
  router2.put(
    "/users/:id",
    authenticateToken,
    requireRole(["admin"]),
    validateBody(adminUpdateUserSchema),
    async (req, res) => {
      const { id } = req.params;
      const { name, email, role, phone, paymentMethod, password } = req.body;
      try {
        const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
        if (rows.length === 0) {
          return res.status(404).json({ message: "User tidak ditemukan." });
        }
        if (password) {
          const hashedPassword = await bcrypt3.hash(password, 10);
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
        apiCache.invalidatePattern("admin:");
        apiCache.invalidatePattern("landlord:");
        res.json({ message: "User berhasil diperbarui!" });
      } catch (err) {
        res.status(500).json({ message: "Gagal memperbarui user." });
      }
    }
  );
  router2.delete("/users/:id", authenticateToken, requireRole(["admin"]), async (req, res) => {
    const { id } = req.params;
    const { password } = req.body || {};
    const authUser = req.user;
    if (id === "user-admin") {
      return res.status(400).json({ message: "Admin utama tidak dapat dihapus." });
    }
    if (authUser?.id === id) {
      return res.status(400).json({ message: "Anda tidak dapat menghapus akun Anda sendiri." });
    }
    if (!password) {
      return res.status(400).json({ message: "Password konfirmasi administrator diperlukan." });
    }
    try {
      const [adminRows] = await pool.query("SELECT password FROM users WHERE id = ?", [authUser?.id]);
      const admin = adminRows[0];
      const isMatch = admin && admin.password ? await bcrypt3.compare(password, admin.password) : false;
      if (!admin || !admin.password || !isMatch) {
        return res.status(401).json({ message: "Password administrator salah." });
      }
      const [activeRentals] = await pool.query(
        "SELECT COUNT(*) as activeCount FROM rentals WHERE tenantId = ? AND status IN ('active', 'pending')",
        [id]
      );
      if (Number(activeRentals[0]?.activeCount || 0) > 0) {
        return res.status(409).json({
          message: "Pengguna tidak dapat dihapus karena masih memiliki sewa aktif atau pesanan menunggu pembayaran."
        });
      }
      const [ownedProps] = await pool.query(
        "SELECT COUNT(*) as propCount FROM properties WHERE ownerId = ?",
        [id]
      );
      if (Number(ownedProps[0]?.propCount || 0) > 0) {
        return res.status(409).json({
          message: "Pengguna tidak dapat dihapus karena masih memiliki properti kos yang terdaftar."
        });
      }
      await pool.query("DELETE FROM users WHERE id = ?", [id]);
      apiCache.invalidatePattern("admin:");
      apiCache.invalidatePattern("landlord:");
      res.json({ message: "User berhasil dihapus!" });
    } catch (err) {
      res.status(500).json({ message: "Gagal menghapus user." });
    }
  });
}

// backend/routes/properties.routes.ts
import bcrypt4 from "bcryptjs";

// backend/services/transformers.ts
var DEFAULT_PROPERTY_IMAGE = "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80";
function normalizeProperty(p) {
  const isFeatured = Boolean(p.is_featured ?? p.isFeatured);
  const featuredUntilStr = p.featured_until ? typeof p.featured_until === "string" ? p.featured_until : new Date(p.featured_until).toISOString() : null;
  return {
    ...p,
    price: Number(p.price) || 0,
    totalRooms: Number(p.totalRooms) || 0,
    occupiedRooms: Number(p.occupiedRooms) || 0,
    rating: Number(p.rating) || 0,
    image: p.image && p.image.trim() !== "" ? p.image : DEFAULT_PROPERTY_IMAGE,
    facilities: Array.isArray(p.facilities) ? p.facilities : [],
    is_featured: isFeatured,
    isFeatured,
    featured_until: featuredUntilStr,
    featuredUntil: featuredUntilStr,
    verified_water_tank: Boolean(p.verified_water_tank),
    verified_wifi_speedtest: Boolean(p.verified_wifi_speedtest)
  };
}
function normalizePropertySummary(p) {
  const norm = normalizeProperty(p);
  if (norm.image && norm.image.startsWith("data:image") && norm.image.length > 2048) {
    norm.image = DEFAULT_PROPERTY_IMAGE;
  }
  return norm;
}

// backend/services/recommendation.service.ts
var DEFAULT_RECOMMENDATION_WEIGHTS = {
  price: 0.3,
  distance: 0.2,
  facilities: 0.25,
  rating: 0.15,
  verification: 0.1
};
var INTERACTION_SIGNAL_WEIGHTS = {
  view: 1,
  filter: 1.2,
  like: 2,
  bookmark: 2.5,
  chat: 3,
  rating: 4,
  booking: 5
};
var DEFAULT_BALI_HUB = {
  lat: -8.65,
  // Denpasar / Canggu corridor
  lng: 115.1385
};
function computeHaversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => deg * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function normalizeAttribute(value, min, max, isCost) {
  if (!Number.isFinite(value)) return 0;
  const span = max - min;
  if (span <= 1e-9) {
    return 1;
  }
  const clamped = Math.min(max, Math.max(min, value));
  if (isCost) {
    return (max - clamped) / span;
  }
  return (clamped - min) / span;
}
function normalizeWeights(weights) {
  const p = Math.max(0, Number(weights.price) || 0);
  const d = Math.max(0, Number(weights.distance) || 0);
  const f = Math.max(0, Number(weights.facilities) || 0);
  const r = Math.max(0, Number(weights.rating) || 0);
  const v = Math.max(0, Number(weights.verification) || 0);
  const sum = p + d + f + r + v;
  if (sum <= 1e-9) {
    return { ...DEFAULT_RECOMMENDATION_WEIGHTS };
  }
  return {
    price: p / sum,
    distance: d / sum,
    facilities: f / sum,
    rating: r / sum,
    verification: v / sum
  };
}
function adaptUserWeights(priorWeights, behaviorSignal, alpha = 0.85) {
  const clampedAlpha = Math.min(0.99, Math.max(0.01, alpha));
  const rawUpdated = {
    price: clampedAlpha * priorWeights.price + (1 - clampedAlpha) * (behaviorSignal.price ?? priorWeights.price),
    distance: clampedAlpha * priorWeights.distance + (1 - clampedAlpha) * (behaviorSignal.distance ?? priorWeights.distance),
    facilities: clampedAlpha * priorWeights.facilities + (1 - clampedAlpha) * (behaviorSignal.facilities ?? priorWeights.facilities),
    rating: clampedAlpha * priorWeights.rating + (1 - clampedAlpha) * (behaviorSignal.rating ?? priorWeights.rating),
    verification: clampedAlpha * priorWeights.verification + (1 - clampedAlpha) * (behaviorSignal.verification ?? priorWeights.verification)
  };
  return normalizeWeights(rawUpdated);
}
var RecommendationService = class {
  userWeights = /* @__PURE__ */ new Map();
  interactionLog = [];
  getWeightsForUser(userKey) {
    if (!userKey) {
      return { ...DEFAULT_RECOMMENDATION_WEIGHTS };
    }
    const existing = this.userWeights.get(userKey);
    return existing ? { ...existing } : { ...DEFAULT_RECOMMENDATION_WEIGHTS };
  }
  recordInteraction(input) {
    const prior = this.getWeightsForUser(input.userKey);
    const eventStrength = INTERACTION_SIGNAL_WEIGHTS[input.interactionType] || 1;
    const effectiveAlpha = input.alpha !== void 0 ? input.alpha : Math.max(0.65, 0.9 - eventStrength / 5 * 0.2);
    const signal = {};
    const prop = input.property;
    const meta = input.metadata || {};
    if (prop) {
      const price = Number(prop.price) || 0;
      const facCount = Array.isArray(prop.facilities) ? prop.facilities.length : 0;
      const rating = Number(prop.rating) || 0;
      const hasBadges = Boolean(prop.verified_water_tank || prop.verified_wifi_speedtest);
      signal.price = price > 0 && price <= 25e5 ? 0.5 : 0.2;
      signal.facilities = facCount >= 4 ? 0.4 : 0.2;
      signal.rating = rating >= 4.5 ? 0.3 : 0.15;
      signal.verification = hasBadges ? 0.25 : 0.1;
      signal.distance = 0.2;
    } else if (input.interactionType === "filter") {
      if (meta.maxPrice !== void 0 || meta.priceMax !== void 0) {
        signal.price = 0.55;
      }
      if (meta.facility !== void 0) {
        signal.facilities = 0.45;
      }
      if (meta.district !== void 0) {
        signal.distance = 0.4;
      }
    } else {
      signal.price = prior.price;
      signal.distance = prior.distance;
      signal.facilities = prior.facilities + 0.05;
      signal.rating = prior.rating + 0.05;
      signal.verification = prior.verification + 0.02;
    }
    const updated = adaptUserWeights(prior, signal, effectiveAlpha);
    this.userWeights.set(input.userKey, updated);
    const event = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userKey: input.userKey,
      propertyId: input.propertyId,
      interactionType: input.interactionType,
      metadata: input.metadata,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.interactionLog.push(event);
    if (this.interactionLog.length > 1e3) {
      this.interactionLog.shift();
    }
    return { event, updatedWeights: updated };
  }
  rankProperties(properties, options) {
    if (properties.length === 0) return [];
    const weights = normalizeWeights(
      options?.weights || this.getWeightsForUser(options?.userKey)
    );
    const refLat = options?.targetLat !== void 0 && Number.isFinite(options.targetLat) ? options.targetLat : DEFAULT_BALI_HUB.lat;
    const refLng = options?.targetLng !== void 0 && Number.isFinite(options.targetLng) ? options.targetLng : DEFAULT_BALI_HUB.lng;
    const metrics = properties.map((p) => {
      const price = Number(p.price) || 0;
      const lat = parseFloat(String(p.latitude || DEFAULT_BALI_HUB.lat));
      const lng = parseFloat(String(p.longitude || DEFAULT_BALI_HUB.lng));
      const distanceKm = computeHaversineDistanceKm(
        refLat,
        refLng,
        Number.isFinite(lat) ? lat : DEFAULT_BALI_HUB.lat,
        Number.isFinite(lng) ? lng : DEFAULT_BALI_HUB.lng
      );
      const facilitiesCount = Array.isArray(p.facilities) ? p.facilities.length : 0;
      const rating = Number(p.rating) || 0;
      const verificationScore = (p.verified_water_tank ? 0.5 : 0) + (p.verified_wifi_speedtest ? 0.5 : 0);
      return {
        property: p,
        price,
        distanceKm,
        facilitiesCount,
        rating,
        verificationScore
      };
    });
    const prices = metrics.map((m) => m.price);
    const distances = metrics.map((m) => m.distanceKm);
    const facCounts = metrics.map((m) => m.facilitiesCount);
    const ratings = metrics.map((m) => m.rating);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minDist = Math.min(...distances);
    const maxDist = Math.max(...distances);
    const minFac = Math.min(...facCounts);
    const maxFac = Math.max(...facCounts);
    const minRating = Math.min(...ratings);
    const maxRating = Math.max(...ratings);
    const scored = metrics.map((m) => {
      const sPrice = normalizeAttribute(m.price, minPrice, maxPrice, true);
      const sDistance = normalizeAttribute(m.distanceKm, minDist, maxDist, true);
      const sFacilities = normalizeAttribute(m.facilitiesCount, minFac, maxFac, false);
      const sRating = normalizeAttribute(m.rating, minRating, maxRating, false);
      const sVerification = m.verificationScore;
      const baseScore = weights.price * sPrice + weights.distance * sDistance + weights.facilities * sFacilities + weights.rating * sRating + weights.verification * sVerification;
      const isFeaturedActive = Boolean(m.property.is_featured || m.property.isFeatured);
      const finalScore = Math.min(1, Number((baseScore + (isFeaturedActive ? 0.03 : 0)).toFixed(4)));
      return {
        ...m.property,
        suitabilityScore: finalScore
      };
    });
    scored.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
    if (options?.limit && options.limit > 0) {
      return scored.slice(0, options.limit);
    }
    return scored;
  }
};
var recommendationService = new RecommendationService();

// backend/routes/properties.routes.ts
function registerPropertyRoutes(router2) {
  router2.get("/properties", async (req, res) => {
    const {
      district,
      priceMin,
      priceMax,
      minPrice,
      maxPrice,
      facility,
      facilities: facilitiesQuery,
      ownerId,
      owner,
      is_featured,
      featured,
      verified_water_tank,
      verified_wifi_speedtest
    } = req.query;
    const rawFacilityParam = facility ?? facilitiesQuery;
    const targetOwner = ownerId || owner;
    const effectiveMin = priceMin !== void 0 ? priceMin : minPrice;
    const effectiveMax = priceMax !== void 0 ? priceMax : maxPrice;
    const wantsFeatured = is_featured === "true" || is_featured === "1" || featured === "true" || featured === "1";
    const wantsWaterTank = verified_water_tank === "true" || verified_water_tank === "1";
    const wantsWifiSpeedtest = verified_wifi_speedtest === "true" || verified_wifi_speedtest === "1";
    const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : void 0;
    const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const offsetParam = req.query.offset ? parseInt(String(req.query.offset), 10) : limitParam ? (pageParam - 1) * limitParam : 0;
    const rawFacilities = rawFacilityParam ? Array.isArray(rawFacilityParam) ? rawFacilityParam.flatMap((f) => String(f).split(",")) : typeof rawFacilityParam === "string" ? rawFacilityParam.split(",") : [] : [];
    const uniqueFacilitiesList = Array.from(new Set(rawFacilities.map((f) => f.trim().toLowerCase()).filter(Boolean)));
    const expandedFacilityVariants = Array.from(
      new Set(
        uniqueFacilitiesList.flatMap((f) => [
          f,
          f.charAt(0).toUpperCase() + f.slice(1),
          f.toUpperCase(),
          f.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
        ])
      )
    );
    const sortedFacilityKey = uniqueFacilitiesList.slice().sort().join(",");
    const featuredKey = wantsFeatured ? "featured" : "all";
    const badgeKey = `${wantsWaterTank ? "wt1" : "wt0"}-${wantsWifiSpeedtest ? "wf1" : "wf0"}`;
    const cacheKey = `properties:${district || "all"}:${effectiveMin || 0}:${effectiveMax || 0}:${sortedFacilityKey || "all"}:${targetOwner || "all"}:${featuredKey}:${badgeKey}:${limitParam || "all"}:${offsetParam || 0}`;
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
      if (wantsFeatured) {
        sql += " AND p.is_featured = 1 AND (p.featured_until IS NULL OR p.featured_until > NOW())";
      }
      if (wantsWaterTank) {
        sql += " AND p.verified_water_tank = 1";
      }
      if (wantsWifiSpeedtest) {
        sql += " AND p.verified_wifi_speedtest = 1";
      }
      if (uniqueFacilitiesList.length > 0) {
        const placeholders = expandedFacilityVariants.map(() => "?").join(", ");
        sql += ` AND p.id IN (
          SELECT pf_sub.propertyId
          FROM property_facilities pf_sub
          WHERE pf_sub.facility IN (${placeholders})
          GROUP BY pf_sub.propertyId
          HAVING COUNT(DISTINCT LOWER(pf_sub.facility)) = ?
        )`;
        params.push(...expandedFacilityVariants, uniqueFacilitiesList.length);
      }
      sql += " GROUP BY p.id ORDER BY (p.is_featured = 1 AND (p.featured_until IS NULL OR p.featured_until > NOW())) DESC, p.id DESC";
      if (limitParam && limitParam > 0) {
        sql += " LIMIT ? OFFSET ?";
        params.push(limitParam, Math.max(0, offsetParam));
      }
      const [properties] = await pool.query(sql, params);
      for (const prop of properties) {
        prop.facilities = prop.facilitiesString ? prop.facilitiesString.split(",").filter(Boolean) : [];
        delete prop.facilitiesString;
      }
      const normalized = properties.map(normalizePropertySummary);
      apiCache.set(cacheKey, normalized, 60);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
      res.json(normalized);
    } catch (err) {
      console.error("Error in GET /api/properties:", err);
      res.status(500).json({ error: "Internal Server Error", message: "Gagal mengambil properti." });
    }
  });
  router2.get("/properties/recommended", async (req, res) => {
    try {
      const latParam = req.query.lat ? parseFloat(String(req.query.lat)) : void 0;
      const lngParam = req.query.lng ? parseFloat(String(req.query.lng)) : void 0;
      const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const userKey = String(req.query.userId || req.query.deviceToken || req.headers["x-device-token"] || "");
      let normalized = apiCache.get("properties:recommended:candidates");
      if (!normalized) {
        const [properties] = await pool.query(`
          SELECT
            p.id,
            p.name,
            p.district,
            p.address,
            p.price,
            p.rating,
            p.image,
            SUBSTRING(p.description, 1, 240) as description,
            p.latitude,
            p.longitude,
            p.totalRooms,
            p.occupiedRooms,
            p.ownerId,
            p.document,
            p.is_featured,
            p.featured_until,
            p.verified_water_tank,
            p.verified_wifi_speedtest,
            GROUP_CONCAT(pf.facility SEPARATOR ',') as facilitiesString
          FROM properties p
          LEFT JOIN property_facilities pf ON p.id = pf.propertyId
          GROUP BY p.id
          LIMIT 200
        `);
        for (const prop of properties) {
          prop.facilities = prop.facilitiesString ? prop.facilitiesString.split(",").filter(Boolean) : [];
          delete prop.facilitiesString;
        }
        normalized = properties.map(normalizePropertySummary);
        apiCache.set("properties:recommended:candidates", normalized, 30);
      }
      const ranked = recommendationService.rankProperties(normalized, {
        userKey: userKey || void 0,
        targetLat: latParam,
        targetLng: lngParam,
        limit: limitParam > 0 ? limitParam : 10
      });
      res.json(ranked);
    } catch (err) {
      console.error("Error in GET /api/properties/recommended:", err);
      res.status(500).json({ message: "Gagal mengambil rekomendasi properti." });
    }
  });
  router2.get("/properties/:id", async (req, res) => {
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
  router2.post(
    "/properties",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    validateBody(propertySchema),
    async (req, res) => {
      const {
        name,
        district,
        address,
        price,
        description,
        facilities,
        latitude,
        longitude,
        totalRooms,
        occupiedRooms,
        image,
        ownerId,
        verified_water_tank,
        verified_wifi_speedtest,
        document
      } = req.body;
      const authUser = req.user;
      if (!name || !district || !address || !price) {
        return res.status(400).json({ message: "Nama, wilayah, alamat, dan harga wajib diisi." });
      }
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const propId = generateId("prop");
        const landlordId = authUser?.role === "admin" && ownerId ? ownerId : authUser?.id || ownerId || "user-landlord";
        const initialWaterTank = verified_water_tank ? 1 : 0;
        const initialWifiSpeedtest = verified_wifi_speedtest ? 1 : 0;
        const initialOccupied = occupiedRooms !== void 0 ? Math.max(0, parseInt(String(occupiedRooms), 10) || 0) : 0;
        const docName = document && String(document).trim() !== "" ? String(document).trim() : "sertifikat_kepemilikan.pdf";
        await connection.query(
          `INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document, verified_water_tank, verified_wifi_speedtest) 
           VALUES (?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            initialOccupied,
            landlordId,
            docName,
            initialWaterTank,
            initialWifiSpeedtest
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
        apiCache.invalidatePattern("landlord:");
        apiCache.invalidatePattern("admin:");
        res.status(201).json({ message: "Properti berhasil ditambahkan!", id: propId, propertyId: propId });
      } catch (err) {
        await connection.rollback();
        console.error("Create property error:", err);
        res.status(500).json({ message: "Gagal menyimpan properti." });
      } finally {
        connection.release();
      }
    }
  );
  router2.put("/properties/:id", authenticateToken, requireRole(["admin", "landlord"]), validateBody(propertyUpdateSchema), async (req, res) => {
    const { id } = req.params;
    const {
      name,
      district,
      address,
      price,
      description,
      facilities,
      latitude,
      longitude,
      totalRooms,
      occupiedRooms,
      image,
      ownerId,
      verified_water_tank,
      verified_wifi_speedtest
    } = req.body;
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
      const updatedOwnerId = authUser?.role === "admin" && ownerId !== void 0 && String(ownerId).trim() !== "" ? String(ownerId).trim() : existing.ownerId;
      const updatedWaterTank = verified_water_tank !== void 0 ? verified_water_tank ? 1 : 0 : Number(existing.verified_water_tank || 0);
      const updatedWifiSpeedtest = verified_wifi_speedtest !== void 0 ? verified_wifi_speedtest ? 1 : 0 : Number(existing.verified_wifi_speedtest || 0);
      await connection.query(
        `UPDATE properties SET name = ?, district = ?, address = ?, price = ?, description = ?, 
         latitude = ?, longitude = ?, totalRooms = ?, occupiedRooms = ?, image = ?, ownerId = ?,
         verified_water_tank = ?, verified_wifi_speedtest = ?
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
          updatedOwnerId,
          updatedWaterTank,
          updatedWifiSpeedtest,
          id
        ]
      );
      const [roomCountRows] = await connection.query(
        "SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?",
        [id]
      );
      if (Number(roomCountRows[0]?.count || 0) > 0) {
        await syncPropertyRoomCounts(connection, String(id));
      }
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
      apiCache.invalidatePattern("landlord:");
      apiCache.invalidatePattern("admin:");
      res.json({ message: "Properti berhasil diperbarui!" });
    } catch (err) {
      await connection.rollback();
      console.error("Update property error:", err);
      res.status(500).json({ message: "Gagal memperbarui properti." });
    } finally {
      connection.release();
    }
  });
  router2.delete("/properties/:id", authenticateToken, requireRole(["admin", "landlord"]), async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
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
        "SELECT COUNT(*) as activeCount FROM rentals WHERE propertyId = ? AND status IN ('active', 'pending')",
        [id]
      );
      if (Number(activeRentals[0]?.activeCount || 0) > 0) {
        await connection.rollback();
        return res.status(409).json({
          message: "Properti tidak dapat dihapus karena masih memiliki sewa aktif berjalan atau menunggu pembayaran."
        });
      }
      const [userRows] = await connection.query("SELECT password FROM users WHERE id = ?", [callerId]);
      const caller = userRows[0];
      const isMatch = caller && caller.password ? await bcrypt4.compare(password, caller.password) : false;
      if (!caller || !caller.password || !isMatch) {
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
  const handleFeatureProperty = async (req, res) => {
    const { id } = req.params;
    const { isFeatured, durationDays, featuredUntil } = req.body;
    const authUser = req.user;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        "SELECT id, name, ownerId, is_featured, featured_until FROM properties WHERE id = ? FOR UPDATE",
        [id]
      );
      const property = rows[0];
      if (!property) {
        await connection.rollback();
        return res.status(404).json({ message: "Properti tidak ditemukan." });
      }
      if (authUser?.role !== "admin" && property.ownerId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: "Akses ditolak. Anda bukan pemilik properti ini." });
      }
      let newFeaturedUntil = null;
      const willBeFeatured = isFeatured !== false;
      if (willBeFeatured) {
        if (featuredUntil) {
          newFeaturedUntil = new Date(String(featuredUntil)).toISOString().slice(0, 19).replace("T", " ");
        } else {
          const days = durationDays && Number(durationDays) > 0 ? Number(durationDays) : 30;
          const expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1e3);
          newFeaturedUntil = expiry.toISOString().slice(0, 19).replace("T", " ");
        }
      }
      await connection.query(
        "UPDATE properties SET is_featured = ?, featured_until = ? WHERE id = ?",
        [willBeFeatured ? 1 : 0, newFeaturedUntil, id]
      );
      await connection.commit();
      apiCache.invalidatePattern("properties");
      return res.json({
        success: true,
        message: willBeFeatured ? "Status featured properti berhasil diaktifkan." : "Status featured properti dinonaktifkan.",
        propertyId: id,
        is_featured: willBeFeatured,
        isFeatured: willBeFeatured,
        featured_until: newFeaturedUntil,
        featuredUntil: newFeaturedUntil
      });
    } catch (err) {
      await connection.rollback();
      console.error("Error setting property featured status:", err);
      return res.status(500).json({ message: "Gagal memperbarui status featured properti." });
    } finally {
      connection.release();
    }
  };
  router2.post(
    "/properties/:id/feature",
    authenticateToken,
    requireRole(["admin", "landlord", "owner"]),
    validateBody(featurePropertySchema),
    handleFeatureProperty
  );
  router2.patch(
    "/properties/:id/feature",
    authenticateToken,
    requireRole(["admin", "landlord", "owner"]),
    validateBody(featurePropertySchema),
    handleFeatureProperty
  );
}

// backend/routes/reviews.routes.ts
function registerReviewRoutes(router2) {
  router2.get("/reviews", async (req, res) => {
    const { propertyId, userId, ownerId } = req.query;
    const cacheKey = `reviews:${propertyId || "all"}:${userId || "all"}:${ownerId || "all"}`;
    const cachedReviews = apiCache.get(cacheKey);
    if (cachedReviews) {
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
      return res.json(cachedReviews);
    }
    try {
      let sql = "SELECT r.* FROM reviews r";
      const params = [];
      if (ownerId) {
        sql += " JOIN properties p ON r.propertyId = p.id";
      }
      sql += " WHERE 1=1";
      if (propertyId) {
        sql += " AND r.propertyId = ?";
        params.push(String(propertyId));
      }
      if (userId) {
        sql += " AND r.userId = ?";
        params.push(String(userId));
      }
      if (ownerId) {
        sql += " AND p.ownerId = ?";
        params.push(String(ownerId));
      }
      sql += " ORDER BY r.id DESC";
      const [rows] = await pool.query(sql, params);
      apiCache.set(cacheKey, rows, 60);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
      res.json(rows);
    } catch (err) {
      console.error("Error in GET /api/reviews:", err);
      res.status(500).json({ error: "Internal Server Error", message: "Gagal mengambil data review." });
    }
  });
  router2.post(
    "/reviews",
    authenticateToken,
    validateBody(reviewSchema),
    async (req, res) => {
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
        if (authUser.role !== "admin") {
          const [verifiedRentalRows] = await connection.query(
            "SELECT id FROM rentals WHERE tenantId = ? AND propertyId = ? AND status IN ('active', 'completed', 'terminated') LIMIT 1",
            [userId, propertyId]
          );
          if (verifiedRentalRows.length === 0) {
            await connection.rollback();
            return res.status(403).json({
              message: "Anda harus memiliki riwayat sewa terverifikasi pada properti ini untuk memberikan ulasan."
            });
          }
        }
        const [existingReviews] = await connection.query(
          "SELECT id FROM reviews WHERE propertyId = ? AND userId = ? FOR UPDATE",
          [propertyId, userId]
        );
        if (existingReviews.length > 0) {
          await connection.rollback();
          return res.status(409).json({
            message: "Anda sudah memberikan ulasan untuk properti ini."
          });
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
        await connection.query(`
          UPDATE properties
          SET rating = COALESCE((
            SELECT ROUND(AVG(rating), 1)
            FROM reviews
            WHERE propertyId = ?
          ), 0.0)
          WHERE id = ?
        `, [propertyId, propertyId]);
        await connection.commit();
        apiCache.invalidatePattern("reviews");
        apiCache.invalidatePattern("properties");
        apiCache.invalidatePattern("landlord:");
        res.status(201).json({ message: "Review berhasil ditambahkan!" });
      } catch (err) {
        await connection.rollback();
        console.error("Create review error:", err);
        res.status(500).json({ message: "Gagal menyimpan review." });
      } finally {
        connection.release();
      }
    }
  );
  router2.put("/reviews/:id", authenticateToken, validateBody(reviewUpdateSchema), async (req, res) => {
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
      await connection.query(`
        UPDATE properties
        SET rating = COALESCE((
          SELECT ROUND(AVG(rating), 1)
          FROM reviews
          WHERE propertyId = ?
        ), 0.0)
        WHERE id = ?
      `, [review.propertyId, review.propertyId]);
      await connection.commit();
      apiCache.invalidatePattern("reviews");
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("landlord:");
      res.json({ message: "Review berhasil diperbarui!" });
    } catch (err) {
      await connection.rollback();
      console.error("Update review error:", err);
      res.status(500).json({ message: "Gagal memperbarui review." });
    } finally {
      connection.release();
    }
  });
  router2.delete("/reviews/:id", authenticateToken, async (req, res) => {
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
      await connection.query(`
        UPDATE properties
        SET rating = COALESCE((
          SELECT ROUND(AVG(rating), 1)
          FROM reviews
          WHERE propertyId = ?
        ), 0.0)
        WHERE id = ?
      `, [review.propertyId, review.propertyId]);
      await connection.commit();
      apiCache.invalidatePattern("reviews");
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("landlord:");
      res.json({ message: "Review berhasil dihapus!" });
    } catch (err) {
      await connection.rollback();
      console.error("Delete review error:", err);
      res.status(500).json({ message: "Gagal menghapus review." });
    } finally {
      connection.release();
    }
  });
}

// backend/routes/landlord.routes.ts
import bcrypt6 from "bcryptjs";

// backend/routes/tracking.routes.ts
import XLSX from "xlsx";
function sanitizeSpreadsheetCell(val) {
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : "";
  }
  if (val === null || val === void 0) {
    return "";
  }
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str.trimStart())) {
    return `'${str}`;
  }
  return str;
}
var handleRecordVisit = async (req, res) => {
  const rawIp = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
  const firstIp = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
  const ip = firstIp.split(",")[0].trim().substring(0, 255);
  const userAgent = String(req.headers["user-agent"] || "").substring(0, 1e3);
  const cacheKey = `tracking:ip:${ip}`;
  if (apiCache.get(cacheKey)) {
    return res.status(200).json({
      success: true,
      message: "Kunjungan telah dicatat.",
      deduplicated: true
    });
  }
  apiCache.set(cacheKey, true, 900);
  try {
    const [recentVisits] = await pool.query(
      "SELECT id FROM visitor_tracking WHERE ip_address = ? AND visited_at >= NOW() - INTERVAL 15 MINUTE LIMIT 1",
      [ip]
    );
    if (recentVisits.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Kunjungan telah dicatat.",
        deduplicated: true
      });
    }
    await pool.query(
      "INSERT INTO visitor_tracking (ip_address, user_agent) VALUES (?, ?)",
      [ip, userAgent]
    );
    apiCache.del("admin:stats");
    return res.status(201).json({
      success: true,
      message: "Kunjungan berhasil dilacak."
    });
  } catch (err) {
    if (typeof apiCache.invalidate === "function") {
      apiCache.invalidate(cacheKey);
    } else {
      apiCache.del(cacheKey);
    }
    console.error("Error in visitor tracking:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "Gagal melacak kunjungan." });
  }
};
async function safeCount(query, params = []) {
  try {
    const [rows] = await pool.query(query, params);
    return Number(rows[0]?.count ?? 0) || 0;
  } catch (err) {
    console.warn(`[AdminStats] Non-fatal count query error: "${query}":`, err);
    return 0;
  }
}
async function safeRoomCount() {
  try {
    const [rows] = await pool.query("SELECT COUNT(*) as count FROM rooms");
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) return count;
  } catch {
  }
  return safeCount("SELECT COALESCE(SUM(totalRooms), 0) as count FROM properties");
}
function registerTrackingRoutes(router2) {
  router2.post(
    "/tracking/interaction",
    trackingLimiter,
    validateBody(interactionTelemetrySchema),
    async (req, res) => {
      try {
        const { propertyId, interactionType, userId, deviceToken, metadata } = req.body;
        const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anon";
        const firstIp = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
        const userKey = String(userId || deviceToken || req.headers["x-device-token"] || firstIp);
        let targetProp;
        try {
          const [rows] = await pool.query(
            "SELECT * FROM properties WHERE id = ? LIMIT 1",
            [propertyId]
          );
          targetProp = rows[0];
        } catch {
        }
        const { event, updatedWeights } = recommendationService.recordInteraction({
          userKey,
          propertyId,
          interactionType,
          property: targetProp,
          metadata
        });
        res.status(201).json({
          success: true,
          message: "Interaksi berhasil dicatat dan bobot preferensi diperbarui.",
          event,
          weights: updatedWeights
        });
      } catch (err) {
        console.error("Error in POST /api/tracking/interaction:", err);
        res.status(500).json({ message: "Gagal mencatat interaksi pengguna." });
      }
    }
  );
  const trackVisitHandler = handleRecordVisit;
  router2.post("/tracking", trackingLimiter, validateBody(visitorTrackingSchema), trackVisitHandler);
  router2.post("/tracking/visit", trackingLimiter, validateBody(visitorTrackingSchema), trackVisitHandler);
  router2.get("/admin/stats", authenticateToken, requireRole(["admin"]), async (_req, res) => {
    try {
      const cacheKey = "admin:stats";
      const cached = apiCache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      const [
        visitors,
        users,
        landlords,
        properties,
        rooms,
        activeRentals,
        pendingWithdrawals,
        openTickets
      ] = await Promise.all([
        safeCount("SELECT COUNT(*) as count FROM visitor_tracking"),
        safeCount("SELECT COUNT(*) as count FROM users"),
        safeCount("SELECT COUNT(*) as count FROM users WHERE role = 'landlord'"),
        safeCount("SELECT COUNT(*) as count FROM properties"),
        safeRoomCount(),
        safeCount("SELECT COUNT(*) as count FROM rentals WHERE status = 'active'"),
        safeCount("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'"),
        safeCount("SELECT COUNT(*) as count FROM maintenance_tickets WHERE status IN ('open', 'in_progress', 'pending')")
      ]);
      const statsData = {
        visitors,
        users,
        landlords,
        properties,
        rooms,
        activeRentals,
        pendingWithdrawals,
        openTickets,
        totalVisitors: visitors,
        totalUsers: users,
        totalLandlords: landlords,
        totalProperties: properties,
        totalRooms: rooms
      };
      apiCache.set(cacheKey, statsData, 30);
      res.json(statsData);
    } catch (err) {
      console.error("Admin stats error:", err);
      res.status(500).json({ message: "Gagal mengambil statistik admin." });
    }
  });
  router2.get("/admin/tracking-history", authenticateToken, requireRole(["admin"]), async (_req, res) => {
    try {
      const [rows24h] = await pool.query(`
        SELECT 
          TIMESTAMPDIFF(HOUR, DATE_FORMAT(visited_at, '%Y-%m-%d %H:00:00'), DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00')) as hours_ago,
          COUNT(*) as count
        FROM visitor_tracking
        WHERE visited_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00'), INTERVAL 23 HOUR)
        GROUP BY hours_ago
        ORDER BY hours_ago ASC
      `);
      const [rows7d] = await pool.query(`
        SELECT 
          DATEDIFF(NOW(), visited_at) as days_ago,
          COUNT(*) as count
        FROM visitor_tracking
        WHERE visited_at >= DATE(NOW() - INTERVAL 6 DAY)
        GROUP BY days_ago
        ORDER BY days_ago ASC
      `);
      const [rows30d] = await pool.query(`
        SELECT 
          DATEDIFF(NOW(), visited_at) as days_ago,
          COUNT(*) as count
        FROM visitor_tracking
        WHERE visited_at >= DATE(NOW() - INTERVAL 29 DAY)
        GROUP BY days_ago
        ORDER BY days_ago ASC
      `);
      const now = /* @__PURE__ */ new Date();
      const data24h = [];
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 60 * 60 * 1e3);
        const hour = String(d.getHours()).padStart(2, "0");
        const hourLabel = `${hour}:00`;
        const match = rows24h.find((r) => Number(r.hours_ago) === i);
        data24h.push({
          label: hourLabel,
          count: match ? Number(match.count) : 0
        });
      }
      const data7d = [];
      const daysName = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1e3);
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const date = String(d.getDate()).padStart(2, "0");
        const dayLabel = daysName[d.getDay()] + ` (${date}/${month})`;
        const match = rows7d.find((r) => Number(r.days_ago) === i);
        data7d.push({
          label: dayLabel,
          count: match ? Number(match.count) : 0
        });
      }
      const data30d = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1e3);
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const date = String(d.getDate()).padStart(2, "0");
        const dayLabel = `${date}/${month}`;
        const match = rows30d.find((r) => Number(r.days_ago) === i);
        data30d.push({
          label: dayLabel,
          count: match ? Number(match.count) : 0
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
  router2.get("/reports/tracking/excel", authenticateToken, requireRole(["admin"]), async (_req, res) => {
    try {
      const [
        [visitorRows],
        [userRows],
        [landlordRows],
        [propertyRows],
        [roomsRows],
        [visitors],
        [users]
      ] = await Promise.all([
        pool.query("SELECT COUNT(*) as count FROM visitor_tracking"),
        pool.query("SELECT COUNT(*) as count FROM users"),
        pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'landlord'"),
        pool.query("SELECT COUNT(*) as count FROM properties"),
        pool.query("SELECT COALESCE(SUM(totalRooms), 0) as sum FROM properties"),
        pool.query("SELECT ip_address, user_agent, visited_at FROM visitor_tracking ORDER BY visited_at DESC LIMIT 1000"),
        pool.query("SELECT id, email, name, role, phone FROM users ORDER BY id DESC LIMIT 5000")
      ]);
      const totalLandlords = landlordRows[0].count;
      const totalProperties = propertyRows[0].count;
      const totalRooms = roomsRows[0].sum || 0;
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
      visitors.forEach(
        (v) => visitorData.push([
          sanitizeSpreadsheetCell(v.ip_address),
          sanitizeSpreadsheetCell(v.user_agent),
          sanitizeSpreadsheetCell(v.visited_at ? new Date(v.visited_at).toLocaleString("id-ID") : "")
        ])
      );
      const visitorSheet = XLSX.utils.aoa_to_sheet(visitorData);
      XLSX.utils.book_append_sheet(wb, visitorSheet, "Pengunjung");
      const userData = [["ID", "Email", "Nama", "Role", "Telepon"]];
      users.forEach(
        (u) => userData.push([
          sanitizeSpreadsheetCell(u.id),
          sanitizeSpreadsheetCell(u.email),
          sanitizeSpreadsheetCell(u.name),
          sanitizeSpreadsheetCell(u.role),
          sanitizeSpreadsheetCell(u.phone)
        ])
      );
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
  router2.post("/reports/download-token", authenticateToken, (req, res) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }
    const downloadToken = generateJwtToken(
      {
        id: authUser.id,
        email: authUser.email,
        role: authUser.role,
        purpose: "download_report"
      },
      void 0,
      "60s"
    );
    res.json({ downloadToken, expiresInSeconds: 60 });
  });
  router2.get("/reports/landlord/excel", authenticateToken, requireRole(["admin", "landlord"]), handleLandlordExcelReport);
}
var handleLandlordExcelReport = async (req, res) => {
  const authUser = req.user;
  if (!authUser) {
    res.status(401).json({ message: "Otentikasi diperlukan." });
    return;
  }
  const landlordId = authUser.role === "admin" && req.query.landlordId ? String(req.query.landlordId) : authUser.id;
  if (!landlordId) {
    res.status(400).json({ message: "landlordId diperlukan." });
    return;
  }
  try {
    const [landlords] = await pool.query("SELECT * FROM users WHERE id = ?", [landlordId]);
    const landlord = landlords[0];
    if (!landlord) {
      res.status(404).json({ message: "Landlord tidak ditemukan." });
      return;
    }
    const [properties] = await pool.query("SELECT * FROM properties WHERE ownerId = ? LIMIT 1000", [landlord.id]);
    const [transactions] = await pool.query(
      `SELECT r.*, p.name as propertyName FROM rentals r 
       JOIN properties p ON r.propertyId = p.id 
       WHERE p.ownerId = ? ORDER BY r.id DESC LIMIT 5000`,
      [landlord.id]
    );
    const wb = XLSX.utils.book_new();
    const summaryData = [
      ["Laporan Keuangan Landlord"],
      ["Nama", sanitizeSpreadsheetCell(landlord.name)],
      ["Email", sanitizeSpreadsheetCell(landlord.email)],
      ["Total Pendapatan", Number(landlord.totalRevenue || 0)],
      ["Total Penarikan", Number(landlord.totalWithdrawn || 0)],
      ["Saldo", Number(landlord.balance || 0)],
      [""],
      ["Ringkasan Properti"],
      ["Nama Properti", "Lokasi", "Harga", "Total Kamar", "Kamar Tersedia"]
    ];
    properties.forEach(
      (p) => summaryData.push([
        sanitizeSpreadsheetCell(p.name),
        sanitizeSpreadsheetCell(p.district),
        Number(p.price || 0),
        Number(p.totalRooms || 0),
        Number(p.totalRooms || 0) - Number(p.occupiedRooms || 0)
      ])
    );
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Ringkasan Keuangan");
    const txData = [["ID Transaksi", "Properti", "Tanggal", "Jumlah", "Status"]];
    transactions.forEach((t) => {
      const statusLabel = t.status === "active" ? "Aktif" : t.status === "pending" ? "Menunggu Pembayaran" : t.status === "cancelled" ? "Dibatalkan" : "Selesai";
      txData.push([
        sanitizeSpreadsheetCell(t.id),
        sanitizeSpreadsheetCell(t.propertyName || ""),
        sanitizeSpreadsheetCell(t.startDate || ""),
        Number(t.price || 0),
        statusLabel
      ]);
    });
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
};

// backend/services/rental.service.ts
import bcrypt5 from "bcryptjs";

// backend/repositories/rentals.repository.ts
var RentalsRepository = class {
  defaultPool;
  constructor(customPool = pool) {
    this.defaultPool = customPool;
  }
  async findRentalsByFilter(role, userId, tenantIdFilter, limit, offset = 0) {
    let sql = `
      SELECT 
        r.*,
        rm.roomNumber,
        rm.floor AS roomFloor,
        rm.type AS roomType
      FROM rentals r
      LEFT JOIN rooms rm ON r.roomId = rm.id
      WHERE 1=1
    `;
    const params = [];
    if (role === "tenant") {
      sql += " AND r.tenantId = ?";
      params.push(userId);
    } else if (role === "landlord") {
      sql += " AND r.propertyId IN (SELECT id FROM properties WHERE ownerId = ?)";
      params.push(userId);
    } else if (role === "admin" && tenantIdFilter) {
      sql += " AND r.tenantId = ?";
      params.push(tenantIdFilter);
    }
    sql += " ORDER BY r.id DESC";
    if (limit && limit > 0) {
      sql += " LIMIT ? OFFSET ?";
      params.push(limit, Math.max(0, offset));
    }
    const [rows] = await this.defaultPool.query(sql, params);
    return rows;
  }
  async findTenantRentals(tenantId) {
    const sql = `
      SELECT 
        r.*,
        rm.roomNumber,
        rm.floor AS roomFloor,
        rm.type AS roomType
      FROM rentals r
      LEFT JOIN rooms rm ON r.roomId = rm.id
      WHERE r.tenantId = ? 
      ORDER BY r.id DESC
    `;
    const [rows] = await this.defaultPool.query(sql, [tenantId]);
    return rows;
  }
  async findRentalById(rentalId, conn = this.defaultPool, forUpdate = false) {
    const sql = `
      SELECT 
        r.*,
        p.name AS propertyName,
        p.address AS propertyAddress,
        p.ownerId AS propertyOwnerId,
        rm.roomNumber,
        rm.floor AS roomFloor,
        rm.type AS roomType
      FROM rentals r
      LEFT JOIN properties p ON r.propertyId = p.id
      LEFT JOIN rooms rm ON r.roomId = rm.id
      WHERE r.id = ?${forUpdate ? " FOR UPDATE" : ""}
    `;
    const [rows] = await conn.query(sql, [rentalId]);
    return rows[0];
  }
  async findExistingRentalForUpdate(rentalId, conn) {
    const [rows] = await conn.query(
      "SELECT id, status, document, roomId, propertyId, price, duration_months FROM rentals WHERE id = ? FOR UPDATE",
      [rentalId]
    );
    return rows[0];
  }
  async findActiveRentalsByTenantId(tenantId, conn, forUpdate = true) {
    const sql = `SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active'${forUpdate ? " FOR UPDATE" : ""}`;
    const [rows] = await conn.query(sql, [tenantId]);
    return rows;
  }
  async insertRentalBooking(data, conn) {
    const startDateIso = /^\d{4}-\d{2}-\d{2}$/.test(data.startDate.trim()) ? data.startDate.trim() : null;
    const sql = `
      INSERT INTO rentals (id, tenantId, propertyId, roomId, propertyName, price, startDate, start_date_iso, status, document, duration_months)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await conn.query(sql, [
      data.id,
      data.tenantId,
      data.propertyId,
      data.roomId || null,
      data.propertyName,
      data.price,
      data.startDate,
      startDateIso,
      data.status,
      data.document,
      data.durationMonths
    ]);
  }
  async updateRentalStatus(rentalId, status, conn) {
    if (status === "terminated") {
      await conn.query("UPDATE rentals SET status = ?, terminated_at = NOW() WHERE id = ?", [status, rentalId]);
    } else {
      await conn.query("UPDATE rentals SET status = ? WHERE id = ?", [status, rentalId]);
    }
  }
  async decrementPropertyOccupied(propertyId, conn) {
    await conn.query(
      "UPDATE properties SET occupiedRooms = GREATEST(0, occupiedRooms - 1) WHERE id = ?",
      [propertyId]
    );
  }
  async setRoomStatus(roomId, status, conn) {
    await conn.query(
      "UPDATE rooms SET status = ?, reserved_until = NULL, reserved_by_rental_id = NULL WHERE id = ?",
      [status, roomId]
    );
  }
  async clearRoomHoldByRentalId(rentalId, conn) {
    await conn.query(
      "UPDATE rooms SET reserved_until = NULL, reserved_by_rental_id = NULL WHERE reserved_by_rental_id = ?",
      [rentalId]
    );
  }
  async creditLandlordBalance(ownerId, revenue, conn) {
    await conn.query(
      "UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?",
      [revenue, revenue, ownerId]
    );
  }
  async advanceRentalDuration(rentalId, addedMonths, conn) {
    await conn.query(
      "UPDATE rentals SET status = 'active', duration_months = COALESCE(duration_months, 1) + ? WHERE id = ?",
      [addedMonths, rentalId]
    );
  }
  async creditLandlordNetBalance(ownerId, netRevenue, grossRevenue, conn) {
    await conn.query(
      "UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?",
      [netRevenue, grossRevenue, ownerId]
    );
  }
  async findUserById(userId, conn = this.defaultPool, forUpdate = false) {
    const sql = `SELECT * FROM users WHERE id = ?${forUpdate ? " FOR UPDATE" : ""}`;
    const [rows] = await conn.query(sql, [userId]);
    return rows[0];
  }
  async findUserPasswordById(userId, conn = this.defaultPool) {
    const [rows] = await conn.query("SELECT password FROM users WHERE id = ?", [userId]);
    return rows[0];
  }
  async findPropertyById(propertyId, conn = this.defaultPool, forUpdate = false) {
    const sql = `SELECT totalRooms, occupiedRooms, price, name, address, ownerId FROM properties WHERE id = ?${forUpdate ? " FOR UPDATE" : ""}`;
    const [rows] = await conn.query(sql, [propertyId]);
    return rows[0];
  }
  async findRoomById(roomId, propertyId, conn = this.defaultPool, forUpdate = false) {
    const sql = `SELECT id, propertyId, roomNumber, floor, type, price, status, reserved_until, reserved_by_rental_id,
      GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
      FROM rooms WHERE id = ? AND propertyId = ?${forUpdate ? " FOR UPDATE" : ""}`;
    const [rows] = await conn.query(sql, [roomId, propertyId]);
    return rows[0];
  }
  async findAvailableRoom(propertyId, conn, forUpdate = true, rentalId) {
    const holdFilter = rentalId ? "(reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL OR reserved_by_rental_id = ?)" : "(reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL)";
    const params = rentalId ? [propertyId, rentalId] : [propertyId];
    const sql = `SELECT id, propertyId, roomNumber, floor, type, price, status, reserved_until, reserved_by_rental_id,
      GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
      FROM rooms WHERE propertyId = ? AND status = 'available' AND ${holdFilter} ORDER BY roomNumber ASC, id ASC LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`;
    const [rows] = await conn.query(sql, params);
    return rows[0];
  }
  async countRoomsByPropertyId(propertyId, conn = this.defaultPool) {
    const [rows] = await conn.query(
      "SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?",
      [propertyId]
    );
    return Number(rows[0]?.count || 0);
  }
  async incrementPropertyOccupied(propertyId, conn) {
    await conn.query("UPDATE properties SET occupiedRooms = occupiedRooms + 1 WHERE id = ?", [
      propertyId
    ]);
  }
  async activateExistingRental(rentalId, effectivePrice, documentUrl, duration, conn) {
    await conn.query(
      "UPDATE rentals SET status = 'active', price = ?, document = ?, duration_months = ? WHERE id = ?",
      [effectivePrice, documentUrl, duration, rentalId]
    );
  }
  async findRentalSummaryById(rentalId, conn = this.defaultPool) {
    const [rows] = await conn.query(
      "SELECT id, tenantId, propertyId, roomId, status FROM rentals WHERE id = ?",
      [rentalId]
    );
    return rows[0];
  }
  async findRentalForUpdate(rentalId, conn) {
    const [rows] = await conn.query(
      "SELECT id, tenantId, propertyId, roomId, status FROM rentals WHERE id = ? FOR UPDATE",
      [rentalId]
    );
    return rows[0];
  }
  async lockRoomById(roomId, conn) {
    const [rows] = await conn.query(
      "SELECT id, status FROM rooms WHERE id = ? FOR UPDATE",
      [roomId]
    );
    return rows[0];
  }
};
var rentalsRepository = new RentalsRepository();

// backend/services/payment.service.ts
import crypto4 from "crypto";
import midtransClient from "midtrans-client";

// backend/repositories/payment.repository.ts
var PaymentRepository = class {
  defaultPool;
  constructor(customPool = pool) {
    this.defaultPool = customPool;
  }
  async findByOrderIdForUpdate(orderId, conn) {
    const [rows] = await conn.query(
      "SELECT * FROM payment_transactions WHERE order_id = ? FOR UPDATE",
      [orderId]
    );
    return rows[0];
  }
  async upsertPendingTransaction(input, conn = this.defaultPool) {
    await conn.query(
      `INSERT INTO payment_transactions (order_id, rental_id, tx_type, gross_amount, months, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         gross_amount = VALUES(gross_amount),
         months = VALUES(months)`,
      [
        input.orderId,
        input.rentalId,
        input.txType,
        input.grossAmount,
        input.months,
        input.status || "pending"
      ]
    );
  }
  async recordFinalTransactionStatus(input, conn) {
    if (input.status === "settled") {
      await conn.query(
        `INSERT INTO payment_transactions (order_id, rental_id, tx_type, gross_amount, months, status, settled_at)
         VALUES (?, ?, ?, ?, ?, 'settled', NOW())
         ON DUPLICATE KEY UPDATE
           status = 'settled',
           gross_amount = VALUES(gross_amount),
           months = VALUES(months),
           settled_at = COALESCE(settled_at, NOW())`,
        [input.orderId, input.rentalId, input.txType, input.grossAmount, input.months]
      );
    } else {
      await conn.query(
        `INSERT INTO payment_transactions (order_id, rental_id, tx_type, gross_amount, months, status)
         VALUES (?, ?, ?, ?, ?, 'refund_required')
         ON DUPLICATE KEY UPDATE
           status = 'refund_required'`,
        [input.orderId, input.rentalId, input.txType, input.grossAmount, input.months]
      );
    }
  }
  async markPendingInitialTransactionsSettled(rentalId, conn) {
    await conn.query(
      `UPDATE payment_transactions
       SET status = 'settled', settled_at = COALESCE(settled_at, NOW())
       WHERE rental_id = ? AND tx_type = 'initial' AND status = 'pending'`,
      [rentalId]
    );
  }
  async markTransactionCancelled(orderId, conn = this.defaultPool) {
    await conn.query(
      `UPDATE payment_transactions
       SET status = 'cancelled'
       WHERE order_id = ? AND status = 'pending'`,
      [orderId]
    );
  }
  async clearRoomHoldByRentalId(rentalId, conn = this.defaultPool) {
    await conn.query(
      `UPDATE rooms
       SET reserved_until = NULL, reserved_by_rental_id = NULL
       WHERE reserved_by_rental_id = ?`,
      [rentalId]
    );
  }
};
var paymentRepository = new PaymentRepository();

// backend/services/payment.service.ts
function isLockContentionError(err) {
  if (!err || typeof err !== "object") return false;
  const dbErr = err;
  return dbErr.code === "ER_LOCK_WAIT_TIMEOUT" || dbErr.errno === 1205 || dbErr.code === "ER_LOCK_DEADLOCK" || dbErr.errno === 1213 || typeof dbErr.message === "string" && (dbErr.message.includes("Lock wait timeout exceeded") || dbErr.message.includes("Deadlock found"));
}
var MIDTRANS_PLACEHOLDERS = [
  "placeholder",
  "your-server-key",
  "your_server_key",
  "your-client-key",
  "your_client_key",
  "dummy",
  "sample",
  "sb-mid-server-placeholder",
  "sb-mid-client-placeholder"
];
function isMidtransConfigured() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  if (!serverKey || !clientKey) return false;
  const s = serverKey.trim().toLowerCase();
  const c = clientKey.trim().toLowerCase();
  if (s === "" || c === "") return false;
  if (MIDTRANS_PLACEHOLDERS.some((p) => s.includes(p))) return false;
  if (MIDTRANS_PLACEHOLDERS.some((p) => c.includes(p))) return false;
  return true;
}
async function fetchMidtransTransactionStatus(orderId, options) {
  const isProd = options?.isProduction ?? process.env.MIDTRANS_IS_PRODUCTION === "true";
  const serverKey = options?.serverKey || process.env.MIDTRANS_SERVER_KEY || "";
  const baseUrl = isProd ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
  const url = `${baseUrl}/v2/${encodeURIComponent(orderId)}/status`;
  const timeoutMs = options?.timeoutMs ?? 6e3;
  const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Midtrans status API error [HTTP ${response.status}]: ${errorBody || response.statusText}`
    );
  }
  return await response.json();
}
var snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY || "SB-Mid-server-placeholder",
  clientKey: process.env.MIDTRANS_CLIENT_KEY || "SB-Mid-client-placeholder"
});
function configureSnapClient() {
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
  const serverKey = process.env.MIDTRANS_SERVER_KEY || "SB-Mid-server-placeholder";
  const clientKey = process.env.MIDTRANS_CLIENT_KEY || "SB-Mid-client-placeholder";
  snap.apiConfig.set({
    isProduction,
    serverKey,
    clientKey
  });
  if (process.env.MIDTRANS_SNAP_URL) {
    const customBase = process.env.MIDTRANS_SNAP_URL.replace(/\/transactions\/?$/, "");
    snap.apiConfig.getSnapApiBaseUrl = () => customBase;
  }
  return snap;
}
function getSnapRedirectUrl(rentalId) {
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
  if (process.env.MIDTRANS_SNAP_URL) {
    try {
      const parsed = new URL(process.env.MIDTRANS_SNAP_URL);
      return `${parsed.protocol}//${parsed.host}/snap/v2/vtweb/${rentalId}`;
    } catch {
    }
  }
  const baseUrl = isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
  return `${baseUrl}/snap/v2/vtweb/${rentalId}`;
}
function assertMidtransProductionConfig(options) {
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true" || process.env.NODE_ENV === "production";
  const serverKey = (process.env.MIDTRANS_SERVER_KEY || "").trim();
  const isSandboxKey = serverKey.startsWith("SB-Mid-");
  let warning;
  let valid = true;
  if (isProduction && isSandboxKey) {
    valid = false;
    warning = `[SECURITY WARNING] Detected sandbox MIDTRANS_SERVER_KEY prefix ('SB-Mid-') while running in production mode (MIDTRANS_IS_PRODUCTION=true or NODE_ENV=production). Live transactions will fail. Please configure production Midtrans credentials.`;
    console.warn(warning);
    if (options?.throwOnMismatch) {
      throw new Error(warning);
    }
  }
  return { isProduction, isSandboxKey, valid, warning };
}
function verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, signatureKey) {
  if (!orderId || !statusCode || !grossAmount || !serverKey || !signatureKey) {
    return false;
  }
  const targetSig = signatureKey.trim().toLowerCase();
  if (targetSig.length !== 128 || !/^[0-9a-f]{128}$/.test(targetSig)) {
    return false;
  }
  const rawPayload = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  const rawHash = crypto4.createHash("sha512").update(rawPayload).digest("hex").toLowerCase();
  const targetBuffer = Buffer.from(targetSig, "hex");
  const rawBuffer = Buffer.from(rawHash, "hex");
  if (targetBuffer.length === 64 && rawBuffer.length === 64 && crypto4.timingSafeEqual(rawBuffer, targetBuffer)) {
    return true;
  }
  const parsedAmount = parseFloat(grossAmount);
  if (!isNaN(parsedAmount)) {
    const normalizedAmount = parsedAmount.toFixed(2);
    if (normalizedAmount !== grossAmount) {
      const altPayload = `${orderId}${statusCode}${normalizedAmount}${serverKey}`;
      const altHash = crypto4.createHash("sha512").update(altPayload).digest("hex").toLowerCase();
      const altBuffer = Buffer.from(altHash, "hex");
      if (altBuffer.length === 64 && crypto4.timingSafeEqual(altBuffer, targetBuffer)) {
        return true;
      }
    }
  }
  return false;
}
function extractOrderRentalId(orderIdOrRentalId) {
  const trimmed = orderIdOrRentalId.trim();
  const isRenewal = trimmed.startsWith("RENEW-");
  if (isRenewal) {
    const withoutPrefix = trimmed.slice(6);
    const cleaned = withoutPrefix.replace(/(?:-\d{4})?-\d{9,}$/, "").replace(/-\d{4}$/, "");
    return { rentalId: cleaned || withoutPrefix, isRenewal: true };
  }
  const rentMatch = trimmed.match(/^(rent-[a-zA-Z0-9]+)(?:-\d+)?$/);
  if (rentMatch && rentMatch[1]) {
    return { rentalId: rentMatch[1], isRenewal: false };
  }
  return { rentalId: trimmed, isRenewal: false };
}
function isRoomActivelyHeldByOther(room, rentalId) {
  if (!room.reserved_by_rental_id || room.reserved_by_rental_id === rentalId) {
    return false;
  }
  return Number(room.holdRemainingSeconds || 0) > 0;
}
async function createPaymentToken(input, repo = paymentRepository) {
  const { authUser, propertyId, durationMonths, roomId } = input;
  const tenantId = input.tenantId || authUser?.id;
  if (!propertyId || !tenantId) {
    return { statusCode: 400, body: { message: "propertyId dan tenantId wajib diisi." } };
  }
  if (authUser?.role !== "admin" && authUser?.id !== tenantId) {
    return {
      statusCode: 403,
      body: { message: "Akses ditolak. Anda tidak dapat membuat token atas nama akun lain." }
    };
  }
  const duration = durationMonths && durationMonths > 0 ? durationMonths : 1;
  const customRentalId = input.customRentalId || input.rentalId;
  const resolvedRentalId = customRentalId && typeof customRentalId === "string" && customRentalId.trim() !== "" ? customRentalId.trim() : generateId("rent");
  const startDate = input.startDate && typeof input.startDate === "string" && input.startDate.trim() !== "" ? input.startDate.trim() : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const startDateIso = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null;
  let tenantName = "";
  let tenantEmail = "";
  let tenantPhone = "";
  let propertyName = "";
  let monthlyRent = 0;
  let adminFee = 5e3;
  let resolvedDuration = duration;
  let totalAmount = 0;
  let targetRoomId = null;
  let connection = null;
  let transactionStarted = false;
  let connectionReleased = false;
  const safeRollback = async (reason) => {
    if (connection && transactionStarted) {
      await connection.rollback().catch((rbErr) => {
        console.warn(`[Payment Token] Rollback swallowed error (${reason || "unknown"}):`, rbErr);
      });
      transactionStarted = false;
    }
  };
  try {
    connection = await pool.getConnection();
    await connection.query("SET SESSION innodb_lock_wait_timeout = 5;");
    await connection.beginTransaction();
    transactionStarted = true;
    const [propRows] = await connection.query(
      "SELECT id, name, price, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ? FOR UPDATE",
      [propertyId]
    );
    const property = propRows[0];
    if (!property) {
      await safeRollback("property missing");
      return { statusCode: 404, body: { message: "Properti tidak ditemukan." } };
    }
    propertyName = property.name;
    if (property.occupiedRooms >= property.totalRooms) {
      await safeRollback("property full");
      return { statusCode: 400, body: { message: "Kamar kos sudah penuh." } };
    }
    const [existingRentalPreRows] = await connection.query(
      "SELECT roomId FROM rentals WHERE id = ?",
      [resolvedRentalId]
    );
    const preOldRoomId = existingRentalPreRows[0]?.roomId || null;
    const requestedRoomId = roomId && typeof roomId === "string" && roomId.trim() !== "" ? roomId.trim() : void 0;
    targetRoomId = requestedRoomId || preOldRoomId;
    let lockedTargetRoom;
    if (targetRoomId) {
      const roomIdsToLock = Array.from(
        new Set([targetRoomId, preOldRoomId].filter(Boolean))
      ).sort();
      const [roomRows] = await connection.query(
        `SELECT id, propertyId, roomNumber, floor, type, price, status, reserved_until, reserved_by_rental_id,
                GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
         FROM rooms
         WHERE id IN (${roomIdsToLock.map(() => "?").join(",")}) AND propertyId = ?
         ORDER BY id FOR UPDATE`,
        [...roomIdsToLock, propertyId]
      );
      lockedTargetRoom = roomRows.find((r) => r.id === targetRoomId);
      if (!lockedTargetRoom) {
        await safeRollback("room not found on property");
        return { statusCode: 404, body: { message: "Kamar tidak ditemukan pada properti ini." } };
      }
      if (lockedTargetRoom.status !== "available" || isRoomActivelyHeldByOther(lockedTargetRoom, resolvedRentalId)) {
        await safeRollback("room unavailable");
        return { statusCode: 409, body: { message: "Kamar yang Anda pilih sudah tidak tersedia." } };
      }
    } else {
      const [discreteCountRows] = await connection.query(
        "SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?",
        [propertyId]
      );
      const discreteCount = Number(discreteCountRows[0]?.count || 0);
      if (discreteCount > 0) {
        const [availableRooms] = await connection.query(
          `SELECT id, propertyId, roomNumber, price, status, reserved_until, reserved_by_rental_id,
                  GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
           FROM rooms
           WHERE propertyId = ? AND status = 'available'
             AND (reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL OR reserved_by_rental_id = ?)
           ORDER BY roomNumber ASC, id ASC
           LIMIT 1 FOR UPDATE`,
          [propertyId, resolvedRentalId]
        );
        if (availableRooms.length === 0) {
          await safeRollback("no available rooms");
          return { statusCode: 409, body: { message: "Kamar yang Anda pilih sudah tidak tersedia." } };
        }
        lockedTargetRoom = availableRooms[0];
        targetRoomId = lockedTargetRoom.id;
      }
    }
    const [userRows] = await connection.query(
      "SELECT id, name, email, phone FROM users WHERE id = ? FOR UPDATE",
      [tenantId]
    );
    const tenant = userRows[0];
    if (!tenant) {
      await safeRollback("tenant missing");
      return { statusCode: 404, body: { message: "Tenant tidak ditemukan." } };
    }
    tenantName = tenant.name;
    tenantEmail = tenant.email;
    tenantPhone = tenant.phone || "";
    let activeRentalsQuery = "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' FOR UPDATE";
    const queryParams = [tenantId];
    if (customRentalId && typeof customRentalId === "string" && customRentalId.trim() !== "") {
      activeRentalsQuery = "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' AND id != ? FOR UPDATE";
      queryParams.push(customRentalId.trim());
    }
    const [activeRentals] = await connection.query(activeRentalsQuery, queryParams);
    if (activeRentals.length > 0) {
      await safeRollback("single active tenancy");
      return {
        statusCode: 409,
        body: {
          message: "Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru."
        }
      };
    }
    const [existingRentalRows] = await connection.query(
      "SELECT * FROM rentals WHERE id = ? FOR UPDATE",
      [resolvedRentalId]
    );
    const existingRental = existingRentalRows[0];
    if (existingRental && existingRental.status !== "pending") {
      await safeRollback("rental not pending");
      return { statusCode: 409, body: { message: "Data sewa sudah tidak dalam status pending." } };
    }
    const roomPriceOverride = lockedTargetRoom && typeof lockedTargetRoom.price === "number" && lockedTargetRoom.price > 0 ? Number(lockedTargetRoom.price) : null;
    monthlyRent = lockedTargetRoom ? roomPriceOverride || Number(property.price) : Number(existingRental?.price || property.price);
    adminFee = Number(existingRental?.admin_fee_amount ?? 5e3);
    resolvedDuration = durationMonths && durationMonths > 0 ? durationMonths : existingRental?.duration_months ? Number(existingRental.duration_months) : 1;
    totalAmount = monthlyRent * resolvedDuration + adminFee;
    if (!existingRental) {
      await connection.query(
        `INSERT INTO rentals (id, tenantId, propertyId, roomId, propertyName, price, startDate, start_date_iso, status, admin_fee_amount, duration_months)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          resolvedRentalId,
          tenantId,
          propertyId,
          targetRoomId,
          property.name,
          monthlyRent,
          startDate,
          startDateIso,
          adminFee,
          resolvedDuration
        ]
      );
    } else {
      const updatedStartIso = input.startDate && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate.trim()) ? input.startDate.trim() : null;
      await connection.query(
        `UPDATE rentals
         SET roomId = ?,
             price = ?,
             duration_months = ?,
             startDate = COALESCE(?, startDate),
             start_date_iso = COALESCE(?, start_date_iso)
         WHERE id = ? AND status = 'pending'`,
        [
          targetRoomId,
          monthlyRent,
          resolvedDuration,
          input.startDate || null,
          updatedStartIso,
          resolvedRentalId
        ]
      );
    }
    if (lockedTargetRoom) {
      await connection.query(
        `UPDATE rooms
         SET reserved_until = NULL, reserved_by_rental_id = NULL
         WHERE reserved_by_rental_id = ? AND id != ?`,
        [resolvedRentalId, lockedTargetRoom.id]
      );
      await connection.query(
        `UPDATE rooms
         SET reserved_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE),
             reserved_by_rental_id = ?
         WHERE id = ?`,
        [resolvedRentalId, lockedTargetRoom.id]
      );
    }
    await connection.commit();
    transactionStarted = false;
  } catch (err) {
    await safeRollback("catch");
    if (isLockContentionError(err)) {
      console.warn(
        "[Payment Token] Lock wait timeout or deadlock (1205/1213):",
        err?.message || err
      );
      return {
        statusCode: 409,
        body: {
          message: "High contention: unable to reserve room due to concurrent requests. Please retry."
        }
      };
    }
    console.error("Create payment token transaction error:", err);
    return {
      statusCode: 500,
      body: { message: "Gagal memproses transaksi pembuatan token pembayaran." }
    };
  } finally {
    if (connection && !connectionReleased) {
      connectionReleased = true;
      try {
        connection.release();
      } catch (relErr) {
        console.warn("[Payment Token] Connection release warning:", relErr);
      }
    }
  }
  const attemptOrderId = `${resolvedRentalId}-${Date.now()}`;
  const parameter = {
    transaction_details: {
      order_id: attemptOrderId,
      gross_amount: totalAmount
    },
    customer_details: {
      first_name: tenantName,
      email: tenantEmail,
      phone: tenantPhone
    },
    item_details: [
      {
        id: propertyId,
        price: monthlyRent,
        quantity: resolvedDuration,
        name: propertyName.substring(0, 50)
      },
      {
        id: "ADMIN_FEE",
        price: adminFee,
        quantity: 1,
        name: "Biaya Administrasi & Meterai"
      }
    ],
    expiry: {
      unit: "minutes",
      duration: 15
    },
    custom_field1: resolvedRentalId
  };
  try {
    await repo.upsertPendingTransaction({
      orderId: attemptOrderId,
      rentalId: resolvedRentalId,
      txType: "initial",
      grossAmount: totalAmount,
      months: resolvedDuration
    });
  } catch (txErr) {
    console.warn("[Payment Token] Could not persist payment_transactions ledger entry:", txErr);
  }
  const isProduction = (process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)) && process.env.NODE_ENV !== "test";
  const hasMidtransConfig = isMidtransConfigured();
  if (!hasMidtransConfig && isProduction) {
    return {
      statusCode: 500,
      body: {
        message: "Konfigurasi payment gateway Midtrans (MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY) belum diatur di server produksi."
      }
    };
  }
  let transactionToken = `snap-token-${resolvedRentalId}`;
  let redirectUrl = getSnapRedirectUrl(resolvedRentalId);
  if (hasMidtransConfig) {
    try {
      configureSnapClient();
      const transaction = await snap.createTransaction(parameter);
      transactionToken = transaction.token;
      redirectUrl = transaction.redirect_url;
    } catch (snapErr) {
      console.error("Midtrans createTransaction error:", snapErr);
      const errMsg = snapErr instanceof Error ? snapErr.message : String(snapErr);
      return {
        statusCode: 502,
        body: { message: `Gagal membuat transaksi di Midtrans: ${errMsg}` }
      };
    }
  }
  return {
    statusCode: 200,
    body: {
      message: "Token pembayaran berhasil dibuat.",
      token: transactionToken,
      redirect_url: redirectUrl,
      rentalId: resolvedRentalId,
      orderId: attemptOrderId
    }
  };
}
async function settleRentalPayment(orderIdOrRentalId, paidAmount, options) {
  const repo = options?.repo || paymentRepository;
  const trimmedOrderId = orderIdOrRentalId.trim();
  const { rentalId: targetRentalId, isRenewal } = extractOrderRentalId(trimmedOrderId);
  const isProductionMode = (process.env.NODE_ENV === "production" || process.env.MIDTRANS_IS_PRODUCTION === "true") && process.env.NODE_ENV !== "test" && process.env.MIDTRANS_SKIP_UPSTREAM_VERIFY !== "true";
  if (isProductionMode) {
    if (!isMidtransConfigured()) {
      return {
        success: false,
        statusCode: 500,
        message: "Midtrans server key belum dikonfigurasi pada server produksi."
      };
    }
    try {
      const upstreamStatus = await fetchMidtransTransactionStatus(trimmedOrderId);
      const isSettled = upstreamStatus.transaction_status === "settlement";
      const isAcceptedCapture = upstreamStatus.transaction_status === "capture" && upstreamStatus.fraud_status === "accept";
      if (!isSettled && !isAcceptedCapture) {
        console.warn(
          `[Midtrans Upstream Verification] Order ${trimmedOrderId} rejected: status=${upstreamStatus.transaction_status}, fraud=${upstreamStatus.fraud_status}`
        );
        return {
          success: false,
          statusCode: 400,
          message: `Transaksi belum diselesaikan di Midtrans (status: ${upstreamStatus.transaction_status}).`
        };
      }
      const upstreamAmount = parseFloat(upstreamStatus.gross_amount);
      if (!isNaN(upstreamAmount) && (paidAmount === void 0 || isNaN(paidAmount))) {
        paidAmount = upstreamAmount;
      }
    } catch (upstreamErr) {
      console.error(
        `[Midtrans Upstream Verification] Failed to query status for order ${trimmedOrderId}:`,
        upstreamErr
      );
      return {
        success: false,
        statusCode: 502,
        message: "Gagal memverifikasi status transaksi ke payment gateway Midtrans."
      };
    }
  }
  let connection = null;
  let transactionStarted = false;
  let connectionReleased = false;
  const safeRollback = async (reason) => {
    if (connection && transactionStarted) {
      await connection.rollback().catch((rbErr) => {
        console.warn(`[Settle Payment] Rollback swallowed error (${reason || "unknown"}):`, rbErr);
      });
      transactionStarted = false;
    }
  };
  try {
    connection = await pool.getConnection();
    await connection.query("SET SESSION innodb_lock_wait_timeout = 5;");
    await connection.beginTransaction();
    transactionStarted = true;
    const [earlyRentalRows] = await connection.query(
      "SELECT id, propertyId, roomId, status FROM rentals WHERE id = ? OR id = ?",
      [targetRentalId, trimmedOrderId]
    );
    const earlyRental = earlyRentalRows[0];
    if (!earlyRental) {
      await safeRollback("early rental missing");
      return { success: false, statusCode: 404, message: "Data sewa tidak ditemukan." };
    }
    let property;
    if (earlyRental.propertyId) {
      const [propRows] = await connection.query(
        "SELECT id, totalRooms, occupiedRooms, ownerId, price FROM properties WHERE id = ? FOR UPDATE",
        [earlyRental.propertyId]
      );
      property = propRows[0];
    }
    let preLockedRoom;
    if (!isRenewal && earlyRental.status !== "active" && earlyRental.propertyId) {
      if (earlyRental.roomId) {
        const [roomRows] = await connection.query(
          `SELECT id, propertyId, roomNumber, price, status, reserved_until, reserved_by_rental_id,
                  GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
           FROM rooms WHERE id = ? FOR UPDATE`,
          [earlyRental.roomId]
        );
        preLockedRoom = roomRows[0];
      } else {
        const [availableRooms] = await connection.query(
          `SELECT id, propertyId, roomNumber, price, status, reserved_until, reserved_by_rental_id,
                  GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
           FROM rooms
           WHERE propertyId = ? AND status = 'available'
             AND (reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL OR reserved_by_rental_id = ?)
           ORDER BY roomNumber ASC, id ASC
           LIMIT 1 FOR UPDATE`,
          [earlyRental.propertyId, earlyRental.id]
        );
        preLockedRoom = availableRooms[0];
      }
    }
    if (property && property.ownerId) {
      await connection.query(
        "SELECT id, balance, totalRevenue FROM users WHERE id = ? FOR UPDATE",
        [property.ownerId]
      );
    }
    const [rentalRows] = await connection.query(
      "SELECT * FROM rentals WHERE id = ? OR id = ? FOR UPDATE",
      [targetRentalId, trimmedOrderId]
    );
    const rental = rentalRows[0];
    if (!rental) {
      await safeRollback("rental missing");
      return { success: false, statusCode: 404, message: "Data sewa tidak ditemukan." };
    }
    const resolvedRentalId = rental.id;
    const monthlyPrice = Number(rental.price || 0);
    const durationMonths = Number(rental.duration_months || 1);
    const adminFee = Number(
      rental.admin_fee_amount !== void 0 && rental.admin_fee_amount !== null ? rental.admin_fee_amount : 5e3
    );
    const existingTx = await repo.findByOrderIdForUpdate(trimmedOrderId, connection);
    if (existingTx?.status === "settled") {
      await connection.commit();
      transactionStarted = false;
      return {
        success: true,
        statusCode: 200,
        message: isRenewal ? "Pembayaran perpanjangan sewa sudah diproses sebelumnya." : "Pembayaran sudah diproses sebelumnya.",
        rental
      };
    }
    if (existingTx?.status === "refund_required") {
      await connection.commit();
      transactionStarted = false;
      return {
        success: true,
        statusCode: 200,
        message: "Transaksi sudah tercatat memerlukan refund karena kamar penuh.",
        rental
      };
    }
    if (isRenewal) {
      let renewedMonths = 1;
      if (paidAmount !== void 0 && !isNaN(paidAmount) && monthlyPrice > 0) {
        const netPaid = paidAmount >= adminFee ? paidAmount - adminFee : paidAmount;
        const calculatedMonths = Math.round(netPaid / monthlyPrice);
        if (calculatedMonths > 0) {
          renewedMonths = calculatedMonths;
        }
      }
      if (paidAmount !== void 0 && !isNaN(paidAmount)) {
        const expectedRenewalWithAdmin = monthlyPrice * renewedMonths + adminFee;
        const expectedRenewalBase = monthlyPrice * renewedMonths;
        const isPriceMatch = Math.abs(paidAmount - expectedRenewalWithAdmin) <= 1 || Math.abs(paidAmount - expectedRenewalBase) <= 1 || Math.abs(paidAmount - (monthlyPrice + adminFee)) <= 1;
        if (!isPriceMatch) {
          await safeRollback("renewal price mismatch");
          console.error(
            `Midtrans renewal gross_amount mismatch: expected ${expectedRenewalWithAdmin} or ${expectedRenewalBase}, got ${paidAmount}`
          );
          return {
            success: false,
            statusCode: 400,
            message: "Jumlah nominal pembayaran tidak sesuai dengan biaya perpanjangan sewa."
          };
        }
      }
      const settledAmount2 = paidAmount !== void 0 && !isNaN(paidAmount) ? paidAmount : monthlyPrice * renewedMonths + adminFee;
      await repo.recordFinalTransactionStatus(
        {
          orderId: trimmedOrderId,
          rentalId: resolvedRentalId,
          txType: "renewal",
          grossAmount: settledAmount2,
          months: renewedMonths,
          status: "settled"
        },
        connection
      );
      await connection.query(
        "UPDATE rentals SET status = 'active', duration_months = COALESCE(duration_months, 1) + ? WHERE id = ?",
        [renewedMonths, resolvedRentalId]
      );
      if (property && property.ownerId) {
        const grossRent = monthlyPrice * renewedMonths;
        const platformCommission = Math.round(grossRent * 0.03);
        const landlordNetRent = grossRent - platformCommission;
        await connection.query(
          "UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?",
          [landlordNetRent, grossRent, property.ownerId]
        );
      }
      await connection.commit();
      transactionStarted = false;
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("rentals");
      apiCache.invalidatePattern("landlord:");
      apiCache.invalidatePattern("admin:");
      return {
        success: true,
        statusCode: 200,
        message: "Pembayaran perpanjangan sewa berhasil diproses.",
        rental: {
          ...rental,
          status: "active",
          duration_months: durationMonths + renewedMonths
        }
      };
    }
    const expectedWithAdmin = monthlyPrice * durationMonths + adminFee;
    const expectedBase = monthlyPrice * durationMonths;
    if (paidAmount !== void 0 && !isNaN(paidAmount)) {
      const isPriceMatch = Math.abs(paidAmount - expectedWithAdmin) <= 1 || Math.abs(paidAmount - expectedBase) <= 1 || Math.abs(paidAmount - monthlyPrice) <= 1;
      if (!isPriceMatch) {
        await safeRollback("price mismatch");
        console.error(
          `Midtrans gross_amount mismatch: expected ${expectedWithAdmin} or ${expectedBase}, got ${paidAmount}`
        );
        return {
          success: false,
          statusCode: 400,
          message: "Jumlah nominal pembayaran tidak sesuai dengan harga sewa."
        };
      }
    }
    if (rental.status !== "active") {
      const [activeRentals] = await connection.query(
        "SELECT id FROM rentals WHERE tenantId = ? AND status = 'active' AND id != ? FOR UPDATE",
        [rental.tenantId, resolvedRentalId]
      );
      if (activeRentals.length > 0) {
        await safeRollback("single active tenancy");
        return {
          success: false,
          statusCode: 409,
          message: "Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif."
        };
      }
      let lockedRoom = preLockedRoom;
      let targetRoomId = rental.roomId;
      const isRoomEligible = (room) => Boolean(
        room && room.status === "available" && !isRoomActivelyHeldByOther(room, resolvedRentalId)
      );
      if (targetRoomId) {
        if (!lockedRoom || lockedRoom.id !== targetRoomId) {
          const [roomRows] = await connection.query(
            `SELECT id, propertyId, roomNumber, price, status, reserved_until, reserved_by_rental_id,
                    GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
             FROM rooms WHERE id = ? FOR UPDATE`,
            [targetRoomId]
          );
          lockedRoom = roomRows[0];
        }
        if (!isRoomEligible(lockedRoom)) {
          if (options?.isWebhook) {
            const propBasePrice = Number(property?.price || 0);
            const [fallbackRooms] = await connection.query(
              `SELECT id, propertyId, roomNumber, price, status, reserved_until, reserved_by_rental_id,
                      GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
               FROM rooms
               WHERE propertyId = ? AND status = 'available'
                 AND (reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL OR reserved_by_rental_id = ?)
                 AND COALESCE(NULLIF(price, 0), ?) = ?
               ORDER BY roomNumber ASC, id ASC
               LIMIT 1 FOR UPDATE`,
              [rental.propertyId, resolvedRentalId, propBasePrice, monthlyPrice]
            );
            if (fallbackRooms.length > 0) {
              lockedRoom = fallbackRooms[0];
              targetRoomId = lockedRoom.id;
            } else {
              const settledAmount2 = paidAmount !== void 0 && !isNaN(paidAmount) ? paidAmount : expectedWithAdmin;
              await repo.recordFinalTransactionStatus(
                {
                  orderId: trimmedOrderId,
                  rentalId: resolvedRentalId,
                  txType: "initial",
                  grossAmount: settledAmount2,
                  months: durationMonths,
                  status: "refund_required"
                },
                connection
              );
              await repo.clearRoomHoldByRentalId(resolvedRentalId, connection);
              await connection.query(
                "UPDATE rentals SET status = 'cancelled' WHERE id = ? AND status = 'pending'",
                [resolvedRentalId]
              );
              await connection.commit();
              transactionStarted = false;
              apiCache.invalidatePattern("properties");
              apiCache.invalidatePattern("rentals");
              return {
                success: true,
                statusCode: 200,
                message: "Kamar sudah penuh pada saat pembayaran diterima; transaksi ditandai refund_required."
              };
            }
          } else {
            await safeRollback("room unavailable");
            console.error(
              `Overbooking conflict detected for room ${targetRoomId}, status: ${lockedRoom?.status}`
            );
            return {
              success: false,
              statusCode: 409,
              message: "Kamar sudah terisi atau tidak tersedia."
            };
          }
        }
      } else {
        if (lockedRoom && isRoomEligible(lockedRoom)) {
          targetRoomId = lockedRoom.id;
        } else {
          const [discreteCountRows] = await connection.query(
            "SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?",
            [rental.propertyId]
          );
          if (Number(discreteCountRows[0]?.count || 0) > 0) {
            if (options?.isWebhook) {
              const settledAmount2 = paidAmount !== void 0 && !isNaN(paidAmount) ? paidAmount : expectedWithAdmin;
              await repo.recordFinalTransactionStatus(
                {
                  orderId: trimmedOrderId,
                  rentalId: resolvedRentalId,
                  txType: "initial",
                  grossAmount: settledAmount2,
                  months: durationMonths,
                  status: "refund_required"
                },
                connection
              );
              await connection.commit();
              transactionStarted = false;
              return {
                success: true,
                statusCode: 200,
                message: "Kamar sudah penuh pada saat pembayaran diterima; transaksi ditandai refund_required."
              };
            }
            await safeRollback("no discrete rooms available");
            return {
              success: false,
              statusCode: 409,
              message: "Kamar sudah terisi atau tidak tersedia."
            };
          }
          if (property && property.occupiedRooms >= property.totalRooms) {
            await safeRollback("property full");
            console.error(
              `Overbooking conflict detected for property ${property.id}, rental ${resolvedRentalId}`
            );
            return {
              success: false,
              statusCode: 409,
              message: "Kamar sudah penuh, pembayaran memerlukan penanganan manual."
            };
          }
        }
      }
      await connection.query(
        "UPDATE rentals SET status = 'active', roomId = ? WHERE id = ?",
        [targetRoomId || null, resolvedRentalId]
      );
      if (lockedRoom) {
        await connection.query(
          "UPDATE rooms SET status = 'occupied', reserved_until = NULL, reserved_by_rental_id = NULL WHERE id = ?",
          [lockedRoom.id]
        );
        await repo.clearRoomHoldByRentalId(resolvedRentalId, connection);
        await syncPropertyRoomCounts(connection, rental.propertyId);
      } else {
        await connection.query(
          "UPDATE properties SET occupiedRooms = LEAST(totalRooms, occupiedRooms + 1) WHERE id = ?",
          [rental.propertyId]
        );
      }
      if (property && property.ownerId) {
        const grossRent = monthlyPrice * durationMonths;
        const platformCommission = Math.round(grossRent * 0.03);
        const netLandlordCredit = grossRent - platformCommission;
        await connection.query(
          "UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?",
          [netLandlordCredit, grossRent, property.ownerId]
        );
      }
    }
    const settledAmount = paidAmount !== void 0 && !isNaN(paidAmount) ? paidAmount : expectedWithAdmin;
    await repo.recordFinalTransactionStatus(
      {
        orderId: trimmedOrderId,
        rentalId: resolvedRentalId,
        txType: "initial",
        grossAmount: settledAmount,
        months: durationMonths,
        status: "settled"
      },
      connection
    );
    await repo.markPendingInitialTransactionsSettled(resolvedRentalId, connection);
    await connection.commit();
    transactionStarted = false;
    apiCache.invalidatePattern("properties");
    apiCache.invalidatePattern("rentals");
    apiCache.invalidatePattern("rooms");
    apiCache.invalidatePattern("landlord:");
    apiCache.invalidatePattern("admin:");
    return {
      success: true,
      statusCode: 200,
      message: "Pembayaran berhasil diproses dan status rental diaktifkan.",
      rental: { ...rental, status: "active" }
    };
  } catch (err) {
    await safeRollback("catch");
    if (isLockContentionError(err)) {
      console.warn(
        "[Settle Payment] Lock wait timeout or deadlock (1205/1213):",
        err?.message || err
      );
      return {
        success: false,
        statusCode: 409,
        message: "High contention: unable to settle rental payment due to concurrent lock timeout. Please retry."
      };
    }
    console.error("Settle rental payment error:", err);
    return { success: false, statusCode: 500, message: "Gagal memproses transaksi sewa." };
  } finally {
    if (connection && !connectionReleased) {
      connectionReleased = true;
      try {
        connection.release();
      } catch (relErr) {
        console.warn("[Settle Payment] Connection release warning:", relErr);
      }
    }
  }
}
async function handleMidtransWebhookCancellation(orderId, transactionStatus, repo = paymentRepository) {
  const trimmedOrderId = orderId.trim();
  await repo.markTransactionCancelled(trimmedOrderId);
  if (trimmedOrderId.startsWith("RENEW-")) {
    return `Status perpanjangan sewa dibatalkan (${transactionStatus}).`;
  }
  const { rentalId: targetRentalId } = extractOrderRentalId(trimmedOrderId);
  await repo.clearRoomHoldByRentalId(targetRentalId);
  await pool.query(
    "UPDATE rentals SET status = 'cancelled' WHERE (id = ? OR id = ?) AND status = 'pending'",
    [targetRentalId, trimmedOrderId]
  );
  apiCache.invalidatePattern("properties");
  apiCache.invalidatePattern("rentals");
  apiCache.invalidatePattern("rooms");
  return `Status transaksi dibatalkan (${transactionStatus}).`;
}

// backend/routes/payment.routes.ts
var handlePaymentNotification = async (req, res) => {
  const isProduction = (process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)) && process.env.NODE_ENV !== "test";
  const hasMidtransConfig = isMidtransConfigured();
  if (!hasMidtransConfig && isProduction) {
    return res.status(500).json({
      message: "Midtrans server key belum dikonfigurasi pada server produksi."
    });
  }
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
    const result = await settleRentalPayment(
      order_id,
      isNaN(paidAmount) ? void 0 : paidAmount,
      { isWebhook: true }
    );
    return res.status(result.statusCode || (result.success ? 200 : 400)).json({ message: result.message });
  }
  if (transaction_status === "cancel" || transaction_status === "deny" || transaction_status === "expire") {
    try {
      const msg = await handleMidtransWebhookCancellation(order_id, transaction_status);
      return res.json({ message: msg });
    } catch (err) {
      console.error("Cancel rental error:", err);
      return res.status(500).json({ message: "Gagal memperbarui status transaksi." });
    }
  }
  res.json({ message: "Status notifikasi diterima." });
};
function registerPaymentRoutes(router2) {
  router2.post(
    "/payment/token",
    authenticateToken,
    mutationLimiter,
    validateBody(createPaymentTokenSchema),
    async (req, res) => {
      const { propertyId, durationMonths, roomId, tenantId, customRentalId, rentalId, startDate } = req.body;
      const result = await createPaymentToken({
        authUser: req.user,
        propertyId,
        durationMonths,
        roomId,
        tenantId,
        customRentalId,
        rentalId,
        startDate
      });
      return res.status(result.statusCode).json(result.body);
    }
  );
  router2.post("/payment/webhook", validateBody(paymentNotificationSchema), handlePaymentNotification);
  router2.post("/payment/notification", validateBody(paymentNotificationSchema), handlePaymentNotification);
  router2.post("/payment/finish", authenticateToken, async (req, res) => {
    const { rentalId, orderId } = req.body;
    const authUser = req.user;
    const rawIdentifier = typeof orderId === "string" && orderId.trim() !== "" ? orderId.trim() : typeof rentalId === "string" && rentalId.trim() !== "" ? rentalId.trim() : "";
    if (!rawIdentifier) {
      return res.status(400).json({ success: false, message: "rentalId wajib diisi." });
    }
    const { rentalId: resolvedRentalId } = extractOrderRentalId(
      typeof rentalId === "string" && rentalId.trim() !== "" ? rentalId.trim() : rawIdentifier
    );
    try {
      const [rows] = await pool.query("SELECT * FROM rentals WHERE id = ?", [
        resolvedRentalId
      ]);
      const rental = rows[0];
      if (!rental) {
        return res.status(404).json({ success: false, message: "Data sewa tidak ditemukan." });
      }
      if (authUser?.role !== "admin" && authUser?.id !== rental.tenantId) {
        return res.status(403).json({ success: false, message: "Akses ditolak ke data sewa ini." });
      }
      const result = await settleRentalPayment(rawIdentifier);
      if (!result.success) {
        return res.status(result.statusCode || 400).json({ success: false, message: result.message });
      }
      return res.status(200).json({
        success: true,
        message: result.message,
        rentalId: resolvedRentalId
      });
    } catch (err) {
      console.error("Payment finish route error:", err);
      return res.status(500).json({ success: false, message: "Gagal menyelesaikan transaksi pembayaran." });
    }
  });
}

// backend/services/rental.service.ts
var RentalServiceError = class extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = "RentalServiceError";
  }
  statusCode;
  details;
};
var RentalService = class {
  constructor(repo = rentalsRepository) {
    this.repo = repo;
  }
  repo;
  parseFlexibleStartDate(startDateStr, fallback) {
    if (!startDateStr || typeof startDateStr !== "string") {
      return new Date(fallback);
    }
    const trimmed = startDateStr.trim();
    const direct = new Date(trimmed);
    if (!isNaN(direct.getTime())) {
      return direct;
    }
    const idMonthMap = {
      januari: "January",
      februari: "February",
      maret: "March",
      april: "April",
      mei: "May",
      juni: "June",
      juli: "July",
      agustus: "August",
      agu: "Aug",
      ags: "Aug",
      september: "September",
      oktober: "October",
      okt: "Oct",
      november: "November",
      nopember: "November",
      desember: "December",
      des: "Dec"
    };
    const normalized = trimmed.replace(
      /\b(januari|februari|maret|april|mei|juni|juli|agustus|agu|ags|september|oktober|okt|november|nopember|desember|des)\b/gi,
      (match) => idMonthMap[match.toLowerCase()] || match
    );
    const parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
  }
  computePaymentSchedule(startDateStr, status, durationMonthsOrRef, referenceDate) {
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
    const start = this.parseFlexibleStartDate(startDateStr, now);
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
    const leaseEndDateISO = `${leaseEnd.getFullYear()}-${pad(leaseEnd.getMonth() + 1)}-${pad(
      leaseEnd.getDate()
    )}`;
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
  enrichRental(r) {
    const duration = Number(r.duration_months || 1);
    const schedule = this.computePaymentSchedule(
      r.startDate || (/* @__PURE__ */ new Date()).toISOString(),
      r.status,
      duration
    );
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
  }
  async getRentals(authUser, tenantIdFilter, limit, offset = 0) {
    const rows = await this.repo.findRentalsByFilter(
      authUser.role,
      authUser.id,
      tenantIdFilter,
      limit,
      offset
    );
    return rows.map((r) => this.enrichRental(r));
  }
  async getTenantRentals(tenantId) {
    const rows = await this.repo.findTenantRentals(tenantId);
    return rows.map((r) => this.enrichRental(r));
  }
  async getRentalById(rentalId, authUser) {
    const rental = await this.repo.findRentalById(rentalId);
    if (!rental) {
      throw new RentalServiceError(404, "Data sewa tidak ditemukan.");
    }
    const isTenant = authUser.id === rental.tenantId;
    const isOwner = Boolean(
      rental.propertyOwnerId && authUser.id === rental.propertyOwnerId
    );
    const isAdmin = authUser.role === "admin";
    if (!isTenant && !isOwner && !isAdmin) {
      throw new RentalServiceError(403, "Akses ditolak ke data sewa ini.");
    }
    return this.enrichRental(rental);
  }
  async createBooking(input) {
    const {
      authUser,
      tenantId,
      propertyId,
      propertyName,
      price,
      durationMonths,
      signature,
      roomId,
      rentalId: customRentalId
    } = input;
    if (!tenantId || !propertyId) {
      throw new RentalServiceError(400, "tenantId dan propertyId wajib diisi.");
    }
    if (authUser.role !== "admin" && authUser.id !== tenantId) {
      throw new RentalServiceError(
        403,
        "Akses ditolak. Anda tidak dapat memesan atas nama akun lain."
      );
    }
    const rentalId = customRentalId && typeof customRentalId === "string" && customRentalId.trim() !== "" ? customRentalId.trim() : generateId("rent");
    const isProdBookingGuard = (process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)) && process.env.NODE_ENV !== "test" && authUser.role !== "admin";
    if (isProdBookingGuard && !isMidtransConfigured()) {
      throw new RentalServiceError(
        500,
        "Konfigurasi payment gateway Midtrans belum diatur di server produksi."
      );
    }
    if (process.env.MIDTRANS_SERVER_KEY && !process.env.MIDTRANS_SERVER_KEY.includes("placeholder") && !process.env.MIDTRANS_SERVER_KEY.includes("your-server-key")) {
      try {
        const snapApi = snap;
        if (snapApi.transaction?.status) {
          const statusResponse = await snapApi.transaction.status(rentalId);
          const isValidPayment = statusResponse.transaction_status === "settlement" || statusResponse.transaction_status === "capture" && statusResponse.fraud_status === "accept";
          if (!isValidPayment) {
            throw new RentalServiceError(
              402,
              "Pembayaran belum diselesaikan pada payment gateway Midtrans."
            );
          }
        }
      } catch (midtransErr) {
        if (midtransErr instanceof RentalServiceError) throw midtransErr;
        if (isProdBookingGuard) {
          const errMsg = midtransErr instanceof Error ? midtransErr.message : String(midtransErr);
          if (errMsg.includes("404")) {
            throw new RentalServiceError(
              402,
              "Pembayaran belum ditemukan atau belum diselesaikan pada Midtrans."
            );
          }
          throw new RentalServiceError(
            502,
            "Gagal memverifikasi status transaksi pada payment gateway Midtrans."
          );
        }
        console.warn("Midtrans status check warning:", midtransErr);
      }
    }
    const connection = await pool.getConnection();
    try {
      await connection.query("SET SESSION innodb_lock_wait_timeout = 5;");
      await connection.beginTransaction();
      const property = await this.repo.findPropertyById(propertyId, connection, true);
      if (!property) {
        await connection.rollback();
        throw new RentalServiceError(404, "Properti tidak ditemukan.");
      }
      if (property.occupiedRooms >= property.totalRooms) {
        await connection.rollback();
        throw new RentalServiceError(400, "Kamar kos sudah penuh.");
      }
      const [existingPre] = await connection.query(
        "SELECT roomId FROM rentals WHERE id = ?",
        [rentalId]
      );
      const targetRoomId = roomId || existingPre[0]?.roomId;
      let assignedRoom;
      if (targetRoomId) {
        assignedRoom = await this.repo.findRoomById(targetRoomId, propertyId, connection, true);
        if (!assignedRoom) {
          await connection.rollback();
          throw new RentalServiceError(404, "Kamar tidak ditemukan pada properti ini.");
        }
        const heldByOther = Boolean(assignedRoom.reserved_by_rental_id) && assignedRoom.reserved_by_rental_id !== rentalId && Number(assignedRoom.holdRemainingSeconds || 0) > 0;
        if (assignedRoom.status !== "available" || heldByOther) {
          await connection.rollback();
          throw new RentalServiceError(409, "Kamar yang Anda pilih sudah tidak tersedia.");
        }
      } else {
        const availableRoom = await this.repo.findAvailableRoom(
          propertyId,
          connection,
          true,
          rentalId
        );
        if (availableRoom) {
          assignedRoom = availableRoom;
        } else {
          const discreteCount = await this.repo.countRoomsByPropertyId(propertyId, connection);
          if (discreteCount > 0) {
            await connection.rollback();
            throw new RentalServiceError(409, "Kamar yang Anda pilih sudah tidak tersedia.");
          }
        }
      }
      const tenant = await this.repo.findUserById(tenantId, connection, true);
      if (!tenant) {
        await connection.rollback();
        throw new RentalServiceError(404, "Pengguna tidak ditemukan.");
      }
      const existingRental = await this.repo.findExistingRentalForUpdate(rentalId, connection);
      if (existingRental && existingRental.status === "active") {
        await connection.commit();
        return {
          message: "Penyewaan kos sudah aktif!",
          rentalId,
          document: existingRental.document || "sertifikat_kepemilikan.pdf"
        };
      }
      const activeRentals = await this.repo.findActiveRentalsByTenantId(tenantId, connection, true);
      const isCurrentRentalActive = activeRentals.some((r) => r.id === rentalId);
      if (activeRentals.length > 0 && !isCurrentRentalActive) {
        await connection.rollback();
        throw new RentalServiceError(
          409,
          "Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru."
        );
      }
      const profileCheck = isUserProfileComplete(tenant);
      if (!profileCheck.complete) {
        await connection.rollback();
        throw new RentalServiceError(
          422,
          "Profil identitas hukum penyewa belum lengkap. Berdasarkan Pasal 1320 KUHPerdata & UU ITE, Anda wajib melengkapi data identitas (NIK/Paspor, Alamat Domisili, Pekerjaan, dan Kontak Darurat) pada profil Anda sebelum menyewa kos.",
          {
            missingFields: profileCheck.missingFields,
            missingFieldLabels: profileCheck.missingFieldLabels
          }
        );
      }
      const duration = Number(durationMonths) || 1;
      const effectivePrice = assignedRoom && assignedRoom.price !== null && assignedRoom.price !== void 0 && Number(assignedRoom.price) > 0 ? Number(assignedRoom.price) : Number(property.price || 0);
      const addedRevenue = effectivePrice * duration;
      const startDateStr = input.startDate && typeof input.startDate === "string" && input.startDate.trim() !== "" ? input.startDate.trim() : (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const resolvedPropertyName = propertyName || property.name || "Kos KOSMO";
      const documentUrl = `/uploads/rental_contract_${rentalId}.pdf`;
      if (assignedRoom) {
        await this.repo.setRoomStatus(assignedRoom.id, "occupied", connection);
        await syncPropertyRoomCounts(connection, propertyId);
      } else {
        await this.repo.incrementPropertyOccupied(propertyId, connection);
      }
      if (property.ownerId) {
        const platformCommission = Math.round(addedRevenue * 0.03);
        const netLandlordCredit = addedRevenue - platformCommission;
        await this.repo.creditLandlordNetBalance(
          property.ownerId,
          netLandlordCredit,
          addedRevenue,
          connection
        );
      }
      if (existingRental) {
        await this.repo.activateExistingRental(rentalId, effectivePrice, documentUrl, duration, connection);
      } else {
        await this.repo.insertRentalBooking(
          {
            id: rentalId,
            tenantId,
            propertyId,
            roomId: assignedRoom ? assignedRoom.id : null,
            propertyName: resolvedPropertyName,
            price: effectivePrice,
            startDate: startDateStr,
            status: "active",
            document: documentUrl,
            durationMonths: duration
          },
          connection
        );
      }
      await connection.commit();
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("rentals");
      apiCache.invalidatePattern("landlord:");
      apiCache.invalidatePattern("admin:");
      return {
        message: "Penyewaan kos berhasil dibuat!",
        rentalId,
        document: documentUrl,
        roomId: assignedRoom ? assignedRoom.id : null,
        roomNumber: assignedRoom ? assignedRoom.roomNumber : null
      };
    } catch (err) {
      await connection.rollback().catch((rbErr) => {
        console.warn("[Rental Service] createBooking rollback warning:", rbErr);
      });
      throw err;
    } finally {
      connection.release();
    }
  }
  async terminateRental(rentalId, authUser, password) {
    if (!password) {
      throw new RentalServiceError(400, "Password wajib dimasukkan.");
    }
    const connection = await pool.getConnection();
    try {
      await connection.query("SET SESSION innodb_lock_wait_timeout = 5;");
      await connection.beginTransaction();
      const earlyRental = await this.repo.findRentalSummaryById(rentalId, connection);
      if (!earlyRental) {
        await connection.rollback();
        throw new RentalServiceError(404, "Data sewa tidak ditemukan.");
      }
      if (earlyRental.status === "terminated") {
        await connection.rollback();
        throw new RentalServiceError(400, "Sewa sudah pernah diberhentikan.");
      }
      const caller = await this.repo.findUserPasswordById(authUser.id, connection);
      const isMatch = caller?.password ? await bcrypt5.compare(password, caller.password) : false;
      if (!caller || !caller.password || !isMatch) {
        await connection.rollback();
        throw new RentalServiceError(401, "Password salah.");
      }
      const property = await this.repo.findPropertyById(earlyRental.propertyId, connection, true);
      const isTenant = authUser.id === earlyRental.tenantId;
      const isOwner = Boolean(property && authUser.id === property.ownerId);
      const isAdmin = authUser.role === "admin";
      if (!isTenant && !isOwner && !isAdmin) {
        await connection.rollback();
        throw new RentalServiceError(
          403,
          "Akses ditolak. Anda tidak berhak memberhentikan sewa ini."
        );
      }
      const rental = await this.repo.findRentalForUpdate(rentalId, connection);
      if (!rental) {
        await connection.rollback();
        throw new RentalServiceError(404, "Data sewa tidak ditemukan.");
      }
      if (rental.status === "terminated") {
        await connection.rollback();
        throw new RentalServiceError(400, "Sewa sudah pernah diberhentikan.");
      }
      if (rental.status === "active") {
        if (rental.roomId) {
          await this.repo.lockRoomById(rental.roomId, connection);
          await this.repo.setRoomStatus(rental.roomId, "available", connection);
          try {
            await syncPropertyRoomCounts(connection, rental.propertyId);
          } catch {
          }
        } else {
          await this.repo.decrementPropertyOccupied(rental.propertyId, connection);
        }
      }
      await this.repo.updateRentalStatus(rentalId, "terminated", connection);
      await connection.commit();
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("rentals");
      apiCache.invalidatePattern("landlord:");
      apiCache.invalidatePattern("admin:");
      return { message: "Sewa kos berhasil diberhentikan." };
    } catch (err) {
      await connection.rollback().catch((rbErr) => {
        console.warn("[Rental Service] terminateRental rollback warning:", rbErr);
      });
      throw err;
    } finally {
      connection.release();
    }
  }
  async cancelPendingRental(rentalId, authUser) {
    if (!rentalId || typeof rentalId !== "string" || rentalId.trim() === "") {
      throw new RentalServiceError(400, "rentalId wajib diisi.");
    }
    const resolvedRentalId = rentalId.trim();
    const connection = await pool.getConnection();
    try {
      await connection.query("SET SESSION innodb_lock_wait_timeout = 5;");
      await connection.beginTransaction();
      const rental = await this.repo.findRentalForUpdate(resolvedRentalId, connection);
      if (!rental) {
        await connection.rollback();
        throw new RentalServiceError(404, "Data sewa tidak ditemukan.");
      }
      const isTenant = authUser.id === rental.tenantId;
      const isAdmin = authUser.role === "admin";
      if (!isTenant && !isAdmin) {
        await connection.rollback();
        throw new RentalServiceError(
          403,
          "Akses ditolak. Anda tidak berhak membatalkan pesanan sewa ini."
        );
      }
      if (rental.status === "cancelled") {
        await connection.commit();
        return {
          message: "Pesanan sewa sudah dibatalkan.",
          rentalId: resolvedRentalId
        };
      }
      if (rental.status !== "pending") {
        await connection.rollback();
        throw new RentalServiceError(
          400,
          "Hanya pesanan sewa yang menunggu pembayaran (pending) yang dapat dibatalkan."
        );
      }
      await this.repo.clearRoomHoldByRentalId(resolvedRentalId, connection);
      await this.repo.updateRentalStatus(resolvedRentalId, "cancelled", connection);
      await connection.commit();
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("rentals");
      apiCache.invalidatePattern("rooms");
      apiCache.invalidatePattern("landlord:");
      apiCache.invalidatePattern("admin:");
      return {
        message: "Pesanan sewa berhasil dibatalkan.",
        rentalId: resolvedRentalId
      };
    } catch (err) {
      await connection.rollback().catch((rbErr) => {
        console.warn("[Rental Service] cancelPendingRental rollback warning:", rbErr);
      });
      throw err;
    } finally {
      connection.release();
    }
  }
  async createRenewalToken(rentalId, authUser, months = 1) {
    if (!rentalId || typeof rentalId !== "string" || rentalId.trim() === "") {
      throw new RentalServiceError(400, "rentalId wajib diisi.");
    }
    const durationMonths = Math.max(1, Math.floor(months || 1));
    const resolvedRentalId = rentalId.trim();
    let tenantName = "";
    let tenantEmail = "";
    let tenantPhone = "";
    let propertyId = "";
    let propertyName = "";
    let monthlyRent = 0;
    const adminFee = 5e3;
    let totalGrossAmount = 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const earlyRental = await this.repo.findRentalSummaryById(resolvedRentalId, connection);
      if (!earlyRental) {
        await connection.rollback();
        throw new RentalServiceError(404, "Data sewa tidak ditemukan.");
      }
      const tenant = await this.repo.findUserById(authUser.id, connection, true);
      if (!tenant) {
        await connection.rollback();
        throw new RentalServiceError(404, "Pengguna tidak ditemukan.");
      }
      tenantName = tenant.name;
      tenantEmail = tenant.email;
      tenantPhone = tenant.phone || "";
      propertyId = earlyRental.propertyId;
      const property = await this.repo.findPropertyById(propertyId, connection, true);
      if (!property) {
        await connection.rollback();
        throw new RentalServiceError(404, "Properti tidak ditemukan.");
      }
      propertyName = property.name;
      const [rentalRows] = await connection.query(
        "SELECT * FROM rentals WHERE id = ? FOR UPDATE",
        [resolvedRentalId]
      );
      const rental = rentalRows[0];
      if (!rental) {
        await connection.rollback();
        throw new RentalServiceError(404, "Data sewa tidak ditemukan.");
      }
      if (authUser.role !== "admin" && authUser.id !== rental.tenantId) {
        await connection.rollback();
        throw new RentalServiceError(403, "Akses ditolak. Anda tidak dapat memperpanjang sewa akun lain.");
      }
      if (rental.status !== "active") {
        await connection.rollback();
        throw new RentalServiceError(
          400,
          `Hanya sewa dengan status aktif yang dapat diperpanjang. Status sewa saat ini: ${rental.status}`
        );
      }
      const [conflictingRentals] = await connection.query(
        "SELECT id FROM rentals WHERE tenantId = ? AND status = 'active' AND id != ? FOR UPDATE",
        [rental.tenantId, resolvedRentalId]
      );
      if (conflictingRentals.length > 0) {
        await connection.rollback();
        throw new RentalServiceError(
          409,
          "Single Active Tenancy Violation: Anda memiliki sewa kos aktif lain yang bertentangan."
        );
      }
      monthlyRent = Number(rental.price || property.price || 0);
      totalGrossAmount = monthlyRent * durationMonths + adminFee;
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
    const now = /* @__PURE__ */ new Date();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const yy = String(now.getUTCFullYear()).slice(-2);
    const attemptOrderId = `RENEW-${resolvedRentalId}-${mm}${yy}-${Date.now()}`;
    const parameter = {
      transaction_details: {
        order_id: attemptOrderId,
        gross_amount: totalGrossAmount
      },
      customer_details: {
        first_name: tenantName,
        email: tenantEmail,
        phone: tenantPhone
      },
      item_details: [
        {
          id: propertyId,
          price: monthlyRent,
          quantity: durationMonths,
          name: `Perpanjangan Sewa - ${propertyName.substring(0, 28)}`
        },
        {
          id: "ADMIN_FEE",
          price: adminFee,
          quantity: 1,
          name: "Biaya Administrasi & Layanan"
        }
      ],
      custom_field1: resolvedRentalId,
      expiry: {
        unit: "minutes",
        duration: 15
      }
    };
    try {
      await paymentRepository.upsertPendingTransaction({
        orderId: attemptOrderId,
        rentalId: resolvedRentalId,
        txType: "renewal",
        grossAmount: totalGrossAmount,
        months: durationMonths
      });
    } catch (txErr) {
      console.warn("[Renewal Token] Could not persist payment_transactions ledger entry:", txErr);
    }
    const isProduction = (process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)) && process.env.NODE_ENV !== "test";
    const hasMidtransConfig = isMidtransConfigured();
    if (!hasMidtransConfig && isProduction) {
      throw new RentalServiceError(
        500,
        "Konfigurasi payment gateway Midtrans belum diatur di server produksi."
      );
    }
    let transactionToken = `snap-token-renewal-${resolvedRentalId}`;
    let redirectUrl = getSnapRedirectUrl(resolvedRentalId);
    if (hasMidtransConfig) {
      try {
        configureSnapClient();
        const transaction = await snap.createTransaction(parameter);
        transactionToken = transaction.token;
        redirectUrl = transaction.redirect_url;
      } catch (snapErr) {
        console.error("Midtrans renewal createTransaction error:", snapErr);
        const errMsg = snapErr instanceof Error ? snapErr.message : String(snapErr);
        throw new RentalServiceError(502, `Gagal membuat transaksi di Midtrans: ${errMsg}`);
      }
    }
    return {
      message: "Token perpanjangan sewa berhasil dibuat.",
      token: transactionToken,
      redirect_url: redirectUrl,
      rentalId: resolvedRentalId,
      orderId: attemptOrderId,
      grossAmount: totalGrossAmount
    };
  }
};
var rentalService = new RentalService();

// backend/routes/landlord.routes.ts
var handleLandlordStats = async (req, res) => {
  const authUser = req.user;
  if (!authUser) {
    return res.status(401).json({ message: "Otentikasi diperlukan." });
  }
  const landlordId = authUser.role === "admin" && req.query.landlordId ? String(req.query.landlordId) : authUser.id;
  const cacheKey = `landlord:stats:${landlordId}`;
  const cached = apiCache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  try {
    const [
      [userRows],
      [propAggRows],
      [reviewCountRows],
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
        `SELECT COUNT(r.id) as reviewsCount
         FROM reviews r 
         JOIN properties p ON r.propertyId = p.id 
         WHERE p.ownerId = ?`,
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
    const reviewsCount = Number(reviewCountRows[0]?.reviewsCount || 0);
    const responseData = {
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
      withdrawals,
      reviewsCount
    };
    apiCache.set(cacheKey, responseData, 15);
    res.json(responseData);
  } catch (err) {
    console.error("Get stats error:", err);
    res.status(500).json({ message: "Gagal memuat statistik dasbor." });
  }
};
function registerLandlordRoutes(router2) {
  router2.get("/stats", authenticateToken, requireRole(["admin", "landlord"]), handleLandlordStats);
  router2.get("/landlord/stats", authenticateToken, requireRole(["admin", "landlord"]), handleLandlordStats);
  router2.get("/landlord/reports/excel", authenticateToken, requireRole(["admin", "landlord"]), handleLandlordExcelReport);
  router2.get("/landlord/financials", authenticateToken, requireRole(["admin", "landlord"]), async (req, res) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }
    const landlordId = authUser.role === "admin" && req.query.landlordId ? String(req.query.landlordId) : authUser.id;
    const cacheKey = `landlord:financials:${landlordId}`;
    const cached = apiCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
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
             COALESCE(DATE_FORMAT(r.start_date_iso, '%Y-%m'), DATE_FORMAT(STR_TO_DATE(r.startDate, '%Y-%m-%d'), '%Y-%m'), DATE_FORMAT(r.contract_signed_at, '%Y-%m')) as month,
             COALESCE(SUM(r.price * COALESCE(r.duration_months, 1)), 0) as revenue,
             COUNT(r.id) as transactions
           FROM rentals r
           JOIN properties p ON r.propertyId = p.id
           WHERE p.ownerId = ? AND r.status IN ('active', 'terminated')
           GROUP BY month
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
      const responseData = {
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
      };
      apiCache.set(cacheKey, responseData, 15);
      res.json(responseData);
    } catch (err) {
      console.error("Get landlord financials error:", err);
      res.status(500).json({ message: "Gagal memuat data keuangan landlord." });
    }
  });
  router2.get("/withdrawals", authenticateToken, async (req, res) => {
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
  router2.get("/withdrawals/me", authenticateToken, async (req, res) => {
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
  router2.get("/landlord/rentals", authenticateToken, requireRole(["admin", "landlord"]), async (req, res) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }
    const landlordId = authUser.role === "admin" && req.query.landlordId ? String(req.query.landlordId) : authUser.id;
    try {
      const [rows] = await pool.query(
        `SELECT 
           r.*, 
           p.name as propertyName,
           rm.roomNumber,
           rm.floor AS roomFloor,
           rm.type AS roomType,
           u.name AS tenantName,
           u.phone AS tenantPhone,
           u.email AS tenantEmail
         FROM rentals r 
         JOIN properties p ON r.propertyId = p.id 
         LEFT JOIN rooms rm ON r.roomId = rm.id
         LEFT JOIN users u ON r.tenantId = u.id
         WHERE p.ownerId = ? 
         ORDER BY r.id DESC 
         LIMIT 50`,
        [landlordId]
      );
      const enriched = rows.map((r) => {
        const duration = Number(r.duration_months || 1);
        const schedule = rentalService.computePaymentSchedule(
          String(r.startDate || (/* @__PURE__ */ new Date()).toISOString()),
          String(r.status || "active"),
          duration
        );
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
      res.json(enriched);
    } catch (err) {
      console.error("Get landlord rentals error:", err);
      res.status(500).json({ message: "Gagal mengambil data sewa landlord." });
    }
  });
  router2.post("/withdraw", authenticateToken, requireRole(["admin", "landlord"]), validateBody(withdrawalSchema), async (req, res) => {
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
      const holder = accountHolder || user.bankAccountHolder || user.name || "";
      await connection.query(
        "UPDATE users SET balance = ?, bankName = ?, bankAccountNumber = ?, bankAccountHolder = ? WHERE id = ?",
        [newBalance, bankName, accountNumber, holder, targetUserId]
      );
      const withdrawalId = generateId("w");
      const dateStr = (/* @__PURE__ */ new Date()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
      await connection.query(
        `INSERT INTO withdrawals (id, userId, bankName, accountNumber, accountHolder, amount, date, status, referenceId, rejectionReason, processedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '', '', '')`,
        [withdrawalId, targetUserId, bankName, accountNumber, holder, withdrawAmount, dateStr]
      );
      await connection.commit();
      apiCache.invalidatePattern("landlord:");
      apiCache.invalidatePattern("admin:");
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
  router2.get("/admin/withdrawals", authenticateToken, requireRole(["admin"]), async (req, res) => {
    const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : void 0;
    const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const offsetParam = req.query.offset ? parseInt(String(req.query.offset), 10) : limitParam ? (pageParam - 1) * limitParam : 0;
    try {
      let sql = `
        SELECT w.*, u.name as userName, u.email as userEmail, u.phone as userPhone
        FROM withdrawals w
        LEFT JOIN users u ON w.userId = u.id
        ORDER BY w.id DESC
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
  router2.post("/admin/withdrawals/:id/process", authenticateToken, requireRole(["admin"]), validateBody(processWithdrawalSchema), async (req, res) => {
    const { id } = req.params;
    const targetStatus = req.body?.status || "completed";
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [earlyRows] = await connection.query(
        "SELECT id, userId FROM withdrawals WHERE id = ?",
        [id]
      );
      const earlyWithdrawal = earlyRows[0];
      if (!earlyWithdrawal) {
        await connection.rollback();
        return res.status(404).json({ message: "Permintaan penarikan tidak ditemukan." });
      }
      if (earlyWithdrawal.userId) {
        await connection.query(
          "SELECT id, balance, totalWithdrawn FROM users WHERE id = ? FOR UPDATE",
          [earlyWithdrawal.userId]
        );
      }
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
      apiCache.invalidatePattern("landlord:");
      apiCache.invalidatePattern("admin:");
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
  router2.post(
    "/admin/withdrawals/:id/reject",
    authenticateToken,
    requireRole(["admin"]),
    validateBody(rejectWithdrawalSchema),
    async (req, res) => {
      const { id } = req.params;
      const { reason, password } = req.body || {};
      const authUser = req.user;
      if (!password) {
        return res.status(400).json({ message: "Password konfirmasi administrator diperlukan." });
      }
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [earlyRows] = await connection.query(
          "SELECT id, userId FROM withdrawals WHERE id = ?",
          [id]
        );
        const earlyWithdrawal = earlyRows[0];
        if (!earlyWithdrawal) {
          await connection.rollback();
          return res.status(404).json({ message: "Permintaan penarikan tidak ditemukan." });
        }
        const [adminRows] = await connection.query(
          "SELECT password FROM users WHERE id = ?",
          [authUser?.id]
        );
        const admin = adminRows[0];
        const isMatch = admin && admin.password ? await bcrypt6.compare(password, admin.password) : false;
        if (!admin || !admin.password || !isMatch) {
          await connection.rollback();
          return res.status(401).json({ message: "Password administrator salah." });
        }
        if (earlyWithdrawal.userId) {
          await connection.query(
            "SELECT id, balance, totalWithdrawn FROM users WHERE id = ? FOR UPDATE",
            [earlyWithdrawal.userId]
          );
        }
        const [rows] = await connection.query(
          "SELECT * FROM withdrawals WHERE id = ? FOR UPDATE",
          [id]
        );
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
        apiCache.invalidatePattern("landlord:");
        apiCache.invalidatePattern("admin:");
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
    }
  );
}

// backend/services/contract.ts
import PDFDocument from "pdfkit";
import crypto5 from "crypto";
import path3 from "path";
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
  return crypto5.createHash("sha256").update(buffer).digest("hex");
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
      doc.font("Helvetica").fontSize(7).fillColor("#334155").text(`\u2022 Unit / Room    : ${data.propertyName}${data.roomNumber ? ` (Kamar ${data.roomNumber})` : ""}`, 42, gridY + 26).text(`\u2022 Alamat / Addr  : ${propertyAddress}`, 42, gridY + 38, { width: colWidth - 12 }).text(`\u2022 Mulai / Start  : ${data.startDate} \u2022 Durasi: ${duration} Bulan / Month(s)`, 42, gridY + 60);
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
      doc.rect(36, doc.y, pageWidth, 78).fillAndStroke("#f1f5f9", "#cbd5e1");
      const uY = doc.y + 3;
      doc.font("Helvetica").fontSize(6.8).fillColor("#1e293b").text(`\u2022 Listrik (Electricity)       : Termasuk kuota token listrik standar ${elecText}/bulan. Pemakaian lebih dibayar mandiri sesuai tarif resmi PLN.`, 42, uY);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("  Standard electricity token allowance included. Excess consumption billed at official PLN rates.", 48, uY + 8);
      doc.font("Helvetica").fontSize(6.8).fillColor("#1e293b").text(`\u2022 Air Bersih (Water Supply)   : ${waterText}. Pemakaian domestik & sanitasi harian wajar.`, 42, uY + 16);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("  Domestic sanitary water usage included (PDAM / filtered deep well).", 48, uY + 23);
      doc.font("Helvetica").fontSize(6.8).fillColor("#1e293b").text(`\u2022 Internet Wi-Fi (100 Mbps)   : Akses broadband internet bersama berkecepatan tinggi hingga ${wifiText} (100Mbps High-Speed WiFi).`, 42, uY + 31);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("  High-speed wireless broadband shared internet access up to 100 Mbps included.", 48, uY + 38);
      doc.font("Helvetica").fontSize(6.8).fillColor("#1e293b").text(`\u2022 Smart Lock & Kebersihan     : Akses kunci digital Smart Lock mandiri & layanan pembersihan kamar berkala terjadwal (Scheduled Room Cleaning).`, 42, uY + 46);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("  Keyless digital smart lock access & regular scheduled room cleaning service included.", 48, uY + 53);
      doc.font("Helvetica").fontSize(6.8).fillColor("#1e293b").text(`\u2022 Sampah & Keamanan (24/7)    : ${wasteText} & ${secText} (1 slot parkir kendaraan).`, 42, uY + 61);
      doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#64748b").text("  Scheduled waste disposal, 24/7 access, CCTV surveillance, and 1 vehicle parking slot included.", 48, uY + 68);
      doc.y = uY + 77;
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
async function generateAndUploadContract(data) {
  const pdfBuffer = await generateRentalContractBuffer(data);
  const contractHash = computeContractHash(pdfBuffer);
  const sanitizedId = sanitizeRentalId(data.rentalId);
  const filename = `contract_${sanitizedId}.pdf`;
  let cloudinaryUrl;
  try {
    const uploadRes = await uploadContractStream(pdfBuffer, filename, "kosmo/contracts");
    cloudinaryUrl = uploadRes.secure_url ? uploadRes.secure_url.includes("kosmo_contracts") ? uploadRes.secure_url : `${uploadRes.secure_url}#kosmo_contracts/${filename}` : void 0;
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

// backend/repositories/contracts.repository.ts
var ContractsRepository = class {
  defaultPool;
  constructor(customPool = pool) {
    this.defaultPool = customPool;
  }
  async findPropertyById(propertyId, conn = this.defaultPool, forUpdate = false) {
    const sql = `SELECT id, name, address, price, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ?${forUpdate ? " FOR UPDATE" : ""}`;
    const [rows] = await conn.query(sql, [propertyId]);
    return rows[0];
  }
  async findRoomById(roomId, propertyId, conn = this.defaultPool, forUpdate = false) {
    const sql = `SELECT id, propertyId, roomNumber, floor, type, price, status, reserved_until, reserved_by_rental_id,
      GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
      FROM rooms WHERE id = ? AND propertyId = ?${forUpdate ? " FOR UPDATE" : ""}`;
    const [rows] = await conn.query(sql, [roomId, propertyId]);
    return rows[0];
  }
  async findAvailableRoom(propertyId, conn, forUpdate = true, rentalId) {
    const holdFilter = rentalId ? "(reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL OR reserved_by_rental_id = ?)" : "(reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL)";
    const params = rentalId ? [propertyId, rentalId] : [propertyId];
    const sql = `SELECT id, propertyId, roomNumber, floor, type, price, status, reserved_until, reserved_by_rental_id,
      GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
      FROM rooms WHERE propertyId = ? AND status = 'available' AND ${holdFilter} ORDER BY roomNumber ASC, id ASC LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`;
    const [rows] = await conn.query(sql, params);
    return rows[0];
  }
  async reserveRoomHold(roomId, rentalId, conn) {
    await conn.query(
      "UPDATE rooms SET reserved_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE), reserved_by_rental_id = ? WHERE id = ?",
      [rentalId, roomId]
    );
  }
  async releaseRoomHold(rentalId, conn = this.defaultPool) {
    await conn.query(
      "UPDATE rooms SET reserved_until = NULL, reserved_by_rental_id = NULL WHERE reserved_by_rental_id = ?",
      [rentalId]
    );
  }
  async countRoomsByPropertyId(propertyId, conn = this.defaultPool) {
    const [rows] = await conn.query(
      "SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?",
      [propertyId]
    );
    return Number(rows[0]?.count || 0);
  }
  async findUserById(userId, conn = this.defaultPool, forUpdate = false) {
    const sql = `SELECT * FROM users WHERE id = ?${forUpdate ? " FOR UPDATE" : ""}`;
    const [rows] = await conn.query(sql, [userId]);
    return rows[0];
  }
  async findActiveRentalsByTenantId(tenantId, conn, forUpdate = true) {
    const sql = `SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active'${forUpdate ? " FOR UPDATE" : ""}`;
    const [rows] = await conn.query(sql, [tenantId]);
    return rows;
  }
  async insertContractRental(data, conn) {
    const sql = `INSERT INTO rentals (
      id,
      tenantId,
      propertyId,
      roomId,
      propertyName,
      price,
      startDate,
      status,
      document,
      contract_url,
      contract_hash,
      contract_signed_at,
      signer_ip,
      signer_user_agent,
      tenant_nik_passport,
      tenant_signature_data,
      admin_fee_amount,
      duration_months
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    await conn.query(sql, [
      data.rentalId,
      data.tenantId,
      data.propertyId,
      data.roomId || null,
      data.propertyName,
      data.rentalPrice,
      data.startDateStr,
      data.contractUrl || null,
      data.contractUrl || null,
      data.contractHash,
      data.signedAtDate,
      data.signerIp,
      data.signerUserAgent,
      data.tenantNikPassport,
      data.signatureBase64,
      data.adminFee,
      data.duration
    ]);
  }
  async updateRoomOccupied(roomId, conn) {
    await conn.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [roomId]);
  }
  async incrementPropertyOccupied(propertyId, conn) {
    await conn.query("UPDATE properties SET occupiedRooms = occupiedRooms + 1 WHERE id = ?", [
      propertyId
    ]);
  }
  async findRentalContractJoinedById(rentalId) {
    const sql = `SELECT 
      r.id AS rental_id,
      r.tenantId AS rental_tenant_id,
      r.propertyId AS rental_property_id,
      r.roomId AS rental_room_id,
      rm.roomNumber AS room_number,
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
    LEFT JOIN rooms rm ON r.roomId = rm.id
    LEFT JOIN users u ON r.tenantId = u.id
    LEFT JOIN users l ON p.ownerId = l.id
    WHERE r.id = ?`;
    const [rows] = await this.defaultPool.query(sql, [rentalId]);
    return rows[0];
  }
};
var contractsRepository = new ContractsRepository();

// backend/services/contract.service.ts
var ContractServiceError = class extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = "ContractServiceError";
  }
  statusCode;
  details;
};
var ContractService = class {
  constructor(repo = contractsRepository) {
    this.repo = repo;
  }
  repo;
  async generatePreview(input) {
    const {
      authUser,
      propertyId,
      durationMonths,
      startDate,
      roomId,
      tenantNikPassport,
      signatureBase64,
      rentalId: customRentalId,
      signerIp,
      signerUserAgent
    } = input;
    const property = await this.repo.findPropertyById(propertyId);
    if (!property) {
      throw new ContractServiceError(404, "Properti tidak ditemukan.");
    }
    let room;
    if (roomId && typeof roomId === "string" && roomId.trim() !== "") {
      room = await this.repo.findRoomById(roomId.trim(), propertyId);
      if (!room) {
        throw new ContractServiceError(404, "Kamar tidak ditemukan pada properti ini.");
      }
    }
    const tenant = await this.repo.findUserById(authUser.id);
    let landlord = property.ownerId ? await this.repo.findUserById(property.ownerId) : void 0;
    const signedAtDate = /* @__PURE__ */ new Date();
    const signedAtIso = signedAtDate.toISOString();
    const duration = Number(durationMonths) || 1;
    const monthlyPrice = room && typeof room.price === "number" && room.price > 0 ? Number(room.price) : Number(property.price) || 0;
    const adminFee = 5e3;
    const totalPrice = monthlyPrice * duration + adminFee;
    const startDateStr = startDate || signedAtIso.split("T")[0];
    const rentalId = customRentalId && typeof customRentalId === "string" && customRentalId.trim() !== "" ? customRentalId.trim() : "preview-draft";
    const contractData = {
      rentalId,
      roomId: room ? room.id : void 0,
      roomNumber: room ? room.roomNumber : void 0,
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
    return {
      success: true,
      contractData,
      contractHash,
      monthlyPrice,
      adminFee,
      totalPrice,
      totalAmount: totalPrice,
      room: room ? {
        id: room.id,
        roomNumber: room.roomNumber,
        floor: room.floor,
        type: room.type,
        price: room.price,
        effectivePrice: monthlyPrice,
        status: room.status
      } : null,
      isProfileComplete: profileStatus.complete,
      missingProfileFields: profileStatus.missingFields,
      missingProfileFieldLabels: profileStatus.missingFieldLabels
    };
  }
  async signContract(input) {
    const {
      authUser,
      propertyId,
      durationMonths,
      startDate,
      roomId,
      tenantNikPassport,
      signatureBase64,
      rentalId: customRentalId,
      signerIp,
      signerUserAgent
    } = input;
    const duration = Number(durationMonths) || 1;
    const adminFee = 5e3;
    let rentalId;
    let selectedRoom;
    let contractData;
    let signedAtDate;
    let signedAtIso;
    let rentalPrice;
    let totalAmount;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      rentalId = customRentalId && typeof customRentalId === "string" && customRentalId.trim() !== "" ? customRentalId.trim() : generateId("rent");
      const property = await this.repo.findPropertyById(propertyId, connection, true);
      if (!property) {
        await connection.rollback();
        throw new ContractServiceError(404, "Properti tidak ditemukan.");
      }
      if (property.occupiedRooms >= property.totalRooms) {
        await connection.rollback();
        throw new ContractServiceError(400, "Kamar kos sudah penuh.");
      }
      if (roomId && typeof roomId === "string" && roomId.trim() !== "") {
        selectedRoom = await this.repo.findRoomById(roomId.trim(), propertyId, connection, true);
        if (!selectedRoom) {
          await connection.rollback();
          throw new ContractServiceError(404, "Kamar tidak ditemukan pada properti ini.");
        }
        const heldByOther = Boolean(selectedRoom.reserved_by_rental_id) && selectedRoom.reserved_by_rental_id !== rentalId && Number(selectedRoom.holdRemainingSeconds || 0) > 0;
        if (selectedRoom.status !== "available" || heldByOther) {
          await connection.rollback();
          throw new ContractServiceError(409, "Kamar yang Anda pilih sudah tidak tersedia.");
        }
      } else {
        const availableRoom = await this.repo.findAvailableRoom(
          propertyId,
          connection,
          true,
          rentalId
        );
        if (availableRoom) {
          selectedRoom = availableRoom;
        } else {
          const discreteCount = await this.repo.countRoomsByPropertyId(propertyId, connection);
          if (discreteCount > 0) {
            await connection.rollback();
            throw new ContractServiceError(409, "Kamar yang Anda pilih sudah tidak tersedia.");
          }
        }
      }
      const tenant = await this.repo.findUserById(authUser.id, connection, true);
      if (!tenant) {
        await connection.rollback();
        throw new ContractServiceError(404, "Pengguna tidak ditemukan.");
      }
      const profileCheck = isUserProfileComplete(tenant);
      if (!profileCheck.complete) {
        await connection.rollback();
        throw new ContractServiceError(
          422,
          "Profil identitas hukum penyewa belum lengkap. Berdasarkan Pasal 1320 KUHPerdata & UU ITE, Anda wajib melengkapi data identitas (NIK/Paspor, Alamat Domisili, Pekerjaan, dan Kontak Darurat) pada profil Anda sebelum menyewa kos.",
          {
            missingFields: profileCheck.missingFields,
            missingFieldLabels: profileCheck.missingFieldLabels
          }
        );
      }
      const activeRentals = await this.repo.findActiveRentalsByTenantId(authUser.id, connection, true);
      if (activeRentals.length > 0) {
        await connection.rollback();
        throw new ContractServiceError(
          409,
          "Single Active Tenancy Violation: Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru."
        );
      }
      const landlord = property.ownerId ? await this.repo.findUserById(property.ownerId, connection) : void 0;
      signedAtDate = /* @__PURE__ */ new Date();
      signedAtIso = signedAtDate.toISOString();
      rentalPrice = selectedRoom && typeof selectedRoom.price === "number" && selectedRoom.price > 0 ? Number(selectedRoom.price) : Number(property.price) || 0;
      totalAmount = rentalPrice * duration + adminFee;
      const startDateStr = startDate || signedAtIso.split("T")[0];
      const startDateIso = /^\d{4}-\d{2}-\d{2}$/.test(startDateStr.trim()) ? startDateStr.trim() : null;
      contractData = {
        rentalId,
        roomId: selectedRoom ? selectedRoom.id : void 0,
        roomNumber: selectedRoom ? selectedRoom.roomNumber : void 0,
        propertyName: property.name,
        propertyAddress: property.address || "Kabupaten Badung / Kota Denpasar, Bali, Indonesia",
        landlordName: landlord ? landlord.name : "PT KOSMO Bali Hospitality / Pengelola Properti",
        landlordEmail: landlord ? landlord.email : "hospitality@kosmo.id",
        landlordPhone: landlord ? landlord.phone : "+62 361-900-5676",
        tenantName: tenant.name,
        tenantEmail: tenant.email,
        tenantPhone: tenant.phone || "",
        tenantNikPassport: tenantNikPassport || tenant.identity_number || "-",
        tenantAddress: tenant.address || "",
        tenantOccupation: tenant.occupation || "",
        emergencyContactName: tenant.emergency_contact_name || "",
        emergencyContactPhone: tenant.emergency_contact_phone || "",
        emergencyContactRelation: tenant.emergency_contact_relation || "",
        startDate: startDateStr,
        durationMonths: duration,
        monthlyPrice: rentalPrice,
        pricePerMonth: rentalPrice,
        totalPrice: totalAmount,
        adminFee,
        signatureBase64,
        signerIp,
        signerUserAgent,
        signedAt: signedAtDate,
        utilityQuotas: {
          electricityKwh: 200,
          water: "PDAM & Deep Well (Air Bersih Terfilter) Included",
          wifiMbps: 100,
          security: "24/7 CCTV & Security Access",
          waste: "Daily Waste Management Included"
        }
      };
      await connection.query(
        `INSERT INTO rentals (
          id,
          tenantId,
          propertyId,
          roomId,
          propertyName,
          price,
          startDate,
          start_date_iso,
          status,
          signer_ip,
          signer_user_agent,
          tenant_nik_passport,
          tenant_signature_data,
          admin_fee_amount,
          duration_months
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
        [
          rentalId,
          authUser.id,
          propertyId,
          selectedRoom ? selectedRoom.id : null,
          property.name,
          rentalPrice,
          startDateStr,
          startDateIso,
          signerIp,
          signerUserAgent,
          tenantNikPassport || tenant.identity_number || "-",
          signatureBase64,
          adminFee,
          duration
        ]
      );
      if (selectedRoom) {
        await this.repo.reserveRoomHold(selectedRoom.id, rentalId, connection);
      }
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
    let contractUrl;
    let contractHash;
    try {
      const uploadResult = await generateAndUploadContract(contractData);
      contractUrl = uploadResult.cloudinaryUrl || `/uploads/contract_${sanitizeRentalId(rentalId)}.pdf`;
      contractHash = uploadResult.contractHash;
    } catch (phaseBErr) {
      try {
        await this.repo.releaseRoomHold(rentalId);
        await pool.query("DELETE FROM rentals WHERE id = ? AND status = 'pending'", [rentalId]);
      } catch (cleanupErr) {
        console.error(`[ContractService] Failed to clean up pending rental ${rentalId} after Phase B failure:`, cleanupErr);
      }
      throw phaseBErr;
    }
    try {
      await pool.query(
        `UPDATE rentals 
         SET contract_url = ?, 
             contract_hash = ?, 
             contract_signed_at = ?,
             document = COALESCE(?, document)
         WHERE id = ?`,
        [contractUrl, contractHash, signedAtDate, contractUrl, rentalId]
      );
    } catch (phaseCErr) {
      try {
        await this.repo.releaseRoomHold(rentalId);
        await pool.query("DELETE FROM rentals WHERE id = ? AND status = 'pending'", [rentalId]);
      } catch (cleanupErr) {
        console.error(`[ContractService] Failed to clean up pending rental ${rentalId} after Phase C failure:`, cleanupErr);
      }
      throw phaseCErr;
    }
    apiCache.invalidatePattern("properties");
    apiCache.invalidatePattern("rentals");
    apiCache.invalidatePattern("landlord:");
    apiCache.invalidatePattern("admin:");
    return {
      success: true,
      message: "Kontrak digital berhasil ditandatangani. Silakan selesaikan pembayaran.",
      rentalId,
      roomId: selectedRoom ? selectedRoom.id : null,
      roomNumber: selectedRoom ? selectedRoom.roomNumber : null,
      contractUrl,
      contractHash,
      adminFee,
      totalAmount,
      monthlyPrice: rentalPrice,
      durationMonths: duration,
      signedAt: signedAtIso
    };
  }
  async getContractPdf(rentalId, authUser) {
    const rental = await this.repo.findRentalContractJoinedById(rentalId);
    if (!rental) {
      throw new ContractServiceError(404, "Data sewa tidak ditemukan.");
    }
    const isTenant = authUser.id === rental.rental_tenant_id;
    const isOwner = Boolean(rental.property_owner_id && authUser.id === rental.property_owner_id);
    const isAdmin = authUser.role === "admin";
    if (!isTenant && !isOwner && !isAdmin) {
      throw new ContractServiceError(403, "Akses ditolak ke dokumen kontrak ini.");
    }
    const contractDuration = Number(rental.duration_months || 1);
    const contractMonthlyPrice = Number(rental.rental_price || rental.property_price || 0);
    const contractAdminFee = rental.admin_fee_amount !== void 0 && rental.admin_fee_amount !== null ? Number(rental.admin_fee_amount) : 5e3;
    const contractTotalPrice = contractMonthlyPrice * contractDuration + contractAdminFee;
    const contractData = {
      rentalId: rental.rental_id,
      roomId: rental.rental_room_id || void 0,
      roomNumber: rental.room_number || void 0,
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
    return {
      pdfBuffer,
      contractHash,
      safeId
    };
  }
};
var contractService = new ContractService();

// backend/routes/contracts.routes.ts
function registerContractRoutes(router2) {
  router2.post(
    "/rentals/contract/preview",
    authenticateToken,
    validateBody(previewContractSchema),
    async (req, res) => {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: "Akses ditolak. Token otentikasi diperlukan." });
      }
      const signerIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip || req.socket.remoteAddress || "127.0.0.1";
      const signerUserAgent = req.headers["user-agent"] || "Mozilla/5.0 (KOSMO Secure Client)";
      try {
        const preview = await contractService.generatePreview({
          authUser,
          propertyId: req.body.propertyId,
          durationMonths: req.body.durationMonths,
          startDate: req.body.startDate,
          roomId: req.body.roomId,
          tenantNikPassport: req.body.tenantNikPassport,
          signatureBase64: req.body.signatureBase64,
          rentalId: req.body.rentalId,
          signerIp,
          signerUserAgent
        });
        return res.status(200).json(preview);
      } catch (err) {
        if (err instanceof ContractServiceError) {
          return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            ...err.details
          });
        }
        console.error("Contract preview error:", err);
        return res.status(500).json({ success: false, message: "Gagal membuat pratinjau kontrak digital." });
      }
    }
  );
  router2.post(
    "/rentals/contract/sign",
    authenticateToken,
    validateBody(signContractSchema),
    async (req, res) => {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: "Akses ditolak. Token otentikasi diperlukan." });
      }
      const signerIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip || req.socket.remoteAddress || "127.0.0.1";
      const signerUserAgent = req.headers["user-agent"] || "Mozilla/5.0 (KOSMO Secure Client)";
      try {
        const result = await contractService.signContract({
          authUser,
          propertyId: req.body.propertyId,
          durationMonths: req.body.durationMonths,
          startDate: req.body.startDate,
          roomId: req.body.roomId,
          tenantNikPassport: req.body.tenantNikPassport,
          signatureBase64: req.body.signatureBase64,
          rentalId: req.body.rentalId,
          signerIp,
          signerUserAgent
        });
        return res.status(201).json(result);
      } catch (err) {
        if (err instanceof ContractServiceError) {
          return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            ...err.details
          });
        }
        console.error("Contract sign error:", err);
        return res.status(500).json({ success: false, message: "Gagal memproses penandatanganan kontrak digital." });
      }
    }
  );
  router2.get(
    "/rentals/:id/contract",
    authenticateToken,
    async (req, res) => {
      const { id } = req.params;
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: "Akses ditolak. Token otentikasi diperlukan." });
      }
      try {
        const { pdfBuffer, contractHash, safeId } = await contractService.getContractPdf(String(id), authUser);
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
        if (err instanceof ContractServiceError) {
          return res.status(err.statusCode).json({ message: err.message });
        }
        console.error("Get contract PDF error:", err);
        res.status(500).json({ message: "Gagal membuat dokumen kontrak PDF." });
      }
    }
  );
}

// backend/routes/rooms.routes.ts
import bcrypt7 from "bcryptjs";
function formatRoomResponse(room, basePropertyPrice, photos = []) {
  const numPrice = room.price !== null && room.price !== void 0 ? Number(room.price) : null;
  const effectivePrice = numPrice !== null && numPrice > 0 ? numPrice : Number(basePropertyPrice || 0);
  return {
    id: String(room.id),
    propertyId: String(room.propertyId),
    roomNumber: String(room.roomNumber),
    floor: Number(room.floor),
    type: String(room.type),
    price: numPrice,
    effectivePrice,
    status: room.status,
    photos,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}
function registerRoomRoutes(router2) {
  router2.get("/properties/:id/rooms", async (req, res) => {
    const { id } = req.params;
    const statusQuery = typeof req.query.status === "string" ? req.query.status.toLowerCase().trim() : "all";
    if (statusQuery !== "all" && !["available", "occupied", "maintenance"].includes(statusQuery)) {
      return res.status(400).json({
        message: "Parameter status tidak valid. Gunakan 'all', 'available', 'occupied', atau 'maintenance'."
      });
    }
    const cacheKey = `properties:${id}:rooms:${statusQuery}`;
    const cached = apiCache.get(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      return res.json(cached);
    }
    try {
      const [propRows] = await pool.query(
        "SELECT id, price FROM properties WHERE id = ?",
        [id]
      );
      if (propRows.length === 0) {
        return res.status(404).json({ message: "Properti tidak ditemukan." });
      }
      const basePropertyPrice = Number(propRows[0].price || 0);
      let sql = `
        SELECT id, propertyId, roomNumber, floor, type, price, status, reserved_until, reserved_by_rental_id, createdAt, updatedAt
        FROM rooms
        WHERE propertyId = ?
      `;
      const params = [id];
      if (statusQuery !== "all") {
        sql += " AND status = ?";
        params.push(statusQuery);
        if (statusQuery === "available") {
          sql += " AND (reserved_until IS NULL OR reserved_until <= NOW())";
        }
      }
      sql += " ORDER BY floor ASC, CAST(roomNumber AS UNSIGNED) ASC, roomNumber ASC";
      const [[roomRows], [photoRows]] = await Promise.all([
        pool.query(sql, params),
        pool.query(
          `SELECT id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt, updatedAt
           FROM property_photos
           WHERE propertyId = ? AND roomId IS NOT NULL
           ORDER BY orderIndex ASC`,
          [id]
        )
      ]);
      const photosByRoomId = /* @__PURE__ */ new Map();
      for (const p of photoRows) {
        if (p.roomId) {
          const list = photosByRoomId.get(p.roomId) || [];
          list.push({
            id: p.id,
            propertyId: p.propertyId,
            roomId: p.roomId,
            url: p.url,
            publicId: p.publicId,
            category: p.category,
            caption: p.caption,
            orderIndex: Number(p.orderIndex),
            createdAt: p.createdAt,
            updatedAt: p.updatedAt || p.createdAt
          });
          photosByRoomId.set(p.roomId, list);
        }
      }
      const formattedRooms = roomRows.map(
        (r) => formatRoomResponse(r, basePropertyPrice, photosByRoomId.get(r.id) || [])
      );
      apiCache.set(cacheKey, formattedRooms, 30);
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      return res.json(formattedRooms);
    } catch (err) {
      console.error("GET /api/properties/:id/rooms error:", err);
      return res.status(500).json({ message: "Gagal mengambil daftar kamar properti." });
    }
  });
  router2.get("/rooms/:roomId", async (req, res) => {
    const { roomId } = req.params;
    const cacheKey = `rooms:detail:${roomId}`;
    const cached = apiCache.get(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      return res.json(cached);
    }
    try {
      const [rows] = await pool.query(
        `SELECT r.*, p.ownerId, p.price as propertyPrice
         FROM rooms r
         JOIN properties p ON r.propertyId = p.id
         WHERE r.id = ?`,
        [roomId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: "Kamar tidak ditemukan." });
      }
      const room = rows[0];
      const [photos] = await pool.query(
        `SELECT id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt, updatedAt
         FROM property_photos
         WHERE roomId = ?
         ORDER BY orderIndex ASC`,
        [roomId]
      );
      const formattedRoom = formatRoomResponse(
        room,
        room.propertyPrice,
        photos.map((p) => ({
          id: p.id,
          propertyId: p.propertyId,
          roomId: p.roomId,
          url: p.url,
          publicId: p.publicId,
          category: p.category,
          caption: p.caption,
          orderIndex: Number(p.orderIndex),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt || p.createdAt
        }))
      );
      apiCache.set(cacheKey, formattedRoom, 30);
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      return res.json(formattedRoom);
    } catch (err) {
      console.error("GET /api/rooms/:roomId error:", err);
      return res.status(500).json({ message: "Gagal mengambil detail kamar." });
    }
  });
  router2.post(
    "/properties/:id/rooms",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    validateBody(createRoomSchema),
    async (req, res) => {
      const propertyId = String(req.params.id);
      const { roomNumber, floor, type, price, status } = req.body;
      const authUser = req.user;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [propRows] = await connection.query(
          "SELECT id, ownerId, price FROM properties WHERE id = ? FOR UPDATE",
          [propertyId]
        );
        if (propRows.length === 0) {
          await connection.rollback();
          return res.status(404).json({ message: "Properti tidak ditemukan." });
        }
        const property = propRows[0];
        if (authUser?.role !== "admin" && property.ownerId !== authUser?.id) {
          await connection.rollback();
          return res.status(403).json({ message: "Akses ditolak. Anda bukan pemilik properti ini." });
        }
        const [existing] = await connection.query(
          "SELECT COUNT(*) as count FROM rooms WHERE propertyId = ? AND roomNumber = ? FOR UPDATE",
          [propertyId, roomNumber]
        );
        if (Number(existing[0]?.count || 0) > 0) {
          await connection.rollback();
          return res.status(409).json({ message: "Nomor kamar sudah terdaftar pada properti ini." });
        }
        const roomId = generateId("room");
        const numPrice = price !== void 0 && price !== null ? Number(price) : null;
        const roomStatus = status || "available";
        await connection.query(
          `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [roomId, propertyId, roomNumber, Number(floor), type || "Standard", numPrice, roomStatus]
        );
        const counts = await syncPropertyRoomCounts(connection, propertyId);
        await connection.commit();
        apiCache.invalidatePattern("properties");
        apiCache.invalidatePattern("rooms");
        apiCache.invalidatePattern("landlord:");
        apiCache.invalidatePattern("admin:");
        const createdRoom = formatRoomResponse(
          {
            id: roomId,
            propertyId,
            roomNumber,
            floor: Number(floor),
            type: type || "Standard",
            price: numPrice,
            status: roomStatus
          },
          property.price,
          []
        );
        return res.status(201).json({
          message: "Kamar berhasil ditambahkan!",
          room: createdRoom,
          counts
        });
      } catch (err) {
        await connection.rollback();
        console.error("POST /api/properties/:id/rooms error:", err);
        return res.status(500).json({ message: "Gagal menambahkan kamar baru." });
      } finally {
        connection.release();
      }
    }
  );
  const handleUpdateRoom = async (req, res) => {
    const targetRoomId = String(req.params.roomId || req.params.id);
    const targetPropertyId = req.params.id ? String(req.params.id) : null;
    const { roomNumber, floor, type, price, status } = req.body;
    const authUser = req.user;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      let querySql = `
        SELECT r.*, p.ownerId, p.price as propertyPrice
        FROM rooms r
        JOIN properties p ON r.propertyId = p.id
        WHERE r.id = ?
      `;
      const queryParams = [targetRoomId];
      if (targetPropertyId) {
        querySql += " AND r.propertyId = ?";
        queryParams.push(targetPropertyId);
      }
      querySql += " FOR UPDATE";
      const [rows] = await connection.query(querySql, queryParams);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Kamar tidak ditemukan." });
      }
      const existing = rows[0];
      if (authUser?.role !== "admin" && existing.ownerId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: "Akses ditolak. Anda bukan pemilik properti ini." });
      }
      if (roomNumber && roomNumber !== existing.roomNumber) {
        const [conflictRows] = await connection.query(
          "SELECT COUNT(*) as count FROM rooms WHERE propertyId = ? AND roomNumber = ? AND id != ? FOR UPDATE",
          [existing.propertyId, roomNumber, targetRoomId]
        );
        if (Number(conflictRows[0]?.count || 0) > 0) {
          await connection.rollback();
          return res.status(409).json({ message: "Nomor kamar sudah digunakan oleh kamar lain." });
        }
      }
      if (status && status !== existing.status && existing.status === "occupied") {
        const [activeRentals] = await connection.query(
          "SELECT COUNT(*) as activeCount FROM rentals WHERE roomId = ? AND status IN ('active', 'pending') FOR UPDATE",
          [targetRoomId]
        );
        if (Number(activeRentals[0]?.activeCount || 0) > 0) {
          await connection.rollback();
          return res.status(409).json({
            message: "Status kamar tidak dapat diubah karena masih memiliki sewa aktif berjalan."
          });
        }
      }
      const updatedRoomNumber = roomNumber !== void 0 ? roomNumber : existing.roomNumber;
      const updatedFloor = floor !== void 0 ? Number(floor) : existing.floor;
      const updatedType = type !== void 0 ? type : existing.type;
      const updatedPrice = price !== void 0 ? price !== null ? Number(price) : null : existing.price;
      const updatedStatus = status !== void 0 ? status : existing.status;
      await connection.query(
        `UPDATE rooms SET
           roomNumber = ?,
           floor = ?,
           type = ?,
           price = ?,
           status = ?
         WHERE id = ?`,
        [updatedRoomNumber, updatedFloor, updatedType, updatedPrice, updatedStatus, targetRoomId]
      );
      const counts = await syncPropertyRoomCounts(connection, existing.propertyId);
      await connection.commit();
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("rooms");
      const [photos] = await pool.query(
        `SELECT id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt, updatedAt
         FROM property_photos
         WHERE roomId = ?
         ORDER BY orderIndex ASC`,
        [targetRoomId]
      );
      return res.json({
        message: "Kamar berhasil diperbarui!",
        room: formatRoomResponse(
          {
            id: targetRoomId,
            propertyId: existing.propertyId,
            roomNumber: updatedRoomNumber,
            floor: updatedFloor,
            type: updatedType,
            price: updatedPrice,
            status: updatedStatus
          },
          existing.propertyPrice,
          photos.map((p) => ({
            id: p.id,
            propertyId: p.propertyId,
            roomId: p.roomId,
            url: p.url,
            publicId: p.publicId,
            category: p.category,
            caption: p.caption,
            orderIndex: Number(p.orderIndex),
            createdAt: p.createdAt,
            updatedAt: p.updatedAt || p.createdAt
          }))
        ),
        counts
      });
    } catch (err) {
      await connection.rollback();
      console.error("PUT room error:", err);
      return res.status(500).json({ message: "Gagal memperbarui data kamar." });
    } finally {
      connection.release();
    }
  };
  router2.put(
    "/properties/:id/rooms/:roomId",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    validateBody(updateRoomSchema),
    handleUpdateRoom
  );
  router2.put(
    "/rooms/:roomId",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    validateBody(updateRoomSchema),
    handleUpdateRoom
  );
  const handleToggleRoomStatus = async (req, res) => {
    const targetRoomId = String(req.params.roomId || req.params.id);
    const targetPropertyId = req.params.id ? String(req.params.id) : null;
    const { status } = req.body;
    const authUser = req.user;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      let querySql = `
        SELECT r.id, r.propertyId, r.roomNumber, r.floor, r.type, r.price, r.status, p.ownerId, p.price as propertyPrice
        FROM rooms r
        JOIN properties p ON r.propertyId = p.id
        WHERE r.id = ?
      `;
      const queryParams = [targetRoomId];
      if (targetPropertyId) {
        querySql += " AND r.propertyId = ?";
        queryParams.push(targetPropertyId);
      }
      querySql += " FOR UPDATE";
      const [rows] = await connection.query(querySql, queryParams);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Kamar tidak ditemukan." });
      }
      const existing = rows[0];
      if (authUser?.role !== "admin" && existing.ownerId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: "Akses ditolak. Anda bukan pemilik properti ini." });
      }
      if (existing.status === "occupied") {
        const [activeRentals] = await connection.query(
          "SELECT COUNT(*) as activeCount FROM rentals WHERE roomId = ? AND status IN ('active', 'pending') FOR UPDATE",
          [targetRoomId]
        );
        if (Number(activeRentals[0]?.activeCount || 0) > 0) {
          await connection.rollback();
          return res.status(409).json({
            message: "Kamar sedang memiliki sewa aktif berjalan dan tidak dapat diubah statusnya."
          });
        }
      }
      await connection.query("UPDATE rooms SET status = ? WHERE id = ?", [status, targetRoomId]);
      const counts = await syncPropertyRoomCounts(connection, existing.propertyId);
      await connection.commit();
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("rooms");
      return res.json({
        message: "Status kamar berhasil diperbarui",
        room: formatRoomResponse(
          {
            id: targetRoomId,
            propertyId: existing.propertyId,
            roomNumber: existing.roomNumber,
            floor: existing.floor,
            type: existing.type,
            price: existing.price,
            status
          },
          existing.propertyPrice,
          []
        ),
        counts
      });
    } catch (err) {
      await connection.rollback();
      console.error("PATCH room status error:", err);
      return res.status(500).json({ message: "Gagal memperbarui status kamar." });
    } finally {
      connection.release();
    }
  };
  router2.patch(
    "/properties/:id/rooms/:roomId/status",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    validateBody(updateRoomStatusSchema),
    handleToggleRoomStatus
  );
  router2.patch(
    "/rooms/:roomId/status",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    validateBody(updateRoomStatusSchema),
    handleToggleRoomStatus
  );
  const handleDeleteRoom = async (req, res) => {
    const targetRoomId = String(req.params.roomId || req.params.id);
    const targetPropertyId = req.params.id ? String(req.params.id) : null;
    const { password } = req.body;
    const authUser = req.user;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      let querySql = `
        SELECT r.id, r.propertyId, r.roomNumber, r.status, p.ownerId
        FROM rooms r
        JOIN properties p ON r.propertyId = p.id
        WHERE r.id = ?
      `;
      const queryParams = [targetRoomId];
      if (targetPropertyId) {
        querySql += " AND r.propertyId = ?";
        queryParams.push(targetPropertyId);
      }
      querySql += " FOR UPDATE";
      const [rows] = await connection.query(querySql, queryParams);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Kamar tidak ditemukan." });
      }
      const room = rows[0];
      if (authUser?.role !== "admin" && room.ownerId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: "Akses ditolak. Anda bukan pemilik properti ini." });
      }
      const [userRows] = await connection.query("SELECT password FROM users WHERE id = ?", [authUser?.id]);
      const caller = userRows[0];
      const isMatch = caller && caller.password ? await bcrypt7.compare(password, caller.password) : false;
      if (!caller || !caller.password || !isMatch) {
        await connection.rollback();
        return res.status(401).json({ message: "Password salah." });
      }
      if (room.status === "occupied") {
        await connection.rollback();
        return res.status(400).json({
          message: "Kamar tidak dapat dihapus karena saat ini sedang terisi (occupied)."
        });
      }
      const [activeRentals] = await connection.query(
        "SELECT COUNT(*) as activeCount FROM rentals WHERE roomId = ? AND status IN ('active', 'pending') FOR UPDATE",
        [targetRoomId]
      );
      if (Number(activeRentals[0]?.activeCount || 0) > 0) {
        await connection.rollback();
        return res.status(400).json({
          message: "Kamar tidak dapat dihapus karena masih memiliki sewa aktif berjalan."
        });
      }
      await connection.query("DELETE FROM rooms WHERE id = ?", [targetRoomId]);
      const counts = await syncPropertyRoomCounts(connection, room.propertyId);
      await connection.commit();
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("rooms");
      return res.json({
        message: "Kamar berhasil dihapus!",
        counts
      });
    } catch (err) {
      await connection.rollback();
      console.error("DELETE room error:", err);
      return res.status(500).json({ message: "Gagal menghapus kamar." });
    } finally {
      connection.release();
    }
  };
  router2.delete(
    "/properties/:id/rooms/:roomId",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    validateBody(deleteRoomSchema),
    handleDeleteRoom
  );
  router2.delete(
    "/rooms/:roomId",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    validateBody(deleteRoomSchema),
    handleDeleteRoom
  );
}

// backend/routes/photos.routes.ts
function generateCloudinaryVariantUrls(url) {
  if (url.includes("/upload/")) {
    const thumbnail = url.replace(
      /\/upload\/(?:v\d+\/)?/,
      (match) => match.includes("v") ? match.replace("/upload/", "/upload/c_fill,w_400,h_300,f_webp,q_80/") : "/upload/c_fill,w_400,h_300,f_webp,q_80/"
    );
    const hero = url.replace(
      /\/upload\/(?:v\d+\/)?/,
      (match) => match.includes("v") ? match.replace("/upload/", "/upload/c_fill,w_1200,h_800,f_webp,q_80/") : "/upload/c_fill,w_1200,h_800,f_webp,q_80/"
    );
    return { thumbnail, hero };
  }
  return {
    thumbnail: `${url}?w=400&h=300&fmt=webp&q=80`,
    hero: `${url}?w=1200&h=800&fmt=webp&q=80`
  };
}
async function processImageVariants(buffer) {
  try {
    const importDynamic = new Function("modulePath", "return import(modulePath)");
    const sharpModule = await importDynamic("sharp");
    const sharp = sharpModule.default || sharpModule;
    const [thumbnail, hero] = await Promise.all([
      sharp(buffer).rotate().resize(400, 300, { fit: "cover", position: "center" }).webp({ quality: 80 }).toBuffer(),
      sharp(buffer).rotate().resize(1200, 800, { fit: "cover", position: "center" }).webp({ quality: 80 }).toBuffer()
    ]);
    return { thumbnail, hero };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!errMsg.includes("Cannot find") && !errMsg.includes("ERR_MODULE_NOT_FOUND")) {
      const error = new Error(`Berkas gambar rusak atau tidak dapat diproses: ${errMsg}`);
      error.statusCode = 400;
      throw error;
    }
    return {};
  }
}
function formatPhotoResponse(row) {
  const url = String(row.url);
  return {
    id: String(row.id),
    propertyId: String(row.propertyId),
    roomId: row.roomId ? String(row.roomId) : null,
    url,
    publicId: row.publicId ? String(row.publicId) : null,
    category: row.category,
    caption: row.caption ? String(row.caption) : "",
    orderIndex: Number(row.orderIndex),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    variants: generateCloudinaryVariantUrls(url)
  };
}
function registerPhotoRoutes(router2) {
  router2.get("/properties/:id/photos", async (req, res) => {
    const { id } = req.params;
    const categoryQuery = typeof req.query.category === "string" ? req.query.category.trim() : void 0;
    const roomIdQuery = typeof req.query.roomId === "string" ? req.query.roomId.trim() : void 0;
    if (categoryQuery && !VALID_PHOTO_CATEGORIES.includes(categoryQuery)) {
      return res.status(400).json({
        message: `Kategori foto '${categoryQuery}' tidak valid. Pilihan: ${VALID_PHOTO_CATEGORIES.join(", ")}`
      });
    }
    let limit = void 0;
    let offset = 0;
    if (req.query.limit !== void 0) {
      const parsedLimit = parseInt(String(req.query.limit), 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({ message: "Parameter limit harus berupa bilangan bulat positif (1-100)." });
      }
      limit = Math.min(parsedLimit, 100);
    }
    if (req.query.offset !== void 0) {
      const parsedOffset = parseInt(String(req.query.offset), 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return res.status(400).json({ message: "Parameter offset harus berupa bilangan bulat non-negatif (>= 0)." });
      }
      offset = parsedOffset;
    }
    const cacheKey = `properties:${id}:photos:${categoryQuery || "all"}:${roomIdQuery || "all"}:${limit ?? "all"}:${offset}`;
    const cached = apiCache.get(cacheKey);
    if (cached) {
      const photos = Array.isArray(cached) ? cached : cached.photos;
      const total = Array.isArray(cached) ? cached.length : cached.total;
      const latestTimestamp = Array.isArray(cached) ? photos.reduce((max, p) => Math.max(max, new Date(p.updatedAt || p.createdAt || 0).getTime()), 0) : cached.latestTimestamp;
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      res.setHeader("X-Total-Count", String(total));
      res.setHeader("X-Page-Limit", String(limit !== void 0 ? limit : total));
      res.setHeader("X-Page-Offset", String(offset));
      if (latestTimestamp > 0) {
        const lastModifiedStr = new Date(latestTimestamp).toUTCString();
        res.setHeader("Last-Modified", lastModifiedStr);
        const ifModifiedSince = req.headers["if-modified-since"];
        if (ifModifiedSince && new Date(ifModifiedSince).getTime() >= Math.floor(latestTimestamp / 1e3) * 1e3) {
          return res.status(304).end();
        }
      }
      return res.json(photos);
    }
    try {
      const [propRows] = await pool.query(
        "SELECT id FROM properties WHERE id = ?",
        [id]
      );
      if (propRows.length === 0) {
        return res.status(404).json({ message: "Properti tidak ditemukan." });
      }
      let baseWhere = "WHERE propertyId = ?";
      const baseParams = [id];
      if (categoryQuery) {
        baseWhere += " AND category = ?";
        baseParams.push(categoryQuery);
      }
      if (roomIdQuery !== void 0) {
        if (roomIdQuery.toLowerCase() === "null" || roomIdQuery.toLowerCase() === "property") {
          baseWhere += " AND roomId IS NULL";
        } else {
          baseWhere += " AND roomId = ?";
          baseParams.push(roomIdQuery);
        }
      }
      let dataSql = `
        SELECT id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt, updatedAt
        FROM property_photos
        ${baseWhere}
        ORDER BY orderIndex ASC, createdAt ASC
      `;
      const dataParams = [...baseParams];
      if (limit !== void 0) {
        dataSql += " LIMIT ? OFFSET ?";
        dataParams.push(limit, offset);
      }
      let photos;
      let total;
      let latestTimestamp = 0;
      if (limit !== void 0) {
        const countSql = `
          SELECT COUNT(*) as total, MAX(COALESCE(updatedAt, createdAt)) as maxModified
          FROM property_photos
          ${baseWhere}
        `;
        const [[countRows], [rows]] = await Promise.all([
          pool.query(countSql, baseParams),
          pool.query(dataSql, dataParams)
        ]);
        total = Number(countRows[0]?.total ?? rows.length);
        photos = rows.map(formatPhotoResponse);
        if (countRows[0]?.maxModified) {
          latestTimestamp = new Date(countRows[0].maxModified).getTime();
        }
      } else {
        const [rows] = await pool.query(dataSql, dataParams);
        total = rows.length;
        photos = rows.map(formatPhotoResponse);
        latestTimestamp = photos.reduce((max, p) => {
          const t = new Date(p.updatedAt || p.createdAt || 0).getTime();
          return t > max ? t : max;
        }, 0);
      }
      apiCache.set(cacheKey, { photos, total, latestTimestamp }, 30);
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      res.setHeader("X-Total-Count", String(total));
      res.setHeader("X-Page-Limit", String(limit !== void 0 ? limit : total));
      res.setHeader("X-Page-Offset", String(offset));
      if (latestTimestamp > 0) {
        const lastModifiedStr = new Date(latestTimestamp).toUTCString();
        res.setHeader("Last-Modified", lastModifiedStr);
        const ifModifiedSince = req.headers["if-modified-since"];
        if (ifModifiedSince && new Date(ifModifiedSince).getTime() >= Math.floor(latestTimestamp / 1e3) * 1e3) {
          return res.status(304).end();
        }
      }
      return res.json(photos);
    } catch (err) {
      console.error("GET /api/properties/:id/photos error:", err);
      return res.status(500).json({ message: "Gagal mengambil galeri foto properti." });
    }
  });
  router2.post(
    "/properties/:id/photos",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    uploadLimiter,
    handleMultiPhotoUpload,
    async (req, res) => {
      const propertyId = String(req.params.id);
      const authUser = req.user;
      const files = extractUploadedFiles(req);
      if (files.length === 0) {
        return res.status(400).json({ message: 'Minimal 1 file foto wajib diunggah dalam field "images".' });
      }
      if (files.length > 10) {
        return res.status(400).json({ message: "Maksimal 10 file foto dapat diunggah sekaligus." });
      }
      for (const file of files) {
        if (!validateImageMimeType(file.mimetype) || !validateImageMagicBytes(file.buffer)) {
          return res.status(400).json({
            message: `Format file '${file.originalname}' tidak didukung atau header berkas tidak valid. Harap unggah gambar (JPEG, PNG, WebP, GIF).`
          });
        }
      }
      const rawCategory = typeof req.body.category === "string" ? req.body.category.trim() : void 0;
      if (rawCategory !== void 0 && (!rawCategory || !VALID_PHOTO_CATEGORIES.includes(rawCategory))) {
        return res.status(400).json({
          message: `Kategori '${req.body.category}' tidak valid. Pilihan: ${VALID_PHOTO_CATEGORIES.join(", ")}`
        });
      }
      const targetCategory = rawCategory || "other";
      const rawRoomId = typeof req.body.roomId === "string" && req.body.roomId.trim() ? req.body.roomId.trim() : null;
      const caption = typeof req.body.caption === "string" ? req.body.caption.trim().slice(0, 255) : "";
      const [propRows] = await pool.query(
        "SELECT id, ownerId, image FROM properties WHERE id = ?",
        [propertyId]
      );
      if (propRows.length === 0) {
        return res.status(404).json({ message: "Properti tidak ditemukan." });
      }
      const property = propRows[0];
      if (authUser?.role !== "admin" && property.ownerId !== authUser?.id) {
        return res.status(403).json({ message: "Akses ditolak. Anda bukan pemilik properti ini." });
      }
      if (rawRoomId) {
        const [roomRows] = await pool.query(
          "SELECT id FROM rooms WHERE id = ? AND propertyId = ?",
          [rawRoomId, propertyId]
        );
        if (roomRows.length === 0) {
          return res.status(400).json({ message: "Kamar tidak ditemukan pada properti ini." });
        }
      }
      let uploadResults;
      try {
        uploadResults = await Promise.all(
          files.map(async (file) => {
            let variants;
            try {
              variants = await processImageVariants(file.buffer);
            } catch (err) {
              const error = new Error("Berkas gambar rusak atau tidak dapat diproses.");
              error.statusCode = 400;
              throw error;
            }
            const targetBuffer = variants.hero || file.buffer;
            return uploadImageStream(targetBuffer, "kosmo_properties");
          })
        );
      } catch (cloudErr) {
        const errObj = cloudErr;
        if (errObj?.statusCode === 400 || errObj?.message?.includes("rusak")) {
          return res.status(400).json({ message: errObj.message || "Berkas gambar rusak atau tidak dapat diproses." });
        }
        console.error("Cloudinary multi-photo upload error:", cloudErr);
        return res.status(500).json({ message: "Gagal mengunggah foto ke Cloudinary." });
      }
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [maxRows] = await connection.query(
          "SELECT COALESCE(MAX(orderIndex), -1) AS maxOrder FROM property_photos WHERE propertyId = ? FOR UPDATE",
          [propertyId]
        );
        let nextOrder = Number(maxRows[0]?.maxOrder ?? -1) + 1;
        const cleanRoomId = rawRoomId || null;
        const createdPhotos = [];
        const valuePlaceholders = [];
        const flatParams = [];
        const now = /* @__PURE__ */ new Date();
        for (let i = 0; i < uploadResults.length; i++) {
          const uploadRes = uploadResults[i];
          const photoId = generateId("photo");
          const currentOrder = nextOrder + i;
          valuePlaceholders.push("(?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
          flatParams.push(
            photoId,
            propertyId,
            cleanRoomId,
            uploadRes.secure_url,
            uploadRes.public_id,
            targetCategory,
            caption,
            currentOrder
          );
          createdPhotos.push(
            formatPhotoResponse({
              id: photoId,
              propertyId,
              roomId: cleanRoomId,
              url: uploadRes.secure_url,
              publicId: uploadRes.public_id,
              category: targetCategory,
              caption,
              orderIndex: currentOrder,
              createdAt: now,
              updatedAt: now
            })
          );
        }
        if (valuePlaceholders.length > 0) {
          await connection.query(
            `INSERT INTO property_photos (
              id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt, updatedAt
            ) VALUES ${valuePlaceholders.join(", ")}`,
            flatParams
          );
        }
        if ((!property.image || property.image.trim() === "" || targetCategory === "thumbnail") && createdPhotos.length > 0) {
          await connection.query(
            "UPDATE properties SET image = ? WHERE id = ?",
            [createdPhotos[0].url, propertyId]
          );
        }
        await connection.commit();
        apiCache.invalidatePattern("properties");
        apiCache.invalidatePattern("rooms");
        return res.status(201).json({
          message: `${createdPhotos.length} foto berhasil diunggah`,
          photos: createdPhotos
        });
      } catch (dbErr) {
        await connection.rollback();
        console.error("Database insertion error for property photos:", dbErr);
        return res.status(500).json({ message: "Gagal menyimpan data foto properti." });
      } finally {
        connection.release();
      }
    }
  );
  router2.put(
    "/properties/:id/photos/reorder",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    validateBody(reorderPhotosSchema),
    async (req, res) => {
      const propertyId = String(req.params.id);
      const authUser = req.user;
      const { photoIds } = req.body;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [propRows] = await connection.query(
          "SELECT id, ownerId FROM properties WHERE id = ? FOR UPDATE",
          [propertyId]
        );
        if (propRows.length === 0) {
          await connection.rollback();
          return res.status(404).json({ message: "Properti tidak ditemukan." });
        }
        const property = propRows[0];
        if (authUser?.role !== "admin" && property.ownerId !== authUser?.id) {
          await connection.rollback();
          return res.status(403).json({ message: "Akses ditolak. Anda bukan pemilik properti ini." });
        }
        const [existingPhotos] = await connection.query(
          "SELECT id, orderIndex FROM property_photos WHERE propertyId = ? FOR UPDATE",
          [propertyId]
        );
        const existingMap = new Set(existingPhotos.map((p) => p.id));
        const invalidIds = photoIds.filter((id) => !existingMap.has(id));
        if (invalidIds.length > 0) {
          await connection.rollback();
          return res.status(400).json({
            message: `Satu atau lebih foto tidak ditemukan pada properti ini: ${invalidIds.join(", ")}`
          });
        }
        const reorderedSet = new Set(photoIds);
        const remaining = existingPhotos.filter((p) => !reorderedSet.has(p.id)).sort((a, b) => Number(a.orderIndex) - Number(b.orderIndex));
        const updates = [];
        for (let i = 0; i < photoIds.length; i++) {
          updates.push({ id: photoIds[i], orderIndex: i });
        }
        for (let j = 0; j < remaining.length; j++) {
          updates.push({ id: remaining[j].id, orderIndex: photoIds.length + j });
        }
        if (updates.length > 0) {
          const caseClauses = updates.map(() => "WHEN ? THEN ?").join(" ");
          const caseParams = [];
          updates.forEach((u) => caseParams.push(u.id, u.orderIndex));
          const ids = updates.map((u) => u.id);
          const placeholders = ids.map(() => "?").join(", ");
          await connection.query(
            `UPDATE property_photos 
             SET orderIndex = CASE id ${caseClauses} END 
             WHERE id IN (${placeholders}) AND propertyId = ?`,
            [...caseParams, ...ids, propertyId]
          );
        }
        const [updatedRows] = await connection.query(
          `SELECT id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt, updatedAt
           FROM property_photos
           WHERE propertyId = ?
           ORDER BY orderIndex ASC, createdAt ASC`,
          [propertyId]
        );
        await connection.commit();
        apiCache.invalidatePattern("properties");
        apiCache.invalidatePattern("rooms");
        return res.json({
          message: "Urutan foto berhasil diperbarui",
          photos: updatedRows.map(formatPhotoResponse)
        });
      } catch (err) {
        await connection.rollback();
        console.error("PUT /api/properties/:id/photos/reorder error:", err);
        return res.status(500).json({ message: "Gagal memperbarui urutan foto." });
      } finally {
        connection.release();
      }
    }
  );
  const handleDeletePhoto = async (req, res) => {
    const targetPhotoId = String(req.params.photoId || req.params.id);
    const targetPropertyId = req.params.id ? String(req.params.id) : null;
    const authUser = req.user;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      let querySql = `
        SELECT ph.id, ph.propertyId, ph.publicId, ph.url, ph.orderIndex, p.ownerId, p.image AS propertyImage
        FROM property_photos ph
        JOIN properties p ON ph.propertyId = p.id
        WHERE ph.id = ?
      `;
      const queryParams = [targetPhotoId];
      if (targetPropertyId) {
        querySql += " AND ph.propertyId = ?";
        queryParams.push(targetPropertyId);
      }
      querySql += " FOR UPDATE";
      const [rows] = await connection.query(querySql, queryParams);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Foto tidak ditemukan." });
      }
      const photo = rows[0];
      if (authUser?.role !== "admin" && photo.ownerId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: "Akses ditolak. Anda bukan pemilik properti ini." });
      }
      await connection.query("DELETE FROM property_photos WHERE id = ?", [targetPhotoId]);
      if (photo.propertyImage === photo.url) {
        const [nextPhotos] = await connection.query(
          "SELECT url FROM property_photos WHERE propertyId = ? ORDER BY orderIndex ASC LIMIT 1",
          [photo.propertyId]
        );
        if (nextPhotos.length > 0) {
          await connection.query("UPDATE properties SET image = ? WHERE id = ?", [nextPhotos[0].url, photo.propertyId]);
        }
      }
      await connection.commit();
      apiCache.invalidatePattern("properties");
      apiCache.invalidatePattern("rooms");
      if (photo.publicId) {
        deleteCloudinaryImage(photo.publicId).catch((delErr) => {
          console.warn(`[Cloudinary] Non-fatal deletion error for ${photo.publicId}:`, delErr);
        });
      }
      return res.json({ message: "Foto berhasil dihapus" });
    } catch (err) {
      await connection.rollback();
      console.error("DELETE photo error:", err);
      return res.status(500).json({ message: "Gagal menghapus foto." });
    } finally {
      connection.release();
    }
  };
  router2.delete(
    "/properties/:id/photos/:photoId",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    handleDeletePhoto
  );
  router2.delete(
    "/photos/:photoId",
    authenticateToken,
    requireRole(["admin", "landlord"]),
    handleDeletePhoto
  );
}

// backend/routes/rentals.routes.ts
var computePaymentSchedule = rentalService.computePaymentSchedule.bind(rentalService);
function registerRentalRoutes(router2) {
  router2.get("/rentals", authenticateToken, async (req, res) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }
    const { tenantId } = req.query;
    const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : void 0;
    const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const offsetParam = req.query.offset ? parseInt(String(req.query.offset), 10) : limitParam ? (pageParam - 1) * limitParam : 0;
    res.setHeader("Cache-Control", "private, max-age=15");
    const cacheKey = `rentals:${authUser.id}:${tenantId ? String(tenantId) : "all"}:${limitParam || "all"}:${offsetParam}`;
    const cached = apiCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    try {
      const rentals = await rentalService.getRentals(
        authUser,
        tenantId ? String(tenantId) : void 0,
        limitParam,
        offsetParam
      );
      apiCache.set(cacheKey, rentals, 15);
      res.json(rentals);
    } catch (err) {
      if (err instanceof RentalServiceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.details });
      }
      console.error("Get rentals error:", err);
      res.status(500).json({ message: "Gagal mengambil data sewa." });
    }
  });
  router2.get("/tenant/rentals", authenticateToken, async (req, res) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }
    const tenantId = authUser.role === "admin" && req.query.tenantId ? String(req.query.tenantId) : authUser.id;
    if (!tenantId) {
      return res.status(400).json({ message: "tenantId diperlukan." });
    }
    try {
      const rentals = await rentalService.getTenantRentals(tenantId);
      res.json(rentals);
    } catch (err) {
      if (err instanceof RentalServiceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.details });
      }
      console.error("Get tenant rentals error:", err);
      res.status(500).json({ message: "Gagal mengambil data sewa tenant." });
    }
  });
  router2.get("/rentals/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }
    try {
      const rental = await rentalService.getRentalById(String(id), authUser);
      res.json(rental);
    } catch (err) {
      if (err instanceof RentalServiceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.details });
      }
      console.error("Get rental detail error:", err);
      res.status(500).json({ message: "Gagal mengambil detail sewa." });
    }
  });
  router2.post("/rentals", authenticateToken, validateBody(createRentalSchema), async (req, res) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }
    const { tenantId, propertyId, propertyName, price, durationMonths, signature, roomId } = req.body;
    try {
      const result = await rentalService.createBooking({
        authUser,
        tenantId,
        propertyId,
        propertyName,
        price,
        durationMonths,
        signature,
        roomId,
        rentalId: req.body.rentalId,
        startDate: req.body.startDate
      });
      apiCache.invalidatePattern("rentals");
      const statusCode = result.message.includes("sudah aktif") ? 200 : 201;
      res.status(statusCode).json(result);
    } catch (err) {
      if (err instanceof RentalServiceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.details });
      }
      console.error("Create rental error:", err);
      res.status(500).json({ message: "Gagal membuat penyewaan kos." });
    }
  });
  router2.post("/rentals/:id/terminate", authenticateToken, validateBody(terminateRentalSchema), async (req, res) => {
    const { id } = req.params;
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }
    const { password } = req.body;
    try {
      const result = await rentalService.terminateRental(String(id), authUser, password);
      apiCache.invalidatePattern("rentals");
      res.json(result);
    } catch (err) {
      if (err instanceof RentalServiceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.details });
      }
      console.error("Terminate rental error:", err);
      res.status(500).json({ message: "Gagal memberhentikan sewa kos." });
    }
  });
  router2.post("/rentals/:id/cancel", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }
    try {
      const result = await rentalService.cancelPendingRental(String(id), authUser);
      apiCache.invalidatePattern("rentals");
      return res.status(200).json(result);
    } catch (err) {
      if (err instanceof RentalServiceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.details });
      }
      console.error("Cancel pending rental error:", err);
      return res.status(500).json({ message: "Gagal membatalkan pesanan sewa." });
    }
  });
  router2.post(
    "/rentals/:id/renew-token",
    authenticateToken,
    validateBody(renewRentalTokenSchema),
    async (req, res) => {
      const { id } = req.params;
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: "Otentikasi diperlukan." });
      }
      const months = req.body?.months ? Number(req.body.months) : 1;
      try {
        const result = await rentalService.createRenewalToken(String(id), authUser, months);
        return res.status(200).json(result);
      } catch (err) {
        if (err instanceof RentalServiceError) {
          return res.status(err.statusCode).json({ message: err.message, ...err.details });
        }
        console.error("Renew rental token error:", err);
        return res.status(500).json({ message: "Gagal membuat token perpanjangan sewa." });
      }
    }
  );
}

// backend/routes/tickets.routes.ts
function registerTicketRoutes(router2) {
  router2.post(
    "/tickets",
    authenticateToken,
    validateBody(createTicketSchema),
    async (req, res) => {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: "Otentikasi diperlukan." });
      }
      if (authUser.role !== "tenant" && authUser.role !== "admin") {
        return res.status(403).json({
          message: "Hanya penyewa yang dapat mengajukan tiket pemeliharaan."
        });
      }
      const { rentalId, roomId: explicitRoomId, category, title, description, photoUrl } = req.body;
      try {
        const [rentalRows] = await pool.query(
          `SELECT r.id, r.tenantId, r.propertyId, r.roomId, r.status, p.ownerId
           FROM rentals r
           INNER JOIN properties p ON r.propertyId = p.id
           WHERE r.id = ?`,
          [rentalId]
        );
        if (rentalRows.length === 0) {
          return res.status(404).json({ message: "Data sewa tidak ditemukan." });
        }
        const rental = rentalRows[0];
        if (authUser.role === "tenant" && rental.tenantId !== authUser.id) {
          return res.status(403).json({
            message: "Akses ditolak. Anda hanya dapat mengajukan tiket untuk sewa milik Anda sendiri."
          });
        }
        if (rental.status !== "active") {
          return res.status(400).json({
            message: "Tiket hanya dapat diajukan untuk sewa yang berstatus aktif."
          });
        }
        const ticketId = generateId("ticket");
        const tenantId = authUser.role === "admin" ? rental.tenantId : authUser.id;
        const propertyId = rental.propertyId;
        const roomId = typeof explicitRoomId === "string" && explicitRoomId.trim().length > 0 ? explicitRoomId.trim() : rental.roomId || null;
        const cleanPhotoUrl = photoUrl && typeof photoUrl === "string" && photoUrl.trim().length > 0 ? photoUrl.trim() : null;
        await pool.execute(
          `INSERT INTO maintenance_tickets 
            (id, rentalId, tenantId, propertyId, roomId, category, title, description, photoUrl, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
          [ticketId, rental.id, tenantId, propertyId, roomId, category, title.trim(), description.trim(), cleanPhotoUrl]
        );
        apiCache.invalidatePattern("admin:");
        const [createdRows] = await pool.query(
          `SELECT 
            t.id, t.rentalId, t.tenantId, t.propertyId, t.roomId,
            t.category, t.title, t.description, t.photoUrl, t.status,
            t.createdAt, t.updatedAt, t.resolvedAt,
            p.name AS propertyName,
            u.name AS tenantName,
            rm.roomNumber
           FROM maintenance_tickets t
           LEFT JOIN properties p ON t.propertyId = p.id
           LEFT JOIN users u ON t.tenantId = u.id
           LEFT JOIN rooms rm ON t.roomId = rm.id
           WHERE t.id = ?`,
          [ticketId]
        );
        return res.status(201).json(createdRows[0]);
      } catch (err) {
        console.error("Submit maintenance ticket error:", err);
        return res.status(500).json({ message: "Gagal mengajukan tiket pemeliharaan." });
      }
    }
  );
  router2.get("/tickets", authenticateToken, async (req, res) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: "Otentikasi diperlukan." });
    }
    const { status, propertyId } = req.query;
    try {
      let query = `
        SELECT 
          t.id, t.rentalId, t.tenantId, t.propertyId, t.roomId,
          t.category, t.title, t.description, t.photoUrl, t.status,
          t.createdAt, t.updatedAt, t.resolvedAt,
          p.name AS propertyName,
          u.name AS tenantName,
          rm.roomNumber
        FROM maintenance_tickets t
        LEFT JOIN properties p ON t.propertyId = p.id
        LEFT JOIN users u ON t.tenantId = u.id
        LEFT JOIN rooms rm ON t.roomId = rm.id
      `;
      const conditions = [];
      const params = [];
      if (authUser.role === "tenant") {
        conditions.push("t.tenantId = ?");
        params.push(authUser.id);
      } else if (authUser.role === "landlord") {
        conditions.push("p.ownerId = ?");
        params.push(authUser.id);
      } else if (authUser.role === "admin") {
      } else {
        return res.status(403).json({ message: "Peran pengguna tidak memiliki akses ke tiket." });
      }
      if (status && typeof status === "string") {
        conditions.push("t.status = ?");
        params.push(status);
      }
      if (propertyId && typeof propertyId === "string") {
        conditions.push("t.propertyId = ?");
        params.push(propertyId);
      }
      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      query += " ORDER BY t.createdAt DESC";
      const [rows] = await pool.query(query, params);
      return res.json(rows);
    } catch (err) {
      console.error("Get maintenance tickets error:", err);
      return res.status(500).json({ message: "Gagal memuat daftar tiket pemeliharaan." });
    }
  });
  router2.patch(
    "/tickets/:id/status",
    authenticateToken,
    validateBody(updateTicketStatusSchema),
    async (req, res) => {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: "Otentikasi diperlukan." });
      }
      if (authUser.role !== "landlord" && authUser.role !== "admin") {
        return res.status(403).json({
          message: "Hanya pemilik properti atau admin yang dapat memperbarui status tiket."
        });
      }
      const ticketId = req.params.id;
      const { status } = req.body;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [ticketRows] = await connection.query(
          `SELECT t.id, t.rentalId, t.tenantId, t.propertyId, t.roomId, t.status, t.resolvedAt, p.ownerId
           FROM maintenance_tickets t
           LEFT JOIN properties p ON t.propertyId = p.id
           WHERE t.id = ? FOR UPDATE`,
          [ticketId]
        );
        if (ticketRows.length === 0) {
          await connection.rollback();
          return res.status(404).json({ message: "Tiket pemeliharaan tidak ditemukan." });
        }
        const ticket = ticketRows[0];
        if (authUser.role === "landlord" && ticket.ownerId !== authUser.id) {
          await connection.rollback();
          return res.status(403).json({
            message: "Akses ditolak. Tiket ini bukan milik properti yang Anda kelola."
          });
        }
        const resolvedAt = status === "resolved" ? ticket.status === "resolved" && ticket.resolvedAt ? new Date(ticket.resolvedAt) : /* @__PURE__ */ new Date() : null;
        await connection.execute(
          `UPDATE maintenance_tickets 
           SET status = ?, resolvedAt = ?, updatedAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [status, resolvedAt, ticketId]
        );
        await connection.commit();
        apiCache.invalidatePattern("admin:");
        const [updatedRows] = await pool.query(
          `SELECT 
            t.id, t.rentalId, t.tenantId, t.propertyId, t.roomId,
            t.category, t.title, t.description, t.photoUrl, t.status,
            t.createdAt, t.updatedAt, t.resolvedAt,
            p.name AS propertyName,
            u.name AS tenantName,
            rm.roomNumber
           FROM maintenance_tickets t
           LEFT JOIN properties p ON t.propertyId = p.id
           LEFT JOIN users u ON t.tenantId = u.id
           LEFT JOIN rooms rm ON t.roomId = rm.id
           WHERE t.id = ?`,
          [ticketId]
        );
        return res.json(updatedRows[0]);
      } catch (err) {
        await connection.rollback();
        console.error("Update maintenance ticket status error:", err);
        return res.status(500).json({ message: "Gagal memperbarui status tiket pemeliharaan." });
      } finally {
        connection.release();
      }
    }
  );
}

// backend/router.ts
var router = express.Router();
registerSystemRoutes(router);
registerAuthRoutes(router);
registerUserRoutes(router);
registerPropertyRoutes(router);
registerReviewRoutes(router);
registerLandlordRoutes(router);
registerTrackingRoutes(router);
registerRoomRoutes(router);
registerPhotoRoutes(router);
registerContractRoutes(router);
registerRentalRoutes(router);
registerPaymentRoutes(router);
registerTicketRoutes(router);
var router_default = router;

// backend/middleware/requestId.ts
import crypto6 from "crypto";
var REQUEST_ID_REGEX = /^[a-zA-Z0-9_.-]{1,128}$/;
function requestIdMiddleware(req, res, next) {
  const rawHeader = req.headers["x-request-id"];
  const incomingId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const requestId = typeof incomingId === "string" && REQUEST_ID_REGEX.test(incomingId.trim()) ? incomingId.trim() : `req_${crypto6.randomUUID()}`;
  req.id = requestId;
  req.requestId = requestId;
  try {
    if (!res.headersSent) {
      res.setHeader("X-Request-Id", requestId);
    }
  } catch {
  }
  next();
}

// backend/middleware/errorHandler.ts
import { ZodError } from "zod";
function normalizeError(err) {
  if (isAppError(err)) {
    return err;
  }
  if (err instanceof ZodError) {
    const errorMessages = err.issues.map((issue) => issue.message).join(", ");
    return new AppError(
      errorMessages || "Validasi data gagal.",
      400,
      ErrorCode.VALIDATION_ERROR,
      true,
      err.flatten()
    );
  }
  const errorObj = err;
  if (errorObj instanceof SyntaxError && "body" in errorObj && errorObj.status === 400) {
    return new AppError(
      "Format payload JSON tidak valid.",
      400,
      ErrorCode.MALFORMED_JSON,
      true
    );
  }
  if (errorObj.name === "MulterError") {
    if (errorObj.code === "LIMIT_FILE_SIZE") {
      return new AppError("Ukuran file melebihi batas maksimum 5MB.", 400, ErrorCode.FILE_TOO_LARGE, true);
    }
    if (errorObj.code === "LIMIT_FILE_COUNT") {
      return new AppError("Jumlah file melebihi batas maksimum 10.", 400, ErrorCode.FILE_LIMIT_EXCEEDED, true);
    }
    if (errorObj.code === "LIMIT_UNEXPECTED_FILE") {
      return new AppError("Field unggahan file tidak valid.", 400, ErrorCode.FILE_UNSUPPORTED_TYPE, true);
    }
    return new AppError(`Kesalahan unggahan file: ${errorObj.message}`, 400, ErrorCode.FILE_UPLOAD_FAILED, true);
  }
  if (errorObj.name === "TokenExpiredError") {
    return new AppError("Token telah kadaluarsa. Silakan masuk kembali.", 401, ErrorCode.AUTH_TOKEN_EXPIRED, true);
  }
  if (errorObj.name === "JsonWebTokenError") {
    return new AppError("Token tidak valid.", 401, ErrorCode.AUTH_TOKEN_INVALID, true);
  }
  if (typeof errorObj.code === "string") {
    if (errorObj.code === "ER_DUP_ENTRY" || errorObj.errno === 1062) {
      return new AppError(
        "Data sudah ada di sistem (duplikasi entri).",
        409,
        ErrorCode.DUPLICATE_ENTRY,
        true
      );
    }
    if (errorObj.code === "ER_NO_REFERENCED_ROW" || errorObj.code === "ER_NO_REFERENCED_ROW_2" || errorObj.errno === 1452) {
      return new AppError(
        "Data referensi tidak ditemukan (Foreign Key Violation).",
        400,
        ErrorCode.FOREIGN_KEY_VIOLATION,
        true
      );
    }
    if (errorObj.code === "ER_ROW_IS_REFERENCED" || errorObj.code === "ER_ROW_IS_REFERENCED_2" || errorObj.errno === 1451) {
      return new AppError(
        "Data tidak dapat dihapus karena masih terkait dengan entitas lain.",
        409,
        ErrorCode.CONFLICT,
        true
      );
    }
    if (errorObj.code === "ECONNREFUSED" || errorObj.code === "ETIMEDOUT" || errorObj.code === "PROTOCOL_CONNECTION_LOST" || errorObj.code === "ER_ACCESS_DENIED_ERROR") {
      return new AppError(
        "Koneksi ke basis data terputus. Silakan coba kembali beberapa saat lagi.",
        503,
        ErrorCode.DATABASE_UNAVAILABLE,
        true
      );
    }
  }
  const message = errorObj?.message && typeof errorObj.message === "string" ? errorObj.message : "Internal Server Error";
  const statusCode = typeof errorObj?.statusCode === "number" ? errorObj.statusCode : typeof errorObj?.status === "number" ? errorObj.status : 500;
  return new AppError(message, statusCode, ErrorCode.INTERNAL_SERVER_ERROR, false);
}
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const normalized = normalizeError(err);
  let requestId = req.id || req.requestId;
  if (!requestId) {
    try {
      const headerVal = res.getHeader("X-Request-Id");
      if (typeof headerVal === "string") {
        requestId = headerVal;
      }
    } catch {
    }
  }
  const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const isOperational = isOperationalError(normalized);
  const statusCode = normalized.statusCode || 500;
  const status = statusCode >= 500 ? "error" : "fail";
  let clientMessage = normalized.message;
  if (!isOperational && statusCode >= 500 && isProduction) {
    clientMessage = "Internal Server Error";
  }
  const logPrefix = `[API ${statusCode}] [${normalized.code}]`;
  if (statusCode >= 500) {
    console.error(
      `${logPrefix} ${req.method} ${req.originalUrl || req.url} - RequestID: ${requestId || "none"}`,
      err
    );
  } else {
    console.warn(
      `${logPrefix} ${req.method} ${req.originalUrl || req.url} - RequestID: ${requestId || "none"} - ${clientMessage}`
    );
  }
  const responsePayload = {
    status,
    statusCode,
    code: normalized.code,
    message: clientMessage,
    error: clientMessage,
    timestamp: normalized.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
    path: req.originalUrl || req.url
  };
  if (requestId) {
    responsePayload.requestId = requestId;
  }
  if (normalized.details !== void 0) {
    responsePayload.details = normalized.details;
    if (normalized.code === ErrorCode.VALIDATION_ERROR) {
      responsePayload.errors = normalized.details;
    }
  }
  if (!isProduction && err instanceof Error && err.stack) {
    responsePayload.stack = err.stack;
  }
  res.status(statusCode).json(responsePayload);
}

// backend/middleware/notFoundHandler.ts
function notFoundHandler(req, _res, next) {
  const message = `Endpoint [${req.method}] ${req.originalUrl || req.url} tidak ditemukan.`;
  next(new NotFoundError(message, ErrorCode.ROUTE_NOT_FOUND));
}

// backend/utils/processSafety.ts
var isRegistered = false;
function setupProcessSafety(force = false) {
  if (isRegistered && !force) {
    return true;
  }
  if (process.env.NODE_ENV === "test" && !force) {
    return false;
  }
  isRegistered = true;
  process.on("uncaughtException", (err) => {
    console.error("\u{1F4A5} [CRITICAL FATAL] Uncaught Exception:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (!process.env.VERCEL && process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  });
  process.on("unhandledRejection", (reason) => {
    console.error("\u26A0\uFE0F [CRITICAL WARNING] Unhandled Promise Rejection:", {
      reason: reason instanceof Error ? { name: reason.name, message: reason.message, stack: reason.stack } : reason,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  return true;
}

// backend/config/env.ts
import { z as z2 } from "zod";
var serverEnvSchema = z2.object({
  NODE_ENV: z2.string().optional().default("development"),
  PORT: z2.string().regex(/^\d+$/, "PORT must be numeric").optional().default("5000"),
  DB_HOST: z2.string().optional().default("localhost"),
  DB_PORT: z2.string().regex(/^\d+$/, "DB_PORT must be numeric").optional(),
  DB_USER: z2.string().optional().default("root"),
  DB_NAME: z2.string().optional().default("kosmo_db"),
  JWT_SECRET: z2.string().optional(),
  MIDTRANS_SERVER_KEY: z2.string().optional(),
  MIDTRANS_CLIENT_KEY: z2.string().optional(),
  MIDTRANS_IS_PRODUCTION: z2.string().optional()
});
function validateServerEnv(env = process.env, options) {
  const warnings = [];
  const errors = [];
  const parsed = serverEnvSchema.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }
  const isProduction = (env.NODE_ENV === "production" || Boolean(env.VERCEL)) && env.NODE_ENV !== "test";
  if (isProduction) {
    const jwtSecret = (env.JWT_SECRET || "").trim();
    if (!jwtSecret || jwtSecret.length < 16) {
      errors.push("JWT_SECRET must be set (>= 16 characters) in production.");
    }
    const dbHost = (env.DB_HOST || "").trim();
    if (!dbHost || dbHost === "localhost" || dbHost === "127.0.0.1") {
      warnings.push("DB_HOST points to localhost in production mode.");
    }
  }
  if (env.MIDTRANS_IS_PRODUCTION === "true" && (env.MIDTRANS_SERVER_KEY || "").startsWith("SB-Mid-")) {
    warnings.push("MIDTRANS_IS_PRODUCTION=true while using sandbox SB-Mid- server key.");
  }
  if (options?.throwOnError && errors.length > 0) {
    throw new Error(`[Env Validation] ${errors.join(" | ")}`);
  }
  if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn(`[Env Warning] ${w}`);
    }
  }
  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}

// backend/server.ts
import path4 from "path";
import fs2 from "fs";
import { fileURLToPath } from "url";
import os from "os";
setupProcessSafety();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path4.dirname(__filename);
var uploadsDir = process.env.VERCEL ? path4.join(os.tmpdir(), "kosmo_uploads") : path4.join(__dirname, "uploads");
try {
  if (!fs2.existsSync(uploadsDir)) {
    fs2.mkdirSync(uploadsDir, { recursive: true });
  }
} catch {
}
var app = express2();
app.set("trust proxy", 1);
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
    "http://www.kosmobali.my.id",
    "https://juragankost.net",
    "https://www.juragankost.net",
    "http://juragankost.net",
    "http://www.juragankost.net"
  ];
  const allowedOrigins = [...defaultAllowed, ...envAllowed];
  const normalizedOrigin = origin.toLowerCase().replace(/\/$/, "");
  const isExactMatch = allowedOrigins.some((allowed) => {
    const normalizedAllowed = allowed.toLowerCase().replace(/\/$/, "");
    return normalizedAllowed === normalizedOrigin;
  });
  if (isExactMatch) return true;
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    const isProjectVercelDomain = /^kosmo(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(hostname) || /^juragankost(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(hostname);
    if (hostname === "kosmobali.my.id" || hostname.endsWith(".kosmobali.my.id") || hostname === "juragankost.net" || hostname.endsWith(".juragankost.net") || isProjectVercelDomain) {
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
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "X-Request-Id"],
  exposedHeaders: ["Content-Disposition", "X-Request-Id", "X-Contract-Hash", "X-Total-Count"],
  credentials: true,
  maxAge: 86400
};
app.use(requestIdMiddleware);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://app.midtrans.com",
          "https://app.sandbox.midtrans.com",
          "https://api.midtrans.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "data:"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://res.cloudinary.com",
          "https://*.tile.openstreetmap.org",
          "https://unpkg.com"
        ],
        connectSrc: [
          "'self'",
          "https://res.cloudinary.com",
          "https://api.midtrans.com",
          "https://app.midtrans.com",
          "https://app.sandbox.midtrans.com",
          "https://*.tile.openstreetmap.org"
        ],
        frameSrc: [
          "'self'",
          "https://app.midtrans.com",
          "https://app.sandbox.midtrans.com"
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: {
      maxAge: 31536e3,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    frameguard: { action: "sameorigin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  })
);
app.use(cors(corsOptions));
app.use(express2.json({ limit: "1mb" }));
app.use(express2.urlencoded({ extended: true, limit: "1mb" }));
if (process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)) {
  app.use((req, res, next) => {
    const startNs = process.hrtime.bigint();
    res.on("finish", () => {
      const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      console.log(
        JSON.stringify({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: res.statusCode >= 500 ? "error" : "info",
          requestId: req.requestId || req.id || null,
          method: req.method,
          path: req.originalUrl || req.url,
          status: res.statusCode,
          latencyMs: Number(latencyMs.toFixed(2)),
          contentLength: res.getHeader("content-length") || null
        })
      );
    });
    next();
  });
} else {
  app.use(morgan("dev"));
}
app.use("/uploads", express2.static(uploadsDir));
async function dbReadinessMiddleware(req, res, next, dbReadyFn = ensureDbReady) {
  if (req.path.startsWith("/api") && req.path !== "/api/health") {
    try {
      await dbReadyFn();
    } catch (error) {
      console.error("Database readiness check failed in middleware:", error);
      return res.status(500).json({
        error: "Database connection failed",
        message: "Unable to reach database cluster"
      });
    }
  }
  next();
}
app.use((req, res, next) => dbReadinessMiddleware(req, res, next));
app.use("/api", router_default);
app.use("/api", notFoundHandler);
app.use(errorHandler);
var isDirectRun = Boolean(process.argv[1] && /server(\.ts|\.js)?$/i.test(process.argv[1]));
if (!process.env.VERCEL && process.env.NO_LISTEN !== "true" && (isDirectRun || process.env.NODE_ENV !== "test")) {
  validateServerEnv();
  assertMidtransProductionConfig();
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
