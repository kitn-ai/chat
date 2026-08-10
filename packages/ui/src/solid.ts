// `@kitn.ai/ui/solid` — the COMPLETE SolidJS surface.
//
// WHY THIS EXISTS
// ---------------
// Solid is this kit's authored layer, so every registered `kai-*` element must be
// writable as a Solid component (`verify:solid-coverage` enforces 79/79 plus a
// `<Name>Props` type for every public component). But the root entry "." is what
// EVERY consumer resolves, including the React/Vue/Svelte/vanilla majority who
// only ever touch the web components. Growing "." to full Solid coverage cost
// them 591,359 -> 705,031 bytes (+113,672, +19.2%; +23,160 gzipped) for a surface
// four of the five supported frameworks cannot even call.
//
// So the full Solid catalog lives here instead, and this file is compiled as its
// OWN build target (vite.config.solid.ts -> dist/solid.js, plus the SSR twin
// vite.config.solid.server.ts -> dist/solid.server.js, mirroring "."). Nothing
// below is reachable from dist/index.js, which is the entire point: a React
// consumer's bundle never sees it.
//
// WHY IT COMPOSES "." INSTEAD OF RESTATING IT
// -------------------------------------------
// `export * from './index'` makes "./solid is a superset of ." a COMPILER
// invariant rather than a promise two hand-maintained lists have to keep. This
// repo has been bitten repeatedly by copied lists that no compiler watches; a
// restated 400-line barrel would be exactly that, and the failure mode is silent
// (an export lands on "." only, and Solid consumers never learn it exists).
//
// This costs nothing at the package boundary. The composition is resolved at
// SOURCE level and bundled away: dist/solid.js is a standalone artifact with no
// runtime dependency on dist/index.js, so importing "./solid" does not drag in a
// second entry, and importing "." does not drag in any of this.
//
// A Solid consumer therefore needs exactly one import:
//   import { Thread, Dialog, Message, type ThreadProps } from '@kitn.ai/ui/solid';
export * from './index';

// ---------------------------------------------------------------------------
// Layer 2 additions: UI primitives the coarse elements render.
// ---------------------------------------------------------------------------
export { HoverCardRoot, HoverCardTrigger, HoverCardContent } from './ui/hover-card';
export type {
  HoverCardRootProps, HoverCardTriggerProps, HoverCardContentProps,
} from './ui/hover-card';
export {
  DropdownSeparator, DropdownLabel, DropdownCheckboxItem, DropdownRadioItem,
  DropdownSub, DropdownSubTrigger, DropdownSubContent,
} from './ui/dropdown';
export type {
  DropdownSeparatorProps, DropdownLabelProps, DropdownCheckboxItemProps, DropdownRadioItemProps,
  DropdownSubProps, DropdownSubTriggerProps, DropdownSubContentProps,
} from './ui/dropdown';
export { clampBasis } from './ui/resizable';
export { Input } from './ui/input';
export type { InputProps } from './ui/input';
export { Kbd } from './ui/kbd';
export type { KbdProps, KbdPlatform } from './ui/kbd';
export { Switch } from './ui/switch';
export type { SwitchProps } from './ui/switch';
export { Tabs } from './ui/tabs';
export type { TabsProps, TabsVariant, KaiTabItem } from './ui/tabs';
export { Segmented } from './ui/segmented';
export type { SegmentedProps, SegmentedOption } from './ui/segmented';
export { Status } from './ui/status';
export type { StatusProps, StatusKind } from './ui/status';
export { ProgressBar } from './ui/progress-bar';
export type { ProgressBarProps, ProgressTone } from './ui/progress-bar';
export { Notice } from './ui/notice';
export type { NoticeProps, NoticeSeverity } from './ui/notice';
export { EditableLabel } from './ui/editable-label';
export type { EditableLabelProps } from './ui/editable-label';
export { Dialog } from './ui/dialog';
export type { DialogProps, DialogController } from './ui/dialog';
export { Popover } from './ui/popover';
export type { PopoverProps, PopoverController } from './ui/popover';
export { Nav } from './ui/nav';
export type { NavProps, KaiNavItem, NavItemStatus, NavStatusTone } from './ui/nav';
export { CommandList } from './ui/command';
export type { CommandListProps, CommandRow, CommandGroup } from './ui/command';
export { AgentCard } from './ui/agent-card';
export type { AgentCardProps, AgentStatus, AgentStatusTone } from './ui/agent-card';
export { Pane } from './ui/pane';
export type { PaneProps, PaneStatus, PaneStatusTone } from './ui/pane';
export { PaneGroup } from './ui/pane-group';
export type { PaneGroupProps, PaneTab, PaneTabStatus } from './ui/pane-group';
export { PromptDock } from './ui/prompt-dock';
export type { PromptDockProps, PromptDockFrame, PromptDockAppearance } from './ui/prompt-dock';
export { SettingsGroup, SettingItem } from './ui/settings-group';
export type { SettingsGroupProps, SettingItemProps } from './ui/settings-group';
// `kai-icon` renders no kit component — it calls this. Solid consumers resolving
// the same `icon` strings (named icon | URL | text fallback) need it too.
export { renderIcon } from './ui/icon';

// ---------------------------------------------------------------------------
// Layer 3 additions: AI/feature components.
// ---------------------------------------------------------------------------
export { ChainOfThoughtAccordion } from './components/chain-of-thought';
export type { ChainOfThoughtAccordionProps } from './components/chain-of-thought';
export { VoiceOutput } from './components/voice-output';
export type { VoiceOutputProps, VoiceOutputController } from './components/voice-output';
export { CollapsedRail } from './components/conversation-list';
export type { CollapsedRailProps } from './components/conversation-list';

// ---------------------------------------------------------------------------
// Layer 3b: the composed thread/shell components the coarse elements wrap.
// These are what `<kai-thread>`, `<kai-chat>`, `<kai-screen>`, `<kai-coachmark>` and
// `<kai-composer>` render, so a Solid consumer writes one component for one element
// instead of re-deriving the scroll/feedback/staging behaviour by hand.
// ---------------------------------------------------------------------------
export { Thread } from './components/thread';
export type { ThreadProps, ThreadController } from './components/thread';
// ChatThread — the component behind `<kai-chat>`. VERIFIED standalone: rendered in
// a plain Vite+Solid app (no custom element, no shadow root) it draws its header,
// the full message list and its BUILT-IN composer; typing into that composer and
// pressing Send fires `onSubmit` with the typed text and the thread updates, with
// no console errors.
//
// It does emit 5 `<slot>` elements — header-start, header-end, input-top,
// toolbar-start, toolbar-end. Those are OPTIONAL INJECT points with no assigned
// nodes outside the facade, so they render nothing; they are only fillable from
// `<kai-chat>`'s light DOM. The REPLACE/INJECT props (`sidebar`, `empty`,
// `composer`, `headerFull`, `footer`, `composerActions`) are opt-in switches that
// the FACADE sets when a host slots content — left at their default they emit no
// slot at all and the built-in UI renders. So a Solid consumer can ignore all of
// it; they just cannot project content into those five points without the element.
export { ChatThread } from './components/chat-thread';
export type { ChatThreadProps, ChatThreadController, ChatThreadContextUsage } from './components/chat-thread';
export { Screen } from './components/screen';
export type { ScreenProps, ScreenController } from './components/screen';
export { Coachmark } from './components/coachmark';
export type { CoachmarkProps, CoachmarkController } from './components/coachmark';
export { Composer } from './components/composer';
export type {
  ComposerProps, ComposerController, ComposerChange, TriggerDef, TriggerItem, HighlightRule,
} from './components/composer';
