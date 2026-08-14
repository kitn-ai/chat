// src/state/stream.ts
import type { ChatMessage, MessagePart, Source } from '../elements/chat-types';
import type { ToolPart } from '../components/tool-types';
import type { CardEnvelope } from '../primitives/card-contract';
import type { AttachmentData } from '../components/attachment-types';
import { appendReasoningPart, appendTextPart, upsertCardPart, upsertToolPart, type ReasoningOpts } from './parts';

/** The one universal contract: a functional-updater setter (React setState shape). */
export type SetMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;

/* --------------------------------------------------------------------------
 * Bag exclusivity: why the mutators below do not just take their payload type.
 *
 * `Source`, `Partial<ToolPart>` and `ReasoningOpts` are WEAK types — not one
 * required field between them — and TypeScript only excess-property-checks
 * OBJECT LITERALS. Hand a mutator a VARIABLE and that check never runs, so any
 * bag sharing a single optional key name flows straight in. `addSource(source:
 * Source)` therefore accepted an `AttachmentData` and a `CardEnvelope`, and
 * `addFile(a) { inner.addSource(a); }` compiled clean at exit 0 while writing a
 * file payload into a `source` part. Nine such pairs existed across these three
 * bags and not one of them was a type error; `./stream-types.test.ts` pins all
 * nine, and fails with nine "Unused '@ts-expect-error'" if this guard is lifted.
 *
 * Tightening the PAYLOAD types is not available. A citation with no url and no
 * title is a rendered, tested state (`citationTitle` in components/message.tsx
 * falls through title -> url -> a generic word, and message.stories.tsx ships
 * "a citation with no url at all"), and a patch/opts bag is optional by
 * definition. So the exclusivity lives on the PARAMETER instead, which leaves
 * every published data type — and every artifact generated from them — alone.
 *
 * The forbidden key set is DERIVED from the `MessagePart` union, the same
 * derivation `verify:scaffold` and `lint:silent-drops` read, so a seventh
 * variant re-fires this on its own rather than quietly widening the hole.
 * ------------------------------------------------------------------------ */

/** Every OBJECT payload a `MessagePart` variant carries. `type`/`raw` are the
 *  variant's own bookkeeping, not payload; the primitive payloads (`text`,
 *  `label`, `index`, ...) drop out at `Extract<..., object>`. */
type PartPayload = Extract<
  MessagePart extends infer P ? (P extends object ? P[Exclude<keyof P, 'type' | 'raw'>] : never) : never,
  object
>;

/** Every bag one of these mutators takes: the part payloads plus the options
 *  bags that are not payloads themselves. */
type MutatorBag = PartPayload | ReasoningOpts;

/** `keyof` over a union member-by-member. The bare `keyof (A | B)` is the
 *  INTERSECTION of their keys, which is the opposite of what this needs. */
type KeysOf<T> = T extends unknown ? keyof T : never;

/** `Shape`, but any key that belongs exclusively to a SIBLING bag is a compile
 *  error. Keys `Shape` never heard of are untouched, so a consumer's own
 *  superset of a citation still passes — only the mix-ups fail. */
type Unmixed<Shape> = Shape & { [K in Exclude<KeysOf<MutatorBag>, keyof Shape>]?: never };

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'kai-' + Math.random().toString(36).slice(2);
}

/** A fluent builder for one in-flight assistant message. Owns no state. */
export interface AssistantStream {
  readonly id: string;
  appendText(delta: string): AssistantStream;
  appendReasoning(delta: string, opts?: Unmixed<ReasoningOpts>): AssistantStream;
  upsertTool(toolCallId: string, patch: Unmixed<Partial<ToolPart>>): AssistantStream;
  /** Adds a card, or REPLACES the existing one with the same `envelope.id`. A
   *  model that revises a card mid-turn re-sends the whole envelope, so a second
   *  call with a known id revises that card in place rather than rendering a
   *  second copy of it. See `upsertCardPart`. */
  addCard(envelope: CardEnvelope): AssistantStream;
  addSource(source: Unmixed<Source>): AssistantStream;
  /* addCard and addFile are deliberately NOT `Unmixed`, and this is a measured
   * call rather than an oversight. Both take STRONG types — `CardEnvelope`
   * requires type+id+data, `AttachmentData` requires id+type — so ordinary
   * assignability already does the job `Unmixed` exists to do for a weak bag.
   *
   * Wrapping `addCard` buys ZERO: no sibling bag is assignable to
   * `CardEnvelope`, because nothing else carries `data`. Wrapping `addFile`
   * buys exactly one pair — `addFile(c)` with `c: CardEnvelope<'file', unknown>`
   * — and costs two ordinary consumer shapes, since the derived denylist owns
   * `state` and `index`:
   *
   *     { id, type: 'file', filename, state: 'uploading' }  // upload progress
   *     { id, type: 'file', filename, index: 3 }            // display position
   *
   * That one pair needs a hand-written generic narrowing with no other purpose;
   * an ordinarily-inferred `CardEnvelope` is ALREADY rejected. Rejecting likely
   * code to block contrived code is the wrong trade — the same trade this file
   * refused when it chose a sibling-key denylist over full exactness. KNOWN
   * RESIDUAL, stated rather than silent. Both facts the call rests on are
   * pinned in ./stream-types.test.ts, so it re-opens if either stops holding. */
  addFile(attachment: AttachmentData): AssistantStream;
  done(): void;
  abort(reason?: string): void;
}

/** Start an assistant message and drive it through `set`. New refs on every mutation. */
export function createAssistantStream(
  set: SetMessages,
  init: Partial<ChatMessage> = {},
): AssistantStream {
  const id = init.id ?? newId();
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
    // Upsert, not append: keyed on envelope.id so a revised card replaces itself.
    addCard(envelope) { mutate((p) => upsertCardPart(p, envelope)); return stream; },
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

/** Wrap a stream so `onSettle` fires on done/abort (used to toggle a `loading` flag).
 *  Preserves the fluent chain by returning the wrapper from every mutator. */
export function onStreamSettled(inner: AssistantStream, onSettle: () => void): AssistantStream {
  const wrapper: AssistantStream = {
    id: inner.id,
    appendText(delta) { inner.appendText(delta); return wrapper; },
    appendReasoning(delta, opts) { inner.appendReasoning(delta, opts); return wrapper; },
    upsertTool(toolCallId, patch) { inner.upsertTool(toolCallId, patch); return wrapper; },
    addCard(envelope) { inner.addCard(envelope); return wrapper; },
    addSource(source) { inner.addSource(source); return wrapper; },
    addFile(attachment) { inner.addFile(attachment); return wrapper; },
    done() { inner.done(); onSettle(); },
    abort(reason) { inner.abort(reason); onSettle(); },
  };
  return wrapper;
}
