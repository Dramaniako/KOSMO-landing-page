import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, CreditCard, Bell, HelpCircle, FileText, Star, Edit, Trash2, 
  Plus, LogOut, CheckCircle, Shield, Phone, Globe, MessageSquare 
} from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';

export default function TenantDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile'); // profile, bills, reviews
  const [currentUser, setCurrentUser] = useState(null);
  const [properties, setProperties] = useState([]);
  const [myReviews, setMyReviews] = useState([]);
  
  const [showRevModal, setShowRevModal] = useState(false);
  const [editingReview, setEditingReview] = useState(null);
  
  // Review form states
  const [reviewForm, setReviewForm] = useState({
    propertyId: '',
    rating: 5,
    comment: ''
  });

  // Profile Edit form states
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    paymentMethod: 'Virtual Account',
    notifications: true,
    language: 'Indonesia'
  });

  const [isEditingProfile, setIsEditingProfile] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'tenant') {
      navigate('/login');
      return;
    }
    setCurrentUser(user);
    
    // Load profile form initial values
    setProfileForm({
      name: user.name,
      phone: user.phone || '',
      paymentMethod: user.paymentMethod || 'Virtual Account',
      notifications: user.notifications !== undefined ? user.notifications : true,
      language: user.language || 'Indonesia'
    });

    fetchData(user.id);
  }, [navigate]);

  const fetchData = async (userId) => {
    try {
      // Fetch properties
      const propRes = await fetch(`${API_BASE}/properties`);
      const propData = await propRes.json();
      setProperties(propData);
      
      if (propData.length > 0) {
        setReviewForm(prev => ({ ...prev, propertyId: propData[0].id }));
      }

      // Fetch reviews by user
      const revRes = await fetch(`${API_BASE}/reviews?userId=${userId}`);
      const revData = await revRes.json();
      setMyReviews(revData);
    } catch (err) {
      console.error("Error loading tenant dashboard data:", err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/');
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/users/profile/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setCurrentUser(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
      setIsEditingProfile(false);
    } catch (err) {
      alert(err.message);
    }
  };

  // Create or Update Review submit
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewForm.propertyId || !reviewForm.comment) {
      alert("Properti dan komentar ulasan wajib diisi.");
      return;
    }

    const payload = editingReview 
      ? { rating: parseInt(reviewForm.rating), comment: reviewForm.comment }
      : { 
          propertyId: reviewForm.propertyId, 
          userId: currentUser.id, 
          userName: currentUser.name, 
          rating: parseInt(reviewForm.rating), 
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowRevModal(false);
      resetReviewForm();
      fetchData(currentUser.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditReview = (rev) => {
    setEditingReview(rev);
    setReviewForm({
      propertyId: rev.propertyId,
      rating: rev.rating,
      comment: rev.comment
    });
    setShowRevModal(true);
  };

  const handleDeleteReview = async (id) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus review ini?")) return;

    try {
      const res = await fetch(`${API_BASE}/reviews/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      fetchData(currentUser.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const resetReviewForm = () => {
    setEditingReview(null);
    setReviewForm({
      propertyId: properties[0]?.id || '',
      rating: 5,
      comment: ''
    });
  };

  const formatRupiah = (num) => {
    return 'Rp ' + num.toLocaleString('id-ID');
  };

  if (!currentUser) return null;

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          {/* Tenant short profile summary */}
          <div style={{ textAlign: 'center', marginBottom: '32px', padding: '0 8px' }}>
            <div style={{ position: 'relative', width: '72px', height: '72px', margin: '0 auto 12px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
              <User size={36} style={{ color: 'var(--primary)' }} />
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
                <User size={18} />
                Profil Saya
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
                      setProfileForm(prev => {
                        const next = { ...prev, notifications: updated };
                        // Persist immediately on change
                        fetch(`${API_BASE}/users/profile/${currentUser.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(next)
                        }).then(res => res.json()).then(data => {
                          setCurrentUser(data.user);
                          localStorage.setItem('user', JSON.stringify(data.user));
                        });
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
                      setProfileForm(prev => {
                        const next = { ...prev, language: updated };
                        fetch(`${API_BASE}/users/profile/${currentUser.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(next)
                        }).then(res => res.json()).then(data => {
                          setCurrentUser(data.user);
                          localStorage.setItem('user', JSON.stringify(data.user));
                        });
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

        {/* BILLING HISTORY TAB */}
        {activeTab === 'bills' && (
          <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '24px' }}>Riwayat Transaksi & Tagihan</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Mock active bills matching "Riwayat Tagihan" screenshot */}
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
          </div>
        )}

        {/* REVIEWS TAB (CRUD Reviews) */}
        {activeTab === 'reviews' && (
          <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
            <div className="flex-between" style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px' }}>Ulasan Sewa Saya ({myReviews.length})</h3>
              <button 
                className="btn btn-primary" 
                onClick={() => { resetReviewForm(); setShowRevModal(true); }}
                disabled={properties.length === 0}
              >
                <Plus size={16} />
                Tulis Review Baru
              </button>
            </div>

            {myReviews.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <p style={{ fontStyle: 'italic', fontSize: '14px' }}>Anda belum menulis ulasan apapun.</p>
                <button className="btn btn-secondary" style={{ marginTop: '16px' }} onClick={() => { resetReviewForm(); setShowRevModal(true); }}>
                  Tulis Review Pertama Anda
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {myReviews.map(rev => (
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
                      {properties.map(p => (
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
                    onChange={(e) => setReviewForm({ ...reviewForm, rating: parseInt(e.target.value) })}
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
                    rows="4"
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
    </div>
  );
}

// Simple local mock components for modal close button
function X({ size }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
