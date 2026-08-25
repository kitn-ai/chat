/**
 * Semantic state must reach assistive tech THROUGH THE ELEMENT.
 *
 * Four components each read a semantic value (`isActive`, "is the current
 * model", a usage severity, a toast `variant`) and used to spend it entirely on
 * Tailwind classes — a sighted user saw the state, a screen-reader user got
 * nothing. Each is asserted here against the real `kai-*` custom element rather
 * than the Solid component, because the component in isolation cannot prove the
 * state survives the facade: the parallel `Message`/`Thread` defect passed a
 * component-level test and still reached no user, because `Thread` never
 * forwarded the prop.
 *
 * WHY NOT AXE: a validator has nothing to complain about here. A plain `<button>`
 * or `<div>` is perfectly valid markup — "0 violations" is the expected reading
 * both before and after these fixes. Every assertion below therefore checks that
 * the expected role/state EXISTS, which is the only shape of check that fails on
 * the defect.
 *
 * These elements DO render in jsdom (shadow root + an inlined <style> fallback
 * when Constructable Stylesheets are missing), contrary to the note carried by
 * the older `*.declarative.test.tsx` files in this directory.
 */
import { flush } from 'solid-js';
import { describe, it, expect, afterEach } from 'vitest';
import { fireEvent } from '@solidjs/testing-library';
import './conversation-list';
import './model-switcher';
import './context-meter';
import './toast';

// jsdom does not implement PointerEvent — shim it so fireEvent.pointerEnter works.
// Same shim as components/context.test.tsx.
if (typeof (globalThis as unknown as Record<string, unknown>).PointerEvent === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, params?: PointerEventInit) { super(type, params); }
  };
}

afterEach(() => { document.body.innerHTML = ''; });

/** Mount a custom element with props set as JS properties (the kai- contract). */
async function mount<T extends Record<string, unknown>>(tag: string, props: T): Promise<HTMLElement & T> {
  const el = document.createElement(tag) as HTMLElement & T;
  Object.assign(el, props);
  document.body.appendChild(el);
  // Let the element upgrade and Solid flush.
  await new Promise((r) => setTimeout(r, 20));
  return el;
}

const shadow = (el: HTMLElement) => el.shadowRoot!;

// ---------------------------------------------------------------------------
// <kai-conversations> — the active row must be aria-current
// ---------------------------------------------------------------------------

