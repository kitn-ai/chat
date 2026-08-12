import { Show } from 'solid-js';
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
  const { flag } = ctx;
  let api: CollapsibleController | undefined;

  // The standard disclosure surface: settable+reflecting `open`, kai-open-change,
  // show/hide/toggle, disabled-gating. See ./disclosure. This is the SOLE emitter
  // of kai-open-change — the Tool/Collapsible no longer wires its own.
  wireDisclosure(ctx, () => api, () => props.open);

  return (
    <Show when={props.tool}>
      <Tool
        toolPart={props.tool!}
        defaultOpen={flag('defaultOpen')}
        disabled={flag('disabled')}
        controllerRef={(a) => (api = a)}
      />
    </Show>
  );
});
