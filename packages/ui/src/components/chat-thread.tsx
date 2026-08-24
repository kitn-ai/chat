import { createSignal, createEffect, createMemo, For, Show, onMount } from 'solid-js';
import { ChatConfig, useChatConfig } from '../primitives/chat-config';
import { type ComposerDoc, normalizeValue, serializeToText } from '../primitives/composer-model';
import { ChatContainer, ChatContainerContent, ChatContainerScrollAnchor } from './chat-container';
import { Message, MessageAvatar, MessageBody } from './message';
import { type AttachmentData } from './attachments';
import { createMessageFeedback, type MessageActionDetail } from '../primitives/message-feedback';
import { ModelSwitcher } from './model-switcher';
import { ScrollButton } from './scroll-button';
import {
  Context, ContextTrigger, ContextContent, ContextContentHeader,
  ContextContentBody, ContextContentFooter, ContextInputUsage, ContextOutputUsage,
} from './context';
import { DefaultPromptInput, type RejectedAttachment } from '../elements/default-input';
import type { MediaTypeFilter } from '../wire/media-types';
import type { TriggerDef } from './composer';
import type { ChatMessage } from '../elements/chat-types';
import type { ProseSize } from '../primitives/chat-config';
import type { ModelOption } from '../types';
import type { CardComponentMap } from '../primitives/card-registry';
import type { CardSchemaMap } from './card-renderer';

export interface ChatThreadContextUsage {
  usedTokens: number;
  maxTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
}

