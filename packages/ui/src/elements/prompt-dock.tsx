import { createSignal, onCleanup, onSettled } from 'solid-js';
import { defineWebComponent } from './define';
import { PromptDock, type PromptDockAppearance, type PromptDockFrame } from '../ui/prompt-dock';

interface Props extends Record<string, unknown> {
  /** How the tray frames the input, the SPATIAL inset axis: `inset` (default, the
   *  classic recessed frame on every side) | `edge` (top/bottom inset only; the
   *  input sits flush left/right so the lips span the full width) | `none` (no
   *  inset; the lips attach directly as a plain stack). Attribute: `frame`. */
  frame?: PromptDockFrame;
  /** How the tray surface looks, the VISUAL axis orthogonal to `frame`: `soft`
   *  (default, sunken surface + border + radius) | `outlined` (transparent +
   *  border + radius) | `filled` (sunken, no border, + radius) | `plain`
   *  (bare). Attribute: `appearance`. */
  appearance?: PromptDockAppearance;
}

/** The named slots whose occupancy gates a dock lip. An empty `<slot>` is always
 *  a truthy node, so the facade tracks which are actually filled and only passes
 *  those regions to the primitive (which renders top/bottom only when truthy). */
const SLOT_NAMES = ['top', 'bottom'] as const;
type SlotName = (typeof SLOT_NAMES)[number];

/**
 * `<kai-prompt-dock>` — a recessed tray that frames a prompt input and can extend
 * with optional "lip" regions above and/or below it. It sits in the page flow and
 * launches nothing; the floating corner launcher is `<kai-dock>`. The input is the raised card
 * that floats on the tray; the lips sit in a slightly darker recessed band sharing
 * the tray's rounding, so the whole thing reads as one cohesive control.
 *
 * Slots: the DEFAULT slot is the prompt input (the raised card). `slot="top"` is a
 * recessed band ABOVE the input (a notice, a hint); `slot="bottom"` is a band BELOW
 * it (a mode / control row). A lip renders only when its slot is filled — an empty
 * dock shows just the input, no stray band.
 *
 * Styling splits into two orthogonal variant attributes: `frame` (the spatial inset)
 * and `appearance` (the surface). `::part(tray)` / `::part(top)` / `::part(bottom)`
 * expose the three regions for outside styling; four `--kai-prompt-dock-*` tokens
 * tune the chrome (surface / border / radius / inset).
 *
 * ```html
 * <kai-prompt-dock frame="edge" appearance="soft">
 *   <div slot="top">Working in the docs branch</div>
 *   <kai-prompt-input></kai-prompt-input>
 *   <div slot="bottom">Claude Opus 4.8 · 200k context</div>
 * </kai-prompt-dock>
 * ```
 */
defineWebComponent<Props>('kai-prompt-dock', {
  frame: 'inset',
  appearance: 'soft',
}, (props, { element }) => {
  // Track which named lip slots are filled. Re-read on child mutations so streamed
  // / late content lights up its band. An unfilled lip is never rendered (the
  // primitive gates on a truthy top/bottom, and a bare <slot> is always truthy).
  const [filled, setFilled] = createSignal<Record<SlotName, boolean>>({ top: false, bottom: false });

  onSettled(() => {
    const read = () => {
      const next = {} as Record<SlotName, boolean>;
      for (const name of SLOT_NAMES) next[name] = !!element.querySelector(`:scope > [slot="${name}"]`);
      setFilled(next);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true });
    // V2-PORT: in-onSettled onCleanup -> returned cleanup (fires on disposal)
return () => observer.disconnect();
  });

  const lip = (name: SlotName) => (filled()[name] ? <slot name={name} /> : undefined);

  return (
    <PromptDock
      frame={props.frame as PromptDockFrame}
      appearance={props.appearance as PromptDockAppearance}
      top={lip('top')}
      bottom={lip('bottom')}
    >
      <slot />
    </PromptDock>
  );
});
