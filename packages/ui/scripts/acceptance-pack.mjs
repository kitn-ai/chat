// THE PACK: what an agent is handed INSTEAD of this kit's source.
//
// Packs one acceptance scenario into a directory carrying the whole catalog --
// the derived ingredient layer, the invariants, the surface recipes, the
// scenario prompt -- and NO kit source. Spec §6: whatever the agent then cannot
// build names exactly what the catalog is missing.
//
//   node scripts/acceptance-pack.mjs --list
//   node scripts/acceptance-pack.mjs --scenario S1 --out <dir>
//   node scripts/acceptance-pack.mjs --floor          # the floor stage alone
//   node scripts/acceptance-pack.mjs --self-test      # watch the floor detect
//
// WHY MARKDOWN AND NOT ONE catalog.json
// -------------------------------------
// A single ~100KB JSON blob is tolerable for a large model and actively wrong
// for a small one -- and small models are the primary measurement instrument
// here, because a strong model supplies a missing contract from its own priors
// and so MASKS the deficiency this deck exists to find. So the pack is an INDEX
// plus one page per element: the agent reads the index and opens only what it
// needs. `derived.json` stays the machine artifact and the drift lint's input;
// `catalog.json` is still written, for programmatic consumers, but it is not
// what the agent reads.
//
// TWO DIRECTORIES, AND THE SPLIT IS STRUCTURAL
// --------------------------------------------
//   <out>/agent/   everything the agent under test may read
//   <out>/judge/   the evaluator's material: catalog.json, the judge checklist,
//                  the floor report, `enforcedBy` pointers and recipe `corpus`
//                  paths
// `enforcedBy` and `corpus` name files inside this repo that the agent is not
// given, and a scoring checklist in the agent's own directory is an answer key.
// A sentence asking the agent not to look is not a boundary; a directory it is
// never handed is. The runner hands over `<out>/agent/` and keeps `<out>/judge/`.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { runFloor, formatFloor, selfTest, assertEnrichmentCovers } from './lib/invariant-floor.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_DIR = join(ROOT, 'src/agent-tooling/catalog');
const args = process.argv.slice(2);

function fail(msg) {
  console.error(`✗ acceptance-pack: ${msg}`);
  process.exit(1);
}

