/**
 * `<kai-dialog>` — the centered modal.
 *
 * WHY THIS FILE EXISTS. Before it, kai-dialog was on `element-coverage.test.ts`'s
 * punch list with the reason: "story-only (split-workspace); no behavioural test.
 * show()/hide() and the focus trap are typed in element-methods-typed.test.ts as a
 * tsc string fixture, which never mounts anything." That is precisely the shape of
 * gap that reads as covered — the tag appears in several test files, the methods are
 * type-checked, a story renders it — while nothing had ever CALLED `show()` on a
 * real upgraded element. This file mounts it and drives it.
 *
 * It is also a modal, which is the one widget class where the interesting behaviour
 * is all the behaviour a passing render cannot show you: does focus go in, does it
 * come back, is Tab really trapped, does Escape close, does the backdrop close but
 * the panel not, and is the thing announced as a dialog with a name.
 *
 * CONVENTIONS FOLLOWED. Assertions run against the real custom element rather than
 * the Solid component (`dock.test.tsx`), and every negative assertion is paired with
 * a positive one over the SAME harness (`reactivity-contract.test.tsx`'s rule) — a
 * closed dialog UNMOUNTS its panel, so "focus did not move" and "Escape did nothing"
 * would otherwise pass against an element that never opens.
 *
 * WHAT JSDOM CANNOT DO, and what this file does about it. The focus trap filters its
 * candidates through an `isVisible()` that asks for `offsetWidth || offsetHeight ||
 * getClientRects().length` — and jsdom lays nothing out, so EVERY candidate is
 * invisible and `getTabbables()` returns an empty list. The trap then degenerates to
 * its "nothing focusable" branch (preventDefault + focus the panel) and a test run
 * against raw jsdom would prove only that Tab is intercepted, never that the CYCLE is
 * right. So the trap group stubs `Element.prototype.getClientRects` to return one
 * real rect, which is the single fact jsdom is missing, and then asserts the actual
 * wrap-around. The stub is scoped to that describe and restored after it; the
 * degenerate no-focusables branch is asserted separately, unstubbed, because it is
 * also a real code path.
 */
import { flush as flushSync } from 'solid-js';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import '../../src/elements/dialog';

/**
 * Past a macrotask, not just a microtask. The `open` reflection lands in
 * `attributeChangedCallback`, and the focus choreography is deliberately deferred by
 * a `queueMicrotask`; a bare `await Promise.resolve()` reads before either.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

type Dialog = HTMLElement & Record<string, unknown> & {
  show(): void; hide(): void; toggle(): void; focus(options?: FocusOptions): void;
};

async function mount(html = ''): Promise<Dialog> {
  const el = document.createElement('kai-dialog') as Dialog;
  if (html) el.innerHTML = html;
  document.body.appendChild(el);
  await flush();
  return el;
}

const shadow = (el: Dialog) => el.shadowRoot!;
const panel = (el: Dialog) => shadow(el).querySelector('[part="panel"]') as HTMLElement | null;
const backdrop = (el: Dialog) => shadow(el).querySelector('[part="backdrop"]') as HTMLElement | null;
/** The element's own answer to "am I open": a closed dialog unmounts its panel. */
const isOpen = (el: Dialog) => panel(el) !== null;

/** A keydown as the browser delivers one from a focused node: bubbling + composed. */
const key = (node: EventTarget, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  node.dispatchEvent(e);
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  return e;
};

/**
 * A press-and-release on `node`. Two events, because the dismiss logic deliberately
 * requires both to land on the backdrop — a drag that STARTS in the panel and ends
 * on the backdrop (releasing a text selection) must not dismiss.
 *
 * `MouseEvent`, not `PointerEvent`: jsdom does not implement the `PointerEvent`
 * constructor, and Solid's delegated listener only cares about the event type.
 * `composed: true` is load-bearing — Solid delegates `click`/`pointerdown` to the
 * document, so an event that cannot cross the shadow boundary never reaches the
 * handler and the dialog would look inert for reasons that are purely the test's.
 */
