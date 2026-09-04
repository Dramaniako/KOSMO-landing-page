import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Property, User, ContractSignPayload, SignedContractData, isUserProfileComplete } from '../types/index';
import { useTranslation } from '../context/LanguageContext';
import { useIdentityValidation } from './BookingModal/hooks/useIdentityValidation';
import { useScrollClickwrap } from './BookingModal/hooks/useScrollClickwrap';
import { useSignaturePad } from './BookingModal/hooks/useSignaturePad';
import { useContractPreview } from './BookingModal/hooks/useContractPreview';
import BookingPropertyDetailView from './BookingModal/components/BookingPropertyDetailView';
import ContractSigningView from './BookingModal/components/ContractSigningView';
import ContractPaymentView from './BookingModal/components/ContractPaymentView';
import ContractPreviewModal from './BookingModal/components/ContractPreviewModal';

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
  const { t } = useTranslation();

  // 1. Duration & Start Date
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Profile completeness check
  const profileStatus = isUserProfileComplete(currentUser);

  // 2. Identity Verification (NIK / Passport) Hook
  const {
    idType,
    idNumber,
    idTouched,
    setIdTouched,
    idValidationMsg,
    setIdValidationMsg,
    handleIdChange,
    handleIdTypeChange,
    validateIdentity,
    isIdValid
  } = useIdentityValidation(currentUser, showContract);

  // 3. Scroll-to-Read Clickwrap Hook
  const {
    termsContainerRef,
    hasScrolledToBottom,
    affirmativeConsent,
    setAffirmativeConsent,
    scrollError,
    setScrollError,
    consentError,
    setConsentError,
    handleTermsScroll
  } = useScrollClickwrap(showContract);

  // 4. HTML5 Canvas Signature Pad Hook
  const {
    canvasRef,
    hasDrawnSignature,
    signatureConfirmed,
    signatureBase64,
    signatureError,
    setSignatureError,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleClearSignature,
    handleConfirmSignature
  } = useSignaturePad(showContract);

  // 5. Contract Preview Hook
  const {
    previewLoading,
    previewData,
    showPreviewModal,
    setShowPreviewModal,
    handleFetchPreview
  } = useContractPreview();

  // 6. Contract PDF Download State & Handler
  const [downloadingSignedContract, setDownloadingSignedContract] = useState<boolean>(false);

  const handleDownloadSignedContract = async (rentalId: string): Promise<void> => {
    setDownloadingSignedContract(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/contract?download=true`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        throw new Error('Gagal mengunduh dokumen kontrak PDF.');
      }
      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `kontrak_sewa_${rentalId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunduh dokumen kontrak PDF.';
      alert(msg);
    } finally {
      setDownloadingSignedContract(false);
    }
  };

  // Form Submit Handler
  const handleSignContractSubmit = async () => {
    setIdTouched(true);
    const idVal = validateIdentity(idNumber, idType);
    if (!idVal.isValid) {
      setIdValidationMsg(idVal.error);
    }

    let hasError = false;
    if (!idVal.isValid) {
      hasError = true;
    }

    if (!hasScrolledToBottom) {
      setScrollError('Wajib membaca dan menggulir klausul kontrak hingga ke bagian paling bawah.');
      hasError = true;
    } else {
      setScrollError(null);
    }

    if (!affirmativeConsent) {
      setConsentError('Wajib mencentang persetujuan syarat & ketentuan klausul kontrak sewa digital.');
      hasError = true;
    } else {
      setConsentError(null);
    }

    if (!hasDrawnSignature) {
      setSignatureError('Wajib membubuhkan tanda tangan digital pada area kanvas di atas.');
      hasError = true;
    } else if (!signatureConfirmed || !signatureBase64) {
      setSignatureError('Wajib mengeklik tombol "Konfirmasi Tanda Tangan" untuk menyimpan tanda tangan digital.');
      hasError = true;
    } else {
      setSignatureError(null);
    }

    if (hasError || !property) return;

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content glass-panel dark:bg-slate-900 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl border border-slate-200/80 dark:border-slate-800 relative"
        style={{ maxWidth: showContract ? '640px' : '580px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="min-w-[40px] min-h-[40px] w-10 h-10 absolute top-4 right-4 border-none bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 rounded-full cursor-pointer flex items-center justify-center shadow-lg backdrop-blur-md z-20 hover:bg-white dark:hover:bg-slate-700 hover:scale-105 transition-all duration-200"
          aria-label={t('modal.close')}
        >
          <X size={18} />
        </button>

        {showContract ? (
          <ContractSigningView
            property={property}
            currentUser={currentUser}
            activeRentalError={activeRentalError}
            hasActiveRental={hasActiveRental}
            profileStatus={profileStatus}
            idType={idType}
            idNumber={idNumber}
            idTouched={idTouched}
            idValidationMsg={idValidationMsg}
            isIdValid={isIdValid}
            handleIdChange={handleIdChange}
            handleIdTypeChange={handleIdTypeChange}
            startDate={startDate}
            setStartDate={setStartDate}
            durationMonths={durationMonths}
            setDurationMonths={setDurationMonths}
            calculatedTotalRent={calculatedTotalRent}
            flatAdminFee={flatAdminFee}
            calculatedTotalAmount={calculatedTotalAmount}
            previewLoading={previewLoading}
            handleFetchPreview={() =>
              handleFetchPreview(
                property.id,
                durationMonths,
                startDate,
                idNumber.trim() || (currentUser?.email || 'TEST-TENANT'),
                signatureBase64 || undefined
              )
            }
            termsContainerRef={termsContainerRef}
            handleTermsScroll={handleTermsScroll}
            scrollError={scrollError}
            hasScrolledToBottom={hasScrolledToBottom}
            affirmativeConsent={affirmativeConsent}
            setAffirmativeConsent={setAffirmativeConsent}
            consentError={consentError}
            setConsentError={setConsentError}
            canvasRef={canvasRef}
            hasDrawnSignature={hasDrawnSignature}
            signatureConfirmed={signatureConfirmed}
            signatureError={signatureError}
            handlePointerDown={handlePointerDown}
            handlePointerMove={handlePointerMove}
            handlePointerUp={handlePointerUp}
            handleClearSignature={handleClearSignature}
            handleConfirmSignature={() => handleConfirmSignature(t('contract.signatureRequired'))}
            onCancel={() => setShowContract(false)}
            onSubmit={handleSignContractSubmit}
            isSigning={isSigning}
            contractSigned={contractSigned}
          />
        ) : showPayment ? (
          <ContractPaymentView
            property={property}
            currentUser={currentUser}
            durationMonths={durationMonths}
            calculatedTotalRent={calculatedTotalRent}
            flatAdminFee={flatAdminFee}
            calculatedTotalAmount={calculatedTotalAmount}
            signedContractData={signedContractData}
            downloadingSignedContract={downloadingSignedContract}
            handleDownloadSignedContract={handleDownloadSignedContract}
            paymentProcessing={paymentProcessing}
            handleProcessPayment={handleProcessPayment}
            hasActiveRental={hasActiveRental}
            activeRentalError={activeRentalError}
            onCancel={() => setShowPayment(false)}
          />
        ) : (
          <BookingPropertyDetailView
            property={property}
            image={image}
            price={price}
            totalRooms={totalRooms}
            occupiedRooms={occupiedRooms}
            availableRooms={availableRooms}
            isFull={isFull}
            facilities={facilities}
            renderFacilityIcon={renderFacilityIcon}
            showMap={showMap}
            setShowMap={setShowMap}
            hasActiveRental={hasActiveRental}
            activeRentalError={activeRentalError}
            currentUser={currentUser}
            profileStatus={profileStatus}
            onClose={onClose}
            onBookNow={() => setShowContract(true)}
            onNavigateToLogin={onNavigateToLogin}
          />
        )}

        {showPreviewModal && previewData && (
          <ContractPreviewModal
            previewData={previewData}
            durationMonths={durationMonths}
            idNumber={idNumber}
            onClose={() => setShowPreviewModal(false)}
          />
        )}
      </div>
    </div>
  );
}
