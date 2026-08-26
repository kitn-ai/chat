import { type JSX, Show, splitProps, createUniqueId, createEffect, onCleanup, untrack } from 'solid-js';
import { cn } from '../utils/cn';
import type { CaseMode } from '../primitives/field-mask';
import { fieldSemantics, type FieldSemanticType } from '../primitives/field-semantics';
import {
  createInputMask,
  type CopyPolicy,
  type InputMask,
  type InputMaskRejectReason,
} from '../primitives/input-mask';

export interface InputProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'onInput' | 'onChange' | 'size'> {
  /** Field label rendered above the control and linked via `for`/`id`. */
  label?: string;
  /** Helper text rendered below the control. */
  hint?: string;
  /** Error text; rendered below the control and flips the field invalid. */
  error?: string;
  /** Control density. Defaults to `md`. */
  size?: 'sm' | 'md';
  /** Force the invalid (destructive-border) state without an `error` string. */
  invalid?: boolean;
  /** Leading affix (icon, unit). Rendered inside the field row, before the input. */
  leading?: JSX.Element;
  /** Trailing affix (icon, inline button). Rendered inside the field row, after the input. */
  trailing?: JSX.Element;
  /** Fires per keystroke with the current value — the CANONICAL value when a mask is
   *  active (digits for `tel`/`ssn`/`credit-card`, the formatted text for
   *  `custom`), and the raw text of the field otherwise. */
  onValueInput?: (value: string) => void;
  /** Fires on commit (blur) with the current value; canonical when a mask is active. */
  onValueChange?: (value: string) => void;

  // --- Form-field formats (spec §7.2). All five are SCALARS, which is what lets them
  // survive as HTML attributes on the `<kai-input>` facade. Absent `format` AND absent
  // `semantic` is the behavior of today, byte for byte (owner decision 1 / spec §1.1): no mask,
  // no extra attributes, nothing.

  /** Tier-2 mask pattern: `#` a digit, `@` an alphanumeric, `*` an obscurable
   *  alphanumeric, everything else a positional literal (`@@@-####`).
   *
   *  The literal `default` is the OPT-IN sentinel: it resolves to the default format of
   *  `semantic` (`tel` → `###-###-####`). It cannot collide with a real pattern — `default`
   *  as a format is eight literals with no fill position, i.e. a field that can hold
   *  nothing — and an opt-in token is needed because decision 1 forbids a bare semantic
   *  type from starting to mask on its own. */
  format?: string;
  /** The placeholder guide shown at unfilled positions, aligned position-for-position
   *  with `format` (`   -   -    `, `mm/dd/yyyy`). Without it the field shows only up
   *  to the last typed character. */
  guide?: string;
  /** Tier-1 semantic type. On its own it applies `inputmode` / `autocomplete` /
   *  `spellcheck` / `autocorrect` / `autocapitalize` and decides the canonical value —
   *  it never starts masking by itself. */
  semantic?: FieldSemanticType;
  /** Case folding applied to typed and pasted text. Defaults to `preserve`. */
  caseMode?: CaseMode;
  /** What a copy or cut of a masked field puts on the clipboard. Defaults to `canonical`. */
  copyPolicy?: CopyPolicy;
  /** A mask refused, or partly refused, some content — `full`, `wrong-class`,
   *  `over-capacity`, or `format-change-clipped`. Not a scalar and therefore not an
   *  attribute: the facade projects this onto its `kai-input-rejected` event.
   *
   *  NOT an error state. `format-change-clipped` in particular fires on a routine
   *  reactive `format` change, so this widget deliberately does not touch `invalid` —
   *  validity belongs to the consumer, and stays there. */
  onMaskReject?: (detail: { reason: InputMaskRejectReason; data: string }) => void;
}

/** The `format` value that means: resolve the default format of the semantic type.
 *
 *  EXPORTED because `src/elements/input.tsx` has to recognise the same sentinel when it
 *  resolves a seeded value ahead of the masker, and a restated literal there would fail
 *  SILENTLY if this string ever changed: `format === 'default'` would simply go false and
 *  `compileMask('default')` would compile seven literals, garbling the seed with no error
 *  anywhere. One exported constant instead of two copies of a magic string. */
export const DEFAULT_FORMAT = 'default';

// The single source of the field shell styling — lifted verbatim from the
// `inputBase` constant that used to live in `src/components/form-widgets.tsx`.
// `Input` now owns it; the form widgets render `Input` rather than re-pasting it.
export const FIELD_BASE =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none';

