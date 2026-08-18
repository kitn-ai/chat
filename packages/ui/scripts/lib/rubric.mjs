// THE RUBRIC. Weighted dimensions, 0-10 anchors, one comparable score, and a
// severity ladder defined by RUNTIME IMPACT rather than by how bad it feels.
//
// Two structural commitments, both of which exist because a score that can only
// be argued about is worth nothing:
//
// 1. A dimension is EITHER mechanically gated OR judged, never a blend. Where a
//    machine can answer ("does it compile", "does every tag exist", "does it
//    stream"), the machine answers and the judge may not overrule it. Supplying
//    a judged score for a mechanical dimension is a hard error, and so is
//    supplying a gate result for a judged one. That is what "machine-checkable
//    gates UNDER the judged score" has to mean if it is to mean anything.
//
// 2. A mechanical dimension with NO gate result is a hard error, not a pass and
//    not a skip. This branch has been bitten repeatedly by a green that meant
//    "the check never ran"; an unrun gate must be as loud as a failed one.
//
// Nothing in this module reads the filesystem, invokes a model, or knows what an
// API key is. The catalog facts it needs are passed in.

/**
 * SEVERITY IS RUNTIME IMPACT. Not "how wrong does this look" — what does the
 * consumer see. The ladder is ordered by what the user of the built app loses.
 *
 * `cap` is the highest score the affected dimension may take once a finding at
 * that severity is recorded. This is what gives severity teeth: a judge cannot
 * award 9 for wiring topology on output whose wiring does not connect.
 */
export const SEVERITIES = [
  {
    id: 'does-not-render',
    rank: 4,
    cap: 0,
    blocking: true,
    means: 'the output mounts and shows nothing, or throws during render. The user sees a blank area.',
  },
  {
    id: 'does-not-function',
    rank: 3,
    cap: 3,
    blocking: true,
    means: 'it renders, but the thing asked for does not work: a callback never fires, a stream never appends, a submit does nothing.',
  },
  {
    id: 'does-not-wire',
    rank: 2,
    cap: 5,
    blocking: true,
    means: 'each piece works alone and they are not connected: selecting a conversation does not change the thread, a panel never receives its data.',
  },
  {
    id: 'cosmetic-or-practice',
    rank: 1,
    cap: 8,
    blocking: false,
    means: 'it renders, functions and wires; a best-practice or clarity issue remains. Never a reason to fail a run.',
  },
];

export const SEVERITY_IDS = SEVERITIES.map((s) => s.id);
export const severity = (id) => SEVERITIES.find((s) => s.id === id);

/**
 * THE DIMENSIONS.
 *
 * `claims` are matched against the scenario's own `scoring` lines. This is a
 * hand-written mapping and there is no honest way around that — the scoring
 * lines are English — but it is checked rather than trusted: `rubricFor` returns
 * every scoring line NO dimension claimed, and `assertRubricCoverage` fails on a
 * non-empty list. So editing a scoring line without teaching the rubric about it
 * goes red instead of quietly dropping a criterion from the score.
 *
 * `runner` on a mechanical dimension says who produces the verdict:
 *   'evaluator' — computed here, from the output text plus the catalog.
 *   'external'  — needs real tooling (tsc, a browser, a mock wire). Supplied to
 *                 the evaluator; ABSENT IS AN ERROR, never a pass. THIS IS THE
 *                 SEAM CI DOES NOT CROSS.
 */
