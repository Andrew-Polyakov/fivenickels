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
  /** Length ≥ 2 for stacks emitted by packing (runtime invariant). */
  cards: CarouselCardViewModel[];
};

export type CarouselPackedSlide = CarouselPackedSingleSlide | CarouselPackedStackSlide;

export type PackCarouselSlidesOptions = {
  /** 1 = never stack imageless cards; 2–4 = max cards per stacked slide. Default 3. */
  stackDepth?: number;
};

export function hasCarouselCardImage(card: Pick<CarouselCardViewModel, 'imageUrl'>): boolean {
  return Boolean(card.imageUrl?.trim());
}

function clampStackDepth(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 3;
  return Math.min(4, Math.max(1, Math.round(raw)));
}

function flushPendingImageless(
  pending: CarouselCardViewModel[],
  slides: CarouselPackedSlide[],
  stackDepth: number,
): void {
  while (pending.length >= stackDepth) {
    const chunk = pending.splice(0, stackDepth);
    slides.push({
      kind: 'stack',
      key: chunk.map((c) => c.key).join('__'),
      cards: chunk,
    });
  }
  const rem = pending.length;
  if (rem === 0) return;
  if (rem === 1) {
    const card = pending.shift()!;
    slides.push({ kind: 'single', key: card.key, card });
    return;
  }
  const chunk = pending.splice(0, rem);
  slides.push({
    kind: 'stack',
    key: chunk.map((c) => c.key).join('__'),
    cards: chunk,
  });
}

export function packCarouselSlides(
  cards: CarouselCardViewModel[],
  options?: PackCarouselSlidesOptions,
): CarouselPackedSlide[] {
  if (cards.length === 0) {
    return [];
  }

  const stackDepth = clampStackDepth(options?.stackDepth);

  if (stackDepth <= 1) {
    return cards.map((card) => ({ kind: 'single', key: card.key, card }));
  }

  const imagelessCount = cards.filter((card) => !hasCarouselCardImage(card)).length;
  if (imagelessCount < 2) {
    return cards.map((card) => ({ kind: 'single', key: card.key, card }));
  }

  const slides: CarouselPackedSlide[] = [];
  const pendingImageless: CarouselCardViewModel[] = [];

  for (const card of cards) {
    if (hasCarouselCardImage(card)) {
      flushPendingImageless(pendingImageless, slides, stackDepth);
      slides.push({ kind: 'single', key: card.key, card });
      continue;
    }
    pendingImageless.push(card);
  }

  flushPendingImageless(pendingImageless, slides, stackDepth);
  return slides;
}
