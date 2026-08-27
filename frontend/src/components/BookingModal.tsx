import React, { useState, useRef, useEffect } from 'react';
import {
  MapPin, Star, X, ArrowRight, ShieldCheck, Download, CreditCard, Sparkles, Check, AlertCircle,
  FileText, Eraser, CheckCircle2, ChevronDown, ChevronUp, Eye, Lock, RefreshCw, Hash, ShieldAlert
} from 'lucide-react';
import {
  Property, User, ContractSignPayload, SignedContractData,
  ContractPreviewResponse, RentalContractData
} from '../types/index';
import { useTranslation } from '../context/LanguageContext';
import { formatRupiah } from '../utils/format';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export interface Props {
  property: Property | null;
  showContract: boolean;
  setShowContract: (show: boolean) => void;
  contractSigned: boolean;
  handleSignContract?: () => void;
  onSignContract?: (payload: ContractSignPayload) => Promise<boolean>;
  signedContractData?: SignedContractData | null;
  isSigning?: boolean;
  showPayment: boolean;
  setShowPayment: (show: boolean) => void;
  paymentProcessing: boolean;
  handleProcessPayment: () => void;
  showMap: boolean;
  setShowMap: (show: boolean) => void;
  onClose: () => void;
  currentUser: User | null;
  onNavigateToLogin: () => void;
  renderFacilityIcon: (fac: string) => React.ReactNode;
  hasActiveRental?: boolean;
  activeRentalError?: string | null;
}

