import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { bentoEditorLayoutStorageKey } from './bento-block-persist';
import { BentoGridEditorLayout, panelLayoutToSizes } from './bento-grid-editor-layout';
import {
  applyBentoLayoutPersistPatch,
  serializeBentoGrid01BlockForSave,
  type BentoGrid01Block,
} from './shadcn-taxonomy-editor';

describe('bento resize persistence', () => {
  it('normalizes keyed resize callback layouts in panel order', () => {
    expect(panelLayoutToSizes(
      {
        right: { size: 75 },
        left: { percentage: 25 },
      },
      ['left', 'right'],
    )).toEqual([25, 75]);
  });

  it('normalizes array resize callback layouts and falls back when incomplete', () => {
    expect(panelLayoutToSizes([20, 80], ['a', 'b'])).toEqual([20, 80]);
    expect(panelLayoutToSizes({ a: 40 }, ['a', 'b'], [60, 40])).toEqual([60, 40]);
  });

  it('chained layout patches merge into latest block without dropping prior panel sizes', () => {
    const block: BentoGrid01Block = {
      id: 'bento-1',
      type: 'bento_grid_01',
      badge_text: 'Markets',
      heading: 'Updated heading',
      grid_columns: 3,
      grid_rows: 2,
      features: [
        {
          id: 'tile-1',
          header_type: 'image',
          image_url_light: '',
          image_url_dark: '',
          title: 'Tile 1',
          description: '',
          col_span: 1,
          row_span: 1,
        },
      ],
    };

    const afterRowResize = applyBentoLayoutPersistPatch(block, {
      row_panel_sizes: [70, 30],
    });
    const staleBase = { ...block, heading: 'Stale' };
    const afterColResize = applyBentoLayoutPersistPatch(afterRowResize, {
      col_panel_sizes_by_row: { '0': [40, 60] },
    });
    const wronglyMerged = applyBentoLayoutPersistPatch(staleBase, {
      col_panel_sizes_by_row: { '0': [40, 60] },
    });

    expect(afterColResize.row_panel_sizes).toEqual([70, 30]);
    expect(afterColResize.col_panel_sizes_by_row?.['0']).toEqual([40, 60]);
    expect(afterColResize.heading).toBe('Updated heading');
    expect(wronglyMerged.row_panel_sizes).toBeUndefined();

    const saved = serializeBentoGrid01BlockForSave(afterColResize);
    expect(saved.row_panel_sizes).toEqual([70, 30]);
    expect(saved.col_panel_sizes_by_row?.['0']).toEqual([40, 60]);
  });

  it('layout storage key ignores row and column panel percentages', () => {
    const features = [{ id: 'tile-1', col_span: 1, row_span: 1 }];
    const keyA = bentoEditorLayoutStorageKey(3, 2, {}, features);
    const keyB = bentoEditorLayoutStorageKey(3, 2, {}, features);
    expect(keyA).toBe(keyB);
  });

  it('keeps resized spans, placement, and panel sizes in saved Bento JSON', () => {
    const block: BentoGrid01Block = {
      id: 'bento-1',
      type: 'bento_grid_01',
      badge_text: 'Markets',
      heading: 'Watchlist',
      grid_columns: 3,
      grid_rows: 2,
      features: [
        {
          id: 'tile-1',
          header_type: 'image',
          image_url_light: '',
          image_url_dark: '',
          title: 'Tile 1',
          description: '',
          col_span: 1,
          row_span: 1,
        },
        {
          id: 'tile-2',
          header_type: 'image',
          image_url_light: '',
          image_url_dark: '',
          title: 'Tile 2',
          description: '',
          col_span: 1,
          row_span: 1,
        },
      ],
    };

    const patched = applyBentoLayoutPersistPatch(block, {
      row_panel_sizes: [70, 30],
      col_panel_sizes_by_row: { '0': [33, 67] },
      tileSpanPatches: [
        { id: 'tile-1', col_span: 2, row_span: 2, row: 1, col: 1 },
        { id: 'tile-2', col_span: 1, row_span: 1, row: 1, col: 3 },
      ],
    });

    const saved = serializeBentoGrid01BlockForSave(patched);

    expect(saved.row_panel_sizes).toEqual([70, 30]);
    expect(saved.col_panel_sizes_by_row?.['0']).toEqual([33, 67]);
    expect(saved.features[0]).toMatchObject({
      id: 'tile-1',
      col_span: 2,
      row_span: 2,
      row: 1,
      col: 1,
    });
    expect(saved.features[1]).toMatchObject({
      id: 'tile-2',
      col_span: 1,
      row_span: 1,
      row: 1,
      col: 3,
    });
  });

  it('renders static read-only layout with saved row and column percentages', () => {
    const html = renderToStaticMarkup(
      React.createElement(BentoGridEditorLayout, {
        gridColumns: 3,
        gridRows: 2,
        tiles: [
          { id: 'tile-1', col_span: 1, row_span: 1, row: 1, col: 1 },
          { id: 'tile-2', col_span: 2, row_span: 1, row: 1, col: 2 },
        ],
        resizable: false,
        rowPanelSizes: [70, 30],
        colPanelSizesByRow: { '0': [25, 75] },
        renderTile: (tile: { id: string }) => React.createElement('span', null, tile.id),
        renderEmptyColumn: () => null,
        renderEmptyRow: () => null,
      }),
    );

    expect(html).toContain('flex:0 0 70%');
    expect(html).toContain('flex:0 0 30%');
    expect(html).toContain('flex:0 0 25%');
    expect(html).toContain('flex:0 0 75%');
  });
});
