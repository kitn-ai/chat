// THE PACK: what an agent is handed INSTEAD of this kit's source.
//
// Packs one acceptance scenario into a directory carrying the whole catalog --
// the derived ingredient layer, the invariants, the surface recipes, the
// delivery story, the scenario prompt -- and NO kit source. Spec §6: whatever
// the agent then cannot build names exactly what the catalog is missing.
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
//
// EVERYTHING IS RENDERED BEFORE ANYTHING IS WRITTEN, so the cross-checks below
// -- scoring-line redaction, import specifiers resolving against the exports
// map, the floor, artifact agreement, needle soundness -- can refuse to produce
// a pack rather than produce one and then complain about it.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { runFloor, formatFloor, selfTest, assertArtifactsAgree, faultsSince, faultCount, SETTLE_MS } from './lib/invariant-floor.mjs';
import { NEEDLE_TABLE, NEEDLES, verifyNeedles, selfTestNeedles, variantsOf } from './lib/audit-needles.mjs';
import { renderFabricatedPage } from './lib/fabrications.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_DIR = join(ROOT, 'src/agent-tooling/catalog');
const args = process.argv.slice(2);

function fail(msg) {
  completed = true;
  console.error(`✗ acceptance-pack: ${msg}`);
  process.exit(1);
}

