# Parallel CI split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the serial required `test` job in `.github/workflows/test.yml` into five parallel legs behind a `test` aggregator, and teach every guard that scopes to "the job named `test`" that the merge gate is now a job GRAPH.

**Architecture:** `build` runs the pre-install guards, the install, the eleven no-build lints and `nx build ui`, then uploads one `kit-dist` artifact. Four legs (`construct`, `unit`, `dist-guards`, `browser`) each `needs: build`, download that artifact, and run their slice of the existing steps unchanged. A `test` job with `needs:` all five and `if: always()` derives its verdict from `toJSON(needs)`, so the required check keeps its name and a forgotten leg cannot be ungated. `lint-gate-parity.mjs` and one shared test helper both compute `test` union its transitive `needs:`, which degenerates to `test` on the pre-split tree, so both land green before the workflow moves.

**Tech Stack:** GitHub Actions, node 22 stdlib (no YAML dependency anywhere in the guards), vitest, pnpm + NX.

**Spec:** `docs/superpowers/research/2026-09-01-ci-split-design.md` (authoritative, owner-approved as designed), plus the section "Rulings after the extraction and CI investigations" in `docs/superpowers/specs/2026-09-01-repo-restructure-design.md`. That section arrives with the `fix/release-requires-storybook-gate` branch; if it is not in your checkout yet, read it there.

## Global Constraints

- **Branch `feat/ci-parallel-split`.** One branch, one PR, tasks committed in order. Do not create a worktree; this is sequential work in the main checkout.
- **Every commit ends with these trailers**, on their own lines after a blank line:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
  ```
- **No test is removed and no gate loses a step.** The multiset of (gate id, step name) pairs printed by `node packages/ui/scripts/lint-gate-parity.mjs --list` must lose nothing. It gains exactly one gate, `@kitn.ai/ui run verify:artifact-glob`, introduced by Task 3. Removals must be empty; Task 6 checks both directions.
- **`verify:quarantine` stays first inside `packages/ui`'s `typecheck` script.** Never flatten `pnpm exec nx typecheck ui` into separate workflow steps: the chain is `&&`-joined and the MCP pass is red on any unbuilt tree, so anywhere else in the order the rot check is skipped on exactly the fresh clones where rot hides.
- **`verify:generated` never consumes the build artifact.** It invokes `build:api` directly and never through NX, and that independence is the point. It goes in `dist-guards`, which uploads nothing.
- **`dedupe:shiki`'s position in `packages/ui`'s `build` script is untouched.** Nothing enforces it; do not reorder or split that hand-written `&&` chain.
- **No `.nx/cache` persistence.** The nx cache has returned wrong verdicts in both directions. The build artifact is keyed by the run, not by an input hash, and that distinction is the whole reason it is allowed.
- **`timeout-minutes: 5` stays on the Playwright install step.** It has hung to the job ceiling three times.
- **macOS `sed -i ''`.** Any in-place sed in these steps runs on darwin and needs the empty backup argument.
- **No em dashes and no emoji in any new text.** Use `--`. Match the surrounding voice: sharp human engineer, not AI-generated.
- **Two doc linters scan `docs/superpowers/**` and must stay green** after every commit that touches markdown: `node packages/ui/scripts/lint-gate-parity.mjs` and `node packages/ui/scripts/lint-threshold-derivation.mjs`.

---

## File map

| Path | Responsibility after this plan |
|---|---|
| `packages/ui/scripts/lint-gate-parity.mjs` | canonical gate set over the required job GRAPH, plus two new hard failures |
| `packages/ui/tests/scripts/lib/required-gate-block.ts` | NEW. One `requiredGateBlock(yaml)` for all 13 wiring tests, with its own vacuity floor |
| 13 `*-wiring.test.ts` files | consume the helper instead of a private `jobBlock` copy |
| `packages/ui/scripts/verify-artifact-glob.mjs` | NEW. Proves the upload glob covers everything the build writes into the source tree |
| `packages/ui/tests/scripts/artifact-glob-guard-wiring.test.ts` | NEW. Proves that guard detects, and that CI runs it |
| `.github/workflows/test.yml` | five legs plus the aggregator |
| `docs/coupling-map.md` | two new rows |

---

### Task 0: Baseline

**Files:**
- Create: `<scratch>/before.txt`, `<scratch>/baseline.md` (scratch only, never committed)

**Interfaces:**
- Produces: `<scratch>/before.txt`, the pre-split `--list` output that Task 6 diffs against. Nothing in the repo depends on it.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/home/Projects/kitn-ai/kitn-chat
git checkout main && git pull --ff-only origin main
git checkout -b feat/ci-parallel-split
```

- [ ] **Step 2: Record the gate set as it stands**

Pick a scratch directory outside the repo and use it for every file in this task. Run:

```bash
node packages/ui/scripts/lint-gate-parity.mjs --list | tee "$SCRATCH/before.txt" | head -3
```

Expected: a first line of the form ``the `test` job runs <n> gate(s):``. The design says that number is 46. **Do not restate 46 anywhere.** Copy the number the command printed into `$SCRATCH/baseline.md` and treat the file as the authority for the rest of the plan.

- [ ] **Step 3: Record the current wall time of the required job on main**

```bash
gh run list --workflow test.yml --branch main --limit 5 \
  --json databaseId,conclusion,createdAt,updatedAt \
  --jq '.[] | "\(.databaseId) \(.conclusion) \(.createdAt) \(.updatedAt)"'
```

Take the most recent `success` run id, then:

```bash
gh api repos/kitn-ai/ui/actions/runs/<run-id>/jobs \
  --jq '.jobs[] | select(.name == "test") | "\(.started_at) \(.completed_at)"'
```

Append both timestamps and the derived duration to `$SCRATCH/baseline.md`. Task 6 puts the post-split number next to it.

- [ ] **Step 4: Confirm the two doc linters are green before anything moves**

```bash
node packages/ui/scripts/lint-gate-parity.mjs
node packages/ui/scripts/lint-threshold-derivation.mjs
```

Expected: both exit 0. If either is already red, stop and report -- this plan cannot tell its own breakage from a pre-existing one.

- [ ] **Step 5: No commit**

This task writes nothing into the repo. Do not commit.

---

### Task 1: Teach `lint-gate-parity.mjs` the job graph

**Files:**
- Modify: `packages/ui/scripts/lint-gate-parity.mjs`
- Test: the file's own `--self-test`, run via `node packages/ui/scripts/lint-gate-parity.mjs --self-test`

**Interfaces:**
- Produces, all exported from `lint-gate-parity.mjs`:
  - `jobNames(yamlText): string[]`
  - `needsOf(yamlText, jobName): string[]`
  - `requiredJobGraph(yamlText, rootJob = 'test'): string[]` -- breadth-first, root first, no duplicates
  - `analyzeWorkflow(yamlText, { jobName, minRunSteps, exemptJobs }): { steps, gates, plumbing, runStepCount, graph }` -- same shape as today plus `graph`
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing self-test cases**

Open `packages/ui/scripts/lint-gate-parity.mjs`. Immediately after the existing `FIXTURE_WORKFLOW` template literal ends (the line `` `; `` that closes it) and before `const FIXTURE_GATES`, insert:

```js
// The SAME seven gates as FIXTURE_WORKFLOW, spread across a split graph. If the
// union derivation is right, these two workflows analyze identically -- which is
// the property that makes the real split a refactor rather than a rewrite of the
// gate set. `storybook` carries a gate and is NOT reachable from `test`: it is
// the exempt case, and renaming it is how the unreachable rule gets watched.
const FIXTURE_SPLIT_WORKFLOW = `name: test

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Alpha guard
        run: pnpm --filter @kitn.ai/ui run lint:alpha

      - name: Build
        run: pnpm exec nx build ui

  unit:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Unit tests (jsdom)
        run: pnpm --filter @kitn.ai/ui exec vitest run --project=unit

      - name: Bare script spelling
        run: pnpm --filter @kitn.ai/ui test:react

  browser:
    needs: [build]
    runs-on: ubuntu-latest
    steps:
      - name: Suite in a subtree
        working-directory: examples/starters/tanstack-start
        run: node --test --test-reporter=spec

      - name: Two packages, one step
        run: |
          npm install --prefix "\$RUNNER_TEMP/pin" npm@12.0.2
          pnpm --filter create-kai run verify:pack
          pnpm --filter @kitn.ai/ui run verify:pack

  test:
    needs: [build, unit, browser]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Verdict
        run: echo 'every leg green'

  storybook:
    runs-on: ubuntu-latest
    steps:
      - name: A gate in the EXEMPT storybook job
        run: pnpm --filter @kitn.ai/ui run lint:not-this-job
`;
```

Then, inside the `if (SELF_TEST && IS_MAIN)` block, immediately after the existing `// -- the vacuity floor --` try/catch closes and before `// -- an unrecognised step shape --`, insert:

```js
  // -- the job graph --
  try {
    const split = analyzeWorkflow(FIXTURE_SPLIT_WORKFLOW, { minRunSteps: 5 });
    const got = [...split.gates.keys()].sort();
    const want = [...FIXTURE_GATES].sort();
    report(
      JSON.stringify(got) === JSON.stringify(want),
      'a split graph yields the SAME gate set as the single-job workflow',
      `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`,
    );
    report(
      JSON.stringify(split.graph) === JSON.stringify(['test', 'build', 'unit', 'browser']),
      'the graph is `test` plus its transitive needs, root first',
      `(${split.graph.join(', ')})`,
    );
  } catch (err) {
    report(false, 'a split graph yields the SAME gate set as the single-job workflow', `threw: ${err.message}`);
  }

  // A gate-bearing job nobody aggregates is the split's own failure mode: the
  // step still runs, `--list` still prints it, and nothing gates on it.
  try {
    analyzeWorkflow(FIXTURE_SPLIT_WORKFLOW.replace('  storybook:', '  stray:'), { minRunSteps: 5 });
    report(false, 'a gate-bearing job unreachable from `test` is a hard failure');
  } catch (err) {
    report(
      err instanceof GuardError &&
        /not reachable from/.test(err.message) &&
        /stray/.test(err.message) &&
        /lint:not-this-job/.test(err.message),
      'a gate-bearing job unreachable from `test` is a hard failure',
      `(${err.message.split('\n')[0]})`,
    );
  }

  // The degenerate aggregator: a thin `test` with no `needs:` and no gates. The
  // step floor would also catch it, but only by accident of size -- this names
  // the actual shape, and it is the shape a half-finished split leaves behind.
  try {
    analyzeWorkflow(FIXTURE_SPLIT_WORKFLOW.replace('    needs: [build, unit, browser]\n', ''), {
      minRunSteps: 1,
    });
    report(false, 'a root `test` with no `needs:` and no gates is a hard failure');
  } catch (err) {
    report(
      err instanceof GuardError && /declares no `needs:` and runs no gate/.test(err.message),
      'a root `test` with no `needs:` and no gates is a hard failure',
      `(${err.message.split('\n')[0]})`,
    );
  }

  // Exempt by NAME, so the exemption cannot silently widen.
  report(
    EXEMPT_JOBS.has('storybook') && EXEMPT_JOBS.has('storybook-gate') && EXEMPT_JOBS.size === 2,
    'the unreachable rule exempts exactly the two storybook jobs, by name',
    `(${[...EXEMPT_JOBS].join(', ')})`,
  );
```

- [ ] **Step 2: Run the self-test and watch the new cases FAIL**

```bash
node packages/ui/scripts/lint-gate-parity.mjs --self-test
```

Expected: FAIL. `EXEMPT_JOBS is not defined` from the last case, and the graph cases report `threw:` or the wrong verdict, because `analyzeWorkflow` still scopes to one job and returns no `graph`. Do not proceed until you have seen these red.

- [ ] **Step 3: Add the exemption set and the graph parsers**

In `packages/ui/scripts/lint-gate-parity.mjs`, replace this line:

```js
const JOB = 'test';
```

with:

```js
const JOB = 'test';

// Jobs that carry gate-shaped steps and are deliberately NOT part of the
// required graph. `storybook` runs the flaky browser project and aggregates
// through `storybook-gate`, which is its OWN required context in ruleset
// 18328421 -- a sibling gate, not a leg of this one. Exempting them by name, in
// one place, with this reason, is the same idiom as the doc scan's exemption of
// CLAUDE.md. Anything else in this workflow that carries a gate must be
// reachable from `test`, or the step runs while gating nothing.
const EXEMPT_JOBS = new Set(['storybook', 'storybook-gate']);
```

Then, immediately after the `unquote` helper (the block ending `  return t;\n};`), insert:

```js
// ---------------------------------------------------------------------------
// the job graph
//
// The required gate is no longer one job. It is `test` plus every job
// transitively reachable through its `needs:`, and it is READ from the workflow
// rather than listed here -- `derive it, don't type it`, applied to the thing
// the split creates. Over a workflow whose `test` declares no `needs:` the union
// degenerates to `test` alone, so this is backward compatible by construction.
// ---------------------------------------------------------------------------

/** Every top-level job name, in file order. */
export function jobNames(yamlText) {
  const lines = yamlText.split('\n');
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt === -1) throw new GuardError('no top-level `jobs:` mapping in the workflow');
  const names = [];
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const l = lines[i];
    if (isSkippable(l)) continue;
    if (indentOf(l) === 0) break; // left the jobs mapping
    const m = /^\s{2}([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (m) names.push(m[1]);
  }
  return names;
}

