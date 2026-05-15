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

import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { PenIcon } from '../components/ui/pen-icon';
import { Dialog, DialogContent, DialogTrigger, DialogClose, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { RteEditor } from '../components/ui/rte-editor';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { FxBrokerCardView, type FxBrokerPayload } from './shadcn-fx-broker-card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '../components/ui/carousel';

export type BrokerRow = {
  id: number;
  rank: number;
  broker_name: string;
  favicon_url: string;
  overall_rating: number;
  reviews: number;
  broker_type: string;
  regulation: string;
  min_deposit: number;
  leverage: string;
  page_url: string;
  best_for: string;
};

type Country = { code: string; name: string };

type EditPopoverProps = {
  row: BrokerRow;
  updateUrl: string;
  onSaved: (updated: BrokerRow) => void;
};

function EditPopover({ row, updateUrl, onSaved }: EditPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<BrokerRow>({ ...row });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) { setDraft({ ...row }); setError(''); }
  }, [open, row]);

  function field(label: string, key: keyof BrokerRow, type = 'text') {
    return (
      <div className="scn-broker-edit__field">
        <Label htmlFor={`bef-${key}`} className="scn-broker-edit__label">{label}</Label>
        <Input
          id={`bef-${key}`}
          type={type}
          step={type === 'number' ? 'any' : undefined}
          value={draft[key] as string | number}
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw;
            setDraft((prev) => ({ ...prev, [key]: parsed }));
          }}
        />
      </div>
    );
  }

  async function handleSave() {
    setSaving(true); setError('');
    const base = updateUrl.replace('/0/', `/${row.id}/`);
    const body = draft;
    try {
      const csrf = (document.querySelector<HTMLInputElement>('input[name="csrfmiddlewaretoken"]')?.value) ?? '';
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? 'Save failed');
      else { onSaved(draft); setOpen(false); }
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="scn-broker-edit-trigger" aria-label="Edit broker" title="Edit">
          <PenIcon />
        </button>
      </DialogTrigger>
      <DialogContent className="scn-broker-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit broker</DialogTitle>
        </DialogHeader>
        <DialogClose className="scn-dialog-close">✕</DialogClose>
        <FxBrokerCardView data={{
          kind: 'fxbroker',
          brokerName: draft.broker_name,
          faviconUrl: draft.favicon_url || undefined,
          overallRating: draft.overall_rating,
          pageUrl: draft.page_url || undefined,
        } satisfies FxBrokerPayload} />
        <div className="scn-broker-edit__grid">
          {field('Name', 'broker_name')}
          {field('Favicon URL', 'favicon_url')}
          {field('Reviews', 'reviews', 'number')}
          {field('Type', 'broker_type')}
          {field('Regulation', 'regulation')}
          {field('Min Deposit ($)', 'min_deposit', 'number')}
          {field('Leverage', 'leverage')}
          {field('Page URL', 'page_url')}
          <div className="scn-broker-edit__field scn-broker-edit__field--full">
            <Label className="scn-broker-edit__label">Best for</Label>
            <RteEditor
              key={String(open)}
              initialValue={draft.best_for}
              placeholder="Describe who this broker is best for…"
              onChange={v => setDraft(prev => ({ ...prev, best_for: v }))}
            />
          </div>
        </div>
        {error && <p className="scn-broker-edit__error">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" className="scn-broker-edit__cancel" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="scn-broker-edit__save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CtaCell({ label, buttonText, url }: { label: string; buttonText: string; url: string }) {
  if (!url && !label && !buttonText) return null;
  return (
    <div className="scn-broker-cta">
      {label && <span className="scn-broker-cta__label">{label}</span>}
      {url && buttonText && (
        <a href={url} className="scn-broker-cta__btn" target="_blank" rel="noopener noreferrer">
          {buttonText}
        </a>
      )}
    </div>
  );
}

function buildColumns(
  isAdmin: boolean,
  updateUrl: string,
  countryCode: string,
  expandedId: number | null,
  onToggleExpand: (id: number) => void,
  onRowUpdate: (updated: BrokerRow) => void,
  ctaLabel: string,
  ctaButtonText: string,
  ctaUrl: string,
): ColumnDef<BrokerRow>[] {
  return [
    {
      accessorKey: 'broker_name',
      header: ({ column }) => (
        <Button variant="ghost" className="scn-table__sort-btn" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Forex Broker {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '↕'}
        </Button>
      ),
      cell: ({ row }) => (
        <span className="scn-broker-name">
          {isAdmin && (
            <EditPopover row={row.original} updateUrl={updateUrl} onSaved={onRowUpdate} />
          )}
          {row.original.favicon_url && (
            <img className="scn-broker-favicon" src={row.original.favicon_url} alt="" width={16} height={16} loading="lazy" />
          )}
          <span className="scn-broker-name__text">{row.getValue('broker_name')}</span>
          {row.original.best_for && (
            <button
              className={`scn-broker-expand${expandedId === row.original.id ? ' scn-broker-expand--open' : ''}`}
              onClick={() => onToggleExpand(row.original.id)}
              aria-expanded={expandedId === row.original.id}
            >
              Best for
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </span>
      ),
    },
    { accessorKey: 'broker_type', header: 'Type' },
    { accessorKey: 'regulation', header: 'Regulation' },
    {
      accessorKey: 'min_deposit',
      header: ({ column }) => (
        <Button variant="ghost" className="scn-table__sort-btn" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Min Deposit {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '↕'}
        </Button>
      ),
      cell: ({ row }) => {
        const v = row.getValue('min_deposit') as number;
        return v === 0 ? 'None' : `$${v.toLocaleString()}`;
      },
    },
    { accessorKey: 'leverage', header: 'Leverage' },
    {
      id: 'page_url',
      header: '',
      cell: ({ row }) => row.original.page_url ? (
        <a
          href={row.original.page_url}
          className="scn-broker-review-btn"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open review
        </a>
      ) : null,
    },
    {
      id: 'cta',
      header: '',
      cell: () => <CtaCell label={ctaLabel} buttonText={ctaButtonText} url={ctaUrl} />,
    },
  ];
}

function CountryCombobox({ countries, currentCountry }: { countries: Country[]; currentCountry: string }) {
  const [open, setOpen] = React.useState(false);

  function select(code: string) {
    setOpen(false);
    const url = new URL(window.location.href);
    if (code) url.searchParams.set('country', code);
    else url.searchParams.delete('country');
    window.location.href = url.toString();
  }

  const label = currentCountry
    ? (countries.find(c => c.code === currentCountry)?.name ?? currentCountry)
    : 'All countries';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="scn-broker-country-btn" aria-expanded={open}>
          {label}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginLeft: 4 }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="scn-broker-country-popover">
        <Command>
          <CommandInput placeholder="Search country…" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="" onSelect={() => select('')}>
                All countries
              </CommandItem>
              {countries.map(c => (
                <CommandItem key={c.code} value={`${c.name} ${c.code}`} onSelect={() => select(c.code)}>
                  {c.name} ({c.code})
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function BrokerDataTable({
  data: initialData, isAdmin, updateUrl, countries, currentCountry, ctaLabel, ctaButtonText, ctaUrl,
}: {
  data: BrokerRow[];
  isAdmin: boolean;
  updateUrl: string;
  countries: Country[];
  currentCountry: string;
  ctaLabel: string;
  ctaButtonText: string;
  ctaUrl: string;
}) {
  const [data, setData] = React.useState<BrokerRow[]>(initialData);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [expandedId, setExpandedId] = React.useState<number | null>(null);

  function toggleExpand(id: number) {
    setExpandedId(prev => prev === id ? null : id);
  }

  const handleRowUpdate = React.useCallback((updated: BrokerRow) => {
    setData((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  const columns = React.useMemo(
    () => buildColumns(isAdmin, updateUrl, currentCountry, expandedId, toggleExpand, handleRowUpdate, ctaLabel, ctaButtonText, ctaUrl),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin, updateUrl, currentCountry, expandedId, handleRowUpdate, ctaLabel, ctaButtonText, ctaUrl],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const colCount = columns.length;

  return (
    <div className="scn-broker-table">
      <div className="scn-broker-table__toolbar">
        <div className="scn-search-wrap scn-broker-table__search">
          <svg className="scn-search-wrap__icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input className="scn-search-wrap__input" placeholder="Search brokers, regulation, type…"
            value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} />
        </div>
        <CountryCombobox countries={countries} currentCountry={currentCountry} />
        <span className="scn-broker-table__count">
          {table.getFilteredRowModel().rows.length} broker{table.getFilteredRowModel().rows.length !== 1 ? 's' : ''}
        </span>
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                <TableRow data-state={row.getIsSelected() ? 'selected' : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                {expandedId === row.original.id && row.original.best_for && (
                  <TableRow className="scn-broker-detail-row">
                    <TableCell colSpan={colCount} className="scn-broker-detail-cell">
                      <div
                        className="scn-broker-best-for"
                        dangerouslySetInnerHTML={{ __html: row.original.best_for }}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={colCount} className="scn-table__empty">No brokers found.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── FxBrokerCarousel ──────────────────────────────────────────────────────────

function brokerToFxPayload(broker: BrokerRow): FxBrokerPayload {
  return {
    kind: 'fxbroker',
    brokerName: broker.broker_name,
    faviconUrl: broker.favicon_url || undefined,
    overallRating: broker.overall_rating,
    pageUrl: broker.page_url || undefined,
  };
}

function FxBrokerCarousel({
  allBrokers,
  isAdmin,
}: {
  allBrokers: BrokerRow[];
  isAdmin: boolean;
}): React.JSX.Element {
  const [featuredIds, setFeaturedIds] = React.useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const featured = featuredIds
    .map((id) => allBrokers.find((b) => b.id === id))
    .filter((b): b is BrokerRow => b !== undefined);

  const available = allBrokers.filter((b) => !featuredIds.includes(b.id));

  function add(broker: BrokerRow) {
    setFeaturedIds((prev) => [...prev, broker.id]);
    setPickerOpen(false);
  }

  function remove(id: number) {
    setFeaturedIds((prev) => prev.filter((x) => x !== id));
  }

  if (featured.length === 0 && !isAdmin) return <></>;

  return (
    <div className="scn-broker-carousel">
      <Carousel opts={{ align: 'start', dragFree: true }}>
        <CarouselContent>
          {featured.map((broker) => (
            <CarouselItem key={broker.id} className="scn-broker-carousel__item">
              <div className="scn-broker-carousel__card-wrap">
                <FxBrokerCardView data={brokerToFxPayload(broker)} />
                {isAdmin && (
                  <button
                    className="scn-broker-carousel__remove"
                    aria-label="Remove from carousel"
                    onClick={() => remove(broker.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            </CarouselItem>
          ))}
          {isAdmin && (
            <CarouselItem className="scn-broker-carousel__item scn-broker-carousel__item--add">
              <button
                className="scn-empty-add-btn"
                onClick={() => setPickerOpen(true)}
                disabled={available.length === 0}
                aria-label="Add broker to carousel"
              >
                <span className="scn-broker-carousel__add-icon">+</span>
                <span>Add broker</span>
              </button>
            </CarouselItem>
          )}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>

      {isAdmin && (
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="scn-broker-picker-dialog">
            <DialogHeader>
              <DialogTitle>Add broker to carousel</DialogTitle>
            </DialogHeader>
            <DialogClose className="scn-dialog-close">✕</DialogClose>
            <div className="scn-broker-picker__list">
              {available.map((broker) => (
                <button
                  key={broker.id}
                  className="scn-broker-picker__item"
                  onClick={() => add(broker)}
                >
                  {broker.favicon_url && (
                    <img
                      src={broker.favicon_url}
                      width={24}
                      height={24}
                      alt=""
                      className="scn-broker-picker__favicon"
                    />
                  )}
                  <span className="scn-broker-picker__name">{broker.broker_name}</span>
                  <span className="scn-broker-picker__rating">{broker.overall_rating.toFixed(1)} ★</span>
                </button>
              ))}
              {available.length === 0 && (
                <p className="scn-broker-picker__empty">All brokers are already in the carousel.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

const brokerTableRoots = new WeakMap<HTMLElement, Root>();

export function mountShadcnBrokerTable(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-broker-table]').forEach((host) => {
    if (host.dataset['shadcnBrokerTableBound'] === '1') return;
    const jsonId = host.dataset['brokerJsonId'];
    const countriesId = host.dataset['countriesJsonId'];
    if (!jsonId) return;
    const el = document.getElementById(jsonId);
    if (!el?.textContent?.trim()) return;
    let data: BrokerRow[] = [];
    try { data = JSON.parse(el.textContent) as BrokerRow[]; } catch { return; }
    let countries: Country[] = [];
    if (countriesId) {
      const cel = document.getElementById(countriesId);
      if (cel?.textContent?.trim()) {
        try { countries = JSON.parse(cel.textContent) as Country[]; } catch { /* ignore */ }
      }
    }
    const isAdmin = host.dataset['brokerIsAdmin'] === '1';
    const updateUrl = host.dataset['brokerUpdateUrl'] ?? '';
    const currentCountry = host.dataset['currentCountry'] ?? '';
    const ctaLabel = host.dataset['ctaLabel'] ?? '';
    const ctaButtonText = host.dataset['ctaButtonText'] ?? '';
    const ctaUrl = host.dataset['ctaUrl'] ?? '';
    host.dataset['shadcnBrokerTableBound'] = '1';
    let root = brokerTableRoots.get(host);
    if (!root) { root = createRoot(host); brokerTableRoots.set(host, root); }
    root.render(
      <BrokerDataTable data={data} isAdmin={isAdmin} updateUrl={updateUrl}
        countries={countries} currentCountry={currentCountry}
        ctaLabel={ctaLabel} ctaButtonText={ctaButtonText} ctaUrl={ctaUrl} />
    );
  });
}

export function mountShadcnBrokerCarousel(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-broker-carousel]').forEach((host) => {
    if (host.dataset['shadcnBrokerCarouselBound'] === '1') return;
    const jsonId = host.dataset['brokerJsonId'];
    if (!jsonId) return;
    const el = document.getElementById(jsonId);
    if (!el?.textContent?.trim()) return;
    let data: BrokerRow[] = [];
    try { data = JSON.parse(el.textContent) as BrokerRow[]; } catch { return; }
    const isAdmin = host.dataset['brokerIsAdmin'] === '1';
    host.dataset['shadcnBrokerCarouselBound'] = '1';
    let root = brokerTableRoots.get(host);
    if (!root) { root = createRoot(host); brokerTableRoots.set(host, root); }
    root.render(<FxBrokerCarousel allBrokers={data} isAdmin={isAdmin} />);
  });
}
