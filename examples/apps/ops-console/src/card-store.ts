/**
 * Cards live INSIDE the thread, not beside it.
 *
 * Every helper in the kit that manages card state — `dismissRecovery`,
 * `applyResolution` — speaks `CardEnvelope[]`, but this app's envelopes are
 * `card` parts scattered across `ChatMessage.parts`. So this module is the
 * adapter: it projects the envelopes out of the thread and writes edited ones
 * back in place, and every kit helper composes over it unchanged.
 *
 * Two rules the writes have to keep (reactivity-two-halves): a NEW array
 * notifies, and a NEW object per changed item makes the change visible. Editing
 * an envelope needs both, so `withCards` rebuilds the array AND every message
 * whose parts actually changed — and returns the SAME message object for the
 * ones that did not, so untouched messages do not re-render.
 */
import type { CardEnvelope, ChatMessage, MessagePart } from '@kitn.ai/ui/state';

export type SetMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;

/** Every card envelope in the thread, oldest first. */
export function cardsOf(messages: ChatMessage[]): CardEnvelope[] {
  const found: CardEnvelope[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'card') found.push(part.envelope);
    }
  }
  return found;
}

/** Find one envelope by id, or undefined. */
export function cardById(messages: ChatMessage[], cardId: string): CardEnvelope | undefined {
  return cardsOf(messages).find((envelope) => envelope.id === cardId);
}

/**
 * Rewrite the thread's card envelopes through `edit`.
 *
 * `edit` returns the SAME envelope to leave it alone; anything else replaces it.
 */
export function withCards(
  messages: ChatMessage[],
  edit: (envelope: CardEnvelope) => CardEnvelope,
): ChatMessage[] {
  let threadChanged = false;
  const next = messages.map((message) => {
    let partsChanged = false;
    const parts: MessagePart[] = message.parts.map((part) => {
      if (part.type !== 'card') return part;
      const replacement = edit(part.envelope);
      if (replacement === part.envelope) return part;
      partsChanged = true;
      return { ...part, envelope: replacement };
    });
    if (!partsChanged) return message;
    threadChanged = true;
    return { ...message, parts };
  });
  // No edit landed: hand back the same array so nothing re-renders.
  return threadChanged ? next : messages;
}

/** Replace one envelope by id. */
export function replaceCard(messages: ChatMessage[], envelope: CardEnvelope): ChatMessage[] {
  return withCards(messages, (current) => (current.id === envelope.id ? envelope : current));
}

/**
 * Make un-resolving a card actually stick.
 *
 * A card element keeps its OWN optimistic resolution the moment it is clicked,
 * and reads `props.resolution ?? thatLocalOne`. So clearing `resolution` on the
 * envelope is not enough to bring a rejected or dismissed proposal back: the
 * prop goes away, the local one is still there, and the card stays resolved
 * while the thread says it is live.
 *
 * The one thing that clears the local copy is a change of `data` — the card
 * treats a new definition as a new question. A fresh `data` reference alongside
 * the cleared resolution is therefore what an undo has to hand over. The
 * CONTENT is untouched; only the reference is new.
 *
 * This sits in the store rather than at one call site because both undo paths
 * need it: our own "Undo" on a rejection, and `dismissRecovery`'s `onReopen` /
 * its own Undo, which clear the resolution through `set` and know nothing about
 * any of this.
 */
export function revive(current: CardEnvelope, next: CardEnvelope): CardEnvelope {
  const cameBackToLife = current.resolution !== undefined && next.resolution === undefined;
  if (!cameBackToLife) return next;
  const data = next.data;
  if (data === null || typeof data !== 'object') return { ...next };
  return { ...next, data: Array.isArray(data) ? [...data] : { ...(data as Record<string, unknown>) } };
}

/**
 * The `{ get, set }` pair `dismissRecovery` wants, backed by the thread.
 *
 * `get` reads through a ref rather than closing over a render's `messages`,
 * because the kit calls it at event time and a stale closure would silently
 * dismiss against a thread that has moved on.
 */
export function cardStore(
  read: () => ChatMessage[],
  setMessages: SetMessages,
): { get: () => CardEnvelope[]; set: (next: CardEnvelope[]) => void } {
  return {
    get: () => cardsOf(read()),
    set: (next) => {
      const byId = new Map(next.map((envelope) => [envelope.id, envelope]));
      setMessages((prev) =>
        withCards(prev, (current) => {
          const replacement = byId.get(current.id);
          return replacement ? revive(current, replacement) : current;
        }),
      );
    },
  };
}
