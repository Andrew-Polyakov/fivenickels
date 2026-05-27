import * as React from 'react';

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '../components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { cn } from '../lib/utils';

export type ProfileTickerRow = {
  id: number;
  symbol: string;
  label: string;
  exchange: string;
  enabled: boolean;
  carousel_pinned: boolean;
  sort_order: number;
  day_volume: number | null;
  percent_change: number | null;
  last_price: number | null;
  fetched_at: string | null;
};

type TickerFilter = 'all' | 'carousel' | 'pinned';

const PAGE_SIZE = 50;

function getCsrfToken(explicitToken: string): string {
  if (explicitToken) return explicitToken;
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function formatVolume(vol: number | null): string {
  if (vol == null) return '—';
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return String(vol);
}

function formatPct(pct: number | null): string {
  if (pct == null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function buildPageTokens(totalPages: number, currentPage: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page > 1 && page < totalPages) {
      pages.add(page);
    }
  }
  const orderedPages = Array.from(pages).sort((a, b) => a - b);
  const output: Array<number | 'ellipsis'> = [];
  for (let index = 0; index < orderedPages.length; index += 1) {
    const page = orderedPages[index];
    const previous = orderedPages[index - 1];
    if (index > 0 && previous !== undefined && page - previous > 1) {
      output.push('ellipsis');
    }
    output.push(page);
  }
  return output;
}

export function ProfileTickersTab({
  listUrl,
  csrfToken,
}: {
  listUrl: string;
  csrfToken: string;
}) {
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<TickerFilter>('carousel');
  const [pageIndex, setPageIndex] = React.useState(0);
  const [rows, setRows] = React.useState<ProfileTickerRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [carouselCount, setCarouselCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [savingId, setSavingId] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(listUrl, window.location.origin);
      if (query.trim()) {
        url.searchParams.set('q', query.trim());
      }
      if (filter === 'carousel') {
        url.searchParams.set('carousel_only', '1');
      } else if (filter === 'pinned') {
        url.searchParams.set('pinned_only', '1');
      }
      url.searchParams.set('offset', String(pageIndex * PAGE_SIZE));
      url.searchParams.set('limit', String(PAGE_SIZE));
      const res = await fetch(url.toString(), { credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error(`Failed to load tickers (${res.status})`);
      }
      const data = (await res.json()) as {
        tickers?: ProfileTickerRow[];
        total?: number;
        carousel_count?: number;
      };
      setRows(data.tickers ?? []);
      setTotal(data.total ?? 0);
      setCarouselCount(data.carousel_count ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [listUrl, query, filter, pageIndex]);

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 300);
    return () => window.clearTimeout(t);
  }, [load]);

  React.useEffect(() => {
    setPageIndex(0);
  }, [query, filter]);

  const patchTicker = async (id: number, body: Record<string, unknown>) => {
    setSavingId(id);
    try {
      const base = listUrl.replace(/\/$/, '');
      const res = await fetch(`${base}/${id}/`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(csrfToken),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Update failed (${res.status})`);
      }
      const data = (await res.json()) as { ticker: ProfileTickerRow };
      setRows((prev) => prev.map((r) => (r.id === id ? data.ticker : r)));
      if ('enabled' in body || 'carousel_pinned' in body) {
        void load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSavingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageTokens = buildPageTokens(totalPages, pageIndex + 1);
  const start = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const end = Math.min(total, (pageIndex + 1) * PAGE_SIZE);

  return (
    <div className="scn-profile-tickers">
      <p className="scn-profile-tickers__lede">
        Control which symbols appear in the <strong>header ticker carousel</strong>. Check{' '}
        <strong>In carousel</strong> to show a symbol; use <strong>Pin</strong> to keep it when
        running <code>sync_alpaca_market</code> (top 25 by volume plus pins). Currently{' '}
        <strong>{carouselCount}</strong> in carousel.
      </p>
      <div className="scn-profile-tickers__toolbar">
        <Input
          className="scn-profile-tickers__search"
          placeholder="Search symbol or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="scn-profile-tickers__filters" role="tablist" aria-label="Ticker list filter">
          {(
            [
              ['carousel', 'In carousel'],
              ['pinned', 'Pinned'],
              ['all', 'All tickers'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={filter === value ? 'default' : 'outline'}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {error && <p className="scn-profile-tickers__error">{error}</p>}
      {loading ? (
        <p className="scn-profile-tickers__status">Loading…</p>
      ) : (
        <>
          <div className="scn-profile-tickers__table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Exch</TableHead>
                  <TableHead>Vol</TableHead>
                  <TableHead>Chg</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>In carousel</TableHead>
                  <TableHead>Pin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(row.enabled && 'scn-profile-tickers__row--carousel')}
                  >
                    <TableCell>
                      <a
                        href={`/ticker/${row.symbol.toLowerCase()}/`}
                        className="scn-profile-tickers__sym"
                      >
                        {row.symbol}
                      </a>
                    </TableCell>
                    <TableCell className="scn-profile-tickers__label">{row.label}</TableCell>
                    <TableCell>{row.exchange || '—'}</TableCell>
                    <TableCell>{formatVolume(row.day_volume)}</TableCell>
                    <TableCell
                      className={cn(
                        row.percent_change != null && row.percent_change > 0 && 'is-up',
                        row.percent_change != null && row.percent_change < 0 && 'is-down',
                      )}
                    >
                      {formatPct(row.percent_change)}
                    </TableCell>
                    <TableCell className="scn-profile-tickers__order">{row.sort_order}</TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        disabled={savingId === row.id}
                        onChange={(e) =>
                          void patchTicker(row.id, { enabled: e.target.checked })
                        }
                        aria-label={`In carousel ${row.symbol}`}
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={row.carousel_pinned}
                        disabled={savingId === row.id}
                        onChange={(e) =>
                          void patchTicker(row.id, { carousel_pinned: e.target.checked })
                        }
                        aria-label={`Pin ${row.symbol}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length === 0 && (
              <p className="scn-profile-tickers__empty">
                No tickers match this filter. Run <code>manage.py sync_alpaca_market</code> to
                import symbols.
              </p>
            )}
          </div>
          <div className="scn-profile-pagination">
            <p className="scn-profile-pagination__summary">
              {start}–{end} of {total}
            </p>
            {totalPages > 1 && (
              <Pagination className="scn-profile-pagination__nav">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (pageIndex > 0) setPageIndex(pageIndex - 1);
                      }}
                      className={pageIndex === 0 ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                  {pageTokens.map((token, idx) =>
                    token === 'ellipsis' ? (
                      <PaginationItem key={`e-${idx}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={token}>
                        <PaginationLink
                          href="#"
                          isActive={token === pageIndex + 1}
                          onClick={(e) => {
                            e.preventDefault();
                            setPageIndex(token - 1);
                          }}
                        >
                          {token}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (pageIndex < totalPages - 1) setPageIndex(pageIndex + 1);
                      }}
                      className={
                        pageIndex >= totalPages - 1 ? 'pointer-events-none opacity-50' : ''
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </>
      )}
    </div>
  );
}
