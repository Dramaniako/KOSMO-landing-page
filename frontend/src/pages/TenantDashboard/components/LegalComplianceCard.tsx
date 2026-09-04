import React from 'react';
import { FileText } from 'lucide-react';

export const LegalComplianceCard: React.FC = () => {
  return (
    <div className="card" style={{ padding: '24px', backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <FileText size={20} style={{ color: 'var(--primary)' }} />
        <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)' }}>
          Ketetapan Hukum E-Kontrak Sewa KOSMO
        </h4>
      </div>
      <ul style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6', paddingLeft: '18px', margin: 0 }}>
        <li><strong>Pasal 1320 KUHPerdata:</strong> Perjanjian sewa menyewa sah jika memuat kesepakatan, kecakapan, objek tertentu, dan sebab yang halal.</li>
        <li><strong>UU ITE No. 11/2008 jo. UU No. 1/2024:</strong> Tanda tangan digital dan dokumen elektronik memiliki kekuatan hukum dan akibat hukum yang sah.</li>
        <li><strong>Ketentuan Domisili & Yurisdiksi:</strong> Seluruh sengketa tunduk pada yurisdiksi Pengadilan Negeri Denpasar / Badung, Bali.</li>
      </ul>
    </div>
  );
};
