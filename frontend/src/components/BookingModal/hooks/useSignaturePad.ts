import { useState, useRef, useEffect } from 'react';

export function useSignaturePad(showContract: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef<boolean>(false);
  const [hasDrawnSignature, setHasDrawnSignature] = useState<boolean>(false);
  const [signatureConfirmed, setSignatureConfirmed] = useState<boolean>(false);
  const [signatureBase64, setSignatureBase64] = useState<string>('');
  const [signatureError, setSignatureError] = useState<string | null>(null);

  useEffect(() => {
    if (showContract) {
      setSignatureConfirmed(false);
      setHasDrawnSignature(false);
      setSignatureBase64('');
      setSignatureError(null);
    }
  }, [showContract]);

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

  const handleConfirmSignature = (signatureRequiredMsg: string) => {
    if (!hasDrawnSignature) {
      setSignatureError(signatureRequiredMsg);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setSignatureBase64(dataUrl);
    setSignatureConfirmed(true);
    setSignatureError(null);
  };

  return {
    canvasRef,
    hasDrawnSignature,
    setHasDrawnSignature,
    signatureConfirmed,
    setSignatureConfirmed,
    signatureBase64,
    setSignatureBase64,
    signatureError,
    setSignatureError,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleClearSignature,
    handleConfirmSignature
  };
}
