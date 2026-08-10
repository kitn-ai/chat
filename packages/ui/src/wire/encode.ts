// ChatMessage[] back onto the wire, so a host can run a multi-round tool loop in
// about fifteen lines of its own code. The kit never calls a consumer's function
// and never drives the loop; these two functions are the whole contribution.
//
// No provider SDK, no fetch, no DOM. Pure functions over the content model.
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
    // Restores the prototype chain when this class is DOWNLEVELLED to ES5 by a
    // consumer's build, exactly as WireError does. Without it
    // `err instanceof WireEncodeError` is false there and the documented way to
    // catch an unencodable history stops working.
    Object.setPrototypeOf(this, WireEncodeError.prototype);
    this.name = 'WireEncodeError';
    this.messageId = messageId;
    this.partIndex = partIndex;
  }
}

type TextPart = Extract<MessagePart, { type: 'text' }>;
type ToolMessagePart = Extract<MessagePart, { type: 'tool' }>;

/** A tool that can be echoed back: it has the provider's own call id AND a
 *  result. Narrowing `toolCallId` to `string` here is what removes every
 *  non-null assertion downstream. */
type SettledTool = ToolPart & { toolCallId: string };

const isTextPart = (p: MessagePart): p is TextPart => p.type === 'text';
const isToolPart = (p: MessagePart): p is ToolMessagePart => p.type === 'tool';

const textOf = (parts: MessagePart[]): string =>
  parts
    .filter(isTextPart)
    .map((p) => p.text)
    .join('');

const toolsOf = (parts: MessagePart[]): ToolPart[] => parts.filter(isToolPart).map((p) => p.tool);

/** A tool is encodable only once it has a RESULT. Both APIs require every echoed
 *  tool call to have exactly one matching result, so a call with no answer yet is
 *  skipped entirely rather than sent half-formed. In a real loop the host
 *  executes tools before re-encoding, so this only drops genuinely pending work.
 *
 *  A tool with no `toolCallId` is skipped for the same reason: there is no id to
 *  correlate a result with, and synthesising one (`call_0`) produces a request
 *  the provider rejects. */
const isSettled = (tool: ToolPart): tool is SettledTool =>
  typeof tool.toolCallId === 'string' &&
  tool.toolCallId !== '' &&
  (tool.output !== undefined || tool.errorText !== undefined);

/** The argument text to echo. `rawInput` is the raw accumulated fragments and is
 *  preferred: providers validate an echoed tool block against what they emitted,
 *  and re-stringifying a parse changes key order and whitespace. An EMPTY
 *  `rawInput` is not valid JSON, so it falls through to the parsed snapshot the
 *  same way an absent one does. */
function argumentsOf(tool: ToolPart): string {
  if (tool.rawInput !== undefined && tool.rawInput !== '') return tool.rawInput;
  return tool.input !== undefined ? JSON.stringify(tool.input) : '{}';
}

/**
 * ChatMessage[] to an OpenAI chat-completions `messages` array.
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
      id: tool.toolCallId,
      type: 'function',
      function: { name: tool.type, arguments: argumentsOf(tool) },
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
        tool_call_id: tool.toolCallId,
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
 * block in the most recent assistant message is modified, reordered, filtered or
 * reconstructed. A reasoning part with no `raw`, or with a `raw` captured from
 * some other format, therefore THROWS rather than silently producing a request
 * that will fail.
 *
 * Block order follows part order, which follows stream order, with no filtering,
 * because the API validates order too. An empty-text reasoning part (an omitted
 * or redacted block) is still emitted: the docs require sending back every block
 * "including any blocks with empty thinking fields".
 *
 * Asymmetry worth knowing: `tool_use.input` is a parsed OBJECT on this wire, not
 * a string, so it uses `input` and not `rawInput`. Only thinking blocks carry a
 * verbatim requirement.
 */
export function toAnthropicMessages(messages: ChatMessage[]): AnthropicWireMessage[] {
  const out: AnthropicWireMessage[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      const userBlocks = message.parts
        .filter(isTextPart)
        .filter((p) => p.text !== '')
        .map<AnthropicContentBlock>((p) => ({ type: 'text', text: p.text }));
      if (userBlocks.length > 0) out.push({ role: 'user', content: userBlocks });
      continue;
    }

    const blocks: AnthropicContentBlock[] = [];
    const results: AnthropicContentBlock[] = [];

    message.parts.forEach((part, partIndex) => {
      switch (part.type) {
        case 'reasoning': {
          if (!part.raw) {
            throw new WireEncodeError(
              `Cannot encode reasoning part ${partIndex} of message "${message.id}": it has no \`raw\` payload, and Anthropic requires a thinking block to be echoed back verbatim. Rebuilding one from text plus signature is the documented 400. Produce reasoning parts with readAnthropicStream, which attaches the provider's own block, and keep \`raw\` when you persist a message.`,
              message.id,
              partIndex,
            );
          }
          if (!part.raw.source.startsWith('anthropic.')) {
            throw new WireEncodeError(
              `Cannot encode reasoning part ${partIndex} of message "${message.id}": its \`raw\` came from "${part.raw.source}", not from the Anthropic Messages format. Only a payload tagged \`anthropic.\` can be echoed back verbatim. If you are talking to an Anthropic model through an OpenAI-compatible endpoint, use toOpenAIMessages.`,
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
            id: tool.toolCallId,
            name: tool.type,
            input: tool.input ?? {},
          });
          results.push(
            tool.errorText !== undefined
              ? {
                  type: 'tool_result',
                  tool_use_id: tool.toolCallId,
                  is_error: true,
                  content: tool.errorText,
                }
              : {
                  type: 'tool_result',
                  tool_use_id: tool.toolCallId,
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