function arg(name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

/** The authored catalog modules are TypeScript; bundle them once and import. */
async function importCatalog() {
  const tmp = mkdtempSync(join(tmpdir(), 'acceptance-pack-'));
  const entry = join(tmp, 'entry.ts');
  writeFileSync(
    entry,
    [
      `export { listScenarios } from ${JSON.stringify(join(CATALOG_DIR, 'scenarios.ts'))};`,
      `export { listInvariants } from ${JSON.stringify(join(CATALOG_DIR, 'invariants.ts'))};`,
      `export { listSurfaceRecipes, listInventory, listPartConsumption } from ${JSON.stringify(join(CATALOG_DIR, 'surfaces.ts'))};`,
    ].join('\n'),
  );
  const bundle = join(tmp, 'bundle.mjs');
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'error',
  });
  const mod = await import(pathToFileURL(bundle).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/**
 * element-meta.json prints an optional prop's type as `undefined | T`. The
 * optionality is already carried by its own `optional` flag and stated on the
 * line, so printing it twice buys nothing and makes every type longer than the
 * thing it describes. Strip ONLY that leading union member, never an interior
 * one.
 */
function readableType(t) {
  if (typeof t !== 'string') return undefined;
  return t.startsWith('undefined | ') ? t.slice('undefined | '.length) : t;
}

function fence(code, lang = 'ts') {
  return ['```' + lang, code, '```'].join('\n');
}

function section(title, body) {
  return body && body.length ? `## ${title}\n\n${body}\n` : '';
}

// ---------------------------------------------------------------------------
// The agent-facing pages
// ---------------------------------------------------------------------------

function renderReadme({ scenario, kitVersion, derived, elementPageCount }) {
  return `# @kitn.ai/ui composition pack — ${scenario.id}

Kit version: \`${kitVersion}\`. Every fact in this pack was read out of that
release. There is no other documentation and no kit source: this pack is
everything.

## Read in this order

1. **PROMPT.md** — the task.
2. **ELEMENTS.md** — the index of all ${derived.elements.length} elements, one line each. **Open only the
   element pages you actually need** (\`elements/<tag>.md\`). There are
   ${elementPageCount} of them and reading them all is a waste of your context.
3. **SHARED-PROPS.md** — the props every element has. They are listed once here
   and NOT repeated on the ${elementPageCount} element pages.
4. **INVARIANTS.md** — the rules that break real consumers. Each carries a
   wrong/right code pair. Apply these; they are not style advice.
5. **RECIPES.md** — proven compositions, with the host wiring written out.
6. **PARTS.md**, **INTEGRATIONS.md**, **THEME.md**, **INVENTORY.md** — reference,
   open as needed.
7. **SELF-AUDIT.md** — run this over your own output **before you deliver**.
8. **FABRICATED.md** — components other agents have invented that do not exist.

## These lists are EXHAUSTIVE

This is the part that matters most, so it is repeated on each list page:

- **ELEMENTS.md is every custom element this kit defines** — all
  ${derived.elements.length} of them. If a tag is not in that list, **it does not
  exist**. There is no larger catalog elsewhere.
- **PARTS.md is every \`MessagePart\` variant the wire can represent** —
  ${derived.partVariants.length} of them. A part with any other \`type\` cannot be
  produced, parsed or rendered.
- The props, events, methods, slots and CSS parts on an element page are that
  element's complete API. There are no undocumented ones.

**So if this task needs something that is not here, say so and stop.** Inventing
a plausible \`<kai-…>\` tag, prop or event is the single worst outcome: it
compiles in the reader's head, renders nothing in a browser, and costs more to
diagnose than an honest refusal. Naming what is missing is a correct and useful
answer.

## The shape of this kit, in four sentences

Web components prefixed \`kai-\`, Shadow DOM, framework-agnostic. Arrays,
objects and functions go on the element as **JS properties**; only scalars work
as attributes. Events are **non-bubbling \`kai-*\` CustomEvents** — listen on the
element that dispatches them. There is no store: the **host** wires element A's
event to element B's property.
`;
}

function renderElementIndex({ derived, meta, universal }) {
  const byTag = new Map(meta.map((m) => [m.tag, m]));
  const rows = derived.elements
    .slice()
    .sort((a, b) => a.tag.localeCompare(b.tag))
    .map((e) => {
      const m = byTag.get(e.tag);
      const slots = (m.slots ?? []).length;
      // The shared props are factored out of the element PAGES, so the count
      // here must exclude them too. A row saying 5 next to a page listing 4 is
      // the kind of small falsehood that makes an agent stop trusting the pack.
      const props = e.props.filter((p) => !universal.includes(p.name)).length;
      return `| [\`${e.tag}\`](elements/${e.tag}.md) | ${props} | ${e.events.length} | ${e.methods.length} | ${slots} | ${e.parts.length} | ${(e.composedFrom ?? []).join(', ') || '—'} |`;
    });

  return `# Elements — the complete index

**This list is EXHAUSTIVE.** These ${derived.elements.length} tags are every
custom element \`@kitn.ai/ui\` defines. **If a tag is not on this list, it does
not exist** — do not write it, do not import it, do not assume a sibling of one
that is here. If the task needs one that is missing, say so.

Counts below exclude the shared props in [SHARED-PROPS.md](SHARED-PROPS.md),
which every element also has.

Open a row's page for its full API. Do not open pages you do not need.

| element | props | events | methods | slots | CSS parts | Solid component |
| --- | --: | --: | --: | --: | --: | --- |
${rows.join('\n')}
`;
}

function renderSharedProps({ universal, meta }) {
  if (!universal.length) {
    return `# Shared props

No prop is present on every element in this release, so nothing is factored out
here; each element page carries its full prop list.
`;
  }
  // Read the documentation for a universal prop off the first element that
  // declares it: it is the same declaration on every element, which is what
  // makes it universal and what makes printing it once correct.
  const blocks = universal.map((name) => {
    const owner = meta.find((m) => (m.props ?? []).some((p) => p.name === name));
    const p = owner.props.find((x) => x.name === name);
    return renderProp(p);
  });
  return `# Shared props

Every one of the elements in [ELEMENTS.md](ELEMENTS.md) has these props. They are
listed here once and are **deliberately absent from the individual element
pages** — an element page showing no \`theme\` row still has \`theme\`.

${blocks.join('\n')}`;
}

function renderProp(p) {
  const how = p.fnValued
    ? '**JS property — a function you supply.** Never an attribute; a function cannot survive JSON.'
    : p.scalar
      ? 'Settable as an **attribute** or a JS property.'
      : '**JS property only.** Setting it as an attribute stringifies it and the element receives a string.';
  const type = readableType(p.displayType ?? p.type);
  const bits = [`- **\`${p.name}\`** — ${how}`];
  if (type) bits.push(`  Type: \`${type}\``);
  bits.push(`  ${p.optional ? 'Optional' : 'Required'}${p.default ? `, default \`${p.default}\`` : ''}.`);
  if (p.description) bits.push(`  ${p.description}`);
  return bits.join('\n') + '\n';
}

function renderElementPage({ el, m, universal }) {
  const props = (m.props ?? [])
    .filter((p) => !universal.includes(p.name))
    .map((p) => {
      const d = el.props.find((x) => x.name === p.name);
      return renderProp({ ...p, scalar: d ? d.scalar : p.scalar, fnValued: d ? d.fn : false });
    });

  const events = (m.events ?? []).map((e) => {
    const detail = e.displayDetail ?? e.detail;
    return `- **\`${e.name}\`**${detail ? ` — \`event.detail\`: \`${detail}\`` : ' — no `detail`'}\n${e.description ? `  ${e.description}\n` : ''}`;
  });

  const methods = (m.methods ?? []).map(
    (x) => `- **\`${x.name}(${x.params ?? ''})\`** → \`${x.returns ?? 'void'}\`\n${x.description ? `  ${x.description}\n` : ''}`,
  );

  const slots = (m.slots ?? []).map(
    (s) =>
      `- **\`${s.name}\`** (${s.mode === 'replace' ? 'replaces the built-in content' : 'injects alongside it'})\n${s.doc ? `  ${s.doc}\n` : ''}`,
  );

  const parts = (m.parts ?? []).map(
    (p) => `- **\`::part(${p.name})\`**${p.doc ? ` — ${p.doc}` : ''}${p.recipe ? `\n${fence(p.recipe, 'css')}` : ''}`,
  );

  const tokens = (el.tokens ?? []).map((t) => `- \`${t}\``);

  const usage = fence(
    [
      `const el = document.querySelector('${el.tag}');`,
      ...(el.props.some((p) => !p.scalar)
        ? [`// arrays / objects / functions are PROPERTIES, never attributes`]
        : []),
      ...(el.events.length ? [`el.addEventListener('${el.events[0]}', (event) => { /* listen on the element itself */ });`] : []),
    ].join('\n'),
    'js',
  );

  return `# \`${el.tag}\`

${(el.composedFrom ?? []).length ? `Solid component: \`${el.composedFrom.join('`, `')}\`.\n` : ''}
This page is this element's **complete** API. Anything not listed does not exist
on it. Every element also has the props in
[../SHARED-PROPS.md](../SHARED-PROPS.md), which are not repeated here.

