# The live construct runtime — design spec (2026-08-30)

> **DESIGN ONLY. Nothing here is authorized for implementation.** No file
> outside this one is touched by this document, and no task below starts
> until the owner rules. The tree is being actively edited by other agents
> while this was written (`schema.ts`, `builder-panel-derived.tsx`,
> `construct-form-paths.ts` are all dirty on `feat/modes-and-screens`), so
> every claim below was read out of the tree at the commit named in
> "Corrections", not assumed.

## Owner's framing (verbatim, binding intent)

> "it's not hot-swappable like when we run vite… it feels like you are
> currently writing the updates to the config file and then loading the
> config to generate the app each time, rather than the config driving the
> application and then saving the config after. I can see someone wanting to
> just play around with the controls and then going 'yeah, I like the way
> that looks' and saving it — or at least autosaving the file in realtime,
> but still driven by a store in the builder."

The framing is correct about the loop. Today the construct FILE is the
program counter: the builder cannot show you anything it has not first
written to disk and re-generated a whole Vite project from. This spec
inverts that — the **store drives the application, the file becomes the save
artifact** — and it treats the resulting two-render-paths problem as the
central design risk rather than a follow-up.

---

## What this changes, in one paragraph

A **construct runtime** (a Solid component that takes a `Construct` OBJECT
and renders the composition codegen emits, with no build step) becomes the
builder's preview. The builder holds the construct in a store; every control
change reaches the runtime in the same tick; the file is written by a
debounced autosave with a loud dirty/saved/rejected indicator. `.kai/`,
`npm install` and the spawned Vite server leave the inner loop entirely and
leave the create flow entirely — they come back only behind an explicit "run
the real project" action, and behind `kai eject` / `kai compile` /
`verify:construct`, which is where proving the emitted app works belongs.
Drift between the two render paths is made structurally impossible by
extracting every construct→value decision into ONE module (`plan.ts`) that
codegen and the runtime both consume, plus a parity test that mounts both
over the same construct and diffs the rendered DOM.

---

## Corrections — what the framing gets wrong about the tree

Read at `ed86cc1b` on `feat/modes-and-screens`. Recorded loudly, per the
repo's own rule that the quotable version of a finding is usually the wrong
one.

**C1. There is no chokidar.** The watcher is `node:fs`'s own `watch`, on the
construct file's PARENT DIRECTORY, filtered by basename — deliberately, and
the reason is documented at the site (`dev.ts`, both in `dev()` and in
`devBuilder`'s `boot`): editors save by writing a temp file and renaming over
the original, which replaces the inode, and `fs.watch(path)` on
macOS/FSEvents then goes permanently silent after the first save. Any change
to the watch layer inherits that constraint. No new dependency is implied by
"watcher".

**C2. The framing's `~11s` first boot is not a number this tree stands
behind, and the code's own estimate is higher.** `dev.ts`'s
create-in-background comment records the observation as "~28s on a warm cache
and minutes on a cold one". Neither figure is derived, and per CLAUDE.md no
number a script can produce belongs in a spec. What is STRUCTURAL, and is all
this design needs: the create flow currently contains an `npm install`
(`ensureInstalled`), a `spawn('npm', ['run','dev'])`, and a
`waitUntilListening` poll with a 180-second timeout. Those three are what
leave. If a figure is wanted for the before/after, measure it with
`scripts/measure-timings.mjs` on a confirmed-quiet box and record it next to
the measurement, not here.

**C3. `./define` is exactly what the framing says, and it is more useful than
"not a construct interpreter" suggests.** `src/elements/define.tsx` is the
`kai-*` facade definer. But it also owns four things the runtime needs and
must not re-invent: the shadow root pre-attached synchronously before first
paint, `ELEMENT_CSS` adopted as a constructable stylesheet into that root,
the `theme`→`.dark` resolution (`createDarkMode`, `auto` follows
`prefers-color-scheme`) applied to a `display:contents` wrapper that also
re-roots inherited `color`, and the `ChatConfig portalMount` boundary. The
runtime should reuse that host, not copy it — see R2.

**C4. "The kit already has per-element splitting + an autoloader — say how
the runtime uses them" — it can't use either.** Both are for the `kai-*`
CUSTOM ELEMENTS (`dist/elements/*.js`, `dist/elements/autoloader.js`), and
`autoloader.ts`'s own header states it is NOT importable through a bundler
(it resolves sibling element modules against `import.meta.url`, which Vite
and webpack relocate). The construct runtime's interior is **pure Solid** —
the same components codegen imports from `@kitn.ai/ui/solid` — and that entry
is a SINGLE un-split rollup lib target (`vite.config.solid.ts`: one entry,
`formats: ['es']`, externals `solid-js` only, `export * from './index'` at
source level). There is no code splitting on the Solid surface at all today.
So split-awareness for the runtime is **new work**, not a reuse — R12.

**C5. The drift the spec is asked to prevent already exists in the tree, once,
with a comment admitting it.** `src/components/builder-preview.ts` carries a
verbatim copy of codegen's `parseAccentRgb` / `relativeLuminance` /
`hslToRgb` / `resolveContrastForeground`, because `codegen.ts` imports
`node:fs`/`node:module`/`node:path` and cannot be imported from a browser
module. That is the exact failure mode this spec is designed to make
impossible, it is already here, and the cause — codegen being Node-only — is
the reason `plan.ts` must be a NEW module that codegen imports, never a set of
exports pulled out of codegen. Task 1 deletes that copy.

**C6. The builder is already half-decoupled, and the spec builds on that
rather than replacing it.** `POST /api/create` already responds the moment
the construct file exists; the boot already runs detached and announces
itself over the SSE hub (`announceBoot` → `preview` / `preview-error`); the
panel is already editable while Vite installs. `PreviewState` is already a
four-state model, not a nullable URL. What is missing is not the plumbing —
it is that there is nothing to SHOW during that window.

---

## Standing tests applied throughout

derive-don't-type · checks-that-prove-nothing (watch every new guard fail
first) · decide-loudly · the-kit-decides-HOW-the-app-decides-WHETHER ·
untrusted-input discipline (a hosted construct is tenant-authored) ·
name-a-second-instance-before-generalising · structural-over-contingent
evidence.

