import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building, DollarSign, Star, Percent, Trash2, Edit, Plus, LogOut, 
  ArrowUpRight, Landmark, CreditCard, LayoutDashboard, MessageSquare, ShieldAlert,
  Download, Users
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

export default function LandlordDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview'); // overview, properties, reviews
  const [landlordUser, setLandlordUser] = useState(null);
  const [stats, setStats] = useState({
    balance: 0,
    totalRevenue: 0,
    totalWithdrawn: 0,
    totalProperti: 0,
    totalRooms: 0,
    occupiedRooms: 0,
    occupancyRate: 0,
    activeTenants: 0,
    withdrawals: [],
    reviewsCount: 0
  });

  const [properties, setProperties] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showPropModal, setShowPropModal] = useState(false);
  const [showRevModal, setShowRevModal] = useState(false);

  // Withdrawal form
  const [withdrawForm, setWithdrawForm] = useState({
    amount: '',
    bankName: 'BCA',
    accountNumber: ''
  });

  // Property form
  const [editingProperty, setEditingProperty] = useState(null);
  const [propertyForm, setPropertyForm] = useState({
    name: '',
    district: 'Denpasar',
    address: '',
    description: '',
    price: '',
    latitude: '-8.6700',
    longitude: '115.2166',
    totalRooms: '5',
    image: '',
    facilities: {
      Listrik: true,
      Air: true,
      Wifi: true,
      Kebersihan: true,
      Keamanan: false,
      Parkir: false
    }
  });

  // Review Edit Form
  const [editingReview, setEditingReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    comment: ''
  });

  useEffect(() => {
    // Check auth
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'landlord') {
      navigate('/login');
      return;
    }
    setLandlordUser(user);
    setWithdrawForm(prev => ({
      ...prev,
      accountNumber: user.bankAccountNumber || ''
    }));

    fetchDashboardData(user.id);
  }, [navigate]);

  useEffect(() => {
    if (!showPropModal) return;

    const timer = setTimeout(() => {
      const initialLat = parseFloat(propertyForm.latitude) || -8.6500;
      const initialLng = parseFloat(propertyForm.longitude) || 115.2166;

      if (typeof window.L === 'undefined') return;

      const mapContainer = document.getElementById('map-picker');
      if (!mapContainer) return;

      if (mapContainer._leaflet_id) {
        return; 
      }

      const map = window.L.map('map-picker').setView([initialLat, initialLng], 12);
      
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      let marker = window.L.marker([initialLat, initialLng], { draggable: true }).addTo(map);

      const updateCoords = (lat, lng) => {
        setPropertyForm(prev => ({
          ...prev,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6)
        }));
      };

      marker.on('dragend', function () {
        const position = marker.getLatLng();
        updateCoords(position.lat, position.lng);
      });

      map.on('click', function (e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        marker.setLatLng([lat, lng]);
        updateCoords(lat, lng);
      });

      setTimeout(() => map.invalidateSize(), 300);
    }, 100);

    return () => clearTimeout(timer);
  }, [showPropModal]);

  const fetchDashboardData = async (landlordId) => {
    setLoading(true);
    try {
      // Fetch stats for specific landlord
      const statsRes = await fetch(`${API_BASE}/stats?landlordId=${landlordId}`);
      const statsData = await statsRes.json();
      setStats(statsData);

      // Fetch properties
      const propRes = await fetch(`${API_BASE}/properties`);
      const propData = await propRes.json();
      // Filter landlord's own properties
      const landlordProps = propData.filter(p => p.ownerId === landlordId);
      setProperties(landlordProps);

      // Fetch reviews
      const revRes = await fetch(`${API_BASE}/reviews`);
      const revData = await revRes.json();
      // Filter reviews of landlord's properties
      const propIds = landlordProps.map(p => p.id);
      const landlordReviews = revData.filter(r => propIds.includes(r.propertyId));
      setReviews(landlordReviews);

    } catch (err) {
      console.error("Error loading landlord dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/');
  };

  // Withdraw money submit
  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    if (!withdrawForm.amount || parseFloat(withdrawForm.amount) <= 0) {
      alert("Masukkan jumlah penarikan yang valid.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...withdrawForm,
          userId: landlordUser.id
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowWithdrawModal(false);
      setWithdrawForm(prev => ({ ...prev, amount: '' }));
      
      // Update local storage user balance
      const updatedUser = {
        ...landlordUser,
        balance: data.balance,
        totalWithdrawn: data.totalWithdrawn
      };
      setLandlordUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));

      fetchDashboardData(landlordUser.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    setUploadingImage(true);
    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setPropertyForm(prev => ({ ...prev, image: data.url }));
    } catch (err) {
      alert("Gagal mengunggah gambar: " + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  // Property Form Submit (Add / Edit)
  const handlePropertySubmit = async (e) => {
    e.preventDefault();
    const facilityList = Object.keys(propertyForm.facilities).filter(
      fac => propertyForm.facilities[fac]
    );

    const payload = {
      name: propertyForm.name,
      district: propertyForm.district,
      address: propertyForm.address,
      description: propertyForm.description,
      price: parseInt(propertyForm.price),
      latitude: propertyForm.latitude,
      longitude: propertyForm.longitude,
      totalRooms: parseInt(propertyForm.totalRooms),
      image: propertyForm.image || undefined,
      ownerId: landlordUser.id,
      facilities: facilityList
    };

    const url = editingProperty 
      ? `${API_BASE}/properties/${editingProperty.id}`
      : `${API_BASE}/properties`;

    const method = editingProperty ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowPropModal(false);
      resetPropertyForm();
      fetchDashboardData(landlordUser.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditProperty = (prop) => {
    setEditingProperty(prop);
    
    // Map facilities array back to checkbox states
    const facilitiesMap = {
      Listrik: false,
      Air: false,
      Wifi: false,
      Kebersihan: false,
      Keamanan: false,
      Parkir: false
    };
    prop.facilities.forEach(fac => {
      if (facilitiesMap[fac] !== undefined) {
        facilitiesMap[fac] = true;
      }
    });

    setPropertyForm({
      name: prop.name,
      district: prop.district,
      address: prop.address,
      description: prop.description,
      price: prop.price.toString(),
      latitude: prop.latitude,
      longitude: prop.longitude,
      totalRooms: prop.totalRooms.toString(),
      image: prop.image || '',
      facilities: facilitiesMap
    });
    setShowPropModal(true);
  };

  const handleDeleteProperty = async (id) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus properti ini? Semua review terkait juga akan dihapus.")) return;

    try {
      const res = await fetch(`${API_BASE}/properties/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      fetchDashboardData(landlordUser.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const resetPropertyForm = () => {
    setEditingProperty(null);
    setPropertyForm({
      name: '',
      district: 'Denpasar',
      address: '',
      description: '',
      price: '',
      latitude: '-8.6700',
      longitude: '115.2166',
      totalRooms: '5',
      image: '',
      facilities: {
        Listrik: true,
        Air: true,
        Wifi: true,
        Kebersihan: true,
        Keamanan: false,
        Parkir: false
      }
    });
  };

  // Review Edit/Delete handlers
  const handleEditReview = (rev) => {
    setEditingReview(rev);
    setReviewForm({
      rating: rev.rating,
      comment: rev.comment
    });
    setShowRevModal(true);
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/reviews/${editingReview.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowRevModal(false);
      setEditingReview(null);
      fetchDashboardData(landlordUser.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteReview = async (id) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus review ini?")) return;

    try {
      const res = await fetch(`${API_BASE}/reviews/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      fetchDashboardData(landlordUser.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const formatRupiah = (num) => {
    return 'Rp ' + parseFloat(num).toLocaleString('id-ID');
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          <div className="nav-brand" style={{ marginBottom: '40px', paddingLeft: '16px' }}>
            <Building size={26} />
            <span>KOSMO Landlord</span>
          </div>

          <ul className="sidebar-links">
            <li>
              <button 
                className={`sidebar-link ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <LayoutDashboard size={18} />
                Dasbor Keuangan
              </button>
            </li>
            <li>
              <button 
                className={`sidebar-link ${activeTab === 'properties' ? 'active' : ''}`}
                onClick={() => setActiveTab('properties')}
              >
                <Building size={18} />
                Kelola Properti
              </button>
            </li>
            <li>
              <button 
                className={`sidebar-link ${activeTab === 'reviews' ? 'active' : ''}`}
                onClick={() => setActiveTab('reviews')}
              >
                <MessageSquare size={18} />
                Kelola Review
              </button>
            </li>
            <li>
              <button 
                className="sidebar-link"
                style={{ color: 'var(--primary)' }}
                onClick={() => navigate('/tenant')}
              >
                <Users size={18} />
                Sesi Penyewa
              </button>
            </li>
          </ul>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
          <button className="sidebar-link" style={{ width: '100%', border: 'none', background: 'none', color: 'var(--danger)' }} onClick={handleLogout}>
            <LogOut size={18} />
            Keluar Dashboard
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-content">
        <header style={{ marginBottom: '32px' }} className="flex-between">
          <div>
            <h1 style={{ fontSize: '28px' }}>Selamat Datang, {landlordUser?.name || 'Landlord'}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '2px' }}>
              Pantau laporan transaksi dan properti aktif Anda di sini.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <a 
              href={`${API_BASE}/reports/landlord/excel?landlordId=${landlordUser?.id}`}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
            >
              <Download size={16} /> Unduh Laporan Excel
            </a>
            <button className="btn btn-outline" onClick={() => navigate('/')}>
              Lihat Landing Page
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex-center" style={{ height: '300px', flexDirection: 'column', gap: '16px' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <p style={{ color: 'var(--text-muted)' }}>Memuat data dashboard...</p>
          </div>
        ) : (
          <>
            {/* Overview / Finance Tab */}
            {activeTab === 'overview' && (
              <div>
                {/* Stats Cards Row */}
                <div className="stats-grid">
                  <div className="stats-card">
                    <div className="stats-icon" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
                      <DollarSign size={24} />
                    </div>
                    <div className="stats-info">
                      <h4>Saldo Bisa Ditarik</h4>
                      <p>{formatRupiah(stats.balance)}</p>
                    </div>
                  </div>

                  <div className="stats-card">
                    <div className="stats-icon" style={{ backgroundColor: '#ecfdf5', color: '#10b981' }}>
                      <ArrowUpRight size={24} />
                    </div>
                    <div className="stats-info">
                      <h4>Total Pendapatan</h4>
                      <p>{formatRupiah(stats.totalRevenue)}</p>
                    </div>
                  </div>

                  <div className="stats-card">
                    <div className="stats-icon" style={{ backgroundColor: '#fffbeb', color: '#f59e0b' }}>
                      <CreditCard size={24} />
                    </div>
                    <div className="stats-info">
                      <h4>Total Ditarik</h4>
                      <p>{formatRupiah(stats.totalWithdrawn)}</p>
                    </div>
                  </div>

                  <div className="stats-card">
                    <div className="stats-icon" style={{ backgroundColor: '#fdf2f8', color: '#db2777' }}>
                      <Percent size={24} />
                    </div>
                    <div className="stats-info">
                      <h4>Rasio Okupansi</h4>
                      <p>{stats.occupancyRate}%</p>
                    </div>
                  </div>
                </div>

                {/* Main Action Buttons */}
                <div style={{ display: 'flex', gap: '16px', marginBottom: '40px' }}>
                  <button className="btn btn-primary" onClick={() => setShowWithdrawModal(true)}>
                    <Landmark size={16} />
                    Tarik Dana (Withdraw)
                  </button>
                  <button className="btn btn-secondary" onClick={() => { resetPropertyForm(); setShowPropModal(true); }}>
                    <Plus size={16} />
                    Tambah Properti Baru
                  </button>
                </div>

                {/* Financial Summary & Withdrawal History */}
                <div className="grid-2">
                  <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
                    <h3 style={{ fontSize: '18px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                      Rincian Operasional
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div className="flex-between">
                        <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Properti Anda</span>
                        <strong style={{ fontSize: '16px' }}>{stats.totalProperti} Unit</strong>
                      </div>
                      <div className="flex-between">
                        <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Kamar Terisi (Penghuni)</span>
                        <strong style={{ fontSize: '16px' }}>{stats.occupiedRooms} / {stats.totalRooms} Kamar</strong>
                      </div>
                      <div className="flex-between">
                        <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Jumlah Review Masuk</span>
                        <strong style={{ fontSize: '16px' }}>{stats.reviewsCount} Ulasan</strong>
                      </div>
                      <div className="flex-between">
                        <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Metode Pencairan Utama</span>
                        <strong style={{ fontSize: '16px' }}>{landlordUser?.bankName} - {landlordUser?.bankAccountNumber}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
                    <h3 style={{ fontSize: '18px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                      Riwayat Penarikan Dana
                    </h3>
                    {stats.withdrawals.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>Belum ada riwayat penarikan dana.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '180px', overflowY: 'auto' }}>
                        {stats.withdrawals.map((w) => (
                          <div key={w.id} className="flex-between" style={{ padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                            <div>
                              <p style={{ fontWeight: 600, fontSize: '13px' }}>Transfer ke {w.bankName}</p>
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{w.date} &bull; Rek: {w.accountNumber}</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--danger)' }}>-{formatRupiah(w.amount)}</p>
                              <span className="badge badge-success" style={{ fontSize: '10px', padding: '2px 6px' }}>{w.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Properties Management Tab */}
            {activeTab === 'properties' && (
              <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
                <div className="flex-between" style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '20px' }}>Properti Saya ({properties.length})</h3>
                  <button className="btn btn-primary" onClick={() => { resetPropertyForm(); setShowPropModal(true); }}>
                    <Plus size={16} />
                    Tambah Properti
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '12px 16px' }}>Properti</th>
                        <th style={{ padding: '12px 16px' }}>Wilayah</th>
                        <th style={{ padding: '12px 16px' }}>Harga / Bln</th>
                        <th style={{ padding: '12px 16px' }}>Okupansi Kamar</th>
                        <th style={{ padding: '12px 16px' }}>Rating</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {properties.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <img src={p.image} alt={p.name} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }} />
                              <div>
                                <strong style={{ fontSize: '15px', color: 'var(--dark)' }}>{p.name}</strong>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.address}</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '16px' }}>{p.district}</td>
                          <td style={{ padding: '16px', fontWeight: 600, color: 'var(--primary)' }}>{formatRupiah(p.price)}</td>
                          <td style={{ padding: '16px' }}>
                            <strong>{p.occupiedRooms}</strong> / {p.totalRooms} Kamar
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                              ({p.totalRooms - p.occupiedRooms} Kamar Kosong)
                            </span>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Star size={14} style={{ fill: '#f59e0b', color: '#f59e0b' }} />
                              <span>{p.rating > 0 ? p.rating : 'N/A'}</span>
                            </div>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px' }}>
                              <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => handleEditProperty(p)}>
                                <Edit size={14} />
                              </button>
                              <button className="btn btn-danger" style={{ padding: '6px 12px' }} onClick={() => handleDeleteProperty(p.id)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Reviews Management Tab */}
            {activeTab === 'reviews' && (
              <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
                <h3 style={{ fontSize: '20px', marginBottom: '24px' }}>Ulasan Properti Saya ({reviews.length})</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {reviews.map(r => (
                    <div key={r.id} className="card" style={{ padding: '20px', backgroundColor: '#f8fafc', border: '1px solid var(--border-color)', display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, marginRight: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <strong style={{ fontSize: '15px' }}>{r.userName}</strong>
                          <span className="badge badge-primary" style={{ fontSize: '10px' }}>
                            {r.propertyName}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.date}</span>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
                          {[...Array(5)].map((_, i) => (
                            <Star 
                              key={i} 
                              size={12} 
                              style={{ 
                                fill: i < r.rating ? '#f59e0b' : 'transparent', 
                                color: i < r.rating ? '#f59e0b' : '#cbd5e1' 
                              }} 
                            />
                          ))}
                        </div>

                        <p style={{ fontSize: '14px', color: 'var(--text-main)', fontStyle: 'italic' }}>
                          "{r.comment}"
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => handleEditReview(r)}>
                          Edit
                        </button>
                        <button className="btn btn-danger" style={{ padding: '6px 12px' }} onClick={() => handleDeleteReview(r.id)}>
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '450px' }}>
            <button className="modal-close" onClick={() => setShowWithdrawModal(false)}>
              <X size={18} />
            </button>
            <div style={{ padding: '32px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Formulir Penarikan Dana</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
                Maksimal penarikan: <strong>{formatRupiah(stats.balance)}</strong>
              </p>

              <form onSubmit={handleWithdrawSubmit}>
                <div className="form-group">
                  <label className="form-label">Pilih Bank Tujuan</label>
                  <select 
                    className="form-select" 
                    value={withdrawForm.bankName}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, bankName: e.target.value })}
                  >
                    <option value="BCA">BCA (Bank Central Asia)</option>
                    <option value="Mandiri">Bank Mandiri</option>
                    <option value="BNI">BNI (Bank Negara Indonesia)</option>
                    <option value="BRI">BRI (Bank Rakyat Indonesia)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Nomor Rekening Penerima</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Contoh: 1234567890"
                    value={withdrawForm.accountNumber}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, accountNumber: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '24px' }}>
                  <label className="form-label">Jumlah Penarikan (Rupiah)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="Contoh: 100000"
                    max={stats.balance}
                    value={withdrawForm.amount}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                    required
                  />
                </div>

                <div className="flex-between">
                  <button type="button" className="btn btn-outline" onClick={() => setShowWithdrawModal(false)}>
                    Batal
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Proses Penarikan
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Property Modal (Add / Edit) */}
      {showPropModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '650px' }}>
            <button className="modal-close" onClick={() => { setShowPropModal(false); resetPropertyForm(); }}>
              <X size={18} />
            </button>
            <div style={{ padding: '32px' }}>
              <h3 style={{ fontSize: '22px', marginBottom: '20px' }}>
                {editingProperty ? 'Edit Properti KOSMO' : 'Formulir Pendaftaran Kos Baru'}
              </h3>

              <form onSubmit={handlePropertySubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Nama Properti / Kos</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Contoh: KOSMO Hub Seminyak"
                    value={propertyForm.name}
                    onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Kabupaten / Kota</label>
                  <select 
                    className="form-select"
                    value={propertyForm.district}
                    onChange={(e) => setPropertyForm({ ...propertyForm, district: e.target.value })}
                  >
                    <option value="Denpasar">Denpasar</option>
                    <option value="Badung">Badung (Seminyak/Kuta)</option>
                    <option value="Gianyar">Gianyar (Ubud)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Harga Sewa per Bulan (Rp)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="Contoh: 3000000"
                    value={propertyForm.price}
                    onChange={(e) => setPropertyForm({ ...propertyForm, price: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Alamat Lengkap</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Alamat jalan lengkap di Bali"
                    value={propertyForm.address}
                    onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Deskripsi Properti</label>
                  <textarea 
                    className="form-textarea" 
                    rows="3"
                    placeholder="Jelaskan fasilitas, konsep, dan lingkungan kos..."
                    value={propertyForm.description}
                    onChange={(e) => setPropertyForm({ ...propertyForm, description: e.target.value })}
                  ></textarea>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Pilih Lokasi Properti di Peta</label>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Koordinat terpilih: <strong>{propertyForm.latitude || '-8.6500'}</strong>, <strong>{propertyForm.longitude || '115.2166'}</strong> (Geser penanda / klik peta untuk memindahkan)
                  </div>
                  <div id="map-picker" style={{ height: '240px', width: '100%', borderRadius: '12px', border: '1px solid var(--border-color)', position: 'relative', zIndex: 10 }}></div>
                </div>

                <div className="form-group">
                  <label className="form-label">Total Unit Kamar</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={propertyForm.totalRooms}
                    onChange={(e) => setPropertyForm({ ...propertyForm, totalRooms: e.target.value })}
                    required
                  />
                </div>

                 <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Cover Image Properti</label>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input 
                      type="file" 
                      accept="image/*"
                      className="form-input"
                      onChange={handleImageUpload}
                      style={{ padding: '8px' }}
                    />
                    {uploadingImage && <span style={{ fontSize: '12px', color: 'var(--primary)' }}>Mengunggah...</span>}
                  </div>
                  {propertyForm.image && (
                    <div style={{ marginTop: '12px', position: 'relative', display: 'inline-block' }}>
                      <img 
                        src={propertyForm.image} 
                        alt="Preview" 
                        style={{ width: '120px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)' }} 
                      />
                      <button
                        type="button"
                        onClick={() => setPropertyForm(prev => ({ ...prev, image: '' }))}
                        style={{
                          position: 'absolute', top: '-6px', right: '-6px', 
                          background: 'red', color: 'white', border: 'none', 
                          borderRadius: '50%', width: '20px', height: '20px', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', fontSize: '10px', fontWeight: 'bold'
                        }}
                      >
                        X
                      </button>
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Fasilitas Termasuk (All-Inclusive)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '6px' }}>
                    {Object.keys(propertyForm.facilities).map(fac => (
                      <label key={fac} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          style={{ width: '16px', height: '16px' }}
                          checked={propertyForm.facilities[fac]}
                          onChange={() => setPropertyForm({
                            ...propertyForm,
                            facilities: {
                              ...propertyForm.facilities,
                              [fac]: !propertyForm.facilities[fac]
                            }
                          })}
                        />
                        {fac}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => { setShowPropModal(false); resetPropertyForm(); }}>
                    Batal
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {editingProperty ? 'Simpan Perubahan' : 'Daftarkan Properti'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Review Edit Modal */}
      {showRevModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '450px' }}>
            <button className="modal-close" onClick={() => { setShowRevModal(false); setEditingReview(null); }}>
              <X size={18} />
            </button>
            <div style={{ padding: '32px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>Edit Review Pengguna</h3>

              <form onSubmit={handleReviewSubmit}>
                <div className="form-group">
                  <label className="form-label">Rating Bintang</label>
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
                    Simpan Ulasan
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
