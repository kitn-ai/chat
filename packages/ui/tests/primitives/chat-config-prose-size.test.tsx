// @vitest-environment node
// Pure mappings + a read of theme.css — no DOM, and jsdom's import.meta.url is
// an http: URL that fileURLToPath rejects.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  proseClass,
  textClass,
  type ProseSize,
} from '../../src/primitives/chat-config';

const SIZES: ProseSize[] = ['xs', 'sm', 'base', 'lg'];

const THEME_CSS = join(dirname(fileURLToPath(import.meta.url)), '../../theme.css');
const themeCss = readFileSync(THEME_CSS, 'utf8');

/** The public `proseSize` strings are in the kai-chat attribute contract and are
 *  documented in the theming guide. Re-pointing what they MAP TO must never
 *  change what a consumer types. */
test('the public proseSize strings are unchanged', () => {
  const t: Record<ProseSize, true> = { xs: true, sm: true, base: true, lg: true };
  expect(Object.keys(t).sort()).toEqual(['base', 'lg', 'sm', 'xs']);
});

test('textClass maps onto the semantic type scale, not Tailwind raw sizes', () => {
  expect(textClass('xs')).toBe('text-meta');
  expect(textClass('sm')).toBe('text-body');
  expect(textClass('base')).toBe('text-title');
  expect(textClass('lg')).toBe('text-lg');
});

test('every size textClass emits is themable through a --kai-text-* token', () => {
  for (const size of SIZES) {
    const cls = textClass(size);
    const name = cls.replace(/^text-/, '');
    // theme.css declares `--text-<name>: var(--kai-text-<name>, …)`. If the
    // utility is not token-backed, `proseSize` is not themable at that rung.
    const decl = new RegExp(
      `--text-${name}:\\s*var\\(--kai-text-[a-z-]+`,
    );
    expect(themeCss, `${cls} (proseSize="${size}") is not token-backed`).toMatch(decl);
  }
});

/** prose-* are Tailwind Typography size MODIFIERS (proportional margins, list
 *  indents, heading ratios) — not font sizes, and there is no --kai-text-* rung
 *  to alias them to. They stay put. Only the raw font-size in the 'xs' case
 *  joins the semantic scale, in step with textClass('xs'). */
test('proseClass keeps the typography modifiers and only re-points its raw size', () => {
  expect(proseClass('xs')).toBe('prose-sm text-meta');
  expect(proseClass('sm')).toBe('prose-sm');
  expect(proseClass('base')).toBe('');
  expect(proseClass('lg')).toBe('prose-lg');
  expect(proseClass('xs').split(' ').filter((c) => c.startsWith('text-'))).toEqual([
    textClass('xs'),
  ]);
});

test('no proseSize rung leaks a raw Tailwind font-size', () => {
  const RAW = new Set(['text-xs', 'text-sm', 'text-base']);
  for (const size of SIZES) {
    expect(RAW.has(textClass(size))).toBe(false);
    for (const cls of proseClass(size).split(' ')) {
      expect(RAW.has(cls), `proseClass("${size}") emits ${cls}`).toBe(false);
    }
  }
});
