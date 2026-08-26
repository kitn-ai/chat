/**
 * Guards for the `<kai-checkbox-group>` facade.
 *
 * WHAT JSDOM CANNOT SEE. jsdom runs no layout and does not apply the element
 * stylesheet to the shadow root (the facade adopts a constructable sheet built from
 * the compiled kit CSS, and nothing here paints), so NOTHING in this file proves the
 * group LOOKS right: not the divided rows, not the checked row's accent fill, not the
 * two-line description column. The look is verified in a real browser and reported
 * separately. What is real without CSS, and is what this file pins, is the facade
 * contract: the `kai-` prefix, `options` as a JS PROPERTY, non-bubbling `kai-*`
 * events, the property/attribute reflection round trip, the multi-value `values`
 * surface, and the two state-lifting failure modes this shape is exposed to (an
 * attr⇄prop feedback loop, and a host write that fires a change event back at the
 * host that made it).
 *
 * It also pins the two DECISIONS that are easiest to "fix" into a defect: that no
 * `name` is generated when none is given, and that the element is not form-associated.
 */
import { test, expect } from 'vitest';
import '../../src/elements/checkbox-group';

/** Let the element upgrade and its first effects flush. */
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

const OPTIONS = [
  { value: 'prod', label: 'Production', description: 'Pages the on-call' },
  { value: 'staging', label: 'Staging' },
  { value: 'dev', label: 'Development' },
];

type Group = HTMLElement & {
  options: unknown[];
  value: string;
  values: string[];
  focus: (o?: FocusOptions) => void;
};

async function mount(attrs: Record<string, string> = {}, options: unknown[] = OPTIONS): Promise<Group> {
  const el = document.createElement('kai-checkbox-group') as Group;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await settle();
  el.options = options;
  await settle();
  return el;
}

const boxes = (el: Group) =>
  [...el.shadowRoot!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];

test('kai-checkbox-group renders a real checkbox per option, from an ARRAY JS PROPERTY', async () => {
  const el = await mount({ label: 'Environments' });
  expect(boxes(el).map((b) => b.value)).toEqual(['prod', 'staging', 'dev']);
  // Independent controls in a group, never a listbox: nothing here overrides what the
  // native boxes already announce.
  const group = el.shadowRoot!.querySelector('[role="group"]')!;
  expect(group.getAttribute('aria-label')).toBe('Environments');
  expect(el.shadowRoot!.querySelector('[role="listbox"]')).toBeNull();
  expect(el.shadowRoot!.textContent).toContain('Production');
  expect(el.shadowRoot!.textContent).toContain('Pages the on-call');
  el.remove();
});

test('kai-checkbox-group takes options assigned BEFORE it is connected', async () => {
  // The property door has to work on both sides of insertion, because that is the one
  // a framework wrapper uses and the order it uses is not the consumer's choice. (The
  // order that genuinely loses the assignment is a set before UPGRADE, which is what
  // makes the stories import the facade module rather than ./register; that entry
  // defines the tag through an SSR-gated dynamic import, so the upgrade lands a
  // microtask late and overwrites a property set in the meantime with the declared
  // default. jsdom cannot stage that here: importing this facade defines the tag, so
  // createElement upgrades synchronously.)
  const el = document.createElement('kai-checkbox-group') as Group;
  el.options = OPTIONS;
  document.body.appendChild(el);
  await settle();
  expect(boxes(el).map((b) => b.value)).toEqual(['prod', 'staging', 'dev']);
  el.remove();
});

test('kai-checkbox-group seeds from the value attribute and reflects the first selection', async () => {
  const el = await mount({ value: 'staging' });
  expect(boxes(el).map((b) => b.checked)).toEqual([false, true, false]);
  expect(el.value).toBe('staging');
  expect(el.values).toEqual(['staging']);
  el.remove();
});

test('kai-checkbox-group ticking a row fires kai-change carrying the WHOLE selection', async () => {
  const el = await mount({ value: 'prod' });
  const seen: unknown[] = [];
  el.addEventListener('kai-change', (e) => seen.push((e as CustomEvent).detail));

  boxes(el)[2].click();          // tick `dev`
  await settle();
  expect(seen).toEqual([{ value: 'prod', values: ['prod', 'dev'] }]);
  expect(el.values).toEqual(['prod', 'dev']);
  expect(boxes(el).map((b) => b.checked)).toEqual([true, false, true]);

  boxes(el)[0].click();          // untick `prod`
  await settle();
  expect(seen[1]).toEqual({ value: 'dev', values: ['dev'] });
  expect(el.values).toEqual(['dev']);
  // Reflection follows the selection down, including to nothing at all.
  expect(el.getAttribute('value')).toBe('dev');

  boxes(el)[2].click();          // untick the last one
  await settle();
  expect(seen[2]).toEqual({ value: '', values: [] });
  expect(el.hasAttribute('value')).toBe(false);
  el.remove();
});

test('kai-checkbox-group kai-change does NOT bubble and is not composed', async () => {
  const el = await mount();
  let bubbled = 0;
  const onDoc = () => { bubbled += 1; };
  document.addEventListener('kai-change', onDoc);
  let evt: Event | undefined;
  el.addEventListener('kai-change', (e) => { evt = e; });

  boxes(el)[1].click();
  await settle();

  expect(evt).toBeTruthy();
  expect(evt!.bubbles).toBe(false);
  expect(evt!.composed).toBe(false);
  expect(bubbled).toBe(0);
  document.removeEventListener('kai-change', onDoc);
  el.remove();
});

