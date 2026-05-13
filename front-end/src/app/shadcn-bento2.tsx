/**
 * Bento2 — clean resizable card layout block.
 *
 * Uses shadcn ResizablePanelGroup / ResizablePanel / ResizableHandle exclusively.
 * No column-control buttons. Context menu: Add card, New row, Remove section.
 */

import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Group, Panel, Separator as ResizeSeparator } from 'react-resizable-panels';

import { Separator as UiSeparator } from '../components/ui/separator';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../components/ui/resizable';
import { cn } from '../lib/utils';
import { Toaster, toast } from 'sonner';

import {
  type ArticleCardPayload,
  type CardLayoutPayload,
  type LayoutPresetId,
  ArticleCardView,
  presetToRows,
} from './shadcn-card-layout';

// ── Types ────────────────────────────────────────────────────────────────────

type RowItem =
  | { type: 'card'; card: ArticleCardPayload }
  | { type: 'separator'; orientation: 'horizontal' | 'vertical' };

type LayoutRow =
  | { kind: 'row'; items: RowItem[]; columnSizes?: number[] }
  | { kind: 'separator'; orientation: 'horizontal' | 'vertical' };

// ── Constants ────────────────────────────────────────────────────────────────

export const BENTO2_LAYOUT_VERSION = 4;

const COLLAPSE_BREAKPOINT_PX = 580;
const EDGE_MARGIN_PX = 5;
const CARD_MIN_PX = 260;
const ROW_BAND_MIN_PCT = '8%';

// ── Helpers ──────────────────────────────────────────────────────────────────

function cloneRows(rows: LayoutRow[]): LayoutRow[] {
  return structuredClone(rows);
}

function defaultCard(): ArticleCardPayload {
  return { kind: 'layout', variant: 'biggies', title: 'Card title' };
}

function newCardRow(): LayoutRow {
  return { kind: 'row', items: [{ type: 'card', card: defaultCard() }] };
}

function removeCardFromRow(items: RowItem[], itemIndex: number): RowItem[] | null {
  if (itemIndex < 0 || itemIndex >= items.length || items[itemIndex].type !== 'card') {
    return null;
  }
  const next = [...items];
  const prevSep = itemIndex > 0 && next[itemIndex - 1]?.type === 'separator';
  const nextSep =
    itemIndex < next.length - 1 && next[itemIndex + 1]?.type === 'separator';
  if (prevSep) {
    next.splice(itemIndex - 1, 2);
  } else if (nextSep) {
    next.splice(itemIndex, 2);
  } else {
    next.splice(itemIndex, 1);
  }
  while (next.length > 0 && next[0]?.type === 'separator') next.shift();
  while (next.length > 0 && next[next.length - 1]?.type === 'separator') next.pop();
  return next;
}

/** Column sizes derived from RowItem vertical separators (ignored — panels use equal default). */
function columnDefaultSizes(items: RowItem[]): number[] {
  const cards = items.filter((it) => it.type === 'card').length;
  if (cards === 0) return [];
  const each = 100 / cards;
  return Array.from({ length: cards }, () => each);
}

/** Minimum height (px) for the vertical panel stack. */
function stackMinHeightPx(rows: LayoutRow[]): number {
  let h = 0;
  for (const r of rows) h += r.kind === 'separator' ? 32 : CARD_MIN_PX;
  return Math.max(h, 200);
}

/** Format a feasible min-percent for resizable panels. */
function minPct(containerPx: number, panelCount: number): string {
  if (panelCount <= 0 || containerPx <= 0) return `${(100 / Math.max(panelCount, 1)).toFixed(2)}%`;
  const pct = (CARD_MIN_PX / containerPx) * 100;
  return `${Math.min(99 / panelCount, Math.max(0.1, pct)).toFixed(2)}%`;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

function useContainerWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setWidth(el.getBoundingClientRect().width);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return width;
}

// ── BentoRow ─────────────────────────────────────────────────────────────────

