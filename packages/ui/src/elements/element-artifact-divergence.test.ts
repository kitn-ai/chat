/**
 * The two generated element artifacts disagree, and NOTHING asserted that until
 * this file. That is the actual defect — not the disagreement, which turns out
 * to be deliberate and documented, but the fact that no gate had an opinion
 * about it either way.
 *
 * WHAT DIVERGES, AND WHY
 * ----------------------
 * `element-meta.json` has 80 entries; `element-manifest.json` has 79 tags. The
 * difference is `kai-remote`, and the two generators simply answer two different
 * questions:
 *
 *   gen-element-api.mjs       scans the src/elements DIRECTORY LISTING, so it
 *                             describes every element that EXISTS.
 *   gen-elements-manifest.mjs reads the import list in register-impl.ts, so it
 *                             describes every element the register-all bundle
 *                             REGISTERS.
 *
 * `<kai-remote>` mounts a sandboxed cross-origin iframe card and is opt-in by
 * design, reachable through `@kitn.ai/ui/elements/remote` or the React `Remote`
 * wrapper and deliberately absent from register-impl.ts. `vite.config.elements.ts`
 * says exactly that at the site, and builds its per-element module explicitly so
 * the subpath still resolves.
 *
 * So the two counts SHOULD differ, by exactly this one tag. The devtools spec
 * reads the same divergence as a data defect — "a one-line data fix", "the
 * interesting question is why verify:generated did not catch it" — and that
 * diagnosis is wrong in a way worth pinning: adding `kai-remote` to the manifest
 * would hand an opt-in cross-origin iframe element to the autoloader's
 * lazy-load set. That is a behaviour change wearing the costume of a data fix.
 *
 * WHAT THIS TEST IS FOR
 * ---------------------
 * Not to assert the counts are equal — they must not be. To pin the divergence
 * at exactly this one KNOWN tag, so that:
 *   - a NEW element that exists but never registers fails here, loudly, instead
 *     of being absorbed into a difference someone already decided was fine;
 *   - `kai-remote` being wired into register-impl also fails here, because the
 *     exception would then be stale;
 *   - the element registry snapshot's universe (the manifest) has something
 *     standing behind its choice.
 */
import { describe, it, expect } from 'vitest';
import { isElementDiagnosticEvent } from '../wire/diagnostics';
import type { ElementDiagnosticEvent } from './diagnostic-events';
import manifest from './element-manifest.json';
import meta from './element-meta.json';
import nonScalar from './element-nonscalar.json';

/** The one element that exists but is deliberately not in the register-all
 *  bundle. Written here ONCE, as an exception with a reason, rather than as a
 *  difference nobody has to look at. */
const OPT_IN_ONLY = ['kai-remote'];

const manifestTags = Object.keys((manifest as { tags: Record<string, string> }).tags).sort();
const metaTags = (meta as Array<{ tag: string }>).map((e) => e.tag).sort();

describe('element-meta.json vs element-manifest.json', () => {
  it('diverges by exactly the known opt-in-only elements, in one direction', () => {
    const inMetaOnly = metaTags.filter((t) => !manifestTags.includes(t));
    const inManifestOnly = manifestTags.filter((t) => !metaTags.includes(t));

    expect(inMetaOnly).toEqual(OPT_IN_ONLY);
    // The other direction must be empty forever: a tag the register-all bundle
    // registers but that no source file describes would mean the API generator
    // silently skipped an element, and every generated artifact downstream of it
    // — the .d.ts, the React wrappers, custom-elements.json, llms-full.txt —
    // would be missing it too.
    expect(inManifestOnly).toEqual([]);
  });

  it('keeps the counts in the documented relationship', () => {
    // Derived from the two artifacts, never restated: a hardcoded 79 and 80
    // would be exactly the kind of hand-typed count this repo keeps paying for.
    expect(metaTags.length).toBe(manifestTags.length + OPT_IN_ONLY.length);
  });

  it('lists no duplicate tags in either artifact', () => {
    expect(new Set(metaTags).size).toBe(metaTags.length);
    expect(new Set(manifestTags).size).toBe(manifestTags.length);
  });
});

