# Handoff: the composition catalog

Date: 2026-08-18
Status: **BUILT. PR #288 open and unmerged.** Written to be handed to a fresh session with no prior context.
Verified against `feat/composition-catalog` at `78a2bfc9` (42 commits ahead of `origin/main`).

A separate session owns `docs/superpowers/HANDOFF-2026-08-13-*.md`, `docs/coupling-map.md` and root
`CLAUDE.md`. This file is new and edits none of them.

---

## 1. Where we are

`docs/superpowers/specs/2026-08-16-composition-catalog-brief.md` asked for a machine-readable description of
what can be composed from this kit. That produced a design spec (#276) and an implementation plan (#277), both
**merged to main**, and an implementation that is **PR #288, open**.

Every gate is green on the merged tree. Measure them rather than trusting this line:

```
pnpm --filter @kitn.ai/ui run typecheck
pnpm --filter @kitn.ai/ui exec vitest run --project=unit
pnpm --filter @kitn.ai/ui exec vitest run --project=emitted
pnpm --filter @kitn.ai/ui run verify:generated
pnpm --filter @kitn.ai/ui run lint:catalog-drift
```

### What shipped

| Piece | Where | Who writes it |
|---|---|---|
| Derived layer, 80 elements | `src/agent-tooling/catalog/derived.json` | `scripts/gen-catalog.mjs`, inside `build:api`. **Never hand-edit.** |
| Seven invariants | `catalog/invariants.ts` | you |
| Inventory + 2 recipes + partConsumption | `catalog/surfaces.ts` | you |
| Scenario deck S1–S7 | `catalog/scenarios.ts` | you |
| Fabricated-tag records | `catalog/fabrications.ts` | the evaluator proposes; you commit |
| Drift lint | `scripts/lint-catalog-drift.mjs` | required CI, 70 self-test cases |
| Acceptance pack | `scripts/acceptance-pack.mjs` | — |
| Runner / evaluator | `scripts/acceptance-run.mjs`, `acceptance-eval.mjs` | — |
| `component_reference` on the catalog | `src/agent-tooling/mcp/tools/reference.ts` | — |
| **Usage guide** | `src/agent-tooling/catalog/README.md` | 582 lines, every command executed |

Read the guide first. It is the only document that tells you how to run any of this.

### Two aspects, and they are easy to conflate

- **Building an app** uses only the **MCP**. Wire it per
  `apps/docs/src/content/docs/guides/for-ai-agents.mdx`, then your agent asks `component_reference` and gets
  contracts instead of only API surface. There is no agent we ship; the agent is the user's.
- **Measuring whether that helps** uses the acceptance pack/runner/evaluator. That is QA, not a build path.

---

## 2. Where we need to be

**The claim to prove: a catalog can substitute for training-data volume.** Frontier models already build with
`kai-*` — the entire Storybook and docs corpus was AI-generated before any of this existed. So the catalog's
value is not "makes it possible". It is three narrower things:

1. correct output at a fraction of the cost (a cheap model, not a frontier one),
2. correct output **without our source in context** (a developer's app, not this repo),
3. catching the class of error that looks fine and is not — streaming that renders and never updates.

None of those is measured yet. **The tier delta is the instrument**: the same scenario across
`~deepseek/deepseek-v4-flash-latest` and a frontier model, where anything the strong model gets right and the
weak one gets wrong names a contract the catalog leaves implicit.

---

## 3. Where we need to go

Ranked. The first is unfinished work, not a new idea.

1. **Re-run the MCP demo against a fresh build.** A real run on 2026-08-18 had an agent build a working chat
   app from MCP output alone — but against a `dist/` built at 05:33 while the reference tool changed at 20:41,
   so it measured the PRE-catalog tool. Current source vs that build: `kai-chat` 39,395 vs 21,497 bytes; event
   `detail` shapes, the upgrade hazard and delivery guidance absent in the old, present in the new. Its
   top-three gaps are exactly what the fix added. Artifacts in `tmp/demo/`; the probe that queries current
   source is `tmp/demo2/probe.mjs` (the bundle must sit at `<pkg>/src/agent-tooling/mcp/` or manifest
   resolution fails).
2. **Wire the `compiles` gate** to `verify-scaffold-compiles.mjs`'s tsc projects. Turns a judged score into a
   measured one. `registers` and `streams` follow.
3. **Run the deck across tiers and read the delta.** The first real acceptance run. The spec predicts it fails
   badly and says that failure list IS the specification for the next round.
4. **~80 JSDoc lines**, one per element facade. `custom-elements.json` has 80 declarations and 0 descriptions,
   so the catalog can list everything and help an agent choose nothing. Improves the docs site and
   `llms-full.txt` at the same time.
5. **Four small fixes found by the demo** (§5).

### Not built, and easy to overclaim

- The three objective gates (`compiles` / `registers` / `streams`) are **declared and fail closed** — absent
  scores zero and the rubric refuses to score — but **not implemented**. You supply `gates.json` by hand.
- **No acceptance run has produced a number.** `FABRICATED.md` is empty by construction and says so.
- **There is no user feedback loop.** The improvement loop that exists is the maintainer's: run → read the
  improvement analysis → edit the authored records → the drift lint keeps you honest → re-run. When a
  *consumer's* agent gets something wrong, nothing carries that back. Arguably the more valuable loop.

---

## 4. How to make improvements

Edit the **authored** files, never `derived.json`. The drift lint refuses anything that does not resolve:
a misspelled element, an invariant id that does not exist, a corpus path that is not a file, an inventory
title naming no story. Run `pnpm --filter @kitn.ai/ui run lint:catalog-drift` before pushing; it self-tests
first, so a green means the checker still discriminates.

The evaluator's **catalog-improvement analysis** is the real output of a run: each finding attributed to the
record that should have prevented it, ranked by how many findings each change would close.

---

## 5. Open findings not about the catalog

- `npx @kitn.ai/ui --version` starts a JSON-RPC server and **hangs on a pipe**. `bin/mcp.js` never reads
  `argv`; the documented `npx … mcp` works only because npx runs the package's single bin. Confirmed three
  ways including through real npx. Those are the flags someone reaches for when an MCP config is broken.
- The tool schema declares `additionalProperties: false` and **does not enforce it** — a wrong argument key
  silently returns the 80-element index. Decide-loudly, broken on the MCP's own surface.
- **An array set as a JSON HTML attribute renders.** The scaffolder's stated reason ("arrays can't be HTML
  attributes") is false for this build. The same wrong explanation was corrected in the catalog's examples.
- `scaffold` places `kai-conversations` as a sibling below the chat rather than in its `sidebar` slot, and
  refers you to `component_reference` for wiring.

## 6. Decisions waiting on the owner

1. Two inventory rows (`Resizable Collapsed`, `Conversations Collapse`) are sorted `ingredient` while their own
   sources describe a bug repro and a behaviour demo — `corpus` by the file's stated criterion. They came
   verbatim from the spec table reviewed in #276.
2. `isSafeUrl` / `isRenderableLink` are exported from no public entry, so the catalog's own security advice is
   unreachable; the examples use inline checks instead. Exporting them is an API decision.
3. `component_reference` costs 13–18 KB per lookup, ~11 KB of it universal records repeated on all 80
   elements. Shipped at full detail deliberately — every available trim drops a qualifier, and dropping
   qualifiers is how these claims became false. The first acceptance runs should settle it.

## 7. Coupling-map rows to add (that file is owned elsewhere)

`package.json exports ↔ EXPORT_NOTES` (this one made the branch red on main until it was added) ·
authored catalog records ↔ the tree, via `lint:catalog-drift` · `derived.json` ↔ its sources, via
`verify:generated` · the `MessagePart` union ↔ `partConsumption` · the title-reader parity across two files ·
`component_reference` ↔ `status`/`enforcedBy`/`wiring`. Two existing rows are stale: the one enumerating
`verify:generated`'s artifacts omits `derived.json`, and item 16 calling `element-manifest.json` "the one
derived artifact missing from `verify:generated`" was already false before this branch.

## 8. How this was built, and what it cost

Every task went implementer → independent reviewer, the reviewer writing its own adversarial probes rather
than re-running the implementer's. Three tasks needed 3–5 fix rounds. **Roughly half of everything found was
in the checks rather than the code.** The 15 named failure modes are in the `verification-lessons-2026-08-17`
memory; the full ledger with ~85 rulings is `.superpowers/sdd/2026-08-17-composition-catalog/progress.md`
(gitignored, local only) alongside 21 per-task reports.
