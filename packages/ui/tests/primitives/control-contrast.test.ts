// WCAG 2.1 SC 1.4.11 Non-text Contrast floor for FORM-CONTROL boundaries.
//
// An unchecked radio/checkbox ring and a text input's edge are the control's
// only visual boundary, so they must clear 3:1 against the surface behind them.
// This regressed once already: `--color-input` shipped at the same value as the
// decorative `--color-border` (hsl(240 5.9% 90%) light), which measures 1.27:1
// on white — the control was effectively invisible. A pure read of theme.css,
// so it needs no DOM and no build.
//
// Scope note: `--color-border` is deliberately NOT held to this floor. Dividers
// and card outlines are decorative and 1.4.11 does not apply to them. Disabled
// controls are likewise exempt (and are dimmed via opacity, not this token).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const themeCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../theme.css'),
  'utf8',
);

/** The `.dark { … }` block, and everything before it (the light `@theme`). */
const darkStart = themeCss.indexOf('\n.dark {');
expect(darkStart).toBeGreaterThan(0);
const BLOCKS = {
  light: themeCss.slice(0, darkStart),
  dark: themeCss.slice(darkStart),
} as const;

/** Read a token's DEFAULT — the fallback inside `var(--kai-…, <default>)`. */
function tokenDefault(block: string, name: string): string {
  const m = new RegExp(`--${name}:\\s*var\\(--kai-${name},\\s*([^)]*\\)?[^;]*)\\);`).exec(block);
  if (!m) throw new Error(`--${name} not found (or not in var(--kai-…, default) form)`);
  return m[1].trim();
}