export interface ChatThreadProps {
  /** Extra classes for the thread root (e.g. `h-full`). */
  class?: string;
  /** The full message thread to render, newest last. Each entry carries its role,
   *  ordered `parts`, and optional actions/avatar/feedback. Set as a JS property
   *  (`el.messages = [...]`). */
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
  /** Value of the input. A **string** is controlled (the host owns the text and
   *  updates it on `kai-value-change`). A **ComposerDoc** is a one-time seed that
   *  pre-populates pills; the user then edits freely. Leave unset for uncontrolled. */
  value?: string | ComposerDoc;
  /** Placeholder text shown in the empty input. */
  placeholder?: string;
  /** When true, shows the loading/streaming state and disables submit (use while
   *  awaiting the assistant's reply). */
  loading?: boolean;
  /** Starter prompts shown above the input when the thread is empty. Clicking one
   *  follows `suggestionMode`. Set as a JS property. */
  suggestions?: string[];
  /** What clicking a suggestion does: `'submit'` (default) sends it immediately
   *  as if typed and submitted; `'fill'` just places it in the input. */
  suggestionMode?: 'submit' | 'fill';
  /** Keep suggestions visible after the conversation starts. By default
   *  suggestions are conversation starters and hide once `messages` is
   *  non-empty; set this to keep them always shown. Default false. */
  persistSuggestions?: boolean;
  /** Body/prose font scale for rendered markdown (`'xs' | 'sm' | 'base' | 'lg'`).
   *  Defaults to `'sm'`. */
  proseSize?: ProseSize;
  /** Shiki theme name for syntax-highlighted code blocks (e.g.
   *  `'github-dark-dimmed'`). */
  codeTheme?: string;
  /** Enable Shiki syntax highlighting in code blocks. Turn off to render plain
   *  `<pre>` blocks (lighter, no highlighter load). Default true. */
  codeHighlight?: boolean;
  /** Optional header title shown on the left of the header. */
  chatTitle?: string;
  /** Optional model list. When set (>1 model) a ModelSwitcher is shown in the
   *  header and a `kai-model-change` event fires on selection. */
  models?: ModelOption[];
  /** The currently selected model id (pairs with `models`). */
  currentModel?: string;
  /** Optional context-window token usage. When set, a Context token meter is
   *  shown in the header. */
  context?: ChatThreadContextUsage;
  /** Show the scroll-to-bottom button inside the scroll area. Default true. */
  scrollButton?: boolean;
  /** Whether the host has `slot="header-start"` content (left of the title). Set
   *  by the `<kai-chat>` facade so a custom control forces the header open. */
  headerStart?: boolean;
  /** Whether the host has `slot="header-end"` content (right of the controls). */
  headerEnd?: boolean;
  // ── Composition slots ─────────────────────────────────────────────────────
  // Each flag below is set by the `<kai-chat>` facade when matching light-DOM
  // `slot="…"` content is projected, and gates one composition slot. Two kinds:
  //   • INJECT  — additive: project YOUR markup into a region (sidebar, footer,
  //               composer-actions, header-start/-end).
  //   • REPLACE — substitutive: your markup stands in for a whole region
  //               (header, empty, composer). A replaced region's projected
  //               content owns its own data/events — a slotted (light-DOM) node
  //               can't read this component's reactive state. That boundary is
  //               the whole reason `messages` stays a data prop, not a slot.
  /** REPLACE: full custom header in place of the built-in title/model/context bar. */
  headerFull?: boolean;
  /** INJECT: left sidebar column (e.g. a conversation list / your own nav). */
  sidebar?: boolean;
  /** REPLACE: custom zero-state rendered in the message area while the thread is empty (replaces the empty message list only; the composer and its suggestions still render). */
  empty?: boolean;
  /** REPLACE: full custom composer in place of the built-in prompt input. The
   *  projected content wires its own submit (the data-flow boundary). */
  composer?: boolean;
  /** INJECT: accessory row just above the composer (e.g. extra actions). */
  composerActions?: boolean;
  /** INJECT: footer row below the composer (disclaimers, token meter, …). */
  footer?: boolean;
  /** Which attachment media types the user may stage, in HTML `accept` syntax
   *  (`'image/*,application/pdf'`). Omitted means no filter. Narrowed by what the
   *  encoders can actually send — the same string, and the same resolver, as
   *  `toOpenAIMessages(msgs, { accept })`. */
  accept?: MediaTypeFilter;
  /** Files the composer refused because `accept` excluded them. */
  onAttachmentsRejected?: (rejected: RejectedAttachment[]) => void;
  /** Show a web-search (Globe) button in the input toolbar; calls `onWebSearch`. */
  webSearch?: boolean;
  /** Show a Voice (Mic) button in the input toolbar; fires a `voice` event. */
  voice?: boolean;
  /** Rich entity triggers. Each `{ char, kind, items }` opens a caret-anchored
   *  menu that inserts an atomic pill (`/` skills, `@` agents/plugins). Set as a
   *  JS property; forwarded to the input. */
  triggers?: TriggerDef[];
  /** Default icon per entity kind (kind → image src) for pills/menu items. */
  kindIcons?: Record<string, string>;
  /** Whether each message's action bar is always visible (`'always'`, default)
   *  or only revealed on hover of that message row (`'hover'`). */
  actionsReveal?: 'always' | 'hover';
  // callbacks (the facade maps these to dispatch())
  onValueChange?: (value: string) => void;
  onSubmit?: (detail: { value: string; attachments: AttachmentData[] }) => void;
  onAttachmentsChange?: (attachments: AttachmentData[]) => void;
  onSuggestionClick?: (value: string) => void;
  onModelChange?: (modelId: string) => void;
  onMessageAction?: (detail: MessageActionDetail) => void;
  onWebSearch?: () => void;
  onVoice?: () => void;
  /** Receive the imperative controller once mounted. The kai-chat facade forwards
   *  these as element methods (focus/clear/send/scrollToBottom). */
  controllerRef?: (controller: ChatThreadController) => void;
}

/** Imperative handle exposed via `controllerRef` — the input half of the chat's
 *  interaction surface, forwarded onto `<kai-chat>` as instance methods. */
export interface ChatThreadController {
  focus(options?: FocusOptions): void;
  clear(): void;
  send(): void;
  scrollToBottom(behavior?: ScrollBehavior): void;
}

