import mysql from 'mysql2/promise';
import type { Connection, ConnectionOptions, FieldPacket, QueryResult, RowDataPacket } from 'mysql2/promise';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

// Load .env locally if it exists
try {
  const possibleEnvPaths = [
    path.resolve('.env'),
    path.resolve('backend', '.env')
  ];
  for (const envPath of possibleEnvPaths) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split(/\r?\n/).forEach((line: string) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const [key, ...valParts] = trimmed.split('=');
        if (key && valParts.length > 0 && !process.env[key.trim()]) {
          process.env[key.trim()] = valParts.join('=').trim();
        }
      });
    }
  }
} catch (e) {
  console.warn("Failed to load .env file:", e);
}

const host = process.env.DB_HOST || 'localhost';
const isTiDB = host.includes('tidbcloud.com');
const isSSLFalse = process.env.DB_SSL === 'false';

const sslOption = isSSLFalse
  ? undefined
  : {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: false
    };

export const dbConfig: ConnectionOptions = {
  host,
  port: parseInt(process.env.DB_PORT || (isTiDB ? '4000' : '3306'), 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kosmo_db',
  ...(sslOption ? { ssl: sslOption } : {}),
  connectTimeout: 10000,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '5', 10),
  maxIdle: 5,
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  queueLimit: 0
};

export function validateDatabaseConfig(config: ConnectionOptions): void {
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  const host = String(config.host || 'localhost').toLowerCase();
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.');
  const isRemoteHost = !isLocalhost;
  const user = String(config.user || '').trim();
  const password = String(config.password || '').trim();

  const isPlaceholderPassword = password === 'your_database_password' || password.includes('your_password') || password === 'placeholder';
  const isPlaceholderUser = user === 'your_db_user' || user.includes('your_db_user') || user === 'placeholder';

  if (isProduction || isRemoteHost) {
    if (!user || isPlaceholderUser) {
      throw new Error(`[Database Security] Insecure database configuration: DB_USER is required and cannot be empty or placeholder for host "${host}".`);
    }
    if (!password || isPlaceholderPassword) {
      throw new Error(`[Database Security] Insecure database configuration: DB_PASSWORD is required and cannot be empty or placeholder in production or remote environments (host: "${host}").`);
    }
  }
}

export interface CustomConnection extends Connection {
  release: () => Promise<void>;
}

export type QueryExecutor = mysql.Pool | mysql.Connection;

let activePool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!activePool) {
    validateDatabaseConfig(dbConfig);
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    activePool = mysql.createPool({
      ...dbConfig,
      connectionLimit: isServerless ? 2 : parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
      maxIdle: isServerless ? 1 : 5,
      idleTimeout: isServerless ? 10000 : 60000,
      queueLimit: 0
    });

    const rawPool = (activePool as unknown as { pool?: { on?: (event: string, cb: (err: Error) => void) => void } })?.pool;
    rawPool?.on?.('error', (err: Error) => {
      console.error('MySQL/TiDB Pool Error Event:', err?.message || err);
      const code = (err as { code?: string })?.code;
      if (code === 'PROTOCOL_CONNECTION_LOST' || code === 'ECONNRESET') {
        activePool = null;
      }
    });
  }
  return activePool;
}

export const pool: mysql.Pool = getPool();

let initPromise: Promise<void> | null = null;
let isInitialized = false;

export async function ensureDbReady(): Promise<void> {
  if (isInitialized) return;
  await initDb();
}

export const ensureDbInitialized = ensureDbReady;

