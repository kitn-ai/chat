# workSurface + starter defaults (2026-08-30)

Owner-approved round on branch `feat/modes-and-screens`. Two parts, one spec:

1. **Partial reversal of T-5 ruling 8's `workSurface` DEFER**
   (`docs/superpowers/specs/2026-08-28-t5-vocabulary-rulings.md` §8, proposal
   in `docs/superpowers/research/2026-08-28-builder-t5-vocabulary-proposals.md`
   item 8) — the split pane gets vocabulary, narrowed to what the tree really
   supports.
2. **Starter defaults policy** — bells and whistles ON where free and
   reversible, OFF with a stated reason where they need a backend or land on
   an invoice; plus **neutral accents in every starter**.

Every mechanism below was read in the tree before it was ruled on. Anything
the brief assumed that the tree contradicts is in **§Corrections**, loudly,
because the brief was derived from a screenshot.

---

## §0. Mechanism verification (done first, verdicts binding)

| Mechanism | Verdict | Evidence |
|---|---|---|
| A real artifact viewer component | **REAL** | `src/components/artifact.tsx` — `Artifact` frames a sandboxed iframe (`allow-scripts allow-forms`, no `allow-same-origin`), with a working toolbar: back/forward (`showNav`), reload (`showReload`), home (`showHome`), editable address field (`showPathField` + `readonlyPath` + `displayUrl`), Preview\|Code toggle (`showTabs`), expand/restore (`expandable`, opt-in), open-in-new-tab (`openInTab`, opt-in), plus an imperative `ArtifactController`. Exported publicly: `src/index.ts:215` → reachable from `@kitn.ai/ui/solid`, which is exactly what codegen imports from. |
| A `WorkspaceShell` split frame | **REAL** | `src/components/workspace-shell.tsx` — `start`/`end` asides over a real `ResizablePanelGroup` with a draggable handle; `endWidth ?? 320`, `endMinWidth ?? 200`, `endMaxWidth ?? 480`; `drawerBelow` mobile takeover. |
| `WorkspaceShell` device toggles | **DOES NOT EXIST** | No `device`/viewport concept anywhere in `workspace-shell.tsx`. The only device toggle in the repo is `src/components/builder-layout.tsx`'s `BuilderViewport` (builder chrome, **not exported from `src/index.ts`**) and a hand-rolled one inside `src/elements/builder-workspace.stories.tsx`. ⇒ `chrome.deviceToggle` **DROPPED**. |
| `WorkspaceShell` collapse/expand as a user affordance | **REAL BUT UNREACHABLE AS UI** | `startCollapsed`/`endCollapsed`/`defaultEndCollapsed` exist and work, but the rendered tree has **no collapse button** — collapse fires only from the drawer's Escape handler or the imperative controller. The shipped, visible expand affordance is `ArtifactProps.expandable`. ⇒ `chrome.expand` maps to `expandable`, not to WorkspaceShell (see Correction C-2). |
| Model-produced artifacts reaching the pane | **NOT REACHABLE** | Three independent blockers: (a) `MessagePart` has **no `artifact` variant** — artifacts arrive as `{ type: 'card', envelope }` with `envelope.type === 'artifact'` (`src/primitives/card-data-types.ts:361`, `src/primitives/card-registry.tsx:70`), rendered **inline in the thread**; (b) nothing routes a card to the pane — `src/primitives/card-routing.ts` routes `submit`/`action`/`open`/`state`/…, there is no pane verb; (c) a construct **cannot declare an artifact card at all** — `cards[]` carries `{ name, schema }` with no `kind`, and codegen renders *every* declared card as the built-in `form` card (`codegen.ts` ~line 243, recorded ruling). On top of that, every starter is `provider: { mode: 'mock' }` and codegen calls `createMockResponder()` with no scripted `toolCalls`, so no card of any kind is ever produced in a builder preview. ⇒ the "model builds artifacts into the pane" story is **DROPPED from this slice** (reopen conditions in W-9). |
| What codegen emits for `layout: 'split'` today | **CONFIRMED, and it is the defect** | `emitLayoutOpen` (`codegen.ts` `case 'split'`) emits `<WorkspaceShell drawerBelow={480} end={<div …><slot name="pane" /></div>}>`. `showAside('end')` in `workspace-shell.tsx` is `!!props.end && !collapsed`, and `props.end` is always the wrapper div — **truthy even when nothing is projected**. So a split construct always reserves a 320px column and, by default, fills it with nothing. That is the void the owner saw. |
| Chat column proportions | **NOT A PROPORTION BUG** | `ChatThread` centers its content at `mx-auto w-full max-w-3xl` (`chat-thread.tsx:872`, and the composer/footer at the same width). Beside 320px of blank, a centered 768px column reads as "narrow chat, huge dead space". Nothing in the split math is wrong. |

