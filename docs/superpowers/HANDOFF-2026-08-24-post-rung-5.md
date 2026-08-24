# Handoff: rung 5 SHIPPED — the ladder's exit condition, ruled on

Date: 2026-08-24. Written for a fresh seat, any model, no prior context. Branch: `main`.

Rung 5 (remote cards / generative UI / the untrusted-output boundary) is merged. This handoff
exists for one decision: **the iteration ladder's parent spec
(`docs/superpowers/specs/2026-08-18-iteration-ladder-design.md`) says "the ladder is complete when
every component family has been driven by a real application."** §2 checks that claim against the
tree and gives the owner what they need to rule, because the compile-to-WC builder discussion is
gated on it.

Read in this order: `.superpowers/sdd/2026-08-21-rung-5-remote-cards/progress.md` (the full rung-5
ledger) · `docs/superpowers/research/2026-08-21-rung-5-front-door/findings.md` (F-26 – F-42) ·
`docs/superpowers/HANDOFF-2026-08-22-post-rung5-wave-mid-build.md` (the mid-build predecessor) ·
`docs/superpowers/HANDOFF-2026-08-21-post-rung-4.md` (the banked list this one prunes).

## 1. What landed this cycle

| PR | SHA on main | What |
|---|---|---|
| #305 | `d6d41735` | rung-5 §0 kit wave: F-20 provider-valid card-tool projections · F-23 `cardTools({ require })` · F-10 route guards (405/400/400 preamble + 9 fragments + cloudflare/pi bespoke templates) |
| #306 | `d3224760` | docs build, broken since the rung-4 merge (`34459b3d`) — vite peer re-binding. First green docs deploy since |
| #307 | `d9eb2d37` | #305 follow-ups from the post-merge independent review: CRITICAL `relaxRootCombinators` not guaranteeing `type:"object"` (custom-card root `anyOf` → empty schema → live 400) · 405 branch dead on the Vite cells · Vite `catch{}` discarding stacks · `ROOT_RELAXATIONS` unpinned |
| #308 | `bd74a93b` | **rung 5 complete**: research F-26 – F-42 (+ `builder-run.md`, `seam-inventory.md`, the app snapshot) · `examples/apps/ops-console` · the hardened IVP · fix waves D1–D10 / N1–N3 · kit fixes incl. input node identity (K-D12a/b) and thread card width (K-D11) · the `kai-remote` resize fix |
| #309 | `9c2cb29c` | `kai-dropdown` — element facade + generated React wrapper, raised by the owner's own consumer build test |
| — | `9250721d` | `docs/superpowers/specs/2026-08-24-form-field-formats-design.md` — form-field formats & masking, clean-room, §10's five open questions all decided (owner-delegated) |

Rung-5 headline numbers, from `findings.md` — quote these from the file, not from here:
**F-26 – F-42, S1 ×3 · S2 ×6** · 13 MCP calls vs 36 direct package reads (≈1:2.8), the pivot being
the third consecutive `debug` miss ~1 minute into a 44-minute run · the clean-room build cost
$22.30 / 164 turns / 43.8 min · **seam 1715/2695 = 63.6%**.

## 2. THE EXIT-CONDITION VERDICT

**Verdict in one line: the ladder is NOT complete as the spec words it — 25 of the kit's 83
registered elements have been driven by a ladder app — but the five families the rungs were chosen
for are all genuinely done, and what remains is one coherent family, not four scattered ones.**

Derivation (reproduce, don't trust the number): the roster is the 83 keys of
`packages/ui/src/elements/element-meta.json`; an element counts as driven when a ladder app under
`examples/apps/` contains its `<kai-*>` tag literal or imports its wrapper name from
`@kitn.ai/ui[/react]`. Loose word-matching inflates this to 31 by catching prose ("Source",
"Status"); the strict figure is 25.

What the rungs actually drove:

| Rung | App | Family | Verdict |
|---|---|---|---|
| 1 | `support-widget` | docked chat — `kai-chat`, `kai-dock` | ✅ driven |
| 2 | `voice-assistant` | voice/audio — `kai-voice-input`, `kai-voice-output`, `kai-audio-visualizer`, plus `kai-thread` standalone | ✅ driven |
| 3 | `workspace` | history/shell — `kai-workspace`, `kai-conversations` | ✅ driven |
| 4 | `builder` | artifacts/preview — `kai-artifact`, `kai-checkpoint`, `kai-resizable`(+`-item`), `kai-segmented` | ✅ driven |
| 5 | `ops-console` | generative cards + the untrusted boundary — `kai-cards`, `kai-card`, `kai-confirm`, `kai-choice`, `kai-form`, `kai-tasks`, `kai-remote`, `kai-tool` | ✅ driven, whole family |

The 58 undriven elements split in two, and the split is the whole argument:

- **Exercised, but only from inside `<kai-chat>`** — `kai-message`, `kai-markdown`,
  `kai-code-block`, `kai-reasoning`, `kai-tool`, `kai-source`/`kai-sources`, `kai-prompt-input`,
  `kai-composer`, `kai-attachments`, `kai-model-switcher`, `kai-context`, `kai-loader`,
  `kai-scroll-button` (`components/message.tsx` and the chat internals compose all of these).
  Every rung renders them; **no rung has ever constructed with them.** Under the old
  configuration-first framing that would count. Under the direction the owner ratified on
  2026-08-20 — *construction over configuration, users compose from elements* — it does not: the
  preset rendering a thing correctly says nothing about whether the element is usable as a
  composition surface, and rung 5's own headline (F-26: cards render inside `<kai-chat>` into a
  void) is exactly a defect that only appears when you try to compose rather than configure.
