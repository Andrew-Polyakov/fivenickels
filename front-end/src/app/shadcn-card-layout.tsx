import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Group, Panel, Separator as ResizeSeparator } from 'react-resizable-panels';

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
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

export type ArticleCardPayload =
  | { kind: 'article'; title: string; href: string; excerpt: string; imageUrl: string }
  | { kind: 'empty' }
  | { kind: 'stub'; message: string };

type RowItem =
  | { type: 'card'; card: ArticleCardPayload }
  | { type: 'separator'; orientation: 'horizontal' | 'vertical' };

type LayoutRow =
  | { kind: 'row'; items: RowItem[] }
  | { kind: 'separator'; orientation: 'horizontal' | 'vertical' };

export type LayoutPresetId = 'twin' | 'three' | 'quattro' | 'grid-2x4';

function stubRowItem(message: string): RowItem {
  return { type: 'card', card: { kind: 'stub', message } };
}

function stubRow(panelCount: number, startLabel: number): LayoutRow {
  const items: RowItem[] = [];
  for (let i = 0; i < panelCount; i++) {
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

export function presetToRows(preset: LayoutPresetId): LayoutRow[] {
  switch (preset) {
    case 'twin':
      return [stubRow(2, 1)];
    case 'three':
      return [stubRow(3, 1)];
    case 'quattro':
      return [stubRow(4, 1)];
    case 'grid-2x4':
      return [
        stubRow(4, 1),
        { kind: 'separator', orientation: 'horizontal' },
        stubRow(4, 5),
      ];
  }
}

export type CardLayoutPayload = {
  rows: LayoutRow[];
};

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
  /** Viewport Y when menu opened; used to place adds above/below horizontal separators. */
  clientY: number;
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
}: {
  data: ArticleCardPayload;
  onDelete?: () => void;
}): React.JSX.Element {
  const deleteBtn =
    onDelete != null ? (
      <button
        type="button"
        className="scn-article-card__delete"
        aria-label="Remove panel"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span aria-hidden="true">×</span>
      </button>
    ) : null;

  if (data.kind === 'empty') {
    return (
      <Card className="scn-article-card scn-article-card--empty">
        {deleteBtn}
        <CardContent>
          <p className="scn-article-card__empty">No article.</p>
        </CardContent>
      </Card>
    );
  }
  if (data.kind === 'stub') {
    return (
      <Card className="scn-article-card scn-article-card--stub">
        {deleteBtn}
        <CardHeader>
          <CardTitle>Top viewed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="scn-article-card__excerpt">{data.message}</p>
        </CardContent>
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
        {deleteBtn}
        <a className="scn-article-card__shell" href={data.href}>
          {body}
        </a>
      </Card>
    );
  }
  return (
    <Card className="scn-article-card">
      {deleteBtn}
      {body}
    </Card>
  );
}

