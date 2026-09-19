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

interface SeedUser {
  id: string;
  email: string;
  passwordPlain: string;
  name: string;
  role: 'admin' | 'landlord' | 'tenant';
  phone: string;
  paymentMethod: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  identity_type: string;
  identity_number: string;
  address: string;
  occupation: string;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_phone: string;
}

const curatedUsers: SeedUser[] = [
  {
    id: 'user-admin',
    email: 'admin@kosmo.com',
    passwordPlain: 'admin',
    name: 'Admin Super',
    role: 'admin',
    phone: '+62 888-8888-8888',
    paymentMethod: 'Virtual Account',
    identity_type: 'NIK',
    identity_number: '5171010000000001',
    address: 'Kantor Pusat KOSMO Bali, Jimbaran',
    occupation: 'Platform Administrator',
    emergency_contact_name: 'Support Center',
    emergency_contact_relation: 'Kantor',
    emergency_contact_phone: '+628888888888'
  },
  {
    id: 'user-landlord',
    email: 'landlord@kosmo.com',
    passwordPlain: 'landlord',
    name: 'Admin Landlord',
    role: 'landlord',
    phone: '+62 811-2233-4455',
    paymentMethod: 'Virtual Account',
    bankName: 'BCA',
    bankAccountNumber: '1234567890',
    bankAccountHolder: 'Admin Landlord',
    identity_type: 'NIK',
    identity_number: '5171012204850002',
    address: 'Jl. Raya Kampus Unud No. 88, Jimbaran, Badung, Bali',
    occupation: 'Pengelola Properti',
    emergency_contact_name: 'Wayan Landlord',
    emergency_contact_relation: 'Keluarga',
    emergency_contact_phone: '+6281122334400'
  },
  {
    id: 'user-tenant',
    email: 'tenant@kosmo.com',
    passwordPlain: 'tenant',
    name: 'Bayu',
    role: 'tenant',
    phone: '+62 812-3456-7890',
    paymentMethod: 'Virtual Account',
    identity_type: 'NIK',
    identity_number: '5171012308980001',
    address: 'Jl. Nuansa Utama No. 12, Jimbaran, Badung, Bali',
    occupation: 'Software Engineer',
    emergency_contact_name: 'Made Wipradnyana',
    emergency_contact_relation: 'Orang Tua',
    emergency_contact_phone: '+6281234567899'
  },
  {
    id: 'user-tenant-01',
    email: 'siska.pratiwi@gmail.com',
    passwordPlain: 'tenant',
    name: 'Siska Pratiwi',
    role: 'tenant',
    phone: '+62 813-1122-3344',
    paymentMethod: 'Virtual Account',
    identity_type: 'NIK',
    identity_number: '5171015502990003',
    address: 'Jl. Danau Buyan No. 24, Jimbaran, Badung, Bali',
    occupation: 'Graphic Designer',
    emergency_contact_name: 'Agus Pratiwi',
    emergency_contact_relation: 'Orang Tua',
    emergency_contact_phone: '+6281311223300'
  },
  {
    id: 'user-tenant-02',
    email: 'andrew.k@gmail.com',
    passwordPlain: 'tenant',
    name: 'Andrew Kurniawan',
    role: 'tenant',
    phone: '+62 819-3344-5566',
    paymentMethod: 'Virtual Account',
    identity_type: 'NIK',
    identity_number: '5171011806960004',
    address: 'Perumahan Taman Griya Blok D No. 5, Jimbaran, Badung, Bali',
    occupation: 'Financial Analyst',
    emergency_contact_name: 'Budi Kurniawan',
    emergency_contact_relation: 'Keluarga',
    emergency_contact_phone: '+6281933445500'
  },
  {
    id: 'user-tenant-03',
    email: 'michael.tan@gmail.com',
    passwordPlain: 'tenant',
    name: 'Michael Tan',
    role: 'tenant',
    phone: '+62 812-9876-5432',
    paymentMethod: 'Virtual Account',
    identity_type: 'NIK',
    identity_number: '5171011409970005',
    address: 'Jl. Raya Kampus Unud No. 15, Jimbaran, Badung, Bali',
    occupation: 'Mahasiswa Universitas Udayana',
    emergency_contact_name: 'Hendrik Tan',
    emergency_contact_relation: 'Orang Tua',
    emergency_contact_phone: '+6281298765400'
  },
  {
    id: 'user-tenant-04',
    email: 'aditya.w@gmail.com',
    passwordPlain: 'tenant',
    name: 'Aditya Wicaksono',
    role: 'tenant',
    phone: '+62 817-4567-8901',
    paymentMethod: 'Virtual Account',
    identity_type: 'NIK',
    identity_number: '5171012903950006',
    address: 'Jl. Goa Gong Gang Sandat No. 3, Jimbaran, Badung, Bali',
    occupation: 'Remote Product Designer',
    emergency_contact_name: 'Bambang Wicaksono',
    emergency_contact_relation: 'Orang Tua',
    emergency_contact_phone: '+6281745678900'
  },
  {
    id: 'user-tenant-05',
    email: 'ratna.dewi@gmail.com',
    passwordPlain: 'tenant',
    name: 'Ratna Dewi',
    role: 'tenant',
    phone: '+62 813-7788-9900',
    paymentMethod: 'Virtual Account',
    identity_type: 'NIK',
    identity_number: '5171016207980007',
    address: 'Jl. Nuansa Kori Utama No. 8, Jimbaran, Badung, Bali',
    occupation: 'Architect',
    emergency_contact_name: 'I Ketut Sudana',
    emergency_contact_relation: 'Keluarga',
    emergency_contact_phone: '+6281377889911'
  },
  {
    id: 'user-tenant-06',
    email: 'sarah.jenkins@gmail.com',
    passwordPlain: 'tenant',
    name: 'Sarah Jenkins',
    role: 'tenant',
    phone: '+62 812-4455-6677',
    paymentMethod: 'Virtual Account',
    identity_type: 'PASSPORT',
    identity_number: 'A12894672',
    address: 'Jl. Goa Gong No. 19, Jimbaran, Badung, Bali',
    occupation: 'Travel Blogger & Freelancer',
    emergency_contact_name: 'David Jenkins',
    emergency_contact_relation: 'Keluarga',
    emergency_contact_phone: '+6281244556600'
  }
];

