# The composition catalog

A machine-readable description of what can be composed from this kit: the parts,
what each one requires, and the invariants that must hold. It exists so a coding
agent building `kai-*` into someone else's app has the **contracts** — which
event carries which detail, which prop must be a JS property, what breaks if you
set the same array back — and not just a prop list it can already read off
`element-meta.json`.

The measurement is the point. An acceptance deck of seven scenarios hands an
agent the catalog and **no kit source**; whatever it cannot build names what the
catalog is missing. The evaluator attributes every failure to the catalog record
that should have prevented it and ranks the fixes. That ranked list, not the
score, is the output.

Every command below was run from the repo root and its output pasted verbatim.

---

## Generated vs authored

Half the confusion here is which files you may edit. `derived.json` is read out
of the tree by a generator; everything else is written by hand.

### `src/agent-tooling/catalog/`

| file | what it is | who writes it | edit by hand? |
| --- | --- | --- | --- |
| `derived.json` | Every element's props/events/methods/parts, the `MessagePart` variants, integrations, capability groups, theme tokens, event exceptions | `scripts/gen-catalog.mjs`, via `build:api` | **Never.** Change the source it reads (`src/elements/element-meta.json`, `src/elements/chat-types.ts`, `src/agent-tooling/registry.ts`, `archetypes.ts`, `theme.css`) and regenerate |
| `catalog-types.ts` | The Zod schemas every authored record is parsed against | you | yes |
| `invariants.ts` | The rules that break real consumers, each with a statement, `diagnosis` symptom/cause pairs, wrong/right code examples, and an honest `enforcedBy` | you | yes |
| `surfaces.ts` | `inventory` (what is a surface vs an ingredient vs corpus), `surfaceRecipes` (proven compositions with their host wiring written out), `partConsumption` | you | yes |
| `scenarios.ts` | The seven acceptance scenarios: prompt, what it needs, scoring lines | you | yes |
| `fabrications.ts` | Tags agents invented that do not exist. Empty until a run fills it | you, from a run's report | yes |
| `labs-titles.ts` | TypeScript parser that reads the `title` off a story's default-exported meta. Used by the drift lint to resolve inventory rows | you | rarely |
| `*.test.ts` | The tests that pin all of the above | you | yes |

### Scripts

| script | what it does |
| --- | --- |
| `scripts/gen-catalog.mjs` | Writes `derived.json`. Runs inside `build:api` |
| `scripts/lint-catalog-drift.mjs` | Required CI. Every authored claim — element tags, events, properties, invariant ids, corpus paths, inventory titles, scenario invariant refs — must resolve against `derived.json` and the tree |
| `scripts/acceptance-pack.mjs` | Builds one scenario's pack: `agent/` and `judge/` |
| `scripts/acceptance-run.mjs` | Records what is about to be measured, and isolates the handover. Invokes no model |
| `scripts/acceptance-eval.mjs` | Scores a run and produces the catalog-improvement analysis |

`scripts/lib/` holds the pieces those three share: `rubric.mjs` (weighted
dimensions, 0–10 anchors, the severity ladder), `catalog-attribution.mjs` (the
improvement analysis), `invariant-floor.mjs` (executes every `examples[].right`),
`audit-needles.mjs` (the self-audit search strings and their recall tier),
`output-scan.mjs` (the two gates the evaluator runs itself), `run-routing.mjs`
(which model may take which execution path), `handover.mjs` (the judge-leak
scan), `import-catalog.mjs` (esbuild-bundles the authored TS for plain Node).

---

## It already runs without you

Three things fire on their own. You do not have to do anything for these.

**`build:api` regenerates `derived.json`.** `gen-catalog.mjs` is chained onto the
end of it, so a normal build keeps the derived layer current:

```
"build:api": "node scripts/gen-elements-manifest.mjs && node scripts/gen-element-api.mjs && node scripts/gen-catalog.mjs"
```

**`verify:generated` fails CI if a checked-in generated artifact is stale.**
`derived.json` is one of the nine it re-derives and diffs, and it seeds each with
a single-use sentinel first so a dead generator cannot pass as "in sync":

