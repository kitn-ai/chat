/**
 * `<kai-dropdown>` — the trigger + consumer-slotted menu surface.
 *
 * The sibling of `<kai-menu>`, split by who owns the body: `kai-menu` renders a
 * JSON `items` tree, this one projects arbitrary slotted markup into the same
 * `DropdownContent` surface. It exists because the generated React wrapper had no
 * `Dropdown` at all, so a React consumer had to import the SOLID component with an
 * alias cast and mount-gate it.
 *
 * CONVENTIONS FOLLOWED. Assertions run against the real custom element rather than
 * the Solid component (`semantic-state.aria.test.tsx`'s reasoning), and every
 * negative assertion is paired with a positive one over the SAME harness
 * (`reactivity-contract.test.tsx`'s rule) — a menu that projects nothing because it
 * never opened would otherwise pass a "no stale items" test vacuously.
 *
 * ★ THE MENU IS PORTALED, which is why the projection group below is not
 * ceremonial. `DropdownContent` renders through `<Portal mount={config.portalMount()}>`,
 * and `define.tsx` points that mount at a `<div>` INSIDE the shadow root — so a
 * `<slot>` in the portaled surface is still in the shadow tree and still projects.
 * Had the portal gone to `document.body` (Solid's default when the mount is
 * undefined) the slot would be an inert unknown element in the light DOM and every
 * slotted row would silently vanish. That is asserted, not assumed.
 */
import { flush as flushSync } from 'solid-js';
import { afterEach, describe, expect, test } from 'vitest';
import '../../src/elements/dropdown';

