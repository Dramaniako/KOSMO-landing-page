import React, { useState, useEffect } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import { Property, User, ContractSignPayload, SignedContractData, isUserProfileComplete, PropertyPhoto, Room } from '../types/index';
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

export interface PropertyDetailCacheEntry {
  photos: PropertyPhoto[];
  rooms: Room[];
  timestamp: number;
}

export const modalClientCache = new Map<string, PropertyDetailCacheEntry>();
export const CLIENT_CACHE_TTL_MS = 60 * 1000; // 60s TTL

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

  // Discrete Rooms & Photos State with module-level cache & fallback to property props
  const [photos, setPhotos] = useState<PropertyPhoto[]>(() => {
    if (property?.id) {
      const cached = modalClientCache.get(property.id);
      if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
        return cached.photos;
      }
    }
    return property?.photos || [];
  });
  const [photosLoading, setPhotosLoading] = useState<boolean>(false);
  const [rooms, setRooms] = useState<Room[]>(() => {
    if (property?.id) {
      const cached = modalClientCache.get(property.id);
      if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
        return cached.rooms;
      }
    }
    return property?.rooms || [];
  });
  const [roomsLoading, setRoomsLoading] = useState<boolean>(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  useEffect(() => {
    if (!property?.id) {
      setPhotos([]);
      setRooms([]);
      setSelectedRoom(null);
      return;
    }

    setSelectedRoom(null);

    // Check module-level in-memory cache before fetching
    const cached = modalClientCache.get(property.id);
    if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
      setPhotos(cached.photos);
      setRooms(cached.rooms);
      setPhotosLoading(false);
      setRoomsLoading(false);
      return;
    }

    // Default to property.photos / property.rooms while loading if present to prevent layout shift
    setPhotos(property.photos || []);
    setRooms(property.rooms || []);

    let isCancelled = false;

    const fetchDetails = async () => {
      setPhotosLoading(true);
      setRoomsLoading(true);
      try {
        const [photosRes, roomsRes] = await Promise.all([
          fetch(`${API_BASE}/properties/${property.id}/photos`).catch(() => null),
          fetch(`${API_BASE}/properties/${property.id}/rooms`).catch(() => null)
        ]);

        if (!isCancelled) {
          let fetchedPhotos: PropertyPhoto[] = property.photos || [];
          let fetchedRooms: Room[] = property.rooms || [];

          if (photosRes && photosRes.ok) {
            const photosData = await photosRes.json().catch(() => []);
            fetchedPhotos = Array.isArray(photosData) ? photosData : (property.photos || []);
          }
          setPhotos(fetchedPhotos);

          if (roomsRes && roomsRes.ok) {
            const roomsData = await roomsRes.json().catch(() => []);
            fetchedRooms = Array.isArray(roomsData) ? roomsData : (property.rooms || []);
          }
          setRooms(fetchedRooms);

          // Populate cache on successful fetch
          modalClientCache.set(property.id, {
            photos: fetchedPhotos,
            rooms: fetchedRooms,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        console.warn('Failed to fetch property details:', err);
      } finally {
        if (!isCancelled) {
          setPhotosLoading(false);
          setRoomsLoading(false);
        }
      }
    };

    fetchDetails();

    return () => {
      isCancelled = true;
    };
  }, [property?.id, property?.photos, property?.rooms]);

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
        roomId: selectedRoom ? selectedRoom.id : undefined,
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

  const effectiveMonthlyPrice =
    (selectedRoom && typeof (selectedRoom.effectivePrice ?? selectedRoom.price) === 'number' && Number(selectedRoom.effectivePrice ?? selectedRoom.price) > 0)
      ? Number(selectedRoom.effectivePrice ?? selectedRoom.price)
      : price;

  const flatAdminFee = 5000;
  const calculatedTotalRent = effectiveMonthlyPrice * durationMonths;
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

        {/* Stepper Progress Bar & Breadcrumb (when in Contract or Payment phase) */}
        {(showContract || showPayment) && (
          <div className="bg-slate-50/90 dark:bg-slate-850/90 border-b border-slate-200/80 dark:border-slate-800 px-5 sm:px-6 py-3.5 pt-4">
            <div className="flex items-center justify-between mb-3 pr-10">
              <button
                type="button"
                onClick={() => {
                  if (showPayment) {
                    setShowPayment(false);
                    setShowContract(true);
                  } else {
                    setShowContract(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} />
                <span>{t('modal.stepBack')}</span>
              </button>
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {t('modal.stepProgress', { current: showPayment ? 3 : 2, total: 3 })}
              </span>
            </div>

            {/* Stepper Dots & Labels */}
            <div className="flex items-center justify-between gap-1 sm:gap-2 max-w-md mx-auto">
              {/* Step 1: Detail & Kamar */}
              <button
                type="button"
                onClick={() => {
                  setShowContract(false);
                  setShowPayment(false);
                }}
                className="flex items-center gap-1.5 group cursor-pointer"
              >
                <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px] sm:text-xs font-bold shadow-xs">
                  ✓
                </span>
                <span className="text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {t('modal.stepDetail')}
                </span>
              </button>

              <div className="flex-1 h-0.5 bg-slate-300 dark:bg-slate-700 mx-1 sm:mx-2" />

              {/* Step 2: Kontrak Digital */}
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold shadow-xs ${
                    showPayment
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-600 text-white ring-4 ring-blue-500/20'
                  }`}
                >
                  {showPayment ? '✓' : '2'}
                </span>
                <span
                  className={`text-[11px] sm:text-xs font-bold ${
                    showPayment
                      ? 'text-slate-700 dark:text-slate-300'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {t('modal.stepContract')}
                </span>
              </div>

              <div className="flex-1 h-0.5 bg-slate-300 dark:bg-slate-700 mx-1 sm:mx-2" />

              {/* Step 3: Pembayaran */}
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold shadow-xs ${
                    showPayment
                      ? 'bg-blue-600 text-white ring-4 ring-blue-500/20'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  3
                </span>
                <span
                  className={`text-[11px] sm:text-xs font-bold ${
                    showPayment
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {t('modal.stepPayment')}
                </span>
              </div>
            </div>
          </div>
        )}

        {showContract ? (
          <ContractSigningView
            property={property}
            selectedRoom={selectedRoom}
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
                signatureBase64 || undefined,
                selectedRoom ? selectedRoom.id : undefined
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
            photos={photos}
            photosLoading={photosLoading}
            rooms={rooms}
            roomsLoading={roomsLoading}
            selectedRoom={selectedRoom}
            onSelectRoom={setSelectedRoom}
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
