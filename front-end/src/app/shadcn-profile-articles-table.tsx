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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

type ArticleRow = {
  id: number;
  title: string;
  url: string;
  published: string;
  section_slug: string;
  section_name: string;
  category_name: string;
};

const columns: ColumnDef<ArticleRow>[] = [
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="scn-table__sort-btn"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Title {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '↕'}
      </Button>
    ),
    cell: ({ row }) => (
      <a href={row.original.url} className="scn-profile-article-link">
        {row.getValue('title')}
      </a>
    ),
  },
  {
    accessorKey: 'section_name',
    header: 'Section',
  },
  {
    accessorKey: 'category_name',
    header: 'Category',
    cell: ({ row }) => {
      const v = row.getValue('category_name') as string;
      return v || <span className="scn-text-muted">—</span>;
    },
  },
  {
    accessorKey: 'published',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="scn-table__sort-btn"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Published {column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : '↕'}
      </Button>
    ),
  },
];

function ProfileArticlesTable({ articles }: { articles: ArticleRow[] }) {
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'published', desc: true }]);

  const sections = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of articles) {
      if (!seen.has(a.section_slug)) seen.set(a.section_slug, a.section_name);
    }
    return Array.from(seen.entries()).map(([slug, name]) => ({ slug, name }));
  }, [articles]);

  const filteredData = React.useMemo(
    () => (selectedSlug ? articles.filter((a) => a.section_slug === selectedSlug) : articles),
    [articles, selectedSlug],
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
  });

  return (
    <div className="scn-profile-articles">
      <div className="scn-profile-articles__filter">
        <button
          className="scn-profile-chip"
          data-active={selectedSlug === null ? 'true' : 'false'}
          onClick={() => setSelectedSlug(null)}
        >
          All
        </button>
        {sections.map((s) => (
          <button
            key={s.slug}
            className="scn-profile-chip"
            data-active={selectedSlug === s.slug ? 'true' : 'false'}
            onClick={() => setSelectedSlug(s.slug)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="scn-broker-table__toolbar">
        <div className="scn-search-wrap scn-broker-table__search">
          <svg
            className="scn-search-wrap__icon"
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
            className="scn-search-wrap__input"
            placeholder="Search articles…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>
        <span className="scn-broker-table__count">
          {table.getFilteredRowModel().rows.length} article
          {table.getFilteredRowModel().rows.length !== 1 ? 's' : ''}
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
              <TableRow key={row.id}>
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
                No articles found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

const profileArticleRoots = new WeakMap<HTMLElement, Root>();

export function mountShadcnProfileArticlesTable(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-profile-articles]').forEach((host) => {
    if (host.dataset['shadcnProfileArticlesBound'] === '1') return;
    const jsonId = host.dataset['articlesJsonId'];
    if (!jsonId) return;
    const el = document.getElementById(jsonId);
    if (!el?.textContent?.trim()) return;
    let data: ArticleRow[] = [];
    try {
      data = JSON.parse(el.textContent) as ArticleRow[];
    } catch {
      return;
    }
    host.dataset['shadcnProfileArticlesBound'] = '1';
    let root = profileArticleRoots.get(host);
    if (!root) {
      root = createRoot(host);
      profileArticleRoots.set(host, root);
    }
    root.render(<ProfileArticlesTable articles={data} />);
  });
}
