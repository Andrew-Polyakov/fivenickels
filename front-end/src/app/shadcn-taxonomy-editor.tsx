import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Autoplay from 'embla-carousel-autoplay';

import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, type Editor, type ReactNodeViewProps } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

import {
  Check,
  ChevronsUpDown,
  Infinity as InfinityIcon,
  Maximize2,
  PanelLeft,
  PanelRight,
  PanelTop,
  Settings2,
  Shrink,
  Type,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandGroup, CommandItem, CommandList } from '../components/ui/command';
import { RteToolbar, TABLE_EXTENSIONS } from '../components/ui/rte-editor';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '../components/ui/carousel';
import { Slider } from '../components/ui/slider';
import { Checkbox } from '../components/ui/checkbox';
import {
  carouselCardShowsHeroImage,
  packCarouselSlides,
  resolveCarouselCardRenderMode,
  type CarouselCardFontColorKey,
  type CarouselCardImageScale,
  type CarouselCardTextImageLayout,
  type CarouselCardViewModel,
  type CarouselPackedSlide,
} from './carousel-slide-packing';
import {
  bentoGrid01SectionClassName,
  normalizeBentoBlockBackground,
  normalizeBentoTheme,
  normalizeBentoTileStyle,
} from './bento-grid01-theme';

import ForexStripTile, {
  type ForexQuotePayload,
} from '../components/shadcn-space/blocks/bento-grid-01/ForexStripTile';
import MarketMoversTile, {
  type MarketMoverTabPayload,
  type MarketMoversGroupPayload,
} from '../components/shadcn-space/blocks/bento-grid-01/MarketMoversTile';
import StockBarsTile from '../components/shadcn-space/blocks/bento-grid-01/StockBarsTile';
import type { StockBarPoint, StockChipPayload } from '../components/shadcn-space/blocks/bento-grid-01/StockBarsTile';
import UpcomingDividendsTile, {
  type DividendRowPayload,
} from '../components/shadcn-space/blocks/bento-grid-01/UpcomingDividendsTile';
import MarketCalendarTile, {
  type CalendarRowPayload,
} from '../components/shadcn-space/blocks/bento-grid-01/MarketCalendarTile';
import { BentoWidgetTileFrame } from './bento-widget-tile-frame';
import {
  BentoGridEditorLayout,
  spansFromLegacyPanelSizes,
  tilesHaveDefaultSpans,
  type BentoLayoutPersistPatch,
} from './bento-grid-editor-layout';
import {
  bentoEditorLayoutStorageKey,
  bentoSectionHasFixedHeight,
  bentoSectionSizeStyles,
  normalizeColPanelSizesByRow,
  normalizePanelSizePctArray,
  parseBentoSectionDimension,
  serializeBentoFeaturePlacement,
  pruneBentoPanelSizesForGrid,
} from './bento-block-persist';
import {
  normalizeCol,
  normalizeColSpan,
  normalizeGridColumns,
  normalizeGridRows,
  normalizeRow,
  normalizeRowSpan,
} from './bento-grid-layout';
import { FxBrokerCardView, type FxBrokerPayload } from './shadcn-fx-broker-card';

// ─── Types ────────────────────────────────────────────────────────────────────

type HeadingBlock   = { id: string; type: 'heading';   level: 'h1' | 'h2'; text: string };
type ParagraphBlock = { id: string; type: 'paragraph'; html: string };
type ImageBlock     = { id: string; type: 'image';     imageId: number | null; imageUrl: string | null };
type EmbedBlock     = { id: string; type: 'embed';     url: string };
type SeparatorBlock = { id: string; type: 'separator' };

export type BentoGrid01Feature = {
  id: string;
  header_type:
    | 'image'
    | 'card'
    | 'fxbroker'
    | 'richtext'
    | 'stock_bars'
    | 'forex_strip'
    | 'market_movers'
    | 'upcoming_dividends'
    | 'market_calendar';
  image_url_light: string;
  image_url_dark: string;
  title: string;
  description: string;
  col_span?: number;
  row_span?: number;
  row?: number | null;
  /** 1-based start column (editor placement). */
  col?: number | null;
  mode?: 'random' | 'priority' | 'specific';
  articleId?: number | null;
  articleTitle?: string | null;
  html?: string;
  cardBgOpacity?: number;
  cardFontColor?: CarouselCardFontColorKey;
  cardImageLayout?: CarouselCardTextImageLayout;
  cardImageScale?: CarouselCardImageScale;
  /** Stock bars tile: first symbol → chart; all symbols → chips (persisted JSON). */
  stock_symbols?: string[];
  /** Alpaca cadence: day = 1Day bars, week = 1Week, month = 1Month. */
  stock_bars_cadence?: 'day' | 'week' | 'month';
  /** Bar count for chart (90–360); server clamps. */
  stock_bars_limit?: number;
  /** Market movers tile: default region when no ?market_region= on the page. */
  market_region?: 'US' | 'ASIA' | 'EUROPE';
  /** Upcoming dividends tile: optional symbol filter (blank = all enabled tickers). */
  dividend_symbols?: string[];
  dividend_max_rows?: number;
  /** Market calendar tile: exchange and row cap. */
  calendar_market?: 'NASDAQ' | 'NYSE';
  calendar_max_rows?: number;
  /** FX Broker card tile fields (stored inline for public rendering). */
  brokerId?: number | null;
  brokerName?: string | null;
  brokerFaviconUrl?: string | null;
  brokerOverallRating?: number | null;
  brokerPageUrl?: string | null;
};

const BENTO_WIDGET_TILE_TYPES = new Set<BentoGrid01Feature['header_type']>([
  'stock_bars',
  'forex_strip',
  'market_movers',
  'upcoming_dividends',
  'market_calendar',
  'fxbroker',
]);
export type BentoGrid01Block  = {
  id: string; type: 'bento_grid_01'; badge_text: string; heading: string; features: BentoGrid01Feature[];
  theme?: 'default' | 'inverted' | 'accent';
  tile_style?: 'bordered' | 'shadow' | 'flat';
  block_background?: 'default' | 'edge_to_edge';
  show_badge?: boolean;
  grid_columns?: number;
  grid_rows?: number;
  /** @deprecated Layout uses CSS grid; kept for JSON compatibility. */
  panelSizes?: number[];
  /** Section height (e.g. `480px`). Omit or `auto` for intrinsic height. */
  height?: string;
  /** Section max width (e.g. `1200px`). Omit for full column width. */
  width?: string;
  /** Vertical row band sizes (%), from resize handles. */
  row_panel_sizes?: number[];
  /** Horizontal segment sizes (%), keyed by row index. */
  col_panel_sizes_by_row?: Record<string, number[]>;
};

type CarouselSlot  = {
  id: string;
  mode: 'random' | 'priority' | 'specific';
  articleId: number | null;
  articleTitle: string | null;
  articleImageUrl?: string | null;
  articleTags?: string[] | null;
  articleExcerpt?: string | null;
  articleUrl?: string | null;
  authorName?: string | null;
  publishedAt?: string | null;
  catalyst?: string | null;
};
type CarouselBlock = {
  id: string;
  type: 'carousel';
  features: BentoGrid01Feature[];
  infiniteScroll?: boolean;
  height?: string;
  /** Max cards per stacked slide when packing consecutive imageless article cards (1–4). Default 3 when omitted. */
  stackDepth?: number;
};

