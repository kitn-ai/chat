// ChatMessage[] back onto the wire, so a host can run a multi-round tool loop in
// about fifteen lines of its own code. The kit never calls a consumer's function
// and never drives the loop; these two functions are the whole contribution.
//
// No provider SDK, no fetch, no DOM. Pure functions over the content model.
import type { ChatMessage, MessagePart } from '../elements/chat-types';
import type { ToolPart } from '../components/tool-types';
import { classifyAttachment, type ClassifiedFile } from './files';

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** One `reasoning_details` entry. Provider-owned open shape, kept as a record
 *  for the same reason `AnthropicContentBlock` is: an opaque entry has to pass
 *  through UNTOUCHED, and a closed type would be a list of the fields we happen
 *  to have seen. */
export type OpenAIReasoningDetail = Record<string, unknown>;

/** A multimodal user message's content entries. `image_url` takes an https URL
 *  or a `data:` URI in the same field; `file` takes `file_data`, which is a DATA
 *  URI on this wire (`data:application/pdf;base64,...`) and not bare base64. */
export type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename?: string; file_data: string } };

export interface OpenAIWireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** An ARRAY only when the turn carries an encodable `file` part. A text-only
   *  turn stays a plain string, so adding attachment support changed nothing
   *  about what an existing thread puts on the wire. */
  content: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
  /** Only ever present when `toOpenAIMessages` was asked for it. See
   *  `OpenAIEncodeOptions.reasoning`. */
  reasoning_details?: OpenAIReasoningDetail[];
}

export interface OpenAIEncodeOptions {
  /**
   * Whether to send the assistant's own reasoning back with the thread.
   *
   * DEFAULT `'omit'`, and that default is a measurement, not caution. Omitting
   * reasoning is accepted by every configuration tested -- five live omission
   * trials plus 28 recorded live requests per configuration across the spike's
   * conformance sweep, zero 400s -- so the path that ships today demonstrably
   * works, while including reasoning cost about 25% more prompt tokens per round
   * when measured (665 -> 834 on a two-round loop). A library does not get to
   * raise every consumer's bill and add a new provider-validation surface as a
   * side effect of a bug fix.
   *
   * `'include'` is for a multi-round TOOL loop, which is where OpenRouter says it
   * pays: "when you post tool results, including the original reasoning ensures
   * the model can continue its reasoning from where it left off". Measured
   * accepted (HTTP 200) for a signed Anthropic block and for an OpenAI encrypted
   * block, over the OpenAI-compatible wire.
   *
   * The Anthropic wire has no such knob because it has no such choice: a filtered
   * or rebuilt thinking block there is a hard 400.
   */
  reasoning?: 'omit' | 'include';

  /** See `FileEncodeOptions`. */
  onUnencodableFile?: UnencodableFilePolicy;
}

/**
 * What to do with a `file` part this wire cannot carry.
 *
 * DEFAULT `'throw'`, and the default is the whole point. Skipping is how
 * attachments came to render perfectly in the thread and reach the model as
 * nothing: the developer wires up upload, watches it work, and ships a model
 * that cannot see the file. A throw here names the message, the part and the
 * reason, which is strictly more than a 400 at request time would tell you.
 *
 * `'skip'` restores the lenient behaviour for a host that would rather send a
 * degraded turn than fail one. It is silent, but it is silence the developer
 * asked for by name, which is the difference that matters.
 */
export type UnencodableFilePolicy = 'throw' | 'skip';

export interface FileEncodeOptions {
  onUnencodableFile?: UnencodableFilePolicy;
}

export type AnthropicEncodeOptions = FileEncodeOptions;

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

type FilePart = Extract<MessagePart, { type: 'file' }>;

/** A wire either shapes a classified file into a block, or explains why it
 *  cannot. `ok: false` is NOT the same as an unencodable attachment: the
 *  attachment can be perfectly sound and still have no form on this particular
 *  wire, which is exactly the remote-PDF case on OpenAI. */
type WireFileResult<T> = { ok: true; block: T } | { ok: false; reason: string };

/**
 * One `file` part to one wire block, or `null` when it is skipped.
 *
 * Skipped means one of two things and never a third: the attachment is kit-side
 * (a citation chip), or the host explicitly opted into `onUnencodableFile:
 * 'skip'`. Everything else throws, because a dropped attachment is invisible in
 * exactly the way the developer needs it not to be.
 */
