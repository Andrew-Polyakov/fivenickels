import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Autoplay from 'embla-carousel-autoplay';

import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, type Editor, type ReactNodeViewProps } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

import { Infinity as InfinityIcon, Settings2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { RteToolbar, TABLE_EXTENSIONS } from '../components/ui/rte-editor';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '../components/ui/carousel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../components/ui/resizable';
import { Slider } from '../components/ui/slider';
import { Checkbox } from '../components/ui/checkbox';
import {
  hasCarouselCardImage,
  packCarouselSlides,
  type CarouselCardFontColorKey,
  type CarouselCardImageLayout,
  type CarouselCardViewModel,
  type CarouselPackedSlide,
} from './carousel-slide-packing';

import StockBarsTile from '../components/shadcn-space/blocks/bento-grid-01/StockBarsTile';
import type { StockBarPoint, StockChipPayload } from '../components/shadcn-space/blocks/bento-grid-01/StockBarsTile';

// ─── Types ────────────────────────────────────────────────────────────────────

type HeadingBlock   = { id: string; type: 'heading';   level: 'h1' | 'h2'; text: string };
type ParagraphBlock = { id: string; type: 'paragraph'; html: string };
type ImageBlock     = { id: string; type: 'image';     imageId: number | null; imageUrl: string | null };
type EmbedBlock     = { id: string; type: 'embed';     url: string };
type SeparatorBlock = { id: string; type: 'separator'; orientation: 'horizontal' | 'vertical' };

type BentoGrid01Feature = {
  id: string;
  header_type: 'reminder_animation' | 'animated_ui_block' | 'image' | 'card' | 'richtext' | 'stock_bars';
  image_url_light: string;
  image_url_dark: string;
  title: string;
  description: string;
  col_span: '4' | '8';
  mode?: 'random' | 'priority' | 'specific';
  articleId?: number | null;
  articleTitle?: string | null;
  html?: string;
  cardBgOpacity?: number;
  cardFontColor?: CarouselCardFontColorKey;
  cardImageLayout?: CarouselCardImageLayout;
  /** Stock bars tile: first symbol → chart; all symbols → chips (persisted JSON). */
  stock_symbols?: string[];
  /** Alpaca cadence: day = 1Day bars, week = 1Week, month = 1Month. */
  stock_bars_cadence?: 'day' | 'week' | 'month';
  /** Bar count for chart (90–360); server clamps. */
  stock_bars_limit?: number;
};
type BentoGrid01Block  = {
  id: string; type: 'bento_grid_01'; badge_text: string; heading: string; features: BentoGrid01Feature[];
  panelSizes?: number[];
  height?: string;
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
    col_span: '4' as const,
    mode: slot.mode,
    articleId: slot.articleId,
    articleTitle: slot.articleTitle,
  }));
}

