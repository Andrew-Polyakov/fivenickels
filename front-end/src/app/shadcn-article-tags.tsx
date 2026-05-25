import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Badge } from '../components/ui/badge';

export type ArticleTagPayload = {
  name: string;
  href: string | null;
  inactive: boolean;
};

function ArticleTagsView({ tags }: { tags: ArticleTagPayload[] }): React.JSX.Element | null {
  if (!tags.length) {
    return null;
  }
  return (
    <nav className="tagged-content__meta-tags" aria-label="Tags">
      {tags.map((tag) =>
        tag.inactive || !tag.href ? (
          <Badge key={tag.name} variant="outline" className="tagged-content__meta-tag" aria-disabled>
            {tag.name}
          </Badge>
        ) : (
          <a key={tag.name} href={tag.href} className="tagged-content__meta-tag-link">
            <Badge variant="outline" className="tagged-content__meta-tag">
              {tag.name}
            </Badge>
          </a>
        )
      )}
    </nav>
  );
}

function readTagsPayload(jsonId: string): ArticleTagPayload[] | null {
  const el = document.getElementById(jsonId);
  if (!el?.textContent?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(el.textContent) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed as ArticleTagPayload[];
  } catch {
    return null;
  }
}

const tagRoots = new WeakMap<HTMLElement, Root>();

function isTagsHostMounted(host: HTMLElement): boolean {
  return Boolean(host.querySelector('.tagged-content__meta-tags'));
}

export function unmountShadcnArticleTags(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-shadcn-article-tags]').forEach((host) => {
    const reactRoot = tagRoots.get(host);
    if (reactRoot) {
      reactRoot.unmount();
      tagRoots.delete(host);
    }
    delete host.dataset['shadcnArticleTagsBound'];
  });
}

export function mountShadcnArticleTags(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-article-tags]').forEach((host) => {
    if (host.dataset['shadcnArticleTagsBound'] === '1' && isTagsHostMounted(host)) {
      return;
    }
    if (host.dataset['shadcnArticleTagsBound'] === '1') {
      delete host.dataset['shadcnArticleTagsBound'];
      const stale = tagRoots.get(host);
      if (stale) {
        stale.unmount();
        tagRoots.delete(host);
      }
    }
    const jsonId = host.dataset['tagsJsonId'];
    if (!jsonId) {
      return;
    }
    const tags = readTagsPayload(jsonId);
    if (!tags?.length) {
      return;
    }
    host.dataset['shadcnArticleTagsBound'] = '1';
    let root = tagRoots.get(host);
    if (!root) {
      root = createRoot(host);
      tagRoots.set(host, root);
    }
    root.render(<ArticleTagsView tags={tags} />);
  });
}
