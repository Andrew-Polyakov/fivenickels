/**
 * BentoGrid01 — CMS-driven bento grid block.
 *
 * Reads a JSON payload from a Django json_script tag and renders the
 * @shadcn-space/bentogrid-01 component with editable badge, heading, and
 * feature tiles. Each tile may use a built-in animation or light/dark images.
 */

import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Badge } from '../components/ui/badge';
import AnimatedUiBlock from '../components/shadcn-space/blocks/bento-grid-01/AnimatedUiBlock';
import ReminderAnimation from '../components/shadcn-space/blocks/bento-grid-01/ReminderAnimation';
import StockBarsTile from '../components/shadcn-space/blocks/bento-grid-01/StockBarsTile';
import { CarouselCard } from './shadcn-taxonomy-editor';
import type { CarouselCardImageLayout } from './carousel-slide-packing';

// ── Types (mirror the Django BentoGrid01Block fields) ─────────────────────

interface ArticlePayload {
  kind: string;
  title?: string;
  href?: string;
  excerpt?: string;
  imageUrl?: string;
  tags?: string[];
  authorName?: string;
  publishedAt?: string;
  catalyst?: string;
}

export interface StockBarPointPayload {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number | null;
}

export interface StockChipPayload {
  symbol: string;
  label: string;
  href: string;
  pct_formatted: string;
  pct_class: string;
}

export interface BentoGrid01FeaturePayload {
  header_type: 'reminder_animation' | 'animated_ui_block' | 'image' | 'card' | 'richtext' | 'stock_bars';
  image_url_light?: string;
  image_url_dark?: string;
  title: string;
  description: string;
  col_span: '4' | '8';
  article?: ArticlePayload;
  html?: string;
  card_image_layout?: CarouselCardImageLayout;
  chart_symbol?: string;
  bars?: StockBarPointPayload[];
  chips?: StockChipPayload[];
  bars_error?: string;
}

export interface BentoGrid01Payload {
  badge_text: string;
  heading: string;
  features: BentoGrid01FeaturePayload[];
}

// ── Feature tile header ───────────────────────────────────────────────────

function FeatureHeader({ feature }: { feature: BentoGrid01FeaturePayload }) {
  if (feature.header_type === 'reminder_animation') {
    return <ReminderAnimation />;
  }
  if (feature.header_type === 'animated_ui_block') {
    return <AnimatedUiBlock />;
  }
  if (feature.header_type === 'card' && feature.article && feature.article.kind === 'article') {
    const a = feature.article;
    return (
      <CarouselCard
        {...{
          key: 'bento-card',
          imageUrl: a.imageUrl,
          tags: a.tags,
          title: a.title ?? '',
          excerpt: a.excerpt,
          url: a.href,
          authorName: a.authorName,
          publishedAt: a.publishedAt,
          catalyst: a.catalyst,
          imageLayout: feature.card_image_layout ?? 'fit_under',
        }}
      />
    );
  }
  if (feature.header_type === 'richtext' && feature.html) {
    return (
      <div className="scn-taxonomy-content__paragraph"
        dangerouslySetInnerHTML={{ __html: feature.html }} />
    );
  }
  if (feature.header_type === 'stock_bars') {
    return (
      <StockBarsTile
        bars={feature.bars ?? []}
        chips={feature.chips ?? []}
        chartSymbol={feature.chart_symbol ?? ''}
        barsError={feature.bars_error}
      />
    );
  }
  return (
    <>
      {feature.image_url_light && (
        <img
          src={feature.image_url_light}
          alt={feature.title}
          className="dark:hidden"
        />
      )}
      {feature.image_url_dark && (
        <img
          src={feature.image_url_dark}
          alt={feature.title}
          className="hidden dark:block"
        />
      )}
      {!feature.image_url_light && !feature.image_url_dark && (
        <div className="min-h-[120px] flex items-center justify-center text-muted-foreground text-sm">
          No image
        </div>
      )}
    </>
  );
}

// ── Root component ────────────────────────────────────────────────────────

function BentoGrid01Root({ payload }: { payload: BentoGrid01Payload }) {
  return (
    <section>
      <div className="py-11 md:py-20">
        <div className="max-w-7xl xl:px-16 lg:px-8 px-4 mx-auto flex flex-col gap-12">
          <div className="flex flex-col gap-4 items-center justify-center max-w-3xl mx-auto">
            <Badge variant="outline" className="px-3 py-1 h-auto text-sm font-normal">
              {payload.badge_text}
            </Badge>
            <h2 className="text-center md:text-5xl text-3xl mx-auto font-medium">
              {payload.heading}
            </h2>
          </div>
          <div className="grid grid-cols-12 gap-5">
            {payload.features.map((feature, i) => {
              const span = feature.col_span === '8' ? 'lg:col-span-8' : 'lg:col-span-4';
              const headerClip =
                feature.header_type === 'card' ? '' : ' overflow-hidden';
              return (
                <div key={i} className={`${span} col-span-12`}>
                  <div className="rounded-xl border border-border h-full flex flex-col">
                    <div
                      className={`bg-muted rounded-t-xl py-8 px-9 relative flex-1 flex items-center justify-center min-h-[200px]${headerClip}`}
                    >
                      <FeatureHeader feature={feature} />
                    </div>
                    <div className="flex flex-col gap-0.5 p-8 border-t border-border">
                      <h3 className="text-xl font-medium text-foreground">{feature.title}</h3>
                      <p className="text-base font-normal text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Mount helper ──────────────────────────────────────────────────────────

const roots = new Map<HTMLElement, Root>();

export function mountShadcnBentoGrid01(): void {
  const hosts = document.querySelectorAll<HTMLElement>('[data-shadcn-bentogrid01]');
  hosts.forEach((host) => {
    if (roots.has(host)) return;

    const jsonId = host.dataset['layoutJsonId'];
    if (!jsonId) return;

    const scriptEl = document.getElementById(jsonId);
    if (!scriptEl) return;

    let payload: BentoGrid01Payload;
    try {
      payload = JSON.parse(scriptEl.textContent || '{}');
    } catch {
      return;
    }

    const root = createRoot(host);
    roots.set(host, root);
    root.render(<BentoGrid01Root payload={payload} />);
  });
}
