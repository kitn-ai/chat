# Voice assistant

Rung 2 of the iteration ladder: a hands-free voice assistant, full page. Hold
**Space** (or the on-screen button) and ask a question out loud; the browser's
own speech recognition turns it into text, the reply streams into a
`<kai-thread>` token by token, and the browser's own speech synthesis reads it
back. `<kai-audio-visualizer>` runs the whole session's state cycle — real
microphone amplitude while listening, synthetic bands while speaking. Vanilla
TypeScript and Vite, no framework.

No audio ever leaves the browser: recognition and synthesis are both the
platform's, and the only thing on the wire is text.

Spec of record:
[`docs/superpowers/specs/2026-08-19-rung-2-voice-assistant-design.md`](../../../docs/superpowers/specs/2026-08-19-rung-2-voice-assistant-design.md).

## Run it

The kit resolves through `workspace:*`, so build it first:

```bash
pnpm install          # from the repo root
pnpm exec nx build ui
pnpm --filter @kitn.ai/ui-app-voice-assistant dev
```

Then open <http://localhost:5179> in Chrome, Edge or Safari (Firefox has no
native speech recognition — the page says so loudly rather than failing silently)
and hold **Space**.

### Mock mode (the default)

With no key set, `POST /api/chat` streams frames from `createMockResponder()` in
`@kitn.ai/ui/state`. They are canned, they are OpenAI-shaped, and they are
impossible to mistake for a model: the stream opens with a `: kai-mock` comment,
every frame carries `_kai_mock`, and `model` reports as `kai-mock`. The response
also carries an `X-Kai-Mock: 1` header for whoever is reading a curl. The canned
replies are deliberately plain prose, because they are read aloud and a speech
synthesiser pronounces markdown punctuation literally.

### Real mode

```bash
cp .env.example .env.local   # paste an OpenRouter key, restart the dev server
```

The key is **unprefixed** (`OPENROUTER_API_KEY`, never `VITE_…`): Vite only
inlines `VITE_`-prefixed vars into client code, so an unprefixed name cannot
reach the browser bundle. It is read inside `server/chat-api.ts` and nowhere
else. The model defaults to `anthropic/claude-haiku-4.5`, configurable with
`OPENROUTER_MODEL`. The key only ever pays for the text turn — speech stays
browser-native in both modes.

**The browser code does not change between the two modes.** Same `fetch`, same
`readOpenAIStream`. The path the mock exercises is the path that ships.

## How the turn works

`src/main.ts` is the host that wires one element to the next:

1. `kai-transcription` fires on `<kai-voice-input>` (non-bubbling — the listener
   is on the element itself) with the final transcript on `event.detail.text`.
2. The user turn is appended, then the thread is encoded with `toOpenAIMessages`
   from `@kitn.ai/ui/wire` — before the assistant placeholder exists.
3. `POST /api/chat`, and the response goes straight into `readOpenAIStream` with
   an `AssistantStream` from `@kitn.ai/ui/state` as the sink. No hand-rolled SSE
   reader; the kit ships the parser.
4. Every fold assigns a **new array** with a **new object** for the changed
   message, which is what re-renders `<kai-thread>`.
5. When the turn settles, the reply text goes to `<kai-voice-output>` and is
   spoken. A 2.5 s watchdog catches the case where synthesis silently never
   starts (see the findings pointer below — the kit currently has no failure
   signal for that).

## Not production

`server/chat-api.ts` is a Vite plugin middleware. Unlike the support widget's
dev-only plugin, it also mounts on `vite preview`, so `npm run build` +
`npm run preview` is runnable end-to-end — but the static `dist/` itself still
has no `/api/chat`. Shipping this means writing the same endpoint on your own
host; the kit's `kai` MCP scaffolder emits one per framework
(`npx @kitn.ai/ui mcp`).

## How this app was built

