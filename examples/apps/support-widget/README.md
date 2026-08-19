# Support widget

Rung 1 of the iteration ladder: the smallest real application you can build with
`@kitn.ai/ui`. A docked support chat on a product page — floating launcher,
panel with `<kai-chat>`, submit, streaming replies. **No conversation history, no
sidebar.** Vanilla TypeScript and Vite, no framework.

Plan of record:
[`docs/superpowers/plans/2026-08-19-rung-1-support-widget.md`](../../../docs/superpowers/plans/2026-08-19-rung-1-support-widget.md).

## Run it

The kit resolves through `workspace:*`, so build it first:

```bash
pnpm install          # from the repo root
pnpm exec nx build ui
pnpm --filter @kitn.ai/ui-app-support-widget dev
```

Then open <http://localhost:5178> and click **Support** in the bottom-right corner.

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
reach the browser bundle. It is read inside `server/chat-api.ts` and nowhere
else. The model defaults to `anthropic/claude-haiku-4.5` and is configurable with
`OPENROUTER_MODEL`.

**The browser code does not change between the two modes.** Same `fetch`, same
`readOpenAIStream`. That is deliberate: it means the path the mock exercises is
the path that ships, so the mock cannot be green over a broken wire.

## How the turn works

`src/chat.ts` is the whole of it, about ninety lines:

1. `kai-submit` fires on the element (non-bubbling — the listener is on
   `<kai-chat>` itself) with the text on `event.detail.value`.
2. The user turn is appended, then the thread is encoded with `toOpenAIMessages`
   from `@kitn.ai/ui/wire` — before the assistant placeholder exists.
3. `POST /api/chat`, and the response goes straight into `readOpenAIStream` with
   an `AssistantStream` from `@kitn.ai/ui/state` as the sink. No hand-rolled SSE
   reader; the kit ships the parser.
4. Every fold assigns a **new array** (what notifies `<kai-chat>`) containing a
   **new object for the message that changed** (what makes the change visible in
   a reference-keyed list). Both halves, on every update.

## Not production

`server/chat-api.ts` is a Vite plugin with `apply: 'serve'`. It does not exist in
a production build: `npm run build` emits a static site whose `/api/chat` 404s.
Shipping this means writing the same endpoint on your own host — the kit's `kai`
MCP scaffolder emits one per framework (`npx @kitn.ai/ui mcp`).

## How this app was built

