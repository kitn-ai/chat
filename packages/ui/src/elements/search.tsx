import { createEffect, createSignal, untrack, Show } from 'solid-js';
import { defineWebComponent } from './define';
import { Input } from '../ui/input';
import { Kbd } from '../ui/kbd';
import { Loader } from '../components/loader';
import { renderIcon } from '../ui/icon';

interface Props extends Record<string, unknown> {
  /** Controlled query. Settable and reflected to the `value` attribute. Read
   *  `el.value` for live state. */
  value?: string;
  /** Placeholder. Defaults to `Search…`. */
  placeholder?: string;
  /** Leading icon-NAME string (a curated name, URL, or text), resolved to a glyph
   *  the same way `kai-button`'s `icon` is. Defaults to `search`. */
  icon?: string;
  /** Debounce window for `kai-search`, in ms. Defaults to `200`. */
  debounce?: number;
  /** Show a spinner in place of the leading icon while results load. */
  loading?: boolean;
  /** Optional shortcut hint shown (as a `kai-kbd`) while the field is empty,
   *  e.g. `Mod+K`. Display only; it does not bind the key. */
  shortcut?: string;
}

/** Events fired by `<kai-search>`. */
interface Events {
  /** The query changed (debounced live, and on clear). */
  'kai-search': { value: string };
  /** Enter was pressed. */
  'kai-submit': { value: string };
  /** The field committed (blur). */
  'kai-change': { value: string };
}

/**
 * `<kai-search>` — a debounced filter field built on `kai-input`. Type to fire a
 * debounced `kai-search`, press Enter for `kai-submit`. A clear (×) button shows
 * once there's a value; an optional `shortcut` renders a `kai-kbd` hint while the
 * field is empty.
 *
 * ```html
 * <kai-search placeholder="Search docs" shortcut="Mod+K"></kai-search>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   const s = document.querySelector('kai-search');
 *   s.addEventListener('kai-search', (e) => filter(e.detail.value));
 *   s.addEventListener('kai-submit', (e) => go(e.detail.value));
 * </script>
 * ```
 *
 * Drive/read the query with the `value` property (reflected to the attribute).
 * Restyle via `::part(field)`, `::part(input)`, and `::part(clear)`.
 */
defineWebComponent<Props, Events>('kai-search', {
  value: undefined,
  placeholder: 'Search…',
  icon: 'search',
  debounce: 200,
  loading: false,
  shortcut: undefined,
}, (props, ctx) => {
  const { element, dispatch, flag, expose } = ctx;

  // Lift the query into the facade and drive Input CONTROLLED so the host can read
  // it (`el.value` / `:host([value])`) and set it after mount. Mirrors kai-segmented.
  const [value, setValue] = createSignal(
    (props.value as string | undefined) ?? element.getAttribute('value') ?? '',
  );

  const coerce = (v: unknown): string =>
    v == null ? (element.getAttribute('value') ?? '') : String(v);

  // Reads return LIVE state; host writes (`el.value = …`) drive it WITHOUT firing
  // events. The equality guard kills the reflect write-back loop.
  Object.defineProperty(element, 'value', {
    get: () => value(),
    set: (v: unknown) => { const next = coerce(v); if (untrack(value) !== next) setValue(next); },
    configurable: true,
    enumerable: true,
  });

  // Reflect internal value → `[value]` host attribute (for `:host([value])`).
  createEffect(() => {
    const v = value();
    if (v) {
      if (element.getAttribute('value') !== v) element.setAttribute('value', v);
    } else if (element.hasAttribute('value')) {
      element.removeAttribute('value');
    }
  });

  // Debounced kai-search: each keystroke resets the timer; it fires once after the
  // window. Clearing fires immediately (timer cancelled).
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounceMs = () => {
    const ms = Number(props.debounce ?? 200);
    return Number.isFinite(ms) && ms >= 0 ? ms : 200;
  };
  const scheduleSearch = (next: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => dispatch('kai-search', { value: next }), debounceMs());
  };

  const getInput = (): HTMLInputElement | null =>
    element.shadowRoot?.querySelector<HTMLInputElement>('input') ?? null;

  const onInput = (next: string) => {
    setValue(next);
    scheduleSearch(next);
  };

  // Empty the field, fire kai-search '' immediately (cancelling any pending), refocus.
  const clear = () => {
    if (timer) clearTimeout(timer);
    setValue('');
    dispatch('kai-search', { value: '' });
    getInput()?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') dispatch('kai-submit', { value: untrack(value) });
  };

  expose({
    /** Focus the search input inside the shadow root. A native `focus()` on the
     *  host lands on the host itself and never reaches it. */
    focus: () => getInput()?.focus(),
    clear,
  });

  // Leading: a spinner while loading, otherwise the resolved icon glyph.
  const leading = (
    <Show
      when={flag('loading')}
      fallback={renderIcon((props.icon as string) ?? 'search', {
        class: 'size-4 shrink-0',
        imgClass: 'size-4 shrink-0',
        spanClass: 'inline-flex size-4 shrink-0 items-center justify-center',
        ariaHidden: true,
      })}
    >
      <Loader variant="circular" size="sm" />
    </Show>
  );

  // Trailing: a clear button once there's a value, else a shortcut hint if set.
  const trailing = (
    <>
      <Show when={value()}>
        <button
          type="button"
          part="clear"
          aria-label="Clear"
          class="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={clear}
        >
          {renderIcon('x', { class: 'size-4', imgClass: 'size-4' })}
        </button>
      </Show>
      <Show when={!value() && props.shortcut}>
        <Kbd keys={props.shortcut as string} size="sm" />
      </Show>
    </>
  );

  return (
    <>
      <style>{':host{display:block}'}</style>
      <Input
        type="search"
        value={value()}
        placeholder={(props.placeholder as string) ?? 'Search…'}
        leading={leading}
        trailing={trailing}
        onValueInput={onInput}
        onValueChange={(v) => dispatch('kai-change', { value: v })}
        onKeyDown={onKeyDown}
      />
    </>
  );
});
