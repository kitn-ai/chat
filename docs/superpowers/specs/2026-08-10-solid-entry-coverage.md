# Solid entry coverage: what `@kitn.ai/ui/solid` would actually contain

Status: analysis, no code shipped. Nothing was added to the exports map, no entry was created,
and the generator described in §8 is not wired into the build.

## 0. The question

Solid consumers today import the SolidJS components straight from the root entry
(`examples/starters/solid/src/App.tsx` does exactly this). The decision on the table is whether to
promote that into a documented, versioned `@kitn.ai/ui/solid` entry. Rob's governing constraint:
framework docs must be consistent — same catalog, same capabilities, only the syntax differs. A
developer must never find a capability documented for one framework and silently absent for
another. Applied here: **every registered element needs a documented Solid usage**, not necessarily
1:1, but every catalog entry must map to something a Solid developer can write.

This report answers what the surface actually is.

## 1. The counts

79 registered elements (`packages/ui/src/elements/element-meta.json`), 212 runtime value exports
and 162 type exports on the root entry.

| Verdict | Count | Meaning |
| --- | --- | --- |
| DIRECT | **32** | one public Solid component reproduces the element |
| COMPOSITION | **14** | 2+ public exports reproduce it, nothing private involved |
| GAP | **33** | the element renders at least one Solid component that is not reachable from any public entry |

GAP splits into **28 total** (nothing public to write at all) and **5 partial** (a public subset
exists, capability silently missing). Coverage is **46/79 = 58%**.

The verdict rule is deliberately sharp and is the one Rob's constraint implies: *an element is
covered only if its entire rendered Solid surface is publicly importable.* Partial coverage is a
capability documented for elements and absent for Solid, so it counts as a gap.

Three rows need a human footnote on top of the derived verdict (§6.3); correcting them gives
**33 / 14 / 32**.

## 2. How the numbers were derived (not typed)

`packages/ui/scripts/proposed-solid-coverage.mjs` (committed, PROPOSED, not wired into the build):

- **catalog** — `src/elements/element-meta.json`, the 79 registered elements.
- **surface** — the exports of `src/index.ts` resolved through the TypeScript checker, intersected
  with the runtime keys of the built `dist/index.server.js`. A source export that does not survive
  the build is not public. Both sets are 212 names and agree exactly.
- **usage** — for each `defineWebComponent(...)` call, every JSX tag inside its render function,
  resolved tag → declaring module by the checker, recursing through element-local helper
  components. Elements that render no kit component (`kai-icon`, `kai-remote`,
  `kai-resizable-item`) fall back to the non-JSX kit bindings they import and call.
- **cost** — private components are expanded into whatever *they* render, so "public pieces" is the
  number of public components a consumer must compose to rebuild the element.
- **gap price** — for every missing symbol, whether it is already an export of its own module.

Nothing in the file is a hand-written mapping; the only literals are the kit's own layer directory
names. This matters because the repo has been bitten repeatedly by hand-written content inside
`gen-*.mjs` scripts that no compiler or drift check can see.

Run it with `cd packages/ui && node scripts/proposed-solid-coverage.mjs --json out.json` (needs a
build first, for the runtime cross-check).

**The generator was watched failing before it was trusted.** Commenting out
`export { Badge } from './ui/badge'` in `src/index.ts` flipped `kai-badge` from DIRECT to
`GAP/TOTAL  MISSING=[Badge]` and moved the totals to 31 / 14 / 34; restoring the line put them
back to 32 / 14 / 33. It reads the real export surface, not a copy of it.

## 3. Verification: imported and rendered, not grepped

A derived map is still a claim about a package nobody installed. So the whole map was checked
against a real consumer install of the packed tarball (`npm pack`, renamed to a unique filename so
npm could not serve a cached one, installed into a throwaway app with `solid-js`).

**96/96 checks passed.**

- **exists** — 14 DIRECT and 12 COMPOSITION mappings (26 rows, 60 distinct exports) destructured
  from `@kitn.ai/ui` and confirmed to be functions.
