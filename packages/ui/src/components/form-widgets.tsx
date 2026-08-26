import { type JSX, For, Show, createMemo, createSignal } from 'solid-js';
import { cn } from '../utils/cn';
import { Textarea } from '../ui/textarea';
import { Input, FIELD_BASE as inputBase } from '../ui/input';
import { Slider } from '../ui/slider';
import { Select } from '../ui/select';
import { Switch } from '../ui/switch';
import { Checkbox } from '../ui/checkbox';
import { RadioGroup } from '../ui/radio';
import { CheckboxGroup } from '../ui/checkbox-group';
import { Button } from '../ui/button';
import { Star, X } from 'lucide-solid';
import type { FieldMaskHint, FormField } from './form';

/** The shared prop shape every leaf widget receives from FieldRow. */
export interface WidgetProps {
  id: string;
  value: unknown;
  field: FormField;
  /**
   * The field's resolved format hints, or an empty resolution.
   *
   * RESOLVED IN `FieldRow`, not here. The row already has to resolve them to render
   * the format hint text and put its id in `aria-describedby`, and resolving the same
   * untrusted `x-kai-*` keys a second time in the widget would warn twice about the
   * same bad hint and could disagree with what the row said out loud.
   */
  mask?: FieldMaskHint;
  disabled: boolean;
  placeholder?: string;
  required: boolean;
  invalid: boolean;
  describedBy?: string;
  label: string;
  /**
   * The id of the row's VISIBLE label element, for widgets whose control is a group
   * rather than one labelable input.
   *
   * `FieldRow` used to suppress its `<label>` for those kinds and each widget named
   * itself with `aria-label={props.label}`, which is a name only a screen reader can
   * reach: "Severity", "Environments" and "Tags" were announced and invisible. The row
   * now always renders the text and hands its id down here, so one string names the
   * group and everybody can see it. Absent means the widget is on its own (a bare
   * widget rendered outside `FieldRow`), so `aria-label` stays the fallback.
   */
  labelledBy?: string;
  onInput: (value: unknown) => void;
  onBlur: () => void;
}

/**
 * How a GROUP widget names itself: the row's visible label when there is one,
 * `aria-label` only as the fallback. Never both — two accessible names on one element
 * is one too many, and `aria-labelledby` would win silently anyway.
 */
function groupNameProps(p: WidgetProps): { 'aria-labelledby'?: string; 'aria-label'?: string } {
  return p.labelledBy !== undefined
    ? { 'aria-labelledby': p.labelledBy }
    : { 'aria-label': p.label };
}

function ariaProps(p: WidgetProps) {
  return {
    'aria-required': p.required || undefined,
    'aria-invalid': p.invalid || undefined,
    'aria-describedby': p.describedBy,
  };
}

/** text / email / url / date / datetime / time / password — all <input> variants. */
export function TextWidget(
  props: WidgetProps & { variant: 'text' | 'email' | 'url' | 'date' | 'datetime' | 'time' | 'password' },
): JSX.Element {
  const inputType = () => {
    switch (props.variant) {
      case 'email':
        return 'email';
      case 'url':
        return 'url';
      case 'date':
        return 'date';
      case 'datetime':
        return 'datetime-local';
      case 'time':
        return 'time';
      case 'password':
        return 'password';
      default:
        return 'text';
    }
  };
  // Render the bare `Input` control (no label/hint/error): `kai-form`'s FieldRow
  // already supplies the label, description, and inline error around the widget.
  // `Input` owns the field styling (its `FIELD_BASE` is the former `inputBase`),
  // so the rendered input is byte-identical to the old raw `<input>`.
  return (
    <Input
      id={props.id}
      data-control
      type={inputType()}
      value={(props.value as string) ?? ''}
      placeholder={props.placeholder}
      invalid={props.invalid}
      disabled={props.disabled}
      minLength={props.field.minLength}
      maxLength={props.field.maxLength}
      // Masking (spec §7.3). Each is `undefined` for a field with no format hints, so
      // an unhinted field renders exactly the input it rendered before. The hint TEXT
      // is deliberately not passed as `Input`'s own `hint`: `FieldRow` renders it and
      // owns the `aria-describedby` chain, and `Input`'s hint would mint a second one
      // (spec §6). The submitted value is the CANONICAL one — `Input` emits canonical
      // through `onValueInput` whenever a mask is active (spec §4), which is what
      // makes "exactly one value per field" true without this widget choosing.
      format={props.mask?.format}
      guide={props.mask?.guide}
      semantic={props.mask?.semantic}
      {...ariaProps(props)}
      onValueInput={(value) => props.onInput(value)}
      onValueChange={() => props.onBlur()}
    />
  );
}