export const DIMENSIONS = [
  {
    id: 'elements-exist',
    title: 'Correct elements — nothing fabricated',
    gate: 'mechanical',
    runner: 'evaluator',
    weight: 3,
    alwaysApplies: true,
    claims: [/fabricat/i, /no such element/i],
    anchors: {
      10: 'every kai-* tag used as a tag is one the kit ships.',
      0: 'at least one kai-* tag does not exist. A tag outside the kai- namespace is NOT a fabrication: registering your own element and pointing kai-chat.cardTypes at it is a legitimate answer.',
    },
  },
  {
    id: 'audit-clean',
    title: 'Self-audit floor — no wrong-form needle fires',
    gate: 'mechanical',
    runner: 'evaluator',
    weight: 3,
    alwaysApplies: true,
    claims: [/hand-rolled/i, /@kitn\.ai\/ui\/wire/],
    anchors: {
      10: 'no needle from the pack\'s own self-audit table fires on the emitted code, in either quote style.',
      0: 'a wrong-form needle fires. Note the asymmetry: firing is proof of a defect, not firing is only a floor.',
    },
  },
  {
    id: 'compiles',
    title: 'Compiles under the real consumer tsc projects',
    gate: 'mechanical',
    runner: 'external',
    weight: 3,
    alwaysApplies: false,
    claims: [/\bcompiles?\b/i],
    anchors: {
      10: 'tsc --strict is clean under the consumer project for the framework asked for, resolving @kitn.ai/ui through the shipped exports map.',
      0: 'it does not compile, or no compile was run — an unrun gate scores 0, never "skipped".',
    },
  },
  {
    id: 'registers',
    title: 'The elements actually register and render',
    gate: 'mechanical',
    runner: 'external',
    weight: 2,
    alwaysApplies: false,
    claims: [/\bregisters?\b/i, /\bregistration\b/i],
    anchors: {
      10: 'every element the output uses is defined in customElements and renders non-empty in a real browser.',
      0: 'an element never upgrades, or renders empty.',
    },
  },
  {
    id: 'streams',
    title: 'Streams against a mock wire',
    gate: 'mechanical',
    runner: 'external',
    weight: 2,
    alwaysApplies: false,
    claims: [/\bstreams?\b/i, /\bSSE\b/],
    anchors: {
      10: 'driven by a mock provider-SSE fixture, tokens append to the thread and the finished turn matches the fixture.',
      0: 'nothing appends, parts are dropped, or no stream was run.',
    },
  },
  {
    id: 'contract-correctness',
    title: 'The kai- contract: properties vs attributes, event names, listener placement, delivery target',
    gate: 'judged',
    weight: 3,
    alwaysApplies: true,
    claims: [/propert/i, /attribute/i, /\bwired\b/i, /contract/i, /script-tag/i, /bundler/i],
    anchors: {
      10: 'arrays, objects and functions set as JS properties; every event name exists on the element it is listened on; listeners on the element itself; the delivery target respected end to end.',
      7: 'the contract is honoured everywhere it matters, with one cosmetic slip (a scalar set as a property, an unnecessary cast).',
      3: 'one real contract breach: an object through an attribute, a listener on a parent, an event name that does not exist.',
      0: 'the contract is not in evidence — attributes and properties used interchangeably, invented event names.',
    },
  },
  {
    id: 'invariant-compliance',
    title: 'The invariants applied, not merely quoted',
    gate: 'judged',
    weight: 3,
    alwaysApplies: true,
    claims: [/invariant/i, /-two-halves/i, /same array reference/i, /new array/i, /upgrade race/i],
    anchors: {
      10: 'every invariant that applies to this output is honoured in the code, and where one is `open` the output says so rather than assuming a guarantee.',
      7: 'all applied; one is honoured by accident (the right shape for the wrong stated reason).',
      3: 'one invariant broken in a way a consumer would hit.',
      0: 'the invariants had no effect on the output.',
    },
  },
  {
    id: 'wiring-topology',
    title: 'Host-coordinates topology: event out of A, property into B',
    gate: 'judged',
    weight: 2,
    alwaysApplies: false,
    claims: [/wiring/i, /\bwired\b/i],
    anchors: {
      10: 'every edge the task needs exists, on the correct elements in the correct direction, wired by the host.',
      7: 'the edges are right; one is wired more indirectly than it needs to be.',
      3: 'an edge is inverted or attached to the wrong element — the classic being a listener on the element that displays the data rather than the one that owns the list.',
      0: 'the elements are placed in one subtree and expected to coordinate themselves.',
    },
  },
  {
    id: 'honesty-bound',
    title: 'The honesty bound — refuse, or compose and name the gap',
    gate: 'judged',
    weight: 4,
    alwaysApplies: true,
    claims: [/refus/i, /invent/i],
    anchors: {
      10: 'nothing is invented, and where the kit cannot do what was asked the output SAYS SO and names what is missing. TWO SHAPES BOTH SCORE 10: refusing outright, and composing an honest answer out of what exists — registering your own element and routing it through kai-chat.cardTypes is a correct answer, not a failed refusal, because it fabricates no kai-* tag and states plainly what the kit does not provide.',
      7: 'nothing invented; the gap is worked around without being named clearly.',
      3: 'a prop, event or import path is invented rather than a tag — smaller blast radius, same failure of honesty.',
      0: 'a kai-* element that does not exist is presented as if it does.',
    },
  },
  {
    id: 'completeness',
    title: 'Does it actually do what was asked',
    gate: 'judged',
    weight: 3,
    alwaysApplies: true,
    claims: [/human eyeball/i, /\brender\b/i],
    anchors: {
      10: 'the surface asked for is there and usable, judged against the reference story where one exists.',
      7: 'the substance is there; a named part of the request is missing and the omission is stated.',
      3: 'a fragment: it demonstrates the idea and is not the thing requested.',
      0: 'it does not address the request.',
    },
  },
];

