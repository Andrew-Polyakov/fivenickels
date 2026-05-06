import * as React from 'react';

import { cn } from '../../lib/utils';

const Empty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('scn-empty', className)} {...props} />
  )
);
Empty.displayName = 'Empty';

const EmptyHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('scn-empty__header', className)} {...props} />
  )
);
EmptyHeader.displayName = 'EmptyHeader';

const EmptyMedia = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('scn-empty__media', className)} {...props} />
  )
);
EmptyMedia.displayName = 'EmptyMedia';

const EmptyTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('scn-empty__title', className)} {...props} />
  )
);
EmptyTitle.displayName = 'EmptyTitle';

const EmptyDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('scn-empty__description', className)} {...props} />
  )
);
EmptyDescription.displayName = 'EmptyDescription';

const EmptyContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('scn-empty__content', className)} {...props} />
  )
);
EmptyContent.displayName = 'EmptyContent';

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
