# Handoff: rung 4 shipped — the builder proved the artifact seam end to end

Date: 2026-08-21. Written for a fresh session with no prior context.
Supervisor of record: Fable seat, orchestrate-and-verify, subagent-driven with writer-locks and briefs; ledger at `.superpowers/sdd/2026-08-20-rung-4-builder/progress.md` (kept, not deleted — house precedent; IVP evidence in `.superpowers/sdd/2026-08-20-rung-4/`).

## 1. State: MERGED on main

| Commit/PR | What |
|---|---|
| #304 (squash, 34459b3d) | Rung 4 complete in one PR: spec + plan · `examples/apps/builder/` (port 5181, Lovable-style page builder, front-door-built by a clean-room agent — 134 turns, transcript preserved, src/ landed byte-identical) · research dir `docs/superpowers/research/2026-08-20-rung-4-front-door/` (25 F-numbers over three provenance rounds, per-call MCP table, 615-line artifact-seam inventory = 48% of app proper) · fix(ui) resizable separator flex-squeeze · a five-defect real-model fix wave from the owner's live validation. |

Owner validated live twice: round 1 FAILED on real multi-turn (literal \n corruption, v2/v3/v4 from one turn, lying mock badge) — all root-caused from 57 captured SSE streams and fixed with two more of the same class (narrate-instead-of-call, codeless file metadata). Round 2: "works well enough — prove it can be done", merged. Default model is `deepseek/deepseek-v4-flash-0731` (owner-directed; gpt-4o-mini verified alternate; OpenRouter's Anthropic routes corrupt streamed tool-arg deltas, F-21).

## 2. What rung 4 proved and what it indicts

The clean-room builder FOUND the cards-from-tools seam and shipped a working app — but via 37 direct package inspections against 10 MCP calls, including nine consecutive reads of minified `dist/elements/cards.js`. `onToolCallReady`, `addCard`, `emitCardEvent`, `listenForCardEvents` score ZERO across every MCP response and `llms-full.txt`. The single highest-leverage list for the next docs/MCP round, all in `findings.md`:

- **F-20 S1**: `cardTools`' artifact schema (top-level `anyOf`) is 400-rejected by OpenAI, Anthropic AND the DeepSeek route in non-strict mode — the mode the kit's own error text recommends. `embed` (top-level `allOf`) filed as a derived prediction.
- **F-10 S1**: the scaffolder block-2 route template's unguarded `await request.json()` kills a Vite dev server on a bare GET — two shipped apps carry it (rung-3 and rung-4 pre-fix).
- **F-23 S2**: the artifact card schema cannot express "files must carry code" — cheap models return schema-valid metadata-only files (5 of 6 DeepSeek turns); every consumer hand-narrows.
- **F-24 S2**: the cheap-model robustness cluster nothing teaches — double-escaped tool-arg HTML, parallel duplicate calls, narrate-instead-of-call; half is a scaffolder product gap (`parallel_tool_calls`/`tool_choice` appear nowhere in agent-tooling or wire).
- Kit follow-ups: resizable restore writes 100% without reserving the handle's width (8px clip residual); `noNav` leaves Reload/Home rendered (undiagnosed app-vs-kit); stream-abort errors render as plain prose (no role=alert) when apps swallow `upsertTool`.

## 3. NEXT: owner decision between two paths

1. **Rung 5 (remote cards)** — the ladder's last row: generative UI, card envelopes, the untrusted-output boundary. Ladder discipline: fresh brainstorm → spec with rung-4 findings in hand.
2. **The compile-to-WC builder spec** — the deferred third front door. Its stated input now exists: the artifact-seam inventory (`findings.md` § seam inventory: six links, four marked pure mechanism = compile candidates). Owner sketch in the `builder-compile-to-wc` memory. No spec exists; first step is brainstorm.

Owner also sanctioned (2026-08-21, banked not built): a server-side session directory the builder writes generated files into — real URLs → true multi-file pages + reload persistence.

## 4. Method notes priced in this rung

- Single-turn real-mode verification is NOT verification of a chat app: the owner's two-turn session broke what one turn couldn't. Multi-turn real acceptance (3 turns, both models) is now the floor for any ladder app with history.
- The IVP's probe-can-fail rule earned its keep twice (F-19 shadow-DOM zero-cards; its own S5 drag-offset bug manufactured a false residual against a good fix).
- Cheap models are a test axis, not a cost dodge: D1/D2/D4/D5 only exist on real cheap models; the owner's target model IS one.
- Capture bytes before diagnosing: every root cause this rung was settled by quoting captured SSE, and the prime suspect (history re-encoding) was RULED OUT by capture, not argued away.

## 5. Standing banked list (carried forward)

create-kai stale dist pin ^0.23.0 (consumer-facing) + .npmrc guard vacuity · `docs/web-components.md` curated list lacks kai-conversation-item · 14 element-coverage waivers · kai-menu narrow coverage · docs voice pass over the re-cast surface · `surfaces.ts` stale-props note · ~180 on-disk `.claude/worktrees/` dirs · #280 kai-devtools (owner-parked) · #267 release-please (owner's — NEVER touch). Release note: main carries three `feat!` since 0.25.2 plus rung-4's `feat` + `fix(ui)`; a release publishes the lot.
