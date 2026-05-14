import { describe, expect, it } from 'vitest';
import {
  carouselCardShowsHeroImage,
  hasCarouselCardImage,
  packCarouselSlides,
  type CarouselCardViewModel,
} from './carousel-slide-packing';

function card(key: string, imageUrl: string | null = null): CarouselCardViewModel {
  return { key, title: key, imageUrl };
}

describe('packCarouselSlides', () => {
  it('returns all singles when fewer than 2 imageless cards', () => {
    const a = card('a');
    const b = card('b', 'https://x.example/x.jpg');
    expect(packCarouselSlides([a])).toEqual([{ kind: 'single', key: 'a', card: a }]);
    expect(packCarouselSlides([a, b])).toEqual([
      { kind: 'single', key: 'a', card: a },
      { kind: 'single', key: 'b', card: b },
    ]);
  });

  it('packs 6 imageless cards as two stacks of 3 (default depth)', () => {
    const c = [card('1'), card('2'), card('3'), card('4'), card('5'), card('6')];
    const slides = packCarouselSlides(c);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toMatchObject({
      kind: 'stack',
      cards: [c[0], c[1], c[2]],
    });
    expect(slides[1]).toMatchObject({
      kind: 'stack',
      cards: [c[3], c[4], c[5]],
    });
  });

  it('packs 5 imageless cards as one triple and one double (default depth)', () => {
    const c = [card('1'), card('2'), card('3'), card('4'), card('5')];
    const slides = packCarouselSlides(c);
    expect(slides).toHaveLength(2);
    expect(slides[0]?.kind).toBe('stack');
    expect(slides[0]?.kind === 'stack' && slides[0].cards).toHaveLength(3);
    expect(slides[1]?.kind).toBe('stack');
    expect(slides[1]?.kind === 'stack' && slides[1].cards).toHaveLength(2);
  });

  it('flushes stacks before singles with images in between runs', () => {
    const a = card('a');
    const b = card('b');
    const img = card('pic', 'https://example.com/i.jpg');
    const c = card('c');
    const slides = packCarouselSlides([a, b, img, c]);
    expect(slides.map((s) => s.kind)).toEqual(['stack', 'single', 'single']);
    expect(slides[0]?.kind === 'stack' && slides[0].cards.map((x) => x.key)).toEqual(['a', 'b']);
  });

  it('stackDepth 1 never stacks imageless runs', () => {
    const c = [card('1'), card('2'), card('3'), card('4')];
    const slides = packCarouselSlides(c, { stackDepth: 1 });
    expect(slides).toHaveLength(4);
    expect(slides.every((s) => s.kind === 'single')).toBe(true);
  });

  it('stackDepth 4 packs seven imageless as 4 then 3', () => {
    const c = Array.from({ length: 7 }, (_, i) => card(String(i + 1)));
    const slides = packCarouselSlides(c, { stackDepth: 4 });
    expect(slides).toHaveLength(2);
    expect(slides[0]?.kind === 'stack' && slides[0].cards).toHaveLength(4);
    expect(slides[1]?.kind === 'stack' && slides[1].cards).toHaveLength(3);
  });

  it('stackDepth 2 packs five imageless as pair pair single', () => {
    const c = [card('1'), card('2'), card('3'), card('4'), card('5')];
    const slides = packCarouselSlides(c, { stackDepth: 2 });
    expect(slides).toHaveLength(3);
    expect(slides[0]?.kind === 'stack' && slides[0].cards).toHaveLength(2);
    expect(slides[1]?.kind === 'stack' && slides[1].cards).toHaveLength(2);
    expect(slides[2]).toMatchObject({ kind: 'single', key: '5' });
  });

  it('packs text_only cards with URLs as imageless stacks', () => {
    const a: CarouselCardViewModel = {
      key: 'a',
      title: 'a',
      imageUrl: 'https://x.example/a.jpg',
      imageLayout: 'text_only',
    };
    const b: CarouselCardViewModel = {
      key: 'b',
      title: 'b',
      imageUrl: 'https://x.example/b.jpg',
      imageLayout: 'text_only',
    };
    const slides = packCarouselSlides([a, b]);
    expect(slides).toHaveLength(1);
    expect(slides[0]?.kind).toBe('stack');
    expect(slides[0]?.kind === 'stack' && slides[0].cards).toEqual([a, b]);
  });

  it('flushes text_only run before a hero card', () => {
    const a: CarouselCardViewModel = { key: 'a', title: 'a', imageUrl: 'https://x/a.jpg', imageLayout: 'text_only' };
    const b: CarouselCardViewModel = { key: 'b', title: 'b', imageUrl: 'https://x/b.jpg', imageLayout: 'text_only' };
    const img: CarouselCardViewModel = { key: 'c', title: 'c', imageUrl: 'https://x/c.jpg', imageLayout: 'fit_under' };
    const slides = packCarouselSlides([a, b, img]);
    expect(slides.map((s) => s.kind)).toEqual(['stack', 'single']);
  });
});

describe('hasCarouselCardImage', () => {
  it('treats empty or whitespace URL as imageless', () => {
    expect(hasCarouselCardImage({ imageUrl: '' })).toBe(false);
    expect(hasCarouselCardImage({ imageUrl: '   ' })).toBe(false);
    expect(hasCarouselCardImage({ imageUrl: null })).toBe(false);
  });
});

describe('carouselCardShowsHeroImage', () => {
  it('hides hero for text_only even when URL is set', () => {
    expect(carouselCardShowsHeroImage({ imageUrl: 'https://x.example/x.jpg', imageLayout: 'text_only' })).toBe(false);
  });

  it('shows hero for other layouts when URL is set', () => {
    expect(carouselCardShowsHeroImage({ imageUrl: 'https://x.example/x.jpg', imageLayout: 'text_on_left' })).toBe(true);
  });
});