function toRgb(css: string): [number, number, number] {
  const hexMatch = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (hexMatch) {
    const n = parseInt(hexMatch[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(css);
  if (!m) throw new Error(`not a plain hsl()/#rrggbb color: ${css}`);
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [ch(h + 1 / 3) * 255, ch(h) * 255, ch(h - 1 / 3) * 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(toRgb(a)), luminance(toRgb(b))];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** The surfaces a control can sit on. A control's edge must clear 3:1 on each. */
const SURFACES = ['color-background', 'color-card', 'color-muted'] as const;

describe('form-control boundary contrast (WCAG 2.1 SC 1.4.11)', () => {
  for (const theme of ['light', 'dark'] as const) {
    const block = BLOCKS[theme];

    for (const surface of SURFACES) {
      it(`[${theme}] --color-input clears 3:1 against --${surface}`, () => {
        const ratio = contrast(tokenDefault(block, 'color-input'), tokenDefault(block, surface));
        expect(ratio, `${theme} --color-input vs --${surface} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      });
    }

    it(`[${theme}] the checked/selected ring stays distinguishable from unchecked`, () => {
      // Checked radios and checkboxes swap the ring to --color-primary. If that
      // ever converged on --color-input the fix for "unchecked is invisible"
      // would have been "make unchecked look checked", which is not a fix.
      const unchecked = tokenDefault(block, 'color-input');
      const checked = tokenDefault(block, 'color-primary');
      expect(contrast(unchecked, checked)).toBeGreaterThanOrEqual(3);
    });

    it(`[${theme}] the tick / mixed bar clears 3:1 against the filled box`, () => {
      // Both a checked box's tick and a mixed box's bar are a masked ::after in
      // --color-primary-foreground on a --color-primary fill. They are the state
      // indicator of a control, so 1.4.11 applies to them and not 1.4.3 — 3:1.
      // One assertion covers both marks because they share the token pair by
      // construction (see the :indeterminate comment in src/elements/styles.css);
      // that the marks are actually DIFFERENT shapes is pinned separately in
      // tests/ui/checkbox-indeterminate-paint.test.ts.
      const mark = tokenDefault(block, 'color-primary-foreground');
      const fill = tokenDefault(block, 'color-primary');
      const ratio = contrast(mark, fill);
      expect(
        ratio,
        `${theme} --color-primary-foreground vs --color-primary = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    });
  }

  it('fires on the pre-fix values (this check cannot pass vacuously)', () => {
    // The exact values that shipped the defect, on the surfaces they failed on.
    expect(contrast('hsl(240 5.9% 90%)', 'hsl(0 0% 100%)')).toBeLessThan(3); // light: 1.27:1
    expect(contrast('hsl(45 4% 17%)', 'hsl(50 2% 9%)')).toBeLessThan(3); // dark: ~1.29:1
  });
});

// ---------------------------------------------------------------------------
// The Switch track. Same SC (1.4.11), but it needed its own assertions because
// the switch does NOT share the boundary token the other controls do: its track
// was a filled `bg-muted` with no edge at all, which measures 1.10:1 on
// `--color-background` in light mode. The fix could not be "darken --color-muted"
// (a surface token the whole kit paints with), so the boundary moved onto a
// border in `--color-input` — the token the radios/checkboxes/inputs already use
// and that the block above already holds to 3:1. These read the component, not
// just the theme, because which token the track carries is a fact about
// src/ui/switch.tsx.
const switchSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/ui/switch.tsx'),
  'utf8',
);
/** The `isOn() ? … : …` track-class ternary, read from the component. */
const trackStates = (() => {
  const m = /isOn\(\)\s*\?\s*'([^']*bg-primary[^']*)'\s*:\s*'([^']*bg-muted[^']*)'/.exec(switchSrc);
  if (!m) throw new Error('could not find the Switch track on/off class ternary');
  return { on: m[1], off: m[2] };
})();

describe('switch track boundary contrast (WCAG 2.1 SC 1.4.11)', () => {
  it('the track declares a border, so it HAS a boundary to measure', () => {
    // `border` on the base classes + a colour per state. Without the width the
    // colour below paints nothing and every ratio here would be measuring a
    // token the user never sees.
    expect(switchSrc).toMatch(/rounded-full border transition-colors/);
  });

  it('the OFF track carries the control-edge token, not a bare fill', () => {
    expect(trackStates.off).toContain('border-input');
  });

  it('the ON track keeps its own fill as the boundary (border stays out of the way)', () => {
    // A transparent border still has the primary fill painted under it, so the ON
    // state's boundary is the ~17:1 fill itself and the two states stay one size.
    expect(trackStates.on).toContain('border-transparent');
    expect(trackStates.on).toContain('bg-primary');
  });

  for (const theme of ['light', 'dark'] as const) {
    const block = BLOCKS[theme];

    for (const surface of SURFACES) {
      it(`[${theme}] the OFF track edge clears 3:1 against --${surface}`, () => {
        const ratio = contrast(tokenDefault(block, 'color-input'), tokenDefault(block, surface));
        expect(ratio, `${theme} switch OFF edge vs --${surface} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      });

      it(`[${theme}] the ON track clears 3:1 against --${surface}`, () => {
        const ratio = contrast(tokenDefault(block, 'color-primary'), tokenDefault(block, surface));
        expect(ratio, `${theme} switch ON track vs --${surface} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      });
    }

    it(`[${theme}] the OFF fill on its own does NOT clear 3:1 (why the border exists)`, () => {
      // If --color-muted ever became dark enough to pass here on its own, the
      // border would be redundant AND every muted surface in the kit would have
      // moved. Either way someone should come back and read this comment.
      const ratio = contrast(tokenDefault(block, 'color-muted'), tokenDefault(block, 'color-background'));
      expect(ratio, `${theme} --color-muted vs --color-background = ${ratio.toFixed(2)}:1`).toBeLessThan(3);
    });

    it(`[${theme}] OFF stays clearly distinguishable from ON`, () => {
      // The failure mode this rules out: "fix" the invisible OFF state by making
      // it look like the ON state. The two track FILLS must stay far apart.
      const ratio = contrast(tokenDefault(block, 'color-muted'), tokenDefault(block, 'color-primary'));
      expect(ratio, `${theme} OFF fill vs ON fill = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    });
  }
});

// ---------------------------------------------------------------------------
// Composer entity pills. TEXT, so the bar is SC 1.4.3 Contrast (Minimum) at
// 4.5:1 — small text, no large-text exemption.
//
// The defect these pin: the per-kind hues switched on `@media (prefers-color-
// scheme: dark)` while the surface under them came from the kit's own resolved
// theme (`theme="light"` / the `.dark` wrapper). Those are different questions,
// and `theme="light"` on a dark-OS machine is an ordinary setup — it painted the
// DARK hue on the LIGHT field at 2.33:1. Matched light/dark pairs both measured
// fine, which is exactly why it survived review.
const composerSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../src/components/composer.tsx'),
  'utf8',
);
/** The `.kai-composer-pill` <style> block, read from the component itself. */
const pillCss = (() => {
  const at = composerSrc.indexOf('.kai-composer-pill {');
  expect(at).toBeGreaterThan(0);
  return composerSrc.slice(at, composerSrc.indexOf('</style>', at));
})();

/** A `--kai-pill-<kind>` fallback hue, from the rule at the given scope. */
function pillHue(kind: 'skill' | 'agent', scope: 'light' | 'dark'): string {
  const prefix = scope === 'dark' ? '\\.dark ' : '';
  const re = new RegExp(
    `(^|\\n)\\s*${prefix}\\.kai-composer-pill\\[data-kind="${kind}"\\] \\{ color: var\\(--kai-pill-${kind}, (#[0-9a-f]{6})\\); \\}`,
  );
  const m = re.exec(pillCss);
  if (!m) throw new Error(`no ${scope} colour rule for pill kind "${kind}"`);
  return m[2];
}

describe('composer entity pills (WCAG 2.1 SC 1.4.3)', () => {
  it('per-kind hues are keyed on the resolved theme, never prefers-color-scheme', () => {
    // The OS preference cannot be the switch: the surface behind the pill is
    // chosen by the theme attribute, so the two can disagree.
    expect(pillCss).not.toContain('@media (prefers-color-scheme'); // the rule, not the comment explaining it
    expect(pillCss).toContain('.dark .kai-composer-pill[data-kind="skill"]');
    expect(pillCss).toContain('.dark .kai-composer-pill[data-kind="agent"]');
  });

  for (const [scope, surfaces] of [
    ['light', ['color-background', 'color-card', 'color-muted']],
    ['dark', ['color-background', 'color-card', 'color-muted']],
  ] as const) {
    for (const kind of ['skill', 'agent'] as const) {
      for (const surface of surfaces) {
        it(`[${scope}] ${kind} pill text clears 4.5:1 on --${surface}`, () => {
          const r = contrast(pillHue(kind, scope), tokenDefault(BLOCKS[scope], surface));
          expect(r, `${scope} ${kind} vs --${surface} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }

  it('fires on the pre-fix mismatch (this check cannot pass vacuously)', () => {
    // The dark hue on the light field — what an OS-dark, theme-light user saw.
    expect(contrast('#6ea8fe', 'hsl(0 0% 100%)')).toBeLessThan(4.5);
    expect(contrast('#c4a7fc', 'hsl(0 0% 100%)')).toBeLessThan(4.5);
  });
});