export function TextareaWidget(props: WidgetProps): JSX.Element {
  const len = () => ((props.value as string) ?? '').length;
  return (
    <div class="flex flex-col gap-1">
      <Textarea
        id={props.id}
        data-control
        class={cn(inputBase, props.invalid && 'border-destructive dark:border-red-400/70')}
        value={(props.value as string) ?? ''}
        placeholder={props.placeholder}
        disabled={props.disabled}
        maxLength={props.field.maxLength}
        {...ariaProps(props)}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onBlur={props.onBlur}
      />
      <Show when={props.field.maxLength !== undefined}>
        <span class="self-end text-xs text-muted-foreground">
          {len()}/{props.field.maxLength}
        </span>
      </Show>
    </div>
  );
}

export function NumberWidget(props: WidgetProps): JSX.Element {
  const step = () => props.field['x-kai-step'] ?? (props.field.type === 'integer' ? 1 : undefined);
  // `Input`, not a raw `<input class={inputBase}>` (plan step 6). The two render the
  // same box — `FIELD_BASE` is the former `inputBase` — so nothing is visible. What the
  // bypass lost was the focus-node-reuse fix documented at `ui/input.tsx:262-268`: with
  // the class computed at the CALL SITE, `props.invalid` changing rebuilt the `<input>`
  // node and took focus and caret with it, and `kai-form` derives `invalid` from the
  // field's own value. `min`/`max`/`step` come from the schema and are forwarded
  // untouched; no bound is invented here.
  //
  // No `format`/`guide`/`semantic`: masking is a text-field affordance and a
  // `type="number"` field has no mask hints to resolve.
  return (
    <Input
      id={props.id}
      data-control
      type="number"
      value={props.value === undefined || props.value === null ? '' : String(props.value)}
      placeholder={props.placeholder}
      invalid={props.invalid}
      disabled={props.disabled}
      min={props.field.minimum}
      max={props.field.maximum}
      step={step()}
      {...ariaProps(props)}
      onValueInput={(value) => props.onInput(value)}
      onValueChange={() => props.onBlur()}
    />
  );
}

export function SliderWidget(props: WidgetProps): JSX.Element {
  // The 0..100 fallback is the WIDGET's, not the primitive's (plan §4). This widget is
  // reading a consumer-authored JSON-Schema field where `minimum`/`maximum` are
  // optional; `Slider` itself requires both, so no other caller inherits this guess.
  const min = () => props.field.minimum ?? 0;
  const max = () => props.field.maximum ?? 100;
  const step = () => props.field['x-kai-step'] ?? (props.field.type === 'integer' ? 1 : undefined);
  const current = () => (props.value === undefined || props.value === null ? min() : Number(props.value));
  // The value bubble and the row that holds it BOTH live in the primitive now
  // (`valueLabel`), so this widget no longer hand-builds either. Same markup, same
  // classes, one owner, and the readout picked up an `aria-hidden` it did not have
  // here: the slider already announces the number through `aria-valuetext` below.
  return (
    <Slider
      id={props.id}
      data-control
      value={current()}
      min={min()}
      max={max()}
      step={step()}
      disabled={props.disabled}
      valueLabel
      aria-valuetext={String(current())}
      {...ariaProps(props)}
      onInput={(e) => props.onInput(Number(e.currentTarget.value))}
      onBlur={props.onBlur}
    />
  );
}