- **renders** — every one of those 26 rows rendered through Solid's SSR renderer
  (`renderToString`), producing non-empty HTML. The hand-composed `kai-thread` replacement produced
  388 chars; `kai-prompt-input` 5440.
- **gap proof** — 39 symbols claimed unreachable are `undefined` on the root entry, absent from
  `@kitn.ai/ui/state` and `@kitn.ai/ui/wire`, and there is no deep-import escape hatch:
  `@kitn.ai/ui/src/ui/nav`, `@kitn.ai/ui/dist/index.js` and `@kitn.ai/ui/components/thread` all
  fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`. A GAP here means genuinely unreachable, not "I could
  not find it".

Separately, the COMPOSITION snippets in §5 were written as **real JSX**, compiled with
`babel-preset-solid` (`generate: 'ssr'`) and rendered: **15/15 render non-empty**. They are not
plausible-looking code, they are executed code.

Two probe failures were found and were my errors, not the kit's: `Tool` takes `toolPart` (not
`part`), and `ModelSwitcher` renders nothing below two models. A third is a real finding, see §7.

Probe scripts and their output live in the session scratchpad
(`consumer/probe.mjs`, `consumer/snippets.jsx`, `consumer/run-snippets.mjs`); they were not
committed, since committing a throwaway consumer app is not useful. The generator was committed.

## 4. The map

"Public pieces" is the number of public components you must compose to rebuild the element,
counting through private components. It is a floor: it counts the *tree*, not the state, effects
and event wiring a private component also carries.

| Element | Verdict | Solid usage | Not reachable | Public pieces |
| --- | --- | --- | --- | --- |
| `kai-agent-card` | **GAP** (total) | — | `AgentCard` | 0 |
| `kai-artifact` | DIRECT | `Artifact` | — | 1 |
| `kai-attachments` | COMPOSITION | `Attachment` + `AttachmentEmpty` + `AttachmentHoverCard` + `AttachmentHoverCardContent` + `AttachmentHoverCardTrigger` + `AttachmentInfo` + `AttachmentPreview` + `AttachmentRemove` + `Attachments` | — | 9 |
| `kai-avatar` | DIRECT | `Avatar` | — | 1 |
| `kai-badge` | DIRECT | `Badge` | — | 1 |
| `kai-button` | DIRECT | `Button` | — | 1 |
| `kai-card` | DIRECT | `Card` | — | 1 |
| `kai-cards` | DIRECT | `CardFallback` | — | 1 |
| `kai-chain-of-thought` | **GAP** (total) | — | `ChainOfThoughtAccordion` | 5 |
| `kai-chat` | **GAP** (total) | — | `ChatThread` | 28 |
| `kai-checkpoint` | COMPOSITION | `Checkpoint` + `CheckpointIcon` + `CheckpointTrigger` | — | 3 |
| `kai-choice` | DIRECT | `ChoiceCard` | — | 1 |
| `kai-coachmark` | **GAP** (total) | — | `Coachmark` | 0 |
| `kai-code-block` | COMPOSITION | `ChatConfig` + `CodeBlock` + `CodeBlockCode` | — | 3 |
| `kai-command` | **GAP** (total) | — | `CommandList` | 0 |
| `kai-compare` | COMPOSITION | `ChatConfig` + `ResponseCompare` | — | 2 |
| `kai-composer` | **GAP** (total) | — | `Composer` | 0 |
| `kai-confirm` | DIRECT | `ConfirmCard` | — | 1 |
| `kai-context` | COMPOSITION | `Context` + `ContextCacheUsage` + `ContextContent` + `ContextContentBody` + `ContextContentFooter` + `ContextContentHeader` + `ContextInputUsage` + `ContextOutputUsage` + `ContextReasoningUsage` + `ContextTrigger` | — | 10 |
| `kai-conversations` | **GAP** (partial) | `ConversationList` | `CollapsedRail` | 2 |
| `kai-dialog` | **GAP** (total) | — | `Dialog` | 0 |
| `kai-editable-label` | **GAP** (total) | — | `EditableLabel` | 0 |
| `kai-embed` | DIRECT | `Embed` | — | 1 |
| `kai-empty` | COMPOSITION | `Empty` + `EmptyContent` + `EmptyDescription` + `EmptyHeader` + `EmptyMedia` + `EmptyTitle` | — | 6 |
| `kai-feedback-bar` | DIRECT | `FeedbackBar` | — | 1 |
| `kai-file-tree` | DIRECT | `FileTree` | — | 1 |
| `kai-file-upload` | COMPOSITION | `FileUpload` + `FileUploadTrigger` | — | 2 |
| `kai-form` | DIRECT | `Form` | — | 1 |
| `kai-hover-card` | **GAP** (total) | — | `HoverCardContent`, `HoverCardRoot`, `HoverCardTrigger` | 0 |
| `kai-icon` | **GAP** (total) | — | `renderIcon` | 0 |
| `kai-image` | DIRECT | `Image` | — | 1 |
| `kai-input` | **GAP** (total) | — | `Input` | 0 |
| `kai-kbd` | **GAP** (total) | — | `Kbd` | 0 |
| `kai-link-preview` | DIRECT | `LinkPreview` | — | 1 |
| `kai-loader` | DIRECT | `Loader` | — | 1 |
| `kai-markdown` | COMPOSITION | `ChatConfig` + `Markdown` | — | 2 |
| `kai-menu` | **GAP** (partial) | `Dropdown` + `DropdownContent` + `DropdownItem` + `DropdownTrigger` | `DropdownCheckboxItem`, `DropdownLabel`, `DropdownRadioItem`, `DropdownSeparator`, `DropdownSub`, `DropdownSubContent`, `DropdownSubTrigger`, `Kbd` | 4 |
| `kai-message` | COMPOSITION | `ChatConfig` + `Message` + `MessageAvatar` + `MessageBody` | — | 4 |
| `kai-model-switcher` | DIRECT | `ModelSwitcher` | — | 1 |
| `kai-nav` | **GAP** (total) | — | `Nav` | 1 |
| `kai-notice` | **GAP** (total) | — | `Notice` | 0 |
| `kai-pane` | **GAP** (total) | — | `Pane` | 0 |
| `kai-pane-group` | **GAP** (total) | — | `PaneGroup` | 0 |
| `kai-popover` | **GAP** (total) | — | `Popover` | 0 |
| `kai-progress-bar` | **GAP** (total) | — | `ProgressBar` | 0 |
| `kai-prompt-dock` | **GAP** (total) | — | `PromptDock` | 0 |
| `kai-prompt-input` | COMPOSITION | `Attachment` + `AttachmentInfo` + `AttachmentPreview` + `AttachmentRemove` + `Attachments` + `Button` + `PromptInput` + `PromptInputActions` + `PromptInputTextarea` + `PromptSuggestion` + `Tooltip` | — | 11 |
| `kai-reasoning` | COMPOSITION | `ChatConfig` + `Reasoning` + `ReasoningContent` + `ReasoningTrigger` | — | 4 |
| `kai-remote` | COMPOSITION | `emitCardEvent` + `mountRemoteCard` | — | 0 |
| `kai-resizable` | DIRECT | `ResizableHandle` | — | 1 |
| `kai-resizable-item` | **GAP** (partial) | `normalizeSize` | `clampBasis` | 0 |
| `kai-response-stream` | DIRECT | `ResponseStream` | — | 1 |
| `kai-scope-picker` | DIRECT | `ChatScopePicker` | — | 1 |
| `kai-screen` | **GAP** (total) | — | `Screen` | 0 |
| `kai-scroll-area` | DIRECT | `ScrollArea` | — | 1 |
| `kai-scroll-button` | DIRECT | `Button` | — | 1 |
| `kai-search` | **GAP** (partial) | `Loader` | `Input`, `Kbd` | 1 |
| `kai-segmented` | **GAP** (total) | — | `Segmented` | 0 |
| `kai-separator` | DIRECT | `Separator` | — | 1 |
| `kai-setting-item` | **GAP** (total) | — | `SettingItem` | 0 |
| `kai-settings-group` | **GAP** (total) | — | `SettingsGroup` | 0 |
| `kai-skeleton` | DIRECT | `Skeleton` | — | 1 |
| `kai-skills` | DIRECT | `MessageSkills` | — | 1 |
| `kai-source` | COMPOSITION | `Source` + `SourceContent` + `SourceTrigger` | — | 3 |
| `kai-sources` | COMPOSITION | `Source` + `SourceContent` + `SourceList` + `SourceTrigger` | — | 4 |
| `kai-status` | **GAP** (total) | — | `Status` | 0 |
| `kai-suggestions` | DIRECT | `PromptSuggestion` | — | 1 |
| `kai-switch` | **GAP** (total) | — | `Switch` | 0 |
| `kai-tabs` | **GAP** (total) | — | `Tabs` | 0 |
| `kai-tasks` | DIRECT | `TasksCard` | — | 1 |
| `kai-text-shimmer` | DIRECT | `TextShimmer` | — | 1 |
| `kai-thinking-bar` | DIRECT | `ThinkingBar` | — | 1 |
| `kai-thread` | **GAP** (total) | — | `Thread` | 9 |
| `kai-toast-region` | DIRECT | `ToastRegion` | — | 1 |
| `kai-tool` | DIRECT | `Tool` | — | 1 |
| `kai-tooltip` | DIRECT | `Tooltip` | — | 1 |
| `kai-voice-input` | DIRECT | `VoiceInput` | — | 1 |
| `kai-voice-output` | **GAP** (total) | — | `VoiceOutput` | 2 |
| `kai-workspace` | **GAP** (partial) | `ConversationList` + `ResizableHandle` + `ResizablePanel` + `ResizablePanelGroup` | `ChatThread`, `CollapsedRail` | 32 |

## 5. COMPOSITION snippets (all rendered)

Each of these was compiled from JSX with `babel-preset-solid` and rendered through `renderToString`
against the packed tarball. All 15 produce non-empty HTML.

```tsx
// kai-message
<ChatConfig>
  <Message>
    <MessageAvatar name="Ada" />
    <MessageBody parts={msg.parts} />
  </Message>
