# Wire Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the model-stream adapter inside `@kitn.ai/ui` as a new `./wire` entry, so a developer goes from `fetch('/api/chat')` to a populated `AssistantStream` in one call and gets tool panels, reasoning, citations and cards without writing a parser. Two wire formats in v1: OpenAI chat completions SSE and Anthropic Messages SSE.

**Architecture:** `wire` is a NEW package entry, so the whole plan is additive and the tree stays green at every commit. Two prerequisite fixes land in the existing kit first (a fingerprint fast path in `state/parts.ts`, an empty-text reasoning guard in `components/message.tsx`) because the adapter's own reworks depend on them. Then SSE framing, then the neutral chunk plus the adapter core, then the two formats, then the readers, then the entry wiring, then three layers of fixtures, then the encoders and the round-trip guard. The scaffolder change and the spike teardown come last, after the adapter is proven.

**Tech Stack:** TypeScript, Vite, vitest (jsdom `unit` project), NX, pnpm. No provider SDK, no Solid runtime in `wire`.

Spec: `docs/superpowers/specs/2026-08-09-wire-adapter-design.md`. Read it before starting. Depends on sub-project A (`docs/superpowers/plans/2026-08-07-message-parts-data-model.md`), already landed on this branch.

## Global Constraints

- Run all commands from the **worktree root** (`.claude/worktrees/message-parts`). pnpm + NX workspace.
- **`nx` is not on PATH.** Use `pnpm exec nx ...` everywhere. `pnpm exec nx typecheck ui`, `pnpm exec nx build ui`.
- Unit suite: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit`. **Never run bare `pnpm test`** (it also runs the flaky storybook browser project).
- `pnpm exec nx build ui` churns generated files. On THIS branch those generated files are **COMMITTED**, and the build must remain a **zero-drift fixpoint**: `git status` must be empty after a build. If a build legitimately changes a generated file, commit that file in the same task and say so in the commit body. Do not `git checkout --` it away.
- **No em dashes** anywhere: prose, code comments, doc comments, commit messages. House rule.
- Conventional commits (release-please). Pre-1.0, so breaking changes use `feat!` and cut a minor. Nothing in this plan is breaking; `wire` is a new entry.
- **New array reference per chunk; the SAME reference when nothing changed.** Every fold returns a new array only when it actually changed, so a no-op patch does not re-render.
- **SSR safety:** no bare `crypto`, `window`, `document`, `Response`, `ReadableStream` or `TextDecoder` reference at MODULE scope in `src/wire/**`. Construct them inside functions and duck-type instead of `instanceof` where the global may not exist.
- **`@kitn.ai/ui` must never depend on a provider SDK.** Formats read already-decoded JSON frames typed `unknown`. If a task makes you reach for `@openrouter/sdk`, `openai` or `@anthropic-ai/sdk`, stop and report it.
- Elements are prefixed `kai-`, never `kitn-`.
- **Current green baseline to preserve:** typecheck 4/4, unit 173 files / 1376 tests, spike 40/40. Every task must leave typecheck at 4/4 and the unit suite green. The spike's 40 move into the kit in Task 18 and the spike ends with a small transport suite; that is the one expected count change, and it is called out where it happens.

---

### Task 1: Fingerprint fast path in `state/parts.ts` (rework 4)

**Files:**
- Modify: `packages/ui/src/state/parts.ts`
- Modify: `packages/ui/src/state/parts.test.ts`

**Interfaces:**
- Consumes: `MessagePart`, `RawOrigin` from `../elements/chat-types`; `ToolPart` from `../components/tool-types`; `classifyTool` from `../components/tool-classify`. All already imported by this file.
- Produces: no signature change. `upsertToolPart(parts, toolCallId, patch)` keeps its exact signature and its dedupe CONTRACT (same array reference when the merge changes nothing). Only the cost model changes: it no longer structurally hashes the whole merged tool.
- Later tasks rely on: Task 5 writes `rawInput` on EVERY argument fragment. With today's `fingerprint(merged) === fingerprint(cur)` that walks the whole growing argument string once per fragment, which is quadratic in the argument size. This task must land first.

Today `upsertToolPart` ends with `if (fingerprint(merged) === fingerprint(cur)) return parts;`. `fingerprint` serialises the entire `ToolPart`, including `rawInput` (a string that grows to the full argument JSON) and `raw.payload` (which holds the same string again). At 4 KB of arguments over 200 fragments that is fine; at 200 KB it is not.

- [ ] **Step 1: Write the failing tests**

Append to `packages/ui/src/state/parts.test.ts`, inside the existing `describe('upsertToolPart', ...)` block:

```ts
  it('never serializes `raw` when deciding equality', () => {
    // A payload that EXPLODES if anything walks it. The old code called
    // fingerprint(merged), which JSON-serialized raw.payload on every patch.
    const exploding = {
      source: 'test.explodes',
      payload: {
        get boom(): string {
          throw new Error('raw.payload was serialized');
        },
      },
    };
    let parts = upsertToolPart([], 'tc1', {
      type: 'bash',
      state: 'input-streaming',
      raw: exploding,
    });
    expect(() => {
      parts = upsertToolPart(parts, 'tc1', { rawInput: '{"command":' });
    }).not.toThrow();
    expect(() => {
      parts = upsertToolPart(parts, 'tc1', { rawInput: '{"command":"ls"}' });
    }).not.toThrow();
    const tool = (parts[0] as Extract<MessagePart, { type: 'tool' }>).tool;
    expect(tool.rawInput).toBe('{"command":"ls"}');
    expect(tool.raw).toBe(exploding);
  });

  it('assembles a large rawInput correctly across many fragments', () => {
    let parts = upsertToolPart([], 'tc1', { type: 'write_file', state: 'input-streaming' });
    let text = '';
    for (let i = 0; i < 5000; i++) {
      text += `frag${i},`;
      parts = upsertToolPart(parts, 'tc1', { rawInput: text });
    }
    const tool = (parts[0] as Extract<MessagePart, { type: 'tool' }>).tool;
    expect(tool.rawInput).toBe(text);
    expect(tool.rawInput.length).toBeGreaterThan(50_000);
  });

  it('still dedupes a structurally identical input arriving as a fresh object', () => {
    const parts = upsertToolPart([], 'tc1', {
      type: 'bash',
      state: 'input-available',
      input: { command: 'ls', flags: ['-a'] },
    });
    // A DIFFERENT object with the same shape, and reversed key order.
    const same = upsertToolPart(parts, 'tc1', { input: { flags: ['-a'], command: 'ls' } });
    expect(same).toBe(parts);
  });

  it('still dedupes a structurally identical output arriving as a fresh object', () => {
    const parts = upsertToolPart([], 'tc1', {
      type: 'bash',
      state: 'output-available',
      output: { stdout: 'a\nb', code: 0 },
    });
    const same = upsertToolPart(parts, 'tc1', { output: { code: 0, stdout: 'a\nb' } });
    expect(same).toBe(parts);
  });

  it('does NOT dedupe when only rawInput changed', () => {
    const parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming', rawInput: '{"a' });
    const next = upsertToolPart(parts, 'tc1', { rawInput: '{"ab' });
    expect(next).not.toBe(parts);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/state/parts.test.ts`
Expected: FAIL. The first test throws `raw.payload was serialized`. The rest pass already (they describe behaviour that must be PRESERVED); if any of them fails, stop, the fast path is not the only problem.

- [ ] **Step 3: Replace the whole-object fingerprint with a field-wise compare**

In `packages/ui/src/state/parts.ts`, replace the single line

```ts
  if (fingerprint(merged) === fingerprint(cur)) return parts;
```

with

```ts
  if (toolsEqual(cur, merged)) return parts;
```

and add below `resolveKind`:

```ts
/** Structural equality for the two fields that are genuinely object-shaped, and
 *  reference or primitive equality for everything else.
 *
 *  This replaces `fingerprint(merged) === fingerprint(cur)`, which serialized the
 *  ENTIRE ToolPart on every patch. A streaming tool call is patched once per
 *  argument fragment while `rawInput` grows toward the full argument JSON, so
 *  hashing the whole part per fragment is quadratic in the argument size: fine at
 *  4 KB, not at 200 KB.
 *
 *  `rawInput` compares with `!==`. That is exactly the test we want (did the
 *  accumulated text change?) and it is cheap: two strings of different lengths
 *  are unequal after the length check.
 *
 *  `raw` compares by REFERENCE on purpose. It is the untranslated provider
 *  payload; a producer attaches it once and never rebuilds it (upsertToolPart
 *  itself carries `cur.raw` forward when a patch omits it), so reference equality
 *  holds on every real path. Hashing it would walk the accumulated argument
 *  string a second time, which is the cost this function exists to remove. The
 *  worst case is a producer handing over a fresh-but-equal `raw`, which costs one
 *  extra re-render and never a wrong render. */
function toolsEqual(a: ToolPart, b: ToolPart): boolean {
  if (a.type !== b.type) return false;
  if (a.state !== b.state) return false;
  if (a.kind !== b.kind) return false;
  if (a.toolCallId !== b.toolCallId) return false;
  if (a.errorText !== b.errorText) return false;
  if (a.rawInput !== b.rawInput) return false;
  if (a.raw !== b.raw) return false;
  if (a.input !== b.input && fingerprint(a.input) !== fingerprint(b.input)) return false;
  if (a.output !== b.output && fingerprint(a.output) !== fingerprint(b.output)) return false;
  return true;
}
```

`fingerprint` stays exported and unchanged: `state/index.ts` re-exports it and the wire adapter uses it in Task 5 to dedupe a re-parsed `input`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/state/`
Expected: PASS, including every pre-existing `parts.test.ts` and `stream.test.ts` case.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec nx typecheck ui`
Expected: PASS 4/4.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/state/parts.ts packages/ui/src/state/parts.test.ts
git commit -m "perf(state): field-wise tool equality so streaming rawInput is not quadratic"
```

---

### Task 2: Empty-text reasoning guard in `components/message.tsx`

**Files:**
- Modify: `packages/ui/src/components/message.tsx`
- Modify: `packages/ui/src/components/thread.test.tsx`

**Interfaces:**
- Consumes: nothing new. `MessagePart` already carries `{ type: 'reasoning'; text: string; label?; index?; signature?; raw? }`.
- Produces: no API change. `<Message>` stops rendering a reasoning disclosure for a part whose `text` is `''`. The part STAYS in `message.parts`; only the render is suppressed.
- Later tasks rely on: Task 7 (the Anthropic format) emits reasoning parts with empty text for `redacted_thinking` blocks and for the assembled block at `content_block_stop`. Without this guard the UI shows a blank disclosure with a label and nothing under it.

The current render is a `<Switch>` inside a `<For each={props.message.parts}>` at `packages/ui/src/components/message.tsx:375`. `<Switch>` takes the FIRST matching `<Match>`, so the guard goes ABOVE the existing reasoning match.

- [ ] **Step 1: Write the failing tests**

Add to `packages/ui/src/components/thread.test.tsx`, as a new top-level `describe`:

```ts
describe('Thread reasoning parts', () => {
  it('renders a reasoning disclosure when the part has text', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'Weighing the options.', label: 'Thinking', index: 0 },
          { type: 'text', text: 'Done.' },
        ],
      },
    ];
    const { container } = render(() => <Thread messages={messages} />);
    expect(container.textContent ?? '').toContain('Thinking');
  });

  it('renders NOTHING for a reasoning part with empty text', () => {
    // Anthropic's redacted_thinking blocks and the block assembled at
    // content_block_stop both arrive with no readable text and a `raw` payload
    // the encoder has to echo back verbatim. They must stay in `parts` and must
    // NOT produce a blank disclosure.
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'reasoning',
            text: '',
            label: 'Thinking',
            index: 0,
            raw: { source: 'anthropic.content_block', payload: { type: 'redacted_thinking', data: 'EroBCk...' } },
          },
          { type: 'text', text: 'Done.' },
        ],
      },
    ];
    const { container } = render(() => <Thread messages={messages} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Thinking');
    expect(text).toContain('Done.');
  });

  it('keeps a later non-empty reasoning block visible alongside an empty one', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: '', label: 'Thinking', index: 0 },
          { type: 'reasoning', text: 'Second block.', label: 'Thinking', index: 1 },
        ],
      },
    ];
    const { container } = render(() => <Thread messages={messages} />);
    expect(container.textContent ?? '').toContain('Second block.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/thread.test.tsx`
Expected: FAIL on the second test. The empty part renders a `<Reasoning>` with the trigger label `Thinking` and no content.

- [ ] **Step 3: Add the guard**

In `packages/ui/src/components/message.tsx`, insert this `<Match>` IMMEDIATELY ABOVE the existing `<Match when={part.type === 'reasoning' && part}>`:

```tsx
                    {/* A reasoning part with NO text is a round-trip carrier,
                        not something to show. Anthropic's redacted_thinking
                        blocks carry an opaque blob with no readable text, and
                        the block assembled at content_block_stop carries the
                        verbatim payload the encoder must echo back. Both are
                        empty-text parts that MUST stay in `parts` (the encoder
                        needs them, in order) and must not render a blank
                        disclosure. This Match sits above the real one because
                        <Switch> takes the FIRST match. */}
                    <Match when={part.type === 'reasoning' && part.text === ''}>{null}</Match>
```

Leave the existing reasoning `<Match>` exactly as it is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec nx typecheck ui`
Expected: PASS 4/4.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/message.tsx packages/ui/src/components/thread.test.tsx
git commit -m "fix(components): do not render a blank disclosure for empty-text reasoning parts"
```

---

### Task 3: `wire/sse.ts`, real SSE framing

**Files:**
- Create: `packages/ui/src/wire/sse.ts`
- Create: `packages/ui/src/wire/sse.test.ts`

**Interfaces:**
- Consumes: nothing from the kit.
- Produces:
  ```ts
  export type ByteSource = AsyncIterable<Uint8Array | string> | ReadableStream<Uint8Array>;
  export function readableToAsyncIterable(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array>;
  export function sseDataFrames(source: ByteSource): AsyncGenerator<string>;
  export function sseJson<T>(source: ByteSource): AsyncGenerator<T>;
  ```
- Later tasks rely on: Task 8 calls `sseJson<unknown>(bytes)`; Task 10's replay harness feeds `ByteSource`.

This is a near-verbatim port of `examples/internal/openrouter-spike/src/sse-frames.ts`, which is already correct. Do not rewrite it.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/wire/sse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readableToAsyncIterable, sseDataFrames, sseJson } from './sse';

const BYTE_SIZES = [1, 3, 17, 64, 4096];

async function* bytes(text: string, size: number): AsyncGenerator<Uint8Array> {
  const buf = new TextEncoder().encode(text);
  for (let i = 0; i < buf.length; i += size) {
    yield buf.subarray(i, Math.min(i + size, buf.length));
    await Promise.resolve();
  }
}

function readable(text: string, size: number): ReadableStream<Uint8Array> {
  const it = bytes(text, size)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
  });
}

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe('sseDataFrames', () => {
  it('drops keep-alive comment lines', async () => {
    const sse = ': OPENROUTER PROCESSING\n\ndata: one\n\n: ping\n\ndata: two\n\n';
    expect(await collect(sseDataFrames(bytes(sse, 4096)))).toEqual(['one', 'two']);
  });

  it('joins multiple data lines in one frame with a newline', async () => {
    const sse = 'data: line one\ndata: line two\n\n';
    expect(await collect(sseDataFrames(bytes(sse, 4096)))).toEqual(['line one\nline two']);
  });

  it('ignores event, id and retry fields', async () => {
    const sse = 'event: content_block_delta\nid: 7\nretry: 3000\ndata: payload\n\n';
    expect(await collect(sseDataFrames(bytes(sse, 4096)))).toEqual(['payload']);
  });

  it('strips exactly one space after the colon', async () => {
    const sse = 'data:  two spaces\n\n';
    expect(await collect(sseDataFrames(bytes(sse, 4096)))).toEqual([' two spaces']);
  });

  it('normalises CRLF', async () => {
    const sse = 'data: one\r\n\r\ndata: two\r\n\r\n';
    expect(await collect(sseDataFrames(bytes(sse, 4096)))).toEqual(['one', 'two']);
  });

  it('yields a trailing frame that never got its blank line', async () => {
    expect(await collect(sseDataFrames(bytes('data: tail', 4096)))).toEqual(['tail']);
  });

  it('survives a boundary inside a multi-byte codepoint at every chunk size', async () => {
    const sse = 'data: {"t":"héllo wörld ☔️ 日本語"}\n\ndata: [DONE]\n\n';
    for (const size of BYTE_SIZES) {
      expect(await collect(sseDataFrames(bytes(sse, size)))).toEqual([
        '{"t":"héllo wörld ☔️ 日本語"}',
        '[DONE]',
      ]);
    }
  });

  it('accepts a ReadableStream as well as an AsyncIterable', async () => {
    const sse = 'data: one\n\ndata: two\n\n';
    for (const size of BYTE_SIZES) {
      expect(await collect(sseDataFrames(readable(sse, size)))).toEqual(['one', 'two']);
    }
  });

  it('accepts a source that yields strings', async () => {
    async function* strings(): AsyncGenerator<string> {
      yield 'data: on';
      yield 'e\n\ndata: two\n\n';
    }
    expect(await collect(sseDataFrames(strings()))).toEqual(['one', 'two']);
  });
});

describe('sseJson', () => {
  it('parses each frame and stops at [DONE]', async () => {
    const sse = 'data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\ndata: {"a":3}\n\n';
    expect(await collect(sseJson<{ a: number }>(bytes(sse, 4096)))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('skips a frame that is not JSON instead of throwing', async () => {
    const sse = 'data: not json\n\ndata: {"a":1}\n\n';
    expect(await collect(sseJson<{ a: number }>(bytes(sse, 4096)))).toEqual([{ a: 1 }]);
  });
});

describe('readableToAsyncIterable', () => {
  it('yields every chunk and releases the lock', async () => {
    const stream = readable('abcdef', 2);
    const chunks = await collect(readableToAsyncIterable(stream));
    expect(new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])))).toBe('abcdef');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/sse.test.ts`
Expected: FAIL, cannot resolve `./sse`.

- [ ] **Step 3: Port the framing**

Create `packages/ui/src/wire/sse.ts`:

```ts
// SSE frame decoding, kept separate from the adapter so `consume.ts` stays a pure
// chunk consumer with no wire-format knowledge.
//
// Real SSE framing, not `split('\n').filter(startsWith('data:'))`:
//   - a frame ends at a BLANK line; multiple `data:` lines join with '\n'
//   - lines starting with ':' are comments (OpenRouter sends
//     `: OPENROUTER PROCESSING` keep-alives) and are dropped
//   - `event:` / `id:` / `retry:` fields are ignored. Anthropic's `event:` lines
//     are redundant: the same discriminator is inside the JSON as `type`.
//   - '\r\n' is normalised
//   - the decoder is incremental, so a socket boundary inside a multi-byte
//     codepoint does not corrupt the text
//
// SSR: TextDecoder is constructed inside the generator, never at module scope,
// and a ReadableStream is detected by duck-typing `getReader` rather than by
// `instanceof`, so this module imports cleanly where neither global exists.

export type ByteSource = AsyncIterable<Uint8Array | string> | ReadableStream<Uint8Array>;

/** Adapt a WHATWG ReadableStream to an async iterable. Never rely on
 *  `for await (... of res.body)`: Safari still lacks async iteration on it. */
export async function* readableToAsyncIterable(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function asAsyncIterable(source: ByteSource): AsyncIterable<Uint8Array | string> {
  return typeof (source as ReadableStream<Uint8Array>).getReader === 'function'
    ? readableToAsyncIterable(source as ReadableStream<Uint8Array>)
    : (source as AsyncIterable<Uint8Array | string>);
}

/** Yield the payload of each SSE `data:` frame. `[DONE]` is yielded as-is; the
 *  caller decides to stop. */
export async function* sseDataFrames(source: ByteSource): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];

  const take = (): string | undefined => {
    if (dataLines.length === 0) return undefined;
    const payload = dataLines.join('\n');
    dataLines = [];
    return payload;
  };

  const consumeLine = (raw: string): 'boundary' | 'skip' => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '') return 'boundary';
    if (line.startsWith(':')) return 'skip'; // keep-alive comment
    if (line.startsWith('data:')) {
      // One optional space after the colon is framing, not data.
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
    return 'skip';
  };

  for await (const chunk of asAsyncIterable(source)) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      const raw = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (consumeLine(raw) === 'boundary') {
        const payload = take();
        if (payload !== undefined) yield payload;
      }
      nl = buffer.indexOf('\n');
    }
  }

  buffer += decoder.decode(); // flush any trailing multi-byte remainder
  if (buffer) consumeLine(buffer);
  const tail = take();
  if (tail !== undefined) yield tail;
}

/** Decode an SSE byte stream into JSON payloads, stopping at `[DONE]` and
 *  skipping frames that are not JSON. A provider that emits a stray non-JSON
 *  line should not take the turn down. */
