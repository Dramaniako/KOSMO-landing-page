import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Building,
  Landmark,
  MapPin,
  Calculator,
  ArrowRight,
  ArrowLeft,
  ClipboardCheck,
  Wifi,
  Droplet,
  Zap,
  AlertCircle,
  Loader2,
  Upload
} from 'lucide-react';
import KosmoLogo from '../components/KosmoLogo';
import ThemeLanguageToggle from '../components/ThemeLanguageToggle';
import { useTranslation } from '../context/LanguageContext';
import { formatRupiah } from '../utils/format';
import { uploadPropertyCoverImage } from '../utils/uploadImage';
import {
  User,
  Property,
  IdentityType,
  FacilityFilterState,
  BALI_DISTRICTS
} from '../types/index';
import { INDONESIAN_BANKS } from './LandlordDashboard/components/WithdrawModal';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

const ONBOARDING_BANKS = [
  ...INDONESIAN_BANKS,
  { value: 'BPD Bali', label: 'Bank BPD Bali' }
];

const FACILITY_KEYS: (keyof FacilityFilterState)[] = [
  'Listrik',
  'Air',
  'Wifi',
  'Kebersihan',
  'Keamanan',
  'Parkir'
];

interface ProfileResponse {
  message?: string;
  user?: User;
}

interface PropertyCreateResponse {
  message?: string;
  id?: string;
  propertyId?: string;
}

interface CreatedPropertySummary {
  id?: string;
  name: string;
  district: string;
  address: string;
  price: number;
  totalRooms: number;
}

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function getAuthToken(): string {
  return localStorage.getItem('token') || localStorage.getItem('kosmo_token') || '';
}

