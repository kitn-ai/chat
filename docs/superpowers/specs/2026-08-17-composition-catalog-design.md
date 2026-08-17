# The composition catalog: two layers, a drift lint, and a scenario deck

Date: 2026-08-17
Status: **DESIGN, decisions ruled. Nothing implemented.**
Provenance: the brainstorm that `2026-08-16-composition-catalog-brief.md` asked for,
run with the repo owner on 2026-08-17. Every fork the brief flagged was put to the
owner and the answers below are his. Verified against `origin/main` at `28ebc061`.
Fifteen of the brief's seventeen §12 checks were re-run before this brainstorm and
all fifteen came back exactly as written. The two skipped need the network: the
advisory (`gh api`) and the live create-kai reproduction, whose throw sites were
checked in source instead.

Every factual claim about the tree has a check in the table at the end. The brief is
about a failure class that begins with believing a written statement about this tree;
this spec does not ask to be believed either.

---

## 1. Frame and scope

**The first consumer is the `kai` MCP.** The target user is a developer inside a
harness (Claude Code, Codex, OpenCode) composing a chat surface into an existing
application, or modifying one already there, in whatever framework the app already
uses. They get code they own. This is the owner's call, and it re-orders the brief's
three front doors: the MCP is first, the CLI consumes the same catalog offline at
scaffold time, and the builder and hosted service are out of scope for this effort.

**Out of scope is not foreclosed.** The catalog is declarative data: parts, what each
requires, what is valid together, what must hold. Data of that shape can be
interpreted by a runtime later (the builder preview, the hosted service) without a
rewrite, because nothing in it is prose or a code template. That is how the brief's
code-versus-configuration fork resolves: the catalog is config-shaped either way, the
MCP projects it into code today, and a runtime interpreting the same data is additive.

**The script-tag delivery target is in scope now.** Not for a hosted product: for the
CMS case the owner named directly (WordPress, Concrete, headless CMS), where there is
no build step, load order is not ours, and the widget must connect to a service the
user already runs. This keeps the CDN/no-bundler target a first-class axis of the
catalog rather than a later product's problem.

**Inference is bring-your-own.** The config's backend source is one swappable field:
an endpoint the consumer owns. A brokered tier can be added later without a schema
break precisely because the field is one field. This respects the settled scope
boundary: brokering would make us the application that decides quotas and spend.

**One prerequisite, flagged and not built here: issue #99 option B**, upgrade-property
preservation inside `defineWebComponent`. The script-tag target cannot be honest
without it: a property set before the element upgrades is lost, load order on a
platform embed is not ours, and the gate alternative (option A, `elementsReady`) is
measured at zero adoption even inside this repo (the MCP scaffolder uses it in no
files and hand-rolls `whenDefined` instead). The catalog carries the race as an open
invariant (§5) until option B lands, and option B is scheduled as its own work.

**Non-goals, restated from brief §11 and unchanged:** no builder, no hosted service,
no rebuilding `create-kai`'s menu (the honest narrowing is PR #275, separate), and no
hand-written catalog prose to "get started". `docs/composable-web-components-roster.md`
is what that produces.

---

## 2. Decisions ruled

Each was put to the owner during the brainstorm; recorded here with its reason so it
is not re-litigated.

1. **The net starts narrow.** Inputs the catalog is derived from: the machine
   artifacts (§3) plus the roster's two still-true sections re-authored as invariants
   (its §1 mapping rules and §2 host-coordination model, which still match the shipped
   contract). The story and docs corpus (counts in brief §8, commands in its §12) is
   the TEST suite, not an input. Widening is evidence-driven: a corpus item is
   promoted to input only when the acceptance test (§6) fails for the lack of it. A
   catalog built from "everything" encodes accidents as rules; a catalog measured
   against everything cannot.
2. **The unit is two layers.** Ingredients (per-element contracts, derived) and
   surfaces (compositions with invariants, authored). The value is in the second
   layer, which is exactly what a roster structurally cannot carry; the first layer is
   cheap because the tree already generates it.
3. **Derived core plus authored overlay** (approach A), over two rejected
   alternatives. B, fully derived with no authored layer, is rot-proof but cannot
   carry the judgment calls the catalog exists to make explicit, so it fails the
   acceptance test at surface depth permanently. C, a separate package or service,
   pays the old-consumer-meets-new-kit problem immediately and serves a network
   consumer that does not exist yet.
4. **The catalog ships inside `@kitn.ai/ui`, under `agent-tooling`.** The MCP reads
   it locally: offline, and version-matched to the installed kit by construction,
   which dissolves versioning for the MCP and CLI paths entirely. The network
   projection (a published JSON artifact under an envelope) is deferred with the
   products that need it, and when it comes it follows the forward-compatibility rule
   already ruled for the devtools event envelope: consumers ignore unknown fields and
   unknown types without throwing, producers never repurpose a field, removals only
   with a version bump.
