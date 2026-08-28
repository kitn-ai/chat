import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { type JSX, createSignal, createMemo } from 'solid-js';
import { BuilderPanel, type BuilderConstruct } from '../components/builder-panel';
import { BuilderLayout, type BuilderViewport } from '../components/builder-layout';
import { resolveAccentWrapperStyle } from '../components/builder-preview';
import { ChatThread } from '../components/chat-thread';
import { mix, SkeletonBar, StubStatTile, StubNavRow, StubTableRow } from '../components/builder-skeleton';
import {
  type UserActionId,
  type AssistantActionId,
  type ActionRowState,
  USER_ACTION_CATALOG,
  ASSISTANT_ACTION_CATALOG,
  DEFAULT_USER_ACTION_ROWS,
  DEFAULT_ASSISTANT_ACTION_ROWS,
  SPEAK_CUSTOM_ACTION,
  ActionRowPicker,
} from '../components/builder-message-actions';
import {
  type TriggerGroupState,
  ComposerTriggersSection,
  buildTriggerDefs,
  DEFAULT_SLASH_ENTRIES,
  DEFAULT_MENTION_ENTRIES,
} from '../components/builder-composer-triggers';
import { Switch } from '../ui/switch';
import { RadioGroup, type RadioOption } from '../ui/radio';
import { Select } from '../ui/select';
import { cn } from '../utils/cn';
import type { ChatMessage, ChatMessageAction, CustomAction } from './chat-types';

