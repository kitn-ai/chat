# HANDOFF: attachments, scope boundary, and the 0.22.0 hold

Written 2026-08-12, end of session. **Read `HANDOFF-model-driven-components.md` first** — it is the
project-facing document and was refreshed today against `origin/main`. This file is the delta since
that refresh, plus the in-flight state a cleared session would otherwise lose.

Verify state from the repo, not from this file. `git log --oneline origin/main` and
`gh pr list --state open` answer what actually landed.

---

## 0. Do this first

1. **`gh pr list --state open`** — check whether the two in-flight agents (§3) left branches.
2. **Read §3 in full before dispatching anything.** Both agents' briefs are reproduced there verbatim
   because a session clear kills in-process subagents; if their work is gone, re-dispatch from §3
   rather than reconstructing intent.
3. **The 0.22.0 release is deliberately held** (§2). Do not publish it until the text-attachment work
   lands. That is Rob's explicit sequencing decision, not an oversight.

---

## 1. What shipped today

**Published: `@kitn.ai/ui@0.21.0`**, via release-please #146, CI + OIDC trusted publishing. `latest`
points at it.

**npm hygiene, all measured rather than assumed** — 10 of 12 published versions are now deprecated in
three defect classes, each verified per version rather than inferred from a changelog:

| versions | defect | how it was verified |
|---|---|---|
| 0.14.1 → 0.15.1 | ship raw TypeScript as the package entry | read `exports["."]` → `./src/index.ts` |
| 0.16.0 → 0.19.0 | registration chunk absent from `sideEffects` → blank page | pulled each tarball, confirmed the hashed `register-impl-*.js` physically exists while going unlisted |
| 0.20.0 | root entry throws on server import | probe that goes RED on 0.20.0 and GREEN on 0.20.1 and 0.21.0 |

**0.20.1 and 0.21.0 are the only clean versions.**

**Fourteen PRs merged.** The ones with lasting consequence:

- **#186 `feat(wire)!` — attachments actually reach the model**, across three layers: the encoders
  walk `file` parts (`wire/files.ts`); five of eleven integrations stopped assuming `message.content`
  is a scalar (`anthropic`, `vercel-ai-sdk`, `mastra`, `pi`, `pydantic-ai` — `langgraph` coerces null
  only and passes arrays through, recorded as *untested, not broken*); and `default-input.tsx` stopped
  producing attachments its own encoder would reject. **Breaking:** `OpenAIWireMessage.content` widened
  from `string | null`, which breaks a consumer doing `msg.content.trim()`. Marked `feat(wire)!` at
  squash time so the CHANGELOG carries it.
- **#180 — the scaffolder emitted the root entry for Solid, and a test pinned it there.** Two things
  kept it alive: `src/solid.ts` is `export * from './index'`, so `./solid` is a strict superset and tsc
  is structurally blind; and `scaffold.test.ts` asserted the *wrong* specifier by name, so fixing the
  bug would have turned an existing test red.
- **#171 — conformance locator selects the assistant bubble by speaker, not position.** `bubbles().last()`
  resolved to the *echoed user prompt* until the assistant's first delta. S17 passed vacuously for its
  entire existence; **S16 was inverted** (wiping the assistant's message removes its row, so `.last()`
  fell back to the user echo and the check passed hardest in exactly the case it existed to catch);
  and **S04's whole final-answer assertion was satisfiable by the user's own prompt**, which named the
  three cities it searched for.
- **#173 — `verify:ssr` now server-renders** (127 components on `.`, 166 on `./solid`) instead of only
  importing. Zero real violations on the clean tree, which is a genuine negative: the same harness went
  red on planted canaries minutes earlier.
- **#174 — five timing measurements were taken on a box with four hidden pinned cores.** See §5.
- **#187 — `storybook-gate` was never a required check.** Three places in `test.yml` called it "the
  single required status context"; the ruleset returns exactly `[{"context":"test"}]`.

---

## 2. The release is held, on purpose

**release-please #179 (0.22.0) is open and must NOT be published yet.**

#186 left a deliberate behaviour change: **`text/plain`, `text/markdown` and `text/csv` now raise
`WireEncodeError`** where they were previously dropped silently. Nothing that worked breaks — those
files never reached the model — but a user dropping `notes.md` into the shipped composer now gets an
error.

Rob's decision: **merge #186 → build text-as-text support → then publish.** No released version should
ever error on a dropped `.md`. The work in §3.1 is what clears the hold.

---

## 3. In flight when the session ended