5. **`component_reference` re-platforms onto the catalog as its data source.** The
   tool remains the query interface; the catalog is what it reads. Answer to brief
   §9 question 7: data source, not replacement, not sibling.
6. **`scaffold` shifts in kind**, from frozen templates toward serving knowledge:
   given intent and framework, it returns the surface recipe, the wiring, the
   invariants that apply, and pointers to worked examples, with code generation as a
   projection of a composition the catalog validated. Brief §9 question 8, answered
   the way the owner's frame implies.
7. **`create-kai` is untouched by this effort.** Its menu was narrowed honestly in
   PR #275; it consumes the catalog in a later effort, and building its menu twice is
   the trap the brief named.

---

## 3. The derived ingredient layer

One record per element, generated at build time, from sources that already exist and
already have owners:

| Source | What it contributes |
|---|---|
| `packages/ui/src/elements/element-meta.json` | per-element props (each already carrying a `scalar` flag, which encodes the property-versus-attribute split), events, methods, `composedFrom`, tokens, parts |
| `packages/ui/dist/custom-elements.json` | the manifest consumers' tooling reads |
| the `MessagePart` union in `packages/ui/src/elements/chat-types.ts` | the part-variant list, read the same way `lint-silent-drops.mjs` and `verify-scaffold-compiles.mjs` already read it: one derivation, now three consumers |
| `listIntegrations()` in `packages/ui/src/agent-tooling/registry.ts` | the backend integrations |
| `listCapabilityGroups()` in `packages/ui/src/agent-tooling/archetypes.ts` | the capability grouping, already derived from the presets with its reasoning written at the site |
| `theme.css` via the theme tool's inlining | token names, already resolved against the sheet rather than listed |

