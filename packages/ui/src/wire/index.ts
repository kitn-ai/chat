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

export { toOpenAIMessages, toAnthropicMessages, WireEncodeError } from './encode';
export type {
  AnthropicContentBlock,
  AnthropicEncodeOptions,
  AnthropicWireMessage,
  FileEncodeOptions,
  OpenAIContentPart,
  OpenAIEncodeOptions,
  OpenAIReasoningDetail,
  OpenAIToolCall,
  OpenAIWireMessage,
  UnencodableFilePolicy,
} from './encode';

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
