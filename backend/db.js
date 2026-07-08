import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

// Load .env locally if it exists
try {
  const envPath = path.resolve('.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...valParts] = trimmed.split('=');
      if (key && valParts.length > 0) {
        process.env[key.trim()] = valParts.join('=').trim();
      }
    });
  }
} catch (e) {
  console.warn("Failed to load .env file:", e);
}

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '15616'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'defaultdb',
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '1'),
  maxIdle: 1,
  idleTimeout: 1000,
  queueLimit: 0
};

// Only attempt database creation if host is localhost/127.0.0.1
if (dbConfig.host === 'localhost' || dbConfig.host === '127.0.0.1') {
  let baseConnection;
  try {
    baseConnection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });
    await baseConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
  } catch (err) {
    console.error("Failed to connect to base MySQL server. Make sure MySQL service is running.", err);
  } finally {
    if (baseConnection) await baseConnection.end();
  }
}

export const pool = mysql.createPool(dbConfig);

let initPromise = null;
let isInitialized = false;

export async function initDb() {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Optimasi serverless: Cek apakah semua tabel wajib sudah ada
      const [tableRows] = await pool.query("SHOW TABLES");
      const existingTables = tableRows.map(row => Object.values(row)[0].toLowerCase());
      
      const requiredTables = [
        'users',
        'properties',
        'property_facilities',
        'reviews',
        'withdrawals',
        'visitor_tracking',
        'rentals'
      ];
      
      const missingTables = requiredTables.filter(t => !existingTables.includes(t));
      
      if (missingTables.length === 0) {
        isInitialized = true;
        console.log("MySQL Database Kosmo tables already initialized. Skipping schema creation and seeding.");
        return;
      }
      
      console.log(`Database tables missing: ${missingTables.join(', ')}. Initializing...`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(50) PRIMARY KEY,
          email VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(100) NOT NULL,
          name VARCHAR(100) NOT NULL,
          role ENUM('admin', 'landlord', 'tenant') NOT NULL,
          phone VARCHAR(20) DEFAULT '',
          paymentMethod VARCHAR(100) DEFAULT 'Virtual Account',
          avatar TEXT,
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

      // 2. Properties table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS properties (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          district VARCHAR(50) NOT NULL,
          address TEXT NOT NULL,
          price INT NOT NULL,
          rating DECIMAL(3, 1) DEFAULT 0.0,
          image TEXT,
          description TEXT,
          latitude VARCHAR(50) DEFAULT '-8.6500',
          longitude VARCHAR(50) DEFAULT '115.2166',
          totalRooms INT NOT NULL,
          occupiedRooms INT DEFAULT 0,
          ownerId VARCHAR(50),
          document VARCHAR(100) DEFAULT 'sertifikat_kepemilikan.pdf',
          FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // 3. Property Facilities table (Listrik, Air, Wifi, Kebersihan, Keamanan, Parkir)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS property_facilities (
          propertyId VARCHAR(50),
          facility VARCHAR(50),
          PRIMARY KEY (propertyId, facility),
          FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // 4. Reviews table
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

      // 5. Withdrawals table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawals (
          id VARCHAR(50) PRIMARY KEY,
          userId VARCHAR(50) NOT NULL,
          bankName VARCHAR(50) NOT NULL,
          accountNumber VARCHAR(50) NOT NULL,
          amount DECIMAL(15, 2) NOT NULL,
          date VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // 6. Visitor tracking table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS visitor_tracking (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ip_address VARCHAR(50),
          user_agent VARCHAR(255),
          visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // 7. Rentals table (Sewa Kos)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS rentals (
          id VARCHAR(50) PRIMARY KEY,
          tenantId VARCHAR(50) NOT NULL,
          propertyId VARCHAR(50) NOT NULL,
          propertyName VARCHAR(100),
          price INT,
          startDate VARCHAR(50),
          status ENUM('active','terminated') DEFAULT 'active',
          FOREIGN KEY (tenantId) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Seed Users if empty
      const [userRows] = await pool.query('SELECT COUNT(*) as count FROM users');
      if (userRows[0].count === 0) {
        const adminHash = bcrypt.hashSync('admin', 10);
        const landlordHash = bcrypt.hashSync('landlord', 10);
        const tenantHash = bcrypt.hashSync('tenant', 10);

        await pool.query(`
          INSERT INTO users (id, email, password, name, role, phone, paymentMethod, avatar, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder)
          VALUES 
            ('user-admin', 'admin@kosmo.com', ?, 'Admin Super', 'admin', '+62 888-8888-8888', 'Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', ''),
            ('user-landlord', 'landlord@kosmo.com', ?, 'Admin Landlord', 'landlord', '+62 811-2233-4455', 'Virtual Account', NULL, 650000.0, 1650000.0, 1000000.0, 'BCA', '1234567890', 'Admin Landlord'),
            ('user-tenant', 'tenant@kosmo.com', ?, 'Bayu', 'tenant', '+62 812-3456-7890', 'Kartu Kredit, Virtual Account', NULL, 0.00, 0.00, 0.00, '', '', '');
        `, [adminHash, landlordHash, tenantHash]);

        // Seed withdrawals
        await pool.query(`
          INSERT INTO withdrawals (id, userId, bankName, accountNumber, amount, date, status)
          VALUES ('w-01', 'user-landlord', 'BCA', '1234567890', 1000000.0, '3 Jun 2026', 'Selesai');
        `);
      } else {
        // Migrate existing plaintext users if any
        const [existing] = await pool.query('SELECT id, password FROM users');
        for (let u of existing) {
          if (u.password) {
            const isHashed = u.password.startsWith('$2a$') || u.password.startsWith('$2b$') || u.password.startsWith('$2y$');
            if (!isHashed) {
              const hashed = bcrypt.hashSync(u.password, 10);
              await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, u.id]);
            }
          }
        }
      }

      // Seed Properties if empty
      const [propRows] = await pool.query('SELECT COUNT(*) as count FROM properties');
      if (propRows[0].count === 0) {
        await pool.query(`
          INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document)
          VALUES 
            ('prop-01', 'KOSMO Hub Denpasar', 'Denpasar', 'Jl. Teuku Umar No. 14, Denpasar, Bali', 3500000, 4.7, 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80', 'Modern co-living space di Denpasar dengan konsep smart home. Dilengkapi dengan communal area luas, rooftop area, cafe, gym kecil, dan coworking space untuk penghuni. Fasilitas listrik, air, wifi, kebersihan, keamanan, dan parkir.', '-8.6725', '115.2166', 10, 8, 'user-landlord', 'sertifikat_denpasar.pdf'),
            ('prop-02', 'KOSMO Hub Seminyak', 'Badung', 'Jl. Sunset Road No. 88, Badung, Bali', 4500000, 4.8, 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80', 'Premium co-living space di Seminyak dekat pantai. Sangat cocok untuk digital nomad dengan internet super cepat, area kerja nyaman, kolam renang, dan parkir luas.', '-8.6913', '115.1682', 8, 5, 'user-landlord', 'sertifikat_seminyak.pdf'),
            ('prop-03', 'KOSMO Hub Ubud', 'Gianyar', 'Jl. Raya Ubud No. 12, Gianyar, Bali', 2500000, 4.5, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80', 'Co-living asri di Ubud yang dikelilingi sawah. Dilengkapi dengan kitchen bersama, yoga shala, dan suasana tenang untuk fokus bekerja atau bersantai.', '-8.5069', '115.2625', 12, 6, 'user-landlord', 'sertifikat_ubud.pdf');
        `);

        // Seed Facilities (using updated list: Listrik, Air, Wifi, Kebersihan, Keamanan, Parkir)
        await pool.query(`
          INSERT INTO property_facilities (propertyId, facility)
          VALUES 
            ('prop-01', 'Listrik'), ('prop-01', 'Air'), ('prop-01', 'Wifi'), ('prop-01', 'Kebersihan'), ('prop-01', 'Keamanan'), ('prop-01', 'Parkir'),
            ('prop-02', 'Wifi'), ('prop-02', 'Air'), ('prop-02', 'Keamanan'), ('prop-02', 'Parkir'), ('prop-02', 'Listrik'),
            ('prop-03', 'Wifi'), ('prop-03', 'Kebersihan'), ('prop-03', 'Air'), ('prop-03', 'Keamanan');
        `);
      }

      // Seed Reviews if empty
      const [revRows] = await pool.query('SELECT COUNT(*) as count FROM reviews');
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
      try {
        fs.writeFileSync('db_error.log', `[${new Date().toISOString()}] initDb error: ${err.stack || err}\n`);
      } catch (e) {}
    }
  })();

  return initPromise;
}

export const db = {
  users: {
    getById: async (id) => {
      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
      return rows[0] || null;
    },
    getByEmail: async (email) => {
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      return rows[0] || null;
    }
  }
};