---

## Rulings

### R1. The seam is a PLAN, and it is a new browser-safe module

**`packages/ui/src/agent-tooling/construct/plan.ts`** exports
`ConstructPlan` (a plain, JSON-serializable value type) and
`resolveConstruct(construct: Construct): ConstructPlan`. Zero `node:`
imports, zero string emission, zero JSX.

Reasoning: C5 proves that "the browser side copies it" is what happens when
the only home for a decision is a Node module. A new module both sides import
is the only shape that cannot repeat it.

**What the plan carries** — every construct→VALUE decision, i.e. everything
the current `emit*` functions compute before they serialize it:

| plan field | replaces |
|---|---|
| `tag`, `themeMode` | `c.name`, `themeMode(c)` |
| `theme.accent`, `theme.accentForeground` (`'#000000'\|'#ffffff'\|null`), `theme.unreadColor`, `theme.contrastNotice` | `resolveContrastForeground`, `accentContrastNotice` |
| `layout` — a discriminated union: `{kind:'widget', position, launcherIcon, defaultOpen, hideClose}` · `{kind:'aside', position, width, inset, borderSide}` · `{kind:'fullscreen'}` · `{kind:'split', drawerBelow}` · `{kind:'custom'}` | `emitLayoutOpen`/`Close`, `emitDockPosition`/`Launcher`/`DefaultOpen`/`HideClose` |
| `thread` — the resolved ChatThread prop bag: `chatTitle`, `attach`, `accept`, `suggestions`, `reasoning`, `reasoningOpen`, `messageActions`, `hideSources`, `triggers`, `webSearch:false`, `voice:false`, `home`, `conversations`, `unread` | `emitHeaderProp`, `emitAttachProps`, `emitStartersProp`, `emitReasoningProp`/`OpenProp`, `emitMessageActionsProps`, `emitHideSourcesProp`, `emitTriggersProp`, `emitHomeProp`, `emitConversationsProps`, `emitChatThreadUnreadProps` |
| `chrome` — `{themeToggle, headerActions[], userMenu, commandPalette}` plus `needsHost` | `hasThemeToggleChrome`/`hasHeaderActionsChrome`/`hasUserMenuChrome`/`needsHost`, `emitHeaderEndContentProp`, `emitShellPaletteVars`/`Overlay` |
| `slots: string[]`, and for `custom` the `{head, tail}` split | `emitSlots`, `emitCustomApp`'s destructure |
| `cards: {name, schema}[]`, `cardTypes: Record<name,'form'>` | `emitCardsRegistry`, `emitCardTypesProp`, `emitApplyCardTools`'s merge policy |
| `provider` — `{mode:'mock'}` \| `{mode:'endpoint', url, wire, userIdHeader?, sendTools}` | `emitProviderSetup`/`Imports`, `emitUserIdHeaderEntry`, `emitToolsField` |
| `history` — `{persistence, key?, endpoint?} \| null` | `emitHistorySetup` |
| `empty` | `emitEmptyContentProp` |
| `imports` — the derived module/name sets each target needs | `emitLayoutImport`, `emitChromeImports`, `emitSolidJsImports`, `emitProviderImports` (see R4) |

**What stays with codegen:** the SOURCE TEXT. Import-line assembly and
de-duplication, `JSON.stringify` escaping of construct-authored strings, JSX
indentation, every explanatory comment, `package.json` / `tsconfig.json` /
`vite.config.ts` / `vite.config.lib.ts` / `index.html`, the
`@supports (color: contrast-color(red))` stylesheet text, `writeProject`,
`emitTypes`, `kitVersion()`. Codegen becomes a **printer over the plan**.

**What stays with the runtime:** MOUNTING. The shadow host and CSS adoption,
the `.dark` wrapper, `ChatConfig`, instantiating `createKaiChat`, the submit
closure, the history effect, the transport, `<slot>` projection,
remount-on-layout-change, lazy branch loading.

### R2. Where the runtime lives, what it exports, and how it mounts

