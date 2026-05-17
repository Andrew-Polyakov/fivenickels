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
  col?: number;
}

export interface BentoLayoutPersistPatch {
  row_panel_sizes?: BentoRowPanelSizes;
  col_panel_sizes_by_row?: BentoColPanelSizesByRow;
  tileSpanPatches?: BentoTileSpanPatch[];
}

type PanelLayout = { [panelId: string]: number };

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

function layoutToSizes(layout: PanelLayout, panelIds: string[]): number[] {
  return panelIds.map((id) => layout[id] ?? 0);
}

function segmentPanelId(rowIndex: number, segIndex: number, tileId?: string): string {
  return tileId
    ? `bento-seg-${rowIndex}-${tileId}`
    : `bento-seg-${rowIndex}-empty-${segIndex}`;
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
        key={panelIds[i]}
        id={panelIds[i]}
        defaultSize={defaultSize}
        minSize={mp}
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
        onLayoutChanged={
          resizable && onSegmentsChange
            ? (layout) => onSegmentsChange(rowIndex, segments, layoutToSizes(layout, panelIds))
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
    const frame = requestAnimationFrame(() => {
      skipLayoutPersistRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
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

  const handleRowSpansChange = React.useCallback(
    (layout: PanelLayout) => {
      if (!onLayoutPersist || skipLayoutPersistRef.current) return;
      const sizes = layoutToSizes(layout, rowPanelIds);
      const spans = rowSpansFromPanelSizes(sizes, rowCount);
      const patches: BentoTileSpanPatch[] = [];
      for (let r = 0; r < rowCount; r++) {
        const starters = tilesStartingInRow(placed, r);
        const span = spans[r] ?? 1;
        for (const p of starters) {
          patches.push({ id: p.tile.id, row_span: span });
        }
      }
      onLayoutPersist({
        row_panel_sizes: sizes,
        ...(patches.length ? { tileSpanPatches: patches } : {}),
      });
    },
    [onLayoutPersist, placed, rowCount, rowPanelIds],
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

  const mpRow = minPanelPct(containerWidth, rowCount);

  const rowBands = Array.from({ length: rowCount }, (_, rowIndex) => {
    if (emptyRows.includes(rowIndex)) {
      return (
        <ResizablePanel
          key={`empty-row-${rowIndex}`}
          id={`bento-empty-row-${rowIndex}`}
          defaultSize={rowBandSizes[rowIndex] ?? 100 / rowCount}
          minSize={mpRow}
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
        id={`bento-row-panel-${rowIndex}`}
        defaultSize={rowBandSizes[rowIndex] ?? 100 / rowCount}
        minSize={mpRow}
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
          onLayoutChanged={resizable ? handleRowSpansChange : undefined}
        >
          {verticalChildren}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
