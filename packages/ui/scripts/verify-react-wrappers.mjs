// Regression guard for the generated React wrappers bundle (dist/react.js, the
// `@kitn.ai/ui/react` entry). Each wrapper lazily imports its element via a
// per-element specifier `@kitn.ai/ui/elements/<X>` — if the generator emits a
// specifier whose `dist/elements/<X>.js` does not exist, the import 404s at
// runtime and `<Chat>` (et al.) silently never registers in every React
// consumer. The bundle must ALSO open with a 'use client' directive or RSC
// builds reject the hooks it uses. This asserts both so that regression can
// never silently ship again.
//
// Paths are anchored to THIS FILE, not to the cwd. `npm run build` sets the cwd to the
// package, but CLAUDE.md tells everyone to run from the REPO ROOT, and done that way the
// cwd-relative version MISDIAGNOSED ITSELF: it reported "not found — run the lib build
// first" against a tree that had just built green. The element lookup below was worse
// than that, because it is a check rather than a bail: a cwd holding `dist/react.js` but
// no `dist/elements/` reported all 78 wrappers as pointing at missing files (measured),
// which is a loud alarm about nothing. Both now resolve against the package, and that
// FALSE-POSITIVE shape is one of the self-test cases below — it is the failure mode no
// planted defect can catch, because every planted defect expects red.
//
// THIS SCRIPT GATES EVERY PUBLISH — `prepublishOnly` runs `build`, and `build` runs
// this — so its detection is exercised rather than assumed:
//
//   node packages/ui/scripts/verify-react-wrappers.mjs                      # the real dist/
//   node packages/ui/scripts/verify-react-wrappers.mjs --self-test          # prove it still detects
//   node packages/ui/scripts/verify-react-wrappers.mjs --package-root <dir> # any tree, e.g. a planted defect
//
// A ZERO-SPECIFIER RUN IS A HARD FAILURE. The check is "every specifier resolves",
// and a bundle the SPECIFIER regex matches nothing in satisfies that vacuously: zero
// of zero resolve, no missing files, exit 0. That is the wrapper generator having
// changed its import shape out from under this guard, not a healthy bundle, and it is
// precisely how a check goes on passing while covering nothing.
import { existsSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const PKG_ROOT = resolve(argOf('--package-root') ?? join(SCRIPT_DIR, '..'));
const SELF_TEST = argv.includes('--self-test');

// Absolute for fs, short for humans: the messages below read the same as they always did.
const BUNDLE = 'dist/react.js';
const ELEMENTS_DIR = 'dist/elements';
const SPECIFIER = /@kitn\.ai\/ui\/elements\/([a-z0-9-]+)/g;

/**
 * Everything wrong with ONE package tree, as a list of messages. A pure function
 * of the tree so `--self-test` can drive it over fixtures; the process exits are
 * all in the caller.
 *
 * Returns `{ problems, names }`. `problems` empty is the pass.
 */
function checkTree(root) {
  const bundlePath = join(root, BUNDLE);
  let code;
  try {
    code = readFileSync(bundlePath, 'utf8');
  } catch {
    return { problems: [`${bundlePath} not found — run the lib build first.`], names: [] };
  }

  const problems = [];
  const names = [...new Set([...code.matchAll(SPECIFIER)].map((m) => m[1]))];

  // 0. The vacuity tripwire, checked BEFORE the per-specifier work it makes
  //    meaningless. Zero specifiers is not "all of them resolve".
  if (names.length === 0) {
    return {
      problems: [
        `${BUNDLE} contains NO \`@kitn.ai/ui/elements/<X>\` specifier at all.\n` +
          `  Every wrapper is supposed to lazily import its element through one, so this is\n` +
          `  either an empty bundle or the generator having changed its import shape — and\n` +
          `  in both cases the checks below would pass over nothing. See frameworks/react/.`,
      ],
      names,
    };
  }

  // 1. A missing dist/elements/ ENTIRELY is a different fact from N missing files,
  //    and saying so is what stops the "all 78 wrappers are broken" alarm from
  //    ever reading as a wrapper problem again.
  if (!existsSync(join(root, ELEMENTS_DIR))) {
    problems.push(
      `${ELEMENTS_DIR}/ does not exist under ${root}.\n` +
        `  All ${names.length} specifier(s) would be reported missing, which is one broken or\n` +
        `  partial build — not ${names.length} broken wrappers. Run the lib build (npm run build:elements).`,
    );
    return { problems, names };
  }

  // 2. Every per-element specifier must resolve to a real dist/elements file.
  const missing = names.filter((name) => !existsSync(join(root, `${ELEMENTS_DIR}/${name}.js`)));
  if (missing.length > 0) {
    problems.push(
      `${missing.length} react wrapper specifier(s) point at non-existent element files:\n` +
        missing
          .map((name) => `    @kitn.ai/ui/elements/${name} → ${ELEMENTS_DIR}/${name}.js (missing)`)
          .join('\n'),
    );
  }

  // 3. The bundle must open with a 'use client' directive (first non-empty line).
  const firstLine = code.split('\n').find((line) => line.trim() !== '') ?? '';
  if (!/^\s*['"]use client['"]/.test(firstLine)) {
    problems.push(
      `${BUNDLE} is missing its 'use client' banner — the first non-empty line is:\n` +
        `    ${firstLine.trim() || '(empty)'}\n` +
        `  RSC consumers will reject the React hooks the wrappers use.`,
    );
  }

  return { problems, names };
}

// ---------------------------------------------------------------------------
// self-test: synthesize package roots, plant one defect each, and require the
// right message — plus, on a healthy tree, EXACTLY ZERO findings. That last one
// is not padding: the defect this file's header records was a false POSITIVE,
// and no planted defect can catch a guard that shouts about a clean tree.
// ---------------------------------------------------------------------------
const FIXTURE_ELEMENTS = ['kai-chat', 'kai-message', 'kai-thread'];

const wrapperBundle = (elements = FIXTURE_ELEMENTS, { useClient = true } = {}) =>
  (useClient ? `'use client';\n` : '') +
  elements
    .map((el) => {
      const id = el.replace(/-/g, '_');
      return (
        `const load_${id} = () => import('@kitn.ai/ui/elements/${el}');\n` +
        `export const ${id} = () => { useEffect(() => { load_${id}(); }, []); return null; };`
      );
    })
    .join('\n');

/** The healthy tree, with `over` merged on top (a `null` value deletes a file). */
const fixtureFiles = (over = {}) => ({
  'dist/react.js': wrapperBundle(),
  ...Object.fromEntries(FIXTURE_ELEMENTS.map((el) => [`${ELEMENTS_DIR}/${el}.js`, `export const ${el} = 1;\n`])),
  ...over,
});

function writeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'verify-react-wrappers-selftest-'));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const SELF_TEST_CASES = [
  {
    name: 'a healthy tree draws EXACTLY zero findings (the false-positive case)',
    files: fixtureFiles(),
    expect: [],
  },
  {
    name: 'a leading blank line before the banner is still a banner',
    files: fixtureFiles({ 'dist/react.js': `\n${wrapperBundle()}` }),
    expect: [],
  },
  {
    name: 'DEFECT: a specifier whose dist/elements/<X>.js was never emitted',
    files: fixtureFiles({ [`${ELEMENTS_DIR}/kai-thread.js`]: null }),
    // Naming the offender is half the check: "1 wrapper is broken" is not actionable.
    expect: ['non-existent element files', '@kitn.ai/ui/elements/kai-thread', 'dist/elements/kai-thread.js (missing)'],
    reject: ["missing its 'use client' banner"],
  },
  {
    name: 'DEFECT: the `use client` banner is gone',
    files: fixtureFiles({ 'dist/react.js': wrapperBundle(FIXTURE_ELEMENTS, { useClient: false }) }),
    expect: ["missing its 'use client' banner"],
    reject: ['non-existent element files'],
  },
  {
    name: 'both defects at once are both reported',
    files: fixtureFiles({
      'dist/react.js': wrapperBundle(FIXTURE_ELEMENTS, { useClient: false }),
      [`${ELEMENTS_DIR}/kai-message.js`]: null,
    }),
    expect: ['@kitn.ai/ui/elements/kai-message', "missing its 'use client' banner"],
  },
  {
    name: 'VACUITY: a bundle with no element specifier at all is a FAILURE, not a pass',
    files: fixtureFiles({ 'dist/react.js': `'use client';\nexport const Chat = () => null;\n` }),
    expect: ['NO `@kitn.ai/ui/elements/<X>` specifier'],
    reject: ['non-existent element files'],
  },
  {
    name: 'a missing dist/elements/ reads as ONE broken build, not N broken wrappers',
    files: { 'dist/react.js': wrapperBundle() },
    expect: ['does not exist under'],
    reject: ['non-existent element files'],
  },
  {
    name: 'no dist/react.js at all',
    files: fixtureFiles({ 'dist/react.js': null }),
    expect: ['not found'],
  },
];