${usage}

${section('Props', props.length ? props.join('\n') : '_No props beyond the shared ones._')}
${section('Events', events.length ? events.join('\n') : '_This element dispatches no events._')}
${section('Methods', methods.length ? methods.join('\n') : '')}
${section('Slots', slots.length ? slots.join('\n') : '')}
${section('CSS parts', parts.length ? parts.join('\n') : '')}
${section('CSS custom properties', tokens.length ? tokens.join('\n') : '')}`;
}

function renderInvariants({ invariants, derived }) {
  const blocks = invariants.map((inv) => {
    const diag = inv.diagnosis.length
      ? `**If you see this, this is why:**\n\n${inv.diagnosis.map((d) => `- _${d.symptom}_ → ${d.cause}`).join('\n')}\n`
      : '';
    const pairs = inv.examples
      .map(
        (ex, i) =>
          `**Pair ${i + 1} — wrong:**\n\n${fence(ex.wrong)}\n**Right:**\n\n${fence(ex.right)}\n${ex.note ? `${ex.note}\n` : ''}`,
      )
      .join('\n');
    const extra =
      inv.id === 'events-non-bubbling'
        ? `\n**The complete list of protocol exceptions** — these ${derived.eventExceptions.length} events, and no others, cross the element boundary:\n\n| event | bubbles | composed |\n| --- | --- | --- |\n${derived.eventExceptions
            .map((e) => `| \`${e.event}\` | ${e.bubbles} | ${e.composed} |`)
            .join('\n')}\n`
        : '';
    return `## ${inv.id}

${inv.statement}
${extra}
${diag}
${pairs}`;
  });

  return `# Invariants

