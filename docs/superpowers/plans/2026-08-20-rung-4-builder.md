# Plan: rung 4 — the Lovable-style builder

Date: 2026-08-20. Spec of record: `docs/superpowers/specs/2026-08-20-rung-4-builder-design.md`.
Parent: `docs/superpowers/specs/2026-08-18-iteration-ladder-design.md` (rung 4 row).
Branch: `docs/rung-4-builder-spec` off `main` (spec + plan), then `rung-4/app` for the build.

**Goal:** a Lovable-style page builder — chat on the left, generated self-contained web pages
in a live resizable preview/code panel on the right, with version checkpoints — built
front-door-first by a clean-room builder, finished by insiders, verified by a hardened IVP,
landed in the ladder corpus, and mined for the findings that will seed the compile-to-WC
builder spec later.

**Architecture:** front-door-first per the ladder's front-door rule. This is an ORCHESTRATION
plan: phase 1's app code is written by the clean-room builder, not by a plan task. The seam
under measurement is the one nothing composes today: tool call → artifact card → live
split-panel preview (spec § what the inventory corrected). Which mechanism the builder finds
for carrying a generated page in an assistant reply is itself a measurement.

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
- [ ] Sandbox OUTSIDE the repo: `<scratchpad>/rung4-cleanroom/` with an app dir and a SIBLING
      ops dir (ops files out of the builder's cwd, as rung 1 established).
- [ ] `npm init` + install the tarball into the app dir; install `react`/`react-dom` in the
      app dir (the `/react` probe needs them, rung-3 W16).
- [ ] Strip the INSTALLED copy per the rung-3 conditions: delete src TS/TSX/CSS keeping the
      exports-reachable JSON (`element-meta.json`, `icon-names.json`); delete
      `frameworks/*.tsx` raw source; remove README and `llms*`; sweep for stray copies.
- [ ] `.mcp.json` points at the tarball's own bin over stdio — never `npx` against the
      registry.
- [ ] Throwaway `CLAUDE_CONFIG_DIR` (no user memory, no skills, no global CLAUDE.md).
- [ ] Post-strip positive controls: MCP `tools/list` + one `component_reference` (use
      `kai-artifact` — this rung's subject) over stdio; `node -e` resolution probes for the
      package main, `/elements`, `/state`, `/wire`, and `/react`.
- [ ] Launcher script: rung-3's `ops/launch-builder.sh` as the base — credential-write umask
      in a subshell ONLY, cleanup trap, post-run hard assertions (transcript `.jsonl` exists;
      every config-dir directory keeps execute bits). Watch both assertions fail on planted
      defects before trusting them.
- [ ] 1-turn keyless dry run: CLI refuses the turn, transcript still persists, exec bits
      intact. Archive dry-run evidence to the ops dir; reset the config dir to pristine.

### 2. Builder task prompt (insider)

- [ ] Author the prompt to the ops dir and record its sha256.
- [ ] The verbatim draft:

> Build a small web app: an AI page builder. The user chats with an AI assistant in a column
> on the left; when they ask for a web page (for example "make me a landing page for a coffee
> shop"), the assistant produces a complete self-contained HTML page, and the page appears on
> the right in a live preview panel. The panel has a Preview/Code toggle: Preview renders the
> running page, Code shows its source. Asking for changes in the chat ("make the header dark")
> produces a new version of the page; every version is kept as a checkpoint the user can
> restore, and the preview shows the selected version (the latest by default). The preview
> panel is resizable against the chat column and can be maximized. Add a device-width toggle
> (desktop / tablet / mobile) that constrains the previewed page's width. Give the app a slim
> top bar with its name and a non-functional Publish button. Each generated page should also
> appear as a compact card in the conversation itself; selecting a card shows that version in
> the preview panel. React + TypeScript + Vite. Use the `@kitn.ai/ui` package already
> installed in this directory — it ships web components for AI chat UIs and React bindings.
> Its `kai` MCP server is configured for you: use it to learn what the package provides and
> how to use it. Replies should come from a local dev endpoint that streams a mocked
> response; the package ships facilities for mocking — discover them, including how an
> assistant reply can carry a generated page. Do not fetch any remote docs or read the
> package's source on npm/GitHub; work from the MCP and what is installed. When done: the
> app must build (`npm run build`) and run (`npm run dev`), and write NOTES.md recording
> every question you could not answer from the MCP and where you had to guess.

- [ ] Bias statement, recorded with the prompt: it names the product requirements a real
      consumer would state (split shell, preview/code, versions, device toggle, top bar, in-thread page cards) and NO kit
      vocabulary — not kai-artifact, not kai-resizable, not cards, tools, or blob URLs; the
      mock-facilities hint is carried from rungs 1–3; "including how an assistant reply can
      carry a generated page" is a NEW nudge — it asserts the kit has an answer to the
      message→page bridge, which is exactly the undriven seam, so whether the builder can
      FIND that answer is the measurement and the nudge only tells it to look; React bindings
      named as before.

### 3. Builder run (clean room, owner's seat)

- [ ] Credential disclosure to the owner BEFORE launch.
- [ ] Launch per the launcher: opus seat, `--setting-sources ""`, `--disable-slash-commands`,
      `--max-turns 200`, allowed tools per the rung-3 launcher's recorded list
      (Bash/Read/Write/Edit/Glob/Grep/ToolSearch/TodoWrite + the four kai MCP tools;
      WebFetch/WebSearch hard-disallowed), strict MCP config.
- [ ] After exit: confirm the credential was trap-deleted.
- [ ] Confirm the transcript survived; copy it to the ops dir.
- [ ] Record run metadata: turns, wall time, cost, session id, prompt sha256.

### 4. Comparer / analyst (independent agent, read-only on the app and the kit)

- [ ] Research dir `docs/superpowers/research/<run-date>-rung-4-front-door/` (dated on the day
      of the run), mirroring the rung-3 layout: `app/` snapshot (excluding node_modules, the
      lockfile, and dist), `NOTES.md` verbatim, `builder-run.md` with the per-call MCP table
      built from the transcript, and `findings.md`.
- [ ] Classify every divergence: teaching gap · builder error · acceptable variation; check
      strip artifacts against the removed README/llms before filing anything as a product gap.
- [ ] Check EVERY expected finding class from the spec § Expected finding classes: the
      `artifact-split` placeholder / missing message→artifact bridge; the blob-URL +
      `displayUrl` recipe's documentation; whether the card-opens-panel flow
      (`artifact-from-message`) is teachable through the front door; `kai-artifact` under a
      real consumer layout (maximize wiring, device-width container).
- [ ] Also re-check rung-3 residuals now re-exercisable: baseline #5 (the workspace scaffold's
      unwired Artifact+Resizable placeholder, F-16) — does the artifact-split archetype emit
      anything wired this time; and the scaffold block-2 route's missing request guards.
- [ ] Verify the builder's app builds and runs independently (keyless mirror for any probe
      server).
- [ ] Deliverable beyond the classification: the ARTIFACT-SEAM inventory — every line the app
      wrote to bridge assistant reply → previewable page (envelope handling, URL minting,
      version bookkeeping, panel pinning, maximize/device wiring). This is the future
      compile-to-WC builder spec's input, the way rung 3's glue inventory seeded the re-cast.

### 5. Insider completion (task-worker, gap-labeled)

- [ ] Land the app in `examples/apps/builder/` per corpus conventions — mirror the existing
      apps: package.json shape with `workspace:*`, the tsconfig trio, `.env.example` with the
      unprefixed-key comment, and a unique port (5180 is taken by workspace; read every
      vite.config under examples/, do not trust this sentence).
- [ ] The dev-server `/api/chat` route gets the OpenRouter seam beside the builder's mock
      (mock kept verbatim + `X-Kai-Mock`, status passthrough, request-guard trio GET→405 /
      non-JSON→400 / missing-messages→400, disconnect → request.signal), as rung 3 landed.
- [ ] Real mode carries the kit's artifact tool definition (the `schemas` surface's
      model-facing artifact card tool) so a real model can emit the envelope; if the builder's
      mock path invented a different bridge, both stand — the divergence is a finding, labeled.
