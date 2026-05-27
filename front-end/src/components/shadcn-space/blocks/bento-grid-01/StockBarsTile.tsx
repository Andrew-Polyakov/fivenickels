import * as React from 'react';

/** Mirrors Django ``home.alpaca_bars_client`` / JSON payload. */
export interface StockBarPoint {
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

export interface StockBarsTileProps {
  bars: StockBarPoint[];
  chips: StockChipPayload[];
  chartSymbol: string;
  barsError?: string;
  /** Alpaca timeframe string (e.g. ``1Day``) — shown as Daily / Weekly / … */
  barsTimeframe?: string;
}

const PAD_X = 8;
const PAD_Y = 10;
const SLOT = 10;
const BODY_W = 5;

function formatBarsCadence(timeframe: string | undefined): string {
  if (!timeframe?.trim()) {
    return '';
  }
  const u = timeframe.trim();
  const labels: Record<string, string> = {
    '1Day': 'Daily',
    '1D': 'Daily',
    '1Week': 'Weekly',
    '1W': 'Weekly',
    '1Month': 'Monthly',
    '1Mo': 'Monthly',
    '3Month': 'Quarterly',
    '1Year': 'Yearly',
    '1Hour': 'Hourly',
    '1H': 'Hourly',
    '2Hour': '2-hour',
    '2H': '2-hour',
    '1Min': '1-minute',
  };
  return labels[u] ?? u;
}

/** Map price to SVG y (higher price → smaller y). Log scale when all prices are positive. */
function buildLogPriceToY(hi: number, lo: number, chartHeight: number): (price: number) => number {
  const plotH = chartHeight - PAD_Y * 2;
  if (hi <= 0 || lo <= 0) {
    const span = hi - lo || 1;
    const pad = span * 0.04;
    const top = hi + pad;
    const bottom = lo - pad;
    const range = top - bottom || 1;
    return (p: number) => PAD_Y + ((top - p) / range) * plotH;
  }
  const padFactor = 1.04;
  const top = hi * padFactor;
  const bottom = lo / padFactor;
  const logTop = Math.log(top);
  const logBottom = Math.log(bottom);
  const logRange = logTop - logBottom || 1;
  const floor = bottom * 1e-6;
  return (p: number) => {
    const clamped = Math.max(p, floor);
    return PAD_Y + ((logTop - Math.log(clamped)) / logRange) * plotH;
  };
}

function StockBarsSvg({ bars }: { bars: StockBarPoint[] }) {
  const n = bars.length;
  const innerW = Math.max(n * SLOT, 40);
  const w = innerW + PAD_X * 2;
  const h = 160;

  let hi = -Infinity;
  let lo = Infinity;
  for (const b of bars) {
    hi = Math.max(hi, b.h);
    lo = Math.min(lo, b.l);
  }

  const yPrice = buildLogPriceToY(hi, lo, h);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full max-w-full h-[168px] text-foreground"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {bars.map((b, i) => {
        const cx = PAD_X + i * SLOT + SLOT / 2;
        const yHi = yPrice(b.h);
        const yLo = yPrice(b.l);
        const yO = yPrice(b.o);
        const yC = yPrice(b.c);
        const yTop = Math.min(yO, yC);
        const yBot = Math.max(yO, yC);
        const bodyH = Math.max(yBot - yTop, 0.8);
        const bull = b.c >= b.o;
        const stroke = bull ? 'hsl(142 76% 36%)' : 'hsl(0 72% 51%)';
        const fill = bull ? 'hsl(142 71% 45% / 0.85)' : 'hsl(0 70% 55% / 0.85)';
        return (
          <g key={`${b.t}-${i}`}>
            <line
              x1={cx}
              x2={cx}
              y1={yHi}
              y2={yLo}
              stroke={stroke}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={cx - BODY_W / 2}
              y={yTop}
              width={BODY_W}
              height={bodyH}
              fill={fill}
              stroke={stroke}
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function StockBarsTile({
  bars,
  chips,
  chartSymbol,
  barsError,
  barsTimeframe,
}: StockBarsTileProps) {
  const sym = (chartSymbol || '').trim().toUpperCase();
  const cadenceLabel =
    formatBarsCadence(barsTimeframe) || (bars.length > 0 ? 'Daily' : '');
  const showMeta = Boolean(cadenceLabel);

  const padTop = chips.length > 0 ? 'pt-10' : 'pt-1';

  return (
    <div className={`relative w-full min-h-[200px] flex flex-col items-stretch justify-center px-1 ${padTop}`}>
      <div className="absolute left-2 top-2 z-20 flex flex-row flex-wrap gap-2 max-w-[calc(100%-0.5rem)]">
        {chips.map((chip, i) => (
          <a key={`${chip.symbol}-${i}`} href={chip.href} className="ticker-chip">
            <span className={`ticker-chip__box ticker-chip__box--${chip.pct_class}`}>
              <span className="ticker-chip__label">{chip.label}</span>
              <span className="ticker-chip__pct">{chip.pct_formatted}</span>
            </span>
          </a>
        ))}
      </div>

      <div className="relative z-10 w-full">
        {bars.length === 0 ? (
          <div className="text-muted-foreground text-sm text-center px-4 py-6">
            {barsError
              ? barsError
              : sym
                ? `No bar data for ${sym}.`
                : 'Add stock symbols in the CMS to show bars.'}
          </div>
        ) : (
          <StockBarsSvg bars={bars} />
        )}
      </div>

      {showMeta ? (
        <div
          className="pointer-events-none absolute bottom-2 left-2 z-[15] max-w-[min(100%,16rem)] text-left text-xs leading-snug text-muted-foreground font-medium tabular-nums"
          aria-label={cadenceLabel || undefined}
        >
          {cadenceLabel}
        </div>
      ) : null}
    </div>
  );
}
