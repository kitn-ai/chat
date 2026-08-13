/**
 * The generator: plan in, project on disk out. No prompting, no process exit, no
 * console output beyond what the caller asks for — so the interactive run and
 * the test run go through exactly the same code.
 */
import { cp, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getIntegration, mockIntegration } from './catalog';
import { resolveSurface } from './features';
import { getFramework } from './frameworks';
import type { FrameworkDef } from './frameworks';
import { buildKaiJson, stringifyKaiJson } from './kai-json';
import { rewritePackageJson, stringifyPackageJson } from './package-json';
import { applyPatch, patchesFor } from './patches';
import type { ProjectPlan } from './types';

/**
 * npm strips a file named `.gitignore` out of a published tarball, so templates
 * carry it as `_gitignore` and it is renamed back on copy.
 *
 * This is create-vite's own workaround and it is not optional: without it the
 * emitted project has no `.gitignore`, which means `node_modules/` and — for a
 * keyed gateway — `.env.local` are both untracked-but-not-ignored. A scaffold
 * whose first `git add .` stages an API key is the worst version of this bug,
 * and it only appears in the PUBLISHED package, never in a local run from the
 * repo. `scripts/verify-pack.mjs` asserts the packed tarball carries the
 * underscored name.
 */
export const GITIGNORE_TEMPLATE_NAME = '_gitignore';

/** Where the bundled templates live, relative to the built `dist/index.js`. */
export function defaultTemplateRoot(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates');
}

export interface GenerateOptions {
  /** overridden by tests and by the smoke script; defaults to the bundled dir */
  templateRoot?: string;
}

export interface GenerateResult {
  dir: string;
  /** files written, relative to `dir`, sorted */
  files: string[];
  /** the kit spec that was replaced, for the caller to report */
  previousKitSpec: string | undefined;
  /** the chosen integration's run note, printed in the next-steps block */
  runNote: string;
  docsSlug: string;
}

export async function generate(
  plan: ProjectPlan,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const framework = getFramework(plan.frameworkId);
  if (!framework) throw new Error(`create-kai: unknown framework '${plan.frameworkId}'`);

  const integration =
    plan.gatewayId === 'mock' ? mockIntegration() : getIntegration(plan.gatewayId);
  if (!integration) throw new Error(`create-kai: unknown gateway '${plan.gatewayId}'`);

  const surface = resolveSurface(plan.featureIds, framework);
  if (!surface.ok) throw new Error(`create-kai: ${surface.reason}`);
  if (surface.surface.kind === 'generated') {
    // Structured for it, not shipping it: the generated-surface path needs the
    // `renderSurface` output patched into each framework's entry file, and no
    // such project has been run. Refusing beats emitting an unrun surface.
    throw new Error(
      'create-kai: generated feature surfaces are not wired in this release — ' +
        'the composed workspace (conversation history) is the path that runs today',
    );
  }

  const templateRoot = options.templateRoot ?? defaultTemplateRoot();
  const templateDir = path.join(templateRoot, framework.templateDir);
  if (!existsSync(templateDir)) {
    throw new Error(
      `create-kai: no template for '${framework.id}' at ${templateDir}. ` +
        'Run the package build (it copies examples/starters/* into dist/templates).',
    );
  }

  await mkdir(plan.dir, { recursive: true });
  await cp(templateDir, plan.dir, { recursive: true });

  // `.gitignore` back from its published-tarball-safe name.
  const underscored = path.join(plan.dir, GITIGNORE_TEMPLATE_NAME);
  if (existsSync(underscored)) {
    await rename(underscored, path.join(plan.dir, '.gitignore'));
  }

  // The named edits that turn a reviewed starter into the user's own project.
  // Each one throws if it stops matching, and the package build runs them
  // against the template so that throw happens here rather than in a user's
  // terminal.
  for (const patch of patchesFor(framework.templateDir)) {
    const file = path.join(plan.dir, patch.file);
    await writeFile(file, applyPatch(patch, await readFile(file, 'utf8'), plan.name), 'utf8');
  }

  // The one rewrite that turns a workspace member into a standalone consumer.
  const pkgPath = path.join(plan.dir, 'package.json');
  const { json, previousKitSpec } = rewritePackageJson(await readFile(pkgPath, 'utf8'), {
    name: plan.name,
    kit: plan.kit,
    gatewayDeps: integration.deps.npm,
  });
  await writeFile(pkgPath, stringifyPackageJson(json), 'utf8');

  await writeFile(
    path.join(plan.dir, 'kai.json'),
    stringifyKaiJson(buildKaiJson(plan, framework)),
    'utf8',
  );

  const appSource = await readFile(path.join(plan.dir, framework.paths.app), 'utf8');
  await writeFile(
    path.join(plan.dir, 'README.md'),
    renderReadme(plan, framework, goLiveThread(appSource, framework), integration.docsSlug),
    'utf8',
  );

  return {
    dir: plan.dir,
    files: await listFiles(plan.dir),
    previousKitSpec,
    runNote: integration.runNote,
    docsSlug: integration.docsSlug,
  };
}

