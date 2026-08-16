import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyMidtransSignature } from '../backend/router.ts';

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
});
