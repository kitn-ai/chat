/**
 * CAPABILITY 1 — an array or object prop set as an HTML ATTRIBUTE.
 *
 * This is the kit's most-documented consumer failure and the least visible one.
 * `component-register` marks every prop whose default is not a string
 * `parse: true` and runs the attribute text through a `JSON.parse` whose `catch`
 * RETURNS THE RAW STRING (`component-register.js:59-66`). So
 * `el.setAttribute('conversations', arr)` assigns the literal text
 * `"[object Object],[object Object]"` to the property, pushes that string into
 * the Solid signal, and renders nothing. No throw, no log, no counter.
 *
 * The tests drive a REAL registered element rather than a synthetic one, on
 * purpose: the whole mechanism lives in component-register's attribute plumbing
 * and solid-element's signal bridge, and a hand-rolled stand-in would be testing
 * the stand-in. `kai-conversations` is the lightest real element carrying two
 * non-scalar props (`groups`, `conversations`).
 *
 * WHY THIS CANNOT PASS VACUOUSLY: every "an event fired" assertion is paired
 * with a same-harness case that asserts NO event fires — the correct property
 * assignment, the valid-JSON attribute, the scalar prop. If the detector were
 * wired to fire on everything, or the harness were not observing at all, one
 * half or the other goes red. A "no event" assertion alone would pass on a
 * broken subscription.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { subscribeWireDiagnostics, type KaiDiagnosticEvent } from '../wire/diagnostics';
import { classifyAttributeValue } from './element-diagnostics';
import type { ElementViolationEvent } from './diagnostic-events';
import { assertElementEventsVocabulary } from '../../tests/helpers/element-event-vocabulary';
import './conversation-list';
import './agent-card';
import './chat';

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
  // THE ALLOWLIST, over every element event this suite emitted. See the helper:
  // sentinel searching is a blocklist and misses leak shapes nobody named.
  assertElementEventsVocabulary(events);
});

const violations = () =>
  events.filter((e): e is ElementViolationEvent => e.type === 'element.violation');

/**
 * A real, UPGRADED element that is not in the document.
 *
 * `createElement` on an already-defined tag constructs through the registry, so
 * the element is a genuine upgraded instance with `observedAttributes` live --
 * `setAttribute` really does reach `attributeChangedCallback`, which is the path
 * under test. Leaving it disconnected keeps component-register's own handler at
 * its `!this.__initialized` early return, so the bad string never reaches the
 * Solid signal and the facade never renders with it.
 *
 * That matters for the harness, and it is worth stating why rather than
 * quietly: when the string DOES reach the facade, the consequence is an
 * uncaught `TypeError: (props.conversations ?? []) is not iterable` from inside
 * a Solid computation -- a crash with no attribution to the consumer's actual
 * mistake, which is precisely the failure this event exists to explain. The
 * connected case is covered separately below on an element that tolerates it.
 */
function upgraded(tag = TAG): HTMLElement & Record<string, unknown> {
  return document.createElement(tag) as HTMLElement & Record<string, unknown>;
}

describe('element.violation — array prop set as an HTML attribute', () => {
  it('fires when an array is stringified into the attribute (the classic case)', () => {
    const el = upgraded();
    const list = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];

    // Exactly what a consumer writes when they reach for setAttribute: the array
    // coerces to "[object Object],[object Object]".
    el.setAttribute('conversations', String(list));

    const v = violations();
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      type: 'element.violation',
      kind: 'array-prop-as-attribute',
      tag: TAG,
      prop: 'conversations',
      valuePreview: '[object Object] x 2',
    });
    expect(typeof v[0].t).toBe('number');
  });

  it('fires for a single object stringified into the attribute', () => {
    const el = upgraded();
    el.setAttribute('groups', String({ id: 'g' }));

    expect(violations()).toHaveLength(1);
    expect(violations()[0]).toMatchObject({
      kind: 'array-prop-as-attribute',
      prop: 'groups',
      valuePreview: '[object Object]',
    });
  });

  it('does NOT fire when the same value is set as a PROPERTY (the control)', () => {
    const el = upgraded();
    el.conversations = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];

    expect(violations()).toHaveLength(0);
  });

  it('does NOT fire for an attribute holding VALID JSON for an array', () => {
    // Connected, on an element that tolerates a junk prop, so the assertion can
    // go all the way to what the PROPERTY ended up holding — this case is only
    // interesting because the value really does arrive intact.
    const el = document.createElement('kai-agent-card') as HTMLElement & Record<string, unknown>;
    document.body.appendChild(el);
    el.setAttribute('status', '{"tone":"working"}');

    expect(violations()).toHaveLength(0);
    // JSON.parse succeeded, so the property holds a real object, not a string.
    // Reporting this would be reporting correct code.
    expect(typeof el.status).toBe('object');
  });

  it('fires on a CONNECTED, rendering element (not only on a detached one)', () => {
    const el = document.createElement('kai-agent-card') as HTMLElement & Record<string, unknown>;
    document.body.appendChild(el);
    expect(el.shadowRoot).toBeTruthy(); // the facade really did render

    el.setAttribute('status', '[object Object]');

    expect(violations()).toHaveLength(1);
    expect(violations()[0]).toMatchObject({
      kind: 'array-prop-as-attribute',
      tag: 'kai-agent-card',
      prop: 'status',
      valuePreview: '[object Object]',
    });
  });

  it('does NOT fire for a SCALAR prop set as an attribute — that is the supported way', () => {
    const el = upgraded();
    el.setAttribute('active-id', 'a');
    el.setAttribute('theme', 'dark');

    expect(violations()).toHaveLength(0);
  });

  it('describes a non-JSON string by LENGTH, never by content', () => {
    const el = upgraded();
    el.setAttribute('conversations', 'my-secret-conversation-name');

    expect(violations()[0]).toMatchObject({
      kind: 'array-prop-as-attribute',
      prop: 'conversations',
      valuePreview: 'string(len=27)',
    });
  });

  it('reports valid JSON that is nonetheless a scalar, by TYPE', () => {
    const el = upgraded();
    el.setAttribute('conversations', '42');

    expect(violations()[0]).toMatchObject({ valuePreview: 'json:number' });
  });

  it('fires on an attribute present in parsed markup, at upgrade time', () => {
    // The parser path, not the setAttribute path: the attribute exists before the
    // element is upgraded. Custom-element upgrade replays observed attributes
    // through attributeChangedCallback, so this must be caught too.
    document.body.innerHTML = `<${TAG} conversations="[object Object]"></${TAG}>`;
    const el = document.body.firstElementChild as HTMLElement;
    // Upgrade is synchronous for an already-defined tag on innerHTML in jsdom;
    // connecting is what runs the rest.
    expect(el.isConnected).toBe(true);

    expect(violations().map((v) => v.kind)).toContain('array-prop-as-attribute');
  });

  it('maps a camelCase prop to its kebab attribute', () => {
    // `cardSchemas` -> `card-schemas`. Driven through a real element so the
    // derivation is checked against the one component-register actually reports,
    // rather than against a restatement of it.
    const el = upgraded('kai-chat');
    el.setAttribute('card-schemas', '[object Object]');

    expect(violations()).toHaveLength(1);
    expect(violations()[0]).toMatchObject({ tag: 'kai-chat', prop: 'cardSchemas' });
  });

  it('emits NOTHING at all when there is no subscriber', () => {
    // The zero-cost guarantee, asserted rather than asserted-about: unsubscribe,
    // do the wrong thing, re-subscribe, and confirm nothing was buffered.
    off?.();
    off = undefined;
    const el = upgraded();
    el.setAttribute('conversations', '[object Object]');

    events = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    expect(violations()).toHaveLength(0);
  });
});

