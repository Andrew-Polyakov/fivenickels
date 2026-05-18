/**
 * Taxonomy editor bento layout: row bands with resizable columns/rows and empty slots.
 */

import * as React from 'react';
import { cn } from '../lib/utils';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../components/ui/resizable';
import {
  normalizePanelSizePctArray,
  panelDefaultSizeAt,
  type BentoColPanelSizesByRow,
  type BentoRowPanelSizes,
} from './bento-block-persist';
import {
  BENTO_GRID_MIN_TILE_PX,
  BentoGridTilePlacement,
  normalizeGridColumns,
  normalizeGridRows,
  useContainerWidth,
} from './bento-grid-layout';
import {
  authoredColSpanFromEffective,
  colSpansFromPanelSizes,
  computeRowSegments,
  getEmptyRowIndices,
  minPanelPct,
  panelSizesFromColSpans,
  panelSizesFromRowSpans,
  placeBentoTiles,
  rowSpansFromPanelSizes,
  type BentoRowSegment,
  type PlacedBentoTile,
} from './bento-grid-editor-placement';

export type { PlacedBentoTile, BentoEditorRow, BentoRowSegment } from './bento-grid-editor-placement';
export {
  colSpansFromPanelSizes,
  computeBentoRows,
  computeRowSegments,
  panelSizesFromColSpans,
  spansFromLegacyPanelSizes,
  tilesHaveDefaultSpans,
  getEmptyColumnIndices,
  getEmptyColumnIndicesForRow,
  getEmptyRowIndices,
  rowSpansFromPanelSizes,
} from './bento-grid-editor-placement';

const COL_HANDLE_CLASS = cn(
  'scn-resize-handle',
  'scn-resize-handle--between-columns',
  'scn-resize-handle--with-grip',
);

const ROW_HANDLE_CLASS = cn(
  'scn-resize-handle',
  'scn-resize-handle--between-rows',
  'scn-resize-handle--with-grip',
);

export interface BentoTileSpanPatch {
  id: string;
  col_span?: number;
  row_span?: number;
  row?: number;
  col?: number;
}

export interface BentoLayoutPersistPatch {
  row_panel_sizes?: BentoRowPanelSizes;
  col_panel_sizes_by_row?: BentoColPanelSizesByRow;
  tileSpanPatches?: BentoTileSpanPatch[];
}

type PanelLayoutValue = number | { size?: number; percentage?: number; percent?: number };
type PanelLayout = readonly PanelLayoutValue[] | { readonly [panelId: string]: PanelLayoutValue };

export interface BentoGridEditorLayoutProps<T extends BentoGridTilePlacement & { id: string }> {
  gridColumns: number;
  gridRows?: number;
  tiles: T[];
  className?: string;
  style?: React.CSSProperties;
  minTilePx?: number;
  resizable?: boolean;
  layoutStorageKey?: string;
  rowPanelSizes?: BentoRowPanelSizes;
  colPanelSizesByRow?: BentoColPanelSizesByRow;
  renderTile: (tile: T, index: number) => React.ReactNode;
  getTileKey?: (tile: T, index: number) => string | number;
  renderEmptyColumn: (colIndex: number, rowIndex: number) => React.ReactNode;
  renderEmptyRow: (rowIndex: number) => React.ReactNode;
  onLayoutPersist?: (patch: BentoLayoutPersistPatch) => void;
}

function tilesStartingInRow<T extends BentoGridTilePlacement & { id: string }>(
  placed: PlacedBentoTile<T>[],
  rowIndex: number,
): PlacedBentoTile<T>[] {
  return placed.filter((p) => p.startRow === rowIndex).sort((a, b) => a.startCol - b.startCol);
}

function panelLayoutValueToNumber(value: PanelLayoutValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== 'object' || value === null) return undefined;
  for (const key of ['size', 'percentage', 'percent'] as const) {
    const raw = value[key];
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  }
  return undefined;
}

export function panelLayoutToSizes(
  layout: PanelLayout,
  panelIds: string[],
  fallbackSizes?: number[],
): number[] {
  const rawSizes = Array.isArray(layout)
    ? layout.map((value) => panelLayoutValueToNumber(value))
    : panelIds.map((id) =>
        panelLayoutValueToNumber(
          (layout as Readonly<Record<string, PanelLayoutValue>>)[id],
        ),
      );
  const normalized = normalizePanelSizePctArray(rawSizes, panelIds.length);
  if (normalized) return normalized;
  return normalizePanelSizePctArray(fallbackSizes, panelIds.length)
    ?? panelSizesFromColSpans(panelIds.map(() => 1));
}

