#!/usr/bin/env node
/**
 * Verify the PUBLISHED tarball, not the working tree.
 *
 * Two of the ways this CLI can ship broken are invisible locally and only appear
 * once npm has packed it:
 *
 *   1. npm strips any file named `.gitignore` out of a tarball. A template that
 *      carried one would lose it, and every emitted project would ignore
 *      nothing — committing `node_modules/`, and eventually `.env.local`. The
 *      templates therefore carry `_gitignore`, and this asserts the packed
 *      tarball really has it under that name and no `.gitignore` anywhere.
 *   2. `files: ["dist"]` has to actually carry the templates. A scaffold with a
 *      bundled CLI and no templates fails on the user's first run, having
 *      installed and printed nothing wrong.
 *
 * Run after `npm run build`.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: pkgRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const files = JSON.parse(raw)[0].files.map((f) => f.path);

const problems = [];

if (!files.includes('dist/index.js')) {
  problems.push('dist/index.js is missing from the tarball — the bin would not resolve');
}

const templateFiles = files.filter((f) => f.startsWith('dist/templates/'));
if (templateFiles.length === 0) {
  problems.push(
    'no dist/templates/** in the tarball — `npx create-kai` would install and then find no template',
  );
}

const underscored = templateFiles.filter((f) => path.basename(f) === '_gitignore');
if (underscored.length === 0) {
  problems.push(
    'no _gitignore in any template — npm strips `.gitignore`, so emitted projects would ignore nothing',
  );
}

const literal = files.filter((f) => path.basename(f) === '.gitignore');
if (literal.length > 0) {
  problems.push(
    `a literal .gitignore survived packing (${literal.join(', ')}) — npm's stripping is version-dependent; ` +
      'templates must carry it as _gitignore',
  );
}

// Every ready framework needs a package.json in its template, or the rewrite
// throws at scaffold time rather than here.
for (const dir of new Set(templateFiles.map((f) => f.split('/')[2]))) {
  if (!files.includes(`dist/templates/${dir}/package.json`)) {
    problems.push(`template '${dir}' has no package.json in the tarball`);
  }
}

if (problems.length > 0) {
  console.error('create-kai: packed tarball is not shippable\n');
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

console.log(
  `create-kai: tarball OK — ${files.length} files, ` +
    `${new Set(templateFiles.map((f) => f.split('/')[2])).size} template(s), ` +
    `${underscored.length} _gitignore`,
);
