// Every authored claim in the catalog must resolve against the derived layer
// and the tree, or the build fails. This is the structural answer to how the
// roster died: hand-written prose about a tree that kept moving.
//
// WHAT IT DOES NOT CATCH — every item below was MEASURED by mutating the real
// catalog and watching this lint stay green, not reasoned about. Read it before
// trusting a green run to mean more than it does. The shape they share: this
// lint resolves NAMES, and a name resolving says nothing about whether the
// claim attached to it is true.
//
//  1. AN OVERSTATED `enforcedBy`. This lint resolves that a cited path EXISTS.
//     It can never judge whether the citation is PROPORTIONATE to what the
//     cited thing actually does — whether that test covers the whole statement
//     or one clause of it. This is not hypothetical: four of the seven seed
//     invariants overstated their own enforcement on first authoring, and every
//     one was caught by human review, none by any check. Measured twice here.
//     Repoint `reactivity-two-halves` at scenarios.test.ts — a real file that
//     tests something else entirely — and this lint passes. Upgrade
//     `kit-parses-consumer-fetches` from `status: 'partial'` to `'enforced'`
//     while its `enforcedBy` covers only half the statement, and this lint
//     passes. `status: 'partial'` exists to record the honest version and
//     nothing mechanical can verify it was chosen; only a reader can.
//  2. SEMANTICALLY WRONG BUT RESOLVABLE WIRING. An edge naming a real event on
//     a real element and a real property on another real element passes here
//     even when the pair is nonsense. Measured: rewiring `kai-new-chat` onto
//     `kai-chat.placeholder` resolves clean. Only the executed probes in
//     surfaces.test.ts (which drive every edge against the registered elements
//     in jsdom) catch that, and only for edges someone wrote a probe for.
//  3. A VARIANT DROPPED FROM ONE part-consumption record while ANOTHER record
//     still lists it. The union-coverage check unions across all records, so it
//     answers "does some record account for this variant", never "does THIS
//     element still claim it". Measured: deleting 'file' from `kai-chat`'s
//     `consumes` passes green, because `kai-message` also lists it; deleting it
//     from both fires, and so does adding a variant to `derived.partVariants`.
//     That is the check working as specified — the union gaining a variant is
//     what it is for — but do not read a green as per-element coverage. Which
//     elements a variant is claimed by is an EDITORIAL claim nothing in the tree
//     derives (see the registered-copy note in surfaces.ts), so it is measured
//     by the acceptance deck, not here, and an assertion that merely looked like
//     it covered that would be worse than the honest gap.
//  4. AN INVENTORY ROW POINTING AT THE WRONG REAL STORY. Titles resolve as a
//     SET. Measured: swap the `Menu` and `Settings` rows' titles so each row's
//     `note` now describes the other, and the run is clean. Set membership is
//     all the tree affords — nothing derives which note belongs to which title.
//  5. EDITORIAL FIELDS WITH NO DERIVATION BEHIND THEM: `sort`, `archetypes`,
//     `intent`, `note`. Measured: flipping `workspace-chat` from `full-screen`
//     to `inline`, and replacing its `intent` with prose describing a different
//     product entirely, both pass. surfaces.test.ts pins `sort` for the app rows
//     and the four fixture rows; every other editorial field is reviewed prose.
//  6. A WRONG `derived.json`. This lint trusts it as the tree's reading, and
//     will happily resolve authored claims against a fiction. Measured: add a
//     fabricated `kai-datagrid` element to derived.json, then list it as a
//     recipe ingredient, and the run is clean — the very fabrication the
//     ingredient check exists to stop, waved through because the fiction was
//     planted upstream. derived.json's fidelity is Task 3's generator and
//     `verify:generated-sync`; this lint is downstream of both and cannot
//     substitute for either.
//  7. A RECIPE THAT NOBODY CAN BUILD FROM. Every field can resolve while the
//     recipe as a whole is unbuildable; that is what the acceptance deck (S1-S7)
//     measures, and it is why the deck was written before the catalog.
//  8. THE TREE -> ROW DIRECTION, for everything except the nine Labs/Apps files.
//     By design, but know the shape of it. Measured, all green: adding a new
//     `Labs/Brand New Thing` story with no inventory row passes; DELETING a
//     tier-3 row passes; and the inventory can shrink from 26 rows to one and
//     still pass, because the anti-vacuity floors are `length === 0` and a
//     single survivor satisfies them. Only `surfaces.test.ts` test 2 requires a
//     row to exist, and only for the Apps files.
//  9. A GROUP ROW OUTLIVING ALMOST ALL OF ITS STORIES. `Foundations` resolves
//     through a SYNTHESIZED group name: any `Labs/Foundations/<x>` title
//     registers the bare `Foundations`. Measured: deleting all twelve
//     Foundations stories does fire, but deleting ELEVEN of the twelve is
//     green. The row proves the group exists, never that it still holds what
//     its `note` lists.
// 10. DUPLICATE INVENTORY TITLES, including contradictory ones. Measured: a
//     second `Menu` row sorted `corpus` beside the real one sorted `ingredient`
//     passes, reporting 27 rows clean. Titles are resolved as set membership,
//     so a duplicate resolves exactly as well as the original.
// 11. THE GAP COUNT SILENTLY GOING TO ZERO. Gaps are reported, never asserted.
//     Measured: giving all three `kind:'none'` invariants a real `lint:` script
//     takes the run from 3 gaps to 0 and stays green — correct if the guards
//     were truly written, and indistinguishable from someone deleting the
//     honest record of what is unenforced. The `status`/`kind` agreement that
//     would catch the dishonest version lives in invariants.test.ts.
// 12. RESIDUAL AFTER THE PARSER FIX: an INTERPOLATED title is invisible.
//     `title: 'Labs/X'`, `"Labs/X"` and `` `Labs/X` `` are all read; a
//     substituted template `` title: `Labs/${name}` `` yields nothing —
//     measured, returns []. A story titled that way would look unregistered and
//     its inventory row would fail, which is the loud direction, but the row
//     could not be made to pass without rewriting the story.
//
//     ⚠ THIS ITEM PREVIOUSLY SAID SOMETHING FALSE, and how it was false is the
//     more useful record. It claimed the hand-rolled comment stripper's errors
//     "blank MORE than intended, which fails loudly" and that it "cannot invent
//     a title". Both halves were wrong. JSX text containing an unbalanced
//     apostrophe (`Don't have an account?`) put the scanner into single-quote
//     state and it never left, so every later comment SURVIVED stripping: it
//     blanked LESS than intended, and it DID invent a title. Live in three
//     files at the time. The caveat was reasoned, not measured — which is the
//     same defect as an overstated `enforcedBy` (item 1), committed in the
//     block that exists to prevent it.
// 13. RESIDUAL AFTER THE PATH FIX: `isFile` proves a cited path is a file, not
//     that the file contains a test, still less a test of THIS invariant — see
//     item 1, which is the same limit in its most consequential form.
// 14. A CI STEP NEUTERED INSIDE THE `run:` LINE. The guard-wiring test rejects
//     `continue-on-error` and a false `if:`, but appending `|| true` to the
//     shell command leaves it GREEN — measured, 13 passed. The step still runs
//     and its failure is still discarded. This is a class the repo's other
//     wiring guards share, not specific to this one, and it wants a single
//     workflow-wide check rather than a fourth copy of the same assertion here.
// 15. A BUG BOTH COPIES SHARE — CURRENT STATE, not history. The equivalence
//     guard on `readLabsTitles` catches DIVERGENCE between the .mjs and .ts
//     implementations and is structurally blind to a mistake they agree on. It
//     has now been green through TWO real defects that were present in both
//     copies at once: the hand-rolled stripper's apostrophe bug, and the
//     any-position `title:` read that let `{ args: { title: 'Labs/Apps' } }`
//     conjure a phantom app. Every limitation from item 16 down is likewise
//     shared by both copies and invisible to that guard. It is the backstop
//     against drift, never the reason to trust either side.
// 16. A STORY FILE THAT DOES NOT PARSE NEVER THROWS. `ts.createSourceFile`
//     error-recovers and this lint discards `parseDiagnostics` entirely.
//     Measured: a badly broken file returns `[]`, and a file broken AFTER the
//     meta returns the title anyway. A file whose meta stops parsing therefore
//     looks like a file with no registration — silently. The only backstop is
//     the `zero Labs titles` floor, which needs EVERY file to go dark before it
//     fires, so one corrupted story is invisible HERE. What actually contains it
//     is `typecheck`: a story file that does not parse fails tsc at exit 2 in
//     the required CI job, so a corrupted story cannot reach main while this
//     lint stays quiet about it. Reading `parseDiagnostics` would make the lint
//     self-sufficient and is deliberately not done — adjudicated as
//     gold-plating over a backstop that already exists.
// 17. HISTORICAL, fixed: `.stories.ts` used to be parsed as TSX. `ScriptKind`
//     is now chosen by extension, so this is recorded rather than live. What it
//     was: every file was parsed as TSX regardless of extension, and TSX admits
//     neither an angle-bracket cast nor a bare generic arrow. Measured on a
//     `.stories.ts` fixture, both `const n = <number>x;` AND `const f =
//     <T>(x: T) => x;` above the meta swallowed the title (`[]`), while the TSX
//     workarounds `<T,>` and `<T extends unknown>` parsed fine — which is the
//     wrong way round for safety, because the workarounds are what people learn
//     AFTER being bitten and the bare generic is what they write first. It was
//     fixed rather than documented because `typecheck` does NOT contain it: tsc
//     reads a `.ts` as TS, accepts both spellings and stays green, so the lint
//     would have silently dropped a registration from a file CI called fine.
//     No `.stories.ts` exists today; `storyExtensions()` admits them because the
//     Storybook glob does, so nothing had to be decided for it to go live.
// 18. `readWireExports` HAS BOTH FAILURE DIRECTIONS, and it is the one function
//     here rewritten without being documented until now. Measured:
//     `export * from './x'` yields `[]` and `export const r = makeReader()`
//     yields `[]` — both FALSE REDs, a real exported reader reported missing
//     (loud, and wrong). `export namespace N { export function r(){} }` yields
//     `['r']` — a FALSE ACCEPT, since `r` is not importable at the module's top
//     level. The wire module uses none of these shapes today.
//
// DELIBERATELY NOT ASSERTED HERE: whether a wiring pair means anything (item 2).
// This lint resolves names and genuinely cannot judge semantics; the executed
// probes in surfaces.test.ts drive every edge against the real elements, and
// its `every wiring edge in every recipe has been driven above` completeness
// test is what stops an edge being added without one. An assertion here would
// look like coverage and add none.
//
// ★ THE ONE TO STATE PLAINLY: THIS LINT'S GROUND TRUTH IS `derived.json`. It
// resolves authored claims against that file, not against the tree the file
// describes. A wrong derived layer therefore yields a confidently green lint
// (item 6). What actually covers the authored layer is the COMPOSITION of
// `verify:generated` — which keeps derived.json faithful to the tree — and this
// lint, which keeps the prose faithful to derived.json. NEITHER ALONE IS
// SUFFICIENT, and a green from this script has never meant more than one half.
//
// What it DOES catch incidentally, worth knowing: a catalog file that no longer
// parses fails the esbuild step loudly rather than being skipped, because the
// authored records are loaded through their VALIDATED accessors — so a record
// violating its own zod schema is a hard failure here too, not a silent pass.
// That is also why the schema's own `.min(1)` on `wiring` fires BEFORE this
// script's readable "zero wiring edges" message on the real catalog; the
// message is reachable when check() is driven directly, as the self-test does.
import { existsSync, readFileSync, readdirSync, mkdtempSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
// esbuild is imported LAZILY, inside loadAuthored(). It refuses to initialize
// under jsdom ("new TextEncoder().encode('') instanceof Uint8Array is
// incorrectly false") and tests/scripts/catalog-drift-guard-wiring.test.ts
// imports `check` from this file to drive the analyzer directly. A top-level
// import takes that whole suite down at import time, before a single
// assertion runs. Nothing on the --self-test path needs esbuild either.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(ROOT, '..', '..');
const WIRE_READ = 'packages/ui/src/wire/read.ts';
const SELF_TEST = process.argv.includes('--self-test');

async function loadAuthored(catalogDir) {
  const esbuild = await import('esbuild');
  const tmp = mkdtempSync(join(tmpdir(), 'catalog-drift-'));
  // The VALIDATED accessors, not the raw literals: a record that violates its
  // own zod schema must fail here rather than sail through on structural checks.
  const entrySrc = [
    `export { listInvariants } from '${join(catalogDir, 'invariants.ts')}';`,
    `export { listSurfaceRecipes, listInventory, listPartConsumption } from '${join(catalogDir, 'surfaces.ts')}';`,
    `export { listScenarios } from '${join(catalogDir, 'scenarios.ts')}';`,
  ].join('\n');
  // try/finally so the temp dir is removed on the esbuild-FAILURE path too. A
  // catalog file that stops parsing is a normal outcome for this lint (it is
  // how a schema-invalid record surfaces), so the throwing path is not exotic
  // and was leaking a directory per failed run.
  try {
    const entry = join(tmp, 'entry.ts');
    writeFileSync(entry, entrySrc);
    const bundle = join(tmp, 'bundle.mjs');
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: bundle,
      logLevel: 'error',
      absWorkingDir: REPO,
    });
    return await import(pathToFileURL(bundle).href);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * The `Labs/…` title a story file REGISTERS: the `title` property of its
 * default-exported meta object, parsed rather than matched.
 *
 * ★ Four versions of this were defeated before this spelling. A raw regex
 * counted PROSE as a registration. A hand-rolled comment stripper replaced that
 * with a worse bug (JSX `Don't` left it stuck in string state, so later comments
 * survived) — live in three story files, and the equivalence guard between the
 * two copies could not see it because both carried it. And parsing every
 * `title:` in the file was still too broad: a `title` nested in a story's `args`
 * is not a registration, and `{ args: { title: 'Labs/Apps' } }` in a non-app
 * story conjured a phantom app that satisfied this lint and surfaces.test.ts
 * together, with no comment involved.
 *
 * Comments are TRIVIA and never nodes; apostrophes are the real lexer's problem;
 * a title that is not the meta's is not a registration. Same parser idiom
 * lint-silent-drops.mjs uses to read the MessagePart union.
 *
 * REGISTERED COPY of src/agent-tooling/catalog/labs-titles.ts — a .mjs cannot
 * import a .ts at runtime. The guard-wiring test asserts the two agree, which
 * catches drift and is blind to a bug they share.
 */
export function readLabsTitles(text, fileName = 'story.tsx') {
  // ScriptKind BY EXTENSION. Parsing a `.stories.ts` as TSX loses every title
  // after a `<number>x` cast or a bare `<T>(x) => x` generic arrow, because
  // neither is valid TSX. tsc parses that file as TS, accepts it and stays
  // green, so typecheck does NOT contain this one — the lint would silently
  // drop the registration on a file CI calls fine. storyExtensions() already
  // admits `.ts` because the Storybook glob does.
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, kind);
  const meta = metaObject(source);
  if (!meta) return [];
  const titles = [];
  for (const prop of meta.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
    if (key !== 'title') continue;
    const init = prop.initializer;
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
      if (init.text.startsWith('Labs/')) titles.push(init.text);
    }
  }
  return titles;
}

