# Handoff: the construct engine (workstream 2), mid SDD-execution

Date: 2026-08-26. Written for a fresh seat, any model, no prior context.

## Read in this order
1. `.superpowers/sdd/2026-08-25-construct-engine/progress.md` — THE LEDGER. Every task, ruling,
   banked finding, review outcome. It is the source of truth; trust it + `git log` over any recollection.
2. `docs/superpowers/specs/2026-08-25-construct-engine-design.md` — the spec (exec summary + decisions-ledger table).
3. `docs/superpowers/plans/2026-08-25-construct-engine.md` — the 17-task implementation plan (+ Task 10b inserted, + Task 18 owner-added).
4. Memory `[[construct-engine]]` and `[[roadmap-rulings-2026-08-24]]`.

## What this is
The ENGINE (workstream 2 of the roadmap): a declarative construct format + codegen-only pipeline
(`kai dev`/`compile`/`eject`/`validate`) that turns one JSON file into a self-registering web
component composed from the kit. Owner-brainstormed + spec'd + being executed subagent-driven
(superpowers:subagent-driven-development): fresh implementer per task → task review → fix loop → ledger.

## State: branch `feat/construct-engine` (NOT pushed, NOT merged — the working branch)
Cut from `docs/construct-engine-spec` off main. Head at handoff: `508ddb71`.

**Done + reviewed clean (Tasks 1–13 + 10b):** schema/validate · `@kitn.ai/ui/define` public entry ·
codegen core · CLI (bin dispatcher, validate/eject) · `kai dev` (live preview, demo checkpoint) ·
`kai compile` · endpoint provider (openai+anthropic wires) · capabilities starters/attachments/history ·
reasoning capability (full|compact|off, needed a kit prop) · cards (render as real schema-driven FORMS
with x-kai masks) · layouts widget/fullscreen/aside/split · slots escape hatch + `custom` layout
(split now uses WorkspaceShell — a real draggable splitter; LT-1 done).

**START HERE on resume: Task 14** (schema publication).

**Remaining:** 14 schema publication (build:api artifact + drift guard, `apps/docs/public/schemas/construct/v1.json`) ·
15 `verify:construct` CI gate (axes derived from the schema, fixtures compiled + consumer-bundled) ·
16 the `construct` MCP tool (turn-by-turn authoring, beside scaffold/component_reference/theme/debug) ·
17 end-to-end conversational fixture (an agent builds the owner's four-sentence widget) ·
18 real-model acceptance (owner-added: compile an endpoint construct, real DeepSeek/OpenRouter multi-turn, capture SSE bytes).

## Proven working (the thesis holds)
The demo checkpoint (Task 5) ran long and productive — the owner reviewed a live widget and drove
every visual fix. A construct → codegen → compiled widget → REAL DeepSeek conversation is proven
end-to-end (Task 7 + the live demo): two-turn context round-trip, SSE bytes captured. `kai compile`'s
emitted `.js` renders standalone in Chromium.

## Live demo (owner may still be looking / kill on resume if stale)
`http://localhost:5199/` — a live DeepSeek-via-OpenRouter construct widget, PID 62880, running from
`<scratchpad>/deepseek-support-app`, kit installed from the tarball at
`.superpowers/sdd/2026-08-25-construct-engine/t5-evidence/kitn.ai-ui-0.26.0.tgz`. Uses the OPENROUTER
key from `examples/apps/builder/.env` (DeepSeek default). `:5173` (mock demo) is down. To rebuild after
a kit change: repack that tarball, `rm -rf node_modules/@kitn.ai/ui` in the app, reinstall, restart.

## Owner decisions BANKED for the owner (surface these on resume)
- **CD-1 (Important, cards):** when a model calls a card tool WITH arguments (`kai_refund_approval {amount:50}`),
  those values are DISCARDED — the form always renders empty. Fix = merge model args into `FormField.default`
  so "model proposes → user confirms" (the refund_approval flow's whole point) works. Owner decision + follow-up task.
- **Reasoning `compact` (awareness):** shows a shimmer loader while streaming, then renders NOTHING after
  settle (≡ off post-stream). Matches the owner's approved wording; flag if they wanted a retained collapsed chip.
- Owner asked (2026-08-25): general-UI positioning/docs round (~⅓ of 84 elements are general atoms; docs market only "AI chat"). Separate from this plan.

## Banked kit-debt / follow-ups (not owner-gated)
- **LT-1 (folding into Task 13):** `split` layout should use `WorkspaceShell` (already exported from
  `./solid`, real draggable splitter) instead of PaneGroup+fixed-flex.
- **CD-2/CD-3 (minor):** a cheaper structural card-schema validation option; emitted submit() loop indentation. → final-review cleanup.
- **RB-1/RB-2 (kit, real, low-sev):** `useStickToBottom` has no watchdog outside rAF (fragile under frame starvation — the "reasoning inversion" + "no autoscroll" the owner saw were BOTH frame-starvation artifacts, NOT real defects, proven causally); MutationObserver misses non-mutation content growth (late image bytes). Each its own diagnose-then-fix.
- **Pre-ship gaps blocking the branch's eventual PR:** (1) `kai eject` ignores `--ui` (dev/compile honor it); (2) codegen emits an import from `@kitn.ai/ui/define`, which published `0.26.0` does NOT export — an ejected app off this branch fails `npm install` until a release ships `./define`. Both must be resolved (or the release cut) before this branch merges and before `kai` is usable off npm.

## Kit fixes that landed on this branch (real pre-1.0 defects the demo surfaced)
message-text used brand token (d1f30f21) · brand-token-on-content sweep, 7 sites + e2e guard (f08f32eb/b4d8742a) ·
ChatThread `attach` passthrough (93af0f62) · reasoning display-mode prop (de4e419e) · cards-in-thread now
render as forms (95820257). These are library-wide improvements, not construct-only.

## Method notes priced in this session
- Subagent background runs DIE at the subagent's turn boundary — workers must run gates FOREGROUND; several stalled pre-commit and were resumed to finish foreground. Carry this in every dispatch.
- The real gate is `npm run typecheck` (full chain), not `tsconfig.mcp.json` alone (a fix passed the narrow one, failed the full — Task 3 round 2).
- Committed tests must not depend on `.superpowers/` (gitignored) — pack from the repo's own dist, content-keyed (Task 6 rounds).
- Composition-over-reauthoring is THE lesson: every capability that threaded through an existing kit prop (starters→suggestions, attach, reasoning) was clean; the one that hand-rolled (the original demo panel) generated a cascade of visual bugs. Emit the kit's surface, don't restate it.