function arg(name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

/**
 * Terminal path. DELIBERATELY NOT `process.exit()`, for two reasons that both
 * bit:
 *
 *  - `process.exit()` does not flush pending stdout writes, and stdout to a PIPE
 *    is async, so the report branches printed nothing at all under execFileSync
 *    while looking fine in a terminal;
 *  - `process.exit()` also kills PENDING TIMERS, which is how `--floor` and
 *    `--self-test` -- the two things CI runs -- ended up outside the late-fault
 *    guard entirely: a 900ms fault in a real `right` form never got the chance
 *    to happen, and the run reported "floor clean".
 *
 * Setting the code and returning lets the loop drain naturally: pending timers
 * fire, faults are recorded, and the exit guard has something to see. A clean
 * run has nothing pending and exits immediately, so this costs nothing.
 */
function finish(code) {
  completed = true;
  process.exitCode = code;
}

/**
 * A SILENT EXIT 0 MUST NEVER LOOK LIKE SUCCESS. With a persistent
 * `uncaughtException` handler installed, a bug in this script's own async path
 * rejects a promise, gets swallowed by that handler, and leaves the event loop
 * to empty -- the process then exits 0 having printed nothing. That happened
 * once, during this round, and it is exactly the failure mode this branch keeps
 * finding. Every terminal path sets `completed`; anything else is a failure.
 */
let completed = false;
/**
 * Paths this process CREATED, and nothing else. `--out` is `mkdir -p`'d, so a
 * pre-existing directory is accepted, and the first version of the late-fault
 * guard did `rmSync(out, { recursive: true })` -- which destroys whatever was
 * already there. `--out .` would have taken the repository with it. Only these
 * entries are ever removed.
 */
let createdEntries = [];
/** Faults recorded after this mark are LATE: the floor already gave its verdict. */
let floorMark = Infinity;

process.on('exit', () => {
  // Wrapped, all of it. A throw inside an `exit` listener is swallowed by the
  // persistent `uncaughtException` handler, which aborts the REST of this
  // listener -- so a failed rmSync used to skip the `console.error` and the
  // exit code below it, and the run exited 0 with the pack still on disk. That
  // is the exact silent-success mode this guard exists to prevent.
  try {
    if (!completed) {
      console.error(
        '✗ acceptance-pack: the run ended without reaching a terminal path — it neither packed, listed, nor reported. Treat this as a failure, not an empty result.',
      );
      process.exitCode = process.exitCode || 1;
    }
    const late = floorMark === Infinity ? [] : faultsSince(floorMark);
    if (!late.length) return;

    // EXIT CODE FIRST. Anything below can throw; the verdict must not depend on
    // whether cleanup succeeded.
    process.exitCode = 1;
    console.error(
      `✗ acceptance-pack: ${late.length} fault(s) arrived after the floor's verdict — ${late.map((f) => f.error).join('; ')}.`,
    );
    const failures = [];
    for (const entry of createdEntries) {
      try {
        rmSync(entry, { recursive: true, force: true });
      } catch (err) {
        failures.push(`${entry}: ${err && err.message ? err.message : err}`);
      }
    }
    if (failures.length) {
      console.error(
        `✗ acceptance-pack: AND THE PACK COULD NOT BE REMOVED — ${failures.join('; ')}. There is a pack on disk from a run that FAILED; delete it by hand before anyone reads it.`,
      );
    } else if (createdEntries.length) {
      console.error(`✗ acceptance-pack: removed ${createdEntries.join(', ')} — a pack must never outlive a run that failed.`);
    }
  } catch (err) {
    // Last resort: never let this listener fail silently.
    process.exitCode = 1;
    try {
      console.error(`✗ acceptance-pack: the exit guard itself failed: ${err && err.message ? err.message : err}`);
    } catch {
      /* nothing left to try */
    }
  }
});

// A pathological `right` form (a very long timer, an interval the floor could
// not clear) must not hang CI. Unref'd, so it never keeps the loop alive by
// itself -- it only fires if something ELSE is still holding it open.
const watchdog = setTimeout(() => {
  console.error(
    '✗ acceptance-pack: still running 30s after the work finished — something the catalog scheduled is holding the event loop open. Failing rather than hanging.',
  );
  process.exitCode = 1;
  process.exit(1);
}, 30_000);
watchdog.unref();

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
      `export { listFabrications } from ${JSON.stringify(join(CATALOG_DIR, 'fabrications.ts'))};`,
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

/**
 * SCORING LINES ARE AN ANSWER KEY, and one of them is quoted verbatim inside an
 * invariant `statement` (kit-parses-consumer-fetches names S2's scoring line to
 * explain where the uncovered half is measured). The statements are reproduced
 * verbatim in the pack on purpose -- rewriting authored prose would create an
 * unpinned copy of the record -- so the leak is closed mechanically instead, at
 * render time, over EVERY scenario's lines rather than the one that happened to
 * be noticed. Nothing is lost here: the sentence before the quote already tells
 * the agent to import the wire reader.
 */
function redactScoringLines(text, scenarios) {
  let out = text;
  for (const s of scenarios) {
    for (const line of s.scoring) {
      out = out.split(line).join('[scoring criterion withheld from this pack]');
    }
  }
  return out;
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
2. **DELIVERY.md** — how to install, load and register the kit. Read this before
   writing any import or script tag; the specifiers are not guessable.
3. **ELEMENTS.md** — the index of all ${derived.elements.length} elements, one line each. **Open only the
   element pages you actually need** (\`elements/<tag>.md\`). There are
   ${elementPageCount} of them and reading them all is a waste of your context.
4. **SHARED-PROPS.md** — the props every element has. They are listed once here
   and NOT repeated on the ${elementPageCount} element pages.
5. **INVARIANTS.md** — the rules that break real consumers. Each carries a
   wrong/right code pair. Apply these; they are not style advice.
6. **RECIPES.md** — proven compositions, with the host wiring written out.
7. **PARTS.md**, **INTEGRATIONS.md**, **THEME.md**, **INVENTORY.md** — reference,
   open as needed.
8. **SELF-AUDIT.md** — run this over your own output **before you deliver**.
9. **FABRICATED.md** — components other agents have invented that do not exist.

## These lists are EXHAUSTIVE

This is the part that matters most, so it is repeated on each list page:

- **ELEMENTS.md is every custom element this kit defines** — all
  ${derived.elements.length} of them. If a tag is not in that list, **it does not
  exist**. There is no larger catalog elsewhere.
- **PARTS.md is every \`MessagePart\` variant the wire can represent** —
  ${derived.partVariants.length} of them. A part with any other \`type\` cannot be
  produced, parsed or rendered.
- **DELIVERY.md is every entry point the package publishes.** An import
  specifier that is not on that page does not resolve.
- The props, events, methods, slots and CSS parts on an element page are that
  element's complete API. There are no undocumented ones.

**So if this task needs something that is not here, say so and stop.** Inventing
a plausible \`<kai-…>\` tag, prop, event or import path is the single worst
outcome: it compiles in the reader's head, renders nothing in a browser, and
costs more to diagnose than an honest refusal. Naming what is missing is a
correct and useful answer.

## The shape of this kit, in four sentences

Web components prefixed \`kai-\`, Shadow DOM, framework-agnostic. Arrays,
objects and functions go on the element as **JS properties**; only scalars work
as attributes. Events are **non-bubbling \`kai-*\` CustomEvents** — listen on the
element that dispatches them. There is no store: the **host** wires element A's
event to element B's property.
`;
}

/**
 * Every `exports` key gets a line, and a key with no entry here is a HARD
 * FAILURE rather than a silent omission -- the failure mode this page exists to
 * fix was an entry point nobody wrote down. `agent: false` keeps a key out of
 * the agent's page (tooling manifests it has no use for) while still requiring
 * it to be accounted for.
 */
const EXPORT_NOTES = {
  '.': { agent: true, what: 'The SolidJS components, for a Solid app. Not needed to use the web components.' },
  './elements': { agent: true, what: 'Registers **every** `kai-*` element as a side effect. The simple default; also the file a CDN serves.' },
  './elements/*': { agent: true, what: 'One element at a time, e.g. `@kitn.ai/ui/elements/chat` — a bundler then tree-shakes the rest away.' },
  './autoloader': { agent: true, what: 'Opt-in DOM autoloader: watches the document and imports each element on demand as a `<kai-*>` tag appears.' },
  './theme.css': { agent: true, what: 'The design-token stylesheet. Import it through a build that runs Tailwind over it, or link it directly on a no-build page.' },
  './theme.tokens.css': { agent: true, what: 'The pre-built token sheet — plain CSS custom properties, no Tailwind step required.' },
  './react': { agent: true, what: 'Typed React wrappers (`Chat`, `Message`, …) plus `useKaiChat`. Sets array/object props for you as properties.' },
  './solid': { agent: true, what: 'The SolidJS entry with the server build wired up.' },
  './state': { agent: true, what: 'I/O-free helpers over `ChatMessage[]`: `createAssistantStream`, `appendTextPart`, `upsertToolPart`.' },
  './wire': { agent: true, what: 'The model-stream adapter: `readOpenAIStream` / `readAnthropicStream` / `readModelStream` parse provider SSE; `toOpenAIMessages` / `toAnthropicMessages` encode the thread back.' },
  './provider': { agent: true, what: 'The remote-provider element bundle.' },
  './schemas': { agent: true, what: 'The generative-UI card schemas.' },
  './schemas/*': { agent: true, what: 'One card schema JSON file at a time.' },
  './element-meta.json': { agent: false, what: 'Tooling manifest of every element API. This pack is rendered from it.' },
  './icon-names.json': { agent: false, what: 'Tooling manifest of icon names.' },
  './package.json': { agent: false, what: 'The manifest itself.' },
};

function renderDelivery({ pkg, kitVersion, derived, solidExports }) {
  const keys = Object.keys(pkg.exports ?? {});
  const missing = keys.filter((k) => !EXPORT_NOTES[k]);
  if (missing.length) {
    fail(
      `package.json publishes exports key(s) ${missing.join(', ')} with no entry in EXPORT_NOTES, so DELIVERY.md would not mention them. An entry point the pack does not name is one the agent has to guess.`,
    );
  }
  const dangling = Object.keys(EXPORT_NOTES).filter((k) => !keys.includes(k));
  if (dangling.length) fail(`EXPORT_NOTES describes ${dangling.join(', ')}, which package.json no longer exports.`);

  const rows = keys
    .filter((k) => EXPORT_NOTES[k].agent)
    .map((k) => `| \`@kitn.ai/ui${k === '.' ? '' : k.slice(1)}\` | ${EXPORT_NOTES[k].what} |`)
    .join('\n');

  // The CDN path is the `./elements` target, read from the exports map rather
  // than typed: it is `dist/kai.es.js` today and that is not this file's fact to
  // remember. The version is read from package.json for the same reason, and
  // because a hand-typed pin is what `lint:cdn-pins` exists to catch.
  const elementsTarget = (pkg.exports['./elements']?.default ?? '').replace(/^\.\//, '');
  const themeTarget = (pkg.exports['./theme.css'] ?? '').replace(/^\.\//, '');

  return `# Delivery — installing, loading and registering

Nothing in this kit works until the elements are **registered**. Registration is
a side effect of importing an entry point; there is no \`init()\` to call.

## Install (bundler / npm)

${fence('npm install @kitn.ai/ui', 'bash')}

SolidJS consumers also need the peer dependency \`solid-js\`. Everyone else needs
nothing further — the built bundle ships in the package, so there is nothing to
compile.

## Entry points

**This table is the complete published surface.** An import specifier that is
not on it does not resolve, whatever it looks like.

| specifier | what it is |
| --- | --- |
${rows}

## Registering the elements

Three ways, all client-side:

${fence(
  [
    "import '@kitn.ai/ui/elements';        // registers every element — the simple default",
    "import '@kitn.ai/ui/elements/chat';   // one element; the bundler drops the rest",
    "import '@kitn.ai/ui/autoloader';      // loads each element on demand as its tag appears",
  ].join('\n'),
  'js',
)}

Registration is **asynchronous** (it is gated behind a browser check so the
module is inert during SSR), so a property set immediately after the import can
land before the element upgrades and be lost. Wait for the registry:

${fence("await customElements.whenDefined('kai-chat');\nchat.messages = messages;", 'js')}

\`elementsReady\` from \`@kitn.ai/ui/elements\` is a promise that resolves once
every element is registered — await that instead if you are setting properties
on several elements at once. See \`upgrade-race\` in INVARIANTS.md.

## No build step: a script tag

The element bundle is a self-contained **ES module**, so it loads over
\`<script type="module">\` with no bundler and no install:

${fence(
  `<script type="module">
  import 'https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${kitVersion}/${elementsTarget}';
  // …or unpkg: import 'https://unpkg.com/@kitn.ai/ui@${kitVersion}/${elementsTarget}';

  await customElements.whenDefined('kai-chat');
  const chat = document.querySelector('kai-chat');
  chat.messages = [{ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] }];
</script>

<kai-chat></kai-chat>`,
  'html',
)}

**Pin the exact version, as above.** An unpinned CDN URL tracks the latest
release, and a CDN fetch — unlike \`npm install\` — warns you about nothing when
the version it serves has been deprecated. \`${kitVersion}\` is the version this
pack was generated from.

To override design tokens on a no-build page, add the stylesheet:

${fence(`<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${kitVersion}/${themeTarget}">`, 'html')}

## React

${fence("import { Chat, useKaiChat } from '@kitn.ai/ui/react';", 'tsx')}

The wrappers set array and object props as JS **properties** for you, which is
the mistake \`props-not-attributes\` describes. Everything else in this pack
still applies: the events are the same non-bubbling \`kai-*\` events, and the
reactivity rule is unchanged.

## Vue, Svelte, Angular, plain HTML

Import \`@kitn.ai/ui/elements\` once, then use the tags directly. There are no
per-framework wrappers beyond React. In a template, remember that only scalars
can be bound as attributes — arrays, objects and functions must be assigned to
the element instance in code.

## Styling

${fence("import '@kitn.ai/ui/theme.css';", 'js')}

Import that through a build that runs **Tailwind** over it: the file carries a
Tailwind \`@theme\` block, and a bundler that ships it raw to a browser discards
that block. On a page with no build step use the \`<link>\` above, or
\`@kitn.ai/ui/theme.tokens.css\`, which is the pre-built plain-CSS token sheet.
The token names are in THEME.md.

## The Solid component names on the element pages

Each element page names the SolidJS component it wraps (\`ChatThread\`,
\`Conversations\`, …). **Those names are provenance, not import paths.** Of the
${solidExports.total} names that appear, ${solidExports.exported} are also exported from
\`@kitn.ai/ui\` for SolidJS consumers and ${solidExports.internal} are internal and
cannot be imported at all. The element pages mark which is which. If you are not
writing a Solid app, ignore them entirely and use the \`kai-*\` tag.
`;
}

function renderElementIndex({ derived, meta, universal, intents, capabilityOf }) {
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
      return `| [\`${e.tag}\`](elements/${e.tag}.md) | ${intents.get(e.tag) ?? '—'} | ${capabilityOf.get(e.tag) ?? '—'} | ${props} | ${e.events.length} | ${e.methods.length} | ${slots} | ${e.parts.length} |`;
    });

  return `# Elements — the complete index

**This list is EXHAUSTIVE.** These ${derived.elements.length} tags are every
custom element \`@kitn.ai/ui\` defines. **If a tag is not on this list, it does
not exist** — do not write it, do not import it, do not assume a sibling of one
that is here. If the task needs one that is missing, say so.

Counts below exclude the shared props in [SHARED-PROPS.md](SHARED-PROPS.md),
which every element also has.

**On the "what it is" column, read this before trusting a blank.** Only
${intents.size} of these ${derived.elements.length} elements carry a curated
one-line description upstream, so most rows show \`—\`. A blank means *nobody has
written one*, never *this element is unimportant*. The counts and the capability
group are the other signals; if you are choosing between two candidates, open
both pages rather than guessing from the name.

Open a row's page for its full API. Do not open pages you do not need.

| element | what it is | capability group | props | events | methods | slots | CSS parts |
| --- | --- | --- | --: | --: | --: | --: | --: |
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

function renderElementPage({ el, m, universal, solidExported, tokenFor }) {
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

  // The element's own token names are the sheet's INTERNAL aliases
  // (`--color-sidebar`), which read from the consumer-settable `--kai-` name.
  // Printing the internal one would contradict THEME.md and make the pack's own
  // self-audit fire on correct code, so the consumer-settable name is what is
  // printed and the alias is named as an alias.
  const tokens = (el.tokens ?? []).map((t) => `- \`${tokenFor(t)}\`  _(the sheet's internal alias for this is \`${t}\`; set the \`--kai-\` name)_`);

  const solid = (el.composedFrom ?? []).map(
    (n) => `\`${n}\`${solidExported.has(n) ? ' (also exported from `@kitn.ai/ui` for SolidJS)' : ' (internal — not importable)'}`,
  );

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

${solid.length ? `Solid source: ${solid.join(', ')}. Provenance, not an import path — see [../DELIVERY.md](../DELIVERY.md).\n` : ''}
This page is this element's **complete** API. Anything not listed does not exist
on it. Every element also has the props in
[../SHARED-PROPS.md](../SHARED-PROPS.md), which are not repeated here.

Registering the tag: [../DELIVERY.md](../DELIVERY.md).

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
these pairs into a searchable checklist you can run mechanically.

${blocks.join('\n\n---\n\n')}
`;
}

/**
 * The recall breakdown, GENERATED from the per-needle tier annotation rather
 * than written out beside it. The hand-written version drifted twice -- a needle
 * filed as surviving anything that a rename measurably kills, and one in no tier
 * at all -- and a guard that only caught an OMITTED needle could not see a
 * MISPLACED one. Each tier's promise is machine-checked against the transform
 * corpora in audit-needles.mjs before the pack is written, so what this prints
 * is a measured claim, not a restatement.
 */
function renderRecallTiers() {
  const of = (tier) => Object.values(NEEDLE_TABLE).filter((r) => r.tier === tier);
  const list = (recs) => recs.map((r) => `\`${r.needle}\``).join(', ');
  const notes = Object.values(NEEDLE_TABLE)
    .filter((r) => r.note)
    .map((r) => `- \`${r.needle}\` — ${r.note}.`)
    .join('\n');
  return `Recall varies by item, and here is exactly how far each one goes. Both tiers
below are checked against re-spellings of their own mistake before this page is
written, in both directions — a needle that quietly stopped earning its tier
fails the build rather than over-promising here.

1. **Survives renaming your variables** — ${list(of('rename-proof'))}. Quote
   style, trailing semicolons and the surrounding variable names are all
   irrelevant: the needle is the operation itself.
2. **Survives quote style and semicolons, but names one specific token** —
   ${list(of('literal-bound'))}. Spell that token differently — a variable where
   the literal is, a different name for the receiver — and it goes quiet.

${notes ? `Two of those are near-verbatim by design:\n\n${notes}\n` : ''}
None of them survive a rewrite into a template literal.`;
}

