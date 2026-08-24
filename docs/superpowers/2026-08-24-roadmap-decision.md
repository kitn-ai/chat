# Roadmap: the standing agenda after the ladder

Date: 2026-08-24. Written for the owner to rule on in one sitting, and for any fresh seat to work
from afterwards. This is the successor to the three-front-doors direction note: one
dependency-ordered list of every open strategic thread and every banked item, each phrased as a
decision rather than a status.

Every claim below cites the file it comes from. Where a number is quoted, the source file is the
authority and the number should be re-derived there before anyone acts on it.

## 1. Where we stand

- **The ladder is done for its stated purpose, pending the owner's word.**
  `docs/superpowers/HANDOFF-2026-08-24-post-rung-5.md` §2 gives the verdict: 25 of the 83 elements
  in `packages/ui/src/elements/element-meta.json` have been driven by a ladder app, all five
  families the rungs were chosen for are genuinely done, and the residue is one coherent family
  rather than four scattered ones. Rung 5 merged as #308 (`bd74a93b`).
- **0.26.0 shipped on 2026-08-24**, alongside `create-kai` 0.2.0. The registry is the authority:
  `npm view @kitn.ai/ui version` reads `0.26.0`, the tag `@kitn.ai/ui-v0.26.0` exists, and
  `origin/main` head is `e421e1a5` "chore: release main (#267)". It published the lot: three rungs
  of apps, the workspace re-cast, and every kit fix since 0.25.2. It also closes a banked item, the
  create-kai stale dist pin: the published `create-kai@0.2.0` carries
  `DEFAULT_KIT_RANGE = "^0.26.0"` and `kitBuiltAgainst: "0.26.0"`.
  **Derive release state from the registry and fetched tags, never from a feature branch's working
  tree** (this document's first draft called 0.26.0 unshipped because `feat/form-field-formats`
  forked before the release merged and had not fetched).
- **Masking tiers 1 and 2 are in flight** on `feat/form-field-formats`, against
  `docs/superpowers/specs/2026-08-24-form-field-formats-design.md` (all five §10 questions decided).
  Landed on the branch so far: `field-mask` (the pure format engine), `field-semantics`, and
  `input-mask` (the stateful native-value masker). Tier 3 is gated.

## 2. The spine: three workstreams, in dependency order

The four threads the owner named are one architecture, not four projects. Standalone elements are
the foundation the builder compiles to; the builder's interior architecture (raw Solid, then
compile) is already settled and is therefore part of the builder decision, not a decision beside
it; the harness sits on top of the builder and cannot be specified before it. Order: 1, then 2's
spec, then 3.

### Workstream 1 (foundation): standalone elements and the composition surface

