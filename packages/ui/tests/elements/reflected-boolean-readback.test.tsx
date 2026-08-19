/**
 * GUARD — a boolean prop a facade REFLECTS to a host attribute must read back what
 * was set.
 *
 * THE DEFECT THIS PINS. A facade reflects a flag with
 * `createEffect(() => element.toggleAttribute('loading', flag('loading')))`.
 * `toggleAttribute(name, true)` sets the attribute to the EMPTY STRING, which fires
 * component-register's `attributeChangedCallback`, which writes the prop back as
 * `this[name] = parseAttributeValue("")` — and `parseAttributeValue` is `if (!value)
 * return;`, i.e. `undefined` for the empty string. So:
 *
 *   el.loading = true;   // …a tick later…
 *   el.loading            // → undefined, while el.hasAttribute('loading') is true
 *
 * The element still BEHAVES correctly the whole time, because `flag()` falls back to
 * attribute presence — which is exactly why the bug is silent, and why it cost a
 * downstream builder a debugging cycle (docs/superpowers/research/
 * 2026-08-19-rung-1-mcp-rebuild/findings.md, G-05). The property is effectively
 * write-only: you can set it, you can never read it.
 *
 * It is asymmetric, so both directions are asserted. Setting `false` REMOVES the
 * attribute, and the callback's `if (newVal == null && !this[name]) return;` guard
 * fires because the prop is already falsy — no write-back, prop stays `false`. So a
 * test that only ever checked the `false` case would pass against the broken code.
 *
 * WATCH IT FAIL. Every read-back case here was confirmed RED before the fix, with
 * `undefined` as the received value — not merely absent, which is the failure mode
 * where a guard passes because it never ran. `kai-switch` is the control: it has
 * carried a hand-rolled version of the fix since long before this file, so it was
 * GREEN in the same run, proving the harness can distinguish the two.
 */
import '../../src/elements/chat';
import '../../src/elements/resizable';
import '../../src/elements/switch';
import '../../src/elements/reasoning';
import { expect, test, afterEach, describe } from 'vitest';

// jsdom does not implement Element.prototype.scrollTo; <kai-chat>'s stick-to-bottom
// primitive calls it from a rAF when content mounts. Same shim as chat-element.test.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
// jsdom has no ResizeObserver; <kai-reasoning>'s content-height primitive constructs
// one on mount. It only measures, and nothing here asserts on a measurement, so a
// no-op stub is faithful for this file's purposes.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/**
 * Let Solid's effects run AND the resulting attributeChangedCallback land. The
 * write-back is what this file is about, so the flush has to be past a macrotask,
 * not just a microtask — a `await Promise.resolve()` here would read the prop before
 * the reflection effect had written the attribute and would pass vacuously.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

/** Mount a tag, optionally inside a required parent, and let it upgrade + render. */
async function mount(
  tag: string,
  parentTag?: string,
): Promise<HTMLElement & Record<string, unknown>> {
  const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
  if (parentTag) {
    const parent = document.createElement(parentTag);
    parent.appendChild(el);
    document.body.appendChild(parent);
  } else {
    document.body.appendChild(el);
  }
  await flush();
  return el;
}

/**
 * The reflected boolean props under test, as (tag, parent, prop) triples.
 *
 * NOT the derived list — that is `reflected-boolean-coverage.test.ts`, which scans
 * every `toggleAttribute` site in src/elements and fails when one is neither covered
 * nor exempted. This is the behavioural half: these are the cases whose RED was
 * actually observed, spelled out so the failure message names the element.
 */
const cases: { tag: string; parent?: string; prop: string; attr: string }[] = [
  { tag: 'kai-chat', prop: 'loading', attr: 'loading' },
  { tag: 'kai-resizable-item', parent: 'kai-resizable', prop: 'collapsed', attr: 'collapsed' },
  { tag: 'kai-resizable-item', parent: 'kai-resizable', prop: 'locked', attr: 'locked' },
  // The control: already correct before this fix (switch.tsx's hand-rolled accessor).
  // If this one ever goes red the harness is broken, not the element.
  { tag: 'kai-switch', prop: 'checked', attr: 'checked' },
  { tag: 'kai-reasoning', prop: 'open', attr: 'open' },
];