</ChatConfig>

// kai-thread — hand-composed, because there is no public Thread export
<ChatConfig proseSize="sm">
  <ChatContainer class="h-full">
    <ChatContainerContent>
      <For each={messages()}>{(m) => (
        <Message>
          <MessageAvatar name={m.role} />
          <MessageBody parts={m.parts} />
        </Message>
      )}</For>
      <ChatContainerScrollAnchor />
    </ChatContainerContent>
    <ScrollButton />
  </ChatContainer>
</ChatConfig>

// kai-empty
<Empty>
  <EmptyHeader>
    <EmptyMedia />
    <EmptyTitle>No conversations</EmptyTitle>
    <EmptyDescription>Start one below.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent><Button>New chat</Button></EmptyContent>
</Empty>

// kai-sources
<SourceList>
  <Source href="https://ui.kitn.ai">
    <SourceTrigger label={1} />
    <SourceContent title="AI/UI" description="Web components for AI chat" />
  </Source>
</SourceList>

// kai-reasoning
<ChatConfig>
  <Reasoning isStreaming={false}>
    <ReasoningTrigger />
    <ReasoningContent>Considering the options…</ReasoningContent>
  </Reasoning>
</ChatConfig>

// kai-prompt-input
<PromptInput value={value()} onValueChange={setValue} onSubmit={send}>
  <PromptInputTextarea placeholder="Send a message..." />
  <PromptInputActions>
    <PromptInputAction tooltip="Send"><Button size="icon-sm">↑</Button></PromptInputAction>
  </PromptInputActions>
