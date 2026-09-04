import React from 'react';
import { UserCheck } from 'lucide-react';
import { User } from '../../../types/index';
import { ProfileFormState } from '../types';
import { useTranslation } from '../../../context/LanguageContext';

interface IdentityProfileCardProps {
  currentUser: User;
  profileForm: ProfileFormState;
  setProfileForm: React.Dispatch<React.SetStateAction<ProfileFormState>>;
  isEditingProfile: boolean;
  setIsEditingProfile: (val: boolean) => void;
  isSubmittingProfile: boolean;
  onStartEditProfile: () => void;
  onProfileSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}

export const IdentityProfileCard: React.FC<IdentityProfileCardProps> = ({
  currentUser,
  profileForm,
  setProfileForm,
  isEditingProfile,
  setIsEditingProfile,
  isSubmittingProfile,
  onStartEditProfile,
  onProfileSubmit
}) => {
  const { t } = useTranslation();

  return (
    <div className="card" style={{ padding: '32px', backgroundColor: 'white' }}>
      <div className="flex-between" style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserCheck size={20} style={{ color: 'var(--primary)' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Data Identitas Hukum & Akun</h3>
        </div>
        {!isEditingProfile && (
          <button className="btn btn-secondary" style={{ padding: '6px 16px' }} onClick={onStartEditProfile}>
            {t('tenant.editProfile')}
          </button>
        )}
      </div>

      {isEditingProfile ? (
        <form onSubmit={onProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Subheading: Data Akun */}
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>
            1. Informasi Dasar & Kontak
          </div>
          
          <div className="form-group">
            <label className="form-label">{t('auth.name')} (Sesuai KTP/Paspor) *</label>
            <input 
              type="text" 
              className="form-input"
              placeholder="Nama lengkap sesuai tanda pengenal"
              value={profileForm.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm({ ...profileForm, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('auth.phone')} / WhatsApp (Aktif) *</label>
            <input 
              type="tel" 
              className="form-input"
              placeholder="Contoh: 08123456789 atau +62812..."
              value={profileForm.phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm({ ...profileForm, phone: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('modal.choosePayment')}</label>
            <select 
              className="form-select"
              value={profileForm.paymentMethod}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProfileForm({ ...profileForm, paymentMethod: e.target.value })}
            >
              <option value="Virtual Account">Virtual Account (BCA / Mandiri / BNI / BRI)</option>
              <option value="Kartu Kredit">Credit Card / Debit Online</option>
              <option value="E-Wallet">GoPay / QRIS / ShopeePay</option>
            </select>
          </div>

          {/* Subheading: Identitas Hukum */}
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
            2. Identitas Legal (Wajib Kontrak Sewa)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Jenis ID *</label>
              <select
                className="form-select"
                value={profileForm.identity_type}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => 
                  setProfileForm({ ...profileForm, identity_type: e.target.value as 'NIK' | 'PASSPORT' })
                }
              >
                <option value="NIK">NIK (KTP)</option>
                <option value="PASSPORT">Paspor</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">
                {profileForm.identity_type === 'NIK' ? 'Nomor NIK KTP (16 Digit) *' : 'Nomor Paspor *'}
              </label>
              <input 
                type="text" 
                className="form-input"
                placeholder={profileForm.identity_type === 'NIK' ? 'Contoh: 5171012308980001' : 'Contoh: A12345678'}
                maxLength={profileForm.identity_type === 'NIK' ? 16 : 15}
                value={profileForm.identity_number}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = profileForm.identity_type === 'NIK' 
                    ? e.target.value.replace(/\D/g, '') 
                    : e.target.value.toUpperCase();
                  setProfileForm({ ...profileForm, identity_number: val });
                }}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Alamat Domisili / Sesuai KTP *</label>
            <textarea 
              className="form-input"
              rows={2}
              placeholder="Jalan, RT/RW, Kelurahan, Kecamatan, Kota/Kabupaten, Provinsi"
              value={profileForm.address}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setProfileForm({ ...profileForm, address: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Pekerjaan / Profesi / Instansi *</label>
            <input 
              type="text" 
              className="form-input"
              placeholder="Contoh: Software Engineer / Mahasiswa / Wirausaha"
              value={profileForm.occupation}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm({ ...profileForm, occupation: e.target.value })}
              required
            />
          </div>

          {/* Subheading: Kontak Darurat */}
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
            3. Kontak Darurat (Emergency Contact)
          </div>

          <div className="form-group">
            <label className="form-label">Nama Lengkap Kontak Darurat *</label>
            <input 
              type="text" 
              className="form-input"
              placeholder="Nama kerabat atau orang tua"
              value={profileForm.emergency_contact_name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm({ ...profileForm, emergency_contact_name: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Hubungan *</label>
              <select
                className="form-select"
                value={profileForm.emergency_contact_relation}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProfileForm({ ...profileForm, emergency_contact_relation: e.target.value })}
              >
                <option value="Orang Tua">Orang Tua</option>
                <option value="Saudara Kandung">Saudara Kandung</option>
                <option value="Pasangan">Pasangan (Suami/Istri)</option>
                <option value="Keluarga/Kerabat">Keluarga / Kerabat</option>
                <option value="Teman/Rekan Kerja">Teman / Rekan Kerja</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Nomor Telepon Darurat *</label>
              <input 
                type="tel" 
                className="form-input"
                placeholder="Contoh: 081234567899"
                value={profileForm.emergency_contact_phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm({ ...profileForm, emergency_contact_phone: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={isSubmittingProfile}
            >
              {isSubmittingProfile ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span style={{ width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
                  <span>{t('tenant.saving') || 'Menyimpan...'}</span>
                </span>
              ) : (
                t('tenant.saveProfile')
              )}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsEditingProfile(false)}
              disabled={isSubmittingProfile}
            >
              {t('tenant.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('auth.name')}</span>
            <strong>{currentUser.name}</strong>
          </div>
          <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('auth.email')}</span>
            <strong>{currentUser.email}</strong>
          </div>
          <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('auth.phone')}</span>
            <strong>{currentUser.phone || '-'}</strong>
          </div>
          <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Jenis & No. Identitas</span>
            <strong>
              {currentUser.identity_number ? `${currentUser.identity_type || 'NIK'}: ${currentUser.identity_number}` : <span style={{ color: 'var(--danger)' }}>Belum Diisi</span>}
            </strong>
          </div>
          <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Pekerjaan / Profesi</span>
            <strong>{currentUser.occupation || <span style={{ color: 'var(--danger)' }}>Belum Diisi</span>}</strong>
          </div>
          <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Alamat Domisili KTP</span>
            <strong style={{ maxWidth: '60%', textAlign: 'right' }}>
              {currentUser.address || <span style={{ color: 'var(--danger)' }}>Belum Diisi</span>}
            </strong>
          </div>
          <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Kontak Darurat</span>
            <strong>
              {currentUser.emergency_contact_name 
                ? `${currentUser.emergency_contact_name} (${currentUser.emergency_contact_relation || 'Darurat'}: ${currentUser.emergency_contact_phone})`
                : <span style={{ color: 'var(--danger)' }}>Belum Diisi</span>}
            </strong>
          </div>
          <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Metode Pembayaran</span>
            <strong>{currentUser.paymentMethod || 'Virtual Account'}</strong>
          </div>
          <div className="flex-between">
            <span style={{ color: 'var(--text-muted)' }}>{t('auth.role')}</span>
            <span className="badge badge-primary">{currentUser.role.toUpperCase()}</span>
          </div>
        </div>
      )}
    </div>
  );
};