```
$ pnpm --filter @kitn.ai/ui run verify:generated
verify-generated-sync: regenerating 9 artifacts via `npm run build:api`

  · model parsed: 80 kai-* elements

  ✓ packages/ui/src/elements/element-meta.json
  ...
  ✓ packages/ui/src/agent-tooling/catalog/derived.json
  ✓ docs/web-components.md

✓ verify-generated-sync: all 9 generated artifacts match their source (each one proven rewritten this run).
```

**`lint:catalog-drift` fails CI if an authored claim stopped resolving.** Needs
no build, about a second:

```
$ pnpm --filter @kitn.ai/ui run lint:catalog-drift
...
lint-catalog-drift --self-test: all 71 cases behaved.
⚠ coverage gap: invariant props-not-attributes: enforced by nothing.
⚠ coverage gap: invariant host-coordinates: enforced by nothing.
⚠ coverage gap: invariant untrusted-model-output: PARTIAL — ... covers part of it; the statement says which half is uncovered.
⚠ coverage gap: invariant kit-parses-consumer-fetches: PARTIAL — lint:silent-drops covers part of it; the statement says which half is uncovered.
⚠ coverage gap: invariant upgrade-race: enforced by nothing (until issue #99 option B lands in defineWebComponent).
lint-catalog-drift: 2 recipes, 7 invariants, 26 inventory rows resolved clean (5 reported gaps).
```

The `⚠ coverage gap` lines are reports, not failures — an invariant that nothing
in the repo enforces is a fact the catalog states out loud rather than hides.

The MCP consumes the catalog too. `component_reference` for a tag now serves the
invariants that apply to it and the recipes it appears in, with the enforcement
line attached:

```
### Invariants
Rules that have already broken real consumers of this kit. Each block says what
enforces it — read that line rather than assuming CI catches a violation, because
nothing here reads YOUR code. 3 of the 7 below are enforced by NOTHING at all,
and 2 more by only half of what they say.

#### reactivity-two-halves (only kai-chat, kai-conversations) — enforced by the kit's own tests (packages/ui/src/components/reactivity-contract.test.tsx)
```

---

## Running it against a model

**Nothing here calls a model.** There is no API key, no socket and no network in
any of these scripts. The model invocation is a seam you cross by hand (or with a
transport module you supply). Everything on either side of the seam is offline
and tested; only the part that costs money needs you.

### 1. See the deck

```
$ pnpm --filter @kitn.ai/ui exec node scripts/acceptance-pack.mjs --list
S1  surface recipe applied to an existing tree
S2  greenfield, contract
S3  capability
S4  whole surface; expected to fail hardest first
S5  platform embed
S6  refusal
S7  debugging
```

The prompts and scoring lines are in `scenarios.ts`. S6 is the strongest signal
in the deck: a model with no catalog cannot refuse honestly, because it does not
know what does not exist.

### 2. Pack a scenario

```
$ pnpm --filter @kitn.ai/ui exec node scripts/acceptance-pack.mjs \
    --scenario S6 --out /tmp/pack-S6
acceptance-pack: packed S6 into /tmp/pack-S6 (agent/: 80 element pages + 13 guides; judge/: 2 reports + catalog.json)
```

`--out` must be new or empty; the packer refuses to merge into a directory it
does not own. Use absolute paths — `pnpm exec` runs from `packages/ui`, so a
relative path lands there.

Before it writes anything the packer runs the **floor stage**: every
`examples[].right` in `invariants.ts` is executed. You can run it alone:

```
$ pnpm --filter @kitn.ai/ui exec node scripts/acceptance-pack.mjs --floor
PASS  reactivity-two-halves#0  [stand-ins: `chat` is a plain object, not a registered element]
        · appending a turn produces a NEW array reference
...
✓ acceptance-pack: floor clean — 15 examples executed.
```

A pack built on advice that does not run measures the wrong thing, so a red floor
means no pack.

### 3. Prepare the run

`acceptance-pack` gives you a pack. `acceptance-run` gives you a **ledger** — a
timestamped record of what is about to be measured — plus a handover directory
holding `agent/` and nothing else.