/**
 * The classifier in isolation. It is the one place a prop's raw text is looked
 * at, so its vocabulary IS the payload boundary for this capability — every
 * branch is asserted here, and `element-diagnostics-payload.test.ts` then proves
 * the whole set never carries content.
 */
describe('classifyAttributeValue — a closed vocabulary of SHAPES', () => {
  it('returns undefined (no violation) for attribute text that is valid JSON for an object or array', () => {
    expect(classifyAttributeValue('[]')).toBeUndefined();
    expect(classifyAttributeValue('{}')).toBeUndefined();
    expect(classifyAttributeValue('[{"id":"a"}]')).toBeUndefined();
  });

  it('names the two stringified-object signatures', () => {
    expect(classifyAttributeValue('[object Object]')).toBe('[object Object]');
    expect(classifyAttributeValue('[object Object],[object Object],[object Object]')).toBe(
      '[object Object] x 3',
    );
  });

  it('reports valid-but-scalar JSON by type, never by value', () => {
    expect(classifyAttributeValue('42')).toBe('json:number');
    expect(classifyAttributeValue('true')).toBe('json:boolean');
    expect(classifyAttributeValue('null')).toBe('json:null');
    expect(classifyAttributeValue('"hello"')).toBe('json:string');
  });

  it('reports anything else by LENGTH alone', () => {
    expect(classifyAttributeValue('not json at all')).toBe('string(len=15)');
    // A comma-separated string is not the array signature and must not be
    // mistaken for it.
    expect(classifyAttributeValue('a,b,c')).toBe('string(len=5)');
  });

  it('flags a bare attribute, which component-register parses to undefined', () => {
    expect(classifyAttributeValue('')).toBe('empty-attribute');
  });

  it('is content-free over hostile inputs, including a PARTIAL leak', () => {
    // The END-TO-END boundary lives in ONE place — `wire/payload-boundary.test.ts`,
    // which sweeps both layers with sentinels because a panel receives both on
    // one stream. This case is the half that sweep cannot reach: the classifier
    // called directly, with the shapes most likely to smuggle something through
    // — an object KEY that looks like a marker, an array of them, and JSON whose
    // VALUES are sentinels.
    //
    // The token is SHORT on purpose. A truncation is the most likely way this
    // ever breaks (it is the obvious "safe" alternative to a length), and a long
    // sentinel is cut through the middle by one, leaving `toContain` green over
    // a real leak. Six characters trips any truncation that keeps six.
    const LEAK = 'zQ7leak';
    const hostile = [
      `${LEAK}-plain-text`,
      `[object Object],${LEAK}-appended`,
      JSON.stringify({ [`${LEAK}-key`]: `${LEAK}-value` }),
      JSON.stringify([`${LEAK}-a`, `${LEAK}-b`]),
      JSON.stringify(`${LEAK}-json-string`),
      `{"broken": "${LEAK}-unterminated"`,
      `${LEAK}-`.repeat(40),
      '',
    ];

    const previews = hostile.map((h) => classifyAttributeValue(h));
    // Non-vacuity: something really was classified.
    expect(previews.filter((p) => p !== undefined).length).toBeGreaterThan(0);
    expect(JSON.stringify(previews)).not.toContain(LEAK);
  });
});