Two subagents were running. **A session clear kills them.** Check for their branches first; if absent,
re-dispatch from the briefs below.

### 3.1 Attachment policy — the work that gates 0.22.0

**Two product decisions already made by Rob. Do not re-litigate:**

1. **Text files are SENT AS TEXT CONTENT**, not thrown. Structural, not a preference: the Anthropic
   content-block set is `text` / `image` / `document` with **no arbitrary-file block**, so text is the
   only representation the wire can express. Both `toOpenAIMessages` and `toAnthropicMessages`.
2. **An attachment filter declared ONCE and enforced at BOTH layers** — the composer (pick-time
   feedback) and the encoder (what reaches the model). He explicitly rejected pick-only and encode-only.

**★ The constraint that shapes the design:** the set of types *accepted* and the set that *become text*
are the same knowledge. If each grows its own list they drift — the duplicated-fact failure this repo
keeps hitting, and precisely the defect #186 fixed one layer down. **One declaration, derived from in
both places, never restated.**

**Scope, after Rob's directive (§4) cut it down:**

- **DROPPED — the size cap, entirely.** Not a decision to present; it is out. No byte limit, no
  truncation path, no configurable cap. Rob's reasoning was sharper than mine: *a configurable cap is
  still policy machinery.* The kit imposes no size or count limits today (audited: the only hardcoded
  cap anywhere is a 200-entry composer undo stack, an internal memory bound, which stays). So there is
  nothing to remove — just nothing to add.
- **KEEP — text-as-text encoding.** Correctness in code the kit already owns.
- **KEEP, as the centrepiece — expose the encoder's capability set as a readable value.** Tells a
  developer what the kit CAN do and lets them decide what to allow; they can build their own picker,
  validation and error copy without our composer. May *be* the single declaration both layers read,
  making the filter derived rather than parallel.
- **KEEP, minimal and declarative — the filter**, derived from the capability set. **The
  predicate-function option is dead**: a predicate is a policy hook, and policy belongs to the app.

**Design against: expose information, don't make decisions** — where a developer needs a fact to decide
(media type, byte size, whether the encoder can represent it), surface the fact; never a knob that
decides for them.

**Two decisions deliberately left open for Rob, to be put to him INDIVIDUALLY** (he asked for one
question at a time, against real code rather than in the abstract):

1. **Exactly which types become text.** `text/*` is the core; `application/json`, `xml`, and source
   files with odd or absent MIME types are judgement calls.
2. **How a text file appears in the message** — a text part prefixed with the filename, or something
   more structured. Worth raising: the Anthropic Files API `document` block accepts **text as well as
   PDF** and supports `citations: {enabled: true}`, returning cited blocks with `char_location` ranges
   into the source. The kit already renders citations (`kai-sources`, the citation row). Richer than
   inlining, at the cost of being Anthropic-specific and needing an upload step.

**Verification the brief demanded:** prove the single declaration is genuinely single by changing it in
one place and showing BOTH the picker and the encoder move — if only one moves, the layers are not
reading the same source. Prove a filtered-out attachment does not reach the wire *using the encoder*,
not the component. Assert a text file on the **encoded output**, not on component state.

**Current state, verified against `origin/main`:** `components/file-upload.tsx` has `accept?: string`
(HTML picker hint) and `kai-file-upload` exposes it; **`elements/default-input.tsx` — the paperclip
inside every `<kai-chat>` — has no `accept` and no filter of any kind**; nothing filters at send time.
Note `accept` is only a picker hint: it does not validate drag-and-drop, does not apply to attachments
set programmatically on `messages`, and has no bearing on the wire.

### 3.2 `CLAUDE.md` — the design principle plus a no-derived-numbers sweep

Two parts, both on root `CLAUDE.md`, matching its existing terse voice.

**Part 1 — add the scope principle** near the existing "Behaviors are prop/JSON-driven" line. **Do not
write the slogan** "expose information, don't make decisions" — it does not survive contact, because
defaults are decisions and good defaults are most of a component library's value. Write the
**how/whether split** plus the checkable test: *does this prop or default decide something that lands
on an invoice or in a policy document?* Plus the corollary: a silent drop, truncation, swallowed error
or fallback is a decision made while withholding the information that it happened.

**Part 2 — sweep the file for numbers a script can produce.** A stale `528` scaffold count rotted there
because it was derivable (the gate prints it, and the axis had changed from archetypes to surfaces).
Prefer deleting the number and naming the command that produces it. **Two traps:** the timing figures
(`~11s`, `32.6s`) carry an explicit contamination caveat — preserve the correction's meaning rather
than deleting the caveat with the number; and any figure that is part of a **historical** before/after
measurement must not be updated, because bumping it falsifies the measurement. Record the rule itself
in one line so nobody reintroduces a count.

