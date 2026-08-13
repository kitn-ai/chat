/**
 * The `label` prop must not override text the user can SEE.
 *
 * WHY THIS FILE EXISTS. `<kai-button>`'s `label` was documented as "ignored when
 * you slot visible text" while the facade emitted `aria-label` unconditionally,
 * so `<kai-button label="Submit">Save</kai-button>` presented a button reading
 * "Save" that answered only to "Submit". `aria-label` REPLACES the computed
 * accessible name rather than adding to it, which is a WCAG 2.5.3 (Label in
 * Name) failure — and speech-input users are the ones it breaks, because they
 * say the word they can see and nothing responds.
 *
 * WHAT THIS FILE CANNOT DO. jsdom has no accessibility tree, so every assertion
 * below checks the `aria-label` ATTRIBUTE — the input to the name computation,
 * never the computed name. The computed names are measured in a real chromium by
 * `scripts/probe-button-accessible-name.mjs` (CDP Accessibility.getFullAXTree),
 * which is where "slotted text names the button on its own" is actually
 * established: it reads AX name "Save" sourced from `contents`, with no
 * aria-label present. Keep the two together — this file is the cheap CI guard,
 * that script is the evidence.
 *
 * THE GUARD ON THE GUARD. Half these cases assert `aria-label` IS emitted. A fix
 * that suppresses it too eagerly leaves icon-only buttons NAMELESS, which is a
 * worse defect than the one being fixed, and every one of those cases is green
 * on the ORIGINAL unfixed code — so they cannot be what makes this file pass.
 * The rows that fail before the fix are the three marked `wins:` below.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../src/elements/button';
import '../../src/elements/menu';

const hosts: HTMLElement[] = [];

/**
 * Mount real markup, because the light-DOM children ARE the subject: setting
 * properties on a detached element would skip slot assignment entirely and every
 * assertion here would read the same "nothing slotted" branch.
 */
async function mount(html: string): Promise<HTMLElement> {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  document.body.append(holder);
  hosts.push(holder);
  const host = holder.firstElementChild as HTMLElement;
  // Slot assignment signals a slotchange as a mutation-observer microtask, so
  // the facade's read lands a tick after mount, not synchronously.
  await new Promise((r) => setTimeout(r, 0));
  return host;
}

const ariaLabelOf = (host: HTMLElement) =>
  host.shadowRoot?.querySelector('button')?.getAttribute('aria-label') ?? null;

afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
});

describe('kai-button: visible text wins over the label prop', () => {
  it('emits no aria-label when the label duplicates the slotted text', async () => {
    // wins: red before the fix (aria-label="Save")
    const host = await mount('<kai-button label="Save">Save</kai-button>');
    expect(ariaLabelOf(host)).toBeNull();
  });

  it('emits no aria-label when the label CONTRADICTS the slotted text', async () => {
    // wins: red before the fix (aria-label="Submit") — the WCAG 2.5.3 case
    const host = await mount('<kai-button label="Submit">Save</kai-button>');
    expect(ariaLabelOf(host)).toBeNull();
  });

  it('emits no aria-label when a leading icon sits beside the slotted text', async () => {
    // wins: red before the fix (aria-label="Create item"). The `icon` prop renders
    // in the shadow root, so it must not count as slotted content either way.
    const host = await mount('<kai-button icon="plus" label="Create item">New</kai-button>');
    expect(ariaLabelOf(host)).toBeNull();
  });

  it('emits no aria-label for slotted text with no label prop at all', async () => {
    const host = await mount('<kai-button>Save</kai-button>');
    expect(ariaLabelOf(host)).toBeNull();
  });
});

