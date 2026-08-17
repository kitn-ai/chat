# Parallel work split — three concurrent sessions

Date: 2026-08-16. Written at `2fe008ac`, at a deliberate stop.

Three tracks can run at once. This document exists because the risk in running them
concurrently is not the work — it is **two sessions editing the same file**, and the
one file all three will reach for is `docs/coupling-map.md`.

Read with §14 of `HANDOFF-2026-08-13-attachments-scaffolder-a11y.md`.

---

## The three tracks

| Track | Scope | Brief |
|---|---|---|
| **A — composition catalog** | design only, no production code | `specs/2026-08-16-composition-catalog-brief.md` |
| **B — diagnostic event stream** | `packages/ui/src/wire/` | `specs/2026-08-14-endpoint-choice-design.md` §"The diagnostic event stream" |
| **C — hardening backlog** | guards, scripts, docs, `CLAUDE.md`, the coupling map | `docs/coupling-map.md`, §14.5, §13.12 |

**Nothing here blocks anything else**, with one exception: **issue #99 option B**
(upgrade-property preservation in `defineWebComponent`) is prerequisite for the
platform/CDN target that track A's design depends on. Track A should reference it;
track C may build it. Decide which before starting, or both will.

---

## File ownership — the part that actually matters

Concurrent sessions each need their own worktree AND their own scratch directory. That
is necessary and not sufficient: it does not stop two of them editing the same tracked
file and colliding at merge.

**Exclusive to track C. A and B must NOT edit these:**

- `docs/coupling-map.md`
- `CLAUDE.md`
- `docs/superpowers/HANDOFF-*.md`

When track A or B closes a coupling or adds a guard, it **reports the row** in its PR
body and moves on. Track C folds it in. This is how the same problem was handled
successfully across eight merges on 2026-08-15: every agent was told to leave the map
alone, and one central pass reconciled it.

**Exclusive to track B:** `packages/ui/src/wire/`. Track C's item 29 (the scaffolder
preamble's content-part encoding vs `toOpenAIMessages`) reads this area — it should wait
for B, or coordinate.

**Everything else** is effectively single-owner by subject. Track C's items are scattered
across `packages/ui/scripts/`, `apps/docs/`, and `packages/create-kai/`; they rarely
collide with each other, but two C subagents editing the same script will, so give each
its own file lane in the dispatch.

---

## The coupling map has a pending one-pass edit

`docs/coupling-map.md`'s unenforced list is the durable backlog: **37 numbered items**
(`grep -c '^[0-9]\+\.' docs/coupling-map.md`). Items are cited from outside the file, so
the list's own preamble states the rule: a retracted or closed item **keeps its number**
and says so in place.

Six items are now enforced and their rows still say `NOTHING` — **14, 16, 17, 19, 20,
22** — and item **10** is a tombstone the map says to delete once items 16 and 17 land.
They have landed. So the map is owed:

1. Correct the six rows.
2. Delete item 10 and renumber 11–37, **in one pass**, which is the condition the map
   itself records.
3. Register two new copies: the docs page's `MODEL` and `FINISH_REASONS` literals copied
   from the `vercel-ai-sdk` integration source, and `lint:pack-parse` as a new required
   guard.

**Do this LAST among track C's work**, not first. Every guard C lands makes another row
stale, and renumbering twice wastes the pass.

---

## What §14.5 omits

§14.5 is the start list and it is incomplete in one place: **it does not mention wave 3.**
Those items are not lost — they are in the coupling map — but they are not called out:

- **Tool-version and harness pins**: unenforced items **23–28** (`node-version` agreement
  across workflows; the `VITE` pin and its deliberate divergence from the kit's own major;
  the `typescript@5` pin; harness tsconfig flags vs the real starter tsconfigs;
  `nx.json`'s `build.outputs` completeness; `compiled.css` staleness).
- **Untested runtime paths**, from §13.12: `elements/autoloader.ts` has no test and is
  exactly what `element-manifest.json` feeds; the composed-path a11y probe is wired into
  nothing; the SSR proof is asserted only in PR bodies; two hand-written `.d.mts` files;
  `spike-conformance-control.yml` untouched.

---

## Track C's remaining work, consolidated

Everything below is recoverable from the coupling map, §14.5 and §13.12. Listed together
because no single document currently does that.

**Guards and derived lists** — unenforced items **18** (`verify-scaffold-compiles.mjs`'s
hand-written `FRAMEWORKS`/`EXT`/`PROJECT` vs the `Framework` enum, which is the repo's own
"derive it" rule broken inside the gate that states it) and **21** (a facade in
`src/elements/` that `register-impl.ts` does not import); the scaffolder **event and
attribute** gap, items **30** and **31**, where the live test synthesizes the event itself
so the emitted listener hears the name the test chose; `GENERATED` completeness — nothing
asserts that array is complete, which is why `element-manifest.json` sat uncovered, and
its self-test synthesizes its own list so it cannot catch the class; and guard self-tests
for `packages/create-kai/scripts/`, which have none, plus `verify:pin` and `npm run smoke`,
which are in no workflow (item **13**).

**Scaffold signature quality** — six signatures still prove catalog prose rather than a
generated route: `vercel-ai-sdk`, `langgraph`, `cloudflare`, `ollama`, `mastra`,
`pydantic-ai`. Measured two independent ways during #264.

**Docs rot** — `gpt-4o` still on `connect-any-model.mdx` (5×), `langgraph.mdx` and
`pydantic-ai.mdx`; `harnesses.mdx:86` still iterates `stream.textStream`;
`src/schemas/index.ts` carries two hand-typed counts directly above the literals they
count.

**The doc-sample-vs-source guard** — costed at roughly a day during #268: pair each
integration page to its `webRoute` by slug, parse both with the TS compiler API, assert
per-case structural equality, land as a medium-confidence finding first with an opt-out
for pages that legitimately elide. It would have caught the #268 defect *and* validated
its fix, on a page class that recurs with every new integration.

**`CLAUDE.md`** — the fake-green trap (§14.3); `lint:pack-parse` documented beside
`lint:silent-drops` and `lint:cdn-pins`; and `npx @kitn.ai/ui mcp`, which is wrong — there
is no `mcp` subcommand, the sole bin is `kai-mcp` and `argv` is never read.

**`create-kai` is broken in production** — see the catalog brief §10. **Narrow the menu;
do not rebuild it.** The catalog defines the axes, and building it twice is the trap.

**Four open issues**, all triaged by label only, no decision recorded in prose: **#99**
(the gap is measured — the scaffolder uses `elementsReady` in zero files and hand-rolls
`whenDefined` in two; four starters hand-roll it), **#106**, **#100**, **#224**.

**`noUncheckedIndexedAccess`** is off in `packages/ui/tsconfig.json`. With it on, the
`SIGNATURE[i.id]` vacuity that #264 fixed would have been a compile error. Enabling it
repo-wide is its own piece of work and would close a class rather than an instance.

---

## Standing method, all three tracks

Delegate file-touching work to subagents in isolated worktrees, each with its own
scratch directory. **Implementer and verifier are always different agents**, and the
verifier writes its own adversarial probe rather than re-running the implementer's — all
three defects found on 2026-08-15 came from probes the implementer had not imagined, and
none of the three was a bug in the change.

Worktree setup is `pnpm install` → `build:css` → `pnpm exec nx build ui`, in that order,
or failures read as a broken checkout. Use `pnpm exec nx`, never bare `nx` — it is not on
PATH in non-interactive shells. Never mask an exit code with `|| echo`, a pipe to `tail`,
or `cmd > log; echo "EXIT=$?"` as two statements. Watch every new check fail before
trusting it.

Merge authority is granted. **Release PR #267 is the owner's** — no track merges it.