/** One job's `needs:`, in any of the three spellings GitHub accepts. */
export function needsOf(yamlText, jobName) {
  const lines = yamlText.split('\n');
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt === -1) throw new GuardError('no top-level `jobs:` mapping in the workflow');

  let jobAt = -1;
  for (let i = jobsAt + 1; i < lines.length; i++) {
    if (isSkippable(lines[i])) continue;
    if (indentOf(lines[i]) === 0) break;
    if (new RegExp(`^\\s{2}${jobName}:\\s*$`).test(lines[i])) {
      jobAt = i;
      break;
    }
  }
  if (jobAt === -1) throw new GuardError(`no \`${jobName}:\` job in the workflow`);

  const jobIndent = indentOf(lines[jobAt]);
  for (let i = jobAt + 1; i < lines.length; i++) {
    if (isSkippable(lines[i])) continue;
    if (indentOf(lines[i]) <= jobIndent) break; // left the job
    if (indentOf(lines[i]) !== jobIndent + 2) continue;
    const m = /^\s*needs:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const rest = m[1].trim();
    if (rest.startsWith('[')) {
      return rest
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(',')
        .map((s) => unquote(s))
        .filter((s) => s !== '');
    }
    if (rest !== '') return [unquote(rest)];
    const out = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (isSkippable(lines[j])) continue;
      if (indentOf(lines[j]) <= jobIndent) break;
      const seq = /^\s*-\s+(\S+)\s*$/.exec(lines[j]);
      if (!seq) break;
      out.push(unquote(seq[1]));
    }
    return out;
  }
  return [];
}

/** `rootJob` plus every job reachable through `needs:`, breadth-first, root first. */
export function requiredJobGraph(yamlText, rootJob = JOB) {
  const seen = [];
  const queue = [rootJob];
  while (queue.length > 0) {
    const job = queue.shift();
    if (seen.includes(job)) continue;
    seen.push(job);
    for (const n of needsOf(yamlText, job)) {
      if (!seen.includes(n)) queue.push(n);
    }
  }
  return seen;
}
```

- [ ] **Step 4: Rewrite `analyzeWorkflow` over the union**

Replace the whole existing `export function analyzeWorkflow(...) { ... }` body (from its `export function analyzeWorkflow` line down to and including its closing `}` before the `// the doc side` banner) with:

```js
export function analyzeWorkflow(
  yamlText,
  { jobName = JOB, minRunSteps = MIN_RUN_STEPS, exemptJobs = EXEMPT_JOBS } = {},
) {
  const graph = requiredJobGraph(yamlText, jobName);

  const steps = [];
  const gates = new Map(); // id -> [step names]
  const plumbing = [];
  const unknown = [];
  let runStepCount = 0;

  for (const job of graph) {
    for (const step of extractSteps(yamlText, job)) {
      steps.push(step);
      const hasRun = typeof step.run === 'string' && step.run.trim() !== '';
      if (hasRun) runStepCount += 1;
      if (!hasRun) {
        // `uses:` steps are actions -- checkout, setup-node, the pnpm action,
        // the caches, the artifact upload and download. None of them gate.
        if (step.uses) {
          plumbing.push({ step, job, why: `uses: ${step.uses}` });
          continue;
        }
        unknown.push({ step, job, cmd: '(no `run:` and no `uses:`)' });
        continue;
      }
      for (const cmd of commandsOf(step.run)) {
        const c = classifyCommand(cmd, { stepName: step.name, workingDirectory: step.workingDirectory });
        if (c.kind === 'gate') {
          if (!gates.has(c.id)) gates.set(c.id, []);
          gates.get(c.id).push(step.name ?? `line ${step.line}`);
        } else if (c.kind === 'plumbing') {
          plumbing.push({ step, job, why: cmd });
        } else {
          unknown.push({ step, job, cmd });
        }
      }
    }
  }

  // The degenerate aggregator, named before the size floor gets to it. A thin
  // `test` that neither runs a gate nor names a leg IS the half-finished split,
  // and the floor would only catch it by accident of being small.
  if (graph.length === 1 && gates.size === 0) {
    throw new GuardError(
      `the \`${jobName}\` job declares no \`needs:\` and runs no gate.\n` +
        `  That is an aggregator with nothing behind it: the required check would be green over a\n` +
        `  workflow that gates nothing. Either it runs the gates, or it names the jobs that do.`,
    );
  }

  if (runStepCount < minRunSteps) {
    throw new GuardError(
      `extractor found almost nothing -- the workflow moved.\n` +
        `  Parsed ${steps.length} step(s) across the required graph (${graph.join(', ')}), ` +
        `${runStepCount} of them with a \`run:\`,\n` +
        `  which is below the floor of ${minRunSteps}. An empty-ish gate set would make every documented\n` +
        `  list match, so this refuses to run rather than pass. Fix the extractor, not the floor.`,
    );
  }

  if (unknown.length > 0) {
    const detail = unknown
      .map((u) => `    [${u.job}] ${u.step.name ?? `(unnamed, line ${u.step.line})`}\n      ${u.cmd}`)
      .join('\n');
    throw new GuardError(
      `unrecognised step shape(s) in the required graph (${graph.join(', ')}) -- teach me this shape or mark it plumbing.\n` +
        `  Every step must canonicalize to a stable identifier or be classified as setup, or a new\n` +
        `  kind of gate silently falls outside every documented list:\n${detail}\n` +
        `  Add a rule to classifyCommand() in ${relative(REPO_ROOT, fileURLToPath(import.meta.url))}.`,
    );
  }

  // THE TEETH OF THE SPLIT. A job carrying gate-shaped steps that no `needs:`
  // chain reaches from `test` still runs on every PR, still prints in `--list`,
  // and gates NOTHING -- a check wearing the shape of coverage, which is the
  // failure this repo has already been bitten by twice. Moving a step out of the
  // graph must be as loud as deleting it.
  for (const job of jobNames(yamlText)) {
    if (graph.includes(job) || exemptJobs.has(job)) continue;
    let jobSteps;
    try {
      jobSteps = extractSteps(yamlText, job);
    } catch {
      continue; // a job with no steps gates nothing
    }
    const found = [];
    for (const step of jobSteps) {
      if (typeof step.run !== 'string' || step.run.trim() === '') continue;
      for (const cmd of commandsOf(step.run)) {
        const c = classifyCommand(cmd, { stepName: step.name, workingDirectory: step.workingDirectory });
        if (c.kind === 'gate') found.push(`    ${c.id}\n      ${step.name ?? `line ${step.line}`}`);
      }
    }
    if (found.length > 0) {
      throw new GuardError(
        `job \`${job}\` runs gate(s) and is not reachable from \`${jobName}\` through \`needs:\`.\n` +
          `${found.join('\n')}\n` +
          `  The required graph is ${graph.join(', ')}. A check outside it runs on every PR and blocks\n` +
          `  nothing. Add the edge, or exempt the job by name in EXEMPT_JOBS with a written reason.`,
      );
    }
  }

  return { steps, gates, plumbing, runStepCount, graph };
}
```

- [ ] **Step 5: Run the self-test and watch every case PASS**

```bash
node packages/ui/scripts/lint-gate-parity.mjs --self-test
```

Expected: PASS, every line prefixed with a check mark, including the four new cases.

- [ ] **Step 6: Confirm backward compatibility on the real, unsplit workflow**

```bash
node packages/ui/scripts/lint-gate-parity.mjs
node packages/ui/scripts/lint-gate-parity.mjs --list > "$SCRATCH/after-task1.txt"
diff <(sort "$SCRATCH/before.txt") <(sort "$SCRATCH/after-task1.txt")
```

Expected: the lint exits 0, and the diff is EMPTY. Over today's workflow `test` declares no `needs:`, so the union is `{test}` and nothing about the output can move. If the diff is not empty, the union derivation is wrong; fix it before going on.

- [ ] **Step 7: Report the graph in `--list` and in the summary line**

In the `if (LIST)` block, after the existing `plus ... plumbing step(s)` line, insert:

```js
  if (analysis.graph.length > 1) {
    console.log(`  the gate is the job GRAPH: ${analysis.graph.join(', ')}`);
  }
