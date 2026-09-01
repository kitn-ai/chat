import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { type JSX, createSignal, createMemo, For } from 'solid-js';
import { ChevronUp, ChevronDown, X, PanelLeft, Search } from 'lucide-solid';
import { BuilderPanel, type BuilderConstruct } from '../components/builder-panel';
import { BuilderLayout, type BuilderViewport } from '../components/builder-layout';
import { resolveAccentWrapperStyle } from '../components/builder-preview';
import { ChatThread } from '../components/chat-thread';
import { ConversationList } from '../components/conversation-list';
import { mix, StubStatTile, StubCodeBlock } from '../components/builder-skeleton';
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
import { Tabs, type KaiTabItem } from '../ui/tabs';
import { RadioGroup, type RadioOption } from '../ui/radio';
import { Switch } from '../ui/switch';
import { Select } from '../ui/select';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import type { ChatMessage } from './chat-types';
import type { ConversationGroup, ConversationSummary } from '../types';

// Labs/Builder/"Multi-mode" — T-1 build-out, owner discovery round. WORKING
// NAME ONLY (T-4: neutral public names — the owner will name this properly;
// "Multi-mode" is a placeholder describing the mechanism, not a product).
// This template does not appear on `Labs/Builder/Start` yet — T-5's own
// rule ("a card appears in the real product only when its template is
// buildable") applies here even more literally than Voice's T-1a gate: this
// whole template is a proposal pending the owner's approval of its name and
// its (genuinely bigger) construct question, see below.
//
// THE SHARED ANATOMY, extracted from three real Labs examples (read closely
// before building anything, per the assignment):
//  - `elements/perplexity-pro.stories.tsx`: a REAL match. A segmented
//    Assistant | Computer toggle (`kai-tabs variant="segmented" block`) at
//    the TOP OF THE RAIL swaps BOTH the rail's own content and the main
//    view (`<Show when={mode() === 'assistant'}>...<Show when={mode() ===
//    'computer'}>...`, confirmed by reading the render function directly).
//    This is the one example that actually matches "each mode swaps the
//    entire working surface" — the assignment's own framing — so it's the
//    anatomy this template builds against.
//  - `elements/claude-code.stories.tsx`: a RELATED but DIFFERENT shape, not
//    the same anatomy. Its `kai-tabs` (Home/Code) swaps ONLY the main view
//    — the rail (a conversation list) stays constant across both tabs — and
//    a separate `kai-screen` peer provides a full-app TAKEOVER (Design)
//    outside the tab model entirely. Worth naming as a second real
//    precedent for "a mode swap," but it is a narrower one (main-only) than
//    what this template builds.
//  - `elements/codex.stories.tsx`: CHECKED AND FOUND NOT TO APPLY. Grepped
//    for a mode signal/switch and found none — Codex Web is a single,
//    composer-led column with no mode toggle at all (its own module
//    comment: "a deliberately DIFFERENT shape... to showcase the kit's
//    range"). The assignment's premise that this file has a "ChatGPT|Codex
//    switch" does not hold; recorded here rather than fabricating one to
//    match the brief. (Codex's composer chrome — repo/branch pills, an
//    Ask/Code dual-button — is real and reused below as the Composer's
//    Context-pills knob, just not as a mode switcher.)
//
// REVISION ROUND (owner feedback: the first version "looked weird," not up
// to the fidelity bar of the two Labs examples it claims to mirror) — the
// delta from the first version, kept here because it's the useful part for
// the eventual real build:
//  - GOT WRONG: the switcher spanned the WHOLE FRAME, above both rail and
//    main, like a page-level tab bar. Re-reading both sources caught this:
//    perplexity-pro's segmented toggle lives INSIDE `<div slot="start">`,
//    at the top of the rail column only — not above the rail. claude-code's
//    `kai-tabs` (Home/Code) lives in the SAME place, inside `slot="header"`
//    of its `<kai-conversations>` rail. Neither real precedent puts a
//    switcher above the whole app; both keep it IN the rail. Fixed: the
//    switcher now sits at the top of a persistent rail column (`RailHeader`
//    below), with the mode's own rail content beneath it and the mode's own
//    main content in a separate column beside it — matching both sources'
//    actual structure, not an invented one.
//  - GOT WRONG (paraphrase mismatch, checked against the source rather than
//    assumed): claude-code's own organization is NOT a "bottom nav." Its
//    rail header (read again for this revision) is a small icon row
//    (sidebar-toggle, search) ABOVE a segmented `kai-tabs` (Home/Code, block
//    width), with its OWN `kai-nav` below that — all inside the rail's
//    `slot="header"`. A SEPARATE "Design" full-screen takeover lives in the
//    rail's `slot="footer"`, structurally a peer TAKEOVER (a `kai-screen`),
//    not a member of the Home/Code tab group. So "well-organized... with
//    its supporting items" is the icon row sitting alongside the switcher
//    in the rail header, not a switcher positioned at the bottom of
//    anything. Represented here as `RailHeader`'s `railHeader` style: the
//    same real segmented `Tabs` (identical to the `segmented` style — see
//    `ModeSwitcherTabs`), with claude-code's icon-row chrome above it. The
//    takeover-style "Design" affordance itself was NOT added as a third
//    mode — it's structurally not a mode swap, and adding one would exceed
//    what this round's `modes` shape (rail+main swap only) represents.
//  - Both real precedents keep the SWITCHER's own shape identical (a plain
//    segmented `Tabs`, block width) — the delta between them is the CHROME
//    around it, not the control itself. So `switcherStyle` picks between
//    two real organizations, not two switcher widgets.
//
// COMPOSED FROM THE EXISTING BUILDER PREVIEW FRAMINGS, per the assignment's
// own instruction — not reimplemented, and RESTRUCTURED this revision to
// split each mode into separate RAIL and MAIN pieces (matching the fixed
// placement above): mode "assistant" reuses `Labs/Builder/Assistant`'s own
// real pieces (`ConversationList` for the rail, `ChatThread` for the main
// column — that template's own real split). Mode "workspace" reuses `Labs/
// Builder/Workspace`'s own real pieces the other way around: a `ChatThread`
// (that template's own chat rail) for THIS template's rail column, and the
// skeleton work-pane language from `builder-skeleton.tsx` for the main
// column — Workspace's own big-pane-beside-a-thin-rail shape, just
// expressed through Multi-mode's shared rail/main slots instead of a
// nested `WorkspaceShell` (the first version nested a whole second
// resizable shell inside this template's own split, which is exactly the
// "third copy of a control surface" this round was trying to avoid, so the
// revision removes that nesting too).
//
// COMPOSER: mic + the real Triggers (`components/builder-composer-
// triggers.tsx`, the SAME shared module `Labs/Builder/Workspace`,
// `.../Assistant`, and `.../In-app assistant` now all reuse — this is the
// fourth use, past the rule-of-three the assignment named). ON by default
// here (owner's default matrix: agentic/dev shapes default on, alongside
// Workspace). Also carries a NEW "Context pills" control — read-only
// label/value chips shown near the composer — modeled on Codex's real
// repo/branch environment-pill pattern (`elements/codex.stories.tsx`,
// inventoried above), which generalizes to dev/workspace-shaped templates
// but not to Support widget/Voice/Research, so it is added here and to
// `Labs/Builder/Workspace` only, not universally. Codex's other real
// finding — the Ask/Code dual-button composer footer — is INVENTORIED but
// NOT built as a control this round (recorded honestly in the T-5 doc
// rather than silently dropped).
//
// T-5 (NEW entry — this is an entirely new template proposal, not a gap in
// an existing one): `modes: [{ id, label, shape: 'assistant' | 'workspace';
// ...shape-specific fields }]`. Flagged as a genuinely bigger vocabulary
// question than every other proposal in this document: each mode's `shape`
// would need to carry roughly a WHOLE nested construct-worth of config (an
// assistant mode's starters/history/conversations vs. a workspace mode's
// pane kind/chrome), which may be the edge of what a flat `construct.v1`
// object can hold cleanly — recorded as the honest ceiling question, not
// resolved here. This template's card belongs on the real `Labs/Builder/
// Start` picker only after the owner names it and approves the construct
// direction (same T-1a-shaped gate Voice already sets a precedent for).

