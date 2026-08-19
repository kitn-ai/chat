# Design: the iteration ladder — make it work, then measure it

Date: 2026-08-18
Status: approved in brainstorming, not implemented.

## Why this exists

We built a measurement apparatus before having anything worth measuring. The composition catalog
(#288) ships a scenario deck, a weighted rubric, a run ledger, a drift lint with 71 self-test cases
and gates that fail closed — and no acceptance run has ever produced a number. Meanwhile the one
real experiment we ran said the product's actual gaps were five missing lines of documentation.

The owner has run this sequence to completion once before, on a different component library with a
different harness: **build applications manually, find bugs, fix them, accumulate working examples —
and only then add scenarios and grading to hunt edge cases.** The grading was foundational *because*
the manual phase had already surfaced the real failures. This design reorders our work to match.

The harness is not wrong. It is early. It gets parked, not deleted.

## The evidence this design is built on

One agent built a working chat app from `component_reference` output alone, in a sandbox with the
kit's TypeScript source stripped out. It succeeded — 3/3 behavioural assertions, streaming verified
as 38 strictly-increasing growth steps. Six things it got wrong:

| Failure | Class |
|---|---|
| Missing `import '@kitn.ai/ui/elements'` — blank page, ZERO console errors, `whenDefined` hangs forever | missing one-liner |
| Hand-rolled a structural type; `KaiChatElement`/`KaiConversationsElement` named nowhere | missing one-liner |
| No event payload shapes on any of 9 events | missing one-liner |
| Guessed at the required `scope` field | missing one-liner |
| `scaffold` emitted a second component and wired nothing to it | composition |
| Sidebar slot vs sibling — unanswerable from the MCP | composition |

Four of six are one-liners. That ratio is what sets iteration 1's scope. Verified independently:
zero mentions of `@kitn.ai/ui/elements` and zero import statements across 62 KB of both documents.

## Decisions taken

- **Framework: vanilla TS + Vite for rungs 1–2, reassess at rung 3.** The kit has exactly three
  consumer surfaces: raw `kai-` tags (vanilla, Angular, Vue, Svelte), the generated React wrappers,
  and direct Solid components. **Angular consumes raw `kai-` tags — the same surface as vanilla — so
  it buys structure, not coverage**, while adding a layer that can make its own quirks look like kit
  bugs. Vanilla keeps attribution unambiguous, which matters most while bug-hunting. Vite + TS also
  resolves the `exports` map identically, and is the exact configuration `verify:consumer` already
  pins, so it is the guarded path.
  By rung 3 (workspace, routing, history) structure starts paying for itself. **Switch then, and
  prefer React**, because the generated wrapper layer is code we could independently get wrong —
  the one surface vanilla cannot reach. DI, routing and layouts are legitimate reasons to switch;
  imports are not, since vanilla has them in full.
- **Real providers, not mocks**, via the owner's OpenRouter key. A widget that fakes its stream does
  not prove the wire works.
- **The `compiles` gate's not-applicable branch is deleted, not fixed.** Verification found it
  unsound: an S1 run producing zero output files scored 8.93/10 and exited 0, where it previously
  hard-failed, because an unlabelled code fence is indistinguishable from no code. The branch was
  justified by S6/S7 (refusal and diagnosis scenarios) — which carry no external mechanical dimension
  at all, so the benefit is unreachable while the cost lands on S1/S2/S4. Removing it is less code and
  restores the hard error.

## Iteration 1 — the one-liners

Scope, all in `component_reference` and `scaffold`:

1. A **`### Getting the element`** section at the top of every element document: the registration
   import and the per-element path. This is the top-ranked finding; the failure is completely silent.
2. The **TypeScript interface name** per element, derived from the tag by convention — generated,
   never hand-typed.
3. **Event payload shapes** on `### Events`, derived from the TS types. All nine events currently
   carry prose and no shape.
4. An **index / discovery affordance**. Today `name` has no enum and nothing answers "what exists".
5. **Factor out the universal records** (~11 KB repeated across all 80 elements). The demo settled the
   open question about payload size: the problem was never length, it was absence.
6. **`scaffold` wires multi-component surfaces**, or emits an honest `NOT WIRED` comment naming the
   property and listener it omitted.

**Acceptance:** re-run the demo — same sandbox, source stripped, a fresh agent with no prior context —
and items 1-4 must not recur. We hold the prior run as a baseline, so this is a real before/after
rather than an impression. Contamination must be controlled: subagents inherit the project
`CLAUDE.md`, which states four of the seven invariants, so the measuring agent must not receive it.

## Iteration 2+ — the ladder

Build real applications of increasing complexity. Each rung exercises a component family, fixes the
bugs it finds, and leaves a working example behind.

| Rung | Application | Exercises |
|---|---|---|
| 1 | Support widget | the smallest real surface: docked placement, submit, streaming |
| 2 | Voice assistant | audio visualizer, voice input/output |
| 3 | Workspace | conversation history, sidebar composition, thread switching |
| 4 | Lovable-style builder | artifacts, preview panel |
| 5 | Remote cards | generative UI, card envelopes, the untrusted-output boundary |

**The ordering principle is component coverage, not how impressive the app is.** The voice rung
exists for the visualizer and voice I/O; the artifacts rung for artifacts and the preview panel; the
remote-cards rung for the generative-UI envelope and the untrusted-output boundary. **If a rung does
not light up a component family we have not exercised, it does not earn a slot.** Order is otherwise
provisional and complexity-ascending.

**Each rung is done when:** the app runs against a real provider, it is checked in, and it builds in
CI. Without the CI step, rung 4 silently breaks rung 1 and we are back to examples that used to work.

**The ladder is complete when every component family has been driven by a real application** — not
when we run out of app ideas. That is the exit condition, and it is what makes coverage the ordering
principle rather than taste.

## Working method

**Every ladder app's README records its own build provenance** (owner policy, 2026-08-19): the
prompt used to build it — and when it took more than one prompt, the entire conversation,
verbatim, including the generated brief. The apps are the corpus for measuring what the kit
teaches, so the instruction stream that produced them is part of the artifact.

One rung at a time: build, verify, fix, then the next. Because the work is deliberately sequential
there is nothing to isolate, so **each iteration is a plain branch off `main` in the main checkout**,
not a worktree. Worktrees are for concurrent writers; a fresh one costs three setup steps and has
repeatedly failed in a way that reads like a broken checkout. Implementation is delegated and then
independently verified, with verification scaled to the change rather than applied uniformly.

## Explicitly not doing

- **No stripping mechanism.** Removing a component from a working app needs a dependency graph nobody
  maintains, and there is no evidence it is needed. Revisit only if dogfooding demands it.
- **No *additional* example corpus.** Four already exist — 8 framework starters, 2 demos, 4 app-clone
  Labs stories, 116 docs pages. The ladder does leave a working app behind at every rung, and those
  apps ARE the archetype examples — but they land in ONE home, absorbing or replacing what overlaps,
  never alongside it. Deciding that home is the first task of the iteration-2 plan, not a new build.
  A fifth parallel corpus is a liability; a consolidated one is the point.
- **No acceptance runs, no tier delta.** Parked until the ladder has produced something worth grading.
- **`registers` and `streams` stay unimplemented.**

## Scope of the first implementation plan

This spec covers iteration 1 **and** the shape of the ladder, because the ladder is what makes
iteration 1 the right scope. Only **iteration 1 goes into the first implementation plan.** Each rung
of the ladder is its own spec → plan → build → evaluate cycle, written when the previous rung's
findings are in hand. Planning rung 3 before rung 1 has run would repeat the error this design exists
to correct.

## Candidate iterations — logged, not scheduled

Both found while doing other work. Each is small, independently verifiable, and does not belong in
iteration 1. Neither should be started without being scheduled deliberately.

### A. The MCP does not validate its arguments

The tool schema declares `additionalProperties: false` and **does not enforce it**. A wrong argument
key silently returns the 80-element index instead of an error. Confirmed independently twice, and on
2026-08-18 it cost a real agent a debugging cycle: a verification probe passed `element` instead of
`name`, got plausible output back for two different elements, and only noticed because the two
answers were byte-identical. This is decide-loudly broken on the MCP's own surface — the tool that
exists to make agents fluent returns a confidently wrong answer to a typo.

Bundle with its sibling: `npx @kitn.ai/ui --version` starts a JSON-RPC server and **hangs on a pipe**,
because `bin/mcp.js` never reads `argv`. Those are the flags someone reaches for when an MCP config
is broken, so the failure lands on people already debugging.

**Verify by:** driving the built bundle over stdio with a wrong key and asserting a refusal, plus a
positive control that the right key still answers. Watch the refusal fail before trusting it.

### B. The package ships 2.83 MiB of unreachable TypeScript source

Measured 2026-08-18 from a real `npm pack`: 12.15 MiB unpacked against `verify:pack`'s 12.50 MiB
ceiling — **97%**. `dist/` is 8.32 MiB across 525 files; `src/` is 3.40 MiB across 326, of which
**131 `.ts` + 177 `.tsx` = 2.83 MiB that no consumer can reach**:

- **zero source maps in `dist/`**, so it is not shipped for debugging — the usual justification;
- the `exports` map reaches exactly two files under `src/` (`element-meta.json`, `icon-names.json`);
- `verify:dts` already asserts all emitted declarations reference nothing outside `dist/`;
- demonstrated, not inferred — the demo sandbox deleted every `.ts`/`.tsx`/`.css` from the installed
  `src/` and both module resolution and the MCP worked.

Same class as the `derived.json` fix: shipped because `files` says `"src"`, not because anything
needs it. Removing it takes the package from 97% of the ceiling to roughly 75%.

**Check first:** whether anything outside `dist/` references `src/elements/element-types.d.ts`
(262 KiB). `verify:dts` is scoped to emitted declarations, so it does not answer this — confirm it
directly rather than inferring from that guard.

**Verify by:** the same method that verified the `derived.json` removal — pack, confirm absence,
install the tarball into a throwaway app, and drive the MCP and a real import through it. Grep is not
sufficient evidence here; execution is.

Separately and not part of B: `dist/` carries two Solid chunks at 754 KiB and 656 KiB. Multiple entry
points each bundling the component set is expected, but 1.4 MiB across two looks like duplication
rather than necessity. That is its own investigation, not a packaging fix.

### C. Process guards — enforce the coordination rules the same way we enforce the code ones

Iteration 1 produced sound code: five tasks, every one independently reviewed, every finding real.
**Nearly every mistake in that session was the orchestrator's, not the code's** — and the expensive
ones, because a coordination error voids a measurement run or forces rework rather than failing a
test. The code rules in this repo are enforced by scripts precisely because prose failed
(`lint:silent-drops` exists because a comment explaining a silent drop shipped unchallenged). The
**process** rules are still prose.

Five candidates, each smaller than guards this repo already runs:

1. **Artifact freshness.** Any harness that measures a built artifact records its hash and mtime, and
   fails when a source it claims to measure is newer. The 2026-08-18 demo ran against a `dist/` built
   15 hours before the tool it was measuring changed, and its top three findings were exactly what the
   newer code already fixed. The whole run was worthless and nobody noticed until afterwards.
2. **Documented-gate parity.** Every command in a doc's "gates" list must appear in the CI workflow,
   and every required CI step must appear in the list. The composition-catalog handoff said "every gate
   is green" and listed five commands; the required `test` job had been red on `verify:pack` the entire
   time, because that command was not in the list. Same shape as `lint:cdn-pins`, which already asserts
   doc literals against the source of truth.
3. **A writer lock.** The plan's workspace holds a file naming the live implementer and the files it
   owns; the controller and every agent check it before writing. Twice in one session the controller
   put two writers on one file — once committing to a branch after telling an implementer it was the
   sole writer, once resuming a fix into a file another implementer held. Neither cost anything, and
   both were caught by the people involved rather than by anything structural.
4. **One brief template.** The standing prohibitions (no `git checkout`/`reset`/`stash`, no rebuild, no
   subagents, watch every test fail first) live in one template rather than being retyped per dispatch.
   They were present in every implementer brief and absent from every reviewer brief, and a re-reviewer
   duly checked a file out into a live working tree to verify a red/green.
5. **Thresholds cite their derivation.** A numeric threshold in a plan or test carries either the
   command that produced it or an explicit "ratchet, not a target" label. The `<6000` byte budget in
   iteration 1 was invented while drafting; it survived only because the implementer refused to weaken
   the assertion and reported the measured number instead.

**Not mechanizable, and worth stating so it is not mistaken for covered:** asserting something without
looking it up. The claim that a merge conflict was "almost certainly the release-please version bump"
was wrong — there was no version conflict at all, and acting on it would have silently unwired a
generator. No guard prevents that. Reading before asserting is the only control, and the same session
shows it working: reading the code before writing the plan is what caught that `kai-chat → chat` is the
wrong import derivation for 10 of the 80 elements.

**Sequencing:** after iteration 1 lands, before the ladder starts. The ladder is five more rungs of
exactly this coordination.

## Risks

- **The ladder finds component bugs, not documentation bugs.** That is a feature — it is what the
  manual phase is for — but it will make iterations 2+ take longer than they look.
- **Real providers cost money and introduce flake.** Rung acceptance must not depend on a live model
  in CI; record fixtures from real runs and replay those in CI.
- **Examples rot.** Mitigated only by the CI build step, which is therefore not optional.