/**
 * The story file's DEFAULT-EXPORTED meta object, or null.
 *
 * Walking every `title:` in the file was the narrower defect: a `title` nested
 * in a story's `args` is not a registration, and Storybook never reads it as
 * one. Measured before this existed, both exit 0:
 *   export const GhostProbeStory = { args: { title: 'Labs/GHOSTPROBE' } };
 * made an invented inventory row resolve, and the `Labs/Apps` spelling of the
 * same shape produced a PHANTOM app that satisfied the lint and
 * surfaces.test.ts together — the exact both-sides-green shape this whole guard
 * exists to prevent, reached without a single comment.
 *
 * Handles the two shapes in the tree and their wrappers:
 *   `const meta = {…} satisfies Meta; export default meta;`  and
 *   `export default {…} as Meta;`
 * `satisfies`, `as` and parentheses are unwrapped. An angle-bracket assertion
 * (`export default <Meta>{…}`) deliberately is NOT: every story file is parsed
 * as TSX, where `<Meta>{…}` is JSX and never a type assertion, so a branch for
 * it would be dead code. Measured: that spelling returns []. It is also not a
 * spelling any story in the tree uses.
 */
function metaObject(source) {
  const unwrap = (expr) => {
    let cur = expr;
    while (
      cur &&
      (ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isParenthesizedExpression(cur))
    ) {
      cur = cur.expression;
    }
    return cur;
  };
  const topLevel = new Map();
  let defaultExport;
  for (const stmt of source.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) topLevel.set(d.name.text, d.initializer);
      }
    } else if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      defaultExport = stmt.expression;
    }
  }
  let expr = unwrap(defaultExport);
  if (expr && ts.isIdentifier(expr)) expr = unwrap(topLevel.get(expr.text));
  return expr && ts.isObjectLiteralExpression(expr) ? expr : null;
}

