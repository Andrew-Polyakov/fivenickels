import * as React from 'react';

import type { BentoArticleCarouselFrame } from '../components/shadcn-space/blocks/bento-grid-01/BentoArticleCarouselTile';

export type SitemapArticleResult = {
  id?: number;
  title: string;
  url?: string;
  imageUrl?: string | null;
  authorName?: string | null;
  publishedAtIso?: string;
  sourceLabel?: string;
  categoryName?: string;
};

const frameCache = new Map<string, BentoArticleCarouselFrame[]>();

export const SITEMAP_CAROUSEL_MIN_WIDTH = 300;
export const SITEMAP_MILLER_MAX_COLS = 3;
export const SITEMAP_MILLER_COL_WIDTH = 188;
export const SITEMAP_MILLER_SEP_ESTIMATE = 1;
export const SITEMAP_MILLER_BAND_LEEWAY = 24;
export const SITEMAP_STACK_HYSTERESIS = 80;

/** Reserved Miller band width (always 3 columns + leeway). */
export function estimateMillerBandWidth(): number {
  return (
    SITEMAP_MILLER_MAX_COLS * SITEMAP_MILLER_COL_WIDTH
    + (SITEMAP_MILLER_MAX_COLS - 1) * SITEMAP_MILLER_SEP_ESTIMATE
    + SITEMAP_MILLER_BAND_LEEWAY
  );
}

/** @deprecated Use estimateMillerBandWidth for layout; kept for column-count tests. */
export function estimateMillerWidth(numCols: number): number {
  if (numCols <= 0) return 0;
  const cols = Math.min(numCols, SITEMAP_MILLER_MAX_COLS);
  return cols * SITEMAP_MILLER_COL_WIDTH + (cols - 1) * SITEMAP_MILLER_SEP_ESTIMATE;
}

/** Layout-independent stack decision with hysteresis to avoid flicker near threshold. */
export function shouldStackSitemapLayout(
  containerWidth: number,
  currentlyStacked: boolean,
  carouselMin = SITEMAP_CAROUSEL_MIN_WIDTH,
): boolean {
  if (containerWidth <= 0) return currentlyStacked;
  const required = estimateMillerBandWidth() + carouselMin;
  if (currentlyStacked) {
    return required + SITEMAP_STACK_HYSTERESIS > containerWidth;
  }
  return required > containerWidth;
}

export function isNumericTermId(id: string): boolean {
  return /^\d+$/.test(id);
}

/** Deepest numeric Miller-column selection used for the sitemap article preview. */
export function getActiveSitemapTermId(path: string[]): string | null {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const id = path[i];
    if (isNumericTermId(id)) return id;
  }
  return null;
}

/** Initial path: first numeric root when available, otherwise the first root. */
export function getDefaultSitemapPath(roots: { id: string }[]): string[] {
  if (roots.length === 0) return [];
  const numeric = roots.find(r => isNumericTermId(r.id));
  return [numeric?.id ?? roots[0].id];
}

export function buildCategoryCarouselSearchUrl(termId: string, limit = 5): string {
  const q = new URLSearchParams({
    random: '1',
    limit: String(limit),
    section_term_id: termId,
  });
  return `/inline/article/search/?${q.toString()}`;
}

export function articleResultToCarouselFrame(r: SitemapArticleResult): BentoArticleCarouselFrame {
  return {
    kind: 'article',
    title: r.title,
    href: r.url,
    imageUrl: r.imageUrl ?? undefined,
    sourceLabel: r.sourceLabel ?? r.authorName ?? undefined,
    publishedAtIso: r.publishedAtIso,
    categoryName: r.categoryName,
  };
}

export async function fetchCategoryCarouselFrames(
  termId: string,
  limit = 5,
): Promise<BentoArticleCarouselFrame[]> {
  if (!isNumericTermId(termId)) return [];

  const cacheKey = `${termId}:${limit}`;
  const cached = frameCache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(buildCategoryCarouselSearchUrl(termId, limit), {
      credentials: 'same-origin',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: SitemapArticleResult[] };
    const frames = (data.results ?? []).map(articleResultToCarouselFrame);
    frameCache.set(cacheKey, frames);
    return frames;
  } catch {
    return [];
  }
}

export function useSitemapCarouselFrames(termId: string | null, limit = 5): {
  frames: BentoArticleCarouselFrame[];
  loading: boolean;
} {
  const [frames, setFrames] = React.useState<BentoArticleCarouselFrame[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!termId || !isNumericTermId(termId)) {
      setFrames([]);
      setLoading(false);
      return;
    }

    const cacheKey = `${termId}:${limit}`;
    const cached = frameCache.get(cacheKey);
    if (cached) {
      setFrames(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFrames([]);
    void fetchCategoryCarouselFrames(termId, limit).then(result => {
      if (cancelled) return;
      setFrames(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [termId, limit]);

  return { frames, loading };
}
