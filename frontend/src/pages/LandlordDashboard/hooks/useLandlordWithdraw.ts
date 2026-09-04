import { useState } from 'react';
import { User } from '../../../types/index';
import { WithdrawFormState } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useLandlordWithdraw(
  landlordUser: User | null,
  setLandlordUser: React.Dispatch<React.SetStateAction<User | null>>,
  fetchOverviewStats: (landlordId: string) => Promise<void>
) {
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  const [withdrawForm, setWithdrawForm] = useState<WithdrawFormState>(() => ({
    amount: '',
    bankName: 'BCA',
    accountNumber: landlordUser?.bankAccountNumber || ''
  }));

  const handleWithdrawSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!landlordUser) return;
    if (!withdrawForm.amount || parseFloat(withdrawForm.amount) <= 0) {
      alert("Masukkan jumlah penarikan yang valid.");
      return;
    }
    const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token') || '';
    try {
      const res = await fetch(`${API_BASE}/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          ...withdrawForm,
          userId: landlordUser.id
        })
      });
      const data = (await res.json()) as { message: string; balance: number; totalWithdrawn: number };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowWithdrawModal(false);
      setWithdrawForm((prev) => ({ ...prev, amount: '' }));

      const updatedUser: User = {
        ...landlordUser,
        balance: data.balance,
        totalWithdrawn: data.totalWithdrawn
      };
      setLandlordUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));

      await fetchOverviewStats(landlordUser.id);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  return {
    showWithdrawModal,
    setShowWithdrawModal,
    withdrawForm,
    setWithdrawForm,
    handleWithdrawSubmit
  };
}
