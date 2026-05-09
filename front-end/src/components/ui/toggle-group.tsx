import * as React from 'react';
import { cn } from '../../lib/utils';

interface ToggleGroupContextValue {
  value: string;
  onValueChange: (v: string) => void;
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({
  value: '',
  onValueChange: () => {},
});

interface ToggleGroupProps {
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}

function ToggleGroup({ value, onValueChange, className, children }: ToggleGroupProps) {
  return (
    <ToggleGroupContext.Provider value={{ value, onValueChange }}>
      <div role="group" className={cn('scn-toggle-group', className)}>
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

interface ToggleGroupItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  children: React.ReactNode;
}

function ToggleGroupItem({ value, className, children, ...props }: ToggleGroupItemProps) {
  const ctx = React.useContext(ToggleGroupContext);
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={cn('scn-toggle-group__item', active && 'scn-toggle-group__item--on', className)}
      onClick={() => ctx.onValueChange(value)}
      {...props}
    >
      {children}
    </button>
  );
}

export { ToggleGroup, ToggleGroupItem };
