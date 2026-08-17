import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Language = 'id' | 'en';

export interface Translations {
  [key: string]: string;
}

const translations: Record<Language, Translations> = {
  id: {
    // Navigation & Common
    'nav.brand': 'KOSMO Bali',
    'nav.tagline': 'Co-Living & Kos All-Inclusive',
    'nav.home': 'Beranda',
    'nav.explore': 'Jelajahi Kos',
    'nav.whyUs': 'Kenapa KOSMO',
    'nav.testimonials': 'Ulasan',
    'nav.login': 'Masuk Akun',
    'nav.register': 'Daftar',
    'nav.logout': 'Keluar',
    'nav.dashboard': 'Dasbor',
    'nav.switchTheme': 'Ganti Tema',
    'nav.switchLang': 'Ganti Bahasa',

    // Hero Section
    'hero.badge': 'Platform Co-Living #1 di Bali',
    'hero.title': 'Tinggal Nyaman & Bebas Ribet di Bali',
    'hero.subtitle': 'Satu harga all-inclusive sudah mencakup sewa kamar premium, listrik, air PDAM, WiFi fiber, kebersihan rutin, dan keamanan 24 jam.',
    'hero.cta': 'Cari Kos Sekarang',
    'hero.secondary': 'Lihat Fasilitas',

    // Search Filter
    'filter.district': 'Wilayah di Bali',
    'filter.allDistricts': 'Semua Wilayah',
    'filter.minPrice': 'Harga Minimum',
    'filter.maxPrice': 'Harga Maksimum',
    'filter.facilities': 'Fasilitas Termasuk All-Inclusive',
    'filter.searchBtn': 'Cari Kos',
    'filter.resetBtn': 'Reset Filter',
    'filter.results': 'Menampilkan {count} properti kos pilihan',

    // Property Card & Facilities
    'prop.perMonth': '/bulan',
    'prop.allInclusive': 'All-Inclusive',
    'prop.available': 'Tersedia {available} dari {total} Kamar',
    'prop.full': 'Kamar Penuh',
    'prop.verified': 'Sertifikat Terverifikasi',
    'prop.viewDetail': 'Lihat Detail & Sewa',
    'prop.fac.listrik': 'Listrik',
    'prop.fac.air': 'Air PDAM',
    'prop.fac.wifi': 'WiFi Fiber',
    'prop.fac.kebersihan': 'Kebersihan',
    'prop.fac.keamanan': 'Keamanan 24 Jam',
    'prop.fac.parkir': 'Parkir Luas',

    // Booking Modal
    'modal.detailTitle': 'Detail Properti & Fasilitas',
    'modal.description': 'Deskripsi Co-Living',
    'modal.includedFacilities': 'Fasilitas Termasuk (All-Inclusive)',
    'modal.interactiveMap': 'Lokasi Interaktif di Bali',
    'modal.close': 'Tutup',
    'modal.bookNow': 'Sewa Sekarang (All-Inclusive)',
    'modal.loginToBook': 'Masuk untuk Menyewa',
    'modal.activeRentalFound': 'Hunian Aktif Ditemukan',
    'modal.roomFull': 'Kamar Tidak Tersedia',
    'modal.activeRentalAlert': 'Anda sudah memiliki hunian aktif. Kelola sewa Anda di Dashboard Tenant.',
    'modal.contractTitle': 'Tanda Tangan Kontrak Digital (e-Contract)',
    'modal.contractDesc': 'Perjanjian sewa digital sah dilindungi hukum dengan hak dan kewajiban transparan.',
    'modal.signAndContinue': 'Setujui & Tanda Tangan',
    'modal.paymentTitle': 'Konfirmasi Pembayaran Sewa',
    'modal.paymentPackage': 'Paket 1 Bulan (All-Inclusive)',
    'modal.totalPay': 'Total Bayar',
    'modal.choosePayment': 'Pilih Metode Pembayaran',
    'modal.payNow': 'Bayar {amount}',
    'modal.processing': 'Memproses Transaksi...',

    // Tenant Dashboard
    'tenant.title': 'Dasbor Penyewa',
    'tenant.welcome': 'Halo, {name}',
    'tenant.tab.rentals': 'Kos Saya (Sewa)',
    'tenant.tab.bills': 'Tagihan & Transaksi',
    'tenant.tab.reviews': 'Ulasan Saya',
    'tenant.tab.profile': 'Profil & Pengaturan',
    'tenant.activeSection': 'Hunian Aktif Saya',
    'tenant.activeDesc': 'Status hunian sewa all-inclusive yang sedang berjalan',
    'tenant.noActive': 'Anda belum memiliki sewa kos aktif saat ini.',
    'tenant.noActiveDesc': 'Temukan kamar kos impian Anda di Bali dengan fasilitas lengkap all-inclusive.',
    'tenant.exploreKos': 'Jelajahi Kos',
    'tenant.startDate': 'Mulai Sewa',
    'tenant.downloadPdf': 'Unduh Kontrak Sewa (PDF)',
    'tenant.terminateBtn': 'Berhenti Menyewa',
    'tenant.nextDue': 'Jatuh Tempo Berikutnya',
    'tenant.daysLeft': 'Tersisa {days} hari lagi',
    'tenant.status.paid': 'Lunas (Periode Berjalan)',
    'tenant.status.dueSoon': 'Menjelang Jatuh Tempo',
    'tenant.status.pending': 'Menunggu Pembayaran',
    'tenant.pastSection': 'Riwayat Sewa Masa Lalu',
    'tenant.pastDesc': 'Daftar sewa kos yang telah selesai atau diberhentikan ({count})',
    'tenant.completed': 'Penyewaan Selesai',
    'tenant.active': 'Sewa Aktif',
    'tenant.accountInfo': 'Informasi Akun',
    'tenant.accountSettings': 'Pengaturan Akun',
    'tenant.saveProfile': 'Simpan Profil',
    'tenant.editProfile': 'Edit Profil',
    'tenant.cancel': 'Batal',

    // Landlord Dashboard
    'landlord.title': 'Dasbor Pemilik Kos',
    'landlord.balance': 'Saldo Siap Ditarik',
    'landlord.revenue': 'Total Pendapatan',
    'landlord.occupancy': 'Tingkat Okupansi',
    'landlord.withdrawBtn': 'Tarik Saldo',
    'landlord.myProperties': 'Manajemen Properti Saya',
    'landlord.addProperty': 'Tambah Properti Kos',

    // Admin Dashboard
    'admin.title': 'Dasbor Super Admin',
    'admin.manageUsers': 'Manajemen User',
    'admin.manageProps': 'Manajemen Properti',
    'admin.manageReviews': 'Manajemen Review',
    'admin.manageWithdrawals': 'Pencairan Dana',
    'admin.visitorTracking': 'Tracking Pengunjung',

    // Auth (Login / Register)
    'auth.loginTitle': 'Masuk ke Akun KOSMO',
    'auth.registerTitle': 'Daftar Akun Baru',
    'auth.email': 'Alamat Email',
    'auth.password': 'Kata Sandi',
    'auth.name': 'Nama Lengkap',
    'auth.phone': 'Nomor Telepon / WhatsApp',
    'auth.role': 'Peran Akun',
    'auth.tenantRole': 'Penyewa Kos (Tenant)',
    'auth.landlordRole': 'Pemilik Kos (Landlord)',
    'auth.loginSubmit': 'Masuk Sekarang',
    'auth.registerSubmit': 'Daftar Sekarang',
    'auth.noAccount': 'Belum punya akun?',
    'auth.hasAccount': 'Sudah punya akun?',

    // Footer
    'footer.about': 'Platform persewaan kos & co-living all-inclusive terpercaya untuk kemudahan tinggal jangka panjang di Pulau Dewata.',
    'footer.copyright': 'Seluruh hak cipta dilindungi undang-undang.'
  },
  en: {
    // Navigation & Common
    'nav.brand': 'KOSMO Bali',
    'nav.tagline': 'All-Inclusive Co-Living & Kos',
    'nav.home': 'Home',
    'nav.explore': 'Explore Rooms',
    'nav.whyUs': 'Why KOSMO',
    'nav.testimonials': 'Reviews',
    'nav.login': 'Sign In',
    'nav.register': 'Sign Up',
    'nav.logout': 'Sign Out',
    'nav.dashboard': 'Dashboard',
    'nav.switchTheme': 'Toggle Theme',
    'nav.switchLang': 'Change Language',

    // Hero Section
    'hero.badge': '#1 Co-Living Platform in Bali',
    'hero.title': 'Comfortable & Hassle-Free Living in Bali',
    'hero.subtitle': 'One transparent monthly fee covering premium rooms, electricity, municipal water, high-speed fiber WiFi, regular housekeeping, and 24/7 security.',
    'hero.cta': 'Find a Room Now',
    'hero.secondary': 'Explore Amenities',

    // Search Filter
    'filter.district': 'District in Bali',
    'filter.allDistricts': 'All Districts',
    'filter.minPrice': 'Minimum Budget',
    'filter.maxPrice': 'Maximum Budget',
    'filter.facilities': 'All-Inclusive Amenities',
    'filter.searchBtn': 'Search Rooms',
    'filter.resetBtn': 'Reset Filter',
    'filter.results': 'Showing {count} curated living spaces',

    // Property Card & Facilities
    'prop.perMonth': '/month',
    'prop.allInclusive': 'All-Inclusive',
    'prop.available': '{available} of {total} Rooms Available',
    'prop.full': 'Fully Occupied',
    'prop.verified': 'Verified Certificate',
    'prop.viewDetail': 'View Details & Book',
    'prop.fac.listrik': 'Electricity',
    'prop.fac.air': 'Clean Water',
    'prop.fac.wifi': 'Fiber WiFi',
    'prop.fac.kebersihan': 'Housekeeping',
    'prop.fac.keamanan': '24/7 Security',
    'prop.fac.parkir': 'Spacious Parking',

    // Booking Modal
    'modal.detailTitle': 'Property & Amenity Details',
    'modal.description': 'Co-Living Overview',
    'modal.includedFacilities': 'Included Amenities (All-Inclusive)',
    'modal.interactiveMap': 'Interactive Bali Map Location',
    'modal.close': 'Close',
    'modal.bookNow': 'Rent Now (All-Inclusive)',
    'modal.loginToBook': 'Sign In to Rent',
    'modal.activeRentalFound': 'Active Tenancy Found',
    'modal.roomFull': 'Room Unavailable',
    'modal.activeRentalAlert': 'You already have an active tenancy. Manage your lease in the Tenant Dashboard.',
    'modal.contractTitle': 'Digital Lease Agreement (e-Contract)',
    'modal.contractDesc': 'Legally enforceable digital contract with clear terms, transparent utility caps, and rights.',
    'modal.signAndContinue': 'Agree & Sign Contract',
    'modal.paymentTitle': 'Lease Payment Confirmation',
    'modal.paymentPackage': '1-Month Package (All-Inclusive)',
    'modal.totalPay': 'Total Due',
    'modal.choosePayment': 'Select Payment Method',
    'modal.payNow': 'Pay {amount}',
    'modal.processing': 'Processing Transaction...',

    // Tenant Dashboard
    'tenant.title': 'Tenant Dashboard',
    'tenant.welcome': 'Welcome, {name}',
    'tenant.tab.rentals': 'My Leases',
    'tenant.tab.bills': 'Invoices & History',
    'tenant.tab.reviews': 'My Reviews',
    'tenant.tab.profile': 'Profile & Settings',
    'tenant.activeSection': 'My Active Tenancy',
    'tenant.activeDesc': 'Current active all-inclusive living space status',
    'tenant.noActive': 'You do not have an active lease currently.',
    'tenant.noActiveDesc': 'Discover your dream Bali co-living space with full all-inclusive utilities.',
    'tenant.exploreKos': 'Explore Rooms',
    'tenant.startDate': 'Start Date',
    'tenant.downloadPdf': 'Download Lease Contract (PDF)',
    'tenant.terminateBtn': 'Terminate Lease',
    'tenant.nextDue': 'Next Due Date',
    'tenant.daysLeft': '{days} days remaining',
    'tenant.status.paid': 'Paid (Current Cycle)',
    'tenant.status.dueSoon': 'Due Soon',
    'tenant.status.pending': 'Payment Pending',
    'tenant.pastSection': 'Past Rental History',
    'tenant.pastDesc': 'List of completed or terminated leases ({count})',
    'tenant.completed': 'Lease Terminated',
    'tenant.active': 'Active Lease',
    'tenant.accountInfo': 'Account Information',
    'tenant.accountSettings': 'Account Settings',
    'tenant.saveProfile': 'Save Profile',
    'tenant.editProfile': 'Edit Profile',
    'tenant.cancel': 'Cancel',

    // Landlord Dashboard
    'landlord.title': 'Landlord Dashboard',
    'landlord.balance': 'Available Balance',
    'landlord.revenue': 'Total Revenue',
    'landlord.occupancy': 'Occupancy Rate',
    'landlord.withdrawBtn': 'Withdraw Funds',
    'landlord.myProperties': 'My Property Portfolio',
    'landlord.addProperty': 'Add New Property',

    // Admin Dashboard
    'admin.title': 'Super Admin Dashboard',
    'admin.manageUsers': 'User Management',
    'admin.manageProps': 'Property Management',
    'admin.manageReviews': 'Review Management',
    'admin.manageWithdrawals': 'Withdrawal Approvals',
    'admin.visitorTracking': 'Visitor Analytics',

    // Auth (Login / Register)
    'auth.loginTitle': 'Sign In to KOSMO',
    'auth.registerTitle': 'Create New Account',
    'auth.email': 'Email Address',
    'auth.password': 'Password',
    'auth.name': 'Full Name',
    'auth.phone': 'Phone / WhatsApp',
    'auth.role': 'Account Role',
    'auth.tenantRole': 'Tenant (Renter)',
    'auth.landlordRole': 'Landlord (Property Owner)',
    'auth.loginSubmit': 'Sign In Now',
    'auth.registerSubmit': 'Register Now',
    'auth.noAccount': "Don't have an account?",
    'auth.hasAccount': 'Already have an account?',

    // Footer
    'footer.about': 'Trusted all-inclusive co-living & rental platform for long-term comfort in the Island of the Gods.',
    'footer.copyright': 'All rights reserved.'
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('kosmo_lang');
      if (saved === 'id' || saved === 'en') {
        return saved;
      }
      // Check stored user profile
      const rawUser = localStorage.getItem('user');
      if (rawUser) {
        const u = JSON.parse(rawUser) as { language?: string };
        if (u.language?.toLowerCase().startsWith('en')) return 'en';
        if (u.language?.toLowerCase().startsWith('id')) return 'id';
      }
    } catch {
      // Ignore
    }
    return 'id';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('kosmo_lang', lang);
      // Persist to user record if logged in
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const rawUser = localStorage.getItem('user');
      if (token && rawUser) {
        const user = JSON.parse(rawUser) as { id?: string };
        if (user.id) {
          fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ language: lang === 'en' ? 'English' : 'Indonesia' })
          }).catch(() => {});
        }
      }
    } catch {
      // Ignore
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'id' ? 'en' : 'id');
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    let text = translations[language]?.[key] || translations['id']?.[key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, val]) => {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(val));
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

const defaultLanguageContext: LanguageContextType = {
  language: 'id',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key: string, params?: Record<string, string | number>): string => {
    let text = translations['id']?.[key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, val]) => {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(val));
      });
    }
    return text;
  }
};

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  return context || defaultLanguageContext;
};
