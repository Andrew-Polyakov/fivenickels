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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTrigger,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { RteEditor } from '../components/ui/rte-editor';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { FxBrokerCardView, type FxBrokerPayload } from './shadcn-fx-broker-card';
import { BigTraderCardView, type BigTraderCardPayload } from './shadcn-big-trader-card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '../components/ui/carousel';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { BrokerLogoUpload } from '../components/ui/broker-logo-upload';
import { cn } from '../lib/utils';

export type BrokerCategoryRating = { label: string; score: number };

export type BrokerRow = {
  id: number;
  slug?: string | null;
  rank: number;
  broker_name: string;
  favicon_url: string;
  logo_rect_url?: string;
  logo_square_url?: string;
  overall_rating: number;
  reviews: number;
  broker_type: string;
  regulation: string;
  min_deposit: number;
  leverage: string;
  website: string;
  overview?: string;
  best_for: string;
  category_ratings?: BrokerCategoryRating[];
  detail_url?: string;
};

type Country = { code: string; name: string };

type EditScope = 'global' | 'country';
type LogoTab = 'rect' | 'square';
type DialogTab = 'edit' | 'preview';
type PreviewTab = 'big' | 'small';

type BrokerFieldErrorKey = keyof BrokerRow | 'category_ratings' | 'best_for' | '__all__';
type FieldErrors = Partial<Record<BrokerFieldErrorKey, string>>;

type SaveErrorResponse = {
  error?: string;
  field_errors?: Record<string, string[]>;
};

function parseFieldErrors(json: SaveErrorResponse): FieldErrors {
  const out: FieldErrors = {};
  if (!json.field_errors) return out;
  for (const [field, messages] of Object.entries(json.field_errors)) {
    const msg = Array.isArray(messages) ? messages[0] : String(messages);
    if (msg) out[field as BrokerFieldErrorKey] = msg;
  }
  return out;
}

const GLOBAL_EDIT_FIELDS: Array<keyof BrokerRow> = [
  'rank',
  'broker_name',
  'favicon_url',
  'overall_rating',
  'reviews',
  'broker_type',
  'regulation',
  'min_deposit',
  'leverage',
  'website',
  'overview',
  'best_for',
  'category_ratings',
];

/** Match BrokerRating.overall_rating (max 1 decimal); avoids float JSON noise. */
function roundOverallRating(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(5, Math.max(0, n)) * 10) / 10;
}

function normalizeBrokerDraft(row: BrokerRow): BrokerRow {
  const ratings = (row.category_ratings ?? []).map((r) => ({
    label: (r.label ?? '').trim(),
    score: roundOverallRating(r.score),
  })).filter((r) => r.label);
  return {
    ...row,
    overall_rating: roundOverallRating(row.overall_rating),
    category_ratings: ratings,
    logo_rect_url: row.logo_rect_url ?? '',
    logo_square_url: row.logo_square_url ?? '',
    overview: row.overview ?? '',
  };
}

function draftToBigTraderPayload(draft: BrokerRow): BigTraderCardPayload {
  return {
    kind: 'big_trader_card',
    brokerId: draft.id,
    brokerName: draft.broker_name,
    slug: draft.slug ?? '',
    detailUrl: draft.detail_url ?? '',
    website: draft.website ?? '',
    faviconUrl: draft.favicon_url || '',
    logoRectUrl: draft.logo_rect_url || '',
    logoSquareUrl: draft.logo_square_url || '',
    displayLogoUrl: draft.logo_rect_url || draft.favicon_url || '',
    overview: draft.overview ?? '',
    bestForHtml: draft.best_for ?? '',
    overallRating: draft.overall_rating,
    reviews: Number(draft.reviews || 0),
    categoryRatings: draft.category_ratings ?? [],
    uploadUrl: '',
    updateUrl: '',
    isStaff: false,
  };
}

function buildGlobalSaveBody(row: BrokerRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of GLOBAL_EDIT_FIELDS) {
    out[key] = row[key] ?? null;
  }
  return out;
}

