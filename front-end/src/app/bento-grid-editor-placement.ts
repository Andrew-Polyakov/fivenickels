/**
 * Editor-only bento placement + resize helpers (maps panel % ↔ col_span / row_span).
 */

import {
  BentoGridTilePlacement,
  effectiveColSpan,
  normalizeCol,
  normalizeColSpan,
  normalizeGridColumns,
  normalizeRow,
  normalizeRowSpan,
} from './bento-grid-layout';

export interface PlacedBentoTile<T extends BentoGridTilePlacement & { id: string }> {
  tile: T;
  startRow: number;
  startCol: number;
  colSpan: number;
  rowSpan: number;
  authoredColSpan: number;
}

export interface BentoEditorRow<T extends BentoGridTilePlacement & { id: string }> {
  rowIndex: number;
  tiles: PlacedBentoTile<T>[];
}

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function placeBentoTiles<T extends BentoGridTilePlacement & { id: string }>(
  tiles: T[],
  gridColumns: number,
  effectiveCols: number,
): PlacedBentoTile<T>[] {
  const cols = normalizeGridColumns(gridColumns);
  const occupied = new Set<string>();
  const placed: PlacedBentoTile<T>[] = [];

  function isFree(row: number, col: number, width: number, height: number): boolean {
    for (let dr = 0; dr < height; dr++) {
      for (let dc = 0; dc < width; dc++) {
        if (col + dc >= effectiveCols) return false;
        if (occupied.has(cellKey(row + dr, col + dc))) return false;
      }
    }
    return true;
  }

  function mark(row: number, col: number, width: number, height: number): void {
    for (let dr = 0; dr < height; dr++) {
      for (let dc = 0; dc < width; dc++) {
        occupied.add(cellKey(row + dr, col + dc));
      }
    }
  }

  for (const tile of tiles) {
    const authoredCol = normalizeColSpan(tile.col_span, cols);
    const colSpan = effectiveColSpan(authoredCol, cols, effectiveCols);
    const rowSpan = normalizeRowSpan(tile.row_span);
    const forcedRow = normalizeRow(tile.row);
    const forcedCol = normalizeCol(tile.col, cols);

    let startRow = 0;
    let startCol = 0;
    let found = false;

    const rowStart = forcedRow !== undefined ? forcedRow - 1 : 0;
    const rowEnd = forcedRow !== undefined ? forcedRow : 64;
    const colCandidates =
      forcedCol !== undefined
        ? [Math.min(forcedCol - 1, effectiveCols - colSpan)]
        : Array.from({ length: Math.max(0, effectiveCols - colSpan + 1) }, (_, i) => i);

    for (let r = rowStart; r < rowEnd && !found; r++) {
      for (const c of colCandidates) {
        if (c < 0 || c > effectiveCols - colSpan) continue;
        if (isFree(r, c, colSpan, rowSpan)) {
          startRow = r;
          startCol = c;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      let r = 0;
      while (!found && r < 128) {
        for (let c = 0; c <= effectiveCols - colSpan; c++) {
          if (isFree(r, c, colSpan, rowSpan)) {
            startRow = r;
            startCol = c;
            found = true;
            break;
          }
        }
        r++;
      }
    }

    mark(startRow, startCol, colSpan, rowSpan);
    placed.push({
      tile,
      startRow,
      startCol,
      colSpan,
      rowSpan,
      authoredColSpan: authoredCol,
    });
  }

  return placed;
}

export function computeBentoRows<T extends BentoGridTilePlacement & { id: string }>(
  tiles: T[],
  gridColumns: number,
  effectiveCols: number,
): BentoEditorRow<T>[] {
  const placed = placeBentoTiles(tiles, gridColumns, effectiveCols);
  const rowMap = new Map<number, PlacedBentoTile<T>[]>();
  for (const p of placed) {
    const list = rowMap.get(p.startRow) ?? [];
    list.push(p);
    rowMap.set(p.startRow, list);
  }
  return [...rowMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rowIndex, rowTiles]) => ({
      rowIndex,
      tiles: rowTiles.sort((a, b) => a.startCol - b.startCol),
    }));
}

