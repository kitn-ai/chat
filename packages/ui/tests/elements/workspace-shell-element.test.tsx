/**
 * `<kai-workspace>` — the chat-agnostic layout shell (spec §3a, the re-cast).
 *
 * Written test-first AGAINST THE OLD CHAT-PRESET FACADE, which these tests must
 * fail on: the old element renders a built-in thread + conversation rail and
 * knows nothing of the `start`/`end`/`header`/`footer` slots or the
 * `kai-aside-toggle` layout event. After the reshape this file is the coverage
 * credit for the `kai-workspace` tag (the old workspace-element.test.tsx dies
 * with the chat props; plan B3 names this file its replacement).
 *
 * Geometry (drag deltas, breakpoint reflow, drawer stacking) is the B4 Chromium
 * probes' job; here we assert the shadow structure the browser projects.
 */
import { expect, test, afterEach } from 'vitest';
import '../../src/elements/chat-workspace';

afterEach(() => { document.body.replaceChildren(); });

const flush = () => new Promise((r) => setTimeout(r, 0));

type ShellEl = HTMLElement & {
  toggleAside(side: 'start' | 'end'): void;
  collapseAside(side: 'start' | 'end'): void;
  expandAside(side: 'start' | 'end'): void;
} & Record<string, unknown>;

function slotted(name: string | null, tag: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  if (name) node.setAttribute('slot', name);
  node.textContent = text;
  return node;
}

async function mount(children: HTMLElement[] = [], setup?: (el: ShellEl) => void): Promise<ShellEl> {
  // Through unknown: the generated KaiWorkspaceElement type still describes the
  // old chat surface until the supervisor's build:api regen lands.
  const el = document.createElement('kai-workspace') as unknown as ShellEl;
  for (const child of children) el.appendChild(child);
  setup?.(el);
  document.body.appendChild(el);
  await flush();
  await flush();
  return el;
}

test('projects all five regions: header, start, main (named + default), end, footer', async () => {
  const el = await mount([
    slotted('header', 'nav', 'Top bar'),
    slotted('start', 'ul', 'Rail'),
    slotted('main', 'article', 'The app'),
    slotted('end', 'aside', 'Inspector'),
    slotted('footer', 'small', 'Legal'),
  ]);
  const root = el.shadowRoot!;
  for (const name of ['header', 'start', 'main', 'end', 'footer']) {
    expect(root.querySelector(`slot[name="${name}"]`), `slot ${name}`).not.toBeNull();
  }
  // Unnamed children project too: the default slot lives in the main region.
  expect(root.querySelector('slot:not([name])')).not.toBeNull();
});

test('omits the optional region wrappers when nothing is projected; main always renders', async () => {
  const el = await mount([slotted(null, 'article', 'Solo main')]);
  const root = el.shadowRoot!;
  for (const name of ['header', 'start', 'end', 'footer']) {
    expect(root.querySelector(`slot[name="${name}"]`), `no ${name}`).toBeNull();
  }
  expect(root.querySelector('slot:not([name])')).not.toBeNull();
  // Paired positive over the same harness: append a start child at runtime and
  // the region appears (childList-observed occupancy, not a mount-time snapshot).
  el.appendChild(slotted('start', 'ul', 'Late rail'));
  await flush();
  expect(root.querySelector('slot[name="start"]')).not.toBeNull();
});

test('the aside regions carry ::part hooks (start/end), and slotted content stays live', async () => {
  const rail = slotted('start', 'button', 'Rail action');
  let clicked = false;
  rail.addEventListener('click', () => (clicked = true));
  const el = await mount([rail, slotted(null, 'div', 'main')]);
  const root = el.shadowRoot!;
  expect(root.querySelector('[part~="start"]')).not.toBeNull();
  rail.click();
  expect(clicked).toBe(true);
});

test('collapse methods drive the aside and fire the kai-aside-toggle layout event', async () => {
  const el = await mount([slotted('start', 'ul', 'Rail'), slotted(null, 'div', 'main')]);
  const root = el.shadowRoot!;
  const toggles: { side: string; collapsed: boolean }[] = [];
  el.addEventListener('kai-aside-toggle', (e) => toggles.push((e as CustomEvent).detail));

  expect(root.querySelector('slot[name="start"]')).not.toBeNull();
  el.collapseAside('start');
  await flush();
  expect(root.querySelector('slot[name="start"]')).toBeNull();
  expect(toggles.at(-1)).toEqual({ side: 'start', collapsed: true });

  el.expandAside('start');
  await flush();
  expect(root.querySelector('slot[name="start"]')).not.toBeNull();
  expect(toggles.at(-1)).toEqual({ side: 'start', collapsed: false });
});

test('default-start-collapsed seeds the aside collapsed from plain HTML', async () => {
  const el = await mount([slotted('start', 'ul', 'Rail'), slotted(null, 'div', 'main')], (node) => {
    node.setAttribute('default-start-collapsed', '');
  });
  const root = el.shadowRoot!;
  expect(root.querySelector('slot[name="start"]')).toBeNull();
  el.toggleAside('start');
  await flush();
  expect(root.querySelector('slot[name="start"]')).not.toBeNull();
});

test('aside widths come from the CSS custom properties, not props', async () => {
  const el = await mount([slotted('start', 'ul', 'Rail'), slotted(null, 'div', 'main')], (node) => {
    node.style.setProperty('--kai-workspace-start-width', '333px');
  });
  const root = el.shadowRoot!;
  const aside = root.querySelector('[part~="start"]') as HTMLElement;
  expect(aside).not.toBeNull();
  expect(aside.style.flexBasis).toBe('333px');
});

test('the chat surface is GONE: no thread, no composer, no chat props observed', async () => {
  const el = await mount([slotted(null, 'div', 'main content')], (node) => {
    // A pre-re-cast consumer's chat props land on a surface that no longer
    // renders chat: nothing may appear, and nothing may throw.
    (node as Record<string, unknown>)['messages'] = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
    ];
    (node as Record<string, unknown>)['conversations'] = [
      { id: 'c1', title: 'First chat', scope: { type: 'document' }, messageCount: 1, lastMessageAt: '2026-06-13', updatedAt: '2026-06-13' },
    ];
  });
  const root = el.shadowRoot!;
  expect(root.querySelector('[data-kai-composer-editable]')).toBeNull();
  expect(root.textContent).not.toContain('Hi there');
  expect(root.textContent).not.toContain('First chat');
  // Paired positive: the same harness still projects its main content.
  expect(root.querySelector('slot:not([name])')).not.toBeNull();
});

test('a resize handle renders beside a present aside and none beside a collapsed one', async () => {
  const el = await mount([slotted('start', 'ul', 'Rail'), slotted(null, 'div', 'main')]);
  const root = el.shadowRoot!;
  expect(root.querySelectorAll('[role="separator"]').length).toBe(1);
  el.collapseAside('start');
  await flush();
  expect(root.querySelectorAll('[role="separator"]').length).toBe(0);
});