function encodeFilePart<T>(
  part: FilePart,
  messageId: string,
  partIndex: number,
  policy: UnencodableFilePolicy,
  toBlock: (file: ClassifiedFile) => WireFileResult<T>,
): T | null {
  const classified = classifyAttachment(part.attachment);
  if (classified.status === 'kit-side') return null;

  const refuse = (reason: string): null => {
    if (policy === 'skip') return null;
    throw new WireEncodeError(
      `Cannot encode file part ${partIndex} of message "${messageId}": ${reason} Pass { onUnencodableFile: 'skip' } to drop it instead of failing.`,
      messageId,
      partIndex,
    );
  };

  if (classified.status === 'unencodable') return refuse(classified.reason);

  const shaped = toBlock(classified.file);
  return shaped.ok ? shaped.block : refuse(shaped.reason);
}

/** `image_url` takes an https URL and a `data:` URI in the same field, so an
 *  image is one shape here. A PDF is not: `file_data` is base64-only. */
const openAIFileBlock = (file: ClassifiedFile): WireFileResult<OpenAIContentPart> => {
  if (file.kind === 'image') {
    const url = file.source.type === 'base64' ? file.source.dataUri : file.source.url;
    return { ok: true, block: { type: 'image_url', image_url: { url } } };
  }

  if (file.source.type === 'remote') {
    return {
      ok: false,
      reason: `it is a PDF at a remote URL ("${file.source.url}"), and a chat-completions \`file\` content part carries only \`file_id\` or \`file_data\` -- this wire has no URL form for a document. Fetch it and stage it as a \`data:\` URI, or upload it through the Files API and send \`file_id\` yourself; fetching it HERE would put I/O in the encoder. The Anthropic wire does take a remote PDF, so toAnthropicMessages accepts this same message.`,
    };
  }

  return {
    ok: true,
    block: {
      type: 'file',
      file: {
        ...(file.filename !== undefined ? { filename: file.filename } : {}),
        file_data: file.source.dataUri,
      },
    },
  };
};

/** Both block types take the same two source shapes, which is why this wire has
 *  no gap where OpenAI has one. */
const anthropicFileBlock = (file: ClassifiedFile): WireFileResult<AnthropicContentBlock> => ({
  ok: true,
  block: {
    type: file.kind === 'image' ? 'image' : 'document',
    source:
      file.source.type === 'base64'
        ? { type: 'base64', media_type: file.source.mediaType, data: file.source.data }
        : { type: 'url', url: file.source.url },
  },
});

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

type ReasoningPart = Extract<MessagePart, { type: 'reasoning' }>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The provider's own `reasoning_details` entry for this block, if the part came
 * from the OpenAI wire at all.
 *
 * WHAT THIS IS NOT: the block. `part.raw` holds the LAST delta that touched this
 * part, because `appendReasoningPart` resolves `raw` last-write-wins, and every
 * reasoning-carrying provider streams its blocks in fragments. So this entry is
 * read for its SHAPE -- type, format, id, index, and an opaque payload if it has
 * one -- and never for its text.
 *
 * A delta carrying several entries at once is rare but legal, so the entry is
 * matched on the part's own block index first; that is the only correlator there
 * is. The last one wins otherwise, which is the entry `raw` was captured from.
 */
function detailOf(part: ReasoningPart): Record<string, unknown> | undefined {
  if (part.raw?.source !== 'openai.reasoning_details') return undefined;
  const payload = part.raw.payload;
  if (!Array.isArray(payload)) return undefined;
  const records = payload.filter(isRecord);
  const matched = records.filter((d) => d.index === part.index);
  const pool = matched.length > 0 ? matched : records;
  return pool[pool.length - 1];
}