Seven rules. Every one of them has already broken a real consumer of this kit.
They are not style preferences and a reviewer will not catch them for you: most
produce code that compiles, type-checks and renders nothing.

Each carries a **wrong/right pair as code**. Match your output against the wrong
form; if it matches, use the right form. [SELF-AUDIT.md](SELF-AUDIT.md) turns
these pairs into an exact-string checklist you can run mechanically.

${blocks.join('\n\n---\n\n')}
`;
}

function renderSelfAudit({ selfAuditItems, derived }) {
  const items = selfAuditItems
    .map(
      (it, n) => `### ${n + 1}. \`${it.invariant}\`

Search your output for this exact string:

${fence(it.search, 'text')}

**Expected hits: 0.** If you find it, replace that line with:

${fence(it.replaceWith)}
`,
    )
    .join('\n');

  return `# Self-audit — run this on your own output before you deliver

Two kinds of check. Both are mechanical: do not reason about whether your code
"feels right", **search it**.

## Part 1 — exact-string searches

Each item below is a literal string that must not appear in what you produced.
These are exact-string checks, so they are a **floor, not a proof**: a near-miss
(a different variable name, a reordered argument) will not match and is still
wrong. Zero hits does not mean correct; a hit means definitely wrong.

${items}

## Part 2 — checks over the catalog's own lists

These need no needle. Run each over your finished output.

1. **Every \`kai-…\` tag you wrote must appear in ELEMENTS.md.** Extract every
   tag matching \`kai-[a-z-]+\` from your output and look each one up in the
   index. There are ${derived.elements.length} legal tags. A tag that is not on
   that list does not exist, and shipping it is worse than not answering — go
   back and say what is missing instead.
2. **Every prop you set must appear on that element's page.** Not on a different
   element's page: props are not shared between elements except the ones in
   SHARED-PROPS.md.
3. **Every prop you set as an ATTRIBUTE must be marked settable as an attribute
   on that page.** Anything marked "JS property only" must be assigned:
   \`el.prop = value\`.
4. **Every event you listen for must be listed on the element you attached the
   listener to.** Not on a parent, not on \`document\` — except for the protocol
   exceptions listed in INVARIANTS.md under \`events-non-bubbling\`.
5. **Every \`MessagePart\` you construct must use a \`type\` from PARTS.md.**
   There are ${derived.partVariants.length}: ${derived.partVariants.map((v) => `\`${v}\``).join(', ')}.
6. **Every CSS custom property you set must appear in THEME.md.**
7. **You imported no SSE parsing of your own.** If your output reads
   \`response.body\` and splits on \`data:\`, delete it and use the wire reader.
`;
}

function renderRecipes({ recipes }) {
  const blocks = recipes.map((r) => {
    const wiring = r.wiring
      .map((w) => `| \`${w.from}\` | \`${w.event}\` | \`${w.to}\` | \`${w.property}\` | ${w.note ?? ''} |`)
      .join('\n');
    return `## ${r.id}

${r.intent}

- **Archetype:** ${r.archetypes.join(', ')}
- **Delivery:** ${r.targets.join(', ')}
- **Ingredients:** ${r.ingredients.map((i) => `\`${i}\``).join(', ')}
- **Backend:** a **${r.backend.endpoint}** endpoint, read with \`${r.backend.reader}\` from \`@kitn.ai/ui/wire\`. This kit ships no client and no key handling: you fetch, it parses.
- **Invariants this recipe instances:** ${r.invariants.map((i) => `\`${i}\``).join(', ')} — see INVARIANTS.md.

**Host wiring.** Nothing coordinates these elements automatically. Every row is
code you must write:

| from | event | to | property | what the host does |
| --- | --- | --- | --- | --- |
${wiring}
`;
  });

  return `# Surface recipes

Compositions that are proven to work. A recipe is a shopping list plus a wiring
diagram — the wiring is the part that does not happen on its own.

${blocks.join('\n---\n\n')}`;
}

function renderParts({ derived, partConsumption }) {
  return `# Message parts

**This list is EXHAUSTIVE.** A message's \`parts\` array may contain these
${derived.partVariants.length} variants and no others:

${derived.partVariants.map((v) => `- \`{ type: '${v}', … }\``).join('\n')}