**`packages/ui/src/construct-runtime/`**, new export key
`"./construct/runtime"` → `dist/construct-runtime.js`, built by
`vite.config.construct-runtime.ts` (externals `solid-js` + friends, mirroring
`vite.config.solid.ts`).

NOT under `agent-tooling/` — CLAUDE.md's map calls that folder "independent
of the components", and the runtime is nothing but components. It imports
`plan.ts` (which lives with the schema it resolves) and
`../components/*` / `../ui/*` **directly, never through the `@kitn.ai/ui/solid`
barrel** — the barrel is `export * from './index'`, which is precisely what a
bundler cannot split (C4, R12).

```ts
export interface ConstructRuntimeOptions {
  /** The construct itself. An OBJECT, always. Never a path, never a URL,
   *  never build-time-baked. */
  construct: Construct;
  /** Provider injection at mount. Given, it WINS over construct.provider.
   *  Returns a Response the kit then PARSES with @kitn.ai/ui/wire — the
   *  kit still never fetches on its own behalf and never sees a key. */
  transport?: (req: ConstructChatRequest) => Promise<Response>;
  /** Identity injection at mount. Overrides construct.userId, because in a
   *  hosted context the construct file is tenant DATA and the viewer is not. */
  identity?: { userId?: string };
  /** Named slot content, for hosts not projecting light DOM. */
  slots?: Record<string, JSX.Element>;
  onProblem?: (problem: { stage: string; message: string }) => void;
}

/** Solid component. */
export function ConstructRuntime(props: ConstructRuntimeOptions): JSX.Element;

/** Framework-agnostic imperative mount — one host element, in or out of a
 *  shadow root; `update` swaps the construct with no remount unless the
 *  layout kind changed. */
export function mountConstruct(
  host: HTMLElement,
  options: ConstructRuntimeOptions,
): { update(next: Partial<ConstructRuntimeOptions>): void; dispose(): void };
```

**Mounting is shadow-first and reuses `define.tsx`'s host contract** (C3).
Factor the shadow-root + adopted-`ELEMENT_CSS` + `.dark`-wrapper +
`ChatConfig` block out of `renderFacade` into an exported
`ShadowHost`/`createShadowHost` used by BOTH `defineWebComponent` and
`mountConstruct`. That block is the emitted element's entire theming
behaviour; a second copy of it is the next C5.

### R3. The builder preview is an IFRAME — and the reason is viewport units, not style isolation

The runtime is mount-agnostic (R2). The BUILDER chooses an iframe, and the
decision is forced by the composition itself, not by taste:

- `fullscreen` emits `height: 100dvh`. `split` emits `height: 100dvh`.
  `dvh` resolves against the VIEWPORT and no wrapper, shadow root or
  containing block can rebase it. Overriding it in the preview would mean the
  preview renders something the emitted app does not — the beautiful lie, at
  the very first layout.
- `aside` emits `position: fixed; inset-block: 0`. Shadow DOM does not
  contain fixed positioning. It would cover the builder's own panel.
  (A `transform`/`contain` containing-block trick exists and would work for
  `fixed` — but it does nothing for `dvh`, and applying it only in the
  preview is itself a divergence.)
- `widget` is `Dock`, whose whole point is floating over a page.
- Style isolation and `.dark`/`theme.mode` scoping are ALREADY solved by the
  shadow root (C3) and are not the reason.

So: the builder server serves a second prebuilt page, **`/preview/`**, from
the same `dist/builder-page/` directory `serveBuilderAsset` already walks up
to. It loads `dist/construct-runtime.js`, mounts nothing until it receives a
construct, and speaks a same-origin `postMessage` bridge.

**Bridge protocol** (three messages down, three up; versioned from day one):

```
builder → preview : {v:1, type:'construct', construct, identity?}
builder → preview : {v:1, type:'ping'}                       // liveness
preview → builder : {v:1, type:'ready'}
preview → builder : {v:1, type:'mounted', layoutKind}
preview → builder : {v:1, type:'error', stage, message}      // never silent
```

The preview page validates `event.origin === window.location.origin` and
ignores everything else. It is a different DOCUMENT, so it never inherits the
builder page's `.dark` and `theme.mode: 'light'` inside a dark builder is
correct with no special handling — but the preview document must paint its
own background from the construct, not leave it transparent.

The generated project's Vite server keeps its iframe too; the pane gains a
**Live | Real build** toggle (R10). The device-frame/responsive-preview story
the current pane could grow is unaffected by this choice — both modes are
iframes.

### R4. Codegen becomes a printer, and the type system is what enforces it

`generateProject(construct)` is the ONLY function in `codegen.ts` that may
name the `Construct` type. Its body's first line is
`const plan = resolveConstruct(construct)`; every `emit*` below takes
`plan: ConstructPlan`.

Reasoning: this is the structural half of "drift is impossible". Once an
emitter cannot SEE a construct field, it cannot make a decision about one, so
a decision the runtime does not share is not expressible. `lint:construct-plan`
(R6) asserts the single occurrence — a one-line grep, but it is a real guard
because the alternative (a reviewer noticing a re-added `c.theme?.accent`
across ~70 emit functions) has already failed once in this tree.