function renderSelfAudit({ selfAuditItems, derived }) {
  const items = selfAuditItems
    .map(
      (it, n) => `### ${n + 1}. \`${it.invariant}\`

Search your output for ${it.variants.length > 1 ? '**either** of these' : 'this'}:

${fence(it.variants.join('\n'), 'text')}

**Expected hits: 0.** The full mistake it comes from:

${fence(it.search, 'text')}

If you find it, use this instead:

${fence(it.replaceWith)}
`,
    )
    .join('\n');

  return `# Self-audit — run this on your own output before you deliver

Two kinds of check. Both are mechanical: do not reason about whether your code
"feels right", **search it**.

## Part 1 — searches

Each item is a string that must not appear in what you produced. Every one has
been machine-checked against this catalog: it appears in the mistake it comes
from, and in **none** of the recommended forms — in either quote style — so a hit
is a real finding, not a style opinion. Where an item lists two strings they are
the same needle spelled with single and with double quotes; **check both**.

${renderRecallTiers()}

**Zero hits does not mean correct; a hit means definitely wrong.** Part 2 is the
half that does not depend on spelling.

${items}

## Part 2 — checks over the catalog's own lists

These need no needle. Run each over your finished output.

1. **Every \`kai-…\` tag you wrote must appear in ELEMENTS.md.** Extract every
   tag matching \`kai-[a-z-]+\` from your output and look each one up in the
   index. There are ${derived.elements.length} legal tags. A tag that is not on
   that list does not exist, and shipping it is worse than not answering — go
   back and say what is missing instead.
2. **Every \`@kitn.ai/ui…\` import specifier you wrote must appear in
   DELIVERY.md.** That table is the complete published surface; anything else
   fails to resolve at install time, which is the most expensive place to find
   out.
3. **Every prop you set must appear on that element's page.** Not on a different
   element's page: props are not shared between elements except the ones in
   SHARED-PROPS.md.
4. **Every prop you set as an ATTRIBUTE must be marked settable as an attribute
   on that page.** Anything marked "JS property only" must be assigned:
   \`el.prop = value\`.
5. **Every event you listen for must be listed on the element you attached the
   listener to.** Not on a parent, not on \`document\` — except for the protocol
   exceptions listed in INVARIANTS.md under \`events-non-bubbling\`.
6. **Every \`MessagePart\` you construct must use a \`type\` from PARTS.md.**
   There are ${derived.partVariants.length}: ${derived.partVariants.map((v) => `\`${v}\``).join(', ')}.
