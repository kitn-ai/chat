---
name: consumer-regression
description: Use when verifying that @kitn.ai/ui and its `kai` MCP scaffolder build and run in REAL consumer apps across frameworks — after changing the library, the scaffold tool, a catalog integration, or an element; before merging consumer-facing changes; or when adding a new framework, integration, archetype, or backend. This tests the published-package CONSUMER experience, not the kit's own unit suite.
argument-hint: "[smoke|regression] [scope e.g. 'react' | 'all' | 'integrations']"
---

# Consumer Regression

## Before you run (cost gate)

This deploys **many parallel subagents** (one per matrix cell, each building + running a real app) — a large token + wall-clock cost. So:
- **Confirm scope + mode with the user before a full run.** Default to **SMOKE** (one pass, no fixing) or a single cell unless explicitly asked for full REGRESSION.
- If invoked with arguments, treat them as `mode` + `scope` (e.g. `/consumer-regression smoke react`). Mode/scope = `$ARGUMENTS`.
- A full REGRESSION across the whole matrix is the heaviest operation in this repo — only run it when the user asks to harden, or after a SMOKE pass went red.

## Overview

Prove that a developer can drop the `kai` MCP's scaffold output + the `@kitn.ai/ui` package into a real app and get a working chat — across every framework, archetype, integration, placement, and model tier. It builds real throwaway consumer apps (against a **local** package build, so unmerged fixes are testable) with parallel subagents, diagnoses every failure by **layer**, and loops fix → re-verify until clean.

**Core principle:** the only proof that consumers can build a chat is a real consumer app that builds AND runs. The kit's own unit suite does NOT catch packaging / exports / SSR / scaffold-output bugs; those only surface in a fresh consumer app. This harness is what catches them.

This complements, never replaces, the kit suite. Run the kit suite for internals; run THIS for the published-package consumer experience.

## Two modes

| Mode | Does | Use when |
|---|---|---|
| **SMOKE** | One pass: fan out probes across the matrix, collect verdicts, **no fixing**. | Fast health check / pre-merge gate. "Is the consumer experience healthy right now?" |
| **REGRESSION** | The full loop: probe → triage → fix → re-verify, repeated until error-free; then a model sweep + breadth. | Hardening, or when SMOKE went red. |

Both deploy multiple agents and report. The only difference: REGRESSION triages, fixes, and loops. **Run SMOKE first** — if every cell is `WORKS-clean`, you're done; if any cell is not, escalate that cell (or all) to REGRESSION. (You usually DO want the loop once anything is red — a single pass tells you it's broken but not that a fix actually worked.)

## The two agents (project-local, `.claude/agents/`)

- **consumer-probe** — builds ONE framework's app against the local tarball + one scaffold, runs it (Playwright), reports by layer. **Strictly read-only on the repo.** Deploy one per matrix cell, at a chosen model tier.
- **regression-triage** — reads a round's probe reports → one deduped, root-caused master fix list + the critical path. Deploy one per round, on a high-end model (opus).

Dispatch them with the Agent tool (`subagent_type: "consumer-probe"` / `"regression-triage"`), filling in the per-cell details (framework, tarball path, scaffold path, model) at dispatch time.

## Phases

### Phase 0 — Setup (controller, once)
First resolve the **portable paths**: NEVER hardcode them (the repo lives elsewhere on every machine; see recipes.md "Conventions"). This is a pnpm + NX workspace: the publishable package is `packages/ui`, not the repo root (root is `kitn-ai`, `private: true`).
`REPO="$(git rev-parse --show-toplevel)"; HARNESS="$(dirname "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")")/consumer-harness"`
Running from a **git worktree** is supported and intentional: `$REPO` resolves to the worktree, which is exactly right when the point is to test an unmerged branch. The `$HARNESS` derivation above walks through the main checkout's `.git` so the harness still lands outside every worktree.
1. Build + pack the LOCAL package so fixes are testable (NOT the published version). Build from the repo ROOT (`nx` is not on PATH, so the `pnpm exec` prefix is required), then pack from `packages/ui`:
   `cd "$REPO" && pnpm exec nx build ui && cd packages/ui && npm pack` → `kitn.ai-ui-<v>.tgz`.
   The build regenerates six checked-in files (recipes.md "Post-build churn"). On a branch where the shapes genuinely changed, that regeneration is legitimate and should be committed, not reverted. Only discard it when you're packing mid-investigation and don't want the churn.
2. Copy it to a **stable** path the probes install from — so a re-pack during a fix can't race a reading probe:
   `mkdir -p "$HARNESS" && cp kitn.ai-ui-*.tgz "$HARNESS/kitn-stable.tgz"`.
