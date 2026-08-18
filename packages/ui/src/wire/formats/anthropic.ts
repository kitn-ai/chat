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
            // `message.model` sits right beside the `message.usage` this handler
            // already destructures. Anthropic states it once, here, and nowhere
            // else in the stream.
            const out: ModelStreamChunk = {};
            const usage = usageOf(message.usage);
            if (usage) out.usage = usage;
            const model = str(message.model);
            if (model) out.model = model;
            return Object.keys(out).length > 0 ? [out] : [];
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
