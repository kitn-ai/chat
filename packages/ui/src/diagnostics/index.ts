// @kitn.ai/ui/diagnostics: the recorder hook and the event contract a devtools
// panel binds to.
//
// Separate from ./wire on purpose. `wire` PRODUCES the events as a side effect
// of parsing a stream and touches no global; this entry is the browser-only half
// that installs `window.__KAI_DEVTOOLS_HOOK__` and holds the session buffer.
// Keeping them apart leaves a consumer who only parses streams at zero cost.
//
// WHO CALLS `installKaiDevtoolsHook()`. The kit calls it for you from
// `elements/register-impl.ts`, so any app that registers the `kai-*` elements --
// which is every consumer of `@kitn.ai/ui/elements`, the React wrappers, or the
// CDN bundle -- gets the hook with no work.
//
// THE ONE CASE THAT DOES NOT: an app importing the SolidJS components directly
// from `@kitn.ai/ui` never runs `register-impl`, because it never registers a
// custom element. Nothing is broken there and nothing warns, it simply has no
// hook, so a panel finds nothing to attach to. Call it yourself at app start:
//
//   import { installKaiDevtoolsHook } from '@kitn.ai/ui/diagnostics';
//   installKaiDevtoolsHook();
//
// It is idempotent and SSR-safe, so calling it unconditionally at your entry is
// correct even if you also register elements elsewhere.
export { installKaiDevtoolsHook } from './hook';
export type { KaiDevtoolsHook } from './hook';

// The app's DELIBERATE DISCLOSURE of what it actually sent.
//
// The one producer on this surface, and the exception is principled rather than
// a slip: `emitWireDiagnostic` stays internal because a consumer holding it can
// forge any event and make a panel lie about a stream that never happened,
// while this emits a single type whose whole content is "what the app says it
// sent" -- a subject on which the app is the authority. Nothing to forge.
//
// It exists because the kit structurally cannot see the request: the system
// prompt, the model choice and any RAG or guardrail injection are added by the
// app's own route. See the module docblock for why disclosure is the app's
// decision and never the kit's collection.
export { reportRequest } from './report-request';
export type { ReportRequestOptions } from './report-request';

// The event contract, re-exported so a panel binds to ONE specifier instead of
// reaching into ./wire for the types and ./diagnostics for the hook.
//
// SUBSCRIPTION AND TYPES ONLY. The producer side -- `emitWireDiagnostic`,
// `wireDiagnosticsActive`, `nextStreamId`, and now `setWirePayloadCapture` and
// `wirePayloadActive` -- stays internal. A consumer that can forge events or
// reset the stream counter can make a panel lie about a stream that never
// happened, and one that can flip payload capture can start recording an app's
// users' conversations without the app deciding to. Payload is the app's
// decision, made through the signal.
export { subscribeWireDiagnostics } from '../wire/diagnostics';
export type {
  AppRequestEvent,
  EncodeAttachmentReport,
  EncodeDroppedEvent,
  EncodeRequestEvent,
  WireCloseEvent,
  WireDiagnosticBase,
  WireDiagnosticEvent,
  WireFailedEvent,
  WireFrameEvent,
  WireInterruptedEvent,
  WireOpenEvent,
  WirePartEvent,
} from '../wire/diagnostics';
