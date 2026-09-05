import React from 'react';
import { X, FileText, Download, ShieldCheck, DoorOpen } from 'lucide-react';
import { Rental } from '../../../types/index';
import { useTranslation } from '../../../context/LanguageContext';
import { formatRupiah } from '../../../utils/format';

interface ContractViewerModalProps {
  rental: Rental;
  onClose: () => void;
  onDownloadPdf: (rentalId: string) => Promise<void>;
  isDownloading: boolean;
}

export const ContractViewerModal: React.FC<ContractViewerModalProps> = ({
  rental,
  onClose,
  onDownloadPdf,
  isDownloading
}) => {
  const { language } = useTranslation();

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1100, backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={onClose}
    >
      <div
        className="modal-content glass-panel dark:bg-slate-900 dark:border-slate-800"
        style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
        data-testid="contract-viewer-modal"
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={20} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--dark)' }}>
                Dokumen Perjanjian Sewa Digital
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                KOSMO Bali Co-Living Marketplace Legal Contract
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '6px 10px', fontSize: '12px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* SHA-256 Cryptographic Hash Verification Strip */}
        {rental.contract_hash && (
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg mb-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold mb-1">
              <ShieldCheck size={14} /> Checksum Terverifikasi (SHA-256)
            </div>
            <div className="text-slate-700 dark:text-slate-300 break-all text-[11px]">
              {rental.contract_hash}
            </div>
            {rental.contract_signed_at && (
              <div className="text-[11px] text-slate-500 mt-1 font-sans">
                Ditandatangani pada: {new Date(rental.contract_signed_at).toLocaleString(language === 'en' ? 'en-US' : 'id-ID')}
              </div>
            )}
          </div>
        )}

        {/* Contract Core Specifications */}
        <div className="space-y-4 text-xs leading-relaxed">
          {/* Unit & Property Section */}
          <div className="p-3.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg">
            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mb-2 flex items-center gap-2">
              <DoorOpen size={16} className="text-primary" /> Objek Sewa & Kamar
            </h4>
            <div className="grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
              <div><strong>Properti:</strong> {rental.propertyName}</div>
              <div>
                <strong>Kamar:</strong>{' '}
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {rental.roomNumber ? `Kamar ${rental.roomNumber}` : rental.roomId || '-'}
                </span>
              </div>
              {rental.roomFloor && <div><strong>Lantai:</strong> {rental.roomFloor}</div>}
              {rental.roomType && <div><strong>Tipe Kamar:</strong> {rental.roomType}</div>}
              <div><strong>Mulai Sewa:</strong> {rental.startDate}</div>
              <div><strong>Durasi:</strong> {rental.duration_months || rental.totalDurationMonths || 1} Bulan</div>
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="p-3.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg">
            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mb-2">
              Rincian Biaya & Ketentuan Pembayaran
            </h4>
            <div className="space-y-1 text-slate-700 dark:text-slate-300">
              <div className="flex justify-between">
                <span>Biaya Sewa per Bulan:</span>
                <strong>{formatRupiah(rental.price)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Biaya Admin & Meterai Platform:</span>
                <span>{formatRupiah(rental.admin_fee_amount || 5000)}</span>
              </div>
              <hr className="my-1.5 border-slate-200 dark:border-slate-700" />
              <div className="flex justify-between text-sm font-bold text-primary">
                <span>Total Nilai Sewa:</span>
                <span>{formatRupiah(rental.price * (rental.duration_months || 1) + (rental.admin_fee_amount || 5000))}</span>
              </div>
            </div>
          </div>

          {/* Included Utility Quotas */}
          <div className="p-3.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg">
            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mb-2">
              Fasilitas & Kuota Utilitas Bulanan (All-Inclusive)
            </h4>
            <ul className="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-300">
              <li>Listrik: Kuota 200 kWh per bulan included</li>
              <li>Air Bersih: PDAM & Sumur Bor Terfilter included</li>
              <li>WiFi Fiber: 100 Mbps Dedicated High-Speed</li>
              <li>Keamanan: Keamanan 24 Jam & Akses CCTV Area Bersama</li>
              <li>Kebersihan: Pengangkutan Sampah Harian & Pembersihan Koridor</li>
            </ul>
          </div>

          {/* Statutory Clauses */}
          <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg text-[11px] text-amber-800 dark:text-amber-300">
            <strong>Klausul Hukum:</strong> Perjanjian elektronik ini mengikat sah para pihak berdasarkan Pasal 1320 KUHPerdata dan UU ITE No. 11/2008 jo. UU No. 1/2024. Segala perselisihan diselesaikan melalui Pengadilan Negeri Denpasar / Badung, Bali.
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Tutup
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onDownloadPdf(rental.id)}
            disabled={isDownloading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} />
            {isDownloading ? 'Mengunduh Dokumen...' : 'Unduh Dokumen PDF Resmi'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContractViewerModal;
