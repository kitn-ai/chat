// Drift guard for DOCUMENTED GATE LISTS against the required CI job.
//
// WHY IT EXISTS
// A handoff document said "every gate is green" over a five-command list. The
// required `test` job was red at the time -- on `verify:pack`, which was not one
// of the five. `src/agent-tooling/catalog/derived.json` had grown past that
// check's 64 KiB per-file ceiling and was shipping to every consumer, and the
// list that was supposed to prove the tree healthy could not see it, because a
// list somebody typed once is not the job. The document has since been amended
// to say so in prose ("treat any list here as a subset that rots"), which is the
// honest fix and also the reason this guard exists: prose cannot stop the NEXT
// list from being read as complete.
//
// THE INVARIANT
// A block in `docs/superpowers/**` that CLAIMS to enumerate the merge gate must
// equal the `test` job's gate set, both directions. A block that looks like such
// an enumeration and claims nothing is a hard failure until somebody says which
// of the two it is.
//
// WHAT IT ASSERTS
//   1. The `test` job's every step is recognised. An unknown `run:` shape fails
//      naming the step -- "teach me this shape or mark it plumbing" -- so a new
//      kind of step cannot silently fall outside the gate set.
//   2. A block marked `<!-- gate-list: complete -->` maps to EXACTLY the gate
//      set: missing gates are listed, entries that are not gates are listed.
//   3. An UNMARKED fenced block with 3+ gate-shaped command lines, or an
//      unmarked table with 3+ rows naming a namespaced gate script, fails. This
//      is the teeth. The historical failure was an unmarked partial list read as
//      complete, and no marking convention catches that on its own -- somebody
//      has to be forced to choose.
//   4. A `<!-- gate-list: partial -- <reason> -->` block is skipped. Historical
//      records get labelled, never rewritten (the `lint:cdn-pins` precedent).
//
// WHY A PARSED DIRECTIVE AND NOT PROSE
// The same reason `lint-silent-drops` gives, and here it is not hypothetical:
// the document this guard is built from ALREADY carried a paragraph explaining
// that its list was incomplete. A rule honouring prose would have passed it
// unchanged, on the exact text that was wrong.
//
// WHY A SCOPED YAML EXTRACTOR AND NOT A YAML DEPENDENCY
// This runs in the required job before `pnpm install` would matter, with node
// stdlib only, so it stays a seam anyone can grab (`node
// packages/ui/scripts/lint-gate-parity.mjs`). The extractor is deliberately
// narrow -- it reads one job's step list, and each step's `name`, `run`,
// `uses` and `working-directory` -- and it refuses to run at all if it finds
// implausibly few steps, so a workflow restructure that defeats the parse fails
// loudly instead of yielding an empty gate set that every doc list would match.
//
// The extractor was checked against a real parser rather than assumed correct.
// The `yaml` package is present in the workspace, and parsing `test.yml` with it
// gives the same 45 steps in the same order with byte-identical `name`, `run`
// and `working-directory` values. That is a MEASUREMENT taken once, not a
// standing guarantee -- the analyzers are exported and the real run is guarded
// by `IS_MAIN` precisely so that check can be re-run, or written as a test:
//
//   const { extractSteps } = await import('./lint-gate-parity.mjs');
//   extractSteps(readFileSync('.github/workflows/test.yml', 'utf8'), 'test');
//
// WHY AN nx INVOCATION AND A `pnpm --filter` ONE ARE DIFFERENT IDENTIFIERS
// `nx typecheck ui` and `pnpm --filter @kitn.ai/ui run typecheck` run the same
// script and are NOT interchangeable in this repo: CLAUDE.md records the nx
// cache returning wrong verdicts in both directions, including a cached green
// over code carrying a real TS1015. This compares what CI RUNS, so the two stay
// distinct and a doc naming the wrong one is told so.
//
// KNOWN COST, stated rather than hidden. A `complete` claim over the whole job
// is a strong claim: some steps have no command identity at all (an inline
// `node -e` assertion), so their identifier is derived from the step name and a
// fenced list of shell commands cannot express them. `--list` prints every
// identifier; a genuinely complete enumeration is therefore a TABLE whose rows
// carry them. Most lists are subsets and should say `partial`.
//
// SCOPE
// Source of truth: the `test` job in `.github/workflows/test.yml`. Doc side:
// `docs/superpowers/**/*.md`, recursively. NOT scanned: `CLAUDE.md`,
// `docs/coupling-map.md` and the repo-root `docs/` archive -- those discuss
// gates in running prose rather than claiming an enumeration, and a guard that
// demanded a directive on every paragraph mentioning `verify:pack` would be
// noise, and a noisy guard gets disabled.
//
// Usage:
//   node packages/ui/scripts/lint-gate-parity.mjs
//   node packages/ui/scripts/lint-gate-parity.mjs --list        # the gate set
//   node packages/ui/scripts/lint-gate-parity.mjs --self-test   # prove it detects
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// Anchored to THIS FILE, not the cwd: CLAUDE.md tells everyone to run from the
// repo root while `pnpm --filter` sets the cwd to the package.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const REPO_ROOT = resolve(argOf('--repo-root') ?? join(SCRIPT_DIR, '../../..'));
const SELF_TEST = argv.includes('--self-test');
const LIST = argv.includes('--list');

