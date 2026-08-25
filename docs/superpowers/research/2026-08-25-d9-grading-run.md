# D-9: the acceptance harness's first grading run — the five ladder apps

Date: 2026-08-25. Ruling executed: **D-9, ruled 2026-08-24** (`docs/superpowers/2026-08-24-roadmap-decision.md` §6) —
"UNPARKED for ONE grading run over the five ladder apps; its future (standing role vs retire) is
decided from that run's result." This document is that result. Full apparatus output (ledgers,
gates, findings, per-run REPORT.md) is beside it in `runs/`. Nothing was committed; no kit or
apparatus source was changed.

## What was run

The apparatus is the #288 acceptance harness (`packages/ui/scripts/acceptance-{pack,run,eval,gate-compiles}.mjs`
+ `scripts/lib/rubric.mjs`), parked by `specs/2026-08-18-iteration-ladder-design.md` and never
before scored. **It is not bit-rotted.** On today's tree (0.26.0, `feat/form-field-formats`, which
is byte-identical to `main` for the apparatus, catalog and apps — verified with `git diff main`):
the invariant floor executed 15 examples clean, the packer built five packs (84 element pages + 13
guides each, up from 80 at #288), the router, ledger, template generator, both evaluator gates, the
compiles gate (incl. its 16-control self-test) and the scorer all worked first try.

**How "grade the five apps" was mapped onto a scenario harness.** The harness's native unit is a
scenario run: a fresh agent gets the catalog pack and a prompt, and its output is judged. This run
repurposed the judging half: each run's `output/` is the **shipped app's client source**, the
ledger's model is `claude-opus` (each README's recorded clean-room builder; version unrecorded),
and each app was filed under the **nearest deck scenario**, which selects the applicable
dimensions and mechanical gates. Every ledger carries a `--note` stating this. Judged dimensions
were scored against **the app's own recorded build brief** (README provenance), with the
deck-vs-corpus mismatches reported below as coverage gaps rather than laundered into the scores.

Mechanical gates ran for real:

- **compiles** (S1, S4): `acceptance-gate-compiles.mjs`, tsc `--strict` + `noUnusedLocals` under
  the real consumer projects, resolving `@kitn.ai/ui` through the shipped exports map. Both clean
  (5 and 9 units).
- **registers** (S1, S4, S5): the gate is **unimplemented**, so the verdict was supplied via the
  sanctioned `--gates` seam from a live probe: each app served by its own `vite dev` in keyless
  mock mode, probed in a real Chrome — `customElements.get` + non-empty rects/shadow roots for
  every element the app uses. All passed (details in each `gates.json`).
- **elements-exist / audit-clean**: computed by the evaluator itself on every run. No fabricated
  tag anywhere; no wrong-form needle (15 needles) fired on any app — no hand-rolled SSE reader
  exists in the corpus.
- ops-console additionally verified live end-to-end: one submitted turn against the mock produced
  an assistant message with text + card parts and a mounted cross-origin `kai-remote` (557×150).

## The numbers (first ever produced by this apparatus)

| app | rung | scenario (nearest) | verdict | **score /10** | gates | capped dimension |
| --- | --- | --- | --- | --- | --- | --- |
| voice-assistant | 2 | S3 capability | scored | **9.81** | ee ✓ audit ✓ | wiring-topology 10→8 (V1) |
| workspace | 3 | S1 surface recipe | scored | **9.77** | ee ✓ audit ✓ compiles ✓ registers ✓ | contract-correctness 10→8 (W1) |
| builder | 4 | S4 whole surface | scored | **9.75** | ee ✓ audit ✓ compiles ✓ registers ✓ | contract-correctness 10→8 (B1) |
| support-widget | 1 | S5 platform embed | scored | **9.71** | ee ✓ audit ✓ registers ✓ | invariant-compliance 10→8 (SW1) |
| ops-console | 5 | S6 honesty bound | scored | **9.68** | ee ✓ audit ✓ | contract-correctness 10→8 (O1) |

Every judged dimension not named in the last column scored 10 on review of the full client source;
every 8 is a severity cap from one recorded cosmetic-or-practice finding, so **all of the spread is
findings, none of it is failure**. That is the expected shape: the subject is the polished,
insider-hardened, CI-built corpus, not a fresh agent. The ranking is score-order but the honest
reading is "five clean runs, one real kit/catalog gap each":

- **W1 / workspace** — `kai-toast-region`'s z-index-100 stacking contract is derivable nowhere
  (the rung-3 toast burial, fixed in app CSS with a hand comment). `underived-contract`.
- **V1 / voice-assistant** — `kai-voice-input` hands out no MediaStream, so voice+visualizer needs
  a second getUserMedia capture (~60 lines of latch/timeout plumbing). `underived-contract`.
- **B1 / builder** — `CardSchema`'s type rejects the nested `description` fields the kit's own
  seven schemas carry; consumer schemas need an `as CardSchema` cast. `underived-contract`.
- **SW1 / support-widget** — the encode-before-`createAssistantStream` ordering rule exists only
  as a defensive comment; the rung-1 clean-room rebuild actually committed the error (G-15).
  **`missing-invariant`, proposedId `encode-before-stream`** — the one change here that closes a
  measured agent failure, ranked first among the write-backs.
