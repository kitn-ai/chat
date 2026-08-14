// The matrix catalog: every configuration the conformance sweep measures.
//
// This lives in its own module rather than inside `run-matrix.mjs` because
// `run-matrix.mjs` RUNS a sweep at import time. Anything that wants to know what
// the columns are — the reasoning-coverage guard, its vitest spec — would
// otherwise have to launch Playwright to find out.
//
// Chosen to close gaps rather than for breadth:
//
//  1. the baseline everything else was proven on;
//  2. an Anthropic model through OpenRouter's Anthropic Skin — the ONLY way to
//     drive `readAnthropicStream` and `toAnthropicMessages` against a live
//     provider, and the least-proven path in the kit;
//  3. the SAME Anthropic model through the OpenAI-compatible endpoint, so a
//     failure in (2) can be attributed to the wire or to the model, not to both;
//  4. a genuine OpenAI model, to show the OpenAI reader is not accidentally
//     shaped around DeepSeek's dialect;
//  5. a small cheap model, to measure the floor of what a consumer gets away with.
//
// Every field is DECLARED, none inferred. Two of them are load-bearing for the
// reasoning-coverage guard and neither is optional:
//
//  · `wire` — the SSE dialect. It picks the fixture directory (`fixtureSlug`
//    appends `-anthropic-wire`) and, critically, the spelling of the usage field
//    that reports thinking tokens: the two dialects do not share one. Leaving it
//    to be derived from the model id would put a second copy of `resolveWire`'s
//    rule here; instead `server/reasoning-coverage.test.ts` pins each declaration
//    against the proxy's own `resolveWire` and `fixtureSlug`, so the rule stays
//    in one place and the declaration cannot drift from it.
//
//  · `reasons` — whether this configuration is expected to emit reasoning at all.
//    A column declared `true` that records zero thinking tokens across an entire
//    sweep is a FAILURE, not a datum. That is not hypothetical: `haiku-oai`
//    recorded exactly that for a whole sweep and it was published as a provider
//    limit ("Haiku emits no reasoning on the OpenAI wire") when it was our own
//    request shape — a derived thinking budget under Anthropic's 1024 floor,
//    answered with HTTP 200 and silence. See `server/thinking-budget.test.ts`.
//    There is no default: a new column with no `reasons` is a hard failure, so a
//    model cannot join the matrix and quietly opt out of the check.

//  · `backend` — which SERVER HOP the column is driven through, and the third
//    thing (with the model and the wire) that names a fixture directory. It was
//    added when the comparison pair below arrived, because those two columns run
//    the SAME model on the SAME wire and differ only in the hop: without it they
//    would share one directory and each run would overwrite the other's
//    evidence, leaving a comparison of a column against itself.

/** @type {import('./models.mjs').MatrixModel[]} */
export const MODELS = [
  { key: 'deepseek', model: '~deepseek/deepseek-v4-flash-latest', wire: 'openai', backend: 'openrouter', port: 5180, reasons: true },
  { key: 'haiku', model: 'anthropic/claude-haiku-4.5', wire: 'anthropic', backend: 'openrouter', port: 5181, reasons: true },
  { key: 'haiku-oai', model: 'anthropic/claude-haiku-4.5', wire: 'openai', backend: 'openrouter', port: 5182, reasons: true },
  { key: 'gpt', model: 'openai/gpt-5.4-mini', wire: 'openai', backend: 'openrouter', port: 5183, reasons: true },
  // Ministral genuinely has no reasoning mode. It is declared, not special-cased:
  // a check that hard-codes an exemption by model id stops being a check the
  // moment a second non-reasoning model arrives, and the declaration is held to
  // account in the other direction too — a `false` column that DOES emit
  // reasoning fails as `mislabelled`.
  { key: 'ministral', model: 'mistralai/ministral-3b-2512', wire: 'openai', backend: 'openrouter', port: 5184, reasons: false },

  // ── the backend comparison pair ──────────────────────────────────────────
  //
  // Same model id, same wire, same scenarios; the ONLY difference is the server
  // hop. That is what makes a difference between these two rows attributable to
  // the integration rather than to the model, and it is the same reason
  // `haiku` / `haiku-oai` are both in the list one axis over.
  //
  // `openai/gpt-oss-120b` and not the spike's usual DeepSeek because it is the
  // only family a FREE AI Gateway account can reach: every other id (deepseek/*,
  // meta/*, anthropic/*) answers `Free tier users do not have access to this
  // model` or a free-tier rate limit until the account carries paid credits.
  { key: 'gptoss-or', model: 'openai/gpt-oss-120b', wire: 'openai', backend: 'openrouter', port: 5185, reasons: true },
  // `reasons: false` and it is NOT a claim about the model — this column streams
  // plenty of reasoning TEXT, and you can read it in its own fixtures. It is a
  // claim about what the CONFIGURATION reports, which is what this flag is
  // enforced against: the AI SDK hands the route `outputTokenDetails.reasoningTokens`
  // as 0 for this provider, so every recorded round carries
  // `reasoning_tokens: 0` while its OpenRouter twin above carries a real count.
  // Declaring `true` here would fail as `silent` for a reason the guard's own
  // message would misdescribe. The divergence is the finding, not the flag:
  // reasoning TEXT survives the AI SDK's usage mapping and the reasoning TOKEN
  // COUNT does not.
  { key: 'gptoss-gw', model: 'openai/gpt-oss-120b', wire: 'openai', backend: 'gateway', port: 5186, reasons: false },
];