```
$ pnpm --filter @kitn.ai/ui exec node scripts/acceptance-run.mjs \
    --scenario S6 --model claude-opus-5 --tier frontier --runs-dir /tmp/runs
acceptance-run: no --path was given; "claude-opus-5" admits exactly one (claude-code, rule anthropic-via-subscription). Recorded as inferred.
acceptance-pack: packed S6 into /tmp/runs/20260818-110728-S6-claude-opus-5/pack (agent/: 80 element pages + 13 guides; judge/: 2 reports + catalog.json)
acceptance-run: prepared 20260818-110728-S6-claude-opus-5
  scenario     S6
  model        claude-opus-5  (tier frontier)
  path         claude-code [inferred, anthropic-via-subscription]
  kit version  0.25.2
  HAND THIS TO THE AGENT, and nothing else:
    /var/folders/.../T/kai-handover-20260818-110728-S6-claude-opus-5-AVqU8s   (93 files, sha256:894f68b5638d…)
  collect its output into:
    /tmp/runs/20260818-110728-S6-claude-opus-5/output
  then: node scripts/acceptance-eval.mjs --run /tmp/runs/20260818-110728-S6-claude-opus-5
```

Flags: `--scenario` `--model` `--tier` `--runs-dir` are required; `--path`
`--effort` `--handover` `--note` `--exec` are optional. Every one of them is
recorded in the ledger and compared across runs, so a flag given no value is
refused rather than guessed.

The handover defaults to the OS temp directory. Pass `--handover <dir>` to put it
somewhere durable — on this machine the temp copies vanished between commands.
`--prune-handovers <runs-dir>` deletes every handover no ledger still references.

The ledger (`run-info.json`) records the third thing everyone forgets — **which
execution path ran** — alongside the scenario and the model:

```json
{
  "runId": "20260818-110728-S6-claude-opus-5",
  "scenarioId": "S6",
  "model": "claude-opus-5",
  "modelCanonical": "claude-opus-5",
  "tier": "frontier",
  "executionPath": "claude-code",
  "pathSource": "inferred",
  "routingRule": "anthropic-via-subscription",
  "kitVersion": "0.25.2",
  "handoverFiles": 93,
  "handoverDigest": "sha256:894f68b5638d811b809c1a1606f2a917088c120f74af1d11a78dcd2eadf509a1",
  "status": "prepared",
  "transport": null
}
```

Without the path, a later cost or quality comparison is guesswork: the same model
identifier can mean a subscription seat or a metered invoice.

### 4. Cross the seam

The handover directory is a flat set of markdown files:

```
$ ls /var/folders/.../T/kai-handover-20260818-111237-S7-claude-opus-5-V3vZSo
DELIVERY.md   FABRICATED.md   INVARIANTS.md   PARTS.md    README.md   SELF-AUDIT.md   THEME.md
ELEMENTS.md   INTEGRATIONS.md INVENTORY.md    PROMPT.md   RECIPES.md  SHARED-PROPS.md elements
$ ls .../judge
ls: .../judge: No such file or directory
```

**Anthropic models — your Claude Code subscription.** Start a session with the
handover directory as its working directory, give it the contents of `PROMPT.md`,
and tell it that directory is all the documentation there is. Save whatever it
produces into the run's `output/`. Do not let it read your repo: the whole
measurement is "what can it build from the catalog alone".

**OpenRouter — the models you name.** Same shape, different transport: POST the
handover's markdown plus `PROMPT.md` to OpenRouter with your own key, write the
reply into `output/`. Only `~deepseek/deepseek-v4-flash-latest` is allowed today;
the list lives in `OPENROUTER_ALLOWED` in `scripts/lib/run-routing.mjs`.

**The router refuses, it never reroutes.** The two paths bill to different
places, and quietly moving a run would also make the `executionPath` in the
ledger untrue:

```
$ ... --model claude-opus-5 --path openrouter
✗ acceptance-run: routing refused [anthropic-never-openrouter]: "claude-opus-5" is an Anthropic model and the openrouter path was selected. ... This is REFUSED rather than rerouted: the two paths bill to different places, and quietly moving the run would also make the executionPath recorded in the ledger untrue.

$ ... --model '~deepseek/deepseek-v4-flash-latest' --path claude-code
✗ acceptance-run: routing refused [non-anthropic-never-claude-code]: "~deepseek/deepseek-v4-flash-latest" is not an Anthropic model, so it cannot run through the Claude Code subscription. Re-run with --path openrouter.

$ ... --model meta/llama-4
✗ acceptance-run: routing refused [no-path-for-model]: "meta/llama-4" is neither an Anthropic model nor one of the owner-named OpenRouter models (~deepseek/deepseek-v4-flash-latest), so there is no path it may take. Neither "charge the card" nor "use the subscription" is this script's decision to make.
```

