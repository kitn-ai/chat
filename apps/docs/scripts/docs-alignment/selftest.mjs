// Anti-theatre. This runs BEFORE the docs are looked at, and the whole harness
// exits non-zero if any probe misbehaves.
//
// A green docs run proves nothing unless two opposite things are true at once:
//
//   MUST FAIL — a snippet that imports a kit entry point that does not exist,
//   names an export the kit does not have, passes a prop a kit component does
//   not accept, sets a non-scalar prop as an HTML attribute, misspells an
//   element, an event, a part or a `<Example config>` key, or narrows a kit type
//   and then uses it in a way the real type forbids.
//
//   MUST PASS — a snippet that calls the reader's own undeclared functions,
//   omits its imports, and imports third-party packages this repo does not
//   install. Those are what a doc fragment legitimately looks like, and a
//   harness that fails them gets switched off within a day.
//
// If the kit types ever resolve to `any` — a bad symlink, an unbuilt dist, a
// wrong moduleResolution — the MUST-FAIL probes go quiet and this file is what
// notices.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileProject, writeShims, bareSpecifiers, chooseWrapper } from './compile.mjs';
import { checkMarkup, checkCss, checkMdxComponents } from './structural.mjs';
import { makeShadowVariant, diffFindings } from './shadow.mjs';
import { classifyCompileFinding } from './classify.mjs';

/** Snippets that MUST produce a KIT finding. */
const MUST_FAIL = [
  {
    id: 'unknown-kit-entry',
    project: 'react',
    ext: 'ts',
    code: `import { Chat } from '@kitn.ai/ui/not-a-real-entry';\nexport const x = Chat;\n`,
    want: /2307|Cannot find module/,
  },
  {
    id: 'unknown-kit-export',
    project: 'react',
    ext: 'ts',
    code: `import { ThisExportWasRemoved } from '@kitn.ai/ui';\nexport const x = ThisExportWasRemoved;\n`,
    want: /2305|2724|no exported member/,
  },
  {
    id: 'bogus-prop-on-kit-component',
    project: 'solid',
    ext: 'tsx',
    code: `import { Markdown } from '@kitn.ai/ui';\nexport const el = <Markdown contnet="typo" />;\n`,
    want: /contnet|2322|2353|2769|2739/,
  },
  {
    id: 'wrong-type-into-kit-api',
    project: 'react',
    ext: 'ts',
    code: `import { classifyTool } from '@kitn.ai/ui';\nexport const k = classifyTool(42);\n`,
    want: /2345|not assignable/,
  },
  {
    // Found by this harness's own self-test going red on a badly written probe:
    // `readModelStream` takes three arguments and a doc calling it with two
    // would compile in nobody's app.
    id: 'wrong-arity-on-kit-api',
    project: 'react',
    ext: 'ts',
    code: `import { readModelStream } from '@kitn.ai/ui/wire';\nexport const run = () => readModelStream(yourResponse(), yourSink());\n`,
    want: /2554|Expected \d+ arguments/,
  },
  {
    id: 'removed-wire-api',
    project: 'react',
    ext: 'ts',
    code: `import { readVendorStream } from '@kitn.ai/ui/wire';\nexport const x = readVendorStream;\n`,
    want: /2305|2724|no exported member/,
  },
];

/** Snippets that MUST stay clean — the false-positive guard. */
const MUST_PASS = [
  {
    id: 'readers-own-undeclared-code',
    project: 'react',
    ext: 'ts',
    code: `import { toOpenAIMessages } from '@kitn.ai/ui/wire';\n\nexport async function send() {\n  const history = conversations();\n  const res = await streamFromYourAPI(toOpenAIMessages(history));\n  handleSubmit(res);\n}\n`,
  },
  {
    id: 'omitted-imports-and-partial-jsx',
    project: 'solid',
    ext: 'tsx',
    code: `import { Message } from '@kitn.ai/ui';\n\nexport const row = (\n  <Message>\n    <MessageContent markdown>{renderYourText()}</MessageContent>\n  </Message>\n);\n`,
  },
  {
    id: 'uninstalled-third-party-import',
    project: 'react',
    ext: 'ts',
    code: `import { streamText } from 'ai';\nimport { openai } from '@ai-sdk/openai';\nimport { toOpenAIMessages } from '@kitn.ai/ui/wire';\n\nexport const run = () =>\n  streamText({ model: openai('gpt-4o'), messages: toOpenAIMessages(yourHistory()) });\n`,
  },
];