7. **Every CSS custom property you set must appear in THEME.md**, spelled with
   the \`--kai-\` prefix.
8. **You imported no SSE parsing of your own.** If your output reads
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
- **Delivery:** ${r.targets.join(', ')} — see [DELIVERY.md](DELIVERY.md) for the entry point that target uses.
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

function renderTheme({ tokens, droppedFragments }) {
  return `# Theme tokens

**This list is EXHAUSTIVE.** These ${tokens.length} CSS custom properties are
every token the kit reads. Setting one that is not on this list does nothing.

Set them on a host element or on \`:root\`; they cross the shadow boundary
because custom properties inherit. Do not reach into a shadow root and do not
style by internal class name — use the \`::part()\` names on each element page.

An element page may also name the sheet's **internal alias** for a token (e.g.
\`--color-sidebar\`). Set the \`--kai-\` name from this list; the alias reads from
it and is not something you assign.

${tokens.map((t) => `- \`${t}\``).join('\n')}
${
  droppedFragments.length
    ? `\n---\n\n_${droppedFragments.length} entr${droppedFragments.length === 1 ? 'y' : 'ies'} in the upstream token extraction (${droppedFragments
        .map((t) => `\`${t}\``)
        .join(', ')}) are prefix fragments rather than token names — a defect in the generator, not tokens you can set. They are omitted here so this list stays true to the word EXHAUSTIVE._`
    : ''
}`;
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

