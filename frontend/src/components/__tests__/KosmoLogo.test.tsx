import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import KosmoLogo from '../KosmoLogo';

describe('KosmoLogo Component', () => {
  it('renders the custom KOSMO SVG emblem and default brand title', () => {
    render(<KosmoLogo subtitle="BALI CO-LIVING" />);

    const logoContainer = screen.getByTestId('kosmo-logo');
    expect(logoContainer).toBeInTheDocument();

    const svgElement = screen.getByRole('img', { name: /KOSMO Logo/i });
    expect(svgElement).toBeInTheDocument();
    expect(svgElement.tagName.toLowerCase()).toBe('svg');

    expect(screen.getByText('KOSMO')).toBeInTheDocument();
    expect(screen.getByText('BALI CO-LIVING')).toBeInTheDocument();
  });

  it('renders role badge variants for Tenant, Landlord, and Admin sidebars', () => {
    const { rerender } = render(<KosmoLogo title="KOSMO" badgeText="Landlord" variant="primary" />);
    expect(screen.getByText('Landlord')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /KOSMO Landlord Logo/i })).toBeInTheDocument();

    rerender(<KosmoLogo title="KOSMO" badgeText="Admin" variant="danger" />);
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /KOSMO Admin Logo/i })).toBeInTheDocument();
  });

  it('can render emblem-only mode when showText is false', () => {
    render(<KosmoLogo showText={false} title="KOSMO Portal" size={56} />);
    const svgElement = screen.getByRole('img', { name: /KOSMO Portal Logo/i });
    expect(svgElement).toBeInTheDocument();
    expect(svgElement).toHaveAttribute('width', '56');
    expect(svgElement).toHaveAttribute('height', '56');
    expect(screen.queryByText('KOSMO Portal')).not.toBeInTheDocument();
  });
});
