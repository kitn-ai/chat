#!/usr/bin/env node
/**
 * Verify the `@kitn.ai/ui` pin against the REGISTRY.
 *
 * The script `test/kit-contract.test.ts` has referred to by name since it was
 * written, and which did not exist. Its docblock says a green run there means
 * "the templates agree with the kit they ship beside" and explicitly does NOT
 * prove the PINNED range is publishable — "`verify-pin.mjs` is the check for
 * that, and it needs the network". The gap that sentence describes is the gap
 * `create-kai@0.1.2` shipped through: a pin of `^0.24.0` against a kit whose
 * `0.24.0` had been deprecated for a critical XSS.
 *
 * TWO PINS ARE CHECKED, and the second is the one that catches the recurrence.
 *
 *   · THE TREE'S. What a build from this checkout would bake. Catches publishing
 *     the CLI ahead of the kit it pins, and catches a checkout whose kit is
 *     already behind the registry.
 *   · THE PUBLISHED ONE. What the `create-kai` npm is serving right now actually
 *     bakes, read out of its own tarball. Nothing else in this repo looks at
 *     this, and it is the only place the incident was visible: the tree was
 *     fine, `main` was green, and the artefact on the registry was stranded.
 *
 * WHY THIS IS NOT IN `npm run build`. It needs the network, and `build` runs
 * inside `prepublishOnly` — a registry blip would break a release that is
 * otherwise correct, and a build that fails offline is a build people learn to
 * work around. It belongs where the network is already a hard dependency: the
 * release workflow, which publishes to npm in the same job.
 *
 * THE RULES ARE NOT IN THIS FILE, matching scripts/build.mjs. Everything that
 * decides whether something is a problem lives in `src/pin-guards.ts`, where
 * `test/pin-guards.test.ts` drives each rule directly and watches it reject.
 * What is here is I/O: run npm, unpack a tarball, hand bytes to a rule, print
 * what it returned.
 *
 * SEAMS, so the failures can be watched rather than trusted:
 *
 *   node scripts/verify-pin.mjs --pin ^0.24.0     # grade the historical bad pin
 *   node scripts/verify-pin.mjs --published create-kai@0.1.2
 *   node scripts/verify-pin.mjs --skip-published  # tree pin only, one npm call
 *
 * `--pin` replaces the tree-derived range with one given on the command line,
 * which is how the real registry is used to reproduce the incident on demand.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTs } from './load-ts.mjs';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pkgRoot, '../..');

const KIT = '@kitn.ai/ui';

const guards = await loadTs(pkgRoot, 'src/pin-guards.ts');
const { derivePin } = await loadTs(pkgRoot, 'src/kit-pin.ts');

// ── arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(name);
  return at === -1 ? null : argv[at + 1];
};
const pinOverride = flag('--pin');
const publishedSpec = flag('--published') ?? 'create-kai@latest';
const skipPublished = argv.includes('--skip-published');

// ── npm, the resolution oracle ───────────────────────────────────────────────

/**
 * `npm view`, as JSON, or null when npm exits non-zero.
 *
 * A non-zero exit is overwhelmingly E404 — the range matched nothing — which is
 * a fact the rules want rather than an error. It is NOT swallowed: the caller
 * turns it into `resolved: null`, which `unresolvablePinProblem` reports.
 */