export async function* sseJson<T>(source: ByteSource): AsyncGenerator<T> {
  for await (const payload of sseDataFrames(source)) {
    if (payload === '[DONE]') return;
    try {
      yield JSON.parse(payload) as T;
    } catch {
      // a keep-alive or a provider's stray line: ignore rather than throw
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/sse.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec nx typecheck ui`
Expected: PASS 4/4.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/wire/sse.ts packages/ui/src/wire/sse.test.ts
git commit -m "feat(wire): SSE framing with keep-alives, multi-line frames and split codepoints"
```

---

### Task 4: `wire/chunk.ts` and the adapter core (reworks 1 and 3)

**Files:**
- Create: `packages/ui/src/wire/chunk.ts`
- Create: `packages/ui/src/wire/consume.ts`
- Create: `packages/ui/src/wire/fixtures/chunks.ts`
- Create: `packages/ui/src/wire/consume.test.ts`

**Interfaces:**
- Consumes: `RawOrigin` and `ToolPart` from `../components/tool-types`; `MessagePart`, `MessageSource` from `../elements/chat-types`; `appendReasoningPart`, `appendTextPart`, `upsertToolPart`, `type ReasoningOpts` from `../state/parts` (Task 1 changed only its cost model, not its signature).
- Produces, from `chunk.ts`:
  ```ts
  export interface ModelToolCallDelta { index: number; id?: string; name?: string; arguments?: string; output?: Record<string, unknown>; outputError?: string }
  export interface ModelUsage { inputTokens?: number; outputTokens?: number; totalTokens?: number; reasoningTokens?: number; cachedInputTokens?: number; costUsd?: number }
  export interface ModelStreamChunk { text?; reasoning?; reasoningIndex?; reasoningRaw?; reasoningSignature?; toolCalls?; sources?; finishReason?; usage?; error? }
  export type StopReason = 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other';
  export function normalizeStopReason(finishReason: string | null | undefined): StopReason | undefined;
  export interface AssistantStreamSink { appendText(delta: string): unknown; appendReasoning(delta: string, opts?: ReasoningOpts): unknown; upsertTool(toolCallId: string, patch: Partial<ToolPart>): unknown; addSource?(source: MessageSource): unknown }
  export interface ModelToolCall { index: number; id: string; name: string; argumentsText: string; input?: Record<string, unknown>; output?: Record<string, unknown>; providerExecuted?: boolean; error?: string }
  export interface ModelTurn { parts: MessagePart[]; text: string; reasoning: string; toolCalls: ModelToolCall[]; sources: MessageSource[]; finishReason: string | null; stopReason?: StopReason; error?: { code?: string | number; message: string }; usage?: ModelUsage; reasoningChunks: number; chunks: number }
  export interface ConsumeOptions { reasoningLabel?: string; onToolCallReady?: (call: ModelToolCall) => void }
  export interface WireFormatReader { push(frame: unknown): ModelStreamChunk[] }
  export interface WireFormat { readonly id: string; open(): WireFormatReader }
  ```
- Produces, from `consume.ts`: `consumeModelStream(chunks, sink, opts?): Promise<ModelTurn>` and `createToolCallAccumulator(sink, opts?)`.
- Produces, from `fixtures/chunks.ts`: the L1 arrays `TOOL_TURN`, `PARALLEL_TOOLS`, `TRUNCATED_ARGS`, `MID_STREAM_ERROR`, `FINAL_TURN`, `HIDDEN_REASONING`, `STRUCTURED_CARD_TURN`, `STRUCTURED_BROKEN_TURN`, `REDACTED_THINKING_TURN`, `PROVIDER_EXECUTED_TOOL`, plus `replayChunks(chunks)`.
- Later tasks rely on: Tasks 6 and 7 return `ModelStreamChunk[]` from `WireFormat.open().push`. Task 5 rewrites the accumulator's argument handling. Task 8 wraps this in `readModelStream`. Task 14's encoders read `ModelTurn` only indirectly, through `ChatMessage`.

Two of the four spike reworks land here.

**Rework 1 (BLOCKING).** `model-stream.ts:376` guards the whole reasoning branch on `if (chunk.reasoning)`, which is falsy for `''`. Gate instead on `chunk.reasoning !== undefined || chunk.reasoningRaw !== undefined || chunk.reasoningSignature !== undefined`, append `chunk.reasoning ?? ''`, and count `reasoningChunks` only for non-empty text.

**Rework 3.** `finishReason` stays verbatim on `ModelTurn`. A normalized `stopReason` sits beside it, and all internal branching (the truncation hint in the malformed-arguments message) reads `stopReason`.

Two channels the spike never had are added here: `ModelStreamChunk.sources` and `ModelToolCallDelta.output` / `outputError`. `ModelUsage` is renamed off OpenAI's vocabulary (`promptTokens` becomes `inputTokens`, `completionTokens` becomes `outputTokens`); it is a lossless rename on a brand-new entry, so nothing breaks.

`ConsumeOptions.onToolArgumentsDelta` from the spike is deliberately NOT ported. It existed only because `ToolPart` had nowhere to put partial argument text; Task 5 gives it `rawInput`, so the callback would ship redundant on day one.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/wire/fixtures/chunks.ts` first, because the tests import it. Copy the eight arrays from `examples/internal/openrouter-spike/src/fixtures/model-chunks.ts` VERBATIM (`TOOL_TURN`, `PARALLEL_TOOLS`, `TRUNCATED_ARGS`, `MID_STREAM_ERROR`, `FINAL_TURN`, `HIDDEN_REASONING`, `STRUCTURED_CARD_TURN`, `STRUCTURED_BROKEN_TURN`), changing only the import to `import type { ModelStreamChunk } from '../chunk';` and the two usage fixtures' field names (`promptTokens` -> `inputTokens`, `completionTokens` -> `outputTokens`). Keep the `replay` helper, renamed `replayChunks`. Drop `toSseText` / `replayBytes` / `replayReadable`; Task 10 owns byte replay. Then append the two NEW arrays:

```ts
/** 9. Anthropic's two empty-text reasoning cases, which the spike's
 *     `if (chunk.reasoning)` guard silently dropped. Block 0 is a
 *     `redacted_thinking` blob with no readable text at all. Block 1 streams
 *     text, then a signature, then the assembled verbatim block at
 *     content_block_stop. Every one of these MUST produce or update a reasoning
 *     part; the `raw` payloads are what an Anthropic round-trip echoes back. */
export const REDACTED_THINKING_TURN: ModelStreamChunk[] = [
  {
    reasoning: '',
    reasoningIndex: 0,
    reasoningRaw: {
      source: 'anthropic.content_block',
      payload: { type: 'redacted_thinking', data: 'EroBCkYIARgCIkDx1VzGxQ==' },
    },
  },
  { reasoning: '', reasoningIndex: 1 },
  { reasoning: 'Let me work ', reasoningIndex: 1 },
  { reasoning: 'through this.', reasoningIndex: 1 },
  { reasoning: '', reasoningIndex: 1, reasoningSignature: 'ErUBCkYIARgCIkAd8xVzGx' },
  {
    reasoning: '',
    reasoningIndex: 1,
    reasoningRaw: {
      source: 'anthropic.content_block',
      payload: {
        type: 'thinking',
        thinking: 'Let me work through this.',
        signature: 'ErUBCkYIARgCIkAd8xVzGx',
      },
    },
  },
  { text: 'The answer is 42.' },
  { finishReason: 'end_turn' },
];

/** 10. A tool the PROVIDER executed: the call and its result both arrive in the
 *      stream (Anthropic server_tool_use plus web_search_tool_result, or an
 *      OpenAI built-in). With no `output` channel these panels sat at
 *      input-available forever. */
export const PROVIDER_EXECUTED_TOOL: ModelStreamChunk[] = [
  { toolCalls: [{ index: 0, id: 'srvtoolu_01', name: 'web_search' }] },
  { toolCalls: [{ index: 0, arguments: '{"query":"kitn ai ui"}' }] },
  {
    toolCalls: [
      { index: 0, id: 'srvtoolu_01', output: { content: [{ title: 'AI/UI', url: 'https://ui.kitn.ai' }] } },
    ],
  },
  { sources: [{ url: 'https://ui.kitn.ai', title: 'AI/UI', index: 1 }] },
  { text: 'See ui.kitn.ai.' },
  { finishReason: 'end_turn' },
];
```

Now create `packages/ui/src/wire/consume.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { consumeModelStream } from './consume';
import { normalizeStopReason, type AssistantStreamSink, type ModelStreamChunk } from './chunk';
import type { MessagePart } from '../elements/chat-types';
import {
  FINAL_TURN,
  HIDDEN_REASONING,
  MID_STREAM_ERROR,
  PARALLEL_TOOLS,
  PROVIDER_EXECUTED_TOOL,
  REDACTED_THINKING_TURN,
  TOOL_TURN,
  TRUNCATED_ARGS,
  replayChunks,
} from './fixtures/chunks';

function recordingSink(): AssistantStreamSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    appendText: (d) => calls.push(`text:${d}`),
    appendReasoning: (d, o) => calls.push(`reasoning:${o?.index ?? 0}:${d}`),
    upsertTool: (id, p) => calls.push(`tool:${id}:${p.state ?? '-'}`),
    addSource: (s) => calls.push(`source:${s.url ?? ''}`),
  };
}

const nullSink = (): AssistantStreamSink => ({
  appendText: () => undefined,
  appendReasoning: () => undefined,
  upsertTool: () => undefined,
  addSource: () => undefined,
});

const reasoningParts = (parts: MessagePart[]) =>
  parts.filter((p): p is Extract<MessagePart, { type: 'reasoning' }> => p.type === 'reasoning');

describe('normalizeStopReason', () => {
  it('maps both providers onto one vocabulary', () => {
    expect(normalizeStopReason('stop')).toBe('stop');
    expect(normalizeStopReason('end_turn')).toBe('stop');
    expect(normalizeStopReason('stop_sequence')).toBe('stop');
    expect(normalizeStopReason('length')).toBe('length');
    expect(normalizeStopReason('max_tokens')).toBe('length');
    expect(normalizeStopReason('tool_calls')).toBe('tool-calls');
    expect(normalizeStopReason('tool_use')).toBe('tool-calls');
    expect(normalizeStopReason('content_filter')).toBe('content-filter');
    expect(normalizeStopReason('refusal')).toBe('content-filter');
    expect(normalizeStopReason('error')).toBe('error');
  });

  it('degrades an unknown reason to other, and absent to undefined', () => {
    expect(normalizeStopReason('pause_turn')).toBe('other');
    expect(normalizeStopReason('something_new')).toBe('other');
    expect(normalizeStopReason(null)).toBeUndefined();
    expect(normalizeStopReason(undefined)).toBeUndefined();
  });
});

describe('consumeModelStream: ordering and parts', () => {
  it('opens a new text part after a tool call rather than gluing rounds together', async () => {
    const turn = await consumeModelStream(
      replayChunks([
        { text: 'Let me check.' },
        { toolCalls: [{ index: 0, id: 'c1', name: 'get_weather', arguments: '{"city":"Paris"}' }] },
        { finishReason: 'tool_calls' },
      ]),
      nullSink(),
    );
    expect(turn.parts.map((p) => p.type)).toEqual(['text', 'tool']);
    const second = await consumeModelStream(replayChunks(FINAL_TURN), nullSink());
    expect(second.parts.map((p) => p.type)).toEqual(['text']);
  });

  it('drives the sink in stream order', async () => {
    const sink = recordingSink();
    await consumeModelStream(replayChunks(TOOL_TURN), sink);
    expect(sink.calls[0]).toBe('reasoning:0:The user wants weather. ');
    expect(sink.calls).toContain('text:Let me check');
    expect(sink.calls.some((c) => c.startsWith('tool:call_wx_001:'))).toBe(true);
  });

  it('reports finishReason verbatim and stopReason normalized', async () => {
    const turn = await consumeModelStream(replayChunks(TOOL_TURN), nullSink());
    expect(turn.finishReason).toBe('tool_calls');
    expect(turn.stopReason).toBe('tool-calls');
    const anthropic = await consumeModelStream(replayChunks(REDACTED_THINKING_TURN), nullSink());
    expect(anthropic.finishReason).toBe('end_turn');
    expect(anthropic.stopReason).toBe('stop');
  });
});

describe('consumeModelStream: reasoning (rework 1)', () => {
  it('keeps an empty-text reasoning delta that carries a raw payload', async () => {
    const turn = await consumeModelStream(replayChunks(REDACTED_THINKING_TURN), nullSink());
    const blocks = reasoningParts(turn.parts);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe('');
    expect(blocks[0].raw?.payload).toEqual({ type: 'redacted_thinking', data: 'EroBCkYIARgCIkDx1VzGxQ==' });
  });

  it('threads the assembled block and its signature onto the streamed part', async () => {
    const turn = await consumeModelStream(replayChunks(REDACTED_THINKING_TURN), nullSink());
    const block = reasoningParts(turn.parts)[1];
    expect(block.text).toBe('Let me work through this.');
    expect(block.signature).toBe('ErUBCkYIARgCIkAd8xVzGx');
    expect(block.raw?.payload).toEqual({
      type: 'thinking',
      thinking: 'Let me work through this.',
      signature: 'ErUBCkYIARgCIkAd8xVzGx',
    });
  });

  it('preserves block ORDER, which is what the encoder round-trips', async () => {
    const turn = await consumeModelStream(replayChunks(REDACTED_THINKING_TURN), nullSink());
    expect(turn.parts.map((p) => p.type)).toEqual(['reasoning', 'reasoning', 'text']);
  });

  it('counts only non-empty reasoning deltas in reasoningChunks', async () => {
    const turn = await consumeModelStream(replayChunks(REDACTED_THINKING_TURN), nullSink());
    expect(turn.reasoningChunks).toBe(2);
    expect(turn.reasoning).toBe('Let me work through this.');
  });

  it('never blanks an established raw when a later delta omits it', async () => {
    const raw = { source: 'anthropic.content_block', payload: { type: 'thinking', thinking: 'x' } };
    const turn = await consumeModelStream(
      replayChunks([
        { reasoning: 'x', reasoningIndex: 0, reasoningRaw: raw },
        { reasoning: 'y', reasoningIndex: 0 },
      ]),
      nullSink(),
    );
    expect(reasoningParts(turn.parts)[0].raw?.payload).toEqual(raw.payload);
  });

  it('reports hidden reasoning as zero streamed chunks with non-zero tokens', async () => {
    const turn = await consumeModelStream(replayChunks(HIDDEN_REASONING), nullSink());
    expect(turn.reasoningChunks).toBe(0);
    expect(reasoningParts(turn.parts)).toHaveLength(0);
    expect(turn.usage?.reasoningTokens).toBe(512);
  });
});

describe('consumeModelStream: tool calls', () => {
  it('reassembles fragmented arguments into one parsed input', async () => {
    const turn = await consumeModelStream(replayChunks(TOOL_TURN), nullSink());
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0].input).toEqual({ city: 'Paris', units: 'metric' });
    expect(turn.toolCalls[0].argumentsText).toBe('{"city":"Paris","units":"metric"}');
    expect(turn.toolCalls[0].error).toBeUndefined();
  });

  it('correlates parallel calls by index when the id arrives late', async () => {
    const turn = await consumeModelStream(replayChunks(PARALLEL_TOOLS), nullSink());
    expect(turn.toolCalls.map((c) => c.id)).toEqual(['call_a', 'call_b']);
    expect(turn.toolCalls[0].input).toEqual({ query: 'theming' });
    expect(turn.toolCalls[1].input).toEqual({ city: 'Tokyo' });
  });

  it('explains a truncated call using the NORMALIZED stop reason', async () => {
    const turn = await consumeModelStream(replayChunks(TRUNCATED_ARGS), nullSink());
    expect(turn.toolCalls[0].error).toContain('token limit');
    // Same fixture, Anthropic's vocabulary for the same condition.
    const anthropic = await consumeModelStream(
      replayChunks([
        { toolCalls: [{ index: 0, id: 'c1', name: 'propose_action', arguments: '{"title":"Deploy' }] },
        { finishReason: 'max_tokens' },
      ]),
      nullSink(),
    );
    expect(anthropic.toolCalls[0].error).toContain('token limit');
  });

  it('fails every in-flight call when the stream errors mid-turn', async () => {
    const sink = recordingSink();
    const turn = await consumeModelStream(replayChunks(MID_STREAM_ERROR), sink);
    expect(turn.error?.message).toContain('Upstream provider');
    expect(turn.stopReason).toBe('error');
    expect(turn.toolCalls[0].error).toContain('Stream failed');
    expect(sink.calls).toContain('tool:call_boom:output-error');
  });

  it('fires onToolCallReady once per usable call', async () => {
    const ready = vi.fn();
    await consumeModelStream(replayChunks(PARALLEL_TOOLS), nullSink(), { onToolCallReady: ready });
    expect(ready).toHaveBeenCalledTimes(2);
  });

  it('accepts an argument-less tool that streams nothing', async () => {
    const turn = await consumeModelStream(
      replayChunks([
        { toolCalls: [{ index: 0, id: 'c1', name: 'list_files', arguments: '' }] },
        { finishReason: 'tool_calls' },
      ]),
      nullSink(),
    );
    expect(turn.toolCalls[0].input).toEqual({});
    expect(turn.toolCalls[0].error).toBeUndefined();
  });
});

describe('consumeModelStream: provider-executed tools and sources', () => {
  it('completes a provider-executed panel with no host work', async () => {
    const sink = recordingSink();
    const turn = await consumeModelStream(replayChunks(PROVIDER_EXECUTED_TOOL), sink);
    expect(sink.calls).toContain('tool:srvtoolu_01:output-available');
    expect(turn.toolCalls[0].providerExecuted).toBe(true);
    expect(turn.toolCalls[0].output).toEqual({
      content: [{ title: 'AI/UI', url: 'https://ui.kitn.ai' }],
    });
    expect(turn.toolCalls[0].error).toBeUndefined();
  });

  it('routes sources to the sink and onto the turn', async () => {
    const sink = recordingSink();
    const turn = await consumeModelStream(replayChunks(PROVIDER_EXECUTED_TOOL), sink);
    expect(sink.calls).toContain('source:https://ui.kitn.ai');
    expect(turn.sources).toEqual([{ url: 'https://ui.kitn.ai', title: 'AI/UI', index: 1 }]);
  });

  it('tolerates a sink with no addSource', async () => {
    const minimal: AssistantStreamSink = {
      appendText: () => undefined,
      appendReasoning: () => undefined,
      upsertTool: () => undefined,
    };
    const turn = await consumeModelStream(replayChunks(PROVIDER_EXECUTED_TOOL), minimal);
    expect(turn.sources).toHaveLength(1);
  });
});

