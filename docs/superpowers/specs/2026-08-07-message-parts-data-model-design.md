# Message parts data model - design

Date: 2026-08-07
Status: DESIGN, approved in brainstorming. Nothing implemented.
Scope: sub-project **A** of the model-driven components epic.

This is the keystone. Sub-projects B (emit contract), C (wire adapter) and D
(artifact-over-time + card round-trip) all assume the model defined here.

## Summary

Replace `ChatMessage.content: string` with `parts: MessagePart[]`, an ordered,
closed, typed union covering text, reasoning, tool calls, cards, sources and files.
Add a `raw` origin sidecar to every part so provider-native payloads survive
normalization. Add semantic classification to `ToolPart` so unrecognized tools still
render. Make `createAssistantStream` part-oriented so a text delta after a tool call
opens a new part instead of concatenating onto the previous one.

Clean break. No compatibility shim, no deprecation window.

## Why now

Three independent lines of evidence landed on the same conclusion.

### 1. The OpenRouter spike (2026-08-07, `examples/internal/openrouter-spike/`)

Driving `kai-tool` / `kai-reasoning` / cards from a real model surfaced four defects
in the current model, all traceable to `content` being a flat string:

- Text and tool ordering is unrepresentable. The real shape is preamble, then tool,
  then answer. `appendText` glues round 2 onto round 1 with no separator, and the kit
  renders reasoning, then tools, then content, regardless of what actually happened.
- Partial tool arguments have nowhere to live. `ToolPart.input` is
  `Record<string, unknown>`, so `{"city":"Par` is unrepresentable and
  `input-streaming` means "we know nothing".
- `ChatMessage` has no `sources` and no `cards`, so a model-produced citation row or
  card cannot live in the turn that caused it.
- `reasoning?: { text, label }` is lossy three ways: it drops signed/encrypted
  thinking blobs, collapses parallel indexed blocks into one, and cannot round-trip
  `reasoning_details` back to the provider.

Full write-up: `examples/internal/openrouter-spike/FINDINGS.md`.

### 2. Anthropic returns a 400 on reconstructed thinking blocks

From the Claude API error documentation:

> Modifying, reordering, filtering, or reconstructing `thinking` or
> `redacted_thinking` blocks within the most recent assistant message will cause the
> API to return a 400 `invalid_request_error`. These blocks must be sent back exactly
> as they were received, including any blocks with empty `thinking` fields. When
> using tool use, ensure all `thinking` and `redacted_thinking` blocks from the
> assistant turn are preserved without alteration.

The current `reasoning?: { text, label }` cannot satisfy this. It drops signatures,
collapses blocks, and reconstructs text. All three are the documented error
condition. **Correct Anthropic extended-thinking-plus-tool-use multi-turn is
currently impossible in this kit and fails hard.**

### 3. t3code built the alternative and pays for it

`pingdotgg/t3code` @ `5661c61` (MIT) is an agent harness control surface normalizing
Claude Code, Codex, Cursor, Grok Build and OpenCode into one UI. Their assistant
message is a flat `text: string`, with tool calls and everything else in a parallel
`activities[]` array, ordering reconstructed client-side by merging both arrays on
`createdAt`/`sequence`.

That fold is roughly 700 lines in `session-logic.ts` plus 700 more in
`MessagesTimeline.logic.ts`, carrying comments about ordering bugs found in live
testing, with activities capped at 500 per thread.

Their persisted activity is also `kind: string` + `payload: Schema.Unknown`, and
consumers re-validate by hand with scattered `typeof payload.x === "string"` checks.
Their canonical *event* union, by contrast, is closed and fully typed, and it does
not have that problem. The typed side works. The untyped side leaks.

They are a strong engineering team who chose the flat-string design at scale. The
cost is visible in their source.

### What t3code could NOT tell us

Their `sendTurn` takes a plain string plus images. There is no internal-to-provider
encoder anywhere in the repo, because the agent CLI owns the transcript. They also
produce reasoning in every adapter and then discard it at ingestion, preserving no
signatures.

So on the hardest question here, lossless reconstruction of prior assistant turns,
they have no evidence to offer. They arranged never to need it. We cannot.

## Decisions

| Decision | Rationale |
|---|---|
| **Clean break**, `content` removed outright | Pre-1.0, pre-alpha, no consumers. Carrying a derived `content` for a migration nobody needs is pure cost. |
| **One PR**, whole repo migrated together | CI stays green throughout, one revert point. Much of it is mechanical. |
| **Closed, typed part union** | t3code's untyped persisted payload leaks into every consumer. Their typed event union does not. |
| **Extension happens at the CARD layer, not the part layer** | `mergeCardComponents` / `mergeCardTags` already merge consumer components over built-ins, consumer wins. One extension mechanism, already built and tested. A second parallel one is cost without benefit. |
| **`attachments` folds into parts as a `file` part** | OpenAI and Anthropic both model multimodal user turns as ordered blocks. Keeping a separate array reintroduces exactly the dual-channel split that cost t3code its fold logic. |
| **`raw` sidecar on every part** | Normalization is lossy by construction. This makes it recoverable, and it is the mechanism that satisfies Anthropic's byte-identical requirement. |

