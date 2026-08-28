## Consolidated T-5 vocabulary-gap proposals (across all seven Labs/
Builder/<Template> rounds — for the owner to rule on once, per the
assignment)

1. **Message actions** (In-app assistant Round A3, reused by Assistant and
   Research): `capabilities.messageActions: { user: ChatMessageAction[];
   assistant: (ChatMessageAction | 'speak')[] }` — two ordered, role-scoped
   arrays, mirroring `ChatMessage.actions`'s own per-message shape. Also
   proposes adding `'speak'` to `ChatMessageAction` itself (kit-tier, not
   just construct-tier), backed by the existing `kai-voice-output` element.
2. **In-app assistant rail geometry** (Round A): `aside`-scoped `position:
   'start' | 'end'` and a width field — `layout: 'aside'` hardcodes both
   in `codegen.ts` today.
3. **Voice/mic capability** (In-app assistant Round A2, reused by
   Assistant/Voice): `capabilities.voice: boolean` — `ChatThread`'s own
   `voice` prop exists at the component tier with no construct-level
   switch.
4. **Assistant empty-state greeting** (Round R): `assistant.greeting: {
   title, subtitle }`, a non-widget sibling to the existing widget-lineage
   `home.greeting`.
5. **Persistent conversations rail** (Round R): widen
   `capabilities.conversations` from `boolean` to `boolean | { persistent:
   boolean }` — the existing field only ever names the two-state list/
   thread toggle `ChatThread`'s own `conversations` prop implements, not a
   permanently visible rail.
6. **Citation content** (Round S, unchanged): `source` message parts are
   real and wire-decodable today — no proposal needed there, just noting
   the content-vs-chrome line item 7 below draws on.
