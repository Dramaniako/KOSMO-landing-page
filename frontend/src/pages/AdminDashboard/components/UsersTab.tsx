import React from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { User } from '../../../types/index';
import { formatRupiah } from '../../../utils/format';

export interface UsersTabProps {
  users: User[];
  loading: boolean;
  onAddUser: () => void;
  onEditUser: (user: User) => void;
  onDeleteUser: (id: string) => void;
}

export default function UsersTab({
  users,
  loading,
  onAddUser,
  onEditUser,
  onDeleteUser
}: UsersTabProps) {
  return (
    <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '20px' }}>Daftar Pengguna Website ({users.length})</h3>
        <button className="btn btn-primary" onClick={onAddUser}>
          <Plus size={16} />
          Tambah User Baru
        </button>
      </div>

      {loading ? (
        <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat data pengguna...</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 16px' }}>Nama</th>
                <th style={{ padding: '12px 16px' }}>Email</th>
                <th style={{ padding: '12px 16px' }}>Role</th>
                <th style={{ padding: '12px 16px' }}>Nomor Telepon</th>
                <th style={{ padding: '12px 16px' }}>Keuangan (Landlord)</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '16px' }}>
                    <strong>{u.name}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>ID: {u.id}</span>
                  </td>
                  <td style={{ padding: '16px' }}>{u.email}</td>
                  <td style={{ padding: '16px' }}>
                    <span
                      className={`badge ${
                        u.role === 'admin'
                          ? 'badge-danger'
                          : u.role === 'landlord'
                          ? 'badge-primary'
                          : 'badge-success'
                      }`}
                    >
                      {u.role === 'admin' ? 'Super Admin' : u.role === 'landlord' ? 'Landlord' : 'Tenant'}
                    </span>
                  </td>
                  <td style={{ padding: '16px' }}>{u.phone || '-'}</td>
                  <td style={{ padding: '16px' }}>
                    {u.role === 'landlord' ? (
                      <div style={{ fontSize: '12px' }}>
                        <p>Saldo: {formatRupiah(u.balance)}</p>
                        <p style={{ color: 'var(--text-muted)' }}>Revenue: {formatRupiah(u.totalRevenue)}</p>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => onEditUser(u)}>
                        <Edit size={14} />
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '6px 12px' }}
                        onClick={() => onDeleteUser(u.id)}
                        disabled={u.id === 'user-admin'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