// When a leading/trailing affix is present the border + padding wrap the whole
// row and the focus ring is driven off the row (`focus-within`), so the input
// itself sits borderless and transparent inside it.
const FIELD_ROW =
  'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-ring';
const ROW_INPUT =
  'min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed';

const SIZE_SM = 'px-2.5 py-1';
// The invalid-state border, EXPORTED because `src/ui/select.tsx` renders the same
// field box and a second hand-typed copy of this string is exactly the kind of
// restatement that rots (`docs/coupling-map.md` §4). `INVALID` stays as the local
// alias so the three call sites below read unchanged.
export const FIELD_INVALID = 'border-destructive dark:border-red-400/70';
const INVALID = FIELD_INVALID;

// Suppress the native search affordances Chrome/WebKit render for `type="search"`.
// Without this the browser's `::-webkit-search-cancel-button` (×) stacks on top of
// a custom clear control (e.g. kai-search's `part="clear"`) — a double ×. Applied
// to the inner `<input>` in BOTH layouts (the field can be `type="search"` either
// way; kai-search uses the affix layout for its leading icon).
const SEARCH_RESET =
  '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-cancel-button]:hidden';

/**
 * `Input`: the token-themed single-line text field shell. A label/hint/error
 * stack around a field row that holds an optional `leading` affix, the
 * `<input>`, and an optional `trailing` affix. The shared border/background/ring
 * styling lives here (the single field source the form widgets build on).
 *
 * Parts: `field` (the bordered control), `input`, `label`, `hint`.
 * a11y: a generated id links `<label for>`; `invalid`/`error` set `aria-invalid`;
 * the hint/error text is linked via `aria-describedby`.
 */