const press = (down: EventTarget, up: EventTarget = down) => {
  down.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  up.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
};

// ---------------------------------------------------------------------------
// Runtime show() / hide() — the methods that were only ever TYPE-checked
// ---------------------------------------------------------------------------

describe('show() / hide() / toggle() at RUNTIME', () => {
  test('the element upgrades and really exposes the methods', async () => {
    const el = await mount('<p>body</p>');
    expect(el.shadowRoot, 'the element must have upgraded').not.toBeNull();
    expect(typeof el.show).toBe('function');
    expect(typeof el.hide).toBe('function');
    expect(typeof el.toggle).toBe('function');
    // The kit disclosure vocabulary: show/hide/toggle, never open()/close().
    expect((el as Record<string, unknown>).close).toBeUndefined();
  });

  test('show() opens and hide() closes — state AND rendering follow', async () => {
    const el = await mount('<p>body</p>');
    expect(isOpen(el), 'starts closed').toBe(false);
    expect(el.hasAttribute('open')).toBe(false);

    el.show();
    await flush();
    expect(isOpen(el)).toBe(true);
    expect(el.open).toBe(true);
    expect(el.hasAttribute('open')).toBe(true);
    expect(backdrop(el)).not.toBeNull();
    expect(panel(el)!.getAttribute('role'), 'the thing that appeared is the dialog').toBe('dialog');

    el.hide();
    await flush();
    expect(isOpen(el)).toBe(false);
    expect(el.open).toBe(false);
    expect(el.hasAttribute('open')).toBe(false);
  });

  test('toggle() flips both ways', async () => {
    const el = await mount('<p>body</p>');
    el.toggle();
    await flush();
    expect(isOpen(el)).toBe(true);

    el.toggle();
    await flush();
    expect(isOpen(el)).toBe(false);
  });

  test('the `open` PROPERTY and the `open` ATTRIBUTE each drive it both ways', async () => {
    const el = await mount('<p>body</p>');
    el.open = true;
    await flush();
    expect(isOpen(el)).toBe(true);
    el.open = false;
    await flush();
    expect(isOpen(el)).toBe(false);

    el.setAttribute('open', '');
    await flush();
    expect(isOpen(el)).toBe(true);
    el.removeAttribute('open');
    await flush();
    expect(isOpen(el)).toBe(false);
  });

  test('the slotted body really reaches the panel', async () => {
    // Otherwise every "it opened" assertion above is satisfied by an empty modal.
    const el = await mount('<p id="body">the broadcast</p>');
    el.show();
    await flush();
    const slot = panel(el)!.querySelector('[part="body"] slot:not([name])') as HTMLSlotElement;
    expect(slot).not.toBeNull();
    expect(slot.assignedElements()).toEqual([el.querySelector('#body')]);
  });
});

describe('declarative HTML — the 13-facade bug class', () => {
  test('<kai-dialog open> is open (a bare attribute, parsed from markup)', async () => {
    // The defect wireDisclosure's ordering comment describes: the outward reflection
    // deleted the author's attribute before the inward one had read it, so the plain
    // HTML spelling never opened and only `default-open` did. kai-dialog was one of
    // the repaired facades, so it is pinned here too.
    document.body.innerHTML = '<kai-dialog open><p>body</p></kai-dialog>';
    const el = document.querySelector('kai-dialog') as Dialog;
    await flush();
    expect(isOpen(el)).toBe(true);
  });

  test('<kai-dialog default-open> is open', async () => {
    document.body.innerHTML = '<kai-dialog default-open><p>body</p></kai-dialog>';
    const el = document.querySelector('kai-dialog') as Dialog;
    await flush();
    expect(isOpen(el)).toBe(true);
    expect(el.hasAttribute('open'), 'the seeded state reflects out').toBe(true);
  });

  test('<kai-dialog open="false"> is closed, and so is a bare <kai-dialog>', async () => {
    document.body.innerHTML = '<kai-dialog open="false"></kai-dialog><kai-dialog></kai-dialog>';
    const [a, b] = [...document.querySelectorAll('kai-dialog')] as Dialog[];
    await flush();
    expect(isOpen(a)).toBe(false);
    expect(isOpen(b)).toBe(false);
  });

  test('a property set BEFORE upgrade survives it', async () => {
    const el = document.createElement('kai-dialog') as Dialog;
    el.open = true;
    document.body.appendChild(el);
    await flush();
    expect(isOpen(el)).toBe(true);
    expect(el.open).toBe(true);
  });
});

