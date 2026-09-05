import React from 'react';
import { Eraser, Check, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';

export interface SignaturePadProps {
  canvasRef?: React.RefObject<HTMLCanvasElement>;
  hasDrawnSignature: boolean;
  signatureConfirmed: boolean;
  signatureError: string | null;
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onClear: () => void;
  onConfirm: () => void;
}

export default function SignaturePad({
  canvasRef,
  hasDrawnSignature,
  signatureConfirmed,
  signatureError,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClear,
  onConfirm
}: SignaturePadProps) {
  const { t } = useTranslation();

  return (
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
            onClick={onClear}
            className="btn btn-outline"
            style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Eraser size={12} />
            {t('contract.signatureClear')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
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
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerCancel={onPointerUp}
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
        <p style={{ color: '#dc2626', fontSize: '11px', marginTop: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <AlertTriangle size={13} />
          <span>{signatureError}</span>
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
  );
}
