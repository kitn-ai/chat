# Plan: rung 3 — the workspace

Date: 2026-08-20. Spec of record: `docs/superpowers/specs/2026-08-20-rung-3-workspace-design.md`.
Parent: `docs/superpowers/specs/2026-08-18-iteration-ladder-design.md` (rung 3 row).
Branch: `rung-3/spec` off `main`.

**Goal:** a multi-conversation chat workspace — sidebar, thread switching, streamed replies,
client-side persistence, delete — built front-door-first by a clean-room builder, finished by
insiders, verified by a hardened IVP, landed in the ladder corpus, and mined for the glue-code
inventory that seeds the workspace re-cast spec.

**Architecture:** front-door-first per the ladder's front-door rule; compose-from-parts per the
spec's owner ruling (`kai-conversations` + `kai-thread` + `kai-prompt-input` wired by the app,
never the `kai-workspace` monolith — though the builder is free to choose, and its choice is a
measurement). This is an ORCHESTRATION plan: phase 1's app code is written by the clean-room
builder, not by a plan task.

**Tech stack:** Vite + React + `@kitn.ai/ui/react` + the kai MCP (tarball bin over stdio).

## Global constraints (verbatim rules, binding on every dispatch)

- Run git from the repo root only.
- Writer-lock claims per dispatch (`scripts/writer-lock.mjs`); briefs generated via
  `scripts/brief.mjs`, never retyped.
- Never `nx test`; never trust nx caches; real builds are `npm run build` inside `packages/ui`.
- `verify:fresh` gates the build that gets packed.
- The builder runs on the owner's subscription seat with the credential-on-disk protocol,
  disclosed to the owner before launch.
- umask hardening is scoped to the credential extraction ONLY (rung-2 lesson, recorded in the
  rung-1 plan's amendments: a global `umask 177` destroyed the transcript, the MCP logs, and
  the builder's own Bash tool mid-run).
- Keyless probing uses a mirrored app dir excluding `.env*` — Vite's `loadEnv(mode, root, '')`
  ignores `envDir`.
- README provenance carries all phases verbatim.
- The CI `test` job is the only merge gate.
- IVP anti-vacuity rules: geometry/visible-DOM over state strings; probes must be RUN, not
  spec'd; stub durations must not coincide with app constants; include failure-path scenarios.

## Tasks

### 1. Harness rebuild (insider)

- [x] Real build: `npm run build` inside `packages/ui` (never a cached nx verdict).
- [x] `verify:fresh` green against that build.
- [x] `npm pack` → the tarball under test.
- [x] Sandbox OUTSIDE the repo: `<scratchpad>/rung3-cleanroom/` with an app dir and a SIBLING
      ops dir (ops files out of the builder's cwd, as rung 1 established).
- [x] `npm init` + install the tarball into the app dir.
- [x] Strip the INSTALLED copy: delete src TS/TSX/CSS keeping the exports-reachable JSON
      (`element-meta.json`, `icon-names.json`); remove README and `llms*`; sweep for stray
      copies of any of them.
- [x] `.mcp.json` points at the tarball's own bin over stdio — never `npx` against the
      registry.
- [x] Throwaway `CLAUDE_CONFIG_DIR` (no user memory, no skills, no global CLAUDE.md).
- [x] Post-strip positive controls: MCP `tools/list` + one `component_reference` over stdio;
      `node -e` resolution probes for the package main, `/elements`, `/state`, `/wire`, and
      `/react` — `/react` is NEW to this rung's probe list, and the builder needs it.
- [x] Launcher script: cleanup trap for the credential AND the scoped-umask fix — the umask
      change wraps ONLY the credential write, in a subshell; every directory the CLI creates
      must keep its execute bits.
- [x] Verification of that fix: after a 1-turn dry run, assert the session transcript `.jsonl`
      EXISTS under the throwaway config dir. Rung 2 discovered its loss only after the run.

### 2. Builder task prompt (insider)

- [x] Author the prompt to the ops dir and record its sha256.
- [x] The verbatim draft:

> Build a small web app: a chat workspace where one person keeps multiple conversations with
> an AI assistant. Requirements: a sidebar listing the user's conversations; starting a new
> conversation; switching between conversations, with each thread's earlier messages intact
> when you return to it; deleting a conversation; searching/filtering the conversation list;
> the sidebar can collapse. Messages stream in incrementally as the assistant replies.
> Conversations persist across a page reload, entirely client-side; continuing an old
> conversation after reload must work, with the assistant seeing its full history. React +
> TypeScript + Vite. Use the `@kitn.ai/ui` package already installed in this directory — it
> ships web components for AI chat UIs and React bindings. Its `kai` MCP server is configured
> for you: use it to learn what the package provides and how to use it. Replies should come
> from a local dev endpoint that streams a mocked response; the package ships facilities for
> mocking — discover them. Do not fetch any remote docs or read the package's source on
> npm/GitHub; work from the MCP and what is installed. When done: the app must build
> (`npm run build`) and run (`npm run dev`), and write NOTES.md recording every question you
> could not answer from the MCP and where you had to guess.

- [x] Bias statement, recorded with the prompt: it says mock facilities exist (carried from
      rungs 1–2 — a real consumer might not know that); it names React bindings (a consumer
      who chose React knows this from the package page); it does NOT name any element and does
      NOT hint compose-vs-monolith — which path the builder takes is itself a measurement
      (spec § working method).

### 3. Builder run (clean room, owner's seat)

- [x] Credential disclosure to the owner BEFORE launch.
- [x] Launch per the launcher: opus seat, `--setting-sources ""`,
      `--disable-slash-commands`, `--max-turns 200`, allowed tools as rung 2, strict MCP
      config.
- [x] After exit: confirm the credential was trap-deleted.
- [x] Confirm the transcript survived; copy it to the ops dir.
- [x] Record run metadata: turns, wall time, cost, session id, prompt sha256.

### 4. Comparer / analyst (independent agent, read-only on both apps and the kit)

- [x] Research dir `docs/superpowers/research/2026-08-20-rung-3-front-door/`, mirroring the
      rung-2 layout: `app/` snapshot (excluding node_modules and the lockfile), `NOTES.md`
      verbatim, `builder-run.md` — with the MCP call table built FROM THE TRANSCRIPT this
      time — and `findings.md`.
- [x] Classify every divergence: teaching gap · builder error · acceptable variation; check
      strip artifacts against the removed README/llms before filing anything as a product gap.
- [x] Check EVERY pre-named expected finding from the spec § Expected findings — explicitly
      including candidate G's re-measures: original baseline failure #4 (the guessed `scope`
      field) and #5 (`scaffold` emits an unwired second component), first exercisable at this
      rung.
- [x] Verify the builder's app builds and runs independently (keyless mirror for any probe
      server).
