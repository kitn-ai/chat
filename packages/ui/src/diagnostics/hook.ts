// The recorder hook: `window.__KAI_DEVTOOLS_HOOK__`.
//
// The panel floats free of the kit -- it is CDN-delivered, arrives whenever the
// page gets to it, and is a LATE SUBSCRIBER by design. This is the object it
// attaches to: drain the history, then stream live.
//
// This is React DevTools' shape minus its hardest constraint. React's hook must
// be installed BEFORE React loads, which is why it ships as an extension running
// at document_start. Ours does not: the recorder is inside the kit, so it is
// present as soon as the kit is. That is the whole reason the buffer exists.
//
// TWO BRANCHES, decided ONCE, SYNCHRONOUSLY, at install.
//
// Synchronous is a hard requirement, not a preference: an async answer means an
// interval of "unknown", and an interval of unknown is exactly what forces a
// permanent ring buffer with a size constant nobody can choose well. The events
// that explain a session are almost always its first ones, so a buffer small
// enough to be free has usually discarded the answer by the time anyone looks,
// and a buffer large enough to hold it charges every production user of every
// app for a panel almost none of them open.
//
//   NOT WANTED -- no buffer is allocated and no subscription is made, so
//   `wireDiagnosticsActive()` stays false and emission remains a guarded no-op.
//   The hook is still installed: it is a few bytes, it carries `activate()`, and
//   it is what lets a panel attach later at all. A dormant panel does not
//   subscribe, which is what keeps a permanently pasted script tag genuinely
//   dormant rather than quietly recording.
//
//   WANTED -- capture from the first event, uncapped, before the panel exists.
//   Until the panel attaches nothing bounds the buffer, and that window is the
//   seconds the panel takes to load; after it attaches the panel owns retention,
//   because the data lives there rather than here.
//
// SSR: no `window`, no `localStorage` and no `location` touched at module scope,
// and installing is a no-op without a window. Server-side there is no signal to
// read, so the answer is no and the recorder never starts.
import {
  subscribeWireDiagnostics,
  type WireDiagnosticEvent,
} from '../wire/diagnostics';

/** The localStorage key and query parameter. Same spelling in both, so the two
 *  ways in read the same in a bug report. */
const SIGNAL_KEY = 'kai-devtools';

export interface KaiDevtoolsHook {
  /** The seam. A panel newer than the kit it attached to has to be able to say
   *  so, which is the whole reason this is on the hook rather than inferred. */
  version: 1;
  /** True iff the signal was set AT INSTALL. Not reactive: the capture model
   *  turns on one branch or the other exactly once, and a panel reading `false`
   *  here is reading "this session has no history", which stays true. */
  recording: boolean;
  /** The buffered history, and CLEARS it. `[]` on the dormant branch, always.
   *
   *  Kept for contract compatibility, but `attach` is what a panel should use:
   *  pairing this with `subscribe` cannot be done without a race (see there). */
  drain(): WireDiagnosticEvent[];
  /** Live events from now on. Works on both branches -- subscribing is what
   *  re-arms emission, so a panel can attach mid-session and see events from
   *  that moment forward, with no history. */
  subscribe(fn: (e: WireDiagnosticEvent) => void): () => void;
  /**
   * History and live delivery in ONE synchronous step. Returns the unsubscribe.
   *
   * THIS IS THE ONE A PANEL WANTS, and the reason is that the obvious pairing
   * of the two calls above is racy in BOTH orders: `drain()` then `subscribe()`
   * silently loses an event that lands between them, while `subscribe()` then
   * `drain()` delivers that event twice. Neither order is fixable from outside,
   * because the gap is between two calls the caller does not control.
   *
   * Here the buffered events are handed over, the buffer cleared and the
   * subscription installed without an await or a task boundary anywhere
   * between, so there is no instant at which an event can arrive and find
   * itself either unowned or owned twice.
   *
   * Additive, so `version` stays 1: the forward-compat rules allow new members,
   * and an older panel that never calls this keeps working unchanged.
   */
  attach(fn: (e: WireDiagnosticEvent) => void): () => void;
  /** Set the signal and reload, so the next load records from the first event.
   *  Reload is the primary path because it is the only one that yields HISTORY,
   *  and the answer is usually near the beginning of a session. */
  activate(): void;
}

declare global {
  interface Window {
    /** The app's own opt-in, set before the kit loads. A plain boolean, and a
     *  DIFFERENT name from the hook: this is the app talking to us. */
    __KAI_DEVTOOLS__?: boolean;
    __KAI_DEVTOOLS_HOOK__?: KaiDevtoolsHook;
  }
}

/** Storage access itself can throw -- Safari private mode, a hostile CSP -- so
 *  every read is guarded and a failure means "no signal here", never a crash on
 *  a path the app did not ask for. */
function storedSignal(): boolean {
  try {
    return Boolean(window.localStorage.getItem(SIGNAL_KEY));
  } catch {
    return false;
  }
}

