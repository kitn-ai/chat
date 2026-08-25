# Findings — rung-6 front-door build (compose your own thread)

Comparer analysis of the clean-room builder's app against the kit SOURCE at `9b21f3d4` (the
exact commit the 0.26.0 tarball was packed from, so the working tree IS the reference), the MCP
transcript (`builder-run.md`, which cites `builder-transcript.txt` lines), and the builder's own
gap record (`NOTES.md`, 13 numbered sections). Companions: `builder-run.md` (run metadata, the
13-call MCP table, the direct-read audit, the 22/22 smoke), `app/` (the delivered source),
`smoke/` (the independent probe + screenshots).

Numbering continues rung 5, which ended at F-42. **This rung files F-43 – F-53** (F-53 is a
recorded non-finding — a rung-over-rung closure).

Classes as in rung 5: **teaching gap** · **product gap** · **doc gap** · **builder error** ·
**acceptable variation** · **environmental / upstream** · **recorded non-finding**. Severity
S1–S4 as in rungs 1–5.

## Summary table

| # | Severity | Class / layer | One line |
|---|---|---|---|
| F-43 | S2 | teaching gap (MCP + llms-full) | The composer/prompt-input taxonomy ("composer is bare — reach for `kai-prompt-input` for attachments and send") exists only on the docs page; `component_reference`, `llms-full.txt` and `debug` are all silent, so the builder rebuilt what `kai-prompt-input` already is |
| F-44 | S2 | teaching gap, with a recorded builder error | The builder shipped the exact PR #186 defect — `AttachmentData.url = URL.createObjectURL(file)` — because the data-URI rule reaches no surface it consulted; only the wire's blob:-refusal guard keeps this from S1 |
| F-45 | S2 | product gap (composition) | A standalone `<kai-conversation-item>` emits nothing and has no keyboard activation — by ratified design, but the construction-over-configuration direction and the reference's own wording walk a hand-composing builder straight into it |
| F-46 | S1 | teaching gap (the residual hard core) | The entire `/state` + `/wire` programmatic layer is invisible to every sanctioned surface — `createAssistantStream` scores **zero** in the shipped `llms-full.txt`; `createMockResponder` and its brand-new `toolCalls` support score zero everywhere |
| F-47 | S3 | doc gap | Nothing states that the host resolves a mock-announced tool call (`stream.upsertTool` after the read) — the seam the app-decides-WHETHER boundary requires, stated nowhere |
| F-48 | S3 | teaching gap | `toast()` never adopts a markup-placed `<kai-toast-region>` — two regions result — and nothing says so; the `debug` DB has a toast pattern but not this rule |
| F-49 | S2 | teaching gap (MCP) | No recipe, and no scaffold expressible at all, for a hand-composed thread — the builder had to request a `kai-chat` scaffold its brief forbade and use it as a wiring reference |
| F-50 | S4 | doc gap / app territory | `kai-feedback-bar` placement and lifecycle (per-thread vs per-message, when it appears) stated nowhere; mostly the app's call, worth one sentence |
| F-51 | S3 | doc gap | `theme.css` vs `theme.tokens.css`: the README teaches one, the scaffold teaches the other with a warning the README never makes — unreconciled on the two most-read surfaces |
| F-52 | S3 | product gap (MCP `debug`) | Both `debug` calls missed on exactly this rung's two new mechanisms (third rung running that the DB lags the frontier), and the no-match fallback's own advice points out of the front door |
| F-53 | — | recorded non-finding | Rung-4 F-05 / rung-5 F-35 is **FIXED and exercised**: `createMockResponder` scripted a real tool call through `readOpenAIStream`, verified by the independent 22/22 smoke |

By severity: **S1 ×1** (F-46) · **S2 ×4** (F-43, F-44, F-45, F-49) · **S3 ×4** (F-47, F-48,
F-51, F-52) · **S4 ×1** (F-50). Ten severity-carrying findings; F-53 carries none.

