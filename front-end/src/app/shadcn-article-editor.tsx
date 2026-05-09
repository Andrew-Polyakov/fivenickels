import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, type Editor, type ReactNodeViewProps } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { ToolbarBtn, RteToolbar } from '../components/ui/rte-editor';

// ─── Types ───────────────────────────────────────────────────────────────────

type TaxonomyChild = { id: number; name: string; slug: string };
type TaxonomyRoot = { id: number; name: string; slug: string; children: TaxonomyChild[] };
type Tag = { id: number; name: string };

type HeadingBlock   = { id: string; type: 'heading';   level: 'h1' | 'h2'; text: string };
type ParagraphBlock = { id: string; type: 'paragraph'; html: string };
type ImageBlock     = { id: string; type: 'image';     imageId: number | null; imageUrl: string | null };
type EmbedBlock     = { id: string; type: 'embed';     url: string };
type SeparatorBlock = { id: string; type: 'separator'; orientation: 'horizontal' | 'vertical' };
type BodyBlock = HeadingBlock | ParagraphBlock | ImageBlock | EmbedBlock | SeparatorBlock;

type ArticleApiData = {
  id: number;
  title: string;
  status: 'published' | 'draft';
  section_term:      { id: number; name: string; slug: string } | null;
  taxonomy_category: { id: number; name: string; slug: string } | null;
  tags: Tag[];
  hero_image_url: string | null;
  hero_image: number | null;
  tile_preview: string | null;
  tile_priority: number | null;
  article_priority: number | null;
  priority_expires_at: string | null;
  body: Array<{ id: string; type: string; value: unknown }>;
  seo_title: string | null;
  search_description: string | null;
  canonical_url: string | null;
  og_image: number | null;
  og_image_url: string | null;
};

type ArticleAction = 'publish' | 'unpublish' | 'submit_moderation' | 'save_draft' | 'delete';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function apiToEditor(apiBlocks: ArticleApiData['body']): BodyBlock[] {
  const out: BodyBlock[] = [];
  for (const b of apiBlocks) {
    const id = b.id || uid();
    if (b.type === 'heading') {
      const v = b.value as { level?: string; text?: string } | null;
      out.push({ id, type: 'heading', level: (v?.level as 'h1' | 'h2') || 'h2', text: v?.text || '' });
    } else if (b.type === 'paragraph') {
      out.push({ id, type: 'paragraph', html: (b.value as string) || '' });
    } else if (b.type === 'image') {
      const v = b.value as { id?: number; url?: string } | null;
      out.push({ id, type: 'image', imageId: v?.id ?? null, imageUrl: v?.url ?? null });
    } else if (b.type === 'embed') {
      const v = b.value as { url?: string } | null;
      out.push({ id, type: 'embed', url: v?.url || '' });
    } else if (b.type === 'separator') {
      const v = b.value as { orientation?: string } | null;
      out.push({ id, type: 'separator', orientation: (v?.orientation as 'horizontal' | 'vertical') || 'horizontal' });
    }
    // skip markdown, card, unknown
  }
  return out;
}

function editorToApi(blocks: BodyBlock[]): unknown[] {
  return blocks.map(b => {
    if (b.type === 'heading')   return { id: b.id, type: 'heading',   value: { level: b.level, text: b.text } };
    if (b.type === 'paragraph') return { id: b.id, type: 'paragraph', value: b.html || '' };
    if (b.type === 'image')     return { id: b.id, type: 'image',     value: b.imageId };
    if (b.type === 'embed')     return { id: b.id, type: 'embed',     value: { url: b.url } };
    return { id: b.id, type: 'separator', value: { orientation: (b as SeparatorBlock).orientation } };
  });
}

// ─── Taxonomy Breadcrumb ─────────────────────────────────────────────────────

