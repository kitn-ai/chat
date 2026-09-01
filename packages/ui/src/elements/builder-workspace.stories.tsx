import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { type JSX, createSignal, createMemo, createEffect, onCleanup, For, Show } from 'solid-js';
import { Plus, ChevronUp, ChevronDown, X } from 'lucide-solid';
import { BuilderPanel, type BuilderConstruct } from '../components/builder-panel';
import { BuilderLayout, type BuilderViewport } from '../components/builder-layout';
import { resolveAccentWrapperStyle } from '../components/builder-preview';
import { ChatThread } from '../components/chat-thread';
import { WorkspaceShell } from '../components/workspace-shell';
import { WorkSurface } from '../components/work-surface';
import { AppHeader, type AppHeaderAction } from '../components/app-header';
import type { ArtifactTab } from '../components/artifact';
import { mix, StubStatTile, StubCodeBlock } from '../components/builder-skeleton';
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
} from '../components/builder-shell-controls';
import { RadioGroup, type RadioOption } from '../ui/radio';
import { Switch } from '../ui/switch';
import { Select } from '../ui/select';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from '../ui/dropdown';
import { renderIcon } from '../ui/icon';
import type { ChatMessage, ChatMessageAction, CustomAction } from './chat-types';

// Labs/Builder/Workspace — T-1 build-out (docs/superpowers/specs/
// 2026-08-28-template-builder-design.md), FIFTH and hardest template story:
// chat rail + work surface (v0/lovable/split-workspace's own shape, the
// design spec's own words: "expected to split into a construct-expressible
// core and eject-tier composition; its round's primary deliverable is that
// boundary, drawn concretely"). T-2: the template fixes the layout, no
// Layout radio.
//
// THE SPLIT FRAME IS A REAL COMPONENT, NOT A HAND-ROLLED FLEX ROW:
// `components/workspace-shell.tsx`'s `WorkspaceShell` — "the chat-agnostic
// workspace layout shell: five regions ... with resize handles between the
// columns" (its own doc comment, read before use) — already IS this split:
// `start` holds the chat rail, `children` (the main region, always
// rendered, intentionally the LARGER of the two) holds the work pane. A
// real resize handle sits between them (`ResizableHandle`, internal to
// `WorkspaceShell`) — dragging it actually resizes the chat rail.
//
// OWNER FEEDBACK ROUND (folded in): modeled the work pane's own toolbar,
// the workspace's app-level header, and the composer's optional
// affordances on `Labs/Apps`'s Lovable and v0 stories, read closely before
// building any of this rather than guessed at:
//
// 1. WORK-PANE CHROME. PROMOTED 2026-08-30 into the real component
//    `components/work-surface.tsx` (`WorkSurface`) — this story now RENDERS
//    that component instead of holding its own copy, so the approved design
//    and the shipped product cannot drift. Everything below is the recorded
//    reasoning for the design it carries; the component's own doc comment
//    repeats it at the code. It mirrors Lovable's browser chrome
//    (`elements/lovable.stories.tsx`'s preview toolbar, read line by line):
//    a device toggle (desktop/tablet/mobile, segmented, scoped to
//    the PANE's own canvas only — independent of `BuilderLayout`'s outer
//    builder-chrome viewport chips, which scale the whole builder frame) ·
//    a read-only URL bar (lock icon + fake domain text, Lovable's own
//    `preview--*.lovable.app` shape) · an open-in-new-tab button · a
//    Preview|Code segmented toggle with PREVIEW listed FIRST (Lovable's own
//    `TABS` array order: `preview` before `code`, `globe`/`code` icons —
//    this file had it backwards as Code/Preview before this round; fixed).
//    EVERY one of these five is independently optional (`WorkSurfaceSection`
//    below) — "someone may want preview-only" per the owner's brief, so
//    `showCodeView: false` removes the Preview|Code toggle ENTIRELY (not
//    just disables it) and the pane always renders its preview content.
// 2. EXPAND (owner amendment): a v0-style maximize toggle, also optional.
//    Checked `elements/v0.stories.tsx` first: v0's real `<kai-artifact
//    expandable>` maximizes "via the kai-resizable maximize protocol" (that
//    file's own comment) — `ui/resizable.tsx`'s `ResizablePanelGroup` has a
//    real `maximizedIndex`/`onMaximizeChange` API. But `WorkspaceShell`
//    (what THIS template's split actually uses, confirmed by reading it
//    before building) does NOT forward that prop to its internal
//    `ResizablePanelGroup` — it exposes a DIFFERENT real mechanism instead:
//    per-aside `startCollapsed`/`endCollapsed`, controlled or imperative via
//    `controllerRef`. That is the exact shape "hide the chat rail entirely,
//    click again to restore the split" needs, and it is the SAME mechanism
//    `Labs/Elements/Resizable Collapsed` demonstrates — so Expand here is
//    wired through `WorkspaceShell`'s real CONTROLLED `startCollapsed` prop
//    (`startCollapsed={expanded()}`), not a hand-rolled `display:none` or
//    the v0/kai-artifact maximize protocol, which this shell does not carry.
//
// APP HEADER: PROMOTED 2026-08-30 into the real component
// `components/app-header.tsx` (`AppHeader`) — the same treatment the work
// pane's chrome got above, and for the same reason: the emitted app had
// drifted off this design (a text "Theme" button, no search at all, a bare
// avatar with no menu, and the whole cluster stuffed into ChatThread's own
// header row inside the chat rail instead of a strip across the frame). This
// story now RENDERS that component and the emitted app COMPOSES it, so there
// is one arrangement, not two. Everything below is the recorded reasoning for
// the design it carries; the component's own doc comment repeats it at the
// code, superseded history included.
//
// A new top-level strip inside the preview frame, above the
// split entirely (persists through Expand, matching Lovable's own top bar
// living outside/above its split body) — modeled on Lovable's real
// `<header>` (brand/title one side, actions the other). JUDGMENT CALL,
// recorded rather than silently resolved: the brief said "product title on
// the right (mirror Lovable's placement exactly)", but Lovable's ACTUAL
// header puts its brand/title on the LEFT and its action buttons (GitHub /
// Invite / Publish / avatar) on the RIGHT (`lovable.stories.tsx` lines
// ~391-420, read again to confirm before writing this). Read literally,
// "title on the right" and "mirror Lovable's placement exactly" contradict
// each other. Resolved as: MIRROR (flip) Lovable's own header — actions on
// the left, title on the right — which satisfies both halves of the
// instruction at once (a mirror image of Lovable's left/right assignment)
// rather than picking one half and silently dropping the other.
// `header.title` is the REAL, already-existing construct field (reused, not
// duplicated); the action buttons are new preview-only rows (`HeaderAction
// Row[]`), since `construct.v1` has no header-actions vocabulary — see the
// widened T-5 note below.
//
// SUPERSEDED (owner feedback round, explicit this time — no judgment call
// needed): title moves to the LEFT, actions to the RIGHT — the opposite of
// the mirror resolved above. The right side is now a full, EXPLICIT
// arrangement (search · theme toggle | Share/Deploy | avatar+chevron, see
// `AppHeader`'s own doc comment) rather than a single actions cluster.
// Every header element is individually optional via a panel toggle; the
// ARRANGEMENT itself is not configurable, per the owner's own ruling.
//
// COMPOSER (owner amendment, two parts):
//  - Quick-fill label/value chips: rows the dev defines (label shown on the
//    chip, value filled into the composer) — DISTINCT from `ChatThread`'s
//    own `suggestions` (label IS the value there). Wired to `ChatThread`'s
//    REAL controlled `value`/`onValueChange` props (confirmed they exist
//    before use) — clicking a chip actually fills the composer's real
//    input, not a stub.
//  - A v0-style composer MENU (the plus-button trigger next to the
//    composer): checked `v0.stories.tsx`'s own composer first — it slots a
//    real `kai-menu` into `kai-prompt-input`'s `toolbar-start` LIGHT-DOM
//    slot, a mechanism only the `kai-chat`/`kai-prompt-input` WEB COMPONENT
//    facade can receive (light-DOM child projection). This story renders
//    the bare Solid `<ChatThread>` directly (same choice every other
//    template story makes), which has NO JSX prop for its composer
//    toolbar — `emptyContent` is the one JSX-form escape hatch `ChatThread`
//    has (Round R), and it is REPLACE-only for the empty state, not
//    additive to the composer. So the composer menu here renders as its
//    own strip directly above the rail's `ChatThread`, composing the kit's
//    REAL `Dropdown`/`DropdownTrigger`/`DropdownContent`/`DropdownItem`
//    primitives (the same ones `components/model-switcher.tsx` composes,
//    read as a real usage example before building this) — a real, working
//    menu, just not literally inside `ChatThread`'s own shadow-gated
//    composer. Kit-tier gap worth naming: `ChatThread` could grow a
//    `composerStart`/`composerEnd` JSX prop mirroring `emptyContent`'s
//    pattern, so a bare-Solid consumer gets the same composer-toolbar
//    injection the web-component facade already has via slots.
//  - Attachments and Microphone: `capabilities.attachments` was already a
//    real, existing `BuilderPanel` control (Capabilities section) but this
//    template never actually WIRED it to `ChatThread`'s own `attach`/
//    `accept` props before this round — fixed here (the toggle now
//    genuinely applies). Microphone is a new preview-only switch (same
//    shape as every other template's own Microphone control), wired to
//    `ChatThread`'s real `voice` prop. (The same `attach`/`accept` wiring
//    gap exists on `Labs/Builder/Assistant`, `.../Research`, and `.../
//    In-app assistant` — out of scope for this Workspace-only round, noted
//    here rather than reached into their files.)
//
// THE WORK PANE'S CONTENT HAS NO CONSTRUCT VOCABULARY — drawn concretely,
// per the design spec's own framing of this round's deliverable, and now
// WIDER after this feedback round (see the widened T-5 proposal in
// docs/superpowers/research/2026-08-28-builder-t5-vocabulary-proposals.md,
// item 8):
//  - The SPLIT FRAME ITSELF fits today's schema cleanly: `layout: 'split'`
//    already exists in `BuilderLayoutKind` and codegen has a real emission
//    for it. The frame is construct-expressible NOW.
//  - CLOSED 2026-08-30 (`workSurface`, see schema.ts): the pane's OWN CHROME
//    is construct vocabulary now — `workSurface.chrome.deviceToggle` /
//    `urlBar` / `openInNewTab` / `expand` / `codeView`, plus `kind` and a
//    required `url` — and the app header's ACTIONS have been
//    `header.actions` since T-5 shipped, so that half of this note was
//    already stale before this round.
//  - STILL NOT EXPRESSIBLE: the pane's CONTENT beyond a url (a construct
//    cannot author the framed document — model-produced artifacts need a
//    `kind` on `cards`, a card->pane route, and a mock responder that
//    scripts a tool call, none of which exist), and all four composer knobs
//    (chips, menu, attachments-applying, mic). Those controls still write to
//    local signals only, never to `BuilderConstruct` — the Raw JSON section
//    not reflecting them is the honest tell.
//
// Panel: the Assistant template's set minus the persistent sidebar
// (Workspace's own basis — v0/lovable/split-workspace — has no
// conversation-history rail; the chat rail here is single-thread) plus
// Work surface (pane chrome + kind), App header (title reuse + actions),
// Composer (chips + menu + attach/mic), and the shared Message actions
// picker.

