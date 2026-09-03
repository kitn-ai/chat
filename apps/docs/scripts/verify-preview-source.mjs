// THE PRODUCTION BUILD PREVIEWS THE PUBLISHED KIT. Spec 5.6.
//
// The two preview modes look identical on screen and only one of them proves
// anything: the production page is the standing evidence that a pasted block
// runs cold off the CDN. The failure this catches is KAI_BLOCKS_KIT=local
// leaking into a deploy, which looks perfect, serves a kit path that is not
// deployed, and quietly retires the proof while the footer still claims it.
//
//   node scripts/verify-preview-source.mjs
//   node scripts/verify-preview-source.mjs --require-published  # deploy form
//   node scripts/verify-preview-source.mjs --self-test          # prove it detects
//
// Runs over apps/docs/dist AFTER a production build. It never skips: a missing
// dist is a hard failure, because "no build to check" is how a guard that
// proves nothing looks from the outside.
//
// TWO MODES, AND WHY. The structural checks below are facts about THIS
// checkout and are always fatal. The PUBLISHED-ENTRY probe is a fact about
// npm and jsDelivr at this moment: it HEADs every kit entry the built
// previews import and reports whether the registry actually serves it. That
// can be red for a reason no commit here can fix -- the kit version the forms
// pin ships a new entry only at the next release -- so it must not hold the
// required CI graph hostage to the release cadence. Hence: `dist-guards` runs
// the plain form and gets a WARNING table with the exit code untouched, and
// the deploy workflow (.github/workflows/deploy-docs.yml, wired in Task 9)
// runs --require-published, where a non-200 is fatal because shipping that
// deploy would put empty previews on the live page.
//
// The footer wording is IMPORTED from copy-blocks.mjs rather than restated
// here: that script is where the preview source is decided, so a guard with
// its own copy of the sentence could go green over a footer nobody writes.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewSource } from './copy-blocks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist');
const SELF_TEST = process.argv.includes('--self-test');
const REQUIRE_PUBLISHED = process.argv.includes('--require-published');

const require = createRequire(import.meta.url);
const version = JSON.parse(
  readFileSync(require.resolve('@kitn.ai/ui/package.json'), 'utf8'),
).version;

const CDN_PIN = `https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${version}/dist/`;
// The two path markers are scanned across the whole built site: neither string
// has any innocent reason to appear in a deployed page.
const LOCAL_MARKERS = ['/blocks/kit/', '/blocks/local/'];
// The footer, in the words copy-blocks.mjs writes, for both modes. The local
// one must not ship; the production one must.
const LOCAL_FOOTER = previewSource({ KAI_BLOCKS_KIT: 'local' }, version).footer;
const CDN_FOOTER = previewSource({}, version).footer;
// `packages/ui/dist` is the FOOTER's words, not a path, and a guide sentence
// mentioning that directory would otherwise turn a docs edit into a red
// preview-source gate with a misleading message. So it is scanned only where
// the footer can be: any chunk carrying the word both footers open with.
// Taken off the footer rather than typed, so it cannot drift out of scope.
const FOOTER_SCOPE = LOCAL_FOOTER.split(' ')[0];
// How long one HEAD may take before it counts as a failure to answer.
const PROBE_TIMEOUT_MS = 15000;

/** Every file under a directory, recursively. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** The checks, as a pure function over a virtual tree, so --self-test can
 *  plant a defect without touching the real build. */
