// The wire diagnostic event stream: what the parse pipeline SAW, as metadata.
//
// The kit is the only layer that sees both "frames arrived" and "parts came
// out", so it is the only layer that can tell a wrong-dialect read from a quiet
// one. That fact was previously visible nowhere; this is where it gets said.
//
// METADATA BY DEFAULT, and the rule is checkable rather than a matter of taste:
// if a value comes from the model, the end user, or the app's data, it is
// PAYLOAD; if it describes the shape, size, timing or identity of that value, it
// is METADATA. Every field below is metadata by that rule. `errorCode` yes,
// `message` no -- some providers echo request content back inside the message,
// which is why the code is the half that travels.
//
// PAYLOAD IS A SEPARATE, DELIBERATE SWITCH (`wirePayloadActive`), off by
// default, with its own signal that no URL can set. Every content-bearing value
// lives under ONE optional `payload` key, which is what makes the boundary
// reviewable: a reviewer checks one key rather than re-reading every field
// name, and `payload-boundary.test.ts` asserts it structurally by deleting that
// key and finding nothing left. The one thing that never appears under it
// either is a response URL's query string -- `?api_key=` is a CREDENTIAL, a
// different class from conversation content, and it does not get a switch.
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
  /**
   * The APP'S grouping of several reads into one logical turn. Present only
   * when the app declared it (`ConsumeOptions.traceId`), absent otherwise.
   *
   * THE KIT GROUPS NOTHING ON ITS OWN. A tool loop or a set of sub-agents makes
   * several model calls that belong together, and the kit sees one Response at
   * a time with no way to know which ones those are. Inferring it -- by
   * timing, by sink identity, by anything -- would produce a grouping that is
   * right often enough to be trusted and wrong exactly when a session is
   * confusing enough to need a panel.
   */
  traceId?: string;
  /** The app's name for THIS read within the trace (`'planner'`,
   *  `'executor'`). Present only when declared; never derived from the format,
   *  the model or the URL. */
  label?: string;
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
  /** Content-bearing, so opt-in: the raw `data:` payload, verbatim. */
  payload?: { raw: string };
}

/** A message part the recorder actually produced. */
export interface WirePartEvent extends WireDiagnosticBase {
  type: 'wire.part';
  /** The `MessagePart` type: 'text' | 'reasoning' | 'tool' | 'source'. */
  variant: string;
  index: number;
  /** Delta LENGTH, never the delta. Present for text and reasoning only. */
  chars?: number;
  /** Content-bearing, so opt-in. One key per variant this write can carry:
   *  `delta` for text and reasoning, `patch` for a tool write (which holds the
   *  arguments and the output), `source` for a citation. */
  payload?: { delta?: string; patch?: unknown; source?: unknown };
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
  /** Content-bearing, so opt-in: the assembled turn, plus the in-band error's
   *  own message.
   *
   *  ALL THREE TERMINAL EVENTS TREAT PROVIDER MESSAGE TEXT IDENTICALLY --
   *  `wire.close`, `wire.failed` and `wire.interrupted`. Each faces the same
   *  hazard, that a provider's message can echo request content back, and
   *  payload is precisely the switch that accepts it. Disagreeing here would
   *  read as an oversight and be "fixed" later by someone with less context. */
  payload?: {
    text: string;
    reasoning: string;
    toolCalls: unknown[];
    sources: unknown[];
    /** The in-band error's message. Absent when the turn carried no error. */
    message?: string;
  };
}

/**
 * The read DIED. A terminal event for a stream that never reached `wire.close`.
 *
 * WHY IT EXISTS: without it, a stream that errored mid-read emitted `wire.open`
 * and then nothing at all -- no close, no failed -- and a panel showed that
 * stream open forever. In an observability tool that is a request which
 * silently vanished, and "the one that never finished" is precisely the request
 * someone opens the panel to find.
 *
 * MUTUALLY EXCLUSIVE with `wire.close`: exactly one of the two ends a read that
 * got as far as `wire.open`. It is emitted from `readModelStream` only, so a
 * direct `consumeModelStream` caller (which never emitted `wire.open` either)
 * does not get one.
 *
 * The error itself is UNCHANGED and still thrown: this observes and rethrows.
 */