type ModeShape = 'assistant' | 'workspace';
interface ModeDef {
  id: string;
  label: string;
  shape: ModeShape;
}

let nextModeId = 1;
const newModeId = (): string => `mode-${nextModeId++}`;

const SHAPE_OPTIONS: readonly { value: ModeShape; label: string }[] = [
  { value: 'assistant', label: 'Assistant' },
  { value: 'workspace', label: 'Workspace' },
];

const DEFAULT_MODES: ModeDef[] = [
  { id: newModeId(), label: 'Assistant', shape: 'assistant' },
  { id: newModeId(), label: 'Build', shape: 'workspace' },
];

interface ContextPill {
  id: string;
  label: string;
  value: string;
}
let nextPillId = 1;
const newPillId = (): string => `pill-${nextPillId++}`;
const DEFAULT_CONTEXT_PILLS: ContextPill[] = [
  { id: newPillId(), label: 'Repo', value: 'kitn-ai/ui' },
  { id: newPillId(), label: 'Branch', value: 'main' },
];

const GROUPS: ConversationGroup[] = [{ id: 'today', name: 'Today', sortOrder: 0, createdAt: '2026-08-27' }];
const CONVERSATIONS: ConversationSummary[] = [
  { id: 'c1', title: 'Draft the release notes', groupId: 'today', messageCount: 4, updatedAt: '2026-08-27T15:00:00Z' },
  { id: 'c2', title: 'Explain the wire adapter', groupId: 'today', messageCount: 2, updatedAt: '2026-08-27T11:00:00Z' },
];

