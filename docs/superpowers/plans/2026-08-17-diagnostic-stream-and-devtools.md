# Diagnostic Event Stream + kai devtools v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the wire diagnostic event stream (five `wire.*` events + widened empty-turn guard + `model` on the stream), the in-kit recorder hook (`window.__KAI_DEVTOOLS_HOOK__`), and a first-iteration `<kai-devtools>` panel in a new `@kitn.ai/devtools` package.

**Architecture:** A zero-cost-when-idle emitter module inside `packages/ui/src/wire/` feeds subscriber callbacks; `readModelStream` / `consumeModelStream` / `toByteSource` emit metadata-only events into it. A browser-only hook module reads the activation signal once at init and either buffers eagerly (wanted) or installs an empty hook (not wanted). The panel is a separate zero-dependency package that attaches to the hook, drains history, and renders per-stream summaries.

**Tech Stack:** TypeScript, Vitest (jsdom `unit` project in packages/ui; own vitest in packages/devtools), Vite lib build, vanilla-TS custom element for the panel (deliberate: zero-dep single-file CDN artifact; the event contract, not the framework, is the interface).

**Specs (executors MUST read both, plus the claim-check deltas below):**
- `docs/superpowers/specs/2026-08-14-endpoint-choice-design.md` — §"Diagnosability, and where the line is" + §"The diagnostic event stream" (the stream contract).
- `docs/superpowers/specs/2026-08-14-kai-devtools-design.md` — the consumer: capture model, hook shape, activation, data exposure.

**Claim-check deltas vs the specs (verified against `f91eb204`, 2026-08-17):**
1. `reasoning_content` is now READ (`17c7d0b6`), via `REASONING_KEYS`/`siblingReasoning()` in `formats/openai.ts`. The spec's `raw.source: 'openai.reasoning_content'` ruling was NOT implemented — a pure `reasoning_content` delta carries no `raw` at all. Do not "fix" this in this work; it is a recorded finding.
2. The spec's silent case (`chunks: 1, parts: [], error: undefined`) exists ONLY when the stream sends a `finish_reason`/`usage` frame; an unread payload field alone yields 0 chunks and trips `empty-stream` today.
3. `frames` is counted nowhere today; `sseJson` discards the raw payload string (so `bytes` needs threading); `nextStreamId()` is a module counter in `consume.ts` used only for the reasoning-part `streamId`, which is PUBLIC API with namespacing semantics pinned by `state/parts.test.ts:146-172` and `encode.test.ts:934`.
4. `model` is unread by both formats, and populating it makes content-less frames start yielding chunks in BOTH formats — the parts-based guard must land BEFORE the model field (Task order enforces this).
5. Diagnostics are a green field: nothing named `DiagnosticEvent`, `__KAI_DEVTOOLS`, or `wire.*` exists in `packages/` or `apps/`.

## Global Constraints

