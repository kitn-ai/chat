import { Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';

/** How the tray frames the input — the SPATIAL axis (padding/inset only).
 *  Orthogonal to {@link PromptDockAppearance}, which controls the surface.
 *  - `inset` (default) — uniform inset frames the input on ALL edges (the classic look).
 *  - `edge` — top/bottom inset only; the input sits FLUSH left/right so the lips span
 *    the full width.
 *  - `none` — no inset at all; the lips attach directly to the input as a plain stack. */
export type PromptDockFrame = 'inset' | 'edge' | 'none';

/** How the tray surface looks — the VISUAL axis (background / border / radius only).
 *  Orthogonal to {@link PromptDockFrame}, which controls the spatial inset. Works like
 *  a button variant.
 *  - `soft` (default) — sunken surface + border + radius (the classic look).
 *  - `outlined` — transparent surface + border + radius.
 *  - `filled` — sunken surface, no border, + radius.
 *  - `plain` — transparent surface, no border, no radius (truly bare). */
export type PromptDockAppearance = 'soft' | 'outlined' | 'filled' | 'plain';

export interface PromptDockProps {
  /** Optional content for the recessed band ABOVE the input (a notice, a hint).
   *  When omitted, no top lip renders and only the input shows. */
  top?: JSX.Element;
  /** Optional content for the recessed band BELOW the input (a mode / control row).
   *  When omitted, no bottom lip renders. */
  bottom?: JSX.Element;
  /** Extra classes for the TOP lip wrapper, merged over the default band styling.
   *  Use this to give the top region its own surface (e.g. a tinted notice) without
   *  affecting the bottom. The eventual `kai-prompt-dock` element will expose the
   *  same region via `::part(top)`. */
  topClass?: string;
  /** Extra classes for the BOTTOM lip wrapper, merged over the default band styling.
   *  The eventual `kai-prompt-dock` element will expose this region via
   *  `::part(bottom)`. */
  bottomClass?: string;
  /** How the tray frames the input — the SPATIAL inset only. Defaults to `'inset'`
   *  (the classic recessed look), so existing consumers are unaffected.
   *  See {@link PromptDockFrame}. */
  frame?: PromptDockFrame;
  /** How the tray surface looks — the VISUAL axis (background / border / radius),
   *  orthogonal to `frame`. Defaults to `'soft'` (the classic look), so existing
   *  consumers are unaffected. See {@link PromptDockAppearance}. */
  appearance?: PromptDockAppearance;
  /** The prompt input - the raised card that floats on the tray. */
  children: JSX.Element;
  /** Extra classes for the outer tray. */
  class?: string;
}

/** Shared base styling for a lip region; per-region classes append/override it. */
const LIP_BASE = 'px-3 py-2 text-sm leading-snug text-muted-foreground';

/**
 * PromptDock - a recessed tray that frames a prompt input and can extend with
 * optional "lip" regions above and/or below it.
 *
 * The model: the input stays the prominent, fully-rounded RAISED card; the lips
 * sit in a slightly darker, RECESSED band tucked above and/or below it, sharing
 * the tray's outer rounding so the whole thing reads as one cohesive control.
 * When nothing is slotted top or bottom, only the input shows: no visible lip.
 *
 * Styling splits into two ORTHOGONAL axes so the spatial framing and the surface
 * can be set independently (like a button's size vs. its variant):
 *
 * `frame` - the SPATIAL inset (padding only):
 *   - `inset` (default) - a small, uniform inset frames the input on EVERY side
 *     (the tray padding plus the flex gap give a ~6px frame). The classic look.
 *   - `edge` - top/bottom inset only; the input is FLUSH on the left / right so the
 *     lips span the full width. Matches the Claude Code / Codex references, where the
 *     lip is a top/bottom phenomenon.
 *   - `none` - no inset at all; the lips attach directly to the input as a plain
 *     vertical stack. The lips keep their own internal padding so content still has
 *     breathing room.
 *
 * `appearance` - the SURFACE (background / border / radius):
 *   - `soft` (default) - sunken surface + border + radius (the classic look).
 *   - `outlined` - transparent surface + border + radius.
 *   - `filled` - sunken surface, no border, + radius.
 *   - `plain` - transparent surface, no border, no radius (truly bare).
 *
 * The two are independent: e.g. `frame="none" appearance="plain"` is a bare stack,
 * while `frame="inset" appearance="outlined"` keeps the inset but drops the fill.
 *
 * Surface, border, radius and inset come from four CSS custom-property TOKENS, so
 * a consumer can fine-tune the chrome without touching internals (override the var
 * from outside; the variant chooses the structure). Each is referenced with a
 * fallback so it resolves stand-alone:
 *   - `--kai-prompt-dock-surface` - tray background (default `var(--color-surface-sunken)`)
 *   - `--kai-prompt-dock-border`  - tray border color (default `var(--color-border)`)
 *   - `--kai-prompt-dock-radius`  - outer radius (default `1.25rem`)
 *   - `--kai-prompt-dock-inset`   - frame thickness around the input (default `0.375rem`)
 *
 * Colors default to the surface tokens (surface-sunken for the tray and lips; the
 * input brings its own raised bg-surface), so it reads correctly in both light and
 * dark themes without hardcoded colors. The top and bottom lips are independently
 * styleable via `topClass` / `bottomClass` (e.g. a tinted notice up top over a
 * neutral control row below).
 *
 * The eventual `kai-prompt-dock` element will expose the same three regions via
 * `::part(tray)` / `::part(top)` / `::part(bottom)`; the primitive's equivalent
 * hooks are the `class` / `topClass` / `bottomClass` props.
 */
export function PromptDock(props: PromptDockProps) {
  const frame = (): PromptDockFrame => props.frame ?? 'inset';
  const appearance = (): PromptDockAppearance => props.appearance ?? 'soft';
  // `appearance` drives the surface (background / border / radius); `frame` drives the
  // inset (padding). The two axes are independent.
  const filled = () => appearance() === 'soft' || appearance() === 'filled';
  const bordered = () => appearance() === 'soft' || appearance() === 'outlined';
  return (
    <div
      data-prompt-dock
      part="tray"
      // Surface / border / radius / inset live in the tokenized inline style so the
      // var fallbacks resolve and external overrides win; only the structural
      // flex + gap stay in classes.
      class={cn('flex flex-col gap-1.5', props.class)}
      style={{
        background: filled()
          ? 'var(--kai-prompt-dock-surface, var(--color-surface-sunken))'
          : 'transparent',
        border: bordered()
          ? '1px solid var(--kai-prompt-dock-border, var(--color-border))'
          : '0',
        'border-radius':
          appearance() === 'plain' ? '0' : 'var(--kai-prompt-dock-radius, 1.25rem)',
        padding:
          frame() === 'none'
            ? '0'
            : frame() === 'edge'
              ? 'var(--kai-prompt-dock-inset, 0.375rem) 0'
              : 'var(--kai-prompt-dock-inset, 0.375rem)',
      }}
    >
      <Show when={props.top}>
        <div part="top" class={cn(LIP_BASE, props.topClass)}>{props.top}</div>
      </Show>
      {props.children}
      <Show when={props.bottom}>
        <div part="bottom" class={cn(LIP_BASE, props.bottomClass)}>{props.bottom}</div>
      </Show>
    </div>
  );
}
