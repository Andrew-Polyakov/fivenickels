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

function ArticleCardView({ data }: { data: ArticleCardPayload }): React.JSX.Element {
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
  return <Card className="scn-article-card">{body}</Card>;
}

function panelEntriesFromRowItems(items: RowItem[]): { card: ArticleCardPayload; dividerBefore: boolean }[] {
  const out: { card: ArticleCardPayload; dividerBefore: boolean }[] = [];
  let dividerBefore = false;
  for (const item of items) {
    if (item.type === 'separator' && item.orientation === 'vertical') {
      dividerBefore = true;
      continue;
    }
    if (item.type === 'card') {
      out.push({ card: item.card, dividerBefore });
      dividerBefore = false;
    }
  }
  return out;
}

function ResizableCardRow({
  items,
  panelGroupKey,
}: {
  items: RowItem[];
  panelGroupKey: string;
}): React.JSX.Element {
  const entries = panelEntriesFromRowItems(items);
  if (entries.length === 0) {
    return <></>;
  }
  if (entries.length === 1) {
    return (
      <div className="scn-card-row scn-card-row--single">
        <ArticleCardView data={entries[0].card} />
      </div>
    );
  }
  const defaultPct = `${100 / entries.length}%`;
  return (
    <Group orientation="horizontal" className="scn-card-row scn-card-row--panels">
      {entries.map((entry, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 ? (
            <ResizeSeparator
              className={cn(
                'scn-resize-handle',
                entry.dividerBefore && 'scn-resize-handle--with-separator'
              )}
            >
              {entry.dividerBefore ? (
                <UiSeparator orientation="vertical" className="scn-resize-handle__sep" decorative />
              ) : null}
            </ResizeSeparator>
          ) : null}
          <Panel
            defaultSize={defaultPct}
            minSize={12}
            id={`scn-panel-${panelGroupKey}-${idx}`}
            className="scn-card-row__panel"
            style={{ overflow: 'hidden' }}
          >
            <ArticleCardView data={entry.card} />
          </Panel>
        </React.Fragment>
      ))}
    </Group>
  );
}

export function CardLayoutRoot({
  payload,
  enableMasterPane,
}: {
  payload: CardLayoutPayload;
  enableMasterPane: boolean;
}): React.JSX.Element {
  const [rows, setRows] = React.useState<LayoutRow[]>(payload.rows);
  const [layoutDialogOpen, setLayoutDialogOpen] = React.useState(false);
  const [menu, setMenu] = React.useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    rowIndex: null,
  });

  React.useEffect(() => {
    setRows(payload.rows);
    setMenu({ open: false, x: 0, y: 0, rowIndex: null });
    setLayoutDialogOpen(false);
  }, [payload]);

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

  const onContextMenu = (evt: React.MouseEvent<HTMLDivElement>) => {
    if (!enableMasterPane || rows.length === 0) {
      return;
    }
    const target = evt.target as HTMLElement;
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

  return (
    <div className="scn-card-layout" onContextMenu={onContextMenu}>
      {rows.map((row, i) => (
        <div key={i} data-layout-row-index={i} className="scn-card-layout__slot">
          {row.kind === 'separator' ? (
            <UiSeparator orientation="horizontal" className="scn-card-layout__sep" />
          ) : (
            <ResizableCardRow items={row.items} panelGroupKey={String(i)} />
          )}
        </div>
      ))}
      {rows.length === 0 && enableMasterPane ? (
        <Dialog open={layoutDialogOpen} onOpenChange={setLayoutDialogOpen}>
          <Empty className="scn-card-layout__empty-state">
            <EmptyHeader>
              <EmptyTitle>No layout yet</EmptyTitle>
              <EmptyDescription>
                Start from a resizable preset. You can add cards and horizontal separators after the layout
                exists.
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
                Each option creates stub panels you can resize. Use right-click on the layout to add more
                cards or separators.
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
      ) : null}
      {menu.open && enableMasterPane && rows.length > 0 ? (
        <div className="scn-context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          <button type="button" className="scn-context-menu__item" onClick={insertCard}>
            Add card
          </button>
          <button type="button" className="scn-context-menu__item" onClick={insertSeparator}>
            Add separator
          </button>
        </div>
      ) : null}
    </div>
  );
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
    root.render(<CardLayoutRoot payload={parsed} enableMasterPane={enableMasterPane} />);
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
