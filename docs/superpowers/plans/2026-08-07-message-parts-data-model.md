# Message Parts Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ChatMessage.content: string` with an ordered, closed, typed `parts: MessagePart[]` union so text, reasoning, tool calls, cards, sources and files can interleave in the order a model actually produced them.

**Architecture:** One breaking change landed in a single PR. Pure helpers first (classifier, fingerprint, part folding), then the stream API that composes them, then the Solid components, then the element facades, then every consumer (React wrappers, stories, tests, MCP scaffolder, 8 starters, the spike). Every part carries an optional `raw` sidecar holding its untranslated provider payload, which is what makes Anthropic round-trip legal.

**Tech Stack:** SolidJS, TypeScript, Vite, vitest (jsdom `unit` project), NX, pnpm.

Spec: `docs/superpowers/specs/2026-08-07-message-parts-data-model-design.md`. Read it before starting.

## Global Constraints

- Run all commands from the **repo root**. pnpm + NX workspace.
- Unit suite: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit`. Do NOT run bare `pnpm test` (it also runs the flaky storybook browser project).
- Typecheck: `nx typecheck ui` (4 tsc passes). Build: `nx build ui`.
- **After any `nx build ui`, run `git checkout -- packages/ui/src/components/component-meta.json`.** It churns with type-expansion noise and is not used at runtime.
- Elements are prefixed `kai-`, never `kitn-`.
- Array/object props are set as JS **properties**, never HTML attributes.
- Events are non-bubbling `kai-*` CustomEvents.
- Streaming requires a **new array/object reference per chunk**. Never mutate in place.
- Conventional commits (release-please). Pre-1.0, so breaking changes use `feat!` and cut a minor.
- No em dashes in any prose, comment, or doc. House rule.
- This is a clean break: **no compatibility shim, no deprecated `content` field, no dual path.**

---

### Task 1: Core types and the tool classifier

**Files:**
- Modify: `packages/ui/src/components/tool-types.ts`
- Create: `packages/ui/src/components/tool-classify.ts`
- Create: `packages/ui/src/components/tool-classify.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ToolKind`, `classifyTool(name: string): ToolKind`, and the extended `ToolPart` with `kind?`, `rawInput?`, `raw?`.

`ToolPart` today is at `packages/ui/src/components/tool-types.ts:3` and already has an `errorText?: string` field. **Preserve it.**

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/components/tool-classify.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyTool } from './tool-classify';

describe('classifyTool', () => {
  it('classifies shell-ish tools as command', () => {
    expect(classifyTool('bash')).toBe('command');
    expect(classifyTool('run_terminal_command')).toBe('command');
    expect(classifyTool('Shell')).toBe('command');
  });

  it('classifies mutation tools as file-change', () => {
    expect(classifyTool('str_replace_editor')).toBe('file-change');
    expect(classifyTool('write_file')).toBe('file-change');
  });

  it('classifies search before fetch so web_search is a search', () => {
    expect(classifyTool('web_search')).toBe('search');
    expect(classifyTool('grep')).toBe('search');
  });

  it('classifies fetch-ish tools as fetch', () => {
    expect(classifyTool('fetch_url')).toBe('fetch');
  });

  it('classifies image tools as image', () => {
    expect(classifyTool('view_image')).toBe('image');
  });

  it('always terminates in generic for unknown names', () => {
    expect(classifyTool('propose_action')).toBe('generic');
    expect(classifyTool('')).toBe('generic');
    expect(classifyTool('zzzz')).toBe('generic');
  });

  it('is deterministic and case-insensitive', () => {
    expect(classifyTool('BASH')).toBe(classifyTool('bash'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/tool-classify.test.ts`
Expected: FAIL, cannot resolve `./tool-classify`.

- [ ] **Step 3: Write the classifier**

Create `packages/ui/src/components/tool-classify.ts`:

```ts
/** Semantic classification of a tool call, used to pick a rendering. Derived from
 *  the provider-chosen tool NAME, which is arbitrary, so this stays conservative and
 *  prefers 'generic' over a confident wrong answer. */
export type ToolKind =
  | 'command'
  | 'file-change'
  | 'search'
  | 'fetch'
  | 'mcp'
  | 'image'
  | 'generic';

/** Total, deterministic, side-effect free. ALWAYS terminates in 'generic' so an
 *  unrecognized tool still renders a panel instead of a blank. Order matters:
 *  'search' is tested before 'fetch' so `web_search` classifies as a search. */
export function classifyTool(name: string): ToolKind {
  const n = name.toLowerCase();
  if (!n) return 'generic';
  if (n.includes('bash') || n.includes('command') || n.includes('shell') || n.includes('terminal') || n.includes('exec')) return 'command';
  if (n.includes('edit') || n.includes('write') || n.includes('patch') || n.includes('replace') || n.includes('delete')) return 'file-change';
  if (n.includes('search') || n.includes('grep') || n.includes('glob') || n.includes('find')) return 'search';
  if (n.includes('fetch') || n.includes('http') || n.includes('browse') || n.includes('crawl')) return 'fetch';
  if (n.includes('mcp')) return 'mcp';
  if (n.includes('image') || n.includes('screenshot') || n.includes('vision')) return 'image';
  return 'generic';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/tool-classify.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Extend `ToolPart`**

Replace the interface in `packages/ui/src/components/tool-types.ts` (keep everything else in that file):

```ts
import type { ToolKind } from './tool-classify';
import type { RawOrigin } from '../elements/chat-types';

