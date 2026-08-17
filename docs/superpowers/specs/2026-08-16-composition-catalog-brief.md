# The composition catalog — a brief for design

Date: 2026-08-16
Status: **BRIEF. Not a design, not a plan.** Written to be handed to a fresh session
with no prior context, as the input to a brainstorm that produces the design.
Verified against `origin/main` at `cf90f0d9`.

Every factual claim below has a check beside it or in §12. Verify rather than trust:
this document is about a class of failure that begins with someone believing a
written statement about the tree.

---

## 0. How to use this

You are being asked to **brainstorm and then design** the composition catalog. Do not
skip to a plan. The repo owner's instruction is that this precedes the rest of the
backlog, and that the brainstorm comes before the spec.

Three things to do first, in order:

1. Read §1–§4 for the frame and the evidence.
2. **Run the checks in §12.** At least half. This document was written by a session
   that had just spent a day finding that written claims about this repo are wrong more
   often than anyone expects, including its own.
3. Read §9's open questions. Those are the brainstorm.

What this document deliberately does not do: propose a schema, name a file format,
or sequence the work. Those are the output, not the input.

---

## 1. The product frame

Three front doors, one engine. They differ by **who holds the context and who
composes** — which is why they cannot collapse into one another.

| Front door | Who has the context | What it produces |
|---|---|---|
| **`create-kai`** (npm CLI, shipped) | nobody yet — you have nothing | a correct, boring starting point |
| **the `kai` MCP** (shipped) | the *harness* — Claude Code, Codex, Copilot — which sees the user's real codebase | composition inside an existing app |
| **a hosted builder/service** (does not exist) | *we* do, because a Wix or Shopify user has no harness | a deployed widget + a script tag |

The consequence that matters: `create-kai`'s menu should **shrink**, not grow. If
composition lives in the MCP and the service, the CLI does not need target × surface ×
features fully crossed — that was always a combinatorial trap.

**Why the catalog is not optional.** All three need the same thing: a machine-readable
description of what can be composed, what each piece requires, and what is valid
together. That is the intersection of three products, not an architectural preference.
Build it once and each front door consumes it; skip it and you get three divergent
answers to "how does a widget mount", which is the hand-maintained-list failure at
product scale.

**The differentiator, stated plainly.** A general-purpose builder can already emit a
chat UI that *looks* right. What it gets wrong is underneath: streaming semantics,
message parts, tool-call argument accumulation, reasoning deltas, provider wire
differences. This repo has spent months pinning those down and guarding them. So the
claim is not "we generate chat UIs" — it is **"what we generate actually streams
correctly."** That only holds if the catalog carries the invariants, not just the parts.

---

## 2. What exists today

Verified at `cf90f0d9`; commands in §12.

- **80 `kai-*` elements** — `packages/ui/src/elements/element-meta.json`, generated.
- **11 integrations** — `packages/ui/src/agent-tooling/integrations/`.
- **4 MCP tools** — `scaffold`, `component_reference` (`reference.ts`), `theme`,
  `debug`, under `packages/ui/src/agent-tooling/mcp/tools/`.
- **9 Labs/Apps showcase applications** — `claude-code`, `chatgpt`, `codex`, `t3code`,
  `perplexity`, `perplexity-pro`, `v0`, `lovable`, `split-workspace`. Storybook stories
  under `packages/ui/src/`, found by `grep -rl "Labs/Apps"`.
- **`create-kai`** — published, and **currently broken for real users** (§10).
- **A wire layer** — `packages/ui/src/wire/`, parsing provider SSE onto `parts[]`.
- **A `MessagePart` union** — `packages/ui/src/elements/chat-types.ts`. This is the
  data contract every message-rendering element sits on, and it is already the derived
  source for two independent guards (`lint:silent-drops`, `verify:scaffold`).
- **Surface probes** — `listSurfaceProbes()` in `packages/ui/src/agent-tooling/archetypes.ts`.
  Read the `WHY NOT THE POWER SET` comment there before designing any axis; someone
  already thought hard about combinatorics in this codebase and wrote down why.

---

## 3. The cautionary specimen: `docs/composable-web-components-roster.md`

