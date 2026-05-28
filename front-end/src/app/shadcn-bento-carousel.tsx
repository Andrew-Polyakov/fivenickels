/**
 * Bento article_carousel card for related articles (article + broker pages).
 * Mounts inside `scn-bento-editor__column-cell` (shell from bento_carousel_mount.html).
 */

import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { BentoArticleCarouselFrame } from '../components/shadcn-space/blocks/bento-grid-01/BentoArticleCarouselTile';
import { BentoArticleCarouselCard } from './bento-article-carousel-card';
import type { BentoBlockBackground, BentoTheme, BentoTileStyle } from './bento-grid01-theme';

export type BentoCarouselPayload = {
  frames: BentoArticleCarouselFrame[];
  frameCount: number;
  autoScroll?: boolean;
  theme?: BentoTheme | string;
  tileStyle?: BentoTileStyle | string;
  blockBackground?: BentoBlockBackground | string;
};

const carouselRoots = new Map<HTMLElement, Root>();

function readPayloadScript(jsonId: string): BentoCarouselPayload | null {
  const el = document.getElementById(jsonId);
  if (!el?.textContent?.trim()) {
    return null;
  }
  try {
    return JSON.parse(el.textContent) as BentoCarouselPayload;
  } catch {
    return null;
  }
}

export function mountShadcnBentoCarousel(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-shadcn-bento-carousel]').forEach((host) => {
    if (host.dataset['shadcnBentoCarouselBound'] === '1') {
      return;
    }
    const columnCell = host.closest('.scn-bento-editor__column-cell');
    if (!columnCell) {
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
    host.dataset['shadcnBentoCarouselBound'] = '1';
    let reactRoot = carouselRoots.get(host);
    if (!reactRoot) {
      reactRoot = createRoot(host);
      carouselRoots.set(host, reactRoot);
    }
    reactRoot.render(
      <BentoArticleCarouselCard
        frames={frames}
        frameCount={frameCount}
        autoScroll={autoScroll}
        theme={payload?.theme}
        tileStyle={payload?.tileStyle}
        blockBackground={payload?.blockBackground}
        includeThemeScope
      />,
    );
  });
}

export function unmountShadcnBentoCarousel(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-shadcn-bento-carousel]').forEach((host) => {
    const reactRoot = carouselRoots.get(host);
    if (reactRoot) {
      reactRoot.unmount();
      carouselRoots.delete(host);
    }
    delete host.dataset['shadcnBentoCarouselBound'];
  });
}