/** Exported for tests — normalize a carousel block from persisted JSON (legacy `cards` → `features`). */
export function normalizeCarouselBlockFromJson(raw: Record<string, unknown>): CarouselBlock | null {
  if (raw['type'] !== 'carousel' || typeof raw['id'] !== 'string') return null;
  const rawFeatures = raw['features'];
  let features: BentoGrid01Feature[] = [];
  if (Array.isArray(rawFeatures) && rawFeatures.length > 0) {
    features = rawFeatures.filter((f): f is BentoGrid01Feature =>
      typeof f === 'object' && f !== null && typeof (f as BentoGrid01Feature).id === 'string'
        && typeof (f as BentoGrid01Feature).header_type === 'string',
    ) as BentoGrid01Feature[];
  }
  if (features.length === 0 && Array.isArray(raw['cards'])) {
    const cards = raw['cards'].filter((c): c is CarouselSlot =>
      typeof c === 'object' && c !== null && typeof (c as CarouselSlot).id === 'string',
    );
    features = legacyCarouselSlotsToFeatures(cards);
  }
  const infiniteScroll = typeof raw['infiniteScroll'] === 'boolean' ? raw['infiniteScroll'] as boolean : undefined;
  const height = typeof raw['height'] === 'string' ? raw['height'] : undefined;
  return {
    id: raw['id'],
    type: 'carousel',
    features,
    ...(infiniteScroll !== undefined ? { infiniteScroll } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

function normalizeTaxonomyBlock(raw: Record<string, unknown>): TaxonomyBlock | null {
  const t = raw['type'];
  if (typeof t !== 'string') return null;
  if (t === 'carousel') {
    return normalizeCarouselBlockFromJson(raw);
  }
  return raw as TaxonomyBlock;
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
  return { version: 1, blocks };
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
    imageLayout,
  } = props;
  const publishedLabel = publishedAt?.trim() || '';
  const imageless = !hasCarouselCardImage({ imageUrl });
  const sentimentIconSrc = carouselCatalystIconSrc(catalyst);
  const tagList = (tags ?? []).slice(0, 5);
  const opacityPct = bgOpacity ?? 100;
  const bodyBackground = `rgba(0, 0, 0, ${opacityPct / 100})`;
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
              className="scn-catalyst-icon scn-article-card__catalyst-icon"
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

  const legacyMediaEl = !imageless ? (
    <div className="carousel-article-card__media">
      <img src={imageUrl ?? ''} alt={title} className="carousel-article-card__img" />
    </div>
  ) : null;

  let layoutModClass: string;
  let cardChildren: React.ReactNode;

  if (imageless) {
    layoutModClass = 'carousel-article-card--imageless';
    cardChildren = (
      <>
        {bodyEl}
        {footerEl}
      </>
    );
  } else if (imageLayout === 'fit_under') {
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
  } else if (imageLayout === 'scales_fit_top') {
    layoutModClass = 'carousel-article-card--scales-top';
    cardChildren = (
      <>
        <div className="carousel-article-card__media carousel-article-card__media--contain-slot">
          <img src={imageUrl ?? ''} alt={title} className="carousel-article-card__img carousel-article-card__img--contain" />
        </div>
        {bodyEl}
        {footerEl}
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
    fontColor: feat.cardFontColor,
    imageLayout: feat.cardImageLayout ?? 'fit_under',
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

function SeparatorEditor({ block, onChange }: { block: SeparatorBlock; onChange: (b: SeparatorBlock) => void }) {
  return (
    <div className="scn-editor-block__fields">
      <Select value={block.orientation}
        onChange={e => onChange({ ...block, orientation: e.target.value as 'horizontal' | 'vertical' })}>
        <option value="horizontal">Horizontal</option>
        <option value="vertical">Vertical</option>
      </Select>
    </div>
  );
}

// ─── Bento Grid 01 Editor ─────────────────────────────────────────────────────

const BENTO_TILE_LABEL: Record<string, string> = {
  image: 'Image tile',
  reminder_animation: 'Reminder Animation',
  animated_ui_block: 'Animated UI Block',
  card: 'Article card',
  richtext: 'Rich text',
  stock_bars: 'Stock bars',
};

const BENTO_TILE_TYPES: Array<{ type: BentoGrid01Feature['header_type']; desc: string }> = [
  { type: 'image',              desc: 'Light / dark image pair' },
  { type: 'reminder_animation', desc: 'Built-in reminder animation' },
  { type: 'animated_ui_block',  desc: 'Built-in animated UI block' },
  { type: 'card',               desc: 'Resolved article card' },
  { type: 'richtext',           desc: 'Formatted rich text content' },
  { type: 'stock_bars',         desc: 'OHLC chart + ticker chips (cadence & bar count)' },
];

function createBentoFeatureOfType(headerType: BentoGrid01Feature['header_type']): BentoGrid01Feature {
  const base = { id: uid(), image_url_light: '', image_url_dark: '', title: '', description: '', col_span: '4' as const };
  if (headerType === 'card') {
    return { ...base, header_type: 'card', mode: 'random' };
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

function BentoFeaturePreview({ feat, resolved, linkable, stockPreviewUrl }: {
  feat: BentoGrid01Feature;
  resolved: ArticleResult | null | undefined;
  linkable?: boolean;
  stockPreviewUrl?: string;
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
            fontColor: feat.cardFontColor,
            imageLayout: feat.cardImageLayout ?? 'fit_under',
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
      <BentoStockBarsPreview
        symbols={feat.stock_symbols ?? []}
        cadence={feat.stock_bars_cadence ?? 'day'}
        barsLimit={feat.stock_bars_limit ?? 180}
        stockPreviewUrl={stockPreviewUrl ?? ''}
      />
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

function BentoFeaturePanel({ feat, resolved, searchUrl, stockPreviewUrl, onPatch, onRemove }: {
  feat: BentoGrid01Feature;
  resolved: ArticleResult | null | undefined;
  searchUrl: string;
  stockPreviewUrl: string;
  onPatch: (patch: Partial<BentoGrid01Feature>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);

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
          className="scn-bento-editor__panel-content"
          role="button"
          tabIndex={0}
          onContextMenu={feat.header_type === 'stock_bars' ? onStockTileContextMenu : undefined}
        >
          <span className="scn-bento-editor__panel-label">{BENTO_TILE_LABEL[feat.header_type] ?? 'Tile'}</span>
          <BentoFeaturePreview feat={feat} resolved={resolved} stockPreviewUrl={stockPreviewUrl} />
        </div>
      </PopoverTrigger>
      <PopoverContent className="scn-popover-content scn-bento-editor__feat-popover" align="center" side="bottom">
        <div className="scn-bento-editor__feat-popover-body">
          <div className="scn-bento-editor__card-row">
            <Select value={feat.header_type}
              onChange={e => {
                const v = e.target.value as BentoGrid01Feature['header_type'];
                if (v === 'stock_bars') {
                  onPatch({
                    header_type: v,
                    stock_symbols: feat.stock_symbols?.length ? feat.stock_symbols : ['AAPL'],
                    stock_bars_cadence: feat.stock_bars_cadence ?? 'day',
                    stock_bars_limit: feat.stock_bars_limit ?? 180,
                  });
                } else {
                  onPatch({ header_type: v });
                }
              }}>
              <option value="image">Image (light/dark)</option>
              <option value="reminder_animation">Reminder Animation</option>
              <option value="animated_ui_block">Animated UI Block</option>
              <option value="card">Article card</option>
              <option value="richtext">Rich text</option>
              <option value="stock_bars">Stock bars</option>
            </Select>
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
                <span className="scn-bento-editor__style-label">Image layout</span>
                <ToggleGroup value={feat.cardImageLayout ?? 'fit_under'}
                  onValueChange={v => { if (v) onPatch({ cardImageLayout: v as CarouselCardImageLayout }); }}>
                  <ToggleGroupItem value="fit_under">Fit under</ToggleGroupItem>
                  <ToggleGroupItem value="scales_fit_top">Scales to fit</ToggleGroupItem>
                </ToggleGroup>
                <span className="scn-bento-editor__style-label">Background opacity</span>
                <div className="scn-bento-editor__size-slider-row">
                  <Slider min={0} max={100} step={5}
                    value={[feat.cardBgOpacity ?? 100]}
                    onValueChange={([v]) => onPatch({ cardBgOpacity: v })} />
                  <span className="scn-bento-editor__size-value">{feat.cardBgOpacity ?? 100}%</span>
                </div>
                <span className="scn-bento-editor__style-label">Font color</span>
                <ToggleGroup value={feat.cardFontColor ?? 'white'}
                  onValueChange={v => { if (v) onPatch({ cardFontColor: v as CarouselCardFontColorKey }); }}>
                  <ToggleGroupItem value="white">
                    <span className="scn-bento-editor__color-swatch" style={{ background: '#ffffff' }} />
                    White
                  </ToggleGroupItem>
                  <ToggleGroupItem value="black">
                    <span className="scn-bento-editor__color-swatch" style={{ background: '#0a0a0a' }} />
                    Black
                  </ToggleGroupItem>
                  <ToggleGroupItem value="slime">
                    <span className="scn-bento-editor__color-swatch scn-bento-editor__color-swatch--slime" />
                    Green
                  </ToggleGroupItem>
                  <ToggleGroupItem value="gray">
                    <span className="scn-bento-editor__color-swatch" style={{ background: 'rgba(226,232,240,0.7)' }} />
                    Gray
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </>
          )}
          {feat.header_type === 'richtext' && (
            <BentoTileRichTextEditor feat={feat} onChange={html => onPatch({ html })} />
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
                  <Select
                    value={feat.stock_bars_cadence ?? 'day'}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === 'week' || v === 'month' || v === 'day') {
                        onPatch({ stock_bars_cadence: v });
                      }
                    }}>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                  </Select>
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
          <Input value={feat.title} placeholder="Title"
            onChange={e => onPatch({ title: e.target.value })} />
          <Input value={feat.description} placeholder="Description"
            onChange={e => onPatch({ description: e.target.value })} />
          <Button variant="outline" className="scn-editor-block__ctrl-btn--danger scn-bento-editor__remove-btn"
            onClick={() => { onRemove(); setOpen(false); }}>
            Remove tile
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BentoResizableLayout({ features, resolvedRandom, searchUrl, stockPreviewUrl, onPatch, onRemove, panelSizes, onLayoutChange, height }: {
  features: BentoGrid01Feature[];
  resolvedRandom: Record<string, ArticleResult | null>;
  searchUrl: string;
  stockPreviewUrl: string;
  onPatch: (featId: string, patch: Partial<BentoGrid01Feature>) => void;
  onRemove: (featId: string) => void;
  panelSizes?: number[];
  onLayoutChange?: (sizes: number[]) => void;
  height?: string;
}) {
  if (features.length === 0) {
    return <div className="scn-bento-editor__empty">Add tiles with the + button</div>;
  }

  const layoutStyle: React.CSSProperties | undefined = height && height !== 'auto'
    ? { height } : undefined;

  function renderPanel(feat: BentoGrid01Feature) {
    return (
      <BentoFeaturePanel
        feat={feat}
        resolved={resolvedRandom[feat.id]}
        searchUrl={searchUrl}
        stockPreviewUrl={stockPreviewUrl}
        onPatch={patch => onPatch(feat.id, patch)}
        onRemove={() => onRemove(feat.id)}
      />
    );
  }

  const hLeft = panelSizes?.[0] ?? 50;

  if (features.length === 1) {
    return (
      <ResizablePanelGroup orientation="horizontal" className="scn-bento-editor__layout" style={layoutStyle}>
        <ResizablePanel defaultSize={100}>{renderPanel(features[0])}</ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  if (features.length === 2) {
    return (
      <ResizablePanelGroup orientation="horizontal" className="scn-bento-editor__layout" style={layoutStyle}
        onLayoutChanged={layout => {
          if (!onLayoutChange) return;
          const vals = Object.values(layout);
          onLayoutChange(vals);
        }}>
        <ResizablePanel id="h0" defaultSize={hLeft}>{renderPanel(features[0])}</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="h1" defaultSize={100 - hLeft}>{renderPanel(features[1])}</ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  const rest = features.slice(1);
  const verticalSizes = panelSizes?.slice(1);
  const defaultVSize = Math.floor(100 / rest.length);

  return (
    <ResizablePanelGroup orientation="horizontal" className="scn-bento-editor__layout" style={layoutStyle}
      onLayoutChanged={layout => {
        if (!onLayoutChange) return;
        const hSize = layout['h0'] ?? hLeft;
        const savedVertical = panelSizes?.slice(1) ?? rest.map(() => defaultVSize);
        onLayoutChange([hSize, ...savedVertical]);
      }}>
      <ResizablePanel id="h0" defaultSize={hLeft}>{renderPanel(features[0])}</ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="h1" defaultSize={100 - hLeft}>
        <ResizablePanelGroup orientation="vertical"
          onLayoutChanged={layout => {
            if (!onLayoutChange) return;
            const vSizes = rest.map((_, i) => layout[`v${i}`] ?? defaultVSize);
            onLayoutChange([hLeft, ...vSizes]);
          }}>
          {rest.map((feat, i) => (
            <React.Fragment key={feat.id}>
              {i > 0 && <ResizableHandle withHandle />}
              <ResizablePanel id={`v${i}`} defaultSize={verticalSizes?.[i] ?? defaultVSize}>{renderPanel(feat)}</ResizablePanel>
            </React.Fragment>
          ))}
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function BentoGrid01Editor({ block, searchUrl, stockPreviewUrl, termId, onChange }: {
  block: BentoGrid01Block; searchUrl: string; stockPreviewUrl: string; termId: number; onChange: (b: BentoGrid01Block) => void;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const cardSlots = React.useMemo(() => bentoCardFeaturesToSlots(block.features), [block.features]);
  const resolvedRandom = useResolvedCarouselPreviews(cardSlots, termId);

  function addFeature(headerType: BentoGrid01Feature['header_type']) {
    onChange({ ...block, features: [...block.features, createBentoFeatureOfType(headerType)] });
  }

  function patchFeature(featId: string, patch: Partial<BentoGrid01Feature>) {
    onChange({
      ...block,
      features: block.features.map(f => f.id === featId ? { ...f, ...patch } : f),
    });
  }

  function removeFeature(featId: string) {
    onChange({ ...block, features: block.features.filter(f => f.id !== featId) });
  }

  const layoutRef = React.useRef(block.panelSizes);
  layoutRef.current = block.panelSizes;

  const handleLayoutChange = React.useCallback((sizes: number[]) => {
    const rounded = sizes.map(s => Math.round(s * 10) / 10);
    const prev = layoutRef.current;
    if (prev && prev.length === rounded.length && prev.every((v, i) => v === rounded[i])) return;
    onChange({ ...block, panelSizes: rounded });
  }, [block, onChange]);

  return (
    <div className="scn-bento-editor">
      <div className="scn-bento-editor__col-header">
        <Input value={block.badge_text} placeholder="Badge text"
          onChange={e => onChange({ ...block, badge_text: e.target.value })} />
        <Input value={block.heading} placeholder="Section heading"
          onChange={e => onChange({ ...block, heading: e.target.value })} />
        <Popover>
          <PopoverTrigger asChild>
            <button className="scn-bento-editor__size-btn">Size</button>
          </PopoverTrigger>
          <PopoverContent className="scn-popover-content scn-bento-editor__size-popover" align="end">
            <label className="scn-bento-editor__size-auto-row">
              <Checkbox checked={!block.height || block.height === 'auto'}
                onCheckedChange={checked => onChange({ ...block, height: checked ? undefined : '320px' })} />
              <span>Auto</span>
            </label>
            {block.height && block.height !== 'auto' && (
              <div className="scn-bento-editor__size-slider-row">
                <Slider min={320} max={1000} step={10}
                  value={[parseInt(block.height) || 320]}
                  onValueChange={([v]) => onChange({ ...block, height: `${v}px` })} />
                <span className="scn-bento-editor__size-value">{block.height}</span>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <button className="scn-bento-editor__add-col">+</button>
          </PopoverTrigger>
          <PopoverContent className="scn-popover-content scn-editor-add-block-menu" align="end">
            {BENTO_TILE_TYPES.map(bt => (
              <button key={bt.type} className="scn-editor-add-block-item"
                onClick={() => { addFeature(bt.type); setAddOpen(false); }}>
                <span className="scn-editor-add-block-item__label">{BENTO_TILE_LABEL[bt.type]}</span>
                <span className="scn-editor-add-block-item__desc">{bt.desc}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <BentoResizableLayout
        features={block.features}
        resolvedRandom={resolvedRandom}
        searchUrl={searchUrl}
        stockPreviewUrl={stockPreviewUrl}
        onPatch={patchFeature}
        onRemove={removeFeature}
        panelSizes={block.panelSizes}
        onLayoutChange={handleLayoutChange}
        height={block.height}
      />
    </div>
  );
}

// ─── Carousel Editor ──────────────────────────────────────────────────────────

const CAROUSEL_AUTOPLAY_DELAY_MS = 3500;

function carouselAutoplayPlugins(infiniteScroll: boolean) {
  if (!infiniteScroll) {
    return undefined;
  }
  return [Autoplay({ delay: CAROUSEL_AUTOPLAY_DELAY_MS, stopOnInteraction: true })];
}

function carouselAutoplayOpts(infiniteScroll: boolean) {
  if (!infiniteScroll) {
    return undefined;
  }
  return { loop: true };
}

function CarouselEditor({ block, searchUrl, stockPreviewUrl, termId, onChange }: {
  block: CarouselBlock;
  searchUrl: string;
  stockPreviewUrl: string;
  termId: number;
  onChange: (b: CarouselBlock) => void;
}) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const features = block.features;
  const cardSlots = React.useMemo(() => bentoCardFeaturesToSlots(features), [features]);
  const resolvedRandom = useResolvedCarouselPreviews(cardSlots, termId);
  const infiniteScroll = Boolean(block.infiniteScroll);
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
      return packCarouselSlides(vms);
    },
    [allCards, features, resolvedRandom],
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

  return (
    <div className="scn-carousel-editor">
      <div className="scn-carousel-editor__header scn-carousel-editor__header--tools">
        <span className="scn-carousel-editor__count">
          {features.length} tile{features.length !== 1 ? 's' : ''}
        </span>
        <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="scn-carousel-editor__settings-btn" aria-label="Carousel settings">
              <Settings2 size={16} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="scn-popover-content scn-carousel-editor__popover scn-carousel-editor__popover--narrow" align="end">
            <Button
              type="button"
              variant="outline"
              className={cn(
                'scn-carousel-editor__infinite-btn',
                infiniteScroll && 'scn-carousel-editor__infinite-btn--active'
              )}
              onClick={() => onChange({ ...block, infiniteScroll: !infiniteScroll })}
              aria-pressed={infiniteScroll}
            >
              <InfinityIcon size={14} />
              Infinite scroll
            </Button>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="scn-bento-editor__size-btn">Size</button>
          </PopoverTrigger>
          <PopoverContent className="scn-popover-content scn-bento-editor__size-popover" align="end">
            <label className="scn-bento-editor__size-auto-row">
              <Checkbox checked={!block.height || block.height === 'auto'}
                onCheckedChange={checked => onChange({ ...block, height: checked ? undefined : '320px' })} />
              <span>Auto</span>
            </label>
            {block.height && block.height !== 'auto' && (
              <div className="scn-bento-editor__size-slider-row">
                <Slider min={320} max={1000} step={10}
                  value={[parseInt(block.height, 10) || 320]}
                  onValueChange={([v]) => onChange({ ...block, height: `${v}px` })} />
                <span className="scn-bento-editor__size-value">{block.height}</span>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="scn-bento-editor__add-col" aria-label="Add tile">+</button>
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
          <CarouselContent>
            {allCards
              ? packedSlides.map((slide) => renderPackedCarouselEditorBentoSlide(
                slide,
                'scn-carousel-editor__preview-item',
                cardFeaturesById,
                searchUrl,
                stockPreviewUrl,
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
                      onPatch={patch => patchFeature(feat.id, patch)}
                      onRemove={() => removeFeature(feat.id)}
                    />
                  </div>
                </CarouselItem>
              ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      )}
    </div>
  );
}

// ─── Block wrapper ────────────────────────────────────────────────────────────

const BLOCK_LABEL: Record<string, string> = {
  heading: 'Heading', paragraph: 'Paragraph', image: 'Image', embed: 'Embed',
  separator: 'Separator', bento_grid_01: 'Bento block', carousel: 'Carousel',
};

function BlockEditor({ block, index, total, termId, uploadUrl, articleSearchUrl, stockPreviewUrl, onChange, onRemove, onMove }: {
  block: TaxonomyBlock; index: number; total: number;
  termId: number;
  uploadUrl: string; articleSearchUrl: string; stockPreviewUrl: string;
  onChange: (b: TaxonomyBlock) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="scn-editor-block">
      <div className="scn-editor-block__header">
        <span className="scn-editor-block__type">{BLOCK_LABEL[block.type] ?? block.type}</span>
        <div className="scn-editor-block__controls">
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
        {block.type === 'separator' && <SeparatorEditor block={block} onChange={onChange as (b: SeparatorBlock) => void} />}
        {block.type === 'bento_grid_01' && <BentoGrid01Editor block={block} searchUrl={articleSearchUrl} stockPreviewUrl={stockPreviewUrl} termId={termId} onChange={onChange as (b: BentoGrid01Block) => void} />}
        {block.type === 'carousel' && (
          <CarouselEditor
            block={block}
            searchUrl={articleSearchUrl}
            stockPreviewUrl={stockPreviewUrl}
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
    { type: 'separator', desc: 'Horizontal or vertical rule' },
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

function ReadOnlyBlock({ block, termId, stockPreviewUrl }: { block: TaxonomyBlock; termId: number; stockPreviewUrl: string }) {
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
    return <hr className={`scn-taxonomy-content__sep scn-taxonomy-content__sep--${block.orientation}`} />;
  }

  if (block.type === 'bento_grid_01') {
    const features = block.features;
    const sizes = block.panelSizes;
    const hLeft = sizes?.[0] ?? 50;
    const blockHeight = block.height && block.height !== 'auto' ? block.height : undefined;

    function renderReadOnlyPanel(f: BentoGrid01Feature) {
      return (
        <div key={f.id} className="scn-bento-readonly__panel">
          <BentoFeaturePreview feat={f} resolved={resolvedRandom[f.id]} linkable stockPreviewUrl={stockPreviewUrl} />
        </div>
      );
    }

    let gridContent: React.ReactNode;
    if (features.length === 0) {
      gridContent = null;
    } else if (features.length === 1) {
      gridContent = (
        <div className="scn-bento-readonly__grid"
          style={blockHeight ? { height: blockHeight } : undefined}>
          {renderReadOnlyPanel(features[0])}
        </div>
      );
    } else if (features.length === 2) {
      gridContent = (
        <div className="scn-bento-readonly__grid scn-bento-readonly__grid--two-col"
          style={{
            gridTemplateColumns: `${hLeft}fr ${100 - hLeft}fr`,
            ...(blockHeight ? { height: blockHeight } : {}),
          }}>
          {renderReadOnlyPanel(features[0])}
          {renderReadOnlyPanel(features[1])}
        </div>
      );
    } else {
      const rest = features.slice(1);
      const verticalSizes = sizes?.slice(1);
      const defaultVSize = 100 / rest.length;
      const rowTemplate = rest
        .map((_, i) => `${verticalSizes?.[i] ?? defaultVSize}fr`)
        .join(' ');

      gridContent = (
        <div className="scn-bento-readonly__grid scn-bento-readonly__grid--hero"
          style={{
            gridTemplateColumns: `${hLeft}fr ${100 - hLeft}fr`,
            ...(blockHeight ? { height: blockHeight } : {}),
          }}>
          <div className="scn-bento-readonly__hero">
            {renderReadOnlyPanel(features[0])}
          </div>
          <div className="scn-bento-readonly__right-stack"
            style={verticalSizes ? { display: 'grid', gridTemplateRows: rowTemplate, gap: '0.65rem' } : undefined}>
            {features.slice(1).map(f => renderReadOnlyPanel(f))}
          </div>
        </div>
      );
    }

    return (
      <div className="scn-taxonomy-content__bento-preview">
        {block.badge_text && <div className="scn-taxonomy-content__bento-badge">{block.badge_text}</div>}
        {block.heading && <h2 className="scn-taxonomy-content__heading">{block.heading}</h2>}
        {gridContent}
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
      const packedSlides = packCarouselSlides(
        features
          .map((feat, index) => resolveCarouselCardFeatureViewModel(feat, index, resolvedRandom, 'readonly'))
          .filter((card): card is CarouselCardViewModel => card !== null),
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
                  <BentoFeaturePreview feat={feat} resolved={resolvedRandom[feat.id]} linkable stockPreviewUrl={stockPreviewUrl} />
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

function TaxonomyEditor({ termId, initialJson, canEdit, saveUrl, uploadUrl, articleSearchUrl, stockPreviewUrl }: {
  termId: number;
  initialJson: object | null;
  canEdit: boolean;
  saveUrl: string;
  uploadUrl: string;
  articleSearchUrl: string;
  stockPreviewUrl: string;
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
        case 'separator': return { id, type: 'separator', orientation: 'horizontal' };
        case 'bento_grid_01': return { id, type: 'bento_grid_01', badge_text: 'Features', heading: '', features: [] };
        case 'carousel': return { id, type: 'carousel', features: [createBentoFeatureOfType('card')], infiniteScroll: false };
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
        {blocks.map(block => <ReadOnlyBlock key={block.id} block={block} termId={termId} stockPreviewUrl={stockPreviewUrl} />)}
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
      />
    );
  });
}