- The kit PARSES, the consumer FETCHES: no client, no key handling, no provider SDK below `wire/`. Diagnostics change none of that.
- **Metadata only.** Rule (spec 1, verbatim): "if a value comes from the model, the end user, or the app's data, it is payload. If it describes the shape, size, timing or identity of that value, it is metadata." No event field may carry message text, reasoning text, tool input/output, source URLs/titles, request bodies, or provider error MESSAGE text. `errorCode` yes, `message` no. There is NO payload switch in this iteration.
- **Events never change behaviour.** With no subscriber, emission is a guarded no-op and no event object is even constructed. The ONLY sanctioned behaviour change in this plan is the widened empty-turn guard (spec ruling 2) and the `model` field on `ModelStreamChunk` (spec ruling).
- Forward compat (producer side): never repurpose a field name; new information is a new field or a new type.
- `src/wire/` is governed by `pnpm --filter @kitn.ai/ui run lint:silent-drops` (required CI). Do not write any new function in `src/wire/` that switches on `MessagePart.type` — the parts count map is built from sink-method calls, not by discriminating parts. Run the lint and its `--self-test` after every wire task.
- Worktree bootstrap, in this exact order, before any test run means anything: `pnpm install` → `pnpm --filter @kitn.ai/ui run build:css` → `pnpm exec nx build ui`. Use `pnpm exec nx`, never bare `nx`. Never mask an exit code with `|| echo` or a pipe.
- Watch every new test FAIL before making it pass (each task's steps enforce this).
- Do NOT edit `docs/coupling-map.md`, root `CLAUDE.md`, or any `docs/superpowers/HANDOFF-*.md` (another session owns them). New couplings/guards get a row **in the PR body** instead.
- Conventional commits; never hand-edit any `package.json` version.
- Do not touch `packages/create-kai/` (the emitted-console-line ruling of spec 1 is create-kai work, out of scope here) and do not touch anything in `packages/ui/src/agent-tooling/`.

## Phase / PR structure

- **PR 1 (branch `feat/wire-diagnostics`):** Tasks 1–7. The stream, the guard, `model`.
- **PR 2 (branch `feat/devtools-hook`, after PR 1 merges):** Tasks 8–9. Recorder + hook in the kit.
- **PR 3 (branch `feat/kai-devtools-panel`, after PR 2 merges):** Tasks 10–13. The panel package + demo. New-UI show-first applies: screenshots go to Rob with the PR.

---

### Task 0 (onboarding, every Phase-1 worker): read the layer first

- [ ] Read in full: `packages/ui/src/wire/read.ts`, `consume.ts`, `chunk.ts`, `sse.ts`, `formats/openai.ts`, `formats/anthropic.ts`, `index.ts`, and skim `state/parts.ts` for the `streamId` namespacing semantics.
- [ ] Confirm the exact names of the four sink methods `createPartsRecorder` wraps (they are the `AssistantStreamSink` methods; `appendReasoning` and `upsertToolPart` are two of them). Where this plan writes a sink-method name, the REAL name from `chunk.ts`/`state` wins; adapt mechanically, change nothing semantically.
- [ ] Run the existing suite once green before changing anything: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit`.

### Task 1: The emitter + event types (`src/wire/diagnostics.ts`)

**Files:**
- Create: `packages/ui/src/wire/diagnostics.ts`
- Test: `packages/ui/src/wire/diagnostics.test.ts`

**Interfaces (later tasks and the hook depend on these exact names):**

```ts
// The envelope. `t` is Date.now() at emission.
export interface WireDiagnosticBase { type: string; t: number; streamId?: string }

export interface WireOpenEvent extends WireDiagnosticBase {
  type: 'wire.open';
  format: string;                                  // opts.format.id
  source: 'response' | 'stream' | 'iterable';
}
export interface WireFrameEvent extends WireDiagnosticBase {
  type: 'wire.frame';
  seq: number;                                     // 1-based; final seq === wire.close.frames
  bytes: number;                                   // UTF-8 length of the raw data: payload
  chunks: number;                                  // chunks this frame yielded
  fields: string[];                                // union of Object.keys over this frame's chunks
  model?: string;                                  // when this frame stated one (Task 4)
}
export interface WirePartEvent extends WireDiagnosticBase {
  type: 'wire.part';
  variant: string;                                 // MessagePart type: 'text' | 'reasoning' | 'tool' | 'source'
  index: number;
  chars?: number;                                  // delta length; present for text/reasoning only
}
export interface WireCloseEvent extends WireDiagnosticBase {
  type: 'wire.close';
  frames?: number;                                 // absent when consumeModelStream was called directly
  chunks: number;
  parts: Record<string, number>;                   // count per variant actually produced
  finishReason: string | null;
  stopReason?: string;
  errorCode?: string | number;                     // code only — never the message
  usage?: ModelUsage;
  ms: number;
}
export interface WireFailedEvent extends WireDiagnosticBase {
  type: 'wire.failed';
  status: number;
  statusText: string;
  bodyBytes: number;
  bodyIsJson: boolean;
  providerCode?: string | number;                  // parsed body's error code — never the message
}
export type WireDiagnosticEvent =
  | WireOpenEvent | WireFrameEvent | WirePartEvent | WireCloseEvent | WireFailedEvent;

/** Subscribe to wire diagnostics. Returns an unsubscribe function. SSR-safe: no globals. */
export function subscribeWireDiagnostics(fn: (e: WireDiagnosticEvent) => void): () => void;

/** INTERNAL (exported for read.ts/consume.ts, not from wire/index.ts): */
export function wireDiagnosticsActive(): boolean;   // subscribers.length > 0 — emission sites gate on this BEFORE constructing an event object
export function emitWireDiagnostic(e: WireDiagnosticEvent): void;  // delivers to every subscriber; a throwing subscriber must not break the stream (try/catch per subscriber) nor the other subscribers
export function nextStreamId(): string;             // THE stream-id counter moves here from consume.ts, same 'wire-N' format
```

Implementation notes: module-scope `const subscribers: Array<fn>` and `let streamSeq = 0`. No `window`, no `Date` at module scope. `emitWireDiagnostic` iterates a snapshot (`[...subscribers]`) so unsubscribe-during-emit is safe.

- [ ] **Step 1: Write the failing test** (`diagnostics.test.ts`, vitest `unit` project, plain node — no jsdom needed):

```ts
import { describe, expect, it } from 'vitest';
import {
  emitWireDiagnostic, nextStreamId, subscribeWireDiagnostics, wireDiagnosticsActive,
} from './diagnostics';

const ev = (over = {}) => ({ type: 'wire.open', t: 1, format: 'openai.chat-completions', source: 'response', ...over } as any);

describe('wire diagnostics emitter', () => {
  it('is inactive with no subscribers and emit is a safe no-op', () => {
    expect(wireDiagnosticsActive()).toBe(false);
    expect(() => emitWireDiagnostic(ev())).not.toThrow();
  });
  it('delivers to every subscriber and unsubscribe stops delivery', () => {
    const a: unknown[] = []; const b: unknown[] = [];
    const offA = subscribeWireDiagnostics((e) => a.push(e));
    const offB = subscribeWireDiagnostics((e) => b.push(e));
    expect(wireDiagnosticsActive()).toBe(true);
    emitWireDiagnostic(ev());
    offA();
    emitWireDiagnostic(ev({ format: 'anthropic.messages' }));
    offB();
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
    expect(wireDiagnosticsActive()).toBe(false);
  });
  it('a throwing subscriber does not starve the others', () => {
    const got: unknown[] = [];
    const offBad = subscribeWireDiagnostics(() => { throw new Error('boom'); });
    const offGood = subscribeWireDiagnostics((e) => got.push(e));
    expect(() => emitWireDiagnostic(ev())).not.toThrow();
    expect(got).toHaveLength(1);
    offBad(); offGood();
  });
  it('nextStreamId is monotonic and wire-prefixed', () => {
    const a = nextStreamId(); const b = nextStreamId();
    expect(a).toMatch(/^wire-\d+$/);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2:** `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/diagnostics.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `diagnostics.ts` per the interface block above.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit: `feat(wire): diagnostic event emitter and envelope types`

### Task 2: Lift `nextStreamId()` — the structurally risky edit

**Files:**
- Modify: `packages/ui/src/wire/consume.ts` (delete the module-scope `streamSeq`/`nextStreamId` at ~309-310; import from `./diagnostics`; accept an override)
- Modify: `packages/ui/src/wire/read.ts` (generate the id first thing in `readModelStream`, pass it down)
- Test: `packages/ui/src/wire/stream-id.test.ts` (new)

**Interfaces:**
- Consumes: `nextStreamId` from Task 1.
- Produces: `ConsumeOptions.streamId?: string` (public, documented: "correlates diagnostics and namespaces reasoning parts for this consume call; assigned automatically when absent"). `readModelStream` computes `const streamId = opts.streamId ?? nextStreamId();` BEFORE `toByteSource` and passes `{ ...opts, streamId }` to `consumeModelStream`. `consumeModelStream` uses `opts.streamId ?? nextStreamId()`.

**Invariants that MUST survive (all pinned by existing tests — run them):** one id per provider response stream; two `readModelStream`/`readOpenAIStream` calls into one sink get DIFFERENT ids (`encode.test.ts:934`); direct `consumeModelStream` callers still get a fresh unique id per call; reasoning parts still carry `streamId` in the sink opts exactly as before (`state/parts.test.ts:146-172` namespacing).

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { consumeModelStream } from './consume';

// Minimal OpenAI SSE body with one reasoning delta, so a reasoning part
// (which carries streamId in the sink call) is produced.
const SSE = [
  'data: {"choices":[{"index":0,"delta":{"reasoning":"hm"},"finish_reason":null}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '', '',
].join('\n');

function reasoningSink(ids: (string | undefined)[]) {
  // Use the REAL AssistantStreamSink method names from chunk.ts (Task 0).
  return {
    appendText: () => {},
    appendReasoning: (_t: string, opts?: { streamId?: string }) => { ids.push(opts?.streamId); },
    upsertToolPart: () => {},
    addSource: () => {},
  } as any;
}

describe('streamId assignment', () => {
  it('two reads into one sink get different ids', async () => {
    const ids: (string | undefined)[] = [];
    await readOpenAIStream(new Response(SSE), reasoningSink(ids));
    await readOpenAIStream(new Response(SSE), reasoningSink(ids));
    expect(ids[0]).toBeDefined();
    expect(ids[1]).toBeDefined();
    expect(ids[0]).not.toBe(ids[1]);
  });
  it('a caller-supplied streamId is respected', async () => {
    const ids: (string | undefined)[] = [];
    await readOpenAIStream(new Response(SSE), reasoningSink(ids), { streamId: 'mine-1' } as any);
    expect(ids[0]).toBe('mine-1');
  });
  it('direct consumeModelStream still assigns a fresh id per call', async () => {
    async function* one() { yield { reasoning: 'hm' }; }
    const ids: (string | undefined)[] = [];
    await consumeModelStream(one() as any, reasoningSink(ids));
    await consumeModelStream(one() as any, reasoningSink(ids));
    expect(ids[0]).not.toBe(ids[1]);
  });
});
```

- [ ] **Step 2:** Run it → the caller-supplied case FAILS (no such option today). Note which of the other cases already pass — they are the regression net.
- [ ] **Step 3:** Implement the lift exactly as in Interfaces above. `readOpenAIStream`/`readAnthropicStream` need no change (they spread opts through).
- [ ] **Step 4:** Run the new test AND the full unit project (`encode.test.ts` and `state/parts.test.ts` are the tripwires) → PASS.
- [ ] **Step 5:** Commit: `refactor(wire): lift streamId assignment to readModelStream, allow caller override`

### Task 3: Widen the empty-turn guard (BEFORE the model field)

**Files:**
- Modify: `packages/ui/src/wire/consume.ts` (the guard at ~411 and the parts recorder)
- Test: `packages/ui/src/wire/empty-turn.test.ts` (new)

**Interfaces:**
- Produces: `createPartsRecorder` additionally tracks `partCounts: Record<string, number>` (incremented per sink-method call, keyed by variant name — NOT by discriminating a `MessagePart`) and exposes it to `consumeModelStream`. Guard becomes:

```ts
if (!error && partsTotal === 0) {
  error = chunkCount === 0
    ? { code: 'empty-stream', message: /* existing message, unchanged */ }
    : { code: 'empty-turn',
        message: `The stream completed and ${chunkCount} chunk(s) were parsed, but none carried content this reader reads, so no message part was produced. If the endpoint streams a different dialect (or carries its payload in a field this format does not read), switch to the matching reader.` };
}
```

where `partsTotal` is the sum over `partCounts`. `'empty-turn'` joins the closed error-code vocabulary. Keep the existing `empty-stream` message text byte-for-byte.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';

const nullSink = () => ({ appendText: () => {}, appendReasoning: () => {}, upsertToolPart: () => {}, addSource: () => {} } as any);
const sse = (lines: string[]) => new Response([...lines.flatMap((l) => [l, '']), 'data: [DONE]', '', ''].join('\n'));

describe('widened empty-turn guard', () => {
  it('chunks consumed but zero parts → error code empty-turn', async () => {
    const turn = await readOpenAIStream(sse([
      'data: {"choices":[{"index":0,"delta":{"role":"assistant","foo":"payload in an unread field"},"finish_reason":null}]}',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
    ]), nullSink());
    expect(turn.parts).toEqual([]);
    expect(turn.chunks).toBeGreaterThan(0);
    expect(turn.error?.code).toBe('empty-turn');
  });
  it('zero chunks still reports empty-stream, unchanged', async () => {
    const turn = await readOpenAIStream(sse([
      'data: {"type":"message_start","message":{"model":"x","usage":{"input_tokens":1}}}',
    ]), nullSink());
    expect(turn.error?.code).toBe('empty-stream');
  });
  it('a turn that produced parts carries no error', async () => {
    const turn = await readOpenAIStream(sse([
      'data: {"choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
    ]), nullSink());
    expect(turn.error).toBeUndefined();
    expect(turn.text).toBe('hi');
  });
});
```

- [ ] **Step 2:** Run → first case FAILS (error is `undefined` today: that is the measured silent case).
- [ ] **Step 3:** Implement per Interfaces.
- [ ] **Step 4:** New test + full unit project → PASS. If any existing test pinned `error: undefined` on a chunks-but-no-parts turn, read it carefully: if it exists it likely pins the OLD behaviour deliberately — update it and say so in the commit body.
- [ ] **Step 5:** Watch the guard fail: temporarily revert the condition to `chunkCount === 0 && !error`, run the new test, confirm case 1 goes red, restore. (Mutation check — do not skip.)
- [ ] **Step 6:** Commit: `feat(wire): report empty-turn when chunks parse but no part is produced`

### Task 4: `model` on the stream (both formats)

**Files:**
- Modify: `packages/ui/src/wire/chunk.ts` (`ModelStreamChunk` gains `model?: string` with a doc comment: "the model id the RESPONSE stated, verbatim; report, never infer")
- Modify: `packages/ui/src/wire/formats/openai.ts` (`pushOpenAI`: `if (typeof obj.model === 'string' && obj.model) out.model = obj.model;` — per frame, no dedupe, per the spec's "reported on the frame that stated it")
- Modify: `packages/ui/src/wire/formats/anthropic.ts` (`message_start` handler: read `message.model` beside the `message.usage` it already destructures)
- Test: `packages/ui/src/wire/model-field.test.ts` (new)

`ModelTurn` does NOT gain a model field (not ruled in by the spec; the event stream is the carrier).

- [ ] **Step 1: Write the failing test** — drive both real fixtures (`src/wire/fixtures/openai/text-only.sse`, `src/wire/fixtures/anthropic/text-only.sse` — read them the way the existing fixture tests do; copy that harness) and assert: (a) at least one chunk from the OpenAI fixture carries `model: 'openai/gpt-4o-mini'`; (b) the Anthropic `message_start` yields a chunk carrying `model: 'anthropic/claude-haiku-4.5'`; (c) cross-dialect (the Anthropic fixture through `readOpenAIStream`) still ends `error.code: 'empty-stream'` — the model field must not leak across dialects; (d) an OpenAI stream whose only readable content is `model` + `finish_reason` now yields chunks > 0 AND `error.code: 'empty-turn'` — this pins the guard-ordering dependency from the spec.
- [ ] **Step 2:** Run → (a), (b), (d) FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** New test + full unit project + `pnpm --filter @kitn.ai/ui run lint:silent-drops` → all PASS, exit 0.
- [ ] **Step 5:** Commit: `feat(wire): surface the model id the response stated on ModelStreamChunk`

### Task 5: Emit `wire.open` / `wire.frame` / `wire.part` / `wire.close`

**Files:**
- Modify: `packages/ui/src/wire/read.ts` (open + frame events; frame counter; thread the raw payload out of sse)
- Modify: `packages/ui/src/wire/sse.ts` (`sseJson` gains an optional `onRawFrame?: (raw: string) => void` called with each `data:` payload string it parses; default undefined, zero behaviour change)
- Modify: `packages/ui/src/wire/consume.ts` (part + close events)
- Test: `packages/ui/src/wire/diagnostic-events.test.ts` (new)

**Emission rules (every site):** gate on `wireDiagnosticsActive()` BEFORE constructing the event object; `t: Date.now()`; all events from one read share the Task-2 `streamId`. `bytes` = UTF-8 byte length via a module-scope `TextEncoder` used only inside the active branch. In `readModelStream`: `seq` increments per frame; `fields` = union of `Object.keys` over the chunks that frame yielded; `chunks` = their count; `model` = the last `model` those chunks stated, if any. `wire.open` fires after `toByteSource` resolves, before `format.open()`, with `source` discriminated: `Response`-like → `'response'`, `getReader` present → `'stream'`, else `'iterable'`. In `consumeModelStream`: `wire.part` from the recorder's sink-method wrappers (variant = the part type that method produces; `chars` = delta string length for text/reasoning, omitted otherwise); `wire.close` at the single return site with `frames` (threaded from `read.ts` as an internal `_frames?: () => number` on the opts object — cast locally, do NOT add it to the public `ConsumeOptions`), `chunks`, the Task-3 `partCounts` map, `finishReason`, `stopReason`, `errorCode` (from the turn's error, code only), `usage`, and `ms` measured from `consumeModelStream` entry.

- [ ] **Step 1: Write the failing test:**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { subscribeWireDiagnostics, type WireDiagnosticEvent } from './diagnostics';

const nullSink = () => ({ appendText: () => {}, appendReasoning: () => {}, upsertToolPart: () => {}, addSource: () => {} } as any);
const SECRET = 'the user said something private';
const BODY = [
  `data: {"model":"openai/gpt-4o-mini","choices":[{"index":0,"delta":{"content":"${SECRET}"},"finish_reason":null}]}`,
  '',
  'data: {"model":"openai/gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '', '',
].join('\n');

let off: (() => void) | undefined;
afterEach(() => { off?.(); off = undefined; });

describe('wire diagnostic events', () => {
  it('emits open → frames → part → close, correlated by one streamId', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(new Response(BODY), nullSink());
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('wire.open');
    expect(types.at(-1)).toBe('wire.close');
    expect(types).toContain('wire.frame');
    expect(types).toContain('wire.part');
    const ids = new Set(events.map((e) => e.streamId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^wire-\d+$/);

    const open = events[0] as any;
    expect(open.format).toBe('openai.chat-completions');
    expect(open.source).toBe('response');

    const frames = events.filter((e) => e.type === 'wire.frame') as any[];
    expect(frames.map((f) => f.seq)).toEqual([1, 2]);       // [DONE] is not a frame
    expect(frames[0].fields).toContain('text');
    expect(frames[0].model).toBe('openai/gpt-4o-mini');
    expect(frames[0].bytes).toBeGreaterThan(0);

    const part = events.find((e) => e.type === 'wire.part') as any;
    expect(part.variant).toBe('text');
    expect(part.chars).toBe(SECRET.length);                  // length, never the text

    const close = events.at(-1) as any;
    expect(close.frames).toBe(2);
    expect(close.chunks).toBeGreaterThan(0);
    expect(close.parts).toEqual({ text: 1 });
    expect(close.finishReason).toBe('stop');
    expect(close.errorCode).toBeUndefined();
    expect(close.ms).toBeGreaterThanOrEqual(0);
  });
  it('the metadata boundary holds: no event carries the message text', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(new Response(BODY), nullSink());
    expect(JSON.stringify(events)).not.toContain(SECRET);
  });
  it('the wrong-dialect signature: frames > 0, chunks 0, errorCode empty-stream', async () => {
    const anthropicBody = [
      'data: {"type":"message_start","message":{"model":"m","usage":{"input_tokens":1}}}', '',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}', '',
      'data: [DONE]', '', '',
    ].join('\n');
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(new Response(anthropicBody), nullSink());
    const close = events.at(-1) as any;
    expect(close.type).toBe('wire.close');
    expect(close.frames).toBeGreaterThan(0);
    expect(close.chunks).toBe(0);
    expect(close.parts).toEqual({});
    expect(close.errorCode).toBe('empty-stream');
  });
  it('emits nothing and changes nothing when nobody subscribes', async () => {
    const turn = await readOpenAIStream(new Response(BODY), nullSink());
    expect(turn.text).toBe(SECRET);
    expect(turn.error).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run → FAILS (no events).
- [ ] **Step 3:** Implement per the emission rules. Keep each site small; the inactive path must add only the `wireDiagnosticsActive()` check.
- [ ] **Step 4:** New test + full unit project + `lint:silent-drops` → PASS.
- [ ] **Step 5:** Watch it fail where it matters: comment out the `wire.close` emission, confirm the first and third tests go red, restore.
- [ ] **Step 6:** Commit: `feat(wire): emit wire.open/frame/part/close diagnostic events`

### Task 6: `wire.failed` + `providerCode`

**Files:**
- Modify: `packages/ui/src/wire/read.ts` (`toByteSource` gains a second param `ctx?: { streamId?: string }`; emit `wire.failed` on the non-ok path immediately before `throw await wireErrorFrom(source)`; add `providerErrorCode(body: unknown): string | number | undefined` beside `providerMessage`, walking `body.error.code` then top-level `body.code`, accepting string or number, returning undefined otherwise)
- Test: append to `packages/ui/src/wire/diagnostic-events.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
  it('wire.failed carries status/bodyBytes/bodyIsJson/providerCode, never the body text', async () => {
    const body = JSON.stringify({ error: { code: 'invalid_api_key', message: 'sk-live-... is not valid' } });
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await expect(
      readOpenAIStream(new Response(body, { status: 401, statusText: 'Unauthorized' }), nullSink()),
    ).rejects.toMatchObject({ status: 401 });               // WireError still thrown, unchanged
    const failed = events.find((e) => e.type === 'wire.failed') as any;
    expect(failed).toMatchObject({
      status: 401, statusText: 'Unauthorized', bodyIsJson: true, providerCode: 'invalid_api_key',
    });
    expect(failed.bodyBytes).toBe(new TextEncoder().encode(body).length);
    expect(failed.streamId).toMatch(/^wire-\d+$/);
    expect(JSON.stringify(failed)).not.toContain('sk-live');
  });
  it('wire.failed on a non-JSON body reports bodyIsJson false and no providerCode', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await expect(
      readOpenAIStream(new Response('<html>502 from the proxy</html>', { status: 502, statusText: 'Bad Gateway' }), nullSink()),
    ).rejects.toMatchObject({ status: 502 });
    const failed = events.find((e) => e.type === 'wire.failed') as any;
    expect(failed).toMatchObject({ status: 502, bodyIsJson: false });
    expect(failed.providerCode).toBeUndefined();
  });
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS + full unit + lint. **Step 5:** Commit: `feat(wire): emit wire.failed with provider error code on non-ok responses`

### Task 7: Exports, gates, PR 1

**Files:**
- Modify: `packages/ui/src/wire/index.ts` — export `subscribeWireDiagnostics` and the event TYPES (`WireDiagnosticEvent` + the five interfaces). Do NOT export `emitWireDiagnostic` / `wireDiagnosticsActive` / `nextStreamId` from the package.

- [ ] **Step 1:** Add the exports; write a two-case test in `diagnostics.test.ts` importing from `./index` to pin the public surface.
- [ ] **Step 2:** Full gates, in order, every exit code read: `pnpm --filter @kitn.ai/ui run lint:silent-drops` · `pnpm --filter @kitn.ai/ui exec vitest run --project=unit` · `pnpm --filter @kitn.ai/ui exec vitest run --project=emitted` · `pnpm exec nx build ui --skip-nx-cache` · `pnpm --filter @kitn.ai/ui run typecheck` (inside packages/ui via `pnpm --filter @kitn.ai/ui run typecheck`) · `pnpm --filter @kitn.ai/ui run verify:consumer` · `pnpm --filter @kitn.ai/ui run verify:scaffold`. If `build:api` regenerated derived artifacts (`docs/web-components.md`, `llms-full.txt`, `element-meta.json`), commit them.
- [ ] **Step 3:** Open PR 1. Body MUST include: the coupling rows NOT written to coupling-map (new guard: `empty-turn` error code; new invariant: diagnostic events are metadata-only, pinned by the SECRET test; `model` field weakens raw chunk-count semantics, guard now parts-based), and the claim-check finding about the missing `openai.reasoning_content` provenance marker.

---

### Task 8: The recorder hook (`window.__KAI_DEVTOOLS_HOOK__`) — PR 2

**Files:**
- Create: `packages/ui/src/diagnostics/hook.ts`
- Create: `packages/ui/src/diagnostics/index.ts` (re-export `installKaiDevtoolsHook`, plus re-export `subscribeWireDiagnostics` and the event types from `../wire/diagnostics`)
- Test: `packages/ui/src/diagnostics/hook.test.ts` (jsdom)

**Interfaces (the panel binds to this — it is the spec's hook shape, verbatim, plus one additive field):**

```ts
export interface KaiDevtoolsHook {
  version: 1;
  recording: boolean;                                    // additive; true iff the signal was set at install
  drain(): WireDiagnosticEvent[];                        // history, and clears it
  subscribe(fn: (e: WireDiagnosticEvent) => void): () => void;
  activate(): void;                                      // sets localStorage['kai-devtools']='1', then location.reload()
}
/** Idempotent; SSR-safe (no-op without window); reads the signal ONCE, synchronously. */
export function installKaiDevtoolsHook(): KaiDevtoolsHook | undefined;
```

Signal, in spec order, first hit wins: (1) `localStorage['kai-devtools']` truthy (try/catch — storage can throw), (2) `window.__KAI_DEVTOOLS__ === true`, (3) `new URLSearchParams(location.search).get('kai-devtools') === '1'`. Wanted → subscribe an internal collector to `subscribeWireDiagnostics` immediately, buffer uncapped. Not wanted → no buffer, no subscription; `drain()` returns `[]`; the hook's own `subscribe` still works (live-only) by delegating to `subscribeWireDiagnostics`. If a hook is already installed, return the existing one untouched.

- [ ] **Step 1: Write the failing tests** — cases: signal precedence (each source alone activates; none → `recording: false`); wanted → events emitted via `emitWireDiagnostic` land in `drain()`, and `drain()` clears (second call `[]`); not wanted → `drain()` stays `[]` while a live `subscribe` still receives; `activate()` writes the localStorage key and calls a stubbed `location.reload` (stub via `vi.spyOn`/defineProperty — jsdom's reload throws otherwise); double install returns the same object; module import performs no install by itself (import the module, assert `window.__KAI_DEVTOOLS_HOOK__` is undefined until `installKaiDevtoolsHook()` runs).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit: `feat(diagnostics): kai devtools hook with signal-gated eager capture`

### Task 9: Auto-install + the `./diagnostics` export — PR 2

**Files:**
- Modify: `packages/ui/src/elements/register-impl.ts` — call `installKaiDevtoolsHook()` once (it is client-only code already; import statically from `../diagnostics/hook`)
- Modify: `packages/ui/package.json` — add the `./diagnostics` export mapping to `dist/diagnostics/index` (COPY the exact shape of an existing subpath entry like `./state`, types + import conditions and all; also add the matching `typesVersions`/`files` entries if the existing subpaths carry them)
- Modify: `packages/ui/vite.config.*` build entries if subpaths are enumerated there (copy the `./state` pattern)
- Test: extend `hook.test.ts` with an integration case; rely on `verify:consumer` for the packaging half

- [ ] **Step 1:** Failing test: import `register-impl` (the way existing elements tests do), assert `window.__KAI_DEVTOOLS_HOOK__` exists afterwards with `recording: false` when no signal is set.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Gates as in Task 7 Step 2 (all of them — `verify:consumer` is the one that proves the new subpath survives packaging; SSR safety is covered by the existing register/SSR tests staying green).
- [ ] **Step 6:** Open PR 2. Body: the hook contract is now a published coupling between `@kitn.ai/ui` and the future `@kitn.ai/devtools` (version field is the seam); note the solid-direct caveat (apps importing Solid components directly never run `register-impl` and must call `installKaiDevtoolsHook()` themselves — documented in the `./diagnostics` module docblock).

---

### Task 10: `packages/devtools` scaffold — PR 3

**Files:**
- Create: `packages/devtools/package.json` — name `@kitn.ai/devtools`, version `0.0.0`, `"private": false`, type module, one export `.` → `dist/kai-devtools.es.js`, **plus `"main"`, `"unpkg"` and `"jsdelivr"` fields all pointing at `dist/kai-devtools.es.js`** (script-tag delivery is the product: the bare `https://unpkg.com/@kitn.ai/devtools` URL resolves through those fields, not through the exports map), scripts: `build` (vite build), `test` (vitest run), `typecheck` (tsc --noEmit). devDependencies: `typescript`, `vite`, `vitest`, `jsdom`, and `@kitn.ai/ui: workspace:*` (types + demo only — the SHIPPED bundle must import NOTHING from it; the panel talks to the hook object on `window`).
- Create: `packages/devtools/tsconfig.json` (strict, DOM lib), `packages/devtools/vite.config.ts` (lib mode, single ES entry `src/index.ts`, no externals), `packages/devtools/vitest.config.ts` (jsdom)
- Create: `packages/devtools/src/index.ts` (empty registration stub for now: `export {}`)

- [ ] **Step 1:** Scaffold; `pnpm install`; `pnpm --filter @kitn.ai/devtools run build` and `typecheck` both exit 0.
- [ ] **Step 2:** Verify NX sees the project: `pnpm exec nx show projects` includes `devtools` (or the package name — read the workspace convention from how `create-kai` is wired, and mirror it, including any CI test-job inclusion; if the required CI `test` job enumerates packages rather than using run-many, note it in the PR body instead of editing workflow files silently).
- [ ] **Step 3:** Commit: `feat(devtools): scaffold @kitn.ai/devtools package`

### Task 11: The `<kai-devtools>` element — PR 3

**Files:**
- Create: `packages/devtools/src/hook-client.ts` — finds `window.__KAI_DEVTOOLS_HOOK__`, exposes `attach(): { history: WireDiagnosticEvent[]; subscribe: (fn) => () => void; hookVersion: number } | undefined`; re-declare the event/hook TYPES locally from the spec contract (the panel floats free of the kit — importing the kit's types at type-level only via `import type { ... } from '@kitn.ai/ui/diagnostics'` is allowed since it vanishes at build; choose it so drift is caught at typecheck)
- Create: `packages/devtools/src/streams.ts` — the pure fold `foldStreams(events: WireDiagnosticEvent[]): StreamSummary[]` where `StreamSummary = { streamId?: string; format?: string; source?: string; frames: number; chunks: number; parts: Record<string, number>; model?: string; finishReason?: string | null; errorCode?: string | number; status?: number; ms?: number; firstFrameMs?: number; open?: boolean }` — groups by `streamId`, applies the forward-compat rules: UNKNOWN event types are counted and otherwise ignored (never throw), unknown fields ignored, an event type never seen renders as "not reported" not zero
- Create: `packages/devtools/src/panel.ts` — the custom element `kai-devtools` (shadow DOM, all CSS inline in the module)
- Create: `packages/devtools/src/index.ts` (replace stub) — registers the element if undefined; then: if no hook and no signal → do nothing beyond registration; if signal unset → exactly ONE `console.info` line, verbatim from the spec: `[kai-devtools] loaded, not activated. Add ?kai-devtools=1 to the URL, or run __KAI_DEVTOOLS_HOOK__.activate(), to record from the next page load.`; if signal set → self-mount one `<kai-devtools>` into `document.body` if none present
- Test: `packages/devtools/src/streams.test.ts`, `packages/devtools/src/index.test.ts` (jsdom, with a hand-built fake hook)

**Panel v1 renders (metadata only, nothing else):** a fixed bottom-right collapsible panel (header: "kai devtools", hook `version`, live event count, a collapse toggle) listing one row per stream: format · source · `frames→chunks→parts` (the headline numbers, e.g. `12 frames → 12 chunks → 0 parts` highlighted red when parts is 0 and frames > 0) · parts-by-variant · model (rendered as `—` when absent, NEVER filled from anywhere else) · finishReason/errorCode badge (errorCode red) · `ms` and `firstFrameMs`. Below the rows, a monospace raw-event log (type, t offset, streamId, one line each), capped in the DOM at the most recent 200 lines (a UI retention decision, allowed by the capture model — the panel owns retention after attach). Visual polish is the implementer's discretion within: dark neutral palette, system font stack, no external assets, no network requests, total bundle self-contained.

- [ ] **Step 1: Failing tests for `foldStreams`:** feed a hand-written event list covering: one healthy stream (open/2 frames/1 part/close) → correct summary; the wrong-dialect signature (frames>0, chunks 0, errorCode `empty-stream`); a `wire.failed`-only stream (status set, no close); an event of unknown type `wire.card` → ignored, not thrown, counted in an `unknownTypes` tally on the return; a close missing `frames` → `frames` reported as undefined (not 0). 
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `streams.ts`. **Step 4:** PASS.
- [ ] **Step 5: Failing tests for `index.ts` behaviour:** no signal + hook present → element registered, `document.querySelector('kai-devtools')` is null, exactly one console.info with the verbatim line (spy on console.info); signal set (fake `location.search`) + fake hook with 3 buffered events → element self-mounts, its shadow root contains the stream row, and after `hook`'s subscriber fires a new event the row updates; hook absent entirely → registration only, no throw.
- [ ] **Step 6:** Run → FAIL. **Step 7:** Implement `panel.ts` + `index.ts`. **Step 8:** PASS; `pnpm --filter @kitn.ai/devtools run build` exits 0 and `dist/kai-devtools.es.js` contains no `import` of `@kitn.ai/ui` (grep the artifact: `grep -c "@kitn.ai/ui" dist/kai-devtools.es.js` must print 0 — run it so the exit code is read, and treat grep's exit 1 with count 0 as the pass condition, e.g. capture the count and test it, no `||` masking).
- [ ] **Step 9:** Commit: `feat(devtools): kai-devtools panel v1 — streams summary over the wire diagnostic events`

### Task 12: Demo + Playwright IVP — PR 3

**Files:**
- Create: `packages/devtools/demo/index.html` + `packages/devtools/demo/main.ts` — a Vite page (add a `demo` script: `vite dev` rooted at demo/) that imports `@kitn.ai/ui/elements` register (which auto-installs the hook), imports the built panel entry, mounts a `<kai-chat>` OR a minimal thread, and drives `readOpenAIStream(createMockResponder()...)` from `@kitn.ai/ui/state` + `@kitn.ai/ui/wire` on a button click — copy the mock wiring pattern from `examples/starters/react/src/chat-data.ts` (framework-free version). Include one "broken endpoint" button that feeds an Anthropic-shaped body to `readOpenAIStream` so the red `empty-stream` row is demonstrable, and one "HTTP 401" button feeding a non-ok `Response` for `wire.failed`.
- IVP is run by the VERIFIER, not the implementer, but the implementer must leave it runnable: document in `packages/devtools/README.md` how to start the demo (`pnpm --filter @kitn.ai/devtools run demo`) and the three scenarios.

- [ ] **Step 1:** Build the demo; run it locally with `?kai-devtools=1`; confirm by hand: panel mounts, healthy stream row appears on click, broken-dialect row shows `frames>0 → 0 chunks → 0 parts` + `empty-stream`, 401 shows `wire.failed` status. Without the query param: no visible UI, exactly one console line.
- [ ] **Step 2:** Write `packages/devtools/README.md`: what it is, the activation signals, the metadata-only default, the hook contract, the demo instructions, and a stub install section that says the package is not yet published (no CDN URL until it is — a hand-typed URL for an unpublished version is exactly the pin-rot class `lint:cdn-pins` exists for; confirm `lint:cdn-pins` stays green since `@kitn.ai/devtools` literals are not `@kitn.ai/ui@<version>` pins, and say so in the PR body).
- [ ] **Step 3:** Commit: `feat(devtools): demo page with healthy, wrong-dialect and failed-request scenarios`

### Task 13: PR 3 gates + show-first

- [ ] **Step 1:** Full gates: devtools package `test` + `typecheck` + `build`; packages/ui suite untouched-but-green (`--project=unit`); root `pnpm exec nx build ui --skip-nx-cache` still green (no accidental coupling).
- [ ] **Step 2:** Open PR 3 with screenshots of all three demo scenarios (the verifier's Playwright shots). New-UI show-first: the PR waits for Rob's eyes on the screenshots before merge unless he has said otherwise.

## Self-review notes (already applied)

- Spec coverage: five events (Tasks 5–6), envelope + streamId lift (Tasks 1–2), widened guard (Task 3), `model` + ordering dependency (Task 4, case d), metadata boundary (Task 5 SECRET test + panel scope), forward compat consumer rules (Task 11 foldStreams tests), capture model both branches (Task 8), first-run path incl. verbatim console line (Task 11), hook shape (Task 8), CDN/self-contained (Task 11 Step 8 grep), "nothing transmitted anywhere" (no network code anywhere in the panel).
- Deliberately NOT in this plan: the create-kai emitted console line (spec 1 ruling 3 — create-kai lane), payload capture switch, devtools-added event types (contract violations, encoded request), `raw.source: 'openai.reasoning_content'` provenance (recorded as a finding), publishing/release-please wiring for the new package (Rob's).