/**
 * Past a macrotask, not just a microtask: the facade's reflections land in
 * `attributeChangedCallback`, a task later than the Solid effect that wrote them.
 * A bare `await Promise.resolve()` reads before them and passes vacuously.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

type Drop = HTMLElement & Record<string, unknown> & {
  show(): void; hide(): void; toggle(): void;
};

async function mount(html = '', attrs: Record<string, string> = {}): Promise<Drop> {
  const el = document.createElement('kai-dropdown') as Drop;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (html) el.innerHTML = html;
  document.body.appendChild(el);
  await flush();
  return el;
}

const root = (el: Drop) => el.shadowRoot!;
const menuOf = (el: Drop) => root(el).querySelector<HTMLElement>('[role="menu"]');
const triggerOf = (el: Drop) => root(el).querySelector<HTMLElement>('[aria-haspopup="menu"]');

const ROWS = `
  <div role="menuitem" tabindex="-1" id="rename">Rename</div>
  <div role="menuitem" tabindex="-1" id="duplicate">Duplicate</div>
  <div role="menuitem" tabindex="-1" id="delete">Delete</div>
`;

describe('kai-dropdown', () => {
  test('registers and renders an accessible trigger', async () => {
    const el = await mount('', { label: 'Row actions' });
    expect(customElements.get('kai-dropdown')).toBeTruthy();

    const trigger = triggerOf(el);
    expect(trigger, 'the trigger renders in the shadow root').toBeTruthy();
    expect(trigger!.getAttribute('aria-expanded')).toBe('false');
    expect(trigger!.getAttribute('aria-label')).toBe('Row actions');
  });

  test('a visible triggerLabel is the name, and `label` does not override it (WCAG 2.5.3)', async () => {
    // The paired case: with no visible text, `label` DOES name the trigger.
    const named = await mount('', { label: 'Row actions' });
    expect(triggerOf(named)!.getAttribute('aria-label')).toBe('Row actions');

    const visible = await mount('', { 'trigger-label': 'High', label: 'Reasoning effort' });
    expect(
      triggerOf(visible)!.getAttribute('aria-label'),
      'aria-label REPLACES the computed name; a trigger reading "High" that answers only to '
      + '"Reasoning effort" locks speech-input users out',
    ).toBe(null);
    expect(triggerOf(visible)!.textContent).toContain('High');
  });

  describe('projection through the portaled surface', () => {
    test('the menu is closed, and projects nothing, until it opens', async () => {
      const el = await mount(ROWS);
      // The positive half lives in the next test over the same harness — without it
      // "no menu" here would pass for an element that never renders at all.
      expect(menuOf(el)).toBe(null);
    });

    test('slotted rows project into the portaled menu once open', async () => {
      const el = await mount(ROWS, { 'default-open': '' });

      const menu = menuOf(el);
      expect(menu, 'the menu surface renders when open').toBeTruthy();

      // The portal target must be INSIDE the shadow root, or the slot below is inert.
      expect(
        root(el).contains(menu!),
        'the portaled menu must live inside the shadow root, or its <slot> projects nothing',
      ).toBe(true);

      const slot = menu!.querySelector('slot');
      expect(slot, 'the menu body is a default slot').toBeTruthy();
      const assigned = (slot as HTMLSlotElement).assignedElements();
      expect(assigned.map((n) => n.id)).toEqual(['rename', 'duplicate', 'delete']);
    });
  });

  describe('the disclosure surface (open / defaultOpen / disabled / methods)', () => {
    test('defaultOpen seeds it open; hide() closes and fires kai-open-change', async () => {
      const el = await mount(ROWS, { 'default-open': '' });
      expect(menuOf(el)).toBeTruthy();

      const seen: boolean[] = [];
      el.addEventListener('kai-open-change', (e) => seen.push((e as CustomEvent).detail.open));

      el.hide();
      await flush();
      expect(menuOf(el)).toBe(null);
      expect(seen, 'one event per change, non-bubbling, on the element itself').toEqual([false]);
    });

    test('el.open = true opens it, reflects to the attribute, and reads back', async () => {
      const el = await mount(ROWS);
      expect(menuOf(el)).toBe(null);

      el.open = true;
      await flush();
      expect(menuOf(el), 'setting the property opens it').toBeTruthy();
      expect(el.hasAttribute('open'), 'open reflects to the host attribute').toBe(true);
      expect(el.open, 'and reads back (the G-05 read-back contract)').toBe(true);
    });

    test('disabled gates opening, by click and by show()', async () => {
      const el = await mount(ROWS, { disabled: '' });

      el.show();
      await flush();
      expect(menuOf(el), 'show() is a no-op while disabled').toBe(null);

      triggerOf(el)!.click();
      flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
      await flush();
      expect(menuOf(el), 'the trigger is inert while disabled').toBe(null);

      // The paired positive over the SAME harness: drop `disabled` and it opens.
      el.removeAttribute('disabled');
      el.disabled = false;
      await flush();
      el.show();
      await flush();
      expect(menuOf(el), 'and opens once disabled is lifted').toBeTruthy();
    });

    test('toggle() flips it both ways', async () => {
      const el = await mount(ROWS);
      el.toggle();
      await flush();
      expect(menuOf(el)).toBeTruthy();
      el.toggle();
      await flush();
      expect(menuOf(el)).toBe(null);
    });
  });

  /**
   * ★ ROVING FOCUS OVER SLOTTED ROWS.
   *
   * This group was written RED against `menu.querySelectorAll(ITEM_SELECTOR)`, which
   * finds none of the light-DOM nodes a `<slot>` projects, and went green with the
   * flat-tree `menuItems()` walk in `../../src/ui/dropdown.tsx` (same class as
   * `hasFocusableChild` in `ui/hover-card.tsx`).
   *
   * Sequential navigation is the half that needed the SECOND fix and is the one worth
   * guarding: finding the items is not enough if `currentIndex()` cannot tell which
   * one has focus. A slotted row lives in the light DOM, so the menu's shadow root
   * reports `activeElement === null` while it is focused, and asking only that root
   * pins every index at -1. Every test below that moves focus TWICE is what catches a
   * regression to shadow-root-only resolution; a single ArrowDown would pass either way.
   */
  describe('roving focus over SLOTTED rows', () => {
    /**
     * `composed: true` is REQUIRED and is not ceremony. Solid delegates `onKeyDown` to
     * a document-level listener, and a `bubbles`-only event stops dead at the shadow
     * boundary, so the handler never runs and every assertion below fails for a reason
     * that has nothing to do with the code under test. Real key events are composed.
     */
    const keydown = (el: Drop, key: string) => {
      menuOf(el)!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
      flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
      return flush();
    };
    const row = (el: Drop, id: string) => el.querySelector<HTMLElement>(`#${id}`)!;

    test('ArrowDown moves focus onto the first slotted row', async () => {
      const el = await mount(ROWS, { 'default-open': '' });
      await keydown(el, 'ArrowDown');
      expect(document.activeElement).toBe(row(el, 'rename'));
    });

    test('ArrowDown ADVANCES through the rows and wraps', async () => {
      const el = await mount(ROWS, { 'default-open': '' });
      for (const id of ['rename', 'duplicate', 'delete']) {
        await keydown(el, 'ArrowDown');
        expect(document.activeElement, `after ArrowDown to ${id}`).toBe(row(el, id));
      }
      await keydown(el, 'ArrowDown');
      expect(document.activeElement, 'wraps back to the first').toBe(row(el, 'rename'));
    });

    test('ArrowUp walks backwards from the current row', async () => {
      const el = await mount(ROWS, { 'default-open': '' });
      await keydown(el, 'ArrowDown');
      await keydown(el, 'ArrowDown');
      expect(document.activeElement).toBe(row(el, 'duplicate'));
      await keydown(el, 'ArrowUp');
      expect(document.activeElement, 'back to the previous row, not to the top').toBe(row(el, 'rename'));
    });

    test('Home and End jump to the ends', async () => {
      const el = await mount(ROWS, { 'default-open': '' });
      await keydown(el, 'End');
      expect(document.activeElement).toBe(row(el, 'delete'));
      await keydown(el, 'Home');
      expect(document.activeElement).toBe(row(el, 'rename'));
    });

    test('typeahead matches slotted row text, and advances past the current match', async () => {
      const el = await mount(ROWS, { 'default-open': '' });
      await keydown(el, 'd');
      expect(document.activeElement, 'first row starting with d').toBe(row(el, 'duplicate'));
      await keydown(el, 'd');
      expect(document.activeElement, 'the NEXT d, not the same one again').toBe(row(el, 'delete'));
    });

    test('a disabled slotted row is skipped', async () => {
      const el = await mount(`
        <div role="menuitem" tabindex="-1" id="rename">Rename</div>
        <div role="menuitem" tabindex="-1" id="locked" aria-disabled="true">Locked</div>
        <div role="menuitem" tabindex="-1" id="delete">Delete</div>
      `, { 'default-open': '' });
      await keydown(el, 'ArrowDown');
      expect(document.activeElement).toBe(row(el, 'rename'));
      await keydown(el, 'ArrowDown');
      expect(document.activeElement, 'aria-disabled rows are out of the roving set').toBe(row(el, 'delete'));
    });

    test('rows nested inside a slotted wrapper are still found, in order', async () => {
      // The walk descends through slotted subtrees, so a consumer grouping rows in a
      // <div> (a React fragment wrapper, most likely) is not silently inert.
      const el = await mount(`
        <div id="group">
          <div role="menuitem" tabindex="-1" id="rename">Rename</div>
          <div role="menuitem" tabindex="-1" id="delete">Delete</div>
        </div>
      `, { 'default-open': '' });
      await keydown(el, 'ArrowDown');
      expect(document.activeElement).toBe(row(el, 'rename'));
      await keydown(el, 'ArrowDown');
      expect(document.activeElement).toBe(row(el, 'delete'));
    });
  });
});
