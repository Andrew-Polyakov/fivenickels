import * as React from 'react';

import { cn } from '../../lib/utils';

export type AddonAlign = 'inline-start' | 'inline-end';

export type InputGroupProps = React.HTMLAttributes<HTMLDivElement>;

const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('scn-input-group', className)} {...props} />
));
InputGroup.displayName = 'InputGroup';

export type InputGroupInputProps = React.InputHTMLAttributes<HTMLInputElement>;

const InputGroupInput = React.forwardRef<HTMLInputElement, InputGroupInputProps>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn('scn-input', 'scn-input-group__input', className)} {...props} />
));
InputGroupInput.displayName = 'InputGroupInput';

export type InputGroupAddonProps = React.HTMLAttributes<HTMLSpanElement> & {
  align?: AddonAlign;
};

const InputGroupAddon = React.forwardRef<HTMLSpanElement, InputGroupAddonProps>(
  ({ className, align = 'inline-start', children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'scn-input-group__addon',
        align === 'inline-start' ? 'scn-input-group__addon--start' : 'scn-input-group__addon--end',
        className
      )}
      aria-hidden="true"
      {...props}
    >
      {children}
    </span>
  )
);
InputGroupAddon.displayName = 'InputGroupAddon';

export { InputGroup, InputGroupInput, InputGroupAddon };