/** Three sources, first hit wins, in the spec's order:
 *  1. localStorage -- survives a reload, and a repro usually needs one.
 *  2. a global the app set -- lets it gate on its own auth or feature flag.
 *  3. the query string -- shareable, and works against a deployed staging URL.
 *
 *  Never inferred from NODE_ENV: the whole point is that the bug you cannot
 *  reproduce locally is in staging. */
function wanted(): boolean {
  if (storedSignal()) return true;
  // `=== true`, not truthy: this is the app's own explicit boolean.
  if (window.__KAI_DEVTOOLS__ === true) return true;
  try {
    return new URLSearchParams(window.location.search).get(SIGNAL_KEY) === '1';
  } catch {
    return false;
  }
}

function createHook(recording: boolean): KaiDevtoolsHook {
  // Allocated ONLY on the wanted branch. On the dormant branch there is no
  // buffer to size and nothing is retained for the whole session.
  let buffer: WireDiagnosticEvent[] | undefined;

  // How many consumers of THIS hook are listening, via `subscribe` or `attach`.
  //
  // It is the retention switch. The buffer exists to cover the window before a
  // panel arrives; once one is listening, the panel owns retention and can cap
  // or window as its own UI decides, so continuing to retain here would hold a
  // second unbounded copy of data the panel has already decided to bound. When
  // the last consumer leaves, retention resumes, so a panel that detaches and
  // re-attaches still gets the events from the gap rather than a hole.
  let consumers = 0;

  if (recording) {
    buffer = [];
    // Subscribing here is what arms emission, from before the panel exists.
    subscribeWireDiagnostics((e) => {
      if (consumers > 0) return; // a panel is listening; it owns retention now
      buffer!.push(e);
    });
  }

  /** Track a consumer so retention can follow the last one out. Idempotent on
   *  the returned unsubscribe: calling it twice must not decrement twice and
   *  leave the count below the number actually listening. */
  const track = (fn: (e: WireDiagnosticEvent) => void): (() => void) => {
    consumers++;
    const off = subscribeWireDiagnostics(fn);
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      consumers--;
      off();
    };
  };

  return {
    version: 1,
    recording,
    drain() {
      if (!buffer) return [];
      const history = buffer;
      buffer = [];
      return history;
    },
    subscribe(fn) {
      return track(fn);
    },
    attach(fn) {
      // ONE synchronous step, and that is the whole point: nothing can run
      // between the parts, so no event can land in a gap or be counted twice.
      const history = buffer;
      if (buffer) buffer = [];

      // Subscribe BEFORE replaying, so an event arriving mid-replay is captured
      // rather than dropped -- and REENTRANCY IS REAL HERE, because `fn` is a
      // panel's own code and a panel that renders on its first event can cause
      // one. Live arrivals queue while the history plays, then drain in arrival
      // order, so `fn` sees one strictly ordered sequence with no duplicates.
      let direct = false;
      const queue: WireDiagnosticEvent[] = [];
      const off = track((e) => {
        if (direct) fn(e);
        else queue.push(e);
      });

      if (history) for (const e of history) fn(e);
      // Index loop, not for-of: an event `fn` provokes while draining is
      // appended here and picked up by this same loop, keeping order intact.
      for (let i = 0; i < queue.length; i++) fn(queue[i]);
      direct = true;

      return off;
    },
    activate() {
      try {
        window.localStorage.setItem(SIGNAL_KEY, '1');
      } catch {
        // Deciding loudly. Reloading now would drop the session the developer
        // is standing in and land on the same dormant state, so it is worse
        // than doing nothing -- but doing nothing SILENTLY is worse still.
        console.warn(
          `[kai-devtools] could not write localStorage['${SIGNAL_KEY}'], so activation cannot survive a reload. ` +
            `Add ?${SIGNAL_KEY}=1 to the URL instead, or set window.__KAI_DEVTOOLS__ = true before the kit loads.`,
        );
        return;
      }
      window.location.reload();
    },
  };
}

/**
 * Install the hook. Idempotent, SSR-safe, and reads the signal ONCE.
 *
 * Returns the hook, or `undefined` where there is no window -- which is the
 * server, where there is no signal to read and nothing to record.
 *
 * Importing this module installs NOTHING. The call site decides, and in this kit
 * that call site is `elements/register-impl.ts`, which is already browser-only.
 * An app that imports the Solid components directly never runs that file and
 * must call this itself; see the module docblock in `./index.ts`.
 */
export function installKaiDevtoolsHook(): KaiDevtoolsHook | undefined {
  if (typeof window === 'undefined') return undefined;
  // Already installed: hand back exactly what is there. Re-reading the signal
  // would let a hook change branch mid-session, and the buffer's whole meaning
  // is that it started when the session did.
  const existing = window.__KAI_DEVTOOLS_HOOK__;
  if (existing) return existing;

  const hook = createHook(wanted());
  window.__KAI_DEVTOOLS_HOOK__ = hook;
  return hook;
}
