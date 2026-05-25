/**
 * Bento block JSON persistence + section dimension styles (taxonomy constructor).
 */

import type { CSSProperties } from 'react';
import {
  normalizeCol,
  normalizeColSpan,
  normalizeGridColumns,
  normalizeGridRows,
  normalizeRow,
  normalizeRowSpan,
} from './bento-grid-layout';
import { computeRowSegments, placeBentoTiles } from './bento-grid-editor-placement';

export interface BentoSectionDimensions {
  height?: string;
  width?: string;
}

export interface BentoFeaturePlacement {
  id: string;
  col_span?: number;
  row_span?: number;
  row?: number | null;
  col?: number | null;
}

export type BentoRowPanelSizes = number[];
export type BentoColPanelSizesByRow = Record<string, number[]>;

export interface BentoPanelLayoutSizes {
  row_panel_sizes?: BentoRowPanelSizes;
  col_panel_sizes_by_row?: BentoColPanelSizesByRow;
}

export function parseBentoSectionDimension(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'auto') return undefined;
  return trimmed;
}

export function bentoSectionHasFixedHeight(dims: BentoSectionDimensions): boolean {
  return Boolean(dims.height);
}

export function bentoSectionSizeStyles(dims: BentoSectionDimensions): {
  shell?: CSSProperties;
  host?: CSSProperties;
} {
  const height = parseBentoSectionDimension(dims.height);
  const width = parseBentoSectionDimension(dims.width);
  const shell: CSSProperties = {};
  const host: CSSProperties = {};
  if (width) {
    shell.maxWidth = width;
    shell.width = '100%';
    shell.marginLeft = 'auto';
    shell.marginRight = 'auto';
  }
  if (height) {
    host.height = height;
    host.minHeight = height;
  }
  return {
    shell: Object.keys(shell).length > 0 ? shell : undefined,
    host: Object.keys(host).length > 0 ? host : undefined,
  };
}

export function normalizePanelSizePctArray(raw: unknown, expectedLen?: number): number[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const nums = raw
    .map((v) => (typeof v === 'number' ? v : parseFloat(String(v))))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return undefined;
  const len = expectedLen !== undefined ? expectedLen : nums.length;
  if (nums.length !== len) return undefined;
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum <= 0) return undefined;
  return nums.map((n) => (n / sum) * 100);
}

export function normalizeColPanelSizesByRow(
  raw: unknown,
  rowCount: number,
): BentoColPanelSizesByRow | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: BentoColPanelSizesByRow = {};
  let any = false;
  for (let r = 0; r < rowCount; r++) {
    const key = String(r);
    const rowRaw = (raw as Record<string, unknown>)[key];
    if (!Array.isArray(rowRaw)) continue;
    const normalized = normalizePanelSizePctArray(rowRaw, rowRaw.length);
    if (normalized?.length) {
      out[key] = normalized;
      any = true;
    }
  }
  return any ? out : undefined;
}

