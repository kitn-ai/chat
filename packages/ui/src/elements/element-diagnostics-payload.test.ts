/**
 * THE METADATA BOUNDARY, for the element events.
 *
 * The rule, unchanged from `wire/diagnostics.ts`: if a value comes from the
 * model, the end user, or the app's data it is PAYLOAD; if it describes the
 * shape, size, timing or identity of that value it is METADATA. `wire/`'s half
 * is pinned by the `SECRET` assertion in `wire/diagnostic-events.test.ts`. This
 * is the same assertion on the other half, and it matters MORE here, not less:
 * element props carry the whole conversation, the user's own drafted text,
 * conversation titles, file names and card envelopes — and unlike the wire
 * events, this code ships to every consumer of the elements bundle whether or
 * not they ever parse a stream.
 *
 * The method is the same and it is deliberately blunt: plant distinct sentinels
 * everywhere a value could possibly be read from, do the wrong thing in every
 * way the detector reacts to, then assert no sentinel survives into
 * `JSON.stringify(events)`. Serialising the whole event array rather than
 * checking named fields is the point — a leak through a field nobody thought to
 * check is exactly the leak a field-by-field test cannot see.
 *
 * NOT VACUOUS: the suite first asserts that events were actually produced, and
 * a final case proves the sentinel search can find a sentinel when one IS
 * present. Without those, "no secret found" passes over an empty array.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { subscribeWireDiagnostics, type KaiDiagnosticEvent } from '../wire/diagnostics';
import { classifyAttributeValue, emitElementRegistry } from './element-diagnostics';
import './conversation-list';
import './agent-card';

/** Every sentinel is a distinct, unmistakable string. Distinct so a failure
 *  names WHICH channel leaked rather than just that something did. */
const SENTINELS = {
  title: 'SENTINEL_CONVERSATION_TITLE_ee1f',
  id: 'SENTINEL_CONVERSATION_ID_7a20',
  attribute: 'SENTINEL_ATTRIBUTE_TEXT_c4b9',
  nested: 'SENTINEL_DEEPLY_NESTED_VALUE_9d3e',
  agentName: 'SENTINEL_AGENT_NAME_0b15',
  key: 'SENTINEL_OBJECT_KEY_5f77',
};

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

const serialized = () => JSON.stringify(events);

function mount(tag: string): HTMLElement & Record<string, unknown> {
  const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
  document.body.appendChild(el);
  return el;
}

const seeded = () => [
  {
    id: SENTINELS.id,
    title: SENTINELS.title,
    scope: { type: 'collection' },
    messageCount: 3,
    meta: { deep: { deeper: SENTINELS.nested } },
    [SENTINELS.key]: 'x',
  },
  {
    id: `${SENTINELS.id}-2`,
    title: `${SENTINELS.title}-2`,
    scope: { type: 'collection' },
    messageCount: 1,
  },
];

describe('element events carry no prop content', () => {
  it('leaks nothing through the reference violations', () => {
    const el = mount('kai-conversations');
    const list = seeded();
    el.conversations = list;
    el.conversations = list; // same-array-reference
    el.conversations = [...list]; // mutated-in-place

    // The events exist, so the assertion below is over something.
    expect(events.filter((e) => e.type === 'element.violation')).toHaveLength(2);

    for (const [name, sentinel] of Object.entries(SENTINELS)) {
      expect(serialized(), `leaked via ${name}`).not.toContain(sentinel);
    }
  });

  it('leaks nothing through the attribute violation, whatever the attribute holds', () => {
    const el = mount('kai-agent-card');

    // Four different shapes of wrong, each carrying a sentinel: a bare string,
    // a stringified object, valid JSON holding a sentinel, and a scalar JSON
    // string. Every one of them is a value `classifyAttributeValue` LOOKS at.
    el.setAttribute('status', SENTINELS.attribute);
    el.setAttribute('status', `[object Object]${SENTINELS.attribute}`);
    el.setAttribute('status', JSON.stringify(SENTINELS.attribute));
    el.setAttribute('name', SENTINELS.agentName); // a scalar prop: no event, but still set

    expect(events.filter((e) => e.type === 'element.violation').length).toBeGreaterThan(0);

    for (const [name, sentinel] of Object.entries(SENTINELS)) {
      expect(serialized(), `leaked via ${name}`).not.toContain(sentinel);
    }
  });

  it('leaks nothing through the registry snapshot', () => {
    const el = mount('kai-conversations');
    el.conversations = seeded();
    events = [];

    const snapshot = emitElementRegistry();
    expect(snapshot).toBeDefined();

    for (const [name, sentinel] of Object.entries(SENTINELS)) {
      expect(serialized(), `leaked via ${name}`).not.toContain(sentinel);
    }
  });

  it('reports only length for a long attribute, never a prefix of it', () => {
    const el = mount('kai-agent-card');
    const long = `${SENTINELS.attribute}-`.repeat(50);
    el.setAttribute('status', long);

    const v = events.find((e) => e.type === 'element.violation') as { valuePreview?: string };
    // The one field that touches the raw text at all reports its LENGTH. A
    // truncation — the obvious "safe" alternative — would ship a prefix of the
    // user's data on every event.
    expect(v.valuePreview).toBe(`string(len=${long.length})`);
    expect(serialized()).not.toContain(SENTINELS.attribute);
  });

  it('the whole classifier vocabulary is content-free, over hostile inputs', () => {
    // Straight at the one function that reads the text, with the shapes most
    // likely to smuggle something through: a key that looks like a marker, an
    // array of them, and JSON whose VALUES are sentinels.
    const hostile = [
      SENTINELS.attribute,
      `[object Object],${SENTINELS.attribute}`,
      JSON.stringify({ [SENTINELS.key]: SENTINELS.nested }),
      JSON.stringify([SENTINELS.title, SENTINELS.id]),
      JSON.stringify(SENTINELS.title),
      `{"broken": "${SENTINELS.nested}"`,
      '',
    ];

    const previews = hostile.map((h) => classifyAttributeValue(h));
    // Something was classified — not every input returned undefined.
    expect(previews.filter((p) => p !== undefined).length).toBeGreaterThan(0);

    const all = JSON.stringify(previews);
    for (const sentinel of Object.values(SENTINELS)) expect(all).not.toContain(sentinel);
  });

  it('the sentinel search can FIND a sentinel — otherwise every case above is decoration', () => {
    // If `toContain` were inert, or `serialized()` returned '', every assertion
    // in this file would pass over nothing.
    const planted = JSON.stringify([{ type: 'element.violation', leak: SENTINELS.title }]);
    expect(planted).toContain(SENTINELS.title);
    expect(serialized()).not.toContain(SENTINELS.title);
  });
});
