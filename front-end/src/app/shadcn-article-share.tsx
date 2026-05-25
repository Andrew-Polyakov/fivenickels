import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { ScnToast } from '../components/scn-toast';

export type ArticleSharePayload = {
  shareUrl: string;
};

function resolvePermalink(sharePath: string): string {
  if (!sharePath) {
    return window.location.href;
  }
  try {
    return new URL(sharePath, window.location.origin).toString();
  } catch {
    return window.location.href;
  }
}

function ArticleShareView({ shareUrl }: { shareUrl: string }): React.JSX.Element {
  const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );

  const handleClick = React.useCallback(
    (evt: React.MouseEvent<HTMLButtonElement>) => {
      evt.preventDefault();
      evt.stopPropagation();
      const permalink = resolvePermalink(shareUrl);
      const writePromise =
        navigator.clipboard && navigator.clipboard.writeText
          ? navigator.clipboard.writeText(permalink)
          : Promise.reject(new Error('Clipboard API unavailable'));
      writePromise
        .then(() => {
          setToast({ message: 'Copied to clipboard!', type: 'success' });
        })
        .catch(() => {
          setToast({
            message: `Could not copy automatically. Link: ${permalink}`,
            type: 'error',
          });
        });
    },
    [shareUrl]
  );

  return (
    <>
      <button
        type="button"
        className="tagged-content__share"
        onClick={handleClick}
        aria-label="Copy article link for sharing"
        title="Copy link"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.59 13.51 6.83 3.98" />
          <path d="M15.41 6.51l-6.82 3.98" />
        </svg>
        <span className="tagged-content__share-label">Share</span>
      </button>
      {toast ? (
        <ScnToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </>
  );
}

function readSharePayload(jsonId: string): ArticleSharePayload | null {
  const el = document.getElementById(jsonId);
  if (!el?.textContent?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(el.textContent) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const p = parsed as ArticleSharePayload;
    if (typeof p.shareUrl !== 'string') {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

const shareRoots = new WeakMap<HTMLElement, Root>();

export function mountShadcnArticleShare(): void {
  document.querySelectorAll<HTMLElement>('[data-shadcn-article-share]').forEach((host) => {
    if (host.dataset['shadcnArticleShareBound'] === '1') {
      return;
    }
    const jsonId = host.dataset['shareJsonId'];
    if (!jsonId) {
      return;
    }
    const payload = readSharePayload(jsonId);
    if (!payload) {
      return;
    }
    host.dataset['shadcnArticleShareBound'] = '1';
    let root = shareRoots.get(host);
    if (!root) {
      root = createRoot(host);
      shareRoots.set(host, root);
    }
    root.render(<ArticleShareView shareUrl={payload.shareUrl} />);
  });
}
