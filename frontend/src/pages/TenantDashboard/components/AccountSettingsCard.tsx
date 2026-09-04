import React from 'react';
import { ProfileFormState } from '../types';
import { useTranslation } from '../../../context/LanguageContext';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

interface AccountSettingsCardProps {
  userId: string;
  profileForm: ProfileFormState;
  setProfileForm: React.Dispatch<React.SetStateAction<ProfileFormState>>;
}

export const AccountSettingsCard: React.FC<AccountSettingsCardProps> = ({
  userId,
  profileForm,
  setProfileForm
}) => {
  const { t } = useTranslation();

  const handleNotificationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newNotif = e.target.checked;
    setProfileForm(prev => ({ ...prev, notifications: newNotif }));
    fetch(`${API_BASE}/users/profile/${userId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      body: JSON.stringify({ notifications: newNotif })
    });
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    setProfileForm(prev => ({ ...prev, language: newLang }));
    fetch(`${API_BASE}/users/profile/${userId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      body: JSON.stringify({ language: newLang })
    });
  };

  return (
    <div className="card" style={{ padding: '32px', backgroundColor: 'white' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        {t('tenant.accountSettings')}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="flex-between">
          <div>
            <strong style={{ display: 'block', fontSize: '14px' }}>Notifikasi Email & WhatsApp</strong>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Kirimkan pengingat jatuh tempo sewa kos otomatis.</span>
          </div>
          <input 
            type="checkbox" 
            checked={profileForm.notifications}
            onChange={handleNotificationChange}
          />
        </div>

        <div className="flex-between">
          <div>
            <strong style={{ display: 'block', fontSize: '14px' }}>Bahasa Aplikasi (Language)</strong>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pilih bahasa antarmuka aplikasi KOSMO.</span>
          </div>
          <select 
            className="form-select" 
            style={{ width: '130px' }}
            value={profileForm.language}
            onChange={handleLanguageChange}
          >
            <option value="Indonesia">Indonesia</option>
            <option value="English">English</option>
          </select>
        </div>
      </div>
    </div>
  );
};
