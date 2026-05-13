import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Separator as UiSeparator } from '../components/ui/separator';
import { cn } from '../lib/utils';
import {
  packCarouselSlides,
  type CarouselCardViewModel,
} from './carousel-slide-packing';

// ── Shared types ──────────────────────────────────────────────────────────────

type ContentSourceMode = 'random' | 'specific_article' | 'tagged_with' | 'priority_articles';
type ContentSourceConfig = {
  mode: ContentSourceMode;
  specificArticleId?: number | null;
  specificArticleTitle?: string;
  specificArticleUrl?: string;
  tagIds?: number[];
};

export type ArticleCardPayload =
  | {
      kind: 'article';
      title: string;
      href: string;
      excerpt: string;
      imageUrl: string;
      tags?: string[];
      authorName?: string;
      publishedAt?: string;
      catalyst?: 'Bullish' | 'Bearish' | '';
      sourceConfig?: ContentSourceConfig;
    }
  | { kind: 'empty'; sourceConfig?: ContentSourceConfig }
  | { kind: 'stub'; message: string; sourceConfig?: ContentSourceConfig }
  | {
      kind: 'layout';
      variant: 'biggies' | 'feature' | 'headline' | 'carousel' | 'free';
      title: string;
      imageUrl?: string;
      imageMode?: 'half' | 'third' | 'wide' | 'square';
      authorName?: string;
      avatarUrl?: string;
      carouselHeader?: string;
      subcards?: string[];
      infiniteScroll?: boolean;
      widthPx?: number;
      heightPx?: number;
      freeX?: number;
      freeY?: number;
      sourceConfig?: ContentSourceConfig;
    };

type RowItem =
  | { type: 'card'; card: ArticleCardPayload }
  | { type: 'separator'; orientation: 'horizontal' | 'vertical' };

type LayoutRow =
  | { kind: 'row'; items: RowItem[]; columnSizes?: number[] }
  | { kind: 'separator'; orientation: 'horizontal' | 'vertical' };

export type CardLayoutPayload = {
  rows: LayoutRow[];
  layoutVersion?: number;
};

export type LayoutPresetId = 'twin' | 'three' | 'quattro' | 'grid-2x4' | 'recent-articles';

/** Layout version used by the old batched card_layout segments (kept for reference). */
export const TAXONOMY_MASTER_LAYOUT_VERSION = 2;
export const BENTO_LAYOUT_VERSION = 3;

// ── Preset helpers (used by Bento2) ──────────────────────────────────────────

function stubRowItem(message: string): RowItem {
  return { type: 'card', card: { kind: 'stub', message } };
}

function stubRowWithColumns(panelCount: number, startLabel: number): LayoutRow {
  const items: RowItem[] = [];
  for (let i = 0; i < panelCount; i++) {
    if (i > 0) items.push({ type: 'separator', orientation: 'vertical' });
    items.push(stubRowItem(`Panel ${startLabel + i}`));
  }
  return { kind: 'row', items };
}

function recentArticlesPresetRows(): LayoutRow[] {
  const heroItem: RowItem = {
    type: 'card',
    card: { kind: 'stub', message: 'Hero article', sourceConfig: { mode: 'priority_articles' } },
  };
  const smallItem = (idx: number): RowItem => ({
    type: 'card',
    card: { kind: 'stub', message: `Recent ${idx}`, sourceConfig: { mode: 'random' } },
  });
  return [
    {
      kind: 'row',
      items: [
        heroItem,
        { type: 'separator', orientation: 'vertical' },
        smallItem(1),
        { type: 'separator', orientation: 'vertical' },
        smallItem(2),
      ],
      columnSizes: [50, 25, 25],
    },
    { kind: 'separator', orientation: 'horizontal' },
    {
      kind: 'row',
      items: [smallItem(3), { type: 'separator', orientation: 'vertical' }, smallItem(4)],
    },
  ];
}

export function presetToRows(preset: LayoutPresetId): LayoutRow[] {
  switch (preset) {
    case 'twin':
      return [stubRowWithColumns(2, 1)];
    case 'three':
      return [stubRowWithColumns(3, 1)];
    case 'quattro':
      return [stubRowWithColumns(4, 1)];
    case 'grid-2x4':
      return [
        stubRowWithColumns(4, 1),
        { kind: 'separator', orientation: 'horizontal' },
        stubRowWithColumns(4, 5),
      ];
    case 'recent-articles':
      return recentArticlesPresetRows();
  }
}

