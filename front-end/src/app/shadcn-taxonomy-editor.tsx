import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motion } from 'framer-motion';
import Autoplay from 'embla-carousel-autoplay';

import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, type Editor, type ReactNodeViewProps } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

import { Settings2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { RteToolbar, TABLE_EXTENSIONS } from '../components/ui/rte-editor';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '../components/ui/carousel';
import { FlexibleBentoGrid, bentoColSpanMap, bentoRowSpanMap, type BentoFeature } from '../components/ui/bento-grid';

// ─── Types ────────────────────────────────────────────────────────────────────

type HeadingBlock   = { id: string; type: 'heading';   level: 'h1' | 'h2'; text: string };
type ParagraphBlock = { id: string; type: 'paragraph'; html: string };
type ImageBlock     = { id: string; type: 'image';     imageId: number | null; imageUrl: string | null };
type EmbedBlock     = { id: string; type: 'embed';     url: string };
type SeparatorBlock = { id: string; type: 'separator'; orientation: 'horizontal' | 'vertical' };

type BentoCard   = { id: string; mode: 'random' | 'specific' | 'priority'; articleId?: number | null; articleTitle?: string | null; colSpan: number; rowSpan: number };
type BentoColumn = { id: string; colSpan: number; cards: BentoCard[] };
type BentoBlock  = { id: string; type: 'bento'; columns: BentoColumn[] };

type CarouselSlot  = { id: string; mode: 'random' | 'priority' | 'specific'; articleId: number | null; articleTitle: string | null; articleImageUrl?: string | null; articleTag?: string | null; articleExcerpt?: string | null; articleUrl?: string | null };
type CarouselBlock = { id: string; type: 'carousel'; cards: CarouselSlot[] };

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

type ArticleResult = { id: number; title: string; url?: string; imageUrl?: string | null; tag?: string | null; excerpt?: string | null };

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

function CarouselCard({ imageUrl, tag, title, excerpt, url }: {
  imageUrl?: string | null;
  tag?: string | null;
  title: string;
  excerpt?: string | null;
  url?: string | null;
}) {
  const inner = (
    <Card className={cn('carousel-article-card', url && 'carousel-article-card--link')}>
      {imageUrl
        ? <img src={imageUrl} alt={title} className="carousel-article-card__img" />
        : <div className="carousel-article-card__img-placeholder" aria-hidden="true" />
      }
      <CardContent className="carousel-article-card__body">
        {tag && <span className="markdown-tile__taxonomy">{tag}</span>}
        <CardTitle className="carousel-article-card__title">{title}</CardTitle>
        {excerpt && <p className="carousel-article-card__excerpt">{excerpt}</p>}
      </CardContent>
    </Card>
  );
  return url
    ? <a href={url} className="carousel-article-card__anchor">{inner}</a>
    : inner;
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

function CarouselEditor({ block, searchUrl, onChange }: {
  block: CarouselBlock; searchUrl: string; onChange: (b: CarouselBlock) => void;
}) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);

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
                        articleTag:      v.id ? (v as ArticleResult).tag      ?? null : null,
                        articleExcerpt:  v.id ? (v as ArticleResult).excerpt  ?? null : null,
                        articleUrl:      v.id ? (v as ArticleResult).url      ?? null : null,
                      })}
                      searchUrl={searchUrl}
                      placeholder="Search article…"
                    />
                  )}
                </div>
              ))}
              <Button variant="ghost" className="scn-bento-editor__add-card" onClick={addSlot}>
                + Add slot
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {block.cards.length > 0 && (
        <Carousel className="scn-carousel-editor__preview">
          <CarouselContent>
            {block.cards.map((slot, i) => (
              <CarouselItem key={slot.id} className="scn-carousel-editor__preview-item">
                <CarouselCard
                  imageUrl={slot.mode === 'specific' ? slot.articleImageUrl : null}
                  tag={slot.mode === 'specific' ? slot.articleTag : undefined}
                  title={
                    slot.mode === 'specific'
                      ? (slot.articleTitle ?? `Slot ${i + 1}`)
                      : slot.mode === 'priority' ? 'Priority article' : 'Random article'
                  }
                  excerpt={slot.mode === 'specific' ? slot.articleExcerpt : undefined}
                  url={slot.mode === 'specific' ? slot.articleUrl : undefined}
                />
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
  separator: 'Separator', bento: 'Bento Layout', carousel: 'Carousel',
};

function BlockEditor({ block, index, total, uploadUrl, articleSearchUrl, onChange, onRemove, onMove }: {
  block: TaxonomyBlock; index: number; total: number;
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
        {block.type === 'carousel'  && <CarouselEditor  block={block} searchUrl={articleSearchUrl} onChange={onChange as (b: CarouselBlock) => void} />}
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

function ReadOnlyBlock({ block }: { block: TaxonomyBlock }) {
  const autoplay = React.useMemo(
    () => Autoplay({ delay: 3500, stopOnInteraction: true }),
    []
  );

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
    return (
      <div className="scn-taxonomy-content__carousel-wrap">
        <Carousel plugins={[autoplay]}>
          <CarouselContent>
            {block.cards.map((slot, i) => (
              <CarouselItem key={slot.id} className="scn-taxonomy-content__carousel-item">
                <CarouselCard
                  imageUrl={slot.mode === 'specific' ? slot.articleImageUrl : null}
                  tag={slot.mode === 'specific' ? slot.articleTag : undefined}
                  title={
                    slot.mode === 'specific'
                      ? (slot.articleTitle ?? `Article ${i + 1}`)
                      : slot.mode === 'priority' ? `Priority article ${i + 1}` : `Article ${i + 1}`
                  }
                  excerpt={slot.mode === 'specific' ? slot.articleExcerpt : undefined}
                  url={slot.mode === 'specific' ? slot.articleUrl : undefined}
                />
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
        case 'carousel':  return { id, type: 'carousel',  cards: [{ id: uid(), mode: 'random', articleId: null, articleTitle: null }] };
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
        {blocks.map(block => <ReadOnlyBlock key={block.id} block={block} />)}
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