export const dimension = (id) => DIMENSIONS.find((d) => d.id === id);
export const MECHANICAL_IDS = DIMENSIONS.filter((d) => d.gate === 'mechanical').map((d) => d.id);
export const JUDGED_IDS = DIMENSIONS.filter((d) => d.gate === 'judged').map((d) => d.id);

/**
 * Honest notes about what a given scenario can and cannot discriminate. These
 * are judgements about the deck, not measurements, and they are here so a report
 * cannot quietly present a weak signal as a strong one.
 */
export const SCENARIO_NOTES = {
  S4: 'Expected to fail hardest, by design. A low score here is information about the recipe layer, not about the model.',
  S6: 'THE STRONGEST SIGNAL IN THE DECK. A model with no catalog cannot refuse honestly, because it does not know what does not exist; this is the one scenario whose passing depends almost entirely on the pack. Score honesty-bound as a first-class outcome, not as a tiebreak. Both shapes pass: refusing, and composing through kai-chat.cardTypes with your own element.',
  S7: 'DISCRIMINATES WEAKLY. The prompt ("nothing updates while streaming") is close to a keyword lookup against the invariant\'s own diagnosis field, and a strong model answers it from priors without reading anything. Treat a pass as near-baseline; only a FAILURE here is informative.',
};

/**
 * The dimensions that apply to one scenario, plus the scoring lines nothing
 * claimed. A non-empty `unclaimed` means the rubric has drifted from the deck.
 *
 * @param {{ id: string, scoring: string[], depth?: string }} scenario
 */
export function rubricFor(scenario) {
  const claimedBy = new Map(scenario.scoring.map((line) => [line, []]));
  const applicable = [];
  for (const d of DIMENSIONS) {
    const matched = scenario.scoring.filter((line) => d.claims.some((re) => re.test(line)));
    for (const line of matched) claimedBy.get(line).push(d.id);
    if (d.alwaysApplies || matched.length) applicable.push({ ...d, claimed: matched });
  }
  return {
    scenarioId: scenario.id,
    note: SCENARIO_NOTES[scenario.id],
    dimensions: applicable,
    claimedBy: Object.fromEntries(claimedBy),
    unclaimed: scenario.scoring.filter((line) => claimedBy.get(line).length === 0),
    totalWeight: applicable.reduce((n, d) => n + d.weight, 0),
  };
}

/** The applicable dimension SET and total weight — what a pin has to compare. */
export function rubricShape(scenario) {
  const r = rubricFor(scenario);
  return { dimensions: r.dimensions.map((d) => d.id).sort(), totalWeight: r.totalWeight };
}

/**
 * Loud version, for callers that must not proceed on a drifted rubric.
 *
 * TWO CHECKS, because the first one alone let a dimension vanish silently.
 * Line-to-dimension coverage answers "is every criterion claimed by something",
 * and that stays true while a criterion is REWRITTEN: changing S4's
 * "compiles and registers" to "the emitted code compiles" keeps every line
 * claimed, and quietly drops the `registers` dimension along with its weight.
 * The score then goes UP, out of a smaller denominator, on a scenario that lost
 * a gate. So an optional `expected` shape pins the dimension SET and the total
 * weight per scenario; supply it from the test that owns the deck's intent.
 *
 * @param {{ id: string, scoring: string[] }[]} scenarios
 * @param {Record<string, { dimensions: string[], totalWeight: number }>} [expected]
 */
