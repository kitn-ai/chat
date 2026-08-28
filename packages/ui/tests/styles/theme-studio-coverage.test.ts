import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_TOKENS,
  EXTRA_TOKENS,
  GROUPS,
  TEXT_RUNGS,
  declaredKitTokens,
  parseKitDefaults,
  remValue,
  studioTokens,
} from '../../../../apps/docs/src/components/theme-tokens';

/**
 * The docs site's theme editor (apps/docs/src/components/ThemeStudio.tsx) exposes
 * a hand-curated list of `--kai-*` knobs. theme.css is where the kit declares
 * them. The two drifted: sixteen color tokens (surfaces, the status family,
 * hover/selected/unread) and one type rung (`--kai-text-compact`) were added to
 * the kit with no knob, no export line and no import support in the editor, and
 * nothing said so.
 *
 * This test reads the token names out of theme.css -- anchored on `var(`, the
 * same derivation the MCP theme tool uses -- and asserts the editor's catalog
 * covers every one, so the next token the kit grows fails CI here instead of
 * silently missing from the editor. The reverse direction is pinned too: a
 * `--kai-color-*` / `--kai-text-*` knob the editor offers that theme.css does
 * not declare would be a control that themes nothing.
 *
 * Defaults are not compared, because the editor no longer carries any: it parses
 * them out of the same file at build time (`parseKitDefaults`), which this test
 * also exercises against the real theme.css.
 */
const THEME_CSS = readFileSync(join(__dirname, '..', '..', 'theme.css'), 'utf8');

describe('theme editor covers every --kai-* token theme.css declares', () => {
  const declared = declaredKitTokens(THEME_CSS);
  const exposed = studioTokens();

  it('theme.css declares a non-trivial token set (the derivation is not vacuous)', () => {
    expect(declared.size).toBeGreaterThan(20);
    expect(declared.has('--kai-color-primary')).toBe(true);
    expect(declared.has('--kai-radius')).toBe(true);
  });

  it('every token theme.css declares has a knob in the editor', () => {
    const missing = [...declared].filter((t) => !exposed.has(t)).sort();
    expect(missing, `declared in packages/ui/theme.css but absent from the theme editor's catalog (apps/docs/src/components/theme-tokens.ts): ${missing.join(', ')}`).toEqual([]);
  });

  it('every color / type-scale knob in the editor is a token theme.css declares', () => {
    const dead = [...exposed]
      .filter((t) => t.startsWith('--kai-color-') || t.startsWith('--kai-text-'))
      .filter((t) => !declared.has(t))
      .sort();
    expect(dead, `editor knobs that theme.css does not declare (they would theme nothing): ${dead.join(', ')}`).toEqual([]);
  });

  it('the catalog has no duplicate tokens across groups', () => {
    const all = [...ALL_TOKENS.map((t) => t.token), ...TEXT_RUNGS.map((r) => r.token), ...EXTRA_TOKENS];
    expect(new Set(all).size).toBe(all.length);
    expect(GROUPS.every((g) => g.tokens.length > 0)).toBe(true);
  });
});

describe('parseKitDefaults reads theme.css rather than restating it', () => {
  const defaults = parseKitDefaults(THEME_CSS);

  it('yields a light and a dark default for every declared token', () => {
    for (const name of declaredKitTokens(THEME_CSS)) {
      const d = defaults.get(name);
      expect(d, name).toBeDefined();
      expect(d!.light.length, `${name} light`).toBeGreaterThan(0);
      expect(d!.dark.length, `${name} dark`).toBeGreaterThan(0);
    }
  });

  it('keeps the light and dark scopes apart', () => {
    // These differ between the @theme block and the .dark block in theme.css.
    const bg = defaults.get('--kai-color-background')!;
    expect(bg.light).not.toBe(bg.dark);
    expect(bg.light).toMatch(/^hsl\(/);
    expect(bg.dark).toMatch(/^hsl\(/);
    // Declared once, outside any mode block: same value both ways.
    const shadow = defaults.get('--kai-shadow-color')!;
    expect(shadow.light).toBe(shadow.dark);
  });

  it('reads a nested color-mix default and a comma-carrying font stack whole', () => {
    const surface = defaults.get('--kai-color-surface')!;
    expect(surface.light).toMatch(/^color-mix\(.*\)$/);
    expect((surface.light.match(/\(/g) ?? []).length).toBe((surface.light.match(/\)/g) ?? []).length);
    const code = defaults.get('--kai-font-code')!;
    expect(code.light).toContain(',');
    expect(code.light).toMatch(/monospace$/);
  });

  it('every type rung and the radius parse as rem', () => {
    for (const r of TEXT_RUNGS) expect(remValue(defaults.get(r.token)!.light)).toBeGreaterThan(0);
    expect(remValue(defaults.get('--kai-radius')!.light)).toBeGreaterThan(0);
  });

  it('throws on a token declared with no fallback', () => {
    expect(() => parseKitDefaults('--color-x: var(--kai-color-x);')).toThrow(/--kai-color-x/);
  });
});
