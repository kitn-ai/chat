import { Show, createSignal, onMount, onCleanup } from 'solid-js';
import { defineWebComponent } from './define';
import { createControllableSignal } from '../primitives/controllable';
import { readSlots, WORKSPACE_SLOTS } from './slots';
import { ChatThread, type ChatThreadContextUsage, type ChatThreadController } from '../components/chat-thread';
import { ConversationList, CollapsedRail } from '../components/conversation-list';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
import { cardComponentsFromTags } from './message';
import { createMessagesGuard } from './validate-messages';
import type { AttachmentData } from '../components/attachments';
import type { TriggerDef } from '../components/composer';
import type { ChatMessage } from './chat-types';
import type { ProseSize } from '../primitives/chat-config';
import type { ModelOption, ConversationGroup, ConversationSummary } from '../types';

interface Props extends Record<string, unknown> {
  /** The sidebar's section headers, rendered in array order. A group carries no
   *  conversations of its own; it is matched against `conversations` by id, so
   *  the two props are complementary rather than alternatives. Omit for an
   *  ungrouped sidebar. Set as a JS property. */
  groups: ConversationGroup[];
  /** Every conversation in the sidebar, flat. Each one is filed under the group
   *  whose `id` equals its `groupId`; one with no `groupId` falls into a trailing
   *  ungrouped section (headerless when `compact`). There is no recency bucketing,
   *  and a `groupId` matching no entry in `groups` is not rendered. Set as a JS
   *  property. */
  conversations: ConversationSummary[];
  /** Id of the open conversation, highlighted in the sidebar. */
  activeId?: string;
  /** The active conversation's message thread, newest last. Set as a JS property. */
  messages: ChatMessage[];
  value?: string;
  placeholder?: string;
  loading?: boolean;
  suggestions?: string[];
  suggestionMode?: 'submit' | 'fill';
  proseSize?: ProseSize;
  codeTheme?: string;
  codeHighlight?: boolean;
  chatTitle?: string;
  models?: ModelOption[];
  currentModel?: string;
  context?: ChatThreadContextUsage;
  scrollButton?: boolean;
  search?: boolean;
  voice?: boolean;
  /** Rich entity triggers (`/` skills, `@` agents/plugins) forwarded to the input. */
  triggers?: TriggerDef[];
  /** Default icon per entity kind (kind → image src) forwarded to the input. */
  kindIcons?: Record<string, string>;
  /** Sidebar default width as a percent of the workspace (default 26). */
  sidebarWidth?: number;
  /** Sidebar min width in px (default 240). */
  sidebarMinWidth?: number;
  /** Sidebar max width in px (default 420). */
  sidebarMaxWidth?: number;
  /** Controlled collapsed state. Set this as a JS property (`el.sidebarCollapsed
   *  = true`) to drive the sidebar from your app, updating it in response to the
   *  `kai-sidebar-toggle` event. Omit for uncontrolled (the element manages it). */
  sidebarCollapsed?: boolean;
  /** Initial collapsed state when uncontrolled (default false). Use the
   *  `default-sidebar-collapsed` attribute to start collapsed in plain HTML. */
  defaultSidebarCollapsed?: boolean;
  /** Auto-collapse the rail when the workspace's own width drops below this many
   *  px, and re-expand when it grows back above. Uncontrolled only (it never
   *  fights an app-driven `sidebarCollapsed`); omit to disable. Fires
   *  `kai-sidebar-toggle`. Attribute: `collapse-below`. */
  collapseBelow?: number;
  /** Render Recents as dense single-line rows (a leading dot + title, no count). */
  compact?: boolean;
  /** Suppress the built-in ConversationList so the `sidebar-header` slot owns the
   *  whole rail flex region (for apps that supply their own rail nav). Default
   *  false. Attribute: `no-conversations`. */
  noConversations?: boolean;
  /** Optional card type -> custom-element tag overrides/additions for `card`
   *  parts (merged over the built-ins). Property: `el.cardTypes`. Typed as a
   *  plain string map (not the `CardTagMap` alias) so the generated React
   *  wrapper inlines it instead of emitting an unresolved named type. */
  cardTypes?: Record<string, string>;
}

interface Events {
  /** A conversation was selected in the sidebar. */
  'kai-conversation-select': { id: string };
  /** The "New chat" button was clicked. */
  'kai-new-chat': Record<string, never>;
  /** The sidebar was collapsed or expanded. */
  'kai-sidebar-toggle': { collapsed: boolean };
  /** User submitted a message. */
  'kai-submit': { value: string; attachments: AttachmentData[] };
  /** Fired on every input change. */
  'kai-value-change': { value: string };
  /** The header model switcher changed. */
  'kai-model-change': { modelId: string };
  /** An action button on a message was clicked. `state` is present only for the
   *  toggleable feedback votes: `'on'` when a like/dislike is set, `'off'` when
   *  re-tapped to clear. */
  'kai-message-action': { messageId: string; action: string; state?: 'on' | 'off' };
  /** The Search button was clicked. */
  'kai-search': Record<string, never>;
  /** The Mic / voice button was clicked. */
  'kai-voice': Record<string, never>;
  /** A suggestion chip was clicked (only in `suggestion-mode="fill"`). */
  'kai-suggestion-click': { value: string };
}