Read this file, then read this section. It is the closest thing to a catalog that
exists, and studying **how it failed** is worth more than its contents.

It was written in June 2026 as a planning document. Today it says:

- **~28 feature elements.** The kit ships **80**.
- `@kitnai/chat` and `defineKitnElement` — two renames and a rewrite out of date
  (`@kitn.ai/ui`, `defineWebComponent`).
- *"SSR is explicitly out of scope."* SSR is now shipped, with hydration checks in the
  Next and TanStack starters.
- A section of "open API questions to settle during build" that were settled by
  shipping, in a document that never learned.
- No mention of `parts[]`, the wire adapter, cards, attachments, artifacts, audio
  visualizers, the interaction API, or slot/part discoverability — all of which
  post-date it.

**The lesson is not that it is stale. It is that it was hand-written prose about a tree
that kept moving.** A catalog authored the same way is this file again in six months,
except that three products will be reading it.

So: **the catalog must be derived** — from `element-meta.json`, `custom-elements.json`,
the `MessagePart` union, the integration registry, the archetype probes. Where a fact
genuinely cannot be derived, that fact must be *registered as a copy* somewhere that
notices when it drifts. `docs/coupling-map.md` §4 is the existing pattern for this.

**What is still good in the roster and should survive into the catalog:**

- **§1's mapping rules** — variant/size → attribute; object/array data → JS property,
  never an attribute; fire-and-forget callback → non-bubbling CustomEvent; a callback
  that returns a value → function-valued property; genuinely custom markup → named slot.
  These are still the contract and still match root `CLAUDE.md`.
- **§2's coordination model** — no store; the host coordinates; data in via properties,
  out via events, host wires A→B. Solid context does not cross element boundaries. Still
  true, and it is the reason composition is a *data-layer* concern rather than a DOM one.

---

## 4. What the catalog has to carry that a roster structurally cannot

A roster answers *"what elements exist and what props do they take."* Reading it, an
agent can emit markup that renders and does not work. The catalog has to answer *"what
can be combined, what does each combination require, and what must hold for it to
behave."* Six dimensions, offered as a starting decomposition rather than a schema:

1. **Runtime invariants.** The ones already known to break real consumers: a new
   array/object reference per chunk or nothing re-renders; arrays and objects are JS
   properties and never attributes; events are non-bubbling `kai-*` CustomEvents so you
   listen on the element itself; registration is async, so a property set before upgrade
   is lost. An agent that does not know these emits plausible, broken code.
2. **Composition validity.** What requires what. Which pieces are **surfaces** (a thing
   a user sees and uses) versus **ingredients** (a part that composes into one). The
   existing labs inventory — workspaces, onboarding, settings, user menu, command
   palette, prompt-input variants, proofs — is unsorted along exactly this line, and
   sorting it *is* most of the catalog's value.
3. **Wiring topology.** §3's host-coordinates model made machine-readable, and updated
   for `parts[]` and the wire layer, which the roster predates entirely.
4. **Data contracts.** Which `MessagePart` variants each element consumes and emits.
   Derivable from the union.
5. **Surface archetypes and targets.** Full-screen, widget, docked, inline, platform
   embed — crossed with the delivery target, because a Shopify embed has no bundler and
   no control of load order. Note these are *different axes*: target changes delivery,
   surface changes appearance.
6. **Status, per target, derived.** Not a hand-maintained legend. The roster had a
   legend; that is why it rotted.

---

## 5. The load-bearing consequence of the platform target

The no-bundler, script-tag, CDN path is needed **three times over**:

1. platform embeds (Wix, Shopify — no build step),
2. the service's deliverable (you hand a merchant a `<script>` tag),
3. **the builder's live preview** — which can be an iframe plus a script tag plus a JSON
   config, rather than a per-keystroke container build. The hardest part of a
   Lovable-style builder is structurally cheaper here than for a competitor shipping
   React.

One investment, three payoffs. Its prerequisite is **issue #99**, and specifically
**option B** — upgrade-property preservation inside `defineWebComponent`, so a property
set before the element upgrades survives. Option A (a `whenReady`/`elementsReady` gate
consumers must remember) cannot work on a platform embed where load order is not ours.