export interface WireInterruptedEvent extends WireDiagnosticBase {
  type: 'wire.interrupted';
  /** Frames decoded before it died. */
  frames: number;
  /** Neutral chunks yielded before it died. */
  chunks: number;
  /**
   * `'abort'` only when the error IDENTIFIES ITSELF as one (`name` of
   * `AbortError`), which is what a fetch abort produces. Anything else is
   * `'error'` -- a guess here would turn "the provider dropped the connection"
   * into "your user navigated away", and those have opposite fixes.
   */
  reason: 'error' | 'abort';
  /** The caught error's `name` (`'AbortError'`, `'TypeError'`). Metadata: a
   *  closed-ish vocabulary a panel keys an explanation off. The MESSAGE is
   *  payload. Absent when the thrown value carries no readable name. */
  errorName?: string;
  /** Content-bearing, so opt-in. The error's own message, which can echo
   *  request content back the way a provider's error text does. */
  payload?: { message?: string };
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
  /** Content-bearing, so opt-in: the raw body and the provider's own error
   *  message, which is exactly the field that echoes request content back and
   *  is why the code is the half that travels by default. */
  payload?: { bodyText: string; message?: string };
}

/** One attachment the encoder handled, and what became of it.
 *
 *  MEDIA TYPE AND SIZE, never the name and never the bytes. A filename is
 *  something the user typed and is payload; the media type and the size are
 *  facts about the shape of what went on the wire. */
export interface EncodeAttachmentReport {
  /** As the encoder settled it, which is not always what the host declared: a
   *  `data:` URI's own media type wins over the field beside it. Absent when
   *  nothing named the file and classification failed before settling one. */
  mediaType?: string;
  /**
   * Byte length of the bytes that went on the wire.
   *
   * PRESENT ONLY WHEN PAYLOAD CAPTURE IS ON. Counting it exactly is an O(n)
   * scan of the payload, and the whole thread is re-encoded every turn, so it
   * is a recurring per-turn cost rather than a one-off -- the same rule
   * `EncodeRequestEvent.bytes` follows, for the same reason. The fields around
   * it cost nothing and are always present, so the diagnosis ("this attachment
   * was skipped") survives without the refinement ("...and it was 240 kB").
   *
   * ABSENT for a remote attachment even then: the provider dereferences that
   * URL itself and the bytes never enter this process, so any number would be
   * invented -- and `0` beside a 40 MB PDF is the exact confident zero the
   * forward-compat rule exists to prevent.
   *
   * Absent always means NOT REPORTED, and is never backfilled with an estimate.
   */
  bytes?: number;
  /** Whether anything at all reached the wire for this attachment. */
  encoded: boolean;
  /**
   * `'encoded'` -- became an image/file/document block.
   * `'as-text'`  -- a text file, inlined as text CONTENT, because neither API
   *                 has an arbitrary-file block. Worth distinguishing: it is
   *                 why an attachment can be "sent" and still not be visible to
   *                 the model as a file.
   * `'skipped'`  -- nothing went out for it. See `reason`.
   */
  disposition: 'encoded' | 'skipped' | 'as-text';
  /** Why it was skipped, in the encoder's own words -- the same sentence the
   *  throw would have carried. Present on `'skipped'` only. */
  reason?: string;
}

/**
 * A thread was encoded for a provider. THE WRITE-PATH HEADLINE.
 *
 * CONTEXT INTEGRITY is the question this answers: is the context that goes to
 * the model the context you think it is? The encoder is the one layer that sees
 * both sides -- the `ChatMessage[]` going in and the provider messages coming
 * out -- so it is the only place the delta between them can be stated as data
 * instead of as folklore.
 *
 * Every field is metadata: counts, variant names, media types, sizes. The
 * encoded body itself lives under `payload`.
 */
