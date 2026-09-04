import React from 'react';
import { X } from 'lucide-react';
import { ReviewFormState } from '../types';

export interface ReviewModalProps {
  reviewForm: ReviewFormState;
  setReviewForm: React.Dispatch<React.SetStateAction<ReviewFormState>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export default function ReviewModal({
  reviewForm,
  setReviewForm,
  onClose,
  onSubmit
}: ReviewModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '450px' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <div style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>Edit Review Pengguna</h3>

          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label">Rating Bintang</label>
              <select
                className="form-select"
                value={reviewForm.rating}
                onChange={(e) => setReviewForm({ ...reviewForm, rating: parseInt(e.target.value, 10) })}
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
                value={reviewForm.comment}
                onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                required
              ></textarea>
            </div>

            <div className="flex-between">
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary">
                Simpan Ulasan
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