describe('consumeModelStream: reference stability', () => {
  it('produces identical parts when the same chunks are replayed twice', async () => {
    const a = await consumeModelStream(replayChunks(TOOL_TURN), nullSink());
    const b = await consumeModelStream(replayChunks(TOOL_TURN), nullSink());
    expect(JSON.stringify(a.parts)).toBe(JSON.stringify(b.parts));
  });

  it('records parts even when the host sink swallows everything', async () => {
    const chunks: ModelStreamChunk[] = [{ text: 'a' }, { text: 'b' }, { finishReason: 'stop' }];
    const turn = await consumeModelStream(replayChunks(chunks), nullSink());
    expect(turn.parts).toEqual([{ type: 'text', text: 'ab' }]);
    expect(turn.text).toBe('ab');
    expect(turn.chunks).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/consume.test.ts`
Expected: FAIL, cannot resolve `./consume` and `./chunk`.

- [ ] **Step 3: Write `wire/chunk.ts`**

```ts
// The provider-neutral chunk surface. Everything the adapter needs out of one
// streaming chunk, and nothing else. A WireFormat maps a decoded provider frame
// onto these; nothing below this line knows a provider exists.
import type { RawOrigin, ToolPart } from '../components/tool-types';
import type { MessagePart, MessageSource } from '../elements/chat-types';
import type { ReasoningOpts } from '../state/parts';

/** One fragment of a tool call. */
export interface ModelToolCallDelta {
  /**
   * The ONLY thing correlating fragments, and its NAMESPACE IS FORMAT-DEFINED.
   * `openaiChatFormat` uses the position in `delta.tool_calls`;
   * `anthropicMessagesFormat` uses the content-block index. Both are correct and
   * both are stable within one stream, but they are not the same number, so a
   * third-party format must pick one and stay consistent with itself.
   */
  index: number;
  id?: string;
  /** Usually whole on the first fragment; a few providers split it. */
  name?: string;
  /** A FRAGMENT of the JSON arguments string, not valid JSON on its own. */
  arguments?: string;
  /** A result the PROVIDER executed (Anthropic web_search_tool_result, an OpenAI
   *  built-in). Completes the panel with no host work. */
  output?: Record<string, unknown>;
  /** A provider-executed tool that failed. */
  outputError?: string;
}

/** Field names are deliberately provider-neutral. OpenAI says prompt/completion,
 *  Anthropic says input/output; input/output is the one that reads correctly for
 *  both. */
export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Non-zero proves the model reasoned even when no reasoning text streamed. */
  reasoningTokens?: number;
  cachedInputTokens?: number;
  costUsd?: number;
}

export interface ModelStreamChunk {
  text?: string;
  /**
   * Reasoning delta. `''` is MEANINGFUL, not a no-op: a redacted block has no
   * readable text but still carries a payload that must round-trip, and a format
   * uses an empty delta to OPEN a reasoning part at the right position in the
   * stream so block order survives into `parts`.
   */
  reasoning?: string;
  /** The provider's BLOCK index. Keeps parallel reasoning blocks distinct.
   *  Omitted means block 0, the single-block case every provider degrades to. */
  reasoningIndex?: number;
  /**
   * The UNTRANSLATED provider payload for this reasoning block. Valid on a chunk
   * with NO reasoning text at all, which is the whole point: Anthropic returns
   * 400 if a `thinking` block is modified, reordered or RECONSTRUCTED, so an
   * encoder has to echo the original block rather than rebuild one from `text`
   * plus `signature`.
   */
  reasoningRaw?: RawOrigin;
  /** Informational. `reasoningRaw` is the round-trip channel, not this. */
  reasoningSignature?: string;
  toolCalls?: ModelToolCallDelta[];
  /** Citations the model produced. This entry ships the channel; rendering the
   *  citation row is a later sub-project. */
  sources?: MessageSource[];
  /** Provider VERBATIM: 'stop' | 'tool_calls' | 'end_turn' | 'max_tokens' | ...
   *  Normalizing in place would destroy information consumers branch on. */
  finishReason?: string | null;
  usage?: ModelUsage;
  /** An in-band provider error (the HTTP response was already 200). */
  error?: { code?: string | number; message: string };
}

/** One vocabulary across formats, for code that has to BRANCH. `finishReason`
 *  stays beside it, verbatim, for code that has to REPORT. */
export type StopReason = 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other';

const STOP_REASONS: Record<string, StopReason> = {
  // OpenAI chat completions
  stop: 'stop',
  length: 'length',
  tool_calls: 'tool-calls',
  function_call: 'tool-calls',
  content_filter: 'content-filter',
  error: 'error',
  // Anthropic Messages
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  tool_use: 'tool-calls',
  refusal: 'content-filter',
  pause_turn: 'other',
};

/** Unknown reasons degrade to 'other' rather than throwing: providers add stop
 *  reasons without warning and a new one must not take a turn down. */
export function normalizeStopReason(
  finishReason: string | null | undefined,
): StopReason | undefined {
  if (!finishReason) return undefined;
  return STOP_REASONS[finishReason] ?? 'other';
}

/**
 * The subset of the kit's `AssistantStream` the adapter drives. Declared
 * STRUCTURALLY so the adapter has no runtime dependency on a stream
 * implementation and can be tested against a recorder. The kit's real
 * `AssistantStream` satisfies it as-is: same method names, same arities, and its
 * `AssistantStream` returns are assignable to `unknown`.
 *
 * `addSource` is optional so a hand-rolled three-method sink still compiles.
 */
export interface AssistantStreamSink {
  appendText(delta: string): unknown;
  appendReasoning(delta: string, opts?: ReasoningOpts): unknown;
  /** Create-or-merge. There is no separate "announce" call: handing a patch for
   *  an unknown `toolCallId` creates the ToolPart, and every later patch merges. */
  upsertTool(toolCallId: string, patch: Partial<ToolPart>): unknown;
  addSource?(source: MessageSource): unknown;
}

/** One tool call reassembled out of the stream's fragments. */
export interface ModelToolCall {
  /** The delta index that correlated this call's fragments. */
  index: number;
  /** Provider call id (synthesised as `call_<index>` if the provider omits it). */
  id: string;
  name: string;
  /** The RAW accumulated argument fragments. Echo THIS back on the next turn,
   *  not a re-stringified parse. */
  argumentsText: string;
  /** Parsed arguments: present only when `argumentsText` was a valid JSON object. */
  input?: Record<string, unknown>;
  /** Present only for a call the PROVIDER executed. */
  output?: Record<string, unknown>;
  /** True when the provider ran the tool and returned its result in-stream. The
   *  host must NOT execute these. */
  providerExecuted?: boolean;
  /** Why this call is unusable (malformed or truncated args, missing name). */
  error?: string;
}

/** Everything one assistant turn produced. */
export interface ModelTurn {
  /** The turn as ORDERED MESSAGE PARTS, built with the kit's own part builders,
   *  so it is exactly what the sink was driven with. Covers this turn only. */
  parts: MessagePart[];
  /** Flat concatenation of the text deltas. The provider wire format is a flat
   *  string, so this is kept for encoders. Not the content model. */
  text: string;
  /** Flat concatenation of the reasoning deltas, for the same reason. */
  reasoning: string;
  toolCalls: ModelToolCall[];
  sources: MessageSource[];
  /** The provider's own word for why it stopped. Never normalized. */
  finishReason: string | null;
  /** The same fact in one vocabulary. Branch on this. */
  stopReason?: StopReason;
  error?: { code?: string | number; message: string };
  usage?: ModelUsage;
  /** How many chunks carried a NON-EMPTY reasoning delta. Zero with a non-zero
   *  `usage.reasoningTokens` means the provider hid the thinking text. */
  reasoningChunks: number;
  chunks: number;
}

export interface ConsumeOptions {
  /** Label for the reasoning disclosure. Defaults to 'Thinking'. */
  reasoningLabel?: string;
  /** Fires once per tool call the moment its arguments parse cleanly. This is
   *  the hook a host's tool loop waits on. There is deliberately no
   *  per-fragment callback: `ToolPart.rawInput` is written on every fragment,
   *  so the streaming text is already on the part. */
  onToolCallReady?: (call: ModelToolCall) => void;
}

/** Per-stream state for one format. */
export interface WireFormatReader {
  /**
   * Map one decoded frame onto zero or more neutral chunks. Returns an ARRAY
   * because the mapping is not one-to-one: an Anthropic `message_start` yields
   * usage, a `content_block_start` for `tool_use` yields an id-plus-name delta,
   * a `ping` yields nothing.
   *
   * MUST NOT throw on an unrecognized frame. Return `[]` instead: providers add
   * event types without warning.
   */
  push(frame: unknown): ModelStreamChunk[];
}

/** A pluggable wire format. Values, not a flag, so a third party can add one
 *  without a PR to this repo. */
export interface WireFormat {
  readonly id: string;
  /** Called once per stream so a format can hold per-stream state. Two calls
   *  must share NOTHING. */
  open(): WireFormatReader;
}
```

- [ ] **Step 4: Write `wire/consume.ts`**

```ts
// The adapter core: read neutral chunks, drive a sink, and report the turn.
//
// PORTABILITY RULES: no React, no Solid, no DOM, no fetch, no SSE, and NO
// PROVIDER SDK. The only kit values imported are the three part builders, which
// are REUSED rather than reimplemented so that `ModelTurn.parts` is produced by
// exactly the code that drove the sink.
import type { MessagePart, MessageSource } from '../elements/chat-types';
import { appendReasoningPart, appendTextPart, fingerprint, upsertToolPart } from '../state/parts';
import {
  normalizeStopReason,
  type AssistantStreamSink,
  type ConsumeOptions,
  type ModelStreamChunk,
  type ModelToolCall,
  type ModelToolCallDelta,
  type ModelTurn,
  type ModelUsage,
  type StopReason,
} from './chunk';
import type { RawOrigin } from '../components/tool-types';

// ── Tool-call accumulator ────────────────────────────────────────────────────

interface MutableCall {
  index: number;
  id: string | null;
  name: string;
  argumentsText: string;
  announced: boolean;
  /** Fingerprint of the last `input` written, so a re-parse of unchanged text
   *  does not patch the part again. */
  lastInputFp: string | null;
  providerExecuted: boolean;
  output?: Record<string, unknown>;
  outputError?: string;
}

const snapshot = (c: MutableCall): ModelToolCall => ({
  index: c.index,
  id: c.id ?? `call_${c.index}`,
  name: c.name,
  argumentsText: c.argumentsText,
});

/**
 * The provider-shaped tool-call block, REASSEMBLED from the fragments, kept on
 * the part so an encoder can round-trip without re-deriving it.
 *
 * Tagged `custom.` on purpose: it is a reconstruction, not a payload the
 * provider handed over intact, so it must never be mistaken for one of the
 * verbatim blocks (Anthropic `thinking`) a provider refuses to accept rebuilt.
 */
const rawOf = (c: MutableCall): RawOrigin => ({
  source: 'custom.wire.tool_call',
  payload: { id: c.id ?? `call_${c.index}`, name: c.name, arguments: c.argumentsText },
});

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}...`;
}

/** Parse accumulated argument text into a JSON OBJECT, or undefined. A prefix of
 *  a JSON object never parses, which is why `rawInput` exists. No tolerant
 *  partial-JSON closer ships: guessing at a half-written object produces
 *  confidently wrong tool inputs. */
function parseArgumentObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  try {
    const value: unknown = JSON.parse(trimmed);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Correlate tool-call fragments by `index` and drive the ToolPart lifecycle.
 * THE HARD PART: `id`, `name` and each slice of `arguments` arrive across
 * arbitrarily many chunks in provider-dependent order.
 *
 * A ToolPart is pushed (`input-streaming`) the first time a call has BOTH an id
 * and a non-empty name: announcing earlier would create a panel whose `type` is
 * the empty string. Everything before that is buffered and flushed at announce.
 */
export function createToolCallAccumulator(sink: AssistantStreamSink, opts: ConsumeOptions = {}) {
  const calls = new Map<number, MutableCall>();

  /** Write the argument text that has arrived so far.
   *
   *  `rawInput` is written on EVERY fragment, so a consumer watching the part
   *  sees the arguments assemble character by character. `input` is written only
   *  when the whole accumulated text parses to a JSON object. Honest caveat:
   *  with plain `JSON.parse` a prefix never parses, so `input` in practice still
   *  lands once, at the end. `rawInput` is what streams. */
  const writeArguments = (call: MutableCall) => {
    const id = call.id!;
    const text = call.argumentsText;
    const parsed = parseArgumentObject(text);
    if (parsed) {
      const fp = fingerprint(parsed);
      if (fp !== call.lastInputFp) {
        call.lastInputFp = fp;
        sink.upsertTool(id, { rawInput: text, input: parsed, state: 'input-available' });
        return;
      }
    }
    sink.upsertTool(id, { rawInput: text });
  };

  const announce = (call: MutableCall) => {
    if (call.announced) return;
    call.id ??= `call_${call.index}`;
    call.announced = true;
    sink.upsertTool(call.id, { type: call.name || 'unknown_tool', state: 'input-streaming' });
    // Fragments that arrived before the id did are flushed now.
    if (call.argumentsText) writeArguments(call);
  };

  const apply = (raw: ModelToolCallDelta) => {
    const index = typeof raw.index === 'number' ? raw.index : 0;
    let call = calls.get(index);
    if (!call) {
      call = {
        index,
        id: null,
        name: '',
        argumentsText: '',
        announced: false,
        lastInputFp: null,
        providerExecuted: false,
      };
      calls.set(index, call);
    }
    if (raw.id && !call.id) call.id = raw.id;
    if (raw.name) call.name += raw.name;
    if (call.id && call.name) announce(call);

    if (typeof raw.arguments === 'string' && raw.arguments !== '') {
      call.argumentsText += raw.arguments;
      if (call.announced) writeArguments(call);
    }

    if (raw.output !== undefined || raw.outputError !== undefined) {
      // A result the PROVIDER executed. Force the announce so the panel exists,
      // then complete it. `settle` must not touch it afterwards.
      announce(call);
      call.providerExecuted = true;
      if (raw.outputError !== undefined) {
        call.outputError = raw.outputError;
        sink.upsertTool(call.id!, { state: 'output-error', errorText: raw.outputError });
      } else {
        call.output = raw.output;
        sink.upsertTool(call.id!, { state: 'output-available', output: raw.output });
      }
    }
  };

  /** Settle every accumulated call once the stream ends. */
  const settle = (stopReason: StopReason | undefined, streamError?: string): ModelToolCall[] =>
    [...calls.values()]
      .sort((a, b) => a.index - b.index)
      .map((call) => {
        announce(call); // a call that only ever had arguments still gets a panel
        const id = call.id!;
        const base = snapshot(call);

        if (call.providerExecuted) {
          // Already at output-available/output-error. Re-settling would overwrite
          // the provider's own result with a parse of its arguments.
          return {
            ...base,
            providerExecuted: true,
            ...(call.output !== undefined ? { output: call.output } : {}),
            ...(call.outputError !== undefined ? { error: call.outputError } : {}),
          };
        }

        // Attached once, at settle: before that `argumentsText` is still growing
        // and a raw snapshot of half a JSON string is worse than none.
        const raw = rawOf(call);
        // `type` is re-sent because a provider may split the tool NAME across
        // fragments; the announce could have fired on a prefix.
        const name = call.name || 'unknown_tool';

        if (streamError) {
          const error = `Stream failed before the tool call completed: ${streamError}`;
          sink.upsertTool(id, {
            type: name,
            state: 'output-error',
            errorText: error,
            rawInput: call.argumentsText,
            raw,
          });
          return { ...base, error };
        }

        if (!call.name) {
          const error = 'Tool call arrived with no function name; cannot dispatch it.';
          sink.upsertTool(id, { state: 'output-error', errorText: error, raw });
          return { ...base, error };
        }

        const rawArgs = call.argumentsText.trim();
        try {
          // An argument-less tool legitimately streams '' or '{}'.
          const parsed: unknown = rawArgs === '' ? {} : JSON.parse(rawArgs);
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('arguments must be a JSON object');
          }
          const input = parsed as Record<string, unknown>;
          sink.upsertTool(id, {
            type: name,
            state: 'input-available',
            input,
            rawInput: call.argumentsText,
            raw,
          });
          const ready: ModelToolCall = { ...base, input };
          opts.onToolCallReady?.(ready);
          return ready;
        } catch (e) {
          const truncated =
            stopReason === 'length' ? ' (the stream hit the token limit mid-call)' : '';
          const error =
            `Malformed tool arguments${truncated}: ${(e as Error).message}. ` +
            `Received ${rawArgs.length} chars: ${clip(rawArgs, 160)}`;
          sink.upsertTool(id, {
            type: name,
            state: 'output-error',
            errorText: error,
            rawInput: call.argumentsText,
            raw,
          });
          return { ...base, error };
        }
      });

  return { apply, settle };
}

// ── Part recording and sink tee ──────────────────────────────────────────────

/** A sink that writes nowhere but into a `MessagePart[]`, using the kit's own
 *  builders. Teed alongside the real sink so `ModelTurn.parts` cannot drift from
 *  what the message actually received. */
function createPartsRecorder(): AssistantStreamSink & { parts(): MessagePart[] } {
  let parts: MessagePart[] = [];
  return {
    appendText(delta) {
      parts = appendTextPart(parts, delta);
    },
    appendReasoning(delta, opts) {
      parts = appendReasoningPart(parts, delta, opts);
    },
    upsertTool(toolCallId, patch) {
      parts = upsertToolPart(parts, toolCallId, patch);
    },
    addSource(source) {
      parts = [...parts, { type: 'source', source }];
    },
    parts: () => parts,
  };
}

/** Drive two sinks from one call. `a` (the host's) goes first so the visible
 *  message updates in stream order. */
function teeSink(a: AssistantStreamSink, b: AssistantStreamSink): AssistantStreamSink {
  return {
    appendText(delta) {
      a.appendText(delta);
      b.appendText(delta);
    },
    appendReasoning(delta, opts) {
      a.appendReasoning(delta, opts);
      b.appendReasoning(delta, opts);
    },
    upsertTool(toolCallId, patch) {
      a.upsertTool(toolCallId, patch);
      b.upsertTool(toolCallId, patch);
    },
    addSource(source) {
      a.addSource?.(source);
      b.addSource?.(source);
    },
  };
}

// ── The main loop ────────────────────────────────────────────────────────────

/**
 * Read one turn's worth of `ModelStreamChunk`s and drive `sink` with them.
 *
 * The sink is expected to be the kit's `AssistantStream`, which produces a NEW
 * message object (and a new `parts` array) on every real mutation: that is what
 * makes `<kai-thread>` re-render. This adapter calls the sink once per delta and
 * never batches; batching is a host concern.
 *
 * This is also the escape hatch for a consumer who already has neutral chunks
 * from somewhere else and does not need a WireFormat at all.
 */
export async function consumeModelStream(
  chunks: AsyncIterable<ModelStreamChunk>,
  sink: AssistantStreamSink,
  opts: ConsumeOptions = {},
): Promise<ModelTurn> {
  const label = opts.reasoningLabel ?? 'Thinking';
  const recorder = createPartsRecorder();
  const out = teeSink(sink, recorder);
  const tools = createToolCallAccumulator(out, opts);

  let text = '';
  let reasoning = '';
  let reasoningChunks = 0;
  let chunkCount = 0;
  let finishReason: string | null = null;
  let error: ModelTurn['error'];
  let usage: ModelUsage | undefined;
  const sources: MessageSource[] = [];

  for await (const chunk of chunks) {
    chunkCount++;

    if (chunk.usage) usage = { ...usage, ...chunk.usage };

    if (chunk.error) {
      error = chunk.error;
      if (chunk.finishReason) finishReason = chunk.finishReason;
      break;
    }

    if (chunk.text) {
      text += chunk.text;
      out.appendText(chunk.text);
    }

    // REWORK 1. The spike gated this whole branch on `if (chunk.reasoning)`,
    // which is falsy for ''. That dropped exactly the payloads `raw` exists to
    // preserve: an Anthropic redacted_thinking block (opaque, no readable text,
    // and the docs require sending it back "including any blocks with empty
    // thinking fields") and the assembled block emitted at content_block_stop
    // after signature_delta. Both arrive with no text.
    if (
      chunk.reasoning !== undefined ||
      chunk.reasoningRaw !== undefined ||
      chunk.reasoningSignature !== undefined
    ) {
      const delta = chunk.reasoning ?? '';
      reasoning += delta;
      // Only NON-EMPTY text counts as "reasoning streamed".
      if (delta !== '') reasoningChunks++;
      // `raw` and `signature` are spread in only when present: passing undefined
      // would blank a value an earlier delta already established.
      out.appendReasoning(delta, {
        index: chunk.reasoningIndex ?? 0,
        label,
        ...(chunk.reasoningRaw ? { raw: chunk.reasoningRaw } : {}),
        ...(chunk.reasoningSignature ? { signature: chunk.reasoningSignature } : {}),
      });
    }

    if (chunk.toolCalls) for (const tc of chunk.toolCalls) tools.apply(tc);

    if (chunk.sources) {
      for (const source of chunk.sources) {
        sources.push(source);
        out.addSource?.(source);
      }
    }

    if (chunk.finishReason) finishReason = chunk.finishReason;
  }

  // REWORK 3. `finishReason` is reported verbatim; `stopReason` is what the
  // adapter itself branches on, so no OpenAI literal leaks into adapter logic.
  const stopReason = normalizeStopReason(finishReason) ?? (error ? 'error' : undefined);
  const toolCalls = tools.settle(stopReason, error?.message);

  return {
    parts: recorder.parts(),
    text,
    reasoning,
    toolCalls,
    sources,
    finishReason,
    reasoningChunks,
    chunks: chunkCount,
    ...(stopReason ? { stopReason } : {}),
    ...(error ? { error } : {}),
    ...(usage ? { usage } : {}),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/`
Expected: PASS. 12 SSE tests plus 24 consume tests.

- [ ] **Step 6: Typecheck**

Run: `pnpm exec nx typecheck ui`
Expected: PASS 4/4.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/wire/chunk.ts packages/ui/src/wire/consume.ts \
        packages/ui/src/wire/consume.test.ts packages/ui/src/wire/fixtures/chunks.ts
git commit -m "feat(wire): provider-neutral chunk plus the adapter core

Reasoning is no longer gated on non-empty text, so redacted and assembled
Anthropic blocks keep their round-trip payload. finishReason stays verbatim and
a normalized stopReason carries the branching."
```

---

### Task 5: Streaming tool input and the sink helpers (rework 2)

**Files:**
- Create: `packages/ui/src/wire/sink-helpers.ts`
- Create: `packages/ui/src/wire/tool-streaming.test.ts`

**Interfaces:**
- Consumes: `AssistantStreamSink` from `./chunk`; `consumeModelStream` from `./consume`; `replayChunks` from `./fixtures/chunks`.
- Produces:
  ```ts
  export function applyToolOutput(sink: AssistantStreamSink, toolCallId: string, output: Record<string, unknown>): void;
  export function applyToolFailure(sink: AssistantStreamSink, toolCallId: string, message: string): void;
  export function bufferText(sink: AssistantStreamSink): AssistantStreamSink & { buffered(): string };
  ```
- Later tasks rely on: Task 9 exports all three from the barrel; Task 18's spike loop calls `applyToolOutput` after running a tool locally.

Task 4 already implements rework 2 inside `createToolCallAccumulator.writeArguments`: `rawInput` on every fragment, `input` promoted only on a whole valid parse. This task PROVES that with dedicated tests and adds the three post-execution sink helpers the spike showed were needed.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/wire/tool-streaming.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { consumeModelStream } from './consume';
import { applyToolFailure, applyToolOutput, bufferText } from './sink-helpers';
import type { AssistantStreamSink } from './chunk';
import type { ToolPart } from '../components/tool-types';
import { replayChunks } from './fixtures/chunks';

/** Records every patch, and can replay them into a merged ToolPart the way the
 *  real sink does. */
function toolSink(): AssistantStreamSink & {
  patches: Array<[string, Partial<ToolPart>]>;
  merged(id: string): Partial<ToolPart>;
} {
  const patches: Array<[string, Partial<ToolPart>]> = [];
  return {
    patches,
    merged(id) {
      return patches.filter(([k]) => k === id).reduce((acc, [, p]) => ({ ...acc, ...p }), {});
    },
    appendText: () => undefined,
    appendReasoning: () => undefined,
    upsertTool: (id, patch) => patches.push([id, { ...patch }]),
    addSource: () => undefined,
  };
}

const FRAGMENTS = ['{"ci', 'ty":"Pa', 'ris","un', 'its":"me', 'tric"}'];

const fragmentTurn = () =>
  replayChunks([
    { toolCalls: [{ index: 0, id: 'c1', name: 'get_weather', arguments: '' }] },
    ...FRAGMENTS.map((text) => ({ toolCalls: [{ index: 0, arguments: text }] })),
    { finishReason: 'tool_calls' },
  ]);

describe('streaming tool arguments (rework 2)', () => {
  it('writes rawInput on EVERY fragment', async () => {
    const sink = toolSink();
    await consumeModelStream(fragmentTurn(), sink);
    const rawInputs = sink.patches
      .filter(([id, p]) => id === 'c1' && p.rawInput !== undefined)
      .map(([, p]) => p.rawInput);
    expect(rawInputs).toEqual([
      '{"ci',
      '{"city":"Pa',
      '{"city":"Paris","un',
      '{"city":"Paris","units":"me',
      '{"city":"Paris","units":"metric"}',
      // once more at settle, carrying the final text alongside `raw`
      '{"city":"Paris","units":"metric"}',
    ]);
  });

  it('promotes to input plus input-available only on a whole valid parse', async () => {
    const sink = toolSink();
    await consumeModelStream(fragmentTurn(), sink);
    const withInput = sink.patches.filter(([id, p]) => id === 'c1' && p.input !== undefined);
    // Exactly two: the fragment that completed the object, and the settle patch.
    expect(withInput).toHaveLength(2);
    expect(withInput[0][1].input).toEqual({ city: 'Paris', units: 'metric' });
    expect(withInput[0][1].state).toBe('input-available');
    // Every patch before that one is rawInput-only and leaves the state alone.
    const firstInputAt = sink.patches.indexOf(withInput[0]);
    expect(sink.patches.slice(1, firstInputAt).every(([, p]) => p.input === undefined)).toBe(true);
    expect(sink.patches.slice(1, firstInputAt).every(([, p]) => p.state === undefined)).toBe(true);
  });

  it('flushes buffered fragments when the id arrives after them', async () => {
    const sink = toolSink();
    await consumeModelStream(
      replayChunks([
        { toolCalls: [{ index: 0, name: 'get_weather' }] },
        { toolCalls: [{ index: 0, arguments: '{"city":"Tokyo"}' }] },
        { toolCalls: [{ index: 0, id: 'late_id' }] },
        { finishReason: 'tool_calls' },
      ]),
      sink,
    );
    expect(sink.merged('late_id').rawInput).toBe('{"city":"Tokyo"}');
    expect(sink.merged('late_id').input).toEqual({ city: 'Tokyo' });
  });

  it('keeps rawInput on a call whose arguments never parse', async () => {
    const sink = toolSink();
    const turn = await consumeModelStream(
      replayChunks([
        { toolCalls: [{ index: 0, id: 'c1', name: 'propose_action', arguments: '{"title":"Deploy' }] },
        { finishReason: 'length' },
      ]),
      sink,
    );
    expect(sink.merged('c1').rawInput).toBe('{"title":"Deploy');
    expect(sink.merged('c1').state).toBe('output-error');
    expect(sink.merged('c1').input).toBeUndefined();
    expect(turn.toolCalls[0].error).toContain('token limit');
  });

  it('repairs the panel type when the tool name arrives split across fragments', async () => {
    const sink = toolSink();
    await consumeModelStream(
      replayChunks([
        { toolCalls: [{ index: 0, id: 'c1', name: 'get_' }] },
        { toolCalls: [{ index: 0, name: 'weather' }] },
        { toolCalls: [{ index: 0, arguments: '{}' }] },
        { finishReason: 'tool_calls' },
      ]),
      sink,
    );
    expect(sink.merged('c1').type).toBe('get_weather');
  });
});

describe('sink helpers', () => {
  it('applyToolOutput completes a panel with the host result', () => {
    const sink = toolSink();
    applyToolOutput(sink, 'c1', { tempC: 18 });
    expect(sink.patches).toEqual([['c1', { state: 'output-available', output: { tempC: 18 } }]]);
  });

  it('applyToolFailure marks a panel failed with a message', () => {
    const sink = toolSink();
    applyToolFailure(sink, 'c1', 'the API returned 500');
    expect(sink.patches).toEqual([
      ['c1', { state: 'output-error', errorText: 'the API returned 500' }],
    ]);
  });

  it('bufferText swallows text and hands it back, forwarding everything else', async () => {
    const sink = toolSink();
    const buffered = bufferText(sink);
    const turn = await consumeModelStream(
      replayChunks([
        { text: '{"reply":"hi"' },
        { text: '}' },
        { reasoning: 'thinking', reasoningIndex: 0 },
        { toolCalls: [{ index: 0, id: 'c1', name: 'noop', arguments: '{}' }] },
        { finishReason: 'stop' },
      ]),
      buffered,
    );
    expect(buffered.buffered()).toBe('{"reply":"hi"}');
    // Tools still reached the underlying sink.
    expect(sink.patches.some(([id]) => id === 'c1')).toBe(true);
    // The TURN still reports the text: `parts` describes what the model
    // produced, not what the host chose to display.
    expect(turn.text).toBe('{"reply":"hi"}');
    expect(turn.parts.some((p) => p.type === 'text')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/tool-streaming.test.ts`
Expected: FAIL, cannot resolve `./sink-helpers`. Once that import resolves the `streaming tool arguments` block must pass unchanged, because Task 4 implemented the behaviour. If any of those five fails, Task 4's `writeArguments` is wrong; fix it there before continuing.

- [ ] **Step 3: Write `wire/sink-helpers.ts`**

```ts
// Post-execution helpers. The kit NEVER calls a consumer's function, so a host
// runs its own tools and reports the result back through these.
import type { AssistantStreamSink } from './chunk';

/** Mark a tool call's panel done with the result the host computed. */
export function applyToolOutput(
  sink: AssistantStreamSink,
  toolCallId: string,
  output: Record<string, unknown>,
): void {
  sink.upsertTool(toolCallId, { state: 'output-available', output });
}

/** Mark a tool call's panel failed. */
export function applyToolFailure(
  sink: AssistantStreamSink,
  toolCallId: string,
  message: string,
): void {
  sink.upsertTool(toolCallId, { state: 'output-error', errorText: message });
}

/**
 * A sink wrapper that swallows text instead of appending it, and hands the
 * buffered text back at the end.
 *
 * Needed for STRUCTURED OUTPUTS: when `response_format` is a JSON schema the
 * assistant's whole message is raw JSON, so streaming it into `<kai-thread>`
 * shows the user a wall of braces. Buffer, parse, then `appendText` the human
 * part, which behaves as a SET because nothing text-shaped ever reached the
 * message (the kit has no replace-the-text operation; `appendTextPart` only ever
 * extends or opens a text part).
 *
 * Reasoning, tools and sources pass straight through. Only text is held back.
 */
export function bufferText(
  sink: AssistantStreamSink,
): AssistantStreamSink & { buffered(): string } {
  let buf = '';
  return {
    appendText(delta) {
      buf += delta;
      return undefined;
    },
    appendReasoning: (delta, opts) => sink.appendReasoning(delta, opts),
    upsertTool: (id, patch) => sink.upsertTool(id, patch),
    addSource: (source) => sink.addSource?.(source),
    buffered: () => buf,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec nx typecheck ui`
Expected: PASS 4/4.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/wire/sink-helpers.ts packages/ui/src/wire/tool-streaming.test.ts
git commit -m "feat(wire): stream tool rawInput per fragment plus the post-execution sink helpers"
```

---

### Task 6: `openaiChatFormat`

**Files:**
- Create: `packages/ui/src/wire/formats/openai.ts`
- Create: `packages/ui/src/wire/formats/openai.test.ts`

**Interfaces:**
- Consumes: `ModelStreamChunk`, `ModelToolCallDelta`, `ModelUsage`, `WireFormat`, `WireFormatReader` from `../chunk`; `MessageSource` from `../../elements/chat-types`.
- Produces: `export const openaiChatFormat: WireFormat` whose `id` is `'openai.chat-completions'`.
- Later tasks rely on: Task 8's `readOpenAIStream` passes it as `opts.format`; Task 11's fixtures replay through it; Task 9 re-exports it.

`push` takes an ALREADY DECODED frame typed `unknown`. It must never throw: it validates every field it reads and returns `[]` for a frame it does not recognise.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/wire/formats/openai.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { openaiChatFormat } from './openai';

const push = (frame: unknown) => openaiChatFormat.open().push(frame);

describe('openaiChatFormat', () => {
  it('has a stable id', () => {
    expect(openaiChatFormat.id).toBe('openai.chat-completions');
  });

  it('maps a content delta to text', () => {
    expect(push({ choices: [{ delta: { content: 'Hello' } }] })).toEqual([{ text: 'Hello' }]);
  });

  it('maps finish_reason verbatim', () => {
    expect(push({ choices: [{ delta: {}, finish_reason: 'length' }] })).toEqual([
      { finishReason: 'length' },
    ]);
  });

  it('maps usage, including reasoning tokens, cached tokens and cost', () => {
    expect(
      push({
        choices: [],
        usage: {
          prompt_tokens: 640,
          completion_tokens: 71,
          total_tokens: 711,
          completion_tokens_details: { reasoning_tokens: 38 },
          prompt_tokens_details: { cached_tokens: 512 },
          cost: 0.000081,
        },
      }),
    ).toEqual([
      {
        usage: {
          inputTokens: 640,
          outputTokens: 71,
          totalTokens: 711,
          reasoningTokens: 38,
          cachedInputTokens: 512,
          costUsd: 0.000081,
        },
      },
    ]);
  });

  it('maps tool_call fragments, keeping the array index as the correlator', () => {
    expect(
      push({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_a', function: { name: 'get_weather', arguments: '' } },
                { index: 1, function: { arguments: '{"ci' } },
              ],
            },
          },
        ],
      }),
    ).toEqual([
      {
        toolCalls: [
          { index: 0, id: 'call_a', name: 'get_weather', arguments: '' },
          { index: 1, arguments: '{"ci' },
        ],
      },
    ]);
  });

  it('prefers `reasoning` over `reasoning_details` text (the doubling trap)', () => {
    const out = push({
      choices: [
        {
          delta: {
            reasoning: 'Weighing options.',
            reasoning_details: [{ type: 'reasoning.text', text: 'Weighing options.', index: 0 }],
          },
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].reasoning).toBe('Weighing options.');
    expect(out[0].reasoningIndex).toBe(0);
    expect(out[0].reasoningRaw).toEqual({
      source: 'openai.reasoning_details',
      payload: [{ type: 'reasoning.text', text: 'Weighing options.', index: 0 }],
    });
  });

  it('falls back to reasoning_details text when `reasoning` is absent or empty', () => {
    expect(
      push({ choices: [{ delta: { reasoning_details: [{ type: 'reasoning.text', text: 'abc' }] } }] })[0]
        .reasoning,
    ).toBe('abc');
    expect(
      push({
        choices: [
          { delta: { reasoning: '', reasoning_details: [{ type: 'reasoning.text', text: 'abc' }] } },
        ],
      })[0].reasoning,
    ).toBe('abc');
  });

  it('emits an EMPTY reasoning delta for an encrypted-only detail entry', () => {
    // No readable text, but a payload that must round-trip. This is exactly the
    // case the old `if (chunk.reasoning)` guard threw away.
    const out = push({
      choices: [
        { delta: { reasoning_details: [{ type: 'reasoning.encrypted', data: 'EroBCkYIA==' }] } },
      ],
    });
    expect(out[0].reasoning).toBe('');
    expect(out[0].reasoningRaw?.payload).toEqual([
      { type: 'reasoning.encrypted', data: 'EroBCkYIA==' },
    ]);
  });

  it('carries a signature off a reasoning detail', () => {
    const out = push({
      choices: [
        { delta: { reasoning_details: [{ type: 'reasoning.text', text: 'x', signature: 'SIG' }] } },
      ],
    });
    expect(out[0].reasoningSignature).toBe('SIG');
  });

  it('maps url_citation annotations to sources', () => {
    const out = push({
      choices: [
        {
          delta: {
            annotations: [
              { type: 'url_citation', url_citation: { url: 'https://a', title: 'A', content: 'snip' } },
              { type: 'url_citation' },
            ],
          },
        },
      ],
    });
    expect(out[0].sources).toEqual([{ url: 'https://a', title: 'A', snippet: 'snip' }]);
  });

  it('maps an in-band error frame', () => {
    expect(push({ error: { code: 'server_error', message: 'upstream dropped' } })).toEqual([
      { error: { message: 'upstream dropped', code: 'server_error' } },
    ]);
  });

  it('returns [] for frames that carry nothing, and never throws', () => {
    expect(push({ choices: [{ delta: { role: 'assistant' } }] })).toEqual([]);
    expect(push({ choices: [] })).toEqual([]);
    expect(push({})).toEqual([]);
    expect(push(null)).toEqual([]);
    expect(push('not an object')).toEqual([]);
    expect(push({ choices: [{ delta: { content: null } }] })).toEqual([]);
    expect(push({ object: 'chat.completion.chunk', system_fingerprint: 'fp_x' })).toEqual([]);
  });

  it('is stateless: two readers share nothing', () => {
    const a = openaiChatFormat.open();
    const b = openaiChatFormat.open();
    a.push({ choices: [{ delta: { content: 'one' } }] });
    expect(b.push({ choices: [{ delta: { content: 'two' } }] })).toEqual([{ text: 'two' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/formats/openai.test.ts`
Expected: FAIL, cannot resolve `./openai`.

- [ ] **Step 3: Write the format**

Create `packages/ui/src/wire/formats/openai.ts`:

```ts
// OpenAI chat-completions SSE. Also the shape every non-mock integration in the
// kit's catalog re-frames to server-side, so this one decoder covers all nine.
//
// Input is an ALREADY DECODED JSON frame typed `unknown`. Nothing here imports a
// provider SDK, and nothing here throws: a frame this format does not recognise
// yields [] so a provider adding a field cannot take a turn down.
import type { MessageSource } from '../../elements/chat-types';
import type {
  ModelStreamChunk,
  ModelToolCallDelta,
  ModelUsage,
  WireFormat,
  WireFormatReader,
} from '../chunk';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function usageOf(raw: unknown): ModelUsage | undefined {
  if (!isRecord(raw)) return undefined;
  const out: ModelUsage = {};
  const input = num(raw.prompt_tokens);
  if (input !== undefined) out.inputTokens = input;
  const output = num(raw.completion_tokens);
  if (output !== undefined) out.outputTokens = output;
  const total = num(raw.total_tokens);
  if (total !== undefined) out.totalTokens = total;
  const details = raw.completion_tokens_details;
  if (isRecord(details)) {
    // The one number that proves reasoning happened even when no reasoning text
    // was streamed back.
    const reasoning = num(details.reasoning_tokens);
    if (reasoning !== undefined) out.reasoningTokens = reasoning;
  }
  const promptDetails = raw.prompt_tokens_details;
  if (isRecord(promptDetails)) {
    const cached = num(promptDetails.cached_tokens);
    if (cached !== undefined) out.cachedInputTokens = cached;
  }
  const cost = num(raw.cost);
  if (cost !== undefined) out.costUsd = cost;
  return Object.keys(out).length > 0 ? out : undefined;
}

function toolCallDelta(raw: unknown, position: number): ModelToolCallDelta | undefined {
  if (!isRecord(raw)) return undefined;
  const fn = isRecord(raw.function) ? raw.function : undefined;
  const out: ModelToolCallDelta = { index: num(raw.index) ?? position };
  const id = str(raw.id);
  if (id) out.id = id;
  const name = str(fn?.name);
  if (name) out.name = name;
  const args = str(fn?.arguments);
  if (args !== undefined) out.arguments = args;
  return out;
}

/** Sum the READABLE text across reasoning_details entries. Entries with no
 *  readable text (`reasoning.encrypted`, opaque signed blobs) contribute nothing
 *  here; they still ride along whole in `reasoningRaw`. */
function detailText(details: unknown[]): string {
  let out = '';
  for (const d of details) {
    if (!isRecord(d)) continue;
    const text = str(d.text) ?? str(d.summary);
    if (text) out += text;
  }
  return out;
}

function detailField(details: unknown[], key: 'index' | 'signature'): unknown {
  for (const d of details) {
    if (isRecord(d) && d[key] !== undefined) return d[key];
  }
  return undefined;
}

/**
 * FINDINGS: OpenRouter frequently puts the SAME text in `reasoning` AND in
 * `reasoning_details` on the same delta. Concatenating both doubles every
 * reasoning token, so `reasoning` wins and details are only a text FALLBACK.
 *
 * `reasoning_details` is still read in BOTH cases, for `reasoningRaw`, the block
 * index and the signature. It is the provider's own block list, and dropping it
 * is exactly the Anthropic 400 this entry exists to avoid.
 */
function applyReasoning(delta: Record<string, unknown>, out: ModelStreamChunk): void {
  const details = Array.isArray(delta.reasoning_details) ? delta.reasoning_details : undefined;
  const primaryRaw = str(delta.reasoning);
  const primary = primaryRaw !== undefined && primaryRaw !== '' ? primaryRaw : undefined;
  const fallback = details ? detailText(details) : undefined;
  const hasDetails = details !== undefined && details.length > 0;
  const text = primary ?? fallback;
  if (text === undefined && !hasDetails) return;

  // '' is deliberate and meaningful: an encrypted-only detail entry has no
  // readable text but must still produce a reasoning part carrying its payload.
  out.reasoning = text ?? '';
  if (!hasDetails) return;

  out.reasoningRaw = { source: 'openai.reasoning_details', payload: details };
  const index = num(detailField(details, 'index'));
  if (index !== undefined) out.reasoningIndex = index;
  const signature = str(detailField(details, 'signature'));
  if (signature !== undefined) out.reasoningSignature = signature;
}

function sourcesOf(delta: Record<string, unknown>): MessageSource[] {
  if (!Array.isArray(delta.annotations)) return [];
  const out: MessageSource[] = [];
  for (const a of delta.annotations) {
    if (!isRecord(a)) continue;
    const citation = isRecord(a.url_citation) ? a.url_citation : undefined;
    const url = str(citation?.url);
    if (!url) continue;
    const source: MessageSource = { url };
    const title = str(citation?.title);
    if (title) source.title = title;
    const snippet = str(citation?.content);
    if (snippet) source.snippet = snippet;
    out.push(source);
  }
  return out;
}

function pushOpenAI(frame: unknown): ModelStreamChunk[] {
  if (!isRecord(frame)) return [];
  const out: ModelStreamChunk = {};

  const err = frame.error;
  if (isRecord(err)) {
    const message = str(err.message);
    if (message) {
      out.error = { message };
      const code = err.code;
      if (typeof code === 'string' || typeof code === 'number') out.error.code = code;
    }
  }

  const usage = usageOf(frame.usage);
  if (usage) out.usage = usage;

  const choices = Array.isArray(frame.choices) ? frame.choices : [];
  const choice = isRecord(choices[0]) ? choices[0] : undefined;
  if (choice) {
    const delta = isRecord(choice.delta) ? choice.delta : undefined;
    if (delta) {
      const content = str(delta.content);
      if (content) out.text = content;

      applyReasoning(delta, out);

      if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
        const calls = delta.tool_calls
          .map((raw, i) => toolCallDelta(raw, i))
          .filter((c): c is ModelToolCallDelta => c !== undefined);
        if (calls.length > 0) out.toolCalls = calls;
      }

      const sources = sourcesOf(delta);
      if (sources.length > 0) out.sources = sources;
    }
    const finish = str(choice.finish_reason);
    if (finish) out.finishReason = finish;
  }

  return Object.keys(out).length > 0 ? [out] : [];
}

/** Stateless: every frame is self-describing, so `open()` returns a reader with
 *  no closure state. The interface still calls it per stream, which is what lets
 *  the stateful Anthropic format use the same seam. */
export const openaiChatFormat: WireFormat = {
  id: 'openai.chat-completions',
  open(): WireFormatReader {
    return { push: pushOpenAI };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/`
Expected: PASS, 13 new tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec nx typecheck ui`
Expected: PASS 4/4.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/wire/formats/openai.ts packages/ui/src/wire/formats/openai.test.ts
git commit -m "feat(wire): openaiChatFormat, with the reasoning_details doubling trap handled"
```

---

### Task 7: `anthropicMessagesFormat`

**Files:**
- Create: `packages/ui/src/wire/formats/anthropic.ts`
- Create: `packages/ui/src/wire/formats/anthropic.test.ts`

**Interfaces:**
- Consumes: `ModelStreamChunk`, `ModelUsage`, `WireFormat`, `WireFormatReader` from `../chunk`; `MessageSource` from `../../elements/chat-types`.
- Produces: `export const anthropicMessagesFormat: WireFormat` whose `id` is `'anthropic.messages'`.
- Later tasks rely on: Task 8's `readAnthropicStream`; Task 12's fixtures; Task 15's round-trip test, which asserts the `anthropic.content_block` payloads this format emits survive `toAnthropicMessages` byte for byte.

**This task REQUIRES Task 4's reasoning guard already landed.** The format emits reasoning chunks with no text at three points (a `content_block_start` for `thinking`, every `signature_delta`, and every `content_block_stop` for a thinking block). Under the old `if (chunk.reasoning)` guard all three are dropped and the round-trip payload never reaches the part.

Anthropic needs per-stream state and OpenAI does not. `content_block_delta` says `thinking_delta` or `input_json_delta` but not which BLOCK KIND a fragment belongs to, so the format keeps a `Map<index, BlockState>` populated at `content_block_start`. A second map routes `web_search_tool_result` back to the block index of the `server_tool_use` that opened the call, because that result correlates by `tool_use_id`, not by its own block index.

Our `sseDataFrames` drops `event:` lines. That is fine and deliberate: Anthropic repeats the same discriminator inside the JSON as `type`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/wire/formats/anthropic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { anthropicMessagesFormat } from './anthropic';
import type { ModelStreamChunk } from '../chunk';

/** Drive a whole event sequence through ONE reader and flatten the chunks. */
function run(frames: unknown[]): ModelStreamChunk[] {
  const reader = anthropicMessagesFormat.open();
  return frames.flatMap((f) => reader.push(f));
}

describe('anthropicMessagesFormat', () => {
  it('has a stable id', () => {
    expect(anthropicMessagesFormat.id).toBe('anthropic.messages');
  });

  it('maps message_start usage', () => {
    expect(
      run([
        {
          type: 'message_start',
          message: { id: 'msg_1', role: 'assistant', usage: { input_tokens: 40, output_tokens: 1, cache_read_input_tokens: 12 } },
        },
      ]),
    ).toEqual([{ usage: { inputTokens: 40, outputTokens: 1, cachedInputTokens: 12 } }]);
  });

  it('maps a text block through its deltas', () => {
    expect(
      run([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' there' } },
        { type: 'content_block_stop', index: 0 },
      ]),
    ).toEqual([{ text: 'Hello' }, { text: ' there' }]);
  });

  it('opens a reasoning part at content_block_start so block ORDER survives', () => {
    const out = run([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    ]);
    expect(out).toEqual([{ reasoning: '', reasoningIndex: 0 }]);
  });

  it('assembles a thinking block and emits it VERBATIM at content_block_stop', () => {
    const out = run([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Let me work ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'through this.' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'ErUBCkY' } },
      { type: 'content_block_stop', index: 0 },
    ]);
    expect(out.map((c) => c.reasoning)).toEqual(['', 'Let me work ', 'through this.', '', '']);
    expect(out[3].reasoningSignature).toBe('ErUBCkY');
    expect(out[4].reasoningRaw).toEqual({
      source: 'anthropic.content_block',
      payload: { type: 'thinking', thinking: 'Let me work through this.', signature: 'ErUBCkY' },
    });
  });

  it('emits a redacted_thinking block whole at content_block_start', () => {
    const block = { type: 'redacted_thinking', data: 'EroBCkYIARgCIkDx1VzGxQ==' };
    const out = run([{ type: 'content_block_start', index: 1, content_block: block }]);
    expect(out).toEqual([
      {
        reasoning: '',
        reasoningIndex: 1,
        reasoningRaw: { source: 'anthropic.content_block', payload: block },
      },
    ]);
  });

  it('emits nothing extra at content_block_stop for a redacted block', () => {
    const block = { type: 'redacted_thinking', data: 'EroB' };
    const out = run([
      { type: 'content_block_start', index: 0, content_block: block },
      { type: 'content_block_stop', index: 0 },
    ]);
    expect(out).toHaveLength(1);
  });

  it('maps a tool_use block through input_json_delta', () => {
    expect(
      run([
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_01', name: 'get_weather', input: {} },
        },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"ci' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'ty":"Paris"}' } },
        { type: 'content_block_stop', index: 1 },
      ]),
    ).toEqual([
      { toolCalls: [{ index: 1, id: 'toolu_01', name: 'get_weather' }] },
      { toolCalls: [{ index: 1, arguments: '{"ci' }] },
      { toolCalls: [{ index: 1, arguments: 'ty":"Paris"}' }] },
    ]);
  });

  it('routes a web_search_tool_result back to its server_tool_use block index', () => {
    const out = run([
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'server_tool_use', id: 'srvtoolu_01', name: 'web_search' },
      },
      {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_01',
          content: [{ title: 'AI/UI', url: 'https://ui.kitn.ai' }],
        },
      },
    ]);
    expect(out[1]).toEqual({
      toolCalls: [
        {
          index: 0,
          id: 'srvtoolu_01',
          output: { content: [{ title: 'AI/UI', url: 'https://ui.kitn.ai' }] },
        },
      ],
    });
  });

  it('reports a failed provider-executed search as outputError', () => {
    const out = run([
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'server_tool_use', id: 'srvtoolu_01', name: 'web_search' },
      },
      {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_01',
          content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
        },
      },
    ]);
    expect(out[1].toolCalls?.[0].outputError).toBe('max_uses_exceeded');
  });

  it('maps a citations_delta to a source', () => {
    expect(
      run([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'citations_delta',
            citation: { type: 'web_search_result_location', url: 'https://a', title: 'A', cited_text: 'snip' },
          },
        },
      ]),
    ).toEqual([{ sources: [{ url: 'https://a', title: 'A', snippet: 'snip' }] }]);
  });

  it('maps message_delta stop_reason verbatim plus its usage', () => {
    expect(
      run([{ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 71 } }]),
    ).toEqual([{ finishReason: 'tool_use', usage: { outputTokens: 71 } }]);
  });

  it('maps an error frame', () => {
    expect(
      run([{ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]),
    ).toEqual([{ error: { message: 'Overloaded', code: 'overloaded_error' } }]);
  });

  it('ignores ping, message_stop and any unrecognized event without throwing', () => {
    expect(run([{ type: 'ping' }, { type: 'message_stop' }, { type: 'something_new_2027' }])).toEqual([]);
    expect(anthropicMessagesFormat.open().push(null)).toEqual([]);
    expect(anthropicMessagesFormat.open().push('not an object')).toEqual([]);
    expect(anthropicMessagesFormat.open().push({ type: 'content_block_delta', index: 0 })).toEqual([]);
  });

  it('is stateful per open(): two readers share nothing', () => {
    const a = anthropicMessagesFormat.open();
    const b = anthropicMessagesFormat.open();
    a.push({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } });
    a.push({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'from A' } });
    // b never saw a content_block_start, so it has no block state to leak into.
    expect(b.push({ type: 'content_block_stop', index: 0 })).toEqual([]);
    // and a still has its own.
    expect(a.push({ type: 'content_block_stop', index: 0 })[0].reasoningRaw?.payload).toEqual({
      type: 'thinking',
      thinking: 'from A',
    });
  });

  it('keeps parallel thinking blocks on distinct indexes', () => {
    const out = run([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'second' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'first' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_stop', index: 1 },
    ]);
    const stops = out.filter((c) => c.reasoningRaw);
    expect(stops[0].reasoningIndex).toBe(0);
    expect(stops[0].reasoningRaw?.payload).toEqual({ type: 'thinking', thinking: 'first' });
    expect(stops[1].reasoningIndex).toBe(1);
    expect(stops[1].reasoningRaw?.payload).toEqual({ type: 'thinking', thinking: 'second' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/formats/anthropic.test.ts`
Expected: FAIL, cannot resolve `./anthropic`.

- [ ] **Step 3: Write the format**

Create `packages/ui/src/wire/formats/anthropic.ts`:

```ts
// Anthropic Messages SSE.
//
// This format is STATEFUL. `content_block_delta` names the delta kind
// (`thinking_delta`, `input_json_delta`, ...) but not which block kind the
// fragment belongs to, so the block map is populated at `content_block_start`
// and read on every later event for that index.
//
// It is also the only format in the kit carrying a VERBATIM requirement:
// Anthropic returns 400 if a `thinking` block is modified, reordered or
// reconstructed on the way back in. The block emitted at `content_block_stop`
// is ASSEMBLED, not invented: `thinking` is the concatenation of the provider's
// own thinking_delta payloads and `signature` is the provider's signature_delta,
// so every byte came off the wire. Nothing is derived from the reasoning PART's
// text, which a consumer can edit.
//
// Three of the chunks below carry NO reasoning text (the block start, every
// signature_delta, the block stop). They depend on consume.ts gating reasoning
// on `reasoning !== undefined || reasoningRaw || reasoningSignature` rather than
// on truthiness. Under the old guard all three vanish.
import type { MessageSource } from '../../elements/chat-types';
import type { ModelStreamChunk, ModelUsage, WireFormat, WireFormatReader } from '../chunk';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

type BlockKind = 'text' | 'thinking' | 'redacted_thinking' | 'tool_use' | 'other';

interface BlockState {
  kind: BlockKind;
  /** Accumulated thinking_delta payloads, for the verbatim block at stop. */
  thinking: string;
  /** Accumulated signature_delta payloads. */
  signature?: string;
}

function usageOf(raw: unknown): ModelUsage | undefined {
  if (!isRecord(raw)) return undefined;
  const out: ModelUsage = {};
  const input = num(raw.input_tokens);
  if (input !== undefined) out.inputTokens = input;
  const output = num(raw.output_tokens);
  if (output !== undefined) out.outputTokens = output;
  const cached = num(raw.cache_read_input_tokens);
  if (cached !== undefined) out.cachedInputTokens = cached;
  return Object.keys(out).length > 0 ? out : undefined;
}

function blockStart(
  frame: Record<string, unknown>,
  blocks: Map<number, BlockState>,
  toolIndexById: Map<string, number>,
): ModelStreamChunk[] {
  const index = num(frame.index) ?? 0;
  const block = frame.content_block;
  if (!isRecord(block)) return [];

  switch (str(block.type)) {
    case 'text': {
      blocks.set(index, { kind: 'text', thinking: '' });
      const text = str(block.text);
      return text ? [{ text }] : [];
    }
    case 'thinking': {
      const seed = str(block.thinking) ?? '';
      blocks.set(index, { kind: 'thinking', thinking: seed });
      // An EMPTY reasoning delta on purpose: it opens the reasoning part at the
      // point in the stream where the block started, so block order in `parts`
      // matches block order on the wire. The encoder round-trips that order.
      return [{ reasoning: seed, reasoningIndex: index }];
    }
    case 'redacted_thinking': {
      blocks.set(index, { kind: 'redacted_thinking', thinking: '' });
      // The WHOLE block arrives here; there are no deltas and there is no
      // readable text. It must still round-trip: the docs require sending back
      // every block "including any blocks with empty thinking fields".
      return [
        {
          reasoning: '',
          reasoningIndex: index,
          reasoningRaw: { source: 'anthropic.content_block', payload: block },
        },
      ];
    }
    case 'tool_use':
    case 'server_tool_use': {
      const id = str(block.id);
      const name = str(block.name);
      blocks.set(index, { kind: 'tool_use', thinking: '' });
      if (id) toolIndexById.set(id, index);
      return [{ toolCalls: [{ index, ...(id ? { id } : {}), ...(name ? { name } : {}) }] }];
    }
    case 'web_search_tool_result': {
      // A result the PROVIDER executed. It correlates by `tool_use_id`, NOT by
      // its own block index, so it is routed back to the index of the
      // server_tool_use block that opened the call. With no such block the
      // result has nothing to complete and is dropped rather than inventing a
      // panel.
      blocks.set(index, { kind: 'other', thinking: '' });
      const toolUseId = str(block.tool_use_id);
      const target = toolUseId !== undefined ? toolIndexById.get(toolUseId) : undefined;
      if (target === undefined) return [];
      const content = block.content;
      if (isRecord(content) && (str(content.type) ?? '').endsWith('_error')) {
        return [
          {
            toolCalls: [
              {
                index: target,
                ...(toolUseId ? { id: toolUseId } : {}),
                outputError: str(content.error_code) ?? 'web_search_tool_result_error',
              },
            ],
          },
        ];
      }
      return [
        {
          toolCalls: [
            { index: target, ...(toolUseId ? { id: toolUseId } : {}), output: { content } },
          ],
        },
      ];
    }
    default:
      blocks.set(index, { kind: 'other', thinking: '' });
      return [];
  }
}

function blockDelta(
  frame: Record<string, unknown>,
  blocks: Map<number, BlockState>,
): ModelStreamChunk[] {
  const index = num(frame.index) ?? 0;
  const delta = frame.delta;
  if (!isRecord(delta)) return [];

  switch (str(delta.type)) {
    case 'text_delta': {
      const text = str(delta.text);
      return text ? [{ text }] : [];
    }
    case 'thinking_delta': {
      const text = str(delta.thinking) ?? '';
      const state = blocks.get(index);
      if (state) state.thinking += text;
      return [{ reasoning: text, reasoningIndex: index }];
    }
    case 'signature_delta': {
      const signature = str(delta.signature) ?? '';
      const state = blocks.get(index);
      // Concatenated rather than assigned: a split signature must reassemble.
      if (state) state.signature = (state.signature ?? '') + signature;
      // No text. Carried so the part's informational `signature` is populated;
      // the round-trip payload lands at content_block_stop.
      return [{ reasoning: '', reasoningIndex: index, reasoningSignature: signature }];
    }
    case 'input_json_delta': {
      return [{ toolCalls: [{ index, arguments: str(delta.partial_json) ?? '' }] }];
    }
    case 'citations_delta': {
      const citation = delta.citation;
      if (!isRecord(citation)) return [];
      const source: MessageSource = {};
      const url = str(citation.url);
      if (url) source.url = url;
      const title = str(citation.title);
      if (title) source.title = title;
      const snippet = str(citation.cited_text);
      if (snippet) source.snippet = snippet;
      return Object.keys(source).length > 0 ? [{ sources: [source] }] : [];
    }
    default:
      return [];
  }
}

function blockStop(
  frame: Record<string, unknown>,
  blocks: Map<number, BlockState>,
): ModelStreamChunk[] {
  const index = num(frame.index) ?? 0;
  const state = blocks.get(index);
  // Only a streamed `thinking` block needs assembling. `redacted_thinking`
  // already emitted its whole payload at start, and text and tool blocks have
  // no verbatim requirement.
  if (!state || state.kind !== 'thinking') return [];
  const payload: Record<string, unknown> = { type: 'thinking', thinking: state.thinking };
  if (state.signature !== undefined) payload.signature = state.signature;
  return [
    {
      reasoning: '',
      reasoningIndex: index,
      reasoningRaw: { source: 'anthropic.content_block', payload },
    },
  ];
}

function messageDelta(frame: Record<string, unknown>): ModelStreamChunk[] {
  const out: ModelStreamChunk = {};
  const delta = frame.delta;
  if (isRecord(delta)) {
    const stop = str(delta.stop_reason);
    if (stop) out.finishReason = stop;
  }
  const usage = usageOf(frame.usage);
  if (usage) out.usage = usage;
  return Object.keys(out).length > 0 ? [out] : [];
}

function errorFrame(frame: Record<string, unknown>): ModelStreamChunk[] {
  const err = frame.error;
  const message = isRecord(err) ? str(err.message) : undefined;
  const code = isRecord(err) ? str(err.type) : undefined;
  return [
    {
      error: {
        message: message ?? 'The provider sent an error frame with no message.',
        ...(code ? { code } : {}),
      },
    },
  ];
}

export const anthropicMessagesFormat: WireFormat = {
  id: 'anthropic.messages',
  open(): WireFormatReader {
    // Per-stream state, created HERE so two open() calls share nothing.
    const blocks = new Map<number, BlockState>();
    const toolIndexById = new Map<string, number>();
    return {
      push(frame: unknown): ModelStreamChunk[] {
        if (!isRecord(frame)) return [];
        switch (str(frame.type)) {
          case 'message_start': {
            const message = frame.message;
            if (!isRecord(message)) return [];
            const usage = usageOf(message.usage);
            return usage ? [{ usage }] : [];
          }
          case 'content_block_start':
            return blockStart(frame, blocks, toolIndexById);
          case 'content_block_delta':
            return blockDelta(frame, blocks);
          case 'content_block_stop':
            return blockStop(frame, blocks);
          case 'message_delta':
            return messageDelta(frame);
          case 'error':
            return errorFrame(frame);
          default:
            // ping, message_stop, and anything Anthropic adds later.
            return [];
        }
      },
    };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/`
Expected: PASS, 16 new tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec nx typecheck ui`
Expected: PASS 4/4.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/wire/formats/anthropic.ts packages/ui/src/wire/formats/anthropic.test.ts
git commit -m "feat(wire): anthropicMessagesFormat with verbatim thinking-block assembly"
```

---

### Task 8: `readModelStream`, the named readers and `WireError`

**Files:**
- Create: `packages/ui/src/wire/read.ts`
- Create: `packages/ui/src/wire/read.test.ts`

**Interfaces:**
- Consumes: `sseJson`, `type ByteSource` from `./sse`; `consumeModelStream` from `./consume`; `ConsumeOptions`, `AssistantStreamSink`, `ModelTurn`, `WireFormat` from `./chunk`; `openaiChatFormat` from `./formats/openai`; `anthropicMessagesFormat` from `./formats/anthropic`.
- Produces:
  ```ts
  export type StreamSource = Response | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string>;
  export class WireError extends Error { readonly status: number; readonly statusText: string; readonly body: unknown; readonly bodyText: string }
  export function readModelStream(source: StreamSource, sink: AssistantStreamSink, opts: ConsumeOptions & { format: WireFormat }): Promise<ModelTurn>;
  export function readOpenAIStream(source: StreamSource, sink: AssistantStreamSink, opts?: ConsumeOptions): Promise<ModelTurn>;
  export function readAnthropicStream(source: StreamSource, sink: AssistantStreamSink, opts?: ConsumeOptions): Promise<ModelTurn>;
  ```
- Later tasks rely on: Task 9 exports all of these; Tasks 11 to 13 replay fixtures through `readOpenAIStream` / `readAnthropicStream`; Tasks 16 to 18 call `readOpenAIStream` from scaffolded code, docs and the spike.

The kit parses; the consumer fetches. `StreamSource` is the whole transport surface. No retries, no reconnect, no `Last-Event-ID`, no backoff, no `AbortSignal` parameter: aborting is the consumer's `fetch` call.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/wire/read.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WireError, readAnthropicStream, readModelStream, readOpenAIStream } from './read';
import { openaiChatFormat } from './formats/openai';
import type { AssistantStreamSink } from './chunk';

const nullSink = (): AssistantStreamSink => ({
  appendText: () => undefined,
  appendReasoning: () => undefined,
  upsertTool: () => undefined,
  addSource: () => undefined,
});

async function* bytes(text: string, size = 17): AsyncGenerator<Uint8Array> {
  const buf = new TextEncoder().encode(text);
  for (let i = 0; i < buf.length; i += size) {
    yield buf.subarray(i, Math.min(i + size, buf.length));
    await Promise.resolve();
  }
}

function readable(text: string, size = 17): ReadableStream<Uint8Array> {
  const it = bytes(text, size)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
  });
}

const OPENAI_SSE =
  ': OPENROUTER PROCESSING\n\n' +
  'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
  'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n' +
  'data: [DONE]\n\n';

const ANTHROPIC_SSE =
  'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":9}}}\n\n' +
  'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n' +
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n' +
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n' +
  'event: message_stop\ndata: {"type":"message_stop"}\n\n';

describe('readOpenAIStream', () => {
  it('reads an AsyncIterable of bytes', async () => {
    const turn = await readOpenAIStream(bytes(OPENAI_SSE), nullSink());
    expect(turn.text).toBe('Hello world');
    expect(turn.finishReason).toBe('stop');
    expect(turn.stopReason).toBe('stop');
  });

  it('reads a ReadableStream', async () => {
    const turn = await readOpenAIStream(readable(OPENAI_SSE), nullSink());
    expect(turn.text).toBe('Hello world');
  });

  it('reads an ok Response by taking its body', async () => {
    const res = new Response(readable(OPENAI_SSE), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const turn = await readOpenAIStream(res, nullSink());
    expect(turn.text).toBe('Hello world');
  });
});

describe('readAnthropicStream', () => {
  it('reads Anthropic events and ignores the event: lines', async () => {
    const turn = await readAnthropicStream(bytes(ANTHROPIC_SSE), nullSink());
    expect(turn.text).toBe('Hi');
    expect(turn.finishReason).toBe('end_turn');
    expect(turn.stopReason).toBe('stop');
    expect(turn.usage).toEqual({ inputTokens: 9, outputTokens: 2 });
  });
});

describe('readModelStream', () => {
  it('takes an explicit format', async () => {
    const turn = await readModelStream(bytes(OPENAI_SSE), nullSink(), { format: openaiChatFormat });
    expect(turn.text).toBe('Hello world');
  });

  it('opens the format ONCE per stream', async () => {
    let opens = 0;
    const counting = {
      id: 'test.counting',
      open() {
        opens++;
        return { push: () => [] };
      },
    };
    await readModelStream(bytes(OPENAI_SSE), nullSink(), { format: counting });
    expect(opens).toBe(1);
  });

  it('forwards ConsumeOptions through to the adapter', async () => {
    const sse = 'data: {"choices":[{"delta":{"reasoning":"hm"}}]}\n\ndata: [DONE]\n\n';
    const seen: string[] = [];
    await readModelStream(bytes(sse), {
      appendText: () => undefined,
      appendReasoning: (_d, o) => seen.push(o?.label ?? ''),
      upsertTool: () => undefined,
    }, { format: openaiChatFormat, reasoningLabel: 'Reasoning' });
    expect(seen).toEqual(['Reasoning']);
  });
});

describe('WireError', () => {
  it('carries status, statusText and a PARSED JSON error body', async () => {
    const res = new Response(
      JSON.stringify({ error: { message: 'Insufficient credits', code: 402 } }),
      { status: 402, statusText: 'Payment Required' },
    );
    const err = await readOpenAIStream(res, nullSink()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WireError);
    const wire = err as WireError;
    expect(wire.name).toBe('WireError');
    expect(wire.status).toBe(402);
    expect(wire.statusText).toBe('Payment Required');
    expect(wire.message).toContain('402');
    expect(wire.message).toContain('Insufficient credits');
    expect(wire.body).toEqual({ error: { message: 'Insufficient credits', code: 402 } });
  });

  it('carries an HTML 4xx body as text with no parsed body', async () => {
    const html = '<html><head><title>404 Not Found</title></head><body>nginx</body></html>';
    const res = new Response(html, { status: 404, statusText: 'Not Found' });
    const err = (await readOpenAIStream(res, nullSink()).catch((e: unknown) => e)) as WireError;
    expect(err).toBeInstanceOf(WireError);
    expect(err.status).toBe(404);
    expect(err.body).toBeUndefined();
    expect(err.bodyText).toContain('<html');
    // The message shows a snippet so a proxy misconfiguration is diagnosable.
    expect(err.message).toContain('404');
    expect(err.message).toContain('<html');
  });

  it('throws a plain Error when an ok Response has no body', async () => {
    const res = new Response(null, { status: 200 });
    const err = (await readOpenAIStream(res, nullSink()).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(WireError);
    expect(err.message).toContain('no body');
  });

  it('does NOT throw for an in-band error after a 200', async () => {
    // An error frame inside a 200 stream is data, not an HTTP failure. It lands
    // on the turn so partial text and tool panels survive.
    const sse =
      'data: {"choices":[{"delta":{"content":"Chec"}}]}\n\n' +
      'data: {"error":{"code":"server_error","message":"upstream dropped"}}\n\n';
    const turn = await readOpenAIStream(new Response(readable(sse)), nullSink());
    expect(turn.error?.message).toBe('upstream dropped');
    expect(turn.text).toBe('Chec');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/read.test.ts`
Expected: FAIL, cannot resolve `./read`.

- [ ] **Step 3: Write the readers**

Create `packages/ui/src/wire/read.ts`:

```ts
// The transport seam. The kit PARSES the stream; the consumer OWNS the
// transport. Auth, proxies, retries, aborts and rate limits are app decisions,
// so `StreamSource` is the entire surface: hand over a Response, a
// ReadableStream, or any async iterable of bytes or strings.
//
// Deliberately absent: retries, reconnect, Last-Event-ID, backoff, an
// AbortSignal parameter (abort the fetch), a URL-taking client, and key
// handling. Untested retry logic is worse than none.
//
// SSR: nothing here references Response or ReadableStream at module scope. A
// Response is detected by duck-typing, not `instanceof`, so this module imports
// cleanly in a runtime where the global does not exist.
import { sseJson, type ByteSource } from './sse';
import { consumeModelStream } from './consume';
import type { AssistantStreamSink, ConsumeOptions, ModelStreamChunk, ModelTurn, WireFormat } from './chunk';
import { openaiChatFormat } from './formats/openai';
import { anthropicMessagesFormat } from './formats/anthropic';

export type StreamSource =
  | Response
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array | string>;

export interface ReadOptions extends ConsumeOptions {
  format: WireFormat;
}

/** A non-ok HTTP response from the model endpoint, with the provider's own error
 *  body attached when there is one. Thrown before a single chunk is read, so a
 *  caller can distinguish "the request failed" from "the stream carried an
 *  error", which is `ModelTurn.error`. */
export class WireError extends Error {
  readonly status: number;
  readonly statusText: string;
  /** The response body parsed as JSON, or undefined when it was not JSON (an
   *  HTML error page from a proxy, most often). */
  readonly body: unknown;
  /** The raw response body, always. */
  readonly bodyText: string;

  constructor(status: number, statusText: string, bodyText: string, body: unknown) {
    super(buildMessage(status, statusText, bodyText, body));
    this.name = 'WireError';
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
    this.body = body;
  }
}

function providerMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  const top = (body as { message?: unknown }).message;
  return typeof top === 'string' ? top : undefined;
}

function buildMessage(status: number, statusText: string, bodyText: string, body: unknown): string {
  const head = `Model request failed: HTTP ${status}${statusText ? ` ${statusText}` : ''}`;
  const provider = providerMessage(body);
  if (provider) return `${head}: ${provider}`;
  const snippet = bodyText.trim().slice(0, 200);
  return snippet ? `${head}: ${snippet}` : head;
}

/** Duck-typed, because `Response` may not be a global in every runtime the kit
 *  is imported into. A ReadableStream has no `ok`, and an async iterable that
 *  happens to have all three of these is not a shape any transport produces. */
function isResponse(source: StreamSource): source is Response {
  return (
    typeof source === 'object' &&
    source !== null &&
    'ok' in source &&
    'status' in source &&
    'body' in source
  );
}

async function wireErrorFrom(res: Response): Promise<WireError> {
  const bodyText = await res.text().catch(() => '');
  let body: unknown;
  try {
    body = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    body = undefined; // an HTML error page, or anything else non-JSON
  }
  return new WireError(res.status, res.statusText, bodyText, body);
}

async function toByteSource(source: StreamSource): Promise<ByteSource> {
  if (!isResponse(source)) return source;
  if (!source.ok) throw await wireErrorFrom(source);
  if (!source.body) {
    throw new Error(
      'The model response has no body to stream. Check that the request set stream: true and that nothing between you and the provider buffered it.',
    );
  }
  return source.body;
}

/** Read one turn off the wire in `opts.format` and drive `sink` with it. */
export async function readModelStream(
  source: StreamSource,
  sink: AssistantStreamSink,
  opts: ReadOptions,
): Promise<ModelTurn> {
  const bytes = await toByteSource(source);
  // Opened ONCE per stream, which is the whole point of the open()/push() shape:
  // a stateful format (Anthropic) gets a fresh block map per call.
  const reader = opts.format.open();
  async function* chunks(): AsyncGenerator<ModelStreamChunk> {
    for await (const frame of sseJson<unknown>(bytes)) {
      for (const chunk of reader.push(frame)) yield chunk;
    }
  }
  return consumeModelStream(chunks(), sink, opts);
}

/** OpenAI chat-completions SSE. Also what all nine catalog integrations except
 *  `mock` re-frame to server-side, so this is the common path. */
export function readOpenAIStream(
  source: StreamSource,
  sink: AssistantStreamSink,
  opts: ConsumeOptions = {},
): Promise<ModelTurn> {
  return readModelStream(source, sink, { ...opts, format: openaiChatFormat });
}

/** Anthropic Messages SSE. */
export function readAnthropicStream(
  source: StreamSource,
  sink: AssistantStreamSink,
  opts: ConsumeOptions = {},
): Promise<ModelTurn> {
  return readModelStream(source, sink, { ...opts, format: anthropicMessagesFormat });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/`
Expected: PASS, 11 new tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec nx typecheck ui`
Expected: PASS 4/4.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/wire/read.ts packages/ui/src/wire/read.test.ts
git commit -m "feat(wire): StreamSource readers plus WireError for the non-ok response path"
```

---

### Task 9: The `./wire` entry, its build and the SSR smoke test

**Files:**
- Create: `packages/ui/src/wire/index.ts`
- Create: `packages/ui/src/wire/ssr.test.ts`
- Create: `packages/ui/vite.config.wire.ts`
- Modify: `packages/ui/package.json` (`exports`, `files`, `build` script)

**Interfaces:**
- Consumes: every module from Tasks 3 to 8.
- Produces: the public `@kitn.ai/ui/wire` surface. Everything a consumer can import:
  ```ts
  readModelStream, readOpenAIStream, readAnthropicStream, consumeModelStream,
  createToolCallAccumulator, applyToolOutput, applyToolFailure, bufferText,
  sseDataFrames, sseJson, readableToAsyncIterable, normalizeStopReason,
  openaiChatFormat, anthropicMessagesFormat, WireError
  // types
  StreamSource, ReadOptions, WireFormat, WireFormatReader, ModelStreamChunk,
  ModelToolCallDelta, ModelUsage, ModelToolCall, ModelTurn, StopReason,
  ConsumeOptions, AssistantStreamSink, ByteSource
  ```
- Later tasks rely on: Tasks 16 to 18 import from `@kitn.ai/ui/wire` by that exact specifier.

The `.d.ts` for this entry needs NO new config: `vite.config.barrel.ts` already runs `vite-plugin-dts` over `src/**/*.ts` with `entryRoot: 'src'`, so `src/wire/index.ts` emits `dist/wire/index.d.ts` automatically. The new vite config is JS-only, exactly like `vite.config.state.ts`.

Task 14 adds the two encoders to this barrel. Write it complete for what exists now and extend it there; do not stub the encoder exports ahead of time.

- [ ] **Step 1: Write the failing SSR smoke test**

Create `packages/ui/src/wire/ssr.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

describe('SSR safety', () => {
  it('imports the whole entry with no window and no document', async () => {
    // The unit project runs in jsdom, so both globals exist. Delete them for the
    // duration of the import to prove nothing in `wire` touches the DOM, or
    // constructs a TextDecoder / Response / ReadableStream, at MODULE scope.
    const win = globalThis.window;
    const doc = globalThis.document;
    vi.resetModules();
    // @ts-expect-error deleting a DOM global on purpose
    delete globalThis.window;
    // @ts-expect-error deleting a DOM global on purpose
    delete globalThis.document;
    try {
      const mod = await import('./index');
      expect(typeof mod.readOpenAIStream).toBe('function');
      expect(typeof mod.readAnthropicStream).toBe('function');
      expect(typeof mod.readModelStream).toBe('function');
      expect(typeof mod.consumeModelStream).toBe('function');
      expect(typeof mod.sseJson).toBe('function');
      expect(typeof mod.bufferText).toBe('function');
      expect(mod.openaiChatFormat.id).toBe('openai.chat-completions');
      expect(mod.anthropicMessagesFormat.id).toBe('anthropic.messages');
      expect(typeof mod.WireError).toBe('function');
    } finally {
      Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
      vi.resetModules();
    }
  });

  it('exposes every format through the same WireFormat shape', async () => {
    const { anthropicMessagesFormat, openaiChatFormat } = await import('./index');
    for (const format of [openaiChatFormat, anthropicMessagesFormat]) {
      expect(typeof format.id).toBe('string');
      expect(typeof format.open).toBe('function');
      expect(typeof format.open().push).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/ssr.test.ts`
Expected: FAIL, cannot resolve `./index`.

- [ ] **Step 3: Write the barrel**

Create `packages/ui/src/wire/index.ts`:

```ts
// @kitn.ai/ui/wire: the model-stream adapter.
//
// Separate from ./state on purpose. `state` is I/O-free pure functions over
// ChatMessage[]; `wire` touches Response, TextDecoder and byte streams. Keeping
// them apart leaves the bring-your-own-transport consumer at zero cost, and
// gives a future AG-UI format an obvious home. The cost is that importing both
// entries ships state/parts.ts twice, about 2 KB.
//
// The kit PARSES. The consumer FETCHES. There is no client, no key handling and
// no provider SDK anywhere below this file.

export { readModelStream, readOpenAIStream, readAnthropicStream, WireError } from './read';
export type { StreamSource, ReadOptions } from './read';

export { consumeModelStream, createToolCallAccumulator } from './consume';
export { applyToolOutput, applyToolFailure, bufferText } from './sink-helpers';

export { openaiChatFormat } from './formats/openai';
export { anthropicMessagesFormat } from './formats/anthropic';

export { sseDataFrames, sseJson, readableToAsyncIterable } from './sse';
export type { ByteSource } from './sse';

export { normalizeStopReason } from './chunk';
export type {
  AssistantStreamSink,
  ConsumeOptions,
  ModelStreamChunk,
  ModelToolCall,
  ModelToolCallDelta,
  ModelTurn,
  ModelUsage,
  StopReason,
  WireFormat,
  WireFormatReader,
} from './chunk';

// The content-model types every signature above mentions, re-exported so a
// consumer importing only from '@kitn.ai/ui/wire' can annotate the values these
// functions take and return without a second import.
export type { ChatMessage, MessagePart, MessageSource, RawOrigin } from '../elements/chat-types';
export type { ToolPart } from '../components/tool-types';
```

- [ ] **Step 4: Add the build config**

Create `packages/ui/vite.config.wire.ts`:

```ts
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'node:path';

// The wire adapter (@kitn.ai/ui/wire). Reads a Response / ReadableStream /
// AsyncIterable and drives an AssistantStreamSink. No provider SDK and no Solid
// runtime, but the plugin stays for consistency with the other lib builds and
// because it imports src/state/parts.ts, which lives in a Solid-compiled tree.
// Compiled to dist/wire.js.
//
// The .d.ts is emitted by the barrel build (vite-plugin-dts over src/**, with
// entryRoot: 'src', so src/wire/index.ts becomes dist/wire/index.d.ts). This
// build is JS-only.
//
// emptyOutDir: false -- the main build ran first; do NOT clobber.
export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/wire/index.ts'),
      formats: ['es'],
      fileName: () => 'wire.js',
    },
    rollupOptions: { external: ['solid-js', 'solid-js/web', 'solid-js/store'] },
  },
});
```

- [ ] **Step 5: Wire the entry into `package.json`**

Three edits in `packages/ui/package.json`.

Add to `exports`, immediately after the `"./state"` block:

```json
    "./wire": {
      "types": "./dist/wire/index.d.ts",
      "default": "./dist/wire.js"
    },
```

Add to `files`, after `"!src/stories"`:

```json
    "!src/wire/fixtures",
```

Captured SSE fixtures are test data. They are never imported by anything reachable from an entry, and shipping them would put hundreds of KB of raw provider output in the tarball.

In the `build` script, insert the wire build immediately after the state build so it runs in the same position as `./state` does in the exports map:

```
... && vite build --config vite.config.state.ts && vite build --config vite.config.wire.ts && vite build --config vite.config.mcp.ts && ...
```

`sideEffects` needs NO change: it lists the files that DO have side effects (the element registration bundles), and `dist/wire.js` has none.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/`
Expected: PASS.

- [ ] **Step 7: Build and confirm the entry resolves and the tree is a fixpoint**

```bash
pnpm exec nx build ui
ls -la packages/ui/dist/wire.js packages/ui/dist/wire/index.d.ts
node -e "import('./packages/ui/dist/wire.js').then(m => console.log(Object.keys(m).sort().join(' ')))"
git status --porcelain
```

Expected: both files exist; the printed key list contains `readOpenAIStream`, `readAnthropicStream`, `consumeModelStream`, `openaiChatFormat`, `anthropicMessagesFormat`, `WireError`, `bufferText`. **`git status --porcelain` must print NOTHING except the files this task created.** If a generated file (`src/components/component-meta.json`, `src/elements/element-meta.json`, `src/elements/element-types.d.ts`, `llms.txt`) changed, inspect the diff: it is legitimate only if it reflects a real change, and it must be committed in this task.

- [ ] **Step 8: Typecheck**

Run: `pnpm exec nx typecheck ui`
Expected: PASS 4/4.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/wire/index.ts packages/ui/src/wire/ssr.test.ts \
        packages/ui/vite.config.wire.ts packages/ui/package.json
git commit -m "feat(wire): ship the ./wire entry with its own lib build"
```

---

### Task 10: The fixture capture script, the provenance contract and the replay harness

**Files:**
- Create: `packages/ui/scripts/capture-wire-fixture.mjs`
- Create: `packages/ui/src/wire/fixtures/replay.ts`
- Create: `packages/ui/src/wire/fixtures/provenance.test.ts`
- Create: `packages/ui/src/wire/fixtures/openai/text-only.sse`
- Create: `packages/ui/src/wire/fixtures/openai/index.ts`
- Create: `packages/ui/src/wire/fixtures/anthropic/index.ts`
- Create: `packages/ui/src/wire/fixtures/anthropic/thinking-tool.sse`

**Interfaces:**
- Consumes: `AssistantStreamSink` from `../chunk`.
- Produces:
  ```ts
  // fixtures/replay.ts
  export const BYTE_SIZES: readonly number[];          // [1, 3, 17, 64, 4096]
  export function replayBytes(sse: string, size: number): AsyncGenerator<Uint8Array>;
  export function replayReadable(sse: string, size: number): ReadableStream<Uint8Array>;
  export function nullSink(): AssistantStreamSink;
  export function recordingSink(): AssistantStreamSink & { calls: string[] };
  // fixtures/openai/index.ts
  export const OPENAI_FIXTURES: Record<string, string>;
  // fixtures/anthropic/index.ts
  export const ANTHROPIC_FIXTURES: Record<string, string>;
  ```
- Later tasks rely on: Tasks 11, 12 and 13 read `OPENAI_FIXTURES` / `ANTHROPIC_FIXTURES` by key and replay them through `replayBytes` / `replayReadable`.

**CI NEVER RUNS THE CAPTURE SCRIPT.** It needs an API key and the network. Its output is checked in on purpose so the whole suite stays offline. Nothing in `package.json` scripts, no NX target, no workflow may invoke it.

**Provenance is what makes a fixture trustworthy.** Every `.sse` file starts with SSE COMMENT lines, which is a happy accident worth exploiting: `sseDataFrames` already drops lines beginning with `:`, so the header replays byte for byte with the fixture and changes nothing.

```
: fixture: openai/text-only
: capture: live
: provider: openai
: model: gpt-4o-mini
: captured: 2026-08-09
: request: {"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Say hi in five words."}]}
```

`capture:` is `live` for a real capture and `synthetic` for a fixture hand-authored from the provider's published event list. Synthetic is allowed, because an implementer without a key must still be able to finish this plan, but it must be declared. A synthetic fixture adds one more header line, `: source: <doc URL>`. The spec is explicit that Anthropic support is designed rather than measured and expects one revision after the first real capture; a `capture: synthetic` header is what makes that revision findable with `grep`.

- [ ] **Step 1: Write the failing provenance test**

Create `packages/ui/src/wire/fixtures/provenance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ANTHROPIC_FIXTURES } from './anthropic';
import { OPENAI_FIXTURES } from './openai';

const REQUIRED = ['fixture', 'capture', 'provider', 'model', 'captured', 'request'];

function header(sse: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of sse.split('\n')) {
    if (!line.startsWith(': ')) break;
    const at = line.indexOf(':', 2);
    if (at === -1) continue;
    out[line.slice(2, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

const ALL: Array<[string, string]> = [
  ...Object.entries(OPENAI_FIXTURES).map(([k, v]): [string, string] => [`openai/${k}`, v]),
  ...Object.entries(ANTHROPIC_FIXTURES).map(([k, v]): [string, string] => [`anthropic/${k}`, v]),
];

describe('captured fixture provenance', () => {
  it('finds fixtures for both providers', () => {
    expect(Object.keys(OPENAI_FIXTURES).length).toBeGreaterThan(0);
    expect(Object.keys(ANTHROPIC_FIXTURES).length).toBeGreaterThan(0);
  });

  it.each(ALL)('%s carries a complete provenance header', (name, sse) => {
    const h = header(sse);
    for (const key of REQUIRED) expect(h[key], `${name} is missing ": ${key}:"`).toBeTruthy();
    expect(h.fixture).toBe(name);
    expect(['live', 'synthetic']).toContain(h.capture);
    expect(h.captured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The request body is what makes the capture reproducible.
    expect(() => JSON.parse(h.request)).not.toThrow();
    if (h.capture === 'synthetic') {
      expect(h.source, `${name} is synthetic and must cite the doc it was written from`).toBeTruthy();
    }
  });

  it.each(ALL)('%s contains no API key material', (_name, sse) => {
    expect(sse).not.toMatch(/sk-[A-Za-z0-9_-]{10,}/);
    expect(sse).not.toMatch(/x-api-key/i);
    expect(sse).not.toMatch(/authorization/i);
  });

  it.each(ALL)('%s has at least one data frame after its header', (_name, sse) => {
    expect(sse).toMatch(/\ndata: /);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/fixtures/provenance.test.ts`
Expected: FAIL, cannot resolve `./openai` and `./anthropic`.

- [ ] **Step 3: Write the fixture loaders**

`import.meta.glob` is a Vite built-in and is typed by `vite/client`, which is already the only entry in this package's tsconfig `types` array. No `node:fs` and no ambient module declaration are needed.

Create `packages/ui/src/wire/fixtures/openai/index.ts`:

```ts
// Captured OpenAI-format SSE, loaded as raw text. TEST-ONLY: nothing reachable
// from src/wire/index.ts may import this, and `!src/wire/fixtures` keeps it out
// of the published tarball.
const files = import.meta.glob('./*.sse', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

/** Keyed by bare fixture name: './text-only.sse' becomes 'text-only'. */
export const OPENAI_FIXTURES: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, text]) => [
    path.replace(/^\.\//, '').replace(/\.sse$/, ''),
    text,
  ]),
);
```

Create `packages/ui/src/wire/fixtures/anthropic/index.ts` with the same body, renaming the export to `ANTHROPIC_FIXTURES` and the comment to "Captured Anthropic Messages SSE".

- [ ] **Step 4: Write the replay harness**

Create `packages/ui/src/wire/fixtures/replay.ts`:

```ts
// Byte-level replay for captured fixtures.
//
// The chunk sizes are not arbitrary. 1 puts a boundary between every byte, which
// is the only reliable way to catch a decoder that assumes a frame arrives whole
// or that a multi-byte codepoint is not split. 3 and 17 are coprime with typical
// frame lengths so boundaries land mid-key and mid-value. 64 is a realistic
// small socket read. 4096 delivers most fixtures in one go, which is the case
// that hides every bug the others find.
import type { AssistantStreamSink } from '../chunk';

export const BYTE_SIZES: readonly number[] = [1, 3, 17, 64, 4096];

/** UTF-8 bytes of `sse` in chunks of `size`, with a microtask between them so
 *  the consumer really does suspend, like a socket. */
export async function* replayBytes(sse: string, size: number): AsyncGenerator<Uint8Array> {
  const bytes = new TextEncoder().encode(sse);
  for (let i = 0; i < bytes.length; i += size) {
    yield bytes.subarray(i, Math.min(i + size, bytes.length));
    await Promise.resolve();
  }
}

/** The same bytes as a WHATWG ReadableStream, for the `res.body` code path. */
export function replayReadable(sse: string, size: number): ReadableStream<Uint8Array> {
  const iterator = replayBytes(sse, size)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
  });
}

/** A sink that discards everything. Tests read `ModelTurn.parts`, which the
 *  adapter records through its own tee, so discarding here loses nothing. */
export function nullSink(): AssistantStreamSink {
  return {
    appendText: () => undefined,
    appendReasoning: () => undefined,
    upsertTool: () => undefined,
    addSource: () => undefined,
  };
}

/** A sink that records an ordered, printable log of every call, for asserting
 *  the ORDER the host sink was driven in. */
export function recordingSink(): AssistantStreamSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    appendText: (delta) => calls.push(`text:${delta}`),
    appendReasoning: (delta, opts) => calls.push(`reasoning:${opts?.index ?? 0}:${delta}`),
    upsertTool: (id, patch) => calls.push(`tool:${id}:${patch.state ?? '-'}`),
    addSource: (source) => calls.push(`source:${source.url ?? ''}`),
  };
}
```

- [ ] **Step 5: Write the capture script**

Create `packages/ui/scripts/capture-wire-fixture.mjs`:

```js
#!/usr/bin/env node
// Regenerate a captured L2 wire fixture from a live provider.
//
// CI NEVER RUNS THIS. It needs a key and the network, and its output is checked
// in on purpose so the test suite stays offline. Run it by hand when a provider
// changes its event surface, then READ THE DIFF before committing.
//
//   OPENAI_API_KEY=...    node scripts/capture-wire-fixture.mjs openai/text-only
//   ANTHROPIC_API_KEY=... node scripts/capture-wire-fixture.mjs anthropic/thinking-tool
//   node scripts/capture-wire-fixture.mjs --list
//
// The key is read from env, used only in a request header, and NEVER written to
// the fixture: the provenance header records the request BODY only.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src/wire/fixtures');

const OPENAI_MODEL = process.env.CAPTURE_OPENAI_MODEL ?? 'gpt-4o-mini';
const ANTHROPIC_MODEL = process.env.CAPTURE_ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';

const WEATHER_TOOL_OPENAI = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Current weather for a city.',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' }, units: { type: 'string' } },
      required: ['city'],
    },
  },
};

const WEATHER_TOOL_ANTHROPIC = {
  name: 'get_weather',
  description: 'Current weather for a city.',
  input_schema: {
    type: 'object',
    properties: { city: { type: 'string' }, units: { type: 'string' } },
    required: ['city'],
  },
};

const ask = (content) => [{ role: 'user', content }];

/** Every capture this repo keeps. The name is the fixture path. */
const SCENARIOS = {
  'openai/text-only': {
    provider: 'openai',
    model: OPENAI_MODEL,
    body: { stream: true, messages: ask('Say hi in five words.') },
  },
  'openai/tool-fragmented-args': {
    provider: 'openai',
    model: OPENAI_MODEL,
    body: {
      stream: true,
      tools: [WEATHER_TOOL_OPENAI],
      messages: ask('What is the weather in Paris in metric units? Use the tool.'),
    },
  },
  'openai/parallel-tools': {
    provider: 'openai',
    model: OPENAI_MODEL,
    body: {
      stream: true,
      tools: [WEATHER_TOOL_OPENAI],
      messages: ask('Compare the weather in Paris and Tokyo. Call the tool once per city.'),
    },
  },
  'openai/length-mid-arguments': {
    provider: 'openai',
    model: OPENAI_MODEL,
    body: {
      stream: true,
      max_tokens: 12,
      tools: [WEATHER_TOOL_OPENAI],
      messages: ask('Call get_weather for San Francisco with a very long units string.'),
    },
  },
  'openai/reasoning-both-fields': {
    // The doubling trap: the same text in `reasoning` AND `reasoning_details`.
    // Needs an OpenRouter key and a reasoning model.
    provider: 'openrouter',
    model: process.env.CAPTURE_OPENROUTER_MODEL ?? '~deepseek/deepseek-v4-flash-latest',
    body: { stream: true, reasoning: { effort: 'medium' }, messages: ask('Think, then answer: 17 * 23.') },
  },
  'openai/usage-only-final-chunk': {
    provider: 'openrouter',
    model: process.env.CAPTURE_OPENROUTER_MODEL ?? '~deepseek/deepseek-v4-flash-latest',
    body: { stream: true, stream_options: { include_usage: true }, messages: ask('Reply with the word ok.') },
  },
  'anthropic/thinking-tool': {
    provider: 'anthropic',
    model: ANTHROPIC_MODEL,
    body: {
      stream: true,
      max_tokens: 2048,
      thinking: { type: 'enabled', budget_tokens: 1024 },
      tools: [WEATHER_TOOL_ANTHROPIC],
      messages: ask('Think about it, then get the weather in Paris using the tool.'),
    },
  },
  'anthropic/text-only': {
    provider: 'anthropic',
    model: ANTHROPIC_MODEL,
    body: { stream: true, max_tokens: 256, messages: ask('Say hi in five words.') },
  },
  'anthropic/max-tokens': {
    provider: 'anthropic',
    model: ANTHROPIC_MODEL,
    body: { stream: true, max_tokens: 8, messages: ask('Write a long paragraph about SSE.') },
  },
};

const ENDPOINTS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    keyEnv: 'OPENAI_API_KEY',
    headers: (key) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }),
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'OPENROUTER_API_KEY',
    headers: (key) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }),
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    keyEnv: 'ANTHROPIC_API_KEY',
    headers: (key) => ({
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
  },
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

const name = process.argv[2];
if (!name || name === '--list') {
  console.log('Scenarios:\n' + Object.keys(SCENARIOS).map((s) => `  ${s}`).join('\n'));
  process.exit(name ? 0 : 1);
}

const scenario = SCENARIOS[name];
if (!scenario) fail(`Unknown scenario "${name}". Run with --list.`);

const endpoint = ENDPOINTS[scenario.provider];
const key = process.env[endpoint.keyEnv];
if (!key) fail(`${endpoint.keyEnv} is not set. This script needs a real key; CI never runs it.`);

const requestBody = { model: scenario.model, ...scenario.body };
const res = await fetch(endpoint.url, {
  method: 'POST',
  headers: endpoint.headers(key),
  body: JSON.stringify(requestBody),
});

if (!res.ok || !res.body) {
  fail(`HTTP ${res.status} ${res.statusText}\n${await res.text()}`);
}

// Read the stream RAW. No parsing: the fixture is the bytes the provider sent.
const reader = res.body.getReader();
const decoder = new TextDecoder();
let sse = '';
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  sse += decoder.decode(value, { stream: true });
}
sse += decoder.decode();

const header = [
  `: fixture: ${name}`,
  `: capture: live`,
  `: provider: ${scenario.provider}`,
  `: model: ${scenario.model}`,
  `: captured: ${new Date().toISOString().slice(0, 10)}`,
  // One line, so the header stays a valid run of SSE comments.
  `: request: ${JSON.stringify(requestBody)}`,
  '',
  '',
].join('\n');

const outPath = join(OUT_DIR, `${name}.sse`);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, header + sse, 'utf8');
console.log(`Wrote ${outPath} (${sse.length} bytes of SSE). Read the diff before committing.`);
```

- [ ] **Step 6: Write one worked fixture per provider**

These two exist so the loaders resolve and the provenance test has something to check. Tasks 11 and 12 add the rest in exactly this shape.

Create `packages/ui/src/wire/fixtures/openai/text-only.sse`. If you have an `OPENAI_API_KEY`, generate it with `node scripts/capture-wire-fixture.mjs openai/text-only` and use whatever comes back. Otherwise write it by hand, with `capture: synthetic`:

```
: fixture: openai/text-only
: capture: synthetic
: provider: openai
: model: gpt-4o-mini
: captured: 2026-08-09
: request: {"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Say hi in five words."}]}
: source: https://platform.openai.com/docs/api-reference/chat-streaming

data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":" there,"},"finish_reason":null}]}

data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":" nice to meet you"},"finish_reason":null}]}

data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]

```

Create `packages/ui/src/wire/fixtures/anthropic/thinking-tool.sse` the same way (`node scripts/capture-wire-fixture.mjs anthropic/thinking-tool` if you have `ANTHROPIC_API_KEY`, otherwise by hand):

```
: fixture: anthropic/thinking-tool
: capture: synthetic
: provider: anthropic
: model: claude-sonnet-4-5
: captured: 2026-08-09
: request: {"model":"claude-sonnet-4-5","stream":true,"max_tokens":2048,"thinking":{"type":"enabled","budget_tokens":1024},"tools":[{"name":"get_weather","description":"Current weather for a city.","input_schema":{"type":"object","properties":{"city":{"type":"string"},"units":{"type":"string"}},"required":["city"]}}],"messages":[{"role":"user","content":"Think about it, then get the weather in Paris using the tool."}]}
: source: https://docs.anthropic.com/en/docs/build-with-claude/streaming

event: message_start
data: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","model":"claude-sonnet-4-5","content":[],"stop_reason":null,"usage":{"input_tokens":412,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}

event: ping
data: {"type":"ping"}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"The user wants Paris weather. "}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"I should call get_weather with city=Paris."}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"ErUBCkYIARgCIkAd8xVzGxQvSIGNATURE"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Let me check Paris."}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: content_block_start
data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_01WX","name":"get_weather","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\"ci"}}

event: content_block_delta
data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"ty\":\"Pa"}}

event: content_block_delta
data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"ris\",\"un"}}

event: content_block_delta
data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"its\":\"metric\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":2}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":118}}

event: message_stop
data: {"type":"message_stop"}

```

- [ ] **Step 7: Run the provenance test**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/fixtures/provenance.test.ts`
Expected: PASS.

- [ ] **Step 8: Confirm CI cannot reach the script**

```bash
grep -rn "capture-wire-fixture" packages/ui/package.json packages/ui/project.json .github/ 2>/dev/null
```
Expected: NO hits. The script is documented in its own header and in the docs (Task 17), and invoked by hand only.

- [ ] **Step 9: Typecheck and commit**

```bash
pnpm exec nx typecheck ui
git add packages/ui/scripts/capture-wire-fixture.mjs packages/ui/src/wire/fixtures
git commit -m "test(wire): fixture capture script, provenance contract and byte replay harness"
```

---

### Task 11: L2 captured OpenAI fixtures

**Files:**
- Create: `packages/ui/src/wire/fixtures/openai/tool-fragmented-args.sse`
- Create: `packages/ui/src/wire/fixtures/openai/parallel-tools.sse`
- Create: `packages/ui/src/wire/fixtures/openai/length-mid-arguments.sse`
- Create: `packages/ui/src/wire/fixtures/openai/in-band-error.sse`
- Create: `packages/ui/src/wire/fixtures/openai/reasoning-both-fields.sse`
- Create: `packages/ui/src/wire/fixtures/openai/usage-only-final-chunk.sse`
- Create: `packages/ui/src/wire/fixtures/openai/keepalive-comments.sse`
- Create: `packages/ui/src/wire/openai-fixtures.test.ts`

**Interfaces:**
- Consumes: `OPENAI_FIXTURES` from `./fixtures/openai`; `replayBytes`, `nullSink` from `./fixtures/replay`; `readOpenAIStream` from `./read`.
- Produces: the seven fixtures above, each with a Task 10 provenance header. Task 13 sweeps every one of them at five byte sizes.

The spec's required OpenAI captures, and which fixture covers each:

| Required capture | Fixture |
|---|---|
| text only | `text-only` (Task 10) |
| fragmented tool arguments | `tool-fragmented-args` |
| two parallel calls with a late `id` | `parallel-tools` |
| `finish_reason: length` mid-arguments | `length-mid-arguments` |
| in-band `error` after a 200 | `in-band-error` |
| `reasoning` AND `reasoning_details` in one delta | `reasoning-both-fields` |
| usage-only final chunk | `usage-only-final-chunk` |
| `: OPENROUTER PROCESSING` keep-alives | `keepalive-comments` |

`in-band-error` and `keepalive-comments` have no scenario in the capture script: neither can be provoked on demand. Both are `capture: synthetic`, headed with the doc or the FINDINGS section they were written from. Every other one has a scenario; capture it live if you hold a key.

- [ ] **Step 1: Write the failing assertions**

Create `packages/ui/src/wire/openai-fixtures.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { OPENAI_FIXTURES } from './fixtures/openai';
import { nullSink, recordingSink, replayBytes } from './fixtures/replay';
import type { MessagePart } from '../elements/chat-types';

const read = (name: string, sink = nullSink()) => {
  const sse = OPENAI_FIXTURES[name];
  if (!sse) throw new Error(`missing fixture openai/${name}`);
  return readOpenAIStream(replayBytes(sse, 17), sink);
};

const toolParts = (parts: MessagePart[]) =>
  parts.filter((p): p is Extract<MessagePart, { type: 'tool' }> => p.type === 'tool');

describe('L2 OpenAI captures', () => {
  it('text-only produces one text part and a stop', async () => {
    const turn = await read('text-only');
    expect(turn.parts.map((p) => p.type)).toEqual(['text']);
    expect(turn.text.length).toBeGreaterThan(0);
    expect(turn.stopReason).toBe('stop');
    expect(turn.toolCalls).toHaveLength(0);
  });

  it('tool-fragmented-args reassembles one call from many fragments', async () => {
    const turn = await read('tool-fragmented-args');
    expect(turn.toolCalls).toHaveLength(1);
    const call = turn.toolCalls[0];
    expect(call.name).toBe('get_weather');
    expect(call.error).toBeUndefined();
    expect(call.input).toMatchObject({ city: expect.any(String) });
    // The raw text is what an encoder echoes back, so it must survive intact.
    expect(JSON.parse(call.argumentsText)).toEqual(call.input);
    const tool = toolParts(turn.parts)[0].tool;
    expect(tool.state).toBe('input-available');
    expect(tool.rawInput).toBe(call.argumentsText);
    expect(tool.kind).toBe('generic');
    expect(turn.stopReason).toBe('tool-calls');
  });

  it('parallel-tools keeps two calls distinct even with a late id', async () => {
    const turn = await read('parallel-tools');
    expect(turn.toolCalls).toHaveLength(2);
    expect(new Set(turn.toolCalls.map((c) => c.id)).size).toBe(2);
    expect(turn.toolCalls.every((c) => c.error === undefined)).toBe(true);
    expect(turn.toolCalls.map((c) => c.index)).toEqual([0, 1]);
    expect(toolParts(turn.parts)).toHaveLength(2);
  });

  it('length-mid-arguments fails the call and says why', async () => {
    const turn = await read('length-mid-arguments');
    expect(turn.finishReason).toBe('length');
    expect(turn.stopReason).toBe('length');
    expect(turn.toolCalls[0].error).toContain('token limit');
    const tool = toolParts(turn.parts)[0].tool;
    expect(tool.state).toBe('output-error');
    // The partial arguments are STILL on the part, so a UI can show what arrived.
    expect(tool.rawInput?.length).toBeGreaterThan(0);
    expect(tool.input).toBeUndefined();
  });

  it('in-band-error lands on the turn and keeps the text already streamed', async () => {
    const turn = await read('in-band-error');
    expect(turn.error?.message).toBeTruthy();
    expect(turn.stopReason).toBe('error');
    expect(turn.text.length).toBeGreaterThan(0);
    expect(turn.parts.some((p) => p.type === 'text')).toBe(true);
  });

  it('reasoning-both-fields does NOT double the reasoning text', async () => {
    const turn = await read('reasoning-both-fields');
    expect(turn.reasoningChunks).toBeGreaterThan(0);
    // The trap: concatenating `reasoning` and `reasoning_details` emits every
    // token twice, so the second half repeats the first exactly.
    const half = turn.reasoning.slice(0, Math.floor(turn.reasoning.length / 2));
    expect(turn.reasoning.slice(Math.floor(turn.reasoning.length / 2))).not.toBe(half);
    const reasoning = turn.parts.find((p) => p.type === 'reasoning');
    expect(reasoning).toBeDefined();
    // reasoning_details rode along as the round-trip payload.
    expect(reasoning?.raw?.source).toBe('openai.reasoning_details');
  });

  it('usage-only-final-chunk reports usage without a stray part', async () => {
    const turn = await read('usage-only-final-chunk');
    expect(turn.usage?.inputTokens).toBeGreaterThan(0);
    expect(turn.usage?.outputTokens).toBeGreaterThan(0);
    expect(turn.parts.filter((p) => p.type === 'text')).toHaveLength(1);
  });

  it('keepalive-comments are invisible to the adapter', async () => {
    const sink = recordingSink();
    const turn = await read('keepalive-comments', sink);
    expect(turn.text).toBe('Hello world');
    expect(sink.calls).toEqual(['text:Hello', 'text: world']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/openai-fixtures.test.ts`
Expected: FAIL, `missing fixture openai/...` for all seven new ones.

- [ ] **Step 3: Capture or author each fixture**

For the six with a capture scenario, if `OPENAI_API_KEY` or `OPENROUTER_API_KEY` is set:

```bash
cd packages/ui
node scripts/capture-wire-fixture.mjs openai/tool-fragmented-args
node scripts/capture-wire-fixture.mjs openai/parallel-tools
node scripts/capture-wire-fixture.mjs openai/length-mid-arguments
node scripts/capture-wire-fixture.mjs openai/reasoning-both-fields
node scripts/capture-wire-fixture.mjs openai/usage-only-final-chunk
```

A live capture is not guaranteed to produce the shape the assertion wants (a model may decline to call the tool, or call it once instead of twice). Re-run, or adjust the scenario's prompt in `SCENARIOS` and re-run. Do NOT hand-edit a `capture: live` body: a fixture that says `live` must be the bytes that came back. If you cannot provoke the shape, rewrite it as `capture: synthetic` with a `: source:` line and say so in the commit.

Without a key, author all six by hand as `capture: synthetic`, following `openai/text-only.sse` from Task 10 and the frame shapes proven in `formats/openai.test.ts`. The two that are always synthetic:

`packages/ui/src/wire/fixtures/openai/in-band-error.sse`:

```
: fixture: openai/in-band-error
: capture: synthetic
: provider: openrouter
: model: ~deepseek/deepseek-v4-flash-latest
: captured: 2026-08-09
: request: {"model":"~deepseek/deepseek-v4-flash-latest","stream":true,"messages":[{"role":"user","content":"Check the weather in Paris."}]}
: source: examples/internal/openrouter-spike/FINDINGS.md, "A provider error delivered in-band, after the response was already 200"

data: {"choices":[{"delta":{"content":"Checking"},"finish_reason":null}]}

data: {"choices":[{"delta":{"content":" Paris"},"finish_reason":null}]}

data: {"error":{"code":"server_error","message":"Upstream provider dropped the connection"}}

```

`packages/ui/src/wire/fixtures/openai/keepalive-comments.sse`:

```
: fixture: openai/keepalive-comments
: capture: synthetic
: provider: openrouter
: model: ~deepseek/deepseek-v4-flash-latest
: captured: 2026-08-09
: request: {"model":"~deepseek/deepseek-v4-flash-latest","stream":true,"messages":[{"role":"user","content":"Say hello world."}]}
: source: examples/internal/openrouter-spike/FINDINGS.md, "OpenRouter sends : OPENROUTER PROCESSING lines"

: OPENROUTER PROCESSING

: OPENROUTER PROCESSING

data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}

: OPENROUTER PROCESSING

data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}

data: {"choices":[{"delta":{},"finish_reason":"stop"}]}

data: [DONE]

```

- [ ] **Step 4: Run to verify the assertions pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/`
Expected: PASS. If a live capture produced a shape an assertion did not anticipate (a different tool name, three calls instead of two), fix the ASSERTION to match the real bytes, never the bytes to match the assertion, and note it in the commit body.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/wire/fixtures/openai packages/ui/src/wire/openai-fixtures.test.ts
git commit -m "test(wire): captured OpenAI SSE fixtures for the eight required cases"
```

---

### Task 12: L2 captured Anthropic fixtures

**Files:**
- Create: `packages/ui/src/wire/fixtures/anthropic/text-only.sse`
- Create: `packages/ui/src/wire/fixtures/anthropic/redacted-thinking.sse`
- Create: `packages/ui/src/wire/fixtures/anthropic/empty-thinking.sse`
- Create: `packages/ui/src/wire/fixtures/anthropic/max-tokens.sse`
- Create: `packages/ui/src/wire/fixtures/anthropic/error-mid-stream.sse`
- Create: `packages/ui/src/wire/anthropic-fixtures.test.ts`

**Interfaces:**
- Consumes: `ANTHROPIC_FIXTURES` from `./fixtures/anthropic`; `replayBytes`, `nullSink` from `./fixtures/replay`; `readAnthropicStream` from `./read`.
- Produces: the five fixtures above plus `anthropic/thinking-tool` from Task 10. Task 13 sweeps them; Task 15's round-trip test replays `thinking-tool` and `redacted-thinking` specifically.

The spec's required Anthropic captures, and which fixture covers each:

| Required capture | Fixture |
|---|---|
| a full `thinking` block through `signature_delta` and `content_block_stop` | `thinking-tool` (Task 10) |
| a `tool_use` block through `input_json_delta` | `thinking-tool` (Task 10) |
| `message_delta` with `stop_reason: tool_use` | `thinking-tool` (Task 10) |
| a `redacted_thinking` block | `redacted-thinking` |
| a `thinking` block with empty text | `empty-thinking` |
| an `event: error` frame mid-stream | `error-mid-stream` |

`text-only` and `max-tokens` are not on the required list but are cheap and cover the plain path plus the `max_tokens` normalization, which is the Anthropic half of rework 3.

`redacted_thinking` cannot be provoked on demand (it appears when Anthropic's safety systems flag internal reasoning), and neither can an `event: error` mid-stream. Both are `capture: synthetic`. **Expect one revision to this whole directory after the first real capture**, particularly around `signature_delta` timing and the exact `redacted_thinking` shape. The spec says so, and the `capture: synthetic` header is how you find them later.

- [ ] **Step 1: Write the failing assertions**

Create `packages/ui/src/wire/anthropic-fixtures.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readAnthropicStream } from './read';
import { ANTHROPIC_FIXTURES } from './fixtures/anthropic';
import { nullSink, replayBytes } from './fixtures/replay';
import type { MessagePart } from '../elements/chat-types';

const read = (name: string) => {
  const sse = ANTHROPIC_FIXTURES[name];
  if (!sse) throw new Error(`missing fixture anthropic/${name}`);
  return readAnthropicStream(replayBytes(sse, 17), nullSink());
};

const reasoningParts = (parts: MessagePart[]) =>
  parts.filter((p): p is Extract<MessagePart, { type: 'reasoning' }> => p.type === 'reasoning');

describe('L2 Anthropic captures', () => {
  it('text-only produces one text part and normalizes end_turn', async () => {
    const turn = await read('text-only');
    expect(turn.parts.map((p) => p.type)).toEqual(['text']);
    expect(turn.finishReason).toBe('end_turn');
    expect(turn.stopReason).toBe('stop');
    expect(turn.usage?.inputTokens).toBeGreaterThan(0);
  });

  it('thinking-tool orders reasoning, then text, then the tool', async () => {
    const turn = await read('thinking-tool');
    expect(turn.parts.map((p) => p.type)).toEqual(['reasoning', 'text', 'tool']);
    expect(turn.finishReason).toBe('tool_use');
    expect(turn.stopReason).toBe('tool-calls');
  });

  it('thinking-tool carries the assembled verbatim block with its signature', async () => {
    const turn = await read('thinking-tool');
    const block = reasoningParts(turn.parts)[0];
    expect(block.text.length).toBeGreaterThan(0);
    expect(block.signature).toBeTruthy();
    expect(block.raw?.source).toBe('anthropic.content_block');
    const payload = block.raw?.payload as { type: string; thinking: string; signature: string };
    expect(payload.type).toBe('thinking');
    // Every byte of the payload came off the wire: `thinking` is the
    // concatenation of the provider's own thinking_delta payloads, so it must
    // equal the part's accumulated text exactly.
    expect(payload.thinking).toBe(block.text);
    expect(payload.signature).toBe(block.signature);
  });

  it('thinking-tool reassembles the tool_use input from input_json_delta', async () => {
    const turn = await read('thinking-tool');
    expect(turn.toolCalls).toHaveLength(1);
    const call = turn.toolCalls[0];
    expect(call.id).toMatch(/^toolu_/);
    expect(call.name).toBe('get_weather');
    expect(call.input).toMatchObject({ city: 'Paris' });
    expect(call.error).toBeUndefined();
  });

  it('redacted-thinking keeps an opaque block as an empty-text part with raw', async () => {
    const turn = await read('redacted-thinking');
    const blocks = reasoningParts(turn.parts);
    const redacted = blocks.find(
      (b) => (b.raw?.payload as { type?: string } | undefined)?.type === 'redacted_thinking',
    );
    expect(redacted).toBeDefined();
    expect(redacted!.text).toBe('');
    expect((redacted!.raw?.payload as { data?: string }).data).toBeTruthy();
    // It is in `parts`, in order, because the encoder needs it there.
    expect(turn.parts.indexOf(redacted!)).toBeLessThan(
      turn.parts.findIndex((p) => p.type === 'text'),
    );
  });

  it('empty-thinking keeps a zero-text thinking block rather than dropping it', async () => {
    const turn = await read('empty-thinking');
    const blocks = reasoningParts(turn.parts);
    const empty = blocks.find((b) => b.text === '');
    expect(empty).toBeDefined();
    expect(empty!.raw?.source).toBe('anthropic.content_block');
    // Zero streamed reasoning TEXT, but the block still exists.
    expect(turn.reasoning).toBe('');
    expect(turn.reasoningChunks).toBe(0);
  });

  it('max-tokens normalizes to length', async () => {
    const turn = await read('max-tokens');
    expect(turn.finishReason).toBe('max_tokens');
    expect(turn.stopReason).toBe('length');
  });

  it('error-mid-stream lands on the turn and keeps what already streamed', async () => {
    const turn = await read('error-mid-stream');
    expect(turn.error?.message).toBeTruthy();
    expect(turn.error?.code).toBe('overloaded_error');
    expect(turn.stopReason).toBe('error');
    expect(turn.text.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/anthropic-fixtures.test.ts`
Expected: FAIL, `missing fixture anthropic/...` for the five new ones.

- [ ] **Step 3: Capture `text-only` and `max-tokens`, author the other three**

With `ANTHROPIC_API_KEY` set:

```bash
cd packages/ui
node scripts/capture-wire-fixture.mjs anthropic/text-only
node scripts/capture-wire-fixture.mjs anthropic/max-tokens
```

Without a key, write both by hand as `capture: synthetic`, following the event shape in `anthropic/thinking-tool.sse` from Task 10 (drop the thinking and tool blocks for `text-only`; for `max-tokens` end with `"stop_reason":"max_tokens"`).

The three that are always synthetic:

`packages/ui/src/wire/fixtures/anthropic/redacted-thinking.sse`:

```
: fixture: anthropic/redacted-thinking
: capture: synthetic
: provider: anthropic
: model: claude-sonnet-4-5
: captured: 2026-08-09
: request: {"model":"claude-sonnet-4-5","stream":true,"max_tokens":1024,"thinking":{"type":"enabled","budget_tokens":1024},"messages":[{"role":"user","content":"Think about it, then answer."}]}
: source: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking (redacted_thinking blocks; "including any blocks with empty thinking fields")

event: message_start
data: {"type":"message_start","message":{"id":"msg_02","type":"message","role":"assistant","model":"claude-sonnet-4-5","content":[],"stop_reason":null,"usage":{"input_tokens":37,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"redacted_thinking","data":"EroBCkYIARgCIkDx1VzGxQvSREDACTEDBLOBaGVyZQ=="}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"The answer is 42."}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":9}}

event: message_stop
data: {"type":"message_stop"}

```

`packages/ui/src/wire/fixtures/anthropic/empty-thinking.sse`: a `thinking` block that opens, receives a `signature_delta` and stops WITHOUT a single `thinking_delta`. Same header shape, `: fixture: anthropic/empty-thinking`, same `: source:` line, and this body:

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_03","type":"message","role":"assistant","model":"claude-sonnet-4-5","content":[],"stop_reason":null,"usage":{"input_tokens":21,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"ErUBCkYIARgCIkAEMPTYBLOCKSIG"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Done."}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":4}}

event: message_stop
data: {"type":"message_stop"}

```

`packages/ui/src/wire/fixtures/anthropic/error-mid-stream.sse`: same header shape, `: fixture: anthropic/error-mid-stream`, `: source: https://docs.anthropic.com/en/api/errors`, and this body:

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_04","type":"message","role":"assistant","model":"claude-sonnet-4-5","content":[],"stop_reason":null,"usage":{"input_tokens":18,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Checking that"}}

event: error
data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}

```

- [ ] **Step 4: Run to verify the assertions pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/`
Expected: PASS. Same rule as Task 11: if a LIVE capture disagrees with an assertion, the bytes win.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/wire/fixtures/anthropic packages/ui/src/wire/anthropic-fixtures.test.ts
git commit -m "test(wire): captured Anthropic Messages fixtures including the two empty-text cases"
```

---

### Task 13: L3 byte-boundary replay sweep

**Files:**
- Create: `packages/ui/src/wire/byte-boundary.test.ts`

**Interfaces:**
- Consumes: `OPENAI_FIXTURES`, `ANTHROPIC_FIXTURES`, `BYTE_SIZES`, `replayBytes`, `replayReadable`, `nullSink`; `readOpenAIStream`, `readAnthropicStream`.
- Produces: no source. This is the guard that catches the split-codepoint and split-frame bug class across EVERY fixture at once, so any fixture added later is covered for free.

Ten runs per fixture: five byte sizes crossed with two source shapes (`AsyncIterable` and `ReadableStream`). The assertion is that `parts` is deep-equal across all ten. Reference identity is deliberately NOT asserted: anything that clones a message preserves bytes and breaks identity, and the provider compares bytes.

- [ ] **Step 1: Write the test**

Create `packages/ui/src/wire/byte-boundary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readAnthropicStream, readOpenAIStream } from './read';
import { OPENAI_FIXTURES } from './fixtures/openai';
import { ANTHROPIC_FIXTURES } from './fixtures/anthropic';
import { BYTE_SIZES, nullSink, replayBytes, replayReadable } from './fixtures/replay';
import type { ModelTurn } from './chunk';

type Reader = (source: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>) => Promise<ModelTurn>;

const openai: Reader = (source) => readOpenAIStream(source, nullSink());
const anthropic: Reader = (source) => readAnthropicStream(source, nullSink());

const CASES: Array<[string, string, Reader]> = [
  ...Object.entries(OPENAI_FIXTURES).map(([n, sse]): [string, string, Reader] => [
    `openai/${n}`,
    sse,
    openai,
  ]),
  ...Object.entries(ANTHROPIC_FIXTURES).map(([n, sse]): [string, string, Reader] => [
    `anthropic/${n}`,
    sse,
    anthropic,
  ]),
];

describe('L3 byte-boundary replay', () => {
  it('has fixtures to sweep', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(13);
  });

  it.each(CASES)(
    '%s parses identically at every byte size through both source shapes',
    async (name, sse, read) => {
      // The 4096 AsyncIterable run is the baseline; every other run must match it.
      const baseline = await read(replayBytes(sse, 4096));
      const expected = JSON.stringify(baseline.parts);

      for (const size of BYTE_SIZES) {
        const viaIterable = await read(replayBytes(sse, size));
        expect(JSON.stringify(viaIterable.parts), `${name} @ ${size} via AsyncIterable`).toBe(
          expected,
        );

        const viaStream = await read(replayReadable(sse, size));
        expect(JSON.stringify(viaStream.parts), `${name} @ ${size} via ReadableStream`).toBe(
          expected,
        );
      }
    },
  );

  it.each(CASES)('%s reports the same turn summary at 1 byte as at 4096', async (_name, sse, read) => {
    const big = await read(replayBytes(sse, 4096));
    const tiny = await read(replayBytes(sse, 1));
    expect(tiny.text).toBe(big.text);
    expect(tiny.reasoning).toBe(big.reasoning);
    expect(tiny.finishReason).toBe(big.finishReason);
    expect(tiny.stopReason).toBe(big.stopReason);
    expect(tiny.reasoningChunks).toBe(big.reasoningChunks);
    expect(JSON.stringify(tiny.toolCalls)).toBe(JSON.stringify(big.toolCalls));
    expect(JSON.stringify(tiny.sources)).toBe(JSON.stringify(big.sources));
    expect(JSON.stringify(tiny.usage)).toBe(JSON.stringify(big.usage));
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/byte-boundary.test.ts`
Expected: PASS. If a fixture fails only at size 1 or 3, the bug is in the framing or in a format holding state across a frame boundary, and it is a REAL bug: fix `sse.ts` or the format, never the test.

Note on `chunks`: it is deliberately NOT asserted equal across sizes. It counts neutral chunks, not bytes, so it is in fact stable, but tying the sweep to it would couple the test to format internals for no extra coverage.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/wire/byte-boundary.test.ts
git commit -m "test(wire): sweep every captured fixture at five byte sizes through both source shapes"
```

---

### Task 14: `wire/encode.ts`, both encoders

**Files:**
- Create: `packages/ui/src/wire/encode.ts`
- Create: `packages/ui/src/wire/encode.test.ts`
- Modify: `packages/ui/src/wire/index.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `MessagePart` from `../elements/chat-types`; `ToolPart` from `../components/tool-types`.
- Produces:
  ```ts
  export interface OpenAIToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
  export interface OpenAIWireMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: OpenAIToolCall[]; tool_call_id?: string; name?: string }
  export type AnthropicContentBlock = Record<string, unknown>;
  export interface AnthropicWireMessage { role: 'user' | 'assistant'; content: AnthropicContentBlock[] }
  export class WireEncodeError extends Error { readonly messageId: string; readonly partIndex: number }
  export function toOpenAIMessages(messages: ChatMessage[]): OpenAIWireMessage[];
  export function toAnthropicMessages(messages: ChatMessage[]): AnthropicWireMessage[];
  ```
- Later tasks rely on: Task 15's round-trip guard; Task 16's scaffolder emits `toOpenAIMessages(history)`; Task 18's spike loop uses it.

The contract, from the spec:

- A reasoning part is emitted as `part.raw.payload` **verbatim**, never rebuilt from `text` plus `signature`.
- A reasoning part with **no `raw` throws**. Silently reconstructing it is the documented 400 condition; a throw at encode time beats a 400 at request time.
- Block order follows part order. No filtering.
- A tool part echoes the provider `toolCallId`, never a synthesised `call_N`.
- `toOpenAIMessages` uses `rawInput`, the raw accumulated argument text, rather than `JSON.stringify(input)`, so key order and whitespace survive.

Two asymmetries that need saying out loud in the code:

1. **Anthropic `tool_use.input` is a parsed OBJECT on the wire, not a string.** So `toAnthropicMessages` uses `input`, not `rawInput`. Only THINKING blocks carry a verbatim requirement; tool blocks do not.
2. **A tool part with neither `output` nor `errorText` is skipped entirely**, both its call and its result. Both APIs require every echoed tool call to have exactly one matching result, so emitting a call with no result is a guaranteed 400. In the round-trip loop the host executes tools before re-encoding, so this only ever drops a call that genuinely has no answer yet.

`card`, `source` and `file` parts are kit-side and are not encoded. Attachments in particular are a documented v1 limitation, not an oversight.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/wire/encode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WireEncodeError, toAnthropicMessages, toOpenAIMessages } from './encode';
import type { ChatMessage } from '../elements/chat-types';

const user = (text: string, id = 'u1'): ChatMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});

describe('toOpenAIMessages', () => {
  it('encodes a plain exchange', () => {
    expect(
      toOpenAIMessages([user('Hi'), { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] }]),
    ).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ]);
  });

  it('joins multiple text parts into one flat content string', () => {
    expect(
      toOpenAIMessages([
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Checking. ' },
            { type: 'tool', tool: { type: 'get_weather', state: 'output-available', toolCallId: 'c1', input: { city: 'Paris' }, rawInput: '{"city":"Paris"}', output: { c: 18 } } },
            { type: 'text', text: 'It is 18C.' },
          ],
        },
      ])[0],
    ).toEqual({
      role: 'assistant',
      content: 'Checking. It is 18C.',
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
      ],
    });
  });

  it('emits one role:tool message per executed call, right after the assistant', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'tool', tool: { type: 'a', state: 'output-available', toolCallId: 'c1', rawInput: '{}', output: { ok: true } } },
          { type: 'tool', tool: { type: 'b', state: 'output-error', toolCallId: 'c2', rawInput: '{}', errorText: 'boom' } },
        ],
      },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].role).toBe('assistant');
    expect(out[0].content).toBeNull();
    expect(out[0].tool_calls?.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(out[1]).toEqual({ role: 'tool', tool_call_id: 'c1', name: 'a', content: '{"ok":true}' });
    expect(out[2]).toEqual({ role: 'tool', tool_call_id: 'c2', name: 'b', content: 'boom' });
  });

  it('uses rawInput VERBATIM, not a re-stringified parse', () => {
    // Whitespace and key order that JSON.stringify(input) would destroy.
    const rawInput = '{\n  "units": "metric",\n  "city": "Paris"\n}';
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool',
            tool: { type: 'get_weather', state: 'output-available', toolCallId: 'c1', rawInput, input: { city: 'Paris', units: 'metric' }, output: {} },
          },
        ],
      },
    ]);
    expect(out[0].tool_calls?.[0].function.arguments).toBe(rawInput);
  });

  it('falls back to stringifying input when rawInput is absent', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'tool', tool: { type: 't', state: 'output-available', toolCallId: 'c1', input: { a: 1 }, output: {} } },
        ],
      },
    ]);
    expect(out[0].tool_calls?.[0].function.arguments).toBe('{"a":1}');
  });

  it('SKIPS a tool with no result, call and all, to keep the one-call-one-result invariant', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'working' },
          { type: 'tool', tool: { type: 'pending', state: 'input-available', toolCallId: 'c1', input: {} } },
        ],
      },
    ]);
    expect(out).toEqual([{ role: 'assistant', content: 'working' }]);
  });

  it('never synthesises an id for a tool with no toolCallId', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'tool', tool: { type: 't', state: 'output-available', output: {} } }],
      },
    ]);
    expect(out[0].tool_calls).toBeUndefined();
  });

  it('drops kit-side parts', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'hidden', index: 0 },
          { type: 'source', source: { url: 'https://a' } },
          { type: 'card', envelope: { type: 'confirm', id: 'card1', data: {} } },
          { type: 'text', text: 'answer' },
        ],
      },
    ]);
    expect(out).toEqual([{ role: 'assistant', content: 'answer' }]);
  });
});

describe('toAnthropicMessages', () => {
  const thinkingPayload = {
    type: 'thinking',
    thinking: 'Let me work through this.',
    signature: 'ErUBCkYIARgCIkAd8xVzGx',
  };

  it('emits a reasoning block as raw.payload VERBATIM', () => {
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'reasoning',
            text: 'Let me work through this.',
            index: 0,
            signature: 'ErUBCkYIARgCIkAd8xVzGx',
            raw: { source: 'anthropic.content_block', payload: thinkingPayload },
          },
          { type: 'text', text: 'The answer is 42.' },
        ],
      },
    ]);
    expect(out).toEqual([
      {
        role: 'assistant',
        content: [thinkingPayload, { type: 'text', text: 'The answer is 42.' }],
      },
    ]);
    // The exact object, not a rebuild.
    expect(out[0].content[0]).toBe(thinkingPayload);
  });

  it('THROWS on a reasoning part with no raw', () => {
    expect(() =>
      toAnthropicMessages([
        { id: 'a1', role: 'assistant', parts: [{ type: 'reasoning', text: 'rebuilt me', index: 0 }] },
      ]),
    ).toThrow(WireEncodeError);
    try {
      toAnthropicMessages([
        { id: 'a1', role: 'assistant', parts: [{ type: 'reasoning', text: 'x', index: 0 }] },
      ]);
    } catch (e) {
      const err = e as WireEncodeError;
      expect(err.messageId).toBe('a1');
      expect(err.partIndex).toBe(0);
      expect(err.message).toContain('verbatim');
    }
  });

  it('THROWS on a reasoning raw captured from a different format', () => {
    expect(() =>
      toAnthropicMessages([
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: 'x',
              index: 0,
              raw: { source: 'openai.reasoning_details', payload: [{ type: 'reasoning.text', text: 'x' }] },
            },
          ],
        },
      ]),
    ).toThrow(/anthropic\./);
  });

  it('keeps an EMPTY-text reasoning block, in order', () => {
    const redacted = { type: 'redacted_thinking', data: 'EroB' };
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: '', index: 0, raw: { source: 'anthropic.content_block', payload: redacted } },
          { type: 'reasoning', text: 'visible', index: 1, raw: { source: 'anthropic.content_block', payload: thinkingPayload } },
          { type: 'text', text: 'answer' },
        ],
      },
    ]);
    expect(out[0].content).toEqual([redacted, thinkingPayload, { type: 'text', text: 'answer' }]);
  });

  it('emits tool_use with the PROVIDER id and a parsed input object', () => {
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool',
            tool: {
              type: 'get_weather',
              state: 'output-available',
              toolCallId: 'toolu_01WX',
              input: { city: 'Paris' },
              rawInput: '{"city":"Paris"}',
              output: { c: 18 },
            },
          },
        ],
      },
    ]);
    expect(out).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_01WX', name: 'get_weather', input: { city: 'Paris' } }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_01WX', content: '{"c":18}' }],
      },
    ]);
  });

  it('marks a failed tool result is_error', () => {
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool',
            tool: { type: 't', state: 'output-error', toolCallId: 'toolu_02', input: {}, errorText: 'boom' },
          },
        ],
      },
    ]);
    expect(out[1].content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_02', is_error: true, content: 'boom' },
    ]);
  });

  it('encodes user text and drops empty text blocks', () => {
    expect(
      toAnthropicMessages([
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }, { type: 'text', text: '' }] },
      ]),
    ).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }]);
  });

  it('emits no message for a turn that encodes to nothing', () => {
    expect(
      toAnthropicMessages([{ id: 'a1', role: 'assistant', parts: [{ type: 'source', source: { url: 'https://a' } }] }]),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/encode.test.ts`
Expected: FAIL, cannot resolve `./encode`.

- [ ] **Step 3: Write the encoders**

Create `packages/ui/src/wire/encode.ts`:

```ts
// ChatMessage[] back onto the wire, so a host can run a multi-round tool loop in
// about fifteen lines of its own code. The kit never calls a consumer's function
// and never drives the loop; these two functions are the whole contribution.
import type { ChatMessage, MessagePart } from '../elements/chat-types';
import type { ToolPart } from '../components/tool-types';

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OpenAIWireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

/** Anthropic content blocks are an open, provider-owned union. Keeping them as
 *  records is what lets a verbatim `thinking` payload pass through UNTOUCHED,
 *  which is the entire point of this encoder. */
export type AnthropicContentBlock = Record<string, unknown>;

export interface AnthropicWireMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

/** A message cannot be encoded without losing something the provider will reject.
 *  Thrown at encode time, on purpose: a throw here beats a 400 at request time,
 *  because here you still know which message and which part caused it. */
export class WireEncodeError extends Error {
  readonly messageId: string;
  readonly partIndex: number;
  constructor(message: string, messageId: string, partIndex: number) {
    super(message);
    this.name = 'WireEncodeError';
    this.messageId = messageId;
    this.partIndex = partIndex;
  }
}

const textOf = (parts: MessagePart[]): string =>
  parts.filter((p) => p.type === 'text').map((p) => p.text).join('');

const toolsOf = (parts: MessagePart[]): ToolPart[] =>
  parts.filter((p): p is Extract<MessagePart, { type: 'tool' }> => p.type === 'tool').map((p) => p.tool);

/** A tool is encodable only once it has a RESULT. Both APIs require every echoed
 *  tool call to have exactly one matching result, so a call with no answer yet is
 *  skipped entirely rather than sent half-formed. In a real loop the host
 *  executes tools before re-encoding, so this only drops genuinely pending work. */
const isSettled = (tool: ToolPart): boolean =>
  Boolean(tool.toolCallId) && (tool.output !== undefined || tool.errorText !== undefined);

/**
 * ChatMessage[] to an OpenAI chat-completions `messages` array.
 *
 * Arguments are echoed from `rawInput`, the raw accumulated argument text, not
 * from `JSON.stringify(input)`: providers validate an echoed tool block against
 * what they emitted, and re-stringifying changes key order and whitespace.
 *
 * `reasoning`, `card`, `source` and `file` parts are not encoded. OpenAI chat
 * completions has no reasoning channel on the way back in, and the other three
 * are kit-side. File attachments are a documented v1 limitation.
 */
export function toOpenAIMessages(messages: ChatMessage[]): OpenAIWireMessage[] {
  const out: OpenAIWireMessage[] = [];

  for (const message of messages) {
    const content = textOf(message.parts);

    if (message.role === 'user') {
      out.push({ role: 'user', content });
      continue;
    }

    const settled = toolsOf(message.parts).filter(isSettled);
    const calls = settled.map<OpenAIToolCall>((tool) => ({
      id: tool.toolCallId!,
      type: 'function',
      function: {
        name: tool.type,
        arguments: tool.rawInput ?? (tool.input ? JSON.stringify(tool.input) : '{}'),
      },
    }));

    out.push({
      role: 'assistant',
      content: content || null,
      ...(calls.length > 0 ? { tool_calls: calls } : {}),
    });

    // One result message per call, immediately after the assistant message that
    // announced them, in the same order.
    for (const tool of settled) {
      out.push({
        role: 'tool',
        tool_call_id: tool.toolCallId!,
        name: tool.type,
        content: tool.output !== undefined ? JSON.stringify(tool.output) : (tool.errorText ?? ''),
      });
    }
  }

  return out;
}

/**
 * ChatMessage[] to an Anthropic Messages `messages` array. THE ROUND-TRIP
 * ENCODER.
 *
 * A reasoning block is emitted as `part.raw.payload` verbatim and is NEVER
 * rebuilt from `text` plus `signature`: Anthropic returns 400 if a thinking
 * block is modified, reordered or reconstructed. A reasoning part with no `raw`,
 * or with a `raw` captured from some other format, therefore THROWS rather than
 * silently producing a request that will fail.
 *
 * Block order follows part order, with no filtering, because the API validates
 * order too. An empty-text reasoning part (a redacted block) is still emitted:
 * the docs require sending back every block "including any blocks with empty
 * thinking fields".
 *
 * Asymmetry worth knowing: `tool_use.input` is a parsed OBJECT on this wire, not
 * a string, so it uses `input` and not `rawInput`. Only thinking blocks carry a
 * verbatim requirement.
 */
export function toAnthropicMessages(messages: ChatMessage[]): AnthropicWireMessage[] {
  const out: AnthropicWireMessage[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      const blocks = message.parts
        .filter((p): p is Extract<MessagePart, { type: 'text' }> => p.type === 'text' && p.text !== '')
        .map<AnthropicContentBlock>((p) => ({ type: 'text', text: p.text }));
      if (blocks.length > 0) out.push({ role: 'user', content: blocks });
      continue;
    }

    const blocks: AnthropicContentBlock[] = [];
    const results: AnthropicContentBlock[] = [];

    message.parts.forEach((part, partIndex) => {
      switch (part.type) {
        case 'reasoning': {
          if (!part.raw) {
            throw new WireEncodeError(
              `Cannot encode reasoning part ${partIndex} of message "${message.id}": it has no \`raw\` payload, and Anthropic requires a thinking block to be echoed back verbatim. Rebuilding one from text plus signature is the documented 400. Produce reasoning parts with readAnthropicStream, which attaches the provider's own block.`,
              message.id,
              partIndex,
            );
          }
          if (!part.raw.source.startsWith('anthropic.')) {
            throw new WireEncodeError(
              `Cannot encode reasoning part ${partIndex} of message "${message.id}": its \`raw\` came from "${part.raw.source}", not from the Anthropic Messages format. Only a payload captured from that format can be echoed back verbatim. If you are talking to an Anthropic model through an OpenAI-compatible endpoint, use toOpenAIMessages.`,
              message.id,
              partIndex,
            );
          }
          blocks.push(part.raw.payload as AnthropicContentBlock);
          break;
        }
        case 'text': {
          if (part.text !== '') blocks.push({ type: 'text', text: part.text });
          break;
        }
        case 'tool': {
          const tool = part.tool;
          if (!isSettled(tool)) break;
          blocks.push({
            type: 'tool_use',
            id: tool.toolCallId!,
            name: tool.type,
            input: tool.input ?? {},
          });
          results.push(
            tool.errorText !== undefined
              ? {
                  type: 'tool_result',
                  tool_use_id: tool.toolCallId!,
                  is_error: true,
                  content: tool.errorText,
                }
              : {
                  type: 'tool_result',
                  tool_use_id: tool.toolCallId!,
                  content: JSON.stringify(tool.output),
                },
          );
          break;
        }
        default:
          // card, source and file are kit-side and have no wire representation
          // in v1. File attachments in particular are a known limitation.
          break;
      }
    });

    if (blocks.length > 0) out.push({ role: 'assistant', content: blocks });
    // Anthropic carries tool results in the FOLLOWING user message.
    if (results.length > 0) out.push({ role: 'user', content: results });
  }

  return out;
}
```

- [ ] **Step 4: Export from the barrel**

Add to `packages/ui/src/wire/index.ts`, after the `sink-helpers` line:

```ts
export { toOpenAIMessages, toAnthropicMessages, WireEncodeError } from './encode';
export type {
  AnthropicContentBlock,
  AnthropicWireMessage,
  OpenAIToolCall,
  OpenAIWireMessage,
} from './encode';
```

Add the two function names to the assertion list in `packages/ui/src/wire/ssr.test.ts`:

```ts
      expect(typeof mod.toOpenAIMessages).toBe('function');
      expect(typeof mod.toAnthropicMessages).toBe('function');
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/`
Expected: PASS, 18 new tests.

- [ ] **Step 6: Typecheck**

Run: `pnpm exec nx typecheck ui`
Expected: PASS 4/4.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/wire/encode.ts packages/ui/src/wire/encode.test.ts \
        packages/ui/src/wire/index.ts packages/ui/src/wire/ssr.test.ts
git commit -m "feat(wire): OpenAI and Anthropic encoders, with verbatim thinking blocks or a throw"
```

---

### Task 15: Round-trip fidelity guard

**Files:**
- Create: `packages/ui/src/wire/round-trip.test.ts`

**Interfaces:**
- Consumes: `readAnthropicStream` from `./read`; `toAnthropicMessages`, `WireEncodeError` from `./encode`; `ANTHROPIC_FIXTURES` from `./fixtures/anthropic`; `replayBytes` from `./fixtures/replay`; `createAssistantStream`, `type SetMessages` from `../state/stream`.
- Produces: no source. This is THE test that guards the Anthropic 400, and the reason both formats shipped in v1 rather than one.

Unlike sub-project A's version, this one runs the whole pipeline: raw captured SSE, through the format, through the adapter, into a real `AssistantStream` backed by a `ChatMessage[]`, then back out through the encoder. Nothing is hand-built.

Assertions are `JSON.stringify` equality, not `toBe`. The spec is explicit: anything that clones a message (persistence, `structuredClone`, a JSON transport) breaks reference identity while preserving bytes, and the provider compares bytes. Reserve `toBe` for the synchronous same-process path, which gets exactly one assertion below to document that it does hold there.

- [ ] **Step 1: Write the test**

Create `packages/ui/src/wire/round-trip.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readAnthropicStream } from './read';
import { WireEncodeError, toAnthropicMessages, type AnthropicContentBlock } from './encode';
import { ANTHROPIC_FIXTURES } from './fixtures/anthropic';
import { replayBytes } from './fixtures/replay';
import { createAssistantStream, type SetMessages } from '../state/stream';
import type { ChatMessage } from '../elements/chat-types';

/** Drive a REAL AssistantStream from a captured fixture and hand back the
 *  resulting messages. No hand-built parts anywhere in this file. */
async function streamFixture(name: string): Promise<ChatMessage[]> {
  const sse = ANTHROPIC_FIXTURES[name];
  if (!sse) throw new Error(`missing fixture anthropic/${name}`);
  let messages: ChatMessage[] = [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'go' }] }];
  const set: SetMessages = (fn) => {
    messages = fn(messages);
  };
  const stream = createAssistantStream(set);
  try {
    await readAnthropicStream(replayBytes(sse, 17), stream);
  } finally {
    stream.done();
  }
  return messages;
}

/** Settle every tool the way a host would after running it. The encoders SKIP a
 *  tool with no result, so a test about tool blocks has to do this first. */
function settleTools(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === 'tool'
        ? { ...p, tool: { ...p.tool, state: 'output-available' as const, output: { c: 18 } } }
        : p,
    ),
  }));
}

/** Every `data:` JSON payload in a fixture, for comparing against the wire. */
function frames(name: string): Array<Record<string, unknown>> {
  return ANTHROPIC_FIXTURES[name]
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}

const assistantBlocks = (out: ReturnType<typeof toAnthropicMessages>): AnthropicContentBlock[] =>
  out.filter((m) => m.role === 'assistant').flatMap((m) => m.content);

describe('Anthropic round-trip fidelity', () => {
  it('re-emits every thinking block byte-identically to the wire', async () => {
    const messages = await streamFixture('thinking-tool');
    const encoded = toAnthropicMessages(messages);
    const blocks = assistantBlocks(encoded);

    const thinking = blocks.filter((b) => b.type === 'thinking');
    expect(thinking).toHaveLength(1);

    // Rebuild the expected block straight from the fixture's own deltas: this is
    // what "verbatim" means, and it is checked against the wire, not against the
    // part the adapter produced.
    const wire = frames('thinking-tool');
    const expectedThinking = wire
      .filter(
        (f) =>
          f.type === 'content_block_delta' &&
          (f.delta as { type?: string } | undefined)?.type === 'thinking_delta',
      )
      .map((f) => (f.delta as { thinking: string }).thinking)
      .join('');
    const expectedSignature = wire
      .filter(
        (f) =>
          f.type === 'content_block_delta' &&
          (f.delta as { type?: string } | undefined)?.type === 'signature_delta',
      )
      .map((f) => (f.delta as { signature: string }).signature)
      .join('');

    expect(JSON.stringify(thinking[0])).toBe(
      JSON.stringify({ type: 'thinking', thinking: expectedThinking, signature: expectedSignature }),
    );
  });

  it('keeps BLOCK ORDER, which the API validates', async () => {
    const messages = settleTools(await streamFixture('thinking-tool'));
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    expect(blocks.map((b) => b.type)).toEqual(['thinking', 'text', 'tool_use']);
  });

  it('emits no tool_use for a call that has no result yet', async () => {
    // Unsettled tools are skipped ENTIRELY, call and result, so the
    // one-call-one-result invariant both APIs enforce cannot be violated.
    const messages = await streamFixture('thinking-tool');
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    expect(blocks.map((b) => b.type)).toEqual(['thinking', 'text']);
  });

  it('emits the same number of thinking blocks it received, INCLUDING empty ones', async () => {
    const messages = await streamFixture('redacted-thinking');
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    const wireThinking = frames('redacted-thinking').filter(
      (f) =>
        f.type === 'content_block_start' &&
        ['thinking', 'redacted_thinking'].includes(
          (f.content_block as { type?: string } | undefined)?.type ?? '',
        ),
    );
    const encodedThinking = blocks.filter((b) => b.type === 'thinking' || b.type === 'redacted_thinking');
    expect(encodedThinking).toHaveLength(wireThinking.length);
    expect(encodedThinking.length).toBeGreaterThan(0);
  });

  it('re-emits a redacted_thinking blob byte-identically', async () => {
    const messages = await streamFixture('redacted-thinking');
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    const redacted = blocks.find((b) => b.type === 'redacted_thinking');
    const wireBlock = frames('redacted-thinking').find(
      (f) =>
        f.type === 'content_block_start' &&
        (f.content_block as { type?: string } | undefined)?.type === 'redacted_thinking',
    )!.content_block;
    expect(JSON.stringify(redacted)).toBe(JSON.stringify(wireBlock));
  });

  it('carries an empty-text thinking block through rather than dropping it', async () => {
    const messages = await streamFixture('empty-thinking');
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    const empty = blocks.find((b) => b.type === 'thinking' && b.thinking === '');
    expect(empty).toBeDefined();
    expect((empty as { signature?: string }).signature).toBeTruthy();
  });

  it('echoes the PROVIDER tool id, never a synthesised one', async () => {
    const messages = settleTools(await streamFixture('thinking-tool'));
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    const toolUse = blocks.find((b) => b.type === 'tool_use') as { id: string } | undefined;
    expect(toolUse?.id).toMatch(/^toolu_/);
    expect(toolUse?.id).not.toMatch(/^call_\d+$/);
  });

  it('holds reference identity on the synchronous same-process path', async () => {
    // Documented, not required: a clone (persistence, structuredClone, a JSON
    // transport) breaks identity while preserving bytes, and the provider
    // compares bytes. Production assertions use JSON.stringify.
    const messages = await streamFixture('thinking-tool');
    const part = messages
      .flatMap((m) => m.parts)
      .find((p) => p.type === 'reasoning' && p.raw !== undefined)!;
    const blocks = assistantBlocks(toAnthropicMessages(messages));
    expect(blocks[0]).toBe((part as { raw: { payload: unknown } }).raw.payload);
  });

  it('survives a structuredClone of the whole message list', async () => {
    const messages = await streamFixture('thinking-tool');
    const before = JSON.stringify(assistantBlocks(toAnthropicMessages(messages)));
    const after = JSON.stringify(assistantBlocks(toAnthropicMessages(structuredClone(messages))));
    expect(after).toBe(before);
  });

  it('THROWS rather than reconstructing when raw was stripped', async () => {
    const messages = await streamFixture('thinking-tool');
    // Exactly what a naive persistence layer does: keep text and signature,
    // drop the payload it does not understand.
    const stripped = messages.map((m) => ({
      ...m,
      parts: m.parts.map((p) => (p.type === 'reasoning' ? { ...p, raw: undefined } : p)),
    }));
    expect(() => toAnthropicMessages(stripped)).toThrow(WireEncodeError);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/wire/round-trip.test.ts`
Expected: PASS, 10 tests. If the first test FAILS, `raw` is being rebuilt or dropped somewhere between the format and the encoder, and that is the exact 400 this sub-project exists to prevent. Fix it before continuing; do not relax the assertion.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/wire/round-trip.test.ts
git commit -m "test(wire): end-to-end Anthropic round-trip fidelity from captured SSE back to the wire"
```

---

### Task 16: The MCP scaffolder imports the adapter

**Files:**
- Modify: `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts`
- Modify: `packages/ui/src/agent-tooling/mcp/scaffold.test.ts`

**Interfaces:**
- Consumes: the published specifiers `@kitn.ai/ui/wire` (`readOpenAIStream`, `toOpenAIMessages`) and `@kitn.ai/ui/state` (`createAssistantStream`, `type ChatMessage`). The scaffolder EMITS these as strings; it does not import them itself.
- Produces: scaffolds whose real-backend path is four lines instead of twenty-five, and which can actually populate a tool panel.

This is a deliberate reversal of the policy stated at `scaffold.ts:142`. Inlining was correct while the kit had nothing to import. It is now the reason a scaffold with `kai-tool` in its archetype renders a panel no code path can fill, and the inline reader has real bugs: it splits on `\n` and treats each `data:` line as a whole frame (wrong for multi-line frames), and it re-decodes without `{ stream: true }` discipline across the buffer tail.

**`mock` stays inline.** A zero-backend preview must add zero imports. `appendTextHelper` survives for `mockStreamBody` only.

Six emit sites: `htmlWiring`, `renderJsx` (react and next), `renderVue`, `renderSvelte`, `renderTanstackStart`, `mockStreamBody`. Only the first five change.

- [ ] **Step 1: Write the failing tests**

Add to `packages/ui/src/agent-tooling/mcp/scaffold.test.ts`. Match the argument shape used by the existing tests at the top of that file before writing this: `scaffold` is a Tool object and tests call `scaffold.handler(...)` directly.

```ts
const REAL_FRAMEWORKS = ['react', 'vue', 'svelte', 'html', 'next', 'tanstack-start'] as const;

describe('scaffolds import the wire adapter for real backends', () => {
  it.each(REAL_FRAMEWORKS)('%s uses readOpenAIStream instead of a hand-rolled reader', async (framework) => {
    const out = await scaffold.handler({
      framework,
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
    });
    const emitted = JSON.stringify(out);
    expect(emitted).toContain('@kitn.ai/ui/wire');
    expect(emitted).toContain('readOpenAIStream(res, stream)');
    expect(emitted).toContain('createAssistantStream');
    expect(emitted).toContain('toOpenAIMessages(history)');
    // The hand-rolled reader is GONE.
    expect(emitted).not.toContain('getReader()');
    expect(emitted).not.toContain("startsWith('data:')");
    expect(emitted).not.toContain('[DONE]');
  });

  it.each(REAL_FRAMEWORKS)('%s no longer flattens history to a content string', async (framework) => {
    const out = await scaffold.handler({
      framework,
      useCase: 'drop-in-chat',
      integration: 'openrouter',
      placement: 'full-page',
    });
    const emitted = JSON.stringify(out);
    // PARTS_TO_CONTENT threw away every tool call and result on the way back,
    // which made a multi-round loop impossible.
    expect(emitted).not.toContain("p.type === 'text' ? p.text");
  });

  it.each(REAL_FRAMEWORKS)('%s mock scaffolds stay import-free and inline', async (framework) => {
    const out = await scaffold.handler({
      framework,
      useCase: 'drop-in-chat',
      integration: 'mock',
      placement: 'full-page',
    });
    const emitted = JSON.stringify(out);
    expect(emitted).not.toContain('@kitn.ai/ui/wire');
    expect(emitted).not.toContain('readOpenAIStream');
    // The inlined appendTextPart is still what folds the canned reply.
    expect(emitted).toContain('const appendText =');
    expect(emitted).toContain('parts:');
  });

  it('emits the multi-round tool loop as a COMMENTED block for tool archetypes', async () => {
    const out = await scaffold.handler({
      framework: 'react',
      useCase: 'agentic-assistant',
      integration: 'openrouter',
      placement: 'full-page',
    });
    const emitted = JSON.stringify(out);
    expect(emitted).toContain('turn.toolCalls');
    expect(emitted).toContain('applyToolOutput');
    // Commented, not live: the kit never calls a consumer's function, and a live
    // loop against tools that do not exist yet would fail on first run.
    expect(emitted).not.toMatch(/\\n\s*const turn = await readOpenAIStream/);
    expect(emitted).toContain('// for (const call of turn.toolCalls)');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/`
Expected: FAIL on every new case.

- [ ] **Step 3: Replace the real-backend emit**

Delete the `PARTS_TO_CONTENT` const at `scaffold.ts:121` and every `bodyPayload` expression built from it. Replace each with:

```ts
  const bodyPayload = defaultModel
    ? `{ model, messages: toOpenAIMessages(history) }`
    : `{ messages: toOpenAIMessages(history) }`;
```

Keep `appendTextHelper`, and change its doc comment to say it is emitted for the `mock` integration only.

Add a shared emitter beside `mockStreamBody`:

```ts
/**
 * The real-backend submit body. Four lines of adapter, the rest is fetch.
 *
 * `createAssistantStream` appends the in-flight assistant message itself and
 * folds every delta onto its `parts`, so the scaffold no longer hand-builds an
 * empty assistant message. `readOpenAIStream` parses the SSE properly:
 * keep-alive comments, multi-line frames, codepoints split across a socket
 * boundary, tool calls and reasoning. The inline reader this replaces got the
 * last three wrong and could only ever produce text.
 *
 * `commitSet(expr)` is how each framework writes a whole new messages array, and
 * `setterAdapter` is the `SetMessages` updater createAssistantStream drives.
 */
function realStreamBody(opts: {
  pad: string;
  read: string;
  commitSet: (expr: string) => string;
  setterAdapter: string;
  setLoading: (v: 'true' | 'false') => string;
  bodyPayload: string;
  strictRoles?: boolean;
  toolLoop: boolean;
}): string {
  const { pad, read, commitSet, setterAdapter, setLoading, bodyPayload, strictRoles = false, toolLoop } = opts;
  const asConst = strictRoles ? ' as const' : '';
  const historyType = strictRoles ? ': ChatMessage[]' : '';
  return [
    `${pad}const value = e.detail.value.trim();`,
    `${pad}if (!value) return;`,
    `${pad}const history${historyType} = [...${read}, { id: crypto.randomUUID(), role: 'user'${asConst}, parts: [{ type: 'text', text: value }] }];`,
    `${pad}${commitSet('history')}`,
    `${pad}${setLoading('true')}`,
    `${pad}// createAssistantStream appends the in-flight assistant message and folds`,
    `${pad}// every delta onto its parts. readOpenAIStream parses the SSE: keep-alive`,
    `${pad}// comments, multi-line frames, split codepoints, tool calls, reasoning.`,
    `${pad}const stream = createAssistantStream(${setterAdapter});`,
    `${pad}try {`,
    `${pad}  const res = await fetch('/api/chat', {`,
    `${pad}    method: 'POST',`,
    `${pad}    headers: { 'Content-Type': 'application/json' },`,
    `${pad}    body: JSON.stringify(${bodyPayload}),`,
    `${pad}  });`,
    `${pad}  await readOpenAIStream(res, stream);`,
    ...(toolLoop ? toolLoopComment(`${pad}  `) : []),
    `${pad}} finally {`,
    `${pad}  stream.done();`,
    `${pad}  ${setLoading('false')}`,
    `${pad}}`,
  ].join('\n');
}

/**
 * The multi-round tool loop, emitted COMMENTED OUT.
 *
 * The kit never calls a consumer's function, and a live loop against tools that
 * do not exist yet would fail on the first run. Commented is the honest default:
 * the shape is there to uncomment, and nothing pretends to work that does not.
 */
function toolLoopComment(pad: string): string[] {
  return [
    ``,
    `${pad}// Multi-round tool loop. readOpenAIStream RETURNS the turn, so:`,
    `${pad}//`,
    `${pad}//   const turn = await readOpenAIStream(res, stream);`,
    `${pad}//   for (const call of turn.toolCalls) {`,
    `${pad}//     if (call.error || call.providerExecuted) continue;`,
    `${pad}//     const output = await runYourTool(call.name, call.input ?? {});`,
    `${pad}//     applyToolOutput(stream, call.id, output);`,
    `${pad}//   }`,
    `${pad}//   // then POST again with toOpenAIMessages(latestMessages) to let the`,
    `${pad}//   // model answer with the results. Cap the rounds: a runaway model is`,
    `${pad}//   // a runaway bill.`,
    `${pad}//`,
    `${pad}// applyToolOutput and toOpenAIMessages come from '@kitn.ai/ui/wire'.`,
  ];
}
```

Apply it at each of the five real-backend sites, with the per-framework setter:

- **`htmlWiring`** (plain JS, `chat` is the element):
  `commitSet: (e) => \`chat.messages = \${e};\``, `setterAdapter: '(fn) => { chat.messages = fn(chat.messages); }'`, `setLoading: (v) => \`chat.loading = \${v};\``, `read: 'chat.messages'`, `strictRoles: false`.
- **`renderJsx`** (react and next):
  `commitSet: (e) => \`setMessages(\${e});\``, `setterAdapter: 'setMessages'`, `setLoading: (v) => \`setLoading(\${v});\``, `read: 'messages'`, `strictRoles: true`. `setMessages` from `useState` IS a `SetMessages`: both are `(updater: (prev: T[]) => T[]) => void`.
- **`renderVue`**: `commitSet: (e) => \`messages.value = \${e};\``, `setterAdapter: '(fn) => { messages.value = fn(messages.value); }'`, `setLoading: (v) => \`loading.value = \${v};\``, `read: 'messages.value'`, `strictRoles: true`.
- **`renderSvelte`**: `commitSet: (e) => \`messages = \${e};\``, `setterAdapter: '(fn) => { messages = fn(messages); }'`, `setLoading: (v) => \`loading = \${v};\``, `read: 'messages'`, `strictRoles: true`.
- **`renderTanstackStart`**: same as `renderJsx`.

Pass `toolLoop: archetype.tags.includes('kai-tool')`, using whatever the archetype's tag list is actually called in `RenderCtx` at the call site.

- [ ] **Step 4: Emit the imports and drop the inline type for real backends**

Each real-backend scaffold needs two import lines added to the block it already emits:

```ts
import { createAssistantStream } from '@kitn.ai/ui/state';
import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';
```

For a tool archetype, extend the second to:

```ts
import { applyToolOutput, readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';
```

For `html`, emit the same two lines inside the existing `<script type="module">` block.

`chatMessageType` at `scaffold.ts:520` declares a LOCAL `ChatMessage` that is a subset of the real one: no `rawInput`, no `raw`, no `signature`, no `index`, no `source` or `file` variants. A scaffold that now hands its messages to `toOpenAIMessages` must use the real type, so:

- when `isMock`, keep emitting `chatMessageType` exactly as today;
- otherwise emit `import type { ChatMessage } from '@kitn.ai/ui/state';` in place of it.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/`
Expected: PASS, including every pre-existing scaffold test.

- [ ] **Step 6: Typecheck**

Run: `pnpm exec nx typecheck ui`
Expected: PASS 4/4. The MCP pass (`tsconfig.mcp.json`) is one of the four.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/agent-tooling
git commit -m "feat(mcp)!: scaffolds import the wire adapter instead of inlining a text-only reader

Real-backend scaffolds now use readOpenAIStream and toOpenAIMessages, so a
scaffolded app with kai-tool in its archetype can actually populate the panel and
run a multi-round loop. mock stays inline and import-free."
```

---

### Task 17: Docs, README and the nine `streamMapping` strings

**Files:**
- Modify: `packages/ui/src/agent-tooling/integrations/{mock,mastra,pydantic-ai,openrouter,cloudflare,langgraph,ollama,vercel-ai-sdk,pi}.ts`
- Modify: `packages/ui/README.md`
- Modify: `apps/docs/src/content/docs/guides/recipes/streaming.mdx`
- Modify: `apps/docs/src/content/docs/guides/getting-started.mdx`
- Modify: `apps/docs/src/content/docs/guides/use-the-chat-app.mdx`
- Create: `apps/docs/src/content/docs/guides/recipes/wire-adapter.mdx`

**Interfaces:**
- Consumes: the shipped `@kitn.ai/ui/wire` surface from Task 14.
- Produces: prose only. No source behaviour changes.

Six of the nine `streamMapping` strings currently end with some phrasing of "kai-chat's SSE reader handles it", which describes a thing that did not exist. Now it does, under a name.

**Do not touch `apps/docs/src/content/docs/guides/recipes/text-to-speech.mdx`.** Its `res.body.getReader()` reads an AUDIO stream, not chat SSE.

Copy rules: `apps/docs/STYLE.md`, no em dashes, no emoji, terse for developers, web-components-first framing.

- [ ] **Step 1: Write the failing test for the catalog strings**

Add to `packages/ui/src/agent-tooling/types.test.ts` (or a sibling if that file is purely schema tests):

```ts
import { integrations } from './registry';

describe('streamMapping copy', () => {
  it('has every catalog entry', () => {
    expect(integrations.length).toBe(9);
  });

  it('never claims a reader that does not exist', () => {
    for (const integration of integrations) {
      expect(
        integration.streamMapping,
        `${integration.id} still refers to a nameless built-in reader`,
      ).not.toMatch(/kai-chat's (SSE )?reader|Streaming-recipe reader|kai-chat SSE reader/i);
    }
  });

  it('names the adapter wherever an OpenAI-format stream is described', () => {
    for (const integration of integrations) {
      expect(
        integration.streamMapping,
        `${integration.id} describes a stream but does not say what parses it`,
      ).toMatch(/readOpenAIStream/);
    }
  });
});
```

`integrations` is the `Integration[]` exported from `packages/ui/src/agent-tooling/registry.ts:13`, and each entry has an `id` (`openrouter.ts:4`). `mock` is included in the second assertion on purpose: its rewritten string below names the adapter as what takes over on the swap to a real backend, so there is no exemption to maintain.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/`
Expected: FAIL on six of the nine.

- [ ] **Step 3: Rewrite the nine strings**

Replace the reader clause in each. The exact replacement phrase, used verbatim wherever the old one appeared:

> `readOpenAIStream` from `@kitn.ai/ui/wire` parses it, including tool calls and reasoning.

So, for example, `openrouter.ts`:

```ts
  streamMapping:
    'OpenRouter returns OpenAI-format SSE. Pipe upstream.body straight to the browser; readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning.',
```

and `mock.ts`, which streams nothing real:

```ts
  streamMapping:
    'No backend. The scaffold streams a canned reply client-side by folding tokens onto the message parts, so nothing parses a wire format. Swap to a real integration and readOpenAIStream from @kitn.ai/ui/wire takes over.',
```

Apply the same clause swap in `mastra.ts`, `pydantic-ai.ts`, `cloudflare.ts`, `langgraph.ts`, `ollama.ts`, `vercel-ai-sdk.ts` and `pi.ts`, leaving every provider-specific instruction in those strings untouched. `pi.ts` already describes mapping `thinking_delta` and `toolcall_*` events; keep that and add that once re-framed, the adapter picks both up.

- [ ] **Step 4: Write the wire-adapter recipe**

Create `apps/docs/src/content/docs/guides/recipes/wire-adapter.mdx`. It must contain, in this order:

1. One paragraph: the kit parses the stream, you own the transport.
2. The smallest React consumer, copied from the spec:

```tsx
import { createAssistantStream } from '@kitn.ai/ui/state';
import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';

const chat = useKaiChat({
  onSubmit: async ({ value }) => {
    const user = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: value }],
    };
    chat.append(user);
    const stream = chat.streamAssistant();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: toOpenAIMessages([...chat.messages, user]) }),
      });
      await readOpenAIStream(res, stream);
    } finally {
      stream.done();
    }
  },
});
```

3. A "Both formats" section showing `readAnthropicStream` and the `WireFormat` seam:

```ts
import { readModelStream, type WireFormat } from '@kitn.ai/ui/wire';