## The data model

`packages/ui/src/elements/chat-types.ts`.

```ts
/** The untranslated provider payload a part was normalized from. Optional in the
 *  type, but REQUIRED in practice for round-trip fidelity: see "Round-trip". */
export interface RawOrigin {
  /** Tagged origin, e.g. 'anthropic.content_block' | 'openai.delta' | `custom.${string}` */
  source: string;
  payload: unknown;
}

export interface Source {
  id?: string;
  url?: string;
  title?: string;
  snippet?: string;
  /** Citation marker number, when the model numbers its citations. */
  index?: number;
}

export type MessagePart =
  | { type: 'text';      text: string;                        raw?: RawOrigin }
  | { type: 'reasoning'; text: string; label?: string;
                         index?: number; signature?: string;   raw?: RawOrigin }
  | { type: 'tool';      tool: ToolPart;                       raw?: RawOrigin }
  | { type: 'card';      envelope: CardEnvelope;               raw?: RawOrigin }
  | { type: 'source';    source: Source;                       raw?: RawOrigin }
  | { type: 'file';      attachment: AttachmentData;           raw?: RawOrigin };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** The ONLY content channel. Ordered. */
  parts: MessagePart[];
  /** Chrome, not content. Stays message-level. */
  actions?: (ChatMessageAction | CustomAction)[];
  avatar?: AvatarData;
  feedback?: FeedbackVote;
}
```

`content` and `reasoning` and `tools` and `attachments` are removed from
`ChatMessage`. `ToolPart`, `CardEnvelope`, `AttachmentData`, `ChatMessageAction`,
`CustomAction`, `AvatarData` and `FeedbackVote` keep their current definitions except
as noted below.

Why `actions` / `avatar` / `feedback` stay message-level: they are presentation chrome
attached to the whole turn, not things a model emits into the content stream.

## `ToolPart`

```ts
export type ToolKind =
  | 'command' | 'file-change' | 'search' | 'fetch' | 'mcp' | 'image' | 'generic';

export interface ToolPart {
  /** The tool name as the provider reported it. */
  type: string;
  /** Semantic classification, for rendering. Derived via classifyTool(). */
  kind?: ToolKind;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  /** Last VALID parsed snapshot. Fingerprint-deduped: identical snapshots do not
   *  re-emit. This is the primary channel and what the kit renders by default. */
  input?: Record<string, unknown>;
  /** Raw accumulated argument fragments, for consumers that want character-level
   *  streaming. OPTIONAL. Most consumers should read `input`. */
  rawInput?: string;
  output?: Record<string, unknown>;
  toolCallId?: string;
  raw?: RawOrigin;
}
```

### Semantic classification

```ts
export function classifyTool(name: string): ToolKind;
```

A pure function, unit-testable, matching on the normalized tool name and **always
terminating in `'generic'`**. `kai-tool` renders by `kind`, so an unrecognized tool
still gets a sensible panel instead of a blank.

This is t3code's pattern (their closed 7-value `TOOL_LIFECYCLE_ITEM_TYPES` plus a
`dynamic_tool_call` catch-all, `ClaudeAdapter.ts:664`). Rendering keys off intent, not
tool name, which is what lets an unknown MCP tool render at all.

### Why `input` snapshots, not raw fragments, are primary

The spike originally proposed `rawInput` as the fix for partial arguments. t3code does
the opposite deliberately and is more right: fragments never reach their wire. The
adapter buffers `partialInputJson`, attempts a parse on each delta, and emits only
last-known-valid parsed snapshots, deduped by a fingerprint of the parsed object
(`ClaudeAdapter.ts:2467`).

Two benefits: every event is independently decodable and idempotent, and identical
states do not trigger a re-render storm. `rawInput` is retained but demoted to
optional, for the genuine case of showing arguments typing in character by character.

## `createAssistantStream`

`packages/ui/src/state/stream.ts` becomes part-oriented.

```ts
appendText(delta: string): AssistantStream;
appendReasoning(delta: string, opts?: {
  index?: number; label?: string; signature?: string; raw?: RawOrigin;
}): AssistantStream;
upsertTool(toolCallId: string, patch: Partial<ToolPart>): AssistantStream;
addCard(envelope: CardEnvelope): AssistantStream;
addSource(source: Source): AssistantStream;
addFile(attachment: AttachmentData): AssistantStream;
```

**The rule that fixes the spike's ordering bug:** `appendText` appends to the
trailing part only if that part is `text`. Otherwise it opens a NEW text part. So a
text delta arriving after a tool call starts a new part rather than concatenating onto
the pre-tool text.

`appendReasoning` is keyed by `index`, so parallel reasoning blocks stay distinct
instead of collapsing.

`upsertTool` applies the fingerprint dedupe: if the incoming `input` snapshot
fingerprints identically to the stored one, it is a no-op.

Every mutation continues to produce a NEW array reference per chunk, which the kit's
re-render contract requires.

## Round-trip

**`raw.payload` is the round-trip mechanism. `signature` is informational.**

