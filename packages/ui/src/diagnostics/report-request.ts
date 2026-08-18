// `reportRequest` — the app hands over what it actually sent.
//
// ★ THE ONE THING IN THIS STREAM THE KIT DOES NOT OBSERVE FOR ITSELF.
//
// Everything else here is the kit reporting on its own work: it parsed those
// frames, it encoded that thread, so it can describe them without being told.
// The request that leaves the app is different in kind. In the normal shape the
// app's SERVER ROUTE adds the system prompt, chooses the model, and performs any
// RAG or guardrail injection, and none of that passes through the kit at all --
// which is exactly why `encode.request.systemMessages` is always 0. That 0 is
// the kit saying "the system prompt is being added somewhere I cannot see".
//
// This is the seam for making that somewhere visible, and it is DELIBERATE
// DISCLOSURE rather than collection. The kit does not wrap fetch, does not
// monkey-patch anything, and never reads a request the app did not hand over.
// That is not caution, it is the scope rule: what a request contains, and
// whether an observer may see it, is a decision that lands in the app's own
// policy document. The kit decides HOW a disclosure is shaped -- metadata by
// default, content behind the payload switch, credentials never -- and the app
// decides WHETHER to make one.
//
// It is also why this producer is public while `emitWireDiagnostic` stays
// internal, which otherwise looks inconsistent. A general emitter lets a
// consumer forge any event and make a panel lie about a stream that never
// happened. This one emits a single type whose entire content is "what the app
// says it sent" -- and on that subject the app is the authority, so there is
// nothing here to forge.
//
// SSR-safe: no `window`, no `document`, nothing global at module scope. An app
// that reports from a server route is a normal caller, not an edge case.
import {
  emitWireDiagnostic,
  wireDiagnosticsActive,
  wirePayloadActive,
  withPayload,
  type AppRequestEvent,
} from '../wire/diagnostics';

export interface ReportRequestOptions {
  /**
   * The app's own id for the logical turn, so this request and the read that
   * answered it sit together. Same field and meaning as `ConsumeOptions.traceId`
   * and the encode options.
   *
   * ★ CORRELATION IS ENTIRELY YOURS, AND NOTHING WARNS. Omit it and the event
   * is still emitted, still complete, and completely unattached: a panel shows
   * a request that belongs to no turn, beside a response that belongs to no
   * request, and nothing in the kit reports that as a problem because it is not
   * one -- a request legitimately may be followed by no stream, by several, or
   * by one from a different turn.
   *
   * There is NO timing heuristic pairing a request with "the next stream that
   * opens", and that omission is deliberate: such a heuristic is right often
   * enough to be trusted and wrong exactly when a session is tangled enough for
   * someone to have opened the panel. Pass the same id to `reportRequest` and
   * to the reader, and the halves join up; pass nothing and they do not.
   */
  traceId?: string;
  /** The app's name for this call inside its trace (`'planner'`, `'retry-2'`). */
  label?: string;
  /** Where it was sent. Reported as origin and pathname only; see below. */
  url?: string;
}

/** Built on first use, never at module scope, so this module keeps importing
 *  cleanly in a runtime without the global. Only reached under payload capture. */
let encoder: TextEncoder | undefined;

/**
 * Read one property without trusting the object.
 *
 * EVERY read of the body goes through here. A body can be a `Proxy` whose `get`
 * throws, a `FormData`, a `ReadableStream`, a getter with side effects, or a
 * string -- and a diagnostic that throws while describing a request would take
 * down the request. There is no "we only support plain objects" version of this
 * function, because the caller passes whatever their fetch takes.
 */
function read(source: unknown, key: string): unknown {
  if (source === null || (typeof source !== 'object' && typeof source !== 'function')) {
    return undefined;
  }
  try {
    return (source as Record<string, unknown>)[key];
  } catch {
    return undefined; // a hostile or exotic object; nothing is claimed about it
  }
}

/** A string property, or nothing. Never coerced: a `model` that is not a string
 *  is not a model, and `String(x)` would invent one. */
