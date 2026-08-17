// The wire diagnostic event stream: what the parse pipeline SAW, as metadata.
//
// The kit is the only layer that sees both "frames arrived" and "parts came
// out", so it is the only layer that can tell a wrong-dialect read from a quiet
// one. That fact was previously visible nowhere; this is where it gets said.
//
// METADATA ONLY, and the rule is checkable rather than a matter of taste: if a
// value comes from the model, the end user, or the app's data, it is PAYLOAD; if
// it describes the shape, size, timing or identity of that value, it is
// METADATA. Every field below is metadata by that rule. `errorCode` yes,
// `message` no -- some providers echo request content back inside the message,
// which is why the code is the half that travels. There is no payload switch in
// this iteration; when one lands it goes under a single optional `payload` key
// so a reviewer checks one key rather than re-reads every field name.
//
// FORWARD COMPATIBILITY, producer side: never repurpose a field name and never
// change what a value means. New information is a new field or a new type.
// Consumers are required to ignore both unknown types and unknown fields, which
// is what lets a CDN-delivered panel float free of the kit's version.
//
// SSR: no `window`, no `Date` and no other global touched at module scope, so
// this imports cleanly anywhere the rest of `wire/` does.
import type { ModelUsage } from './chunk';

/** The envelope every diagnostic event shares. `t` is `Date.now()` at emission. */
export interface WireDiagnosticBase {
  type: string;
  t: number;
  /** Correlates every event from one provider response stream. */
  streamId?: string;
}

/** The stream opened: the source resolved and the format is about to be opened.
 *
 *  CONNECTION IDENTITY (`url`, `hasQuery`, `status`, `contentType`) is reported
 *  only when the source was a `Response`, and each field is ABSENT rather than
 *  empty when the response did not state it. A `Response` built in a test or by
 *  a service worker has `url: ''`, and an empty string there would read as "it
 *  was served from the origin root", which is a confident wrong answer. */
export interface WireOpenEvent extends WireDiagnosticBase {
  type: 'wire.open';
  /** `opts.format.id`, e.g. `openai.chat-completions`. */
  format: string;
  source: 'response' | 'stream' | 'iterable';
  /**
   * ORIGIN AND PATHNAME ONLY. The query string is never reported, on any
   * switch, and it is not payload either: `?api_key=sk-...` is a CREDENTIAL, a
   * different class from the conversation content the payload key exists for,
   * and a credential does not get a switch that turns it on. `hasQuery` carries
   * the one bit a reader needs from it.
   *
   * Absent when the response did not state a URL, or stated one that does not
   * parse.
   */
  url?: string;
  /** Whether the response URL carried a query string at all. Absent exactly
   *  when `url` is. */
  hasQuery?: boolean;
  /** The HTTP status. Always 2xx here -- a non-ok response throws and reports
   *  `wire.failed` instead -- but reported verbatim rather than assumed. */
  status?: number;
  /**
   * The response's `content-type` header, VERBATIM.
   *
   * THE FIELD THAT PAYS FOR THIS EVENT. `text/html` or `application/json` where
   * `text/event-stream` was expected is the classic proxy or misconfiguration
   * tell, and from inside the parse it is invisible: the frames simply never
   * arrive and the turn resolves empty. The response knew all along.
   */
  contentType?: string;
}

/** One decoded SSE frame, and what the format made of it. */
export interface WireFrameEvent extends WireDiagnosticBase {
  type: 'wire.frame';
  /** 1-based. The final `seq` equals `wire.close`'s `frames`. */
  seq: number;
  /** UTF-8 byte length of the raw `data:` payload. */
  bytes: number;
  /** Neutral chunks this frame yielded. */
  chunks: number;
  /**
   * The union of `Object.keys` over this frame's chunks. THE field that earns
   * this design: frames arriving whose chunks never once carry a content key
   * (`text`, `reasoning`, `toolCalls`, `sources`) is the failure a chunk count
   * alone cannot separate from a healthy stream.
   */
  fields: string[];
  /** Present when this frame stated a model id. */
  model?: string;
}

/** A message part the recorder actually produced. */
export interface WirePartEvent extends WireDiagnosticBase {
  type: 'wire.part';
  /** The `MessagePart` type: 'text' | 'reasoning' | 'tool' | 'source'. */
  variant: string;
  index: number;
  /** Delta LENGTH, never the delta. Present for text and reasoning only. */
  chars?: number;
}

/** The turn finished. Everything the widened empty-turn guard judges on. */
export interface WireCloseEvent extends WireDiagnosticBase {
  type: 'wire.close';
  /** Absent when `consumeModelStream` was called directly: there were no frames. */
  frames?: number;
  chunks: number;
  /** Count per variant actually produced. Empty beside a non-zero `frames` is
   *  the wrong-dialect signature. */
  parts: Record<string, number>;
  finishReason: string | null;
  stopReason?: string;
  /** The kit's own closed vocabulary, so a panel keys its explanation off the
   *  code and never needs the message. */
  errorCode?: string | number;
  usage?: ModelUsage;
  ms: number;
}

/** A non-ok HTTP response: the `WireError` path, before a chunk was read. */
export interface WireFailedEvent extends WireDiagnosticBase {
  type: 'wire.failed';
  status: number;
  statusText: string;
  bodyBytes: number;
  bodyIsJson: boolean;
  /** The parsed body's error CODE. Never the message: a provider's error text
   *  can echo request content back. */
  providerCode?: string | number;
}

