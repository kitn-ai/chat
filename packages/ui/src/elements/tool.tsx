import { createSignal, Show } from 'solid-js';
import { defineWebComponent } from './define';
import { Tool, type ToolPart } from '../components/tool';
import { wireDisclosure } from './disclosure';
import type { CollapsibleController } from '../ui/collapsible';

interface Props extends Record<string, unknown> {
  /** The tool-call to display. Set as a JS property. */
  tool?: ToolPart;
  /** Drive/observe open state (Shoelace-style: settable + reflected to the `open`
   *  attribute; the element still self-manages on trigger click). Set
   *  `el.open = true`, or `<kai-tool open>`; listen for `kai-open-change`. */
  open?: boolean;
  /** Initial open state on mount (uncontrolled seed). */
  defaultOpen?: boolean;
  /** Gate the disclosure trigger: programmatic `show()/hide()/toggle()` still
   *  work, but the trigger click no longer toggles. */
  disabled?: boolean;
}

/** Events fired by `<kai-tool>`. */
interface Events {
  /** The panel expanded or collapsed (by trigger click or a method). */
  'kai-open-change': { open: boolean };
}

/**
 * `<kai-tool>` — a collapsible tool-call panel (input/output inspection with a
 * state badge). Data via the `tool` property. Open state is the standard overlay
 * surface: settable+reflecting `open`, `kai-open-change`, and
 * `show()`/`hide()`/`toggle()` (gated by `disabled`); seed with `defaultOpen`.
 */
defineWebComponent<Props, Events>('kai-tool', {
  tool: undefined,
  open: undefined,
  defaultOpen: undefined,
  disabled: undefined,
}, (props, ctx) => {
  const { flag, reflectFlag } = ctx;

  // A SIGNAL, not a `let`. This facade gates its whole subtree on `<Show when={props.tool}>`,
  // and `tool` is an object prop, so the only sequence a consumer of the HTML spelling
  // has is markup-then-assign: the element connects with no tool, renders nothing, and
  // the Collapsible — and therefore the controller — arrives a tick later.
  //
  // With a plain `let`, wireDisclosure's effects ran once against `undefined` and never
  // again, because the getter they were handed was not reactive and a bare `open`
  // attribute never changes `props.open` to re-trigger them. Net result: `<kai-tool open>`
  // silently stayed shut while `el.open` read back `true` — the property and the
  // rendering disagreed. Making the controller reactive is the whole fix: the effects
  // re-run the moment it lands. `Tool` already tracks its own copy this way internally.
  // Pinned by the ordering rows in tests/elements/tool.test.tsx.
  // V2-PORT: handed up synchronously from Collapsible's body — ownedWrite is the
  // sanctioned opt-in for that owned-scope write (see components/tool.tsx).
  const [api, setApi] = createSignal<CollapsibleController | undefined>(undefined, { ownedWrite: true });

  // The standard disclosure surface: settable+reflecting `open`, kai-open-change,
  // show/hide/toggle, disabled-gating. See ./disclosure. This is the SOLE emitter
  // of kai-open-change — the Tool/Collapsible no longer wires its own.
  wireDisclosure(ctx, api, () => props.open);

  // `disabled` reflects too, following kai-dock. Without it the prop is write-only in
  // the read direction AND deaf in the write one: `el.setAttribute('disabled', '')`
  // after mount is parsed by component-register to `undefined`, so the prop never
  // changes and nothing re-renders. reflectFlag's coercing setter resolves that
  // `undefined` back through the same `flag()` policy, which is what makes the plain
  // HTML gesture work at runtime and not only at parse time (findings G-05).
  reflectFlag('disabled');

  return (
    <Show when={props.tool}>
      <Tool
        toolPart={props.tool!}
        defaultOpen={flag('defaultOpen')}
        disabled={flag('disabled')}
        controllerRef={(a) => setApi(a)}
      />
    </Show>
  );
});