export interface EncodeRequestEvent extends WireDiagnosticBase {
  type: 'encode.request';
  format: 'openai' | 'anthropic';
  /** `ChatMessage[]` in. */
  threadMessages: number;
  /** Provider messages out. NOT the same number, by design: one assistant turn
   *  carrying a tool call splits into three wire messages, and a truncating
   *  host shrinks it the other way. The delta is the point. */
  wireMessages: number;
  /**
   * System-role messages in the ENCODED OUTPUT.
   *
   * ZERO IS THE COMMON ANSWER AND IT IS THE FINDING, which is why it is a
   * stated 0 rather than an omitted key: `ChatMessage.role` has no system
   * member at all, so the system prompt is always being added somewhere the kit
   * cannot see -- a server route, a gateway, a middleware. A developer chasing
   * "why is the model ignoring its instructions" needs to know the kit is not
   * the layer holding them.
   */
  systemMessages: number;
  /** Role counts over the ENCODED OUTPUT. A role with no messages is absent
   *  rather than 0; `systemMessages` is stated separately for that reason. */
  byRole: Record<string, number>;
  /** Part variants present in the THREAD, by count. */
  partsIn: Record<string, number>;
  /** Part variants that reached the wire, by count. `partsIn` minus this is the
   *  round-trip loss, and each loss also has its own `encode.dropped`. */
  partsEncoded: Record<string, number>;
  /** One entry per `file` part the encoder handled, in encounter order. */
  attachments: EncodeAttachmentReport[];
  /**
   * UTF-8 byte length of the encoded body as JSON.
   *
   * PRESENT ONLY WHEN PAYLOAD CAPTURE IS ON, because producing it means
   * serializing the whole body -- every inlined attachment included -- and
   * that is a cost the metadata stream refuses to pay for one number. When the
   * body is already being materialized for `payload`, it is free and exact.
   * Absent also when the body could not be stringified at all (a circular
   * `tool.output`, a BigInt). Absent means NOT REPORTED, never zero, and it is
   * deliberately not backfilled with an estimate.
   */
  bytes?: number;
  /** Content-bearing, so opt-in. `attachments` is positionally aligned with the
   *  metadata array above. */
  payload?: { body: unknown; attachments?: Array<{ filename?: string }> };
}

/**
 * A part that was in the thread and is NOT on the wire.
 *
 * THE EVENT THE WHOLE WRITE PATH IS FOR. "Your attachment rendered in the
 * thread and was never sent to the model" was a sentence nobody could get out
 * of the kit, and every one of these drops is deliberate, documented, and was
 * invisible.
 *
 * It reports; it never decides. Nothing about what the encoders drop changed in
 * order to add it.
 */
export interface EncodeDroppedEvent extends WireDiagnosticBase {
  type: 'encode.dropped';
  /** The `MessagePart` type, taken from the part itself at the site that
   *  already discriminated it. */
  variant: string;
  /** Parts this event accounts for. Always 1 today -- every site reports per
   *  part, because per-part is what carries the indices -- and the field exists
   *  so a site that ever aggregates can say N without a new event type. */
  count: number;
  /** Position in the `ChatMessage[]` that was passed in. */
  messageIndex?: number;
  /** Position in that message's `parts`. */
  partIndex?: number;
  /** The reason documented at the drop site, in one sentence. */
  reason: string;
  /** Content-bearing, so opt-in: the dropped part itself, verbatim. */
  payload?: { part: unknown };
}

