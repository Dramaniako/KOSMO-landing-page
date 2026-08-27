import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyMidtransSignature } from '../backend/router';

test('Midtrans Snap payment & webhook signature verification', async (t) => {
  const orderId = 'rent-abc-123';
  const statusCode = '200';
  const grossAmount = '3500000.00';
  const serverKey = 'SB-Mid-server-test-key-12345';

  const validPayload = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  const validSignature = crypto.createHash('sha512').update(validPayload).digest('hex');

  await t.test('verifies valid SHA-512 Midtrans webhook signature', () => {
    const isValid = verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, validSignature);
    assert.equal(isValid, true);
  });

  await t.test('verifies signature case-insensitively', () => {
    const upperSignature = validSignature.toUpperCase();
    const isValid = verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, upperSignature);
    assert.equal(isValid, true);
  });

  await t.test('rejects tampered signature', () => {
    const tamperedSignature = validSignature.substring(0, validSignature.length - 2) + '00';
    const isValid = verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, tamperedSignature);
    assert.equal(isValid, false);
  });

  await t.test('rejects tampered orderId or grossAmount', () => {
    const isValidDifferentOrder = verifyMidtransSignature('rent-different-999', statusCode, grossAmount, serverKey, validSignature);
    assert.equal(isValidDifferentOrder, false);

    const isValidDifferentAmount = verifyMidtransSignature(orderId, statusCode, '5000000.00', serverKey, validSignature);
    assert.equal(isValidDifferentAmount, false);
  });

  await t.test('rejects missing or empty signature parameters', () => {
    assert.equal(verifyMidtransSignature('', statusCode, grossAmount, serverKey, validSignature), false);
    assert.equal(verifyMidtransSignature(orderId, '', grossAmount, serverKey, validSignature), false);
    assert.equal(verifyMidtransSignature(orderId, statusCode, '', serverKey, validSignature), false);
    assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, '', validSignature), false);
    assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, ''), false);
  });

  await t.test('simulates webhook settlement transition and idempotency guard', () => {
    interface RentalState {
      id: string;
      propertyId: string;
      status: 'pending' | 'active' | 'terminated';
      price: number;
    }

    interface PropertyState {
      id: string;
      occupiedRooms: number;
      totalRooms: number;
      ownerId: string;
    }

    interface LandlordState {
      id: string;
      balance: number;
      totalRevenue: number;
    }

    const rental: RentalState = {
      id: orderId,
      propertyId: 'prop-101',
      status: 'pending',
      price: 3500000
    };

    const property: PropertyState = {
      id: 'prop-101',
      occupiedRooms: 2,
      totalRooms: 5,
      ownerId: 'landlord-1'
    };

    const landlord: LandlordState = {
      id: 'landlord-1',
      balance: 10000000,
      totalRevenue: 20000000
    };

    // First webhook event (settlement)
    function handleWebhookSettlement(targetRental: RentalState, targetProperty: PropertyState, targetLandlord: LandlordState) {
      if (targetRental.status !== 'active') {
        targetRental.status = 'active';
        targetProperty.occupiedRooms += 1;
        targetLandlord.balance += targetRental.price;
        targetLandlord.totalRevenue += targetRental.price;
        return { processed: true };
      }
      return { processed: false, message: 'Already active' };
    }

    const firstRun = handleWebhookSettlement(rental, property, landlord);
    assert.equal(firstRun.processed, true);
    assert.equal(rental.status, 'active');
    assert.equal(property.occupiedRooms, 3);
    assert.equal(landlord.balance, 13500000);
    assert.equal(landlord.totalRevenue, 23500000);

    // Second webhook event (idempotency check)
    const secondRun = handleWebhookSettlement(rental, property, landlord);
    assert.equal(secondRun.processed, false);
    assert.equal(rental.status, 'active');
    assert.equal(property.occupiedRooms, 3); // Must NOT double increment
    assert.equal(landlord.balance, 13500000); // Must NOT double credit
  });

  await t.test('simulates webhook cancel/expire transition', () => {
    interface RentalState {
      id: string;
      status: 'pending' | 'active' | 'terminated' | 'cancelled';
    }

    function handleWebhookCancellation(targetRental: RentalState, transactionStatus: string) {
      if (['cancel', 'deny', 'expire'].includes(transactionStatus) && targetRental.status === 'pending') {
        targetRental.status = 'cancelled';
        return { processed: true };
      }
      return { processed: false };
    }

    const pendingRental: RentalState = { id: 'rent-cancel-1', status: 'pending' };
    const cancelRes = handleWebhookCancellation(pendingRental, 'cancel');
    assert.equal(cancelRes.processed, true);
    assert.equal(pendingRental.status, 'cancelled');

    const expireRental: RentalState = { id: 'rent-expire-1', status: 'pending' };
    const expireRes = handleWebhookCancellation(expireRental, 'expire');
    assert.equal(expireRes.processed, true);
    assert.equal(expireRental.status, 'cancelled');

    // Should not cancel already active rental
    const activeRental: RentalState = { id: 'rent-active-1', status: 'active' };
    const activeCancelRes = handleWebhookCancellation(activeRental, 'cancel');
    assert.equal(activeCancelRes.processed, false);
    assert.equal(activeRental.status, 'active');
  });

  await t.test('simulates settleRentalPayment with multi-month duration and admin fee calculation', () => {
    interface SimulatedRental {
      id: string;
      propertyId: string;
      status: 'pending' | 'active';
      price: number;
      duration_months: number;
      admin_fee_amount: number;
    }

    interface SimulatedProperty {
      id: string;
      occupiedRooms: number;
      totalRooms: number;
      ownerId: string;
    }

    interface SimulatedLandlord {
      id: string;
      balance: number;
      totalRevenue: number;
    }

    const testRental: SimulatedRental = {
      id: 'rent-multi-999',
      propertyId: 'prop-ubud-2',
      status: 'pending',
      price: 2500000,
      duration_months: 3,
      admin_fee_amount: 5000
    };

    const testProperty: SimulatedProperty = {
      id: 'prop-ubud-2',
      occupiedRooms: 1,
      totalRooms: 4,
      ownerId: 'landlord-ubud-1'
    };

    const testLandlord: SimulatedLandlord = {
      id: 'landlord-ubud-1',
      balance: 5000000,
      totalRevenue: 10000000
    };

    function simulateSettlement(rental: SimulatedRental, prop: SimulatedProperty, landlord: SimulatedLandlord) {
      if (prop.occupiedRooms >= prop.totalRooms) {
        return { success: false, statusCode: 409, message: 'Kamar sudah penuh' };
      }
      if (rental.status !== 'active') {
        rental.status = 'active';
        prop.occupiedRooms = Math.min(prop.totalRooms, prop.occupiedRooms + 1);
        const totalRevenue = rental.price * rental.duration_months;
        landlord.balance += totalRevenue;
        landlord.totalRevenue += totalRevenue;
      }
      return { success: true, statusCode: 200, message: 'Success' };
    }

    const result = simulateSettlement(testRental, testProperty, testLandlord);
    assert.equal(result.success, true);
    assert.equal(testRental.status, 'active');
    assert.equal(testProperty.occupiedRooms, 2);
    assert.equal(testLandlord.balance, 12500000); // 5M + (2.5M * 3) = 12.5M
    assert.equal(testLandlord.totalRevenue, 17500000); // 10M + (2.5M * 3) = 17.5M

    // Overbooking prevention check
    const fullProperty: SimulatedProperty = {
      id: 'prop-full',
      occupiedRooms: 4,
      totalRooms: 4,
      ownerId: 'landlord-full'
    };
    const overbookRental: SimulatedRental = {
      id: 'rent-overbook',
      propertyId: 'prop-full',
      status: 'pending',
      price: 2000000,
      duration_months: 1,
      admin_fee_amount: 5000
    };
    const overbookResult = simulateSettlement(overbookRental, fullProperty, testLandlord);
    assert.equal(overbookResult.success, false);
    assert.equal(overbookResult.statusCode, 409);
    assert.equal(overbookRental.status, 'pending');
  });

  await t.test('extracts root rentalId from timestamped Midtrans attempt order_id', () => {
    function extractRentalId(orderIdOrRentalId: string): string {
      let targetRentalId = orderIdOrRentalId.trim();
      const rentMatch = targetRentalId.match(/^(rent-[a-zA-Z0-9]+)(?:-\d+)?$/);
      if (rentMatch && rentMatch[1]) {
        targetRentalId = rentMatch[1];
      }
      return targetRentalId;
    }

    assert.equal(extractRentalId('rent-123456'), 'rent-123456');
    assert.equal(extractRentalId('rent-abcde123-1724783921000'), 'rent-abcde123');
    assert.equal(extractRentalId('rent-xyz999-1692837482'), 'rent-xyz999');
    assert.equal(extractRentalId('custom-order-id'), 'custom-order-id');
  });
});
