import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Separator } from '../components/ui/separator';
import { cn } from '../lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type HamburgerNavTerm = {
  id: string;
  name: string;
  slug: string;
  href: string;
  inNav: boolean;
  inSitemap: boolean;
  removable: boolean;
  children: HamburgerNavTerm[];
};

type HamburgerNavPayload = {
  terms: HamburgerNavTerm[];
};

type EditTarget = {
  id: string;
  name: string;
  inNav: boolean;
  inSitemap: boolean;
  removable: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCookie(name: string): string {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() ?? '';
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
  if (!res.ok) throw new Error(data.error ?? 'Request failed.');
}

function refreshCurrentPage(): void {
  const turbo = (window as { Turbo?: { visit: (u: string, o?: object) => void } }).Turbo;
  if (turbo?.visit) {
    if (document.querySelector('turbo-frame#main')) {
      turbo.visit(window.location.href, { action: 'replace', frame: 'main' });
      return;
    }
    turbo.visit(window.location.href, { action: 'replace' });
    return;
  }
  window.location.reload();
}

function showAlert(message: string): void {
  const w = window as { showMaterialAlert?: (m: string, t?: string) => void };
  if (w.showMaterialAlert) { void w.showMaterialAlert(message, 'Notice'); return; }
  alert(message);
}

function readPayload(jsonId: string): HamburgerNavPayload | null {
  const el = document.getElementById(jsonId);
  if (!el?.textContent?.trim()) return null;
  try {
    const parsed = JSON.parse(el.textContent) as unknown;
    if (parsed && typeof parsed === 'object' && 'terms' in parsed) {
      return parsed as HamburgerNavPayload;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Pen icon ──────────────────────────────────────────────────────────────────

function PenIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19H4v-3L16.5 3.5z" />
    </svg>
  );
}

// ── Category edit popover (nav + sitemap flags) ───────────────────────────────

function CategoryEditPopover({
  target,
  canEdit,
  renameUrl,
  createUrl,
  deleteUrl,
  setNavUrl,
  setSitemapUrl,
  onNavChange,
  onSitemapChange,
}: {
  target: EditTarget;
  canEdit: boolean;
  renameUrl: string;
  createUrl: string;
  deleteUrl: string;
  setNavUrl: string;
  setSitemapUrl: string;
  onNavChange: (id: string, inNav: boolean) => void;
  onSitemapChange: (id: string, inSitemap: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(target.name);
  const [childDraft, setChildDraft] = React.useState('');
  const [navDraft, setNavDraft] = React.useState(target.inNav);
  const [sitemapDraft, setSitemapDraft] = React.useState(target.inSitemap);
  const titleId = React.useId();
  const childId = React.useId();
  const navId = React.useId();
  const sitemapId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    setTitleDraft(target.name);
    setChildDraft('');
    setNavDraft(target.inNav);
    setSitemapDraft(target.inSitemap);
  }, [open, target.name, target.inNav, target.inSitemap]);

  const saveRename = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === target.name) return;
    try {
      await postJson(renameUrl, { term_id: target.id, name: trimmed });
      setOpen(false);
      refreshCurrentPage();
    } catch (err) {
      showAlert((err as Error).message ?? 'Could not rename category.');
    }
  };

  const addChild = async () => {
    const trimmed = childDraft.trim();
    if (!trimmed) return;
    const parentId = Number(target.id);
    try {
      await postJson(createUrl, {
        name: trimmed,
        parent_id: Number.isFinite(parentId) ? parentId : target.id,
        create_root: false,
      });
      setOpen(false);
      refreshCurrentPage();
    } catch (err) {
      showAlert((err as Error).message ?? 'Could not create category.');
    }
  };

  const toggleNav = async (next: boolean) => {
    const prev = navDraft;
    setNavDraft(next);
    onNavChange(target.id, next);
    try {
      await postJson(setNavUrl, { term_id: target.id, is_nav: next });
    } catch (err) {
      setNavDraft(prev);
      onNavChange(target.id, prev);
      showAlert((err as Error).message ?? 'Could not update navigation setting.');
    }
  };

  const toggleSitemap = async (next: boolean) => {
    const prev = sitemapDraft;
    setSitemapDraft(next);
    onSitemapChange(target.id, next);
    try {
      await postJson(setSitemapUrl, { term_id: target.id, is_sitemap: next });
    } catch (err) {
      setSitemapDraft(prev);
      onSitemapChange(target.id, prev);
      showAlert((err as Error).message ?? 'Could not update site map setting.');
    }
  };

  const confirmDelete = async () => {
    try {
      await postJson(deleteUrl, { term_id: target.id });
      setOpen(false);
      refreshCurrentPage();
    } catch (err) {
      showAlert((err as Error).message ?? 'Could not delete category.');
    }
  };

  if (!canEdit) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="scn-hamburger-nav__pen-btn"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          aria-label={`Edit ${target.name}`}
        >
          <PenIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="scn-taxonomy-site-nav__edit-popover"
        onOpenAutoFocus={e => e.preventDefault()}
        align="end"
      >
        <div className="scn-taxonomy-site-nav__edit-popover-body">
          <label className="scn-label" htmlFor={titleId}>Title</label>
          <Input
            id={titleId}
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveRename(); } }}
            autoFocus
          />

          <Separator className="scn-taxonomy-site-nav__edit-popover-sep" />

          <label className="scn-label" htmlFor={childId}>Add sub-category</label>
          <Input
            id={childId}
            value={childDraft}
            onChange={e => setChildDraft(e.target.value)}
            placeholder="Add new"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addChild(); } }}
          />

          <Separator className="scn-taxonomy-site-nav__edit-popover-sep" />

          <label className="scn-taxonomy-site-nav__edit-popover-checkbox" htmlFor={navId}>
            <input id={navId} type="checkbox" checked={navDraft}
              onChange={e => { void toggleNav(e.target.checked); }} />
            <span>Navigation</span>
          </label>

          <label className="scn-taxonomy-site-nav__edit-popover-checkbox" htmlFor={sitemapId}>
            <input id={sitemapId} type="checkbox" checked={sitemapDraft}
              onChange={e => { void toggleSitemap(e.target.checked); }} />
            <span>Site map</span>
          </label>

          {target.removable && (
            <>
              <Separator className="scn-taxonomy-site-nav__edit-popover-sep" />
              <Button
                type="button"
                variant="outline"
                className="scn-taxonomy-site-nav__edit-popover-delete"
                onClick={() => { void confirmDelete(); }}
              >
                Delete category
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function patchTermInTree(
  nodes: HamburgerNavTerm[],
  id: string,
  patch: Partial<HamburgerNavTerm>,
): HamburgerNavTerm[] {
  return nodes.map(node => {
    if (node.id === id) return { ...node, ...patch };
    if (node.children.length) {
      return { ...node, children: patchTermInTree(node.children, id, patch) };
    }
    return node;
  });
}

// ── Sitemap Miller-column drilldown ───────────────────────────────────────────

type SitemapColumnsProps = {
  roots: HamburgerNavTerm[];
  onNavigate: () => void;
  canEdit: boolean;
  renameUrl: string;
  createUrl: string;
  deleteUrl: string;
  setNavUrl: string;
  setSitemapUrl: string;
  onNavChange: (id: string, inNav: boolean) => void;
  onSitemapChange: (id: string, inSitemap: boolean) => void;
};

function SitemapColumns({
  roots,
  onNavigate,
  canEdit,
  renameUrl,
  createUrl,
  deleteUrl,
  setNavUrl,
  setSitemapUrl,
  onNavChange,
  onSitemapChange,
}: SitemapColumnsProps) {
  const [path, setPath] = React.useState<string[]>([]);

  function termsAtLevel(level: number): HamburgerNavTerm[] {
    if (level === 0) return roots;
    let node = roots.find(t => t.id === path[0]);
    for (let i = 1; i < level; i++) {
      if (!node) return [];
      node = node.children.find(t => t.id === path[i]);
    }
    return node?.children ?? [];
  }

  function selectAtLevel(level: number, id: string) {
    setPath(prev => {
      const next = prev.slice(0, level);
      next[level] = id;
      return next;
    });
  }

  const numCols = path.length + 1;

  return (
    <div className="scn-hamburger-nav__sitemap-cols">
      {Array.from({ length: numCols }, (_, level) => {
        const terms = termsAtLevel(level);
        if (!terms.length) return null;
        return (
          <React.Fragment key={level}>
            {level > 0 && (
              <Separator orientation="vertical" className="scn-hamburger-nav__sitemap-vsep" />
            )}
            <div className="scn-hamburger-nav__sitemap-col">
              {terms.map(term => {
                const isSelected = path[level] === term.id;
                const hasChildren = term.children.length > 0;
                const itemClass = cn(
                  'scn-hamburger-nav__sitemap-item',
                  isSelected && 'scn-hamburger-nav__sitemap-item--selected',
                );
                const control = hasChildren ? (
                  <button
                    type="button"
                    className={itemClass}
                    onMouseEnter={() => selectAtLevel(level, term.id)}
                    onFocus={() => selectAtLevel(level, term.id)}
                  >
                    <span>{term.name}</span>
                    <ChevronRight size={14} aria-hidden />
                  </button>
                ) : (
                  <a href={term.href} className={itemClass} onClick={onNavigate}>
                    {term.name}
                  </a>
                );
                return (
                  <div key={term.id} className="scn-hamburger-nav__sitemap-item-row">
                    {control}
                    {canEdit && (
                      <CategoryEditPopover
                        target={term}
                        canEdit={canEdit}
                        renameUrl={renameUrl}
                        createUrl={createUrl}
                        deleteUrl={deleteUrl}
                        setNavUrl={setNavUrl}
                        setSitemapUrl={setSitemapUrl}
                        onNavChange={onNavChange}
                        onSitemapChange={onSitemapChange}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

function HamburgerNav({
  payload,
  canEdit,
  createUrl,
  deleteUrl,
  renameUrl,
  setNavUrl,
  setSitemapUrl,
}: {
  payload: HamburgerNavPayload;
  canEdit: boolean;
  createUrl: string;
  deleteUrl: string;
  renameUrl: string;
  setNavUrl: string;
  setSitemapUrl: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [terms, setTerms] = React.useState<HamburgerNavTerm[]>(payload.terms);

  const sitemapTerms = terms.filter(t => t.inSitemap);

  function patchTerm(id: string, patch: Partial<HamburgerNavTerm>) {
    setTerms(prev => patchTermInTree(prev, id, patch));
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--icon site-header__icon-btn"
        aria-label="Menu"
        onClick={() => setOpen(true)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">menu</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="scn-hamburger-nav__dialog">
          <div className="scn-hamburger-nav__dialog-header">
            <DialogTitle className="scn-hamburger-nav__dialog-title">Site map</DialogTitle>
            <DialogClose asChild>
              <button type="button" className="scn-hamburger-nav__close-btn" aria-label="Close site map">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </DialogClose>
          </div>

          <div className="scn-hamburger-nav__body">
            <div className="scn-hamburger-nav__section scn-hamburger-nav__section--sitemap">
              {sitemapTerms.length > 0 ? (
                <SitemapColumns
                  roots={sitemapTerms}
                  onNavigate={() => setOpen(false)}
                  canEdit={canEdit}
                  renameUrl={renameUrl}
                  createUrl={createUrl}
                  deleteUrl={deleteUrl}
                  setNavUrl={setNavUrl}
                  setSitemapUrl={setSitemapUrl}
                  onNavChange={(id, inNav) => patchTerm(id, { inNav })}
                  onSitemapChange={(id, inSitemap) => patchTerm(id, { inSitemap })}
                />
              ) : (
                <p className="scn-hamburger-nav__sitemap-empty">
                  No site map categories yet.
                  {canEdit && ' Enable "Site map" on taxonomy categories to show them here.'}
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────

const roots = new Map<HTMLElement, Root>();

export function mountShadcnHamburgerNav(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-hamburger-nav]').forEach(host => {
    if (host.dataset['shadcnHamburgerNavBound'] === '1') return;
    host.dataset['shadcnHamburgerNavBound'] = '1';

    const jsonId = host.dataset['jsonId'] ?? '';
    const payload = readPayload(jsonId) ?? { terms: [] };
    const canEdit = host.dataset['canEdit'] === '1';
    const createUrl = host.dataset['createUrl'] ?? '';
    const deleteUrl = host.dataset['deleteUrl'] ?? '';
    const renameUrl = host.dataset['renameUrl'] ?? '';
    const setNavUrl = host.dataset['setNavUrl'] ?? '';
    const setSitemapUrl = host.dataset['setSitemapUrl'] ?? '';

    let root = roots.get(host);
    if (!root) { root = createRoot(host); roots.set(host, root); }

    root.render(
      <HamburgerNav
        payload={payload}
        canEdit={canEdit}
        createUrl={createUrl}
        deleteUrl={deleteUrl}
        renameUrl={renameUrl}
        setNavUrl={setNavUrl}
        setSitemapUrl={setSitemapUrl}
      />,
    );
  });
}
