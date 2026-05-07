import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SearchIcon } from 'lucide-react';
import { Group, Panel, Separator as ResizeSeparator } from 'react-resizable-panels';

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../components/ui/input-group';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '../components/ui/empty';
import { Separator as UiSeparator } from '../components/ui/separator';
import { cn } from '../lib/utils';
import { Toaster, toast } from 'sonner';

type ContentSourceMode = 'random' | 'specific_article' | 'tagged_with' | 'priority_articles';
type ContentSourceConfig = {
  mode: ContentSourceMode;
  specificArticleId?: number | null;
  specificArticleTitle?: string;
  specificArticleUrl?: string;
  tagIds?: number[];
};

export type ArticleCardPayload =
  | { kind: 'article'; title: string; href: string; excerpt: string; imageUrl: string; sourceConfig?: ContentSourceConfig }
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
  | { kind: 'row'; items: RowItem[] }
  | { kind: 'separator'; orientation: 'horizontal' | 'vertical' };

export type CardLayoutPayload = {
  rows: LayoutRow[];
  layoutVersion?: number;
};

export type LayoutPresetId = 'twin' | 'three' | 'quattro' | 'grid-2x4';

/** Persisted with taxonomy master layout JSON when using subsection column stacks. */
export const TAXONOMY_MASTER_LAYOUT_VERSION = 2;

function stubRowItem(message: string): RowItem {
  return { type: 'card', card: { kind: 'stub', message } };
}

/** Legacy presets: N side-by-side columns (vertical separators between stubs). */
function stubRowWithColumns(panelCount: number, startLabel: number): LayoutRow {
  const items: RowItem[] = [];
  for (let i = 0; i < panelCount; i++) {
    if (i > 0) {
      items.push({ type: 'separator', orientation: 'vertical' });
    }
    items.push(stubRowItem(`Panel ${startLabel + i}`));
  }
  return { kind: 'row', items };
}

function cloneRows(rows: LayoutRow[]): LayoutRow[] {
  return structuredClone(rows);
}

function isVerticalSeparatorItem(item: RowItem | undefined): boolean {
  return item?.type === 'separator' && item.orientation === 'vertical';
}

/** Removes one card and any adjacent vertical separator; returns null if index invalid. */
function removeCardFromRowItems(items: RowItem[], itemIndex: number): RowItem[] | null {
  if (itemIndex < 0 || itemIndex >= items.length) {
    return null;
  }
  const victim = items[itemIndex];
  if (victim.type !== 'card') {
    return null;
  }
  const next = [...items];
  if (itemIndex > 0 && isVerticalSeparatorItem(next[itemIndex - 1])) {
    next.splice(itemIndex - 1, 2);
  } else if (itemIndex < next.length - 1 && isVerticalSeparatorItem(next[itemIndex + 1])) {
    next.splice(itemIndex, 2);
  } else {
    next.splice(itemIndex, 1);
  }
  while (next.length > 0 && isVerticalSeparatorItem(next[0])) {
    next.shift();
  }
  while (next.length > 0 && isVerticalSeparatorItem(next[next.length - 1])) {
    next.pop();
  }
  return next;
}

/** Target index for adding cards: always a `kind: 'row'` band, never a horizontal separator row. */
function resolveContentRowIndex(rows: LayoutRow[], preferred: number | null): number {
  if (rows.length === 0) {
    return -1;
  }
  if (preferred !== null && preferred >= 0 && preferred < rows.length) {
    if (rows[preferred].kind === 'row') {
      return preferred;
    }
    for (let i = preferred - 1; i >= 0; i--) {
      if (rows[i].kind === 'row') {
        return i;
      }
    }
    for (let i = preferred + 1; i < rows.length; i++) {
      if (rows[i].kind === 'row') {
        return i;
      }
    }
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].kind === 'row') {
      return i;
    }
  }
  return -1;
}

function firstContentRowAtOrAfter(rows: LayoutRow[], fromIdx: number): number {
  for (let i = Math.max(0, fromIdx); i < rows.length; i++) {
    if (rows[i].kind === 'row') {
      return i;
    }
  }
  return -1;
}

function lastContentRowAtOrBefore(rows: LayoutRow[], fromIdx: number): number {
  for (let i = Math.min(fromIdx, rows.length - 1); i >= 0; i--) {
    if (rows[i].kind === 'row') {
      return i;
    }
  }
  return -1;
}

type SlotBand = {
  idx: number;
  top: number;
  bottom: number;
  kind: LayoutRow['kind'];
};

/** insertCard: append a new content row at end (empty stack / click below last band). */
const APPEND_NEW_ROW = -2;

function contentGapAfterHorizontalSep(rows: LayoutRow[], sepIdx: number): boolean {
  if (rows[sepIdx]?.kind !== 'separator') {
    return false;
  }
  const next = rows[sepIdx + 1];
  return next === undefined || next.kind === 'separator';
}

function collectSlotBands(host: HTMLElement | null, rows: LayoutRow[]): SlotBand[] {
  if (!host) {
    return [];
  }
  const slots = Array.from(host.querySelectorAll<HTMLElement>('[data-layout-row-index]'));
  const out: SlotBand[] = [];
  for (const el of slots) {
    const idx = Number.parseInt(el.dataset['layoutRowIndex'] ?? '', 10);
    if (Number.isNaN(idx) || idx < 0 || idx >= rows.length) {
      continue;
    }
    const r = el.getBoundingClientRect();
    out.push({
      idx,
      top: r.top,
      bottom: r.bottom,
      kind: rows[idx].kind,
    });
  }
  out.sort((a, b) => a.top - b.top);
  return out;
}

/** Pick content row for Add card from pointer Y (above/below horizontal separator band). */
function resolveCardTargetRowFromPointer(
  rows: LayoutRow[],
  host: HTMLElement | null,
  clientY: number,
  fallbackSlotIndex: number | null
): number {
  const bands = collectSlotBands(host, rows);
  if (bands.length === 0) {
    return resolveContentRowIndex(rows, fallbackSlotIndex);
  }
  const lastBottom = Math.max(...bands.map((b) => b.bottom));
  if (clientY > lastBottom + 8) {
    return APPEND_NEW_ROW;
  }
  const pickNearest = (): number => {
    let nearest: SlotBand | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const b of bands) {
      const clamped = Math.min(Math.max(clientY, b.top), b.bottom);
      const d = Math.abs(clientY - clamped);
      if (d < best) {
        best = d;
        nearest = b;
      }
    }
    if (!nearest) {
      return resolveContentRowIndex(rows, fallbackSlotIndex);
    }
    if (nearest.kind === 'separator') {
      const mid = (nearest.top + nearest.bottom) / 2;
      if (clientY < mid) {
        const up = lastContentRowAtOrBefore(rows, nearest.idx - 1);
        return up >= 0 ? up : firstContentRowAtOrAfter(rows, nearest.idx + 1);
      }
      const down = firstContentRowAtOrAfter(rows, nearest.idx + 1);
      return down >= 0 ? down : APPEND_NEW_ROW;
    }
    return nearest.idx;
  };

  for (const b of bands) {
    if (clientY >= b.top && clientY <= b.bottom) {
      if (b.kind === 'separator') {
        const mid = (b.top + b.bottom) / 2;
        if (clientY < mid) {
          const up = lastContentRowAtOrBefore(rows, b.idx - 1);
          return up >= 0 ? up : firstContentRowAtOrAfter(rows, b.idx + 1);
        }
        const down = firstContentRowAtOrAfter(rows, b.idx + 1);
        return down >= 0 ? down : APPEND_NEW_ROW;
      }
      return b.idx;
    }
  }
  return pickNearest();
}

/** Insert index (0…length) for a new horizontal separator row from pointer Y. */
function resolveHorizontalSepInsertIndexFromPointer(
  rows: LayoutRow[],
  host: HTMLElement | null,
  clientY: number,
  fallbackSlotIndex: number | null
): number {
  const bands = collectSlotBands(host, rows);
  if (bands.length === 0) {
    const r = resolveContentRowIndex(rows, fallbackSlotIndex);
    return r >= 0 ? r + 1 : rows.length;
  }
  const lastBottom = Math.max(...bands.map((b) => b.bottom));
  if (clientY > lastBottom + 8) {
    return rows.length;
  }
  const pickNearest = (): number => {
    let nearest: SlotBand | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const b of bands) {
      const clamped = Math.min(Math.max(clientY, b.top), b.bottom);
      const d = Math.abs(clientY - clamped);
      if (d < best) {
        best = d;
        nearest = b;
      }
    }
    if (!nearest) {
      const r = resolveContentRowIndex(rows, fallbackSlotIndex);
      return r >= 0 ? r + 1 : rows.length;
    }
    if (nearest.kind === 'separator') {
      const mid = (nearest.top + nearest.bottom) / 2;
      return clientY < mid ? nearest.idx : nearest.idx + 1;
    }
    const mid = (nearest.top + nearest.bottom) / 2;
    return clientY < mid ? nearest.idx : nearest.idx + 1;
  };

  for (const b of bands) {
    if (clientY >= b.top && clientY <= b.bottom) {
      if (b.kind === 'separator') {
        const mid = (b.top + b.bottom) / 2;
        return clientY < mid ? b.idx : b.idx + 1;
      }
      const mid = (b.top + b.bottom) / 2;
      return clientY < mid ? b.idx : b.idx + 1;
    }
  }
  return pickNearest();
}

