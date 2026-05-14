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
}

const PAD_X = 8;
const PAD_Y = 10;
const SLOT = 10;
const BODY_W = 5;

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
  const span = hi - lo || 1;
  const pad = span * 0.04;
  const top = hi + pad;
  const bottom = lo - pad;
  const range = top - bottom || 1;

  const yPrice = (p: number) => PAD_Y + ((top - p) / range) * (h - PAD_Y * 2);

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

export default function StockBarsTile({ bars, chips, chartSymbol, barsError }: StockBarsTileProps) {
  const sym = (chartSymbol || '').trim().toUpperCase();

  return (
    <div className="relative w-full min-h-[200px] flex flex-col items-stretch justify-center pt-10 px-1">
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

      {sym ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 top-10 z-0 flex items-center justify-center"
          aria-hidden
        >
          <span
            className="select-none text-6xl font-bold uppercase leading-none tracking-tight text-foreground/[0.09] sm:text-7xl md:text-8xl dark:text-foreground/[0.11]"
          >
            {sym}
          </span>
        </div>
      ) : null}

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
    </div>
  );
}
