import { describe, expect, it } from 'vitest';

import {
  computeRowSegments,
  panelSizesFromColSpans,
  placeBentoTiles,
} from './bento-grid-editor-placement';

describe('computeRowSegments', () => {
  it('does not emit zero-width segments when scanning past tile interior', () => {
    const tiles = [
      { id: 'a', col_span: 1, row_span: 1, row: 2, col: 1 },
      { id: 'b', col_span: 1, row_span: 1, row: 2, col: 2 },
    ];
    const placed = placeBentoTiles(tiles, 2, 2);
    const segments = computeRowSegments(placed, 1, 2);
    expect(segments.every((s) => s.width > 0)).toBe(true);
    expect(segments.map((s) => s.width)).toEqual([1, 1]);
    expect(panelSizesFromColSpans(segments.map((s) => s.width))).toEqual([50, 50]);
  });

  it('market-news style row with two tiles does not produce 100/0 panel sizes', () => {
    const tiles = [
      { id: 'm', col_span: 1, row_span: 1, row: 1, col: 1 },
      { id: 'f', col_span: 1, row_span: 1, row: 1, col: 2 },
      { id: 'x', col_span: 1, row_span: 1, row: 2, col: 1 },
      { id: 'c', col_span: 1, row_span: 1, row: 2, col: 2 },
      { id: 's', col_span: 1, row_span: 1, row: 2, col: 2 },
    ];
    const placed = placeBentoTiles(tiles, 2, 2);
    for (let r = 0; r < 2; r++) {
      const segs = computeRowSegments(placed, r, 2);
      const pcts = panelSizesFromColSpans(segs.map((s) => s.width));
      expect(segs.every((s) => s.width > 0)).toBe(true);
      if (pcts.length === 2) {
        expect(pcts[0]).toBeGreaterThan(0);
        expect(pcts[1]).toBeGreaterThan(0);
        expect(pcts[0]! + pcts[1]!).toBeCloseTo(100, 5);
      }
    }
  });

  it('returns a single full-width segment for one tile spanning the row', () => {
    const tiles = [{ id: 'wide', col_span: 2, row_span: 1, row: 1, col: 1 }];
    const placed = placeBentoTiles(tiles, 2, 2);
    const segments = computeRowSegments(placed, 0, 2);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.width).toBe(2);
    expect(panelSizesFromColSpans([2])).toEqual([100]);
  });
});
