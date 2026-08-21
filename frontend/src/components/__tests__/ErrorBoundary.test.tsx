import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

// Helper component that throws an error conditionally
const ProblemChild = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test rendering crash error');
  }
  return <div data-testid="child-content">Normal Content</div>;
};

describe('ErrorBoundary Component', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Suppress console.error from ErrorBoundary during test execution
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Normal Content')).toBeInTheDocument();
  });

  it('catches render error and displays user-friendly fallback UI', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Terjadi Kendala Tampilan')).toBeInTheDocument();
    expect(
      screen.getByText(/Aplikasi mengalami masalah saat memuat konten/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Test rendering crash error')).toBeInTheDocument();
    expect(screen.getByText('Muat Ulang')).toBeInTheDocument();
    expect(screen.getByText('Beranda')).toBeInTheDocument();
  });

  it('triggers page reload when "Muat Ulang" button is clicked', () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { reload: reloadMock, href: '' }
    });

    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const reloadBtn = screen.getByRole('button', { name: /muat ulang/i });
    fireEvent.click(reloadBtn);

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('redirects to home when "Beranda" button is clicked', () => {
    const locationMock = { reload: vi.fn(), href: '' };
    Object.defineProperty(window, 'location', {
      writable: true,
      value: locationMock
    });

    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const homeBtn = screen.getByRole('button', { name: /beranda/i });
    fireEvent.click(homeBtn);

    expect(locationMock.href).toBe('/');
  });
});
