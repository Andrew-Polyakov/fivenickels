import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '../components/ui/navigation-menu';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Separator } from '../components/ui/separator';
import { cn } from '../lib/utils';

type MenuChildPayload = {
  id: string;
  name: string;
  slug: string;
  href: string;
  description: string;
  active: boolean;
  inNav: boolean;
};

type MenuItemPayload = {
  id: string;
  name: string;
  slug: string;
  href: string;
  active: boolean;
  removable: boolean;
  inNav: boolean;
  children: MenuChildPayload[];
};

type MenuRowPayload = {
  depth: number;
  parentId: number | null;
  items: MenuItemPayload[];
  placeholder: string;
  createRoot: boolean;
  afterCreateVisit: string | null;
};

type NavTarget = {
  id: string;
  name: string;
  inNav: boolean;
  removable: boolean;
};

declare global {
  interface Window {
    Turbo?: {
      visit: (url: string, options?: { action?: string; frame?: string }) => void;
    };
    showMaterialAlert?: (message: string, title?: string) => Promise<void>;
  }
}

const LARGE_BRANCH_THRESHOLD = 5;

function readPayload(jsonId: string): MenuRowPayload[] | null {
  const el = document.getElementById(jsonId);
  if (!el?.textContent?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(el.textContent) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed as MenuRowPayload[];
  } catch {
    return null;
  }
}

function getCookie(name: string): string {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || '';
  }
  return '';
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCookie('csrftoken'),
      Accept: 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Request failed.');
  }
}

function refreshCurrentPage(): void {
  if (!window.Turbo || typeof window.Turbo.visit !== 'function') {
    window.location.reload();
    return;
  }
  if (document.querySelector('turbo-frame#main')) {
    window.Turbo.visit(window.location.href, { action: 'replace', frame: 'main' });
    return;
  }
  window.Turbo.visit(window.location.href, { action: 'replace' });
}

function visitTopLevel(href: string): void {
  if (!href) {
    return;
  }
  if (window.Turbo?.visit) {
    window.Turbo.visit(href, { action: 'advance', frame: 'main' });
    return;
  }
  window.location.assign(href);
}

function showAlert(message: string): void {
  if (window.showMaterialAlert && typeof window.showMaterialAlert === 'function') {
    void window.showMaterialAlert(message, 'Notice');
    return;
  }
  alert(message);
}

