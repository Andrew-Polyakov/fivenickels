import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Group, Panel, Separator as ResizeSeparator } from 'react-resizable-panels';

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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

export type CardLayoutPayload = {
  rows: LayoutRow[];
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

function ResizableCardRow({ items }: { items: RowItem[] }): React.JSX.Element {
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
          <Panel defaultSize={defaultPct} minSize={12} id={`scn-panel-${idx}`} className="scn-card-row__panel">
            <ArticleCardView data={entry.card} />
          </Panel>
        </React.Fragment>
      ))}
    </Group>
  );
}

export function CardLayoutRoot({ payload }: { payload: CardLayoutPayload }): React.JSX.Element {
  return (
    <div className="scn-card-layout">
      {payload.rows.map((row, i) =>
        row.kind === 'separator' ? (
          <UiSeparator key={i} orientation="horizontal" className="scn-card-layout__sep" />
        ) : (
          <ResizableCardRow key={i} items={row.items} />
        )
      )}
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
    root.render(<CardLayoutRoot payload={parsed} />);
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
