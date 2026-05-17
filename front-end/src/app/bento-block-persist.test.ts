import { describe, expect, it } from 'vitest';

import {
  bentoEditorLayoutStorageKey,
  bentoSectionSizeStyles,
  normalizePanelSizePctArray,
  parseBentoSectionDimension,
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

  it('layout storage key changes when saved panel sizes change', () => {
    const a = bentoEditorLayoutStorageKey(3, 2, {}, [{ id: 'x', col_span: 1, row_span: 1 }], {
      row_panel_sizes: [60, 40],
    });
    const b = bentoEditorLayoutStorageKey(3, 2, {}, [{ id: 'x', col_span: 1, row_span: 1 }], {
      row_panel_sizes: [70, 30],
    });
    expect(a).not.toBe(b);
  });

  it('normalizePanelSizePctArray requires exact length when expectedLen set', () => {
    expect(normalizePanelSizePctArray([50, 50], 2)).toEqual([50, 50]);
    expect(normalizePanelSizePctArray([50, 50], 3)).toBeUndefined();
  });
});
