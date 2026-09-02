// Single entry that registers all kitn custom elements. Importing this file
// (or the built bundle) defines the elements as a side effect — but ONLY in a
// browser/DOM context.
//
// SSR-safe: the kai-* elements bundle Solid's client runtime, which touches
// `window` at module-eval (delegateEvents(events, doc = window.document)). With
// no `window`, a static import would throw. So the actual component registration
// lives in ./register-impl and is loaded behind a browser check + dynamic
// import() — static ESM imports hoist + evaluate unconditionally, so a bare `if`
// cannot gate them; a dynamic import() can. On the server this module is inert
// (no DOM → no registration → no throw); in the browser it registers as before.
//
// Registration is async (a microtask after this module loads). Consumers that
// need the upgraded element (e.g. the React runtime) guard with
// customElements.whenDefined(), which resolves once the impl chunk has run.
/** Resolves once the kai-* elements are registered (browser); inert on the server.
 *  Await this instead of customElements.whenDefined for a single ready signal.
 *
 *  NOTE: this MUST stay an exported binding. A bare `void import('./register-impl')`
 *  is a result-unused dynamic import that the single-entry register-all build
 *  (KAI_BUILD=register, config/vite/elements.ts → dist/kai.es.js) tree-shakes away
 *  as dead code, leaving the bundle with NOTHING registered. Exporting the promise
 *  keeps the import live. */
export const elementsReady: Promise<unknown> =
  typeof window !== 'undefined' && typeof customElements !== 'undefined'
    ? import('./register-impl')
    : Promise.resolve();

export type { ChatMessage, ChatMessageAction } from './chat-types';
export { configureCodeHighlighting, isCodeHighlightingEnabled } from '../primitives/highlighter';
export type { CodeHighlightingOptions } from '../primitives/highlighter';

// ToolPart.kind's doc comment in the shipped dist/elements.d.ts says "Derive with
// `classifyTool(type)`", but the function was exported from NO public entry, so a
// consumer following our own docs hit an unresolvable import. Total, deterministic
// and always terminating in 'generic' — safe to expose, and needed by anyone
// rendering tool calls themselves. tool-classify.ts imports nothing, so this stays
// SSR-safe and adds no weight to the register-all bundle.
export { classifyTool } from '../components/tool-classify';
export type { ToolKind } from '../components/tool-classify';

// Element-layer diagnostics. `emitElementRegistry()` re-emits the which-elements-
// are-defined snapshot on demand, for a panel that attached mid-session and so
// missed the one register-impl emits at load. SSR-safe and a no-op with no
// subscriber, so calling it unconditionally is fine.
//
// WHY THIS ONE PRODUCER IS PUBLIC while `@kitn.ai/ui/diagnostics` deliberately
// keeps `emitWireDiagnostic`, `nextStreamId` and `setWirePayloadCapture`
// internal. That rule exists because a consumer able to forge events or reset
// the stream counter can make a panel lie about a stream that never happened,
// and one able to flip payload capture can start recording an app's users'
// conversations without the app deciding to. This function takes no arguments
// and reports nothing but `customElements.get()` over the manifest: there is no
// value to forge, no counter to move and no capture to arm. It can only tell the
// truth about the registry, which is the one thing a late-attaching panel cannot
// find out for itself.
//
// The event TYPES are re-exported here as well as from @kitn.ai/ui/diagnostics:
// a consumer already importing the elements entry should not have to add a
// second specifier to name the events it is handed.
export { emitElementRegistry } from './element-diagnostics';
export type {
  ElementDiagnosticBase,
  ElementDiagnosticEvent,
  ElementRegistryEvent,
  ElementViolationEvent,
  ElementViolationKind,
} from './diagnostic-events';

// Imperative toast API — usable directly from the elements entry so consumers
// who only import the web-components bundle still get `toast()`. The store is
// SSR-safe (no DOM touched until the first toast is raised on the client).
export { toast, configureToasts } from '../primitives/toast-store';
export type {
  ToastConfig,
  ToastItem, ToastVariant, ToastAction, ToastOptions, ToastHandle,
} from '../primitives/toast-store';