function segmentPanelId(rowIndex: number, segIndex: number, tileId?: string): string {
  return tileId
    ? `bento-seg-${rowIndex}-${tileId}`
    : `bento-seg-${rowIndex}-empty-${segIndex}`;
}

function panelFlexStyle(size: number): React.CSSProperties {
  return {
    flex: `0 0 ${size}%`,
    minWidth: 0,
    minHeight: 0,
  };
}

function staticPanelSizes(
  savedSizes: number[] | undefined,
  fallbackSizes: number[],
): number[] {
  return normalizePanelSizePctArray(savedSizes, fallbackSizes.length)
    ?? normalizePanelSizePctArray(fallbackSizes, fallbackSizes.length)
    ?? panelSizesFromColSpans(fallbackSizes.map(() => 1));
}

function BentoEditorRowBand<T extends BentoGridTilePlacement & { id: string }>({
  rowIndex,
  placed,
  cols,
  containerWidth,
  resizable,
  layoutStorageKey,
  savedColSizes,
  renderTile,
  renderEmptyColumn,
  onSegmentsChange,
}: {
  rowIndex: number;
  placed: PlacedBentoTile<T>[];
  cols: number;
  containerWidth: number;
  resizable: boolean;
  layoutStorageKey?: string;
  savedColSizes?: number[];
  renderTile: (tile: T, index: number) => React.ReactNode;
  renderEmptyColumn: (colIndex: number, rowIndex: number) => React.ReactNode;
  onSegmentsChange?: (rowIndex: number, segments: BentoRowSegment<T>[], sizes: number[]) => void;
}): React.JSX.Element {
  const segments = React.useMemo(
    () => computeRowSegments(placed, rowIndex, cols),
    [placed, rowIndex, cols],
  );

  const panelIds = segments.map((seg, i) =>
    segmentPanelId(rowIndex, i, seg.placed?.tile.id),
  );

  const mp = minPanelPct(containerWidth, Math.max(segments.length, 1));

  if (segments.length === 0) {
    return <div className="scn-bento-editor__row-band" data-row={rowIndex + 1} />;
  }

  const spanDerivedSizes = panelSizesFromColSpans(segments.map((s) => s.width));
  const useSavedCol =
    savedColSizes && savedColSizes.length === segments.length;

  const colChildren = segments.flatMap((seg, i) => {
    const fallback = spanDerivedSizes[i] ?? 100 / segments.length;
    const defaultSize = useSavedCol
      ? panelDefaultSizeAt(savedColSizes, i, fallback)
      : fallback;
    const panel = (
      <ResizablePanel
        key={`${panelIds[i]}-${defaultSize.toFixed(1)}`}
        id={panelIds[i]}
        defaultSize={defaultSize}
        minSize={mp}
        disabled={!resizable}
        className="scn-bento-editor__panel"
      >
        <div className="scn-bento-editor__column-cell">
          {seg.placed ? (
            renderTile(seg.placed.tile, placed.indexOf(seg.placed))
          ) : (
            <div className="scn-bento-editor__column-cell scn-bento-editor__column-cell--empty">
              {renderEmptyColumn(seg.startCol, rowIndex)}
            </div>
          )}
        </div>
      </ResizablePanel>
    );
    if (i === 0 || !resizable) return [panel];
    return [
      <ResizableHandle key={`h-${panelIds[i]}`} className={COL_HANDLE_CLASS} withHandle />,
      panel,
    ];
  });

  return (
    <div className="scn-bento-editor__row-band" data-row={rowIndex + 1}>
      <ResizablePanelGroup
        key={layoutStorageKey ? `${layoutStorageKey}-row-${rowIndex}` : undefined}
        orientation="horizontal"
        id={`bento-row-${rowIndex}`}
        className="scn-bento-editor__row"
        disabled={!resizable}
        onLayoutChanged={
          resizable && onSegmentsChange
            ? (layout) => onSegmentsChange(
                rowIndex,
                segments,
                panelLayoutToSizes(layout, panelIds, spanDerivedSizes),
              )
            : undefined
        }
      >
        {colChildren}
      </ResizablePanelGroup>
    </div>
  );
}