type HeaderButtonVariant = 'primary' | 'secondary' | 'ghost';

interface HeaderActionRow {
  id: string;
  label: string;
  variant: HeaderButtonVariant;
}

interface ComposerChip {
  id: string;
  label: string;
  value: string;
}

interface ComposerMenuEntry {
  id: string;
  label: string;
  /** A curated `renderIcon` name (`ui/icon.tsx`'s `NAMED_ICONS`), typed as
   *  free text per the assignment ("a text field with the renderIcon names
   *  is fine for the story") — resolved through the REAL `renderIcon`
   *  helper, not a lookalike icon lookup. */
  icon?: string;
}

let nextRowId = 1;
const newRowId = (prefix: string): string => `${prefix}-${nextRowId++}`;

/** The pane-kind radio in the panel. The pane's own device list and canvas
 *  widths now live on the promoted component (`components/work-surface.tsx`'s
 *  `DEVICES` / `WORK_SURFACE_DEVICE_WIDTHS`) — one definition, not a copy. */
const PANE_KIND_OPTIONS: readonly RadioOption<ArtifactTab>[] = [
  { value: 'preview', label: 'Preview', description: 'Rendered-output skeleton' },
  { value: 'code', label: 'Code', description: 'Code view — StubCodeBlock' },
];

/** Primary→`default`, Secondary→`outline`, Ghost→`ghost`. The kit's real
 *  `Button` variant vocabulary (`ui/button.tsx`) is `default`/`ghost`/
 *  `subtle`/`outline`/`destructive` — there is no literal `primary` or
 *  `secondary` variant. Mapped honestly rather than inventing new variant
 *  names on `Button` itself: `default` IS the kit's filled/primary-looking
 *  variant, and `outline` is the closest existing look to a conventional
 *  "secondary" button. */