function stringOf(source: unknown, key: string): string | undefined {
  const value = read(source, key);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** An array property, or nothing. `Array.isArray` rather than a length check, so
 *  a string never reads as a list of characters. */
function arrayOf(source: unknown, key: string): unknown[] | undefined {
  const value = read(source, key);
  return Array.isArray(value) ? value : undefined;
}

/**
 * Role counts over the messages array, INCLUDING system.
 *
 * Walks the array but never its contents: a role is a short label and the
 * message text is payload. Entries that state no readable role are counted in
 * `messages` and contribute to no role -- they are not guessed at, and not
 * bucketed under `'unknown'`, which would be the kit inventing a role nobody
 * sent.
 */
function rolesOf(messages: unknown[]): { byRole: Record<string, number>; system: number } {
  const byRole: Record<string, number> = {};
  let system = 0;
  for (const message of messages) {
    const role = stringOf(message, 'role');
    if (role === undefined) continue;
    byRole[role] = (byRole[role] ?? 0) + 1;
    if (role === 'system') system++;
  }
  return { byRole, system };
}

/**
 * Origin and pathname of the supplied URL.
 *
 * THE QUERY STRING IS NEVER REPORTED, under any switch, exactly as on
 * `wire.open`: `?api_key=sk-...` is a credential rather than conversation
 * content, so the payload switch is not the thing that governs it. `hasQuery`
 * carries the one bit a reader needs.
 *
 * A relative URL -- the normal shape for an app's own fetch -- has no origin to
 * report and is omitted rather than resolved against a guessed base. On a
 * server there is no page to resolve it against at all.
 */
function locationOf(url: string): { url?: string; hasQuery?: boolean } {
  try {
    const parsed = new URL(url);
    return { url: `${parsed.origin}${parsed.pathname}`, hasQuery: parsed.search !== '' };
  } catch {
    return {};
  }
}

/** Does this object DECLARE a JSON form? A plain object, an array, or anything
 *  carrying its own `toJSON` -- which is the object stating what it serializes
 *  to, and therefore an answer rather than a guess.
 *
 *  Deliberately NOT a duck-type on `.size` or `.length`: `{ size: 999999 }` is
 *  ordinary data whose honest byte count is its JSON length, and reading that
 *  field as a byte count is how a size field starts lying. */
function declaresJsonForm(body: object): boolean {
  try {
    if (Array.isArray(body)) return true;
    if (typeof (body as { toJSON?: unknown }).toJSON === 'function') return true;
    const proto = Object.getPrototypeOf(body);
    return proto === Object.prototype || proto === null;
  } catch {
    return false; // a Proxy with hostile traps declares nothing
  }
}

/**
 * UTF-8 byte length of the body AS IT WILL BE SENT, or nothing.
 *
 * ONLY CALLED UNDER PAYLOAD CAPTURE, by the same ruling the encoder's byte
 * counts follow: measuring means materializing the whole body, and unlike a
 * one-off cost this recurs on every turn for as long as a subscriber is
 * attached. With payload on the body is being handed over anyway.
 *
 * ★ IT IS REPORTED ONLY WHEN IT CAN BE KNOWN EXACTLY. The trap this exists to
 * avoid: `JSON.stringify` turns a `Blob`, a `FormData` and a `ReadableStream`
 * all into `"{}"`, so a FormData carrying a 40 MB upload reported `bytes: 2`.
 * That is literally "the byte length of the body as JSON" and it is read by
 * every panel as "how big was this request" -- the confident-number class this
 * stream refuses everywhere else, and worse than the em dash it replaces. A
 * typed array was further out still: `Uint8Array(64)` stringifies to
 * `{"0":0,"1":0,...}` and reported 439.
 *
 * Four cases can be answered exactly, and they are answered:
 *
 *   · a STRING -- it IS the body, so its encoded length is the number;
 *   · anything DECLARING a JSON form (plain object, array, `toJSON`) -- that
 *     declaration is what will be stringified onto the wire;
 *   · a BLOB or FILE -- `size` is the byte length, known in O(1). Reporting it
 *     is measurement, not estimation, and refusing would discard a true fact;
 *   · an ARRAYBUFFER or a view over one -- `byteLength`, same reasoning.
 *
 * Everything else is OMITTED, which reads as "not reported" under the absence
 * rule: `FormData` (whose real size needs the multipart boundary walked),
 * `ReadableStream` (whose size is not knowable without consuming it, which
 * would destroy the request), `URLSearchParams`, a `Map`, a class instance
 * declaring nothing. A false negative here is safe; a confident wrong number is
 * not.
 *
 * `JSON.stringify` is also not total -- a circular body, a BigInt, a throwing
 * getter -- and a diagnostic must never be the thing that breaks a request, so
 * that case omits the key too.
 *
 * Cross-realm caveat, stated rather than hidden: a `Blob` from another realm (an
 * iframe) fails `instanceof` and is omitted. That is the safe direction, and
 * duck-typing `.size` to fix it would re-open the `{ size: 999999 }` hole.
 */
function bodyBytes(body: unknown): number | undefined {
  try {
    if (typeof body === 'string') {
      encoder ??= new TextEncoder();
      return encoder.encode(body).length;
    }
    if (typeof body !== 'object' || body === null) return undefined;

    // Ordered: the JSON check runs FIRST so a plain object carrying a `size`
    // field is measured as JSON rather than mistaken for a Blob.
    if (declaresJsonForm(body)) {
      const json = JSON.stringify(body);
      if (typeof json !== 'string') return undefined;
      encoder ??= new TextEncoder();
      return encoder.encode(json).length;
    }

    // `instanceof`, guarded on the global existing at all, because these are not
    // globals in every runtime the kit imports into.
    if (typeof Blob !== 'undefined' && body instanceof Blob) return body.size;
    if (typeof ArrayBuffer !== 'undefined') {
      if (body instanceof ArrayBuffer) return body.byteLength;
      if (ArrayBuffer.isView(body)) return body.byteLength;
    }

    return undefined; // no exactly-knowable size; say nothing rather than "2"
  } catch {
    return undefined;
  }
}

/**
 * Disclose the request body the app is about to send.
 *
 * Call it beside your own `fetch`, with the same object you pass as the body:
 *
 * ```ts
 * const body = { model, messages, tools };
 * reportRequest(body, { traceId: 'turn-42', url: '/api/chat' });
 * const res = await fetch('/api/chat', {
 *   method: 'POST',
 *   body: JSON.stringify(body),
 * });
 * await readOpenAIStream(res, sink, { traceId: 'turn-42' });
 * ```
 *
 * WHAT TRAVELS BY DEFAULT: counts, role names, the tools array's length, the
 * requested model, and the origin+path it went to. WHAT DOES NOT: the messages,
 * the system prompt's text, the tool definitions, the query string. The body
 * itself rides only under the payload switch, exactly like every other
 * content-bearing value in this stream.
 *
 * FREE WHEN NOBODY IS LISTENING. With no subscriber this returns before reading
 * a single property of `body`, so passing a `Proxy` with expensive getters, or a
 * body you would rather not touch, costs one symbol read.
 *
 * IT NEVER THROWS. Whatever `body` is -- a string, `FormData`, a
 * `ReadableStream`, a circular object, a `Proxy` that throws on every access --
 * this reports what it can and stays quiet about the rest. A diagnostic that
 * took down a request would be worse than no diagnostic.
 *
 * NO PAIRING IS INVENTED. Without a `traceId` the event carries no correlation
 * key at all, rather than being attached to whichever stream opens next: a
 * request may be followed by no stream, by several, or by one belonging to a
 * different turn.
 */
export function reportRequest(body: unknown, opts: ReportRequestOptions = {}): void {
  // BEFORE the body is touched, which is what makes the inactive path free and
  // keeps a hostile or expensive body entirely unread when nobody is listening.
  if (!wireDiagnosticsActive()) return;

  const messages = arrayOf(body, 'messages');
  const roles = messages ? rolesOf(messages) : undefined;
  const tools = arrayOf(body, 'tools');
  const model = stringOf(body, 'model');
  const bytes = wirePayloadActive() ? bodyBytes(body) : undefined;

  const event: AppRequestEvent = {
    type: 'app.request',
    t: Date.now(),
    ...(opts.traceId !== undefined ? { traceId: opts.traceId } : {}),
    ...(opts.label !== undefined ? { label: opts.label } : {}),
    ...(opts.url !== undefined ? locationOf(opts.url) : {}),
    ...(messages !== undefined ? { messages: messages.length } : {}),
    ...(roles !== undefined ? { byRole: roles.byRole, systemMessages: roles.system } : {}),
    ...(tools !== undefined ? { tools: tools.length } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(bytes !== undefined ? { bytes } : {}),
    ...withPayload(() => ({ body })),
  };

  emitWireDiagnostic(event);
}
