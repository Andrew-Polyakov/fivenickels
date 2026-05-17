/**
 * Shared bento grid layout: effective column count, span scaling, and cell placement.
 */

import * as React from 'react';

export const BENTO_GRID_MIN_TILE_PX = 260;

export interface BentoGridTilePlacement {
  col_span?: number | string;
  row_span?: number | string;
  row?: number | string | null;
  /** 1-based start column (editor placement hint). */
  col?: number | string | null;
}

export function normalizeGridColumns(raw: unknown, fallback = 3): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? fallback), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(6, Math.round(n)));
}

/** Block-level row count (1–3). */
export function normalizeGridRows(raw: unknown, fallback = 3): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? fallback), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(3, Math.round(n)));
}

export function normalizeColSpan(raw: unknown, gridColumns: number): number {
  if (raw === null || raw === undefined) return 1;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(1, Math.min(gridColumns, Math.round(raw)));
  }
  const s = String(raw).trim();
  if (s === '8') return Math.min(2, gridColumns);
  if (s === '4') return 1;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(gridColumns, n));
}

export function normalizeRowSpan(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? 1), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(3, Math.round(n)));
}

export function normalizeRow(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.round(n);
}

export function normalizeCol(raw: unknown, gridColumns: number): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.max(1, Math.min(gridColumns, Math.round(n)));
}

export function useEffectiveColumns(
  containerWidth: number,
  gridColumns: number,
  minTilePx = BENTO_GRID_MIN_TILE_PX,
): number {
  const cols = normalizeGridColumns(gridColumns);
  if (containerWidth <= 0) return cols;
  const fit = Math.max(1, Math.floor(containerWidth / minTilePx));
  return Math.min(cols, fit);
}

export function effectiveColSpan(
  authoredColSpan: number,
  gridColumns: number,
  effectiveCols: number,
): number {
  if (effectiveCols <= 1) return 1;
  const authored = normalizeColSpan(authoredColSpan, gridColumns);
  const scaled = Math.max(1, Math.round((authored * effectiveCols) / gridColumns));
  return Math.min(effectiveCols, scaled);
}

export function bentoCellGridStyle(
  tile: BentoGridTilePlacement,
  gridColumns: number,
  effectiveCols: number,
): React.CSSProperties {
  const authoredCol = normalizeColSpan(tile.col_span, gridColumns);
  const colSpan = effectiveColSpan(authoredCol, gridColumns, effectiveCols);
  const rowSpan = normalizeRowSpan(tile.row_span);
  const rowStart = normalizeRow(tile.row);

  if (effectiveCols <= 1) {
    return {
      gridColumn: '1 / -1',
      gridRow: `span ${rowSpan}`,
    };
  }

  const style: React.CSSProperties = {
    gridColumn: `span ${colSpan}`,
    gridRow: `span ${rowSpan}`,
  };
  if (rowStart !== undefined) {
    style.gridRowStart = rowStart;
  }
  return style;
}

export function useContainerWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setWidth(el.getBoundingClientRect().width);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return width;
}

export interface BentoGridLayoutProps<T extends BentoGridTilePlacement> {
  gridColumns: number;
  gridRows?: number;
  tiles: T[];
  className?: string;
  gridClassName?: string;
  cellClassName?: string;
  minTilePx?: number;
  style?: React.CSSProperties;
  renderTile: (tile: T, index: number) => React.ReactNode;
  getTileKey?: (tile: T, index: number) => string | number;
}

export function BentoGridLayout<T extends BentoGridTilePlacement>({
  gridColumns,
  gridRows: gridRowsProp,
  tiles,
  className,
  gridClassName = 'scn-bentogrid01__grid',
  cellClassName = 'scn-bentogrid01__cell',
  minTilePx = BENTO_GRID_MIN_TILE_PX,
  style,
  renderTile,
  getTileKey,
}: BentoGridLayoutProps<T>): React.JSX.Element {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(hostRef);
  const cols = normalizeGridColumns(gridColumns);
  const rows = normalizeGridRows(gridRowsProp);
  const effectiveCols = useEffectiveColumns(containerWidth, cols, minTilePx);

  const gridStyle: React.CSSProperties = {
    ...style,
    ['--bento-columns' as string]: String(effectiveCols),
    ['--bento-rows' as string]: String(rows),
    gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, auto))`,
  };

  return (
    <div ref={hostRef} className={className}>
      <div
        className={gridClassName}
        style={gridStyle}
        data-effective-columns={effectiveCols}
      >
        {tiles.map((tile, i) => (
          <div
            key={getTileKey ? getTileKey(tile, i) : i}
            className={cellClassName}
            style={bentoCellGridStyle(tile, cols, effectiveCols)}
          >
            {renderTile(tile, i)}
          </div>
        ))}
      </div>
    </div>
  );
}
