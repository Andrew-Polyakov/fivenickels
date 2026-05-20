import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, type Editor, type ReactNodeViewProps } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { RteToolbar, TABLE_EXTENSIONS } from '../components/ui/rte-editor';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '../components/ui/empty';
import { cn } from '../lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type TaxonomyChild = { id: number; name: string; slug: string };
type TaxonomyRoot = { id: number; name: string; slug: string; children: TaxonomyChild[] };
type Tag = { id: number; name: string };

type HeadingBlock   = { id: string; type: 'heading';   level: 'h1' | 'h2'; text: string };
type ParagraphBlock = { id: string; type: 'paragraph'; html: string };
type MarkdownBlock  = { id: string; type: 'markdown'; markdown: string };
type ImageBlock     = { id: string; type: 'image';     imageId: number | null; imageUrl: string | null };
type EmbedBlock     = { id: string; type: 'embed';     url: string };
type SeparatorBlock = { id: string; type: 'separator' };
type PerforationBlock = { id: string; type: 'perforation_separator' };
type BodyBlock =
  | HeadingBlock
  | ParagraphBlock
  | MarkdownBlock
  | ImageBlock
  | EmbedBlock
  | SeparatorBlock
  | PerforationBlock;

type CatalystUi = 'bear' | 'neutral' | 'bull';
type CatalystValue = '' | 'Bearish' | 'Bullish';

type ArticleApiData = {
  id: number;
  title: string;
  status: 'published' | 'draft';
  preview_url?: string;
  section_term:      { id: number; name: string; slug: string } | null;
  taxonomy_category: { id: number; name: string; slug: string } | null;
  catalyst: CatalystValue | null;
  tags: Tag[];
  hero_image_url: string | null;
  hero_image: number | null;
  tile_preview: string | null;
  author_name: string | null;
  author_user: number | null;
  author_user_display: string | null;
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
    } else if (b.type === 'markdown') {
      out.push({ id, type: 'markdown', markdown: (b.value as string) || '' });
    } else if (b.type === 'image') {
      const v = b.value as { id?: number; url?: string } | null;
      out.push({ id, type: 'image', imageId: v?.id ?? null, imageUrl: v?.url ?? null });
    } else if (b.type === 'embed') {
      const v = b.value as { url?: string } | null;
      out.push({ id, type: 'embed', url: v?.url || '' });
    } else if (b.type === 'separator') {
      out.push({ id, type: 'separator' });
    } else if (b.type === 'perforation_separator') {
      out.push({ id, type: 'perforation_separator' });
    }
    // skip card, bento, unknown
  }
  return out;
}

function catalystFromApi(value: string | null | undefined): CatalystUi {
  if (value === 'Bearish') return 'bear';
  if (value === 'Bullish') return 'bull';
  return 'neutral';
}

function catalystToApi(value: CatalystUi): CatalystValue {
  if (value === 'bear') return 'Bearish';
  if (value === 'bull') return 'Bullish';
  return '';
}

function editorToApi(blocks: BodyBlock[]): unknown[] {
  return blocks.map(b => {
    if (b.type === 'heading')   return { id: b.id, type: 'heading',   value: { level: b.level, text: b.text } };
    if (b.type === 'paragraph') return { id: b.id, type: 'paragraph', value: b.html || '' };
    if (b.type === 'markdown')  return { id: b.id, type: 'markdown',  value: b.markdown || '' };
    if (b.type === 'image')     return { id: b.id, type: 'image',     value: b.imageId };
    if (b.type === 'embed')     return { id: b.id, type: 'embed',     value: { url: b.url } };
    if (b.type === 'perforation_separator') return { id: b.id, type: 'perforation_separator', value: null };
    return { id: b.id, type: 'separator', value: null };
  });
}