- [x] Produce the GLUE-CODE INVENTORY: count and categorize every line of app wiring between
      the three elements (state plumbing, event wiring, persistence, identity management,
      hand-rolled affordances like delete). This is the re-cast spec's headline input.

### 5. Insider completion (task-worker, gap-labeled)

- [x] Land the app in `examples/apps/workspace/` per corpus conventions — mirror
      support-widget/voice-assistant: package.json shape with `workspace:*`, pinned Vite/TS,
      the tsconfig trio, `/api/chat` dev-server middleware with the OpenRouter seam and the
      `ChatRequestBody` preamble rule, `.env.example` with the unprefixed-key comment, and a
      unique port (5178 and 5179 are taken by the existing apps; read their vite.configs, do
      not trust this sentence).
- [x] `verify:starters` green with the app enrolled in the derived roster.
- [x] README provenance: all phases verbatim — the builder prompt, any insider briefs, the
      full conversation where more than one prompt was used (standing owner policy).
- [x] Every insider change is labeled with the teaching gap that made it necessary.
- [x] Minimal changes only; the builder's composition choices stand — a monolith build is a
      finding that feeds the re-cast spec, not something to rewrite (spec § risks).

### 6. Hardened IVP (independent verifier, real Chromium, keyless mirror)

Acceptance points from the spec, verbatim, plus the anti-vacuity rules above:

- [ ] Multi-thread integrity: switch away and back — byte-identical thread content.
- [ ] Reload persistence: a REAL page reload; threads survive.
- [ ] Rehydrated-thread continuation: reload THEN continue an old thread; intercept the
      outgoing `/api/chat` request and diff its body against the stored thread — the full
      rehydrated history must be present, re-encoded.
- [ ] Delete works, and stays deleted after reload.
- [ ] G-16 forced endpoint failure: kill or 500 the endpoint mid-turn; a visible, loud error —
      no silent hang, no empty bubble.
- [ ] Streaming sampled as strictly-increasing growth.
- [ ] Zero uncaught console/page errors across all scenarios.
- [ ] Evidence (scripts run, output, screenshots) under the sdd workspace
      `.superpowers/sdd/2026-08-20-rung-3/`.

### 7. CI + merge + owner validation

