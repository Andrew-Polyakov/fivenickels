import * as React from 'react';

import { cn } from '../../lib/utils';

const Breadcrumb = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<'nav'>>(
  ({ className, ...props }, ref) => (
    <nav ref={ref} aria-label="Breadcrumb" className={cn('scn-breadcrumb', className)} {...props} />
  )
);
Breadcrumb.displayName = 'Breadcrumb';

const BreadcrumbList = React.forwardRef<HTMLOListElement, React.ComponentPropsWithoutRef<'ol'>>(
  ({ className, ...props }, ref) => (
    <ol ref={ref} className={cn('scn-breadcrumb__list', className)} {...props} />
  )
);
BreadcrumbList.displayName = 'BreadcrumbList';

const BreadcrumbItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<'li'>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} className={cn('scn-breadcrumb__item', className)} {...props} />
  )
);
BreadcrumbItem.displayName = 'BreadcrumbItem';

const BreadcrumbLink = React.forwardRef<HTMLAnchorElement, React.ComponentPropsWithoutRef<'a'>>(
  ({ className, ...props }, ref) => (
    <a ref={ref} className={cn('scn-breadcrumb__link', className)} {...props} />
  )
);
BreadcrumbLink.displayName = 'BreadcrumbLink';

const BreadcrumbPage = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<'span'>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn('scn-breadcrumb__page', className)}
      {...props}
    />
  )
);
BreadcrumbPage.displayName = 'BreadcrumbPage';

const BreadcrumbSeparator = ({ children, className, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
  <li role="presentation" aria-hidden="true" className={cn('scn-breadcrumb__separator', className)} {...props}>
    {children ?? (
      <svg
        className="scn-breadcrumb__chevron"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </li>
);
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator';

export { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator };
