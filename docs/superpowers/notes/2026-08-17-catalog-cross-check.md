# Composition catalog: pre-development cross-check

Written at Task 1, before any catalog data exists. Spec §6 asks the deck to answer two
questions before development: is any scenario addressed by no planned data, and is any
planned data addressed by no scenario. This is that pass, run against the plan's Task 5
(invariant records), Task 6 (inventory, recipes, part-consumption), Task 3 (the derived
layer's shape, as declared by `DerivedCatalog` in `catalog-types.ts`) and Task 8 (what
the acceptance pack actually hands an agent).

Method: for each row, name the *record or field* that carries it, not the task that
mentions it. A task that says "an agent will need X" carries nothing; a field an agent
can read carries something.

---

## Table 1: scenarios addressed by no catalog data

| id | Catalog data that carries it | Verdict |
|---|---|---|
| S1 | `workspace-chat` recipe: `ingredients` names all four tags, `wiring` carries the `kai-conversation-select` → `kai-chat.messages` and `kai-maximize-change` → `kai-resizable.maximizedIndex` edges, `invariants` names `reactivity-two-halves`, whose `statement` spells out both halves. `derived.elements` supplies the prop and event names. | **Carried.** The recipe is close to S1's answer key. What it does not carry is anything React-specific: no framework axis exists anywhere in the catalog, so "set an object property from React" (refs, not JSX attributes) is inferred or invented. |
| S2 | `Backend { endpoint: 'consumer-owned', reader }` on both recipes; `kit-parses-consumer-fetches`, whose `statement` names `readOpenAIStream` by name; `derived.elements` for `kai-chat`. | **Partial, and the gap is concrete.** No recipe matches S2's shape: `workspace-chat` is a full-screen workspace on `readModelStream`, `support-widget-script-tag` is script-tag only. "Add chat to my app" — the most common real request there is — down-composes from a recipe built for something bigger. Worse: the catalog records *which* reader, never the reader's **signature**. `WireReader` is three strings. An agent handed the pack with no kit source knows it must import `readOpenAIStream` and cannot call it. |
| S3 | `derived.elements[].props[].fn` and `.scalar`; the `Command` inventory row's note. | **Was largely uncarried; now CLOSED-BY-SCHEMA on the half that mattered.** The original finding: `scalar: false` says "not an attribute" and never "this is a function you must supply", which is precisely the contract S3's scoring names, so a function-valued property was indistinguishable from an array-valued one. `DerivedElement.props` now carries **`fn: z.boolean()`**, derived (not authored) from element-meta.json's prop type by the rule recorded at the field: strip a leading `undefined \| `, then true iff the remainder starts with `(` and contains `=>`. Deliberately not a bare `includes('=>')`, which over-matches props that merely CONTAIN callbacks (`kai-cards.policy`, `kai-toast-region.toasts`); the precise rule yields exactly `kai-voice-input.transcribe` and `kai-voice-output.synthesize`, the canonical cases. Generator work belongs to Task 3. **Residual gap:** no recipe configures `kai-prompt-input`, so S3's slash-command half still has no ingredient-configuration record. |
| S4 | NOTHING. | The plan authors two recipes and neither is a research surface; Task 6 says so outright. The `perplexity` and `perplexity-pro` inventory rows are a title and a one-line note, with no ingredients and no wiring, and neither recipe cites the perplexity story in `corpus` — so the catalog cannot even point at the proof that exists in the tree. Spec §6 predicts this scenario fails hardest first, and it will. Worth stating the sharper version: an inventory entry is a **name**, not data. |
| S5 | `support-widget-script-tag`: `targets: ['script-tag']`, `archetypes: ['widget','docked']`, `backend.reader: 'readOpenAIStream'`. `upgrade-race` with `status: 'open'`, `appliesTo.targets: ['script-tag']` and a `diagnosis` row for the CDN symptom. | **Partial, same class as S2.** The catalog names the parts and the race, and carries nothing about **how to obtain the parts**: no bundle filename, no CDN URL shape, no version to pin. `DerivedCatalog` has no distribution record, and the pack stamps `kitVersion` for provenance rather than for the agent to use in a URL. The agent can describe the widget and cannot write the `<script src=…>` line. |
| S6 | `derived.elements` and `derived.partVariants`, as closed worlds an agent can check `kai-datagrid` against. | **Carried by mechanism, uncarried by statement.** Nothing in `DerivedCatalog`, `PROMPT.md` or `JUDGE.md` asserts these lists are exhaustive. An agent handed a JSON array has no way to tell a complete set from a curated excerpt, and an agent that assumes an excerpt invents. This is the honesty bound resting on an assumption nobody wrote down. |
| S7 | `reactivity-two-halves.diagnosis`, both rows: same-array-reference and same-item-identity, symptom and cause. | **Carried.** The record was written to answer this. No gap. |

