# Handoff: rung 4 shipped — NEXT IS RUNG 5 (owner decided 2026-08-21)

Date: 2026-08-21 (updated same day with the owner's direction). Written for a fresh session
— possibly a DIFFERENT MODEL on a fresh seat — with no prior context. Read §2's list before
doing anything.

## 1. The owner's decision (2026-08-21, verbatim intent)

**Continue the rungs and ladders; once the ladder is done, discuss the builder.** So:
- **NEXT: rung 5 — remote cards** (the ladder's last row: generative UI, card envelopes, the
  untrusted-output boundary). Fresh brainstorm → spec → plan, with rung-4 findings in hand —
  never reuse an old spec.
- The **compile-to-WC builder** is DEFERRED until the ladder's exit condition is met (every
  component family driven by a real application — check the parent spec's exit condition
  before declaring it met; rung 5 may or may not be the last rung). Its spec input (the
  artifact-seam inventory) already exists; do not start it without the owner.
- Owner is near their weekly token limit; keep runs lean, prefer cheap models per the model
  policy in §5.

## 2. Read these, in this order, before rung-5 work

1. `docs/superpowers/specs/2026-08-18-iteration-ladder-design.md` — the parent spec: ladder
   rows, front-door rule, exit condition, contamination control.
2. `docs/superpowers/research/2026-08-20-rung-4-front-door/findings.md` — the 25-finding
   catalog (three provenance rounds, model-attributed), the artifact-seam inventory, and the
   S1 list. Rung 5's spec must check which findings it re-exercises.
3. `docs/superpowers/plans/2026-08-19-rung-1-support-widget.md` — the clean-room harness
   protocol § "The MCP-only rebuild" + ALL amendments (scoped umask — a global umask 177
   destroyed a run's transcript; keyless probing via a mirrored dir excluding `.env*` because
   Vite `loadEnv(mode, root, '')` ignores `envDir`).
4. `docs/superpowers/specs/2026-08-20-rung-4-builder-design.md` +
   `docs/superpowers/plans/2026-08-20-rung-4-builder.md` — the shape a rung's spec/plan takes
   (orchestration plan, not code tasks) and the harness/task template rung 5 should mirror.
5. For remote-cards DOMAIN context: `docs/superpowers/plans/2026-06-13-card-contract-foundation.md`,
   `docs/superpowers/plans/2026-06-14-generative-ui-overview-sdk.md`,
   `docs/superpowers/plans/2026-06-14-iframe-transport.md` (historical — verify against
   current source), plus `packages/ui/src/primitives/card-routing.ts` (URL guards),
   `packages/ui/src/schemas/` (card schemas + `tool-defs.ts`), and repo `SECURITY.md` +
   CLAUDE.md § "Everything the model produced is untrusted input" — the boundary rung 5
   exists to drive.
6. `docs/superpowers/specs/2026-08-20-workspace-recast-design.md` — the four-tier taxonomy
   (primitives · elements · layout elements · blocks) and construction-over-configuration
   ruling; rung findings get routed into that frame.
7. `docs/coupling-map.md` — before changing anything that has a second side.
8. Settled, do not re-litigate: cards come from TOOLS, not structured output
   (owner-settled; also the `model-driven-components` memory).

## 3. State: MERGED on main

| Commit/PR | What |
|---|---|
| #304 (squash, 34459b3d) | Rung 4 complete in one PR: spec + plan · `examples/apps/builder/` (port 5181, Lovable-style page builder, front-door-built by a clean-room agent — 134 turns, transcript preserved, src/ landed byte-identical) · research dir `docs/superpowers/research/2026-08-20-rung-4-front-door/` (25 F-numbers, per-call MCP table, 615-line artifact-seam inventory = 48% of app proper) · fix(ui) resizable separator flex-squeeze · a five-defect real-model fix wave from the owner's live validation. |
| 77810a73 | First version of this handoff. |

Owner validated live twice: round 1 FAILED on real multi-turn (literal \n corruption,
v2/v3/v4 from one turn, lying mock badge) — all root-caused from 57 captured SSE streams and
fixed with two more of the same class (narrate-instead-of-call, codeless file metadata).
Round 2: "works well enough — prove it can be done", merged.

Rung apps so far: `examples/apps/support-widget` (rung 1) · `voice-assistant` (rung 2) ·
`workspace` (rung 3, port 5180) · `builder` (rung 4, port 5181). Ports 5173–5181 + 4200 are
taken; a new app reads every vite.config under examples/ and picks the next free.

## 4. What rung 4 proved and what it indicts (input to rung 5's spec AND the next docs/MCP round)

The clean-room builder FOUND the cards-from-tools seam and shipped a working app — but via 37
direct package inspections against 10 MCP calls, including nine consecutive reads of minified
`dist/elements/cards.js`. `onToolCallReady`, `addCard`, `emitCardEvent`,
`listenForCardEvents` score ZERO across every MCP response and `llms-full.txt`. Highest-leverage
items, all in `findings.md`:

- **F-20 S1**: `cardTools`' artifact schema (top-level `anyOf`) is 400-rejected by OpenAI,
  Anthropic AND the DeepSeek route in non-strict mode — the mode the kit's own error text
  recommends (`tool-defs.ts:228`); the strict-mode guard at `tool-defs.ts:419` never runs.
  `embed` (top-level `allOf`) filed as a derived prediction. **Rung 5 is remote cards — it
  will hit this wall immediately; consider fixing F-20 kit-side FIRST or the rung measures a
  known blocker.**
- **F-10 S1**: the scaffolder block-2 route template's unguarded `await request.json()` kills
  a Vite dev server on a bare GET (`agent-tooling/route-emit.ts`, `scaffold.ts`) — rung-3's
  and rung-4's apps both inherited it (both now guarded app-side; the TEMPLATE is still
  unfixed).
- **F-23 S2**: the artifact card schema cannot express "files must carry code" — cheap models
  return schema-valid metadata-only files (5 of 6 DeepSeek turns); every consumer
  hand-narrows (see `demandFileCode()` in the builder app).
- **F-24 S2**: the cheap-model robustness cluster nothing teaches — double-escaped tool-arg
  HTML, parallel duplicate calls, narrate-instead-of-call; half is a scaffolder product gap
  (`parallel_tool_calls`/`tool_choice` appear nowhere in agent-tooling or wire).
- Kit follow-ups: resizable restore writes 100% without reserving the handle's width (8px
  clip residual — the handle itself no longer collapses, fixed in #304); `noNav` leaves
  Reload/Home rendered (undiagnosed app-vs-kit); stream-abort errors render as plain prose
  (no role=alert) when apps swallow `upsertTool`; F-22 S2 (tool-arg parse failure lands only
  on `upsertTool` output-error + undocumented `ModelToolCall.error`; scaffold-emitted code
  checks `turn.error`, which that path never sets).

## 5. Working method (binding; priced in across rungs 1–4)

- **Supervisor mode**: delegate ALL file work; briefs via `scripts/brief.mjs`, writer-locks
  via `scripts/writer-lock.mjs`; commits are the supervisor's; independent reviewer per task;
  ledger per plan under `.superpowers/sdd/<plan-basename>/progress.md` (rung-4's ledger and
  IVP evidence are KEPT there — house precedent).
- **Front door rule**: a rung app's code is written by a clean-room agent (kai MCP + stripped
  tarball, outside repo context, throwaway CLAUDE_CONFIG_DIR); repo plumbing stays insider.
  README records the ENTIRE build conversation verbatim (owner policy).
- **Credential protocol**: builder runs on the owner's subscription seat; keychain →
  0600 file under a umask-subshell, trap-deleted, disclosed to the owner BEFORE launch.
  Rung-4's launcher (with planted-defect-verified post-run assertions) lived in the session
  scratchpad — TEMP, may be gone; reconstruct from
  `.superpowers/sdd/2026-08-20-rung-4-builder/task-1-report.md` + the rung-1 plan amendments.
- **Model policy (owner, 2026-08-21)**: test against CHEAP models — target
  `deepseek/deepseek-v4-flash-0731` (the builder app's default; gpt-4o-mini the verified
  alternate). OpenRouter's Anthropic routes corrupt streamed tool-call argument deltas
  (F-21) — avoid for streamed tool calls. `.env` with `OPENROUTER_API_KEY` + model can be
  copied from any `examples/apps/*`; never committed.
- **Verification floors**: multi-turn REAL acceptance (3 turns, both models) for any app with
  history — single-turn passed while two-turn was broken. IVP probes must pierce shadow DOM
  (F-19) and demonstrate they CAN fail before their green is trusted. Capture bytes (request
  + raw SSE) before diagnosing. Watch CI by run id for the exact head SHA
  (`gh run watch <id> --exit-status`), never `gh pr checks --watch`. The CI `test` job is the
  only merge gate. Owner live eyeball on any new UI before merge.
- Build realities: `npm run build` inside packages/ui (never trust nx caches); `verify:fresh`
  gates any pack; never `nx test`; never hand-edit versions (release-please).

## 6. Banked (carried forward; none scheduled — pick deliberately)

- Owner-sanctioned builder follow-up (banked, not built): a server-side session directory the
  builder writes generated files into — real URLs → true multi-file pages + reload
  persistence.
- create-kai stale dist pin ^0.23.0 (CONSUMER-FACING) + .npmrc guard vacuity ·
  `docs/web-components.md` curated list lacks kai-conversation-item · 14 element-coverage
  waivers · kai-menu narrow coverage · docs voice pass over the re-cast surface ·
  `surfaces.ts` stale-props note · ~180 on-disk `.claude/worktrees/` dirs · builder app
  `onSubmit` drops prompts while loading (F-25 S4) · #280 kai-devtools (owner-parked) ·
  #267 release-please (owner's — NEVER touch).
- **Release**: main carries three `feat!` since 0.25.2 plus rung-4's `feat` + `fix(ui)`;
  a release publishes the lot. Owner's call.

## 7. Owner interaction points

- Rung-5 brainstorm decisions (what app; whether F-20 gets fixed before the rung) — ask
  before spec-writing.
- Credential disclosure before any clean-room launch. Live eyeball before merge.
- Release timing. Builder discussion only after the ladder is done.