**What it is.** Make every element usable on its own, outside `<kai-chat>`, as a thing a consumer
constructs with. This is the direct execution of construction over configuration, ratified
2026-08-20 in `docs/superpowers/specs/2026-08-20-workspace-recast-design.md` ("consumers construct
their chat app from elements; a config-driven black box is the anti-pattern this re-cast retires"),
and it is the four-tier taxonomy in that spec's § Taxonomy made real.

**Why first.** Three independent lines of evidence put it under everything else.

1. It is the ladder's named residue. `HANDOFF-2026-08-24-post-rung-5.md` §2 lists roughly 13
   elements that every rung renders and no rung has ever constructed with: `kai-message`,
   `kai-markdown`, `kai-code-block`, `kai-reasoning`, `kai-tool`, `kai-source`/`kai-sources`,
   `kai-prompt-input`, `kai-composer`, `kai-attachments`, `kai-model-switcher`, `kai-context`,
   `kai-loader`, `kai-scroll-button`. The handoff's own words: "five of roughly seven families
   driven; the composition surface itself never has been."
2. The defects only appear when you compose. Rung 5's headline, F-26 in
   `docs/superpowers/research/2026-08-21-rung-5-front-door/findings.md`, is exactly that shape: a
   card renders correctly inside `<kai-chat>` and every event it emits is discarded, because
   `components/message.tsx:636` renders `CardRenderer` with no host, no `hostElement` and no
   `CardProvider` above it. Configuration hid it for two rungs.
3. `kai-dropdown` was the same gap in miniature, and the evidence is dated in the tree.
   `docs/composable-web-components-roster.md:79` overturns its own "don't element-ize Dropdown"
   ruling on a consumer build test: with no facade there is no generated wrapper, so a React app
   had to import the SolidJS component under an alias cast. "The host framework already has these"
   holds for the widget, not for the kit's own composition surface, which a consumer can only reach
   through an element.

**What exists already.** The four-tier taxonomy and the glue inventory in the workspace re-cast
spec. The 83-element roster in `element-meta.json`, of which 40 have a `###` section in
`docs/web-components.md`. The per-element bundle split, measured and never merged:
`docs/research/footprint-reduction-plan.md:19` records bare `kai-chat` at 73 KB gz against 119 KB,
a 37% drop, verdict "DO IT". That work belongs to this workstream because per-element entry points
and standalone-usable elements are the same shape of change seen from two sides.

**First concrete step.** A brainstorm that answers one question before any code: is this a rung-6
style clean-room app ("compose your own thread", no `<kai-chat>` anywhere, driving `kai-thread` /
`kai-message` / `kai-conversation-item` / `kai-composer` / `kai-attachments` / `kai-toast-region` /
`kai-feedback-bar` as separate elements), or a surface audit over the 13 undriven-but-rendered
elements plus the never-touched families? The app finds defects nobody predicted and costs real
money (rung 5 was $22.30 for the clean-room build alone). The audit is cheap, systematic, and finds
only what we already know to look for.

**DECISION D-1.** Approve workstream 1 as the next spine item, and pick its first step: rung-6 app,
surface audit, or both in that order. If neither, say the composition surface stays as it is and
the builder proceeds over it.

### Workstream 2 (the third front door): the compile-to-WC visual builder, spec first

**What it is.** The deferred third front door. A Solid-native visual builder that emits one
compiled web component. The interior stays pure Solid so there are no registry collisions; it must
emit source AND binary. That architecture is owner-ratified from 2026-08-20 and recorded in the
`builder-compile-to-wc` memory, which is why "raw Solid then compile" is not a separate decision on
this list: it is this workstream's settled internals, and the only thing outstanding about it is
the spec that writes it down.

**What this is NOT (owner clarification, binding).** The compile-to-WC output is **additive**: an
output format for the builder's finished compositions, aimed at no-bundler consumers, free of
registry collisions, emitting source alongside the binary. It is **never** a replacement for the
individual `kai-*` element catalog, which remains the primary consumer surface and is exactly what
workstream 1 strengthens. The kit itself is not being re-authored as one giant component, and
nothing in this roadmap proposes it.

**Why second.** The owner deferred it until the ladder was done
(`HANDOFF-2026-08-21-post-rung-4.md` §1), and what the builder emits IS a composition of elements,
so workstream 1 changes its output shape. Spec work can start in parallel with workstream 1's
implementation; it should not start before workstream 1's shape is chosen.

**What exists already.** Both spec inputs, which is the reason the rungs ran in this order.
Rung 4's artifact-seam inventory: 615 seam lines against 1,270 lines of app proper, **48%**
(`docs/superpowers/research/2026-08-20-rung-4-front-door/findings.md:766-770`). Rung 5's
remote-card seam inventory: 1715 / 2695 = **63.6%**
(`docs/superpowers/research/2026-08-21-rung-5-front-door/seam-inventory.md:210-213`), with envelope
construction the largest single block. Two thirds of what a card app writes is glue a compiler
could own, and that is the argument for the whole workstream. Two working front-door-built apps
(`examples/apps/builder`, `examples/apps/ops-console`) are the reference output.

**First concrete step.** A brainstorm, then a spec, in the house shape: what the builder edits,
what it emits (source and binary), how the emitted element registers, and which of the two seam
inventories' categories the compiler absorbs versus leaves to the consumer. No implementation plan
until the owner green-lights the spec, per the workspace re-cast precedent.

**DECISION D-2.** Green-light a builder spec now (running in parallel once workstream 1 is moving),
or hold it until workstream 1 lands. Second half of the same decision: scope. Does the builder
target the whole app surface, or only the card/artifact seam the two inventories measured?

### Workstream 3 (downstream): the harness layer around the builder

**What it is.** The harness discussion the owner parked with an explicit request to be reminded
(memory `harness-layer-discussion`, starting point `integrations/harnesses.mdx`). It is explicitly
downstream of workstream 2: a harness wraps the builder's output, so its shape is determined by
what the builder emits.

**Why third.** Nothing about it can be specified while the emitted artifact is undefined. Listing
it here is the reminder the owner asked for, not a proposal to start it.

**Research (2026-08-24).** Two design references sourced: `.superpowers/sdd/2026-08-24-form-field-formats/{deepseek-harness-research.md,cordis-research.md}`.

DeepSeek Harness (dsh): agent runtime on Cordis, MIT, v0.1, ~19 capability seams (llm, tools, storage, sandbox, credentials, web, etc.). UI is closed to component libraries inside first-party packages, but plugins ship prebuilt browser bundles fetched at runtime; a third-party plugin's subtree is unconstrained. No sandboxed untrusted-render path exists in dsh itself; all model output is handled by the Node host. Verdict: design reference for this workstream, plus a distribution opportunity. A `dsh-plugin` npm package exporting a prebuilt `client.js` bundle can register React shim components into their slots whose subtrees render `<kai-*>` elements. Entry point: custom tool-view registration for generative-UI cards. Banked spike (one day): mount a `<kai-*>` custom element from a plugin bundle under the dsh boot graph; if it mounts cleanly, a kai-remote card-view plugin is the door into that ecosystem.

Cordis: model verified firsthand (browser-viable 9.7 KB gz) but single-maintainer 4.0-rc, unstable API, no releases. DeepSeek vendored a fork rather than depend on upstream. Two doctrine collisions: silent forever-wait on unmet inject versus our decide-loudly rule; YAML-config centre of gravity versus construction-over-configuration direction. Verdict: prototype behind an owned seam when workstream 3 starts; avoid for builder runtime (Solid already owns lifecycle); adopt as design reference now (the fiber epoch rule for reactive reload; getEffects() tree as a ready-made kai-devtools feed shape).

**DECISION D-3.** Confirm the harness stays parked until the builder spec exists, or name what
about it is decidable now.

### Solid v2 migration

**Solid v2 migration (owner-ratified 2026-08-24, decided).** Solid 2.0 is RC with a frozen API (research memo: `.superpowers/sdd/2026-08-24-form-field-formats/solid-v2-research.md`; posture memory: `solid-v2-posture`). Staged: (1) immediately after the form-field-formats feature lands, run the spike. One element ported to `@solidjs/element@2.0.0-rc.1` plus the input-node-identity test, answering the undocumented Show-node-preservation question that the K-D12a focus fix and the masker attachment depend on; (2) spike-green, open a PURELY MECHANICAL v2 migration branch (merge/omit/onSettled renames, two-phase createEffect, flush strategy for declarative tests, no feature work on the branch); main stays 1.x-shippable; merge at v2 stable or sustained full-gate green; (3) the compile-to-WC builder spec targets v2 unconditionally (render-root event delegation with per-shadow-root listeners removes the composed:true boundary pain). Rationale: frozen RC API removes the sweep-twice cost; v2 eliminates trap classes this repo keeps paying for.

## 3. The kit-debt lane (parallel to the spine)

Findings-driven fixes. None is scheduled; none blocks the spine; each can be threaded in by a
single seat. Ordered by recommended priority.

- **F-26, cards inside `<kai-chat>` have no card host (S1, top unfixed).** `message.tsx:636` renders
  `CardRenderer` with no host and no `CardProvider`, so `ready`, `action`, `submit`, `dismiss`,
  `reopen` and the contract `error` are all discarded with no warning. The kit's own
  `primitives/card-host.tsx:4` comment asserts the opposite. Two rungs paid for it (rung 4 filed the
  symptom as F-03, rung 5 found the mechanism), and the workaround costs the canonical card-tool
  vocabulary: tool names become `kai_approval` instead of `kai_confirm`.
  **Recommend: fix first, this lane's top item.** The smaller of the two fix directions in
  `findings.md` F-26 (pass `hostElement`, making the existing comment true) is the cheap one.
- **F-35, `createMockResponder()` cannot emit tool calls (S2).** `state/mock.ts:99-114` is text
  only. A verbatim repeat of rung-4 F-05; two rungs have now hand-rolled tool-call SSE framing in
  their own mock servers. **Recommend: second. Cheapest high-value item on the list**, and it pays
  back on every future rung and example.
- **The docs and MCP teaching round.** Both clean-room builders abandoned the MCP for direct package
  reads: rung 4 was 10 MCP calls against 37 direct package inspections, rung 5 was 13 against 36
  (about 1:2.8), and rung 5's pivot point is exact, the third consecutive `debug` "No known failure
  pattern matched" about one minute into a 44-minute run (`builder-run.md` rows 6/10/11).
  `listenForCardEvents`, `emitCardEvent`, `onToolCallReady` and `stream.addCard` still score zero
  in the shipped `llms-full.txt` (rung-4 F-01/F-02, unchanged one rung later), and the whole
  provider half of the remote transport (`createCardBridge`, `mountRemoteCard`,
  `@kitn.ai/ui/provider`, `handshake`) scores zero across the MCP reference, `llms-full.txt` and
  `README.md` (F-27, S1). **Recommend: third, and scope it as one round covering
  `component_reference` coverage plus `debug`'s hit rate**, not as scattered doc edits.
- **`CardRequireRule` should be a per-intent enum, not a flat one.** Named in
  `HANDOFF-2026-08-24-post-rung-5.md` §4. The general lesson held three separate times in rung 5:
  per-intent enums beat flat enums beat free-form for anything a model writes (§5).
  **Recommend: fold into the next `cardTools` change rather than standing alone.**
- **A canonical card-part projection for encoders.** `src/wire` has no single place that turns a
  resolved card into the outgoing request, so each app re-derives it (§4). **Recommend: do it
  alongside the builder spec**, since the seam inventory says envelope construction is the largest
  block the compiler would absorb, and the two answers should agree.
- **`kai-popover` / `kai-dropdown` convergence.** Open question, recorded not resolved, annotated at
  `docs/composable-web-components-roster.md`. `kai-popover` already gives a trigger plus slotted
  content, so the real gap may be menu semantics (`role="menu"`, roving focus, typeahead). If so the
  two converge instead of both growing. **Recommend: resolve inside workstream 1**, since it is a
  composition-surface question.
- **Attachments has never been driven by any app.** A headline shipped feature with its own docs
  page that no ladder app sends a file through. `HANDOFF-2026-08-24-post-rung-5.md` §2 calls it a
  coverage hole, not a family-shaped one. **Recommend: attach it to workstream 1's first step**
  (whichever step is chosen) rather than scheduling it alone.
- **The `kai-remote` resize caveat.** The fix re-floors on `body.scrollHeight`, so a provider page
  setting `body { height: 100% }` re-floors to the viewport. Known, documented, not fixed (§4).
  **Recommend: leave documented until a real consumer hits it.**
- **The D8 warnings**, left in the ops-console app deliberately and labeled (§4). **Recommend:
  resolve when the app is next touched.**
- **The stick-to-bottom rAF flake.** Confirmed on #307's first CI run: a stray rAF from
  `use-stick-to-bottom` fires post-teardown and jsdom has no `scrollTo` (origin
  `prompt-input-web-search.test.tsx`). Fix is to guard or cancel the rAF on cleanup. It reproduces
  rarely and it will cost a CI cycle again (§6). **Recommend: fix opportunistically, it is small.**
- **Housekeeping carried since rung 4** (`HANDOFF-2026-08-24-post-rung-5.md` §6, minus the create-kai
  stale dist pin, which the 0.26.0 / create-kai 0.2.0 release closed, see §1): the `.npmrc` guard
  vacuity · 14 element-coverage waivers ·
  `kai-menu` narrow coverage · docs voice pass over the re-cast surface · `surfaces.ts` stale-props
  note · 176 on-disk `.claude/worktrees/` dirs · `kai-conversation-item` still has no `###` section
  of its own in `docs/web-components.md`. **Recommend: one cleanup sitting, low priority.**

**DECISION D-4.** Approve the lane's top three (F-26, F-35, the teaching round) as threadable work
that any spare seat can pick up without further approval, or name a different order.

## 4. Parked and gated

- **#280 `kai-devtools`.** Owner-parked. It registers no element, so it was never ladder residue: a
  product decision (`HANDOFF-2026-08-24-post-rung-5.md` §2). **DECISION D-5: stays parked, or comes
  back?**
- **Masking tier 3 (partial and obscured display).** Gated on manual screen-reader verification, and
  the spec says so in the strongest terms it has: a bullet-filled value is not a password field, and
  "the announcement is verified in NVDA + Chrome and VoiceOver + Safari before tier 3 ships"
  (`2026-08-24-form-field-formats-design.md` §6, gate restated at §8 item 5). Tiers 1 and 2 ship and
  are verifiable without it. **DECISION D-6: does tier 3 go ahead once tiers 1 and 2 land, and who
  runs the two manual screen-reader passes?**
- **The theme editor.** `docs/superpowers/specs/2026-06-11-theme-editor-design.md`, still unbuilt,
  still the flagship docs-site idea. **DECISION D-7: revive, or retire the spec?**
- **The server-side session directory for the page builder.** Owner-sanctioned, banked, not built: a
  directory the builder app writes generated files into, giving real URLs, true multi-file pages and
  reload persistence (banked in both the rung-4 and rung-5 handoffs). Note the overlap: this is a
  small version of what workstream 2's builder needs anyway. **DECISION D-8: build it standalone,
  or roll it into the builder spec?**
- **The acceptance harness and measurement apparatus. This is the one item likely to have been
  forgotten, and the ladder finishing may have made it live again.** The parent spec
  `docs/superpowers/specs/2026-08-18-iteration-ladder-design.md` parked it with a condition, not a
  verdict: "No acceptance runs, no tier delta. Parked until the ladder has produced something worth
  grading." The apparatus already exists from #288 (scenario deck, weighted rubric, run ledger,
  drift lint with 71 self-test cases, gates that fail closed) and has never produced a number. The
  spec's own plan was: build applications manually, find bugs, fix them, accumulate working
  examples, and only then add scenarios and grading to hunt edge cases. Five apps and 40 classified
  findings (F-01 to F-42, two recorded non-findings) is arguably that corpus.
  **DECISION D-9: is the parking condition met? Unpark the harness and grade against the five ladder
  apps, keep it parked until the builder ships, or retire it?**
