import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { type JSX, createSignal, createMemo } from 'solid-js';
import { BuilderPanel, type BuilderConstruct } from '../components/builder-panel';
import { BuilderLayout, type BuilderViewport } from '../components/builder-layout';
import { resolveAccentWrapperStyle } from '../components/builder-preview';
import { ChatThread } from '../components/chat-thread';
import { ConversationList } from '../components/conversation-list';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '../components/empty';
import {
  type UserActionId,
  type AssistantActionId,
  type ActionRowState,
  USER_ACTION_CATALOG,
  ASSISTANT_ACTION_CATALOG,
  DEFAULT_USER_ACTION_ROWS,
  DEFAULT_ASSISTANT_ACTION_ROWS,
  ActionRowPicker,
} from '../components/builder-message-actions';
import {
  type TriggerGroupState,
  ComposerTriggersSection,
  buildTriggerDefs,
  DEFAULT_SLASH_ENTRIES,
  DEFAULT_MENTION_ENTRIES,
} from '../components/builder-composer-triggers';
import {
  type ShellControlsState,
  ShellSection,
  CommandPaletteOverlay,
  CommandPaletteTrigger,
  UserMenu,
} from '../components/builder-shell-controls';
import { Switch } from '../ui/switch';
import { Select } from '../ui/select';
import { cn } from '../utils/cn';
import type { ChatMessage, ChatMessageAction, CustomAction } from './chat-types';
import type { ConversationGroup, ConversationSummary, ModelOption } from '../types';

// Labs/Builder/Assistant — T-1 build-out (docs/superpowers/specs/
// 2026-08-28-template-builder-design.md), THIRD template story: the
// fullscreen, ChatGPT-shaped assistant — layout: 'fullscreen' plus a
// persistent conversations sidebar. Same convergence story as every prior
// template round: `Labs/Builder/Start`'s "Assistant" card is the intended
// entry point, unwired here (story-first). T-2: the template FIXES the
// layout, so there is no Layout radio (`sections={{ layout: false, widget:
// 'never', provider: true, home: false }}`).
//
// SIDEBAR IS A STORY-OWN COMPOSITION, NOT `ChatThread`'s `sidebar` SLOT:
// `ChatThread`'s own `sidebar` prop (`components/chat-thread.tsx`) renders a
// `<slot name="sidebar">` — real light-DOM slotting, meant for the
// `kai-chat` web-component facade's projected children, not something a
// bare Solid `<ChatThread>` usage can fill with JSX. This preview instead
// composes the kit's own real `ConversationList` component directly beside
// `ChatThread` in a flex row — the same sidebar CONTENT a construct's real
// `conversations: true` capability would eventually back, just assembled
// by this story rather than through the slot mechanism a full construct
// emission uses. Conversation summaries are stub data (never wired to
// `ChatThread`'s own list/load/save cycle) — clicking a row swaps which
// stub thread the preview shows, proving the interaction without a real
// `ConversationStore`.
//
// MODEL SWITCHER: `ChatThread` has a REAL built-in header model switcher
// (`models`/`currentModel`/`onModelChange` props, confirmed in
// `components/chat-thread.tsx` before use) — no bespoke switcher built here.
//
// Panel sections: Identity, Provider, Theme, Capabilities (starters/
// attachments/history/conversations toggle), plus the same role-scoped,
// ordered Message actions picker `Labs/Builder/In-app assistant` uses
// (imported from `components/builder-message-actions.tsx`, not forked).
// No Layout radio (T-2), no Widget chrome (this template is never widget
// framing), no Home section (a fullscreen assistant's empty state is its
// own greeting field below, not the widget-lineage Home/links tab).
//
// T-5 vocabulary gaps this template surfaces (documented, not built):
//  - Empty-state greeting: `construct.v1` has no top-level
//    `assistant.greeting`/`emptyState` key — `home.greeting` exists but is
//    widget-lineage (`BuilderPanelSections.home`'s own doc comment). This
//    story's "Greeting" field is a NEW local signal, not written to
//    `BuilderConstruct`. Candidate: an `assistant.greeting: { title,
//    subtitle }` sibling to `home`, so a non-widget template gets an empty
//    state without inheriting Home's links/tab-bar baggage.
//  - Conversations sidebar as a construct-level concern beyond the
//    existing boolean: `capabilities.conversations` already exists and
//    toggles the LIST FEATURE, but has no room for "always show it as a
//    persistent rail" vs. the existing two-state list/thread toggle
//    `ChatThread`'s own `conversations` prop implements. Candidate:
//    `capabilities.conversations: boolean | { persistent: boolean }`.
//  - Message actions: same `capabilities.messageActions: { user: [...],
//    assistant: [...] }` candidate `Labs/Builder/In-app assistant`'s Round
//    A3 already proposed — this template surfaces the identical gap, not a
//    new one.
//  - Attachments/history/mic are ALREADY real `capabilities` fields
//    (`capabilities.attachments`, `capabilities.history`) or an existing
//    component-tier prop (`ChatThread`'s `voice`) — no new proposal there,
//    same as `Labs/Builder/In-app assistant`'s mic note.