function CategoryRatingsEditor({
  rows,
  onChange,
  error,
  onClearError,
}: {
  rows: BrokerCategoryRating[];
  onChange: (rows: BrokerCategoryRating[]) => void;
  error?: string;
  onClearError?: () => void;
}) {
  return (
    <div
      className={cn(
        'scn-broker-edit__field scn-broker-edit__field--full',
        error && 'scn-broker-edit__field--invalid',
      )}
    >
      <Label className="scn-broker-edit__label">Score subcategories</Label>
      <div className="scn-broker-category-ratings">
        {rows.map((row, index) => (
          <div key={index} className="scn-broker-category-ratings__row">
            <Input
              placeholder="Label (e.g. Cost)"
              value={row.label}
              onChange={(e) => {
                const next = rows.slice();
                next[index] = { ...next[index], label: e.target.value };
                onChange(next);
                onClearError?.();
              }}
            />
            <Input
              type="number"
              step="0.1"
              min="0"
              max="5"
              placeholder="Score"
              value={row.score}
              onChange={(e) => {
                const next = rows.slice();
                next[index] = {
                  ...next[index],
                  score: roundOverallRating(Number(e.target.value)),
                };
                onChange(next);
                onClearError?.();
              }}
            />
            <Button
              type="button"
              variant="ghost"
              className="scn-broker-category-ratings__remove"
              aria-label="Remove category"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="scn-broker-category-ratings__add"
          onClick={() => {
            onChange([...rows, { label: '', score: 5 }]);
            onClearError?.();
          }}
        >
          Add subcategory
        </Button>
      </div>
      {error && (
        <p className="scn-broker-edit__field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function useElementWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = React.useState<number | undefined>();

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => setWidth(Math.round(el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref]);

  return width;
}

type EditPopoverProps = {
  row: BrokerRow;
  updateUrl: string;
  currentCountry: string;
  countries: Country[];
  isAdmin: boolean;
  dialogWidth?: number;
  onSaved: (updated: BrokerRow) => void;
};

function EditPopover({
  row,
  updateUrl,
  currentCountry,
  countries,
  isAdmin,
  dialogWidth,
  onSaved,
}: EditPopoverProps) {
  if (!isAdmin) return null;

  const countryActive = Boolean(currentCountry);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<BrokerRow>({ ...row });
  const [editScope, setEditScope] = React.useState<EditScope>(countryActive ? 'country' : 'global');
  const [logoTab, setLogoTab] = React.useState<LogoTab>('rect');
  const [dialogTab, setDialogTab] = React.useState<DialogTab>('edit');
  const [previewTab, setPreviewTab] = React.useState<PreviewTab>('big');
  const [saving, setSaving] = React.useState(false);
  const [logoUploading, setLogoUploading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});

  const isCountryScope = editScope === 'country' && countryActive;
  const countryLabel =
    countries.find((c) => c.code === currentCountry)?.name ?? currentCountry;

  React.useEffect(() => {
    if (!open) return;
    setDraft(normalizeBrokerDraft(row));
    setError('');
    setFieldErrors({});
    setEditScope(countryActive ? 'country' : 'global');
    setLogoTab('rect');
    setDialogTab('edit');
    setPreviewTab('big');
  }, [open, row, countryActive]);

  function clearFieldError(key: BrokerFieldErrorKey) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function fieldError(key: BrokerFieldErrorKey): string | undefined {
    return fieldErrors[key];
  }

  function field(
    label: string,
    key: keyof BrokerRow,
    type = 'text',
    inputProps?: Omit<React.ComponentProps<typeof Input>, 'id' | 'type' | 'value' | 'onChange'>,
  ) {
    const fieldId = `bef-${String(key)}`;
    const err = fieldError(key);
    return (
      <div className={cn('scn-broker-edit__field', err && 'scn-broker-edit__field--invalid')}>
        <Label htmlFor={fieldId} className="scn-broker-edit__label">{label}</Label>
        <Input
          id={fieldId}
          type={type}
          step={type === 'number' && inputProps?.step === undefined ? 'any' : inputProps?.step}
          value={draft[key] as string | number}
          aria-invalid={err ? true : undefined}
          className={cn(err && 'scn-input--invalid')}
          onChange={(e) => {
            const raw = e.target.value;
            let parsed: string | number = type === 'number' ? (raw === '' ? 0 : Number(raw)) : raw;
            if (key === 'overall_rating' && typeof parsed === 'number') {
              parsed = roundOverallRating(parsed);
            }
            setDraft((prev) => ({ ...prev, [key]: parsed }));
            clearFieldError(key);
          }}
          {...inputProps}
        />
        {err && (
          <p className="scn-broker-edit__field-error" role="alert">
            {err}
          </p>
        )}
      </div>
    );
  }

  const ratingField = field('Overall rating', 'overall_rating', 'number', {
    step: '0.1',
    min: '0',
    max: '5',
  });

  async function uploadLogo(file: File, kind: LogoTab) {
    if (!file.type.startsWith('image/')) {
      const logoKey = kind === 'rect' ? 'logo_rect_url' : 'logo_square_url';
      setFieldErrors((prev) => ({ ...prev, [logoKey]: 'Please select an image file.' }));
      return;
    }
    setLogoUploading(true);
    setError('');
    clearFieldError(kind === 'rect' ? 'logo_rect_url' : 'logo_square_url');
    const fd = new FormData();
    fd.append('image', file);
    const csrf =
      document.querySelector<HTMLInputElement>('input[name="csrfmiddlewaretoken"]')?.value ?? '';
    try {
      const uploadUrl = `/inline/brokers/${row.id}/upload-logo/?logo_kind=${encodeURIComponent(kind)}`;
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf },
        body: fd,
      });
      const json = (await res.json()) as SaveErrorResponse & { url?: string };
      if (!res.ok || !json.url) {
        const logoKey = kind === 'rect' ? 'logo_rect_url' : 'logo_square_url';
        const parsed = parseFieldErrors(json);
        if (Object.keys(parsed).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...parsed }));
        } else {
          setFieldErrors((prev) => ({ ...prev, [logoKey]: json.error ?? 'Logo upload failed' }));
        }
        setDialogTab('edit');
        return;
      }
      const logoKey = kind === 'rect' ? 'logo_rect_url' : 'logo_square_url';
      setDraft((prev) => ({
        ...prev,
        [logoKey]: json.url || '',
      }));
      clearFieldError(logoKey);
    } catch {
      setError('Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  }

  const activeLogoUrl = logoTab === 'rect' ? (draft.logo_rect_url || '') : (draft.logo_square_url || '');

  async function handleSave() {
    setSaving(true);
    setError('');
    setFieldErrors({});
    const normalized = normalizeBrokerDraft(draft);
    const base = updateUrl.replace('/0/', `/${row.id}/`);
    const url =
      isCountryScope
        ? `${base}?country=${encodeURIComponent(currentCountry)}`
        : base;
    const body =
      isCountryScope
        ? { overall_rating: normalized.overall_rating, rank: normalized.rank }
        : buildGlobalSaveBody(normalized);
    try {
      const csrf =
        document.querySelector<HTMLInputElement>('input[name="csrfmiddlewaretoken"]')?.value ?? '';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as SaveErrorResponse;
      if (!res.ok) {
        const parsed = parseFieldErrors(json);
        setFieldErrors(parsed);
        setDialogTab('edit');
        const hasFieldErrors = Object.keys(parsed).length > 0;
        setError(hasFieldErrors ? '' : (json.error ?? 'Save failed'));
      } else {
        onSaved(normalized);
        setOpen(false);
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="scn-broker-edit-trigger"
          aria-label="Edit broker"
          title="Edit broker"
        >
          <PenIcon />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="scn-broker-edit-dialog"
        style={
          dialogWidth
            ? { width: dialogWidth, maxWidth: 'min(100vw - 2rem, 100%)' }
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>Edit broker</DialogTitle>
          <DialogDescription className="scn-sr-only">
            Edit broker details, logos, overview, and score subcategories.
          </DialogDescription>
        </DialogHeader>
        <DialogClose className="scn-dialog-close">✕</DialogClose>
        {countryActive && (
          <div className="scn-broker-edit__scope">
            <Label className="scn-broker-edit__label">Apply changes to</Label>
            <ToggleGroup
              value={editScope}
              onValueChange={(v) => setEditScope(v as EditScope)}
              className="scn-broker-edit__scope-toggle"
            >
              <ToggleGroupItem value="country">
                Country ({currentCountry})
              </ToggleGroupItem>
              <ToggleGroupItem value="global">Global broker</ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
        {isCountryScope && (
          <p className="scn-broker-edit__scope-hint">
            Editing rating and rank for {countryLabel} only. Other fields are unchanged for this country.
          </p>
        )}
        {fieldErrors.__all__ && (
          <p className="scn-broker-edit__form-error" role="alert">
            {fieldErrors.__all__}
          </p>
        )}
        <Tabs
          value={dialogTab}
          onValueChange={(v) => setDialogTab(v as DialogTab)}
          className="scn-broker-edit__tabs"
        >
          <TabsList className="scn-broker-edit__tabs-list">
            <TabsTrigger value="edit">Details</TabsTrigger>
            {!isCountryScope && <TabsTrigger value="preview">Preview</TabsTrigger>}
          </TabsList>
          <TabsContent value="edit" className="scn-broker-edit__tab-panel">
            <div className="scn-broker-edit__grid">
              {isCountryScope ? (
                <>
                  {ratingField}
                  {field('Rank', 'rank', 'number', { min: '1' })}
                </>
              ) : (
                <>
                  {ratingField}
                  {field('Name', 'broker_name')}
                  {field('Favicon URL', 'favicon_url')}
                  {field('Rank', 'rank', 'number', { min: '1' })}
                  {field('Reviews', 'reviews', 'number')}
                  {field('Type', 'broker_type')}
                  {field('Regulation', 'regulation')}
                  {field('Min Deposit ($)', 'min_deposit', 'number')}
                  {field('Leverage', 'leverage')}
                  {field('Website', 'website')}
                  <div
                    className={cn(
                      'scn-broker-edit__field scn-broker-edit__field--full',
                      (fieldError('logo_rect_url') || fieldError('logo_square_url')) &&
                        'scn-broker-edit__field--invalid',
                    )}
                  >
                    <Label className="scn-broker-edit__label">Logos</Label>
                    <ToggleGroup
                      value={logoTab}
                      onValueChange={(v) => v && setLogoTab(v as LogoTab)}
                      className="scn-broker-edit__logo-tabs"
                    >
                      <ToggleGroupItem value="rect">Rectangular (Big card)</ToggleGroupItem>
                      <ToggleGroupItem value="square">Square (Bento small card)</ToggleGroupItem>
                    </ToggleGroup>
                    <BrokerLogoUpload
                      label={
                        logoTab === 'rect'
                          ? 'No rectangular logo (big card)'
                          : 'No square logo (Bento small card)'
                      }
                      currentUrl={activeLogoUrl || undefined}
                      disabled={logoUploading}
                      invalid={Boolean(
                        logoTab === 'rect' ? fieldError('logo_rect_url') : fieldError('logo_square_url'),
                      )}
                      error={
                        logoTab === 'rect'
                          ? fieldError('logo_rect_url')
                          : fieldError('logo_square_url')
                      }
                      onUpload={(file) => uploadLogo(file, logoTab)}
                    />
                  </div>
                  <div
                    className={cn(
                      'scn-broker-edit__field scn-broker-edit__field--full',
                      fieldError('overview') && 'scn-broker-edit__field--invalid',
                    )}
                  >
                    <Label htmlFor="bef-overview" className="scn-broker-edit__label">Overview</Label>
                    <textarea
                      id="bef-overview"
                      className={cn('scn-input scn-broker-edit__textarea', fieldError('overview') && 'scn-input--invalid')}
                      rows={4}
                      value={draft.overview ?? ''}
                      aria-invalid={fieldError('overview') ? true : undefined}
                      onChange={(e) => {
                        setDraft((prev) => ({ ...prev, overview: e.target.value }));
                        clearFieldError('overview');
                      }}
                    />
                    {fieldError('overview') && (
                      <p className="scn-broker-edit__field-error" role="alert">
                        {fieldError('overview')}
                      </p>
                    )}
                  </div>
                  <CategoryRatingsEditor
                    rows={draft.category_ratings ?? []}
                    error={fieldError('category_ratings')}
                    onClearError={() => clearFieldError('category_ratings')}
                    onChange={(category_ratings) => setDraft((prev) => ({ ...prev, category_ratings }))}
                  />
                  <div
                    className={cn(
                      'scn-broker-edit__field scn-broker-edit__field--full',
                      fieldError('best_for') && 'scn-broker-edit__field--invalid',
                    )}
                  >
                    <Label className="scn-broker-edit__label">Best for</Label>
                    <RteEditor
                      key={String(open)}
                      initialValue={draft.best_for}
                      placeholder="Describe who this broker is best for…"
                      onChange={(v) => {
                        setDraft((prev) => ({ ...prev, best_for: v }));
                        clearFieldError('best_for');
                      }}
                    />
                    {fieldError('best_for') && (
                      <p className="scn-broker-edit__field-error" role="alert">
                        {fieldError('best_for')}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </TabsContent>
          {!isCountryScope && (
            <TabsContent value="preview" className="scn-broker-edit__tab-panel">
              <Tabs
                value={previewTab}
                onValueChange={(v) => setPreviewTab(v as PreviewTab)}
                className="scn-broker-edit__preview-tabs"
              >
                <TabsList className="scn-broker-edit__preview-tabs-list">
                  <TabsTrigger value="big">Big trader card</TabsTrigger>
                  <TabsTrigger value="small">Small FX card</TabsTrigger>
                </TabsList>
                <TabsContent value="big" className="scn-broker-edit__preview-pane">
                  <BigTraderCardView initial={draftToBigTraderPayload(draft)} />
                </TabsContent>
                <TabsContent value="small" className="scn-broker-edit__preview-pane">
                  <FxBrokerCardView
                    data={{
                      kind: 'fxbroker',
                      brokerName: draft.broker_name,
                      logoUrl: draft.logo_square_url || draft.favicon_url || undefined,
                      faviconUrl: draft.favicon_url || undefined,
                      overallRating: draft.overall_rating,
                      website: draft.website || undefined,
                    } satisfies FxBrokerPayload}
                  />
                </TabsContent>
              </Tabs>
            </TabsContent>
          )}
        </Tabs>
        {error && <p className="scn-broker-edit__error" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" className="scn-broker-edit__cancel" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className="scn-broker-edit__save" onClick={() => void handleSave()} disabled={saving}>
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
  countries: Country[],
  expandedId: number | null,
  onToggleExpand: (id: number) => void,
  onRowUpdate: (updated: BrokerRow) => void,
  ctaLabel: string,
  ctaButtonText: string,
  ctaUrl: string,
  dialogWidth?: number,
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
            <EditPopover
              row={row.original}
              updateUrl={updateUrl}
              currentCountry={countryCode}
              countries={countries}
              isAdmin={isAdmin}
              dialogWidth={dialogWidth}
              onSaved={onRowUpdate}
            />
          )}
          {row.original.favicon_url && (
            <img className="scn-broker-favicon" src={row.original.favicon_url} alt="" width={16} height={16} loading="lazy" />
          )}
          {row.original.detail_url ? (
            <a className="scn-broker-name__text" href={row.original.detail_url}>
              {row.getValue('broker_name')}
            </a>
          ) : (
            <span className="scn-broker-name__text">{row.getValue('broker_name')}</span>
          )}
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
      id: 'website',
      header: '',
      cell: ({ row }) => row.original.website ? (
        <a
          href={row.original.website}
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
  const tableRef = React.useRef<HTMLDivElement>(null);
  const dialogWidth = useElementWidth(tableRef);

  function toggleExpand(id: number) {
    setExpandedId(prev => prev === id ? null : id);
  }

  const handleRowUpdate = React.useCallback((updated: BrokerRow) => {
    setData((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  const columns = React.useMemo(
    () =>
      buildColumns(
        isAdmin,
        updateUrl,
        currentCountry,
        countries,
        expandedId,
        toggleExpand,
        handleRowUpdate,
        ctaLabel,
        ctaButtonText,
        ctaUrl,
        dialogWidth,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin, updateUrl, currentCountry, countries, expandedId, handleRowUpdate, ctaLabel, ctaButtonText, ctaUrl, dialogWidth],
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
    <div ref={tableRef} className="scn-broker-table">
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
    logoUrl: broker.logo_square_url || broker.favicon_url || undefined,
    faviconUrl: broker.favicon_url || undefined,
    overallRating: broker.overall_rating,
    website: broker.website || undefined,
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
              <DialogDescription className="scn-sr-only">
                Choose a broker to add to the carousel.
              </DialogDescription>
            </DialogHeader>
            <DialogClose className="scn-dialog-close">✕</DialogClose>
            <div className="scn-broker-picker__list">
              {available.map((broker) => (
                <button
                  key={broker.id}
                  className="scn-broker-picker__item"
                  onClick={() => add(broker)}
                >
                  {(broker.logo_square_url || broker.favicon_url) && (
                    <img
                      src={broker.logo_square_url || broker.favicon_url}
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

function unmountBrokerHosts(
  selector: string,
  boundKey: 'shadcnBrokerTableBound' | 'shadcnBrokerCarouselBound',
  root?: ParentNode,
) {
  const scope = root ?? document;
  scope.querySelectorAll<HTMLElement>(selector).forEach((host) => {
    const existing = brokerTableRoots.get(host);
    if (existing) {
      existing.unmount();
      brokerTableRoots.delete(host);
    }
    delete host.dataset[boundKey];
  });
}

export function unmountShadcnBrokerTable(root?: ParentNode): void {
  unmountBrokerHosts('[data-shadcn-broker-table]', 'shadcnBrokerTableBound', root);
}

export function unmountShadcnBrokerCarousel(root?: ParentNode): void {
  unmountBrokerHosts('[data-shadcn-broker-carousel]', 'shadcnBrokerCarouselBound', root);
}

const BROKER_MOUNT_RETRY_MS = [0, 50, 150, 400, 800];

export function scheduleShadcnBrokerMounts(): void {
  BROKER_MOUNT_RETRY_MS.forEach((ms) => {
    window.setTimeout(() => {
      mountShadcnBrokerCarousel();
      mountShadcnBrokerTable();
    }, ms);
  });
}

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
    let root = brokerTableRoots.get(host);
    if (!root) {
      root = createRoot(host);
      brokerTableRoots.set(host, root);
    }
    try {
      root.render(
        <BrokerDataTable
          data={data}
          isAdmin={isAdmin}
          updateUrl={updateUrl}
          countries={countries}
          currentCountry={currentCountry}
          ctaLabel={ctaLabel}
          ctaButtonText={ctaButtonText}
          ctaUrl={ctaUrl}
        />,
      );
      host.dataset['shadcnBrokerTableBound'] = '1';
    } catch (err) {
      console.error('Broker table mount failed', err);
      root.unmount();
      brokerTableRoots.delete(host);
    }
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
    let root = brokerTableRoots.get(host);
    if (!root) {
      root = createRoot(host);
      brokerTableRoots.set(host, root);
    }
    try {
      root.render(<FxBrokerCarousel allBrokers={data} isAdmin={isAdmin} />);
      host.dataset['shadcnBrokerCarouselBound'] = '1';
    } catch (err) {
      console.error('Broker carousel mount failed', err);
      root.unmount();
      brokerTableRoots.delete(host);
    }
  });
}