// Labs/Builder/In-app assistant — Round A (T-1/T-2/T-6, docs/superpowers/
// specs/2026-08-28-template-builder-design.md): the SECOND template story,
// docked-aside shape (T-1's own words: "the ops-console fixture's real
// shape, fully construct-expressible today"). Same convergence story as
// `Labs/Builder/Support widget` — `Labs/Builder/Start`'s "In-app assistant"
// card is the intended entry point, unwired (story-first, one round at a
// time); the template FIXES `layout: 'aside'` internally, so there is no
// Layout radio here either (`sections={{ layout: false, ... }}` on
// `BuilderPanel`).
//
// The starting construct is `agent-tooling/construct/fixtures/
// ops-console.construct.json`, translated into the stub `BuilderConstruct`
// shape field-for-field (provider endpoint/url/wire, theme.accent, the two
// starters, attachments, `history.persistence: 'local'`, the
// `deployment_parameters` card) — the fixture itself sets no `header.title`
// or `home`, and this story keeps that honest: no Home section exists at
// all (below), and the header title shown in the preview ("Ops Console")
// is this story's own invented touch for a livelier demo, the same
// license `Labs/Builder/Support widget` already took with its accent.
//
// THE RAIL'S WIDTH IS FIXED, NOT A KNOB (read before adding one):
// codegen.ts's own `emitLayoutOpen` for `layout: 'aside'` hardcodes `width:
// '380px'` and `inset-inline-end: '0'` — construct.v1's schema has no width
// field for the aside layout anywhere (`schema.ts`'s `layout` enum names
// the shape; nothing under it configures ITS geometry). So this panel adds
// no width control for the rail — inventing one the schema can't honor
// would be a knob that lies.
//
// Round A2 (owner amendment) added THREE preview-only knobs below the panel
// — Composer/Mic, Messages/Message actions, Rail placement — each one a
// genuine T-5 vocabulary-gap candidate, not decided here, listed so the
// gap is loud rather than silently faked as already-wired:
//  - **Mic** (`ChatThread`'s own `voice` prop, `components/chat-thread.tsx`)
//    exists at the COMPONENT tier today; `construct.v1`'s `capabilities`
//    block has no `voice`/`mic` key, so an emitted construct can't turn
//    this on yet. Candidate: `capabilities.voice: boolean`.
//  - **Message actions** (Round A3 reshape below) mirrors the kit's REAL
//    action vocabulary AND its real per-message, per-ROLE model — see the
//    Round A3 note directly below for the full shape.
//  - **Rail placement** (start/end) is the same gap the module doc above
//    already named for the rail's WIDTH: `layout: 'aside'`'s only
//    configurable geometry today is none — `emitLayoutOpen` hardcodes
//    `inset-inline-end`. Candidate: `aside`-scoped `position: 'start' |
//    'end'` alongside a future width field.
// All three render as real, working controls in THIS story (a design
// round is allowed to show a knob the schema can't hold yet) but write to
// local `createSignal`s, never to `BuilderConstruct` — they never touch
// the "Raw JSON" panel below, which is the honest tell that they aren't
// construct fields.
//
// Round A3 (owner amendment) reshaped Message actions into an ORDERED,
// ROLE-SCOPED picker, replacing Round A2's single flat toggle-chip group:
//  - `ChatMessage.actions` (`elements/chat-types.ts`) is `(ChatMessageAction
//    | CustomAction)[]` — an ORDERED array, not a set — and it's set
//    per-message, so "enabled" alone was never the whole model; the array's
//    ORDER is what the action bar actually renders left-to-right
//    (`message.tsx`'s `MessageActionBar` just maps over it — verified no
//    resorting happens there).
//  - Checked whether any built-in id is hard-coupled to a role anywhere in
//    the kit: it is NOT. `message.tsx` (`normalizeAction`/`feedbackVoteOf`/
//    the action-bar render) and `chat-thread.tsx` (`actions={m().actions}`,
//    line ~886) both treat `actions` as opaque per-message data with zero
//    role awareness — `edit` renders identically on an assistant message as
//    on a user one if a caller puts it there. Role-appropriateness (edit on
//    YOUR OWN messages, not a response you can't edit; regenerate on an
//    assistant response, not something you'd regenerate of your own typing)
//    is entirely a caller-curation concern, never enforced by the
//    component. This story enforces it by curation: two separate catalogs,
//    below, one per role, each independently ordered and toggled.
//  - "Read aloud (speak)" is a SIXTH row, on the assistant catalog only,
//    marked `proposed: true` (a muted "Proposed" tag in the picker — see
//    `ActionRowPicker`). `'speak'` is not a `ChatMessageAction` value today
//    — voice OUTPUT exists as a separate element (`kai-voice-output`), not
//    as a message action id. Kit-tier proposal: add `'speak'` to
//    `ChatMessageAction`, backed by `kai-voice-output`, so a host can wire
//    an actual read-aloud without inventing a `CustomAction`. When the row
//    is enabled here, the preview appends a REAL `CustomAction` (`{ id:
//    'speak', label: 'Read aloud (speak)', icon: 'volume-2' }` — `volume-2`
//    is already a curated icon in `ui/action-icons.ts`'s registry) so the
//    button actually renders in the live preview; clicking it does
//    nothing — no fake TTS is ever wired, per instruction.
//  - Construct-vocabulary candidate updated accordingly from Round A2's
//    single-array sketch to a role-scoped shape: `capabilities.
//    messageActions: { user: ChatMessageAction[]; assistant:
//    (ChatMessageAction | 'speak')[] }` — two ordered arrays, one per role,
//    mirroring the component tier's own per-message role split rather than
//    inventing a construct-level concept the component doesn't have.
// UserActionId/AssistantActionId/the two catalogs/their defaults/
// SPEAK_CUSTOM_ACTION/ActionRowPicker moved to `components/builder-message-
// actions.tsx` (T-1 build-out cross-cutting refactor) so the Assistant and
// Research templates can reuse the same role-scoped, ordered picker instead
// of forking it. See that module's own doc comment for the full model.

const ACTIONS_REVEAL_OPTIONS = [
  { value: 'always' as const, label: 'Always visible' },
  { value: 'hover' as const, label: 'On hover' },
];

const RAIL_SIDE_OPTIONS: readonly RadioOption<'start' | 'end'>[] = [
  { value: 'start', label: 'Start', description: 'Docked left' },
  { value: 'end', label: 'End', description: 'Docked right' },
];

