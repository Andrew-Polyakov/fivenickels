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

type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  rowIndex: number | null;
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
}: {
  items: RowItem[];
  panelGroupKey: string;
  rowIndex: number;
  enableMasterPane: boolean;
  onDeleteCard: (rowIndex: number, itemIndex: number) => void;
}): React.JSX.Element {
  const panels = collectCardPanels(items);
  if (panels.length === 0) {
    return <></>;
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
        minSize={12}
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
        className={cn('scn-resize-handle', entry.dividerBefore && 'scn-resize-handle--with-separator')}
        id={`scn-hsep-${panelGroupKey}-${entry.itemIndex}`}
      >
        {entry.dividerBefore ? (
          <UiSeparator orientation="vertical" className="scn-resize-handle__sep" decorative />
        ) : null}
      </ResizeSeparator>,
      panel,
    ];
  });
  return (
    <Group orientation="horizontal" className="scn-card-row scn-card-row--panels">
      {horizontalChildren}
    </Group>
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
  const [menu, setMenu] = React.useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    rowIndex: null,
  });

  React.useEffect(() => {
    baselineRowsRef.current = cloneRows(payload.rows);
    setRows(cloneRows(payload.rows));
    setMenu({ open: false, x: 0, y: 0, rowIndex: null });
    setLayoutDialogOpen(false);
    setPaneMenuOpen(false);
    setSavePending(false);
  }, [payload]);

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

  const handlePaneReset = React.useCallback(() => {
    setRows(cloneRows(baselineRowsRef.current));
    setPaneMenuOpen(false);
  }, []);

  React.useEffect(() => {
    if (!menu.open) {
      return;
    }
    const close = () => setMenu((prev) => ({ ...prev, open: false }));
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
    if (target.closest('.scn-article-card') || target.closest('.scn-resize-handle')) {
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
        if (Number.isNaN(idx)) {
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
    });
  };

  const insertCard = () => {
    const newCard: RowItem = {
      type: 'card',
      card: { kind: 'stub', message: 'New card' },
    };
    setRows((prev) => {
      if (prev.length === 0) {
        return [{ kind: 'row', items: [newCard] }];
      }
      const at = menu.rowIndex;
      if (at !== null && at >= 0 && at < prev.length && prev[at]?.kind === 'row') {
        const current = prev[at] as Extract<LayoutRow, { kind: 'row' }>;
        const nextItems = [...current.items];
        if (nextItems.length > 0) {
          nextItems.push({ type: 'separator', orientation: 'vertical' });
        }
        nextItems.push(newCard);
        const cloned = [...prev];
        cloned[at] = { ...current, items: nextItems };
        return cloned;
      }
      const insertAt = at !== null && at >= 0 ? Math.min(at + 1, prev.length) : prev.length;
      return [
        ...prev.slice(0, insertAt),
        { kind: 'row', items: [newCard] },
        ...prev.slice(insertAt),
      ];
    });
    setMenu((prev) => ({ ...prev, open: false }));
  };

  const insertSeparator = () => {
    setRows((prev) => {
      const at = menu.rowIndex;
      const insertAt = at !== null && at >= 0 ? Math.min(at + 1, prev.length) : prev.length;
      return [
        ...prev.slice(0, insertAt),
        { kind: 'separator', orientation: 'horizontal' as const },
        ...prev.slice(insertAt),
      ];
    });
    setMenu((prev) => ({ ...prev, open: false }));
  };

  /** Vertical rule between columns is stored as `RowItem` separator + card; use “Add column”. */
  const rowPct = rows.length ? `${100 / rows.length}%` : '100%';
  const verticalRowChildren = rows.flatMap((row, i) => {
    const panel = (
      <Panel
        key={`scn-vrow-${i}`}
        defaultSize={rowPct}
        minSize={10}
        id={`scn-vrow-${i}`}
        className="scn-card-layout__row-panel"
        style={{ overflow: 'hidden' }}
      >
        <div data-layout-row-index={i} className="scn-card-layout__slot">
          {row.kind === 'separator' ? (
            <UiSeparator orientation="horizontal" className="scn-card-layout__sep" />
          ) : (
            <ResizableCardRow
              items={row.items}
              panelGroupKey={String(i)}
              rowIndex={i}
              enableMasterPane={enableMasterPane}
              onDeleteCard={deleteCard}
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
        <div className="scn-card-layout-host" onContextMenu={onContextMenu}>
          <Group orientation="vertical" className={cn('scn-card-layout', 'scn-card-layout--vertical-stack')}>
            {verticalRowChildren}
          </Group>
          {menu.open && enableMasterPane ? (
            <div className="scn-context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
              <button type="button" className="scn-context-menu__item" onClick={insertCard}>
                Add column (card + vertical rule)
              </button>
              <button type="button" className="scn-context-menu__item" onClick={insertSeparator}>
                Add horizontal separator (row)
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