/** Snap panel percentages to integer column spans summing to effectiveCols (min 1 each). */
export function colSpansFromPanelSizes(pcts: number[], effectiveCols: number): number[] {
  const n = pcts.length;
  if (n === 0) return [];
  if (n === 1) return [Math.max(1, effectiveCols)];

  const total = pcts.reduce((s, p) => s + p, 0) || 100;
  const quotas = pcts.map((p) => (p / total) * effectiveCols);
  const spans = quotas.map(() => 1);
  let remaining = effectiveCols - n;

  const order = quotas
    .map((q, i) => ({ i, remainder: q - 1 }))
    .sort((a, b) => b.remainder - a.remainder);

  for (const { i } of order) {
    if (remaining <= 0) break;
    spans[i]++;
    remaining--;
  }

  while (remaining > 0) {
    for (let i = 0; i < n && remaining > 0; i++) {
      spans[i]++;
      remaining--;
    }
  }

  while (spans.reduce((s, v) => s + v, 0) > effectiveCols) {
    const idx = spans.findIndex((v) => v > 1);
    if (idx < 0) break;
    spans[idx]--;
  }

  return spans;
}

export function panelSizesFromColSpans(spans: number[]): number[] {
  const sum = spans.reduce((a, b) => a + b, 0) || 1;
  return spans.map((s) => (s / sum) * 100);
}

export function authoredColSpanFromEffective(
  effectiveSpan: number,
  gridColumns: number,
  effectiveCols: number,
): number {
  if (effectiveCols <= 0) return 1;
  const scaled = Math.max(
    1,
    Math.min(gridColumns, Math.round((effectiveSpan * gridColumns) / effectiveCols)),
  );
  return scaled;
}

export function tilesHaveDefaultSpans(tiles: BentoGridTilePlacement[], gridColumns = 3): boolean {
  return tiles.every(
    (t) =>
      normalizeColSpan(t.col_span, gridColumns) === 1 &&
      normalizeRowSpan(t.row_span) === 1 &&
      normalizeRow(t.row) === undefined,
  );
}

/** One-time conversion from legacy panelSizes (hero / horizontal split). */
export function spansFromLegacyPanelSizes(
  panelSizes: number[],
  featureCount: number,
  gridColumns: number,
): Array<{ col_span: number; row_span: number }> {
  const cols = normalizeGridColumns(gridColumns);
  if (featureCount <= 0) return [];
  if (featureCount === 1) {
    return [{ col_span: cols, row_span: 1 }];
  }

  const hLeft = panelSizes[0] ?? 50;
  const leftCols = Math.max(1, Math.min(cols - 1, Math.round((hLeft / 100) * cols)));

  if (featureCount === 2) {
    return [
      { col_span: leftCols, row_span: 1 },
      { col_span: cols - leftCols, row_span: 1 },
    ];
  }

  const rightCount = featureCount - 1;
  const patches: Array<{ col_span: number; row_span: number }> = [
    { col_span: leftCols, row_span: Math.min(3, rightCount) },
  ];
  for (let i = 1; i < featureCount; i++) {
    patches.push({ col_span: cols - leftCols, row_span: 1 });
  }
  return patches;
}

export function isHeroEditorLayout<T extends BentoGridTilePlacement & { id: string }>(
  placed: PlacedBentoTile<T>[],
  effectiveCols: number,
): boolean {
  if (placed.length < 3 || effectiveCols <= 1) return false;
  const first = placed[0];
  const rest = placed.slice(1);
  if (first.startCol !== 0 || first.startRow !== 0) return false;
  if (first.colSpan >= effectiveCols || first.rowSpan < 2) return false;
  const rightCol = first.colSpan;
  return rest.every(
    (p) => p.startCol === rightCol && p.colSpan === effectiveCols - first.colSpan,
  );
}

