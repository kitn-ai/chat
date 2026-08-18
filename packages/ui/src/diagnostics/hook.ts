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
  setWirePayloadCapture,
  subscribeWireDiagnostics,
  // The FULL union — `wire.*` and `element.*` alike. There is one emitter and
  // one stream, so the buffer, the queue and every callback below are typed to
  // carry whatever any layer emits. Nothing in this file inspects an event, so
  // widening it is genuinely a type change and not a behaviour one; the hook
  // buffers and forwards, and a panel discriminates on `type`.
  type KaiDiagnosticEvent,
} from '../wire/diagnostics';

/** The localStorage key and query parameter. Same spelling in both, so the two
 *  ways in read the same in a bug report. */
const SIGNAL_KEY = 'kai-devtools';

/**
 * The PAYLOAD signal. Its own key, and deliberately NOT a query parameter.
 *
 * The panel is a pasted script tag on a live site and `?kai-devtools=1` is
 * guessable, so activation has to be cheap to reach. Content is not: a stranger
 * who guesses the URL gets the SHAPE of a conversation -- counts, sizes,
 * timings, variant names -- and not one word of it. Making that content takes
 * localStorage or a global the app itself set, both of which need someone
 * already standing at that browser or already inside the app's code.
 *
 * A query form would hand the whole difference away for the convenience of the
 * one person who could set localStorage from the console anyway.
 */
const PAYLOAD_KEY = 'kai-devtools-payload';

export interface KaiDevtoolsHook {
  /** The seam. A panel newer than the kit it attached to has to be able to say
   *  so, which is the whole reason this is on the hook rather than inferred. */
  version: 1;
  /** True iff the signal was set AT INSTALL. Not reactive: the capture model
   *  turns on one branch or the other exactly once, and a panel reading `false`
   *  here is reading "this session has no history", which stays true. */
  recording: boolean;
  /** True iff the PAYLOAD signal was set at install -- a separate switch from
   *  `recording`, read at the same moment and just as un-reactive.
   *
   *  `recording` without this is the default and the safe one: the shape of a
   *  conversation, and none of its content. A panel renders the difference so a
   *  developer knows which one they are looking at. */
  payload: boolean;
  /** The buffered history, and CLEARS it. `[]` on the dormant branch, always.
   *
   *  Kept for contract compatibility, but `attach` is what a panel should use:
   *  pairing this with `subscribe` cannot be done without a race (see there). */
  drain(): KaiDiagnosticEvent[];
  /** Live events from now on. Works on both branches -- subscribing is what
   *  re-arms emission, so a panel can attach mid-session and see events from
   *  that moment forward, with no history.
   *
   *  SUSPENDS BUFFER RETENTION while it is active, exactly as `attach` does:
   *  any listener means the kit stops retaining and the listener owns the data.
   *  Deliberate, and worth knowing before you add a passive logger -- one that
   *  subscribes and never drains stops history accumulating for a panel that
   *  attaches later, which will then see only the gap forward. */
  subscribe(fn: (e: KaiDiagnosticEvent) => void): () => void;
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
  attach(fn: (e: KaiDiagnosticEvent) => void): () => void;
  /** Set the signal and reload, so the next load records from the first event.
   *  Reload is the primary path because it is the only one that yields HISTORY,
   *  and the answer is usually near the beginning of a session. */
  activate(): void;
}

declare global {
  interface Window {
    /** The app's own opt-in, set before the kit loads. A DIFFERENT name from
     *  the hook: this is the app talking to us.
     *
     *  `true` activates with metadata only. `'payload'` and `{ payload: true }`
     *  activate AND capture content -- an app that reaches for the object form
     *  is explicitly asking for both, and having it activate nothing would be a
     *  footgun with no upside. `{ payload: false }` activates only. */
    __KAI_DEVTOOLS__?: boolean | 'payload' | { payload?: boolean };
    __KAI_DEVTOOLS_HOOK__?: KaiDevtoolsHook;
  }
}

/** Storage access itself can throw -- Safari private mode, a hostile CSP -- so
 *  every read is guarded and a failure means "no signal here", never a crash on
 *  a path the app did not ask for. */
function storedSignal(key: string): boolean {
  try {
    return Boolean(window.localStorage.getItem(key));
  } catch {
    return false;
  }
}

/** The app's global, read for what it says about payload. `'payload'` and
 *  `{ payload: true }` mean yes; a bare `true` means no, which is the whole
 *  point of the separation. */