/**
 * THE MESSAGE LIST'S KEY, and the reason it is not the message object. This is
 * the canonical note; `thread.tsx` keys its identical list the same way and
 * points here.
 *
 *  `<For>` is REFERENCE-keyed, and a streaming assistant message gets a brand
 *  new object identity on every delta — `createAssistantStream` rebuilds it as
 *  `{ ...prev[i], parts: next }` because a new reference IS the re-render
 *  signal. Keyed on the objects, every chunk therefore looks like an entirely
 *  new list: the whole message row is torn down and rebuilt, and everything the
 *  user did inside it dies with it. Expanding a tool or reasoning panel
 *  mid-stream did nothing at all — the disclosure opened and was discarded
 *  microseconds later by the next token. (`MessageBody` keys its PARTS by
 *  position for exactly this reason; that fix was dead while its parent kept
 *  destroying the subtree above it.)
 *
 *  So key on `message.id`, which is stable across the object churn: `<For>` over
 *  the id array diffs by string value, a delta produces an identical id list,
 *  and no row moves. The row then reads its message through `messages[i()]` —
 *  `<For>`'s index accessor, which it keeps current across inserts, removals and
 *  moves — so the CONTENT keeps updating through accessors while the DOM stays
 *  put.
 *
 *  WHY NOT `<Index>`, the other way to survive the churn: `<Index>` keys by
 *  POSITION, so a row's local state (an open panel, a half-filled form card)
 *  belongs to the slot rather than to the message. Appends and tail truncations
 *  (regenerate/edit) are fine, but prepending older turns — load-earlier-history,
 *  which every real chat grows — shifts every row, and each open disclosure
 *  stays behind with the wrong message. Position IS a valid key inside a
 *  message, where the folds only ever append or patch a part in place; it is not
 *  one for the message list, where the host owns the array and splices it.
 *  Both approaches require the row to read through accessors — that is inherent
 *  in keeping a row mounted while its object is replaced, not a cost unique to
 *  either.
 *
 *  Contract: `id` must be unique per message. It already had to be — the
 *  feedback/copy state above this list is keyed by it.
 */
/** How an ASSISTANT row aligns its parts across the column (K-D11).
 *
 *  `stretch`, not `start`. An assistant turn is a `flex flex-col` box, so under
 *  `items-start` every part is a flex item with a fit-content cross size —
 *  `min(max-content, column)`. Prose is wider than the column so a text bubble
 *  looked right, and a generative-UI card was as wide as its widest button: the
 *  ops-console parameters form measured 285px inside a 768px column while the
 *  approval card beside it filled all 768. A card in a chat thread filling its
 *  column is a fact about the medium, and no consumer can reach it — the card
 *  element is created inside `<kai-chat>`'s shadow root.
 *
 *  Stretch rather than `w-full` on the cards, for two reasons: it is one lever
 *  instead of one per card surface (the Solid `Card` root AND every `kai-*`
 *  card host, whose shadow wrapper is `display: contents`), and stretching only
 *  applies where the cross size is `auto`, so a part that states its own width
 *  is untouched — `Attachments variant="grid"` stays `w-fit`. `Tool` and
 *  `Reasoning` already asked for `w-full` explicitly; this is the same
 *  intention, applied once.
 *
 *  USER rows keep `items-end`: their bubble is `max-w-[85%]` and right aligned,
 *  and stretching it would break both.
 */
const ASSISTANT_ALIGN = 'items-stretch';

