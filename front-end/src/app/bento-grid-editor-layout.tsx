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
  ensureUniquePanelIds,
  normalizePanelSizePctArray,
  resizablePanelDefaultSizes,
  resizablePanelLayoutMap,
  resizablePanelMinSize,
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
  return `bento-seg-${rowIndex}-${segIndex}-${tileId ?? 'empty'}`;
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

  const panelIds = ensureUniquePanelIds(
    segments.map((seg, i) => segmentPanelId(rowIndex, i, seg.placed?.tile.id)),
  );

  if (segments.length === 0) {
    return <div className="scn-bento-editor__row-band" data-row={rowIndex + 1} />;
  }

  const useSavedCol =
    savedColSizes && savedColSizes.length === segments.length;
  const colDefaultSizes = resizablePanelDefaultSizes(
    segments.length,
    segments.map((s) => s.width),
    useSavedCol ? savedColSizes : undefined,
  );
  const seg = segments[0]!;

  if (segments.length === 1) {
    return (
      <div className="scn-bento-editor__row-band" data-row={rowIndex + 1}>
        <div className="scn-bento-editor__row scn-bento-editor__row--single">
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
      </div>
    );
  }

  const mp = resizablePanelMinSize(
    containerWidth,
    segments.length,
    minPanelPct,
  );
  const colDefaultLayout = resizablePanelLayoutMap(
    panelIds,
    segments.map((s) => s.width),
    useSavedCol ? savedColSizes : undefined,
  );

  const colChildren = segments.flatMap((segItem, i) => {
    const panel = (
      <ResizablePanel
        key={panelIds[i]}
        id={panelIds[i]}
        minSize={mp}
        disabled={!resizable}
        className="scn-bento-editor__panel"
      >
        <div className="scn-bento-editor__column-cell">
          {segItem.placed ? (
            renderTile(segItem.placed.tile, placed.indexOf(segItem.placed))
          ) : (
            <div className="scn-bento-editor__column-cell scn-bento-editor__column-cell--empty">
              {renderEmptyColumn(segItem.startCol, rowIndex)}
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
        id={layoutStorageKey ? `${layoutStorageKey}-row-${rowIndex}` : `bento-row-${rowIndex}`}
        className="scn-bento-editor__row"
        disabled={!resizable}
        defaultLayout={colDefaultLayout}
        onLayoutChanged={
          resizable && onSegmentsChange
            ? (layout) => onSegmentsChange(
                rowIndex,
                segments,
                panelLayoutToSizes(layout, panelIds, colDefaultSizes),
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

  const rowIdPrefix = layoutStorageKey ? `${layoutStorageKey}-` : '';

  const rowPanelIds = React.useMemo(
    () =>
      ensureUniquePanelIds(
        Array.from({ length: rowCount }, (_, rowIndex) =>
          emptyRows.includes(rowIndex)
            ? `${rowIdPrefix}bento-empty-row-${rowIndex}`
            : `${rowIdPrefix}bento-row-panel-${rowIndex}`,
        ),
      ),
    [emptyRows, rowCount, rowIdPrefix],
  );

  const rowBandSizes = React.useMemo(() => {
    const saved =
      rowPanelSizes && rowPanelSizes.length === rowCount ? rowPanelSizes : undefined;
    const weights = Array.from({ length: rowCount }, (_, r) => {
      if (emptyRows.includes(r)) return 0.12;
      const starters = tilesStartingInRow(placed, r);
      return Math.max(1, ...starters.map((p) => p.rowSpan));
    });
    return resizablePanelDefaultSizes(rowCount, weights, saved);
  }, [emptyRows, placed, rowCount, rowPanelSizes]);

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

  const layoutShell = (children: React.ReactNode) => (
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
        {children}
      </div>
    </div>
  );

  if (rowCount === 1) {
    const rowIndex = 0;
    const singleRowContent = emptyRows.includes(rowIndex) ? (
      <div
        key="static-empty-row-0"
        className="scn-bento-editor__panel scn-bento-editor__panel--empty-row"
      >
        <div className="scn-bento-editor__column-cell scn-bento-editor__column-cell--empty scn-bento-editor__column-cell--empty-row">
          {renderEmptyRow(rowIndex)}
        </div>
      </div>
    ) : (
      <BentoEditorRowBand
        key="static-row-0"
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
    );
    return layoutShell(
      <div className="scn-bento-editor__row-stack scn-bento-editor__row-stack--single">
        {singleRowContent}
      </div>,
    );
  }

  const mpRow = resizablePanelMinSize(containerWidth, rowCount, minPanelPct);
  const rowDefaultLayout = resizablePanelLayoutMap(
    rowPanelIds,
    Array.from({ length: rowCount }, (_, r) => {
      if (emptyRows.includes(r)) return 0.12;
      const starters = tilesStartingInRow(placed, r);
      return Math.max(1, ...starters.map((p) => p.rowSpan));
    }),
    rowPanelSizes && rowPanelSizes.length === rowCount ? rowPanelSizes : undefined,
  );

  const rowBands = Array.from({ length: rowCount }, (_, rowIndex) => {
    if (emptyRows.includes(rowIndex)) {
      return (
        <ResizablePanel
          key={`empty-row-${rowIndex}`}
          id={rowPanelIds[rowIndex]}
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

    return (
      <ResizablePanel
        key={`row-${rowIndex}`}
        id={rowPanelIds[rowIndex]}
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

  return layoutShell(
    <ResizablePanelGroup
      key={layoutStorageKey ?? 'bento-editor-rows'}
      orientation="vertical"
      id={layoutStorageKey ? `${layoutStorageKey}-rows` : 'bento-editor-rows'}
      className="scn-bento-editor__row-stack"
      disabled={!resizable}
      defaultLayout={rowDefaultLayout}
      onLayoutChanged={resizable ? handleRowSpansChange : undefined}
    >
      {verticalChildren}
    </ResizablePanelGroup>,
  );
}
