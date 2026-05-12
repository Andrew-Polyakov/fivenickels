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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '../components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { cn } from '../lib/utils';

type ArticleRow = {
  id: number;
  title: string;
  url: string;
  published: string;
  section_slug: string;
  section_name: string;
  category_name: string;
  catalyst?: 'Bullish' | 'Bearish' | '';
  edit_url: string | null;
};

type ModerationRow = {
  id: number;
  title: string;
  section_name: string;
  category_name: string;
  submitted: string;
  author_name: string;
  preview: string;
  catalyst?: 'Bullish' | 'Bearish' | '';
  edit_url: string;
  approve_url: string;
};

const DEFAULT_PAGE_SIZE = 25;

function catalystIconSrc(catalyst?: string): string | null {
  if (catalyst === 'Bullish') return '/static/images/bull.png';
  if (catalyst === 'Bearish') return '/static/images/bear.png';
  return null;
}

function catalystSurfaceClass(catalyst?: string): string | null {
  if (catalyst === 'Bullish') return 'scn-profile-article-row--bullish';
  if (catalyst === 'Bearish') return 'scn-profile-article-row--bearish';
  return null;
}

function getCsrfToken(explicitToken: string): string {
  if (explicitToken) return explicitToken;
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function paginate<T>(items: T[], pageIndex: number, pageSize: number): T[] {
  const start = pageIndex * pageSize;
  return items.slice(start, start + pageSize);
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

function PaginationControls({
  pageIndex,
  pageSize,
  totalItems,
  onPageChange,
}: {
  pageIndex: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min(totalItems, (pageIndex + 1) * pageSize);
  const currentPage = pageIndex + 1;
  const pageTokens = buildPageTokens(totalPages, currentPage);
  const goToPage = (nextPage: number): void => {
    const clamped = Math.min(Math.max(0, nextPage), totalPages - 1);
    onPageChange(clamped);
  };

  return (
    <div className="scn-profile-pagination" data-profile-pagination="true">
      <span className="scn-profile-pagination__summary">
        {totalItems === 0 ? 'No items' : `Showing ${start}-${end} of ${totalItems}`}
      </span>
      <Pagination className="scn-profile-pagination__nav">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={pageIndex <= 0}
              onClick={(event) => {
                event.preventDefault();
                if (pageIndex > 0) {
                  goToPage(pageIndex - 1);
                }
              }}
            />
          </PaginationItem>
          {pageTokens.map((token, index) => (
            <PaginationItem key={`${token}-${index}`}>
              {token === 'ellipsis' ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  href="#"
                  isActive={token === currentPage}
                  onClick={(event) => {
                    event.preventDefault();
                    goToPage(token - 1);
                  }}
                >
                  {token}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={pageIndex + 1 >= totalPages}
              onClick={(event) => {
                event.preventDefault();
                if (pageIndex + 1 < totalPages) {
                  goToPage(pageIndex + 1);
                }
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function ProfileArticlesTable({
  articles,
  createArticleUrl,
  csrfToken,
  pageSize,
}: {
  articles: ArticleRow[];
  createArticleUrl: string;
  csrfToken: string;
  pageSize: number;
}) {
  const createUrl = createArticleUrl || '/profile/article/create/';
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'published', desc: true }]);
  const [pageIndex, setPageIndex] = React.useState(0);

  const columns = React.useMemo<ColumnDef<ArticleRow>[]>(
    () => [
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
          const value = row.getValue('category_name') as string;
          return value || <span className="scn-text-muted">—</span>;
        },
      },
      {
        accessorKey: 'catalyst',
        header: 'Sentiment',
        cell: ({ row }) => {
          const iconSrc = catalystIconSrc(row.original.catalyst);
          if (!iconSrc) {
            return <span className="scn-text-muted">—</span>;
          }
          return (
            <img
              src={iconSrc}
              alt=""
              width={64}
              height={64}
              className="scn-catalyst-icon scn-profile-sentiment__icon"
              aria-hidden="true"
            />
          );
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
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }) => {
          const url = row.original.edit_url;
          if (!url) return null;
          return (
            <Button asChild className="scn-profile-action-edit scn-profile-article-edit">
              <a href={url} aria-label={`Edit ${row.original.title}`} title={`Edit ${row.original.title}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19H4v-3L16.5 3.5z" />
                </svg>
              </a>
            </Button>
          );
        },
      },
    ],
    [],
  );

  const sections = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const article of articles) {
      if (!seen.has(article.section_slug)) {
        seen.set(article.section_slug, article.section_name);
      }
    }
    return Array.from(seen.entries()).map(([slug, name]) => ({ slug, name }));
  }, [articles]);

  const filteredData = React.useMemo(
    () => (selectedSlug ? articles.filter((article) => article.section_slug === selectedSlug) : articles),
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

  const sortedRows = table.getSortedRowModel().rows;
  const pagedRows = paginate(sortedRows, pageIndex, pageSize);

  React.useEffect(() => {
    setPageIndex(0);
  }, [selectedSlug, globalFilter, sorting, pageSize]);

  React.useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sortedRows.length / pageSize) - 1);
    if (pageIndex > maxPage) {
      setPageIndex(maxPage);
    }
  }, [pageIndex, pageSize, sortedRows.length]);

  return (
    <div className="scn-profile-articles" data-profile-tab-panel="articles">
      <div className="scn-profile-articles__filter">
        <button
          className="scn-profile-chip"
          data-active={selectedSlug === null ? 'true' : 'false'}
          onClick={() => setSelectedSlug(null)}
        >
          All
        </button>
        {sections.map((section) => (
          <button
            key={section.slug}
            className="scn-profile-chip"
            data-active={selectedSlug === section.slug ? 'true' : 'false'}
            onClick={() => setSelectedSlug(section.slug)}
          >
            {section.name}
          </button>
        ))}
      </div>
      <div className="scn-broker-table__toolbar">
        <form action={createUrl} method="post" className="scn-profile-articles__create-form">
          <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
          <button
            type="submit"
            className="scn-profile-articles__create-btn"
            aria-label="New article"
            title="New article"
          >
            +
          </button>
        </form>
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
            onChange={(event) => setGlobalFilter(event.target.value)}
          />
        </div>
        <span className="scn-broker-table__count">
          {table.getFilteredRowModel().rows.length} article
          {table.getFilteredRowModel().rows.length !== 1 ? 's' : ''}
        </span>
      </div>
      <PaginationControls
        pageIndex={pageIndex}
        pageSize={pageSize}
        totalItems={sortedRows.length}
        onPageChange={setPageIndex}
      />
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {pagedRows.length > 0 ? (
            pagedRows.map((row) => (
              <TableRow key={row.id} className={cn(catalystSurfaceClass(row.original.catalyst))}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={table.getAllColumns().length} className="scn-table__empty">
                No articles found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <PaginationControls
        pageIndex={pageIndex}
        pageSize={pageSize}
        totalItems={sortedRows.length}
        onPageChange={setPageIndex}
      />
    </div>
  );
}

function ProfileModerationGrid({
  items,
  csrfToken,
  pageSize,
}: {
  items: ModerationRow[];
  csrfToken: string;
  pageSize: number;
}) {
  const [rows, setRows] = React.useState(items);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pendingId, setPendingId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRows(items);
    setPageIndex(0);
  }, [items]);

  const pagedRows = paginate(rows, pageIndex, pageSize);

  React.useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
    if (pageIndex > maxPage) {
      setPageIndex(maxPage);
    }
  }, [pageIndex, pageSize, rows.length]);

  const approveItem = async (item: ModerationRow) => {
    setPendingId(item.id);
    setError(null);
    try {
      const response = await fetch(item.approve_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRFToken': getCsrfToken(csrfToken),
        },
        body: JSON.stringify({ action: 'approve_moderation' }),
      });
      if (!response.ok) {
        throw new Error('Approval failed.');
      }
      setRows((current) => current.filter((row) => row.id !== item.id));
    } catch {
      setError('Could not approve this article. Try again.');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="scn-profile-moderation" data-profile-tab-panel="moderation">
      {error ? <p className="scn-profile-moderation__error">{error}</p> : null}
      <PaginationControls
        pageIndex={pageIndex}
        pageSize={pageSize}
        totalItems={rows.length}
        onPageChange={setPageIndex}
      />
      {rows.length === 0 ? (
        <p className="scn-profile-moderation__empty">No items awaiting moderation.</p>
      ) : (
        <div className="scn-profile-moderation__grid">
          {pagedRows.map((item) => (
            <article
              key={item.id}
              className={cn('scn-profile-moderation-card', catalystSurfaceClass(item.catalyst))}
            >
              <div className="scn-profile-moderation-card__meta">
                <span>{item.section_name}</span>
                {item.category_name ? <span>{item.category_name}</span> : null}
                {item.submitted ? <span>{item.submitted}</span> : null}
              </div>
              <h3 className="scn-profile-moderation-card__title">{item.title}</h3>
              <p className="scn-profile-moderation-card__author">{item.author_name}</p>
              {item.preview ? <p className="scn-profile-moderation-card__preview">{item.preview}</p> : null}
              <div className="scn-profile-moderation-card__actions">
                <Button asChild className="scn-profile-action-edit scn-profile-moderation-card__edit">
                  <a href={item.edit_url}>Edit</a>
                </Button>
                <Button
                  type="button"
                  className="scn-profile-action-approve scn-profile-moderation-card__approve"
                  disabled={pendingId === item.id}
                  onClick={() => approveItem(item)}
                >
                  {pendingId === item.id ? 'Approving…' : 'Approve'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <PaginationControls
        pageIndex={pageIndex}
        pageSize={pageSize}
        totalItems={rows.length}
        onPageChange={setPageIndex}
      />
    </div>
  );
}

function ProfileWorkspace({
  articles,
  moderationItems,
  createArticleUrl,
  csrfToken,
  pageSize,
}: {
  articles: ArticleRow[];
  moderationItems: ModerationRow[];
  createArticleUrl: string;
  csrfToken: string;
  pageSize: number;
}) {
  return (
    <div className="scn-profile-workspace">
      <Tabs defaultValue="articles">
        <TabsList className="scn-profile-tabs__list">
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="moderation">Moderation</TabsTrigger>
        </TabsList>
        <TabsContent value="articles">
          <ProfileArticlesTable
            articles={articles}
            createArticleUrl={createArticleUrl}
            csrfToken={csrfToken}
            pageSize={pageSize}
          />
        </TabsContent>
        <TabsContent value="moderation">
          <ProfileModerationGrid items={moderationItems} csrfToken={csrfToken} pageSize={pageSize} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const profileArticleRoots = new WeakMap<HTMLElement, Root>();

function parseJsonScript<T>(jsonId: string): T[] {
  const element = document.getElementById(jsonId);
  if (!element?.textContent?.trim()) {
    return [];
  }
  try {
    return JSON.parse(element.textContent) as T[];
  } catch {
    return [];
  }
}

export function mountShadcnProfileArticlesTable(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-profile-articles]').forEach((host) => {
    if (host.dataset['shadcnProfileArticlesBound'] === '1') return;

    const articlesJsonId = host.dataset['articlesJsonId'];
    const moderationJsonId = host.dataset['moderationJsonId'];
    if (!articlesJsonId) return;

    const createArticleUrl = host.dataset['createArticleUrl'] ?? '';
    const csrfToken = host.dataset['csrfToken'] ?? '';
    const pageSize = Number.parseInt(host.dataset['pageSize'] ?? '', 10);
    const resolvedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;

    const articles = parseJsonScript<ArticleRow>(articlesJsonId);
    const moderationItems = moderationJsonId ? parseJsonScript<ModerationRow>(moderationJsonId) : [];

    host.dataset['shadcnProfileArticlesBound'] = '1';
    let root = profileArticleRoots.get(host);
    if (!root) {
      root = createRoot(host);
      profileArticleRoots.set(host, root);
    }
    root.render(
      <ProfileWorkspace
        articles={articles}
        moderationItems={moderationItems}
        createArticleUrl={createArticleUrl}
        csrfToken={csrfToken}
        pageSize={resolvedPageSize}
      />,
    );
  });
}
