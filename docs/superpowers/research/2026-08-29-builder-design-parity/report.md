# Builder design-parity audit (2026-08-29)

Compares the ~20-round-iterated design contract (`Labs/Builder/*` Storybook
stories, `packages/ui/src/elements/builder*.stories.tsx`) against the real
shipped builder (`kai dev --builder` -> `src/builder-app/App.tsx` +
`src/components/builder-panel-derived.tsx`, driven by the template registry
in `src/agent-tooling/construct/templates.ts`). No fixes made -- this is the
gap list the owner asked for.

**Method:** Storybook (already running at :6006 on this checkout) captured
each `Labs/Builder/<Template>` story's panel top-to-bottom via Chrome
automation, in the story's own default theme (see per-template notes below
-- most stories do NOT force dark, unlike the real builder's dark-by-default
templates). Ran `nx build ui --skip-nx-cache` then `node bin/mcp.js dev
--builder` (port 4400, spawns a real generated project's Vite dev server on
4401) and drove the real Start screen + all 5 buildable templates' panels +
previews via "Switch template". Screenshots in `screenshots/`, prefixed
`story-*` (design) and `real-*` (shipped), paired by template.

## Cross-cutting gaps (all templates)

1. **Visual polish/chrome, not just missing fields.** The real derived
   panel (`builder-panel-derived.tsx`) reuses the design panel's
   `Section`/`Field`/`Row` primitives, so field-level styling (labels,
   spacing, switches) is close. But the *page-level* chrome around it is a
   plain unstyled sidebar-over-a-plain-`<div>` layout
   (`src/builder-app/App.tsx`) -- no card framing, no matched panel/canvas
   background, a hairline flush divider instead of the Storybook story's
   generously padded two-pane layout with a distinct light "canvas" behind
   the phone-sized preview. Side by side (`real-03-support-widget-panel-top.jpg`
   vs `story-02-support-widget-top.jpg`) the real one reads like a debug
   tool; the story reads like a product screen.
2. **Real Start screen has none of the story's branding.** Real
   (`real-01-start.jpg`) renders monochrome white-on-black outline icons, no
   accent color, on a plain dark background. The story (`story-01-start.jpg`)
   sets `--color-primary` to the AI/UI magenta directly (documented in the
   story itself as a deliberate one-off "brand it" -- the kit's own
   `--kai-color-primary` indirection doesn't resolve outside `:root`/`:host`,
   a pre-existing gap the story text already flags), uses colorful outline
   illustrations with pink accents/dots per card, and a clean centered
   6-card grid. This is a "no vocabulary needed" polish gap -- pure CSS/copy,
   not a schema question.