const HEADER_VARIANT_TO_BUTTON: Record<HeaderButtonVariant, 'default' | 'outline' | 'ghost'> = {
  primary: 'default',
  secondary: 'outline',
  ghost: 'ghost',
};

const HEADER_VARIANT_OPTIONS: readonly { value: HeaderButtonVariant; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'ghost', label: 'Ghost' },
];

const DEFAULT_HEADER_ACTIONS: HeaderActionRow[] = [
  { id: 'share', label: 'Share', variant: 'secondary' },
  { id: 'deploy', label: 'Deploy', variant: 'primary' },
];

const DEFAULT_COMPOSER_CHIPS: ComposerChip[] = [
  { id: 'pricing', label: 'Pricing table', value: 'Build a pricing table component' },
  { id: 'dark-mode', label: 'Dark mode', value: 'Add a dark mode toggle' },
];

/** The owner's own v0 stub set (`v0.stories.tsx`'s composer `+` menu),
 *  reused verbatim as this menu's default entries. */
const DEFAULT_COMPOSER_MENU_ENTRIES: ComposerMenuEntry[] = [
  { id: newRowId('menu'), label: 'Attach image', icon: 'paperclip' },
  { id: newRowId('menu'), label: 'Import from Figma' },
  { id: newRowId('menu'), label: 'Import from URL', icon: 'link' },
];

const stubMessages: ChatMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Build a pricing table component' }] },
  { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: "Here's a three-tier pricing table with a highlighted middle plan." }] },
];

const DEFAULT_CONSTRUCT: BuilderConstruct = {
  name: 'build-workspace',
  layout: 'split',
  provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
  header: { title: 'Workspace' },
  // orange-700, not -600: the accent paints the preview's primary buttons, and
  // white 12px text on #ea580c is 3.55:1 — under axe's 4.5:1 minimum. #c2410c
  // clears it (~5:1) while keeping the same orange identity.
  theme: { accent: '#c2410c', mode: 'system' },
  capabilities: {
    starters: ['Build a pricing table', 'Add a dark mode toggle'],
    attachments: { accept: ['image/*'] },
    history: { persistence: 'local' },
  },
};

/** The v0-style composer `+` menu — see the module doc comment's COMPOSER
 *  note for why this composes `Dropdown`/`DropdownTrigger`/`DropdownContent`/
 *  `DropdownItem` directly (the real primitives `model-switcher.tsx` also
 *  composes) rather than reaching for `ChatThread`'s slot-gated toolbar,
 *  which a bare Solid usage cannot fill. Entries fire a real onSelect —
 *  reported to `onEntrySelect` for display, never a fake integration. */
function ComposerMenu(props: { entries: ComposerMenuEntry[]; onEntrySelect: (entry: ComposerMenuEntry) => void }): JSX.Element {
  return (
    <Dropdown>
      <DropdownTrigger
        as={(triggerProps: JSX.ButtonHTMLAttributes<HTMLButtonElement>) => (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Add" {...triggerProps}>
            <Plus size={14} aria-hidden="true" />
          </Button>
        )}
      />
      <DropdownContent>
        <For each={props.entries}>
          {(entry) => (
            <DropdownItem onSelect={() => props.onEntrySelect(entry)}>
              {renderIcon(entry.icon, { class: 'mr-2 size-3.5 shrink-0' })}
              {entry.label}
            </DropdownItem>
          )}
        </For>
      </DropdownContent>
    </Dropdown>
  );
}

/** The composer-extras strip: quick-fill chips (label shown, `value` fills
 *  `ChatThread`'s real controlled composer) plus the composer menu, if
 *  either is configured. Renders directly ABOVE the rail's `ChatThread` —
 *  see the module doc comment's COMPOSER note for why this is a sibling
 *  strip rather than literally inside `ChatThread`'s own composer. */
function ComposerExtras(props: {
  chips: ComposerChip[];
  menuEnabled: boolean;
  menuEntries: ComposerMenuEntry[];
  onFill: (value: string) => void;
  lastAction: string;
}): JSX.Element {
  // A `Show`, not an early `return null`: this used to be evaluated ONCE at
  // component-creation time, so toggling the composer menu (or clearing every
  // chip) never actually added or removed the strip. It also now carries the
  // last-action readout for the promoted `AppHeader`'s buttons, which have to
  // be able to bring the strip back on their own.
  return (
    <Show when={props.chips.length > 0 || props.menuEnabled || props.lastAction}>
    <div class="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2" data-builder-composer-extras>
      <Show when={props.menuEnabled}>
        <ComposerMenu entries={props.menuEntries} onEntrySelect={(entry) => props.onFill(`(${entry.label})`)} />
      </Show>
      <For each={props.chips}>
        {(chip) => (
          <button
            type="button"
            class="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
            onClick={() => props.onFill(chip.value)}
          >
            {chip.label}
          </button>
        )}
      </For>
      <Show when={props.lastAction}>
        <span class="ml-auto shrink-0 truncate text-[11px] text-muted-foreground">{props.lastAction}</span>
      </Show>
    </div>
    </Show>
  );
}