/**
 * The names `src/wire/read.ts` actually EXPORTS as something callable.
 *
 * Parsed rather than regexed, which closes two holes at once: a reader named
 * only in a comment is trivia and never appears, and `export const NAME = async
 * (…) => {}` is recognised as an export — the previous
 * `export [async] function NAME(` regex called that a MISSING reader, a false
 * RED that would have fired the day anyone converted a declaration to a const.
 */
export function readWireExports(text, fileName = 'read.ts') {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const names = new Set();
  const isExported = (node) => node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && isExported(node) && node.name) names.add(node.name.text);
    if (ts.isVariableStatement(node) && isExported(node)) {
      for (const d of node.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) names.add(d.name.text);
      }
    }
    // `export { readModelStream }` — a re-export is still an export.
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) names.add(el.name.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return [...names];
}

/**
 * Pure so the self-test can drive it with fixtures — including `wireSource`,
 * which is passed in rather than read here. An earlier draft read
 * src/wire/read.ts inside this function; that made the reader check
 * undriveable in its FAILING direction, so it could only ever have been
 * confirmed in the direction that passes. Returns { errors, gaps }.
 */
export function check({
  derived,
  invariants,
  surfaceRecipes,
  inventory,
  scenarios,
  partConsumption,
  labsTitles,
  // `isFile`, NOT `existsSync`. A bare existence test accepts a DIRECTORY, so
  // `packages/ui/src` resolved happily as an invariant's "test path" and a
  // recipe's "corpus". Cited evidence has to be a file you can open.
  isFile,
  npmScripts,
  // PARSED export names, not raw source. Parsing happens in the caller so this
  // stays pure and free of the compiler API — the guard-wiring test imports it
  // and drives it under jsdom. readWireExports() has its own self-test cases.
  wireExports,
}) {
  const errors = [];
  const gaps = [];
  const tags = new Map(derived.elements.map((e) => [e.tag, e]));
  const invariantIds = new Set(invariants.map((i) => i.id));

  // Anti-vacuity: this lint exists to check records the design requires. Every
  // check below is a for-loop over one of these, so an empty input turns the
  // whole run into a green that proves nothing.
  if (surfaceRecipes.length === 0) errors.push('zero surface recipes: nothing to check is a failure, not a pass.');
  if (invariants.length === 0) errors.push('zero invariants: nothing to check is a failure, not a pass.');
  if (inventory.length === 0) errors.push('zero inventory entries.');
  if (scenarios.length === 0) errors.push('zero scenarios.');
  if (partConsumption.length === 0) errors.push('zero part-consumption records: the registered copy is empty.');
  if (derived.elements.length === 0) errors.push('zero derived elements: derived.json is empty or unreadable.');
  if (derived.partVariants.length === 0) errors.push('zero derived MessagePart variants.');
  if (labsTitles.length === 0) errors.push('zero Labs titles derived from the tree: the deriver is broken.');

  // The inventory is authored prose about the tree, which is the exact thing
  // that rotted the roster. Every title must name something that exists.
  //
  // This is the ROW -> TREE direction, and before this lint NO row had it:
  // measured on this branch, an invented `surface` row naming no story passed,
  // renaming a story out from under its row passed, and renaming a tier-3 row
  // passed. The opposite direction (every `Labs/Apps` story FILE has a row) is
  // surfaces.test.ts test 2 and is deliberately not rebuilt here.
  //
  // WHAT IS GENUINELY NEW HERE vs what already existed, because overstating it
  // would be the same defect this lint is built to catch. ALREADY COVERED
  // before this script: invariants.test.ts already resolved every `enforcedBy`
  // path and lint script and already pinned `status:'open'` <-> `kind:'none'`
  // in both directions; surfaces.test.ts already covered BOTH directions of
  // part-consumption name agreement with the union. This script adds: the
  // inventory ROW -> TREE resolution (all tiers), recipe corpus paths, wiring
  // event/property/ingredient resolution, recipe -> invariant ids, scenario
  // `invariant:` refs, wire-reader resolution, the part-consumption unknown-TAG
  // check, and — after review — file-vs-directory and guard-vs-any-script
  // tightening on the pointers invariants.test.ts merely proved to exist.
  for (const entry of inventory) {
    if (!labsTitles.includes(entry.title)) {
      errors.push(`inventory: "${entry.title}" matches no Labs story title or Labs/Apps story file in the tree.`);
    }
  }

  // The registered copy (spec §3): every union variant accounted for.
  const consumed = new Set(partConsumption.flatMap((p) => p.consumes));
  for (const variant of derived.partVariants) {
    if (!consumed.has(variant))
      errors.push(
        `part-consumption: MessagePart variant '${variant}' is covered by no record. The union gained a variant; update the records.`,
      );
  }
  for (const p of partConsumption) {
    if (!tags.has(p.tag)) errors.push(`part-consumption: ${p.tag} is not a derived element.`);
    for (const v of p.consumes) {
      if (!derived.partVariants.includes(v))
        errors.push(`part-consumption: ${p.tag} claims variant '${v}', which is not in the union.`);
    }
  }

  const wireModulePresent = isFile(WIRE_READ);
  if (!wireModulePresent) errors.push(`wire module ${WIRE_READ} is missing; no recipe's reader can be resolved.`);

  for (const r of surfaceRecipes) {
    const ingredients = new Set(r.ingredients);
    for (const tag of r.ingredients) {
      if (!tags.has(tag)) errors.push(`recipe ${r.id}: ingredient ${tag} is not a derived element.`);
    }
    for (const w of r.wiring) {
      const from = tags.get(w.from);
      const to = tags.get(w.to);
      if (!from) errors.push(`recipe ${r.id}: wiring 'from' ${w.from} is not a derived element.`);
      else if (!from.events.includes(w.event)) errors.push(`recipe ${r.id}: ${w.from} does not dispatch ${w.event}.`);
      if (!to) errors.push(`recipe ${r.id}: wiring 'to' ${w.to} is not a derived element.`);
      else if (!to.props.some((p) => p.name === w.property))
        errors.push(`recipe ${r.id}: ${w.to} has no property ${w.property}.`);
      // Internal coherence: an edge may only join elements the recipe lists, or
      // the ingredient list is not the recipe's parts list and a consumer
      // following it is short an element.
      for (const [side, tag] of [
        ['from', w.from],
        ['to', w.to],
      ]) {
        if (!ingredients.has(tag))
          errors.push(`recipe ${r.id}: wiring '${side}' ${tag} is not in the recipe's own ingredients.`);
      }
    }
    for (const id of r.invariants) {
      if (!invariantIds.has(id)) errors.push(`recipe ${r.id}: invariant ${id} does not exist.`);
    }
    // `wiring` carries the whole host-coordinates claim, so an empty array is a
    // recipe that says nothing about how its parts connect. The schema now also
    // requires .min(1); this is the readable failure rather than a ZodError.
    if (r.wiring.length === 0) {
      errors.push(`recipe ${r.id}: zero wiring edges. A recipe with no wiring makes no host-coordinates claim at all.`);
    }
    for (const path of r.corpus) {
      if (!isFile(path)) errors.push(`recipe ${r.id}: corpus path ${path} is not a file in the tree.`);
    }
    // EXPORTED, and not merely mentioned. The recipe's whole backend claim
    // rests on this name being importable by the consumer it is written for.
    if (wireModulePresent && !wireExports.includes(r.backend.reader)) {
      errors.push(`recipe ${r.id}: wire reader ${r.backend.reader} is not an exported function in ${WIRE_READ}.`);
    }
  }

  for (const inv of invariants) {
    const e = inv.enforcedBy;
    if (e.kind === 'test')
      for (const p of e.paths) {
        if (!isFile(p)) errors.push(`invariant ${inv.id}: test ${p} is not a file in the tree.`);
      }
    if (e.kind === 'structural' && !isFile(e.path))
      errors.push(`invariant ${inv.id}: structural site ${e.path} is not a file in the tree.`);
    if (e.kind === 'lint') {
      // Existence is not enough. `Object.keys(pkg.scripts)` is every script in
      // the package, so `dev`, `build` and `test` all resolved as "the lint that
      // enforces this invariant". A guard-shaped script is one in the `lint:` or
      // `verify:` namespace — the two this repo uses for checks.
      if (!npmScripts.includes(e.script)) errors.push(`invariant ${inv.id}: no npm script ${e.script}.`);
      else if (!/^(lint|verify):/.test(e.script))
        errors.push(
          `invariant ${inv.id}: npm script '${e.script}' is not a guard (expected a lint: or verify: script).`,
        );
    }
    // A GAP, never an error: `kind: 'none'` is the honest record of something
    // nothing enforces, and failing on it would push authors to invent a path.
    if (e.kind === 'none') gaps.push(`invariant ${inv.id}: enforced by nothing${e.until ? ` (until ${e.until})` : ''}.`);
    // `partial` IS A GAP TOO, and leaving it out made this line -- the loudest
    // statement of coverage anywhere, because it prints in required CI -- report
    // 3 gaps while 5 of 7 invariants were not fully enforced. `component_reference`
    // had exactly this compression and it was fixed there; the louder voice kept
    // it. A partial record's statement says WHICH half is uncovered, so the gap
    // points at the statement rather than restating it here.
    else if (inv.status === 'partial')
      gaps.push(
        `invariant ${inv.id}: PARTIAL — ${e.kind === 'test' ? e.paths.join(', ') : e.kind === 'lint' ? e.script : e.path} covers part of it; the statement says which half is uncovered.`,
      );
    if (inv.appliesTo.tags)
      for (const t of inv.appliesTo.tags) {
        if (!tags.has(t)) errors.push(`invariant ${inv.id}: appliesTo tag ${t} is not a derived element.`);
      }
    // No seed invariant sets `appliesTo.parts`, so on the real catalog this
    // branch cannot fire and is a check that proves nothing. It is driven by
    // fixture in the self-test (both directions) rather than left unexercised.
    if (inv.appliesTo.parts)
      for (const p of inv.appliesTo.parts) {
        if (!derived.partVariants.includes(p))
          errors.push(`invariant ${inv.id}: part variant ${p} is not in the union.`);
      }
  }

  // The acceptance deck names invariants by id in its `needs`. Those are
  // authored cross-references like any other and rot the same way.
  //
  // EVERY `needs` entry must match a KNOWN form. The previous version only
  // recognised `invariant:` and near-misses of it (`/^invariants?\s*[:=]/`),
  // which left a hole exactly the shape of the one it was written to close: an
  // abbreviated `'inv:reactivity-two-halves'` matched neither branch and was
  // skipped in silence, so N-1 of N refs could go dark with the run still at
  // exit 0. Recognising a closed set and failing on anything else is the only
  // version that cannot be walked around by inventing a new spelling.
  //
  // WHAT IS ACTUALLY REFUSED, stated precisely because the previous version of
  // this comment overstated it. It claimed to refuse "a known prefix misspelled,
  // OR a prefix nobody has registered". The second half is FALSE: an entry is
  // only ever examined if its leading word appears in STRUCTURED_STEM below, so
  // an unregistered prefix built from a different word — `recipe:`, `element:`,
  // `scenario:` — is silently skipped exactly like prose. The real rule is:
  //
  //   refused  = leading word IS a known stem, AND (a separator follows, OR the
  //              remainder is an exact invariant id), AND it is not an exact
  //              registered prefix
  //   admitted = everything else, including prose and unrecognised prefixes
  //              whose first word is not a stem
  //
  // FREE PROSE IS A LEGITIMATE FORM — 'composition validity', 'wiring topology'
  // — which is why `the honesty bound: refuse what is not composable…` passes.
  // Widening the stem list is how a new structured prefix gets covered; nothing
  // here detects one nobody thought to add. The zero-refs floor is the second
  // backstop (the lint:cdn-pins rule: a scan matching nothing means the scanner
  // broke, not that the tree is clean).
  const INVARIANT_REF = 'invariant:';
  // Registered structured prefixes. Adding one here is deliberate; that is the point.
  const KNOWN_PREFIXES = ['invariant:', 'backend:', 'delivery target:'];
  // Leading words that mean the entry is REACHING for a structured form. Two
  // discriminators, because either alone gets it wrong:
  //   - a SEPARATOR after the stem (`inv:`, `invariants =`) is structured;
  //   - a stem followed by an exact invariant ID (`invariant reactivity-two-halves`)
  //     is structured even with no separator.
  // A bare stem followed by prose is PROSE. That distinction is load-bearing:
  // requiring only the stem flagged S7's legitimate `'invariant diagnosis
  // fields'`, and requiring only the separator would miss the space-spelled form.
  const STRUCTURED_STEM = /^(inv|invariant|invariants|backend|backends|delivery target|deliverytarget|target|targets)(\s*[:=]\s*|\s+)(.*)$/i;
  let invariantRefs = 0;
  for (const s of scenarios) {
    for (const need of s.needs ?? []) {
      const known = KNOWN_PREFIXES.find((p) => need.startsWith(p));
      if (known === INVARIANT_REF) {
        invariantRefs += 1;
        const id = need.slice(INVARIANT_REF.length);
        if (!invariantIds.has(id)) errors.push(`scenario ${s.id}: needs invariant '${id}', which does not exist.`);
        continue;
      }
      if (known) continue;
      const stem = STRUCTURED_STEM.exec(need);
      if (stem) {
        const separated = /[:=]/.test(stem[2]);
        const remainderIsId = invariantIds.has(stem[3].trim());
        if (separated || remainderIsId) {
          errors.push(
            `scenario ${s.id}: need '${need}' begins like a structured reference but matches no known prefix (${KNOWN_PREFIXES.join(', ')}), so it would be skipped silently. Use an exact prefix or reword it as prose.`,
          );
        }
      }
    }
  }
  if (scenarios.length > 0 && invariantRefs === 0) {
    errors.push(
      `no scenario carries an '${INVARIANT_REF}<id>' need. Either the deck stopped cross-referencing invariants, or this prefix no longer matches it — both mean the check is resolving nothing.`,
    );
  }

  return { errors, gaps };
}

