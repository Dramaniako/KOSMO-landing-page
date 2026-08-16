import test from 'node:test';
import assert from 'node:assert/strict';

interface LandlordAccount {
  id: string;
  balance: number;
  totalWithdrawn: number;
}

function processWithdrawal(
  account: LandlordAccount,
  amount: number,
  bankName: string,
  accountNumber: string
): { success: boolean; message?: string; updatedBalance?: number; updatedTotalWithdrawn?: number } {
  if (!amount || !bankName || !accountNumber) {
    return { success: false, message: 'Jumlah, nama bank, dan nomor rekening wajib diisi.' };
  }

  if (amount <= 0 || isNaN(amount)) {
    return { success: false, message: 'Jumlah penarikan harus lebih besar dari 0.' };
  }

  if (account.balance < amount) {
    return { success: false, message: 'Saldo tidak mencukupi.' };
  }

  return {
    success: true,
    updatedBalance: account.balance - amount,
    updatedTotalWithdrawn: account.totalWithdrawn + amount
  };
}

function calculateOccupancyRate(totalRooms: number, occupiedRooms: number): number {
  if (totalRooms <= 0) return 0;
  return parseFloat(((occupiedRooms / totalRooms) * 100).toFixed(1));
}

test('Landlord withdrawals and financial calculations', async (t) => {
  await t.test('deducts balance and updates totalWithdrawn on valid withdrawal', () => {
    const account: LandlordAccount = {
      id: 'landlord-1',
      balance: 10000000,
      totalWithdrawn: 2000000
    };

    const result = processWithdrawal(account, 4000000, 'BCA', '1234567890');
    assert.equal(result.success, true);
    assert.equal(result.updatedBalance, 6000000);
    assert.equal(result.updatedTotalWithdrawn, 6000000);
  });

  await t.test('rejects withdrawal if amount exceeds balance', () => {
    const account: LandlordAccount = {
      id: 'landlord-1',
      balance: 1500000,
      totalWithdrawn: 500000
    };

    const result = processWithdrawal(account, 2000000, 'Mandiri', '9876543210');
    assert.equal(result.success, false);
    assert.equal(result.message, 'Saldo tidak mencukupi.');
  });

  await t.test('rejects negative or zero withdrawal amount', () => {
    const account: LandlordAccount = {
      id: 'landlord-1',
      balance: 5000000,
      totalWithdrawn: 0
    };

    assert.equal(processWithdrawal(account, -500000, 'BCA', '123').success, false);
    assert.equal(processWithdrawal(account, 0, 'BCA', '123').success, false);
  });

  await t.test('rejects missing bankName or accountNumber', () => {
    const account: LandlordAccount = {
      id: 'landlord-1',
      balance: 5000000,
      totalWithdrawn: 0
    };

    assert.equal(processWithdrawal(account, 1000000, '', '123').success, false);
    assert.equal(processWithdrawal(account, 1000000, 'BNI', '').success, false);
  });

  await t.test('calculates occupancy rate correctly', () => {
    assert.equal(calculateOccupancyRate(10, 8), 80.0);
    assert.equal(calculateOccupancyRate(3, 1), 33.3);
    assert.equal(calculateOccupancyRate(0, 0), 0);
    assert.equal(calculateOccupancyRate(5, 5), 100.0);
  });
});