**Automating the seam.** `--exec <module>` imports a module you write and calls
its `runAgent(request)`:

```js
export async function runAgent(request) {
  // request = { runId, scenarioId, model, executionPath, effort, handoverDir, outputDir }
  return {
    files: [{ name: 'ANSWER.md', text }],  // written into outputDir
    transcript,                            // written as output/TRANSCRIPT.md
    meta,                                  // recorded in run-info.transport
  };
}
```

`request` carries no pack directory and no run directory, so a transport cannot
hand an agent the answer key by accident — it is never told where the answer key
is. CI never passes `--exec`.

### 5. Score it

Generate the findings template, fill it, then evaluate:

```
$ pnpm --filter @kitn.ai/ui exec node scripts/acceptance-eval.mjs --template /tmp/runs/20260818-111308-S1-claude-opus-5
acceptance-eval: wrote .../findings.template.json — fill judgedScores and findings, then --run ...
  external gates still needed: compiles, registers (supply via --gates; absent scores 0, never "skipped")
```

The template carries the full rubric, the severity ladder and the attribution
kinds inline, so you are not guessing at the vocabulary. Rename it to
`findings.json` (the default `--findings` path) and fill `judgedScores` plus a
`findings` array. Then:

```
$ pnpm --filter @kitn.ai/ui exec node scripts/acceptance-eval.mjs --run /tmp/runs/20260818-110728-S6-claude-opus-5
acceptance-eval: S6 gated-fail — 2.84/10 via claude-code. 2 catalog change(s) proposed. Wrote .../REPORT.md.
```

Flags: `--run <dir>` `[--findings f] [--gates g]`, `--template <dir> [--out f]`,
`--compare --strong <dir> --weak <dir>`, `--self-test`.

The evaluator refuses more than it accepts, and every refusal is a real one you
will hit:

```
✗ acceptance-eval: no findings file at .../findings.json. Generate one with --template ...; a run with no judgement is not an evaluation.

✗ acceptance-eval: findings could not be attributed to the catalog, so no improvement analysis was produced:
  - finding "F1": fabricated-element with no `useInstead` must carry `noReplacementReason` — "there is no replacement" is a real and useful answer, but it has to be said rather than left blank.

✗ acceptance-eval: ... is a gated-fail (registers) with ZERO findings recorded. That is not an evaluation: the premise of the deck is that whatever the agent could not build names what the catalog is missing, so a failing run must say what went wrong and what would have prevented it.

  - mechanical dimension "compiles" has no gate result. That is an ERROR, not a skip and not a pass: an unrun gate and a clean gate produce the same silence, and only one of them means anything.
```

---

## What the pack contains

```
$ find /tmp/pack-S6 -maxdepth 2 -not -path '*/agent/elements/*' | sort
./PACK.md
./agent
./agent/DELIVERY.md
./agent/ELEMENTS.md
./agent/FABRICATED.md
./agent/INTEGRATIONS.md
./agent/INVARIANTS.md
./agent/INVENTORY.md
./agent/PARTS.md
./agent/PROMPT.md
./agent/README.md
./agent/RECIPES.md
./agent/SELF-AUDIT.md
./agent/SHARED-PROPS.md
./agent/THEME.md
./agent/elements
./judge
./judge/FLOOR.md
./judge/JUDGE.md
./judge/catalog.json
```

`agent/` is the whole catalog and no kit source: the task, how to install and
register, an exhaustive element index with one page per tag, the shared props,
the invariants with wrong/right pairs, the recipes with host wiring, and a
self-audit the agent runs over its own output before delivering.

`judge/` is the answer key. `JUDGE.md` carries the scoring checklist, the
`enforcedBy` table for triage, and the recipe corpus paths — repo paths pointing
at files the agent is deliberately not given. Handing any of it to the agent
invalidates the run, which is why `acceptance-run` copies `agent/` alone into an
isolated handover and verifies afterwards that no judge material leaked in.

---

## Reading a result

`REPORT.md`, from a real S6 run where the agent invented `<kai-datagrid>`:

```md
## Verdict: gated-fail — 2.84 / 10

**Gated failure.** elements-exist did not pass. A gated failure outranks the
score: "it scored 2.84" and "it does not compile" are different facts.

| dimension | gate | weight | score | source | detail |
| --- | --- | --- | --- | --- | --- |
| elements-exist | mechanical | 3 | 0.0 | gate | 1 fabricated tag(s) in 2 place(s): kai-datagrid |
| audit-clean | mechanical | 3 | 10.0 | gate | no wrong-form needle fired across 15 needles — a floor, not a proof |
| contract-correctness | judged | 3 | 2.0 | judged | |
| invariant-compliance | judged | 3 | 3.0 | judged | |
| honesty-bound | judged | 4 | 0.0 | judged | |
| completeness | judged | 3 | 3.0 | judged | |
```

**The weighted score** is a renormalised 0–10 over the dimensions that applied.
It is for comparing two runs, not for reporting a verdict.

**Gates fail closed.** A gate that did not run scores 0 — never "skipped" —
because an unrun gate and a clean gate produce the same silence and only one of
them means anything. `elements-exist` and `audit-clean` the evaluator computes
itself from the output text and the catalog; supplying either through `--gates`
is refused. `compiles`, `registers` and `streams` need real tooling and come in
through `--gates`.

**Severity caps the dimension.** From an S1 run: a `does-not-render` finding
filed against `completeness` produced `0.0 (capped from 7.0)`. The ladder is
`does-not-render` (cap 0) · `does-not-function` (3) · `does-not-wire` (5) ·
`cosmetic-or-practice` (8, never blocking).

**Not-applicable is not failed.** A prose answer — a refusal, a diagnosis — has
no code for the two scanning gates to read, so they leave the score entirely:

```
**2 dimension(s) did not apply** — elements-exist, audit-clean — because these
gates found no code they could read in the output. They are out of the score
entirely, and the remaining weights are renormalised over 13 of 19. ... Only the
gates the evaluator runs itself can report this — an external gate that did not
run is a failure, not an absence.
```

**The tier delta** is the point of running two models. `--compare` puts them side
by side, and warns when the denominators differ:

```
$ ... --compare --strong <dir> --weak <dir>
> **⚠ Different denominators.** The strong run was scored over 19 weight and the
> weak run over 13 ... They are not directly comparable; read the per-dimension
> rows instead of the headline.

**The headline is not "did it pass".** It is how far down the model tier the
catalog keeps working. Anything the strong model gets right and the weak one gets
wrong names a contract the catalog leaves IMPLICIT and is currently relying on
the model to supply from its own priors.
```

**The catalog-improvement analysis is the actual output.** Every finding is
attributed to the record that should have prevented it, and the changes are
ranked by how many findings each would close:

```md
| # | change | kind | closes | severity weight | tier-revealed |
| --- | --- | --- | --- | --- | --- |
| 1 | `fabricated:kai-datagrid` | fabricated-element | 1 | 16 | |
| 2 | `invariant:strengthen:props-not-attributes` | invariant-ineffective | 1 | 9 | |

Addressable share: 1 — all 2 finding(s) name a catalog change.
```

Attribution kinds: `missing-invariant` · `invariant-ineffective` ·
`missing-recipe` · `recipe-ineffective` · `underived-contract` ·
`missing-element-description` · `fabricated-element` · `pack-defect` ·
`not-a-catalog-gap`. The last is the escape hatch and it costs something: it must
quote the page and the line that said it plainly, because an uncosted escape
hatch swallows the analysis.

Fabrications are proposed, never written:

```md
## Proposed FABRICATED.md rows

Paste into `src/agent-tooling/catalog/fabrications.ts` after checking each tag.
**Not written automatically:** a mis-scored run editing the catalog would teach
every later agent that a real element is imaginary.
```

---

## Making improvements

The loop: **run → read the improvement list → edit the authored records → the
lints keep you honest → re-run.** Only `derived.json` is off limits.

### Worked example: adding an invariant

Add a record to `invariants.ts` and nothing complains yet — the drift lint only
resolves references, and a new id refers to nothing:

```
$ pnpm --filter @kitn.ai/ui exec node scripts/lint-catalog-drift.mjs
lint-catalog-drift: 2 recipes, 8 invariants, 26 inventory rows resolved clean (6 reported gaps).
```

The packer is where it bites. The floor stage refuses to pack advice it cannot
execute:

