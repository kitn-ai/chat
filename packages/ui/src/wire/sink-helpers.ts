// Post-execution helpers. The kit NEVER calls a consumer's function, so a host
// runs its own tools and reports the result back through these.
import type { AssistantStreamSink } from './chunk';

/** Mark a tool call's panel done with the result the host computed. */
export function applyToolOutput(
  sink: AssistantStreamSink,
  toolCallId: string,
  output: Record<string, unknown>,
): void {
  sink.upsertTool(toolCallId, { state: 'output-available', output });
}

/** Mark a tool call's panel failed. */
export function applyToolFailure(
  sink: AssistantStreamSink,
  toolCallId: string,
  message: string,
): void {
  sink.upsertTool(toolCallId, { state: 'output-error', errorText: message });
}

/**
 * A sink wrapper that swallows text instead of appending it, and hands the
 * buffered text back at the end.
 *
 * Needed for STRUCTURED OUTPUTS: when `response_format` is a JSON schema the
 * assistant's whole message is raw JSON, so streaming it into `<kai-thread>`
 * shows the user a wall of braces. Buffer, parse, then `appendText` the human
 * part, which behaves as a SET because nothing text-shaped ever reached the
 * message (the kit has no replace-the-text operation; `appendTextPart` only ever
 * extends or opens a text part).
 *
 * Reasoning, tools and sources pass straight through. Only text is held back.
 */
export function bufferText(
  sink: AssistantStreamSink,
): AssistantStreamSink & { buffered(): string } {
  let buf = '';
  return {
    appendText(delta) {
      buf += delta;
      return undefined;
    },
    appendReasoning: (delta, opts) => sink.appendReasoning(delta, opts),
    upsertTool: (id, patch) => sink.upsertTool(id, patch),
    addSource: (source) => sink.addSource?.(source),
    buffered: () => buf,
  };
}