// The page is rendered by scripts/lib/fabrications.mjs from the authored record
// in src/agent-tooling/catalog/fabrications.ts -- the write-back path this page
// did not have. Both states (empty, populated) are tested directly against that
// renderer, which is why the rendering does not live here: with the record empty
// today, a test through the packer could only ever exercise one of them.
function renderFabricated(fabrications) {
  return renderFabricatedPage(fabrications);
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

Every \`examples[].right\` in the catalog was executed against the stand-ins
named in [FLOOR.md](FLOOR.md) before this pack was written; ${floor.results.length}
examples, ${floor.results.filter((r) => r.status === 'passed').length} passed.
None of them ran against the kit's real registered elements — read FLOOR.md
before treating a green floor as a statement about the shipped components.
`;
}

function renderFloorReport(floor, specifiers) {
  const stubbed = floor.results.filter((r) => r.stubs.length);
  return `# Floor stage report

Every \`examples[].right\` form in the invariant records was EXECUTED before this
pack was written, and where the example makes a behavioural claim the claim was
asserted. If the catalog's own recommended code does not run, nothing measured
downstream of it is worth anything.

**Read the stand-ins column as part of the result, not as a footnote.** This is a
Node script: it has no browser and no built element bundle, so **no example ran
against a real registered \`kai-*\` element.** What ran is the fragment, against
the stand-ins listed below. Where a stand-in is the SUBJECT of the claim, the row
carries a corroboration that checks the real thing by another route.

${floor.results.length} examples, ${floor.results.filter((r) => r.status === 'passed').length} passed, ${floor.results.filter((r) => r.status !== 'passed').length} not.

\`\`\`
${formatFloor(floor)}
\`\`\`

## Stand-ins, per example

${
  stubbed.length
    ? stubbed
        .map(
          (r) =>
            `- **${r.key}** — ${r.stubs.join('; ')}.${r.corroboration ? ` Corroborated by another route: ${r.corroboration}.` : ''}`,
        )
        .join('\n')
    : '_No row declares a stand-in._'
}

${
  floor.results.length === stubbed.length
    ? '_Every row declares at least one stand-in._'
    : `_${floor.results.length - stubbed.length} row(s) declare none: ${floor.results
        .filter((r) => !r.stubs.length)
        .map((r) => r.key)
        .join(', ')}._`
}

## Async faults: what is covered, and where the bound is

A fragment can fail after it returns three ways, and all three are trapped: an
unhandled rejection from a \`.then\`, an uncaught exception from a timer, and a
throw inside a **DOM event listener** — which is neither of the first two,
because jsdom routes a listener's exception to its virtual console where no
process-level handler sees it.

Blame is assigned STRUCTURALLY, not by the clock. A timer a fragment schedules is
owned by the case that scheduled it, however late it fires, because attributing
by "which case was running when it landed" sends the reader to correct code — a
50ms timer, or a chain of nested 0ms ones, lands inside the next example's
window. A rejection CREATED inside such a timer is owned the same way: the
window stays set across the callback and one macrotask beyond it, which is where
\`unhandledRejection\` fires.

**The residual, measured rather than assumed:** a rejection created somewhere no
case owns — a \`.then\` on a promise the harness itself made, resolving after
its case's drain — is still attributed by arrival. It fails the run either way;
what it can get wrong is which example it names.

A rejection that gets a handler shortly afterwards is **retracted** and is not a
failure at all, so a pack is never destroyed over a run that did nothing wrong.

The bound is time, not route. Each case is drained to quiescence, then the run
settles for **${SETTLE_MS}ms** before the floor gives a verdict; a fault inside
that window means **zero files written**. A fault later than it cannot be waited
for, so it is handled the other way round: a process-exit guard **removes the
pack** and exits non-zero, because a pack on disk must never outlive a run that
failed.

## Import specifiers the pack names

${specifiers.checked.length ? specifiers.checked.map((c) => `- \`${c}\``).join('\n') : '_None._'}