const WORKFLOW = '.github/workflows/test.yml';
const JOB = 'test';
const DOC_ROOT = 'docs/superpowers';

// The vacuity floor. NOT a count of anything -- it is the tripwire that fires
// when the extractor stops extracting. The `test` job carries comfortably more
// than this today (`--list` prints the real number), and the failure this
// number exists for is a workflow restructure that leaves the parse returning
// two steps: the gate set would go nearly empty and every doc list on earth
// would match it.
const MIN_RUN_STEPS = 30;

class GuardError extends Error {}

// ---------------------------------------------------------------------------
// the scoped workflow extractor
//
// Indentation-based and deliberately incomplete: it understands exactly the
// shapes this file uses -- a job's `steps:` sequence, each item's scalar keys,
// and `run:` block scalars. Anything it cannot place becomes a hard failure
// upstream rather than a silent omission.
// ---------------------------------------------------------------------------

const indentOf = (line) => line.length - line.trimStart().length;
const isBlank = (line) => line.trim() === '';
const isComment = (line) => line.trimStart().startsWith('#');
const isSkippable = (line) => isBlank(line) || isComment(line);

/** Every step of one job, as `{ name, run, uses, workingDirectory, line }`. */
export function extractSteps(yamlText, jobName) {
  const lines = yamlText.split('\n');

  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt === -1) throw new GuardError('no top-level `jobs:` mapping in the workflow');

  // The job block: from `  <jobName>:` until the next line at the same or
  // shallower indent that is neither blank nor a comment.
  let jobAt = -1;
  for (let i = jobsAt + 1; i < lines.length; i++) {
    const l = lines[i];
    if (isSkippable(l)) continue;
    if (indentOf(l) === 0) break; // left the jobs mapping
    if (new RegExp(`^\\s{2}${jobName}:\\s*$`).test(l)) {
      jobAt = i;
      break;
    }
  }
  if (jobAt === -1) throw new GuardError(`no \`${jobName}:\` job in the workflow`);

  const jobIndent = indentOf(lines[jobAt]);
  let jobEnd = lines.length;
  for (let i = jobAt + 1; i < lines.length; i++) {
    if (isSkippable(lines[i])) continue;
    if (indentOf(lines[i]) <= jobIndent) {
      jobEnd = i;
      break;
    }
  }

  // `steps:` inside that job.
  let stepsAt = -1;
  for (let i = jobAt + 1; i < jobEnd; i++) {
    if (isSkippable(lines[i])) continue;
    if (/^\s*steps:\s*$/.test(lines[i]) && indentOf(lines[i]) === jobIndent + 2) {
      stepsAt = i;
      break;
    }
  }
  if (stepsAt === -1) throw new GuardError(`the \`${jobName}\` job has no \`steps:\` sequence`);

  // Sequence items: `      - ` at one fixed indent.
  const items = [];
  let itemIndent = null;
  for (let i = stepsAt + 1; i < jobEnd; i++) {
    const l = lines[i];
    if (isSkippable(l)) continue;
    const ind = indentOf(l);
    if (itemIndent !== null && ind < itemIndent) break; // dedented out of the sequence
    if (/^\s*-\s/.test(l) && (itemIndent === null || ind === itemIndent)) {
      itemIndent = ind;
      items.push({ start: i, end: jobEnd });
      if (items.length > 1) items[items.length - 2].end = i;
    }
  }
  if (items.length > 0) items[items.length - 1].end = jobEnd;

  return items.map((item) => parseStep(lines, item.start, item.end));
}