/**
 * ONE reasoning part to ONE `reasoning_details` entry, or nothing.
 *
 * Three cases, and every one of them is in a recorded fixture:
 *
 * 1. OPAQUE (`reasoning.encrypted`, `openai/gpt-5.4-mini`). The `data` blob is
 *    the block; there is no text and no signature to rebuild it from, and it
 *    arrives whole in a single frame, so `raw` really is the block here. It goes
 *    back BY REFERENCE, untouched.
 *
 * 2. SIGNED (`reasoning.text` with a signature, an Anthropic model over this
 *    wire). REASSEMBLED from `part.text` and `part.signature`, never echoed.
 *    Echoing `raw` sends the final frame, which carries the signature and NO
 *    text -- measured: of 85 reasoning frames in one turn, only the last has the
 *    signature and it has no text. The signature is the load-bearing field:
 *    stripping it is a hard 400 (`Invalid signature in thinking block`) from all
 *    four providers OpenRouter tried, while mutating the text was accepted.
 *
 * 3. NEITHER (`deepseek` `format: "unknown"`, and the `reasoning.summary`
 *    entries that ride alongside gpt-5.4-mini's encrypted block). SKIPPED.
 *    Nothing measured supports sending these: the two accepted round-trips were
 *    a signed block and an encrypted one, and every measured 400 was a provider
 *    failing to verify a block it was handed. Omission, by contrast, is proven
 *    accepted everywhere. `format: "unknown"` is OpenRouter saying it could not
 *    attribute the block to a round-trippable format, and re-sending a summary
 *    OpenAI itself treats as a display artifact spends tokens on nothing.
 *
 * On the sequence rule -- "the entire sequence of consecutive reasoning blocks
 * must match the outputs generated by the model" -- case 3 is the one place this
 * is READ rather than proven. It holds up because verifiability is a
 * per-configuration property in all 40 recorded reasoning turns, never a
 * per-block one: Haiku signs every block, deepseek signs none, gpt-5.4-mini
 * signs none but carries `data`. So the skip never filters one block out of a
 * run of comparable ones. For gpt-5.4-mini it drops the summary at block index 0
 * and keeps the encrypted carrier at index 1, which is exactly the single-entry
 * payload the live probe sent and got a 200 for.
 */
function reasoningDetailOf(part: ReasoningPart): OpenAIReasoningDetail | undefined {
  const detail = detailOf(part);
  if (!detail) return undefined;

  if (detail.type === 'reasoning.encrypted' || typeof detail.data === 'string') return detail;

  if (typeof part.signature !== 'string' || part.signature === '') return undefined;

  const type = typeof detail.type === 'string' ? detail.type : 'reasoning.text';
  // The readable field is named for the entry type: `summary` entries carry
  // `summary`, everything else carries `text`.
  const textKey = type === 'reasoning.summary' ? 'summary' : 'text';
  const out: OpenAIReasoningDetail = { type, [textKey]: part.text, signature: part.signature };
  if (typeof detail.format === 'string') out.format = detail.format;
  if (typeof detail.id === 'string') out.id = detail.id;
  if (detail.index !== undefined) out.index = detail.index;
  return out;
}

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
 * REASONING IS OPT-IN, and off by default. OpenRouter's OpenAI-compatible
 * endpoint does have a channel on the way back in -- `reasoning_details` on the
 * assistant message -- and `{ reasoning: 'include' }` uses it, one entry per
 * reasoning part, in part order, reassembled by `reasoningDetailOf` rather than
 * echoed out of `part.raw`. Read that function for which blocks make it and why.
 * The default omits, because omitting is measured-accepted everywhere and costs
 * about 25% fewer prompt tokens per round; see `OpenAIEncodeOptions.reasoning`.
 *
 * Reasoning alone still encodes to NOTHING. A block is content the model already
 * produced, not a reason to send a turn, so a message carrying reasoning and no
 * text and no settled tool is skipped exactly as before, rather than becoming
 * `{ content: null }` with no `tool_calls`.
 *
 * `card` and `source` parts are never encoded; they are kit-side.
 *
 * `file` parts ARE encoded, on a USER turn, and a turn carrying nothing but an
 * attachment is now a real message rather than nothing. Images become
 * `image_url` (https URL or `data:` URI alike); a base64 PDF becomes a `file`
 * part whose `file_data` is the data URI. Two cases have no form here and THROW
 * by default: a remote PDF, because this wire's `file` part has no URL variant,
 * and anything that is neither -- see `UnencodableFilePolicy` for why the
 * default is a throw and not a skip.
 *
 * A `file` part on an ASSISTANT turn is still dropped. Neither API accepts image
 * or document content in an assistant message, so there is nothing to encode it
 * to; attachments belong to the user turn that sent them.
 */
