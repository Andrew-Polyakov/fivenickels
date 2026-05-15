import * as React from 'react';

export interface ForexQuotePayload {
  label: string;
  mid_display: string;
  pct_formatted: string;
  pct_class: string;
}

export interface ForexStripTileProps {
  quotes: ForexQuotePayload[];
}

export default function ForexStripTile({ quotes }: ForexStripTileProps) {
  if (!quotes.length) {
    return null;
  }
  return (
    <section className="forex-strip forex-strip--section" aria-label="Major FX pairs">
      <div className="forex-strip__card">
        <ul className="forex-strip__grid">
          {quotes.map((row) => (
            <li key={row.label} className="forex-strip__cell">
              <div
                className={`ticker-chip__box forex-strip__box ticker-chip__box--${row.pct_class}`}
              >
                <div className="forex-strip__head-line">
                  <span className="ticker-chip__label forex-strip__label">{row.label}</span>
                  <span className="ticker-chip__pct">{row.pct_formatted}</span>
                </div>
                <div className="forex-strip__quote-line">
                  <span className="forex-strip__mid">{row.mid_display}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