export function Input(props: InputProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'class', 'label', 'hint', 'error', 'size', 'invalid',
    'leading', 'trailing', 'onValueInput', 'onValueChange', 'onBlur', 'id', 'disabled',
    'format', 'guide', 'semantic', 'caseMode', 'copyPolicy', 'onMaskReject',
  ]);

  const id = local.id ?? createUniqueId();
  const hintId = `${id}-hint`;
  const isInvalid = () => !!local.invalid || !!local.error;
  const hasHint = () => !!local.error || !!local.hint;
  const hasAffix = () => local.leading != null || local.trailing != null;

  // -------------------------------------------------------------------------------
  // Form-field formats (spec §7.2). Tier 1 is a handful of attributes; tier 2 is one
  // `createInputMask` bound to whichever `<input>` node is currently mounted.
  // -------------------------------------------------------------------------------

  const semantics = () => (local.semantic === undefined ? undefined : fieldSemantics(local.semantic));

  // Both warn paths below run from a TRACKED accessor or from a reconfigure, i.e. from a
  // routine reactive render, and both interpolate a value that reaches this widget from
  // the form card and therefore from MODEL output. So: report each distinct bad value
  // ONCE per widget, and clip what gets interpolated. The console is not a sink — this is
  // about a 500-character pattern printing 500 characters on every keystroke, not about
  // injection.
  const warned = new Set<string>();
  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(message);
  };
  const clip = (text: string): string =>
    text.length <= 32 ? text : `${text.slice(0, 32)}… (${text.length} chars)`;

  /** The pattern to mask with, or `undefined` for no mask at all. */
  const maskFormat = (): string | undefined => {
    const format = local.format;
    if (format === undefined || format === '') return undefined;
    if (format !== DEFAULT_FORMAT) return format;
    const resolved = semantics()?.defaultFormat;
    if (resolved === undefined) {
      // Loud, never a silent no-mask: the consumer asked for a mask and is not getting
      // one. `custom` has no default by design (its `format` IS the pattern), and a
      // semantic type that never arrived is the more likely mistake.
      warnOnce(
        `default:${String(local.semantic)}`,
        `Input: format=${DEFAULT_FORMAT} resolves the default format of a semantic type, and ` +
          `semantic=${JSON.stringify(local.semantic)} has none. Rendering unmasked.`,
      );
    }
    return resolved;
  };

  let plainEl: HTMLInputElement | undefined;
  let rowEl: HTMLInputElement | undefined;
  let mask: InputMask | undefined;
  /** The node `mask` is bound to. The affix toggle is the one thing that changes it. */
  let maskedEl: HTMLInputElement | undefined;

  const detachMask = (): void => {
    mask?.detach();
    mask = undefined;
    maskedEl = undefined;
  };

  const warnBadFormat = (format: string, err: unknown, kept: boolean): void => {
    const reason = err instanceof Error ? err.message : String(err);
    warnOnce(
      `format:${format}`,
      `Input: format ${JSON.stringify(clip(format))} did not compile (${reason}); ` +
        (kept ? 'the field keeps its previous format.' : 'rendering unmasked.'),
    );
  };

  createEffect(() => {
    // Everything reactive is read HERE, so the effect re-runs on a config change or an
    // affix toggle and on nothing else.
    const format = maskFormat();
    const config = {
      guide: local.guide,
      semantic: local.semantic,
      caseMode: local.caseMode,
      copyPolicy: local.copyPolicy,
    };
    // WHICH NODE IS MOUNTED. `Input` caches two `<input>`s and `<Show>` swaps between
    // them when a leading/trailing affix appears or disappears — the one legitimate node
    // change in this file (spec §8.1). The `ref` of a node fires only when it is BUILT, and
    // the cached node is built once, so a toggle back to an existing node notifies
    // nobody. Re-attachment therefore has to be explicit, and this read is what makes it
    // happen. Everything else about this widget is pinned to keeping the SAME node alive
    // (`tests/ui/input-node-identity.test.tsx`), which is the only reason a long-lived
    // masker on it is safe at all.
    //
    // THE ASSUMPTION THIS RELIES ON, stated: `plainEl`/`rowEl` are plain mutable refs, so
    // this reads a node only because Solid runs the `<Show>` render effect that BUILDS it
    // (and its `ref`) before this user effect. If that ever stopped holding, `el` would be
    // `undefined` on the toggle and the branch below would detach with nothing queued to
    // re-attach — silently. The affix tests in the node-identity file are what would catch it.
    const el = hasAffix() ? rowEl : plainEl;

    untrack(() => {
      if (format === undefined || el === undefined) {
        detachMask();
        return;
      }

      if (mask !== undefined && maskedEl === el) {
        // Same node, new configuration: RE-CONFIGURE. Re-creating would drop the undo
        // stack and re-seed from the DOM text. `update()` is atomic — a format that
        // fails to compile leaves the masker exactly as it was — so a half-typed
        // reactive pattern cannot corrupt the field.
        try {
          mask.update({ format, ...config });
        } catch (err) {
          warnBadFormat(format, err, true);
        }
        return;
      }

      // First attach, or the affix toggle. Carry the value across: the incoming node is
      // a different element and knows nothing about what the user typed into the old one.
      const carried = mask?.getFormattedValue() ?? el.value;
      detachMask();
      try {
        mask = createInputMask(el, {
          ...config,
          format,
          initialValue: carried,
          // The callback of the masker, not the DOM `input` event, is the emission point: a
          // canceled `beforeinput` means a real browser never fires `input` at all for a
          // typed character.
          onInput: ({ canonical }) => local.onValueInput?.(canonical),
          onReject: (detail) => local.onMaskReject?.(detail),
        });
        maskedEl = el;
      } catch (err) {
        // A bad pattern falls back to a plain text field, loudly (spec §7.3).
        warnBadFormat(format, err, false);
      }
    });
  });

  onCleanup(detachMask);

  // The class arrives as an ACCESSOR, not a string, and this is load-bearing.
  //
  // Solid evaluates a `<Show>` `fallback` inside the Show's own memo. When the
  // class was computed at the call site — `inputEl(cn(FIELD_BASE, …,
  // isInvalid() && INVALID, local.class), …)` — those reads happened in that
  // memo, so any of them changing re-ran the memo and BUILT A NEW `<input>`
  // NODE: focus, caret and IME composition state all died with the old one. A
  // consumer whose `invalid` is derived from the value (`kai-form` did exactly
  // that) lost focus after every character.
  //
  // Passing a function moves every reactive read inside the element, where
  // Solid compiles it into a nested effect that sets the attribute on the
  // EXISTING node. Same reason the affix branch was always fine: it inserts the
  // input through a function. Pinned by `tests/ui/input-node-identity.test.tsx`.
  // Tier-1 attributes (spec §2). Each is a DEFAULT the semantic type supplies: an
  // explicit prop always wins, because the consumer knows something the enum does not.
  // With no `semantic` every one of these is `undefined` — the attribute is simply not
  // set, which is what byte-for-byte parity with the behavior of today means here.
  const inputmodeAttr = () => rest.inputmode ?? semantics()?.inputmode;
  const autocompleteAttr = () =>
    (rest.autocomplete ?? semantics()?.autocomplete) as JSX.InputHTMLAttributes<HTMLInputElement>['autocomplete'];
  const spellcheckAttr = () => {
    const explicit = rest.spellcheck;
    // Normalized to the attribute spelling so both forms land as an attribute rather
    // than one of them as a property: `spellcheck={false}` is a real value, not an
    // absent one, and it must stay visible in the DOM.
    if (explicit !== undefined) return explicit === true || explicit === 'true' ? 'true' : 'false';
    const semantic = semantics();
    if (semantic === undefined) return undefined;
    return semantic.spellcheck ? 'true' : 'false';
  };
  const autocorrectAttr = () => rest.autocorrect ?? semantics()?.autocorrect;
  const autocapitalizeAttr = () => rest.autocapitalize ?? semantics()?.autocapitalize;

  const inputEl = (
    cls: () => string,
    part: string,
    register: (el: HTMLInputElement) => void,
  ): JSX.Element => (
    <input
      {...rest}
      ref={register}
      id={id}
      part={part}
      disabled={local.disabled}
      aria-invalid={isInvalid() ? 'true' : undefined}
      aria-describedby={hasHint() ? hintId : undefined}
      inputmode={inputmodeAttr()}
      autocomplete={autocompleteAttr()}
      spellcheck={spellcheckAttr()}
      autocorrect={autocorrectAttr()}
      autocapitalize={autocapitalizeAttr()}
      class={cn(SEARCH_RESET, cls())}
      // When a mask is active the masker owns the emission (see its `onInput` above) and
      // this handler stands down — otherwise a jsdom-style `input` event, which reaches
      // both, would emit twice, and the raw text it reads is the FORMATTED value rather
      // than the canonical one.
      onInput={(e) => {
        if (mask !== undefined) return;
        local.onValueInput?.(e.currentTarget.value);
      }}
      onBlur={(e) => {
        const handler = local.onBlur;
        if (typeof handler === 'function') handler(e);
        local.onValueChange?.(mask?.getCanonicalValue() ?? e.currentTarget.value);
      }}
    />
  );

  const fieldClass = () =>
    cn(FIELD_BASE, local.size === 'sm' && SIZE_SM, isInvalid() && INVALID, local.class);

  // Created on first use and then REUSED, so toggling an affix on or off does
  // not discard a focused input either. The lazy cache also keeps the unused
  // branch's node (and its effects) from being built at all.
  //
  // KEEP PROSE IN THIS FILE FREE OF STRAY QUOTE CHARACTERS. The part-name guard in
  // `src/elements/slots.test.ts` scans this source with a naive quote regex, so one
  // apostrophe in a comment shifts its parity and swallows the part literals below —
  // that guard then reddens over a comment, naming a part that is still right there.
  //
  // Each branch registers its node so the mask effect above can find whichever one is
  // mounted; `ref` fires once per node, at construction, which is exactly when a node
  // first becomes findable.
  let plainNode: JSX.Element;
  const plainInput = () =>
    (plainNode ??= inputEl(fieldClass, 'field input', (el) => (plainEl = el)));
  let rowNode: JSX.Element;
  const rowInput = () =>
    (rowNode ??= inputEl(() => ROW_INPUT, 'input', (el) => (rowEl = el)));

  return (
    <div class="flex w-full flex-col gap-1.5">
      <Show when={local.label}>
        <label part="label" for={id} class="text-sm font-medium text-foreground">
          {local.label}
        </label>
      </Show>

      <Show when={hasAffix()} fallback={plainInput()}>
        <div
          part="field"
          class={cn(
            FIELD_ROW,
            local.size === 'sm' && SIZE_SM,
            isInvalid() && INVALID,
            local.disabled && 'opacity-50 pointer-events-none',
            local.class,
          )}
        >
          <Show when={local.leading}>
            <span class="flex shrink-0 items-center text-muted-foreground">{local.leading}</span>
          </Show>
          {rowInput()}
          <Show when={local.trailing}>
            <span class="flex shrink-0 items-center text-muted-foreground">{local.trailing}</span>
          </Show>
        </div>
      </Show>

      <Show when={hasHint()}>
        <p part="hint" id={hintId} class={cn('text-xs', local.error ? 'text-destructive' : 'text-muted-foreground')}>
          {local.error ?? local.hint}
        </p>
      </Show>
    </div>
  );
}