**Import lists are the interesting case**, and they belong in the plan, not
in codegen's head. `emitLayoutImport` / `emitChromeImports` /
`emitSolidJsImports` exist because the emitted project compiles under
`noUnusedLocals` — a decision about the emitted TEXT. But WHICH components a
layout needs is exactly the decision the runtime makes when it picks a lazy
branch. So the plan carries `imports: { solid: string[]; kit: string[]; wire: string[]; ... }`
as a derived SET, codegen prints it as import lines, and the runtime uses the
same set as its lazy-branch key. One decision, two renderings — and if they
disagree, the emitted project fails `noUnusedLocals` or the runtime fails to
find a component, both loudly.

### R5. The one decision that genuinely cannot be shared, named

**The emitted `submit` function, the history `createEffect`, and
`emitApplyCardTools`' merge are CODE, and eject's value is that they are
readable code you own.** The runtime executes an equivalent; codegen prints a
readable one. Sharing them would mean emitting `const {chat, submit} =
createConstructChat(PLAN, transport)` — an opaque call into the kit, in the
file whose entire purpose is "the source is yours" (`cli.ts`'s own eject
message). That trade is not worth it.

So this pair is pinned rather than shared, three ways:

1. The plan carries the DATA both use (`provider`, `history`, card merge
   policy), so the only thing that can diverge is the imperative shape.
2. The parity test (R6) diffs the RENDERED RESULT after a scripted turn, not
   just the initial mount — a divergent submit shows up as a divergent thread.
3. `codegen.test.ts` gains an assertion that the emitted `submit` text
   contains the same wire calls the plan names (`readOpenAIStream` vs
   `readAnthropicStream`, `toOpenAIMessages` vs `toAnthropicMessages`), so a
   wire swap cannot silently apply to one side.

Recorded honestly: this is a pin, not an impossibility proof. It is the only
one.

### R6. The parity test — mount both, diff the DOM, and prove the diff can fire

`packages/ui/tests/agent-tooling/construct-runtime-parity.live.test.ts`, in
the existing **`emitted` vitest project** (`packages/ui/emitted-code-tests.ts`
owns the dir, the `.live.test.ts` suffix, the project name and
`EMITTED_CODE_TIMEOUT`). That project already exists to write emitted code to
a real module, transform it through Vite and EXECUTE it against a mounted
element; this is the same shape and belongs beside it, not in `unit`.

Note the suffix is `.live.test.ts`, not `.tsx` — so either the test mounts
via `createComponent(ConstructRuntime, props)` rather than JSX (preferred,
no derived-list change), or `EMITTED_CODE_TEST_SUFFIX` widens and
`tests/agent-tooling/emitted-project-wiring.test.ts` re-pins. Prefer the
former.

Per cell:

1. `resolveConstruct(fixture)` → plan.
2. `generateProject(fixture)` → write `src/App.tsx` + `src/element.tsx` to a
   temp module; transform + import; mount into a container.
3. `mountConstruct(container2, { construct: fixture })`.
4. Drive BOTH through the same scripted turn (mock provider, a fixed
   responder, a scripted tool call for card-bearing fixtures).
5. Normalize both trees and assert structural equality.

**Normalization is load-bearing and therefore gets its own negative test.**
`crypto.randomUUID`, `createUniqueId` and the mock responder are all
non-deterministic. The normalizer keeps tag names, class lists, text content
and a whitelist of semantic attributes (`role`, `aria-*` BOOLEAN/enum values,
`data-kai-*`, `part`, `slot`, `href`, `src`); it drops `id`, and any
`aria-controls`/`aria-labelledby`/`for` whose value is an id reference,
replacing each with a positional token so a BROKEN reference still diffs. It
collapses whitespace.

Two anti-vacuity assertions, in the same file, per the repo's dominant
failure mode:

- **negative-construct:** runtime fed construct A vs emitted fed construct B
  (differing in one plan field per axis) MUST diff, with the failure naming
  the path.
- **normalizer self-test:** a hand-built pair differing only in a dropped
  attribute MUST still compare equal, and a pair differing in a KEPT
  attribute MUST differ.

**Cells:** one per `layout` (derived from the schema artifact's
`layout` enum, the way `verify-construct.mjs` already derives it — never
typed), plus one all-capabilities cell, plus every named fixture in
`src/agent-tooling/construct/fixtures/` (discovered recursively, never
listed). The FULL matrix (layouts × capability probes) stays in
`verify:construct`, which is where cells already cost minutes.

### R7. The store is the program counter; the file is the save artifact

The builder page holds `createStore<Construct>` (or keeps today's
whole-object signal — `DerivedBuilderPanel` is already controlled and already
hands back a fresh `Construct` per edit, which is the correct discipline
either way). Every panel change:

1. writes the store — synchronously;
2. **posts to the preview in the same tick** if the store validates (R8) —
   no debounce, no round trip, no file;
3. schedules the debounced autosave.

A `layout` change remounts the runtime (a different spine and a different
lazy branch); the remount is local to the preview document and is still
instant. Everything else is a prop update.

### R8. Validation moves into the page, and the invalid-state rule is stated loudly

**THE RULE: an invalid intermediate state may live in the store. It may
never reach the file, and it may never reach the runtime. It reaches the
problems list, and only the problems list.**

