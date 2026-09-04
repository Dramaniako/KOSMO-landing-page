import { useState } from 'react';
import { Review } from '../../../types/index';
import { ReviewFormState } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useAdminReviewManagement(
  getAuthHeaders: () => Record<string, string>,
  getAuthOnlyHeaders: () => Record<string, string>,
  fetchReviews: () => Promise<void>
) {
  const [showRevModal, setShowRevModal] = useState<boolean>(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewFormState>({
    rating: 5,
    comment: ''
  });

  const handleEditReview = (rev: Review): void => {
    setEditingReview(rev);
    setReviewForm({
      rating: rev.rating,
      comment: rev.comment
    });
    setShowRevModal(true);
  };

  const handleReviewSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!editingReview) return;
    try {
      const res = await fetch(`${API_BASE}/reviews/${editingReview.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(reviewForm)
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowRevModal(false);
      setEditingReview(null);
      await fetchReviews();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const handleDeleteReview = async (id: string): Promise<void> => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus review ini?")) return;

    try {
      const res = await fetch(`${API_BASE}/reviews/${id}`, {
        method: 'DELETE',
        headers: getAuthOnlyHeaders()
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      await fetchReviews();
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
    handleEditReview,
    handleReviewSubmit,
    handleDeleteReview
  };
}