```
$ ... acceptance-pack.mjs --scenario S6 --out /tmp/pack-bad
ERROR no harness for theme-attribute-scalar#0 (wrong: chat.theme = { mode: 'dark' };). Every examples[].right must be executed; add a harness in scripts/lib/invariant-floor.mjs binding its free variables, or the example stops being measured.
✗ acceptance-pack: the floor stage failed, so nothing was packed. 1 problem(s) in the catalog's own examples[].right forms — fix those first; a pack built on broken advice measures the wrong thing.
```

Add the harness, and the next gate fires:

```
✗ acceptance-pack: the self-audit needles are unsound, so nothing was packed:
  - no search needle for theme-attribute-scalar#0. Every wrong/right pair needs one, or that mistake is unsearchable.
```

So a new invariant is three edits, in this order:

1. the record in `invariants.ts` — statement, `appliesTo`, an honest
   `enforcedBy` (`kind: 'none'` is fine and preferred over a fake pointer),
   `diagnosis` pairs, and wrong/right examples;
2. a harness in `scripts/lib/invariant-floor.mjs` binding the example's free
   variables, so the `right` form is executed and its behavioural claim asserted;
3. a needle in `NEEDLE_TABLE` in `scripts/lib/audit-needles.mjs`, with its tier.
   The needle is checked to appear in its own `wrong` form, in **zero** `right`
   forms across all invariants in either quote style, and to hold its claimed
   tier against rename and quote transforms.

### Worked example: a recipe or an inventory row

Every authored claim is resolved against the tree. Misspell an ingredient:

```
$ pnpm --filter @kitn.ai/ui exec node scripts/lint-catalog-drift.mjs
✗ lint-catalog-drift: recipe workspace-chat: ingredient kai-datagrid is not a derived element.
$ echo $?
1
```

Inventory titles resolve the same way, against real `Labs/` story titles parsed
out of each story's default-exported meta. What resolution does **not** cover is
deletion, for most rows: the check runs row → tree, and a deleted row asks
nothing of the tree. The exceptions are documented at the top of `surfaces.ts`.

### Before you push

```
pnpm --filter @kitn.ai/ui run lint:catalog-drift
pnpm --filter @kitn.ai/ui run verify:generated
pnpm --filter @kitn.ai/ui exec node scripts/acceptance-pack.mjs --floor
pnpm --filter @kitn.ai/ui exec vitest run --project=unit src/agent-tooling/catalog tests/scripts
```

That last one, on this tree:

```
 Test Files  30 passed (30)
      Tests  406 passed (406)
```

Each script also takes `--self-test`, which watches every refusal fire rather
than asserting it works.

---

## What is not built

Say this plainly, because the machinery looks more finished than it is.

**No acceptance run has ever happened.** Everything above was exercised with
hand-written stand-in output. No model has been given a pack.

**The three external gates are declared, fail closed, and are unimplemented.**
`compiles`, `registers` and `streams` have weights, anchors and a refusal if they
are missing — and nothing runs them. Supplying one by hand means writing
`gates.json` in the run directory:

```json
{
  "compiles": { "passed": true,  "detail": "tsc --strict clean under the react consumer project" },
  "registers": { "passed": false, "detail": "kai-artifact never upgraded" }
}
```

You get those verdicts by doing the work yourself: drop the emitted code into a
consumer app and run `tsc --strict` (`verify:scaffold` already stands up three
tsc projects that resolve `@kitn.ai/ui` through the shipped exports map), mount
it in a browser and check `customElements.get`, drive it with a mock provider-SSE
fixture. An external gate may not report `vacuous: true` — only the gates the
evaluator runs itself can discover there was nothing to scan.

**`FABRICATED.md` is empty by construction.** `fabrications.ts` holds no rows,
and the page in every pack says so in those words. Read the emptiness as "nobody
has looked yet", not "agents get this right".

**There are almost no element descriptions in the tree.** The index's "what it
is" column is blank for nearly every row:

```
$ grep -c '^- `<kai-' packages/ui/llms.txt
3
```

Three curated one-liners, and `llms.txt` is the only place they live. This is why
`missing-element-description` is an attribution kind: an agent choosing between
two elements has counts and a capability group and nothing else.

---

## Reference

- Design: `docs/superpowers/specs/2026-08-17-composition-catalog-design.md`
- Brief: `docs/superpowers/specs/2026-08-16-composition-catalog-brief.md`
- Plan: `docs/superpowers/plans/2026-08-17-composition-catalog.md`
