// src/remote/provider-runtime.ts
// The provider iframe-side bridge: handshake responder + CardHost impl + auto-height.
// Security-critical, stateful, vanilla DOM ONLY — NO SolidJS imports (ships in the
// SolidJS-free `@kitn.ai/ui/provider` bundle). See the iframe-transport design spec
// (Provider iframe runtime surface + addendum H-A/H-D/H-E/H-J/H-H).

import {
  type CardEnvelope,
  type CardContext,
  type CardEvent,
  type CardHost,
} from '../primitives/card-contract';
import { createPacker, isCardWireFrame, type WireMessage } from './wire';
import { assertOrigin, redactFrame } from './origin';
import { negotiateVersion } from './version';
import { hasPollutionKey } from './validate';
import { observeDocumentHeight } from '../primitives/use-resize-observer';
import { validateAgainstSchema, type JsonSchema } from '../primitives/card-validate';

/** A provider-side renderer for one card `type`. Renamed (was CardRenderer) per H-K
 *  to avoid colliding with the exported Solid `<CardRenderer>` component. */
export interface RemoteCardRenderer {
  /** The card `type` this renderer handles. */
  type: string;
  /** Optional JSON Schema for this type's `data`; validated best-effort before mount. */
  schema?: JsonSchema;
  /** Mount into `root`, given the envelope + a CardHost. Return a disposer. */
  mount(root: HTMLElement, envelope: CardEnvelope, host: CardHost): () => void;
}

export interface CreateCardBridgeOptions {
  /** Element the card mounts into + whose height is observed. */
  root: HTMLElement;
  /** Renderers by card type. Unknown type → inline "unsupported card" + event{error}. */
  renderers: RemoteCardRenderer[];
  /** Versions this runtime supports (default ['1']). */
  supportedVersions?: string[];
}

export interface CardBridge {
  /** Begin: listen for `hello`, complete handshake, render on `render`. */
  start(): void;
  /** Stop observers + listeners + dispose current card. */
  stop(): void;
}

const DEFAULT_VERSIONS = ['1'];

/** A minimal complete-enough default so `CardHost.context()` never returns undefined
 *  (the contract's return is non-optional) before the first `context` frame. */
function defaultContext(): CardContext {
  return { theme: { mode: 'light' }, locale: 'en' };
}

