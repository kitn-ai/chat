/**
 * examples/remote-provider/provider-entry.ts
 * ===========================================
 * Reference provider iframe runtime — runs entirely in the browser with no prior
 * build step (imports directly from src/ via the Vite dev server at :6007).
 *
 * Demonstrates BOTH canonical card interaction patterns (the renderers themselves
 * live in ./renderers so the static Storybook docs can reuse them verbatim):
 *
 *   1. form  — interactive / data-collecting card.
 *              Mounts <kai-form>, forwards submit to the host via CardHost.emit.
 *              Round-trip: host → render → user fills → submit → host receives data.
 *
 *   2. info  — display-rich / self-contained card.
 *              Renders a "weather"-style read-only view from envelope.data.
 *              May contain internal interaction (details toggle) but emits NOTHING
 *              back to the host — proves the zero-round-trip pattern.
 *
 * Production providers:
 *   - Import from '@kitn.ai/ui/provider' (the published bundle) instead of the
 *     src/ paths below.
 *   - Register only the card types relevant to their domain.
 *   - Harden the CSP (see index.html comments).
 */

// ── Kit imports (source paths for dev — no build required) ────────────────────
import { createCardBridge } from '../../../packages/ui/src/remote/provider';
import { formRenderer, infoRenderer } from './renderers';

// ── Bridge setup ───────────────────────────────────────────────────────────────
//
// createCardBridge wires up the postMessage protocol (handshake → render → events).
// .start() registers the window 'message' listener and waits for the host's hello.
const root = document.getElementById('root');
if (!root) throw new Error('[remote-provider] #root element not found');

createCardBridge({
  root,
  renderers: [formRenderer, infoRenderer],
}).start();