function WorkspacePreview(props: {
  construct: BuilderConstruct;
  paneKind: ArtifactTab;
  onPaneKindChange: (k: ArtifactTab) => void;
  chrome: { showDeviceToggle: boolean; showUrlBar: boolean; showOpenInNewTab: boolean; showExpand: boolean; showCodeView: boolean };
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  headerActions: HeaderActionRow[];
  headerShowTitle: boolean;
  headerShowActions: boolean;
  headerShowThemeToggle: boolean;
  dark: boolean;
  onToggleDark: () => void;
  composerChips: ComposerChip[];
  composerMenuEnabled: boolean;
  composerMenuEntries: ComposerMenuEntry[];
  slashTriggers: TriggerGroupState;
  mentionTriggers: TriggerGroupState;
  mic: boolean;
  userActions: ChatMessageAction[];
  assistantActions: (ChatMessageAction | CustomAction)[];
  shell: ShellControlsState;
  viewport: BuilderViewport;
}): JSX.Element {
  const [composerValue, setComposerValue] = createSignal('');
  const [lastAction, setLastAction] = createSignal('');
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const fill = (value: string): void => {
    setComposerValue(value);
    setLastAction(`Filled: ${value}`);
  };
  /** The panel's own three-name variant vocabulary -> the kit Button variants
   *  `AppHeader` (and the construct schema's `header.actions[].variant`, built
   *  from the same `BUTTON_VARIANT_NAMES`) actually speak. See
   *  `HEADER_VARIANT_TO_BUTTON` for why the mapping is honest rather than a
   *  `primary`/`secondary` variant invented on `Button` itself. */
  const headerActions = createMemo<AppHeaderAction[]>(() =>
    props.headerActions.map((action) => ({ label: action.label, variant: HEADER_VARIANT_TO_BUTTON[action.variant] })),
  );

  const frameStyle = createMemo(() => ({
    ...resolveAccentWrapperStyle(props.construct.theme),
    height: 'calc(100vh - 9rem)',
    width: 'calc(100vw - 27rem)',
    'max-width': '100%',
  }));
  const messages = createMemo<ChatMessage[]>(() =>
    stubMessages.map((m) => {
      if (m.role === 'user') return { ...m, actions: props.userActions.length ? props.userActions : undefined };
      return { ...m, actions: props.assistantActions.length ? props.assistantActions : undefined };
    }),
  );
  const attachments = createMemo(() => props.construct.capabilities?.attachments);

  // Owner feedback round: the header's theme toggle needs a REAL dark mode
  // to flip, scoped to just this preview frame — not the whole Storybook
  // page (that's the manager's own theme toggle, an unrelated control).
  // `elements/define.tsx`'s real `<kai-*>` facade does exactly this per
  // shadow root already: `classList={{ dark: isDark() }}` on a wrapper div,
  // because `theme.css`'s `.dark { --color-background: ...; ... }` is a
  // plain class selector (not `:root`/`:host`-scoped), so it re-declares
  // every color token at WHATEVER element carries the class and cascades
  // down from there — confirmed by reading `theme.css` before relying on
  // this. That helper is module-private to `define.tsx` (not exported, and
  // this file has no shadow root to attach to), so the same mechanism is
  // replicated here rather than imported — `resolvedDark`/`toggleDark` in
  // `WorkspaceBuilderDemo` below do the `theme.mode` + system-preference
  // resolution `define.tsx`'s `createDarkMode` does, kept in sync with the
  // panel's own Theme > Mode select (both read/write the same
  // `construct().theme.mode` field, so there is only ever one source of
  // truth, not two signals to keep in sync by hand).
  return (
    <div
      class="flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      classList={{ dark: props.dark }}
      style={frameStyle()}
      data-builder-workspace-frame
      data-builder-viewport={props.viewport}
      data-builder-pane-expanded={props.expanded}
    >
      <CommandPaletteOverlay open={props.shell.commandPalette && paletteOpen()} onClose={() => setPaletteOpen(false)} />
      {/* The REAL promoted component (`components/app-header.tsx`), not a local
          copy of it — same treatment `WorkSurface` got below. The ARRANGEMENT
          lives in the component (owner ruling: not configurable); this call
          site only decides PRESENCE, and supplies the mechanism behind each
          piece. Passing a handler is not optional decoration: the component
          renders nothing for a piece whose mechanism is missing. */}
      <AppHeader
        title={props.headerShowTitle ? props.construct.header?.title : undefined}
        showSearch={props.shell.commandPalette}
        onSearch={() => setPaletteOpen(true)}
        showThemeToggle={props.headerShowThemeToggle}
        dark={props.dark}
        onToggleDark={props.onToggleDark}
        actions={props.headerShowActions ? headerActions() : undefined}
        onActionSelect={(action) => setLastAction(`Header action: ${action.label}`)}
        user={props.shell.userMenu ? { name: 'Ada', plan: 'Pro' } : undefined}
        onUserMenuSelect={(item) => setLastAction(`User menu: ${item}`)}
      />
      <div class="min-h-0 flex-1">
        <WorkspaceShell
          class="h-full"
          startWidth={360}
          startMinWidth={280}
          startMaxWidth={520}
          startCollapsed={props.expanded}
          start={
            <div class="flex h-full flex-col">
              <ComposerExtras
                chips={props.composerChips}
                menuEnabled={props.composerMenuEnabled}
                menuEntries={props.composerMenuEntries}
                onFill={fill}
                lastAction={lastAction()}
              />
              <ChatThread
                class="h-full min-h-0 flex-1"
                messages={messages()}
                chatTitle={props.construct.header?.title}
                suggestions={props.construct.capabilities?.starters}
                value={composerValue()}
                onValueChange={setComposerValue}
                attach={!!attachments()}
                accept={attachments()?.accept}
                voice={props.mic}
                triggers={buildTriggerDefs(props.slashTriggers, props.mentionTriggers)}
                onSubmit={() => {}}
              />
            </div>
          }
        >
          {/* The REAL promoted component (`components/work-surface.tsx`), not a
              local copy of it. The story keeps its STUB CONTENT — the chrome is
              what got promoted; what the pane frames still comes from whoever
              mounts it (here: skeleton tiles; an emitted construct: a url). */}
          <WorkSurface
            showDeviceToggle={props.chrome.showDeviceToggle}
            showUrlBar={props.chrome.showUrlBar}
            urlLabel="preview--build-workspace.kitn.app"
            showOpenInNewTab={props.chrome.showOpenInNewTab}
            showExpand={props.chrome.showExpand}
            showCodeView={props.chrome.showCodeView}
            tab={props.paneKind}
            onTabChange={props.onPaneKindChange}
            expanded={props.expanded}
            onExpandedChange={props.onExpandedChange}
            preview={
              <div class="flex h-full flex-col gap-4">
                <div class="grid grid-cols-3 gap-3">
                  <StubStatTile class="h-28" />
                  <StubStatTile class="h-28" />
                  <StubStatTile class="h-28" />
                </div>
                <div class="flex-1 rounded-xl border border-border" style={{ 'background-color': mix('--color-surface', 30) }} />
              </div>
            }
            code={<StubCodeBlock lines={12} class="max-w-2xl" />}
          />
        </WorkspaceShell>
      </div>
    </div>
  );
}

