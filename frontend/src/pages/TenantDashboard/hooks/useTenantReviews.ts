import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Property, Review } from '../../../types/index';
import { ReviewFormState } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

interface UseTenantReviewsParams {
  currentUser: User | null;
  properties: Property[];
  fetchProperties: () => Promise<Property[]>;
  fetchMyReviews: (userId: string) => Promise<void>;
  onLogout: () => void;
}

export function useTenantReviews({
  currentUser,
  properties,
  fetchProperties,
  fetchMyReviews,
  onLogout
}: UseTenantReviewsParams) {
  const navigate = useNavigate();

  const [showRevModal, setShowRevModal] = useState<boolean>(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);

  const [reviewForm, setReviewForm] = useState<ReviewFormState>({
    propertyId: '',
    rating: 5,
    comment: ''
  });

  const resetReviewForm = async (): Promise<void> => {
    setEditingReview(null);
    let safeProps = properties;
    if (safeProps.length === 0) {
      safeProps = await fetchProperties();
    }
    setReviewForm({
      propertyId: safeProps[0]?.id || '',
      rating: 5,
      comment: ''
    });
  };

  const handleReviewSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!currentUser) return;
    if (!reviewForm.propertyId || !reviewForm.comment) {
      alert("Properti dan komentar ulasan wajib diisi.");
      return;
    }

    const payload = editingReview 
      ? { rating: reviewForm.rating, comment: reviewForm.comment }
      : { 
          propertyId: reviewForm.propertyId, 
          userId: currentUser.id, 
          userName: currentUser.name, 
          rating: reviewForm.rating, 
          comment: reviewForm.comment 
        };

    const url = editingReview 
      ? `${API_BASE}/reviews/${editingReview.id}`
      : `${API_BASE}/reviews`;

    const method = editingReview ? 'PUT' : 'POST';

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      if (!token) {
        navigate('/login');
        return;
      }
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.status === 401) {
        alert("Sesi Anda telah berakhir. Silakan masuk kembali.");
        onLogout();
        return;
      }
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowRevModal(false);
      await resetReviewForm();
      await fetchMyReviews(currentUser.id);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const handleEditReview = async (rev: Review): Promise<void> => {
    setEditingReview(rev);
    if (properties.length === 0) {
      await fetchProperties();
    }
    setReviewForm({
      propertyId: rev.propertyId,
      rating: rev.rating,
      comment: rev.comment
    });
    setShowRevModal(true);
  };

  const handleDeleteReview = async (id: string): Promise<void> => {
    if (!currentUser) return;
    if (!window.confirm("Apakah Anda yakin ingin menghapus review ini?")) return;

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      if (!token) {
        navigate('/login');
        return;
      }
      const res = await fetch(`${API_BASE}/reviews/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.status === 401) {
        alert("Sesi Anda telah berakhir. Silakan masuk kembali.");
        onLogout();
        return;
      }
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      await fetchMyReviews(currentUser.id);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  return {
    showRevModal,
    setShowRevModal,
    editingReview,
    setEditingReview,
    reviewForm,
    setReviewForm,
    resetReviewForm,
    handleReviewSubmit,
    handleEditReview,
    handleDeleteReview
  };
}
