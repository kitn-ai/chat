/**
 * OBSERVE-ONLY, PROVEN RATHER THAN PROMISED.
 *
 * This capability wraps two prototype lifecycle callbacks on every element that
 * has a non-scalar prop — which is the single most dangerous shape a diagnostic
 * can take. A wrapper that swallowed a call, reordered one, changed an argument
 * or shifted a timing would break rendering for every consumer of the kit, and
 * it would break it only when a panel happened to be attached, which is the
 * worst possible failure schedule.
 *
 * So the claim is not "it looks observe-only". The claim is: for the same
 * script of operations, an element behaves IDENTICALLY with a subscriber
 * attached and without one. Two things are compared, because either alone is
 * weak:
 *
 *   the rendered DOM        — what the user sees. Compared as the full shadow
 *                             root markup, not a probe of one node.
 *   the prop-update sequence — what the element was TOLD, in order, with the
 *                             identity of each value. A wrapper that changed
 *                             what reached the signal, or when, shows up here
 *                             even if the final DOM happened to converge.
 *
 * AND THE HARNESS PROVES ITSELF. A "these two runs match" test passes
 * beautifully when both runs are empty, when the element never mounted, or when
 * the comparison reads nothing — the exact vacuity this repo keeps hitting. So
 * every comparison is preceded by an assertion that the recording is non-empty
 * and that the element really rendered, and one case deliberately makes the two
 * runs differ to show the comparison can fail at all.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  setWirePayloadCapture,
  subscribeWireDiagnostics,
  type KaiDiagnosticEvent,
} from '../wire/diagnostics';
import './conversation-list';
import './agent-card';
import './badge';

afterEach(() => {
  document.body.innerHTML = '';
  setWirePayloadCapture(false);
});

/**
 * Blank out generated a11y ids before comparing markup.
 *
 * The kit mints ids from a process-global counter (`cl-0`, `cl-1`, …) to wire
 * `aria-controls`/`aria-labelledby`, so ANY two mounts of the same element
 * differ in those attributes — with or without diagnostics, and this suite
 * confirmed that against two plain runs before adding the normalisation. Left
 * in, it would make every comparison here fail for a reason that has nothing to
 * do with what is being tested.
 *
 * Scoped to the id-carrying attributes by name, deliberately: a loose
 * `-\d+` rewrite would also flatten `py-1` and `gap-1.5` and quietly hide a real
 * styling difference. Nothing else in the markup is touched, and the
 * "comparison can FAIL" case below differs in TEXT rather than ids, so it proves
 * the normalisation has not blunted the comparison.
 */
const ID_ATTRS = /\b(id|for|aria-controls|aria-labelledby|aria-describedby|aria-activedescendant)="[^"]*"/g;
const normalizeIds = (html: string) => html.replace(ID_ATTRS, '$1="<id>"');

/** One prop write, as the element received it. */
interface Update {
  key: string;
  type: string;
  isArray: boolean;
  length: number | null;
}

/**
 * Run `script` against a freshly mounted element and record everything
 * observable about the run.
 *
 * The recording rides `addPropertyChangedCallback` — the same public channel the
 * diagnostics use, and the one solid-element bridges props through — so if the
 * diagnostics were interfering with that channel this recorder would see it.
 */
function run(
  tag: string,
  script: (el: HTMLElement & Record<string, unknown>) => void,
): { dom: string; updates: Update[] } {
  const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
  document.body.appendChild(el);

  const updates: Update[] = [];
  (el as unknown as {
    addPropertyChangedCallback: (fn: (k: string, v: unknown) => void) => void;
  }).addPropertyChangedCallback((key, val) => {
    updates.push({
      key,
      type: Array.isArray(val) ? 'array' : val === null ? 'null' : typeof val,
      isArray: Array.isArray(val),
      length: Array.isArray(val) ? val.length : null,
    });
  });

  script(el);

  const dom = normalizeIds(el.shadowRoot?.innerHTML ?? '');
  el.remove();
  return { dom, updates };
}

/** The same script, twice: once with nobody listening, once with a subscriber
 *  attached. Returns both recordings plus what the subscriber saw. */
function withAndWithout(tag: string, script: (el: HTMLElement & Record<string, unknown>) => void) {
  const without = run(tag, script);

  const events: KaiDiagnosticEvent[] = [];
  const off = subscribeWireDiagnostics((e) => events.push(e));
  const to = run(tag, script);
  off();

  return { without, with: to, events };
}

const seed = () => [
  { id: 'a', title: 'Alpha', scope: { type: 'collection' }, messageCount: 3 },
  { id: 'b', title: 'Beta', scope: { type: 'collection' }, messageCount: 1 },
];

