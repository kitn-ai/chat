# Builder run record — the rung-2 front-door build

Run metadata for the clean-room voice-assistant build. Method and residual-bias channels are in
the run plan (`.superpowers/sdd/2026-08-19-rung-2/run-plan.md`) and the spec,
[`docs/superpowers/specs/2026-08-19-rung-2-voice-assistant-design.md`](../../specs/2026-08-19-rung-2-voice-assistant-design.md).

## Run metadata

All values from `builder-run-output.json` (the `claude -p --output-format json` result object)
unless noted.

| | |
|---|---|
| Outcome | success (`"is_error": false`, `"subtype": "success"`, `terminal_reason: completed`) |
| Turns | 89 |
| Wall clock | 878 s (`duration_ms: 877745`; `duration_api_ms: 876167`) |
| Cost | $6.27 (`total_cost_usd: 6.2717…`; $6.2704 on `claude-opus-5`, $0.0013 on a `claude-haiku-4-5` helper call) |
| Model | opus (`claude-opus-5`; matches the rung-1 rebuild seat) |
| Claude Code CLI | 2.1.236 (the local `claude` binary the launch script invoked, read at analysis time — the run itself recorded no CLI version) |
| Task-prompt sha256 | `972f7a63786d20ebdd750d223dc2b53fe67de1215cc6f9e6187548c44ba4fd96` — verified identical for `ops/prompt.md` (as launched) and `.superpowers/sdd/2026-08-19-rung-2/builder-task-prompt.md` (the file of record) |
| Session id | `4cfd10c5-86ae-48bd-a13a-35b48809aa0e` |
| Output tokens | 70,497 (31,571 thinking) |
| Kit under test | `@kitn.ai/ui` 0.25.2, fresh `npm pack` tarball (`ops/kitn.ai-ui-0.25.2.tgz`), README/llms/TS-TSX-CSS source stripped (only JSON manifests remain under `src/`) — verified in the installed copy: `README.md`, `llms.txt`, `llms-full.txt` all absent |
| Web fetches | 0 (`web_search_requests: 0`, `web_fetch_requests: 0`) — the no-remote-docs rule held |
| Permission denials | `[]` |

## THE TRANSCRIPT WAS LOST — read this before trusting anything per-call

**There is no per-message transcript of this run.** The `ops/transcripts/` directory is empty,
and no `4cfd10c5-*.jsonl` exists anywhere on the machine (searched `ops/claude-config/`,
`~/.claude/projects/`, `~/Library/Caches/claude-cli-nodejs/`, and `/private/tmp/claude-501/`).

Root cause, established from the artifacts: `ops/launch-builder.sh` sets `umask 177` (to protect
the extracted OAuth credential) **before** launching `claude`, and never resets it. Every
directory the CLI created during the run therefore came up mode `drw-------` — no execute bit,
untraversable even by its owner. Observed casualties, all found in that state and all empty:

- `$CLAUDE_CONFIG_DIR/projects/` — where the session `.jsonl` would have been written. The CLI
  could not create the per-cwd subdirectory inside it, so the transcript was never persisted.
  The launch script's `cp -R "$CFG/projects/"` then faithfully copied an empty tree.
- `~/Library/Caches/claude-cli-nodejs/<escaped-app-cwd>/` — the MCP log directory. Empty, so
  there is no `kai` server-side call log either.
- The harness's own task directory — this one the builder SAW, as
  `EACCES … mkdir '…/4cfd10c5-…/tasks'`, and it is why **every Bash call in the builder session
  failed**, including `true` (NOTES "Blockers" §1), and why `src/`/`server/` could not be
  populated (§2; both dirs exist in the sandbox, mode `drw-------`, empty).

So the umask is one defect with three faces: it cost the builder its shell, cost the app its
conventional layout, and cost this analysis the transcript. **Harness fix for rung 3:** set
`umask 177` only around the `security …> "$CRED"` extraction, restore it (`umask 022`) before
launching `claude` — or `chmod 600` the credential explicitly and drop the umask entirely.

Consequences for this document, stated plainly:

- **No MCP tool-call sequence table.** Rung 1's per-call table (tool, arguments, result size,
  transcript line) cannot be reproduced. No claim below cites a transcript line, because there
  are none to cite.
- **No watched-pattern counts over MCP *output*.** Rung 1 counted the one-liner classes in the
  raw text each tool returned; that text is gone.
- **Candidate A (`additionalProperties: false` enforcement) is UNVERIFIABLE for this run** —
  whether the builder ever made a wrong-argument-key MCP call is exactly the kind of fact only
  the transcript held. Not exercised as far as any surviving artifact shows; treat as
  no-evidence-either-way, same as rung 1.

## What IS known about the builder's MCP usage (from NOTES.md and the final report — attributed, not transcript-cited)

The builder's NOTES.md quotes tool output and names tools, which pins at minimum:

| Tool | Evidence it was called | Source |
|---|---|---|
| `scaffold` | Quotes the `mock` integration's front-end blurb verbatim ("No backend or API key needed — replies stream locally (see the front-end onSubmit above)") and states its section (2) is empty; knows the scaffold assumes `npm create vite -- --template vanilla-ts` + `src/main.ts` | NOTES §4, Blockers §2 |
| `component_reference` | Per-element facts throughout: `kai-voice-output`'s `::part(button)` vs `kai-voice-input`'s no-parts (§10), `kai-audio-visualizer`'s `bands` doc text (§14/§16), `kai-status`'s presence vocabulary (§19), `kai-notice` props (§18), `recognitionLang` (§11), `kai-audio-captured`'s double description (§8), `kai-speaking-change` "real transitions only" (§12), `kai-thread` `slot="empty"` + `proseSize` (§20/§22) | NOTES §§8–22 |
| `debug` | "returned *'No known failure pattern matched'* and pointed at `node_modules/@kitn.ai/ui/llms-full.txt`" | NOTES §1 |
| `theme` | "had no colour keyword in my description and defaulted to indigo `#6366f1`" | NOTES §24 |

All four tools were exercised. Call counts, ordering, and argument shapes are unrecoverable.

## Watched-pattern coverage in the DELIVERED APP (substitute measurement)

With the MCP output gone, the surviving measurable surface is the app itself. Counts over
`app/` (this snapshot):

| Pattern | Count | Where / note |
|---|---|---|
| `import '@kitn.ai/ui/elements'` | 1 (+1 type-only) | `main.ts:16`, first import, with the "must come first" comment — the rung-1 class-1 lesson held |
| Typed element interfaces (`Kai*Element` from `/elements`) | 6 | `main.ts:20-27` — no hand-rolled structural types anywhere (class-2 held) |
| `customElements.whenDefined` | 1 | `main.ts:92-101`, awaited for all six tags before any property set |
| `readOpenAIStream` / `toOpenAIMessages` | 2 / 1 use | `main.ts:292` / `main.ts:288` — no hand-rolled SSE reader (`kit-parses-consumer-fetches` held) |
| `createAssistantStream` / `textMessage` / `appendMessage` | 1 each | `main.ts:281`, `main.ts:272` |
| `createMockResponder` | 1 use | `mock-chat.ts:73`, server-side with options `{ replies, delayMs: 28, chunkSize: 1 }` |
| `@kitn.ai/ui/theme.tokens.css` | 1 | `main.ts:17` — tokens.css, not raw `theme.css` (the documented trap held; NOTES §25 records the MCP was explicit) |
| Event payloads typed via `detail` | all listeners | `main.ts:63-65` generic helper; listeners on the element itself with a "kai-* events do not bubble" comment |

## Reads into `node_modules/@kitn.ai/ui` beyond `package.json`

From NOTES.md (the transcript audit rung 1 did is impossible here):

| What it read | Why | NOTES item |
|---|---|---|
| `dist/state/mock.d.ts` | `createMockResponder` signature + `MockResponderOptions` (`replies`, `delayMs`, `chunkSize`, `announce`) — the MCP names the function but never gives parameters | §1 |
| `dist/state.js` | Confirmed each yield is a complete `data: {…}\n\n` SSE frame ending in `data: [DONE]`, and that the module has zero imports (Node-safe) | §2, §3 |
| `dist/wire/chunk.d.ts` | `ConsumeOptions` has no `signal` — cancellation must go through aborting the fetch | §6 |
| `dist/state` d.ts (messages) | `textMessage(role, text, init?)` — `@kitn.ai/ui/state` helpers are undocumented in the MCP | §21 |

Discovery direction matches rung 1: `dist/` reads were used for facts **the MCP does not carry**
(the state/wire lifecycle hole named in rung-1 findings §3 "fifth class"), not to bypass facts
the MCP supplies.

## Build and run — verified by the comparer (the builder could not run anything)

The builder shipped the app with the build honestly declared unverified (NOTES "Blockers").
Comparer ran it in the sandbox, 2026-08-19:

| Step | Command | Result |
|---|---|---|
| Install | `npm install` | clean, 0 vulnerabilities; resolved **Vite 6.4.3 / TypeScript 5.9.3** (the builder pinned `^6` / `^5.5` to match the kit's own devDeps — NOTES §23) |
| Build | `npm run build` (= `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json && vite build`) | **exit 0** — both strict tsc passes green, `vite build` green (`✓ built in 1.04s`; a >500 kB chunk warning for the register-all bundle, non-fatal) |
| Dev | `npm run dev` + curl | `GET /` → 200; `POST /api/chat` streams the mock's self-identifying SSE (`: kai-mock — NO PROVIDER WAS CONTACTED` banner, `data: {"_kai_mock":…}` frames) |
| Preview | `npm run preview` + curl | `GET /` → 200; `POST /api/chat` → 90 `data:` frames — the `configurePreviewServer` mount works as claimed |

**Verdict: the app builds and runs, first try, zero fixes.** The builder's only unverified
claims were the ones its environment blocked, and every one of them checked out green.