---

## 4. Rob's scope directive — the most durable thing from this session

Unprompted and emphatic: **"I definitely do not want scope creep… We're just a set of components and
that's really kind of an application-layer decision, not a component framework decision."**

**The kit decides HOW** — how a message renders, how SSE parses, how focus moves, what the wire can
represent, how a card validates. **The app decides WHETHER** — whether this file is allowed, whether
this user may act, how much may be spent, what is retained, how many is too many.

The test: **does it land on an invoice or in a policy document?**

He arrived at this by cutting a size cap I proposed, including the developer-configurable version.
Full reasoning and the applied examples are in the `component-scope-boundary` memory.

---

## 5. Two contaminated-measurement findings, both still live

**Four orphaned `while :; do :; done` processes pinned four of ten cores from Aug 11 22:10 to Aug 12
10:05.** They were load generators from a *completed* flake-hunting script whose cleanup `kill` was a
silent no-op — `LOADPIDS=$(jobs -p)` ran in a subshell, so it had no jobs to kill. Five sets of timing
figures were recorded inside that window and are corrected in #174.

**The `--maxWorkers=4` recommendation was BACKWARDS, not merely unverified.** Re-measured: the curve is
monotonic and the default (9) sits at the flat top — 4 workers is 1.34x slower, 2 is 2.18x slower. The
argument that survives regardless of conditions: the box was *loaded*, which is what most favours
**fewer** workers, and fewer still lost at every value. A quiet box only widens the default's margin.
The old figure (395.6s, 6 failures) **does not reproduce at all** — measured 43.9s with 0 failures, and
four pinned cores cannot produce a 9x gap, so it was measuring something else entirely.

**`packages/ui/scripts/measure-timings.mjs` exists** — it captures its own conditions before and after
each run, discards runs whose bracket moved, reports min/median/max over ≥3 iterations, and traps its
load generators dead. **A true idle baseline was never achieved** and every figure is labelled non-idle:
the two Claude session processes are themselves a large fraction of the load. Re-run it on a genuinely
quiet machine.

---

## 6. The board

Tasks carried in the session task list, most consequential first:

1. **Text-file attachments as text content** — gates 0.22.0. §3.1.
2. **Attachment filter, one declaration, both layers** — shares §3.1's surface; must not grow a second list.
3. **Lint for silent drops, truncations and swallowed errors** — deliberately deferred until after
   0.22.0. **Build it as a lint rule, not a one-time sweep** — a rule that fires forever beats an audit
   that finds five things once. The broad "whether vs how" review of every existing prop is **explicitly
   dropped, do not revive**: apply that test to NEW props at review time, where it costs nothing.
4. **Re-measure the timeout budget** on a genuinely quiet box (§5).
5. **Sequence the starter import fixes** — `examples/starters/solid/src/App.tsx` imports the root entry
   while the docs say `./solid`, and `examples/README.md` documents that as *deliberate*, so two of our
   own documents disagree. Fixing the import alone relocates the contradiction.
6. **`create-kai` v1's remaining seven frameworks** and the coding-agent wiring step. See the
   `create-kai-scaffolder` memory — **"v1 is gated on catalog completeness" is retired**; #97 and #98
   both closed.

---

## 7. Lessons that cost real time today

All are recorded in the `checks-that-prove-nothing` memory (entries 29 and 30) and §5 of the
project handoff. The two worth repeating here because they recurred:

**A claim gains authority at every hop and evidence at none.** Four separate times a measured statement
became an unmeasured one in transit — "the regions are disjoint", the `%2e%2e` attack vector (wrong:
WHATWG `URL` resolves `%2e` as a dot before a handler sees it; the live vector is the encoded slash
`%2f`), the layer-2 route count (five, not three), and the `createObjectURL` bridge mutation. That last
one is the sharpest: **a test file's own comment falsely claimed the bridge called it**, so the mutation
I prescribed was a no-op that would have "proved" the guard worked while proving nothing.

**Verification tooling is not exempt from the failure it checks for.** My quiet-watcher returned exit 0
from both its success and its timeout path, so the harness reported "completed" and I nearly read it as
"quiet reached". The measurement script's first cleanup used `pgrep -f MARKER`, which matches any shell
whose command line merely *quotes* the marker — including its own supervising shell, so the retry would
have killed the measurement run. Three separate instances today of **the observer being counted as the
thing observed**.
