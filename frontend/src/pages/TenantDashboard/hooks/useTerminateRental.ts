import { useState } from 'react';
import { User, Rental } from '../../../types/index';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

interface UseTerminateRentalParams {
  currentUser: User | null;
  onSuccess: () => Promise<void>;
  onLogout: () => void;
}

export function useTerminateRental({
  currentUser,
  onSuccess,
  onLogout
}: UseTerminateRentalParams) {
  const [showTerminateModal, setShowTerminateModal] = useState<boolean>(false);
  const [terminateRental, setTerminateRental] = useState<Rental | null>(null);
  const [terminatePassword, setTerminatePassword] = useState<string>('');
  const [terminateProcessing, setTerminateProcessing] = useState<boolean>(false);

  const openTerminateModal = (rental: Rental) => {
    setTerminateRental(rental);
    setShowTerminateModal(true);
  };

  const closeTerminateModal = () => {
    setShowTerminateModal(false);
    setTerminatePassword('');
  };

  const handleTerminateSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!terminateRental || !currentUser) return;
    setTerminateProcessing(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      if (!token) {
        alert("Sesi Anda telah berakhir. Silakan masuk kembali.");
        onLogout();
        return;
      }
      const res = await fetch(`${API_BASE}/rentals/${terminateRental.id}/terminate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: terminatePassword })
      });
      if (res.status === 401) {
        alert("Sesi Anda telah berakhir. Silakan masuk kembali.");
        onLogout();
        return;
      }
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert("Sewa kos berhasil diberhentikan.");
      closeTerminateModal();
      await onSuccess();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    } finally {
      setTerminateProcessing(false);
    }
  };

  return {
    showTerminateModal,
    setShowTerminateModal,
    terminateRental,
    setTerminateRental,
    terminatePassword,
    setTerminatePassword,
    terminateProcessing,
    openTerminateModal,
    closeTerminateModal,
    handleTerminateSubmit
  };
}