export function RatingWidget(props: WidgetProps): JSX.Element {
  const max = () => props.field.maximum ?? 5;
  const min = () => props.field.minimum ?? 1;
  const current = () => Number(props.value ?? 0);
  const stars = () => Array.from({ length: max() }, (_, i) => i + 1);
  /**
   * Roving tabindex. Exactly one `role="radio"` is in the tab order — the selected
   * star, or the first one while nothing is selected. The GROUP is deliberately not
   * a tab stop: it used to be (`tabindex={0}` with every radio at `-1`), and the
   * consequence was that arrow keys changed the value while focus never left the
   * group, so the focus ring sat on the whole row and a screen reader announced the
   * radiogroup instead of "3 stars, selected". Roving tabindex is the pattern the
   * ARIA radiogroup spec asks for and it makes both symptoms go away at once.
   */
  const activeStar = () => (current() >= min() && current() <= max() ? current() : min());
  const refs = new Map<number, HTMLButtonElement>();
  /** Set the value AND move DOM focus to the star that now owns it. */
  const select = (n: number): void => {
    const next = Math.min(max(), Math.max(min(), n));
    props.onInput(next);
    refs.get(next)?.focus();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (props.disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      select(current() + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      select(current() - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      select(min());
    } else if (e.key === 'End') {
      e.preventDefault();
      select(max());
    }
  };
  return (
    // `groupNameProps`: the row renders a visible "Rating" label whose `for` had
    // nothing to point at (there is no single labelable control here, only stars).
    // Pointing the group at that same visible text makes ONE string name the control.
    <div
      role="radiogroup"
      {...groupNameProps(props)}
      class="flex items-center gap-1 rounded-md"
      {...ariaProps(props)}
    >
      <For each={stars()}>
        {(n) => (
          <button
            type="button"
            role="radio"
            // `data-control` rides the roving tab stop, so `form.focusField()` —
            // which focuses the single `[data-control]` inside the field — lands on
            // the same star Tab would reach. It used to sit on the group, which is no
            // longer focusable. No `id={props.id}`: the row's `<label for>` had
            // nothing to point at before either, and pointing it at a star would make
            // clicking the field label set the rating to 1. The group is named by the
            // row's visible label (see `groupNameProps` above), which is what names it.
            data-control={activeStar() === n ? '' : undefined}
            aria-checked={current() === n}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            tabindex={activeStar() === n ? 0 : -1}
            disabled={props.disabled}
            ref={(el) => refs.set(n, el)}
            class="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onKeyDown={onKey}
            onClick={() => select(n)}
            onBlur={props.onBlur}
          >
            <Star
              size={20}
              class={cn(n <= current() ? 'fill-current text-[var(--color-primary)]' : '')}
              aria-hidden="true"
            />
          </button>
        )}
      </For>
    </div>
  );
}

/**
 * The boolean field's switch IS `ui/switch.tsx` — it is not a lookalike.
 *
 * This used to hand-roll its own `<button role="switch">` at 44×24 while
 * `<kai-switch>` shipped the same control at 36×20, so a consumer putting the two
 * side by side saw two different switches; and its thumb used `bg-background`,
 * re-introducing in the copy the dark-mode disappearing-thumb bug that
 * `ui/switch.tsx:80` carries a comment about having fixed. Delegating removes both.
 * The size convergence (44×24 → 36×20) is visible inside `kai-form` and intended.
 *
 * The four form-only hooks — `id`, `data-control` and the `aria-required` /
 * `aria-invalid` / `aria-describedby` trio — are ordinary props now (plan decision
 * D-7). They used to be stamped onto the button through `buttonRef` + a
 * `createEffect`, which worked but meant this widget reached into the primitive's
 * DOM to make `form.focusField()` land. `Switch` forwards anything it does not own
 * to its inner button, exactly like `Checkbox` and `Radio` forward to their inputs,
 * so all four ride the same path every other widget's hooks do.
 */
export function SwitchWidget(props: WidgetProps): JSX.Element {
  const on = () => props.value === true;
  return (
    <Switch
      id={props.id}
      data-control=""
      checked={on()}
      disabled={props.disabled}
      label={props.label}
      {...ariaProps(props)}
      onChange={(next) => {
        props.onInput(next);
        props.onBlur();
      }}
    />
  );
}

export function CheckboxWidget(props: WidgetProps): JSX.Element {
  return (
    <label class="-mx-1.5 inline-flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60">
      <Checkbox
        id={props.id}
        data-control=""
        checked={props.value === true}
        disabled={props.disabled}
        {...ariaProps(props)}
        onChange={(e) => {
          props.onInput(e.currentTarget.checked);
          props.onBlur();
        }}
      />
      <span>{props.label}</span>
    </label>
  );
}

export function RadioGroupWidget(props: WidgetProps): JSX.Element {
  // The row chrome, the `radiogroup` wrapper and the shared `name` all live in the
  // primitive now; this widget only turns a JSON-Schema `enum` into options.
  const options = createMemo(() =>
    ((props.field.enum ?? []) as unknown[]).map((opt) => ({ value: opt, label: String(opt) })),
  );
  return (
    <RadioGroup<unknown>
      data-control=""
      {...groupNameProps(props)}
      name={props.id}
      options={options()}
      value={props.value}
      disabled={props.disabled}
      {...ariaProps(props)}
      onChange={(value) => {
        props.onInput(value);
        props.onBlur();
      }}
    />
  );
}

export function SelectWidget(props: WidgetProps): JSX.Element {
  // The primitive renders no placeholder row unless it is given one; the 'Select…'
  // wording is this widget's, because a schema-driven field has nowhere else to get it.
  const options = createMemo(() =>
    ((props.field.enum ?? []) as unknown[]).map((opt) => ({ value: opt, label: String(opt) })),
  );
  return (
    <Select<unknown>
      id={props.id}
      data-control
      options={options()}
      value={props.value}
      placeholder={props.placeholder ?? 'Select…'}
      invalid={props.invalid}
      disabled={props.disabled}
      {...ariaProps(props)}
      onChange={(e) => {
        props.onInput(e.currentTarget.value);
        props.onBlur();
      }}
    />
  );
}

function itemEnum(field: FormField): unknown[] {
  const items = field.items;
  if (items && 'enum' in items && Array.isArray(items.enum)) return items.enum;
  return [];
}

/**
 * An array field whose items are an `enum`, as a list of checkboxes.
 *
 * The bordered/divided row chrome, the `role="group"` wrapper and the rows themselves
 * live in `ui/checkbox-group.tsx` now — this widget only turns a JSON-Schema
 * `items.enum` into options and owns the array in and out. It used to hand-roll the
 * identical chrome beside `RadioGroup`, which already owned it.
 *
 * The emitted array holds the SCHEMA's values, not their string forms, so a numeric
 * or boolean enum survives a round trip.
 */
export function CheckboxGroupWidget(props: WidgetProps & { class?: string }): JSX.Element {
  const selected = () => (Array.isArray(props.value) ? (props.value as unknown[]) : []);
  const options = createMemo(() => itemEnum(props.field).map((opt) => ({ value: opt, label: String(opt) })));
  // `name={props.id}`: a shared name so a native form submits the whole selection under
  // one key and `FormData.getAll()` reads it back. `kai-form` collects through its own
  // store rather than a native submit, but the control participating correctly is free
  // here and losing it would be a silent downgrade.
  return (
    <CheckboxGroup<unknown>
      data-control=""
      {...groupNameProps(props)}
      name={props.id}
      class={props.class}
      options={options()}
      value={selected()}
      disabled={props.disabled}
      {...ariaProps(props)}
      onChange={(next) => {
        props.onInput(next);
        props.onBlur();
      }}
    />
  );
}

/**
 * The LONG version of `checkbox-group`: an array-of-enum field whose option list is
 * over the row's `inlineMax`.
 *
 * This was a `<select multiple>` until decision D-3 was ruled. `<select multiple>` is a
 * poor control on every platform — the multi-select affordance is invisible, discovering
 * it means knowing to ctrl/cmd-click, and there is no touch story at all. It is the same
 * control as `checkbox-group`, so it renders as one, with a scroll cap because the only
 * thing that made a long list bearable in a chat card was the select's fixed-height box.
 *
 * The scroll cap is a presentation decision (how a long list fits), not a limit: every
 * option is rendered, nothing is truncated or dropped.
 */
export function MultiSelectWidget(props: WidgetProps): JSX.Element {
  return <CheckboxGroupWidget {...props} class="max-h-60 overflow-y-auto" />;
}

export function TagListWidget(props: WidgetProps): JSX.Element {
  const tags = () => (Array.isArray(props.value) ? (props.value as string[]) : []);
  const [draft, setDraft] = createSignal('');
  const add = (): void => {
    const v = draft().trim();
    if (!v) return;
    // No cap on how many tags may be added. How many is too many lands in a policy
    // document, which makes it the consuming application's call (CLAUDE.md, plan §4).
    props.onInput([...tags(), v]);
    setDraft('');
    props.onBlur();
  };
  const remove = (i: number): void => {
    props.onInput(tags().filter((_, idx) => idx !== i));
    props.onBlur();
  };
  return (
    <div class="flex flex-col gap-2" role="group" {...groupNameProps(props)}>
      <div class="flex flex-wrap gap-1.5">
        <For each={tags()}>
          {(tag, i) => (
            <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
              {tag}
              {/* `Button`, not a bare `<button>`, and a lucide `X` rather than the
                  literal "✕" character it used to render. A bare glyph is what a screen
                  reader falls back to when nothing else names the control; the icon is
                  `aria-hidden` and the `aria-label` is the only name, so every remove
                  control announces which tag it removes. */}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="size-4 rounded-full p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                aria-label={`Remove ${tag}`}
                disabled={props.disabled}
                onClick={() => remove(i())}
              >
                <X size={12} aria-hidden="true" />
              </Button>
            </span>
          )}
        </For>
      </div>
      <div class="flex items-center gap-2">
        {/* `Input` rather than a raw `<input class={inputBase}>` (plan step 6). Same box,
            same classes; what the bypass lost was the focus-node-reuse fix at
            `ui/input.tsx:262-268` and the masking `Input` owns. The draft field is not a
            form control of its own — it holds text on its way to becoming a tag — so it
            carries the row's `id` and `data-control` and nothing else. */}
        <Input
          id={props.id}
          data-control
          type="text"
          value={draft()}
          placeholder={props.placeholder ?? 'Add…'}
          disabled={props.disabled}
          {...ariaProps(props)}
          onValueInput={(value) => setDraft(value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="md" disabled={props.disabled} onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}