${
  specifiers.unchecked.length
    ? `**UNCHECKED — read this as a gap, not as a pass:**\n\n${specifiers.unchecked.map((u) => `- ${u}`).join('\n')}`
    : '_Every symbol named above was resolved against its source barrel; nothing was skipped._'
}
`;
}

// ---------------------------------------------------------------------------
// Cross-checks over the rendered pack
// ---------------------------------------------------------------------------

/**
 * Every `@kitn.ai/ui…` specifier the pack NAMES must resolve through the
 * published exports map, and every symbol it recommends importing from one must
 * actually be exported.
 *
 * This is the Task-5 class recurring: a `right` form recommending an import that
 * a consumer cannot reach. The floor's per-harness corroboration covered
 * `./wire` and nothing else, so `createAssistantStream from '@kitn.ai/ui/state'`
 * -- named twice in prose that ships in the pack -- was unchecked. Deriving the
 * subpath from the text rather than listing subpaths means a note naming a new
 * one is covered the day it is written.
 */
/**
 * Where each published subpath's SOURCE barrel lives, so the symbol half of the
 * check can resolve it. Not `src/<sub>/index.ts` by convention: review found
 * that convention silently skipping five subpaths -- react, elements, solid,
 * provider, autoloader -- which is to say `Chat`, `useKaiChat` and
 * `elementsReady`, exactly what S1 and S5 lean on. A silent `continue` is the
 * shape this branch has spent the week deleting, so anything not resolved here
 * is REPORTED as unchecked rather than passed over.
 */
const SUBPATH_SOURCES = {
  '.': 'src/index.ts',
  elements: 'src/elements/register.ts',
  solid: 'src/solid.ts',
  state: 'src/state/index.ts',
  wire: 'src/wire/index.ts',
  schemas: 'src/schemas/index.ts',
  react: 'frameworks/react/index.tsx',
  provider: 'src/remote/provider.ts',
  autoloader: 'src/elements/autoloader.ts',
};

const specOf = (sub) => (sub === '.' ? '@kitn.ai/ui' : `@kitn.ai/ui/${sub}`);

function verifySpecifiers(text, pkg, readSource) {
  const problems = [];
  const unchecked = [];
  const keys = new Set(Object.keys(pkg.exports ?? {}));
  const resolves = (spec) => {
    const sub = spec === '@kitn.ai/ui' ? '.' : `.${spec.slice('@kitn.ai/ui'.length)}`;
    if (keys.has(sub)) return true;
    // Wildcard keys: `./elements/*`, `./schemas/*`.
    return [...keys].some((k) => k.endsWith('/*') && sub.startsWith(k.slice(0, -1)));
  };

  const specifiers = new Set([...text.matchAll(/@kitn\.ai\/ui(?:\/[a-zA-Z0-9._*-]+)*/g)].map((m) => m[0]));
  if (specifiers.size === 0) problems.push('the pack names no @kitn.ai/ui specifier at all, which cannot be right.');
  for (const spec of specifiers) {
    if (!resolves(spec)) problems.push(`the pack names ${spec}, which is not in the package exports map.`);
  }

  // `import { a, b } from '@kitn.ai/ui/x'` and the prose form `Name from '@kitn.ai/ui/x'`,
  // plus the bare-package forms for the Solid entry.
  const named = [
    ...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@kitn\.ai\/ui(?:\/([a-z]+))?['"]/g),
  ].flatMap((m) => m[1].split(',').map((n) => [n.trim(), m[2] ?? '.']));
  named.push(
    ...[...text.matchAll(/([A-Za-z_$][\w$]*)\s+from\s+['"]@kitn\.ai\/ui(?:\/([a-z]+))?['"]/g)].map((m) => [
      m[1],
      m[2] ?? '.',
    ]),
  );
  // The markdown prose form: BOTH the symbol and the specifier in backticks.
  // Requiring backticks on the symbol too is what keeps this from resolving
  // ordinary English -- "exported from `@kitn.ai/ui`" would otherwise be read as
  // a symbol named `exported` and reported as a missing export.
  named.push(
    ...[...text.matchAll(/`([A-Za-z_$][\w$]*)`\s+from\s+`@kitn\.ai\/ui(?:\/([a-z]+))?`/g)].map((m) => [
      m[1],
      m[2] ?? '.',
    ]),
  );

  const sourceCache = new Map();
  for (const [name, sub] of named) {
    if (!name) continue;
    const rel = SUBPATH_SOURCES[sub];
    if (!rel) {
      // LOUD, not skipped. This is the honest state of the check, and it is
      // printed and written into the floor report.
      const note = `${specOf(sub)} — no source barrel is mapped, so \`${name}\` was NOT checked`;
      if (!unchecked.includes(note)) unchecked.push(note);
      continue;
    }
    if (!sourceCache.has(sub)) sourceCache.set(sub, readSource(rel));
    const src = sourceCache.get(sub);
    if (src === undefined) {
      const note = `${specOf(sub)} — ${rel} is unreadable, so \`${name}\` was NOT checked`;
      if (!unchecked.includes(note)) unchecked.push(note);
      continue;
    }
    // `export type { … }` counts. It did not until the markdown-prose pattern
    // above started finding real type names in element-meta descriptions, and
    // four correctly-exported card types were reported missing -- a widening
    // that immediately exposed a hole in the narrower check beside it.
    if (
      !new RegExp(`export (?:type )?(?:\\{[^}]*\\b${name}\\b[^}]*\\}|(?:const|function|class|type|interface) ${name}\\b)`, 's').test(src)
    ) {
      problems.push(`the pack recommends \`${name}\` from \`${specOf(sub)}\`, but ${rel} does not export it.`);
    }
  }
  return { problems, unchecked, checked: [...new Set(named.map(([n, s]) => `${n} (${s})`))].sort() };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
const catalog = await importCatalog();
const scenarios = catalog.listScenarios();

if (args.includes('--list')) {
  for (const s of scenarios) console.log(`${s.id}  ${s.depth}`);
  return finish(0);
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
  defineSource: readFileSync(join(ROOT, 'src/elements/define.tsx'), 'utf8'),
  exportsKeys: Object.keys(pkg.exports ?? {}),
};

const readSubpathSource = (relPath) => {
  try {
    return readFileSync(join(ROOT, relPath), 'utf8');
  } catch {
    return undefined;
  }
};

if (args.includes('--self-test')) {
  const r = await selfTest(helpers);
  for (const [what, ok] of r.expectations) console.log(`${ok ? '✓' : '✗'} ${what}`);
  const needleResults = selfTestNeedles();
  for (const [what, ok] of needleResults) console.log(`${ok ? '✓' : '✗'} needle check: ${what}`);
  const needleFailed = needleResults.filter(([, ok]) => !ok).map(([what]) => what);
  if (!r.ok || needleFailed.length) {
    fail(`the pack's own positive controls failed:\n  - ${[...r.failed, ...needleFailed].join('\n  - ')}`);
  }
  console.log('✓ acceptance-pack: every planted fault was detected.');
  // The mark is set even on the verification paths: a late fault in --floor or
  // --self-test is exactly as much a failure as one during a pack, and those two
  // are what CI runs.
  floorMark = faultCount();
  return finish(0);
}

const invariants = catalog.listInvariants();
const floor = await runFloor(invariants, helpers);
if (args.includes('--floor')) {
  console.log(formatFloor(floor));
  if (!floor.ok) fail(`${floor.errors.length} floor failure(s). The catalog's own recommended code does not run.`);
  console.log(`✓ acceptance-pack: floor clean — ${floor.results.length} examples executed.`);
  floorMark = floor.mark;
  return finish(0);
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

assertArtifactsAgree(derived.elements, meta);

const needleProblems = verifyNeedles(invariants);
if (needleProblems.length) {
  fail(`the self-audit needles are unsound, so nothing was packed:\n  - ${needleProblems.join('\n  - ')}`);
}

const metaByTag = new Map(meta.map((m) => [m.tag, m]));

// A prop is universal when element-meta.json flags it so -- the flag is set by
// the generator, not inferred here. Cross-checked against the derived spine:
// a "universal" prop missing from any element would make the dedup a lie, and
// dropping the row from every page while it is absent from one is worse than
// not deduping at all.
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

// THEME TOKENS. Three entries in the upstream extraction are PREFIX FRAGMENTS
// (`--kai-color-`, …) rather than token names: an artifact of the Task 3
// generator's scan, not something a consumer can set. A page headed EXHAUSTIVE
// must not list them, so they are filtered here and NAMED on the page as an
// upstream defect rather than silently dropped.
const droppedFragments = derived.themeTokens.filter((t) => t.endsWith('-'));
const themeTokens = derived.themeTokens.filter((t) => !t.endsWith('-'));

// An element's `tokens` are the sheet's internal aliases (`--color-sidebar`),
// which read from the consumer-settable `--kai-` name. Map each to the name a
// consumer actually sets, and fail loudly if one has no counterpart rather than
// printing a token the self-audit would then flag.
const themeTokenSet = new Set(themeTokens);
const tokenFor = (alias) => {
  const prefixed = alias.startsWith('--kai-') ? alias : `--kai-${alias.slice(2)}`;
  if (!themeTokenSet.has(prefixed)) {
    fail(
      `element token ${alias} has no consumer-settable counterpart ${prefixed} in the theme token list, so the element page and THEME.md would contradict each other.`,
    );
  }
  return prefixed;
};

// Which Solid component names are importable, so the element pages can say.
const solidBarrel = readFileSync(join(ROOT, 'src/index.ts'), 'utf8');
const solidExported = new Set(
  [...solidBarrel.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) =>
    m[1]
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/).pop())
      .filter(Boolean),
  ),
);
const allSolidNames = [...new Set(derived.elements.flatMap((e) => e.composedFrom ?? []))];
const solidExports = {
  total: allSolidNames.length,
  exported: allSolidNames.filter((n) => solidExported.has(n)).length,
  internal: allSolidNames.filter((n) => !solidExported.has(n)).length,
};

