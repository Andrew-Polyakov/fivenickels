import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  bentoEditorLayoutStorageKey,
  bentoEditorSegmentTopologyKey,
  ensureUniquePanelIds,
  resizablePanelLayoutMap,
} from './bento-block-persist';
import { BentoGridEditorLayout } from './bento-grid-editor-layout';
import { computeRowSegments, placeBentoTiles } from './bento-grid-editor-placement';

describe('bento panel layout crash regression', () => {
  it('ensureUniquePanelIds produces one key per panel when ids collide', () => {
    const ids = ['a', 'a', 'b'];
    expect(ensureUniquePanelIds(ids)).toEqual(['a', 'a-1', 'b']);
    const layout = resizablePanelLayoutMap(ids, [1, 1, 1]);
    expect(Object.keys(layout)).toHaveLength(3);
    expect(Object.values(layout).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });

  it('resizablePanelLayoutMap never collapses duplicate segment ids to two entries', () => {
    const panelIds = ['bento-seg-0-0-dup', 'bento-seg-0-1-dup', 'bento-seg-0-2-empty'];
    const layout = resizablePanelLayoutMap(panelIds, [1, 1, 1], [50, 50]);
    expect(Object.keys(layout)).toHaveLength(3);
    expect(Object.values(layout).every((v) => v > 0)).toBe(true);
  });

  it('topology key changes when segment count changes on same features', () => {
    const oneTile = [{ id: 'a', col_span: 1, row_span: 1, row: 1, col: 1 }];
    const twoTiles = [
      { id: 'a', col_span: 1, row_span: 1, row: 1, col: 1 },
      { id: 'b', col_span: 1, row_span: 1, row: 1, col: 2 },
    ];
    const topoOne = bentoEditorSegmentTopologyKey(oneTile, 3, 1);
    const topoTwo = bentoEditorSegmentTopologyKey(twoTiles, 3, 1);
    expect(topoOne).not.toBe(topoTwo);

    const keyOne = bentoEditorLayoutStorageKey(3, 1, {}, oneTile);
    const keyTwo = bentoEditorLayoutStorageKey(3, 1, {}, twoTiles);
    expect(keyOne).not.toBe(keyTwo);
  });

  it('renders resizable 3-segment row without throwing when stale col sizes have length 2', () => {
    const tiles = [
      { id: 'a', col_span: 1, row_span: 1, row: 1, col: 1 },
      { id: 'b', col_span: 1, row_span: 1, row: 1, col: 2 },
    ];
    const placed = placeBentoTiles(tiles, 3, 3);
    const segs = computeRowSegments(placed, 0, 3);
    expect(segs).toHaveLength(3);

    const html = renderToStaticMarkup(
      React.createElement(BentoGridEditorLayout, {
        gridColumns: 3,
        gridRows: 1,
        tiles,
        resizable: true,
        layoutStorageKey: bentoEditorLayoutStorageKey(3, 1, {}, tiles),
        colPanelSizesByRow: { '0': [50, 50] },
        renderTile: (tile: { id: string }) => React.createElement('span', null, tile.id),
        renderEmptyColumn: () => null,
        renderEmptyRow: () => null,
      }),
    );

    expect(html).toContain('scn-bento-editor__row');
  });

  it('renders resizable 3-segment row with duplicate feature ids without throwing', () => {
    const tiles = [
      { id: 'dup', col_span: 1, row_span: 1, row: 1, col: 1 },
      { id: 'dup', col_span: 1, row_span: 1, row: 1, col: 2 },
    ];

    expect(() =>
      renderToStaticMarkup(
        React.createElement(BentoGridEditorLayout, {
          gridColumns: 3,
          gridRows: 1,
          tiles,
          resizable: true,
          layoutStorageKey: bentoEditorLayoutStorageKey(3, 1, {}, tiles),
          renderTile: (tile: { id: string }) => React.createElement('span', null, tile.id),
          renderEmptyColumn: () => null,
          renderEmptyRow: () => null,
        }),
      ),
    ).not.toThrow();
  });
});
