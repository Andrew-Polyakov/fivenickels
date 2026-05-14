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
import { CarouselCard } from './shadcn-taxonomy-editor';

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

export interface BentoGrid01FeaturePayload {
  header_type: 'reminder_animation' | 'animated_ui_block' | 'image' | 'card' | 'richtext';
  image_url_light?: string;
  image_url_dark?: string;
  title: string;
  description: string;
  col_span: '4' | '8';
  article?: ArticlePayload;
  html?: string;
}

export type BentoTheme = 'default' | 'dark' | 'muted' | 'accent';
export type BentoTileStyle = 'bordered' | 'shadow' | 'flat';
export type BentoSectionPadding = 'default' | 'compact' | 'spacious';

export interface BentoGrid01Payload {
  badge_text: string;
  heading: string;
  theme?: BentoTheme;
  tile_style?: BentoTileStyle;
  section_padding?: BentoSectionPadding;
  show_badge?: boolean;
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
        key="bento-card"
        imageUrl={a.imageUrl}
        tags={a.tags}
        title={a.title ?? ''}
        excerpt={a.excerpt}
        url={a.href}
        authorName={a.authorName}
        publishedAt={a.publishedAt}
        catalyst={a.catalyst}
      />
    );
  }
  if (feature.header_type === 'richtext' && feature.html) {
    return (
      <div className="scn-taxonomy-content__paragraph"
        dangerouslySetInnerHTML={{ __html: feature.html }} />
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

// ── Theme helpers ─────────────────────────────────────────────────────────

const SECTION_PADDING: Record<BentoSectionPadding, string> = {
  default: 'py-11 md:py-20',
  compact: 'py-6 md:py-10',
  spacious: 'py-16 md:py-28',
};

const SECTION_BG: Record<BentoTheme, string> = {
  default: '',
  dark: 'bg-zinc-950 text-zinc-50',
  muted: 'bg-muted/50',
  accent: 'bg-primary/5',
};

const TILE_WRAPPER: Record<BentoTileStyle, string> = {
  bordered: 'rounded-xl border border-border',
  shadow: 'rounded-xl shadow-md',
  flat: 'rounded-xl',
};

const TILE_HEADER_BG: Record<BentoTheme, string> = {
  default: 'bg-muted',
  dark: 'bg-zinc-900',
  muted: 'bg-muted/60',
  accent: 'bg-primary/10',
};

const TILE_DIVIDER: Record<BentoTileStyle, string> = {
  bordered: 'border-t border-border',
  shadow: 'border-t border-border/50',
  flat: '',
};

const HEADING_COLOR: Record<BentoTheme, string> = {
  default: 'text-foreground',
  dark: 'text-zinc-50',
  muted: 'text-foreground',
  accent: 'text-foreground',
};

const DESCRIPTION_COLOR: Record<BentoTheme, string> = {
  default: 'text-muted-foreground',
  dark: 'text-zinc-400',
  muted: 'text-muted-foreground',
  accent: 'text-muted-foreground',
};

const BADGE_VARIANT: Record<BentoTheme, string> = {
  default: '',
  dark: 'border-zinc-700 text-zinc-300',
  muted: '',
  accent: 'border-primary/30 text-primary',
};

// ── Root component ────────────────────────────────────────────────────────

function BentoGrid01Root({ payload }: { payload: BentoGrid01Payload }) {
  const theme: BentoTheme = payload.theme ?? 'default';
  const tileStyle: BentoTileStyle = payload.tile_style ?? 'bordered';
  const padding: BentoSectionPadding = payload.section_padding ?? 'default';
  const showBadge = payload.show_badge !== false;

  return (
    <section className={SECTION_BG[theme]}>
      <div className={SECTION_PADDING[padding]}>
        <div className="max-w-7xl xl:px-16 lg:px-8 px-4 mx-auto flex flex-col gap-12">
          <div className="flex flex-col gap-4 items-center justify-center max-w-3xl mx-auto">
            {showBadge && (
              <Badge
                variant="outline"
                className={`px-3 py-1 h-auto text-sm font-normal ${BADGE_VARIANT[theme]}`}
              >
                {payload.badge_text}
              </Badge>
            )}
            <h2 className={`text-center md:text-5xl text-3xl mx-auto font-medium ${HEADING_COLOR[theme]}`}>
              {payload.heading}
            </h2>
          </div>
          <div className="grid grid-cols-12 gap-5">
            {payload.features.map((feature, i) => {
              const span = feature.col_span === '8' ? 'lg:col-span-8' : 'lg:col-span-4';
              return (
                <div key={i} className={`${span} col-span-12 overflow-hidden`}>
                  <div className={`${TILE_WRAPPER[tileStyle]} h-full flex flex-col`}>
                    <div className={`${TILE_HEADER_BG[theme]} rounded-t-xl py-8 px-9 relative flex-1 flex items-center justify-center`}>
                      <FeatureHeader feature={feature} />
                    </div>
                    <div className={`flex flex-col gap-0.5 p-8 ${TILE_DIVIDER[tileStyle]}`}>
                      <h3 className={`text-xl font-medium ${HEADING_COLOR[theme]}`}>{feature.title}</h3>
                      <p className={`text-base font-normal ${DESCRIPTION_COLOR[theme]}`}>
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
