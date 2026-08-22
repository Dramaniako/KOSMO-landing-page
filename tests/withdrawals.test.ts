import test from 'node:test';
import assert from 'node:assert/strict';

interface LandlordAccount {
  id: string;
  balance: number;
  totalWithdrawn: number;
}

interface WithdrawalRecord {
  id: string;
  userId: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountHolder?: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  referenceId?: string;
  rejectionReason?: string;
  processedAt?: string;
}

function processWithdrawal(
  account: LandlordAccount,
  amount: number,
  bankName: string,
  accountNumber: string,
  accountHolder = ''
): { success: boolean; message?: string; updatedBalance?: number; updatedTotalWithdrawn?: number; withdrawal?: WithdrawalRecord } {
  if (!amount || !bankName || !accountNumber) {
    return { success: false, message: 'Jumlah, nama bank, dan nomor rekening wajib diisi.' };
  }

  if (amount <= 0 || isNaN(amount)) {
    return { success: false, message: 'Jumlah penarikan harus lebih besar dari 0.' };
  }

  if (account.balance < amount) {
    return { success: false, message: 'Saldo tidak mencukupi.' };
  }

  const updatedBalance = account.balance - amount;
  const updatedTotalWithdrawn = account.totalWithdrawn; // Only updated on completed

  const withdrawal: WithdrawalRecord = {
    id: `w-${Math.random().toString(36).substring(2, 8)}`,
    userId: account.id,
    amount,
    bankName,
    accountNumber,
    accountHolder,
    status: 'pending'
  };

  return {
    success: true,
    updatedBalance,
    updatedTotalWithdrawn,
    withdrawal
  };
}

function processAdminDisbursement(
  withdrawal: WithdrawalRecord,
  account?: LandlordAccount,
  targetStatus: 'processing' | 'completed' = 'completed'
): { success: boolean; message?: string; updatedStatus?: 'processing' | 'completed' | 'rejected'; referenceId?: string } {
  if (withdrawal.status === 'completed') {
    return { success: false, message: 'Penarikan sudah berhasil diproses sebelumnya.' };
  }
  if (withdrawal.status === 'rejected') {
    return { success: false, message: 'Penarikan yang sudah ditolak tidak dapat diproses.' };
  }

  if (targetStatus === 'completed' && account) {
    account.totalWithdrawn += withdrawal.amount;
  }

  withdrawal.status = targetStatus;
  withdrawal.referenceId = withdrawal.referenceId || `REF-${Date.now()}`;
  withdrawal.processedAt = new Date().toISOString();
  return { success: true, updatedStatus: targetStatus, referenceId: withdrawal.referenceId };
}

function rejectAdminDisbursement(
  withdrawal: WithdrawalRecord,
  account: LandlordAccount,
  reason = 'Pencairan ditolak admin'
): { success: boolean; message?: string; updatedBalance?: number; updatedTotalWithdrawn?: number } {
  if (withdrawal.status === 'rejected') {
    return { success: false, message: 'Penarikan sudah pernah ditolak.' };
  }
  if (withdrawal.status === 'completed') {
    return { success: false, message: 'Penarikan yang sudah selesai tidak dapat ditolak.' };
  }

  withdrawal.status = 'rejected';
  withdrawal.rejectionReason = reason;
  withdrawal.processedAt = new Date().toISOString();
  account.balance += withdrawal.amount;

  return {
    success: true,
    updatedBalance: account.balance,
    updatedTotalWithdrawn: account.totalWithdrawn
  };
}

function calculateOccupancyRate(totalRooms: number, occupiedRooms: number): number {
  if (totalRooms <= 0) return 0;
  return parseFloat(((occupiedRooms / totalRooms) * 100).toFixed(1));
}