</PromptInput>

// kai-code-block
<CodeBlock>
  <CodeBlockGroup>index.ts</CodeBlockGroup>
  <CodeBlockCode code="const a = 1" language="ts" />
</CodeBlock>

// kai-file-upload
<FileUpload onFilesAdded={add}>
  <FileUploadTrigger>Attach</FileUploadTrigger>
  <FileUploadContent>Drop files</FileUploadContent>
</FileUpload>

// kai-checkpoint
<Checkpoint>
  <CheckpointIcon />
  <CheckpointTrigger>Restore checkpoint</CheckpointTrigger>
</Checkpoint>

// kai-context
<Context usedTokens={1200} maxTokens={8000}>
  <ContextTrigger />
  <ContextContent>
    <ContextContentHeader />
    <ContextContentBody>
      <ContextInputUsage />
      <ContextOutputUsage />
    </ContextContentBody>
  </ContextContent>
</Context>

// kai-attachments
<Attachments>
  <Attachment data={{ id: '1', name: 'diagram.png', mediaType: 'image/png' }}>
    <AttachmentPreview />
    <AttachmentInfo />
    <AttachmentRemove />
  </Attachment>
</Attachments>

// kai-markdown — note `content`, not children
<ChatConfig proseSize="sm"><Markdown content={md} /></ChatConfig>