type CardPanelEntry = {
  card: ArticleCardPayload;
  itemIndex: number;
  dividerBefore: boolean;
};

function isFreeLayoutCard(card: ArticleCardPayload): boolean {
  return card.kind === 'layout' && card.variant === 'free';
}

function defaultCardForVariant(variant: 'biggies' | 'feature' | 'headline' | 'carousel' | 'free'): ArticleCardPayload {
  return {
    kind: 'layout',
    variant,
    title: variant === 'headline' ? 'Headline title' : 'Card title',
    imageMode: variant === 'biggies' ? 'third' : variant === 'feature' ? 'wide' : undefined,
    imageUrl:
      variant === 'biggies' || variant === 'feature'
        ? 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=60'
        : undefined,
    carouselHeader: variant === 'carousel' ? 'Subsection header' : undefined,
    subcards: variant === 'carousel' ? ['Card 1', 'Card 2', 'Card 3', 'Card 4', 'Card 5'] : undefined,
    widthPx: variant === 'free' ? 800 : undefined,
    heightPx: variant === 'free' ? 500 : undefined,
    freeX: variant === 'free' ? 0 : undefined,
    freeY: variant === 'free' ? 0 : undefined,
  };
}

function collectCardPanels(items: RowItem[]): CardPanelEntry[] {
  const out: CardPanelEntry[] = [];
  let dividerBefore = false;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'separator' && item.orientation === 'vertical') {
      dividerBefore = true;
      continue;
    }
    if (item.type === 'card') {
      out.push({ card: item.card, itemIndex: i, dividerBefore });
      dividerBefore = false;
    }
  }
  return out;
}

/** v1 taxonomy rows: each adjacent card pair was a separate column. v2: only explicit vertical seps split columns. */
function migrateTaxonomyMasterRowsV1ToV2(rows: LayoutRow[]): LayoutRow[] {
  return rows.map((row) => {
    if (row.kind !== 'row') {
      return row;
    }
    const next: RowItem[] = [];
    const items = row.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      next.push(it);
      if (it.type === 'card') {
        const nxt = items[i + 1];
        if (nxt && nxt.type === 'card') {
          next.push({ type: 'separator', orientation: 'vertical' });
        }
      }
    }
    return { kind: 'row', items: next };
  });
}

function ingestEditorRowsFromPayload(payload: CardLayoutPayload, taxonomySubsectionLayout: boolean): LayoutRow[] {
  const base = cloneRows(payload.rows);
  if (!taxonomySubsectionLayout) {
    return base;
  }
  const v = payload.layoutVersion ?? 1;
  if (v < TAXONOMY_MASTER_LAYOUT_VERSION) {
    return migrateTaxonomyMasterRowsV1ToV2(base);
  }
  return base;
}

/** Card item indices per column (split on vertical RowItem separators). */
function collectTaxonomyColumnItemIndices(items: RowItem[]): number[][] {
  const cols: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'separator' && item.orientation === 'vertical') {
      cols.push(cur);
      cur = [];
    } else if (item.type === 'card') {
      cur.push(i);
    }
  }
  cols.push(cur);
  return cols;
}

/** Insert position in `items` so a new card lands in column `columnIndex` (handles empty columns). */
function taxonomyInsertIndexForColumn(items: RowItem[], columnIndex: number): number {
  const cols = collectTaxonomyColumnItemIndices(items);
  if (columnIndex < 0 || columnIndex >= cols.length) {
    return items.length;
  }
  const col = cols[columnIndex];
  if (col.length > 0) {
    return col[col.length - 1] + 1;
  }
  if (columnIndex === 0) {
    return 0;
  }
  let seen = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type === 'separator' && it.orientation === 'vertical') {
      seen++;
      if (seen === columnIndex) {
        return i + 1;
      }
    }
  }
  return items.length;
}

/** Which column (0-based) the pointer is in for hit-testing empty stack areas. */
function resolveTaxonomyColumnByClientX(rowSlot: HTMLElement, clientX: number): number {
  const markers = Array.from(rowSlot.querySelectorAll<HTMLElement>('[data-taxonomy-column-index]')).filter((el) =>
    rowSlot.contains(el)
  );
  if (markers.length === 0) {
    return 0;
  }
  const annotated = markers
    .map((el) => {
      const idx = Number.parseInt(el.dataset['taxonomyColumnIndex'] ?? '', 10);
      const r = el.getBoundingClientRect();
      return { el, idx: Number.isNaN(idx) ? 0 : idx, r };
    })
    .sort((a, b) => a.r.left - b.r.left);

  for (let i = 0; i < annotated.length; i++) {
    const { el, r } = annotated[i];
    const isLast = i === annotated.length - 1;
    const inside = isLast ? clientX >= r.left && clientX <= r.right : clientX >= r.left && clientX < r.right;
    if (inside) {
      return Number.parseInt(el.dataset['taxonomyColumnIndex'] ?? '0', 10) || 0;
    }
  }
  let bestIdx = annotated[0].idx;
  let bestD = Number.POSITIVE_INFINITY;
  for (const { el, r } of annotated) {
    const mid = (r.left + r.right) / 2;
    const d = Math.abs(clientX - mid);
    if (d < bestD) {
      bestD = d;
      bestIdx = Number.parseInt(el.dataset['taxonomyColumnIndex'] ?? '0', 10) || 0;
    }
  }
  return bestIdx;
}

/** Splice index: same column as anchor card, else column under pointer, else last column. */
function taxonomyInsertPositionForNewCard(
  items: RowItem[],
  anchorItemIndex: number | null,
  pointerColumnIndex: number | null
): number {
  const cols = collectTaxonomyColumnItemIndices(items);
  if (cols.length === 0) {
    return 0;
  }
  if (anchorItemIndex !== null) {
    const found = cols.find((col) => col.includes(anchorItemIndex));
    if (found && found.length > 0) {
      return found[found.length - 1] + 1;
    }
  }
  const ci =
    pointerColumnIndex !== null && pointerColumnIndex >= 0 && pointerColumnIndex < cols.length
      ? pointerColumnIndex
      : cols.length - 1;
  return taxonomyInsertIndexForColumn(items, ci);
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
  }
}

/** Card content min 400px + 10px outer margin (must fit within container or resize breaks). */
const CARD_MIN_CONTENT_PX = 400;
const CARD_LAYOUT_MARGIN_PX = 10;
const MIN_PANEL_OUTER_PX = CARD_MIN_CONTENT_PX + CARD_LAYOUT_MARGIN_PX;

/** Minimum vertical stack height so row bands keep ~card min height; sep rows stay thin via weighted sizes. */
function verticalStackMinHeightPx(rows: LayoutRow[]): number {
  let h = 0;
  for (const r of rows) {
    if (r.kind === 'separator') {
      h += 40;
    } else {
      h += MIN_PANEL_OUTER_PX;
    }
  }
  return Math.max(h, 192);
}

function formatFeasibleMinPercent(minPx: number, containerPx: number, panelCount: number): string {
  if (panelCount <= 0) {
    return '0%';
  }
  if (containerPx <= 0) {
    return `${(100 / panelCount).toFixed(4)}%`;
  }
  if (panelCount * minPx <= containerPx) {
    const p = (minPx / containerPx) * 100;
    return `${Math.min(99.99, Math.max(0.05, p)).toFixed(4)}%`;
  }
  return `${(100 / panelCount).toFixed(4)}%`;
}

function useFeasiblePanelMinPercent(
  containerRef: React.RefObject<HTMLElement | null>,
  panelCount: number,
  minPx: number,
  axis: 'width' | 'height'
): string {
  const [dim, setDim] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || panelCount <= 0) {
      return;
    }
    const read = () => {
      const r = el.getBoundingClientRect();
      setDim(axis === 'width' ? r.width : r.height);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [axis, panelCount]);
  return React.useMemo(
    () => formatFeasibleMinPercent(minPx, dim, panelCount),
    [minPx, dim, panelCount]
  );
}

type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  rowIndex: number | null;
  itemIndex: number | null;
  isCardMenu: boolean;
  /** Viewport Y when menu opened; used to place adds above/below horizontal separators. */
  clientY: number;
  /** Viewport X when menu opened; taxonomy: which column partition was clicked. */
  clientX: number;
  /** Taxonomy subsection: 0-based column from pointer (or null → last column). */
  taxonomyColumnIndex: number | null;
  /** Insert first card row immediately after this horizontal separator index (+ button gap). */
  gapAfterSepIndex: number | null;
};