const ASSISTANT_MESSAGES: ChatMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Draft the release notes for 0.30.0' }] },
  { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: "Here's a draft — headline feature first, then fixes." }] },
];

const WORKSPACE_MESSAGES: ChatMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Build a pricing table component' }] },
  { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: "Here's a three-tier pricing table." }] },
];

const DEFAULT_CONSTRUCT: BuilderConstruct = {
  name: 'multi-mode',
  layout: 'fullscreen',
  provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
  header: { title: 'Multi-mode' },
  theme: { accent: '#4338ca', mode: 'system' },
  capabilities: {
    starters: ['Draft the release notes', 'Build a pricing table'],
    attachments: { accept: ['image/*'] },
    history: { persistence: 'local' },
  },
};

/** RAIL content for the `assistant` mode — `ConversationList`, trimmed from
 *  `Labs/Builder/Assistant`'s own real piece. The rail is where Assistant's
 *  own real anatomy puts it (`Labs/Builder/Assistant`'s own sidebar), and
 *  it's also where BOTH real Multi-mode precedents put a mode's own nav —
 *  `perplexity-pro`'s `kai-nav`/`kai-search`/recents, `claude-code`'s
 *  `kai-nav`/recents — never in the main column. */
function AssistantModeRail(props: { activeId: string; onSelect: (id: string) => void }): JSX.Element {
  return <ConversationList groups={GROUPS} conversations={CONVERSATIONS} activeId={props.activeId} onSelect={props.onSelect} onNewChat={() => {}} class="h-full" />;
}

/** MAIN content for the `assistant` mode — the real `ChatThread`. */
function AssistantModeMain(props: { construct: BuilderConstruct; triggers: ReturnType<typeof buildTriggerDefs>; mic: boolean }): JSX.Element {
  return (
    <ChatThread
      class="h-full"
      messages={ASSISTANT_MESSAGES}
      chatTitle={props.construct.header?.title}
      suggestions={props.construct.capabilities?.starters}
      voice={props.mic}
      triggers={props.triggers}
      onSubmit={() => {}}
    />
  );
}

/** RAIL content for the `workspace` mode — a compact `ChatThread` (the chat
 *  side of Workspace's own real split) plus the context pills, if any. */
function WorkspaceModeRail(props: { construct: BuilderConstruct; triggers: ReturnType<typeof buildTriggerDefs>; mic: boolean; contextPills: ContextPill[] }): JSX.Element {
  return (
    <div class="flex h-full flex-col">
      {props.contextPills.length > 0 && (
        <div class="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
          <For each={props.contextPills}>
            {(pill) => (
              <span class="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {pill.label}: <span class="text-foreground">{pill.value}</span>
              </span>
            )}
          </For>
        </div>
      )}
      <ChatThread
        class="h-full min-h-0 flex-1"
        messages={WORKSPACE_MESSAGES}
        chatTitle={props.construct.header?.title}
        suggestions={props.construct.capabilities?.starters}
        voice={props.mic}
        triggers={props.triggers}
        onSubmit={() => {}}
      />
    </div>
  );
}

/** MAIN content for the `workspace` mode — the skeleton work pane (Workspace
 *  template's own toolbar chrome not repeated here, that round's own
 *  control surface). */
