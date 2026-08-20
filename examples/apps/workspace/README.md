# Chat workspace

Rung 3 of the iteration ladder: a multi-conversation chat workspace. A
`<kai-conversations>` rail beside a `<kai-chat>` thread — start a new
conversation, switch between them with each thread's history intact, delete one
(with Undo instead of a confirm), search the list, collapse the rail. Replies
stream in token by token, and everything persists client-side in localStorage:
reload the page mid-conversation, continue the thread, and the assistant sees
its full rehydrated history. React + TypeScript + Vite, on the generated React
wrappers from `@kitn.ai/ui/react`.

Spec of record:
[`docs/superpowers/specs/2026-08-20-rung-3-workspace-design.md`](../../../docs/superpowers/specs/2026-08-20-rung-3-workspace-design.md).

## Run it

The kit resolves through `workspace:*`, so build it first:

```bash
pnpm install          # from the repo root
pnpm exec nx build ui
pnpm --filter @kitn.ai/ui-app-workspace dev
```

Then open <http://localhost:5180>.

### Mock mode (the default)

With no key set, `POST /api/chat` streams frames from `createMockResponder()` in
`@kitn.ai/ui/state`. They are canned, they are OpenAI-shaped, and they are
impossible to mistake for a model: the stream opens with a `: kai-mock` comment,
every frame carries `_kai_mock`, and `model` reports as `kai-mock`. The response
also carries an `X-Kai-Mock: 1` header for whoever is reading a curl.

### Real mode

```bash
cp .env.example .env.local   # paste an OpenRouter key, restart the dev server
```

The key is **unprefixed** (`OPENROUTER_API_KEY`, never `VITE_…`): Vite only
inlines `VITE_`-prefixed vars into client code, so an unprefixed name cannot
reach the browser bundle. It is read in `vite-chat-api.ts` and used in
`server/chat.ts`, nowhere else. The model defaults to
`anthropic/claude-haiku-4.5`, configurable with `OPENROUTER_MODEL`.

**The browser code does not change between the two modes.** Same `fetch`, same
`toOpenAIMessages` encode, same `readOpenAIStream` parse. The path the mock
exercises is the path that ships — including the reload-continuation path: the
whole rehydrated thread is re-encoded and posted every turn, so a real provider
sees exactly what the mock route's console line reports.

## How it works

- `src/App.tsx` owns the state: an array of conversation records (the record of
  truth) projected onto the rail's row shape, an id-bound message setter so a
  stream keeps writing to the conversation that started it even after you
  switch away — and drops its deltas if that conversation was deleted — and a
  per-conversation AbortController map.
- `src/storage.ts` loads/saves localStorage with a shape validator that drops
  an unreadable record loudly and keeps every other thread alive.
- `src/conversations.ts` derives titles (which are also what the rail's
  built-in search matches), sorts by recency, and projects records to rows.
- `server/chat.ts` + `vite-chat-api.ts` are the dev endpoint: the scaffolder's
  emitted mock route bridged onto Vite's dev server, with the mock/OpenRouter
  seam.

## Not production

