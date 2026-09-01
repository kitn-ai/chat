#!/usr/bin/env node
/**
 * Guard: the entries this package advertises as loadable RAW (a no-bundler
 * page importing the dist file straight off a CDN URL) must contain ZERO bare
 * import specifiers. A bare `import ... from "solid-js"` in one of these files
 * is invisible to every build/typecheck/bundler gate — a bundler resolves it
 * happily — and only fails in the one environment nothing in CI exercised: a
 * browser given the file's raw URL, which throws
 *
 *     Failed to resolve module specifier "solid-js"
 *
 * That is exactly how the built-in conversation stores were unreachable to CDN
 * consumers for as long as they existed (2026-08-31 composition spike, phase 2:
 * docs/superpowers/research/2026-08-31-composition-spike/phase2-cdn.md) — they
 * shipped only through dist/index.js, whose bare solid-js imports are CORRECT
 * for that entry (Solid consumers need dedupe; do not add "." here), so no
 * per-file eyeballing catches the difference. This guard pins the contract per
 * entry instead.
 *
 * THE LIST IS A CONTRACT DECLARATION, NOT A MEASUREMENT — which entries promise
 * raw-URL loadability is a policy decision (these are the ones the composition
 * story hands to no-build pages), so it is stated here rather than derived.
 * Adding an entry to the exports map does NOT enroll it; add it below when the
 * promise is made.
 *
 *   node scripts/verify-cdn-entries.mjs               # the real dist/
 *   node scripts/verify-cdn-entries.mjs --self-test   # prove it still detects
 */
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const SELF_TEST = argv.includes('--self-test');

/** The self-contained contract: dist files a no-build page may import by raw
 *  URL. Relative paths from dist/. See the header — enrollment is deliberate. */
const SELF_CONTAINED_ENTRIES = ['state.js', 'wire.js', 'stores.js'];

/** Every static/dynamic import specifier in an ES module's text. Rollup lib
 *  output keeps statics at top-level statements, so text-level extraction is
 *  reliable here; dynamic `import(...)` with a literal is matched too. */
function importSpecifiers(source) {
  const specs = [];
  const patterns = [
    /(?:^|;|\n)\s*import\s+[^'"()]*?from\s*(['"])([^'"]+)\1/g, // import x from "..."
    /(?:^|;|\n)\s*import\s*(['"])([^'"]+)\1/g, // side-effect import "..."
    /(?:^|;|\n)\s*export\s+[^'"()]*?from\s*(['"])([^'"]+)\1/g, // export ... from "..."
    /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g, // import("...")
  ];
  for (const p of patterns) {
    for (const m of source.matchAll(p)) specs.push(m[2]);
  }
  return specs;
}

const isBare = (spec) => !spec.startsWith('.') && !spec.startsWith('/') && !/^(https?:|data:)/.test(spec);

function check(distRoot) {
  const findings = [];
  let specifiersSeen = 0;
  for (const entry of SELF_CONTAINED_ENTRIES) {
    const file = join(distRoot, entry);
    if (!existsSync(file)) {
      findings.push(`dist/${entry}: MISSING — the self-contained contract names it; build is incomplete.`);
      continue;
    }
    const specs = importSpecifiers(readFileSync(file, 'utf8'));
    specifiersSeen += specs.length;
    for (const spec of specs) {
      if (isBare(spec)) {
        findings.push(
          `dist/${entry}: bare import "${spec}" — this entry promises raw CDN loadability; ` +
            `a browser given its raw URL will throw "Failed to resolve module specifier".`,
        );
      }
    }
  }
  return { findings, specifiersSeen };
}

function run(distRoot) {
  const { findings } = check(distRoot);
  if (findings.length > 0) {
    console.error('✗ verify:cdn-entries failed:');
    for (const f of findings) console.error(`    ${f}`);
    process.exit(1);
  }
  console.log(
    `✓ cdn entries: ${SELF_CONTAINED_ENTRIES.length} self-contained entries (${SELF_CONTAINED_ENTRIES.join(', ')}) carry zero bare imports.`,
  );
}

if (SELF_TEST) {
  // Plant each defect class in a throwaway dist and assert detection; then a
  // healthy tree must draw zero findings.
  const root = mkdtempSync(join(tmpdir(), 'verify-cdn-entries-'));
  const distA = join(root, 'bad');
  mkdirSync(distA);
  writeFileSync(join(distA, 'state.js'), `import { createSignal } from "solid-js";\nexport const s = 1;\n`);
  writeFileSync(join(distA, 'wire.js'), `const w = await import('solid-js/web');\nexport { w };\n`);
  // stores.js absent -> MISSING finding
  const bad = check(distA);
  const wants = ['bare import "solid-js"', `bare import "solid-js/web"`, 'MISSING'];
  for (const want of wants) {
    if (!bad.findings.some((f) => f.includes(want))) {
      console.error(`✗ self-test: planted defect not detected (expected a finding containing: ${want})`);
      console.error(bad.findings.join('\n'));
      process.exit(1);
    }
  }
  const distB = join(root, 'good');
  mkdirSync(distB);
  for (const entry of SELF_CONTAINED_ENTRIES) {
    writeFileSync(join(distB, entry), `import { helper } from './chunk.js';\nexport const ok = helper;\n`);
  }
  const good = check(distB);
  if (good.findings.length !== 0) {
    console.error(`✗ self-test: healthy tree drew findings:\n${good.findings.join('\n')}`);
    process.exit(1);
  }
  if (good.specifiersSeen === 0) {
    console.error('✗ self-test: extractor matched zero specifiers on files that contain imports — patterns rotted.');
    process.exit(1);
  }
  console.log('✓ verify:cdn-entries --self-test: detects bare imports, missing entries; clean tree passes.');
} else {
  run(resolve(argOf('--dist-root') ?? join(scriptDir, '..', 'dist')));
}