function BentoRow({
  row,
  rowIndex,
  enableEdit,
  containerWidth,
  onUpdateCard,
  onDeleteCard,
  onContextMenu,
}: {
  row: Extract<LayoutRow, { kind: 'row' }>;
  rowIndex: number;
  enableEdit: boolean;
  containerWidth: number;
  onUpdateCard: (rowIndex: number, itemIndex: number, card: ArticleCardPayload) => void;
  onDeleteCard: (rowIndex: number, itemIndex: number) => void;
  onContextMenu: (e: React.MouseEvent, rowIndex: number, itemIndex: number | null) => void;
}): React.JSX.Element {
  const cards = row.items.filter((it) => it.type === 'card') as {
    type: 'card';
    card: ArticleCardPayload;
    _idx: number;
  }[];
  const cardEntries = row.items.reduce<{ card: ArticleCardPayload; itemIndex: number }[]>(
    (acc, item, idx) => {
      if (item.type === 'card') acc.push({ card: item.card, itemIndex: idx });
      return acc;
    },
    []
  );

  const panelCount = cardEntries.length;
  const defaultSizes = row.columnSizes ?? columnDefaultSizes(row.items);
  const mp = minPct(containerWidth, panelCount);

  if (containerWidth > 0 && containerWidth < COLLAPSE_BREAKPOINT_PX) {
    return (
      <div className="bento2-row bento2-row--collapsed">
        {cardEntries.map((entry) => (
          <div
            key={entry.itemIndex}
            className="bento2-panel"
            onContextMenu={(e) => onContextMenu(e, rowIndex, entry.itemIndex)}
          >
            <ArticleCardView
              data={entry.card}
              enableMasterPane={enableEdit}
              onCarouselHeaderChange={(header) => {
                const card = entry.card;
                if (card.kind !== 'layout' || card.variant !== 'carousel') return;
                onUpdateCard(rowIndex, entry.itemIndex, { ...card, carouselHeader: header });
              }}
              onDelete={enableEdit ? () => onDeleteCard(rowIndex, entry.itemIndex) : undefined}
            />
          </div>
        ))}
      </div>
    );
  }

  const children = cardEntries.flatMap((entry, i) => {
    const defaultSize = defaultSizes[i] ?? 100 / panelCount;
    const panel = (
      <ResizablePanel
        key={`panel-${rowIndex}-${entry.itemIndex}`}
        id={`b2-panel-${rowIndex}-${entry.itemIndex}`}
        defaultSize={defaultSize}
        minSize={Number.parseFloat(mp)}
        className="bento2-panel"
        onContextMenu={(e) => onContextMenu(e, rowIndex, entry.itemIndex)}
      >
        <ArticleCardView
          data={entry.card}
          enableMasterPane={enableEdit}
          onCarouselHeaderChange={(header) => {
            const card = entry.card;
            if (card.kind !== 'layout' || card.variant !== 'carousel') return;
            onUpdateCard(rowIndex, entry.itemIndex, { ...card, carouselHeader: header });
          }}
          onDelete={enableEdit ? () => onDeleteCard(rowIndex, entry.itemIndex) : undefined}
        />
      </ResizablePanel>
    );
    if (i === 0) return [panel];
    return [
      <ResizableHandle
        key={`handle-${rowIndex}-${entry.itemIndex}`}
        id={`b2-handle-${rowIndex}-${entry.itemIndex}`}
        className="bento2-handle bento2-handle--col"
        disabled={!enableEdit}
        withHandle
      />,
      panel,
    ];
  });

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      id={`b2-row-${rowIndex}`}
      className="bento2-row"
    >
      {children}
    </ResizablePanelGroup>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────────

type MenuState = {
  open: boolean;
  x: number;
  y: number;
  rowIndex: number | null;
  itemIndex: number | null;
};

const CLOSED_MENU: MenuState = { open: false, x: 0, y: 0, rowIndex: null, itemIndex: null };

// ── Save helpers ──────────────────────────────────────────────────────────────

function getCsrfToken(): string | null {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ── Bento2Root ────────────────────────────────────────────────────────────────

function Bento2Root({
  payload,
  enableMasterPane,
  canSaveMasterLayout,
  saveMasterLayoutUrl,
  taxonomyTermId,
}: {
  payload: CardLayoutPayload;
  enableMasterPane: boolean;
  canSaveMasterLayout: boolean;
  saveMasterLayoutUrl: string;
  taxonomyTermId: string;
}): React.JSX.Element {
  const [rows, setRows] = React.useState<LayoutRow[]>(() => cloneRows(payload.rows));
  const [menu, setMenu] = React.useState<MenuState>(CLOSED_MENU);
  const hostRef = React.useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(hostRef);

  // Close menu on outside click
  React.useEffect(() => {
    if (!menu.open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.bento2-context-menu')) {
        setMenu(CLOSED_MENU);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu.open]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const onContextMenu = React.useCallback(
    (e: React.MouseEvent, rowIndex: number | null, itemIndex: number | null) => {
      if (!enableMasterPane) return;
      e.preventDefault();
      e.stopPropagation();
      setMenu({ open: true, x: e.clientX, y: e.clientY, rowIndex, itemIndex });
    },
    [enableMasterPane]
  );

  /** Add a card to the end of the target row (creates a new column). */
  const addCard = React.useCallback(() => {
    setRows((prev) => {
      const next = cloneRows(prev);
      let lastRowIdx = -1;
      for (let i = next.length - 1; i >= 0; i--) { if (next[i].kind === 'row') { lastRowIdx = i; break; } }
      const targetIdx = menu.rowIndex !== null ? menu.rowIndex : lastRowIdx;
      if (targetIdx < 0) {
        next.push(newCardRow());
        return next;
      }
      const row = next[targetIdx];
      if (!row || row.kind !== 'row') {
        next.push(newCardRow());
        return next;
      }
      next[targetIdx] = {
        ...row,
        items: [
          ...row.items,
          { type: 'separator', orientation: 'vertical' },
          { type: 'card', card: defaultCard() },
        ],
      };
      return next;
    });
    setMenu(CLOSED_MENU);
  }, [menu.rowIndex]);

  /** Insert a horizontal-separator row immediately below the target row, then a new content row. */
  const newRow = React.useCallback(() => {
    setRows((prev) => {
      const next = cloneRows(prev);
      const insertAfter =
        menu.rowIndex !== null
          ? menu.rowIndex
          : next.length - 1;
      const pos = insertAfter + 1;
      next.splice(pos, 0, { kind: 'separator', orientation: 'horizontal' }, newCardRow());
      return next;
    });
    setMenu(CLOSED_MENU);
  }, [menu.rowIndex]);

  /** Remove the whole band (row or separator) at the given index. */
  const removeSection = React.useCallback(() => {
    setRows((prev) => {
      const idx = menu.rowIndex;
      if (idx === null) return prev;
      const next = cloneRows(prev);
      next.splice(idx, 1);
      // clean up dangling separators
      while (next.length > 0 && next[0].kind === 'separator') next.shift();
      while (next.length > 0 && next[next.length - 1].kind === 'separator') next.pop();
      return next;
    });
    setMenu(CLOSED_MENU);
  }, [menu.rowIndex]);

  /** Delete a single card from its row; if the row becomes empty, remove the row too. */
  const deleteCard = React.useCallback((rowIndex: number, itemIndex: number) => {
    setRows((prev) => {
      const next = cloneRows(prev);
      const row = next[rowIndex];
      if (!row || row.kind !== 'row') return prev;
      const newItems = removeCardFromRow(row.items, itemIndex);
      if (newItems === null) return prev;
      if (newItems.length === 0) {
        next.splice(rowIndex, 1);
        while (next.length > 0 && next[0].kind === 'separator') next.shift();
        while (next.length > 0 && next[next.length - 1].kind === 'separator') next.pop();
      } else {
        next[rowIndex] = { ...row, items: newItems };
      }
      return next;
    });
  }, []);

  const updateCard = React.useCallback(
    (rowIndex: number, itemIndex: number, card: ArticleCardPayload) => {
      setRows((prev) => {
        const next = cloneRows(prev);
        const row = next[rowIndex];
        if (!row || row.kind !== 'row') return prev;
        const items = [...row.items];
        items[itemIndex] = { type: 'card', card };
        next[rowIndex] = { ...row, items };
        return next;
      });
    },
    []
  );

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = React.useCallback(async () => {
    if (!canSaveMasterLayout || !saveMasterLayoutUrl) return;
    const body: Record<string, unknown> = {
      rows,
      layoutVersion: BENTO2_LAYOUT_VERSION,
    };
    if (taxonomyTermId) body['taxonomyTermId'] = taxonomyTermId;
    try {
      const resp = await fetch(saveMasterLayoutUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken() ?? '',
        },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        toast.success('Layout saved');
      } else {
        toast.error('Save failed');
      }
    } catch {
      toast.error('Save failed');
    }
  }, [rows, canSaveMasterLayout, saveMasterLayoutUrl, taxonomyTermId]);

  // ── Render ────────────────────────────────────────────────────────────────

  const rowBandWeights = rows.map((r) => (r.kind === 'separator' ? 3 : 48));
  const weightSum = rowBandWeights.reduce((a, b) => a + b, 0) || 1;

  const verticalPanels = rows.flatMap((row, i) => {
    const defaultSize = (100 * rowBandWeights[i]) / weightSum;
    const panel = (
      <Panel
        key={`vrow-${i}`}
        id={`b2-vrow-${i}`}
        defaultSize={defaultSize}
        minSize={row.kind === 'separator' ? 0.5 : Number.parseFloat(ROW_BAND_MIN_PCT)}
        className="bento2-row-band"
        style={{ overflow: row.kind === 'separator' ? 'hidden' : 'visible' }}
      >
        <div
          data-bento2-row-index={i}
          className="bento2-slot"
          onContextMenu={(e) => {
            if (row.kind === 'row') onContextMenu(e, i, null);
          }}
        >
          {row.kind === 'separator' ? (
            <UiSeparator orientation="horizontal" className="bento2-sep" />
          ) : (
            <BentoRow
              row={row}
              rowIndex={i}
              enableEdit={enableMasterPane}
              containerWidth={containerWidth}
              onUpdateCard={updateCard}
              onDeleteCard={deleteCard}
              onContextMenu={onContextMenu}
            />
          )}
        </div>
      </Panel>
    );
    if (i === 0) return [panel];
    return [
      <ResizeSeparator
        key={`vhandle-${i}`}
        id={`b2-vhandle-${i}`}
        className="bento2-handle bento2-handle--row"
        disabled={!enableMasterPane}
      />,
      panel,
    ];
  });

  return (
    <div
      ref={hostRef}
      className="bento2-host"
      style={{ padding: `${EDGE_MARGIN_PX}px` }}
      onContextMenu={(e) => {
        if (!enableMasterPane) return;
        // background click → no specific row
        if (rows.length === 0) {
          e.preventDefault();
          setMenu({ open: true, x: e.clientX, y: e.clientY, rowIndex: null, itemIndex: null });
        }
      }}
    >
      <Toaster richColors position="bottom-right" />

      {rows.length === 0 ? (
        <div
          className="bento2-empty"
          onContextMenu={(e) => {
            if (!enableMasterPane) return;
            e.preventDefault();
            e.stopPropagation();
            setMenu({ open: true, x: e.clientX, y: e.clientY, rowIndex: null, itemIndex: null });
          }}
        >
          {enableMasterPane ? (
            <button
              type="button"
              className="bento2-empty__cta"
              onClick={() => {
                setRows(presetToRows('twin'));
              }}
            >
              + Add layout
            </button>
          ) : (
            <p className="bento2-empty__hint">No content yet.</p>
          )}
        </div>
      ) : (
        <div
          className="bento2-stack-measure"
          style={{ ['--bento2-min-h' as string]: `${stackMinHeightPx(rows)}px` } as React.CSSProperties}
        >
          <Group
            orientation="vertical"
            id="bento2-vgroup"
            className="bento2-vgroup"
            style={{ flex: '1 1 auto', minHeight: 0, height: '100%', width: '100%', alignSelf: 'stretch' }}
          >
            {verticalPanels}
          </Group>
        </div>
      )}

      {/* Spacer to catch right-click in empty area below content */}
      {rows.length > 0 && enableMasterPane && (
        <div
          className="bento2-spacer"
          aria-hidden="true"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({ open: true, x: e.clientX, y: e.clientY, rowIndex: rows.length - 1, itemIndex: null });
          }}
        />
      )}

      {/* Context menu */}
      {menu.open && enableMasterPane && (
        <div
          className="bento2-context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <button type="button" className="bento2-context-menu__item" onClick={addCard}>
            Add card
          </button>
          <button type="button" className="bento2-context-menu__item" onClick={newRow}>
            New row
          </button>
          <div className="bento2-context-menu__divider" role="separator" />
          <button
            type="button"
            className="bento2-context-menu__item bento2-context-menu__item--danger"
            onClick={removeSection}
          >
            Remove section
          </button>
          {canSaveMasterLayout && (
            <>
              <div className="bento2-context-menu__divider" role="separator" />
              <button
                type="button"
                className="bento2-context-menu__item bento2-context-menu__item--save"
                onClick={() => {
                  setMenu(CLOSED_MENU);
                  void handleSave();
                }}
              >
                Save layout
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────

const bento2Roots = new Map<HTMLElement, Root>();

function readJsonScript(id: string): unknown | null {
  try {
    const el = document.getElementById(id);
    if (!el?.textContent?.trim()) return null;
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

export function mountShadcnBento2(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-bento2]').forEach((host) => {
    if (host.dataset['shadcnBento2Bound'] === '1') return;
    const jsonId = host.dataset['layoutJsonId'];
    if (!jsonId) return;
    const parsed = readJsonScript(jsonId);
    if (!parsed || typeof parsed !== 'object' || !('rows' in parsed)) return;

    host.dataset['shadcnBento2Bound'] = '1';
    let root = bento2Roots.get(host);
    if (!root) {
      root = createRoot(host);
      bento2Roots.set(host, root);
    }

    const enableMasterPane = host.dataset['masterPaneEnabled'] === '1';
    const canSaveMasterLayout = host.dataset['canSaveMasterLayout'] === '1';
    const saveMasterLayoutUrl = host.dataset['saveMasterLayoutUrl'] ?? '';
    const taxonomyTermId = host.dataset['taxonomyTermId'] ?? '';

    root.render(
      <Bento2Root
        payload={parsed as CardLayoutPayload}
        enableMasterPane={enableMasterPane}
        canSaveMasterLayout={canSaveMasterLayout}
        saveMasterLayoutUrl={saveMasterLayoutUrl}
        taxonomyTermId={taxonomyTermId}
      />
    );
  });
}
