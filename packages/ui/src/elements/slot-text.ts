import { createSignal, type Accessor } from 'solid-js';

/**
 * Track whether a `<slot>` is projecting VISIBLE TEXT, so a facade can tell
 * "this control shows its own name" from "this control is icon-only and needs
 * one".
 *
 * WHY IT EXISTS. Slotted light-DOM text is part of the flattened tree, so it
 * names the shadow `<button>` all by itself — measured, not assumed:
 * `scripts/probe-button-accessible-name.mjs` reads chromium's AX tree and
 * `<kai-button>Save</kai-button>` computes the name "Save" from `contents`,
 * with no `aria-label` anywhere. An `aria-label` on top of that does not add a
 * name, it REPLACES one, and a replacement that disagrees with the visible text
 * is a WCAG 2.5.3 (Label in Name) failure: speech-input users say what they
 * see, so a button reading "Save" whose accessible name is "Submit" cannot be
 * activated by voice at all. `kai-checkpoint` already resolved this the same
 * way; this is the reusable form of that decision.
 *
 * WHY A SIGNAL AND NOT A ONE-OFF READ. The facade renders while the HTML parser
 * is still inside the element's own tag, so the light DOM is usually EMPTY at
 * that moment and any synchronous read of `element.childNodes` reports "no text"
 * for the most common case there is. `slotchange` is the event that tells the
 * truth, and it fires on the initial assignment too.
 *
 * The initial value is therefore `false`, meaning "assume icon-only", which
 * makes the pre-`slotchange` frame emit the `aria-label`. That direction is
 * deliberate: an overridden name is a defect, an ABSENT name is a worse one, so
 * the transient state is the named one. `slotchange` is queued as a mutation
 * observer microtask, so it lands before paint and no assistive technology
 * observes the transient.
 */
export function createSlotText(options: {
  /**
   * Follow `assignedNodes({ flatten: true })`, which descends into nested
   * light-DOM `<slot>` elements (a consumer wrapping the element in their OWN
   * component and forwarding a slot) — and, when nothing is assigned, returns
   * the slot's FALLBACK content.
   *
   * Only safe on a slot whose fallback is exactly the visible label. Do NOT set
   * it on a slot whose fallback can render a non-name (an icon that happens to
   * be plain text, say): the fallback would count as visible text and suppress
   * the very `aria-label` that names the control. `kai-button`'s default slot
   * has no fallback at all, so flatten there only buys the nested case;
   * `kai-menu`'s trigger slot falls back to an icon, so it must not use it.
   */
  flatten?: boolean;
} = {}): {
  /** Whether the slot is currently showing text. */
  hasText: Accessor<boolean>;
  /** `ref` for the `<slot>`. Re-reads on every `slotchange`. */
  ref: (slot: HTMLSlotElement) => void;
} {
  const [hasText, setHasText] = createSignal(false);

  const read = (slot: HTMLSlotElement) => {
    const nodes = slot.assignedNodes({ flatten: options.flatten ?? false });
    setHasText(nodes.some((node) => (node.textContent ?? '').trim() !== ''));
  };

  return {
    hasText,
    ref: (slot: HTMLSlotElement) => {
      // A slot outside a shadow root assigns nothing, and this ref runs before
      // solid inserts it — so this first read is normally `false` and the
      // slotchange below is what carries the answer. It is here for the case
      // where the element is created with its children already in place
      // (`el.textContent = 'Save'` then appended), where no assignment CHANGE
      // happens after insertion and slotchange may never fire.
      read(slot);
      slot.addEventListener('slotchange', () => read(slot));
    },
  };
}
