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
import { ScrollArea } from '../components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { RteToolbar, TABLE_EXTENSIONS } from '../components/ui/rte-editor';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '../components/ui/carousel';
import { FlexibleBentoGrid, bentoColSpanMap, bentoRowSpanMap, type BentoFeature } from '../components/ui/bento-grid';
import {
  hasCarouselCardImage,
  packCarouselSlides,
  type CarouselCardViewModel,
  type CarouselPackedSlide,
} from './carousel-slide-packing';

// ─── Types ────────────────────────────────────────────────────────────────────

type HeadingBlock   = { id: string; type: 'heading';   level: 'h1' | 'h2'; text: string };
type ParagraphBlock = { id: string; type: 'paragraph'; html: string };
type ImageBlock     = { id: string; type: 'image';     imageId: number | null; imageUrl: string | null };
type EmbedBlock     = { id: string; type: 'embed';     url: string };
type SeparatorBlock = { id: string; type: 'separator'; orientation: 'horizontal' | 'vertical' };

type BentoCard   = { id: string; mode: 'random' | 'specific' | 'priority'; articleId?: number | null; articleTitle?: string | null; colSpan: number; rowSpan: number };
type BentoColumn = { id: string; colSpan: number; cards: BentoCard[] };
type BentoBlock  = { id: string; type: 'bento'; columns: BentoColumn[] };

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
type CarouselBlock = { id: string; type: 'carousel'; cards: CarouselSlot[]; infiniteScroll?: boolean };

type TaxonomyBlock = HeadingBlock | ParagraphBlock | ImageBlock | EmbedBlock | SeparatorBlock | BentoBlock | CarouselBlock;
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

