import React from 'react';
import { X } from 'lucide-react';
import { Property, FacilityFilterState } from '../../../types/index';
import { PropertyFormState } from '../types';

export interface PropertyFormModalProps {
  editingProperty: Property | null;
  propertyForm: PropertyFormState;
  setPropertyForm: React.Dispatch<React.SetStateAction<PropertyFormState>>;
  uploadingImage: boolean;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export default function PropertyFormModal({
  editingProperty,
  propertyForm,
  setPropertyForm,
  uploadingImage,
  onImageUpload,
  onClose,
  onSubmit
}: PropertyFormModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '650px' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <div style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '22px', marginBottom: '20px' }}>
            {editingProperty ? 'Edit Properti KOSMO' : 'Formulir Pendaftaran Kos Baru'}
          </h3>

          <form onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Nama Properti / Kos</label>
              <input
                type="text"
                className="form-input"
                placeholder="Contoh: KOSMO Hub Seminyak"
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
                <option value="Badung">Badung (Seminyak/Kuta)</option>
                <option value="Gianyar">Gianyar (Ubud)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Harga Sewa per Bulan (Rp)</label>
              <input
                type="number"
                className="form-input"
                placeholder="Contoh: 3000000"
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
                placeholder="Alamat jalan lengkap di Bali"
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
                placeholder="Jelaskan fasilitas, konsep, dan lingkungan kos..."
                value={propertyForm.description}
                onChange={(e) => setPropertyForm({ ...propertyForm, description: e.target.value })}
              ></textarea>
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Pilih Lokasi Properti di Peta</label>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Koordinat terpilih: <strong>{propertyForm.latitude || '-8.6500'}</strong>, <strong>{propertyForm.longitude || '115.2166'}</strong> (Geser penanda / klik peta untuk memindahkan)
              </div>
              <div id="map-picker" style={{ height: '240px', width: '100%', borderRadius: '12px', border: '1px solid var(--border-color)', position: 'relative', zIndex: 10 }}></div>
            </div>

            <div className="form-group">
              <label className="form-label">Total Unit Kamar</label>
              <input
                type="number"
                className="form-input"
                value={propertyForm.totalRooms}
                onChange={(e) => setPropertyForm({ ...propertyForm, totalRooms: e.target.value })}
                required
              />
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Cover Image Properti</label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input
                  type="file"
                  accept="image/*"
                  className="form-input"
                  onChange={onImageUpload}
                  style={{ padding: '8px' }}
                />
                {uploadingImage && <span style={{ fontSize: '12px', color: 'var(--primary)' }}>Mengunggah...</span>}
              </div>
              {propertyForm.image && (
                <div style={{ marginTop: '12px', position: 'relative', display: 'inline-block' }}>
                  <img
                    src={propertyForm.image}
                    alt="Preview"
                    style={{ width: '120px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setPropertyForm((prev) => ({ ...prev, image: '' }))}
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      background: 'red',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}
                  >
                    X
                  </button>
                </div>
              )}
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Fasilitas Termasuk (All-Inclusive)</label>
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
                {editingProperty ? 'Simpan Perubahan' : 'Daftarkan Properti'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
