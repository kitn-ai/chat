// Declared model-behaviour differences: a cell that is RED because the model
// does something else, not because the kit is broken.
//
// WHY THIS EXISTS. `run-matrix.mjs` used to exit 0 with red cells, so the
// distinction never mattered. Now that its exit code is truthful, a full sweep
// would exit 1 forever on two ministral cells that are documented, expected, and
// not defects — and a gate that is permanently red trains everyone to read red as
// noise, which is worse than the bug that made it always green.
//
// The alternative was hard-coding "ignore ministral S02 and S04" in the runner.
// That is how a gate quietly stops covering things: an exemption nobody has to
// re-justify outlives the reason for it. So this mirrors `KnownGap`, which solved
// the same problem for kit gaps, and `MODELS[].reasons`, which solved it for
// reasoning coverage — DECLARED, specific, and held to account in BOTH directions.
//
// The half most exemption mechanisms get wrong is the second one:
//
//   1. a declared difference must still FAIL, with the DOCUMENTED failure;
//   2. a declared difference that starts PASSING must go red too.
//
// (2) is what stops this becoming a permanent hole with a comment on it. A
// difference that quietly disappears should surface, not sit here forever.
//
// `KnownGap` earns (1) with `reached` — a precondition proving the run got far
// enough for the gap to be observable, which is what stopped a broken run being
// recorded as a confirmed gap. The equivalent here is `instead`: you cannot write
// it without having gone and found out what the model actually does. `what` can
// be copied off the scenario and `signature` can be pasted from a failure;
// `instead` cannot be produced without looking.

/** A documented difference between what a scenario asks for and what one
 *  configuration actually does. */
export interface ModelBehaviour {
  /** What the scenario asks for. */
  what: string;
  /**
   * What THIS configuration does instead.
   *
   * Load-bearing, and the reason this type is not just `{ reason, signature }`:
   * it is unwritable without having examined the recordings. It is also what a
   * reader needs in order to judge whether the declaration is still true.
   */
  instead: string;
  /** The failure this difference actually produces, matched against the
   *  assertion's own message so an unrelated red cannot pass for it. */
  signature: RegExp;
  /**
   * When this was last MEASURED, `YYYY-MM-DD`.
   *
   * Because "the provider cannot do X" is not a durable claim — it is "did not,
   * on this date". Measured precedent, not theory: `gpt-5.4-mini` emitted only
   * `reasoning.encrypted` in one sweep and `reasoning.summary` with 2,111 chars
   * of readable text in the next, same model, same request shape, hours apart.
   * A declaration carrying its own date makes a stale one visibly suspect in a
   * way prose never does.
   */
  observed: string;
}

/** Keyed `${model}|${wire}` — the SAME pair that identifies a fixture directory.
 *
 *  Not keyed by the matrix's `key` on purpose: the model and the wire are read
 *  back from the running server, so a declaration cannot be matched against a
 *  configuration the run was not actually measuring. Keying by a label the
 *  runner passes in would let a mislabelled column claim another one's
 *  exemptions. It also means these apply to a plain `pnpm conformance` run, not
 *  only to a matrix sweep. */
export const MODEL_BEHAVIOURS: Record<string, Record<string, ModelBehaviour>> = {
  'mistralai/ministral-3b-2512|openai': {
    'S02-reasoning': {
      what: 'reasoning deltas render as a collapsed disclosure that opens to real text',
      instead:
        'ministral-3b has no reasoning mode at all. Across 27 recorded requests it emitted no ' +
        '`reasoning` field, no `reasoning_details`, and 0 reasoning tokens, so there is no ' +
        'disclosure to render and nothing for the UI to get wrong. Declared `reasons: false` in ' +
        'the matrix catalog for the same reason.',
      signature: /waiting for getByRole\('button', \{ name: 'Thinking' \}\)/,
      observed: '2026-08-11',
    },
    'S04-multi-round': {
      what: 'a tool loop that runs three SEQUENTIAL rounds, each call depending on the last',
      instead:
        'ministral-3b emits all three tool calls in a single batch and settles in two rounds. ' +
        'The tool panels render correctly and the answer is right — it is a planning difference, ' +
        'not a UI or adapter failure. The scenario says so in its own failure text.',
      signature: /the loop settled in \d+ rounds? — the three calls arrived in one batch/,
      observed: '2026-08-11',
    },
  },
};

/** The declaration for one cell, or `undefined` if the cell is expected to pass.
 *
 *  Takes the model and wire the SERVER reported, never a label supplied by the
 *  runner. */
export function modelBehaviourFor(
  model: string | undefined,
  wire: string | undefined,
  scenarioId: string,
): ModelBehaviour | undefined {
  if (!model || !wire) return undefined;
  return MODEL_BEHAVIOURS[`${model}|${wire}`]?.[scenarioId];
}

/** Every declaration, flattened, for the catalog self-consistency test. */
export function allModelBehaviours(): Array<{ key: string; scenarioId: string; behaviour: ModelBehaviour }> {
  return Object.entries(MODEL_BEHAVIOURS).flatMap(([key, byScenario]) =>
    Object.entries(byScenario).map(([scenarioId, behaviour]) => ({ key, scenarioId, behaviour })),
  );
}
