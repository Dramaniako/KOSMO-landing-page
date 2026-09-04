import React from 'react';
import { X } from 'lucide-react';
import { User, FacilityFilterState } from '../../../types/index';
import { PropertyFormState } from '../types';

export interface PropertyModerationModalProps {
  propertyForm: PropertyFormState;
  setPropertyForm: React.Dispatch<React.SetStateAction<PropertyFormState>>;
  landlordUsers: User[];
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export default function PropertyModerationModal({
  propertyForm,
  setPropertyForm,
  landlordUsers,
  onClose,
  onSubmit
}: PropertyModerationModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '650px' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <div style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '22px', marginBottom: '20px' }}>
            Moderasi Properti KOSMO
          </h3>

          <form onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Nama Properti</label>
              <input
                type="text"
                className="form-input"
                value={propertyForm.name}
                onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Kabupaten / Kota</label>
              <select
                className="form-select"
                value={propertyForm.district}
                onChange={(e) => setPropertyForm({ ...propertyForm, district: e.target.value })}
              >
                <option value="Denpasar">Denpasar</option>
                <option value="Badung">Badung</option>
                <option value="Gianyar">Gianyar</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Harga Sewa / Bln (Rp)</label>
              <input
                type="number"
                className="form-input"
                value={propertyForm.price}
                onChange={(e) => setPropertyForm({ ...propertyForm, price: e.target.value })}
                required
              />
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Alamat Lengkap</label>
              <input
                type="text"
                className="form-input"
                value={propertyForm.address}
                onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })}
                required
              />
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Deskripsi Properti</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={propertyForm.description}
                onChange={(e) => setPropertyForm({ ...propertyForm, description: e.target.value })}
              ></textarea>
            </div>

            <div className="form-group">
              <label className="form-label">Latitude</label>
              <input
                type="text"
                className="form-input"
                value={propertyForm.latitude}
                onChange={(e) => setPropertyForm({ ...propertyForm, latitude: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Longitude</label>
              <input
                type="text"
                className="form-input"
                value={propertyForm.longitude}
                onChange={(e) => setPropertyForm({ ...propertyForm, longitude: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Total Kamar</label>
              <input
                type="number"
                className="form-input"
                value={propertyForm.totalRooms}
                onChange={(e) => setPropertyForm({ ...propertyForm, totalRooms: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Kamar Terisi</label>
              <input
                type="number"
                className="form-input"
                value={propertyForm.occupiedRooms}
                onChange={(e) => setPropertyForm({ ...propertyForm, occupiedRooms: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Cover Image URL</label>
              <input
                type="text"
                className="form-input"
                value={propertyForm.image}
                onChange={(e) => setPropertyForm({ ...propertyForm, image: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Pilih Landlord Pemilik</label>
              <select
                className="form-select"
                value={propertyForm.ownerId}
                onChange={(e) => setPropertyForm({ ...propertyForm, ownerId: e.target.value })}
              >
                {landlordUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} (ID: {u.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Fasilitas All-Inclusive</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '6px' }}>
                {(Object.keys(propertyForm.facilities) as (keyof FacilityFilterState)[]).map((fac) => (
                  <label key={String(fac)} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      style={{ width: '16px', height: '16px' }}
                      checked={propertyForm.facilities[fac]}
                      onChange={() =>
                        setPropertyForm({
                          ...propertyForm,
                          facilities: {
                            ...propertyForm.facilities,
                            [fac]: !propertyForm.facilities[fac]
                          }
                        })
                      }
                    />
                    {String(fac)}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary">
                Simpan Moderasi
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