const stubMessages: ChatMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Deploy payments to production' }] },
  {
    id: 'm2',
    role: 'assistant',
    parts: [{ type: 'text', text: 'Which region, and do you have a change ticket?' }],
  },
];

const DEFAULT_CONSTRUCT: BuilderConstruct = {
  name: 'ops-console',
  layout: 'aside',
  provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
  header: { title: 'Ops Console' },
  theme: { accent: '#0ea5e9', mode: 'system' },
  capabilities: {
    starters: ['Deploy payments to production', 'Check the canary status'],
    attachments: { accept: ['image/*', 'application/pdf'] },
    history: { persistence: 'local' },
  },
  cards: [
    {
      name: 'deployment_parameters',
      schema: {
        type: 'object',
        title: 'Deployment parameters',
        required: ['region', 'ticket'],
        properties: {
          region: {
            type: 'string',
            title: 'Region',
            description: 'Where the new revision lands first.',
            enum: ['us-east-1', 'us-west-2', 'eu-west-1'],
            default: 'us-east-1',
            'x-kai-widget': 'select',
          },
          ticket: {
            type: 'string',
            title: 'Change ticket',
            description: 'CHG-#### from the change calendar. Shaped as you type.',
            pattern: '^CHG-[0-9]{4}$',
            'x-kai-placeholder': 'CHG-4821',
            'x-kai-format': 'custom',
            'x-kai-mask': 'CHG-####',
            'x-kai-mask-guide': 'CHG-####',
          },
        },
        'x-kai-order': ['region', 'ticket'],
        'x-kai-submitLabel': 'Draft the approval',
      },
    },
  ],
};

// Skeleton-tint helpers (mix/SkeletonBar/StubStatTile/StubNavRow/
// StubTableRow) moved to `components/builder-skeleton.tsx` (T-1 build-out
// cross-cutting refactor) — every template's preview host now shares one
// wordless-skeleton definition. See that module's doc comment for the
// PLAIN-inline-CSS-over-Tailwind-arbitrary-classes rationale (a real
// Tailwind JIT non-determinism found live during Round A2, reproduced
// exactly the same way for a brand-new file/class combination).

/**
 * The In-app assistant template's preview: a desktop-app-scale host frame
 * (a wordless top bar, a left nav rail, a content area of stat tiles over a
 * data table — all skeleton shapes, zero copy) with the chat docked as an
 * aside rail at codegen's own fixed 380px — this shape IS the template's
 * whole identity (the blueprint card's promise in `Labs/Builder/Start`), so
 * unlike Support widget's floating card there's no alternate framing to
 * switch to and no launcher/FAB chrome (T-1: this is widget-only chrome,
 * docked rather than floating).
 *
 * Owner feedback (Round A2, two passes):
 *  1. The old preview read as a widget, not a host app — the "host" was two
 *     placeholder blocks at a widget-adjacent 900px frame, with the 380px
 *     rail nearly half that width. Fixed by giving the host real chrome
 *     shape (top bar / nav rail / content) at desktop-app scale, so the
 *     rail reads as roughly a quarter of the frame instead of half.
 *  2. That first pass still spelled out words on the host side — an app
 *     name, nav labels ("Overview"/"Deployments"/…), table column headers
 *     ("Service"/"Region"/…) — which competes with the chat rail for
 *     attention. The owner's correction: the host should be the PRESENCE
 *     of an application, not an imitation of one. Every host-side label
 *     below is now a skeleton shape (a bar, a block, a dot) — bars/blocks/
 *     circles ONLY, the same toneless language `StubNavRow`/`StubTableRow`/
 *     `StubStatTile` already used elsewhere in this file, extended to the
 *     top bar and the table's header row too. The chat rail is the only
 *     place real words appear (the header title, the stub messages, the
 *     starters) — same accent-pop reasoning as the grayscale/muted host
 *     chrome itself, just extended to content, not only color.
 *  3. The frame is sized to fill the available preview canvas with
 *     comfortable padding, not a fixed pixel box — `height: 'calc(100vh -
 *     9rem)'`, `width: 'calc(100vw - 27rem)'` (see `frameStyle`'s own
 *     comment for why this is PLAIN inline CSS, not a Tailwind `h-[...]`/
 *     `w-[...]` arbitrary-value class) accounts for `BuilderLayout`'s
 *     toolbar height and its 360px inspector rail, landing the frame
 *     full-bleed-with-margin inside `BuilderLayout`'s own `main` (which
 *     already centers with `p-10`) the way the Support widget rounds'
 *     framing did, rather than floating a small fixed box in a mostly-
 *     empty canvas.
 *
 * The accent style lives on the OUTER frame (not just the rail) for the
 * same reason `Labs/Builder/Support widget`'s preview moved its own accent
 * style outward (Round A, live): anything outside the rail's own subtree —
 * were this template ever to grow accented chrome elsewhere — needs the
 * same accented scope, not a second copy of the style prop.
 *
 * `mic`/`userActions`/`assistantActions`/`actionsReveal`/`railSide` are the
 * preview-only knobs (see the module doc comment's T-5 list above
 * `stubMessages`, and the Round A3 note for the role-scoped action pair) —
 * plain signals, not `BuilderConstruct` fields. `userActions`/
 * `assistantActions` are each already fully resolved, ORDERED arrays
 * (`ChatMessageAction | CustomAction`, in the order they should render) —
 * this component just assigns each to its own role's message, it doesn't
 * know about the picker's row/catalog shape.
 */
