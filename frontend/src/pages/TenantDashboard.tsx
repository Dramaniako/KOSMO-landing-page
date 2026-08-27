import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User as UserIcon, Bell, HelpCircle, FileText, Star, Edit, Trash2, 
  Plus, LogOut, Globe, MessageSquare, Building, X, Download, Home, Compass, History, Calendar,
  ShieldCheck, AlertTriangle, CheckCircle2, UserCheck, MapPin, Briefcase, PhoneCall,
  CreditCard, AlertCircle
} from 'lucide-react';
import { User, Property, Review, Rental, isUserProfileComplete } from '../types/index';
import ThemeLanguageToggle from '../components/ThemeLanguageToggle';
import { useTranslation } from '../context/LanguageContext';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

interface ReviewFormState {
  propertyId: string;
  rating: number;
  comment: string;
}

interface ProfileFormState {
  name: string;
  phone: string;
  paymentMethod: string;
  notifications: boolean;
  language: string;
  identity_type: 'NIK' | 'PASSPORT';
  identity_number: string;
  address: string;
  occupation: string;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_phone: string;
  date_of_birth: string;
  gender: string;
}

export default function TenantDashboard() {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const [activeTab, setActiveTab] = useState<'profile' | 'rentals' | 'bills' | 'reviews'>('profile');
  
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const [properties, setProperties] = useState<Property[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [myRentals, setMyRentals] = useState<Rental[]>([]);

  // Terminate Rental States
  const [showTerminateModal, setShowTerminateModal] = useState<boolean>(false);
  const [terminateRental, setTerminateRental] = useState<Rental | null>(null);
  const [terminatePassword, setTerminatePassword] = useState<string>('');
  const [terminateProcessing, setTerminateProcessing] = useState<boolean>(false);

  // Pending Payment Modal States
  const [showPendingPaymentModal, setShowPendingPaymentModal] = useState<boolean>(false);
  const [selectedPendingRental, setSelectedPendingRental] = useState<Rental | null>(null);
  const [pendingPaymentProcessing, setPendingPaymentProcessing] = useState<boolean>(false);
  const [pendingPaymentError, setPendingPaymentError] = useState<string | null>(null);
  
  const [showRevModal, setShowRevModal] = useState<boolean>(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  
  // Review form states
  const [reviewForm, setReviewForm] = useState<ReviewFormState>({
    propertyId: '',
    rating: 5,
    comment: ''
  });

  // Profile Edit form states
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() => ({
    name: currentUser?.name || '',
    phone: currentUser?.phone || '',
    paymentMethod: currentUser?.paymentMethod || 'Virtual Account',
    notifications: currentUser?.notifications !== undefined ? (typeof currentUser.notifications === 'number' ? currentUser.notifications === 1 : Boolean(currentUser.notifications)) : true,
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
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  const [contractDownloading, setContractDownloading] = useState<Record<string, boolean>>({});
  const loadedTabs = useRef<Set<string>>(new Set(['profile']));

  const handleOpenContract = async (rentalId: string): Promise<void> => {
    setContractDownloading(prev => ({ ...prev, [rentalId]: true }));
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/contract?download=true`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        throw new Error('Gagal memuat dokumen kontrak PDF.');
      }
      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `kontrak_sewa_${rentalId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuka kontrak.';
      alert(msg);
    } finally {
      setContractDownloading(prev => ({ ...prev, [rentalId]: false }));
    }
  };

  const handleOpenPendingPayment = (rental: Rental): void => {
    setSelectedPendingRental(rental);
    setPendingPaymentError(null);
    setShowPendingPaymentModal(true);
  };

  const handleProcessPendingPayment = async (): Promise<void> => {
    if (!selectedPendingRental || !currentUser) return;
    setPendingPaymentProcessing(true);
    setPendingPaymentError(null);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // 1. Request payment token for this rental
      const duration = Number(selectedPendingRental.duration_months || 1);
      const tokenRes = await fetch(`${API_BASE}/payment/token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          propertyId: selectedPendingRental.propertyId,
          propertyName: selectedPendingRental.propertyName,
          price: selectedPendingRental.price,
          tenantId: currentUser.id,
          tenantName: currentUser.name,
          tenantEmail: currentUser.email,
          durationMonths: duration,
          rentalId: selectedPendingRental.id
        })
      });

      if (!tokenRes.ok) {
        const errorData = (await tokenRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorData.message || 'Gagal menyiapkan transaksi pembayaran.');
      }

      const tokenData = (await tokenRes.json()) as {
        token?: string;
        snapToken?: string;
        rentalId: string;
      };
      const snapToken = tokenData.snapToken || tokenData.token;

      const finishPayment = async () => {
        const finishRes = await fetch(`${API_BASE}/payment/finish`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ rentalId: selectedPendingRental.id })
        });
        if (!finishRes.ok) {
          const finishErr = (await finishRes.json().catch(() => ({}))) as { message?: string };
          throw new Error(finishErr.message || 'Gagal mengaktifkan sewa kos.');
        }
        await fetchMyRentals(currentUser.id);
        setShowPendingPaymentModal(false);
        setSelectedPendingRental(null);
      };

      if (typeof window === 'undefined' || !window.snap || !snapToken || snapToken.startsWith('snap-token-')) {
        await finishPayment();
        return;
      }

      if (!snapToken) {
        throw new Error('Token pembayaran tidak ditemukan dari server.');
      }

      window.snap.pay(snapToken, {
        onSuccess: async (result: unknown) => {
          console.log('Pending payment completed successfully:', result);
          try {
            await finishPayment();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Gagal menyelesaikan sewa.';
            setPendingPaymentError(msg);
          }
        },
        onPending: (result: unknown) => {
          console.log('Payment pending in Snap:', result);
          setShowPendingPaymentModal(false);
        },
        onError: (err: unknown) => {
          console.error('Payment error in Snap:', err);
          setPendingPaymentError('Pembayaran gagal atau dibatalkan.');
        },
        onClose: () => {
          console.log('Payment popup closed by user.');
        }
      });
    } catch (err: unknown) {
      console.error('Process pending payment error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setPendingPaymentError(msg);
    } finally {
      setPendingPaymentProcessing(false);
    }
  };

  const fetchMyRentals = useCallback(async (userId: string): Promise<void> => {
    setTabLoading(prev => ({ ...prev, rentals: true, bills: true }));
    try {
      const token = localStorage.getItem('token');
      const rentRes = await fetch(`${API_BASE}/rentals?tenantId=${encodeURIComponent(userId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!rentRes.ok) {
        setMyRentals([]);
        return;
      }
      const rentData = (await rentRes.json()) as Rental[];
      setMyRentals(Array.isArray(rentData) ? rentData : []);
      loadedTabs.current.add('rentals');
      loadedTabs.current.add('bills');
    } catch (err) {
      console.error("Error loading rentals:", err);
      setMyRentals([]);
    } finally {
      setTabLoading(prev => ({ ...prev, rentals: false, bills: false }));
    }
  }, []);

  const fetchProperties = useCallback(async (): Promise<void> => {
    try {
      const propRes = await fetch(`${API_BASE}/properties`);
      if (!propRes.ok) {
        setProperties([]);
        return;
      }
      const propData = (await propRes.json()) as Property[];
      const safeProps = Array.isArray(propData) ? propData : [];
      setProperties(safeProps);
      if (safeProps.length > 0) {
        setReviewForm((prev) => ({ ...prev, propertyId: prev.propertyId || safeProps[0].id }));
      }
    } catch (err) {
      console.error("Error loading properties:", err);
      setProperties([]);
    }
  }, []);

  const fetchMyReviews = useCallback(async (userId: string): Promise<void> => {
    setTabLoading(prev => ({ ...prev, reviews: true }));
    try {
      const [revRes] = await Promise.all([
        fetch(`${API_BASE}/reviews?userId=${encodeURIComponent(userId)}`),
        fetchProperties()
      ]);
      if (!revRes.ok) {
        setMyReviews([]);
        return;
      }
      const revData = (await revRes.json()) as Review[];
      setMyReviews(Array.isArray(revData) ? revData : []);
      loadedTabs.current.add('reviews');
    } catch (err) {
      console.error("Error loading reviews:", err);
      setMyReviews([]);
    } finally {
      setTabLoading(prev => ({ ...prev, reviews: false }));
    }
  }, [fetchProperties]);

  useEffect(() => {
    if (!currentUser || (currentUser.role !== 'tenant' && currentUser.role !== 'landlord')) {
      navigate('/login');
      return;
    }

    if ((activeTab === 'rentals' || activeTab === 'bills') && !loadedTabs.current.has('rentals')) {
      fetchMyRentals(currentUser.id);
    } else if (activeTab === 'reviews' && !loadedTabs.current.has('reviews')) {
      fetchMyReviews(currentUser.id);
    }
  }, [currentUser, navigate, activeTab, fetchMyRentals, fetchMyReviews]);

  const handleLogout = (): void => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/');
  };

  const handleStartEditProfile = (): void => {
    if (currentUser) {
      setProfileForm({
        name: currentUser.name || '',
        phone: currentUser.phone || '',
        paymentMethod: currentUser.paymentMethod || 'Virtual Account',
        notifications: currentUser.notifications !== undefined ? (typeof currentUser.notifications === 'number' ? currentUser.notifications === 1 : Boolean(currentUser.notifications)) : true,
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
        handleLogout();
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

  const resetReviewForm = async (): Promise<void> => {
    setEditingReview(null);
    if (properties.length === 0) {
      await fetchProperties();
    }
    setReviewForm({
      propertyId: properties[0]?.id || '',
      rating: 5,
      comment: ''
    });
  };

  // Create or Update Review submit
  const handleReviewSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!currentUser) return;
    if (!reviewForm.propertyId || !reviewForm.comment) {
      alert("Properti dan komentar ulasan wajib diisi.");
      return;
    }

    const payload = editingReview 
      ? { rating: reviewForm.rating, comment: reviewForm.comment }
      : { 
          propertyId: reviewForm.propertyId, 
          userId: currentUser.id, 
          userName: currentUser.name, 
          rating: reviewForm.rating, 
          comment: reviewForm.comment 
        };

    const url = editingReview 
      ? `${API_BASE}/reviews/${editingReview.id}`
      : `${API_BASE}/reviews`;

    const method = editingReview ? 'PUT' : 'POST';

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      if (!token) {
        navigate('/login');
        return;
      }
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.status === 401) {
        alert("Sesi Anda telah berakhir. Silakan masuk kembali.");
        handleLogout();
        return;
      }
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowRevModal(false);
      resetReviewForm();
      await fetchMyReviews(currentUser.id);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const handleEditReview = async (rev: Review): Promise<void> => {
    setEditingReview(rev);
    if (properties.length === 0) {
      await fetchProperties();
    }
    setReviewForm({
      propertyId: rev.propertyId,
      rating: rev.rating,
      comment: rev.comment
    });
    setShowRevModal(true);
  };

  const handleDeleteReview = async (id: string): Promise<void> => {
    if (!currentUser) return;
    if (!window.confirm("Apakah Anda yakin ingin menghapus review ini?")) return;

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      if (!token) {
        navigate('/login');
        return;
      }
      const res = await fetch(`${API_BASE}/reviews/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.status === 401) {
        alert("Sesi Anda telah berakhir. Silakan masuk kembali.");
        handleLogout();
        return;
      }
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      await fetchMyReviews(currentUser.id);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  if (!currentUser) return null;

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          {/* Tenant short profile summary */}
          <div style={{ textAlign: 'center', marginBottom: '32px', padding: '0 8px' }}>
            <div style={{ position: 'relative', width: '72px', height: '72px', margin: '0 auto 12px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserIcon size={36} style={{ color: 'var(--primary)' }} />
              <div style={{ position: 'absolute', bottom: '0', right: '0', background: 'var(--success)', border: '2px solid white', width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '6px', height: '6px', backgroundColor: 'white', borderRadius: '50%' }}></div>
              </div>
            </div>
            <h3 style={{ fontSize: '18px' }}>{currentUser.name}</h3>
            <span className="badge badge-success" style={{ fontSize: '10px', marginTop: '6px' }}>
              Akun Terverifikasi
            </span>
          </div>

          <ul className="sidebar-links">
            <li>
              <button 
                className={`sidebar-link ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                <UserIcon size={18} />
                {t('tenant.tab.profile')}
              </button>
            </li>
            <li>
              <button 
                className={`sidebar-link ${activeTab === 'rentals' ? 'active' : ''}`}
                onClick={() => setActiveTab('rentals')}
              >
                <Building size={18} />
                {t('tenant.tab.rentals')}
              </button>
            </li>
            <li>
              <button 
                className={`sidebar-link ${activeTab === 'bills' ? 'active' : ''}`}
                onClick={() => setActiveTab('bills')}
              >
                <FileText size={18} />
                {t('tenant.tab.bills')}
              </button>
            </li>
            <li>
              <button 
                className={`sidebar-link ${activeTab === 'reviews' ? 'active' : ''}`}
                onClick={() => setActiveTab('reviews')}
              >
                <MessageSquare size={18} />
                {t('tenant.tab.reviews')}
              </button>
            </li>
            {currentUser.role === 'landlord' && (
              <li>
                <button 
                  className="sidebar-link"
                  style={{ color: 'var(--primary)' }}
                  onClick={() => navigate('/landlord')}
                >
                  <Building size={18} />
                  Sesi Landlord
                </button>
              </li>
            )}
          </ul>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
          <button className="sidebar-link" style={{ width: '100%', border: 'none', background: 'none', color: 'var(--danger)' }} onClick={handleLogout}>
            <LogOut size={18} />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-content">
        <header style={{ marginBottom: '32px' }} className="flex-between flex-wrap gap-4">
          <div>
            <h1 style={{ fontSize: '28px' }}>{t('tenant.welcome', { name: currentUser.name })}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '2px' }}>
              {t('tenant.title')} &bull; KOSMO Bali Co-Living
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeLanguageToggle />
            <button className="btn btn-outline" onClick={() => navigate('/')}>
              {t('tenant.exploreKos')}
            </button>
          </div>
        </header>

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (() => {
          const profileStatus = isUserProfileComplete(currentUser);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Statutory Legal Verification Status Banner */}
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
                      onClick={() => setIsEditingProfile(true)}
                    >
                      Lengkapi Profil Sekarang
                    </button>
                  )}
                </div>
              </div>

              <div className="grid-2">
                {/* Left Card: Account & KYC Legal Profile */}
                <div className="card" style={{ padding: '32px', backgroundColor: 'white' }}>
                  <div className="flex-between" style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <UserCheck size={20} style={{ color: 'var(--primary)' }} />
                      <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Data Identitas Hukum & Akun</h3>
                    </div>
                    {!isEditingProfile && (
                      <button className="btn btn-secondary" style={{ padding: '6px 16px' }} onClick={handleStartEditProfile}>
                        {t('tenant.editProfile')}
                      </button>
                    )}
                  </div>

                  {isEditingProfile ? (
                    <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

                {/* Right Column: Settings & Statutory Legal Information */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Account Settings (Notifications / Language) */}
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
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const newNotif = e.target.checked;
                            setProfileForm({ ...profileForm, notifications: newNotif });
                            fetch(`${API_BASE}/users/profile/${currentUser.id}`, {
                              method: 'PUT',
                              headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                              },
                              body: JSON.stringify({ notifications: newNotif })
                            });
                          }}
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
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const newLang = e.target.value;
                            setProfileForm({ ...profileForm, language: newLang });
                            fetch(`${API_BASE}/users/profile/${currentUser.id}`, {
                              method: 'PUT',
                              headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                              },
                              body: JSON.stringify({ language: newLang })
                            });
                          }}
                        >
                          <option value="Indonesia">Indonesia</option>
                          <option value="English">English</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Legal Compliance Card */}
                  <div className="card" style={{ padding: '24px', backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <FileText size={20} style={{ color: 'var(--primary)' }} />
                      <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)' }}>
                        Ketetapan Hukum E-Kontrak Sewa KOSMO
                      </h4>
                    </div>
                    <ul style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6', paddingLeft: '18px', margin: 0 }}>
                      <li><strong>Pasal 1320 KUHPerdata:</strong> Perjanjian sewa menyewa sah jika memuat kesepakatan, kecakapan, objek tertentu, dan sebab yang halal.</li>
                      <li><strong>UU ITE No. 11/2008 jo. UU No. 1/2024:</strong> Tanda tangan digital dan dokumen elektronik memiliki kekuatan hukum dan akibat hukum yang sah.</li>
                      <li><strong>Ketentuan Domisili & Yurisdiksi:</strong> Seluruh sengketa tunduk pada yurisdiksi Pengadilan Negeri Denpasar / Badung, Bali.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* RENTALS TAB */}
        {activeTab === 'rentals' && (() => {
          const activeRental = myRentals.find((r) => r.status === 'active');
          const otherRentals = myRentals.filter((r) => r.status !== 'active');

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* SECTION 1: Hunian Aktif Saya */}
              <div className="card" style={{ padding: '28px', backgroundColor: 'white' }}>
                <div className="flex-between" style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Home size={20} style={{ color: 'var(--primary)' }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{t('tenant.activeSection')}</h3>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('tenant.activeDesc')}</p>
                    </div>
                  </div>
                </div>

                {tabLoading.rentals && !loadedTabs.current.has('rentals') ? (
                  <div className="flex-center" style={{ height: '160px', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat data sewa kos...</p>
                  </div>
                ) : activeRental ? (
                  <div className="flex-between flex-wrap gap-4" style={{ padding: '20px', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', background: '#f0fdf4' }}>
                    <div style={{ flex: 1, minWidth: '280px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <span className="badge badge-success" style={{ fontSize: '11px', display: 'inline-block' }}>
                          {t('tenant.active')}
                        </span>
                        {activeRental.paymentStatus && (
                          <span
                            className="badge"
                            style={{
                              fontSize: '11px',
                              backgroundColor: activeRental.daysRemaining === 0 ? '#fee2e2' : activeRental.daysRemaining !== undefined && activeRental.daysRemaining <= 3 ? '#fef3c7' : '#dcfce7',
                              color: activeRental.daysRemaining === 0 ? '#b91c1c' : activeRental.daysRemaining !== undefined && activeRental.daysRemaining <= 3 ? '#92400e' : '#166534',
                              border: activeRental.daysRemaining === 0 ? '1px solid #fca5a5' : activeRental.daysRemaining !== undefined && activeRental.daysRemaining <= 3 ? '1px solid #fde68a' : '1px solid #bbf7d0'
                            }}
                          >
                            {activeRental.paymentStatus}
                          </span>
                        )}
                      </div>
                      <h4 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--dark)' }}>{activeRental.propertyName}</h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {t('tenant.startDate')}: <strong>{activeRental.startDate}</strong> &bull; All-Inclusive
                      </p>

                      {/* Next Payment Due Date & Countdown */}
                      {activeRental.nextPaymentDate && (
                        <div className="mt-3 p-2.5 px-3.5 bg-white/90 dark:bg-slate-800/90 border border-emerald-300 dark:border-emerald-700/50 rounded-lg inline-flex items-center gap-3 flex-wrap">
                          <div className="text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <Calendar size={14} className="text-blue-600 dark:text-blue-400" />
                            <span className="text-slate-500 dark:text-slate-400 font-medium">{t('tenant.nextDue')}:</span>{' '}
                            <strong className="text-slate-900 dark:text-slate-100">{activeRental.nextPaymentDate}</strong>
                          </div>
                          {activeRental.daysRemaining !== undefined && (
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              activeRental.daysRemaining === 0 
                                ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800' 
                                : activeRental.daysRemaining <= 3 
                                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800' 
                                  : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            }`}>
                              {t('tenant.daysLeft', { days: activeRental.daysRemaining })}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Cryptographic Contract Verification Badge */}
                      {activeRental.contract_hash && (
                        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            {t('tenant.contractHash')} {activeRental.contract_hash.slice(0, 16)}...
                          </span>
                          {activeRental.contract_signed_at && (
                            <span className="text-slate-400 dark:text-slate-500">
                              &bull; {t('tenant.signedAt')} {new Date(activeRental.contract_signed_at).toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '20px', color: 'var(--primary)', display: 'block' }}>
                        Rp {activeRental.price ? activeRental.price.toLocaleString('id-ID') : '0'}/bln
                      </strong>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenContract(activeRental.id)}
                          disabled={contractDownloading[activeRental.id]}
                          className="btn btn-outline"
                          style={{ padding: '6px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          title={activeRental.contract_hash ? `SHA-256: ${activeRental.contract_hash}` : undefined}
                        >
                          <FileText size={14} />
                          {contractDownloading[activeRental.id] ? 'Memuat PDF...' : t('tenant.viewContract')}
                        </button>
                        <button 
                          className="btn btn-outline btn-danger" 
                          style={{ padding: '6px 14px', fontSize: '12px' }}
                          onClick={() => {
                            setTerminateRental(activeRental);
                            setShowTerminateModal(true);
                          }}
                        >
                          {t('tenant.terminateBtn')}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '36px 20px', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)' }}>
                    <div style={{ width: '48px', height: '48px', margin: '0 auto 12px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Home size={24} style={{ color: '#94a3b8' }} />
                    </div>
                    <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--dark)' }}>{t('tenant.noActive')}</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '18px' }}>
                      {t('tenant.noActiveDesc')}
                    </p>
                    <button className="btn btn-primary" onClick={() => navigate('/')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Compass size={16} />
                      {t('tenant.exploreKos')}
                    </button>
                  </div>
                )}
              </div>

              {/* SECTION 2: Riwayat & Transaksi Sewa */}
              {otherRentals.length > 0 && (
                <div className="card" style={{ padding: '28px', backgroundColor: 'white' }}>
                  <div className="flex-between" style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <History size={20} style={{ color: 'var(--text-muted)' }} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{t('tenant.pastSection')}</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('tenant.pastDesc', { count: otherRentals.length })}</p>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {otherRentals.map((rent) => {
                      const isPending = rent.status === 'pending';

                      return (
                        <div
                          key={rent.id}
                          className="flex-between flex-wrap gap-3"
                          style={{
                            padding: '16px 20px',
                            border: isPending ? '1px solid #fde68a' : '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            background: isPending ? '#fffbeb' : '#f8fafc'
                          }}
                        >
                          <div>
                            {isPending ? (
                              <span
                                className="badge"
                                style={{
                                  marginBottom: '6px',
                                  fontSize: '10px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e',
                                  border: '1px solid #fde68a',
                                  fontWeight: 700
                                }}
                              >
                                <AlertCircle size={11} />
                                {t('tenant.pendingBadge')}
                              </span>
                            ) : (
                              <span
                                className="badge badge-secondary"
                                style={{
                                  marginBottom: '6px',
                                  fontSize: '10px',
                                  display: 'inline-block',
                                  backgroundColor: '#e2e8f0',
                                  color: '#475569'
                                }}
                              >
                                {rent.status === 'terminated' ? t('tenant.completed') : rent.status === 'cancelled' ? 'Dibatalkan' : t('tenant.completed')}
                              </span>
                            )}
                            <h4 style={{ fontSize: '15px', fontWeight: 600, color: isPending ? '#92400e' : '#334155' }}>
                              {rent.propertyName}
                            </h4>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {t('tenant.startDate')}: {rent.startDate}
                            </p>
                            {rent.contract_hash && (
                              <p style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>
                                SHA-256: {rent.contract_hash.slice(0, 16)}...
                              </p>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong style={{ fontSize: '16px', color: isPending ? '#b45309' : '#64748b', display: 'block' }}>
                              Rp {rent.price ? rent.price.toLocaleString('id-ID') : '0'}/bln
                            </strong>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenContract(rent.id)}
                                disabled={contractDownloading[rent.id]}
                                className="btn btn-outline"
                                style={{ padding: '4px 12px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <FileText size={12} />
                                {contractDownloading[rent.id] ? 'Memuat...' : t('tenant.viewContract')}
                              </button>
                              {isPending && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPendingPayment(rent)}
                                  className="btn btn-primary"
                                  style={{
                                    padding: '4px 12px',
                                    fontSize: '11px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontWeight: 600
                                  }}
                                >
                                  <CreditCard size={12} />
                                  {t('tenant.payNow')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          );
        })()}

        {/* BILLING HISTORY TAB */}
        {activeTab === 'bills' && (
          <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '24px' }}>Riwayat Transaksi & Tagihan</h3>

            {tabLoading.bills && !loadedTabs.current.has('bills') ? (
              <div className="flex-center" style={{ height: '160px', flexDirection: 'column', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat riwayat tagihan...</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="flex-between" style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: '#ffffff' }}>
                  <div>
                    <span className="badge badge-success" style={{ marginBottom: '6px', fontSize: '10px' }}>Berhasil</span>
                    <h4 style={{ fontSize: '15px' }}>KOSMO Hub Denpasar (Kamar 101)</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Invoice: INV-KSM-0526-782 &bull; Tanggal: 3 Jun 2026</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tagihan: All-Inclusive (Sewa, Listrik, Air)</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ fontSize: '18px', color: 'var(--dark)' }}>Rp 3.500.000</strong>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>Via BCA Virtual Account</span>
                  </div>
                </div>

                <div className="flex-between" style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: '#ffffff' }}>
                  <div>
                    <span className="badge badge-success" style={{ marginBottom: '6px', fontSize: '10px' }}>Berhasil</span>
                    <h4 style={{ fontSize: '15px' }}>KOSMO Hub Denpasar (Kamar 101) - Deposit</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Invoice: INV-KSM-0526-462 &bull; Tanggal: 3 Jun 2026</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tagihan: Deposit Awal Jaminan Kamar</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ fontSize: '18px', color: 'var(--dark)' }}>Rp 550.000</strong>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>Via BCA Virtual Account</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* REVIEWS TAB (CRUD Reviews) */}
        {activeTab === 'reviews' && (
          <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
            <div className="flex-between" style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px' }}>Ulasan Sewa Saya ({myReviews.length})</h3>
              <button 
                className="btn btn-primary" 
                onClick={async () => { await resetReviewForm(); setShowRevModal(true); }}
                disabled={properties.length === 0}
              >
                <Plus size={16} />
                Tulis Review Baru
              </button>
            </div>

            {tabLoading.reviews && !loadedTabs.current.has('reviews') ? (
              <div className="flex-center" style={{ height: '160px', flexDirection: 'column', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat ulasan saya...</p>
              </div>
            ) : myReviews.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <p style={{ fontStyle: 'italic', fontSize: '14px' }}>Anda belum menulis ulasan apapun.</p>
                <button className="btn btn-secondary" style={{ marginTop: '16px' }} onClick={async () => { await resetReviewForm(); setShowRevModal(true); }}>
                  Tulis Review Pertama Anda
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {myReviews.map((rev) => (
                  <div key={rev.id} style={{ padding: '20px', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }} className="flex-between">
                    <div style={{ flex: 1, marginRight: '24px' }}>
                      <div className="flex-between" style={{ marginBottom: '6px' }}>
                        <strong style={{ fontSize: '15px' }}>{rev.propertyName}</strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{rev.date}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            size={12} 
                            style={{ 
                              fill: i < rev.rating ? '#f59e0b' : 'transparent', 
                              color: i < rev.rating ? '#f59e0b' : '#cbd5e1' 
                            }} 
                          />
                        ))}
                      </div>

                      <p style={{ fontSize: '13px', color: 'var(--text-main)', fontStyle: 'italic' }}>
                        "{rev.comment}"
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => handleEditReview(rev)}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px 12px' }} onClick={() => handleDeleteReview(rev.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Review Write/Edit Modal */}
      {showRevModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '450px' }}>
            <button className="modal-close" onClick={() => { setShowRevModal(false); setEditingReview(null); }}>
              <X size={18} />
            </button>
            <div style={{ padding: '32px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>
                {editingReview ? 'Edit Ulasan Anda' : 'Tulis Ulasan Baru'}
              </h3>

              <form onSubmit={handleReviewSubmit}>
                {!editingReview && (
                  <div className="form-group">
                    <label className="form-label">Pilih Properti</label>
                    <select 
                      className="form-select"
                      value={reviewForm.propertyId}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReviewForm({ ...reviewForm, propertyId: e.target.value })}
                    >
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.district})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Rating Anda</label>
                  <select 
                    className="form-select"
                    value={reviewForm.rating}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReviewForm({ ...reviewForm, rating: parseInt(e.target.value, 10) })}
                  >
                    <option value={5}>5 Bintang (Sangat Puas)</option>
                    <option value={4}>4 Bintang (Puas)</option>
                    <option value={3}>3 Bintang (Cukup)</option>
                    <option value={2}>2 Bintang (Buruk)</option>
                    <option value={1}>1 Bintang (Sangat Buruk)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '24px' }}>
                  <label className="form-label">Komentar Ulasan</label>
                  <textarea 
                    className="form-textarea" 
                    rows={4}
                    placeholder="Berikan ulasan jujur mengenai fasilitas, kebersihan, dan kenyamanan hunian..."
                    value={reviewForm.comment}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                    required
                  ></textarea>
                </div>

                <div className="flex-between">
                  <button type="button" className="btn btn-outline" onClick={() => { setShowRevModal(false); setEditingReview(null); }}>
                    Batal
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Kirim Ulasan
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Security Password Confirmation Modal for Rental Termination */}
      {showTerminateModal && terminateRental && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '400px' }}>
            <button className="modal-close" onClick={() => { setShowTerminateModal(false); setTerminatePassword(''); }}>
              <X size={18} />
            </button>
            <div style={{ padding: '32px' }}>
              <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>Konfirmasi Penghentian Sewa</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
                Untuk berhenti menyewa <strong>{terminateRental.propertyName}</strong>, harap masukkan password akun Anda untuk konfirmasi keamanan.
              </p>
              
              <form onSubmit={async (e: React.FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                setTerminateProcessing(true);
                try {
                  const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
                  if (!token) {
                    alert("Sesi Anda telah berakhir. Silakan masuk kembali.");
                    handleLogout();
                    return;
                  }
                  const res = await fetch(`${API_BASE}/rentals/${terminateRental.id}/terminate`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ password: terminatePassword })
                  });
                  if (res.status === 401) {
                    alert("Sesi Anda telah berakhir. Silakan masuk kembali.");
                    handleLogout();
                    return;
                  }
                  const data = (await res.json()) as { message: string };
                  if (!res.ok) throw new Error(data.message);

                  alert("Sewa kos berhasil diberhentikan.");
                  setShowTerminateModal(false);
                  setTerminatePassword('');
                  await fetchMyRentals(currentUser.id);
                } catch (err: unknown) {
                  const errorMsg = err instanceof Error ? err.message : String(err);
                  alert(errorMsg);
                } finally {
                  setTerminateProcessing(false);
                }
              }}>
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="form-label" style={{ display: 'block', marginBottom: '8px' }}>Password Anda</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                    placeholder="Masukkan password"
                    value={terminatePassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTerminatePassword(e.target.value)}
                    required 
                  />
                </div>

                <div className="flex-between">
                  <button type="button" className="btn btn-outline" onClick={() => { setShowTerminateModal(false); setTerminatePassword(''); }}>
                    Batal
                  </button>
                  <button type="submit" className="btn btn-danger" disabled={terminateProcessing}>
                    {terminateProcessing ? 'Memproses...' : 'Konfirmasi Berhenti'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Pending Payment Modal */}
      {showPendingPaymentModal && selectedPendingRental && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1100, backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={() => {
            if (!pendingPaymentProcessing) {
              setShowPendingPaymentModal(false);
              setSelectedPendingRental(null);
            }
          }}
        >
          <div
            className="modal-container"
            style={{ maxWidth: '480px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => {
                if (!pendingPaymentProcessing) {
                  setShowPendingPaymentModal(false);
                  setSelectedPendingRental(null);
                }
              }}
            >
              <X size={18} />
            </button>

            <div style={{ padding: '28px' }}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div
                  className="flex-center"
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: '#eff6ff',
                    color: 'var(--primary)',
                    margin: '0 auto 12px auto'
                  }}
                >
                  <CreditCard size={24} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{t('tenant.pendingPaymentTitle')}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                  {t('tenant.pendingPaymentDesc')}
                </p>
              </div>

              {pendingPaymentError && (
                <div
                  style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 14px',
                    marginBottom: '16px',
                    color: '#dc2626',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>{pendingPaymentError}</span>
                </div>
              )}

              {/* Cryptographic Verified Contract Hash */}
              {selectedPendingRental.contract_hash && (
                <div
                  style={{
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px',
                    marginBottom: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <ShieldCheck size={14} style={{ color: '#16a34a' }} />
                    <strong style={{ fontSize: '12px', color: '#166534' }}>
                      {t('contract.verifiedBadge')}
                    </strong>
                  </div>
                  <div style={{ fontSize: '10px', color: '#15803d', fontFamily: 'monospace' }}>
                    SHA-256: {selectedPendingRental.contract_hash.slice(0, 24)}...
                  </div>
                </div>
              )}

              {/* Cost Summary Breakdown */}
              {(() => {
                const duration = Number(selectedPendingRental.duration_months || 1);
                const monthlyPrice = Number(selectedPendingRental.price || 0);
                const totalRent = monthlyPrice * duration;
                const adminFee = Number(
                  selectedPendingRental.admin_fee_amount !== undefined && selectedPendingRental.admin_fee_amount !== null
                    ? selectedPendingRental.admin_fee_amount
                    : 5000
                );
                const grandTotal = totalRent + adminFee;

                return (
                  <div
                    style={{
                      backgroundColor: 'var(--bg-main)',
                      padding: '16px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      marginBottom: '20px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Properti Kos</span>
                      <span style={{ fontWeight: 600 }}>{selectedPendingRental.propertyName}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Sewa Kamar ({duration} bln)</span>
                      <span style={{ fontWeight: 600 }}>Rp {totalRent.toLocaleString('id-ID')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Biaya Administrasi & Meterai</span>
                      <span style={{ fontWeight: 600, color: 'var(--primary)' }}>Rp {adminFee.toLocaleString('id-ID')}</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        paddingTop: '10px',
                        borderTop: '1px solid var(--border-color)',
                        fontSize: '15px',
                        fontWeight: 800
                      }}
                    >
                      <span>Total Pembayaran</span>
                      <span style={{ color: 'var(--primary)' }}>Rp {grandTotal.toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex-between" style={{ gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  disabled={pendingPaymentProcessing}
                  onClick={() => {
                    setShowPendingPaymentModal(false);
                    setSelectedPendingRental(null);
                  }}
                >
                  {t('tenant.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  disabled={pendingPaymentProcessing}
                  onClick={handleProcessPendingPayment}
                >
                  <CreditCard size={14} />
                  {pendingPaymentProcessing ? 'Memproses...' : t('tenant.payNow')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
