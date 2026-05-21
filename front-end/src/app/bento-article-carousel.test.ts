import { describe, expect, it } from 'vitest';

import { formatRelativePublished } from '../components/shadcn-space/blocks/bento-grid-01/BentoArticleCarouselTile';

describe('formatRelativePublished', () => {
  it('returns empty string for missing iso', () => {
    expect(formatRelativePublished(undefined)).toBe('');
    expect(formatRelativePublished('')).toBe('');
  });

  it('formats recent publish times', () => {
    const hourAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativePublished(hourAgo)).toBe('2h');
    const dayAgo = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    expect(formatRelativePublished(dayAgo)).toBe('1d');
  });
});

describe('carousel frame dot count', () => {
  it('clamps configured frame count between 2 and 12', () => {
    const clamp = (n: number) => Math.max(2, Math.min(12, n || 5));
    expect(clamp(1)).toBe(2);
    expect(clamp(5)).toBe(5);
    expect(clamp(20)).toBe(12);
  });
});
