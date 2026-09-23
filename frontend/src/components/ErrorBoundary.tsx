import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Copy, Check, RotateCcw } from 'lucide-react';

export interface FallbackProps {
  error: Error | null;
  resetError: () => void;
  reloadPage: () => void;
  goHome: () => void;
}

export interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((props: FallbackProps) => ReactNode);
  onReset?: () => void;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  locale?: 'id' | 'en';
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('Uncaught error in React ErrorBoundary:', error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError) {
      const currentKeys = this.props.resetKeys;
      const prevKeys = prevProps.resetKeys;
      if (currentKeys !== undefined || prevKeys !== undefined) {
        const hasChanged =
          currentKeys === undefined ||
          prevKeys === undefined ||
          currentKeys.length !== prevKeys.length ||
          currentKeys.some((val, idx) => val !== prevKeys[idx]);
        if (hasChanged) {
          this.resetError();
        }
      }
    }
  }

  public resetError = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  public handleReload = () => {
    window.location.reload();
  };

  public handleGoHome = () => {
    window.location.href = '/';
  };

  public handleCopyDiagnostics = async () => {
    const errorDetails = [
      `KOSMO Error Report - ${new Date().toISOString()}`,
      `Message: ${this.state.error?.message || 'Unknown error'}`,
      `Stack: ${this.state.error?.stack || 'No stack trace'}`,
      `ComponentStack: ${this.state.errorInfo?.componentStack || 'No component stack'}`
    ].join('\n\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(errorDetails);
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      }
    } catch {
      // Graceful fallback if clipboard write is blocked
    }
  };

  public render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          resetError: this.resetError,
          reloadPage: this.handleReload,
          goHome: this.handleGoHome
        });
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isEn = this.props.locale === 'en';

      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f8fafc',
            padding: '24px'
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
              textAlign: 'center',
              border: '1px solid #e2e8f0'
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#fef2f2',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}
            >
              <AlertTriangle size={32} />
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
              {isEn ? 'Display Issue Encountered' : 'Terjadi Kendala Tampilan'}
            </h2>

            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', lineHeight: 1.6 }}>
              {isEn
                ? 'The application encountered an issue while loading content. Please reload the page or return to the homepage.'
                : 'Aplikasi mengalami masalah saat memuat konten. Silakan muat ulang halaman atau kembali ke beranda.'}
            </p>

            {this.state.error && (
              <div
                style={{
                  backgroundColor: '#f1f5f9',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '12px',
                  color: '#475569',
                  textAlign: 'left',
                  marginBottom: '16px',
                  overflowX: 'auto',
                  fontFamily: 'monospace'
                }}
              >
                {this.state.error.message}
              </div>
            )}

            {/* Diagnostic copy button */}
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={this.handleCopyDiagnostics}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: '#64748b',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  cursor: 'pointer'
                }}
              >
                {this.state.copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                <span>
                  {this.state.copied
                    ? isEn ? 'Diagnostic Details Copied' : 'Detail Masalah Disalin'
                    : isEn ? 'Copy Diagnostic Details' : 'Salin Detail Masalah'}
                </span>
              </button>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {this.props.onReset && (
                <button
                  type="button"
                  onClick={this.resetError}
                  style={{
                    flex: '1 1 100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                    marginBottom: '4px'
                  }}
                >
                  <RotateCcw size={16} />
                  {isEn ? 'Try Again' : 'Coba Lagi'}
                </button>
              )}

              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={16} />
                {isEn ? 'Reload' : 'Muat Ulang'}
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  backgroundColor: '#f8fafc',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                <Home size={16} />
                {isEn ? 'Home' : 'Beranda'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