A part with any other \`type\` cannot be produced by the wire layer, cannot be
parsed by it, and will not render. If the task needs a kind of content that is
not on this list, **say so** rather than inventing a variant.

## Which element renders which

| element | consumes |
| --- | --- |
${partConsumption.map((p) => `| \`${p.tag}\` | ${p.consumes.map((c) => `\`${c}\``).join(', ')} |`).join('\n')}
`;
}

function renderIntegrations({ derived }) {
  return `# Integrations

The backend side. **This kit parses; you fetch.** There is no provider client,
no key handling and no provider SDK inside the package — you call your own
endpoint and hand the response to a reader from \`@kitn.ai/ui/wire\`.

\`keyExposure: needs-proxy\` means the provider key must never reach the browser:
put a route of your own in front of it.

| integration | category | stream format | key exposure |
| --- | --- | --- | --- |
${derived.integrations.map((i) => `| \`${i.id}\` | ${i.category} | \`${i.streamFormat}\` | ${i.keyExposure} |`).join('\n')}

## Capability groups

Elements that are normally adopted together.

${derived.capabilityGroups.map((g) => `- **${g.id}** — ${g.components.map((c) => `\`${c}\``).join(', ')}`).join('\n')}
`;
}

function renderTheme({ derived }) {
  return `# Theme tokens

**This list is EXHAUSTIVE.** These ${derived.themeTokens.length} CSS custom
properties are every token the kit reads. Setting one that is not on this list
does nothing.

Set them on a host element or on \`:root\`; they cross the shadow boundary
because custom properties inherit. Do not reach into a shadow root and do not
style by internal class name — use the \`::part()\` names on each element page.

${derived.themeTokens.map((t) => `- \`${t}\``).join('\n')}
`;
}

function renderInventory({ inventory }) {
  const bySort = (s) => inventory.filter((i) => i.sort === s);
  const list = (rows) => rows.map((r) => `- **${r.title}** — ${r.note}`).join('\n');
  return `# Inventory

What in this kit is a whole **surface** (product-shaped, something a user could
be handed) versus an **ingredient** (exists only inside something else). Useful
when a request names a product rather than a component.

## Surfaces

${list(bySort('surface'))}

## Ingredients

${list(bySort('ingredient'))}
`;
}

function renderFabricated() {
  return `# Components other agents invented

**This section is empty. No acceptance runs have happened yet.**

That is the honest state of it, not a placeholder: this page is the accumulated
memory of tags, props and events that agents working from this pack have
confidently written and which do not exist. It can only be filled in by running
the deck and recording what came back, so until a run happens there is nothing
truthful to put here.

Do not read the emptiness as "agents get this right". Read it as "nobody has
looked yet".

| invented | what the agent wanted | what to use instead | first seen |
| --- | --- | --- | --- |

## When this table has rows

Check anything you are about to write against it, and against
[ELEMENTS.md](ELEMENTS.md), which is the authoritative list either way.
`;
}

// ---------------------------------------------------------------------------
// The judge-facing pages
// ---------------------------------------------------------------------------

function renderJudge({ scenario, invariants, recipes, kitVersion, floor }) {
  const enforced = invariants
    .map((inv) => {
      const e = inv.enforcedBy;
      const where =
        e.kind === 'test'
          ? e.paths.join(', ')
          : e.kind === 'structural'
            ? e.path
            : e.kind === 'lint'
              ? `${e.script} (packages/ui/package.json)`
              : `nothing${e.until ? ` — until ${e.until}` : ''}`;
      return `| \`${inv.id}\` | ${inv.status} | ${e.kind} | ${where} |`;
    })
    .join('\n');

  return `# Judge checklist — ${scenario.id} (${scenario.depth})

Kit version \`${kitVersion}\`. **This file and everything else under \`judge/\`
was never given to the agent** — the agent received \`<pack>/agent/\` only.

## Scoring

${scenario.scoring.map((s) => `- [ ] ${s}`).join('\n')}

## What the catalog claims this scenario needs

${scenario.needs.map((n) => `- ${n}`).join('\n')}

## Invariant enforcement, for triage

If the agent got an invariant wrong, this says whether anything in the repo
would have caught it. \`none\` means the acceptance deck is the only measurement
there is.

| invariant | status | kind | where |
| --- | --- | --- | --- |
${enforced}

## Recipe corpus — where each recipe is demonstrated in the repo

${recipes.map((r) => `- **${r.id}** — ${r.corpus.map((c) => `\`${c}\``).join(', ')}`).join('\n')}

## Floor stage

Every \`examples[].right\` in the catalog was executed before this pack was
written. Full report in [FLOOR.md](FLOOR.md); ${floor.results.length} examples,
${floor.results.filter((r) => r.status === 'passed').length} passed.
`;
}

