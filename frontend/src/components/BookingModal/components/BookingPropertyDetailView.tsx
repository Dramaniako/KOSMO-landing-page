import React from 'react';
import { MapPin, Star, Sparkles, ShieldCheck, Download, CheckCircle2, FileText, Eye, AlertCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { Property, User, PropertyPhoto, Room } from '../../../types/index';
import { useTranslation } from '../../../context/LanguageContext';
import { formatRupiah } from '../../../utils/format';
import { PropertyPhotoGallery } from './PropertyPhotoGallery';
import { RoomSelectionGrid } from './RoomSelectionGrid';

export interface BookingPropertyDetailViewProps {
  property: Property;
  image: string;
  price: number;
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  isFull: boolean;
  facilities: string[];
  renderFacilityIcon: (fac: string) => React.ReactNode;
  showMap: boolean;
  setShowMap: (show: boolean) => void;
  hasActiveRental: boolean;
  activeRentalError: string | null;
  currentUser: User | null;
  profileStatus: {
    complete: boolean;
    missingFields: string[];
    missingFieldLabels: string[];
  };
  photos?: PropertyPhoto[];
  photosLoading?: boolean;
  rooms?: Room[];
  roomsLoading?: boolean;
  selectedRoom?: Room | null;
  onSelectRoom?: (room: Room) => void;
  onClose: () => void;
  onBookNow: () => void;
  onNavigateToLogin: () => void;
}

export default function BookingPropertyDetailView({
  property,
  image,
  price,
  totalRooms,
  availableRooms,
  isFull,
  facilities,
  renderFacilityIcon,
  showMap,
  setShowMap,
  hasActiveRental,
  activeRentalError,
  currentUser,
  profileStatus,
  photos = [],
  photosLoading = false,
  rooms = [],
  roomsLoading = false,
  selectedRoom = null,
  onSelectRoom,
  onClose,
  onBookNow,
  onNavigateToLogin
}: BookingPropertyDetailViewProps) {
  const { t } = useTranslation();

  const displayPrice =
    selectedRoom && typeof (selectedRoom.effectivePrice ?? selectedRoom.price) === 'number' && Number(selectedRoom.effectivePrice ?? selectedRoom.price) > 0
      ? Number(selectedRoom.effectivePrice ?? selectedRoom.price)
      : price;

  const hasDiscreteRooms = Boolean(onSelectRoom && Array.isArray(rooms));
  const isRoomSelectionRequired = hasDiscreteRooms && (rooms.length === 0 || !selectedRoom);
  const isBookDisabled =
    isFull ||
    hasActiveRental ||
    Boolean(activeRentalError) ||
    !profileStatus.complete ||
    Boolean(hasDiscreteRooms && roomsLoading) ||
    isRoomSelectionRequired;

  // Auto-select first available room when discrete rooms inventory loads and none selected
  React.useEffect(() => {
    if (!selectedRoom && onSelectRoom && Array.isArray(rooms) && rooms.length > 0) {
      const firstAvailable = rooms.find((r) => r && r.status === 'available');
      if (firstAvailable) {
        onSelectRoom(firstAvailable);
      }
    }
  }, [rooms, selectedRoom, onSelectRoom]);

  return (
    <div className="flex flex-col">
      {/* Interactive Photo Gallery */}
      <PropertyPhotoGallery
        property={property}
        photos={photos}
        loading={photosLoading}
      />

      {/* Modal Body Container */}
      <div className="p-5 sm:p-6 flex flex-col gap-5">
        {/* Header Title & Pricing Row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
              {property.name || 'Properti KOSMO'}
            </h2>
            <div className="property-location flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 mt-1.5">
              <MapPin size={16} className="text-blue-500 flex-shrink-0" />
              <span>{property.address || property.district || 'Bali'}</span>
            </div>
          </div>

          <div className="sm:text-right flex-shrink-0 bg-blue-50/70 dark:bg-blue-950/40 sm:bg-transparent p-3 sm:p-0 rounded-xl border border-blue-100 dark:border-blue-900/50 sm:border-0">
            <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tight property-price">
              {formatRupiah(displayPrice)}
            </div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5 flex items-center sm:justify-end gap-1">
              <span>{t('prop.perMonth')}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">• Bebas Biaya Utilitas</span>
            </div>
          </div>
        </div>

        {/* Status, Trust & Verified Certifications */}
        <div className="flex flex-wrap items-center gap-2">
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
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 text-xs font-semibold">
            <CheckCircle2 size={13} className="text-blue-500" />
            Kontrak Digital KUHPerdata
          </span>
        </div>

        {/* Co-Living Highlights Grid */}
        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 text-center">
          <div className="flex flex-col items-center justify-center p-1.5">
            <span className="text-[11px] text-slate-400 font-medium">Tipe Kamar</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">Kamar Privat</span>
          </div>
          <div className="flex flex-col items-center justify-center p-1.5 border-x border-slate-200/60 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-400 font-medium">Utilitas</span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">All-Inclusive</span>
          </div>
          <div className="flex flex-col items-center justify-center p-1.5">
            <span className="text-[11px] text-slate-400 font-medium">Sewa Fleksibel</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">1 - 12 Bulan</span>
          </div>
        </div>

        {/* Property Description / Co-Living Overview */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText size={15} className="text-blue-500" />
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              {t('modal.description')}
            </h4>
          </div>
          <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-xl p-3.5 border border-slate-100 dark:border-slate-800 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {property.description || 'Hunian nyaman dan asri dengan fasilitas lengkap di Bali, dirancang khusus untuk digital nomad dan profesional.'}
          </div>
        </div>

        {/* Included Amenities (All-Inclusive) */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-amber-500" />
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {t('modal.includedFacilities')}
              </h4>
            </div>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800">
              Bebas Biaya Tambahan
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {facilities.map((fac, idx) => (
              <div
                key={idx}
                className="facility-pill flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 shadow-sm transition-all duration-200 group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  {renderFacilityIcon(fac)}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate capitalize">
                    {fac}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                    Termasuk
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Discrete Room Selection Grid */}
        {hasDiscreteRooms && onSelectRoom && (
          <RoomSelectionGrid
            rooms={rooms}
            selectedRoom={selectedRoom}
            onSelectRoom={onSelectRoom}
            basePrice={price}
            loading={roomsLoading}
          />
        )}

        {/* Interactive Location Map */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-blue-500" />
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                {t('modal.interactiveMap')}
              </h4>
            </div>
            <button
              type="button"
              className="btn btn-secondary px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5"
              onClick={() => setShowMap(!showMap)}
            >
              <Eye size={12} />
              {showMap ? 'Tutup Peta' : 'Buka Peta'}
            </button>
          </div>
          {showMap && (
            <div
              id="property-detail-map"
              className="w-full h-56 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner overflow-hidden mt-2"
            />
          )}
        </div>

        {/* Active Rental Warning Banner */}
        {(hasActiveRental || activeRentalError) && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-2.5 shadow-sm">
            <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <div className="font-bold text-amber-800 dark:text-amber-300 mb-0.5">
                Hunian Aktif Ditemukan
              </div>
              <div className="leading-relaxed">
                {activeRentalError || t('modal.activeRentalAlert')}
              </div>
            </div>
          </div>
        )}

        {/* Profile Incomplete Warning Banner */}
        {currentUser && !profileStatus.complete && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 flex items-start gap-2.5 shadow-sm">
            <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <div className="font-bold text-rose-800 dark:text-rose-300 mb-0.5">
                Profil Identitas Hukum Belum Lengkap
              </div>
              <p className="mb-2 text-rose-700 dark:text-rose-300 leading-relaxed text-[11px]">
                Sesuai Pasal 1320 KUHPerdata, Anda wajib melengkapi data identitas (NIK/Paspor, Alamat Domisili, Pekerjaan, Kontak Darurat) sebelum menyewa kos.
              </p>
              <a
                href="/tenant"
                className="inline-flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-[11px] transition shadow-sm"
              >
                Lengkapi Profil Sekarang &rarr;
              </a>
            </div>
          </div>
        )}

        {/* Action Buttons Footer */}
        <div className="sticky bottom-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pt-3 pb-1 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 z-10">
          <button
            type="button"
            className="btn btn-secondary flex-1 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            onClick={onClose}
          >
            {t('modal.close')}
          </button>
          {currentUser ? (
            <button
              type="button"
              className="btn btn-primary flex-[2] py-2.5 rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isBookDisabled}
              onClick={onBookNow}
            >
              {!profileStatus.complete
                ? 'Lengkapi Profil untuk Menyewa'
                : (hasActiveRental || activeRentalError)
                ? t('modal.activeRentalFound')
                : isFull
                ? t('modal.roomFull')
                : t('modal.bookNow')}
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary flex-[2] py-2.5 rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
              onClick={onNavigateToLogin}
            >
              {t('modal.loginToBook')}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