**The generator is named and its guard is wired to it.** The catalog generator joins
`build:api`, and the catalog artifact joins the `GENERATED` list in
`scripts/verify-generated-sync.mjs`, which regenerates and diffs in the required CI
job. This is deliberate: `element-manifest.json` sat uncovered for weeks because it
was produced by `build:elements` while the guard only ran `build:api`, and the fix
(#265) was to move its generation into the step the guard actually runs. The spec
records the lesson so the implementation cannot re-create the gap: **the guard must
invoke the script that writes the artifact, and the wiring test must fail if it
stops.**

**Facts that are not derivable start as registered copies.** Which `MessagePart`
variants each element consumes and emits is catalog data the type system does not
expose today. Where it cannot be derived, it is recorded as an explicit copy with a
named source and a drift check that fails when the union gains a variant no record
accounts for, on the model of `lint:silent-drops`' waiver directive: parsed, scoped
to named variants, re-firing on a new variant. Never unmarked prose.

---

## 4. The authored surface layer

Typed TS records in `agent-tooling`, following the pattern `registry.ts` already
uses for integrations: schema-validated, one module the MCP and the guards both read.

A surface recipe carries:

- `id`, `intent` (what a user ends up with, one sentence)
- **delivery**: surface archetype (full-screen, widget, docked, inline, platform
  embed) crossed with delivery target (bundler, script-tag). Two axes, not one:
  target changes delivery, surface changes appearance (brief §4.5)
- `ingredients`: the element tags it composes
- `wiring`: host-coordinates edges, each one "this event on A sets this property on
  B", using real event and property names
- `invariants`: IDs from §5 that must hold for this recipe
- `corpus`: story file paths that prove the recipe end-to-end

**The drift lint is the design's load-bearing wall.** Every authored reference
resolves or the build fails: element tags against the derived layer, prop and event
names against `element-meta.json`, part variants against the union, invariant IDs
against §5's records, story paths against the tree. An authored row naming
`kai-datagrid`, an event that was renamed, or a story that was deleted is a red CI
run, not a stale paragraph. This is the structural answer to how the roster died: it
was hand-written prose about a tree that kept moving, and nothing noticed the drift.
The lint gets a `--self-test` and is watched failing before it is trusted, per the
standing discipline; a zero-authored-records state is a hard failure, because this
lint exists to check records the design requires to exist.

**The surface-versus-ingredient criterion.** A surface is product-shaped: something a
user could be handed, proven end-to-end by a Labs/App or deployable on its own. An
ingredient exists only inside something else. Proofs and fixtures are neither: they
are corpus, per decision 1.

**First-pass sort of the real inventory.** Derived from the Labs story titles
(command in the check table); this table is itself the first authored artifact, it is
exactly the judgment the acceptance test exists to validate, and the owner reviews it
in this PR:

| Labs title | Sort | Note |
|---|---|---|
| Apps (the nine: claude-code, chatgpt, codex, t3code, perplexity, perplexity-pro, v0, lovable, split-workspace) | surface | end-to-end compositions, recognisably product-shaped |
| Workspace Home, Workspace Slots | surface | the workspace preset and its seams |
| Message Thread | ingredient | the keystone of the composition-first direction (`kai-thread`) |
| Composer | ingredient | rich input, lives inside a surface |
| Command | ingredient | palette, summoned inside something |
| Menu, User Menu | ingredient | |
| Settings | ingredient | a panel, not a product |
| Onboarding checklist | ingredient | |
| Conversations Collapse, Resizable Collapsed | ingredient | behaviors of parts |
| Audio Visualizers | ingredient | |
| Card | ingredient | generative-UI cards arrive as tool calls (settled) |
| Foundations/* (Input, Search, Kbd, Nav, Tabs, Status, Screen, Progress Bar, Coachmark, EditableLabel, Voice output) | ingredient | atoms |
| Chat Slots, Prompt Input Slots | corpus | fixtures proving a part's configuration space |
| Proofs | corpus | tests by construction |

---

## 5. Invariants

One record each: `id`, `statement` (prose an agent can apply, not just recite),
`appliesTo` (tags, part variants, delivery targets), `enforcedBy` (a pointer to the
real test or lint that pins it, which the drift lint requires to exist), and
`diagnosis` (symptom to cause, for the debugging scenario).

The seed set, every one already known to break real consumers:

| id | statement (short form) | enforcedBy |
|---|---|---|
| `reactivity-two-halves` | a new array reference NOTIFIES; a new object per changed item makes the change VISIBLE; edits need both, adds/removes/reorders need only the array | `src/components/reactivity-contract.test.tsx` |
| `props-not-attributes` | arrays and objects are JS properties, never attributes; scalars may be attributes | the `scalar` flag per prop in `element-meta.json` |
| `events-non-bubbling` | events are non-bubbling `kai-*` CustomEvents; listen on the element itself | structural: every facade dispatches through the one helper in `src/elements/define.tsx` that hard-codes `bubbles: false, composed: false` |
| `host-coordinates` | no store; data in via properties, out via events, the host wires A to B; Solid context does not cross element boundaries | roster §2 re-authored; the wiring topology in every recipe assumes it |
| `untrusted-model-output` | anything a model produced that reaches `innerHTML`, `href`/`src`, `window.open` or an iframe is a vulnerability; put an existing policy on the sink (`isSafeUrl`/`SAFE_SCHEMES`, `isRenderableLink`), never author a third | `tests/components/markdown-xss.test.tsx`, `artifact-url-xss.test.tsx`, `hostile-model-output.test.tsx` |
| `kit-parses-consumer-fetches` | never hand-roll an SSE reader; import `@kitn.ai/ui/wire`; no client, no key handling below `wire/` | `lint:silent-drops` guards the encode side |
| `upgrade-race` | **status: open.** a property set before the element upgrades is lost; on script-tag targets load order is not ours; until #99 option B lands, recipes for that target must say so loudly | none yet; this row flips to `enforcedBy: defineWebComponent` when option B lands |

The `status: open` row is the catalog telling the truth about the script-tag target
instead of assuming the fix. A catalog that carried the invariant as solved would be
the roster's failure on day one.

---

## 6. The scenario deck

Normative. The deck is written before any development, and it is the acceptance
suite afterwards. Before development it answers two questions: is any planned catalog
data addressed by no scenario (speculative), and is any scenario addressed by no
planned data (a gap in focus). The harness gives an agent the catalog and **no kit
source**, runs the scenario, and judges the output with the checks this repo already
trusts: the consumer tsc projects from `verify:scaffold`, element registration, and
streaming against a mock wire, plus a human eyeball on the two visual scenarios.

| id | prompt (abridged) | what must carry it | depth |
|---|---|---|---|
| S1 | "I already have `<kai-chat>` in my React app. Add a conversations sidebar and let replies open artifacts in a side panel." | composition validity, wiring topology, `reactivity-two-halves` | surface applied to an existing tree |
| S2 | "Add an AI chat to this Vue app; messages stream from our existing `/api/chat` endpoint speaking OpenAI SSE." | ingredient contracts, `kit-parses-consumer-fetches`, BYO endpoint | greenfield, contract |
| S3 | "Give the prompt input slash-commands and voice, like your command palette demo." | an ingredient's configuration space; the function-valued-property contract (`transcribe`) | capability |
| S4 | "Build me a Perplexity-style research UI: sources, reasoning panel, follow-up suggestions." | surface recipes | whole surface, should fail hardest first |
| S5 | "I'm on WordPress, no build step. Script tag for a support widget talking to my service at https://…" | delivery-target axis, `upgrade-race`, widget recipe | platform embed |
| S6 | "Add a spreadsheet-grid message type with live cell edits." | the honesty bound: the catalog must refuse loudly, naming what does not exist, instead of letting the agent invent `<kai-datagrid>` | refusal |
| S7 | "My messages render but nothing updates while streaming." | invariants as diagnosable knowledge (`diagnosis` fields) | debugging |

**The first run is expected to fail badly, and that failure is the specification.**
Run it early and repeatedly, not at the end; whatever the agent cannot build names
exactly what the catalog is missing. This mirrors watching a check fail before
trusting it, applied to the whole artifact.

---

## 7. Build order

The implementation plan is a separate document; this is the dependency order the
design commits to.

1. **Scenario deck and harness skeleton.** The deck exists before the catalog so the
   catalog is built toward a measurement.
2. **Derived layer**: generator, artifact, `verify:generated` wiring with the §3
   lesson applied, watched failing.
3. **Invariant records**, seed set of §5.
4. **Authored surface schema, the drift lint with `--self-test`, and the first
   sorted inventory** (§4's table, as records).
5. **`component_reference` re-platform** onto the catalog.
6. **Iterate under acceptance runs**: each failure either widens the net (promotes a
   corpus item to input), adds a record, or sharpens an invariant.

Explicitly not in this effort: the builder, the hosted service, the `create-kai`
rebuild, the unenforced couplings in `docs/coupling-map.md`, and the hardening waves
in the handoff's §14.5. Issue #99 option B is prerequisite work for S5 and is
scheduled separately.

---

## How to check the claims in this spec

| Claim | Check |
|---|---|
| The brief's checks were re-run and held | `docs/superpowers/specs/2026-08-16-composition-catalog-brief.md` §12; run them |
| `element-meta.json` carries `scalar`, `composedFrom`, tokens, parts | `node -p "Object.keys(require('./packages/ui/src/elements/element-meta.json')[0])"` |
| The union is already read by two guards | `grep -n chat-types packages/ui/scripts/lint-silent-drops.mjs packages/ui/scripts/verify-scaffold-compiles.mjs` |
| `listIntegrations()` and `listCapabilityGroups()` exist as named | `packages/ui/src/agent-tooling/registry.ts:52`, `packages/ui/src/agent-tooling/archetypes.ts:121` |
| The theme tool resolves names against `theme.css` | the header comment in `packages/ui/src/agent-tooling/mcp/tools/theme.ts` |
| `verify:generated` regenerates and diffs, and covers `element-manifest.json` for the reason stated | `packages/ui/scripts/verify-generated-sync.mjs`, `GENERATED` list and the comment at its `element-manifest.json` entry |
| The `element-manifest.json` gap and its fix | `HANDOFF-2026-08-13-attachments-scaffolder-a11y.md` §13.12, §14.1 (#265) |
| The forward-compat rule quoted in decision 4 | "Forward compatibility, both directions" in `docs/superpowers/specs/2026-08-14-endpoint-choice-design.md` |
| The roster's §1 and §2 still match the shipped contract | `docs/composable-web-components-roster.md` §1 §2 against the `kai-` contract in root `CLAUDE.md` |
| `elementsReady` unadopted, `whenDefined` hand-rolled | `grep -rl elementsReady packages/ui/src/agent-tooling` (none); `grep -rln whenDefined packages/ui/src/agent-tooling` |
| The Labs titles the sort table sorts | `grep -rh "title: 'Labs" packages/ui/src --include="*.tsx" \| sort -u` |
| The nine Labs/Apps files | `grep -rl "Labs/Apps" packages/ui/src --include="*.tsx"` |
| `reactivity-contract.test.tsx` pins the two-halves rule | `packages/ui/src/components/reactivity-contract.test.tsx` |
| The URL policies named, and only those | `isSafeUrl`/`SAFE_SCHEMES` in `packages/ui/src/primitives/card-routing.ts`; `isRenderableLink` in `packages/ui/src/primitives/link-preview.ts` |
| The capability grouping's reasoning is written at the site | the docblock above `listCapabilityGroups()` and the `WHY NOT THE POWER SET` comment above `listSurfaceProbes()` in `archetypes.ts` |
| create-kai's honest narrowing is separate and in flight | PR #275 |
| Settled decisions this spec leans on | root `CLAUDE.md` (`kai-` contract, scope boundary, derive-don't-type, decide loudly, untrusted model output); `2026-07-01-composition-first-architecture-proposal.md` |