This app is the ladder's **first front-door build**: the application code was
written by a clean-room builder agent (Claude Opus, 89 turns) that had never
<!-- lint-cdn-pins: historical -- records the exact kit version the clean-room builder was handed; a release bump must not rewrite this run record -->
seen this repository. It worked from a packed-and-stripped `@kitn.ai/ui@0.25.2`
tarball (README, llms files and TS/TSX/CSS source removed) plus the kit's own
`kai` MCP server over stdio — and nothing else: no repo access, no web fetches
(0, verified), no docs. The app it delivered built and ran **first try, zero
fixes**. A harness defect (a stray `umask 177` in the launch script) cost the
run its shell, so the builder could never execute its own build, and cost the
analysis the per-message transcript; every behavioral claim about the run is
therefore attributed to the builder's NOTES.md or the delivered source. The full
run record, the builder's notes, the delivered snapshot, and the graded gap list
live in
[`docs/superpowers/research/2026-08-19-rung-2-front-door/`](../../../docs/superpowers/research/2026-08-19-rung-2-front-door/).

An insider then finished the distance — corpus integration, the OpenRouter path,
and nothing else. A later live-validation round (the owner driving the app by
voice) root-caused three defects and a second insider applied the app-layer
fixes. Per the standing provenance policy, every phase's complete instruction
stream follows verbatim, then the named list of every change made to the
builder's code.

### Phase 1 — the front-door build (the builder's entire task prompt, verbatim)

The one and only prompt the clean-room builder received
(`.superpowers/sdd/2026-08-19-rung-2/builder-task-prompt.md`, sha256
`972f7a63786d20ebdd750d223dc2b53fe67de1215cc6f9e6187548c44ba4fd96`, verified
identical to the file launched):

````text
Build a small web app: a hands-free voice assistant, full page. Requirements: the user asks a question by SPEAKING into the microphone (push-to-talk is fine); the app shows what it heard as text; the question is answered by a chat model and the reply STREAMS in incrementally as text; when the reply has settled the app SPEAKS it aloud. Speech recognition and speech output must be browser-native — no cloud speech services, no audio sent to any server. While the user is speaking, show a live visualization driven by the REAL microphone amplitude; across the whole session the UI must visibly distinguish idle / listening / thinking / speaking. A visible transcript of the conversation persists across multiple turns, and earlier turns stay intact. If the browser does not support native speech recognition or synthesis, the app must say so visibly on the page — never fail silently. Vanilla TypeScript + Vite, no framework. Use the `@kitn.ai/ui` package already installed in this directory — it ships web components for AI chat and voice UIs. Its `kai` MCP server is configured for you: use it to learn what the package provides and how to use it. Replies should come from a local dev endpoint that streams a mocked response; the package ships facilities for mocking — discover them. Do not fetch any remote docs or read the package's source on npm/GitHub; work from the MCP and what is installed. When done: the app must build (`npm run build`) and run (`npm run dev`), and write NOTES.md recording every question you could not answer from the MCP and where you had to guess.
````

### Phase 2 — the insider completion (this conversation, verbatim)

The insider agent (Claude Fable worker W3, dispatched by a supervisor session)
received the following brief and dispatch message, reproduced unedited.

The generated brief (`.superpowers/sdd/2026-08-19-rung-2/w3-insider-brief.md`,
gitignored):

````markdown
## Standing constraints (all roles)

- No `git checkout` / `git reset` / `git stash` — ever. Restore by file copy if needed.
- Never rebuild the package (`nx build ui`) unless the brief explicitly says so.
- No subagents.
- Watch every new check FAIL before trusting it (plant the defect, see the red for the right reason, then the green).
- Never run `nx test` — the NX cache has returned wrong verdicts in both directions.
- Edit only the files this brief assigns. If the work needs another file, stop and report.
- Commits are the supervisor's; never touch the git index.
- Look it up before you assert it: no claim about the tree goes in a report unread. (Not mechanizable — stated so it is not mistaken for covered.)

## Implementer brief

