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
        `  add it to RUNTIME_CACHES in packages/ui/scripts/verify-artifact-glob.mjs with a written reason.`,
    );
  }

  console.log(
    `✓ verify-artifact-glob: ${globs.length} glob(s) cover all ${written.length} gitignored path(s) the build wrote under ${SCOPE}/.`,
  );
}