- [ ] `verify:starters` green with the app enrolled in the derived roster.
- [ ] README provenance: all phases verbatim — the builder prompt, any insider briefs, the
      full conversation where more than one prompt was used (standing owner policy).
- [ ] Every insider change is labeled with the teaching gap that made it necessary.
- [ ] Minimal changes only; the builder's composition choices stand — hand-built preview
      chrome instead of `kai-artifact` would be a HEADLINE finding that feeds the docs and the
      scaffolder, not something to rewrite.

### 6. Hardened IVP (independent verifier, real Chromium, keyless mirror)

Acceptance points from the spec, verbatim, plus the anti-vacuity rules above:

- [ ] Generation flow: submit a page request; an artifact arrives in the thread AND the right
      panel shows it — assert real rendered content INSIDE the preview iframe document
      (frame-scoped locator on generated markup), not just that an iframe exists.
- [ ] Code view: toggling to Code shows the generated source; the file content matches what
      the preview renders.
- [ ] Iteration: a second prompt produces a new version; the preview updates; the checkpoint
      row appears; Restore swaps the preview back to v1's content (assert v1-specific markup
      inside the iframe after restore).
- [ ] The path/URL field never leaks a raw `blob:`/`data:` URL (clean display address).
- [ ] Maximize: maximizing the panel visibly changes geometry (measure bounding boxes);
      restore returns it.
- [ ] Device toggle: mobile constrains the preview container's measured width; desktop
      releases it.
- [ ] Forced endpoint failure mid-generation: a visible, loud error — no silent hang, no
      empty bubble, no stuck spinner.
- [ ] Streaming sampled as strictly-increasing growth on a text reply.
- [ ] Zero uncaught console/page errors across all scenarios (the `[kai-artifact] blocked
      unsafe url` warn is a pass only if a scenario deliberately provokes it; otherwise it
      counts as a failure to investigate).
- [ ] Evidence (scripts run, output, screenshots) under `.superpowers/sdd/2026-08-20-rung-4/`.

### 7. CI + merge + owner validation

- [ ] Commit, open the PR (spec + plan + research + app together, per the rung-3 shape).
- [ ] Watch the ACTUAL run id for the head sha (`gh run watch <id> --exit-status`), never
      `gh pr checks --watch`.
- [ ] Squash-merge on green (CI `test` job is the only gate).
- [ ] Owner live validation BEFORE merge for the UI (standing show-first rule): mock flow,
      plus at least one real OpenRouter turn that generates a page (key in `.env`).
- [ ] Record the validation in the run ledger.

### 8. Findings handoff (deliverable only)

- [ ] Update the ladder memory + write the next handoff: rung 4 outcome, the artifact-seam
      inventory pointer, and the compile-to-WC builder spec as the flagged next candidate,
      carrying rung 4's findings as its stated input. No implementation.

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