- **Never touched by anything** — the interaction/feedback family (`kai-toast-region`,
  `kai-feedback-bar`, `kai-coachmark`, `kai-dialog`, `kai-popover`, `kai-menu`, `kai-dropdown`,
  `kai-command`, `kai-tooltip`, `kai-hover-card`), the rich-input family (`kai-input`,
  `kai-search`, `kai-editable-label`, `kai-kbd`, `kai-file-upload`, `kai-suggestions`,
  `kai-scope-picker`, `kai-skills`), `kai-compare` (its own family — response comparison),
  the shell family (`kai-nav`, `kai-screen`, `kai-pane`/`kai-pane-group`, `kai-settings-group`,
  `kai-setting-item`, `kai-conversation-item`, `kai-prompt-dock`), and the atoms.

Two entries that look like gaps and are not quite. **Attachments** is the uncomfortable one — a
headline shipped feature with its own docs page that no ladder app sends a file through — but it is
a coverage hole, not a family-shaped one. **Devtools** (#280, owner-parked) registers no element at
all, so it cannot be "driven": a product decision, not ladder residue.

**Recommendation (the owner rules, not me): declare the ladder DONE for its stated purpose and do
NOT gate the builder discussion on more rungs.** The ladder existed to find real defects before
building grading apparatus, and it did — 42 classified findings across five rungs, plus the two
seam inventories the builder conversation needs. Yield per rung is not falling, but the remaining
families are small and rung 5 cost real money.

**The residue, named so the owner can rule on it separately:** one further rung is genuinely
different in kind rather than more of the same — *compose your own thread*, driving `kai-thread` /
`kai-message` / `kai-conversation-item` / `kai-composer` / `kai-attachments` / `kai-toast-region` /
`kai-feedback-bar` as separate elements with no `<kai-chat>` anywhere. That rung is the direct
dogfood of construction-over-configuration, and its findings are the ones most likely to change
the compile-to-WC builder's output shape, since what the builder emits IS a composition of item
elements. If the owner wants the exit condition met literally, that rung plus a small
interaction/compare pass closes it. If not, the honest record is: **five of roughly seven families
driven; the composition surface itself never has been.**

## 3. NEXT (owner-directed)

1. **The ladder-done discussion** (§2 is its input). Owner ruling required.
2. **Then the compile-to-WC builder conversation** — the owner deferred it until the ladder was
   done. Both of its inputs now exist and are the reason the rungs were run in this order: the
   rung-4 artifact-seam inventory (**48%** of app-proper lines are seam) and the rung-5 remote-card
   seam inventory (**63.6%**, envelope construction the largest single block at 555 lines). Sketch
   lives in the `builder-compile-to-wc` memory: Solid-native builder → one compiled web component;
   the interior stays pure Solid so there are no registry collisions; it must emit source AND
   binary. **The seam percentages are the argument** — two thirds of what a card app writes is
   glue the compiler could own.
3. **Independent of the builder:** the masking spec (`9250721d`) is decided and implementable —
   three tiers, each shippable and verifiable alone (tier 1 input semantics, tier 2 format masks,
   tier 3 partial/obscured display), all five §10 questions closed. A good candidate work item if
   the owner wants something concrete to run while the builder question is open.

## 4. Kit findings carried out of the rung (all in the ledger; none scheduled)

- **F-26 (S1) is the top unfixed kit item and remains unfixed.** `components/message.tsx:636`
  renders `CardRenderer` with no `host`, no `hostElement` and no `CardProvider` above it, so every
  card event inside `<kai-chat>` — `ready`, `action`, `submit`, `dismiss`, `reopen`, and the
  contract `error` — is discarded with no warning. Rung 4 filed the symptom as F-03; this rung has
  the mechanism, and it is worse than a missing prop. The rest of the S1/S2 list (F-27 the absent
  provider half · F-28 React `<Remote>` cannot mount a card, measured in Chromium both
  registration orders · F-29 `reopen` missing from the transport allow-list behind a self-defeating
  cast · F-30/F-31/F-32/F-34/F-35) is in `findings.md` with file:line evidence.
- **`CardRequireRule` should be a per-intent enum, not a flat one** (kit) — see §5. Alongside it: a
  **canonical card-part projection for encoders**, since `src/wire` has no single place that turns
  a resolved card into the outgoing request and each app re-derives it; **free-form-turn vocabulary
  residue** the app still carries and the kit could own; and the **D8 warnings**, left in the app
  deliberately and labeled.
- **`kai-popover` / `kai-dropdown` convergence is an open question, recorded not resolved** —
  annotated at `docs/composable-web-components-roster.md`, which overturned exactly one entry
  ("don't element-ize Dropdown") with dated consumer evidence rather than silently. `kai-popover`
  already gives a trigger plus slotted content, so the real gap may have been menu *semantics*
  (`role="menu"`, roving focus, typeahead). If so the two should converge, not both grow.
- **Caveat on the `kai-remote` resize fix**: it re-floors on `body.scrollHeight`, so a provider
  page setting `body { height: 100% }` re-floors to the viewport. Known, documented, not fixed.
- **F-35 — `createMockResponder()` still cannot emit tool calls** (`state/mock.ts:99-114`, text
  only). This is a verbatim repeat of rung-4's F-05: **two rungs have now paid for it**, each
  hand-rolling tool-call framing in its own mock server. Cheapest high-value kit fix on the list.

## 5. Method notes, priced in this rung

- **Evidence persists INSIDE the measurement task, never after it.** Two artifacts were nearly
  lost: the F-28 Playwright driver is unrecoverable (only `probe.tsx`/`.html` were salvaged, to
  `t8-probe-artifacts/`), and the clean-room sandbox lived in purgeable macOS temp until it was
  copied to `sandbox-archive/`. A probe that proved something and then evaporated has to be rebuilt
  before anyone can re-check it.
- **Playwright `fill()` hides per-key defects.** It sets the value in one shot, so D12 — the Change
  ticket input losing focus after *every* character — passed a full IVP form-flow green. The floor
  for any form probe is now `pressSequentially` plus a focus/node-identity assertion per key. The
  kit fix (K-D12a `ui/input.tsx:98-103`, the `Show` fallback creating the input node inside the
  memo; K-D12b `form.tsx:755` over-subscribing) is pinned by a type-char-by-char sameNode test.
- **Per-intent enums beat flat enums beat free-form for anything a model writes** — held three
  separate times this rung (card tool names, require rules, turn vocabulary).
- **Reference provenance rule** (owner directive, memory `input-mask-reference-provenance`): a
  study-only reference under `tmp/example` is cited **by path only** — its brand naming never
  enters a repo file, and every derivation is clean-room (read behavior → write a fresh spec →
  fresh implementation). The masking spec follows this.
- Still in force from rung 4: multi-turn REAL acceptance is the verification floor; probes must
  pierce shadow DOM and demonstrate they CAN fail; capture request + raw SSE bytes before
  diagnosing; watch CI by run id for the exact head SHA.

## 6. Banked (carried, pruned of what shipped) + release

Shipped since the last handoff, struck from the list: `kai-conversation-item` is now documented
(inside `<kai-conversations>` in `docs/web-components.md`, though still with no `###` section of
its own — 40 elements have one, of 83 registered) · the F-25 builder `onSubmit`-drops-while-loading
class was addressed in the rung-5 app waves.

Still banked, none scheduled, pick deliberately:

- Owner-sanctioned builder follow-up (banked, not built): a server-side session directory the
  builder writes generated files into — real URLs, true multi-file pages, reload persistence.
- create-kai stale dist pin + `.npmrc` guard vacuity · 14 element-coverage waivers · `kai-menu`
  narrow coverage · docs voice pass over the re-cast surface · `surfaces.ts` stale-props note ·
  **176 on-disk `.claude/worktrees/` dirs** · #280 `kai-devtools` (owner-parked) · #267
  release-please (owner's — NEVER touch).
- **The stick-to-bottom rAF flake**, confirmed on #307's first CI run: a stray rAF from
  `use-stick-to-bottom` fires post-teardown and jsdom has no `scrollTo` (origin
  `prompt-input-web-search.test.tsx`; 4259/4259 tests passed, 1 unhandled error). Fix = guard/cancel
  the rAF on cleanup. It reproduces rarely; it will cost a CI cycle again.
- **Release.** Last release was 0.25.2 (`3a2c8abd`, merged `1454d02d`, 2026-08-15). Since then main
  carries **58 commits, 30 of them release-note-visible `feat`/`fix`** — 19 `feat`, 11 `fix` — of
  which **5 carry a breaking `!`** (`2d2aca0f` the workspace re-cast, `f1fcb915` kai-voice-error,
  `5cae6188` the rung-1 findings, `648e72d3` shadow-root focus indicators, `0d3e0d98` attachments
  media policy; a sixth, `e0bb1e08`, is typed `test(elements)!`). Pre-1.0, so breaking is a minor:
  release-please will cut **0.26.0**. Re-derive with
  `git log --format='%s' 1454d02d..HEAD` before quoting. A release publishes the lot — three
  rungs of apps, the re-cast, and every kit fix above. **Owner's call, and it is overdue enough
  that it should be an explicit decision rather than a default.**

## 7. Owner interaction points

- **§2's verdict** — the one this handoff was written for. Ladder done, or one more rung?
- Builder discussion scope, once §2 is ruled.
- Release timing (0.26.0).
- Live eyeball on any new UI before merge; credential disclosure before any clean-room launch.
