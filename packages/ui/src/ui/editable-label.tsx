import { Show, createSignal, createEffect, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { cn } from '../utils/cn';
import { Input } from './input';

export interface EditableLabelProps {
  /** The label text. */
  value: string;
  /** Controlled edit state. When it flips true the field opens; double-click and
   *  the host's `edit()` open it too. */
  editing?: boolean;
  /** Placeholder shown while editing (and as muted text when the value is empty). */
  placeholder?: string;
  /** Disable entering edit mode. */
  disabled?: boolean;
  /** Fires on commit (Enter / blur) with the new value — ONLY when it changed. */
  onRename?: (value: string) => void;
  /** Fires on Esc (cancel); the text is restored. */
  onCancel?: () => void;
  class?: string;
}

/**
 * `EditableLabel`: inline rename. Shows `value` as text; double-click (or the
 * `editing` prop, or a host `edit()`) swaps in an autofocused `Input` with the
 * text pre-selected. Enter or blur commits (fires `onRename` only when the value
 * changed); Esc cancels (fires `onCancel`, restores the text). Both exit editing.
 *
 * Parts: `text` (the read view), `input` (the field while editing).
 */
export function EditableLabel(props: EditableLabelProps): JSX.Element {
  // `editing` is seeded from the controlled prop and follows it; double-click /
  // commit / cancel toggle it locally without touching the prop (no feedback loop).
  const [editing, setEditing] = createSignal(!!props.editing);
  // V2-PORT: signal writes are side effects, so they live in the APPLY half.
  createEffect(() => !!props.editing, (v) => { setEditing(v); });

  // The displayed text. Seeded from `value`, kept in sync with it, and updated
  // optimistically on a successful rename so the read view shows the new label.
  const [text, setText] = createSignal(props.value);
  // V2-PORT: as above — tracked read in the compute, the write in the apply.
  createEffect(() => props.value, (v) => { setText(v); });

  let root: HTMLElement | undefined;
  // Set before an Enter/Esc unmounts the field so its teardown blur does not
  // double-commit (mirrors the AMUX inline-rename guard).
  let suppressBlur = false;

  const focusSelect = () => {
    const input = root?.querySelector('input');
    if (input) { input.focus(); input.select(); }
  };
  // V2-PORT (R1): `focusSelect` walks the DOM under `root`, so it runs in the APPLY,
  // after the render phase has built the Show branch that holds the input.
  createEffect(editing, (on) => { if (on) queueMicrotask(focusSelect); });

  const enterEdit = () => { if (!props.disabled) setEditing(true); };

  const commit = (next: string) => {
    if (!untrack(editing)) return; // idempotent: a teardown blur after Enter is a no-op
    setEditing(false);
    if (next !== untrack(text)) { setText(next); props.onRename?.(next); }
  };

  const cancel = () => {
    if (!untrack(editing)) return;
    setEditing(false);
    props.onCancel?.();
  };

  const onFieldKeyDown = (e: KeyboardEvent) => {
    const el = e.currentTarget as HTMLInputElement;
    if (e.key === 'Enter') { e.preventDefault(); suppressBlur = true; commit(el.value); }
    else if (e.key === 'Escape') { e.preventDefault(); suppressBlur = true; cancel(); }
  };

  const onFieldBlur = (v: string) => {
    if (suppressBlur) { suppressBlur = false; return; }
    commit(v);
  };

  return (
    <span ref={root} class={cn('inline-flex max-w-full items-center', props.class)}>
      <Show
        when={editing()}
        fallback={
          <span
            part="text"
            tabindex={props.disabled ? undefined : 0}
            class={cn(
              'inline-block max-w-full truncate rounded px-1 py-0.5 text-sm text-foreground',
              props.disabled ? 'cursor-default opacity-60' : 'cursor-text hover:bg-muted',
              !text() && 'text-muted-foreground',
            )}
            onDblClick={enterEdit}
            onKeyDown={(e) => {
              if (!props.disabled && (e.key === 'Enter' || e.key === 'F2')) { e.preventDefault(); enterEdit(); }
            }}
          >
            {text() || props.placeholder || ''}
          </span>
        }
      >
        <Input
          value={text()}
          placeholder={props.placeholder}
          disabled={props.disabled}
          size="sm"
          class="h-7 py-0"
          aria-label={props.placeholder ?? 'Edit label'}
          onKeyDown={onFieldKeyDown}
          onValueChange={onFieldBlur}
        />
      </Show>
    </span>
  );
}