export function BentoGridEditorLayout<T extends BentoGridTilePlacement & { id: string }>({
  gridColumns,
  gridRows: gridRowsProp,
  tiles,
  className,
  style,
  minTilePx: _minTilePx = BENTO_GRID_MIN_TILE_PX,
  resizable = true,
  layoutStorageKey,
  rowPanelSizes,
  colPanelSizesByRow,
  renderTile,
  getTileKey: _getTileKey,
  renderEmptyColumn,
  renderEmptyRow,
  onLayoutPersist,
}: BentoGridEditorLayoutProps<T>): React.JSX.Element {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(hostRef);
  const cols = normalizeGridColumns(gridColumns);
  const rowCount = normalizeGridRows(gridRowsProp);
  const skipLayoutPersistRef = React.useRef(true);

  React.useLayoutEffect(() => {
    skipLayoutPersistRef.current = true;
    let cancelled = false;
    let frameId = 0;
    let framesRemaining = 3;
    const tick = () => {
      if (cancelled) return;
      framesRemaining -= 1;
      if (framesRemaining <= 0) {
        skipLayoutPersistRef.current = false;
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [layoutStorageKey]);

  const placed = React.useMemo(
    () => placeBentoTiles(tiles, cols, cols),
    [tiles, cols],
  );

  const emptyRows = React.useMemo(
    () => getEmptyRowIndices(placed, rowCount),
    [placed, rowCount],
  );

  const handleSegmentsChange = React.useCallback(
    (rowIndex: number, segments: BentoRowSegment<T>[], sizes: number[]) => {
      if (!onLayoutPersist || segments.length === 0 || skipLayoutPersistRef.current) return;
      const widths = colSpansFromPanelSizes(sizes, cols);
      const patches: BentoTileSpanPatch[] = [];
      segments.forEach((seg, i) => {
        if (!seg.placed) return;
        patches.push({
          id: seg.placed.tile.id,
          col_span: authoredColSpanFromEffective(widths[i] ?? seg.width, cols, cols),
          row: seg.placed.startRow + 1,
          col: seg.startCol + 1,
        });
      });
      onLayoutPersist({
        col_panel_sizes_by_row: { [String(rowIndex)]: sizes },
        ...(patches.length ? { tileSpanPatches: patches } : {}),
      });
    },
    [cols, onLayoutPersist],
  );

  const rowPanelIds = React.useMemo(
    () =>
      Array.from({ length: rowCount }, (_, rowIndex) =>
        emptyRows.includes(rowIndex)
          ? `bento-empty-row-${rowIndex}`
          : `bento-row-panel-${rowIndex}`,
      ),
    [emptyRows, rowCount],
  );

  const rowBandSizes = React.useMemo(() => {
    const saved =
      rowPanelSizes && rowPanelSizes.length === rowCount ? rowPanelSizes : undefined;
    const weights = Array.from({ length: rowCount }, (_, r) => {
      const starters = tilesStartingInRow(placed, r);
      if (starters.length === 0) return 1;
      return Math.max(1, ...starters.map((p) => p.rowSpan));
    });
    const derived = panelSizesFromRowSpans(weights);
    return Array.from({ length: rowCount }, (_, r) =>
      panelDefaultSizeAt(saved, r, derived[r] ?? 100 / rowCount),
    );
  }, [placed, rowCount, rowPanelSizes]);

  const handleRowSpansChange = React.useCallback(
    (layout: PanelLayout) => {
      if (!onLayoutPersist || skipLayoutPersistRef.current) return;
      const sizes = panelLayoutToSizes(layout, rowPanelIds, rowBandSizes);
      const spans = rowSpansFromPanelSizes(sizes, rowCount);
      const patches: BentoTileSpanPatch[] = [];
      for (let r = 0; r < rowCount; r++) {
        const starters = tilesStartingInRow(placed, r);
        const span = spans[r] ?? 1;
        for (const p of starters) {
          patches.push({ id: p.tile.id, row_span: span, row: p.startRow + 1 });
        }
      }
      onLayoutPersist({
        row_panel_sizes: sizes,
        ...(patches.length ? { tileSpanPatches: patches } : {}),
      });
    },
    [onLayoutPersist, placed, rowBandSizes, rowCount, rowPanelIds],
  );

  if (!resizable) {
    const staticRows = Array.from({ length: rowCount }, (_, rowIndex) => {
      const rowSize = rowBandSizes[rowIndex] ?? 100 / rowCount;
      const rowStyle = panelFlexStyle(rowSize);

      if (emptyRows.includes(rowIndex)) {
        return (
          <div
            key={`static-empty-row-${rowIndex}`}
            className="scn-bento-editor__panel scn-bento-editor__panel--empty-row"
            style={rowStyle}
            data-row-panel={rowIndex + 1}
          >
            <div className="scn-bento-editor__column-cell scn-bento-editor__column-cell--empty scn-bento-editor__column-cell--empty-row">
              {renderEmptyRow(rowIndex)}
            </div>
          </div>
        );
      }

      const segments = computeRowSegments(placed, rowIndex, cols);
      const spanDerivedSizes = panelSizesFromColSpans(segments.map((s) => s.width));
      const colSizes = staticPanelSizes(
        colPanelSizesByRow?.[String(rowIndex)],
        spanDerivedSizes,
      );

      return (
        <div
          key={`static-row-${rowIndex}`}
          className="scn-bento-editor__panel"
          style={rowStyle}
          data-row-panel={rowIndex + 1}
        >
          <div className="scn-bento-editor__row-band" data-row={rowIndex + 1}>
            <div className="scn-bento-editor__row">
              {segments.map((seg, i) => (
                <div
                  key={seg.placed?.tile.id ?? `empty-${rowIndex}-${i}`}
                  className="scn-bento-editor__panel"
                  style={panelFlexStyle(colSizes[i] ?? 100 / Math.max(segments.length, 1))}
                >
                  <div className="scn-bento-editor__column-cell">
                    {seg.placed ? (
                      renderTile(seg.placed.tile, placed.indexOf(seg.placed))
                    ) : (
                      <div className="scn-bento-editor__column-cell scn-bento-editor__column-cell--empty">
                        {renderEmptyColumn(seg.startCol, rowIndex)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    });

    return (
      <div
        ref={hostRef}
        className={cn('scn-bento-editor__layout-host', className)}
      >
        <div
          className="scn-bento-editor__layout scn-bento-editor__layout--stacked scn-bento-editor__layout--readonly"
          style={style}
          data-grid-columns={cols}
          data-grid-rows={rowCount}
        >
          <div className="scn-bento-editor__row-stack">
            {staticRows}
          </div>
        </div>
      </div>
    );
  }

  const mpRow = minPanelPct(containerWidth, rowCount);

  const rowBands = Array.from({ length: rowCount }, (_, rowIndex) => {
    if (emptyRows.includes(rowIndex)) {
      const emptyRowSize = rowBandSizes[rowIndex] ?? 100 / rowCount;
      return (
        <ResizablePanel
          key={`empty-row-${rowIndex}-${emptyRowSize.toFixed(1)}`}
          id={`bento-empty-row-${rowIndex}`}
          defaultSize={emptyRowSize}
          minSize={mpRow}
          disabled={!resizable}
          className="scn-bento-editor__panel scn-bento-editor__panel--empty-row"
        >
          <div className="scn-bento-editor__column-cell scn-bento-editor__column-cell--empty scn-bento-editor__column-cell--empty-row">
            {renderEmptyRow(rowIndex)}
          </div>
        </ResizablePanel>
      );
    }

    const rowBandSize = rowBandSizes[rowIndex] ?? 100 / rowCount;
    return (
      <ResizablePanel
        key={`row-${rowIndex}-${rowBandSize.toFixed(1)}`}
        id={`bento-row-panel-${rowIndex}`}
        defaultSize={rowBandSize}
        minSize={mpRow}
        disabled={!resizable}
        className="scn-bento-editor__panel"
      >
        <BentoEditorRowBand
          rowIndex={rowIndex}
          placed={placed}
          cols={cols}
          containerWidth={containerWidth}
          resizable={resizable}
          layoutStorageKey={layoutStorageKey}
          savedColSizes={colPanelSizesByRow?.[String(rowIndex)]}
          renderTile={renderTile}
          renderEmptyColumn={renderEmptyColumn}
          onSegmentsChange={resizable ? handleSegmentsChange : undefined}
        />
      </ResizablePanel>
    );
  });

  const verticalChildren = rowBands.flatMap((panel, i) => {
    if (i === 0 || !resizable) return [panel];
    return [
      <ResizableHandle key={`row-handle-${i}`} className={ROW_HANDLE_CLASS} withHandle />,
      panel,
    ];
  });

  return (
    <div
      ref={hostRef}
      className={cn('scn-bento-editor__layout-host', className)}
    >
      <div
        className={cn(
          'scn-bento-editor__layout scn-bento-editor__layout--stacked',
          !resizable && 'scn-bento-editor__layout--readonly',
        )}
        style={style}
        data-grid-columns={cols}
        data-grid-rows={rowCount}
      >
        <ResizablePanelGroup
          key={layoutStorageKey ?? 'bento-editor-rows'}
          orientation="vertical"
          id="bento-editor-rows"
          className="scn-bento-editor__row-stack"
          disabled={!resizable}
          onLayoutChanged={resizable ? handleRowSpansChange : undefined}
        >
          {verticalChildren}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
