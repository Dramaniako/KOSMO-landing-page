import React from 'react';
import { X } from 'lucide-react';
import { WithdrawFormState } from '../types';
import { formatRupiah } from '../../../utils/format';

export const INDONESIAN_BANKS = [
  { value: 'BCA', label: 'BCA (Bank Central Asia)' },
  { value: 'Mandiri', label: 'Bank Mandiri' },
  { value: 'BNI', label: 'BNI (Bank Negara Indonesia)' },
  { value: 'BRI', label: 'BRI (Bank Rakyat Indonesia)' },
  { value: 'BSI', label: 'BSI (Bank Syariah Indonesia)' },
  { value: 'Permata', label: 'Bank Permata' },
  { value: 'CIMB Niaga', label: 'CIMB Niaga' },
  { value: 'Danamon', label: 'Bank Danamon' },
  { value: 'Seabank', label: 'SeaBank Indonesia' },
  { value: 'Bank Jago', label: 'Bank Jago' }
];

export interface WithdrawModalProps {
  balance: number;
  withdrawForm: WithdrawFormState;
  setWithdrawForm: React.Dispatch<React.SetStateAction<WithdrawFormState>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export default function WithdrawModal({
  balance,
  withdrawForm,
  setWithdrawForm,
  onClose,
  onSubmit
}: WithdrawModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '450px' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <div style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Formulir Penarikan Dana</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
            Maksimal penarikan: <strong>{formatRupiah(balance)}</strong>
          </p>

          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label">Pilih Bank Tujuan</label>
              <select
                className="form-select"
                value={withdrawForm.bankName}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, bankName: e.target.value })}
              >
                {INDONESIAN_BANKS.map((bank) => (
                  <option key={bank.value} value={bank.value}>
                    {bank.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Nomor Rekening Penerima</label>
              <input
                type="text"
                className="form-input"
                placeholder="Contoh: 1234567890"
                value={withdrawForm.accountNumber}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, accountNumber: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Nama Pemilik Rekening (a.n.)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Contoh: Budi Santoso"
                value={withdrawForm.accountHolder || ''}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, accountHolder: e.target.value })}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Jumlah Penarikan (Rupiah)</label>
                <button
                  type="button"
                  data-testid="withdraw-max-btn"
                  onClick={() => setWithdrawForm({ ...withdrawForm, amount: Math.max(0, Math.floor(balance)).toString() })}
                  disabled={balance <= 0}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: balance > 0 ? 'var(--primary)' : 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: balance > 0 ? 'pointer' : 'not-allowed',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}
                >
                  Tarik Semua (Max)
                </button>
              </div>
              <input
                type="number"
                className="form-input"
                placeholder="Contoh: 100000"
                max={balance}
                min={1}
                value={withdrawForm.amount}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                required
              />
            </div>

            <div className="flex-between">
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary">
                Proses Penarikan
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
