// The mixed checkbox must PAINT, not just announce.
//
// `indeterminate` is a DOM property with no HTML attribute, so a CSS rule is the
// only thing that can make it visible. There was none: `.kai-checkbox` styled
// `:checked` and stopped, so a mixed box rendered pixel-identically to an
// unchecked one. That shipped — `<kai-tasks>` in `select` mode puts an
// indeterminate select-all above a partial selection, and it read as "none
// selected", which is a lie about state a user cannot see through.
//
// WHY THIS IS A TEXT ASSERTION AND NOT A COMPUTED-STYLE ONE. jsdom does no
// layout, does not resolve `::after`, and never applies the element stylesheet
// (`src/elements/compiled.css` is injected into a shadow root at runtime), so
// "the indeterminate box computes differently from the unchecked one" is not
// expressible here — `getComputedStyle` would return the same empty answer for
// both and the check would pass vacuously in the worst way. What IS honestly
// pinnable in jsdom is the artifact the browser will consume: the compiled
// sheet. So this pins the rule's EXISTENCE, that it differs from both the
// unchecked base and the checked tick, and its source ORDER. The computed-style
// and contrast proof is done in a real Chromium and recorded in the branch
// report; the token-level contrast floor is pinned in
// tests/primitives/control-contrast.test.ts.
//
// Reads the GENERATED sheet, so it needs `pnpm --filter @kitn.ai/ui run build:css`
// first — the same prerequisite the rest of the suite already has.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const compiledPath = join(HERE, '../../src/elements/compiled.css');
let compiled: string;
try {
  compiled = readFileSync(compiledPath, 'utf8');
} catch {
  throw new Error(
    `${compiledPath} is missing. It is generated and gitignored — run ` +
      `\`pnpm --filter @kitn.ai/ui run build:css\` (or \`nx build ui\`) first.`,
  );
}

/** Every rule body in the sheet whose selector is exactly `sel`, in source order. */
function rules(sel: string): { body: string; at: number }[] {
  const out: { body: string; at: number }[] = [];
  // The sheet is minified, so a rule is `<sel>{…}` with no nested braces in these
  // (they are flat declaration blocks, not at-rules).
  const re = new RegExp(`(^|[},;])${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`, 'g');
  for (let m = re.exec(compiled); m; m = re.exec(compiled)) out.push({ body: m[2], at: m.index });
  return out;
}

const indeterminateBox = rules('.kai-checkbox:indeterminate');
// Minified output emits the single-colon form for pseudo-elements.
const indeterminateMark = rules('.kai-checkbox:indeterminate:after');
const checkedBox = rules('.kai-checkbox:checked');
const checkedMark = rules('.kai-checkbox:checked:after');
const baseMark = rules('.kai-checkbox:after');

describe('mixed checkbox paints (the compiled element sheet)', () => {
  it('has a rule for the box itself', () => {
    expect(indeterminateBox.length).toBeGreaterThan(0);
  });

  it('fills the box instead of leaving it on the unchecked background', () => {
    // The unchecked box is `background-color: var(--color-background)` on the shared
    // base rule. Mixed must not land there, or it is the defect again.
    const filled = indeterminateBox.some((r) => /background-color:var\(--color-primary\)/.test(r.body));
    expect(filled, `no --color-primary fill in: ${indeterminateBox.map((r) => r.body).join(' | ')}`).toBe(true);
    expect(indeterminateBox.some((r) => /background-color:var\(--color-background\)/.test(r.body))).toBe(false);
  });

  it('reveals the ::after mark, which the base rule hides at scale(0)', () => {
    expect(baseMark.some((r) => /transform:scale\(0\)/.test(r.body))).toBe(true);
    expect(indeterminateMark.length).toBeGreaterThan(0);
    expect(indeterminateMark.some((r) => /transform:scale\(1\)/.test(r.body))).toBe(true);
  });

  it('draws a DIFFERENT mark from checked — mixed must not read as checked either', () => {
    // Both states fill the box, so the mask is the only thing telling them apart.
    // Same technique (a masked ::after) so they read as siblings; different mask.
    const mixedMask = indeterminateMark.map((r) => r.body).join('');
    const tickMask = baseMark.map((r) => r.body).join('');
    expect(/mask:url\(/.test(mixedMask)).toBe(true);
    expect(/mask:url\(/.test(tickMask)).toBe(true);
    // The tick path vs the bar path, read from the data: URIs themselves.
    expect(tickMask).toContain("d='M20 6 9 17l-5-5'");
    expect(mixedMask).toContain("d='M5 12h14'");
    expect(mixedMask).not.toContain("d='M20 6 9 17l-5-5'");
  });

  it('is ordered after :checked, so a box that is BOTH renders as mixed', () => {
    // `indeterminate` is independent of `checked` and the two selectors have equal
    // specificity, so source order is the whole of the precedence story. Native
    // rendering shows mixed when both are set; match it.
    // Both sides asserted present first: with no indeterminate rule at all the
    // Math.min of an empty list is Infinity and this would pass vacuously — which
    // is exactly what it did on the pre-fix sheet before these two lines.
    expect(checkedMark.length).toBeGreaterThan(0);
    expect(checkedBox.length).toBeGreaterThan(0);
    expect(indeterminateMark.length).toBeGreaterThan(0);
    expect(indeterminateBox.length).toBeGreaterThan(0);
    expect(Math.min(...indeterminateMark.map((r) => r.at))).toBeGreaterThan(
      Math.max(...checkedMark.map((r) => r.at)),
    );
    expect(Math.min(...indeterminateBox.map((r) => r.at))).toBeGreaterThan(
      Math.max(...checkedBox.map((r) => r.at)),
    );
  });

  it('does not reach radios — an empty radio group is :indeterminate too', () => {
    // Every radio in a group with nothing selected matches `:indeterminate`. An
    // unscoped rule would paint a fresh radio group as if it held a third state.
    for (const [sel] of compiled.matchAll(/([^{}]*:indeterminate[^{}]*)\{/g)) {
      expect(sel).not.toContain('.kai-radio');
    }
  });
});