function CategoryEditPopover({
  target,
  className,
  canEdit,
  renameUrl,
  createUrl,
  deleteUrl,
  setNavUrl,
  onNavChange,
}: {
  target: NavTarget;
  className?: string;
  canEdit: boolean;
  renameUrl: string;
  createUrl: string;
  deleteUrl: string;
  setNavUrl: string;
  onNavChange: (id: string, inNav: boolean) => void;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(target.name);
  const [childDraft, setChildDraft] = React.useState('');
  const [navDraft, setNavDraft] = React.useState(target.inNav);
  const titleInputId = React.useId();
  const childInputId = React.useId();
  const navInputId = React.useId();

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setTitleDraft(target.name);
    setChildDraft('');
    setNavDraft(target.inNav);
  }, [open, target.inNav, target.name]);

  const saveRename = async () => {
    if (!canEdit || !renameUrl) {
      return;
    }
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === target.name) {
      return;
    }
    try {
      await postJson(renameUrl, { term_id: target.id, name: trimmed });
      setOpen(false);
      refreshCurrentPage();
    } catch (err) {
      showAlert((err as Error).message || 'Could not rename category.');
    }
  };

  const addChild = async () => {
    if (!canEdit || !createUrl) {
      return;
    }
    const trimmed = childDraft.trim();
    if (!trimmed) {
      return;
    }
    const parsedParent = Number(target.id);
    try {
      await postJson(createUrl, {
        name: trimmed,
        parent_id: Number.isFinite(parsedParent) ? parsedParent : target.id,
        create_root: false,
      });
      setOpen(false);
      refreshCurrentPage();
    } catch (err) {
      showAlert((err as Error).message || 'Could not create category.');
    }
  };

  const toggleNav = async (next: boolean) => {
    if (!canEdit || !setNavUrl) {
      return;
    }
    const prev = navDraft;
    setNavDraft(next);
    onNavChange(target.id, next);
    try {
      await postJson(setNavUrl, { term_id: target.id, is_nav: next });
    } catch (err) {
      setNavDraft(prev);
      onNavChange(target.id, prev);
      showAlert((err as Error).message || 'Could not update navigation setting.');
    }
  };

  const confirmDelete = async () => {
    if (!canEdit || !deleteUrl) {
      return;
    }
    try {
      await postJson(deleteUrl, { term_id: target.id });
      setConfirmDeleteOpen(false);
      setOpen(false);
      refreshCurrentPage();
    } catch (err) {
      showAlert((err as Error).message || 'Could not delete category.');
    }
  };

  if (!canEdit || !target.removable) {
    return <></>;
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn('scn-taxonomy-site-nav__rename-inline', className)}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Edit category"
          >
            <svg
              className="scn-taxonomy-site-nav__rename-inline-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19H4v-3L16.5 3.5z" />
            </svg>
          </button>
        </PopoverTrigger>
        <PopoverContent className="scn-taxonomy-site-nav__edit-popover" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="scn-taxonomy-site-nav__edit-popover-body">
            <label className="scn-label" htmlFor={titleInputId}>
              Title
            </label>
            <Input
              id={titleInputId}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saveRename();
                }
              }}
              autoFocus
            />

            <Separator className="scn-taxonomy-site-nav__edit-popover-sep" />

            <label className="scn-label" htmlFor={childInputId}>
              Add sub-category
            </label>
            <Input
              id={childInputId}
              value={childDraft}
              onChange={(e) => setChildDraft(e.target.value)}
              placeholder="Add new"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addChild();
                }
              }}
            />

            <Separator className="scn-taxonomy-site-nav__edit-popover-sep" />

            <label className="scn-taxonomy-site-nav__edit-popover-checkbox" htmlFor={navInputId}>
              <input
                id={navInputId}
                type="checkbox"
                checked={navDraft}
                onChange={(e) => {
                  void toggleNav(e.target.checked);
                }}
              />
              <span>Navigation</span>
            </label>

            {target.removable ? (
              <>
                <Separator className="scn-taxonomy-site-nav__edit-popover-sep" />
                <Button
                  type="button"
                  variant="outline"
                  className="scn-taxonomy-site-nav__edit-popover-delete"
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  Delete category
                </Button>
              </>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete category</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{target.name}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One root taxonomy section: dropdown panel = NavigationMenuContent + ListItem per immediate child. */
function RootSectionNavigationMenuContent({
  section,
  variant,
  canEdit,
  createUrl,
  renameUrl,
  deleteUrl,
  setNavUrl,
  onAddChild,
  onNavChange,
}: {
  section: MenuItemPayload;
  variant: 'simple' | 'grid';
  canEdit: boolean;
  createUrl: string;
  renameUrl: string;
  deleteUrl: string;
  setNavUrl: string;
  onAddChild: (parent: MenuItemPayload, name: string, onDone: () => void) => void | Promise<void>;
  onNavChange: (id: string, inNav: boolean) => void;
}): React.JSX.Element {
  const [addDraft, setAddDraft] = React.useState('');
  const visibleChildren = React.useMemo(() => {
    return section.children.filter((child) => canEdit || child.inNav);
  }, [canEdit, section.children]);

  const showAddRow = canEdit && Boolean(createUrl);
  const showEmptyPlaceholder = visibleChildren.length === 0 && !showAddRow;

  return (
    <NavigationMenuContent className="scn-taxonomy-site-nav__content">
      <ul
        className={cn(
          'scn-taxonomy-site-nav__dropdown-grid',
          variant === 'grid'
            ? 'scn-taxonomy-site-nav__dropdown-grid--grid'
            : 'scn-taxonomy-site-nav__dropdown-grid--simple'
        )}
      >
        {visibleChildren.map((ch) => (
          <li
            key={ch.id}
            className={cn('scn-taxonomy-site-nav__list-item', !ch.inNav && canEdit && 'scn-taxonomy-site-nav__list-item--off-nav')}
          >
            <NavigationMenuLink asChild>
              <a
                href={ch.href}
                data-turbo-frame="main"
                className={cn('scn-navigation-menu__list-item-link', ch.active && 'scn-navigation-menu__list-item-link--active')}
              >
                <div className="scn-navigation-menu__list-item-body scn-navigation-menu__list-item-body--docs">
                  <div className="scn-navigation-menu__list-item-title scn-navigation-menu__list-item-title--docs">{ch.name}</div>
                  {ch.description ? (
                    <div className="scn-navigation-menu__list-item-desc scn-navigation-menu__list-item-desc--docs">{ch.description}</div>
                  ) : null}
                </div>
              </a>
            </NavigationMenuLink>
            {canEdit ? (
              <CategoryEditPopover
                className="scn-taxonomy-site-nav__rename-inline--dropdown"
                target={{ id: ch.id, name: ch.name, inNav: ch.inNav, removable: true }}
                canEdit={canEdit}
                renameUrl={renameUrl}
                createUrl={createUrl}
                deleteUrl={deleteUrl}
                setNavUrl={setNavUrl}
                onNavChange={onNavChange}
              />
            ) : null}
          </li>
        ))}
        {showAddRow ? (
          <li className="scn-taxonomy-site-nav__dropdown-add">
            <Input
              value={addDraft}
              className="scn-taxonomy-site-nav__dropdown-add-input"
              placeholder="Add new"
              onChange={(e) => setAddDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') {
                  return;
                }
                e.preventDefault();
                const name = addDraft.trim();
                if (!name) {
                  return;
                }
                void onAddChild(section, name, () => setAddDraft(''));
              }}
            />
          </li>
        ) : null}
        {showEmptyPlaceholder ? (
          <li className="scn-taxonomy-site-nav__dropdown-empty" aria-disabled="true">
            No subsections yet
          </li>
        ) : null}
      </ul>
    </NavigationMenuContent>
  );
}

