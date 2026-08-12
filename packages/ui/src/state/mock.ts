// The mock responder: the zero-config first win, standardized.
//
// WHAT IT IS
// ----------
// `createMockResponder()` returns a function that produces a STREAM SOURCE —
// SSE text frames in the OpenAI chat-completions shape — which the caller hands
// to `readOpenAIStream` from `@kitn.ai/ui/wire` exactly as it would hand over a
// `fetch()` Response. There is no network, no key and no provider.
//
// WHY IT PRODUCES A WIRE INSTEAD OF FOLDING PARTS DIRECTLY
// -------------------------------------------------------
// The obvious cheaper design is to yield text deltas and let the caller fold
// them onto `parts` with `appendTextPart`. That is what the scaffolder and all
// five composed starters used to do, in seven separate copies, and it is worse
// on every axis that matters:
//
//   · It BYPASSES the kit's own parser. The zero-config default is the code path
//     every new developer runs first, and under the folding design it exercised
//     none of `sseDataFrames` / `sseJson` / `openaiChatFormat` /
//     `consumeModelStream`. Producing a wire makes the first-run path a live
//     regression test of the thing every real integration depends on.
//   · It makes the mock scaffold and the real scaffold STRUCTURALLY DIFFERENT,
//     so "swap the mock for a real backend" is a rewrite of the submit handler
//     rather than a one-expression change. With a wire, the only difference
//     between the two emitted scaffolds is `mockResponse(value)` vs
//     `await fetch('/api/chat', …)`; `createAssistantStream`, `readOpenAIStream`,
//     the try/catch/finally and the abort handling are byte-identical.
//   · The hand-rolled folds drifted. One of them replaced `parts` wholesale,
//     which silently deleted any reasoning/tool parts already on the message.
//
// The frames are the OpenAI chat-completions shape because the mock stands in
// for the consumer's `/api/chat` ROUTE, not for a provider: every integration in
// the kit's catalog except this one re-frames its provider to that shape
// server-side (see `readOpenAIStream`), so matching it is what keeps the swap to
// a real backend a one-line change.
//
// WHY YOU CAN TELL IT IS A MOCK — READ THIS BEFORE CHANGING ANY STRING BELOW
// -------------------------------------------------------------------------
// A mock that is indistinguishable from a real response is how a fabricated turn
// gets believed. This repo has already shipped that bug once: a scaffold seeded a
// tool call from fixture data, the panel rendered "search Completed", and the
// fabricated turn was POSTed to the provider AHEAD of the user's own message. A
// human demoing it saw success; only an assertion on the round-2 answer failed.
//
// Choosing a real provider's frame SHAPE (above) means shape alone can no longer
// distinguish the mock, so the tells are deliberate and layered. Each is visible
// at a different altitude, so whichever one a developer happens to be looking at,
// something says "no provider was contacted":
//
//   1. RAW STREAM — the first bytes are an SSE comment banner (`: kai-mock …`).
//      Comment lines are dropped by `sseDataFrames`, so this is free
//      semantically and unmissable to anyone reading the stream or a capture.
//   2. EVERY FRAME — carries `_kai_mock`, a full sentence naming this function.
//      The OpenAI reader ignores fields it does not know, so it costs nothing
//      and it survives JSON parsing: logging any single frame shows it.
//   3. FIELD LEVEL — `model` is `kai-mock`, which is not a model any provider
//      serves. If a mock frame were ever echoed back upstream it would be
//      REJECTED rather than quietly accepted, which is the specific failure the
//      fabricated-tool-call bug needed and did not get.
//   4. TURN LEVEL — usage is all zeros. A real turn that produced text cannot
//      report zero completion tokens, so `turn.usage` disambiguates in the app,
//      not merely in the bytes.
//   5. UI LEVEL — the reply says so in words. The WEAKEST tell and the only one
//      a real model could imitate, which is exactly why it is not the only one.
//
// CONSTRAINTS
// -----------
// Zero dependencies, no DOM, no Solid, no network, and nothing that is not a
// global in both Node and the browser (`setTimeout`, `JSON`). This module is
// part of `@kitn.ai/ui/state`, which is import-safe on a server — see
// `verify:ssr`. It deliberately does NOT import from `@kitn.ai/ui/wire`: it
// yields `AsyncIterable<string>`, which is structurally a `StreamSource`, so the
// dependency runs one way (a caller pairs them) and `state` keeps its charter of
// owning no wire format.

/** The `model` every mock frame reports. Not a model any provider serves — see
 *  tell 3 in the header. */
export const MOCK_MODEL_ID = 'kai-mock';

/** The marker field carried by every mock frame. Tell 2. */
export const MOCK_MARKER_KEY = '_kai_mock';

/** The value of that marker: a whole sentence, because it is read by a human
 *  staring at a logged frame and wondering where the reply came from. */
export const MOCK_MARKER =
  'no provider was contacted — this reply was generated locally by createMockResponder() from @kitn.ai/ui/state';

