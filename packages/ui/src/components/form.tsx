import {
  type JSX,
  For,
  Show,
  Index,
  splitProps,
  mergeProps,
  createMemo,
  createEffect,
  on,
  onMount,
  ErrorBoundary,
} from 'solid-js';
import { createStore, produce, unwrap } from 'solid-js/store';
import { cn } from '../utils/cn';
import { Button } from '../ui/button';
import { Card } from './card';
import { DismissedStub } from './dismissed-stub';
import {
  validateAgainstSchema,
  type JsonSchema,
} from '../primitives/card-validate';
import type { CardEnvelope, CardEvent, CardHost, CardResolution } from '../primitives/card-contract';
import { emitCardEvent } from '../primitives/card-routing';
import { useCardHost } from '../primitives/card-host';
import { useCardResolution } from './use-card-resolution';
import { Check } from 'lucide-solid';
import {
  TextWidget,
  TextareaWidget,
  NumberWidget,
  SliderWidget,
  RatingWidget,
  SwitchWidget,
  CheckboxWidget,
  RadioGroupWidget,
  SelectWidget,
  CheckboxGroupWidget,
  MultiSelectWidget,
  TagListWidget,
} from './form-widgets';

// ─────────────────────────────────────────────────────────────────────────────
// Types (the JSON-Schema subset kai-form renders) — see form.schema.json.
// ─────────────────────────────────────────────────────────────────────────────

// AUTHORED IN ../primitives/card-data-types.ts. See the note in confirm-card.tsx,
// or that file's header, for why they left a `.tsx` and why they are `type`
// aliases. `FormField` in particular CANNOT be an interface: it is
// self-referential, so the element-types generator can only inline it down to a
// `Record<string, unknown>` placeholder, and an interface is not assignable to
// that. Re-exported here unchanged.

import type { FormDefinition, FormField } from '../primitives/card-data-types';

export type {
  FormCardEnvelope,
  FormDefinition,
  FormField,
} from '../primitives/card-data-types';

/** The internal widget identifiers `widgetFor` resolves to. */
export type WidgetKind =
  | 'text'
  | 'textarea'
  | 'password'
  | 'email'
  | 'url'
  | 'date'
  | 'datetime'
  | 'time'
  | 'number'
  | 'slider'
  | 'rating'
  | 'switch'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'checkbox-group'
  | 'multiselect'
  | 'repeater'
  | 'taglist'
  | 'fieldset'
  | 'unsupported';

export const DEFAULT_INLINE_MAX = 4;

