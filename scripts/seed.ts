import bcrypt from 'bcryptjs';
import { initDb, pool } from '../backend/db';
import type { RowDataPacket } from 'mysql2/promise';

interface SeedProperty {
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
  ownerId: string;
  document: string;
  facilities: string[];
}

interface SeedReview {
  id: string;
  propertyId: string;
  propertyName: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
}

const curatedProperties: SeedProperty[] = [
  {
    id: 'prop-01',
    name: 'KOSMO Hub Denpasar Executive',
    district: 'Denpasar',
    address: 'Jl. Teuku Umar No. 14, Denpasar Barat, Bali',
    price: 3500000,
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
    description: 'Co-living premium di pusat bisnis Denpasar dengan kamar full-furnished, smart lock keyless entry, koneksi WiFi dedicated fiber 100 Mbps, dan area coworking bersama.',
    latitude: '-8.6734',
    longitude: '115.2126',
    totalRooms: 10,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_denpasar.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-02',
    name: 'KOSMO Seminyak Tropical Villa Living',
    district: 'Badung',
    address: 'Jl. Kayu Aya No. 88, Seminyak, Badung, Bali',
    price: 5500000,
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
    description: 'Hunian villa bergaya tropis di jantung Seminyak dengan private swimming pool, taman asri, pembersihan kamar mingguan, dan keamanan 24 jam.',
    latitude: '-8.6882',
    longitude: '115.1582',
    totalRooms: 8,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_seminyak.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-03',
    name: 'KOSMO Canggu Nomad Sanctuary',
    district: 'Badung',
    address: 'Jl. Pantai Batu Bolong No. 42, Canggu, Badung, Bali',
    price: 6500000,
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
    description: 'Tempat tinggal ideal bagi digital nomad dan remote worker di Canggu. Hanya 5 menit ke pantai Batu Bolong, kafe trendi, dan studio yoga ternama.',
    latitude: '-8.6505',
    longitude: '115.1328',
    totalRooms: 12,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_canggu.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-04',
    name: 'KOSMO Ubud Jungle Retreat & Coworking',
    district: 'Gianyar',
    address: 'Jl. Raya Pengosekan No. 19, Ubud, Gianyar, Bali',
    price: 4200000,
    rating: 4.7,
    image: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1200&q=80',
    description: 'Hunian tenang dan asri dengan pemandangan lembah hijau Ubud. Dilengkapi ruang meditasi, dapur komunal modern, dan koneksi internet stabil.',
    latitude: '-8.5192',
    longitude: '115.2633',
    totalRooms: 8,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_ubud.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-05',
    name: 'KOSMO Sanur Beachside Residence',
    district: 'Denpasar',
    address: 'Jl. Danau Tamblingan No. 77, Sanur, Denpasar Selatan, Bali',
    price: 4800000,
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
    description: 'Co-living modern dekat pantai Sanur dengan lingkungan tenang, dekat jalur jogging tepi pantai, restoran, dan supermarket internasional.',
    latitude: '-8.6942',
    longitude: '115.2612',
    totalRooms: 6,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_sanur.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-06',
    name: 'KOSMO Tabanan Green Haven',
    district: 'Tabanan',
    address: 'Jl. Bypass Kediri No. 15, Kediri, Tabanan, Bali',
    price: 2500000,
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80',
    description: 'Kos eksklusif terjangkau dengan udara sejuk dan lingkungan asri di Tabanan. Sangat cocok bagi mahasiswa, profesional, dan pekerja remote.',
    latitude: '-8.5422',
    longitude: '115.1294',
    totalRooms: 10,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_tabanan.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-07',
    name: 'KOSMO Kuta Central Smart Living',
    district: 'Badung',
    address: 'Jl. Dewi Sri No. 101, Kuta, Badung, Bali',
    price: 3800000,
    rating: 4.7,
    image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
    description: 'Hunian praktis di pusat kuliner Dewi Sri Kuta. Akses mudah ke bandara internasional I Gusti Ngurah Rai, mall, dan pantai Kuta.',
    latitude: '-8.7065',
    longitude: '115.1785',
    totalRooms: 10,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_kuta.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  }
];

