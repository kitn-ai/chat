# Soft-tier validation against the real-model corpus (T1.6)

**Question.** Native card validation ships two tiers. Hard replaces the card with a diagnostic; soft renders the card and reports. The soft tier is scheduled to default ON, and §9 risk 4 of `docs/superpowers/plans/2026-08-11-emit-contract.md` says validation is net-negative if it fires on cards that render fine today. Nobody had checked that against real model output.

**Answer.** Zero. 35 card envelopes recorded from five model configurations, none trips the soft tier, none trips the hard tier. **Recommendation: the soft tier defaults ON.**

Base: `4b33cd8`. Corpus: `examples/internal/openrouter-spike/fixtures/`, read-only.

---

## 1. The counts

| | envelopes | soft trips | hard trips | no schema |
|---|---|---|---|---|
| **live** (recorded from models) | **35** | **0** | **0** | 0 |
| canned (hand-written) | 4 | 0 | 0 | 0 |
| total | 39 | 0 | 0 | 0 |

**The recommendation rests on the 35 live envelopes.** The canned fixtures are hand-written and are not evidence about what models produce; they are reported for completeness and are the only source of `artifact` cards (S13 was never recorded live).

Live, by card type and model configuration — 7 envelopes per configuration, identically distributed:

| configuration | wire | confirm | choice | form | tasks | link | embed | total |
|---|---|---|---|---|---|---|---|---|
| `openai-gpt-5.4-mini` | openai | 2 | 1 | 1 | 1 | 1 | 1 | 7 |
| `anthropic-claude-haiku-4.5` | openai | 2 | 1 | 1 | 1 | 1 | 1 | 7 |
| `anthropic-claude-haiku-4.5-anthropic-wire` | anthropic | 2 | 1 | 1 | 1 | 1 | 1 | 7 |
| `deepseek-deepseek-v4-flash-latest` | openai | 2 | 1 | 1 | 1 | 1 | 1 | 7 |
| `mistralai-ministral-3b-2512` | openai | 2 | 1 | 1 | 1 | 1 | 1 | 7 |
| **total** | | **10** | **5** | **5** | **5** | **5** | **5** | **35** |

By scenario: S07-confirm 5, S08-choice 5, S09-form 5, S10-tasks 5, S11-link-embed 10, S15-interleaving 5. S15 also produces a confirm card, which is why confirm is 2 per configuration; it was found by sweeping every fixture directory rather than by picking the scenarios the brief named.

Canned: 4 `artifact` envelopes (2 `canned/S13-artifact`, 2 `canned-anthropic/S13-artifact`).

## 2. Why zero is a real zero

Four checks, because a zero is the easiest number to produce by accident.

**The corpus is non-empty and asserted so.** The extraction fails if it finds zero envelopes, and again if it finds zero *live* envelopes. 39 and 35.

**Every type had a schema.** `validateCardData` returns `null` for a type it has no schema for, and `null` is not a pass. Count of `null` returns: 0. All six live types and the canned `artifact` were genuinely checked.

**The validator can fail on this exact path.** Seven negative controls, each a real extracted envelope mutated into the failure its tier names, each required to trip at the expected tier:

| control (built from a real envelope) | expected | got |
|---|---|---|
| `confirm`: blank action label (`minLength`) | soft | soft |
| `confirm`: tone `"catastrophic"` (`enum`) | soft | soft |
| `confirm`: 9 actions (`maxItems` 4) | soft | soft |
| `tasks`: blank task label (`minLength`) | soft | soft |
| `link`: 5000-char title (`maxLength` 300) | soft | soft |
| `confirm`: empty actions (`minItems`) | hard | hard |
| `choice`: numeric prompt (`type`) | hard | hard |

One of these caught a mistake in my own harness rather than in the product: a first attempt asserted `maxItems` on `tasks.tasks`, which has no `maxItems` in the projection (only `minItems: 1`). The control failed, which is what controls are for. The only `maxItems` on a live corpus type is `confirm.actions: 4`.

**Nothing was silently filtered out before validation.** The app discards tool calls that are malformed or provider-executed, so a bad card could in principle vanish before an envelope exists. Discarded calls across the whole corpus: **2**, both `get_weather` in the deliberately-malformed canned `S06b`, neither a card tool. **Zero live tool calls were discarded.** Every card the models asked for became an envelope and was checked.

## 3. Headroom

Zero trips would be weak if real values sat one character under their bounds. They do not:

| soft bound | limit | n | worst observed |
|---|---|---|---|
| `confirm.actions` maxItems | 4 | 10 | 2 |
| `confirm.actions[].label` minLength | 1 | 20 | 7 |
| `choice.options[].label` minLength | 1 | 20 | 5 |
| `tasks.tasks[].label` minLength | 1 | 25 | 9 |
| `link.title` maxLength | 300 | 5 | 21 |
| `link.description` maxLength | 1000 | 5 | 129 |
| `link.domain` maxLength | 253 | 5 | 10 |
| `embed.title` maxLength | 300 | 5 | 21 |
| `embed.id` maxLength 64 + `pattern` | 64 | 5 | 11, all matching |