describe('kai-button: icon-only buttons keep their name', () => {
  it('names an icon-size button from label', async () => {
    const host = await mount('<kai-button size="icon" icon="mic" label="Voice input"></kai-button>');
    expect(ariaLabelOf(host)).toBe('Voice input');
  });

  it('names an icon-sm-size button from label', async () => {
    const host = await mount('<kai-button size="icon-sm" icon="mic" label="Voice input"></kai-button>');
    expect(ariaLabelOf(host)).toBe('Voice input');
  });

  it('names an empty text-size button from label', async () => {
    const host = await mount('<kai-button label="Voice input"></kai-button>');
    expect(ariaLabelOf(host)).toBe('Voice input');
  });

  it('names a button whose only slotted child is an SVG in the icon slot', async () => {
    // The docstring's own example. A named slot is not the default slot, and an
    // <svg> carries no text, so nothing here names the button but `label`.
    const host = await mount('<kai-button label="Ship"><svg slot="icon" viewBox="0 0 24 24"></svg></kai-button>');
    expect(ariaLabelOf(host)).toBe('Ship');
  });

  it('treats whitespace-only slotted content as no visible text', async () => {
    const host = await mount('<kai-button label="Voice input">   \n   </kai-button>');
    expect(ariaLabelOf(host)).toBe('Voice input');
  });

  it('keeps the label when an icon SIZE hides the slotted text', async () => {
    // `icon`/`icon-sm` do not render the default slot, so "Talk" is never drawn.
    // Suppressing the label on the strength of unrendered text would leave this
    // button nameless.
    const host = await mount('<kai-button size="icon" icon="mic" label="Voice input">Talk</kai-button>');
    expect(ariaLabelOf(host)).toBe('Voice input');
  });
});

describe('kai-button: the name tracks light-DOM changes', () => {
  it('drops the aria-label once text is slotted in later', async () => {
    const host = await mount('<kai-button label="Voice input"></kai-button>');
    expect(ariaLabelOf(host)).toBe('Voice input');

    host.append(document.createTextNode('Save'));
    await new Promise((r) => setTimeout(r, 0));
    expect(ariaLabelOf(host)).toBeNull();
  });

  it('restores the aria-label once the text is removed again', async () => {
    const host = await mount('<kai-button label="Voice input">Save</kai-button>');
    expect(ariaLabelOf(host)).toBeNull();

    host.textContent = '';
    await new Promise((r) => setTimeout(r, 0));
    expect(ariaLabelOf(host)).toBe('Voice input');
  });
});

describe('kai-menu: the same rule, for the trigger the element renders itself', () => {
  it('emits no aria-label when a visible triggerLabel is set', async () => {
    // wins: red before the fix (aria-label="Reasoning effort")
    const host = await mount('<kai-menu trigger-label="High" label="Reasoning effort"></kai-menu>');
    expect(ariaLabelOf(host)).toBeNull();
  });

  it('emits no aria-label for a triggerLabel with no label prop', async () => {
    const host = await mount('<kai-menu trigger-label="High"></kai-menu>');
    expect(ariaLabelOf(host)).toBeNull();
  });

  it('names an icon-only trigger from label', async () => {
    const host = await mount('<kai-menu label="Open menu"></kai-menu>');
    expect(ariaLabelOf(host)).toBe('Open menu');
  });

  it('falls back to "Open menu" when nothing names the trigger', async () => {
    const host = await mount('<kai-menu></kai-menu>');
    expect(ariaLabelOf(host)).toBe('Open menu');
  });

  it('STILL lets label win over a slotted trigger — deliberately', async () => {
    // Not an oversight, and not a case anyone should copy: `slot="trigger"` is
    // documented as VISUAL content (a `+`, an `<svg>`), the element cannot tell a
    // glyph from a word, and the docstring's own `<span slot="trigger">+</span>`
    // example depends on `label` naming it. Slotting a real WORD here while
    // setting `label` is still a WCAG 2.5.3 risk the element does not catch —
    // documented on the prop, and printed as PASS* by the chromium probe. This
    // assertion exists so changing that is a deliberate act, not a silent drift.
    const host = await mount('<kai-menu label="Reasoning effort"><span slot="trigger">High</span></kai-menu>');
    expect(ariaLabelOf(host)).toBe('Reasoning effort');
  });
});