function InAppAssistantPreview(props: {
  construct: BuilderConstruct;
  mic: boolean;
  userActions: ChatMessageAction[];
  assistantActions: (ChatMessageAction | CustomAction)[];
  actionsReveal: 'always' | 'hover';
  railSide: 'start' | 'end';
  slashTriggers: TriggerGroupState;
  mentionTriggers: TriggerGroupState;
  viewport: BuilderViewport;
}): JSX.Element {
  // `height`/`width` are set as plain inline CSS, not Tailwind arbitrary-
  // value classes (`h-[calc(...)]`) — this Storybook dev server's Tailwind
  // JIT pass proved non-deterministic for FRESH arbitrary values during
  // this round (a `w-[1600px]` utility rule was present in one fetch of
  // the generated stylesheet and absent from the very next, seconds apart,
  // with no source change between them), so a class-based size silently
  // fell back to auto/content-sized more often than not while still
  // showing the "right" className in the DOM. Plain inline CSS has no JIT
  // step to race, so `calc(100vh - 9rem)` here needs no Tailwind
  // whitespace-escape trick either — it's real CSS, not a class name.
  const frameStyle = createMemo(() => ({
    ...resolveAccentWrapperStyle(props.construct.theme),
    height: 'calc(100vh - 9rem)',
    width: 'calc(100vw - 27rem)',
    'max-width': '100%',
  }));
  const previewMessages = createMemo<ChatMessage[]>(() =>
    stubMessages.map((m) => {
      if (m.role === 'user') return { ...m, actions: props.userActions.length ? props.userActions : undefined };
      if (m.role === 'assistant') {
        return { ...m, actions: props.assistantActions.length ? props.assistantActions : undefined };
      }
      return m;
    }),
  );

  const Host = (): JSX.Element => (
    <div class="flex min-w-0 flex-1 flex-col bg-background">
      {/* top bar: skeleton logo mark + a row of nav-pill bars — wordless */}
      <div
        class="flex h-14 shrink-0 items-center gap-6 border-b border-border px-5"
        style={{ 'background-color': mix('--color-muted', 30) }}
      >
        <div class="flex items-center gap-2">
          <span
            aria-hidden="true"
            class="size-5 shrink-0 rounded-full"
            style={{ 'background-color': mix('--color-muted-foreground', 30) }}
          />
          <SkeletonBar widthClass="w-20" heightClass="h-2.5" pct={25} />
        </div>
        <div class="flex items-center gap-3">
          <SkeletonBar widthClass="w-12" pct={15} />
          <SkeletonBar widthClass="w-16" pct={15} />
          <SkeletonBar widthClass="w-10" pct={15} />
          <SkeletonBar widthClass="w-14" pct={15} />
        </div>
      </div>
      <div class="flex min-h-0 flex-1">
        {/* left nav rail, grayscale, already wordless */}
        <div
          class="flex shrink-0 flex-col gap-1 border-r border-border p-3"
          style={{ width: '200px', 'background-color': mix('--color-muted', 10) }}
        >
          <StubNavRow active />
          <StubNavRow />
          <StubNavRow />
          <StubNavRow />
          <StubNavRow />
        </div>
        {/* content area: skeleton stat tiles + a skeleton table, reading as
            the PRESENCE of a real product screen rather than any of its
            actual copy */}
        <div class="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-5">
          <div class="grid shrink-0 grid-cols-3 gap-3">
            <StubStatTile class="h-20" />
            <StubStatTile class="h-20" />
            <StubStatTile class="h-20" />
          </div>
          <div
            class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border"
            style={{ 'background-color': mix('--color-surface', 30) }}
          >
            <div class="flex items-center gap-4 border-b border-border px-3 py-2.5" style={{ 'background-color': mix('--color-muted', 20) }}>
              <SkeletonBar width="18%" pct={20} />
              <SkeletonBar width="28%" pct={20} />
              <SkeletonBar width="14%" pct={20} />
              <SkeletonBar flex pct={20} />
            </div>
            <StubTableRow />
            <StubTableRow />
            <StubTableRow />
            <StubTableRow />
            <StubTableRow />
          </div>
        </div>
      </div>
    </div>
  );

  // Mirrors codegen.ts's own `emitLayoutOpen` for `layout: 'aside'`, which
  // ships this EXACT breakpoint (`@media (max-width: 480px) {
  // [data-kai-layout="aside"] { inset: 0; width: auto; height: auto;
  // border-inline-start: 0; } }`) — a real emitted aside construct already
  // takes the full viewport under 480px, so the preview's `mobile` chip
  // (390px, checked against the SAME source before assuming there was
  // nothing to mirror) reproduces that shape rather than inventing one:
  // the rail fills the frame, and its border-inline-start comes off exactly
  // as codegen's own rule drops it. `tablet` (768px) is well above 480px,
  // so it gets no special treatment — same as a real construct wouldn't.
  const isMobile = createMemo(() => props.viewport === 'mobile');

  const Rail = (): JSX.Element => (
    <div
      class={cn(
        'flex shrink-0 flex-col bg-background',
        !isMobile() && (props.railSide === 'start' ? 'border-r border-border' : 'border-l border-border'),
      )}
      style={{ width: isMobile() ? '100%' : '380px' }}
    >
      <ChatThread
        class="h-full"
        messages={previewMessages()}
        chatTitle={props.construct.header?.title}
        suggestions={props.construct.capabilities?.starters}
        voice={props.mic}
        actionsReveal={props.actionsReveal}
        triggers={buildTriggerDefs(props.slashTriggers, props.mentionTriggers)}
        onSubmit={() => {}}
      />
    </div>
  );

  return (
    <div
      class="flex overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      style={frameStyle()}
      data-builder-aside-frame
      data-builder-viewport={props.viewport}
    >
      {isMobile() ? (
        // codegen's own <=480px rule: the aside goes `inset: 0`, taking the
        // full page — nothing of the host page is visible behind it. `Host`
        // is not rendered at all here, not just visually covered, since
        // there is no real overlay/stacking context to hide it behind in
        // this stub frame.
        <Rail />
      ) : props.railSide === 'start' ? (
        <>
          <Rail />
          <Host />
        </>
      ) : (
        <>
          <Host />
          <Rail />
        </>
      )}
    </div>
  );
}

