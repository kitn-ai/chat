import { For, Show, createMemo, onMount, type JSX } from 'solid-js';
import { ChatConfig, useChatConfig } from '../primitives/chat-config';
import { ChatContainer, ChatContainerContent, ChatContainerScrollAnchor } from './chat-container';
import { Message, MessageAvatar, MessageBody } from './message';
import { createMessageFeedback, type MessageActionDetail } from '../primitives/message-feedback';
import { ScrollButton } from './scroll-button';
import { Loader } from './loader';
import type { ChatMessage } from '../elements/chat-types';
import type { ProseSize } from '../primitives/chat-config';
import type { CardComponentMap } from '../primitives/card-registry';
import type { CardSchemaMap } from './card-renderer';

/** Imperative handle exposed via `controllerRef` — the thread's scroll control,
 *  forwarded onto `<kai-thread>` as the `scrollToBottom()` instance method. */
export interface ThreadController {
  /** Scroll the message list to the bottom (default `'smooth'`). */
  scrollToBottom(behavior?: ScrollBehavior): void;
}

export interface ThreadProps {
  /** Extra classes for the thread root (e.g. `rounded-xl`). */
  class?: string;
  /** The full message thread to render, newest last. Each entry carries its role,
   *  ordered `parts`, and optional actions/avatar/feedback. A new array reference
   *  per streaming chunk re-renders (mutating in place does not). */
  messages: ChatMessage[];
  /** Add/override card type -> component entries, forwarded to `CardRenderer`
   *  for `card` parts. */
  cardTypes?: CardComponentMap;
  /** JSON Schemas for the card types this app renders, keyed by envelope type,
   *  forwarded to `CardRenderer` for `card` parts. The companion of `cardTypes`:
   *  that says what DRAWS a card, this says what a VALID one looks like.
   *  `createCardRegistry(...).validationSchemas` is exactly this shape. Without it
   *  the kit checks its own seven built-ins and leaves your own card type
   *  unvalidated. A schema here WINS over a built-in of the same name. */
  cardSchemas?: CardSchemaMap;
  /** The custom-element host node to emit card events off when no `CardProvider`
   *  is present, forwarded through `MessageBody` to `CardRenderer` (F-26). The
   *  element facades pass their own host element so card events leave as the
   *  bubbling `kai-card` CustomEvent. */
  cardHostElement?: HTMLElement;
  /** Show a typing indicator on the pending assistant turn — use while awaiting
   *  the assistant's reply. */
  loading?: boolean;
  /** Body/prose font scale for rendered markdown (`'xs' | 'sm' | 'base' | 'lg'`).
   *  Defaults to `'sm'`. */
  proseSize?: ProseSize;
  /** Shiki theme name for syntax-highlighted code blocks (e.g.
   *  `'github-dark-dimmed'`). */
  codeTheme?: string;
  /** Enable Shiki syntax highlighting in code blocks. Turn off to render plain
   *  `<pre>` blocks (lighter, no highlighter load). Default true. */
  codeHighlight?: boolean;
  /** Whether each message's action bar is always visible (`'always'`, default) or
   *  only revealed on hover of that message row (`'hover'`). */
  actionsReveal?: 'always' | 'hover';
  /** Show the scroll-to-bottom button inside the scroll area. Default true. */
  scrollButton?: boolean;
  /** Custom zero-state shown while the thread is empty. A sensible default renders
   *  when omitted (the `<kai-thread>` facade wires this to `slot="empty"`). */
  empty?: JSX.Element;
  /** Fired when a message's action button is clicked (copy / vote / regenerate /
   *  edit / custom). The facade re-dispatches this as `kai-message-action`. */
  onMessageAction?: (detail: MessageActionDetail) => void;
  /** Receive the imperative controller once mounted — the `<kai-thread>` facade
   *  forwards `scrollToBottom` onto the host. */
  controllerRef?: (controller: ThreadController) => void;
}

/** Built-in zero-state, shown when the thread is empty and no `empty` is supplied. */
function DefaultEmpty() {
  return (
    <div class="flex min-h-[10rem] flex-1 flex-col items-center justify-center gap-1 py-12 text-center">
      <p class="text-sm font-medium text-foreground">No messages yet</p>
      <p class="text-xs text-muted-foreground">
        Messages will appear here as the conversation starts.
      </p>
    </div>
  );
}

/**
 * `Thread` — the message-list slice of a chat, as a standalone composable: the
 * scrolling list of messages + per-message rendering (markdown, code highlight,
 * reasoning + tool panels, avatars, and the action row), stick-to-bottom scroll
 * with a scroll-to-bottom button, an optional typing indicator, and an empty
 * state. No composer, header, suggestions, or sidebar — those are sibling/preset
 * concerns. This is the source of truth behind the `<kai-thread>` facade; it is
 * composed from the same internal pieces `ChatThread` uses for its message list.
 */