/**
 * The names an inventory title is allowed to have, DERIVED: every `title: 'Labs/X'`
 * suffix in the story files, plus the basename of every Labs/Apps story file
 * (the nine apps share one title and are distinguished by file).
 *
 * Walks ALL of src/, not src/elements/: `Labs/Settings` lives in src/ui/ and
 * `Labs/Audio Visualizers` under src/components/, so a scan scoped to
 * src/elements/ false-fails on both. Measured, not assumed.
 */
function deriveLabsTitles() {
  const exts = storyExtensions();
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const ext = exts.find((e) => entry.name.endsWith(`.stories.${e}`));
      if (!ext) continue;
      // PARSED. Prose about a title is not a registration; comments are trivia.
      const titles = readLabsTitles(readFileSync(full, 'utf8'), entry.name);
      for (const title of titles) {
        const suffix = title.slice('Labs/'.length);
        names.add(suffix);
        // 'Foundations/Input' also registers the group 'Foundations'.
        if (suffix.includes('/')) names.add(suffix.split('/')[0]);
      }
      if (titles.includes('Labs/Apps')) names.add(entry.name.replace(`.stories.${ext}`, ''));
    }
  };
  walk(join(ROOT, 'src'));
  return [...names];
}

/**
 * The story file extensions Storybook itself indexes, READ FROM `.storybook/main.ts`
 * rather than hand-typed here. The deriver used to glob `.stories.tsx` while
 * Storybook globs `*.stories.@(ts|tsx)`; nothing has a `.stories.ts` today so it
 * was harmless, which is exactly how a copy survives long enough to matter.
 *
 * A `stories:` array this cannot parse is a HARD FAILURE, not a fallback to a
 * guessed default: a silent fallback here would quietly re-narrow what the
 * inventory is checked against, which is the whole defect class.
 */
