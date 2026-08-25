/**
 * `<kai-pane-grid>` — the element facade over `ui/PaneGrid` (the N-pane responsive
 * tiling grid). Written test-first, per the WS1 surface-audit item 7 ruling: PaneGrid
 * is the one layout atom whose siblings (`kai-pane`, `kai-pane-group`) already have
 * facades, so a consumer composing the pane family from a framework hits the
 * no-facade wall (`docs/superpowers/research/2026-08-25-ws1-surface-audit.md` §A).
 *
 * The facade's whole job is the slot plumbing: PaneGrid tiles its JSX children, but
 * an element's panes arrive as LIGHT-DOM children. So the facade assigns each direct
 * light child its own named slot and renders one `<slot>` per child into PaneGrid —
 * the same per-child-slot pattern `<kai-resizable>` uses (`p0`/`p1`/…). Every
 * negative assertion here is paired with a positive one over the same harness
 * (reactivity-contract.test.tsx's rule), so "nothing rendered" cannot pass.
 *
 * CONVENTIONS: assertions run against the real custom element; a macrotask flush
 * (`setTimeout 0`) covers attributeChangedCallback + MutationObserver delivery.
 */
import { afterEach, describe, expect, test } from 'vitest';
import '../../src/elements/pane-grid';

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

type PaneGridEl = HTMLElement & Record<string, unknown>;

async function mount(html: string, attrs: Record<string, string> = {}): Promise<PaneGridEl> {
  const el = document.createElement('kai-pane-grid') as PaneGridEl;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.innerHTML = html;
  document.body.appendChild(el);
  await flush();
  return el;
}

const gridRoot = (el: PaneGridEl) => el.shadowRoot!.querySelector('[data-pane-grid]') as HTMLElement | null;
const slots = (el: PaneGridEl) => Array.from(el.shadowRoot!.querySelectorAll('[data-pane-grid] slot')) as HTMLSlotElement[];

describe('<kai-pane-grid> registration + render', () => {
  test('registers the custom element', () => {
    expect(customElements.get('kai-pane-grid')).toBeDefined();
  });

  test('renders the PaneGrid root and one slot per light child, each child assigned', async () => {
    const el = await mount('<div id="a">A</div><div id="b">B</div><div id="c">C</div>');
    const root = gridRoot(el);
    expect(root).not.toBeNull();
    const s = slots(el);
    expect(s.length).toBe(3);
    // Each light child was assigned to exactly one of the rendered slots, in order.
    const assigned = s.map((slot) => slot.assignedElements().map((n) => n.id).join(','));
    expect(assigned).toEqual(['a', 'b', 'c']);
  });

  test('a child added later gets its own tile (MutationObserver re-read)', async () => {
    const el = await mount('<div id="a">A</div>');
    expect(slots(el).length).toBe(1);
    const d = document.createElement('div');
    d.id = 'd';
    el.appendChild(d);
    await flush();
    expect(slots(el).length).toBe(2);
    expect(slots(el)[1].assignedElements()[0]?.id).toBe('d');
  });
});

describe('<kai-pane-grid> scalar attributes reach the grid math', () => {
  test('min-pane-width and max-columns shape the column track', async () => {
    const el = await mount('<div>A</div><div>B</div>', {
      'min-pane-width': '100',
      'max-columns': '2',
    });
    const track = gridRoot(el)!.style.gridTemplateColumns;
    expect(track).toContain('100px');
    expect(track).toContain('/ 2');
  });

  test('defaults apply when no attributes are set (280px floor, 3-column cap)', async () => {
    const el = await mount('<div>A</div>');
    const track = gridRoot(el)!.style.gridTemplateColumns;
    expect(track).toContain('280px');
    expect(track).toContain('/ 3');
  });

  test('min-pane-height shapes the row track', async () => {
    const el = await mount('<div>A</div>', { 'min-pane-height': '150' });
    expect(gridRoot(el)!.style.gridAutoRows).toContain('150px');
  });

  test('gap passes through as a CSS length', async () => {
    const el = await mount('<div>A</div>', { gap: '1rem' });
    expect(gridRoot(el)!.style.gap).toBe('1rem');
  });
});

describe('<kai-pane-grid> maximize', () => {
  test('maximized-index shows ONLY that pane, full-bleed; clearing restores the grid', async () => {
    const el = await mount('<div id="a">A</div><div id="b">B</div><div id="c">C</div>', {
      'maximized-index': '1',
    });
    // One filling cell, holding the second child's slot only.
    expect(slots(el).length).toBe(1);
    expect(slots(el)[0].assignedElements()[0]?.id).toBe('b');
    expect(gridRoot(el)!.style.gridTemplateColumns).toBe('1fr');
    // Restore: the full tiled grid comes back (positive pair for the negative above).
    el.removeAttribute('maximized-index');
    await flush();
    expect(slots(el).length).toBe(3);
  });

  test('an out-of-range maximized-index falls back to the full grid', async () => {
    const el = await mount('<div id="a">A</div><div id="b">B</div>', {
      'maximized-index': '9',
    });
    expect(slots(el).length).toBe(2);
  });
});
