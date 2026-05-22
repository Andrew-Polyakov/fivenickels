import { describe, expect, it } from 'vitest';

import { resizablePanelLayoutMap } from './bento-block-persist';
import {
  computeRowSegments,
  panelSizesFromColSpans,
  placeBentoTiles,
} from './bento-grid-editor-placement';

/** market-news block 2: 2×2 grid with overlapping row-2 placements (edit-mode crash case). */
const MARKET_NEWS_BENTO_FEATURES = [
  { id: 'm', col_span: 1, row_span: 1, row: 1, col: 1 },
  { id: 'f', col_span: 1, row_span: 1, row: 1, col: 2 },
  { id: 'x', col_span: 1, row_span: 1, row: 2, col: 1 },
  { id: 'c', col_span: 1, row_span: 1, row: 2, col: 2 },
  { id: 's', col_span: 1, row_span: 1, row: 2, col: 2 },
] as const;

function assertValidTwoPanelLayout(pcts: number[]): void {
  expect(pcts).toHaveLength(2);
  expect(pcts[0]).toBeGreaterThan(0);
  expect(pcts[1]).toBeGreaterThan(0);
  expect(pcts[0]! + pcts[1]!).toBeCloseTo(100, 5);
}

/** market-news block 1: 1×1 article carousel (single-row edit path). */
const MARKET_NEWS_1X1_FEATURES = [
  { id: 'carousel', col_span: 1, row_span: 1, row: 1, col: 1 },
] as const;

describe('market-news bento edit layout', () => {
  it('1×1 grid yields one full-width segment on row 0', () => {
    const placed = placeBentoTiles([...MARKET_NEWS_1X1_FEATURES], 1, 1);
    const segs = computeRowSegments(placed, 0, 1);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.width).toBe(1);
    expect(segs.every((s) => s.width > 0)).toBe(true);
    expect(panelSizesFromColSpans(segs.map((s) => s.width))).toEqual([100]);
  });

  it('does not produce zero-width row segments on any row', () => {
    const placed = placeBentoTiles([...MARKET_NEWS_BENTO_FEATURES], 2, 2);
    for (let r = 0; r < 2; r++) {
      const segs = computeRowSegments(placed, r, 2);
      expect(segs.every((s) => s.width > 0)).toBe(true);
      const pcts = panelSizesFromColSpans(segs.map((s) => s.width));
      if (pcts.length === 2) {
        assertValidTwoPanelLayout(pcts);
      }
    }
  });

  it('resizablePanelLayoutMap never assigns 0% to a panel in a 2-panel row', () => {
    const placed = placeBentoTiles([...MARKET_NEWS_BENTO_FEATURES], 2, 2);
    for (let r = 0; r < 2; r++) {
      const segs = computeRowSegments(placed, r, 2);
      if (segs.length < 2) continue;
      const panelIds = segs.map((_, i) => `seg-${r}-${i}`);
      const layout = resizablePanelLayoutMap(
        panelIds,
        segs.map((s) => s.width),
        [50, 50],
      );
      const values = Object.values(layout);
      expect(values.every((v) => v > 0)).toBe(true);
      expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
    }
  });
});
