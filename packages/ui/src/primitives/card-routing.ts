// src/primitives/card-routing.ts
// Framework-agnostic card-event plumbing: the bubbling kai-card emitter, the single
// policy router (used by BOTH the native listener and the remote transport), and a
// host-side listener helper for the bare-element path.
import type { CardEvent, CardPolicy } from './card-contract';

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

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];
const SCRIPT_SCHEMES = ['javascript:', 'vbscript:'];

/** The scheme the WHATWG parser reads out of `url`, resolved against a base so a
 *  relative input inherits `http:`. `undefined` when it will not parse at all.
 *
 *  ONE parser for the two questions below, deliberately: the parsing is where
 *  the subtlety lives (it strips embedded tabs/newlines and trims surrounding
 *  whitespace before reading the scheme, so `java\nscript:` and
 *  `  javascript:...  ` are both read as `javascript:` -- which a regex over the
 *  raw string would miss). Two predicates over one parse cannot drift on that;
 *  two hand-rolled parsers would. */
function schemeOf(url: string): string | undefined {
  try { return new URL(url, 'http://_invalid_base').protocol; } catch { return undefined; }
}

/** True when `url` is safe to put in an href / hand to `window.open`.
 *
 *  Exported so the MARKDOWN renderer and the ARTIFACT viewer reuse this exact
 *  guard rather than growing a second scheme list that can drift from this one.
 *
 *  Resolving against a base is deliberate and is what makes it correct for
 *  markdown: a relative or fragment link (`/docs`, `#section`, `./rel`) is
 *  ordinary markdown, and resolving it inherits the base's `http:` so it
 *  passes, while `javascript:`/`data:`/`vbscript:` keep their own protocol and
 *  fail. It is correct for the artifact viewer for the same reason: a file with
 *  no `src` to resolve against yields a bare relative path (`docs/report.pdf`),
 *  which is a legitimate artifact address. Contrast `isRenderableLink` in
 *  `primitives/link-preview.ts`, which takes NO base and so demands an absolute
 *  http(s) URL: that is the right guard for a model-supplied citation -- a
 *  reference to a page on the public web -- this one for markdown body links and
 *  artifact file addresses. */
export function isSafeUrl(url: string): boolean {
  const scheme = schemeOf(url);
  return scheme !== undefined && SAFE_SCHEMES.includes(scheme);
}

/** True when navigating to `url` would EXECUTE it as script in the initiating
 *  document's origin.
 *
 *  Strictly narrower than `!isSafeUrl(url)`, and not a competing policy: it
 *  answers a different question, for the one sink where the allowlist is the
 *  wrong tool. An `<iframe src>` legitimately takes `data:` and `blob:` (a
 *  `data:` blob artifact is a documented `<kai-artifact>` use -- it is what
 *  `displayUrl` exists for) and both get an OPAQUE origin in every modern
 *  browser, so neither can reach the host page. `javascript:`/`vbscript:` are
 *  the schemes that run in the EMBEDDER's origin, and they are the whole risk:
 *  the default sandbox (no `allow-same-origin`) already makes the browser refuse
 *  them, but a consumer who sets `allow-same-origin` turns a model-supplied
 *  `src` into host-origin script execution. The artifact viewer used to suggest
 *  that setting for "an artifact you trust"; it no longer does, and this guard
 *  is what protects the consumers who took the old advice. */
export function isScriptUrl(url: string): boolean {
  const scheme = schemeOf(url);
  return scheme !== undefined && SCRIPT_SCHEMES.includes(scheme);
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