function mergeUniqueTags(...collections: Tag[][]): Tag[] {
  const byId = new Map<number, Tag>();
  for (const tags of collections) {
    for (const tag of tags) {
      byId.set(tag.id, tag);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function CatalystBullIcon() {
  return (
    <img
      className="scn-catalyst-toggle__icon"
      src="/static/images/bull.png"
      alt="Bullish"
      width={128}
      height={128}
      aria-hidden="true"
    />
  );
}

function CatalystBearIcon() {
  return (
    <img
      className="scn-catalyst-toggle__icon scn-catalyst-icon--bear"
      src="/static/images/bear.png"
      alt="Bearish"
      width={128}
      height={128}
      aria-hidden="true"
    />
  );
}

function CatalystSection({
  value,
  onChange,
}: {
  value: CatalystUi;
  onChange: (value: CatalystUi) => void;
}) {
  return (
    <div className="scn-editor-card scn-editor-card--catalyst">
      <h3 className="scn-editor-card__title">Catalyst</h3>
      <ToggleGroup
        className="scn-catalyst-toggle"
        value={value}
        onValueChange={nextValue => {
          if (nextValue) {
            onChange(nextValue as CatalystUi);
          }
        }}
      >
        <ToggleGroupItem
          value="bull"
          className="scn-catalyst-toggle__item scn-catalyst-toggle__item--bull"
          aria-label="Bullish catalyst"
        >
          <CatalystBullIcon />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="neutral"
          className="scn-catalyst-toggle__item scn-catalyst-toggle__item--neutral"
          aria-label="Neutral catalyst"
        >
          Neutral
        </ToggleGroupItem>
        <ToggleGroupItem
          value="bear"
          className="scn-catalyst-toggle__item scn-catalyst-toggle__item--bear"
          aria-label="Bearish catalyst"
        >
          <CatalystBearIcon />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

// ─── Taxonomy Breadcrumb ─────────────────────────────────────────────────────

function TaxonomyBreadcrumb({
  rootTerms, sectionTermId, categoryId, onSectionChange, onCategoryChange,
}: {
  rootTerms: TaxonomyRoot[];
  sectionTermId: number | null;
  categoryId: number | null;
  onSectionChange: (id: number | null) => void;
  onCategoryChange: (id: number | null) => void;
}) {
  const selected = rootTerms.find(t => t.id === sectionTermId) ?? null;
  const children = selected?.children ?? [];
  const sectionOptions = rootTerms.map(term => ({ value: String(term.id), label: term.name }));
  const categoryOptions = children.map(term => ({ value: String(term.id), label: term.name }));

  return (
    <div className="scn-editor-card">
      <h3 className="scn-editor-card__title">Taxonomy</h3>
      <div className="scn-editor-taxonomy__breadcrumb">
        <TaxonomyCombobox
          value={sectionTermId?.toString() ?? ''}
          options={sectionOptions}
          placeholder="Select section"
          searchPlaceholder="Search sections..."
          emptyMessage="No sections found."
          onChange={nextValue => {
            onSectionChange(nextValue ? parseInt(nextValue, 10) : null);
            onCategoryChange(null);
          }}
        />
        {children.length > 0 && (
          <>
            <span className="scn-editor-taxonomy__sep">›</span>
            <TaxonomyCombobox
              level={2}
              value={categoryId?.toString() ?? ''}
              options={[{ value: '', label: 'No category' }, ...categoryOptions]}
              placeholder="Select category"
              searchPlaceholder="Search categories..."
              emptyMessage="No categories found."
              onChange={nextValue => onCategoryChange(nextValue ? parseInt(nextValue, 10) : null)}
            />
          </>
        )}
      </div>
    </div>
  );
}

const TAXONOMY_COMBO_COLLISION_PADDING = { top: 72, bottom: 12, left: 12, right: 12 };

function TaxonomyCombobox({
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  onChange,
  level = 1,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  onChange: (value: string) => void;
  level?: 1 | 2;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const selectedOption = options.find(option => option.value === value) ?? null;
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  React.useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="scn-editor-taxonomy__combo-trigger" aria-expanded={open}>
          <span
            className={cn(
              'scn-editor-taxonomy__combo-value',
              !selectedOption && 'scn-editor-taxonomy__combo-value--placeholder'
            )}
          >
            {selectedOption?.label ?? placeholder}
          </span>
          <span className="scn-editor-taxonomy__combo-caret" aria-hidden="true">▾</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'scn-popover-content scn-editor-taxonomy__combo-popover',
          level === 2 && 'scn-editor-taxonomy__combo-popover--level-2'
        )}
        align="start"
        collisionPadding={TAXONOMY_COMBO_COLLISION_PADDING}
      >
        <div className="scn-search-wrap scn-editor-taxonomy__combo-search">
          <svg
            className="scn-search-wrap__icon"
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
            className="scn-search-wrap__input"
            value={query}
            placeholder={searchPlaceholder}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        <ScrollArea className="scn-editor-taxonomy__combo-scroll">
          <div className="scn-editor-taxonomy__combo-options">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={`${option.value || 'none'}-${option.label}`}
                type="button"
                className={cn(
                  'scn-editor-taxonomy__combo-option',
                  option.value === value && 'scn-editor-taxonomy__combo-option--active'
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {option.value === value ? (
                  <span className="scn-editor-taxonomy__combo-check" aria-hidden="true">✓</span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="scn-editor-taxonomy__combo-empty">{emptyMessage}</p>
          )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
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

function TagsSection({ selectedTags, allTags, apiBase, onTagsChange, onTagCreated }: {
  selectedTags: Tag[];
  allTags: Tag[];
  apiBase: string;
  onTagsChange: (t: Tag[]) => void;
  onTagCreated: (tag: Tag) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newTagName, setNewTagName] = React.useState('');
  const [createError, setCreateError] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const newTagInputId = React.useId();

  const selectedIds = React.useMemo(() => new Set(selectedTags.map(tag => tag.id)), [selectedTags]);

  const filteredTags = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allTags.filter(tag => {
      if (selectedIds.has(tag.id)) return false;
      if (!normalizedQuery) return true;
      return tag.name.toLowerCase().includes(normalizedQuery);
    });
  }, [allTags, query, selectedIds]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  React.useEffect(() => {
    if (!createOpen) {
      setNewTagName('');
      setCreateError('');
      setCreating(false);
    }
  }, [createOpen]);

  function addTag(tag: Tag) {
    if (selectedIds.has(tag.id)) return;
    onTagsChange([...selectedTags, tag]);
    setOpen(false);
    setQuery('');
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) {
      setCreateError('Tag name is required.');
      return;
    }

    setCreating(true);
    setCreateError('');
    try {
      const response = await api(`${apiBase}/articles/tags/`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const createdTag = payload as Partial<Tag> | null;
      if (!response.ok || typeof createdTag?.id !== 'number' || typeof createdTag?.name !== 'string') {
        const maybeError = payload as { detail?: string; error?: string } | null;
        setCreateError(maybeError?.detail || maybeError?.error || 'Failed to create tag.');
        return;
      }

      onTagCreated(createdTag as Tag);
      addTag(createdTag as Tag);
      setCreateOpen(false);
    } catch {
      setCreateError('Failed to create tag.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="scn-editor-card">
      <h3 className="scn-editor-card__title">Tags</h3>
      <div className="scn-editor-tags__controls">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="scn-editor-taxonomy__combo-trigger scn-editor-tags__combo-trigger"
              aria-expanded={open}
            >
              <span className={cn('scn-editor-taxonomy__combo-value', selectedTags.length === 0 && 'scn-editor-taxonomy__combo-value--placeholder')}>
                {selectedTags.length > 0 ? `${selectedTags.length} selected` : 'Search or browse tags'}
              </span>
              <span className="scn-editor-taxonomy__combo-caret" aria-hidden="true">▾</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="scn-popover-content scn-editor-taxonomy__combo-popover" align="start">
            <div className="scn-search-wrap scn-editor-taxonomy__combo-search">
              <svg
                className="scn-search-wrap__icon"
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <Input
                className="scn-search-wrap__input"
                placeholder="Search tags..."
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </div>
            <ScrollArea className="scn-editor-taxonomy__combo-scroll">
              <div className="scn-editor-taxonomy__combo-options">
                {filteredTags.length > 0 ? (
                  filteredTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className="scn-editor-taxonomy__combo-option"
                      onClick={() => addTag(tag)}
                    >
                      <span>{tag.name}</span>
                    </button>
                  ))
                ) : (
                  <p className="scn-editor-taxonomy__combo-empty">
                    {query.trim() ? 'No matching tags found.' : 'No available tags.'}
                  </p>
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          className="scn-editor-tags__add-btn"
          onClick={() => setCreateOpen(true)}
          aria-label="Create new tag"
        >
          +
        </Button>
      </div>
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create tag</DialogTitle>
            <DialogDescription>
              Add a new tag, then it will be selected on this article.
            </DialogDescription>
          </DialogHeader>
          <form
            className="scn-editor-tags__new-tag-form"
            onSubmit={event => {
              event.preventDefault();
              void handleCreateTag();
            }}
          >
            <Label htmlFor={newTagInputId} className="scn-editor-field-label">Tag name</Label>
            <Input
              id={newTagInputId}
              placeholder="e.g. AI, Earnings, Semiconductors"
              value={newTagName}
              onChange={event => setNewTagName(event.target.value)}
              disabled={creating}
            />
            {createError ? <p className="scn-editor-error">{createError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !newTagName.trim()}>
                {creating ? 'Creating…' : 'Create tag'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
      ...TABLE_EXTENSIONS,
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
      <ScrollArea className="scn-editor-block-scroll scn-editor-block-scroll--paragraph">
        <EditorContent editor={editor} className="scn-rte-content" />
      </ScrollArea>
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

function SeparatorEditor() {
  return (
    <div className="scn-editor-block__fields scn-editor-separator-preview" aria-hidden>
      <hr className="scn-taxonomy-content__sep scn-taxonomy-content__sep--horizontal" />
    </div>
  );
}

function PerforationSeparatorEditor() {
  const patternId = React.useMemo(() => `perf-ed-${uid()}`, []);
  const fill = 'var(--muted-foreground, #71717a)';
  return (
    <div className="scn-editor-block__fields scn-editor-perforation-preview" aria-hidden>
      <p className="scn-editor-perforation-preview__hint">Dotted tear line (matches public article layout).</p>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 19"
        width="100%"
        preserveAspectRatio="none"
        focusable="false"
        className="scn-editor-perforation-preview__svg"
      >
        <defs>
          <pattern id={patternId} width="14" height="19" patternUnits="userSpaceOnUse">
            <rect x="6" y="0" width="2" height="2" fill={fill} />
            <rect x="5.5" y="3" width="3" height="3" fill={fill} />
            <rect x="4.5" y="7" width="5" height="5" fill={fill} />
            <rect x="5.5" y="13" width="3" height="3" fill={fill} />
            <rect x="6" y="17" width="2" height="2" fill={fill} />
          </pattern>
        </defs>
        <rect width="100" height="19" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}

function MarkdownEditor({ block, onChange }: { block: MarkdownBlock; onChange: (b: MarkdownBlock) => void }) {
  return (
    <div className="scn-editor-block__fields">
      <ScrollArea className="scn-editor-block-scroll scn-editor-block-scroll--markdown">
        <textarea
          className="scn-editor-markdown"
          placeholder="Markdown body content…"
          value={block.markdown}
          onChange={e => onChange({ ...block, markdown: e.target.value })}
        />
      </ScrollArea>
    </div>
  );
}

const BLOCK_LABEL: Record<string, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  markdown: 'Markdown',
  image: 'Image',
  embed: 'Embed',
  separator: 'Separator',
  perforation_separator: 'Perforated divider',
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
        {block.type === 'markdown'  && <MarkdownEditor  block={block} onChange={onChange as (b: MarkdownBlock) => void} />}
        {block.type === 'image'     && <ImageEditor     block={block} articleId={articleId} apiBase={apiBase} onChange={onChange as (b: ImageBlock) => void} />}
        {block.type === 'embed'     && <EmbedEditor     block={block} onChange={onChange as (b: EmbedBlock) => void} />}
        {block.type === 'separator' && <SeparatorEditor />}
        {block.type === 'perforation_separator' && <PerforationSeparatorEditor />}
      </div>
    </div>
  );
}

function AddBlockMenu({ onAdd }: { onAdd: (type: BodyBlock['type']) => void }) {
  const [open, setOpen] = React.useState(false);
  const types: Array<{ type: BodyBlock['type']; desc: string }> = [
    { type: 'heading',   desc: 'H2 or H3 section title' },
    { type: 'paragraph', desc: 'Rich text block' },
    { type: 'markdown',  desc: 'Markdown body text' },
    { type: 'image',     desc: 'Uploaded image' },
    { type: 'embed',     desc: 'YouTube, Twitter…' },
    { type: 'separator', desc: 'Horizontal rule' },
    { type: 'perforation_separator', desc: 'Dotted perforation (decorative)' },
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
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  function go(a: ArticleAction) { onAction(a); setOpen(false); }

  return (
    <>
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
          <button
            className="scn-editor-action-item scn-editor-action-item--danger"
            onClick={() => {
              setOpen(false);
              setDeleteOpen(true);
            }}
          >
            <span className="scn-editor-action-item__icon">⊗</span> Delete
          </button>
        </PopoverContent>
      </Popover>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete article</DialogTitle>
            <DialogDescription>
              Delete this article? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDeleteOpen(false);
                go('delete');
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
  const [catalyst, setCatalyst]       = React.useState<CatalystUi>('neutral');
  const [heroUrl, setHeroUrl]         = React.useState<string | null>(null);
  const [heroId, setHeroId]           = React.useState<number | null>(null);
  const [authorName, setAuthorName]   = React.useState('');
  const [authorUser, setAuthorUser]   = React.useState<string>('');
  const [authorUserDisplay, setAuthorUserDisplay] = React.useState('');
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
  const [allTags, setAllTags]         = React.useState<Tag[]>([]);
  const [blocks, setBlocks]           = React.useState<BodyBlock[]>([]);
  const [status, setStatus]           = React.useState<'published' | 'draft'>('draft');
  const [rootTerms, setRootTerms]     = React.useState<TaxonomyRoot[]>([]);
  const [loading, setLoading]         = React.useState(true);
  const [saving, setSaving]           = React.useState(false);
  const [previewUrl, setPreviewUrl]   = React.useState('');
  const [toast, setToast]             = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function notify(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
  }

  function buildSavePayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      title,
      section_term_id: sectionTermId,
      taxonomy_category_id: categoryId,
      catalyst: catalystToApi(catalyst),
      tile_preview: tilePreview,
      author_name: authorName,
      author_user_lookup: authorUser,
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
    return payload;
  }

  function applySaveResponse(json: ArticleApiData) {
    setStatus(json.status);
    if (typeof json.author_user_display === 'string') {
      setAuthorUserDisplay(json.author_user_display);
    }
    setAuthorUser('');
    if (json.preview_url) {
      setPreviewUrl(json.preview_url);
    }
  }

  // ── Load ──
  React.useEffect(() => {
    async function load() {
      try {
        const [ar, tr, tgr] = await Promise.all([
          api(`${apiBase}/articles/${articleId}/`),
          api(`${apiBase}/articles/taxonomy/`),
          api(`${apiBase}/articles/tags/`),
        ]);
        if (!ar.ok || !tr.ok || !tgr.ok) { notify('Failed to load article', 'error'); return; }
        const [article, taxonomy, tagCatalog]: [ArticleApiData, { root_terms: TaxonomyRoot[] }, Tag[]] = await Promise.all([
          ar.json(), tr.json(), tgr.json(),
        ]);
        setTitle(article.title);
        setSection(article.section_term?.id ?? null);
        setCategory(article.taxonomy_category?.id ?? null);
        setCatalyst(catalystFromApi(article.catalyst));
        setHeroUrl(article.hero_image_url);
        setHeroId(article.hero_image);
        setAuthorName(article.author_name ?? '');
        setAuthorUser('');
        setAuthorUserDisplay(article.author_user_display ?? '');
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
        setAllTags(mergeUniqueTags(tagCatalog, article.tags));
        setBlocks(apiToEditor(article.body));
        setStatus(article.status);
        setPreviewUrl(
          article.preview_url ?? `/profile/article/${articleId}/preview/`
        );
        setRootTerms(taxonomy.root_terms);
      } catch { notify('Failed to load article', 'error'); }
      finally { setLoading(false); }
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, apiBase]);

  // ── Save ──
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await api(`${apiBase}/articles/${articleId}/`, {
        method: 'PATCH', body: JSON.stringify(buildSavePayload()),
      });
      const json = await res.json() as ArticleApiData & { detail?: string };
      if (res.ok) {
        applySaveResponse(json);
        notify('Saved');
      }
      else notify(json.detail || JSON.stringify(json), 'error');
    } catch { notify('Save failed', 'error'); }
    finally { setSaving(false); }
  }

  async function handlePreview() {
    if (saving || !previewUrl) return;
    setSaving(true);
    try {
      const res = await api(`${apiBase}/articles/${articleId}/`, {
        method: 'PATCH', body: JSON.stringify(buildSavePayload()),
      });
      const json = await res.json() as ArticleApiData & { detail?: string };
      if (res.ok) {
        applySaveResponse(json);
        const url = json.preview_url || previewUrl;
        window.open(url, '_blank', 'noopener,noreferrer');
        notify('Saved — preview opened');
      }
      else notify(json.detail || JSON.stringify(json), 'error');
    } catch { notify('Preview failed', 'error'); }
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
        case 'markdown':  return { id, type: 'markdown',  markdown: '' };
        case 'image':     return { id, type: 'image',     imageId: null, imageUrl: null };
        case 'embed':     return { id, type: 'embed',     url: '' };
        case 'separator': return { id, type: 'separator' };
        case 'perforation_separator': return { id, type: 'perforation_separator' };
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
        <div className="scn-editor-title-wrap">
          <Input
            className="scn-editor-title-input"
            placeholder="Article title"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>
        <div className="scn-editor-header__actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handlePreview()}
            disabled={saving || !previewUrl}
          >
            {saving ? 'Saving…' : 'Preview'}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <ActionsPopover status={status} onAction={handleAction} disabled={saving} />
        </div>
      </header>

      <div className="scn-editor-layout">
        {/* Body */}
        <div className="scn-editor-body">
          {blocks.length === 0 ? (
            <Empty className="scn-editor-card scn-editor-empty-blocks">
              <EmptyHeader>
                <EmptyTitle>Start with your first block</EmptyTitle>
                <EmptyDescription>Add content blocks to build the article body.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <AddBlockMenu onAdd={addBlock} />
              </EmptyContent>
            </Empty>
          ) : (
            <>
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
            </>
          )}
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

          <CatalystSection value={catalyst} onChange={setCatalyst} />

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

          <TagsSection
            selectedTags={tags}
            allTags={allTags}
            apiBase={apiBase}
            onTagsChange={setTags}
            onTagCreated={tag => setAllTags(prev => mergeUniqueTags(prev, [tag]))}
          />

          <div className="scn-editor-card">
            <h3 className="scn-editor-card__title">Author</h3>
            <Label className="scn-editor-field-label">Custom author name</Label>
            <Input
              placeholder="e.g. Jules Winfield"
              value={authorName}
              onChange={e => setAuthorName(e.target.value)}
            />
            <Label className="scn-editor-field-label">Author account (username or email)</Label>
            <Input
              placeholder="Leave blank to unlink account"
              value={authorUser}
              onChange={e => setAuthorUser(e.target.value)}
            />
            {authorUserDisplay ? (
              <p className="scn-text-muted">Linked account: {authorUserDisplay}</p>
            ) : null}
          </div>

          <div className="scn-editor-card scn-editor-card--tile-preview">
            <h3 className="scn-editor-card__title">Tile preview</h3>
            <textarea
              className="scn-editor-tile-preview scn-editor-tile-preview--fill"
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
