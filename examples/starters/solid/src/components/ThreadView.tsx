import { createMemo, createSignal, For, Show } from 'solid-js';
import {
  ChatContainer,
  ChatContainerContent,
  ChatContainerScrollAnchor,
  Message,
  MessageBody,
  ScrollButton,
} from '@kitn.ai/ui/solid';
import type { ChatMessage, FeedbackVote } from '@kitn.ai/ui/solid';
import { partsToText } from '@kitn.ai/ui/state';
import { ASSISTANT_ACTIONS } from '../chat-data';

interface ThreadViewProps {
  messages: () => ChatMessage[];
  onRegenerate: (messageId: string) => void;
}

/**
 * The scrolling message list.
 *
 * This is the component that makes the Solid starter different from the other
 * five: React/Vue/Svelte/Angular/vanilla drop in `<kai-thread>`, one tag that
 * owns the whole list. Solid renders the components DIRECTLY, so the list is
 * spelled out — `<ChatContainer>` for the scroll box and stick-to-bottom,
 * `<Message>` per turn, `<MessageBody>` to walk that turn's ordered `parts` and
 * render each kind (text as markdown, reasoning as a collapsible block, a tool
 * call as a panel, cards through the card registry).
 *
 * It owns the action bar's transient state — the vote and the "copied" flag —
 * because `<MessageBody>` is prop-driven and holds no signals of its own. That
 * is view state, so it lives with the view. `regenerate` is NOT: it re-runs the
 * gateway, so it goes up to `App`.
 */
export function ThreadView(props: ThreadViewProps) {
  const [votes, setVotes] = createSignal<Record<string, FeedbackVote | undefined>>({});
  const [copiedId, setCopiedId] = createSignal<string | null>(null);

  // The list's KEYS, not the messages. `<For>` is reference-keyed, and every
  // delta rebuilds the streaming message as a new object — so keying on the
  // messages themselves makes each chunk look like a brand-new list and rebuilds
  // the whole row. Diffing ids (plain strings) instead means a delta produces an
  // identical key list, nothing moves, and the row survives the update.
  //
  // Not `<Index>`: position-keying leaves a row's local state (an open tool or
  // reasoning panel) with the SLOT rather than the message, so prepending older
  // turns would shift every open disclosure onto the wrong message. Position is
  // the right key INSIDE a message, which is what `<MessageBody>` does.
  const messageKeys = createMemo(() => props.messages().map((m) => m.id));

  /** One handler for the whole action bar — `id` is the built-in action name. */
  const handleAction = (msg: ChatMessage, id: string) => {
    if (id === 'copy') {
      void navigator.clipboard?.writeText(partsToText(msg.parts));
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId((c) => (c === msg.id ? null : c)), 2000);
      return;
    }
    if (id === 'like' || id === 'dislike') {
      setVotes((prev) => ({ ...prev, [msg.id]: prev[msg.id] === id ? undefined : id }));
      return;
    }
    if (id === 'regenerate') props.onRegenerate(msg.id);
  };

  return (
    <div class="relative flex-1 overflow-y-auto">
      <ChatContainer class="h-full">
        <ChatContainerContent class="space-y-0 px-5 pt-4 pb-12">
          <For each={messageKeys()}>
            {(_id, i) => (
              // The row reads its message through <For>'s index accessor, never
              // through a captured value: it outlives the delta that replaced its
              // object, so every read has to go through msg() for the new content
              // to land. <Show> supplies the non-null accessor and covers the
              // frame where a removal has shortened the array.
              <Show when={props.messages()[i()]}>
                {(msg) => (
                  <Message
                    // `role` is the SPEAKER, not an ARIA role — <Message> turns it
                    // into role="article" plus an aria-label naming the speaker,
                    // and a data-role hook for styling. Omit it and the row is an
                    // unlabelled <div> that tells a screen reader nothing about
                    // who is talking. That is #176: every framework reading
                    // `m.role` for its alignment classes and then not passing it
                    // on. The alignment below reads the same value — if you are
                    // deriving CSS from a semantic field, the semantics have to
                    // reach the DOM too.
                    role={msg().role}
                    class={`mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 ${
                      msg().role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div class="group flex w-full flex-col gap-0">
                      <MessageBody
                        parts={msg().parts}
                        isUser={msg().role === 'user'}
                        markdown={msg().role !== 'user'}
                        actions={msg().role === 'user' ? undefined : ASSISTANT_ACTIONS}
                        actionsReveal="hover"
                        activeFeedback={votes()[msg().id]}
                        copied={copiedId() === msg().id}
                        onAction={(id) => handleAction(msg(), id)}
                      />
                    </div>
                  </Message>
                )}
              </Show>
            )}
          </For>

          <ChatContainerScrollAnchor />
        </ChatContainerContent>

        {/* Scroll-to-bottom button */}
        <div class="absolute bottom-4 left-1/2 flex w-full max-w-3xl -translate-x-1/2 justify-center px-5">
          <ScrollButton class="shadow-sm" />
        </div>
      </ChatContainer>
    </div>
  );
}
