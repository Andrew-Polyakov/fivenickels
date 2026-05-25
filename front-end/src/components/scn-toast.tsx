import * as React from 'react';

export function ScnToast({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: 'success' | 'error';
  onDismiss: () => void;
}): React.JSX.Element {
  React.useEffect(() => {
    const t = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(t);
  }, [message, onDismiss]);

  return (
    <div
      className={`scn-editor-toast scn-editor-toast--${type}`}
      onClick={onDismiss}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
