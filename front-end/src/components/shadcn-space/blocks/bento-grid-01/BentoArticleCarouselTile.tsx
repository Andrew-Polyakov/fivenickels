/**
 * Hero-style article carousel for a single bento grid cell.
 */

import * as React from 'react';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '../../../ui/carousel';
import {
  carouselAutoplayOpts,
  carouselAutoplayPlugins,
} from '../../../../app/carousel-autoplay';
import { cn } from '../../../../lib/utils';

export interface BentoArticleCarouselFrame {
  kind: string;
  title?: string;
  href?: string;
  imageUrl?: string;
  sourceLabel?: string;
  categoryName?: string;
  publishedAtIso?: string;
}

export interface BentoArticleCarouselTileProps {
  frames: BentoArticleCarouselFrame[];
  frameCount: number;
  autoScroll?: boolean;
}

export function formatRelativePublished(iso: string | undefined): string {
  if (!iso?.trim()) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return '';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${Math.max(1, years)}y`;
}

function BentoArticleCarouselFrameDots({
  frameCount,
  slideCount,
  selectedIndex,
  onSelect,
}: {
  frameCount: number;
  slideCount: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      className="bento-article-carousel__dots"
      role="tablist"
      aria-label="Carousel frames"
    >
      {Array.from({ length: frameCount }, (_, i) => {
        const isActive = i === selectedIndex;
        const isDisabled = i >= slideCount;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`Frame ${i + 1}`}
            disabled={isDisabled}
            className={cn(
              'bento-article-carousel__dot',
              isActive && 'bento-article-carousel__dot--active',
            )}
            onClick={() => onSelect(i)}
          />
        );
      })}
    </div>
  );
}

function CarouselSlide({ frame }: { frame: BentoArticleCarouselFrame }) {
  const metaParts: string[] = [];
  const source = (frame.sourceLabel || '').trim();
  if (source) metaParts.push(source);
  const rel = formatRelativePublished(frame.publishedAtIso);
  if (rel) metaParts.push(rel);
  const metaLine = metaParts.join(' • ');
  const title = frame.title ?? '';
  const href = frame.href || undefined;
  const imageUrl = frame.imageUrl || '';

  const inner = (
    <div
      className={cn(
        'bento-article-carousel__slide',
        !imageUrl && 'bento-article-carousel__slide--no-image',
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="bento-article-carousel__slide-img"
        />
      ) : (
        <div className="bento-article-carousel__slide-img bento-article-carousel__slide-img--placeholder" />
      )}
      <div className="bento-article-carousel__slide-scrim" aria-hidden />
      <div className="bento-article-carousel__slide-copy">
        {metaLine ? (
          <p className="bento-article-carousel__meta">{metaLine}</p>
        ) : null}
        <h3 className="bento-article-carousel__title">{title}</h3>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="bento-article-carousel__slide-link">
        {inner}
      </a>
    );
  }
  return inner;
}

export function BentoArticleCarouselTile({
  frames,
  frameCount,
  autoScroll = false,
}: BentoArticleCarouselTileProps) {
  const count = Math.max(2, Math.min(12, frameCount || 5));
  const [api, setApi] = React.useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const slides = frames.filter((f) => f.kind === 'article');
  const autoAdvance = Boolean(autoScroll);

  React.useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelectedIndex(api.selectedScrollSnap());
    onSelect();
    api.on('select', onSelect);
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api]);

  const scrollTo = React.useCallback(
    (index: number) => {
      if (!api) return;
      api.scrollTo(index);
    },
    [api],
  );

  if (slides.length === 0) {
    return (
      <div className="bento-article-carousel bento-article-carousel--empty">
        <p className="bento-article-carousel__empty-msg">No articles to show</p>
      </div>
    );
  }

  const dotIndex = Math.min(selectedIndex, count - 1);

  return (
    <div className="bento-article-carousel">
      <Carousel
        className="bento-article-carousel__carousel"
        opts={{
          align: 'start',
          ...(autoAdvance ? carouselAutoplayOpts(true) : { loop: slides.length > 1 }),
        }}
        plugins={carouselAutoplayPlugins(autoAdvance)}
        setApi={setApi}
      >
        <CarouselContent className="bento-article-carousel__track">
          {slides.map((frame, index) => (
            <CarouselItem
              key={`${frame.href ?? ''}-${index}`}
              className="bento-article-carousel__item"
            >
              <CarouselSlide frame={frame} />
            </CarouselItem>
          ))}
        </CarouselContent>
        {slides.length > 1 ? (
          <>
            <CarouselPrevious className="bento-article-carousel__nav bento-article-carousel__nav--prev" />
            <CarouselNext className="bento-article-carousel__nav bento-article-carousel__nav--next" />
          </>
        ) : null}
      </Carousel>
      {slides.length > 1 ? (
        <div className="bento-article-carousel__controls" aria-label="Carousel controls">
          <BentoArticleCarouselFrameDots
            frameCount={count}
            slideCount={slides.length}
            selectedIndex={dotIndex}
            onSelect={scrollTo}
          />
        </div>
      ) : null}
    </div>
  );
}
