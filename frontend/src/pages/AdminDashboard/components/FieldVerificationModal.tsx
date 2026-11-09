import React, { useState, useMemo } from 'react';
import {
  X,
  ClipboardCheck,
  MapPin,
  Wifi,
  Droplet,
  ShieldCheck,
  Printer,
  Copy,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Building,
  FileCheck2
} from 'lucide-react';
import { Property, User, FacilityFilterState, BALI_DISTRICTS } from '../../../types/index';
import KosmoLogo from '../../../components/KosmoLogo';

export interface FieldVerificationSubmitPayload {
  propertyId?: string;
  name: string;
  district: string;
  address: string;
  description: string;
  price: number;
  latitude: string;
  longitude: string;
  totalRooms: number;
  occupiedRooms: number;
  ownerId?: string;
  facilities: string[];
  verified_water_tank: boolean;
  verified_wifi_speedtest: boolean;
}

export interface FieldVerificationModalProps {
  property: Property | null;
  landlordUsers: User[];
  onClose: () => void;
  onSaveVerification: (payload: FieldVerificationSubmitPayload) => Promise<void>;
}

export default function FieldVerificationModal({
  property,
  landlordUsers,
  onClose,
  onSaveVerification
}: FieldVerificationModalProps) {
  const initialOwnerId = property?.ownerId || landlordUsers[0]?.id || '';
  const initialLandlord = landlordUsers.find((u) => u.id === initialOwnerId);

  // Section 1: Landlord Identity & Ownership
  const [ownerId, setOwnerId] = useState<string>(initialOwnerId);
  const [landlordName, setLandlordName] = useState<string>(initialLandlord?.name || '');
  const [landlordNik, setLandlordNik] = useState<string>(initialLandlord?.identity_number || '');
  const [landlordPhone, setLandlordPhone] = useState<string>(initialLandlord?.phone || '');
  const [ownershipDocType, setOwnershipDocType] = useState<string>('SHM (Sertifikat Hak Milik)');
  const [ownershipDocNumber, setOwnershipDocNumber] = useState<string>('');
  const [bankName, setBankName] = useState<string>(initialLandlord?.bankName || 'BCA');
  const [bankAccountNumber, setBankAccountNumber] = useState<string>(initialLandlord?.bankAccountNumber || '');
  const [bankAccountHolder, setBankAccountHolder] = useState<string>(
    initialLandlord?.bankAccountHolder || initialLandlord?.name || ''
  );

  // Section 2: Physical Property, GPS & Capacity
  const [name, setName] = useState<string>(property?.name || '');
  const [district, setDistrict] = useState<string>(property?.district || 'Canggu');
  const [address, setAddress] = useState<string>(property?.address || '');
  const [price, setPrice] = useState<string>(property ? String(property.price) : '3000000');
  const [totalRooms, setTotalRooms] = useState<string>(property ? String(property.totalRooms) : '10');
  const [occupiedRooms, setOccupiedRooms] = useState<string>(property ? String(property.occupiedRooms) : '0');
  const [latitude, setLatitude] = useState<string>(property?.latitude || '-8.6500');
  const [longitude, setLongitude] = useState<string>(property?.longitude || '115.1385');
  const [roomDimensions, setRoomDimensions] = useState<string>('3x4 m²');
  const [bathroomType, setBathroomType] = useState<string>('Kamar Mandi Dalam (Ensuite) + Water Heater');
  const [description, setDescription] = useState<string>(
    property?.description ||
      'Hunian kos & co-living eksklusif terverifikasi lapangan oleh tim KOSMO Bali.'
  );

  // Section 3: Technical Infrastructure & All-Inclusive Standards
  const [ispName, setIspName] = useState<string>('Biznet / GlobalXtreme Fiber');
  const [wifiDownloadMbps, setWifiDownloadMbps] = useState<string>('100');
  const [wifiUploadMbps, setWifiUploadMbps] = useState<string>('50');
  const [waterSource, setWaterSource] = useState<string>('PDAM & Sumur Bor Terfilter');
  const [waterTankCapacity, setWaterTankCapacity] = useState<string>('2000 Liter + Pompa Booster');
  const [electricityCapacity, setElectricityCapacity] = useState<string>('1300 VA Token Prabayar / Kamar');

  const [facilities, setFacilities] = useState<FacilityFilterState>(() => {
    const base: FacilityFilterState = {
      Listrik: true,
      Air: true,
      Wifi: true,
      Kebersihan: true,
      Keamanan: true,
      Parkir: true
    };
    if (property?.facilities && property.facilities.length > 0) {
      const mapped: FacilityFilterState = {
        Listrik: false,
        Air: false,
        Wifi: false,
        Kebersihan: false,
        Keamanan: false,
        Parkir: false
      };
      property.facilities.forEach((f) => {
        if (mapped[f as keyof FacilityFilterState] !== undefined) {
          mapped[f as keyof FacilityFilterState] = true;
        }
      });
      return mapped;
    }
    return base;
  });

  // 12-Point Field Verification Checklist
  const [checkKtpOriginal, setCheckKtpOriginal] = useState<boolean>(false);
  const [checkOwnershipDoc, setCheckOwnershipDoc] = useState<boolean>(false);
  const [checkBankMatch, setCheckBankMatch] = useState<boolean>(false);
  const [checkPhysicalAddress, setCheckPhysicalAddress] = useState<boolean>(false);
  const [checkRoomCountMatch, setCheckRoomCountMatch] = useState<boolean>(false);
  const [checkRoomHabitability, setCheckRoomHabitability] = useState<boolean>(false);
  const [verifiedWifiSpeedtest, setVerifiedWifiSpeedtest] = useState<boolean>(
    Boolean(property?.verified_wifi_speedtest)
  );
  const [verifiedWaterTank, setVerifiedWaterTank] = useState<boolean>(
    Boolean(property?.verified_water_tank)
  );
  const [checkElectricalSafety, setCheckElectricalSafety] = useState<boolean>(false);
  const [checkSecurityCctv, setCheckSecurityCctv] = useState<boolean>(false);
  const [checkAllInclusiveConsent, setCheckAllInclusiveConsent] = useState<boolean>(false);
  const [checkCommissionConsent, setCheckCommissionConsent] = useState<boolean>(false);

  // Section 4: Inspector Metadata & Notes
  const [inspectorName, setInspectorName] = useState<string>('Tim Verifikator KOSMO Bali');
  const [inspectionDate, setInspectionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [inspectorNotes, setInspectorNotes] = useState<string>('');

  const [gpsStatus, setGpsStatus] = useState<string>('');
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const checklistItems = [
    checkKtpOriginal,
    checkOwnershipDoc,
    checkBankMatch,
    checkPhysicalAddress,
    checkRoomCountMatch,
    checkRoomHabitability,
    verifiedWifiSpeedtest,
    verifiedWaterTank,
    checkElectricalSafety,
    checkSecurityCctv,
    checkAllInclusiveConsent,
    checkCommissionConsent
  ];

  const passedCount = useMemo(
    () => checklistItems.filter(Boolean).length,
    [
      checkKtpOriginal,
      checkOwnershipDoc,
      checkBankMatch,
      checkPhysicalAddress,
      checkRoomCountMatch,
      checkRoomHabitability,
      verifiedWifiSpeedtest,
      verifiedWaterTank,
      checkElectricalSafety,
      checkSecurityCctv,
      checkAllInclusiveConsent,
      checkCommissionConsent
    ]
  );

  const readinessStatus = useMemo(() => {
    if (passedCount === 12) {
      return {
        label: 'TERVERIFIKASI PENUH (LULUS 12/12)',
        bg: '#ecfdf5',
        border: '#10b981',
        text: '#047857'
      };
    }
    if (passedCount >= 9) {
      return {
        label: `LAYAK DENGAN CATATAN (${passedCount}/12)`,
        bg: '#fffbeb',
        border: '#f59e0b',
        text: '#b45309'
      };
    }
    return {
      label: `BELUM LENGKAP (${passedCount}/12 POIN)`,
      bg: '#fef2f2',
      border: '#ef4444',
      text: '#b91c1c'
    };
  }, [passedCount]);

  const handleLandlordSelect = (selectedId: string) => {
    setOwnerId(selectedId);
    const found = landlordUsers.find((u) => u.id === selectedId);
    if (found) {
      setLandlordName(found.name || '');
      setLandlordNik(found.identity_number || '');
      setLandlordPhone(found.phone || '');
      if (found.bankName) setBankName(found.bankName);
      if (found.bankAccountNumber) setBankAccountNumber(found.bankAccountNumber);
      setBankAccountHolder(found.bankAccountHolder || found.name || '');
    }
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation tidak didukung pada browser perangkat ini.');
      return;
    }
    setGpsStatus('Mengambil titik koordinat GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setLatitude(lat);
        setLongitude(lng);
        setGpsStatus(`Titik GPS berhasil dikunci (${lat}, ${lng})`);
      },
      () => {
        setGpsStatus('Gagal mengakses GPS. Pastikan izin lokasi browser aktif.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleCheckAll = () => {
    const target = passedCount < 12;
    setCheckKtpOriginal(target);
    setCheckOwnershipDoc(target);
    setCheckBankMatch(target);
    setCheckPhysicalAddress(target);
    setCheckRoomCountMatch(target);
    setCheckRoomHabitability(target);
    setVerifiedWifiSpeedtest(target);
    setVerifiedWaterTank(target);
    setCheckElectricalSafety(target);
    setCheckSecurityCctv(target);
    setCheckAllInclusiveConsent(target);
    setCheckCommissionConsent(target);
  };

  const buildSummaryText = (): string => {
    const selectedFacilities = Object.keys(facilities).filter(
      (k) => facilities[k as keyof FacilityFilterState]
    );
    return [
      `=== BERITA ACARA VERIFIKASI LAPANGAN KOSMO BALI ===`,
      `Tanggal Inspeksi : ${inspectionDate}`,
      `Verifikator      : ${inspectorName}`,
      `Status Kelayakan : ${readinessStatus.label}`,
      ``,
      `1. DATA PEMILIK KOS (LANDLORD KYC)`,
      `- Nama Pemilik   : ${landlordName || '-'} (ID: ${ownerId || '-'})`,
      `- NIK / Paspor   : ${landlordNik || '-'}`,
      `- WhatsApp       : ${landlordPhone || '-'}`,
      `- Bukti Lahan    : ${ownershipDocType} ${ownershipDocNumber ? `(${ownershipDocNumber})` : ''}`,
      `- Rekening Bank  : ${bankName} - ${bankAccountNumber || '-'} a.n. ${bankAccountHolder || '-'}`,
      ``,
      `2. DATA FISIK & KAPASITAS KOS`,
      `- Nama Properti  : ${name || '-'} (${district})`,
      `- Alamat Fisik   : ${address || '-'}`,
      `- Koordinat GPS  : ${latitude}, ${longitude}`,
      `- Harga Sewa     : Rp ${Number(price || 0).toLocaleString('id-ID')} / bulan (All-Inclusive)`,
      `- Kapasitas Kamar: ${totalRooms} Kamar Total (${occupiedRooms} Terisi) • Ukuran ${roomDimensions}`,
      `- Kamar Mandi    : ${bathroomType}`,
      ``,
      `3. AUDIT INFRASTRUKTUR TEKNIS`,
      `- Speedtest WiFi : ${ispName} (Download ${wifiDownloadMbps} Mbps / Upload ${wifiUploadMbps} Mbps) [${verifiedWifiSpeedtest ? 'TERVERIFIKASI' : 'BELUM'}]`,
      `- Sistem Air     : ${waterSource} (${waterTankCapacity}) [${verifiedWaterTank ? 'TERVERIFIKASI' : 'BELUM'}]`,
      `- Listrik Kamar  : ${electricityCapacity} (Kuota 200 kWh/bln)`,
      `- Fasilitas      : ${selectedFacilities.join(', ') || '-'}`,
      ``,
      `4. CATATAN VERIFIKATOR`,
      `${inspectorNotes || 'Seluruh standar kelayakan properti dan skema komisi platform 3% telah disepakati.'}`
    ].join('\n');
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryText());
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim() || !address.trim() || !price) {
      setErrorMsg('Nama properti, alamat fisik, dan harga sewa bulanan wajib diisi.');
      return;
    }

    const facilityList = Object.keys(facilities).filter(
      (fac) => facilities[fac as keyof FacilityFilterState]
    );

    const auditFooter = `\n[Terverifikasi Lapangan ${inspectionDate} oleh ${inspectorName} • Skor ${passedCount}/12 • Wi-Fi ${wifiDownloadMbps} Mbps • ${waterTankCapacity}]`;
    const cleanBaseDesc = description.replace(/\n\[Terverifikasi Lapangan.*?\]$/s, '').trim();
    const enrichedDescription = inspectorNotes.trim()
      ? `${cleanBaseDesc}\nCatatan Audit: ${inspectorNotes.trim()}${auditFooter}`
      : `${cleanBaseDesc}${auditFooter}`;

    setSaving(true);
    try {
      await onSaveVerification({
        propertyId: property?.id,
        name: name.trim(),
        district,
        address: address.trim(),
        description: enrichedDescription,
        price: parseInt(price, 10) || 3000000,
        latitude: latitude.trim() || '-8.6500',
        longitude: longitude.trim() || '115.1385',
        totalRooms: Math.max(1, parseInt(totalRooms, 10) || 1),
        occupiedRooms: Math.max(0, parseInt(occupiedRooms, 10) || 0),
        ownerId: ownerId || undefined,
        facilities: facilityList,
        verified_water_tank: verifiedWaterTank,
        verified_wifi_speedtest: verifiedWifiSpeedtest
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay field-verification-overlay" data-testid="field-verification-modal">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .field-verification-overlay,
          .field-verification-overlay * {
            visibility: visible;
          }
          .field-verification-overlay {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 0 !important;
          }
          .field-verification-container {
            max-width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="modal-container field-verification-container"
        style={{
          maxWidth: '880px',
          width: '96%',
          maxHeight: '92vh',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-card)'
        }}
      >
        <button
          type="button"
          className="modal-close no-print"
          onClick={onClose}
          aria-label="Tutup formulir verifikasi"
        >
          <X size={18} />
        </button>

        <div style={{ padding: '28px 32px' }}>
          {/* Official Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '16px',
              paddingBottom: '20px',
              borderBottom: '2px solid var(--border-color)',
              marginBottom: '24px'
            }}
          >
            <div>
              <KosmoLogo size={38} title="KOSMO Bali" subtitle="ON-SITE FIELD VERIFICATION" />
              <h2 style={{ fontSize: '21px', fontWeight: 800, marginTop: '10px', color: 'var(--text-main)' }}>
                Formulir Verifikasi Lapangan & Audit Kelayakan Kos
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Gunakan formulir ini saat bertemu langsung dengan Pemilik Kos (Landlord) untuk memverifikasi legalitas, fisik kamar, dan infrastruktur All-Inclusive.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              <div
                data-testid="verification-score-badge"
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  backgroundColor: readinessStatus.bg,
                  border: `1px solid ${readinessStatus.border}`,
                  color: readinessStatus.text,
                  fontSize: '12px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {passedCount === 12 ? <CheckCircle2 size={16} /> : <ClipboardCheck size={16} />}
                <span>{readinessStatus.label}</span>
              </div>

              <button
                type="button"
                data-testid="check-all-verification-btn"
                onClick={handleCheckAll}
                className="btn btn-outline no-print"
                style={{ padding: '5px 12px', fontSize: '11px' }}
              >
                {passedCount < 12 ? 'Tandai Semua Lulus (12/12)' : 'Reset Checklist'}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '13px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertTriangle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* ================================================================= */}
            {/* BAGIAN 1: IDENTITAS & LEGALITAS PEMILIK KOS (LANDLORD KYC)        */}
            {/* ================================================================= */}
            <section
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                marginBottom: '20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <UserCheck size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                  Bagian 1: Identitas & Legalitas Pemilik Kos (Landlord KYC)
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Pilih Akun Landlord di Sistem</label>
                  <select
                    className="form-select"
                    value={ownerId}
                    onChange={(e) => handleLandlordSelect(e.target.value)}
                    data-testid="verify-landlord-select"
                  >
                    <option value="">-- Pilih Landlord --</option>
                    {landlordUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Nama Lengkap Sesuai KTP</label>
                  <input
                    type="text"
                    className="form-input"
                    value={landlordName}
                    onChange={(e) => setLandlordName(e.target.value)}
                    placeholder="Contoh: I Made Surya Wibawa"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Nomor NIK KTP (16 Digit) / Paspor</label>
                  <input
                    type="text"
                    className="form-input"
                    value={landlordNik}
                    onChange={(e) => setLandlordNik(e.target.value)}
                    placeholder="51710xxxxxxxxxxx"
                    maxLength={16}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Nomor WhatsApp Aktif</label>
                  <input
                    type="text"
                    className="form-input"
                    value={landlordPhone}
                    onChange={(e) => setLandlordPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Jenis Bukti Kepemilikan / Pengelolaan</label>
                  <select
                    className="form-select"
                    value={ownershipDocType}
                    onChange={(e) => setOwnershipDocType(e.target.value)}
                  >
                    <option value="SHM (Sertifikat Hak Milik)">SHM (Sertifikat Hak Milik)</option>
                    <option value="SHGB (Sertifikat Hak Guna Bangunan)">SHGB (Sertifikat Hak Guna Bangunan)</option>
                    <option value="Perjanjian Sewa Induk (Leasehold Notaris)">Perjanjian Sewa Induk (Leasehold Notaris)</option>
                    <option value="IMB / PBG & Surat Kuasa Pengelolaan">IMB / PBG & Surat Kuasa Pengelolaan</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>No. Sertifikat / Akta / IMB (Opsional)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ownershipDocNumber}
                    onChange={(e) => setOwnershipDocNumber(e.target.value)}
                    placeholder="Contoh: SHM No. 04218 / Badung"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Bank Pencairan Dana</label>
                  <input
                    type="text"
                    className="form-input"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="BCA / Mandiri / BNI / BRI / BPD Bali"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Nomor Rekening & Nama Pemilik</label>
                  <input
                    type="text"
                    className="form-input"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="Nomor Rekening Bank"
                  />
                </div>
              </div>

              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={checkKtpOriginal}
                    onChange={(e) => setCheckKtpOriginal(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span><strong>[Poin 1]</strong> KTP / Identitas Asli Pemilik Kos telah diperiksa secara langsung & sesuai dengan fisik pemilik.</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={checkOwnershipDoc}
                    onChange={(e) => setCheckOwnershipDoc(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span><strong>[Poin 2]</strong> Dokumen kepemilikan bangunan ({ownershipDocType}) sah, bebas sengketa, dan berhak menyewakan kamar.</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={checkBankMatch}
                    onChange={(e) => setCheckBankMatch(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span><strong>[Poin 3]</strong> Rekening Bank pencairan dana sesuai dengan nama Pemilik Kos / Badan Usaha pengelola resmi.</span>
                </label>
              </div>
            </section>

            {/* ================================================================= */}
            {/* BAGIAN 2: FISIK BANGUNAN, TITIK GPS & KAPASITAS KAMAR             */}
            {/* ================================================================= */}
            <section
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                marginBottom: '20px'
              }}
            >
              <div className="flex-between flex-wrap gap-2" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building size={18} style={{ color: 'var(--primary)' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                    Bagian 2: Data Fisik Bangunan, Titik GPS & Kapasitas Kamar
                  </h3>
                </div>

                <button
                  type="button"
                  data-testid="capture-gps-btn"
                  onClick={handleCaptureGps}
                  className="btn btn-outline no-print"
                  style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <MapPin size={14} style={{ color: 'var(--primary)' }} />
                  Ambil Lokasi GPS Saat Ini
                </button>
              </div>

              {gpsStatus && (
                <p style={{ fontSize: '12px', color: 'var(--primary)', marginBottom: '12px', fontWeight: 600 }}>
                  {gpsStatus}
                </p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Nama Properti Kos *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: KOSMO Tropical Hub Canggu"
                    data-testid="verify-property-name"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Wilayah / Kabupaten di Bali *</label>
                  <select
                    className="form-select"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                  >
                    {district && !(BALI_DISTRICTS as readonly string[]).includes(district) && (
                      <option value={district}>{district}</option>
                    )}
                    {BALI_DISTRICTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Harga Dasar Sewa All-Inclusive / Bln (Rp) *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    data-testid="verify-property-price"
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Alamat Fisik Lengkap *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Jl. Pantai Batu Bolong No. 88, Canggu, Kec. Kuta Utara, Badung, Bali"
                    data-testid="verify-property-address"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Latitude GPS</label>
                  <input
                    type="text"
                    className="form-input"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Longitude GPS</label>
                  <input
                    type="text"
                    className="form-input"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Total Kamar Fisik *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={totalRooms}
                    onChange={(e) => setTotalRooms(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Kamar Terisi Saat Ini</label>
                  <input
                    type="number"
                    className="form-input"
                    value={occupiedRooms}
                    onChange={(e) => setOccupiedRooms(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Rata-Rata Dimensi Kamar</label>
                  <input
                    type="text"
                    className="form-input"
                    value={roomDimensions}
                    onChange={(e) => setRoomDimensions(e.target.value)}
                    placeholder="3x4 m² / 4x5 m²"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Spesifikasi Kamar Mandi</label>
                  <input
                    type="text"
                    className="form-input"
                    value={bathroomType}
                    onChange={(e) => setBathroomType(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={checkPhysicalAddress}
                    onChange={(e) => setCheckPhysicalAddress(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span><strong>[Poin 4]</strong> Lokasi fisik bangunan, akses jalan, dan titik koordinat GPS sesuai dengan kondisi di lapangan.</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={checkRoomCountMatch}
                    onChange={(e) => setCheckRoomCountMatch(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span><strong>[Poin 5]</strong> Jumlah total kamar ({totalRooms} unit) dan penomoran pintu kamar telah dihitung langsung di lokasi.</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={checkRoomHabitability}
                    onChange={(e) => setCheckRoomHabitability(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span><strong>[Poin 6]</strong> Kondisi kamar layak huni (ventilasi, pencahayaan, kasur, AC, meja kerja, kamar mandi dalam, kunci aman).</span>
                </label>
              </div>
            </section>

            {/* ================================================================= */}
            {/* BAGIAN 3: AUDIT TEKNIS INFRASTRUKTUR & FASILITAS ALL-INCLUSIVE    */}
            {/* ================================================================= */}
            <section
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                marginBottom: '20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <ShieldCheck size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                  Bagian 3: Audit Teknis Infrastruktur & Fasilitas All-Inclusive
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Provider Internet (ISP)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ispName}
                    onChange={(e) => setIspName(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Hasil Speedtest Download (Mbps)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={wifiDownloadMbps}
                    onChange={(e) => setWifiDownloadMbps(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Hasil Speedtest Upload (Mbps)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={wifiUploadMbps}
                    onChange={(e) => setWifiUploadMbps(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Sumber Air Bersih</label>
                  <input
                    type="text"
                    className="form-input"
                    value={waterSource}
                    onChange={(e) => setWaterSource(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Kapasitas Tandon & Pompa</label>
                  <input
                    type="text"
                    className="form-input"
                    value={waterTankCapacity}
                    onChange={(e) => setWaterTankCapacity(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Daya Listrik per Kamar</label>
                  <input
                    type="text"
                    className="form-input"
                    value={electricityCapacity}
                    onChange={(e) => setElectricityCapacity(e.target.value)}
                  />
                </div>
              </div>

              {/* Facilities Checkboxes */}
              <div style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontSize: '12px', marginBottom: '8px' }}>
                  Fasilitas All-Inclusive yang Tersedia di Properti:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  {(Object.keys(facilities) as (keyof FacilityFilterState)[]).map((fac) => (
                    <label
                      key={String(fac)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={facilities[fac]}
                        onChange={() =>
                          setFacilities({
                            ...facilities,
                            [fac]: !facilities[fac]
                          })
                        }
                        style={{ width: '15px', height: '15px' }}
                      />
                      <span>{String(fac)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ paddingTop: '14px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 600, color: '#059669' }}>
                  <input
                    type="checkbox"
                    data-testid="verify-wifi-speedtest-checkbox"
                    checked={verifiedWifiSpeedtest}
                    onChange={(e) => setVerifiedWifiSpeedtest(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <Wifi size={15} />
                  <span>
                    <strong>[Poin 7 — Lencana Speedtest Wi-Fi]</strong> Kecepatan internet di dalam kamar terverifikasi &ge; 50 Mbps stabil ({wifiDownloadMbps} Mbps).
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 600, color: '#0284c7' }}>
                  <input
                    type="checkbox"
                    data-testid="verify-water-tank-checkbox"
                    checked={verifiedWaterTank}
                    onChange={(e) => setVerifiedWaterTank(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <Droplet size={15} />
                  <span>
                    <strong>[Poin 8 — Lencana Tandon Air]</strong> Properti dilengkapi tandon air cadangan ({waterTankCapacity}) & pasokan lancar 24/7.
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={checkElectricalSafety}
                    onChange={(e) => setCheckElectricalSafety(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span><strong>[Poin 9]</strong> Instalasi kelistrikan kamar ({electricityCapacity}) aman & mendukung kuota All-Inclusive 200 kWh/bulan.</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={checkSecurityCctv}
                    onChange={(e) => setCheckSecurityCctv(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span><strong>[Poin 10]</strong> Sistem keamanan (CCTV area komunal, pencahayaan malam, akses gerbang/pintu) berfungsi aktif.</span>
                </label>
              </div>
            </section>

            {/* ================================================================= */}
            {/* BAGIAN 4: PERSETUJUAN KOMERSIAL (KOMISI 3%) & BERITA ACARA        */}
            {/* ================================================================= */}
            <section
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                marginBottom: '20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <FileCheck2 size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                  Bagian 4: Persetujuan Skema Finansial & Berita Acara Verifikasi
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={checkAllInclusiveConsent}
                    onChange={(e) => setCheckAllInclusiveConsent(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span>
                    <strong>[Poin 11]</strong> Landlord menyetujui komitmen <strong>All-Inclusive</strong> (tidak memungut biaya tambahan listrik/air/Wi-Fi/sampah di luar aplikasi untuk pemakaian dalam kuota standar).
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={checkCommissionConsent}
                    onChange={(e) => setCheckCommissionConsent(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span>
                    <strong>[Poin 12]</strong> Landlord menyetujui skema <strong>Komisi Platform 3%</strong> (97% dari uang sewa masuk ke Saldo Landlord; biaya admin Rp 5.000 ditanggung Penyewa) & penggunaan <strong>e-Contract KUHPerdata Pasal 1320 / UU ITE</strong>.
                  </span>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Nama Petugas Verifikator KOSMO</label>
                  <input
                    type="text"
                    className="form-input"
                    value={inspectorName}
                    onChange={(e) => setInspectorName(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Tanggal Verifikasi Lapangan</label>
                  <input
                    type="date"
                    className="form-input"
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label" style={{ fontSize: '12px' }}>Catatan Temuan Lapangan / Rekomendasi Perbaikan</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={inspectorNotes}
                  onChange={(e) => setInspectorNotes(e.target.value)}
                  placeholder="Contoh: Seluruh 10 kamar dalam kondisi sangat bersih, router Wi-Fi di setiap koridor, tandon 2000L aktif."
                />
              </div>

              {/* Dual Signature Boxes for Physical/PDF Printout */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '24px',
                  paddingTop: '16px',
                  borderTop: '1px dashed var(--border-color)',
                  textAlign: 'center'
                }}
              >
                <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '48px' }}>
                    Petugas Verifikator KOSMO Bali
                  </p>
                  <p style={{ fontSize: '13px', fontWeight: 700, borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                    {inspectorName || '( ........................................ )'}
                  </p>
                </div>

                <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '48px' }}>
                    Pemilik / Pengelola Kos (Landlord)
                  </p>
                  <p style={{ fontSize: '13px', fontWeight: 700, borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                    {landlordName || '( ........................................ )'}
                  </p>
                </div>
              </div>
            </section>

            {/* Action Bar */}
            <div
              className="no-print"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginTop: '20px'
              }}
            >
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  data-testid="print-verification-form-btn"
                  onClick={handlePrint}
                  className="btn btn-outline"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                >
                  <Printer size={15} />
                  Cetak / PDF Berita Acara
                </button>

                <button
                  type="button"
                  data-testid="copy-verification-summary-btn"
                  onClick={handleCopySummary}
                  className="btn btn-outline"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                >
                  <Copy size={15} />
                  {copiedSummary ? 'Ringkasan Disalin!' : 'Salin Ringkasan Audit'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="btn btn-outline" onClick={onClose}>
                  Batal
                </button>
                <button
                  type="submit"
                  data-testid="save-verification-btn"
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <ClipboardCheck size={16} />
                  {saving
                    ? 'Menyimpan...'
                    : property
                      ? 'Simpan & Terapkan Verifikasi'
                      : 'Simpan Properti Terverifikasi'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