`embed.id` is the sharpest constraint a model can plausibly get wrong: a model that writes a full YouTube URL where an id was asked for trips both `maxLength` and `pattern`. All five configurations emitted a bare 11-character id (`aqz-KE-bpKQ`), pattern-clean.

## 4. Method, and what it might miss

**Parsed, not replayed — then cross-checked against replay.**

The extraction reads each recorded `round-N.sse` with the kit's own wire readers (`readOpenAIStream` / `readAnthropicStream`, picked by fixture directory), applies the app's own filter `!c.error && !c.providerExecuted` (`useSpikeChat.ts:255`), and projects each surviving tool call through the spike's **own `runTool`, imported rather than reimplemented**. That matters: `src/tools.ts` assembles envelopes in app code from flatter tool arguments, so a raw tool call is not the envelope. `runTool` is pure and deterministic, which is what makes importing it faithful.

**The cross-check.** Six cells were then replayed through the real app under Playwright — dev-server proxy, real wire reader, real `runTool`, real `AssistantStream` — and the envelopes read back off `<kai-thread>.messages`, which is the object the rendering element actually receives. **7 envelopes compared, all identical to the parsed extraction**, spanning all six live card types, five configurations and both wires.

One cell initially produced nothing on replay: `anthropic-claude-haiku-4.5-anthropic-wire / S11-link-embed`. That is not a discrepancy in the extraction — the app picks its reader from the *server's* configured wire, not from the fixture directory, so an Anthropic-wire fixture replayed through a server on the OpenAI wire parses to an empty turn. It is the same failure `scenarios/types.ts` documents for S13. Re-run with `OPENROUTER_WIRE=anthropic`, it passed and matched.

**What this still misses.**

- **The `runTool` projection is hardened, so parts of the soft tier are unreachable in this corpus.** `runTool` clamps `confirm.tone` and `embed.provider` to their enums, generates `id` fields itself, slices `options`/`tasks` to 4/5, and fails the call outright below 2 options or 2 tasks. So `tone`/`provider` `enum`, `options[].id`/`tasks[].id` `minLength`, `confirm.actions` `maxItems` and every `minItems` are **not reachable from model text here**, and the corpus says nothing about them. What *is* reachable and did pass, because `toStr` returns an empty string unchanged rather than falling back: `confirm.actions[].label`, `choice.options[].label`, `tasks.tasks[].label` (`minLength`), and `link.title`/`link.description`/`embed.title`/`embed.id` (`maxLength`, `pattern`). Six distinct soft constraints, model-authored, none tripped. A consumer mapping tool calls to envelopes *without* this clamping has more exposure than this corpus measures.
- **No live `artifact`.** S13 exists only as canned fixtures, so the one card type with `anyOf` structure has no real-model evidence.
- **No structured-output path.** The spike's `cardMode: 'structured'` route (`parseReplyWithCard`) is never exercised by the harness, which records in `tool` mode only. Envelopes arriving as model-authored JSON rather than through `runTool` are unmeasured, and that is the path with the *most* exposure, since nothing clamps it.
- **Six card-producing scenarios**, not the full space of prompts. Five configurations is not five hundred.

## 5. Recommendation

**Ship the soft tier defaulting ON.** The bar the plan set was zero valid-looking real envelopes tripping it. The measured number is zero, out of 35 recorded from five model configurations across two wires, with the check proven live by seven negative controls, a fifth of the envelopes confirmed by replay through the real app, and comfortable margins on every bound a model actually authored.

No code change is required for this: `validateCards` already defaults `true` and gates both tiers together. There is no separate soft-tier switch, and this evidence says none needs to be added.

The residual risk is named above rather than argued away: the structured-output path and any consumer projection that does not clamp the way `runTool` does are outside what this measured. If the soft tier does turn out to be noisy in practice, it will be there, and the fix is the projection, not the tier.

---

## Reproducing

The extraction ran from a scratch harness that was not committed — it is ~200 lines whose only output is the table above, and a committed copy would be a test asserting a historical count against fixtures it does not own. To rebuild it: read every `round-N.sse` under `fixtures/`, parse with the reader matching the fixture's wire, filter `!c.error && !c.providerExecuted`, call `runTool(call.name, call.input ?? {})`, and run `validateCardData(card.type, card.data)` on each `run.card`. Assert the envelope count is non-zero before believing any zero.

The replay cross-check drives the app at `?scenario=<id>&mode=replay&fixture=live/<config>/<scenario>`, waits for `html[data-kai-phase="done"]`, and reads `document.querySelector('kai-thread').messages`, taking `parts[].envelope` where `parts[].type === 'card'`. Set `OPENROUTER_WIRE=anthropic` for the `-anthropic-wire` fixtures.
