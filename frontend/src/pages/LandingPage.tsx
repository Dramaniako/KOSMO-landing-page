import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wifi, Tv, Wind, Shield, Droplet, Check, ShieldCheck, Heart,
  Zap, Sparkles, Car, Star, MapPin
} from 'lucide-react';
import { Property, Review, User, FacilityFilterState } from '../types/index.ts';
import KosCard from '../components/KosCard.tsx';
import KosCardSkeleton from '../components/KosCardSkeleton.tsx';
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
  const [hasActiveRental, setHasActiveRental] = useState<boolean>(false);

  // Filter States
  const [district, setDistrict] = useState<string>('Semua');
  const [priceMin, setPriceMin] = useState<number>(0);
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
    if (!currentUser?.id) {
      setHasActiveRental(false);
      return;
    }
    const checkActiveRental = async (): Promise<void> => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/rentals?tenantId=${encodeURIComponent(currentUser.id)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const rentals = (await res.json()) as Array<{ status: string }>;
          if (Array.isArray(rentals)) {
            const active = rentals.some(r => r.status === 'active');
            setHasActiveRental(active);
          }
        }
      } catch (err) {
        console.warn("Failed to check active rentals:", err);
      }
    };
    checkActiveRental();
  }, [currentUser?.id]);

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
    let query = `?priceMin=${priceMin}&priceMax=${priceMax}`;
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
    setPriceMin(0);
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
    setShowContract(false);
    setShowPayment(true);
    setContractSigned(false);
  };

  const handleProcessPayment = async (): Promise<void> => {
    if (!currentUser || !selectedProperty) return;
    setPaymentProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/rentals`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tenantId: currentUser.id,
          propertyId: selectedProperty.id,
          propertyName: selectedProperty.name,
          price: selectedProperty.price,
          durationMonths: 1
        })
      });

      if (res.ok) {
        setShowPayment(false);
        setSelectedProperty(null);
        navigate('/tenant');
      } else {
        const data = (await res.json()) as { message?: string };
        console.error("Rental booking failed:", data.message);
      }
    } catch (err) {
      console.error("Payment processing exception:", err);
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
    <div className="min-h-screen bg-slate-50 text-slate-800 landing-page">
      {/* Header Navigation */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 site-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <ShieldCheck size={20} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-blue-600 tracking-tight">KOSMO</span>
              <span className="text-[10px] font-bold text-slate-400 tracking-wider hidden sm:inline">BALI CO-LIVING</span>
            </div>
          </div>

          <nav className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <a href="#properties" className="hover:text-blue-600 transition-colors">Properti</a>
              <a href="#all-inclusive" className="hover:text-blue-600 transition-colors">All-Inclusive</a>
              <a href="#reviews" className="hover:text-blue-600 transition-colors">Ulasan</a>
            </div>

            {currentUser ? (
              <button
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition btn btn-primary"
                onClick={handleUserDashboardRedirect}
              >
                Dasbor ({currentUser.name})
              </button>
            ) : (
              <button
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition btn btn-primary"
                onClick={() => navigate('/login')}
              >
                Masuk / Daftar
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/50 via-slate-50 to-slate-50 pt-16 pb-20 hero-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-100/80 text-blue-700 text-xs font-bold mb-6 border border-blue-200/60 shadow-sm">
            <Sparkles size={14} />
            <span>Smart Co-Living Experience in Bali</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight max-w-4xl mx-auto leading-tight mb-6">
            Tinggal Nyaman, Bebas Ribet dengan <span className="text-blue-600">All-Inclusive</span> Rent
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed mb-8">
            Satu harga bulanan sudah termasuk Listrik, Air, Wifi High-Speed, Kebersihan, Keamanan & Parkir. Tanpa tagihan tak terduga.
          </p>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20">
        <SearchFilterBar
          district={district}
          setDistrict={setDistrict}
          priceMin={priceMin}
          setPriceMin={setPriceMin}
          priceMax={priceMax}
          setPriceMax={setPriceMax}
          facilities={facilities}
          toggleFacility={toggleFacility}
          handleSearch={handleSearch}
          resetFilters={resetFilters}
          renderFacilityIcon={renderFacilityIcon}
          isSearching={loading}
        />
      </section>

      {/* Property Listings */}
      <section id="properties" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-2">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Pilihan Kos & Co-Living</h2>
            <p className="text-sm text-slate-500 mt-1">
              Daftar hunian eksklusif dengan sistem smart lock dan fasilitas lengkap di Bali
            </p>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Menampilkan {loading ? '...' : properties.length} properti
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 property-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <KosCardSkeleton key={i} />
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Tidak Ada Properti Ditemukan</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              Coba sesuaikan filter wilayah atau turunkan fasilitas pencarian Anda.
            </p>
            <button className="btn btn-primary bg-blue-600 text-white text-xs font-semibold px-5 py-2.5 rounded-xl" onClick={resetFilters}>
              Reset Semua Filter
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 property-grid">
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
      <section id="all-inclusive" className="bg-white border-y border-slate-200/80 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-4 border border-blue-100">
            <Zap size={14} />
            <span>KOSMO Transparency Guarantee</span>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-4">
            Kenapa Memilih KOSMO All-Inclusive?
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed mb-12">
            Tidak ada lagi kejutan tagihan listrik jebol atau internet lemot di akhir bulan. Semua kebutuhan utama Anda sudah tercover.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200/80">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                <Zap size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Listrik & Air Tanpa Batas</h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                Gunakan AC dan peralatan elektronik Anda dengan tenang tanpa pusing memikirkan token listrik habis tengah malam.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200/80">
              <div className="w-12 h-12 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center mb-4">
                <Wifi size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Dedicated High-Speed WiFi</h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                Dirancang khusus untuk remote worker dan digital nomad dengan koneksi stabil, backup provider, dan area coworking.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200/80">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Smart Lock & Keamanan 24/7</h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                Akses pintu kamar menggunakan PIN/Smart Card dan CCTV area umum untuk privasi dan kenyamanan maksimal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      <section id="reviews" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Apa Kata Penghuni KOSMO?</h2>
          <p className="text-sm text-slate-500 mt-2">
            Ulasan asli dan pengalaman langsung dari para digital nomad & tenant kami di Bali
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {reviews.map((rev) => (
            <div key={rev.id} className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{rev.userName}</h4>
                    <span className="text-xs font-semibold text-blue-600">{rev.propertyName}</span>
                  </div>
                  <div className="flex text-amber-400">
                    {[...Array(rev.rating)].map((_, i) => (
                      <Star key={i} size={13} fill="currentColor" />
                    ))}
                  </div>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed italic">
                  "{rev.comment}"
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                {rev.date}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-12 text-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <ShieldCheck size={18} />
            </div>
            <span className="text-base font-extrabold text-slate-900">KOSMO Bali</span>
          </div>
          <p className="text-xs text-slate-500 max-w-md">
            Platform persewaan kos & co-living all-inclusive terpercaya untuk kemudahan tinggal jangka panjang di Pulau Dewata.
          </p>
          <div className="text-[11px] text-slate-400">
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
        hasActiveRental={hasActiveRental}
      />
    </div>
  );
}
