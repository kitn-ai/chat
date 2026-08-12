// Framework-neutral state core for @kitn.ai/ui. Pure functions over ChatMessage[]
// + a typed streaming handle. No React/Solid runtime — drives a consumer setter.
export { appendMessage, upsertMessage, updateMessage, removeMessage, appendText, textMessage, partsToText } from './messages';
export { addSuggestion, removeSuggestion } from './suggestions';
export { createAssistantStream, onStreamSettled } from './stream';
export type { SetMessages, AssistantStream } from './stream';
export { appendTextPart, appendReasoningPart, upsertToolPart, upsertCardPart, fingerprint } from './parts';
export type { ReasoningOpts } from './parts';

// The zero-config mock. Produces SSE frames rather than folding parts directly,
// so the no-backend preview runs through the SAME parser a real provider does —
// and is deliberately impossible to mistake for one. See ./mock.
export { createMockResponder, DEFAULT_MOCK_REPLIES, MOCK_BANNER, MOCK_MARKER, MOCK_MARKER_KEY, MOCK_MODEL_ID } from './mock';
export type { MockResponder, MockResponderOptions } from './mock';

// The content-model types every signature above mentions. Without these a
// consumer importing only from '@kitn.ai/ui/state' cannot annotate the very
// values these helpers take and return (the missing-annotation gap that made an
// un-annotated `const history = [...]` widen to `string` and fail TS2322).
export type {
  ChatMessage, ChatMessageAction, CustomAction, AvatarData, FeedbackVote, MessagePart,
  MessageSource, RawOrigin,
} from '../elements/chat-types';
export type { ToolPart } from '../components/tool-types';
export type { ToolKind } from '../components/tool-classify';
// upsertToolPart defaults `kind` to classifyTool(type) and reverts it on a type
// change (see ./parts), and ToolPart.kind's doc comment names the function, so a
// consumer computing `kind` itself needs the identical classifier — not a
// hand-rolled copy that drifts from ours.
export { classifyTool } from '../components/tool-classify';
export type { CardEnvelope } from '../primitives/card-contract';
export type { AttachmentData } from '../components/attachment-types';
