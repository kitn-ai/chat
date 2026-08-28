import type { JSX } from 'solid-js';
import { cn } from '../utils/cn';

/**
 * Shared wordless-skeleton language for `Labs/Builder/<Template>` preview
 * hosts (docs/superpowers/specs/2026-08-28-template-builder-design.md).
 *
 * Extracted from `builder-in-app-assistant.stories.tsx` (Round A2) into this
 * standalone module during the T-1 build-out (Assistant/Research/Workspace/
 * Voice) so every template's "the rest of your app" skeleton chrome shares
 * one definition instead of four copies drifting apart — the cross-cutting
 * mandate the design spec's Process step names ("as shared needs emerge,
 * refactor the shared components ONCE"). `builder-in-app-assistant.stories.tsx`
 * was retrofitted to import from here in the same round; nothing about its
 * rendered output changed.
 *
 * PLAIN inline CSS (`color-mix`), not a Tailwind opacity-modifier class
 * on a color utility or an arbitrary-bracket width value — see the
 * original Round A2 note in git blame: this Storybook dev server's
 * Tailwind JIT pass proved non-deterministic for FRESH combinations
 * introduced by a single file (a class would show correctly in the rendered
 * `className` while `getComputedStyle` reported the rule simply wasn't
 * compiled). `color-mix()` is real CSS with no compile step to race, and
 * matches what Tailwind's own `/NN` opacity modifier generates.
 */
export function mix(colorVar: string, pct: number): string {
  return `color-mix(in oklab, var(${colorVar}) ${pct}%, transparent)`;
}

/** One skeleton bar/pill. `widthClass` for a standard-scale Tailwind width
 *  utility (proven reliable); `width` for an inline CSS width (a
 *  percentage, or anything arbitrary); `flex` to grow and fill instead of
 *  taking either. Height is always a standard-scale utility unless
 *  overridden. */
export function SkeletonBar(props: {
  widthClass?: string;
  width?: string;
  heightClass?: string;
  pct: number;
  flex?: boolean;
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      class={cn('rounded-full', props.heightClass ?? 'h-2', props.flex ? 'flex-1' : props.widthClass)}
      style={{ width: props.flex ? undefined : props.width, 'background-color': mix('--color-muted-foreground', props.pct) }}
    />
  );
}

/** A grayscale/muted skeleton stat tile: a label bar over a bigger number
 *  bar. Deliberately toneless (muted-foreground tints only, never
 *  `bg-primary`/accent) so the host reads as chrome around the product
 *  rather than product itself. */
export function StubStatTile(props: { class?: string }): JSX.Element {
  return (
    <div
      class={cn('flex flex-col justify-center gap-2 rounded-xl border border-border px-4', props.class)}
      style={{ 'background-color': mix('--color-surface', 40) }}
    >
      <SkeletonBar width="45%" pct={20} />
      <SkeletonBar width="65%" heightClass="h-3.5" pct={30} />
    </div>
  );
}

/** A single stub nav-rail row: an icon-ish dot plus a label bar. `active`
 *  lights the row the way a real nav's current-page item would. */
export function StubNavRow(props: { active?: boolean }): JSX.Element {
  return (
    <div
      class="flex items-center gap-2 rounded-md px-2 py-1.5"
      style={props.active ? { 'background-color': mix('--color-surface', 60) } : undefined}
    >
      <span
        aria-hidden="true"
        class="size-2 shrink-0 rounded-full"
        style={{ 'background-color': mix('--color-muted-foreground', 30) }}
      />
      <SkeletonBar flex pct={20} />
    </div>
  );
}

/** A single stub table row: a handful of column bars at staggered widths,
 *  so the row reads as data rather than one flat block. */
export function StubTableRow(): JSX.Element {
  return (
    <div class="flex items-center gap-4 border-b px-3 py-2.5 last:border-b-0" style={{ 'border-color': mix('--color-border', 60) }}>
      <SkeletonBar width="18%" pct={25} />
      <SkeletonBar width="28%" pct={15} />
      <SkeletonBar width="14%" pct={15} />
      <SkeletonBar flex pct={10} />
    </div>
  );
}

/** A wordless skeleton code/text block: a stack of bars at staggered
 *  widths, monospace rhythm (shorter, denser bars) rather than prose
 *  rhythm — for the Workspace template's artifact/code pane. */
export function StubCodeBlock(props: { lines?: number; class?: string }): JSX.Element {
  const n = props.lines ?? 8;
  const widths = ['85%', '62%', '70%', '40%', '90%', '55%', '30%', '75%'];
  return (
    <div class={cn('flex flex-col gap-2', props.class)}>
      {Array.from({ length: n }).map((_, i) => (
        <SkeletonBar width={widths[i % widths.length]} heightClass="h-2" pct={20} />
      ))}
    </div>
  );
}