export function check(files, { cdnPin, localMarkers, localFooter, cdnFooter, footerScope }) {
  const problems = [];
  const previews = files.filter((f) => f.path.endsWith('.cdn.html'));

  if (previews.length === 0) {
    problems.push(
      'no <id>.cdn.html under dist/blocks/r/. The production preview IS the pinned CDN form, so zero of them means the prebuild copy did not run or the build ran in local mode.',
    );
  }
  for (const preview of previews) {
    if (!preview.content.includes(cdnPin)) {
      problems.push(
        `${preview.path} does not import ${cdnPin}. A production preview that is not pinned to the published version proves nothing about the published artifact.`,
      );
    }
  }

  if (files.some((f) => f.path.includes('/blocks/local/'))) {
    problems.push('dist/blocks/local/ exists: this build ran with KAI_BLOCKS_KIT=local.');
  }
  if (files.some((f) => f.path.includes('/blocks/kit/'))) {
    problems.push('dist/blocks/kit/ exists: this build shipped a local copy of the kit.');
  }

  const text = files.filter((f) => /\.(html|js|css|json)$/.test(f.path));
  for (const marker of localMarkers) {
    const hit = text.find((f) => f.content.includes(marker));
    if (hit) {
      problems.push(
        `${hit.path} carries the local-preview path "${marker}". A deployed page must load the kit from the CDN pin, never from a path that only exists in a working tree.`,
      );
    }
  }

  // The footer's own words, scanned only where the footer can be rendered
  // from: any chunk that carries the opening word. A prose page that happens
  // to mention packages/ui/dist is not this guard's business.
  const footerCarriers = text.filter((f) => f.content.includes(footerScope));
  const localFooterHit = footerCarriers.find((f) => f.content.includes(localFooter));
  if (localFooterHit) {
    problems.push(
      `${localFooterHit.path} carries the LOCAL footer text ("${localFooter}"). The deployed page must say it is previewing the published kit, because that is what it is doing and the claim is the whole point of the production preview.`,
    );
  }

  const footer = text.find((f) => f.content.includes(cdnFooter));
  if (!footer) {
    problems.push(
      `no built asset carries the production footer ("${cdnFooter}"). The footer states the preview source in words and the deployed one must say the published kit.`,
    );
  }

  return problems;
}

/**
 * Every kit entry the built previews IMPORT, deduped. Pure.
 *
 * The previews are the only place the pinned URLs are written, and they are
 * written as ES import specifiers, so this reads the specifiers rather than
 * grepping for anything URL-shaped in the page.
 */
export function collectPublishedEntries(files, cdnPin) {
  const urls = new Set();
  for (const preview of files.filter((f) => f.path.endsWith('.cdn.html'))) {
    for (const m of preview.content.matchAll(/\b(?:import|from)\s*(['"])([^'"]+)\1/g)) {
      if (m[2].startsWith(cdnPin)) urls.add(m[2]);
    }
  }
  return [...urls].sort();
}

/**
 * HEAD each URL once and report what the registry served. `fetchImpl` is
 * injected so --self-test can watch both verdicts without a network.
 */
export async function probePublished(urls, fetchImpl = fetch, timeoutMs = PROBE_TIMEOUT_MS) {
  const results = [];
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { method: 'HEAD', signal: controller.signal });
      results.push({ url, status: res.status, ok: res.status === 200 });
    } catch (err) {
      results.push({ url, status: 0, ok: false, error: err?.message ?? String(err) });
    } finally {
      clearTimeout(timer);
    }
  }
  return results;
}

/**
 * Whether a probe result set stops the run. This is the ONLY thing
 * --require-published changes, so it is a pure function the self-test can put
 * both verdicts through.
 */
export function probeIsFatal(probed, requirePublished) {
  return requirePublished && probed.some((r) => !r.ok);
}

function printProbeTable(results, cdnPin, heading) {
  console.error(`\n${heading}\n`);
  for (const r of results) {
    const entry = r.url.startsWith(cdnPin) ? r.url.slice(cdnPin.length) : r.url;
    const status = r.status === 0 ? `no answer (${r.error})` : String(r.status);
    console.error(`  ${r.ok ? 'ok  ' : 'MISS'}  ${entry}  ->  ${status}`);
  }
  console.error('');
}

function loadTree() {
  if (!existsSync(DIST)) {
    console.error(
      `\nx preview source: ${DIST} does not exist. Build the site first: pnpm --filter @kitn.ai/docs run build\n`,
    );
    process.exit(1);
  }
  return walk(DIST).map((path) => ({
    path: path.slice(DIST.length),
    content: /\.(html|js|css|json)$/.test(path) ? readFileSync(path, 'utf8') : '',
  }));
}

const OPTIONS = {
  cdnPin: CDN_PIN,
  localMarkers: LOCAL_MARKERS,
  localFooter: LOCAL_FOOTER,
  cdnFooter: CDN_FOOTER,
  footerScope: FOOTER_SCOPE,
};

