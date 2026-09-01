# Handoff: blocks shipped, and what owner eyes keep catching (2026-09-01)

Written cold, for the owner and the next supervisor session. The headline
is the process section — the feature work went well, but the four times
the owner caught what agent verification called green are this session's
real yield, and they change how block acceptance must be run from here on.

## Where the code is

**On main (origin), merged:** phases 0–4 of the blocks-and-parts plan
(`docs/superpowers/plans/2026-08-31-blocks-and-parts.md`, spec beside it
dated the same day, all three open questions RULED by the owner in the
spec itself). PR #353 was phase 0 (the modes-and-screens branch: builder
housing, theme studio, scripted mocks, the composition spike, and T-5
Amendments 3+4). PR #355 carried phases 1–4 in one branch: the seven
parts, kai-chat as a thin preset, three blocks + `verify:blocks`, and
`create-kai add`. PR #356 carried gallery round 1 (task 5.1), the
theme-studio SSR fix, and the measured block-fidelity round.

**PR #357 (gallery round 2: framework axis, zip download, icon buttons —
one commit, 497f5834) is OPEN and merging as this is written.** The local
checkout sits on `feat/blocks-gallery`, whose content equals #357. Local
`main` is BEHIND origin/main (it lacks the #356 merge) — fetch before
reasoning from it.

Two pieces of local state to know about:

- The owner may have dev servers running — including a block-driver serve
  on its default port 8952 (`packages/ui/scripts/block-driver/serve.mjs`).
  Check before binding ports; kill orphans by cwd, never by pattern.
- One stray untracked `support-widget.construct.json` at the repo root:
  the owner's own local testing. Not committed, not yours to clean up.

## What shipped (compressed; the commits carry the detail)

- **The seven parts** (PR #355, lanes 1A–1E): kai-panel family
  (f525fb58), kai-tab-bar + kai-tab-bar-item (c0a76ec6), kai-view-stack +
  kai-view with the drill grammar pinned by behavioral tests (7bda7ebd),
  kai-row + the conversation-item `panel` density + unread dot
  (82f64f65), `createConversationController` + the fail-loud icon roster
  (a7739fb9), phase-close regen + coupling-map §10 (838ec138).
- **kai-chat is a thin preset over the parts** (1764895b, P-9): interior
  chrome replaced wholesale, block-driver baseline byte-for-byte across
  its states in both schemes, existing stories and tests untouched. The
  driver itself (b69006c2) generalizes the spike's `fine-drive.mjs`:
  record/diff/parity modes, behavioral + computed-style probes, planted
  failures watched red first.
- **Three blocks + the gate**: registry + CDN-form generator +
  support-widget (06e04253 — the spike prototype rebuilt on parts, private
  chrome gone), assistant + in-app-assistant with rich scripted mocks
  (ca975d36), `verify:blocks` in the required job with cells derived from
  the directory scan and eight planted self-test failure classes
  (2f3fcde3).
- **`create-kai add <block>`** (8d9353d8): registry + per-block-JSON-URL
  resolution, `registryDependencies` over blocks and backend routes,
  framework detection (react → react form · other project → web
  components · no project → CDN paste · ambiguity asks loudly).
  Acceptance was real consumer apps building and streaming in Chromium,
  which caught two consumer bugs pre-ship.
- **The gallery** (a61edf00 + 497f5834): a route on the construct dev
  server, dogfooding WorkSurface/FileTree/CodeBlock, with the owner's
  binding presentation ruling — **the file tree leads; generated forms
  (registry JSON, cdn.html, driver pages) are build artifacts under
  `dist/blocks/` and gitignored `pages/generated/`, never committed**
  (00cfd578, dated amendment in the spec). Round 2 adds the framework
  axis: one shared pure renderer (`agent-tooling/blocks/forms.ts`)
  consumed by BOTH `add` and the gallery, so what the gallery shows IS
  what `add` writes, plus a dependency-free zip download validated
  against real unzip.
- **Guards extended**: `lint:story-conventions` joins the required job
  (8daac046, d4e91cea — owner-spotted drift, now impossible);
  solid-coverage gains its first reviewed facade-equivalence declaration
  (a2a10034); the shadow-sheet scan correctly flagged the gallery app and
  got a registered reason (f9b2d81b).
- **Two root fixes the blocks forced**: the define.tsx untrack class fix
  (86ef104d — facade bodies ran inside a tracked children thunk; see
  process lesson c) and the theme-studio docs page surviving astro dev
  SSR (6f1e4ae5 — lucide-solid's module-scope templates, replaced by a
  local SSR-safe icons.tsx).

## The process lessons (the real yield)

**(a) Owner eyes beat agent eyeballs + checklists — four times.** Twice
in the composition spike (the fine-widget fidelity rounds, 0b6c1b7b and
dbb300c5: a feature checklist passed while the widget was visibly wrong,
two rounds running). Then twice again AFTER we thought we'd learned it:
the support-widget squish was recorded INTO the driver baseline
(3cdb5fc8 — the reference screenshots normalized a defect, so the parity
gate proved the block matched its own bug), and the gallery presented
framework-neutral authored files as copy-ready, which read as confusion
to any React or Angular dev (497f5834). The standing rule from here:
**block and visual acceptance is MEASURED against a reference surface**
(the facade, or explicit relationship probes like 3cdb5fc8's gap
assertions — never a self-recorded baseline alone), **and the supervisor
personally reads the screenshots.** Never relay a worker's "looks
coherent" upward; that sentence has been wrong four times this cycle.

**(b) The final-gate checklist must mirror CI's `test` job exactly.**
The pre-merge local list for #355 skipped `verify:ssr`/solid-coverage;
CI caught six new elements registered without their `./solid` exports
(a2a10034). The fix cost a follow-up commit; the lesson costs nothing:
read the gate set from the workflow (`lint:gate-parity --list` prints
it), never from memory.

**(c) The gap-filling loop works — run it on purpose.** Building blocks
found three real kit bugs no unit suite had touched: kai-view-stack
losing the root on back() from a non-default tab (6744a412), facade
bodies running tracked so navigation rebuilt controllers and
kai-pane-group's select() was dead after boot (86ef104d), each closed at
the root with a seam test or guard, never worked around in the block.
This is V-4 from the spec working as designed: a block that hits a wall
produces a kit fix + a guard before it ships. Keep that discipline for
the remaining blocks.

## Open work, in priority order

1. **The kit-fix batch** — findings the block round recorded, each cheap
   and each already restated or worked around at least once:
   - `relativeTimeShort` exported from stores (restated a THIRD time in
     blocks, ca975d36).
   - `localStorageStore` guarded reads: localStorage ACCESS throws under
     the Artifact sandbox's opaque origin, degrading sandboxed previews'
     conversations rail (a61edf00).
   - prompt-input/composer self-clear-on-submit — needs a design look,
     not just the flag (blocks call clear() manually today).
   - **React wrapper slot/attr forwarding** — the runtime forwards only
     className/style/id, which is what blocks the idiomatic typed react
     form (8d9353d8 shipped the honest minimum instead).
   - kai-button dot affordance.
   - conversations search box is blind to item-mode rows.
   - the kai-view flex-on-host trap: the shadow style node counts as a
     flex item, so host `gap` opens a phantom gap above content
     (3cdb5fc8) — kai-view could kill the class for every consumer.
   - the block driver's crash path can orphan its serve process.
2. **The MCP round** (plan Phase 8, spec M-1..M-4): cell-scoped
   `component_reference` reading delivery × integration from the project
   on disk, the `validate` tool, verified snippets quarried from gated
   block sources, `add` via MCP.
3. **The docs-site Blocks section** (Task 5.3): the public gallery on
   ui.kitn.ai, same grammar as the dev-server route. Known gap going in:
   **WorkSurface has no `kai-*` facade** — fill per V-4, don't work
   around.
4. **V-2's add-form typecheck cell** — deliberately deferred (2f3fcde3)
   to ride the react-form work, since the react variant is what it would
   compile.
5. **Phase 7, the deprecation round** — config-route parking banners and
   the builder front-door flip to the gallery. The plan gates this on
   the gallery working, which it now does.

Also open from the plan, not superseded: Task 5.2 (theme-studio-beside-
a-block live theming; `themePayloadToCss` does not exist yet) and Phase
6's remaining approved v1 blocks (research, workspace — three of five
block directories exist today; `create-kai add --list` prints the
current count).

## Awaiting the owner's ruling — do not start these

- **Per-message-actions slot design.** P-6 landed home/header/footer;
  per-message actions was an owner-approved deferral (a shadow slot
  cannot repeat per message — needs a real design, 1764895b).
- **Facade declarative custom tabs** — element-level API vs "that's what
  a block is for".
- **The tier-1 construct call** — scheduled for plan end, decided
  against the working gallery (spec open question 3, timing confirmed).
- **Whether blocks gain more categories/candidates next.** The voice
  widget stays gated on the realtime adapter (`readRealtimeEvents` in
  `wire/`), spec'd as a named dependency, shown in the gallery only when
  it works.

## Traps for the next supervisor

- **Build contention.** Two agents building one checkout wipe `dist/`
  under each other mid-run. Serialize builds; parallel editors get
  worktrees (and the fresh-worktree three-step from CLAUDE.md).
- **Port 8952** is the block driver's default serve port and may be held
  by the owner's running instance.
- **`gh pr checks --watch` right after a push can latch onto a STALE
  run** and report yesterday's verdict. Sleep 60–90s after pushing
  before watching.
- **A running astro dev serves a stale module graph after a fix** — the
  SSR-crash class in 6f1e4ae5 looked unfixed until a fresh restart.
  Restart, then judge.
- **Blocks' generated forms live in `dist/blocks/`** (driver pages in
  gitignored `pages/generated/`). Registry/gallery tests and
  `verify:blocks` read build output — rebuild first, and remember a
  cached `nx build ui` can skip generators; `build:api` inside
  `packages/ui` or `--skip-nx-cache` when artifacts matter.
- **The emitted suite and `verify:blocks` both need a REAL build** — the
  same prerequisite CLAUDE.md documents for the manifest tests, now with
  two more customers.
