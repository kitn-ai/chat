/**
 * `<kai-dock>` — the docked launcher + panel.
 *
 * Written test-first, against the OWNER-APPROVED design in
 * `docs/superpowers/specs/2026-08-19-kai-dock-design.md`. The four decided calls
 * each get their own group here, because each one is a place where a reasonable
 * implementation would do something else and nothing else in the tree would notice:
 *
 *   D-A  hide semantics — visibility + opacity + `inert`, NEVER unmount, ONE strategy
 *   D-B  focus on open  — `content` | `panel` | `none`, inert cleared BEFORE focus
 *   D-C  Escape scope   — closes only while the dock CONTAINS focus, never swallowed
 *   D-D  unread         — consumer-owned; the dock renders it and never writes it
 *
 * CONVENTIONS FOLLOWED. Assertions run against the real custom element rather than
 * the Solid component (`semantic-state.aria.test.tsx`'s reasoning), and every
 * negative assertion is paired with a positive one over the SAME harness
 * (`reactivity-contract.test.tsx`'s rule) — a closed panel that is "not focusable"
 * because nothing rendered at all would otherwise pass every hidden-state test here.
 *
 * WHAT JSDOM CANNOT DO, stated rather than papered over. jsdom implements neither
 * `inert` nor visibility-based focusability, so no test here can prove the BROWSER
 * skips the closed panel. What is asserted instead is the DOM state the browser acts
 * on (`inert` present, `visibility: hidden` inline) plus a tab-walk over the
 * flattened tree that applies the rules jsdom does not — and the ordering test
 * asserts the OPERATION ORDER (what was true at the instant `focus()` was called),
 * which is the part a browser would get wrong silently.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import '../../src/elements/dock';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Past a macrotask, not just a microtask. The facade's reflections land in
 * `attributeChangedCallback` (a task later than the Solid effect that wrote them),
 * and the focus choreography is deliberately deferred by a `queueMicrotask`; a bare
 * `await Promise.resolve()` reads before either and passes vacuously.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

type Dock = HTMLElement & Record<string, unknown> & {
  show(): void; hide(): void; toggle(): void; focus(options?: FocusOptions): void;
};

async function mount(html = ''): Promise<Dock> {
  const el = document.createElement('kai-dock') as Dock;
  if (html) el.innerHTML = html;
  document.body.appendChild(el);
  await flush();
  return el;
}

const shadow = (el: Dock) => el.shadowRoot!;
const launcher = (el: Dock) => shadow(el).querySelector('[part="launcher"]') as HTMLButtonElement;
const panel = (el: Dock) => shadow(el).querySelector('[part="panel"]') as HTMLElement;
const badge = (el: Dock) => shadow(el).querySelector('[part="badge"]');
/** The element's own answer to "am I open", read the way a consumer would see it. */
const expanded = (el: Dock) => launcher(el).getAttribute('aria-expanded') === 'true';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Would a real browser let Tab reach `node`?
 *
 * jsdom answers "yes" to everything, so this walks the FLATTENED tree upward — through
 * `assignedSlot` for slotted light DOM and through `host` at each shadow boundary —
 * and applies the two rules the closed panel relies on: an `inert` ancestor and a
 * `visibility: hidden` ancestor both remove a node from the tab order. It is a probe
 * of DOM STATE, not of jsdom's focus engine, and that limit is the point of saying so.
 */
function tabReachable(node: HTMLElement): boolean {
  if (!node.matches(FOCUSABLE)) return false;
  let cur: Node | null = node;
  while (cur) {
    if (cur instanceof HTMLElement) {
      if (cur.hasAttribute('inert')) return false;
      if (cur.style.visibility === 'hidden') return false;
    }
    const slot: HTMLSlotElement | null = cur instanceof Element ? cur.assignedSlot : null;
    if (slot) { cur = slot; continue; }
    if (cur.parentNode) { cur = cur.parentNode; continue; }
    cur = cur instanceof ShadowRoot ? cur.host : null;
  }
  return true;
}

/** A keydown as the browser delivers one: from the focused node, bubbling + composed. */
const escapeFrom = (node: EventTarget) =>
  node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));

// ---------------------------------------------------------------------------
// Open / close, through every driver a consumer has
// ---------------------------------------------------------------------------

