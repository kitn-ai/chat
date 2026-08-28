/**
 * Shared preview-wrapper accenting for the builder's STUB, light-DOM preview
 * shells (`Labs/Builder/<Template>` stories) — root-caused live (Round A,
 * owner report), bitten twice before landing here: the old `Labs/Apps`
 * Builder story's preview never actually recolored, and the same bug then
 * reproduced in `Labs/Builder/Support widget`'s FAB.
 *
 * WHY a nested wrapper setting `--kai-color-primary` alone does nothing:
 * `theme.css` declares the kit's internal token exactly once, at
 * `:root, :host` — `--color-primary: var(--kai-color-primary, <fallback>)`
 * — inside a `@theme` block. CSS custom-property indirection resolves at
 * the element where the CONSUMING declaration lives, not at read time, so
 * `--color-primary`'s value is fixed by `--kai-color-primary`'s value AT
 * THAT `:root`/`:host` element and inherits down as an already-resolved
 * value; setting `--kai-color-primary` on some descendant div never
 * retriggers that resolution, because nothing redeclares `--color-primary`
 * there. A REAL emitted construct's host element doesn't hit this: its
 * shadow root's OWN `:host` rule (the same theme.css, scoped) resolves
 * `--color-primary` fresh at the host, using the host's own
 * `--kai-color-primary` (codegen.ts sets it via
 * `ctx.element.style.setProperty('--kai-color-primary', ...)`) — because
 * `:host` IS that element. Our light-DOM story preview has no such
 * `:host` boundary re-declaring the mapping, so it has to replicate the
 * mapping by hand: set BOTH the public token (`--kai-color-primary`, for
 * parity with what a real construct authors) AND the internal one
 * (`--color-primary`, the one Tailwind utility classes and the kit's own
 * components actually read) directly on the wrapper.
 */

import type { BuilderConstruct } from './builder-panel';

// ── accent contrast, duplicated (not imported) from
// agent-tooling/construct/codegen.ts's resolveContrastForeground ──────────
// A genuine cross-bundle-boundary exception to "derive it, don't type it"
// (CLAUDE.md), recorded rather than silent: codegen.ts imports `node:fs`/
// `node:module`/`node:path` (it writes files to disk) and is Node-only,
// while this module lives under src/components/ — reachable, in principle,
// from a browser build. Importing codegen.ts here would be fine today only
// because nothing outside Storybook currently imports THIS file either, but
// that's an accident of the current export graph, not a guarantee; a
// second consumer of BuilderPanel/BuilderStart later would inherit a
// Node-only import with no browser story ever intending to ship it. The
// math below (WCAG relative luminance -> white-or-black foreground) is
// copied verbatim from codegen.ts's `parseAccentRgb`/`relativeLuminance`/
// `hslToRgb`/`resolveContrastForeground` — if that algorithm changes, this
// copy needs the same change; codegen.test.ts's "accent contrast" block is
// the source of truth for the numbers.

function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [r1, g1, b1] =
    hue < 60 ? [chroma, x, 0]
    : hue < 120 ? [x, chroma, 0]
    : hue < 180 ? [0, chroma, x]
    : hue < 240 ? [0, x, chroma]
    : hue < 300 ? [x, 0, chroma]
    : [chroma, 0, x];
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

function parseAccentRgb(accent: string): [number, number, number] | null {
  const s = accent.trim();
  const hex3 = /^#([0-9a-fA-F]{3})$/.exec(s);
  if (hex3) {
    const [r, g, b] = hex3[1].split('').map((ch) => parseInt(ch + ch, 16));
    return [r, g, b];
  }
  const hex6 = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(s);
  if (hex6) {
    const hex = hex6[1];
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const rgbFn = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(s);
  if (rgbFn) {
    const [r, g, b] = [rgbFn[1], rgbFn[2], rgbFn[3]].map(Number);
    return [r, g, b].every((v) => v >= 0 && v <= 255) ? [r, g, b] : null;
  }
  const hslFn = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*[\d.]+\s*)?\)$/.exec(s);
  if (hslFn) {
    return hslToRgb(Number(hslFn[1]), Number(hslFn[2]) / 100, Number(hslFn[3]) / 100);
  }
  return null;
}

/** Same threshold codegen.ts uses: white when the accent sits closer to
 *  white than black on the WCAG relative-luminance scale (L <= 0.5). */
function resolveContrastForeground(accent: string): '#000000' | '#ffffff' | null {
  const rgb = parseAccentRgb(accent);
  if (!rgb) return null;
  const luminance = relativeLuminance(...rgb);
  return luminance <= 0.5 ? '#ffffff' : '#000000';
}

/**
 * The inline style object a stub preview's wrapper needs so a construct's
 * `theme.accent` actually retints its descendants: both the public
 * (`--kai-color-primary`) and internal (`--color-primary`) tokens, plus
 * their paired foreground when the accent resolves to concrete RGB — see
 * the module doc comment above for why both are required. Returns `{}` for
 * no accent (the kit's own neutral default applies, same as omitting the
 * property entirely).
 */
export function resolveAccentWrapperStyle(theme: BuilderConstruct['theme']): Record<string, string> {
  const accent = theme?.accent;
  if (!accent) return {};
  const style: Record<string, string> = {
    '--kai-color-primary': accent,
    '--color-primary': accent,
  };
  const foreground = resolveContrastForeground(accent);
  if (foreground) {
    style['--kai-color-primary-foreground'] = foreground;
    style['--color-primary-foreground'] = foreground;
  }
  return style;
}
