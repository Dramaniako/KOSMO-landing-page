import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateKosRoom,
  validateBooking,
  validateUser,
  validateProperty,
  validateReview
} from '../backend/types/index.ts';

test('KosRoom schema validation & boundary conditions', async (t) => {
  await t.test('valid KosRoom passes validation', () => {
    const validRoom = {
      id: 'room-101',
      name: 'Deluxe Studio Ubud',
      slug: 'deluxe-studio-ubud',
      address: 'Jl. Raya Ubud No. 12, Gianyar, Bali',
      pricePerMonth: 3500000.50,
      coordinates: {
        lat: -8.5069,
        lng: 115.2625
      },
      amenities: ['Wifi', 'AC', 'Kebersihan', 'Kolam renang'],
      roomType: 'campur',
      images: ['https://example.com/room1.jpg', 'https://example.com/room2.jpg'],
      isAvailable: true
    };

    const result = validateKosRoom(validRoom);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  await t.test('rejects missing or invalid fields in KosRoom', () => {
    const invalidRoom = {
      id: '',
      name: '',
      slug: 'invalid-room',
      address: 'No Address',
      pricePerMonth: -500,
      coordinates: { lat: 'invalid', lng: 115.2 },
      amenities: ['InvalidAmenity'],
      roomType: 'unknown_type',
      images: [123],
      isAvailable: 'yes'
    };

    const result = validateKosRoom(invalidRoom);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 6);
  });

  await t.test('rejects null or non-object KosRoom', () => {
    assert.equal(validateKosRoom(null).valid, false);
    assert.equal(validateKosRoom(undefined).valid, false);
    assert.equal(validateKosRoom('string').valid, false);
  });
});

test('Booking schema validation & duration boundaries', async (t) => {
  await t.test('valid Booking passes validation', () => {
    const validBooking = {
      id: 'book-001',
      roomId: 'room-101',
      userId: 'user-tenant-01',
      startDate: '2026-09-01',
      durationMonths: 6,
      status: 'confirmed',
      totalPrice: 21000000
    };

    const result = validateBooking(validBooking);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  await t.test('rejects invalid booking status, 0 duration, and negative price', () => {
    const invalidBooking = {
      id: 'book-002',
      roomId: 'room-101',
      userId: 'user-01',
      startDate: '2026-09-01',
      durationMonths: 0,
      status: 'invalid_status',
      totalPrice: -1000
    };

    const result = validateBooking(invalidBooking);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(err => err.includes('status')));
    assert.ok(result.errors.some(err => err.includes('durationMonths')));
    assert.ok(result.errors.some(err => err.includes('totalPrice')));
  });
});

test('User schema validation & role validation', async (t) => {
  await t.test('valid User passes validation across roles', () => {
    const validRoles = ['tenant', 'landlord', 'admin', 'owner'];
    for (const role of validRoles) {
      const user = {
        id: `user-${role}-001`,
        name: 'Bayu Wipradnyana',
        email: `bayu-${role}@kosmo.id`,
        phone: '+628123456789',
        role
      };
      const result = validateUser(user);
      assert.equal(result.valid, true, `Role ${role} should pass user validation`);
    }
  });

  await t.test('rejects invalid email, missing phone, or unauthorized role in User', () => {
    const invalidUser = {
      id: 'user-002',
      name: 'Unknown',
      email: 'not-an-email',
      phone: '',
      role: 'superadmin'
    };

    const result = validateUser(invalidUser);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(err => err.includes('email')));
    assert.ok(result.errors.some(err => err.includes('phone')));
    assert.ok(result.errors.some(err => err.includes('role')));
  });
});

test('Property schema validation & capacity/coordinate edge cases', async (t) => {
  const validProperty = {
    id: 'prop-101',
    name: 'KOSMO Seminyak Premium',
    district: 'Badung',
    address: 'Jl. Kayu Aya No. 20, Seminyak, Bali',
    price: 3500000,
    rating: 4.8,
    totalRooms: 10,
    occupiedRooms: 4,
    coordinates: { lat: -8.6833, lng: 115.1572 },
    images: ['https://example.com/p1.jpg'],
    facilities: ['Wifi', 'AC', 'Parkir'],
    ownerId: 'user-landlord-01'
  };

  await t.test('valid Property passes schema validation', () => {
    const result = validateProperty(validProperty);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  await t.test('rejects negative or zero price and 0 total rooms', () => {
    const invalidProp = {
      ...validProperty,
      price: -100,
      totalRooms: 0
    };
    const result = validateProperty(invalidProp);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(err => err.includes('price')));
    assert.ok(result.errors.some(err => err.includes('totalRooms')));
  });

  await t.test('rejects occupiedRooms exceeding totalRooms or negative occupiedRooms', () => {
    const overbookedProp = {
      ...validProperty,
      totalRooms: 5,
      occupiedRooms: 7
    };
    const result = validateProperty(overbookedProp);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(err => err.includes('occupiedRooms cannot exceed totalRooms')));

    const negativeOccupancyProp = {
      ...validProperty,
      occupiedRooms: -2
    };
    assert.equal(validateProperty(negativeOccupancyProp).valid, false);
  });

  await t.test('rejects out-of-bounds geographic coordinates', () => {
    const invalidLat = {
      ...validProperty,
      coordinates: { lat: 105.0, lng: 115.1572 }
    };
    assert.equal(validateProperty(invalidLat).valid, false);

    const invalidLng = {
      ...validProperty,
      coordinates: { lat: -8.6833, lng: 200.0 }
    };
    assert.equal(validateProperty(invalidLng).valid, false);
  });
});

test('Review schema validation & rating boundaries', async (t) => {
  const validReview = {
    id: 'rev-001',
    propertyId: 'prop-101',
    userName: 'Ahmad Fauzi',
    rating: 5,
    date: '16 Agu 2026',
    comment: 'Fasilitas sangat lengkap dan suasana nyaman!'
  };

  await t.test('valid Review passes validation', () => {
    const result = validateReview(validReview);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  await t.test('rejects rating below 1 or above 5', () => {
    const lowRating = { ...validReview, rating: 0 };
    const highRating = { ...validReview, rating: 6 };

    assert.equal(validateReview(lowRating).valid, false);
    assert.equal(validateReview(highRating).valid, false);
  });

  await t.test('rejects missing comment or empty propertyId', () => {
    const invalidReview = {
      ...validReview,
      propertyId: '',
      comment: '   '
    };
    const result = validateReview(invalidReview);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(err => err.includes('propertyId')));
    assert.ok(result.errors.some(err => err.includes('comment')));
  });
});