// ── ArticleCardView ───────────────────────────────────────────────────────────

function catalystCardClass(catalyst?: string): string | null {
  if (catalyst === 'Bullish') return 'scn-article-card--bullish';
  if (catalyst === 'Bearish') return 'scn-article-card--bearish';
  return null;
}

function catalystIconSrc(catalyst?: string): string | null {
  if (catalyst === 'Bullish') return '/static/images/bull.png';
  if (catalyst === 'Bearish') return '/static/images/bear.png';
  return null;
}

export function ArticleCardView({
  data,
  onDelete,
  enableMasterPane,
  onCarouselHeaderChange,
}: {
  data: ArticleCardPayload;
  onDelete?: () => void;
  enableMasterPane?: boolean;
  onCarouselHeaderChange?: (nextHeader: string) => void;
}): React.JSX.Element {
  void onDelete;

  if (data.kind === 'empty') {
    return (
      <Card className="scn-article-card scn-article-card--empty">
        <CardContent>
          <p className="scn-article-card__empty">No article.</p>
        </CardContent>
      </Card>
    );
  }
  if (data.kind === 'stub') {
    return (
      <Card className="scn-article-card scn-article-card--stub">
        <CardHeader>
          <CardTitle>Top viewed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="scn-article-card__excerpt">{data.message}</p>
        </CardContent>
      </Card>
    );
  }
  if (data.kind === 'layout') {
    const cls = `scn-card-variant scn-card-variant--${data.variant}`;
    if (data.variant === 'carousel') {
      const subcards = (data.subcards ?? ['Card 1', 'Card 2', 'Card 3', 'Card 4', 'Card 5']).slice(0, 5);
      const infiniteScroll = Boolean(data.infiniteScroll);
      const loopSubcards = infiniteScroll ? [...subcards, ...subcards] : subcards;
      return (
        <Card className={cn('scn-article-card', cls)}>
          <CardContent>
            {enableMasterPane ? (
              <input
                className="scn-carousel-header-input"
                value={data.carouselHeader ?? 'Subsection header'}
                onChange={(e) => onCarouselHeaderChange?.(e.currentTarget.value)}
              />
            ) : (
              <h3 className="scn-carousel-header">{data.carouselHeader ?? 'Subsection header'}</h3>
            )}
            <div className={cn('scn-carousel-subcards', infiniteScroll && 'scn-carousel-subcards--infinite')}>
              <div className="scn-carousel-subcards__track">
                {loopSubcards.map((s, idx) => (
                  <article
                    key={`${s}-${idx}`}
                    className="scn-carousel-subcard"
                    aria-hidden={infiniteScroll && idx >= subcards.length ? true : undefined}
                  >
                    {s}
                  </article>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className={cn('scn-article-card', cls)}>
        {(data.variant === 'biggies' || data.variant === 'feature') && data.imageUrl ? (
          <div className={cn('scn-article-card__media', data.imageMode === 'square' ? 'scn-media--square' : null)}>
            <img src={data.imageUrl} alt="" className="scn-article-card__img" loading="lazy" />
          </div>
        ) : null}
        <CardHeader>
          <CardTitle>{data.title}</CardTitle>
        </CardHeader>
        {data.variant === 'headline' ? (
          <CardContent>
            <div className="scn-headline-meta">
              <img className="scn-headline-avatar" src={data.avatarUrl || ''} alt="" />
              <span>{data.authorName || 'Author'}</span>
            </div>
          </CardContent>
        ) : null}
      </Card>
    );
  }
  const tags = (data.tags ?? []).slice(0, 5);
  const sentimentIconSrc = catalystIconSrc(data.catalyst);
  const body = (
    <>
      {data.imageUrl ? (
        <div className="scn-article-card__media">
          <img src={data.imageUrl} alt="" className="scn-article-card__img" loading="lazy" />
        </div>
      ) : null}
      <CardHeader>
        {tags.length > 0 || sentimentIconSrc ? (
          <div className="scn-article-card__tags">
            {sentimentIconSrc ? (
              <img
                src={sentimentIconSrc}
                alt=""
                width={32}
                height={32}
                className="scn-catalyst-icon scn-article-card__catalyst-icon"
                aria-hidden="true"
              />
            ) : null}
            {tags.map((tag) => (
              <span key={tag} className="scn-article-card__tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <CardTitle>{data.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.excerpt ? <p className="scn-article-card__excerpt">{data.excerpt}</p> : null}
      </CardContent>
      <div className="scn-article-card__footer-meta">
        <span className="scn-article-card__author">{data.authorName || 'Fivenickels Editorial'}</span>
        {data.publishedAt?.trim() ? (
          <time className="scn-article-card__published" dateTime={data.publishedAt}>
            {data.publishedAt}
          </time>
        ) : null}
      </div>
    </>
  );
  const catalystClass = catalystCardClass(data.catalyst);
  if (data.href) {
    return (
      <Card className={cn('scn-article-card', 'scn-article-card--linked', catalystClass)}>
        <a className="scn-article-card__shell" href={data.href}>
          {body}
        </a>
      </Card>
    );
  }
  return (
    <Card className={cn('scn-article-card', catalystClass)}>
      {body}
    </Card>
  );
}

// ── Adaptive Recent Articles Block ────────────────────────────────────────────

type RecentArticlesMode = 'hero-grid' | 'rows';

const RECENT_SMALL_MIN_PX = 220;
const RECENT_HERO_GRID_THRESHOLD_PX = RECENT_SMALL_MIN_PX * 3 + 48;

function useRecentArticlesMode(
  containerRef: React.RefObject<HTMLElement | null>
): RecentArticlesMode {
  const [mode, setMode] = React.useState<RecentArticlesMode>('hero-grid');
  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const check = () => {
      const w = el.getBoundingClientRect().width;
      setMode(w >= RECENT_HERO_GRID_THRESHOLD_PX ? 'hero-grid' : 'rows');
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);
  return mode;
}

export type RecentArticlesPayload = {
  cards: ArticleCardPayload[];
};

export function RecentArticlesBlock({
  payload,
}: {
  payload: RecentArticlesPayload;
}): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mode = useRecentArticlesMode(containerRef);

  const cards = payload.cards;
  const hero = cards[0] ?? null;
  const companions = cards.slice(1);

  if (!hero) {
    return <div className="scn-recent-articles scn-recent-articles--empty" ref={containerRef} />;
  }

  if (mode === 'rows') {
    return (
      <div className="scn-recent-articles scn-recent-articles--rows" ref={containerRef}>
        <div className="scn-recent-articles__hero">
          <ArticleCardView data={hero} />
        </div>
        <div className="scn-recent-articles__grid">
          {companions.map((card, i) => (
            <div key={i} className="scn-recent-articles__small">
              <ArticleCardView data={card} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="scn-recent-articles scn-recent-articles--hero-grid" ref={containerRef}>
      <div className="scn-recent-articles__hero">
        <ArticleCardView data={hero} />
      </div>
      {companions.length > 0 && (
        <div className="scn-recent-articles__grid">
          {companions.map((card, i) => (
            <div key={i} className="scn-recent-articles__small">
              <ArticleCardView data={card} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared mount infrastructure ───────────────────────────────────────────────

function readPayloadScript(jsonId: string): CardLayoutPayload | ArticleCardPayload | null {
  const el = document.getElementById(jsonId);
  if (!el?.textContent?.trim()) {
    return null;
  }
  try {
    return JSON.parse(el.textContent) as CardLayoutPayload | ArticleCardPayload;
  } catch {
    return null;
  }
}

const layoutRoots = new WeakMap<HTMLElement, Root>();

// ── Tile Carousel ─────────────────────────────────────────────────────────────

type TileCarouselPackedSlide =
  | { kind: 'single'; key: string; payload: ArticleCardPayload }
  | { kind: 'stack'; key: string; payloads: [ArticleCardPayload, ArticleCardPayload] };

function articlePayloadToCarouselViewModel(card: ArticleCardPayload, index: number): CarouselCardViewModel | null {
  if (card.kind !== 'article') {
    return null;
  }
  return {
    key: `tile-article-${index}`,
    imageUrl: card.imageUrl || null,
    tags: card.tags ?? [],
    title: card.title,
    excerpt: card.excerpt,
    url: card.href,
    authorName: card.authorName,
    publishedAt: card.publishedAt,
  };
}

function packArticleCardSlides(cards: ArticleCardPayload[]): TileCarouselPackedSlide[] {
  const entries = cards
    .map((card, index) => ({
      payload: card,
      view: articlePayloadToCarouselViewModel(card, index),
    }))
    .filter((entry): entry is { payload: ArticleCardPayload; view: CarouselCardViewModel } => entry.view !== null);
  const packed = packCarouselSlides(entries.map((entry) => entry.view));

  return packed.map((slide) => {
    if (slide.kind === 'single') {
      const index = entries.findIndex((entry) => entry.view.key === slide.card.key);
      return {
        kind: 'single',
        key: slide.key,
        payload: entries[index]?.payload ?? cards[index] ?? cards[0],
      };
    }
    const first = entries.find((entry) => entry.view.key === slide.cards[0].key);
    const second = entries.find((entry) => entry.view.key === slide.cards[1].key);
    return {
      kind: 'stack',
      key: slide.key,
      payloads: [
        first?.payload ?? cards[0],
        second?.payload ?? cards[1],
      ] as [ArticleCardPayload, ArticleCardPayload],
    };
  });
}

function readTileCarouselPayloads(track: HTMLElement): ArticleCardPayload[] {
  const payloads: ArticleCardPayload[] = [];
  track.querySelectorAll<HTMLElement>('[data-shadcn-article-card]').forEach((host) => {
    const jsonId = host.dataset['layoutJsonId'];
    if (!jsonId) {
      return;
    }
    const parsed = readPayloadScript(jsonId);
    if (parsed && 'kind' in parsed) {
      payloads.push(parsed);
    }
  });
  return payloads;
}

function TileCarouselSlides({ cards }: { cards: ArticleCardPayload[] }): React.JSX.Element {
  const packedSlides = React.useMemo(() => packArticleCardSlides(cards), [cards]);

  return (
    <>
      {packedSlides.map((slide) => (
        slide.kind === 'single' ? (
          <div key={slide.key} className="tile-carousel__cell">
            <div className="tile-carousel__cell-inner">
              <ArticleCardView data={slide.payload} />
            </div>
          </div>
        ) : (
          <div key={slide.key} className="tile-carousel__cell tile-carousel__cell--stack">
            <div className="tile-carousel__stack">
              {slide.payloads.map((payload, stackIndex) => (
                <div key={`${slide.key}-${stackIndex}`} className="tile-carousel__cell-inner">
                  <ArticleCardView data={payload} />
                </div>
              ))}
            </div>
          </div>
        )
      ))}
    </>
  );
}

// ── Mount functions ───────────────────────────────────────────────────────────

export function mountSimilarArticleCarousels(): void {
  document.querySelectorAll<HTMLElement>('.tile-carousel[data-carousel]').forEach((carousel) => {
    const track = carousel.querySelector<HTMLElement>('[data-carousel-track]');
    if (!track || track.dataset['shadcnTileCarouselBound'] === '1') {
      return;
    }
    const payloads = readTileCarouselPayloads(track);
    if (payloads.length === 0) {
      return;
    }
    track.dataset['shadcnTileCarouselBound'] = '1';
    let root = layoutRoots.get(track);
    if (!root) {
      root = createRoot(track);
      layoutRoots.set(track, root);
    }
    root.render(<TileCarouselSlides cards={payloads} />);
  });
}

export function mountRecentArticlesBlocks(): void {
  document.querySelectorAll<HTMLElement>('[data-recent-articles-block]').forEach((host) => {
    if (host.dataset['recentArticlesBound'] === '1') return;
    const jsonId = host.dataset['layoutJsonId'];
    if (!jsonId) return;
    const el = document.getElementById(jsonId);
    if (!el?.textContent?.trim()) return;
    let parsed: RecentArticlesPayload;
    try {
      parsed = JSON.parse(el.textContent) as RecentArticlesPayload;
    } catch {
      return;
    }
    if (!parsed || !Array.isArray(parsed.cards)) return;
    host.dataset['recentArticlesBound'] = '1';
    let root = layoutRoots.get(host);
    if (!root) {
      root = createRoot(host);
      layoutRoots.set(host, root);
    }
    root.render(<RecentArticlesBlock payload={parsed} />);
  });
}

export function mountShadcnArticleCards(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-article-card]').forEach((host) => {
    if (host.closest('[data-shadcn-tile-carousel-bound="1"]')) {
      return;
    }
    if (host.dataset['shadcnArticleCardBound'] === '1') {
      return;
    }
    const jsonId = host.dataset['layoutJsonId'];
    if (!jsonId) {
      return;
    }
    const parsed = readPayloadScript(jsonId);
    if (!parsed || !('kind' in parsed)) {
      return;
    }
    host.dataset['shadcnArticleCardBound'] = '1';
    let root = layoutRoots.get(host);
    if (!root) {
      root = createRoot(host);
      layoutRoots.set(host, root);
    }
    root.render(<ArticleCardView data={parsed} />);
  });
}