The method check the brief asked for landed: S4 has no recipe, from Task 6's content
alone. S3 is the row that was *not* pre-flagged and it is at least as weak, because
unlike S4 it does not look like a gap — it looks covered, and `scalar` is the field
that makes it look covered.

---

## Table 2: catalog data exercised by no scenario

The genuinely open table. Split by cost, because the honest recommendation differs:
**derived** fields come out of `element-meta.json` and the registries for free and stay
true by construction, so an unexercised one costs almost nothing. **Authored** fields
are hand-typed, drift silently, and can leave a guard branch that cannot fire. Those are
the ones to argue about.

### Authored data (cost of being wrong: real)

| Field / record | Scenario that exercises it | Note |
|---|---|---|
| `SurfaceArchetype.'full-screen'` | S1 | via `workspace-chat` |
| `SurfaceArchetype.'widget'`, `'docked'` | S5 | via `support-widget-script-tag` |
| `SurfaceArchetype.'inline'` | NOTHING | No recipe, no scenario. |
| `SurfaceArchetype.'platform-embed'` | NOTHING | S5's `depth` string reads "platform embed" while its recipe is tagged `widget`/`docked`, so even the near-miss does not exercise the enum member. Two names for one idea is how a vocabulary starts rotting. |
| `DeliveryTarget` (both) | S1/S2, S5 | Task 6's test pins that both have an instance. |
| `WireReader.'readModelStream'`, `'readOpenAIStream'` | S1, S2/S5 | |
| `WireReader.'readAnthropicStream'` | NOTHING | Keep regardless: it is a real export, and an enum that omitted it would be a lie about the wire module. |
| `Backend.endpoint` (single literal) | S2, S5 as a fact | Can never vary, so it carries no information at runtime. It earns its place as §1's "one swappable field" decision made machine-readable, not as data. |
| `EnforcedBy.'test'` / `'lint'` / `'structural'` paths | NOTHING | Read by the drift lint, never by an agent. **This is guard data, not agent data**, and the plan should say so rather than let it look like catalog content the deck measures. |
| `EnforcedBy.'none'` + `until` | S5 | S5's scoring reads the open status directly. |
| `Invariant.appliesTo.tags` | S1, S7 | |
| `Invariant.appliesTo.targets` | S5 | |
| `Invariant.appliesTo.parts` | NOTHING | **No invariant in Task 5's seed set sets it.** Task 7's lint has an `if (inv.appliesTo.parts)` branch that is dead against the shipped data: a check that cannot fail, which is this repo's dominant failure mode. |
| `Invariant.status` | S5 (weakly) | Redundant with `enforcedBy`: Task 5's own test asserts `status === 'open'` iff `enforcedBy.kind === 'none'`. Two fields, one bit, plus a test whose whole job is keeping the copy in sync. A "derive it, don't type it" violation inside the schema that exists to stop exactly that. |
| `Invariant.diagnosis` | S7 | The one field the deck exercises hard. |
| `WiringEdge.from/event/to/property` | S1 | |
| `WiringEdge.note` | NOTHING directly | It is where the reactivity warning actually lives in `workspace-chat`; a human judge reads it. Keep. |
| `SurfaceRecipe.corpus` | S4, by a **human** | The pack ships no kit source, so an agent receives a story path it cannot open. Judge data, not agent data. Shipping it inside `catalog.json` to a source-less agent is at best noise and at worst an invitation to describe a file it has never read. |
| `InventoryEntry.title` / `sort` / `note` | NOTHING | **The entire inventory is measured by no scenario.** S4 comes closest (`perplexity` is a title) and gets nothing usable from it; S6's closed world is `derived.elements`, not the inventory. It is not useless — it is spec §4's owner-reviewed sort and it feeds Task 7's rot check against Labs titles — but it is unmeasured, and that is what this table exists to surface. |
| `PartConsumption` | NOTHING directly | Serves the drift lint's registered-copy check. Same category as `enforcedBy`. |

### Derived data (cost of being wrong: near zero)

