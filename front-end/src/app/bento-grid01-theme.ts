/**
 * Shared BentoGrid01 theme / layout classes for public mount, taxonomy editor, and readonly.
 */

export type BentoTheme = 'default' | 'inverted' | 'accent';
export type BentoBlockBackground = 'default' | 'edge_to_edge';
export type BentoTileStyle = 'bordered' | 'shadow' | 'flat';

export function normalizeBentoTheme(raw: unknown): BentoTheme {
  const t = String(raw ?? 'default').toLowerCase().trim();
  if (t === 'default' || t === 'inverted' || t === 'accent') return t as BentoTheme;
  if (t === 'dark') return 'inverted';
  return 'default';
}

export function normalizeBentoBlockBackground(raw: unknown): BentoBlockBackground {
  const bg = String(raw ?? 'default').toLowerCase().trim();
  if (bg === 'edge_to_edge') return 'edge_to_edge';
  return 'default';
}

export function normalizeBentoTileStyle(raw: unknown): BentoTileStyle {
  const s = String(raw ?? 'bordered').toLowerCase().trim();
  if (s === 'shadow' || s === 'flat') return s;
  return 'bordered';
}

/** Legacy payloads may still carry `section_padding`; treat as contained background. */
export function bentoBlockBackgroundFromPayload(payload: {
  block_background?: unknown;
  section_padding?: unknown;
}): BentoBlockBackground {
  if (payload.block_background != null) {
    return normalizeBentoBlockBackground(payload.block_background);
  }
  return 'default';
}

export interface BentoGrid01ThemeClassesInput {
  theme?: unknown;
  blockBackground?: unknown;
  tileStyle?: unknown;
}

/** Section / shell: public <section>, editor root, readonly preview wrapper. */
export function bentoGrid01SectionClassName(input: BentoGrid01ThemeClassesInput): string {
  const theme = normalizeBentoTheme(input.theme);
  const bg = normalizeBentoBlockBackground(input.blockBackground);
  const tile = normalizeBentoTileStyle(input.tileStyle);
  return [
    'scn-bentogrid01',
    `scn-bentogrid01--theme-${theme}`,
    bg === 'edge_to_edge' ? 'scn-bentogrid01--bg-edge' : 'scn-bentogrid01--bg-default',
    `scn-bentogrid01--tile-${tile}`,
  ].join(' ');
}
