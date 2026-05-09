import * as React from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

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
      <ToolbarBtn active={editor.isActive('bold')} title="Bold (⌘B)"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleBold().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive('italic')} title="Italic (⌘I)"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleItalic().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
      </ToolbarBtn>
      <span className="scn-rte-sep" />
      <ToolbarBtn active={editor.isActive('heading', { level: 2 })} title="Heading 2"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleHeading({ level: 2 }).run())}>
        H2
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive('heading', { level: 3 })} title="Heading 3"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleHeading({ level: 3 }).run())}>
        H3
      </ToolbarBtn>
      <span className="scn-rte-sep" />
      <ToolbarBtn active={editor.isActive('bulletList')} title="Bullet list"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleBulletList().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive('orderedList')} title="Ordered list"
        onMouseDown={e => cmd(e, () => editor.chain().focus().toggleOrderedList().run())}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
      </ToolbarBtn>
      <span className="scn-rte-sep" />
      <ToolbarBtn active={editor.isActive('link')} title="Link (⌘K)" onMouseDown={openLink}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      </ToolbarBtn>
      {editor.isActive('link') && (
        <ToolbarBtn active={false} title="Remove link"
          onMouseDown={e => cmd(e, () => editor.chain().focus().unsetLink().run())}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
        </ToolbarBtn>
      )}
      {onInsertImage && (
        <>
          <span className="scn-rte-sep" />
          <ToolbarBtn active={false} title="Insert image"
            onMouseDown={e => { e.preventDefault(); onInsertImage(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
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
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      TiptapLink.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
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
      <EditorContent editor={editor} className="scn-rte-content" />
    </div>
  );
}
