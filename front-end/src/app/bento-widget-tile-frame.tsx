import * as React from 'react';

import { ScrollArea } from '../components/ui/scroll-area';

type BentoWidgetTileFrameProps = {
  children: React.ReactNode;
  /** When false, child handles its own scroll (e.g. market movers header + body). */
  scrollable?: boolean;
};

/** Fills a bento/carousel tile and scrolls when the live widget exceeds the cell. */
export function BentoWidgetTileFrame({ children, scrollable = true }: BentoWidgetTileFrameProps) {
  if (!scrollable) {
    return (
      <div className="scn-bento-widget-tile scn-bento-widget-tile--fill">
        <div className="scn-bento-widget-tile__content">{children}</div>
      </div>
    );
  }
  return (
    <div className="scn-bento-widget-tile">
      <ScrollArea className="scn-bento-widget-tile__scroll">
        <div className="scn-bento-widget-tile__content">{children}</div>
      </ScrollArea>
    </div>
  );
}