3. `$HARNESS` is a **sibling of the main checkout, OUTSIDE it**: keeps the repo's git clean regardless of worktree.
4. Generate the scaffolds for each cell from the live MCP bin (recipes.md `gen-scaffolds`). **After ANY `packages/ui/mcp/mcp/tools/scaffold.ts` change, rebuild the bin first** (from `packages/ui`: `KAI_BUILD=mcp npx vite build --config config/vite/node.ts`) or you'll generate stale output.

### Phase 1 — Probe (parallel consumer-probe agents, MIXED models)
Dispatch one `consumer-probe` per matrix cell, in a single message so they run concurrently. **Pass each probe the RESOLVED absolute paths** in its prompt — the repo path (`$REPO`), the tarball (`$HARNESS/kitn-stable.tgz`), its scaffold file, and its report path. The probe never resolves these itself (its cwd is a throwaway app, not the library repo). Deliberately spread model tiers (haiku/sonnet/opus — see Model strategy). Each returns a verdict + a report file.

### Phase 2 — Triage (one regression-triage agent, opus) — REGRESSION only
Hand it the probe report paths. It returns the deduped master fix list, grouped LIBRARY → SCAFFOLD-OUTPUT → FRAMEWORK/DOC, with the **critical path** (smallest set of fixes that flips the most cells to clean).

### Phase 3 — Fix (controller + focused agents) — REGRESSION only
Partition fixes by file to avoid collision. The controller does delicate **library** surgery + shared-file changes itself; focused agents do well-specified fixes (TDD where practical, commit per fix). After fixes: rebuild the bin (scaffold change) and/or rebuild + re-pack the tarball + refresh the stable copy (library change).

### Phase 4 — Re-verify (loop) — REGRESSION only
Re-probe the affected cells against the FIXED tarball/scaffolds. Confirm they flip to `WORKS-clean`. **Loop Phases 1–4 until error-free.** A single pass proves it's broken; only the loop proves a fix worked.

### Phase 5 — Model sweep
Run the SAME validated scenario across ALL frameworks built **entirely by Haiku**. Measures whether a cheap model can use the tooling. (Observed: with rough tooling, weak models stall; with solid tooling, Haiku builds every cell clean — robust tooling removes the model dependency. This is the headline metric for "what model do consumers need.")

### Phase 6 — Breadth
Add cells — a new framework, archetype, integration, placement, or backend — and run the same loop. See recipes.md for the matrix + mock-backend recipes.

## Model strategy

- **Probes (full fan-out):** spread tiers on purpose. Use **haiku** (budget) on a couple of cells, **sonnet** (mainstream) on most, **opus** on the hardest (SSR, a new framework, a complex backend). The point is to expose model sensitivity, not just to pass.
- **Single cell / small SMOKE:** default to **sonnet** (no need to spread tiers for one cell).
- **Triage, reviews, audits, library surgery:** **opus** (high-end). Cheap models miss subtle root causes.
- **The model sweep (Phase 5):** all **haiku**, to measure the floor.

## Critical gotchas (these bit us; honor them)

- **Probes are READ-ONLY on the repo.** They must never edit/build/repack the library — only their own app dir. (Rogue probes that "helpfully" fixed the lib + repacked raced each other and corrupted a whole round. A library bug = REPORT, not fix.)
- **Install the LOCAL tarball, never npm.** The published version doesn't have the fix you're testing.
- **Stable tarball copy** so a fix's re-pack can't race a reading probe.
- **Harness outside the main checkout** → clean `git status`, in a normal clone or a worktree.
- **Rebuild the MCP bin after every `scaffold.ts` change** before regenerating scaffolds (else stale output — this slipped repeatedly).
- **Re-pack + refresh the stable copy after every library change**, then re-probe.
- **Six files churn on every build** (recipes.md "Post-build churn"). Revert them only when you're packing mid-investigation and don't want the noise. If the shapes genuinely changed on this branch, commit the regeneration instead.
- **No-creds backends:** never skip the stream test — mock the upstream/model (recipes.md).

## Heavy reference

See **`recipes.md`** in this skill folder for: exact setup + scaffold-generation commands, the full test matrix (frameworks × archetypes × integrations × placements × backends + what's verified), the mock-backend recipes per integration (local OpenAI-SSE server; AI-SDK MockLanguageModel; LangChain FakeChatModel; Pydantic AI TestModel), the SSR import-safety check, and the Playwright shadow-DOM pattern.

The probe + triage report schemas live in the two agent definitions (`.claude/agents/consumer-probe.md`, `.claude/agents/regression-triage.md`).