- **Bun 1.4 webview spike:** input-mask suite on WKWebView plus harness evaluation (no shadow piercing, type() fires no keydown/keyup, no iframe API; recorded 2026-08-24; isTrusted: true synthesized input is the one unique capability). Banked pending implementation.
- **Forbidden-strings clean-room grep.** Current pattern file `packages/ui/src/lint/forbidden-strings.txt` is weak evidence (2 patterns). Spike: strengthen the pattern file and move it out-of-repo to avoid false-negatives from in-tree references. Recorded 2026-08-24.

## 5. Recommended sequence

This section is the supervisor's recommendation, not a ruling. The owner's decisions in §6 override
any of it.

1. **Finish masking tiers 1 and 2** on `feat/form-field-formats` and land them. It is in flight, it
   is decided, and it is the only thing currently running.
2. **Decide the next release point.** 0.26.0 went out on 2026-08-24, so masking tiers 1 and 2 plus
   whatever the kit-debt lane lands are the next cut. Nothing is blocked on it.
3. **Start workstream 1** with a brainstorm on its first step (rung-6 app versus surface audit).
   That brainstorm is the next real decision point after this document.
4. **Start the builder spec brainstorm in parallel**, once workstream 1's implementation is moving
   and its output shape is known well enough to compile to.
5. **Harness after the builder spec exists**, per §2's workstream 3.
6. **Thread the kit-debt lane throughout**, in the §3 order: F-26 first, F-35 second, the teaching
   round third. None of them needs a slot of its own; each fits beside spine work.

