// Mechanically find where apps/docs disagrees with the SHIPPED @kitn.ai/ui API.
//
//   node scripts/docs-alignment/index.mjs [options]
//   pnpm --filter @kitn.ai/docs run verify:docs
//
//   --report <path>   write the markdown findings report (default: none)
//   --filter <sub>    only pages whose path contains <sub>
//   --keep            leave the temp compile workspace on disk and print its path
//   --report-only     always exit 0 (for generating a report from a red tree)
//   --verbose         print the self-test log even when it passes
//
// Requires `nx build ui` first: every name it checks against comes from the
// built dist/*.d.ts and from src/elements/element-meta.json, read at run time.
// Nothing is baked in.
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { loadSurface } from './surface.mjs';
import { listDocs, parseDoc } from './extract.mjs';
import { createWorkspace, compileProject, writeShims, bareSpecifiers, chooseWrapper, PROJECTS } from './compile.mjs';
import { checkMarkup, checkCss, checkMdxComponents, counterExampleLines } from './structural.mjs';
import { checkProse, flagForHuman } from './prose.mjs';
import { classifyCompileFinding as classify } from './classify.mjs';
import { coverage } from './coverage.mjs';
import { runSelfTest } from './selftest.mjs';
import { renderReport } from './report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS_APP = resolve(HERE, '../..');
const REPO = resolve(DOCS_APP, '../..');
const UI_ROOT = resolve(REPO, 'packages/ui');
const DOCS_ROOT = resolve(DOCS_APP, 'src/content/docs');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : null;
};

const KEEP = flag('--keep');
const VERBOSE = flag('--verbose');
const REPORT_ONLY = flag('--report-only');
const FILTER = opt('--filter');
const REPORT_PATH = opt('--report');

const die = (msg) => {
  console.error(`\n✗ verify-docs-alignment: ${msg}\n`);
  process.exit(1);
};

// ── Impact ranking. A wrong snippet in getting-started costs a consumer their
//    first ten minutes; a wrong one in an obscure pattern page costs far less.
const SECTION_WEIGHT = {
  '(root)': 100,
  guides: 90,
  'guides/frameworks': 85,
  components: 70,
  integrations: 60,
  'guides/recipes': 55,
  patterns: 40,
  examples: 35,
  theme: 35,
};
const PAGE_BUMP = [
  [/getting-started/, 25],
  [/installation/, 20],
  [/introduction/, 18],
  [/quickstart|first-chat/, 18],
  [/frameworks\/(react|overview)/, 12],
];
function impact(doc) {
  let w = SECTION_WEIGHT[doc.section] ?? 40;
  for (const [re, bump] of PAGE_BUMP) if (re.test(doc.rel)) w += bump;
  return w;
}

const NORMALIZE_LANG = {
  typescript: 'ts', ts: 'ts', tsx: 'tsx', javascript: 'js', js: 'js', jsx: 'jsx',
  html: 'html', vue: 'vue', svelte: 'svelte', css: 'css',
};

