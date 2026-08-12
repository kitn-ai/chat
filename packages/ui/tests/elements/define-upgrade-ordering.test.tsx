/**
 * GUARD — an author's attribute must survive `customElements.define()`.
 *
 * THE DEFECT THIS PINS: `define.tsx` used to install its non-reflecting property
 * accessors AFTER calling `customElement()`, which calls `customElements.define()`,
 * which SYNCHRONOUSLY upgrades every matching element the parser already produced.
 * component-register's constructor assigns `this[prop] = undefined` for each declared
 * prop, so for a prop whose name is also a reflected global IDL attribute that
 * assignment reached the NATIVE setter and the markup was destroyed before a line of
 * facade code ran. Measured in chromium from parsed HTML, before the fix:
 *
 *   <kai-message role="user">        role attr → null, el.role "assistant",
 *                                    the row rendered as "Assistant message"
 *   <kai-resizable-item hidden>      hidden attr → null, el.hidden false,
 *                                    the panel was slotted and RENDERED VISIBLE
 *   <kai-confirm autofocus>          autofocus attr → null, nothing focused
 *
 * WHAT IS DERIVED, AND WHY. The case list is not the three props that happen to
 * collide today. It is (every prop name in element-meta.json) × (every accessor this
 * environment inherits from the element prototype chain), plus a control set of names
 * the platform reflects here — so a prop that starts colliding tomorrow is covered the
 * day it is added, with no list to update. `reflectedGlobalPropNames()` is imported
 * from the implementation rather than recomputed, so the test cannot drift from the
 * rule the fix actually applies.
 *
 * WHAT THIS FILE CANNOT SEE. jsdom implements `role` and `hidden` and does NOT
 * implement `autofocus`, so the `autofocus` case simply is not a collision here and is
 * dropped from the derived set — correctly, but it means a green run here is not proof
 * for chromium. The browser reading is `node scripts/probe-upgrade-attribute-loss.mjs`,
 * which serves real parsed HTML and drives all three end to end (0/3 before, 3/3 after).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { defineWebComponent, reflectedGlobalPropNames } from '../../src/elements/define';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const meta: { tag: string; props?: { name: string }[] }[] = JSON.parse(
  readFileSync(resolve(pkgRoot, 'src/elements/element-meta.json'), 'utf8'),
);

const reflected = reflectedGlobalPropNames();

/** Prop names the SHIPPING elements declare that this environment reflects. */
const catalogCollisions = [
  ...new Set(meta.flatMap((e) => (e.props ?? []).map((p) => p.name)).filter((n) => reflected.has(n))),
].sort();

/**
 * Names the platform reflects that no element uses YET. Included so the mechanism
 * stays under test even if every current collision were renamed away — the point is
 * the ordering, not the three props. `dir` is the interesting one: `undefined` is not
 * nullable there, so the native setter writes the string "undefined" instead of
 * removing the attribute. Different damage, same cause.
 */
const controls = ['role', 'hidden', 'autofocus', 'dir', 'inert'].filter((n) => reflected.has(n));

const cases = [...new Set([...catalogCollisions, ...controls])].sort();

let seq = 0;
const nextTag = (name: string) => `kai-upgrade-probe-${name.toLowerCase()}-${seq++}`;

/**
 * Put the element in the document as PARSED markup carrying the attribute, then
 * register the tag — the order that reproduces the defect. `insertAdjacentHTML` runs
 * the real HTML parser and produces an un-upgraded custom element inside the document,
 * exactly like a `<script>` that loads after the body; `define()` then upgrades it
 * synchronously. (`createElement` + `setAttribute` AFTER registration cannot reproduce
 * anything: by then the prototype already carries the facade's own accessors.)
 */
function upgradeFromParsedMarkup(prop: string, value: string) {
  const tag = nextTag(prop);
  const host = document.createElement('div');
  document.body.append(host);
  host.insertAdjacentHTML('beforeend', `<${tag} ${prop}="${value}"></${tag}>`);
  const el = host.firstElementChild as HTMLElement & Record<string, unknown>;
  expect(customElements.get(tag), 'the element must still be un-upgraded here').toBeUndefined();

  const seen: { prop?: unknown; flag?: boolean } = {};
  defineWebComponent(tag, { [prop]: undefined }, (props, { flag }) => {
    seen.prop = (props as Record<string, unknown>)[prop];
    seen.flag = flag(prop);
    return <i />;
  });

  return { tag, el, seen, cleanup: () => host.remove() };
}

test('the derived collision set is not empty (a vacuous run of this file proves nothing)', () => {
  expect(reflected.size).toBeGreaterThan(20);
  expect(cases.length).toBeGreaterThan(0);
  // Not an assertion about WHICH props collide — that moves. Just a readable record of
  // what this environment actually covered, so a thin jsdom run is visible as thin.
  expect(cases.join(',')).toEqual(expect.any(String));
});

