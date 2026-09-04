import React from 'react';
import { X } from 'lucide-react';
import { User } from '../../../types/index';
import { UserFormState } from '../types';

export interface UserModalProps {
  editingUser: User | null;
  userForm: UserFormState;
  setUserForm: React.Dispatch<React.SetStateAction<UserFormState>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export default function UserModal({
  editingUser,
  userForm,
  setUserForm,
  onClose,
  onSubmit
}: UserModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '480px' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <div style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>
            {editingUser ? 'Edit Detail User' : 'Buat User Baru'}
          </h3>

          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label">Nama Lengkap</label>
              <input
                type="text"
                className="form-input"
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Alamat Email</label>
              <input
                type="email"
                className="form-input"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password {editingUser && '(Kosongkan jika tidak diganti)'}</label>
              <input
                type="password"
                className="form-input"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                required={!editingUser}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Pilih Role User</label>
              <select
                className="form-select"
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as 'tenant' | 'landlord' | 'admin' })}
              >
                <option value="tenant">Tenant (Penyewa)</option>
                <option value="landlord">Landlord (Pemilik Kos)</option>
                <option value="admin">Administrator Website</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Nomor Telepon</label>
              <input
                type="text"
                className="form-input"
                value={userForm.phone}
                onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label">Metode Pembayaran Pilihan</label>
              <input
                type="text"
                className="form-input"
                value={userForm.paymentMethod}
                onChange={(e) => setUserForm({ ...userForm, paymentMethod: e.target.value })}
              />
            </div>

            <div className="flex-between">
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary">
                {editingUser ? 'Simpan Perubahan' : 'Buat User'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