/** <script> bodies inside an html block — where docs put their real JS. */
function scriptBodies(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*>\n?([\s\S]*?)<\/script>/g)) {
    const attrs = m[0].slice(0, m[0].indexOf('>'));
    if (/\bsrc=/.test(attrs)) continue;
    if (/type=["'](?!module|text\/javascript|application\/javascript)/.test(attrs)) continue;
    out.push({ body: m[1], offset: html.slice(0, m.index).split('\n').length - 1 + 1 });
  }
  return out;
}

function liftSfcScript(block) {
  const m = block.match(/<script[^>]*>\n?([\s\S]*?)\n?<\/script>/);
  if (!m) return null;
  const before = block.slice(0, m.index).split('\n').length - 1;
  const lines = m[1].split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const pad = indents.length ? Math.min(...indents) : 0;
  // `<script lang="ts">` / `<script setup lang="ts">` IS type-checked in the
  // reader's app, so findings that only bite a TypeScript reader (literal
  // widening) have to gate here the same as in a ```ts fence.
  const typed = /\blang\s*=\s*["']ts["']/.test(m[0].slice(0, m[0].indexOf('>')));
  return { body: lines.map((l) => l.slice(pad)).join('\n'), offset: before + 1, typed };
}

const hasJsx = (code) => /<[A-Z][A-Za-z0-9]*[\s/>]|<>/.test(code);

function pickProject(code, lang, doc) {
  if (lang === 'js' || lang === 'vue' || lang === 'svelte' || lang === 'html-script') return 'loose';
  const specs = bareSpecifiers(code);
  const has = (p) => [...specs].some(p);
  if (specs.has('react') || specs.has('react-dom') || specs.has('@kitn.ai/ui/react')) return 'react';
  if (has((s) => s === 'next' || s.startsWith('next/') || s.startsWith('@tanstack/react'))) return 'react';
  if (has((s) => s === 'solid-js' || s.startsWith('solid-js/') || s.startsWith('@solidjs/'))) return 'solid';
  if (/frameworks\/solid/.test(doc.rel)) return 'solid';
  if (/frameworks\/(react|next|tanstack|remix)/.test(doc.rel)) return 'react';
  // The root entry's components ARE Solid components. A TSX block importing from
  // it with no other framework signal is Solid code.
  if ((lang === 'tsx' || lang === 'jsx') && specs.has('@kitn.ai/ui')) return 'solid';
  return 'react';
}

async function main() {
  if (!existsSync(join(UI_ROOT, 'dist/index.d.ts'))) {
    die('packages/ui/dist/index.d.ts not found. Run `pnpm exec nx build ui` first — this checks the SHIPPED API.');
  }

  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  } catch { /* not a git checkout */ }

  console.log('  · reading the shipped API surface');
  const surface = loadSurface(UI_ROOT);
  console.log(
    `    ${surface.entries.size} entry points, ${[...surface.entries.values()].reduce((n, m) => n + m.size, 0)} exported names, ` +
      `${surface.elements.length} kai-* elements, ${surface.eventNames.size} events`,
  );

  const workspace = createWorkspace(UI_ROOT);
  const cleanup = () => {
    const kept = workspace.cleanup(KEEP);
    if (kept) console.log(`\n  (--keep) compile workspace left at ${kept}`);
  };

  try {
    // ── anti-theatre, before anything is trusted ──────────────────────────
    console.log('  · self-test: probes that MUST fail, and probes that MUST pass');
    const { problems } = runSelfTest({ workspace, surface, uiRoot: UI_ROOT, verbose: VERBOSE });
    if (problems.length) {
      for (const p of problems) console.error(`    ✗ ${p}`);
      cleanup();
      die(`${problems.length} self-test problem(s). The harness is broken, not the docs — fix this before reading any result below.`);
    }
    console.log(`    ✓ all probes behaved: kit drift is detected, reader-owned code is not flagged`);

    // ── parse ────────────────────────────────────────────────────────────
    let files = listDocs(DOCS_ROOT);
    if (FILTER) files = files.filter((f) => f.includes(FILTER));
    const docs = files.map((f) => parseDoc(f, DOCS_ROOT));
    console.log(`  · ${docs.length} pages, ${docs.reduce((n, d) => n + d.blocks.length, 0)} fenced blocks`);

    // ── build compile units ──────────────────────────────────────────────
    const units = [];
    const skipped = [];
    let unitId = 0;
    for (const doc of docs) {
      for (const block of doc.blocks) {
        const lang = NORMALIZE_LANG[block.lang];
        if (!lang) {
          if (block.lang) skipped.push({ doc: doc.rel, lang: block.lang, line: block.fenceLine });
          continue;
        }
        const pieces = [];
        if (lang === 'html') {
          for (const s of scriptBodies(block.code)) pieces.push({ code: s.body, lang: 'html-script', lineOffset: s.offset });
        } else if (lang === 'vue' || lang === 'svelte') {
          const lifted = liftSfcScript(block.code);
          if (lifted) pieces.push({ code: lifted.body, lang, lineOffset: lifted.offset, typed: lifted.typed });
        } else if (lang !== 'css') {
          pieces.push({ code: block.code, lang, lineOffset: 0 });
        }
        for (const piece of pieces) {
          if (!piece.code.trim()) continue;
          const project = pickProject(piece.code, piece.lang, doc);
          const ext = piece.lang === 'tsx' || piece.lang === 'jsx' || hasJsx(piece.code) ? 'tsx' : 'ts';
          const id = `u${String(unitId++).padStart(4, '0')}`;
          // Pick the interpretation the fragment actually parses under before
          // compiling it (whole module / type shape / class member / bare value).
          const wrapper = chooseWrapper(piece.code, ext);
          units.push({
            id,
            doc,
            block,
            lang: piece.lang,
            // What the READER's toolchain checks. Same as `lang` except for an
            // SFC whose <script> declares lang="ts". Drives severity only.
            typedLang: piece.typed ? 'ts' : piece.lang,
            project,
            path: join(workspace.dir(project), `${id}.${ext}`),
            ext,
            opener: wrapper.opener,
            wrapper: wrapper.id,
            code: piece.code + wrapper.closer,
            // Line in the .mdx of this piece's first line.
            docLine: block.startLine + piece.lineOffset,
            importsKit: [...bareSpecifiers(piece.code)].some((s) => surface.isKitSpecifier(s)),
          });
        }
      }
    }
    console.log(`  · ${units.length} compilable snippets across ${new Set(units.map((u) => u.project)).size} tsc projects`);

    // ── compile ──────────────────────────────────────────────────────────
    const allSpecs = new Set();
    for (const u of units) for (const s of bareSpecifiers(u.code)) allSpecs.add(s);
    const shimmed = new Map();
    for (const project of Object.keys(PROJECTS)) shimmed.set(project, writeShims(workspace, project, allSpecs));

    for (const project of ['react', 'solid', 'loose']) {
      const group = units.filter((u) => u.project === project);
      if (!group.length) continue;
      const t0 = Date.now();
      compileProject({ workspace, project, units: group, surface, uiRoot: UI_ROOT });
      console.log(`    ${project}: ${group.length} snippets in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }

    // ── shadow pass ──────────────────────────────────────────────────────
    const shadowPairs = [];
    for (const project of ['react', 'solid', 'loose']) {
      const variants = [];
      for (const u of units.filter((x) => x.project === project)) {
        const v = makeVariant(u, surface);
        if (v) {
          v.path = join(workspace.dir(`shadow-${project}`), `${u.id}.${u.ext}`);
          variants.push(v);
          shadowPairs.push({ original: u, variant: v });
        }
      }
      if (!variants.length) continue;
      compileProject({ workspace, project: `shadow-${project}`, units: variants, surface, uiRoot: UI_ROOT });
    }
    console.log(`  · shadow pass: ${shadowPairs.length} snippets re-declare a kit type`);

    // ── collect findings ─────────────────────────────────────────────────
    const findings = [];
    const add = (doc, f) => findings.push({ ...f, page: doc.rel, section: doc.section, impact: impact(doc) });

    for (const u of units) {
      const negative = counterExampleLines(u.code);
      for (const f of u.findings ?? []) {
        // A snippet the docs explicitly mark as the wrong way to do it.
        if (negative.has(f.line)) continue;
        // Untyped JS / <script> bodies: KIT-origin only. `getElementById('x').messages = …`
        // is right at run time and flagging it is the noise that kills a harness.
        const looseUnit = u.project === 'loose';
        if (looseUnit && !f.origin && !f.syntactic) continue;
        // Kind + severity live in classify.mjs so the self-test can drive them
        // directly. See that file for why widening is gating in a `ts` block and
        // advisory in an untyped one.
        const { kind, severity } = classify(f, u.typedLang ?? u.lang);
        add(u.doc, {
          source: 'compile',
          kind,
          severity,
          code: `TS${f.code}`,
          line: u.docLine + f.line - 1,
          detail: f.message,
          block: { lang: u.lang, project: u.project, fenceLine: u.block.fenceLine },
        });
      }
    }

    for (const { original, variant } of shadowPairs) {
      const introduced = diff(original, variant).filter((f) => f.origin);
      add(original.doc, {
        source: 'shadow',
        kind: introduced.length ? 'incompatible-local-type' : 'redeclared-kit-type',
        severity: introduced.length ? 'high' : 'advisory',
        line: original.docLine,
        detail: introduced.length
          ? `snippet re-declares \`${variant.shadowedNames.join('`, `')}\` — a type @kitn.ai/ui already exports — and is NOT compatible with the real one: ` +
            introduced.map((f) => `TS${f.code} ${f.message}`).join(' || ')
          : `snippet re-declares \`${variant.shadowedNames.join('`, `')}\`, which @kitn.ai/ui already exports (the local copy compiles, but readers learn a type the kit owns)`,
        block: { lang: original.lang, project: original.project, fenceLine: original.block.fenceLine },
      });
    }

    for (const doc of docs) {
      for (const block of doc.blocks) {
        const lang = NORMALIZE_LANG[block.lang];
        if (lang === 'css') {
          for (const f of checkCss({ code: block.code, startLine: block.startLine, surface }))
            add(doc, { source: 'structural', ...f, block: { lang: 'css', fenceLine: block.fenceLine } });
          continue;
        }
        if (!lang) continue;
        for (const f of checkMarkup({ code: block.code, startLine: block.startLine, surface, lang }))
          add(doc, { source: 'structural', ...f, block: { lang, fenceLine: block.fenceLine } });
      }
      for (const f of checkMdxComponents(doc, surface)) add(doc, { source: 'structural', ...f });
      for (const f of checkProse(doc, surface)) add(doc, { source: 'prose', ...f });
    }

    const flags = [];
    for (const doc of docs) for (const f of flagForHuman(doc)) flags.push({ ...f, page: doc.rel, section: doc.section, impact: impact(doc) });

    const cov = coverage(docs, surface);

    // ── report ───────────────────────────────────────────────────────────
    const summary = summarize(findings);
    console.log('');
    console.log(`  ${summary.high} high-confidence finding(s), ${summary.medium} medium, ${summary.advisory} advisory`);
    for (const [kind, n] of summary.byKind) console.log(`    ${String(n).padStart(4)}  ${kind}`);
    console.log(`  reverse coverage: ${cov.undocumentedElements.length} elements with no docs mention, ${cov.undocumentedComponents.length} components never named, ${cov.staleTags.length} stale kai-* tokens, ${cov.staleEntries.length} stale entry points`);
    console.log(`  flagged for human review: ${flags.length} claim(s)`);

    if (REPORT_PATH) {
      const out = resolve(REPO, REPORT_PATH);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(
        out,
        renderReport({ findings, flags, coverage: cov, surface, docs, units, commit, summary, skipped, shimmed: shimmed.get('react') ?? [] }),
      );
      console.log(`\n  report written to ${REPORT_PATH}`);
    }

    cleanup();
    if (!REPORT_ONLY && summary.high > 0) {
      console.error(`\n✗ verify-docs-alignment: ${summary.high} high-confidence mismatch(es) between apps/docs and the shipped API.\n`);
      process.exit(1);
    }
  } catch (e) {
    cleanup();
    throw e;
  }
}

// Imported lazily to keep the module graph readable at the top.
import { makeShadowVariant as makeVariant, diffFindings as diff } from './shadow.mjs';

function summarize(findings) {
  const byKind = new Map();
  let high = 0;
  let medium = 0;
  let advisory = 0;
  for (const f of findings) {
    byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
    if (f.severity === 'high') high++;
    else if (f.severity === 'medium') medium++;
    else advisory++;
  }
  return { high, medium, advisory, total: findings.length, byKind: [...byKind.entries()].sort((a, b) => b[1] - a[1]) };
}

main().catch((e) => {
  console.error(e?.stack ?? String(e));
  process.exit(1);
});
