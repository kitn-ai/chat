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

- [ ] Real build: `npm run build` inside `packages/ui` (never a cached nx verdict).
- [ ] `verify:fresh` green against that build.
- [ ] `npm pack` → the tarball under test.
- [ ] Sandbox OUTSIDE the repo: `<scratchpad>/rung3-cleanroom/` with an app dir and a SIBLING
      ops dir (ops files out of the builder's cwd, as rung 1 established).
- [ ] `npm init` + install the tarball into the app dir.
- [ ] Strip the INSTALLED copy: delete src TS/TSX/CSS keeping the exports-reachable JSON
      (`element-meta.json`, `icon-names.json`); remove README and `llms*`; sweep for stray
      copies of any of them.
- [ ] `.mcp.json` points at the tarball's own bin over stdio — never `npx` against the
      registry.
- [ ] Throwaway `CLAUDE_CONFIG_DIR` (no user memory, no skills, no global CLAUDE.md).
- [ ] Post-strip positive controls: MCP `tools/list` + one `component_reference` over stdio;
      `node -e` resolution probes for the package main, `/elements`, `/state`, `/wire`, and
      `/react` — `/react` is NEW to this rung's probe list, and the builder needs it.
- [ ] Launcher script: cleanup trap for the credential AND the scoped-umask fix — the umask
      change wraps ONLY the credential write, in a subshell; every directory the CLI creates
      must keep its execute bits.
- [ ] Verification of that fix: after a 1-turn dry run, assert the session transcript `.jsonl`
      EXISTS under the throwaway config dir. Rung 2 discovered its loss only after the run.

### 2. Builder task prompt (insider)

- [ ] Author the prompt to the ops dir and record its sha256.
- [ ] The verbatim draft:

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

- [ ] Bias statement, recorded with the prompt: it says mock facilities exist (carried from
      rungs 1–2 — a real consumer might not know that); it names React bindings (a consumer
      who chose React knows this from the package page); it does NOT name any element and does
      NOT hint compose-vs-monolith — which path the builder takes is itself a measurement
      (spec § working method).

### 3. Builder run (clean room, owner's seat)

- [ ] Credential disclosure to the owner BEFORE launch.
- [ ] Launch per the launcher: opus seat, `--setting-sources ""`,
      `--disable-slash-commands`, `--max-turns 200`, allowed tools as rung 2, strict MCP
      config.
- [ ] After exit: confirm the credential was trap-deleted.
- [ ] Confirm the transcript survived; copy it to the ops dir.
- [ ] Record run metadata: turns, wall time, cost, session id, prompt sha256.

### 4. Comparer / analyst (independent agent, read-only on both apps and the kit)

- [ ] Research dir `docs/superpowers/research/2026-08-20-rung-3-front-door/`, mirroring the
      rung-2 layout: `app/` snapshot (excluding node_modules and the lockfile), `NOTES.md`
      verbatim, `builder-run.md` — with the MCP call table built FROM THE TRANSCRIPT this
      time — and `findings.md`.
- [ ] Classify every divergence: teaching gap · builder error · acceptable variation; check
      strip artifacts against the removed README/llms before filing anything as a product gap.
- [ ] Check EVERY pre-named expected finding from the spec § Expected findings — explicitly
      including candidate G's re-measures: original baseline failure #4 (the guessed `scope`
      field) and #5 (`scaffold` emits an unwired second component), first exercisable at this
      rung.
- [ ] Verify the builder's app builds and runs independently (keyless mirror for any probe
      server).
- [ ] Produce the GLUE-CODE INVENTORY: count and categorize every line of app wiring between
      the three elements (state plumbing, event wiring, persistence, identity management,
      hand-rolled affordances like delete). This is the re-cast spec's headline input.

### 5. Insider completion (task-worker, gap-labeled)

- [ ] Land the app in `examples/apps/workspace/` per corpus conventions — mirror
      support-widget/voice-assistant: package.json shape with `workspace:*`, pinned Vite/TS,
      the tsconfig trio, `/api/chat` dev-server middleware with the OpenRouter seam and the
      `ChatRequestBody` preamble rule, `.env.example` with the unprefixed-key comment, and a
      unique port (5178 and 5179 are taken by the existing apps; read their vite.configs, do
      not trust this sentence).
- [ ] `verify:starters` green with the app enrolled in the derived roster.
- [ ] README provenance: all phases verbatim — the builder prompt, any insider briefs, the
      full conversation where more than one prompt was used (standing owner policy).
- [ ] Every insider change is labeled with the teaching gap that made it necessary.
- [ ] Minimal changes only; the builder's composition choices stand — a monolith build is a
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
