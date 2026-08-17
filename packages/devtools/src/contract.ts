// The contract the panel binds to, re-declared LOCALLY.
//
// The panel floats free of the kit: it is CDN-delivered, and an old panel will
// meet a new kit exactly as often as the reverse. So the shipped bundle imports
// nothing from `@kitn.ai/ui` at runtime -- it talks to a plain object on
// `window`, and these declarations describe what it expects to find there.
//
// The kit's own types are pulled in at TYPE LEVEL only, below. `import type`
// vanishes at build, so it costs the bundle nothing while making drift a
// TYPECHECK failure here rather than a silent runtime mismatch in someone's
// staging environment. That is the whole reason to pay for the import.
import type {
  WireDiagnosticEvent as KitWireDiagnosticEvent,
  KaiDevtoolsHook as KitKaiDevtoolsHook,
} from '@kitn.ai/ui/diagnostics';

/**
 * One diagnostic event, as the ENVELOPE and nothing more.
 *
 * Only the three fields every event shares are declared. Everything else is
 * read through `field()` below, which is not squeamishness -- it is the
 * forward-compat rule expressed in the type system. A newer kit adds types and
 * fields, and this panel must ignore both rather than throw, so a field it does
 * not know is `unknown` by construction and has to be narrowed at the point of
 * use.
 *
 * Deliberately NOT an index-signature type. A TypeScript interface has no
 * implicit index signature, so the kit's own union of interfaces would not be
 * assignable to one, and the drift check below -- the entire reason for the
 * type-level import -- would fail for a reason that has nothing to do with
 * drift.
 */
export interface WireDiagnosticEvent {
  type: string;
  t: number;
  streamId?: string;
}

/** Read a field the envelope does not declare. Returns `unknown` on purpose:
 *  every caller has to say what it expects and cope with being wrong. */
export function field(e: WireDiagnosticEvent, key: string): unknown {
  return (e as unknown as Record<string, unknown>)[key];
}

/** The hook, as the panel needs it.
 *
 *  `attach` is optional ON PURPOSE. It is the correct entry point -- one
 *  synchronous, exactly-once, throw-isolated handover -- but a kit older than
 *  the release that added it still reports `version: 1` and offers only
 *  drain/subscribe. Marking it optional is what makes the fallback in
 *  `hook-client.ts` a typed path rather than a cast, and it is why the feature
 *  test is the PRESENCE OF THE METHOD and never the version number. */
export interface KaiDevtoolsHook {
  version: number;
  recording?: boolean;
  drain(): WireDiagnosticEvent[];
  subscribe(fn: (e: WireDiagnosticEvent) => void): () => void;
  attach?(fn: (e: WireDiagnosticEvent) => void): () => void;
  activate?(): void;
}

/**
 * Drift guards, and they really do fail.
 *
 * `Assert<T extends true>` only accepts `true`, so if the kit renames a field
 * or changes a signature the conditional resolves to `false`, violates the
 * constraint, and `typecheck` fails HERE naming the contract -- instead of the
 * panel silently reading `undefined` in production six weeks later.
 */
type Assert<T extends true> = T;
export type _EventContractHolds = Assert<
  KitWireDiagnosticEvent extends WireDiagnosticEvent ? true : false
>;
export type _HookContractHolds = Assert<
  KitKaiDevtoolsHook extends KaiDevtoolsHook ? true : false
>;