describe.each(cases)('$tag.$prop', ({ tag, parent, prop, attr }) => {
  test('reads back true after being set to true', async () => {
    const el = await mount(tag, parent);
    el[prop] = true;
    await flush();

    expect(el.hasAttribute(attr), `${tag}[${attr}] should reflect`).toBe(true);
    // THE ASSERTION. Before the fix this received `undefined`.
    expect(el[prop], `${tag}.${prop} must read back the true it was set to`).toBe(true);
  });

  test('reads back false after being set back to false', async () => {
    const el = await mount(tag, parent);
    el[prop] = true;
    await flush();
    el[prop] = false;
    await flush();

    expect(el.hasAttribute(attr), `${tag}[${attr}] should be removed`).toBe(false);
    expect(el[prop], `${tag}.${prop} must read back false`).toBe(false);
  });

  test('a bare attribute reads back as true, not undefined', async () => {
    // `<el loading>` — the HTML-author path. component-register parses a bare boolean
    // attribute to `undefined`, so this was the ORIGINAL asymmetry `flag()` exists to
    // paper over; the property should agree with the attribute rather than contradict it.
    const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
    el.setAttribute(attr, '');
    if (parent) {
      const p = document.createElement(parent);
      p.appendChild(el);
      document.body.appendChild(p);
    } else {
      document.body.appendChild(el);
    }
    await flush();

    expect(el[prop], `<${tag} ${attr}> must make .${prop} read true`).toBe(true);
  });

  test('an explicit ="false" attribute reads back as false', async () => {
    const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
    el.setAttribute(attr, 'false');
    if (parent) {
      const p = document.createElement(parent);
      p.appendChild(el);
      document.body.appendChild(p);
    } else {
      document.body.appendChild(el);
    }
    await flush();

    expect(el[prop], `<${tag} ${attr}="false"> must make .${prop} read false`).toBe(false);
  });

  test('a property set BEFORE upgrade survives and reads back', async () => {
    // THE UPGRADE-RACE CLASS. component-register's `initializeProps` runs inside
    // connectedCallback and harvests the pre-upgrade own value off the instance
    // (`value = element[key]`) before installing its accessor. Any fix that wraps the
    // property has to run AFTER that harvest or it eats the author's value — which is
    // the same shape of defect as define-upgrade-ordering.test.tsx pins for attributes.
    const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
    el[prop] = true; // set while the element is still un-connected / un-rendered
    if (parent) {
      const p = document.createElement(parent);
      p.appendChild(el);
      document.body.appendChild(p);
    } else {
      document.body.appendChild(el);
    }
    await flush();

    expect(el[prop], `${tag}.${prop} set before upgrade must survive it`).toBe(true);
    expect(el.hasAttribute(attr), `${tag}[${attr}] must reflect the pre-upgrade value`).toBe(true);
  });
});

describe('wireDisclosure — a bare `open` attribute', () => {
  /**
   * A PRE-EXISTING BEHAVIOURAL DEFECT, found by the read-back test above rather than
   * reasoned about in advance.
   *
   * `wireDisclosure` runs two effects: one reflecting the controller's open state OUT
   * to the `[open]` attribute, one reading an explicitly-set `open` IN to drive the
   * controller. They ran in that order, and the outward one ran first with the
   * controller still in its default CLOSED state — so it called
   * `toggleAttribute('open', false)` and DELETED the author's attribute. The inward
   * effect then looked for `element.hasAttribute('open')`, found nothing (and a prop
   * that parsed to `undefined`), concluded the consumer had not asked for anything,
   * and left it shut.
   *
   * So `<kai-reasoning open>` — the plain HTML spelling, and the one the `open` prop's
   * own doc comment advertises — never opened. Only `default-open` did. The fix is the
   * effect ORDER: read the consumer's intent in before reflecting internal state out.
   */
  test('opens the element, and is not deleted by the outward reflection', async () => {
    const el = document.createElement('kai-reasoning') as unknown as HTMLElement & Record<string, unknown>;
    el.setAttribute('open', '');
    document.body.appendChild(el);
    await flush();

    expect(el.hasAttribute('open'), "the author's `open` attribute was deleted").toBe(true);
    expect(el.open, 'el.open must agree with the attribute').toBe(true);
  });

  test('`default-open` still seeds, and is not clobbered by the inward effect', async () => {
    // The counterpart risk: the inward effect only acts when `open` was EXPLICITLY
    // set, and "explicitly" is decided by `props.open !== undefined`. Anything that
    // writes a value into that prop on mount — a too-eager read-back seed, for
    // instance — turns every element into a controlled one and silently overrides
    // `defaultOpen` with `false`.
    const el = document.createElement('kai-reasoning') as unknown as HTMLElement & Record<string, unknown>;
    el.setAttribute('default-open', '');
    document.body.appendChild(el);
    await flush();

    expect(el.hasAttribute('open'), 'default-open must still open it').toBe(true);
  });

  test('an element with neither attribute stays closed and unset', async () => {
    const el = await mount('kai-reasoning');
    expect(el.hasAttribute('open')).toBe(false);
    // `undefined`, not `false`: for a prop whose declared default is `undefined`,
    // unset is a real state and the read-back fix must not invent a value.
    expect(el.open).toBeUndefined();
  });
});