Anthropic errors on *reconstructed* thinking blocks. Rebuilding
`{ type: 'thinking', thinking: text, signature }` from our fields is literally
reconstruction, which is the documented error condition. The only compliant approach
is to send back the original block verbatim.

Therefore:

- The kit's own adapters MUST populate `raw` on reasoning parts and tool parts.
- An encoder that serializes `parts` back into a provider request MUST prefer
  `raw.payload` verbatim when present, and MUST NOT rebuild a signed block from
  component fields.
- `signature` on the reasoning part exists for display, debugging and inspection. It
  is not the round-trip channel.

The encoder itself is sub-project C. This spec fixes the data model so C is possible.

## Thread rendering seam

`kai-thread` currently exposes only an `empty` slot, so a model-produced card cannot
render inside the turn that produced it.

`kai-thread` gains a `cardTypes` prop, forwarded to the card renderer, reusing the
existing `mergeCardComponents` / `mergeCardTags` merge (consumer wins over built-ins).
That is the minimum for model-emitted cards to render inline.

An unregistered card type falls through to the existing `CardFallback`. Combined with
`classifyTool`'s `'generic'` terminus, every part type has a guaranteed terminal
fallback and nothing renders blank.

Per-message render slots are explicitly OUT of scope here. They belong with the emit
contract (B) or the artifact work (D).

## Migration surface

One PR. Everything below moves together so CI stays green and the change has a single
revert point.

- `packages/ui/src/elements/chat-types.ts` - the types above.
- `packages/ui/src/state/stream.ts` - part-oriented `createAssistantStream`.
- `packages/ui/src/primitives/` - new `classifyTool` + the input fingerprint helper.
- Every element reading `message.content`, `message.reasoning`, `message.tools` or
  `message.attachments`. Enumerate with a grep before starting; `kai-message`,
  `kai-thread`, `kai-chat` and `kai-workspace` are known.
- `packages/ui/frameworks/react/` - regenerated wrappers.
- Storybook stories carrying message fixtures.
- `apps/docs/` examples.
- All 8 starters' `chat-data.ts` (`examples/starters/*`).
- `packages/ui/src/agent-tooling/mcp/tools/scaffold.ts` - every renderer emits
  `content: ''` and `content: answer` today.
- `examples/internal/openrouter-spike/` - its adapter already produces something close
  to this shape and becomes the reference for sub-project C.

Gotcha: after `nx build ui`, `git checkout -- packages/ui/src/components/component-meta.json`.

## Testing

- **Part folding**: a text delta after a tool part opens a NEW text part. This is the
  regression test for the spike's concatenation bug.
- **Reasoning index separation**: two blocks with distinct indexes stay distinct.
- **Tool snapshot dedupe**: an identical `input` fingerprint does not re-emit.
- **Classifier purity**: `classifyTool` is total, deterministic, and terminates in
  `'generic'` for unknown names.
- **Round-trip fidelity**: encode parts into an Anthropic request shape and assert the
  thinking blocks are byte-identical to `raw.payload`. This is the test t3code could
  not have written, and it guards the 400.
- **Fallbacks**: an unregistered card type renders `CardFallback`; an unknown tool
  name renders a `'generic'` panel.
- Storybook stories for an interleaved message (text, tool, text, card).
- The existing unit suite must stay green.

## Non-goals

- The wire adapter itself (sub-project C).
- Exporting card JSON Schemas or custom-schema registration (sub-project B).
- Artifact-over-time and the interactive card round-trip (sub-project D).
- Per-message render slots.
- Any compatibility shim.

## Open questions and risks

- **Blast radius is wide.** `content` is read across roughly a dozen elements plus
  generated wrappers, docs, stories, 8 starters and the MCP scaffolder. The mitigation
  is that it is mostly mechanical and lands in one PR; the risk is review fatigue on a
  large diff. Grep the full surface before starting so nothing is discovered late.
- **`Source` is designed ahead of its consumer.** Nothing renders sources yet; the
  citation row is sub-project D. The shape here is a best guess from the answer-engine
  archetype. Accept that it may need one revision when D lands.
- **`raw` grows payload size.** Every part carrying its provider original roughly
  doubles the stored message. Acceptable for a UI kit that does not persist history,
  but a consumer that does persist should be told it can strip `raw` from anything
  except reasoning parts it intends to send back.
- **`kind` is derived, not authoritative.** `classifyTool` matches on tool names, which
  are provider-chosen and arbitrary. Misclassification renders the wrong icon, which is
  cosmetic and self-correcting, but the classifier should stay conservative and prefer
  `'generic'` over a confident wrong answer.
- **Fingerprint cost.** Hashing every parsed snapshot on every delta has a cost. Keep
  the fingerprint cheap (stable key ordering plus a fast hash), and measure before
  optimizing.

## What this unblocks

- **B (emit contract)**: card envelopes now have a part to live in, so exported schemas
  become useful. `cardTypes` on the thread is the seam a consumer's own design-system
  components render through.
- **C (wire adapter)**: ordered parts plus `raw` make a faithful adapter possible in
  both directions, including the Anthropic encoder.
- **D (artifact-over-time, card round-trip)**: needs both.
