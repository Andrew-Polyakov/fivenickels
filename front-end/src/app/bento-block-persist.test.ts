import { describe, expect, it } from 'vitest';

import {
  bentoEditorLayoutStorageKey,
  bentoSectionSizeStyles,
  normalizePanelSizePctArray,
  parseBentoSectionDimension,
  pruneBentoPanelSizesForGrid,
  resizablePanelDefaultSizes,
  resizablePanelLayoutMap,
  serializeBentoFeaturePlacement,
} from './bento-block-persist';

describe('bento-block-persist', () => {
  it('parseBentoSectionDimension treats auto as unset', () => {
    expect(parseBentoSectionDimension('auto')).toBeUndefined();
    expect(parseBentoSectionDimension('480px')).toBe('480px');
  });

  it('bentoSectionSizeStyles applies height and max width', () => {
    const styles = bentoSectionSizeStyles({ height: '400px', width: '900px' });
    expect(styles.host?.height).toBe('400px');
    expect(styles.shell?.maxWidth).toBe('900px');
  });

  it('serializeBentoFeaturePlacement normalizes spans and placement', () => {
    const feat = serializeBentoFeaturePlacement(
      { id: 'a', col_span: 2, row_span: 2, col: 2, row: 1 },
      3,
    );
    expect(feat.col_span).toBe(2);
    expect(feat.row_span).toBe(2);
    expect(feat.col).toBe(2);
    expect(feat.row).toBe(1);
  });

  it('layout storage key changes when spans change', () => {
    const base = bentoEditorLayoutStorageKey(3, 3, {}, [{ id: 'x', col_span: 1, row_span: 1 }]);
    const wide = bentoEditorLayoutStorageKey(3, 3, {}, [{ id: 'x', col_span: 2, row_span: 1 }]);
    expect(base).not.toBe(wide);
  });

  it('layout storage key is stable when only saved panel sizes change', () => {
    const feat = [{ id: 'x', col_span: 1, row_span: 1 }];
    const a = bentoEditorLayoutStorageKey(3, 2, {}, feat);
    const b = bentoEditorLayoutStorageKey(3, 2, {}, feat);
    expect(a).toBe(b);
  });

  it('normalizePanelSizePctArray requires exact length when expectedLen set', () => {
    expect(normalizePanelSizePctArray([50, 50], 2)).toEqual([50, 50]);
    expect(normalizePanelSizePctArray([50, 50], 3)).toBeUndefined();
  });

  it('resizablePanelDefaultSizes never returns 100/0 split for two panels', () => {
    const sizes = resizablePanelDefaultSizes(2, [0, 1]);
    expect(sizes).toHaveLength(2);
    expect(sizes[0]).toBeGreaterThan(0);
    expect(sizes[1]).toBeGreaterThan(0);
    expect(sizes[0]! + sizes[1]!).toBeCloseTo(100, 5);
    expect(sizes).not.toEqual([100, 0]);
    expect(sizes).not.toEqual([0, 100]);
  });

  it('resizablePanelLayoutMap sums to 100 across panel ids', () => {
    const layout = resizablePanelLayoutMap(['a', 'b'], [1, 1]);
    expect(layout['a']! + layout['b']!).toBeCloseTo(100, 5);
    expect(layout['a']).toBeGreaterThan(0);
    expect(layout['b']).toBeGreaterThan(0);
  });

  it('pruneBentoPanelSizesForGrid trims row sizes and clears col sizes on column change', () => {
    const block = {
      grid_columns: 3,
      grid_rows: 3,
      row_panel_sizes: [40, 30, 30],
      col_panel_sizes_by_row: { '0': [50, 50] },
    };
    const pruned = pruneBentoPanelSizesForGrid(block, 4, 2, 3);
    expect(pruned.grid_columns).toBe(4);
    expect(pruned.grid_rows).toBe(2);
    expect(pruned.row_panel_sizes).toBeUndefined();
    expect(pruned.col_panel_sizes_by_row).toBeUndefined();
  });

  it('pruneBentoPanelSizesForGrid keeps valid row panel sizes when only rows shrink', () => {
    const block = {
      grid_columns: 3,
      grid_rows: 3,
      row_panel_sizes: [50, 50],
      col_panel_sizes_by_row: { '0': [60, 40], '1': [50, 50] },
    };
    const pruned = pruneBentoPanelSizesForGrid(block, 3, 2);
    expect(pruned.row_panel_sizes).toEqual([50, 50]);
    expect(pruned.col_panel_sizes_by_row).toEqual({ '0': [60, 40], '1': [50, 50] });
  });
});