function getCookie(name: string): string | null {
  const escaped = name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getCsrfToken(): string | null {
  return getCookie('csrftoken');
}

function ArticleCardView({
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
            <div className="scn-carousel-subcards">
              {(data.subcards ?? ['Card 1', 'Card 2', 'Card 3', 'Card 4', 'Card 5']).slice(0, 5).map((s, idx) => (
                <article key={idx} className="scn-carousel-subcard">
                  {s}
                </article>
              ))}
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
  const body = (
    <>
      {data.imageUrl ? (
        <div className="scn-article-card__media">
          <img src={data.imageUrl} alt="" className="scn-article-card__img" loading="lazy" />
        </div>
      ) : null}
      <CardHeader>
        <CardTitle>{data.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.excerpt ? <p className="scn-article-card__excerpt">{data.excerpt}</p> : null}
        {data.href ? <span className="scn-article-card__cta">Read more</span> : null}
      </CardContent>
    </>
  );
  if (data.href) {
    return (
      <Card className="scn-article-card scn-article-card--linked">
        <a className="scn-article-card__shell" href={data.href}>
          {body}
        </a>
      </Card>
    );
  }
  return (
    <Card className="scn-article-card">
      {body}
    </Card>
  );
}

/** Taxonomy master pane: columns of vertically stacked cards (horizontal resize between columns only). */
function TaxonomyStackedCardRow({
  items,
  panelGroupKey,
  rowIndex,
  enableMasterPane,
  onDeleteCard,
  onUpdateCard,
  onRemoveSubsection,
}: {
  items: RowItem[];
  panelGroupKey: string;
  rowIndex: number;
  enableMasterPane: boolean;
  onDeleteCard: (rowIndex: number, itemIndex: number) => void;
  onUpdateCard?: (rowIndex: number, itemIndex: number, card: ArticleCardPayload) => void;
  onRemoveSubsection?: (rowIndex: number) => void;
}): React.JSX.Element {
  const hasCard = items.some((x) => x.type === 'card');
  if (!hasCard) {
    if (enableMasterPane && onRemoveSubsection) {
      return (
        <div className="scn-subsection-empty">
          <button
            type="button"
            className="scn-subsection-empty__remove"
            aria-label="Remove section"
            title="Remove this section"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemoveSubsection(rowIndex);
            }}
          >
            ×
          </button>
        </div>
      );
    }
    return <div className="scn-subsection-empty scn-subsection-empty--placeholder" aria-hidden="true" />;
  }

  const cols = collectTaxonomyColumnItemIndices(items);
  const onDel = enableMasterPane ? onDeleteCard : undefined;

  const renderStackCell = (itemIndex: number): React.JSX.Element | null => {
    const item = items[itemIndex];
    if (!item || item.type !== 'card') {
      return null;
    }
    const card = item.card;
    const free = isFreeLayoutCard(card);
    const inner = (
      <ArticleCardView
        data={card}
        enableMasterPane={enableMasterPane}
        onCarouselHeaderChange={(header) => {
          if (!onUpdateCard) {
            return;
          }
          if (card.kind !== 'layout' || card.variant !== 'carousel') {
            return;
          }
          onUpdateCard(rowIndex, itemIndex, { ...card, carouselHeader: header });
        }}
        onDelete={onDel ? () => onDel(rowIndex, itemIndex) : undefined}
      />
    );
    if (free && card.kind === 'layout' && card.variant === 'free') {
      const widthPx = Math.min(2800, Math.max(320, card.widthPx ?? 800));
      const heightPx = Math.min(1100, Math.max(220, card.heightPx ?? 500));
      return (
        <div
          key={`scn-tstack-cell-${panelGroupKey}-${itemIndex}`}
          className="scn-taxonomy-stack-card scn-taxonomy-stack-card--free"
          data-layout-card-item-index={itemIndex}
          style={{ width: `${widthPx}px`, maxWidth: '100%' }}
        >
          <div className="scn-taxonomy-stack-card__free-inner" style={{ minHeight: `${heightPx}px` }}>
            {inner}
          </div>
        </div>
      );
    }
    return (
      <div
        key={`scn-tstack-cell-${panelGroupKey}-${itemIndex}`}
        className="scn-taxonomy-stack-card"
        data-layout-card-item-index={itemIndex}
      >
        {inner}
      </div>
    );
  };

  const renderColumn = (colIndices: number[], colIdx: number): React.JSX.Element => {
    const stackBody =
      colIndices.length === 0 ? (
        <div className="scn-taxonomy-column-stack__empty" aria-hidden="true" />
      ) : (
        colIndices.map((idx) => renderStackCell(idx))
      );
    const stack = <div className="scn-taxonomy-column-stack">{stackBody}</div>;
    if (cols.length === 1) {
      return (
        <div
          className="scn-taxonomy-column-single"
          key={`scn-tstack-col-${panelGroupKey}-${colIdx}`}
          data-taxonomy-column-index={colIdx}
        >
          {stack}
        </div>
      );
    }
    return (
      <Panel
        key={`scn-tpanel-${panelGroupKey}-${colIdx}`}
        defaultSize={`${(100 / Math.max(1, cols.length)).toFixed(4)}%`}
        minSize="0%"
        id={`scn-tpanel-${panelGroupKey}-${colIdx}`}
        className="scn-card-row__panel scn-taxonomy-column-panel"
        style={{ overflow: 'hidden' }}
      >
        <div
          className="scn-taxonomy-column-hit"
          data-taxonomy-column-index={colIdx}
          style={{ height: '100%', minHeight: 0, boxSizing: 'border-box' }}
        >
          {stack}
        </div>
      </Panel>
    );
  };

  if (cols.length === 1) {
    return (
      <div className="scn-card-row--panels-outer scn-card-row--taxonomy-stack">
        {renderColumn(cols[0] ?? [], 0)}
      </div>
    );
  }

  const horizontalChildren = cols.flatMap((colIndices, colIdx) => {
    const panel = renderColumn(colIndices, colIdx);
    if (colIdx === 0) {
      return [panel];
    }
    return [
      <ResizeSeparator
        key={`scn-thsep-${panelGroupKey}-${colIdx}`}
        className={cn(
          'scn-resize-handle',
          'scn-resize-handle--between-columns',
          'scn-resize-handle--with-separator'
        )}
        id={`scn-thsep-${panelGroupKey}-${colIdx}`}
      >
        <UiSeparator
          orientation="vertical"
          decorative
          className="scn-resize-handle__sep scn-resize-handle__sep--emphasis"
        />
      </ResizeSeparator>,
      panel,
    ];
  });

  return (
    <div className="scn-card-row--panels-outer scn-card-row--taxonomy-stack">
      <Group
        orientation="horizontal"
        className="scn-card-row scn-card-row--panels scn-card-row--taxonomy-columns"
        style={{ height: '100%', width: '100%', alignSelf: 'stretch' }}
      >
        {horizontalChildren}
      </Group>
    </div>
  );
}

function ResizableCardRow({
  items,
  panelGroupKey,
  rowIndex,
  enableMasterPane,
  onDeleteCard,
  onUpdateCard,
  onRemoveSubsection,
}: {
  items: RowItem[];
  panelGroupKey: string;
  rowIndex: number;
  enableMasterPane: boolean;
  onDeleteCard: (rowIndex: number, itemIndex: number) => void;
  onUpdateCard?: (rowIndex: number, itemIndex: number, card: ArticleCardPayload) => void;
  /** Removes this entire row band (empty or not); same as context menu “Remove section”. */
  onRemoveSubsection?: (rowIndex: number) => void;
}): React.JSX.Element {
  const panels = collectCardPanels(items);
  if (panels.length === 0) {
    if (enableMasterPane && onRemoveSubsection) {
      return (
        <div className="scn-subsection-empty">
          <button
            type="button"
            className="scn-subsection-empty__remove"
            aria-label="Remove section"
            title="Remove this section"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemoveSubsection(rowIndex);
            }}
          >
            ×
          </button>
        </div>
      );
    }
    return <div className="scn-subsection-empty scn-subsection-empty--placeholder" aria-hidden="true" />;
  }
  const onDel = enableMasterPane ? onDeleteCard : undefined;
  const fixedPanels = panels.filter((p) => !isFreeLayoutCard(p.card));
  const freePanels = panels.filter((p) => isFreeLayoutCard(p.card));
  if (panels.length === 1 && fixedPanels.length === 1) {
    return (
      <div className="scn-card-row scn-card-row--single">
        <div data-layout-card-item-index={fixedPanels[0].itemIndex}>
          <ArticleCardView
            data={fixedPanels[0].card}
            enableMasterPane={enableMasterPane}
            onCarouselHeaderChange={(header) => {
              if (!onUpdateCard) {
                return;
              }
              const card = fixedPanels[0].card;
              if (card.kind !== 'layout' || card.variant !== 'carousel') {
                return;
              }
              onUpdateCard(rowIndex, fixedPanels[0].itemIndex, { ...card, carouselHeader: header });
            }}
            onDelete={onDel ? () => onDel(rowIndex, fixedPanels[0].itemIndex) : undefined}
          />
        </div>
      </div>
    );
  }
  const defaultPct = `${100 / Math.max(1, fixedPanels.length)}%`;
  const horizontalChildren = fixedPanels.flatMap((entry, idx) => {
    const panel = (
      <Panel
        key={`scn-panel-${panelGroupKey}-${entry.itemIndex}`}
        defaultSize={defaultPct}
        minSize="0%"
        id={`scn-panel-${panelGroupKey}-${entry.itemIndex}`}
        className="scn-card-row__panel"
        style={{ overflow: 'hidden' }}
      >
        <div data-layout-card-item-index={entry.itemIndex}>
          <ArticleCardView
            data={entry.card}
            enableMasterPane={enableMasterPane}
            onCarouselHeaderChange={(header) => {
              if (!onUpdateCard) {
                return;
              }
              const card = entry.card;
              if (card.kind !== 'layout' || card.variant !== 'carousel') {
                return;
              }
              onUpdateCard(rowIndex, entry.itemIndex, { ...card, carouselHeader: header });
            }}
            onDelete={onDel ? () => onDel(rowIndex, entry.itemIndex) : undefined}
          />
        </div>
      </Panel>
    );
    if (idx === 0) {
      return [panel];
    }
    return [
      <ResizeSeparator
        key={`scn-hsep-${panelGroupKey}-${entry.itemIndex}`}
        className={cn(
          'scn-resize-handle',
          'scn-resize-handle--between-columns',
          entry.dividerBefore && 'scn-resize-handle--with-separator'
        )}
        id={`scn-hsep-${panelGroupKey}-${entry.itemIndex}`}
      >
        {entry.dividerBefore ? (
          <UiSeparator
            orientation="vertical"
            decorative
            className="scn-resize-handle__sep scn-resize-handle__sep--emphasis"
          />
        ) : null}
      </ResizeSeparator>,
      panel,
    ];
  });

  const freeCanvas =
    freePanels.length > 0 ? (
      <div className="scn-free-canvas">
        {freePanels.map((entry, idx) => {
          const card = entry.card;
          if (card.kind !== 'layout' || card.variant !== 'free') {
            return null;
          }
          const widthPx = Math.min(2800, Math.max(320, card.widthPx ?? 800));
          const heightPx = Math.min(1100, Math.max(220, card.heightPx ?? 500));
          const freeX = Math.max(0, card.freeX ?? idx * 24);
          const freeY = Math.max(0, card.freeY ?? idx * 16);
          return (
            <div
              key={`scn-free-${panelGroupKey}-${entry.itemIndex}`}
              className="scn-free-canvas__card"
              data-layout-card-item-index={entry.itemIndex}
              style={{ width: `${widthPx}px`, height: `${heightPx}px`, left: `${freeX}px`, top: `${freeY}px` }}
            >
              <ArticleCardView data={entry.card} onDelete={onDel ? () => onDel(rowIndex, entry.itemIndex) : undefined} />
            </div>
          );
        })}
      </div>
    ) : null;

  if (fixedPanels.length === 0) {
    return <div className="scn-card-row--panels-outer">{freeCanvas}</div>;
  }

  return (
    <div className="scn-card-row--panels-outer">
      <Group
        orientation="horizontal"
        className="scn-card-row scn-card-row--panels"
        style={{ height: '100%', width: '100%', alignSelf: 'stretch' }}
      >
        {horizontalChildren}
      </Group>
      {freeCanvas}
    </div>
  );
}