if (SELF_TEST) {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const { problems } = checkTree(writeFixture(c.files));
    const joined = problems.join('\n');
    const missingExpected = c.expect.filter((s) => !joined.includes(s));
    const wrongfullyPresent = (c.reject ?? []).filter((s) => joined.includes(s));
    const cleanMismatch = c.expect.length === 0 && problems.length > 0;
    const ok = missingExpected.length === 0 && wrongfullyPresent.length === 0 && !cleanMismatch;
    if (!ok) failed++;
    const got = problems.length === 0 ? 'clean' : `${problems.length} finding(s)`;
    console.log(
      `${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect.length === 0 ? 'clean' : c.expect.map((s) => `"${s}"`).join(' + ')}, got ${got})`,
    );
    if (missingExpected.length > 0) console.log(`    missing: ${missingExpected.map((s) => `"${s}"`).join(', ')}`);
    if (wrongfullyPresent.length > 0) console.log(`    fired for the wrong reason: ${wrongfullyPresent.map((s) => `"${s}"`).join(', ')}`);
    if (cleanMismatch) console.log(`    unexpected: ${joined.split('\n')[0]}`);
  }
  if (failed > 0) {
    console.error(`\n✗ verify-react-wrappers self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(
    `\n✓ verify-react-wrappers self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
const { problems, names } = checkTree(PKG_ROOT);

if (problems.length > 0) {
  console.error(
    `✗ verify-react-wrappers: ${BUNDLE} failed validation.\n` +
      problems.map((p) => `  ${p}`).join('\n') +
      `\n  See frameworks/react/ (the wrapper generator) and src/elements/ —\n` +
      `  every wrapped element needs a matching dist/elements/<X>.js entry.`,
  );
  process.exit(1);
}

console.log(
  `✓ verify-react-wrappers — ${BUNDLE} has 'use client' and all ${names.length} element specifiers resolve`,
);
