import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wifi, Tv, Wind, Shield, Droplet, Check, ShieldCheck, Heart,
  Zap, Sparkles, Car, Star, MapPin
} from 'lucide-react';
import { Property, Review, User, FacilityFilterState } from '../types/index.ts';
import KosCard from '../components/KosCard.tsx';
import SearchFilterBar from '../components/SearchFilterBar.tsx';
import BookingModal from '../components/BookingModal.tsx';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export default function LandingPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showContract, setShowContract] = useState<boolean>(false);
  const [contractSigned, setContractSigned] = useState<boolean>(false);
  const [showPayment, setShowPayment] = useState<boolean>(false);
  const [paymentProcessing, setPaymentProcessing] = useState<boolean>(false);
  const [showMap, setShowMap] = useState<boolean>(false);

  // Filter States
  const [district, setDistrict] = useState<string>('Semua');
  const [priceMax, setPriceMax] = useState<number>(10000000);
  const [facilities, setFacilities] = useState<FacilityFilterState>({
    Listrik: false,
    Air: false,
    Wifi: false,
    Kebersihan: false,
    Keamanan: false,
    Parkir: false
  });

  const rawUser = localStorage.getItem('user');
  const currentUser: User | null = rawUser ? (JSON.parse(rawUser) as User) : null;

  const fetchProperties = async (queryParams: string = ''): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/properties${queryParams}`);
      const data = (await res.json()) as Property[];
      setProperties(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching properties:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/reviews`);
      const data = (await res.json()) as Review[];
      setReviews(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching reviews:", err);
    }
  };

  useEffect(() => {
    fetchProperties();
    fetchReviews();
    // Track visitor
    fetch(`${API_BASE}/tracking/visit`, { method: 'POST' }).catch(() => { });
  }, []);

  useEffect(() => {
    if (!showMap || !selectedProperty) return;

    const timer = setTimeout(() => {
      if (typeof window.L === 'undefined') return;
      const mapContainer = document.getElementById('property-detail-map') as (HTMLElement & { _leaflet_id?: number }) | null;
      if (!mapContainer) return;
      if (mapContainer._leaflet_id) return; // already initialized

      const lat = parseFloat(selectedProperty.latitude) || -8.6500;
      const lng = parseFloat(selectedProperty.longitude) || 115.2166;

      const map = window.L.map('property-detail-map').setView([lat, lng], 14);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      window.L.marker([lat, lng])
        .addTo(map)
        .bindPopup(`<b>${selectedProperty.name}</b><br/>${selectedProperty.address}`)
        .openPopup();

      setTimeout(() => map.invalidateSize(), 300);
    }, 100);

    return () => clearTimeout(timer);
  }, [showMap, selectedProperty]);

  const handleSearch = (e: React.FormEvent): void => {
    e.preventDefault();
    let query = `?priceMin=0&priceMax=${priceMax}`;
    if (district !== 'Semua') {
      query += `&district=${encodeURIComponent(district)}`;
    }

    // Add selected facilities
    Object.keys(facilities).forEach((fac) => {
      if (facilities[fac]) {
        query += `&facility=${encodeURIComponent(fac)}`;
      }
    });

    fetchProperties(query);
  };

  const toggleFacility = (fac: string): void => {
    setFacilities((prev) => ({
      ...prev,
      [fac]: !prev[fac]
    }));
  };

  const resetFilters = (): void => {
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

  const handleOpenDetail = (prop: Property): void => {
    setSelectedProperty(prop);
    setContractSigned(false);
    setShowContract(false);
    setShowPayment(false);
    setShowMap(false);
  };

  const handleSignContract = (): void => {
    setContractSigned(true);
    setTimeout(() => {
      setShowContract(false);
      setShowPayment(true);
      setContractSigned(false);
    }, 1500);
  };

  const handleProcessPayment = async (): Promise<void> => {
    if (!currentUser || !selectedProperty) return;
    setPaymentProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/rentals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: currentUser.id,
          propertyId: selectedProperty.id,
          propertyName: selectedProperty.name,
          price: selectedProperty.price
        })
      });

      if (res.ok) {
        alert("🎉 Pembayaran Sukses! Selamat datang di KOSMO.");
        setShowPayment(false);
        setSelectedProperty(null);
        navigate('/tenant');
      } else {
        const data = (await res.json()) as { message?: string };
        alert("Gagal memproses pembayaran: " + (data.message || ''));
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan saat pembayaran.");
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Map icon strings to Lucide elements
  const renderFacilityIcon = (fac: string): React.ReactNode => {
    switch (fac.toLowerCase()) {
      case 'wifi': return <Wifi size={14} />;
      case 'tv': return <Tv size={14} />;
      case 'ac': return <Wind size={14} />;
      case 'keamanan': return <Shield size={14} />;
      case 'air': return <Droplet size={14} />;
      case 'listrik': return <Zap size={14} />;
      case 'parkir': return <Car size={14} />;
      case 'kebersihan': return <Sparkles size={14} />;
      case 'kolam renang': return <Droplet size={14} />;
      default: return <Check size={14} />;
    }
  };

  const handleUserDashboardRedirect = (): void => {
    if (!currentUser) {
      navigate('/login');
    } else if (currentUser.role === 'admin') {
      navigate('/admin');
    } else if (currentUser.role === 'landlord') {
      navigate('/landlord');
    } else {
      navigate('/tenant');
    }
  };

  return (
    <div className="landing-page">
      {/* Header Navigation */}
      <header className="site-header glass-panel">
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => navigate('/')}>
            <div className="flex-center" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--primary)', color: 'white' }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }}>KOSMO</span>
              <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700, display: 'block', lineHeight: 1 }}>BALI CO-LIVING</span>
            </div>
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <a href="#properties" style={{ textDecoration: 'none', color: 'var(--text-main)', fontSize: '14px', fontWeight: 600 }}>Properti</a>
            <a href="#all-inclusive" style={{ textDecoration: 'none', color: 'var(--text-main)', fontSize: '14px', fontWeight: 600 }}>All-Inclusive</a>
            <a href="#reviews" style={{ textDecoration: 'none', color: 'var(--text-main)', fontSize: '14px', fontWeight: 600 }}>Ulasan</a>

            {currentUser ? (
              <button
                className="btn btn-primary"
                onClick={handleUserDashboardRedirect}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Dasbor ({currentUser.name})
              </button>
            ) : (
              <button
                className="btn btn-outline"
                onClick={() => navigate('/login')}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Masuk / Daftar
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="container" style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div className="badge flex-center" style={{ width: 'fit-content', margin: '0 auto 16px auto', gap: '6px' }}>
            <Sparkles size={14} />
            <span>Smart Co-Living Experience in Bali</span>
          </div>
          <h1 style={{ fontSize: '46px', fontWeight: 900, lineHeight: 1.15, marginBottom: '20px', letterSpacing: '-1px' }}>
            Tinggal Nyaman, Bebas Ribet dengan <span style={{ color: 'var(--primary)' }}>All-Inclusive</span> Rent
          </h1>
          <p style={{ fontSize: '18px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '32px' }}>
            Satu harga bulanan sudah termasuk Listrik, Air, Wifi High-Speed, Kebersihan, Keamanan & Parkir. Tanpa tagihan tak terduga.
          </p>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="container" style={{ marginTop: '-40px', position: 'relative', zIndex: 2 }}>
        <SearchFilterBar
          district={district}
          setDistrict={setDistrict}
          priceMax={priceMax}
          setPriceMax={setPriceMax}
          facilities={facilities}
          toggleFacility={toggleFacility}
          handleSearch={handleSearch}
          resetFilters={resetFilters}
          renderFacilityIcon={renderFacilityIcon}
        />
      </section>

      {/* Property Listings */}
      <section id="properties" className="container" style={{ padding: '60px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: 800 }}>Pilihan Kos & Co-Living</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
              Daftar hunian eksklusif dengan sistem smart lock dan fasilitas lengkap di Bali
            </p>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>
            Menampilkan {properties.length} properti
          </span>
        </div>

        {loading ? (
          <div className="flex-center" style={{ minHeight: '300px' }}>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Memuat properti...</div>
          </div>
        ) : properties.length === 0 ? (
          <div className="card glass-panel" style={{ padding: '48px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Tidak Ada Properti Ditemukan</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
              Coba sesuaikan filter wilayah atau turunkan fasilitas pencarian Anda.
            </p>
            <button className="btn btn-primary" onClick={resetFilters}>
              Reset Semua Filter
            </button>
          </div>
        ) : (
          <div className="property-grid">
            {properties.map((prop) => (
              <KosCard
                key={prop.id}
                property={prop}
                onOpenDetail={handleOpenDetail}
                renderFacilityIcon={renderFacilityIcon}
              />
            ))}
          </div>
        )}
      </section>

      {/* All-Inclusive Feature Highlight Section */}
      <section id="all-inclusive" style={{ backgroundColor: 'var(--bg-main)', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', padding: '80px 24px' }}>
        <div className="container" style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
          <div className="badge flex-center" style={{ width: 'fit-content', margin: '0 auto 16px auto', gap: '6px' }}>
            <Zap size={14} />
            <span>KOSMO Transparency Guarantee</span>
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '16px' }}>
            Kenapa Memilih KOSMO All-Inclusive?
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '16px', maxWidth: '640px', margin: '0 auto 48px auto' }}>
            Tidak ada lagi kejutan tagihan listrik jebol atau internet lemot di akhir bulan. Semua kebutuhan utama Anda sudah tercover.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', textAlign: 'left' }}>
            <div className="card glass-panel" style={{ padding: '24px' }}>
              <div className="flex-center" style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', marginBottom: '16px' }}>
                <Zap size={22} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Listrik & Air Tanpa Batas</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
                Gunakan AC dan peralatan elektronik Anda dengan tenang tanpa pusing memikirkan token listrik habis tengah malam.
              </p>
            </div>

            <div className="card glass-panel" style={{ padding: '24px' }}>
              <div className="flex-center" style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm)', backgroundColor: '#fdf2f8', color: '#db2777', marginBottom: '16px' }}>
                <Wifi size={22} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Dedicated High-Speed WiFi</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
                Dirancang khusus untuk remote worker dan digital nomad dengan koneksi stabil, backup provider, dan area coworking.
              </p>
            </div>

            <div className="card glass-panel" style={{ padding: '24px' }}>
              <div className="flex-center" style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm)', backgroundColor: '#ecfdf5', color: '#10b981', marginBottom: '16px' }}>
                <ShieldCheck size={22} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Smart Lock & Keamanan 24/7</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
                Akses pintu kamar menggunakan PIN/Smart Card dan CCTV area umum untuk privasi dan kenyamanan maksimal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      <section id="reviews" className="container" style={{ padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '30px', fontWeight: 800 }}>Apa Kata Penghuni KOSMO?</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '6px' }}>
            Ulasan asli dan pengalaman langsung dari para digital nomad & tenant kami di Bali
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          {reviews.map((rev) => (
            <div key={rev.id} className="card glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ fontSize: '15px', fontWeight: 700 }}>{rev.userName}</h4>
                    <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>{rev.propertyName}</span>
                  </div>
                  <div style={{ display: 'flex', color: '#f59e0b', gap: '2px' }}>
                    {[...Array(rev.rating)].map((_, i) => (
                      <Star key={i} size={14} fill="currentColor" />
                    ))}
                  </div>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6, fontStyle: 'italic' }}>
                  "{rev.comment}"
                </p>
              </div>
              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-muted)' }}>
                {rev.date}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: 'white', borderTop: '1px solid var(--border-color)', padding: '40px 24px', textAlign: 'center' }}>
        <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="flex-center" style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--primary)', color: 'white' }}>
              <ShieldCheck size={18} />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800 }}>KOSMO Bali</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '480px' }}>
            Platform persewaan kos & co-living all-inclusive terpercaya untuk kemudahan tinggal jangka panjang di Pulau Dewata.
          </p>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            &copy; {new Date().getFullYear()} KOSMO Bali. Seluruh hak cipta dilindungi undang-undang.
          </div>
        </div>
      </footer>

      {/* Booking and Details Modal */}
      <BookingModal
        property={selectedProperty}
        showContract={showContract}
        setShowContract={setShowContract}
        contractSigned={contractSigned}
        handleSignContract={handleSignContract}
        showPayment={showPayment}
        setShowPayment={setShowPayment}
        paymentProcessing={paymentProcessing}
        handleProcessPayment={handleProcessPayment}
        showMap={showMap}
        setShowMap={setShowMap}
        onClose={() => setSelectedProperty(null)}
        currentUser={currentUser}
        onNavigateToLogin={() => navigate('/login')}
        renderFacilityIcon={renderFacilityIcon}
      />
    </div>
  );
}