```

The guard on `length > 1` keeps the pre-split output byte-identical, which is what makes Task 6's base-versus-branch diff a comparison of gate sets rather than of headers.

Then replace the summary line:

```js
console.log(
  `  · ${analysis.gates.size} gate(s) from ${WORKFLOW}:${JOB} (${analysis.runStepCount} run steps), ` +
    `${docFiles.length} doc file(s) under ${DOC_ROOT}/`,
);
```

with:

```js
console.log(
  `  · ${analysis.gates.size} gate(s) from ${WORKFLOW}:${analysis.graph.join('+')} ` +
    `(${analysis.runStepCount} run steps), ${docFiles.length} doc file(s) under ${DOC_ROOT}/`,
);
```

The `(<n> run steps)` shape is load-bearing: `gate-parity-guard-wiring.test.ts` greps it with `/\((\d+) run steps\)/`.

- [ ] **Step 8: Update the file header to describe the graph**

In the header comment, replace this paragraph:

```
// THE INVARIANT
// A block in `docs/superpowers/**` that CLAIMS to enumerate the merge gate must
// equal the `test` job's gate set, both directions. A block that looks like such
// an enumeration and claims nothing is a hard failure until somebody says which
// of the two it is.
```

with:

```
// THE INVARIANT
// A block in `docs/superpowers/**` that CLAIMS to enumerate the merge gate must
// equal the REQUIRED GRAPH's gate set, both directions. A block that looks like
// such an enumeration and claims nothing is a hard failure until somebody says
// which of the two it is.
//
// THE GATE IS A GRAPH, NOT A JOB. `test` is an aggregator whose legs run in
// parallel, so the gate set is `test` UNION every job transitively reachable
// through its `needs:`, read from the workflow rather than listed here. Two hard
// failures hold that shape up: a root `test` with no `needs:` and no gates (the
// half-finished split), and any job in this workflow that carries a gate-shaped
// step and is NOT reachable from `test` (the check that runs while gating
// nothing). The second is the whole reason the split is safe, and `storybook` /
// `storybook-gate` are exempt from it BY NAME, in EXEMPT_JOBS, with the reason
// written there.
```

- [ ] **Step 9: Re-run both linters and commit**

```bash
node packages/ui/scripts/lint-gate-parity.mjs --self-test
node packages/ui/scripts/lint-gate-parity.mjs
node packages/ui/scripts/lint-threshold-derivation.mjs
git add packages/ui/scripts/lint-gate-parity.mjs
git commit
```

Commit message body:

```
feat(ci): lint-gate-parity scopes to the required job GRAPH

The required gate stops being one job the moment `test` becomes an
aggregator. The gate set is now `test` union its transitive `needs:`,
read from the workflow, which degenerates to `test` alone on this tree --
so the gate set is unchanged and the `--list` output is byte-identical.

Two new hard failures carry the split: a root `test` with no `needs:` and
no gates, and a gate-bearing job unreachable from `test`. Both are
watched firing in `--self-test` before anything trusts them.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

---

### Task 2: One shared `requiredGateBlock` helper for the wiring tests

**Files:**
- Create: `packages/ui/tests/scripts/lib/required-gate-block.ts`
- Modify (13 files, each losing a private `jobBlock` and gaining an import):
  - `packages/ui/tests/agent-tooling/emitted-project-wiring.test.ts`
  - `packages/ui/tests/scripts/catalog-drift-guard-wiring.test.ts`
  - `packages/ui/tests/scripts/cdn-pins-guard-wiring.test.ts`
  - `packages/ui/tests/scripts/dts-boundaries-guard-wiring.test.ts`
  - `packages/ui/tests/scripts/gate-parity-guard-wiring.test.ts`
  - `packages/ui/tests/scripts/generated-sync-guard-wiring.test.ts`
  - `packages/ui/tests/scripts/llms-size-guard-wiring.test.ts`
  - `packages/ui/tests/scripts/pack-parse-guard-wiring.test.ts`
  - `packages/ui/tests/scripts/schemas-exported-guard-wiring.test.ts`
  - `packages/ui/tests/scripts/silent-drop-guard-wiring.test.ts`
  - `packages/ui/tests/scripts/solid-coverage-guard-wiring.test.ts`
  - `packages/ui/tests/scripts/ssr-render-guard-wiring.test.ts`
  - `packages/ui/tests/scripts/threshold-derivation-guard-wiring.test.ts`
- Do NOT touch: `packages/ui/tests/scripts/publish-gate-wiring.test.ts` (its `jobBlock` takes ONE argument and reads `release-please.yml`) and `packages/create-kai/test/publish-shape.test.ts` (whole-file regex).

**Interfaces:**
- Produces: `requiredGateBlock(yaml: string, rootJob?: string): string` from `packages/ui/tests/scripts/lib/required-gate-block.ts`. Returns the concatenated text of `test` and every job transitively reachable through `needs:`, or `''` when the root job is absent. Throws on a graph whose `run:` count falls under the vacuity floor, and on a `needs:` naming a job that does not exist.
- Consumes: nothing from Task 1 at run time. It re-derives the graph from the same YAML by the same rule, deliberately: one bug in one parser must not blind both the linter and the tests that check the linter.

- [ ] **Step 1: Write the helper**

Create `packages/ui/tests/scripts/lib/required-gate-block.ts`:

```ts
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
    .map((l) => l.replace(/^ {6}- /, '').trim().replace(/^['"]|['"]$/g, ''))
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
```

