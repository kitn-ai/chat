#!/usr/bin/env node
/**
 * Verify the PUBLISHED tarball, not the working tree.
 *
 * Three of the ways this CLI can ship broken are invisible locally and only
 * appear once npm has packed it:
 *
 *   1. npm strips any file named `.gitignore` out of a tarball. A template that
 *      carried one would lose it, and every emitted project would ignore
 *      nothing — committing `node_modules/`, and eventually `.env.local`. The
 *      templates therefore carry `_gitignore`, and this asserts EVERY template
 *      really has it under that name.
 *   2. `files: ["dist"]` has to actually carry the templates. A scaffold with a
 *      bundled CLI and no templates fails on the user's first run, having
 *      installed and printed nothing wrong.
 *   3. Every file the bundled CLI OPENS at scaffold time has to be in there. See
 *      the rule below; this one was added after a published release proved the
 *      first two do not imply it.
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

import { loadTs } from './load-ts.mjs';

/** This package, wherever `--package-root` points the packed tree. */
const selfRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `--package-root <dir>` points this at a throwaway tree instead of the real
 * package, which is the seam `test/verify-pack.test.ts` uses to watch each rule
 * REJECT a planted defect. Same flag, same purpose, as the guards under
 * packages/ui/scripts. Without it the rules here are only reachable by breaking
 * the real dist/, which is why they went into CI ungraded.
 *
 * It swaps the TREE BEING PACKED, never the tables the rules are derived from:
 * those are read from `selfRoot` above, because "what does this CLI open" is a
 * property of this package's source and is exactly what a fixture must not be
 * able to weaken.
 */
const flagIndex = process.argv.indexOf('--package-root');
const pkgRoot = flagIndex === -1 ? selfRoot : path.resolve(process.argv[flagIndex + 1]);

/** The dotfile list both ends of the rename read; see src/template-dotfiles.ts. */
const { STRIPPED_DOTFILES, travellingName } = await loadTs(selfRoot, 'src/template-dotfiles.ts');
const { PATCHES, GATEWAY_PATCHES } = await loadTs(selfRoot, 'src/patches.ts');

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
//
// OVER THE WHOLE DOTFILE LIST, not just `.gitignore`. It was one name, and the
// second name on that list — `.npmrc` — is what shipped stripped in 0.1.0 while
// this rule looked straight past it. `STRIPPED_DOTFILES` is the same list
// `scripts/build.mjs` renames from and `generate()` renames back to, so adding a
// row there arms this without anyone remembering it exists.
const built = existsSync(templatesDir)
  ? readdirSync(templatesDir, { recursive: true, encoding: 'utf8' }).map((entry) =>
      entry.split(path.sep).join('/'),
    )
  : [];
for (const dotfile of STRIPPED_DOTFILES) {
  const literal = built.filter((entry) => path.basename(entry) === dotfile);
  if (literal.length > 0) {
    problems.push(
      `a literal ${dotfile} is in the built templates (${literal.join(', ')}) — npm strips it out ` +
        `of the tarball, so it would reach no user; templates must carry it as ` +
        `_${dotfile.slice(1)}`,
    );
  }
}

/**
 * EVERY FILE THE BUNDLED CLI OPENS AT SCAFFOLD TIME IS IN THE TARBALL.
 *
 * THE DEFECT THIS WAS WRITTEN AGAINST, because the rules above ran in required
 * CI and printed `tarball OK — 176 files, 8 template(s), 8 of 8 with a
 * _gitignore` over the package that carried it. `create-kai@0.1.0` shipped
 * `nextjs` and `tanstack-start` templates with no `.npmrc` — npm strips that
 * name too — while the bundled `dist/index.js` still had a `PATCHES` row that
 * opens one. Two of the eight advertised frameworks died on the first command a
 * user runs:
 *
 *     Scaffolding failed
 *     ENOENT: no such file or directory, open '.../myapp/.npmrc'
 *
 * NOTHING IN THE UNIT SUITE COULD HAVE SEEN IT, which is why the rule belongs
 * here and not there. `test/generate.test.ts` asserts the emitted `.npmrc`
 * carries no monorepo path — it reads `dist/templates` on disk, where the file
 * demonstrably is. The tarball is the only layer where the file is absent.
 *
 * DERIVED FROM THE PATCH TABLES, never a list. A hand-written list of files to
 * check would have exactly the hole that produced this: it would say
 * `_gitignore` and `package.json`, because those are the files someone thought
 * of. `PATCHES` and `GATEWAY_PATCHES` are what `generate()` actually opens, so a
 * new patch row arms this rule for its file on the same commit that adds it.
 *
 * WHAT IT DOES NOT COVER, stated rather than implied: `paths.app`, which
 * `generate()` also reads, and the route destinations it writes. Those are in
 * `src/frameworks.ts` and carry ordinary names npm has no opinion about; the
 * literal-dotfile rule above is what stands between them and this failure mode.
 */
const patchedFiles = (dir) =>
  new Set([...(PATCHES[dir] ?? []), ...(GATEWAY_PATCHES[dir] ?? [])].map((patch) => patch.file));

/**
 * The name a patched file is PACKED under, which is not always the name the
 * patch opens.
 *
 * A patch row names `.npmrc` because that is what exists at scaffold time —
 * `generate()` renames it back before applying any patch. Inside the tarball the
 * same file is `_npmrc`. Comparing the patch's own name against the packed
 * listing therefore reports every travelling dotfile as missing, which is what
 * the first run of this rule did: it went red on a tree that was already fixed.
 * The mapping is the same `travellingName` both ends of the rename use, so the
 * two cannot disagree.
 */
const packedName = (file) => {
  const base = path.posix.basename(file);
  if (!STRIPPED_DOTFILES.includes(base)) return file;
  const dir = path.posix.dirname(file);
  return dir === '.' ? travellingName(base) : `${dir}/${travellingName(base)}`;
};

for (const dir of templateDirs) {
  const missing = [...patchedFiles(dir)]
    .filter((file) => !files.includes(`dist/templates/${dir}/${packedName(file)}`))
    .sort();
  if (missing.length > 0) {
    problems.push(
      `template '${dir}' is missing ${missing.map((f) => `'${f}'`).join(', ')} from the tarball, ` +
        'but the bundled CLI patches ' +
        `${missing.length === 1 ? 'that file' : 'those files'} at scaffold time — ` +
        `every scaffold from the '${dir}' template would fail with ENOENT on the user's first run`,
    );
  }
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
