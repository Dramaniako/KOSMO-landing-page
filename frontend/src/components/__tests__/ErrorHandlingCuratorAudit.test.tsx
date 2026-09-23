import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';
import { ErrorProvider, useError } from '../../context/ErrorContext';
import { ApiError, getErrorMessage, isNetworkError, isAuthError, requestWithRetry } from '../../services/apiClient';

// Helper component that throws on demand
const CrashChild: React.FC<{ shouldCrash: boolean; msg?: string }> = ({ shouldCrash, msg = 'Simulated UI Crash' }) => {
  if (shouldCrash) {
    throw new Error(msg);
  }
  return <div data-testid="healthy-ui">Healthy Component</div>;
};

// Helper component to test useError hook
const ErrorTriggerComponent: React.FC = () => {
  const { showError, showApiError, dismissError, errors } = useError();
  return (
    <div>
      <button
        onClick={() => showError('Peringatan: Gagal memuat data', { code: 'DATA_FETCH_FAILED' })}
      >
        Trigger Custom Error
      </button>
      <button
        onClick={() => {
          const apiErr = new ApiError('Sesi kadaluarsa', 401, { code: 'AUTH_TOKEN_EXPIRED' });
          showApiError(apiErr);
        }}
      >
        Trigger Api Error
      </button>
      <button
        onClick={() => {
          if (errors.length > 0) dismissError(errors[0].id);
        }}
      >
        Dismiss First Error
      </button>
      <div data-testid="error-count">{errors.length}</div>
    </div>
  );
};

describe('🛡️ Error Handling Curator Audit Suite (Frontend)', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    console.error = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.useRealTimers();
  });

  // =========================================================================
  // PILLAR 1: ErrorBoundary Custom Fallback & Recovery
  // =========================================================================
  it('ErrorBoundary: renders custom fallback with recovery reset callback and resetKeys', () => {
    let resetCalled = false;
    const handleReset = () => {
      resetCalled = true;
    };

    const { rerender } = render(
      <ErrorBoundary
        onReset={handleReset}
        resetKeys={[true]}
        fallback={({ error, resetError }) => (
          <div data-testid="custom-fallback">
            <span>Error: {error?.message}</span>
            <button onClick={resetError}>Recover State</button>
          </div>
        )}
      >
        <CrashChild shouldCrash={true} msg="Crash inside container" />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.getByText(/Crash inside container/)).toBeInTheDocument();

    const recoverBtn = screen.getByRole('button', { name: /recover state/i });
    fireEvent.click(recoverBtn);
    expect(resetCalled).toBe(true);

    // When resetKeys change and component no longer throws, renders healthy UI
    rerender(
      <ErrorBoundary onReset={handleReset} resetKeys={[false]}>
        <CrashChild shouldCrash={false} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('healthy-ui')).toBeInTheDocument();
  });

  it('ErrorBoundary: supports bilingual English locale rendering', () => {
    render(
      <ErrorBoundary locale="en">
        <CrashChild shouldCrash={true} msg="English crash message" />
      </ErrorBoundary>
    );

    expect(screen.getByText('Display Issue Encountered')).toBeInTheDocument();
    expect(screen.getByText(/The application encountered an issue while loading content/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument();
  });

  it('ErrorBoundary: invokes onError telemetry callback with error info', () => {
    const errorListener = vi.fn();

    render(
      <ErrorBoundary onError={errorListener}>
        <CrashChild shouldCrash={true} msg="Telemetry test crash" />
      </ErrorBoundary>
    );

    expect(errorListener).toHaveBeenCalledTimes(1);
    expect(errorListener.mock.calls[0][0].message).toBe('Telemetry test crash');
  });

  // =========================================================================
  // PILLAR 2: ErrorContext & Toast Notifications
  // =========================================================================
  it('ErrorProvider: renders dismissible toast notification with error code', () => {
    render(
      <ErrorProvider>
        <ErrorTriggerComponent />
      </ErrorProvider>
    );

    expect(screen.getByTestId('error-count').textContent).toBe('0');

    // Trigger error
    fireEvent.click(screen.getByRole('button', { name: /trigger custom error/i }));
    expect(screen.getByText('Peringatan: Gagal memuat data')).toBeInTheDocument();
    expect(screen.getByText('DATA_FETCH_FAILED')).toBeInTheDocument();
    expect(screen.getByTestId('error-count').textContent).toBe('1');

    // Dismiss error via close button
    const closeBtn = screen.getByRole('button', { name: /tutup notifikasi/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Peringatan: Gagal memuat data')).not.toBeInTheDocument();
    expect(screen.getByTestId('error-count').textContent).toBe('0');
  });

  it('ErrorProvider: maps ApiError attributes (message, code) into toast', () => {
    render(
      <ErrorProvider>
        <ErrorTriggerComponent />
      </ErrorProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger api error/i }));
    expect(screen.getByText('Sesi kadaluarsa')).toBeInTheDocument();
    expect(screen.getByText('AUTH_TOKEN_EXPIRED')).toBeInTheDocument();
  });

  // =========================================================================
  // PILLAR 3: ApiClient Error Utilities & Retry Resilience
  // =========================================================================
  it('ApiClient: parses RFC 7807 structured attributes on ApiError', () => {
    const errorData = {
      code: 'PROPERTY_NOT_FOUND',
      requestId: 'req-test-1234',
      timestamp: '2026-09-23T10:00:00Z',
      details: { propertyId: 'prop-unknown' }
    };
    const apiErr = new ApiError('Property not found', 404, errorData);

    expect(apiErr.code).toBe('PROPERTY_NOT_FOUND');
    expect(apiErr.requestId).toBe('req-test-1234');
    expect(apiErr.timestamp).toBe('2026-09-23T10:00:00Z');
    expect(apiErr.details).toEqual({ propertyId: 'prop-unknown' });
    expect(getErrorMessage(apiErr)).toBe('Property not found');
    expect(isAuthError(apiErr)).toBe(false);
  });

  it('ApiClient: classifies network and auth error types accurately', () => {
    const netErr = new TypeError('Failed to fetch');
    expect(isNetworkError(netErr)).toBe(true);

    const authErr = new ApiError('Unauthorized', 401);
    expect(isAuthError(authErr)).toBe(true);
    expect(isNetworkError(authErr)).toBe(false);

    const forbiddenErr = new ApiError('Forbidden', 403);
    expect(isAuthError(forbiddenErr)).toBe(true);
  });
});
