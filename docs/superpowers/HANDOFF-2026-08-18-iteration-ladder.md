# Handoff: the iteration ladder, after iteration 1

Date: 2026-08-18
Status: **iteration 1 MERGED** (#290). Rung 1 not started.
Written for a fresh session with no prior context.

## 1. The one thing to understand first

We built a measurement apparatus before there was anything to measure. The composition catalog
(#288) ships a scenario deck, a weighted rubric, a run ledger and gates that fail closed — and no
acceptance run has ever produced a number. Meanwhile the only real experiment we ran said the
product's actual gaps were five missing lines of documentation.

The owner has run the correct sequence to completion once, on a different component library with a
different harness: **build applications manually, find bugs, fix them, accumulate working examples,
and only then add scenarios and grading.** The grading was foundational *because* the manual phase
had surfaced the real failures first.

So the plan is now a **ladder of real applications**, and the harness is **parked, not deleted**.
Spec: `docs/superpowers/specs/2026-08-18-iteration-ladder-design.md`. Read it before anything else.

## 2. What iteration 1 shipped (#290, merged at 4e69c824)

Five tasks closing the gaps an agent hit building a chat app from MCP output alone:

| # | Change |
|---|---|
| 1 | `### Getting the element` — first section on all 80 elements: the registration import, the per-element import, the shipped TS interface name |
| 2 | Event payload shapes. The manifest already typed ~126 events; the renderer printed only the sentence |
| 3 | The `name` parameter now says the element index exists and how to reach it |
| 4 | Dedup: invariant bodies and recipe notes moved to `{name:"invariants"}` / `{name:"recipes"}` appendices. **18,059 → 9,223 shared bytes (−49%)**, nothing deleted |
| 5 | Composition decided: `kai-conversations` goes in `<kai-chat>`'s `sidebar` slot, recorded in the authored `workspace-chat` recipe, emitted by `scaffold` with real wiring |

Plus a post-review fix: the emitted conversation row was written once and never updated
(`title`/`messageCount`/`lastMessageAt`/`updatedAt` all inert). Now synced in the turn's `finally`,
emitted as a worked example of `reactivity-two-halves`, guarded by a test that runs the emitted
module and reads the rail's **shadow DOM**.

### Corrections found in review, worth remembering

- The per-element import **cannot** be derived by stripping `kai-` — wrong for **10 of 80**
  (`kai-conversations` → `conversation-list`). Read `element-manifest.json`'s `tags`.
- `kai-remote` is deliberately outside the register-all bundle (79 tags, not 80).
- A bare `CustomEvent` type means a **void** payload. Passing it through rendered
  "Carries no detail. `detail`: `CustomEvent`" on 13 events.
- The recipe note claimed `<kai-chat>` owns collapse and a responsive breakpoint. It owns neither.

## 3. Next: rung 1, the support widget

Smallest real surface: docked placement, submit, streaming, **no conversation history**. Vanilla TS
+ Vite. Real provider via the owner's OpenRouter key (mock for the body of the work, real provider
once at the end to validate the route and `encode.ts`).

**Each rung is done when** the app runs against a real provider, is checked in, and builds in CI.
**Ordering principle is component coverage, not how impressive the app is.** The ladder is complete
when every component family has been driven by a real application.

Rungs after: voice + visualizer → workspace with history → artifacts preview → remote cards.

## 4. Banked findings — real, deliberately NOT fixed in iteration 1

Found by RUNNING the emitted app. None is a defect in what merged.

- **`<kai-chat>`'s slotted sidebar is fixed-width by design.** Resize, collapse and the responsive
  breakpoint live on `<kai-workspace>` (`sidebarWidth`/`Min`/`Max`, `sidebarCollapsed`,
  `collapseBelow`, `toggleSidebar()`/`collapseSidebar()`/`expandSidebar()`). For
  `placement: full-page` + chat + conversations, `<kai-workspace>` is probably the right emission —
  at the workspace rung, where that is the point. **Not everything should become a workspace.**
- ★**Rename is not supported by any element.** No rename event on `kai-conversations` or
  `kai-workspace`. A component gap, not a scaffold gap. `kai-editable-label` already ships.
- **`Labs/Workspace Slots`** (`src/elements/workspace-slots.stories.tsx`) is the layout the owner
  expects of a chat app: grouped history (Today/Earlier), real titles + counts + dates, `chatTitle`,
  and the `sidebar-header` / `main-header` / `sidebar-footer` slots filled. Use it as that rung's target.
- **UNCONFIRMED:** a browser probe suggested `sidebarWidth` did not take (set 280, then 400; rendered
  480 = the `sidebarMaxWidth` passed). The probe was unreliable and the declared default reads `26`,
  hinting at rem not px. **Verify properly before filing.**
- `kai-conversations` is in no capability group, so `verify:scaffold` compiles no surface containing
  it. The missing cells were hand-compiled 48/48 clean. Fix is a preset in `archetypes.ts` — read the
  `WHY NOT THE POWER SET` comment first.
- The emitted JSX import list is correct but pinned by no test; a regression is a consumer `TS2304`.
- `@kitn.ai/ui/react` cannot express `slot` on **any** element — `WebComponentProps` has no `slot`
  and the runtime forwards only ref/className/style/id/children.
- Five docs pages publish the sibling composition. **Docs are known-stale** — the maintained surface
  has been Storybook, and a docs pass is planned. Reconcile docs → catalog, not the reverse: the
  catalog is machine-checked against the tree (`lint:catalog-drift` touches no `.mdx`) and the docs
  are not.

## 5. Candidate iterations (logged in the spec, not scheduled)

**A.** The MCP does not enforce `additionalProperties: false` — a typo'd argument key returns the
80-element index instead of an error. It cost a real agent a debugging cycle. Bundle with
`npx @kitn.ai/ui --version`, which starts a JSON-RPC server and hangs on a pipe.

**B.** The package ships **2.83 MiB of unreachable TypeScript** — no source maps, two `src/` files in
the exports map, and a sandbox that deleted every `.ts`/`.tsx` still worked. 12.15 MiB against a
12.50 MiB `verify:pack` ceiling; removing it takes you to roughly 75%.

**C.** ★**Process guards.** Iteration 1's code was sound; nearly every mistake was the orchestrator's,
and those are the expensive ones because a coordination error voids a run rather than failing a test.
Five mechanizable: artifact freshness, documented-gate parity, a writer lock, one brief template,
thresholds that cite their derivation. **Sequence this before the ladder** — the ladder is five more
rungs of the same coordination.

## 6. How this session was run, and what it cost

Subagent-driven: a fresh implementer per task, an independent reviewer after each, a whole-branch
review at the end. **Two fix rounds across five tasks. Two coordination errors, both the
controller's, both caught by subagents rather than by the controller. One plan defect** (a test
predicate that would have passed for the wrong reason) caught by an implementer. **One invented
threshold** (`<6000` bytes) overturned by measurement.

