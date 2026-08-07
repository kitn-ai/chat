// Framework-neutral state core for @kitn.ai/ui. Pure functions over ChatMessage[]
// + a typed streaming handle. No React/Solid runtime — drives a consumer setter.
export { appendMessage, upsertMessage, updateMessage, removeMessage, appendContent } from './messages';
export { addSuggestion, removeSuggestion } from './suggestions';
export { createAssistantStream, onStreamSettled } from './stream';
export type { SetMessages, AssistantStream } from './stream';
export { appendTextPart, appendReasoningPart, upsertToolPart, fingerprint } from './parts';
export type { ReasoningOpts } from './parts';