export function createCardBridge(options: CreateCardBridgeOptions): CardBridge {
  const { root, renderers } = options;
  const hostVersions = options.supportedVersions ?? DEFAULT_VERSIONS;
  const rendererByType = new Map(renderers.map((r) => [r.type, r] as const));

  // ── Locked-after-hello bridge identity (H-A/H-C). null until the first valid hello. ──
  let lockedSource: unknown = null;
  let lockedOrigin: string | null = null;
  let nonce: string | null = null;
  let negotiated: string | null = null;
  let packer: ReturnType<typeof createPacker> | null = null;
  let stopped = false; // tombstone: rejects all inbound once the version is unsupported / stopped

  // ── Render state (H-E). One card at a time in v1. ──
  let context: CardContext | null = null;
  let currentId: string | null = null;
  let currentEnvelope: CardEnvelope | null = null;
  let dispose: (() => void) | null = null;
  let stopObserver: (() => void) | null = null;
  // The theme key applied at the current mount. A `context` push only forces a
  // dispose+remount when the theme actually changes (renderers apply theme
  // imperatively at mount); token/locale/a11y refreshes are read on-demand via
  // host.context() and must NOT wipe in-progress card state.
  let appliedThemeKey: string | null = null;
  const themeKey = (c: CardContext | null) => JSON.stringify(c?.theme ?? null);

  function warnDrop(data: unknown): void {
    try { console.warn('[kai-remote]', redactFrame(data)); } catch { /* best-effort */ }
  }

  function postUp(message: WireMessage): void {
    if (!packer || !lockedOrigin) return;
    try { (parent as Window).postMessage(packer(message), lockedOrigin); } catch { /* best-effort */ }
  }

  const cardHost: CardHost = {
    context: () => context ?? defaultContext(),
    // HOST CONTRACT: the host MUST validate inbound event.cardId against the active card,
    // because the provider cannot fence a replaced/stale renderer's host.emit calls.
    emit: (event: CardEvent) => postUp({ dir: 'up', kind: 'event', event }),
  };

  function disposeCurrent(): void {
    if (dispose) {
      try { dispose(); } catch { /* renderer disposer threw — best-effort */ }
    }
    dispose = null;
    currentId = null;
    currentEnvelope = null;
    appliedThemeKey = null;
  }

  function startObserver(): void {
    // Tear down any existing observer so observeDocumentHeight's internal `last` baseline
    // re-initializes to -1 and the newly-mounted card always emits its initial height.
    // observeDocumentHeight (not observeContentHeight) so the reported height covers
    // the FULL rendered document — root's own padding/border AND the provider page's
    // body padding above it — not just root's ResizeObserver content-box (D1).
    stopObserver?.(); stopObserver = null;
    stopObserver = observeDocumentHeight(root, (height) => {
      if (!currentId) return;
      cardHost.emit({ kind: 'resize', cardId: currentId, height });
    });
  }

  function renderUnsupported(envelope: CardEnvelope, message: string): void {
    disposeCurrent();
    root.replaceChildren();
    const el = document.createElement('div');
    el.setAttribute('role', 'alert');
    el.textContent = `Unsupported card: ${envelope.type}`;
    root.appendChild(el);
    currentId = envelope.id;
    startObserver(); // placeholder has a height the host must know about
    cardHost.emit({ kind: 'error', cardId: envelope.id, message });
  }

  function handleRender(envelope: CardEnvelope): void {
    // Prototype-pollution guard (H-D): nested data is forwarded to app handlers.
    if (hasPollutionKey(envelope.data)) {
      renderUnsupported(envelope, 'rejected: payload contains a prohibited key');
      return;
    }
    const renderer = rendererByType.get(envelope.type);
    if (!renderer) {
      renderUnsupported(envelope, `no renderer registered for type "${envelope.type}"`);
      return;
    }
    // Best-effort schema validation (H-D). On failure: placeholder + event{error}.
    if (renderer.schema) {
      const result = validateAgainstSchema(renderer.schema, envelope.data);
      if (!result.valid) {
        renderUnsupported(envelope, `invalid card data: ${result.errors.join('; ')}`);
        return;
      }
    }

    // Re-render rules (H-E): same id OR different id → dispose current, clear, mount new
    // (v1 has no in-place renderer update path).
    disposeCurrent();
    root.replaceChildren();
    try {
      dispose = renderer.mount(root, envelope, cardHost) ?? (() => {});
      currentId = envelope.id;
      currentEnvelope = envelope;
      appliedThemeKey = themeKey(context);
    } catch {
      // NON-REFLECTIVE fault (H-H): never echo envelope/context content.
      dispose = null;
      currentId = envelope.id; // onError needs a cardId even on mount failure
      postUp({ dir: 'up', kind: 'fault', code: 'render-failed', message: 'card failed to render' });
      return;
    }
    startObserver();
  }

  function onMessage(event: MessageEvent): void {
    if (stopped) return;
    const data = event.data;

    // ── Pre-lock: only the FIRST valid down `hello` from window.parent locks the bridge. ──
    if (lockedSource === null) {
      if (!isCardWireFrame(data, 'down')) return;
      if (data.message.kind !== 'hello') return;
      if (event.source !== window.parent) return; // host source must be the parent window
      const supported = (data.message as { supportedVersions: string[] }).supportedVersions;
      const picked = negotiateVersion(supported, hostVersions);
      const echoedNonce = data.nonce;
      const origin = event.origin;
      if (picked === null) {
        // No common version → fault with the host's first supported version + received nonce.
        try {
          (parent as Window).postMessage(
            createPacker(hostVersions[0], echoedNonce)({ dir: 'up', kind: 'fault', code: 'version-unsupported', message: 'no compatible protocol version' }),
            origin,
          );
        } catch { /* best-effort */ }
        stopped = true; // refuse further frames
        return;
      }
      // Lock identity.
      lockedSource = event.source;
      lockedOrigin = origin;
      nonce = echoedNonce;
      negotiated = picked;
      packer = createPacker(negotiated, nonce);
      postUp({ dir: 'up', kind: 'ready', acceptedVersion: negotiated, capabilities: { types: renderers.map((r) => r.type) } });
      return;
    }

    // ── Post-lock: ALL gates must pass (H-A source + origin + H-D direction + nonce + version). ──
    if (event.source !== lockedSource) { warnDrop(data); return; }
    if (!assertOrigin(event.origin, lockedOrigin!)) { warnDrop(data); return; }
    if (!isCardWireFrame(data, 'down')) { warnDrop(data); return; }
    if (data.nonce !== nonce) { warnDrop(data); return; }
    if (data.version !== negotiated) { warnDrop(data); return; }

    try {
      const message = data.message;
      switch (message.kind) {
        case 'hello':
          // Re-hello after lock is ignored (bridge identity is fixed for its generation).
          return;
        case 'context': {
          const next = (message as { context: CardContext }).context;
          context = next;
          // Live context push. Renderers read host.context() on-demand, so silent
          // token/locale/a11y refreshes need NO remount — storing the new context is
          // enough. Only a THEME change requires a dispose+remount, since renderers
          // apply theme imperatively at mount (v1 has no in-place update hook).
          if (currentEnvelope && themeKey(next) !== appliedThemeKey) {
            handleRender(currentEnvelope); // handleRender resets appliedThemeKey
          }
          return;
        }
        case 'render':
          handleRender((message as { envelope: CardEnvelope }).envelope);
          return;
        case 'teardown':
          teardown();
          return;
        default:
          warnDrop(data);
          return;
      }
    } catch (e) {
      // No throw may escape the message handler — the listener must survive.
      warnDrop(data);
    }
  }

  function teardown(): void {
    disposeCurrent();
    if (stopObserver) { stopObserver(); stopObserver = null; }
    root.replaceChildren();
  }

  return {
    start() {
      window.addEventListener('message', onMessage);
    },
    stop() {
      stopped = true;
      window.removeEventListener('message', onMessage);
      teardown();
    },
  };
}