export function toOpenAIMessages(
  messages: ChatMessage[],
  options: OpenAIEncodeOptions = {},
): OpenAIWireMessage[] {
  const includeReasoning = options.reasoning === 'include';
  const filePolicy = options.onUnencodableFile ?? 'throw';
  const out: OpenAIWireMessage[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      // Built in PART ORDER, with runs of adjacent text merged into one entry.
      // A file authored after the text stays after it: `parts` is an ordered
      // content model and reordering it here would be the encoder second-guessing
      // the author. Anthropic's docs do suggest putting images before text for
      // best results, which is guidance for whoever builds the parts array.
      const content: OpenAIContentPart[] = [];
      let buffered = '';
      let carriesFile = false;

      const flushText = (): void => {
        if (buffered === '') return;
        content.push({ type: 'text', text: buffered });
        buffered = '';
      };

      message.parts.forEach((part, partIndex) => {
        if (part.type === 'text') {
          buffered += part.text;
          return;
        }
        if (part.type !== 'file') return;
        const block = encodeFilePart(part, message.id, partIndex, filePolicy, openAIFileBlock);
        if (!block) return;
        flushText();
        content.push(block);
        carriesFile = true;
      });
      flushText();

      // No file survived, so this is an ordinary turn and stays a plain string.
      if (!carriesFile) {
        const text = textOf(message.parts);
        if (text !== '') out.push({ role: 'user', content: text });
        continue;
      }
      out.push({ role: 'user', content });
      continue;
    }

    let text = '';
    let pending: SettledTool[] = [];
    let reasoning: OpenAIReasoningDetail[] = [];

    /** Emit the assistant message for everything buffered so far, then the
     *  result message for each call it announced, in the same order.
     *
     *  The early return leaves any buffered reasoning where it is on purpose:
     *  nothing was emitted, so those blocks still belong to a message that has
     *  not been written yet. In practice it is unreachable with reasoning
     *  buffered, because the only mid-loop `flush()` runs with `pending`
     *  non-empty. */
    const flush = (): void => {
      if (text === '' && pending.length === 0) return;
      out.push({
        role: 'assistant',
        content: text === '' ? null : text,
        ...(reasoning.length > 0 ? { reasoning_details: reasoning } : {}),
        ...(pending.length > 0 ? { tool_calls: pending.map(toolCallOf) } : {}),
      });
      for (const tool of pending) out.push(toolResultOf(tool));
      text = '';
      pending = [];
      reasoning = [];
    };

    for (const part of message.parts) {
      if (part.type === 'text') {
        // Text that arrives AFTER a call is the model's answer to it, so the
        // call and its result have to be on the wire before this text is.
        if (pending.length > 0) flush();
        text += part.text;
        continue;
      }
      if (part.type === 'reasoning') {
        if (!includeReasoning) continue;
        // A block after a call belongs to the round that READ the result, for the
        // same reason text does. Same rule as `toAnthropicMessages`.
        if (pending.length > 0) flush();
        const detail = reasoningDetailOf(part);
        if (detail) reasoning.push(detail);
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
 * `file` parts on a USER turn become `image` and `document` blocks, in part
 * order. Both take `source: {type:'base64'}` and `source: {type:'url'}`, so this
 * wire can carry a remote PDF that `toOpenAIMessages` has to refuse. Anything
 * neither API accepts as message content THROWS by default; see
 * `UnencodableFilePolicy`. A `file` part on an ASSISTANT turn is dropped, because
 * an assistant message here carries only text, thinking and tool_use.
 *
 * Asymmetry worth knowing: `tool_use.input` is a parsed OBJECT on this wire, not
 * a string, so it uses `input` and not `rawInput`. Only thinking blocks carry a
 * verbatim requirement.
 */
export function toAnthropicMessages(
  messages: ChatMessage[],
  options: AnthropicEncodeOptions = {},
): AnthropicWireMessage[] {
  const filePolicy = options.onUnencodableFile ?? 'throw';
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
      // Part order, for the same reason as `toOpenAIMessages`.
      const userBlocks: AnthropicContentBlock[] = [];
      message.parts.forEach((part, partIndex) => {
        if (part.type === 'text') {
          if (part.text !== '') userBlocks.push({ type: 'text', text: part.text });
          return;
        }
        if (part.type !== 'file') return;
        const block = encodeFilePart(part, message.id, partIndex, filePolicy, anthropicFileBlock);
        if (block) userBlocks.push(block);
      });
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
          // card and source are kit-side. A `file` part reaches this arm only on
          // an ASSISTANT turn, where the API accepts no image or document
          // content at all -- user attachments are handled in the user branch.
          break;
      }
    });

    flush();
  }

  return out;
}