function renderFloorReport(floor) {
  const stubbed = floor.results.filter((r) => r.stubs.length);
  return `# Floor stage report

Every \`examples[].right\` form in the invariant records was EXECUTED before this
pack was written, and where the example makes a behavioural claim the claim was
asserted. If the catalog's own recommended code does not run, nothing measured
downstream of it is worth anything.

${floor.results.length} examples, ${floor.results.filter((r) => r.status === 'passed').length} passed, ${floor.results.filter((r) => r.status !== 'passed').length} not.

\`\`\`
${formatFloor(floor)}
\`\`\`

## Examples that could not be executed against the real thing

${
  stubbed.length
    ? stubbed
        .map(
          (r) =>
            `- **${r.key}** — stand-ins: ${r.stubs.join('; ')}. The fragment executed and its arguments were asserted, but against a stub rather than the published symbol.${r.corroboration ? ` Corroborated by another route: ${r.corroboration}.` : ''}`,
        )
        .join('\n')
    : '_None: every example ran against real values._'
}
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const catalog = await importCatalog();
const scenarios = catalog.listScenarios();

if (args.includes('--list')) {
  for (const s of scenarios) console.log(`${s.id}  ${s.depth}`);
  process.exit(0);
}

const derived = JSON.parse(readFileSync(join(CATALOG_DIR, 'derived.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(ROOT, 'src/elements/element-meta.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const kitVersion = pkg.version;

const helpers = {
  derivedTags: new Set(derived.elements.map((e) => e.tag)),
  derivedProp: (tag, name) => derived.elements.find((e) => e.tag === tag)?.props.find((p) => p.name === name),
  derivedEvents: (tag) => derived.elements.find((e) => e.tag === tag)?.events ?? [],
  wireIndexSource: readFileSync(join(ROOT, 'src/wire/index.ts'), 'utf8'),
  exportsKeys: Object.keys(pkg.exports ?? {}),
};

if (args.includes('--self-test')) {
  const r = await selfTest(helpers);
  for (const [what, ok] of r.expectations) console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!r.ok) fail(`the floor stage failed its own positive control:\n  - ${r.failed.join('\n  - ')}`);
  console.log('✓ acceptance-pack: the floor stage detects a broken example, a silently-wrong one, a missing harness and a dangling one.');
  process.exit(0);
}

const invariants = catalog.listInvariants();
const floor = await runFloor(invariants, helpers);
if (args.includes('--floor')) {
  console.log(formatFloor(floor));
  if (!floor.ok) fail(`${floor.errors.length} floor failure(s). The catalog's own recommended code does not run.`);
  console.log(`✓ acceptance-pack: floor clean — ${floor.results.length} examples executed.`);
  process.exit(0);
}

const id = arg('--scenario');
const out = arg('--out');
if (!id || !out) fail('usage: acceptance-pack.mjs --scenario <S1..S7> --out <dir> | --list | --floor | --self-test');
const scenario = scenarios.find((s) => s.id === id);
if (!scenario) fail(`unknown scenario ${id}; run --list.`);

// Nothing is written until the floor is clean. A pack built on advice that does
// not run would produce a measurement of the agent when the fault is ours.
if (!floor.ok) {
  console.error(formatFloor(floor));
  fail(
    `the floor stage failed, so nothing was packed. ${floor.errors.length} problem(s) in the catalog's own examples[].right forms — fix those first; a pack built on broken advice measures the wrong thing.`,
  );
}

assertEnrichmentCovers(derived.elements, meta);

const metaByTag = new Map(meta.map((m) => [m.tag, m]));
// A prop is universal when element-meta.json flags it so -- the flag is set by
// the generator, not inferred here. Cross-checked against the derived spine:
// a "universal" prop missing from any element would make the dedup a lie, and
// dropping the row from 80 pages while it is absent from one is worse than not
// deduping at all.
const universal = [
  ...new Set(meta.flatMap((m) => (m.props ?? []).filter((p) => p.universal).map((p) => p.name))),
].filter((name) => {
  const everywhere = derived.elements.every((e) => e.props.some((p) => p.name === name));
  if (!everywhere) {
    fail(
      `element-meta.json flags \`${name}\` universal, but it is not on every element in derived.json. Factoring it out of the element pages would hide its absence.`,
    );
  }
  return true;
});