export function panelDefaultSizeAt(
  sizes: number[] | undefined,
  index: number,
  fallback: number,
): number {
  if (!sizes?.length) return fallback;
  const v = sizes[index];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Percentages for react-resizable-panels: length === panelCount, each > 0, sum === 100. */
export function resizablePanelDefaultSizes(
  panelCount: number,
  spanWeights: number[],
  savedPct?: number[],
): number[] {
  if (panelCount <= 0) return [];
  const saved =
    savedPct && savedPct.length === panelCount
      ? normalizePanelSizePctArray(savedPct, panelCount)
      : undefined;
  if (saved) return saved;

  const weights: number[] = [];
  for (let i = 0; i < panelCount; i++) {
    const w = spanWeights[i];
    weights.push(typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 1);
  }
  const sum = weights.reduce((a, b) => a + b, 0) || panelCount;
  return weights.map((w) => (w / sum) * 100);
}

/** Ensure every panel id is unique so defaultLayout has one entry per panel. */
export function ensureUniquePanelIds(panelIds: string[]): string[] {
  const seen = new Map<string, number>();
  return panelIds.map((id) => {
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return n === 0 ? id : `${id}-${n}`;
  });
}

/** Map panel ids to percentages for react-resizable-panels Group `defaultLayout`. */
export function resizablePanelLayoutMap(
  panelIds: string[],
  spanWeights: number[],
  savedPct?: number[],
): Record<string, number> {
  const uniqueIds = ensureUniquePanelIds(panelIds);
  const sizes = resizablePanelDefaultSizes(uniqueIds.length, spanWeights, savedPct);
  const out: Record<string, number> = {};
  uniqueIds.forEach((id, i) => {
    out[id] = sizes[i] ?? 100 / Math.max(uniqueIds.length, 1);
  });
  return out;
}

/** Cap minSize so N panels can each satisfy minSize and still sum to 100%. */
export function resizablePanelMinSize(
  containerPx: number,
  panelCount: number,
  minPanelPctFn: (containerPx: number, panelCount: number) => number,
): number {
  const n = Math.max(panelCount, 1);
  const raw = minPanelPctFn(containerPx, n);
  const fairCap = n > 1 ? (100 / n) * 0.9 : 100;
  return Math.min(raw, fairCap);
}

export function serializeBentoFeaturePlacement<T extends BentoFeaturePlacement>(
  feat: T,
  gridColumns: number,
): T {
  const cols = normalizeGridColumns(gridColumns);
  const row = normalizeRow(feat.row);
  const col = normalizeCol(feat.col, cols);
  const next = {
    ...feat,
    col_span: normalizeColSpan(feat.col_span, cols),
    row_span: normalizeRowSpan(feat.row_span),
  } as T & Record<string, unknown>;
  if (row !== undefined) {
    next.row = row;
  } else {
    delete next.row;
  }
  if (col !== undefined) {
    next.col = col;
  } else {
    delete next.col;
  }
  return next as T;
}

export interface BentoGridPanelPruneInput {
  grid_columns?: number;
  grid_rows?: number;
  row_panel_sizes?: BentoRowPanelSizes;
  col_panel_sizes_by_row?: BentoColPanelSizesByRow;
}

/** Drop or trim panel % arrays when grid column/row counts change. */
export function pruneBentoPanelSizesForGrid<T extends BentoGridPanelPruneInput>(
  block: T,
  gridColumns: number,
  gridRows: number,
  prevGridColumns?: number,
): T {
  const cols = normalizeGridColumns(gridColumns);
  const rows = normalizeGridRows(gridRows);
  const columnsChanged =
    prevGridColumns !== undefined && normalizeGridColumns(prevGridColumns) !== cols;

  const rowSizes = normalizePanelSizePctArray(block.row_panel_sizes, rows);
  const colByRow =
    !columnsChanged && block.col_panel_sizes_by_row
      ? normalizeColPanelSizesByRow(block.col_panel_sizes_by_row, rows)
      : undefined;

  const next = { ...block, grid_columns: cols, grid_rows: rows } as T & BentoGridPanelPruneInput;
  if (rowSizes) {
    next.row_panel_sizes = rowSizes;
  } else {
    delete next.row_panel_sizes;
  }
  if (colByRow) {
    next.col_panel_sizes_by_row = colByRow;
  } else {
    delete next.col_panel_sizes_by_row;
  }
  return next as T;
}

/** Segment topology signature (panel count per row after empty-column merging). */
export function bentoEditorSegmentTopologyKey(
  features: BentoFeaturePlacement[],
  gridColumns: number,
  gridRows: number,
): string {
  const cols = normalizeGridColumns(gridColumns);
  const rows = normalizeGridRows(gridRows);
  const placed = placeBentoTiles(features, cols, cols);
  const parts: string[] = [];
  for (let r = 0; r < rows; r++) {
    const segs = computeRowSegments(placed, r, cols);
    const rowPart = segs
      .map((s) => `${s.width}:${s.placed?.tile.id ?? 'empty'}`)
      .join(',');
    parts.push(`${r}[${rowPart}]`);
  }
  return parts.join(';');
}

/** Remount key for panel groups when grid geometry changes — excludes panel % (those update via panel defaultSize keys). */
export function bentoEditorLayoutStorageKey(
  gridColumns: number,
  gridRows: number,
  dims: BentoSectionDimensions,
  features: BentoFeaturePlacement[],
): string {
  const cols = normalizeGridColumns(gridColumns);
  const rows = normalizeGridRows(gridRows);
  const height = parseBentoSectionDimension(dims.height) ?? 'auto';
  const width = parseBentoSectionDimension(dims.width) ?? 'full';
  const featKey = features
    .map((f) => {
      const colSpan = normalizeColSpan(f.col_span, cols);
      const rowSpan = normalizeRowSpan(f.row_span);
      const row = normalizeRow(f.row) ?? '';
      const col = normalizeCol(f.col, cols) ?? '';
      return `${f.id}:${colSpan}x${rowSpan}@${row},${col}`;
    })
    .join('|');
  const topoKey = bentoEditorSegmentTopologyKey(features, cols, rows);
  return `bento-${cols}x${rows}-h${height}-w${width}-${featKey}-topo${topoKey}`;
}