Current adoption, measured: the `kai` MCP scaffolder uses `elementsReady` in **zero**
files and hand-rolls `whenDefined` in two; four starters hand-roll it; the docs *guides*
teach it correctly while the docs site's own components do not. The gate is not being
adopted even by us.

---

## 6. Settled — do not re-litigate

These were decided with evidence. Reopening them costs time and produces the same
answer.

- **Cards come from TOOLS, not structured output.** Generative-UI cards arrive as tool
  calls.
- **The kit decides HOW; the app decides WHETHER.** How a message renders, how SSE
  parses, how focus moves — ours. Limits, quotas, retention, spend — the consumer's.
  The test: does this decide something that lands on an invoice or in a policy document?
  A *configurable* cap is still policy machinery.
- **Derive it, don't type it.** Every defect involving a version, path, count or list
  began as a hand-typed restatement of something the code already knew.
- **Decide loudly.** A silent drop, truncation, swallowed error or silent fallback is a
  decision made while withholding the fact that it happened.
- **Everything the model produced is untrusted input.** A `MessagePart`, card envelope
  or tool argument reaching `innerHTML`, an `href`/`src`, `window.open` or an iframe is a
  vulnerability. Two Critical XSS were fixed on this basis in August.
- **`kai-chat` and `kai-workspace` become thin presets over composables**, with
  `kai-thread` as the keystone — the composition-first direction, in
  `docs/superpowers/specs/2026-07-01-composition-first-architecture-proposal.md`.

---

## 7. The two forks worth deciding early

Both are much cheaper now than retrofitted.

**Code versus configuration.** Developers via the MCP get **code** they own and edit.
Laypeople via the service get **configuration plus a hosted runtime** — a Shopify
merchant cannot maintain generated source, and "they maintain it through our service"
only works if there is a stored config to change. The recommendation from the
discussion that produced this brief: **the catalog should describe a configuration
schema that a runtime interprets, with code generation as a projection of that config.**
Backwards, and the service is a rewrite.

**Whose inference.** For platform users: bring-your-own key (a UI/config service — low
risk, thin margin) or brokered inference (subscription margin, but we own cost, abuse,
rate limits, and support). This collides with §6's scope boundary: brokering makes *us*
the consumer that decides quotas and spend.

---

## 8. The acceptance test

This is the most important section, because it converts "the catalog is complete" from
an opinion into a measurement.

**The corpus is much wider than the 9 showcase apps**, and scoping it to them
understates the evidence badly. Measured at `cf90f0d9` (commands in §12):

| Body of work | Size | What it demonstrates |
|---|---|---|
| **Labs/Apps** | 9 story files | whole applications, recognisably shaped like real products |
| **Labs** (all) | 42 story files | individual capabilities proven in isolation — workspaces, onboarding, proofs, command palette, user menu, settings |
| **All stories** | 115 files | every element exercised, including variants and edge states |
| **Test fixtures** | within the above — e.g. `prompt-input-variants.stories.tsx` | the deliberate variant matrices: what a part can be configured *into* |
| **Docs pages** | 122 `.mdx` | the intended, curated usage of each thing |
| **Docs examples** | 734 fence markers across those pages | roughly 370 worked snippets, each an assertion about how something is used |

These prove **different kinds of things**, and the difference matters for the catalog:

- **Labs/Apps** prove that whole *surfaces* are reachable — an end-to-end composition.
- **Labs (non-app)** prove that individual *capabilities* work standalone. This is the
  surface-versus-ingredient line (§4.2) already drawn implicitly by someone's judgment.
- **Fixtures and variant matrices** prove the *configuration space* of a part — the axes
  along which it legitimately varies. That is catalog data almost directly.
- **Docs examples** prove *intended* usage, which is different again from possible usage,
  and is the closest thing to an editorial opinion about what good composition looks like.

**What all of it proves:** the element inventory is sufficient, and the space of what can
be built is large and already explored.

**What none of it proves:** that the *catalog* is sufficient. Every one of these involved
a person making judgment calls that were never written down — which element for which
job, how to lay it out, how to wire A to B, what to style. The catalog's entire purpose
is to make those decisions explicit and derivable. **Nobody has tested whether it can
carry them.**