- [ ] Commit, open the PR.
- [ ] Watch the ACTUAL run id for the head sha (`gh run watch <id>`), never
      `gh pr checks --watch` — it exited stale twice in rung 2.
- [ ] Squash-merge on green (CI `test` job is the only gate).
- [ ] Owner live validation: mock, plus at least one real OpenRouter turn (key in `.env`).
- [ ] Record the validation in the run ledger.

### 8. Re-cast spec draft (deliverable only)

- [ ] From the glue-code inventory + findings: draft
      `docs/superpowers/specs/2026-08-2X-workspace-recast-design.md` (dated on the day it is
      written) proposing `kai-workspace` / `kai-conversations` as presets over composables,
      per the composition-first RFC. What the preset encapsulates = exactly the glue the app
      wrote; what the parts need = the gaps the app hit (e.g. delete).
- [ ] Ends at owner review. No implementation.

## Verification

Per guard #1: any measurement against built artifacts runs `verify:fresh` first. The merge
gate is CI's required `test` job.

<!-- gate-list: partial -- local spot-checks; the required test job is the gate -->
```bash
pnpm --filter @kitn.ai/ui run verify:starters
pnpm --filter @kitn.ai/ui run lint:thresholds
```

## Run ledger

(Appended during execution — task outcomes, fix rounds, run metadata, owner validation.)

- 2026-08-20 (W16): Tasks 1-2 complete. Real build + verify:fresh green (kai.es.js sha256
  5d7a45c2…, custom-elements.json 47867a01…); tarball `kitn.ai-ui-0.25.2.tgz` sha256
  7bf493fe… packed to the rung3-cleanroom sandbox (outside the repo; app + sibling ops dirs).
  Strip done per rung-1 conditions, PLUS `frameworks/*.tsx` (raw shipped source rung 2 kept;
  `./react` resolves to `dist/react.js` only, so nothing broke — /react probe green
  post-strip). All 5 resolution probes green (`/react` needed `react`+`react-dom` installed
  in the app dir — recorded; a React builder would have them). MCP stdio positive controls
  green post-strip (tools/list = 4 tools; component_reference kai-conversations 200+ chars of
  real reference). OBSERVED CHANGE vs rung 2: candidate A no longer reproduces — a wrong
  argument key (`element`) now returns a loud "unknown argument — did you mean name?" error
  instead of the silent 80-element index. Launcher `ops/launch-builder.sh`: umask 177 scoped
  to a credential-write subshell ONLY; cleanup trap; post-run hard assertions (transcript
  .jsonl exists + every config-dir directory keeps execute bits — both watched RED on planted
  defects first; the first draft's exec-bit check was itself unfireable under pipefail via
  grep -q/SIGPIPE and was fixed). 1-turn dry run WITHOUT credential: CLI refused the turn
  ("Not logged in", exit 1, $0.00, no keychain fallback — CLAUDE_CONFIG_DIR isolation held)
  but STILL persisted the session transcript .jsonl (6,192 bytes of real records) with all
  directory execute bits intact — direct evidence the rung-2 loss is fixed. Dry-run artifacts
  archived to ops/dry-run-evidence/; throwaway config dir reset to pristine for the real
  launch. Task-2 prompt authored verbatim to ops/prompt.md, sha256 566133636cf00d91714974f4a1
  27f24ab073f2e132269a71ed13c7b96678a84a; bias statement in ops/prompt-bias.md. GAP for the
  supervisor: rung-2's exact allowed-tools list was never recorded (its launcher died with the
  scratchpad); the launcher carries a reconstruction from rung-1 transcript evidence
  (Bash/Read/Write/Edit/Glob/Grep/ToolSearch/TodoWrite + the four kai MCP tools;
  WebFetch/WebSearch hard-disallowed) — review before launch. Full report:
  `.superpowers/sdd/2026-08-20-rung-3/w16-report.md`.
