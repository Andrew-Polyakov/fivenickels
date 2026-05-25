import Blockquote from '@tiptap/extension-blockquote';

/** Pull-quote block for article/taxonomy paragraph editors (renders as blockquote.scn-article-quote). */
export const ARTICLE_QUOTE_EXTENSION = Blockquote.extend({
  name: 'articleQuote',

  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: 'scn-article-quote',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'blockquote' }];
  },
});
