/**
 * shadcn/ui Typography — https://ui.shadcn.com/docs/components/radix/typography
 *
 * Typography is not a shipped component; styles live in `.scn-prose` (mysite.css).
 * Tailwind class strings below are kept for reference if the widget gains Tailwind later.
 */

/** Apply on ProseMirror / published rich-text roots (see articleProseSelectors). */
export const SCN_PROSE = 'scn-prose';

/**
 * CSS targets for article body typography (editor + published).
 * - `.scn-rte-content .ProseMirror` — Tiptap editor
 * - `.stream-block--paragraph .rich-text` — Wagtail paragraph block
 * - `.scn-taxonomy-content__paragraph` — taxonomy / bento previews
 */
export const articleProseSelectors = [
  '.scn-prose',
  '.scn-rte-content .ProseMirror',
  '.stream-block--paragraph .rich-text',
  '.scn-taxonomy-content__paragraph',
  '.scn-bento-editor__richtext-preview',
] as const;

/** shadcn doc utility recipes (reference only; implemented in mysite.css as .scn-prose). */
export const typographyClasses = {
  h1: 'scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance',
  h2: 'scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0',
  h3: 'scroll-m-20 text-2xl font-semibold tracking-tight',
  h4: 'scroll-m-20 text-xl font-semibold tracking-tight',
  p: 'leading-7 [&:not(:first-child)]:mt-6',
  blockquote: 'mt-6 border-l-2 pl-6 italic',
  ul: 'my-6 ml-6 list-disc [&>li]:mt-2',
  inlineCode:
    'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
  lead: 'text-xl text-muted-foreground',
  large: 'text-lg font-semibold',
  small: 'text-sm leading-none font-medium',
  muted: 'text-sm text-muted-foreground',
} as const;