// kai-compare
<ChatConfig><ResponseCompare data={{ candidates: [...] }} /></ChatConfig>

// kai-cards
<CardRenderer envelope={envelope} />

// kai-loader
<Loader variant="typing" />
```

## 6. Every GAP, with evidence

Evidence for each: the symbol is `undefined` on the root entry in a real install (probe §3), absent
from `./state` and `./wire`, and unreachable by deep import. The "already exported" column is from
the checker — whether the symbol is an export of its own module, which prices the fix.

### 6.1 Total gaps — nothing a Solid developer can write (28)

| Element | Missing symbol | Module | Already exported by its module |
| --- | --- | --- | --- |
| `kai-chat` | `ChatThread` | `src/components/chat-thread.tsx` | yes |
| `kai-thread` | `Thread` | `src/components/thread.tsx` | yes |
| `kai-composer` | `Composer` | `src/components/composer.tsx` | yes |
| `kai-screen` | `Screen` | `src/components/screen.tsx` | yes |
| `kai-coachmark` | `Coachmark` | `src/components/coachmark.tsx` | yes |
| `kai-voice-output` | `VoiceOutput` | `src/components/voice-output.tsx` | yes |
| `kai-chain-of-thought` | `ChainOfThoughtAccordion` | `src/components/chain-of-thought.tsx` | yes |
| `kai-agent-card` | `AgentCard` | `src/ui/agent-card.tsx` | yes |
| `kai-command` | `CommandList` | `src/ui/command.tsx` | yes |
| `kai-dialog` | `Dialog` | `src/ui/dialog.tsx` | yes |
| `kai-popover` | `Popover` | `src/ui/popover.tsx` | yes |
| `kai-hover-card` | `HoverCardRoot`, `HoverCardTrigger`, `HoverCardContent` | `src/ui/hover-card.tsx` | yes (module does export the `HoverCard` convenience wrapper publicly — see below) |
| `kai-input` | `Input` | `src/ui/input.tsx` | yes |
| `kai-kbd` | `Kbd` | `src/ui/kbd.tsx` | yes |
| `kai-nav` | `Nav` | `src/ui/nav.tsx` | yes |
| `kai-notice` | `Notice` | `src/ui/notice.tsx` | yes |
| `kai-pane` | `Pane` | `src/ui/pane.tsx` | yes |
| `kai-pane-group` | `PaneGroup` | `src/ui/pane-group.tsx` | yes |
| `kai-progress-bar` | `ProgressBar` | `src/ui/progress-bar.tsx` | yes |
| `kai-prompt-dock` | `PromptDock` | `src/ui/prompt-dock.tsx` | yes |
| `kai-segmented` | `Segmented` | `src/ui/segmented.tsx` | yes |
| `kai-setting-item` | `SettingItem` | `src/ui/settings-group.tsx` | yes |
| `kai-settings-group` | `SettingsGroup` | `src/ui/settings-group.tsx` | yes |
| `kai-status` | `Status` | `src/ui/status.tsx` | yes |
| `kai-switch` | `Switch` | `src/ui/switch.tsx` | yes |
| `kai-tabs` | `Tabs` | `src/ui/tabs.tsx` | yes |
| `kai-editable-label` | `EditableLabel` | `src/ui/editable-label.tsx` | yes |
| `kai-icon` | `renderIcon` | `src/ui/icon.tsx` | yes (a function, not a component) |

`kai-hover-card` is the one nuance: the module's `HoverCard` wrapper (`trigger` + children) *is*
public, so the basic hover card is writable; the controlled Root/Trigger/Content form the element
uses is not. It is listed as a total gap because the element's own composition is unreachable.

### 6.2 Partial gaps — a public subset, capability silently missing (5)

| Element | Public today | Missing | What a Solid developer loses |
| --- | --- | --- | --- |
| `kai-workspace` | `ConversationList`, `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` | `ChatThread`, `CollapsedRail` | the entire chat pane and the collapsed sidebar rail — the shell without its contents |
| `kai-menu` | `Dropdown`, `DropdownTrigger`, `DropdownContent`, `DropdownItem` | `DropdownSeparator`, `DropdownLabel`, `DropdownCheckboxItem`, `DropdownRadioItem`, `DropdownSub`, `DropdownSubTrigger`, `DropdownSubContent`, `Kbd` | separators, group labels, checkbox/radio items, submenus, shortcut hints — a flat menu only |
| `kai-conversations` | `ConversationList` | `CollapsedRail` | the collapsed-rail variant |
| `kai-search` | `Loader` | `Input`, `Kbd` | the search field itself; only the spinner is reachable |
| `kai-resizable-item` | `normalizeSize` | `clampBasis` | see §6.3 — this row is a false positive |

### 6.3 Three rows where the derived verdict needs a human footnote

The generator names the component a facade *renders*, which is right structurally and wrong
nominally in three places. These are limits of the derived rule, stated rather than papered over:

- `kai-resizable-item` — the facade is a light-DOM marker that renders nothing; it reads
  `clampBasis`. The real Solid analogue is `ResizablePanel`, which **is** public. Should be DIRECT.
- `kai-resizable` — the facade renders only `ResizableHandle`; the documented Solid usage is
  `ResizablePanelGroup` + `ResizablePanel` + `ResizableHandle`. Verdict (covered) is right, the
  name is incomplete.
- `kai-scroll-button` — the facade renders `Button` plus inline scroll logic; the true counterpart
  is the public `ScrollButton`. Verdict (covered) is right, the name is wrong.

Correcting `kai-resizable-item` gives the adjusted counts **33 DIRECT / 14 COMPOSITION / 32 GAP**.

## 7. The granularity cost, with real numbers

`kai-chat` is one element. Rebuilding it in Solid from public parts takes **28 public components**:

```
Attachment, AttachmentInfo, AttachmentPreview, AttachmentRemove, Attachments, Button, ChatConfig,
ChatContainer, ChatContainerContent, ChatContainerScrollAnchor, Context, ContextContent,
ContextContentBody, ContextContentFooter, ContextContentHeader, ContextInputUsage,
ContextOutputUsage, ContextTrigger, Message, MessageAvatar, MessageBody, ModelSwitcher, PromptInput,
PromptInputActions, PromptInputTextarea, PromptSuggestion, ScrollButton, Tooltip
```

Worst ratios (element : public components needed):

| Element | Public pieces | Note |
| --- | --- | --- |
| `kai-workspace` | **32** | plus `ChatThread` and `CollapsedRail`, which are not reachable at all |
| `kai-chat` | **28** | `ChatThread` not reachable |
| `kai-prompt-input` | 11 | fully covered |
| `kai-context` | 10 | fully covered |
| `kai-thread` | **9** | `Thread` not reachable |
| `kai-attachments` | 9 | fully covered |
| `kai-empty` | 6 | fully covered |

And the number is a **floor**. It counts the component tree only. `ChatThread` also owns
stick-to-bottom scroll, the message-action bar and its feedback state (`createMessageFeedback`,
also private), attachment staging, suggestion mode and slot detection. None of that is expressed by
composing 28 children — it has to be rewritten.

### The starter is the proof

Total lines are a wash — 377 for the Solid starter (2 files), 394 for the React one (11 files). The
cost is not spread evenly; it is concentrated in the thread. In React the thread is
`ThreadView.tsx`, **40 lines around one element**:

```tsx
<Thread className="thread" theme={theme} messages={withActions} onMessageAction={…} />
```

That is a 15-line JSX return (lines 25–39 of `ThreadView.tsx`). The Solid equivalent in
`App.tsx` is **56 lines of JSX using 8 distinct kit components** (lines 267–322): `ChatContainer`,
`ChatContainerContent`, `ChatContainerScrollAnchor`, `Message`, `MessageContent`, `MessageActions`,
`Button` ×4, `ScrollButton`, plus `For`/`Show`. That is the ratio for the same region of the same
app: **1 element → 8 components, 15 lines → 56 lines**.

Two things the starter quietly loses, both consequences of hand-composing:

1. **The action buttons are dead.** Lines 285–296 render copy / thumbs-up / thumbs-down / refresh
   with no `onClick`. In `<Thread>` those actions are data (`actions: ['copy', …]`) and the element
   wires them.
2. **Non-text parts are dropped.** The starter renders `partsToText(msg.parts)` into
   `MessageContent`, flattening reasoning, tool and card parts to text. The public `MessageBody`
   does render parts properly — the starter just does not use it. The best available public API was
   not discoverable to whoever wrote the flagship Solid example. That is the strongest argument in
   this document that the surface needs documenting, not just exporting.

## 8. The reverse view: 41 public exports no element reaches

None of these is internal leakage that should be hidden. They fall into three groups:

**Loader variant shortcuts (12)** — `BarsLoader`, `CircularLoader`, `ClassicLoader`, `DotsLoader`,
`PulseLoader`, `PulseDotLoader`, `TerminalLoader`, `TextBlinkLoader`, `TextDotsLoader`,
`TextShimmerLoader`, `TypingLoader`, `WaveLoader`. Subsumed by `<Loader variant="…" />`, which
`kai-loader` exposes. Sugar; keep, do not document as separate capabilities.

**Card-contract constants (10)** — `CARD_CONTRACT_VERSION`, `CARD_EVENT_NAME`, `BUILTIN_CARD_TAGS`,
`BUILTIN_CARD_COMPONENTS`, `CONFIRM_CARD_TYPE`, `CHOICE_CARD_TYPE`, `TASKS_CARD_TYPE`,
`EMBED_CARD_TYPE`, `LINK_PREVIEW_TYPE`, `OTHER_ACTION`. Genuine public API for anyone authoring
generative-UI cards; element-independent by design.

**Undocumented capability with no element counterpart (19)** — `MessageContent`, `MessageActions`,
`MessageAction`, `MessageCopyButton`, `PromptInputAction`, `FileUploadContent`, `CodeBlockGroup`,
`ChatContainerRoot`, `ConversationItem`, `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`,
`Textarea`, `HoverCard`, `Resizable`, `Toast`, `CardProvider`, `CardRenderer`, `DismissedStub`.
These are real composition seams — the Solid starter uses `MessageContent` and `MessageActions`
today. A Solid entry would *add* capability beyond the element catalog here, which is fine as long
as the docs say so rather than leaving them to be discovered by reading `dist`.

## 9. A second gap: you can export a component without exporting its props

Of the 95 composable components reachable today, **42 ship no public `<Name>Props` type**. Verified
with `tsc --strict` against the shipped `dist/index.d.ts` in the consumer install: 18 claimed
present compile clean, 22 claimed absent all error (`TS2305` / `TS2724`).

Missing prop types include `MessageProps`, `ChatContainerProps`, `PromptInputProps`,
`MarkdownProps`, `SourceProps`, `CodeBlockProps`, `ScrollButtonProps`, `PromptSuggestionProps`,
`ModelSwitcherProps`, `ConversationListProps`, `VoiceInputProps`, `MessageSkillsProps`,
`TextShimmerProps`, `SeparatorProps`, `ScrollAreaProps`, `SkeletonProps`, `TooltipProps`,
`DropdownProps`, and the whole `ChainOfThought*` and `Context*Usage` families.

This is not theoretical. Writing the §5 snippets, `<Markdown>{md}</Markdown>` threw
`Cannot read properties of undefined (reading 'replace')` at render, because `Markdown` takes
`content`, not children — and `MarkdownProps` is not importable, so nothing told me. A documented
entry must export the props type beside every component it exports.

## 10. Recommendation

**The surface is not coherent enough to ship as `@kitn.ai/ui/solid` today — but it is one commit
away from being so.**

The evidence for "not today": 33 of 79 catalog entries have no writable Solid usage, including all
three flagship elements (`kai-chat`, `kai-thread`, `kai-workspace`) and 20 of the UI primitives
(`Input`, `Switch`, `Tabs`, `Dialog`, `Popover`, `Nav`, `Status`, `Segmented`, …). Publishing a
documented entry in that state directly violates the consistency constraint: React gets 79 typed
wrappers, 1:1 with the catalog; Solid would get 46 of 79 with no way to tell which.

The evidence for "one commit away": **all 33 gaps are closable by re-export alone.** The generator
checked every missing symbol against its own module's exports — every one is already
`export function X` / `export { X }`. There is no missing implementation, no new component to
write, no API to design. The gaps exist because `src/index.ts` was grown by hand, one feature at a
time, and nobody ever diffed it against the element registry.

Suggested sequence:

1. **Close the 33 gaps by re-export**, plus the 42 missing `<Name>Props` types. Mechanical.
2. **Add the drift guard.** Promote `scripts/proposed-solid-coverage.mjs` into a
   `verify:solid-coverage` check that fails when any element's Solid surface is unreachable. Derived
   from the registry, so a new element cannot ship Solid-uncovered. Watch it fail before trusting
   it: delete one export from `src/index.ts` and confirm the check goes red.
3. **Then create `./solid`**, re-exporting the (now complete) Solid surface, and generate the
   per-element Solid usage docs from the same coverage JSON that the guard consumes — so the docs
   cannot drift from the exports either.
4. **Decide the granularity story explicitly.** Even fully exported, `kai-chat` stays a 28-piece
   composition in Solid. `Thread` and `ChatThread` being public is what makes the Solid docs read
   like the other frameworks' — a one-component answer for a one-element question — and it is the
   difference between a documented entry and a bag of parts. This aligns with the
   composition-first direction already recorded for `kai-thread`.

Two risks worth naming before step 1:

- **SSR.** The gap components have never been imported under the `node` condition, since nothing in
  the root bundle references them. An AST scan of all 30 gap modules — every identifier outside a
  function, class or accessor body, against `document` / `window` / `navigator` / `localStorage` /
  `matchMedia` / `CSSStyleSheet` / `customElements` — found **0 module-scope browser globals**. That
  is a good sign, not a proof: it says nothing about what runs during render. `verify:ssr` must be
  re-run after the re-export, and it is exactly the guard that caught the equivalent bug in 0.19.0.
- **Bundle size.** The root entry is a single chunk. Adding 33 components grows it for every
  consumer, including React ones who never touch the Solid layer. If that matters, the re-export
  should land on `./solid` as its own build target rather than widening `.`.