export default function BookingModal({
  property,
  showContract,
  setShowContract,
  contractSigned,
  handleSignContract,
  onSignContract,
  signedContractData = null,
  isSigning = false,
  showPayment,
  setShowPayment,
  paymentProcessing,
  handleProcessPayment,
  showMap,
  setShowMap,
  onClose,
  currentUser,
  onNavigateToLogin,
  renderFacilityIcon,
  hasActiveRental = false,
  activeRentalError = null
}: Props) {
  const { t, language } = useTranslation();

  // 1. Duration & Start Date
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // 2. Identity Verification (NIK / Passport)
  const [idType, setIdType] = useState<'NIK' | 'PASSPORT'>('NIK');
  const [idNumber, setIdNumber] = useState<string>('');
  const [idTouched, setIdTouched] = useState<boolean>(false);
  const [idValidationMsg, setIdValidationMsg] = useState<string | null>(null);

  // 3. Scroll-to-Read Clickwrap
  const termsContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState<boolean>(false);
  const [affirmativeConsent, setAffirmativeConsent] = useState<boolean>(false);

  // 4. HTML5 Canvas Signature Pad
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef<boolean>(false);
  const [hasDrawnSignature, setHasDrawnSignature] = useState<boolean>(false);
  const [signatureConfirmed, setSignatureConfirmed] = useState<boolean>(false);
  const [signatureBase64, setSignatureBase64] = useState<string>('');
  const [signatureError, setSignatureError] = useState<string | null>(null);

  // 5. Accordion Clauses State
  const [expandedSection, setExpandedSection] = useState<string | null>('terms');

  // 6. Contract Preview State
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<ContractPreviewResponse | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Reset or initialize state when opening contract
  useEffect(() => {
    if (showContract) {
      setHasScrolledToBottom(false);
      setAffirmativeConsent(false);
      setSignatureConfirmed(false);
      setHasDrawnSignature(false);
      setSignatureBase64('');
      setSignatureError(null);
      setIdTouched(false);
      setIdValidationMsg(null);
      setShowPreviewModal(false);

      // Check if container already fits within view without scrolling
      const timer = setTimeout(() => {
        if (termsContainerRef.current) {
          const el = termsContainerRef.current;
          if (el.scrollHeight <= el.clientHeight + 15) {
            setHasScrolledToBottom(true);
          }
        }
      }, 200);

      return () => clearTimeout(timer);
    }
  }, [showContract]);

  // Identity Validation Engine
  const validateIdentity = (val: string, type: 'NIK' | 'PASSPORT'): { isValid: boolean; error: string | null } => {
    const clean = val.trim();
    if (!clean) {
      return {
        isValid: false,
        error: type === 'NIK' ? 'NIK wajib diisi sesuai KTP (16 digit).' : 'Nomor Paspor wajib diisi (6-12 karakter).'
      };
    }
    if (type === 'NIK') {
      if (!/^\d+$/.test(clean)) {
        return { isValid: false, error: 'NIK hanya boleh berisi 16 digit angka.' };
      }
      if (clean.length !== 16) {
        return { isValid: false, error: `NIK harus tepat 16 digit angka (saat ini ${clean.length} digit).` };
      }
      return { isValid: true, error: null };
    } else {
      if (!/^[A-Za-z0-9]+$/.test(clean)) {
        return { isValid: false, error: 'Nomor Paspor hanya boleh berisi huruf dan angka alfanumerik.' };
      }
      if (clean.length < 6 || clean.length > 12) {
        return { isValid: false, error: `Nomor Paspor harus 6 - 12 karakter (saat ini ${clean.length} karakter).` };
      }
      return { isValid: true, error: null };
    }
  };

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setIdNumber(val);
    setIdTouched(true);
    const result = validateIdentity(val, idType);
    setIdValidationMsg(result.error);
  };

  const handleIdTypeChange = (type: 'NIK' | 'PASSPORT') => {
    setIdType(type);
    if (idTouched && idNumber) {
      const result = validateIdentity(idNumber, type);
      setIdValidationMsg(result.error);
    }
  };

  // Scroll detection handler
  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 10) {
      setHasScrolledToBottom(true);
    }
  };

  // Canvas Drawing Engine (Touch & Mouse with Pointer Events)
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    const left = rect.left || 0;
    const top = rect.top || 0;
    return {
      x: (e.clientX - left) * scaleX,
      y: (e.clientY - top) * scaleY
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if unsupported in environment
    }

    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1d4ed8'; // Indigo/blue signature ink
    setHasDrawnSignature(true);
    setSignatureConfirmed(false);
    setSignatureError(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
  };

  const handleClearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnSignature(false);
    setSignatureConfirmed(false);
    setSignatureBase64('');
    setSignatureError(null);
  };

  const handleConfirmSignature = () => {
    if (!hasDrawnSignature) {
      setSignatureError(t('contract.signatureRequired'));
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setSignatureBase64(dataUrl);
    setSignatureConfirmed(true);
    setSignatureError(null);
  };

  // Preview Contract Handler
  const handleFetchPreview = async () => {
    if (!property) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const res = await fetch(`${API_BASE}/rentals/contract/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          propertyId: property.id,
          durationMonths,
          startDate,
          tenantNikPassport: idNumber.trim() || (currentUser?.email || 'TEST-TENANT'),
          signatureBase64: signatureBase64 || undefined
        })
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message || 'Gagal memuat draf kontrak digital.');
      }

      const data = (await res.json()) as ContractPreviewResponse;
      setPreviewData(data);
      setShowPreviewModal(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPreviewError(msg);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Form Submit Handler
  const handleSignContractSubmit = async () => {
    setIdTouched(true);
    const idVal = validateIdentity(idNumber, idType);
    if (!idVal.isValid) {
      setIdValidationMsg(idVal.error);
      return;
    }
    if (!hasScrolledToBottom || !affirmativeConsent) {
      return;
    }
    if (!hasDrawnSignature || !signatureConfirmed || !signatureBase64) {
      setSignatureError(t('contract.signatureRequired'));
      return;
    }

    if (!property) return;

    if (onSignContract) {
      await onSignContract({
        propertyId: property.id,
        durationMonths,
        startDate,
        tenantNikPassport: idNumber.trim(),
        signatureBase64,
        affirmativeConsent: true
      });
    } else if (handleSignContract) {
      handleSignContract();
    }
  };

  if (!property) return null;

  const price = Number(property.price) || 0;
  const totalRooms = Number(property.totalRooms) || 0;
  const occupiedRooms = Number(property.occupiedRooms) || 0;
  const facilities = Array.isArray(property.facilities) ? property.facilities : [];
  const image = property.image && property.image.trim() !== ''
    ? property.image
    : 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80';

  const isFull = totalRooms > 0 && occupiedRooms >= totalRooms;
  const availableRooms = Math.max(0, totalRooms - occupiedRooms);

  const flatAdminFee = 5000;
  const calculatedTotalRent = price * durationMonths;
  const calculatedTotalAmount = calculatedTotalRent + flatAdminFee;

  const idCheckResult = validateIdentity(idNumber, idType);
  const isIdValid = idTouched && idCheckResult.isValid;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content glass-panel dark:bg-slate-900 dark:border-slate-800"
        style={{ maxWidth: showContract ? '640px' : '560px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] absolute top-4 right-4 border-none bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-full cursor-pointer flex items-center justify-center shadow-md z-10 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          aria-label={t('modal.close')}
        >
          <X size={18} />
        </button>

        {/* Modal View 1: Evidentiary Digital Contract Signing */}
        {showContract ? (
          <div style={{ padding: '28px' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div
                className="flex-center"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary-light)',
                  color: 'var(--primary)',
                  margin: '0 auto 10px auto'
                }}
              >
                <ShieldCheck size={26} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--dark)' }}>
                {t('modal.contractTitle')}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                {t('modal.contractDesc')}
              </p>
            </div>

            {/* In-Modal Active Rental Alert */}
            {(activeRentalError || hasActiveRental) && (
              <div
                style={{
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  marginBottom: '18px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <ShieldAlert size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                <span>{activeRentalError || t('modal.activeRentalAlert')}</span>
              </div>
            )}

            {/* SECTION A: Statutory Identity & Tenancy Inputs */}
            <div
              style={{
                backgroundColor: 'var(--bg-main)',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                marginBottom: '18px'
              }}
            >
              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: 'var(--dark)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} style={{ color: 'var(--primary)' }} />
                {t('contract.partiesTitle')}
              </h4>

              {/* ID Type Selector */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  {t('contract.idType')}
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleIdTypeChange('NIK')}
                    className={`btn ${idType === 'NIK' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}
                  >
                    {t('contract.idTypeNik')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIdTypeChange('PASSPORT')}
                    className={`btn ${idType === 'PASSPORT' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}
                  >
                    {t('contract.idTypePassport')}
                  </button>
                </div>
              </div>

              {/* NIK / Passport Number Input Field */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label htmlFor="tenant-id-input" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {t('contract.tenantNik')} <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  {isIdValid && (
                    <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <CheckCircle2 size={12} />
                      {t('contract.nikVerified')}
                    </span>
                  )}
                </div>
                <input
                  id="tenant-id-input"
                  type="text"
                  value={idNumber}
                  onChange={handleIdChange}
                  placeholder={idType === 'NIK' ? t('contract.tenantNikPlaceholder') : 'Contoh: A1234567 (Paspor)'}
                  maxLength={idType === 'NIK' ? 16 : 12}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${idTouched && idValidationMsg ? '#ef4444' : isIdValid ? '#22c55e' : 'var(--border-color)'}`,
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    backgroundColor: 'white',
                    outline: 'none'
                  }}
                />
                {idTouched && idValidationMsg && (
                  <p style={{ color: '#dc2626', fontSize: '11px', marginTop: '4px' }}>
                    {idValidationMsg}
                  </p>
                )}
              </div>

              {/* Lease Dates and Duration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label htmlFor="lease-start-date" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    {t('contract.startDate')}
                  </label>
                  <input
                    id="lease-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '12px',
                      backgroundColor: 'white'
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="lease-duration-select" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    {t('contract.leaseDuration')}
                  </label>
                  <select
                    id="lease-duration-select"
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(Number(e.target.value) || 1)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontSize: '12px',
                      backgroundColor: 'white'
                    }}
                  >
                    {[1, 2, 3, 6, 12].map((m) => (
                      <option key={m} value={m}>
                        {m} Bulan ({formatRupiah(price * m)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION B: Statutory Clauses with Scroll-to-Read Clickwrap */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--dark)' }}>
                  Ketentuan Perjanjian & Kuota Utilitas
                </span>
                <button
                  type="button"
                  onClick={handleFetchPreview}
                  disabled={previewLoading}
                  className="btn btn-outline"
                  style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <Eye size={12} />
                  {previewLoading ? t('contract.previewLoading') : t('contract.previewButton')}
                </button>
              </div>

              {/* Scrollable Terms Container */}
              <div
                ref={termsContainerRef}
                onScroll={handleTermsScroll}
                tabIndex={0}
                role="region"
                aria-label="Klausul Kontrak Sewa Digital KOSMO"
                style={{
                  backgroundColor: 'var(--bg-main)',
                  padding: '16px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${hasScrolledToBottom ? '#22c55e' : 'var(--border-color)'}`,
                  maxHeight: '180px',
                  overflowY: 'auto',
                  fontSize: '12px',
                  lineHeight: 1.6,
                  color: 'var(--text-main)'
                }}
              >
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '8px' }}>
                  <p><strong>1. PIHAK PERTAMA / FIRST PARTY:</strong> Pengelola KOSMO Hub Bali & Pemilik Properti ({property.ownerId || 'KOSMO Management'}).</p>
                  <p><strong>2. PIHAK KEDUA / SECOND PARTY:</strong> {currentUser ? currentUser.name : 'Calon Penyewa'} ({currentUser ? currentUser.email : '-'}) &bull; ID/NIK: {idNumber.trim() || 'Terlampir'}.</p>
                </div>

                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '8px' }}>
                  <p><strong>3. OBJEK SEWA & DOMISILI:</strong> Kamar All-Inclusive pada {property.name}, beralamat di {property.address || property.district || 'Bali, Indonesia'}.</p>
                  <p><strong>4. JANGKA WAKTU:</strong> Berlaku selama {durationMonths} bulan terhitung sejak {startDate}.</p>
                </div>

                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '8px' }}>
                  <p><strong>5. BATAS KUOTA UTILITAS BULANAN (ALL-INCLUSIVE):</strong></p>
                  <ul style={{ paddingLeft: '18px', margin: '4px 0' }}>
                    <li>{t('contract.electricityQuota')}</li>
                    <li>{t('contract.waterQuota')}</li>
                    <li>{t('contract.wifiQuota')}</li>
                    <li>{t('contract.securityQuota')}</li>
                    <li>{t('contract.wasteQuota')}</li>
                  </ul>
                </div>

                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '8px' }}>
                  <p><strong>6. KLAUSUL SEWA TUNGGAL (SINGLE ACTIVE TENANCY COVENANT):</strong></p>
                  <p>{t('contract.singleTenancyClause')}</p>
                </div>

                <div>
                  <p><strong>7. YURISDIKSI HUKUM & PENYELESAIAN SENGKETA:</strong></p>
                  <p>{t('contract.jurisdictionClause')}</p>
                </div>
              </div>

              {/* Scroll prompt / status indicator */}
              {!hasScrolledToBottom ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#d97706', marginTop: '6px' }}>
                  <ChevronDown size={14} className="animate-bounce" />
                  <span>{t('contract.scrollToReadPrompt')}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#16a34a', marginTop: '6px', fontWeight: 600 }}>
                  <CheckCircle2 size={14} />
                  <span>Dokumen perjanjian telah dibaca hingga akhir.</span>
                </div>
              )}

              {/* Affirmative Consent Checkbox */}
              <div style={{ marginTop: '10px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12px',
                    cursor: hasScrolledToBottom ? 'pointer' : 'not-allowed',
                    opacity: hasScrolledToBottom ? 1 : 0.6
                  }}
                >
                  <input
                    type="checkbox"
                    checked={affirmativeConsent}
                    disabled={!hasScrolledToBottom}
                    onChange={(e) => setAffirmativeConsent(e.target.checked)}
                    style={{ marginTop: '2px', cursor: hasScrolledToBottom ? 'pointer' : 'not-allowed' }}
                  />
                  <span>{t('contract.consentCheckbox')}</span>
                </label>
              </div>
            </div>

            {/* SECTION C: HTML5 Canvas Digital Signature Pad */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: `1px solid ${signatureConfirmed ? '#22c55e' : signatureError ? '#ef4444' : 'var(--border-color)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '14px',
                marginBottom: '18px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--dark)' }}>
                  {t('contract.signatureTitle')} <span style={{ color: '#dc2626' }}>*</span>
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handleClearSignature}
                    className="btn btn-outline"
                    style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Eraser size={12} />
                    {t('contract.signatureClear')}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSignature}
                    disabled={!hasDrawnSignature}
                    className={`btn ${signatureConfirmed ? 'btn-success' : 'btn-secondary'}`}
                    style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Check size={12} />
                    {signatureConfirmed ? t('contract.signatureConfirmed') : t('contract.signatureConfirm')}
                  </button>
                </div>
              </div>

              {/* Canvas Pad */}
              <div
                style={{
                  position: 'relative',
                  backgroundColor: 'white',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed #cbd5e1',
                  overflow: 'hidden',
                  touchAction: 'none'
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={120}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  style={{
                    width: '100%',
                    height: '110px',
                    display: 'block',
                    cursor: 'crosshair',
                    touchAction: 'none'
                  }}
                />
                {!hasDrawnSignature && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'none',
                      color: '#94a3b8',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  >
                    {t('contract.signatureInstruction')}
                  </div>
                )}
              </div>

              {/* Signature Status & Feedback */}
              {signatureError ? (
                <p style={{ color: '#dc2626', fontSize: '11px', marginTop: '6px' }}>
                  {signatureError}
                </p>
              ) : signatureConfirmed ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#16a34a', marginTop: '6px', fontWeight: 600 }}>
                  <CheckCircle2 size={13} />
                  <span>{t('contract.signatureCaptured')}</span>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>
                  Goreskan tanda tangan pada kotak putih, lalu klik <strong>{t('contract.signatureConfirm')}</strong>.
                </p>
              )}
            </div>

            {/* SECTION D: Itemized Fee Breakdown Card */}
            <div
              style={{
                backgroundColor: 'var(--bg-main)',
                padding: '14px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                marginBottom: '20px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('contract.monthlyRent')} ({durationMonths} bln)</span>
                <span style={{ fontWeight: 600 }}>{formatRupiah(calculatedTotalRent)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('contract.adminFee')}</span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{formatRupiah(flatAdminFee)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border-color)',
                  fontSize: '15px',
                  fontWeight: 800
                }}
              >
                <span>{t('contract.totalDue')}</span>
                <span style={{ color: 'var(--primary)' }}>{formatRupiah(calculatedTotalAmount)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowContract(false)}
                disabled={isSigning}
              >
                {t('tenant.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={handleSignContractSubmit}
                disabled={
                  isSigning ||
                  contractSigned ||
                  !isIdValid ||
                  !hasScrolledToBottom ||
                  !affirmativeConsent ||
                  !signatureConfirmed ||
                  hasActiveRental ||
                  Boolean(activeRentalError)
                }
              >
                {isSigning ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    {t('contract.signing')}
                  </>
                ) : contractSigned ? (
                  <>
                    <Check size={16} />
                    {t('contract.signedSuccess')}
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    {t('contract.signButton')}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : showPayment ? (
          /* Modal View 2: Gated Payment Gateway */
          <div style={{ padding: '32px' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div
                className="flex-center"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#ecfdf5',
                  color: '#10b981',
                  margin: '0 auto 12px auto'
                }}
              >
                <CreditCard size={24} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 800 }}>{t('modal.paymentTitle')}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                All-Inclusive Bali Co-Living Tenancy
              </p>
            </div>

            {/* Verified Digital Contract Evidentiary Card */}
            <div
              style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                marginBottom: '20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <ShieldCheck size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
                <strong style={{ fontSize: '13px', color: '#166534' }}>
                  {t('contract.verifiedBadge')}
                </strong>
              </div>
              {signedContractData?.contractHash && (
                <div style={{ fontSize: '11px', color: '#15803d', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  <Hash size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  {t('contract.hashLabel')} {signedContractData.contractHash.slice(0, 24)}...
                </div>
              )}
              {signedContractData?.contractUrl && (
                <div style={{ marginTop: '8px' }}>
                  <a
                    href={signedContractData.contractUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '11px', color: '#15803d', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                  >
                    <FileText size={12} />
                    Lihat Dokumen Kontrak Sewa (PDF)
                  </a>
                </div>
              )}
            </div>

            {/* Itemized Price Summary Card */}
            <div
              style={{
                backgroundColor: 'var(--bg-main)',
                padding: '20px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                marginBottom: '24px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Properti</span>
                <span style={{ fontWeight: 600 }}>{property.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Penyewa</span>
                <span style={{ fontWeight: 600 }}>{currentUser ? currentUser.name : '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Sewa Kamar ({durationMonths} bln)</span>
                <span style={{ fontWeight: 600 }}>{formatRupiah(calculatedTotalRent)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('contract.adminFee')}</span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                  {formatRupiah(signedContractData?.adminFee || flatAdminFee)}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-color)',
                  fontSize: '16px',
                  fontWeight: 800
                }}
              >
                <span>{t('modal.totalPay')}</span>
                <span style={{ color: 'var(--primary)' }}>
                  {formatRupiah(signedContractData?.totalAmount || calculatedTotalAmount)}
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div style={{ marginBottom: '24px' }}>
              <label className="form-label">{t('modal.choosePayment')}</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div
                  style={{
                    border: '2px solid var(--primary)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                    textAlign: 'center',
                    backgroundColor: 'var(--primary-light)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--primary)' }}>Virtual Account</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>BCA / Mandiri / BNI / BRI</div>
                </div>
                <div
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                    textAlign: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>Kartu Kredit / Debit</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Visa / Mastercard / JCB</div>
                </div>
              </div>
            </div>

            {/* Active Rental Warning Banner on Payment Step */}
            {(activeRentalError || hasActiveRental) && (
              <div
                style={{
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <AlertCircle size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                <span>{activeRentalError || t('modal.activeRentalAlert')}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowPayment(false)}
              >
                {t('tenant.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={handleProcessPayment}
                disabled={paymentProcessing || hasActiveRental || Boolean(activeRentalError)}
              >
                {paymentProcessing
                  ? t('modal.processing')
                  : (hasActiveRental || activeRentalError)
                  ? t('modal.activeRentalFound')
                  : `Bayar ${formatRupiah(signedContractData?.totalAmount || calculatedTotalAmount)}`}
              </button>
            </div>
          </div>
        ) : (
          /* Modal View 3: Standard Property Detail */
          <div>
            <img
              src={image}
              alt={property.name || 'Kosmo Property'}
              style={{ width: '100%', height: '280px', objectFit: 'cover' }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src =
                  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80';
              }}
            />
            <div style={{ padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: 800 }}>{property.name || 'Properti KOSMO'}</h2>
                  <div className="property-location" style={{ fontSize: '14px', marginTop: '4px' }}>
                    <MapPin size={16} />
                    <span>{property.address || property.district || 'Bali'}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>
                    {formatRupiah(price)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('prop.perMonth')}</div>
                </div>
              </div>

              {/* Status & Verified Info */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    backgroundColor: isFull ? '#fee2e2' : '#ecfdf5',
                    color: isFull ? '#dc2626' : '#059669',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: 700
                  }}
                >
                  {isFull ? t('prop.full') : `Tersedia: ${availableRooms} dari ${totalRooms} Kamar`}
                </span>
                <span
                  style={{
                    backgroundColor: 'var(--primary-light)',
                    color: 'var(--primary)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <ShieldCheck size={14} />
                  {t('prop.verified')}
                </span>
                {property.document && (
                  <span
                    style={{
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Download size={13} />
                    {property.document}
                  </span>
                )}
              </div>

              {/* Description */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>{t('modal.description')}</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6 }}>
                  {property.description || 'Hunian nyaman dengan fasilitas lengkap di Bali.'}
                </p>
              </div>

              {/* Facilities Included */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>
                  {t('modal.includedFacilities')}
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {facilities.map((fac, idx) => (
                    <span
                      key={idx}
                      className="facility-pill"
                      style={{
                        backgroundColor: 'var(--primary-light)',
                        color: 'var(--primary)',
                        borderColor: 'rgba(37, 99, 235, 0.2)',
                        fontWeight: 600
                      }}
                    >
                      {renderFacilityIcon(fac)}
                      {fac}
                    </span>
                  ))}
                </div>
              </div>

              {/* Interactive Location Map */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 700 }}>{t('modal.interactiveMap')}</h4>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => setShowMap(!showMap)}
                  >
                    {showMap ? 'Tutup Peta' : 'Buka Peta'}
                  </button>
                </div>
                {showMap && (
                  <div
                    id="property-detail-map"
                    style={{
                      width: '100%',
                      height: '220px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      overflow: 'hidden'
                    }}
                  />
                )}
              </div>

              {/* Active Rental Warning Banner */}
              {(hasActiveRental || activeRentalError) && (
                <div
                  style={{
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    color: '#92400e',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    marginBottom: '16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <AlertCircle size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                  <span>{activeRentalError || t('modal.activeRentalAlert')}</span>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={onClose}
                >
                  {t('modal.close')}
                </button>
                {currentUser ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                    disabled={isFull || hasActiveRental || Boolean(activeRentalError)}
                    onClick={() => setShowContract(true)}
                  >
                    {(hasActiveRental || activeRentalError)
                      ? t('modal.activeRentalFound')
                      : isFull
                      ? t('modal.roomFull')
                      : t('modal.bookNow')}
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                    onClick={onNavigateToLogin}
                  >
                    {t('modal.loginToBook')}
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Contract Preview Modal (Pop-up Draft) */}
        {showPreviewModal && previewData && (
          <div
            className="modal-overlay"
            style={{ zIndex: 1100, backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
            onClick={() => setShowPreviewModal(false)}
          >
            <div
              className="modal-content glass-panel dark:bg-slate-900 dark:border-slate-800"
              style={{ maxWidth: '580px', maxHeight: '85vh', overflowY: 'auto', padding: '24px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--dark)' }}>
                    {t('contract.previewTitle')}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {t('contract.previewSubtitle')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* SHA-256 Checksum Badge */}
              <div
                style={{
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  marginBottom: '16px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all'
                }}
              >
                <div style={{ fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                  {t('contract.previewHash')}
                </div>
                <div style={{ color: '#0f172a' }}>
                  {previewData.contractHash}
                </div>
              </div>

              {/* Preview Details */}
              <div
                style={{
                  backgroundColor: 'white',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '16px',
                  fontSize: '12px',
                  lineHeight: 1.6,
                  marginBottom: '16px'
                }}
              >
                <p><strong>Properti:</strong> {previewData.contractData.propertyName} ({previewData.contractData.propertyAddress})</p>
                <p><strong>Penyewa:</strong> {previewData.contractData.tenantName} ({previewData.contractData.tenantEmail}) &bull; NIK/Paspor: {previewData.contractData.tenantNikPassport || idNumber || '-'}</p>
                <p><strong>Mulai Sewa:</strong> {previewData.contractData.startDate} &bull; <strong>Durasi:</strong> {previewData.contractData.durationMonths || durationMonths} Bulan</p>
                <hr style={{ margin: '10px 0', borderColor: 'var(--border-color)' }} />
                <p><strong>Biaya Sewa Kamar:</strong> {formatRupiah(previewData.totalPrice || (previewData.monthlyPrice * (previewData.contractData.durationMonths || 1)))}</p>
                <p><strong>Biaya Admin & Meterai:</strong> {formatRupiah(previewData.adminFee || 5000)}</p>
                <p><strong>Total Transaksi:</strong> <strong>{formatRupiah(previewData.totalAmount)}</strong></p>
                <hr style={{ margin: '10px 0', borderColor: 'var(--border-color)' }} />
                <p><strong>Kuota Utilitas Bulanan:</strong></p>
                <ul style={{ paddingLeft: '16px', margin: '4px 0' }}>
                  <li>Listrik: {previewData.contractData.utilityQuotas?.electricityKwh || '200 kWh/bulan'}</li>
                  <li>Air Bersih: {previewData.contractData.utilityQuotas?.water || 'PDAM & Sumur Bor Terfilter'}</li>
                  <li>WiFi Fiber: {previewData.contractData.utilityQuotas?.wifiMbps || '100 Mbps'}</li>
                  <li>Keamanan: {previewData.contractData.utilityQuotas?.security || 'CCTV 24 Jam & Gerbang'}</li>
                  <li>Kebersihan: {previewData.contractData.utilityQuotas?.waste || 'Pengangkutan Sampah Harian'}</li>
                </ul>
              </div>

              <div style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowPreviewModal(false)}
                >
                  {t('contract.previewClose')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

