import React from 'react';
import { X } from 'lucide-react';
import { Property, Review } from '../../../types/index';
import { ReviewFormState } from '../types';

interface ReviewModalProps {
  isOpen: boolean;
  editingReview: Review | null;
  reviewForm: ReviewFormState;
  properties: Property[];
  setReviewForm: React.Dispatch<React.SetStateAction<ReviewFormState>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  editingReview,
  reviewForm,
  properties,
  setReviewForm,
  onClose,
  onSubmit
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '450px' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <div style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>
            {editingReview ? 'Edit Ulasan Anda' : 'Tulis Ulasan Baru'}
          </h3>

          <form onSubmit={onSubmit}>
            {!editingReview && (
              <div className="form-group">
                <label className="form-label">Pilih Properti</label>
                <select 
                  className="form-select"
                  value={reviewForm.propertyId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReviewForm(prev => ({ ...prev, propertyId: e.target.value }))}
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.district})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Rating Anda</label>
              <select 
                className="form-select" 
                value={reviewForm.rating}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReviewForm(prev => ({ ...prev, rating: parseInt(e.target.value, 10) }))}
              >
                <option value={5}>5 Bintang (Sangat Puas)</option>
                <option value={4}>4 Bintang (Puas)</option>
                <option value={3}>3 Bintang (Cukup)</option>
                <option value={2}>2 Bintang (Buruk)</option>
                <option value={1}>1 Bintang (Sangat Buruk)</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label">Komentar Ulasan</label>
              <textarea 
                className="form-textarea" 
                rows={4}
                placeholder="Berikan ulasan jujur mengenai fasilitas, kebersihan, dan kenyamanan hunian..."
                value={reviewForm.comment}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReviewForm(prev => ({ ...prev, comment: e.target.value }))}
                required
              ></textarea>
            </div>

            <div className="flex-between">
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary">
                Kirim Ulasan
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