function storyExtensions() {
  const text = readFileSync(join(ROOT, '.storybook/main.ts'), 'utf8');
  const source = ts.createSourceFile('main.ts', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const globs = [];
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'stories' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const el of node.initializer.elements) {
        if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) globs.push(el.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  if (globs.length === 0) throw new Error('lint-catalog-drift: no `stories:` array found in .storybook/main.ts');
  const exts = new Set();
  for (const g of globs) {
    for (const m of g.matchAll(/\*\.stories\.(?:@\(([^)]*)\)|(\w+))/g)) {
      for (const e of (m[1] ?? m[2]).split('|')) exts.add(e.trim());
    }
  }
  if (exts.size === 0) {
    throw new Error(`lint-catalog-drift: could not read story extensions from .storybook/main.ts: ${globs.join(', ')}`);
  }
  return [...exts];
}

async function main() {
  const catalogDir = join(ROOT, 'src/agent-tooling/catalog');
  const derived = JSON.parse(readFileSync(join(catalogDir, 'derived.json'), 'utf8'));
  const authored = await loadAuthored(catalogDir);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const surfaceRecipes = authored.listSurfaceRecipes();
  const invariants = authored.listInvariants();
  const inventory = authored.listInventory();
  const { errors, gaps } = check({
    derived,
    invariants,
    surfaceRecipes,
    inventory,
    scenarios: authored.listScenarios(),
    partConsumption: authored.listPartConsumption(),
    labsTitles: deriveLabsTitles(),
    isFile: (p) => {
      const full = join(REPO, p);
      return existsSync(full) && statSync(full).isFile();
    },
    npmScripts: Object.keys(pkg.scripts),
    wireExports: existsSync(join(REPO, WIRE_READ))
      ? readWireExports(readFileSync(join(REPO, WIRE_READ), 'utf8'), 'read.ts')
      : [],
  });
  for (const g of gaps) console.log(`⚠ coverage gap: ${g}`);
  if (errors.length) {
    for (const e of errors) console.error(`✗ lint-catalog-drift: ${e}`);
    process.exit(1);
  }
  console.log(
    `lint-catalog-drift: ${surfaceRecipes.length} recipes, ${invariants.length} invariants, ${inventory.length} inventory rows resolved clean (${gaps.length} reported gaps).`,
  );
}

