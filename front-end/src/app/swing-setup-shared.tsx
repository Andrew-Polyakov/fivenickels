import * as React from 'react';

import { Badge } from '../components/ui/badge';
import StockBarsTile, {
  type StockBarPoint,
} from '../components/shadcn-space/blocks/bento-grid-01/StockBarsTile';

export type VolumeGaugeData = {
  timeframe_label: string;
  ratio_formatted: string;
  position_pct: number;
};

export type SetupRow = {
  id: number;
  run_id?: number | null;
  symbol: string;
  setup_type: string;
  direction: string | null;
  confluence: string;
  score: string;
  trigger_text: string | null;
  invalidation: string | null;
  t1: number | null;
  t2: number | null;
  rr: number | null;
  notes: string | null;
  stock_name?: string | null;
  sector?: string | null;
  industry?: string | null;
  last_price_formatted: string;
  percent_change_formatted: string;
  percent_change_class: string;
  day_volume_formatted: string;
  volume_gauge?: VolumeGaugeData | null;
  price_session_label?: string | null;
  price_basis?: string | null;
  news_headline?: string | null;
  news_url?: string | null;
  ticker_href?: string;
  scan_started_utc?: string | null;
};

export function VolumeGauge({
  gauge,
  compact = false,
}: {
  gauge: VolumeGaugeData | null | undefined;
  compact?: boolean;
}) {
  if (!gauge) return null;
  const title = `${gauge.timeframe_label} relative volume ${gauge.ratio_formatted} average`;
  return (
    <span
      className={compact ? 'vol-gauge vol-gauge--compact' : 'vol-gauge'}
      title={title}
    >
      <span className="vol-gauge__tf">{gauge.timeframe_label}</span>
      <span className="vol-gauge__track" aria-hidden="true">
        <span className="vol-gauge__marker" style={{ left: `${gauge.position_pct}%` }} />
      </span>
      <span className="vol-gauge__ratio">{gauge.ratio_formatted}</span>
    </span>
  );
}

export function parseJsonScript<T>(id: string): T | null {
  const el = document.getElementById(id);
  if (!el?.textContent?.trim()) return null;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return null;
  }
}

export function parseConfluence(raw: string): { m: string; w: string; d: string } {
  const parts = { m: 'range', w: 'range', d: 'range' };
  const re = /([MWD]):(\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const key = m[1].toUpperCase();
    const val = m[2].toLowerCase();
    if (key === 'M') parts.m = val;
    if (key === 'W') parts.w = val;
    if (key === 'D') parts.d = val;
  }
  return parts;
}

export function trendChipClass(trend: string): string {
  if (trend === 'up') return 'scn-swing-setups__tf--up';
  if (trend === 'down') return 'scn-swing-setups__tf--down';
  return 'scn-swing-setups__tf--range';
}

export function trendLabel(trend: string): string {
  if (trend === 'up') return '+';
  if (trend === 'down') return '−';
  return '±';
}

export function setupLabel(type: string, direction: string | null): string {
  const base = type.charAt(0).toUpperCase() + type.slice(1);
  if (type === 'watch' || !direction) return base === 'Watch' ? 'Watch' : base;
  const dir = direction === 'long' ? 'Long' : 'Short';
  return `${base} (${dir.toLowerCase()})`;
}

export function scoreBadgeVariant(
  score: string,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (score === 'high') return 'default';
  if (score === 'medium') return 'secondary';
  return 'outline';
}

export function PriceSessionBadge({
  label,
  basis,
}: {
  label?: string | null;
  basis?: string | null;
}) {
  if (!label || basis !== 'extended') return null;
  return (
    <span className="scn-swing-setups__session" title={`${label} (vs prior close)`}>
      {label}
    </span>
  );
}

export function formatTargets(t1: number | null, t2: number | null): string {
  if (t1 == null && t2 == null) return '—';
  const a = t1 != null ? t1.toFixed(2) : '—';
  const b = t2 != null ? t2.toFixed(2) : '—';
  return `${a} / ${b}`;
}

