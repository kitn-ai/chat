/**
 * CAPABILITY 2 — the re-render contract, reported as a diagnostic.
 *
 * The rule, verbatim from root CLAUDE.md and pinned as BEHAVIOUR by
 * `components/reactivity-contract.test.tsx`:
 *
 *   A new array reference is what NOTIFIES  — the same array set back is a
 *                                             no-op, even with an item swapped
 *                                             inside it.
 *   A new object for the changed item is what makes the change VISIBLE — the
 *                                             lists render through
 *                                             reference-keyed <For>s, so a row
 *                                             whose item identity is unchanged
 *                                             is never re-invoked.
 *
 * That test proves the elements behave this way. This one reports it: issue
 * #224 was filed by a user who did the wrong thing, saw the right data in
 * DevTools, and had no way to find out why the screen disagreed.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM. `mutated-in-place` cannot mean "you
 * changed an item", because knowing an item changed requires comparing its
 * CONTENT, and content is payload. What it means is the structurally knowable
 * thing: a new array arrived, it is the same length, and every item in it is
 * reference-identical to the previous array's — so the signal notified and not
 * one row can re-render. Whether the consumer meant anything by that write is
 * a question only the consumer can answer.
 *
 * NOT VACUOUS: every "fires" case is paired with a "does not fire" case over
 * the same element and the same prop, so a detector wired to fire on everything
 * and a harness observing nothing both go red.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { subscribeWireDiagnostics, type KaiDiagnosticEvent } from '../wire/diagnostics';
import type { ElementViolationEvent } from './diagnostic-events';
import './conversation-list';

const TAG = 'kai-conversations';

let events: KaiDiagnosticEvent[] = [];
let off: (() => void) | undefined;

beforeEach(() => {
  events = [];
  off = subscribeWireDiagnostics((e) => events.push(e));
});

afterEach(() => {
  off?.();
  document.body.innerHTML = '';
});

const violations = () =>
  events.filter((e): e is ElementViolationEvent => e.type === 'element.violation');
const kinds = () => violations().map((v) => v.kind);

/**
 * CONNECTED, and it has to be. The per-instance accessors and the
 * property-changed channel this capability listens on are both installed by
 * component-register inside `connectedCallback`; a detached element has neither,
 * so a detached test would assert against a plain data property and prove
 * nothing about the real path.
 */
function mount(): HTMLElement & Record<string, unknown> {
  // Through `unknown`: the generated element-types.d.ts gives createElement a
  // precise `KaiConversationsElement` for this literal tag, which does not
  // overlap an open index signature. Widening it here is the point — the script
  // below sets props deliberately wrongly.
  const el = document.createElement(TAG) as unknown as HTMLElement & Record<string, unknown>;
  document.body.appendChild(el);
  return el;
}

const seed = () => [
  { id: 'a', title: 'Alpha', scope: { type: 'collection' }, messageCount: 3 },
  { id: 'b', title: 'Beta', scope: { type: 'collection' }, messageCount: 1 },
];

describe('element.violation — the same array reference handed back', () => {
  it('fires when a list prop is set to the reference it already holds', () => {
    const el = mount();
    const list = seed();
    el.conversations = list;
    events = [];

    // Solid's default equality is `===`, so this write reached the signal and
    // did nothing whatsoever.
    el.conversations = list;

    expect(kinds()).toEqual(['same-array-reference']);
    expect(violations()[0]).toMatchObject({
      tag: TAG,
      prop: 'conversations',
      length: 2,
    });
  });

  it('does NOT fire for a fresh array of fresh item objects (the correct update)', () => {
    const el = mount();
    el.conversations = seed();
    events = [];

    // Both halves of the rule obeyed: a new array AND a new object for the item
    // that changed.
    el.conversations = (el.conversations as Array<Record<string, unknown>>).map((c) =>
      c.id === 'a' ? { ...c, title: 'RENAMED' } : c,
    );

    expect(violations()).toHaveLength(0);
  });

  it('does NOT fire for an add — a fresh array, untouched items keep identity', () => {
    const el = mount();
    el.conversations = seed();
    events = [];

    // Adds/removes/reorders need only the fresh array, because the added row's
    // identity already differs. Reporting this would be reporting correct code.
    el.conversations = [
      ...(el.conversations as unknown[]),
      { id: 'c', title: 'Gamma', scope: { type: 'collection' }, messageCount: 9 },
    ];

    expect(violations()).toHaveLength(0);
  });
});

describe('element.violation — a new array of the same item objects', () => {
  it('fires for the #224 case: mutate the item, spread the array', () => {
    const el = mount();
    el.conversations = seed();
    events = [];

    // Exactly what the reporter did: change the field on the item, hand over a
    // fresh array of the SAME objects. The array notifies; no row re-renders.
    const current = el.conversations as Array<Record<string, unknown>>;
    current[0].title = 'RENAMED';
    el.conversations = [...current];

    expect(kinds()).toEqual(['mutated-in-place']);
    expect(violations()[0]).toMatchObject({ prop: 'conversations', length: 2 });
  });

  it('does NOT fire when a removal shortens the array', () => {
    const el = mount();
    el.conversations = seed();
    events = [];

    // Same item objects, but a different length, so rows really do disappear.
    el.conversations = (el.conversations as Array<Record<string, unknown>>).filter(
      (c) => c.id !== 'b',
    );

    expect(violations()).toHaveLength(0);
  });

  it('does NOT fire when one item object differs', () => {
    const el = mount();
    el.conversations = seed();
    events = [];

    const current = el.conversations as Array<Record<string, unknown>>;
    el.conversations = [{ ...current[0], title: 'RENAMED' }, current[1]];

    expect(violations()).toHaveLength(0);
  });

  it('does NOT fire for two empty arrays — that match is VACUOUS', () => {
    const el = mount();
    el.conversations = [];
    events = [];

    // "every item is reference-identical" is trivially true of two empty arrays,
    // and says nothing about what the consumer was trying to change. It is also
    // what an ordinary default-valued prop does on a first render.
    el.conversations = [];

    expect(violations()).toHaveLength(0);
  });

  it('does NOT fire for a non-array prop re-set to an equal string', () => {
    const el = mount();
    el.setAttribute('active-id', 'a');
    events = [];

    // `'a' === 'a'` too, but a string never had reference semantics, so calling
    // this a no-op update would be noise.
    el.setAttribute('active-id', 'a');
    el.activeId = 'a';

    expect(violations()).toHaveLength(0);
  });
});

describe('the zero-cost guarantee', () => {
  it('emits nothing when there is no subscriber', () => {
    off?.();
    off = undefined;

    const el = mount();
    const list = seed();
    el.conversations = list;
    el.conversations = list; // same-array-reference, with nobody listening

    events = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    expect(violations()).toHaveLength(0);
  });
});
