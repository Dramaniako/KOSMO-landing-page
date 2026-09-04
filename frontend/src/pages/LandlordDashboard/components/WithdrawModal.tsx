import React from 'react';
import { X } from 'lucide-react';
import { WithdrawFormState } from '../types';
import { formatRupiah } from '../../../utils/format';

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
                <option value="BCA">BCA (Bank Central Asia)</option>
                <option value="Mandiri">Bank Mandiri</option>
                <option value="BNI">BNI (Bank Negara Indonesia)</option>
                <option value="BRI">BRI (Bank Rakyat Indonesia)</option>
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

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label">Jumlah Penarikan (Rupiah)</label>
              <input
                type="number"
                className="form-input"
                placeholder="Contoh: 100000"
                max={balance}
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