const myFormat: WireFormat = {
  id: 'acme.events',
  open() {
    return { push: (frame) => (isTextFrame(frame) ? [{ text: frame.text }] : []) };
  },
};

await readModelStream(res, stream, { format: myFormat });
```

4. A "Tool loop" section with the fifteen-line host loop, matching `toolLoopComment` from Task 16 exactly so the two never drift.
5. An "Extended thinking round-trips" section stating the rule plainly: reasoning parts carry the provider's own block in `part.raw`, `toAnthropicMessages` echoes it verbatim, and stripping `raw` in a persistence layer makes the encoder throw rather than sending a request Anthropic answers with a 400.
6. An "Errors" section: `WireError` for a non-ok response with `status` / `statusText` / `body`, versus `ModelTurn.error` for an error frame inside a 200.
7. A "What this does not do" section listing the non-goals verbatim from the spec: no retries or reconnect, no tool executor or loop driver, no key handling or hosted client, no server-side route helpers, no non-SSE transports, no tolerant partial-JSON closer.
8. A short "Regenerating the fixtures" note pointing at `packages/ui/scripts/capture-wire-fixture.mjs` and stating that CI never runs it.

- [ ] **Step 5: Update the three pages that show a hand-rolled reader**

In `apps/docs/src/content/docs/guides/recipes/streaming.mdx`, replace the two hand-rolled readers (around lines 53 and 132) with `readOpenAIStream`, and keep ONE hand-rolled version at the bottom under a heading like `Without the adapter`, prefaced by a sentence saying it handles text only and does not handle multi-line frames or split codepoints. Link to the new recipe.

In `apps/docs/src/content/docs/guides/getting-started.mdx` (around line 97) and `apps/docs/src/content/docs/guides/use-the-chat-app.mdx` (around line 83), replace the reader outright and link to the new recipe. Neither page is the place to teach SSE framing.

- [ ] **Step 6: Update the README streaming example**

In `packages/ui/README.md`, replace the hand-rolled reader with the adapter, and keep the surrounding prose about a new array reference per chunk: that rule still holds and `createAssistantStream` is what satisfies it.

- [ ] **Step 7: Verify**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/
grep -rn "getReader()" apps/docs/src/content/docs packages/ui/README.md
grep -rnP '\x{2014}' apps/docs/src/content/docs/guides/recipes/wire-adapter.mdx packages/ui/src/agent-tooling/integrations
```

