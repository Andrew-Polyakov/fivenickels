import * as React from 'react';

import { cn } from '../lib/utils';
import { Badge, type BadgeProps } from './ui/badge';

/** Shared pill classes for editorial / Wagtail content tags. */
export const EDITORIAL_TAG_BADGE_CLASS = 'tagged-content__meta-tag';

export const EDITORIAL_TAG_LINK_CLASS = 'tagged-content__meta-tag-link scn-tag-link';

export type EditorialTagPayload = {
  name: string;
  href: string | null;
  inactive: boolean;
};

export type ScnTagProps = Omit<BadgeProps, 'variant'> & {
  inactive?: boolean;
};

/** Editorial / Wagtail tag pill (outline, transparent, blue glow on hover). */
export function ScnTag({ className, inactive, ...props }: ScnTagProps): React.JSX.Element {
  return (
    <Badge
      variant="tag"
      className={cn(EDITORIAL_TAG_BADGE_CLASS, className)}
      aria-disabled={inactive ? true : undefined}
      {...props}
    />
  );
}

export type ScnTagLinkProps = {
  href: string;
  className?: string;
  badgeClassName?: string;
  children: React.ReactNode;
};

export function ScnTagLink({
  href,
  className,
  badgeClassName,
  children,
}: ScnTagLinkProps): React.JSX.Element {
  return (
    <a href={href} className={cn(EDITORIAL_TAG_LINK_CLASS, className)}>
      <Badge variant="tag" className={cn(EDITORIAL_TAG_BADGE_CLASS, badgeClassName)}>
        {children}
      </Badge>
    </a>
  );
}
