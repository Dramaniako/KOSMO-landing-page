import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import KosCardSkeleton from '../KosCardSkeleton';

describe('KosCardSkeleton Component', () => {
  it('renders card skeleton container with pulse animation and skeleton classes', () => {
    const { container } = render(<KosCardSkeleton />);
    const card = container.firstChild as HTMLElement;

    expect(card).toBeInTheDocument();
    expect(card).toHaveClass('animate-pulse');
    expect(card).toHaveClass('kos-card-skeleton');
  });

  it('renders all skeleton layout elements for image, text, and actions', () => {
    const { container } = render(<KosCardSkeleton />);

    // Check placeholder elements with bg-slate-200
    const skeletonElements = container.querySelectorAll('.bg-slate-200');
    expect(skeletonElements.length).toBeGreaterThanOrEqual(8);
  });
});
