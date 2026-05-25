import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { EditorialTagList, type EditorialTagPayload } from '../components/editorial-tag-list';

export type TagCloudPayload = EditorialTagPayload;

function readTagCloudPayload(jsonId: string): TagCloudPayload[] | null {
  const el = document.getElementById(jsonId);
  if (!el?.textContent?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(el.textContent) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed as TagCloudPayload[];
  } catch {
    return null;
  }
}

const tagCloudRoots = new WeakMap<HTMLElement, Root>();

function isTagCloudHostMounted(host: HTMLElement): boolean {
  return Boolean(host.querySelector('.tag-cloud'));
}

export function unmountShadcnTagCloud(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-shadcn-tag-cloud]').forEach((host) => {
    const reactRoot = tagCloudRoots.get(host);
    if (reactRoot) {
      reactRoot.unmount();
      tagCloudRoots.delete(host);
    }
    delete host.dataset['shadcnTagCloudBound'];
  });
}

export function mountShadcnTagCloud(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-tag-cloud]').forEach((host) => {
    if (host.dataset['shadcnTagCloudBound'] === '1' && isTagCloudHostMounted(host)) {
      return;
    }
    if (host.dataset['shadcnTagCloudBound'] === '1') {
      delete host.dataset['shadcnTagCloudBound'];
      const stale = tagCloudRoots.get(host);
      if (stale) {
        stale.unmount();
        tagCloudRoots.delete(host);
      }
    }
    const jsonId = host.dataset['tagsJsonId'];
    if (!jsonId) {
      return;
    }
    const tags = readTagCloudPayload(jsonId);
    if (!tags?.length) {
      return;
    }
    host.dataset['shadcnTagCloudBound'] = '1';
    let root = tagCloudRoots.get(host);
    if (!root) {
      root = createRoot(host);
      tagCloudRoots.set(host, root);
    }
    root.render(<EditorialTagList tags={tags} className="tag-cloud" />);
  });
}
