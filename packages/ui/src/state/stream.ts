// src/state/stream.ts
import type { ChatMessage, MessagePart, Source } from '../elements/chat-types';
import type { ToolPart } from '../components/tool-types';
import type { CardEnvelope } from '../primitives/card-contract';
import type { AttachmentData } from '../components/attachment-types';
import { appendReasoningPart, appendTextPart, upsertToolPart, type ReasoningOpts } from './parts';

/** The one universal contract: a functional-updater setter (React setState shape). */
export type SetMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'kai-' + Math.random().toString(36).slice(2);
}

/** A fluent builder for one in-flight assistant message. Owns no state. */
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

/** Start an assistant message and drive it through `set`. New refs on every mutation. */
export function createAssistantStream(
  set: SetMessages,
  init: Partial<ChatMessage> = {},
): AssistantStream {
  const id = init.id ?? newId();
  let settled = false;
  let currentParts: MessagePart[] = init.parts ?? [];

  set((prev) => [...prev, { id, role: 'assistant', parts: currentParts, ...init }]);

  const mutate = (fn: (parts: MessagePart[]) => MessagePart[]) => {
    if (settled) return;
    const next = fn(currentParts);
    if (next === currentParts) return;
    currentParts = next;
    set((prev) => {
      const i = prev.findIndex((m) => m.id === id);
      if (i < 0) return prev;
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