function globalPayloadSignal(): boolean {
  const flag = window.__KAI_DEVTOOLS__;
  if (flag === 'payload') return true;
  return typeof flag === 'object' && flag !== null && flag.payload === true;
}

/**
 * Whether to capture payload, read once, synchronously, beside the activation
 * signal.
 *
 * NO QUERY-STRING FORM, deliberately -- see `PAYLOAD_KEY`. Two sources only:
 * localStorage, which needs someone at that browser, and the app's own global,
 * which needs someone inside the app's code.
 */
function payloadWanted(): boolean {
  return storedSignal(PAYLOAD_KEY) || globalPayloadSignal();
}

/** Three sources, first hit wins, in the spec's order:
 *  1. localStorage -- survives a reload, and a repro usually needs one.
 *  2. a global the app set -- lets it gate on its own auth or feature flag.
 *  3. the query string -- shareable, and works against a deployed staging URL.
 *
 *  Never inferred from NODE_ENV: the whole point is that the bug you cannot
 *  reproduce locally is in staging. */
function wanted(): boolean {
  if (storedSignal(SIGNAL_KEY)) return true;
  // `=== true`, not truthy: this is the app's own explicit boolean. The two
  // payload forms activate as well, because an app that reaches for
  // `'payload'` is asking for the panel AND its content, and having the string
  // silently activate nothing would be a footgun with no upside.
  if (window.__KAI_DEVTOOLS__ === true) return true;
  if (window.__KAI_DEVTOOLS__ === 'payload') return true;
  if (typeof window.__KAI_DEVTOOLS__ === 'object' && window.__KAI_DEVTOOLS__ !== null) return true;
  try {
    return new URLSearchParams(window.location.search).get(SIGNAL_KEY) === '1';
  } catch {
    return false;
  }
}

function createHook(recording: boolean, payload: boolean): KaiDevtoolsHook {
  // Allocated ONLY on the wanted branch. On the dormant branch there is no
  // buffer to size and nothing is retained for the whole session.
  let buffer: KaiDiagnosticEvent[] | undefined;

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
  const track = (fn: (e: KaiDiagnosticEvent) => void): (() => void) => {
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
    payload,
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
      const queue: KaiDiagnosticEvent[] = [];
      const off = track((e) => {
        if (direct) fn(e);
        else queue.push(e);
      });

      // The SAME isolation policy `emitWireDiagnostic` applies to every other
      // delivery, for the same reason: a broken observer is the observer's
      // problem, never the stream's.
      //
      // Without it a panel that threw while rendering its first buffered event
      // wedged the hook outright -- the throw escaped `attach`, so the caller
      // never received `off`, the subscription stayed installed in queue-only
      // mode silently swallowing every later event, and `consumers` stayed
      // elevated so retention never resumed for anyone. One panel's render bug
      // took out the next panel's history too.
      //
      // So the handover ALWAYS completes and ALWAYS returns a working `off`. A
      // callback that throws on one event still receives the ones after it.
      const deliver = (e: KaiDiagnosticEvent) => {
        try {
          fn(e);
        } catch {
          // swallowed here exactly as the emitter swallows it: there is nowhere
          // to report it to that is not itself a subscriber
        }
      };

      if (history) for (const e of history) deliver(e);
      // Index loop, not for-of: an event `fn` provokes while draining is
      // appended here and picked up by this same loop, keeping order intact.
      for (let i = 0; i < queue.length; i++) deliver(queue[i]);
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

  // BOTH signals read here, once, synchronously, and they are independent:
  // activation never implies payload, which is the property that makes a
  // guessable `?kai-devtools=1` safe to leave reachable on a live site.
  const recording = wanted();
  const payload = payloadWanted();

  // Only ever turned ON here. The dormant, no-signal path must keep allocating
  // nothing at all, and `setWirePayloadCapture(false)` on a fresh realm would
  // create the shared state just to write a default into it.
  if (payload) setWirePayloadCapture(true);

  if (payload && !recording) {
    // Deciding loudly. The payload signal is a modifier, not an activator, so on
    // its own it does exactly nothing -- and a developer who set it and sees no
    // content would reasonably conclude the switch is broken.
    console.warn(
      `[kai-devtools] localStorage['${PAYLOAD_KEY}'] is set, but nothing activated the recorder, ` +
        `so no events are being captured at all. Set localStorage['${SIGNAL_KEY}'] = '1' ` +
        `(or add ?${SIGNAL_KEY}=1) as well.`,
    );
  }

  const hook = createHook(recording, payload);
  window.__KAI_DEVTOOLS_HOOK__ = hook;
  return hook;
}