function chipRowsFromMenuRows(menuRows: MenuRowPayload[], canEdit: boolean): MenuRowPayload[] {
  return menuRows.filter(
    (row) => row.depth >= 3 && (canEdit || row.items.some((item) => item.inNav))
  );
}

/** Level-3+ strip: same square triggers + active top line as root row, centered. */
function TaxonomyDepthNavRow({
  row,
  canEdit,
  createUrl,
  renameUrl,
  deleteUrl,
  setNavUrl,
  onNavChange,
}: {
  row: MenuRowPayload;
  canEdit: boolean;
  createUrl: string;
  renameUrl: string;
  deleteUrl: string;
  setNavUrl: string;
  onNavChange: (id: string, inNav: boolean) => void;
}): React.JSX.Element {
  const [addDraft, setAddDraft] = React.useState('');
  const visibleItems = row.items.filter((item) => canEdit || item.inNav);
  const showAddRow = canEdit && Boolean(createUrl) && row.parentId != null;

  const onAddChild = async () => {
    if (!canEdit || !createUrl || row.parentId == null) {
      return;
    }
    const trimmed = addDraft.trim();
    if (!trimmed) {
      return;
    }
    try {
      await postJson(createUrl, {
        name: trimmed,
        parent_id: row.parentId,
        create_root: false,
      });
      setAddDraft('');
      refreshCurrentPage();
    } catch (err) {
      showAlert((err as Error).message || 'Could not create category.');
    }
  };

  if (visibleItems.length === 0 && !showAddRow) {
    return <></>;
  }

  return (
    <nav
      className={cn(
        'site-nav__row',
        `site-nav__row--depth-${row.depth}`,
        'scn-taxonomy-site-nav__depth-row'
      )}
      aria-label="Subsections"
    >
      <ul className="scn-taxonomy-site-nav__depth-list">
        {visibleItems.map((item) => (
          <li
            key={item.id}
            className={cn(
              'scn-taxonomy-site-nav__depth-item',
              !item.inNav && canEdit && 'scn-taxonomy-site-nav__menu-item--off-nav'
            )}
          >
            <a
              href={item.href}
              data-turbo-frame="main"
              className={cn(
                navigationMenuTriggerStyle(),
                'scn-navigation-menu__trigger--link',
                item.active && 'scn-navigation-menu__trigger--active'
              )}
              onClick={(e) => {
                if (!item.href) {
                  return;
                }
                e.preventDefault();
                visitTopLevel(item.href);
              }}
            >
              {item.name}
            </a>
            {canEdit ? (
              <CategoryEditPopover
                className="scn-taxonomy-site-nav__rename-inline--top"
                target={{
                  id: item.id,
                  name: item.name,
                  inNav: item.inNav,
                  removable: item.removable !== false,
                }}
                canEdit={canEdit}
                renameUrl={renameUrl}
                createUrl={createUrl}
                deleteUrl={deleteUrl}
                setNavUrl={setNavUrl}
                onNavChange={onNavChange}
              />
            ) : null}
          </li>
        ))}
        {showAddRow ? (
          <li className="scn-taxonomy-site-nav__depth-item scn-taxonomy-site-nav__depth-add">
            <Input
              value={addDraft}
              className="scn-taxonomy-site-nav__depth-add-input"
              placeholder={row.placeholder || 'Add new'}
              onChange={(e) => setAddDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') {
                  return;
                }
                e.preventDefault();
                void onAddChild();
              }}
            />
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

function TaxonomySiteNavView({
  rows,
  canEdit,
  createUrl,
  renameUrl,
  deleteUrl,
  setNavUrl,
}: {
  rows: MenuRowPayload[];
  canEdit: boolean;
  createUrl: string;
  renameUrl: string;
  deleteUrl: string;
  setNavUrl: string;
}): React.JSX.Element {
  const [menuRows, setMenuRows] = React.useState(rows);

  React.useEffect(() => {
    setMenuRows(rows);
  }, [rows]);

  const topRow = menuRows.find((r) => r.depth === 1) ?? menuRows[0];

  const updateInNav = (targetId: string, inNav: boolean) => {
    setMenuRows((prevRows) =>
      prevRows.map((row) => ({
        ...row,
        items: row.items.map((item) => {
          if (item.id === targetId) {
            return { ...item, inNav };
          }
          return {
            ...item,
            children: item.children.map((child) =>
              child.id === targetId ? { ...child, inNav } : child
            ),
          };
        }),
      }))
    );
  };

  const onAddChildOf = async (parent: MenuItemPayload, name: string, onDone: () => void) => {
    if (!canEdit || !createUrl) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const parsedParent = Number(parent.id);
    try {
      await postJson(createUrl, {
        name: trimmed,
        parent_id: Number.isFinite(parsedParent) ? parsedParent : parent.id,
        create_root: false,
      });
      onDone();
      refreshCurrentPage();
    } catch (err) {
      showAlert((err as Error).message || 'Could not create category.');
    }
  };

  if (!topRow) {
    return <div className="scn-taxonomy-site-nav" />;
  }

  const visibleTopItems = topRow.items.filter((item) => canEdit || item.inNav);
  const chipRows = chipRowsFromMenuRows(menuRows, canEdit);

  return (
    <div className="scn-taxonomy-site-nav">
      <nav className="site-nav__row scn-taxonomy-site-nav__unified" aria-label="Site taxonomy">
        <NavigationMenu viewport={false}>
          <NavigationMenuList className="scn-taxonomy-site-nav__menu-list">
            {visibleTopItems.map((item) => {
              const hasChildren = item.children.length > 0;
              const variant: 'simple' | 'grid' =
                item.children.length >= LARGE_BRANCH_THRESHOLD ? 'grid' : 'simple';
              const branchClass = cn(
                'scn-taxonomy-site-nav__menu-item',
                'scn-taxonomy-site-nav__menu-item--branch',
                !item.inNav && canEdit && 'scn-taxonomy-site-nav__menu-item--off-nav'
              );

              if (!hasChildren) {
                return (
                  <NavigationMenuItem key={item.id} className={branchClass}>
                    <NavigationMenuLink asChild>
                      <a
                        href={item.href}
                        data-turbo-frame="main"
                        className={cn(
                          navigationMenuTriggerStyle(),
                          'scn-navigation-menu__trigger--link',
                          item.active && 'scn-navigation-menu__trigger--active'
                        )}
                        onClick={(e) => {
                          if (!item.href) {
                            return;
                          }
                          e.preventDefault();
                          visitTopLevel(item.href);
                        }}
                      >
                        {item.name}
                      </a>
                    </NavigationMenuLink>
                    {canEdit ? (
                      <CategoryEditPopover
                        className="scn-taxonomy-site-nav__rename-inline--top"
                        target={{ id: item.id, name: item.name, inNav: item.inNav, removable: item.removable !== false }}
                        canEdit={canEdit}
                        renameUrl={renameUrl}
                        createUrl={createUrl}
                        deleteUrl={deleteUrl}
                        setNavUrl={setNavUrl}
                        onNavChange={updateInNav}
                      />
                    ) : null}
                  </NavigationMenuItem>
                );
              }

              return (
                <NavigationMenuItem key={item.id} className={branchClass}>
                  <NavigationMenuTrigger
                    className={cn(item.active && 'scn-navigation-menu__trigger--active')}
                    onPointerUp={(e) => {
                      if (!item.href) {
                        return;
                      }
                      e.preventDefault();
                      visitTopLevel(item.href);
                    }}
                    onClick={(e) => {
                      if (!item.href) {
                        return;
                      }
                      e.preventDefault();
                      visitTopLevel(item.href);
                    }}
                    onKeyDown={(e) => {
                      if (!item.href) {
                        return;
                      }
                      if (e.key !== 'Enter' && e.key !== ' ') {
                        return;
                      }
                      e.preventDefault();
                      visitTopLevel(item.href);
                    }}
                  >
                    {item.name}
                  </NavigationMenuTrigger>
                  <RootSectionNavigationMenuContent
                    section={item}
                    variant={variant}
                    canEdit={canEdit}
                    createUrl={createUrl}
                    renameUrl={renameUrl}
                    deleteUrl={deleteUrl}
                    setNavUrl={setNavUrl}
                    onAddChild={onAddChildOf}
                    onNavChange={updateInNav}
                  />
                  {canEdit ? (
                    <CategoryEditPopover
                      className="scn-taxonomy-site-nav__rename-inline--top"
                      target={{ id: item.id, name: item.name, inNav: item.inNav, removable: item.removable !== false }}
                      canEdit={canEdit}
                      renameUrl={renameUrl}
                      createUrl={createUrl}
                      deleteUrl={deleteUrl}
                      setNavUrl={setNavUrl}
                      onNavChange={updateInNav}
                    />
                  ) : null}
                </NavigationMenuItem>
              );
            })}
          </NavigationMenuList>
        </NavigationMenu>
      </nav>
      {chipRows.map((row) => (
        <TaxonomyDepthNavRow
          key={`depth-row-${row.depth}-${row.parentId ?? 'root'}`}
          row={row}
          canEdit={canEdit}
          createUrl={createUrl}
          renameUrl={renameUrl}
          deleteUrl={deleteUrl}
          setNavUrl={setNavUrl}
          onNavChange={updateInNav}
        />
      ))}
    </div>
  );
}

const navRoots = new WeakMap<HTMLElement, Root>();

function hideTaxonomyNavFallback(host: HTMLElement): void {
  const frame = host.closest('turbo-frame#site-nav') ?? host.parentElement;
  const fallback = frame?.querySelector<HTMLElement>('.taxonomy-site-nav__fallback');
  if (fallback) {
    fallback.hidden = true;
  }
}

export function mountShadcnTaxonomySiteNav(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-taxonomy-site-nav]').forEach((host) => {
    if (host.dataset['shadcnTaxonomySiteNavBound'] === '1') {
      return;
    }
    const jsonId = host.dataset['jsonId'];
    if (!jsonId) {
      return;
    }
    const rows = readPayload(jsonId);
    if (rows === null) {
      return;
    }
    const canEdit = host.dataset['canEdit'] === '1';
    const createUrl = host.dataset['createUrl'] ?? '';
    const renameUrl = host.dataset['renameUrl'] ?? '';
    const deleteUrl = host.dataset['deleteUrl'] ?? '';
    const setNavUrl = host.dataset['setNavUrl'] ?? '';
    host.dataset['shadcnTaxonomySiteNavBound'] = '1';
    let root = navRoots.get(host);
    if (!root) {
      root = createRoot(host);
      navRoots.set(host, root);
    }
    root.render(
      <TaxonomySiteNavView
        rows={rows}
        canEdit={canEdit}
        createUrl={createUrl}
        renameUrl={renameUrl}
        deleteUrl={deleteUrl}
        setNavUrl={setNavUrl}
      />
    );
    hideTaxonomyNavFallback(host);
  });
}