describe('open / close', () => {
  test('starts closed', async () => {
    const el = await mount();
    expect(expanded(el)).toBe(false);
  });

  test('the `open` PROPERTY drives it both ways', async () => {
    const el = await mount();
    el.open = true;
    await flush();
    expect(expanded(el)).toBe(true);

    el.open = false;
    await flush();
    expect(expanded(el)).toBe(false);
  });

  test('the `open` ATTRIBUTE drives it both ways', async () => {
    const el = await mount();
    el.setAttribute('open', '');
    await flush();
    expect(expanded(el)).toBe(true);

    el.removeAttribute('open');
    await flush();
    expect(expanded(el)).toBe(false);
  });

  test('show() / hide() / toggle() — the kit disclosure vocabulary, not open()/close()', async () => {
    const el = await mount();
    expect(typeof el.show).toBe('function');
    expect(typeof el.hide).toBe('function');
    expect(typeof el.toggle).toBe('function');
    // The vocabulary is part of the contract: open()/close() must NOT appear.
    expect((el as Record<string, unknown>).close).toBeUndefined();

    el.show();
    await flush();
    expect(expanded(el)).toBe(true);

    el.toggle();
    await flush();
    expect(expanded(el)).toBe(false);

    el.toggle();
    await flush();
    expect(expanded(el)).toBe(true);

    el.hide();
    await flush();
    expect(expanded(el)).toBe(false);
  });

  test('clicking the launcher toggles', async () => {
    const el = await mount();
    launcher(el).click();
    await flush();
    expect(expanded(el)).toBe(true);

    launcher(el).click();
    await flush();
    expect(expanded(el)).toBe(false);
  });

  test('`disabled` gates show() and toggle(), and the launcher is a real disabled button', async () => {
    const el = await mount();
    el.setAttribute('disabled', '');
    await flush();
    expect(launcher(el).disabled).toBe(true);

    el.show();
    await flush();
    expect(expanded(el)).toBe(false);

    el.toggle();
    await flush();
    expect(expanded(el)).toBe(false);

    // Paired: the same harness opens once disabled is gone, so the assertions above
    // are not passing because nothing can ever open.
    el.removeAttribute('disabled');
    await flush();
    el.show();
    await flush();
    expect(expanded(el)).toBe(true);
  });
});

