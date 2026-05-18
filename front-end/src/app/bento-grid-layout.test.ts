import { describe, expect, it } from 'vitest';
import {
  bentoCellGridStyle,
  effectiveColSpan,
  normalizeColSpan,
  normalizeGridColumns,
  useEffectiveColumns,
} from './bento-grid-layout';

describe('bento-grid-layout', () => {
  it('normalizes grid columns to 1-6', () => {
    expect(normalizeGridColumns(0)).toBe(1);
    expect(normalizeGridColumns(3)).toBe(3);
    expect(normalizeGridColumns(9)).toBe(6);
  });

  it('maps legacy col_span strings', () => {
    expect(normalizeColSpan('4', 3)).toBe(1);
    expect(normalizeColSpan('8', 3)).toBe(2);
    expect(normalizeColSpan(2, 6)).toBe(2);
  });

  it('scales spans when effective columns shrink', () => {
    expect(effectiveColSpan(2, 6, 3)).toBe(1);
    expect(effectiveColSpan(2, 6, 1)).toBe(1);
    expect(effectiveColSpan(4, 6, 6)).toBe(4);
  });

  it('computes effective columns from width', () => {
    expect(useEffectiveColumns(500, 6, 260)).toBe(1);
    expect(useEffectiveColumns(1200, 6, 260)).toBe(4);
    expect(useEffectiveColumns(2000, 3, 260)).toBe(3);
  });

  it('bentoCellGridStyle applies row and column start hints', () => {
    const style = bentoCellGridStyle(
      { col_span: 1, row_span: 1, row: 2, col: 3 },
      3,
      3,
    );
    expect(style.gridRowStart).toBe(2);
    expect(style.gridColumnStart).toBe(3);
    expect(style.gridColumn).toBe('span 1');
  });
});