TASK: Insider completion for rung 2: land the front-door-built voice assistant in the corpus. Source of truth: the app snapshot at docs/superpowers/research/2026-08-19-rung-2-front-door/app/ (12 files; W2 verified it builds and runs green). Steps: (1) Create examples/apps/voice-assistant/ from that snapshot, adapted to the corpus conventions — mirror examples/apps/support-widget/ exactly for: package.json shape (deps on @kitn.ai/ui via the workspace/published convention support-widget uses, pinned Vite/TS majors matching it), tsconfig, scripts, .env handling for the optional OpenRouter path (rung-1's /api/chat middleware pattern: mock frames with no key, OpenRouter proxy with one — copy support-widget's pattern; the builder's mock-chat.ts already implements the mock side). (2) Confirm auto-enrollment in verify:starters' derived roster (read packages/ui/scripts/verify-starters.mjs to learn what the roster derives from) and run pnpm --filter @kitn.ai/ui run verify:starters — must pass with the new app enrolled; watch it actually include voice-assistant in its output. (3) README.md for the app, per the provenance policy (docs/superpowers/HANDOFF-2026-08-19-rung-2.md §5): records BOTH phases — phase 1 the front-door build: the ENTIRE builder task prompt verbatim from .superpowers/sdd/2026-08-19-rung-2/builder-task-prompt.md + run facts (clean-room, opus, 89 turns, kai MCP + stripped tarball only, transcript lost to a harness umask bug — link the research dir); phase 2 the insider completion: this brief verbatim (transcribe your own received brief), plus a named list of every change you make to the builder's code, each labeled with the teaching gap it closes (cross-reference findings.md gap IDs where they exist). (4) Update examples/README.md's corpus list the way support-widget is listed. (5) Keep insider changes MINIMAL — the builder's composition choices stand (kai-thread, the watchdog, etc.); change only what corpus integration, the OpenRouter path, and correctness require. Do not fix kit-level product gaps (audio tap, isSupported) — those are banked findings, not this task.

FILES: examples/apps/voice-assistant/** (new), examples/README.md

CO-WRITERS: none

VERIFY: verify:starters output pasted showing voice-assistant enrolled and green; npm run build exit 0 inside the app; every insider change listed and gap-labeled in the README

Report back exactly:

```
DONE:
FILES:
VERIFY:
SELF-CHECK:
GAPS:
NEEDS-REGEN:
BLOCKERS:
```
````

The supervisor's dispatch message:

````text
You are W3, a pooled implementation worker on the kitn-chat repo (/Users/home/Projects/kitn-ai/kitn-chat, branch rung-2/voice-assistant). Your brief is at /Users/home/Projects/kitn-ai/kitn-chat/.superpowers/sdd/2026-08-19-rung-2/w3-insider-brief.md — read it FIRST and follow it exactly, including the standing constraints.

Read before coding: docs/superpowers/research/2026-08-19-rung-2-front-door/findings.md (gap IDs you'll cite), the app snapshot beside it, examples/apps/support-widget/ (the corpus conventions you mirror), and packages/ui/scripts/verify-starters.mjs (roster derivation).

Run git only from the repo root; never touch the git index. The kit is already built (packages/ui/dist is fresh from this session) — do NOT rebuild it.

When done: write your report to .superpowers/sdd/2026-08-19-rung-2/w3-insider-report.md and return a summary: files created, every insider change + its gap label, verify:starters verdict with the roster line showing voice-assistant, and anything you had to decide that the brief didn't cover.
````

The supervisor's follow-up message (CI: lint:cdn-pins), after the insider
report. Note: the fix applied deviates from the fix this message instructs —
see change 10 below for what was done and why.

````text
Follow-up small task (writer-lock claimed for you on both files; same standing constraints as your brief). CI's required test job failed on lint:cdn-pins for your new README:

examples/apps/voice-assistant/README.md:88 holds a live `@0.25.2` pin with two defects per the guard output: (1) the file is not in release-please-config.json `packages["packages/ui"].extra-files` — add "/examples/apps/voice-assistant/README.md" there (match the existing entries' formatting exactly); (2) the pin line has no release-please annotation — wrap it with x-release-please-start-version / x-release-please-end HTML comments, copying exactly how support-widget's README (or another already-passing markdown file with a live pin) does it. Look at a passing precedent first rather than inventing formatting.

Then run from repo root: pnpm --filter @kitn.ai/ui run lint:cdn-pins (all three phases: --self-test, --check-release-wiring, plain) and paste the green output. Also update the provenance note if your README's phase-2 change list enumerates files touched (this fix is part of phase 2 — per the policy, append this message verbatim to the README's phase-2 transcript section, since you flagged that requirement yourself). Do NOT commit; report back with the diff summary and the lint output.

Address this before completing your current task.
````

### Phase 3 — the live-validation fixes (this conversation, verbatim)

The owner drove the app by voice and hit three defects the earlier scripted IVP
had passed 9/9 over (its pass was vacuous — see changes 11–13 and the findings
addendum). A debug worker (W4) root-caused them live in headed Chromium; a fix
worker (Claude Fable worker W5) then received the following brief and dispatch
message, reproduced unedited.

The generated brief (`.superpowers/sdd/2026-08-19-rung-2/w5-livefix-brief.md`,
gitignored):

````markdown
## Standing constraints (all roles)

- No `git checkout` / `git reset` / `git stash` — ever. Restore by file copy if needed.
- Never rebuild the package (`nx build ui`) unless the brief explicitly says so.
- No subagents.
- Watch every new check FAIL before trusting it (plant the defect, see the red for the right reason, then the green).
- Never run `nx test` — the NX cache has returned wrong verdicts in both directions.
- Edit only the files this brief assigns. If the work needs another file, stop and report.
- Commits are the supervisor's; never touch the git index.
- Look it up before you assert it: no claim about the tree goes in a report unread. (Not mechanizable — stated so it is not mistaken for covered.)

## Implementer brief

TASK: Apply the APP-LAYER fixes for the three live-validation defects root-caused in W4's report (read it in full first: it is embedded in the supervisor's ledger context; the raw evidence is under .superpowers/sdd/2026-08-19-rung-2/live-debug/ — read the report text pasted at .superpowers/sdd/2026-08-19-rung-2/w4-findings.md). Fixes, app layer ONLY (no kit/packages/ui edits): (1) Watchdog race (W4 symptom 3): in src/main.ts, arm the no-speech watchdog BEFORE calling speak(), and clear it on any kai-speaking-change speaking:true that arrives after arming; the false 'never started speaking' error on replies >2.5s must be gone. (2) Mic-open timeout (W4 symptom 1 contributor): wrap the visualizer's openMic()/getUserMedia in a timeout (~5s) so a permission prompt left pending surfaces a visible notice instead of hanging forever. (3) No-result surface (W4 symptom 1 app mitigation): the kit emits no error event, so add the honest app-side heuristic — when kai-recording-change goes false and no kai-transcription (final) arrives within ~600ms, show the existing 'Nothing was recognised — try again' notice (currently dead code); make it fire for real. Add a comment naming the kit gap (no error event on kai-voice-input) so the workaround's reason is recorded where it lives. (4) README provenance: append these changes to the phase-2 change list, each labeled with W4's symptom/root-cause; note the IVP-vacuity discovery. (5) findings.md addendum section 'Live validation (owner, 2026-08-19/20)': the three root causes with layer attribution, the two IVP-vacuity mechanisms, and the kit-fix candidates (error event on both voice elements; kai-speaking-change true means speak() called not audio started; visualizer renders amplitude only in speaking state). Do NOT change the listening-amplitude behavior — that decision is pending with the owner. Verify each fix with a real headed-Chromium probe (adapt W4's live-debug/probe.mjs — e.g. a >2.5s utterance no longer trips the watchdog; a no-result recognition run shows the notice; a never-resolving getUserMedia shows a notice) and paste the probe outputs; also npm run build exit 0.

FILES: examples/apps/voice-assistant/src/** , examples/apps/voice-assistant/README.md, docs/superpowers/research/2026-08-19-rung-2-front-door/findings.md

CO-WRITERS: none

VERIFY: headed-Chromium probe outputs for all three fixes (red before where feasible, green after); npm run build exit 0; README + findings updated

Report back exactly:

```
DONE:
FILES:
VERIFY:
SELF-CHECK:
GAPS:
NEEDS-REGEN:
BLOCKERS:
```
````

The supervisor's dispatch message:

````text
You are W5, a pooled implementation worker on the kitn-chat repo (/Users/home/Projects/kitn-ai/kitn-chat, branch rung-2/voice-assistant). Your brief is at /Users/home/Projects/kitn-ai/kitn-chat/.superpowers/sdd/2026-08-19-rung-2/w5-livefix-brief.md — read it FIRST and follow it exactly, including the standing constraints. W4's full diagnosis (your input) is at .superpowers/sdd/2026-08-19-rung-2/w4-findings.md; its probe and evidence JSONs are under .superpowers/sdd/2026-08-19-rung-2/live-debug/.

Note the owner may be running a dev server on :5179 — use a different port for your probes (the app accepts --port; W4 used :5180). Kill anything you start. Run git only from the repo root; never touch the git index; no kit (packages/ui) edits — app layer only, and do NOT change the listening-amplitude behavior (owner decision pending).

When done: write your report to .superpowers/sdd/2026-08-19-rung-2/w5-livefix-report.md and return a summary: each fix with its before/after probe evidence, build result, README/findings diffs summary.
````

The supervisor's follow-up message, after the owner ruled on the
listening-amplitude decision (option A: the kit gained the opt-in) — change 14
below is what it produced:

````text
Follow-up task (writer-lock re-claimed for you on examples/apps/voice-assistant/src + README.md; same standing constraints). The owner ruled option A and W6 has landed it in the kit and REBUILT packages/ui/dist: kai-audio-visualizer now has a reflected boolean `listeningAmplitude` (attribute `listening-amplitude`) that, when set, renders real amplitude from stream/bands during the `listening` state — all six variants. Fit-to-container scaling is now default-on in the kit (no app action needed). W6's report: .superpowers/sdd/2026-08-19-rung-2/w6-kitfix-report.md.

Your task: make the app's listening visualization real. (1) Set the new flag on the visualizer (attribute in index.html or property in main.ts — pick what the app's existing style does for its other visualizer props). (2) Revisit the mic wiring now that the amplitude path is live: the stream attaches ~1.8s late (W4 measured getUserMedia latency eating most of a short hold) — if a cheap honest improvement exists (e.g. pre-open the mic when the user first arms push-to-talk, reusing your 5s-deadline openMic, releasing tracks on idle), take it; if not, leave it and note the latency in the README. Do NOT add a second amplitude pipeline — the element consumes the stream directly now. (3) Verify with a headed-Chromium probe: fake-device mic, hold push-to-talk, sample bar geometry DURING listening — assert bars actually move (this was the vacuous point; measure geometry, not state strings). Also do one viewport-shrink sample (narrow window, assert the visualizer host does not overflow its parent) as a smoke check of W6's containment from the app's side. (4) README phase-3 change list gains this adoption item, labeled with the finding it closes (owner live finding 2 / option A), and append this message verbatim to the transcript section. (5) npm run build exit 0.

Report back: probe evidence (bar geometry moving during listening; no overflow when narrow), what you did about mic latency, files changed.

Address this before completing your current task.
````

The supervisor's final fix-round message, after the final IVP failed its
containment point against the un-engaged app — change 15 above is what it
produced:

````text
Final fix round, W5 — one item, your lane (lock still needed on src: it covers examples/apps/voice-assistant/src and styles.css lives there; index.html is inside your earlier claim scope too — if you touch files outside src/README, stop and report instead). The final IVP failed ONLY point 6, and its diagnosis confirms your own report's disclosure: after W6's containment fix landed in the kit, the app-side width constraint you tried and reverted was never reapplied, so the kit's fit-scale never engages — #viz renders 1328x224 at every viewport, overflowing its parent even at 1280px. IVP evidence: .superpowers/sdd/2026-08-19-rung-2/ivp-final/06-containment.json + containment-360.png; its FAIL note names the fix shape.

Task: give #viz a real width constraint so fit-scale engages — your original `max-width:100%` attempt should now WORK against the fixed kit (the feedback collapse and stale-inner-box mechanisms are both fixed and probe-proven in .superpowers/sdd/2026-08-19-rung-2/w6-containment-probe/). Address the fit-content context too (#console's align-items:center) — W6's fixed kit handles the centered-flex case (its probe scenario A is exactly that), so try the minimal constraint first and MEASURE. Verify by RUNNING the IVP's own containment probe against your fixed app (node .superpowers/sdd/2026-08-19-rung-2/ivp-final/probe.mjs containment --port=<your keyless mirror port>) — red first against the unfixed app is already established by the IVP run, so one green run with: no overflow at 360px and 1280px, scaled (not collapsed, not natural) height, exact grow-back, click lands. IMPORTANT env-safety (a verifier burned a real API call on this): do NOT run probes against a server started in the real app dir — mirror the app to scratchpad excluding .env* (rsync + symlink node_modules, the IVP report describes it), confirm X-Kai-Mock: 1 before probing. Then npm run build exit 0, README phase-3 change list gains this item (labeled: owner live finding 3 / containment adoption; note the two-sided nature — kit fix W6, app engagement here), append this message verbatim to the transcript section. Report: probe JSON evidence + files changed.

Address this before completing your current task.
````

### Every insider change to the builder's code, named and labeled

Gap IDs refer to the graded gap list in
[`docs/superpowers/research/2026-08-19-rung-2-front-door/findings.md`](../../../docs/superpowers/research/2026-08-19-rung-2-front-door/findings.md).
Everything not listed here — `src/main.ts`'s wiring, `src/voice-support.ts`,
`src/styles.css`, `src/routes.ts`, the whole of `index.html`'s markup, and every
composition choice (`kai-thread` over `kai-chat`, the push-to-talk button, the
synthesis watchdog, the second mic capture) — is the builder's, verbatim from
the delivered snapshot.

1. **Layout: flat root → `src/` + `server/`** — corpus convention, and not a
   teaching gap at all: the builder *created* both directories but the harness
   umask defect made them untraversable, so it was forced to ship flat (its
   NOTES declares this; see builder-run.md). This restores the layout the
   builder intended and the scaffolder assumes. `index.html`'s script src
   follows (`/main.ts` → `/src/main.ts`).
2. **`package.json` — corpus identity and pins**: name
   `@kitn.ai/ui-app-voice-assistant` (private, version 0.0.0), the kit dep
   `file:…tgz` → `workspace:*`, TypeScript `^5.5.0` → `~5.7.2` and `@types/node`
   `^22.0.0` → `^22.19.21` (support-widget's exact pins; the builder's own
   Vite `^6` pin was already right and stands), scripts → `tsc -b && vite build`
   plus a separate `typecheck` (the shape `verify:starters` classifies). Corpus
   integration — no gap; the builder's pin *choices* were graded not-a-gap
   (G-21).
3. **tsconfigs: the builder's two flat projects → support-widget's
   solution-style trio** (`tsconfig.json` references + app/node split, same
   node/DOM separation, slightly stricter lint options). Same strictness the
   builder already passed; corpus convention — no gap.
4. **Dev port 5173 → 5179** — 5173 is the react starter's documented port in
   `examples/README.md`; the apps corpus continues from support-widget's 5178.
   Corpus convention — no gap.
5. **`server/mock-chat.ts` → `server/chat-api.ts`, OpenRouter seam added.** The
   builder's mock middleware — the 405 guard, socket-close detection, the
   `X-Accel-Buffering: no` header, the dev + preview mounts, the plain-prose
   canned replies — is kept as the mock side (it remains the field evidence for
   **G-04**: the `mock` integration ships no backend template, so the builder
   authored this from nothing). Added, copied from
   `examples/apps/support-widget/server/chat-api.ts`: the unprefixed-key
   `loadEnv` pattern, the OpenRouter proxy with provider-error passthrough and
   in-band stream-error frames, request-body validation (400 on a missing
   `messages` array), and the `X-Kai-Mock: 1` header. This closes the task's
   real-mode requirement; the underlying teaching gap (**G-04**, a rung-1
   candidate-D recurrence) stays open in the kit's scaffold catalog.
6. **Fetch body: `{ model: 'kai-mock', stream: true, messages }` →
   `{ messages }`** (`src/main.ts`). The builder had to guess the request
   envelope because nothing states it (**G-05**); with a real provider behind
   the same route, the guessed `model`/`stream` fields become the server's
   decision, not the client's. Matches support-widget's envelope, so the two
   corpus apps share one contract.
7. **`index.html` provenance line** updated to name both modes (a consequence
   of change 5; the builder's original truthfully described the mock-only
   endpoint it had).
8. **Added `.gitignore`, `.env.example`, this `README.md`** — corpus and
   provenance conventions (the builder's snapshot had a minimal `.gitignore`;
   this one is support-widget's, which also guards `.env*`).
9. **Enrollment outside the app dir**: `pnpm-workspace.yaml` gains
   `examples/apps/voice-assistant` (the file lists ladder apps one by one, and
   `verify:starters` cross-checks membership against the `workspace:*` dep) and
   `examples/README.md`'s corpus table gains this app's row.
10. **`lint:cdn-pins` waiver on this README's `@0.25.2` mention** (the version
    in "How this app was built" above). The guard flagged it as an unwired live
    pin; the supervisor's follow-up (transcribed above) instructed release-please
    wiring, but that mechanism REWRITES the version on every release, and this
    line is a run record — the exact kit version the clean-room builder was
    handed. The guard's own taxonomy ("historical records are waived, not
    rewritten" — `packages/ui/scripts/lint-cdn-pins.mjs` header) covers this
    case with a `lint-cdn-pins: historical` directive, which is what was
    applied. Not a kit gap; a guard-classification call.

Changes 11–13 are phase 3, the live-validation fixes (W5). Symptom numbers and
root causes are W4's, from the live-debug round recorded in the findings
addendum ("Live validation (owner, 2026-08-19/20)").

11. **Speech watchdog armed BEFORE `speak()`** (`src/main.ts`) — W4 symptom 3
    (the "intermittent" speaking phase plus a stray error). Root cause:
    `<kai-voice-output>` sets its speaking signal optimistically inside
    `speak()` itself, so `kai-speaking-change {speaking:true}` fires
    synchronously DURING the call — before the old code armed the watchdog.
    Armed after, the watchdog could only ever be cleared by speech ENDING, so
    every reply longer than 2.5 s tripped it mid-playback: phase forced idle
    and a false "never started speaking" error while audio kept playing. Armed
    before, the synchronous confirmation disarms it. KIT GAP, banked:
    `speaking:true` means "speak() was called", not "audio started"
    (`utterance.onstart` is unused).
12. **A 5 s deadline around the visualizer's `getUserMedia`** (`src/main.ts`;
    the message's `TimeoutError` case in `src/voice-support.ts`) — W4 symptom 1
    contributor. A permission prompt left unanswered keeps `getUserMedia`
    pending forever — no rejection, no timeout of its own (measured live:
    `gum: []`, the catch never fired) — so the visualizer silently never lit.
    The race surfaces the hang as the existing microphone notice; a stream that
    arrives after the deadline has its tracks stopped so the recording
    indicator doesn't stay lit unused.
13. **No-result heuristic on the native recognition path** (`src/main.ts`) —
    W4 symptom 1, the app-side mitigation. `<kai-voice-input>` emits NO event
    when recognition fails at runtime or hears nothing: its `onerror` only sets
    a signal nothing reads, and an empty result fires no `kai-transcription` at
    all — so the "Nothing was recognised" branch was dead code on the native
    path and a failed session ended in total silence. Now, recording ending
    with no final transcript within 600 ms shows that caption. The kit gap (no
    error / no-result signal on `kai-voice-input`) is named in a comment at the
    site so the workaround's reason lives where the code does.

14. **Real amplitude while listening: `listening-amplitude` adopted, mic
    pre-opened at the gesture** (`index.html`, `src/main.ts`) — closes owner
    live finding 2 (visualizer dead while the user speaks), resolved by the
    owner as option A: the kit gained an opt-in reflected boolean
    (`listeningAmplitude` / attribute `listening-amplitude`) that renders real
    amplitude from `stream` during the `listening` state, and this app sets the
    attribute (matching its existing attribute style for the visualizer's
    scalars). The app feeds the element its mic stream directly — no second
    amplitude pipeline. Mic wiring revisited for latency: `getUserMedia` was
    measured taking up to ~1.8 s, eating most of a short hold's visualization
    window when opened on `kai-recording-change`, so `openMic()` is now
    pre-called at the gesture itself (holdStart), with an in-flight latch so
    the gesture call and the recording-change call share one capture (two
    concurrent opens were measured leaking a stream with the recording
    indicator lit), and a holdEnd release for the case where recognition never
    reports. The stream still closes whenever the turn leaves `listening`, so
    the recording indicator goes out between turns exactly as before. Verified
    by bar GEOMETRY sampled during listening in headed Chromium — not state
    strings, which is what made the old IVP point vacuous. Not adopted:
    app-side width constraints for the kit's new fit-to-container scaling —
    engaging it from this app's layout produced kit-layer breakage in both
    configurations tried (a feedback height collapse under a fit-content host;
    an inner box overflowing the adopted height and covering the push-to-talk
    button), reported upstream rather than worked around — until the kit fix
    landed; change 15 completes the adoption.
15. **Containment engaged: `#viz { max-width: 100% }`** (`src/styles.css`) —
    owner live finding 3 / containment adoption. Two-sided by design: W6 fixed
    the kit's fit-to-container scaling (the feedback height collapse and the
    stale inner box that covered the push-to-talk button, both of which change
    14's first attempt hit), and this is the app's side — `#console` centers
    its items, a shrink-to-fit context in which the host tracks the
    visualizer's natural 1328 px footprint, so without a width cap the kit's
    scaler never sees a smaller box and the element overflows every viewport
    narrower than that (including an ordinary 1280 px window). Verified with
    the final IVP's own containment probe against the fixed app: no overflow
    at 360 px or 1280 px, proportionally scaled height (not collapsed, not
    natural), exact return to natural on grow-back, and the push-to-talk click
    landing — plus a re-run of the listening-amplitude geometry probe to
    confirm the constraint costs the interaction nothing.

The same round found **why the earlier scripted IVP passed 9/9 over all three
defects**: its synthesis stub held `speaking` for exactly 2500 ms — the
watchdog's own constant — with its end-timer registered inside `speak()` before
the watchdog was armed, so it cleared the watchdog by ~1 ms of timer ordering
(any stub duration over 2.5 s would have exposed change 11's bug); and its
visualizer point asserted `viz.state === 'listening'` — string equality on the
prop the app itself sets — without ever sampling bar geometry, so "lit
real-amplitude bar" passed vacuously. Details in the findings addendum.

Deliberately **not** fixed here, per the brief — the rung's kit-level product
findings are banked, not patched around in the corpus: the voice elements'
missing audio tap (G-07/P-1, why this app opens a second `getUserMedia`), the
unexposed support detection (P-3, why `src/voice-support.ts` hand-rolls the
probe), and the missing synthesis-failure signal (G-12, why the 2.5 s watchdog
exists).
