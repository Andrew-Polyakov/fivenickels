import { describe, expect, it } from 'vitest';

import {
  CAROUSEL_AUTOPLAY_DELAY_MS,
  carouselAutoplayOpts,
  carouselAutoplayPlugins,
} from './carousel-autoplay';

describe('carouselAutoplay', () => {
  it('returns undefined plugins when disabled', () => {
    expect(carouselAutoplayPlugins(false)).toBeUndefined();
  });

  it('returns Autoplay plugin when enabled', () => {
    const plugins = carouselAutoplayPlugins(true);
    expect(plugins).toHaveLength(1);
    expect(plugins?.[0]).toBeDefined();
  });

  it('sets loop only when enabled', () => {
    expect(carouselAutoplayOpts(false)).toEqual({ loop: false });
    expect(carouselAutoplayOpts(true)).toEqual({ loop: true });
  });

  it('uses a fixed autoplay delay', () => {
    expect(CAROUSEL_AUTOPLAY_DELAY_MS).toBe(3500);
  });
});
