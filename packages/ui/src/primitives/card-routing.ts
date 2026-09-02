// src/primitives/card-routing.ts
// Framework-agnostic card-event plumbing: the bubbling kai-card emitter, the single
// policy router (used by BOTH the native listener and the remote transport), and a
// host-side listener helper for the bare-element path.
import type { CardEvent, CardPolicy } from './card-contract';
// isSafeUrl/isScriptUrl live in their own DOM-free file so schema.ts
// (mcp/construct, checked under tsconfig.mcp.json's Node-only pass)
// can import isSafeUrl without dragging this file's HTMLElement/window/
// CustomEvent references into a no-DOM-lib compile. Re-exported here so this
// module's own public surface is unchanged.
import { isSafeUrl, isScriptUrl } from './url-scheme-policy';
export { isSafeUrl, isScriptUrl } from './url-scheme-policy';

/** The single contract event name. */
export const CARD_EVENT_NAME = 'kai-card';

/** Dispatch a CardEvent as the bubbling, composed `kai-card` event a host listener
 *  routes. NB: this is deliberately different from defineWebComponent's built-in
 *  non-bubbling dispatch. */
export function emitCardEvent(element: HTMLElement, event: CardEvent): void {
  element.dispatchEvent(
    new CustomEvent<CardEvent>(CARD_EVENT_NAME, { detail: event, bubbles: true, composed: true }),
  );
}

function warnNoHandler(kind: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[kai-card] no policy handler for "${kind}"`);
}

/** Apply the contract's policy to one event. The ONE place routing lives. */
export function routeCardEvent(policy: CardPolicy | undefined, event: CardEvent): void {
  const p: CardPolicy = policy ?? {};
  switch (event.kind) {
    case 'ready':
      break; // lifecycle; host may react via its own listener
    case 'submit':
      p.onSubmit ? p.onSubmit(event.cardId, event.data) : warnNoHandler('submit');
      break;
    case 'action':
      p.onAction ? p.onAction(event.cardId, event.action, event.payload) : warnNoHandler('action');
      break;
    case 'send-prompt': {
      const requested = event.mode ?? 'compose';
      const mode = p.maxSendPromptMode === 'send' ? requested : 'compose';
      p.onSendPrompt ? p.onSendPrompt(event.text, { mode, context: event.context }) : warnNoHandler('send-prompt');
      break;
    }
    case 'open': {
      if (!isSafeUrl(event.url)) {
        p.onError ? p.onError(event.cardId, `Blocked unsafe url: ${event.url}`) : warnNoHandler('open(unsafe)');
        break;
      }
      const target = event.target ?? 'tab';
      if (p.onOpen) p.onOpen(event.url, target);
      else if (typeof window !== 'undefined') window.open(event.url, '_blank', 'noopener,noreferrer');
      break;
    }
    case 'state':
      p.onState ? p.onState(event.cardId, event.patch) : warnNoHandler('state');
      break;
    case 'dismiss':
      p.onDismiss ? p.onDismiss(event.cardId) : warnNoHandler('dismiss');
      break;
    case 'reopen':
      p.onReopen ? p.onReopen(event.cardId) : warnNoHandler('reopen');
      break;
    case 'error':
      p.onError ? p.onError(event.cardId, event.message) : warnNoHandler('error');
      break;
    case 'resize':
      break; // transport plumbing (iframe height); not an app-policy concern natively
  }
}

/** Attach a host-level `kai-card` listener that routes every bubbling card event
 *  through `policy`. Returns an unsubscribe fn. For the bare-element path. */
export function listenForCardEvents(
  root: HTMLElement | Document,
  policy: CardPolicy,
): () => void {
  const handler = (e: Event) => routeCardEvent(policy, (e as CustomEvent<CardEvent>).detail);
  root.addEventListener(CARD_EVENT_NAME, handler as EventListener);
  return () => root.removeEventListener(CARD_EVENT_NAME, handler as EventListener);
}
