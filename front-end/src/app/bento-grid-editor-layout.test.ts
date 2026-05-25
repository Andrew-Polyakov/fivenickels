import { describe, expect, it } from 'vitest';
import {
  colSpansFromPanelSizes,
  computeBentoRows,
  computeRowSegments,
  getEmptyColumnIndices,
  getEmptyColumnIndicesForRow,
  getEmptyRowIndices,
  isHeroEditorLayout,
  panelSizesFromColSpans,
  placeBentoTiles,
  rowSpansFromPanelSizes,
  spansFromLegacyPanelSizes,
  tilesHaveDefaultSpans,
} from './bento-grid-editor-placement';

describe('bento-grid-editor-layout', () => {
  it('colSpansFromPanelSizes splits evenly', () => {
    expect(colSpansFromPanelSizes([50, 50], 4)).toEqual([2, 2]);
    expect(colSpansFromPanelSizes([50, 50], 3)).toEqual([2, 1]);
  });

  it('panelSizesFromColSpans returns percentages', () => {
    expect(panelSizesFromColSpans([2, 2])).toEqual([50, 50]);
  });

  it('computes hero row groups', () => {
    const tiles = [
      { id: 'a', col_span: 1, row_span: 3 },
      { id: 'b', col_span: 2, row_span: 1 },
      { id: 'c', col_span: 2, row_span: 1 },
      { id: 'd', col_span: 2, row_span: 1 },
    ];
    const placed = placeBentoTiles(tiles, 3, 3);
    expect(isHeroEditorLayout(placed, 3)).toBe(true);
    const rows = computeBentoRows(tiles, 3, 3);
    expect(rows[0].tiles.map((t) => t.tile.id)).toEqual(['a', 'b']);
    expect(rows).toHaveLength(3);
  });

  it('converts legacy panelSizes to spans', () => {
    const patches = spansFromLegacyPanelSizes([50], 4, 3);
    expect(patches[0]).toEqual({ col_span: 2, row_span: 3 });
    expect(patches[1].col_span).toBe(1);
    expect(patches[1].row_span).toBe(1);
  });

  it('detects default spans', () => {
    expect(tilesHaveDefaultSpans([{ col_span: 1, row_span: 1 }])).toBe(true);
    expect(tilesHaveDefaultSpans([{ col_span: 2, row_span: 1 }])).toBe(false);
  });

  it('finds empty columns', () => {
    const tiles = [{ id: 'a', col_span: 1, row_span: 1 }];
    const placed = placeBentoTiles(tiles, 3, 3);
    expect(getEmptyColumnIndices(placed, 3)).toEqual([1, 2]);
  });

  it('finds empty columns within a row', () => {
    const tiles = [{ id: 'a', col_span: 1, row_span: 1, col: 1 }];
    const placed = placeBentoTiles(tiles, 3, 3);
    expect(getEmptyColumnIndicesForRow(placed, 0, 3)).toEqual([1, 2]);
  });

  it('finds empty rows in configured row count', () => {
    const tiles = [{ id: 'a', col_span: 1, row_span: 1, row: 1 }];
    const placed = placeBentoTiles(tiles, 3, 3);
    expect(getEmptyRowIndices(placed, 3)).toEqual([1, 2]);
  });

  it('rowSpansFromPanelSizes splits evenly', () => {
    expect(rowSpansFromPanelSizes([50, 50], 2)).toEqual([1, 1]);
    expect(rowSpansFromPanelSizes([33, 33, 34], 3)).toEqual([1, 1, 1]);
  });

  it('computeRowSegments splits tile and empty columns', () => {
    const tiles = [{ id: 'a', col_span: 1, row_span: 1, col: 1 }];
    const placed = placeBentoTiles(tiles, 3, 3);
    const segs = computeRowSegments(placed, 0, 3);
    expect(segs).toHaveLength(2);
    expect(segs[0].placed?.tile.id).toBe('a');
    expect(segs[0].width).toBe(1);
    expect(segs[1].placed).toBeUndefined();
    expect(segs[1].width).toBe(2);
    expect(segs[1].startCol).toBe(1);
  });

  it('computeRowSegments merges adjacent tiles into segments', () => {
    const tiles = [
      { id: 'a', col_span: 1, row_span: 1, col: 1 },
      { id: 'b', col_span: 1, row_span: 1, col: 2 },
    ];
    const placed = placeBentoTiles(tiles, 3, 3);
    const segs = computeRowSegments(placed, 0, 3);
    expect(segs.map((s) => s.placed?.tile.id)).toEqual(['a', 'b', undefined]);
    expect(segs[2].width).toBe(1);
  });

  it('computeRowSegments uses one segment for wide tile', () => {
    const tiles = [{ id: 'a', col_span: 2, row_span: 1 }];
    const placed = placeBentoTiles(tiles, 3, 3);
    const segs = computeRowSegments(placed, 0, 3);
    expect(segs).toHaveLength(2);
    expect(segs[0].width).toBe(2);
    expect(segs[0].placed?.tile.id).toBe('a');
  });
});