`vite-chat-api.ts` is a dev-only Vite plugin (like the support widget's):
`vite build` produces a static site with no `/api/chat` at all. Shipping this
means deploying `server/chat.ts`'s handler on your own host; the kit's `kai`
MCP scaffolder emits one per framework (`npx @kitn.ai/ui mcp`).

## How this app was built

This app is the ladder's third front-door build: the application code was
written by a clean-room builder agent (Claude Opus, 98 turns, ~20 minutes) that
had never seen this repository. It worked from a packed-and-stripped
<!-- lint-cdn-pins: historical -- records the exact kit version the clean-room builder was handed; a release bump must not rewrite this run record -->
`@kitn.ai/ui@0.25.2` tarball (README, llms files and TS/TSX/CSS source removed)
plus the kit's own `kai` MCP server over stdio — and nothing else: no repo
access, no web fetches, no docs. The app it delivered built and ran with zero
comparer fixes; its one mid-run build failure (`@types/node` missing for the
scaffold's node-runtime route, findings F-08) it diagnosed and fixed itself.
This is the **first rung with a full session transcript** (431 lines, 97 tool
calls, zero MCP errors — the rung-2 harness defect that destroyed the transcript
was fixed and probe-verified before launch), so every claim about the run is
per-call citable. The full run record, the builder's NOTES.md (17 questions,
verbatim), the delivered snapshot, the MCP call table, and the graded findings
live in
[`docs/superpowers/research/2026-08-20-rung-3-front-door/`](../../../docs/superpowers/research/2026-08-20-rung-3-front-door/)
(run metadata: session `d0cf3c07-b36b-4749-b7c8-0d8593107d85`, prompt sha256
`566133636cf00d91714974f4a127f24ab073f2e132269a71ed13c7b96678a84a`).

The builder chose the **middle path** deliberately: `<kai-conversations>` +
`<kai-chat>` via the React wrappers, rail as a sibling — after pulling the full
`kai-workspace` reference and rejecting the monolith on a verified fact (its
`kai-search` is the composer's Globe button, not conversation search), and
after quoting the `workspace-chat` recipe's own caveats against slotting the
rail inside the chat. That choice stands unmodified here (findings scorecard 2;
the triangle it exposes — no documented arrangement satisfies search +
collapse — is finding F-02).

An insider then finished the distance — corpus integration, the OpenRouter
seam, the request guards — and nothing else. Per the standing provenance
policy, every phase's complete instruction stream follows verbatim, then the
named list of every change made to the builder's code.

### Phase 1 — the front-door build (the builder's entire task prompt, verbatim)

The one and only prompt the clean-room builder received (authored to the ops
dir as `prompt.md`, sha256
`566133636cf00d91714974f4a127f24ab073f2e132269a71ed13c7b96678a84a`, verified
identical to the file launched; the verbatim block of record is in
[`docs/superpowers/plans/2026-08-20-rung-3-workspace.md`](../../../docs/superpowers/plans/2026-08-20-rung-3-workspace.md)
Task 2):

````text
Build a small web app: a chat workspace where one person keeps multiple conversations with
an AI assistant. Requirements: a sidebar listing the user's conversations; starting a new
conversation; switching between conversations, with each thread's earlier messages intact
when you return to it; deleting a conversation; searching/filtering the conversation list;
the sidebar can collapse. Messages stream in incrementally as the assistant replies.
Conversations persist across a page reload, entirely client-side; continuing an old
conversation after reload must work, with the assistant seeing its full history. React +
TypeScript + Vite. Use the `@kitn.ai/ui` package already installed in this directory — it
ships web components for AI chat UIs and React bindings. Its `kai` MCP server is configured
for you: use it to learn what the package provides and how to use it. Replies should come
from a local dev endpoint that streams a mocked response; the package ships facilities for
mocking — discover them. Do not fetch any remote docs or read the package's source on
npm/GitHub; work from the MCP and what is installed. When done: the app must build
(`npm run build`) and run (`npm run dev`), and write NOTES.md recording every question you
could not answer from the MCP and where you had to guess.
````

The recorded bias statement: the prompt says mock facilities exist (carried
from rungs 1–2 — a real consumer might not know that); it names React bindings
(a consumer who chose React knows this from the package page); it does NOT name
any element and does NOT hint compose-vs-monolith — which path the builder
takes is itself a measurement.

### Phase 2 — the insider completion (this conversation, verbatim)

The insider agent (Claude Fable worker W18, dispatched by a supervisor session)
received the following dispatch message, reproduced unedited:

````text
You are W18 on the kitn-chat repo (/Users/home/Projects/kitn-ai/kitn-chat, branch rung-3/workspace). Execute Task 5 (insider completion) of docs/superpowers/plans/2026-08-20-rung-3-workspace.md — read its Task-5 checkboxes FIRST; they are the authority. Standing constraints: no git checkout/reset/stash; no subagents; never nx test; never rebuild the package (dist is fresh); commits are the supervisor's; look it up before asserting it. Your FILES (writer-locked for you): examples/apps/workspace/** (new), examples/README.md, pnpm-workspace.yaml, pnpm-lock.yaml (via pnpm install — rung-2 precedent, these ARE in your lane this time), the plan file (Task-5 checkboxes + run ledger only).

Source of truth: the app snapshot at docs/superpowers/research/2026-08-20-rung-3-front-door/app/ (W17 verified it builds and runs green, zero fixes). Corpus conventions to mirror: examples/apps/support-widget/ and examples/apps/voice-assistant/ (package.json shape with workspace:*, pinned Vite/TS majors, tsconfig trio, /api/chat middleware with the OpenRouter seam per the rung-1 pattern — the builder's scaffold-derived mock route likely needs only the seam added; keep its structure, note ChatRequestBody preamble rule from CLAUDE.md, .env.example modeled on voice-assistant's, unique port — read the other apps' vite.configs for taken ports, pick the next). React peer deps: the app needs react/react-dom as real dependencies (W16's harness condition).

Also read before starting: W17's findings (docs/superpowers/research/2026-08-20-rung-3-front-door/findings.md) — your insider changes must each be labeled with the finding/gap that forces them (F-numbers where they exist), and the builder's composition choices STAND (kai-conversations + kai-chat middle path; do not "upgrade" it to parts or monolith). Note @types/node missing was the run's only build failure (G-04 residual) — ensure the corpus version has it.

README provenance per the standing policy: ALL phases verbatim — the builder task prompt (from docs/superpowers/plans/2026-08-20-rung-3-workspace.md's verbatim block), this dispatch message transcribed, plus run facts (98 turns, ~20 min, clean-room, transcript survived — link the research dir), and the numbered insider change list.

Verify: verify:starters green with workspace enrolled (watch the roster output name it); npm run build exit 0 in the app; dev smoke keyless (mock SSE + the forced-failure trio GET→405 / non-JSON→400 / empty→400 if the builder's route implements them — if it doesn't, that's an insider change labeled with the plan's G-16 requirement, mirroring voice-assistant's route behavior).

Report to .superpowers/sdd/2026-08-20-rung-3/w18-report.md; return: files created, every insider change + its label, verify:starters roster line, anything decided that the plan didn't cover.
````

The supervisor's fix-round message, after the independent IVP failed exactly one
point (change 9 below is what it produced):

````text
Fix round, W18 (locks re-claimed on examples/apps/workspace + the research findings.md; same standing constraints). The IVP failed exactly one point: the delete Undo toast is never visible or clickable. Root cause (verified, .superpowers/sdd/2026-08-20-rung-3/ivp/verdict.md + point4-undo-toast-invisible.jpg): src/styles.css sets `.workspace { position: fixed; z-index: 1000 }` while the kit's kai-toast-region is a body-level sibling at z-index 100 — the workspace paints entirely over it; elementFromPoint at the Undo button's own rect returns KAI-CHAT.

Task: (1) Fix in the app's CSS — read verdict.md's fix candidates and pick the minimal one that respects the repo's no-shadow-piercing rule (likely: stop promoting .workspace to a 1000 z-index stacking context it doesn't need, or lower it below 100 — justify at the site with a comment naming the kit's toast-region z-index contract). Do NOT touch kit sources. (2) Verify by adapting the IVP's own probe (its probe files are under .superpowers/sdd/2026-08-20-rung-3/ivp/): keyless mirror per the standing method, delete a conversation, assert the toast paints at its rect (screenshot), elementFromPoint returns the toast/button, AND a real click on Undo genuinely restores the conversation in localStorage + DOM. Run red first only if cheap (the IVP's evidence already establishes red — a fresh green with the same probe is sufficient). (3) Classification for the record: append to findings.md a short entry — this was a builder error class (app CSS stacking) with a kit-affordance note (kai-toast-region's z-index 100 is easily buried by consumer fixed-position layouts and its contract is documented nowhere — candidate for the docs pass / re-cast spec input). (4) README insider change list gains this fix, labeled IVP point-4; append this message verbatim to the provenance transcript. (5) npm run build exit 0.

Report: green probe evidence, the CSS diff, the findings entry.

Address this before completing your current task.
````

### Every insider change to the builder's code, named and labeled

F-numbers refer to the graded findings in
[`docs/superpowers/research/2026-08-20-rung-3-front-door/findings.md`](../../../docs/superpowers/research/2026-08-20-rung-3-front-door/findings.md).
Everything not listed here is the builder's, **verbatim** from the delivered
snapshot: the whole of `src/` (`App.tsx`, `conversations.ts`, `storage.ts`,
`main.tsx`, and `styles.css` but for change 9's one z-index value),
`index.html`, all three tsconfigs, and every
composition choice — the middle path, the sibling rail with its 59 lines of
owned layout (F-02), the hand-rolled active-conversation delete with Undo
(F-01), the no-match search hint (F-04), the theme sync (F-09), the id-bound
setter and abort map (F-07), and the storage validator (F-18).

1. **`package.json` — corpus identity**: name `@kitn.ai/ui-app-workspace`
   (private, version 0.0.0), the kit dep `file:…tgz` → `workspace:*`, a
   `typecheck` script (`tsc -b --pretty false`, the shape `verify:starters`
   classifies), a corpus-style description. Corpus integration — no gap.
   **Deliberately NOT changed: the builder's toolchain pins** (`vite ^7.3.6`,
   `typescript ~5.9`, `@types/node ^26`, React 19) — the vite `^7` pin was a
   recorded deliberate choice (F-19, acceptable variation, forward-compat
   evidence a major ahead of the corpus pins), and the builder's
   `tsconfig.app.json` uses `erasableSyntaxOnly` (TS 5.8+), so the pins and
   the kept-verbatim tsconfigs stand or fall together. `react`/`react-dom`
   stay **real dependencies**: `@kitn.ai/ui/react` resolves only with them
   installed (W16's harness condition, verified in the rung's resolution
   probes). `@types/node` was already present — the builder added it itself
   after the run's only build failure (F-08); it is retained and this line is
   the check the dispatch asked for.
2. **`vite.config.ts` — fixed port 5180** (the builder ran on Vite's default
   5173, the react starter's documented port; 5173–5179 are all taken across
   `examples/`), plus the corpus-standard header comment. The builder's plugin
   order and dev-only mounting are kept. Corpus convention — no gap.
3. **`server/chat.ts` — request guards added**: 405 (with `Allow: POST`) on a
   non-POST, 400 on a non-JSON body, 400 on a missing/empty `messages` array.
   The builder's scaffold-derived route implemented none of them — labeled per
   the plan's G-16 requirement (forced-failure behavior must be loud),
   mirroring `examples/apps/voice-assistant/server/chat-api.ts`. The scaffold's
   emitted block-2 route ships without these guards; banked as an observation
   against the same scaffold surface as F-08/F-16.
4. **`server/chat.ts` — the OpenRouter seam**: no key → the builder's mock
   route runs exactly as delivered (plus an `X-Kai-Mock: 1` header, the corpus
   marker for curls and tests — the client never reads it); key → the same
   request is forwarded to OpenRouter with the provider's SSE bytes piped back
   untouched, provider error status/body passed through (a 401 arriving as a
   200 is a blank bubble), and a mid-stream failure reported in band the way
   OpenRouter itself reports one. Copied from the rung-1/rung-2 corpus pattern;
   the builder's `ChatRequestBody`/`readChatRequest` preamble, module-scope
   responder, and backpressure `cancel()` are all kept (its mock body moved
   into `streamMock()` unchanged). Corpus real-mode requirement — not a
   builder gap; the clean-room task was mock-only by design (F-17 records the
   builder choosing the HTTP route over in-browser mocking, the stronger
   choice, which is what made this seam a pure addition).
5. **`vite-chat-api.ts` — env read, method forwarding, disconnect
   propagation**: `loadEnv(mode, root, '')` at `configResolved` (the
   unprefixed-key pattern — see the security contract in `server/chat.ts`);
   the bridge now forwards the real HTTP method instead of stamping every
   request POST (without this, change 3's 405 guard is unreachable and a GET
   dies in `request.json()`); and an `AbortController` wired to socket close
   rides the `Request` into the handler, so a browser that hangs up mid-reply
   also hangs up on the provider, and the bridge stops writing to the dead
   socket. The disconnect propagation is the server-side half of the
   cancellation story the MCP never taught (**F-07** — the builder handled the
   client-side abort correctly but the bridge never invoked its own stream's
   `cancel()`).
6. **Added `.env.example`** (modeled on voice-assistant's: the
   runs-with-no-key contract, the unprefixed-key rule, model + max-tokens
   ceilings) **and `.gitignore`** (support-widget's, which guards `.env*`).
   Corpus and security conventions — no gap.
7. **Enrollment outside the app dir**: `pnpm-workspace.yaml` gains
   `examples/apps/workspace` (the file lists ladder apps one by one, and
   `verify:starters` cross-checks membership against the `workspace:*` dep),
   `examples/README.md` gains the rung-3 row and the port-5180 run line, and
   `pnpm-lock.yaml` was regenerated by `pnpm install`. Corpus convention — no
   gap.
8. **Added this `README.md`** — the provenance policy itself.
9. **`src/styles.css` — `.workspace` z-index 1000 → 10** (**IVP point 4**; the
   one line of builder CSS changed, findings addendum F-20). The builder
   promoted its full-page wrapper to `z-index: 1000` against a sticky-header
   concern; the kit's `kai-toast-region` — which `toast()` mounts as a
   body-level sibling of `#root` — paints its stack at a hardcoded
   `z-index: 100`, and both live in the root stacking context, so the
   workspace painted over every toast and the delete Undo was invisible and
   unclickable (verified by the independent IVP with screenshots, hit-tests,
   and a real click that restored nothing). Fixed app-side only, respecting
   the no-shadow-piercing rule: the wrapper's z-index now sits below 100, with
   the toast-region contract named in the comment at the site. Probe-verified
   green — toast paints at its rect, `elementFromPoint` returns the toast, a
   real click on Undo restores the conversation in localStorage and the DOM
   (`.superpowers/sdd/2026-08-20-rung-3/w18-undo-fix/`). Kit-affordance note
   banked in the findings: the region's z-index has no override hook and is
   documented nowhere.

### Phase 3 — the re-cast migration (this conversation, verbatim)

The migration agent (Claude Fable worker laneE, dispatched by a supervisor
session for the workspace re-cast,
[`docs/superpowers/specs/2026-08-20-workspace-recast-design.md`](../../../docs/superpowers/specs/2026-08-20-workspace-recast-design.md))
received the following dispatch message, reproduced unedited:

````text
You are Lane E on the kitn-chat repo (/Users/home/Projects/kitn-ai/kitn-chat, branch recast/phase-1). Execute Task E of docs/superpowers/plans/2026-08-20-recast-implementation.md — its checkboxes are the authority; read the spec's §3b (the block half) and §Sequencing first. Standing constraints: no git checkout/reset/stash; no subagents; never nx test; no package rebuild (supervisor gates — but note dist is fresh as of the Phase-1 gate run and does NOT yet contain Lane D's new state helpers; for corpus-app compilation against workspace:* that resolves through src at typecheck time check how the app's tsconfig resolves and report if you need a rebuild rather than running one). Your lock: packages/ui/src/agent-tooling + examples/apps/workspace (agent laneE; extend via the lock tool as needed).

Two deliverables:

(1) THE FIRST OFFICIAL BLOCK: the scaffolder emits the workspace composition — the kai-workspace layout shell + kai-conversations (+ item-mode note) + kai-chat + Lane D's ratified state helpers (updateThreadMessages/bindThreadMessages, createThreadSessions, createSaveScheduler, parseStoredThread — exact imports in .superpowers/sdd/2026-08-20-recast-impl/laneD-report.md §5). Study how the existing archetypes/integrations emit (registry-driven; verify:scaffold axes must move on their own from your registry change, per the derive-don't-type law). The block is CODE THE CONSUMER OWNS: emitted comments should carry the same honesty the corpus app's do (mock/real seam, key handling, the persistence boundary — retention/quota/policy is yours-the-consumer's). Emitted code lives in string literals: extend scaffold.test.ts red-first for wording, and rely on the supervisor-run verify:scaffold for compilation. The workspace archetype's old emission (whatever it teaches today) updates to the block shape.

(2) CORPUS MIGRATION: examples/apps/workspace migrates to the shell + helpers shape — the layout moves onto <kai-workspace> (header/start/main slots + drawer-below), storage.ts/App.tsx mechanical glue replaced by Lane D's helpers per its fitness mapping (the app KEEPS: localStorage itself, quota catch, active-id policy, fetch line, delete/undo policy, title derivation — the boundary is the point). The builder's remaining composition choices stand. README provenance gains the migration as a numbered change (labeled: re-cast Task E; this dispatch appended verbatim per the provenance policy). The app must build + typecheck + dev-smoke keyless (mock SSE + the guard trio) — same evidence as W18 produced. Glue-count note for the measurement section: after migration, count the app's authored glue lines the same way findings.md §5 did and record the delta in your report (the ratchet's first data point — do NOT write it into any doc that isn't the report; the artifact of record stays the findings method).

Report to .superpowers/sdd/2026-08-20-recast-impl/laneE-report.md; return: registry/scaffold changes + red-green evidence, the migration diff summary + glue-line delta, app build/smoke results, anything needing the supervisor's built-tree gates.
````

10. **The re-cast migration** (**re-cast Task E**; spec § 3b, plan
    2026-08-20-recast-implementation Task E). The app is now the reference
    implementation of the first official BLOCK: layout on the `<kai-workspace>`
    shell, mechanics on the `@kitn.ai/ui/state` thread helpers, every policy
    line still this app's own.
    - **`src/App.tsx` — layout onto the shell**: the hand-owned flex row
      (`.workspace` + `.rail` sibling arrangement, F-02's 59 lines of CSS) is
      replaced by `<Workspace>` with the rail in `slot="start"`, an app bar in
      `slot="header"`, the thread in the main region, and `drawerBelow={720}`.
      The rail's collapse toggle now drives the SHELL's start aside
      (`startCollapsed` controlled; the rail itself stays expanded), and
      because a collapsed aside is fully hidden — the shell reclaims the space
      instead of leaving the old 48px gutter — the reopen control moved to the
      header band. The collapse UX is the one deliberate behavior change of
      the migration.
    - **`src/App.tsx` — mechanics onto the helpers**: the hand-rolled id-bound
      setter (`setMessagesFor`, the reactivity-two-halves map/spread and the
      delete-under-stream `hit` drop) is `bindThreadMessages` with a `touch`
      policy hook; the `inFlight` AbortController map and `streamingIds`
      bookkeeping are `createThreadSessions` (delete uses `sessions.abort`);
      the `SAVE_DEBOUNCE_MS` timer, `latest` ref and the two persistence
      effects are `createSaveScheduler` (the 250ms delay stays this app's
      number). Kept, by design: localStorage, the quota catch, active-id
      policy, the fetch line, the delete/undo policy, title derivation.
    - **`src/storage.ts` — the message validator is the kit's**: the
      hand-typed `isMessagePart`/`parseMessage` union walk is
      `parseStoredThread`, whose MessagePart variant list is DERIVED from the
      kit's own union (F-18); the drops it reports are still warned about
      here, and every conversation-level field, the drop-the-record policy for
      a non-array `messages`, and the storage try/catch policy stay verbatim.
    - **`src/styles.css`** — the rail-column arrangement CSS deleted (the
      shell owns it); the toast-layer comment updated for the `--kai-toast-z`
      token the kit now exposes (F-20's fix); `.appbar`/`.shell` styling
      added.
    - Unchanged: `src/conversations.ts`, `src/main.tsx`, `index.html`, the
      server route, the vite bridge, all tsconfigs, and every remaining
      composition choice.