Fifteen rulings, recorded with their reasoning and cost-if-wrong. The three that mattered: extending
Task 5 to decide composition; overturning my own byte target; and stopping the expansion of
iteration 1 when it started drifting toward "make this app good", which is a rung, not an iteration.

**The pattern worth keeping:** every substantive correction came from someone refusing to paper over
a mismatch — an implementer that left a test red rather than relax it, a reviewer that checked the
built bundle instead of accepting an argument, and the owner opening the app and seeing in two
minutes what fourteen tests could not say.

## 7. Working method

- **A plain branch off `main` in the main checkout per iteration. No worktree.** Worktrees are for
  concurrent writers; the ladder is deliberately sequential. A fresh worktree needs three setup steps
  and has repeatedly failed in a way that reads like a broken checkout. (There are ~194 stale
  worktree registrations; a deliberate cleanup pass is owed.)
- Delegate implementation; verify with a different agent that writes its own adversarial probes.
- **Never run `nx test`** — this repo's nx cache has returned wrong verdicts in both directions.
- Never run `verify:generated` concurrently with a vitest run.
- The required gate is CI's `test` job. A local five-command list is not the gate — that mistake is
  what let `verify:pack` sit red while a handoff said every gate was green.

## 8. Open decision

The owner asked to be told when to try **Fable as orchestrator** instead of Opus 5. The trigger:
**start of rung 1, after Candidate C's guards merge** — so only one variable moves. Baseline to
compare against is §6. Do not switch mid-branch. See the `orchestrator-model-experiment` memory.