defineWebComponent<Props, Events>('kai-workspace', {
  groups: [], conversations: [], activeId: undefined, messages: [],
  value: undefined, placeholder: 'Send a message...', loading: false,
  suggestions: undefined, suggestionMode: 'submit', proseSize: 'sm',
  codeTheme: 'github-dark-dimmed', codeHighlight: true, chatTitle: undefined,
  models: undefined, currentModel: undefined, context: undefined, scrollButton: true,
  search: false, voice: false, triggers: undefined, kindIcons: undefined,
  sidebarWidth: 26, sidebarMinWidth: 240, sidebarMaxWidth: 420,
  sidebarCollapsed: undefined, defaultSidebarCollapsed: undefined, collapseBelow: undefined, compact: undefined,
  noConversations: undefined, cardTypes: undefined,
}, (props, { dispatch, flag, expose, element }) => {
  // `messages` is an untyped boundary: a consumer can hand it anything at
  // runtime (a pre-0.20.0 `{ id, role, content }` array, in particular). Skip
  // the invalid entries rather than let `groupMessageParts` throw deep inside a
  // render pass, which would blank the whole workspace instead of one message.
  const validMessages = createMessagesGuard('kai-workspace');

  // Which injection slots the consumer has filled. A bare <slot> is always a
  // truthy JSX node, so we render each region wrapper ONLY when readSlots reports
  // projected light-DOM content (re-read on childList mutation).
  const [slots, setSlots] = createSignal<Record<string, boolean>>({});
  onMount(() => {
    const read = () => setSlots(readSlots(element, WORKSPACE_SLOTS));
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true });
    onCleanup(() => observer.disconnect());
  });

  // Controlled/uncontrolled collapse: `sidebarCollapsed` (when set) wins;
  // otherwise the element manages its own state, seeded from
  // `defaultSidebarCollapsed`. `setCollapsedTo` always writes the internal value (a
  // no-op visually while controlled) and emits `kai-sidebar-toggle` so a controlling
  // app can update its own state.
  const [collapsed, setCollapsed] = createControllableSignal(
    () => props.sidebarCollapsed as boolean | undefined,
    flag('defaultSidebarCollapsed'),
  );
  const setCollapsedTo = (next: boolean) => { setCollapsed(next); dispatch('kai-sidebar-toggle', { collapsed: next }); };
  const toggle = () => setCollapsedTo(!collapsed());

  // Responsive auto-collapse. When `collapseBelow` is set, a ResizeObserver on the
  // workspace root collapses the rail once the workspace's own width drops below
  // it and re-expands above it. Uncontrolled only — bail while `sidebarCollapsed`
  // is set so we never fight an app-driven collapse. `autoCollapsed` tracks whether
  // WE collapsed it, so a user's manual expand isn't auto-undone on the next tick.
  let rootEl!: HTMLDivElement;
  let autoCollapsed = false;
  onMount(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const below = props.collapseBelow as number | undefined;
      if (below == null || props.sidebarCollapsed !== undefined) return;
      const width = entries[0]?.contentRect.width ?? rootEl.clientWidth;
      const isBelow = width < below;
      if (isBelow && !collapsed()) {
        autoCollapsed = true;
        setCollapsedTo(true);
      } else if (!isBelow && collapsed() && autoCollapsed) {
        autoCollapsed = false;
        setCollapsedTo(false);
      }
    });
    ro.observe(rootEl);
    onCleanup(() => ro.disconnect());
  });

  // Imperative method API. The sidebar methods drive the same collapse path as the
  // in-UI toggle (named *Sidebar to avoid the `sidebarCollapsed` prop accessor).
  // The thread methods delegate to the embedded ChatThread's controller, captured
  // once below — the thread node is shared across both <Show> branches, so a single
  // controllerRef is stable across collapse/expand.
  let controller: ChatThreadController | undefined;
  expose({
    /** Collapse/expand the conversation sidebar and fire `kai-sidebar-toggle`. */
    toggleSidebar: () => toggle(),
    /** Force the conversation sidebar collapsed (fires `kai-sidebar-toggle`). */
    collapseSidebar: () => setCollapsedTo(true),
    /** Force the conversation sidebar expanded (fires `kai-sidebar-toggle`). */
    expandSidebar: () => setCollapsedTo(false),
    /** Focus the thread's composer. */
    focus: (options?: FocusOptions) => controller?.focus(options),
    /** Clear the thread draft + staged attachments. */
    clear: () => controller?.clear(),
    /** Submit the current thread draft programmatically (fires `kai-submit`). */
    send: () => controller?.send(),
    /** Scroll the thread to the newest message. */
    scrollToBottom: (behavior?: ScrollBehavior) => controller?.scrollToBottom(behavior),
  });

  // Create the thread ONCE and reference the same node in both <Show> branches.
  // It's owned by this component root (not by a Show branch), so toggling the
  // sidebar moves the node between branches without disposing it — the thread's
  // own state (e.g. an uncontrolled draft) survives the collapse/expand.
  const threadEl = (
    <ChatThread
      messages={validMessages(props.messages)} value={props.value as string | undefined} placeholder={props.placeholder as string}
      loading={flag('loading')} suggestions={props.suggestions as string[] | undefined}
      suggestionMode={props.suggestionMode as 'submit' | 'fill'} proseSize={props.proseSize as ProseSize}
      codeTheme={props.codeTheme as string} codeHighlight={flag('codeHighlight')}
      chatTitle={props.chatTitle as string | undefined} models={props.models as ModelOption[] | undefined}
      currentModel={props.currentModel as string | undefined} context={props.context as ChatThreadContextUsage | undefined}
      scrollButton={props.scrollButton !== false} search={flag('search')} voice={flag('voice')}
      triggers={props.triggers as TriggerDef[] | undefined}
      kindIcons={props.kindIcons as Record<string, string> | undefined}
      cardTypes={cardComponentsFromTags(props.cardTypes as Record<string, string> | undefined, (props as { theme?: string }).theme)}
      onValueChange={(value) => dispatch('kai-value-change', { value })}
      onSubmit={(detail) => dispatch('kai-submit', detail)}
      onSuggestionClick={(value) => dispatch('kai-suggestion-click', { value })}
      onModelChange={(modelId) => dispatch('kai-model-change', { modelId })}
      onMessageAction={(detail) => dispatch('kai-message-action', detail)}
      onSearch={() => dispatch('kai-search', {})}
      onVoice={() => dispatch('kai-voice', {})}
      controllerRef={(c) => (controller = c)}
    />
  );

  // The main region: an optional top-placed `main-header` band above the thread.
  // Shared across both collapse branches (the thread node is the same instance).
  const mainRegion = (
    <div class="flex h-full flex-col overflow-hidden">
      <Show when={slots()['main-header']}>
        <div class="shrink-0 border-b border-border"><slot name="main-header" /></div>
      </Show>
      <div class="min-h-0 flex-1">
        <Show when={slots()['main']} fallback={threadEl}>
          <slot name="main" />
        </Show>
      </div>
    </div>
  );

  return (
    <div ref={rootEl} class="h-full w-full overflow-hidden bg-background">
      <Show
        when={!collapsed()}
        fallback={
          <div class="flex h-full">
            {/* Collapsed: the reopen control lives in its OWN thin rail column
                (matching the sidebar's bg-surface) rather than floating over the
                content. The previous `absolute` overlay sat on top of a
                `main-header`'s leading title — see the t3code/codex/chatgpt apps,
                all of which fill that slot — so it both overlapped the header and
                competed with any in-header toggle. A dedicated column never
                overlaps and reads as a collapsed sidebar. */}
            <div class="flex w-11 shrink-0 flex-col items-center border-r border-border bg-surface pt-2.5">
              <CollapsedRail onExpand={toggle} class="bg-transparent shadow-none backdrop-blur-none" />
            </div>
            <div class="min-w-0 flex-1">{mainRegion}</div>
          </div>
        }
      >
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={props.sidebarWidth as number} data-min-size={String(props.sidebarMinWidth)} data-max-size={String(props.sidebarMaxWidth)}>
            {/* The rail: an optional injected header above the list and footer
                below it (upgrade card / Design trigger / user menu). Carries a
                subtle, theme-aware default background (bg-surface), exposed as
                ::part(sidebar) so a consumer can override it. The inner list is
                made transparent so the part background reads uniformly. */}
            <div part="sidebar" class="flex h-full flex-col overflow-hidden bg-surface">
              <Show when={slots()['sidebar-header']}>
                {/* When `no-conversations` suppresses the built-in list, the
                    projected header owns the whole rail flex region; otherwise it
                    sits as a fixed band above the list. */}
                <div class={flag('noConversations') ? 'min-h-0 flex-1' : 'shrink-0'}><slot name="sidebar-header" /></div>
              </Show>
              <Show when={!flag('noConversations')}>
                <div class="min-h-0 flex-1">
                  <ConversationList
                    class="bg-transparent"
                    groups={props.groups} conversations={props.conversations} activeId={props.activeId as string | undefined}
                    compact={flag('compact')}
                    onSelect={(id) => dispatch('kai-conversation-select', { id })}
                    onNewChat={() => dispatch('kai-new-chat', {})}
                    onToggleSidebar={toggle}
                  />
                </div>
              </Show>
              <Show when={slots()['sidebar-footer']}>
                <div class="shrink-0"><slot name="sidebar-footer" /></div>
              </Show>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel>{mainRegion}</ResizablePanel>
        </ResizablePanelGroup>
      </Show>
    </div>
  );
});
