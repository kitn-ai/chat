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

/** A tool that can be echoed back: it has the provider's own call id AND a
 *  result. Narrowing `toolCallId` to `string` here is what removes every
 *  non-null assertion downstream. */
type SettledTool = ToolPart & { toolCallId: string };

const isTextPart = (p: MessagePart): p is TextPart => p.type === 'text';

const textOf = (parts: MessagePart[]): string =>
  parts
    .filter(isTextPart)
    .map((p) => p.text)
    .join('');

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

const toolCallOf = (tool: SettledTool): OpenAIToolCall => ({
  id: tool.toolCallId,
  type: 'function',
  function: { name: tool.type, arguments: argumentsOf(tool) },
});

/** `errorText` WINS over `output` when a part somehow carries both, on both
 *  wires. A host that reported a failure after a partial result meant the
 *  failure, and echoing a half-written success back to the model is the version
 *  of this that produces confidently wrong follow-up work. */
const toolResultOf = (tool: SettledTool): OpenAIWireMessage => ({
  role: 'tool',
  tool_call_id: tool.toolCallId,
  name: tool.type,
  content: tool.errorText ?? JSON.stringify(tool.output),
});

/**
 * ChatMessage[] to an OpenAI chat-completions `messages` array.
 *
 * ONE ChatMessage CAN BECOME SEVERAL WIRE MESSAGES. The kit streams a whole
 * assistant turn into a single message, so text, a tool call and the model's
 * answer to that call all live in one `parts` array. The OpenAI wire has no such
 * shape: a `role:'tool'` result must sit between the assistant message that
 * announced the call and whatever the model said afterwards. So the turn is
 * SPLIT at each tool boundary, into
 *
 *   assistant(pre-tool text + tool_calls) -> tool(result)... -> assistant(answer)
 *
 * Flattening instead would put the model's answer BEFORE the result it was based
 * on. No endpoint rejects that, which is exactly why it is worth spelling out:
 * it quietly degrades every later round of a tool loop.
 *
 * Consecutive tool parts stay in ONE assistant message, because parallel calls
 * are announced together and their results follow together.
 *
 * A turn that encodes to nothing is SKIPPED, never sent as `{ content: null }`
 * with no `tool_calls`: OpenAI treats `content` as required unless `tool_calls`
 * is present, and strict-compatible endpoints reject it.
 *
 * `reasoning`, `card`, `source` and `file` parts are not encoded. OpenAI chat
 * completions has no reasoning channel on the way back in, and the other three
 * are kit-side. File attachments are a documented v1 limitation, which is why a
 * user turn carrying only an attachment encodes to nothing and is skipped.
 */
export function toOpenAIMessages(messages: ChatMessage[]): OpenAIWireMessage[] {
  const out: OpenAIWireMessage[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      const content = textOf(message.parts);
      if (content !== '') out.push({ role: 'user', content });
      continue;
    }

    let text = '';
    let pending: SettledTool[] = [];

    /** Emit the assistant message for everything buffered so far, then the
     *  result message for each call it announced, in the same order. */
    const flush = (): void => {
      if (text === '' && pending.length === 0) return;
      out.push({
        role: 'assistant',
        content: text === '' ? null : text,
        ...(pending.length > 0 ? { tool_calls: pending.map(toolCallOf) } : {}),
      });
      for (const tool of pending) out.push(toolResultOf(tool));
      text = '';
      pending = [];
    };

    for (const part of message.parts) {
      if (part.type === 'text') {
        // Text that arrives AFTER a call is the model's answer to it, so the
        // call and its result have to be on the wire before this text is.
        if (pending.length > 0) flush();
        text += part.text;
        continue;
      }
      if (part.type === 'tool' && isSettled(part.tool)) pending.push(part.tool);
    }
    flush();
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
 * ONE ChatMessage CAN BECOME SEVERAL WIRE MESSAGES, for the same reason as
 * `toOpenAIMessages`: the kit streams a whole assistant turn into one message, so
 * the tool call and the model's answer to it share a `parts` array, but Anthropic
 * carries the result in a SEPARATE user message that has to sit between them. So
 * the turn is SPLIT at each tool boundary, into
 *
 *   assistant(pre-tool blocks + tool_use) -> user(tool_result)... -> assistant(answer)
 *
 * Flattening instead puts the model's answer BEFORE the result it was based on,
 * and strands every later round's thinking block in the first assistant message.
 * Consecutive tool parts stay in ONE assistant message, because parallel calls are
 * announced together and their results come back together.
 *
 * Adjacent user messages are MERGED. The API combines consecutive same-role turns
 * itself rather than rejecting them, so this is not what stands between you and a
 * 400; it is emitted anyway because the tool-result turn and a following user turn
 * are one turn, several OpenAI-compatible Anthropic proxies do enforce strict
 * alternation, and the merged form is what the models are trained on. Ordering is
 * safe by construction: `results` is only non-empty when `blocks` is, so a
 * tool_result message always follows its assistant message and can never be
 * appended after a plain user turn.
 *
 * Asymmetry worth knowing: `tool_use.input` is a parsed OBJECT on this wire, not
 * a string, so it uses `input` and not `rawInput`. Only thinking blocks carry a
 * verbatim requirement.
 */
export function toAnthropicMessages(messages: ChatMessage[]): AnthropicWireMessage[] {
  const out: AnthropicWireMessage[] = [];

  /** Append to the trailing user message when there is one, so the wire never
   *  carries two user turns in a row. */
  const pushUser = (content: AnthropicContentBlock[]): void => {
    const last = out[out.length - 1];
    if (last?.role === 'user') last.content = [...last.content, ...content];
    else out.push({ role: 'user', content });
  };

  for (const message of messages) {
    if (message.role === 'user') {
      const userBlocks = message.parts
        .filter(isTextPart)
        .filter((p) => p.text !== '')
        .map<AnthropicContentBlock>((p) => ({ type: 'text', text: p.text }));
      if (userBlocks.length > 0) pushUser(userBlocks);
      continue;
    }

    let blocks: AnthropicContentBlock[] = [];
    let results: AnthropicContentBlock[] = [];

    /** Emit the assistant message built so far, then the user message carrying the
     *  results of the calls it announced. */
    const flush = (): void => {
      if (blocks.length > 0) out.push({ role: 'assistant', content: blocks });
      // Anthropic carries tool results in the FOLLOWING user message.
      if (results.length > 0) pushUser(results);
      blocks = [];
      results = [];
    };

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
          // A thinking block after a call belongs to the round that READ the
          // result, so the result has to be on the wire before it is.
          if (results.length > 0) flush();
          blocks.push(part.raw.payload as AnthropicContentBlock);
          break;
        }
        case 'text': {
          if (part.text === '') break;
          // Text after a call is the model's answer to it. Same reason.
          if (results.length > 0) flush();
          blocks.push({ type: 'text', text: part.text });
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

    flush();
  }

  return out;
}