export interface ToolPart {
  /** The tool name exactly as the provider reported it. */
  type: string;
  /** Semantic classification for rendering. Derive with classifyTool(type). */
  kind?: ToolKind;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  /** Last VALID parsed snapshot, fingerprint-deduped. The primary channel: this is
   *  what the kit renders. */
  input?: Record<string, unknown>;
  /** Raw accumulated argument fragments, for consumers wanting character-level
   *  streaming. Most consumers should read `input` instead. */
  rawInput?: string;
  output?: Record<string, unknown>;
  toolCallId?: string;
  errorText?: string;
  /** The untranslated provider payload this was normalized from. */
  raw?: RawOrigin;
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/tool-types.ts packages/ui/src/components/tool-classify.ts packages/ui/src/components/tool-classify.test.ts
git commit -m "feat(tools): semantic tool classification with a generic fallback"
```

---

### Task 2: The part union and `ChatMessage`

**Files:**
- Modify: `packages/ui/src/elements/chat-types.ts:34-49`

**Interfaces:**
- Consumes: `ToolPart` and `RawOrigin` (Task 1, already imported and re-exported in this file), `CardEnvelope` from `../primitives/card-contract`, `AttachmentData` from `../components/attachment-types`.
- Produces: `Source`, `MessagePart`, the rewritten `ChatMessage`.

This task is types only, so it has no runtime test. Its gate is `nx typecheck ui` failing everywhere `content` was read, which is the point: it produces the worklist for Tasks 4 through 10.

- [ ] **Step 1: Add the new types**

`RawOrigin` already lives in this file's import list by the time this task starts:
Task 1's layering fix made `chat-types.ts` do `import type { ToolPart, RawOrigin } from
'../components/tool-types';` and re-export `RawOrigin` from there. `RawOrigin` is
defined in `components/tool-types.ts`, not here, because `components/` may not import
from `elements/` and `ToolPart` needs it. Do not redefine `RawOrigin` in this file.

In `packages/ui/src/elements/chat-types.ts`, add above the `ChatMessage` interface:

```ts
import type { CardEnvelope } from '../primitives/card-contract';
import type { AttachmentData } from '../components/attachment-types';

/** A citation the model produced. */
export interface Source {
  id?: string;
  url?: string;
  title?: string;
  snippet?: string;
  /** Citation marker number, when the model numbers its citations. */
  index?: number;
}

/** One ordered piece of message content. Closed union: extension happens at the CARD
 *  layer via the card registry, not by adding variants here. */
export type MessagePart =
  | { type: 'text'; text: string; raw?: RawOrigin }
  | {
      type: 'reasoning';
      text: string;
      label?: string;
      /** Provider block index. Keeps parallel reasoning blocks distinct. */
      index?: number;
      /** Informational only. `raw` is the round-trip channel, not this. */
      signature?: string;
      raw?: RawOrigin;
    }
  | { type: 'tool'; tool: ToolPart; raw?: RawOrigin }
  | { type: 'card'; envelope: CardEnvelope; raw?: RawOrigin }
  | { type: 'source'; source: Source; raw?: RawOrigin }
  | { type: 'file'; attachment: AttachmentData; raw?: RawOrigin };
```

Note: `AttachmentData.type` is independently `'file' | 'source-document'`. The part's
`type: 'file'` and the attachment's own `type` are different fields at different
levels. Do not conflate them.

- [ ] **Step 2: Rewrite `ChatMessage`**

Replace the existing interface at `packages/ui/src/elements/chat-types.ts:34`:

```ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** The ONLY content channel. Ordered. */
  parts: MessagePart[];
  /** Action buttons under the message. Chrome, not content. */
  actions?: (ChatMessageAction | CustomAction)[];
  /** Optional speaker avatar shown to the left of the message column. */
  avatar?: AvatarData;
  /** Controlled feedback vote. */
  feedback?: FeedbackVote;
}
```

`content`, `reasoning`, `tools` and `attachments` are removed. Do not add them back.

- [ ] **Step 3: Run typecheck to produce the worklist**

Run: `nx typecheck ui 2>&1 | tee /tmp/parts-worklist.txt`
Expected: FAIL with many errors. Save this output. It is the authoritative list of consumers to migrate in Tasks 4 through 10.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/elements/chat-types.ts
git commit -m "feat(types)!: ChatMessage.parts replaces content/reasoning/tools/attachments"
```

---

### Task 3: Pure part-folding helpers

**Files:**
- Create: `packages/ui/src/state/parts.ts`
- Create: `packages/ui/src/state/parts.test.ts`

**Interfaces:**
- Consumes: `MessagePart` (Task 2), `ToolPart` and `classifyTool` (Task 1).
- Produces: `fingerprint(value: unknown): string`, `appendTextPart(parts, delta)`, `appendReasoningPart(parts, delta, opts)`, `upsertToolPart(parts, toolCallId, patch)`. All pure, all returning NEW arrays.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/state/parts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { appendReasoningPart, appendTextPart, fingerprint, upsertToolPart } from './parts';
import type { MessagePart } from '../elements/chat-types';

