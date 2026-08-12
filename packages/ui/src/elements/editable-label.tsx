import { createEffect, createSignal, untrack } from 'solid-js';
import { defineWebComponent } from './define';
import { EditableLabel } from '../ui/editable-label';

interface Props extends Record<string, unknown> {
  /** The label text. Settable and reflected to the `value` attribute. Read
   *  `el.value` for live state. */
  value?: string;
  /** Controlled edit state. `el.editing = true` opens the field; reflected to the
   *  `editing` attribute. */
  editing?: boolean;
  /** Placeholder shown while editing / when the value is empty. */
  placeholder?: string;
  /** Disable entering edit mode. */
  disabled?: boolean;
}

/** Events fired by `<kai-editable-label>`. */
interface Events {
  /** Committed a changed value (Enter / blur). */
  'kai-rename': { value: string };
  /** Edit was cancelled (Esc); the text is restored. */
  'kai-cancel': Record<string, never>;
}

/**
 * `<kai-editable-label>` — inline rename, built on `kai-input`. Shows `value` as
 * text; double-click (or `el.edit()`, or `editing`) swaps in an autofocused
 * field. Enter or blur commits → `kai-rename` (only when the value changed); Esc
 * cancels → `kai-cancel` (the text is restored).
 *
 * ```html
 * <kai-editable-label value="Project Alpha"></kai-editable-label>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   const label = document.querySelector('kai-editable-label');
 *   label.addEventListener('kai-rename', (e) => save(e.detail.value));
 *   label.edit(); // open the field programmatically
 * </script>
 * ```
 *
 * Methods: `edit()`, `commit()`, `cancel()`. Restyle via `::part(text)` and
 * `::part(input)`.
 */
defineWebComponent<Props, Events>('kai-editable-label', {
  value: undefined,
  editing: false,
  placeholder: undefined,
  disabled: false,
}, (props, ctx) => {
  const { element, dispatch, flag, expose } = ctx;

  // Controlled value, mirrored to the `value` attribute (the kai-segmented pattern).
  const [value, setValue] = createSignal(
    (props.value as string | undefined) ?? element.getAttribute('value') ?? '',
  );
  const coerce = (v: unknown): string =>
    v == null ? (element.getAttribute('value') ?? '') : String(v);
  Object.defineProperty(element, 'value', {
    get: () => value(),
    set: (v: unknown) => { const next = coerce(v); if (untrack(value) !== next) setValue(next); },
    configurable: true,
    enumerable: true,
  });
  createEffect(() => {
    const v = value();
    if (v) {
      if (element.getAttribute('value') !== v) element.setAttribute('value', v);
    } else if (element.hasAttribute('value')) {
      element.removeAttribute('value');
    }
  });

  // Edit state lives in the facade and drives the primitive. The methods map to
  // the primitive's own gestures so every commit / cancel flows through its guarded
  // Enter/Esc/blur handlers (no double-fire). Controlled `editing` rides the native
  // solid-element prop/attribute: we follow it (so `el.editing = true` /
  // `<kai-editable-label editing>` opens the field) and reflect it, but never
  // override the property with a side-effecting `Object.defineProperty` — doing so
  // fires the setter during solid-element's upgrade and corrupts the signal.
  const [editing, setEditing] = createSignal(flag('editing'));
  createEffect(() => setEditing(flag('editing')));
  createEffect(() => {
    if (editing()) {
      if (!element.hasAttribute('editing')) element.setAttribute('editing', '');
    } else if (element.hasAttribute('editing')) {
      element.removeAttribute('editing');
    }
  });

  const getInput = (): HTMLInputElement | null =>
    element.shadowRoot?.querySelector<HTMLInputElement>('input') ?? null;

  const enter = () => { if (!flag('disabled')) setEditing(true); };
  // Blur drives the primitive's blur-commit; Escape drives its cancel.
  const commit = () => { getInput()?.blur(); };
  const cancel = () => {
    const input = getInput();
    if (input) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    } else if (untrack(editing)) {
      setEditing(false);
      dispatch('kai-cancel', {});
    }
  };

  expose({
    /** Switch the label into its editing field, which autofocuses and selects the
     *  current text. Same entry point as a user double-click, and a no-op while
     *  `disabled`. Commit with `commit()` or by blurring, abandon with `cancel()`
     *  or Escape. */
    edit: enter,
    commit,
    cancel,
  });

  return (
    <>
      <style>{':host{display:inline-flex}'}</style>
      <EditableLabel
        value={value()}
        editing={editing()}
        placeholder={props.placeholder as string | undefined}
        disabled={flag('disabled')}
        onRename={(next) => {
          setEditing(false);
          if (next !== untrack(value)) { setValue(next); dispatch('kai-rename', { value: next }); }
        }}
        onCancel={() => { setEditing(false); dispatch('kai-cancel', {}); }}
      />
    </>
  );
});
