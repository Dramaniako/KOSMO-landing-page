import React from 'react';

interface BillingHistoryListProps {
  isLoading: boolean;
  isLoaded: boolean;
}

export const BillingHistoryList: React.FC<BillingHistoryListProps> = ({
  isLoading,
  isLoaded
}) => {
  return (
    <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
      <h3 style={{ fontSize: '20px', marginBottom: '24px' }}>Riwayat Transaksi & Tagihan</h3>

      {isLoading && !isLoaded ? (
        <div className="flex-center" style={{ height: '160px', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat riwayat tagihan...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="flex-between" style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: '#ffffff' }}>
            <div>
              <span className="badge badge-success" style={{ marginBottom: '6px', fontSize: '10px' }}>Berhasil</span>
              <h4 style={{ fontSize: '15px' }}>KOSMO Hub Denpasar (Kamar 101)</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Invoice: INV-KSM-0526-782 &bull; Tanggal: 3 Jun 2026</p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tagihan: All-Inclusive (Sewa, Listrik, Air)</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong style={{ fontSize: '18px', color: 'var(--dark)' }}>Rp 3.500.000</strong>
              <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>Via BCA Virtual Account</span>
            </div>
          </div>

          <div className="flex-between" style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: '#ffffff' }}>
            <div>
              <span className="badge badge-success" style={{ marginBottom: '6px', fontSize: '10px' }}>Berhasil</span>
              <h4 style={{ fontSize: '15px' }}>KOSMO Hub Denpasar (Kamar 101) - Deposit</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Invoice: INV-KSM-0526-462 &bull; Tanggal: 3 Jun 2026</p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tagihan: Deposit Awal Jaminan Kamar</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong style={{ fontSize: '18px', color: 'var(--dark)' }}>Rp 550.000</strong>
              <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>Via BCA Virtual Account</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
