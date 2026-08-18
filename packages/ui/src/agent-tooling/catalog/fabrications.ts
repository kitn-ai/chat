import { z } from 'zod';

/**
 * Tags agents invented while working from an acceptance pack, and what they
 * should have used instead. The pack's `FABRICATED.md` is rendered from this.
 *
 * WHY THIS IS AN AUTHORED RECORD AND NOT A LOG THE EVALUATOR APPENDS TO.
 * A row here is a claim about the tree — "the kit does not ship this tag" — and
 * the claim rots in one direction that matters: the day the kit ships
 * `kai-datagrid`, a row saying it does not exist becomes a lie told to every
 * future agent, on the one page whose whole job is telling agents what is real.
 * Living beside `invariants.ts` puts it where `fabrications.test.ts` can resolve
 * it against `derived.json` in both directions on every CI run. A JSON log
 * written by a judged run would have neither the review nor the check.
 *
 * The schema is declared here rather than in `catalog-types.ts` because this
 * record arrived a task later than that file and nothing else consumes the
 * shape; fold it in there if a second consumer appears.
 *
 * EVERY ROW COMES FROM AN OBSERVED RUN. Do not seed it with tags a model might
 * plausibly invent — a fabricated fabrication is exactly the failure the page
 * exists to prevent, and it would be indistinguishable from a real one.
 */
export const Fabrication = z
  .object({
    /** The tag that was written and does not exist. Checked ABSENT from derived.json. */
    invented: z.string().regex(/^kai-[a-z0-9-]+$/),
    /** What the agent was trying to accomplish, in its own terms. */
    wanted: z.string().min(1),
    /** The real element to reach for. Checked PRESENT in derived.json when non-null. */
    useInstead: z.string().regex(/^kai-[a-z0-9-]+$/).nullable(),
    /**
     * Required when `useInstead` is null. "There is nothing for this" is a real
     * and useful answer — S6 exists to elicit exactly that — but it has to be
     * said, because a blank cell reads as an unfinished row.
     */
    noReplacementReason: z.string().min(1).optional(),
    /** ISO date of the run that first produced it. */
    firstSeen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Provenance, so a row can be traced back to the run that observed it. */
    scenario: z.string().min(1),
    model: z.string().min(1),
  })
  .refine((f) => f.useInstead !== null || Boolean(f.noReplacementReason), {
    message: 'a row with no `useInstead` must carry `noReplacementReason`',
    path: ['noReplacementReason'],
  });

export type TFabrication = z.infer<typeof Fabrication>;

/**
 * EMPTY, and that is the honest state: the apparatus that would fill it (Task
 * 8b's runner and evaluator) has just been built and no acceptance run has been
 * performed. `FABRICATED.md` says the same thing in the same words to the agent.
 */
export const fabrications: TFabrication[] = [];

export function listFabrications(): TFabrication[] {
  return z.array(Fabrication).parse(fabrications);
}

/**
 * Resolve rows against the tags the kit actually ships, in BOTH directions.
 *
 * This is a named function rather than a loop inside the test for one reason:
 * the record is empty, so a loop over it iterates zero times and passes whatever
 * the rule is. Deleting both assertions left the suite green. A rule that cannot
 * be exercised is not a guard, and the direction it protects — `invented`, the
 * one that rots when the kit later ships the tag — is the direction this file's
 * own comment says matters most.
 *
 * Extracted so it can be run over FIXTURES that make it fire, and over the live
 * record, from the same code path.
 *
 * @returns problems; empty means every row resolves
 */
export function resolveFabrications(rows: TFabrication[], knownTags: Iterable<string>): string[] {
  const known = new Set(knownTags);
  if (known.size === 0) {
    // Otherwise every row "resolves" in the direction that matters and none in
    // the other, which is a broken input reported as a clean record.
    return ['no known tags were supplied, so nothing could be resolved'];
  }
  const problems: string[] = [];
  for (const row of rows) {
    if (known.has(row.invented)) {
      problems.push(
        `\`${row.invented}\` is recorded as invented, but the kit SHIPS it now. Delete the row: it tells every future agent that a real element does not exist, on the one page whose job is saying what is real.`,
      );
    }
    if (row.useInstead && !known.has(row.useInstead)) {
      problems.push(`\`${row.invented}\` points at \`${row.useInstead}\` as the replacement, and the kit does not ship that either.`);
    }
  }
  return problems;
}
