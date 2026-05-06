import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb';

export type BreadcrumbCrumbPayload = {
  label: string;
  href?: string;
};

function ShadcnBreadcrumbsView({ items }: { items: BreadcrumbCrumbPayload[] }): React.JSX.Element | null {
  if (!items.length) {
    return null;
  }
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, i) => (
          <React.Fragment key={`${i}-${item.label}`}>
            {i > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>
              {item.href ? (
                <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function readBreadcrumbPayload(jsonId: string): BreadcrumbCrumbPayload[] | null {
  const el = document.getElementById(jsonId);
  if (!el?.textContent?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(el.textContent) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed as BreadcrumbCrumbPayload[];
  } catch {
    return null;
  }
}

const breadcrumbRoots = new WeakMap<HTMLElement, Root>();

export function mountShadcnBreadcrumbs(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-breadcrumb]').forEach((host) => {
    if (host.dataset['shadcnBreadcrumbBound'] === '1') {
      return;
    }
    const jsonId = host.dataset['breadcrumbJsonId'];
    if (!jsonId) {
      return;
    }
    const items = readBreadcrumbPayload(jsonId);
    if (!items?.length) {
      return;
    }
    host.dataset['shadcnBreadcrumbBound'] = '1';
    let root = breadcrumbRoots.get(host);
    if (!root) {
      root = createRoot(host);
      breadcrumbRoots.set(host, root);
    }
    root.render(<ShadcnBreadcrumbsView items={items} />);
  });
}