// The only curated per-element one-liners in the tree. There are very few; the
// index says how few rather than implying the blanks mean anything.
const intents = new Map(
  [...readFileSync(join(ROOT, 'llms.txt'), 'utf8').matchAll(/^- `<(kai-[a-z0-9-]+)>` — (.+)$/gm)].map((m) => [
    m[1],
    m[2].replace(/\.$/, ''),
  ]),
);
const capabilityOf = new Map(
  derived.capabilityGroups.flatMap((g) => g.components.map((c) => [c, g.id])),
);

const selfAuditItems = invariants.flatMap((inv) =>
  inv.examples.map((ex, index) => ({
    invariant: inv.id,
    index,
    needle: NEEDLES[`${inv.id}#${index}`],
    variants: variantsOf(NEEDLES[`${inv.id}#${index}`]),
    search: ex.wrong,
    replaceWith: ex.right,
    rule: inv.statement,
  })),
);

const recipes = catalog.listSurfaceRecipes();
const inventory = catalog.listInventory();
const partConsumption = catalog.listPartConsumption();

// --- render everything, in memory ------------------------------------------

const agentPages = [];
const elementPages = [];
const judgePages = [];
const addAgent = (name, body) => agentPages.push({ name, body });
const addElement = (name, body) => elementPages.push({ name, body });
const addJudge = (name, body) => judgePages.push({ name, body });

