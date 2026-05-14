export type CarouselCardFontColorKey = 'white' | 'black' | 'slime' | 'gray';

export type CarouselCardImageLayout = 'fit_under' | 'scales_fit_top';

export type CarouselCardViewModel = {
  key: string;
  imageUrl?: string | null;
  tags?: string[] | null;
  title: string;
  excerpt?: string | null;
  url?: string | null;
  authorName?: string | null;
  publishedAt?: string | null;
  catalyst?: string | null;
  bgOpacity?: number;
  fontColor?: CarouselCardFontColorKey;
  /** Omitted = legacy column layout (body, footer, image fills bottom). Bento usually sets this. */
  imageLayout?: CarouselCardImageLayout;
};

export type CarouselPackedSingleSlide = {
  kind: 'single';
  key: string;
  card: CarouselCardViewModel;
};

export type CarouselPackedStackSlide = {
  kind: 'stack';
  key: string;
  cards: [CarouselCardViewModel, CarouselCardViewModel]
    | [CarouselCardViewModel, CarouselCardViewModel, CarouselCardViewModel];
};

export type CarouselPackedSlide = CarouselPackedSingleSlide | CarouselPackedStackSlide;

export function hasCarouselCardImage(card: Pick<CarouselCardViewModel, 'imageUrl'>): boolean {
  return Boolean(card.imageUrl?.trim());
}

function flushPendingImageless(pending: CarouselCardViewModel[], slides: CarouselPackedSlide[]): void {
  while (pending.length >= 3) {
    const a = pending.shift()!;
    const b = pending.shift()!;
    const c = pending.shift()!;
    slides.push({
      kind: 'stack',
      key: `${a.key}__${b.key}__${c.key}`,
      cards: [a, b, c],
    });
  }
  while (pending.length >= 2) {
    const first = pending.shift()!;
    const second = pending.shift()!;
    slides.push({
      kind: 'stack',
      key: `${first.key}__${second.key}`,
      cards: [first, second],
    });
  }
  if (pending.length === 1) {
    const card = pending.shift()!;
    slides.push({ kind: 'single', key: card.key, card });
  }
}

export function packCarouselSlides(cards: CarouselCardViewModel[]): CarouselPackedSlide[] {
  if (cards.length === 0) {
    return [];
  }

  const imagelessCount = cards.filter((card) => !hasCarouselCardImage(card)).length;
  if (imagelessCount < 2) {
    return cards.map((card) => ({ kind: 'single', key: card.key, card }));
  }

  const slides: CarouselPackedSlide[] = [];
  const pendingImageless: CarouselCardViewModel[] = [];

  for (const card of cards) {
    if (hasCarouselCardImage(card)) {
      flushPendingImageless(pendingImageless, slides);
      slides.push({ kind: 'single', key: card.key, card });
      continue;
    }
    pendingImageless.push(card);
  }

  flushPendingImageless(pendingImageless, slides);
  return slides;
}