---

## Part 1 — `workSurface`

### W-1. `workSurface` is ADOPTED, at **top level**, not under `capabilities`

The T-5 deferral's own criterion for adopting elsewhere ("a real mechanism
exists at the component tier; only the construct-level switch is missing")
is satisfied by `Artifact` + `WorkspaceShell`; the deferral overshot.
**Top level, not `capabilities`** — it is layout-scoped chrome, the exact
class as `widget` and `aside`, and the placement is forced by the gate as
well (Correction C-1).

### W-2. Shape (final)

```ts
/** Layout-scoped work-surface pane, `layout: 'split'` only (superRefine
 *  below, mirroring `widget`/`aside`). Fills the split's end pane, which
 *  otherwise reserves a column and renders nothing. */
workSurface: z
  .object({
    /** Toolbar PRESET over the kit's own `Artifact`. 'artifact' = a clean
     *  framed surface (no browser nav, no address bar) + expand;
     *  'preview' = browser chrome (back/forward/reload/home + address bar). */
    kind: z.enum(['artifact', 'preview']),
    /** What the pane frames. REQUIRED — an optional url reproduces exactly
     *  the empty void this round exists to remove. Reaches an iframe `src`,
     *  so isSafeUrl in superRefine, the widget.launcherIcon/empty.icon shape. */
    url: z.string().min(1),
    /** Per-affordance overrides on top of `kind`'s preset. Each key is ONE
     *  real `ArtifactProps` prop; an affordance with no mechanism is not
     *  here (see §0). */
    chrome: z
      .object({
        /** -> Artifact `showPathField` (the editable address field). */
        urlBar: z.boolean().optional(),
        /** -> Artifact `openInTab` (kit default false). */
        openInNewTab: z.boolean().optional(),
        /** -> Artifact `expandable` (kit default false). */
        expand: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional(),
```

`.strict()` at both levels; purely additive; no restructure of `layout`.

### W-3. `kind` presets — the exact prop values codegen emits

| | `kind: 'artifact'` | `kind: 'preview'` |
|---|---|---|
| `showNav` | `false` | `true` |
| `showReload` | `false` | `true` |
| `showHome` | `false` | `true` |
| `showPathField` | `false` | `true` |
| `showTabs` | `false` | `false` |
| `openInTab` | `false` | `true` |
| `expandable` | `true` | `false` |
| `standalone` | `false` (in-panel chrome — it IS a panel) | `false` |
| `iframeTitle` | `"Work surface"` | `"App preview"` |

`chrome.*` overrides the corresponding cell. `sandbox` is **not** exposed —
same reasoning `ArtifactCardData` already records: a surface someone else
authored must not be able to widen its own sandbox.

### W-4. `chrome.codeView` is DROPPED

`showTabs` is real, but the Code tab reads `files[]`, and a construct has no
honest source for file contents: file bodies are model-produced (artifact
card, unreachable per §0) or would be code-in-JSON, which the format bans.
`showTabs: false` in both presets; the Code tab returns with the card→pane
routing in W-9.

### W-5. `chrome.deviceToggle` is DROPPED

No mechanism (§0). This is the reason the "App preview with device toggles"
variant needs a rename — see S-8.

### W-6. The pane slot escape hatch survives as **slot fallback content**

