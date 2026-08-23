import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User as UserIcon, Bell, HelpCircle, FileText, Star, Edit, Trash2, 
  Plus, LogOut, Globe, MessageSquare, Building, X, Download, Home, Compass, History, Calendar
} from 'lucide-react';
import { User, Property, Review, Rental } from '../types/index';
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
}

export default function TenantDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
    notifications: currentUser?.notifications !== undefined ? currentUser.notifications : true,
    language: currentUser?.language || 'Indonesia'
  }));

  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  const loadedTabs = useRef<Set<string>>(new Set(['profile']));

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

  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      if (!token) {
        navigate('/login');
        return;
      }
      const res = await fetch(`${API_BASE}/users/profile/${currentUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileForm)
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
        {activeTab === 'profile' && (
          <div className="grid-2">
            <div className="card" style={{ padding: '32px', backgroundColor: 'white' }}>
              <div className="flex-between" style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <h3 style={{ fontSize: '20px' }}>{t('tenant.accountInfo')}</h3>
                {!isEditingProfile && (
                  <button className="btn btn-secondary" style={{ padding: '6px 16px' }} onClick={() => setIsEditingProfile(true)}>
                    {t('tenant.editProfile')}
                  </button>
                )}
              </div>

              {isEditingProfile ? (
                <form onSubmit={handleProfileSubmit}>
                  <div className="form-group">
                    <label className="form-label">{t('auth.name')}</label>
                    <input 
                      type="text" 
                      className="form-input"
                      value={profileForm.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm({ ...profileForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('auth.phone')}</label>
                    <input 
                      type="text" 
                      className="form-input"
                      value={profileForm.phone}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('modal.choosePayment')}</label>
                    <select 
                      className="form-select"
                      value={profileForm.paymentMethod}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProfileForm({ ...profileForm, paymentMethod: e.target.value })}
                    >
                      <option value="Virtual Account">Virtual Account (BCA/Mandiri)</option>
                      <option value="Kartu Kredit">Credit Card / Debit Online</option>
                      <option value="E-Wallet">GoPay / OVO / ShopeePay</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                      {t('tenant.saveProfile')}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setIsEditingProfile(false)}>
                      {t('tenant.cancel')}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{t('auth.name')}</span>
                    <strong>{currentUser.name}</strong>
                  </div>
                  <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{t('auth.email')}</span>
                    <strong>{currentUser.email}</strong>
                  </div>
                  <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{t('auth.phone')}</span>
                    <strong>{currentUser.phone || '-'}</strong>
                  </div>
                  <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{t('auth.role')}</span>
                    <span className="badge badge-primary">{currentUser.role.toUpperCase()}</span>
                  </div>
                  <div className="flex-between">
                    <span style={{ color: 'var(--text-muted)' }}>Metode Pembayaran Utama</span>
                    <strong>{currentUser.paymentMethod || 'Virtual Account'}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Settings (Notifications / Language) */}
            <div className="card" style={{ padding: '32px', backgroundColor: 'white' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
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
                        headers: { 'Content-Type': 'application/json' },
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
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ language: newLang })
                      });
                    }}
                  >
                    <option value="Indonesia">Indonesia</option>
                    <option value="English">English</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #f1f5f9', marginTop: '16px' }}>
                  <HelpCircle size={24} style={{ color: 'var(--primary)' }} />
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '13px' }}>Butuh bantuan darurat?</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Hubungi Live Chat KOSMO Care 24/7 di WhatsApp.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RENTALS TAB */}
        {activeTab === 'rentals' && (() => {
          const activeRental = myRentals.find((r) => r.status === 'active');
          const pastRentals = myRentals.filter((r) => r.status !== 'active');

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
                        <div style={{ marginTop: '12px', padding: '10px 14px', backgroundColor: 'rgba(255, 255, 255, 0.85)', border: '1px solid #86efac', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar size={14} className="text-blue-600" />
                            <span style={{ color: '#64748b', fontWeight: 500 }}>{t('tenant.nextDue')}:</span>{' '}
                            <strong style={{ color: '#0f172a' }}>{activeRental.nextPaymentDate}</strong>
                          </div>
                          {activeRental.daysRemaining !== undefined && (
                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', backgroundColor: activeRental.daysRemaining <= 3 ? '#fee2e2' : '#dbeafe', color: activeRental.daysRemaining <= 3 ? '#b91c1c' : '#1d4ed8' }}>
                              {t('tenant.daysLeft', { days: activeRental.daysRemaining })}
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
                        <a
                          href={`${API_BASE}/rentals/${activeRental.id}/contract`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline"
                          style={{ padding: '6px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Download size={14} />
                          {t('tenant.downloadPdf')}
                        </a>
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

              {/* SECTION 2: Riwayat Sewa Masa Lalu */}
              {pastRentals.length > 0 && (
                <div className="card" style={{ padding: '28px', backgroundColor: 'white' }}>
                  <div className="flex-between" style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <History size={20} style={{ color: 'var(--text-muted)' }} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{t('tenant.pastSection')}</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('tenant.pastDesc', { count: pastRentals.length })}</p>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {pastRentals.map((rent) => (
                      <div key={rent.id} className="flex-between" style={{ padding: '16px 20px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: '#f8fafc' }}>
                        <div>
                          <span className="badge badge-secondary" style={{ marginBottom: '6px', fontSize: '10px', display: 'inline-block', backgroundColor: '#e2e8f0', color: '#475569' }}>
                            {t('tenant.completed')}
                          </span>
                          <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#334155' }}>{rent.propertyName}</h4>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{t('tenant.startDate')}: {rent.startDate}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <strong style={{ fontSize: '16px', color: '#64748b', display: 'block' }}>
                            Rp {rent.price ? rent.price.toLocaleString('id-ID') : '0'}/bln
                          </strong>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                            <a
                              href={`${API_BASE}/rentals/${rent.id}/contract`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-outline"
                              style={{ padding: '4px 12px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Download size={12} />
                              Unduh Kontrak Sewa (PDF)
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
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
    </div>
  );
}