export async function ensureIndexes(executor: QueryExecutor = pool): Promise<void> {
  if (process.env.VERCEL) return;
  const indexStatements = [
    "ALTER TABLE properties ADD INDEX idx_properties_district_price (district, price)",
    "ALTER TABLE properties ADD INDEX idx_properties_owner (ownerId)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_tenant_status (tenantId, status)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_property_status (propertyId, status)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_room (roomId)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_contract_hash (contract_hash)",
    "ALTER TABLE rentals ADD INDEX idx_rentals_signed_at (contract_signed_at)",
    "ALTER TABLE rooms ADD INDEX idx_rooms_property_status (propertyId, status)",
    "ALTER TABLE rooms ADD INDEX idx_rooms_status (status)",
    "ALTER TABLE property_photos ADD INDEX idx_photos_property (propertyId, orderIndex)",
    "ALTER TABLE property_photos ADD INDEX idx_photos_room (roomId, orderIndex)",
    "ALTER TABLE property_photos ADD INDEX idx_photos_category (category)",
    "ALTER TABLE visitor_tracking ADD INDEX idx_visited_at (visited_at)",
    "ALTER TABLE withdrawals ADD INDEX idx_withdrawals_user_date (userId, date)",
    "ALTER TABLE withdrawals ADD INDEX idx_withdrawals_user_status (userId, status)",
    "ALTER TABLE reviews ADD INDEX idx_reviews_property (propertyId)",
    "ALTER TABLE reviews ADD INDEX idx_reviews_user (userId)"
  ];

  await Promise.allSettled(
    indexStatements.map(async (sql) => {
      try {
        await executor.query(sql);
      } catch {
        // Safe ignore if index already exists
      }
    })
  );
}

export async function createTables(executor: QueryExecutor = pool): Promise<void> {
  // Tier 0: Root tables (no foreign key dependencies)
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
        gender VARCHAR(20) DEFAULT ''
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `),
    executor.query(`
      CREATE TABLE IF NOT EXISTS visitor_tracking (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(255),
        user_agent TEXT,
        visited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_visited_at (visited_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
  ]);

  // Tier 1: Tables with foreign keys pointing to users
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
        INDEX idx_properties_district_price (district, price),
        INDEX idx_properties_owner (ownerId),
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
        INDEX idx_withdrawals_user_date (userId, date),
        INDEX idx_withdrawals_user_status (userId, status),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
  ]);

  // Tier 2: Leaf tables with foreign keys pointing to properties and users
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
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_property_room_number (propertyId, roomNumber),
        INDEX idx_rooms_property_status (propertyId, status),
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
        INDEX idx_rentals_tenant_status (tenantId, status),
        INDEX idx_rentals_property_status (propertyId, status),
        INDEX idx_rentals_room (roomId),
        INDEX idx_rentals_contract_hash (contract_hash),
        INDEX idx_rentals_signed_at (contract_signed_at),
        FOREIGN KEY (tenantId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
  ]);

  // Tier 3: Leaf tables referencing rooms and properties
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
        INDEX idx_photos_property (propertyId, orderIndex),
        INDEX idx_photos_room (roomId, orderIndex),
        INDEX idx_photos_category (category),
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
  ]);
}

interface RoomCountSummaryRow extends RowDataPacket {
  total: number | string;
  occupied: number | string;
}

interface PropertyBackfillRow extends RowDataPacket {
  id: string;
  name: string;
  totalRooms: number | string;
  occupiedRooms: number | string;
  price: number | string;
  image: string | null;
}

interface CountRow extends RowDataPacket {
  count: number | string;
}

interface RoomCandidateRow extends RowDataPacket {
  id: string;
}

interface RentalUnlinkedRow extends RowDataPacket {
  id: string;
  propertyId: string;
}

/**
 * Atomically recalculates and synchronizes `properties.totalRooms` and `properties.occupiedRooms`
 * from the discrete `rooms` inventory table.
 *
 * @param executor QueryExecutor (pool or transactional Connection)
 * @param propertyId Target property ID to synchronize
 * @returns Synchronized totalRooms and occupiedRooms counts
 */
export async function syncPropertyRoomCounts(
  executor: QueryExecutor,
  propertyId: string
): Promise<{ totalRooms: number; occupiedRooms: number }> {
  const [rows] = await executor.query<RoomCountSummaryRow[]>(
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
    'UPDATE properties SET totalRooms = ?, occupiedRooms = ? WHERE id = ?',
    [totalRooms, occupiedRooms, propertyId]
  );

  return { totalRooms, occupiedRooms };
}