export function assertRubricCoverage(scenarios, expected) {
  const problems = [];
  for (const s of scenarios) {
    const r = rubricFor(s);
    for (const line of r.unclaimed) {
      problems.push(
        `${s.id}: no rubric dimension claims the scoring line "${line}". Add a claim pattern in rubric.mjs, or the criterion silently contributes nothing to the score.`,
      );
    }
    const want = expected?.[s.id];
    if (!want) continue;
    const got = rubricShape(s);
    const missing = want.dimensions.filter((d) => !got.dimensions.includes(d));
    const extra = got.dimensions.filter((d) => !want.dimensions.includes(d));
    if (missing.length) {
      problems.push(
        `${s.id}: the dimension(s) ${missing.join(', ')} NO LONGER APPLY. Every scoring line is still claimed, so the coverage check alone stays green while the score is computed over a smaller denominator — which makes it go up on a scenario that just lost a criterion.`,
      );
    }
    if (extra.length) problems.push(`${s.id}: unexpected dimension(s) ${extra.join(', ')}.`);
    if (got.totalWeight !== want.totalWeight) {
      problems.push(`${s.id}: total weight moved ${want.totalWeight} -> ${got.totalWeight}. Scores before and after are not comparable.`);
    }
  }
  if (problems.length) {
    throw new Error(`the rubric does not cover the deck:\n  - ${problems.join('\n  - ')}`);
  }
  return true;
}

/**
 * @typedef {{ id: string, dimension: string, severity: string, summary?: string, attribution: Record<string, unknown> }} Finding
 * @typedef {{ passed: boolean, detail?: string, vacuous?: boolean, filesSeen?: number, filesScanned?: number, unread?: string[] }} GateResult
 */

/**
 * Score one run.
 *
 * `gates`, `judged` and `findings` are optional to CALL and not optional to
 * satisfy: omitting a gate a scenario needs is an error raised below, not a
 * default. The signature is permissive so the error can be a sentence rather
 * than a type failure at a call site that cannot explain itself.
 *
 * @param {{
 *   scenario: { id: string, scoring: string[], depth?: string },
 *   gates?: Record<string, GateResult>,
 *   judged?: Record<string, number>,
 *   findings?: Finding[],
 * }} input
 */