export function ChatThread(props: ChatThreadProps) {
  const outer = useChatConfig();
  const reveal = () => (props.actionsReveal === 'hover' ? 'hover' : 'always');
  const messageKeys = createMemo(() => props.messages.map((m) => m.id));
  // Feedback (copy + vote) state lives ABOVE the per-message <For>, so streaming
  // re-renders (a fresh `messages` array ref per chunk) don't wipe it.
  // The copy/feedback toasts scope to the chat (this thread's root) so they appear
  // in-chat rather than at the page top.
  let rootEl: HTMLElement | undefined;
  const feedback = createMessageFeedback({
    emit: (detail) => props.onMessageAction?.(detail),
    target: () => rootEl,
  });
  const [internal, setInternal] = createSignal<string | ComposerDoc>(props.value ?? '');
  const [attachments, setAttachments] = createSignal<AttachmentData[]>([]);
  // A string `value` is controlled; a ComposerDoc `value` is a one-time seed that
  // lives in `internal` so the user's (string) edits replace it without a fight.
  const current = (): string | ComposerDoc =>
    typeof props.value === 'string' ? props.value : internal();
  createEffect(() => {
    const v = props.value;
    if (v != null && typeof v !== 'string') setInternal(v);
  });
  const handleChange = (v: string) => { setInternal(v); props.onValueChange?.(v); };
  // After a send, reset the composer. Clear the internal draft ONLY when the value is
  // uncontrolled (props.value === undefined) — a controlled host owns its own value and
  // clears it itself. This lets the batteries-included hooks (useKaiChat/createKaiChat),
  // whose `bind` does not control `value`, get a clean composer after each submit.
  const afterSubmit = () => { setAttachments([]); if (props.value === undefined) setInternal(''); };
  const handleSubmit = () => { props.onSubmit?.({ value: serializeToText(normalizeValue(current())), attachments: attachments() }); afterSubmit(); };
  const handleSuggestionClick = (v: string) => {
    if ((props.suggestionMode ?? 'submit') === 'fill') { handleChange(v); props.onSuggestionClick?.(v); }
    else { props.onSubmit?.({ value: v, attachments: attachments() }); afterSubmit(); }
  };
  const showHeader = () => !!(props.chatTitle || props.models || props.context || props.headerStart || props.headerEnd);
  // Suggestions are conversation starters: show only on an empty thread unless
  // the host opts into persisting them.
  const visibleSuggestions = () =>
    props.persistSuggestions || props.messages.length === 0 ? props.suggestions : undefined;
  const showScrollButton = () => props.scrollButton !== false;

  // Hand the imperative controller to the facade once mounted (rootEl is set).
  onMount(() => {
    props.controllerRef?.({
      focus: (options) =>
        rootEl
          ?.querySelector<HTMLElement>('[contenteditable]:not([contenteditable="false"]), textarea')
          ?.focus(options),
      clear: () => { setInternal(''); setAttachments([]); props.onValueChange?.(''); },
      send: () => handleSubmit(),
      scrollToBottom: (behavior) => {
        const vp = rootEl?.querySelector<HTMLElement>('.overflow-y-auto');
        vp?.scrollTo({ top: vp.scrollHeight, behavior: behavior ?? 'smooth' });
      },
    });
  });

  return (
    <ChatConfig proseSize={props.proseSize} codeTheme={props.codeTheme} codeHighlight={props.codeHighlight !== false} portalMount={outer.portalMount()}>
      {/* The root is a ROW so a `sidebar` slot can sit beside the main column.
          With no sidebar projected it collapses to the original column. */}
      <div ref={(e) => (rootEl = e as HTMLElement)} class={`flex h-full bg-background ${props.class ?? ''}`}>
        <Show when={props.sidebar}>
          <aside part="sidebar" class="flex w-64 shrink-0 flex-col overflow-hidden border-r border-border">
            <slot name="sidebar" />
          </aside>
        </Show>
        <div class="flex h-full min-w-0 flex-1 flex-col">
          {/* Header: a full `header` slot REPLACES the built-in bar; otherwise the
              built-in header renders, itself carrying the header-start/header-end
              INJECT slots. */}
          <Show
            when={props.headerFull}
            fallback={
              <Show when={showHeader()}>
                <header part="header-bar" class="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
                  <div class="flex items-center gap-2">
                    {/* Consumer-injected leading controls (sidebar-toggle, compose, a
                        popover title-button). Projects light-DOM `slot="header-start"`
                        children of <kai-chat>; inert outside a shadow root. */}
                    <slot name="header-start" />
                    <Show when={props.chatTitle}>
                      <div class="text-sm font-semibold text-foreground">{props.chatTitle}</div>
                    </Show>
                  </div>
                  <div class="flex items-center gap-2">
                    <Show when={props.models}>
                      <ModelSwitcher
                        models={props.models!}
                        currentModelId={props.currentModel ?? props.models![0]?.id ?? ''}
                        onModelChange={(modelId) => props.onModelChange?.(modelId)}
                      />
                    </Show>
                    <Show when={props.context}>
                      <Context
                        usedTokens={props.context!.usedTokens} maxTokens={props.context!.maxTokens}
                        inputTokens={props.context!.inputTokens} outputTokens={props.context!.outputTokens}
                        estimatedCost={props.context!.estimatedCost}
                      >
                        <ContextTrigger />
                        <ContextContent>
                          <ContextContentHeader />
                          <ContextContentBody><div class="space-y-1.5"><ContextInputUsage /><ContextOutputUsage /></div></ContextContentBody>
                          <ContextContentFooter />
                        </ContextContent>
                      </Context>
                    </Show>
                    {/* Consumer-injected trailing controls (share, settings, …).
                        Projects light-DOM `slot="header-end"` children of <kai-chat>. */}
                    <slot name="header-end" />
                  </div>
                </header>
              </Show>
            }
          >
            <header part="header" class="shrink-0"><slot name="header" /></header>
          </Show>
          <div class="relative flex-1 overflow-hidden">
            <ChatContainer class="h-full px-4 py-3">
              <ChatContainerContent class="mx-auto w-full max-w-3xl space-y-4">
                {/* REPLACE — custom empty-state slot, shown only while the thread is
                    empty. The component still owns WHEN it shows (data state); the
                    consumer owns WHAT it looks like. */}
                <Show when={props.empty && props.messages.length === 0}>
                  <slot name="empty" />
                </Show>
                {/* Keyed by message id (see the note above this component), so a
                    streaming delta updates the row instead of replacing it. */}
                <For each={messageKeys()}>
                  {(_id, i) => (
                    // The row reads its message through <For>'s index accessor,
                    // never through a captured value: the row outlives the delta
                    // that replaced its object, so every read below has to go
                    // through `m()` for the new content to land. <Show> supplies
                    // the non-null accessor and covers the frame where a removal
                    // has shortened the array.
                    <Show when={props.messages[i()]}>
                      {(m) => {
                        const body = (
                          <MessageBody
                            parts={m().parts}
                            /* F-21: streaming-ness = the thread's ONE existing
                               loading signal + being the last message and an
                               assistant turn. No second streaming source; the
                               reasoning disclosure auto-opens on it. */
                            isStreaming={props.loading === true && m().role === 'assistant' && i() === props.messages.length - 1}
                            cardTypes={props.cardTypes}
                            cardSchemas={props.cardSchemas}
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
                          // `role` is the SPEAKER, forwarded on BOTH branches —
                          // see the same note in thread.tsx. `Message` turns it
                          // into `role="article"` + an `aria-label`; without it the
                          // row is a bare div chromium prunes from the
                          // accessibility tree as "uninteresting".
                          <Show
                            when={m().avatar}
                            fallback={
                              <Message role={m().role} class={`${rowGroup()}${m().role === 'user' ? 'flex-col items-end' : `flex-col ${ASSISTANT_ALIGN}`}`}>
                                {body}
                              </Message>
                            }
                          >
                            {(av) => (
                              <Message role={m().role} class={rowGroup()}>
                                <MessageAvatar src={av().src ?? ''} alt={av().alt ?? ''} fallback={av().fallback} />
                                <div class={`flex min-w-0 flex-1 flex-col ${m().role === 'user' ? 'items-end' : ASSISTANT_ALIGN}`}>
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
                <ChatContainerScrollAnchor />
              </ChatContainerContent>
              <Show when={showScrollButton()}>
                <div class="absolute bottom-4 left-1/2 flex w-full max-w-3xl -translate-x-1/2 justify-center px-5">
                  <ScrollButton class="shadow-sm" />
                </div>
              </Show>
            </ChatContainer>
          </div>
          {/* INJECT — accessory row above the composer (extra actions/toolbar). */}
          <Show when={props.composerActions}>
            <div class="shrink-0 px-4">
              <div class="mx-auto flex max-w-3xl items-center gap-2 pb-2"><slot name="composer-actions" /></div>
            </div>
          </Show>
          <div class="shrink-0 px-4 pb-4">
            <div class="mx-auto max-w-3xl">
              {/* REPLACE — a full `composer` slot stands in for the built-in input.
                  The slotted content owns its own submit/loading wiring. */}
              <Show
                when={props.composer}
                fallback={
                  <DefaultPromptInput
                    value={current()} placeholder={props.placeholder} loading={props.loading === true}
                    suggestions={visibleSuggestions()} attachments={attachments()}
                    accept={props.accept} onAttachmentsRejected={props.onAttachmentsRejected}
                    webSearch={props.webSearch === true} voice={props.voice === true}
                    triggers={props.triggers} kindIcons={props.kindIcons}
                    onValueChange={handleChange} onSubmit={handleSubmit} onSuggestionClick={handleSuggestionClick}
                    onAttachmentsChange={(a) => { setAttachments(a); props.onAttachmentsChange?.(a); }}
                    onWebSearch={() => props.onWebSearch?.()} onVoice={() => props.onVoice?.()}
                  />
                }
              >
                <slot name="composer" />
              </Show>
            </div>
          </div>
          {/* INJECT: footer row below the composer. */}
          <Show when={props.footer}>
            <div part="footer" class="shrink-0 px-4 pb-3">
              <div class="mx-auto max-w-3xl text-center text-xs text-muted-foreground"><slot name="footer" /></div>
            </div>
          </Show>
        </div>
      </div>
    </ChatConfig>
  );
}