/**
 * How THIS framework's app reads its thread back, taken out of the emitted app
 * file rather than restated.
 *
 * The README's go-live diff is a snippet a user pastes, so it has to name real
 * identifiers in the file it points at. Restating React's worked while React was
 * the only ready framework and broke the moment Vue landed: React's thread is
 * `chat.messages`, Vue's is a ref and reads `messages.value`, and the hard-coded
 * React version emitted into a Vue project would have serialized a Ref object.
 *
 * Both starters already carry the expression in the comment above the mock call,
 * because both had to tell their own reader the same thing. So this reads that
 * instead of keeping a second table of it in the CLI, and `scripts/build.mjs`
 * fails the build if a ready template stops carrying one — which is why the
 * throw below cannot reach a user.
 */
const GO_LIVE_CALL = 'toOpenAIMessages(';

/**
 * WHY THIS COUNTS PARENTHESES INSTEAD OF MATCHING `\(([^)]+)\)`.
 *
 * It used to be that regex, and `[^)]+` stops at the FIRST `)`. React's thread
 * expression is `chat.messages` and Vue's is `messages.value` — neither contains
 * a parenthesis, so both round-tripped correctly and the bug was invisible for
 * two ready frameworks. Angular reads its thread through a signal CALL,
 * `this.chat.messages()`, and the capture came back as `this.chat.messages(`.
 * The README then emitted
 *
 *     body: JSON.stringify({ messages: toOpenAIMessages(this.chat.messages() }),
 *
 * which is a syntax error in the one snippet whose entire job is to be pasted.
 * The build would not have caught it either: `verifyAppPath` only asks that the
 * expression EXISTS, and it did.
 *
 * Any framework whose thread getter is a call — a signal, a store `get()`, a
 * `useSyncExternalStore` selector — hits this, so it is fixed structurally
 * rather than by widening the character class.
 */
export function goLiveThread(appSource: string, framework: FrameworkDef): string {
  const call = appSource.indexOf(GO_LIVE_CALL);
  if (call >= 0) {
    const from = call + GO_LIVE_CALL.length;
    let depth = 1;
    for (let i = from; i < appSource.length; i++) {
      const ch = appSource[i];
      if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) return appSource.slice(from, i);
    }
  }
  throw new Error(
    `create-kai: ${framework.paths.app} carries no balanced toOpenAIMessages(...) expression, so ` +
      'the README cannot state how to go live without inventing one. Restore the comment in the ' +
      `examples/starters/${framework.templateDir} starter.`,
  );
}

function renderReadme(
  plan: ProjectPlan,
  framework: FrameworkDef,
  thread: string,
  docsSlug: string,
): string {
  return `# ${plan.name}

A chat app built with [\`@kitn.ai/ui\`](https://ui.kitn.ai), scaffolded by \`create-kai\`.

\`\`\`bash
npm install
npm run dev
\`\`\`

The reply you see on first run comes from the kit's mock responder, not a model.
It streams canned SSE frames through \`readOpenAIStream\` — the same parser a real
provider's response goes through — so what you are looking at is the real
rendering path with a fake reply. Every frame is tagged \`_kai_mock\`, the stream
opens with a \`: kai-mock\` comment and usage reports zero tokens, so nothing here
can be mistaken for a real turn.

To go live, one expression in \`${framework.paths.app}\` changes:

\`\`\`diff
- import { readOpenAIStream } from '@kitn.ai/ui/wire';
+ import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';

- await readOpenAIStream(mockResponse(text), stream);
+ const res = await fetch('/api/chat', {
+   method: 'POST',
+   headers: { 'content-type': 'application/json' },
+   body: JSON.stringify({ messages: toOpenAIMessages(${thread}) }),
+ });
+ await readOpenAIStream(res, stream);
\`\`\`

\`kai.json\` records what was scaffolded.

Docs: https://ui.kitn.ai/${docsSlug}
`;
}

/** Every file under `dir`, relative and sorted, ignoring `node_modules`. */
async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir)) {
    if (entry === 'node_modules') continue;
    const abs = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if ((await stat(abs)).isDirectory()) out.push(...(await listFiles(abs, rel)));
    else out.push(rel);
  }
  return out.sort();
}