This app was written by an AI implementer agent (Claude Opus) dispatched by a
supervisor session (Claude Fable) as rung 1 of the iteration ladder. What follows
is the complete, unedited instruction stream that implementer received: the
generated brief it was pointed at, then every message from the supervisor in the
order they arrived. Independent verification (a separate agent's browser IVP) and
the owner's live-provider validation happened outside this conversation and are
recorded in the run ledger of
[`docs/superpowers/plans/2026-08-19-rung-1-support-widget.md`](../../../docs/superpowers/plans/2026-08-19-rung-1-support-widget.md).

Read it as an INSIDER build. The implementer was pointed straight at repo
internals — the vanilla starter, the openrouter-spike's proxy, the scaffolder's
`docked-widget` placement CSS, the repo's own contract docs — as the conversation
below shows. So this is the verified reference implementation of the
docked-widget composition, and evidence that the components compose. It is
deliberately NOT evidence of what the kit's MCP and public docs teach somebody
who has never seen this repository.

That measurement is a separate exercise: an MCP-only rebuild, where a fresh agent
in a sandbox gets the installed package and the `kai` MCP and nothing else, and
its output is diffed against this reference. Every divergence is filed as a
teaching gap. Ladder policy is that app code goes through the front door only
from later rungs; repo plumbing stays insider.

### The generated brief (`.superpowers/sdd/2026-08-19-rung-1/task-1-brief.md`, gitignored)

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

TASK: Rung 1, tasks 1-3 (one coherent stream): the support-widget app at examples/apps/support-widget/ — skeleton + CI home, the docked widget itself, and the mock/real dev-server middleware. Read docs/superpowers/plans/2026-08-19-rung-1-support-widget.md (the whole plan, especially the Rulings) before anything else.

FILES: examples/apps/support-widget/** (new) · pnpm-workspace.yaml (one entry) · packages/ui/scripts/verify-starters.mjs (extend enumeration to examples/apps/)

CO-WRITERS: None. You are the sole writer; the supervisor holds the git index. Writer-lock claim recorded in this workspace.

VERIFY: pnpm --filter @kitn.ai/ui run verify:starters (must enumerate + build + typecheck the new app; watch the extension fail first on a deliberately broken fixture app before trusting it) · npm run build && npm run typecheck inside examples/apps/support-widget · dev-server smoke: mock reply streams with no key present

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

### Supervisor message 1 — initial dispatch

````text
Repo: /Users/home/Projects/kitn-ai/kitn-chat, branch feat/rung-1-support-widget (checked out — work directly in this tree). You are W1. Your brief is at .superpowers/sdd/2026-08-19-rung-1/task-1-brief.md — read it FIRST and follow its standing constraints exactly. Then read docs/superpowers/plans/2026-08-19-rung-1-support-widget.md in full; you are implementing its Tasks 1, 2 and 3 as one stream.

REFERENCE MATERIAL (read before writing code — the plan's rulings bind you to these patterns):
- examples/starters/vanilla/ — the house style for a vanilla TS + Vite consumer app (package.json shape, workspace:* dep, vite config, how it wires @kitn.ai/ui/wire's readOpenAIStream + @kitn.ai/ui/state's createMockResponder, tsconfig). Your app is its docked-widget sibling, WITHOUT the workspace/sidebar/history composition.
- examples/internal/openrouter-spike/server/openrouter-proxy.ts and its .env.example — THE key pattern: unprefixed OPENROUTER_API_KEY, never VITE_-prefixed, read only server-side. Copy the pattern, not the code wholesale.
- packages/ui/src/agent-tooling/mcp/tools/scaffold.ts — placementStyle('docked-widget') (~L163) — the reference CSS for the floating bottom-right widget; your app is the first real instance of that placement.
- examples/README.md + packages/ui/scripts/verify-starters.mjs — the enumeration you are extending.
- CLAUDE.md's kai- contract section: array/object props as JS PROPERTIES; kai-submit event, detail.value; re-render needs a NEW ARRAY and a NEW OBJECT per changed item — both, every update, not only streaming. Pin your usage to that.

WHAT TO BUILD:
1. examples/apps/support-widget/ — package @kitn.ai/ui-app-support-widget, private, "@kitn.ai/ui": "workspace:*", scripts: dev/build/typecheck (build must run tsc or have separate typecheck per verify-starters' rules). Vanilla TS + Vite, no framework plugin. Entry pnpm-workspace.yaml gets 'examples/apps/*' (or the specific path — match the file's existing granularity).
2. The widget: a host page (a plausible fake product page so the docked placement means something), a floating launcher button bottom-right, click opens a docked panel containing <kai-chat> (register via import '@kitn.ai/ui/elements'). Submit flow: kai-submit → POST /api/chat with the thread encoded via @kitn.ai/ui/wire's toOpenAIMessages → response parsed with readOpenAIStream → parts appended via @kitn.ai/ui/state helpers → messages property set with a fresh array AND fresh changed-item objects. No conversation history persistence, no sidebar. Keep it SMALL — this is the smallest real surface, not a showcase.
3. Dev middleware: a vite dev-server middleware (or tiny node server the dev script runs — prefer vite middleware, it's the route-node pattern CI already typechecks in the scaffolder) serving POST /api/chat. No OPENROUTER_API_KEY in env → stream createMockResponder frames (the kit's own mock, self-identifying). Key present → proxy to OpenRouter (model: pick a cheap default, e.g. anthropic/claude-haiku via openrouter, configurable via OPENROUTER_MODEL). .env.example documents both, with the spike's never-VITE_ warning. The client code is IDENTICAL in both modes — the seam is server-side.
4. verify-starters.mjs: extend enumeration to also walk examples/apps/ with the same classifier and hard-fail semantics (derived, no hand-list). The script's existing conventions bind you. WATCH IT FAIL FIRST: point it at a scratch fixture app with a broken/missing build script and see the hard failure name it, then green on the real app. Do not weaken any existing behavior — all 8 starters must still pass classification (you may run the full verify:starters once at the end; it builds 8 apps, expect minutes).
5. A short README.md in the app dir: what it is (rung 1 of the iteration ladder), how to run mock vs real, pointer to the plan.

CONSTRAINTS BEYOND THE BRIEF: dist/ exists (built earlier today) — do NOT rebuild @kitn.ai/ui. If something you need is genuinely missing from dist, STOP and report. Node stdlib + existing workspace deps only; if the middleware needs a fetch/proxy helper, native fetch is available (node 22).

SELF-CHECK before reporting: npm run build + typecheck green in the app dir; verify-starters green including your app (and your watched-red evidence); dev-server smoke test WITHOUT a key — curl or fetch /api/chat with a minimal OpenAI-shaped body and confirm SSE mock frames stream back; open question you could not resolve → GAPS, not guesses.

Report DONE/FILES/VERIFY/SELF-CHECK/GAPS/NEEDS-REGEN/BLOCKERS exactly per the brief.
````

### Supervisor message 2 — follow-up: the CI step name

````text
Small follow-up while verification runs (your app is under IVP — do not touch examples/apps/support-widget/** right now). Another worker flagged: .github/workflows/test.yml ~line 615, the step "Starter apps build (all 8, ...)" is now stale — your extension made it 8 starters + the apps corpus. I've claimed test.yml for you in the writer lock. Update the step NAME and its prose header comment to describe both corpora accurately WITHOUT hand-typing counts that rot (say "all starters + ladder apps, roster derived by verify-starters" rather than a number — the script prints the real counts). Do not change the run: command. Sanity: the step's command must remain exactly `pnpm --filter @kitn.ai/ui run verify:starters` so lint:gate-parity still resolves it. Run `pnpm --filter @kitn.ai/ui run lint:gate-parity` after (should stay green — you changed a name, and identifiers derive from run commands; if it goes red, read why before touching anything else). Report briefly: DONE/FILES/VERIFY.
````

### Supervisor message 3 — the policy that produced this section

````text
New standing policy from the owner, applying to every ladder app: the README must include the prompt(s) used to build the application — and if it took more than one prompt, the ENTIRE conversation. You are the right agent to do this because you hold the conversation verbatim in your own context.

Task: append a section to examples/apps/support-widget/README.md (your file, claim re-held) titled "## How this app was built" containing:
1. One short intro paragraph: built by an AI implementer agent (Claude Opus) dispatched by a supervisor session (Claude Fable) as rung 1 of the iteration ladder; the conversation below is the complete, unedited instruction stream the implementer received; independent verification (a separate agent's browser IVP) and the owner's live validation happened outside this conversation and are recorded in the plan's run ledger (link docs/superpowers/plans/2026-08-19-rung-1-support-widget.md).
2. The full text of the brief file you were pointed at (.superpowers/sdd/2026-08-19-rung-1/task-1-brief.md) — reproduce it verbatim in a fenced block, labeled as the generated brief, since that file is gitignored and would otherwise be lost.
3. Every message you received from the supervisor, verbatim and in order, each in its own fenced block with a one-line label (initial dispatch; follow-up: CI step name; this message too — the policy message itself is part of the conversation and the policy says ENTIRE). Do not edit, summarize, or clean them up — verbatim means verbatim, including the parts that are supervision boilerplate.
4. Nothing else — no commentary on the quality of the prompts.

Formatting: keep the existing README content untouched above it; fenced blocks with four-backtick fences if any message contains triple backticks (check — your dispatch did contain code-ish content). Sanity after: the file renders as valid markdown (no broken fences — count them), and `npm run build` in the app dir still green (README isn't compiled, but run it anyway as the cheap regression). Report briefly: DONE/FILES/VERIFY.
````