test('Landlord withdrawals and financial calculations', async (t) => {
  await t.test('deducts balance and creates pending withdrawal record', () => {
    const account: LandlordAccount = {
      id: 'landlord-1',
      balance: 10000000,
      totalWithdrawn: 2000000
    };

    const result = processWithdrawal(account, 4000000, 'BCA', '1234567890', 'Pak Budi');
    assert.equal(result.success, true);
    assert.equal(result.updatedBalance, 6000000);
    assert.equal(result.updatedTotalWithdrawn, 2000000);
    assert.equal(result.withdrawal?.status, 'pending');
    assert.equal(result.withdrawal?.accountHolder, 'Pak Budi');
  });

  await t.test('admin can transition pending withdrawal to processing then completed', () => {
    const account: LandlordAccount = {
      id: 'landlord-1',
      balance: 7000000,
      totalWithdrawn: 1000000
    };

    const withdrawal: WithdrawalRecord = {
      id: 'w-101',
      userId: 'landlord-1',
      amount: 3000000,
      bankName: 'Mandiri',
      accountNumber: '1122334455',
      status: 'pending'
    };

    const resProcessing = processAdminDisbursement(withdrawal, account, 'processing');
    assert.equal(resProcessing.success, true);
    assert.equal(withdrawal.status, 'processing');
    assert.equal(account.totalWithdrawn, 1000000);
    assert.ok(withdrawal.referenceId?.startsWith('REF-'));

    const resCompleted = processAdminDisbursement(withdrawal, account, 'completed');
    assert.equal(resCompleted.success, true);
    assert.equal(withdrawal.status, 'completed');
    assert.equal(account.totalTotalWithdrawn || account.totalWithdrawn, 4000000);
  });

  await t.test('admin rejection reverses deducted funds and leaves totalWithdrawn intact', () => {
    const account: LandlordAccount = {
      id: 'landlord-1',
      balance: 6000000,
      totalWithdrawn: 4000000
    };

    const pendingWithdrawal: WithdrawalRecord = {
      id: 'w-102',
      userId: 'landlord-1',
      amount: 4000000,
      bankName: 'BCA',
      accountNumber: '123456',
      status: 'pending'
    };

    const result = rejectAdminDisbursement(pendingWithdrawal, account, 'Rekening tidak valid');
    assert.equal(result.success, true);
    assert.equal(pendingWithdrawal.status, 'rejected');
    assert.equal(pendingWithdrawal.rejectionReason, 'Rekening tidak valid');
    assert.equal(result.updatedBalance, 10000000);
    assert.equal(result.updatedTotalWithdrawn, 4000000);
  });

  await t.test('prevents rejecting an already completed withdrawal', () => {
    const account: LandlordAccount = {
      id: 'landlord-1',
      balance: 5000000,
      totalWithdrawn: 5000000
    };

    const completedWithdrawal: WithdrawalRecord = {
      id: 'w-103',
      userId: 'landlord-1',
      amount: 2000000,
      bankName: 'BCA',
      accountNumber: '123456',
      status: 'completed'
    };

    const result = rejectAdminDisbursement(completedWithdrawal, account);
    assert.equal(result.success, false);
    assert.equal(result.message, 'Penarikan yang sudah selesai tidak dapat ditolak.');
  });

  await t.test('prevents processing an already rejected withdrawal', () => {
    const rejectedWithdrawal: WithdrawalRecord = {
      id: 'w-104',
      userId: 'landlord-1',
      amount: 1000000,
      bankName: 'BCA',
      accountNumber: '123456',
      status: 'rejected'
    };

    const result = processAdminDisbursement(rejectedWithdrawal);
    assert.equal(result.success, false);
    assert.equal(result.message, 'Penarikan yang sudah ditolak tidak dapat diproses.');
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

  await t.test('rejects negative, zero, or NaN withdrawal amount', () => {
    const account: LandlordAccount = {
      id: 'landlord-1',
      balance: 5000000,
      totalWithdrawn: 0
    };

    assert.equal(processWithdrawal(account, -500000, 'BCA', '123').success, false);
    assert.equal(processWithdrawal(account, 0, 'BCA', '123').success, false);
    assert.equal(processWithdrawal(account, NaN, 'BCA', '123').success, false);
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