describe('element-nonscalar.json — the ~2 KB of element-meta.json that ships', () => {
  const map = nonScalar as Record<string, string[]>;

  it('matches what element-meta.json says, prop for prop', () => {
    // The runtime map is DERIVED, so the only failure it can have is being
    // stale — and a stale entry is a contract check that quietly stopped
    // watching a prop, which is invisible by nature. `verify:generated-sync`
    // covers this too, but needs the generators to run; this needs nothing.
    const expected: Record<string, string[]> = {};
    for (const el of meta as Array<{ tag: string; props: Array<{ name: string; scalar: boolean }> }>) {
      const names = el.props.filter((p) => !p.scalar).map((p) => p.name).sort();
      if (names.length) expected[el.tag] = names;
    }
    expect(map).toEqual(expected);
  });

  it('omits elements with no non-scalar prop rather than giving them empty arrays', () => {
    // "Absent" is the runtime fast path — an element with no entry installs no
    // wrapper at all — so an empty array here would be bytes spent to say
    // nothing AND would defeat that path.
    for (const [tag, props] of Object.entries(map)) {
      expect(props.length, `${tag} has an empty entry`).toBeGreaterThan(0);
    }
    expect(Object.keys(map).length).toBeLessThan(metaTags.length);
  });

  it('names only tags that really exist', () => {
    for (const tag of Object.keys(map)) expect(metaTags).toContain(tag);
  });

  it('every element event type starts with `element.`, which is what the guard tests', () => {
    // `isElementDiagnosticEvent` in wire/diagnostics.ts narrows the shared
    // stream by that prefix, and it is the ONE place the prefix is restated.
    // Everything downstream — every test that reads `streamId` or `traceId` off
    // "every event", and any panel that switches on the two families — depends
    // on the union's members really carrying it. A new element event type named
    // without the prefix would make the guard silently classify it as a WIRE
    // event, which is the quiet wrong answer this pins.
    //
    // Exhaustive by construction: the array is typed as the union's `type`
    // field, so adding a member to `ElementDiagnosticEvent` without adding it
    // here is a compile error, not a silent gap.
    const ALL_ELEMENT_TYPES: Array<ElementDiagnosticEvent['type']> = [
      'element.violation',
      'element.registry',
    ];
    for (const type of ALL_ELEMENT_TYPES) {
      expect(type.startsWith('element.')).toBe(true);
      expect(isElementDiagnosticEvent({ type, t: 0 } as ElementDiagnosticEvent)).toBe(true);
    }
    // And the complement really is the complement — otherwise "not an element
    // event" would not mean "a wire event". All THREE non-element prefixes,
    // because that is the point of testing the closed set: the other side does
    // not share one prefix and keeps gaining families.
    expect(isElementDiagnosticEvent({ type: 'wire.open', t: 0 } as never)).toBe(false);
    expect(isElementDiagnosticEvent({ type: 'encode.request', t: 0 } as never)).toBe(false);
    expect(isElementDiagnosticEvent({ type: 'app.request', t: 0 } as never)).toBe(false);
  });

  it('covers the props the kai- contract is actually about', () => {
    // Not a restatement of the generator: these are the props root CLAUDE.md
    // names by hand as the ones consumers get wrong. If a refactor made any of
    // them read as scalar, the check would stop watching the exact prop it
    // exists for and every other assertion here would still pass.
    expect(map['kai-chat']).toContain('messages');
    expect(map['kai-chat']).toContain('suggestions');
    expect(map['kai-chat']).toContain('models');
    expect(map['kai-conversations']).toContain('conversations');
    expect(map['kai-cards']).toContain('cards');
  });
});
