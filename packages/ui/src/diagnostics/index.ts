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

// The event contract, re-exported so a panel binds to ONE specifier instead of
// reaching into ./wire for the types and ./diagnostics for the hook.
export { subscribeWireDiagnostics } from '../wire/diagnostics';
export type {
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
