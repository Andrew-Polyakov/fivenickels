import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  SetupDetailChart,
  SetupDetailFields,
  parseJsonScript,
  type SetupRow,
} from './swing-setup-shared';

export type RelatedNewsItem = {
  title: string;
  url: string;
  date: string | null;
  catalyst: string | null;
};

export type DividendEventRow = {
  type_label: string;
  ex_date_display: string;
  record_date_display: string;
  payable_date_display: string;
  rate_display: string;
};

export type CorporateEventRow = DividendEventRow & {
  tags_display: string;
};

function RelatedNewsTab({ items }: { items: RelatedNewsItem[] }) {
  if (items.length === 0) {
    return (
      <p className="ticker-tabs__empty">
        No related articles tagged with this ticker yet.
      </p>
    );
  }

  return (
    <div className="ticker-related__grid">
      {items.map((item) => {
        const tileClass =
          item.catalyst === 'Bullish'
            ? ' ticker-related__tile--bullish'
            : item.catalyst === 'Bearish'
              ? ' ticker-related__tile--bearish'
              : '';
        return (
          <article key={item.url} className={`ticker-related__tile${tileClass}`}>
            <a href={item.url} className="ticker-related__link">
              <h3 className="ticker-related__title">{item.title}</h3>
              {item.date && <p className="ticker-related__date">{item.date}</p>}
            </a>
          </article>
        );
      })}
    </div>
  );
}