Expected: catalog tests PASS; the only `getReader()` hits are the `text-to-speech.mdx` audio reader and the one deliberate `Without the adapter` block in `streaming.mdx`; the em dash grep returns NOTHING.

Then build the docs site to be sure the new page is valid MDX:

```bash
pnpm exec nx build docs
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/agent-tooling/integrations packages/ui/src/agent-tooling/types.test.ts \
        packages/ui/README.md apps/docs/src/content/docs
git commit -m "docs(wire): name the adapter in the integration catalog, the README and the recipes"
```

---

### Task 18: Spike teardown

**Files:**
- Delete: `examples/internal/openrouter-spike/src/model-stream.ts`, `src/model-stream.test.ts`, `src/sse-frames.ts`, `src/sse-frames.test.ts`, `src/fixtures/model-chunks.ts`, `server/sdk-bridge.ts`, `server/sdk-bridge.test.ts`
- Modify: `examples/internal/openrouter-spike/server/openrouter-proxy.ts`
- Modify: `examples/internal/openrouter-spike/src/transport.ts`
- Modify: `examples/internal/openrouter-spike/src/hooks/useSpikeChat.ts`
- Modify: `examples/internal/openrouter-spike/src/App.tsx`, `src/components/ThreadView.tsx`, `src/components/ModelPanel.tsx`
- Modify: `examples/internal/openrouter-spike/package.json`
- Modify: `examples/internal/openrouter-spike/FINDINGS.md`
- Create: `examples/internal/openrouter-spike/src/transport.test.ts`

