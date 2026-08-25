import React from 'react';
import {
  MapPin, Star, X, ArrowRight, ShieldCheck, Download, CreditCard, Sparkles, Check, AlertCircle
} from 'lucide-react';
import { Property, User } from '../types/index';
import { useTranslation } from '../context/LanguageContext';
import { formatRupiah } from '../utils/format';

export interface Props {
  property: Property | null;
  showContract: boolean;
  setShowContract: (show: boolean) => void;
  contractSigned: boolean;
  handleSignContract: () => void;
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel dark:bg-slate-900 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] absolute top-4 right-4 border-none bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-full cursor-pointer flex items-center justify-center shadow-md z-10 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          aria-label={t('modal.close')}
        >
          <X size={18} />
        </button>

        {/* Modal View: Contract Signing */}
        {showContract ? (
          <div style={{ padding: '32px' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div className="flex-center" style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', margin: '0 auto 12px auto' }}>
                <ShieldCheck size={24} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 800 }}>{t('modal.contractTitle')}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                {t('modal.contractDesc')}
              </p>
            </div>

            <div style={{ backgroundColor: 'var(--bg-main)', padding: '20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', maxHeight: '250px', overflowY: 'auto', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-main)', marginBottom: '24px' }}>
              <p><strong>PIHAK PERTAMA / FIRST PARTY:</strong> Pengelola KOSMO Hub Bali</p>
              <p><strong>PIHAK KEDUA / SECOND PARTY:</strong> {currentUser ? currentUser.name : 'Calon Penghuni'}</p>
              <br />
              <p><strong>Ketentuan Sewa / Lease Terms:</strong></p>
              <ol style={{ paddingLeft: '20px' }}>
                <li>Penyewa setuju menyewa 1 unit kamar di {property.name} ({property.address}).</li>
                <li>Biaya sewa sebesar {formatRupiah(property.price)}/bulan all-inclusive (Listrik, Air, Wifi, Kebersihan, Keamanan, Parkir).</li>
                <li>Pembayaran jatuh tempo setiap bulan terhitung sejak tanggal masuk.</li>
                <li>Penyewa wajib menjaga ketenangan dan kebersihan fasilitas bersama.</li>
                <li>Pemberhentian sewa wajib dikonfirmasi melalui portal minimal 7 hari sebelumnya.</li>
              </ol>
            </div>

            {/* Signature Area */}
            <div style={{ border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px', textAlign: 'center', backgroundColor: '#fcfcfc', marginBottom: '24px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                Tanda tangan digital terenkripsi:
              </span>
              <div style={{ fontFamily: 'cursive', fontSize: '24px', color: 'var(--primary)', minHeight: '36px' }}>
                {currentUser ? currentUser.name : 'Digital Signature'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                E-Sign ID: KOSMO-SIGN-{Date.now().toString(36).toUpperCase()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowContract(false)}
              >
                {t('tenant.cancel')}
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={handleSignContract}
                disabled={contractSigned}
              >
                {contractSigned ? (
                  <>
                    <Check size={16} />
                    Tersimpan & Diverifikasi...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    {t('modal.signAndContinue')}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : showPayment ? (
          /* Modal View: Payment Gateway */
          <div style={{ padding: '32px' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div className="flex-center" style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#ecfdf5', color: '#10b981', margin: '0 auto 12px auto' }}>
                <CreditCard size={24} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 800 }}>{t('modal.paymentTitle')}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                All-Inclusive Rental Payment
              </p>
            </div>

            <div style={{ backgroundColor: 'var(--bg-main)', padding: '20px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Properti</span>
                <span style={{ fontWeight: 600 }}>{property.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Penyewa</span>
                <span style={{ fontWeight: 600 }}>{currentUser ? currentUser.name : '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Paket</span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{t('modal.paymentPackage')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--border-color)', fontSize: '16px', fontWeight: 800 }}>
                <span>{t('modal.totalPay')}</span>
                <span style={{ color: 'var(--primary)' }}>{formatRupiah(property.price)}</span>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label className="form-label">{t('modal.choosePayment')}</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ border: '2px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: '12px', textAlign: 'center', backgroundColor: 'var(--primary-light)', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--primary)' }}>Virtual Account</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>BCA / Mandiri / BNI</div>
                </div>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '12px', textAlign: 'center', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>Kartu Kredit</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Visa / Mastercard</div>
                </div>
              </div>
            </div>

            {/* Active Rental Warning Banner on Payment Step */}
            {(activeRentalError || hasActiveRental) && (
              <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: '16px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                <span>{activeRentalError || t('modal.activeRentalAlert')}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowPayment(false)}
              >
                {t('tenant.cancel')}
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={handleProcessPayment}
                disabled={paymentProcessing || hasActiveRental || Boolean(activeRentalError)}
              >
                {paymentProcessing ? t('modal.processing') : (hasActiveRental || activeRentalError) ? t('modal.activeRentalFound') : `Bayar ${formatRupiah(price)}`}
              </button>
            </div>
          </div>
        ) : (
          /* Modal View: Standard Property Detail */
          <div>
            <img
              src={image}
              alt={property.name || 'Kosmo Property'}
              style={{ width: '100%', height: '280px', objectFit: 'cover' }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80';
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

              {/* Status & Document info */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <span style={{ backgroundColor: isFull ? '#fee2e2' : '#ecfdf5', color: isFull ? '#dc2626' : '#059669', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 700 }}>
                  {isFull ? t('prop.full') : `Tersedia: ${availableRooms} dari ${totalRooms} Kamar`}
                </span>
                <span style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={14} />
                  {t('prop.verified')}
                </span>
                {property.document && (
                  <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                    <span key={idx} className="facility-pill" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', borderColor: 'rgba(37, 99, 235, 0.2)', fontWeight: 600 }}>
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
                    style={{ width: '100%', height: '220px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden' }}
                  />
                )}
              </div>

              {/* Active Rental Warning Banner */}
              {(hasActiveRental || activeRentalError) && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: '16px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                  <span>{activeRentalError || t('modal.activeRentalAlert')}</span>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={onClose}
                >
                  {t('modal.close')}
                </button>
                {currentUser ? (
                  <button
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                    disabled={isFull || hasActiveRental || Boolean(activeRentalError)}
                    onClick={() => setShowContract(true)}
                  >
                    {(hasActiveRental || activeRentalError) ? t('modal.activeRentalFound') : isFull ? t('modal.roomFull') : t('modal.bookNow')}
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
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
      </div>
    </div>
  );
}
