// src/elements/remote.tsx
// <kai-remote> — Shadow-DOM facade that mounts a sandboxed cross-origin iframe
// card via mountRemoteCard(), re-emits every CardEvent as a bubbling+composed
// kai-card CustomEvent, and validates the provider-origin before mounting.
import { createEffect, createSignal, onCleanup, onSettled } from 'solid-js';
import { defineWebComponent } from './define';
import { mountRemoteCard } from '../remote/host-embed';
import type { RemoteCardHandle } from '../remote/host-embed';
import type { CardEnvelope, CardContext, CardPolicy, CardEvent } from '../primitives/card-contract';
import { emitCardEvent } from '../primitives/card-routing';

interface Props extends Record<string, unknown> {
  /** The remote card URL. Attribute: `src`. */
  src?: string;
  /** Exact provider origin (https: or http://localhost for dev). Attribute: `provider-origin`. */
  providerOrigin?: string;
  /** The card envelope to render. JS property only. */
  envelope?: Record<string, unknown>;
  /** Optional routing policy. JS property only. */
  policy?: Record<string, unknown>;
}

/**
 * Validate that `origin` is a single absolute origin that is either:
 *   - an https: origin (e.g. "https://provider.example")
 *   - http://localhost or http://127.0.0.1 (local dev only)
 *
 * Rejects "*", comma-lists, bare paths, and any other http: origin.
 */
function isValidProviderOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  // Reject wildcard and comma-lists immediately.
  if (origin === '*' || origin.includes(',')) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  // Must be an exact origin: no pathname beyond '/', no search, no hash.
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') return false;
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol === 'http:') {
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  }
  return false;
}

/**
 * Build a CardPolicy that re-emits each routed CardEvent as a bubbling+composed
 * `kai-card` CustomEvent on `element`, AND delegates to the caller-supplied `policy`.
 */
function buildWrappedPolicy(element: HTMLElement, userPolicy: CardPolicy | undefined): CardPolicy {
  function emit(ev: CardEvent): void {
    emitCardEvent(element, ev);
  }
  return {
    onSubmit(cardId, data) {
      emit({ kind: 'submit', cardId, data });
      userPolicy?.onSubmit?.(cardId, data);
    },
    onAction(cardId, action, payload) {
      emit({ kind: 'action', cardId, action, payload });
      userPolicy?.onAction?.(cardId, action, payload);
    },
    onSendPrompt(text, opts) {
      // send-prompt doesn't carry cardId in the policy signature; we use a placeholder.
      emit({ kind: 'send-prompt', cardId: '', text, mode: opts.mode, context: opts.context });
      userPolicy?.onSendPrompt?.(text, opts);
    },
    onOpen(url, target) {
      // open doesn't carry cardId in the policy signature.
      emit({ kind: 'open', cardId: '', url, target });
      userPolicy?.onOpen?.(url, target);
    },
    onState(cardId, patch) {
      emit({ kind: 'state', cardId, patch });
      userPolicy?.onState?.(cardId, patch);
    },
    onDismiss(cardId) {
      emit({ kind: 'dismiss', cardId });
      userPolicy?.onDismiss?.(cardId);
    },
    onReopen(cardId) {
      emit({ kind: 'reopen', cardId });
      userPolicy?.onReopen?.(cardId);
    },
    onError(cardId, message) {
      emit({ kind: 'error', cardId, message });
      userPolicy?.onError?.(cardId, message);
    },
    maxSendPromptMode: userPolicy?.maxSendPromptMode,
  };
}

/**
 * `<kai-remote>` — mounts a sandboxed cross-origin iframe card.
 *
 * Required props:
 *   - `provider-origin` attribute: the exact HTTPS origin of the card provider
 *     (or http://localhost for local dev).
 *   - `src` attribute: the URL of the card page (must share the provider origin).
 *   - `envelope` JS property: the CardEnvelope to render.
 *
 * Optional:
 *   - `policy` JS property: a CardPolicy for routing card events.
 *   - `theme` attribute (inherited from defineWebComponent): 'light' | 'dark' | 'auto'.
 *
 * Every routed CardEvent is also dispatched as a bubbling+composed `kai-card`
 * CustomEvent off the host element.
 */