- [ ] **Step 2: Run one wiring test unchanged, to fix the baseline**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/cdn-pins-guard-wiring.test.ts
```

Expected: PASS. This is the "before" reading. If the whole suite dies on `Cannot find module ... jest-dom`, the checkout needs `pnpm install`, then `pnpm --filter @kitn.ai/ui run build:css`, then a real build -- see CLAUDE.md's three-things rule. That is a broken environment, not a broken test.

- [ ] **Step 3: Prove the helper's vacuity floor FIRES before trusting it**

Run this one-off probe (it writes nothing into the repo):

```bash
cat > "$SCRATCH/floor-probe.mjs" <<'EOF'
const { requiredGateBlock } = await import('./packages/ui/tests/scripts/lib/required-gate-block.ts');
EOF
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/gate-parity-guard-wiring.test.ts 2>&1 | tail -5
```

Then add a temporary case to `packages/ui/tests/scripts/gate-parity-guard-wiring.test.ts` inside its top-level `describe`, run it, watch it pass, and KEEP it (it is the mitigation the design asks for):

```ts
  it('the shared gate-block helper refuses a graph it can barely parse', () => {
    // One helper feeds thirteen guards, so its own failure is thirteen silent
    // greens. Point it at a workflow whose `test` names no legs and runs almost
    // nothing: it must throw rather than hand back a thin block.
    expect(() =>
      requiredGateBlock('jobs:\n  test:\n    steps:\n      - name: Only one\n        run: pnpm --filter @kitn.ai/ui run lint:gate-parity\n'),
    ).toThrow(/under this helper's floor/);
  });

  it('the shared helper reports a `needs:` that names nothing', () => {
    expect(() =>
      requiredGateBlock(`${readFileSync(WORKFLOW, 'utf-8')}`.replace('  test:\n', '  test:\n    needs: [ghost]\n')),
    ).toThrow(/not in the workflow/);
  });
```

- [ ] **Step 4: Strip the thirteen private copies mechanically**

Every one of the thirteen carries the identical function (`pack-parse-guard-wiring.test.ts` differs only by a `lines[i]!` non-null assertion). Run this from the repo root:

```bash
node - <<'EOF'
const { readFileSync, writeFileSync } = require('node:fs');
const files = [
  'packages/ui/tests/agent-tooling/emitted-project-wiring.test.ts',
  'packages/ui/tests/scripts/catalog-drift-guard-wiring.test.ts',
  'packages/ui/tests/scripts/cdn-pins-guard-wiring.test.ts',
  'packages/ui/tests/scripts/dts-boundaries-guard-wiring.test.ts',
  'packages/ui/tests/scripts/gate-parity-guard-wiring.test.ts',
  'packages/ui/tests/scripts/generated-sync-guard-wiring.test.ts',
  'packages/ui/tests/scripts/llms-size-guard-wiring.test.ts',
  'packages/ui/tests/scripts/pack-parse-guard-wiring.test.ts',
  'packages/ui/tests/scripts/schemas-exported-guard-wiring.test.ts',
  'packages/ui/tests/scripts/silent-drop-guard-wiring.test.ts',
  'packages/ui/tests/scripts/solid-coverage-guard-wiring.test.ts',
  'packages/ui/tests/scripts/ssr-render-guard-wiring.test.ts',
  'packages/ui/tests/scripts/threshold-derivation-guard-wiring.test.ts',
];
for (const file of files) {
  let text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const fnAt = lines.findIndex((l) => l.startsWith('function jobBlock(yaml: string, job: string): string {'));
  if (fnAt === -1) throw new Error(`no jobBlock in ${file}`);
  let start = fnAt;
  // Swallow the JSDoc block immediately above it, if there is one.
  if (lines[start - 1] === ' */') {
    let i = start - 1;
    while (i >= 0 && !lines[i].startsWith('/**')) i -= 1;
    if (i < 0) throw new Error(`unterminated JSDoc above jobBlock in ${file}`);
    start = i;
  }
  let end = fnAt;
  while (end < lines.length && lines[end] !== '}') end += 1;
  if (end >= lines.length) throw new Error(`unterminated jobBlock in ${file}`);
  // Drop the function, its comment, and the single blank line after it.
  const after = lines[end + 1] === '' ? end + 2 : end + 1;
  const kept = [...lines.slice(0, start), ...lines.slice(after)];
  text = kept.join('\n');
  const rel = file.includes('/tests/scripts/')
    ? './lib/required-gate-block'
    : '../scripts/lib/required-gate-block';
  const importLine = `import { requiredGateBlock } from '${rel}';`;
  // Place the import after the LAST existing import line.
  const out = text.split('\n');
  let lastImport = -1;
  for (let i = 0; i < out.length; i += 1) if (out[i].startsWith('import ')) lastImport = i;
  if (lastImport === -1) throw new Error(`no imports in ${file}`);
  out.splice(lastImport + 1, 0, importLine);
  text = out.join('\n');
  text = text.replaceAll("jobBlock(readFileSync(WORKFLOW, 'utf-8'), 'test')", 'requiredGateBlock(readFileSync(WORKFLOW, \'utf-8\'))');
  writeFileSync(file, text);
  console.log(`rewrote ${file}`);
}
EOF
```

- [ ] **Step 5: Confirm no `jobBlock` reference survives in those thirteen**

```bash
grep -rn "jobBlock" packages/ui/tests | grep -v publish-gate-wiring
```

Expected: NO output. If anything prints, fix that call site by hand. Then confirm the one file that must keep its copy still has it:

```bash
grep -c "function jobBlock" packages/ui/tests/scripts/publish-gate-wiring.test.ts
```

Expected: `1`.

- [ ] **Step 6: Reword the `--project=unit` canary comment and message in every file that carries it**

The canary changes meaning under a union: it used to prove "this job still runs the suite" and now proves "the graph still runs it". Say so, or it reads as a check that stopped being about anything. In each of the twelve files that contain the string `the \`test\` job no longer runs the unit project either`, replace the two-line comment and the message. The comment currently reads:

```ts
    // If the extraction ever returns nothing (the job was renamed, the indentation
    // changed), everything below would pass vacuously. Fail here instead.
```

Replace with:

```ts
    // Two vacuity guards, and they answer different questions now that the gate
    // is a GRAPH. The empty check catches a renamed root job; the `--project=unit`
    // canary catches a graph that stopped reaching the leg that runs the suite,
    // which is what a dropped `needs:` edge looks like from in here.
```

And replace the message:

```ts
      'the `test` job no longer runs the unit project either — read this guard',
```

with:

```ts
      'the required gate graph no longer runs the unit project either -- read this guard',
```

`pack-parse-guard-wiring.test.ts` has no canary; leave its assertions alone apart from the call-site rewrite Step 4 already did.

- [ ] **Step 7: Fix `gate-parity-guard-wiring.test.ts`'s independent step count**

That file counts `run:` lines itself and requires the linter's reported count to EQUAL it. Both sides must now be the graph. Step 4 already repointed the extraction; confirm the surrounding assertion still reads:

```ts
    const block = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));
    const independent = block.split('\n').filter((line) => /^ {8}run:/.test(line)).length;
    expect(independent, 'the independent count found no run steps; this test is broken').toBeGreaterThan(30);
```

Leave the numeric floor exactly as it is: it is the same floor the linter uses, and the union only ever grows it.

- [ ] **Step 8: Run every affected test**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts tests/agent-tooling/emitted-project-wiring.test.ts
```

Expected: PASS, all thirteen files plus the untouched `publish-gate-wiring.test.ts`.

- [ ] **Step 9: Typecheck and commit**

```bash
pnpm --filter @kitn.ai/ui run typecheck
git add packages/ui/tests
git commit
```

Commit message body:

```
refactor(tests): one derived gate block for the wiring guards

Thirteen wiring tests carried a byte-identical private `jobBlock(yaml,
'test')`. That duplication was right while `test` was one job and rots
the moment it becomes an aggregator, so there is now one
`requiredGateBlock(yaml)` deriving `test` union its transitive `needs:`.

The trade is real and mitigated in two places: the helper carries its own
vacuity floor, watched firing, and every caller keeps its
`expect(block).not.toBe('')`. `publish-gate-wiring.test.ts` keeps its own
copy -- different signature, different workflow.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

---

### Task 3: The artifact-glob coverage guard

**Files:**
- Create: `packages/ui/scripts/verify-artifact-glob.mjs`
- Create: `packages/ui/tests/scripts/artifact-glob-guard-wiring.test.ts`
- Modify: `packages/ui/package.json` (one script entry)
- Modify: `packages/ui/scripts/lint-gate-parity.mjs` (three PLUMBING patterns)

**Interfaces:**
- Produces:
  - npm script `verify:artifact-glob` in `packages/ui`, gate id `@kitn.ai/ui run verify:artifact-glob`
  - exports from `verify-artifact-glob.mjs`: `uploadGlobs(yamlText, stepName?): string[]`, `covers(globs: string[], path: string): boolean`, `ignoredPaths(porcelain: string): string[]`
  - the environment variable `ARTIFACT_GLOB_BEFORE`, the path of the pre-build `git status` snapshot
- Consumes: `requiredGateBlock` from Task 2, in the new wiring test.

**Why the snapshot arrives by environment variable rather than a flag:** the gate id for a `pnpm --filter` step is `<pkg> run <script>`, and a script name with arguments after it does not canonicalize. `classifyCommand` strips a leading `VAR=value ` prefix, so `ARTIFACT_GLOB_BEFORE=... pnpm --filter @kitn.ai/ui run verify:artifact-glob` keeps a stable identifier while a `-- --before <path>` spelling would become an unrecognised shape and hard-fail the parity guard.

- [ ] **Step 1: Write the guard**

Create `packages/ui/scripts/verify-artifact-glob.mjs`:

```js
// Coverage guard for the CI build artifact's upload glob.
//
// WHY IT EXISTS
// The split gives one leg the build and hands its output to four others through
// an artifact. That artifact's `path:` list is the new `outputs:` list, and it
// has the same failure mode the NX one has: a build-written path that is not in
// it is SILENTLY ABSENT downstream. `postbuild` never runs in a downstream leg,
// so anything it writes into the source tree exists only if this list names it.
// coupling-map's `nx.json build.outputs` row called that hazard "local only";
// the split makes it live, and this is what closes it.
//
// WHAT IT ASSERTS
//   1. The glob list is READ from the workflow's upload step, never restated
//      here. A renamed step is a hard failure, not a silently empty list.
//   2. Every glob lives under `packages/ui/`. actions/upload-artifact roots the
//      artifact at the least common ancestor of its paths, so a glob outside
//      that directory silently moves the artifact root and every downstream
//      `download-artifact` lands its files in the wrong place. Nothing else in
//      CI would say so; the legs would just fail as if the build were broken.
//   3. Every gitignored path that appeared under `packages/ui` BETWEEN the
//      pre-build snapshot and now is covered by a glob, or is one of the
//      runtime caches listed below with a written reason.
//
// IT CANNOT PASS VACUOUSLY. No snapshot is a hard failure (a diff against
// nothing covers nothing). A post-build `git status` that reports no ignored
// path at all under `packages/ui` is a hard failure too: `node_modules/` is
// always there on a real tree, so an empty read means the command, the scope or
// the parse broke rather than the tree being clean. `--self-test` runs the
// analyzers against known-bad and known-good inputs first.
//
// Usage:
//   ARTIFACT_GLOB_BEFORE=<snapshot> node packages/ui/scripts/verify-artifact-glob.mjs
//   node packages/ui/scripts/verify-artifact-glob.mjs --before <snapshot>
//   node packages/ui/scripts/verify-artifact-glob.mjs --self-test
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const REPO_ROOT = resolve(argOf('--repo-root') ?? join(SCRIPT_DIR, '../../..'));
const SELF_TEST = argv.includes('--self-test');
const BEFORE = argOf('--before') ?? process.env.ARTIFACT_GLOB_BEFORE;

const WORKFLOW = '.github/workflows/test.yml';
const UPLOAD_STEP = 'Upload the kit build for the downstream legs';
const SCOPE = 'packages/ui';

// Gitignored paths that are NOT build output. Each carries its reason, for the
// same purpose the pack-weight allowlist's reasons serve: an entry nobody can
// justify is an entry that should not be here.
const RUNTIME_CACHES = [
  ['packages/ui/node_modules', 'the install, not the build'],
  ['packages/ui/storybook-static', 'a storybook build, produced by its own job'],
  ['packages/ui/test-results', "playwright's own run output"],
  ['packages/ui/coverage', 'a one-off --coverage diagnostic, never produced in CI'],
  ['packages/ui/.kai-test-cache', "a packed tarball keyed by dist/'s fingerprint, rebuilt on demand"],
  ['packages/ui/.kai-local-kit', 'the same packing at CLI runtime'],
  ['packages/ui/.tmp-emitted-scaffold', 'a per-run scratch module the live card test writes'],
];

class GuardError extends Error {}

/** The `path:` globs of the upload step, read out of the workflow text. */
export function uploadGlobs(yamlText, stepName = UPLOAD_STEP) {
  const lines = yamlText.split('\n');
  const at = lines.findIndex((l) => l.trim() === `- name: ${stepName}`);
  if (at === -1) {
    throw new GuardError(
      `no step named \`${stepName}\` in ${WORKFLOW}.\n` +
        `  That step's \`path:\` block IS this guard's input, so a renamed step must rename it here\n` +
        `  too. Reading nothing would cover nothing and exit 0.`,
    );
  }
  let i = at + 1;
  for (; i < lines.length; i++) {
    if (/^\s*-\s/.test(lines[i])) break; // the next step
    if (/^\s*path:\s*\|\s*$/.test(lines[i])) break;
  }
  if (i >= lines.length || !/^\s*path:\s*\|\s*$/.test(lines[i])) {
    throw new GuardError(`the \`${stepName}\` step has no \`path: |\` block`);
  }
  const indent = lines[i].length - lines[i].trimStart().length;
  const globs = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() === '') continue;
    if (lines[j].length - lines[j].trimStart().length <= indent) break;
    globs.push(lines[j].trim());
  }
  if (globs.length === 0) throw new GuardError(`the \`${stepName}\` step's \`path:\` block is empty`);
  return globs;
}