type TaxonomyBlock = HeadingBlock | ParagraphBlock | ImageBlock | EmbedBlock | SeparatorBlock | BentoGrid01Block | CarouselBlock;
type TaxonomyContentJson = { version: number; blocks: TaxonomyBlock[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCsrf(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function api(url: string, options: RequestInit = {}): Promise<Response> {
  const h = new Headers(options.headers as Record<string, string>);
  h.set('X-CSRFToken', getCsrf());
  if (!(options.body instanceof FormData) && !h.has('Content-Type')) {
    h.set('Content-Type', 'application/json');
    h.set('Accept', 'application/json');
  }
  return fetch(url, { ...options, headers: h });
}

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function carouselSlotNeedsPreviewHydration(slot: CarouselSlot): boolean {
  if (slot.mode === 'random' || slot.mode === 'priority') {
    return true;
  }
  if (slot.mode !== 'specific' || typeof slot.articleId !== 'number' || slot.articleId <= 0) {
    return false;
  }
  return !slot.publishedAt?.trim() || !slot.articleImageUrl || !slot.articleExcerpt?.trim() || !slot.catalyst;
}

function useResolvedCarouselPreviews(cards: CarouselSlot[], termId: number): Record<string, ArticleResult | null> {
  const [resolved, setResolved] = React.useState<Record<string, ArticleResult | null>>({});
  const signature = React.useMemo(
    () => cards.map((slot) => (
      `${slot.id}:${slot.mode}:${slot.articleId ?? ''}:${slot.articleTitle ?? ''}:${slot.publishedAt ?? ''}`
    )).join('|'),
    [cards]
  );

  React.useEffect(() => {
    const hydrateSlots = cards.filter((slot) => carouselSlotNeedsPreviewHydration(slot));
    if (hydrateSlots.length === 0) {
      setResolved({});
      return;
    }
    const sectionTermId = Number.isFinite(termId) && termId > 0 ? termId : null;
    const usedIds = new Set<number>(
      cards
        .filter((slot) => slot.mode === 'specific' && typeof slot.articleId === 'number' && slot.articleId > 0)
        .map((slot) => slot.articleId as number)
    );
    let cancelled = false;
    void (async () => {
      const next: Record<string, ArticleResult | null> = {};
      for (const slot of hydrateSlots) {
        const q = new URLSearchParams();
        if (slot.mode === 'specific' && typeof slot.articleId === 'number' && slot.articleId > 0) {
          q.set('article_id', String(slot.articleId));
        } else {
          q.set('random', '1');
          if (sectionTermId) {
            q.set('section_term_id', String(sectionTermId));
          }
          if (usedIds.size > 0) {
            q.set('exclude_ids', Array.from(usedIds).join(','));
          }
        }
        try {
          const res = await fetch(`/inline/article/search/?${q.toString()}`, { credentials: 'same-origin' });
          if (!res.ok) {
            next[slot.id] = null;
            continue;
          }
          const data = (await res.json()) as { results?: ArticleResult[] };
          const article = data.results?.[0] ?? null;
          next[slot.id] = article;
          if (article?.id) {
            usedIds.add(article.id);
          }
        } catch {
          next[slot.id] = null;
        }
      }
      if (!cancelled) {
        setResolved(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cards, signature, termId]);

  return resolved;
}

function legacyCarouselSlotsToFeatures(cards: CarouselSlot[]): BentoGrid01Feature[] {
  return cards.map((slot) => ({
    id: slot.id,
    header_type: 'card' as const,
    image_url_light: '',
    image_url_dark: '',
    title: '',
    description: '',
    col_span: 1,
    row_span: 1,
    mode: slot.mode,
    articleId: slot.articleId,
    articleTitle: slot.articleTitle,
  }));
}

/** Migrate legacy single `card_image_layout` / camelCase into layout + scale (in place). */
export function normalizeBentoCardFeatureFields(feat: Record<string, unknown>): void {
  if (feat['header_type'] !== 'card') {
    return;
  }
  const rawLay = feat['cardImageLayout'] ?? feat['card_image_layout'];
  const rawScale = feat['cardImageScale'] ?? feat['card_image_scale'];
  const layout = typeof rawLay === 'string' ? rawLay : undefined;
  const scale =
    rawScale === 'scales_to_fit' || rawScale === 'bleed_under' ? rawScale : undefined;

  delete feat['card_image_layout'];
  delete feat['card_image_scale'];

  if (layout === 'fit_under') {
    feat['cardImageLayout'] = 'text_on_top';
    feat['cardImageScale'] = 'bleed_under';
    return;
  }
  if (layout === 'scales_fit_top') {
    feat['cardImageLayout'] = 'text_on_top';
    feat['cardImageScale'] = 'scales_to_fit';
    return;
  }
  if (
    layout === 'text_on_top'
    || layout === 'text_on_left'
    || layout === 'text_on_right'
    || layout === 'text_only'
  ) {
    feat['cardImageLayout'] = layout;
    feat['cardImageScale'] = scale ?? 'bleed_under';
    return;
  }
  feat['cardImageLayout'] = 'text_on_top';
  feat['cardImageScale'] = scale ?? 'bleed_under';
}

function normalizeBentoFeatureFromUnknown(
  raw: unknown,
  gridColumns = 3,
): BentoGrid01Feature | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = { ...(raw as Record<string, unknown>) } as Record<string, unknown>;
  if (typeof o['id'] !== 'string' || typeof o['header_type'] !== 'string') return null;
  if (o['header_type'] === 'animated_ui_block' || o['header_type'] === 'reminder_animation') return null;
  normalizeBentoCardFeatureFields(o);
  const cols = normalizeGridColumns(gridColumns);
  o['col_span'] = normalizeColSpan(o['col_span'], cols);
  o['row_span'] = normalizeRowSpan(o['row_span']);
  const rowN = normalizeRow(o['row']);
  if (rowN !== undefined) {
    o['row'] = rowN;
  } else {
    delete o['row'];
  }
  const colN = normalizeCol(o['col'], cols);
  if (colN !== undefined) {
    o['col'] = colN;
  } else {
    delete o['col'];
  }
  return o as unknown as BentoGrid01Feature;
}

/** Exported for tests — normalize a carousel block from persisted JSON (legacy `cards` → `features`). */
export function normalizeCarouselBlockFromJson(raw: Record<string, unknown>): CarouselBlock | null {
  if (raw['type'] !== 'carousel' || typeof raw['id'] !== 'string') return null;
  const rawFeatures = raw['features'];
  let features: BentoGrid01Feature[] = [];
  if (Array.isArray(rawFeatures) && rawFeatures.length > 0) {
    features = rawFeatures
      .map((item) => normalizeBentoFeatureFromUnknown(item))
      .filter((f): f is BentoGrid01Feature => f !== null);
  }
  if (features.length === 0 && Array.isArray(raw['cards'])) {
    const cards = raw['cards'].filter((c): c is CarouselSlot =>
      typeof c === 'object' && c !== null && typeof (c as CarouselSlot).id === 'string',
    );
    features = legacyCarouselSlotsToFeatures(cards);
  }
  const infiniteScroll = typeof raw['infiniteScroll'] === 'boolean' ? raw['infiniteScroll'] as boolean : undefined;
  const height = typeof raw['height'] === 'string' ? raw['height'] : undefined;
  let stackDepth: number | undefined;
  const rawSd = raw['stackDepth'];
  if (typeof rawSd === 'number' && Number.isFinite(rawSd)) {
    stackDepth = Math.min(4, Math.max(1, Math.round(rawSd)));
  }
  return {
    id: raw['id'],
    type: 'carousel',
    features,
    ...(infiniteScroll !== undefined ? { infiniteScroll } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(stackDepth !== undefined ? { stackDepth } : {}),
  };
}

function normalizeTaxonomyBlock(raw: Record<string, unknown>): TaxonomyBlock | null {
  const t = raw['type'];
  if (typeof t !== 'string') return null;
  if (t === 'carousel') {
    return normalizeCarouselBlockFromJson(raw);
  }
  if (t === 'separator' && typeof raw['id'] === 'string') {
    return { id: raw['id'], type: 'separator' };
  }
  if (t === 'bento_grid_01' && typeof raw['id'] === 'string') {
    const rawFeats = raw['features'];
    const block_background = normalizeBentoBlockBackground(raw['block_background']);
    const grid_columns = normalizeGridColumns(raw['grid_columns']);
    const grid_rows = normalizeGridRows(raw['grid_rows']);
    const featuresNormalized: BentoGrid01Feature[] = Array.isArray(rawFeats)
      ? rawFeats
          .map((item) => normalizeBentoFeatureFromUnknown(item, grid_columns))
          .filter((f): f is BentoGrid01Feature => f !== null)
      : [];
    return {
      id: raw['id'],
      type: 'bento_grid_01',
      badge_text: typeof raw['badge_text'] === 'string' ? raw['badge_text'] : 'Features',
      heading: typeof raw['heading'] === 'string' ? raw['heading'] : '',
      features: featuresNormalized,
      theme: normalizeBentoTheme(raw['theme']),
      tile_style: normalizeBentoTileStyle(raw['tile_style']),
      block_background,
      show_badge: typeof raw['show_badge'] === 'boolean' ? raw['show_badge'] : true,
      grid_columns,
      grid_rows,
      ...(Array.isArray(raw['panelSizes']) ? { panelSizes: raw['panelSizes'] as number[] } : {}),
      ...(() => {
        const height = parseBentoSectionDimension(raw['height']);
        const width = parseBentoSectionDimension(raw['width']);
        const row_panel_sizes = normalizePanelSizePctArray(raw['row_panel_sizes'], grid_rows);
        const col_panel_sizes_by_row = normalizeColPanelSizesByRow(
          raw['col_panel_sizes_by_row'],
          grid_rows,
        );
        return {
          ...(height ? { height } : {}),
          ...(width ? { width } : {}),
          ...(row_panel_sizes ? { row_panel_sizes } : {}),
          ...(col_panel_sizes_by_row ? { col_panel_sizes_by_row } : {}),
        };
      })(),
    };
  }
  return raw as TaxonomyBlock;
}

export function serializeBentoGrid01BlockForSave(block: BentoGrid01Block): BentoGrid01Block {
  const grid_columns = normalizeGridColumns(block.grid_columns);
  const grid_rows = normalizeGridRows(block.grid_rows);
  const height = parseBentoSectionDimension(block.height);
  const width = parseBentoSectionDimension(block.width);
  const row_panel_sizes = normalizePanelSizePctArray(block.row_panel_sizes, grid_rows);
  const col_panel_sizes_by_row = normalizeColPanelSizesByRow(
    block.col_panel_sizes_by_row,
    grid_rows,
  );
  return {
    id: block.id,
    type: 'bento_grid_01',
    badge_text: block.badge_text,
    heading: block.heading,
    features: block.features.map((f) => serializeBentoFeaturePlacement(f, grid_columns)),
    theme: block.theme,
    tile_style: block.tile_style,
    block_background: block.block_background,
    show_badge: block.show_badge,
    grid_columns,
    grid_rows,
    ...(height ? { height } : {}),
    ...(width ? { width } : {}),
    ...(row_panel_sizes ? { row_panel_sizes } : {}),
    ...(col_panel_sizes_by_row ? { col_panel_sizes_by_row } : {}),
  };
}

export function applyBentoLayoutPersistPatch(
  block: BentoGrid01Block,
  patch: BentoLayoutPersistPatch,
): BentoGrid01Block {
  let features = block.features;
  if (patch.tileSpanPatches?.length) {
    features = features.map((f) => {
      const p = patch.tileSpanPatches!.find((x) => x.id === f.id);
      return p ? { ...f, ...p } : f;
    });
  }
  return {
    ...block,
    features,
    ...(patch.row_panel_sizes ? { row_panel_sizes: patch.row_panel_sizes } : {}),
    ...(patch.col_panel_sizes_by_row
      ? {
          col_panel_sizes_by_row: {
            ...(block.col_panel_sizes_by_row ?? {}),
            ...patch.col_panel_sizes_by_row,
          },
        }
      : {}),
  };
}

function jsonToBlocks(json: object | null): TaxonomyBlock[] {
  if (!json || typeof json !== 'object') return [];
  const j = json as TaxonomyContentJson;
  if (!Array.isArray(j.blocks)) return [];
  return j.blocks
    .map((b) => (typeof b === 'object' && b !== null ? normalizeTaxonomyBlock(b as Record<string, unknown>) : null))
    .filter((b): b is TaxonomyBlock => b !== null);
}

function blocksToJson(blocks: TaxonomyBlock[]): TaxonomyContentJson {
  return {
    version: 1,
    blocks: blocks.map((b) =>
      b.type === 'bento_grid_01' ? serializeBentoGrid01BlockForSave(b) : b,
    ),
  };
}

// ─── Article Search Input ─────────────────────────────────────────────────────

type ArticleResult = {
  id: number;
  title: string;
  url?: string;
  imageUrl?: string | null;
  tag?: string | null;
  tags?: string[];
  excerpt?: string | null;
  authorName?: string | null;
  publishedAt?: string | null;
  catalyst?: string | null;
};

function ArticleSearchInput({ value, onChange, searchUrl, placeholder = 'Search articles…' }: {
  value: { id: number | null; title: string | null };
  onChange: (v: ArticleResult | { id: null; title: null }) => void;
  searchUrl: string;
  placeholder?: string;
}) {
  const [query, setQuery] = React.useState(value.title ?? '');
  const [results, setResults] = React.useState<ArticleResult[]>([]);
  const [open, setOpen] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => { setQuery(value.title ?? ''); }, [value.title]);

  function doSearch(q: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${searchUrl}?q=${encodeURIComponent(q)}`, {
          headers: { 'X-CSRFToken': getCsrf() },
        });
        const data = await res.json() as { results: ArticleResult[] };
        setResults(data.results ?? []);
        setOpen(true);
      } catch { setResults([]); }
    }, 280);
  }

  return (
    <div className="scn-article-search">
      <div className="scn-article-search__row">
        <Input
          placeholder={placeholder}
          value={value.id ? (value.title ?? '') : query}
          onChange={e => {
            if (value.id) onChange({ id: null, title: null });
            setQuery(e.target.value);
            doSearch(e.target.value);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {value.id && (
          <button className="scn-editor-block__ctrl-btn scn-editor-block__ctrl-btn--danger"
            onClick={() => { onChange({ id: null, title: null }); setQuery(''); }}
            title="Clear">×</button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="scn-article-search__dropdown">
          {results.map(r => (
            <button key={r.id} className="scn-article-search__item"
              onMouseDown={e => {
                e.preventDefault();
                onChange(r);
                setOpen(false);
              }}>
              {r.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Carousel Article Card ────────────────────────────────────────────────────

export function carouselCatalystIconSrc(catalyst?: string | null): string | null {
  if (catalyst === 'Bullish') return '/static/images/bull.png';
  if (catalyst === 'Bearish') return '/static/images/bear.png';
  return null;
}

function carouselCardResolveFontColor(key: CarouselCardFontColorKey | undefined): string {
  switch (key ?? 'white') {
    case 'black':
      return '#0a0a0a';
    case 'slime':
      return 'var(--color-slime)';
    case 'gray':
      return 'rgba(226, 232, 240, 0.7)';
    default:
      return '#ffffff';
  }
}

export function CarouselCard(props: CarouselCardViewModel) {
  const {
    imageUrl,
    tags,
    title,
    excerpt,
    url,
    authorName,
    publishedAt,
    catalyst,
    bgOpacity,
    fontColor,
    textImageLayout,
    imageScale,
    imageLayout,
  } = props;
  const publishedLabel = publishedAt?.trim() || '';
  const showHero = carouselCardShowsHeroImage({ imageUrl, textImageLayout, imageLayout });
  const renderMode = resolveCarouselCardRenderMode({ imageUrl, textImageLayout, imageScale, imageLayout });
  const sentimentIconSrc = carouselCatalystIconSrc(catalyst);
  const tagList = (tags ?? []).slice(0, 5);
  const opacityPct = bgOpacity ?? 100;
  const bodyBackground = `rgba(var(--carousel-card-surface-rgb), ${opacityPct / 100})`;
  const textColor = carouselCardResolveFontColor(fontColor);

  const bodyEl = (
    <CardContent className="carousel-article-card__body" style={{ background: bodyBackground }}>
      {tagList.length > 0 || sentimentIconSrc ? (
        <div className="carousel-article-card__tags">
          {sentimentIconSrc ? (
            <img
              src={sentimentIconSrc}
              alt=""
              width={32}
              height={32}
              className={`scn-catalyst-icon scn-article-card__catalyst-icon${catalyst === 'Bearish' ? ' scn-catalyst-icon--bear' : ''}`}
              aria-hidden="true"
            />
          ) : null}
          {tagList.map((tag) => (
            <span key={tag} className="carousel-article-card__tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <CardTitle className="carousel-article-card__title">{title}</CardTitle>
      {excerpt && <p className="carousel-article-card__excerpt">{excerpt}</p>}
    </CardContent>
  );

  const footerEl = (
    <div className="carousel-article-card__footer" style={{ background: bodyBackground }}>
      <span className="carousel-article-card__author">{authorName || 'Fivenickels Editorial'}</span>
      {publishedLabel ? (
        <time className="carousel-article-card__published" dateTime={publishedLabel}>
          {publishedLabel}
        </time>
      ) : null}
    </div>
  );

  const legacyMediaEl = showHero ? (
    <div className="carousel-article-card__media">
      <img src={imageUrl ?? ''} alt={title} className="carousel-article-card__img" />
    </div>
  ) : null;

  const bottomContainMediaEl = showHero ? (
    <div className="carousel-article-card__media carousel-article-card__media--bottom-contain">
      <img src={imageUrl ?? ''} alt={title} className="carousel-article-card__img carousel-article-card__img--contain" />
    </div>
  ) : null;

  const splitMediaCoverEl = showHero ? (
    <div className="carousel-article-card__media carousel-article-card__media--split">
      <img src={imageUrl ?? ''} alt={title} className="carousel-article-card__img carousel-article-card__img--cover" />
    </div>
  ) : null;

  const splitMediaContainEl = showHero ? (
    <div className="carousel-article-card__media carousel-article-card__media--split carousel-article-card__media--split-contain">
      <img src={imageUrl ?? ''} alt={title} className="carousel-article-card__img carousel-article-card__img--contain" />
    </div>
  ) : null;

  const textStackEl = (
    <div className="carousel-article-card__text-stack">
      {bodyEl}
      {footerEl}
    </div>
  );

  let layoutModClass: string;
  let cardChildren: React.ReactNode;

  if (!showHero || renderMode === 'imageless') {
    layoutModClass = 'carousel-article-card--imageless';
    cardChildren = (
      <>
        {bodyEl}
        {footerEl}
      </>
    );
  } else if (renderMode === 'fit_under') {
    layoutModClass = 'carousel-article-card--fit-under';
    cardChildren = (
      <>
        <div className="carousel-article-card__media carousel-article-card__media--under" aria-hidden="true">
          <img src={imageUrl ?? ''} alt="" className="carousel-article-card__img carousel-article-card__img--cover" />
        </div>
        <div className="carousel-article-card__forefront">
          {bodyEl}
          {footerEl}
        </div>
      </>
    );
  } else if (renderMode === 'stack_bottom_contain') {
    layoutModClass = 'carousel-article-card--with-bottom-image carousel-article-card--bottom-image-contain';
    cardChildren = (
      <>
        {bodyEl}
        {footerEl}
        {bottomContainMediaEl}
      </>
    );
  } else if (renderMode === 'split_left_cover') {
    layoutModClass = 'carousel-article-card--split-text-left';
    cardChildren = (
      <>
        {textStackEl}
        {splitMediaCoverEl}
      </>
    );
  } else if (renderMode === 'split_left_contain') {
    layoutModClass = 'carousel-article-card--split-text-left';
    cardChildren = (
      <>
        {textStackEl}
        {splitMediaContainEl}
      </>
    );
  } else if (renderMode === 'split_right_cover') {
    layoutModClass = 'carousel-article-card--split-text-right';
    cardChildren = (
      <>
        {splitMediaCoverEl}
        {textStackEl}
      </>
    );
  } else if (renderMode === 'split_right_contain') {
    layoutModClass = 'carousel-article-card--split-text-right';
    cardChildren = (
      <>
        {splitMediaContainEl}
        {textStackEl}
      </>
    );
  } else {
    layoutModClass = 'carousel-article-card--with-bottom-image';
    cardChildren = (
      <>
        {bodyEl}
        {footerEl}
        {legacyMediaEl}
      </>
    );
  }

  const inner = (
    <Card
      className={cn(
        'carousel-article-card',
        layoutModClass,
        url && 'carousel-article-card--link',
      )}
      style={{ color: textColor }}
    >
      {cardChildren}
    </Card>
  );
  return url
    ? <a href={url} className="carousel-article-card__anchor">{inner}</a>
    : inner;
}

function resolveCarouselSlotViewModel(
  slot: CarouselSlot,
  index: number,
  resolvedRandom: Record<string, ArticleResult | null>,
  context: 'editor' | 'readonly' | 'editor_preview',
): CarouselCardViewModel | null {
  const preview = resolvedRandom[slot.id];
  if (context === 'readonly' && slot.mode !== 'specific' && !preview) {
    return null;
  }
  const editorLike = context === 'editor' || context === 'editor_preview';
  const fallbackTitle = editorLike
    ? `Slot ${index + 1}`
    : `Article ${index + 1}`;
  const title = slot.mode === 'specific'
    ? (slot.articleTitle ?? preview?.title ?? fallbackTitle)
    : preview?.title ?? (slot.mode === 'priority'
      ? (editorLike ? 'Priority article' : `Priority article ${index + 1}`)
      : (editorLike ? 'Random article' : fallbackTitle));

  const url = context === 'editor_preview'
    ? undefined
    : slot.mode === 'specific'
      ? slot.articleUrl ?? preview?.url
      : preview?.url;

  return {
    key: slot.id,
    imageUrl: slot.mode === 'specific'
      ? slot.articleImageUrl ?? preview?.imageUrl ?? null
      : preview?.imageUrl ?? null,
    tags: slot.mode === 'specific'
      ? slot.articleTags ?? preview?.tags ?? []
      : preview?.tags ?? [],
    title,
    excerpt: slot.mode === 'specific'
      ? slot.articleExcerpt ?? preview?.excerpt
      : preview?.excerpt,
    url,
    authorName: slot.mode === 'specific'
      ? slot.authorName ?? preview?.authorName
      : preview?.authorName,
    publishedAt: slot.mode === 'specific'
      ? slot.publishedAt ?? preview?.publishedAt
      : preview?.publishedAt,
    catalyst: slot.mode === 'specific'
      ? slot.catalyst ?? preview?.catalyst
      : preview?.catalyst,
  };
}

function resolveCarouselCardFeatureViewModel(
  feat: BentoGrid01Feature,
  index: number,
  resolvedRandom: Record<string, ArticleResult | null>,
  context: 'editor' | 'readonly' | 'editor_preview',
): CarouselCardViewModel | null {
  if (feat.header_type !== 'card') return null;
  const slot: CarouselSlot = {
    id: feat.id,
    mode: feat.mode ?? 'random',
    articleId: feat.articleId ?? null,
    articleTitle: feat.articleTitle ?? null,
  };
  const base = resolveCarouselSlotViewModel(slot, index, resolvedRandom, context);
  if (!base) return null;
  return {
    ...base,
    bgOpacity: feat.cardBgOpacity,
    textImageLayout: feat.cardImageLayout ?? 'text_on_top',
    imageScale: feat.cardImageScale ?? 'bleed_under',
  };
}

export function carouselFeaturesAllCards(features: BentoGrid01Feature[]): boolean {
  return features.length > 0 && features.every((f) => f.header_type === 'card');
}

function renderPackedTaxonomyCarouselSlide(
  slide: CarouselPackedSlide,
  itemClassName: string,
): React.ReactNode {
  if (slide.kind === 'single') {
    return (
      <CarouselItem key={slide.key} className={cn(itemClassName, 'carousel-slides__item')}>
        <CarouselCard {...slide.card} />
      </CarouselItem>
    );
  }

  return (
    <CarouselItem key={slide.key} className={cn(itemClassName, 'carousel-slides__item', 'carousel-slides__item--stack')}>
      <div
        className="carousel-slides__stack"
        style={{ ['--carousel-stack-rows']: String(slide.cards.length) } as React.CSSProperties}
      >
        {slide.cards.map((c) => {
          const { key: cardKey, ...cardProps } = c;
          return <CarouselCard key={cardKey} {...cardProps} />;
        })}
      </div>
    </CarouselItem>
  );
}

function renderPackedCarouselEditorBentoSlide(
  slide: CarouselPackedSlide,
  itemClassName: string,
  cardFeaturesById: Record<string, BentoGrid01Feature>,
  searchUrl: string,
  stockPreviewUrl: string,
  forexPreviewUrl: string,
  marketMoversPreviewUrl: string,
  dividendsPreviewUrl: string,
  calendarPreviewUrl: string,
  brokerListUrl: string,
  resolvedRandom: Record<string, ArticleResult | null>,
  onPatch: (featId: string, patch: Partial<BentoGrid01Feature>) => void,
  onRemove: (featId: string) => void,
): React.ReactNode {
  function renderPanel(feat: BentoGrid01Feature): React.ReactNode {
    return (
      <BentoFeaturePanel
        key={feat.id}
        feat={feat}
        resolved={resolvedRandom[feat.id]}
        searchUrl={searchUrl}
        stockPreviewUrl={stockPreviewUrl}
        forexPreviewUrl={forexPreviewUrl}
        marketMoversPreviewUrl={marketMoversPreviewUrl}
        dividendsPreviewUrl={dividendsPreviewUrl}
        calendarPreviewUrl={calendarPreviewUrl}
        brokerListUrl={brokerListUrl}
        gridColumns={3}
        onPatch={patch => onPatch(feat.id, patch)}
        onRemove={() => onRemove(feat.id)}
      />
    );
  }

  if (slide.kind === 'single') {
    const feat = cardFeaturesById[slide.card.key];
    if (!feat) {
      return (
        <CarouselItem key={slide.key} className={cn(itemClassName, 'carousel-slides__item')}>
          <CarouselCard {...slide.card} />
        </CarouselItem>
      );
    }
    return (
      <CarouselItem key={slide.key} className={cn(itemClassName, 'carousel-slides__item')}>
        <div className="scn-carousel-editor__card-trigger scn-carousel-editor__card-trigger--panel">
          {renderPanel(feat)}
        </div>
      </CarouselItem>
    );
  }

  return (
    <CarouselItem key={slide.key} className={cn(itemClassName, 'carousel-slides__item', 'carousel-slides__item--stack')}>
      <div
        className="carousel-slides__stack"
        style={{ ['--carousel-stack-rows']: String(slide.cards.length) } as React.CSSProperties}
      >
        {slide.cards.map((c) => {
          const feat = cardFeaturesById[c.key];
          if (!feat) {
            const { key: cardKey, ...cardProps } = c;
            return <CarouselCard key={cardKey} {...cardProps} />;
          }
          return (
            <div key={feat.id} className="scn-carousel-editor__card-trigger scn-carousel-editor__card-trigger--panel">
              {renderPanel(feat)}
            </div>
          );
        })}
      </div>
    </CarouselItem>
  );
}

// ─── Wagtail inline image node (Tiptap) ──────────────────────────────────────

function WagtailImageNodeView({ node, updateAttributes }: ReactNodeViewProps) {
  const { src, alt, format, imageId } = node.attrs;
  const FORMATS = [
    { key: 'left',      label: 'L' },
    { key: 'fullwidth', label: '■' },
    { key: 'right',     label: 'R' },
  ] as const;
  return (
    <NodeViewWrapper>
      <div className={`scn-rte-image scn-rte-image--${format}`} contentEditable={false}>
        {src
          ? <img src={src} alt={alt || ''} className="scn-rte-image__img" />
          : <div className="scn-rte-image__placeholder">Image #{imageId}</div>
        }
        <div className="scn-rte-image__bar">
          {FORMATS.map(({ key, label }) => (
            <button key={key} type="button"
              className={`scn-rte-image__fmt${format === key ? ' scn-rte-image__fmt--on' : ''}`}
              onMouseDown={e => { e.preventDefault(); updateAttributes({ format: key }); }}>
              {label}
            </button>
          ))}
          <input className="scn-rte-image__alt" placeholder="Alt text" value={alt || ''}
            onChange={e => updateAttributes({ alt: e.target.value })} />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const WagtailImage = Node.create({
  name: 'wagtailImage',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      imageId: { default: null },
      src:     { default: '' },
      alt:     { default: '' },
      format:  { default: 'fullwidth' },
    };
  },
  parseHTML() {
    return [{ tag: 'img[data-image-id]', getAttrs: (el) => ({
      imageId: (el as HTMLElement).getAttribute('data-image-id'),
      src:     (el as HTMLElement).getAttribute('src') || '',
      alt:     (el as HTMLElement).getAttribute('alt') || '',
      format:  (el as HTMLElement).getAttribute('data-format') || 'fullwidth',
    })}];
  },
  renderHTML({ HTMLAttributes }) {
    return ['embed', mergeAttributes({ embedtype: 'image' }, {
      id:     HTMLAttributes['imageId'],
      alt:    HTMLAttributes['alt'] || '',
      format: HTMLAttributes['format'] || 'fullwidth',
    })];
  },
  addNodeView() { return ReactNodeViewRenderer(WagtailImageNodeView); },
});

// ─── Shared block editors ─────────────────────────────────────────────────────

function HeadingEditor({ block, onChange }: { block: HeadingBlock; onChange: (b: HeadingBlock) => void }) {
  return (
    <div className="scn-editor-block__fields scn-editor-block__row">
      <ToggleGroup value={block.level} onValueChange={v => { if (v) onChange({ ...block, level: v as 'h1' | 'h2' }); }}>
        <ToggleGroupItem value="h1">H1</ToggleGroupItem>
        <ToggleGroupItem value="h2">H2</ToggleGroupItem>
      </ToggleGroup>
      <Input className="scn-editor-block__text" placeholder="Heading text" value={block.text}
        onChange={e => onChange({ ...block, text: e.target.value })} />
    </div>
  );
}

function ParagraphEditor({ block, uploadUrl, onChange }: {
  block: ParagraphBlock; uploadUrl: string; onChange: (b: ParagraphBlock) => void;
}) {
  const [focused, setFocused] = React.useState(false);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const editorRef = React.useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      TiptapLink.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write paragraph content…' }),
      WagtailImage,
      ...TABLE_EXTENSIONS,
    ],
    content: block.html || '',
    onUpdate: ({ editor: e }) => onChange({ ...block, html: e.getHTML() }),
    onFocus: () => setFocused(true),
    onBlur:  () => setFocused(false),
  });

  React.useEffect(() => { editorRef.current = editor; }, [editor]);

  React.useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(block.html || '', { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  React.useEffect(() => { return () => { editor?.destroy(); }; /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  async function handleImageFile(file: File) {
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await api(uploadUrl, { method: 'POST', body: fd });
      const data = await res.json();
      const e = editorRef.current;
      if (res.ok && e && !e.isDestroyed) {
        e.chain().focus().insertContent({
          type: 'wagtailImage',
          attrs: { imageId: String(data.id), src: data.url, alt: data.title || '', format: 'fullwidth' },
        }).run();
      }
    } catch { /* silent */ }
  }

  return (
    <div className={`scn-rte-wrap${focused ? ' scn-rte-wrap--active' : ''}`}>
      {editor && <RteToolbar editor={editor} onInsertImage={() => imageInputRef.current?.click()} />}
      <EditorContent editor={editor} className="scn-rte-content" />
      <input ref={imageInputRef} type="file" accept="image/*" className="scn-sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; }} />
    </div>
  );
}

function ImageEditor({ block, uploadUrl, onChange }: {
  block: ImageBlock; uploadUrl: string; onChange: (b: ImageBlock) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true); setError('');
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await api(uploadUrl, { method: 'POST', body: fd });
      const json = await res.json();
      if (res.ok) onChange({ ...block, imageId: json.id, imageUrl: json.url });
      else setError(json.error || 'Upload failed');
    } catch { setError('Upload failed'); }
    finally { setUploading(false); }
  }

  return (
    <div className="scn-editor-block__fields">
      {block.imageUrl && <img src={block.imageUrl} alt="" className="scn-editor-image-preview" />}
      <Button variant="ghost" className="scn-editor-block__upload-btn" disabled={uploading}
        onClick={() => inputRef.current?.click()}>
        {uploading ? 'Uploading…' : block.imageUrl ? 'Replace image' : 'Choose image'}
      </Button>
      {error && <p className="scn-editor-error">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="scn-sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
    </div>
  );
}

function EmbedEditor({ block, onChange }: { block: EmbedBlock; onChange: (b: EmbedBlock) => void }) {
  return (
    <div className="scn-editor-block__fields">
      <Input placeholder="Embed URL (YouTube, Twitter…)" value={block.url}
        onChange={e => onChange({ ...block, url: e.target.value })} />
    </div>
  );
}

function SeparatorEditor() {
  return (
    <div className="scn-editor-block__fields scn-editor-separator-preview" aria-hidden>
      <hr className="scn-taxonomy-content__sep scn-taxonomy-content__sep--horizontal" />
    </div>
  );
}

// ─── Bento Grid 01 Editor ─────────────────────────────────────────────────────

const BENTO_TILE_LABEL: Record<string, string> = {
  image: 'Image tile',
  card: 'Article card',
  fxbroker: 'FX Broker card',
  richtext: 'Rich text',
  stock_bars: 'Stock bars',
  forex_strip: 'FX pairs',
  market_movers: 'Market movers',
  upcoming_dividends: 'Upcoming dividends',
  market_calendar: 'Market calendar',
};

const BENTO_TILE_TYPES: Array<{ type: BentoGrid01Feature['header_type']; desc: string }> = [
  { type: 'image',              desc: 'Light / dark image pair' },
  { type: 'card',               desc: 'Resolved article card' },
  { type: 'fxbroker',           desc: 'FX broker rating card' },
  { type: 'richtext',           desc: 'Formatted rich text content' },
  { type: 'stock_bars',         desc: 'OHLC chart + ticker chips (cadence & bar count)' },
  { type: 'forex_strip',        desc: 'Live major FX pairs' },
  { type: 'market_movers',      desc: 'Winners and losers by region' },
  { type: 'upcoming_dividends', desc: 'Upcoming cash and stock dividends' },
  { type: 'market_calendar',    desc: 'Upcoming NASDAQ / NYSE sessions' },
];

const BENTO_TILE_TYPE_OPTIONS: Array<{ value: BentoGrid01Feature['header_type']; label: string }> = [
  { value: 'image', label: 'Image (light/dark)' },
  { value: 'card', label: 'Article card' },
  { value: 'fxbroker', label: 'FX Broker card' },
  { value: 'richtext', label: 'Rich text' },
  { value: 'stock_bars', label: 'Stock bars' },
  { value: 'forex_strip', label: 'FX pairs' },
  { value: 'market_movers', label: 'Market movers' },
  { value: 'upcoming_dividends', label: 'Upcoming dividends' },
  { value: 'market_calendar', label: 'Market calendar' },
];

const MARKET_REGION_OPTIONS: Array<{ value: 'US' | 'ASIA' | 'EUROPE'; label: string }> = [
  { value: 'US', label: 'US' },
  { value: 'ASIA', label: 'Asia' },
  { value: 'EUROPE', label: 'Europe' },
];

const CALENDAR_MARKET_OPTIONS: Array<{ value: 'NASDAQ' | 'NYSE'; label: string }> = [
  { value: 'NASDAQ', label: 'NASDAQ' },
  { value: 'NYSE', label: 'NYSE' },
];

function BentoTileTypeCombobox({
  value,
  onChange,
}: {
  value: BentoGrid01Feature['header_type'];
  onChange: (v: BentoGrid01Feature['header_type']) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const label = BENTO_TILE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? 'Tile type';

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="scn-bento-editor__tile-type-trigger w-full"
          aria-expanded={open}
          aria-label="Tile type"
        >
          <span className="scn-bento-editor__tile-type-trigger-label truncate text-left">{label}</span>
          <ChevronsUpDown size={14} className="shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="scn-popover-content scn-bento-editor__tile-type-combobox-popover"
        align="start"
        sideOffset={4}
        collisionPadding={12}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandGroup>
              {BENTO_TILE_TYPE_OPTIONS.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check size={14} className={cn(value === opt.value ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const STOCK_BARS_CADENCE_OPTIONS: Array<{ value: 'day' | 'week' | 'month'; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

function StockBarsCadenceCombobox({
  value,
  onChange,
}: {
  value: 'day' | 'week' | 'month';
  onChange: (v: 'day' | 'week' | 'month') => void;
}) {
  const [open, setOpen] = React.useState(false);
  const label = STOCK_BARS_CADENCE_OPTIONS.find((o) => o.value === value)?.label ?? 'Day';

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="scn-bento-editor__tile-type-trigger w-full"
          aria-expanded={open}
          aria-label="Cadence"
        >
          <span className="scn-bento-editor__tile-type-trigger-label truncate text-left">{label}</span>
          <ChevronsUpDown size={14} className="shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="scn-popover-content scn-bento-editor__tile-type-combobox-popover"
        align="start"
        sideOffset={4}
        collisionPadding={12}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandGroup>
              {STOCK_BARS_CADENCE_OPTIONS.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check size={14} className={cn(value === opt.value ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type BrokerListItem = {
  id: number;
  broker_name: string;
  favicon_url: string;
  overall_rating: number;
  page_url: string;
};

function BrokerPickerCombobox({
  brokerId,
  brokerName,
  brokerListUrl,
  onChange,
}: {
  brokerId?: number | null;
  brokerName?: string | null;
  brokerListUrl: string;
  onChange: (broker: BrokerListItem) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [brokers, setBrokers] = React.useState<BrokerListItem[]>([]);

  React.useEffect(() => {
    if (!brokerListUrl) return;
    fetch(brokerListUrl, { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { brokers: BrokerListItem[] }) => setBrokers(data.brokers ?? []))
      .catch(() => {});
  }, [brokerListUrl]);

  const label = brokerName ?? 'Select broker…';

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between" aria-expanded={open}>
          <span className="truncate text-left">{label}</span>
          <ChevronsUpDown size={14} className="shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="scn-popover-content" align="start" sideOffset={4} collisionPadding={12}>
        <Command>
          <CommandList>
            <CommandGroup>
              {brokers.length === 0 && (
                <CommandItem disabled value="_loading">Loading…</CommandItem>
              )}
              {brokers.map((b) => (
                <CommandItem
                  key={b.id}
                  value={String(b.id)}
                  onSelect={() => { onChange(b); setOpen(false); }}
                >
                  <Check size={14} className={cn(brokerId === b.id ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  {b.broker_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function createBentoFeatureOfType(headerType: BentoGrid01Feature['header_type']): BentoGrid01Feature {
  const base = { id: uid(), image_url_light: '', image_url_dark: '', title: '', description: '', col_span: 1, row_span: 1 };
  if (headerType === 'card') {
    return {
      ...base,
      header_type: 'card',
      mode: 'random',
      cardImageLayout: 'text_on_top',
      cardImageScale: 'bleed_under',
    };
  }
  if (headerType === 'richtext') {
    return { ...base, header_type: 'richtext', html: '' };
  }
  if (headerType === 'stock_bars') {
    return {
      ...base,
      header_type: 'stock_bars',
      stock_symbols: ['AAPL'],
      stock_bars_cadence: 'day',
      stock_bars_limit: 180,
    };
  }
  if (headerType === 'market_movers') {
    return { ...base, header_type: 'market_movers', market_region: 'US' };
  }
  if (headerType === 'forex_strip') {
    return { ...base, header_type: 'forex_strip' };
  }
  if (headerType === 'upcoming_dividends') {
    return {
      ...base,
      header_type: 'upcoming_dividends',
      dividend_symbols: [],
      dividend_max_rows: 25,
    };
  }
  if (headerType === 'market_calendar') {
    return {
      ...base,
      header_type: 'market_calendar',
      calendar_market: 'NASDAQ',
      calendar_max_rows: 30,
    };
  }
  if (headerType === 'fxbroker') {
    return { ...base, header_type: 'fxbroker', brokerId: null, brokerName: null, brokerFaviconUrl: null, brokerOverallRating: null, brokerPageUrl: null };
  }
  return { ...base, header_type: headerType };
}

type StockBarsPreviewJson = {
  chart_symbol: string;
  bars: StockBarPoint[];
  chips: StockChipPayload[];
  bars_error?: string;
  bars_timeframe?: string;
  bars_as_of_utc?: string;
};

function parseCommaTickers(raw: string): string[] {
  return raw.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
}

function BentoStockBarsPreview({
  symbols,
  cadence,
  barsLimit,
  stockPreviewUrl,
}: {
  symbols: string[];
  cadence: 'day' | 'week' | 'month';
  barsLimit: number;
  stockPreviewUrl: string;
}) {
  const symKey = symbols.join(',');
  const safeLimit = Math.min(360, Math.max(90, Math.round(barsLimit) || 180));
  const c = cadence === 'week' || cadence === 'month' ? cadence : 'day';
  const [data, setData] = React.useState<StockBarsPreviewJson | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fetchErr, setFetchErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!stockPreviewUrl) {
      setLoading(false);
      setFetchErr(null);
      setData(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setFetchErr(null);
    const q = new URLSearchParams({ symbols: symKey, cadence: c, bars_limit: String(safeLimit) });
    fetch(`${stockPreviewUrl}?${q}`, { signal: ac.signal, credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<StockBarsPreviewJson>;
      })
      .then((j) => { setData(j); })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : 'Failed to load';
        setFetchErr(msg);
        setData(null);
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [stockPreviewUrl, symKey, c, safeLimit]);

  if (!stockPreviewUrl) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc">Configure stock preview URL to show bars.</span>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc">Loading chart…</span>
      </div>
    );
  }
  if (fetchErr) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc text-destructive">{fetchErr}</span>
      </div>
    );
  }
  if (!data) {
    return null;
  }
  return (
    <StockBarsTile
      bars={data.bars}
      chips={data.chips}
      chartSymbol={data.chart_symbol}
      barsError={data.bars_error}
      barsTimeframe={data.bars_timeframe}
    />
  );
}

type ForexStripPreviewJson = { forex_quotes: ForexQuotePayload[] };

function BentoForexStripPreview({ forexPreviewUrl }: { forexPreviewUrl: string }) {
  const [data, setData] = React.useState<ForexStripPreviewJson | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fetchErr, setFetchErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!forexPreviewUrl) {
      setLoading(false);
      setFetchErr(null);
      setData(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setFetchErr(null);
    fetch(forexPreviewUrl, { signal: ac.signal, credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ForexStripPreviewJson>;
      })
      .then((j) => { setData(j); })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return;
        setFetchErr(e instanceof Error ? e.message : 'Failed to load');
        setData(null);
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [forexPreviewUrl]);

  if (!forexPreviewUrl) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc">Configure FX preview URL.</span>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc">Loading FX…</span>
      </div>
    );
  }
  if (fetchErr) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc text-destructive">{fetchErr}</span>
      </div>
    );
  }
  return <ForexStripTile quotes={data?.forex_quotes ?? []} />;
}

type MarketMoversPreviewJson = {
  market_movers: MarketMoversGroupPayload;
  market_mover_tabs: MarketMoverTabPayload[];
};

function BentoMarketMoversPreview({
  marketMoversPreviewUrl,
  marketRegion,
}: {
  marketMoversPreviewUrl: string;
  marketRegion: 'US' | 'ASIA' | 'EUROPE';
}) {
  const [activeRegion, setActiveRegion] = React.useState(marketRegion);
  const [data, setData] = React.useState<MarketMoversPreviewJson | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fetchErr, setFetchErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    setActiveRegion(marketRegion);
  }, [marketRegion]);

  React.useEffect(() => {
    if (!marketMoversPreviewUrl) {
      setLoading(false);
      setFetchErr(null);
      setData(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setFetchErr(null);
    const q = new URLSearchParams({ market_region: activeRegion });
    fetch(`${marketMoversPreviewUrl}?${q}`, { signal: ac.signal, credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<MarketMoversPreviewJson>;
      })
      .then((j) => { setData(j); })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return;
        setFetchErr(e instanceof Error ? e.message : 'Failed to load');
        setData(null);
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [marketMoversPreviewUrl, activeRegion]);

  function onRegionTabCapture(e: React.MouseEvent<HTMLDivElement>) {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(
      'a[data-market-movers-region-link]',
    );
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const region = new URL(link.href, window.location.origin).searchParams.get('market_region');
      if (region === 'US' || region === 'ASIA' || region === 'EUROPE') {
        setActiveRegion(region);
      }
    } catch { /* ignore malformed href */ }
  }

  if (!marketMoversPreviewUrl) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc">Configure market movers preview URL.</span>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc">Loading market movers…</span>
      </div>
    );
  }
  if (fetchErr || !data) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc text-destructive">{fetchErr ?? 'No data'}</span>
      </div>
    );
  }
  return (
    <div onClickCapture={onRegionTabCapture}>
      <MarketMoversTile
        marketMovers={data.market_movers}
        tabs={data.market_mover_tabs}
      />
    </div>
  );
}

type UpcomingDividendsPreviewJson = {
  dividend_rows: DividendRowPayload[];
};

function BentoUpcomingDividendsPreview({
  dividendsPreviewUrl,
  symbols,
  maxRows,
}: {
  dividendsPreviewUrl: string;
  symbols: string[];
  maxRows: number;
}) {
  const symKey = symbols.join(',');
  const safeMaxRows = Math.min(100, Math.max(1, maxRows));

  const [data, setData] = React.useState<UpcomingDividendsPreviewJson | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fetchErr, setFetchErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dividendsPreviewUrl) {
      setLoading(false);
      setFetchErr(null);
      setData(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setFetchErr(null);
    const q = new URLSearchParams({ max_rows: String(safeMaxRows) });
    if (symKey) q.set('symbols', symKey);
    fetch(`${dividendsPreviewUrl}?${q}`, { signal: ac.signal, credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<UpcomingDividendsPreviewJson>;
      })
      .then((j) => { setData(j); })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return;
        setFetchErr(e instanceof Error ? e.message : 'Failed to load');
        setData(null);
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [dividendsPreviewUrl, symKey, safeMaxRows]);

  if (!dividendsPreviewUrl) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc">Configure dividends preview URL.</span>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc">Loading dividends…</span>
      </div>
    );
  }
  if (fetchErr) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc text-destructive">{fetchErr}</span>
      </div>
    );
  }
  return <UpcomingDividendsTile rows={data?.dividend_rows ?? []} />;
}

type MarketCalendarPreviewJson = {
  calendar_rows: CalendarRowPayload[];
};

function BentoMarketCalendarPreview({
  calendarPreviewUrl,
  market,
  maxRows,
}: {
  calendarPreviewUrl: string;
  market: 'NASDAQ' | 'NYSE';
  maxRows: number;
}) {
  const safeMaxRows = Math.min(90, Math.max(1, maxRows));

  const [data, setData] = React.useState<MarketCalendarPreviewJson | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fetchErr, setFetchErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!calendarPreviewUrl) {
      setLoading(false);
      setFetchErr(null);
      setData(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setFetchErr(null);
    const q = new URLSearchParams({ market, max_rows: String(safeMaxRows) });
    fetch(`${calendarPreviewUrl}?${q}`, { signal: ac.signal, credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<MarketCalendarPreviewJson>;
      })
      .then((j) => { setData(j); })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return;
        setFetchErr(e instanceof Error ? e.message : 'Failed to load');
        setData(null);
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [calendarPreviewUrl, market, safeMaxRows]);

  if (!calendarPreviewUrl) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc">Configure calendar preview URL.</span>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc">Loading calendar…</span>
      </div>
    );
  }
  if (fetchErr) {
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span className="scn-taxonomy-content__bento-desc text-destructive">{fetchErr}</span>
      </div>
    );
  }
  return <MarketCalendarTile rows={data?.calendar_rows ?? []} />;
}

function BentoTileRichTextEditor({ feat, onChange }: {
  feat: BentoGrid01Feature; onChange: (html: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      TiptapLink.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write tile content…' }),
    ],
    content: feat.html || '',
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  React.useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(feat.html || '', { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feat.id]);

  React.useEffect(() => { return () => { editor?.destroy(); }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="scn-bento-richtext-tile">
      <div className="scn-bento-richtext-tile__bar">
        <ToggleGroup
          value={editing ? 'edit' : 'view'}
          onValueChange={v => { if (v) setEditing(v === 'edit'); }}
        >
          <ToggleGroupItem value="view">View</ToggleGroupItem>
          <ToggleGroupItem value="edit">Edit</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {editing ? (
        <div className="scn-rte-wrap scn-rte-wrap--active">
          {editor && <RteToolbar editor={editor} />}
          <EditorContent editor={editor} className="scn-rte-content" />
        </div>
      ) : (
        <div className="scn-taxonomy-content__paragraph"
          dangerouslySetInnerHTML={{ __html: feat.html || '<p style="color:var(--muted-foreground)">Empty rich text tile</p>' }} />
      )}
    </div>
  );
}

function BentoFeaturePreview({ feat, resolved, linkable, stockPreviewUrl, forexPreviewUrl, marketMoversPreviewUrl, dividendsPreviewUrl, calendarPreviewUrl }: {
  feat: BentoGrid01Feature;
  resolved: ArticleResult | null | undefined;
  linkable?: boolean;
  stockPreviewUrl?: string;
  forexPreviewUrl?: string;
  marketMoversPreviewUrl?: string;
  dividendsPreviewUrl?: string;
  calendarPreviewUrl?: string;
}) {
  if (feat.header_type === 'card') {
    if (resolved) {
      return (
        <CarouselCard
          {...{
            key: feat.id,
            imageUrl: resolved.imageUrl,
            tags: resolved.tags,
            title: resolved.title,
            excerpt: resolved.excerpt,
            url: linkable ? resolved.url : undefined,
            authorName: resolved.authorName,
            publishedAt: resolved.publishedAt,
            catalyst: resolved.catalyst,
            bgOpacity: feat.cardBgOpacity,
            textImageLayout: feat.cardImageLayout ?? 'text_on_top',
            imageScale: feat.cardImageScale ?? 'bleed_under',
          }}
        />
      );
    }
    return (
      <Card className="scn-bento-editor__placeholder-card">
        <CardContent>
          <CardTitle>{feat.mode === 'specific' ? (feat.articleTitle || 'Specific article') : `${feat.mode ?? 'random'} article`}</CardTitle>
          <p className="scn-taxonomy-content__bento-desc">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  if (feat.header_type === 'richtext') {
    return (
      <div className="scn-bento-editor__richtext-preview scn-taxonomy-content__paragraph"
        dangerouslySetInnerHTML={{ __html: feat.html || '<p style="color:var(--color-text-muted)">Empty rich text</p>' }}
      />
    );
  }

  if (feat.header_type === 'stock_bars') {
    return (
      <BentoWidgetTileFrame>
        <BentoStockBarsPreview
          symbols={feat.stock_symbols ?? []}
          cadence={feat.stock_bars_cadence ?? 'day'}
          barsLimit={feat.stock_bars_limit ?? 180}
          stockPreviewUrl={stockPreviewUrl ?? ''}
        />
      </BentoWidgetTileFrame>
    );
  }

  if (feat.header_type === 'forex_strip') {
    return (
      <BentoWidgetTileFrame>
        {forexPreviewUrl
          ? <BentoForexStripPreview forexPreviewUrl={forexPreviewUrl} />
          : (
            <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
              <span className="scn-taxonomy-content__bento-desc">Configure FX preview URL.</span>
            </div>
          )}
      </BentoWidgetTileFrame>
    );
  }

  if (feat.header_type === 'market_movers') {
    const region = feat.market_region ?? 'US';
    return (
      <BentoWidgetTileFrame scrollable={false}>
        {marketMoversPreviewUrl
          ? (
            <BentoMarketMoversPreview
              marketMoversPreviewUrl={marketMoversPreviewUrl}
              marketRegion={region}
            />
          )
          : (
            <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
              <span className="scn-taxonomy-content__bento-desc">Configure market movers preview URL.</span>
            </div>
          )}
      </BentoWidgetTileFrame>
    );
  }

  if (feat.header_type === 'upcoming_dividends') {
    return (
      <BentoWidgetTileFrame scrollable>
        {dividendsPreviewUrl
          ? (
            <BentoUpcomingDividendsPreview
              dividendsPreviewUrl={dividendsPreviewUrl}
              symbols={feat.dividend_symbols ?? []}
              maxRows={feat.dividend_max_rows ?? 25}
            />
          )
          : (
            <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
              <span className="scn-taxonomy-content__bento-desc">Configure dividends preview URL.</span>
            </div>
          )}
      </BentoWidgetTileFrame>
    );
  }

  if (feat.header_type === 'market_calendar') {
    return (
      <BentoWidgetTileFrame scrollable>
        {calendarPreviewUrl
          ? (
            <BentoMarketCalendarPreview
              calendarPreviewUrl={calendarPreviewUrl}
              market={feat.calendar_market ?? 'NASDAQ'}
              maxRows={feat.calendar_max_rows ?? 30}
            />
          )
          : (
            <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
              <span className="scn-taxonomy-content__bento-desc">Configure calendar preview URL.</span>
            </div>
          )}
      </BentoWidgetTileFrame>
    );
  }

  if (feat.header_type === 'fxbroker') {
    if (feat.brokerName && feat.brokerOverallRating != null) {
      const brokerPayload: FxBrokerPayload = {
        kind: 'fxbroker',
        brokerName: feat.brokerName,
        faviconUrl: feat.brokerFaviconUrl ?? undefined,
        overallRating: feat.brokerOverallRating,
        pageUrl: feat.brokerPageUrl ?? undefined,
      };
      return <FxBrokerCardView data={brokerPayload} />;
    }
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span>+<br />Add item</span>
      </div>
    );
  }

  if (feat.header_type === 'image') {
    const src = feat.image_url_dark || feat.image_url_light;
    if (src) {
      return <img src={src} alt={feat.title || ''} className="scn-bento-editor__image-preview" />;
    }
    return (
      <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
        <span>Image tile</span>
      </div>
    );
  }

  return (
    <div className="scn-bento-editor__placeholder-card scn-bento-editor__placeholder-card--empty">
      <span>{BENTO_TILE_LABEL[feat.header_type] ?? 'Feature tile'}</span>
    </div>
  );
}

function BentoTileLayoutFields({
  feat,
  gridColumns,
  onPatch,
}: {
  feat: BentoGrid01Feature;
  gridColumns: number;
  onPatch: (patch: Partial<BentoGrid01Feature>) => void;
}) {
  const cols = normalizeGridColumns(gridColumns);
  const colSpan = normalizeColSpan(feat.col_span, cols);
  const rowSpan = normalizeRowSpan(feat.row_span);
  return (
    <div className="scn-bento-editor__layout-fields grid grid-cols-3 gap-2">
      <label className="flex flex-col gap-1 min-w-0">
        <span className="text-muted-foreground text-xs">Columns</span>
        <Select
          value={String(colSpan)}
          onChange={(e) => onPatch({ col_span: parseInt(e.target.value, 10) })}
        >
          {Array.from({ length: cols }, (_, i) => i + 1).map((n) => (
            <option key={n} value={String(n)}>{n}</option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 min-w-0">
        <span className="text-muted-foreground text-xs">Rows</span>
        <Select
          value={String(rowSpan)}
          onChange={(e) => onPatch({ row_span: parseInt(e.target.value, 10) })}
        >
          {[1, 2, 3].map((n) => (
            <option key={n} value={String(n)}>{n}</option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 min-w-0">
        <span className="text-muted-foreground text-xs">Row #</span>
        <Input
          type="number"
          min={1}
          placeholder="Auto"
          value={feat.row ?? ''}
          onChange={(e) => {
            const v = e.target.value.trim();
            onPatch({ row: v ? Math.max(1, parseInt(v, 10) || 1) : null });
          }}
        />
      </label>
    </div>
  );
}

function BentoFeaturePanel({ feat, resolved, searchUrl, stockPreviewUrl, forexPreviewUrl, marketMoversPreviewUrl, dividendsPreviewUrl, calendarPreviewUrl, brokerListUrl, gridColumns, onPatch, onRemove }: {
  feat: BentoGrid01Feature;
  resolved: ArticleResult | null | undefined;
  searchUrl: string;
  stockPreviewUrl: string;
  forexPreviewUrl: string;
  marketMoversPreviewUrl: string;
  dividendsPreviewUrl: string;
  calendarPreviewUrl: string;
  brokerListUrl: string;
  gridColumns: number;
  onPatch: (patch: Partial<BentoGrid01Feature>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const isWidgetTile = BENTO_WIDGET_TILE_TYPES.has(feat.header_type);

  function onStockTileContextMenu(e: React.MouseEvent) {
    if (feat.header_type !== 'stock_bars') return;
    e.preventDefault();
    const win = window as Window & {
      showMaterialPrompt?: (d: { title?: string; label?: string; value?: string }) => Promise<string | undefined>;
    };
    if (!win.showMaterialPrompt) return;
    void win.showMaterialPrompt({
      title: 'Stock symbols',
      label: 'Comma-separated tickers',
      value: (feat.stock_symbols ?? []).join(', '),
    }).then((raw) => {
      if (raw == null) return;
      onPatch({ stock_symbols: parseCommaTickers(raw) });
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            'scn-bento-editor__panel-content',
            isWidgetTile && 'scn-bento-editor__panel-content--widget',
          )}
          role="button"
          tabIndex={0}
          onContextMenu={feat.header_type === 'stock_bars' ? onStockTileContextMenu : undefined}
        >
          <span className="scn-bento-editor__panel-label">{BENTO_TILE_LABEL[feat.header_type] ?? 'Tile'}</span>
          <BentoFeaturePreview
            feat={feat}
            resolved={resolved}
            stockPreviewUrl={stockPreviewUrl}
            forexPreviewUrl={forexPreviewUrl}
            marketMoversPreviewUrl={marketMoversPreviewUrl}
            dividendsPreviewUrl={dividendsPreviewUrl}
            calendarPreviewUrl={calendarPreviewUrl}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="scn-popover-content scn-bento-editor__feat-popover"
        align="start"
        side="top"
        sideOffset={4}
        collisionPadding={12}
      >
        <div className="scn-bento-editor__feat-popover-body">
          <BentoTileLayoutFields feat={feat} gridColumns={gridColumns} onPatch={onPatch} />
          <div className="scn-bento-editor__card-row">
            <BentoTileTypeCombobox
              value={feat.header_type}
              onChange={(v) => {
                if (v === 'stock_bars') {
                  onPatch({
                    header_type: v,
                    stock_symbols: feat.stock_symbols?.length ? feat.stock_symbols : ['AAPL'],
                    stock_bars_cadence: feat.stock_bars_cadence ?? 'day',
                    stock_bars_limit: feat.stock_bars_limit ?? 180,
                  });
                } else if (v === 'market_movers') {
                  onPatch({
                    header_type: v,
                    market_region: feat.market_region ?? 'US',
                  });
                } else if (v === 'upcoming_dividends') {
                  onPatch({
                    header_type: v,
                    dividend_symbols: feat.dividend_symbols ?? [],
                    dividend_max_rows: feat.dividend_max_rows ?? 25,
                  });
                } else if (v === 'market_calendar') {
                  onPatch({
                    header_type: v,
                    calendar_market: feat.calendar_market ?? 'NASDAQ',
                    calendar_max_rows: feat.calendar_max_rows ?? 30,
                  });
                } else {
                  onPatch({ header_type: v });
                }
              }}
            />
          </div>
          {feat.header_type === 'image' && (
            <>
              <Input value={feat.image_url_light} placeholder="Image URL (light mode)"
                onChange={e => onPatch({ image_url_light: e.target.value })} />
              <Input value={feat.image_url_dark} placeholder="Image URL (dark mode)"
                onChange={e => onPatch({ image_url_dark: e.target.value })} />
            </>
          )}
          {feat.header_type === 'card' && (
            <>
              <ToggleGroup
                value={feat.mode ?? 'random'}
                onValueChange={v => {
                  if (v) onPatch({ mode: v as BentoGrid01Feature['mode'], articleId: null, articleTitle: null });
                }}
              >
                <ToggleGroupItem value="random">Random</ToggleGroupItem>
                <ToggleGroupItem value="priority">Priority</ToggleGroupItem>
                <ToggleGroupItem value="specific">Specific</ToggleGroupItem>
              </ToggleGroup>
              {feat.mode === 'specific' && (
                <ArticleSearchInput
                  value={{ id: feat.articleId ?? null, title: feat.articleTitle ?? null }}
                  onChange={v => onPatch({ articleId: v.id, articleTitle: v.title })}
                  searchUrl={searchUrl}
                />
              )}
              <div className="scn-bento-editor__card-style">
                <span className="scn-bento-editor__style-label">Text &amp; image layout</span>
                <ToggleGroup
                  className="scn-bento-editor__icon-toggle-group"
                  value={feat.cardImageLayout ?? 'text_on_top'}
                  onValueChange={(v) => {
                    if (v) onPatch({ cardImageLayout: v as CarouselCardTextImageLayout });
                  }}
                >
                  <ToggleGroupItem value="text_on_top" title="Text above image" aria-label="Text above image">
                    <PanelTop size={16} strokeWidth={1.75} aria-hidden />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="text_on_left" title="Text on the left, image on the right" aria-label="Text on the left, image on the right">
                    <PanelLeft size={16} strokeWidth={1.75} aria-hidden />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="text_on_right" title="Text on the right, image on the left" aria-label="Text on the right, image on the left">
                    <PanelRight size={16} strokeWidth={1.75} aria-hidden />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="text_only" title="Text only (no hero)" aria-label="Text only (no hero)">
                    <Type size={16} strokeWidth={1.75} aria-hidden />
                  </ToggleGroupItem>
                </ToggleGroup>
                {feat.cardImageLayout !== 'text_only' && (
                  <>
                    <span className="scn-bento-editor__style-label">Image scale</span>
                    <ToggleGroup
                      className="scn-bento-editor__icon-toggle-group"
                      value={feat.cardImageScale ?? 'bleed_under'}
                      onValueChange={(v) => {
                        if (v) onPatch({ cardImageScale: v as CarouselCardImageScale });
                      }}
                    >
                      <ToggleGroupItem value="scales_to_fit" title="Scales to fit" aria-label="Scales to fit">
                        <Shrink size={16} strokeWidth={1.75} aria-hidden />
                      </ToggleGroupItem>
                      <ToggleGroupItem value="bleed_under" title="Bleed under" aria-label="Bleed under">
                        <Maximize2 size={16} strokeWidth={1.75} aria-hidden />
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </>
                )}
                <span className="scn-bento-editor__style-label">Background opacity</span>
                <div className="scn-bento-editor__size-slider-row">
                  <Slider min={0} max={100} step={5}
                    value={[feat.cardBgOpacity ?? 100]}
                    onValueChange={([v]) => onPatch({ cardBgOpacity: v })} />
                  <span className="scn-bento-editor__size-value">{feat.cardBgOpacity ?? 100}%</span>
                </div>
              </div>
            </>
          )}
          {feat.header_type === 'fxbroker' && (
            <label className="flex flex-col gap-1.5 min-w-0">
              <span className="text-muted-foreground text-sm">Broker</span>
              <BrokerPickerCombobox
                brokerId={feat.brokerId}
                brokerName={feat.brokerName}
                brokerListUrl={brokerListUrl}
                onChange={(b) => onPatch({
                  brokerId: b.id,
                  brokerName: b.broker_name,
                  brokerFaviconUrl: b.favicon_url || null,
                  brokerOverallRating: b.overall_rating,
                  brokerPageUrl: b.page_url || null,
                })}
              />
            </label>
          )}
          {feat.header_type === 'richtext' && (
            <BentoTileRichTextEditor feat={feat} onChange={html => onPatch({ html })} />
          )}
          {feat.header_type === 'market_movers' && (
            <label className="flex flex-col gap-1.5 min-w-0">
              <span className="text-muted-foreground text-sm">Default region</span>
              <select
                className="scn-bento-editor__region-select"
                value={feat.market_region ?? 'US'}
                onChange={(e) => {
                  onPatch({ market_region: e.target.value as BentoGrid01Feature['market_region'] });
                }}
              >
                {MARKET_REGION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          )}
          {feat.header_type === 'upcoming_dividends' && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 min-w-0">
                <span className="text-muted-foreground text-sm">Tickers (optional)</span>
                <Input
                  value={(feat.dividend_symbols ?? []).join(', ')}
                  placeholder="e.g. AAPL, MSFT (blank = all enabled tickers)"
                  onChange={e => { onPatch({ dividend_symbols: parseCommaTickers(e.target.value) }); }}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-sm">
                  Max rows: <span className="tabular-nums text-foreground">{feat.dividend_max_rows ?? 25}</span>
                </span>
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={[feat.dividend_max_rows ?? 25]}
                  onValueChange={([v]) => onPatch({ dividend_max_rows: v })}
                />
              </label>
            </div>
          )}
          {feat.header_type === 'market_calendar' && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 min-w-0">
                <span className="text-muted-foreground text-sm">Market</span>
                <select
                  className="scn-bento-editor__region-select"
                  value={feat.calendar_market ?? 'NASDAQ'}
                  onChange={(e) => {
                    onPatch({ calendar_market: e.target.value as BentoGrid01Feature['calendar_market'] });
                  }}
                >
                  {CALENDAR_MARKET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-sm">
                  Max rows: <span className="tabular-nums text-foreground">{feat.calendar_max_rows ?? 30}</span>
                </span>
                <Slider
                  min={1}
                  max={90}
                  step={1}
                  value={[feat.calendar_max_rows ?? 30]}
                  onValueChange={([v]) => onPatch({ calendar_max_rows: v })}
                />
              </label>
            </div>
          )}
          {feat.header_type === 'stock_bars' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 items-end">
                <label className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-muted-foreground text-sm">Tickers</span>
                  <Input
                    value={(feat.stock_symbols ?? []).join(', ')}
                    placeholder="e.g. AAPL, MSFT"
                    onChange={e => { onPatch({ stock_symbols: parseCommaTickers(e.target.value) }); }}
                  />
                </label>
                <label className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-muted-foreground text-sm">Cadence</span>
                  <StockBarsCadenceCombobox
                    value={feat.stock_bars_cadence ?? 'day'}
                    onChange={(v) => onPatch({ stock_bars_cadence: v })}
                  />
                </label>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-sm">
                  Number of bars: <span className="tabular-nums text-foreground">{feat.stock_bars_limit ?? 180}</span>
                </span>
                <Slider
                  min={90}
                  max={360}
                  step={1}
                  value={[feat.stock_bars_limit ?? 180]}
                  onValueChange={([v]) => onPatch({ stock_bars_limit: v })}
                />
              </div>
              <span className="text-muted-foreground text-xs">Right-click the tile for quick ticker edit.</span>
            </div>
          )}
          {feat.header_type !== 'card' && !BENTO_WIDGET_TILE_TYPES.has(feat.header_type) && (
            <>
              <Input value={feat.title} placeholder="Title"
                onChange={e => onPatch({ title: e.target.value })} />
              <Input value={feat.description} placeholder="Description"
                onChange={e => onPatch({ description: e.target.value })} />
            </>
          )}
          <Button variant="outline" className="scn-editor-block__ctrl-btn--danger scn-bento-editor__remove-btn"
            onClick={() => { onRemove(); setOpen(false); }}>
            Remove tile
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BentoEditorEmptySlot({
  onPick,
}: {
  onPick: (type: BentoGrid01Feature['header_type']) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="scn-bento-editor__empty-column">
      <span className="scn-bento-editor__empty-column-label">Empty</span>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <button type="button" className="scn-empty-add-btn scn-bento-editor__empty-column-btn" aria-label="Add tile to column">
            <span className="scn-broker-carousel__add-icon">+</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="scn-popover-content scn-editor-add-block-menu" align="center">
          <BentoAddTilePopoverContent
            onPick={type => {
              onPick(type);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function BentoAddTilePopoverContent({
  onPick,
}: {
  onPick: (type: BentoGrid01Feature['header_type']) => void;
}) {
  return (
    <div className="scn-bento-editor__add-tile-cards">
      {BENTO_TILE_TYPES.map(bt => (
        <button
          key={bt.type}
          type="button"
          className="scn-bento-editor__add-tile-card-btn"
          onClick={() => onPick(bt.type)}
        >
          <Card className="scn-bento-editor__add-tile-card">
            <CardContent className="p-2.5">
              <p className="scn-bento-editor__add-tile-card-label">{BENTO_TILE_LABEL[bt.type]}</p>
              <p className="scn-bento-editor__add-tile-card-desc">{bt.desc}</p>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}

/** Live preview of badge + heading (matches public bento intro). */
function BentoBlockIntroHeader({
  block,
}: {
  block: Pick<BentoGrid01Block, 'heading' | 'badge_text' | 'show_badge'>;
}) {
  const showIntro =
    (block.show_badge !== false && block.badge_text) || Boolean(block.heading?.trim());
  if (!showIntro) return null;
  return (
    <div className="scn-bentogrid01__intro scn-bento-editor__intro-preview">
      {block.heading ? <h2 className="scn-bentogrid01__heading">{block.heading}</h2> : null}
      {block.show_badge !== false && block.badge_text ? (
        <div className="scn-taxonomy-content__bento-badge scn-bentogrid01__badge">
          {block.badge_text}
        </div>
      ) : null}
    </div>
  );
}

function BentoGrid01BlockHeaderFields({
  block,
  onChange,
  addOpen,
  onAddOpenChange,
  onAddTile,
}: {
  block: BentoGrid01Block;
  onChange: (b: BentoGrid01Block) => void;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  onAddTile: (headerType: BentoGrid01Feature['header_type']) => void;
}) {
  const [themeOpen, setThemeOpen] = React.useState(false);

  return (
    <div className="scn-editor-block__header-fields scn-editor-block__header-fields--bento-toolbar">
      <div className="scn-editor-block__bento-text-fields">
        <Input
          value={block.badge_text}
          placeholder="Badge"
          className="scn-editor-block__header-field"
          onChange={e => onChange({ ...block, badge_text: e.target.value })}
        />
        <Input
          value={block.heading}
          placeholder="Heading"
          className="scn-editor-block__header-field scn-editor-block__header-field--wide"
          onChange={e => onChange({ ...block, heading: e.target.value })}
        />
      </div>
      <div className="scn-editor-block__header-height scn-editor-block__bento-size">
        <label className="scn-bento-editor__size-auto-row">
          <Checkbox
            checked={!block.height || block.height === 'auto'}
            onCheckedChange={checked => onChange({ ...block, height: checked ? undefined : '320px' })}
          />
          <span>H auto</span>
        </label>
        {block.height && block.height !== 'auto' ? (
          <div className="scn-bento-editor__size-slider-row">
            <Slider
              min={320}
              max={1000}
              step={10}
              value={[parseInt(block.height, 10) || 320]}
              onValueChange={([v]) => onChange({ ...block, height: `${v}px` })}
            />
            <span className="scn-bento-editor__size-value">{block.height}</span>
          </div>
        ) : null}
      </div>
      <div className="scn-editor-block__header-height scn-editor-block__bento-size">
        <label className="scn-bento-editor__size-auto-row">
          <Checkbox
            checked={!block.width}
            onCheckedChange={checked => onChange({ ...block, width: checked ? undefined : '1200px' })}
          />
          <span>W full</span>
        </label>
        {block.width ? (
          <div className="scn-bento-editor__size-slider-row">
            <Slider
              min={480}
              max={1600}
              step={20}
              value={[parseInt(block.width, 10) || 1200]}
              onValueChange={([v]) => onChange({ ...block, width: `${v}px` })}
            />
            <span className="scn-bento-editor__size-value">{block.width}</span>
          </div>
        ) : null}
      </div>
      <Popover open={themeOpen} onOpenChange={setThemeOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="scn-bento-editor__toolbar-icon-btn"
            title="Theme settings"
            aria-label="Theme settings"
          >
            <Settings2 size={14} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="scn-popover-content scn-carousel-editor__popover scn-carousel-editor__settings-popover"
          align="end"
          collisionPadding={12}
        >
          <div className="scn-carousel-editor__settings-popover-body">
          <div className="scn-bento-editor__theme-field">
            <label>Theme</label>
            <Select
              value={block.theme ?? 'default'}
              onChange={e => onChange({ ...block, theme: e.target.value as BentoGrid01Block['theme'] })}
            >
              <option value="default">Default</option>
              <option value="inverted">Inverted</option>
              <option value="accent">Accent</option>
            </Select>
          </div>
          <div className="scn-bento-editor__theme-field">
            <label>Grid columns</label>
            <Select
              value={String(block.grid_columns ?? 3)}
              onChange={e => onChange(
                pruneBentoPanelSizesForGrid(
                  block,
                  normalizeGridColumns(parseInt(e.target.value, 10)),
                  normalizeGridRows(block.grid_rows),
                  block.grid_columns,
                ),
              )}
            >
              {[1, 2, 3, 4, 5, 6].map(n => (
                <option key={n} value={String(n)}>{n}</option>
              ))}
            </Select>
          </div>
          <div className="scn-bento-editor__theme-field">
            <label>Grid rows</label>
            <Select
              value={String(block.grid_rows ?? 3)}
              onChange={e => onChange(
                pruneBentoPanelSizesForGrid(
                  block,
                  normalizeGridColumns(block.grid_columns),
                  normalizeGridRows(parseInt(e.target.value, 10)),
                ),
              )}
            >
              {[1, 2, 3].map(n => (
                <option key={n} value={String(n)}>{n}</option>
              ))}
            </Select>
          </div>
          <div className="scn-bento-editor__theme-field">
            <label>Tile style</label>
            <Select
              value={block.tile_style ?? 'bordered'}
              onChange={e => onChange({ ...block, tile_style: e.target.value as BentoGrid01Block['tile_style'] })}
            >
              <option value="bordered">Bordered</option>
              <option value="shadow">Shadow</option>
              <option value="flat">Flat</option>
            </Select>
          </div>
          <div className="scn-bento-editor__theme-field">
            <label>Block background</label>
            <Select
              value={block.block_background ?? 'default'}
              onChange={e => onChange({
                ...block,
                block_background: e.target.value as BentoGrid01Block['block_background'],
              })}
            >
              <option value="default">Default (contained)</option>
              <option value="edge_to_edge">Edge to edge</option>
            </Select>
          </div>
          <label className="scn-bento-editor__size-auto-row">
            <Checkbox
              checked={block.show_badge !== false}
              onCheckedChange={checked => onChange({ ...block, show_badge: !!checked })}
            />
            <span>Show badge</span>
          </label>
          </div>
        </PopoverContent>
      </Popover>
      <Popover open={addOpen} onOpenChange={onAddOpenChange} modal={false}>
        <PopoverTrigger asChild>
          <button type="button" className="scn-bento-editor__toolbar-icon-btn" aria-label="Add tile">
            +
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="scn-popover-content scn-editor-add-block-menu scn-bento-editor__add-tile-popover"
          align="end"
          side="bottom"
        >
          <BentoAddTilePopoverContent
            onPick={type => {
              onAddTile(type);
              onAddOpenChange(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function BentoGrid01Editor({ block, searchUrl, stockPreviewUrl, forexPreviewUrl, marketMoversPreviewUrl, dividendsPreviewUrl, calendarPreviewUrl, brokerListUrl, termId, onChange, onAddTileInColumn, onAddTileInRow }: {
  block: BentoGrid01Block;
  searchUrl: string;
  stockPreviewUrl: string;
  forexPreviewUrl: string;
  marketMoversPreviewUrl: string;
  dividendsPreviewUrl: string;
  calendarPreviewUrl: string;
  brokerListUrl: string;
  termId: number;
  onChange: (b: BentoGrid01Block) => void;
  onAddTileInColumn: (colIndex: number, rowIndex: number, headerType: BentoGrid01Feature['header_type']) => void;
  onAddTileInRow: (rowIndex: number, headerType: BentoGrid01Feature['header_type']) => void;
}) {
  const cardSlots = React.useMemo(() => bentoCardFeaturesToSlots(block.features), [block.features]);
  const resolvedRandom = useResolvedCarouselPreviews(cardSlots, termId);
  const blockRef = React.useRef(block);
  blockRef.current = block;

  function patchFeature(featId: string, patch: Partial<BentoGrid01Feature>) {
    onChange({
      ...block,
      features: block.features.map(f => f.id === featId ? { ...f, ...patch } : f),
    });
  }

  function removeFeature(featId: string) {
    onChange({ ...block, features: block.features.filter(f => f.id !== featId) });
  }

  const gridColumns = normalizeGridColumns(block.grid_columns);
  const gridRows = normalizeGridRows(block.grid_rows);
  const sectionSizes = bentoSectionSizeStyles({ height: block.height, width: block.width });
  const hasFixedHeight = bentoSectionHasFixedHeight({ height: block.height });
  const layoutStorageKey = bentoEditorLayoutStorageKey(
    gridColumns,
    gridRows,
    { height: block.height, width: block.width },
    block.features,
  );

  const legacyPanelMigratedRef = React.useRef(false);
  React.useLayoutEffect(() => {
    if (legacyPanelMigratedRef.current) return;
    if (!block.panelSizes?.length || !tilesHaveDefaultSpans(block.features, gridColumns)) return;
    legacyPanelMigratedRef.current = true;
    const spanPatches = spansFromLegacyPanelSizes(
      block.panelSizes,
      block.features.length,
      gridColumns,
    );
    const { panelSizes: _removed, ...rest } = block;
    onChange({
      ...rest,
      features: block.features.map((f, i) => ({
        ...f,
        col_span: spanPatches[i]?.col_span ?? f.col_span,
        row_span: spanPatches[i]?.row_span ?? f.row_span,
      })),
    });
  }, [block.id, block.panelSizes, block.features, gridColumns, onChange]);

  return (
    <div
      className={cn(
        'scn-bento-editor',
        bentoGrid01SectionClassName({
          theme: block.theme,
          blockBackground: block.block_background,
          tileStyle: block.tile_style,
        }),
      )}
      style={sectionSizes.shell}
    >
      <BentoBlockIntroHeader block={block} />
      <BentoGridEditorLayout
        gridColumns={gridColumns}
        gridRows={gridRows}
        tiles={block.features}
        className={cn(
          'scn-bento-editor__layout-host',
          hasFixedHeight && 'scn-bento-editor__layout-host--fixed-h',
        )}
        style={sectionSizes.host}
        layoutStorageKey={layoutStorageKey}
        rowPanelSizes={block.row_panel_sizes}
        colPanelSizesByRow={block.col_panel_sizes_by_row}
        getTileKey={(f) => f.id}
        onLayoutPersist={(patch) =>
          onChange(applyBentoLayoutPersistPatch(blockRef.current, patch))}
        renderEmptyColumn={(colIndex, rowIndex) => (
          <BentoEditorEmptySlot
            onPick={type => onAddTileInColumn(colIndex, rowIndex, type)}
          />
        )}
        renderEmptyRow={(rowIndex) => (
          <BentoEditorEmptySlot
            onPick={type => onAddTileInRow(rowIndex, type)}
          />
        )}
        renderTile={(feat) => (
          <BentoFeaturePanel
            feat={feat}
            resolved={resolvedRandom[feat.id]}
            searchUrl={searchUrl}
            stockPreviewUrl={stockPreviewUrl}
            forexPreviewUrl={forexPreviewUrl}
            marketMoversPreviewUrl={marketMoversPreviewUrl}
            dividendsPreviewUrl={dividendsPreviewUrl}
            calendarPreviewUrl={calendarPreviewUrl}
            brokerListUrl={brokerListUrl}
            gridColumns={gridColumns}
            onPatch={patch => patchFeature(feat.id, patch)}
            onRemove={() => removeFeature(feat.id)}
          />
        )}
      />
    </div>
  );
}

// ─── Carousel Editor ──────────────────────────────────────────────────────────

const CAROUSEL_AUTOPLAY_DELAY_MS = 3500;

function carouselStackDepth(block: Pick<CarouselBlock, 'stackDepth'>): number {
  const n = block.stackDepth;
  if (n == null || !Number.isFinite(n)) return 3;
  return Math.min(4, Math.max(1, Math.round(n)));
}

function carouselAutoplayPlugins(infiniteScroll: boolean) {
  if (!infiniteScroll) {
    return undefined;
  }
  return [Autoplay({ delay: CAROUSEL_AUTOPLAY_DELAY_MS, stopOnInteraction: true })];
}

function carouselAutoplayOpts(infiniteScroll: boolean) {
  return { loop: Boolean(infiniteScroll) };
}

function CarouselAddTileMenu({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (headerType: BentoGrid01Feature['header_type']) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className="scn-bento-editor__toolbar-icon-btn" aria-label="Add tile">+</button>
      </PopoverTrigger>
      <PopoverContent className="scn-popover-content scn-editor-add-block-menu" align="end">
        {BENTO_TILE_TYPES.map(bt => (
          <button key={bt.type} type="button" className="scn-editor-add-block-item"
            onClick={() => { onAdd(bt.type); onOpenChange(false); }}>
            <span className="scn-editor-add-block-item__label">{BENTO_TILE_LABEL[bt.type]}</span>
            <span className="scn-editor-add-block-item__desc">{bt.desc}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function CarouselEditor({ block, searchUrl, stockPreviewUrl, forexPreviewUrl, marketMoversPreviewUrl, dividendsPreviewUrl, calendarPreviewUrl, brokerListUrl, termId, onChange }: {
  block: CarouselBlock;
  searchUrl: string;
  stockPreviewUrl: string;
  forexPreviewUrl: string;
  marketMoversPreviewUrl: string;
  dividendsPreviewUrl: string;
  calendarPreviewUrl: string;
  brokerListUrl: string;
  termId: number;
  onChange: (b: CarouselBlock) => void;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const features = block.features;
  const cardSlots = React.useMemo(() => bentoCardFeaturesToSlots(features), [features]);
  const resolvedRandom = useResolvedCarouselPreviews(cardSlots, termId);
  const infiniteScroll = Boolean(block.infiniteScroll);
  const stackDepth = carouselStackDepth(block);
  const allCards = carouselFeaturesAllCards(features);

  const cardFeaturesById = React.useMemo(() => {
    const m: Record<string, BentoGrid01Feature> = {};
    for (const f of features) {
      if (f.header_type === 'card') m[f.id] = f;
    }
    return m;
  }, [features]);

  const packedSlides = React.useMemo(
    () => {
      if (!allCards) return [];
      const vms = features.map((feat, index) =>
        resolveCarouselCardFeatureViewModel(feat, index, resolvedRandom, 'editor_preview'),
      ).filter((c): c is CarouselCardViewModel => c !== null);
      return packCarouselSlides(vms, { stackDepth });
    },
    [allCards, features, resolvedRandom, stackDepth],
  );

  function patchFeature(featId: string, patch: Partial<BentoGrid01Feature>) {
    onChange({
      ...block,
      features: features.map(f => f.id === featId ? { ...f, ...patch } : f),
    });
  }

  function removeFeature(featId: string) {
    onChange({ ...block, features: features.filter(f => f.id !== featId) });
  }

  function addCarouselFeature(headerType: BentoGrid01Feature['header_type']) {
    onChange({ ...block, features: [...features, createBentoFeatureOfType(headerType)] });
  }

  const previewFixedHeightStyle: React.CSSProperties | undefined =
    block.height && block.height !== 'auto'
      ? { height: block.height, minHeight: 0 }
      : undefined;

  const carouselHeaderTools = (
    <div className="scn-carousel-editor__header-controls">
      <CarouselAddTileMenu
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={addCarouselFeature}
      />
      {features.length > 0 ? (
        <>
          <CarouselPrevious />
          <CarouselNext />
        </>
      ) : null}
    </div>
  );

  return (
    <div className="scn-carousel-editor">
      {features.length === 0 && (
        <div className="scn-carousel-editor__header scn-carousel-editor__header--tools">
          <span className="scn-carousel-editor__count">
            {features.length} tiles
          </span>
          {carouselHeaderTools}
        </div>
      )}

      {features.length === 0 && (
        <div className="scn-bento-editor__empty">
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="scn-empty-add-btn" aria-label="Add tile">
                <span className="scn-broker-carousel__add-icon">+</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="scn-popover-content scn-editor-add-block-menu" align="end">
              {BENTO_TILE_TYPES.map(bt => (
                <button key={bt.type} type="button" className="scn-editor-add-block-item"
                  onClick={() => { addCarouselFeature(bt.type); setAddOpen(false); }}>
                  <span className="scn-editor-add-block-item__label">{BENTO_TILE_LABEL[bt.type]}</span>
                  <span className="scn-editor-add-block-item__desc">{bt.desc}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      )}

      {features.length > 0 && (
        <Carousel
          className={cn(
            'scn-carousel-editor__preview',
            block.height && block.height !== 'auto' && 'scn-carousel-editor__preview--fixed-h',
          )}
          style={previewFixedHeightStyle}
          opts={carouselAutoplayOpts(infiniteScroll)}
          plugins={carouselAutoplayPlugins(infiniteScroll)}
        >
          <div className="scn-carousel-editor__header scn-carousel-editor__header--tools">
            <span className="scn-carousel-editor__count">
              {features.length} tile{features.length !== 1 ? 's' : ''}
            </span>
            {carouselHeaderTools}
          </div>
          <CarouselContent>
            {allCards
              ? packedSlides.map((slide) => renderPackedCarouselEditorBentoSlide(
                slide,
                'scn-carousel-editor__preview-item',
                cardFeaturesById,
                searchUrl,
                stockPreviewUrl,
                forexPreviewUrl,
                marketMoversPreviewUrl,
                dividendsPreviewUrl,
                calendarPreviewUrl,
                brokerListUrl,
                resolvedRandom,
                patchFeature,
                removeFeature,
              ))
              : features.map((feat) => (
                <CarouselItem key={feat.id} className={cn('scn-carousel-editor__preview-item', 'carousel-slides__item')}>
                  <div className="scn-carousel-editor__hetero-tile">
                    <BentoFeaturePanel
                      feat={feat}
                      resolved={resolvedRandom[feat.id]}
                      searchUrl={searchUrl}
                      stockPreviewUrl={stockPreviewUrl}
                      forexPreviewUrl={forexPreviewUrl}
                      marketMoversPreviewUrl={marketMoversPreviewUrl}
                      dividendsPreviewUrl={dividendsPreviewUrl}
                      calendarPreviewUrl={calendarPreviewUrl}
                      brokerListUrl={brokerListUrl}
                      gridColumns={3}
                      onPatch={patch => patchFeature(feat.id, patch)}
                      onRemove={() => removeFeature(feat.id)}
                    />
                  </div>
                </CarouselItem>
              ))}
          </CarouselContent>
        </Carousel>
      )}
    </div>
  );
}

// ─── Carousel settings popover (rendered in BlockEditor header) ──────────────

function CarouselSettingsPopover({ block, onChange }: {
  block: CarouselBlock;
  onChange: (b: CarouselBlock) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [stackDepthComboOpen, setStackDepthComboOpen] = React.useState(false);
  const infiniteScroll = Boolean(block.infiniteScroll);
  const sd = carouselStackDepth(block);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="scn-carousel-editor__settings-btn" aria-label="Carousel settings">
          <Settings2 size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="scn-popover-content scn-carousel-editor__popover scn-carousel-editor__settings-popover"
        align="end"
        collisionPadding={12}
      >
        <div className="scn-carousel-editor__settings-popover-body">
          <Button
            type="button"
            variant="outline"
            className={cn('scn-carousel-editor__infinite-btn', infiniteScroll && 'scn-carousel-editor__infinite-btn--active')}
            onClick={() => onChange({ ...block, infiniteScroll: !infiniteScroll })}
            aria-pressed={infiniteScroll}
          >
            <InfinityIcon size={14} />
            Infinite scroll
          </Button>
          <p className="scn-carousel-editor__settings-hint text-muted-foreground text-xs">
            On: auto-advance and loop. Off: arrows only (no auto-play, no wrap).
          </p>
          <label className="scn-bento-editor__size-auto-row">
            <Checkbox checked={!block.height || block.height === 'auto'}
              onCheckedChange={checked => onChange({ ...block, height: checked ? undefined : '320px' })} />
            <span>Auto height</span>
          </label>
          {block.height && block.height !== 'auto' && (
            <div className="scn-bento-editor__size-slider-row">
              <Slider min={320} max={1000} step={10}
                value={[parseInt(block.height, 10) || 320]}
                onValueChange={([v]) => onChange({ ...block, height: `${v}px` })} />
              <span className="scn-bento-editor__size-value">{block.height}</span>
            </div>
          )}
          <div className="scn-carousel-editor__stack-depth">
            <span className="scn-bento-editor__style-label">Cards per stacked slide</span>
            <p className="text-muted-foreground text-xs mb-1.5">When several imageless article tiles sit together, pack up to this many per slide (1 = never stack).</p>
            <Popover open={stackDepthComboOpen} onOpenChange={setStackDepthComboOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="scn-carousel-editor__stack-combobox-trigger"
                  aria-expanded={stackDepthComboOpen} aria-label="Cards per stacked slide">
                  <span className="scn-carousel-editor__stack-combobox-trigger-label">
                    {sd === 1 ? '1 (never stack)' : `${sd} cards`}
                  </span>
                  <ChevronsUpDown size={14} className="shrink-0 opacity-60" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="scn-popover-content scn-carousel-editor__stack-combobox-popover"
                align="start" sideOffset={4} collisionPadding={12}>
                <Command shouldFilter={false}>
                  <CommandList>
                    <CommandGroup>
                      {[1, 2, 3, 4].map(n => (
                        <CommandItem key={n} value={`stack-depth-${n}`}
                          onSelect={() => { onChange({ ...block, stackDepth: n }); setStackDepthComboOpen(false); }}>
                          <Check size={14} className={cn(sd === n ? 'opacity-100' : 'opacity-0')} aria-hidden />
                          {n === 1 ? '1 — never stack' : `${n} cards per slide`}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Block wrapper ────────────────────────────────────────────────────────────

const BLOCK_LABEL: Record<string, string> = {
  heading: 'Heading', paragraph: 'Paragraph', image: 'Image', embed: 'Embed',
  separator: 'Separator', bento_grid_01: 'Bento block', carousel: 'Carousel',
};

function BlockEditor({ block, index, total, termId, uploadUrl, articleSearchUrl, stockPreviewUrl, forexPreviewUrl, marketMoversPreviewUrl, dividendsPreviewUrl, calendarPreviewUrl, brokerListUrl, onChange, onRemove, onMove }: {
  block: TaxonomyBlock; index: number; total: number;
  termId: number;
  uploadUrl: string; articleSearchUrl: string; stockPreviewUrl: string;
  forexPreviewUrl: string; marketMoversPreviewUrl: string;
  dividendsPreviewUrl: string; calendarPreviewUrl: string; brokerListUrl: string;
  onChange: (b: TaxonomyBlock) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const [bentoAddTileOpen, setBentoAddTileOpen] = React.useState(false);

  function addBentoTile(headerType: BentoGrid01Feature['header_type']) {
    if (block.type !== 'bento_grid_01') return;
    onChange({
      ...block,
      features: [...block.features, createBentoFeatureOfType(headerType)],
    });
    setBentoAddTileOpen(false);
  }

  function addBentoTileInColumn(colIndex: number, rowIndex: number, headerType: BentoGrid01Feature['header_type']) {
    if (block.type !== 'bento_grid_01') return;
    const feat = createBentoFeatureOfType(headerType);
    feat.col = colIndex + 1;
    feat.row = rowIndex + 1;
    feat.col_span = 1;
    feat.row_span = 1;
    onChange({
      ...block,
      features: [...block.features, feat],
    });
  }

  function addBentoTileInRow(rowIndex: number, headerType: BentoGrid01Feature['header_type']) {
    if (block.type !== 'bento_grid_01') return;
    const feat = createBentoFeatureOfType(headerType);
    feat.row = rowIndex + 1;
    feat.col_span = 1;
    feat.row_span = 1;
    onChange({
      ...block,
      features: [...block.features, feat],
    });
  }

  return (
    <div className="scn-editor-block">
      <div className="scn-editor-block__header">
        <span className="scn-editor-block__type">{BLOCK_LABEL[block.type] ?? block.type}</span>
        {block.type === 'bento_grid_01' ? (
          <BentoGrid01BlockHeaderFields
            block={block}
            onChange={onChange as (b: BentoGrid01Block) => void}
            addOpen={bentoAddTileOpen}
            onAddOpenChange={setBentoAddTileOpen}
            onAddTile={addBentoTile}
          />
        ) : null}
        <div className={cn(
          'scn-editor-block__controls',
          block.type === 'bento_grid_01' && 'scn-editor-block__controls--bento-toolbar',
        )}>
          {block.type === 'carousel' && (
            <CarouselSettingsPopover
              block={block}
              onChange={onChange as (b: CarouselBlock) => void}
            />
          )}
          <button className="scn-editor-block__ctrl-btn" onClick={() => onMove(-1)}
            disabled={index === 0} aria-label="Move up" title="Move up">↑</button>
          <button className="scn-editor-block__ctrl-btn" onClick={() => onMove(1)}
            disabled={index === total - 1} aria-label="Move down" title="Move down">↓</button>
          <button className="scn-editor-block__ctrl-btn scn-editor-block__ctrl-btn--danger"
            onClick={onRemove} aria-label="Remove block" title="Remove">×</button>
        </div>
      </div>
      <div className="scn-editor-block__body">
        {block.type === 'heading'   && <HeadingEditor   block={block} onChange={onChange as (b: HeadingBlock) => void} />}
        {block.type === 'paragraph' && <ParagraphEditor block={block} uploadUrl={uploadUrl} onChange={onChange as (b: ParagraphBlock) => void} />}
        {block.type === 'image'     && <ImageEditor     block={block} uploadUrl={uploadUrl} onChange={onChange as (b: ImageBlock) => void} />}
        {block.type === 'embed'     && <EmbedEditor     block={block} onChange={onChange as (b: EmbedBlock) => void} />}
        {block.type === 'separator' && <SeparatorEditor />}
        {block.type === 'bento_grid_01' && (
          <BentoGrid01Editor
            block={block}
            searchUrl={articleSearchUrl}
            stockPreviewUrl={stockPreviewUrl}
            forexPreviewUrl={forexPreviewUrl}
            marketMoversPreviewUrl={marketMoversPreviewUrl}
            dividendsPreviewUrl={dividendsPreviewUrl}
            calendarPreviewUrl={calendarPreviewUrl}
            brokerListUrl={brokerListUrl}
            termId={termId}
            onChange={onChange as (b: BentoGrid01Block) => void}
            onAddTileInColumn={addBentoTileInColumn}
            onAddTileInRow={addBentoTileInRow}
          />
        )}
        {block.type === 'carousel' && (
          <CarouselEditor
            block={block}
            searchUrl={articleSearchUrl}
            stockPreviewUrl={stockPreviewUrl}
            forexPreviewUrl={forexPreviewUrl}
            marketMoversPreviewUrl={marketMoversPreviewUrl}
            dividendsPreviewUrl={dividendsPreviewUrl}
            calendarPreviewUrl={calendarPreviewUrl}
            brokerListUrl={brokerListUrl}
            termId={termId}
            onChange={onChange as (b: CarouselBlock) => void}
          />
        )}
      </div>
    </div>
  );
}

// ─── Add Block Menu ───────────────────────────────────────────────────────────

function AddBlockMenu({ onAdd }: { onAdd: (type: TaxonomyBlock['type']) => void }) {
  const [open, setOpen] = React.useState(false);
  const types: Array<{ type: TaxonomyBlock['type']; desc: string }> = [
    { type: 'heading',   desc: 'H1 or H2 section title' },
    { type: 'paragraph', desc: 'Rich text block' },
    { type: 'image',     desc: 'Uploaded image' },
    { type: 'embed',     desc: 'YouTube, Twitter…' },
    { type: 'separator', desc: 'Horizontal rule' },
    { type: 'bento_grid_01', desc: 'Feature showcase bento grid' },
    { type: 'carousel',  desc: 'Infinite article carousel' },
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="scn-editor-add-block">+ Add block</Button>
      </PopoverTrigger>
      <PopoverContent className="scn-popover-content scn-editor-add-block-menu" align="start">
        {types.map(bt => (
          <button key={bt.type} className="scn-editor-add-block-item"
            onClick={() => { onAdd(bt.type); setOpen(false); }}>
            <span className="scn-editor-add-block-item__label">{BLOCK_LABEL[bt.type]}</span>
            <span className="scn-editor-add-block-item__desc">{bt.desc}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ─── Read-only renderer ───────────────────────────────────────────────────────

function bentoCardFeaturesToSlots(features: BentoGrid01Feature[]): CarouselSlot[] {
  return features
    .filter(f => f.header_type === 'card')
    .map(f => ({
      id: f.id,
      mode: f.mode ?? 'random',
      articleId: f.articleId ?? null,
      articleTitle: f.articleTitle ?? null,
    }));
}

function ReadOnlyBlock({
  block,
  termId,
  stockPreviewUrl,
  forexPreviewUrl,
  marketMoversPreviewUrl,
  dividendsPreviewUrl,
  calendarPreviewUrl,
}: {
  block: TaxonomyBlock;
  termId: number;
  stockPreviewUrl: string;
  forexPreviewUrl: string;
  marketMoversPreviewUrl: string;
  dividendsPreviewUrl: string;
  calendarPreviewUrl: string;
}) {
  const previewSlots = React.useMemo(() => {
    if (block.type === 'carousel') return bentoCardFeaturesToSlots(block.features);
    if (block.type === 'bento_grid_01') return bentoCardFeaturesToSlots(block.features);
    return [];
  }, [block]);
  const resolvedRandom = useResolvedCarouselPreviews(previewSlots, termId);

  if (block.type === 'heading') {
    const Tag = block.level as 'h1' | 'h2';
    return <Tag className="scn-taxonomy-content__heading">{block.text}</Tag>;
  }

  if (block.type === 'paragraph') {
    return (
      <div className="scn-taxonomy-content__paragraph"
        dangerouslySetInnerHTML={{ __html: block.html }} />
    );
  }

  if (block.type === 'image') {
    return block.imageUrl
      ? <img src={block.imageUrl} alt="" className="scn-taxonomy-content__image" />
      : null;
  }

  if (block.type === 'embed') {
    return block.url
      ? (
        <div className="scn-taxonomy-content__embed">
          <iframe src={block.url} title="Embed" allowFullScreen />
        </div>
      )
      : null;
  }

  if (block.type === 'separator') {
    return <hr className="scn-taxonomy-content__sep scn-taxonomy-content__sep--horizontal" />;
  }

  if (block.type === 'bento_grid_01') {
    const features = block.features;
    const gridColumns = normalizeGridColumns(block.grid_columns);
    const gridRows = normalizeGridRows(block.grid_rows);
    const sectionSizes = bentoSectionSizeStyles({ height: block.height, width: block.width });
    const hasFixedHeight = bentoSectionHasFixedHeight({ height: block.height });
    const layoutStorageKey = bentoEditorLayoutStorageKey(
      gridColumns,
      gridRows,
      { height: block.height, width: block.width },
      features,
    );

    function renderReadOnlyPanel(f: BentoGrid01Feature) {
      const isWidgetTile = BENTO_WIDGET_TILE_TYPES.has(f.header_type);
      return (
        <div
          key={f.id}
          className={cn(
            'scn-bento-readonly__panel',
            f.header_type === 'card' && 'scn-bento-readonly__panel--card',
            isWidgetTile && 'scn-bento-readonly__panel--widget',
          )}
        >
          <BentoFeaturePreview
            feat={f}
            resolved={resolvedRandom[f.id]}
            linkable
            stockPreviewUrl={stockPreviewUrl}
            forexPreviewUrl={forexPreviewUrl}
            marketMoversPreviewUrl={marketMoversPreviewUrl}
            dividendsPreviewUrl={dividendsPreviewUrl}
            calendarPreviewUrl={calendarPreviewUrl}
          />
        </div>
      );
    }

    const gridContent = features.length > 0 ? (
      <BentoGridEditorLayout
        gridColumns={gridColumns}
        gridRows={gridRows}
        tiles={features}
        resizable={false}
        layoutStorageKey={layoutStorageKey}
        rowPanelSizes={block.row_panel_sizes}
        colPanelSizesByRow={block.col_panel_sizes_by_row}
        className={cn(
          'scn-bento-editor__layout-host',
          hasFixedHeight && 'scn-bento-editor__layout-host--fixed-h',
        )}
        style={sectionSizes.host}
        getTileKey={(f) => f.id}
        renderEmptyColumn={() => null}
        renderEmptyRow={() => null}
        renderTile={(f) => renderReadOnlyPanel(f)}
      />
    ) : null;

    return (
      <div
        className={cn(
          'scn-taxonomy-content__bento-preview',
          'scn-bento-readonly-surface',
          bentoGrid01SectionClassName({
            theme: block.theme,
            blockBackground: block.block_background,
            tileStyle: block.tile_style,
          }),
        )}
        style={sectionSizes.shell}
      >
        <div className="scn-bentogrid01__inner">
          {((block.show_badge !== false && block.badge_text) || block.heading) ? (
            <div className="scn-bentogrid01__intro">
              {block.heading ? <h2 className="scn-bentogrid01__heading">{block.heading}</h2> : null}
              {block.show_badge !== false && block.badge_text ? (
                <div className="scn-taxonomy-content__bento-badge scn-bentogrid01__badge">{block.badge_text}</div>
              ) : null}
            </div>
          ) : null}
          {gridContent}
        </div>
      </div>
    );
  }

  if (block.type === 'carousel') {
    const infiniteScroll = Boolean(block.infiniteScroll);
    const features = block.features;
    const blockHeight = block.height && block.height !== 'auto' ? block.height : undefined;
    const wrapStyle: React.CSSProperties | undefined = blockHeight
      ? { height: blockHeight, minHeight: 0, flexShrink: 0 }
      : undefined;

    const carouselWrapClass = cn(
      'scn-taxonomy-content__carousel-wrap',
      blockHeight && 'scn-taxonomy-content__carousel-wrap--fixed-h',
    );

    if (features.length === 0) {
      return null;
    }

    if (carouselFeaturesAllCards(features)) {
      const sd = carouselStackDepth(block);
      const packedSlides = packCarouselSlides(
        features
          .map((feat, index) => resolveCarouselCardFeatureViewModel(feat, index, resolvedRandom, 'readonly'))
          .filter((card): card is CarouselCardViewModel => card !== null),
        { stackDepth: sd },
      );
      if (packedSlides.length === 0) {
        return null;
      }
      return (
        <div className={carouselWrapClass} style={wrapStyle}>
          <Carousel
            opts={carouselAutoplayOpts(infiniteScroll)}
            plugins={carouselAutoplayPlugins(infiniteScroll)}
          >
            <CarouselContent>
              {packedSlides.map((slide) => renderPackedTaxonomyCarouselSlide(slide, 'scn-taxonomy-content__carousel-item'))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>
      );
    }

    return (
      <div className={carouselWrapClass} style={wrapStyle}>
        <Carousel
          opts={carouselAutoplayOpts(infiniteScroll)}
          plugins={carouselAutoplayPlugins(infiniteScroll)}
        >
          <CarouselContent>
            {features.map((feat) => (
              <CarouselItem key={feat.id} className={cn('scn-taxonomy-content__carousel-item', 'carousel-slides__item')}>
                <div className="scn-carousel-readonly__tile">
                  <BentoFeaturePreview
                    feat={feat}
                    resolved={resolvedRandom[feat.id]}
                    linkable
                    stockPreviewUrl={stockPreviewUrl}
                    forexPreviewUrl={forexPreviewUrl}
                    marketMoversPreviewUrl={marketMoversPreviewUrl}
                    dividendsPreviewUrl={dividendsPreviewUrl}
                    calendarPreviewUrl={calendarPreviewUrl}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    );
  }

  return null;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }: {
  message: string; type: 'success' | 'error'; onDismiss: () => void;
}) {
  React.useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);
  return (
    <div className={`scn-editor-toast scn-editor-toast--${type}`} onClick={onDismiss}>
      {message}
    </div>
  );
}

function TaxonomyEditorSaveBar({
  saving,
  lastSaved,
  onSave,
  variant = 'top',
}: {
  saving: boolean;
  lastSaved: Date | null;
  onSave: () => void;
  variant?: 'top' | 'bottom';
}) {
  const barClass =
    variant === 'bottom'
      ? 'scn-taxonomy-editor__save-bar scn-taxonomy-editor__save-bar--footer'
      : 'scn-taxonomy-editor__save-bar';
  return (
    <div className={barClass}>
      <Button onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      {lastSaved && (
        <span className="scn-taxonomy-editor__saved">
          Saved {lastSaved.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

function TaxonomyEditor({
  termId,
  initialJson,
  canEdit,
  saveUrl,
  uploadUrl,
  articleSearchUrl,
  stockPreviewUrl,
  forexPreviewUrl,
  marketMoversPreviewUrl,
  dividendsPreviewUrl,
  calendarPreviewUrl,
  brokerListUrl,
}: {
  termId: number;
  initialJson: object | null;
  canEdit: boolean;
  saveUrl: string;
  uploadUrl: string;
  articleSearchUrl: string;
  stockPreviewUrl: string;
  forexPreviewUrl: string;
  marketMoversPreviewUrl: string;
  dividendsPreviewUrl: string;
  calendarPreviewUrl: string;
  brokerListUrl: string;
}) {
  const [blocks, setBlocks] = React.useState<TaxonomyBlock[]>(() => jsonToBlocks(initialJson));
  const [saving, setSaving] = React.useState(false);
  const [lastSaved, setLastSaved] = React.useState<Date | null>(null);
  const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function notify(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = { term_id: termId, content_json: blocksToJson(blocks) };
      const res = await api(saveUrl, { method: 'POST', body: JSON.stringify(payload) });
      const json = await res.json();
      if (res.ok) { setLastSaved(new Date()); notify('Saved'); }
      else notify(json.error || 'Save failed', 'error');
    } catch { notify('Save failed', 'error'); }
    finally { setSaving(false); }
  }

  function addBlock(type: TaxonomyBlock['type']) {
    const id = uid();
    const newBlock: TaxonomyBlock = (() => {
      switch (type) {
        case 'heading':   return { id, type: 'heading',   level: 'h2', text: '' };
        case 'paragraph': return { id, type: 'paragraph', html: '' };
        case 'image':     return { id, type: 'image',     imageId: null, imageUrl: null };
        case 'embed':     return { id, type: 'embed',     url: '' };
        case 'separator': return { id, type: 'separator' };
        case 'bento_grid_01': return {
          id,
          type: 'bento_grid_01',
          badge_text: 'Features',
          heading: '',
          features: [],
          theme: 'default',
          tile_style: 'bordered',
          block_background: 'default',
          show_badge: true,
          grid_columns: 3,
          grid_rows: 3,
        };
        case 'carousel': return {
          id,
          type: 'carousel',
          features: [createBentoFeatureOfType('card')],
          infiniteScroll: false,
          stackDepth: 3,
        };
      }
    })();
    setBlocks(prev => [...prev, newBlock]);
  }

  function moveBlock(index: number, dir: -1 | 1) {
    setBlocks(prev => {
      const next = [...prev];
      const swap = index + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  }

  if (!canEdit) {
    return (
      <div className="scn-taxonomy-content">
        {blocks.map(block => (
          <ReadOnlyBlock
            key={block.id}
            block={block}
            termId={termId}
            stockPreviewUrl={stockPreviewUrl}
            forexPreviewUrl={forexPreviewUrl}
            marketMoversPreviewUrl={marketMoversPreviewUrl}
            dividendsPreviewUrl={dividendsPreviewUrl}
            calendarPreviewUrl={calendarPreviewUrl}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="scn-taxonomy-editor">
      <TaxonomyEditorSaveBar saving={saving} lastSaved={lastSaved} onSave={handleSave} />

      <div className="scn-editor-body">
        {blocks.map((block, i) => (
          <BlockEditor
            key={block.id}
            block={block}
            index={i}
            total={blocks.length}
            termId={termId}
            uploadUrl={uploadUrl}
            articleSearchUrl={articleSearchUrl}
            stockPreviewUrl={stockPreviewUrl}
            forexPreviewUrl={forexPreviewUrl}
            marketMoversPreviewUrl={marketMoversPreviewUrl}
            dividendsPreviewUrl={dividendsPreviewUrl}
            calendarPreviewUrl={calendarPreviewUrl}
            brokerListUrl={brokerListUrl}
            onChange={updated => setBlocks(prev => prev.map((b, j) => j === i ? updated : b))}
            onRemove={() => setBlocks(prev => prev.filter((_, j) => j !== i))}
            onMove={dir => moveBlock(i, dir)}
          />
        ))}
        <AddBlockMenu onAdd={addBlock} />
      </div>

      <TaxonomyEditorSaveBar saving={saving} lastSaved={lastSaved} onSave={handleSave} variant="bottom" />

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────

const taxonomyEditorRoots = new WeakMap<HTMLElement, Root>();

export function mountTaxonomyEditor(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-taxonomy-editor]').forEach(host => {
    if (host.dataset['shadcnTaxonomyEditorBound'] === '1') return;
    const termId = parseInt(host.dataset['termId'] ?? '', 10);
    const jsonId = host.dataset['jsonId'] ?? '';
    const canEdit = host.dataset['canEdit'] === '1';
    const saveUrl = host.dataset['saveUrl'] ?? '';
    const uploadUrl = host.dataset['uploadUrl'] ?? '';
    const articleSearchUrl = host.dataset['articleSearchUrl'] ?? '';
    const stockPreviewUrl = host.dataset['stockPreviewUrl'] ?? '';
    const forexPreviewUrl = host.dataset['forexPreviewUrl'] ?? '';
    const marketMoversPreviewUrl = host.dataset['marketMoversPreviewUrl'] ?? '';
    const dividendsPreviewUrl = host.dataset['dividendsPreviewUrl'] ?? '';
    const calendarPreviewUrl = host.dataset['calendarPreviewUrl'] ?? '';
    const brokerListUrl = host.dataset['brokerListUrl'] ?? '';
    if (!termId) return;

    let initialJson: object | null = null;
    if (jsonId) {
      const scriptEl = document.getElementById(jsonId);
      if (scriptEl) {
        try { initialJson = JSON.parse(scriptEl.textContent ?? ''); } catch { /* ignore */ }
      }
    }

    host.dataset['shadcnTaxonomyEditorBound'] = '1';
    let root = taxonomyEditorRoots.get(host);
    if (!root) { root = createRoot(host); taxonomyEditorRoots.set(host, root); }
    root.render(
      <TaxonomyEditor
        termId={termId}
        initialJson={initialJson}
        canEdit={canEdit}
        saveUrl={saveUrl}
        uploadUrl={uploadUrl}
        articleSearchUrl={articleSearchUrl}
        stockPreviewUrl={stockPreviewUrl}
        forexPreviewUrl={forexPreviewUrl}
        marketMoversPreviewUrl={marketMoversPreviewUrl}
        dividendsPreviewUrl={dividendsPreviewUrl}
        calendarPreviewUrl={calendarPreviewUrl}
        brokerListUrl={brokerListUrl}
      />
    );
  });
}
