import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import {
  ConfluenceChips,
  PriceSessionBadge,
  SetupDetailChart,
  SetupNotesList,
  formatTargets,
  parseJsonScript,
  scoreBadgeVariant,
  setupLabel,
  type SetupRow,
  VolumeGauge,
} from './swing-setup-shared';

export type { SetupRow };

function SwingSetupsTable({
  setups,
  barsPreviewUrl,
}: {
  setups: SetupRow[];
  barsPreviewUrl: string;
}) {
  const [data] = React.useState(setups);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'score', desc: false }]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [scoreFilter, setScoreFilter] = React.useState<string>('all');
  const [directionFilter, setDirectionFilter] = React.useState<string>('all');
  const [setupFilter, setSetupFilter] = React.useState<string>('all');
  const [expandedId, setExpandedId] = React.useState<number | null>(null);

  const filteredData = React.useMemo(() => {
    return data.filter((row) => {
      if (scoreFilter !== 'all' && row.score !== scoreFilter) return false;
      if (directionFilter === 'none' && row.direction) return false;
      if (directionFilter === 'long' && row.direction !== 'long') return false;
      if (directionFilter === 'short' && row.direction !== 'short') return false;
      if (setupFilter !== 'all' && row.setup_type !== setupFilter) return false;
      return true;
    });
  }, [data, scoreFilter, directionFilter, setupFilter]);

  const columns = React.useMemo<ColumnDef<SetupRow>[]>(
    () => [
      {
        id: 'symbol',
        accessorKey: 'symbol',
        header: 'Ticker',
        cell: ({ row }) => {
          const r = row.original;
          const href =
            r.ticker_href ||
            `/ticker/${encodeURIComponent(r.symbol.toLowerCase())}/`;
          return (
            <a href={href} className="scn-swing-setups__symbol-link">
              <strong>{r.symbol}</strong>
              {r.stock_name && <span className="scn-swing-setups__symbol-sub">{r.stock_name}</span>}
            </a>
          );
        },
      },
      {
        id: 'setup',
        accessorFn: (r) => setupLabel(r.setup_type, r.direction),
        header: 'Setup',
        cell: ({ row }) => (
          <span className="scn-swing-setups__setup-label">
            {setupLabel(row.original.setup_type, row.original.direction)}
          </span>
        ),
      },
      {
        id: 'confluence',
        accessorKey: 'confluence',
        header: 'M / W / D',
        enableSorting: false,
        cell: ({ row }) => <ConfluenceChips confluence={row.original.confluence} />,
      },
      {
        id: 'score',
        accessorKey: 'score',
        header: 'Score',
        sortingFn: (a, b) => {
          const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
          return (order[a.original.score] ?? 3) - (order[b.original.score] ?? 3);
        },
        cell: ({ row }) => (
          <Badge variant={scoreBadgeVariant(row.original.score)} className="scn-swing-setups__score">
            {row.original.score.charAt(0).toUpperCase() + row.original.score.slice(1)}
          </Badge>
        ),
      },
      {
        id: 'price',
        header: 'Price',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="scn-swing-setups__price">
              <span>{r.last_price_formatted}</span>
              <span className={`scn-swing-setups__pct ${r.percent_change_class}`}>
                {r.percent_change_formatted}
              </span>
              <PriceSessionBadge label={r.price_session_label} basis={r.price_basis} />
              {r.volume_gauge ? (
                <VolumeGauge gauge={r.volume_gauge} compact />
              ) : r.day_volume_formatted ? (
                <span className="scn-swing-setups__vol">Vol {r.day_volume_formatted}</span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'trigger',
        accessorKey: 'trigger_text',
        header: 'Trigger',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="scn-swing-setups__cell-clamp" title={row.original.trigger_text ?? undefined}>
            {row.original.trigger_text || '—'}
          </span>
        ),
      },
      {
        id: 'invalidation',
        accessorKey: 'invalidation',
        header: 'Invalidation',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="scn-swing-setups__cell-clamp" title={row.original.invalidation ?? undefined}>
            {row.original.invalidation || '—'}
          </span>
        ),
      },
      {
        id: 'targets',
        header: 'T1 / T2',
        enableSorting: false,
        cell: ({ row }) => formatTargets(row.original.t1, row.original.t2),
      },
      {
        id: 'rr',
        accessorKey: 'rr',
        header: 'R:R',
        cell: ({ row }) => (row.original.rr != null ? row.original.rr.toFixed(2) : '—'),
      },
      {
        id: 'sector',
        accessorKey: 'sector',
        header: 'Sector',
        cell: ({ row }) => row.original.sector || '—',
      },
      {
        id: 'details',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            className="scn-swing-setups__expand-btn"
            aria-expanded={expandedId === row.original.id}
            onClick={() =>
              setExpandedId((prev) => (prev === row.original.id ? null : row.original.id))
            }
          >
            {expandedId === row.original.id ? 'Less' : 'More'}
          </button>
        ),
      },
    ],
    [expandedId],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _colId, filterValue) => {
      const q = String(filterValue).toLowerCase();
      if (!q) return true;
      const r = row.original;
      const hay = [
        r.symbol,
        r.stock_name,
        r.sector,
        r.industry,
        r.setup_type,
        r.notes,
        r.trigger_text,
        r.news_headline,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    },
  });

  const colCount = columns.length;

  if (setups.length === 0) {
    return (
      <div className="scn-swing-setups scn-swing-setups--empty">
        <p>No pattern scans in the crawler database yet.</p>
        <p className="scn-swing-setups__hint">
          Run: <code>dotnet run --project tools/StockCrawler -- patterns TICKER1 TICKER2</code>
        </p>
      </div>
    );
  }

  return (
    <div className="scn-swing-setups">
      <div className="scn-swing-setups__toolbar">
        <div className="scn-search-wrap scn-swing-setups__search">
          <svg
            className="scn-search-wrap__icon"
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
            className="scn-search-wrap__input"
            placeholder="Search symbol, sector, notes…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>

        <span className="scn-swing-setups__count">
          {table.getFilteredRowModel().rows.length} setup
          {table.getFilteredRowModel().rows.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="scn-swing-setups__filters">
        <ToggleGroup
          value={scoreFilter}
          onValueChange={setScoreFilter}
          className="scn-swing-setups__filter-group"
        >
          <ToggleGroupItem value="all">All scores</ToggleGroupItem>
          <ToggleGroupItem value="high">High</ToggleGroupItem>
          <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
          <ToggleGroupItem value="low">Low</ToggleGroupItem>
        </ToggleGroup>

        <ToggleGroup
          value={directionFilter}
          onValueChange={setDirectionFilter}
          className="scn-swing-setups__filter-group"
        >
          <ToggleGroupItem value="all">All dirs</ToggleGroupItem>
          <ToggleGroupItem value="long">Long</ToggleGroupItem>
          <ToggleGroupItem value="short">Short</ToggleGroupItem>
          <ToggleGroupItem value="none">Watch</ToggleGroupItem>
        </ToggleGroup>

        <ToggleGroup
          value={setupFilter}
          onValueChange={setSetupFilter}
          className="scn-swing-setups__filter-group"
        >
          <ToggleGroupItem value="all">All setups</ToggleGroupItem>
          <ToggleGroupItem value="continuation">Continuation</ToggleGroupItem>
          <ToggleGroupItem value="breakout">Breakout</ToggleGroupItem>
          <ToggleGroupItem value="reversal">Reversal</ToggleGroupItem>
          <ToggleGroupItem value="watch">Watch</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Table className="scn-swing-setups__table">
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.getCanSort() ? 'scn-swing-setups__th-sortable' : undefined}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === 'asc' ? ' ↑' : null}
                  {header.column.getIsSorted() === 'desc' ? ' ↓' : null}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                <TableRow>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                {expandedId === row.original.id && (
                  <TableRow className="scn-swing-setups__detail-row">
                    <TableCell colSpan={colCount} className="scn-swing-setups__detail-cell">
                      <div className="scn-swing-setups__detail-layout">
                        {barsPreviewUrl && (
                          <SetupDetailChart
                            symbol={row.original.symbol}
                            barsPreviewUrl={barsPreviewUrl}
                          />
                        )}
                        <div className="scn-swing-setups__detail-text">
                          {row.original.notes && (
                            <div>
                              <h3 className="scn-swing-setups__detail-heading">Notes</h3>
                              <SetupNotesList notes={row.original.notes} />
                            </div>
                          )}
                          {row.original.news_headline && (
                            <div>
                              <h3 className="scn-swing-setups__detail-heading">News</h3>
                              {row.original.news_url ? (
                                <a href={row.original.news_url} rel="noopener noreferrer" target="_blank">
                                  {row.original.news_headline}
                                </a>
                              ) : (
                                <p>{row.original.news_headline}</p>
                              )}
                            </div>
                          )}
                          {row.original.industry && (
                            <div>
                              <h3 className="scn-swing-setups__detail-heading">Industry</h3>
                              <p>{row.original.industry}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={colCount} className="scn-table__empty">
                No setups match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

const swingSetupsRoots = new WeakMap<HTMLElement, Root>();

export function mountShadcnSwingSetups(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-swing-setups]').forEach((host) => {
    if (host.dataset['shadcnSwingSetupsBound'] === '1') return;
    const setupsId = host.dataset['setupsJsonId'];
    if (!setupsId) return;
    const setups = parseJsonScript<SetupRow[]>(setupsId) ?? [];
    const barsPreviewUrl =
      host.dataset['stockBarsPreviewUrl'] ?? '/inline/taxonomy/stock-bars-preview/';

    host.dataset['shadcnSwingSetupsBound'] = '1';
    let root = swingSetupsRoots.get(host);
    if (!root) {
      root = createRoot(host);
      swingSetupsRoots.set(host, root);
    }
    root.render(
      <SwingSetupsTable setups={setups} barsPreviewUrl={barsPreviewUrl} />,
    );
  });
}
