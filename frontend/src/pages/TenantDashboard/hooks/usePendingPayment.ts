import { useState } from 'react';
import { User, Rental } from '../../../types/index';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

interface UsePendingPaymentParams {
  currentUser: User | null;
  onRefreshRentals: (userId: string) => Promise<void>;
}

export function usePendingPayment({
  currentUser,
  onRefreshRentals
}: UsePendingPaymentParams) {
  const [showPendingPaymentModal, setShowPendingPaymentModal] = useState<boolean>(false);
  const [selectedPendingRental, setSelectedPendingRental] = useState<Rental | null>(null);
  const [pendingPaymentProcessing, setPendingPaymentProcessing] = useState<boolean>(false);
  const [pendingPaymentError, setPendingPaymentError] = useState<string | null>(null);

  const handleOpenPendingPayment = (rental: Rental): void => {
    setSelectedPendingRental(rental);
    setPendingPaymentError(null);
    setShowPendingPaymentModal(true);
  };

  const handleClosePendingPayment = (): void => {
    if (!pendingPaymentProcessing) {
      setShowPendingPaymentModal(false);
      setSelectedPendingRental(null);
    }
  };

  const handleProcessPendingPayment = async (): Promise<void> => {
    if (!selectedPendingRental || !currentUser) return;
    setPendingPaymentProcessing(true);
    setPendingPaymentError(null);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const duration = Number(selectedPendingRental.duration_months || 1);
      const tokenRes = await fetch(`${API_BASE}/payment/token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          propertyId: selectedPendingRental.propertyId,
          propertyName: selectedPendingRental.propertyName,
          price: selectedPendingRental.price,
          tenantId: currentUser.id,
          tenantName: currentUser.name,
          tenantEmail: currentUser.email,
          durationMonths: duration,
          rentalId: selectedPendingRental.id
        })
      });

      if (!tokenRes.ok) {
        const errorData = (await tokenRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorData.message || 'Gagal menyiapkan transaksi pembayaran.');
      }

      const tokenData = (await tokenRes.json()) as {
        token?: string;
        snapToken?: string;
        rentalId: string;
      };
      const targetRentalId = selectedPendingRental.id;
      const snapToken = tokenData.snapToken || tokenData.token;

      if (!snapToken) {
        throw new Error('Token pembayaran tidak ditemukan dari server.');
      }

      if (typeof window === 'undefined' || !window.snap) {
        throw new Error('Midtrans Payment Gateway belum siap. Silakan muat ulang halaman.');
      }

      setShowPendingPaymentModal(false);

      const finishPayment = async () => {
        const finishRes = await fetch(`${API_BASE}/payment/finish`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ rentalId: targetRentalId })
        });
        if (!finishRes.ok) {
          const finishErr = (await finishRes.json().catch(() => ({}))) as { message?: string };
          throw new Error(finishErr.message || 'Gagal mengaktifkan sewa kos.');
        }
        await onRefreshRentals(currentUser.id);
        setSelectedPendingRental(null);
      };

      window.snap.pay(snapToken, {
        onSuccess: async (result: unknown) => {
          console.log('Pending payment completed successfully:', result);
          try {
            await finishPayment();
          } catch (err: unknown) {
            console.error('Finish payment error:', err);
          }
        },
        onPending: (result: unknown) => {
          console.log('Payment pending in Snap:', result);
          setSelectedPendingRental(null);
        },
        onError: (err: unknown) => {
          console.error('Payment error in Snap:', err);
          setSelectedPendingRental(null);
        },
        onClose: () => {
          console.log('Payment popup closed by user.');
          setSelectedPendingRental(null);
        }
      });
    } catch (err: unknown) {
      console.error('Process pending payment error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setPendingPaymentError(msg);
    } finally {
      setPendingPaymentProcessing(false);
    }
  };

  return {
    showPendingPaymentModal,
    setShowPendingPaymentModal,
    selectedPendingRental,
    setSelectedPendingRental,
    pendingPaymentProcessing,
    pendingPaymentError,
    handleOpenPendingPayment,
    handleClosePendingPayment,
    handleProcessPendingPayment
  };
}