const GROUPS: ConversationGroup[] = [
  { id: 'today', name: 'Today', sortOrder: 0, createdAt: '2026-08-27' },
  { id: 'earlier', name: 'Earlier', sortOrder: 1, createdAt: '2026-08-20' },
];

const STUB_CONVERSATIONS: ConversationSummary[] = [
  { id: 'c1', title: 'Draft the Q3 board update', groupId: 'today', messageCount: 6, updatedAt: '2026-08-27T15:00:00Z', trailing: '6' },
  { id: 'c2', title: 'Summarize the incident postmortem', groupId: 'today', messageCount: 3, updatedAt: '2026-08-27T11:00:00Z', trailing: '3' },
  { id: 'c3', title: 'Rewrite the onboarding email', groupId: 'earlier', messageCount: 9, updatedAt: '2026-08-20T09:00:00Z', trailing: '9' },
  { id: 'c4', title: 'Compare pricing tiers', groupId: 'earlier', messageCount: 4, updatedAt: '2026-08-19T18:00:00Z', trailing: '4' },
];

const STUB_MODELS: ModelOption[] = [
  { id: 'fast', name: 'Assistant Fast', description: 'Quick answers' },
  { id: 'pro', name: 'Assistant Pro', description: 'Deeper reasoning' },
];

/** An id not present in `STUB_CONVERSATIONS` — selecting it shows an empty
 *  thread, so the Empty-state-greeting panel section has something real to
 *  demonstrate ("New chat" isn't wired to `ConversationList`'s own
 *  `onNewChat` here, story-first scope; this ID is just always selectable). */
const NEW_CHAT_ID = 'new';

