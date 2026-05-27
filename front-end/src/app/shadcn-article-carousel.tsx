/**
 * Standalone mount for the bento grid article_carousel block (hero slides + dots).
 */

import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  BentoArticleCarouselTile,
  type BentoArticleCarouselFrame,
} from '../components/shadcn-space/blocks/bento-grid-01/BentoArticleCarouselTile';

export type ArticleCarouselPayload = {
  frames: BentoArticleCarouselFrame[];
  frameCount: number;
  autoScroll?: boolean;
};

const carouselRoots = new Map<HTMLElement, Root>();

function readPayloadScript(jsonId: string): ArticleCarouselPayload | null {
  const el = document.getElementById(jsonId);
  if (!el?.textContent?.trim()) {
    return null;
  }
  try {
    return JSON.parse(el.textContent) as ArticleCarouselPayload;
  } catch {
    return null;
  }
}

export function mountShadcnArticleCarousel(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-shadcn-article-carousel]').forEach((host) => {
    if (host.dataset['shadcnArticleCarouselBound'] === '1') {
      return;
    }
    const jsonId = host.dataset['layoutJsonId'];
    if (!jsonId) {
      return;
    }
    const payload = readPayloadScript(jsonId);
    const frames = payload?.frames?.filter((f) => f.kind === 'article') ?? [];
    if (frames.length === 0) {
      return;
    }
    const frameCount = payload?.frameCount ?? frames.length;
    const autoScroll = Boolean(payload?.autoScroll);
    host.dataset['shadcnArticleCarouselBound'] = '1';
    let reactRoot = carouselRoots.get(host);
    if (!reactRoot) {
      reactRoot = createRoot(host);
      carouselRoots.set(host, reactRoot);
    }
    reactRoot.render(
      <BentoArticleCarouselTile
        frames={frames}
        frameCount={frameCount}
        autoScroll={autoScroll}
      />,
    );
  });
}

export function unmountShadcnArticleCarousel(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-shadcn-article-carousel]').forEach((host) => {
    const reactRoot = carouselRoots.get(host);
    if (reactRoot) {
      reactRoot.unmount();
      carouselRoots.delete(host);
    }
    delete host.dataset['shadcnArticleCarouselBound'];
  });
}
