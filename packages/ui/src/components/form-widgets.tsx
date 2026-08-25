import { For, Show, createSignal } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { Textarea } from '../ui/textarea';
import { Input, FIELD_BASE as inputBase } from '../ui/input';
import { Star } from 'lucide-solid';
import type { FieldMaskHint, FormField } from './form';

/** The shared prop shape every leaf widget receives from FieldRow. */
export interface WidgetProps {
  id: string;
  value: unknown;
  field: FormField;
  /**
   * The field's resolved format hints (spec §7.3), or an empty resolution.
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
  onInput: (value: unknown) => void;
  onBlur: () => void;
}

function ariaProps(p: WidgetProps) {
  return {
    // V2-PORT: aria enumerated attrs take 'true'/'false' strings in v2's JSX types.
    'aria-required': p.required ? ('true' as const) : undefined,
    'aria-invalid': p.invalid ? ('true' as const) : undefined,
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
      minlength={props.field.minLength}
      maxlength={props.field.maxLength}
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
        maxlength={props.field.maxLength}
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
  return (
    <input
      id={props.id}
      data-control
      type="number"
      class={cn(inputBase, props.invalid && 'border-destructive dark:border-red-400/70')}
      value={props.value === undefined || props.value === null ? '' : String(props.value)}
      placeholder={props.placeholder}
      disabled={props.disabled}
      min={props.field.minimum}
      max={props.field.maximum}
      step={step()}
      {...ariaProps(props)}
      onInput={(e) => props.onInput(e.currentTarget.value)}
      onBlur={props.onBlur}
    />
  );
}

export function SliderWidget(props: WidgetProps): JSX.Element {
  const min = () => props.field.minimum ?? 0;
  const max = () => props.field.maximum ?? 100;
  const step = () => props.field['x-kai-step'] ?? (props.field.type === 'integer' ? 1 : undefined);
  const current = () => (props.value === undefined || props.value === null ? min() : Number(props.value));
  const fill = (): string => {
    const lo = min();
    const hi = max();
    return hi > lo ? `${((current() - lo) / (hi - lo)) * 100}%` : '0%';
  };
  return (
    <div class="flex items-center gap-3">
      <input
        id={props.id}
        data-control
        type="range"
        class="kai-range"
        style={{ '--kai-range-fill': fill() }}
        value={current()}
        min={min()}
        max={max()}
        step={step()}
        disabled={props.disabled}
        aria-valuetext={String(current())}
        {...ariaProps(props)}
        onInput={(e) => props.onInput(Number(e.currentTarget.value))}
        onBlur={props.onBlur}
      />
      <span class="min-w-9 shrink-0 rounded-md bg-background px-2 py-1 text-center text-sm font-medium tabular-nums text-foreground shadow-sm">
        {current()}
      </span>
    </div>
  );
}

export function RatingWidget(props: WidgetProps): JSX.Element {
  const max = () => props.field.maximum ?? 5;
  const current = () => Number(props.value ?? 0);
  const stars = () => Array.from({ length: max() }, (_, i) => i + 1);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      props.onInput(Math.min(max(), current() + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      props.onInput(Math.max(props.field.minimum ?? 1, current() - 1));
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      data-control
      tabindex={0}
      class="flex items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      {...ariaProps(props)}
      onKeyDown={onKey}
    >
      <For each={stars()}>
        {(n) => (
          <button
            type="button"
            role="radio"
            aria-checked={current() === n ? 'true' : 'false'}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            tabindex={-1}
            disabled={props.disabled}
            class="rounded p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => props.onInput(n)}
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

export function SwitchWidget(props: WidgetProps): JSX.Element {
  const on = () => props.value === true;
  const toggle = (): void => {
    if (props.disabled) return;
    props.onInput(!on());
    props.onBlur();
  };
  return (
    <button
      id={props.id}
      data-control
      type="button"
      role="switch"
      aria-checked={on() ? 'true' : 'false'}
      aria-label={props.label}
      disabled={props.disabled}
      class={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        on() ? 'bg-[var(--color-primary)]' : 'bg-muted',
      )}
      {...ariaProps(props)}
      onClick={toggle}
    >
      <span
        class={cn(
          'inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform',
          on() ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function CheckboxWidget(props: WidgetProps): JSX.Element {
  return (
    <label class="-mx-1.5 inline-flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60">
      <input
        id={props.id}
        data-control
        type="checkbox"
        class="kai-checkbox"
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
  const options = () => (props.field.enum ?? []) as unknown[];
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      data-control
      class="divide-y divide-border overflow-hidden rounded-lg border border-input"
      {...ariaProps(props)}
    >
      <For each={options()}>
        {(opt) => (
          <label
            class={cn(
              'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors',
              props.value === opt
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-foreground hover:bg-muted/50',
            )}
          >
            <input
              type="radio"
              name={props.id}
              class="kai-radio"
              value={String(opt)}
              checked={props.value === opt}
              disabled={props.disabled}
              onChange={() => {
                props.onInput(opt);
                props.onBlur();
              }}
            />
            <span>{String(opt)}</span>
          </label>
        )}
      </For>
    </div>
  );
}

export function SelectWidget(props: WidgetProps): JSX.Element {
  const options = () => (props.field.enum ?? []) as unknown[];
  return (
    <select
      id={props.id}
      data-control
      class={cn(inputBase, props.invalid && 'border-destructive dark:border-red-400/70')}
      disabled={props.disabled}
      {...ariaProps(props)}
      onChange={(e) => {
        props.onInput(e.currentTarget.value);
        props.onBlur();
      }}
    >
      <option value="" disabled selected={props.value === undefined || props.value === ''}>
        {props.placeholder ?? 'Select…'}
      </option>
      <For each={options()}>
        {(opt) => (
          <option value={String(opt)} selected={props.value === opt}>
            {String(opt)}
          </option>
        )}
      </For>
    </select>
  );
}

function itemEnum(field: FormField): unknown[] {
  const items = field.items;
  if (items && 'enum' in items && Array.isArray(items.enum)) return items.enum;
  return [];
}

export function CheckboxGroupWidget(props: WidgetProps): JSX.Element {
  const selected = () => (Array.isArray(props.value) ? (props.value as unknown[]) : []);
  const toggle = (opt: unknown): void => {
    const set = selected();
    const next = set.includes(opt) ? set.filter((v) => v !== opt) : [...set, opt];
    props.onInput(next);
    props.onBlur();
  };
  return (
    <div
      role="group"
      aria-label={props.label}
      data-control
      class="divide-y divide-border overflow-hidden rounded-lg border border-input"
      {...ariaProps(props)}
    >
      <For each={itemEnum(props.field)}>
        {(opt) => (
          <label
            class={cn(
              'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors',
              selected().includes(opt)
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-foreground hover:bg-muted/50',
            )}
          >
            <input
              type="checkbox"
              class="kai-checkbox"
              checked={selected().includes(opt)}
              disabled={props.disabled}
              onChange={() => toggle(opt)}
            />
            <span>{String(opt)}</span>
          </label>
        )}
      </For>
    </div>
  );
}

export function MultiSelectWidget(props: WidgetProps): JSX.Element {
  const selected = () => (Array.isArray(props.value) ? (props.value as unknown[]) : []);
  return (
    <select
      id={props.id}
      data-control
      multiple
      aria-label={props.label}
      class={cn(inputBase, 'min-h-[6rem]', props.invalid && 'border-destructive dark:border-red-400/70')}
      disabled={props.disabled}
      {...ariaProps(props)}
      onChange={(e) => {
        const vals = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
        props.onInput(vals);
        props.onBlur();
      }}
    >
      <For each={itemEnum(props.field)}>
        {(opt) => (
          <option value={String(opt)} selected={selected().includes(opt)}>
            {String(opt)}
          </option>
        )}
      </For>
    </select>
  );
}

export function TagListWidget(props: WidgetProps): JSX.Element {
  const tags = () => (Array.isArray(props.value) ? (props.value as string[]) : []);
  const [draft, setDraft] = createSignal('');
  const add = (): void => {
    const v = draft().trim();
    if (!v) return;
    props.onInput([...tags(), v]);
    setDraft('');
    props.onBlur();
  };
  const remove = (i: number): void => {
    props.onInput(tags().filter((_, idx) => idx !== i));
    props.onBlur();
  };
  return (
    <div class="flex flex-col gap-2" role="group" aria-label={props.label}>
      <div class="flex flex-wrap gap-1.5">
        <For each={tags()}>
          {(tag, i) => (
            <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                disabled={props.disabled}
                class="text-muted-foreground hover:text-foreground"
                onClick={() => remove(i())}
              >
                ✕
              </button>
            </span>
          )}
        </For>
      </div>
      <div class="flex items-center gap-2">
        <input
          id={props.id}
          data-control
          type="text"
          class={cn(inputBase)}
          value={draft()}
          placeholder={props.placeholder ?? 'Add…'}
          disabled={props.disabled}
          {...ariaProps(props)}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          class="rounded-md border border-input px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
          disabled={props.disabled}
          onClick={add}
        >
          Add
        </button>
      </div>
    </div>
  );
}
