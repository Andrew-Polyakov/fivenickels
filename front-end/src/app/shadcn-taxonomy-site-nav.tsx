import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Pen } from 'lucide-react';

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '../components/ui/navigation-menu';
import { cn } from '../lib/utils';

type PromptDialogData = {
  title?: string;
  label?: string;
  value?: string;
  confirmText?: string;
  cancelText?: string;
};

type MenuChildPayload = {
  id: string;
  name: string;
  slug: string;
  href: string;
  description: string;
  active: boolean;
};

type MenuItemPayload = {
  id: string;
  name: string;
  slug: string;
  href: string;
  active: boolean;
  removable: boolean;
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

declare global {
  interface Window {
    Turbo?: {
      visit: (url: string, options?: { action?: string; frame?: string }) => void;
    };
    showMaterialConfirm?: (message: string, title?: string) => Promise<boolean>;
    showMaterialAlert?: (message: string, title?: string) => Promise<void>;
    showMaterialPrompt?: (data: PromptDialogData) => Promise<string | undefined>;
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

async function promptName(title: string, label: string, value: string, confirmText: string): Promise<string | undefined> {
  if (window.showMaterialPrompt && typeof window.showMaterialPrompt === 'function') {
    return window.showMaterialPrompt({ title, label, value, confirmText });
  }
  return window.prompt(label, value) ?? undefined;
}

function InlineRenameAction({
  className,
  onRename,
}: {
  className?: string;
  onRename: () => void;
}): React.JSX.Element {
  return (
    <span
      role="button"
      tabIndex={0}
      className={cn('scn-taxonomy-site-nav__rename-inline', className)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRename();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onRename();
      }}
      aria-label="Rename category"
    >
      <Pen className="scn-taxonomy-site-nav__rename-inline-icon" strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

/**
 * shadcn NavigationMenuDemo ListItem — li > NavigationMenuLink asChild > a >
 * flex flex-col gap-1 text-sm > leading-none font-medium + line-clamp-2 text-muted-foreground.
 * Extended with taxonomy admin actions beside each child row.
 */
function ListItem({
  title,
  href,
  active,
  canEdit,
  onRename,
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<'li'> & {
  href: string;
  title: string;
  active?: boolean;
  canEdit?: boolean;
  onRename?: () => void;
}): React.JSX.Element {
  return (
    <li className={cn('scn-taxonomy-site-nav__list-item', className)} {...props}>
      <NavigationMenuLink asChild>
        <a
          href={href}
          data-turbo-frame="main"
          className={cn('scn-navigation-menu__list-item-link', active && 'scn-navigation-menu__list-item-link--active')}
        >
          <div className="scn-navigation-menu__list-item-body scn-navigation-menu__list-item-body--docs">
            <div className="scn-navigation-menu__list-item-title scn-navigation-menu__list-item-title--docs">{title}</div>
            {children ? (
              <div className="scn-navigation-menu__list-item-desc scn-navigation-menu__list-item-desc--docs">{children}</div>
            ) : null}
          </div>
        </a>
      </NavigationMenuLink>
      {canEdit && onRename ? (
        <InlineRenameAction className="scn-taxonomy-site-nav__rename-inline--dropdown" onRename={onRename} />
      ) : null}
    </li>
  );
}

/** One root taxonomy section: dropdown panel = NavigationMenuContent + ListItem per immediate child. */
function RootSectionNavigationMenuContent({
  section,
  variant,
  canEdit,
  createUrl,
  onAddChild,
  onRenameChild,
}: {
  section: MenuItemPayload;
  variant: 'simple' | 'grid';
  canEdit: boolean;
  createUrl: string;
  onAddChild: (parent: MenuItemPayload) => void | Promise<void>;
  onRenameChild: (chip: { id: string; name: string }) => void | Promise<void>;
}): React.JSX.Element {
  const showAddRow = canEdit && Boolean(createUrl);
  const showEmptyPlaceholder = section.children.length === 0 && !showAddRow;
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
        {section.children.map((ch) => (
          <ListItem
            key={ch.id}
            href={ch.href}
            title={ch.name}
            active={ch.active}
            canEdit={canEdit}
            onRename={() => void onRenameChild({ id: ch.id, name: ch.name })}
          >
            {ch.description || null}
          </ListItem>
        ))}
        {showAddRow ? (
          <li className="scn-taxonomy-site-nav__dropdown-add">
            <button type="button" className="scn-taxonomy-site-nav__dropdown-add-btn" onClick={() => void onAddChild(section)}>
              + Add
            </button>
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

function TaxonomySiteNavView({
  rows,
  canEdit,
  createUrl,
  renameUrl,
}: {
  rows: MenuRowPayload[];
  canEdit: boolean;
  createUrl: string;
  renameUrl: string;
}): React.JSX.Element {
  const topRow = rows.find((r) => r.depth === 1) ?? rows[0];

  const onAddChildOf = async (parent: MenuItemPayload) => {
    if (!canEdit || !createUrl) {
      return;
    }
    const name = await promptName(`Add to ${parent.name}`, 'Name', '', 'Create');
    const trimmed = name?.trim();
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
      refreshCurrentPage();
    } catch (err) {
      showAlert((err as Error).message || 'Could not create category.');
    }
  };

  const onRename = async (chip: { id: string; name: string }) => {
    if (!canEdit || !renameUrl) {
      return;
    }
    const name = await promptName('Rename category', 'Name', chip.name, 'Save');
    const trimmed = name?.trim();
    if (!trimmed || trimmed === chip.name) {
      return;
    }
    try {
      await postJson(renameUrl, { term_id: chip.id, name: trimmed });
      refreshCurrentPage();
    } catch (err) {
      showAlert((err as Error).message || 'Could not rename category.');
    }
  };

  if (!topRow) {
    return <div className="scn-taxonomy-site-nav" />;
  }

  return (
    <div className="scn-taxonomy-site-nav">
      <nav className="site-nav__row scn-taxonomy-site-nav__unified" aria-label="Site taxonomy">
        <NavigationMenu>
          <NavigationMenuList className="scn-taxonomy-site-nav__menu-list">
            {topRow.items.map((item) => {
              const hasChildren = item.children.length > 0;
              const variant: 'simple' | 'grid' =
                item.children.length >= LARGE_BRANCH_THRESHOLD ? 'grid' : 'simple';

              if (!hasChildren) {
                return (
                  <NavigationMenuItem
                    key={item.id}
                    className={cn('scn-taxonomy-site-nav__menu-item', 'scn-taxonomy-site-nav__menu-item--branch')}
                  >
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
                    {canEdit && item.removable !== false ? (
                      <InlineRenameAction
                        className="scn-taxonomy-site-nav__rename-inline--top"
                        onRename={() => void onRename({ id: item.id, name: item.name })}
                      />
                    ) : null}
                  </NavigationMenuItem>
                );
              }

              return (
                <NavigationMenuItem
                  key={item.id}
                  className={cn('scn-taxonomy-site-nav__menu-item', 'scn-taxonomy-site-nav__menu-item--branch')}
                >
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
                    onAddChild={onAddChildOf}
                    onRenameChild={onRename}
                  />
                  {canEdit && item.removable !== false ? (
                    <InlineRenameAction
                      className="scn-taxonomy-site-nav__rename-inline--top"
                      onRename={() => void onRename({ id: item.id, name: item.name })}
                    />
                  ) : null}
                </NavigationMenuItem>
              );
            })}
          </NavigationMenuList>
        </NavigationMenu>
      </nav>
    </div>
  );
}

const navRoots = new WeakMap<HTMLElement, Root>();

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
    host.dataset['shadcnTaxonomySiteNavBound'] = '1';
    let root = navRoots.get(host);
    if (!root) {
      root = createRoot(host);
      navRoots.set(host, root);
    }
    root.render(<TaxonomySiteNavView rows={rows} canEdit={canEdit} createUrl={createUrl} renameUrl={renameUrl} />);
  });
}