test('kai-checkbox-group host writes drive the selection and fire NO kai-change', async () => {
  const el = await mount({ value: 'prod' });
  let fired = 0;
  el.addEventListener('kai-change', () => { fired += 1; });

  // TWO values on purpose: a setter that kept only the first would satisfy a
  // one-element assertion, and losing the rest is exactly the silent drop `values`
  // exists to prevent.
  el.values = ['staging', 'dev'];
  await settle();
  expect(boxes(el).map((b) => b.checked)).toEqual([false, true, true]);
  expect(el.values).toEqual(['staging', 'dev']);
  expect(el.value).toBe('staging');
  expect(el.getAttribute('value')).toBe('staging');

  // The single-value door, and the attr⇄prop write-back it triggers, must not turn
  // into an event either. The host already knows what it set.
  el.value = 'dev';
  await settle();
  expect(el.values).toEqual(['dev']);
  expect(boxes(el).map((b) => b.checked)).toEqual([false, false, true]);
  expect(fired).toBe(0);
  el.remove();
});

test('kai-checkbox-group follows the reactivity contract: a NEW array re-renders the rows', async () => {
  const el = await mount({}, [{ value: 'prod', label: 'Production' }]);
  expect(boxes(el).map((b) => b.value)).toEqual(['prod']);

  // Adds need only the fresh array reference.
  el.options = [{ value: 'prod', label: 'Production' }, { value: 'dev', label: 'Development' }];
  await settle();
  expect(boxes(el).map((b) => b.value)).toEqual(['prod', 'dev']);
  expect(el.shadowRoot!.textContent).toContain('Development');

  // Editing an existing row needs a NEW OBJECT for it as well as a new array. The
  // stale case and the update case run over the same harness, so "nothing rendered"
  // cannot make the pair pass vacuously.
  const stale = el.options[0] as { label: string };
  stale.label = 'MUTATED IN PLACE';
  el.options = [...(el.options as unknown[])];
  await settle();
  expect(el.shadowRoot!.textContent).not.toContain('MUTATED IN PLACE');

  el.options = [{ value: 'prod', label: 'Prod (renamed)' }, { value: 'dev', label: 'Development' }];
  await settle();
  expect(el.shadowRoot!.textContent).toContain('Prod (renamed)');
  el.remove();
});

test('kai-checkbox-group disabled locks every row and toggling one fires nothing', async () => {
  const el = await mount({ disabled: '', value: 'prod' });
  expect(boxes(el).map((b) => b.disabled)).toEqual([true, true, true]);
  let fired = 0;
  el.addEventListener('kai-change', () => { fired += 1; });
  boxes(el)[1].click();
  await settle();
  expect(fired).toBe(0);
  expect(el.values).toEqual(['prod']);
  el.remove();
});

test('kai-checkbox-group honours a per-row disabled without disabling the group', async () => {
  const el = await mount({}, [
    { value: 'prod', label: 'Production' },
    { value: 'legacy', label: 'Legacy', disabled: true },
  ]);
  expect(boxes(el).map((b) => b.disabled)).toEqual([false, true]);
  el.remove();
});

test('kai-checkbox-group focus() reaches the FIRST box, not the ticked one', async () => {
  // Deliberately different from kai-radio-group, which focuses the selected radio
  // because a radio group is one tab stop. Every checkbox here is its own tab stop, so
  // the entry point is the top of the list.
  const el = await mount({ value: 'dev' });
  el.focus();
  expect(el.shadowRoot!.activeElement).toBe(boxes(el)[0]);
  el.remove();
});

test('kai-checkbox-group generates NO name when none is given', async () => {
  // The decision the primitive records, preserved here. A radio group needs a shared
  // name for browser exclusivity and gets a generated one; checkboxes do not, and a
  // generated name would submit the selection under a random key, which is worse than
  // submitting nothing.
  const el = await mount({ value: 'prod' });
  expect(boxes(el).map((b) => b.getAttribute('name'))).toEqual([null, null, null]);
  el.remove();
});

test('kai-checkbox-group name lands on every box, and the element is NOT form-associated', async () => {
  // Both halves matter. The name is on the inner inputs, so it is right the day form
  // association lands. Until then the boxes live in a shadow root, so a surrounding
  // form collects NOTHING from them: the same known gap kai-input records. Read
  // `el.values`.
  const form = document.createElement('form');
  document.body.appendChild(form);
  const el = document.createElement('kai-checkbox-group') as Group;
  el.setAttribute('name', 'env');
  form.appendChild(el);
  await settle();
  el.options = OPTIONS;
  await settle();

  expect(boxes(el).map((b) => b.getAttribute('name'))).toEqual(['env', 'env', 'env']);
  boxes(el)[0].click();
  boxes(el)[2].click();
  await settle();
  expect(el.values).toEqual(['prod', 'dev']);

  // A light-DOM control in the SAME form proves the read is not vacuous: FormData
  // works here, it just cannot see through the shadow boundary.
  const native = document.createElement('input');
  native.type = 'checkbox';
  native.name = 'env';
  native.value = 'light-dom';
  native.checked = true;
  form.appendChild(native);

  expect(new FormData(form).getAll('env')).toEqual(['light-dom']);
  form.remove();
});
