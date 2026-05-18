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
  return `bento-${cols}x${rows}-h${height}-w${width}-${featKey}`;
}
