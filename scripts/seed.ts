import bcrypt from 'bcryptjs';
import { initDb, pool, backfillDiscreteRooms } from '../backend/db';
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
    name: 'Cove Nuansa Home Jimbaran',
    district: 'Badung',
    address: 'Jl. Nuansa Utama Perum Kori Nuansa II No. 9, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361',
    price: 4150000,
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
    description: 'Co-living modern dan tenang di kawasan residential Kori Nuansa Jimbaran. Hanya 8 menit ke Kampus Universitas Udayana (UNUD) Bukit dan Sidewalk Jimbaran. Dilengkapi kamar mezzanine full furnished, smart lock, AC, WiFi dedicated fiber 100 Mbps, dapur bersama, dan rooftop lounge santai.',
    latitude: '-8.7895',
    longitude: '115.1762',
    totalRooms: 10,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_cove_nuansa.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-02',
    name: 'Kawaii Home Jimbaran',
    district: 'Badung',
    address: 'Jl. Parigata Gang VIII No. 12, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361',
    price: 5300000,
    rating: 4.7,
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
    description: 'Coliving eksklusif dengan sentuhan desain minimalis modern di kawasan strategis Jimbaran. Berjarak hanya 1.5 km dari Universitas Udayana dan 10 menit ke Pantai Jimbaran. Kamar full furnished dengan Queen bed, AC, Smart TV, meja kerja ergonomis, water heater, dan layanan kebersihan kamar rutin.',
    latitude: '-8.7942',
    longitude: '115.1685',
    totalRooms: 8,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_kawaii_home.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-03',
    name: 'Jim\'s Coliving Jimbaran',
    district: 'Badung',
    address: 'Jl. Raya Kampus Unud No. 8, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361',
    price: 3300000,
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
    description: 'Coliving favorit mahasiswa dan remote worker tepat di koridor utama Jl. Raya Kampus Unud Jimbaran. Sangat diminati mahasiswa Udayana, Politeknik Negeri Bali, dan RS Udayana. Unit Studio Queen ber-AC, kamar mandi dalam dengan water heater, WiFi kencang, parkir mobil/motor luas, dan dapur bersama.',
    latitude: '-8.7915',
    longitude: '115.1712',
    totalRooms: 12,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_jims_coliving.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-04',
    name: 'Mari Living Jimbaran',
    district: 'Badung',
    address: 'Gang Sandat No. 88, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361',
    price: 2900000,
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1200&q=80',
    description: 'Kost eksklusif modern hanya 5 menit dari Rektorat Universitas Udayana Jimbaran. Kamar full furnished dengan kasur 160x200, Smart TV 43 inch, meja belajar/kerja, kamar mandi dalam water heater, kulkas bersama per lantai, dan rooftop komunal dengan pemandangan patung GWK.',
    latitude: '-8.7980',
    longitude: '115.1690',
    totalRooms: 8,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_mari_living.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-05',
    name: 'Villa Kori Nuansa Jimbaran',
    district: 'Badung',
    address: 'Jl. Nuansa Kori Utama Selatan No. 4, Taman Griya, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361',
    price: 4800000,
    rating: 4.7,
    image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
    description: 'Hunian bergaya villa coliving asri dan privat di perumahan Taman Griya Jimbaran. Dilengkapi kolam renang outdoor, taman tropis, dapur komunal modern, kamar tidur luas ber-AC dengan kamar mandi pribadi, serta sistem keamanan lingkungan 24 jam.',
    latitude: '-8.7930',
    longitude: '115.1820',
    totalRooms: 6,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_kori_nuansa.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-06',
    name: 'Katsumata Residence Jimbaran',
    district: 'Badung',
    address: 'Jl. Raya Kampus Unud No. 45, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361',
    price: 3500000,
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80',
    description: 'Kost modern di kawasan strategis Kampus Bukit Jimbaran, hanya 1.6 km dari Sidewalk Mall Jimbaran. Kamar dengan tempat tidur Queen, AC dingin, kamar mandi dalam dengan shower air panas, meja kursi belajar, internet cepat, dan keamanan CCTV 24 jam.',
    latitude: '-8.7960',
    longitude: '115.1740',
    totalRooms: 10,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_katsumata.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  },
  {
    id: 'prop-07',
    name: 'DSTAY Kost Bali Jimbaran',
    district: 'Badung',
    address: 'Jl. Goa Gong No. 19, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361',
    price: 2400000,
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
    description: 'Kost tenang dan berhawa sejuk di kawasan perbukitan Jl. Goa Gong Jimbaran, hanya 5 menit ke kawasan wisata GWK dan 7 menit ke Kampus Bukit Unud. Fasilitas kamar ber-AC, kamar mandi dalam, akses WiFi lancar, taman hijau, dapur bersama, dan area parkir motor/mobil aman.',
    latitude: '-8.8050',
    longitude: '115.1660',
    totalRooms: 10,
    occupiedRooms: 0,
    ownerId: 'user-landlord',
    document: 'sertifikat_shm_dstay_jimbaran.pdf',
    facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan', 'Keamanan', 'Parkir']
  }
];