So:

> **Give an agent only the catalog — no access to the source — and ask it to reconstruct
> a target from the corpus. Whatever it cannot build names exactly what the catalog is
> missing.**

Run it at three depths, because they fail differently and each failure is a different
kind of gap:

1. **A docs example** (smallest) — if this fails, a *contract* is missing.
2. **A Labs capability**, e.g. the command palette or a prompt-input variant — if this
   fails, an *ingredient's configuration space* is missing.
3. **A Labs/App**, e.g. `v0` or `perplexity-pro` or `split-workspace` — if this fails, the
   *surface-level composition rules* are missing.

Run this early and repeatedly, not at the end. The first run should fail badly; that
failure is the specification. This mirrors the repo's standing discipline of watching a
check fail before trusting it.

**Bound the claim honestly.** The catalog covers what is *composable from these parts*.
Something needing a genuinely new element — a spreadsheet-grid message type, say — is
out of scope, and the catalog must **say so loudly** rather than let an agent invent an
element that does not exist. An agent hallucinating `<kai-datagrid>` is the failure mode
this bound prevents.

---

## 9. The brainstorm: open questions

Ordered roughly by how much else depends on the answer.

0. **How wide is the net?** The corpus in §8 spans 115 stories, 122 docs pages and ~370
   worked examples, and they prove different kinds of things. Which of them are
   **inputs** the catalog is derived from, which are **tests** it is measured against,
   and which are neither? A story is evidence of what is possible; a docs example is an
   assertion of what is *intended*. Those are not the same, and a catalog built from
   "everything" without that distinction will encode accidents as rules. This question is
   listed first because it bounds every other one — and because the honest answer may be
   that the net starts narrow and widens as the acceptance test finds gaps.
1. **What is the unit?** Is the catalog a description of *elements and their valid
   combinations*, or of *surfaces assembled from ingredients*? §4.2 argues the second is
   where the value is, but that is an argument, not a decision.
2. **Surface versus ingredient — where is the line?** Sort the real inventory:
   workspaces, onboarding, settings, user menu, command palette, prompt-input variants,
   proofs, artifacts/preview. Some are products in their own right; some only exist
   inside something else. This sorting is most of the work.
3. **How deep do the invariants go, and how are they represented?** Prose an agent
   reads? Machine-checkable assertions? Both? Prose has already failed once in this repo
   — a waiver comment explained a silent drop and shipped it, which is why
   `lint:silent-drops` parses a directive rather than honouring comments.
4. **How is it served?** An MCP tool? A published JSON artifact? A package? Each front
   door has different constraints — the service and builder need it over the network,
   the CLI needs it offline at scaffold time.
5. **Versioning.** A catalog describes a kit that ships weekly. What happens when an old
   builder meets a new kit? The devtools spec already ruled a forward-compatibility rule
   for its event envelope; look at that precedent before inventing another.
6. **What is derived versus authored?** Everything derivable must be derived. For the
   irreducible remainder — editorial judgments like "this ingredient belongs in that
   surface" — where does it live, and what notices when it contradicts the code?
7. **Does the catalog subsume `component_reference`?** The MCP already has a tool that
   answers questions about components. Is the catalog its data source, its replacement,
   or a sibling?
8. **What does `scaffold` become?** Today it emits frozen templates — the same model as
   `create-kai`. If the MCP is the composition path, `scaffold` changes in kind: from
   codegen toward *knowledge* — parts, contracts, slots, invariants, worked examples.
   The 9 labs apps become the corpus of worked examples rather than dogfood.

---

## 10. Two things that are true right now and will distract you

**`create-kai` is broken in production.** `npx create-kai` offers six features;
**only `conversations` scaffolds**. The other five hard-fail with "generated feature
surfaces are not wired in this release" (an unconditional throw in
`packages/create-kai/src/generate.ts`), selecting *no* features fails the same way, and
`conversations` + anything fails with "pick one or the other" (`resolveSurface` in
`features.ts`). The layout prompt shows one option because `widget` is `status:
'planned'`. Reproduce:

```
npx create-kai@0.1.4 x --framework react --features sources --gateway mock --yes   # fails
npx create-kai@0.1.4 y --yes                                                       # passes
```