/**
 * The Round A2 preview-only knobs, appended below `BuilderPanel` — see the
 * module doc comment's T-5 list for what each one is missing from
 * `construct.v1` today. Deliberately styled to match `BuilderPanel`'s own
 * Section/Field/Row rhythm (`components/builder-panel.tsx`'s local
 * helpers, not exported, so the small class duplication here is the
 * honest cost of these three living OUTSIDE the shared panel rather than
 * inside it — they aren't real construct fields and don't belong in a
 * component every other template's story also renders).
 */
// ActionRowPicker moved to `components/builder-message-actions.tsx` (T-1
// build-out cross-cutting refactor) — imported above.

function PreviewOnlyControls(props: {
  mic: boolean;
  onMicChange: (v: boolean) => void;
  userActionRows: ActionRowState<UserActionId>[];
  onUserActionRowsChange: (v: ActionRowState<UserActionId>[]) => void;
  assistantActionRows: ActionRowState<AssistantActionId>[];
  onAssistantActionRowsChange: (v: ActionRowState<AssistantActionId>[]) => void;
  actionsReveal: 'always' | 'hover';
  onActionsRevealChange: (v: 'always' | 'hover') => void;
  railSide: 'start' | 'end';
  onRailSideChange: (v: 'start' | 'end') => void;
  slashTriggers: TriggerGroupState;
  onSlashTriggersChange: (v: TriggerGroupState) => void;
  mentionTriggers: TriggerGroupState;
  onMentionTriggersChange: (v: TriggerGroupState) => void;
}): JSX.Element {
  return (
    <div class="flex flex-col divide-y divide-border text-sm text-foreground" data-builder-preview-only-controls>
      <section class="flex flex-col gap-3 border-b border-border p-4">
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Composer</h3>
        <div class="flex items-center justify-between gap-3">
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
          Preview-only — not yet a construct field. See this file's own module doc comment (T-5). Triggers are available but OFF by
          default here (owner's default matrix: end-user-facing shapes start off).
        </p>
      </section>
      <section class="flex flex-col gap-3 border-b border-border p-4">
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Messages</h3>
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
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs font-medium text-foreground">Reveal</span>
          <Select
            aria-label="Actions reveal"
            options={ACTIONS_REVEAL_OPTIONS}
            value={props.actionsReveal}
            onChange={(e) => props.onActionsRevealChange(e.currentTarget.value as 'always' | 'hover')}
          />
        </div>
        <p class="text-xs text-muted-foreground">
          Actions are role-scoped and ordered, mirroring the kit's real
          per-message `actions` array — never a flat toggle set. Preview-only
          — not yet a construct field (T-5).
        </p>
      </section>
      <section class="flex flex-col gap-3 p-4">
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rail placement</h3>
        <RadioGroup<'start' | 'end'>
          options={RAIL_SIDE_OPTIONS}
          value={props.railSide}
          label="Rail placement"
          onChange={props.onRailSideChange}
        />
        <p class="text-xs text-muted-foreground">
          Preview-only — not yet a construct field (T-5).
        </p>
      </section>
    </div>
  );
}

function InAppAssistantBuilderDemo(): JSX.Element {
  const [construct, setConstruct] = createSignal<BuilderConstruct>(DEFAULT_CONSTRUCT);
  const [mic, setMic] = createSignal(false);
  const [userActionRows, setUserActionRows] = createSignal<ActionRowState<UserActionId>[]>(DEFAULT_USER_ACTION_ROWS);
  const [assistantActionRows, setAssistantActionRows] =
    createSignal<ActionRowState<AssistantActionId>[]>(DEFAULT_ASSISTANT_ACTION_ROWS);
  const [actionsReveal, setActionsReveal] = createSignal<'always' | 'hover'>('always');
  const [railSide, setRailSide] = createSignal<'start' | 'end'>('end');
  // Owner's default matrix (composer.triggers): available but OFF by
  // default for In-app assistant (an end-user-facing shape, unlike
  // Workspace/Multi-mode).
  const [slashTriggers, setSlashTriggers] = createSignal<TriggerGroupState>({ enabled: false, entries: DEFAULT_SLASH_ENTRIES });
  const [mentionTriggers, setMentionTriggers] = createSignal<TriggerGroupState>({ enabled: false, entries: DEFAULT_MENTION_ENTRIES });
  const [viewport, setViewport] = createSignal<BuilderViewport>('desktop');

  // Resolve each role's row state into the ORDERED array the component tier
  // actually takes — filtering to enabled rows, in row order, mapping the
  // proposed `speak` row to a real `CustomAction` (never a fake `speak`
  // `ChatMessageAction`, since that id doesn't exist in the kit today).
  const userActions = createMemo<ChatMessageAction[]>(() =>
    userActionRows()
      .filter((r) => r.enabled)
      .map((r) => r.id),
  );
  const assistantActions = createMemo<(ChatMessageAction | CustomAction)[]>(() =>
    assistantActionRows()
      .filter((r) => r.enabled)
      .map((r) => (r.id === 'speak' ? SPEAK_CUSTOM_ACTION : r.id)),
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
              sections={{ layout: false, widget: 'never', provider: true, home: false, cards: true }}
            />
            <PreviewOnlyControls
              mic={mic()}
              onMicChange={setMic}
              userActionRows={userActionRows()}
              onUserActionRowsChange={setUserActionRows}
              assistantActionRows={assistantActionRows()}
              onAssistantActionRowsChange={setAssistantActionRows}
              actionsReveal={actionsReveal()}
              onActionsRevealChange={setActionsReveal}
              railSide={railSide()}
              onRailSideChange={setRailSide}
              slashTriggers={slashTriggers()}
              onSlashTriggersChange={setSlashTriggers}
              mentionTriggers={mentionTriggers()}
              onMentionTriggersChange={setMentionTriggers}
            />
          </>
        }
        preview={
          <InAppAssistantPreview
            construct={construct()}
            mic={mic()}
            userActions={userActions()}
            assistantActions={assistantActions()}
            actionsReveal={actionsReveal()}
            railSide={railSide()}
            slashTriggers={slashTriggers()}
            mentionTriggers={mentionTriggers()}
            viewport={viewport()}
          />
        }
        viewport={viewport()}
        onViewportChange={setViewport}
      />
    </div>
  );
}

