import { createSignal } from 'solid-js';
import { defineWebComponent } from './define';
import { Screen, type ScreenController } from '../components/screen';
import { wireDisclosure } from './disclosure';

interface Props extends Record<string, unknown> {
  /** Drive/observe open state (Shoelace-style: settable + reflected to the `open`
   *  attribute; the element still self-manages). Set `el.open = true`, or
   *  `<kai-screen open>`; listen for `kai-open-change`. */
  open?: boolean;
  /** Initial open state on mount (uncontrolled seed). */
  defaultOpen?: boolean;
  /** Header title text. A projected `title` slot overrides it. (Named `headline`
   *  because `title` collides with the global `HTMLElement.title` attribute.) */
  headline?: string;
  /** Show the back button (default true). */
  back?: boolean;
  /** Opt out of marking sibling elements inert/aria-hidden while open (for unusual layouts). */
  noInert?: boolean;
}

/** Events fired by `<kai-screen>`. */
interface Events {
  /** Back navigation intent: the back button or Escape. The consumer flips their
   *  own routing in response (the screen knows nothing about the trigger). */
  'kai-back': Record<string, never>;
  /** The screen opened or closed (a method, `Escape` close, or driven `open`). */
  'kai-open-change': { open: boolean };
}

/**
 * `<kai-screen>` is a developer-swapped, full-bleed overlay destination: the
 * push/drill-in surface that takes over its mount point under a back-header. The
 * developer owns the swap (their own routing flips `open` in response to their
 * trigger button and the screen's `kai-back`); the screen owns being the takeover.
 *
 * It fills whatever it is mounted in (mount at the app root for a full takeover,
 * in a positioned region for a scoped one), marks sibling elements `inert` while
 * open (the standard modal pattern; opt out with `no-inert`), moves focus in on
 * open and restores it on close, and runs an enter/exit transition that honors
 * `prefers-reduced-motion`. `Escape` fires `kai-back`.
 *
 * ```html
 * <kai-screen headline="Design">
 *   <button slot="actions"><kai-avatar></kai-avatar></button>
 *   <div>…your surface…</div>
 * </kai-screen>
 * ```
 *
 * Open state is the standard disclosure surface: settable+reflecting `open`,
 * `kai-open-change`, and `show()`/`hide()`/`toggle()`; seed with `default-open`.
 * Parts: `header` · `back` · `title` · `body`.
 */
defineWebComponent<Props, Events>('kai-screen', {
  open: undefined,
  defaultOpen: undefined,
  headline: undefined,
  back: undefined,
  noInert: undefined,
}, (props, ctx) => {
  const { flag, element, dispatch, expose } = ctx;
  // V2-PORT: a reactive signal, not a plain `let` — the disclosure/controller
  // effects track it, and ownedWrite sanctions the synchronous hand-up from
  // the primitive's body (see elements/tool.tsx, the same fix).
  const [api, setApi] = createSignal<ScreenController | undefined>(undefined, { ownedWrite: true });
  let surface: HTMLElement | undefined;

  // The standard disclosure surface: settable+reflecting `open`, kai-open-change,
  // show/hide/toggle. See ./disclosure. This is the SOLE emitter of kai-open-change.
  wireDisclosure(ctx, api, () => props.open);

  // focus() shadows the host's native focus so it targets the screen surface
  // inside the shadow root (the WebAwesome/Shoelace convention).
  expose({
    /** Move focus to the screen surface (no-op while closed). */
    focus: (options?: FocusOptions) => surface?.focus(options),
  });

  return (
    <Screen
      defaultOpen={flag('defaultOpen')}
      back={!(props.back === false || element.getAttribute('back') === 'false')}
      noInert={flag('noInert')}
      host={() => element}
      titleSlot={<slot name="title">{props.headline as string | undefined}</slot>}
      actions={<slot name="actions" />}
      onBack={() => { dispatch('kai-back', {}); }}
      controllerRef={(a) => setApi(a)}
      surfaceRef={(el) => (surface = el)}
    >
      <slot />
    </Screen>
  );
});