for (const el of derived.elements) {
  addElement(
    `${el.tag}.md`,
    renderElementPage({ el, m: metaByTag.get(el.tag), universal, solidExported, tokenFor }),
  );
}

addAgent('README.md', renderReadme({ scenario, kitVersion, derived, elementPageCount: derived.elements.length }));
addAgent(
  'PROMPT.md',
  `# Your task

${scenario.prompt}

---

Everything you need is in this directory; there is no kit source and no other
documentation. Start from [README.md](README.md), read [DELIVERY.md](DELIVERY.md)
before writing any import, and run [SELF-AUDIT.md](SELF-AUDIT.md) over your
output before you deliver.

If this task cannot be built from what is here, **say that, name what is
missing, and stop**. Do not invent an element, a prop, an event or an import
path to close the gap.
`,
);
addAgent('DELIVERY.md', renderDelivery({ pkg, kitVersion, derived, solidExports }));
addAgent('ELEMENTS.md', renderElementIndex({ derived, meta, universal, intents, capabilityOf }));
addAgent('SHARED-PROPS.md', renderSharedProps({ universal, meta }));
addAgent('INVARIANTS.md', renderInvariants({ invariants, derived }));
addAgent('SELF-AUDIT.md', renderSelfAudit({ selfAuditItems, derived }));
addAgent('RECIPES.md', renderRecipes({ recipes }));
addAgent('PARTS.md', renderParts({ derived, partConsumption }));
addAgent('INTEGRATIONS.md', renderIntegrations({ derived }));
addAgent('THEME.md', renderTheme({ tokens: themeTokens, droppedFragments }));
addAgent('INVENTORY.md', renderInventory({ inventory }));
addAgent('FABRICATED.md', renderFabricated(catalog.listFabrications()));

addJudge('JUDGE.md', renderJudge({ scenario, invariants, recipes, kitVersion, floor }));

// --- cross-check the rendered text, BEFORE writing --------------------------

// Answer-key redaction, over EVERY scenario's lines rather than this one's:
// the leak found in review was S2's line inside an invariant statement, in a
// pack for S1, so a check scoped to the packed scenario could not see it.
for (const page of [...agentPages, ...elementPages]) {
  page.body = redactScoringLines(page.body, scenarios);
}

const agentText = [...agentPages, ...elementPages].map((p) => p.body).join('\n');

const specifiers = verifySpecifiers(agentText, pkg, readSubpathSource);
if (specifiers.problems.length) {
  fail(
    `the pack names import specifiers that do not resolve, so nothing was written:\n  - ${specifiers.problems.join('\n  - ')}`,
  );
}
for (const note of specifiers.unchecked) console.warn(`⚠ acceptance-pack: UNCHECKED specifier — ${note}`);

for (const s of scenarios) {
  for (const line of s.scoring) {
    if (agentText.includes(line)) {
      fail(`${s.id}'s scoring line leaked into the agent's surface after redaction: ${line}`);
    }
  }
}

// The floor report is rendered last so it can carry the specifier check's own
// coverage, including what it could NOT check.
addJudge('FLOOR.md', renderFloorReport(floor, specifiers));

// --- write ------------------------------------------------------------------

const agentDir = join(out, 'agent');
const judgeDir = join(out, 'judge');
// REFUSE a non-empty --out rather than merging into it. Half of the data-loss
// hazard is the removal; the other half is accepting a directory that already
// has someone else's files in it, which is what made the removal dangerous.
if (existsSync(out) && readdirSync(out).length) {
  fail(
    `--out ${out} is not empty. Point it at a new or empty directory: the pack refuses to write into one it does not own, and its cleanup only ever removes what it created.`,
  );
}
mkdirSync(join(agentDir, 'elements'), { recursive: true });
mkdirSync(judgeDir, { recursive: true });
// EXACTLY what this run creates -- never `out` itself, which may have existed.
createdEntries = [agentDir, judgeDir, join(out, 'PACK.md')];
floorMark = floor.mark;

const write = (dir, name, body) => writeFileSync(join(dir, name), body.endsWith('\n') ? body : body + '\n');
for (const p of agentPages) write(agentDir, p.name, p.body);
for (const p of elementPages) write(join(agentDir, 'elements'), p.name, p.body);
for (const p of judgePages) write(judgeDir, p.name, p.body);

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

finish(0);
console.log(
  `acceptance-pack: packed ${scenario.id} into ${out} (agent/: ${elementPages.length} element pages + ${agentPages.length} guides; judge/: ${judgePages.length} reports + catalog.json)`,
);
}

await main();