function jsonToBlocks(json: object | null): TaxonomyBlock[] {
  if (!json || typeof json !== 'object') return [];
  const j = json as TaxonomyContentJson;
  if (!Array.isArray(j.blocks)) return [];
  return j.blocks.filter((b): b is TaxonomyBlock =>
    typeof b === 'object' && b !== null && typeof (b as Record<string, unknown>)['type'] === 'string'
  );
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

function carouselCatalystIconSrc(catalyst?: string | null): string | null {
  if (catalyst === 'Bullish') return '/static/images/bull.png';
  if (catalyst === 'Bearish') return '/static/images/bear.png';
  return null;
}

function CarouselCard({ imageUrl, tags, title, excerpt, url, authorName, publishedAt, catalyst }: CarouselCardViewModel) {
  const publishedLabel = publishedAt?.trim() || '';
  const imageless = !hasCarouselCardImage({ imageUrl });
  const sentimentIconSrc = carouselCatalystIconSrc(catalyst);
  const tagList = (tags ?? []).slice(0, 5);
  const inner = (
    <Card className={cn(
      'carousel-article-card',
      imageless && 'carousel-article-card--imageless',
      url && 'carousel-article-card--link',
    )}>
      {!imageless ? (
        <div className="carousel-article-card__media">
          <img src={imageUrl ?? ''} alt={title} className="carousel-article-card__img" />
        </div>
      ) : null}
      <CardContent className="carousel-article-card__body">
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
      <div className="carousel-article-card__footer">
        <span className="carousel-article-card__author">{authorName || 'Fivenickels Editorial'}</span>
        {publishedLabel ? (
          <time className="carousel-article-card__published" dateTime={publishedLabel}>
            {publishedLabel}
          </time>
        ) : null}
      </div>
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
  context: 'editor' | 'readonly',
): CarouselCardViewModel | null {
  const preview = resolvedRandom[slot.id];
  if (context === 'readonly' && slot.mode !== 'specific' && !preview) {
    return null;
  }
  const fallbackTitle = context === 'editor'
    ? `Slot ${index + 1}`
    : `Article ${index + 1}`;
  const title = slot.mode === 'specific'
    ? (slot.articleTitle ?? preview?.title ?? fallbackTitle)
    : preview?.title ?? (slot.mode === 'priority'
      ? (context === 'editor' ? 'Priority article' : `Priority article ${index + 1}`)
      : (context === 'editor' ? 'Random article' : fallbackTitle));

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
    url: slot.mode === 'specific'
      ? slot.articleUrl ?? preview?.url
      : preview?.url,
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
      <div className="carousel-slides__stack">
        <CarouselCard {...slide.cards[0]} />
        <CarouselCard {...slide.cards[1]} />
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

// ─── Bento Editor ─────────────────────────────────────────────────────────────

function BentoEditor({ block, searchUrl, onChange }: {
  block: BentoBlock; searchUrl: string; onChange: (b: BentoBlock) => void;
}) {
  function addColumn() {
    onChange({ ...block, columns: [...block.columns, { id: uid(), colSpan: 1, cards: [] }] });
  }

  function removeColumn(colId: string) {
    onChange({ ...block, columns: block.columns.filter(c => c.id !== colId) });
  }

  function setColumnSpan(colId: string, colSpan: number) {
    onChange({ ...block, columns: block.columns.map(c => c.id === colId ? { ...c, colSpan } : c) });
  }

  function addCard(colId: string) {
    const col = block.columns.find(c => c.id === colId);
    const card: BentoCard = { id: uid(), mode: 'random', colSpan: col?.colSpan ?? 1, rowSpan: 1 };
    onChange({
      ...block,
      columns: block.columns.map(c => c.id === colId ? { ...c, cards: [...c.cards, card] } : c),
    });
  }

  function removeCard(colId: string, cardId: string) {
    onChange({
      ...block,
      columns: block.columns.map(c =>
        c.id === colId ? { ...c, cards: c.cards.filter(card => card.id !== cardId) } : c
      ),
    });
  }

  function patchCard(colId: string, cardId: string, patch: Partial<BentoCard>) {
    onChange({
      ...block,
      columns: block.columns.map(c =>
        c.id === colId
          ? { ...c, cards: c.cards.map(card => card.id === cardId ? { ...card, ...patch } : card) }
          : c
      ),
    });
  }

  const totalGridCols = Math.max(4, block.columns.reduce((s, c) => s + c.colSpan, 0));
  const hasCards = block.columns.some(c => c.cards.length > 0);

  return (
    <div className="scn-bento-editor">
      <div className="scn-bento-editor__columns">
        {block.columns.map(col => (
          <div key={col.id} className="scn-bento-editor__column">
            <div className="scn-bento-editor__col-header">
              <span className="scn-editor-block__type">Column</span>
              <div className="scn-bento-editor__col-controls">
                <span className="scn-bento-editor__span-label">Width</span>
                <Select value={col.colSpan.toString()}
                  onChange={e => setColumnSpan(col.id, parseInt(e.target.value))}>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </Select>
                <button className="scn-editor-block__ctrl-btn scn-editor-block__ctrl-btn--danger"
                  onClick={() => removeColumn(col.id)} title="Remove column">×</button>
              </div>
            </div>
            <div className="scn-bento-editor__cards">
              {col.cards.map(card => (
                <div key={card.id} className="scn-bento-editor__card">
                  <div className="scn-bento-editor__card-row">
                    <Select value={card.mode}
                      onChange={e => patchCard(col.id, card.id, { mode: e.target.value as BentoCard['mode'] })}>
                      <option value="random">Random article</option>
                      <option value="priority">By priority</option>
                      <option value="specific">Specific article</option>
                    </Select>
                    <span className="scn-bento-editor__span-label">Cols</span>
                    <Select value={card.colSpan.toString()}
                      onChange={e => patchCard(col.id, card.id, { colSpan: parseInt(e.target.value) })}>
                      {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                    </Select>
                    <span className="scn-bento-editor__span-label">Rows</span>
                    <Select value={card.rowSpan.toString()}
                      onChange={e => patchCard(col.id, card.id, { rowSpan: parseInt(e.target.value) })}>
                      {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                    </Select>
                    <button className="scn-editor-block__ctrl-btn scn-editor-block__ctrl-btn--danger"
                      onClick={() => removeCard(col.id, card.id)} title="Remove card">×</button>
                  </div>
                  {card.mode === 'specific' && (
                    <ArticleSearchInput
                      value={{ id: card.articleId ?? null, title: card.articleTitle ?? null }}
                      onChange={v => patchCard(col.id, card.id, { articleId: v.id, articleTitle: v.title })}
                      searchUrl={searchUrl}
                      placeholder="Search for specific article…"
                    />
                  )}
                </div>
              ))}
              <Button variant="ghost" className="scn-bento-editor__add-card"
                onClick={() => addCard(col.id)}>+ Add card</Button>
            </div>
          </div>
        ))}
        <button className="scn-bento-editor__add-col" onClick={addColumn}>+ Add column</button>
      </div>

      {hasCards && (
        <div className="scn-bento-editor__preview">
          <p className="scn-bento-editor__preview-label">Preview</p>
          <FlexibleBentoGrid
            columns={4}
            className="scn-bento-editor__preview-grid"
            items={block.columns.flatMap(col =>
              col.cards.map(card => ({
                title: card.mode === 'specific'
                  ? (card.articleTitle ?? 'Specific article')
                  : card.mode === 'priority' ? 'By priority' : 'Random article',
                className: cn(
                  'scn-bento-editor__preview-card',
                  bentoColSpanMap[card.colSpan] ?? 'md:col-span-1',
                  bentoRowSpanMap[card.rowSpan] ?? 'row-span-1',
                ),
              } satisfies BentoFeature))
            )}
          />
        </div>
      )}
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

function CarouselEditor({ block, searchUrl, termId, onChange }: {
  block: CarouselBlock; searchUrl: string; termId: number; onChange: (b: CarouselBlock) => void;
}) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const resolvedRandom = useResolvedCarouselPreviews(block.cards, termId);
  const infiniteScroll = Boolean(block.infiniteScroll);
  const packedSlides = React.useMemo(
    () => packCarouselSlides(
      block.cards
        .map((slot, index) => resolveCarouselSlotViewModel(slot, index, resolvedRandom, 'editor'))
        .filter((card): card is CarouselCardViewModel => card !== null),
    ),
    [block.cards, resolvedRandom],
  );

  function addSlot() {
    onChange({ ...block, cards: [...block.cards, { id: uid(), mode: 'random', articleId: null, articleTitle: null }] });
  }

  function removeSlot(slotId: string) {
    onChange({ ...block, cards: block.cards.filter(c => c.id !== slotId) });
  }

  function patchSlot(slotId: string, patch: Partial<CarouselSlot>) {
    onChange({ ...block, cards: block.cards.map(c => c.id === slotId ? { ...c, ...patch } : c) });
  }

  return (
    <div className="scn-carousel-editor">
      <div className="scn-carousel-editor__header">
        <span className="scn-carousel-editor__count">
          {block.cards.length} slot{block.cards.length !== 1 ? 's' : ''}
        </span>
        <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="scn-carousel-editor__settings-btn" aria-label="Configure slots">
              <Settings2 size={16} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="scn-popover-content scn-carousel-editor__popover" align="end">
            <div className="scn-carousel-editor__popover-settings">
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
              <Button variant="ghost" className="scn-bento-editor__add-card scn-carousel-editor__add-slot-btn" onClick={addSlot}>
                + Add slot
              </Button>
            </div>
            <ScrollArea className="scn-carousel-editor__scroll-area">
              <div className="scn-carousel-editor__slots">
                {block.cards.map((slot, i) => (
                  <div key={slot.id} className="scn-carousel-editor__slot">
                    <div className="scn-carousel-editor__slot-header">
                      <span className="scn-carousel-editor__slot-num">Slot {i + 1}</span>
                      <button className="scn-editor-block__ctrl-btn scn-editor-block__ctrl-btn--danger"
                        onClick={() => removeSlot(slot.id)} title="Remove">×</button>
                    </div>
                    <ToggleGroup
                      value={slot.mode}
                      onValueChange={v => {
                        if (v) patchSlot(slot.id, { mode: v as CarouselSlot['mode'], articleId: null, articleTitle: null });
                      }}
                    >
                      <ToggleGroupItem value="random">Random</ToggleGroupItem>
                      <ToggleGroupItem value="priority">Priority</ToggleGroupItem>
                      <ToggleGroupItem value="specific">Specific</ToggleGroupItem>
                    </ToggleGroup>
                    {slot.mode === 'specific' && (
                      <ArticleSearchInput
                        value={{ id: slot.articleId, title: slot.articleTitle }}
                        onChange={v => patchSlot(slot.id, {
                          articleId:       v.id,
                          articleTitle:    v.title,
                          articleImageUrl: v.id ? (v as ArticleResult).imageUrl ?? null : null,
                          articleTags:     v.id ? ((v as ArticleResult).tags ?? []) : [],
                          articleExcerpt:  v.id ? (v as ArticleResult).excerpt  ?? null : null,
                          articleUrl:      v.id ? (v as ArticleResult).url      ?? null : null,
                          authorName:      v.id ? (v as ArticleResult).authorName ?? null : null,
                          publishedAt:     v.id ? (v as ArticleResult).publishedAt ?? null : null,
                        })}
                        searchUrl={searchUrl}
                        placeholder="Search article…"
                      />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      {block.cards.length > 0 && (
        <Carousel
          className="scn-carousel-editor__preview"
          opts={carouselAutoplayOpts(infiniteScroll)}
          plugins={carouselAutoplayPlugins(infiniteScroll)}
        >
          <CarouselContent>
            {packedSlides.map((slide) => renderPackedTaxonomyCarouselSlide(slide, 'scn-carousel-editor__preview-item'))}
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
  separator: 'Separator', bento: 'Bento Layout', carousel: 'Carousel',
};

function BlockEditor({ block, index, total, termId, uploadUrl, articleSearchUrl, onChange, onRemove, onMove }: {
  block: TaxonomyBlock; index: number; total: number;
  termId: number;
  uploadUrl: string; articleSearchUrl: string;
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
        {block.type === 'bento'     && <BentoEditor     block={block} searchUrl={articleSearchUrl} onChange={onChange as (b: BentoBlock) => void} />}
        {block.type === 'carousel'  && <CarouselEditor  block={block} searchUrl={articleSearchUrl} termId={termId} onChange={onChange as (b: CarouselBlock) => void} />}
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
    { type: 'bento',     desc: 'CSS grid card mosaic' },
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

function ReadOnlyBlock({ block, termId }: { block: TaxonomyBlock; termId: number }) {
  const resolvedRandom = useResolvedCarouselPreviews(block.type === 'carousel' ? block.cards : [], termId);

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

  if (block.type === 'bento') {
    const items: BentoFeature[] = block.columns.flatMap(col =>
      col.cards.map(card => ({
        title: card.mode === 'specific'
          ? (card.articleTitle ?? 'Article')
          : card.mode === 'priority' ? 'Priority article' : 'Latest article',
        className: cn(
          'scn-taxonomy-content__bento-card',
          bentoColSpanMap[card.colSpan] ?? 'md:col-span-1',
          bentoRowSpanMap[card.rowSpan] ?? 'row-span-1',
        ),
      }))
    );
    return <FlexibleBentoGrid items={items} columns={4} />;
  }

  if (block.type === 'carousel') {
    const infiniteScroll = Boolean(block.infiniteScroll);
    const packedSlides = packCarouselSlides(
      block.cards
        .map((slot, index) => resolveCarouselSlotViewModel(slot, index, resolvedRandom, 'readonly'))
        .filter((card): card is CarouselCardViewModel => card !== null),
    );
    if (packedSlides.length === 0) {
      return null;
    }
    return (
      <div className="scn-taxonomy-content__carousel-wrap">
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

// ─── Root component ───────────────────────────────────────────────────────────

function TaxonomyEditor({ termId, initialJson, canEdit, saveUrl, uploadUrl, articleSearchUrl }: {
  termId: number;
  initialJson: object | null;
  canEdit: boolean;
  saveUrl: string;
  uploadUrl: string;
  articleSearchUrl: string;
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
        case 'bento':     return { id, type: 'bento',     columns: [] };
        case 'carousel':  return { id, type: 'carousel',  cards: [{ id: uid(), mode: 'random', articleId: null, articleTitle: null }], infiniteScroll: false };
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
        {blocks.map(block => <ReadOnlyBlock key={block.id} block={block} termId={termId} />)}
      </div>
    );
  }

  return (
    <div className="scn-taxonomy-editor">
      <div className="scn-taxonomy-editor__save-bar">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        {lastSaved && (
          <span className="scn-taxonomy-editor__saved">
            Saved {lastSaved.toLocaleTimeString()}
          </span>
        )}
      </div>

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
            onChange={updated => setBlocks(prev => prev.map((b, j) => j === i ? updated : b))}
            onRemove={() => setBlocks(prev => prev.filter((_, j) => j !== i))}
            onMove={dir => moveBlock(i, dir)}
          />
        ))}
        <AddBlockMenu onAdd={addBlock} />
      </div>

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
      />
    );
  });
}
