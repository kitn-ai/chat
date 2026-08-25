import { createEffect, createSignal, untrack } from 'solid-js';
import { defineWebComponent } from './define';
import { Segmented, type SegmentedOption } from '../ui/segmented';
import { renderIcon } from '../ui/icon';
// Public shape of the `options` prop; lives in ./element-data-types so the ROOT
// entry can re-export it (see that file's header).
import type { KaiSegmentedOption } from './element-data-types';

interface Props extends Record<string, unknown> {
  /** The selectable segments, left to right. Set as a JS property (array). */
  options: KaiSegmentedOption[];
  /** Controlled selected `value`. Settable and reflected to the `value`
   *  attribute. `el.value = 'preview'` drives it; choosing a segment updates it
   *  and fires `kai-change`. Read `el.value` for live state. */
  value?: string;
  /** Control density: `sm` or `md`. Defaults to `md`. */
  size?: 'sm' | 'md';
}

/** Events fired by `<kai-segmented>`. */
interface Events {
  /** A segment was chosen. */
  'kai-change': { value: string };
}

/**
 * `<kai-segmented>` — a single-select pill track (segmented / toggle group).
 * Feed it `options` (a JS-property array), drive/read the selection with the
 * `value` property (settable + reflected to the `value` attribute, so
 * `:host([value])` and `el.value` see live state), and listen for `kai-change`.
 *
 * ```html
 * <kai-segmented value="preview"></kai-segmented>
 * <script type="module">
 *   import '@kitn.ai/ui/elements';
 *   const seg = document.querySelector('kai-segmented');
 *   seg.options = [
 *     { value: 'code', label: 'Code', icon: 'code' },
 *     { value: 'preview', label: 'Preview', icon: 'monitor' },
 *   ];
 *   seg.addEventListener('kai-change', (e) => console.log(e.detail.value));
 *   seg.value = 'code'; // drive it (no kai-change — the host already knows)
 * </script>
 * ```
 *
 * Each option's `icon` is an icon-name string resolved to a glyph (curated name,
 * URL, or text). Restyle via `::part(track)` and `::part(segment)`.
 */
defineWebComponent<Props, Events>('kai-segmented', {
  options: [],
  value: undefined,
  size: 'md',
}, (props, ctx) => {
  const { element, dispatch } = ctx;

  // Lift the selected value into the facade and drive Segmented CONTROLLED so the
  // host can read it (`el.value` / `:host([value])`) and set it after mount. Seed
  // from the `value` property/attribute present on mount (options usually arrive
  // as a property after upgrade, so we don't auto-select the first segment here).
  const [value, setValue] = createSignal(
    (props.value as string | undefined) ?? element.getAttribute('value') ?? '',
  );

  // Coerce any value coming through the `value` setter (a JS assignment, or the
  // write-back from `attributeChangedCallback`) to a string — falling back to the
  // live attribute when it's nullish, so the reflect write-back equals the signal
  // and the equality guards below absorb it (no attr⇄prop feedback loop; mirrors
  // kai-switch's `checked`).
  const coerce = (v: unknown): string =>
    v == null ? (element.getAttribute('value') ?? '') : String(v);

  // Apply a new value and fire kai-change once (the user-choice path).
  const apply = (next: string) => {
    if (untrack(value) === next) return;
    setValue(next);
    dispatch('kai-change', { value: next });
  };

  // Override the `value` property so reads return LIVE state (the signal) and host
  // writes (`el.value = …`) drive it WITHOUT firing kai-change — distinct from the
  // user-choice path. The equality guard kills the reflect write-back loop.
  Object.defineProperty(element, 'value', {
    get: () => value(),
    set: (v: unknown) => { const next = coerce(v); if (untrack(value) !== next) setValue(next); },
    configurable: true,
    enumerable: true,
  });

  // Reflect internal value → the `[value]` host attribute (for `:host([value])`).
  // The guard against the live attribute keeps the write-back the reflect triggers
  // (attributeChangedCallback → setter) from looping.
  // V2-PORT: the value signal is the tracked read; the attribute writes are the apply.
  createEffect(value, (v) => {
    if (v) {
      if (element.getAttribute('value') !== v) element.setAttribute('value', v);
    } else if (element.hasAttribute('value')) {
      element.removeAttribute('value');
    }
  });

  // Resolve each option's icon-NAME string into a rendered glyph, the same path
  // kai-button uses for its `icon` prop, and hand the primitive `{value,label,icon:JSX}`.
  const resolved = (): SegmentedOption[] =>
    (props.options ?? []).map((o) => ({
      value: o.value,
      label: o.label,
      icon: o.icon
        ? renderIcon(o.icon, {
            class: 'size-4 shrink-0',
            imgClass: 'size-4 shrink-0',
            spanClass: 'inline-flex size-4 shrink-0 items-center justify-center',
            ariaHidden: true,
          })
        : undefined,
    }));

  return (
    <>
      {/* Base sets `:host{display:block}`; the track flows inline like a pill. */}
      <style>{':host{display:inline-flex}'}</style>
      <Segmented
        options={resolved()}
        value={value()}
        size={(props.size as 'sm' | 'md' | undefined) ?? 'md'}
        onChange={(next) => apply(next)}
      />
    </>
  );
});
