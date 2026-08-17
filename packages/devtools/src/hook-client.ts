// Finding the kit's hook and attaching to it correctly.
//
// ATTACHING IS THE PART THAT IS EASY TO GET WRONG, and both obvious ways are
// wrong. `drain()` then `subscribe()` silently loses an event that lands between
// the two calls; `subscribe()` then `drain()` delivers that event twice. Neither
// is fixable from out here, because the gap is between two calls this code does
// not control -- which is exactly why the kit grew `attach`, a single
// synchronous handover that is also isolated against a callback that throws.
//
// So: use `attach` whenever it exists. The fallback below is ONLY for a kit
// older than the release that added it -- such a kit still reports `version: 1`,
// so the presence of the METHOD is the feature test, never the version number.
// That is the forward-compat case the design requires the panel to handle: an
// old kit meeting a new panel.
import type { KaiDevtoolsHook, WireDiagnosticEvent } from './contract';

export interface Attachment {
  hookVersion: number;
  /** Whether the kit was recording at install, when it says so. */
  recording?: boolean;
  /** True when the legacy path was used, so the UI can say the history may be
   *  approximate rather than quietly implying it is exact. */
  legacy: boolean;
  detach(): void;
}

/** Read the global through a local cast rather than a `declare global`.
 *
 *  The kit ships its own declaration for this property, and TypeScript requires
 *  every declaration of a global to have an IDENTICAL type -- so redeclaring it
 *  here with the panel's deliberately looser contract is a hard error. Casting
 *  at the one read site keeps the panel's types independent of whether the kit's
 *  are even installed, which is the position a free-floating panel should be in. */
export function findHook(): KaiDevtoolsHook | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __KAI_DEVTOOLS_HOOK__?: KaiDevtoolsHook })
    .__KAI_DEVTOOLS_HOOK__;
}

/**
 * Deliver history and live events to `fn`, in order, exactly once each.
 *
 * Returns undefined when there is no hook at all -- the kit is absent or too
 * old to have one, which is a state the panel reports rather than crashes on.
 */
export function attachToHook(
  fn: (e: WireDiagnosticEvent) => void,
  hook = findHook(),
): Attachment | undefined {
  if (!hook) return undefined;

  if (typeof hook.attach === 'function') {
    const detach = hook.attach(fn);
    return {
      hookVersion: hook.version,
      recording: hook.recording,
      legacy: false,
      detach,
    };
  }

  // LEGACY PATH. subscribe-then-drain, because the other order loses events and
  // losing one is worse than seeing one twice -- and a duplicate is something
  // this code can actually remove. Identity dedupe: the kit hands out the same
  // object reference to the buffer and to a live subscriber, so an event
  // delivered by both routes is `===`, and a Set of what has already been sent
  // suppresses the second copy without inspecting any field.
  const delivered = new Set<WireDiagnosticEvent>();
  const send = (e: WireDiagnosticEvent) => {
    if (delivered.has(e)) return;
    delivered.add(e);
    fn(e);
  };
  const off = hook.subscribe(send);
  // Anything that arrived between subscribe and here is in BOTH the buffer and
  // `delivered`, so the dedupe -- not the ordering -- is what makes this safe.
  for (const e of hook.drain()) send(e);

  return {
    hookVersion: hook.version,
    recording: hook.recording,
    legacy: true,
    detach: off,
  };
}