function parseStep(lines, start, end) {
  const dashIndent = indentOf(lines[start]);
  // `- name: x` -- the key column is where the text after `- ` begins.
  const keyIndent = lines[start].indexOf('-', dashIndent) + 2;
  const step = { name: undefined, run: undefined, uses: undefined, workingDirectory: undefined, line: start + 1 };

  for (let i = start; i < end; i++) {
    const raw = i === start ? ' '.repeat(keyIndent) + lines[i].slice(keyIndent) : lines[i];
    if (isSkippable(raw)) continue;
    if (indentOf(raw) !== keyIndent) continue; // nested mapping (e.g. `with:`) -- not ours
    const m = /^\s*([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(raw);
    if (!m) continue;
    const [, key, rest] = m;
    if (key === 'run') {
      if (rest === '|' || rest === '>' || /^[|>][-+]?\d*$/.test(rest)) {
        // Block scalar: every following line indented deeper than the key.
        const body = [];
        let blockIndent = null;
        for (let j = i + 1; j < end; j++) {
          if (isBlank(lines[j])) {
            body.push('');
            continue;
          }
          const ind = indentOf(lines[j]);
          if (ind <= keyIndent) break;
          if (blockIndent === null) blockIndent = ind;
          body.push(lines[j].slice(blockIndent));
        }
        step.run = body.join('\n').trim();
      } else {
        step.run = unquote(rest);
      }
    } else if (key === 'name') {
      step.name = unquote(rest);
    } else if (key === 'uses') {
      step.uses = unquote(rest);
    } else if (key === 'working-directory') {
      step.workingDirectory = unquote(rest);
    }
  }
  return step;
}

const unquote = (s) => {
  const t = s.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return t;
};

// ---------------------------------------------------------------------------
// canonicalization: one command -> one stable identifier, by RULE
//
// No hand-typed list of the job's steps exists anywhere in this file. Every
// identifier falls out of the command's own shape, so adding a step of a shape
// already known needs no edit here, and adding one of a NEW shape fails loudly.
// ---------------------------------------------------------------------------

// Setup that gates nothing: toolchain, dependency install, browser download,
// cache restore. These are the steps a documented gate list correctly omits.
const PLUMBING = [
  /^pnpm\s+install\b/,
  /^npm\s+(install|ci)\b/,
  /^npx\s+playwright\s+install\b/,
  /^echo\b/,
];

const stripEnvPrefix = (cmd) =>
  cmd.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/, '');

/**
 * `{ kind: 'gate', id }` | `{ kind: 'plumbing' }` | `{ kind: 'unknown' }`.
 * `ctx` carries what the identifier needs and the command does not say:
 * the step's `working-directory`, and its name for shapes with no command
 * identity at all.
 */
export function classifyCommand(rawCmd, ctx = {}) {
  const cmd = stripEnvPrefix(rawCmd.trim());
  if (cmd === '') return { kind: 'plumbing' };
  if (PLUMBING.some((p) => p.test(cmd))) return { kind: 'plumbing' };

  // An inline script has no command identity a doc could restate, so it is
  // identified by the step that owns it.
  if (/^node\s+-e\b/.test(cmd)) {
    return { kind: 'gate', shape: 'node', id: `inline node -e :: ${ctx.stepName ?? '(unnamed step)'}` };
  }

  // node's own test runner, identified by the tree it runs in -- the reporter
  // flags are noise and the working directory is the whole point (a wrong one
  // is how `node --test` exits 0 over zero tests).
  if (/^node\s+--test\b/.test(cmd)) {
    return { kind: 'gate', shape: 'node', id: `node --test (${ctx.workingDirectory ?? '.'})` };
  }

  // A plain script invocation: `node <path>.mjs [args]`.
  let m = /^node\s+(\S+\.(?:mjs|cjs|js))\s*(.*)$/.exec(cmd);
  if (m) return { kind: 'gate', shape: 'node', id: `node ${m[1]}${m[2] ? ` ${m[2].trim()}` : ''}` };

  // nx targets. Kept distinct from the `pnpm --filter` spelling of the same
  // script on purpose -- see the header.
  m = /^(?:pnpm\s+exec\s+|npx\s+)?nx\s+run-many\s+-t\s+([\w:,-]+)/.exec(cmd);
  if (m) return { kind: 'gate', shape: 'nx', id: `nx run-many -t ${m[1]}` };
  // The project token may not start with `-`, or a flag would be read as a
  // project name and yield a plausible-looking identifier for a shape nobody
  // taught this script.
  m = /^(?:pnpm\s+exec\s+|npx\s+)?nx\s+([\w:-]+)\s+([\w@./][\w@./-]*)/.exec(cmd);
  if (m) return { kind: 'gate', shape: 'nx', id: `nx ${m[1]} ${m[2]}` };

  m = /^pnpm\s+--filter\s+(\S+)\s+(.+)$/.exec(cmd);
  if (m) {
    const pkg = m[1];
    const rest = m[2].trim();
    if (/^exec\s+vitest\s+run\b/.test(rest)) {
      const p = /--project=(\S+)/.exec(rest);
      return { kind: 'gate', shape: 'pnpm-filter', id: `${pkg} vitest ${p ? p[1] : '(all projects)'}` };
    }
    if (/^exec\s+playwright\s+test\b/.test(rest)) {
      const c = /--config\s+(\S+)/.exec(rest);
      if (!c) return { kind: 'unknown' };
      return { kind: 'gate', shape: 'pnpm-filter', id: `${pkg} playwright ${c[1]}` };
    }
    if (/^exec\b/.test(rest)) return { kind: 'unknown' };
    // `run <script>` and the bare `<script>` spelling are the same gate.
    const script = rest.startsWith('run ') ? rest.slice(4).trim() : rest;
    if (!/^[\w:.-]+$/.test(script)) return { kind: 'unknown' };
    return { kind: 'gate', shape: 'pnpm-filter', id: `${pkg} run ${script}` };
  }

  return { kind: 'unknown' };
}

/** The commands one `run:` block invokes, as logical units. */
function commandsOf(run) {
  const trimmed = run.trim();
  // An inline `node -e '...'` spans many lines and is ONE command; splitting it
  // would hand the classifier fragments of javascript.
  if (/^node\s+-e\b/.test(trimmed)) return [trimmed];
  return trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

/**
 * The canonical gate set, plus the classification of every step, from one
 * workflow's text. Throws a GuardError on an unrecognised step shape or on an
 * implausibly small step count.
 */
export function analyzeWorkflow(yamlText, { jobName = JOB, minRunSteps = MIN_RUN_STEPS } = {}) {
  const steps = extractSteps(yamlText, jobName);
  const withRun = steps.filter((s) => typeof s.run === 'string' && s.run.trim() !== '');
  if (withRun.length < minRunSteps) {
    throw new GuardError(
      `extractor found almost nothing -- the workflow moved.\n` +
        `  Parsed ${steps.length} step(s) in job \`${jobName}\`, ${withRun.length} of them with a \`run:\`,\n` +
        `  which is below the floor of ${minRunSteps}. An empty-ish gate set would make every documented\n` +
        `  list match, so this refuses to run rather than pass. Fix the extractor, not the floor.`,
    );
  }

  const gates = new Map(); // id -> [step names]
  const plumbing = [];
  const unknown = [];

  for (const step of steps) {
    if (!step.run) {
      // `uses:` steps are actions -- checkout, setup-node, the pnpm action, the
      // npm cache. None of them gate anything.
      if (step.uses) {
        plumbing.push({ step, why: `uses: ${step.uses}` });
        continue;
      }
      unknown.push({ step, cmd: '(no `run:` and no `uses:`)' });
      continue;
    }
    for (const cmd of commandsOf(step.run)) {
      const c = classifyCommand(cmd, { stepName: step.name, workingDirectory: step.workingDirectory });
      if (c.kind === 'gate') {
        if (!gates.has(c.id)) gates.set(c.id, []);
        gates.get(c.id).push(step.name ?? `line ${step.line}`);
      } else if (c.kind === 'plumbing') {
        plumbing.push({ step, why: cmd });
      } else {
        unknown.push({ step, cmd });
      }
    }
  }

  if (unknown.length > 0) {
    const detail = unknown
      .map((u) => `    ${u.step.name ?? `(unnamed, line ${u.step.line})`}\n      ${u.cmd}`)
      .join('\n');
    throw new GuardError(
      `unrecognised step shape(s) in job \`${jobName}\` -- teach me this shape or mark it plumbing.\n` +
        `  Every step must canonicalize to a stable identifier or be classified as setup, or a new\n` +
        `  kind of gate silently falls outside every documented list:\n${detail}\n` +
        `  Add a rule to classifyCommand() in ${relative(REPO_ROOT, fileURLToPath(import.meta.url))}.`,
    );
  }

  return { steps, gates, plumbing, runStepCount: withRun.length };
}

// ---------------------------------------------------------------------------
// the doc side
// ---------------------------------------------------------------------------

const DIRECTIVE = /<!--\s*gate-list:\s*(complete|partial)\b\s*(?:--\s*(.*?))?\s*-->/;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.astro', '.nx', '.cache']);

function walkMarkdown(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walkMarkdown(full, out);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out.sort();
}

/** Fenced code blocks and markdown tables, with the directive above each. */
export function findBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let inFence = false;
  let fenceStart = 0;
  let fenceBody = [];

  const directiveAbove = (blockStartIdx) => {
    for (let i = blockStartIdx - 1; i >= 0; i--) {
      if (isBlank(lines[i])) continue;
      const m = DIRECTIVE.exec(lines[i]);
      return m ? { kind: m[1], reason: (m[2] ?? '').trim(), line: i + 1 } : null;
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('```') || t.startsWith('~~~')) {
      if (!inFence) {
        inFence = true;
        fenceStart = i;
        fenceBody = [];
      } else {
        inFence = false;
        blocks.push({
          kind: 'fence',
          line: fenceStart + 1,
          // A leading `#` is stripped rather than the line dropped, so a shell
          // comment can NAME a gate that has no command spelling (the inline
          // `node -e` assertion). The cost: inside a `complete` fence every
          // line must resolve, comments included -- put explanation outside it.
          entries: fenceBody
            .map((l) => l.trim().replace(/^#+\s*/, ''))
            .filter((l) => l !== ''),
          directive: directiveAbove(fenceStart),
        });
      }
      continue;
    }
    if (inFence) {
      fenceBody.push(lines[i]);
      continue;
    }
    // A table run: header, separator, one or more body rows.
    if (t.startsWith('|')) {
      const start = i;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim());
        i++;
      }
      i--; // the outer loop steps forward
      if (rows.length >= 3 && /^\|[\s:|-]+\|?$/.test(rows[1])) {
        blocks.push({
          kind: 'table',
          line: start + 1,
          entries: rows.slice(2),
          directive: directiveAbove(start),
        });
      }
    }
  }
  return blocks;
}

const backtickedTokens = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());