function WorkSurfaceSection(props: {
  kind: ArtifactTab;
  onKindChange: (v: ArtifactTab) => void;
  showDeviceToggle: boolean;
  onShowDeviceToggleChange: (v: boolean) => void;
  showUrlBar: boolean;
  onShowUrlBarChange: (v: boolean) => void;
  showOpenInNewTab: boolean;
  onShowOpenInNewTabChange: (v: boolean) => void;
  showExpand: boolean;
  onShowExpandChange: (v: boolean) => void;
  showCodeView: boolean;
  onShowCodeViewChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <section class="flex flex-col gap-3 border-b border-border p-4">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Work surface</h3>
      <RadioGroup<ArtifactTab> options={PANE_KIND_OPTIONS} value={props.kind} label="Pane kind" onChange={props.onKindChange} />
      <div class="flex flex-col gap-2 pt-1">
        <span class="text-xs font-medium text-foreground">Toolbar chrome</span>
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-muted-foreground">Device toggle</span>
          <Switch checked={props.showDeviceToggle} label="Device toggle" onChange={props.onShowDeviceToggleChange} />
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-muted-foreground">URL bar</span>
          <Switch checked={props.showUrlBar} label="URL bar" onChange={props.onShowUrlBarChange} />
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-muted-foreground">Open in new tab</span>
          <Switch checked={props.showOpenInNewTab} label="Open in new tab" onChange={props.onShowOpenInNewTabChange} />
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-muted-foreground">Expand</span>
          <Switch checked={props.showExpand} label="Expand" onChange={props.onShowExpandChange} />
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-muted-foreground">Code view</span>
          <Switch checked={props.showCodeView} label="Code view" onChange={props.onShowCodeViewChange} />
        </div>
      </div>
      <p class="text-xs text-muted-foreground">
        These map onto real construct vocabulary as of 2026-08-30 — <code>workSurface.kind</code>, <code>url</code> and{' '}
        <code>chrome.*</code> (see <code>schema.ts</code>). This story drives the same <code>WorkSurface</code> component the
        emitted app does, with stub content in place of a framed url. Turning off Code view removes the Preview|Code toggle
        entirely — a preview-only workspace, not just a disabled control.
      </p>
    </section>
  );
}