/**
 * What the APP says it sent. Emitted only by `reportRequest`, never by the kit
 * on its own.
 *
 * ★ THE ONLY EVENT THE KIT DOES NOT OBSERVE FOR ITSELF, and that is the point.
 * In the normal shape the app's server route adds the system prompt, picks the
 * model, and performs any RAG or guardrail injection, and NONE of it passes
 * through the kit -- which is why `encode.request.systemMessages` is always 0.
 * That 0 says "the system prompt is being added somewhere I cannot see"; this
 * event is how a developer chooses to make that somewhere visible.
 *
 * Deliberate disclosure, so it is the app's decision and not the kit's
 * collection. See `reportRequest` for why that distinction is load-bearing.
 */
export interface AppRequestEvent extends WireDiagnosticBase {
  type: 'app.request';
  /** Length of the body's `messages` array. Absent when there was no array to
   *  count -- which is a different fact from a request carrying none. */
  messages?: number;
  /**
   * Role counts over that array, INCLUDING `system`.
   *
   * This is the half the kit structurally cannot see: `ChatMessage.role` has no
   * system member at all, so a system prompt exists only in the body the app
   * builds. A role nobody sent is absent rather than 0.
   *
   * ★ THESE COUNTS NEED NOT SUM TO `messages`, and a consumer must not assume
   * they do. An entry stating no readable role is counted in `messages` and
   * contributes to no bucket -- a body of 5 messages where 1 states a role
   * gives `messages: 5` with `byRole: { user: 1 }`. That is deliberate:
   * bucketing the rest under `'unknown'` would invent a role nobody sent. A
   * panel rendering these as a stacked bar should render the difference as
   * unattributed rather than scaling it away.
   */
  byRole?: Record<string, number>;
  /**
   * System-role messages, stated explicitly whenever the array could be counted.
   *
   * ZERO IS A FINDING and must be distinguishable from "not reported": it says
   * nothing is setting a system prompt at this layer either. Reading it off
   * `byRole.system` could not tell those apart, which is the whole reason this
   * field is separate -- and it lines up directly against
   * `EncodeRequestEvent.systemMessages` for the comparison that answers "are
   * additional prompts being added?".
   */
  systemMessages?: number;
  /** Length of the body's `tools` array. A present-but-empty array reports 0,
   *  which is a real and different state from the key being absent: it says the
   *  app meant to send tools and sent none. Absent when there is no array. */
  tools?: number;
  /**
   * The REQUESTED model, read verbatim from the body.
   *
   * ★ NEVER INFERRED, and absent stays absent. Paired with `WireFrameEvent`'s
   * SERVED model this is the devtools spec's "selected Claude, served gpt-4o"
   * finding -- two independent facts a panel COMPARES and never reconciles.
   * Deriving either half from the other would make them agree in exactly the
   * mismatch case the pair exists to catch.
   */
  model?: string;
  /** ORIGIN AND PATHNAME ONLY, on the same terms as `WireOpenEvent.url`: a
   *  query string can carry a credential, and a credential is not conversation
   *  content, so it does not travel under any switch. Absent when no URL was
   *  supplied or it did not parse. */
  url?: string;
  /** Whether that URL carried a query string. Absent exactly when `url` is. */
  hasQuery?: boolean;
  /**
   * UTF-8 byte length of the body AS IT WILL BE SENT.
   *
   * PRESENT ONLY UNDER PAYLOAD CAPTURE, by the same rule
   * `EncodeRequestEvent.bytes` follows: measuring means materializing the body,
   * and a request is made every turn.
   *
   * ABSENT WHENEVER IT CANNOT BE KNOWN EXACTLY, which is a larger set than it
   * looks. A string, a JSON-declaring body, a `Blob`/`File` and an
   * `ArrayBuffer` or view can all be measured exactly and are. A `FormData`, a
   * `ReadableStream`, a `URLSearchParams`, a `Map`, or a circular body cannot,
   * and report nothing -- never the length of the `"{}"` they happen to
   * stringify to, which is how a 40 MB upload came to report `bytes: 2`.
   */
  bytes?: number;
  /**
   * Content-bearing, so opt-in: the body itself, exactly as handed over.
   *
   * ★ PUBLISHED BY REFERENCE, NOT CLONED. A subscriber that mutates
   * `payload.body` mutates the object the app is about to send. Deep-cloning
   * every request would be expensive on exactly the large bodies worth
   * inspecting, and would defeat the point of handing the real thing over -- so
   * the contract is that a consumer TREATS THIS AS READ-ONLY. Clone it yourself
   * if you intend to edit it.
   */
  payload?: { body: unknown };
}

