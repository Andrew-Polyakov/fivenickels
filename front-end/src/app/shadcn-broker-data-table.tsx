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
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export type BrokerRow = {
  id: number;
  rank: number;
  broker_name: string;
  favicon_url: string;
  overall_rating: number;
  status: string;
  reviews: number;
  broker_type: string;
  regulation: string;
  min_deposit: number;
  leverage: string;
};

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active'
      ? 'scn-broker-badge scn-broker-badge--active'
      : status === 'restricted'
        ? 'scn-broker-badge scn-broker-badge--restricted'
        : 'scn-broker-badge scn-broker-badge--inactive';
  return <span className={cls}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

function RatingStars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="scn-broker-rating">
      <span className="scn-broker-rating__score">{value.toFixed(1)}</span>
      <span className="scn-broker-rating__stars" aria-hidden="true">
        {'★'.repeat(full)}
        {half ? '½' : ''}
        {'☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}
      </span>
    </span>
  );
}

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
    if (open) {
      setDraft({ ...row });
      setError('');
    }
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
    setSaving(true);
    setError('');
    const url = updateUrl.replace('/0/', `/${row.id}/`);
    try {
      const csrfToken = (document.querySelector<HTMLInputElement>('input[name="csrfmiddlewaretoken"]')?.value) ?? '';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Save failed');
      } else {
        onSaved(draft);
        setOpen(false);
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="scn-broker-edit-trigger" aria-label="Edit broker" title="Edit">
          <PenIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent className="scn-broker-edit-popover">
        <p className="scn-broker-edit__title">Edit broker</p>
        <div className="scn-broker-edit__grid">
          {field('Rank', 'rank', 'number')}
          {field('Name', 'broker_name')}
          {field('Favicon URL', 'favicon_url')}
          {field('Rating', 'overall_rating', 'number')}
          <div className="scn-broker-edit__field">
            <Label htmlFor="bef-status" className="scn-broker-edit__label">Status</Label>
            <select
              id="bef-status"
              className="scn-input"
              value={draft.status}
              onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
          {field('Reviews', 'reviews', 'number')}
          {field('Type', 'broker_type')}
          {field('Regulation', 'regulation')}
          {field('Min Deposit ($)', 'min_deposit', 'number')}
          {field('Leverage', 'leverage')}
        </div>
        {error && <p className="scn-broker-edit__error">{error}</p>}
        <div className="scn-broker-edit__actions">
          <Button variant="ghost" className="scn-broker-edit__cancel" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="scn-broker-edit__save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function buildColumns(isAdmin: boolean, updateUrl: string, onRowUpdate: (updated: BrokerRow) => void): ColumnDef<BrokerRow>[] {
  const cols: ColumnDef<BrokerRow>[] = [
    {
      accessorKey: 'rank',
      header: ({ column }) => (
        <Button variant="ghost" className="scn-table__sort-btn" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Rank {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '↕'}
        </Button>
      ),
    },
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
            <img
              className="scn-broker-favicon"
              src={row.original.favicon_url}
              alt=""
              width={16}
              height={16}
              loading="lazy"
            />
          )}
          {row.getValue('broker_name')}
        </span>
      ),
    },
    {
      accessorKey: 'overall_rating',
      header: ({ column }) => (
        <Button variant="ghost" className="scn-table__sort-btn" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Overall Rating {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '↕'}
        </Button>
      ),
      cell: ({ row }) => <RatingStars value={row.getValue('overall_rating')} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.getValue('status')} />,
    },
    {
      accessorKey: 'reviews',
      header: ({ column }) => (
        <Button variant="ghost" className="scn-table__sort-btn" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Reviews {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '↕'}
        </Button>
      ),
      cell: ({ row }) => (row.getValue('reviews') as number).toLocaleString(),
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
  ];

  return cols;
}

function BrokerDataTable({ data: initialData, isAdmin, updateUrl }: { data: BrokerRow[]; isAdmin: boolean; updateUrl: string }) {
  const [data, setData] = React.useState<BrokerRow[]>(initialData);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'rank', desc: false }]);
  const [globalFilter, setGlobalFilter] = React.useState('');

  const handleRowUpdate = React.useCallback((updated: BrokerRow) => {
    setData((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  const columns = React.useMemo(
    () => buildColumns(isAdmin, updateUrl, handleRowUpdate),
    [isAdmin, updateUrl, handleRowUpdate],
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

  return (
    <div className="scn-broker-table">
      <div className="scn-broker-table__toolbar">
        <div className="scn-search-wrap scn-broker-table__search">
          <svg className="scn-search-wrap__icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
            className="scn-search-wrap__input"
            placeholder="Search brokers, regulation, type…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>
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
              <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="scn-table__empty">
                No brokers found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

const brokerTableRoots = new WeakMap<HTMLElement, Root>();

export function mountShadcnBrokerTable(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-broker-table]').forEach((host) => {
    if (host.dataset['shadcnBrokerTableBound'] === '1') return;
    const jsonId = host.dataset['brokerJsonId'];
    if (!jsonId) return;
    const el = document.getElementById(jsonId);
    if (!el?.textContent?.trim()) return;
    let data: BrokerRow[] = [];
    try {
      data = JSON.parse(el.textContent) as BrokerRow[];
    } catch {
      return;
    }
    const isAdmin = host.dataset['brokerIsAdmin'] === '1';
    const updateUrl = host.dataset['brokerUpdateUrl'] ?? '';
    host.dataset['shadcnBrokerTableBound'] = '1';
    let root = brokerTableRoots.get(host);
    if (!root) {
      root = createRoot(host);
      brokerTableRoots.set(host, root);
    }
    root.render(<BrokerDataTable data={data} isAdmin={isAdmin} updateUrl={updateUrl} />);
  });
}