/**
 * What one doc entry claims, against a known gate set.
 * `{ kind: 'gate', id }` | `{ kind: 'plumbing' }` | `{ kind: 'unknown' }`.
 */
export function resolveEntry(entry, gateIds, scriptIndex) {
  // A row may carry an identifier verbatim -- which is how the shapes with no
  // command identity (`inline node -e :: ...`) are expressible at all.
  //
  // Longest first: `@kitn.ai/ui vitest unit` must not lose to a shorter id that
  // happens to be a prefix of it.
  for (const id of [...gateIds].sort((a, b) => b.length - a.length)) {
    if (entry.includes(id)) return { kind: 'gate', id };
  }

  const direct = classifyCommand(entry);
  if (direct.kind !== 'unknown') return direct;

  for (const token of backtickedTokens(entry)) {
    const c = classifyCommand(token);
    if (c.kind !== 'unknown') return c;
    // A bare NAMESPACED script name (`verify:pack`) names its gate unambiguously
    // when exactly one gate runs it. Un-namespaced names (`build`, `test`) are
    // deliberately not matched -- they are ordinary English in these documents.
    if (token.includes(':') && scriptIndex.has(token) && scriptIndex.get(token).length === 1) {
      return { kind: 'gate', id: scriptIndex.get(token)[0] };
    }
  }
  return { kind: 'unknown' };
}