describe('the seam itself', () => {
  test('the read-back survives a disconnect and reconnect', async () => {
    // WHY THIS IS NOT PARANOIA. component-register installs a FRESH instance accessor
    // from `initializeProps` on every connect after a release, throwing our wrapper
    // away. That is why the "already wrapped" mark lives on the SETTER FUNCTION and
    // not on the element: an element-level flag would skip the re-wrap and the
    // property would silently go write-only again on the second mount — a defect that
    // only shows up in apps that move nodes around, i.e. not in any of the tests above.
    const el = await mount('kai-chat');
    el.loading = true;
    await flush();
    expect(el.loading).toBe(true);

    el.remove();
    // The release is deferred by a microtask + an isConnected re-check, so give it a
    // real turn before re-attaching.
    await flush();
    document.body.appendChild(el);
    await flush();

    // The attribute SURVIVES the detach, so a plain `loading = true` here would be a
    // no-op for `toggleAttribute` and no write-back would fire — the assertion would
    // then hold no matter what the seam did. Drive a real OFF→ON transition instead,
    // which is the only thing that triggers the `undefined` write-back this guards.
    el.loading = false;
    await flush();
    expect(el.hasAttribute('loading'), 'the reflection is dead on the second mount').toBe(false);

    el.loading = true;
    await flush();
    expect(el.loading, 'read-back was lost on the second mount').toBe(true);
  });

  test('reflectFlag on an undeclared prop warns instead of silently doing nothing', async () => {
    // "Decide loudly". A facade reflecting a prop it never declared gets no accessor
    // to wrap, and the quiet version of that looks exactly like a working read-back.
    const { defineWebComponent } = await import('../../src/elements/define');
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args);
    try {
      defineWebComponent('kai-readback-probe', { declared: false }, (_props, { reflectFlag }) => {
        reflectFlag('neverDeclared');
        return null as never;
      });
      const el = document.createElement('kai-readback-probe');
      document.body.appendChild(el);
      await flush();
    } finally {
      console.warn = original;
    }

    expect(
      warnings.some((w) => String(w[0]).includes('reflectFlag("neverDeclared")')),
      'an undeclared reflected prop must warn',
    ).toBe(true);
  });
});

test('the reflection still drives real behaviour, not just the property', async () => {
  // Guards the obvious wrong fix: satisfying the read-back by storing the value and
  // dropping the attribute write. `:host([loading])` CSS and, for resizable, the
  // PARENT's readItems()/MutationObserver both read the attribute — so the attribute
  // is not incidental, it is the contract. Asserted on the element where a lost
  // attribute would be silently invisible in jsdom.
  const group = document.createElement('kai-resizable');
  const item = document.createElement('kai-resizable-item') as HTMLElement & Record<string, unknown>;
  const other = document.createElement('kai-resizable-item');
  item.textContent = 'a';
  other.textContent = 'b';
  group.append(item, other);
  document.body.appendChild(group);
  await flush();

  item.collapsed = true;
  await flush();

  expect(item.getAttribute('collapsed')).toBe('');
  expect(item.collapsed).toBe(true);
});
