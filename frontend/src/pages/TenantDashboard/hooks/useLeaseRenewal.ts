import { useState, useCallback } from 'react';
import { Rental, User } from '../../../types/index';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

interface UseLeaseRenewalParams {
  currentUser: User | null;
  onRefreshRentals: (userId: string) => Promise<void>;
}

export function useLeaseRenewal({ currentUser, onRefreshRentals }: UseLeaseRenewalParams) {
  const [isRenewing, setIsRenewing] = useState<boolean>(false);
  const [renewError, setRenewError] = useState<string | null>(null);

  const handleRenewRental = useCallback(async (rental: Rental): Promise<void> => {
    if (!currentUser) return;
    setIsRenewing(true);
    setRenewError(null);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const res = await fetch(`${API_BASE}/rentals/${encodeURIComponent(rental.id)}/renew-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ months: 1 })
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message || 'Gagal memproses perpanjangan sewa.');
      }

      const data = (await res.json()) as { token?: string; snapToken?: string };
      const snapToken = data.token || data.snapToken;

      if (!snapToken) {
        throw new Error('Token pembayaran Midtrans tidak diterima dari server.');
      }

      if (typeof window === 'undefined' || !window.snap) {
        throw new Error('Midtrans Snap SDK belum dimuat. Silakan muat ulang halaman.');
      }

      window.snap.pay(snapToken, {
        onSuccess: async (result: unknown) => {
          console.log('[Snap] Renewal settlement success:', result);
          try {
            await onRefreshRentals(currentUser.id);
          } catch (refreshErr) {
            console.error('Failed to refresh rentals after renewal:', refreshErr);
          }
        },
        onPending: (result: unknown) => {
          console.log('[Snap] Renewal payment pending:', result);
        },
        onError: (err: unknown) => {
          console.error('[Snap] Renewal payment error:', err);
          setRenewError('Pembayaran gagal atau dibatalkan.');
        },
        onClose: () => {
          console.log('[Snap] Popup closed by user.');
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Renew rental error:', msg);
      setRenewError(msg);
      alert(msg);
    } finally {
      setIsRenewing(false);
    }
  }, [currentUser, onRefreshRentals]);

  return {
    isRenewing,
    renewError,
    handleRenewRental
  };
}