/** Column indices (0-based) with no tile occupying that column (any row). */
export function getEmptyColumnIndices<T extends BentoGridTilePlacement & { id: string }>(
  placed: PlacedBentoTile<T>[],
  gridColumns: number,
): number[] {
  const cols = normalizeGridColumns(gridColumns);
  const empty: number[] = [];
  for (let c = 0; c < cols; c++) {
    const occupied = placed.some((p) => p.startCol <= c && p.startCol + p.colSpan > c);
    if (!occupied) empty.push(c);
  }
  return empty;
}

/** Column indices (0-based) with no tile in the given row band. */
export function getEmptyColumnIndicesForRow<T extends BentoGridTilePlacement & { id: string }>(
  placed: PlacedBentoTile<T>[],
  rowIndex: number,
  gridColumns: number,
): number[] {
  const cols = normalizeGridColumns(gridColumns);
  const empty: number[] = [];
  for (let c = 0; c < cols; c++) {
    const occupied = placed.some(
      (p) =>
        p.startRow <= rowIndex &&
        p.startRow + p.rowSpan > rowIndex &&
        p.startCol <= c &&
        p.startCol + p.colSpan > c,
    );
    if (!occupied) empty.push(c);
  }
  return empty;
}

export function rowIsOccupied<T extends BentoGridTilePlacement & { id: string }>(
  placed: PlacedBentoTile<T>[],
  rowIndex: number,
): boolean {
  return placed.some((p) => p.startRow <= rowIndex && p.startRow + p.rowSpan > rowIndex);
}

/** Row indices (0-based) in range with no tile coverage. */
export function getEmptyRowIndices<T extends BentoGridTilePlacement & { id: string }>(
  placed: PlacedBentoTile<T>[],
  rowCount: number,
): number[] {
  const rows = Math.max(1, Math.min(3, Math.round(rowCount)));
  const empty: number[] = [];
  for (let r = 0; r < rows; r++) {
    if (!rowIsOccupied(placed, r)) empty.push(r);
  }
  return empty;
}

/** Snap panel percentages to integer row spans summing to rowCount (min 1 each). */
export function rowSpansFromPanelSizes(pcts: number[], rowCount: number): number[] {
  return colSpansFromPanelSizes(pcts, rowCount);
}

export function panelSizesFromRowSpans(spans: number[]): number[] {
  return panelSizesFromColSpans(spans);
}

export interface BentoRowSegment<T extends BentoGridTilePlacement & { id: string }> {
  startCol: number;
  width: number;
  placed?: PlacedBentoTile<T>;
}

function tileOccupiesCell<T extends BentoGridTilePlacement & { id: string }>(
  p: PlacedBentoTile<T>,
  rowIndex: number,
  colIndex: number,
): boolean {
  return (
    p.startRow <= rowIndex &&
    p.startRow + p.rowSpan > rowIndex &&
    p.startCol <= colIndex &&
    p.startCol + p.colSpan > colIndex
  );
}

/** Horizontal resize segments for one row band (tiles + merged empty column runs). */
export function computeRowSegments<T extends BentoGridTilePlacement & { id: string }>(
  placed: PlacedBentoTile<T>[],
  rowIndex: number,
  gridColumns: number,
): BentoRowSegment<T>[] {
  const cols = normalizeGridColumns(gridColumns);
  const segments: BentoRowSegment<T>[] = [];
  let c = 0;

  while (c < cols) {
    const starter = placed.find((p) => p.startRow === rowIndex && p.startCol === c);
    if (starter) {
      segments.push({ startCol: c, width: starter.colSpan, placed: starter });
      c += starter.colSpan;
      continue;
    }

    const occupant = placed.find((p) => tileOccupiesCell(p, rowIndex, c));
    if (occupant) {
      c += 1;
      continue;
    }

    let end = c;
    while (end < cols && !placed.some((p) => tileOccupiesCell(p, rowIndex, end))) {
      end += 1;
    }
    segments.push({ startCol: c, width: end - c });
    c = end;
  }

  return segments;
}

export function minPanelPct(containerPx: number, panelCount: number): number {
  if (panelCount <= 0 || containerPx <= 0) return 100 / Math.max(panelCount, 1);
  const pct = (260 / containerPx) * 100;
  return Math.min(99 / panelCount, Math.max(0.1, pct));
}
