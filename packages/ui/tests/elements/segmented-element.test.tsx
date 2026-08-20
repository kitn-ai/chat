/**
 * `<kai-segmented>` — the single-select pill track.
 *
 * WHY THIS FILE EXISTS. Until it, kai-segmented was on the coverage guard's punch
 * list as `kind: 'nothing'`: its only test-file hits were slots.test.ts registry
 * fixtures and a react prop-table STRING — the exact false positive the guard
 * exists to reject. Yet it is the most behaviour-rich uncovered element on that
 * list: a controlled `value` with a custom property override, attribute
 * reflection with loop guards, a `kai-change` event with a documented
 * DOES-NOT-FIRE path (host writes), and roving-tabindex keyboard traversal.
 * Every one of those is machinery, and none of it had ever been watched working.
 *
 * CONVENTIONS FOLLOWED (tool.test.tsx, #296's backfill): real registered element;
 * `options` is an ARRAY prop, so it is set as a JS property, never an attribute
 * (the kai- contract), and markup-then-assign is driven alongside assign-then-
 * markup because ordering is where the 13-facade bug class lives; every negative
 * assertion is paired with a positive over the same harness.
 */
import { afterEach, describe, expect, test } from 'vitest';
import '../../src/elements/segmented';
import type { KaiSegmentedOption } from '../../src/elements/element-data-types';

/** Past a macrotask — attribute reflection lands a task after the Solid effect. */
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

type Seg = HTMLElement & {
  options?: KaiSegmentedOption[];
  value?: string;
  size?: 'sm' | 'md';
};

const OPTIONS: KaiSegmentedOption[] = [
  { value: 'code', label: 'Code' },
  { value: 'preview', label: 'Preview' },
  { value: 'diff', label: 'Diff' },
];

async function mount(setup?: (el: Seg) => void): Promise<Seg> {
  const el = document.createElement('kai-segmented') as Seg;
  el.options = OPTIONS;
  setup?.(el);
  document.body.appendChild(el);
  await flush();
  return el;
}

const shadow = (el: Seg) => el.shadowRoot!;
const track = (el: Seg) => shadow(el).querySelector('[part="track"]') as HTMLElement;
const segments = (el: Seg) => [...shadow(el).querySelectorAll('[part="segment"]')] as HTMLButtonElement[];
const segment = (el: Seg, label: string) =>
  segments(el).find((b) => b.textContent?.includes(label)) ?? null;
const pressed = (el: Seg) =>
  segments(el).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent?.trim());

const key = (node: EventTarget, k: string) =>
  node.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true }));

describe('rendering', () => {
  test('nothing renders without options, and the SAME element renders once given them', async () => {
    // Paired over one harness so every assertion below cannot pass against a
    // blank element.
    const el = document.createElement('kai-segmented') as Seg;
    document.body.appendChild(el);
    await flush();
    expect(segments(el)).toEqual([]);

    el.options = OPTIONS;
    await flush();
    expect(segments(el).length).toBe(3);
  });

  test('one real <button type="button"> per option, labelled, inside a role="group" track', async () => {
    const el = await mount();
    expect(track(el).getAttribute('role')).toBe('group');
    const btns = segments(el);
    expect(btns.map((b) => b.textContent?.trim())).toEqual(['Code', 'Preview', 'Diff']);
    for (const b of btns) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('type')).toBe('button');
    }
  });

  test('an option `icon` NAME resolves to an aria-hidden glyph beside the label', async () => {
    const el = await mount((e) => {
      e.options = [
        { value: 'code', label: 'Code', icon: 'code' },
        { value: 'preview', label: 'Preview' },
      ];
    });
    const withIcon = segment(el, 'Code')!;
    expect(withIcon.querySelector('svg')).not.toBeNull();
    expect(withIcon.querySelector('[aria-hidden="true"]')).not.toBeNull();
    // Paired: the icon-less option gets no glyph.
    expect(segment(el, 'Preview')!.querySelector('svg')).toBeNull();
  });

  test('a NEW options array re-renders — adds and removes (the kai- reactivity contract)', async () => {
    const el = await mount();
    el.options = [...OPTIONS, { value: 'terminal', label: 'Terminal' }];
    await flush();
    expect(segments(el).length).toBe(4);

    el.options = [{ value: 'code', label: 'Code' }];
    await flush();
    expect(segments(el).length).toBe(1);
  });
});

describe('selection state', () => {
  test('markup value + options assigned AFTER: <kai-segmented value="preview"> selects Preview', async () => {
    // Markup-then-assign is the only sequence the HTML spelling has, because
    // `options` is an object prop that cannot be written in markup — the same
    // reason kai-tool's declarative-open class existed.
    document.body.innerHTML = '<kai-segmented value="preview"></kai-segmented>';
    const el = document.querySelector('kai-segmented') as Seg;
    el.options = OPTIONS;
    await flush();
    expect(pressed(el)).toEqual(['Preview']);
    expect(el.value).toBe('preview');
  });

  test('value property seeded BEFORE connect selects too (assign-then-markup)', async () => {
    const el = document.createElement('kai-segmented') as Seg;
    el.options = OPTIONS;
    el.value = 'diff';
    document.body.appendChild(el);
    await flush();
    expect(pressed(el)).toEqual(['Diff']);
    expect(el.value).toBe('diff');
  });

  test('no value selects nothing — the facade does NOT auto-select the first segment', async () => {
    const el = await mount();
    expect(pressed(el)).toEqual([]);
    expect(el.value).toBe('');
    // Paired: the same element selects once driven.
    el.value = 'code';
    await flush();
    expect(pressed(el)).toEqual(['Code']);
  });

  test('exactly ONE segment is ever pressed', async () => {
    const el = await mount((e) => { e.value = 'code'; });
    segment(el, 'Preview')!.click();
    await flush();
    expect(pressed(el)).toEqual(['Preview']);
    for (const b of segments(el)) {
      expect(b.getAttribute('aria-pressed'), `${b.textContent} must carry aria-pressed`).toMatch(/^(true|false)$/);
    }
  });
});