test.each(cases)('an author-supplied %s attribute survives upgrade', (prop) => {
  const { el, seen, cleanup } = upgradeFromParsedMarkup(prop, 'probe-value');
  try {
    expect(el.getAttribute(prop), `<el ${prop}="probe-value"> lost its attribute on upgrade`).toBe(
      'probe-value',
    );
    expect(el[prop], `el.${prop} lost the author's value on upgrade`).toBe('probe-value');
    expect(seen.prop, `the facade never saw ${prop}`).toBe('probe-value');
    expect(seen.flag, `flag('${prop}') did not resolve the author's attribute`).toBe(true);
  } finally {
    cleanup();
  }
});

test('the non-reflecting accessor is on the class BEFORE the registry sees it', () => {
  // The ordering itself, asserted directly rather than through a symptom: at the
  // moment `customElements.define` is called, the prototype must already carry an own
  // accessor for the colliding prop. This test doubles as the composition check for a
  // consumer- or polyfill-wrapped registry — it IS such a wrapper.
  const prop = cases[0];
  const tag = nextTag(`${prop}-order`);
  const original = customElements.define;
  let ownAccessorAtDefine: PropertyDescriptor | undefined | 'not-called' = 'not-called';
  customElements.define = function (
    this: CustomElementRegistry,
    name: string,
    ctor: CustomElementConstructor,
    options?: ElementDefinitionOptions,
  ) {
    if (name === tag) ownAccessorAtDefine = Object.getOwnPropertyDescriptor(ctor.prototype, prop);
    return original.call(this, name, ctor, options);
  };
  try {
    defineWebComponent(tag, { [prop]: undefined }, () => <i />);
  } finally {
    customElements.define = original;
  }

  expect(ownAccessorAtDefine, 'defineWebComponent never reached customElements.define').not.toBe(
    'not-called',
  );
  expect(typeof (ownAccessorAtDefine as PropertyDescriptor)?.get).toBe('function');
  expect(typeof (ownAccessorAtDefine as PropertyDescriptor)?.set).toBe('function');
});

test('the registry is left exactly as it was found', () => {
  // The wrap is transient. If it ever leaked, every later `customElements.define` on
  // the page would run through a closure holding a dead tag — and it would leak
  // silently, because a leaked wrapper still delegates correctly.
  const hadOwnBefore = Object.prototype.hasOwnProperty.call(customElements, 'define');
  const before = customElements.define;
  defineWebComponent(nextTag('restore'), { [cases[0]]: undefined }, () => <i />);
  expect(customElements.define).toBe(before);
  expect(Object.prototype.hasOwnProperty.call(customElements, 'define')).toBe(hadOwnBefore);
});

test('a registry that refuses to be wrapped still registers the element', () => {
  // A hardened environment (SES lockdown, a sealed polyfill) can leave
  // `customElements.define` non-writable. Failing to register would take all 80
  // elements down there to protect three props; the element must still come up, on
  // the old too-late timing, with the accessor installed after the fact.
  const tag = nextTag('frozen');
  const original = customElements.define;
  Object.defineProperty(customElements, 'define', {
    value: original,
    writable: false,
    configurable: true,
  });
  try {
    expect(() => defineWebComponent(tag, { [cases[0]]: undefined }, () => <i />)).not.toThrow();
  } finally {
    delete (customElements as unknown as Record<string, unknown>).define;
  }
  expect(customElements.get(tag)).toBeDefined();
  expect(customElements.define).toBe(original);
  const proto = customElements.get(tag)!.prototype;
  expect(typeof Object.getOwnPropertyDescriptor(proto, cases[0])?.set).toBe('function');
});

test('a prop that collides with nothing gets no accessor from us', () => {
  // The shadowing is scoped to real collisions. Blanket-shadowing every prop would
  // take the plain data path away from component-register for no reason.
  const tag = nextTag('plain');
  defineWebComponent(tag, { label: 'hi', hoverCard: false }, () => <i />);
  const proto = customElements.get(tag)!.prototype;
  expect(Object.getOwnPropertyDescriptor(proto, 'label')).toBeUndefined();
  expect(Object.getOwnPropertyDescriptor(proto, 'hoverCard')).toBeUndefined();
});

test('names that break the constructor outright still throw, they are not shadowed', () => {
  // RESERVED is a different answer to a related problem and must stay a loud one:
  // `title`/`id`/`slot`/`lang` are not domain props anyone wants on an element.
  expect(() => defineWebComponent(nextTag('reserved'), { title: 'x' }, () => <i />)).toThrow(
    /collides with a global HTMLElement attribute/,
  );
});