export function splitNotes(notes: string): string[] {
  return notes
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function SetupNotesList({ notes }: { notes: string }) {
  const items = splitNotes(notes);
  if (items.length <= 1) {
    return <p className="scn-swing-setups__notes-single">{items[0] ?? notes}</p>;
  }
  return (
    <ul className="scn-swing-setups__notes-list">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function ConfluenceChips({ confluence }: { confluence: string }) {
  const { m, w, d } = parseConfluence(confluence);
  return (
    <div className="scn-swing-setups__confluence" aria-label="Monthly, weekly, daily trend">
      <span className={`scn-swing-setups__tf ${trendChipClass(m)}`} title={`Month: ${m}`}>
        M{trendLabel(m)}
      </span>
      <span className={`scn-swing-setups__tf ${trendChipClass(w)}`} title={`Week: ${w}`}>
        W{trendLabel(w)}
      </span>
      <span className={`scn-swing-setups__tf ${trendChipClass(d)}`} title={`Day: ${d}`}>
        D{trendLabel(d)}
      </span>
    </div>
  );
}

type StockBarsPreviewPayload = {
  chart_symbol?: string;
  bars?: StockBarPoint[];
  bars_timeframe?: string;
  bars_error?: string;
};

export function SetupDetailChart({
  symbol,
  barsPreviewUrl,
}: {
  symbol: string;
  barsPreviewUrl: string;
}) {
  const [payload, setPayload] = React.useState<StockBarsPreviewPayload | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const url = new URL(barsPreviewUrl, window.location.origin);
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('cadence', '2h');
    url.searchParams.set('bars_limit', '120');

    setLoading(true);
    fetch(url.toString(), { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: StockBarsPreviewPayload) => {
        if (!cancelled) setPayload(data);
      })
      .catch(() => {
        if (!cancelled) {
          setPayload({
            chart_symbol: symbol,
            bars: [],
            bars_timeframe: '2Hour',
            bars_error: 'Could not load 2-hour chart.',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, barsPreviewUrl]);

  if (loading) {
    return (
      <aside className="scn-swing-setups__chart-wrap" aria-label="2-hour price chart">
        <p className="scn-swing-setups__chart-status">Loading 2-hour chart…</p>
      </aside>
    );
  }

  return (
    <aside className="scn-swing-setups__chart-wrap" aria-label="2-hour price chart">
      <h3 className="scn-swing-setups__detail-heading">2-hour chart</h3>
      <div className="scn-swing-setups__chart-inner">
        <StockBarsTile
          bars={payload?.bars ?? []}
          chips={[]}
          chartSymbol={payload?.chart_symbol ?? symbol}
          barsError={payload?.bars_error}
          barsTimeframe={payload?.bars_timeframe ?? '2Hour'}
        />
      </div>
    </aside>
  );
}

export function SetupDetailFields({ setup }: { setup: SetupRow }) {
  return (
    <div className="scn-swing-setups__detail-text ticker-setup-card__fields">
      <dl className="ticker-setup-card__meta">
        <div>
          <dt>Setup</dt>
          <dd>{setupLabel(setup.setup_type, setup.direction)}</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>
            <Badge variant={scoreBadgeVariant(setup.score)} className="scn-swing-setups__score">
              {setup.score.charAt(0).toUpperCase() + setup.score.slice(1)}
            </Badge>
          </dd>
        </div>
        <div>
          <dt>Confluence</dt>
          <dd>
            <ConfluenceChips confluence={setup.confluence} />
          </dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd className="scn-swing-setups__price">
            <span>{setup.last_price_formatted}</span>
            <span className={`scn-swing-setups__pct ${setup.percent_change_class}`}>
              {setup.percent_change_formatted}
            </span>
            <PriceSessionBadge label={setup.price_session_label} basis={setup.price_basis} />
            {setup.volume_gauge ? (
              <VolumeGauge gauge={setup.volume_gauge} compact />
            ) : setup.day_volume_formatted ? (
              <span className="scn-swing-setups__vol">Vol {setup.day_volume_formatted}</span>
            ) : null}
          </dd>
        </div>
        {setup.trigger_text && (
          <div>
            <dt>Trigger</dt>
            <dd>{setup.trigger_text}</dd>
          </div>
        )}
        {setup.invalidation && (
          <div>
            <dt>Invalidation</dt>
            <dd>{setup.invalidation}</dd>
          </div>
        )}
        {(setup.t1 != null || setup.t2 != null) && (
          <div>
            <dt>T1 / T2</dt>
            <dd>{formatTargets(setup.t1, setup.t2)}</dd>
          </div>
        )}
        {setup.rr != null && (
          <div>
            <dt>R:R</dt>
            <dd>{setup.rr.toFixed(2)}</dd>
          </div>
        )}
        {setup.sector && (
          <div>
            <dt>Sector</dt>
            <dd>{setup.sector}</dd>
          </div>
        )}
      </dl>
      {setup.notes && (
        <div>
          <h3 className="scn-swing-setups__detail-heading">Notes</h3>
          <SetupNotesList notes={setup.notes} />
        </div>
      )}
      {setup.news_headline && (
        <div>
          <h3 className="scn-swing-setups__detail-heading">News</h3>
          {setup.news_url ? (
            <a href={setup.news_url} rel="noopener noreferrer" target="_blank">
              {setup.news_headline}
            </a>
          ) : (
            <p>{setup.news_headline}</p>
          )}
        </div>
      )}
    </div>
  );
}