function SwingSetupTab({
  setup,
  symbol,
  barsPreviewUrl,
  swingSetupsPageUrl,
}: {
  setup: SetupRow | null;
  symbol: string;
  barsPreviewUrl: string;
  swingSetupsPageUrl: string;
}) {
  if (!setup) {
    return (
      <div className="ticker-tabs__empty">
        <p>No swing setup in the crawler database for {symbol} yet.</p>
        <p className="ticker-tabs__hint">
          Run:{' '}
          <code>dotnet run --project tools/StockCrawler -- patterns {symbol}</code>
        </p>
        <p>
          <a href={swingSetupsPageUrl.split('?')[0]} className="ticker-tabs__link">
            View full setups watchlist
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="ticker-setup-card">
      {setup.scan_started_utc && (
        <p className="ticker-setup-card__scan-meta">
          Scan {setup.scan_started_utc}
          {' · '}
          <a href={swingSetupsPageUrl} className="ticker-tabs__link">
            View full watchlist
          </a>
        </p>
      )}
      <div className="scn-swing-setups__detail-layout">
        {barsPreviewUrl && (
          <SetupDetailChart symbol={symbol} barsPreviewUrl={barsPreviewUrl} />
        )}
        <SetupDetailFields setup={setup} />
      </div>
    </div>
  );
}

function EventsTab({
  dividendRows,
  eventRows,
}: {
  dividendRows: DividendEventRow[];
  eventRows: CorporateEventRow[];
}) {
  if (dividendRows.length === 0 && eventRows.length === 0) {
    return (
      <p className="ticker-tabs__empty">
        No dividend or corporate events synced for this ticker yet. Run{' '}
        <code>manage.py sync_alpaca_market</code> (or{' '}
        <code>sync_alpaca_market SYMBOL</code>) to refresh from Alpaca.
      </p>
    );
  }

  return (
    <div className="ticker-events">
      {dividendRows.length > 0 && (
        <section className="ticker-events__section" aria-label="Upcoming dividends">
          <h3 className="ticker-events__heading">Upcoming dividends</h3>
          <div className="ticker-events__table-wrap">
            <table className="ticker-dividends__table">
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Ex-date</th>
                  <th scope="col">Record</th>
                  <th scope="col">Payable</th>
                  <th scope="col" className="ticker-dividends__th-rate">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {dividendRows.map((row) => (
                  <tr key={`${row.type_label}-${row.ex_date_display}-${row.rate_display}`}>
                    <td>{row.type_label}</td>
                    <td>{row.ex_date_display}</td>
                    <td>{row.record_date_display}</td>
                    <td>{row.payable_date_display}</td>
                    <td className="ticker-dividends__rate">{row.rate_display}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {eventRows.length > 0 && (
        <section className="ticker-events__section" aria-label="Corporate events">
          <h3 className="ticker-events__heading">Corporate events</h3>
          <div className="ticker-events__table-wrap">
            <table className="ticker-dividends__table">
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Ex-date</th>
                  <th scope="col">Record</th>
                  <th scope="col">Payable</th>
                  <th scope="col" className="ticker-dividends__th-rate">
                    Rate
                  </th>
                  <th scope="col">Tags</th>
                </tr>
              </thead>
              <tbody>
                {eventRows.map((row) => (
                  <tr
                    key={`${row.type_label}-${row.ex_date_display}-${row.rate_display}-${row.tags_display}`}
                  >
                    <td>{row.type_label}</td>
                    <td>{row.ex_date_display}</td>
                    <td>{row.record_date_display}</td>
                    <td>{row.payable_date_display}</td>
                    <td className="ticker-dividends__rate">{row.rate_display}</td>
                    <td>{row.tags_display || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function TickerTabs({
  related,
  setup,
  dividends,
  events,
  symbol,
  barsPreviewUrl,
  swingSetupsPageUrl,
}: {
  related: RelatedNewsItem[];
  setup: SetupRow | null;
  dividends: DividendEventRow[];
  events: CorporateEventRow[];
  symbol: string;
  barsPreviewUrl: string;
  swingSetupsPageUrl: string;
}) {
  return (
    <div className="ticker-tabs">
      <h2 className="ticker-tabs__heading">News &amp; setups</h2>
      <Tabs defaultValue="news">
        <TabsList className="ticker-tabs__list">
          <TabsTrigger value="news">Related news</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="setups">Swing setups</TabsTrigger>
        </TabsList>
        <TabsContent value="news" className="ticker-tabs__panel">
          <RelatedNewsTab items={related} />
        </TabsContent>
        <TabsContent value="events" className="ticker-tabs__panel">
          <EventsTab dividendRows={dividends} eventRows={events} />
        </TabsContent>
        <TabsContent value="setups" className="ticker-tabs__panel">
          <SwingSetupTab
            setup={setup}
            symbol={symbol}
            barsPreviewUrl={barsPreviewUrl}
            swingSetupsPageUrl={swingSetupsPageUrl}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const tickerTabsRoots = new WeakMap<HTMLElement, Root>();

function isTickerTabsMounted(host: HTMLElement): boolean {
  return Boolean(host.querySelector('.ticker-tabs'));
}

export function unmountShadcnTickerTabs(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-shadcn-ticker-tabs]').forEach((host) => {
    const reactRoot = tickerTabsRoots.get(host);
    if (reactRoot) {
      reactRoot.unmount();
      tickerTabsRoots.delete(host);
    }
    delete host.dataset['shadcnTickerTabsBound'];
  });
}

export function mountShadcnTickerTabs(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-ticker-tabs]').forEach((host) => {
    if (host.dataset['shadcnTickerTabsBound'] === '1' && isTickerTabsMounted(host)) {
      return;
    }
    if (host.dataset['shadcnTickerTabsBound'] === '1') {
      delete host.dataset['shadcnTickerTabsBound'];
      const stale = tickerTabsRoots.get(host);
      if (stale) {
        stale.unmount();
        tickerTabsRoots.delete(host);
      }
    }

    const relatedId = host.dataset['relatedJsonId'];
    const setupId = host.dataset['setupJsonId'];
    const dividendsId = host.dataset['dividendsJsonId'];
    const eventsId = host.dataset['eventsJsonId'];
    if (!relatedId || !setupId || !dividendsId || !eventsId) return;

    const related = parseJsonScript<RelatedNewsItem[]>(relatedId) ?? [];
    const setupRaw = parseJsonScript<SetupRow | null>(setupId);
    const dividends = parseJsonScript<DividendEventRow[]>(dividendsId) ?? [];
    const events = parseJsonScript<CorporateEventRow[]>(eventsId) ?? [];
    const setup = setupRaw && typeof setupRaw === 'object' && 'id' in setupRaw ? setupRaw : null;

    const symbol = host.dataset['symbol'] ?? '';
    const barsPreviewUrl =
      host.dataset['stockBarsPreviewUrl'] ?? '/inline/taxonomy/stock-bars-preview/';
    const swingSetupsPageUrl =
      host.dataset['swingSetupsUrl'] ?? '/trading/setups/';

    let root = tickerTabsRoots.get(host);
    if (!root) {
      root = createRoot(host);
      tickerTabsRoots.set(host, root);
    }
    root.render(
      <TickerTabs
        related={related}
        setup={setup}
        dividends={dividends}
        events={events}
        symbol={symbol}
        barsPreviewUrl={barsPreviewUrl}
        swingSetupsPageUrl={swingSetupsPageUrl}
      />,
    );
    host.dataset['shadcnTickerTabsBound'] = '1';
  });
}
