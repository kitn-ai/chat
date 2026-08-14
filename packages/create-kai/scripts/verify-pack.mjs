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
 *      templates therefore carry `_gitignore`, and this asserts EVERY template
 *      really has it under that name.
 *   2. `files: ["dist"]` has to actually carry the templates. A scaffold with a
 *      bundled CLI and no templates fails on the user's first run, having
 *      installed and printed nothing wrong.
 *
 * TWO CORRECTIONS, both measured against this tree rather than reasoned about,
 * because the version of this file that shipped the gate into CI was nearly
 * non-discriminating on rule 1 and neither half was visible from its output.
 *
 * THE COUNT WAS GLOBAL, SO IT ONLY FIRED ON TOTAL LOSS. `underscored.length ===
 * 0` is satisfied by any single template still having the file, so reverting
 * react's `_gitignore` to `.gitignore` printed `tarball OK — 175 files, 8
 * template(s), 7 _gitignore` and exited 0. Seven of eight is the shape a real
 * regression has — one starter edited, one copy rule changed — and total loss is
 * the shape it almost never has. The check now runs PER TEMPLATE and names the
 * offenders, because a reviewer who is told a count still has to go find out
 * which.
 *
 * AND THE LITERAL-`.gitignore` SCAN COULD NOT FIRE AT ALL. It read the packed
 * listing for a file named `.gitignore` — but npm strips the file BEFORE it
 * appears there, which is the very premise of rule 1. Measured on npm 10.9.8:
 * planting `dist/templates/react/.gitignore` takes the listing from 176 files to
 * 175 and adds nothing; nothing is renamed to `.npmignore` either, so there is
 * no packed artefact of any name to look for. That scan was unfalsifiable while
 * reading as coverage, so it is gone. What replaced it asks the same question
 * one layer earlier, where the answer is still observable: it walks `dist/` ON
 * DISK, which is where the file demonstrably is. That version is also strictly
 * stronger — it holds whatever a future npm decides to do with the file.
 *
 * Run after `npm run build`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `--package-root <dir>` points this at a throwaway tree instead of the real
 * package, which is the seam `test/verify-pack.test.ts` uses to watch each rule
 * REJECT a planted defect. Same flag, same purpose, as the guards under
 * packages/ui/scripts. Without it the rules here are only reachable by breaking
 * the real dist/, which is why they went into CI ungraded.
 */
const flagIndex = process.argv.indexOf('--package-root');
const pkgRoot =
  flagIndex === -1
    ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    : path.resolve(process.argv[flagIndex + 1]);

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

// The template set, from the packed listing UNION the directories on disk. A
// template that packed to nothing at all is absent from the listing, so deriving
// the set from the listing alone would drop it from every per-template rule
// below — the one case where "no findings" and "nothing to find" look identical.
const templatesDir = path.join(pkgRoot, 'dist/templates');
const onDisk = existsSync(templatesDir)
  ? readdirSync(templatesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];
const templateDirs = [...new Set([...templateFiles.map((f) => f.split('/')[2]), ...onDisk])].sort();

// PER TEMPLATE, and it names them. One template losing the file is the whole
// regression: that project's users get no .gitignore at all.
const withIgnore = new Set(
  templateFiles.filter((f) => path.basename(f) === '_gitignore').map((f) => f.split('/')[2]),
);
const missingIgnore = templateDirs.filter((dir) => !withIgnore.has(dir));
if (missingIgnore.length > 0) {
  problems.push(
    `no _gitignore in ${missingIgnore.length} of ${templateDirs.length} template(s) — ` +
      `${missingIgnore.join(', ')} — npm strips \`.gitignore\`, so projects emitted from ` +
      `${missingIgnore.length === 1 ? 'that template' : 'those templates'} would ignore nothing`,
  );
}

// The same defect at the layer where it is still observable: the packed listing
// cannot show a literal `.gitignore` because npm removes it on the way in, so
// this reads the built tree instead. See the correction in the docblock.
const literal = existsSync(templatesDir)
  ? readdirSync(templatesDir, { recursive: true, encoding: 'utf8' })
      .map((entry) => entry.split(path.sep).join('/'))
      .filter((entry) => path.basename(entry) === '.gitignore')
  : [];
if (literal.length > 0) {
  problems.push(
    `a literal .gitignore is in the built templates (${literal.join(', ')}) — npm strips it out of ` +
      'the tarball, so it would reach no user; templates must carry it as _gitignore',
  );
}

// Every ready framework needs a package.json in its template, or the rewrite
// throws at scaffold time rather than here.
for (const dir of templateDirs) {
  if (!files.includes(`dist/templates/${dir}/package.json`)) {
    problems.push(`template '${dir}' has no package.json in the tarball`);
  }
}

if (problems.length > 0) {
  console.error('create-kai: packed tarball is not shippable\n');
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

// "8 of 8" rather than a bare count: the old line read `8 template(s), 7
// _gitignore` on a tree that was already broken, and printing the two numbers
// apart is what made that look like a pass.
console.log(
  `create-kai: tarball OK — ${files.length} files, ` +
    `${templateDirs.length} template(s), ` +
    `${withIgnore.size} of ${templateDirs.length} with a _gitignore`,
);
