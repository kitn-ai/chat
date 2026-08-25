// tests/elements/resizable-element.test.tsx
import { flush as flushSync } from 'solid-js';
import '../../src/elements/resizable';
import type { KaiMaximizeIntentDetail, KaiMaximizeStateDetail } from '../../src/elements/resizable';

// jsdom has no layout, so we only assert DOM structure, attributes and events
// here. Drag, keyboard and visual layout are verified via Playwright.

/** Build a <kai-resizable> with N <kai-resizable-item> children. */
function makeGroup(items: Array<Record<string, string>>, attrs: Record<string, string> = {}) {
  const group = document.createElement('kai-resizable') as HTMLElement;
  for (const [k, v] of Object.entries(attrs)) group.setAttribute(k, v);
  for (const it of items) {
    const item = document.createElement('kai-resizable-item');
    for (const [k, v] of Object.entries(it)) item.setAttribute(k, v);
    item.textContent = 'content';
    group.appendChild(item);
  }
  document.body.appendChild(group);
  return group;
}

/** Let the MutationObserver / microtasks flush. */
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.querySelectorAll('kai-resizable').forEach((e) => e.remove());
});

test('both kai-resizable and kai-resizable-item register', () => {
  expect(customElements.get('kai-resizable')).toBeTruthy();
  expect(customElements.get('kai-resizable-item')).toBeTruthy();
});

test('N visible items render N-1 handles in the shadow root', async () => {
  const group = makeGroup([{}, {}, {}]);
  await flush();
  const handles = group.shadowRoot!.querySelectorAll('[role="separator"]');
  expect(handles.length).toBe(2);
  const panels = group.shadowRoot!.querySelectorAll('[data-panel]');
  expect(panels.length).toBe(3);
});

test('a hidden item drops a handle and its panel', async () => {
  const group = makeGroup([{}, { hidden: '' }, {}]);
  await flush();
  const handles = group.shadowRoot!.querySelectorAll('[role="separator"]');
  expect(handles.length).toBe(1); // 2 visible → 1 handle
  const panels = group.shadowRoot!.querySelectorAll('[data-panel]');
  expect(panels.length).toBe(2);
});

test('size/min/max are reflected onto the panel data-* and flex-basis', async () => {
  const group = makeGroup([{ size: '280px', min: '100px', max: '400px' }, { size: '25%' }]);
  await flush();
  const panels = group.shadowRoot!.querySelectorAll<HTMLElement>('[data-panel]');
  expect(panels[0].style.flexBasis).toBe('280px');
  expect(panels[0].dataset.minSize).toBe('100');
  expect(panels[0].dataset.maxSize).toBe('400');
  expect(panels[1].style.flexBasis).toBe('25%');
});

test('a locked neighbor makes the adjacent handle non-interactive (data-static, no tabindex)', async () => {
  const group = makeGroup([{ locked: '' }, {}]);
  await flush();
  const handle = group.shadowRoot!.querySelector('[role="separator"]')! as HTMLElement;
  expect(handle.hasAttribute('data-static')).toBe(true);
  expect(handle.hasAttribute('tabindex')).toBe(false);
});

test('an unlocked pair yields a focusable handle (tabindex=0, no data-static)', async () => {
  const group = makeGroup([{}, {}]);
  await flush();
  const handle = group.shadowRoot!.querySelector('[role="separator"]')! as HTMLElement;
  expect(handle.hasAttribute('data-static')).toBe(false);
  expect(handle.getAttribute('tabindex')).toBe('0');
});

test('change CustomEvent fires when sizes change programmatically (visibility toggle)', async () => {
  const group = makeGroup([{}, {}, {}]);
  await flush();
  let detail: { sizes: number[] } | null = null;
  group.addEventListener('kai-change', (e) => (detail = (e as CustomEvent).detail));
  // Hide the middle item — a visibility change should re-layout and emit change.
  group.children[1].setAttribute('hidden', '');
  await flush();
  expect(detail).not.toBeNull();
  expect(Array.isArray(detail!.sizes)).toBe(true);
});

