/**
 * The text of the REQUIRED merge gate, as one string.
 *
 * WHY THIS EXISTS
 * Thirteen wiring tests used to carry a byte-identical private copy of
 * `jobBlock(yaml, 'test')` and assert their guard's script appeared in it. That
 * duplication was deliberate ("duplicated locally so the blocks stay
 * independent") and it was right while `test` was one job. It stops being right
 * the moment `test` becomes an aggregator: thirteen hand-typed job lists would
 * rot on the first leg rename, which is exactly the defect class the repo's
 * "derive it, don't type it" rule is about.
 *
 * So there is one derivation, here, and it reads the graph out of the workflow:
 * `test` plus every job transitively reachable through its `needs:`. On a
 * workflow whose `test` declares no `needs:` that is `test` alone, so this is
 * backward compatible by construction.
 *
 * THE TRADE, STATED. One helper feeding thirteen guards means one bug blinds all
 * thirteen at once. Two mitigations, both cheap and both required:
 *   1. This function carries its own vacuity floor. A graph that parses to
 *      fewer `run:` steps than the floor throws instead of returning a thin
 *      string that every `toContain` would fail loudly on -- and, worse, that a
 *      future `not.toContain` would pass over silently.
 *   2. Every caller keeps its own `expect(block).not.toBe('')`. That assertion
 *      is what turns a renamed root job into a named failure in each file
 *      rather than a mystery here.
 *
 * This is a SECOND derivation of the same graph `packages/ui/scripts/lint-gate-parity.mjs`
 * computes (`requiredJobGraph`), and that is on purpose: these tests exist to
 * check that linter, so importing its parser would let one bug blind both the
 * linter and its guard at once.
 *
 * No YAML parser: the repo carries none in this layer on purpose, and the
 * question is answerable from the job's lines. Same crude extraction the
 * thirteen copies used, hoisted rather than reinvented.
 */

/** The root of the required graph. The name branch protection requires. */
const ROOT_JOB = 'test';

/**
 * The vacuity floor, deliberately equal to `MIN_RUN_STEPS` in
 * `packages/ui/scripts/lint-gate-parity.mjs`. NOT a count of anything: it is the
 * tripwire that fires when this parse stops following `needs:`. A hand-kept copy
 * rather than an import, because this file must work with no build and the
 * linter does not export it; if the linter's floor moves, move this with it.
 */
const MIN_RUN_STEPS = 30;

/** The body of one top-level job, from its `  <name>:` line to the next one. */
function jobBlock(yaml: string, job: string): string {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}[A-Za-z0-9_-]+:/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** One job's `needs:`, in any of the three spellings GitHub accepts. */
function needsOf(block: string): string[] {
  const inline = /^ {4}needs:[ \t]*(\S.*)$/m.exec(block);
  if (inline) {
    const rest = inline[1]!.trim();
    if (rest.startsWith('[')) {
      return rest
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter((s) => s !== '');
    }
    return [rest.replace(/^['"]|['"]$/g, '')];
  }
  const seq = /^ {4}needs:[ \t]*\n((?: {6}- .+\n?)+)/m.exec(block);
  if (!seq) return [];
  return seq[1]!
    .split('\n')
    .map((l) =>
      l
        .replace(/^ {6}- /, '')
        .trim()
        .replace(/^['"]|['"]$/g, ''),
    )
    .filter((s) => s !== '');
}

export function requiredGateBlock(yaml: string, rootJob: string = ROOT_JOB): string {
  const seen: string[] = [];
  const queue: string[] = [rootJob];
  const parts: string[] = [];

  while (queue.length > 0) {
    const job = queue.shift() as string;
    if (seen.includes(job)) continue;
    seen.push(job);
    const block = jobBlock(yaml, job);
    if (block === '') {
      // The ROOT being absent is the caller's `not.toBe('')` assertion to
      // report, in its own words, naming its own workflow path.
      if (job === rootJob) return '';
      throw new Error(
        `the \`${rootJob}\` graph names a job \`${job}\` that is not in the workflow. ` +
          `A \`needs:\` pointing at nothing means the gate does not include what it thinks it does.`,
      );
    }
    parts.push(block);
    for (const next of needsOf(block)) {
      if (!seen.includes(next)) queue.push(next);
    }
  }

  const text = parts.join('\n');
  const runSteps = text.split('\n').filter((line) => /^ {8}run:/.test(line)).length;
  if (runSteps < MIN_RUN_STEPS) {
    throw new Error(
      `the required gate graph (${seen.join(', ')}) parsed ${runSteps} \`run:\` step(s), under this ` +
        `helper's floor. One derivation feeds every guard-wiring test, so a parse that quietly ` +
        `stopped following \`needs:\` would blind all of them at once -- see ` +
        `\`node packages/ui/scripts/lint-gate-parity.mjs --list\` for what the graph should contain.`,
    );
  }
  return text;
}