describe('fingerprint', () => {
  it('is stable across key order', () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
  });
  it('is stable for nested objects', () => {
    expect(fingerprint({ o: { x: 1, y: 2 } })).toBe(fingerprint({ o: { y: 2, x: 1 } }));
  });
  it('distinguishes different values', () => {
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});

describe('appendTextPart', () => {
  it('opens a text part when empty', () => {
    expect(appendTextPart([], 'hi')).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('appends to a trailing text part', () => {
    const out = appendTextPart([{ type: 'text', text: 'he' }], 'llo');
    expect(out).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('OPENS A NEW PART when the last part is not text', () => {
    const parts: MessagePart[] = [
      { type: 'text', text: 'Checking.' },
      { type: 'tool', tool: { type: 'get_weather', state: 'output-available' } },
    ];
    const out = appendTextPart(parts, 'Done.');
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({ type: 'text', text: 'Done.' });
    expect(out[0]).toEqual({ type: 'text', text: 'Checking.' });
  });

  it('returns a new array reference', () => {
    const parts: MessagePart[] = [];
    expect(appendTextPart(parts, 'x')).not.toBe(parts);
  });
});

describe('appendReasoningPart', () => {
  it('keeps blocks with distinct indexes separate', () => {
    let parts: MessagePart[] = [];
    parts = appendReasoningPart(parts, 'first', { index: 0 });
    parts = appendReasoningPart(parts, 'second', { index: 1 });
    parts = appendReasoningPart(parts, '!', { index: 0 });
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ type: 'reasoning', text: 'first!', index: 0 });
    expect(parts[1]).toMatchObject({ type: 'reasoning', text: 'second', index: 1 });
  });

  it('preserves signature and raw', () => {
    const raw = { source: 'anthropic.content_block', payload: { sig: 'abc' } };
    const parts = appendReasoningPart([], 'x', { index: 0, signature: 'sig', raw });
    expect(parts[0]).toMatchObject({ signature: 'sig', raw });
  });
});

describe('upsertToolPart', () => {
  it('creates a tool part and derives kind', () => {
    const parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming' });
    expect(parts[0]).toMatchObject({
      type: 'tool',
      tool: { type: 'bash', kind: 'command', state: 'input-streaming', toolCallId: 'tc1' },
    });
  });

  it('merges a patch into the existing tool', () => {
    let parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming' });
    parts = upsertToolPart(parts, 'tc1', { state: 'output-available', output: { ok: true } });
    expect(parts).toHaveLength(1);
    expect((parts[0] as { tool: { state: string } }).tool.state).toBe('output-available');
  });

  it('is a NO-OP when the merged tool fingerprints identically', () => {
    const parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming', input: { a: 1 } });
    const same = upsertToolPart(parts, 'tc1', { input: { a: 1 } });
    expect(same).toBe(parts);
  });

  it('does NOT dedupe a genuinely changed input', () => {
    const parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming', input: { a: 1 } });
    const next = upsertToolPart(parts, 'tc1', { input: { a: 2 } });
    expect(next).not.toBe(parts);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/state/parts.test.ts`
Expected: FAIL, cannot resolve `./parts`.

- [ ] **Step 3: Implement the helpers**

Create `packages/ui/src/state/parts.ts`:

```ts
import type { MessagePart, RawOrigin } from '../elements/chat-types';
import type { ToolPart } from '../components/tool-types';
import { classifyTool } from '../components/tool-classify';

/** Stable structural fingerprint. Key order independent, so an identical snapshot
 *  arriving twice compares equal and can be skipped. */
export function fingerprint(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) return '[circular]';
    seen.add(v as object);
    const o = v as Record<string, unknown>;
    const out = Array.isArray(v)
      ? v.map(walk)
      : Object.fromEntries(Object.keys(o).sort().map((k) => [k, walk(o[k])]));
    seen.delete(v as object);
    return out;
  };
  return JSON.stringify(walk(value)) ?? '';
}

/** Appends to the trailing text part, or OPENS A NEW ONE if the last part is not
 *  text. This is what stops a post-tool answer being glued onto the pre-tool text. */
export function appendTextPart(parts: MessagePart[], delta: string): MessagePart[] {
  const last = parts[parts.length - 1];
  if (last?.type === 'text') {
    return [...parts.slice(0, -1), { ...last, text: last.text + delta }];
  }
  return [...parts, { type: 'text', text: delta }];
}

export interface ReasoningOpts {
  index?: number;
  label?: string;
  signature?: string;
  raw?: RawOrigin;
}

/** Keyed by block index so parallel reasoning blocks stay distinct. */
export function appendReasoningPart(
  parts: MessagePart[],
  delta: string,
  opts: ReasoningOpts = {},
): MessagePart[] {
  const index = opts.index ?? 0;
  const i = parts.findIndex((p) => p.type === 'reasoning' && (p.index ?? 0) === index);
  if (i < 0) {
    return [...parts, { type: 'reasoning', text: delta, index, label: opts.label, signature: opts.signature, raw: opts.raw }];
  }
  const cur = parts[i] as Extract<MessagePart, { type: 'reasoning' }>;
  const next: MessagePart = {
    ...cur,
    text: cur.text + delta,
    label: opts.label ?? cur.label,
    signature: opts.signature ?? cur.signature,
    raw: opts.raw ?? cur.raw,
  };
  return [...parts.slice(0, i), next, ...parts.slice(i + 1)];
}

/** Creates or merges a tool part. Returns the SAME array reference when the merge
 *  produces an identical tool, so repeated snapshots do not trigger a re-render. */
export function upsertToolPart(
  parts: MessagePart[],
  toolCallId: string,
  patch: Partial<ToolPart>,
): MessagePart[] {
  const i = parts.findIndex((p) => p.type === 'tool' && p.tool.toolCallId === toolCallId);
  if (i < 0) {
    const tool: ToolPart = {
      type: patch.type ?? 'unknown',
      state: patch.state ?? 'input-streaming',
      ...patch,
      toolCallId,
    };
    tool.kind = tool.kind ?? classifyTool(tool.type);
    return [...parts, { type: 'tool', tool }];
  }
  const cur = (parts[i] as Extract<MessagePart, { type: 'tool' }>).tool;
  const merged: ToolPart = { ...cur, ...patch, toolCallId };
  merged.kind = patch.kind ?? classifyTool(merged.type);
  if (fingerprint(merged) === fingerprint(cur)) return parts;
  return [...parts.slice(0, i), { type: 'tool', tool: merged }, ...parts.slice(i + 1)];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/state/parts.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Export the helpers from the `state` entry**

The starters (Task 10) import `appendTextPart` from `@kitn.ai/ui/state`, so it must be
public. Add to `packages/ui/src/state/index.ts`:

```ts
export { appendTextPart, appendReasoningPart, upsertToolPart, fingerprint } from './parts';
export type { ReasoningOpts } from './parts';
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/state/parts.ts packages/ui/src/state/parts.test.ts packages/ui/src/state/index.ts
git commit -m "feat(state): pure part-folding helpers with fingerprint dedupe"
```

---

### Task 4: Part-oriented `createAssistantStream`

**Files:**
- Modify: `packages/ui/src/state/stream.ts` (whole file, currently 92 lines)
- Modify: `packages/ui/src/state/stream.test.ts`

**Interfaces:**
- Consumes: helpers from Task 3.
- Produces: `AssistantStream` with `appendText`, `appendReasoning`, `upsertTool`, `addCard`, `addSource`, `addFile`, `done`, `abort`.

The existing API had `addTool` and `updateTool`. Both collapse into `upsertTool`. `onStreamSettled` at `stream.ts:78` stays as-is.

- [ ] **Step 1: Write the failing tests**

Add to `packages/ui/src/state/stream.test.ts` (keep existing tests that still apply, delete ones asserting `content` string concatenation):

```ts
it('opens a new text part after a tool call', () => {
  const messages: ChatMessage[] = [];
  const set: SetMessages = (fn) => { messages.splice(0, messages.length, ...fn(messages)); };
  const s = createAssistantStream(set);
  s.appendText('Checking. ');
  s.upsertTool('tc1', { type: 'get_weather', state: 'output-available', output: { c: 18 } });
  s.appendText('It is 18C.');
  const parts = messages[0].parts;
  expect(parts.map((p) => p.type)).toEqual(['text', 'tool', 'text']);
  expect((parts[0] as { text: string }).text).toBe('Checking. ');
  expect((parts[2] as { text: string }).text).toBe('It is 18C.');
});

it('keeps parallel reasoning blocks distinct', () => {
  const messages: ChatMessage[] = [];
  const set: SetMessages = (fn) => { messages.splice(0, messages.length, ...fn(messages)); };
  const s = createAssistantStream(set);
  s.appendReasoning('a', { index: 0 });
  s.appendReasoning('b', { index: 1 });
  expect(messages[0].parts.filter((p) => p.type === 'reasoning')).toHaveLength(2);
});

it('preserves raw on reasoning for round-trip', () => {
  const messages: ChatMessage[] = [];
  const set: SetMessages = (fn) => { messages.splice(0, messages.length, ...fn(messages)); };
  const raw = { source: 'anthropic.content_block', payload: { type: 'thinking', thinking: 'x', signature: 'SIG' } };
  const s = createAssistantStream(set);
  s.appendReasoning('x', { index: 0, raw });
  const part = messages[0].parts[0] as { raw?: unknown };
  expect(part.raw).toEqual(raw);
  expect(part.raw).toBe(raw);
});

it('produces a new array reference per mutation', () => {
  const seen: ChatMessage[][] = [];
  let cur: ChatMessage[] = [];
  const set: SetMessages = (fn) => { cur = fn(cur); seen.push(cur); };
  const s = createAssistantStream(set);
  s.appendText('a');
  s.appendText('b');
  expect(seen[0]).not.toBe(seen[1]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/state/stream.test.ts`
Expected: FAIL, `upsertTool is not a function` and `parts` undefined.

- [ ] **Step 3: Rewrite the stream**

Replace the body of `packages/ui/src/state/stream.ts`:

```ts
import type { ChatMessage, MessagePart, RawOrigin, Source } from '../elements/chat-types';
import type { ToolPart } from '../components/tool-types';
import type { CardEnvelope } from '../primitives/card-contract';
import type { AttachmentData } from '../components/attachment-types';
import { appendReasoningPart, appendTextPart, upsertToolPart, type ReasoningOpts } from './parts';

export type SetMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;

export interface AssistantStream {
  readonly id: string;
  appendText(delta: string): AssistantStream;
  appendReasoning(delta: string, opts?: ReasoningOpts): AssistantStream;
  upsertTool(toolCallId: string, patch: Partial<ToolPart>): AssistantStream;
  addCard(envelope: CardEnvelope): AssistantStream;
  addSource(source: Source): AssistantStream;
  addFile(attachment: AttachmentData): AssistantStream;
  done(): void;
  abort(reason?: string): void;
}

export function createAssistantStream(
  set: SetMessages,
  init: Partial<ChatMessage> = {},
): AssistantStream {
  const id = init.id ?? crypto.randomUUID();
  let settled = false;

  set((prev) => [...prev, { id, role: 'assistant', parts: [], ...init }]);

  const mutate = (fn: (parts: MessagePart[]) => MessagePart[]) => {
    if (settled) return;
    set((prev) => {
      const i = prev.findIndex((m) => m.id === id);
      if (i < 0) return prev;
      const next = fn(prev[i].parts);
      if (next === prev[i].parts) return prev;
      return [...prev.slice(0, i), { ...prev[i], parts: next }, ...prev.slice(i + 1)];
    });
  };

  const stream: AssistantStream = {
    id,
    appendText(delta) { mutate((p) => appendTextPart(p, delta)); return stream; },
    appendReasoning(delta, opts) { mutate((p) => appendReasoningPart(p, delta, opts)); return stream; },
    upsertTool(toolCallId, patch) { mutate((p) => upsertToolPart(p, toolCallId, patch)); return stream; },
    addCard(envelope) { mutate((p) => [...p, { type: 'card', envelope }]); return stream; },
    addSource(source) { mutate((p) => [...p, { type: 'source', source }]); return stream; },
    addFile(attachment) { mutate((p) => [...p, { type: 'file', attachment }]); return stream; },
    done() { settled = true; },
    abort(reason) {
      mutate((p) => p.map((part) =>
        part.type === 'tool' && part.tool.state !== 'output-available'
          ? { ...part, tool: { ...part.tool, state: 'output-error' as const, errorText: reason } }
          : part));
      settled = true;
    },
  };
  return stream;
}
```

Keep the existing `onStreamSettled` export unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/state/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/state/stream.ts packages/ui/src/state/stream.test.ts
git commit -m "feat(state)!: part-oriented createAssistantStream"
```

---

### Task 5: State layer consumers

**Files:**
- Modify: `packages/ui/src/state/messages.ts` and `messages.test.ts`
- Modify: `packages/ui/src/primitives/create-kai-chat.ts` and `create-kai-chat.test.ts`
- Modify: `packages/ui/src/primitives/message-feedback.ts` and `message-feedback.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 4.
- Produces: helpers that build messages from parts. Where a helper took `content: string`, it now takes `parts: MessagePart[]`. Add a `textMessage(role, text)` convenience to `messages.ts` so fixtures stay short.

- [ ] **Step 1: Add the convenience builder test**

In `packages/ui/src/state/messages.test.ts`:

```ts
import { textMessage } from './messages';

it('textMessage builds a single-text-part message', () => {
  const m = textMessage('user', 'hello');
  expect(m.role).toBe('user');
  expect(m.parts).toEqual([{ type: 'text', text: 'hello' }]);
  expect(typeof m.id).toBe('string');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/state/messages.test.ts`
Expected: FAIL, `textMessage` is not exported.

- [ ] **Step 3: Implement and migrate**

Add to `packages/ui/src/state/messages.ts`:

```ts
/** Convenience for the common single-text-part message. */
export function textMessage(role: ChatMessage['role'], text: string, init: Partial<ChatMessage> = {}): ChatMessage {
  return { id: init.id ?? crypto.randomUUID(), role, parts: [{ type: 'text', text }], ...init };
}
```

Add the read-side fold to `packages/ui/src/state/messages.ts`:

```ts
/** Concatenates every text part. Use where a plain string is genuinely needed
 *  (copy-to-clipboard, TTS, a length check). Do NOT use it for rendering. */
export function partsToText(parts: MessagePart[]): string {
  return parts.filter((p) => p.type === 'text').map((p) => p.text).join('');
}
```

**`appendContent` at `packages/ui/src/state/messages.ts:34` is a public export from
`@kitn.ai/ui/state` and is `content`-based. It must be replaced, not patched:**

```ts
// DELETE this
export function appendContent(messages: ChatMessage[], id: string, delta: string): ChatMessage[] {
  return messages.map((x) => (x.id === id ? { ...x, content: x.content + delta } : x));
}

// REPLACE with
export function appendText(messages: ChatMessage[], id: string, delta: string): ChatMessage[] {
  return messages.map((x) => (x.id === id ? { ...x, parts: appendTextPart(x.parts, delta) } : x));
}
```

Update `packages/ui/src/state/index.ts:3` to export `appendText` and `partsToText`
instead of `appendContent`.

Then work through `/tmp/parts-worklist.txt` for the remaining two files, replacing
every `m.content` read with `partsToText(m.parts)` and every `{ content: x }` write
with `{ parts: [{ type: 'text', text: x }] }`.

- [ ] **Step 4: Run the state and primitives tests**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/state/ src/primitives/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/state packages/ui/src/primitives
git commit -m "feat(state)!: migrate message helpers to parts"
```

---

### Task 6: Solid components render parts

**Files:**
- Modify: `packages/ui/src/components/message.tsx`
- Modify: `packages/ui/src/components/thread.tsx`
- Modify: `packages/ui/src/components/chat-thread.tsx`
- Modify: `packages/ui/src/components/thread.test.tsx`, `chat-thread.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 through 5.
- Produces: `<Message>` rendering `message.parts` in order via a `<Switch>` on `part.type`.

- [ ] **Step 1: Write the failing interleaving test**

In `packages/ui/src/components/thread.test.tsx`:

```ts
it('renders parts in order, not grouped by type', async () => {
  const message: ChatMessage = {
    id: 'm1', role: 'assistant',
    parts: [
      { type: 'text', text: 'Checking.' },
      { type: 'tool', tool: { type: 'get_weather', kind: 'generic', state: 'output-available' } },
      { type: 'text', text: 'Done.' },
    ],
  };
  const { container } = render(() => <Thread messages={[message]} />);
  const text = container.textContent ?? '';
  expect(text.indexOf('Checking.')).toBeLessThan(text.indexOf('Done.'));
  expect(text).toContain('get_weather');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/thread.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Render parts in order**

In `packages/ui/src/components/message.tsx`, replace the reasoning-then-tools-then-content render with a single ordered pass:

```tsx
<For each={props.message.parts}>
  {(part) => (
    <Switch fallback={null}>
      <Match when={part.type === 'text' && part}>
        {(p) => <MessageContent>{p().text}</MessageContent>}
      </Match>
      <Match when={part.type === 'reasoning' && part}>
        {(p) => <Reasoning text={p().text} label={p().label} />}
      </Match>
      <Match when={part.type === 'tool' && part}>
        {(p) => <Tool part={p().tool} />}
      </Match>
      <Match when={part.type === 'card' && part}>
        {(p) => <CardRenderer envelope={p().envelope} types={props.cardTypes} />}
      </Match>
      <Match when={part.type === 'file' && part}>
        {(p) => <Attachment data={p().attachment} />}
      </Match>
    </Switch>
  )}
</For>
```

`source` parts are intentionally not rendered here. The citation row is sub-project D;
they are carried in the data model but produce no output yet. Do not add a
placeholder UI for them.

Import `Switch`, `Match`, `For` from `solid-js`. Add a `cardTypes?: CardComponentMap`
prop to `Message` and thread it through from `Thread`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/components/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components
git commit -m "feat(components)!: render message parts in order"
```

---

### Task 7: Element facades and the `cardTypes` seam

**Files:**
- Modify: `packages/ui/src/elements/message.tsx`, `thread.tsx`, `chat-workspace.tsx`
- Modify: `packages/ui/src/elements/element-types.d.ts`

**Interfaces:**
- Consumes: Task 6.
- Produces: `kai-thread` and `kai-message` accepting a `cardTypes` property (a `CardTagMap`), forwarded to the card renderer via the existing `mergeCardTags`.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/elements/thread-cards.declarative.test.tsx` following the pattern in the existing `chain-of-thought.declarative.test.tsx`:

```ts
it('renders a registered custom card type from a message part', async () => {
  const el = document.createElement('kai-thread') as HTMLElement & Record<string, unknown>;
  el.cardTypes = { 'my-widget': 'my-widget-el' };
  el.messages = [{
    id: 'm1', role: 'assistant',
    parts: [{ type: 'card', envelope: { type: 'my-widget', id: 'c1', data: { label: 'hi' } } }],
  }];
  document.body.append(el);
  await customElements.whenDefined('kai-thread');
  await new Promise((r) => setTimeout(r, 0));
  expect(el.shadowRoot?.querySelector('my-widget-el')).not.toBeNull();
});

it('falls through to CardFallback for an UNREGISTERED card type', async () => {
  const el = document.createElement('kai-thread') as HTMLElement & Record<string, unknown>;
  el.messages = [{
    id: 'm1', role: 'assistant',
    parts: [{ type: 'card', envelope: { type: 'never-registered', id: 'c1', data: {} } }],
  }];
  document.body.append(el);
  await customElements.whenDefined('kai-thread');
  await new Promise((r) => setTimeout(r, 0));
  // Must render SOMETHING. A blank is the failure mode this guards against.
  expect(el.shadowRoot?.textContent ?? '').not.toBe('');
  expect(el.shadowRoot?.querySelector('[data-card-fallback]')).not.toBeNull();
});
```

If `CardFallback` does not already carry a `data-card-fallback` attribute, add one.
It is the only stable hook for asserting the fallback rendered.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/elements/thread-cards.declarative.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the property**

In `packages/ui/src/elements/thread.tsx` and `message.tsx`, declare `cardTypes` as an
object property in the `defineWebComponent` prop map (NOT an attribute, it is an
object), and pass it into the Solid `Message`/`Thread` `cardTypes` prop. In the
renderer, resolve tags with `mergeCardTags(props.cardTypes)` so consumer entries win
over built-ins. An unregistered type must fall through to the existing `CardFallback`.

Add `cardTypes?: CardTagMap` to the `KaiThreadElement` and `KaiMessageElement`
interfaces in `packages/ui/src/elements/element-types.d.ts`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/elements/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/elements
git commit -m "feat(elements)!: parts rendering plus a cardTypes seam on kai-thread"
```

---

### Task 8: React wrappers, stories and remaining tests

**Files:**
- Modify: `packages/ui/frameworks/react/index.tsx`, `use-kai-chat.tsx`
- Modify these 18 fixture-carrying files:
  `src/components/chat-container.stories.tsx`, `coachmark.stories.tsx`,
  `markdown.stories.tsx`, `response-compare.test.tsx`, `thread.stories.tsx`,
  `src/elements/chat-slots.stories.tsx`, `chatgpt.stories.tsx`,
  `compare.declarative.test.tsx`, `labs-message-thread.stories.tsx`,
  `workspace-slots.stories.tsx`, `src/ui/tooltip.stories.tsx`,
  plus any remaining file in `/tmp/parts-worklist.txt`.

**Interfaces:**
- Consumes: Tasks 2 through 7. Uses `textMessage` from Task 5 to keep fixtures short.

- [ ] **Step 1: Update the React wrappers by hand, then verify**

`packages/ui/frameworks/react/` is hand-maintained SOURCE, not generated. It is built
by `vite.config.react.ts` and checked by `scripts/verify-react-wrappers.mjs` during
`nx build ui`.

Update `index.tsx` (the `ChatMessage` type import and any `content` usage) and
`use-kai-chat.tsx` (which must expose `upsertTool` / `addCard` / `addSource` /
`addFile` in place of the old `addTool` and `updateTool`).

Then run: `node packages/ui/scripts/verify-react-wrappers.mjs`
Expected: PASS.

- [ ] **Step 2: Migrate every fixture**

Mechanical transformation, applied identically everywhere:

```ts
// before
{ id: '1', role: 'user', content: 'Hello' }
// after
{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }
// or, shorter
textMessage('user', 'Hello', { id: '1' })
```

```ts
// before
{ id: '2', role: 'assistant', content: 'Hi', reasoning: { text: 'thinking' },
  tools: [{ type: 'search', state: 'output-available' }] }
// after: ORDER MATTERS, put them in the order they should render
{ id: '2', role: 'assistant', parts: [
  { type: 'reasoning', text: 'thinking', index: 0 },
  { type: 'tool', tool: { type: 'search', kind: 'search', state: 'output-available' } },
  { type: 'text', text: 'Hi' },
] }
```

```ts
// before
{ id: '3', role: 'user', content: 'see this', attachments: [att] }
// after
{ id: '3', role: 'user', parts: [
  { type: 'file', attachment: att },
  { type: 'text', text: 'see this' },
] }
```

- [ ] **Step 3: Add an interleaved story**

Add to `packages/ui/src/components/thread.stories.tsx` a story proving ordering
survives into the real render, since every other fixture is single-type:

```tsx
export const Interleaved: Story = {
  args: {
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Weather in Paris?' }] },
      { id: 'a1', role: 'assistant', parts: [
        { type: 'reasoning', text: 'I should call the weather tool.', index: 0 },
        { type: 'text', text: 'Checking that for you.' },
        { type: 'tool', tool: { type: 'get_weather', kind: 'generic', state: 'output-available', input: { city: 'Paris' }, output: { c: 18 }, toolCallId: 'tc1' } },
        { type: 'text', text: 'It is 18C and partly cloudy.' },
      ] },
    ],
  },
};
```

- [ ] **Step 4: Run the full unit suite**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit`
Expected: PASS, all tests.

- [ ] **Step 5: Typecheck**

Run: `nx typecheck ui`
Expected: PASS, 4/4.

- [ ] **Step 6: Commit**

```bash
git add packages/ui
git commit -m "feat(react)!: update wrappers and migrate all fixtures to parts"
```

---

### Task 9: The MCP scaffolder

**Files:**
- Modify: `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts`
- Modify: `packages/ui/src/agent-tooling/mcp/scaffold.test.ts`
- Modify: `packages/ui/src/agent-tooling/mcp/tools/debug.ts`

**Interfaces:**
- Consumes: Task 2. The emitted `chatMessageType` string at `scaffold.ts:520` must match the new shape.

Every renderer emits `content: ''` and `content: answer` today (`scaffold.ts:147`,
`:153`, `:407`, `:409`, `:438`, `:566`, `:568`, `:594`, `:803`).

- [ ] **Step 1: Write the failing test**

In `packages/ui/src/agent-tooling/mcp/scaffold.test.ts`:

`scaffold` is a Tool object, not a plain function. Tests call `scaffold.handler(...)`
directly, bypassing MCP's zod validation. Match the argument shape used by the
existing tests at `scaffold.test.ts:14` before writing this.

```ts
it('emits parts-shaped messages, never a content string', async () => {
  for (const framework of ['react', 'vue', 'svelte', 'html', 'next', 'tanstack-start'] as const) {
    const out = await scaffold.handler({
      framework, useCase: 'drop-in-chat', integration: 'mock', placement: 'full-page',
    });
    const emitted = JSON.stringify(out);
    expect(emitted).not.toMatch(/content:\s*\\?'\\?'/);
    expect(emitted).toContain('parts:');
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/`
Expected: FAIL.

- [ ] **Step 3: Update every renderer**

Change the emitted `ChatMessage` type string at `scaffold.ts:520` to the parts shape,
and change each message construction:

```
// emitted before
{ id: assistantId, role: 'assistant', content: '' }
// emitted after
{ id: assistantId, role: 'assistant', parts: [] }
```

```
// emitted before
(m.id === assistantId ? { ...m, content: answer } : m)
// emitted after
(m.id === assistantId ? { ...m, parts: [{ type: 'text', text: answer }] } : m)
```

Do NOT attempt to make the scaffolder emit tool or reasoning parsing here. That is
sub-project C. It keeps emitting text-only, just in the correct shape.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/agent-tooling
git commit -m "feat(mcp)!: scaffolder emits parts-shaped messages"
```

---

### Task 10: The 8 starters and the spike

**Files:**
- Modify: `examples/starters/{react,vue,svelte,vanilla,angular,solid,nextjs,tanstack-start}/` (each one's `chat-data.ts` or equivalent seed/stream code)
- Modify: `examples/internal/openrouter-spike/src/model-stream.ts` and its consumers

**Interfaces:**
- Consumes: Tasks 2 through 9, against the workspace-linked kit.

- [ ] **Step 1: Build the kit so the starters resolve the new types**

Run: `nx build ui && git checkout -- packages/ui/src/components/component-meta.json`

- [ ] **Step 2: Migrate each starter's seed data and fake responder**

Identical transformation in all eight. Seed data:

```ts
// before
{ id: '1', role: 'assistant', content: 'Hi there' }
// after
{ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Hi there' }] }
```

Streaming responder, which is the part that actually changes behaviour:

```ts
// before: string concatenation
setMessages((ms) => ms.map((m) => m.id === id ? { ...m, content: m.content + chunk } : m));
// after: fold onto the trailing text part, new array reference per chunk
setMessages((ms) => ms.map((m) => m.id === id ? { ...m, parts: appendTextPart(m.parts, chunk) } : m));
```

Import `appendTextPart` from `@kitn.ai/ui/state`. Add it to that entry's exports in
Task 3 if it is not already exported.

- [ ] **Step 3: Migrate the spike's adapter**

`examples/internal/openrouter-spike/src/model-stream.ts` already produces something
close to this shape. Change it to emit `MessagePart[]` directly and populate `raw` on
reasoning and tool parts. Its 32 fixture tests must still pass.

- [ ] **Step 4: Verify every starter builds**

Run each starter's production build. For angular note the Node >= 22.22.3 requirement.
Run the spike's tests: `pnpm --filter @kitn.ai/ui-example-openrouter-spike test`
Expected: all builds clean, 32/32 spike tests pass.

- [ ] **Step 5: Commit**

```bash
git add examples
git commit -m "feat(examples)!: migrate all starters and the spike to message parts"
```

---

### Task 11: Round-trip fidelity guard

**Files:**
- Create: `packages/ui/src/state/round-trip.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 4.

This is the test t3code could not have written, and it guards the Anthropic 400. It
asserts the DATA MODEL can carry a thinking block byte-identically. The encoder
itself is sub-project C.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { createAssistantStream, type SetMessages } from './stream';
import type { ChatMessage } from '../elements/chat-types';

describe('round-trip fidelity', () => {
  it('carries an Anthropic thinking block byte-identically through the stream', () => {
    const original = {
      type: 'thinking',
      thinking: 'Let me work through this.',
      signature: 'ErUBCkYIARgCIkAd8xVzGx...',
    };
    let messages: ChatMessage[] = [];
    const set: SetMessages = (fn) => { messages = fn(messages); };

    const s = createAssistantStream(set);
    s.appendReasoning(original.thinking, {
      index: 0,
      signature: original.signature,
      raw: { source: 'anthropic.content_block', payload: original },
    });
    s.done();

    const part = messages[0].parts.find((p) => p.type === 'reasoning');
    expect(part?.raw?.payload).toEqual(original);
    expect(JSON.stringify(part?.raw?.payload)).toBe(JSON.stringify(original));
  });

  it('keeps raw intact across later text and tool appends', () => {
    let messages: ChatMessage[] = [];
    const set: SetMessages = (fn) => { messages = fn(messages); };
    const raw = { source: 'anthropic.content_block', payload: { type: 'thinking', thinking: 'x', signature: 'S' } };

    const s = createAssistantStream(set);
    s.appendReasoning('x', { index: 0, raw });
    s.appendText('answer');
    s.upsertTool('tc1', { type: 'bash', state: 'output-available' });
    s.appendText('more');

    const part = messages[0].parts.find((p) => p.type === 'reasoning');
    expect(part?.raw).toEqual(raw);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/state/round-trip.test.ts`
Expected: PASS, since Tasks 3 and 4 already carry `raw`. If it FAILS, `raw` is being
dropped somewhere in the fold and that is a real bug to fix before proceeding.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/state/round-trip.test.ts
git commit -m "test(state): guard Anthropic round-trip fidelity of raw payloads"
```

---

### Task 12: Full verification and PR

- [ ] **Step 1: Full green gate**

```bash
nx typecheck ui
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
nx build ui && git checkout -- packages/ui/src/components/component-meta.json
```
Expected: typecheck 4/4, unit suite green, build green with 79 elements.

- [ ] **Step 2: Confirm no `content` survives**

```bash
grep -rn "message\.content\|m\.content\b" packages/ui/src examples --include="*.ts" --include="*.tsx" --include="*.vue" --include="*.svelte" | grep -v node_modules
```
Expected: no hits against `ChatMessage`. Tooltip, coachmark, hover-card and markdown
have their own unrelated `content` props; those are fine and must NOT be changed.

- [ ] **Step 3: Storybook smoke**

Run `nx dev ui`, open a Labs thread story, confirm an interleaved message renders
text, then tool, then text in that order. `storybook-static` cannot register web
components, so this must use the dev server.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/message-parts
gh pr create --title "feat!: ordered message parts replace ChatMessage.content" --body "..."
```

Body must link the spec and state the breaking change explicitly for release-please.