The runtime renders the **last construct that validated**. This is not a
performance concession, it is a type guarantee: `ConstructRuntime` takes a
`Construct`, and a half-typed `provider.url` or an empty `name` is not one.
The preview visibly holds its last good state while the problems list is
non-empty — the same "last good preview stays up" contract `regenTurn`
already prints today, moved to where the user can see it.

To do that without a round trip the builder page imports `validateConstruct`
from `@kitn.ai/ui/construct` (`dist/construct.js`, already a browser-resolvable
entry).

**This reverses part of F5's rationale, deliberately.** `dev.ts`'s F5 comment
says validation is server-side "because the page bundle does not carry zod".
That was a size decision for a page bundle — and this page is a LOCAL DEV
TOOL served by a Node process on loopback, where zod's bytes cost nothing and
a round trip per keystroke costs the whole feature. The server keeps
validating regardless: it is the file's one doorway (`handleConstructPut`),
it must never trust a client, and hand-edits arrive through it. Two
validators, one schema, no drift — they are the same `validateConstruct`.

### R9. Autosave, dirty state, and the file→store direction

- **Autosave**: debounced after the last edit, plus flush on blur, plus flush
  on `visibilitychange`/`pagehide`, plus explicit `Mod+S`.
- **A dirty indicator IS also needed** — not as UI polish, as the
  decide-loudly requirement. An autosave that can be REJECTED (422) or fail
  (server down) and says nothing is a silent decision about the user's work.
  Four states, one chip: `saved` · `saving…` · `unsaved changes` ·
  `not saved — <reason>`. The existing `serverError` banner stays for
  server-down; the chip owns per-save truth.
- An explicit Save BUTTON is optional (the chip plus `Mod+S` is the floor).
  Recommend shipping one anyway: the owner's "yeah, I like the way that looks"
  moment is a real interaction, and a button is where a future
  "save as a new version" lands.
- **file→store keeps working, unchanged in mechanism**: the watcher still
  broadcasts `construct` over SSE and the page still refetches. Two additions:
  - **Echo suppression.** Our own write triggers our own watcher. The POST
    carries a `writeId`; the server echoes it on the SSE frame; the page
    ignores frames carrying its own. Today's clobber is benign only because
    every edit is written immediately — with a debounce there is a real
    window.
  - **Conflict, decided loudly.** If the file changes on disk while the store
    is dirty, do NOT clobber. Show "this file changed on disk" with
    *Reload from disk* / *Keep my changes*. Today's code silently
    `setConstruct(body)`s over local state.

### R10. What still needs `.kai/`, and when

`.kai/` and everything in it — codegen to disk, `npm install`, the spawned
Vite — is needed for exactly three things, none of which is the inner loop:

1. **`kai eject`** — the project is yours. Unchanged.
2. **`kai compile`** — one self-registering `.js`. Unchanged.
3. **Proving the emitted app really works** — `verify:construct` in CI, and,
   in the builder, an explicit *Real build* mode.

Rulings:

- **`POST /api/create` no longer boots anything.** It writes the construct
  file and responds, exactly as it does today minus `bootInBackground`. The
  page goes straight to the panel with a LIVE preview.
- The boot moves behind `POST /api/project/boot`, announced over the existing
  `preview` / `preview-error` SSE events, with `PreviewState`'s existing
  four states. `{status:'idle'}` now means "not requested" and the pane
  renders it as a BUTTON, not as "starting…".
- **Background regen on save is OFF by default and only runs while the Real
  build pane is open.** An `npm install` nobody asked for is a silent
  decision and a battery cost.
- **`kai dev` (plain, no `--builder`) is untouched.** That command IS the
  real-project loop, and it stays byte-identical — the same discipline
  `devBuilder` was added under.

**So: yes, the first-boot cost leaves the create flow entirely.** Nothing in
create spawns a process or touches the network. `ensureInstalled`,
`spawn('npm run dev')` and `waitUntilListening` are reachable only from an
explicit user action or from the CLI's own commands.

### R11. The emitter seam — targets and status

The plan (R1) is the seam. Every emitter consumes `ConstructPlan`; **no
emitter may re-read the `Construct`.**

| # | target | consumes | status |
|---|---|---|---|
| 0 | **live runtime** — mounts the plan | plan | **build now** (this spec) |
| 1 | **Solid project** — `kai eject` | plan → source text | ships today |
| 2 | **web-component bundle** — `kai compile` | 1 + vite lib build | ships today |
| 3 | **per-framework integration snippets** — the element tag plus a typed props object, per framework, derived from the same plan and the React wrappers the kit already generates | plan | **designed-for, NOT built** |

**Owner's constraint, recorded explicitly:** create-kai's scaffolder already
owns the "full app per framework" axis — integrations × surfaces ×
frameworks, gate-compiled by `verify:scaffold` across its tsc projects, with
every axis derived from the registry. **`construct eject` must NOT grow a
parallel one.** Target (3) is snippets, not apps: an element plus a typed
props object, the size of a docs code block. The construct FEEDS the existing
axis — the shape, when it is wanted, is that the scaffolder gains a
"seed from a construct" INPUT, never that eject gains frameworks.