7. **Research answer layout — REFINED against the real Perplexity Labs
   anatomy** (Round S, then a full owner feedback round that replaced the
   original guess with the actual structure read from
   `elements/perplexity.stories.tsx`):
   - `capabilities.sources: { strip?: boolean }` — the sources strip's own
     visibility. The original "citation display: inline | strip | both"
     radio is RETIRED: Perplexity never treats inline chips and the strip
     as alternatives, it always shows both together, so a tri-state
     display-mode field would have modeled a choice that doesn't exist.
     Inline citations need no flag at all — they're the model's own
     output, not chrome, same boundary every other template's message
     content respects.
   - `capabilities.answerTabs: { enabled?: boolean; images?: boolean }` —
     the Answer/Sources/Images tab strip. Confirmed real in Perplexity
     (`kai-tabs variant="underline"`), not a taxonomy-audit guess anymore.
   - `capabilities.relatedQuestions: boolean` (unchanged from the original
     guess — confirmed real, Perplexity's own `kai-suggestions
     layout="list"` block).
   - `capabilities.media: boolean` — a genuinely NEW finding this round:
     Perplexity's answer carries a media/images strip the original guess
     never named.
   - The answer action toolbar (Copy/Rewrite/Share) needs no new
     vocabulary — it's the same `ChatMessageAction`/`CustomAction` surface
     every template already has at the component tier; the builder
     preview renders it as static buttons only because this round's
     answer is no longer message-shaped (see the story's own module doc
     comment for why), not because the kit lacks the vocabulary.
8. **Workspace template — pane, chrome, header, composer** (Round T, the
   design spec's own predicted ceiling; WIDENED after the Lovable/v0
   feedback round). `layout: 'split'` is real and construct-expressible
   today; everything below it is not:
   - **Pane content**: `capabilities.workSurface: { kind: 'artifact' |
     'preview' }` at minimum — a real pane likely needs more (which
     artifact, which URL to preview) than this round attempts to guess.
   - **Pane chrome** (modeled on Lovable's browser chrome + v0's expand):
     `capabilities.workSurface.chrome: { deviceToggle?: boolean; urlBar?:
     boolean; openInNewTab?: boolean; expand?: boolean; codeView?:
     boolean }` — each affordance independently optional, mirroring how
     this round made every toolbar piece a toggle. `expand` is backed by a
     REAL mechanism today at the component tier (`WorkspaceShell`'s
     controlled `startCollapsed`/`endCollapsed` — no new kit work needed,
     only a construct-level switch to turn it on/off for an emitted app).
   - **App header, wholesale** (owner feedback round, second header pass —
     widened from just `actions`). `header.title` stays real and reused
     as-is (no proposal needed there). Every OTHER header element is
     individually optional but the ARRANGEMENT is fixed and opinionated —
     this round built the real thing, not a config surface for placement:
     `header: { title?: boolean; search?: boolean; themeToggle?: boolean;
     user?: boolean; actions?: { label: string; variant: 'primary' |
     'secondary' | 'ghost' }[] }`. `search` and `user` mirror the two
     App-chrome switches every shell-bearing template already shares
     (`shell.commandPalette`/`shell.userMenu`, item 10a) rather than
     duplicating a second on/off pair — an emitted construct's `header`
     block would set the SAME two flags this template's shared shell
     state already needs. `themeToggle` is new: a real, working control at
     the PREVIEW tier already (this round wires it to `theme.mode` and a
     `.dark`-class scope on the frame, the same mechanism a real emitted
     widget's shadow root already resolves per-host) — the construct gap is
     only whether the BUTTON appears, not whether dark mode itself works.
     `actions` is unchanged in shape from the prior pass — ordered
     `{label, variant}` rows, Share/Deploy shipping as the stub DEFAULTS,
     not hardcoded buttons — but now sits behind its OWN presence toggle
     (`showActions` in this round's panel) distinct from the list being
     configured, so "no actions row at all" and "an empty actions row" are
     both real states a builder should be able to reach.
   - **Composer knobs, grouped under ONE key** rather than four scattered
     ones (per the owner's explicit instruction), WIDENED again after the
     composer-inventory + triggers round: `composer: { chips?: { label:
     string; value: string }[]; menu?: { label: string; icon?: string }[];
     triggers?: { slash?: { label: string; description?: string; icon?:
     string }[]; mention?: { label: string; description?: string; icon?:
     string }[] }; contextPills?: { label: string; value: string }[] }` —
     quick-fill chips, the v0-style `+` menu, the composer's `/`/`@`
     triggers, and Codex's real repo/branch-style context pills. Mic and
     attachments need NO new construct vocabulary: `capabilities.voice`
     (already proposed as item 3) and `capabilities.attachments` (already
     real) cover both.
   - **Triggers are backed by a REAL, already-shipped mechanism** —
     `components/composer.tsx`'s `ComposerProps.triggers?: TriggerDef[]`
     (`{ char, kind, items?: TriggerItem[] }`), which `ChatThread` already
     forwards end to end. No kit work is needed for this piece, only a
     construct-level switch — confirmed live: typing the configured
     character in a real, mounted preview composer opens the real trigger
     menu and inserts a real pill (`composer-triggers-open.png`). The
     `slashCommands`-as-flat-config shape this replaces was deliberately
     retired from the kit already, in favor of this trigger system —
     `composer.triggers` represents the shape that shipped, not the
     retired one.
   - **Default-on matrix** (controller-recommended, owner to confirm):
     Triggers default ON for Workspace and "Multi-mode" (item 10 below) —
     the agentic/dev-shaped templates, the Claude-Code/Codex precedent;
     available but OFF by default for Assistant and In-app assistant
     (end-user-facing, but a power user might still want them); not shown
     at all for Support widget and Voice v1 (their panels simply omit the
     Composer-Triggers subsection; they can gain it later, no schema
     blocker either way).
   - **Context pills** generalize to the dev/workspace-shaped templates
     only (Workspace, Multi-mode) — added to those two panels, not
     universally, since Support widget/Voice/Research have no repo-or-
     branch-shaped concept to pin.
   - **Inventoried but NOT built as a control**: Codex's real Ask/Code
     dual-button composer footer (`elements/codex.stories.tsx`) — a
     genuine second composer-mode-select pattern distinct from the
     existing model switcher, recorded honestly as unbuilt rather than
     silently dropped; a candidate for a future round if the owner wants
     it.
   - **Kit-tier gap, not a construct one**: `ChatThread` has no JSX prop
     for composer-toolbar injection (only `emptyContent` gets the JSX-form
     escape hatch a bare-Solid consumer needs; the composer's own
     `toolbar-start`/`toolbar-end` are light-DOM `<slot>`s, reachable only
     through the `kai-chat`/`kai-prompt-input` web-component facade).
     Proposal: `composerStart`/`composerEnd` JSX props on `ChatThread`,
     mirroring `emptyContent`'s pattern.
9. **Voice template, wholesale** (Round V; WIDENED after the owner's
   layout-reshape round). `construct.v1` still has zero voice keys.
   Reshaped to a workspace-like layout — a dockable, fully-collapsing
   transcript rail (default collapsed) beside the visualizer — which
   sharpens what the proposal actually needs:
   - `capabilities.voice: { in?: boolean; out?: boolean }` (unchanged from
     the original proposal, item 3's own key).
   - `capabilities.voice.transcript: { dockSide: 'start' | 'end';
     defaultOpen: boolean; textInput: boolean; download: boolean }` — the
     rail's dock side, whether it starts open or collapsed, whether typed
     input is offered alongside voice, and (owner feedback round) whether
     the rail header offers a download affordance for the transcript.
     `download` defaults true in this story — an export control is the kind
     of thing most real builds want on by default, unlike `open`'s
     honest-stub caveat below. A real emitted build owns the actual export
     FORMAT (this story's is a flat plain-text join, stated in the
     component's own doc comment as not the real thing) — the construct
     field only toggles the affordance, matching the same "kit decides HOW,
     app decides WHETHER" boundary as every other proposal here.
   - `capabilities.voice.header: { title: boolean }` or similar — the new
     optional minimal header (title only, off by default).
   - `capabilities.voice.talkMode: 'push' | 'space' | 'open'` (owner
     amendment, this round) — `push`/`space` are both real, wired
     interactions (a mouse press and a real Space-bar keydown/keyup pair,
     respectively); `open` is a HONEST STUB — no VAD/continuous-listening
     API exists anywhere in the kit today (checked `components/voice-
     input.tsx` and `primitives/use-voice-recorder.ts` before adding it),
     so this field names a real component-tier gap, not just a construct
     one: an `open` mode needs new kit work (a continuous-listen path on
     `VoiceInput`) before it could ever be more than an indicator UI.
   - **`Captions` is KIT work already done, not a proposal**:
     `components/captions.tsx` is a real, shipped, tested component (8
     unit tests, its own `Components/Primitives/Captions` story) — a
     live closed-captioning line, distinct from the transcript, reusing
     the kit's real `createPresence` exit-animation primitive. It feeds
     this vocabulary rather than waiting on it: an emitted Voice
     construct's transcript panel is what WOULD render `Captions` for the
     current utterance once this template's construct exists, but the
     component itself needs no schema work to exist and ship.
   Gated per T-1a on a genuine Labs voice-app surface existing before this
   template can appear on the real `Labs/Builder/Start` picker — unchanged
   by this round.
10. **"Multi-mode" — an entirely NEW template proposal, not a gap in an
    existing one** (owner discovery round). Extracted from
    `elements/perplexity-pro.stories.tsx`'s real segmented Assistant |
    Computer toggle, which swaps the whole rail + main view per mode —
    confirmed the one genuine match among three examples checked;
    `claude-code.stories.tsx`'s Home/Code tabs swap only the main view (a
    related but narrower shape), and `codex.stories.tsx` has no mode
    switch at all (checked and found not to apply — recorded rather than
    fabricated to fit the brief). Construct sketch: `modes: [{ id, label,
    shape: 'assistant' | 'workspace'; ...shape-specific fields }]`.
    Flagged as possibly the CONSTRUCT-VOCABULARY CEILING itself: each
    mode's `shape` would need to carry roughly a whole nested construct's
    worth of config (an assistant mode's starters/history/conversations
    vs. a workspace mode's pane/chrome/composer), which may be more than a
    flat `construct.v1` object can hold cleanly without a recursive/nested
    shape — an open question for the owner, not resolved here. Working
    name only (T-4); this template's card does not appear on the real
    `Labs/Builder/Start` picker until the owner names it and rules on the
    construct direction — the same kind of gate Voice's T-1a already set a
    precedent for.
10a. **Shell chrome — Command palette + User menu** (owner discovery round,
    added to Assistant/Workspace/Multi-mode; skipped for In-app assistant,
    Support widget, and Voice — a docked-rail or floating-widget or
    voice-first surface has no natural home for either, so their panels
    simply omit the section rather than showing a control that does
    nothing sensible). Both reuse REAL kit pieces, not new components:
    Command palette composes `ui/command.tsx`'s `CommandList` inside a
    hand-built overlay (the same shape `elements/claude-code.stories.tsx`'s
    own command-center overlay uses around `kai-command`); User menu is
    `elements/user-menu.stories.tsx`'s own documented RECIPE (`Dropdown` +
    `Avatar`), not a dedicated element. Construct sketch: `shell: {
    commandPalette?: boolean; userMenu?: { name, plan? } }` — genuinely
    lightweight compared to items 8/10, since both pieces already exist at
    the component tier; what's missing is only the construct-level on/off
    switch and the account identity a real emitted app would supply.
11. **Workspace variants — the second screen, DATA-ONLY, no schema impact**
    (owner-approved addition). `components/builder-workspace-variants.tsx`
    ships `WorkspaceVariantPicker`, a second step reachable from picking
    "Workspace" on `Labs/Builder/Start`: two function-named cards
    ("Artifact preview beside chat" / "App preview with device toggles"),
    reusing `BuilderStart`'s own `Card` pattern and blueprint-illustration
    language at the SAME scale as Step 1's cards (not a smaller one — owner
    correction, live review). A variant is a DIFFERENT STARTER CONSTRUCT
    within one template family — which panel defaults and stub content
    `WorkspaceBuilderDemo` seeds itself with — not new vocabulary: T-3's
    own rule ("a template is a starter construct, not vocabulary... the
    picker writes the starting JSON") already covers this one level down,
    so `construct.v1` needs nothing new for this screen to exist.
    "Switchable views" (item 10's Multi-mode mechanism) is NOT a third card
    here — decided and recorded in `builder-workspace-variants.tsx`'s own
    module doc comment: Multi-mode's mode-swap mechanism generalizes
    ACROSS template shapes (an `assistant` mode is as first-class as a
    `workspace` mode) rather than being a Workspace-specific starting
    point, and item 10 already flags `modes: [...]` as possibly the
    construct-vocabulary ceiling — a question bigger than "which starter
    construct to seed," which is all a variant is. Two cards shipped, not
    three.