function HeaderActionsSection(props: {
  showTitle: boolean;
  onShowTitleChange: (v: boolean) => void;
  showThemeToggle: boolean;
  onShowThemeToggleChange: (v: boolean) => void;
  showActions: boolean;
  onShowActionsChange: (v: boolean) => void;
  actions: HeaderActionRow[];
  onChange: (v: HeaderActionRow[]) => void;
}): JSX.Element {
  const [draftLabel, setDraftLabel] = createSignal('');
  const [draftVariant, setDraftVariant] = createSignal<HeaderButtonVariant>('secondary');

  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= props.actions.length) return;
    const next = props.actions.slice();
    [next[index], next[target]] = [next[target], next[index]];
    props.onChange(next);
  };
  const remove = (index: number): void => props.onChange(props.actions.filter((_, i) => i !== index));
  const setVariant = (index: number, variant: HeaderButtonVariant): void => {
    const next = props.actions.slice();
    next[index] = { ...next[index], variant };
    props.onChange(next);
  };
  const add = (): void => {
    if (!draftLabel().trim()) return;
    props.onChange([...props.actions, { id: newRowId('header-action'), label: draftLabel().trim(), variant: draftVariant() }]);
    setDraftLabel('');
  };

  return (
    <section class="flex flex-col gap-3 border-b border-border p-4">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">App header</h3>
      <p class="text-xs text-muted-foreground">
        Header title reuses Identity's Header title field above. Owner feedback round: every header element is individually optional
        (panel toggles below) but the ARRANGEMENT itself is opinionated — no placement knobs. Search and the user avatar are toggled
        from the App chrome section further down (the same Command palette / User menu switches every shell-bearing template shares).
      </p>

      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">Title</span>
        <Switch checked={props.showTitle} label="Title" onChange={props.onShowTitleChange} />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">Theme toggle</span>
        <Switch checked={props.showThemeToggle} label="Theme toggle" onChange={props.onShowThemeToggleChange} />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">Actions area</span>
        <Switch checked={props.showActions} label="Actions area" onChange={props.onShowActionsChange} />
      </div>
      <p class="text-xs text-muted-foreground">
        Off hides the whole Share/Deploy button row without clearing it — turn it back on and the rows below are exactly as you left
        them. Share and Deploy are the stub DEFAULT entries of this row, not hardcoded buttons: add, remove, reorder, and pick each
        one's variant below.
      </p>

      <div class="flex flex-col gap-1.5" role="group" aria-label="Header actions">
        <For each={props.actions}>
          {(action, i) => (
            <div class="flex items-center gap-1.5 rounded-md border border-border/70 bg-surface px-2 py-1.5">
              <span class="flex-1 truncate text-xs font-medium text-foreground">{action.label}</span>
              <Select
                aria-label={`${action.label} variant`}
                options={HEADER_VARIANT_OPTIONS}
                value={action.variant}
                onChange={(e) => setVariant(i(), e.currentTarget.value as HeaderButtonVariant)}
                class="text-xs"
              />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${action.label} up`} disabled={i() === 0} onClick={() => move(i(), -1)}>
                <ChevronUp size={12} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${action.label} down`} disabled={i() === props.actions.length - 1} onClick={() => move(i(), 1)}>
                <ChevronDown size={12} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${action.label}`} onClick={() => remove(i())}>
                <X size={12} aria-hidden="true" />
              </Button>
            </div>
          )}
        </For>
      </div>
      <div class="flex items-center gap-1.5">
        <Input value={draftLabel()} onValueInput={setDraftLabel} placeholder="Button label" class="flex-1 text-xs" />
        <Select aria-label="New action variant" options={HEADER_VARIANT_OPTIONS} value={draftVariant()} onChange={(e) => setDraftVariant(e.currentTarget.value as HeaderButtonVariant)} class="text-xs" />
        <Button type="button" variant="outline" size="sm" onClick={add}>Add</Button>
      </div>
    </section>
  );
}

function ComposerSection(props: {
  chips: ComposerChip[];
  onChipsChange: (v: ComposerChip[]) => void;
  menuEnabled: boolean;
  onMenuEnabledChange: (v: boolean) => void;
  menuEntries: ComposerMenuEntry[];
  onMenuEntriesChange: (v: ComposerMenuEntry[]) => void;
  slashTriggers: TriggerGroupState;
  onSlashTriggersChange: (v: TriggerGroupState) => void;
  mentionTriggers: TriggerGroupState;
  onMentionTriggersChange: (v: TriggerGroupState) => void;
  mic: boolean;
  onMicChange: (v: boolean) => void;
}): JSX.Element {
  const [chipLabel, setChipLabel] = createSignal('');
  const [chipValue, setChipValue] = createSignal('');
  const addChip = (): void => {
    if (!chipLabel().trim() || !chipValue().trim()) return;
    props.onChipsChange([...props.chips, { id: newRowId('chip'), label: chipLabel().trim(), value: chipValue().trim() }]);
    setChipLabel('');
    setChipValue('');
  };
  const removeChip = (id: string): void => props.onChipsChange(props.chips.filter((c) => c.id !== id));

  const [entryLabel, setEntryLabel] = createSignal('');
  const [entryIcon, setEntryIcon] = createSignal('');
  const moveEntry = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= props.menuEntries.length) return;
    const next = props.menuEntries.slice();
    [next[index], next[target]] = [next[target], next[index]];
    props.onMenuEntriesChange(next);
  };
  const removeEntry = (id: string): void => props.onMenuEntriesChange(props.menuEntries.filter((e) => e.id !== id));
  const addEntry = (): void => {
    if (!entryLabel().trim()) return;
    props.onMenuEntriesChange([...props.menuEntries, { id: newRowId('menu'), label: entryLabel().trim(), icon: entryIcon().trim() || undefined }]);
    setEntryLabel('');
    setEntryIcon('');
  };

  return (
    <section class="flex flex-col gap-3 border-b border-border p-4" data-builder-preview-only-controls>
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Composer</h3>

      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">Microphone</span>
        <Switch checked={props.mic} label="Microphone" onChange={props.onMicChange} />
      </div>
      <p class="text-xs text-muted-foreground">Attachments reuse Capabilities' own Attachments toggle above — now actually wired to the composer.</p>

      <div class="flex flex-col gap-1.5 pt-1">
        <span class="text-xs font-medium text-foreground">Quick-fill chips</span>
        <For each={props.chips}>
          {(chip) => (
            <div class="flex items-center gap-1.5 rounded-md border border-border/70 bg-surface px-2 py-1.5">
              <span class="w-24 shrink-0 truncate text-xs font-medium text-foreground">{chip.label}</span>
              <span class="flex-1 truncate text-xs text-muted-foreground">{chip.value}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${chip.label}`} onClick={() => removeChip(chip.id)}>
                <X size={12} aria-hidden="true" />
              </Button>
            </div>
          )}
        </For>
        <div class="flex items-center gap-1.5">
          <Input value={chipLabel()} onValueInput={setChipLabel} placeholder="Label" class="w-24 shrink-0 text-xs" />
          <Input value={chipValue()} onValueInput={setChipValue} placeholder="Value filled into the composer" class="flex-1 text-xs" />
          <Button type="button" variant="outline" size="sm" onClick={addChip}>Add</Button>
        </div>
      </div>

      <div class="flex items-center justify-between gap-3 pt-1">
        <span class="text-xs font-medium text-foreground">Composer menu</span>
        <Switch checked={props.menuEnabled} label="Composer menu" onChange={props.onMenuEnabledChange} />
      </div>
      <Show when={props.menuEnabled}>
        <div class="flex flex-col gap-1.5" role="group" aria-label="Composer menu entries">
          <For each={props.menuEntries}>
            {(entry, i) => (
              <div class="flex items-center gap-1.5 rounded-md border border-border/70 bg-surface px-2 py-1.5">
                {renderIcon(entry.icon, { class: 'size-3.5 shrink-0 text-muted-foreground' })}
                <span class="flex-1 truncate text-xs font-medium text-foreground">{entry.label}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${entry.label} up`} disabled={i() === 0} onClick={() => moveEntry(i(), -1)}>
                  <ChevronUp size={12} aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${entry.label} down`} disabled={i() === props.menuEntries.length - 1} onClick={() => moveEntry(i(), 1)}>
                  <ChevronDown size={12} aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${entry.label}`} onClick={() => removeEntry(entry.id)}>
                  <X size={12} aria-hidden="true" />
                </Button>
              </div>
            )}
          </For>
          <div class="flex items-center gap-1.5">
            <Input value={entryLabel()} onValueInput={setEntryLabel} placeholder="Entry label" class="flex-1 text-xs" />
            <Input value={entryIcon()} onValueInput={setEntryIcon} placeholder="icon name" class="w-24 shrink-0 text-xs" />
            <Button type="button" variant="outline" size="sm" onClick={addEntry}>Add</Button>
          </div>
        </div>
      </Show>

      <ComposerTriggersSection
        slash={props.slashTriggers}
        onSlashChange={props.onSlashTriggersChange}
        mention={props.mentionTriggers}
        onMentionChange={props.onMentionTriggersChange}
      />

      <p class="text-xs text-muted-foreground">
        Preview-only — none of the composer knobs above exist in construct.v1 today (T-5, see this file's module doc comment and the
        widened Workspace proposal in docs/superpowers/research/2026-08-28-builder-t5-vocabulary-proposals.md). Triggers are the one
        exception: they're wired to ChatThread's real `triggers` prop, a real mechanism already shipped at the component tier — ON by
        default for this template (owner's default matrix: agentic/dev shapes default on).
      </p>
    </section>
  );
}

function MessageActionsSection(props: {
  userActionRows: ActionRowState<UserActionId>[];
  onUserActionRowsChange: (v: ActionRowState<UserActionId>[]) => void;
  assistantActionRows: ActionRowState<AssistantActionId>[];
  onAssistantActionRowsChange: (v: ActionRowState<AssistantActionId>[]) => void;
}): JSX.Element {
  return (
    <section class="flex flex-col gap-3 border-b border-border p-4" data-builder-preview-only-controls>
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Message actions</h3>
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-foreground">Your messages</span>
        <ActionRowPicker legend="Your messages — action order" catalog={USER_ACTION_CATALOG} rows={props.userActionRows} onChange={props.onUserActionRowsChange} />
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-foreground">Assistant messages</span>
        <ActionRowPicker legend="Assistant messages — action order" catalog={ASSISTANT_ACTION_CATALOG} rows={props.assistantActionRows} onChange={props.onAssistantActionRowsChange} />
      </div>
      <p class="text-xs text-muted-foreground">Same role-scoped picker every other template uses — reused, not forked.</p>
    </section>
  );
}

function WorkspaceBuilderDemo(): JSX.Element {
  const [construct, setConstruct] = createSignal<BuilderConstruct>(DEFAULT_CONSTRUCT);
  const [paneKind, setPaneKind] = createSignal<ArtifactTab>('preview');
  const [showDeviceToggle, setShowDeviceToggle] = createSignal(true);
  const [showUrlBar, setShowUrlBar] = createSignal(true);
  const [showOpenInNewTab, setShowOpenInNewTab] = createSignal(true);
  const [showExpand, setShowExpand] = createSignal(true);
  const [showCodeView, setShowCodeView] = createSignal(true);
  const [expanded, setExpanded] = createSignal(false);
  const [headerActions, setHeaderActions] = createSignal<HeaderActionRow[]>(DEFAULT_HEADER_ACTIONS);
  const [headerShowTitle, setHeaderShowTitle] = createSignal(true);
  const [headerShowThemeToggle, setHeaderShowThemeToggle] = createSignal(true);
  const [headerShowActions, setHeaderShowActions] = createSignal(true);
  const [composerChips, setComposerChips] = createSignal<ComposerChip[]>(DEFAULT_COMPOSER_CHIPS);
  const [composerMenuEnabled, setComposerMenuEnabled] = createSignal(true);
  const [composerMenuEntries, setComposerMenuEntries] = createSignal<ComposerMenuEntry[]>(DEFAULT_COMPOSER_MENU_ENTRIES);
  // Owner's default matrix (docs/superpowers/research/2026-08-28-builder-t5-
  // vocabulary-proposals.md, composer.triggers): ON by default for Workspace,
  // an agentic/dev shape (the Claude-Code/Codex precedent).
  const [slashTriggers, setSlashTriggers] = createSignal<TriggerGroupState>({ enabled: true, entries: DEFAULT_SLASH_ENTRIES });
  const [mentionTriggers, setMentionTriggers] = createSignal<TriggerGroupState>({ enabled: true, entries: DEFAULT_MENTION_ENTRIES });
  const [mic, setMic] = createSignal(false);
  const [userActionRows, setUserActionRows] = createSignal<ActionRowState<UserActionId>[]>(DEFAULT_USER_ACTION_ROWS);
  const [assistantActionRows, setAssistantActionRows] = createSignal<ActionRowState<AssistantActionId>[]>(DEFAULT_ASSISTANT_ACTION_ROWS);
  const [viewport, setViewport] = createSignal<BuilderViewport>('desktop');
  const [shell, setShell] = createSignal<ShellControlsState>({ commandPalette: true, userMenu: true });

  const userActions = createMemo<ChatMessageAction[]>(() => userActionRows().filter((r) => r.enabled).map((r) => r.id));
  const assistantActions = createMemo<(ChatMessageAction | CustomAction)[]>(() =>
    assistantActionRows().filter((r) => r.enabled).map((r) => r.id),
  );

  // Owner feedback round — a REAL dark toggle in the header, kept in sync
  // with the panel's own Theme > Mode select rather than a second signal:
  // both read/write `construct().theme.mode` ('light' | 'dark' | 'system'),
  // the one field `BuilderPanel`'s Mode select already writes (previously
  // unwired to anything visual in this template, same as every other
  // template's Theme > Mode — this round is the first to actually apply
  // it). `system` follows `prefers-color-scheme`, matching
  // `elements/define.tsx`'s own `createDarkMode` resolution exactly (that
  // helper is module-private, replicated here — see the comment above
  // `WorkspacePreview`'s root div for why).
  const [systemDark, setSystemDark] = createSignal(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );
  createEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent): void => { setSystemDark(e.matches); };
    mq.addEventListener('change', onChange);
    onCleanup(() => mq.removeEventListener('change', onChange));
  });
  const resolvedDark = createMemo<boolean>(() => {
    const mode = construct().theme?.mode ?? 'system';
    return mode === 'dark' || (mode === 'system' && systemDark());
  });
  const toggleDark = (): void => {
    const next = resolvedDark() ? 'light' : 'dark';
    setConstruct((c) => ({ ...c, theme: { ...c.theme, mode: next } }));
  };

  return (
    <div class="h-screen w-screen">
      <BuilderLayout
        name={construct().name}
        panel={
          <>
            <BuilderPanel value={construct()} onChange={setConstruct} sections={{ layout: false, widget: 'never', provider: true, home: false }} />
            <WorkSurfaceSection
              kind={paneKind()}
              onKindChange={setPaneKind}
              showDeviceToggle={showDeviceToggle()}
              onShowDeviceToggleChange={setShowDeviceToggle}
              showUrlBar={showUrlBar()}
              onShowUrlBarChange={setShowUrlBar}
              showOpenInNewTab={showOpenInNewTab()}
              onShowOpenInNewTabChange={setShowOpenInNewTab}
              showExpand={showExpand()}
              onShowExpandChange={setShowExpand}
              showCodeView={showCodeView()}
              onShowCodeViewChange={setShowCodeView}
            />
            <HeaderActionsSection
              showTitle={headerShowTitle()}
              onShowTitleChange={setHeaderShowTitle}
              showThemeToggle={headerShowThemeToggle()}
              onShowThemeToggleChange={setHeaderShowThemeToggle}
              showActions={headerShowActions()}
              onShowActionsChange={setHeaderShowActions}
              actions={headerActions()}
              onChange={setHeaderActions}
            />
            <ComposerSection
              chips={composerChips()}
              onChipsChange={setComposerChips}
              menuEnabled={composerMenuEnabled()}
              onMenuEnabledChange={setComposerMenuEnabled}
              menuEntries={composerMenuEntries()}
              onMenuEntriesChange={setComposerMenuEntries}
              slashTriggers={slashTriggers()}
              onSlashTriggersChange={setSlashTriggers}
              mentionTriggers={mentionTriggers()}
              onMentionTriggersChange={setMentionTriggers}
              mic={mic()}
              onMicChange={setMic}
            />
            <MessageActionsSection
              userActionRows={userActionRows()}
              onUserActionRowsChange={setUserActionRows}
              assistantActionRows={assistantActionRows()}
              onAssistantActionRowsChange={setAssistantActionRows}
            />
            <ShellSection state={shell()} onChange={setShell} />
          </>
        }
        preview={
          <WorkspacePreview
            construct={construct()}
            paneKind={paneKind()}
            onPaneKindChange={setPaneKind}
            chrome={{
              showDeviceToggle: showDeviceToggle(),
              showUrlBar: showUrlBar(),
              showOpenInNewTab: showOpenInNewTab(),
              showExpand: showExpand(),
              showCodeView: showCodeView(),
            }}
            expanded={expanded()}
            onExpandedChange={setExpanded}
            headerActions={headerActions()}
            headerShowTitle={headerShowTitle()}
            headerShowActions={headerShowActions()}
            headerShowThemeToggle={headerShowThemeToggle()}
            dark={resolvedDark()}
            onToggleDark={toggleDark}
            composerChips={composerChips()}
            composerMenuEnabled={composerMenuEnabled()}
            composerMenuEntries={composerMenuEntries()}
            slashTriggers={slashTriggers()}
            mentionTriggers={mentionTriggers()}
            mic={mic()}
            userActions={userActions()}
            assistantActions={assistantActions()}
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

const meta = { title: 'Labs/Builder/Workspace', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

/**
 * The Workspace template's builder: a resizable split — a chat rail
 * (`WorkspaceShell`'s `start`) beside a large work pane (`children`).
 * Modeled on `Labs/Apps`'s Lovable and v0 stories (read closely before
 * building): the work pane carries Lovable's own browser-chrome toolbar
 * (device toggle, URL bar, open-in-new-tab, Preview|Code with Preview
 * first) plus a v0-style Expand control wired through `WorkspaceShell`'s
 * REAL controlled `startCollapsed` prop — every toolbar affordance is
 * individually optional. The pane's own viewport (behind both the preview
 * and code content, matching Lovable's real preview surface) sits on a
 * muted background, distinct from the pane's toolbar and content cards.
 * An app-level header sits above the split: title on the left; on the
 * right, a fixed left-to-right arrangement (search + a real dark-mode
 * toggle scoped to just this preview frame, a divider, the configurable
 * Share/Deploy actions row, a divider, a compact avatar+chevron user menu)
 * — every element individually optional via a panel toggle, the
 * arrangement itself is not. The composer gains optional quick-fill
 * chips (wired to `ChatThread`'s real controlled `value`) and a v0-style
 * `+` menu (the kit's real `Dropdown` primitives), plus Microphone and a
 * now-actually-wired Attachments toggle. Panel: Identity, Provider, Theme,
 * Capabilities, Work surface, App header, Composer, and the shared Message
 * actions picker.
 *
 * This template's own module doc comment draws the construct-expressible
 * boundary concretely: the split FRAME is real (`layout: 'split'`);
 * everything else this round added — pane content, pane chrome, header
 * actions, and all four composer knobs — has no construct vocabulary
 * today (T-5, widened proposal in docs/superpowers/research/
 * 2026-08-28-builder-t5-vocabulary-proposals.md).
 */
export const Workspace: Story = {
  render: () => <WorkspaceBuilderDemo />,
};