**And every new emitter multiplies `verify:construct`'s matrix.** That gate
already runs a real `npm install`, a real `tsc`, a real `vite build` and a
real consumer bundle per cell, in minutes. Target (3) waits for a real
request — a named consumer who wants it — not for a slow afternoon.

A consequence worth recording, not a target: once the runtime exists, a
fourth distribution shape falls out for free — **ship the generic runtime
plus a JSON**, no per-construct build at all. That is what a hosted builder
wants. It is not built here and not designed here.

### R12. Split-awareness — new work, modeled on an existing precedent

Per C4 there is nothing to reuse. The runtime gets its own splitting:

- The runtime's entry contains the spine (ChatThread, createKaiChat, wire
  parse) and the plan interpreter. Nothing else.
- Each of these is a `lazy(() => import(...))` branch, keyed off
  `plan.imports` (R4): the **layout** branch (Dock+DockLauncherImage /
  WorkspaceShell / aside / fullscreen / the `custom` Thread+PromptInput
  spine), **cards** (`BUILTIN_CARD_COMPONENTS`, the form renderer and its
  validation schemas), **conversations**, the **command palette**, and the
  **header/user-menu chrome**. The highlighter is already on-demand.
- A tenant whose construct is `fullscreen`, no cards, no conversations never
  downloads Dock, WorkspaceShell, the form renderer or the palette.
- **Gate**: `scripts/verify-construct-runtime-lazy.mjs`, modeled directly on
  the existing `verify:shader-lazy` (same shape: build, then assert a module
  is NOT in the entry chunk's static graph, with a `--self-test` that
  hand-inlines it and watches the check fail). Assert per branch, and assert
  the branch list is derived from `plan.imports` rather than typed.
- Non-goal for v1: splitting `@kitn.ai/ui/solid` itself. The runtime avoids
  the barrel (R2) rather than fixing it.

### R13. Injection, tenancy, and the untrusted-construct posture

- **Construct in, always as an object.** The runtime never reads a path, never
  fetches its own construct, never touches `process` or `fs`. `mountConstruct`
  is the whole API surface a host needs.
- **Provider injected at mount.** `transport` WINS over `construct.provider`.
  A hosted builder supplies its own transport and the tenant's
  `provider.url` is then never dialed. No flag is needed for that — supplying
  a transport IS the decision, and the app is the one making it. The kit still
  only PARSES: `transport` returns a `Response`, `@kitn.ai/ui/wire` reads it.
- **Identity injected at mount.** `identity.userId` overrides
  `construct.userId`, because in a hosted context the construct file is
  tenant DATA and the viewer's identity is not in it.
- **No keys, no auth, no tenancy, no quotas, ever, inside components.** Not
  as a prop, not as a default, not as a "convenience". Unchanged boundary.
- **A hosted construct is untrusted input.** Today's construct is a file a
  developer wrote; in a hosted builder it is attacker-influenceable. Two
  fields reach a sink: `widget.launcherIcon` → an `<img src>`, and
  `provider.url` → `fetch`. **The URL policy goes in `plan.ts`** — `isSafeUrl`
  / `SAFE_SCHEMES` from `src/primitives/url-scheme-policy.ts`, the existing
  guard, never a third policy — so the plan carries an already-filtered
  `launcherIcon: string | null` and BOTH emitters inherit it. That is a small
  real hardening for `eject` too, and it is the cleanest demonstration that
  the seam pays for itself.
- **The runtime never evaluates construct-supplied code.** There is none —
  the format has no code-in-JSON and this spec does not add any.

### R14. Docs and the coupling map