describe('kai-change and the two write paths', () => {
  test('clicking a segment fires kai-change {value}, updates el.value, reflects the attribute', async () => {
    const el = await mount();
    const seen: unknown[] = [];
    el.addEventListener('kai-change', (e) => seen.push((e as CustomEvent).detail));

    segment(el, 'Preview')!.click();
    await flush();
    expect(seen).toEqual([{ value: 'preview' }]);
    expect(el.value).toBe('preview');
    expect(el.getAttribute('value'), 'reflected for :host([value]) styling').toBe('preview');
  });

  test('a HOST write (`el.value = …`) drives the selection WITHOUT firing kai-change', async () => {
    // The facade's documented split: kai-change is the user-choice path only —
    // the host already knows about its own writes.
    const el = await mount();
    const seen: unknown[] = [];
    el.addEventListener('kai-change', (e) => seen.push((e as CustomEvent).detail));

    el.value = 'diff';
    await flush();
    expect(pressed(el)).toEqual(['Diff']);
    expect(el.getAttribute('value')).toBe('diff');
    expect(seen, 'no event for a host write').toEqual([]);

    // Paired: the same listener still hears a real user choice.
    segment(el, 'Code')!.click();
    await flush();
    expect(seen).toEqual([{ value: 'code' }]);
  });

  test('clicking the ALREADY-selected segment fires nothing', async () => {
    const el = await mount((e) => { e.value = 'code'; });
    const seen: unknown[] = [];
    el.addEventListener('kai-change', (e) => seen.push((e as CustomEvent).detail));

    segment(el, 'Code')!.click();
    await flush();
    expect(seen).toEqual([]);

    // Paired over the same listener.
    segment(el, 'Diff')!.click();
    await flush();
    expect(seen).toEqual([{ value: 'diff' }]);
  });

  test('is a non-bubbling, non-composed CustomEvent, like every other kai-* event', async () => {
    const el = await mount();
    let event: Event | undefined;
    el.addEventListener('kai-change', (e) => { event = e; });
    segment(el, 'Preview')!.click();
    await flush();

    expect(event).toBeInstanceOf(CustomEvent);
    expect(event!.bubbles).toBe(false);
    expect(event!.composed).toBe(false);
  });

  test('clearing the value (el.value = "") removes the reflected attribute', async () => {
    const el = await mount((e) => { e.value = 'code'; });
    expect(el.getAttribute('value')).toBe('code');

    el.value = '';
    await flush();
    expect(el.hasAttribute('value')).toBe(false);
    expect(pressed(el)).toEqual([]);
  });
});

describe('keyboard traversal (roving tabindex)', () => {
  test('only the selected segment is in the tab order; without a selection, the first is', async () => {
    const el = await mount((e) => { e.value = 'preview'; });
    expect(segments(el).map((b) => b.tabIndex)).toEqual([-1, 0, -1]);

    el.value = '';
    await flush();
    expect(segments(el).map((b) => b.tabIndex), 'fallback: first segment keeps the group reachable').toEqual([0, -1, -1]);
  });

  test('ArrowRight moves the selection forward and wraps; each move IS a user choice', async () => {
    const el = await mount((e) => { e.value = 'preview'; });
    const seen: string[] = [];
    el.addEventListener('kai-change', (e) => seen.push((e as CustomEvent<{ value: string }>).detail.value));

    key(track(el), 'ArrowRight');
    await flush();
    expect(pressed(el)).toEqual(['Diff']);

    key(track(el), 'ArrowRight');
    await flush();
    expect(pressed(el), 'wraps from the last segment to the first').toEqual(['Code']);
    expect(seen).toEqual(['diff', 'code']);
    expect(el.value).toBe('code');
  });

  test('ArrowLeft moves backward and wraps; Home and End jump to the ends', async () => {
    const el = await mount((e) => { e.value = 'code'; });

    key(track(el), 'ArrowLeft');
    await flush();
    expect(pressed(el), 'wraps from the first segment to the last').toEqual(['Diff']);

    key(track(el), 'Home');
    await flush();
    expect(pressed(el)).toEqual(['Code']);

    key(track(el), 'End');
    await flush();
    expect(pressed(el)).toEqual(['Diff']);
  });

  test('an unhandled key changes nothing (the pair for the rows above)', async () => {
    const el = await mount((e) => { e.value = 'code'; });
    const seen: unknown[] = [];
    el.addEventListener('kai-change', (e) => seen.push((e as CustomEvent).detail));

    key(track(el), 'a');
    key(track(el), 'Enter');
    await flush();
    expect(pressed(el)).toEqual(['Code']);
    expect(seen).toEqual([]);
  });
});
