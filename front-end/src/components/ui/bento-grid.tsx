import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

// ── Responsive column map ─────────────────────────────────────────────────────
// Full class strings so JIT/manual CSS definitions can match exactly.
export const bentoColumnMap = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
} as const;

// Per-item span helpers keyed by integer (1–4 cols, 1–3 rows)
export const bentoColSpanMap: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
};

export const bentoRowSpanMap: Record<number, string> = {
  1: 'row-span-1',
  2: 'row-span-2',
  3: 'row-span-3',
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BentoFeature {
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string; // e.g. "md:col-span-2 row-span-2"
}

interface UniversalBentoProps {
  items: BentoFeature[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

// ── Primitives ────────────────────────────────────────────────────────────────

export function BentoGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('bento-grid', className)}>
      {children}
    </div>
  );
}

export function BentoGridItem({ className, title, description, header, icon, children }: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      className={cn('bento-grid-item', className)}
      whileHover={{ scale: 1.015, transition: { duration: 0.15 } }}
    >
      {header && <div className="bento-grid-item__header">{header}</div>}
      {icon && <div className="bento-grid-item__icon">{icon}</div>}
      {(title || description) && (
        <div className="bento-grid-item__body">
          {title && <h3 className="bento-grid-item__title">{title}</h3>}
          {description && <p className="bento-grid-item__desc">{description}</p>}
        </div>
      )}
      {children}
    </motion.div>
  );
}

// ── Configurable wrapper ──────────────────────────────────────────────────────

export function FlexibleBentoGrid({ items, columns = 3, className }: UniversalBentoProps) {
  return (
    <BentoGrid className={cn('max-w-7xl mx-auto', bentoColumnMap[columns], className)}>
      {items.map((item, i) => (
        <BentoGridItem
          key={i}
          title={item.title}
          description={item.description}
          header={item.header}
          icon={item.icon}
          className={item.className}
        />
      ))}
    </BentoGrid>
  );
}
