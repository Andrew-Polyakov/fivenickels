import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';

export type ArticleDatelineEntry = {
  display: string;
  iso: string | null;
};

export type ArticleDatelinesAccordionPayload = {
  headerLabel: string;
  published: ArticleDatelineEntry | null;
  updated: ArticleDatelineEntry | null;
};

function DatelineLine({
  label,
  entry,
}: {
  label: string;
  entry: ArticleDatelineEntry;
}): React.JSX.Element {
  return (
    <p className="tagged-content__dateline">
      {label}{' '}
      {entry.iso ? (
        <time dateTime={entry.iso}>{entry.display}</time>
      ) : (
        entry.display
      )}
    </p>
  );
}

function ArticleDatelinesAccordionView({
  payload,
}: {
  payload: ArticleDatelinesAccordionPayload;
}): React.JSX.Element {
  const hasBody = Boolean(payload.published || payload.updated);
  if (!hasBody) {
    return <span className="tagged-content__datelines-fallback">{payload.headerLabel}</span>;
  }

  return (
    <Accordion type="single" collapsible className="tagged-content__datelines-accordion scn-accordion">
      <AccordionItem value="datelines">
        <AccordionTrigger className="tagged-content__datelines-trigger">
          {payload.headerLabel}
        </AccordionTrigger>
        <AccordionContent className="tagged-content__datelines-body">
          {payload.published ? <DatelineLine label="Published" entry={payload.published} /> : null}
          {payload.updated ? <DatelineLine label="Updated" entry={payload.updated} /> : null}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function readDatelinesPayload(jsonId: string): ArticleDatelinesAccordionPayload | null {
  const el = document.getElementById(jsonId);
  if (!el?.textContent?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(el.textContent) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const p = parsed as ArticleDatelinesAccordionPayload;
    if (typeof p.headerLabel !== 'string' || !p.headerLabel.trim()) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

const datelineRoots = new WeakMap<HTMLElement, Root>();

export function mountShadcnArticleDatelines(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-article-datelines]').forEach((host) => {
    if (host.dataset['shadcnArticleDatelinesBound'] === '1') {
      return;
    }
    const jsonId = host.dataset['accordionJsonId'];
    if (!jsonId) {
      return;
    }
    const payload = readDatelinesPayload(jsonId);
    if (!payload) {
      return;
    }
    host.dataset['shadcnArticleDatelinesBound'] = '1';
    let root = datelineRoots.get(host);
    if (!root) {
      root = createRoot(host);
      datelineRoots.set(host, root);
    }
    root.render(<ArticleDatelinesAccordionView payload={payload} />);
  });
}