export function CardLayoutRoot({
  payload,
  enableMasterPane,
  taxonomySubsectionLayout = false,
  sectionTitle = '',
  taxonomyTermId = '',
  canSaveMasterLayout = false,
  saveMasterLayoutUrl = '',
}: {
  payload: CardLayoutPayload;
  enableMasterPane: boolean;
  /** Taxonomy drilldown master pane: stacked tiles per column, fixed-height subsection bands. */
  taxonomySubsectionLayout?: boolean;
  sectionTitle?: string;
  taxonomyTermId?: string;
  canSaveMasterLayout?: boolean;
  saveMasterLayoutUrl?: string;
}): React.JSX.Element {
  const baselineRowsRef = React.useRef<LayoutRow[]>(ingestEditorRowsFromPayload(payload, taxonomySubsectionLayout));
  const [rows, setRows] = React.useState<LayoutRow[]>(() =>
    ingestEditorRowsFromPayload(payload, taxonomySubsectionLayout)
  );
  const [layoutDialogOpen, setLayoutDialogOpen] = React.useState(false);
  const [paneMenuOpen, setPaneMenuOpen] = React.useState(false);
  const [savePending, setSavePending] = React.useState(false);
  const paneMenuRef = React.useRef<HTMLDivElement>(null);
  const cardLayoutHostRef = React.useRef<HTMLDivElement>(null);
  const verticalStackMeasureRef = React.useRef<HTMLDivElement>(null);
  const rowBandPanelCount = taxonomySubsectionLayout
    ? 1
    : Math.max(1, rows.filter((r) => r.kind === 'row').length);
  const rowBandMinPct = useFeasiblePanelMinPercent(
    verticalStackMeasureRef,
    rowBandPanelCount,
    MIN_PANEL_OUTER_PX,
    'height'
  );
  const [menu, setMenu] = React.useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    rowIndex: null,
    itemIndex: null,
    isCardMenu: false,
    clientY: 0,
    clientX: 0,
    taxonomyColumnIndex: null,
    gapAfterSepIndex: null,
  });
  const [propertiesOpen, setPropertiesOpen] = React.useState(false);
  const [propertiesSourceMode, setPropertiesSourceMode] = React.useState<ContentSourceMode>('random');
  const [articleSearchQuery, setArticleSearchQuery] = React.useState('');
  const [articleSearchResults, setArticleSearchResults] = React.useState<
    Array<{ title: string; preview: string; url: string }>
  >([]);
  const [specificArticle, setSpecificArticle] = React.useState<{ id: number | null; title: string; url: string }>({
    id: null,
    title: '',
    url: '',
  });
  const [tagQuery, setTagQuery] = React.useState('');
  const [tagResults, setTagResults] = React.useState<Array<{ id: number; name: string; slug: string }>>([]);
  const [selectedTagIds, setSelectedTagIds] = React.useState<number[]>([]);
  const showSpecificArticleControls = propertiesSourceMode === 'specific_article';
  const showTaggedWithControls = propertiesSourceMode === 'tagged_with';
  const plainText = React.useCallback((value: string): string => {
    const el = document.createElement('div');
    el.innerHTML = value || '';
    return (el.textContent || '').trim();
  }, []);

  const fetchRandomArticlePreview = React.useCallback(
    async (opts?: { tagIds?: number[]; excludeIds?: number[] }) => {
      const q = new URLSearchParams();
      q.set('random', '1');
      const sectionTermId = Number.parseInt(taxonomyTermId, 10);
      if (!Number.isNaN(sectionTermId) && sectionTermId > 0) {
        q.set('section_term_id', String(sectionTermId));
      }
      if (opts?.tagIds && opts.tagIds.length > 0) {
        q.set('tag_ids', opts.tagIds.join(','));
      }
      if (opts?.excludeIds && opts.excludeIds.length > 0) {
        q.set('exclude_ids', opts.excludeIds.join(','));
      }
      const res = await fetch(`/inline/article/search/?${q.toString()}`, { credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error('Random article lookup failed');
      }
      const data = (await res.json()) as {
        results?: Array<{ id: number; title: string; excerpt?: string; section: string; url: string }>;
      };
      return data.results?.[0] ?? null;
    },
    [taxonomyTermId]
  );
  const randomHydrationInFlightRef = React.useRef(false);
  const attemptedAutoHydrationRef = React.useRef<Set<string>>(new Set());

  const activeCardTarget = React.useMemo(() => {
    if (menu.rowIndex === null || menu.itemIndex === null) {
      return null;
    }
    const row = rows[menu.rowIndex];
    if (!row || row.kind !== 'row') {
      return null;
    }
    const item = row.items[menu.itemIndex];
    if (!item || item.type !== 'card') {
      return null;
    }
    return { rowIndex: menu.rowIndex, itemIndex: menu.itemIndex, card: item.card };
  }, [menu.rowIndex, menu.itemIndex, rows]);

  React.useEffect(() => {
    const ingested = ingestEditorRowsFromPayload(payload, taxonomySubsectionLayout);
    baselineRowsRef.current = cloneRows(ingested);
    setRows(cloneRows(ingested));
    attemptedAutoHydrationRef.current = new Set();
    setMenu({
      open: false,
      x: 0,
      y: 0,
      rowIndex: null,
      itemIndex: null,
      isCardMenu: false,
      clientY: 0,
      clientX: 0,
      taxonomyColumnIndex: null,
      gapAfterSepIndex: null,
    });
    setLayoutDialogOpen(false);
    setPaneMenuOpen(false);
    setSavePending(false);
  }, [payload, taxonomySubsectionLayout]);

  React.useEffect(() => {
    if (randomHydrationInFlightRef.current) {
      return;
    }
    const randomTargets: Array<{ rowIndex: number; itemIndex: number; tagIds?: number[]; key: string }> = [];
    rows.forEach((row, rowIndex) => {
      if (row.kind !== 'row') {
        return;
      }
      row.items.forEach((item, itemIndex) => {
        if (item.type !== 'card') {
          return;
        }
        const mode = item.card.sourceConfig?.mode;
        if (mode !== 'random' && mode !== 'tagged_with') {
          return;
        }
        if (item.card.kind === 'article' && item.card.title.trim()) {
          return;
        }
        const cfg = item.card.sourceConfig;
        const key = `${rowIndex}:${itemIndex}:${mode}:${(cfg?.tagIds ?? []).join(',')}:${cfg?.specificArticleId ?? ''}:${cfg?.specificArticleTitle ?? ''}`;
        if (attemptedAutoHydrationRef.current.has(key)) {
          return;
        }
        randomTargets.push({
          rowIndex,
          itemIndex,
          tagIds: mode === 'tagged_with' ? item.card.sourceConfig?.tagIds : [],
          key,
        });
      });
    });
    if (randomTargets.length === 0) {
      return;
    }
    randomTargets.forEach((t) => attemptedAutoHydrationRef.current.add(t.key));
    randomHydrationInFlightRef.current = true;
    void (async () => {
      try {
        const usedArticleIds = new Set<number>();
        const picked: Array<{
          target: (typeof randomTargets)[0];
          article: Awaited<ReturnType<typeof fetchRandomArticlePreview>>;
        }> = [];
        for (const target of randomTargets) {
          const article = await fetchRandomArticlePreview({
            tagIds: target.tagIds ?? [],
            excludeIds: [...usedArticleIds],
          });
          picked.push({ target, article });
          if (article?.id) {
            usedArticleIds.add(article.id);
          }
        }
        setRows((prev) => {
          const out = [...prev];
          picked.forEach(({ target, article }) => {
            if (!article?.id || !article.title) {
              return;
            }
            const row = out[target.rowIndex];
            if (!row || row.kind !== 'row') {
              return;
            }
            const rowItems = [...row.items];
            const rowItem = rowItems[target.itemIndex];
            if (!rowItem || rowItem.type !== 'card') {
              return;
            }
            const mode = rowItem.card.sourceConfig?.mode;
            if (mode !== 'random' && mode !== 'tagged_with') {
              return;
            }
            rowItems[target.itemIndex] = {
              type: 'card',
              card: {
                kind: 'article',
                title: article.title,
                href: article.url || '',
                excerpt: article.excerpt || '',
                imageUrl: '',
                sourceConfig: rowItem.card.sourceConfig,
              },
            };
            out[target.rowIndex] = { kind: 'row', items: rowItems };
          });
          return out;
        });
      } finally {
        randomHydrationInFlightRef.current = false;
      }
    })();
  }, [fetchRandomArticlePreview, rows]);

  const deleteHorizontalSeparator = React.useCallback((sepIdx: number) => {
    setRows((prev) => {
      if (sepIdx < 0 || sepIdx >= prev.length || prev[sepIdx].kind !== 'separator') {
        return prev;
      }
      return prev.filter((_, j) => j !== sepIdx);
    });
  }, []);

  /** Drop a content row band (subsection), whether it still has cards or not. */
  const removeSubsectionRow = React.useCallback((rowIndex: number) => {
    setRows((prev) => {
      if (rowIndex < 0 || rowIndex >= prev.length || prev[rowIndex].kind !== 'row') {
        return prev;
      }
      return prev.filter((_, j) => j !== rowIndex);
    });
  }, []);

  const removeSectionFromMenu = React.useCallback(() => {
    setRows((prev) => {
      const host = cardLayoutHostRef.current;
      const target = resolveCardTargetRowFromPointer(prev, host, menu.clientY, menu.rowIndex);
      if (target === APPEND_NEW_ROW || target < 0) {
        return prev;
      }
      if (prev[target]?.kind !== 'row') {
        return prev;
      }
      return prev.filter((_, j) => j !== target);
    });
    setMenu((m) => ({
      ...m,
      open: false,
      gapAfterSepIndex: null,
      taxonomyColumnIndex: null,
    }));
  }, [menu]);

  const deleteCard = React.useCallback((rowIndex: number, itemIndex: number) => {
    setRows((prev) => {
      const row = prev[rowIndex];
      if (!row || row.kind !== 'row') {
        return prev;
      }
      const nextItems = removeCardFromRowItems(row.items, itemIndex);
      if (nextItems === null) {
        return prev;
      }
      if (nextItems.length === 0) {
        const out = [...prev];
        out.splice(rowIndex, 1);
        return out;
      }
      const out = [...prev];
      out[rowIndex] = { kind: 'row', items: nextItems };
      return out;
    });
  }, []);

  const updateCard = React.useCallback((rowIndex: number, itemIndex: number, card: ArticleCardPayload) => {
    setRows((prev) => {
      const row = prev[rowIndex];
      if (!row || row.kind !== 'row') {
        return prev;
      }
      const item = row.items[itemIndex];
      if (!item || item.type !== 'card') {
        return prev;
      }
      const nextItems = [...row.items];
      nextItems[itemIndex] = { type: 'card', card };
      const out = [...prev];
      out[rowIndex] = { kind: 'row', items: nextItems };
      return out;
    });
  }, []);
  const saveLayoutRowsToServer = React.useCallback(
    async (layoutRows: LayoutRow[], showSuccessToast: boolean): Promise<boolean> => {
      const url = saveMasterLayoutUrl.trim();
      const tid = taxonomyTermId.trim();
      if (!canSaveMasterLayout || !url || !tid) {
        return true;
      }
      try {
        const token = getCsrfToken();
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'X-CSRFToken': token } : {}),
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            term_id: Number.parseInt(tid, 10),
            layout: {
              rows: cloneRows(layoutRows),
              ...(taxonomySubsectionLayout ? { layoutVersion: TAXONOMY_MASTER_LAYOUT_VERSION } : {}),
            },
          }),
        });
        let data: { error?: string } = {};
        try {
          data = (await res.json()) as { error?: string };
        } catch {
          /* ignore */
        }
        if (!res.ok) {
          toast.error(data.error || `Save failed (${res.status})`);
          return false;
        }
        baselineRowsRef.current = cloneRows(layoutRows);
        if (showSuccessToast) {
          toast.success('Layout saved to the server.');
        }
        return true;
      } catch {
        toast.error('Could not reach the server.');
        return false;
      }
    },
    [canSaveMasterLayout, saveMasterLayoutUrl, taxonomySubsectionLayout, taxonomyTermId]
  );

  const handlePaneSave = React.useCallback(() => {
    if (!canSaveMasterLayout || !saveMasterLayoutUrl.trim() || !taxonomyTermId.trim()) {
      setPaneMenuOpen(false);
      return;
    }
    setSavePending(true);
    void (async () => {
      try {
        await saveLayoutRowsToServer(rows, true);
      } finally {
        setSavePending(false);
        setPaneMenuOpen(false);
      }
    })();
  }, [canSaveMasterLayout, rows, saveLayoutRowsToServer, saveMasterLayoutUrl, taxonomyTermId]);

  /** Restores layout rows only; does not change URL or taxonomy nav selection. */
  const handlePaneReset = React.useCallback(() => {
    setRows(cloneRows(baselineRowsRef.current));
    setPaneMenuOpen(false);
    toast.success('Layout restored.');
  }, []);

  const resetCardFromMenu = React.useCallback(() => {
    const rowIndex = menu.rowIndex;
    const itemIndex = menu.itemIndex;
    if (rowIndex === null || itemIndex === null) {
      return;
    }
    const baselineRow = baselineRowsRef.current[rowIndex];
    const baselineItem = baselineRow && baselineRow.kind === 'row' ? baselineRow.items[itemIndex] : null;
    if (baselineItem && baselineItem.type === 'card') {
      updateCard(rowIndex, itemIndex, baselineItem.card);
      setMenu((prev) => ({
        ...prev,
        open: false,
        itemIndex: null,
        isCardMenu: false,
        taxonomyColumnIndex: null,
      }));
      return;
    }
    setRows((prev) => {
      const row = prev[rowIndex];
      if (!row || row.kind !== 'row') {
        return prev;
      }
      const item = row.items[itemIndex];
      if (!item || item.type !== 'card') {
        return prev;
      }
      const fallback =
        item.card.kind === 'layout'
          ? defaultCardForVariant(item.card.variant)
          : ({ kind: 'stub', message: 'New card' } satisfies ArticleCardPayload);
      const nextItems = [...row.items];
      nextItems[itemIndex] = { type: 'card', card: fallback };
      const out = [...prev];
      out[rowIndex] = { kind: 'row', items: nextItems };
      return out;
    });
    setMenu((prev) => ({
      ...prev,
      open: false,
      itemIndex: null,
      isCardMenu: false,
      taxonomyColumnIndex: null,
    }));
  }, [menu.rowIndex, menu.itemIndex, updateCard]);

  const saveProperties = React.useCallback(() => {
    if (!activeCardTarget) {
      setPropertiesOpen(false);
      return;
    }
    const nextSource: ContentSourceConfig = {
      mode: propertiesSourceMode,
      specificArticleId: propertiesSourceMode === 'specific_article' ? specificArticle.id : null,
      specificArticleTitle: propertiesSourceMode === 'specific_article' ? specificArticle.title : '',
      specificArticleUrl: propertiesSourceMode === 'specific_article' ? specificArticle.url : '',
      tagIds: propertiesSourceMode === 'tagged_with' ? selectedTagIds : [],
    };
    let nextCard: ArticleCardPayload = { ...activeCardTarget.card, sourceConfig: nextSource };
    if (propertiesSourceMode === 'specific_article' && specificArticle.id && specificArticle.title) {
      nextCard = {
        kind: 'article',
        title: specificArticle.title,
        href: specificArticle.url || '',
        excerpt: '',
        imageUrl: '',
        sourceConfig: nextSource,
      };
    }
    void (async () => {
      if (propertiesSourceMode === 'random' || propertiesSourceMode === 'tagged_with') {
        try {
          const randomArticle = await fetchRandomArticlePreview({
            tagIds: propertiesSourceMode === 'tagged_with' ? selectedTagIds : [],
          });
          if (randomArticle?.id && randomArticle.title) {
            nextCard = {
              kind: 'article',
              title: randomArticle.title,
              href: randomArticle.url || '',
              excerpt: randomArticle.excerpt || '',
              imageUrl: '',
              sourceConfig: nextSource,
            };
          }
        } catch {
          await (window.showMaterialAlert?.('Could not load random article preview.', 'Card properties') ??
            Promise.resolve());
        }
      }
      const nextRows = cloneRows(rows);
      const row = nextRows[activeCardTarget.rowIndex];
      if (row && row.kind === 'row') {
        const item = row.items[activeCardTarget.itemIndex];
        if (item && item.type === 'card') {
          row.items[activeCardTarget.itemIndex] = { type: 'card', card: nextCard };
        }
      }
      setRows(nextRows);
      attemptedAutoHydrationRef.current = new Set();
      await saveLayoutRowsToServer(nextRows, false);
      setPropertiesOpen(false);
    })();
  }, [
    activeCardTarget,
    fetchRandomArticlePreview,
    propertiesSourceMode,
    rows,
    saveLayoutRowsToServer,
    selectedTagIds,
    specificArticle,
  ]);

  React.useEffect(() => {
    if (!menu.open) {
      return;
    }
    const close = () =>
      setMenu((prev) => ({
        ...prev,
        open: false,
        gapAfterSepIndex: null,
        taxonomyColumnIndex: null,
      }));
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [menu.open]);

  React.useEffect(() => {
    if (!propertiesOpen || !activeCardTarget) {
      return;
    }
    const source = activeCardTarget.card.sourceConfig;
    setPropertiesSourceMode(source?.mode ?? 'random');
    setSelectedTagIds(source?.tagIds ?? []);
    setSpecificArticle({
      id: source?.specificArticleId ?? null,
      title: source?.specificArticleTitle ?? '',
      url: source?.specificArticleUrl ?? '',
    });
    setArticleSearchQuery('');
    setArticleSearchResults([]);
    setTagQuery('');
  }, [propertiesOpen, activeCardTarget]);

  React.useEffect(() => {
    if (!propertiesOpen || propertiesSourceMode !== 'specific_article') {
      return;
    }
    const q = articleSearchQuery.trim();
    if (q.length < 2) {
      setArticleSearchResults([]);
      return;
    }
    const url = `/search/suggest/?q=${encodeURIComponent(q)}&limit=10`;
    const ctl = new AbortController();
    void fetch(url, { credentials: 'same-origin', signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('search failed'))))
      .then((data: { results?: Array<{ title_html: string; preview_html: string; url: string }> }) => {
        const rows = (data.results ?? []).map((item) => ({
          title: plainText(item.title_html),
          preview: plainText(item.preview_html),
          url: item.url,
        }));
        setArticleSearchResults(rows);
      })
      .catch(() => {
        setArticleSearchResults([]);
      });
    return () => ctl.abort();
  }, [articleSearchQuery, plainText, propertiesOpen, propertiesSourceMode]);

  React.useEffect(() => {
    if (!propertiesOpen || propertiesSourceMode !== 'tagged_with') {
      return;
    }
    const q = tagQuery.trim();
    const url = `/inline/tags/list/?q=${encodeURIComponent(q)}`;
    const ctl = new AbortController();
    void fetch(url, { credentials: 'same-origin', signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('tags failed'))))
      .then((data: { results?: Array<{ id: number; name: string; slug: string }> }) => {
        setTagResults(data.results ?? []);
      })
      .catch(() => {
        setTagResults([]);
      });
    return () => ctl.abort();
  }, [propertiesOpen, propertiesSourceMode, tagQuery]);

  React.useEffect(() => {
    if (!paneMenuOpen) {
      return;
    }
    const onDocClick = (e: MouseEvent) => {
      const el = paneMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setPaneMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPaneMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [paneMenuOpen]);

  const onContextMenu = (evt: React.MouseEvent<HTMLDivElement>) => {
    if (!enableMasterPane || rows.length === 0) {
      return;
    }
    const target = evt.target as HTMLElement;
    if (target.closest('.scn-pane-menubar')) {
      return;
    }
    if (target.closest('.scn-resize-handle')) {
      return;
    }
    if (target.closest('.scn-sep-gap-actions')) {
      return;
    }
    evt.preventDefault();
    const cardEl = target.closest<HTMLElement>('[data-layout-card-item-index]');
    if (cardEl) {
      const cardItemIndex = Number.parseInt(cardEl.dataset['layoutCardItemIndex'] ?? '', 10);
      const cardRowEl = target.closest<HTMLElement>('[data-layout-row-index]');
      const cardRowIndex = Number.parseInt(cardRowEl?.dataset['layoutRowIndex'] ?? '', 10);
      if (!Number.isNaN(cardItemIndex) && !Number.isNaN(cardRowIndex)) {
        setMenu({
          open: true,
          x: evt.clientX,
          y: evt.clientY,
          rowIndex: cardRowIndex,
          itemIndex: cardItemIndex,
          isCardMenu: true,
          clientY: evt.clientY,
          clientX: evt.clientX,
          taxonomyColumnIndex: null,
          gapAfterSepIndex: null,
        });
        return;
      }
    }
    const rowEl = target.closest<HTMLElement>('[data-layout-row-index]');
    let rowIndex: number | null = null;
    let slotEl: HTMLElement | null = null;
    const rowAttr = rowEl?.dataset['layoutRowIndex'];
    if (typeof rowAttr === 'string') {
      rowIndex = Number.parseInt(rowAttr, 10);
      slotEl = rowEl;
    } else {
      const host = evt.currentTarget;
      const slots = Array.from(host.querySelectorAll<HTMLElement>('[data-layout-row-index]'));
      let bestIdx: number | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      slots.forEach((slot) => {
        const idxAttr = slot.dataset['layoutRowIndex'];
        if (!idxAttr) {
          return;
        }
        const idx = Number.parseInt(idxAttr, 10);
        if (Number.isNaN(idx) || rows[idx]?.kind !== 'row') {
          return;
        }
        const rect = slot.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const distance = Math.abs(evt.clientY - centerY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIdx = idx;
        }
      });
      rowIndex = bestIdx;
      if (bestIdx !== null) {
        slotEl = host.querySelector<HTMLElement>(`[data-layout-row-index="${bestIdx}"]`);
      }
    }

    let taxonomyColumnIndex: number | null = null;
    if (
      taxonomySubsectionLayout &&
      rowIndex !== null &&
      !Number.isNaN(rowIndex) &&
      rows[rowIndex]?.kind === 'row' &&
      slotEl
    ) {
      const colHit = target.closest<HTMLElement>('[data-taxonomy-column-index]');
      if (colHit && slotEl.contains(colHit)) {
        const v = Number.parseInt(colHit.dataset['taxonomyColumnIndex'] ?? '', 10);
        if (!Number.isNaN(v)) {
          taxonomyColumnIndex = v;
        }
      }
      if (taxonomyColumnIndex === null) {
        taxonomyColumnIndex = resolveTaxonomyColumnByClientX(slotEl, evt.clientX);
      }
    }

    setMenu({
      open: true,
      x: evt.clientX,
      y: evt.clientY,
      rowIndex: Number.isNaN(rowIndex ?? NaN) ? null : rowIndex,
      itemIndex: null,
      isCardMenu: false,
      clientY: evt.clientY,
      clientX: evt.clientX,
      taxonomyColumnIndex,
      gapAfterSepIndex: null,
    });
  };

  /** Append card with optional vertical rule before it (when row already has items). */
  const insertCardOfVariant = (
    variant: 'biggies' | 'feature' | 'headline' | 'carousel' | 'free',
    withVerticalSeparator: boolean
  ) => {
    const newCard: RowItem = {
      type: 'card',
      card: defaultCardForVariant(variant),
    };
    setRows((prev) => {
      if (prev.length === 0) {
        return [{ kind: 'row', items: [newCard] }];
      }
      const gapSep = menu.gapAfterSepIndex;
      if (
        gapSep !== null &&
        gapSep >= 0 &&
        gapSep < prev.length &&
        prev[gapSep]?.kind === 'separator'
      ) {
        const at = gapSep + 1;
        const items: RowItem[] = [newCard];
        return [...prev.slice(0, at), { kind: 'row', items }, ...prev.slice(at)];
      }
      const host = cardLayoutHostRef.current;
      const target = resolveCardTargetRowFromPointer(prev, host, menu.clientY, menu.rowIndex);
      if (target === APPEND_NEW_ROW || target < 0) {
        const items: RowItem[] = [newCard];
        return [...prev, { kind: 'row', items }];
      }
      const current = prev[target] as Extract<LayoutRow, { kind: 'row' }>;
      const nextItems = [...current.items];
      if (taxonomySubsectionLayout) {
        const at = taxonomyInsertPositionForNewCard(nextItems, menu.itemIndex, menu.taxonomyColumnIndex);
        nextItems.splice(at, 0, newCard);
        const cloned = [...prev];
        cloned[target] = { ...current, items: nextItems };
        return cloned;
      }
      if (withVerticalSeparator && nextItems.length > 0) {
        nextItems.push({ type: 'separator', orientation: 'vertical' });
      }
      nextItems.push(newCard);
      const cloned = [...prev];
      cloned[target] = { ...current, items: nextItems };
      return cloned;
    });
    setMenu((prev) => ({
      ...prev,
      open: false,
      gapAfterSepIndex: null,
      taxonomyColumnIndex: null,
    }));
  };

  const insertColumnStructureOnly = () => {
    setRows((prev) => {
      const host = cardLayoutHostRef.current;
      const target = resolveCardTargetRowFromPointer(prev, host, menu.clientY, menu.rowIndex);
      if (target === APPEND_NEW_ROW || target < 0) {
        return prev;
      }
      const row = prev[target];
      if (!row || row.kind !== 'row' || row.items.length === 0) {
        return prev;
      }
      const last = row.items[row.items.length - 1];
      if (last?.type === 'separator' && last.orientation === 'vertical') {
        return prev;
      }
      const out = [...prev];
      out[target] = {
        kind: 'row',
        items: [...row.items, { type: 'separator', orientation: 'vertical' }],
      };
      return out;
    });
    setMenu((prev) => ({
      ...prev,
      open: false,
      gapAfterSepIndex: null,
      taxonomyColumnIndex: null,
    }));
  };

  const insertSeparator = () => {
    setRows((prev) => {
      const host = cardLayoutHostRef.current;
      let insertAt = resolveHorizontalSepInsertIndexFromPointer(
        prev,
        host,
        menu.clientY,
        menu.rowIndex
      );
      insertAt = Math.max(0, Math.min(insertAt, prev.length));
      return [
        ...prev.slice(0, insertAt),
        { kind: 'separator', orientation: 'horizontal' as const },
        { kind: 'row', items: [] },
        ...prev.slice(insertAt),
      ];
    });
    setMenu((prev) => ({
      ...prev,
      open: false,
      gapAfterSepIndex: null,
      taxonomyColumnIndex: null,
    }));
  };

  const horizontalSeparatorGapUi = (i: number) =>
    enableMasterPane && contentGapAfterHorizontalSep(rows, i) ? (
      <div className="scn-sep-gap-actions">
        <button
          type="button"
          className="scn-sep-gap__add"
          aria-label="Add cards or columns"
          title="Add cards or columns"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({
              open: true,
              x: r.left + r.width / 2,
              y: r.bottom + 8,
              rowIndex: i,
              itemIndex: null,
              isCardMenu: false,
              clientY: r.top + r.height / 2,
              clientX: r.left + r.width / 2,
              taxonomyColumnIndex: null,
              gapAfterSepIndex: i,
            });
          }}
        >
          +
        </button>
        <button
          type="button"
          className="scn-sep-gap__remove"
          aria-label="Remove horizontal separator"
          title="Remove separator"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteHorizontalSeparator(i);
          }}
        >
          ×
        </button>
      </div>
    ) : null;

  const renderSubsectionBand = (row: LayoutRow, i: number): React.JSX.Element => {
    if (row.kind === 'separator') {
      return (
        <>
          <UiSeparator orientation="horizontal" className="scn-card-layout__sep" />
          {horizontalSeparatorGapUi(i)}
        </>
      );
    }
    if (taxonomySubsectionLayout) {
      return (
        <TaxonomyStackedCardRow
          items={row.items}
          panelGroupKey={String(i)}
          rowIndex={i}
          enableMasterPane={enableMasterPane}
          onDeleteCard={deleteCard}
          onUpdateCard={enableMasterPane ? updateCard : undefined}
          onRemoveSubsection={enableMasterPane ? removeSubsectionRow : undefined}
        />
      );
    }
    return (
      <ResizableCardRow
        items={row.items}
        panelGroupKey={String(i)}
        rowIndex={i}
        enableMasterPane={enableMasterPane}
        onDeleteCard={deleteCard}
        onUpdateCard={enableMasterPane ? updateCard : undefined}
        onRemoveSubsection={enableMasterPane ? removeSubsectionRow : undefined}
      />
    );
  };

  const taxonomyOuterStack = rows.map((row, i) => (
    <div
      key={`scn-tax-outer-${i}`}
      data-layout-row-index={i}
      className={cn(
        'scn-card-layout__slot',
        'scn-card-layout__subsection',
        row.kind === 'row' ? 'scn-card-layout__subsection--content' : 'scn-card-layout__subsection--separator',
        row.kind === 'row' ? 'scn-card-layout__taxonomy-band' : null
      )}
    >
      {renderSubsectionBand(row, i)}
    </div>
  ));

  /** Vertical rule between columns is stored as `RowItem` separator + card; use “Add column”. */
  const verticalWeights = rows.map((r) => (r.kind === 'separator' ? 3 : 48));
  const verticalWeightSum = verticalWeights.reduce((a, b) => a + b, 0) || 1;
  const verticalRowChildren = rows.flatMap((row, i) => {
    const panel = (
      <Panel
        key={`scn-vrow-${i}`}
        defaultSize={`${((100 * verticalWeights[i]) / verticalWeightSum).toFixed(4)}%`}
        minSize={row.kind === 'separator' ? '0.5%' : rowBandMinPct}
        id={`scn-vrow-${i}`}
        className="scn-card-layout__row-panel"
        style={{ overflow: row.kind === 'separator' ? 'hidden' : 'visible' }}
      >
        <div
          data-layout-row-index={i}
          className={cn(
            'scn-card-layout__slot',
            'scn-card-layout__subsection',
            row.kind === 'row'
              ? 'scn-card-layout__subsection--content'
              : 'scn-card-layout__subsection--separator'
          )}
        >
          {renderSubsectionBand(row, i)}
        </div>
      </Panel>
    );
    if (i === 0) {
      return [panel];
    }
    return [
      <ResizeSeparator
        key={`scn-row-sep-${i}`}
        className={cn('scn-resize-handle', 'scn-resize-handle--between-rows')}
        id={`scn-row-sep-${i}`}
      />,
      panel,
    ];
  });

  const emptyPresetDialog =
    rows.length === 0 && enableMasterPane ? (
      <Dialog open={layoutDialogOpen} onOpenChange={setLayoutDialogOpen}>
        <Empty className="scn-card-layout__empty-state">
          <EmptyHeader>
            <EmptyTitle>No layout yet</EmptyTitle>
            <EmptyDescription>
              {taxonomySubsectionLayout ? (
                <>
                  Start from a preset. Right-click to add tiles (stacked in a column), add columns, or add a
                  horizontal separator to start a new subsection. Drag handles resize width between columns only;
                  subsection bands are fixed height.
                  {canSaveMasterLayout ? ' Staff can save the layout from the Pane menu.' : ''}
                </>
              ) : (
                <>
                  Start from a resizable preset. Then right-click empty areas to add columns (vertical split and
                  rule) or horizontal rules between rows. Drag handles to resize column widths and row heights.
                  {canSaveMasterLayout ? ' Staff can save the layout from the Pane menu.' : ''}
                </>
              )}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => setLayoutDialogOpen(true)}>
              Create layout
            </Button>
          </EmptyContent>
        </Empty>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a layout preset</DialogTitle>
            <DialogDescription>
              {taxonomySubsectionLayout ? (
                <>
                  Each option creates stub columns in one subsection. Add more tiles to stack vertically in a
                  column, or use Add column for another column. Use Add horizontal separator for a new subsection
                  below.
                </>
              ) : (
                <>
                  Each option creates stub panels. Drag handles between columns for width; drag horizontal bars
                  between rows for height. Right-click to add columns (includes a vertical rule) or row separators.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="scn-layout-preset-grid">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRows(presetToRows('twin'));
                setLayoutDialogOpen(false);
              }}
            >
              Twin split (2)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRows(presetToRows('three'));
                setLayoutDialogOpen(false);
              }}
            >
              Three-way (3)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRows(presetToRows('quattro'));
                setLayoutDialogOpen(false);
              }}
            >
              Quattro (4)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRows(presetToRows('grid-2x4'));
                setLayoutDialogOpen(false);
              }}
            >
              2×4 grid
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    ) : null;

  const paneMenubar =
    enableMasterPane && rows.length > 0 ? (
      <div className="scn-pane-menubar" ref={paneMenuRef}>
        <div className="scn-pane-menubar__track">
          <div className="scn-pane-menubar__menu-wrap">
            <button
              type="button"
              className="scn-pane-menubar__trigger"
              aria-expanded={paneMenuOpen}
              aria-haspopup="menu"
              onClick={() => setPaneMenuOpen((o) => !o)}
            >
              Pane
            </button>
            {paneMenuOpen ? (
              <div className="scn-pane-menubar__dropdown" role="menu">
                {canSaveMasterLayout && saveMasterLayoutUrl.trim() ? (
                  <button
                    type="button"
                    className="scn-pane-menubar__item"
                    role="menuitem"
                    disabled={savePending}
                    onClick={handlePaneSave}
                  >
                    Save
                  </button>
                ) : null}
                <button type="button" className="scn-pane-menubar__item" role="menuitem" onClick={handlePaneReset}>
                  Reset
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ) : null;

  if (rows.length > 0) {
    return (
      <div className="scn-content-outline taxonomy-drilldown__outline">
        {sectionTitle ? <h1 className="taxonomy-drilldown__title">{sectionTitle}</h1> : null}
        <div
          ref={cardLayoutHostRef}
          className="scn-card-layout-host scn-card-layout-host--master-pane"
          onContextMenu={onContextMenu}
        >
        <div
          ref={verticalStackMeasureRef}
          className="scn-card-layout-vertical-measure"
          style={
            {
              ['--scn-stack-min' as string]: `${verticalStackMinHeightPx(rows)}px`,
            } as React.CSSProperties
          }
        >
          {taxonomySubsectionLayout ? (
            <div
              className={cn('scn-card-layout', 'scn-card-layout--taxonomy-outer-stack')}
              style={{
                flex: '1 1 auto',
                minHeight: 0,
                height: '100%',
                width: '100%',
                alignSelf: 'stretch',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
              }}
            >
              {taxonomyOuterStack}
            </div>
          ) : (
            <Group
              orientation="vertical"
              className={cn('scn-card-layout', 'scn-card-layout--vertical-stack')}
              style={{
                flex: '1 1 auto',
                minHeight: 0,
                height: '100%',
                width: '100%',
                alignSelf: 'stretch',
              }}
            >
              {verticalRowChildren}
            </Group>
          )}
        </div>
        <div
          className="scn-card-layout-pane-spacer"
          aria-hidden="true"
          onContextMenu={(e) => {
            if (!enableMasterPane || rows.length === 0) {
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            setMenu({
              open: true,
              x: e.clientX,
              y: e.clientY,
              rowIndex: null,
              itemIndex: null,
              isCardMenu: false,
              clientY: e.clientY,
              clientX: e.clientX,
              taxonomyColumnIndex: null,
              gapAfterSepIndex: null,
            });
          }}
        />
          {menu.open && enableMasterPane ? (
            <div className="scn-context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
              {menu.isCardMenu ? (
                <>
                  <button
                    type="button"
                    className="scn-context-menu__item"
                    onClick={() => {
                      setPropertiesOpen(true);
                      setMenu((prev) => ({ ...prev, open: false }));
                    }}
                  >
                    Properties
                  </button>
                  <button
                    type="button"
                    className="scn-context-menu__item"
                    onClick={() => {
                      if (menu.rowIndex !== null && menu.itemIndex !== null) {
                        deleteCard(menu.rowIndex, menu.itemIndex);
                      }
                      setMenu((prev) => ({ ...prev, open: false, itemIndex: null, isCardMenu: false }));
                    }}
                  >
                    Remove
                  </button>
                  <button type="button" className="scn-context-menu__item" onClick={resetCardFromMenu}>
                    Reset
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="scn-context-menu__item" onClick={() => insertCardOfVariant('biggies', false)}>
                    Add Biggies card
                  </button>
                  <button type="button" className="scn-context-menu__item" onClick={() => insertCardOfVariant('feature', false)}>
                    Add 840x1230 card
                  </button>
                  <button type="button" className="scn-context-menu__item" onClick={() => insertCardOfVariant('headline', false)}>
                    Add 830x330 card
                  </button>
                  <button type="button" className="scn-context-menu__item" onClick={() => insertCardOfVariant('carousel', false)}>
                    Add 800x1200 carousel
                  </button>
                  <button type="button" className="scn-context-menu__item" onClick={() => insertCardOfVariant('free', false)}>
                    Add free card
                  </button>
                  <div className="scn-context-menu__divider" role="separator" />
                  <button type="button" className="scn-context-menu__item" onClick={insertColumnStructureOnly}>
                    Add column
                  </button>
                  <button type="button" className="scn-context-menu__item" onClick={insertSeparator}>
                    Add horizontal separator
                  </button>
                  <div className="scn-context-menu__divider" role="separator" />
                  <button type="button" className="scn-context-menu__item scn-context-menu__item--danger" onClick={removeSectionFromMenu}>
                    Remove section
                  </button>
                </>
              )}
            </div>
          ) : null}
          <Dialog open={propertiesOpen} onOpenChange={setPropertiesOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Card properties</DialogTitle>
                <DialogDescription>Configure content source for this card.</DialogDescription>
              </DialogHeader>
              <div className="scn-auth-form">
                <div className="scn-field">
                  <Label>Content</Label>
                  <Select
                    className="scn-properties-content-select"
                    value={propertiesSourceMode}
                    onChange={(e) => setPropertiesSourceMode(e.currentTarget.value as ContentSourceMode)}
                  >
                    <option value="random">Random</option>
                    <option value="specific_article">Specific Article</option>
                    <option value="tagged_with">Tagged With</option>
                    <option value="priority_articles">Priority Articles</option>
                  </Select>
                </div>

                {showSpecificArticleControls ? (
                  <div className="scn-field">
                    <Label>Article title search</Label>
                    <InputGroup>
                      <InputGroupInput
                        value={articleSearchQuery}
                        onChange={(e) => setArticleSearchQuery(e.currentTarget.value)}
                        placeholder="Type article title..."
                      />
                      <InputGroupAddon>
                        <SearchIcon />
                      </InputGroupAddon>
                    </InputGroup>
                    <div className="scn-properties-list">
                      {articleSearchResults.map((item, idx) => (
                        <button
                          key={`${item.url}-${idx}`}
                          type="button"
                          className={cn(
                            'scn-properties-list__item',
                            specificArticle.title === item.title && specificArticle.url === item.url && 'scn-properties-list__item--active'
                          )}
                          onClick={() => setSpecificArticle({ id: null, title: item.title, url: item.url })}
                        >
                          <strong>{item.title}</strong>
                          {item.preview ? <span className="scn-properties-list__meta">{item.preview}</span> : null}
                        </button>
                      ))}
                    </div>
                    <Label>Article URL</Label>
                    <Input
                      value={specificArticle.url}
                      onChange={(e) => setSpecificArticle((prev) => ({ ...prev, url: e.currentTarget.value }))}
                      placeholder="https://..."
                    />
                  </div>
                ) : showTaggedWithControls ? (
                  <div className="scn-field">
                    <Label>Tags combobox</Label>
                    <InputGroup>
                      <InputGroupInput
                        value={tagQuery}
                        onChange={(e) => setTagQuery(e.currentTarget.value)}
                        placeholder="Search tags..."
                      />
                      <InputGroupAddon>
                        <SearchIcon />
                      </InputGroupAddon>
                    </InputGroup>
                    {selectedTagIds.length > 0 ? (
                      <div className="scn-dialog-footer">
                        <span>Selected: {selectedTagIds.length}</span>
                      </div>
                    ) : null}
                    <div className="scn-properties-list">
                      {tagResults.map((tag) => {
                        const checked = selectedTagIds.includes(tag.id);
                        return (
                          <Button
                            key={tag.id}
                            type="button"
                            variant={checked ? 'default' : 'outline'}
                            onClick={() =>
                              setSelectedTagIds((prev) =>
                                checked ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                              )
                            }
                          >
                            {tag.name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="scn-dialog-footer">
                  <Button type="button" onClick={saveProperties}>
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Toaster richColors position="top-right" />
          {paneMenubar}
        </div>
      </div>
    );
  }

  return <div className="scn-card-layout-host scn-card-layout-host--empty-only">{emptyPresetDialog}</div>;
}

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

export function mountShadcnCardLayouts(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-card-layout]').forEach((host) => {
    if (host.dataset['shadcnCardLayoutBound'] === '1') {
      return;
    }
    const jsonId = host.dataset['layoutJsonId'];
    if (!jsonId) {
      return;
    }
    const parsed = readPayloadScript(jsonId);
    if (!parsed || !('rows' in parsed)) {
      return;
    }
    host.dataset['shadcnCardLayoutBound'] = '1';
    let root = layoutRoots.get(host);
    if (!root) {
      root = createRoot(host);
      layoutRoots.set(host, root);
    }
    const enableMasterPane = host.dataset['masterPaneEnabled'] === '1';
    const taxonomySubsectionLayout = host.dataset['taxonomySubsectionLayout'] === '1';
    const sectionTitle = host.dataset['taxonomySectionTitle'] ?? '';
    const taxonomyTermId = host.dataset['taxonomyTermId'] ?? '';
    const canSaveMasterLayout = host.dataset['canSaveMasterLayout'] === '1';
    const saveMasterLayoutUrl = host.dataset['saveMasterLayoutUrl'] ?? '';
    root.render(
      <CardLayoutRoot
        payload={parsed}
        enableMasterPane={enableMasterPane}
        taxonomySubsectionLayout={taxonomySubsectionLayout}
        sectionTitle={sectionTitle}
        taxonomyTermId={taxonomyTermId}
        canSaveMasterLayout={canSaveMasterLayout}
        saveMasterLayoutUrl={saveMasterLayoutUrl}
      />
    );
  });
}

export function mountShadcnArticleCards(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-article-card]').forEach((host) => {
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