test('more than 3 items: extras are ignored (max 3 panels)', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const group = makeGroup([{}, {}, {}, {}]);
  await flush();
  const panels = group.shadowRoot!.querySelectorAll('[data-panel]');
  expect(panels.length).toBe(3);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test('kai-resizable-item renders its slotted light content via a default slot', async () => {
  const item = document.createElement('kai-resizable-item');
  document.body.appendChild(item);
  await flush();
  expect(item.shadowRoot!.querySelector('slot')).toBeTruthy();
  item.remove();
});

test('exports the maximize protocol detail types (compile-time shape check)', () => {
  const intent: KaiMaximizeIntentDetail = { requested: true };
  const state: KaiMaximizeStateDetail = { maximized: false };
  expect(intent.requested).toBe(true);
  expect(state.maximized).toBe(false);
});

// --- Task 2: maximize/restore core ---

function intentFrom(item: Element, requested: boolean) {
  item.dispatchEvent(new CustomEvent('kai-maximize-intent', { detail: { requested }, bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
}

test('maximize hides siblings, clears the maximized item size/locked, reflects data-maximized', async () => {
  const group = makeGroup([{ size: '25%' }, { size: '50%', locked: '' }, { size: '25%' }]);
  await flush();
  intentFrom(group.children[1], true);
  await flush();
  const items = Array.from(group.children) as HTMLElement[];
  expect(items[0].hasAttribute('hidden')).toBe(true);
  expect(items[2].hasAttribute('hidden')).toBe(true);
  expect(items[1].hasAttribute('hidden')).toBe(false);
  expect(items[1].hasAttribute('locked')).toBe(false); // cleared so it fills
  expect(group.hasAttribute('data-maximized')).toBe(true);
});

test('restore returns each item to its stashed size/hidden/locked', async () => {
  const group = makeGroup([{ size: '25%' }, { size: '50%', locked: '' }, { hidden: '', size: '25%' }]);
  await flush();
  intentFrom(group.children[1], true);
  await flush();
  intentFrom(group.children[1], false);
  await flush();
  const items = Array.from(group.children) as HTMLElement[];
  // item[1] regains its locked attr; item[2] was already hidden pre-maximize → stays hidden.
  expect(items[1].hasAttribute('locked')).toBe(true);
  expect(items[2].hasAttribute('hidden')).toBe(true);
  expect(items[0].hasAttribute('hidden')).toBe(false);
  expect(group.hasAttribute('data-maximized')).toBe(false);
});

test('intent from outside any item is ignored', async () => {
  const group = makeGroup([{}, {}]);
  await flush();
  group.dispatchEvent(new CustomEvent('kai-maximize-intent', { detail: { requested: true }, bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();
  expect(group.hasAttribute('data-maximized')).toBe(false);
});

// --- Task 3: maximizedIndex prop + maximize/restore host methods + maximizechange ---

test('maximize(i) / restore() host methods drive the layout + maximizechange', async () => {
  const group = makeGroup([{}, {}, {}]) as HTMLElement & { maximize(i: number): void; restore(): void; maximizedIndex: number | null };
  await flush();
  const events: { maximized: boolean; index: number | null }[] = [];
  group.addEventListener('kai-maximize-change', (e) => events.push((e as CustomEvent).detail));
  group.maximize(2);
  await flush();
  expect(group.children[0].hasAttribute('hidden')).toBe(true);
  expect(events.at(-1)).toEqual({ maximized: true, index: 2 });
  group.restore();
  await flush();
  expect(group.children[0].hasAttribute('hidden')).toBe(false);
  expect(events.at(-1)).toEqual({ maximized: false, index: null });
});

test('setting maximizedIndex maximizes; setting it null restores', async () => {
  const group = makeGroup([{}, {}]) as HTMLElement & { maximizedIndex: number | null };
  await flush();
  group.maximizedIndex = 0;
  await flush();
  expect(group.children[1].hasAttribute('hidden')).toBe(true);
  group.maximizedIndex = null;
  await flush();
  expect(group.children[1].hasAttribute('hidden')).toBe(false);
});

test('re-target: maximizing a different item while maximized restores+re-maximizes', async () => {
  const group = makeGroup([{}, {}, {}]) as HTMLElement & { maximize(i: number): void };
  await flush();
  group.maximize(0);
  await flush();
  group.maximize(2);
  await flush();
  expect(group.children[0].hasAttribute('hidden')).toBe(true);
  expect(group.children[2].hasAttribute('hidden')).toBe(false);
});

// --- Task 4: Escape-to-restore, auto-restore on removal, nested stopPropagation ---

test('Escape while maximized restores (and is a no-op otherwise)', async () => {
  const group = makeGroup([{}, {}]) as HTMLElement & { maximize(i: number): void };
  await flush();
  group.maximize(0);
  await flush();
  group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();
  expect(group.children[1].hasAttribute('hidden')).toBe(false);
  expect(group.hasAttribute('data-maximized')).toBe(false);
  // Escape again is a harmless no-op.
  group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();
  expect(group.hasAttribute('data-maximized')).toBe(false);
});

test('removing the maximized item auto-restores (no empty container)', async () => {
  const group = makeGroup([{}, {}, {}]) as HTMLElement & { maximize(i: number): void };
  await flush();
  group.maximize(1);
  await flush();
  group.children[1].remove();
  await flush();
  expect(group.hasAttribute('data-maximized')).toBe(false);
  expect(group.querySelectorAll('kai-resizable-item').length).toBe(2);
});

test('nested group stops the intent (outer group never maximizes)', async () => {
  const outer = makeGroup([{}, {}]);
  // Put an inner group inside the first outer item.
  const inner = document.createElement('kai-resizable');
  const innerItem = document.createElement('kai-resizable-item');
  inner.appendChild(innerItem);
  const leaf = document.createElement('kai-resizable-item');
  leaf.appendChild(inner);
  outer.replaceChild(leaf, outer.children[0]);
  await flush();
  innerItem.dispatchEvent(new CustomEvent('kai-maximize-intent', { detail: { requested: true }, bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();
  expect(inner.hasAttribute('data-maximized')).toBe(true);
  expect(outer.hasAttribute('data-maximized')).toBe(false);
});

// --- Fix #1 regression: element-keyed stash (index-drift when sibling removed) ---

test('restore after sibling removal re-applies each item its OWN saved state (no index-drift)', async () => {
  // 3-item group with DISTINCT sizes so a positional mis-assignment is detectable.
  const group = makeGroup([
    { size: '20%' },   // A — index 0
    { size: '50%' },   // B — index 1 (will be maximized)
    { size: '30%' },   // C — index 2
  ]) as HTMLElement & { restore(): void };
  await flush();

  const [a, b, c] = Array.from(group.children) as HTMLElement[];

  // Maximize B (index 1).
  intentFrom(b, true);
  await flush();

  // Remove A while maximized — this shifts C from index 2 → index 1.
  a.remove();
  await flush();

  // Restore should apply B's own stash to B and C's own stash to C.
  intentFrom(b, false);
  await flush();

  // B is still in the group and should have its own stash (size='50%', not hidden, not locked).
  expect(b.getAttribute('size')).toBe('50%');
  expect(b.hasAttribute('hidden')).toBe(false);

  // C must have its own size restored ('30%'), NOT B's ('50%').
  expect(c.getAttribute('size')).toBe('30%');
  expect(c.hasAttribute('hidden')).toBe(false);

  // The group must no longer be in maximized state.
  expect(group.hasAttribute('data-maximized')).toBe(false);
});

// --- Task 5: change-storm guard (one change per maximize/restore) ---

test('maximize and restore each emit exactly one change (no storm)', async () => {
  const group = makeGroup([{}, {}, {}]) as HTMLElement & { maximize(i: number): void; restore(): void };
  await flush();
  let count = 0;
  group.addEventListener('kai-change', () => count++);
  group.maximize(1);
  await flush();
  const afterMax = count;
  group.restore();
  await flush();
  const afterRestore = count - afterMax;
  expect(afterMax).toBe(1);     // one relayout for the maximize
  expect(afterRestore).toBe(1); // one relayout for the restore
});
