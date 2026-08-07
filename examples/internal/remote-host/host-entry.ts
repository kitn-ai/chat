/**
 * examples/remote-host/host-entry.ts
 * ===================================
 * Reference HOST page for the remote (iframe) Card transport — the cross-origin
 * counterpart to examples/remote-provider/. Used as the host side of the
 * standalone Playwright matrix (tests/e2e/remote-element.spec.ts).
 *
 * Served by Vite on http://localhost:6006 (see playwright.config.ts); the provider
 * runs on http://localhost:6007 — two distinct origins, so postMessage is REAL
 * cross-origin (not a same-origin shortcut).
 *
 * It mounts ONE remote card via mountRemoteCard() and logs every ROUTED CardEvent
 * (the ones that pass the host's origin+source+nonce+schema gates) to <pre id="log">
 * as newline-delimited JSON, so the e2e suite can assert on the host's observed
 * behavior rather than on internals.
 *
 * Query params (drive the test matrix from the URL):
 *   ?card=form   (default) interactive form card
 *   ?card=info   self-contained display card (zero round-trip)
 *   ?bad=1       point src at a path on the provider origin that 404s → handshake
 *                times out → inline fallback + Retry (failure-mode test)
 *   ?max=NNN     maxHeight cap (px)
 */
import { mountRemoteCard, type RemoteCardHandle } from '../../../packages/ui/src/remote/host-embed';
import type { CardEnvelope, CardContext, CardEvent } from '../../../packages/ui/src/primitives/card-contract';

const PROVIDER_ORIGIN = 'http://localhost:6007';

const params = new URLSearchParams(window.location.search);
const cardKind = params.get('card') ?? 'form';
const bad = params.get('bad') === '1';
const maxHeight = params.has('max') ? Number(params.get('max')) : undefined;

const logEl = document.getElementById('log') as HTMLPreElement;
const statusEl = document.getElementById('status') as HTMLElement;

/** Append one routed event as a JSON line; the e2e suite parses these lines. */
function log(entry: unknown): void {
  logEl.textContent += JSON.stringify(entry) + '\n';
}

// ── The card to render ────────────────────────────────────────────────────────
const FORM_ENVELOPE: CardEnvelope = {
  type: 'form',
  id: 'host-form-1',
  title: 'Quick question',
  data: {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', title: 'Email', format: 'email' },
      // A boolean that, when toggled, reveals a follow-up — grows the card so the
      // auto-height path is observable from the host (iframe.clientHeight changes).
      details: { type: 'boolean', title: 'Add a note?' },
      note: { type: 'string', title: 'Note', 'x-kai-widget': 'textarea' },
    },
    'x-kai-submitLabel': 'Send',
  },
};

const INFO_ENVELOPE: CardEnvelope = {
  type: 'info',
  id: 'host-info-1',
  title: 'Weather',
  data: {
    location: 'San Francisco',
    temperature: 18,
    unit: '°C',
    condition: 'Partly cloudy',
    humidity: 64,
    wind: 12,
    feelsLike: 17,
    forecast: [
      { day: 'Mon', high: 19, low: 12 },
      { day: 'Tue', high: 21, low: 13 },
      { day: 'Wed', high: 17, low: 11 },
    ],
  },
};

const envelope = cardKind === 'info' ? INFO_ENVELOPE : FORM_ENVELOPE;

// A provider-origin page that runs NO bridge → no `ready` → handshake times out
// → inline fallback + Retry (the failure-mode path).
const src = bad ? `${PROVIDER_ORIGIN}/blank.html` : `${PROVIDER_ORIGIN}/`;

let dark = false;
function context(): CardContext {
  return { theme: { mode: dark ? 'dark' : 'light' }, locale: 'en' };
}

const container = document.getElementById('card') as HTMLElement;

let handle: RemoteCardHandle;
function mount(): void {
  handle = mountRemoteCard({
    container,
    providerOrigin: PROVIDER_ORIGIN,
    src,
    envelope,
    context: context(),
    maxHeight,
    // Shorten the handshake timeout for the bad-src failure test so it resolves fast.
    handshakeTimeoutMs: bad ? 1500 : 5000,
    policy: {
      onSubmit: (cardId, data) => log({ kind: 'submit', cardId, data }),
      onAction: (cardId, action, payload) => log({ kind: 'action', cardId, action, payload }),
      onError: (cardId, message) => log({ kind: 'error', cardId, message }),
    },
  });
  reflectState();
}

function reflectState(): void {
  statusEl.textContent = handle ? handle.state() : 'unmounted';
  statusEl.dataset.state = handle ? handle.state() : 'unmounted';
}

// Reflect bridge state to the DOM on an interval so the e2e suite can poll it.
setInterval(reflectState, 100);

// ── Test-control buttons ──────────────────────────────────────────────────────
document.getElementById('toggle-theme')!.addEventListener('click', () => {
  dark = !dark;
  handle.updateContext({ theme: { mode: dark ? 'dark' : 'light' } });
});

// Simulate a malicious wrong-origin postMessage hitting the host window. The host
// SDK pins origin+source+nonce, so this MUST be ignored (the log stays unchanged).
document.getElementById('inject-bad')!.addEventListener('click', () => {
  window.postMessage(
    {
      protocol: 'kitn-card',
      version: '1',
      nonce: 'attacker',
      message: { dir: 'up', kind: 'event', event: { kind: 'submit', cardId: 'host-form-1', data: { hacked: true } } },
    },
    '*',
  );
});

// Expose a tiny hook so the e2e suite can read the log as a structured array.
(window as unknown as { __routedEvents: () => CardEvent[] }).__routedEvents = () =>
  logEl.textContent
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as CardEvent);

mount();