/** The SSE comment that opens every mock stream. Tell 1. */
export const MOCK_BANNER = `: kai-mock — NO PROVIDER WAS CONTACTED. ${MOCK_MARKER}.`;

/** The default canned replies, cycled per turn so a multi-turn preview stays
 *  coherent instead of repeating one line forever. */
export const DEFAULT_MOCK_REPLIES: readonly string[] = [
  "Hi! I'm a local mock — no backend, no API key, no provider was contacted. I'm streaming through the same parser a real model would, so what you're seeing is the real rendering path with a canned reply.",
  "Still the mock. Swap `createMockResponder()` for a `fetch('/api/chat', …)` and nothing else in this handler changes — that's the whole point of the seam.",
  'Mock again. Every frame I send is tagged `_kai_mock` and my usage reports zero tokens, so nothing here can be mistaken for a real turn.',
];

export interface MockResponderOptions {
  /** Canned replies, cycled one per turn. Defaults to `DEFAULT_MOCK_REPLIES`. */
  replies?: readonly string[];
  /** Delay between chunks, in ms. Defaults to 24 — fast enough to feel alive,
   *  slow enough that the streaming is visible. `0` streams as fast as the
   *  event loop allows, which is what tests want. */
  delayMs?: number;
  /** How many whitespace-delimited tokens ride in each frame. Defaults to 1
   *  (token by token). Larger values coarsen the cadence. */
  chunkSize?: number;
  /** Log a one-time notice on the first turn. Defaults to `true`: the point of
   *  this module is that a mock reply is hard to mistake for a real one, and a
   *  console line is the fastest way for a human to notice. Pass `false` in
   *  tests, or wherever the banner and the frame markers are tell enough. */
  announce?: boolean;
}

/** Produces one turn's worth of SSE frames. Structurally a `StreamSource`, so it
 *  goes straight into `readOpenAIStream(responder(text), stream)`. */
export type MockResponder = (prompt?: string) => AsyncIterable<string>;

/** Split into whitespace-preserving tokens, so re-joining the deltas reproduces
 *  the reply exactly (the separators are tokens too). */
function tokenize(reply: string, chunkSize: number): string[] {
  const parts = reply.split(/(\s+)/).filter((t) => t !== '');
  if (chunkSize <= 1) return parts;
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += chunkSize) {
    out.push(parts.slice(i, i + chunkSize).join(''));
  }
  return out;
}

function frame(id: string, body: Record<string, unknown>): string {
  // The marker goes FIRST so it is the first thing visible in a logged or
  // captured frame, before the payload a reader would skim for.
  return `data: ${JSON.stringify({
    [MOCK_MARKER_KEY]: MOCK_MARKER,
    id,
    object: 'chat.completion.chunk',
    model: MOCK_MODEL_ID,
    ...body,
  })}\n\n`;
}

const delay = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

/**
 * Build a mock responder.
 *
 * ```ts
 * import { createAssistantStream, createMockResponder } from '@kitn.ai/ui/state';
 * import { readOpenAIStream } from '@kitn.ai/ui/wire';
 *
 * const mockResponse = createMockResponder();
 * const stream = createAssistantStream(setMessages);
 * await readOpenAIStream(mockResponse(value), stream);   // <- swap for fetch()
 * stream.done();
 * ```
 */
export function createMockResponder(options: MockResponderOptions = {}): MockResponder {
  const {
    replies = DEFAULT_MOCK_REPLIES,
    delayMs = 24,
    chunkSize = 1,
    announce = true,
  } = options;

  const pool = replies.length > 0 ? replies : DEFAULT_MOCK_REPLIES;
  let turn = 0;
  let announced = false;

  return function respond(_prompt?: string): AsyncIterable<string> {
    const reply = pool[turn % pool.length];
    const id = `kai-mock-${turn + 1}`;
    turn += 1;

    return {
      async *[Symbol.asyncIterator]() {
        if (announce && !announced) {
          announced = true;
          // Not console.warn: nothing is wrong. This is the mock announcing
          // itself so a developer never has to wonder whether the reply they
          // are looking at came from a model.
          console.info(`[kai] ${MOCK_BANNER.slice(2)}`);
        }

        // Tell 1. Dropped by the parser (`sseDataFrames` skips ':' lines), so it
        // costs nothing semantically — and it exercises that comment-skipping
        // path, which real providers use for keep-alives.
        yield `${MOCK_BANNER}\n\n`;

        // The role frame a real OpenAI stream opens with: no content, so it also
        // exercises the reader's empty-delta path.
        yield frame(id, { choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });

        for (const token of tokenize(reply, chunkSize)) {
          await delay(delayMs);
          yield frame(id, { choices: [{ index: 0, delta: { content: token }, finish_reason: null }] });
        }

        // Tell 4: zero usage. A real turn that produced this much text cannot
        // report zero completion tokens.
        yield frame(id, {
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
        yield 'data: [DONE]\n\n';
      },
    };
  };
}
