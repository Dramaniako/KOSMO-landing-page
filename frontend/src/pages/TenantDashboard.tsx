import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User as UserIcon, Bell, HelpCircle, FileText, Star, Edit, Trash2, 
  Plus, LogOut, Globe, MessageSquare, Building, X, Download
} from 'lucide-react';
import { User, Property, Review, Rental } from '../types/index.ts';

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
      const rentData = (await rentRes.json()) as Rental[];
      setMyRentals(Array.isArray(rentData) ? rentData : []);
      loadedTabs.current.add('rentals');
      loadedTabs.current.add('bills');
    } catch (err) {
      console.error("Error loading rentals:", err);
    } finally {
      setTabLoading(prev => ({ ...prev, rentals: false, bills: false }));
    }
  }, []);

  const fetchProperties = useCallback(async (): Promise<void> => {
    try {
      const propRes = await fetch(`${API_BASE}/properties`);
      const propData = (await propRes.json()) as Property[];
      const safeProps = Array.isArray(propData) ? propData : [];
      setProperties(safeProps);
      if (safeProps.length > 0) {
        setReviewForm((prev) => ({ ...prev, propertyId: prev.propertyId || safeProps[0].id }));
      }
    } catch (err) {
      console.error("Error loading properties:", err);
    }
  }, []);

  const fetchMyReviews = useCallback(async (userId: string): Promise<void> => {
    setTabLoading(prev => ({ ...prev, reviews: true }));
    try {
      const [revRes] = await Promise.all([
        fetch(`${API_BASE}/reviews?userId=${encodeURIComponent(userId)}`),
        fetchProperties()
      ]);
      const revData = (await revRes.json()) as Review[];
      setMyReviews(Array.isArray(revData) ? revData : []);
      loadedTabs.current.add('reviews');
    } catch (err) {
      console.error("Error loading reviews:", err);
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
      const res = await fetch(`${API_BASE}/users/profile/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm)
      });
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
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
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
      const res = await fetch(`${API_BASE}/reviews/${id}`, { method: 'DELETE' });
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
                Profil Saya
              </button>
            </li>
            <li>
              <button 
                className={`sidebar-link ${activeTab === 'rentals' ? 'active' : ''}`}
                onClick={() => setActiveTab('rentals')}
              >
                <Building size={18} />
                Kos Saya (Sewa)
              </button>
            </li>
            <li>
              <button 
                className={`sidebar-link ${activeTab === 'bills' ? 'active' : ''}`}
                onClick={() => setActiveTab('bills')}
              >
                <FileText size={18} />
                Riwayat Tagihan
              </button>
            </li>
            <li>
              <button 
                className={`sidebar-link ${activeTab === 'reviews' ? 'active' : ''}`}
                onClick={() => setActiveTab('reviews')}
              >
                <MessageSquare size={18} />
                Ulasan Saya
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
            Keluar Akun
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-content">
        <header style={{ marginBottom: '32px' }} className="flex-between">
          <div>
            <h1 style={{ fontSize: '28px' }}>Halo, {currentUser.name}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '2px' }}>
              Kendalikan detail akun dan pantau tagihan hunian KOSMO Anda.
            </p>
          </div>
          <button className="btn btn-outline" onClick={() => navigate('/')}>
            Jelajahi Kos Baru
          </button>
        </header>

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className="grid-2">
            <div className="card" style={{ padding: '32px', backgroundColor: 'white' }}>
              <div className="flex-between" style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <h3 style={{ fontSize: '20px' }}>Informasi Akun</h3>
                {!isEditingProfile && (
                  <button className="btn btn-secondary" style={{ padding: '6px 16px' }} onClick={() => setIsEditingProfile(true)}>
                    Edit Profil
                  </button>
                )}
              </div>

              {isEditingProfile ? (
                <form onSubmit={handleProfileSubmit}>
                  <div className="form-group">
                    <label className="form-label">Nama Lengkap</label>
                    <input 
                      type="text" 
                      className="form-input"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Nomor Telepon</label>
                    <input 
                      type="text" 
                      className="form-input"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Metode Pembayaran Pilihan</label>
                    <input 
                      type="text" 
                      className="form-input"
                      placeholder="Contoh: Kartu Kredit, GoPay, Mandiri VA"
                      value={profileForm.paymentMethod}
                      onChange={(e) => setProfileForm({ ...profileForm, paymentMethod: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                    <button type="button" className="btn btn-outline" onClick={() => setIsEditingProfile(false)}>
                      Batal
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Simpan Profil
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Nama Lengkap</span>
                    <p style={{ fontWeight: 600, fontSize: '15px' }}>{currentUser.name}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Alamat Email</span>
                    <p style={{ fontWeight: 600, fontSize: '15px' }}>{currentUser.email}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Nomor Telepon</span>
                    <p style={{ fontWeight: 600, fontSize: '15px' }}>{currentUser.phone || 'Belum diatur'}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Metode Pembayaran</span>
                    <p style={{ fontWeight: 600, fontSize: '15px' }}>{currentUser.paymentMethod || 'Belum diatur'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Settings (Notifications / Language) */}
            <div className="card" style={{ padding: '32px', backgroundColor: 'white' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                Pengaturan Akun
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="flex-between">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Bell size={20} style={{ color: 'var(--primary)' }} />
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '14px' }}>Notifikasi Tagihan</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Kirim pengingat sewa ke WA/Email</p>
                    </div>
                  </div>
                  <input 
                    type="checkbox" 
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    checked={profileForm.notifications}
                    onChange={(e) => {
                      const updated = e.target.checked;
                      setProfileForm((prev) => {
                        const next = { ...prev, notifications: updated };
                        // Persist immediately on change
                        fetch(`${API_BASE}/users/profile/${currentUser.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(next)
                        }).then((res) => res.json()).then((data: { user: User }) => {
                          setCurrentUser(data.user);
                          localStorage.setItem('user', JSON.stringify(data.user));
                        }).catch(console.error);
                        return next;
                      });
                    }}
                  />
                </div>

                <div className="flex-between">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Globe size={20} style={{ color: 'var(--primary)' }} />
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '14px' }}>Bahasa Aplikasi</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Pilih bahasa antarmuka</p>
                    </div>
                  </div>
                  <select 
                    className="form-select" 
                    style={{ width: '130px', padding: '6px 12px' }}
                    value={profileForm.language}
                    onChange={(e) => {
                      const updated = e.target.value;
                      setProfileForm((prev) => {
                        const next = { ...prev, language: updated };
                        fetch(`${API_BASE}/users/profile/${currentUser.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(next)
                        }).then((res) => res.json()).then((data: { user: User }) => {
                          setCurrentUser(data.user);
                          localStorage.setItem('user', JSON.stringify(data.user));
                        }).catch(console.error);
                        return next;
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
        {activeTab === 'rentals' && (
          <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '24px' }}>Properti Kos yang Sedang Disewa</h3>

            {tabLoading.rentals && !loadedTabs.current.has('rentals') ? (
              <div className="flex-center" style={{ height: '160px', flexDirection: 'column', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat data sewa kos...</p>
              </div>
            ) : myRentals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <p style={{ fontStyle: 'italic', fontSize: '14px' }}>Anda belum menyewa kos apapun saat ini.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {myRentals.map((rent) => (
                  <div key={rent.id} className="flex-between" style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: rent.status === 'active' ? '#ffffff' : '#f8fafc' }}>
                    <div>
                      <span className={`badge ${rent.status === 'active' ? 'badge-success' : 'badge-danger'}`} style={{ marginBottom: '6px', fontSize: '10px' }}>
                        {rent.status === 'active' ? 'Sewa Aktif' : 'Penyewaan Selesai'}
                      </span>
                      <h4 style={{ fontSize: '16px', fontWeight: 700 }}>{rent.propertyName}</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Mulai Sewa: {rent.startDate}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '18px', color: 'var(--primary)', display: 'block' }}>Rp {rent.price ? rent.price.toLocaleString('id-ID') : '0'}/bln</strong>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                        <a
                          href={`${API_BASE}/rentals/${rent.id}/contract`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline"
                          style={{ padding: '4px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Download size={13} />
                          Unduh Kontrak Sewa (PDF)
                        </a>
                        {rent.status === 'active' && (
                          <button 
                            className="btn btn-outline btn-danger" 
                            style={{ padding: '4px 12px', fontSize: '12px' }}
                            onClick={() => {
                              setTerminateRental(rent);
                              setShowTerminateModal(true);
                            }}
                          >
                            Berhenti Menyewa
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                      onChange={(e) => setReviewForm({ ...reviewForm, propertyId: e.target.value })}
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
                    onChange={(e) => setReviewForm({ ...reviewForm, rating: parseInt(e.target.value, 10) })}
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
                    onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
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

      {/* Terminate Rental Password Modal */}
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
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                setTerminateProcessing(true);
                try {
                  const res = await fetch(`${API_BASE}/rentals/${terminateRental.id}/terminate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: terminatePassword })
                  });
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
                    onChange={(e) => setTerminatePassword(e.target.value)}
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