function npmView(spec, field) {
  try {
    const raw = execFileSync('npm', ['view', spec, field, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return raw === '' ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * What `spec` resolves to, as ONE version.
 *
 * A range matching several versions makes `npm view` return an array; the
 * highest is what an install picks, and npm lists them ascending. Taking
 * `[0]` here would grade a version no user ever receives.
 */
function resolveVersion(range) {
  const seen = npmView(`${KIT}@${range}`, 'version');
  if (seen === null) return null;
  return Array.isArray(seen) ? (seen[seen.length - 1] ?? null) : seen;
}

/** The deprecation message on an exact version, or null. */
function deprecationOf(version) {
  const seen = npmView(`${KIT}@${version}`, 'deprecated');
  if (seen === null || seen === false || seen === '') return null;
  return Array.isArray(seen) ? (seen[seen.length - 1] ?? null) : seen;
}

/** The facts one pin is graded against. */
function factsFor(pin, latest) {
  const resolved = resolveVersion(pin);
  return {
    resolved,
    deprecation: resolved === null ? null : deprecationOf(resolved),
    latest,
  };
}

// ── the published artefact ───────────────────────────────────────────────────

/**
 * The pin baked into the `create-kai` npm is serving.
 *
 * `npm pack <spec>` rather than `npm install`, and the bundle is READ rather
 * than executed: this is arbitrary published code and there is no reason to run
 * it to find out what string it contains.
 */
function publishedPin(spec) {
  const dir = mkdtempSync(path.join(tmpdir(), 'create-kai-pin-'));
  try {
    execFileSync('npm', ['pack', spec, '--pack-destination', dir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tarball = readdirSync(dir).find((f) => f.endsWith('.tgz'));
    if (!tarball) return { error: `npm pack ${spec} produced no tarball` };
    execFileSync('tar', ['-xzf', path.join(dir, tarball), '-C', dir], { stdio: 'ignore' });
    const bundle = readFileSync(path.join(dir, 'package/dist/index.js'), 'utf8');
    const version = JSON.parse(
      readFileSync(path.join(dir, 'package/package.json'), 'utf8'),
    ).version;
    return { pin: guards.extractPinnedRange(bundle), version };
  } catch (err) {
    return { error: `could not read ${spec} from the registry: ${err.message ?? err}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── run ──────────────────────────────────────────────────────────────────────

const kitVersion = JSON.parse(
  readFileSync(path.join(repoRoot, 'packages/ui/package.json'), 'utf8'),
).version;

const latest = npmView(KIT, 'version');
if (latest === null) {
  console.error(
    `create-kai: cannot reach the npm registry to resolve ${KIT}.\n` +
      '  This check is network-dependent by design — there is no offline answer to\n' +
      '  "is the published pin still installable". Re-run with a network.',
  );
  process.exit(1);
}

const problems = [];
const lines = [];

// 1. The pin this tree would bake.
const treePin = pinOverride ?? derivePin(kitVersion);
const treeLabel = pinOverride
  ? `the pin given on the command line (${pinOverride})`
  : `this working tree (kit ${kitVersion})`;
const treeFacts = factsFor(treePin, latest);
const treeProblem = guards.pinProblem({ label: treeLabel, pin: treePin }, treeFacts);
if (treeProblem) problems.push(treeProblem);
else lines.push(`  tree       ${treePin} -> ${treeFacts.resolved} (latest, not deprecated)`);

// 2. The pin the registry is serving right now.
if (!skipPublished) {
  const found = publishedPin(publishedSpec);
  if (found.error) {
    problems.push(found.error);
  } else if (found.pin === null) {
    problems.push(guards.unreadablePinProblem(`${publishedSpec} (create-kai@${found.version})`));
  } else {
    const label = `the PUBLISHED create-kai@${found.version}`;
    const facts = factsFor(found.pin, latest);
    const problem = guards.pinProblem({ label, pin: found.pin }, facts);
    if (problem) problems.push(problem);
    else lines.push(`  published  ${found.pin} -> ${facts.resolved} (latest, not deprecated)`);
  }
}

// What PASSED is printed either way. The two pins fail independently — the
// normal state of this incident is a healthy tree and a stranded artefact — and
// a reader who sees only the failure cannot tell which of those they are in
// without re-running the command a different way.
for (const line of lines) console.log(line);

if (problems.length > 0) {
  console.error(`\ncreate-kai: the ${KIT} pin is not shippable\n`);
  for (const problem of problems) console.error(`  · ${problem}\n`);
  process.exit(1);
}

console.log(`create-kai: ${KIT} pin OK — registry latest is ${latest}`);