defineWebComponent<Props>(
  'kai-remote',
  {
    src: undefined,
    providerOrigin: undefined,
    envelope: undefined,
    policy: undefined,
  },
  (props, { element }) => {
    // Lifted out of onSettled so the theme effect (below) can re-push context to the
    // live bridge after mount. `undefined` until the iframe is successfully mounted.
    let handle: RemoteCardHandle | undefined;

    // Resolve dark mode the SAME way native elements do (see createDarkMode in
    // define.tsx): the `theme` prop is 'light' | 'dark' | 'auto' (default 'auto',
    // which follows the OS `prefers-color-scheme`). Tracked reactively so a host /
    // Storybook theme toggle flows through the effect below.
    // V2-PORT: v2 rejects signal writes in an owned body — SEED from the media
    // query instead of writing right after creation.
    const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : undefined;
    const [systemDark, setSystemDark] = createSignal(mq?.matches ?? false);
    if (mq) {
      const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
      mq.addEventListener('change', onChange);
      onCleanup(() => mq.removeEventListener('change', onChange));
    }
    const isDark = () => {
      const theme = (props.theme as string | undefined) ?? 'auto';
      return theme === 'dark' || (theme === 'auto' && systemDark());
    };

    // V2-PORT: onCleanup is forbidden inside onSettled; collect the teardowns
    // and register them once at the owner scope (same lifecycle as 1.x).
    const settledDisposers: (() => void)[] = [];
    onCleanup(() => { for (const d of settledDisposers) d(); });
    onSettled(() => {
      const shadow = element.shadowRoot;
      if (!shadow) return;

      function renderError(message: string): void {
        const alert = document.createElement('div');
        alert.setAttribute('role', 'alert');
        alert.textContent = message;
        shadow!.appendChild(alert);
      }

      // Validate provider-origin before attempting any mount.
      const providerOrigin = props.providerOrigin;
      if (!isValidProviderOrigin(providerOrigin)) {
        renderError(
          `[kai-remote] Invalid provider-origin "${providerOrigin ?? ''}". ` +
          `Must be an absolute https: origin, or http://localhost / http://127.0.0.1 for local dev.`,
        );
        return;
      }

      const src = props.src;
      if (!src) {
        renderError('[kai-remote] Missing required "src" attribute.');
        return;
      }

      const envelope = props.envelope as CardEnvelope | undefined;
      if (!envelope) {
        renderError('[kai-remote] Missing required "envelope" property.');
        return;
      }

      // Derive a minimal CardContext. Theme resolved the same way native elements
      // do (isDark(), above); read untracked here so this initial mount doesn't
      // re-run on theme change — the createEffect below pushes later changes.
      const context: CardContext = {
        theme: { mode: isDark() ? 'dark' : 'light' },
        locale: (typeof navigator !== 'undefined' && navigator.language) || 'en',
      };

      const userPolicy = props.policy as CardPolicy | undefined;
      const wrappedPolicy = buildWrappedPolicy(element, userPolicy);

      // Create a container inside the shadow root for mountRemoteCard.
      const container = document.createElement('div');
      shadow.appendChild(container);

      try {
        handle = mountRemoteCard({
          container,
          providerOrigin: providerOrigin as string,
          src,
          envelope,
          context,
          policy: wrappedPolicy,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        renderError(`[kai-remote] Mount failed: ${message}`);
        container.remove();
        return;
      }

      settledDisposers.push(() => {
        handle?.destroy();
        handle = undefined;
      });
    });

    // React to later host/Storybook theme toggles: re-push a fresh resolved theme
    // to the live bridge so the framed card re-themes (consistent with native
    // elements). No-op until the iframe has mounted (handle is set). The bridge
    // does a dispose+remount on a genuine theme change — see provider-runtime.ts;
    // token/locale refreshes stay silent.
    // V2-PORT: isDark in the compute; the bridge push in the apply.
    createEffect(
      () => (isDark() ? 'dark' as const : 'light' as const),
      (mode) => { handle?.updateContext({ theme: { mode } }); },
    );

    // This element renders purely into the shadow root via onSettled — no JSX return needed.
    return <></>;
  },
);
