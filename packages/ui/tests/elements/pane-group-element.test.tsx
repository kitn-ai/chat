/**
 * `<kai-pane-group>` — element-seam behavior: uncontrolled tab selection must
 * keep working after the facade's own `active`-attribute reflection.
 *
 * Exists because of the tracked-facade-body defect class (the kai-view-stack
 * bug, commit 6744a412): the facade seeds its internal selection signal from a
 * bare top-level `props.active` read, and it reflects the resolved active id to
 * the `active` ATTRIBUTE. Under define.tsx's old tracked invocation, the very
 * first reflect write (undefined → first tab id) flowed back through
 * attributeChangedCallback into `props.active`, re-ran the whole facade body,
 * and left the element permanently controlled by its own reflected attribute —
 * every subsequent select() dead on arrival. Written failing-first against that
 * code (both "switches" tests red); green once define.tsx untracks facade
 * bodies.
 *
 * CONVENTIONS (view-stack-element.test.tsx): real custom elements, macrotask
 * flush for upgrade + effects.
 */
import { afterEach, describe, expect, test } from 'vitest';
import '../../src/elements/pane-group';
import type { PaneTab } from '../../src/ui/pane-group';

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

type PaneGroupEl = HTMLElement & {
  tabs?: PaneTab[];
  active?: string;
  select: (id: string) => void;
};

const TABS: PaneTab[] = [
  { id: 'atlas', name: 'Atlas' },
  { id: 'otto', name: 'Otto' },
  { id: 'wisp', name: 'Wisp' },
];

async function mount(attrs: Record<string, string> = {}): Promise<{
  el: PaneGroupEl;
  events: string[];
}> {
  const el = document.createElement('kai-pane-group') as PaneGroupEl;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.tabs = TABS;
  const events: string[] = [];
  el.addEventListener('kai-tab-change', (e) => events.push((e as CustomEvent<{ id: string }>).detail.id));
  document.body.appendChild(el);
  await flush();
  return { el, events };
}

describe('<kai-pane-group> uncontrolled selection', () => {
  test('boots on the first tab and reflects it to the active attribute', async () => {
    const { el } = await mount();
    expect(el.getAttribute('active')).toBe('atlas');
  });

  test('select() switches tabs after the boot reflection (the tracked-facade loop)', async () => {
    const { el, events } = await mount();
    el.select('otto');
    await flush();
    expect(events).toEqual(['otto']);
    expect(el.getAttribute('active')).toBe('otto');
  });

  test('select() keeps working across successive switches', async () => {
    const { el, events } = await mount();
    el.select('otto');
    await flush();
    el.select('wisp');
    await flush();
    expect(events).toEqual(['otto', 'wisp']);
    expect(el.getAttribute('active')).toBe('wisp');
  });

  test('a controlled active attribute still wins over internal selection', async () => {
    const { el } = await mount({ active: 'otto' });
    expect(el.getAttribute('active')).toBe('otto');
    el.setAttribute('active', 'wisp');
    await flush();
    expect(el.getAttribute('active')).toBe('wisp');
  });
});
