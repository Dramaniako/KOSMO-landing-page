import React, { useState, useMemo } from 'react';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'tenant' | 'landlord' | 'admin'>('all');

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      if (!matchesRole) return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      const nameMatch = u.name?.toLowerCase().includes(q) ?? false;
      const emailMatch = u.email?.toLowerCase().includes(q) ?? false;
      const phoneMatch = u.phone?.toLowerCase().includes(q) ?? false;
      return nameMatch || emailMatch || phoneMatch;
    });
  }, [users, roleFilter, searchTerm]);

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div className="flex-between flex-wrap gap-4" style={{ marginBottom: '24px' }}>
        <div>
          <h3 style={{ fontSize: '20px' }}>
            Daftar Pengguna Website ({filteredUsers.length}
            {filteredUsers.length !== users.length && ` / ${users.length}`})
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Kelola akun, role hak akses, dan saldo mitra pengguna KOSMO.
          </p>
        </div>
        <button className="btn btn-primary" onClick={onAddUser} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} />
          Tambah User Baru
        </button>
      </div>

      {/* Search & Role Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Cari nama, email, atau no. telepon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px', width: '100%' }}
            aria-label="Cari pengguna"
            data-testid="users-search-input"
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['all', 'tenant', 'landlord', 'admin'] as const).map((role) => {
            const count = role === 'all' ? users.length : users.filter((u) => u.role === role).length;
            const isActive = roleFilter === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                data-testid={`filter-role-${role}`}
                className={`btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span>{role === 'all' ? 'Semua Role' : role === 'tenant' ? 'Tenant' : role === 'landlord' ? 'Landlord' : 'Admin'}</span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'var(--border-color)',
                    color: isActive ? '#ffffff' : 'var(--text-muted)'
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat data pengguna...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }} data-testid="users-empty-state">
          <p style={{ fontStyle: 'italic', fontSize: '14px' }}>Tidak ada pengguna yang cocok dengan kriteria pencarian.</p>
          {(searchTerm || roleFilter !== 'all') && (
            <button
              type="button"
              className="btn btn-outline"
              style={{ marginTop: '12px', padding: '6px 14px', fontSize: '12px' }}
              onClick={() => {
                setSearchTerm('');
                setRoleFilter('all');
              }}
            >
              Reset Filter
            </button>
          )}
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
              {filteredUsers.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '16px' }}>
                    <strong style={{ color: 'var(--text-main)' }}>{u.name}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>ID: {u.id}</span>
                  </td>
                  <td style={{ padding: '16px', color: 'var(--text-main)' }}>{u.email}</td>
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
                  <td style={{ padding: '16px', color: 'var(--text-main)' }}>{u.phone || '-'}</td>
                  <td style={{ padding: '16px' }}>
                    {u.role === 'landlord' ? (
                      <div style={{ fontSize: '12px' }}>
                        <p style={{ color: 'var(--text-main)' }}>Saldo: {formatRupiah(u.balance)}</p>
                        <p style={{ color: 'var(--text-muted)' }}>Revenue: {formatRupiah(u.totalRevenue)}</p>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => onEditUser(u)} title="Edit user">
                        <Edit size={14} />
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '6px 12px' }}
                        onClick={() => onDeleteUser(u.id)}
                        disabled={u.id === 'user-admin'}
                        title="Hapus user"
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
