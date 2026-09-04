import React from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { isUserProfileComplete } from '../../../types/index';

interface LegalKycBannerProps {
  profileStatus: ReturnType<typeof isUserProfileComplete>;
  isEditingProfile: boolean;
  onStartEditProfile: () => void;
}

export const LegalKycBanner: React.FC<LegalKycBannerProps> = ({
  profileStatus,
  isEditingProfile,
  onStartEditProfile
}) => {
  return (
    <div 
      className="card"
      style={{ 
        padding: '24px', 
        backgroundColor: profileStatus.complete ? '#f0fdf4' : '#fffbeb',
        borderColor: profileStatus.complete ? '#bbf7d0' : '#fde68a',
        borderWidth: '1px',
        borderStyle: 'solid'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div 
            style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '12px', 
              backgroundColor: profileStatus.complete ? '#dcfce7' : '#fef3c7',
              color: profileStatus.complete ? '#16a34a' : '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            {profileStatus.complete ? <ShieldCheck size={28} /> : <AlertTriangle size={28} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: profileStatus.complete ? '#166534' : '#92400e', margin: 0 }}>
                {profileStatus.complete 
                  ? 'Profil Identitas Hukum Terverifikasi (KUHPerdata & UU ITE)' 
                  : 'Profil Identitas Belum Lengkap — Akses Sewa Kos Terkunci'}
              </h3>
              <span 
                className="badge" 
                style={{ 
                  backgroundColor: profileStatus.complete ? '#22c55e' : '#f59e0b',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '11px'
                }}
              >
                {profileStatus.complete ? '🟢 SIAP MENYEWA KOS' : '⚠️ BUTUH KELENGKAPAN KYC'}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: profileStatus.complete ? '#15803d' : '#b45309', marginTop: '6px', lineHeight: '1.5' }}>
              {profileStatus.complete 
                ? 'Data identitas legal Anda telah lengkap sesuai standar Pasal 1320 KUHPerdata dan UU ITE No. 11/2008 jo. UU No. 1/2024. Anda berhak melakukan penandatanganan digital dan pemesanan kos di KOSMO.'
                : 'Berdasarkan hukum perjanjian sewa Indonesia (KUHPerdata Pasal 1320), Anda wajib melengkapi data identitas (NIK/Paspor, Alamat Domisili, Pekerjaan, dan Kontak Darurat) sebelum dapat menandatangani kontrak dan menyewa kos.'}
            </p>
            {!profileStatus.complete && (
              <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', alignSelf: 'center' }}>
                  Data yang belum lengkap:
                </span>
                {profileStatus.missingFieldLabels.map((lbl, idx) => (
                  <span 
                    key={idx}
                    style={{ 
                      backgroundColor: '#fee2e2', 
                      color: '#b91c1c', 
                      padding: '3px 10px', 
                      borderRadius: '6px', 
                      fontSize: '11px', 
                      fontWeight: 600 
                    }}
                  >
                    ✕ {lbl}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {!isEditingProfile && !profileStatus.complete && (
          <button 
            className="btn btn-primary" 
            style={{ padding: '8px 20px', fontSize: '13px', whiteSpace: 'nowrap' }} 
            onClick={onStartEditProfile}
          >
            Lengkapi Profil Sekarang
          </button>
        )}
      </div>
    </div>
  );
};
