import { useState } from 'react';
import { User } from '../../../types/index';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useDeleteProperty(
  landlordUser: User | null,
  loadedTabs: React.MutableRefObject<Set<string>>,
  fetchLandlordProperties: (landlordId: string) => Promise<void>
) {
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [deletingPropertyId, setDeletingPropertyId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [deleteProcessing, setDeleteProcessing] = useState<boolean>(false);

  const handleDeleteProperty = (id: string): void => {
    setDeletingPropertyId(id);
    setShowDeleteModal(true);
  };

  const handleDeleteSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!landlordUser || !deletingPropertyId) return;
    setDeleteProcessing(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token') || '';
      const res = await fetch(`${API_BASE}/properties/${deletingPropertyId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ password: deletePassword, landlordId: landlordUser.id })
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowDeleteModal(false);
      setDeletePassword('');
      setDeletingPropertyId(null);
      loadedTabs.current.delete('overview');
      loadedTabs.current.delete('reviews');
      await fetchLandlordProperties(landlordUser.id);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    } finally {
      setDeleteProcessing(false);
    }
  };

  return {
    showDeleteModal,
    setShowDeleteModal,
    deletingPropertyId,
    setDeletingPropertyId,
    deletePassword,
    setDeletePassword,
    deleteProcessing,
    handleDeleteProperty,
    handleDeleteSubmit
  };
}