describe('a subscriber changes nothing about how an element behaves', () => {
  it('kai-conversations — a correct update script', () => {
    const { without, with: to } = withAndWithout('kai-conversations', (el) => {
      el.conversations = seed();
      el.conversations = (el.conversations as Array<Record<string, unknown>>).map((c) => ({ ...c }));
      el.activeId = 'a';
    });

    // The harness observed something at all — without this the two comparisons
    // below would pass over two empty recordings.
    expect(without.updates.length).toBeGreaterThan(0);
    expect(without.dom.length).toBeGreaterThan(0);
    expect(without.dom).toContain('Alpha');

    expect(to.updates).toEqual(without.updates);
    expect(to.dom).toBe(without.dom);
  });

  it('kai-conversations — a script that violates BOTH reference rules', () => {
    // The case that matters most: with a subscriber this run emits violations,
    // so the guarded branches in the diagnostics actually execute. If any of
    // them perturbed the element, this is where it would show.
    const { without, with: to, events } = withAndWithout('kai-conversations', (el) => {
      const list = seed();
      el.conversations = list;
      el.conversations = list; // same-array-reference
      el.conversations = [...list]; // mutated-in-place
    });

    // The diagnostics really did fire on the second run — otherwise this would
    // be comparing two runs that both did nothing.
    expect(
      events.filter((e) => e.type === 'element.violation').map((e) => (e as { kind: string }).kind),
    ).toEqual(['same-array-reference', 'mutated-in-place']);

    expect(without.updates.length).toBeGreaterThan(0);
    expect(to.updates).toEqual(without.updates);
    expect(to.dom).toBe(without.dom);
  });

  it('kai-agent-card — an object prop, set correctly and then as an attribute', () => {
    // The attribute violation gets its own element, and the reason is itself a
    // finding: on `kai-conversations` the string reaching the facade throws
    // `(local.groups ?? []).map is not a function` out of a Solid computation,
    // an uncaught TypeError with no attribution to the consumer's mistake — the
    // very failure `array-prop-as-attribute` exists to explain, and one this
    // change does not (and cannot) prevent. `kai-agent-card` reads `status`
    // defensively, so the misuse is survivable and the comparison stays about
    // neutrality rather than about who crashes first.
    const { without, with: to, events } = withAndWithout('kai-agent-card', (el) => {
      el.setAttribute('name', 'Scout');
      el.status = { tone: 'working', label: 'Working' };
      el.setAttribute('status', '[object Object]'); // array-prop-as-attribute
    });

    expect(
      events.filter((e) => e.type === 'element.violation').map((e) => (e as { kind: string }).kind),
    ).toEqual(['array-prop-as-attribute']);

    expect(without.dom).toContain('Scout');
    expect(to.updates).toEqual(without.updates);
    expect(to.dom).toBe(without.dom);
  });

  it('kai-badge — an element with NO non-scalar prop, so nothing is installed', () => {
    const { without, with: to } = withAndWithout('kai-badge', (el) => {
      el.setAttribute('variant', 'success');
      el.textContent = 'ok';
    });

    expect(without.dom.length).toBeGreaterThan(0);
    expect(to.updates).toEqual(without.updates);
    expect(to.dom).toBe(without.dom);
  });

  it('the comparison can FAIL — otherwise every assertion above is decoration', () => {
    // Two deliberately different scripts over the same harness. If this passed,
    // the recorder or the comparison would be inert and the four cases above
    // would prove nothing.
    const a = run('kai-conversations', (el) => {
      el.conversations = seed();
    });
    const b = run('kai-conversations', (el) => {
      el.conversations = [{ id: 'z', title: 'Zeta', scope: { type: 'collection' }, messageCount: 0 }];
    });

    expect(b.dom).not.toBe(a.dom);
    expect(b.updates).not.toEqual(a.updates);
  });
});

describe('the payload signal changes nothing at the element layer', () => {
  it('renders and updates identically with payload capture ON', () => {
    // A second axis, and a NEW one: the payload opt-in landed on the wire
    // emitter after this capability was written. The element events do not
    // consult it — they have no payload key and nothing they report is
    // content — but "does not consult it" is an assumption about a switch that
    // did not exist when the code was written, so it gets asserted rather than
    // reasoned about.
    const script = (el: HTMLElement & Record<string, unknown>) => {
      const list = seed();
      el.conversations = list;
      el.conversations = list;
      el.conversations = [...list];
    };

    const off1 = subscribeWireDiagnostics(() => {});
    const plain = run('kai-conversations', script);
    off1();

    setWirePayloadCapture(true);
    const events: KaiDiagnosticEvent[] = [];
    const off2 = subscribeWireDiagnostics((e) => events.push(e));
    const captured = run('kai-conversations', script);
    off2();

    // The violations really fired in the payload-on run.
    const violations = events.filter((e) => e.type === 'element.violation');
    expect(violations.length).toBeGreaterThan(0);
    // And not one of them grew a payload key.
    for (const e of violations) expect('payload' in e).toBe(false);

    expect(captured.updates).toEqual(plain.updates);
    expect(captured.dom).toBe(plain.dom);
  });
});

describe('a throwing subscriber cannot break the element it is watching', () => {
  it('renders and updates identically while a subscriber throws on every event', () => {
    const clean = run('kai-conversations', (el) => {
      const list = seed();
      el.conversations = list;
      el.conversations = list;
    });

    let delivered = 0;
    const off = subscribeWireDiagnostics(() => {
      delivered++;
      throw new Error('a panel with a render bug');
    });
    const hostile = run('kai-conversations', (el) => {
      const list = seed();
      el.conversations = list;
      el.conversations = list;
    });
    off();

    // The subscriber really was invoked and really did throw.
    expect(delivered).toBeGreaterThan(0);
    expect(hostile.updates).toEqual(clean.updates);
    expect(hostile.dom).toBe(clean.dom);
  });
});
