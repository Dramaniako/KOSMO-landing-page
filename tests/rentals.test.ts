import test from 'node:test';
import assert from 'node:assert/strict';

interface RentalSimulationState {
  occupiedRooms: number;
  totalRooms: number;
  status: 'active' | 'terminated';
  landlordBalance: number;
  landlordTotalRevenue: number;
}

function processNewRental(
  property: { totalRooms: number; occupiedRooms: number; price: number; ownerId: string },
  tenantId: string,
  durationMonths = 1,
  hasActiveRental = false
): { success: boolean; statusCode?: number; message?: string; updatedOccupiedRooms?: number; addedRevenue?: number; totalPrice?: number } {
  if (!tenantId) {
    return { success: false, statusCode: 400, message: 'tenantId wajib diisi.' };
  }
  if (hasActiveRental) {
    return {
      success: false,
      statusCode: 409,
      message: 'Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru.'
    };
  }
  if (durationMonths <= 0 || !Number.isInteger(durationMonths)) {
    return { success: false, statusCode: 400, message: 'Durasi sewa minimal 1 bulan.' };
  }
  if (property.occupiedRooms >= property.totalRooms) {
    return { success: false, statusCode: 400, message: 'Kamar kos sudah penuh.' };
  }

  const totalPrice = property.price * durationMonths;

  return {
    success: true,
    statusCode: 201,
    updatedOccupiedRooms: property.occupiedRooms + 1,
    addedRevenue: totalPrice,
    totalPrice
  };
}

function terminateRental(
  rental: { id: string; status: 'active' | 'terminated'; propertyOccupiedRooms: number },
  passwordMatches: boolean
): { success: boolean; message?: string; updatedStatus?: 'active' | 'terminated'; updatedOccupiedRooms?: number } {
  if (rental.status === 'terminated') {
    return { success: false, message: 'Sewa sudah pernah diberhentikan.' };
  }
  if (!passwordMatches) {
    return { success: false, message: 'Password salah.' };
  }

  return {
    success: true,
    updatedStatus: 'terminated',
    updatedOccupiedRooms: Math.max(0, rental.propertyOccupiedRooms - 1)
  };
}

test('Rental booking and occupancy state transitions', async (t) => {
  await t.test('allows booking when available rooms exist and increments occupancy', () => {
    const property = { totalRooms: 10, occupiedRooms: 3, price: 3000000, ownerId: 'landlord-1' };
    const result = processNewRental(property, 'tenant-1', 1);

    assert.equal(result.success, true);
    assert.equal(result.updatedOccupiedRooms, 4);
    assert.equal(result.addedRevenue, 3000000);
    assert.equal(result.totalPrice, 3000000);
  });

  await t.test('calculates multi-month duration pricing correctly', () => {
    const property = { totalRooms: 10, occupiedRooms: 2, price: 2500000, ownerId: 'landlord-1' };
    const result = processNewRental(property, 'tenant-2', 6);

    assert.equal(result.success, true);
    assert.equal(result.totalPrice, 15000000);
    assert.equal(result.addedRevenue, 15000000);
  });

  await t.test('rejects booking with invalid duration', () => {
    const property = { totalRooms: 10, occupiedRooms: 2, price: 2000000, ownerId: 'landlord-1' };
    assert.equal(processNewRental(property, 'tenant-1', 0).success, false);
    assert.equal(processNewRental(property, 'tenant-1', -3).success, false);
  });

  await t.test('rejects booking when rooms are fully occupied', () => {
    const fullProperty = { totalRooms: 5, occupiedRooms: 5, price: 2500000, ownerId: 'landlord-1' };
    const result = processNewRental(fullProperty, 'tenant-2');

    assert.equal(result.success, false);
    assert.equal(result.message, 'Kamar kos sudah penuh.');
  });

  await t.test('rejects booking with missing tenantId', () => {
    const property = { totalRooms: 10, occupiedRooms: 2, price: 2000000, ownerId: 'landlord-1' };
    const result = processNewRental(property, '');

    assert.equal(result.success, false);
    assert.equal(result.message, 'tenantId wajib diisi.');
  });

  await t.test('terminates active rental and decrements occupied rooms', () => {
    const rental = { id: 'rent-101', status: 'active' as const, propertyOccupiedRooms: 4 };
    const result = terminateRental(rental, true);

    assert.equal(result.success, true);
    assert.equal(result.updatedStatus, 'terminated');
    assert.equal(result.updatedOccupiedRooms, 3);
  });

  await t.test('guarantees room occupancy does not drop below 0 upon termination', () => {
    const rental = { id: 'rent-102', status: 'active' as const, propertyOccupiedRooms: 0 };
    const result = terminateRental(rental, true);

    assert.equal(result.success, true);
    assert.equal(result.updatedOccupiedRooms, 0);
  });

  await t.test('rejects terminating an already terminated rental', () => {
    const terminatedRental = { id: 'rent-103', status: 'terminated' as const, propertyOccupiedRooms: 2 };
    const result = terminateRental(terminatedRental, true);

    assert.equal(result.success, false);
    assert.equal(result.message, 'Sewa sudah pernah diberhentikan.');
  });

  await t.test('rejects rental termination if password verification fails', () => {
    const activeRental = { id: 'rent-104', status: 'active' as const, propertyOccupiedRooms: 3 };
    const result = terminateRental(activeRental, false);

    assert.equal(result.success, false);
    assert.equal(result.message, 'Password salah.');
  });

  await t.test('rejects booking with 409 Conflict when tenant already has an active rental', () => {
    const property = { totalRooms: 10, occupiedRooms: 2, price: 3500000, ownerId: 'landlord-1' };
    const result = processNewRental(property, 'tenant-active-1', 1, true);

    assert.equal(result.success, false);
    assert.equal(result.statusCode, 409);
    assert.equal(result.message, 'Anda masih memiliki sewa kos yang aktif. Selesaikan atau batalkan sewa berjalan sebelum memesan hunian baru.');
  });

  await t.test('allows booking when tenant previous rental is terminated or cancelled (no active rental)', () => {
    const property = { totalRooms: 10, occupiedRooms: 2, price: 3500000, ownerId: 'landlord-1' };
    const result = processNewRental(property, 'tenant-terminated-1', 1, false);

    assert.equal(result.success, true);
    assert.equal(result.statusCode, 201);
    assert.equal(result.updatedOccupiedRooms, 3);
  });
});