/** Would this block be read as an enumeration of the merge gate? */
function isSuspect(block, gateIds, scriptIndex) {
  if (block.kind === 'fence') {
    // Shape, not membership: the historical failure is a list of `pnpm --filter`
    // commands that OMITS gates, so a line's shape is what makes it look like a
    // gate list, whether or not that particular script is in CI today.
    //
    // Only the workspace-runner shapes count. `node <script>.mjs` is a gate
    // identifier when the WORKFLOW runs it, but in a document five consecutive
    // `node scripts/capture-wire-fixture.mjs <scenario>` lines are a fixture
    // recipe, and calling that a gate list would be the noise that gets a guard
    // disabled. A merge-gate list in this repo is spelled `pnpm --filter` or `nx`.
    const shaped = block.entries.filter((e) => {
      const c = classifyCommand(e);
      return c.kind === 'gate' && (c.shape === 'pnpm-filter' || c.shape === 'nx');
    });
    return shaped.length >= 3 ? shaped.length : 0;
  }
  const rows = block.entries.filter((row) =>
    backtickedTokens(row).some(
      (tok) => tok.includes(':') && scriptIndex.has(tok),
    ),
  );
  return rows.length >= 3 ? rows.length : 0;
}

export function scanDocs(rootDir, gates) {
  const gateIds = new Set(gates.keys());
  const scriptIndex = new Map(); // `verify:pack` -> [ids running it]
  for (const id of gateIds) {
    const m = /^(\S+) run (\S+)$/.exec(id);
    if (!m) continue;
    if (!scriptIndex.has(m[2])) scriptIndex.set(m[2], []);
    scriptIndex.get(m[2]).push(id);
  }

  const findings = [];
  for (const file of walkMarkdown(rootDir)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('|') && !text.includes('```')) continue;
    for (const block of findBlocks(text)) {
      const d = block.directive;
      if (d?.kind === 'partial') {
        if (d.reason.length < 10) {
          findings.push({
            file,
            line: d.line,
            message:
              `\`gate-list: partial\` with no reason. Say why the list is incomplete:\n` +
              `      <!-- gate-list: partial -- historical record, predates lint:gate-parity -->`,
          });
        }
        continue;
      }
      if (d?.kind === 'complete') {
        const claimed = new Set();
        const unknownEntries = [];
        for (const entry of block.entries) {
          const r = resolveEntry(entry, gateIds, scriptIndex);
          if (r.kind === 'gate') claimed.add(r.id);
          else if (r.kind === 'unknown') unknownEntries.push(entry);
        }
        const missing = [...gateIds].filter((id) => !claimed.has(id)).sort();
        const extra = [...claimed].filter((id) => !gateIds.has(id)).sort();
        if (missing.length || extra.length || unknownEntries.length) {
          const parts = [];
          if (missing.length) parts.push(`      MISSING from the block (the \`${JOB}\` job runs these):\n` + missing.map((m) => `        ${m}`).join('\n'));
          if (extra.length) parts.push(`      NOT A GATE in the \`${JOB}\` job:\n` + extra.map((m) => `        ${m}`).join('\n'));
          if (unknownEntries.length) parts.push(`      UNRECOGNISED entries:\n` + unknownEntries.map((m) => `        ${m}`).join('\n'));
          findings.push({
            file,
            line: block.line,
            message:
              `marked \`gate-list: complete\`, but it does not equal the \`${JOB}\` job's gate set.\n` +
              parts.join('\n') +
              `\n      Either fix the block, or label it:  <!-- gate-list: partial -- <reason> -->`,
          });
        }
        continue;
      }
      const n = isSuspect(block, gateIds, scriptIndex);
      if (n) {
        findings.push({
          file,
          line: block.line,
          message:
            `this ${block.kind} looks like a gate list (${n} gate-shaped ${block.kind === 'fence' ? 'command(s)' : 'row(s)'}) and claims nothing.\n` +
            `      An unmarked partial list read as complete is the defect this guard exists for.\n` +
            `      Put ONE of these on the line above it:\n` +
            `        <!-- gate-list: complete -->\n` +
            `        <!-- gate-list: partial -- <why it is a subset> -->`,
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// self-test: the analyzer proven to DETECT, on fixtures, before any real run.
// ---------------------------------------------------------------------------

const FIXTURE_WORKFLOW = `name: test

on:
  push:
    branches: [main]

jobs:
  # a comment between the job and its steps
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # a comment above a step
      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Alpha guard
        run: pnpm --filter @kitn.ai/ui run lint:alpha

      - name: Unit tests (jsdom)
        run: pnpm --filter @kitn.ai/ui exec vitest run --project=unit

      - name: Bare script spelling
        run: pnpm --filter @kitn.ai/ui test:react

      - name: Build
        run: pnpm exec nx build ui

      - name: Suite in a subtree
        working-directory: examples/starters/tanstack-start
        run: node --test --test-reporter=spec

      - name: Cache npm
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: k

      - name: Two packages, one step
        run: |
          npm install --prefix "$RUNNER_TEMP/pin" npm@12.0.2
          pnpm --filter create-kai run verify:pack
          pnpm --filter @kitn.ai/ui run verify:pack

  storybook:
    steps:
      - name: A gate in ANOTHER job, which is not the merge gate
        run: pnpm --filter @kitn.ai/ui run lint:not-this-job
`;

const FIXTURE_GATES = [
  '@kitn.ai/ui run lint:alpha',
  '@kitn.ai/ui vitest unit',
  '@kitn.ai/ui run test:react',
  'nx build ui',
  'node --test (examples/starters/tanstack-start)',
  'create-kai run verify:pack',
  '@kitn.ai/ui run verify:pack',
];

const COMPLETE_AND_MATCHING = FIXTURE_GATES.map((g) => {
  if (g === '@kitn.ai/ui vitest unit') return 'pnpm --filter @kitn.ai/ui exec vitest run --project=unit';
  if (g === 'nx build ui') return 'pnpm exec nx build ui';
  if (g === 'node --test (examples/starters/tanstack-start)') return '# node --test (examples/starters/tanstack-start)';
  const m = /^(\S+) run (\S+)$/.exec(g);
  return `pnpm --filter ${m[1]} run ${m[2]}`;
});

function writeFixtureDocs(dir, files) {
  for (const [name, body] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
}

// Imported for its analyzers (a test, or a cross-check against a real YAML
// parser) rather than invoked? Then nothing below this line should happen.
const IS_MAIN = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (SELF_TEST && IS_MAIN) {
  let failed = 0;
  const report = (ok, name, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` ${detail}` : ''}`);
  };

  // -- the extractor, against a small fixture workflow --
  let fixture;
  try {
    fixture = analyzeWorkflow(FIXTURE_WORKFLOW, { minRunSteps: 5 });
    const got = [...fixture.gates.keys()].sort();
    const want = [...FIXTURE_GATES].sort();
    report(
      JSON.stringify(got) === JSON.stringify(want),
      'the extractor canonicalizes every shape in the fixture workflow',
      `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`,
    );
    report(
      !got.includes('@kitn.ai/ui run lint:not-this-job'),
      'a step in ANOTHER job is not part of the merge gate',
    );
    report(
      fixture.plumbing.length >= 3,
      'checkout / install / cache / npm-install classify as plumbing',
      `(${fixture.plumbing.length})`,
    );
  } catch (err) {
    report(false, 'the extractor canonicalizes every shape in the fixture workflow', `threw: ${err.message}`);
    fixture = { gates: new Map(FIXTURE_GATES.map((g) => [g, ['fixture']])) };
  }

  // -- the vacuity floor --
  try {
    analyzeWorkflow(FIXTURE_WORKFLOW, { minRunSteps: 30 });
    report(false, 'a step count below the floor is a HARD FAILURE, not an empty gate set');
  } catch (err) {
    report(
      err instanceof GuardError && /extractor found almost nothing/.test(err.message),
      'a step count below the floor is a HARD FAILURE, not an empty gate set',
      `(${err.message.split('\n')[0]})`,
    );
  }

  // -- an unrecognised step shape --
  try {
    analyzeWorkflow(FIXTURE_WORKFLOW.replace('run: pnpm exec nx build ui', 'run: make -j4 everything'), {
      minRunSteps: 5,
    });
    report(false, 'an unrecognised `run:` shape is a hard failure naming the step');
  } catch (err) {
    report(
      err instanceof GuardError && /unrecognised step shape/.test(err.message) && /make -j4 everything/.test(err.message),
      'an unrecognised `run:` shape is a hard failure naming the step',
    );
  }

  // -- the doc scanner, on a real temp tree --
  const tmp = mkdtempSync(join(tmpdir(), 'gate-parity-'));
  try {
    const fence = (lines) => '```bash\n' + lines.join('\n') + '\n```\n';
    writeFixtureDocs(tmp, {
      'ok-complete.md': `# ok\n\n<!-- gate-list: complete -->\n${fence(COMPLETE_AND_MATCHING)}`,
      'bad-missing.md': `# missing\n\n<!-- gate-list: complete -->\n${fence(COMPLETE_AND_MATCHING.slice(0, -1))}`,
      'bad-unknown.md': `# unknown\n\n<!-- gate-list: complete -->\n${fence([...COMPLETE_AND_MATCHING, 'pnpm --filter @kitn.ai/ui run lint:invented'])}`,
      // A gate-shaped entry that is not a gate and an entry that resolves to
      // NOTHING take different paths through the checker, and the first case
      // alone left the second unexercised -- found by mutating the analyzer.
      'bad-unresolvable.md': `# unresolvable\n\n<!-- gate-list: complete -->\n${fence([...COMPLETE_AND_MATCHING, 'make -j4 everything'])}`,
      'bad-partial-no-reason.md': `# reasonless\n\n<!-- gate-list: partial -->\n${fence([
        'pnpm --filter @kitn.ai/ui run lint:alpha',
        'pnpm --filter @kitn.ai/ui run verify:pack',
        'pnpm --filter @kitn.ai/ui exec vitest run --project=unit',
      ])}`,
      'bad-unmarked.md': `# unmarked\n\n${fence([
        'pnpm --filter @kitn.ai/ui run lint:alpha',
        'pnpm --filter @kitn.ai/ui run verify:pack',
        'pnpm --filter @kitn.ai/ui exec vitest run --project=unit',
      ])}`,
      'ok-partial.md': `# partial\n\n<!-- gate-list: partial -- historical record, predates this guard -->\n${fence([
        'pnpm --filter @kitn.ai/ui run lint:alpha',
        'pnpm --filter @kitn.ai/ui run verify:pack',
        'pnpm --filter @kitn.ai/ui exec vitest run --project=unit',
      ])}`,
      'ok-prose.md': `# prose\n\nRun \`pnpm --filter @kitn.ai/ui run verify:pack\` and \`lint:alpha\` and \`test:react\` before you push.\n`,
      'ok-two-commands.md': `# two\n\n${fence([
        'pnpm --filter @kitn.ai/ui run lint:alpha',
        'pnpm --filter @kitn.ai/ui run verify:pack',
      ])}`,
      'bad-unmarked-table.md':
        `# table\n\n| # | step |\n| --- | --- |\n| 1 | \`lint:alpha\` |\n| 2 | \`verify:pack\` |\n| 3 | \`test:react\` |\n`,
      'ok-partial-table.md':
        `# table\n\n<!-- gate-list: partial -- a historical snapshot of the job -->\n| # | step |\n| --- | --- |\n| 1 | \`lint:alpha\` |\n| 2 | \`verify:pack\` |\n| 3 | \`test:react\` |\n`,
      'nested/bad-unmarked-nested.md': `# nested\n\n${fence([
        'pnpm --filter @kitn.ai/ui run lint:alpha',
        'pnpm --filter @kitn.ai/ui run verify:pack',
        'pnpm --filter @kitn.ai/ui run test:react',
      ])}`,
    });

    const findings = scanDocs(tmp, fixture.gates);
    const firedOn = (name) => findings.some((f) => relative(tmp, f.file) === name);
    const cases = [
      ['ok-complete.md', false, 'a complete block equal to the gate set passes'],
      ['bad-missing.md', true, 'a complete block MISSING a gate fails'],
      ['bad-unknown.md', true, 'a complete block with an entry that is not a gate fails'],
      ['bad-unresolvable.md', true, 'a complete block with an entry that resolves to nothing fails'],
      ['bad-partial-no-reason.md', true, 'a `partial` label with no reason fails'],
      ['bad-unmarked.md', true, 'an unmarked 3-command block fails -- THE TEETH'],
      ['ok-partial.md', false, 'a labelled partial block is skipped'],
      ['ok-prose.md', false, 'prose naming gates is not a list claim'],
      ['ok-two-commands.md', false, 'two commands is under the suspect threshold'],
      ['bad-unmarked-table.md', true, 'an unmarked table naming 3 namespaced gates fails'],
      ['ok-partial-table.md', false, 'a labelled partial table is skipped'],
      ['nested/bad-unmarked-nested.md', true, 'the walk reaches subdirectories'],
    ];
    for (const [name, expect, label] of cases) {
      report(firedOn(name) === expect, label, `(expected ${expect ? 'a finding' : 'clean'}, got ${firedOn(name) ? 'a finding' : 'clean'})`);
    }

    // The missing-gate message must NAME what is missing, or the finding is
    // useless and gets labelled `partial` out of confusion.
    const missing = findings.find((f) => relative(tmp, f.file) === 'bad-missing.md');
    report(
      Boolean(missing) && /MISSING from the block/.test(missing.message) && /@kitn\.ai\/ui run verify:pack/.test(missing.message),
      'the missing-gate finding names the gate that is missing',
    );

    // An empty doc tree must not be mistaken for a clean one by the CALLER:
    // this returns no findings, and the real run reports the file count.
    report(scanDocs(join(tmp, 'does-not-exist'), fixture.gates).length === 0, 'a missing doc root yields no findings (the caller reports the count)');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  if (failed > 0) {
    console.error(`\n✗ lint-gate-parity self-test: ${failed} case(s) failed.`);
    process.exit(1);
  }
  console.log(`\n✓ lint-gate-parity self-test: every case behaves as specified.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
if (!IS_MAIN) {
  // Imported as a library. The analyzers above are the exports; there is
  // nothing to run and, crucially, nothing to `process.exit()` out of a caller.
} else {
const workflowPath = join(REPO_ROOT, WORKFLOW);
if (!existsSync(workflowPath)) {
  console.error(
    `\n✗ lint-gate-parity: no ${WORKFLOW} under ${REPO_ROOT}.\n` +
      `  This script is misrooted, or the required job moved. Pass --repo-root <dir>.`,
  );
  process.exit(1);
}

let analysis;
try {
  analysis = analyzeWorkflow(readFileSync(workflowPath, 'utf8'));
} catch (err) {
  if (!(err instanceof GuardError)) throw err;
  console.error(`\n✗ lint-gate-parity: ${err.message}`);
  process.exit(1);
}

const docRoot = join(REPO_ROOT, DOC_ROOT);
if (!existsSync(docRoot)) {
  console.error(
    `\n✗ lint-gate-parity: no ${DOC_ROOT}/ under ${REPO_ROOT}.\n` +
      `  Nothing could be scanned, which is this script being misrooted rather than the docs being clean.`,
  );
  process.exit(1);
}

if (LIST) {
  console.log(`the \`${JOB}\` job runs ${analysis.gates.size} gate(s):\n`);
  for (const [id, steps] of [...analysis.gates.entries()].sort()) {
    console.log(`  ${id}\n      ${steps.join(' · ')}`);
  }
  console.log(`\n  plus ${analysis.plumbing.length} plumbing step(s) (checkout, install, cache, browser download).`);
  process.exit(0);
}

const docFiles = walkMarkdown(docRoot);
console.log(
  `  · ${analysis.gates.size} gate(s) from ${WORKFLOW}:${JOB} (${analysis.runStepCount} run steps), ` +
    `${docFiles.length} doc file(s) under ${DOC_ROOT}/`,
);

const findings = scanDocs(docRoot, analysis.gates);
if (findings.length === 0) {
  console.log(`✓ lint-gate-parity: no documented gate list contradicts the \`${JOB}\` job.`);
  process.exit(0);
}

console.error(`\n✗ lint-gate-parity: ${findings.length} gate-list problem(s).\n`);
for (const f of findings) {
  console.error(`  ${relative(REPO_ROOT, f.file)}:${f.line}\n      ${f.message}\n`);
}
console.error(
  `  A list somebody typed once is not the job. "Every gate is green" was said over a\n` +
    `  five-command list while the required job was red on a sixth check that was not in it.\n` +
    `  Mark a block \`complete\` and keep it equal, or label it \`partial\` and say why.\n` +
    `  \`node packages/ui/scripts/lint-gate-parity.mjs --list\` prints the gate set.`,
);
process.exit(1);
}
