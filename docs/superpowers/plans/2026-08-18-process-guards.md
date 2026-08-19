# Plan: process guards (Candidate C)

Date: 2026-08-18. Spec of record: `docs/superpowers/specs/2026-08-18-iteration-ladder-design.md` §C.
Branch: `chore/process-guards` off `main`. Sequenced before rung 1 of the ladder.

Iteration 1's code was sound; nearly every mistake was the orchestrator's. Five of those are
mechanizable by scripts smaller than guards this repo already trusts. This plan lands them.

## Global constraints (every worker brief carries these verbatim)

The single source is `docs/superpowers/briefs/template.md` § Standing constraints — briefs are
generated from it via `scripts/brief.mjs`, never retyped. (This section originally restated the
list in reworded form; guard 4's verifier flagged that as exactly the divergence the template
exists to kill, so it is now a pointer.)

## Guards and file ownership

| Guard | Files | Worker |
|---|---|---|
| 1. Artifact freshness (`verify:fresh`) | `packages/ui/scripts/verify-artifact-fresh.mjs` (new), `packages/ui/package.json` (one script line) | A (opus) |
| 3. Writer lock | `scripts/writer-lock.mjs` (new) | B (sonnet) |
| 4. Brief template | `docs/superpowers/briefs/template.md` (new), `scripts/brief.mjs` (new) | B (sonnet) |
| 2. Gate parity (`lint:gate-parity`) | `packages/ui/scripts/lint-gate-parity.mjs` (new), `packages/ui/package.json`, `.github/workflows/test.yml`, historical-doc labels | C (opus), after A |
| 5. Threshold derivation (`lint:thresholds`) | `packages/ui/scripts/lint-threshold-derivation.mjs` (new), `packages/ui/package.json`, `.github/workflows/test.yml` | C (opus), same worker as 2 |

A ∥ B run concurrently (disjoint files, one checkout, no builds). C runs after A because both
touch `packages/ui/package.json`; 2 and 5 share a worker because both touch `test.yml`.

## Design decisions (rulings, with reasoning)

- **Guard 1 is NOT a CI step.** CI builds fresh immediately before measuring, so the check passes
  vacuously there — a check that cannot fail. It is the mandatory first line of local measurement
  runs and rung briefs. It compares mtimes/hashes directly and never trusts an `nx build` exit
  code (the NX-cache trap in CLAUDE.md).
- **Guards 2 and 5 ARE required-CI steps** (no build needed, seconds), added to the `test` job
  alongside the other lints, following the workflow's per-step comment convention.
- **Gate lists are a parsed convention, not prose.** A doc block marked complete must equal the
  `test` job's step set both directions. An UNMARKED fenced block with 3+ gate-shaped commands in
  `docs/superpowers/**` is a hard failure ("mark it complete or label it partial") — that is the
  teeth; the iteration-1 plan's 7-command list would have failed exactly this way. Historical docs
  get a partial/historical label, never a rewritten record (the `lint:cdn-pins` precedent).
- **Threshold lint scopes to files dated ≥ 2026-08-19** (derived from the `YYYY-MM-DD-` filename
  convention, not a hand-list), so the 41 historical plans do not churn.
- **Writer-lock claims are explicit paths or directory prefixes**, not globs — overlap detection
  stays trivial and wrong in neither direction.
- **The brief generator reads the template at run time**; prohibitions exist in exactly one file.
  Reviewer briefs get the same prohibitions block as implementer briefs — their absence from
  reviewer briefs is the recorded failure this guard exists for.
- **Not mechanized, stated so it is not mistaken for covered:** asserting something without
  looking it up. Briefs state it; nothing enforces it.

## Verification

Each worker's report is a request for verification, not a completion. An independent verifier
(different agent, own probes) confirms per guard: the self-test fires on planted defects (positive
control), the real invocation passes on the clean tree, and for CI-wired guards the workflow step
actually invokes the script. Full local gate before push: the no-build lints, then typecheck.
The merge gate is CI's required `test` job, not a local list.
