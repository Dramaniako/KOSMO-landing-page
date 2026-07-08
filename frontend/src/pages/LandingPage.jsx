import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, MapPin, Star, Wifi, Tv, Wind, Shield,
  Droplet, Check, X, ArrowRight, ShieldCheck, Heart,
  Zap, Sparkles, Car, Download
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export default function LandingPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [showContract, setShowContract] = useState(false);
  const [contractSigned, setContractSigned] = useState(false);

  // Filter States
  const [district, setDistrict] = useState('Semua');
  const [priceMax, setPriceMax] = useState(10000000);
  const [facilities, setFacilities] = useState({
    Listrik: false,
    Air: false,
    Wifi: false,
    Kebersihan: false,
    Keamanan: false,
    Parkir: false
  });

  const currentUser = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    fetchProperties();
    fetchReviews();
    // Track visitor
    fetch(`${API_BASE}/tracking/visit`, { method: 'POST' }).catch(() => { });
  }, []);

  const fetchProperties = async (queryParams = '') => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/properties${queryParams}`);
      const data = await res.json();
      setProperties(data);
    } catch (err) {
      console.error("Error fetching properties:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async () => {
    try {
      const res = await fetch(`${API_BASE}/reviews`);
      const data = await res.json();
      setReviews(data);
    } catch (err) {
      console.error("Error fetching reviews:", err);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    let query = `?priceMin=0&priceMax=${priceMax}`;
    if (district !== 'Semua') {
      query += `&district=${district}`;
    }

    // Add selected facilities
    Object.keys(facilities).forEach(fac => {
      if (facilities[fac]) {
        query += `&facility=${encodeURIComponent(fac)}`;
      }
    });

    fetchProperties(query);
  };

  const toggleFacility = (fac) => {
    setFacilities(prev => ({
      ...prev,
      [fac]: !prev[fac]
    }));
  };

  const resetFilters = () => {
    setDistrict('Semua');
    setPriceMax(10000000);
    setFacilities({
      Listrik: false,
      Air: false,
      Wifi: false,
      Kebersihan: false,
      Keamanan: false,
      Parkir: false
    });
    fetchProperties();
  };

  const handleOpenDetail = (prop) => {
    setSelectedProperty(prop);
    setContractSigned(false);
    setShowContract(false);
  };

  const handleSignContract = () => {
    setContractSigned(true);
    setTimeout(() => {
      setShowContract(false);
      setSelectedProperty(null);
      alert("Kontrak berhasil ditandatangani! Silakan cek dashboard Anda.");
      navigate('/tenant');
    }, 2000);
  };

  // Map icon strings to Lucide elements
  const renderFacilityIcon = (fac) => {
    switch (fac.toLowerCase()) {
      case 'listrik': return <Zap className="facility-icon" size={16} />;
      case 'air': return <Droplet className="facility-icon" size={16} />;
      case 'wifi': return <Wifi className="facility-icon" size={16} />;
      case 'kebersihan': return <Sparkles className="facility-icon" size={16} />;
      case 'keamanan': return <Shield className="facility-icon" size={16} />;
      case 'parkir': return <Car className="facility-icon" size={16} />;
      default: return <Check className="facility-icon" size={16} />;
    }
  };

  const formatPrice = (price) => {
    if (price >= 1000000) {
      return `Rp ${(price / 1000000).toFixed(1)} jt`;
    }
    return `Rp ${price.toLocaleString('id-ID')}`;
  };

  return (
    <div>
      {/* Header / Navbar */}
      <nav className="navbar">
        <div className="container flex-between">
          <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            <ShieldCheck size={28} />
            <span>KOSMO</span>
          </div>
          <ul className="nav-links">
            <li><a href="#" className="nav-link active" onClick={(e) => { e.preventDefault(); resetFilters(); }}>Cari Properti</a></li>
            {currentUser ? (
              <>
                {currentUser.role === 'landlord' ? (
                  <>
                    <li>
                      <a
                        href="#"
                        className="nav-link"
                        onClick={(e) => { e.preventDefault(); navigate('/tenant'); }}
                      >
                        Sesi Penyewa
                      </a>
                    </li>
                    <li>
                      <a
                        href="#"
                        className="nav-link"
                        onClick={(e) => { e.preventDefault(); navigate('/landlord'); }}
                      >
                        Sesi Landlord
                      </a>
                    </li>
                  </>
                ) : (
                  <li>
                    <a
                      href="#"
                      className="nav-link"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(currentUser.role === 'admin' ? '/admin' : '/tenant');
                      }}
                    >
                      Dashboard ({currentUser.name})
                    </a>
                  </li>
                )}
                <li>
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      localStorage.removeItem('user');
                      localStorage.removeItem('token');
                      window.location.reload();
                    }}
                  >
                    Keluar
                  </button>
                </li>
              </>
            ) : (
              <li><button className="btn btn-primary" onClick={() => navigate('/login')}>Masuk / Daftar</button></li>
            )}
          </ul>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="hero-section">
        <div className="container hero-content">
          <h1 className="hero-title">
            Temukan Kos dengan Harga Terjangkau
            di <span>Pulau Bali</span>
          </h1>
          <p className="hero-desc">
            fasilitas all-inclusive dan gak bikin ribet di kantong.
          </p>
          <a
            href="https://drive.google.com/drive/folders/1PAebHs8setFkcATSIotBtRWzvW83au3o?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              marginTop: '16px', padding: '12px 28px', fontSize: '1rem',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', borderRadius: '12px', color: '#fff',
              boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
              textDecoration: 'none', cursor: 'pointer'
            }}
          >
            <Download size={20} /> Unduh Aplikasi Mobile
          </a>
        </div>
      </header>

      {/* Filter Bar Container */}
      <div className="container" style={{ marginTop: '-20px' }}>
        <form onSubmit={handleSearch} className="filter-bar glass-panel">
          <div>
            <label className="form-label">Kabupaten / Kota</label>
            <select
              className="form-select"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            >
              <option value="Semua">Semua Wilayah</option>
              <option value="Denpasar">Denpasar</option>
              <option value="Badung">Badung</option>
              <option value="Gianyar">Gianyar</option>
            </select>
          </div>

          <div>
            <label className="form-label">Harga Maksimal ({formatPrice(priceMax)}/bln)</label>
            <input
              type="range"
              className="form-input"
              style={{ padding: '8px 0', cursor: 'pointer' }}
              min="1000000"
              max="10000000"
              step="500000"
              value={priceMax}
              onChange={(e) => setPriceMax(parseInt(e.target.value))}
            />
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Fasilitas All-Inclusive</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px' }}>
              {Object.keys(facilities).map(fac => (
                <button
                  key={fac}
                  type="button"
                  className={`btn btn-sm ${facilities[fac] ? 'btn-primary' : 'btn-outline'}`}
                  style={{ padding: '6px 12px', borderRadius: '50px', fontSize: '12px' }}
                  onClick={() => toggleFacility(fac)}
                >
                  {fac}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn btn-primary">
              <Search size={16} />
              Cari
            </button>
            <button type="button" className="btn btn-outline" onClick={resetFilters}>
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Main Section */}
      <main className="container" style={{ minHeight: '400px' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '28px' }}>Pilihan Properti Tersedia</h2>

        {loading ? (
          <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '16px' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <p style={{ color: 'var(--text-muted)' }}>Memuat properti KOSMO...</p>
          </div>
        ) : properties.length === 0 ? (
          <div className="flex-center card" style={{ padding: '60px 24px', textAlign: 'center', backgroundColor: 'white' }}>
            <X size={48} style={{ color: 'var(--danger)', marginBottom: '16px' }} />
            <h3>Properti Tidak Ditemukan</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '8px', maxWidth: '400px' }}>
              Maaf, tidak ada properti KOSMO yang sesuai dengan kriteria filter pencarian Anda. Silakan coba atur ulang filter.
            </p>
            <button className="btn btn-secondary" style={{ marginTop: '16px' }} onClick={resetFilters}>
              Tampilkan Semua Properti
            </button>
          </div>
        ) : (
          <div className="grid-3">
            {properties.map(prop => {
              const propReviews = reviews.filter(r => r.propertyId === prop.id);
              return (
                <div key={prop.id} className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ position: 'relative', height: '220px', overflow: 'hidden' }}>
                    <img
                      src={prop.image}
                      alt={prop.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div style={{ position: 'absolute', top: '12px', left: '12px' }} className="badge badge-primary">
                      All-Inclusive
                    </div>
                    <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'white', borderRadius: '50%', padding: '6px', cursor: 'pointer', display: 'flex', boxShadow: 'var(--shadow-sm)' }}>
                      <Heart size={16} style={{ color: 'var(--danger)', fill: 'var(--danger)' }} />
                    </div>
                  </div>

                  <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div className="flex-between" style={{ marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {prop.district}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', fontWeight: 600 }}>
                          <Star size={16} style={{ fill: '#f59e0b', color: '#f59e0b' }} />
                          <span>{prop.rating > 0 ? prop.rating : 'Baru'}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 400 }}>({propReviews.length})</span>
                        </div>
                      </div>

                      <h3 style={{ fontSize: '18px', marginBottom: '8px', lineHeight: 1.3 }}>{prop.name}</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {prop.description}
                      </p>
                    </div>

                    <div>
                      {/* Facilities badges */}
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {prop.facilities.map((fac, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', border: '1px solid #f1f5f9' }}>
                            {renderFacilityIcon(fac)}
                            <span>{fac}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex-between" style={{ paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block' }}>Mulai dari</span>
                          <strong style={{ fontSize: '18px', color: 'var(--primary)' }}>{formatPrice(prop.price)}</strong>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/bulan</span>
                        </div>
                        <button className="btn btn-secondary" onClick={() => handleOpenDetail(prop)}>
                          Detail
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Customer Reviews Section */}
        <section style={{ marginTop: '80px' }}>
          <div className="flex-between" style={{ marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '28px' }}>Apa Kata Penghuni Kami</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Review jujur langsung dari member co-living KOSMO.</p>
            </div>
          </div>
          <div className="grid-3">
            {reviews.slice(0, 3).map(rev => (
              <div key={rev.id} className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
                <div className="flex-between" style={{ marginBottom: '16px' }}>
                  <div>
                    <h4 style={{ fontSize: '16px' }}>{rev.userName}</h4>
                    <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 500 }}>
                      Penghuni {rev.propertyName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        size={14}
                        style={{
                          fill: i < rev.rating ? '#f59e0b' : 'transparent',
                          color: i < rev.rating ? '#f59e0b' : '#cbd5e1'
                        }}
                      />
                    ))}
                  </div>
                </div>
                <p style={{ fontStyle: 'italic', fontSize: '14px', color: 'var(--text-main)' }}>
                  "{rev.comment}"
                </p>
                <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
                  {rev.date}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Property Detail Modal */}
      {selectedProperty && (
        <div className="modal-overlay">
          <div className="modal-container">
            <button className="modal-close" onClick={() => setSelectedProperty(null)}>
              <X size={20} />
            </button>

            {showContract ? (
              /* Simulated Contract signing view (matching 'Tinjauan Kontrak' screenshot) */
              <div style={{ padding: '40px' }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <ShieldCheck size={48} style={{ color: 'var(--primary)', marginBottom: '12px' }} />
                  <h2>Tinjauan Kontrak Sewa</h2>
                  <p style={{ color: 'var(--text-muted)' }}>Silakan tinjau dan tanda tangani surat perjanjian sewa menyewa properti kos.</p>
                </div>

                <div style={{
                  background: '#f8fafc',
                  border: '1px solid var(--border-color)',
                  padding: '24px',
                  borderRadius: 'var(--radius-md)',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  color: 'var(--text-main)',
                  marginBottom: '24px'
                }}>
                  <h3 style={{ fontSize: '15px', marginBottom: '16px', textAlign: 'center' }}>
                    SURAT PERJANJIAN SEWA MENYEWA PROPERTI KOS
                  </h3>
                  <p style={{ marginBottom: '12px' }}>
                    <strong>Pasal 1: Objek Sewa</strong><br />
                    Pihak Pertama menyewakan kepada Pihak Kedua sebuah kamar kos di <strong>{selectedProperty.name}</strong> beserta seluruh fasilitas yang melekat padanya.
                  </p>
                  <p style={{ marginBottom: '12px' }}>
                    <strong>Pasal 2: Jangka Waktu & Harga</strong><br />
                    Sewa menyewa ini dilangsungkan untuk jangka waktu 1 bulan, dengan harga All-inclusive sebesar <strong>{formatPrice(selectedProperty.price)}</strong> per bulan.
                  </p>
                  <p style={{ marginBottom: '12px' }}>
                    <strong>Pasal 3: Tanggung Jawab</strong><br />
                    Pihak Kedua wajib menjaga kebersihan dan fasilitas umum. Kerusakan akibat kelalaian sepenuhnya menjadi tanggung jawab Pihak Kedua.
                  </p>
                  <p style={{ marginBottom: '12px' }}>
                    <strong>Pasal 4: Pembatalan & Penalti</strong><br />
                    Pembatalan sepihak sebelum masa sewa berakhir akan dikenakan penalti sebesar 1 bulan biaya sewa.
                  </p>
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '20px' }}>--- Akhir Dokumen ---</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                  <input type="checkbox" id="agree" style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                  <label htmlFor="agree" style={{ fontSize: '13px', cursor: 'pointer' }}>
                    Saya telah membaca, memahami, dan menyetujui seluruh syarat dan ketentuan di atas.
                  </label>
                </div>

                <div className="flex-between">
                  <button className="btn btn-outline" onClick={() => setShowContract(false)}>
                    Kembali
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={contractSigned}
                    onClick={() => {
                      const agree = document.getElementById('agree');
                      if (agree && agree.checked) {
                        handleSignContract();
                      } else {
                        alert("Harap centang persetujuan kontrak terlebih dahulu.");
                      }
                    }}
                  >
                    {contractSigned ? 'Memproses Kontrak...' : 'Tanda Tangani Kontrak'}
                  </button>
                </div>
              </div>
            ) : (
              /* Standard Property Detail View */
              <div>
                <div style={{ height: '350px', position: 'relative' }}>
                  <img
                    src={selectedProperty.image}
                    alt={selectedProperty.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div style={{
                    position: 'absolute',
                    bottom: '0',
                    left: '0',
                    right: '0',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                    padding: '30px 40px',
                    color: 'white'
                  }}>
                    <span className="badge badge-primary" style={{ marginBottom: '10px' }}>All-Inclusive</span>
                    <h2 style={{ color: 'white', fontSize: '32px', marginBottom: '8px' }}>{selectedProperty.name}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px' }}>
                      <span className="flex-center" style={{ gap: '4px' }}>
                        <MapPin size={16} />
                        {selectedProperty.address}
                      </span>
                      <span className="flex-center" style={{ gap: '4px' }}>
                        <Star size={16} style={{ fill: '#f59e0b', color: '#f59e0b' }} />
                        {selectedProperty.rating > 0 ? selectedProperty.rating : 'Baru'} ({reviews.filter(r => r.propertyId === selectedProperty.id).length} Review)
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '40px' }} className="grid-3">
                  <div style={{ gridColumn: 'span 2' }}>
                    <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>Deskripsi Properti</h3>
                    <p style={{ color: 'var(--text-main)', fontSize: '15px', lineHeight: 1.6, marginBottom: '24px' }}>
                      {selectedProperty.description || "Tidak ada deskripsi tersedia untuk properti ini."}
                    </p>

                    <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>Fasilitas All-Inclusive</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '32px' }}>
                      {selectedProperty.facilities.map((fac, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                          <div style={{ color: 'var(--primary)', display: 'flex' }}>
                            {renderFacilityIcon(fac)}
                          </div>
                          <span style={{ fontSize: '14px', fontWeight: 500 }}>{fac}</span>
                        </div>
                      ))}
                    </div>

                    <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>Lokasi</h3>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                      <MapPin size={24} style={{ color: 'var(--primary)' }} />
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '14px' }}>Koordinat Lokasi</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Latitude: {selectedProperty.latitude}, Longitude: {selectedProperty.longitude}</p>
                      </div>
                    </div>
                  </div>

                  {/* Sidebar Panel */}
                  <div className="card" style={{ padding: '24px', height: 'fit-content', backgroundColor: '#f8fafc', border: '1px solid var(--border-color)' }}>
                    <div style={{ marginBottom: '20px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Biaya Sewa Bulanan</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '4px' }}>
                        <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--primary)' }}>
                          {formatPrice(selectedProperty.price)}
                        </span>
                        <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>/bulan</span>
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 600, marginTop: '4px' }}>
                        * Bebas biaya tambahan listrik, air, dan kebersihan.
                      </p>
                    </div>

                    <div style={{ marginBottom: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                      <div className="flex-between" style={{ marginBottom: '8px', fontSize: '13px' }}>
                        <span>Kamar Tersedia</span>
                        <span style={{ fontWeight: 600 }}>{selectedProperty.totalRooms - selectedProperty.occupiedRooms} / {selectedProperty.totalRooms} Kamar</span>
                      </div>
                      <div style={{ background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          background: 'var(--primary)',
                          height: '100%',
                          width: `${(selectedProperty.occupiedRooms / selectedProperty.totalRooms) * 100}%`
                        }}></div>
                      </div>
                    </div>

                    {currentUser ? (
                      currentUser.role === 'tenant' ? (
                        <button
                          className="btn btn-primary"
                          style={{ width: '100%', padding: '12px' }}
                          onClick={() => setShowContract(true)}
                          disabled={selectedProperty.totalRooms <= selectedProperty.occupiedRooms}
                        >
                          {selectedProperty.totalRooms <= selectedProperty.occupiedRooms ? 'Kamar Penuh' : 'Sewa Kamar Sekarang'}
                        </button>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                          Gunakan akun Tenant untuk menyewa properti ini.
                        </div>
                      )
                    ) : (
                      <button
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '12px' }}
                        onClick={() => navigate('/login')}
                      >
                        Masuk untuk Menyewa
                      </button>
                    )}
                  </div>
                </div>

                {/* Reviews inside details modal */}
                <div style={{ padding: '0 40px 40px', borderTop: '1px solid var(--border-color)', paddingTop: '32px' }}>
                  <h3 style={{ fontSize: '20px', marginBottom: '16px' }}>
                    Review Properti ({reviews.filter(r => r.propertyId === selectedProperty.id).length})
                  </h3>
                  {reviews.filter(r => r.propertyId === selectedProperty.id).length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '14px' }}>
                      Belum ada review untuk properti ini. Jadilah yang pertama memberikan review!
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {reviews.filter(r => r.propertyId === selectedProperty.id).map(rev => (
                        <div key={rev.id} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
                          <div className="flex-between" style={{ marginBottom: '6px' }}>
                            <strong style={{ fontSize: '14px' }}>{rev.userName}</strong>
                            <div style={{ display: 'flex', gap: '2px' }}>
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
                          </div>
                          <p style={{ fontSize: '13px', color: 'var(--text-main)' }}>{rev.comment}</p>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                            {rev.date}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <div className="nav-brand" style={{ color: 'white', marginBottom: '16px' }}>
              <ShieldCheck size={28} />
              <span>KOSMO</span>
            </div>
            <p style={{ fontSize: '14px', lineHeight: 1.6 }}>
              KOSMO adalah platform co-living terintegrasi untuk digital nomad dan profesional muda di Bali.
              Sewa kamar modern dengan fasilitas lengkap tanpa ribet.
            </p>
          </div>
          <div>
            <h4 className="footer-title">Wilayah</h4>
            <ul className="footer-links">
              <li><a href="#" className="footer-link" onClick={(e) => { e.preventDefault(); setDistrict('Denpasar'); fetchProperties('?district=Denpasar'); }}>Denpasar</a></li>
              <li><a href="#" className="footer-link" onClick={(e) => { e.preventDefault(); setDistrict('Badung'); fetchProperties('?district=Badung'); }}>Seminyak & Kuta (Badung)</a></li>
              <li><a href="#" className="footer-link" onClick={(e) => { e.preventDefault(); setDistrict('Gianyar'); fetchProperties('?district=Gianyar'); }}>Ubud (Gianyar)</a></li>
            </ul>
          </div>
          <div>
            <h4 className="footer-title">Dukungan</h4>
            <ul className="footer-links">
              <li><a href="#" className="footer-link" onClick={(e) => { e.preventDefault(); alert("Hubungi live chat di WhatsApp: +62 812-3456-7890"); }}>Pusat Bantuan</a></li>
              <li><a href="#" className="footer-link" onClick={(e) => { e.preventDefault(); alert("Syarat & Ketentuan KOSMO: Layanan Co-living Bali."); }}>Syarat & Ketentuan</a></li>
              <li><a href="#" className="footer-link" onClick={(e) => { e.preventDefault(); alert("Kebijakan Privasi Data Pengguna."); }}>Kebijakan Privasi</a></li>
            </ul>
          </div>
        </div>
        <div className="container footer-bottom">
          <p>&copy; {new Date().getFullYear()} KOSMO Co-Living Platform. Hak Cipta Dilindungi.</p>
        </div>
      </footer>
    </div>
  );
}
