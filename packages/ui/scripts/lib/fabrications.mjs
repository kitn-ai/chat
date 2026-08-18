// The FABRICATED.md page, rendered from the authored fabrication record.
//
// Task 8a seeded this page empty by construction and had no way to fill it: the
// packer renders the pack, and a run happens long after the pack is written, so
// the write-back has to land somewhere the NEXT pack reads. 8a's implementer
// proposed an authored record beside `invariants.ts` so the "use instead" tags
// can be resolved against `derived.json`. That is followed here, and the reason
// it is right is stronger than the one given: the row that rots is not
// `useInstead`, it is `invented`. The day the kit ships `kai-datagrid`, a row
// saying that tag does not exist becomes a lie told to every future agent, and
// only a check against the tree can notice. So the record is resolved in BOTH
// directions — `invented` must be absent from the derived layer, `useInstead`
// must be present in it — by `fabrications.test.ts`.
//
// What is deliberately NOT automated: the evaluator does not write into the
// authored record. It emits a proposed row and the operator commits it. A judged
// run editing catalog source unattended is how a mis-scored run teaches every
// later agent that a real element is imaginary.
//
// Rendering lives here rather than in acceptance-pack.mjs so both states can be
// tested directly. The empty state is not a placeholder and its wording is
// load-bearing: an empty table means nobody has looked, and the page has to say
// so or it reads as "agents get this right".

/**
 * @typedef {{ invented: string, wanted: string, useInstead: string | null, noReplacementReason?: string, firstSeen: string }} FabricationRow
 */

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * @param {FabricationRow[]} rows
 */
export function renderFabricatedPage(rows = []) {
  const header = ['| invented | what the agent wanted | what to use instead | first seen |', '| --- | --- | --- | --- |'];
  const body = rows.map(
    (r) =>
      `| \`${cell(r.invented)}\` | ${cell(r.wanted)} | ${
        r.useInstead ? `\`${cell(r.useInstead)}\`` : `_nothing — ${cell(r.noReplacementReason ?? 'no replacement recorded')}_`
      } | ${cell(r.firstSeen)} |`,
  );

  const intro = rows.length
    ? `**${rows.length} recorded.** Every row below is a tag an agent working from
this pack wrote confidently, and which does not exist. The list grows only from
observed runs; it is not a guess at what a model might invent.`
    : `**This section is empty. No acceptance runs have happened yet.**

That is the honest state of it, not a placeholder: this page is the accumulated
memory of tags, props and events that agents working from this pack have
confidently written and which do not exist. It can only be filled in by running
the deck and recording what came back, so until a run happens there is nothing
truthful to put here.

Do not read the emptiness as "agents get this right". Read it as "nobody has
looked yet".`;

  return `# Components other agents invented

${intro}

${[...header, ...body].join('\n')}

## When this table has rows

Check anything you are about to write against it, and against
[ELEMENTS.md](ELEMENTS.md), which is the authoritative list either way.
`;
}

/**
 * The row an evaluator PROPOSES from a fabricated-element attribution. Returned
 * for the operator to paste into the authored record; never written there by the
 * evaluator itself.
 *
 * @param {{ attribution: object }} finding
 * @param {{ scenarioId: string, model: string, date: string }} run
 * @returns {FabricationRow & { scenario: string, model: string }}
 */
export function proposedFabricationRow(finding, run) {
  const a = finding.attribution;
  if (a.kind !== 'fabricated-element') {
    throw new Error(`proposedFabricationRow was given a ${a.kind} attribution; only fabricated-element produces a row.`);
  }
  return {
    invented: a.invented,
    wanted: a.wanted ?? finding.summary ?? '(not recorded)',
    useInstead: a.useInstead ?? null,
    ...(a.useInstead ? {} : { noReplacementReason: a.noReplacementReason }),
    firstSeen: run.date,
    scenario: run.scenarioId,
    model: run.model,
  };
}
