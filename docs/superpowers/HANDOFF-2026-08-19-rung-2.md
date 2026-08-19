# Handoff: rung 2 ready to launch, after the rung-1 findings cycle

Date: 2026-08-19. Written for a fresh session with no prior context.
Supervisor of record for the prior session: Fable (the orchestrator-model experiment ran;
result recorded in the `orchestrator-model-experiment` memory — guards + any strong seat ≈
near-zero coordination errors; Fable stayed in the seat by owner choice).

## 1. State: everything below is MERGED on main

| PR | What |
|---|---|
| #291 | The five process guards (verify:fresh · lint:gate-parity · writer-lock · brief template · lint:thresholds). All dogfooded in anger same-day. |
| #292 | Rung 1: `examples/apps/support-widget/` — the ladder corpus home, owner-validated live vs OpenRouter, CI via `verify:starters`' derived roster. |
| #293 | The MCP-only rebuild measurement. **Iteration 1 PASSED its held-open acceptance** — none of the original four one-liner failures recurred. Findings: `docs/superpowers/research/2026-08-19-rung-1-mcp-rebuild/findings.md`. |
| #294 | `abort(reason)` surfaces its reason (S1); reflected booleans read back via the `reflectFlag` seam (repaired declarative `open` on all 13 wireDisclosure facades). |
| #295 | `kai-dock` (spec `docs/superpowers/specs/2026-08-19-kai-dock-design.md`) + the element coverage guard (19 named waivers = the punch list) + both orphaned IVP suites wired into required CI. |
| #296 | The top-3 coverage backfill (kai-tool · kai-dialog · kai-code-block, 102 tests) — which caught and fixed three shipped defects: `<kai-tool open>` ignored on markup-then-assign; kai-dialog nameless; kai-code-block's promised copy button missing. Coverage analyzer hardened against regex/test-name false credits. |

Left OPEN deliberately: #280 (kai-devtools v1 — owner says parked), #267 (release-please —
owner's, never touch).

## 2. Next: rung 2, the voice assistant — spec is WRITTEN and committed

`docs/superpowers/specs/2026-08-19-rung-2-voice-assistant-design.md`. Read it first; the
one-paragraph version: `examples/apps/voice-assistant/` composes the three voice elements
nothing in the repo has ever composed (`kai-voice-input` → the rung-1 mock/OpenRouter
middleware → `kai-voice-output`, with `kai-audio-visualizer` running the state cycle + real
mic amplitude while listening). Browser-native STT/TTS; the key only pays for the text turn.

**Method — the front-door rule's first application (owner-ratified, in the ladder spec's
Working method):** the app code is built FRONT-DOOR-FIRST by a clean-room builder (packed
tarball + kai MCP over stdio + throwaway config + cwd outside the repo), product requirements
only. The voice archetype is KNOWN to under-teach this composition (it emits only
kai-voice-input; kai-voice-output has zero usages anywhere) — the builder's stumbles ARE the
findings. Then insiders finish the distance, every intervention logged as a named teaching gap.
Repo plumbing stays insider. Expected findings are pre-named in the spec so hindsight can't
claim them (chief: kai-voice-output exposes no audio tap for the visualizer during TTS).

**The clean-room harness must be REBUILT** — it lived in the prior session's scratchpad,
which does not survive. The complete recipe (contamination channels, --setting-sources ""
substitution for --bare, credential handling, tarball stripping and its bias direction, the
verbatim-prompt discipline, MCP-over-stdio positive control) is recorded in
`docs/superpowers/plans/2026-08-19-rung-1-support-widget.md` § "The MCP-only rebuild" +
its amendments. Follow it; `verify:fresh` gates the build that gets packed. The kit the
builder meets is materially better than rung 1's rebuild tested (kai-dock, reflectFlag,
abort, the element fixes).

## 3. Working method (unchanged, plus lessons priced in)

- Plain branch off main per iteration; sequential; no worktrees. Delegate implementation;
  independent verification with own probes; writer-lock claims per dispatch
  (`node scripts/writer-lock.mjs`, workspace under `.superpowers/sdd/<plan>/`); briefs via
  `node scripts/brief.mjs` from the single-source template.
- **Run git from the repo root with repo-relative paths** — the packages/ui cwd drift broke
  four command chains in the prior session.
- Never `nx test`; never trust `nx build`/`nx typecheck` caches; `npm run build` inside
  packages/ui for real builds; `build:api` for derived-artifact regen only.
- Real-browser IVP for anything user-facing: jsdom missed every paint/focus/transition defect
  this cycle (kai-dock's two, the copy-button placement). The dock IVP's static-page harness
  pattern (serve dist/kai.es.js directly) is cheap and effective.
- New rendered prop/slot/part docs: no em dashes (the style guard reads generated meta —
  regen before rerunning it); mirrored prop descriptions must stay word-identical.
- Shared registries (slots.ts + its test allowlist, register-impl.ts, solid.ts) serialize
  through the supervisor; workers hand exact replacement strings.
- The required CI `test` job is the merge gate. Playwright-install step flakes on apt mirrors
  (~4 observed); it now fails fast at 5 min — just rerun `--failed`.

## 4. Banked follow-ups (none scheduled — pick deliberately)

- **Support-widget adopts kai-dock** — the extraction test made real (~110 lines deleted);
  the dock IVP's adoption sketch names the seams. Also note Escape/hide semantics change on
  adoption (recorded in the dock facade's migration notes).
- Coverage punch list: 17 remaining waivers in `tests/elements/element-coverage.test.ts`
  (kai-tool/dialog/code-block closed; kai-menu narrow-coverage note; 15 primitive-only
  elements below their wrappers).
- Candidates A (MCP arg validation — confirmed empirically AGAIN during the rebuild) and
  B (packaging weight) from the ladder spec; the abort `''` class is closed but candidate A
  remains unfixed.
- kai-tool reflects open/disabled but not defaultOpen; kai-dock reflects all three —
  divergence noted in reflected-boolean tests.
- `stripComments` exists in two test files; lift to tests/helpers/ someday.
- Hygiene: `tmp/agent-scratch/` (reddens main-module-guards locally; CI unaffected),
  ~194 stale worktree registrations, `kai-chat`'s ~120px empty-state header spacing
  (cosmetic, dock IVP screenshot evidence).
- Docs voice demo bypasses all three voice elements — rung 2's app becomes the corpus
  pointer; docs reconciliation stays the standing docs pass.

## 5. Provenance policy (owner, standing)

Every ladder app's README carries the prompt(s) that built it — the ENTIRE conversation
verbatim if more than one, plus the generated brief (gitignored otherwise). The implementer
transcribes its own received messages. Rung 2's README must record BOTH phases (front-door
build + insider completion). App code front-door only; plumbing insider.

## 6. Owner interaction points for rung 2

- Live validation at the end (OpenRouter key in the app's .env, two minutes of use).
- Any component-design decision the rung surfaces (rung 1 surfaced kai-dock this way).
- The credential-on-disk disclosure applies again if the clean-room builder runs
  (0600 + trap-delete, disclosed before launch, or an ANTHROPIC_API_KEY instead).