export function runSelfTest({ workspace, surface, uiRoot, verbose }) {
  const problems = [];
  const log = [];

  // ── compile probes ────────────────────────────────────────────────────────
  const byProject = new Map();
  for (const p of [...MUST_FAIL, ...MUST_PASS]) {
    if (!byProject.has(p.project)) byProject.set(p.project, []);
    byProject.get(p.project).push(p);
  }

  for (const [project, probes] of byProject) {
    const dir = workspace.dir(project);
    const specs = new Set();
    for (const p of probes) for (const s of bareSpecifiers(p.code)) specs.add(s);
    writeShims(workspace, project, specs);
    const units = probes.map((p) => ({
      id: `selftest__${p.id}`,
      path: join(dir, `selftest__${p.id}.${p.ext}`),
      code: p.code,
      importsKit: true,
      probe: p,
    }));
    compileProject({ workspace, project, units, surface, uiRoot });

    for (const u of units) {
      const kit = (u.findings ?? []).filter((f) => f.origin);
      const all = u.findings ?? [];
      const isMustFail = MUST_FAIL.includes(u.probe);
      if (isMustFail) {
        const text = kit.map((f) => `TS${f.code} ${f.message}`).join(' | ');
        if (!kit.length) {
          problems.push(
            `MUST-FAIL probe '${u.probe.id}' produced NO kit finding. The kit types are not resolving for real — a green docs run would be meaningless.\n      all diagnostics: ${all.map((f) => `TS${f.code} ${f.message}`).join(' | ') || '(none)'}`,
          );
        } else if (!u.probe.want.test(text)) {
          problems.push(`MUST-FAIL probe '${u.probe.id}' failed for the WRONG reason: ${text}`);
        } else {
          log.push(`    RED as required  ${u.probe.id}  ->  ${kit.map((f) => `TS${f.code}`).join(',')}  ${truncate(kit[0].message)}`);
        }
      } else {
        if (kit.length) {
          problems.push(
            `MUST-PASS probe '${u.probe.id}' produced a kit finding — the false-positive guard is broken:\n      ${kit.map((f) => `TS${f.code} ${f.message}`).join('\n      ')}`,
          );
        } else {
          log.push(`    GREEN as required ${u.probe.id}  (reader-owned names and uninstalled packages tolerated)`);
        }
      }
    }
  }

  // ── structural probes ─────────────────────────────────────────────────────
  const anyTag = [...surface.byTag.values()].find((e) => e.props.some((p) => p.scalar === false));
  const nonScalar = anyTag?.props.find((p) => p.scalar === false);
  const structural = [
    {
      id: 'unknown-element',
      run: () => checkMarkup({ code: '<kai-not-a-real-element></kai-not-a-real-element>', startLine: 1, surface, lang: 'html' }),
      want: 'unknown-element',
    },
    {
      id: 'unknown-prop',
      run: () => checkMarkup({ code: '<kai-chat plaecholder="typo"></kai-chat>', startLine: 1, surface, lang: 'html' }),
      want: 'unknown-prop',
    },
    {
      id: 'nonscalar-as-attribute',
      run: () =>
        anyTag
          ? checkMarkup({ code: `<${anyTag.tag} ${nonScalar.name}="[1,2]"></${anyTag.tag}>`, startLine: 1, surface, lang: 'html' })
          : [],
      want: 'nonscalar-as-attribute',
    },
    {
      id: 'unknown-event',
      run: () => checkMarkup({ code: `el.addEventListener('kai-nope-event', () => {});`, startLine: 1, surface, lang: 'js' }),
      want: 'unknown-event',
    },
    {
      id: 'unknown-part',
      run: () => checkCss({ code: 'kai-message::part(nope) { color: red }', startLine: 1, surface }),
      want: 'unknown-part',
    },
    {
      id: 'stale-mdx-example-tag',
      run: () =>
        checkMdxComponents(
          { mdxComponents: [{ name: 'Example', attrs: { tag: { kind: 'string', value: 'kai-gone' } }, line: 1 }] },
          surface,
        ),
      want: 'unknown-element',
    },
    {
      id: 'stale-mdx-config-key',
      run: () =>
        checkMdxComponents(
          {
            mdxComponents: [
              { name: 'Example', attrs: { tag: { kind: 'string', value: 'kai-message' }, config: { kind: 'expr', value: '{ notAProp: "x" }' } }, line: 1 },
            ],
          },
          surface,
        ),
      want: 'unknown-prop',
    },
  ];
  const structuralPass = [
    {
      // The exemption must be driven by the marker, not by the shape of the
      // code — the identical markup one line up MUST still be reported, which
      // the `nonscalar-as-attribute` MUST-FAIL probe above proves.
      id: 'marked-counter-example-is-exempt',
      run: () =>
        checkMarkup({
          code: `<!-- Fails — an array can't be an HTML attribute -->\n<kai-chat messages="[...]"></kai-chat>`,
          startLine: 1,
          surface,
          lang: 'html',
        }),
    },
    {
      id: 'valid-markup-stays-clean',
      run: () => checkMarkup({ code: '<kai-chat placeholder="Ask anything" theme="dark"></kai-chat>', startLine: 1, surface, lang: 'html' }),
    },
    {
      id: 'nonscalar-as-jsx-binding-is-fine',
      run: () => checkMarkup({ code: '<kai-chat messages={messages()} />', startLine: 1, surface, lang: 'tsx' }),
    },
  ];

  for (const p of structural) {
    const found = p.run();
    if (!found.some((f) => f.kind === p.want)) {
      problems.push(
        `MUST-FAIL structural probe '${p.id}' did not report '${p.want}'. Got: ${JSON.stringify(found.map((f) => f.kind))}`,
      );
    } else {
      log.push(`    RED as required  ${p.id}  ->  ${found.find((f) => f.kind === p.want).detail}`);
    }
  }
  for (const p of structuralPass) {
    const found = p.run();
    if (found.length) {
      problems.push(`MUST-PASS structural probe '${p.id}' reported ${found.length}: ${JSON.stringify(found.map((f) => f.detail))}`);
    } else {
      log.push(`    GREEN as required ${p.id}`);
    }
  }

  // ── fragment-wrapper probes ───────────────────────────────────────────────
  // The wrapper pass must rescue documentation conventions WITHOUT rescuing
  // genuinely malformed code — otherwise it is a blanket syntax-error mute.
  const wrapperProbes = [
    { id: 'type-shape-fragment', code: `{ type: 'reasoning'; text: string; label?: string }`, ext: 'ts', wantWrapped: true },
    { id: 'class-member-fragment', code: `onResize(e: Event) {\n  console.log(e);\n}`, ext: 'ts', wantWrapped: true },
    { id: 'whole-module-unchanged', code: `export const a = 1;\n`, ext: 'ts', wantWrapped: false },
    { id: 'genuine-garbage-not-rescued', code: `const x = ;;; (((\n`, ext: 'ts', wantWrapped: false },
  ];
  for (const p of wrapperProbes) {
    const w = chooseWrapper(p.code, p.ext);
    const wrapped = w.id !== 'module';
    if (wrapped !== p.wantWrapped) {
      problems.push(
        `wrapper probe '${p.id}': expected ${p.wantWrapped ? 'a wrapper' : 'NO wrapper'}, got '${w.id}'.` +
          (p.wantWrapped ? '' : ' A wrapper here would mute real syntax errors.'),
      );
    } else {
      log.push(`    ${wrapped ? 'WRAPPED as required ' : 'UNWRAPPED as required'} ${p.id}  ->  ${w.id}`);
    }
  }

  // ── severity probes ───────────────────────────────────────────────────────
  // What gates CI. Widening is advisory in an untyped block (correct JavaScript
  // that no compiler reads), and that leniency must NOT leak into shape drift —
  // a wrong message object in a ```js fence still has to gate. These drive
  // classify.mjs directly with diagnostics of each shape.
  const KIT = { origin: true };
  const OWN = { origin: null };
  const severityProbes = [
    {
      id: 'widening-in-ts-gates',
      finding: { ...KIT, message: `Type '{ role: string; }' is not assignable to type 'ChatMessage'. Type 'string' is not assignable to type '"user" | "assistant"'.` },
      lang: 'ts',
      want: { kind: 'literal-widening', severity: 'high' },
    },
    {
      id: 'widening-in-untyped-js-is-advisory',
      finding: { ...KIT, message: `Type '{ role: string; }' is not assignable to type 'ChatMessage'. Type 'string' is not assignable to type '"user" | "assistant"'.` },
      lang: 'js',
      want: { kind: 'literal-widening', severity: 'advisory' },
    },
    {
      // The leniency above must be narrow. A message object that is genuinely
      // WRONG for the kit produces a missing-property diagnostic, not widening,
      // and still gates in the same untyped block.
      id: 'shape-drift-in-untyped-js-still-gates',
      finding: { ...KIT, message: `Property 'parts' is missing in type '{ id: string; role: "user"; content: string; }' but required in type 'ChatMessage'.` },
      lang: 'js',
      want: { kind: 'kit-type-error', severity: 'high' },
    },
    {
      id: 'unknown-prop-in-untyped-html-script-still-gates',
      finding: { ...KIT, message: `Object literal may only specify known properties, and 'mesages' does not exist in type 'ChatMessage'.` },
      lang: 'html-script',
      want: { kind: 'kit-type-error', severity: 'high' },
    },
    {
      id: 'readers-own-type-error-never-gates',
      finding: { ...OWN, message: `Parameter 'm' implicitly has an 'any' type.` },
      lang: 'ts',
      want: { kind: 'snippet-type-error', severity: 'advisory' },
    },
    {
      id: 'unparseable-snippet-is-medium',
      finding: { ...OWN, syntactic: true, message: `'}' expected.` },
      lang: 'ts',
      want: { kind: 'snippet-syntax', severity: 'medium' },
    },
  ];
  for (const p of severityProbes) {
    const got = classifyCompileFinding(p.finding, p.lang);
    if (got.kind !== p.want.kind || got.severity !== p.want.severity) {
      problems.push(
        `severity probe '${p.id}': expected ${p.want.kind}/${p.want.severity}, got ${got.kind}/${got.severity}.`,
      );
    } else {
      log.push(`    CLASSIFIED as required ${p.id}  ->  ${got.kind}/${got.severity}`);
    }
  }

  // ── shadow probe ──────────────────────────────────────────────────────────
  const shadowProbe = {
    id: 'narrowed-kit-type',
    project: 'solid',
    code:
      `import { createSignal } from 'solid-js';\n` +
      `type ChatMessage = { id: string; role: 'user' | 'assistant'; parts: { type: 'text'; text: string }[] };\n` +
      `const [messages] = createSignal<ChatMessage[]>([]);\n` +
      `export const flat = () => messages().map((m) => m.parts.map((p) => p.text).join(''));\n`,
  };
  {
    const dir = workspace.dir('solid');
    writeShims(workspace, 'solid', new Set(['solid-js']));
    const unit = { id: 'selftest__shadow', path: join(dir, 'selftest__shadow.tsx'), code: shadowProbe.code, importsKit: false };
    compileProject({ workspace, project: 'solid', units: [unit], surface, uiRoot });
    const asWritten = (unit.findings ?? []).filter((f) => f.category === 'error');

    const variant = makeShadowVariant(unit, surface);
    if (!variant) {
      problems.push(`shadow probe: a local \`type ChatMessage\` was NOT recognised as shadowing a kit type.`);
    } else {
      const sdir = workspace.dir('shadow-solid');
      writeShims(workspace, 'shadow-solid', new Set(['solid-js']));
      variant.path = join(sdir, 'selftest__shadow.tsx');
      compileProject({ workspace, project: 'shadow-solid', units: [variant], surface, uiRoot });
      const introduced = diffFindings(unit, variant).filter((f) => f.origin);
      if (asWritten.length) {
        problems.push(`shadow probe: the snippet AS WRITTEN should compile clean; got ${asWritten.map((f) => `TS${f.code}`).join(',')}`);
      }
      if (!introduced.length) {
        problems.push(
          `shadow probe: substituting the kit's real ChatMessage introduced NO error. The pass that finds parts-flattening is dead.`,
        );
      } else {
        log.push(`    RED as required  ${shadowProbe.id}  ->  as-written: 0 errors; with the real ChatMessage: TS${introduced[0].code} ${truncate(introduced[0].message)}`);
      }
    }
  }

  if (verbose || problems.length) for (const l of log) console.log(l);
  return { problems, log };
}

const truncate = (s, n = 130) => (s.length > n ? `${s.slice(0, n)}…` : s);

export { MUST_FAIL, MUST_PASS };
export const writeProbeFile = (dir, name, code) => writeFileSync(join(dir, name), code);