const curatedReviews: SeedReview[] = [
  {
    id: 'rev-01',
    propertyId: 'prop-01',
    propertyName: 'Cove Nuansa Home Jimbaran',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 5,
    comment: 'Tempatnya baru, bersih dan sangat nyaman di kawasan perumahan Taman Griya yang tenang. Desain mezzanine-nya unik dan estetik, AC dingin, serta stafnya ramah dan helpful!',
    date: '15 Jul 2026'
  },
  {
    id: 'rev-02',
    propertyId: 'prop-01',
    propertyName: 'Cove Nuansa Home Jimbaran',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 5,
    comment: 'Sangat recommended buat yang butuh ketenangan untuk WFH maupun kuliah di UNUD. Internet dedicated fiber-nya kencang, communal kitchen dan rooftop-nya asik buat santai sore.',
    date: '20 Jul 2026'
  },
  {
    id: 'rev-03',
    propertyId: 'prop-02',
    propertyName: 'Kawaii Home Jimbaran',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 5,
    comment: 'Konsep coliving-nya keren dan bersih, kamarnya luas dengan queen bed dan meja kerja yang nyaman. Lokasi dekat banget ke kampus Unud Jimbaran dan tim manajemennya sangat responsif.',
    date: '28 Jul 2026'
  },
  {
    id: 'rev-04',
    propertyId: 'prop-03',
    propertyName: 'Jim\'s Coliving Jimbaran',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 5,
    comment: 'Lokasinya juara tepat di Jl. Raya Kampus Unud, jalan kaki ke warung makan dan minimarket gampang sekali. Kamar Studio Queen bersih, water heater berfungsi baik, dan parkirannya lega.',
    date: '2 Agu 2026'
  },
  {
    id: 'rev-05',
    propertyId: 'prop-04',
    propertyName: 'Mari Living Jimbaran',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 5,
    comment: 'Kost eksklusif yang sangat recommended di Jimbaran! Fasilitas Smart TV 43 inch dan kulkas bersama per lantai sangat membantu. Paling suka rooftop-nya dengan view patung GWK yang megah.',
    date: '5 Agu 2026'
  },
  {
    id: 'rev-06',
    propertyId: 'prop-05',
    propertyName: 'Villa Kori Nuansa Jimbaran',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 5,
    comment: 'Suasana villa yang tenang dan asri di Taman Griya Jimbaran. Kolam renang bersih, dapur bersama lengkap, dan lingkungannya aman berpagar. Cocok untuk istirahat yang berkualitas.',
    date: '10 Agu 2026'
  },
  {
    id: 'rev-07',
    propertyId: 'prop-07',
    propertyName: 'DSTAY Kost Bali Jimbaran',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 4,
    comment: 'Kost di Jl. Goa Gong yang tenang dan berhawa sejuk di perbukitan Jimbaran. Dekat ke GWK dan pantai-pantai Bukit Selatan. Fasilitas kamar mandi dalam dan AC berfungsi sangat baik.',
    date: '14 Agu 2026'
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

    await connection.query('DELETE FROM maintenance_tickets');
    await connection.query('DELETE FROM property_photos');
    await connection.query('DELETE FROM rooms');
    await connection.query('DELETE FROM rentals');
    await connection.query('DELETE FROM withdrawals');
    await connection.query('DELETE FROM reviews');
    await connection.query('DELETE FROM visitor_tracking');
    await connection.query('DELETE FROM property_facilities');
    await connection.query('DELETE FROM properties');
    await connection.query("DELETE FROM users WHERE id NOT IN ('user-admin', 'user-landlord', 'user-tenant')");

    // Reset user financial balances to 0.00 while preserving credentials & profile info
    await connection.query(`
      UPDATE users 
      SET balance = 0.00, totalRevenue = 0.00, totalWithdrawn = 0.00
    `);

    // Ensure core test users exist
    const [adminHash, landlordHash, tenantHash] = await Promise.all([
      bcrypt.hash('admin', 10),
      bcrypt.hash('landlord', 10),
      bcrypt.hash('tenant', 10)
    ]);

    await connection.query(`
      INSERT INTO users (
        id, email, password, name, role, phone, paymentMethod, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder,
        identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_relation, emergency_contact_phone
      )
      VALUES 
        ('user-admin', 'admin@kosmo.com', ?, 'Admin Super', 'admin', '+62 888-8888-8888', 'Virtual Account', 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171010000000001', 'Kantor Pusat KOSMO Bali, Jimbaran', 'Platform Administrator', 'Support Center', 'Kantor', '+628888888888'),
        ('user-landlord', 'landlord@kosmo.com', ?, 'Admin Landlord', 'landlord', '+62 811-2233-4455', 'Virtual Account', 0.00, 0.00, 0.00, 'BCA', '1234567890', 'Admin Landlord', 'NIK', '5171012204850002', 'Jl. Raya Kampus Unud No. 88, Jimbaran, Badung, Bali', 'Pengelola Properti', 'Wayan Landlord', 'Keluarga', '+6281122334400'),
        ('user-tenant', 'tenant@kosmo.com', ?, 'Bayu', 'tenant', '+62 812-3456-7890', 'Virtual Account', 0.00, 0.00, 0.00, '', '', '', 'NIK', '5171012308980001', 'Jl. Nuansa Utama No. 12, Jimbaran, Badung, Bali', 'Software Engineer', 'Made Wipradnyana', 'Orang Tua', '+6281234567899')
      ON DUPLICATE KEY UPDATE
        role = VALUES(role),
        name = VALUES(name),
        phone = VALUES(phone),
        address = VALUES(address),
        identity_number = VALUES(identity_number),
        occupation = VALUES(occupation),
        emergency_contact_name = VALUES(emergency_contact_name),
        emergency_contact_relation = VALUES(emergency_contact_relation),
        emergency_contact_phone = VALUES(emergency_contact_phone),
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

    console.log('🚪 Backfilling discrete rooms and initial thumbnails...');
    await backfillDiscreteRooms(connection);

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