export type WireDiagnosticEvent =
  | WireOpenEvent
  | WireFrameEvent
  | WirePartEvent
  | WireCloseEvent
  | WireFailedEvent;

type Subscriber = (e: WireDiagnosticEvent) => void;

/**
 * THE MUTABLE STATE LIVES ON A GLOBAL, DELIBERATELY.
 *
 * Module-scope state means one emitter PER COPY of this module, and copies are
 * normal rather than exotic. `./wire` and `./diagnostics` are separate rollup
 * bundles that each inline this file, so a subscriber registered through one saw
 * nothing emitted by the other -- which shipped, and made the devtools hook
 * inert for every consumer. Worse, rollup saw a subscriber array that nothing in
 * the diagnostics bundle ever emitted to, concluded it was write-only, and
 * deleted it outright.
 *
 * A shared chunk would fix OUR build and not the class. The second instance is a
 * consumer who bundles the kit and also loads the elements bundle from a CDN:
 * that duplicates the module identically, and nothing we do to our own build
 * config prevents it. A global keyed by `Symbol.for` is the one thing every copy
 * agrees on, because the symbol registry is per-realm rather than per-module.
 *
 * THE COUNTER HAS TO BE IN HERE TOO. Two copies each starting at `wire-1` mint
 * the same id for different streams, and that id NAMESPACES REASONING PARTS --
 * a collision merges one stream's reasoning blocks into another's and overwrites
 * their verbatim provider payload, which is the exact 400 the namespacing exists
 * to avoid.
 *
 * Still no `window`: `globalThis` exists under Node and every SSR runtime, so
 * this stays as import-safe as it was.
 *
 * PER REALM: a Worker, an iframe or an SSR isolate has its own registry and
 * therefore its own emitter -- a panel in the parent document does not see a
 * stream read inside a Worker.
 */
const STATE_KEY = Symbol.for('kai.wire.diagnostics.v1');

interface DiagnosticsState {
  subs: Subscriber[];
  seq: number;
}

/** `globalThis` viewed as the one property we put on it. */
type StateHolder = { [key: symbol]: DiagnosticsState | undefined };

/** Read WITHOUT allocating, so the emit path and the active check never write to
 *  the global.
 *
 *  The accurate guarantee: IMPORTING this module allocates nothing; the
 *  singleton is created on the first `subscribeWireDiagnostics()` or the first
 *  stream read (`nextStreamId`). A read with no subscriber does create it -- it
 *  has to, because the id counter lives there -- leaving `{ subs: [], seq: 1 }`. */
function peekState(): DiagnosticsState | undefined {
  return (globalThis as unknown as StateHolder)[STATE_KEY];
}

/** Read, creating on first use. Only the two paths that must WRITE call this. */
function state(): DiagnosticsState {
  const holder = globalThis as unknown as StateHolder;
  return (holder[STATE_KEY] ??= { subs: [], seq: 0 });
}

/**
 * Subscribe to wire diagnostics. Returns an unsubscribe function.
 *
 * SSR-safe: `globalThis` is available in every runtime the kit imports into, and
 * nothing here touches `window`.
 */
export function subscribeWireDiagnostics(fn: Subscriber): () => void {
  const subs = state().subs;
  subs.push(fn);
  let live = true;
  return () => {
    if (!live) return; // a double-unsubscribe must not evict someone else
    live = false;
    const at = subs.indexOf(fn);
    if (at !== -1) subs.splice(at, 1);
  };
}

/**
 * INTERNAL. Every emission site gates on this BEFORE constructing an event
 * object, which is what makes the no-subscriber path cost one symbol read and
 * allocate nothing -- not even the shared state.
 */
export function wireDiagnosticsActive(): boolean {
  const s = peekState();
  return s !== undefined && s.subs.length > 0;
}

/**
 * INTERNAL. Deliver to every subscriber.
 *
 * Iterates a SNAPSHOT so a subscriber that unsubscribes (or subscribes) during
 * delivery cannot make the loop skip its neighbour. Each call is wrapped
 * individually: a panel that throws must not take down the stream it is
 * watching, nor starve the other subscribers. The throw is swallowed rather
 * than re-reported because there is nowhere to report it TO that is not itself
 * a subscriber.
 */
export function emitWireDiagnostic(e: WireDiagnosticEvent): void {
  const s = peekState();
  if (!s) return; // nobody has ever subscribed in this realm
  for (const fn of [...s.subs]) {
    try {
      fn(e);
    } catch {
      // a broken observer is the observer's problem, not the stream's
    }
  }
}

/**
 * INTERNAL. One id per provider response stream.
 *
 * It correlates diagnostics AND namespaces reasoning block indices. Anthropic
 * restarts content-block indices at 0 on every message, and a tool loop reads
 * several messages into ONE assistant turn, so without this round 2's block 0
 * merges into round 1's part and overwrites its verbatim `raw`. See
 * `appendReasoningPart`.
 *
 * A monotonic counter, not a UUID: this never leaves the process, is compared
 * only for equality against parts built in the same process, and a counter keeps
 * the value short and reproducible in test output.
 *
 * It lives HERE rather than in `consume.ts` because `readModelStream` opens the
 * format and counts frames before `consumeModelStream` runs, and every event
 * from one read has to carry the same id.
 *
 * The counter sits in the SHARED state, so two copies of this module continue
 * one sequence instead of both restarting at `wire-1` and minting the same id
 * for different streams. See the note on `STATE_KEY`.
 */
export function nextStreamId(): string {
  const s = state();
  return `wire-${++s.seq}`;
}