/** Does any glob cover this path? `x/**` covers `x` and everything under it. */
export function covers(globs, path) {
  return globs.some((g) => {
    if (g.endsWith('/**')) {
      const prefix = g.slice(0, -3);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    return path === g;
  });
}

/** The ignored entries of a `git status --porcelain --ignored=matching` read. */
export function ignoredPaths(porcelain) {
  return porcelain
    .split('\n')
    .filter((l) => l.startsWith('!! '))
    .map((l) => l.slice(3).trim().replace(/\/$/, ''))
    .filter((l) => l !== '');
}

const excused = (p) => RUNTIME_CACHES.some(([dir]) => p === dir || p.startsWith(`${dir}/`));

const IS_MAIN = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (SELF_TEST && IS_MAIN) {
  let failed = 0;
  const report = (ok, name, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` ${detail}` : ''}`);
  };

  const FIXTURE = [
    'jobs:',
    '  build:',
    '    steps:',
    '      - name: Upload the kit build for the downstream legs',
    '        uses: actions/upload-artifact@v4',
    '        with:',
    '          name: kit-dist',
    '          path: |',
    '            packages/ui/dist/**',
    '            packages/ui/src/elements/compiled.css',
    '      - name: Something else',
    '        run: true',
    '',
  ].join('\n');

  const globs = uploadGlobs(FIXTURE);
  report(
    JSON.stringify(globs) === JSON.stringify(['packages/ui/dist/**', 'packages/ui/src/elements/compiled.css']),
    'the glob list is read out of the upload step, and stops at the next step',
    JSON.stringify(globs),
  );

  try {
    uploadGlobs(FIXTURE, 'A step that does not exist');
    report(false, 'a renamed upload step is a hard failure');
  } catch (err) {
    report(err instanceof GuardError && /no step named/.test(err.message), 'a renamed upload step is a hard failure');
  }

  try {
    uploadGlobs(FIXTURE.replace('          path: |\n', ''), UPLOAD_STEP);
    report(false, 'an upload step with no `path:` block is a hard failure');
  } catch (err) {
    report(err instanceof GuardError, 'an upload step with no `path:` block is a hard failure');
  }

  report(covers(globs, 'packages/ui/dist'), 'a `/**` glob covers the directory itself');
  report(covers(globs, 'packages/ui/dist/kai.es.js'), 'a `/**` glob covers a file under it');
  report(covers(globs, 'packages/ui/src/elements/compiled.css'), 'an exact glob covers its own path');
  report(
    !covers(globs, 'packages/ui/scripts/block-driver/pages/generated'),
    'THE DEFECT: a build-written path outside every glob is NOT covered',
  );

  report(
    JSON.stringify(ignoredPaths('!! packages/ui/dist/\n?? other\n!! packages/ui/x.css\n')) ===
      JSON.stringify(['packages/ui/dist', 'packages/ui/x.css']),
    'porcelain parsing keeps ignored entries only, and drops the trailing slash',
  );

  report(excused('packages/ui/node_modules/foo'), 'a runtime cache is excused by prefix');
  report(!excused('packages/ui/dist'), 'a build output is not excused');

  if (failed > 0) {
    console.error(`\n✗ verify-artifact-glob self-test: ${failed} case(s) failed.`);
    process.exit(1);
  }
  console.log('\n✓ verify-artifact-glob self-test: every case behaves as specified.');
  process.exit(0);
}

if (IS_MAIN) {
  const fail = (msg) => {
    console.error(`\n✗ verify-artifact-glob: ${msg}`);
    process.exit(1);
  };

  const workflowPath = join(REPO_ROOT, WORKFLOW);
  if (!existsSync(workflowPath)) fail(`no ${WORKFLOW} under ${REPO_ROOT}. This script is misrooted.`);

  let globs;
  try {
    globs = uploadGlobs(readFileSync(workflowPath, 'utf8'));
  } catch (err) {
    if (!(err instanceof GuardError)) throw err;
    fail(err.message);
  }

  const outside = globs.filter((g) => !g.startsWith(`${SCOPE}/`));
  if (outside.length > 0) {
    fail(
      `these upload globs live outside ${SCOPE}/:\n    ${outside.join('\n    ')}\n` +
        `  actions/upload-artifact roots the artifact at the least common ancestor of its paths, so\n` +
        `  one of these moves the root and every downstream download lands its files somewhere else.\n` +
        `  Keep the artifact inside ${SCOPE}/, or repoint every \`download-artifact\` \`path:\` with it.`,
    );
  }

  if (!BEFORE) {
    fail(
      `no pre-build snapshot. Set ARTIFACT_GLOB_BEFORE (or pass --before <file>) to the output of\n` +
        `  \`git status --porcelain --ignored=matching ${SCOPE}\` taken BEFORE the build. Without it this\n` +
        `  compares against nothing, which covers nothing and exits 0.`,
    );
  }
  if (!existsSync(BEFORE)) fail(`the pre-build snapshot ${BEFORE} does not exist.`);

  const after = ignoredPaths(
    execFileSync('git', ['status', '--porcelain', '--ignored=matching', SCOPE], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  if (after.length === 0) {
    fail(
      `git reports no ignored path at all under ${SCOPE}. node_modules/ alone makes that impossible on a\n` +
        `  real tree, so the command, the scope or the parse broke -- not the tree.`,
    );
  }

  const before = ignoredPaths(readFileSync(BEFORE, 'utf8'));
  const written = after.filter((p) => !before.includes(p));
  const uncovered = written.filter((p) => !excused(p) && !covers(globs, p));

  if (uncovered.length > 0) {
    fail(
      `the build wrote gitignored path(s) that the artifact does not carry:\n` +
        uncovered.map((p) => `    ${p}`).join('\n') +
        `\n  The upload glob is:\n` +
        globs.map((g) => `    ${g}`).join('\n') +
        `\n  A downstream leg never runs \`postbuild\`, so anything missing here is simply absent there --\n` +
        `  silently, and it fails later as if the build were broken. Add the path to the upload step, or\n` +
        `  add it to RUNTIME_CACHES in ${WORKFLOW.replace(WORKFLOW, 'packages/ui/scripts/verify-artifact-glob.mjs')} with a written reason.`,
    );
  }

  console.log(
    `✓ verify-artifact-glob: ${globs.length} glob(s) cover all ${written.length} gitignored path(s) the build wrote under ${SCOPE}/.`,
  );
}
```

- [ ] **Step 2: Run the self-test and watch it pass, then watch it detect**

```bash
node packages/ui/scripts/verify-artifact-glob.mjs --self-test
```

Expected: every case green, including `THE DEFECT: a build-written path outside every glob is NOT covered`.

Now watch the real path refuse rather than pass vacuously:

```bash
node packages/ui/scripts/verify-artifact-glob.mjs
```

Expected: FAIL with `no step named ...` (the upload step does not exist yet -- Task 4 adds it). That refusal IS the correct behaviour on this tree.

- [ ] **Step 3: Wire the npm script**

In `packages/ui/package.json`, next to the other `verify:` entries, add:

```json
    "verify:artifact-glob": "node scripts/verify-artifact-glob.mjs --self-test && node scripts/verify-artifact-glob.mjs",
```

- [ ] **Step 4: Teach `lint-gate-parity` the three new plumbing shapes**

The split adds three commands that assert nothing: a working-tree snapshot, a backgrounded Storybook, and the bounded poll that waits for it. Each would otherwise be an unrecognised shape and hard-fail the parity guard.

In `packages/ui/scripts/lint-gate-parity.mjs`, replace:

```js
const PLUMBING = [
  /^pnpm\s+install\b/,
  /^npm\s+(install|ci)\b/,
  /^npx\s+playwright\s+install\b/,
  /^echo\b/,
];
```

with:

```js
const PLUMBING = [
  /^pnpm\s+install\b/,
  /^npm\s+(install|ci)\b/,
  /^npx\s+playwright\s+install\b/,
  /^echo\b/,
  // A working-tree snapshot redirected to a file. It asserts nothing on its
  // own; the step that READS it (`verify:artifact-glob`) is the gate.
  /^git\s+status\b/,
  // A backgrounded server, and the bounded poll that waits for it to answer.
  // Setup for the steps after them, in the same sense as the playwright
  // download above. Narrow on purpose -- `timeout <n> bash -c 'until ...` is a
  // readiness loop and nothing else, so a real check cannot hide inside one.
  /^nohup\s/,
  /^timeout\s+\d+\s+bash\s+-c\s+'until\s/,
];
```

- [ ] **Step 5: Write the wiring test**

Create `packages/ui/tests/scripts/artifact-glob-guard-wiring.test.ts`:

```ts
/**
 * GUARD -- the artifact-glob guard DETECTS, and CI runs it.
 *
 * The upload glob in the `build` leg is the new `outputs:` list: four downstream
 * legs see exactly what it names and nothing else, and they never run
 * `postbuild`, so a path left out is silently absent rather than stale. This
 * file exists because of how that guard would be lost -- the `--self-test` half
 * dropping off the npm script, or CI dropping the step.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredGateBlock } from './lib/required-gate-block';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/verify-artifact-glob.mjs';
const NPM_SCRIPT = 'verify:artifact-glob';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

function run(args: string[]): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', [resolve(pkgRoot, SCRIPT), ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('the artifact-glob guard detects, and CI runs it', () => {
  it('ships the guard', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the check`, () => {
    const script = pkg.scripts[NPM_SCRIPT];
    expect(script, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(script, `\`${NPM_SCRIPT}\` no longer runs \`--self-test\``).toContain('--self-test');
    expect(script, `\`${NPM_SCRIPT}\` no longer runs the check itself`).toContain(SCRIPT);
  });

  it('refuses a run with no pre-build snapshot instead of covering nothing', () => {
    const { code, output } = run([]);
    expect(code, 'a run with no snapshot exited 0').not.toBe(0);
    expect(output).toContain('ARTIFACT_GLOB_BEFORE');
  });

  it('its self-test proves it detects an uncovered path', () => {
    const { code, output } = run(['--self-test']);
    expect(code, `the self-test failed:\n${output}`).toBe(0);
    expect(output).toContain('THE DEFECT');
  });

  it('is invoked by the REQUIRED gate graph in CI', () => {
    // Two vacuity guards, and they answer different questions now that the gate
    // is a GRAPH. The empty check catches a renamed root job; the `--project=unit`
    // canary catches a graph that stopped reaching the leg that runs the suite,
    // which is what a dropped `needs:` edge looks like from in here.
    const block = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(
      block,
      'the required gate graph no longer runs the unit project either -- read this guard',
    ).toContain('--project=unit');
    expect(
      block,
      `the gate graph does not run \`${NPM_SCRIPT}\`. Without it the upload glob is a list nobody ` +
        `checks, and a build-written path left out of it is absent downstream rather than stale.`,
    ).toContain(NPM_SCRIPT);
  });

  it('the upload step it reads is the one the legs download', () => {
    const block = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));
    expect(block, 'no upload step in the gate graph').toContain(
      'Upload the kit build for the downstream legs',
    );
  });
});
```

- [ ] **Step 6: Run it and watch the CI-wiring cases FAIL**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts/artifact-glob-guard-wiring.test.ts
```

Expected: the first four cases PASS and the last two FAIL, because the workflow has no upload step yet. Task 4 turns them green. Do not weaken them.

- [ ] **Step 7: Commit, with the two known-red cases named**

```bash
node packages/ui/scripts/lint-gate-parity.mjs --self-test
node packages/ui/scripts/lint-gate-parity.mjs
git add packages/ui/scripts/verify-artifact-glob.mjs packages/ui/scripts/lint-gate-parity.mjs \
        packages/ui/package.json packages/ui/tests/scripts/artifact-glob-guard-wiring.test.ts
git commit
```

Commit message body:

```
feat(ci): guard that the build artifact carries what the build writes

The upload glob is the new outputs list, and a downstream leg never runs
postbuild, so a path left out of it is silently ABSENT rather than stale.
This reads the glob out of the workflow's upload step, diffs the
gitignored paths under packages/ui across the build, and fails on
anything uncovered that is not a named runtime cache.

Two of its cases are RED until the workflow split lands in the next
commit: the step it looks for does not exist yet. That refusal is the
correct behaviour on this tree, not a broken guard.

lint-gate-parity learns three plumbing shapes the split introduces: a
`git status` snapshot, a backgrounded server, and a bounded readiness
poll.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

---

### Task 4: Split the workflow into five legs and an aggregator

**Files:**
- Modify: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: `verify:artifact-glob` and `ARTIFACT_GLOB_BEFORE` (Task 3); the graph-aware linter (Task 1); `requiredGateBlock` (Task 2).
- Produces: jobs `build`, `construct`, `unit`, `dist-guards`, `browser`, `test`. The check-run name the ruleset requires stays `test`.

**The transformation is mechanical: every existing step block moves verbatim.** Keep each step's comment, its `name:` byte-for-byte (the inline `node -e` step's gate identifier is derived from its name), its `run:`, its `working-directory:` and its `timeout-minutes:`. Do not reword, do not merge, do not reorder within a leg beyond the order given below.

- [ ] **Step 1: Rewrite the workflow header comment**

Replace lines 10 through 26 of `.github/workflows/test.yml` -- the block from `  # The REQUIRED check -- and, today, the ONLY one.` down to and including `  # this comment and the \`storybook-gate\` one below are the stale things.` -- with:

```yaml
  # THE REQUIRED CHECK IS A GRAPH, NOT A JOB.
  #
  # `test` is an aggregator. It runs no gate itself: five legs do, in parallel,
  # and `test` fails unless every one of them succeeded. The check-run name stays
  # `test` because that is the context the ruleset requires and the literal
  # `require-green-checks.mjs` gates the publish on, and moving it would buy
  # nothing while touching two lists that nothing derives.
  #
  # `if: always()` on the aggregator is not optional. Without it a failed leg
  # SKIPS the aggregator, and a skipped required check is not a red one -- that is
  # a green gate over a workflow that ran nothing.
  #
  # The verdict is derived from `toJSON(needs)` rather than a hand-written `if`
  # chain, so a leg added to `needs:` and forgotten in the verdict cannot go
  # ungated. `toJSON(needs)` IS the `needs:` list; the two cannot drift.
  #
  # `pnpm --filter @kitn.ai/ui run lint:gate-parity` reads the same graph: the
  # gate set is `test` union its transitive `needs:`, and a job in this workflow
  # that carries a gate and is NOT reachable from `test` is a hard failure there.
  # So a step moved out of the graph is as loud as a step deleted.
  #
  # The storybook browser project runs in its own `storybook` matrix, aggregated
  # by `storybook-gate`, which is ALSO a required context as of 2026-09-01.
  #
  # WHICH CONTEXTS BLOCK A MERGE IS RULESET CONFIG, NOT WORKFLOW CONFIG, so this
  # comment cannot be authoritative and you should not act on it without asking
  # the API. Job names here do not imply required status; only the ruleset does:
  #
  #   gh api repos/kitn-ai/ui/rulesets/18328421 \
  #     --jq '.rules[] | select(.type == "required_status_checks")
  #           | .parameters.required_status_checks[].context'
  #
  # That prints the live list. If it prints anything other than `test` and
  # `storybook-gate`, this comment and the `storybook-gate` one below are the
  # stale things.
```

- [ ] **Step 2: Rename the `test` job to `build` and cut it after the build step**

Change the job key `  test:` (the line immediately after the header comment) to `  build:`, and change its `timeout-minutes: 30` to `timeout-minutes: 15`.

Keep, in this exact order and verbatim, the steps from `- uses: actions/checkout@v4` down to and including the step named `Card-validation coverage guard (no keyword validates nothing)`. Note the step order inside this run: the three pre-install steps stay first and stay in order (the traversal guard writes `$RUNNER_TEMP/tanstack-traversal.tap` and the step after it reads that file; `$RUNNER_TEMP` is per-job and splitting the pair silently restores the exact bug the pair exists for), then `Install dependencies`, then the eight `lint:` steps in their existing order, then `Card-validation coverage guard`.

**Move the `Card-validation coverage guard` step block** (its comment plus the step) from its current position after `Tool-definition guard` up to sit immediately after `Threshold derivation guard (no number without a producer)`. It reads source only and needs no build, which is why it can be here; keeping the eleven no-build checks in the leg that fans out is the split's only remaining fail-fast, since GitHub does not cancel sibling jobs.

Then, after `Card-validation coverage guard`, append:

```yaml
      # The pre-build half of the artifact-coverage check below. Everything
      # gitignored that exists NOW is the install and whatever caches the runner
      # carries; anything gitignored that appears after `nx build ui` is build
      # output, and the artifact has to carry it or the downstream legs simply do
      # not have it. Asserts nothing on its own -- the step that reads it does.
      - name: Ignored-path snapshot (what is on disk before the build writes)
        run: git status --porcelain --ignored=matching packages/ui > "$RUNNER_TEMP/ignored-before.txt"

      - name: Build (element bundle + provider subpath)
        run: pnpm exec nx build ui

      # THE ARTIFACT GLOB IS THE NEW `outputs:` LIST, and it has the nx list's
      # failure mode with none of its mitigations: a downstream leg never runs
      # `postbuild`, so a build-written path the glob omits is silently ABSENT
      # there rather than stale, and it surfaces as an unrelated-looking failure
      # three jobs later. coupling-map's `nx.json build.outputs` row called that
      # hazard local-only; this split makes it live, and this closes it.
      #
      # It diffs the gitignored paths under packages/ui across the build and
      # fails on anything uncovered that is not a named runtime cache, reading
      # the glob out of the upload step below rather than restating it. ~1s.
      - name: Artifact glob covers everything the build wrote
        run: ARTIFACT_GLOB_BEFORE="$RUNNER_TEMP/ignored-before.txt" pnpm --filter @kitn.ai/ui run verify:artifact-glob

      # ONE artifact, four consumers. The three paths are the complete
      # gitignored-and-build-written set under packages/ui: dist/, the
      # `build:css` prebuild output, and the block driver pages `build:blocks`
      # generates for `verify:blocks`. Everything else the build writes --
      # element-meta.json, derived.json, llms-full.txt, the React wrappers,
      # docs/web-components.md, the construct template fixtures -- is COMMITTED,
      # so a downstream `checkout` already has it, and `verify:generated` in
      # `dist-guards` proves it is the right version.
      #
      # actions/upload-artifact roots the artifact at the least common ancestor
      # of these paths, which is `packages/ui`. That is why every download below
      # says `path: packages/ui`, and why the guard above refuses a glob outside
      # that directory: one would move the root and land every download's files
      # somewhere else.
      - name: Upload the kit build for the downstream legs
        uses: actions/upload-artifact@v4
        with:
          name: kit-dist
          retention-days: 1
          include-hidden-files: true
          path: |
            packages/ui/dist/**
            packages/ui/src/elements/compiled.css
            packages/ui/scripts/block-driver/pages/generated/**
```

Everything below the upload step, from the `Generated artifacts in sync with their source` comment down to the end of the `Menu IVP` step, moves into the four legs in the steps that follow. Cut it out now and hold it.

- [ ] **Step 3: Add the `construct` leg**

Immediately after the `build` job (before the `storybook` job), insert:

```yaml
  # 30% of the whole gate, sharing nothing with anything else, so it gets its own
  # leg. `verify-construct.mjs` ejects against THIS CHECKOUT'S OWN packed tarball
  # and then runs a real `npm install` per cell, which is where the time goes.
  #
  # NO PATH FILTER, deliberately. A PR touching only src/elements/ changes what
  # every cell installs while matching nothing a construct-scoped filter would
  # look at -- "the tree is not the tarball, and the tarball is not what npx
  # runs", in its most literal form. A filter safe enough to use would have to
  # fire on packages/ui/** plus scripts/** plus the lockfile plus this file,
  # which is nearly every PR: it would buy almost nothing and add a way to be
  # wrong.
  construct:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Download the kit build
        uses: actions/download-artifact@v4
        with:
          name: kit-dist
          path: packages/ui

      # BEFORE the emit chain, not after it. This cache used to sit nine steps
      # downstream of the chain that does the npm install, so the shared install
      # ran fully cold on every single run and the cache warmed nothing.
      #
      # Its own key, over what actually determines the emitted projects'
      # dependency set: the construct schema, the template registry, and
      # packages/ui/package.json (whose version goes into every emitted pin). A
      # separate key from the starters cache in `dist-guards` is what keeps two
      # legs sharing ~/.npm from racing on one entry.
      - name: Cache npm (construct emit chain)
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: construct-npm-${{ hashFiles('packages/ui/src/agent-tooling/construct/construct.v1.schema.json', 'packages/ui/src/agent-tooling/construct/templates.ts', 'packages/ui/package.json') }}
          restore-keys: construct-npm-

      # The construct engine's real emit chain: node bin/mcp.js eject (the CLI,
      # not the library) -> a real npm install -> tsc --noEmit under the cell's
      # OWN emitted tsconfig -> npm run build -> for one cell per layout, a real
      # Vite 8 consumer bundle asserting the registration survives. Axes (layout,
      # capability) are derived from the drift-guarded construct.v1.schema.json
      # artifact, never typed here -- the script prints what it actually ran.
      # --self-test runs first and proves the harness detects a spliced type
      # error and a hand-stripped registration before the real cells are trusted.
      - name: Construct engine emit chain (real eject + install + tsc + build + consumer bundle)
        run: pnpm --filter @kitn.ai/ui run verify:construct
```

- [ ] **Step 4: Add the `unit` leg**

Immediately after the `construct` job, insert the leg below. For each step marked `<< MOVE >>`, paste the step's ORIGINAL comment block and step body verbatim from what you cut in Step 2.

```yaml
  # The jsdom suite and everything that hangs off create-kai's build. `unit` and
  # `emitted` stay adjacent because they are one argument split across two vitest
  # projects, and `create-kai build` sits next to the two verify:pack steps that
  # read what it produced.
  unit:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Download the kit build
        uses: actions/download-artifact@v4
        with:
          name: kit-dist
          path: packages/ui
```

Then append, in this order, the moved steps:

1. `<< MOVE >>` `Unit tests (jsdom)`
2. `<< MOVE >>` `Emitted-code guards (the scaffolder's output actually RUNS)`
3. `<< MOVE >>` `React adapter tests`
4. `<< MOVE >>` `Spike typecheck (openrouter conformance harness)`
5. `<< MOVE >>` `Spike tests (incl. the consumer cardTypes seam guard)`
6. `<< MOVE >>` `create-kai build (bundles templates + the shared catalogs)`
7. `<< MOVE >>` `create-kai typecheck`
8. `<< MOVE >>` `create-kai tests (incl. the published-kit contract gate)`
9. `<< MOVE >>` `create-kai packed-tarball shape`
10. `<< MOVE >>` `packed-tarball shape, both packages (under the npm the release job pins)`

Step 2's comment says the emitted guards are "A SEPARATE STEP, NOT A SEPARATE JOB ... they must stay inside the one required context, next to the build they depend on". That remains true: the required context is now the graph, and this leg is inside it. Append one sentence to that comment, at the end of the paragraph beginning `A SEPARATE STEP, NOT A SEPARATE JOB`:

```
      # (The required context is now the `test` GRAPH rather than one job, and
      # this leg is inside it -- the argument was always about which context
      # gates the merge, not about which runner executes the step.)
```

Exactly one `VERIFY_PACK_NPM` step must survive the whole file: `packages/create-kai/test/publish-shape.test.ts` scans the whole workflow and asserts `toHaveLength(1)`.

- [ ] **Step 5: Add the `dist-guards` leg**

Immediately after the `unit` job, insert:

```yaml
  # Everything that reads dist/ and is not slow enough to deserve its own leg.
  #
  # `verify:generated` goes HERE specifically because this leg uploads nothing.
  # It seeds each artifact with a single-use random sentinel and restores it
  # afterwards; a leg that both seeds sentinels and produces an artifact is one
  # crashed process away from shipping a poisoned one.
  dist-guards:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Download the kit build
        uses: actions/download-artifact@v4
        with:
          name: kit-dist
          path: packages/ui
```

Then append, in this order, the moved steps:

1. `<< MOVE >>` `Generated artifacts in sync with their source`
2. `<< MOVE >>` `Typecheck`
3. `<< MOVE >>` `Scaffolder output compiles (tsc --strict over emitted code)`
4. `<< MOVE >>` `Consumer packaging guard (registrations survive a real bundler)`
5. `<< MOVE >>` `Consumer types guard (shipped .d.ts type-check under bundler + nodenext)`
6. `<< MOVE >>` `Server guard (every entry imports AND every component renders under `node`)`
7. `<< MOVE >>` `Solid coverage guard (every element writable in SolidJS)`
8. `<< MOVE >>` `Pack weight guard (no dead weight ships to consumers)`
9. `<< MOVE >>` `Declaration boundary guard (every emitted .d.ts specifier resolves)`
10. `<< MOVE >>` `Diagnostics wiring guard (events cross the ./wire ↔ ./diagnostics boundary)`
11. `<< MOVE >>` `Card-schema export guard (both surfaces reachable from outside)`
12. `<< MOVE >>` `Tool-definition guard (card schemas project to definitions a provider accepts)`
13. `<< MOVE >>` `Docs alignment (every doc snippet compiles against the shipped API)`
14. `<< MOVE >>` `Cache npm (standalone starters)` -- the `actions/cache@v4` step, unchanged, key and all
15. `<< MOVE >>` `Starters + ladder apps build (roster derived by verify-starters)`

`Typecheck` stays `pnpm exec nx typecheck ui`, one step. Do not flatten it: `verify:quarantine` runs first inside that script, ahead of the `&&`-joined tsc passes, and any workflow-level split skips the rot check on exactly the fresh trees where rot hides.

- [ ] **Step 6: Add the `browser` leg**

Immediately after the `dist-guards` job, insert:

```yaml
  # One Playwright install, then everything that needs a browser.
  browser:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Download the kit build
        uses: actions/download-artifact@v4
        with:
          name: kit-dist
          path: packages/ui
```

Then append, in this order, the moved steps:

1. `<< MOVE >>` `Install Playwright browser` -- keep its `timeout-minutes: 5` and its comment. Update the comment's phrase `until the job's own 30-minute timeout` to `until the job's own timeout`, since the ceiling now differs per leg.
2. `<< MOVE >>` `Cross-origin e2e matrix`
3. `<< MOVE >>` `Block cells (every block vs its committed baseline, built bundle)`
4. `<< MOVE >>` `Focus-indicator paint guard (shadow-root rings, built bundle)`
5. `<< MOVE >>` `Message text-token guard (brand must not color content, built bundle)`
6. `<< MOVE >>` `Content brand-bleed guard (accent must not color content/chrome, built bundle)`
7. `<< MOVE >>` `Hover-card tab-stop guard (built bundle)`

Then the new Storybook step, then the two IVPs:

```yaml
      # ONE Storybook for BOTH IVPs below. Their configs already set
      # `reuseExistingServer: true` (not `!CI`), so each will attach to a server
      # that is already up and boot its own only if none is -- which is what made
      # this free. Without it the command IVP boots Storybook, Playwright tears it
      # down at the end of that step, and the menu IVP boots it again.
      #
      # Both are deliberately Storybook-dependent: what they test is filtering and
      # keyboard selection, which the stories exercise directly. The paint guards
      # above run bare for the opposite reason -- Storybook's document-level
      # Tailwind registers `@property` globally and would mask the very defect
      # they exist for.
      - name: Start Storybook once for both IVPs (each config reuses it)
        run: |
          nohup pnpm --filter @kitn.ai/ui run storybook -- --ci --quiet > "$RUNNER_TEMP/storybook.log" 2>&1 &
          timeout 180 bash -c 'until curl -sf http://localhost:6006/iframe.html > /dev/null; do sleep 2; done'
```

8. `<< MOVE >>` `Command-palette IVP (kai-command, storybook)`
9. `<< MOVE >>` `Menu IVP (kai-menu + cascading primitives, storybook)`

- [ ] **Step 7: Add the `test` aggregator**

Immediately after the `browser` job and before the `storybook` job, insert:

```yaml
  # THE REQUIRED CHECK. It runs no gate: the five legs above do, and this fails
  # unless every one of them succeeded.
  #
  # `if: always()` is what makes a red leg RED here rather than skipped. Without
  # it a failed leg skips this job, and a skipped required check is not a failed
  # one -- the ruleset would see a green gate over a workflow that ran nothing.
  #
  # The verdict is DERIVED. `storybook-gate` below compares one named result
  # because it has exactly one leg; a five-leg copy of that shape has a real
  # failure mode, which is a leg added to `needs:` and forgotten in the `if`
  # chain, silently ungated forever. `toJSON(needs)` IS the `needs:` list, so the
  # two cannot drift, and the failure names the red legs.
  test:
    needs: [build, construct, unit, dist-guards, browser]
    if: always()
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Every leg of the required gate must have succeeded
        run: |
          echo '${{ toJSON(needs) }}' | jq -e 'to_entries
            | map(select(.value.result != "success"))
            | if length == 0 then "every leg succeeded"
              else (map("\(.key): \(.value.result)") | join(", ") | "red or skipped legs -- \(.)" | halt_error(1))
              end'
```

- [ ] **Step 8: Rewrite the `storybook-gate` comment**

Replace the paragraph in the `storybook-gate` header comment that reads:

```yaml
  # This context is ADVISORY. It is not in the branch ruleset, so a red gate here
  # does NOT block a merge -- the browser suite was tried as a required check,
  # flaked on CI, and was deliberately left advisory. The aggregation is still
  # worth having: it means that IF it is ever promoted to required, the ruleset
  # names this one stable context rather than the per-shard `storybook (N)` ones,
  # and changing the shard count never breaks the required-checks config.
```

with:

```yaml
  # This context is REQUIRED as of 2026-09-01 (owner-ruled). It was advisory for
  # a long time because the browser suite flaked, and leaving it advisory is how
  # three a11y defects shipped; #359 fixed them and the ruleset was raised to two
  # contexts. The aggregation is what makes that possible: the ruleset names this
  # one stable context rather than the per-shard `storybook (N)` ones, so
  # changing the shard count never breaks the required-checks config.
  #
  # It is a SIBLING of `test`, not a leg of it. `lint:gate-parity` exempts this
  # job and the `storybook` matrix by name for exactly that reason -- see
  # EXEMPT_JOBS in packages/ui/scripts/lint-gate-parity.mjs.
```

- [ ] **Step 9: Confirm the gate set survived**

```bash
node packages/ui/scripts/lint-gate-parity.mjs --self-test
node packages/ui/scripts/lint-gate-parity.mjs
node packages/ui/scripts/lint-gate-parity.mjs --list > "$SCRATCH/after.txt"
diff <(sort "$SCRATCH/before.txt") <(sort "$SCRATCH/after.txt")
```

Expected differences and NOTHING else:

- one added gate id line, `  @kitn.ai/ui run verify:artifact-glob`, and its step-name line `      Artifact glob covers everything the build wrote`
- the added graph line, `  the gate is the job GRAPH: test, build, construct, unit, dist-guards, browser`
- the header line's gate count going up by one

**Any removed line is a failure.** A gate that vanished is a test that stopped gating, which is the one thing this split is not allowed to do. If the linter throws `not reachable from`, a step landed in a job the aggregator does not name; if it throws `unrecognised step shape`, a step was reworded rather than moved.

- [ ] **Step 10: Run every wiring test against the split workflow**

```bash
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts tests/agent-tooling/emitted-project-wiring.test.ts
pnpm --filter create-kai exec vitest run test/publish-shape.test.ts
```

Expected: all green, including the two `artifact-glob-guard-wiring` cases that were red in Task 3, and including `publish-shape.test.ts` with no edits at all -- its `testJobPins()` regex scans the whole file, which is why it survives the split untouched.

- [ ] **Step 11: Validate the YAML parses as GitHub will read it**

```bash
node -e "const {parse}=require('yaml');const d=parse(require('fs').readFileSync('.github/workflows/test.yml','utf8'));console.log(Object.keys(d.jobs).join(' '));console.log(JSON.stringify(d.jobs.test.needs));"
```

Expected: `build construct unit dist-guards browser test storybook storybook-gate` and `["build","construct","unit","dist-guards","browser"]`.

- [ ] **Step 12: Commit**

```bash
git add .github/workflows/test.yml
git commit
```

Commit message body:

```
feat(ci): split the serial test job into five parallel legs

`build` runs the pre-install guards, the install, the eleven no-build
lints and `nx build ui`, then uploads one artifact. `construct`, `unit`,
`dist-guards` and `browser` each need it and run their slice unchanged.
A `test` aggregator with `if: always()` and a verdict derived from
`toJSON(needs)` keeps the required check's name and cannot leave a leg
ungated.

No step is removed and no step is reworded: `lint-gate-parity --list`
loses nothing, and gains only the new artifact-glob gate. The npm cache
restore moves ahead of the construct emit chain and gets its own key.
Both stale comment blocks are rewritten; `storybook-gate` is described as
required, which it has been since 2026-09-01.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

---

### Task 5: Register the two new couplings

**Files:**
- Modify: `docs/coupling-map.md`

**Interfaces:**
- Consumes: the workflow's upload glob and `needs:` graph (Task 4); `verify:artifact-glob` (Task 3); `lint:gate-parity`'s unreachable-job rule (Task 1).

The repo's convention is to register a coupling when you create one. This split creates two, and both are enforced, so neither belongs in the unenforced list.

- [ ] **Step 1: Add the artifact-glob row to section 6**

In `docs/coupling-map.md`, in the table under `## 6. Generated files that live in the source tree`, add this row immediately after the `src/elements/styles.css` row:

```
| What `nx build ui` writes into the **source** tree (`src/elements/compiled.css` via `prebuild`, `scripts/block-driver/pages/generated/` via `build:blocks`) | the `path:` list of the `Upload the kit build for the downstream legs` step in `.github/workflows/test.yml`. That list is the artifact's `outputs:`, and four legs (`construct`, `unit`, `dist-guards`, `browser`) see exactly what it names | A downstream leg never runs `postbuild`, so a build-written path the glob omits is **absent** there rather than stale, and it surfaces three jobs later as a failure that reads like a broken build. The same hazard the `nx.json build.outputs` row describes, promoted from local-only to live CI by the split. A second, quieter half: `actions/upload-artifact` roots the artifact at the least common ancestor of its paths, so one glob outside `packages/ui/` moves the root and every `download-artifact` lands its files somewhere else | `pnpm --filter @kitn.ai/ui run verify:artifact-glob` in the `build` leg. It reads the glob out of the upload step rather than restating it, diffs `git status --porcelain --ignored=matching packages/ui` across the build, and fails on any uncovered path that is not a named runtime cache with a written reason. It refuses to run with no pre-build snapshot, and treats an empty `git status` read as its own breakage rather than a clean tree. `packages/ui/tests/scripts/artifact-glob-guard-wiring.test.ts` fails if CI stops invoking it |
```

- [ ] **Step 2: Add the needs-graph row to section 4**

In the table under `## 4. Derived lists`, add this row at the end of the table:

```
| The `needs:` graph of `.github/workflows/test.yml` -- `test` and the five legs it aggregates | the gate set of `packages/ui/scripts/lint-gate-parity.mjs` (`test` union its transitive `needs:`, parsed from the workflow) and `requiredGateBlock()` in `packages/ui/tests/scripts/lib/required-gate-block.ts`, which thirteen `*-wiring.test.ts` files use to ask whether CI still runs their guard. Neither carries a list of legs; both re-derive the graph, by the same rule, from two independent parsers on purpose | Add a leg and every guard-wiring assertion covers it the day it lands. Drop a `needs:` edge and its steps leave the merge gate while still running on every PR: `--list` would keep printing them, and the required check would go green over checks that gate nothing. Move a gate into a job outside the graph and the same thing happens one level up | `lint:gate-parity` (required, no build): a job carrying a gate-shaped step and not reachable from `test` is a **hard failure** naming the job and the gate, with `storybook` / `storybook-gate` exempt by name in `EXEMPT_JOBS`; a root `test` with no `needs:` and no gates is a hard failure too. Both watched firing in `--self-test`. The helper carries its own vacuity floor and every caller keeps `expect(block).not.toBe('')`, because one derivation feeding thirteen guards is one bug away from blinding all of them. What is **NOT** enforced: that the ruleset's required contexts equal `{test, storybook-gate}` -- see the ruleset row in §1 |
```

- [ ] **Step 3: Run the doc linters**

```bash
node packages/ui/scripts/lint-gate-parity.mjs
node packages/ui/scripts/lint-threshold-derivation.mjs
```

Expected: both exit 0. `docs/coupling-map.md` is outside the gate-parity doc scan by design, but run it anyway -- the rows name gate scripts and the scan's scope is worth re-confirming rather than assumed.

- [ ] **Step 4: Commit**

```bash
git add docs/coupling-map.md
git commit
```

Commit message body:

```
docs(coupling-map): the artifact glob and the needs graph

Two couplings the CI split creates, both enforced. The upload glob is the
new outputs list, and a downstream leg never runs postbuild. The `needs:`
graph is what both the parity linter and the shared wiring-test helper
derive the merge gate from.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

---

### Task 6: Verify, then prove it red three times

**Files:**
- No repo files change on `feat/ci-parallel-split`. The three red runs each live on their own throwaway branch and are deleted afterwards.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: The conservation diff, with the NEW linter on BOTH trees**

Running the new linter against both trees is what makes the comparison valid: over `main` the union degenerates to `test`, so the derivation is backward compatible by construction and the diff is a genuine before-and-after rather than two different questions.

```bash
git worktree add "$SCRATCH/ci-base" main
node packages/ui/scripts/lint-gate-parity.mjs --repo-root "$SCRATCH/ci-base" --list > "$SCRATCH/base.txt"
node packages/ui/scripts/lint-gate-parity.mjs --list > "$SCRATCH/branch.txt"
diff <(sort "$SCRATCH/base.txt") <(sort "$SCRATCH/branch.txt")
```

Expected: **removals empty**, additions exactly the three lines named in Task 4 Step 9. `--list` prints each id with its step names, so this compares the multiset of (gate, step) pairs, which is what "still runs, exactly once" means here. `verify:pack` legitimately appears twice (once plain, once under the pinned npm) and must keep appearing twice.

Clean up when done:

```bash
git worktree remove "$SCRATCH/ci-base"
```

- [ ] **Step 2: The full local gate**

<!-- gate-list: partial -- the local commands this task runs, not the merge gate; `node packages/ui/scripts/lint-gate-parity.mjs --list` prints that -->
```bash
node packages/ui/scripts/lint-gate-parity.mjs --self-test
node packages/ui/scripts/verify-artifact-glob.mjs --self-test
pnpm --filter @kitn.ai/ui exec vitest run --project=unit tests/scripts tests/agent-tooling/emitted-project-wiring.test.ts
pnpm --filter create-kai exec vitest run test/publish-shape.test.ts
pnpm --filter @kitn.ai/ui run typecheck
```

Expected: all green. Confirm `git diff main --stat -- packages/create-kai/test/publish-shape.test.ts` prints NOTHING -- that file must survive untouched.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/ci-parallel-split
gh pr create --title "ci: split the serial test job into five parallel legs" --body "..."
```

The body states: the five legs and what each carries, that the required check keeps the name `test`, that the gate set is now `test` union its transitive `needs:`, the conservation diff result from Step 1, and the three red runs below with their check-run evidence. End it with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01K58mYEyABM9r5t94JZUJi2
```

- [ ] **Step 4: Red run 1 -- a FAILED leg fails `test`**

```bash
git checkout -b ci-split-red-1
printf '\nexport const RED_1: number = "not a number";\n' >> packages/ui/src/elements/slot-text.ts
git commit -am "test: deliberately red, do not merge"
git push -u origin ci-split-red-1
```

Wait for the run, then:

```bash
gh api repos/kitn-ai/ui/commits/$(git rev-parse HEAD)/check-runs \
  --jq '.check_runs[] | "\(.name) \(.status) \(.conclusion)"'
```

Expected: `dist-guards` concludes `failure` (the type error lands in `nx typecheck ui`), and a check literally named `test` concludes `failure`. Record the output verbatim in the PR body.

- [ ] **Step 5: Red run 2 -- a SKIPPED leg fails `test`**

This is the case a hand-written `if` chain gets wrong, and getting it wrong yields a green required check over a workflow that ran nothing.

```bash
git checkout -b ci-split-red-2 main
git merge --no-edit feat/ci-parallel-split
sed -i '' 's|run: pnpm --filter @kitn.ai/ui run lint:cdn-pins|run: node -e "process.exit(1)"|' .github/workflows/test.yml
git commit -am "test: deliberately red build leg, do not merge"
git push -u origin ci-split-red-2
```

Then the same `check-runs` query. Expected: `build` concludes `failure`; `construct`, `unit`, `dist-guards` and `browser` are all `skipped`; and `test` still RUNS (because of `if: always()`) and concludes `failure`. Confirm the job log prints `red or skipped legs -- construct: skipped, ...`. If `test` shows `skipped` or `success` here, `if: always()` or the jq verdict is wrong and the split is not safe to merge.

- [ ] **Step 6: Red run 3 -- a gate moved outside the graph is caught**

```bash
git checkout -b ci-split-red-3 main
git merge --no-edit feat/ci-parallel-split
```

Edit `.github/workflows/test.yml` by hand: cut the `Solid coverage guard (every element writable in SolidJS)` step out of `dist-guards` and paste it into a new job that no `needs:` chain reaches:

```yaml
  orphan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Solid coverage guard (every element writable in SolidJS)
        run: pnpm --filter @kitn.ai/ui run verify:solid-coverage
```

Then, locally first:

```bash
node packages/ui/scripts/lint-gate-parity.mjs
```

Expected: FAIL naming `orphan` and `@kitn.ai/ui run verify:solid-coverage`. Push and confirm the `build` leg goes red on the `Documented-gate parity guard` step, and that `test` concludes `failure`.

- [ ] **Step 7: Delete the throwaway branches**

```bash
git push origin --delete ci-split-red-1 ci-split-red-2 ci-split-red-3
git branch -D ci-split-red-1 ci-split-red-2 ci-split-red-3
```

- [ ] **Step 8: Record the green run's wall time next to the baseline**

Push `feat/ci-parallel-split` and let it go green, then:

```bash
gh run list --workflow test.yml --branch feat/ci-parallel-split --limit 1 --json databaseId --jq '.[0].databaseId'
gh api repos/kitn-ai/ui/actions/runs/<run-id>/jobs \
  --jq '.jobs[] | "\(.name) \(.started_at) \(.completed_at)"'
```

Compute the wall clock from the earliest `started_at` to `test`'s `completed_at`, and put it next to Task 0's figure in the PR body, per leg as well as overall. Report both numbers as measurements from these two named runs, not as the design's estimates.

- [ ] **Step 9: Report**

Report to the requester: the conservation diff result, the three check-run outputs, the before-and-after wall times, and anything the code proved different from the design. Do not merge -- merge authority for this branch is the owner's call after reading the red-run evidence.

---

## Self-review

**1. Spec coverage.** Design §3's five legs and aggregator: Task 4. §4a's three linter changes: Task 1 (union floor, degenerate root, unreachable job). §4b's shared helper: Task 2. §4c `publish-shape.test.ts` untouched: Task 6 Step 2 asserts it. §4d's `--require` list: **already done in the tree** and needs no task -- see the contradictions below. §4e's two comment blocks: Task 4 Steps 1 and 8. §5's npm-cache move and construct-specific key: Task 4 Step 3. §5's glob-coverage step: Task 3 plus Task 4 Step 2. §6's checklist: Task 6, with the per-leg `timeout-minutes`, the preserved Playwright cap, and the `$CI` requirement for `verify:starters` all carried in Task 4. The two coupling-map rows: Task 5. The Storybook single-boot win: Task 4 Step 6.

**2. Placeholder scan.** Every code step carries the literal text to write. The one deliberate indirection is Task 4's `<< MOVE >>` list, which names each step by its exact `name:` line rather than reproducing comment blocks that run to forty lines each; reproducing them would invite rewording, and the instruction is explicitly "verbatim, do not reword". The PR body in Task 6 Step 3 is described by its required contents rather than dictated, because it must quote run output that does not exist yet.

**3. Type consistency.** `requiredGateBlock(yaml: string, rootJob?: string): string` is used with one argument everywhere. `analyzeWorkflow` returns `{ steps, gates, plumbing, runStepCount, graph }`; `graph` is read in the `--list` block, the summary line and the self-test. `uploadGlobs` / `covers` / `ignoredPaths` are exported from `verify-artifact-glob.mjs` and used only inside its own self-test and the guard's main path. `EXEMPT_JOBS` is referenced by `analyzeWorkflow`'s default parameter and by the self-test case.

**Where the code contradicted the design, and what this plan does instead:**

- The design counts **fourteen** `jobBlock(yaml, 'test')` copies. There are **thirteen**. The fourteenth `jobBlock` lives in `publish-gate-wiring.test.ts`, takes one argument, and reads `release-please.yml`; it must not be touched.
- The design's §4d gap (`--require` naming only `test` while the ruleset also requires `storybook-gate`) is real on `main`, but it is **already fixed on the in-flight branch `fix/release-requires-storybook-gate`**, which adds `--require storybook-gate` to `release-please.yml`, hardens `require-green-checks.mjs`, and updates the ruleset row in `docs/coupling-map.md`. This plan therefore carries no task for it. Before starting Task 1, check whether that branch has merged; if it has not and it looks stalled, land it separately rather than folding it in here -- a publish gate and a CI split are two different reviews.
- The design asks the shared helper to throw when `test` declares no `needs:`. That would be red on the pre-split tree, where Task 2 has to land green ahead of Task 4. The helper's vacuity floor is the run-step count only, which is the stronger check anyway: it fires on any parse that stopped following `needs:`, including the no-`needs:` case once the split has landed.
- The design's conservation check expects the `--list` diff to be **empty**. It cannot be: the design's own §5 asks for a new glob-coverage step, and any new check is a new gate id. The plan requires **removals empty** and additions limited to `@kitn.ai/ui run verify:artifact-glob` plus the graph line, and Task 4 Step 9 enumerates them.
- The design does not mention that three of its new commands are shapes `lint-gate-parity` has never seen (`git status`, the backgrounded Storybook, the readiness poll) and would each hard-fail the parity guard. Task 3 Step 4 teaches them as narrow PLUMBING patterns, since none of them asserts anything.
- The aggregator's `echo ... | jq` verdict classifies as **plumbing** under the existing `^echo` rule, so the `test` job contributes zero gates. That is correct and intended, and it is exactly why the "root job with no `needs:` and no gates" hard failure had to be written: it is the only thing standing between a thin aggregator and an empty gate set.