**Catalog running total after rung 6: 50 classified findings across F-01 – F-53**
(rung 4's 24 + rung 5's 16 + this rung's 10; F-19, F-40 and F-53 are the recorded non-findings).

## Headline verdicts

- **THE POSITIVE HEADLINE: the MCP ratio inverted.** `builder-run.md` records **13 MCP calls vs
  7 substantive out-of-bounds reads (~1.9:1 in the MCP's favor)** against rung 5's 13:36 (≈1:2.8)
  and rung 4's 10:37 — the first rung where the front door out-answered the package. Its own
  analysis of the shift holds up against the transcript: `component_reference` answered every
  element-surface question with no follow-up digging on any element, and the shipped
  `llms-full.txt` absorbed what used to hit bundle bytes. Zero minified-bundle reads (rung 5
  `cat`ed a whole dist bundle).
- **The second positive: scale.** Per `builder-run.md`, 44 turns / 6.24 min / $3.59 against rung
  5's 164 turns / 43.8 min / $22.30, with an unprompted self-run Playwright verification and a
  0-fix independent rebuild + 22/22 smoke. Partly a smaller rung (mock-only, no cross-origin
  leg), but the per-question cost of the front door visibly fell.
- **What the inversion isolates is the residual hard core, and it is one coherent cluster: the
  `/state` + `/wire` programmatic layer.** Every `.d.ts` read in the direct-read audit (7 of 7)
  is that cluster — `createMockResponder` options and `toolCalls`, `AssistantStream`'s methods,
  `ModelTurn`/`ModelToolCall`, `AttachmentData`/`ToastItem` — and every one of the builder's
  forced guesses is either that cluster or behavioral glue between elements. The element surface
  is now taught; the programmatic layer is not taught anywhere (F-46). This is rung-4 F-01/F-02
  and rung-5 F-27's shape, now with the rest of the noise stripped away.
- **One builder error this rung, and it shipped**: the `blob:` attachment URL (F-44) — the same
  defect PR #186 shipped, rebuilt from scratch by a careful agent because the rule reaches no
  surface it consulted. Every other NOTES.md guess is a correct reading of the kit (the
  conversation-item click listener, avoiding `toast()`, owning the toast array, the host
  resolving tool calls, `theme.tokens.css`, the flex layout — all verified correct below).
- **A rung-over-rung closure with evidence**: the mock now emits scripted tool calls (F-53),
  which is why this rung could exercise the tool panel without the hand-built SSE framing rungs
  4 and 5 each paid ~100 lines for. The WS1 round-1 fix (#313) landed and works.

## The builder's NOTES.md sections — verdicts and mapping

Each verified against kit source at file:line. Twelve forced guesses across 13 sections
(§5 is a flag, not a guess). **One guess is wrong (§2); eleven hold.**

| § | Question | Verdict on the guess | Filed |
|---|---|---|---|
| 1 | How does a user attach a file in `kai-composer`? | Correct that the element has none — `elements/composer.tsx` has zero attachment surface and its `kai-submit` detail is `{ doc, text, entities }` (line 58), no `attachments`. But the division is **deliberate and documented** — on one surface only (F-43). Hand-rolled picker = acceptable app-layer glue; `<kai-file-upload>` exists and was even looked up (call 13, `builder-run.md`) but is a dropzone, not a composer-row button. | F-43 |
| 2 | What goes in `AttachmentData.url` for a picked `File`? | **WRONG.** `URL.createObjectURL(file)` is the exact anti-pattern: `apps/docs/…/patterns/attachments-flow.mdx:84-91` says "Do not use `URL.createObjectURL`… `toOpenAIMessages` and `toAnthropicMessages` reject a `blob:` URL"; `elements/default-input.tsx` reads files as `data:` URIs and its doc comment (line 108) states why; `scripts/lint-attachment-object-urls.mjs` exists to stop precisely this line growing back into the kit. | **F-44** |
| 3 | Object-URL lifecycle policy? | A careful policy for the wrong object — with `data:` URIs (§2 corrected) there is nothing to revoke. The lint script the builder spotted is the reintroduction guard for §2's defect, not a lifecycle policy. | F-44 |
| 4 | How is a lone `kai-conversation-item` selected? | Correct — `elements/conversation-item.tsx:36-37`: activation "surfaces as `kai-conversation-select` on the surrounding `<kai-conversations>`, **never as an event of this element**". The click listener is the only wiring, and the feared consequence is real: roving tabindex + Enter/Space live in the container's controller, so the hand-rolled rail has no keyboard activation. | F-45 |
| 5 | `createMockResponder` undocumented (flag, not guess) | Confirmed and measured: 0 in `README.md`, 0 in `llms-full.txt`, 0 across `apps/docs/src` — present in the sanctioned corpus only as one emitted scaffold line. The `.d.ts` reads were the only path. | F-46 |
| 6 | Do the default mock replies emit a tool call? | Correct to not depend on it — `state/mock.ts:93` `DEFAULT_MOCK_REPLIES: readonly string[]`, text only. Contents documented nowhere. | F-46 |
| 7 | Who resolves a mock-announced tool call? | Correct — nothing does; `stream.upsertTool(id, { state: 'output-available', … })` after the read is the intended seam, stated nowhere. | F-47 |
| 8 | `toast()` vs a hand-placed region? | Correct to avoid `toast()` — `primitives/toast-store.ts:171-186` `ensureMounted` creates its **own** `<kai-toast-region>` per target and caches it in a module `Map`; it never adopts one already in the markup, so both would render. | F-48 |
| 9 | Where does the composer go relative to `kai-thread`? | Correct, and actually answerable: `elements/thread.tsx:71` documents "fills the height its parent gives it and scrolls internally", which the reference carries. What is missing is a recipe putting the pieces together. | F-49 |
| 10 | `kai-composer` has no send button | Correct — `send()` method + Enter only; the send button belongs to `kai-prompt-input` (`::part(send)`). Same taxonomy sentence as §1. | F-43 |
| 11 | `kai-feedback-bar` placement/lifecycle | No guidance exists (`components/feedback-bar.mdx` states none); the guess (thread-level, shown after a settled turn) is a reasonable app decision. | F-50 |
| 12 | `theme.css` vs `theme.tokens.css` | Correct to follow the scaffold. The conflict is real: `README.md:97` teaches `import '@kitn.ai/ui/theme.css'` and mentions `theme.tokens.css` **zero** times; `scaffold.ts:2306` (and 6 more sites) emits `theme.tokens.css // … use theme.css only for Tailwind-source apps`. | F-51 |
| 13 | Layout contract for shadow-DOM internals | Mostly answered by the per-element references (thread height contract, the toast `--kai-toast-z` documented in the scaffold comment); the residue is F-49's missing recipe. | F-49 |

## Full findings

### F-43 — the composer/prompt-input taxonomy is stated on one surface the builder never reached · teaching gap · S2

The kit's answer to NOTES.md §1 and §10 exists, verbatim, at
`apps/docs/src/content/docs/components/composer.mdx:26`:

> `<kai-composer>` is the bare editing surface — no send button, suggestions, or attachments.
> … For a drop-in chat composer with a send button, toolbar, and attachments, reach for
> `<kai-prompt-input>`, which is built on this.

That sentence never reaches the front door the builder used. The `component_reference
kai-composer` output and the `llms-full.txt` composer section (line 881) are a props/events
table with no pointer; the element's own source doc (`src/elements/composer.tsx`) carries no
"reach for prompt-input" note, which is *why* the generated surfaces can't carry it — both
derive from the source. `debug`, asked the exact question (`builder-transcript.txt` line 63),
matched nothing (F-52). So the builder — which had `kai-prompt-input` in the element list from
call 1 — concluded from the composer reference alone that the picker must be the host's, and
rebuilt a paperclip + hidden `<input type=file>` + staging tray around the bare element. It even
looked up `<kai-file-upload>` (call 13) — the kit's actual pick affordance — and reasonably
passed on it, since it is a dropzone, not a composer-row button, and its Solid-only
`FileUploadTrigger` never made it into element land.

**Not a product gap.** The bare-composer / batteries-included-prompt-input division is the kit
deciding HOW, and it is a good division; the brief named `kai-composer`, so building glue was
the right response. The defect is that the taxonomy's one sentence lives only where a
doc-browsing human finds it. *Fix direction: add the pointer sentence to the element doc comment
in `src/elements/composer.tsx` (it then flows into `component_reference` and `llms-full.txt`
via `build:api`), and a `composer-attachments` entry in the `debug` DB.*

### F-44 — the builder shipped `AttachmentData.url = URL.createObjectURL(file)` — PR #186, rebuilt from scratch · teaching gap S2, with a recorded builder error

`app/src/main.ts` (the file-input change handler):

```ts
const url = URL.createObjectURL(file);
objectUrls.set(id, url);
return { id, type: 'file', filename: file.name, mediaType: …, url };
```

This is, line for line, the defect the kit has an entire lint guard against.
`scripts/lint-attachment-object-urls.mjs`'s header: "THE DEFECT, in one line:
`url: URL.createObjectURL(file)` … PR #186 shipped exactly that — a user turn carrying only an
attachment reached the model as nothing at all." The correct pattern (a `data:` URI for every
file) is implemented in `src/elements/default-input.tsx` and documented at
`patterns/attachments-flow.mdx:84-91`, and `toOpenAIMessages`/`toAnthropicMessages` now
**refuse** a `blob:` URL with a written reason (`src/wire/files.ts`).

The independent smoke *confirmed the defect shipping*: the 22/22 pass includes the sent
message's parts carrying `url: 'blob:…'` (`builder-run.md`, verification section). The app works
because it is mock-only — `createMockResponder` never encodes the thread back to a provider. The
moment the "swapping the mock for a real `/api/chat` changes one line" promise in the app's own
comment is exercised, every attachment turn fails. It fails **loudly** — the #186-era wire
refusal is exactly the guard doing its job — which is the only reason this is S2 and not S1.

Where the teaching failed, measured: `createObjectURL` / the data-URI rule appears **zero**
times in the shipped `llms-full.txt` (the only `blob` hits are unrelated audio events, lines
2869/2901) and zero in `README.md`; the `kai-attachments` reference doesn't state it (the
`AttachmentData` doc it derives from doesn't); `debug` asked about attaching a file matched
nothing. The one surface that states it — the docs *pattern page* — the builder never opened: of
the sanctioned site it fetched only `llms-full.txt`. **The builder-error half is recorded**
(ui.kitn.ai pages were sanctioned and the rule was on one), but a rule important enough to have
its own CI lint and a wire refusal belongs on every surface that describes `AttachmentData.url`.

§3's revocation policy is filed here too: it manages a resource the correct pattern never mints.
*Fix direction: state the rule in the `AttachmentData.url` type doc and the `kai-attachments` /
`kai-prompt-input` element docs (→ reference + llms-full via `build:api`); add an
`attachment-blob-url` `debug` pattern — the wire refusal message should also name the pattern id.*

### F-45 — a standalone `<kai-conversation-item>` has no activation contract · product gap · S2

`src/elements/conversation-item.tsx:19-42` is explicit that this is a decision, not an
oversight: the item is "presentational on its own: activation (click, Enter, Space) surfaces as
`kai-conversation-select` on the surrounding `<kai-conversations>`, never as an event of this
element", with the roving tabindex and the button-body semantics run by the *container's*
controller over the item's shadow `data-kai-item-body` (a11y shape ratified 2026-08-20 against
axe's nested-interactive rule).

The builder read this correctly and wired `row.addEventListener('click', …)` on each host. What
it could not recover is everything the container contributes: **the hand-composed rail has no
Enter/Space activation, no roving tabindex, no arrow-key traversal** — the smoke passes because
it clicks. And this rung is precisely the construction-over-configuration story the repo has
ratified as its direction: a consumer composing rows by hand is the *intended* consumer, and the
item is the family's designated construction unit.

Two directions, and they are not equivalent:

1. **Teach it** (cheap, wave 1): the element doc should say plainly that outside
   `<kai-conversations>` the row is inert — bring your own click handler and your own keyboard
   story, or use the container. Today the reference says the row "hands its identity to the
   container's selection contract", which describes the mechanism without warning about the
   standalone hole.
2. **Close it** (kit code, needs an owner decision): the ratified a11y shape does not forbid the
   *item* dispatching an event when its own shadow body is activated — the container could keep
   owning roving tabindex while the item gains a `kai-select`-shaped event that fires on
   body click/Enter/Space. That reopens the 2026-08-20 ratification, so it is deferred, not
   prescribed.

### F-46 — the `/state` + `/wire` programmatic layer is invisible to every sanctioned surface · teaching gap · S1 · the residual hard core

Measured against the tree at the packed commit (and consistent with the builder's greps over
the installed tarball, `builder-transcript.txt` lines 83/90):

| Symbol | `README.md` | shipped `llms-full.txt` | `apps/docs` content | MCP |
|---|---|---|---|---|
| `createAssistantStream` | 0 | **0** | pages exist | not a reference topic |
| `createMockResponder` | 0 | **0** | **0** | 1 emitted scaffold line; `debug` miss |
| `MockTurn` / `toolCalls` scripting | 0 | 0 | 0 | 0 |
| `AssistantStream` methods (`upsertTool`/`abort`/`done`) | 0 | 0 | — | 0 |
| `ModelTurn` / `ModelToolCall` | 0 | 0 | — | 0 |

`llms-full.txt` is an *element* corpus — every `kai-*` tag, zero of the programmatic layer a
hand-composing host must write against. `component_reference` is element-shaped by construction;
`recipes` returns two `kai-chat` compositions; `debug`'s DB has nothing (F-52). So the moment a
builder leaves `<kai-chat>` — this rung's entire premise — the front door has nothing left to
say, and the `.d.ts` files under `dist/` become the real documentation. That is exactly what
happened: all 7 substantive out-of-bounds reads in `builder-run.md`'s audit are this cluster,
and the pivot into them follows the two `debug` misses, repeating rung 5's pivot shape.

The aggravation is timing: `MockTurn.toolCalls` is the **just-shipped WS1 fix** for the
two-rung-old F-05/F-35 — the kit finally has the mechanism (F-53) and no sanctioned surface
knows. *Fix direction: a "programmatic layer" section in the `llms-full.txt` generator
(`build:api`) covering `/state` + `/wire` exports with the mock's `toolCalls` scripting shown;
the same content as a `component_reference` topic (the `recipes`/`list` pattern already supports
non-element topics); a README subsection. The generator extension is small kit-tooling code; the
content should derive from the `.d.ts` the way the element tables derive from the manifest,
not be hand-restated.*

### F-47 — nothing states that the host resolves an announced tool call · doc gap · S3

The mock (like a real provider) frames announce + streamed arguments and stops; the tool part
sits in `input-available` forever unless someone acts. The builder guessed the seam correctly —
walk `result.toolCalls` after `readOpenAIStream` resolves and `stream.upsertTool(id,
{ state: 'output-available', output })` — and that IS the intended shape (it is what the
scaffolded tool-loop integrations do server-side). Executing tools is the app's side of the
kit-decides-HOW / app-decides-WHETHER boundary, correctly; but the boundary itself — "the kit
parses and renders the call; answering it is yours, and this is the call that answers it" — is
written down nowhere a client-side composer can find. One paragraph in F-46's programmatic-layer
section covers it; filed separately so the sentence doesn't get lost in the export table.

### F-48 — `toast()` and a hand-placed `<kai-toast-region>` produce two regions, undocumented · teaching gap · S3

`src/primitives/toast-store.ts:171-186`: `ensureMounted` looks up its module-level
`regions: Map<HTMLElement | null, HTMLElement>`, and on miss **creates** a new
`<kai-toast-region>` on `document.body`. It never queries the document for an existing region,
so an app that placed its own (as this one did, correctly driving it as data) gets a second,
overlapping region the first time any code path calls `toast()`. The builder inferred the risk
and avoided the imperative API entirely — the right call, reached by guesswork. The `debug` DB
even has a `toast-imperative` pattern (`debug.ts:319`), but it teaches the imperative path's
mount timing, not the coexistence rule, and the builder had no symptom to ask about. *Fix
direction: one sentence in the `kai-toast-region` element doc ("data-driven and imperative are
either/or; `toast()` mounts its own region and will not adopt yours"). Making `ensureMounted`
adopt a connected `<kai-toast-region>` already in the document is a defensible product nicety —
deferred, since adoption semantics (which region? whose `toasts` array wins?) need a decision.*

### F-49 — no recipe and no scaffold for the hand-composed thread · teaching gap · S2

The two `recipes` entries (`workspace-chat`, `support-widget-script-tag`) are both `<kai-chat>`
presets, and the scaffolder cannot emit a no-`kai-chat` composition at all — the builder, whose
brief forbade `kai-chat`, still had to request a `kai-chat` scaffold (call 7) and mine it for
wiring idioms. Every individual fact it needed was somewhere (thread height contract in the
element doc, `--kai-toast-z` in a scaffold comment, the reactivity rule in the references), but
the *composition* — thread + composer + staging tray + host module, the exact app this rung
built and the exact residue the ladder-exit verdict named ("one compose-your-own-thread rung") —
exists nowhere as a teachable unit. Same class as rung 3's sidebar-composition gap.

*Fix direction, two tiers: (1) a `composed-thread` recipe in the `component_reference` recipes
catalog whose body is essentially this rung's `app/src/main.ts` shape — cheap, and the delivered
app is a verified donor; (2) a scaffold surface for composed (non-`kai-chat`) placement — real
scaffolder code with a new axis cell in `verify:scaffold`, deferred to its own change.*

### F-50 — `kai-feedback-bar` placement and lifecycle are stated nowhere · doc gap · S4

Per-thread vs per-message, and when it appears/disappears, is genuinely the app's decision
(nothing here lands on an invoice, but "when do we solicit feedback" is product behavior, not
medium). What the kit can cheaply state is its own intent: the component is designed as a
thread-level bar (its events are not message-scoped). One sentence on
`components/feedback-bar.mdx` and in the element doc. The builder's guess (thread-level,
revealed after a settled turn, re-hidden on submit) is a fine default and could be that
sentence's example.

### F-51 — `theme.css` vs `theme.tokens.css` unreconciled between README and scaffold · doc gap · S3

`README.md:97` (and :326, :369) teaches `import '@kitn.ai/ui/theme.css'` and never mentions
`theme.tokens.css`; the scaffolder emits `theme.tokens.css` at seven sites with the comment
"use `theme.css` only for Tailwind-source apps" (`scaffold.ts:2306` et al.). Both are right in
their own context and neither acknowledges the other, so a consumer who reads both — as this
builder did — has to adjudicate. The repo has already paid for the wrong resolution once (the
starter that shipped `theme.css` raw to a browser, losing the Tailwind `@theme` block — the
second-instance rule's own case study), which makes the README the riskier of the two surfaces
to leave as-is. *Fix direction: a two-line "which theme file" note in the README where line 97
sits, matching the scaffold comment's condition (does Tailwind process your CSS?); llms-full
inherits whatever the README/manifest say.*

### F-52 — `debug` missed both of this rung's mechanisms, and its fallback points out of the front door · product gap (MCP) · S3

Both `debug` calls returned "No known failure pattern matched" (`builder-transcript.txt` lines
63, 65): composer file-attach and `createMockResponder` tool calls — exactly this rung's two new
mechanisms, repeating rung 5 (its three misses were *that* rung's two mechanisms) and rung 4's
F-06. The DB's patterns (`debug.ts`) cover the reactivity/registration/SSR classics and
nothing in either of this rung's territories. Structurally: the pattern DB is written from past
support burden, so it lags each rung's frontier by construction — the misses are a leading
indicator of where the next teaching wave belongs, which is exactly how this rung used them.

The sharper edge is the fallback (`debug.ts:458-462`): on no-match it advises checking
`llms-full.txt` "(`node_modules/@kitn.ai/ui/llms-full.txt` or https://ui.kitn.ai/llms-full.txt)".
For this rung's questions that file scores zero (F-46), so the advice sent the builder to a
surface that couldn't answer — and as `builder-run.md` observes, either the shipped
`llms-full.txt` is a sanctioned surface (then F-46's fix makes the advice good) or the front
door's own tool is recommending leaving it. *Fix direction: add `composer-attachments`,
`attachment-blob-url` and `mock-tool-calls` patterns (F-43/F-44/F-46's content in symptom-shaped
form); the fallback stands once F-46 lands.*

### F-53 — recorded non-finding: rung-4 F-05 / rung-5 F-35 is FIXED and exercised

Two rungs paid ~100 hand-built-SSE lines each because `createMockResponder` could not emit a
tool call. In 0.26.0 (`state/mock.ts:118-127`, the WS1 round-1 fix, #313) `MockReply` accepts a
`MockTurn` with `toolCalls`, framed announce-then-arguments with
`finish_reason: 'tool_calls'` exactly as a provider frames it. This rung's builder used it —
`app/src/main.ts` scripts a `search_docs` call on turn 3, zero hand-built frames anywhere in the
app — and the **independent** smoke verified the call renders `output-available` through the
real `readOpenAIStream` path (22/22, `builder-run.md`). Recorded so the residual table has its
closure with evidence and nobody re-files it. The remaining debt on this item is documentation
only (F-46).

## Rung-5 residuals, re-checked (where this rung could see them)

| Residual | Status |
|---|---|
| F-35 — mock cannot emit tool calls | **FIXED and exercised** — F-53. |
| F-26 — no CardHost inside `<kai-chat>` | Fixed in WS1 round 1 (#313) per its own record; **not exercisable here** — no cards and no `<kai-chat>` in this rung by design. Needs a card rung to confirm closed. |
| F-01/F-02/F-27 class — programmatic layer invisible to the front door | **NOT FIXED, and now isolated.** With the element surface answering (the ratio inversion), this class is the whole residue — F-46. |
| F-06 class — `debug` answers nothing at the frontier | **REPEATED, third rung running** — F-52. 2 calls, 2 misses, both on the rung's new mechanisms. |
| F-09/F-32 class — scaffold emits what can't work | Not re-triggered (the builder used the scaffold as reference only); the adjacent gap this rung adds is that the scaffold cannot express a composed thread at all — F-49. |

## Environmental / non-findings from the transcript

- Wrong-first-then-corrected moments, all environmental, none kit-caused: leftover unused `turn`
  counter removed by `sed` after writing `main.ts` (line 149); `tsconfig` missing
  `"types": ["vite/client"]` caught by its own `tsc --noEmit` (line 154); the smoke script
  failing ESM resolution when run from `/tmp`, recovered by copying it into the app dir
  (line 174 — the run's only tool error).
- Zero `theme` MCP calls — the app styles entirely through `--color-*` tokens and `::part`,
  which needed no tool. Not a finding; recorded so the 0 in the call table isn't misread.
- The independent smoke's three first-run failures were probe defects (shadow-DOM-blind
  `innerText`, the tool part's nested `.tool` state), already recorded in `builder-run.md` —
  the checks-that-prove-nothing class, caught by its own author.

## Recommended fix waves

**Wave 1 — one docs worker, no kit runtime code** (source doc comments + docs pages + debug DB +
README; one `build:api` regenerates reference/llms-full/manifest from the comment changes;
verify with `nx build ui --skip-nx-cache` + the MCP manifest tests):

- F-43: the taxonomy sentence into `src/elements/composer.tsx`'s element doc; `debug` pattern
  `composer-attachments`.
- F-44: the data-URI rule into the `AttachmentData.url` type doc + `kai-attachments` /
  `kai-prompt-input` element docs; `debug` pattern `attachment-blob-url`.
- F-45 tier 1: the standalone-item caveat in `src/elements/conversation-item.tsx`'s element doc.
- F-47: the "host resolves the call" paragraph (lands inside F-46's section).
- F-48: the either/or sentence in the `kai-toast-region` element doc.
- F-50: one placement sentence on `feedback-bar.mdx` + the element doc.
- F-51: the which-theme-file note in `README.md` (mirror the scaffold comment's condition).
- F-52: `debug` DB entries for the patterns above plus `mock-tool-calls`.

**Wave 2 — kit code, small and separable:**

- F-46: extend the `build:api` llms-full generator with a `/state` + `/wire` programmatic-layer
  section derived from the shipped `.d.ts` (not hand-restated), and expose the same content as a
  `component_reference` topic. This is the highest-leverage single change in the wave set — it
  is the residual hard core by measurement.
- F-49 tier 1: a `composed-thread` recipe in the recipes catalog, donor = this rung's verified
  `app/src/main.ts` (with the F-44 `blob:` line corrected to a `data:` URI before it becomes a
  teaching artifact).

**Deferred, with reasons:**

- F-45 tier 2 (an activation event on standalone `kai-conversation-item`): reopens the
  2026-08-20 a11y ratification — owner decision first; the wave-1 doc caveat covers the
  immediate hazard.
- F-43 product half (native composer attachments): would blur a deliberate taxonomy; only
  reconsider if a second builder rebuilds the same glue (the F-36 two-independent-builders
  test).
- F-48 product half (`ensureMounted` adopting an existing region): adoption semantics need a
  decision; the doc sentence removes the trap.
- F-49 tier 2 (a composed/no-`kai-chat` scaffold surface): real scaffolder axis work with
  `verify:scaffold` cells; belongs with the composition-first / kai-thread-keystone track, not
  a docs wave.
- F-52 fallback rewording: resolves itself once F-46 makes `llms-full.txt` able to answer;
  revisit only if it doesn't.