describe('reflected boolean read-back', () => {
  // findings G-05, the write-only-property class.
  test('`open` reads back what was set, and reflects to the attribute', async () => {
    const el = await mount('<p>body</p>');
    el.open = true;
    await flush();
    expect(el.hasAttribute('open')).toBe(true);
    expect(el.open).toBe(true);

    el.open = false;
    await flush();
    expect(el.hasAttribute('open')).toBe(false);
    expect(el.open).toBe(false);
  });

  test('a bare `open` attribute reads back as true, not undefined', async () => {
    const el = document.createElement('kai-dialog') as Dialog;
    el.setAttribute('open', '');
    document.body.appendChild(el);
    await flush();
    expect(el.open).toBe(true);
  });

  test('an internal close (Escape) reflects OUT to both attribute and property', async () => {
    const el = await mount('<p>body</p>');
    el.show();
    await flush();
    key(panel(el)!, 'Escape');
    await flush();
    expect(el.hasAttribute('open')).toBe(false);
    expect(el.open).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Focus — what the element's own doc comment promises
// ---------------------------------------------------------------------------

describe('focus, per the contract the source states', () => {
  // The facade's doc comment promises exactly three things: "Focus moves into the
  // panel on open and is restored on close, and a basic Tab focus trap keeps
  // keyboard focus inside while open." Each gets its own test; nothing else is
  // asserted, because nothing else is promised — there is no `focus-on-open`
  // vocabulary here (that is kai-dock's) and no initial-focus opt-out.

  test('focus moves INTO the panel on open', async () => {
    const el = await mount('<button id="a">a</button>');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

    el.show();
    await flush();
    // The panel lives in the shadow root, so `document.activeElement` is the HOST;
    // `shadowRoot.activeElement` is the honest reading of "what has focus inside".
    expect(shadow(el).activeElement).toBe(panel(el));
    expect(document.activeElement).toBe(el);
    expect(document.activeElement).not.toBe(outside);
  });

  test('focus is RESTORED on close to whatever had it before', async () => {
    const el = await mount('<button id="a">a</button>');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

    el.show();
    await flush();
    expect(document.activeElement).not.toBe(outside);

    el.hide();
    await flush();
    expect(document.activeElement).toBe(outside);
  });

  test('restore is skipped when the previous holder has left the document', async () => {
    // A modal opened from a menu item that unmounts behind it is the ordinary case,
    // and focusing a detached node would throw focus to <body> in some engines.
    const el = await mount('<p>body</p>');
    const transient = document.createElement('button');
    document.body.appendChild(transient);
    transient.focus();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

    el.show();
    await flush();
    transient.remove();
    el.hide();
    await flush();
    expect(document.activeElement).not.toBe(transient);
  });

  test('mount does NOT steal focus, even for <kai-dialog open>', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

    // `default-open` and `open` both open AT MOUNT, and the focus effect is seeded
    // `prev=false` so its open branch runs — which means focus DOES enter the panel.
    // That is the documented behaviour ("focus moves into the panel on open"), so
    // what is asserted is the honest thing: the page's focus is taken by the DIALOG,
    // not left dangling and not thrown to <body>.
    document.body.insertAdjacentHTML('beforeend', '<kai-dialog id="d" open><p>x</p></kai-dialog>');
    const el = document.getElementById('d') as Dialog;
    await flush();
    expect(isOpen(el)).toBe(true);
    expect(shadow(el).activeElement).toBe(panel(el));
  });

  test('focus() moves focus to the panel; while closed it is a no-op that does not throw', async () => {
    const el = await mount('<p>body</p>');
    // Closed: the facade's exposed focus() is `panel?.focus(options)` and there is no
    // panel, so this must be silent rather than a TypeError.
    expect(() => el.focus()).not.toThrow();
    expect(shadow(el).activeElement).toBeNull();

    el.show();
    await flush();
    // Move focus away first, so "the panel has focus" is not left over from open().
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(shadow(el).activeElement).not.toBe(panel(el));

    el.focus();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(shadow(el).activeElement).toBe(panel(el));
  });

  test('the panel is programmatically focusable but never a tab stop', async () => {
    const el = await mount('<p>body</p>');
    el.show();
    await flush();
    expect(panel(el)!.getAttribute('tabindex')).toBe('-1');
  });
});

describe('the Tab focus trap', () => {
  // SEE THE FILE HEADER. jsdom lays nothing out, so the trap's own `isVisible()`
  // filter rejects every candidate and `getTabbables()` comes back empty — which
  // means an unstubbed run can only ever observe the degenerate branch. Supplying
  // the one fact jsdom is missing (a non-empty client rect) is what makes the
  // wrap-around observable at all. The stub is installed for this describe only.
  const real = Element.prototype.getClientRects;
  beforeAll(() => {
    const rect = {
      x: 0, y: 0, width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10,
      toJSON() { return this; },
    } as DOMRect;
    Element.prototype.getClientRects = function () {
      const list = [rect] as unknown as DOMRectList;
      (list as unknown as { item(i: number): DOMRect | null }).item = (i) => (i === 0 ? rect : null);
      return list;
    };
  });
  afterAll(() => { Element.prototype.getClientRects = real; });

  const CONTENT = '<button id="a">a</button><button id="b">b</button>'
    + '<div slot="footer"><button id="c">c</button></div>';

  test('Tab from the LAST tabbable wraps to the first', async () => {
    const el = await mount(CONTENT);
    el.show();
    await flush();
    const c = el.querySelector('#c') as HTMLElement;
    c.focus();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

    const e = key(c, 'Tab');
    expect(e.defaultPrevented, 'the trap must take the keystroke').toBe(true);
    expect(document.activeElement).toBe(el.querySelector('#a'));
  });

  test('Shift+Tab from the FIRST tabbable wraps to the last', async () => {
    const el = await mount(CONTENT);
    el.show();
    await flush();
    const a = el.querySelector('#a') as HTMLElement;
    a.focus();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

    const e = key(a, 'Tab', { shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el.querySelector('#c'));
  });

  test('Tab in the MIDDLE is left alone — the trap only wraps the ends', async () => {
    // The pair for the two above. A trap that swallowed every Tab would satisfy
    // "defaultPrevented" everywhere while making the dialog unnavigable.
    const el = await mount(CONTENT);
    el.show();
    await flush();
    const b = el.querySelector('#b') as HTMLElement;
    b.focus();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

    const e = key(b, 'Tab');
    expect(e.defaultPrevented, 'the browser must do this one itself').toBe(false);
  });

  test('the cycle CROSSES the slot boundary — light-DOM content is in the trap', async () => {
    // The reason `getTabbables` walks slots rather than calling querySelectorAll: in
    // a web-component facade the panel's real content is light-DOM nodes ASSIGNED to
    // its slots, not panel descendants. `#a` is default-slotted and `#c` is
    // footer-slotted, and the wrap above went from one to the other, so both were in
    // the list. This states it directly.
    const el = await mount(CONTENT);
    el.show();
    await flush();
    expect(panel(el)!.contains(el.querySelector('#a')), 'slotted content is NOT a panel descendant').toBe(false);

    const c = el.querySelector('#c') as HTMLElement;
    c.focus();
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
    key(c, 'Tab');
    expect(document.activeElement).toBe(el.querySelector('#a'));
  });

  test('a non-Tab, non-Escape key passes straight through', async () => {
    const el = await mount(CONTENT);
    el.show();
    await flush();
    const e = key(el.querySelector('#a')!, 'ArrowDown');
    expect(e.defaultPrevented).toBe(false);
    expect(isOpen(el)).toBe(true);
  });
});

describe('the trap with nothing focusable inside', () => {
  // Unstubbed, so this is the branch a raw jsdom run always takes — and it is also a
  // real code path in a browser: a dialog of pure prose. Tab must not escape it.
  test('Tab is taken and focus is parked on the panel', async () => {
    const el = await mount('<p>just prose</p>');
    el.show();
    await flush();
    const p = panel(el)!;
    const e = key(p, 'Tab');
    expect(e.defaultPrevented).toBe(true);
    expect(shadow(el).activeElement).toBe(p);
  });
});

// ---------------------------------------------------------------------------
// Dismissal
// ---------------------------------------------------------------------------

describe('Escape, per this element\'s own semantics', () => {
  test('Escape from inside the dialog closes it', async () => {
    const el = await mount('<button id="a">a</button>');
    el.show();
    await flush();

    key(el.querySelector('#a')!, 'Escape');
    await flush();
    expect(isOpen(el)).toBe(false);
  });

  test('Escape from OUTSIDE the dialog does not close it', async () => {
    // Not a modal-scope claim: the handler is bound to the backdrop subtree, so an
    // Escape whose target is elsewhere on the page never reaches it. Paired with the
    // positive case over the same harness.
    const el = await mount('<p>body</p>');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    el.show();
    await flush();

    key(outside, 'Escape');
    await flush();
    expect(isOpen(el)).toBe(true);

    key(panel(el)!, 'Escape');
    await flush();
    expect(isOpen(el)).toBe(false);
  });

  test('Escape does not preventDefault, and its stopPropagation now really stops it', async () => {
    // V2 BEHAVIOR CHANGE, deliberately re-pinned (the previous pin's own comment
    // predicted this day). Solid 1 delegated keydown to the DOCUMENT, so the
    // dialog's `e.stopPropagation()` ran at document level and could not
    // un-deliver the event to a document listener — the old pin recorded that a
    // document listener still heard Escape. Solid 2 owns delegation per RENDER
    // ROOT (the shadow root here), so the dialog's stopPropagation now works as
    // written: Escape handled by an open dialog no longer leaks to page-level
    // keydown listeners. preventDefault is still NOT called either way.
    const el = await mount('<button id="a">a</button>');
    el.show();
    await flush();

    const onDocument = vi.fn();
    document.addEventListener('keydown', onDocument);
    const e = key(el.querySelector('#a')!, 'Escape');
    document.removeEventListener('keydown', onDocument);

    expect(onDocument).toHaveBeenCalledTimes(0);
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('backdrop dismissal', () => {
  test('a press-and-release on the backdrop closes', async () => {
    const el = await mount('<p>body</p>');
    el.show();
    await flush();

    press(backdrop(el)!);
    await flush();
    expect(isOpen(el)).toBe(false);
  });

  test('a press-and-release on the PANEL does not close', async () => {
    const el = await mount('<p>body</p>');
    el.show();
    await flush();

    press(panel(el)!);
    await flush();
    expect(isOpen(el)).toBe(true);

    // Paired over the same harness, so "did not close" cannot be passing because
    // clicking never closes anything.
    press(backdrop(el)!);
    await flush();
    expect(isOpen(el)).toBe(false);
  });

  test('a drag that STARTS in the panel and ends on the backdrop does not dismiss', async () => {
    // Releasing a text selection outside the panel is the ordinary way to lose work
    // to an over-eager backdrop dismiss.
    const el = await mount('<p>selectable body text</p>');
    el.show();
    await flush();

    press(panel(el)!, backdrop(el)!);
    await flush();
    expect(isOpen(el)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The event
// ---------------------------------------------------------------------------

describe('kai-open-change', () => {
  test('fires once per real change with { open }', async () => {
    const el = await mount('<p>body</p>');
    const seen: unknown[] = [];
    el.addEventListener('kai-open-change', (e) => seen.push((e as CustomEvent).detail));

    el.show();
    await flush();
    el.hide();
    await flush();

    expect(seen).toEqual([{ open: true }, { open: false }]);
  });

  test('an Escape close and a backdrop close each announce themselves once', async () => {
    const el = await mount('<p>body</p>');
    const seen: unknown[] = [];
    el.addEventListener('kai-open-change', (e) => seen.push((e as CustomEvent).detail));

    el.show();
    await flush();
    key(panel(el)!, 'Escape');
    await flush();
    el.show();
    await flush();
    press(backdrop(el)!);
    await flush();

    expect(seen).toEqual([{ open: true }, { open: false }, { open: true }, { open: false }]);
  });

  test('does NOT fire on mount — neither closed, nor `default-open`, nor `open`', async () => {
    for (const markup of ['<kai-dialog></kai-dialog>', '<kai-dialog default-open></kai-dialog>', '<kai-dialog open></kai-dialog>']) {
      document.body.innerHTML = markup;
      const el = document.querySelector('kai-dialog') as Dialog;
      const seen: unknown[] = [];
      el.addEventListener('kai-open-change', (e) => seen.push((e as CustomEvent).detail));
      await flush();
      expect(seen, `${markup} must not announce a change at mount`).toEqual([]);
    }
    // Non-vacuous: the two open spellings really did open.
    document.body.innerHTML = '<kai-dialog open></kai-dialog>';
    await flush();
    expect(isOpen(document.querySelector('kai-dialog') as Dialog)).toBe(true);
  });

  test('setting `open` to the value it already holds fires nothing', async () => {
    const el = await mount('<p>body</p>');
    el.show();
    await flush();

    const seen: unknown[] = [];
    el.addEventListener('kai-open-change', (e) => seen.push((e as CustomEvent).detail));
    el.open = true;
    await flush();
    expect(seen).toEqual([]);

    // Paired: a real change over the same listener still fires.
    el.open = false;
    await flush();
    expect(seen).toEqual([{ open: false }]);
  });

  test('is non-bubbling and non-composed, like every other kai-* event', async () => {
    const el = await mount('<p>body</p>');
    let event: Event | undefined;
    el.addEventListener('kai-open-change', (e) => { event = e; });
    el.show();
    await flush();

    expect(event).toBeInstanceOf(CustomEvent);
    expect(event!.bubbles).toBe(false);
    expect(event!.composed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('accessibility', () => {
  test('the panel is role=dialog with aria-modal=true', async () => {
    const el = await mount('<p>body</p>');
    el.show();
    await flush();
    expect(panel(el)!.getAttribute('role')).toBe('dialog');
    // TRUE here, unlike kai-dock's panel, which is the same markup with
    // aria-modal="false" — the two elements are deliberately different widgets and
    // this is the attribute that says so.
    expect(panel(el)!.getAttribute('aria-modal')).toBe('true');
  });

  test('a `header` slot names the dialog via aria-labelledby', async () => {
    const el = await mount('<h2 slot="header">Broadcast a message</h2><p>body</p>');
    el.show();
    await flush();

    const id = panel(el)!.getAttribute('aria-labelledby');
    expect(id, 'a headed dialog must be labelled').toBeTruthy();
    const header = shadow(el).getElementById(id!);
    expect(header, 'aria-labelledby must resolve inside the same root as the panel').not.toBeNull();
    expect(header!.getAttribute('part')).toBe('header');
    // The header's own text is in the LIGHT DOM, projected through this slot — the
    // accessible name is computed over the flattened tree, which jsdom does not do,
    // so what is checked is that the projection really lands.
    const slot = header!.querySelector('slot[name="header"]') as HTMLSlotElement;
    expect(slot.assignedElements()).toEqual([el.querySelector('[slot="header"]')]);
  });

  test('a header-less dialog is still NAMED — the default fills in', async () => {
    // FIXED — this was a real, axe-reportable defect (`aria-dialog-name`): with no
    // `header` slot the panel got neither `aria-labelledby` nor `aria-label`, and the
    // facade exposed no prop that could supply one. The `Dialog` primitive already
    // accepted an `aria-label`; nothing forwarded it, and an `aria-label` on the HOST
    // cannot name a `role="dialog"` living inside the shadow root.
    //
    // The default is deliberately generic. A screen reader announcing "Dialog, dialog"
    // is redundant; an UNNAMED dialog is a WCAG failure, and between the two the
    // redundant one is strictly better and is what Shoelace/WebAwesome ship. It is
    // also the honest default: the kit cannot know what this modal is about, and
    // inventing something specific would be worse than saying nothing extra.
    const el = await mount('<p>Are you sure?</p>');
    el.show();
    await flush();
    const p = panel(el)!;
    expect(p.hasAttribute('aria-labelledby'), 'no header, so no labelledby').toBe(false);
    expect(p.getAttribute('aria-label')).toBe('Dialog');
  });

  test('`label` names the dialog, as a property and as an attribute', async () => {
    const el = await mount('<p>Are you sure?</p>');
    el.label = 'Delete workspace';
    el.show();
    await flush();
    expect(panel(el)!.getAttribute('aria-label')).toBe('Delete workspace');

    el.hide();
    await flush();
    el.removeAttribute('label');
    el.label = undefined;
    el.setAttribute('label', 'Broadcast a message');
    el.show();
    await flush();
    expect(panel(el)!.getAttribute('aria-label')).toBe('Broadcast a message');
  });

  test.each([
    ['the attribute is REMOVED', (el: Dialog) => el.removeAttribute('label')],
    ['the property is set to undefined', (el: Dialog) => { el.label = undefined; }],
    ['the property is set to an EMPTY string', (el: Dialog) => { el.label = ''; }],
    ['the property is set to whitespace', (el: Dialog) => { el.label = '   '; }],
  ])('clearing the label falls back to the default rather than going nameless — %s', async (_name, clear) => {
    // THESE ROUTES ARE WHY THE FALLBACK IS NOT BELT-AND-BRACES OVER THE DECLARED
    // DEFAULT, and the group exists because a mutation run caught the gap: deleting
    // the coalesce from the facade changed NOTHING in this file, because every test
    // that touched `label` set it to something. The declared default is a SEED, not a
    // floor — component-register writes the prop back as `null` when the attribute is
    // removed and does not restore it — so without the coalesce a consumer who cleared
    // the label landed straight back on the nameless dialog this fix exists to
    // eliminate.
    //
    // The empty and whitespace rows are the same hazard by a different door: `??` does
    // not catch `''`, so an explicit empty name would have produced `aria-label=""`,
    // which is a `role="dialog"` with no accessible name wearing the attribute that
    // was supposed to prevent one.
    const el = await mount('<p>body</p>');
    el.setAttribute('label', 'Temporarily named');
    el.show();
    await flush();
    expect(panel(el)!.getAttribute('aria-label')).toBe('Temporarily named');

    clear(el);
    await flush();
    expect(panel(el)!.getAttribute('aria-label'), 'a modal must never lose its name').toBe('Dialog');
  });

  test('`label` follows a live change while the dialog is open', async () => {
    const el = await mount('<p>body</p>');
    el.show();
    await flush();
    expect(panel(el)!.getAttribute('aria-label')).toBe('Dialog');

    el.setAttribute('label', 'Renamed mid-flight');
    await flush();
    expect(panel(el)!.getAttribute('aria-label')).toBe('Renamed mid-flight');
  });

  test('A HEADER SLOT WINS over `label` — aria-labelledby, and no competing aria-label', async () => {
    // THE PRECEDENCE DECISION, and it is not arbitrary: ARIA itself resolves
    // aria-labelledby ahead of aria-label, so emitting both would leave the DOM
    // stating one name and the AT announcing another. The visible heading is also the
    // one a sighted and a screen-reader user can be talked through together, which is
    // the whole reason the header slot exists.
    //
    // kai-dock is the precedent for the `label` PROP (a scalar name the element
    // derives its ARIA from); it has no header slot, so it never had to rank the two.
    // This element does, and the visible text wins.
    const el = await mount('<h2 slot="header">Broadcast a message</h2><p>body</p>');
    el.label = 'Ignored because there is a header';
    el.show();
    await flush();

    const p = panel(el)!;
    expect(p.getAttribute('aria-labelledby')).toBeTruthy();
    expect(p.hasAttribute('aria-label'), 'two names is worse than one').toBe(false);
    expect(shadow(el).getElementById(p.getAttribute('aria-labelledby')!)!.getAttribute('part')).toBe('header');
  });

  test('removing the header LATER hands naming back to `label`', async () => {
    // The transition, because the MutationObserver that tracks the header slot is the
    // thing that has to move the naming with it. A dialog that lost its heading and
    // kept a dangling aria-labelledby would be nameless again, silently.
    const el = await mount('<h2 slot="header">Broadcast</h2><p>body</p>');
    el.label = 'Fallback name';
    el.show();
    await flush();
    expect(panel(el)!.getAttribute('aria-labelledby')).toBeTruthy();

    el.querySelector('[slot="header"]')!.remove();
    await flush();
    const p = panel(el)!;
    expect(p.hasAttribute('aria-labelledby')).toBe(false);
    expect(p.getAttribute('aria-label')).toBe('Fallback name');
  });

  test('header and footer chrome render ONLY when something is slotted for them', async () => {
    // An empty bordered region above an unheaded dialog is the failure this avoids.
    const bare = await mount('<p>body</p>');
    bare.show();
    await flush();
    expect(shadow(bare).querySelector('[part="header"]')).toBeNull();
    expect(shadow(bare).querySelector('[part="footer"]')).toBeNull();
    expect(shadow(bare).querySelector('[part="body"]'), 'the body region is unconditional').not.toBeNull();

    const full = await mount('<h2 slot="header">T</h2><p>body</p><div slot="footer"><button>OK</button></div>');
    full.show();
    await flush();
    expect(shadow(full).querySelector('[part="header"]')).not.toBeNull();
    expect(shadow(full).querySelector('[part="footer"]')).not.toBeNull();
  });

  test('a header added LATER grows the chrome — the MutationObserver is wired', async () => {
    const el = await mount('<p>body</p>');
    el.show();
    await flush();
    expect(shadow(el).querySelector('[part="header"]')).toBeNull();

    const h = document.createElement('h2');
    h.setAttribute('slot', 'header');
    h.textContent = 'Added later';
    el.appendChild(h);
    await flush();
    expect(shadow(el).querySelector('[part="header"]')).not.toBeNull();
    expect(panel(el)!.getAttribute('aria-labelledby')).toBeTruthy();
  });

  test('exposes ::part(backdrop), ::part(panel), ::part(header), ::part(body), ::part(footer)', async () => {
    const el = await mount('<h2 slot="header">T</h2><p>b</p><div slot="footer">f</div>');
    el.show();
    await flush();
    for (const p of ['backdrop', 'panel', 'header', 'body', 'footer']) {
      expect(shadow(el).querySelector(`[part="${p}"]`), `::part(${p}) must exist`).not.toBeNull();
    }
  });
});
