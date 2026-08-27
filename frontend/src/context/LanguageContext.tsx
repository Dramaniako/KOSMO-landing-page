import React, { createContext, useContext, useState, ReactNode } from 'react';

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
    'modal.contractDesc': 'Perjanjian sewa digital sah dilindungi hukum sesuai KUHPerdata Pasal 1320 & UU ITE.',
    'modal.signAndContinue': 'Setujui & Tanda Tangan',
    'modal.paymentTitle': 'Konfirmasi Pembayaran Sewa',
    'modal.paymentPackage': 'Paket 1 Bulan (All-Inclusive)',
    'modal.totalPay': 'Total Bayar',
    'modal.choosePayment': 'Pilih Metode Pembayaran',
    'modal.payNow': 'Bayar {amount}',
    'modal.processing': 'Memproses Transaksi...',

    // Digital Rental Contract & Evidentiary UI
    'contract.partiesTitle': 'Identitas Para Pihak',
    'contract.firstParty': 'Pihak Pertama (Pengelola & Pemilik Properti)',
    'contract.secondParty': 'Pihak Kedua (Penyewa / Tenant)',
    'contract.idType': 'Jenis Identitas',
    'contract.idTypeNik': 'NIK KTP (WNI)',
    'contract.idTypePassport': 'Paspor (WNA)',
    'contract.tenantNik': 'NIK KTP (16 Digit) / Nomor Paspor',
    'contract.tenantNikPlaceholder': 'Masukkan 16 digit NIK KTP atau nomor paspor',
    'contract.nikInvalid': 'Format NIK/Paspor tidak valid (NIK harus 16 digit angka, Paspor 6-12 karakter alfanumerik)',
    'contract.nikVerified': 'Identitas Terverifikasi',
    'contract.leaseDuration': 'Durasi Sewa (Bulan)',
    'contract.startDate': 'Tanggal Mulai Sewa',
    'contract.scrollToReadPrompt': 'Harap gulir ke bawah dokumen perjanjian hingga akhir untuk mengaktifkan persetujuan.',
    'contract.mustScrollToBottom': 'Gulir dokumen hingga akhir untuk menyetujui',
    'contract.consentCheckbox': 'Saya telah membaca, memahami, dan menyetujui seluruh klausul Perjanjian Sewa Digital KOSMO sesuai KUHPerdata Pasal 1320 & UU ITE.',
    'contract.signatureTitle': 'Goreskan Tanda Tangan Digital',
    'contract.signatureInstruction': 'Tanda tangani pada area kanvas di bawah menggunakan mouse atau layar sentuh:',
    'contract.signatureClear': 'Hapus & Gores Ulang',
    'contract.signatureConfirm': 'Konfirmasi Tanda Tangan',
    'contract.signatureRequired': 'Tanda tangan digital wajib digoreskan dan dikonfirmasi sebelum melanjutkan.',
    'contract.signatureCaptured': 'Tanda tangan digital sah berhasil direkam.',
    'contract.signatureConfirmed': 'Tanda Tangan Terkonfirmasi',
    'contract.signaturePadPlaceholder': 'Area Tanda Tangan Digital (Goreskan di sini)',
    'contract.feeBreakdown': 'Rincian Biaya Sewa (All-Inclusive)',
    'contract.monthlyRent': 'Sewa Kamar Bulanan',
    'contract.adminFee': 'Biaya Administrasi & Meterai Digital',
    'contract.flatAdminFee': 'Flat Rp 5.000 (Sesuai Regulasi)',
    'contract.totalDue': 'Total Pembayaran',
    'contract.utilityQuotasTitle': 'Batas Kuota Utilitas Bulanan (All-Inclusive)',
    'contract.electricityQuota': 'Token Listrik: Kuota hingga 200 kWh/bulan per kamar',
    'contract.waterQuota': 'Air Bersih: PDAM & Sumur Bor Terfilter (Pemakaian Wajar)',
    'contract.wifiQuota': 'WiFi Internet: Fiber Optic Berkecepatan Tinggi 100 Mbps',
    'contract.securityQuota': 'Keamanan: CCTV 24 Jam & Akses Gerbang Terkontrol',
    'contract.wasteQuota': 'Kebersihan: Pengangkutan Sampah Harian & Area Komunal',
    'contract.singleTenancyClause': 'Klausul Sewa Tunggal: Penyewa menyatakan tidak memiliki unit sewa aktif lain yang belum terselesaikan di jaringan KOSMO.',
    'contract.jurisdictionClause': 'Yurisdiksi Hukum: Perjanjian ini tunduk pada hukum Republik Indonesia dengan domisili hukum Pengadilan Negeri Denpasar / Badung, Bali.',
    'contract.previewTitle': 'Draf Kontrak Digital',
    'contract.previewSubtitle': 'Pratinjau dokumen perjanjian sebelum penandatanganan resmi',
    'contract.previewButton': 'Lihat Draf Kontrak (Preview)',
    'contract.previewLoading': 'Menyiapkan draf kontrak digital...',
    'contract.previewHash': 'SHA-256 Checksum Draf:',
    'contract.previewClose': 'Tutup Pratinjau',
    'contract.signing': 'Menandatangani & mengenkripsi dokumen kontrak...',
    'contract.signedSuccess': 'Kontrak digital berhasil ditandatangani dan diverifikasi!',
    'contract.signButton': 'Setujui & Tanda Tangani Kontrak',
    'contract.verifiedBadge': 'Kontrak Digital Sah Terverifikasi',
    'contract.hashLabel': 'SHA-256 Hash:',

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
    'tenant.viewContract': 'Lihat Kontrak (PDF)',
    'tenant.contractHash': 'SHA-256 Hash:',
    'tenant.signedAt': 'Ditandatangani:',
    'tenant.terminateBtn': 'Berhenti Menyewa',
    'tenant.nextDue': 'Jatuh Tempo Berikutnya',
    'tenant.daysLeft': 'Tersisa {days} hari lagi',
    'tenant.status.paid': 'Lunas (Periode Berjalan)',
    'tenant.status.dueSoon': 'Menjelang Jatuh Tempo',
    'tenant.status.pending': 'Menunggu Pembayaran',
    'tenant.pendingBadge': 'Menunggu Pembayaran',
    'tenant.payNow': 'Bayar Sekarang',
    'tenant.pendingPaymentTitle': 'Selesaikan Pembayaran Sewa',
    'tenant.pendingPaymentDesc': 'Lanjutkan transaksi pembayaran untuk mengaktifkan sewa kos Anda',
    'tenant.paymentSuccess': 'Pembayaran berhasil diproses! Hunian kos Anda kini telah aktif.',
    'tenant.pastSection': 'Riwayat Sewa Masa Lalu',
    'tenant.pastDesc': 'Daftar sewa kos yang telah selesai atau diberhentikan ({count})',
    'tenant.completed': 'Penyewaan Selesai',
    'tenant.active': 'Sewa Aktif',
    'tenant.accountInfo': 'Informasi Akun',
    'tenant.accountSettings': 'Pengaturan Akun',
    'tenant.saveProfile': 'Simpan Profil',
    'tenant.saving': 'Menyimpan...',
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
    'landlord.viewContract': 'Lihat Kontrak',
    'landlord.downloadContract': 'Unduh PDF',
    'landlord.contractVerified': 'Tanda Tangan Sah',


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
    'modal.contractDesc': 'Legally enforceable digital contract pursuant to Indonesian Civil Code Art. 1320 & UU ITE.',
    'modal.signAndContinue': 'Agree & Sign Contract',
    'modal.paymentTitle': 'Lease Payment Confirmation',
    'modal.paymentPackage': '1-Month Package (All-Inclusive)',
    'modal.totalPay': 'Total Due',
    'modal.choosePayment': 'Select Payment Method',
    'modal.payNow': 'Pay {amount}',
    'modal.processing': 'Processing Transaction...',

    // Digital Rental Contract & Evidentiary UI
    'contract.partiesTitle': 'Identification of Parties',
    'contract.firstParty': 'First Party (Property Manager & Landlord)',
    'contract.secondParty': 'Second Party (Tenant)',
    'contract.idType': 'ID Document Type',
    'contract.idTypeNik': 'Indonesian National ID (NIK)',
    'contract.idTypePassport': 'International Passport',
    'contract.tenantNik': 'National ID (NIK 16-Digit) / Passport No.',
    'contract.tenantNikPlaceholder': 'Enter 16-digit NIK or valid passport number',
    'contract.nikInvalid': 'Invalid NIK/Passport format (NIK must be 16 digits, Passport 6-12 alphanumeric characters)',
    'contract.nikVerified': 'Identity Verified',
    'contract.leaseDuration': 'Lease Duration (Months)',
    'contract.startDate': 'Lease Start Date',
    'contract.scrollToReadPrompt': 'Please scroll to the bottom of the agreement to enable consent.',
    'contract.mustScrollToBottom': 'Scroll document to bottom to enable agreement',
    'contract.consentCheckbox': 'I have read, understood, and agree to all terms of the KOSMO Digital Lease Agreement pursuant to Indonesian Civil Code Art. 1320 & UU ITE.',
    'contract.signatureTitle': 'Digital Signature Pad',
    'contract.signatureInstruction': 'Draw your digital signature on the canvas area below using mouse or touchscreen:',
    'contract.signatureClear': 'Clear & Redraw',
    'contract.signatureConfirm': 'Confirm Signature',
    'contract.signatureRequired': 'Digital signature is required and must be confirmed before proceeding.',
    'contract.signatureCaptured': 'Valid digital signature captured successfully.',
    'contract.signatureConfirmed': 'Signature Confirmed',
    'contract.signaturePadPlaceholder': 'Digital Signature Area (Draw here)',
    'contract.feeBreakdown': 'Rental Fee Breakdown (All-Inclusive)',
    'contract.monthlyRent': 'Monthly Room Rent',
    'contract.adminFee': 'Platform & Digital Stamp Admin Fee',
    'contract.flatAdminFee': 'Flat Rp 5,000 (Regulatory Compliant)',
    'contract.totalDue': 'Total Amount Due',
    'contract.utilityQuotasTitle': 'Monthly Utility Quotas (All-Inclusive)',
    'contract.electricityQuota': 'Electricity Token: Quota up to 200 kWh/month per room',
    'contract.waterQuota': 'Clean Water: Filtered Municipal PDAM & Deep Well (Fair Use)',
    'contract.wifiQuota': 'WiFi Internet: High-Speed Fiber Optic 100 Mbps',
    'contract.securityQuota': 'Security: 24/7 CCTV & Controlled Access Gate',
    'contract.wasteQuota': 'Housekeeping: Daily Waste Removal & Communal Cleaning',
    'contract.singleTenancyClause': 'Single Active Tenancy Covenant: Tenant warrants no other active unfulfilled lease exists within KOSMO network.',
    'contract.jurisdictionClause': 'Dispute Jurisdiction: This agreement is governed by the laws of Indonesia with exclusive legal jurisdiction at the District Court of Denpasar / Badung, Bali.',
    'contract.previewTitle': 'Draft Digital Lease Agreement',
    'contract.previewSubtitle': 'Preview agreement document prior to formal execution',
    'contract.previewButton': 'View Draft Contract (Preview)',
    'contract.previewLoading': 'Preparing draft digital lease agreement...',
    'contract.previewHash': 'Draft SHA-256 Checksum:',
    'contract.previewClose': 'Close Preview',
    'contract.signing': 'Signing & encrypting contract document...',
    'contract.signedSuccess': 'Digital lease agreement signed and verified successfully!',
    'contract.signButton': 'Agree & Sign Contract',
    'contract.verifiedBadge': 'Legally Verified Digital Lease Agreement',
    'contract.hashLabel': 'SHA-256 Hash:',

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
    'tenant.viewContract': 'View Lease (PDF)',
    'tenant.contractHash': 'SHA-256 Hash:',
    'tenant.signedAt': 'Signed at:',
    'tenant.terminateBtn': 'Terminate Lease',
    'tenant.nextDue': 'Next Due Date',
    'tenant.daysLeft': '{days} days remaining',
    'tenant.status.paid': 'Paid (Current Cycle)',
    'tenant.status.dueSoon': 'Due Soon',
    'tenant.status.pending': 'Payment Pending',
    'tenant.pendingBadge': 'Awaiting Payment',
    'tenant.payNow': 'Pay Now',
    'tenant.pendingPaymentTitle': 'Complete Rental Payment',
    'tenant.pendingPaymentDesc': 'Finish your payment transaction to activate your rental tenancy',
    'tenant.paymentSuccess': 'Payment processed successfully! Your tenancy is now active.',
    'tenant.pastSection': 'Past Rental History',
    'tenant.pastDesc': 'List of completed or terminated leases ({count})',
    'tenant.completed': 'Lease Terminated',
    'tenant.active': 'Active Lease',
    'tenant.accountInfo': 'Account Information',
    'tenant.accountSettings': 'Account Settings',
    'tenant.saveProfile': 'Save Profile',
    'tenant.saving': 'Saving...',
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
    'landlord.viewContract': 'View Lease',
    'landlord.downloadContract': 'Download PDF',
    'landlord.contractVerified': 'Legally Signed',


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