That asymmetry is why every automated check is green: the zero-config default is
`['conversations']`, the one working cell, and `npm run smoke` — which only drives that
path — **is in no workflow**.

**Fix it by narrowing, not widening.** Stop offering what cannot be built. That is a
small, honest change, and it is *not* the catalog work. Do not rebuild the menu before
the catalog exists, or you will build it twice.

**There is a large hardening backlog.** `docs/coupling-map.md` carries ~30 unenforced
couplings, and the handoff's §14.5 lists more. **The owner's instruction is that the
catalog comes first.** The backlog is real but it is not urgent in the way this is; the
one part of it that is genuinely prerequisite is issue #99 option B (§5), because the
platform target depends on it.

---

## 11. Non-goals for this brainstorm

- Do not design the builder. It forks off the catalog; designing it now guesses at the
  catalog's shape.
- Do not scope the hosted service. It is a different business — auth, billing,
  generation, preview, deploy — and it needs the catalog first regardless.
- Do not rebuild `create-kai`'s menu (§10).
- Do not write the catalog by hand to "get started". §3 is what that produces.

---

## 12. How to check the claims in this document

| Claim | Check |
|---|---|
| 80 elements | `node -p "require('./packages/ui/src/elements/element-meta.json').length"` |
| 11 integrations | `ls packages/ui/src/agent-tooling/integrations/*.ts` |
| 4 MCP tools | `ls packages/ui/src/agent-tooling/mcp/tools/` |
| 9 Labs/Apps | `grep -rl "Labs/Apps" packages/ui/src --include="*.tsx"` |
| 42 Labs stories | `grep -rl "title: 'Labs" packages/ui/src --include="*.tsx"` |
| 115 story files | `find packages/ui/src -name '*.stories.tsx'` |
| 122 docs pages | `find apps/docs/src/content/docs -name '*.mdx'` |
| 734 fence markers (~370 examples) | `grep -rh '^\`\`\`' apps/docs/src/content/docs --include='*.mdx' \| wc -l` |
| The roster says ~28 elements and `@kitnai/chat` | `docs/composable-web-components-roster.md` §3 and §1 |
| The roster's mapping rules match the shipped contract | its §1 against the `kai-` contract in root `CLAUDE.md` |
| `MessagePart` is the derived source for guards | `packages/ui/src/elements/chat-types.ts`; then `scripts/lint-silent-drops.mjs` and `scripts/verify-scaffold-compiles.mjs` |
| Combinatorics were already reasoned about | the `WHY NOT THE POWER SET` comment at `listSurfaceProbes()` in `archetypes.ts` |
| `create-kai` fails as described | the two commands in §10 |
| `npm run smoke` is in no workflow | `grep -rn "run smoke" .github/workflows/` |
| `elementsReady` is unadopted | `grep -rl elementsReady packages/ui/src/agent-tooling` (expect none) |
| Cards come from tools | `packages/ui/src/primitives/card-routing.ts` and the card schemas |
| Two Critical XSS were real | GHSA-xj9v-mg99-f8mc, and `tests/components/markdown-xss.test.tsx` |
| The composition-first direction | `docs/superpowers/specs/2026-07-01-composition-first-architecture-proposal.md` |
| The devtools forward-compat precedent | `docs/superpowers/specs/2026-08-14-kai-devtools-design.md` |

---

## 13. Provenance

Synthesised from a working session on 2026-08-15/16 that merged eight PRs closing
coupling-map items 14, 16, 17, 19, 20 and 22, and from the product discussion that
followed it. The three-front-doors frame, the code-versus-configuration fork, the
inference fork and the labs-as-acceptance-test proposal are from that discussion and
are **not yet specced or agreed** — they are the input to this brainstorm, not its
conclusion.

Read alongside: §13 and §14 of
`docs/superpowers/HANDOFF-2026-08-13-attachments-scaffolder-a11y.md`. §14.2 records that
across seven verified branches, three defects were found and **none was in the change** —
two were guards wrong about their own strength, one a docs sample contradicting its own
prose. That is the failure class this catalog will be judged against: not whether it is
written, but whether what it claims is true.