const curatedProperties: SeedProperty[] = [
  {
    id: 'prop-01',
    name: 'Cove Nuansa Home Jimbaran',
    district: 'Badung',
    address: 'Jl. Nuansa Utama Perum Kori Nuansa II No. 9, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361',
    price: 4150000,
    rating: 4.8,
    image: 'https://media.coveliving.io/97696/conversions/Cove-Nuansa-Home_Deluxe-Room-with-Mezzanine-LTS(1)-medium.jpg',
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
    image: 'https://images.rukita.co/buildings/building/e3fea989-c2c.jpg',
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
    address: 'Jl. Uluwatu Gang Buanasari No. 88, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361',
    price: 3300000,
    rating: 4.8,
    image: 'https://images.rukita.co/buildings/roomvariantphoto/photo/3521c071-be76-4996-8393-88e9b31fc33d.jpeg',
    description: 'Coliving favorit mahasiswa dan remote worker di koridor Jl. Uluwatu dan Kampus Unud Jimbaran. Dekat dengan Sidewalk Jimbaran, RS Udayana, dan Pantai Jimbaran. Unit Studio Queen ber-AC, kamar mandi dalam dengan water heater, WiFi kencang, parkir mobil/motor luas, dan dapur bersama.',
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
    address: 'Gang Sandat No. 88, Jl. Goa Gong, Jimbaran, Kec. Kuta Selatan, Kabupaten Badung, Bali 80361',
    price: 2900000,
    rating: 4.8,
    image: 'https://picture.rumah123.com/r123-images/720x420-crop/customer/1641111/listing/kss277817/enhanced/df746c60190d4d88cba1a4dc2830badb.jpg',
    description: 'Kost eksklusif modern hanya 5 menit dari Rektorat Universitas Udayana Jimbaran dan GWK. Kamar full furnished dengan kasur 160x200, Smart TV 43 inch, meja belajar/kerja, kamar mandi dalam water heater, kulkas bersama per lantai, dan rooftop komunal dengan pemandangan patung GWK.',
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
    image: 'https://ik.imagekit.io/tvlk/apr-asset/dgXfoyh24ryQLRcGq00cIdKHRmotrWLNlvG-TxlcLxGkiDwaUSggleJNPRgIHCX6/hotel/asset/67737083-2880x2007-FIT_AND_TRIM-e28e81b4beba1539ef7cf13fbbae2300.jpeg',
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
    image: 'https://static.mamikos.com/uploads/cache/data/style/2025-08-22/njYasdIX-240x320.jpg',
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
    image: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/180467566.jpg?k=4da0fbd1923e0fc945f5414dbded7017b7cf03e298b8bc06999ffc55c874117a&o=',
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
    userId: 'user-tenant-01',
    userName: 'Siska Pratiwi',
    rating: 5,
    comment: 'Pelayanan sangat baik dan stafnya sangat ramah serta helpful. Kamarnya nyaman, bersih, wangi, dan fasilitasnya lengkap. Suasananya tenang di kawasan Taman Griya, cocok sekali untuk istirahat maupun kerja.',
    date: '14 Jul 2026'
  },
  {
    id: 'rev-02',
    propertyId: 'prop-01',
    propertyName: 'Cove Nuansa Home Jimbaran',
    userId: 'user-tenant-02',
    userName: 'Andrew Kurniawan',
    rating: 5,
    comment: 'Very clean and cozy room with aesthetic mezzanine design. The communal kitchen and rooftop are great. Dedicated fiber Wi-Fi is super fast and reliable. Staf ramah dan efisien membantu saat check-in.',
    date: '22 Jul 2026'
  },
  {
    id: 'rev-03',
    propertyId: 'prop-02',
    propertyName: 'Kawaii Home Jimbaran',
    userId: 'user-tenant',
    userName: 'Bayu',
    rating: 5,
    comment: 'Coliving yang nyaman dan bersih di Jimbaran. Desain interior modern dengan meja kerja ergonomis, pas banget buat WFH. Lokasi strategis dekat kampus Unud dan pantai Jimbaran, tim manajemen sangat responsif.',
    date: '29 Jul 2026'
  },
  {
    id: 'rev-04',
    propertyId: 'prop-03',
    propertyName: 'Jim\'s Coliving Jimbaran',
    userId: 'user-tenant-03',
    userName: 'Michael Tan',
    rating: 5,
    comment: 'Lokasi mantap di koridor Jl. Raya Kampus Unud Jimbaran, dekat dengan Sidewalk Jimbaran dan kampus. Unit Studio Queen bersih, AC dingin, water heater lancar, dan fasilitas dapur bersama sangat memudahkan.',
    date: '3 Agu 2026'
  },
  {
    id: 'rev-05',
    propertyId: 'prop-04',
    propertyName: 'Mari Living Jimbaran',
    userId: 'user-tenant-04',
    userName: 'Aditya Wicaksono',
    rating: 5,
    comment: 'Kost eksklusif yang tenang di area Goa Gong Jimbaran. Kamar mandi dalam bersih, Smart TV, dan rooftop view GWK yang bagus. Tempat parkir motor aman dan lingkungannya tenang.',
    date: '8 Agu 2026'
  },
  {
    id: 'rev-06',
    propertyId: 'prop-05',
    propertyName: 'Villa Kori Nuansa Jimbaran',
    userId: 'user-tenant-05',
    userName: 'Ratna Dewi',
    rating: 5,
    comment: 'Hunian bergaya villa di Taman Griya Jimbaran yang asri dan privat. Kolam renang bersih dan terawat, kamar tidur ber-AC luas dan nyaman. Sangat cocok untuk yang butuh ketenangan.',
    date: '12 Agu 2026'
  },
  {
    id: 'rev-07',
    propertyId: 'prop-07',
    propertyName: 'DSTAY Kost Bali Jimbaran',
    userId: 'user-tenant-06',
    userName: 'Sarah Jenkins',
    rating: 5,
    comment: 'Great value for money! The owner and staff are very friendly and welcoming. Clean, comfortable room with good AC. The rooftop kitchen with sunrise/sunset view of the GWK statue is amazing.',
    date: '18 Agu 2026'
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

    const preservedUserIds = curatedUsers.map((u) => `'${u.id}'`).join(', ');
    await connection.query(`DELETE FROM users WHERE id NOT IN (${preservedUserIds})`);

    // Reset user financial balances to 0.00 while preserving credentials & profile info
    await connection.query(`
      UPDATE users 
      SET balance = 0.00, totalRevenue = 0.00, totalWithdrawn = 0.00
    `);

    console.log('👤 Seeding canonical and authentic tenant reviewer accounts...');
    for (const u of curatedUsers) {
      const passwordHash = await bcrypt.hash(u.passwordPlain, 10);
      await connection.query(`
        INSERT INTO users (
          id, email, password, name, role, phone, paymentMethod, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder,
          identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_relation, emergency_contact_phone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 0.00, 0.00, 0.00, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      `, [
        u.id,
        u.email,
        passwordHash,
        u.name,
        u.role,
        u.phone,
        u.paymentMethod,
        u.bankName || '',
        u.bankAccountNumber || '',
        u.bankAccountHolder || '',
        u.identity_type,
        u.identity_number,
        u.address,
        u.occupation,
        u.emergency_contact_name,
        u.emergency_contact_relation,
        u.emergency_contact_phone
      ]);
    }

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