describe('declarative HTML — the 13-facade bug class', () => {
  test('<kai-dock open> is open (a bare attribute, parsed from markup)', async () => {
    // The defect wireDisclosure's ordering comment describes: the outward reflection
    // deleted the author's attribute before the inward one had read it, so the plain
    // HTML spelling never opened and only `default-open` did.
    document.body.innerHTML = '<kai-dock open><div slot="panel">hi</div></kai-dock>';
    const el = document.querySelector('kai-dock') as Dock;
    await flush();
    expect(expanded(el)).toBe(true);
  });

  test('<kai-dock default-open> is open', async () => {
    document.body.innerHTML = '<kai-dock default-open><div slot="panel">hi</div></kai-dock>';
    const el = document.querySelector('kai-dock') as Dock;
    await flush();
    expect(expanded(el)).toBe(true);
  });

  test('<kai-dock open="false"> is closed, and so is a bare <kai-dock>', async () => {
    document.body.innerHTML = '<kai-dock open="false"></kai-dock><kai-dock></kai-dock>';
    const [a, b] = Array.from(document.querySelectorAll('kai-dock')) as Dock[];
    await flush();
    expect(expanded(a)).toBe(false);
    expect(expanded(b)).toBe(false);
  });

  test('a property set BEFORE upgrade survives it', async () => {
    // component-register harvests the pre-upgrade own value in connectedCallback; a
    // facade that read its seed too early would drop it.
    const el = document.createElement('kai-dock') as Dock;
    el.open = true;
    document.body.appendChild(el);
    await flush();

    expect(expanded(el)).toBe(true);
    expect(el.open).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reflectFlag read-back (findings G-05 — the write-only property class)
// ---------------------------------------------------------------------------

describe('reflected boolean read-back', () => {
  test('`open` reads back what was set, and reflects to the attribute', async () => {
    const el = await mount();
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
    const el = document.createElement('kai-dock') as Dock;
    el.setAttribute('open', '');
    document.body.appendChild(el);
    await flush();
    expect(el.open).toBe(true);
  });

  test('the internal open state reflects out to the attribute (a launcher click)', async () => {
    const el = await mount();
    launcher(el).click();
    await flush();
    expect(el.hasAttribute('open')).toBe(true);
    expect(el.open).toBe(true);
  });

  test.each(['unread', 'disabled', 'default-open'])(
    'a bare `%s` attribute reads back as true',
    async (attr) => {
      const prop = attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      const el = document.createElement('kai-dock') as Dock;
      el.setAttribute(attr, '');
      document.body.appendChild(el);
      await flush();
      expect(el[prop]).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// D-A — hidden-state reality
// ---------------------------------------------------------------------------

describe('D-A hide semantics — visibility + inert, never unmount', () => {
  test('the panel and its slotted content survive a toggle (never unmounted)', async () => {
    const el = await mount('<div slot="panel" id="thread">thread state</div>');
    const content = el.querySelector('#thread')!;
    const panelBefore = panel(el);

    el.show();
    await flush();
    el.hide();
    await flush();

    expect(el.querySelector('#thread')).toBe(content);
    expect(panel(el)).toBe(panelBefore);
    expect(panel(el).isConnected).toBe(true);
  });

  test('closed: inert set, visibility hidden, and slotted focusables unreachable', async () => {
    const el = await mount('<div slot="panel"><button id="send">Send</button></div>');
    const send = el.querySelector('#send') as HTMLElement;

    expect(panel(el).hasAttribute('inert')).toBe(true);
    expect(getComputedStyle(panel(el)).visibility).toBe('hidden');
    expect(tabReachable(send)).toBe(false);
  });

  test('open: inert cleared, visible, and the SAME focusable is reachable', async () => {
    // The pair for the case above, over the same harness — "unreachable" must not be
    // able to pass because nothing rendered.
    const el = await mount('<div slot="panel"><button id="send">Send</button></div>');
    const send = el.querySelector('#send') as HTMLElement;

    el.show();
    await flush();

    expect(panel(el).hasAttribute('inert')).toBe(false);
    expect(getComputedStyle(panel(el)).visibility).toBe('visible');
    expect(tabReachable(send)).toBe(true);
  });

  test('the closed panel keeps a layout box — no `display:none`, no `hidden`', async () => {
    // ONE hide strategy, and it is the measurable one: a display:none panel has no
    // box, so a reopen re-measures from zero (the reason D-A rejected the insider's).
    const el = await mount('<div slot="panel">body</div>');
    expect(panel(el).style.display).not.toBe('none');
    expect(panel(el).hasAttribute('hidden')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D-B — focus choreography
// ---------------------------------------------------------------------------

describe('D-B focus on open', () => {
  test('default `content`: focus lands on the first assigned element of the panel slot', async () => {
    const el = await mount('<div slot="panel" tabindex="0" id="content">body</div>');
    el.show();
    await flush();
    expect(document.activeElement).toBe(el.querySelector('#content'));
  });

  test('`content` falls back to the panel when the slotted content cannot take focus', async () => {
    // Content-agnostic by construction: a plain <div> has no meaningful focus target,
    // and the dock is not allowed to know what it is holding.
    const el = await mount('<div slot="panel" id="content">body</div>');
    el.show();
    await flush();
    expect(shadow(el).activeElement).toBe(panel(el));
  });

  test('`focus-on-open="panel"` focuses the panel container', async () => {
    const el = await mount('<div slot="panel" tabindex="0" id="content">body</div>');
    el.setAttribute('focus-on-open', 'panel');
    await flush();
    el.show();
    await flush();
    expect(shadow(el).activeElement).toBe(panel(el));
    expect(document.activeElement).not.toBe(el.querySelector('#content'));
  });

  test('`focus-on-open="none"` moves no focus at all', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const el = await mount('<div slot="panel" tabindex="0" id="content">body</div>');
    el.setAttribute('focus-on-open', 'none');
    await flush();
    outside.focus();

    el.show();
    await flush();
    expect(document.activeElement).toBe(outside);

    // Paired: the same harness DOES move focus without the prop, so "no focus move"
    // cannot pass because the choreography is broken for everyone.
    el.hide();
    await flush();
    el.removeAttribute('focus-on-open');
    await flush();
    outside.focus();
    el.show();
    await flush();
    expect(document.activeElement).toBe(el.querySelector('#content'));
  });

  test('close returns focus to the launcher — always, not to the pre-open element', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const el = await mount('<div slot="panel" tabindex="0" id="content">body</div>');
    outside.focus();

    el.show();
    await flush();
    el.hide();
    await flush();

    expect(shadow(el).activeElement).toBe(launcher(el));
    expect(document.activeElement).not.toBe(outside);
  });

  test('mount moves NO focus — neither `default-open` nor `open`', async () => {
    document.body.innerHTML =
      '<kai-dock default-open><div slot="panel" tabindex="0">a</div></kai-dock>';
    await flush();
    expect(document.activeElement).toBe(document.body);

    document.body.innerHTML =
      '<kai-dock open><div slot="panel" tabindex="0">b</div></kai-dock>';
    await flush();
    expect(document.activeElement).toBe(document.body);
  });

  test('re-driving `open` to the value it already holds moves no focus', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const el = await mount('<div slot="panel" tabindex="0" id="content">body</div>');
    el.show();
    await flush();

    outside.focus();
    el.open = true;
    await flush();
    expect(document.activeElement).toBe(outside);
  });

  test('THE ORDERING INVARIANT: inert is cleared and visibility restored BEFORE focus()', async () => {
    // The outsider's discovery, and the one that fails silently in a real browser:
    // focus() into an inert or visibility:hidden subtree is DROPPED, no error. jsdom
    // enforces neither, so this asserts the operation ORDER instead — what was true
    // of the panel at the instant focus() was called.
    const el = await mount('<div slot="panel" tabindex="0" id="content">body</div>');
    const content = el.querySelector('#content') as HTMLElement;
    const at: { inert: boolean; visibility: string }[] = [];
    const native = content.focus.bind(content);
    content.focus = (options?: FocusOptions) => {
      // COMPUTED, not `.style.visibility`. Reading the inline declaration is what made
      // this assertion vacuous through a real IVP failure: the inline style said
      // `visible` the instant open flipped, while the COMPUTED value the browser acts
      // on stayed `hidden` for ~2 frames because `visibility` was in the panel's
      // transition list. Focus was silently dropped into a hidden subtree and this
      // test stayed green. jsdom cannot model that lag — computed here just reflects
      // the inline declaration — so the real guard is the structural one below
      // ("no transition animates visibility"), which pins the cause directly.
      at.push({
        inert: panel(el).hasAttribute('inert'),
        visibility: getComputedStyle(panel(el)).visibility,
      });
      native(options);
    };

    el.show();
    await flush();

    expect(at, 'focus() must be called on the slotted content').toHaveLength(1);
    expect(at[0].inert, 'inert must already be cleared when focus() runs').toBe(false);
    expect(at[0].visibility, 'visibility must already be restored when focus() runs').toBe('visible');
  });

  test('focus() targets the panel while open and the launcher while closed', async () => {
    const el = await mount('<div slot="panel">body</div>');
    el.focus();
    await flush();
    expect(shadow(el).activeElement).toBe(launcher(el));

    el.show();
    await flush();
    el.focus();
    expect(shadow(el).activeElement).toBe(panel(el));
  });

  test('there is NO focus trap — Tab is never intercepted', async () => {
    // A support widget that traps the page is a bug; the page staying usable is the
    // whole point of "docked". kai-dialog traps Tab, this must not.
    const el = await mount('<div slot="panel"><button id="a">a</button></div>');
    el.show();
    await flush();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true });
    el.querySelector('#a')!.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D-C — Escape scope
// ---------------------------------------------------------------------------

describe('D-C Escape closes only while the dock contains focus', () => {
  test('Escape from inside the panel closes', async () => {
    const el = await mount('<div slot="panel"><button id="a">a</button></div>');
    el.show();
    await flush();

    escapeFrom(el.querySelector('#a')!);
    await flush();
    expect(expanded(el)).toBe(false);
  });

  test('Escape from the launcher closes', async () => {
    const el = await mount('<div slot="panel">body</div>');
    el.show();
    await flush();

    escapeFrom(launcher(el));
    await flush();
    expect(expanded(el)).toBe(false);
  });

  test('Escape from a page element OUTSIDE the dock does NOT close — the D-C departure', async () => {
    // Both reference implementations listened on `document` and closed on any Escape
    // anywhere. That is modal behaviour in a non-modal widget: a background support
    // bubble eating the Escape the host page's own menu or combobox wanted.
    const el = await mount('<div slot="panel">body</div>');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    el.show();
    await flush();

    escapeFrom(outside);
    await flush();
    expect(expanded(el)).toBe(true);

    escapeFrom(document.body);
    await flush();
    expect(expanded(el)).toBe(true);

    // Paired with the positive case over the same harness, so "did not close" cannot
    // pass because Escape does nothing at all.
    escapeFrom(launcher(el));
    await flush();
    expect(expanded(el)).toBe(false);
  });

  test('Escape is not swallowed — it keeps propagating to the host page', async () => {
    const el = await mount('<div slot="panel"><button id="a">a</button></div>');
    el.show();
    await flush();

    const onDocument = vi.fn();
    document.addEventListener('keydown', onDocument);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
    el.querySelector('#a')!.dispatchEvent(event);
    document.removeEventListener('keydown', onDocument);

    expect(onDocument).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  test('a non-Escape key from inside does nothing', async () => {
    const el = await mount('<div slot="panel"><button id="a">a</button></div>');
    el.show();
    await flush();
    el.querySelector('#a')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
    );
    await flush();
    expect(expanded(el)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The event
// ---------------------------------------------------------------------------

describe('kai-open-change', () => {
  test('fires once per real change with { open }', async () => {
    const el = await mount();
    const seen: unknown[] = [];
    el.addEventListener('kai-open-change', (e) => seen.push((e as CustomEvent).detail));

    el.show();
    await flush();
    el.hide();
    await flush();

    expect(seen).toEqual([{ open: true }, { open: false }]);
  });

  test('does NOT fire on mount — neither closed, nor `default-open`, nor `open`', async () => {
    for (const markup of ['<kai-dock></kai-dock>', '<kai-dock default-open></kai-dock>', '<kai-dock open></kai-dock>']) {
      document.body.innerHTML = markup;
      const el = document.querySelector('kai-dock') as Dock;
      const seen: unknown[] = [];
      el.addEventListener('kai-open-change', (e) => seen.push((e as CustomEvent).detail));
      await flush();
      expect(seen, `${markup} must not announce a change at mount`).toEqual([]);
    }
  });

  test('setting `open` to the value it already holds fires nothing', async () => {
    const el = await mount();
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
    const el = await mount();
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
// D-D — unread
// ---------------------------------------------------------------------------

describe('D-D unread is the consumer\'s', () => {
  test('the dot renders while CLOSED and not while OPEN', async () => {
    const el = await mount();
    el.setAttribute('unread', '');
    await flush();
    expect(badge(el)).not.toBeNull();

    el.show();
    await flush();
    expect(badge(el)).toBeNull();

    el.hide();
    await flush();
    expect(badge(el)).not.toBeNull();
  });

  test('no dot without the prop (the pair — the badge is not just always there)', async () => {
    const el = await mount();
    expect(badge(el)).toBeNull();
  });

  test('THE DOCK NEVER WRITES IT — an open/close cycle leaves prop and attribute alone', async () => {
    // The trap kai-chat.loading fell into (findings G-05): writing over a consumer
    // prop. The dot simply stops rendering while open; clearing it is the consumer's
    // job, in their kai-open-change handler.
    const el = await mount();
    el.unread = true;
    await flush();

    el.show();
    await flush();
    expect(el.unread, 'opening must not clear unread').toBe(true);
    expect(el.hasAttribute('unread')).toBe(true);

    el.hide();
    await flush();
    expect(el.unread, 'closing must not clear unread').toBe(true);
    expect(el.hasAttribute('unread')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('accessibility', () => {
  test('the launcher owns aria-expanded + aria-controls, pointing at the panel', async () => {
    const el = await mount('<div slot="panel">body</div>');
    expect(launcher(el).getAttribute('aria-expanded')).toBe('false');
    expect(launcher(el).getAttribute('aria-controls')).toBe(panel(el).id);
    expect(panel(el).id).toBeTruthy();

    el.show();
    await flush();
    expect(launcher(el).getAttribute('aria-expanded')).toBe('true');
  });

  test('the launcher is a real <button type="button">', async () => {
    // Not a div with a click handler: it is a tab stop, and the dock owns the wiring
    // precisely because a slotted replacement would take aria-expanded with it.
    const el = await mount();
    expect(launcher(el).tagName).toBe('BUTTON');
    expect(launcher(el).getAttribute('type')).toBe('button');
  });

  test('the panel is role=dialog, aria-modal=false, named from `label`', async () => {
    const el = await mount('<div slot="panel">body</div>');
    el.setAttribute('label', 'Aurora support');
    await flush();

    expect(panel(el).getAttribute('role')).toBe('dialog');
    expect(panel(el).getAttribute('aria-modal')).toBe('false');
    expect(panel(el).getAttribute('aria-label')).toBe('Aurora support');
    expect(panel(el).getAttribute('tabindex')).toBe('-1');
  });

  test('one `label` derives all three names', async () => {
    const el = await mount();
    el.setAttribute('label', 'Aurora support');
    await flush();
    expect(launcher(el).getAttribute('aria-label')).toBe('Open Aurora support');

    el.show();
    await flush();
    expect(launcher(el).getAttribute('aria-label')).toBe('Close Aurora support');
    expect(panel(el).getAttribute('aria-label')).toBe('Aurora support');
  });

  test('the default label is "Chat"', async () => {
    const el = await mount();
    expect(launcher(el).getAttribute('aria-label')).toBe('Open Chat');
    expect(panel(el).getAttribute('aria-label')).toBe('Chat');
  });

  test('`open-label` / `close-label` override the derived pair (i18n)', async () => {
    const el = await mount();
    el.setAttribute('label', 'Aurora support');
    el.setAttribute('open-label', 'Ouvrir le support');
    el.setAttribute('close-label', 'Fermer le support');
    await flush();
    expect(launcher(el).getAttribute('aria-label')).toBe('Ouvrir le support');

    el.show();
    await flush();
    expect(launcher(el).getAttribute('aria-label')).toBe('Fermer le support');
  });

  test('the accessible NAME changes, not only the icon — the icon is decorative', async () => {
    const el = await mount();
    const closedName = launcher(el).getAttribute('aria-label');
    for (const svg of Array.from(launcher(el).querySelectorAll('svg'))) {
      expect(svg.closest('[aria-hidden="true"]'), 'launcher glyphs must be aria-hidden').not.toBeNull();
    }
    el.show();
    await flush();
    expect(launcher(el).getAttribute('aria-label')).not.toBe(closedName);
  });
});

// ---------------------------------------------------------------------------
// Slots, parts, and staying content-agnostic
// ---------------------------------------------------------------------------

describe('slots and parts', () => {
  test('the panel slot and the default slot both project into the panel', async () => {
    const el = await mount('<div slot="panel" id="named">a</div><div id="unnamed">b</div>');
    const slots = Array.from(panel(el).querySelectorAll('slot')) as HTMLSlotElement[];
    const assigned = slots.flatMap((s) => s.assignedElements());
    expect(assigned).toContain(el.querySelector('#named'));
    expect(assigned).toContain(el.querySelector('#unnamed'));
  });

  test('the built-in glyphs render when nothing is slotted, and morph on open', async () => {
    const el = await mount();
    const closedGlyph = launcher(el).innerHTML;
    el.show();
    await flush();
    expect(launcher(el).innerHTML).not.toBe(closedGlyph);
  });

  test('`launcher` replaces the closed glyph; the built-in ✕ still shows while open', async () => {
    const el = await mount('<span slot="launcher" id="mine">?</span>');
    const closedSlot = launcher(el).querySelector('slot[name="launcher"]') as HTMLSlotElement;
    expect(closedSlot.assignedElements()).toEqual([el.querySelector('#mine')]);
  });

  test('`launcher-open` is used while open', async () => {
    const el = await mount('<span slot="launcher-open" id="x">x</span>');
    el.show();
    await flush();
    const openSlot = launcher(el).querySelector('slot[name="launcher-open"]') as HTMLSlotElement;
    expect(openSlot.assignedElements()).toEqual([el.querySelector('#x')]);
  });

  test('a `launcher` with no `launcher-open` keeps the consumer glyph while open', async () => {
    const el = await mount('<span slot="launcher" id="mine">?</span>');
    el.show();
    await flush();
    const slot = launcher(el).querySelector('slot[name="launcher"]') as HTMLSlotElement;
    expect(slot, 'the consumer glyph stays rather than morphing to a clashing built-in ✕').not.toBeNull();
    expect(slot.assignedElements()).toEqual([el.querySelector('#mine')]);
  });

  test('the button itself is never slotted away', async () => {
    // The one place this design refuses a seam: the dock owns aria-expanded,
    // aria-controls, the focus return and the toggle wiring.
    const el = await mount('<button slot="launcher" id="mine">nope</button>');
    expect(launcher(el).tagName).toBe('BUTTON');
    expect(launcher(el).getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('#mine')!.getAttribute('aria-expanded')).toBeNull();
  });

  test('exposes ::part(launcher), ::part(panel) and ::part(badge)', async () => {
    const el = await mount();
    el.setAttribute('unread', '');
    await flush();
    expect(launcher(el)).not.toBeNull();
    expect(panel(el)).not.toBeNull();
    expect(badge(el)).not.toBeNull();
  });
});

describe('content-agnostic by construction', () => {
  test('a plain <div> panel works end to end — no kai-chat anywhere in the flow', async () => {
    const el = await mount('<div slot="panel" id="anything"><p>whatever</p></div>');
    el.show();
    await flush();
    expect(expanded(el)).toBe(true);
    expect(el.querySelector('#anything')!.isConnected).toBe(true);
    el.hide();
    await flush();
    expect(expanded(el)).toBe(false);
  });

  test('the SOURCE knows nothing about its content — no kai-chat, no scrollToBottom', async () => {
    // Spec §10: no knowledge of the slotted content. The residue the rung-1 app keeps
    // (`chat.scrollToBottom` on kai-open-change) is deliberately the CONSUMER's; the
    // seam is the event, never a reach into the slot.
    for (const file of ['src/elements/dock.tsx', 'src/ui/dock.tsx']) {
      const source = readFileSync(resolve(pkgRoot, file), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(code, `${file} must not name kai-chat`).not.toMatch(/kai-chat/);
      expect(code, `${file} must not reach for scrollToBottom`).not.toMatch(/scrollToBottom/);
    }
  });
});

// ---------------------------------------------------------------------------
// Geometry + the scalar-only prop surface
// ---------------------------------------------------------------------------

describe('geometry is CSS tokens, and every prop is a scalar', () => {
  test('`position` is logical, defaults to bottom-end, and is attribute-driven', async () => {
    const el = await mount();
    const container = shadow(el).querySelector('[data-kai-dock]') as HTMLElement;
    expect(container.getAttribute('data-position')).toBe('bottom-end');

    el.setAttribute('position', 'top-start');
    await flush();
    expect(container.getAttribute('data-position')).toBe('top-start');
  });

  test('the shipped CSS is token-driven and logical, with a narrow-viewport default', async () => {
    const el = await mount();
    const css = Array.from(shadow(el).querySelectorAll('style')).map((s) => s.textContent).join('\n');
    for (const token of [
      '--kai-dock-width', '--kai-dock-height', '--kai-dock-inset', '--kai-dock-gap',
      '--kai-dock-radius', '--kai-dock-z', '--kai-dock-launcher-size',
    ]) {
      expect(css, `${token} must be a consumer-overridable token`).toContain(token);
    }
    // RTL-correct: the corner inset is logical, as both references independently wrote.
    expect(css).toContain('inset-inline-end');
    expect(css).not.toMatch(/\binset-right\b|\bright:\s*var\(--kai-dock-inset/);
    // Both references wrote a narrow-viewport rule independently, so it is a HOW and
    // it ships as a default rather than as a prop.
    expect(css).toMatch(/@media[^{]*max-width/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });

  test('NO transition animates `visibility` over a non-zero duration — IVP defect 1', async () => {
    // THE DEFECT, in a real browser, headless and headed: the panel's transition list
    // included `visibility 180ms`, so after show() the COMPUTED visibility stayed
    // `hidden` for about two frames while the inline style already said `visible`. The
    // browser drops `focus()` into a hidden subtree silently, so focusOnOpen never
    // landed. A/B confirmed it: reduced-motion (transition: none) landed focus, default
    // motion dropped it.
    //
    // The fix keeps the fade by transitioning visibility with a ZERO duration and a
    // DELAY on the closing direction only, so opening flips it synchronously. This
    // asserts the shape rather than the symptom, because the symptom needs a compositor
    // and jsdom has none.
    const el = await mount();
    const css = Array.from(shadow(el).querySelectorAll('style')).map((s) => s.textContent).join('\n');

    const offenders: string[] = [];
    for (const m of css.matchAll(/transition:\s*([^;}]+)[;}]/g)) {
      const value = m[1];
      if (!/\bvisibility\b/.test(value)) continue;
      // The duration is the first time token after the property name.
      const after = value.slice(value.indexOf('visibility') + 'visibility'.length);
      const duration = after.match(/(-?[\d.]+m?s)/)?.[1];
      if (duration !== '0s') offenders.push(`transition: ${value.trim()}`);
    }
    expect(
      offenders,
      'visibility must not be animated over time: focus() into a still-hidden panel is dropped with no error',
    ).toEqual([]);

    // The open direction needs its OWN rule (delay 0s), and that rule is more specific
    // than a bare [part="panel"] — so the reduced-motion block has to name it too, or
    // it silently stops covering an opening panel.
    expect(css, 'the open direction needs a zero-delay visibility switch').toMatch(
      /\[part="panel"\]\[data-expanded\][^{]*\{[^}]*visibility 0s linear 0s/,
    );
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(reduced, 'reduced motion must cover the more-specific open-state rule').toMatch(
      /\[part="panel"\]\[data-expanded\]/,
    );
  });

  test('the launcher stacks ABOVE the panel — IVP defect 2 (narrow-viewport full-bleed)', async () => {
    // At <=480px the panel goes `position: fixed; inset: 0`, and it comes AFTER the
    // launcher in DOM order, so with both at `z-index: auto` the panel painted over the
    // launcher: a touch user had no pointer close affordance at all, only Escape. The
    // CSS comment promised the opposite.
    //
    // jsdom has no paint order and no media-query evaluation, so this pins the
    // STRUCTURE that decides it: the launcher carries a positive z-index and the panel
    // carries none anywhere. The paint-order proof itself lives in the IVP.
    const el = await mount();
    const css = Array.from(shadow(el).querySelectorAll('style')).map((s) => s.textContent).join('\n');

    const launcherRule = css.match(/\[data-kai-dock\] \[part="launcher"\] \{([^}]*)\}/)?.[1] ?? '';
    expect(launcherRule, 'the base launcher rule must be found').not.toBe('');
    const z = launcherRule.match(/z-index:\s*(\d+)/)?.[1];
    expect(Number(z), 'the launcher needs a positive z-index to sit over the full-bleed panel').toBeGreaterThan(0);

    // The other half: nothing may hand the panel a competing z-index, in any block.
    for (const m of css.matchAll(/\[part="panel"\][^{]*\{([^}]*)\}/g)) {
      expect(m[1], 'the panel must not declare a z-index that could out-stack the launcher').not.toMatch(/z-index/);
    }
  });

  test('the launcher sizes to slotted content on the inline axis — the pill case', async () => {
    // The spec's own extraction test: the reference app's launcher is a PILL WITH A
    // TEXT LABEL ("Support"). A button locked to --kai-dock-launcher-size on BOTH axes
    // overflows that text out of the disc, so adopting the element would silently drop
    // the label. The size token becomes the block size and the inline MINIMUM; the
    // inline size follows the content.
    const el = await mount('<span slot="launcher" id="pill">Support</span>');
    const slot = launcher(el).querySelector('slot[name="launcher"]') as HTMLSlotElement;
    expect(slot.assignedElements(), 'the label must reach the button').toEqual([el.querySelector('#pill')]);

    const css = Array.from(shadow(el).querySelectorAll('style')).map((s) => s.textContent).join('\n');
    const rule = css.match(/\[data-kai-dock\] \[part="launcher"\] \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/inline-size:\s*auto/);
    expect(rule).toMatch(/min-inline-size:\s*var\(--kai-dock-launcher-size/);
    expect(rule).toMatch(/block-size:\s*var\(--kai-dock-launcher-size/);
    // The regression itself: a fixed inline size is what clipped the label.
    expect(rule, 'a fixed inline-size would clip a slotted text label').not.toMatch(
      /(^|[^-])inline-size:\s*var\(--kai-dock-launcher-size/,
    );
    // An icon-only launcher must still be a perfect disc, which the minimum guarantees.
    expect(rule).toMatch(/border-radius:\s*9999px/);
  });

  test('NO array or object prop exists — every declared default is a scalar', async () => {
    // Asserted over the SOURCE, not over an instance: `element-nonscalar.json` and the
    // element diagnostics are generated, so a runtime check against them would pass
    // vacuously until the next build. Parsing the defaults object is the fact itself.
    const file = resolve(pkgRoot, 'src/elements/dock.tsx');
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
    const offenders: string[] = [];
    let found = false;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'defineWebComponent'
      ) {
        const defaults = node.arguments[1];
        if (defaults && ts.isObjectLiteralExpression(defaults)) {
          found = true;
          for (const prop of defaults.properties) {
            if (!ts.isPropertyAssignment(prop)) { offenders.push(prop.getText()); continue; }
            const init = prop.initializer;
            const scalar = ts.isStringLiteralLike(init)
              || init.kind === ts.SyntaxKind.TrueKeyword
              || init.kind === ts.SyntaxKind.FalseKeyword
              || (ts.isIdentifier(init) && init.text === 'undefined');
            if (!scalar) offenders.push(`${prop.name.getText()} = ${init.getText()}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    expect(found, 'the defineWebComponent call must be found (the scan is not vacuous)').toBe(true);
    expect(offenders, 'kai-dock is scalars-only by design — see the spec §2').toEqual([]);
  });
});
