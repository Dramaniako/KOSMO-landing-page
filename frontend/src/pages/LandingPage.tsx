import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wifi, Tv, Wind, Shield, Droplet, Check, ShieldCheck, Heart,
  Zap, Sparkles, Car, Star, MapPin, Search, SlidersHorizontal,
  Bell, ChevronDown, ArrowRight, User as UserIcon, Building2, Users
} from 'lucide-react';
import { Property, Review, User, FacilityFilterState, ContractSignPayload, SignedContractData } from '../types/index';
import KosCard from '../components/KosCard';
import KosCardSkeleton from '../components/KosCardSkeleton';
import SearchFilterBar from '../components/SearchFilterBar';
import BookingModal from '../components/BookingModal';
import ThemeLanguageToggle from '../components/ThemeLanguageToggle';
import JuraganKostLogo from '../components/JuraganKostLogo';
import MobileBottomNav from '../components/MobileBottomNav';
import { useTranslation } from '../context/LanguageContext';
import { getAuthToken } from '../services/apiClient';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export default function LandingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [properties, setProperties] = useState<Property[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showContract, setShowContract] = useState<boolean>(false);
  const [contractSigned, setContractSigned] = useState<boolean>(false);
  const [signedContractData, setSignedContractData] = useState<SignedContractData | null>(null);
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [showPayment, setShowPayment] = useState<boolean>(false);
  const [paymentProcessing, setPaymentProcessing] = useState<boolean>(false);
  const [showMap, setShowMap] = useState<boolean>(false);
  const [hasActiveRental, setHasActiveRental] = useState<boolean>(false);
  const [activeRentalError, setActiveRentalError] = useState<string | null>(null);


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

  const [activeCategory, setActiveCategory] = useState<string>('Semua');

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const rawUser = localStorage.getItem('user');
      return rawUser ? (JSON.parse(rawUser) as User) : null;
    } catch {
      return null;
    }
  });

  const displayedProperties = useMemo(() => {
    if (activeCategory === 'Semua') return properties;
    const lower = activeCategory.toLowerCase();
    const filtered = properties.filter((p) => {
      const name = (p.name || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      if (lower === 'putra') return name.includes('putra') || desc.includes('putra') || name.includes('pria') || desc.includes('pria');
      if (lower === 'putri') return name.includes('putri') || desc.includes('putri') || name.includes('wanita') || desc.includes('wanita');
      if (lower === 'apartemen') return name.includes('apartemen') || name.includes('suite') || name.includes('residence') || name.includes('villa');
      if (lower === 'campur') return name.includes('campur') || desc.includes('campur') || (!name.includes('putri') && !name.includes('putra') && !desc.includes('putri') && !desc.includes('putra'));
      return true;
    });
    return filtered;
  }, [properties, activeCategory]);

  useEffect(() => {
    try {
      const rawUser = localStorage.getItem('user');
      if (rawUser) {
        setCurrentUser(JSON.parse(rawUser) as User);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchProperties = useCallback(async (queryParams: string = ''): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/properties${queryParams}`);
      if (!res.ok) {
        const errText = await res.text();
        console.error(`Failed to fetch properties [${res.status}]:`, errText);
        setProperties([]);
        return;
      }
      const data = (await res.json()) as Property[];
      setProperties(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Network or parsing error fetching properties:", err);
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReviews = async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/reviews`);
      if (!res.ok) {
        const errText = await res.text();
        console.error(`Failed to fetch reviews [${res.status}]:`, errText);
        setReviews([]);
        return;
      }
      const data = (await res.json()) as Review[];
      setReviews(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Network or parsing error fetching reviews:", err);
      setReviews([]);
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

    let mapInstance: unknown = null;
    const timer = setTimeout(() => {
      if (typeof window.L === 'undefined') return;
      const mapContainer = document.getElementById('property-detail-map') as (HTMLElement & { _leaflet_id?: number }) | null;
      if (!mapContainer) return;
      if (mapContainer._leaflet_id) return; // already initialized

      const lat = parseFloat(selectedProperty.latitude) || -8.6500;
      const lng = parseFloat(selectedProperty.longitude) || 115.2166;

      const map = window.L.map('property-detail-map').setView([lat, lng], 14);
      mapInstance = map;
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      window.L.marker([lat, lng])
        .addTo(map)
        .bindPopup(`<b>${selectedProperty.name}</b><br/>${selectedProperty.address}`)
        .openPopup();

      setTimeout(() => map.invalidateSize(), 300);
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstance && typeof (mapInstance as { remove: () => void }).remove === 'function') {
        (mapInstance as { remove: () => void }).remove();
        mapInstance = null;
      }
    };
  }, [showMap, selectedProperty]);

  const toggleFacility = useCallback((facilityName: string): void => {
    setFacilities((prev) => ({
      ...prev,
      [facilityName as keyof FacilityFilterState]: !prev[facilityName as keyof FacilityFilterState]
    }));
  }, []);

  const handleSearch = useCallback((e: React.FormEvent): void => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (district && district !== 'Semua') {
      params.append('district', district);
    }
    let effectiveMin = priceMin;
    let effectiveMax = priceMax;
    if (effectiveMin > 0 && effectiveMax > 0 && effectiveMin > effectiveMax) {
      const temp = effectiveMin;
      effectiveMin = effectiveMax;
      effectiveMax = temp;
    }
    if (effectiveMin > 0) {
      params.append('minPrice', effectiveMin.toString());
    }
    if (effectiveMax > 0 && effectiveMax < 10000000) {
      params.append('maxPrice', effectiveMax.toString());
    }

    const selectedFacilities = Object.keys(facilities).filter(
      (fac) => facilities[fac as keyof FacilityFilterState]
    );
    if (selectedFacilities.length > 0) {
      params.append('facilities', selectedFacilities.join(','));
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    fetchProperties(queryString);
  }, [district, priceMin, priceMax, facilities, fetchProperties]);

  const resetFilters = useCallback((): void => {
    setDistrict('Semua');
    setActiveCategory('Semua');
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
    fetchProperties('');
  }, [fetchProperties]);

  // ⚡ Bolt Performance Optimization:
  // Wrapped in useCallback to provide a stable reference.
  // This prevents the KosCard components from re-rendering unnecessarily
  // when parent state (like filters) changes, improving scroll and filter performance.
  // Expected Impact: Reduces KosCard re-renders by ~100% on search/filter typing.
  const handleOpenDetail = useCallback((property: Property): void => {
    setSelectedProperty(property);
    setShowContract(false);
    setContractSigned(false);
    setSignedContractData(null);
    setShowPayment(false);
    setShowMap(false);
    setActiveRentalError(null);

    // If tenant is logged in, check if they already have an active tenancy
    if (currentUser) {
      const token = getAuthToken();
      fetch(`${API_BASE}/rentals?tenantId=${encodeURIComponent(currentUser.id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
        .then(async (res) => {
          if (!res.ok) return [];
          return res.json();
        })
        .then((data: unknown) => {
          if (Array.isArray(data)) {
            const hasActive = data.some((r: { status?: string }) => r.status === 'active');
            setHasActiveRental(hasActive);
            if (hasActive) {
              setActiveRentalError(t('modal.activeRentalAlert'));
            }
          }
        })
        .catch((err) => console.error("Error checking tenant active rentals:", err));
    } else {
      setHasActiveRental(false);
    }
  }, [currentUser, t]);

  const handleSignContractSubmit = async (payload: ContractSignPayload): Promise<boolean> => {
    if (!currentUser) {
      navigate('/login');
      return false;
    }
    if (!selectedProperty) return false;

    setIsSigning(true);
    setActiveRentalError(null);

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/rentals/contract/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (res.status === 409) {
        const conflictData = (await res.json().catch(() => ({}))) as { message?: string };
        const msg = conflictData.message || t('modal.activeRentalAlert');
        setActiveRentalError(msg);
        setHasActiveRental(true);
        return false;
      }

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorData.message || 'Gagal menandatangani kontrak digital.');
      }

      const data = (await res.json()) as {
        rentalId: string;
        contractUrl: string;
        contractHash: string;
        adminFee?: number;
        totalAmount?: number;
        signedAt?: string;
      };

      setSignedContractData({
        rentalId: data.rentalId,
        contractUrl: data.contractUrl,
        contractHash: data.contractHash,
        adminFee: data.adminFee || 5000,
        totalAmount: data.totalAmount || (payload.durationMonths * (selectedProperty.price || 0) + 5000),
        signedAt: data.signedAt || new Date().toISOString()
      });
      setContractSigned(true);
      setShowContract(false);
      setShowPayment(true);
      return true;
    } catch (err: unknown) {
      console.error("Contract signing exception:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setActiveRentalError(errMsg);
      return false;
    } finally {
      setIsSigning(false);
    }
  };

  const handleProcessPayment = async (): Promise<void> => {
    if (!selectedProperty || !currentUser || !contractSigned || !signedContractData) return;
    setPaymentProcessing(true);
    setActiveRentalError(null);

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Step 1: Request Midtrans Snap Transaction Token with signed rentalId
      const tokenRes = await fetch(`${API_BASE}/payment/token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          propertyId: selectedProperty.id,
          propertyName: selectedProperty.name,
          price: selectedProperty.price,
          tenantId: currentUser.id,
          tenantName: currentUser.name,
          tenantEmail: currentUser.email,
          durationMonths: 1,
          rentalId: signedContractData.rentalId
        })
      });

      if (tokenRes.status === 409) {
        const conflictData = (await tokenRes.json()) as { message?: string };
        const msg = conflictData.message || "Anda memiliki sewa aktif. Harap selesaikan sewa berjalan sebelum memesan unit baru.";
        setActiveRentalError(msg);
        setHasActiveRental(true);
        return;
      }

      if (!tokenRes.ok) {
        const errorData = (await tokenRes.json()) as { message?: string };
        throw new Error(errorData.message || "Gagal membuat transaksi pembayaran.");
      }

      const data = (await tokenRes.json()) as {
        snapToken?: string;
        token?: string;
        rentalId: string;
      };

      const snapToken = data.snapToken || data.token;

      if (!snapToken) {
        throw new Error("Token pembayaran tidak ditemukan dari respons server.");
      }

      if (typeof window === 'undefined' || !window.snap) {
        throw new Error("Midtrans Payment Gateway belum siap. Silakan muat ulang halaman.");
      }

      // Step 3: Launch Midtrans Snap Popup
      window.snap.pay(snapToken, {
        onSuccess: async (result: unknown) => {
          console.log("Midtrans payment success:", result);
          try {
            await fetch(`${API_BASE}/payment/finish`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ rentalId: signedContractData.rentalId })
            });
          } catch (finishErr) {
            console.warn("Payment finish notification warning:", finishErr);
          }
          setShowPayment(false);
          setSelectedProperty(null);
          navigate('/tenant');
        },
        onPending: (result: unknown) => {
          console.log("Midtrans payment pending:", result);
          setShowPayment(false);
          setSelectedProperty(null);
          navigate('/tenant');
        },
        onError: (err: unknown) => {
          console.error("Midtrans Snap payment error:", err);
          alert("Pembayaran gagal atau dibatalkan. Silakan coba lagi.");
        },
        onClose: () => {
          console.log("Snap payment popup closed by user.");
        }
      });

    } catch (err: unknown) {
      console.error("Payment processing exception:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setActiveRentalError(errMsg);
    } finally {
      setPaymentProcessing(false);
    }
  };


  // Map icon strings to Lucide elements
  // ⚡ Bolt Performance Optimization:
  // Memoized using useCallback to keep stable references.
  // Without this, the inline function creates a new reference on every render,
  // causing React.memo on KosCard to fail the shallow comparison check.
  const renderFacilityIcon = useCallback((fac: string): React.ReactNode => {
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
  }, []);

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 landing-page pb-16 md:pb-0 transition-colors duration-200">
      {/* Header Navigation */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 site-header transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="cursor-pointer nav-brand" onClick={() => navigate('/')}>
              <JuraganKostLogo size="md" />
            </div>

            {/* Location Dropdown Pill (Mockup Screen 3) */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition">
              <MapPin size={13} className="text-emerald-600 dark:text-emerald-400" />
              <span>Denpasar, Bali</span>
              <ChevronDown size={14} className="text-slate-400" />
            </div>
          </div>

          <nav className="flex items-center gap-3 sm:gap-5">
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <a href="#properties" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">{t('nav.explore')}</a>
              <a href="#all-inclusive" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">{t('nav.whyUs')}</a>
              <a href="#reviews" className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">{t('nav.testimonials')}</a>
            </div>

            {/* Notification Bell with Badge (Mockup Screen 3) */}
            <div className="relative p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer hidden sm:block">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
            </div>

            <ThemeLanguageToggle />

            {currentUser ? (
              <button
                className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-sm transition btn btn-primary shadow-sm min-h-[44px]"
                onClick={handleUserDashboardRedirect}
              >
                {t('nav.dashboard')} ({currentUser.name})
              </button>
            ) : (
              <button
                className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-sm transition btn btn-primary shadow-sm min-h-[44px]"
                onClick={() => navigate('/login')}
              >
                {t('nav.login')}
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/40 via-slate-50 to-slate-50 dark:from-emerald-950/20 dark:via-slate-950 dark:to-slate-950 pt-14 pb-16 hero-section transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold mb-5 border border-emerald-200/60 dark:border-emerald-800 shadow-sm">
            <Sparkles size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span>Platform Kost & Co-Living Terpercaya di Bali</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-slate-50 tracking-tight max-w-4xl mx-auto leading-tight mb-5">
            Cari Kost Jadi Mudah, <span className="text-emerald-700 dark:text-emerald-400">Tinggal Nyaman</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed mb-6">
            Temukan hunian kos eksklusif dan aman di Denpasar, Badung, dan sekitarnya dengan transparansi fasilitas all-inclusive tanpa ribet.
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

      {/* Quick Category Chips & Promo Banner (Mockup Screen 3) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Category Horizontal Chips */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-none">
          {[
            { id: 'Semua', label: 'Semua', icon: '🏠' },
            { id: 'Putra', label: 'Kost Putra', icon: '👨' },
            { id: 'Putri', label: 'Kost Putri', icon: '👩' },
            { id: 'Apartemen', label: 'Apartemen', icon: '🏢' },
            { id: 'Campur', label: 'Kos Campur', icon: '👥' }
          ].map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 border ${
                  isActive
                    ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm shadow-emerald-900/20 scale-[1.02]'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-emerald-300 hover:text-emerald-700'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Promo Spesial Bulan Ini Banner Card */}
        <div className="mt-4 bg-gradient-to-r from-emerald-800 via-emerald-900 to-teal-950 text-white rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md border border-emerald-700/40">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-700/60 border border-emerald-500/40 flex items-center justify-center text-xl shrink-0">
              🎉
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">Promo Spesial Bulan Ini</h3>
              <p className="text-xs sm:text-sm text-emerald-100/90 mt-0.5">
                Diskon sewa hingga 10% untuk berbagai pilihan kost idaman di area kampus & pusat kota.
              </p>
            </div>
          </div>
          <a
            href="#properties"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white text-emerald-900 font-bold text-xs sm:text-sm hover:bg-emerald-50 transition shrink-0 shadow-sm"
          >
            <span>Lihat Promo</span>
            <ArrowRight size={14} />
          </a>
        </div>
      </section>

      {/* Property Listings */}
      <section id="properties" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-2">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">Rekomendasi untukmu</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Daftar hunian eksklusif dengan sistem smart lock dan fasilitas lengkap di Bali
            </p>
          </div>
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            {t('filter.results', { count: loading ? '...' : displayedProperties.length })}
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 property-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <KosCardSkeleton key={i} />
            ))}
          </div>
        ) : displayedProperties.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-12 text-center shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Tidak Ada Properti Ditemukan</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
              Coba sesuaikan filter wilayah atau turunkan fasilitas pencarian Anda.
            </p>
            <button className="btn btn-primary bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold px-5 py-2.5 rounded-xl min-h-[44px]" onClick={resetFilters}>
              {t('filter.resetBtn')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 property-grid">
            {displayedProperties.map((prop) => (
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
      <section id="all-inclusive" className="bg-white dark:bg-slate-900 border-y border-slate-200/80 dark:border-slate-800 py-16 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold mb-4 border border-emerald-100 dark:border-emerald-800">
            <Zap size={14} className="text-emerald-600" />
            <span>juragankost Experience & Transparency</span>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight mb-4">
            Kenapa Memilih juragankost All-Inclusive?
          </h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed mb-12">
            Temukan kemudahan mencari dan menyewa kos impian, transparansi fasilitas & infrastruktur tanpa biaya tersembunyi, serta opsi pencarian yang dipersonalisasi sesuai kebutuhan gaya hidup Anda.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-700">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mb-4">
                <Search size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Kemudahan Cari & Sewa Kos</h3>
              <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed">
                Jelajahi pilihan hunian terbaik, booking instan secara online, dan tandatangani e-contract resmi dalam hitungan menit tanpa birokrasi berbelit.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-700">
              <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400 flex items-center justify-center mb-4">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Kejelasan Fasilitas & Infrastruktur</h3>
              <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed">
                Detail infrastruktur transparan: listrik, air PDAM, WiFi fiber berkecepatan tinggi, hingga sistem keamanan smart lock 24 jam tanpa ada biaya tersembunyi.
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-700">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mb-4">
                <SlidersHorizontal size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Opsi Pencarian Terpersonalisasi</h3>
              <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed">
                Saring hunian idaman berdasarkan lokasi strategis di Bali, rentang anggaran fleksibel, dan kombinasi fasilitas spesifik yang paling Anda butuhkan.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews Section */}
      <section id="reviews" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">Apa Kata Penghuni juragankost?</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Ulasan asli dan pengalaman langsung dari para mahasiswa, nomad & tenant kami di Bali
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {reviews.map((rev) => (
            <div key={rev.id} className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{rev.userName}</h4>
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{rev.propertyName}</span>
                  </div>
                  <div className="flex text-amber-400">
                    {[...Array(rev.rating)].map((_, i) => (
                      <Star key={i} size={13} fill="currentColor" />
                    ))}
                  </div>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed italic">
                  "{rev.comment}"
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                {rev.date}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 py-12 text-center transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-4">
          <div className="cursor-pointer" onClick={() => navigate('/')}>
            <JuraganKostLogo size="md" showTagline />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
            {t('footer.about')}
          </p>
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} juragankost Bali. {t('footer.copyright')}
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (Mockup Screen 3, 6, 7, 8) */}
      <MobileBottomNav />

      {/* Booking and Details Modal */}
      <BookingModal
        property={selectedProperty}
        showContract={showContract}
        setShowContract={setShowContract}
        contractSigned={contractSigned}
        onSignContract={handleSignContractSubmit}
        signedContractData={signedContractData}
        isSigning={isSigning}
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
        activeRentalError={activeRentalError}
      />

    </div>
  );
}