| Field | Scenario that exercises it | Note |
|---|---|---|
| `DerivedElement.tag`, `.events` | S1, S2, S6 | |
| `DerivedElement.props[].name`, `.scalar` | S1, S3 | |
| `DerivedElement.props[].fn` | S3 | Added in response to this cross-check's own Table 1 row. Derived, so it costs nothing to keep and stays true by construction. |
| `DerivedElement.props[].optional` | NOTHING | No scenario, no invariant, no lint check reads it. |
| `DerivedElement.methods` | NOTHING | And the sharper point: `WiringEdge` can express "event sets property" and **cannot express "call this method"**, so a recipe could not use a method even if one were the right answer. The interaction API on every interactive element is invisible to the whole authored layer. |
| `DerivedElement.parts` | NOTHING | No scenario touches styling. |
| `DerivedElement.composedFrom` | NOTHING | Serves the composition-first direction, not the deck. |
| `DerivedElement.tokens` | NOTHING | See `themeTokens`. |
| `DerivedCatalog.partVariants` | S6, S2 | |
| `DerivedCatalog.integrations` | NOTHING | S2 and S5 both describe a consumer-owned endpoint, which is `Backend`, not an integration record. The registry serves `scaffold`; the deck never asks for it. |
| `DerivedCatalog.capabilityGroups` | NOTHING | The near-miss worth acting on: S3 asks for a capability, and this is the closest thing the plan builds to S3's "ingredient configuration space". One field could close a row in each table. |
| `DerivedCatalog.themeTokens` | NOTHING — **RETAINED WITH REASON** | **The best finding in this table, because the gap runs both ways.** No scenario in the deck asks for theming or brand matching. "Make it match our brand" is a top-three real request, and a deck that claims to be the acceptance suite does not contain it. Ruled: the field is **not** speculative and stays — the `theme` MCP tool already serves theming, so it has a live consumer outside the deck. The honest record is that the **DECK** is missing a theming scenario. Adding one is iteration work under spec §7 item 6, not a change to this plan. |
| `DerivedCatalog.eventExceptions` | NOTHING | Mandated by spec §5 and given a `.min(1)` floor so a broken extractor cannot parse clean. No scenario exercises a bubbling exception. Keep; note it. |

---

## What this changes

The plan is focused on roughly the right things, and the two tables disagree about
where the slack is. Table 1 says the **authored surface layer is too thin for the deck
it was written against**: S2 and S5 both fail on the same missing thing, which is not a
record type but a category — the catalog describes the parts and never describes how to
obtain or call them (no wire signatures, no bundle URL). S3 fails on a schema shape,
`props` carrying `scalar` but no kind. S4 fails as designed. Table 2 says the
**derived layer is broader than anything measures it**, which is fine, because derived
breadth is free and stays honest by construction.

Findings raised, and how each was ruled:

0. **Task 1 (done, in this commit): `DerivedElement.props[].fn`.** S3's gap was a schema
   shape, and it turned out to be derivable rather than authored, so it was closed here
   rather than deferred. The rule is recorded at the field; Task 3 owns the generator and
   the expected two-prop result.
1. **Task 8: state the closed world.** Add one sentence to the pack's `PROMPT.md`
   preamble saying the element and variant lists are complete — if it is not in the
   catalog it does not exist — and assert it in the pack test. S6's whole honesty bound
   currently rests on an assumption nobody wrote down, and this is a two-line fix.
   *Ruled: accepted, routed to Task 8.*
2. **Task 7: cover or retire `appliesTo.parts`.** The lint branch for it cannot fire
   against the seed set, and a branch that cannot fail is worse than no branch because it
   reads as coverage. *Ruled: routed to Task 7, which adds a self-test case driving
   `check()` with a parts-scoped invariant fixture — making the branch live without
   inventing a fake invariant in the seed set.*
3. **`status` is derivable from `enforcedBy`.** *Ruled: KEEP as-is. It is a registered
   copy with a guard (Task 5's test asserts the two travel together), and `status` is the
   field an agent reads.*
4. **`corpus` and `enforcedBy` are judge/guard data, not agent data** — and `corpus`
   ships a path into a pack containing no source. *Ruled: routed to Task 8.*
5. **`themeTokens` exercised by no scenario.** *Ruled: field retained (the `theme` MCP
   tool is a live consumer); the deck's missing theming scenario is the real finding, and
   it is spec §7 item 6 iteration work.*

And the thing not to do: **do not pre-solve S2's and S5's missing wire signatures and
bundle URL before the first acceptance run.** Spec §6 is explicit that the first run's
failures *are* the specification, and this cross-check has now predicted two of them in
writing. Predicting a failure and then patching it before measuring converts a
measurement into a guess. Build the pack, run S2 and S5, and let the run confirm or
refute these two rows.

And the reason the deck is not widened here, per ruling 5: Task 1's test pins S1 through
S7 by design, and adding a theming scenario before the deck has been run once builds
toward a second unmeasured guess. It goes on the §7 item 6 list.

One note on what this exercise is worth. The finding that changed the schema (S3 →
`props[].fn`) came from Table 1, and it was the row that did **not** look like a gap —
S4's absence was visible from the task list, while S3 read as covered because `scalar`
was sitting there looking like the answer. Table 2, billed as the open one, mostly
confirmed that the derived layer is broader than the deck, which is cheap and fine. The
transferable bit: the dangerous gap is the one with a plausible field already in it.
