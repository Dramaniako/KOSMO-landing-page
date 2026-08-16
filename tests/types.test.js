import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateKosRoom,
  validateBooking,
  validateUser,
  VALID_ROOM_TYPES,
  VALID_BOOKING_STATUSES,
  VALID_USER_ROLES,
  VALID_AMENITIES
} from '../backend/types/index.ts';

test('KosRoom schema validation', async (t) => {
  await t.test('valid KosRoom passes validation', () => {
    const validRoom = {
      id: 'room-101',
      name: 'Deluxe Studio Ubud',
      slug: 'deluxe-studio-ubud',
      address: 'Jl. Raya Ubud No. 12, Gianyar, Bali',
      pricePerMonth: 3500000,
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
    const result = validateKosRoom(null);
    assert.equal(result.valid, false);
  });
});

test('Booking schema validation', async (t) => {
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

  await t.test('rejects invalid booking status and negative values', () => {
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

test('User schema validation', async (t) => {
  await t.test('valid User passes validation', () => {
    const validUser = {
      id: 'user-001',
      name: 'Bayu Wipradnyana',
      email: 'bayu@kosmo.id',
      phone: '+628123456789',
      role: 'tenant'
    };

    const result = validateUser(validUser);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  await t.test('rejects invalid email or role in User', () => {
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
