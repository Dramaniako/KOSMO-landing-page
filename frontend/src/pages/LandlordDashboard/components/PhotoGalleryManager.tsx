import React, { useState, useEffect, useCallback } from 'react';
import { X, Upload, Trash2, ArrowUp, ArrowDown, Image as ImageIcon, Star, Check, AlertCircle } from 'lucide-react';
import { Property, PropertyPhoto, PhotoCategory } from '../../../types/index';
import { shimmerStyle } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export interface PhotoGalleryManagerProps {
  property: Property;
  onClose: () => void;
  onPhotosUpdated: () => void;
}

const CATEGORY_MAP: Record<PhotoCategory, string> = {
  thumbnail: 'Foto Sampul Utama',
  bedroom: 'Kamar Tidur',
  bathroom: 'Kamar Mandi',
  kitchen: 'Dapur',
  pool: 'Kolam Renang / Komunal',
  living_room: 'Ruang Tamu / Bersama',
  wifi_speedtest: 'WiFi Speedtest',
  exterior: 'Fasad / Eksterior',
  other: 'Lainnya'
};

export default function PhotoGalleryManager({ property, onClose, onPhotosUpdated }: PhotoGalleryManagerProps) {
  const [photos, setPhotos] = useState<PropertyPhoto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Upload Form State
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [uploadCategory, setUploadCategory] = useState<PhotoCategory>('bedroom');
  const [uploadCaption, setUploadCaption] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);

  // Status Alerts
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Delete confirmation
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/properties/${property.id}/photos`);
      if (!res.ok) throw new Error('Gagal memuat galeri foto.');
      const data = (await res.json()) as PropertyPhoto[];
      setPhotos(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal memuat galeri.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }, [property.id]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Handle Multi-Photo Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFiles || uploadFiles.length === 0) {
      setErrorMsg('Pilih minimal 1 berkas foto untuk diunggah.');
      return;
    }
    if (uploadFiles.length > 10) {
      setErrorMsg('Maksimal 10 file foto dapat diunggah sekaligus.');
      return;
    }

    setUploading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const formData = new FormData();
      Array.from(uploadFiles).forEach((file) => {
        formData.append('images', file);
      });
      formData.append('category', uploadCategory);
      if (uploadCaption.trim()) {
        formData.append('caption', uploadCaption.trim());
      }

      const res = await fetch(`${API_BASE}/properties/${property.id}/photos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });

      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message || 'Gagal mengunggah foto.');
      }

      setSuccessMsg(`${uploadFiles.length} foto berhasil diunggah!`);
      setUploadFiles(null);
      setUploadCaption('');
      fetchPhotos();
      onPhotosUpdated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mengunggah foto.';
      setErrorMsg(message);
    } finally {
      setUploading(false);
    }
  };

  // Reorder Photos via Move Up / Move Down
  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= photos.length) return;

    const newPhotos = [...photos];
    const temp = newPhotos[index];
    newPhotos[index] = newPhotos[targetIndex];
    newPhotos[targetIndex] = temp;

    // Optimistic state
    setPhotos(newPhotos);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const photoIds = newPhotos.map((p) => p.id);
      const res = await fetch(`${API_BASE}/properties/${property.id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ photoIds })
      });

      if (!res.ok) {
        throw new Error('Gagal memperbarui urutan foto.');
      }
      onPhotosUpdated();
    } catch {
      // Revert
      fetchPhotos();
      setErrorMsg('Gagal menyimpan urutan foto.');
    }
  };

  // Set Cover Photo
  const handleSetCover = async (photo: PropertyPhoto) => {
    setErrorMsg('');
    setSuccessMsg('');

    // Move to index 0 and reorder
    const remaining = photos.filter((p) => p.id !== photo.id);
    const newPhotos = [photo, ...remaining];
    setPhotos(newPhotos);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const photoIds = newPhotos.map((p) => p.id);
      const res = await fetch(`${API_BASE}/properties/${property.id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ photoIds })
      });

      if (!res.ok) throw new Error('Gagal menjadikan foto sampul.');

      setSuccessMsg('Foto berhasil ditetapkan sebagai Foto Utama!');
      onPhotosUpdated();
    } catch {
      fetchPhotos();
      setErrorMsg('Gagal mengubah foto sampul.');
    }
  };

  // Delete Photo
  const handleDeletePhoto = async (photoId: string) => {
    setErrorMsg('');
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const res = await fetch(`${API_BASE}/properties/${property.id}/photos/${photoId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) throw new Error('Gagal menghapus foto.');

      setSuccessMsg('Foto berhasil dihapus.');
      setDeletingPhotoId(null);
      fetchPhotos();
      onPhotosUpdated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus foto.';
      setErrorMsg(message);
    }
  };

  const filteredPhotos =
    selectedCategory === 'all'
      ? photos
      : photos.filter((p) => p.category === selectedCategory);

  return (
    <div className="modal-overlay" style={{ zIndex: 1050 }}>
      <div
        className="modal-container modal-content"
        data-testid="photo-gallery-manager"
        style={{ maxWidth: '950px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <button className="modal-close" onClick={onClose} aria-label="Tutup Modal">
          <X size={18} />
        </button>

        <div style={{ padding: '28px' }}>
          {/* Header */}
          <div className="flex-between" style={{ marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '22px', marginBottom: '4px' }}>
                Galeri Foto - {property.name}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Kelola foto, kategori perspektif, urutan tampilan, dan foto sampul utama.
              </p>
            </div>
            <span className="badge badge-primary" style={{ fontSize: '13px' }}>
              {photos.length} Foto Terdaftar
            </span>
          </div>

          {/* Feedback Alerts */}
          {errorMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#fef2f2', color: 'var(--danger)', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: 'var(--success)', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Upload Section */}
          <form
            onSubmit={handleUploadSubmit}
            style={{
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#f8fafc',
              border: '1px solid var(--border-color)',
              marginBottom: '24px'
            }}
          >
            <h4 style={{ fontSize: '15px', marginBottom: '12px', color: 'var(--dark)' }}>
              Unggah Foto Baru (Maks. 10 Foto Sekaligus)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label className="form-label" style={{ fontSize: '12px' }}>Pilih Berkas Gambar</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="form-input"
                  style={{ padding: '8px' }}
                  onChange={(e) => setUploadFiles(e.target.files)}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '12px' }}>Kategori Perspektif</label>
                <select
                  name="category"
                  data-testid="photo-category-select"
                  className="form-select"
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as PhotoCategory)}
                >
                  <option value="thumbnail">Foto Sampul (Thumbnail)</option>
                  <option value="bedroom">Kamar Tidur (Bedroom)</option>
                  <option value="bathroom">Kamar Mandi (Bathroom)</option>
                  <option value="kitchen">Dapur (Kitchen)</option>
                  <option value="pool">Kolam / Komunal (Pool)</option>
                  <option value="living_room">Ruang Tamu (Living)</option>
                  <option value="wifi_speedtest">WiFi Speedtest</option>
                  <option value="exterior">Fasad / Eksterior</option>
                  <option value="other">Lainnya</option>
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '12px' }}>Keterangan / Caption (Opsional)</label>
                <input
                  type="text"
                  name="caption"
                  className="form-input"
                  placeholder="Contoh: Kamar Mandi Marmer & Water Heater"
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                />
              </div>
              <div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ height: '42px', padding: '0 18px' }}
                  disabled={uploading}
                >
                  <Upload size={16} />
                  {uploading ? 'Mengunggah...' : 'Upload'}
                </button>
              </div>
            </div>
          </form>

          {/* Category Filter Tabs */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '16px' }}>
            <button
              type="button"
              className={`btn ${selectedCategory === 'all' ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '20px' }}
              onClick={() => setSelectedCategory('all')}
            >
              Semua Foto ({photos.length})
            </button>
            {(Object.keys(CATEGORY_MAP) as PhotoCategory[]).map((cat) => {
              const count = photos.filter((p) => p.category === cat).length;
              if (count === 0 && selectedCategory !== cat) return null;
              return (
                <button
                  key={cat}
                  type="button"
                  className={`btn ${selectedCategory === cat ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '20px' }}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {CATEGORY_MAP[cat]} ({count})
                </button>
              );
            })}
          </div>

          {/* Photo Gallery Grid */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ height: '180px', ...shimmerStyle }} />
              ))}
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
              <ImageIcon size={42} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
              <p style={{ fontSize: '14px' }}>Belum ada foto dalam galeri properti ini.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {filteredPhotos.map((photo, index) => {
                const isCover = photo.url === property.image || photo.category === 'thumbnail' || index === 0;

                return (
                  <div
                    key={photo.id}
                    className="card"
                    style={{
                      border: isCover ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                      overflow: 'hidden',
                      position: 'relative'
                    }}
                  >
                    <div style={{ position: 'relative', height: '160px', backgroundColor: '#0f172a' }}>
                      <img
                        src={photo.url}
                        alt={photo.caption || photo.category}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {isCover && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            backgroundColor: 'var(--primary)',
                            color: 'white',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Star size={11} fill="white" />
                          Foto Utama
                        </div>
                      )}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '8px',
                          left: '8px',
                          backgroundColor: 'rgba(15, 23, 42, 0.75)',
                          color: 'white',
                          fontSize: '10px',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}
                      >
                        {CATEGORY_MAP[photo.category] || photo.category}
                      </div>
                    </div>

                    <div style={{ padding: '12px' }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-main)', marginBottom: '8px', minHeight: '36px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {photo.caption || 'Tanpa keterangan'}
                      </p>

                      <div className="flex-between" style={{ gap: '6px' }}>
                        {/* Set Cover Button */}
                        {!isCover ? (
                          <button
                            type="button"
                            className="btn btn-outline"
                            data-testid={`set-cover-btn-${index}`}
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                            onClick={() => handleSetCover(photo)}
                          >
                            Jadikan Sampul
                          </button>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>
                            Sampul Aktif
                          </span>
                        )}

                        {/* Reorder and Delete Controls */}
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            aria-label="Pindah ke atas"
                            data-testid={`move-up-photo-${index}`}
                            style={{ padding: '4px 6px' }}
                            disabled={index === 0}
                            onClick={() => handleReorder(index, 'up')}
                            title="Pindah ke atas"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            aria-label="Pindah ke bawah"
                            data-testid={`move-down-photo-${index}`}
                            style={{ padding: '4px 6px' }}
                            disabled={index === filteredPhotos.length - 1}
                            onClick={() => handleReorder(index, 'down')}
                            title="Pindah ke bawah"
                          >
                            <ArrowDown size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            data-testid={`delete-photo-btn-${photo.id}`}
                            style={{ padding: '4px 6px' }}
                            onClick={() => setDeletingPhotoId(photo.id)}
                            title="Hapus Foto"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Inline Delete Confirmation Dialog */}
                      {deletingPhotoId === photo.id && (
                        <div
                          style={{
                            marginTop: '10px',
                            padding: '8px',
                            borderRadius: '6px',
                            backgroundColor: '#fef2f2',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            fontSize: '11px',
                            textAlign: 'center'
                          }}
                        >
                          <p style={{ color: 'var(--danger)', marginBottom: '6px' }}>Hapus foto ini dari galeri?</p>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-danger"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => handleDeletePhoto(photo.id)}
                            >
                              Ya, Hapus
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => setDeletingPhotoId(null)}
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
