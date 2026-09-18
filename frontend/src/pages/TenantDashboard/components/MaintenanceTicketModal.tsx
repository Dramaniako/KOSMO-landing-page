import React, { useState } from 'react';
import { X, Wrench, AlertCircle, Loader2 } from 'lucide-react';
import { Rental, TicketCategory } from '../../../types/index';
import { request } from '../../../services/apiClient';

interface MaintenanceTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRentals: Rental[];
  onTicketSubmitted: () => void;
}

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'ac', label: 'AC / Pendingin Ruangan' },
  { value: 'plumbing', label: 'Plumbing / Saluran Air & Sanitasi' },
  { value: 'wifi', label: 'WiFi & Koneksi Internet' },
  { value: 'electricity', label: 'Kelistrikan & Saklar' },
  { value: 'cleaning', label: 'Kebersihan & Area Bersama' },
  { value: 'other', label: 'Lainnya' }
];

export const MaintenanceTicketModal: React.FC<MaintenanceTicketModalProps> = ({
  isOpen,
  onClose,
  activeRentals,
  onTicketSubmitted
}) => {
  const [rentalId, setRentalId] = useState<string>(() => activeRentals[0]?.id || '');
  const [category, setCategory] = useState<TicketCategory>('ac');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync rentalId if activeRentals changes
  React.useEffect(() => {
    if (!rentalId && activeRentals.length > 0) {
      setRentalId(activeRentals[0].id);
    }
  }, [activeRentals, rentalId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const targetRental = activeRentals.find(r => r.id === rentalId) || activeRentals[0];
    if (!targetRental) {
      setErrorMsg('Anda harus memiliki data sewa aktif untuk mengajukan tiket.');
      return;
    }

    if (title.trim().length < 3) {
      setErrorMsg('Judul tiket minimal 3 karakter.');
      return;
    }

    if (description.trim().length < 5) {
      setErrorMsg('Deskripsi kendala minimal 5 karakter.');
      return;
    }

    try {
      setIsSubmitting(true);
      await request('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          rentalId: targetRental.id,
          category,
          title: title.trim(),
          description: description.trim(),
          photoUrl: photoUrl.trim() || null
        })
      });

      // Reset form
      setTitle('');
      setDescription('');
      setPhotoUrl('');
      setErrorMsg(null);
      onTicketSubmitted();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengirim tiket pemeliharaan.';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-container" style={{ maxWidth: '520px', width: '95%' }}>
        <button className="modal-close" onClick={onClose} disabled={isSubmitting}>
          <X size={18} />
        </button>

        <div style={{ padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'var(--primary-light, #eff6ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary, #2563eb)' }}>
              <Wrench size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Ajukan Tiket Pemeliharaan</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', margin: '2px 0 0 0' }}>
                Laporkan kendala fasilitas kamar atau properti Anda ke pemilik kos.
              </p>
            </div>
          </div>

          {errorMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#dc2626', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {activeRentals.length > 1 && (
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  Pilih Properti Sewa
                </label>
                <select
                  className="form-select"
                  value={rentalId}
                  onChange={(e) => setRentalId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '14px' }}
                >
                  {activeRentals.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.propertyName || 'Properti Kos'} {r.roomNumber ? `(Kamar ${r.roomNumber})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                Kategori Kendala <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '14px' }}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                Judul Laporan <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Contoh: AC kamar bocor atau meneteskan air"
                value={title}
                maxLength={150}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '14px' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                Deskripsi Kendala <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <textarea
                className="form-input"
                rows={4}
                placeholder="Jelaskan detail masalah yang Anda alami, misalnya sejak kapan terjadi dan di area mana..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '14px', resize: 'vertical' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                Link URL Foto Kendala <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', fontWeight: 400 }}>(Opsional)</span>
              </label>
              <input
                type="url"
                className="form-input"
                placeholder="https://images.unsplash.com/... atau URL foto lain"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color, #cbd5e1)', fontSize: '14px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isSubmitting}
                style={{ padding: '10px 18px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Mengirim...</span>
                  </>
                ) : (
                  'Kirim Tiket'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