function selfTest() {
  const derived = {
    elements: [
      { tag: 'kai-a', props: [{ name: 'items', scalar: false, optional: true, fn: false }], events: ['kai-pick'], methods: [], parts: [], composedFrom: [], tokens: [] },
      { tag: 'kai-b', props: [{ name: 'value', scalar: true, optional: true, fn: false }], events: [], methods: [], parts: [], composedFrom: [], tokens: [] },
    ],
    partVariants: ['text', 'reasoning', 'tool', 'source'],
    integrations: [{ id: 'mock', category: 'mock', streamFormat: 'native', keyExposure: 'frontend-safe' }],
    capabilityGroups: [{ id: 'x', components: ['kai-a'] }],
    themeTokens: ['--kai-color-accent'],
    eventExceptions: [],
  };
  // The REAL wire source, so the clean control resolves `readModelStream`
  // against the file a recipe actually depends on rather than a stub.
  const wireSource = readFileSync(join(REPO, WIRE_READ), 'utf8');
  const wireExports = readWireExports(wireSource, 'read.ts');
  const okInvariant = { id: 'inv-ok', statement: 's', appliesTo: {}, enforcedBy: { kind: 'none' }, status: 'open', diagnosis: [], examples: [] };
  const okRecipe = {
    id: 'ok',
    intent: 'i',
    archetypes: ['full-screen'],
    targets: ['bundler'],
    ingredients: ['kai-a', 'kai-b'],
    backend: { endpoint: 'consumer-owned', reader: 'readModelStream' },
    wiring: [{ from: 'kai-a', event: 'kai-pick', to: 'kai-b', property: 'value' }],
    invariants: ['inv-ok'],
    corpus: ['README.md'],
  };
  const base = {
    derived,
    invariants: [okInvariant],
    surfaceRecipes: [okRecipe],
    inventory: [{ title: 'Command', sort: 'corpus', note: 'n' }],
    scenarios: [{ id: 'S1', needs: ['invariant:inv-ok'] }],
    partConsumption: [{ tag: 'kai-a', consumes: ['text', 'reasoning', 'tool', 'source'] }],
    labsTitles: ['Command', 'Proofs'],
    // Files, not just paths: 'packages/ui/src' is deliberately NOT in this set,
    // so the directory cases below can be driven.
    isFile: (p) => p === 'README.md' || p === WIRE_READ,
    npmScripts: ['lint:silent-drops', 'verify:scaffold', 'dev'],
    wireExports,
  };
  const partsInvariant = (parts) => ({ ...okInvariant, id: 'inv-p', appliesTo: { parts }, enforcedBy: { kind: 'none' } });
  // Each case states the EXACT message it expects, not just "some error". A
  // count-only expectation is the vacuity trap this whole branch is about: a
  // fixture usually trips more than one check, so `errors.length > 0` stays
  // true after the check the case was written for is deleted. `null` means the
  // case must come back completely clean.
  //
  // A fourth element, where present, is a substring the GAPS must contain (or a
  // number the gap COUNT must equal). A case that only asserts "no error"
  // cannot pin gap behaviour: the `kind:'none'` case below passed unchanged
  // when `gaps.push` was deleted entirely, because absence of an error was all
  // it was checking.
  const cases = [
    ['CLEAN control passes', base, null],
    ['unknown ingredient fails', { ...base, surfaceRecipes: [{ ...okRecipe, ingredients: ['kai-datagrid', 'kai-a', 'kai-b'] }] }, 'ingredient kai-datagrid is not a derived element'],
    ['unknown wiring event fails', { ...base, surfaceRecipes: [{ ...okRecipe, wiring: [{ from: 'kai-a', event: 'kai-nope', to: 'kai-b', property: 'value' }] }] }, 'kai-a does not dispatch kai-nope'],
    ['unknown wiring property fails', { ...base, surfaceRecipes: [{ ...okRecipe, wiring: [{ from: 'kai-a', event: 'kai-pick', to: 'kai-b', property: 'nope' }] }] }, 'kai-b has no property nope'],
    ['wiring onto a tag the recipe does not list fails', { ...base, surfaceRecipes: [{ ...okRecipe, ingredients: ['kai-a'] }] }, "wiring 'to' kai-b is not in the recipe's own ingredients"],
    ['bogus invariant ref fails', { ...base, surfaceRecipes: [{ ...okRecipe, invariants: ['ghost'] }] }, 'invariant ghost does not exist'],
    ['missing corpus path fails', { ...base, surfaceRecipes: [{ ...okRecipe, corpus: ['docs/does-not-exist.md'] }] }, 'corpus path docs/does-not-exist.md is not a file'],
    ['a corpus path that is a DIRECTORY fails', { ...base, surfaceRecipes: [{ ...okRecipe, corpus: ['packages/ui/src'] }] }, 'corpus path packages/ui/src is not a file'],
    ['a recipe with zero wiring edges fails', { ...base, surfaceRecipes: [{ ...okRecipe, wiring: [] }] }, 'zero wiring edges'],
    // POSITIVE CONTROL for the reader check: the clean control proves it can see
    // a reader that IS there; this proves it can see one that is not. Without
    // the pair, a wireSource that failed to load would pass both silently.
    ['a wire reader absent from src/wire/read.ts fails', { ...base, surfaceRecipes: [{ ...okRecipe, backend: { endpoint: 'consumer-owned', reader: 'readGhostStream' } }] }, 'wire reader readGhostStream is not an exported function'],
    ['a wire reader that lost its `export` fails', { ...base, wireExports: readWireExports(wireSource.replace('export async function readModelStream(', 'async function readModelStream(')) }, 'wire reader readModelStream is not an exported function'],
    ['a wire reader named only in a COMMENT fails', { ...base, wireExports: readWireExports('// export function readModelStream(stream) {}\n') }, 'wire reader readModelStream is not an exported function'],
    // The false-RED the old regex would have produced: an arrow-function export
    // is a perfectly importable reader and must RESOLVE, not fail.
    ['a wire reader exported as an arrow const RESOLVES', { ...base, wireExports: readWireExports('export const readModelStream = async (s) => s;\n') }, null],
    ['a missing wire module fails', { ...base, isFile: (p) => p === 'README.md' }, 'wire module packages/ui/src/wire/read.ts is missing'],
    ['zero recipes fails (anti-vacuity)', { ...base, surfaceRecipes: [] }, 'zero surface recipes'],
    ['zero part-consumption records fails (anti-vacuity)', { ...base, partConsumption: [] }, 'zero part-consumption records'],
    // ISOLATED: the recipe references the RENAMED invariant, or the bogus-ref
    // check fires instead and this case passes even with the path check deleted.
    [
      'missing enforcedBy test path fails',
      {
        ...base,
        invariants: [{ ...okInvariant, id: 'inv-t', enforcedBy: { kind: 'test', paths: ['nope.test.ts'] }, status: 'enforced' }],
        surfaceRecipes: [{ ...okRecipe, invariants: ['inv-t'] }],
        scenarios: [{ id: 'S1', needs: ['invariant:inv-t'] }],
      },
      'invariant inv-t: test nope.test.ts is not a file',
    ],
    [
      'an enforcedBy test path that is a DIRECTORY fails',
      {
        ...base,
        invariants: [{ ...okInvariant, id: 'inv-d', enforcedBy: { kind: 'test', paths: ['packages/ui/src'] }, status: 'enforced' }],
        surfaceRecipes: [{ ...okRecipe, invariants: ['inv-d'] }],
        scenarios: [{ id: 'S1', needs: ['invariant:inv-d'] }],
      },
      'invariant inv-d: test packages/ui/src is not a file',
    ],
    [
      'missing enforcedBy structural path fails',
      {
        ...base,
        invariants: [{ ...okInvariant, id: 'inv-s', enforcedBy: { kind: 'structural', path: 'nope.tsx' }, status: 'enforced' }],
        surfaceRecipes: [{ ...okRecipe, invariants: ['inv-s'] }],
        scenarios: [{ id: 'S1', needs: ['invariant:inv-s'] }],
      },
      'invariant inv-s: structural site nope.tsx is not a file',
    ],
    [
      'enforcedBy lint naming no npm script fails',
      {
        ...base,
        invariants: [{ ...okInvariant, id: 'inv-l', enforcedBy: { kind: 'lint', script: 'lint:ghost' }, status: 'enforced' }],
        surfaceRecipes: [{ ...okRecipe, invariants: ['inv-l'] }],
        scenarios: [{ id: 'S1', needs: ['invariant:inv-l'] }],
      },
      'invariant inv-l: no npm script lint:ghost',
    ],
    [
      'enforcedBy lint naming a real npm script passes',
      {
        ...base,
        invariants: [{ ...okInvariant, id: 'inv-l', enforcedBy: { kind: 'lint', script: 'lint:silent-drops' }, status: 'enforced' }],
        surfaceRecipes: [{ ...okRecipe, invariants: ['inv-l'] }],
        scenarios: [{ id: 'S1', needs: ['invariant:inv-l'] }],
      },
      null,
    ],
    [
      'enforcedBy lint naming a real but NON-GUARD script fails',
      {
        ...base,
        invariants: [{ ...okInvariant, id: 'inv-l', enforcedBy: { kind: 'lint', script: 'dev' }, status: 'enforced' }],
        surfaceRecipes: [{ ...okRecipe, invariants: ['inv-l'] }],
        scenarios: [{ id: 'S1', needs: ['invariant:inv-l'] }],
      },
      "npm script 'dev' is not a guard",
    ],
    [
      'enforcedBy lint naming a verify: script passes',
      {
        ...base,
        invariants: [{ ...okInvariant, id: 'inv-l', enforcedBy: { kind: 'lint', script: 'verify:scaffold' }, status: 'enforced' }],
        surfaceRecipes: [{ ...okRecipe, invariants: ['inv-l'] }],
        scenarios: [{ id: 'S1', needs: ['invariant:inv-l'] }],
      },
      null,
    ],
    // The gap expectation (4th element) is the point of these. Asserting only
    // "no error" left the kind:'none' case green when `gaps.push` was deleted.
    ['kind none is a REPORTED GAP, not an error', { ...base }, null, 'invariant inv-ok: enforced by nothing'],
    // `partial` is a gap as well: a guard covering half a statement is not
    // coverage of the statement, and counting it as enforced is what made the
    // CI line under-report by two.
    [
      'status partial is a REPORTED GAP even though a guard exists',
      {
        ...base,
        invariants: [
          { ...okInvariant, enforcedBy: { kind: 'lint', script: 'lint:silent-drops' }, status: 'partial' },
        ],
      },
      null,
      'invariant inv-ok: PARTIAL',
    ],
    [
      'kind none with an `until` reports it in the gap',
      { ...base, invariants: [{ ...okInvariant, enforcedBy: { kind: 'none', until: 'issue #99' } }] },
      null,
      '(until issue #99)',
    ],
    // POSITIVE CONTROL for the gap channel: an ENFORCED invariant must produce
    // NO gap, or "gaps is non-empty" would be true for reasons unrelated to
    // kind:'none' and the two cases above would prove nothing.
    [
      'an enforced invariant produces no gap at all',
      {
        ...base,
        invariants: [{ ...okInvariant, id: 'inv-e', enforcedBy: { kind: 'lint', script: 'lint:silent-drops' }, status: 'enforced' }],
        surfaceRecipes: [{ ...okRecipe, invariants: ['inv-e'] }],
        scenarios: [{ id: 'S1', needs: ['invariant:inv-e'] }],
      },
      null,
      0,
    ],
    ['appliesTo tag that is not a derived element fails', { ...base, invariants: [{ ...okInvariant, appliesTo: { tags: ['kai-ghost'] } }] }, 'appliesTo tag kai-ghost is not a derived element'],
    // The appliesTo.parts branch is DEAD against the real seed set (no invariant
    // sets the field), so it gets both directions by fixture here or it is a
    // check that has never been observed to do anything.
    ['appliesTo.parts naming a real variant passes', { ...base, invariants: [partsInvariant(['text', 'tool'])], surfaceRecipes: [{ ...okRecipe, invariants: ['inv-p'] }], scenarios: [{ id: 'S1', needs: ['invariant:inv-p'] }] }, null],
    ['appliesTo.parts naming a variant not in the union fails', { ...base, invariants: [partsInvariant(['text', 'telepathy'])], surfaceRecipes: [{ ...okRecipe, invariants: ['inv-p'] }], scenarios: [{ id: 'S1', needs: ['invariant:inv-p'] }] }, 'invariant inv-p: part variant telepathy is not in the union'],
    ['inventory title that names nothing in the tree fails', { ...base, inventory: [{ title: 'Ghost Panel', sort: 'ingredient', note: 'n' }] }, 'inventory: "Ghost Panel" matches no Labs story title'],
    ['an uncovered union variant fails', { ...base, partConsumption: [{ tag: 'kai-a', consumes: ['text'] }] }, "variant 'reasoning' is covered by no record"],
    ['a part-consumption record claiming a variant outside the union fails', { ...base, partConsumption: [{ tag: 'kai-a', consumes: ['text', 'reasoning', 'tool', 'source', 'telepathy'] }] }, "kai-a claims variant 'telepathy'"],
    ['a part-consumption record on an unknown tag fails', { ...base, partConsumption: [{ tag: 'kai-ghost', consumes: ['text', 'reasoning', 'tool', 'source'] }] }, 'part-consumption: kai-ghost is not a derived element'],
    ['a scenario needing an invariant that does not exist fails', { ...base, scenarios: [{ id: 'S1', needs: ['invariant:ghost'] }] }, "scenario S1: needs invariant 'ghost'"],
    // The prefix was a magic string behind a silent `continue`, so a
    // one-character typo switched the whole cross-reference off. Both backstops
    // are driven, and the free-prose control below proves neither over-fires.
    ['a NEAR-MISS of the invariant: prefix fails instead of being skipped', { ...base, scenarios: [{ id: 'S1', needs: ['invariants:inv-ok'] }] }, 'begins like a structured reference but matches no known prefix'],
    // The hole the near-miss REGEX left: an abbreviation matched neither branch
    // and was skipped in silence. A closed set of known forms is what closes it.
    ['an ABBREVIATED inv: prefix fails instead of being skipped', { ...base, scenarios: [{ id: 'S1', needs: ['invariant:inv-ok', 'inv:reactivity-two-halves'] }] }, "need 'inv:reactivity-two-halves' begins like a structured reference"],
    ['N-1 of N refs going dark is caught, not silently tolerated', { ...base, scenarios: [{ id: 'S1', needs: ['invariant:inv-ok'] }, { id: 'S2', needs: ['inv:inv-ok'] }] }, "scenario S2: need 'inv:inv-ok'"],
    ['a registered non-invariant prefix passes', { ...base, scenarios: [{ id: 'S1', needs: ['invariant:inv-ok', 'backend: consumer-owned endpoint', 'delivery target: script-tag'] }] }, null],
    // The space-spelled near-miss: no separator, but the remainder IS an id.
    ['a stem followed by an exact invariant id, with no separator, fails', { ...base, scenarios: [{ id: 'S1', needs: ['invariant:inv-ok', 'invariant inv-ok'] }] }, "need 'invariant inv-ok' begins like a structured reference"],
    // COUNTER-CONTROL for the two cases above, and the real catalog's S7: a
    // stem followed by PROSE is prose. Over-firing here is how this check
    // becomes something people route around.
    ['a stem followed by prose is prose, not a near-miss', { ...base, scenarios: [{ id: 'S1', needs: ['invariant:inv-ok', 'invariant diagnosis fields', 'target audience notes'] }] }, null],
    ['a deck that resolves ZERO invariant refs fails', { ...base, scenarios: [{ id: 'S1', needs: ['composition validity'] }] }, "no scenario carries an 'invariant:<id>' need"],
    ['free prose needs, including one containing a colon, do NOT fire', { ...base, scenarios: [{ id: 'S1', needs: ['invariant:inv-ok', 'the honesty bound: refuse what is not composable', 'backend: consumer-owned endpoint', 'wiring topology'] }] }, null],
    ['zero Labs titles fails (deriver broken)', { ...base, labsTitles: [] }, 'zero Labs titles derived from the tree'],
    ['zero scenarios fails (anti-vacuity)', { ...base, scenarios: [] }, 'zero scenarios'],
    ['zero invariants fails (anti-vacuity)', { ...base, invariants: [], surfaceRecipes: [{ ...okRecipe, invariants: ['inv-ok'] }] }, 'zero invariants'],
    ['zero inventory rows fails (anti-vacuity)', { ...base, inventory: [] }, 'zero inventory entries'],
  ];
  let failed = 0;
  for (const [name, input, want, wantGap] of cases) {
    const { errors, gaps } = check(input);
    const errorsOk = want === null ? errors.length === 0 : errors.some((e) => e.includes(want));
    const gapsOk =
      wantGap === undefined
        ? true
        : typeof wantGap === 'number'
          ? gaps.length === wantGap
          : gaps.some((g) => g.includes(wantGap));
    const ok = errorsOk && gapsOk;
    const why = !errorsOk
      ? `wanted ${want === null ? 'no errors' : `an error containing "${want}"`}, got: ${errors.join(' | ') || 'clean'}`
      : `wanted gaps ${typeof wantGap === 'number' ? `to number ${wantGap}` : `containing "${wantGap}"`}, got: ${gaps.join(' | ') || 'none'}`;
    console.log(`${ok ? '✓' : '✗'} self-test: ${name}${ok ? '' : ` (${why})`}`);
    if (!ok) failed++;
  }
  // ── The PARSER, driven directly. check() takes titles and exports as data,
  // so nothing above can observe a broken reader. These are the cases that
  // defeated the two text-based versions.
  const parserCases = [
    ['a title in a LINE comment is not a registration', "// title: 'Labs/GHOST'\nconst m = { title: 'Labs/Real' };\nexport default m;", ['Labs/Real']],
    ['a title in a BLOCK comment is not a registration', "/* title: 'Labs/GHOST' */\nconst m = { title: 'Labs/Real' };\nexport default m;", ['Labs/Real']],
    // ★ THE APOSTROPHE CLASS. JSX text containing an unbalanced `'` defeated the
    // hand-rolled stripper: it entered string state and never left, so every
    // later comment survived and its titles counted. Live in three story files.
    ['an unbalanced apostrophe in JSX does not leak a commented title', "const a = <p>Don't have an account?</p>;\n// title: 'Labs/GHOST'\nconst m = { title: 'Labs/Real' };\nexport default m;", ['Labs/Real']],
    ['a title AFTER an apostrophe is still found', "const a = <p>Don't panic</p>;\nconst m = { title: 'Labs/Real' };\nexport default m;", ['Labs/Real']],
    ['a DOUBLE-quoted title is read (the regex saw only single quotes)', 'const m = { title: "Labs/Real" };\nexport default m;', ['Labs/Real']],
    ['a BACKTICK title is read', 'const m = { title: `Labs/Real` };\nexport default m;', ['Labs/Real']],
    ['a non-title string starting with Labs/ is not a registration', "const s = 'Labs/NotATitle';\nconst m = { title: 'Labs/Real' };\nexport default m;", ['Labs/Real']],
    ['a file with no Labs title yields nothing', "const m = { title: 'Components/Thing' };\nexport default m;", []],
    // ★ THE NESTED-TITLE CLASS. A `title` inside a story's args is not a
    // registration. Both spellings below were live defeats: the first made an
    // invented inventory row resolve, the second conjured a phantom app that
    // satisfied this lint and surfaces.test.ts at once, with no comment involved.
    ['a title in a story\'s args is NOT a registration', "const m = { title: 'Labs/Real' };\nexport default m;\nexport const S = { args: { title: 'Labs/GHOSTPROBE' } };", ['Labs/Real']],
    ['a nested Labs/Apps in args does not conjure an app', "const m = { title: 'Labs/Proofs' };\nexport default m;\nexport const S = { args: { title: 'Labs/Apps' } };", ['Labs/Proofs']],
    ['a meta that is not default-exported is not a registration', "const m = { title: 'Labs/Orphan' };", []],
    // The wrappers the real tree uses, so the restriction is not accidentally
    // narrower than the files it has to read.
    ['`satisfies Meta` on the meta is unwrapped', "const m = { title: 'Labs/Real' } satisfies Meta;\nexport default m;", ['Labs/Real']],
    ['an inline `export default {…} as Meta` is read', "export default { title: 'Labs/Real' } as Meta;", ['Labs/Real']],
    ['a directly default-exported object literal is read', "export default { title: 'Labs/Real' };", ['Labs/Real']],
    // ScriptKind by extension. Both spellings below are valid TS and INVALID
    // TSX, so parsing a .stories.ts as TSX silently dropped the title. tsc
    // reads the file as TS and stays green, so typecheck never covered this.
    ['a .stories.ts survives an angle-bracket cast above the meta', "const n = <number>x;\nconst m = { title: 'Labs/Real' };\nexport default m;", ['Labs/Real'], 'x.stories.ts'],
    ['a .stories.ts survives a BARE generic arrow above the meta', "const f = <T>(x: T) => x;\nconst m = { title: 'Labs/Real' };\nexport default m;", ['Labs/Real'], 'x.stories.ts'],
    // COUNTER-CONTROL: in a REAL .tsx those spellings are genuine syntax errors,
    // so yielding nothing there is correct, not a regression.
    ['the same cast in a .tsx yields nothing, which is correct', "const n = <number>x;\nconst m = { title: 'Labs/Real' };\nexport default m;", [], 'x.stories.tsx'],
  ];
  for (const [name, src, want, fileName] of parserCases) {
    const got = readLabsTitles(src, fileName ?? 'probe.tsx');
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`${ok ? '✓' : '✗'} self-test: ${name}${ok ? '' : ` (wanted ${JSON.stringify(want)}, got ${JSON.stringify(got)})`}`);
    if (!ok) failed++;
  }
  const exportCases = [
    ['an exported function declaration is an export', 'export function readModelStream(s) {}', true],
    ['an exported async function is an export', 'export async function readModelStream(s) {}', true],
    ['an exported arrow const is an export', 'export const readModelStream = async (s) => s;', true],
    ['a NON-exported function is not', 'async function readModelStream(s) {}', false],
    ['a reader named only in a comment is not', '// export function readModelStream(s) {}', false],
    ['an export specifier counts', 'function readModelStream(s) {}\nexport { readModelStream };', true],
  ];
  for (const [name, src, want] of exportCases) {
    const got = readWireExports(src, 'probe.ts').includes('readModelStream');
    const ok = got === want;
    console.log(`${ok ? '✓' : '✗'} self-test: ${name}${ok ? '' : ` (wanted ${want}, got ${got})`}`);
    if (!ok) failed++;
  }

  // The deriver is the one input the fixtures cannot stand in for: every
  // inventory case above uses a hand-written labsTitles array, so a broken
  // deriveLabsTitles() would never show up. Drive the real one.
  const realTitles = deriveLabsTitles();
  const derivedOk = realTitles.length > 0 && realTitles.includes('Proofs') && realTitles.includes('codex');
  console.log(
    `${derivedOk ? '✓' : '✗'} self-test: deriveLabsTitles() reads the real tree (${realTitles.length} titles; Proofs + codex present)`,
  );
  if (!derivedOk) failed++;

  if (failed) process.exit(1);
  // The count must cover EVERY block that prints a `✓ self-test:` line, or the
  // guard-wiring test's claimed-vs-observed check goes red -- which is exactly
  // what it is for: a summary that undercounts is a summary nobody can trust.
  const total = cases.length + parserCases.length + exportCases.length + 1;
  console.log(`lint-catalog-drift --self-test: all ${total} cases behaved.`);
}

// Only run when invoked as a script. `check()` is exported so the guard-wiring
// test can drive the analyzer with fixtures from inside the unit suite rather
// than trusting this file's own self-report; without this gate, importing it
// would execute main() as a side effect of the import.
// The condition is INLINE in the `if` on purpose, not hoisted into a named
// const: tests/scripts/main-module-guards.test.ts extracts every `if (…)` whose
// condition mentions both `import.meta.url` and `process.argv[1]` and EVALUATES
// it from a checkout path containing a space and a '#'. A hoisted condition is
// invisible to that extractor, so the guard would ship unverified against the
// percent-encoding defect that test exists for. (Measured: hoisting it turns
// that suite's `covers every script that looks like it has a guard` red.)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (SELF_TEST) selfTest();
  else await main();
}
