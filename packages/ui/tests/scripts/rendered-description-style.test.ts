/**
 * GUARD — house style over the descriptions the generators RENDER.
 *
 * `element-meta.json` is the single model every documentation artifact is built
 * from: `llms-full.txt`, `docs/web-components.md`, `src/elements/element-types.d.ts`
 * (so a consumer's editor tooltip) and the `kai` MCP's `component_reference`. A
 * sentence written in a facade is therefore read by consumers and by coding agents
 * in four places at once, and a style slip propagates to all four on the next build.
 *
 * TWO RULES ARE ENFORCED HERE
 * ---------------------------
 * 1. NO EM DASHES. `apps/docs/STYLE.md` lists the "em-dash flourish" among the
 *    tells that make copy read as AI-generated. 122 rendered descriptions carried
 *    one; they were rewritten (a full stop, a comma, or a colon, whichever the
 *    sentence actually wanted) rather than having the punctuation deleted.
 *
 * 2. DELIBERATELY MIRRORED DESCRIPTIONS STAY IDENTICAL. A handful of members are
 *    declared on several elements and documented with the SAME words on purpose,
 *    so `<kai-chat>` and `<kai-message>` cannot drift into describing one concept
 *    two ways. That identity is invisible in a diff: a sweep that rewrites three
 *    of four copies leaves the fourth silently out of step, and each file looks
 *    fine on its own. See MIRRORED below.
 *
 * WHY THIS IS NOT A CHECK THAT PROVES NOTHING
 * -------------------------------------------
 * Nothing here restates a number that could drift into agreement with a broken
 * model. The description set is read off `element-meta.json`, the offender list is
 * derived, and the mirrored GROUPS are derived too (membership is "every element
 * the model says declares this member", never a hand-listed tag list). The floors
 * exist for the opposite reason: every assertion below loops over the model, so a
 * model that collapsed to two elements would make the whole file pass while
 * covering nothing. The floors are what stop that.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

interface Member {
  name: string;
  description?: string;
  doc?: string;
}
interface ElementMeta {
  tag: string;
  props?: Member[];
  events?: Member[];
  methods?: Member[];
  slots?: Member[];
  parts?: Member[];
}

const meta: ElementMeta[] = JSON.parse(
  readFileSync(resolve(pkgRoot, 'src/elements/element-meta.json'), 'utf8'),
);

/**
 * Every string the generators render as a description, with where it came from.
 * `props`/`events`/`methods` carry `description`; `slots`/`parts` carry `doc`.
 * Both are read, so a slot doc is held to the same bar as a prop doc.
 */
const RENDERED: { tag: string; kind: string; name: string; text: string }[] = [];
for (const el of meta) {
  for (const kind of ['props', 'events', 'methods', 'slots', 'parts'] as const) {
    for (const item of el[kind] ?? []) {
      const text = item.description ?? item.doc;
      if (typeof text === 'string' && text.length > 0) {
        RENDERED.push({ tag: el.tag, kind, name: item.name || '(default)', text });
      }
    }
  }
}

describe('the description model is big enough for the loops below to mean anything', () => {
  it('covers most of the element set, across every documented member kind', () => {
    expect(meta.length).toBeGreaterThan(50);
    expect(RENDERED.length).toBeGreaterThan(700);
    // A rule applied to props alone would miss the 15 slot/part docs that also
    // carried an em dash, so assert every kind is actually represented.
    for (const kind of ['props', 'events', 'methods', 'slots', 'parts']) {
      expect(RENDERED.filter((r) => r.kind === kind).length, `${kind} descriptions`).toBeGreaterThan(3);
    }
  });
});

describe('no rendered description uses an em dash (apps/docs/STYLE.md)', () => {
  it('is zero, and names every offender', () => {
    const offenders = RENDERED.filter((r) => r.text.includes('—')).map(
      (r) => `${r.tag}.${r.kind}.${r.name}: ${r.text.slice(Math.max(0, r.text.indexOf('—') - 40), r.text.indexOf('—') + 40)}`,
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * Members documented with the SAME sentence on every element that declares them.
 *
 * Only the member NAMES are listed: which elements are in each group, and what the
 * shared text is, both come from the model. `theme` is injected into all 80
 * elements by `define.tsx`; `show`/`hide`/`defaultOpen` are the shared disclosure
 * vocabulary; `cardTypes`/`cardSchemas` are the card-rendering pair that
 * `<kai-chat>`, `<kai-message>`, `<kai-thread>` and `<kai-workspace>` all take.
 *
 * A name only belongs here when the members really are one concept. Most repeated
 * names are NOT: `value`, `disabled` and `select` mean different things per
 * element, and 101 such groups diverge on purpose.
 */
const MIRRORED: { kind: 'props' | 'events' | 'methods'; name: string; minElements: number }[] = [
  { kind: 'props', name: 'theme', minElements: 50 },
  { kind: 'props', name: 'defaultOpen', minElements: 8 },
  { kind: 'props', name: 'cardTypes', minElements: 4 },
  { kind: 'props', name: 'cardSchemas', minElements: 4 },
  { kind: 'methods', name: 'show', minElements: 8 },
  { kind: 'methods', name: 'hide', minElements: 8 },
  { kind: 'events', name: 'kai-new-chat', minElements: 2 },
  { kind: 'events', name: 'kai-voice-error', minElements: 2 },
];

describe('deliberately mirrored descriptions stay word-for-word identical', () => {
  for (const { kind, name, minElements } of MIRRORED) {
    it(`${kind}.${name} reads the same on every element that declares it`, () => {
      const found = meta
        .map((el) => ({ tag: el.tag, item: (el[kind] ?? []).find((m) => m.name === name) }))
        .filter((x): x is { tag: string; item: Member } => x.item !== undefined)
        .map((x) => ({ tag: x.tag, text: x.item.description ?? x.item.doc ?? '' }));

      // The group must still exist at the size the design implies, so deleting
      // the members cannot turn this into a vacuous pass.
      expect(found.length, `${kind}.${name} should be declared on several elements`).toBeGreaterThanOrEqual(minElements);

      const variants = [...new Set(found.map((f) => f.text))];
      if (variants.length > 1) {
        // Report WHICH copies drifted, since that is the whole failure mode.
        const byVariant = variants.map((v) => `\n  [${found.filter((f) => f.text === v).map((f) => f.tag).join(', ')}]\n    ${v.slice(0, 160)}`);
        throw new Error(`${kind}.${name} has ${variants.length} different descriptions:${byVariant.join('')}`);
      }
      expect(variants[0].length).toBeGreaterThan(20);
    });
  }
});