codegen emits the work surface **inside** the existing slot:

```jsx
end={
  <div style={{ height: '100%', overflow: 'auto' }}>
    <slot name="pane">
      <Artifact … />   {/* fallback: rendered only when nothing is projected */}
    </slot>
  </div>
}
```

Native HTML slot semantics: assigned nodes win, fallback renders otherwise.
The consumer's projection keeps working unchanged and **wins** — the
construct's work surface is the default, not an override.

**Decided loudly, three places:** (1) the emitted App carries a comment
saying projection wins; (2) `kai eject`/`kai dev` print a one-line notice when
`workSurface` is set (`cli.ts` already has this shape —
`homeRecentConversationWarning`, `accentContrastNotice`); (3) the builder
panel's Work-surface section says it.

**Known cost, recorded not hidden:** a superseded fallback subtree is still in
the DOM, so the iframe loads even when a consumer projects their own pane —
one wasted request in that combination. Fix if it ever matters: a
`slotchange`-gated `<Show>` in codegen (`assignedElements()`, the
`ui/dropdown.tsx` / `elements/slot-text.ts` pattern). **Deferred**, trigger:
anyone reporting the load, or a workSurface url with a side effect.

### W-7. "Both a declared slot AND workSurface" — there is no such case for `pane`

`CROSS_FIELD_RULES`'s existing `split-pane-slot-collision` already rejects a
declared slot named `pane` on `layout: 'split'`. Other declared slots emit
above the chat column (`emitApp`), orthogonal to the pane. So the only
overlap is projection-vs-fallback, ruled in W-6. No new rule needed for it.

### W-8. Two new cross-field rules

| id | check | `RULE_VISIBILITY` treatment |
|---|---|---|
| `work-surface-layout-scope` | `workSurface` present and `layout !== 'split'` ⇒ issue at `['workSurface']`, message `'"workSurface" is only valid on layout: "split"'` | `{ treatment: 'hide-section', section: 'workSurface', layout: 'split' }` — **needs the type widened**, see Correction C-3 |
| `work-surface-url` | `!isSafeUrl(workSurface.url)` ⇒ issue at `['workSurface','url']`, message matching `launcher-icon-url`'s wording | `{ treatment: 'reject-only' }` |

### W-9. What stays deferred, with its reopen condition

- **Model-driven artifacts in the pane** — needs, in order: a `kind` field on
  construct `cards` (so an `artifact` card is declarable), a card→pane route,
  and a mock responder that scripts a tool call. Reopen when the first of
  those is designed; the pane fold itself is then ~10 lines of codegen over
  `chat.messages()` and needs no kit component.
- **`chrome.codeView`** — rides along with the above.
- **`workSurface.width`** — the shape if it is ever needed is
  `width?: string`, a sibling of `aside.width`, emitted as WorkspaceShell's
  real `endWidth`. Not shipped: see W-11.
