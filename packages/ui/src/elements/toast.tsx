import { defineWebComponent } from './define';
import { ToastRegion, type ToastDismissReason, type ToastPosition, type ToastAppearance } from '../components/toast';
import { toast as toastStore, type ToastItem } from '../primitives/toast-store';

interface Props extends Record<string, unknown> {
  /** The toasts to render. Newest is shown on top. Set as a JS property (array);
   *  pass a new array reference to update. Omit for an empty region, which is
   *  the normal resting state and how the imperative `toast()` API starts. */
  toasts?: ToastItem[];
  /** Stack anchor: `'top-center'` (default), `'top-right'`, `'bottom-center'`, … */
  position?: ToastPosition;
  /** Max simultaneously-visible toasts; the rest queue. Defaults to `3`. */
  max?: number;
  /** Stacking: 'expanded' (default, full column) | 'collapsed' (Sonner-style
   *  pile that expands on hover/focus). Attribute: stack. */
  stack?: 'expanded' | 'collapsed';
  /** Default appearance for this region's toasts: `'pill'` (default, compact) |
   *  `'card'` (richer, with a description line). A per-toast `appearance` wins.
   *  Attribute: `appearance`. */
  appearance?: ToastAppearance;
  /** Default high-contrast inverse treatment for this region's toasts. A per-toast
   *  `inverse` wins. Off by default. Attribute: `inverse`. */
  inverse?: boolean;
  /** Container element to anchor this region to (JS property). Set by the store
   *  for a scoped region; unset = the global viewport region. */
  target?: HTMLElement;
}

interface Events {
  /** A toast left the stack. `reason` is `'timeout' | 'close' | 'action'`. */
  'kai-dismiss': { id: string; reason: ToastDismissReason };
  /** A toast's action button was pressed. */
  'kai-action': { id: string; label: string };
}

/**
 * `<kai-toast-region>` — the viewport overlay that renders the toast stack.
 *
 * It is the substrate behind the imperative `toast()` API: the store lazily
 * mounts ONE of these on `document.body` and binds the list to `toasts`. It is
 * also usable declaratively — set `el.toasts = [...]` (a JS property, never an
 * attribute) and listen for `kai-dismiss` / `kai-action`.
 *
 * Because it is a real `kai-*` element it carries its own shadow root + the
 * shared kit stylesheet, so it is viewport-positioned AND kit-styled.
 *
 * Stack-level defaults are also declarative: `<kai-toast-region appearance="card"
 * inverse>` makes every toast that doesn't set its own `appearance`/`inverse`
 * render as an inverted card. A per-toast value always wins.
 *
 * Your app chrome must stay below the toast layer; set `--kai-toast-z`
 * (default 100) on the host to move the layer.
 */
defineWebComponent<Props, Events>('kai-toast-region', {
  toasts: [],
  position: 'top-center',
  max: 3,
  stack: 'expanded',
  appearance: 'pill',
  inverse: false,
  target: undefined,
}, (props, { dispatch, flag }) => {
  // `max` may arrive as a string attribute (`<kai-toast-region max="2">`).
  const max = () => {
    const raw = props.max as unknown;
    const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
    return typeof n === 'number' && !Number.isNaN(n) ? n : 3;
  };

  const remove = (id: string) => {
    // Drop from the shared store (imperative path). For purely-declarative
    // consumers the store simply won't contain the id — the dispatched event
    // is the signal for them to update their own `toasts` array.
    toastStore.dismiss(id);
  };

  return (
    <ToastRegion
      toasts={props.toasts ?? []}
      position={props.position}
      max={max()}
      stack={props.stack as 'expanded' | 'collapsed' | undefined}
      appearance={props.appearance as ToastAppearance | undefined}
      inverse={flag('inverse')}
      target={props.target as HTMLElement | undefined}
      onDismiss={(id, reason) => {
        remove(id);
        dispatch('kai-dismiss', { id, reason });
      }}
      onAction={(id, label) => dispatch('kai-action', { id, label })}
    />
  );
});
