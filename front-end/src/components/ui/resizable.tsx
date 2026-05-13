import * as React from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { cn } from '../../lib/utils';

export type ResizablePanelGroupProps = React.ComponentProps<typeof Group>;
export type ResizablePanelProps = React.ComponentProps<typeof Panel>;
export type ResizableHandleProps = React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
};

export function ResizablePanelGroup({
  className,
  ...props
}: ResizablePanelGroupProps) {
  return (
    <Group
      className={cn('scn-resizable-panel-group', className)}
      {...props}
    />
  );
}

export function ResizablePanel({
  className,
  ...props
}: ResizablePanelProps) {
  return (
    <Panel
      className={cn('scn-resizable-panel', className)}
      {...props}
    />
  );
}

export function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizableHandleProps) {
  return (
    <Separator
      className={cn(
        'scn-resize-handle',
        withHandle && 'scn-resize-handle--with-grip',
        className
      )}
      {...props}
    >
      {withHandle ? (
        <div className="scn-resize-handle__grip">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 6 16"
            fill="currentColor"
            className="scn-resize-handle__grip-icon"
          >
            <circle cx="1" cy="4" r="1" />
            <circle cx="5" cy="4" r="1" />
            <circle cx="1" cy="8" r="1" />
            <circle cx="5" cy="8" r="1" />
            <circle cx="1" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        </div>
      ) : null}
    </Separator>
  );
}