const selfAuditItems = invariants.flatMap((inv) =>
  inv.examples.map((ex, index) => ({
    invariant: inv.id,
    index,
    search: ex.wrong,
    replaceWith: ex.right,
    rule: inv.statement,
  })),
);

const recipes = catalog.listSurfaceRecipes();
const inventory = catalog.listInventory();
const partConsumption = catalog.listPartConsumption();

const agentDir = join(out, 'agent');
const judgeDir = join(out, 'judge');
mkdirSync(join(agentDir, 'elements'), { recursive: true });
mkdirSync(judgeDir, { recursive: true });

// Counted, not stated: the "how many guides" line at the end is produced from
// what was actually written, so adding or dropping a page moves it on its own.
const written = { agentGuides: 0, elementPages: 0 };
const write = (dir, name, body) => {
  if (dir === agentDir) written.agentGuides++;
  if (dir === join(agentDir, 'elements')) written.elementPages++;
  writeFileSync(join(dir, name), body.endsWith('\n') ? body : body + '\n');
};

for (const el of derived.elements) {
  write(join(agentDir, 'elements'), `${el.tag}.md`, renderElementPage({ el, m: metaByTag.get(el.tag), universal }));
}

write(agentDir, 'README.md', renderReadme({ scenario, kitVersion, derived, elementPageCount: derived.elements.length }));
write(
  agentDir,
  'PROMPT.md',
  `# Your task

${scenario.prompt}

---

Everything you need is in this directory; there is no kit source and no other
documentation. Start from [README.md](README.md), and run
[SELF-AUDIT.md](SELF-AUDIT.md) over your output before you deliver.

If this task cannot be built from what is here, **say that, name what is
missing, and stop**. Do not invent an element, a prop or an event to close the
gap.
`,
);
write(agentDir, 'ELEMENTS.md', renderElementIndex({ derived, meta, universal }));
write(agentDir, 'SHARED-PROPS.md', renderSharedProps({ universal, meta }));
write(agentDir, 'INVARIANTS.md', renderInvariants({ invariants, derived }));
write(agentDir, 'SELF-AUDIT.md', renderSelfAudit({ selfAuditItems, derived }));
write(agentDir, 'RECIPES.md', renderRecipes({ recipes }));
write(agentDir, 'PARTS.md', renderParts({ derived, partConsumption }));
write(agentDir, 'INTEGRATIONS.md', renderIntegrations({ derived }));
write(agentDir, 'THEME.md', renderTheme({ derived }));
write(agentDir, 'INVENTORY.md', renderInventory({ inventory }));
write(agentDir, 'FABRICATED.md', renderFabricated());

write(judgeDir, 'JUDGE.md', renderJudge({ scenario, invariants, recipes, kitVersion, floor }));
write(judgeDir, 'FLOOR.md', renderFloorReport(floor));
write(
  judgeDir,
  'catalog.json',
  JSON.stringify(
    {
      kitVersion,
      scenario: scenario.id,
      generatedFrom: {
        derived: 'packages/ui/src/agent-tooling/catalog/derived.json',
        elementMeta: 'packages/ui/src/elements/element-meta.json',
      },
      derived,
      invariants,
      surfaceRecipes: recipes,
      inventory,
      partConsumption,
      selfAudit: selfAuditItems,
      floor: floor.results,
    },
    null,
    2,
  ),
);

write(
  out,
  'PACK.md',
  `# Acceptance pack — ${scenario.id}

Kit version \`${kitVersion}\`.

**For the runner, not for the agent.**

- \`agent/\` — hand this directory to the agent under test, and nothing else. It
  carries the whole catalog and no kit source.
- \`judge/\` — the evaluator's material: the scoring checklist, the full
  \`catalog.json\`, the \`enforcedBy\` pointers, the recipe corpus paths, and the
  floor-stage report. Handing any of it to the agent invalidates the run:
  \`JUDGE.md\` is an answer key, and the corpus paths point at files inside the
  kit repo that the agent is deliberately not given.

Scenario: ${scenario.id} — ${scenario.depth}.
`,
);

console.log(
  `acceptance-pack: packed ${scenario.id} into ${out} (agent/: ${written.elementPages} element pages + ${written.agentGuides} guides; judge/: checklist, floor report, catalog.json)`,
);