function WorkspaceModeMain(): JSX.Element {
  return (
    <div class="flex h-full flex-col gap-4 bg-background p-5">
      <div class="grid grid-cols-3 gap-3">
        <StubStatTile class="h-24" />
        <StubStatTile class="h-24" />
        <StubStatTile class="h-24" />
      </div>
      <StubCodeBlock lines={8} class="max-w-xl" />
    </div>
  );
}

type SwitcherStyle = 'segmented' | 'railHeader';

const SWITCHER_STYLE_OPTIONS: readonly RadioOption<SwitcherStyle>[] = [
  { value: 'segmented', label: 'Segmented', description: 'perplexity-pro: the switcher alone, top of rail' },
  { value: 'railHeader', label: 'Rail header', description: 'claude-code: toggle/search row above the switcher' },
];

/** The mode switcher itself — the REAL segmented `Tabs`, `block` width,
 *  identical in both styles (see the module doc comment: the delta between
 *  the two real precedents is the CHROME around the switcher, not the
 *  switcher's own shape). */
function ModeSwitcherTabs(props: { items: KaiTabItem[]; value: string; onChange: (id: string) => void }): JSX.Element {
  return <Tabs items={props.items} value={props.value} variant="segmented" block onChange={props.onChange} />;
}

/**
 * The rail's own header — persistent across a mode swap, sitting ABOVE the
 * mode's own rail content, inside the rail column. Two real styles:
 *  - `segmented` (perplexity-pro): the switcher alone, nothing else.
 *  - `railHeader` (claude-code): a small icon-button row (sidebar-toggle,
 *    search — decorative here, real `Button`s) ABOVE the switcher, mirroring
 *    claude-code's own richer rail header (its `slot="header"` carries a
 *    toggle/search row, then the segmented tabs, then its own nav — the
 *    "well-organized... with its supporting items" shape).
 */
