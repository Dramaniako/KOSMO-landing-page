import React from 'react';
import { Plus, Star, Edit, Trash2 } from 'lucide-react';
import { Property } from '../../../types/index';
import { formatRupiah } from '../../../utils/format';
import { shimmerStyle } from '../types';

export interface PropertiesTabProps {
  properties: Property[];
  loading: boolean;
  onAddProperty: () => void;
  onEditProperty: (p: Property) => void;
  onDeleteProperty: (id: string) => void;
}

export default function PropertiesTab({
  properties,
  loading,
  onAddProperty,
  onEditProperty,
  onDeleteProperty
}: PropertiesTabProps) {
  return (
    <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '20px' }}>Properti Saya ({properties.length})</h3>
        <button className="btn btn-primary" onClick={onAddProperty}>
          <Plus size={16} />
          Tambah Properti
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: '72px', ...shimmerStyle }} />
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 16px' }}>Properti</th>
                <th style={{ padding: '12px 16px' }}>Wilayah</th>
                <th style={{ padding: '12px 16px' }}>Harga / Bln</th>
                <th style={{ padding: '12px 16px' }}>Okupansi Kamar</th>
                <th style={{ padding: '12px 16px' }}>Rating</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <img src={p.image} alt={p.name} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }} />
                      <div>
                        <strong style={{ fontSize: '15px', color: 'var(--dark)' }}>{p.name}</strong>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.address}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px' }}>{p.district}</td>
                  <td style={{ padding: '16px', fontWeight: 600, color: 'var(--primary)' }}>{formatRupiah(p.price)}</td>
                  <td style={{ padding: '16px' }}>
                    <strong>{p.occupiedRooms}</strong> / {p.totalRooms} Kamar
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                      ({p.totalRooms - p.occupiedRooms} Kamar Kosong)
                    </span>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Star size={14} style={{ fill: '#f59e0b', color: '#f59e0b' }} />
                      <span>{p.rating > 0 ? p.rating : 'N/A'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => onEditProperty(p)}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px 12px' }} onClick={() => onDeleteProperty(p.id)}>
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
