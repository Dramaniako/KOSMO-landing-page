import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../../types/index';
import { ProfileFormState } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

interface UseTenantProfileParams {
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
  onLogout: () => void;
}

export function useTenantProfile({
  currentUser,
  setCurrentUser,
  onLogout
}: UseTenantProfileParams) {
  const navigate = useNavigate();

  const [profileForm, setProfileForm] = useState<ProfileFormState>(() => ({
    name: currentUser?.name || '',
    phone: currentUser?.phone || '',
    paymentMethod: currentUser?.paymentMethod || 'Virtual Account',
    notifications: currentUser?.notifications !== undefined 
      ? (typeof currentUser.notifications === 'number' ? currentUser.notifications === 1 : Boolean(currentUser.notifications)) 
      : true,
    language: currentUser?.language || 'Indonesia',
    identity_type: (currentUser?.identity_type as 'NIK' | 'PASSPORT') || 'NIK',
    identity_number: currentUser?.identity_number || '',
    address: currentUser?.address || '',
    occupation: currentUser?.occupation || '',
    emergency_contact_name: currentUser?.emergency_contact_name || '',
    emergency_contact_relation: currentUser?.emergency_contact_relation || 'Orang Tua',
    emergency_contact_phone: currentUser?.emergency_contact_phone || '',
    date_of_birth: currentUser?.date_of_birth || '',
    gender: currentUser?.gender || ''
  }));

  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState<boolean>(false);

  const handleStartEditProfile = (): void => {
    if (currentUser) {
      setProfileForm({
        name: currentUser.name || '',
        phone: currentUser.phone || '',
        paymentMethod: currentUser.paymentMethod || 'Virtual Account',
        notifications: currentUser.notifications !== undefined 
          ? (typeof currentUser.notifications === 'number' ? currentUser.notifications === 1 : Boolean(currentUser.notifications)) 
          : true,
        language: currentUser.language || 'Indonesia',
        identity_type: (currentUser.identity_type as 'NIK' | 'PASSPORT') || 'NIK',
        identity_number: currentUser.identity_number || '',
        address: currentUser.address || '',
        occupation: currentUser.occupation || '',
        emergency_contact_name: currentUser.emergency_contact_name || '',
        emergency_contact_relation: currentUser.emergency_contact_relation || 'Orang Tua',
        emergency_contact_phone: currentUser.emergency_contact_phone || '',
        date_of_birth: currentUser.date_of_birth || '',
        gender: currentUser.gender || ''
      });
    }
    setIsEditingProfile(true);
  };

  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!currentUser || isSubmittingProfile) return;
    setIsSubmittingProfile(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      if (!token) {
        navigate('/login');
        return;
      }
      const payload = {
        ...profileForm,
        notifications: Boolean(profileForm.notifications)
      };
      const res = await fetch(`${API_BASE}/users/profile/${currentUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.status === 401) {
        alert("Sesi Anda telah berakhir. Silakan masuk kembali.");
        onLogout();
        return;
      }
      const data = (await res.json()) as { message: string; user: User };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setCurrentUser(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
      setIsEditingProfile(false);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    } finally {
      setIsSubmittingProfile(false);
    }
  };

  return {
    profileForm,
    setProfileForm,
    isEditingProfile,
    setIsEditingProfile,
    isSubmittingProfile,
    handleStartEditProfile,
    handleProfileSubmit
  };
}
