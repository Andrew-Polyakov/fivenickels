import { describe, expect, it } from 'vitest';
import {
  carouselFeaturesAllCards,
  normalizeCarouselBlockFromJson,
} from './shadcn-taxonomy-editor';

describe('normalizeCarouselBlockFromJson', () => {
  it('maps legacy cards to card features', () => {
    const raw = {
      id: 'c1',
      type: 'carousel',
      cards: [
        { id: 's1', mode: 'random', articleId: null, articleTitle: null },
        { id: 's2', mode: 'specific', articleId: 5, articleTitle: 'T' },
      ],
      infiniteScroll: true,
    };
    const b = normalizeCarouselBlockFromJson(raw);
    expect(b?.features).toHaveLength(2);
    expect(b?.features[0]?.header_type).toBe('card');
    expect(b?.features[1]?.articleId).toBe(5);
    expect(b?.infiniteScroll).toBe(true);
  });

  it('prefers features when present', () => {
    const raw = {
      id: 'x',
      type: 'carousel',
      cards: [{ id: 'legacy', mode: 'random', articleId: null, articleTitle: null }],
      features: [{
        id: 'f1',
        header_type: 'richtext',
        image_url_light: '',
        image_url_dark: '',
        title: '',
        description: '',
        col_span: '4',
        html: '<p>x</p>',
      }],
    };
    const b = normalizeCarouselBlockFromJson(raw);
    expect(b?.features).toHaveLength(1);
    expect(b?.features[0]?.header_type).toBe('richtext');
  });
});

describe('carouselFeaturesAllCards', () => {
  it('is false when empty', () => {
    expect(carouselFeaturesAllCards([])).toBe(false);
  });

  it('is true when every tile is card', () => {
    expect(carouselFeaturesAllCards([
      {
        id: 'a',
        header_type: 'card',
        image_url_light: '',
        image_url_dark: '',
        title: '',
        description: '',
        col_span: '4',
        mode: 'random',
      },
    ])).toBe(true);
  });

  it('is false when mixed', () => {
    expect(carouselFeaturesAllCards([
      {
        id: 'a',
        header_type: 'card',
        image_url_light: '',
        image_url_dark: '',
        title: '',
        description: '',
        col_span: '4',
      },
      {
        id: 'b',
        header_type: 'richtext',
        image_url_light: '',
        image_url_dark: '',
        title: '',
        description: '',
        col_span: '4',
        html: '',
      },
    ])).toBe(false);
  });
});