const VALID_HINTS = new Set([
  'textarea',
  'slider',
  'rating',
  'radio',
  'select',
  'checkbox',
  'password',
  'switch',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Pure mapping / validation / coercion helpers (unit-tested in isolation).
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve the widget for a field. An explicit valid `x-kai-widget` always wins;
 *  otherwise the type/format/enum/constraint combination selects the widget. */
export function widgetFor(field: FormField, inlineMax: number): WidgetKind {
  const hint = field['x-kai-widget'];
  if (hint && VALID_HINTS.has(hint)) {
    switch (hint) {
      case 'textarea':
        return 'textarea';
      case 'slider':
        return 'slider';
      case 'rating':
        return 'rating';
      case 'radio':
        return 'radio';
      case 'select':
        return 'select';
      case 'checkbox':
        return 'checkbox';
      case 'password':
        return 'password';
      case 'switch':
        return 'switch';
    }
  }

  switch (field.type) {
    case 'string': {
      if (Array.isArray(field.enum)) {
        return field.enum.length <= inlineMax ? 'radio' : 'select';
      }
      switch (field.format) {
        case 'email':
          return 'email';
        case 'uri':
        case 'url':
          return 'url';
        case 'date':
          return 'date';
        case 'date-time':
          return 'datetime';
        case 'time':
          return 'time';
      }
      if (field.maxLength !== undefined && field.maxLength > 120) return 'textarea';
      return 'text';
    }
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'switch';
    case 'array': {
      const items = field.items;
      if (items && 'enum' in items && Array.isArray(items.enum)) {
        return items.enum.length <= inlineMax ? 'checkbox-group' : 'multiselect';
      }
      if (items && 'type' in items && (items as FormField).type === 'object') return 'repeater';
      if (items && 'type' in items && (items as FormField).type === 'string') return 'taglist';
      return 'taglist';
    }
    case 'object':
      return 'fieldset';
    default:
      return 'unsupported';
  }
}

/** Humanize a camelCase / snake_case property key into a label. */
export function humanize(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Field order: `x-kai-order` (filtered to known keys, missing appended) if
 *  present, else `required` first then schema declaration order. */
export function orderedKeys(def: FormDefinition): string[] {
  const all = Object.keys(def.properties ?? {});
  const order = def['x-kai-order'];
  if (Array.isArray(order)) {
    const known = order.filter((k) => all.includes(k));
    const rest = all.filter((k) => !known.includes(k));
    return [...known, ...rest];
  }
  const required = (def.required ?? []).filter((k) => all.includes(k));
  const rest = all.filter((k) => !required.includes(k));
  return [...required, ...rest];
}

/** Coerce a raw control value to the field's JSON type. Empty number string →
 *  undefined; number/integer → Number; boolean → real boolean. */
export function coerceValue(field: FormField, raw: unknown): unknown {
  if (field.type === 'number' || field.type === 'integer') {
    if (raw === '' || raw === null || raw === undefined) return undefined;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (field.type === 'boolean') return Boolean(raw);
  return raw;
}

const EMAIL_RE = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

/** Translate a FormField into the lean-validator JsonSchema (incl. format→pattern). */
function toJsonSchema(field: FormField): JsonSchema {
  const s: JsonSchema = { type: field.type };
  if (field.enum) s.enum = field.enum;
  if (field.minimum !== undefined) s.minimum = field.minimum;
  if (field.maximum !== undefined) s.maximum = field.maximum;
  if (field.minLength !== undefined) s.minLength = field.minLength;
  if (field.maxLength !== undefined) s.maxLength = field.maxLength;
  if (field.minItems !== undefined) s.minItems = field.minItems;
  if (field.maxItems !== undefined) s.maxItems = field.maxItems;
  if (field.pattern !== undefined) s.pattern = field.pattern;
  else if (field.format === 'email') s.pattern = EMAIL_RE;
  return s;
}

export interface FormValidation {
  valid: boolean;
  fieldErrors: Record<string, string>;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Full client-side validation of `values` against the form definition. Returns a
 *  per-field error map (the contract validator subset, applied field-by-field so
 *  each field can show its own inline message). */
export function validateForm(def: FormDefinition, values: Record<string, unknown>): FormValidation {
  const fieldErrors: Record<string, string> = {};
  const required = new Set(def.required ?? []);

  for (const [key, field] of Object.entries(def.properties ?? {})) {
    const v = values[key];
    if (required.has(key) && isEmpty(v)) {
      fieldErrors[key] = `${field.title ?? humanize(key)} is required.`;
      continue;
    }
    if (isEmpty(v)) continue; // optional + empty → skip per-field checks
    const result = validateAgainstSchema(toJsonSchema(field), v);
    if (!result.valid) {
      fieldErrors[key] = friendlyError(field, key, result.errors[0]);
    }
  }

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors };
}

function friendlyError(field: FormField, key: string, raw?: string): string {
  const label = field.title ?? humanize(key);
  if (!raw) return `${label} is invalid.`;
  if (raw.includes('minimum')) return `${label} must be at least ${field.minimum}.`;
  if (raw.includes('maximum')) return `${label} must be at most ${field.maximum}.`;
  if (raw.includes('minLength')) return `${label} must be at least ${field.minLength} characters.`;
  if (raw.includes('maxLength')) return `${label} must be at most ${field.maxLength} characters.`;
  if (raw.includes('pattern')) {
    return field.format === 'email'
      ? `${label} must be a valid email address.`
      : `${label} is not in the expected format.`;
  }
  if (raw.includes('one of')) return `${label} must be one of the allowed options.`;
  if (raw.includes('expected integer')) return `${label} must be a whole number.`;
  if (raw.includes('expected')) return `${label} is invalid.`;
  if (raw.includes('minItems')) return `${label}: choose at least ${field.minItems}.`;
  if (raw.includes('maxItems')) return `${label}: choose at most ${field.maxItems}.`;
  return `${label} is invalid.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only summary helpers (unit-tested in form-summary.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export interface FormSummaryRow { key: string; label: string; value: string; }

/** Format one field's value for the read-only summary. */
export function formatFieldValue(field: FormField | undefined, raw: unknown): string {
  if (field?.['x-kai-widget'] === 'password') {
    return raw == null || raw === '' ? '—' : '••••';
  }
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (raw == null || raw === '') return '—';
  if (Array.isArray(raw)) return raw.length ? raw.map((v) => String(v)).join(', ') : '—';
  return String(raw);
}

/** Build the label→value rows for a submitted form, honoring x-kai-order. */
export function summarizeForm(def: FormDefinition, data: Record<string, unknown>): FormSummaryRow[] {
  const props = def.properties ?? {};
  const ordered =
    Array.isArray(def['x-kai-order']) && def['x-kai-order']!.length > 0
      ? def['x-kai-order']!.filter((k) => k in props)
      : Object.keys(props);
  return ordered.map((key) => {
    const field = props[key];
    return { key, label: field?.title ?? key, value: formatFieldValue(field, data[key]) };
  });
}

/** Build the result object: coerced values with empty optional fields omitted.
 *  `false` and `0` are kept (they are real values, not "empty"). */
export function buildResult(
  def: FormDefinition,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(def.properties ?? {})) {
    const field = def.properties[key];
    const coerced = coerceValue(field, values[key]);
    if (coerced === undefined || coerced === '' ) continue;
    if (Array.isArray(coerced) && coerced.length === 0) continue;
    out[key] = coerced;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The <Form> component.
// ─────────────────────────────────────────────────────────────────────────────

/** Imperative handle exposed via `controllerRef` — surfaces the form's latent
 *  capabilities (focus the first/first-invalid control, validate, programmatic
 *  send, reset to defaults, dismiss/reopen) so the `<kai-form>` facade can forward
 *  them as instance methods. */
export interface FormController {
  /** Focus the first control, or the first INVALID control after a failed validation. */
  focus(options?: FocusOptions): void;
  /** Run full validation + submit: focus the first invalid field on failure, else emit `submit`. */
  send(): void;
  /** Run client-side validation now and return per-field errors WITHOUT submitting. */
  validate(): { valid: boolean; errors?: Record<string, string> };
  /** Re-seed from each field's `default` and clear errors. */
  reset(): void;
  /** Trigger the dismiss path (emit `dismiss` + collapse to the re-openable stub). */
  dismiss(): void;
  /** Re-open a dismissed card from its stub (emit `reopen`). */
  reopen(): void;
}

export interface FormProps {
  /** The form definition (CardEnvelope.data). */
  data?: FormDefinition;
  /** The card id used to correlate every emitted CardEvent. */
  cardId?: string;
  /** The envelope title rendered in the card chrome. */
  heading?: string;
  /** Optional explicit CardHost (otherwise read from a CardProvider, otherwise the
   *  bubbling `kai-card` CustomEvent off `hostElement`). */
  host?: CardHost;
  /** The custom-element host node, for the bubbling `kai-card` fallback emit. */
  hostElement?: HTMLElement;
  class?: string;
  /** When set, render the chromed read-only view instead of the form inputs. */
  resolution?: CardResolution;
  /** Controlled field values — when set, this wins over internal/uncontrolled state. */
  values?: Record<string, unknown>;
  /** Initial values overlaying the schema defaults (uncontrolled seed). */
  defaultValues?: Record<string, unknown>;
  /** Disable all fields + submit. */
  disabled?: boolean;
  /** Fires on input with the current coerced values + validity (distinct from submit). */
  onValuesChange?: (payload: { values: Record<string, unknown>; valid: boolean }) => void;
  /** Receive the imperative controller once mounted. */
  controllerRef?: (controller: FormController) => void;
}

const DEFAULT_FORM: FormDefinition = { type: 'object', properties: {} };

/**
 * `Form` — renders a JSON-Schema form definition into themed, accessible widgets
 * inside `Card` chrome, validates input against that schema, and emits the
 * collected, coerced, validated object up the Card contract as `submit`.
 * Reads context/emits via a `CardProvider` when present, else the bubbling
 * `kai-card` CustomEvent.
 */
export function Form(props: FormProps): JSX.Element {
  const merged = mergeProps({ cardId: 'kai-form' }, props);
  const [local] = splitProps(merged, [
    'data', 'cardId', 'heading', 'host', 'hostElement', 'class', 'resolution',
    'values', 'defaultValues', 'disabled', 'onValuesChange', 'controllerRef',
  ]);

  const ctxHost = useCardHost();

  const emit = (event: CardEvent): void => {
    const h = local.host ?? ctxHost;
    if (h) h.emit(event);
    else if (local.hostElement) emitCardEvent(local.hostElement, event);
  };

  // Validate the incoming definition against form.schema.json's shape (the lean
  // subset). A malformed definition → inline error + an `error` event.
  const envelopeValid = createMemo(() => {
    const d = local.data;
    if (!d) return { ok: false, message: 'No form definition provided.' };
    if (d.type !== 'object' || typeof d.properties !== 'object' || d.properties === null) {
      return { ok: false, message: "This form couldn't be displayed." };
    }
    return { ok: true as const, message: '' };
  });

  const def = createMemo<FormDefinition>(() => (envelopeValid().ok ? local.data ?? DEFAULT_FORM : DEFAULT_FORM));
  const inlineMax = () => def()['x-kai-inlineMax'] ?? DEFAULT_INLINE_MAX;
  const keys = createMemo(() => orderedKeys(def()));

  const res = useCardResolution({ prop: () => local.resolution, data: () => local.data });

  // The reactive values store, seeded from each field's `default`.
  const [values, setValues] = createStore<Record<string, unknown>>({});
  const [errors, setErrors] = createStore<Record<string, string>>({});

  // Build the seed value map: schema `default`s, overlaid by `defaultValues`, then
  // (when controlled) the live `values` prop. The controlled prop always wins.
  const seedMap = (d: FormDefinition): Record<string, unknown> => {
    const next: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(d.properties ?? {})) {
      if (field.default !== undefined) next[key] = field.default;
      else if (field.type === 'array') next[key] = [];
    }
    if (local.defaultValues) Object.assign(next, local.defaultValues);
    if (local.values) Object.assign(next, local.values);
    return next;
  };

  const seed = (d: FormDefinition): void => {
    const next = seedMap(d);
    setValues(produce((s) => {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, next);
    }));
    setErrors(produce((s) => {
      for (const k of Object.keys(s)) delete s[k];
    }));
  };

  // Reset to defaults only (ignore the controlled `values`/`defaultValues` overlay):
  // re-seed from each field's schema `default` and clear errors. Used by reset().
  const seedDefaults = (): void => {
    const d = def();
    const next: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(d.properties ?? {})) {
      if (field.default !== undefined) next[key] = field.default;
      else if (field.type === 'array') next[key] = [];
    }
    setValues(produce((s) => {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, next);
    }));
    setErrors(produce((s) => {
      for (const k of Object.keys(s)) delete s[k];
    }));
  };

  // Reseed whenever a NEW valid definition arrives.
  createEffect(on(() => local.data, () => { if (envelopeValid().ok) seed(def()); }));

  // Controlled values: when the consumer drives `values`, mirror it into the store
  // (the controlled prop wins over local edits). Deferred so mount's seed runs first.
  createEffect(on(() => local.values, (v) => {
    if (!v) return;
    setValues(produce((s) => {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, v);
    }));
  }, { defer: true }));

  // ready + error lifecycle emits.
  createEffect(on(envelopeValid, (state) => {
    if (state.ok) emit({ kind: 'ready', cardId: local.cardId });
    else emit({ kind: 'error', cardId: local.cardId, message: state.message });
  }));

  // Surface the resolved state for host styling. Only a `submit` resolution is the
  // "submitted" state; a deferred `dismissed` (or `expired`) is not.
  createEffect(() => {
    const el = local.hostElement;
    if (!el) return;
    if (res.resolution()?.kind === 'submit') el.setAttribute('data-kai-resolved', 'submitted');
    else el.removeAttribute('data-kai-resolved');
  });

  const setField = (key: string, raw: unknown): void => {
    setValues(key, raw);
    if (errors[key]) setErrors(key, undefined as unknown as string);
    // Fire the live change signal: current coerced values + validity (distinct from
    // the terminal submit). Validation here is read-only — it doesn't surface errors.
    const snapshot = unwrap(values) as Record<string, unknown>;
    const out = buildResult(def(), snapshot);
    const { valid } = validateForm(def(), snapshot);
    local.onValuesChange?.({ values: out, valid });
  };

  const validateField = (key: string): void => {
    const field = def().properties[key];
    if (!field) return;
    const single = validateForm(
      { type: 'object', required: def().required, properties: { [key]: field } },
      { [key]: values[key] },
    );
    setErrors(key, single.fieldErrors[key]);
  };

  // Resolve the root to query controls inside (the live <form> when called from the
  // submit event, else the host element's shadow root for a programmatic call).
  const queryRoot = (formEl?: HTMLElement | null): ParentNode =>
    formEl?.closest('form') ?? formEl ?? local.hostElement?.shadowRoot ?? document;

  // Focus the control for a field key (the `[data-control]` inside its `[data-field]`).
  const focusControl = (key: string, root: ParentNode, options?: FocusOptions): void => {
    root.querySelector<HTMLElement>(`[data-field="${cssEscape(key)}"] [data-control]`)?.focus(options);
  };

  // Run full validation; on failure surface the per-field errors + focus the first
  // invalid control and return false; on success emit `submit` + resolve. Shared by
  // the form's onSubmit handler and the controller's send().
  const runSubmit = (formEl?: HTMLElement | null): boolean => {
    if (res.isResolved()) return false;
    const snapshot = unwrap(values);
    const result = validateForm(def(), snapshot as Record<string, unknown>);
    setErrors(produce((s) => {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, result.fieldErrors);
    }));
    if (!result.valid) {
      const firstBad = keys().find((k) => result.fieldErrors[k]);
      if (firstBad) {
        const root = queryRoot(formEl);
        queueMicrotask(() => focusControl(firstBad, root));
      }
      return false;
    }
    const out = buildResult(def(), snapshot as Record<string, unknown>);
    emit({ kind: 'submit', cardId: local.cardId, data: out });
    res.setLocal({ kind: 'submit', data: out });
    return true;
  };

  const onSubmit = (e: Event): void => {
    e.preventDefault();
    // Capture the <form> synchronously — `e.currentTarget` is nulled out once the
    // event has finished dispatching (so it can't be read in a later microtask).
    runSubmit(e.currentTarget as HTMLElement | null);
  };

  // Dismiss: emit `dismiss` AND optimistically flip to a `dismissed` resolution so
  // the form collapses to its re-openable stub immediately.
  const onDismiss = (): void => {
    if (res.isResolved()) return;
    emit({ kind: 'dismiss', cardId: local.cardId });
    res.setLocal({ kind: 'dismissed' });
  };
  const onReopen = (): void => emit({ kind: 'reopen', cardId: local.cardId });

  const disabled = (): boolean => local.disabled === true;

  // Imperative controller (Pattern C): hand the facade a handle over the form's
  // latent capabilities. focus targets the first control (or the first INVALID one
  // after a failed validation); validate runs the existing validateForm and surfaces
  // the per-field errors WITHOUT submitting; send runs the same path as the Submit
  // button; reset re-seeds from schema defaults; dismiss/reopen drive the stub.
  onMount(() => {
    local.controllerRef?.({
      focus: (options) => {
        const root = queryRoot();
        const firstBad = keys().find((k) => errors[k]);
        const target = firstBad ?? keys()[0];
        if (target) focusControl(target, root, options);
      },
      send: () => { runSubmit(); },
      validate: () => {
        const snapshot = unwrap(values) as Record<string, unknown>;
        const result = validateForm(def(), snapshot);
        setErrors(produce((s) => {
          for (const k of Object.keys(s)) delete s[k];
          Object.assign(s, result.fieldErrors);
        }));
        return result.valid
          ? { valid: true }
          : { valid: false, errors: result.fieldErrors };
      },
      reset: () => seedDefaults(),
      dismiss: () => onDismiss(),
      reopen: () => onReopen(),
    });
  });

  const actions = createMemo(() => def()['x-kai-actions'] ?? []);
  const submitLabel = () => def()['x-kai-submitLabel'] ?? 'Submit';
  const dismissible = () => def()['x-kai-dismissible'] === true;

  const summaryRows = createMemo(() => {
    const r = res.resolution();
    if (!r || r.kind !== 'submit') return [];
    return summarizeForm(def(), (r.data ?? {}) as Record<string, unknown>);
  });

  return (
    <Show
      when={envelopeValid().ok}
      fallback={<Card heading={local.heading} errorMessage={envelopeValid().message} />}
    >
      <ErrorBoundary
        fallback={() => {
          emit({ kind: 'error', cardId: local.cardId, message: 'The form failed to render.' });
          return <Card heading={local.heading} errorMessage="The form failed to render." />;
        }}
      >
        <Show
          when={!res.isDeferred()}
          fallback={
            <DismissedStub type="form" title={local.heading ?? def().title} onReopen={onReopen} />
          }
        >
        <Card
          heading={local.heading ?? def().title}
          description={def().description}
          actions={
            <Show
              when={!res.isResolved()}
              fallback={undefined}
            >
              <div class="flex w-full flex-wrap items-center justify-between gap-2">
                <Show when={dismissible()}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onDismiss}
                  >
                    Dismiss
                  </Button>
                </Show>
                <div class="ml-auto flex flex-wrap items-center gap-2">
                  <For each={actions()}>
                    {(action) => (
                      <Button
                        type="button"
                        variant={action.variant ?? 'ghost'}
                        onClick={() => emit({ kind: 'action', cardId: local.cardId, action: action.id })}
                      >
                        {action.label}
                      </Button>
                    )}
                  </For>
                  <Button type="submit" form={formId()} disabled={disabled()}>
                    {submitLabel()}
                  </Button>
                </div>
              </div>
            </Show>
          }
        >
          <Show
            when={!res.isResolved()}
            fallback={<ResolvedForm rows={summaryRows()} optimistic={res.isOptimistic()} />}
          >
            <form
              id={formId()}
              class={cn('flex flex-col gap-3', local.class)}
              novalidate
              onSubmit={onSubmit}
            >
              <For each={keys()}>
                {(key) => (
                  <FieldRow
                    fieldKey={key}
                    field={def().properties[key]}
                    required={(def().required ?? []).includes(key)}
                    inlineMax={inlineMax()}
                    value={() => values[key]}
                    error={() => errors[key]}
                    disabled={disabled()}
                    onInput={(v) => setField(key, v)}
                    onBlur={() => validateField(key)}
                  />
                )}
              </For>
            </form>
          </Show>
        </Card>
        </Show>
      </ErrorBoundary>
    </Show>
  );
}

// A stable per-instance form id so the footer submit button can target the form.
let formIdCounter = 0;
const formIdValue = `kai-form-${++formIdCounter}`;
function formId(): string {
  return formIdValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only resolved view presenter.
// ─────────────────────────────────────────────────────────────────────────────

function ResolvedForm(props: { rows: FormSummaryRow[]; optimistic: boolean }): JSX.Element {
  return (
    <div class="flex flex-col gap-3" role={props.optimistic ? 'status' : undefined}>
      <p class="flex items-center gap-2 text-sm font-medium text-foreground">
        <Check size={16} aria-hidden="true" />
        <span>Submitted</span>
      </p>
      <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        <For each={props.rows}>
          {(row) => (
            <>
              <dt class="text-xs text-muted-foreground">{row.label}</dt>
              <dd class="m-0 text-sm font-medium text-foreground">{row.value}</dd>
            </>
          )}
        </For>
      </dl>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-field row: label + control + help + error, dispatching to the right widget.
// ─────────────────────────────────────────────────────────────────────────────

interface FieldRowProps {
  fieldKey: string;
  field: FormField;
  required: boolean;
  inlineMax: number;
  value: () => unknown;
  error: () => string | undefined;
  disabled: boolean;
  onInput: (value: unknown) => void;
  onBlur: () => void;
}

function FieldRow(props: FieldRowProps): JSX.Element {
  const id = `f-${props.fieldKey}-${Math.random().toString(36).slice(2, 8)}`;
  const errorId = `${id}-err`;
  const descId = `${id}-desc`;
  const label = () => props.field.title ?? humanize(props.fieldKey);
  const widget = createMemo(() => widgetFor(props.field, props.inlineMax));
  const placeholder = () => props.field['x-kai-placeholder'];
  const describedBy = () =>
    [props.field.description ? descId : '', props.error() ? errorId : '']
      .filter(Boolean)
      .join(' ') || undefined;

  const common = () => ({
    id,
    value: props.value(),
    field: props.field,
    disabled: props.disabled || props.field.readOnly === true,
    placeholder: placeholder(),
    required: props.required,
    invalid: Boolean(props.error()),
    describedBy: describedBy(),
    label: label(),
    onInput: props.onInput,
    onBlur: props.onBlur,
  });

  // A nested fieldset / repeater / checkbox-group provide their own grouping
  // label, so the row's <label> is only rendered for simple single controls.
  const isGrouped = () =>
    ['fieldset', 'repeater', 'checkbox-group', 'multiselect', 'radio', 'taglist'].includes(widget());

  return (
    <div class="flex flex-col gap-2 rounded-xl bg-surface p-3.5" data-field={props.fieldKey}>
      <Show when={!isGrouped()}>
        <label for={id} class="text-sm font-medium text-foreground">
          {label()}
          <Show when={props.required}>
            <span class="text-destructive dark:text-red-400" aria-hidden="true">{' *'}</span>
          </Show>
        </label>
      </Show>

      <Show when={props.field.description}>
        <p id={descId} class="text-xs text-muted-foreground">
          {props.field.description}
        </p>
      </Show>

      <WidgetSwitch widget={widget()} common={common()} fieldKey={props.fieldKey} />

      <Show when={props.error()}>
        <p id={errorId} role="alert" class="text-xs text-destructive dark:text-red-400">
          {props.error()}
        </p>
      </Show>
    </div>
  );
}

interface WidgetSwitchProps {
  widget: WidgetKind;
  fieldKey: string;
  common: ReturnType<FieldRowCommon>;
}
type FieldRowCommon = () => {
  id: string;
  value: unknown;
  field: FormField;
  disabled: boolean;
  placeholder?: string;
  required: boolean;
  invalid: boolean;
  describedBy?: string;
  label: string;
  onInput: (v: unknown) => void;
  onBlur: () => void;
};

/** Dispatch to the concrete widget for `widget`. */
function WidgetSwitch(props: WidgetSwitchProps): JSX.Element {
  const w = () => props.widget;
  const c = () => props.common;
  return (
    <>
      <Show when={w() === 'text' || w() === 'email' || w() === 'url' || w() === 'date' || w() === 'datetime' || w() === 'time' || w() === 'password'}>
        <TextWidget {...c()} variant={w() as 'text' | 'email' | 'url' | 'date' | 'datetime' | 'time' | 'password'} />
      </Show>
      <Show when={w() === 'textarea'}>
        <TextareaWidget {...c()} />
      </Show>
      <Show when={w() === 'number'}>
        <NumberWidget {...c()} />
      </Show>
      <Show when={w() === 'slider'}>
        <SliderWidget {...c()} />
      </Show>
      <Show when={w() === 'rating'}>
        <RatingWidget {...c()} />
      </Show>
      <Show when={w() === 'switch'}>
        <SwitchWidget {...c()} />
      </Show>
      <Show when={w() === 'checkbox'}>
        <CheckboxWidget {...c()} />
      </Show>
      <Show when={w() === 'radio'}>
        <RadioGroupWidget {...c()} />
      </Show>
      <Show when={w() === 'select'}>
        <SelectWidget {...c()} />
      </Show>
      <Show when={w() === 'checkbox-group'}>
        <CheckboxGroupWidget {...c()} />
      </Show>
      <Show when={w() === 'multiselect'}>
        <MultiSelectWidget {...c()} />
      </Show>
      <Show when={w() === 'taglist'}>
        <TagListWidget {...c()} />
      </Show>
      <Show when={w() === 'repeater'}>
        <RepeaterWidget {...c()} inlineMax={DEFAULT_INLINE_MAX} />
      </Show>
      <Show when={w() === 'fieldset'}>
        <FieldsetWidget {...c()} inlineMax={DEFAULT_INLINE_MAX} />
      </Show>
      <Show when={w() === 'unsupported'}>
        <p class="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
          Unsupported field "{props.fieldKey}".
        </p>
      </Show>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite widgets that need the FormField recursion (fieldset + repeater).
// They live here (not form-widgets) to reuse FieldRow/Switch + the helpers.
// ─────────────────────────────────────────────────────────────────────────────

interface CompositeProps {
  id: string;
  value: unknown;
  field: FormField;
  disabled: boolean;
  required: boolean;
  invalid: boolean;
  describedBy?: string;
  label: string;
  inlineMax: number;
  onInput: (v: unknown) => void;
  onBlur: () => void;
}

function FieldsetWidget(props: CompositeProps): JSX.Element {
  const subProps = () => props.field.properties ?? {};
  const obj = () => (props.value && typeof props.value === 'object' ? (props.value as Record<string, unknown>) : {});
  const setKey = (k: string, v: unknown): void => {
    props.onInput({ ...obj(), [k]: v });
  };
  return (
    <fieldset class="flex flex-col gap-3 rounded-lg border border-border p-3">
      <legend class="px-1 text-sm font-medium text-foreground">{props.label}</legend>
      <For each={Object.keys(subProps())}>
        {(k) => (
          <FieldRow
            fieldKey={k}
            field={subProps()[k]}
            required={(props.field.required ?? []).includes(k)}
            inlineMax={props.inlineMax}
            value={() => obj()[k]}
            error={() => undefined}
            disabled={props.disabled}
            onInput={(v) => setKey(k, v)}
            onBlur={props.onBlur}
          />
        )}
      </For>
    </fieldset>
  );
}

function RepeaterWidget(props: CompositeProps): JSX.Element {
  const itemSchema = () => (props.field.items as FormField) ?? { type: 'object', properties: {} };
  const rows = () => (Array.isArray(props.value) ? (props.value as unknown[]) : []);
  const setRows = (next: unknown[]): void => props.onInput(next);
  const addRow = (): void => setRows([...rows(), {}]);
  const removeRow = (i: number): void => setRows(rows().filter((_, idx) => idx !== i));
  const setRowKey = (i: number, k: string, v: unknown): void => {
    const next = rows().slice();
    next[i] = { ...(next[i] as Record<string, unknown>), [k]: v };
    setRows(next);
  };

  return (
    <fieldset class="flex flex-col gap-3 rounded-lg border border-border p-3" data-control>
      <legend class="px-1 text-sm font-medium text-foreground">{props.label}</legend>
      <Index each={rows()}>
        {(row, i) => (
          <div class="flex flex-col gap-2 rounded-md border border-border/60 p-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted-foreground">Item {i + 1}</span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove row ${i + 1}`}
                disabled={props.disabled}
                onClick={() => removeRow(i)}
              >
                ✕
              </Button>
            </div>
            <For each={Object.keys(itemSchema().properties ?? {})}>
              {(k) => (
                <FieldRow
                  fieldKey={k}
                  field={itemSchema().properties![k]}
                  required={(itemSchema().required ?? []).includes(k)}
                  inlineMax={props.inlineMax}
                  value={() => (row() as Record<string, unknown>)?.[k]}
                  error={() => undefined}
                  disabled={props.disabled}
                  onInput={(v) => setRowKey(i, k, v)}
                  onBlur={props.onBlur}
                />
              )}
            </For>
          </div>
        )}
      </Index>
      <Button type="button" variant="outline" size="sm" disabled={props.disabled} onClick={addRow}>
        Add item
      </Button>
    </fieldset>
  );
}

/** Minimal CSS.escape fallback for attribute-selector building. */
function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/["\\]/g, '\\$&');
}
