/**
 * BentoGrid01 — CMS-driven bento grid block.
 *
 * Reads a JSON payload from a Django json_script tag and renders badge, heading,
 * and feature tiles. Theme and tile chrome use `.scn-bentogrid01*` CSS (bundled
 * in `styles.css`), not Tailwind color utilities.
 */

import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Badge } from '../components/ui/badge';
import ForexStripTile, {
  type ForexQuotePayload,
} from '../components/shadcn-space/blocks/bento-grid-01/ForexStripTile';
import MarketMoversTile, {
  type MarketMoverTabPayload,
  type MarketMoversGroupPayload,
} from '../components/shadcn-space/blocks/bento-grid-01/MarketMoversTile';
import MarketCalendarTile, {
  type CalendarRowPayload,
} from '../components/shadcn-space/blocks/bento-grid-01/MarketCalendarTile';
import UpcomingDividendsTile, {
  type DividendRowPayload,
} from '../components/shadcn-space/blocks/bento-grid-01/UpcomingDividendsTile';
import StockBarsTile from '../components/shadcn-space/blocks/bento-grid-01/StockBarsTile';
import { CarouselCard } from './shadcn-taxonomy-editor';
import type {
  CarouselCardImageLayoutLegacy,
  CarouselCardImageScale,
  CarouselCardTextImageLayout,
} from './carousel-slide-packing';
import {
  bentoBlockBackgroundFromPayload,
  bentoGrid01SectionClassName,
  type BentoBlockBackground,
  type BentoTheme,
  type BentoTileStyle,
} from './bento-grid01-theme';
import { BentoWidgetTileFrame } from './bento-widget-tile-frame';
import { BentoGridEditorLayout } from './bento-grid-editor-layout';
import { BentoGridLayout, normalizeGridColumns, normalizeGridRows } from './bento-grid-layout';
import { FxBrokerCardView, type FxBrokerPayload } from './shadcn-fx-broker-card';

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
  header_type:
    | 'image'
    | 'card'
    | 'fxbroker'
    | 'richtext'
    | 'stock_bars'
    | 'forex_strip'
    | 'market_movers'
    | 'upcoming_dividends'
    | 'market_calendar';
  image_url_light?: string;
  image_url_dark?: string;
  title: string;
  description: string;
  col_span?: number | string;
  row_span?: number | string;
  row?: number | null;
  col?: number | null;
  article?: ArticlePayload;
  html?: string;
  card_image_layout?: CarouselCardTextImageLayout | Extract<CarouselCardImageLayoutLegacy, 'fit_under' | 'scales_fit_top'>;
  card_image_scale?: CarouselCardImageScale;
  chart_symbol?: string;
  bars?: StockBarPointPayload[];
  chips?: StockChipPayload[];
  bars_error?: string;
  bars_timeframe?: string;
  bars_as_of_utc?: string;
  forex_quotes?: ForexQuotePayload[];
  market_movers?: MarketMoversGroupPayload;
  market_mover_tabs?: MarketMoverTabPayload[];
  dividend_rows?: DividendRowPayload[];
  calendar_rows?: CalendarRowPayload[];
  fxbroker?: FxBrokerPayload | { kind: 'empty' };
}

const BENTO_TILES_WITHOUT_FOOTER = new Set([
  'stock_bars',
  'forex_strip',
  'market_movers',
  'upcoming_dividends',
  'market_calendar',
]);

export type { BentoTheme, BentoTileStyle, BentoBlockBackground };

export interface BentoGrid01Payload {
  badge_text: string;
  heading: string;
  theme?: string;
  tile_style?: string;
  block_background?: string;
  /** @deprecated Removed server-side; ignored except to imply contained background. */
  section_padding?: string;
  show_badge?: boolean;
  grid_columns?: number;
  grid_rows?: number;
  row_panel_sizes?: number[];
  col_panel_sizes_by_row?: Record<string, number[]>;
  features: BentoGrid01FeaturePayload[];
}

function cardVmLayoutFromBentoFeature(feature: BentoGrid01FeaturePayload): Partial<{
  textImageLayout: CarouselCardTextImageLayout;
  imageScale: CarouselCardImageScale;
  imageLayout: CarouselCardImageLayoutLegacy;
}> {
  const lay = feature.card_image_layout;
  const sc = feature.card_image_scale;
  if (lay === 'fit_under' || lay === 'scales_fit_top') {
    return sc != null ? { imageLayout: lay, imageScale: sc } : { imageLayout: lay };
  }
  if (
    lay === 'text_on_top'
    || lay === 'text_on_left'
    || lay === 'text_on_right'
    || lay === 'text_only'
  ) {
    return { textImageLayout: lay, imageScale: sc ?? 'bleed_under' };
  }
  return { textImageLayout: 'text_on_top', imageScale: sc ?? 'bleed_under' };
}

// ── Feature tile header ───────────────────────────────────────────────────

