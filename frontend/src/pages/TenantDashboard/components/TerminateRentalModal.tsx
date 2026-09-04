import React from 'react';
import { X } from 'lucide-react';
import { Rental } from '../../../types/index';

interface TerminateRentalModalProps {
  isOpen: boolean;
  terminateRental: Rental | null;
  terminatePassword: string;
  setTerminatePassword: (val: string) => void;
  terminateProcessing: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}

export const TerminateRentalModal: React.FC<TerminateRentalModalProps> = ({
  isOpen,
  terminateRental,
  terminatePassword,
  setTerminatePassword,
  terminateProcessing,
  onClose,
  onSubmit
}) => {
  if (!isOpen || !terminateRental) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '400px' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <div style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>Konfirmasi Penghentian Sewa</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
            Untuk berhenti menyewa <strong>{terminateRental.propertyName}</strong>, harap masukkan password akun Anda untuk konfirmasi keamanan.
          </p>
          
          <form onSubmit={onSubmit}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ display: 'block', marginBottom: '8px' }}>Password Anda</label>
              <input 
                type="password" 
                className="form-input" 
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                placeholder="Masukkan password"
                value={terminatePassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTerminatePassword(e.target.value)}
                required 
              />
            </div>

            <div className="flex-between">
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="btn btn-danger" disabled={terminateProcessing}>
                {terminateProcessing ? 'Memproses...' : 'Konfirmasi Berhenti'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