const meta = { title: 'Labs/Builder/In-app assistant', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj;

/**
 * The In-app assistant template's builder: panel on the left scoped to
 * exactly this template's controls (Identity, Provider, Theme, Capabilities
 * — starters/attachments/history/conversations — and a read-only Cards
 * section listing the construct's declared cards, plus — Round A2, reshaped
 * in Round A3 — preview-only knobs below the panel: Composer/Microphone,
 * Messages (two role-scoped, ordered, reorderable action pickers — "Your
 * messages" and "Assistant messages" — plus a Reveal always/hover select),
 * Rail placement; see `PreviewOnlyControls`'s own doc comment, `ActionRow
 * Picker`'s, and the module doc comment's T-5/Round-A3 notes for what each
 * is missing from `construct.v1` today), a live preview on the right
 * showing the chat
 * docked beside a wordless, desktop-app-scale skeleton of the rest of your
 * app. No Home section (this template has no Home/Messages tab concept —
 * `home` is a widget-chrome-lineage field, not one this template's own
 * fixture ever sets) and no Widget-chrome section (that's `layout:
 * 'widget'`-only, and this template is fixed to `layout: 'aside'`, T-2).
 *
 * Edit the accent and watch the whole frame — nav-rail stand-in border,
 * chat rail border, thread accents, send button — retint together (the
 * accent-cascade fix landed the same round this story did: both the public
 * `--kai-color-primary` and internal `--color-primary` tokens are set on
 * this preview's outer wrapper, not just the rail's own subtree).
 */
export const InAppAssistant: Story = {
  render: () => <InAppAssistantBuilderDemo />,
};