const STUB_THREADS: Record<string, ChatMessage[]> = {
  [NEW_CHAT_ID]: [],
  c1: [
    { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Draft a two-paragraph Q3 update for the board.' }] },
    { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: "Here's a draft — revenue, churn, and the roadmap headline first." }] },
  ],
  c2: [
    { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Summarize the incident postmortem in five bullets.' }] },
    { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Root cause, blast radius, detection gap, fix, and the follow-up owner.' }] },
  ],
  c3: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Rewrite the onboarding email to be warmer.' }] }],
  c4: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Compare our three pricing tiers in a table.' }] }],
};

const DEFAULT_CONSTRUCT: BuilderConstruct = {
  name: 'daily-assistant',
  layout: 'fullscreen',
  provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
  header: { title: 'Assistant' },
  // Dark-by-default (owner ruling, dark round — templates.ts's own
  // assistantStarter): the design contract's demo state predated that
  // ruling and drifted stale (design-parity audit, 2026-08-29). This stub
  // panel's Mode select isn't wired to a visual dark toggle (same as every
  // template here except Workspace, which got a dedicated round for that),
  // so this brings the SEED STATE back in line with the product's actual
  // default rather than changing what renders.
  theme: { accent: '#7c3aed', mode: 'dark' },
  capabilities: {
    starters: ['Draft the Q3 board update', 'Summarize a document', 'Compare two options'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
    conversations: true,
  },
};

/**
 * The Assistant template's preview: a device frame filled edge-to-edge —
 * `ConversationList` as a persistent left rail, `ChatThread` filling the
 * rest, a model switcher in `ChatThread`'s own header. No widget chrome,
 * no launcher/FAB (T-1: this is the fullscreen shape, not the floating
 * one) — the frame itself IS the whole preview canvas.
 */
function AssistantPreview(props: {
  construct: BuilderConstruct;
  greetingTitle: string;
  greetingSubtitle: string;
  modelId: string;
  onModelChange: (id: string) => void;
  activeId: string;
  onSelectConversation: (id: string) => void;
  userActions: ChatMessageAction[];
  assistantActions: (ChatMessageAction | CustomAction)[];
  slashTriggers: TriggerGroupState;
  mentionTriggers: TriggerGroupState;
  shell: ShellControlsState;
  viewport: BuilderViewport;
}): JSX.Element {
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const frameStyle = createMemo(() => ({
    ...resolveAccentWrapperStyle(props.construct.theme),
    height: 'calc(100vh - 9rem)',
    width: 'calc(100vw - 27rem)',
    'max-width': '100%',
  }));
  const isMobile = createMemo(() => props.viewport === 'mobile');
  const messages = createMemo<ChatMessage[]>(() =>
    (STUB_THREADS[props.activeId] ?? []).map((m) => {
      if (m.role === 'user') return { ...m, actions: props.userActions.length ? props.userActions : undefined };
      return { ...m, actions: props.assistantActions.length ? props.assistantActions : undefined };
    }),
  );

  return (
    <div
      class="flex overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      style={frameStyle()}
      data-builder-fullscreen-frame
      data-builder-viewport={props.viewport}
    >
      <CommandPaletteOverlay open={props.shell.commandPalette && paletteOpen()} onClose={() => setPaletteOpen(false)} />
      {!isMobile() && (
        <div class="w-64 shrink-0 border-r border-border">
          <ConversationList
            groups={GROUPS}
            conversations={STUB_CONVERSATIONS}
            activeId={props.activeId}
            onSelect={props.onSelectConversation}
            onNewChat={() => props.onSelectConversation(NEW_CHAT_ID)}
            class="h-full"
          />
        </div>
      )}
      <div class="flex min-w-0 flex-1 flex-col">
        <ChatThread
          class="h-full"
          messages={messages()}
          chatTitle={props.construct.header?.title}
          suggestions={props.construct.capabilities?.starters}
          models={STUB_MODELS}
          currentModel={props.modelId}
          onModelChange={props.onModelChange}
          headerEndContent={
            (props.shell.commandPalette || props.shell.userMenu) && (
              <div class="flex items-center gap-1.5">
                {props.shell.commandPalette && <CommandPaletteTrigger onOpen={() => setPaletteOpen(true)} />}
                {props.shell.userMenu && <UserMenu name="Ada" plan="Pro" />}
              </div>
            )
          }
          empty={messages().length === 0}
          emptyContent={
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{props.greetingTitle}</EmptyTitle>
                <EmptyDescription>{props.greetingSubtitle}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
          triggers={buildTriggerDefs(props.slashTriggers, props.mentionTriggers)}
          onSubmit={() => {}}
        />
      </div>
    </div>
  );
}

function EmptyStateSection(props: {
  title: string;
  onTitleChange: (v: string) => void;
  subtitle: string;
  onSubtitleChange: (v: string) => void;
}): JSX.Element {
  return (
    <section class="flex flex-col gap-3 border-b border-border p-4">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Empty-state greeting</h3>
      <label class="flex flex-col gap-1 text-xs font-medium text-foreground">
        Title
        <input
          class="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          value={props.title}
          onInput={(e) => props.onTitleChange(e.currentTarget.value)}
        />
      </label>
      <label class="flex flex-col gap-1 text-xs font-medium text-foreground">
        Subtitle
        <input
          class="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          value={props.subtitle}
          onInput={(e) => props.onSubtitleChange(e.currentTarget.value)}
        />
      </label>
      <p class="text-xs text-muted-foreground">
        Preview-only — construct.v1 has no assistant-level greeting field today (T-5, see this file's module doc comment).
      </p>
    </section>
  );
}

function MessageActionsSection(props: {
  userActionRows: ActionRowState<UserActionId>[];
  onUserActionRowsChange: (v: ActionRowState<UserActionId>[]) => void;
  assistantActionRows: ActionRowState<AssistantActionId>[];
  onAssistantActionRowsChange: (v: ActionRowState<AssistantActionId>[]) => void;
  mic: boolean;
  onMicChange: (v: boolean) => void;
  slashTriggers: TriggerGroupState;
  onSlashTriggersChange: (v: TriggerGroupState) => void;
  mentionTriggers: TriggerGroupState;
  onMentionTriggersChange: (v: TriggerGroupState) => void;
}): JSX.Element {
  return (
    <section class="flex flex-col gap-3 border-b border-border p-4" data-builder-preview-only-controls>
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Message actions</h3>
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-foreground">Your messages</span>
        <ActionRowPicker
          legend="Your messages — action order"
          catalog={USER_ACTION_CATALOG}
          rows={props.userActionRows}
          onChange={props.onUserActionRowsChange}
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-foreground">Assistant messages</span>
        <ActionRowPicker
          legend="Assistant messages — action order"
          catalog={ASSISTANT_ACTION_CATALOG}
          rows={props.assistantActionRows}
          onChange={props.onAssistantActionRowsChange}
        />
      </div>
      <div class="flex items-center justify-between gap-3 pt-1">
        <span class="text-xs font-medium text-foreground">Microphone</span>
        <Switch checked={props.mic} label="Microphone" onChange={props.onMicChange} />
      </div>
      <ComposerTriggersSection
        slash={props.slashTriggers}
        onSlashChange={props.onSlashTriggersChange}
        mention={props.mentionTriggers}
        onMentionChange={props.onMentionTriggersChange}
      />
      <p class="text-xs text-muted-foreground">
        Same role-scoped picker as Labs/Builder/In-app assistant — reused, not forked. Triggers are available but OFF by default here
        (owner's default matrix: end-user-facing shapes start off, unlike Workspace).
      </p>
    </section>
  );
}

function AssistantBuilderDemo(): JSX.Element {
  const [construct, setConstruct] = createSignal<BuilderConstruct>(DEFAULT_CONSTRUCT);
  const [greetingTitle, setGreetingTitle] = createSignal('What can I help with?');
  const [greetingSubtitle, setGreetingSubtitle] = createSignal('Ask anything, or start from a suggestion below.');
  const [modelId, setModelId] = createSignal(STUB_MODELS[0].id);
  const [activeId, setActiveId] = createSignal(STUB_CONVERSATIONS[0].id);
  const [mic, setMic] = createSignal(false);
  // Owner's default matrix (composer.triggers): available but OFF by
  // default for Assistant (an end-user-facing shape, unlike Workspace).
  const [slashTriggers, setSlashTriggers] = createSignal<TriggerGroupState>({ enabled: false, entries: DEFAULT_SLASH_ENTRIES });
  const [mentionTriggers, setMentionTriggers] = createSignal<TriggerGroupState>({ enabled: false, entries: DEFAULT_MENTION_ENTRIES });
  const [userActionRows, setUserActionRows] = createSignal<ActionRowState<UserActionId>[]>(DEFAULT_USER_ACTION_ROWS);
  const [assistantActionRows, setAssistantActionRows] =
    createSignal<ActionRowState<AssistantActionId>[]>(DEFAULT_ASSISTANT_ACTION_ROWS);
  const [viewport, setViewport] = createSignal<BuilderViewport>('desktop');
  const [shell, setShell] = createSignal<ShellControlsState>({ commandPalette: true, userMenu: true });

  const userActions = createMemo<ChatMessageAction[]>(() => userActionRows().filter((r) => r.enabled).map((r) => r.id));
  const assistantActions = createMemo<(ChatMessageAction | CustomAction)[]>(() =>
    assistantActionRows()
      .filter((r) => r.enabled)
      .map((r) => r.id),
  );

  return (
    <div class="h-screen w-screen">
      <BuilderLayout
        name={construct().name}
        panel={
          <>
            <BuilderPanel
              value={construct()}
              onChange={setConstruct}
              sections={{ layout: false, widget: 'never', provider: true, home: false }}
            />
            <EmptyStateSection
              title={greetingTitle()}
              onTitleChange={setGreetingTitle}
              subtitle={greetingSubtitle()}
              onSubtitleChange={setGreetingSubtitle}
            />
            <MessageActionsSection
              userActionRows={userActionRows()}
              onUserActionRowsChange={setUserActionRows}
              assistantActionRows={assistantActionRows()}
              onAssistantActionRowsChange={setAssistantActionRows}
              mic={mic()}
              onMicChange={setMic}
              slashTriggers={slashTriggers()}
              onSlashTriggersChange={setSlashTriggers}
              mentionTriggers={mentionTriggers()}
              onMentionTriggersChange={setMentionTriggers}
            />
            <ShellSection state={shell()} onChange={setShell} />
          </>
        }
        preview={
          <AssistantPreview
            construct={construct()}
            greetingTitle={greetingTitle()}
            greetingSubtitle={greetingSubtitle()}
            modelId={modelId()}
            onModelChange={setModelId}
            activeId={activeId()}
            onSelectConversation={setActiveId}
            userActions={userActions()}
            assistantActions={assistantActions()}
            slashTriggers={slashTriggers()}
            mentionTriggers={mentionTriggers()}
            shell={shell()}
            viewport={viewport()}
          />
        }
        viewport={viewport()}
        onViewportChange={setViewport}
      />
    </div>
  );
}

const meta = { title: 'Labs/Builder/Assistant', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// BuilderPanel/BuilderLayout are internal to the builder app (src/components/builder-panel.tsx,
// builder-layout.tsx) -- neither ships in a public @kitn.ai/ui entry point. The snippet below
// names the real composition and wiring rather than a package import; ChatThread and
// ConversationList ARE public (@kitn.ai/ui) and are shown as this preview actually uses them.
const src = (code: string) => ({
  parameters: { docs: { source: { code, language: 'tsx' } } },
});

/**
 * The Assistant template's builder: panel on the left scoped to Identity,
 * Provider, Theme, Capabilities, an empty-state greeting, and the
 * role-scoped Message actions picker; the live preview on the right fills
 * the whole frame edge-to-edge with a persistent conversations sidebar plus
 * the thread, model switcher visible in `ChatThread`'s own header. Click a
 * sidebar row to swap the stub thread; edit the accent to retint the whole
 * frame, same accent-cascade mapping every other template preview uses.
 */
export const Assistant: Story = {
  render: () => <AssistantBuilderDemo />,
  ...src(`<BuilderLayout
  name={construct.name}
  panel={
    <BuilderPanel
      value={construct}
      onChange={setConstruct}
      sections={{ layout: false, widget: 'never', provider: true, home: false }}
    />
    // ...plus this screen's own Empty-state-greeting and Message-actions sections
  }
  preview={
    <div class="flex overflow-hidden rounded-2xl border border-border">
      <ConversationList
        groups={groups}
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onNewChat={() => setActiveId('new')}
      />
      <ChatThread
        messages={messages}
        chatTitle={construct.header?.title}
        suggestions={construct.capabilities?.starters}
        models={models}
        currentModel={modelId}
        onModelChange={setModelId}
        onSubmit={sendMessage}
      />
    </div>
  }
  viewport={viewport}
  onViewportChange={setViewport}
/>`),
};
