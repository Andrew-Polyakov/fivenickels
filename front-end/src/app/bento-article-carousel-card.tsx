/**
 * Full public bentogrid01 Article carousel tile card (bordered tile + hero carousel).
 */

import * as React from 'react';

import {
  BentoArticleCarouselTile,
  type BentoArticleCarouselFrame,
} from '../components/shadcn-space/blocks/bento-grid-01/BentoArticleCarouselTile';
import {
  bentoGrid01SectionClassName,
  type BentoBlockBackground,
  type BentoTheme,
  type BentoTileStyle,
} from './bento-grid01-theme';

export type BentoArticleCarouselCardProps = {
  frames: BentoArticleCarouselFrame[];
  frameCount: number;
  autoScroll?: boolean;
  theme?: BentoTheme | string;
  tileStyle?: BentoTileStyle | string;
  blockBackground?: BentoBlockBackground | string;
  /** When false, omit theme scope (tile only — for use inside an existing bentogrid01 section). */
  includeThemeScope?: boolean;
  slideTurboFrame?: string;
  onSlideClick?: () => void;
};

function ArticleCarouselTileBody({
  frames,
  frameCount,
  autoScroll = false,
  slideTurboFrame,
  onSlideClick,
}: Pick<
  BentoArticleCarouselCardProps,
  'frames' | 'frameCount' | 'autoScroll' | 'slideTurboFrame' | 'onSlideClick'
>) {
  return (
    <div className="scn-bentogrid01__tile">
      <div className="scn-bentogrid01__tile-header scn-bentogrid01__tile-header--article-carousel scn-bentogrid01__tile-header--widget scn-bentogrid01__tile-header--round-bottom">
        <BentoArticleCarouselTile
          frames={frames}
          frameCount={frameCount}
          autoScroll={autoScroll}
          slideTurboFrame={slideTurboFrame}
          onSlideClick={onSlideClick}
        />
      </div>
    </div>
  );
}

export function BentoArticleCarouselCard({
  frames,
  frameCount,
  autoScroll = false,
  theme,
  tileStyle,
  blockBackground,
  includeThemeScope = true,
  slideTurboFrame,
  onSlideClick,
}: BentoArticleCarouselCardProps) {
  const tile = (
    <ArticleCarouselTileBody
      frames={frames}
      frameCount={frameCount}
      autoScroll={autoScroll}
      slideTurboFrame={slideTurboFrame}
      onSlideClick={onSlideClick}
    />
  );

  if (!includeThemeScope) {
    return tile;
  }

  return (
    <div
      className={bentoGrid01SectionClassName({
        theme,
        tileStyle,
        blockBackground,
      })}
    >
      {tile}
    </div>
  );
}
