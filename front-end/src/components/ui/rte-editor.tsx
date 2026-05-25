import * as React from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { ARTICLE_QUOTE_EXTENSION } from '../../app/tiptap-article-quote';
import { cn } from '../../lib/utils';
import { SCN_PROSE } from './typography';

/** Shared Tiptap editor chrome for article paragraph / bento rich text. */
export const ARTICLE_RTE_EDITOR_PROPS = {
  editorProps: {
    attributes: {
      class: SCN_PROSE,
    },
  },
} as const;

// ─── Table extensions (shared with ParagraphEditor) ───────────────────────────

export const TABLE_EXTENSIONS = [
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

// ─── Toolbar Button ───────────────────────────────────────────────────────────

export function ToolbarBtn({
  active, title, onMouseDown, children,
}: {
  active?: boolean; title: string;
  onMouseDown: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`scn-rte-btn${active ? ' scn-rte-btn--active' : ''}`}
      onMouseDown={onMouseDown}
    >
      {children}
    </button>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

export function RteToolbar({ editor, onInsertImage }: { editor: Editor; onInsertImage?: () => void }) {
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkHref, setLinkHref] = React.useState('');
  const inTable = editor.isActive('table');

  function cmd(e: React.MouseEvent, fn: () => void) {
    e.preventDefault();
    fn();
  }

  function openLink(e: React.MouseEvent) {
    e.preventDefault();
    setLinkHref(editor.getAttributes('link')['href'] ?? '');
    setLinkOpen(true);
  }

  function applyLink() {
    const href = linkHref.trim();
    if (href) editor.chain().focus().setLink({ href }).run();
    else editor.chain().focus().unsetLink().run();
    setLinkOpen(false);
    setLinkHref('');
  }

  function cancelLink() {
    setLinkOpen(false);
    setLinkHref('');
    editor.commands.focus();
  }

  if (linkOpen) {
    return (
      <div className="scn-rte-toolbar scn-rte-toolbar--link">
        <input
          className="scn-rte-link-input"
          placeholder="https://…"
          value={linkHref}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onChange={e => setLinkHref(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); applyLink(); }
            if (e.key === 'Escape') { cancelLink(); }
          }}
        />
        <button type="button" className="scn-rte-btn" onClick={applyLink}>Insert</button>
        <button type="button" className="scn-rte-btn" onClick={cancelLink}>✕</button>
      </div>
    );
  }

  return (
    <div className="scn-rte-toolbar" onMouseDown={e => e.preventDefault()}>
      {/* ── Text formatting ── */}
      <ToolbarBtn active={editor.isActive('bold')} title="Bold (⌘B)"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleBold().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive('italic')} title="Italic (⌘I)"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleItalic().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
      </ToolbarBtn>
      <span className="scn-rte-sep" />

      {/* ── Headings ── */}
      <ToolbarBtn active={editor.isActive('heading', { level: 2 })} title="Heading 2"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleHeading({ level: 2 }).run())}>
        H2
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive('heading', { level: 3 })} title="Heading 3"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleHeading({ level: 3 }).run())}>
        H3
      </ToolbarBtn>
      <span className="scn-rte-sep" />

      {/* ── Lists ── */}
      <ToolbarBtn active={editor.isActive('bulletList')} title="Bullet list"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleBulletList().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive('orderedList')} title="Ordered list"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleOrderedList().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
      </ToolbarBtn>
      <span className="scn-rte-sep" />

      {/* ── Pull quote ── */}
      <ToolbarBtn active={editor.isActive('articleQuote')} title="Pull quote"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleWrap('articleQuote').run())}>
        <span className="scn-rte-btn__quote-icon" aria-hidden="true">&ldquo;</span>
      </ToolbarBtn>
      <span className="scn-rte-sep" />

      {/* ── Link ── */}
      <ToolbarBtn active={editor.isActive('link')} title="Link (⌘K)" onMouseDown={openLink}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      </ToolbarBtn>
      {editor.isActive('link') && (
        <ToolbarBtn active={false} title="Remove link"
          onMouseDown={e => cmd(e, () => editor.chain().focus().unsetLink().run())}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
        </ToolbarBtn>
      )}

      {/* ── Image ── */}
      {onInsertImage && (
        <>
          <span className="scn-rte-sep" />
          <ToolbarBtn active={false} title="Insert image"
            onMouseDown={e => { e.preventDefault(); onInsertImage(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </ToolbarBtn>
        </>
      )}

      {/* ── Table ── */}
      <span className="scn-rte-sep" />
      {!inTable ? (
        <ToolbarBtn active={false} title="Insert table"
          onMouseDown={e => cmd(e, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="1"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="3" y1="15" x2="21" y2="15"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
        </ToolbarBtn>
      ) : (
        <>
          <ToolbarBtn active={false} title="Add row below"
            onMouseDown={e => cmd(e, () => editor.chain().focus().addRowAfter().run())}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="11" rx="1"/>
              <line x1="3" y1="8" x2="21" y2="8"/>
              <line x1="9" y1="3" x2="9" y2="14"/>
              <line x1="15" y1="3" x2="15" y2="14"/>
              <line x1="12" y1="18" x2="12" y2="22"/>
              <line x1="10" y1="20" x2="14" y2="20"/>
            </svg>
          </ToolbarBtn>
          <ToolbarBtn active={false} title="Delete row"
            onMouseDown={e => cmd(e, () => editor.chain().focus().deleteRow().run())}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="11" rx="1"/>
              <line x1="3" y1="8" x2="21" y2="8"/>
              <line x1="9" y1="3" x2="9" y2="14"/>
              <line x1="15" y1="3" x2="15" y2="14"/>
              <line x1="10" y1="19" x2="14" y2="23"/>
              <line x1="14" y1="19" x2="10" y2="23"/>
            </svg>
          </ToolbarBtn>
          <span className="scn-rte-sep" />
          <ToolbarBtn active={false} title="Add column right"
            onMouseDown={e => cmd(e, () => editor.chain().focus().addColumnAfter().run())}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="11" height="18" rx="1"/>
              <line x1="8" y1="3" x2="8" y2="21"/>
              <line x1="3" y1="9" x2="14" y2="9"/>
              <line x1="3" y1="15" x2="14" y2="15"/>
              <line x1="18" y1="10" x2="18" y2="14"/>
              <line x1="16" y1="12" x2="20" y2="12"/>
            </svg>
          </ToolbarBtn>
          <ToolbarBtn active={false} title="Delete column"
            onMouseDown={e => cmd(e, () => editor.chain().focus().deleteColumn().run())}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="11" height="18" rx="1"/>
              <line x1="8" y1="3" x2="8" y2="21"/>
              <line x1="3" y1="9" x2="14" y2="9"/>
              <line x1="3" y1="15" x2="14" y2="15"/>
              <line x1="17" y1="10" x2="21" y2="14"/>
              <line x1="21" y1="10" x2="17" y2="14"/>
            </svg>
          </ToolbarBtn>
          <span className="scn-rte-sep" />
          <ToolbarBtn active={false} title="Delete table"
            onMouseDown={e => cmd(e, () => editor.chain().focus().deleteTable().run())}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="1"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
              <line x1="15" y1="3" x2="15" y2="21"/>
              <line x1="8" y1="8" x2="16" y2="16"/>
              <line x1="16" y1="8" x2="8" y2="16"/>
            </svg>
          </ToolbarBtn>
        </>
      )}
    </div>
  );
}

// ─── Generic RTE Editor ───────────────────────────────────────────────────────

export function RteEditor({ initialValue, onChange, placeholder }: {
  initialValue: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = React.useState(false);
  const editor = useEditor({
    ...ARTICLE_RTE_EDITOR_PROPS,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, blockquote: false }),
      ARTICLE_QUOTE_EXTENSION,
      TiptapLink.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      ...TABLE_EXTENSIONS,
    ],
    content: initialValue || '',
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    onFocus: () => setFocused(true),
    onBlur:  () => setFocused(false),
  });

  React.useEffect(() => { return () => { editor?.destroy(); }; /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className={`scn-rte-wrap${focused ? ' scn-rte-wrap--active' : ''}`}>
      {editor && <RteToolbar editor={editor} />}
      <EditorContent editor={editor} className={cn('scn-rte-content', SCN_PROSE)} />
    </div>
  );
}