**Interfaces:**
- Consumes: `@kitn.ai/ui/wire` (`readOpenAIStream`, `toOpenAIMessages`, `applyToolOutput`, `WireError`, `type ModelTurn`) and `@kitn.ai/ui/state`, both through the workspace link.
- Produces: a spike that is a THIN app over the shipped adapter, which is exactly what makes it a useful smoke test.

**Keep the spike.** It is the only live smoke test against a real model. What goes is the code that now lives in the kit.

**Test count changes here, and this is the one expected change to the baseline.** The spike's 40 tests (20 `model-stream`, 4 `sse-frames`, 16 `sdk-bridge`) all disappear: their coverage moved into `packages/ui/src/wire/**` in Tasks 3 to 15, expanded. A new 4-test `transport.test.ts` keeps `pnpm --filter @kitn.ai/ui-example-openrouter-spike test` meaningful instead of erroring with "no test files found". End state: **spike 4/4**, kit unit suite up by roughly 130 tests across the new `src/wire/` files.

- [ ] **Step 1: Write the failing transport test**

Create `examples/internal/openrouter-spike/src/transport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WireError, readOpenAIStream } from '@kitn.ai/ui/wire';
import { openChatStream } from './transport';

const SSE =
  ': OPENROUTER PROCESSING\n\n' +
  'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
  'data: [DONE]\n\n';

const nullSink = () => ({
  appendText: () => undefined,
  appendReasoning: () => undefined,
  upsertTool: () => undefined,
  addSource: () => undefined,
});

function stubFetch(response: Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => response) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe('openChatStream', () => {
  it('returns the RESPONSE, so the kit owns the parsing', async () => {
    const restore = stubFetch(new Response(SSE, { status: 200 }));
    try {
      const res = await openChatStream({ messages: [], cardMode: 'tool' });
      expect(res).toBeInstanceOf(Response);
      const turn = await readOpenAIStream(res, nullSink());
      expect(turn.text).toBe('Hi');
      expect(turn.stopReason).toBe('stop');
    } finally {
      restore();
    }
  });

  it('surfaces a proxy failure as a WireError through the reader', async () => {
    const restore = stubFetch(
      new Response(JSON.stringify({ error: { message: 'no key configured' } }), {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );
    try {
      const res = await openChatStream({ messages: [], cardMode: 'tool' });
      const err = (await readOpenAIStream(res, nullSink()).catch((e: unknown) => e)) as WireError;
      expect(err).toBeInstanceOf(WireError);
      expect(err.status).toBe(500);
      expect(err.message).toContain('no key configured');
    } finally {
      restore();
    }
  });

  it('never mentions the provider host in the client bundle', async () => {
    const src = await import('./transport?raw').then((m) => m.default as string);
    expect(src).not.toContain('openrouter.ai');
    expect(src).not.toContain('API_KEY');
  });

  it('posts to the local proxy with the fields the proxy reads', async () => {
    let seen: RequestInit | undefined;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return new Response(SSE, { status: 200 });
    }) as typeof fetch;
    try {
      await openChatStream({ messages: [{ role: 'user', content: 'hi' }], cardMode: 'tool' });
      expect(JSON.parse(String(seen?.body))).toMatchObject({ cardMode: 'tool' });
    } finally {
      globalThis.fetch = original;
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kitn.ai/ui-example-openrouter-spike test`
Expected: FAIL. `openChatStream` currently returns `sseJson(...)`, not a `Response`, and `@kitn.ai/ui/wire` needs the kit built. Build first if it does not resolve: `pnpm exec nx build ui`.