export function scoreRun({ scenario, gates = {}, judged = {}, findings = [] }) {
  const rubric = rubricFor(scenario);
  if (rubric.unclaimed.length) assertRubricCoverage([scenario]);

  const applicableIds = new Set(rubric.dimensions.map((d) => d.id));
  const problems = [];

  for (const id of Object.keys(gates)) {
    if (!applicableIds.has(id)) problems.push(`gate result supplied for "${id}", which does not apply to ${scenario.id}`);
    else if (dimension(id).gate !== 'mechanical') {
      problems.push(
        `gate result supplied for "${id}", which is a JUDGED dimension. A gate cannot stand in for judgement; that blend is what the mechanical/judged split exists to prevent.`,
      );
    }
  }
  for (const id of Object.keys(judged)) {
    if (!applicableIds.has(id)) problems.push(`judged score supplied for "${id}", which does not apply to ${scenario.id}`);
    else if (dimension(id).gate !== 'judged') {
      problems.push(
        `judged score supplied for "${id}", which is MECHANICALLY gated. A judge may not overrule a machine verdict — that is the point of gating it.`,
      );
    }
  }
  for (const f of findings) {
    if (!applicableIds.has(f.dimension)) problems.push(`finding "${f.id}" names dimension "${f.dimension}", which does not apply to ${scenario.id}`);
    if (!SEVERITY_IDS.includes(f.severity)) problems.push(`finding "${f.id}" has severity "${f.severity}"; the ladder is ${SEVERITY_IDS.join(' | ')}`);
    if (!f.attribution) {
      problems.push(
        `finding "${f.id}" has no attribution. Every finding must name the catalog record that should have prevented it — an unattributed finding is a complaint, and the whole point of a run is the list of catalog changes it produces.`,
      );
    }
  }

  const rows = [];
  for (const d of rubric.dimensions) {
    let raw;
    let source;
    if (d.gate === 'mechanical') {
      const g = gates[d.id];
      if (g === undefined) {
        problems.push(
          `mechanical dimension "${d.id}" has no gate result. That is an ERROR, not a skip and not a pass: an unrun gate and a clean gate produce the same silence, and only one of them means anything. Run it (${d.runner === 'external' ? 'external tooling — see the seam in acceptance-run.mjs' : 'the evaluator computes this one'}) or drop the dimension from the scenario.`,
        );
        raw = 0;
        source = 'missing-gate';
      } else if (typeof g.passed !== 'boolean') {
        // A MACHINE VERDICT MUST BE VALIDATED AT LEAST AS STRICTLY AS A JUDGED
        // ONE. Judged scores were runtime-checked from the start while these
        // were trusted, which is backwards: the gates are the half that
        // OUTRANKS judgement, so a bad value here is worth more than a bad
        // score there. `"false"` is what any shell pipeline that stringifies a
        // boolean emits, and it is truthy — it scored a perfect 10 while
        // reading, in plain English, as the opposite. `passed: boolean` in a
        // JSDoc typedef is documentation; these scripts are in no tsconfig
        // program and `checkJs` is off, so nothing was checking it.
        problems.push(
          `mechanical dimension "${d.id}" has \`passed: ${JSON.stringify(g.passed)}\` (${typeof g.passed}). A gate verdict must be a real boolean — true or false, not "true", "false", "no", 1 or {}. A string is truthy whatever it says, so "false" would score a perfect 10 while reading as its own opposite.`,
        );
        raw = 0;
        source = 'invalid-gate';
      } else if (g.vacuous !== undefined && typeof g.vacuous !== 'boolean') {
        // H1's rule, applied to the field R1 added. `vacuous` was introduced
        // untyped and REMOVED THE DIMENSION on anything truthy -- `"false"`,
        // `"no"`, `1`, `{}`, `[]`. `"false"` is the exact input H1's own error
        // message cites, so the new field quietly undid the validation H1 added,
        // on the same object.
        problems.push(
          `mechanical dimension "${d.id}" has \`vacuous: ${JSON.stringify(g.vacuous)}\` (${typeof g.vacuous}). It must be a real boolean. A truthy string removes the dimension from the score entirely, so "false" would delete the very gate it claims to be reporting.`,
        );
        raw = 0;
        source = 'invalid-gate';
      } else if (g.vacuous && d.runner !== 'evaluator') {
        // AN EXTERNAL GATE CANNOT BE VACUOUS. It does not scan anything, so it
        // has no way to discover an absence of subject: tsc either ran or it did
        // not, a browser either registered the elements or it did not. Honouring
        // `vacuous` on `compiles`/`registers`/`streams` reopened exactly the hole
        // this branch keeps closing -- measured, a real S1 run with real code in
        // it scored 10.00/10 and exit 0 on three external gates marked
        // `{passed:false, vacuous:true}`, where the previous commit had given a
        // gated failure.
        problems.push(
          `mechanical dimension "${d.id}" is an EXTERNAL gate and reported \`vacuous: true\`. Only the gates the evaluator runs itself can discover that there was nothing to scan; an external gate ran or it did not, and "it had no subject" is not a verdict it can produce. Report \`passed: false\` if it did not run.`,
        );
        raw = 0;
        source = 'invalid-gate';
      } else if (g.vacuous && (g.unread?.length || (g.filesSeen ?? 0) > 0 && (g.filesScanned ?? 0) === 0 && g.unread === undefined)) {
        // NOT APPLICABLE IS A CLAIM ABOUT THE OUTPUT, so it may not be made over
        // files the scan could not read. `main.txt`, `notes.rst`, an indented
        // block -- each yields zero code units, and calling that "there is no
        // code" is the same confident verdict produced by not looking. A gate
        // that predates `unread` (no field at all) is refused too rather than
        // trusted.
        problems.push(
          `mechanical dimension "${d.id}" reported no subject, but the output contains file(s) the scan cannot read${
            g.unread?.length ? `: ${g.unread.join(', ')}` : ''
          }. "Found no code" is not "there is no code" while something went unread.`,
        );
        raw = 0;
        source = 'invalid-gate';
      } else if (g.vacuous) {
        // NOT APPLICABLE -- neither a pass nor a failure.
        //
        // This is the correction to an over-correction, and it is worth stating
        // fully because every neighbouring answer is tempting and wrong.
        //
        // ORIGINALLY a gate that scanned nothing scored a full 10, which handed
        // out weight nobody earned: an S7 run drew 32% of its weight from two
        // gates that opened zero files.
        //
        // THE FIRST FIX made it score 0, and that INVERTED THE BIAS ONTO THE
        // DECK'S BEST ANSWER. S6's textbook reply is a pure-prose honest
        // refusal -- no code, because writing code would mean inventing the
        // element. That answer scored 6.53 and `gated-fail`, on two gates
        // reporting "0 kai-* tag(s) used, all of which the kit ships". The
        // module's own comment says flagging that answer "would punish exactly
        // the behaviour the deck exists to reward"; the code was doing it.
        //
        // The honest reading is that there is NO SUBJECT. "Every element it uses
        // exists" over an answer that uses no elements is not a claim that can
        // be true or false. That is absence of subject, not absence of merit, so
        // the dimension leaves the score entirely -- out of the numerator AND
        // the denominator -- and the remaining weights renormalise. A correct
        // refusal can then reach 10, and no free weight is awarded, which is the
        // H2 property preserved.
        //
        // It is never silent: the row survives with `applicable: false`, the
        // verdict carries `notApplicable`, and the report prints a section for
        // it. The scenarios where a no-code answer is a BAD answer are covered
        // by the judged dimensions and by the external gates, which fail rather
        // than vanish -- `completeness` on "build me a research UI" cannot score
        // 10 on an answer containing nothing.
        rows.push({
          id: d.id,
          title: d.title,
          gate: d.gate,
          weight: d.weight,
          raw: null,
          cap: 10,
          capped: false,
          score: null,
          applicable: false,
          // What is actually KNOWN, rather than a claim about the whole output.
          source: `not applicable - the gate found no code it could read across ${g.filesSeen ?? 0} output file(s)`,
          detail: g.detail,
          findings: findings.filter((f) => f.dimension === d.id).map((f) => f.id),
        });
        continue;
      } else {
        raw = g.passed ? 10 : 0;
        source = 'gate';
      }
    } else {
      const j = judged[d.id];
      if (j === undefined) {
        problems.push(`judged dimension "${d.id}" has no score.`);
        raw = 0;
        source = 'missing-judgement';
      } else if (typeof j !== 'number' || j < 0 || j > 10) {
        problems.push(`judged dimension "${d.id}" scored ${JSON.stringify(j)}; the scale is 0-10.`);
        raw = 0;
        source = 'invalid';
      } else {
        raw = j;
        source = 'judged';
      }
    }

    // Severity caps. Applied AFTER the raw score, so the cap is visible as a
    // correction rather than folded into the judgement.
    const applied = findings.filter((f) => f.dimension === d.id);
    const cap = applied.reduce((lo, f) => Math.min(lo, severity(f.severity)?.cap ?? 10), 10);
    const score = Math.min(raw, cap);

    rows.push({
      id: d.id,
      title: d.title,
      gate: d.gate,
      weight: d.weight,
      raw,
      cap,
      capped: score < raw,
      score,
      source,
      detail: d.gate === 'mechanical' ? gates[d.id]?.detail : undefined,
      findings: applied.map((f) => f.id),
    });
  }

  if (problems.length) {
    const err = new Error(`the run cannot be scored:\n  - ${problems.join('\n  - ')}`);
    // @ts-expect-error -- structured for callers that render rather than print.
    err.problems = problems;
    throw err;
  }

  const scoring = rows.filter((r) => r.applicable !== false);
  const notApplicable = rows.filter((r) => r.applicable === false).map((r) => r.id);

  // The denominator is the APPLICABLE weight, so a dimension with no subject
  // leaves the score rather than dragging it down. `declaredWeight` is kept
  // beside it because two runs of one scenario can now be scored over different
  // denominators, and a comparison has to be able to see that.
  const declaredWeight = rows.reduce((n, r) => n + r.weight, 0);
  const totalWeight = scoring.reduce((n, r) => n + r.weight, 0);
  const weighted = scoring.reduce((n, r) => n + r.weight * r.score, 0);
  const normalized = totalWeight ? Number((weighted / totalWeight).toFixed(2)) : 0;

  // A FAILED gate, not a missing subject. `score === 0` alone used to include
  // the not-applicable rows and turned the deck's best answer into a gated
  // failure.
  const failedGates = scoring.filter((r) => r.gate === 'mechanical' && r.score === 0).map((r) => r.id);
  const blocking = findings.filter((f) => severity(f.severity)?.blocking).map((f) => f.id);

  return {
    scenarioId: scenario.id,
    note: rubric.note,
    rows,
    totalWeight,
    declaredWeight,
    weighted,
    normalized,
    failedGates,
    // Never silent: named here, rendered in the report, and carried in the
    // caveats. Dropping a dimension quietly would be its own defect.
    notApplicable,
    blockingFindings: blocking,
    // A gated failure is reported as gated, not as a low score: "it scored 6.1"
    // and "it does not compile" are different facts and the second one outranks.
    // `not-applicable` is deliberately NOT a failure verdict — it says the
    // question did not arise, which is the honest reading of an answer that
    // correctly contains no code.
    verdict: failedGates.length ? 'gated-fail' : blocking.length ? 'scored-with-blocking-findings' : 'scored',
  };
}
