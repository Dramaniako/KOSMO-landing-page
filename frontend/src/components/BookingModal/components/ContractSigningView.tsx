import React from 'react';
import {
  ShieldCheck, ShieldAlert, AlertCircle, Lock, CheckCircle2, Eye,
  AlertTriangle, ChevronDown, RefreshCw, Check
} from 'lucide-react';
import { Property, User } from '../../../types/index';
import { useTranslation } from '../../../context/LanguageContext';
import { formatRupiah } from '../../../utils/format';
import SignaturePad from './SignaturePad';

export interface ContractSigningViewProps {
  property: Property;
  currentUser: User | null;
  activeRentalError: string | null;
  hasActiveRental: boolean;
  profileStatus: {
    complete: boolean;
    missingFields: string[];
    missingFieldLabels: string[];
  };
  idType: 'NIK' | 'PASSPORT';
  idNumber: string;
  idTouched: boolean;
  idValidationMsg: string | null;
  isIdValid: boolean;
  handleIdChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleIdTypeChange: (type: 'NIK' | 'PASSPORT') => void;
  startDate: string;
  setStartDate: (date: string) => void;
  durationMonths: number;
  setDurationMonths: (months: number) => void;
  calculatedTotalRent: number;
  flatAdminFee: number;
  calculatedTotalAmount: number;
  previewLoading: boolean;
  handleFetchPreview: () => void;
  termsContainerRef: React.RefObject<HTMLDivElement | null>;
  handleTermsScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollError: string | null;
  hasScrolledToBottom: boolean;
  affirmativeConsent: boolean;
  setAffirmativeConsent: (consent: boolean) => void;
  consentError: string | null;
  setConsentError: (err: string | null) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  hasDrawnSignature: boolean;
  signatureConfirmed: boolean;
  signatureError: string | null;
  handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handleClearSignature: () => void;
  handleConfirmSignature: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  isSigning: boolean;
  contractSigned: boolean;
}

export default function ContractSigningView({
  property,
  currentUser,
  activeRentalError,
  hasActiveRental,
  profileStatus,
  idType,
  idNumber,
  idTouched,
  idValidationMsg,
  isIdValid,
  handleIdChange,
  handleIdTypeChange,
  startDate,
  setStartDate,
  durationMonths,
  setDurationMonths,
  calculatedTotalRent,
  flatAdminFee,
  calculatedTotalAmount,
  previewLoading,
  handleFetchPreview,
  termsContainerRef,
  handleTermsScroll,
  scrollError,
  hasScrolledToBottom,
  affirmativeConsent,
  setAffirmativeConsent,
  consentError,
  setConsentError,
  canvasRef,
  hasDrawnSignature,
  signatureConfirmed,
  signatureError,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  handleClearSignature,
  handleConfirmSignature,
  onCancel,
  onSubmit,
  isSigning,
  contractSigned
}: ContractSigningViewProps) {
  const { t } = useTranslation();
  const price = Number(property.price) || 0;

  return (
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

      {/* In-Modal Profile Incomplete Alert */}
      {currentUser && !profileStatus.complete && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            marginBottom: '18px',
            fontSize: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px' }}>
            <AlertCircle size={18} style={{ color: '#dc2626', flexShrink: 0 }} />
            <span>Profil Identitas Hukum Belum Lengkap</span>
          </div>
          <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#b91c1c', lineHeight: '1.4' }}>
            Berdasarkan Pasal 1320 KUHPerdata & UU ITE, Anda wajib melengkapi data identitas (NIK/Paspor, Alamat Domisili, Pekerjaan, Kontak Darurat) sebelum dapat menandatangani kontrak.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
            {profileStatus.missingFieldLabels.map((lbl, idx) => (
              <span key={idx} style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                ✕ {lbl}
              </span>
            ))}
          </div>
          <a
            href="/tenant"
            className="btn btn-primary"
            style={{ padding: '6px 14px', fontSize: '12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            Lengkapi Profil di Dashboard &rarr;
          </a>
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
            border: `1px solid ${scrollError ? '#ef4444' : hasScrolledToBottom ? '#22c55e' : 'var(--border-color)'}`,
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
        {scrollError ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#dc2626', marginTop: '6px', fontWeight: 600 }}>
            <AlertTriangle size={14} />
            <span>{scrollError}</span>
          </div>
        ) : !hasScrolledToBottom ? (
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
              onChange={(e) => {
                setAffirmativeConsent(e.target.checked);
                if (e.target.checked) setConsentError(null);
              }}
              style={{ marginTop: '2px', cursor: hasScrolledToBottom ? 'pointer' : 'not-allowed' }}
            />
            <span>{t('contract.consentCheckbox')}</span>
          </label>
          {consentError && (
            <p style={{ color: '#dc2626', fontSize: '11px', marginTop: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={12} />
              <span>{consentError}</span>
            </p>
          )}
        </div>
      </div>

      {/* SECTION C: HTML5 Canvas Digital Signature Pad */}
      <SignaturePad
        canvasRef={canvasRef}
        hasDrawnSignature={hasDrawnSignature}
        signatureConfirmed={signatureConfirmed}
        signatureError={signatureError}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClear={handleClearSignature}
        onConfirm={handleConfirmSignature}
      />

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
          onClick={onCancel}
          disabled={isSigning}
        >
          {t('tenant.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 2 }}
          onClick={onSubmit}
          disabled={
            isSigning ||
            contractSigned ||
            hasActiveRental ||
            Boolean(activeRentalError) ||
            !profileStatus.complete
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
  );
}