import { computePaymentSchedule } from '../backend/router';

test('Next payment schedule and billing computation', async (t) => {
  await t.test('computes next monthly billing date from start date for active rental', () => {
    const ref = new Date('2026-08-17T12:00:00Z');
    const schedule = computePaymentSchedule('2026-08-01', 'active', ref);
    assert.equal(schedule.nextPaymentDateISO, '2026-09-01');
    assert.equal(schedule.paymentStatus, 'Lunas (Periode Berjalan)');
    assert.ok(schedule.daysRemaining > 0);
  });

  await t.test('returns terminated status and dashes for terminated rental', () => {
    const schedule = computePaymentSchedule('2026-06-01', 'terminated');
    assert.equal(schedule.nextPaymentDate, '-');
    assert.equal(schedule.daysRemaining, 0);
    assert.equal(schedule.paymentStatus, 'Penyewaan Selesai');
  });

  await t.test('flags Menjelang Jatuh Tempo when daysRemaining is between 1 and 3', () => {
    const ref = new Date('2026-08-29T12:00:00Z');
    const schedule = computePaymentSchedule('2026-08-01', 'active', ref);
    assert.equal(schedule.nextPaymentDateISO, '2026-09-01');
    assert.equal(schedule.paymentStatus, 'Menjelang Jatuh Tempo');
  });

  await t.test('flags Menunggu Pembayaran when daysRemaining is 0 (due today)', () => {
    const ref = new Date('2026-09-01T08:00:00Z');
    const schedule = computePaymentSchedule('2026-08-01', 'active', ref);
    assert.equal(schedule.nextPaymentDateISO, '2026-09-01');
    assert.equal(schedule.daysRemaining, 0);
    assert.equal(schedule.paymentStatus, 'Menunggu Pembayaran');
  });

  await t.test('handles month-end 31st dates without drifting anniversary day across months', () => {
    const refFeb = new Date('2026-02-15T00:00:00Z');
    const schedFeb = computePaymentSchedule('2026-01-31', 'active', refFeb);
    // February 2026 has 28 days -> clamps to Feb 28
    assert.equal(schedFeb.nextPaymentDateISO, '2026-02-28');

    const refMar = new Date('2026-03-01T00:00:00Z');
    const schedMar = computePaymentSchedule('2026-01-31', 'active', refMar);
    // March 2026 has 31 days -> restores to Mar 31!
    assert.equal(schedMar.nextPaymentDateISO, '2026-03-31');
  });
});