function RailHeader(props: {
  style: SwitcherStyle;
  items: KaiTabItem[];
  value: string;
  onChange: (id: string) => void;
  shell: ShellControlsState;
  onOpenPalette: () => void;
}): JSX.Element {
  return (
    <div class="flex flex-col gap-2 border-b border-border p-2.5">
      {props.style === 'railHeader' && (
        <div class="flex items-center justify-between gap-1 px-0.5">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Toggle sidebar">
            <PanelLeft size={14} aria-hidden="true" />
          </Button>
          {/* The real Command palette trigger, per this template's own Shell
              knobs — replaces the decorative Search icon claude-code's own
              rail header carries when the palette is on; falls back to the
              decorative icon when it's off, same rail-header chrome either
              way. */}
          {props.shell.commandPalette ? (
            <CommandPaletteTrigger onOpen={props.onOpenPalette} />
          ) : (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Search" disabled>
              <Search size={14} aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
      <ModeSwitcherTabs items={props.items} value={props.value} onChange={props.onChange} />
    </div>
  );
}

function MultiModePreview(props: {
  construct: BuilderConstruct;
  modes: ModeDef[];
  activeMode: string;
  onActiveModeChange: (id: string) => void;
  switcherStyle: SwitcherStyle;
  mic: boolean;
  slashTriggers: TriggerGroupState;
  mentionTriggers: TriggerGroupState;
  contextPills: ContextPill[];
  shell: ShellControlsState;
  viewport: BuilderViewport;
}): JSX.Element {
  const [assistantActiveId, setAssistantActiveId] = createSignal(CONVERSATIONS[0].id);
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const frameStyle = createMemo(() => ({
    ...resolveAccentWrapperStyle(props.construct.theme),
    height: 'calc(100vh - 9rem)',
    width: 'calc(100vw - 27rem)',
    'max-width': '100%',
  }));
  const tabItems = createMemo<KaiTabItem[]>(() => props.modes.map((m) => ({ id: m.id, label: m.label })));
  const activeShape = createMemo<ModeShape>(() => props.modes.find((m) => m.id === props.activeMode)?.shape ?? props.modes[0]?.shape ?? 'assistant');
  const triggers = createMemo(() => buildTriggerDefs(props.slashTriggers, props.mentionTriggers));

  return (
    <div
      class="flex overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      style={frameStyle()}
      data-builder-multimode-frame
      data-builder-viewport={props.viewport}
      data-builder-active-mode={activeShape()}
      data-builder-switcher-style={props.switcherStyle}
    >
      <CommandPaletteOverlay open={props.shell.commandPalette && paletteOpen()} onClose={() => setPaletteOpen(false)} />
      {/* RAIL column: the persistent switcher header, then the active
          mode's own rail content — mirroring BOTH real precedents, which
          keep their mode switch inside the rail's own start/header slot,
          never spanning the whole frame above rail+main. A footer row
          (User menu, when on) matches BOTH real precedents too — both
          perplexity-pro's and claude-code's own account row lives in the
          rail's footer, not the header. */}
      <div class="flex h-full w-72 shrink-0 flex-col border-r border-border" style={{ 'background-color': mix('--color-muted', 10) }}>
        <RailHeader
          style={props.switcherStyle}
          items={tabItems()}
          value={props.activeMode}
          onChange={props.onActiveModeChange}
          shell={props.shell}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <div class="min-h-0 flex-1">
          {activeShape() === 'assistant' ? (
            <AssistantModeRail activeId={assistantActiveId()} onSelect={setAssistantActiveId} />
          ) : (
            <WorkspaceModeRail construct={props.construct} triggers={triggers()} mic={props.mic} contextPills={props.contextPills} />
          )}
        </div>
        {props.shell.userMenu && (
          <div class="border-t border-border p-1.5">
            <UserMenu name="Ada" plan="Pro" />
          </div>
        )}
      </div>
      {/* MAIN column: the active mode's own main content. */}
      <div class="min-w-0 flex-1">
        {activeShape() === 'assistant' ? (
          <AssistantModeMain construct={props.construct} triggers={triggers()} mic={props.mic} />
        ) : (
          <WorkspaceModeMain />
        )}
      </div>
    </div>
  );
}

function ModesSection(props: {
  modes: ModeDef[];
  onChange: (v: ModeDef[]) => void;
  activeMode: string;
  switcherStyle: SwitcherStyle;
  onSwitcherStyleChange: (v: SwitcherStyle) => void;
}): JSX.Element {
  const [draftLabel, setDraftLabel] = createSignal('');
  const [draftShape, setDraftShape] = createSignal<ModeShape>('assistant');

  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= props.modes.length) return;
    const next = props.modes.slice();
    [next[index], next[target]] = [next[target], next[index]];
    props.onChange(next);
  };
  const remove = (id: string): void => {
    if (props.modes.length <= 1) return;
    props.onChange(props.modes.filter((m) => m.id !== id));
  };
  const setShape = (id: string, shape: ModeShape): void => props.onChange(props.modes.map((m) => (m.id === id ? { ...m, shape } : m)));
  const setLabel = (id: string, label: string): void => props.onChange(props.modes.map((m) => (m.id === id ? { ...m, label } : m)));
  const add = (): void => {
    if (!draftLabel().trim()) return;
    props.onChange([...props.modes, { id: newModeId(), label: draftLabel().trim(), shape: draftShape() }]);
    setDraftLabel('');
  };

  return (
    <section class="flex flex-col gap-3 border-b border-border p-4">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Modes</h3>
      <p class="text-xs text-muted-foreground">
        Each mode swaps the whole rail + main view, mirroring perplexity-pro's real segmented toggle. Supported shapes: Assistant,
        Workspace (see this file's module doc comment).
      </p>
      <div class="flex flex-col gap-1.5" role="group" aria-label="Modes">
        <For each={props.modes}>
          {(mode, i) => (
            <div class="flex items-center gap-1.5 rounded-md border border-border/70 bg-surface px-2 py-1.5">
              <Input aria-label={`${mode.label} label`} value={mode.label} onValueInput={(v) => setLabel(mode.id, v)} class="w-28 shrink-0 text-xs" />
              <Select aria-label={`${mode.label} shape`} options={SHAPE_OPTIONS} value={mode.shape} onChange={(e) => setShape(mode.id, e.currentTarget.value as ModeShape)} class="flex-1 text-xs" />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${mode.label} up`} disabled={i() === 0} onClick={() => move(i(), -1)}>
                <ChevronUp size={12} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${mode.label} down`} disabled={i() === props.modes.length - 1} onClick={() => move(i(), 1)}>
                <ChevronDown size={12} aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${mode.label}`} disabled={props.modes.length <= 1} onClick={() => remove(mode.id)}>
                <X size={12} aria-hidden="true" />
              </Button>
            </div>
          )}
        </For>
      </div>
      <div class="flex items-center gap-1.5">
        <Input value={draftLabel()} onValueInput={setDraftLabel} placeholder="Mode label" class="flex-1 text-xs" />
        <Select aria-label="New mode shape" options={SHAPE_OPTIONS} value={draftShape()} onChange={(e) => setDraftShape(e.currentTarget.value as ModeShape)} class="text-xs" />
        <Button type="button" variant="outline" size="sm" onClick={add}>Add</Button>
      </div>
      <p class="text-xs text-muted-foreground">
        Preview-only — construct.v1 has no `modes` key at all (T-5, see this file's module doc comment: a genuinely new template
        proposal, possibly the construct-vocabulary ceiling).
      </p>

      <div class="flex flex-col gap-1.5 border-t border-border pt-3">
        <span class="text-xs font-medium text-foreground">Switcher style</span>
        <RadioGroup<SwitcherStyle> options={SWITCHER_STYLE_OPTIONS} value={props.switcherStyle} label="Switcher style" onChange={props.onSwitcherStyleChange} />
        <p class="text-xs text-muted-foreground">
          Both real precedents keep the switcher inside the rail, never spanning the frame — see this file's module doc comment for the
          revision from the first version of this story, which got that placement wrong.
        </p>
      </div>
    </section>
  );
}

function ComposerSection(props: {
  mic: boolean;
  onMicChange: (v: boolean) => void;
  slashTriggers: TriggerGroupState;
  onSlashTriggersChange: (v: TriggerGroupState) => void;
  mentionTriggers: TriggerGroupState;
  onMentionTriggersChange: (v: TriggerGroupState) => void;
  contextPills: ContextPill[];
  onContextPillsChange: (v: ContextPill[]) => void;
}): JSX.Element {
  const [pillLabel, setPillLabel] = createSignal('');
  const [pillValue, setPillValue] = createSignal('');
  const addPill = (): void => {
    if (!pillLabel().trim() || !pillValue().trim()) return;
    props.onContextPillsChange([...props.contextPills, { id: newPillId(), label: pillLabel().trim(), value: pillValue().trim() }]);
    setPillLabel('');
    setPillValue('');
  };
  const removePill = (id: string): void => props.onContextPillsChange(props.contextPills.filter((p) => p.id !== id));

  return (
    <section class="flex flex-col gap-3 border-b border-border p-4" data-builder-preview-only-controls>
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Composer</h3>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-foreground">Microphone</span>
        <Switch checked={props.mic} label="Microphone" onChange={props.onMicChange} />
      </div>

      <div class="flex flex-col gap-1.5 pt-1">
        <span class="text-xs font-medium text-foreground">Context pills</span>
        <p class="text-xs text-muted-foreground">Read-only label/value chips near the composer — Codex's own repo/branch environment-pill shape. Workspace mode only.</p>
        <For each={props.contextPills}>
          {(pill) => (
            <div class="flex items-center gap-1.5 rounded-md border border-border/70 bg-surface px-2 py-1.5">
              <span class="w-20 shrink-0 truncate text-xs font-medium text-foreground">{pill.label}</span>
              <span class="flex-1 truncate text-xs text-muted-foreground">{pill.value}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${pill.label}`} onClick={() => removePill(pill.id)}>
                <X size={12} aria-hidden="true" />
              </Button>
            </div>
          )}
        </For>
        <div class="flex items-center gap-1.5">
          <Input value={pillLabel()} onValueInput={setPillLabel} placeholder="Label" class="w-20 shrink-0 text-xs" />
          <Input value={pillValue()} onValueInput={setPillValue} placeholder="Value" class="flex-1 text-xs" />
          <Button type="button" variant="outline" size="sm" onClick={addPill}>Add</Button>
        </div>
      </div>

      <ComposerTriggersSection
        slash={props.slashTriggers}
        onSlashChange={props.onSlashTriggersChange}
        mention={props.mentionTriggers}
        onMentionChange={props.onMentionTriggersChange}
      />
      <p class="text-xs text-muted-foreground">
        Triggers are ON by default here (owner's default matrix: agentic/dev shapes default on, alongside Workspace).
      </p>
    </section>
  );
}

function MultiModeBuilderDemo(): JSX.Element {
  const [construct, setConstruct] = createSignal<BuilderConstruct>(DEFAULT_CONSTRUCT);
  const [modes, setModes] = createSignal<ModeDef[]>(DEFAULT_MODES);
  const [activeMode, setActiveMode] = createSignal(DEFAULT_MODES[0].id);
  const [switcherStyle, setSwitcherStyle] = createSignal<SwitcherStyle>('segmented');
  const [mic, setMic] = createSignal(false);
  const [slashTriggers, setSlashTriggers] = createSignal<TriggerGroupState>({ enabled: true, entries: DEFAULT_SLASH_ENTRIES });
  const [mentionTriggers, setMentionTriggers] = createSignal<TriggerGroupState>({ enabled: true, entries: DEFAULT_MENTION_ENTRIES });
  const [contextPills, setContextPills] = createSignal<ContextPill[]>(DEFAULT_CONTEXT_PILLS);
  const [shell, setShell] = createSignal<ShellControlsState>({ commandPalette: true, userMenu: true });
  const [viewport, setViewport] = createSignal<BuilderViewport>('desktop');

  return (
    <div class="h-screen w-screen">
      <BuilderLayout
        name={construct().name}
        panel={
          <>
            <BuilderPanel value={construct()} onChange={setConstruct} sections={{ layout: false, widget: 'never', provider: true, home: false }} />
            <ModesSection
              modes={modes()}
              onChange={setModes}
              activeMode={activeMode()}
              switcherStyle={switcherStyle()}
              onSwitcherStyleChange={setSwitcherStyle}
            />
            <ComposerSection
              mic={mic()}
              onMicChange={setMic}
              slashTriggers={slashTriggers()}
              onSlashTriggersChange={setSlashTriggers}
              mentionTriggers={mentionTriggers()}
              onMentionTriggersChange={setMentionTriggers}
              contextPills={contextPills()}
              onContextPillsChange={setContextPills}
            />
            <ShellSection state={shell()} onChange={setShell} />
          </>
        }
        preview={
          <MultiModePreview
            construct={construct()}
            modes={modes()}
            activeMode={activeMode()}
            onActiveModeChange={setActiveMode}
            switcherStyle={switcherStyle()}
            mic={mic()}
            slashTriggers={slashTriggers()}
            mentionTriggers={mentionTriggers()}
            contextPills={contextPills()}
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

const meta = { title: 'Labs/Builder/Multi-mode', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// BuilderPanel/BuilderLayout are internal to the builder app (src/components/builder-panel.tsx,
// builder-layout.tsx) -- neither ships in a public @kitn.ai/ui entry point. The snippet below
// names the real composition and wiring rather than a package import; ChatThread and
// ConversationList ARE public (@kitn.ai/ui) and are shown as the two modes actually use them.
const src = (code: string) => ({
  parameters: { docs: { source: { code, language: 'tsx' } } },
});

/**
 * "Multi-mode" (T-4: working name, provisional — see the module doc
 * comment): a top-level segmented mode switcher, mirroring perplexity-pro's
 * real Assistant | Computer toggle, where each mode swaps the ENTIRE
 * working surface (rail + main), composed from the existing Assistant and
 * Workspace template previews' own real pieces. Panel: Identity, Provider,
 * Theme, Capabilities, a Modes list editor (add/remove/reorder, each mode
 * picking Assistant or Workspace as its shape), and a Composer section
 * (mic, Context pills, and the shared real Triggers control — on by
 * default here, the agentic/dev-shape default).
 *
 * NOT YET ON `Labs/Builder/Start`: this template's card is gated on the
 * owner naming it and ruling on its construct question — see the module
 * doc comment's T-5 note on why `modes: [...]` may be a genuinely bigger
 * vocabulary question than every other proposal so far.
 */
export const MultiMode: Story = {
  render: () => <MultiModeBuilderDemo />,
  ...src(`<BuilderLayout
  name={construct.name}
  panel={
    <BuilderPanel
      value={construct}
      onChange={setConstruct}
      sections={{ layout: false, widget: 'never', provider: true, home: false }}
    />
    // ...plus this screen's own Modes list editor and Composer section
  }
  preview={
    // Switching the top-level mode swaps the whole working surface
    activeMode === 'assistant' ? (
      <div class="flex h-full">
        <ConversationList groups={groups} conversations={conversations} activeId={activeId} onSelect={setActiveId} />
        <ChatThread messages={messages} chatTitle={construct.header?.title} onSubmit={sendMessage} />
      </div>
    ) : (
      <div class="flex h-full">
        <div class="flex-1">{/* the work pane */}</div>
        <ChatThread class="w-96 shrink-0" messages={messages} chatTitle={construct.header?.title} onSubmit={sendMessage} />
      </div>
    )
  }
  viewport={viewport}
  onViewportChange={setViewport}
/>`),
};