export function Thread(props: ThreadProps) {
  const outer = useChatConfig();
  const reveal = () => (props.actionsReveal === 'hover' ? 'hover' : 'always');
  // Feedback (copy + vote) state lives ABOVE the per-message <For>, so streaming
  // re-renders (a fresh `messages` array ref per chunk) don't wipe it. The
  // copy/feedback toasts scope to this thread's root so they appear in-thread
  // rather than at the page top.
  let rootEl: HTMLElement | undefined;
  const feedback = createMessageFeedback({
    emit: (detail) => props.onMessageAction?.(detail),
    target: () => rootEl,
  });
  const showScrollButton = () => props.scrollButton !== false;
  const showEmpty = () => props.messages.length === 0 && !props.loading;
  // Keyed by message id, NOT by object reference: a streaming message is a new
  // object every delta, and a reference-keyed <For> rebuilds the whole row for
  // each one — which is why expanding a tool/reasoning panel mid-stream used to
  // do nothing. Full rationale (and why not `<Index>`) in `chat-thread.tsx`.
  const messageKeys = createMemo(() => props.messages.map((m) => m.id));

  // Hand the imperative controller to the facade once mounted (rootEl is set).
  onMount(() => {
    props.controllerRef?.({
      scrollToBottom: (behavior) => {
        const vp = rootEl?.querySelector<HTMLElement>('.overflow-y-auto');
        vp?.scrollTo({ top: vp.scrollHeight, behavior: behavior ?? 'smooth' });
      },
    });
  });

  return (
    <ChatConfig
      proseSize={props.proseSize}
      codeTheme={props.codeTheme}
      codeHighlight={props.codeHighlight !== false}
      portalMount={outer.portalMount()}
    >
      <div
        ref={(e) => (rootEl = e as HTMLElement)}
        class={`relative flex h-full min-h-0 flex-col bg-background ${props.class ?? ''}`}
      >
        <ChatContainer class="h-full px-4 py-3">
          <ChatContainerContent class="mx-auto w-full max-w-3xl space-y-4">
            {/* Zero-state: the consumer owns WHAT it looks like (`empty`); the
                component owns WHEN it shows (empty + not loading). */}
            <Show when={showEmpty()}>
              <Show when={props.empty} fallback={<DefaultEmpty />}>
                {props.empty}
              </Show>
            </Show>
            <For each={messageKeys()}>
              {(_id, i) => (
                // Read the message through <For>'s index accessor, never through
                // a captured value — the row outlives the delta that replaced its
                // object. <Show> supplies the non-null accessor and covers the
                // frame where a removal has shortened the array.
                <Show when={props.messages[i()]}>
                  {(m) => {
                    const body = (
                      <MessageBody
                        parts={m().parts}
                        cardTypes={props.cardTypes}
                        cardSchemas={props.cardSchemas}
                        cardHostElement={props.cardHostElement}
                        isUser={m().role === 'user'}
                        markdown={m().role === 'assistant'}
                        actions={m().actions}
                        actionsReveal={reveal()}
                        activeFeedback={feedback.resolveFeedback(m())}
                        copied={feedback.isCopied(m().id)}
                        onAction={(action) => feedback.handleAction(m(), action)}
                      />
                    );
                    const rowGroup = () => (reveal() === 'hover' ? 'group ' : '');
                    return (
                      // `role` is the SPEAKER, and it has to be forwarded on BOTH
                      // branches. `Message` turns it into `role="article"` + an
                      // `aria-label` naming the speaker; without it the row is a
                      // bare div that chromium prunes from the accessibility tree
                      // as "uninteresting", so a screen reader gets no speaker at
                      // all. Every other read of `m().role` here is cosmetic
                      // (alignment, markdown), which is exactly how it went
                      // missing: the value was in hand and used for styling while
                      // being dropped for semantics.
                      <Show
                        when={m().avatar}
                        fallback={
                          <Message role={m().role} class={`${rowGroup()}${m().role === 'user' ? 'flex-col items-end' : 'flex-col items-start'}`}>
                            {body}
                          </Message>
                        }
                      >
                        {(av) => (
                          <Message role={m().role} class={rowGroup()}>
                            <MessageAvatar src={av().src ?? ''} alt={av().alt ?? ''} fallback={av().fallback} />
                            <div class={`flex min-w-0 flex-1 flex-col ${m().role === 'user' ? 'items-end' : 'items-start'}`}>
                              {body}
                            </div>
                          </Message>
                        )}
                      </Show>
                    );
                  }}
                </Show>
              )}
            </For>
            {/* Typing indicator on the pending assistant turn.
                DELIBERATELY role-less, unlike the rows above — this is not an
                oversight of the same kind. There is no message here yet, so
                `role="assistant"` would announce an empty article named
                "Assistant message". What a pending indicator needs instead is a
                live region, so its ARRIVAL and departure are announced. The
                Loader already carries an accessible name — an sr-only "Loading"
                on all nine shape variants — and what it lacks is the
                `role="status"` / aria-live wrapper around it. A real but
                SEPARATE gap, and it lives in loader.tsx. Filed, not fixed here. */}
            <Show when={props.loading}>
              <Message class="flex-col items-start">
                <div class="rounded-lg px-1 py-2">
                  <Loader variant="typing" />
                </div>
              </Message>
            </Show>
            <ChatContainerScrollAnchor />
          </ChatContainerContent>
          <Show when={showScrollButton()}>
            <div class="absolute bottom-4 left-1/2 flex w-full max-w-3xl -translate-x-1/2 justify-center px-5">
              {/* The button now owns its elevation (kai-elevation); a `shadow-sm`
                  here would set box-shadow a second time and the winner would
                  be stylesheet order, not this call site. */}
              <ScrollButton />
            </div>
          </Show>
        </ChatContainer>
      </div>
    </ChatConfig>
  );
}