export type WireDiagnosticEvent =
  | WireOpenEvent
  | WireFrameEvent
  | WirePartEvent
  | WireCloseEvent
  | WireFailedEvent
  | WireInterruptedEvent
  | EncodeRequestEvent
  | EncodeDroppedEvent
  | AppRequestEvent;

/** The three correlating fields, built ONCE per read and spread onto every
 *  event it emits. One definition so `read.ts` and `consume.ts` cannot drift
 *  about which events carry a trace. */
export interface WireCorrelation {
  streamId: string;
  traceId?: string;
  label?: string;
}

/**
 * INTERNAL. The correlation for one read.
 *
 * ABSENT, NOT UNDEFINED. `traceId` and `label` are omitted entirely when the app
 * did not declare them, so a consumer's `'traceId' in event` answers "did the
 * app group this" rather than "did the kit have an opinion". A key present with
 * an undefined value is the kit claiming it looked, and it is not in a position
 * to make that claim.
 */
export function wireCorrelation(
  streamId: string,
  opts: { traceId?: string; label?: string },
): WireCorrelation {
  return {
    streamId,
    ...(opts.traceId !== undefined ? { traceId: opts.traceId } : {}),
    ...(opts.label !== undefined ? { label: opts.label } : {}),
  };
}

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
  /** Whether content-bearing values may ride under the `payload` key. A
   *  SEPARATE switch from having a subscriber, and it lives here for the same
   *  reason the subscriber list does: two copies of this module must agree. */
  payload: boolean;
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
  return (holder[STATE_KEY] ??= { subs: [], seq: 0, payload: false });
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
 * INTERNAL. Whether content-bearing values may ride under the `payload` key.
 *
 * A SEPARATE SWITCH FROM `wireDiagnosticsActive`, and the separation is the
 * security property rather than a preference. The panel is a pasted script tag
 * on a live site and `?kai-devtools=1` is guessable; a stranger who guesses it
 * gets the SHAPE of a conversation and not one word of its content. Turning
 * that into content takes a second, deliberate signal that no URL can set.
 *
 * Every emission site checks this INSIDE its `wireDiagnosticsActive()` branch
 * and builds the payload object only then, so a session with a subscriber and
 * no payload switch pays one extra boolean read per event.
 */
export function wirePayloadActive(): boolean {
  const s = peekState();
  return s !== undefined && s.payload;
}

/**
 * INTERNAL. Turn payload capture on or off.
 *
 * Called by the devtools hook at install, from the payload signal it read
 * synchronously. It is not part of the public surface: a consumer who can flip
 * this can make the kit start recording its own users' conversations, and that
 * is a decision the app makes through the signal, deliberately, not something a
 * dependency can reach in and do.
 *
 * Turning it ON allocates the shared state; turning it OFF does not, so the
 * dormant no-signal path still allocates nothing at all.
 */
export function setWirePayloadCapture(on: boolean): void {
  if (!on && peekState() === undefined) return;
  state().payload = on;
}

/**
 * INTERNAL. The `payload` key, or nothing.
 *
 * Every content-bearing value in this module goes through here, which is what
 * makes the boundary reviewable: there is one call to grep for, one key to
 * strip in a test, and no field-by-field audit. The builder is a THUNK so that
 * with the switch off nothing is read, copied or stringified -- the cost of
 * carrying an unused payload is a boolean.
 */
export function withPayload<T>(build: () => T): { payload: T } | Record<string, never> {
  return wirePayloadActive() ? { payload: build() } : {};
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