function TaxonomyBreadcrumb({
  rootTerms, sectionTermId, categoryId, onSectionChange, onCategoryChange,
}: {
  rootTerms: TaxonomyRoot[];
  sectionTermId: number | null;
  categoryId: number | null;
  onSectionChange: (id: number) => void;
  onCategoryChange: (id: number | null) => void;
}) {
  const selected = rootTerms.find(t => t.id === sectionTermId) ?? null;
  const children = selected?.children ?? [];

  return (
    <div className="scn-editor-card">
      <h3 className="scn-editor-card__title">Taxonomy</h3>
      <div className="scn-editor-taxonomy__breadcrumb">
        <Select
          value={sectionTermId?.toString() ?? ''}
          onChange={e => { onSectionChange(parseInt(e.target.value)); onCategoryChange(null); }}
        >
          <option value="">— Section —</option>
          {rootTerms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        {children.length > 0 && (
          <>
            <span className="scn-editor-taxonomy__sep">›</span>
            <Select
              value={categoryId?.toString() ?? ''}
              onChange={e => onCategoryChange(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">— Category —</option>
              {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Hero Image Upload ────────────────────────────────────────────────────────

function HeroImageUpload({
  imageUrl, articleId, apiBase, onUploaded,
}: {
  imageUrl: string | null;
  articleId: number;
  apiBase: string;
  onUploaded: (url: string, id: number) => void;
}) {
  const [dragging, setDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please select an image'); return; }
    setUploading(true); setError('');
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await api(`${apiBase}/articles/${articleId}/upload-image/`, { method: 'POST', body: fd });
      const json = await res.json();
      if (res.ok) onUploaded(json.image_url, json.image_id);
      else setError(json.error || 'Upload failed');
    } catch { setError('Upload failed'); }
    finally { setUploading(false); }
  }

  return (
    <div className="scn-editor-card">
      <h3 className="scn-editor-card__title">Hero Image · 1.91:1</h3>
      <div
        className={`scn-editor-hero__zone${dragging ? ' scn-editor-hero__zone--drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
      >
        {imageUrl ? (
          <div className="scn-editor-hero__preview-wrap">
            <img className="scn-editor-hero__preview" src={imageUrl} alt="Hero" />
            <div className="scn-editor-hero__overlay">{uploading ? 'Uploading…' : 'Click or drop to replace'}</div>
          </div>
        ) : (
          <div className="scn-editor-hero__empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
            <p>{uploading ? 'Uploading…' : 'Click or drop image here'}</p>
            <p className="scn-text-muted">JPG · PNG · WebP</p>
          </div>
        )}
      </div>
      {error && <p className="scn-editor-error">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="scn-sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
    </div>
  );
}

// ─── Priority Slider ──────────────────────────────────────────────────────────

function PrioritySlider({ label, value, onChange }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
}) {
  return (
    <div className="scn-editor-priority">
      <div className="scn-editor-priority__header">
        <span className="scn-editor-priority__label">{label}</span>
        <label className="scn-editor-toggle">
          <input type="checkbox" checked={value !== null}
            onChange={e => onChange(e.target.checked ? 5 : null)} />
          <span className="scn-editor-toggle__track" />
        </label>
      </div>
      {value !== null && (
        <div className="scn-editor-priority__row">
          <input type="range" min={1} max={10} value={value}
            className="scn-editor-slider"
            onChange={e => onChange(parseInt(e.target.value))} />
          <span className="scn-editor-priority__val">{value}</span>
        </div>
      )}
    </div>
  );
}

// ─── Tags Section ─────────────────────────────────────────────────────────────

function TagsSection({ selectedTags, apiBase, onTagsChange }: {
  selectedTags: Tag[]; apiBase: string; onTagsChange: (t: Tag[]) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<Tag[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(q: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setSuggestions([]); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api(`${apiBase}/articles/tags/?q=${encodeURIComponent(q)}`);
        const data = await res.json() as Tag[];
        const ids = new Set(selectedTags.map(t => t.id));
        setSuggestions(data.filter(t => !ids.has(t.id)));
      } catch { setSuggestions([]); }
    }, 280);
  }

  return (
    <div className="scn-editor-card">
      <h3 className="scn-editor-card__title">Tags</h3>
      <div className="scn-search-wrap">
        <svg className="scn-search-wrap__icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <Input className="scn-search-wrap__input" placeholder="Search tags…" value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value); }} />
      </div>
      {suggestions.length > 0 && (
        <div className="scn-editor-tags__suggestions">
          {suggestions.map(t => (
            <button key={t.id} className="scn-profile-chip"
              onClick={() => { onTagsChange([...selectedTags, t]); setQuery(''); setSuggestions([]); }}>
              + {t.name}
            </button>
          ))}
        </div>
      )}
      {selectedTags.length > 0 && (
        <div className="scn-editor-tags__chips">
          {selectedTags.map(t => (
            <button key={t.id} className="scn-profile-chip scn-profile-chip--selected"
              onClick={() => onTagsChange(selectedTags.filter(x => x.id !== t.id))}>
              {t.name} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Body Block Editors ───────────────────────────────────────────────────────

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

// ─── Wagtail inline image (Tiptap custom node) ───────────────────────────────

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
    return [{
      tag: 'img[data-image-id]',
      getAttrs: (el) => ({
        imageId: (el as HTMLElement).getAttribute('data-image-id'),
        src:     (el as HTMLElement).getAttribute('src') || '',
        alt:     (el as HTMLElement).getAttribute('alt') || '',
        format:  (el as HTMLElement).getAttribute('data-format') || 'fullwidth',
      }),
    }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['embed', mergeAttributes(
      { embedtype: 'image' },
      {
        id:     HTMLAttributes['imageId'],
        alt:    HTMLAttributes['alt'] || '',
        format: HTMLAttributes['format'] || 'fullwidth',
      },
    )];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WagtailImageNodeView);
  },
});

// ─── Paragraph Editor (Tiptap) ────────────────────────────────────────────────

function ParagraphEditor({ block, apiBase, onChange }: {
  block: ParagraphBlock; apiBase: string; onChange: (b: ParagraphBlock) => void;
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
    ],
    content: block.html || '',
    onUpdate: ({ editor: e }) => onChange({ ...block, html: e.getHTML() }),
    onFocus: () => setFocused(true),
    onBlur:  () => setFocused(false),
  });

  React.useEffect(() => { editorRef.current = editor; }, [editor]);

  // Sync when a different block is swapped in
  React.useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(block.html || '', { emitUpdate: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  React.useEffect(() => { return () => { editor?.destroy(); }; /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  async function handleImageFile(file: File) {
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await api(`${apiBase}/articles/upload-media/`, { method: 'POST', body: fd });
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
      {editor && (
        <RteToolbar
          editor={editor}
          onInsertImage={() => imageInputRef.current?.click()}
        />
      )}
      <EditorContent editor={editor} className="scn-rte-content" />
      <input ref={imageInputRef} type="file" accept="image/*" className="scn-sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; }} />
    </div>
  );
}

function ImageEditor({ block, apiBase, onChange }: {
  block: ImageBlock; articleId: number; apiBase: string; onChange: (b: ImageBlock) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true); setError('');
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await api(`${apiBase}/articles/upload-media/`, { method: 'POST', body: fd });
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

const BLOCK_LABEL: Record<string, string> = {
  heading: 'Heading', paragraph: 'Paragraph', image: 'Image', embed: 'Embed', separator: 'Separator',
};

function BlockEditor({ block, index, total, articleId, apiBase, onChange, onRemove, onMove }: {
  block: BodyBlock; index: number; total: number; articleId: number; apiBase: string;
  onChange: (b: BodyBlock) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
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
        {block.type === 'paragraph' && <ParagraphEditor block={block} apiBase={apiBase} onChange={onChange as (b: ParagraphBlock) => void} />}
        {block.type === 'image'     && <ImageEditor     block={block} articleId={articleId} apiBase={apiBase} onChange={onChange as (b: ImageBlock) => void} />}
        {block.type === 'embed'     && <EmbedEditor     block={block} onChange={onChange as (b: EmbedBlock) => void} />}
        {block.type === 'separator' && <SeparatorEditor block={block} onChange={onChange as (b: SeparatorBlock) => void} />}
      </div>
    </div>
  );
}

function AddBlockMenu({ onAdd }: { onAdd: (type: BodyBlock['type']) => void }) {
  const [open, setOpen] = React.useState(false);
  const types: Array<{ type: BodyBlock['type']; desc: string }> = [
    { type: 'heading',   desc: 'H2 or H3 section title' },
    { type: 'paragraph', desc: 'Rich text block' },
    { type: 'image',     desc: 'Uploaded image' },
    { type: 'embed',     desc: 'YouTube, Twitter…' },
    { type: 'separator', desc: 'Horizontal or vertical rule' },
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

// ─── SEO Card ─────────────────────────────────────────────────────────────────

function SeoCard({
  seoTitle, metaDesc, canonicalUrl, ogImageUrl,
  articleId, apiBase,
  onSeoTitleChange, onMetaDescChange, onCanonicalChange, onOgImageUploaded,
}: {
  seoTitle: string; metaDesc: string; canonicalUrl: string; ogImageUrl: string | null;
  articleId: number; apiBase: string;
  onSeoTitleChange: (v: string) => void;
  onMetaDescChange: (v: string) => void;
  onCanonicalChange: (v: string) => void;
  onOgImageUploaded: (url: string, id: number) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const descLen = metaDesc.length;
  const descOk  = descLen >= 50 && descLen <= 160;
  const descWarn = descLen > 0 && !descOk;

  async function uploadOg(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await api(`${apiBase}/articles/${articleId}/upload-image/`, { method: 'POST', body: fd });
      const json = await res.json();
      if (res.ok) onOgImageUploaded(json.image_url, json.image_id);
    } catch { /* silent */ }
    finally { setUploading(false); }
  }

  return (
    <div className="scn-editor-card">
      <h3 className="scn-editor-card__title">SEO</h3>

      <div className="scn-editor-seo__field">
        <Label className="scn-editor-field-label">SEO title</Label>
        <Input
          placeholder="Overrides browser tab title for search engines"
          value={seoTitle}
          onChange={e => onSeoTitleChange(e.target.value)}
        />
        <span className={`scn-editor-seo__counter${seoTitle.length > 60 ? ' scn-editor-seo__counter--warn' : ''}`}>
          {seoTitle.length}/60
        </span>
      </div>

      <div className="scn-editor-seo__field">
        <Label className="scn-editor-field-label">Meta description</Label>
        <textarea
          className={`scn-editor-tile-preview${descWarn ? ' scn-editor-tile-preview--warn' : ''}`}
          placeholder="50–160 chars · shown in search results"
          rows={3}
          value={metaDesc}
          onChange={e => onMetaDescChange(e.target.value)}
        />
        <span className={`scn-editor-seo__counter${descWarn ? ' scn-editor-seo__counter--warn' : ''}`}>
          {descLen}/160{descOk ? ' ✓' : ''}
        </span>
      </div>

      <div className="scn-editor-seo__field">
        <Label className="scn-editor-field-label">Canonical URL</Label>
        <Input
          type="url"
          placeholder="Leave blank to use page URL"
          value={canonicalUrl}
          onChange={e => onCanonicalChange(e.target.value)}
        />
      </div>

      <div className="scn-editor-seo__field">
        <Label className="scn-editor-field-label">Social (OG) image</Label>
        {ogImageUrl && <img src={ogImageUrl} alt="" className="scn-editor-image-preview" />}
        <Button variant="ghost" className="scn-editor-block__upload-btn" disabled={uploading}
          onClick={() => inputRef.current?.click()}>
          {uploading ? 'Uploading…' : ogImageUrl ? 'Replace OG image' : 'Upload OG image'}
        </Button>
        <input ref={inputRef} type="file" accept="image/*" className="scn-sr-only"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadOg(f); e.target.value = ''; }} />
      </div>
    </div>
  );
}

// ─── Actions Popover ──────────────────────────────────────────────────────────

function ActionsPopover({ status, onAction, disabled }: {
  status: 'published' | 'draft'; onAction: (a: ArticleAction) => void; disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  function go(a: ArticleAction) { onAction(a); setOpen(false); }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled}>More ▾</Button>
      </PopoverTrigger>
      <PopoverContent className="scn-popover-content scn-editor-actions-menu" align="end">
        {status === 'draft' && (
          <button className="scn-editor-action-item" onClick={() => go('publish')}>
            <span className="scn-editor-action-item__icon">◉</span> Publish
          </button>
        )}
        {status === 'published' && (
          <button className="scn-editor-action-item" onClick={() => go('unpublish')}>
            <span className="scn-editor-action-item__icon">○</span> Unpublish
          </button>
        )}
        <button className="scn-editor-action-item" onClick={() => go('submit_moderation')}>
          <span className="scn-editor-action-item__icon">⊙</span> Submit for moderation
        </button>
        <button className="scn-editor-action-item" onClick={() => go('save_draft')}>
          <span className="scn-editor-action-item__icon">◫</span> Save draft
        </button>
        <div className="scn-editor-actions-menu__sep" />
        <button className="scn-editor-action-item scn-editor-action-item--danger"
          onClick={() => { if (window.confirm('Delete this article? This cannot be undone.')) go('delete'); }}>
          <span className="scn-editor-action-item__icon">⊗</span> Delete
        </button>
      </PopoverContent>
    </Popover>
  );
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

// ─── Root Component ───────────────────────────────────────────────────────────

function ArticleEditor({ articleId, apiBase }: { articleId: number; apiBase: string }) {
  const [title, setTitle]             = React.useState('');
  const [sectionTermId, setSection]   = React.useState<number | null>(null);
  const [categoryId, setCategory]     = React.useState<number | null>(null);
  const [heroUrl, setHeroUrl]         = React.useState<string | null>(null);
  const [heroId, setHeroId]           = React.useState<number | null>(null);
  const [tilePrio, setTilePrio]       = React.useState<number | null>(null);
  const [artPrio, setArtPrio]         = React.useState<number | null>(null);
  const [expiresAt, setExpiresAt]     = React.useState('');
  const [tilePreview, setTilePreview]  = React.useState('');
  const [seoTitle, setSeoTitle]        = React.useState('');
  const [metaDesc, setMetaDesc]        = React.useState('');
  const [canonicalUrl, setCanonical]   = React.useState('');
  const [ogImageUrl, setOgImageUrl]    = React.useState<string | null>(null);
  const [ogImageId, setOgImageId]      = React.useState<number | null>(null);
  const [tags, setTags]               = React.useState<Tag[]>([]);
  const [blocks, setBlocks]           = React.useState<BodyBlock[]>([]);
  const [status, setStatus]           = React.useState<'published' | 'draft'>('draft');
  const [rootTerms, setRootTerms]     = React.useState<TaxonomyRoot[]>([]);
  const [loading, setLoading]         = React.useState(true);
  const [saving, setSaving]           = React.useState(false);
  const [toast, setToast]             = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function notify(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
  }

  // ── Load ──
  React.useEffect(() => {
    async function load() {
      try {
        const [ar, tr] = await Promise.all([
          api(`${apiBase}/articles/${articleId}/`),
          api(`${apiBase}/articles/taxonomy/`),
        ]);
        if (!ar.ok || !tr.ok) { notify('Failed to load article', 'error'); return; }
        const [article, taxonomy]: [ArticleApiData, { root_terms: TaxonomyRoot[] }] = await Promise.all([
          ar.json(), tr.json(),
        ]);
        setTitle(article.title);
        setSection(article.section_term?.id ?? null);
        setCategory(article.taxonomy_category?.id ?? null);
        setHeroUrl(article.hero_image_url);
        setHeroId(article.hero_image);
        setTilePrio(article.tile_priority);
        setArtPrio(article.article_priority);
        setExpiresAt(article.priority_expires_at ? article.priority_expires_at.slice(0, 16) : '');
        setTilePreview(article.tile_preview ?? '');
        setSeoTitle(article.seo_title ?? '');
        setMetaDesc(article.search_description ?? '');
        setCanonical(article.canonical_url ?? '');
        setOgImageUrl(article.og_image_url);
        setOgImageId(article.og_image);
        setTags(article.tags);
        setBlocks(apiToEditor(article.body));
        setStatus(article.status);
        setRootTerms(taxonomy.root_terms);
      } catch { notify('Failed to load article', 'error'); }
      finally { setLoading(false); }
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, apiBase]);

  // ── Save ──
  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title,
        section_term_id: sectionTermId,
        taxonomy_category_id: categoryId,
        tile_preview: tilePreview,
        tile_priority: tilePrio,
        article_priority: artPrio,
        priority_expires_at: expiresAt || null,
        tag_ids: tags.map(t => t.id),
        body_json: editorToApi(blocks),
        seo_title: seoTitle,
        search_description: metaDesc,
        canonical_url: canonicalUrl,
        og_image_id: ogImageId,
      };
      if (heroId !== null) payload['hero_image_id'] = heroId;

      const res = await api(`${apiBase}/articles/${articleId}/`, {
        method: 'PATCH', body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) { setStatus(json.status); notify('Saved'); }
      else notify(json.detail || JSON.stringify(json), 'error');
    } catch { notify('Save failed', 'error'); }
    finally { setSaving(false); }
  }

  // ── Actions ──
  async function handleAction(action: ArticleAction) {
    setSaving(true);
    try {
      const res = await api(`${apiBase}/articles/${articleId}/action/`, {
        method: 'POST', body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.ok) {
        if (action === 'delete') { window.location.href = '/profile/'; return; }
        if (json.article) setStatus(json.article.status);
        notify(json.message || action);
      } else notify(json.error || 'Action failed', 'error');
    } catch { notify('Action failed', 'error'); }
    finally { setSaving(false); }
  }

  // ── Block helpers ──
  function addBlock(type: BodyBlock['type']) {
    const id = uid();
    const newBlock: BodyBlock = (() => {
      switch (type) {
        case 'heading':   return { id, type: 'heading',   level: 'h2', text: '' };
        case 'paragraph': return { id, type: 'paragraph', html: '' };
        case 'image':     return { id, type: 'image',     imageId: null, imageUrl: null };
        case 'embed':     return { id, type: 'embed',     url: '' };
        case 'separator': return { id, type: 'separator', orientation: 'horizontal' };
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

  // ── Render ──
  if (loading) {
    return (
      <div className="scn-editor-loading">
        <div className="scn-editor-loading__spinner" />
        <p>Loading article…</p>
      </div>
    );
  }

  return (
    <div className="scn-editor">
      <header className="scn-editor-header">
        <a href="/profile/" className="scn-editor-header__back">← Profile</a>
        <span className={`scn-editor-status scn-editor-status--${status}`}>
          {status === 'published' ? 'Live' : 'Draft'}
        </span>
        <div className="scn-editor-header__actions">
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          <ActionsPopover status={status} onAction={handleAction} disabled={saving} />
        </div>
      </header>

      <div className="scn-editor-title-wrap">
        <Input
          className="scn-editor-title-input"
          placeholder="Article title"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </div>

      <div className="scn-editor-layout">
        {/* Body */}
        <div className="scn-editor-body">
          {blocks.map((block, i) => (
            <BlockEditor
              key={block.id}
              block={block}
              index={i}
              total={blocks.length}
              articleId={articleId}
              apiBase={apiBase}
              onChange={updated => setBlocks(prev => prev.map((b, j) => j === i ? updated : b))}
              onRemove={() => setBlocks(prev => prev.filter((_, j) => j !== i))}
              onMove={dir => moveBlock(i, dir)}
            />
          ))}
          <AddBlockMenu onAdd={addBlock} />
        </div>

        {/* Sidebar */}
        <aside className="scn-editor-sidebar">
          <TaxonomyBreadcrumb
            rootTerms={rootTerms}
            sectionTermId={sectionTermId}
            categoryId={categoryId}
            onSectionChange={id => { setSection(id); setCategory(null); }}
            onCategoryChange={setCategory}
          />

          <HeroImageUpload
            imageUrl={heroUrl}
            articleId={articleId}
            apiBase={apiBase}
            onUploaded={(url, id) => { setHeroUrl(url); setHeroId(id); }}
          />

          <div className="scn-editor-card">
            <h3 className="scn-editor-card__title">Priorities</h3>
            <PrioritySlider label="Tile priority"    value={tilePrio} onChange={setTilePrio} />
            <PrioritySlider label="Article priority" value={artPrio}  onChange={setArtPrio}  />
            <div className="scn-editor-priority-expiry">
              <Label className="scn-editor-field-label">Expires at</Label>
              <Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
          </div>

          <TagsSection selectedTags={tags} apiBase={apiBase} onTagsChange={setTags} />

          <div className="scn-editor-card">
            <h3 className="scn-editor-card__title">Tile preview</h3>
            <textarea
              className="scn-editor-tile-preview"
              placeholder="Short description shown on the article tile…"
              rows={3}
              value={tilePreview}
              onChange={e => setTilePreview(e.target.value)}
            />
          </div>

          <SeoCard
            seoTitle={seoTitle}
            metaDesc={metaDesc}
            canonicalUrl={canonicalUrl}
            ogImageUrl={ogImageUrl}
            articleId={articleId}
            apiBase={apiBase}
            onSeoTitleChange={setSeoTitle}
            onMetaDescChange={setMetaDesc}
            onCanonicalChange={setCanonical}
            onOgImageUploaded={(url, id) => { setOgImageUrl(url); setOgImageId(id); }}
          />
        </aside>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────

const editorRoots = new WeakMap<HTMLElement, Root>();

export function mountShadcnArticleEditor(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-article-editor]').forEach(host => {
    if (host.dataset['shadcnArticleEditorBound'] === '1') return;
    const articleId = parseInt(host.dataset['articleId'] ?? '', 10);
    const apiBase = (host.dataset['apiBase'] ?? '/api').replace(/\/$/, '');
    if (!articleId) return;
    host.dataset['shadcnArticleEditorBound'] = '1';
    let root = editorRoots.get(host);
    if (!root) { root = createRoot(host); editorRoots.set(host, root); }
    root.render(<ArticleEditor articleId={articleId} apiBase={apiBase} />);
  });
}
