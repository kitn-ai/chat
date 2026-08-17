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
//
// What it DOES catch incidentally, worth knowing: a catalog file that no longer
// parses fails the esbuild step loudly rather than being skipped, because the
// authored records are loaded through their VALIDATED accessors — so a record
// violating its own zod schema is a hard failure here too, not a silent pass.
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  const mod = await import(pathToFileURL(bundle).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
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
  fileExists,
  lintScripts,
  wireSource,
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

  const wireModulePresent = fileExists(WIRE_READ);
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
    for (const path of r.corpus) {
      if (!fileExists(path)) errors.push(`recipe ${r.id}: corpus path ${path} does not exist.`);
    }
    if (wireModulePresent && !wireSource.includes(`function ${r.backend.reader}(`)) {
      errors.push(`recipe ${r.id}: wire reader ${r.backend.reader} not found in ${WIRE_READ}.`);
    }
  }

  for (const inv of invariants) {
    const e = inv.enforcedBy;
    if (e.kind === 'test')
      for (const p of e.paths) {
        if (!fileExists(p)) errors.push(`invariant ${inv.id}: test ${p} does not exist.`);
      }
    if (e.kind === 'structural' && !fileExists(e.path))
      errors.push(`invariant ${inv.id}: structural site ${e.path} does not exist.`);
    if (e.kind === 'lint' && !lintScripts.includes(e.script))
      errors.push(`invariant ${inv.id}: no npm script ${e.script}.`);
    // A GAP, never an error: `kind: 'none'` is the honest record of something
    // nothing enforces, and failing on it would push authors to invent a path.
    if (e.kind === 'none') gaps.push(`invariant ${inv.id}: enforced by nothing${e.until ? ` (until ${e.until})` : ''}.`);
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
  for (const s of scenarios) {
    for (const need of s.needs ?? []) {
      if (!need.startsWith('invariant:')) continue;
      const id = need.slice('invariant:'.length);
      if (!invariantIds.has(id)) errors.push(`scenario ${s.id}: needs invariant '${id}', which does not exist.`);
    }
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
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.stories.tsx')) continue;
      const text = readFileSync(full, 'utf8');
      for (const m of text.matchAll(/title:\s*'Labs\/([^']+)'/g)) {
        const suffix = m[1];
        names.add(suffix);
        // 'Foundations/Input' also registers the group 'Foundations'.
        if (suffix.includes('/')) names.add(suffix.split('/')[0]);
      }
      if (text.includes("title: 'Labs/Apps'")) names.add(entry.name.replace('.stories.tsx', ''));
    }
  };
  walk(join(ROOT, 'src'));
  return [...names];
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
    fileExists: (p) => existsSync(join(REPO, p)),
    lintScripts: Object.keys(pkg.scripts),
    wireSource: existsSync(join(REPO, WIRE_READ)) ? readFileSync(join(REPO, WIRE_READ), 'utf8') : '',
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
    fileExists: (p) => p === 'README.md' || p === WIRE_READ,
    lintScripts: ['lint:silent-drops'],
    wireSource,
  };
  const partsInvariant = (parts) => ({ ...okInvariant, id: 'inv-p', appliesTo: { parts }, enforcedBy: { kind: 'none' } });
  // Each case states the EXACT message it expects, not just "some error". A
  // count-only expectation is the vacuity trap this whole branch is about: a
  // fixture usually trips more than one check, so `errors.length > 0` stays
  // true after the check the case was written for is deleted. `null` means the
  // case must come back completely clean.
  const cases = [
    ['CLEAN control passes', base, null],
    ['unknown ingredient fails', { ...base, surfaceRecipes: [{ ...okRecipe, ingredients: ['kai-datagrid', 'kai-a', 'kai-b'] }] }, 'ingredient kai-datagrid is not a derived element'],
    ['unknown wiring event fails', { ...base, surfaceRecipes: [{ ...okRecipe, wiring: [{ from: 'kai-a', event: 'kai-nope', to: 'kai-b', property: 'value' }] }] }, 'kai-a does not dispatch kai-nope'],
    ['unknown wiring property fails', { ...base, surfaceRecipes: [{ ...okRecipe, wiring: [{ from: 'kai-a', event: 'kai-pick', to: 'kai-b', property: 'nope' }] }] }, 'kai-b has no property nope'],
    ['wiring onto a tag the recipe does not list fails', { ...base, surfaceRecipes: [{ ...okRecipe, ingredients: ['kai-a'] }] }, "wiring 'to' kai-b is not in the recipe's own ingredients"],
    ['bogus invariant ref fails', { ...base, surfaceRecipes: [{ ...okRecipe, invariants: ['ghost'] }] }, 'invariant ghost does not exist'],
    ['missing corpus path fails', { ...base, surfaceRecipes: [{ ...okRecipe, corpus: ['docs/does-not-exist.md'] }] }, 'corpus path docs/does-not-exist.md does not exist'],
    // POSITIVE CONTROL for the reader check: the clean control proves it can see
    // a reader that IS there; this proves it can see one that is not. Without
    // the pair, a wireSource that failed to load would pass both silently.
    ['a wire reader absent from src/wire/read.ts fails', { ...base, surfaceRecipes: [{ ...okRecipe, backend: { endpoint: 'consumer-owned', reader: 'readGhostStream' } }] }, 'wire reader readGhostStream not found'],
    ['a missing wire module fails', { ...base, fileExists: (p) => p === 'README.md' }, 'wire module packages/ui/src/wire/read.ts is missing'],
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
      'invariant inv-t: test nope.test.ts does not exist',
    ],
    [
      'missing enforcedBy structural path fails',
      {
        ...base,
        invariants: [{ ...okInvariant, id: 'inv-s', enforcedBy: { kind: 'structural', path: 'nope.tsx' }, status: 'enforced' }],
        surfaceRecipes: [{ ...okRecipe, invariants: ['inv-s'] }],
        scenarios: [{ id: 'S1', needs: ['invariant:inv-s'] }],
      },
      'invariant inv-s: structural site nope.tsx does not exist',
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
    ['kind none is a gap, not an error', { ...base }, null],
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
    ['zero Labs titles fails (deriver broken)', { ...base, labsTitles: [] }, 'zero Labs titles derived from the tree'],
    ['zero scenarios fails (anti-vacuity)', { ...base, scenarios: [] }, 'zero scenarios'],
    ['zero invariants fails (anti-vacuity)', { ...base, invariants: [], surfaceRecipes: [{ ...okRecipe, invariants: ['inv-ok'] }] }, 'zero invariants'],
    ['zero inventory rows fails (anti-vacuity)', { ...base, inventory: [] }, 'zero inventory entries'],
  ];
  let failed = 0;
  for (const [name, input, want] of cases) {
    const { errors } = check(input);
    const ok = want === null ? errors.length === 0 : errors.some((e) => e.includes(want));
    console.log(
      `${ok ? '✓' : '✗'} self-test: ${name}${ok ? '' : ` (wanted ${want === null ? 'no errors' : `an error containing "${want}"`}, got: ${errors.join(' | ') || 'clean'})`}`,
    );
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
  console.log(`lint-catalog-drift --self-test: all ${cases.length + 1} cases behaved.`);
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