3. **"Switch template" is a cramped in-sidebar picker, not the Start
   screen.** Real (`real-04-switch-template-cramped.jpg`): the exact same
   6-card grid squeezed into the 280px panel column, cards clipped/wrapped
   badly (descriptions truncate off the right edge of the column). The
   design intent (per `builder-start.stories.tsx`'s own comments) is that
   Start IS meant to be the shared entry surface for the wizard/builder/
   commercial flow -- this in-panel picker looks like an oversight rather
   than a deliberate compact variant.
4. **An extra step the design never modeled: "Element name."** Picking a
   template in the real builder first shows a bare `Element name` /
   `Back` / `Create` screen (`real-02-elementname-step.jpg`) before landing
   on the panel -- needed because the real builder writes an actual
   construct file to disk and needs a name up front. No Storybook story
   models this step at all. Not a bug, just undocumented-by-the-design-
   contract; worth an explicit "intro" story if the panel design round
   continues.
5. **First paint after "Create" can show a broken preview.** The generated
   project's own `npm install` + Vite boot (spawned by `dev.ts`, port 4401)
   takes several seconds; the panel renders immediately but the preview
   iframe shows "localhost refused to connect" until that finishes and the
   page is reloaded/HMR catches up. Cosmetic/timing, not a panel-parity
   gap, but worth a loading state.
6. **Dark-by-default is inconsistently reflected in the STORIES, not the
   real build.** Per `templates.ts`'s own comment ("owner ruling, dark
   round"), every buildable starter except `widget` ships `theme.mode:
   'dark'`. The real builder honors this correctly (In-app assistant,
   Assistant, Research, Workspace all open in dark -- `real-05..08*.jpg`).
   The **design stories are stale here**: `builder-in-app-assistant.stories.tsx`
   and `builder-assistant.stories.tsx`'s own demo state renders light
   (`story-03-inapp-assistant-top.jpg`, `story-04-assistant-top.jpg`), predating
   that ruling. Not a real-builder defect -- flagging so nobody "fixes" the
   real builder to match a stale story.

## Per-template gap notes

### Support widget

- **Missing/rough:** live preview framing is a bare centered "This blank
  page stands in for your site" host page vs. the story's more realistic
  mockup context. No other structural gaps.
- **Present and correct:** Identity, Theme (accent/unread/mode), Header
  title, Home (greeting/links/recent-conversation), Capabilities incl.
  Reasoning/Reasoning open (kit-shipped after the story was authored),
  Widget chrome (position/launcher/open-by-default), Provider. Clicking the
  real launcher opens a widget whose Home tab / greeting / links / launcher
  position all match the design's intent (`real-03-support-widget-preview-open.jpg`).

### In-app assistant

- **Missing entirely from the real panel:** Cards (read-only card list),
  Composer (Microphone toggle, slash/mention Triggers), Message actions
  (Your/Assistant action pickers).
- **Correctly absent (design-only, no vocabulary):** Reveal mode, Rail
  placement -- the story itself labels these "Preview-only -- not yet a
  construct field (T-5)".
- **Open question for the owner:** Cards/Composer-triggers/Message-actions
  are NOT labeled design-only in the story text (only Reveal/Rail carry
  that label), and the vocabulary for messageActions and composer.triggers
  now EXISTS per the T-5 rulings (Workspace's template wires both
  successfully). `templates.ts`'s `inAppAssistant` controls array
  (`IDENTITY, THEME, HEADER, ASIDE, CAPABILITIES, PROVIDER`) simply never
  includes `MESSAGE_ACTIONS` or `COMPOSER_TRIGGERS`. This reads as a real
  registry gap, not a deferred-vocabulary case -- confirm whether it was
  deliberately scoped narrower, or is the "migrate the four template
  stories onto this panel" follow-up that `builder-panel-derived.tsx`'s own
  header comment names as recorded-but-not-done.
- **Present and correct:** Identity, Theme (dark-by-default correctly
  applied), Header title, Aside (position/width), Capabilities, Provider.

### Assistant

- **Missing entirely from the real panel:** App chrome (Command palette
  toggle, User menu name/plan) -- no SHELL section wired into this
  template's controls, same "adopted vocabulary, not wired to this
  template" pattern as above.
- **Correctly present, and correctly NOT a gap:** Empty-state title/
  description cover exactly what the story's own text mislabels
  "Preview-only -- construct.v1 has no assistant-level greeting field" --
  T-5 ruling #4 explicitly REJECTED a separate greeting field for this
  reason (`empty` already covers it), so the real panel's Empty-state
  section is the correct answer, not a miss.
- **Present and correct:** Identity, Theme, Header title, Empty state,
  Capabilities, Message actions (Edit/Copy per role, Like/Dislike/
  Regenerate/Read-aloud), Provider.

### Research

- **Real usability defect (not missing, but broken):** the Message actions
  list renders "Your messages" and "Assistant messages" as one flat,
  unlabeled list -- two `Copy` rows appear back-to-back with nothing
  distinguishing which role they belong to
  (`real-07-research-messageactions-bug.jpg`). The design story shows clear
  bold "Your messages"/"Assistant messages" group headers. The real
  `ActionRowPicker`'s `legend` prop apparently doesn't render a visible
  heading. Same component is reused for Assistant and Workspace, so this
  is a shared bug, not Research-specific (worth double-checking those two
  templates' live rendering too, though their screenshots read fine at the
  captured scroll position).
- **Present and correct:** Sources strip toggle (T-5 ADOPTED
  `capabilities.sources.strip`), Identity, Theme, Header, Capabilities incl.
  Reasoning, Message actions (content, modulo the label bug above),
  Provider.
- **Correctly absent (design-only, no vocabulary):** Answer/Sources/Images
  tabs, Media strip, Answer action toolbar, Related questions -- story
  explicitly labels these "Preview-only -- construct.v1 has no
  answer-layout vocabulary today (T-5)" (ruling #7 DEFERRED all three).

### Workspace

- **Single largest visual gap in the whole audit, but EXPECTED:** the
  entire work-surface pane is blank in the real preview. The design story
  renders a live rendered-output mock (a fake pricing-table card) beside
  the chat; the real preview is a single-column chat with nothing filling
  the split pane, because `layout: 'split'` + the `pane` slot is
  consumer-projected content and the builder itself renders nothing there.
  This is precisely T-5 ruling #8's "workSurface -- DEFER... the honest
  today-story" -- not a bug to fix.
- **Present and correct, and closely matches the design's intent:** Header
  chrome (title, Theme toggle, Actions row rendering Share as an outline
  button and Deploy as a filled/default button in the LIVE preview), Shell
  (Command palette toggle, User menu rendering as a real "AD" avatar in the
  header) -- see `real-08-workspace.jpg`. Also present: Identity, Theme,
  Composer-triggers, Capabilities, Message actions, Provider.
- **Correctly absent (design-only, no vocabulary):** work-surface pane
  content/kind (Preview vs Code radio, toolbar-chrome toggles for device/
  URL-bar/open-in-new-tab/expand/code-view), Composer menu (Attach image/
  Import from Figma/Import from URL), Quick-fill chips -- the story
  explicitly labels these "Preview-only -- construct.v1 has no
  work-surface/pane key" or no composer-menu mechanism (ruling #8 DEFERs
  workSurface and composer chips/menu/contextPills).

## Panel-code fixes vs "needs new vocabulary"

**Zero buildable-template gaps require new vocabulary.** Every section a
design story labels "Preview-only -- not yet a construct field (T-5)" is
correctly absent from the real panel (Reveal, Rail placement, work-surface
pane/toolbar chrome, composer menu/chips, answer-layout tabs/media/related-
questions). What remains breaks into three buckets, all panel-code/registry
work:

1. **Real bug (fix):** Research's (and likely Assistant/Workspace's, same
   shared component) message-actions rows show no visible role-group
   labels ("Your messages"/"Assistant messages") -- purely a rendering fix
   in `ActionRowPicker`/`builder-message-actions.tsx`.
2. **Registry-wiring gap worth an explicit owner call:** In-app assistant
   and Assistant's `templates.ts` `controls` arrays omit
   `MESSAGE_ACTIONS`/`COMPOSER_TRIGGERS`/`SHELL` sections even though the
   schema and panel machinery already support them (proven working on
   Workspace). This could be intentional per-template scoping or leftover
   from the "migrate the four template stories onto this panel" work that
   `builder-panel-derived.tsx`'s own header comment flags as recorded,
   not-yet-done follow-up -- needs an owner ruling before treating it as a
   bug.
3. **Polish-only (fix, no vocabulary involved):** page-level chrome
   (cross-cutting #1), Start screen branding (#2), Switch-template
   in-sidebar layout (#3), preview-boot loading state (#5).

## Screenshot index

`screenshots/story-01-start.jpg` ... `story-06-workspace-07-shell-bottom.jpg`
-- design stories, in scroll order per template.
`screenshots/real-01-start.jpg` ... `real-08-workspace.jpg` -- real builder,
in visit order (Start -> Support widget -> switch-template -> In-app
assistant -> Assistant -> Research -> Workspace).