const curatedReviews: SeedReview[] = [
  {
    id: 'rev-01',
    propertyId: 'prop-01',
    propertyName: 'KOSMO Hub Denpasar Executive',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 5,
    comment: 'Sangat nyaman dan lokasinya sangat strategis di Denpasar! Internetnya kencang dan stabil buat WFH.',
    date: '15 Jul 2026'
  },
  {
    id: 'rev-02',
    propertyId: 'prop-01',
    propertyName: 'KOSMO Hub Denpasar Executive',
    userId: 'user-p7wtk9f',
    userName: 'tenant2',
    rating: 4,
    comment: 'Fasilitas lengkap dan bersih, parkirannya luas. Kamar mandi bersih dengan water heater mantap.',
    date: '20 Jul 2026'
  },
  {
    id: 'rev-03',
    propertyId: 'prop-02',
    propertyName: 'KOSMO Seminyak Tropical Villa Living',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 5,
    comment: 'Keren banget kolam renangnya! Kamar bersih dan smart lock-nya sangat aman dan praktis.',
    date: '28 Jul 2026'
  },
  {
    id: 'rev-04',
    propertyId: 'prop-03',
    propertyName: 'KOSMO Canggu Nomad Sanctuary',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 5,
    comment: 'Tempat terbaik di Canggu buat kerja dan santai. Suasana komunitas nomad sangat ramah dan produktif.',
    date: '2 Agu 2026'
  },
  {
    id: 'rev-05',
    propertyId: 'prop-04',
    propertyName: 'KOSMO Ubud Jungle Retreat & Coworking',
    userId: 'user-p7wtk9f',
    userName: 'tenant2',
    rating: 5,
    comment: 'Pemandangan hijau Ubud sangat menenangkan. Cocok sekali buat recharge energi dan fokus berkarya.',
    date: '5 Agu 2026'
  },
  {
    id: 'rev-06',
    propertyId: 'prop-05',
    propertyName: 'KOSMO Sanur Beachside Residence',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 5,
    comment: 'Dekat banget ke pantai Sanur! Pagi-pagi bisa jogging tepi pantai dan lanjut kerja dengan tenang.',
    date: '10 Agu 2026'
  }
];

export async function seedDatabase(): Promise<void> {
  console.log('🌱 Starting KOSMO Database Reset & Reseeding...');

  // 1. Initialize schema
  await initDb();

  const connection = await pool.getConnection();
  try {
    console.log('🧹 Clearing transactional data while preserving user accounts...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    await connection.query('DELETE FROM rentals');
    await connection.query('DELETE FROM withdrawals');
    await connection.query('DELETE FROM reviews');
    await connection.query('DELETE FROM visitor_tracking');
    await connection.query('DELETE FROM property_facilities');
    await connection.query('DELETE FROM properties');

    // Reset user financial balances to 0.00 while preserving credentials & profile info
    await connection.query(`
      UPDATE users 
      SET balance = 0.00, totalRevenue = 0.00, totalWithdrawn = 0.00
    `);

    // Ensure core test users exist
    const adminHash = bcrypt.hashSync('admin', 10);
    const landlordHash = bcrypt.hashSync('landlord', 10);
    const tenantHash = bcrypt.hashSync('tenant', 10);

    await connection.query(`
      INSERT INTO users (id, email, password, name, role, phone, paymentMethod, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder)
      VALUES 
        ('user-admin', 'admin@kosmo.com', ?, 'Admin Super', 'admin', '+62 888-8888-8888', 'Virtual Account', 0.00, 0.00, 0.00, '', '', ''),
        ('user-landlord', 'landlord@kosmo.com', ?, 'Admin Landlord', 'landlord', '+62 811-2233-4455', 'Virtual Account', 0.00, 0.00, 0.00, 'BCA', '1234567890', 'Admin Landlord'),
        ('user-tenant', 'tenant@kosmo.com', ?, 'Bayu', 'tenant', '+62 812-3456-7890', 'Virtual Account', 0.00, 0.00, 0.00, '', '', '')
      ON DUPLICATE KEY UPDATE
        role = VALUES(role),
        name = VALUES(name),
        phone = VALUES(phone),
        balance = 0.00,
        totalRevenue = 0.00,
        totalWithdrawn = 0.00
    `, [adminHash, landlordHash, tenantHash]);

    console.log('🏡 Seeding curated Bali properties and facilities...');
    for (const prop of curatedProperties) {
      await connection.query(`
        INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        prop.id,
        prop.name,
        prop.district,
        prop.address,
        prop.price,
        prop.rating,
        prop.image,
        prop.description,
        prop.latitude,
        prop.longitude,
        prop.totalRooms,
        prop.occupiedRooms,
        prop.ownerId,
        prop.document
      ]);

      for (const facility of prop.facilities) {
        await connection.query(`
          INSERT INTO property_facilities (propertyId, facility)
          VALUES (?, ?)
        `, [prop.id, facility]);
      }
    }

    console.log('⭐ Seeding authentic tenant reviews...');
    for (const rev of curatedReviews) {
      await connection.query(`
        INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        rev.id,
        rev.propertyId,
        rev.propertyName,
        rev.userId,
        rev.userName,
        rev.rating,
        rev.comment,
        rev.date
      ]);
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ Database reset & reseeding completed successfully!');
  } catch (error) {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.error('❌ Reseeding failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Execute standalone if called directly
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(() => {
      console.log('🎉 Seed script finished cleanly.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed script error:', err);
      process.exit(1);
    });
}
