import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertCircle, X, RotateCcw } from 'lucide-react';
import { getErrorMessage, isApiError } from '../services/apiClient';

export interface ErrorNotification {
  id: string;
  message: string;
  code?: string;
  details?: unknown;
  timestamp: string;
  onRetry?: () => void;
}

interface ErrorContextValue {
  errors: ErrorNotification[];
  showError: (message: string, options?: { code?: string; details?: unknown; durationMs?: number; onRetry?: () => void }) => string;
  showApiError: (error: unknown, fallbackMessage?: string, onRetry?: () => void) => string;
  dismissError: (id: string) => void;
  clearErrors: () => void;
}

const ErrorContext = createContext<ErrorContextValue | undefined>(undefined);

export const ErrorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [errors, setErrors] = useState<ErrorNotification[]>([]);

  const dismissError = useCallback((id: string) => {
    setErrors((prev) => prev.filter((err) => err.id !== id));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const showError = useCallback(
    (
      message: string,
      options?: { code?: string; details?: unknown; durationMs?: number; onRetry?: () => void }
    ): string => {
      const id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newNotification: ErrorNotification = {
        id,
        message,
        code: options?.code,
        details: options?.details,
        timestamp: new Date().toISOString(),
        onRetry: options?.onRetry
      };

      setErrors((prev) => [...prev, newNotification]);

      const duration = options?.durationMs ?? 6000;
      if (duration > 0) {
        setTimeout(() => {
          dismissError(id);
        }, duration);
      }

      return id;
    },
    [dismissError]
  );

  const showApiError = useCallback(
    (error: unknown, fallbackMessage = 'Terjadi kesalahan pada layanan.', onRetry?: () => void): string => {
      const message = getErrorMessage(error, fallbackMessage);
      const code = isApiError(error) ? error.code : undefined;
      const details = isApiError(error) ? error.details : undefined;
      return showError(message, { code, details, onRetry });
    },
    [showError]
  );

  return (
    <ErrorContext.Provider value={{ errors, showError, showApiError, dismissError, clearErrors }}>
      {children}
      {/* Toast Notification Container */}
      {errors.length > 0 && (
        <div
          role="region"
          aria-label="Notifikasi Galat"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxWidth: '400px',
            width: 'calc(100vw - 48px)',
            pointerEvents: 'none'
          }}
        >
          {errors.map((err) => (
            <div
              key={err.id}
              role="alert"
              style={{
                pointerEvents: 'auto',
                backgroundColor: '#ffffff',
                border: '1px solid #fecaca',
                borderLeft: '4px solid #ef4444',
                borderRadius: '8px',
                padding: '12px 16px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}
            >
              <div style={{ color: '#ef4444', marginTop: '2px', flexShrink: 0 }}>
                <AlertCircle size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {err.code && (
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#dc2626',
                      backgroundColor: '#fef2f2',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      marginBottom: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}
                  >
                    {err.code}
                  </span>
                )}
                <p style={{ margin: 0, fontSize: '13px', color: '#1e293b', fontWeight: 500, lineHeight: 1.4 }}>
                  {err.message}
                </p>
                {err.onRetry && (
                  <button
                    type="button"
                    onClick={() => {
                      err.onRetry?.();
                      dismissError(err.id);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginTop: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#2563eb',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer'
                    }}
                  >
                    <RotateCcw size={12} />
                    Coba Lagi
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissError(err.id)}
                aria-label="Tutup notifikasi"
                style={{
                  color: '#94a3b8',
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ErrorContext.Provider>
  );
};

export function useError(): ErrorContextValue {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
}