function FeatureHeader({ feature }: { feature: BentoGrid01FeaturePayload }) {
  if (feature.header_type === 'card' && feature.article && feature.article.kind === 'article') {
    const a = feature.article;
    const layout = cardVmLayoutFromBentoFeature(feature);
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
          ...layout,
        }}
      />
    );
  }
  if (feature.header_type === 'fxbroker' && feature.fxbroker && feature.fxbroker.kind === 'fxbroker') {
    return <FxBrokerCardView data={feature.fxbroker} />;
  }
  if (feature.header_type === 'richtext' && feature.html) {
    return (
      <div className="scn-taxonomy-content__paragraph scn-bentogrid01__richtext"
        dangerouslySetInnerHTML={{ __html: feature.html }} />
    );
  }
  if (feature.header_type === 'stock_bars') {
    return (
      <BentoWidgetTileFrame>
        <StockBarsTile
          bars={feature.bars ?? []}
          chips={feature.chips ?? []}
          chartSymbol={feature.chart_symbol ?? ''}
          barsError={feature.bars_error}
          barsTimeframe={feature.bars_timeframe}
        />
      </BentoWidgetTileFrame>
    );
  }
  if (feature.header_type === 'forex_strip') {
    return (
      <BentoWidgetTileFrame>
        <ForexStripTile quotes={feature.forex_quotes ?? []} />
      </BentoWidgetTileFrame>
    );
  }
  if (feature.header_type === 'market_movers' && feature.market_movers) {
    return (
      <BentoWidgetTileFrame scrollable={false}>
        <MarketMoversTile
          marketMovers={feature.market_movers}
          tabs={feature.market_mover_tabs ?? []}
        />
      </BentoWidgetTileFrame>
    );
  }
  if (feature.header_type === 'upcoming_dividends') {
    return (
      <BentoWidgetTileFrame scrollable>
        <UpcomingDividendsTile rows={feature.dividend_rows ?? []} />
      </BentoWidgetTileFrame>
    );
  }
  if (feature.header_type === 'market_calendar') {
    return (
      <BentoWidgetTileFrame scrollable>
        <MarketCalendarTile rows={feature.calendar_rows ?? []} />
      </BentoWidgetTileFrame>
    );
  }
  return (
    <>
      {feature.image_url_light && (
        <img
          src={feature.image_url_light}
          alt={feature.title}
          className="scn-bentogrid01__feat-img scn-bentogrid01__feat-img--light"
        />
      )}
      {feature.image_url_dark && (
        <img
          src={feature.image_url_dark}
          alt={feature.title}
          className="scn-bentogrid01__feat-img scn-bentogrid01__feat-img--dark"
        />
      )}
      {!feature.image_url_light && !feature.image_url_dark && (
        <div className="scn-bentogrid01__img-placeholder">
          No image
        </div>
      )}
    </>
  );
}

// ── Root component ────────────────────────────────────────────────────────

function BentoGrid01Root({ payload }: { payload: BentoGrid01Payload }) {
  const showBadge = payload.show_badge !== false;
  const gridColumns = normalizeGridColumns(payload.grid_columns);
  const gridRows = normalizeGridRows(payload.grid_rows);
  const hasExactPanelSizes =
    Boolean(payload.row_panel_sizes?.length)
    || Boolean(payload.col_panel_sizes_by_row && Object.keys(payload.col_panel_sizes_by_row).length > 0);
  const tilesWithIds = React.useMemo(
    () => payload.features.map((feature, index) => ({
      ...feature,
      id: `bento-public-${index}`,
    })),
    [payload.features],
  );

  const sectionClass = bentoGrid01SectionClassName({
    theme: payload.theme,
    blockBackground: bentoBlockBackgroundFromPayload(payload),
    tileStyle: payload.tile_style,
  });

  function renderPublicTile(feature: BentoGrid01FeaturePayload) {
    const headerClip = (feature.header_type === 'card' || feature.header_type === 'fxbroker') ? '' : ' scn-bentogrid01__tile-header--clip';
    const isWidgetTile = BENTO_TILES_WITHOUT_FOOTER.has(feature.header_type);
    const widgetHeader = isWidgetTile ? ' scn-bentogrid01__tile-header--widget' : '';
    const showTextFooter = !isWidgetTile;
    const tileHeaderRound = showTextFooter ? '' : ' scn-bentogrid01__tile-header--round-bottom';
    return (
      <div className="scn-bentogrid01__tile">
        <div
          className={`scn-bentogrid01__tile-header${headerClip}${tileHeaderRound}${widgetHeader}`}
        >
          <FeatureHeader feature={feature} />
        </div>
        {showTextFooter ? (
          <div className="scn-bentogrid01__tile-footer">
            <h3 className="scn-bentogrid01__tile-title">{feature.title}</h3>
            <p className="scn-bentogrid01__tile-desc">{feature.description}</p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className={sectionClass}>
      <div className="scn-bentogrid01__inner">
        <div className="scn-bentogrid01__intro">
          <h2 className="scn-bentogrid01__heading">{payload.heading}</h2>
          {showBadge && (
            <Badge variant="outline" className="scn-bentogrid01__badge">
              {payload.badge_text}
            </Badge>
          )}
        </div>
        {hasExactPanelSizes ? (
          <BentoGridEditorLayout
            gridColumns={gridColumns}
            gridRows={gridRows}
            tiles={tilesWithIds}
            resizable={false}
            rowPanelSizes={payload.row_panel_sizes}
            colPanelSizesByRow={payload.col_panel_sizes_by_row}
            className="scn-bentogrid01__layout-host"
            getTileKey={(feature) => feature.id}
            renderEmptyColumn={() => null}
            renderEmptyRow={() => null}
            renderTile={(feature) => renderPublicTile(feature)}
          />
        ) : (
          <BentoGridLayout
            gridColumns={gridColumns}
            gridRows={gridRows}
            tiles={payload.features}
            getTileKey={(_, i) => i}
            renderTile={(feature) => renderPublicTile(feature)}
          />
        )}
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