- [ ] **Step 3: Shrink the transport**

Replace `examples/internal/openrouter-spike/src/transport.ts`'s stream function. The whole file's import of `./sse-frames` and `./model-stream` goes away; `WireMessage` becomes the kit's `OpenAIWireMessage`.

```ts
// Browser-side transport. Talks ONLY to the local dev proxy: no provider SDK, no
// API key, no openrouter.ai host anywhere in this file (or in any file the client
// bundle reaches).
//
// This used to parse SSE itself. It does not any more: the proxy forwards raw
// upstream SSE and `readOpenAIStream` from @kitn.ai/ui/wire parses it. Handing
// back the Response is the whole job.
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';
import type { ToolSpec } from './tools';

export type CardMode = 'tool' | 'structured';

export interface ChatStreamRequest {
  messages: OpenAIWireMessage[];
  tools?: ToolSpec[];
  cardMode: CardMode;
  signal?: AbortSignal;
}

/** POST one turn and hand back the Response. A non-ok response is NOT unwrapped
 *  here: readOpenAIStream turns it into a WireError carrying the provider's own
 *  error body, which is strictly more information than a bare Error. */
export function openChatStream(req: ChatStreamRequest): Promise<Response> {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: req.messages, tools: req.tools, cardMode: req.cardMode }),
    signal: req.signal,
  });
}
```

