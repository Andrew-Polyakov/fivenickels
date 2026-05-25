import * as React from 'react';

import { cn } from '../lib/utils';
import { ScnTag, ScnTagLink, type EditorialTagPayload } from './scn-tag';

export type { EditorialTagPayload };

export function EditorialTagList({
  tags,
  className,
  ariaLabel = 'Tags',
}: {
  tags: EditorialTagPayload[];
  className?: string;
  ariaLabel?: string;
}): React.JSX.Element | null {
  if (!tags.length) {
    return null;
  }
  return (
    <nav className={cn('tagged-content__meta-tags', className)} aria-label={ariaLabel}>
      {tags.map((tag) =>
        tag.inactive || !tag.href ? (
          <ScnTag key={tag.name} inactive>
            {tag.name}
          </ScnTag>
        ) : (
          <ScnTagLink key={tag.name} href={tag.href}>
            {tag.name}
          </ScnTagLink>
        )
      )}
    </nav>
  );
}
