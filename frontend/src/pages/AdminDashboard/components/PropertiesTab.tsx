import React, { useState, useMemo } from 'react';
import { Star, Edit, Trash2, Search, Sparkles, Loader2 } from 'lucide-react';
import { Property } from '../../../types/index';
import { formatRupiah } from '../../../utils/format';

export interface PropertiesTabProps {
  properties: Property[];
  loading: boolean;
  onEditProperty: (prop: Property) => void;
  onDeleteProperty: (id: string) => void;
  onToggleFeatured?: (prop: Property) => Promise<void>;
}

export default function PropertiesTab({
  properties,
  loading,
  onEditProperty,
  onDeleteProperty,
  onToggleFeatured
}: PropertiesTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, boolean>>({});

  const filteredProperties = useMemo(() => {
    if (!searchTerm.trim()) return properties;
    const q = searchTerm.toLowerCase().trim();
    return properties.filter((p) => {
      const nameMatch = p.name?.toLowerCase().includes(q) ?? false;
      const districtMatch = p.district?.toLowerCase().includes(q) ?? false;
      const addressMatch = p.address?.toLowerCase().includes(q) ?? false;
      return nameMatch || districtMatch || addressMatch;
    });
  }, [properties, searchTerm]);

  const handleToggle = async (p: Property) => {
    if (!onToggleFeatured || togglingId) return;
    const currentFeatured = optimisticStatus[p.id] !== undefined
      ? optimisticStatus[p.id]
      : Boolean(p.is_featured || p.isFeatured);
    const nextStatus = !currentFeatured;

    setOptimisticStatus((prev) => ({ ...prev, [p.id]: nextStatus }));
    setTogglingId(p.id);

    try {
      await onToggleFeatured(p);
    } catch {
      setOptimisticStatus((prev) => ({ ...prev, [p.id]: currentFeatured }));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div className="flex-between flex-wrap gap-4" style={{ marginBottom: '24px' }}>
        <div>
          <h3 style={{ fontSize: '20px' }}>
            Daftar Semua Unit Properti ({filteredProperties.length}
            {filteredProperties.length !== properties.length && ` / ${properties.length}`})
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Moderasi unit kos, kelola status unggulan (featured), dan pantau okupansi kamar.
          </p>
        </div>
      </div>

      {/* Search Input Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '480px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Cari properti berdasarkan nama, wilayah, atau alamat..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px', width: '100%' }}
            aria-label="Cari properti"
            data-testid="properties-search-input"
          />
        </div>
        {searchTerm && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '6px 12px', fontSize: '12px' }}
            onClick={() => setSearchTerm('')}
            data-testid="properties-search-clear"
          >
            Bersihkan
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat data properti...</p>
        </div>
      ) : filteredProperties.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }} data-testid="properties-empty-state">
          <p style={{ fontStyle: 'italic', fontSize: '14px' }}>Tidak ada properti yang cocok dengan pencarian.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 16px' }}>Properti</th>
                <th style={{ padding: '12px 16px' }}>Wilayah</th>
                <th style={{ padding: '12px 16px' }}>Harga / Bln</th>
                <th style={{ padding: '12px 16px' }}>Kamar Terisi</th>
                <th style={{ padding: '12px 16px' }}>Rating</th>
                <th style={{ padding: '12px 16px' }}>Status Unggulan</th>
                <th style={{ padding: '12px 16px' }}>ID Pemilik</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredProperties.map((p) => {
                const isFeatured = optimisticStatus[p.id] !== undefined
                  ? optimisticStatus[p.id]
                  : Boolean(p.is_featured || p.isFeatured);
                const isToggling = togglingId === p.id;

                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img src={p.image} alt={p.name} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px' }} />
                        <div>
                          <strong style={{ color: 'var(--text-main)' }}>{p.name}</strong>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.address}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px', color: 'var(--text-main)' }}>{p.district}</td>
                    <td style={{ padding: '16px', fontWeight: 600, color: 'var(--primary)' }}>{formatRupiah(p.price)}</td>
                    <td style={{ padding: '16px', color: 'var(--text-main)' }}>
                      <strong>{p.occupiedRooms}</strong> / {p.totalRooms} Kamar
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Star size={14} style={{ fill: '#f59e0b', color: '#f59e0b' }} />
                        <span style={{ color: 'var(--text-main)' }}>{p.rating > 0 ? p.rating : 'Baru'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <button
                        type="button"
                        data-testid={`toggle-featured-${p.id}`}
                        disabled={isToggling || !onToggleFeatured}
                        onClick={() => handleToggle(p)}
                        className="btn"
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          borderRadius: '16px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          border: `1px solid ${isFeatured ? '#f59e0b' : 'var(--border-color)'}`,
                          backgroundColor: isFeatured ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                          color: isFeatured ? '#b45309' : 'var(--text-muted)',
                          cursor: isToggling ? 'wait' : 'pointer',
                          fontWeight: 600
                        }}
                        title={isFeatured ? 'Klik untuk mematikan status featured' : 'Klik untuk jadikan properti featured'}
                      >
                        {isToggling ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Sparkles size={12} style={{ fill: isFeatured ? '#f59e0b' : 'none', color: isFeatured ? '#f59e0b' : 'var(--text-muted)' }} />
                        )}
                        <span>{isFeatured ? 'Featured' : 'Reguler'}</span>
                      </button>
                    </td>
                    <td style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>{p.ownerId}</td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => onEditProperty(p)} title="Edit properti">
                          <Edit size={14} />
                        </button>
                        <button className="btn btn-danger" style={{ padding: '6px 12px' }} onClick={() => onDeleteProperty(p.id)} title="Hapus properti">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