export default function LandlordOnboarding() {
  const navigate = useNavigate();
  const { t, language } = useTranslation();

  const [currentUser, setCurrentUser] = useState<User | null>(() => getStoredUser());
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<number>(1);
  const [existingPropertiesCount, setExistingPropertiesCount] = useState<number>(0);

  // Step 1: Estimator & Consents
  const [calcRooms, setCalcRooms] = useState<number>(10);
  const [calcPrice, setCalcPrice] = useState<number>(3000000);
  const [agreeAllInclusive, setAgreeAllInclusive] = useState<boolean>(false);
  const [agreeCommission, setAgreeCommission] = useState<boolean>(false);

  // Step 2: Landlord KYC & Payout Bank
  const [fullName, setFullName] = useState<string>(() => currentUser?.name || '');
  const [phone, setPhone] = useState<string>(() => currentUser?.phone || '');
  const [identityType, setIdentityType] = useState<IdentityType>(
    () => currentUser?.identity_type || 'NIK'
  );
  const [identityNumber, setIdentityNumber] = useState<string>(
    () => currentUser?.identity_number || ''
  );
  const [address, setAddress] = useState<string>(() => currentUser?.address || '');
  const [bankName, setBankName] = useState<string>(() => currentUser?.bankName || 'BCA');
  const [bankAccountNumber, setBankAccountNumber] = useState<string>(
    () => currentUser?.bankAccountNumber || ''
  );
  const [bankAccountHolder, setBankAccountHolder] = useState<string>(
    () => currentUser?.bankAccountHolder || currentUser?.name || ''
  );
  const [step2Error, setStep2Error] = useState<string>('');
  const [savingStep2, setSavingStep2] = useState<boolean>(false);

  // Step 3: First Property Registration
  const [propName, setPropName] = useState<string>('');
  const [propDistrict, setPropDistrict] = useState<string>('Canggu');
  const [propAddress, setPropAddress] = useState<string>('');
  const [propPrice, setPropPrice] = useState<string>('3000000');
  const [propTotalRooms, setPropTotalRooms] = useState<string>('8');
  const [propLatitude, setPropLatitude] = useState<string>('-8.6500');
  const [propLongitude, setPropLongitude] = useState<string>('115.1385');
  const [propDescription, setPropDescription] = useState<string>('');
  const [propImage, setPropImage] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [gpsStatus, setGpsStatus] = useState<string>('');
  const [propFacilities, setPropFacilities] = useState<FacilityFilterState>({
    Listrik: true,
    Air: true,
    Wifi: true,
    Kebersihan: true,
    Keamanan: false,
    Parkir: false
  });
  const [step3Error, setStep3Error] = useState<string>('');
  const [savingStep3, setSavingStep3] = useState<boolean>(false);
  const [createdProperty, setCreatedProperty] = useState<CreatedPropertySummary | null>(null);

  useEffect(() => {
    let active = true;
    const token = getAuthToken();
    const initialStored = getStoredUser();
    const userId = initialStored?.id;

    if (!userId || initialStored?.role !== 'landlord') {
      navigate('/login', { replace: true });
      return;
    }

    const loadInitialContext = async () => {
      try {
        const mePromise = token
          ? fetch(`${API_BASE}/auth/me`, {
              headers: { Authorization: `Bearer ${token}` }
            })
          : Promise.resolve(null);
        const propsPromise = fetch(
          `${API_BASE}/properties?ownerId=${encodeURIComponent(userId)}`
        );

        const [meRes, propsRes] = await Promise.all([mePromise, propsPromise]);

        if (!active) return;

        if (meRes && meRes.ok) {
          const freshUser = (await meRes.json()) as User;
          if (!active) return;
          setCurrentUser(freshUser);
          localStorage.setItem('user', JSON.stringify(freshUser));
          if (freshUser.name) setFullName(freshUser.name);
          if (freshUser.phone) setPhone(freshUser.phone);
          if (freshUser.identity_type) setIdentityType(freshUser.identity_type);
          if (freshUser.identity_number) setIdentityNumber(freshUser.identity_number);
          if (freshUser.address) setAddress(freshUser.address);
          if (freshUser.bankName) setBankName(freshUser.bankName);
          if (freshUser.bankAccountNumber) setBankAccountNumber(freshUser.bankAccountNumber);
          if (freshUser.bankAccountHolder || freshUser.name) {
            setBankAccountHolder(freshUser.bankAccountHolder || freshUser.name);
          }
        }

        if (propsRes.ok) {
          const propList = (await propsRes.json()) as Property[];
          if (active && Array.isArray(propList)) {
            setExistingPropertiesCount(propList.length);
          }
        }
      } catch {
        // Non-fatal: pre-fill remains with locally stored user state
      }
    };

    void loadInitialContext();

    return () => {
      active = false;
    };
  }, [navigate]);

  const advanceToStep = (nextStep: 1 | 2 | 3 | 4) => {
    setStep(nextStep);
    setMaxReachedStep((prev) => Math.max(prev, nextStep));
  };

  const calcStats = useMemo(() => {
    const safeRooms = Math.max(1, Number(calcRooms) || 1);
    const safePrice = Math.max(0, Number(calcPrice) || 0);
    const grossMonthly = safeRooms * safePrice;
    const commission = Math.round(grossMonthly * 0.03);
    const netMonthly = grossMonthly - commission;
    return { grossMonthly, commission, netMonthly };
  }, [calcRooms, calcPrice]);

  const numericPropPrice = Number(propPrice) || 0;
  const estimatedNetPerRoom = numericPropPrice - Math.round(numericPropPrice * 0.03);

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus(
        language === 'en'
          ? 'Geolocation is unavailable on this browser.'
          : 'Geolocation tidak didukung pada browser perangkat ini.'
      );
      return;
    }
    setGpsStatus(language === 'en' ? 'Capturing GPS coordinates...' : 'Mengambil koordinat GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setPropLatitude(lat);
        setPropLongitude(lng);
        setGpsStatus(
          language === 'en'
            ? `GPS locked (${lat}, ${lng})`
            : `Titik GPS berhasil dikunci (${lat}, ${lng})`
        );
      },
      () => {
        setGpsStatus(
          language === 'en'
            ? 'Unable to access GPS. Please enter coordinates manually.'
            : 'Gagal mengakses GPS. Anda dapat mengisi koordinat secara manual.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep3Error('');
    setUploadingImage(true);
    try {
      const uploadedUrl = await uploadPropertyCoverImage(file, API_BASE);
      setPropImage(uploadedUrl);
    } catch (err: unknown) {
      setStep3Error(
        err instanceof Error
          ? err.message
          : language === 'en'
            ? 'Failed to upload image file.'
            : 'Gagal mengunggah berkas gambar.'
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleStep2Submit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setStep2Error('');

    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();
    const trimmedId = identityNumber.trim();
    const trimmedAddress = address.trim();
    const trimmedBankAcc = bankAccountNumber.trim();
    const trimmedBankHolder = bankAccountHolder.trim();

    if (trimmedName.length < 2) {
      setStep2Error('Nama lengkap wajib diisi minimal 2 karakter.');
      return;
    }
    if (!/^(?:\+?\d{9,16}|08\d{7,13}|0\d{8,14})$/.test(trimmedPhone)) {
      setStep2Error('Format nomor WhatsApp/telepon tidak valid (min. 9 digit, contoh: 08123456789).');
      return;
    }
    if (trimmedId !== '') {
      const idPattern = identityType === 'NIK' ? /^\d{16}$/ : /^[A-Za-z0-9]{6,12}$/;
      if (!idPattern.test(trimmedId)) {
        setStep2Error(
          identityType === 'NIK'
            ? 'NIK KTP harus tepat 16 digit angka.'
            : 'Nomor Paspor harus 6-12 karakter alfanumerik.'
        );
        return;
      }
    }
    if (trimmedAddress !== '' && trimmedAddress.length < 5) {
      setStep2Error('Alamat domisili minimal 5 karakter jika diisi.');
      return;
    }
    if (!/^\d{5,25}$/.test(trimmedBankAcc)) {
      setStep2Error('Nomor rekening bank wajib diisi 5-25 digit angka.');
      return;
    }
    if (trimmedBankHolder.length < 2) {
      setStep2Error('Nama pemilik rekening wajib diisi minimal 2 karakter.');
      return;
    }

    const token = getAuthToken();
    setSavingStep2(true);
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: trimmedName,
          phone: trimmedPhone,
          identity_type: identityType,
          identity_number: trimmedId,
          address: trimmedAddress,
          bankName: bankName.trim(),
          bankAccountNumber: trimmedBankAcc,
          bankAccountHolder: trimmedBankHolder
        })
      });

      const data = (await res.json()) as ProfileResponse;
      if (!res.ok) {
        throw new Error(data.message || 'Gagal menyimpan profil & rekening pencairan.');
      }

      const mergedUser: User = {
        ...(currentUser || { id: '', email: '', name: trimmedName, role: 'landlord' }),
        ...(data.user || {}),
        name: data.user?.name || trimmedName,
        phone: data.user?.phone || trimmedPhone,
        identity_type: data.user?.identity_type || identityType,
        identity_number: data.user?.identity_number ?? trimmedId,
        address: data.user?.address ?? trimmedAddress,
        bankName: data.user?.bankName || bankName.trim(),
        bankAccountNumber: data.user?.bankAccountNumber || trimmedBankAcc,
        bankAccountHolder: data.user?.bankAccountHolder || trimmedBankHolder
      };

      setCurrentUser(mergedUser);
      localStorage.setItem('user', JSON.stringify(mergedUser));
      advanceToStep(3);
    } catch (err: unknown) {
      setStep2Error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingStep2(false);
    }
  };

  const handleStep3Submit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setStep3Error('');

    const trimmedPropName = propName.trim();
    const trimmedPropAddress = propAddress.trim();
    const parsedPrice = parseInt(propPrice, 10);
    const parsedRooms = parseInt(propTotalRooms, 10);

    if (!trimmedPropName) {
      setStep3Error('Nama properti kos wajib diisi.');
      return;
    }
    if (!trimmedPropAddress) {
      setStep3Error('Alamat lengkap properti wajib diisi.');
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setStep3Error('Harga sewa bulanan harus lebih besar dari Rp 0.');
      return;
    }
    if (isNaN(parsedRooms) || parsedRooms <= 0) {
      setStep3Error('Total unit kamar minimal 1 kamar.');
      return;
    }

    const facilityList = FACILITY_KEYS.filter((key) => propFacilities[key]);
    const token = getAuthToken();

    setSavingStep3(true);
    try {
      const res = await fetch(`${API_BASE}/properties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: trimmedPropName,
          district: propDistrict,
          address: trimmedPropAddress,
          price: parsedPrice,
          totalRooms: parsedRooms,
          description: propDescription.trim(),
          latitude: propLatitude.trim() || '-8.6500',
          longitude: propLongitude.trim() || '115.1385',
          image: propImage || undefined,
          ownerId: currentUser?.id,
          facilities: facilityList
        })
      });

      const data = (await res.json()) as PropertyCreateResponse;
      if (!res.ok) {
        throw new Error(data.message || 'Gagal mendaftarkan properti kos.');
      }

      setCreatedProperty({
        id: data.propertyId || data.id,
        name: trimmedPropName,
        district: propDistrict,
        address: trimmedPropAddress,
        price: parsedPrice,
        totalRooms: parsedRooms
      });
      setExistingPropertiesCount((prev) => prev + 1);
      advanceToStep(4);
    } catch (err: unknown) {
      setStep3Error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingStep3(false);
    }
  };

  const stepperItems: { num: 1 | 2 | 3 | 4; label: string }[] = [
    { num: 1, label: t('onboarding.step1') },
    { num: 2, label: t('onboarding.step2') },
    { num: 3, label: t('onboarding.step3') },
    { num: 4, label: t('onboarding.step4') }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-200">
      {/* Top Sticky Bar */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate('/landlord')}
          >
            <KosmoLogo size={36} title="KOSMO" badgeText="Landlord" />
          </div>

          <div className="flex items-center gap-3">
            <ThemeLanguageToggle />
            <button
              type="button"
              data-testid="skip-onboarding-btn"
              className="btn btn-outline text-xs sm:text-sm min-h-[40px]"
              onClick={() => navigate('/landlord')}
            >
              {t('onboarding.skipToDashboard')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Progress Stepper */}
        <nav
          aria-label="Landlord Onboarding Progress"
          data-testid="onboarding-stepper"
          className="mb-8"
        >
          <div className="grid grid-cols-4 gap-2 sm:gap-4">
            {stepperItems.map((item) => {
              const isCurrent = step === item.num;
              const isCompleted = step > item.num;
              const isReachable = item.num <= maxReachedStep;

              return (
                <button
                  key={item.num}
                  type="button"
                  disabled={!isReachable}
                  onClick={() => {
                    if (isReachable) setStep(item.num);
                  }}
                  className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2 p-2.5 sm:p-3 rounded-xl border text-left transition-all ${
                    isCurrent
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : isCompleted
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 cursor-pointer'
                        : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 opacity-75'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                      isCurrent
                        ? 'bg-white/20 text-white'
                        : isCompleted
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {isCompleted ? <CheckCircle2 size={15} /> : item.num}
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold truncate max-w-full">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* STEP 1: Welcome, Partner Benefits & Net Earnings Calculator */}
        {step === 1 && (
          <section
            data-testid="onboarding-step-1"
            className="card bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold mb-4 border border-blue-100 dark:border-blue-800">
              <Sparkles size={14} />
              <span>{t('onboarding.badge')}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-50 tracking-tight mb-2">
              {t('onboarding.welcomeTitle')}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              {t('onboarding.welcomeSubtitle')}
            </p>

            {/* 3 Partner Value Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                  <Zap size={20} />
                </div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
                  All-Inclusive Tanpa Ribet
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Standar paket mencakup kuota listrik 200 kWh/bln, air PDAM/sumur terfilter, Wi-Fi Fiber, kebersihan, dan keamanan 24 jam.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                  <Landmark size={20} />
                </div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
                  97% Bersih ke Landlord
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Komisi platform hanya 3% per transaksi terverifikasi. Biaya admin Rp 5.000 ditanggung langsung oleh penyewa.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
                  <ShieldCheck size={20} />
                </div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
                  Kontrak Digital Sah
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Setiap pesanan terlindungi e-Contract PDF KUHPerdata Pasal 1320 &amp; UU ITE ber-hash SHA-256 dan pembayaran Midtrans.
                </p>
              </div>
            </div>

            {/* Interactive Net Earnings Calculator */}
            <div
              data-testid="earnings-calculator"
              className="p-5 rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 mb-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <Calculator size={18} className="text-blue-600 dark:text-blue-400" />
                <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                  {t('onboarding.calcTitle')}
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="calc-rooms" className="form-label text-xs">
                    Jumlah Kamar Terisi
                  </label>
                  <input
                    id="calc-rooms"
                    type="number"
                    min={1}
                    max={500}
                    className="form-input"
                    value={calcRooms}
                    onChange={(e) => setCalcRooms(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div>
                  <label htmlFor="calc-price" className="form-label text-xs">
                    Harga Sewa per Kamar / Bulan (Rp)
                  </label>
                  <input
                    id="calc-price"
                    type="number"
                    min={100000}
                    step={50000}
                    className="form-input"
                    value={calcPrice}
                    onChange={(e) => setCalcPrice(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-blue-200/70 dark:border-blue-800/60 text-sm">
                <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700">
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Pendapatan Kotor / Bln
                  </span>
                  <strong className="text-base text-slate-900 dark:text-slate-100">
                    {formatRupiah(calcStats.grossMonthly)}
                  </strong>
                </div>

                <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700">
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Komisi Platform (3%)
                  </span>
                  <strong className="text-base text-amber-600 dark:text-amber-400">
                    -{formatRupiah(calcStats.commission)}
                  </strong>
                </div>

                <div className="p-3 rounded-xl bg-emerald-600 text-white shadow-sm">
                  <span className="block text-[11px] text-emerald-100">
                    Saldo Bersih Landlord (97%)
                  </span>
                  <strong data-testid="calc-net-monthly" className="text-lg font-extrabold">
                    {formatRupiah(calcStats.netMonthly)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Consent Checkboxes */}
            <div className="space-y-3 mb-6">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer text-xs sm:text-sm">
                <input
                  type="checkbox"
                  data-testid="agree-all-inclusive"
                  checked={agreeAllInclusive}
                  onChange={(e) => setAgreeAllInclusive(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0"
                />
                <span>
                  Saya berkomitmen menyediakan hunian berstandar <strong>All-Inclusive</strong> (listrik kuota wajar 200 kWh/bln, air bersih, Wi-Fi, &amp; kebersihan tanpa biaya tersembunyi).
                </span>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer text-xs sm:text-sm">
                <input
                  type="checkbox"
                  data-testid="agree-commission"
                  checked={agreeCommission}
                  onChange={(e) => setAgreeCommission(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0"
                />
                <span>
                  Saya memahami &amp; menyetujui skema <strong>komisi platform 3%</strong> (97% masuk saldo pencairan Landlord) serta penggunaan kontrak sewa digital <strong>KUHPerdata Pasal 1320 &amp; UU ITE</strong>.
                </span>
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                data-testid="step1-next-btn"
                disabled={!agreeAllInclusive || !agreeCommission}
                onClick={() => advanceToStep(2)}
                className="btn btn-primary min-h-[44px] px-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{t('onboarding.nextBtn')}</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* STEP 2: Landlord KYC & Payout Bank Setup */}
        {step === 2 && (
          <section
            data-testid="onboarding-step-2"
            className="card bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8"
          >
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-50 mb-1">
              {t('onboarding.step2Title')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6">
              Data pemilik digunakan pada kontrak digital penyewa, sedangkan rekening bank dipakai saat pencairan dana sewa Anda.
            </p>

            {step2Error && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs sm:text-sm mb-5 flex items-center gap-2"
              >
                <AlertCircle size={16} className="shrink-0" />
                <span>{step2Error}</span>
              </div>
            )}

            <form onSubmit={handleStep2Submit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="onb-full-name" className="form-label text-xs">
                    Nama Lengkap Pemilik / Pengelola *
                  </label>
                  <input
                    id="onb-full-name"
                    type="text"
                    className="form-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Contoh: I Made Surya"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="onb-phone" className="form-label text-xs">
                    Nomor Telepon / WhatsApp Aktif *
                  </label>
                  <input
                    id="onb-phone"
                    type="tel"
                    className="form-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Contoh: 081234567890"
                    required
                  />
                </div>

                <div>
                  <label className="form-label text-xs">Jenis Dokumen Identitas</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`btn text-xs py-2.5 ${identityType === 'NIK' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setIdentityType('NIK')}
                    >
                      NIK KTP
                    </button>
                    <button
                      type="button"
                      className={`btn text-xs py-2.5 ${identityType === 'PASSPORT' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setIdentityType('PASSPORT')}
                    >
                      Paspor
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="onb-id-number" className="form-label text-xs">
                    Nomor {identityType === 'NIK' ? 'NIK KTP (16 Digit)' : 'Paspor'} (Direkomendasikan)
                  </label>
                  <input
                    id="onb-id-number"
                    data-testid="onboarding-identity-number"
                    type="text"
                    className="form-input"
                    maxLength={identityType === 'NIK' ? 16 : 12}
                    value={identityNumber}
                    onChange={(e) => setIdentityNumber(e.target.value)}
                    placeholder={identityType === 'NIK' ? '5171xxxxxxxxxxxx' : 'A1234567'}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="onb-address" className="form-label text-xs">
                    Alamat Domisili / Kantor Pengelola
                  </label>
                  <input
                    id="onb-address"
                    type="text"
                    className="form-input"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Jl. Raya Seminyak No. 10, Badung, Bali"
                  />
                </div>
              </div>

              {/* Payout Bank Section */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
                <div className="flex items-center gap-2">
                  <Landmark size={18} className="text-blue-600 dark:text-blue-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Rekening Pencairan Dana (Disbursement Bank)
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="onb-bank-name" className="form-label text-xs">
                      Nama Bank Tujuan *
                    </label>
                    <select
                      id="onb-bank-name"
                      data-testid="onboarding-bank-name"
                      className="form-select"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      required
                    >
                      {ONBOARDING_BANKS.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="onb-bank-account" className="form-label text-xs">
                      Nomor Rekening Bank *
                    </label>
                    <input
                      id="onb-bank-account"
                      data-testid="onboarding-bank-account"
                      type="text"
                      inputMode="numeric"
                      className="form-input"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value.replace(/\s+/g, ''))}
                      placeholder="Contoh: 7720112233"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="onb-bank-holder" className="form-label text-xs">
                      Nama Pemilik Rekening *
                    </label>
                    <input
                      id="onb-bank-holder"
                      data-testid="onboarding-bank-holder"
                      type="text"
                      className="form-input"
                      value={bankAccountHolder}
                      onChange={(e) => setBankAccountHolder(e.target.value)}
                      placeholder="Sesuai buku tabungan"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  className="btn btn-outline min-h-[44px]"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft size={16} />
                  <span>{t('onboarding.backBtn')}</span>
                </button>

                <button
                  type="submit"
                  data-testid="step2-submit-btn"
                  disabled={savingStep2}
                  className="btn btn-primary min-h-[44px] px-6"
                >
                  {savingStep2 ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{t('tenant.saving')}</span>
                    </>
                  ) : (
                    <>
                      <span>{t('onboarding.saveAndContinue')}</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* STEP 3: Register First Kos Property */}
        {step === 3 && (
          <section
            data-testid="onboarding-step-3"
            className="card bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8"
          >
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-50 mb-1">
              {t('onboarding.step3Title')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6">
              Daftarkan detail unit kos Anda agar dapat langsung ditinjau oleh tim verifikator dan tampil kepada calon penyewa.
            </p>

            {existingPropertiesCount > 0 && (
              <div
                data-testid="existing-properties-notice"
                className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 mb-6 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-blue-800 dark:text-blue-200">
                  <Building size={18} className="shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>
                    Akun Anda sudah memiliki <strong>{existingPropertiesCount} properti</strong> terdaftar. Anda dapat mendaftarkan properti baru atau melewati langkah ini.
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="skip-property-step-btn"
                  className="btn btn-outline text-xs py-2 px-3 bg-white dark:bg-slate-900"
                  onClick={() => advanceToStep(4)}
                >
                  Lewati Langkah Ini
                </button>
              </div>
            )}

            {step3Error && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs sm:text-sm mb-5 flex items-center gap-2"
              >
                <AlertCircle size={16} className="shrink-0" />
                <span>{step3Error}</span>
              </div>
            )}

            <form onSubmit={handleStep3Submit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="onb-prop-name" className="form-label text-xs">
                    Nama Properti / Kos *
                  </label>
                  <input
                    id="onb-prop-name"
                    data-testid="onboarding-prop-name"
                    type="text"
                    className="form-input"
                    value={propName}
                    onChange={(e) => setPropName(e.target.value)}
                    placeholder="Contoh: KOSMO Villa Canggu Residence"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="onb-prop-district" className="form-label text-xs">
                    Wilayah / Kabupaten di Bali *
                  </label>
                  <select
                    id="onb-prop-district"
                    data-testid="onboarding-prop-district"
                    className="form-select"
                    value={propDistrict}
                    onChange={(e) => setPropDistrict(e.target.value)}
                  >
                    {BALI_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="onb-prop-price" className="form-label text-xs">
                    Harga Sewa All-Inclusive / Bulan (Rp) *
                  </label>
                  <input
                    id="onb-prop-price"
                    data-testid="onboarding-prop-price"
                    type="number"
                    min={100000}
                    className="form-input"
                    value={propPrice}
                    onChange={(e) => setPropPrice(e.target.value)}
                    required
                  />
                  {numericPropPrice > 0 && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                      Estimasi bersih diterima/kamar (97%): {formatRupiah(estimatedNetPerRoom)}/bln
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="onb-prop-rooms" className="form-label text-xs">
                    Total Unit Kamar *
                  </label>
                  <input
                    id="onb-prop-rooms"
                    data-testid="onboarding-prop-rooms"
                    type="number"
                    min={1}
                    className="form-input"
                    value={propTotalRooms}
                    onChange={(e) => setPropTotalRooms(e.target.value)}
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="onb-prop-address" className="form-label text-xs">
                    Alamat Fisik Lengkap *
                  </label>
                  <input
                    id="onb-prop-address"
                    data-testid="onboarding-prop-address"
                    type="text"
                    className="form-input"
                    value={propAddress}
                    onChange={(e) => setPropAddress(e.target.value)}
                    placeholder="Jl. Pantai Batu Bolong No. 88, Kuta Utara, Badung, Bali"
                    required
                  />
                </div>
              </div>

              {/* GPS Coordinates */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <MapPin size={15} className="text-blue-600 dark:text-blue-400" />
                    Koordinat Lokasi Peta (Latitude / Longitude)
                  </span>
                  <button
                    type="button"
                    data-testid="onboarding-gps-btn"
                    onClick={handleCaptureGps}
                    className="btn btn-outline text-xs py-1.5 px-3"
                  >
                    Ambil Lokasi GPS Saat Ini
                  </button>
                </div>
                {gpsStatus && (
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">{gpsStatus}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="onb-prop-lat" className="form-label text-[11px]">
                      Latitude
                    </label>
                    <input
                      id="onb-prop-lat"
                      type="text"
                      className="form-input"
                      value={propLatitude}
                      onChange={(e) => setPropLatitude(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="onb-prop-lng" className="form-label text-[11px]">
                      Longitude
                    </label>
                    <input
                      id="onb-prop-lng"
                      type="text"
                      className="form-input"
                      value={propLongitude}
                      onChange={(e) => setPropLongitude(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Description & Cover Image */}
              <div>
                <label htmlFor="onb-prop-desc" className="form-label text-xs">
                  Deskripsi Co-Living &amp; Keunggulan Lokasi
                </label>
                <textarea
                  id="onb-prop-desc"
                  rows={2}
                  className="form-textarea"
                  value={propDescription}
                  onChange={(e) => setPropDescription(e.target.value)}
                  placeholder="Jelaskan akses jalan, suasana, fasilitas kamar, dan kedekatan dengan kafe/pantai..."
                />
              </div>

              <div>
                <label className="form-label text-xs mb-2">Fasilitas All-Inclusive Termasuk</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {FACILITY_KEYS.map((fac) => (
                    <label
                      key={fac}
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-semibold cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={propFacilities[fac]}
                        onChange={() =>
                          setPropFacilities((prev) => ({ ...prev, [fac]: !prev[fac] }))
                        }
                        className="w-4 h-4"
                      />
                      <span>{fac}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="onb-prop-image" className="form-label text-xs">
                  Foto Sampul Properti (Opsional)
                </label>
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="onb-prop-image"
                    className="btn btn-outline text-xs py-2 px-3 cursor-pointer inline-flex items-center gap-2"
                  >
                    <Upload size={14} />
                    <span>Pilih Foto Properti</span>
                  </label>
                  <input
                    id="onb-prop-image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  {uploadingImage && (
                    <span className="text-xs text-blue-600 dark:text-blue-400">Memproses foto...</span>
                  )}
                  {propImage && (
                    <img
                      src={propImage}
                      alt="Preview"
                      className="w-14 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  className="btn btn-outline min-h-[44px]"
                  onClick={() => setStep(2)}
                >
                  <ArrowLeft size={16} />
                  <span>{t('onboarding.backBtn')}</span>
                </button>

                <button
                  type="submit"
                  data-testid="step3-submit-btn"
                  disabled={savingStep3}
                  className="btn btn-primary min-h-[44px] px-6"
                >
                  {savingStep3 ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <span>{t('onboarding.registerPropertyBtn')}</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* STEP 4: Completion Summary & Field Verification Prep */}
        {step === 4 && (
          <section
            data-testid="onboarding-step-4"
            className="card bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8"
          >
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 size={34} />
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-50 mb-2">
                {t('onboarding.step4Title')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl">
                Profil mitra dan rekening pencairan Anda telah tersimpan. Tim KOSMO Bali akan menghubungi Anda untuk jadwal kunjungan verifikasi lapangan.
              </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Rekening Pencairan Terdaftar
                </span>
                <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                  {bankName} &bull; {bankAccountNumber || currentUser?.bankAccountNumber || '-'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  a.n. {bankAccountHolder || currentUser?.bankAccountHolder || fullName || '-'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Status Properti Kos
                </span>
                {createdProperty ? (
                  <>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                      {createdProperty.name} ({createdProperty.district})
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {createdProperty.totalRooms} Kamar &bull; {formatRupiah(createdProperty.price)}/bln
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                      {existingPropertiesCount} Properti Aktif di Portofolio
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Anda dapat menambah unit atau mengedit kamar kapan saja di Dasbor.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* On-site Field Verification Checklist */}
            <div className="p-5 rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/30 mb-8">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardCheck size={18} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  Persiapan Kunjungan Verifikasi Lapangan KOSMO (4 Hal Penting)
                </h3>
              </div>
              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2.5">
                  <ShieldCheck size={16} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>KTP Asli &amp; Bukti Legalitas Lahan:</strong> Siapkan KTP asli pemilik dan sertifikat kepemilikan/sewa induk (SHM, SHGB, IMB/PBG, atau perjanjian leasehold).
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Wifi size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Uji Speedtest Wi-Fi (&ge; 50 Mbps):</strong> Tim akan mengukur kecepatan internet di dalam kamar untuk menerbitkan lencana <em>Verified Wi-Fi Speedtest</em>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Droplet size={16} className="text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Tandon Air &amp; Pompa Booster 24/7:</strong> Inspeksi tandon cadangan guna mengaktifkan lencana <em>Tandon Air Terjamin</em>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Zap size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Kelayakan Kamar, Kelistrikan &amp; Keamanan:</strong> Pengecekan nomor pintu kamar, instalasi listrik (kuota 200 kWh/bln), serta CCTV area komunal.
                  </span>
                </li>
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                data-testid="onboarding-manage-properties-btn"
                onClick={() => navigate('/landlord', { state: { initialTab: 'properties' } })}
                className="btn btn-outline min-h-[44px] px-5"
              >
                <Building size={16} />
                <span>{t('onboarding.manageRoomsBtn')}</span>
              </button>

              <button
                type="button"
                data-testid="finish-onboarding-btn"
                onClick={() => navigate('/landlord')}
                className="btn btn-primary min-h-[44px] px-6"
              >
                <span>{t('onboarding.goToDashboard')}</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