`docs/coupling-map.md` gains rows for: plan ↔ codegen (guard:
`lint:construct-plan` + the parity test), plan ↔ runtime (guard: parity
test), runtime ↔ `define.tsx`'s shadow host (guard: the shared
`createShadowHost`), preview page ↔ `serveBuilderAsset`'s walk-up resolver
(guard: `resolveBuilderPageDir`'s test), runtime lazy branches ↔
`plan.imports` (guard: `verify-construct-runtime-lazy`). §4's derived-list
register gains `plan.imports` as a derived list.

---

## Non-goals

1. **Not building the hosted product.** No auth, tenancy, billing, storage or
   multi-user design. R13 only ensures none of it is precluded.
2. **Not replacing `eject` or `compile`.** Both keep their exact contracts.
3. **Not touching plain `kai dev`.** It stays byte-identical.
4. **Not changing the construct schema.** This spec is purely additive to
   `codegen`/`dev`/the builder page; `schema.ts` is not edited. (Which also
   means it does not collide with the modes-manifest and screens-gallery
   arcs, which do.)
5. **Not building emitter target (3).** Designed for; waits for a request.
6. **Not splitting `@kitn.ai/ui/solid`.** The runtime avoids the barrel.
7. **Not making the runtime SSR-able in v1.** Client mount only. The
   `.server.js` twin pattern exists (`solid.server.js`, `define.server.js`)
   and this can follow it later; a construct preview has no SSR consumer yet.
8. **No hot-swapping of arbitrary code.** The runtime interprets DATA. This
   is not a Vite HMR replacement and does not become one.
9. **Not migrating the legacy `BuilderPanel` stub stories** onto the real
   panel. Still recorded follow-up.
10. **Not adding a device-frame / responsive preview.** The iframe makes it
    possible; it is not in scope.

---

## Complications in the current tree (record loudly)

1. **`codegen.ts` is ~1900 lines of ~70 `emit*` functions that each read
   `c.<field>` directly.** R4's refactor touches nearly all of them. It must
   be **byte-preserving**: the safety net is `codegen.test.ts`'s determinism
   and golden assertions plus `verify:construct`, both green with a ZERO-byte
   diff in emitted output. Large, but mechanically checkable — which is the
   only reason it is proposed as one task rather than five.
2. **`builder-preview.ts`'s duplicated contrast math** (C5) must be deleted
   in the same task that lands `plan.ts`, or the spec ships having documented
   the drift it exists to prevent.
3. **`emitCustomApp` is a genuinely different composition** — `Thread` +
   `PromptInput` rather than `ChatThread`, with starters / attachments /
   reasoning / header / empty / conversations deliberately NOT wired. The
   runtime must reproduce that asymmetry exactly, or the parity test fires.
   Two spines, on purpose, on both sides.
4. **The builder page is PREBUILT** into `dist/builder-page/` by
   `vite.config.builder-page.ts`, and `resolveBuilderPageDir` walks up
   looking for `builder-page/index.html` specifically. The preview page must
   be a second entry inside that same directory (cheapest correct answer), or
   the resolver grows a second target and a second failure mode.
5. **`PreviewState`'s `idle` changes meaning** — from "no construct yet" to
   "the real build has not been requested". `dev.test.ts` pins
   `previewFields`' shape and `App.test.tsx` pins the placeholder copy
   (`PREVIEW_STARTING_MESSAGE` is exported precisely so the test asserts the
   real string). Both move.
6. **Non-determinism in the rendered DOM** — `crypto.randomUUID` in the
   emitted submit, `createUniqueId` throughout the kit's primitives, and the
   mock responder — is what makes R6's normalizer load-bearing, and is why it
   gets its own negative test rather than a comment.
7. **The `emitted` project costs seconds per test by construction**, and its
   budget lives in `packages/ui/emitted-code-tests.ts`, not in a spec. Keep
   the in-suite parity matrix at one cell per layout; the full matrix belongs
   to `verify:construct`.
8. **`@kitn.ai/ui/solid`'s `export * from './index'`** means importing the
   runtime's dependencies through the barrel defeats splitting before it
   starts. The runtime must import from `../components/*` / `../ui/*`.
9. **Three files this arc will touch are dirty right now** on
   `feat/modes-and-screens` (`schema.ts`, `builder-panel-derived.tsx`,
   `construct-form-paths.ts`) and two other design arcs
   (modes-manifest, screens-gallery) are in flight against the same modules.
   Task 1 should land after those settle. This spec deliberately does not
   touch `schema.ts` (non-goal 4) to keep the collision surface to the panel.
10. **`kai dev --builder` currently has no `.kai/`-free path at all** — the
    `boot` closure does codegen, install, watch-attach, catch-up-regen and
    spawn as one unit. R10 splits it; the watcher attach (which the SSE
    hand-edit path depends on) must move OUT of `boot` and become
    unconditional, or hand-edits stop flowing the moment the real build is
    not running.

---

## Task breakdown

Each task lands green on its own gates. Tasks 1–2 are one PR-unit (the plan
is useless un-consumed, and the byte-diff gate is what proves the extraction
was faithful).

**Task 1 — `plan.ts`: the seam.**
Files: `src/agent-tooling/construct/plan.ts` (new: `ConstructPlan`,
`resolveConstruct`, the contrast math moved here, `isSafeUrl` applied to
`launcherIcon`), `src/agent-tooling/construct/plan.test.ts` (a plan snapshot
per fixture; the URL-policy rejection cases; the contrast table — moved from
`codegen.test.ts`'s "accent contrast" block, which stays as the numbers'
source of truth), `src/components/builder-preview.ts` (DELETE the duplicated
math, import from `plan.ts`, delete the now-false comment).
Gates: `--project=unit`; `nx typecheck ui`; a new
`scripts/lint-construct-plan-purity.mjs --self-test` proving it detects a
planted `node:path` import.

**Task 2 — `codegen.ts` becomes a printer.**
Files: `src/agent-tooling/construct/codegen.ts` (every `emit*` takes
`plan`; `generateProject` is the only site naming `Construct`),
`src/agent-tooling/construct/codegen.test.ts` (unchanged assertions — that is
the point; ADD the R5 wire-call pin), `scripts/lint-construct-plan.mjs`
(single-`Construct`-occurrence check, `--self-test`).
Gates: `--project=unit` with **zero byte changes** in every golden;
`verify:construct` (needs `nx build ui` first); `nx typecheck ui`;
`lint:silent-drops` (the refactor rewrites `MessagePart`-adjacent code).

**Task 3 — the shared shadow host.**
Files: `src/elements/define.tsx` (extract the shadow-attach + adopted-sheet
+ `.dark` wrapper + `ChatConfig` block into an exported
`createShadowHost`/`ShadowHost`; `renderFacade` calls it),
`src/elements/define.test.tsx` or the nearest existing pin (assert the
extraction is behaviour-identical, especially the SYNCHRONOUS pre-attach —
its comment documents a first-paint transition flash if it is deferred).
Gates: `--project=unit`; `--project=storybook` (the flash is a rendering
regression no unit test sees); `nx build ui`.

**Task 4 — the runtime.**
Files: `src/construct-runtime/index.tsx` (`ConstructRuntime`,
`mountConstruct`, transport/identity injection),
`src/construct-runtime/layouts/*.tsx` (lazy branches),
`src/construct-runtime/chat.ts` (the runtime's `createKaiChat` wiring +
history effect + card-tool application — R5's twin),
`vite.config.construct-runtime.ts`, `package.json` (`"./construct/runtime"`
exports key + the build chain entry), `src/construct-runtime/*.test.tsx`
(per-layout mount, transport override wins over `construct.provider`,
identity override, a rejected `launcherIcon`, remount-on-layout-change,
prop-update-without-remount).
Gates: `--project=unit`; `nx build ui`; `verify:dts` / `verify:pack`
(a new export key moves both); `verify:consumer` (a new entry must survive a
real consumer bundler).

**Task 5 — the parity gate.** *(the task this spec exists for)*
Files: `tests/agent-tooling/construct-runtime-parity.live.test.ts` (the
normalizer, the cells derived from the schema artifact's layout enum + the
fixtures dir, the scripted turn, the negative-construct case, the normalizer
self-test), possibly `packages/ui/emitted-code-tests.ts` (only if the suffix
must widen — prefer not).
Gates: `--project=emitted` (**watch the negative case fail first** — a parity
test that cannot fire is the exact thing this repo has shipped before);
`tests/agent-tooling/emitted-project-wiring.test.ts` still green.

**Task 6 — the preview page + the bridge.**
Files: `src/construct-runtime/preview-page/{index.html,main.ts}`,
`vite.config.builder-page.ts` (second entry into the same output dir),
`src/agent-tooling/construct/dev.ts` (`serveBuilderAsset` reaches
`/preview/`; origin check documented on the page side),
`src/agent-tooling/construct/dev.test.ts` (asset resolution for the second
entry; the walk-up resolver still finds the dir).
Gates: `--project=unit`; `nx build ui` (the page is prebuilt — a missing
artifact must fail loudly, the way `builderPageDir()` already does).

**Task 7 — the builder page: store, autosave, bridge, conflict.**
Files: `src/builder-app/App.tsx` (store; instant post to the preview;
local `validateConstruct`; debounced autosave with `writeId`; the four-state
save chip; `Mod+S`; the disk-conflict prompt; the Live | Real build toggle),
`src/builder-app/edit-guard.ts` (the monotonic request id keeps its job; the
`writeId` echo is additive), `src/builder-app/App.test.tsx` (invalid
intermediate: store changes, preview does NOT, file is NOT written, problems
render; echo suppression; conflict prompt; chip states; the flush paths).
Gates: `--project=unit`; `nx build ui`.

**Task 8 — `.kai/` off the inner loop.**
Files: `src/agent-tooling/construct/dev.ts` (`/api/create` stops booting; the
watcher attach moves out of `boot` and becomes unconditional —
complication 10; new `POST /api/project/boot`; `idle` means "not requested"),
`src/agent-tooling/construct/dev.test.ts` (create spawns nothing; hand-edits
still flow with no project booted; boot-on-demand announces over SSE;
regen-on-save only while the real-build pane is open).
Gates: `--project=unit`; **manual IVP at arc end** per the defer-IVP policy —
`kai dev --builder` from a clean checkout: create is instant and spawns
nothing, a slider moves the preview in the same frame, the file appears
after the debounce, a hand-edit flows back, an invalid intermediate holds the
last good preview, and *Real build* still produces a working Vite preview.

**Task 9 — split-awareness gate + docs.**
Files: `scripts/verify-construct-runtime-lazy.mjs` (+ `--self-test`),
`package.json` script entry, CI wiring, `docs/coupling-map.md` (R14's rows +
§4 register), `apps/docs/` runtime page if the export is public-facing.
Gates: the new script's `--self-test` FIRST; `lint:gate-parity`;
`lint:thresholds` if any threshold is introduced.

---

## Open questions for the owner

1. **Is `"./construct/runtime"` a PUBLIC export or an internal one?** Public
   means it is a supported API with a docs page and a compatibility promise
   (and it is what a hosted product would consume). Internal means the
   builder uses it and nothing else does, and R13's injection surface is
   speculative. Recommend **public** — the injection design is the whole
   commercial-readiness ask and it is cheap now, expensive to retrofit.
2. **Does the Real build pane stay in the builder at all**, or does the
   builder simply print `kai dev` and let the terminal own it? The toggle is
   nicer; the terminal is honest about what it costs. Recommend the toggle,
   with the button copy naming the cost.
3. **Should an explicit Save button ship alongside the chip?** Recommend yes
   (R9's reasoning).