- **`chrome.deviceToggle`** — needs a real kit device-frame component
  (`builder-layout.tsx`'s is builder-internal and unexported).

### W-10. The pane needs something to frame, offline

`workSurface.url` is required (W-2), and the builder preview must not depend
on the network. **codegen emits `public/work-surface.html`** — a small,
token-styled starting page — whenever `workSurface` is present and its `url`
is relative; the starters point at `/work-surface.html`. The filename is a
**constant**, never derived from `url`: deriving a write path from
construct-authored text would open a path-traversal sink that does not exist
today. `writeProject`'s manifest pruning deletes it on its own when
`workSurface` is removed. Its copy branches one line on `kind`, and it tells
the reader to replace it.

### W-11. Split proportions: **no change**, and no new vocabulary

Verified (§0): the split math is the kit's own, the splitter is real and
draggable (200–480px), and the "narrow chat" reading came from a centered
`max-w-3xl` column sitting beside a blank 320px column. A rendering pane
resolves it. Shipping `width` vocabulary to paper over an empty pane would be
fixing the symptom. Reopen trigger: with a rendering pane, the owner still
reads the chat as cramped — then W-9's `width` shape lands.

### W-12. Acceptance test for Part 1

The two Workspace variants must produce **visibly different previews**:
`artifactPreview` = a clean framed surface with an expand button and no
address bar; `appPreview` = browser chrome with back/forward/reload/home, an
address bar, and open-in-new-tab. Pinned by a test asserting the two starters'
emitted `App.tsx` differ in the `Artifact` props, not merely in `name`.

---

## Part 2 — starter defaults policy

Starter **data** (T-3): no schema change in this part. Two knobs are touched
per template — the starter construct, and its `controls` manifest (a section
that is absent cannot be turned off, which is the same invisible-option
problem the owner named).

### S-1. The policy, with the line drawn

> **Default ON** in every template starter: anything free, local and
> reversible — it costs nothing, and a person cannot switch off an option
> they never saw.
> **Default OFF, with a one-line hint in the panel**: anything that needs a
> backend the user has not built, or that lands on an invoice or in a policy
> document.

The line is `CLAUDE.md`'s component-scope-boundary rule: **the kit decides
HOW, the app decides WHETHER.** A default-ON affordance is a HOW; anything
metered or endpoint-bearing is a WHETHER.

### S-2. Default ON (free, local, reversible)

`capabilities.starters` · `capabilities.attachments` under
`provider: { mode: 'mock' }` · `capabilities.history.persistence: 'local'` ·
`capabilities.conversations` · `capabilities.reasoning: 'full'` (stated, per
the anchored-on-the-default convention) · `capabilities.messageActions` ·
`capabilities.sources.strip` (Research) · `empty` · `home` (widget) ·
`header.title` · `header.themeToggle` · `shell.commandPalette` ·
`shell.userMenu` · `composer.triggers` · `widget`/`aside` geometry ·
`workSurface` (Workspace).

### S-3. Default OFF, with a stated hint

| Path | Hint shown under the control |
|---|---|
| `provider.mode: 'endpoint'` (+ `url`, `wire`) | "Needs your own chat route. Mock streams locally with no key." |
| `capabilities.history.persistence: 'endpoint'` (+ `url`) | "Needs a thread route you host. Local keeps history in this browser." |
| `cards` | "Cards arrive as tool calls from a model — the mock provider never emits one." |
| `capabilities.reasoningOpen` | "Off by owner ruling (2026-08-26): the thinking panel starts closed and opens on click." |
| `header.actions` (outside Workspace) | "Each button dispatches `kai-header-action` for your app to handle — nothing happens until you listen." |
| `header.themeToggle` (widget only) | "An embedded widget follows your host page's theme." |

### S-4. How "off" reads as a choice, not an absence

`TemplateControlSection` gains an optional, data-only field:

```ts
export interface TemplateControlSection {
  id: string;
  paths: readonly string[];
  /** Path-keyed one-liners rendered under the control when the starter
   *  leaves it off ON PURPOSE. Data, not vocabulary (T-3). */
  hints?: Readonly<Record<string, string>>;
}
```

`DerivedBuilderPanel` passes it into the existing `Field`'s `hint` prop
(`builder-panel.tsx:219` already renders one). No new component, no schema
change. **A section's presence is the discovery surface; a hint is why the
default inside it is off.**

### S-5. Per-template default-ON list (derived from `templates.ts`'s manifests)

Bold = **new in this round**. `+SECTION` = a manifest addition.

| Template | Starter defaults ON | Manifest change |
|---|---|---|
| **widget** (`layout: 'widget'`) | `header.title` · `theme.mode: 'system'` · `empty` · `home` (greeting + recentConversation + links) · `widget.position` · starters · attachments · `history: local` · `conversations` · **`reasoning: 'full'`** · **`messageActions` (A3 matrix)** | **+EMPTY** (the starter already sets `empty` with no section to edit it) · **+MESSAGE_ACTIONS** |
| **inAppAssistant** (`aside`) | `header.title` · `theme.mode: 'dark'` · `aside.position`/`width` · starters · attachments · `history: local` · **`conversations`** · **`reasoning: 'full'`** · **`empty`** · **`messageActions`** · **`composer.triggers`** (slash + mention) · **`header.themeToggle`** | **+EMPTY** · HEADER → **HEADER_CHROME** |
| **assistant** (`fullscreen`) | `header.title` · `theme.mode: 'dark'` · `empty` · starters · attachments · `history: local` · `conversations` · **`reasoning: 'full'`** · **`messageActions`** · **`shell.commandPalette` + `shell.userMenu`** · **`header.themeToggle`** | HEADER → **HEADER_CHROME** |
| **research** (`fullscreen`) | `header.title` · `theme.mode: 'dark'` · `sources.strip: true` · `messageActions` · starters · attachments · `history: local` · **`conversations`** · **`reasoning: 'full'`** · **`empty`** · **`header.themeToggle`** | **+EMPTY** · HEADER → **HEADER_CHROME** |
| **workspace** (`split`) | `header.title` · `header.themeToggle` · `header.actions` (Share/Deploy) · `theme.mode: 'dark'` · `shell.commandPalette` + `shell.userMenu` · `composer.triggers` · starters · attachments · `history: local` · **`conversations`** · **`reasoning: 'full'`** · **`empty`** · **`messageActions`** · **`workSurface`** | **+EMPTY** · **+WORK_SURFACE** |

`messageActions` default = the owner's own A3 matrix, unchanged:
`user: ['edit']`, `assistant: ['copy','like','dislike']`. `'regenerate'` and
`'speak'` stay visible-but-unchecked in the picker — discoverable, and the
A3 matrix is itself an owner ruling this round does not reopen.

### S-6. Variant differentiation (Part 1's acceptance test, as data)

```ts
workspaceBase:            workSurface: { kind: 'artifact', url: '/work-surface.html', chrome: { expand: true } }
workspaceArtifactPreview: (inherits base)
workspaceAppPreview:      workSurface: { kind: 'preview',  url: '/work-surface.html',
                                         chrome: { urlBar: true, openInNewTab: true } }
```

Plus the starters they already differ by. The two variants now differ in
**what the pane looks like**, which is what their card copy promises.

### S-7. Accents go NEUTRAL — omit `theme.accent` entirely

**Ruling: every starter omits `theme.accent`.** Verified rather than assumed:
`theme.css:35` declares `--color-primary: var(--kai-color-primary, hsl(240 5.9% 10%))`
(light, near-black) and `theme.css:244` `hsl(0 0% 98%)` (dark, near-white).
The note in `src/builder-app/App.tsx:26` is correct. So an omitted accent is
a legible, high-contrast neutral in **both** modes — not a broken look. It
also reads correctly in the panel: the `ColorField` sits empty meaning "kit
default", the control stays visible for discovery, and
`resolveAccentWrapperStyle` already returns `{}` for no accent
(`builder-preview.ts` — "the kit's own neutral default applies").

Reasoning in one line: **a starter must not pre-commit somebody's brand.**
Supporting evidence from the tree: `builder-workspace.stories.tsx:280`
records that white text on the current `#ea580c` is 3.55:1, under axe's
4.5:1 — the opinionated accent was already an accessibility liability.

No fallback blue is needed, and none is adopted: the fallback in the brief
was conditional on omission looking broken, and it does not.

### S-8. `theme.unreadColor` — omitted too

Widget's `#38BDF8` goes. `theme.css:114` gives `--color-unread` a real
default (`hsl(0 84% 60%)`), so the badge still renders. Same rule, same
reason: a starter picks no brand.

### S-9. `theme.mode` is UNCHANGED

`dark` for the four non-widget starters, `system` for widget — an owner
ruling from the dark round, pinned by `templates.test.ts:95`. Not reopened.

### S-10. Scope boundary — do NOT touch the builder's own brand

`BRAND_STYLE = { '--color-primary': '#EC2295' }` in
`src/builder-app/App.tsx:36` (and its twin in `builder-start.stories.tsx`) is
the **kitn product identity** on the builder's Start / variant / name
canvases, explicitly requested by the owner in the design rounds. It is the
builder UI, not a generated construct. **It stays exactly as it is.** Anyone
later "finishing the neutral-accent job" by removing it is undoing a
different, deliberate decision.

Likewise out of scope: the Labs/Builder **story** seeds
(`builder-assistant.stories.tsx:146`, `builder-research.stories.tsx:120`,
`builder-workspace.stories.tsx`) keep their accents — they are the design
surface that demonstrates accenting works. Only `templates.ts` goes neutral.
`templates.ts`'s own starter-provenance comment currently lists "accents" as
carried over from the stories; that line must be corrected in the same edit.

### S-11. Note the pre-existing dead-click, do not silently keep it

`header.actions` emits buttons that dispatch `kai-header-action` with no
listener in the emitted app — clicking Share/Deploy in a builder preview does
nothing. That is the same dead-affordance class T-5 ruling 3 rejected `voice`
for. **Not blocking this round**, but it gets a task: codegen emits a DEV-only
`console.warn` naming the event and the seam when an action is clicked and no
listener is attached. Recorded so it is a decision, not an oversight.

---

## §Corrections (the brief, against the tree)

**C-1. `capabilities.workSurface` would break `verify:construct`.**
The brief specified `capabilities.workSurface`. `scripts/verify-construct.mjs`
builds capability cells as *every layout × (none + each capability alone + all
of them)* (`buildCells`), and there is **no layout-scoping mechanism for
capability keys** — only `TOP_LEVEL_LAYOUT_SCOPE`, which exists precisely
because `widget`/`aside` are layout-scoped. A capability valid only on `split`
would make every non-split capability cell fail validation. Top-level
placement uses the mechanism that already exists, and matches the concept
(layout chrome, not a thread affordance). **Ruled top-level (W-1).**

**C-2. `expand` is not backed by `WorkspaceShell`'s collapse.**
The research doc claims `expand` is "backed by a REAL mechanism today
(`WorkspaceShell`'s controlled `startCollapsed`/`endCollapsed` — no new kit
work needed)". Half true: the props exist, but `workspace-shell.tsx` renders
**no collapse control** — collapse fires only from the drawer's Escape handler
or the imperative controller, so wiring `expand` to it means codegen inventing
a button. `ArtifactProps.expandable` is a shipped, tested, visible
expand/restore button. **Mapped there (W-3).**

**C-3. `RULE_VISIBILITY`'s `hide-section` cannot express this rule yet.**
`builder-panel-derived.tsx:647` reads `if (props.value.layout !== vis.section)
hidden.add(vis.section)` — it compares the **section id** to the **layout
name**, which only works because the `widget` and `aside` sections happen to be
named after their layouts. A `workSurface` section on layout `split` breaks
that. `RuleVisibility`'s `hide-section` member must gain an explicit
`layout: string` (`construct-form-paths.ts:183`), with the panel comparing
against it. Small, but it is a type change, not just a registry entry.

**C-4. There is no `artifact` MessagePart variant.**
The brief says to check "the artifact/source MessagePart variants in
`src/elements/chat-types.ts`". `source` exists; **`artifact` does not** —
the union is closed by design ("extension happens at the CARD layer via the
card registry, not by adding variants here", `chat-types.ts:63`). Artifacts
are a card envelope type. This is what makes the model-driven pane story
unreachable (§0), so it changed the ruling, not just the wording.

**C-5. The two Workspace variants are not byte-identical.**
`workspace.artifactPreview.construct.json` and
`workspace.appPreview.construct.json` differ in `name` and
`capabilities.starters`. The menu-honesty complaint stands — nothing that
differs **changes what the preview looks like** — but "identical constructs"
overstates it, and the fixtures prove it.

**C-6. `conversations` + `history: 'local'` is FREE — it does not belong on
the off-by-default side.** The brief put "conversations-with-persistence" in
the backend/invoice column. `local` persistence is `localStorage`: no backend,
no invoice, reversible by clearing site data, and it is **already shipped ON**
in four of five starters. Only `history.persistence: 'endpoint'` (and
`provider.mode: 'endpoint'`) crosses the line. **Ruled per S-2/S-3**, which
keeps the stated criterion ("needs a backend or lands on an invoice") intact
rather than bending it.

**C-7. `verify:starters` is not the gate for template starters.**
It covers `examples/starters/*` and `examples/apps/*` (real app packages). The
template starters in `templates.ts` are covered by `templates.test.ts` (which
safeParses every starter against the real schema) and by `verify:construct`'s
named-fixture discovery over `fixtures/templates/*.construct.json`. Do not
cite the wrong gate in a PR description.

---

## Task breakdown

Each task names its files and the gates that must be green for it. **A build
is required before `verify:construct` / `verify:scaffold` / the MCP tests.**

### T1 — schema: `workSurface` + its two rules

- `packages/ui/src/agent-tooling/construct/schema.ts` — the top-level
  `workSurface` object (W-2) with its full doc comment (the untrusted-url note
  mirroring `empty.icon`'s), and the two `CROSS_FIELD_RULES` entries (W-8).
- `packages/ui/src/agent-tooling/construct/schema.test.ts` — accept/reject
  cases for both rules, including `layout: 'aside'` + `workSurface` and a
  `javascript:` url.
- **Gates:** `pnpm --filter @kitn.ai/ui exec vitest run --project=unit` ·
  `npm run build:api` (regenerates `construct.v1.schema.json` **and**
  `apps/docs/public/schemas/construct/v1.json`) · `npm run verify:generated`
  (byte-identical artifact) · `nx typecheck ui --skip-nx-cache`.

### T2 — builder visibility registry

- `packages/ui/src/components/construct-form-paths.ts` — widen
  `RuleVisibility`'s `hide-section` with `layout: string` (C-3); add the two
  new `RULE_VISIBILITY` entries (the key-set-equality test fails until both
  exist).
- `packages/ui/src/components/builder-panel-derived.tsx` — compare against
  `vis.layout`; add `workSurface: 'Work surface'` to `SECTION_TITLES`; add
  `'workSurface.url'`, `'workSurface.kind'`, `'workSurface.chrome.urlBar'`,
  `'workSurface.chrome.openInNewTab'`, `'workSurface.chrome.expand'` to
  `FIELD_LABELS` where the auto-label reads badly.
- `packages/ui/src/components/construct-form-paths.test.ts` (key-set equality)
  and `builder-panel-derived.test.tsx` (the section renders on `split`, is
  hidden on every other layout).
- **Gates:** unit suite · typecheck.

### T3 — codegen: emit the pane

- `packages/ui/src/agent-tooling/construct/codegen.ts` — `emitLayoutOpen`'s
  `split` case gains the `<slot name="pane">` **fallback** `<Artifact …>`
  (W-6) with the preset table (W-3) and `iframeTitle`; `emitLayoutImport`
  splices `, Artifact` for `split` **only when `workSurface` is present** (the
  emitted project runs `noUnusedLocals`); `public/work-surface.html` emitted
  per W-10; the projection-wins comment.
- `packages/ui/src/agent-tooling/construct/cli.ts` — the `workSurface` notice
  (W-6) and the `split`-without-`workSurface` notice, in the shape
  `homeRecentConversationWarning` already uses.
- `codegen.test.ts` · `cli.test.ts`.
- **Gates:** unit · `nx build ui` then
  `pnpm --filter @kitn.ai/ui run verify:construct` (see T7 first — it will
  hard-fail without the valuer).

### T4 — starter data: defaults + neutral accents + variants

- `packages/ui/src/agent-tooling/construct/templates.ts` — S-5's table, S-6's
  variant work surfaces, S-7/S-8 (delete `theme.accent` from four starters and
  `theme.unreadColor` from widget, keeping `theme.mode`), the new/upgraded
  control sections, `hints` per S-3/S-4, and the corrected starter-provenance
  comment (S-10).
- `packages/ui/src/agent-tooling/construct/templates.test.ts` — extend: no
  starter carries `theme.accent` or `theme.unreadColor`; every starter
  safeParses (already there); the two Workspace variants differ in
  `workSurface`.
- **Gates:** unit · `npm run build:api` (regenerates
  `fixtures/templates/*.construct.json` — **seven files, all of them change**)
  · `npm run verify:generated` · `verify:construct` (named fixtures are
  discovered, so every starter is ejected, typechecked, built and bundled).

### T5 — panel hints

- `packages/ui/src/components/builder-panel-derived.tsx` — render
  `section.hints?.[path]` through `Field`'s existing `hint`.
- `builder-panel-derived.test.tsx` — a hint renders for an off-by-default path.
- **Gates:** unit.

### T6 — create-kai classification

- `packages/create-kai/src/wizard.ts` — a `WIZARD_REGISTRY` entry for
  `workSurface`. Recommended: `status: 'not-asked'`, reason "the split pane's
  work surface is template-seeded; edit the construct file or use the
  `construct` MCP tool to retarget it" — the wizard has no split-layout branch
  to ask it from.
- `packages/create-kai/test/wizard.test.ts` — the drift test goes red until the
  entry exists (top-level keys are in the guarantee; see the file's own
  "TOP-LEVEL PLUS `capabilities.*` ONLY" note).
- **Gates:** `pnpm --filter create-kai test` · typecheck.

### T7 — the emit-chain gate

- `packages/ui/scripts/verify-construct.mjs` — add `workSurface` to
  `TOP_LEVEL_VALUES` (e.g.
  `{ kind: 'preview', url: '/work-surface.html', chrome: { urlBar: true, openInNewTab: true, expand: true } }`)
  and to `TOP_LEVEL_LAYOUT_SCOPE` as `workSurface: 'split'`. **Without both,
  the gate hard-fails** — by design: `missingValuers` refuses a new top-level
  key with no valuer, and without the scope entry every non-split cell would
  carry an invalid `workSurface`.
- **Gates:** `node scripts/verify-construct.mjs --self-test` then the full run.

### T8 — docs + `header.actions` dev warning (S-11)

- `apps/docs/` construct-format page: the `workSurface` row, the preset table,
  the projection-wins rule.
- `codegen.ts`: DEV-only `console.warn` when a header action fires with no
  listener.
- **Gates:** unit · `nx build ui` · `pnpm --filter @kitn.ai/ui run lint:cdn-pins`
  if any version literal is touched (it should not be).

### T9 — verification pass (separate agent)

- A real `kai dev --builder` run on the Workspace template: both variants
  previewed, screenshots taken, the two panes visibly different (W-12), the
  pane non-empty offline, the neutral accent legible in dark and light, and a
  consumer projection into `<slot name="pane">` still winning.
- **Gates:** the screenshots are the evidence; no claim of "done" before them.

---

## Gate consequences, in one place

<!-- gate-list: partial -- maps a kind of change to the gate it moves; not an enumeration of the required CI `test` job's full gate set -->
| Change | Gate that moves | What it does if you skip it |
|---|---|---|
| New top-level schema key | `verify:construct` `TOP_LEVEL_VALUES` + `TOP_LEVEL_LAYOUT_SCOPE` | Hard failure naming the key (`missingValuers`) — by design |
| New schema key at all | `npm run build:api` → `construct.v1.schema.json` + `apps/docs/public/schemas/construct/v1.json`; `verify:generated` | Byte-drift failure |
| New `CROSS_FIELD_RULES` entry | `RULE_VISIBILITY` key-set-equality test | Red until the builder classifies the rule |
| `hide-section` on a non-layout-named section | `RuleVisibility` type + `builder-panel-derived.tsx:647` | Section silently shown on every layout |
| Changed starter | `npm run build:api` → `fixtures/templates/*.construct.json`; `verify:generated`; `verify:construct` named fixtures | Drift failure, then a stale fixture ejected/compiled by the gate |
| New top-level key | `create-kai` `WIZARD_REGISTRY` | `wizard.test.ts` drift test red |
| Any of the above | `nx typecheck ui --skip-nx-cache` | A cached green over broken code is the one that ships (CLAUDE.md) |
