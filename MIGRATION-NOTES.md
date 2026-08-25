# Solid v2 mechanical migration — running notes (Phase 1)

Branch scope: dependencies + `packages/ui/src/primitives/` + `packages/ui/src/ui/` only.
Specs: `docs/superpowers/research/2026-08-24-solid-v2-spike.md` (sweep rules R1/R2) and
`.superpowers/sdd/2026-08-24-form-field-formats/solid-v2-research.md` (rename table).

## Sweep rules being applied

- **R1** (spike Q-B): every `createEffect` splits into `(compute, apply)`; refs/DOM
  nodes and anything render-produced are read in the APPLY, never the compute. The
  compute holds only tracked reactive reads and returns them as a value.
- **R2** (spike verdict #2): every `onMount(() => expr)` gains braces when it becomes
  `onSettled` — a non-function return hard-crashes dev (`REACTIVITY_HALTED`).
- Renames: `mergeProps`→`merge` · `splitProps(props, KEYS)`→`const local = props;
  const rest = omit(props, ...KEYS)` · `solid-js/store` subpath→`solid-js` (draft-first
  setters, no `produce`) · `solid-js/web`→`@solidjs/web` · `type JSX` imports→
  `@solidjs/web` (solid-js v2 does not export the JSX namespace) · `unwrap`→`snapshot`.
- `untrack(...)` wrappers inside an effect body are dropped when the body moves to the
  apply phase (apply is untracked by construction); standalone `untrack` reads stay.

## Dependencies (Phase 1a) — DONE

- `packages/ui/package.json`:
  - `solid-js` `^1.9.0` → **`2.0.0-rc.2`** (exact pin; `next` tag as of 2026-08-25 —
    newer than the spike's rc.1)
  - added `@solidjs/web` **`2.0.0-rc.2`**, `@solidjs/element` **`2.0.0-rc.2`** (deps)
  - removed `solid-element` `^1.9.1`
  - devDeps: `@solidjs/testing-library` `^0.8.0` → **`1.0.0-beta.2`** (the only version
    peering on solid >=2; the spike called it "untried" — treated as an experiment,
    see test results below); added `@solidjs/vite-plugin` **`3.0.0-next.32`** (pinned —
    the `latest` tag; `next` is OLDER, spike Q-E #7). `vite-plugin-solid` ^2.11.0 is
    KEPT for now because `storybook-solidjs-vite` still needs it (phase 2+ decision).
- `packages/ui/tsconfig.json` + `tsconfig.tests.json`: `jsxImportSource` `solid-js` →
  `@solidjs/web`. NOT touched (later phases, per assignment): `tsconfig.mcp.json`
  (comment only), `vitest.react.config.ts` (react, not solid), the scaffolder's tsc
  projects (`scripts/lib/consumer-tsc-projects.mjs`, `verify-scaffold-compiles.mjs` —
  these compile EMITTED consumer code, which still targets whatever solid the scaffold
  pins), examples/ starters, apps/docs.
- `packages/ui/vitest.config.ts`: plugin swap `vite-plugin-solid` → `@solidjs/vite-plugin`.

### Judgment call: lucide-solid patched via pnpm patch

`lucide-solid@0.400.0` (latest too) peers on solid 1.x and its `solid` export condition
ships source JSX importing `splitProps` from `solid-js` and `Dynamic` from
`solid-js/web` — both gone in v2, and ~11 files in the `ui/` slice import icons from it.
No v2-compatible release exists. Rather than fork the icon layer (feature work), the one
affected file (`dist/source/Icon.jsx`) is patched via **pnpm patchedDependencies**
(`patches/lucide-solid@0.400.0.patch`, registered in the ROOT `package.json` by
`pnpm patch-commit`): `splitProps`→`omit` (localProps aliases props), `Dynamic` from
`@solidjs/web`. Individual icon modules import only `Icon` — nothing else needed.
Supervisor should note this touches the root package.json + a new `patches/` dir.

## Per-file sweep log (Phase 1b)

### Source sweep — `src/ui/` + `src/primitives/` (all edits tagged `V2-PORT` in-file)

Rule application counts (grep `V2-PORT` for the exact sites):

- **splitProps → alias + omit**: ~24 files (every `const [local, rest] = splitProps(props, [K])`
  became `const local = props; const rest = omit(props, ...K)`; pick-only splits became a
  plain alias; drop-only (dropdown.tsx:192) became bare `omit`). `local` aliasing `props`
  widens its type to the full props — harmless for reads, and reads stay reactive.
- **mergeProps → merge**: card.tsx, segmented.tsx.
- **solid-js/web → @solidjs/web** (Portal/Dynamic): card, hover-card, tooltip, dropdown,
  dialog, overlay (+ overlay.stories).
- **`type JSX` import → @solidjs/web**: every ui/primitives file that names JSX (solid-js
  v2 does not export the JSX namespace). Includes icon.tsx, textarea.stories,
  dock.stories (inline `import('solid-js').JSX`).
- **createEffect compute/apply splits** (R1 applied at every site):
  - `input.tsx:189` — the spike's exact Q-B port: tracked reads (format/config/affix) in
    the compute; `rowEl`/`plainEl` read in the APPLY; `untrack()` wrapper dropped.
  - `editable-label.tsx` ×3 — prop→signal syncs write in the apply (braces per the
    EffectFunction return type: an apply returning a non-cleanup value is a type error,
    and would be R2-adjacent at runtime); the focus effect's DOM walk is in the apply.
  - `overlay.tsx` ×3 — createPresence (prev-memory became the compute value; in-effect
    `onCleanup` became the apply's returned cleanup), usePosition (element SIGNALS read
    in the compute — that is the tracked dependency; observers built in the apply; NOTE:
    `options.arrowEl` is now untracked, matching its own documented "read at setup"
    contract), useDismiss.
  - `dock.tsx`, `dialog.tsx` — focus choreography effects: removed `initialValue` arg
    became a default on the apply's prev parameter (`wasOpen = seed`).
  - `resizable.tsx` — maximize-notify effect: the hand-rolled `prevMax` sentinel became
    the apply's prev parameter.
  - `use-audio-analysis.ts`, `use-sequencer.ts` — tracked reads in compute; graph/rAF
    setup in apply; in-effect `onCleanup` → returned cleanup.
- **onMount → onSettled (R2)**: ZERO sites in this slice (the ~251 count lives in
  components/elements — phase 2 carries R2).
- **classList / `<Index` / batch / createResource / Suspense / ErrorBoundary**: zero
  sites in the slice.
- **stores**: toast-store.ts only — `createStore` from `solid-js`; path setters
  `setToasts(idx, v)` → draft mutations; `produce(fn)` → the draft callback;
  `setToasts([])` → `setToasts(() => [])`. `getToasts()` return cast (v2 Store<T> is
  Readonly<T>; the public mutable-array signature is kept — callers never mutate).
  NOTE for phase 2: `dismiss()` returns `list.filter(...)` from the draft callback
  (return-replaces) — worked under test; keep an eye on draft-proxy identity.
- **Context.Provider → context-as-provider**: resizable, hover-card, dropdown (Ctx +
  SubCtx), collapsible, chat-config, card-host.
- **Contexts get a `null` default** (all of the above that had none): v2's useContext
  THROWS (`ContextNotFoundError`) when the resolved value is undefined — passing
  `undefined` as a default does NOT help (the guard checks the resolved VALUE). `null`
  restores the 1.x absent-provider behavior; the `if (!c) throw` friendly guards and
  `ctx?.` consumers work unchanged. `useCardHost` maps null→undefined to keep its
  public contract.
- **aria-* booleans → 'true'/'false' strings**: v2's JSX types take
  `EnumeratedPseudoBoolean` for aria enumerated attrs. Sites: collapsible
  (aria-expanded in triggerProps), command (aria-selected), nav, popover.stories,
  segmented (aria-pressed), switch (aria-checked), dropdown (aria-expanded ×2).
  Runtime-identical (1.x serialized booleans to these strings for aria).
- **`bool:` namespace removed** → plain `inert={...}` (collapsible, dock); v2 handles
  boolean attributes natively.
- **camelCase attr aliases dropped by v2**: `tabIndex` → `tabindex` (resizable,
  hover-card).
- **onCleanup inside ref callbacks (unowned in v2 — SILENT no-op, spike Q-D)**: two
  real sites found and fixed:
  - `dropdown.tsx` submenu surface: parent-registry unregister moved out of the ref
    into an owned effect on `presence.present()` + component-scope onCleanup.
  - `hover-card.tsx` trigger: focusin/focusout + slotchange teardown moved to a
    component-scoped `refDisposers` list drained at disposal.
- **v2 semantics bug found in src** (not test shape): `use-voice-recorder.ts` `start()`
  catch read `stream()` same-tick after `setStream(mediaStream)` — under staged writes
  that read returns the last COMMITTED value (undefined), so the mic stayed open on the
  exact failure path the catch exists for. Fixed by tracking the acquired stream in a
  local (`acquired`) instead of signal read-back. Behavior now matches 1.x exactly;
  the existing test pinned it.

### Test-shape sweep (tags: `V2-FLUSH`, `V2-SHAPE`) — per the spike's Q-A/Q-C analysis

No assertion VALUES were changed anywhere; only when state is committed/observed:

1. **`flush()` after events/setters/timer-advances/microtask unmounts** — the staged-write
   class. Files: tests/ui/{input-node-identity (the spike's own 5/5 recipe, verbatim),
   input-mask-integration, collapsible, dropdown, hover-card, tooltip, overlay},
   src/ui/{editable-label,nav,popover,switch,hover-card,tooltip,overlay}.test,
   src/primitives/{create-tween,controllable,create-kai-chat,message-feedback,
   toast-store,use-audio-analysis,use-sequencer,use-speech-recognition}.test,
   tests/primitives/{use-text-stream,use-voice-recorder}.test. A close through
   createPresence needs flush → await microtask → flush (the microtask's own
   setPresent is staged too).
2. **REACTIVE_WRITE_IN_OWNED_SCOPE reshapes** — v2 dev REJECTS signal writes inside a
   root's synchronous owned scope. Idiom adopted: CREATE inside `createRoot`, return
   the API (+ dispose), DRIVE outside — probes confirmed writes outside are legal and a
   cleanup that writes is legal when dispose() is called outside. Async root bodies
   instead get one `await Promise.resolve()` before driving. create-tween.test also
   gained an `ownedTween()` helper (own root per tween, roots drained in afterEach).
   **Upstream observation worth reporting**: @solidjs/signals rc.2's STORE-setter guard
   explicitly exempts root bodies ("Roots are not owned computation scopes … legacy
   parity") but the SIGNAL guard has no `_root` exemption — the asymmetry looks like an
   rc bug; if it is fixed upstream these reshapes become unnecessary but stay correct.
3. **One-arg createEffect in tests** → two-arg (create-tween.test's two
   does-not-self-depend tests; the imperative `.to()` drive is the apply, which is
   untracked by construction — the property those tests pinned now holds structurally).
4. **Keyboard-open focus** (dropdown tests): the menu mounts at flush; the focus lands
   via queueMicrotask after it — tests await one microtask before asserting
   `document.activeElement`.

### Verification status

- **tsc (slice)**: `packages/ui/tsconfig.v2slice.json` (TEMP scaffold, delete in phase 2)
  — 0 errors in src/primitives + src/ui + src/utils, EXCEPT
  `src/ui/prompt-dock.stories.tsx` (2 errors) whose cause is the un-migrated
  `src/components/prompt-input.tsx` (its `JSX.*HTMLAttributes` collapse). Clears in
  phase 2. ~192 errors remain in components/elements (expected, out of scope).
- **vitest (slice)**: `vitest run --project=unit src/primitives tests/primitives src/ui
  tests/ui` → **751/751 tests pass**. 3 test FILES fail at COLLECTION only —
  tests/primitives/{artifact-card,card-registry,card-contract-exports} — because they
  transitively import un-migrated `src/components/form.tsx` / `card-renderer.tsx`
  (`solid-js/store` / `solid-js/web` specifiers). First thing phase 2 unblocks.
- Full `nx typecheck ui` / full unit suite are RED by construction until phase 2
  (components/elements un-migrated).

### Where phase 2 starts

1. `src/components/form.tsx` + `card-renderer.tsx` (unblocks the 3 collecting-failing
   card test files), then the rest of `src/components/`, then `src/elements/`
   (solid-element → @solidjs/element in `define.tsx`; remember the element suites need
   mount flushes — spike Q-C's custom-element asymmetry). R2 (onMount brace pass) lives
   almost entirely there (~251 sites).
2. `tsconfig.mcp.json`/scaffolder tsc projects/examples/apps-docs jsxImportSource
   decisions (deliberately untouched — they compile EMITTED consumer code or other
   packages).
3. Storybook: `storybook-solidjs-vite` still pins `vite-plugin-solid` 2.x (kept
   installed for it); unresolved for v2.
4. Delete `packages/ui/tsconfig.v2slice.json` once the full typecheck chain is green.


# PHASE 2 — components/ + elements/ + build pipeline (2026-08-25)

Exit gates, all run at the phase boundary:
- `nx typecheck ui --skip-nx-cache` GREEN; `npm run typecheck` in packages/ui GREEN
  (verify:quarantine + all five tsc passes, MCP pass against the fresh dist).
- `nx build ui --skip-nx-cache` GREEN (full vite pipeline, DOM + SSR builds).
- `vitest run --project=unit` GREEN: 330 files, 4530 tests, zero failures.
- `vitest run --project=emitted` GREEN: 35/35 (scaffolder emits execute unchanged).
- `verify:consumer` GREEN (83/83 kai-* registrations survive a consumer bundle).
- `lint:silent-drops` + `lint:cdn-pins` GREEN.
- `verify:scaffold` RED — 26 solid-framework scaffolds: the gate compiles EMITTED
  CONSUMER code against the repo node_modules, where solid-js is now v2, while the
  emitted code targets consumer Solid 1.x. Per instruction the scaffolder templates
  were NOT migrated; the fix is the gate resolving the CONSUMER-pinned solid
  version (phase 3). This is a required-CI job, so it is a known merge blocker
  until that lands.

## Mechanical sweep (same rules as phase 1; tags V2-PORT / V2-FLUSH / V2-SHAPE)

- All phase-1 renames across ~236 files: splitProps/mergeProps, solid-js/web →
  @solidjs/web, solid-element → @solidjs/element (define.tsx import — spike Q-D),
  type-JSX imports, Context.Provider, `<Index>` → `<For keyed={false}>` (identical
  children signature in v2 — pure rename; message.tsx's load-bearing Index comment
  updated in place), `declare module 'solid-js'` JSX augmentations → '@solidjs/web'
  (38 story files), camelCase attr aliases dropped by v2 (tabIndex/maxLength/
  minLength/contentEditable → lowercase), `bool:` removed → plain `inert`,
  aria enumerated attrs → 'true'/'false' strings (~25 sites), classList → `class`
  object/array form (define.tsx + 5 story files, merged with existing class).
- **onMount → onSettled (R2)**: 77 sites; 2 concise arrows braced by the sweep;
  every body already braced elsewhere.
- **onCleanup inside onSettled is FORBIDDEN in v2** (CLEANUP_IN_FORBIDDEN_SCOPE —
  a rule the spike did not have): single-trailing-cleanup bodies now RETURN the
  cleanup (onSettled supports a returned disposal cleanup); bodies with early
  returns/multiple cleanups collect into a per-site `settledDisposers` array
  registered once with owner-scope onCleanup (identical lifecycle to 1.x).
  ~45 sites across elements/ + stories.
- **Creating reactive primitives inside onSettled is forbidden**
  (PRIMITIVE_IN_FORBIDDEN_SCOPE): elements/resizable's maximizedIndex effect
  hoisted out of onSettled to the facade body.
- **`on()` is REMOVED in v2** (the memo listed it as kept — wrong): every
  `createEffect(on(dep, fn))` collapsed to the two-argument form; the 7+
  `{ defer: true }` sites use the new `src/utils/defer-apply.ts` helper
  (skip-first-apply), audited one-by-one against the pre-migration tree after the
  transformer was caught silently dropping defer on multiline sites.
- **merge() overrides on key presence** (1.x mergeProps skipped undefined) — the
  memo's flagged trap, real here because facades pass whole prop bags: all nine
  former mergeProps default sites now use `src/utils/merge-defaults.ts`, which
  reproduces the 1.x rule exactly.
- **R1 extension — strict reads**: v2 warns on bare reactive reads inside an
  effect APPLY ("an effect callback") and inside COMPONENT BODIES. Applies that
  keep reads now untrack() them explicitly (shader-canvas uniforms, form seed,
  disclosure); deliberate seed-once body reads untracked (ui/input id). NOT
  swept exhaustively — remaining strict-read warnings are dev-only noise, listed
  as phase-3 hygiene.
- **createResource → signal + two-arg effect** (code-block highlighter): same
  contract (undefined until resolved, stale results dropped via returned cleanup).
- **createContext defaults**: v2 useContext THROWS on undefined resolution;
  same null-default treatment as phase 1 where needed.
- **Component-body signal writes rejected** (REACTIVE_WRITE_IN_OWNED_SCOPE):
  - media-query seeds (variant-aurora, define.tsx createDarkMode, remote):
    signal now SEEDED from mq.matches instead of written after creation.
  - controller hand-ups (tool.tsx setApi): receiver signals take
    `{ ownedWrite: true }` — the sanctioned opt-in.
  - define.tsx installFlagReadBack's attribute→prop promotion and message.tsx
    liftRoleOffHost's prop rewrite run under `runWithOwner(null, …)`.
- **Plain `let api` controller vars → ownedWrite signals** in 12 element facades
  (reasoning, dialog, dock, dropdown, menu, popover, hover-card, tooltip, screen,
  coachmark, chat-scope-picker, model-switcher): under v2 the non-reactive getter
  left wireDisclosure's effects deaf to the controller — the same defect
  tool.tsx's own comment documents from 1.x, now universal.
- **wireDisclosure rebuilt for staged writes** (elements/disclosure.ts): the
  attribute⇄prop pair oscillated forever at mount (kai-tool hit the flush
  guard's 1e5 ceiling). Three coordinated pieces, each commented at the site:
  latest() staged-value guards in the intake; a `seeded` SIGNAL gating the
  reflection until the intake has applied author intent; the kai-open-change
  notifier baselined at mount and re-reading the staged truth in its apply so
  it never announces at mount (the contract kai-tool pins).
- **Same-tick write-then-read fixes in src** (v2 staged writes return the last
  COMMITTED value): elements/input kai-input/kai-change details (dispatch with
  the just-computed value; clear() dispatches '' by definition), artifact
  loadCurrent (latest() over history/cursor), elements/resizable's
  MutationObserver reading the staged maximize stash via latest(), aurora's
  isAnimating volume guard re-checked in the apply via latest().
- **v2 signals natively consume AsyncIterables** — this ATE the
  `kai-response-stream.text` contract (the prop signal subscribed to the stream
  and handed the facade per-chunk STRINGS; kai-complete fired mid-stream).
  Fixed in elements/response-stream.tsx: `text` stays a declared prop (metadata/
  types unchanged); a registry-wrap subclass boxes an AsyncIterable text value
  at connect (pre-connect own-prop case) and re-wraps the accessor so later
  writes are boxed and reads unbox; the component's effect compute also boxes
  (an effect compute RETURNING an AsyncIterable is adopted by the async
  machinery too). String/attribute paths untouched.
- Vite pipeline: all vite.config*.ts moved to @solidjs/vite-plugin; externals
  updated for the package split (solid-js, @solidjs/web, @solidjs/element;
  solid-js/store gone).

## Deliberate behavior changes (both re-pinned in tests with V2 notes)

1. **Render-root-scoped event delegation** (v2's headline change, the memo's
   "reason to want v2"): kai-dialog's Escape stopPropagation now really stops the
   event at the shadow root — a page-level keydown listener no longer hears an
   Escape the dialog handled. tests/elements/dialog.test.tsx's pin inverted with
   the full story (its old comment predicted this exact day).
2. **kai-input `clear()`** now dispatches `{ value: '', formattedValue: '' }`
   computed by definition instead of same-tick signal read-backs (identical
   payload to 1.x; the mechanism note is in the source).

## Test-shape work (assertion VALUES unchanged everywhere; K-D12a node-identity
## and reactivity-contract suites pass with assertions untouched)

- The big lever: `src/test-utils/testing-library-flush.ts`, aliased over
  `@solidjs/testing-library` in vitest.config.ts — render/fireEvent/cleanup
  flush() the staged queue, restoring the 1.x synchronous observable contract at
  the harness boundary; it also calls @solidjs/signals' `resetErrorHalt()` around
  render/cleanup so the suites that deliberately crash a render (crash-to-
  diagnostic pins) cannot HALT the reactive system for every later test.
- ~600 inserted flush()/await-microtask/drive-outside-root edits across
  components/elements test files (V2-FLUSH/V2-SHAPE tags), including: fake-clock
  advance loops flushing per frame, element upgrade paths (spike Q-C's mount
  asymmetry), keyboard-open focus microtasks, MessageBody's delta harness moving
  to the functional setter (same-tick parts() read-back dropped deltas).
- One stale pin updated: teardown-without-dom-globals' UNRESOLVED_TEARDOWN_
  CALLBACKS emptied — both entries dissolved (cleanups became returned cleanups /
  owned effects); the pin itself stays armed.
- One vacuous-under-v2 mock reshaped: audio index.test's variant mocks called
  onUnavailable from the component BODY (illegal write in v2); deferred one
  microtask, as the real variants report from effects.

## Phase 3 residue

1. verify:scaffold consumer-solid resolution (above) — merge blocker.
2. Storybook: storybook-solidjs-vite still pins vite-plugin-solid 2.x (v1);
   kept installed; storybook is advisory CI. Untested under v2.
3. Strict-read dev warnings not exhaustively silenced (noise only).
4. docs: prompt-input.stories' code SAMPLE teaches `on:kai-submit` JSX — the
   `on:` namespace is gone in v2; docs sweep needed.
5. jsxImportSource in scaffolder tsc projects / examples / apps-docs untouched
   (consumer-facing; decided with #1).
6. `latest()` uses are the sanctioned staged-read escape; if upstream changes its
   semantics before stable, grep V2-PORT + latest.
