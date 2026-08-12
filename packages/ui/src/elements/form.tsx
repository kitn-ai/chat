import { defineWebComponent } from './define';
import { Form, type FormController, type FormDefinition } from '../components/form';
import type { CardResolution } from '../primitives/card-contract';

interface Props extends Record<string, unknown> {
  /** The form definition: a JSON Schema (`type:'object'`) + `x-kai-*` UI hints
   *  (the CardEnvelope.data). Set as a JS PROPERTY: `el.data = { type:'object',
   *  properties:{…} }`. Import the `FormDefinition` type from `@kitn.ai/ui` for
   *  the full shape (it is self-referential, so the element types it loosely). */
  data?: Record<string, unknown>;
  /** Stable card id correlating every emitted CardEvent. Attribute: `card-id`. */
  cardId?: string;
  /** Heading rendered in the card chrome (= CardEnvelope.title). Attribute: `heading`. */
  heading?: string;
  /** Set when the user resolved this card; renders the read-only view. Property:
   *  `el.resolution = { kind:'submit', data:{…} }`. */
  resolution?: Record<string, unknown>;
  /** Controlled field values (JS property). When set, it wins over local edits. */
  values?: Record<string, unknown>;
  /** Initial values overlaying the schema defaults (uncontrolled seed; JS property). */
  defaultValues?: Record<string, unknown>;
  /** Disable all fields + submit. Attribute: `disabled`. */
  disabled?: boolean;
}

/** Events fired by `<kai-form>`. (Resolution still flows up the bubbling `kai-card`
 *  contract event — `kai-values-change` is the live change signal, distinct from the
 *  terminal submit.) */
interface Events {
  /** The form's values changed on input. Carries the current coerced values +
   *  validity. */
  'kai-values-change': { values: Record<string, unknown>; valid: boolean };
}

/**
 * `<kai-form>` — renders a JSON-Schema **form definition** (set via the `data`
 * property) into themed, accessible widgets inside `<kai-card>` chrome, validates
 * input client-side, and emits the collected, coerced, validated object up the
 * Card contract as a bubbling **`kai-card`** CustomEvent of `{ kind:'submit' }`.
 * It also emits `ready` on mount, `action`/`dismiss` for secondary affordances, and
 * `error` for a malformed definition. Routes through a `CardProvider` when present,
 * else the bubbling `kai-card` event (so a bare `<kai-form>` works without a host).
 * Isolated in Shadow DOM; theme-aware via the shared kit tokens.
 */
defineWebComponent<Props, Events>('kai-form', {
  data: undefined,
  cardId: undefined,
  heading: undefined,
  resolution: undefined,
  values: undefined,
  defaultValues: undefined,
  disabled: false,
}, (props, { element, dispatch, flag, expose }) => {
  // Pattern C: the Form component owns the value store + validation and hands up a
  // controller; the facade captures it and exposes delegating instance methods.
  let controller: FormController | undefined;
  expose({
    /** Focus the first control, or the first INVALID control after a failed validation. */
    focus: (options?: FocusOptions) => controller?.focus(options),
    /** Validate + submit programmatically: focus the first invalid field on failure,
     *  else emit the `submit` CardEvent and resolve. Named `send`, not `submit`. */
    send: () => controller?.send(),
    /** Run client-side validation now and return `{ valid, errors? }` WITHOUT submitting. */
    validate: () => controller?.validate() ?? { valid: false },
    /** Re-seed the form from each field's `default` and clear errors. */
    reset: () => controller?.reset(),
    /** Trigger the dismiss path (emit `dismiss` + collapse to the re-openable stub). */
    dismiss: () => controller?.dismiss(),
    /** Re-open a dismissed card from its stub (emit `reopen`). */
    reopen: () => controller?.reopen(),
  });

  return (
    <Form
      data={props.data as FormDefinition | undefined}
      cardId={props.cardId ?? (element.id || 'kai-form')}
      heading={props.heading}
      resolution={props.resolution as CardResolution | undefined}
      values={props.values as Record<string, unknown> | undefined}
      defaultValues={props.defaultValues as Record<string, unknown> | undefined}
      disabled={flag('disabled')}
      onValuesChange={(payload) => dispatch('kai-values-change', payload)}
      controllerRef={(c) => (controller = c)}
      hostElement={element}
    />
  );
});