/**
 * Deterministically provisions discrete rooms and gallery thumbnails for existing properties,
 * and links existing active tenancies lacking a roomId to occupied rooms.
 *
 * Strictly idempotent: Multiple invocations will not duplicate rooms, create duplicate photos,
 * or alter active assignments.
 *
 * @param executor QueryExecutor (defaults to pool)
 */
export async function backfillDiscreteRooms(executor: QueryExecutor = pool): Promise<void> {
  // 1. Fetch all existing properties
  const [properties] = await executor.query<PropertyBackfillRow[]>(
    'SELECT id, name, totalRooms, occupiedRooms, price, image FROM properties ORDER BY id ASC'
  );

  for (const prop of properties) {
    const propId = String(prop.id);
    const total = Number(prop.totalRooms || 0);
    const occupied = Math.max(0, Math.min(total, Number(prop.occupiedRooms || 0)));

    if (total <= 0) continue;

    // Check if discrete rooms already exist for this property
    const [existingRooms] = await executor.query<CountRow[]>(
      'SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?',
      [propId]
    );

    const roomCount = Number(existingRooms[0]?.count || 0);

    if (roomCount === 0) {
      // Deterministically provision `total` rooms (10 rooms per floor: 101-110, 201-210...)
      for (let i = 1; i <= total; i++) {
        const floor = Math.floor((i - 1) / 10) + 1;
        const roomIndex = ((i - 1) % 10) + 1;
        const roomNumber = `${floor}${String(roomIndex).padStart(2, '0')}`;
        const rawId = `room-${propId}-${roomNumber}`;
        const roomId = rawId.length <= 50
          ? rawId
          : `rm-${crypto.createHash('md5').update(`${propId}-${roomNumber}`).digest('hex').slice(0, 24)}`;
        const status = i <= occupied ? 'occupied' : 'available';
        const type = i % 2 === 0 ? 'Deluxe' : 'Standard';

        await executor.query(
          `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status)
           VALUES (?, ?, ?, ?, ?, NULL, ?)
           ON DUPLICATE KEY UPDATE id = id`,
          [roomId, propId, roomNumber, floor, type, status]
        );
      }
    }

    // Provision initial thumbnail in property_photos if property has an image and 0 gallery photos
    const imageUrl = typeof prop.image === 'string' ? prop.image.trim() : '';
    if (imageUrl.length > 0) {
      const [existingPhotos] = await executor.query<CountRow[]>(
        'SELECT COUNT(*) as count FROM property_photos WHERE propertyId = ?',
        [propId]
      );
      const photoCount = Number(existingPhotos[0]?.count || 0);

      if (photoCount === 0) {
        const rawPhotoId = `photo-${propId}-thumb`;
        const photoId = rawPhotoId.length <= 50
          ? rawPhotoId
          : `ph-${crypto.createHash('md5').update(`${propId}-thumb`).digest('hex').slice(0, 24)}`;
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

  // 2. Link unlinked active rentals to occupied rooms on corresponding property
  const [unlinkedRentals] = await executor.query<RentalUnlinkedRow[]>(
    `SELECT id, propertyId FROM rentals 
     WHERE (roomId IS NULL OR roomId = '') AND status = 'active'
     ORDER BY id ASC`
  );

  for (const rental of unlinkedRentals) {
    const rentalId = String(rental.id);
    const propertyId = String(rental.propertyId);

    // Find the first occupied room on this property not yet assigned to an active rental
    const [candidateRooms] = await executor.query<RoomCandidateRow[]>(
      `SELECT r.id FROM rooms r
       LEFT JOIN rentals ren ON r.id = ren.roomId AND ren.status = 'active'
       WHERE r.propertyId = ? AND r.status = 'occupied' AND ren.id IS NULL
       ORDER BY r.floor ASC, r.roomNumber ASC
       LIMIT 1`,
      [propertyId]
    );

    let targetRoomId: string | null = candidateRooms[0]?.id ? String(candidateRooms[0].id) : null;

    // Fallback: If no unassigned occupied room exists, allocate an available room and mark occupied
    if (!targetRoomId) {
      const [fallbackRooms] = await executor.query<RoomCandidateRow[]>(
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
        'UPDATE rentals SET roomId = ? WHERE id = ?',
        [targetRoomId, rentalId]
      );
    }
  }

  // 3. Enforce that any room linked to an active rental is marked 'occupied'
  await executor.query(
    `UPDATE rooms r
     JOIN rentals ren ON r.id = ren.roomId
     SET r.status = 'occupied'
     WHERE ren.status = 'active' AND r.status != 'occupied'`
  );

  // 4. Synchronize aggregate room counters for all properties
  for (const prop of properties) {
    await syncPropertyRoomCounts(executor, String(prop.id));
  }
}

export async function applyMigrations(executor: QueryExecutor = pool): Promise<void> {
  const runTableQueries = async (queries: string[]) => {
    for (const sql of queries) {
      try {
        await executor.query(sql);
      } catch {
        // Safe ignore if column or modification already applied
      }
    }
  };

  // Idempotent table creations for existing/migrated databases
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
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_property_room_number (propertyId, roomNumber),
        INDEX idx_rooms_property_status (propertyId, status),
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
        INDEX idx_photos_property (propertyId, orderIndex),
        INDEX idx_photos_room (roomId, orderIndex),
        INDEX idx_photos_category (category),
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch {
    // Safe ignore if tables already exist
  }

  const propertiesQueries = [
    'ALTER TABLE properties MODIFY image LONGTEXT',
    'ALTER TABLE properties MODIFY description LONGTEXT'
  ];

  const usersQueries = [
    'ALTER TABLE users MODIFY avatar LONGTEXT',
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
    'ALTER TABLE visitor_tracking MODIFY ip_address VARCHAR(255)',
    'ALTER TABLE visitor_tracking MODIFY user_agent TEXT'
  ];

  const withdrawalsQueries = [
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS accountHolder VARCHAR(100) DEFAULT ''",
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS referenceId VARCHAR(100) DEFAULT ''",
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS rejectionReason TEXT",
    "ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS processedAt VARCHAR(50) DEFAULT ''"
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
    "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS roomId VARCHAR(50)"
  ];

  // Run per-table migration pipelines in parallel
  await Promise.all([
    runTableQueries(propertiesQueries),
    runTableQueries(usersQueries),
    runTableQueries(visitorTrackingQueries),
    runTableQueries(withdrawalsQueries),
    runTableQueries(rentalsQueries)
  ]);

  await ensureIndexes(executor);
  try {
    await backfillDiscreteRooms(executor);
  } catch (err) {
    console.warn('Initial backfillDiscreteRooms skipped or deferred:', err);
  }
}

export async function seedUsers(executor: QueryExecutor = pool): Promise<void> {
  const [userRows] = await executor.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM users');
  if (userRows[0].count === 0) {
    const adminHash = bcrypt.hashSync('admin', 10);
    const landlordHash = bcrypt.hashSync('landlord', 10);
    const tenantHash = bcrypt.hashSync('tenant', 10);

    await executor.query(`
      INSERT INTO users (
        id, email, password, name, role, phone, paymentMethod, avatar, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder,
        identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_relation, emergency_contact_phone
      )
      VALUES 
        ('user-admin', 'admin@kosmo.com', ?, 'Admin Super', 'admin', '+62 888-8888-8888', 'Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171010000000001', 'Kantor Pusat KOSMO Bali, Denpasar', 'Platform Administrator', 'Support Center', 'Kantor', '+628888888888'),
        ('user-landlord', 'landlord@kosmo.com', ?, 'Admin Landlord', 'landlord', '+62 811-2233-4455', 'Virtual Account', NULL, 650000.0, 1650000.0, 1000000.0, 'BCA', '1234567890', 'Admin Landlord', 'NIK', '5171012204850002', 'Jl. Sunset Road No. 88, Seminyak, Badung, Bali', 'Pengelola Properti', 'Wayan Landlord', 'Keluarga', '+6281122334400'),
        ('user-tenant', 'tenant@kosmo.com', ?, 'Bayu', 'tenant', '+62 812-3456-7890', 'Kartu Kredit, Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171012308980001', 'Jl. Teuku Umar No. 88, Denpasar Barat, Kota Denpasar, Bali', 'Software Engineer', 'Made Wipradnyana', 'Orang Tua', '+6281234567899');
    `, [adminHash, landlordHash, tenantHash]);

    // Seed initial withdrawal
    await executor.query(`
      INSERT INTO withdrawals (id, userId, bankName, accountNumber, amount, date, status)
      VALUES ('w-01', 'user-landlord', 'BCA', '1234567890', 1000000.0, '3 Jun 2026', 'completed');
    `);
  } else {
    // Migrate existing legacy plaintext passwords to bcrypt in parallel
    const [existing] = await executor.query<RowDataPacket[]>('SELECT id, password FROM users');
    const updatePromises: Promise<unknown>[] = [];
    for (const u of existing) {
      if (u.password) {
        const isHashed = u.password.startsWith('$2a$') || u.password.startsWith('$2b$') || u.password.startsWith('$2y$');
        if (!isHashed) {
          const hashed = bcrypt.hashSync(u.password, 10);
          updatePromises.push(executor.query('UPDATE users SET password = ? WHERE id = ?', [hashed, u.id]));
        }
      }
    }
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }
  }
}

export async function seedPropertiesAndFacilities(executor: QueryExecutor = pool): Promise<void> {
  const [propRows] = await executor.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM properties');
  if (propRows[0].count === 0) {
    await executor.query(`
      INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document)
      VALUES 
        ('prop-01', 'KOSMO Hub Denpasar', 'Denpasar', 'Jl. Teuku Umar No. 14, Denpasar, Bali', 3500000, 4.7, 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80', 'Modern co-living space di Denpasar dengan konsep smart home. Dilengkapi dengan communal area luas, rooftop area, cafe, gym kecil, dan coworking space untuk penghuni. Fasilitas listrik, air, wifi, kebersihan, keamanan, dan parkir.', '-8.6725', '115.2166', 10, 8, 'user-landlord', 'sertifikat_denpasar.pdf'),
        ('prop-02', 'KOSMO Hub Seminyak', 'Badung', 'Jl. Sunset Road No. 88, Badung, Bali', 4500000, 4.8, 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80', 'Premium co-living space di Seminyak dekat pantai. Sangat cocok untuk digital nomad dengan internet super cepat, area kerja nyaman, kolam renang, dan parkir luas.', '-8.6913', '115.1682', 8, 5, 'user-landlord', 'sertifikat_seminyak.pdf'),
        ('prop-03', 'KOSMO Hub Ubud', 'Gianyar', 'Jl. Raya Ubud No. 12, Gianyar, Bali', 2500000, 4.5, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80', 'Co-living asri di Ubud yang dikelilingi sawah. Dilengkapi dengan kitchen bersama, yoga shala, dan suasana tenang untuk fokus bekerja atau bersantai.', '-8.5069', '115.2625', 12, 6, 'user-landlord', 'sertifikat_ubud.pdf');
    `);

    await executor.query(`
      INSERT INTO property_facilities (propertyId, facility)
      VALUES 
        ('prop-01', 'Listrik'), ('prop-01', 'Air'), ('prop-01', 'Wifi'), ('prop-01', 'Kebersihan'), ('prop-01', 'Keamanan'), ('prop-01', 'Parkir'),
        ('prop-02', 'Wifi'), ('prop-02', 'Air'), ('prop-02', 'Keamanan'), ('prop-02', 'Parkir'), ('prop-02', 'Listrik'),
        ('prop-03', 'Wifi'), ('prop-03', 'Kebersihan'), ('prop-03', 'Air'), ('prop-03', 'Keamanan');
    `);
  }
}

export async function seedReviews(executor: QueryExecutor = pool): Promise<void> {
  const [revRows] = await executor.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM reviews');
  if (revRows[0].count === 0) {
    await executor.query(`
      INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date)
      VALUES 
        ('rev-01', 'prop-01', 'KOSMO Hub Denpasar', 'user-tenant', 'Bayu', 5, 'Sangat nyaman dan lokasinya sangat strategis di Denpasar! Internetnya cepat banget cocok buat WFH.', '15 Jun 2026'),
        ('rev-02', 'prop-01', 'KOSMO Hub Denpasar', 'user-landlord', 'Admin Landlord', 4, 'Fasilitas lengkap dan bersih, parkirannya luas. Hanya saja jalan di depan agak macet kalau sore.', '10 Jun 2026'),
        ('rev-03', 'prop-02', 'KOSMO Hub Seminyak', 'user-tenant', 'Bayu', 5, 'Keren banget kolam renangnya! Kamar bersih dan smart lock-nya aman sekali.', '18 Jun 2026');
    `);
  }
}

export async function seedDatabase(executor: QueryExecutor = pool): Promise<void> {
  // Step 1: Users must be seeded first due to FK references (properties.ownerId -> users.id)
  await seedUsers(executor);
  // Step 2: Properties and facilities
  await seedPropertiesAndFacilities(executor);
  // Step 3: Tenant reviews
  await seedReviews(executor);
  // Step 4: Discrete room inventory auto-backfill & thumbnail seeding
  await backfillDiscreteRooms(executor);
}

export async function initDb(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Auto-create database if possible (in local development only)
      if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
        try {
          const baseConnection = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password,
            ...(sslOption ? { ssl: sslOption } : {})
          });
          await baseConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database || 'kosmo_db'}\`;`);
          await baseConnection.end();
        } catch {
          // Safe fallback for cloud MySQL where CREATE DATABASE is not permitted
        }
      }

      // Serverless optimization: Check if all required tables exist
      const [tableRows] = await pool.query<RowDataPacket[]>("SHOW TABLES");
      const existingTables = tableRows.map(row => Object.values(row)[0].toLowerCase());
      
      const requiredTables = [
        'users',
        'properties',
        'property_facilities',
        'reviews',
        'withdrawals',
        'visitor_tracking',
        'rentals',
        'rooms',
        'property_photos'
      ];
      
      const missingTables = requiredTables.filter(t => !existingTables.includes(t));
      
      if (missingTables.length === 0) {
        await applyMigrations(pool);
        isInitialized = true;
        console.log("MySQL Database Kosmo tables already initialized and migrations applied.");
        return;
      }
      
      console.log(`Database tables missing: ${missingTables.join(', ')}. Initializing modular schema...`);

      await createTables(pool);
      await applyMigrations(pool);
      await seedDatabase(pool);

      isInitialized = true;
      console.log("MySQL Database Kosmo initialized, tables created, and seeded successfully!");
    } catch (err: unknown) {
      console.error("Failed to initialize database tables or seed default values:", err);
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

export const db = {
  users: {
    getById: async <T extends RowDataPacket = RowDataPacket>(id: string): Promise<T | null> => {
      const [rows] = await pool.query<T[]>('SELECT * FROM users WHERE id = ?', [id]);
      return rows[0] || null;
    },
    getByEmail: async <T extends RowDataPacket = RowDataPacket>(email: string): Promise<T | null> => {
      const [rows] = await pool.query<T[]>('SELECT * FROM users WHERE email = ?', [email]);
      return rows[0] || null;
    }
  }
};