- **O1 / ops-console** — the card validator implements no `additionalProperties`, so pollution
  keys pass validation on every schema and the consumer must police them; stated only in a kit
  source comment. `underived-contract`.

All five findings resolved through the attribution machinery into concrete catalog change
proposals (the "Catalog improvement analysis" table in each REPORT.md). None was new — each
corresponds to a banked ladder finding — which is itself a result: **the harness's findings
pipeline independently re-derives what the manual ladder found**, on its first use.

## Coverage gaps — what this run could NOT honestly measure

1. **The deck does not fit the corpus.** Only workspace↔S1 and support-widget↔S5 are near-fits,
   and even those miss: S1 also asks for an **artifact side panel** (rung 4's family — no corpus
   app answers S1's exact prompt), and S5 demands **script-tag/no-bundler** while the corpus
   widget is deliberately Vite-built — the script-tag cell still has no corpus subject at all.
   S3's scoring lines name `kai-prompt-input.transcribe` + slash commands; the corpus voice app is
   the hands-free `kai-voice-input → kai-thread → kai-voice-output` loop, a family no scenario
   covers. S4's prompt is a Perplexity research UI; the corpus whole-surface app is a page
   builder. S6 fits ops-console only through its composing anchor (custom types via `cardTypes` —
   which the app is, at scale). **S2 (Vue) and S7 (diagnosis) had no subject and were not run.**
   The deck was written 2026-08-18, before rungs 2-5 existed; it has simply not been re-cut.
2. **The `registers` gate is unimplemented** — its verdicts here came from a manual browser probe
   through the `--gates` seam. `streams` is also unimplemented but no run needed it (S2 unused).
3. **This run does not measure what the harness was designed to measure.** The designed subject is
   a clean-room agent building from the catalog pack alone; today's subject is the corpus those
   agents' outputs became after insider hardening. So these numbers are a **quality baseline of
   the corpus under the rubric**, not a catalog-teaching delta. The teaching measurements that do
   exist are the rung-1/rung-2 rebuild experiments (`research/2026-08-19-*`), which predate the
   scoring pipeline.
4. **No model was invoked and no key used.** The apparatus never calls a model by design;
   `examples/apps/builder/.env` does hold an OpenRouter key, but nothing in this run needed it.
   The mock/real seam was exercised on the mock side only.

## Time and cost

- Wall clock: ~50 minutes end to end (find the apparatus → 5 ledgered runs → 2 compiles gates →
  4 dev servers + browser probes → judge review of ~4,700 lines of app source → 5 scored reports
  → this document). The five `acceptance-run` preparations themselves took seconds each.
- Money: **$0 metered** — no API call, no OpenRouter; one Claude Code subscription seat did the
  judging. (Contrast: each original clean-room builder run cost real money — ops-console's was
  $22.30/164 turns.)
- Machine: checked before running (`uptime` load 1.5–2.9, no CPU-pinning processes). No
  benchmark-grade timings were recorded; the numbers above are scores, not timings.

## Recommendation: keep it, event-triggered — do not retire, do not make it a per-release gate

**Standing role, but triggered by surface events, not by the calendar — and only after a one-day
deck re-cut.** Reasoning:

1. **Retiring it would discard the half that just proved itself.** The scoring/attribution
   pipeline worked end to end on first contact, refused everything it should refuse, and its
   findings analysis independently converged on the ladder's banked findings. The drift lint and
   invariant floor already run in CI regardless; the run loop is the only part in question.
2. **A per-release corpus grade is the wrong standing role.** This run shows why: the corpus
   scores 9.7±0.1 and will keep scoring that — near-ceiling, low-information, ~an hour of judge
   time per pass. `verify:starters` already guards the corpus mechanically every CI run.
3. **The valuable standing role is the DESIGNED one** — clean-room agent + pack, judged against
   the corpus as reference — run when the teaching surface actually moves: the catalog re-cast,
   the Solid v2 migration's consumer-facing fallout, the builder's card/artifact seam (workstream
   2), a new front door. That cadence is roughly 2-4 runs a year, each cheap on the subscription
   path, and D-3's original sequencing ("harness after the builder spec exists") already points
   the same way.
4. **Two preconditions before the next run, both small:** (a) re-cut the deck to the corpus —
   fix S1's artifact clause or add the artifact panel to workspace, add a hands-free-voice and a
   generative-cards scenario, retarget S4's prompt at a surface a reference exists for, and either
   build the script-tag widget or keep S5 as the deck's named uncovered cell; (b) implement the
   `registers` gate (the manual probe used here — customElements.get + non-empty rect over a dev
   server — is exactly the script it should become).

If the owner wants a one-word disposition: **keep, parked-with-a-trigger** — the parking condition
is no longer "until there is something worth grading" (there is) but "until the teaching surface
next moves", with the deck re-cut as the first task of whichever workstream trips it.

---
*Produced under the D-9 ruling, 2026-08-25. Apparatus: #288, kit 0.26.0. Runs prepared with
`acceptance-run.mjs` (ledgers in `runs/*/run-info.json`, each carrying the repurposing note),
scored with `acceptance-eval.mjs`. Working ledger dir (with packs and output copies) lives in the
session scratchpad; the durable verdict artifacts are checked in beside this file, uncommitted.*
