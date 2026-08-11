import { createSignal, createEffect, For, Show, onMount } from 'solid-js';
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
import { DefaultPromptInput } from '../elements/default-input';
import type { TriggerDef } from './composer';
import type { ChatMessage } from '../elements/chat-types';
import type { ProseSize } from '../primitives/chat-config';
import type { ModelOption } from '../types';
import type { CardComponentMap } from '../primitives/card-registry';

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
  /** Whether the host has `slot="header-start"` content (left of the title) —
   *  set by the `<kai-chat>` facade so a custom control forces the header open. */
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
  /** REPLACE — full custom header in place of the built-in title/model/context bar. */
  headerFull?: boolean;
  /** INJECT — left sidebar column (e.g. a conversation list / your own nav). */
  sidebar?: boolean;
  /** REPLACE — custom zero-state rendered in the message area while the thread is empty (replaces the empty message list only; the composer and its suggestions still render). */
  empty?: boolean;
  /** REPLACE — full custom composer in place of the built-in prompt input. The
   *  projected content wires its own submit (the data-flow boundary). */
  composer?: boolean;
  /** INJECT — accessory row just above the composer (e.g. extra actions). */
  composerActions?: boolean;
  /** INJECT — footer row below the composer (disclaimers, token meter, …). */
  footer?: boolean;
  /** Show a Search (Globe) button in the input toolbar; fires a `search` event. */
  search?: boolean;
  /** Show a Voice (Mic) button in the input toolbar; fires a `voice` event. */
  voice?: boolean;
  /** Rich entity triggers — each `{ char, kind, items }` opens a caret-anchored
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
  onSearch?: () => void;
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

export function ChatThread(props: ChatThreadProps) {
  const outer = useChatConfig();
  const reveal = () => (props.actionsReveal === 'hover' ? 'hover' : 'always');
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
                <For each={props.messages}>
                  {(m) => {
                    const body = (
                      <MessageBody
                        parts={m.parts}
                        cardTypes={props.cardTypes}
                        isUser={m.role === 'user'}
                        markdown={m.role === 'assistant'}
                        actions={m.actions}
                        actionsReveal={reveal()}
                        activeFeedback={feedback.resolveFeedback(m)}
                        copied={feedback.isCopied(m.id)}
                        onAction={(action) => feedback.handleAction(m, action)}
                      />
                    );
                    const rowGroup = reveal() === 'hover' ? 'group ' : '';
                    return (
                      <Show
                        when={m.avatar}
                        fallback={
                          <Message class={`${rowGroup}${m.role === 'user' ? 'flex-col items-end' : 'flex-col items-start'}`}>
                            {body}
                          </Message>
                        }
                      >
                        {(av) => (
                          <Message class={rowGroup}>
                            <MessageAvatar src={av().src ?? ''} alt={av().alt ?? ''} fallback={av().fallback} />
                            <div class={`flex min-w-0 flex-1 flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                              {body}
                            </div>
                          </Message>
                        )}
                      </Show>
                    );
                  }}
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
                    search={props.search === true} voice={props.voice === true}
                    triggers={props.triggers} kindIcons={props.kindIcons}
                    onValueChange={handleChange} onSubmit={handleSubmit} onSuggestionClick={handleSuggestionClick}
                    onAttachmentsChange={(a) => { setAttachments(a); props.onAttachmentsChange?.(a); }}
                    onSearch={() => props.onSearch?.()} onVoice={() => props.onVoice?.()}
                  />
                }
              >
                <slot name="composer" />
              </Show>
            </div>
          </div>
          {/* INJECT — footer row below the composer. */}
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
