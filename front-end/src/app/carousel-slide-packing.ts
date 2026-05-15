export type CarouselCardFontColorKey = 'white' | 'black' | 'slime' | 'gray';

/** Bento / taxonomy: geometry of text vs hero (four choices). */
export type CarouselCardTextImageLayout =
  | 'text_on_top'
  | 'text_on_left'
  | 'text_on_right'
  | 'text_only';

/** Bento / taxonomy: how the hero fills its slot for underlay vs stacked vs split. */
export type CarouselCardImageScale = 'scales_to_fit' | 'bleed_under';

/**
 * Legacy single-select values still accepted on payloads / older JSON.
 * Prefer `textImageLayout` + `imageScale`.
 */
export type CarouselCardImageLayoutLegacy =
  | 'fit_under'
  | 'scales_fit_top'
  | CarouselCardTextImageLayout;

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
  /** Preferred: layout + scale from bento / taxonomy. */
  textImageLayout?: CarouselCardTextImageLayout;
  imageScale?: CarouselCardImageScale;
  /**
   * Legacy combined field (carousel slots, old saves).
   * Ignored when `textImageLayout` is set.
   */
  imageLayout?: CarouselCardImageLayoutLegacy;
};

/** @deprecated use CarouselCardTextImageLayout + CarouselCardImageScale */
export type CarouselCardImageLayout = CarouselCardImageLayoutLegacy;

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

export type CarouselCardRenderMode =
  | 'imageless'
  | 'fit_under'
  | 'stack_bottom_contain'
  | 'split_left_cover'
  | 'split_left_contain'
  | 'split_right_cover'
  | 'split_right_contain'
  | 'legacy_bottom_cover';

export function hasCarouselCardImage(card: Pick<CarouselCardViewModel, 'imageUrl'>): boolean {
  return Boolean(card.imageUrl?.trim());
}

function legacyCombinedToMode(
  leg: CarouselCardImageLayoutLegacy | undefined,
  imageScale: CarouselCardImageScale | undefined,
): CarouselCardRenderMode | null {
  if (!leg) return null;
  const sc = imageScale ?? 'bleed_under';
  if (leg === 'text_only') return 'imageless';
  if (leg === 'fit_under') return 'fit_under';
  if (leg === 'scales_fit_top') return 'stack_bottom_contain';
  if (leg === 'text_on_top') {
    return sc === 'scales_to_fit' ? 'stack_bottom_contain' : 'fit_under';
  }
  if (leg === 'text_on_left') {
    return sc === 'scales_to_fit' ? 'split_left_contain' : 'split_left_cover';
  }
  if (leg === 'text_on_right') {
    return sc === 'scales_to_fit' ? 'split_right_contain' : 'split_right_cover';
  }
  return null;
}

/**
 * Resolved DOM/visual mode for `CarouselCard`.
 * Carousel slots omit layout fields → stacked text + cover hero under (legacy).
 */
export function resolveCarouselCardRenderMode(
  vm: Pick<CarouselCardViewModel, 'imageUrl' | 'textImageLayout' | 'imageScale' | 'imageLayout'>,
): CarouselCardRenderMode {
  if (vm.textImageLayout === 'text_only') {
    return 'imageless';
  }
  if (!hasCarouselCardImage(vm)) {
    return 'imageless';
  }

  const scale = vm.imageScale ?? 'bleed_under';

  if (vm.textImageLayout != null) {
    if (vm.textImageLayout === 'text_on_top') {
      return scale === 'scales_to_fit' ? 'stack_bottom_contain' : 'fit_under';
    }
    if (vm.textImageLayout === 'text_on_left') {
      return scale === 'scales_to_fit' ? 'split_left_contain' : 'split_left_cover';
    }
    if (vm.textImageLayout === 'text_on_right') {
      return scale === 'scales_to_fit' ? 'split_right_contain' : 'split_right_cover';
    }
  }

  const fromLegacy = legacyCombinedToMode(vm.imageLayout, vm.imageScale);
  if (fromLegacy != null) {
    return fromLegacy;
  }

  return 'legacy_bottom_cover';
}

/** True when the card should render a hero image (excludes `text_only` even if `imageUrl` is set). */
export function carouselCardShowsHeroImage(card: Pick<CarouselCardViewModel, 'imageUrl' | 'textImageLayout' | 'imageLayout'>): boolean {
  if (card.textImageLayout === 'text_only' || card.imageLayout === 'text_only') {
    return false;
  }
  return hasCarouselCardImage(card);
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

  const imagelessCount = cards.filter((card) => !carouselCardShowsHeroImage(card)).length;
  if (imagelessCount < 2) {
    return cards.map((card) => ({ kind: 'single', key: card.key, card }));
  }

  const slides: CarouselPackedSlide[] = [];
  const pendingImageless: CarouselCardViewModel[] = [];

  for (const card of cards) {
    if (carouselCardShowsHeroImage(card)) {
      flushPendingImageless(pendingImageless, slides, stackDepth);
      slides.push({ kind: 'single', key: card.key, card });
      continue;
    }
    pendingImageless.push(card);
  }

  flushPendingImageless(pendingImageless, slides, stackDepth);
  return slides;
}
