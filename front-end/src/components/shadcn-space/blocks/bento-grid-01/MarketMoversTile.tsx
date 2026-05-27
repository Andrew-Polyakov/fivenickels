import * as React from 'react';

import { ScrollArea } from '../../../ui/scroll-area';

export interface MarketMoverChipPayload {
  symbol: string;
  label: string;
  href: string;
  pct_formatted: string;
  pct_class: string;
  price_display: string;
}

export interface MarketMoversGroupPayload {
  winners: MarketMoverChipPayload[];
  loosers: MarketMoverChipPayload[];
  has_data: boolean;
}

export interface MarketMoverTabPayload {
  key: string;
  label: string;
  active: boolean;
  url: string;
}

export interface MarketMoversTileProps {
  marketMovers: MarketMoversGroupPayload;
  tabs: MarketMoverTabPayload[];
  sessionLabel?: string | null;
  priceBasis?: string | null;
}

function sessionBadgeTitle(label: string, priceBasis?: string | null): string {
  if (priceBasis === 'extended') {
    return `${label} (vs prior close)`;
  }
  return label;
}

function MoverChip({ chip }: { chip: MarketMoverChipPayload }) {
  return (
    <li className="market-movers__chip-item">
      <a className="ticker-chip ticker-chip--rail-stack" href={chip.href}>
        <span
          className={`ticker-chip__box ticker-chip__box--${chip.pct_class} ticker-chip__box--rail-stack`}
        >
          <span className="ticker-chip__rail-head">
            <span className="ticker-chip__label">{chip.label}</span>
            <span className="ticker-chip__pct">{chip.pct_formatted}</span>
          </span>
          <span className="ticker-chip__price">{chip.price_display}</span>
        </span>
      </a>
    </li>
  );
}

function MarketMoversBody({ marketMovers }: { marketMovers: MarketMoversGroupPayload }) {
  return (
    <div className="market-movers__body">
      <div className="market-movers__group">
        <p className="market-movers__group-title">Winners:</p>
        <ul className="market-movers__chip-list">
          {marketMovers.winners.map((chip) => (
            <MoverChip key={chip.symbol} chip={chip} />
          ))}
        </ul>
      </div>
      <div className="market-movers__group">
        <p className="market-movers__group-title">Loosers:</p>
        <ul className="market-movers__chip-list">
          {marketMovers.loosers.map((chip) => (
            <MoverChip key={chip.symbol} chip={chip} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function MarketMoversTile({
  marketMovers,
  tabs,
  sessionLabel,
  priceBasis,
}: MarketMoversTileProps) {
  return (
    <section
      className="market-movers market-movers--tile"
      data-market-movers-root
      aria-label="Market movers"
    >
      <div className="market-movers__card">
        <header className="market-movers__header">
          <div className="market-movers__title-row">
            <h2 className="market-movers__title">MARKET MOVERS</h2>
            {sessionLabel ? (
              <span
                className="market-movers__session"
                title={sessionBadgeTitle(sessionLabel, priceBasis)}
              >
                {sessionLabel}
              </span>
            ) : null}
          </div>
          <div className="market-movers__toggle-group" role="tablist" aria-label="Market movers region">
            {tabs.map((tab) => (
              <a
                key={tab.key}
                href={tab.url}
                className={
                  tab.active
                    ? 'market-movers__toggle-item market-movers__toggle-item--active'
                    : 'market-movers__toggle-item'
                }
                data-market-movers-region-link
                role="tab"
                aria-selected={tab.active ? 'true' : 'false'}
              >
                {tab.label}
              </a>
            ))}
          </div>
        </header>

        {marketMovers.has_data ? (
          <ScrollArea className="market-movers__body-scroll">
            <MarketMoversBody marketMovers={marketMovers} />
          </ScrollArea>
        ) : (
          <p className="market-movers__empty">No market mover data yet.</p>
        )}
      </div>
    </section>
  );
}