function ResizableCardRow({
  items,
  panelGroupKey,
  rowIndex,
  enableMasterPane,
  onDeleteCard,
  onRemoveSubsection,
}: {
  items: RowItem[];
  panelGroupKey: string;
  rowIndex: number;
  enableMasterPane: boolean;
  onDeleteCard: (rowIndex: number, itemIndex: number) => void;
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
  if (panels.length === 1) {
    return (
      <div className="scn-card-row scn-card-row--single">
        <ArticleCardView
          data={panels[0].card}
          onDelete={onDel ? () => onDel(rowIndex, panels[0].itemIndex) : undefined}
        />
      </div>
    );
  }
  const defaultPct = `${100 / panels.length}%`;
  const horizontalChildren = panels.flatMap((entry, idx) => {
    const panel = (
      <Panel
        key={`scn-panel-${panelGroupKey}-${entry.itemIndex}`}
        defaultSize={defaultPct}
        minSize="0%"
        id={`scn-panel-${panelGroupKey}-${entry.itemIndex}`}
        className="scn-card-row__panel"
        style={{ overflow: 'hidden' }}
      >
        <ArticleCardView
          data={entry.card}
          onDelete={onDel ? () => onDel(rowIndex, entry.itemIndex) : undefined}
        />
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
        <UiSeparator
          orientation="vertical"
          decorative
          className={cn(
            'scn-resize-handle__sep',
            entry.dividerBefore && 'scn-resize-handle__sep--emphasis'
          )}
        />
      </ResizeSeparator>,
      panel,
    ];
  });
  return (
    <div className="scn-card-row--panels-outer">
      <Group
        orientation="horizontal"
        className="scn-card-row scn-card-row--panels"
        style={{ height: '100%', width: '100%', alignSelf: 'stretch' }}
      >
        {horizontalChildren}
      </Group>
    </div>
  );
}

export function CardLayoutRoot({
  payload,
  enableMasterPane,
  sectionTitle = '',
  taxonomyTermId = '',
  canSaveMasterLayout = false,
  saveMasterLayoutUrl = '',
}: {
  payload: CardLayoutPayload;
  enableMasterPane: boolean;
  sectionTitle?: string;
  taxonomyTermId?: string;
  canSaveMasterLayout?: boolean;
  saveMasterLayoutUrl?: string;
}): React.JSX.Element {
  const baselineRowsRef = React.useRef<LayoutRow[]>(cloneRows(payload.rows));
  const [rows, setRows] = React.useState<LayoutRow[]>(() => cloneRows(payload.rows));
  const [layoutDialogOpen, setLayoutDialogOpen] = React.useState(false);
  const [paneMenuOpen, setPaneMenuOpen] = React.useState(false);
  const [savePending, setSavePending] = React.useState(false);
  const paneMenuRef = React.useRef<HTMLDivElement>(null);
  const cardLayoutHostRef = React.useRef<HTMLDivElement>(null);
  const verticalStackMeasureRef = React.useRef<HTMLDivElement>(null);
  const rowBandPanelCount = Math.max(1, rows.filter((r) => r.kind === 'row').length);
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
    clientY: 0,
    gapAfterSepIndex: null,
  });

  React.useEffect(() => {
    baselineRowsRef.current = cloneRows(payload.rows);
    setRows(cloneRows(payload.rows));
    setMenu({ open: false, x: 0, y: 0, rowIndex: null, clientY: 0, gapAfterSepIndex: null });
    setLayoutDialogOpen(false);
    setPaneMenuOpen(false);
    setSavePending(false);
  }, [payload]);

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

  const handlePaneSave = React.useCallback(() => {
    const url = saveMasterLayoutUrl.trim();
    const tid = taxonomyTermId.trim();
    if (!canSaveMasterLayout || !url || !tid) {
      setPaneMenuOpen(false);
      return;
    }
    setSavePending(true);
    void (async () => {
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
            layout: { rows: cloneRows(rows) },
          }),
        });
        let data: { error?: string } = {};
        try {
          data = (await res.json()) as { error?: string };
        } catch {
          /* ignore */
        }
        if (!res.ok) {
          await (window.showMaterialAlert?.(data.error || `Save failed (${res.status})`, 'Layout') ??
            Promise.resolve());
          return;
        }
        baselineRowsRef.current = cloneRows(rows);
        await (window.showMaterialAlert?.('Layout saved to the server.', 'Saved') ?? Promise.resolve());
      } catch {
        await (window.showMaterialAlert?.('Could not reach the server.', 'Save failed') ?? Promise.resolve());
      } finally {
        setSavePending(false);
        setPaneMenuOpen(false);
      }
    })();
  }, [canSaveMasterLayout, saveMasterLayoutUrl, taxonomyTermId, rows]);

  /** Restores layout rows only; does not change URL or taxonomy nav selection. */
  const handlePaneReset = React.useCallback(() => {
    setRows(cloneRows(baselineRowsRef.current));
    setPaneMenuOpen(false);
  }, []);

  React.useEffect(() => {
    if (!menu.open) {
      return;
    }
    const close = () =>
      setMenu((prev) => ({ ...prev, open: false, gapAfterSepIndex: null }));
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [menu.open]);

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
    const rowEl = target.closest<HTMLElement>('[data-layout-row-index]');
    let rowIndex: number | null = null;
    const rowAttr = rowEl?.dataset['layoutRowIndex'];
    if (typeof rowAttr === 'string') {
      rowIndex = Number.parseInt(rowAttr, 10);
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
    }
    setMenu({
      open: true,
      x: evt.clientX,
      y: evt.clientY,
      rowIndex: Number.isNaN(rowIndex ?? NaN) ? null : rowIndex,
      clientY: evt.clientY,
      gapAfterSepIndex: null,
    });
  };

  /** Append card with optional vertical rule before it (when row already has items). */
  const insertCard = (withVerticalSeparator: boolean) => {
    const newCard: RowItem = {
      type: 'card',
      card: { kind: 'stub', message: 'New card' },
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
      if (withVerticalSeparator && nextItems.length > 0) {
        nextItems.push({ type: 'separator', orientation: 'vertical' });
      }
      nextItems.push(newCard);
      const cloned = [...prev];
      cloned[target] = { ...current, items: nextItems };
      return cloned;
    });
    setMenu((prev) => ({ ...prev, open: false, gapAfterSepIndex: null }));
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
        ...prev.slice(insertAt),
      ];
    });
    setMenu((prev) => ({ ...prev, open: false, gapAfterSepIndex: null }));
  };

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
          {row.kind === 'separator' ? (
            <>
              <UiSeparator orientation="horizontal" className="scn-card-layout__sep" />
              {enableMasterPane && contentGapAfterHorizontalSep(rows, i) ? (
                <div className="scn-sep-gap-actions">
                  <button
                    type="button"
                    className="scn-sep-gap__add"
                    aria-label="Add row (menu)"
                    title="Add cards / columns"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setMenu({
                        open: true,
                        x: r.left + r.width / 2,
                        y: r.bottom + 8,
                        rowIndex: i,
                        clientY: r.top + r.height / 2,
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
              ) : null}
            </>
          ) : (
            <ResizableCardRow
              items={row.items}
              panelGroupKey={String(i)}
              rowIndex={i}
              enableMasterPane={enableMasterPane}
              onDeleteCard={deleteCard}
              onRemoveSubsection={enableMasterPane ? removeSubsectionRow : undefined}
            />
          )}
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
              Start from a resizable preset. Then right-click empty areas to add columns (vertical split and
              rule) or horizontal rules between rows. Drag handles to resize column widths and row heights.
              {canSaveMasterLayout ? ' Staff can save the layout from the Pane menu.' : ''}
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
              Each option creates stub panels. Drag handles between columns for width; drag horizontal bars between
              rows for height. Right-click to add columns (includes a vertical rule) or row separators.
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
              clientY: e.clientY,
              gapAfterSepIndex: null,
            });
          }}
        />
          {menu.open && enableMasterPane ? (
            <div className="scn-context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
              <button type="button" className="scn-context-menu__item" onClick={() => insertCard(false)}>
                Add card
              </button>
              <button type="button" className="scn-context-menu__item" onClick={() => insertCard(true)}>
                Add column (card + vertical rule)
              </button>
              <button type="button" className="scn-context-menu__item" onClick={insertSeparator}>
                Add horizontal separator (row)
              </button>
              <div className="scn-context-menu__divider" role="separator" />
              <button type="button" className="scn-context-menu__item scn-context-menu__item--danger" onClick={removeSectionFromMenu}>
                Remove section
              </button>
            </div>
          ) : null}
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
    const sectionTitle = host.dataset['taxonomySectionTitle'] ?? '';
    const taxonomyTermId = host.dataset['taxonomyTermId'] ?? '';
    const canSaveMasterLayout = host.dataset['canSaveMasterLayout'] === '1';
    const saveMasterLayoutUrl = host.dataset['saveMasterLayoutUrl'] ?? '';
    root.render(
      <CardLayoutRoot
        payload={parsed}
        enableMasterPane={enableMasterPane}
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