## 6. Decision checklist

Answer in order. Each is one line.

- ~~**D-0. Release.**~~ Resolved by shipping: 0.26.0 and create-kai 0.2.0 published 2026-08-24
      (§1). No decision needed. Numbering below is unchanged so earlier references still resolve.
- [ ] **D-1. Workstream 1.** Approve standalone elements and the composition surface as the next
      spine item? First step: rung-6 "compose your own thread" app, surface audit, or both?
- [ ] **D-1b. Ladder exit.** Formally declare the ladder done (the handoff §2 recommendation), or
      require the residual rung before anything else starts?
- [ ] **D-2. Builder.** Green-light a compile-to-WC spec now in parallel, or hold until workstream 1
      lands? And scope: whole app surface, or the card/artifact seam only?
- [ ] **D-3. Harness.** Confirm parked until the builder spec exists?
- [ ] **D-4. Kit-debt lane.** Approve F-26, then F-35, then the teaching round as pick-up-able work,
      or reorder?
- [ ] **D-5. `kai-devtools` (#280).** Stays parked, or comes back?
- [ ] **D-6. Masking tier 3.** Proceed after tiers 1 and 2? Who runs the NVDA and VoiceOver passes?
- [ ] **D-7. Theme editor.** Revive or retire?
- [ ] **D-8. Builder session directory.** Standalone, or folded into the builder spec?
- [ ] **D-9. Acceptance harness.** Parking condition met? Unpark and grade the five ladder apps,
      keep parked until the builder ships, or retire?
- ~~**D-10. Solid v2 migration.** Owner-ratified 2026-08-24. Staged: spike after form-field-formats,
      mechanical branch on spike-green, merge at v2 stable or sustained full-gate green (§2.5).
      Builder spec targets v2 unconditionally.~~ Decided.

## Sources

`docs/superpowers/HANDOFF-2026-08-24-post-rung-5.md` ·
`docs/superpowers/HANDOFF-2026-08-22-post-rung5-wave-mid-build.md` ·
`docs/superpowers/HANDOFF-2026-08-21-post-rung-4.md` ·
`docs/superpowers/research/2026-08-21-rung-5-front-door/{findings,builder-run,seam-inventory}.md` ·
`docs/superpowers/research/2026-08-20-rung-4-front-door/{findings,builder-run}.md` ·
`docs/superpowers/specs/2026-08-18-iteration-ladder-design.md` ·
`docs/superpowers/specs/2026-08-20-workspace-recast-design.md` ·
`docs/superpowers/specs/2026-08-24-form-field-formats-design.md` ·
`docs/superpowers/specs/2026-06-11-theme-editor-design.md` ·
`docs/composable-web-components-roster.md` · `docs/research/footprint-reduction-plan.md` ·
`packages/ui/src/elements/element-meta.json` · `packages/ui/package.json`.