Keep `SpikeConfig` and `fetchSpikeConfig` exactly as they are.

- [ ] **Step 4: Make the proxy forward raw upstream SSE**

Rewrite the `/api/chat` handler in `examples/internal/openrouter-spike/server/openrouter-proxy.ts` to `fetch` OpenRouter's HTTP endpoint directly and pipe the body through, deleting every `@openrouter/sdk` import and the `toModelChunk` / `toSdkMessages` calls. The security contract at the top of that file is UNCHANGED and must stay verbatim: the key is still read with `loadEnv(mode, root, '')`, still never logged, still never sent to the browser, and the plugin is still `apply: 'serve'`.

```ts
const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.key}`,
  },
  body: JSON.stringify({
    model: env.model,
    stream: true,
    messages,
    ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
    ...(cardMode === 'structured' ? { response_format: REPLY_WITH_CARD_FORMAT } : {}),
    ...(env.reasoningEffort && !['off', 'none'].includes(env.reasoningEffort)
      ? { reasoning: { effort: env.reasoningEffort } }
      : {}),
    max_tokens: env.maxTokens,
  }),
});

if (!upstream.ok || !upstream.body) {
  // The upstream error body passes through unchanged so WireError can carry it.
  res.statusCode = upstream.status;
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
  res.end(await upstream.text());
  return;
}

// Forward the bytes UNTOUCHED. Every integration template in the catalog does
// exactly this, so the spike now exercises the same path a consumer takes.
res.statusCode = 200;
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-store');
res.setHeader('Connection', 'keep-alive');
const reader = upstream.body.getReader();
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  res.write(value);
}
res.end();
```

The message body arriving from the browser is already OpenAI-shaped, because `useSpikeChat` builds it with `toOpenAIMessages`, so no mapping is left to do.

- [ ] **Step 5: Rewrite the hook against the shipped adapter**

In `examples/internal/openrouter-spike/src/hooks/useSpikeChat.ts`:

- Import from the package instead of `../model-stream`:
  ```ts
  import {
    applyToolOutput,
    bufferText,
    readOpenAIStream,
    toOpenAIMessages,
    type ModelTurn,
    type OpenAIWireMessage,
  } from '@kitn.ai/ui/wire';
  ```
- Keep the `MAX_ROUNDS` cap, the `TurnStats` panel and the whole round loop. That loop is the point of the spike.
- Replace `const chunks = await openChatStream(...); const turn = await consumeModelStream(chunks, sink, {...})` with:
  ```ts
  const res = await openChatStream({ messages: [...wireRef.current], tools, cardMode });
  const turn = await readOpenAIStream(res, sink, { reasoningLabel: 'Thinking' });
  ```
- Drop `onToolArgumentsDelta`, the `partialArgs` state, and `partialArgs` from `SpikeChat`. `ToolPart.rawInput` now streams onto the part, so `<kai-tool>` shows it and the app renders nothing itself.
- Drop `sources` and `cards` state, `resolveCard`, and their fields on `SpikeChat`. A gives both a part: replace `setSources(...)` with `stream.addSource(...)` per source and `setCards(...)` with `stream.addCard(card)`. Both land IN the message, in order.
- `assistantWireMessage` and `toolResultWireMessage` are gone. Rebuild `wireRef.current` from the messages after each round:
  ```ts
  // The kit's encoder is the single source of truth for what goes back, and it
  // keeps rawInput verbatim so the provider accepts the echoed tool block.
  wireRef.current = [systemMessage, ...toOpenAIMessages(chat.messages)];
  ```
  where `systemMessage` is the existing `{ role: 'system', content: ... }` object, kept as a local rather than pushed into a mutable array.
- Update `TurnStats.reasoningChars` to read `turn.reasoning.length` (unchanged) and add `stopReason: turn.stopReason ?? null` beside `finishReason` so the debug panel shows both. Rework 3 is worth seeing in the UI.

- [ ] **Step 6: Delete the trays**

- `src/components/ThreadView.tsx`: delete the `partialArgs` prop and the pending-arguments strip, and the comment block explaining why the kit could not do it. Update that comment to say `ToolPart.rawInput` now carries it.
- `src/components/ModelPanel.tsx`: delete the `sources` and `cards` props and both sections, including the two `rendered outside the message: ChatMessage has no ...` notes. Keep `error` and `stats`.
- `src/App.tsx`: drop `partialArgs`, `sources`, `cards` and `onCardResolved` from both call sites.

- [ ] **Step 7: Delete the moved files and the SDK dependency**

```bash
git rm examples/internal/openrouter-spike/src/model-stream.ts \
       examples/internal/openrouter-spike/src/model-stream.test.ts \
       examples/internal/openrouter-spike/src/sse-frames.ts \
       examples/internal/openrouter-spike/src/sse-frames.test.ts \
       examples/internal/openrouter-spike/src/fixtures/model-chunks.ts \
       examples/internal/openrouter-spike/server/sdk-bridge.ts \
       examples/internal/openrouter-spike/server/sdk-bridge.test.ts
```

Remove `"@openrouter/sdk": "^1.2.11"` from `devDependencies` in `examples/internal/openrouter-spike/package.json`, delete the `"//"` note above it that explains why it was a dev dependency, then `pnpm install`.

- [ ] **Step 8: Close out FINDINGS**

Append one section to `examples/internal/openrouter-spike/FINDINGS.md`, titled `What sub-project C closed`. State, in the file's existing voice:

- `src/model-stream.ts` and `src/sse-frames.ts` moved into `packages/ui/src/wire/` and ship as `@kitn.ai/ui/wire`.
- The four items in `Moving the adapter into the kit` are done: ordered message parts (A), `rawInput` on `ToolPart` (A plus rework 2), a reasoning shape that survives signed blocks and round-tripping (A's `raw` plus rework 1), and `./schemas/*` in the exports map if that shipped, or an explicit note that it did NOT and remains open.
- `sdk-bridge.ts` is deleted; the proxy forwards raw upstream SSE, so the repo no longer depends on `@openrouter/sdk`.
- The `What was not tested` list still stands unchanged, and C did not close any of it: long-running streams, rate limits, retries, non-Chromium browsers, and any model other than `~deepseek/deepseek-v4-flash-latest`.
- Anthropic support is validated by captured fixtures, several of which are `capture: synthetic`; the first live Anthropic run against this spike is expected to force one revision.

Do NOT rewrite the existing findings. They are the measured record.

- [ ] **Step 9: Verify the spike**

```bash
pnpm exec nx build ui
pnpm --filter @kitn.ai/ui-example-openrouter-spike test
pnpm --filter @kitn.ai/ui-example-openrouter-spike exec tsc -b --pretty false
pnpm --filter @kitn.ai/ui-example-openrouter-spike build
grep -rn "openrouter/sdk" examples/internal/openrouter-spike
```

Expected: 4/4 tests, typecheck clean, build clean, and NO hits for `openrouter/sdk` anywhere including `package.json`.

Then the live smoke test, which is the reason the spike still exists. With `OPENROUTER_API_KEY` set, run `pnpm --filter @kitn.ai/ui-example-openrouter-spike dev` and confirm in the browser:

1. text streams into the thread;
2. reasoning renders live in the disclosure;
3. a tool panel appears and its arguments fill in character by character while `input-streaming` (this is rework 2 visible for the first time);
4. the panel completes after the local tool runs;
5. a citation chip and a card both render INSIDE the message, not in a tray;
6. the debug panel shows both `finishReason` and `stopReason`.

If no key is available, say so plainly in the commit body. Do not claim the live run passed.

- [ ] **Step 10: Commit**

```bash
git add examples/internal/openrouter-spike pnpm-lock.yaml
git commit -m "refactor(spike): consume @kitn.ai/ui/wire and drop the provider SDK

model-stream.ts, sse-frames.ts and sdk-bridge.ts are deleted; their content and
tests moved into packages/ui/src/wire/. The proxy forwards raw upstream SSE, so
the repo no longer depends on @openrouter/sdk. The sources, cards and
partial-arguments trays are gone: all three are message parts now."
```

---

### Task 19: Full verification and PR

- [ ] **Step 1: Full green gate**

```bash
pnpm exec nx typecheck ui
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm exec nx build ui
git status --porcelain
pnpm --filter @kitn.ai/ui-example-openrouter-spike test
pnpm exec nx build docs
```

Expected: typecheck 4/4; unit suite green with roughly 130 more tests than the 1376 baseline across the new `src/wire/` files, and NO pre-existing test removed except the ones this plan explicitly replaced; build green; **`git status --porcelain` EMPTY**; spike 4/4; docs build clean.

If `git status` is not empty after the build, a generated file drifted. Diff it, decide whether the change is legitimate, and either commit it as a fixpoint update or fix the generator. Do not leave the branch with a build that is not a fixpoint.

- [ ] **Step 2: Confirm the entry is real for a consumer**

```bash
node -e "
const p = require('./packages/ui/package.json');
if (!p.exports['./wire']) throw new Error('./wire missing from exports');
console.log(p.exports['./wire']);
"
node --input-type=module -e "
import * as wire from './packages/ui/dist/wire.js';
const required = ['readModelStream','readOpenAIStream','readAnthropicStream','consumeModelStream','createToolCallAccumulator','applyToolOutput','applyToolFailure','bufferText','sseDataFrames','sseJson','readableToAsyncIterable','normalizeStopReason','openaiChatFormat','anthropicMessagesFormat','WireError','toOpenAIMessages','toAnthropicMessages','WireEncodeError'];
const missing = required.filter((k) => !(k in wire));
if (missing.length) throw new Error('missing from dist/wire.js: ' + missing.join(', '));
console.log('wire entry exports all', required.length, 'values');
"
ls packages/ui/dist/wire/index.d.ts
```

Expected: all three succeed.

- [ ] **Step 3: Confirm no provider SDK reached the kit**

```bash
grep -rn "@openrouter/sdk\|from 'openai'\|@anthropic-ai/sdk" packages/ui/src packages/ui/package.json
```
Expected: NO hits. This is the non-negotiable in the spec, and it is worth a grep rather than a memory.

- [ ] **Step 3b: Re-confirm the starters were untouched**

```bash
git diff --name-only main...HEAD -- examples/starters
grep -rn "getReader()\|startsWith('data:')" examples/starters
```

Expected: the first prints NOTHING. The second's only hit is `examples/starters/tanstack-start/serve.mjs:55`, which pipes a web `Response` body into a Node response and parses nothing, so it is correct as-is and must NOT be changed. The spec's "starters: no change" claim is re-verified here rather than assumed.

- [ ] **Step 4: Confirm CI still cannot capture fixtures**

```bash
grep -rn "capture-wire-fixture" packages/ui/package.json packages/ui/project.json .github/ nx.json 2>/dev/null
```
Expected: NO hits.

- [ ] **Step 5: Confirm the house rules held**

```bash
grep -rnP '\x{2014}' packages/ui/src/wire packages/ui/scripts/capture-wire-fixture.mjs packages/ui/vite.config.wire.ts apps/docs/src/content/docs/guides/recipes/wire-adapter.mdx
```
Expected: NO hits. Em dashes are an AI tell and this branch does not ship any.

- [ ] **Step 6: Storybook smoke**

Run `pnpm exec nx dev ui`, open a Labs thread story, and confirm a message with an empty-text reasoning part renders no blank disclosure while a normal reasoning part still renders. `storybook-static` cannot register web components, so this must use the dev server, and Storybook must be RESTARTED if shadow CSS changed.

- [ ] **Step 7: Open the PR**

```bash
git push -u origin feat/message-parts
gh pr create --title "feat(wire): model-stream adapter for OpenAI and Anthropic SSE" --body "..."
```

The body must:

- link `docs/superpowers/specs/2026-08-09-wire-adapter-design.md` and this plan;
- list the four spike reworks and where each landed (fingerprint fast path Task 1, empty-reasoning render guard Task 2, reasoning guard and `stopReason` Task 4, streaming `rawInput` Task 5);
- state that `@kitn.ai/ui/wire` is a NEW entry and nothing existing broke, so this is a `feat`, not a `feat!`, EXCEPT the scaffolder change in Task 16, which changes emitted output and is marked `feat(mcp)!`;
- name every fixture still carrying `capture: synthetic` and say plainly that the Anthropic path is validated by fixtures rather than a live run;
- carry the FINDINGS `What was not tested` list forward as known-open: long-running streams, rate limits, retries, non-Chromium browsers.

- [ ] **Step 8: Report what is still open**

Not defects, but the spec's own risk list, which this plan does not close and the PR should not pretend it does:

- `ConsumeOptions.keepRaw` was considered and NOT shipped. `raw` roughly doubles message size and `wire` is what fills it. Revisit if it measures badly.
- The `WireFormat` seam is unproven by a third party. Two formats by the same author is weak evidence it generalizes; AG-UI is the real test.
- `ModelToolCallDelta.index` means different things per format. Documented on the field, but a third-party author will still assume the wrong one.
- Bundle duplication: importing both `./state` and `./wire` ships `state/parts.ts` twice, about 2 KB. Accepted unless it measures worse.
- File attachments have no encoding in either encoder.

