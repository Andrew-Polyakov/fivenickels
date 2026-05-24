import Autoplay from 'embla-carousel-autoplay';

export const CAROUSEL_AUTOPLAY_DELAY_MS = 3500;

export function carouselAutoplayPlugins(enabled: boolean) {
  if (!enabled) {
    return undefined;
  }
  return [Autoplay({ delay: CAROUSEL_AUTOPLAY_DELAY_MS, stopOnInteraction: true })];
}

export function carouselAutoplayOpts(enabled: boolean) {
  return { loop: Boolean(enabled) };
}
