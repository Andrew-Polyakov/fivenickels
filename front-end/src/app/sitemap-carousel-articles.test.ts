import { describe, expect, it } from 'vitest';

import {
  articleResultToCarouselFrame,
  buildCategoryCarouselSearchUrl,
  estimateMillerBandWidth,
  estimateMillerWidth,
  getActiveSitemapTermId,
  getDefaultSitemapPath,
  isNumericTermId,
  shouldStackSitemapLayout,
  SITEMAP_CAROUSEL_MIN_WIDTH,
  SITEMAP_MILLER_COL_WIDTH,
  SITEMAP_STACK_HYSTERESIS,
} from './sitemap-carousel-articles';

describe('isNumericTermId', () => {
  it('accepts numeric taxonomy term ids', () => {
    expect(isNumericTermId('42')).toBe(true);
    expect(isNumericTermId('0')).toBe(true);
  });

  it('rejects hardcoded and non-numeric ids', () => {
    expect(isNumericTermId('hardcoded:brokers')).toBe(false);
    expect(isNumericTermId('abc')).toBe(false);
    expect(isNumericTermId('12abc')).toBe(false);
  });
});

describe('getActiveSitemapTermId', () => {
  it('returns the deepest numeric id in the Miller path', () => {
    expect(getActiveSitemapTermId(['10', '20', '30'])).toBe('30');
    expect(getActiveSitemapTermId(['42'])).toBe('42');
  });

  it('returns null for empty path or all-non-numeric path', () => {
    expect(getActiveSitemapTermId([])).toBeNull();
    expect(getActiveSitemapTermId(['hardcoded:brokers'])).toBeNull();
  });

  it('falls back to the nearest numeric ancestor in the path', () => {
    expect(getActiveSitemapTermId(['10', 'hardcoded:brokers'])).toBe('10');
  });
});

describe('getDefaultSitemapPath', () => {
  it('prefers the first numeric root', () => {
    expect(
      getDefaultSitemapPath([
        { id: 'hardcoded:brokers' },
        { id: '99' },
        { id: '100' },
      ]),
    ).toEqual(['99']);
  });

  it('falls back to the first root when none are numeric', () => {
    expect(getDefaultSitemapPath([{ id: 'hardcoded:brokers' }])).toEqual([
      'hardcoded:brokers',
    ]);
  });

  it('returns an empty path when there are no roots', () => {
    expect(getDefaultSitemapPath([])).toEqual([]);
  });
});

describe('buildCategoryCarouselSearchUrl', () => {
  it('builds random category article search url', () => {
    const url = buildCategoryCarouselSearchUrl('99', 5);
    expect(url).toBe('/inline/article/search/?random=1&limit=5&section_term_id=99');
  });

  it('respects custom limit', () => {
    const url = buildCategoryCarouselSearchUrl('7', 3);
    expect(url).toContain('limit=3');
    expect(url).toContain('section_term_id=7');
  });
});

describe('estimateMillerWidth', () => {
  it('returns zero for non-positive column counts', () => {
    expect(estimateMillerWidth(0)).toBe(0);
    expect(estimateMillerWidth(-1)).toBe(0);
  });

  it('estimates width from column count and separators', () => {
    expect(estimateMillerWidth(1)).toBe(SITEMAP_MILLER_COL_WIDTH);
    expect(estimateMillerWidth(3)).toBe(SITEMAP_MILLER_COL_WIDTH * 3 + 2);
  });

  it('caps at the maximum Miller column count', () => {
    expect(estimateMillerWidth(4)).toBe(SITEMAP_MILLER_COL_WIDTH * 3 + 2);
  });
});

describe('estimateMillerBandWidth', () => {
  it('reserves width for three columns plus leeway', () => {
    expect(estimateMillerBandWidth()).toBe(SITEMAP_MILLER_COL_WIDTH * 3 + 2 + 24);
  });
});

describe('shouldStackSitemapLayout', () => {
  it('stacks when Miller band plus carousel min exceeds container width', () => {
    expect(shouldStackSitemapLayout(700, false)).toBe(true);
  });

  it('does not stack when there is enough room', () => {
    expect(shouldStackSitemapLayout(1200, false)).toBe(false);
  });

  it('requires extra width before unstacking when already stacked', () => {
    const required = estimateMillerBandWidth() + SITEMAP_CAROUSEL_MIN_WIDTH;
    expect(shouldStackSitemapLayout(required, true)).toBe(true);
    expect(shouldStackSitemapLayout(required + SITEMAP_STACK_HYSTERESIS, true)).toBe(false);
  });
});

describe('articleResultToCarouselFrame', () => {
  it('maps article search results to carousel frames', () => {
    const frame = articleResultToCarouselFrame({
      title: 'Market wrap',
      url: '/articles/market-wrap/',
      imageUrl: 'https://example.com/img.jpg',
      sourceLabel: 'Reuters',
      publishedAtIso: '2026-05-24T12:00:00Z',
      categoryName: 'Markets',
    });
    expect(frame).toEqual({
      kind: 'article',
      title: 'Market wrap',
      href: '/articles/market-wrap/',
      imageUrl: 'https://example.com/img.jpg',
      sourceLabel: 'Reuters',
      publishedAtIso: '2026-05-24T12:00:00Z',
      categoryName: 'Markets',
    });
  });

  it('falls back to authorName for sourceLabel', () => {
    const frame = articleResultToCarouselFrame({
      title: 'Brief',
      url: '/articles/brief/',
      authorName: 'Jane Doe',
    });
    expect(frame.sourceLabel).toBe('Jane Doe');
  });
});
