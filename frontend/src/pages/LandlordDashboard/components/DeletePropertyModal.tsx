import React from 'react';
import { X } from 'lucide-react';

export interface DeletePropertyModalProps {
  deletePassword: string;
  setDeletePassword: (pass: string) => void;
  deleteProcessing: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export default function DeletePropertyModal({
  deletePassword,
  setDeletePassword,
  deleteProcessing,
  onClose,
  onSubmit
}: DeletePropertyModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '400px' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <div style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>Hapus Properti Kos</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
            Apakah Anda yakin ingin menghapus properti ini? Semua review terkait juga akan dihapus. Harap masukkan password akun Anda untuk konfirmasi keamanan.
          </p>

          <form onSubmit={onSubmit}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ display: 'block', marginBottom: '8px' }}>Password Anda</label>
              <input
                type="password"
                className="form-input"
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                placeholder="Masukkan password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                required
              />
            </div>

            <div className="flex-between">
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="btn btn-danger" disabled={deleteProcessing}>
                {deleteProcessing ? 'Memproses...' : 'Hapus Sekarang'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