describe('<kai-conversations> exposes the active conversation', () => {
  const CONVERSATIONS = [
    { id: 'a', title: 'Alpha', messageCount: 3 },
    { id: 'b', title: 'Beta', messageCount: 1 },
  ];

  it('marks the active row with aria-current and leaves the others unmarked', async () => {
    const el = await mount('kai-conversations', { conversations: CONVERSATIONS, activeId: 'b' });
    const rows = [...shadow(el).querySelectorAll<HTMLElement>('button[data-conversation-id]')];
    expect(rows.length).toBe(2);
    const byId = (id: string) => rows.find((r) => r.dataset.conversationId === id)!;
    expect(byId('b').getAttribute('aria-current')).toBe('true');
    expect(byId('a').getAttribute('aria-current')).toBeNull();
  });

  it('moves aria-current when activeId changes', async () => {
    const el = await mount('kai-conversations', { conversations: CONVERSATIONS, activeId: 'b' });
    (el as unknown as { activeId: string }).activeId = 'a';
    await new Promise((r) => setTimeout(r, 20));
    const rows = [...shadow(el).querySelectorAll<HTMLElement>('button[data-conversation-id]')];
    const byId = (id: string) => rows.find((r) => r.dataset.conversationId === id)!;
    expect(byId('a').getAttribute('aria-current')).toBe('true');
    expect(byId('b').getAttribute('aria-current')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// <kai-model-switcher> — the current model must be a checked radio item
// ---------------------------------------------------------------------------

describe('<kai-model-switcher> exposes the current model as a checked radio item', () => {
  const MODELS = [
    { id: 'alpha', name: 'Alpha' },
    { id: 'beta', name: 'Beta' },
  ];

  const rows = (el: HTMLElement) => [...shadow(el).querySelectorAll<HTMLElement>('[role="menuitemradio"]')];

  it('gives every model row role=menuitemradio', async () => {
    const el = await mount('kai-model-switcher', { models: MODELS, currentModel: 'beta', defaultOpen: true });
    expect(rows(el).length).toBe(2);
    // And no plain menuitem is left behind for a model row.
    const plain = [...shadow(el).querySelectorAll('[role="menuitem"]')];
    expect(plain.length).toBe(0);
  });

  it('sets aria-checked=true on the current model and false on the rest', async () => {
    const el = await mount('kai-model-switcher', { models: MODELS, currentModel: 'beta', defaultOpen: true });
    const byName = (n: string) => rows(el).find((r) => r.textContent?.includes(n))!;
    expect(byName('Beta').getAttribute('aria-checked')).toBe('true');
    expect(byName('Alpha').getAttribute('aria-checked')).toBe('false');
  });

  it('marks grouped models too, once their group is expanded', async () => {
    const el = await mount('kai-model-switcher', {
      models: [{ id: 'a', name: 'Alpha' }, { id: 'g1', name: 'Grouped', group: 'Legacy' }],
      currentModel: 'g1',
      defaultOpen: true,
    });
    const groupHeader = [...shadow(el).querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes('Legacy'))!;
    fireEvent.click(groupHeader);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 20));
    const row = rows(el).find((r) => r.textContent?.includes('Grouped'))!;
    expect(row.getAttribute('aria-checked')).toBe('true');
  });

  // Behaviour guard: routing through DropdownRadioItem must NOT regress the
  // close-on-pick behaviour DropdownItem gave us. DropdownRadioItem deliberately
  // stays open (the consumer owns group selection), so ModelSwitcher closes it.
  it('still closes the menu after picking a model', async () => {
    const el = await mount('kai-model-switcher', { models: MODELS, currentModel: 'beta', defaultOpen: true });
    expect(rows(el).length).toBe(2);
    const alpha = rows(el).find((r) => r.textContent?.includes('Alpha'))!;
    fireEvent.click(alpha);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 20));
    expect(shadow(el).querySelectorAll('[role="menuitemradio"]').length).toBe(0);
  });

  it('still emits kai-model-change when a row is picked', async () => {
    const el = await mount('kai-model-switcher', { models: MODELS, currentModel: 'beta', defaultOpen: true });
    const seen: string[] = [];
    el.addEventListener('kai-model-change', (e) => seen.push((e as CustomEvent).detail.modelId));
    fireEvent.click(rows(el).find((r) => r.textContent?.includes('Alpha'))!);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual(['alpha']);
  });
});

// ---------------------------------------------------------------------------
// <kai-context> — the usage meter must be a real progressbar
// ---------------------------------------------------------------------------

describe('<kai-context> exposes usage as a progressbar', () => {
  async function openMeter(context: Record<string, number>) {
    const el = await mount('kai-context', { context });
    const trigger = shadow(el).querySelector('button')!;
    fireEvent.pointerEnter(trigger.parentElement!);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await new Promise((r) => setTimeout(r, 20));
    return el;
  }

  it('renders role=progressbar with the token counts as aria values', async () => {
    const el = await openMeter({ usedTokens: 190000, maxTokens: 200000 });
    const bar = shadow(el).querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute('aria-valuenow')).toBe('190000');
    expect(bar!.getAttribute('aria-valuemin')).toBe('0');
    expect(bar!.getAttribute('aria-valuemax')).toBe('200000');
  });

  it('always carries an accessible name', async () => {
    const el = await openMeter({ usedTokens: 1000, maxTokens: 200000 });
    const bar = shadow(el).querySelector('[role="progressbar"]')!;
    const named = bar.getAttribute('aria-label') || bar.getAttribute('aria-labelledby');
    expect(named).toBeTruthy();
  });

  // The severity is still conveyed visually; it must now ALSO be a semantic tone
  // on the shared primitive rather than a bare hue class.
  it.each([
    [10000, 'bg-primary'],
    [160000, 'bg-tool-amber'],
    [190000, 'bg-tool-red'],
  ])('drives the ProgressBar tone from severity (%i tokens -> %s)', async (used, fill) => {
    const el = await openMeter({ usedTokens: used as number, maxTokens: 200000 });
    const bar = shadow(el).querySelector('[role="progressbar"]')!;
    expect(bar.querySelector('[part="fill"]')!.className).toContain(fill as string);
  });
});

// ---------------------------------------------------------------------------
// <kai-toast-region> — an error toast must be an alert
// ---------------------------------------------------------------------------

describe('<kai-toast-region> escalates an error toast to role=alert', () => {
  /** The toast's own role, ignoring the region wrapper's role="region". */
  const toastRoles = (el: HTMLElement) =>
    [...shadow(el).querySelectorAll('[role="alert"], [role="status"]')].map((n) => n.getAttribute('role'));

  it('gives an error toast role=alert', async () => {
    const el = await mount('kai-toast-region', { toasts: [{ id: 't1', message: 'Boom', variant: 'error' }] });
    expect(toastRoles(el)).toEqual(['alert']);
  });

  it.each(['success', 'warning', 'info', 'neutral'])('leaves a %s toast as role=status', async (variant) => {
    const el = await mount('kai-toast-region', { toasts: [{ id: 't1', message: 'Hi', variant }] });
    expect(toastRoles(el)).toEqual(['status']);
  });

  it('leaves a variant-less toast as role=status', async () => {
    const el = await mount('kai-toast-region', { toasts: [{ id: 't1', message: 'Hi' }] });
    expect(toastRoles(el)).toEqual(['status']);
  });
});
