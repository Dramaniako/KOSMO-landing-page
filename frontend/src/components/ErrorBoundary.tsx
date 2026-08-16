import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React ErrorBoundary:', error, errorInfo);
  }

  public handleReload = () => {
    window.location.reload();
  };

  public handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: '24px' }}>
          <div style={{ maxWidth: '480px', width: '100%', backgroundColor: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <AlertTriangle size={32} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>Terjadi Kendala Tampilan</h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', lineHeight: 1.6 }}>
              Aplikasi mengalami masalah saat memuat konten. Silakan muat ulang halaman atau kembali ke beranda.
            </p>
            {this.state.error && (
              <div style={{ backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#475569', textAlign: 'left', marginBottom: '24px', overflowX: 'auto', fontFamily: 'monospace' }}>
                {this.state.error.message}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={this.handleReload}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
              >
                <RefreshCw size={16} />
                Muat Ulang
              </button>
              <button
                onClick={this.handleGoHome}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
              >
                <Home size={16} />
                Beranda
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
