import type { ChatMessage } from './chat-types';

/**
 * Boundary validation for the untyped `message` / `messages` properties.
 *
 * A web component's properties are an untyped boundary: nothing stops a consumer
 * from assigning the pre-0.20.0 `{ id, role, content }` shape, and TypeScript is
 * not there at runtime to catch it. `parts` is REQUIRED internally, so a message
 * without one throws inside a Solid render pass (`groupMessageParts` iterating
 * `undefined`), and an uncaught exception there blanks the WHOLE element, not
 * just the offending message. Validating here turns that into a skipped message
 * plus one clear console error naming the element and the expected shape.
 */

/** True when `m` carries the required `parts` array. */
export function hasParts(m: unknown): m is ChatMessage {
  return !!m && typeof m === 'object' && Array.isArray((m as { parts?: unknown }).parts);
}

/** Shared tail of every diagnostic, so all facades say the same thing. */
const EXPECTED =
  "each entry needs a 'parts' array (e.g. parts: [{ type: 'text', text: 'Hi' }]). " +
  "The 'content' string field was removed in 0.20.0.";

const EMPTY: ChatMessage[] = [];

/**
 * Creates a per-element-instance validator for a `messages` array. Returns the
 * INPUT array unchanged when every entry is valid (no allocation, so streaming
 * identity checks upstream still hold), a filtered copy when some are not, and
 * `[]` when the property itself is not an array.
 *
 * Logs at most one `console.error` per validation pass, and never re-logs for a
 * message object it has already reported, so an unrelated re-render during
 * streaming does not spam the console.
 */
export function createMessagesGuard(tag: string): (messages: unknown) => ChatMessage[] {
  const warned = new WeakSet<object>();
  // WeakSet only holds objects, so primitive entries (a stray string/null in the
  // array) get one shared latch instead.
  let warnedPrimitive = false;
  let warnedNonArray = false;

  return (messages: unknown): ChatMessage[] => {
    if (!Array.isArray(messages)) {
      if (messages != null && !warnedNonArray) {
        warnedNonArray = true;
        console.error(`<${tag}>: 'messages' must be an array. Ignoring it.`);
      }
      return EMPTY;
    }
    // Fast path: nothing to report, hand back the same reference.
    if (messages.every(hasParts)) return messages as ChatMessage[];

    let invalid = 0;
    let unreported = 0;
    for (const m of messages) {
      if (hasParts(m)) continue;
      invalid++;
      if (m !== null && typeof m === 'object') {
        if (warned.has(m as object)) continue;
        warned.add(m as object);
      } else {
        if (warnedPrimitive) continue;
        warnedPrimitive = true;
      }
      unreported++;
    }
    if (unreported > 0) {
      console.error(
        `<${tag}>: skipped ${invalid} of ${messages.length} messages: ${EXPECTED}`,
      );
    }
    return messages.filter(hasParts);
  };
}