- 2026-08-20 (W17): Task 4 complete. Research dir
  `docs/superpowers/research/2026-08-20-rung-3-front-door/` landed (app/ snapshot minus
  node_modules/lockfile/dist, NOTES.md verbatim, builder-run.md, findings.md). Run metadata:
  98 turns, 1,210 s, $8.12, opus, session d0cf3c07…, prompt sha 56613363… verified; transcript
  431 lines / 97 tool calls — THE FIRST RUNG WITH A FULL TRANSCRIPT, so the MCP table is
  per-call with line cites: 8 kai calls (list · kai-chat · kai-conversations · scaffold
  workspace×mock×full-page×react · recipes · debug[delete] · kai-workspace · kai-button),
  zero MCP errors (candidate A unexercisable, as W16 predicted). Comparer verdicts:
  (a) builds + runs independently, zero fixes, keyless by construction (no env reads, no
  .env); (b) COMPOSITION = the middle path — kai-conversations + kai-chat via the React
  wrappers, rail as SIBLING, after pulling and rejecting kai-workspace on a verified fact
  (its kai-search is the composer Globe, not conversation search) and never querying
  kai-thread/kai-prompt-input; (c) G-04/#298: the mock backend route came FROM THE SCAFFOLD
  (block 2 adopted near-verbatim, transcript 27/28+167) — first front-door proof, one
  residual: run note omits @types/node and the first build FAILED on it (F-08); (d) candidate
  G #4 PARTIALLY FIXED (scope typed in the reference, meaning still stated nowhere — builder
  guessed {type:'collection'}), #5 REPRODUCED (scaffold emitted an unwired placeholder
  Artifact+Resizable AND omitted kai-conversations — the workspace archetype disagrees with
  the workspace-chat recipe's ingredient list, F-16); (e) delete gap confirmed as spec'd and
  the hand-roll is a FEATURE REDUCTION (active-conversation-only delete, toast+Undo, F-01
  S2). Gap counts: 4 product (1 S2) · 4 teaching · 8 doc · 1 builder error (NOTES §5
  misattributes — ButtonProps.label IS documented in the shipped d.ts) · 4 acceptable
  variations · 1 strip artifact · 0 kit defects. GLUE-CODE INVENTORY headline: 342 authored
  TS/TSX code lines, ~300 of them glue between TWO elements — persistence 106, projection 61,
  send/stream 52, identity ~34, hand-rolled delete ~27, sidebar plumbing ~14, theme sync ~10,
  no-match search ~6 — plus 59 CSS lines because no documented arrangement satisfies
  search+collapse (F-02: slot⇒dead gutter, monolith⇒no search, sibling⇒undocumented).
  Full report: `.superpowers/sdd/2026-08-20-rung-3/w17-report.md`.
- 2026-08-20 (W18): Task 5 complete. App landed at `examples/apps/workspace/` (port 5180 —
  5173–5179 all taken across examples/, read from the vite.configs). Builder code kept
  verbatim: all of src/, index.html, the tsconfig trio, AND the toolchain pins (vite ^7.3.6 /
  TS ~5.9 / @types/node ^26 — F-19 deliberate choice, and tsconfig.app.json's
  `erasableSyntaxOnly` needs TS ≥5.8, so pins and tsconfigs stand together; a decision the
  plan's "pinned Vite/TS" line did not settle, recorded here). react/react-dom real deps
  (W16 harness condition); @types/node confirmed present (F-08 residual). Insider changes,
  gap-labeled in the app README (8 items): corpus package.json identity; port; the G-16
  request-guard trio the builder's scaffold-derived route lacked (GET→405 verified,
  non-JSON→400, empty/missing messages→400 — the scaffold's block-2 route ships guardless,
  banked beside F-08/F-16); the OpenRouter seam (mock kept verbatim + X-Kai-Mock, status
  passthrough, in-band mid-stream error); bridge env read + real-method forwarding (without
  it the 405 is unreachable) + disconnect propagation into request.signal (F-07's
  server-side half); .env.example + .gitignore; enrollment (pnpm-workspace.yaml,
  examples/README.md row, lockfile via pnpm install); README provenance (all phases
  verbatim, lint-cdn-pins historical waiver on the 0.25.2 run record). Verified:
  verify:starters 11 of 11 with roster line `✓ examples/apps/workspace [linked] — npm run
  build in 4s`; app `npm run build` exit 0 and `typecheck` exit 0; keyless dev smoke on
  :5180 — mock SSE with `: kai-mock` banner + `X-Kai-Mock: 1`, trio 405/400/400 (+400 on
  missing `messages`); lint:cdn-pins (self-test + release-wiring + plain) and
  lint:thresholds green. Full report: `.superpowers/sdd/2026-08-20-rung-3/w18-report.md`.
- Task 3 (supervisor): disclosure restated in-session before launch; run succeeded
  (98 turns, 1,210,309 ms, session d0cf3c07-b36b-4749-b7c8-0d8593107d85, prompt sha
  566133636cf00d91714974f4a127f24ab073f2e132269a71ed13c7b96678a84a); credential
  trap-delete confirmed by the launcher's own post-cleanup assertion; the transcript
  SURVIVED (431 lines) — the scoped-umask repair held; subscription accounting ~$8.12.
