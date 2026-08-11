// Message action-row feedback state — copy + like/dislike — owned ABOVE the
// per-message `<For>` so a streaming re-render (a fresh `messages` array ref per
// chunk) never wipes the user's optimistic vote or the transient "copied" check.
//
// Both facades (`ChatThread` and the `<kai-message>` element) create one of
// these and route their action-bar clicks through `handleAction`. Keeping the
// logic here (not inside the un-unit-testable `defineWebComponent` body) makes
// the toggle/toast/clipboard behavior directly testable.

import { createSignal, onCleanup } from 'solid-js';
import type { ChatMessage, FeedbackVote } from '../elements/chat-types';
import { partsToText } from '../state';
import { toast } from './toast-store';

/** Detail shape emitted by the action row. `state` is present only for the
 *  toggleable feedback votes: `'on'` when a vote is set, `'off'` when cleared.
 *  Copy / regenerate / edit / custom actions omit it. */
export interface MessageActionDetail {
  messageId: string;
  action: string;
  state?: 'on' | 'off';
}

export interface MessageFeedbackOptions {
  /** Emit the `kai-message-action` detail (facade maps this to `dispatch` /
   *  `onMessageAction`). */
  emit: (detail: MessageActionDetail) => void;
  /** How long the copy check stays before auto-clearing. Defaults to 2000ms. */
  copiedDuration?: number;
  /** Container the copy/feedback toasts should be scoped to (the chat, by
   *  default) so they appear in-chat rather than at the page top. */
  target?: () => HTMLElement | undefined;
}

export interface MessageFeedback {
  /** Resolve the active vote for a message: a controlled `m.feedback` wins,
   *  else the facade's own optimistic map. */
  resolveFeedback: (m: Pick<ChatMessage, 'id' | 'feedback'>) => FeedbackVote | undefined;
  /** Whether a message's copy button should currently show its check. */
  isCopied: (id: string) => boolean;
  /** Route a clicked action through copy / vote / passthrough handling. */
  handleAction: (m: Pick<ChatMessage, 'id' | 'parts' | 'feedback'>, action: string) => void;
}

const DEFAULT_COPIED_DURATION = 2000;

/**
 * Create the action-row feedback controller for one message list (or one
 * standalone message). Owns the optimistic `feedbackMap` + transient
 * `copiedIds`, resolves the controlled-wins vote, and turns clicks into
 * clipboard writes, toasts, and `kai-message-action` emissions.
 */
export function createMessageFeedback(opts: MessageFeedbackOptions): MessageFeedback {
  const [feedbackMap, setFeedbackMap] = createSignal<Record<string, FeedbackVote>>({});
  const [copiedIds, setCopiedIds] = createSignal<Set<string>>(new Set());
  const copiedDuration = opts.copiedDuration ?? DEFAULT_COPIED_DURATION;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  onCleanup(() => {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  });

  const resolveFeedback: MessageFeedback['resolveFeedback'] = (m) =>
    m.feedback ?? feedbackMap()[m.id];

  const isCopied: MessageFeedback['isCopied'] = (id) => copiedIds().has(id);

  const markCopied = (id: string) => {
    setCopiedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      setCopiedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, copiedDuration));
  };

  const setVote = (id: string, vote: FeedbackVote | undefined) => {
    setFeedbackMap((prev) => {
      const next = { ...prev };
      if (vote === undefined) delete next[id];
      else next[id] = vote;
      return next;
    });
  };

  const handleAction: MessageFeedback['handleAction'] = (m, action) => {
    if (action === 'copy') {
      // Clipboard may be unavailable (insecure context / jsdom); fail soft.
      try { navigator.clipboard?.writeText(partsToText(m.parts)); } catch { /* ignore */ }
      markCopied(m.id);
      toast('Copied to clipboard', { target: opts.target?.() });
      opts.emit({ messageId: m.id, action });
      return;
    }
    if (action === 'like' || action === 'dislike') {
      const current = resolveFeedback(m);
      if (current === action) {
        // Re-tap clears the vote — no toast on un-vote.
        setVote(m.id, undefined);
        opts.emit({ messageId: m.id, action, state: 'off' });
      } else {
        setVote(m.id, action);
        toast('Thanks for your feedback', { target: opts.target?.() });
        opts.emit({ messageId: m.id, action, state: 'on' });
      }
      return;
    }
    // regenerate / edit / custom — passthrough, no state.
    opts.emit({ messageId: m.id, action });
  };

  return { resolveFeedback, isCopied, handleAction };
}