async function selfTest() {
  const good = [
    {
      path: '/blocks/r/x.cdn.html',
      content: `<script type="module">import '${CDN_PIN}elements/autoloader.js';\nimport { readModelStream } from '${CDN_PIN}wire.js';</script>`,
    },
    { path: '/_astro/page.js', content: `const f = ${JSON.stringify(CDN_FOOTER)};` },
  ];
  const cleanRun = check(good, OPTIONS);
  if (cleanRun.length !== 0) {
    console.error('x self-test: the clean tree was reported as broken:', cleanRun);
    process.exit(1);
  }
  const planted = [
    [{ ...good[0], content: '<script type="module">import "/blocks/kit/elements/autoloader.js";</script>' }, good[1]],
    [good[0], { path: '/blocks/local/x.html', content: '' }, good[1]],
    [good[0], { path: '/_astro/page.js', content: `const f = ${JSON.stringify(LOCAL_FOOTER)};` }],
    [good[1]],
  ];
  for (const [i, tree] of planted.entries()) {
    const problems = check(tree, OPTIONS);
    if (problems.length === 0) {
      console.error(`x self-test: planted defect ${i + 1} was NOT detected.`);
      process.exit(1);
    }
    console.log(`  self-test ${i + 1}: detected -- ${problems[0]}`);
  }

  // The published-entry probe, both verdicts, against a stub registry that
  // serves one entry and 404s the other.
  const entries = collectPublishedEntries(good, CDN_PIN);
  if (entries.length !== 2) {
    console.error(`x self-test: expected both import specifiers to be collected, got ${entries.length}.`);
    process.exit(1);
  }
  if (collectPublishedEntries([good[1]], CDN_PIN).length !== 0) {
    console.error('x self-test: collectPublishedEntries read a URL out of a non-preview file.');
    process.exit(1);
  }
  const missing = `${CDN_PIN}wire.js`;
  const stub = async (url) => ({ status: url === missing ? 404 : 200 });
  const probed = await probePublished(entries, stub, 50);
  const bad = probed.filter((r) => !r.ok);
  if (bad.length !== 1 || bad[0].url !== missing) {
    console.error('x self-test: the planted missing entry was NOT detected:', probed);
    process.exit(1);
  }
  console.log(`  self-test 5: detected -- a planted missing published entry (${bad[0].url} -> ${bad[0].status})`);

  const clean = [{ url: missing, status: 200, ok: true }];
  if (
    probeIsFatal(probed, true) !== true ||
    probeIsFatal(probed, false) !== false ||
    probeIsFatal(clean, true) !== false
  ) {
    console.error('x self-test: the two probe modes do not differ the way they must.');
    process.exit(1);
  }
  console.log(
    '  self-test 6: the same miss is fatal with --require-published and a warning without it, and a clean probe is fatal in neither',
  );

  const unreachable = await probePublished([missing], async () => {
    throw new Error('stub network is down');
  }, 50);
  if (unreachable[0].ok || unreachable[0].status !== 0) {
    console.error('x self-test: a network failure was NOT counted as a miss:', unreachable);
    process.exit(1);
  }
  console.log(`  self-test 7: detected -- a network failure counts as a miss (${unreachable[0].error})`);

  console.log('\nok preview source --self-test: every planted defect detected.\n');
  process.exit(0);
}

async function main() {
  if (SELF_TEST) return selfTest();

  const files = loadTree();
  const problems = check(files, OPTIONS);
  if (problems.length > 0) {
    console.error('\nx preview source:\n');
    for (const p of problems) console.error(`  - ${p}\n`);
    process.exit(1);
  }

  const entries = collectPublishedEntries(files, CDN_PIN);
  if (entries.length === 0) {
    console.error(
      `\nx preview source: the built previews import no ${CDN_PIN} entry. A preview with no kit import renders nothing, and a scan that matches nothing proves nothing.\n`,
    );
    process.exit(1);
  }

  const probed = await probePublished(entries, fetch);
  const missing = probed.filter((r) => !r.ok);
  if (missing.length > 0) {
    if (probeIsFatal(probed, REQUIRE_PUBLISHED)) {
      printProbeTable(probed, CDN_PIN, 'x published entries: the registry does not serve every entry the previews import.');
      console.error(
        `  Deploying this build would ship EMPTY previews: every block imports the entries above from\n` +
          `  ${CDN_PIN} and the ones marked MISS are not there. They arrive with the next @kitn.ai/ui\n` +
          `  release. Release the kit, or deploy once it is published.\n`,
      );
      process.exit(1);
    }
    printProbeTable(
      probed,
      CDN_PIN,
      'WARNING published entries: the registry does not serve every entry the previews import.',
    );
    console.error(
      `  Previews on a deploy of this build would be empty until a release ships the entries marked\n` +
        `  MISS. Not fatal here on purpose: the required gate must not be hostage to the release\n` +
        `  cadence. The deploy workflow runs this guard with --require-published, where it is fatal.\n`,
    );
  }

  console.log(
    `ok preview source: every /blocks preview pins ${CDN_PIN}, and no local kit path ships.` +
      (missing.length === 0 ? ` All ${probed.length} published entries answered 200.` : ''),
  );
}

await main();
