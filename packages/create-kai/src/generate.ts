/**
 * The generator: plan in, project on disk out. No prompting, no process exit, no
 * console output beyond what the caller asks for — so the interactive run and
 * the test run go through exactly the same code.
 */
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getIntegration, mockIntegration } from './catalog';
import type { Integration } from './catalog';
import { resolveSurface } from './features';
import { getFramework } from './frameworks';
import type { FrameworkDef } from './frameworks';
import { buildKaiJson, stringifyKaiJson } from './kai-json';
import { rewritePackageJson, stringifyPackageJson } from './package-json';
import { applyGatewayPatch, applyPatch, gatewayPatchesFor, patchesFor } from './patches';
import { clientModelFor, emitRoute } from './routes';
import type { EmittedFile } from './routes';
import {
  GITIGNORE_SOURCE_NAME,
  STRIPPED_DOTFILES,
  travellingName,
} from './template-dotfiles';
import type { ProjectPlan } from './types';

/**
 * What `_gitignore` arrives as, derived from the one list that decides which
 * dotfiles travel underscored (src/template-dotfiles.ts).
 *
 * Kept as a named export because `test/generate.test.ts` asserts the rename
 * round-trips through it, and because the `.gitignore` case is the one with
 * teeth: without the rename the emitted project ignores nothing, so
 * `node_modules/` and — for a keyed gateway — `.env.local` are both
 * untracked-but-not-ignored, and a scaffold whose first `git add .` stages an
 * API key is the worst version of this bug. It only appears in the PUBLISHED
 * package, never in a local run from the repo, which is why
 * `scripts/verify-pack.mjs` reads the packed tarball rather than the tree.
 */
export const GITIGNORE_TEMPLATE_NAME = travellingName(GITIGNORE_SOURCE_NAME);

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

  // ── everything below is written into a staging directory ────────────────────
  //
  // WHY THE PROJECT IS NOT BUILT IN PLACE. It was, and the failure that exposed
  // it is the reason this function has a staging step at all: `create-kai@0.1.0`
  // threw ENOENT on a missing `.npmrc` partway through, and left 20 files on
  // disk — including a `package.json` still carrying `@kitn.ai/ui-example-nextjs`
  // and `"@kitn.ai/ui": "file:../../../packages/ui"`, a monorepo path that
  // resolves to nothing on a stranger's machine. The terse one-line error is easy
  // to miss above a directory that looks scaffolded, and `npm install` in it
  // fails a second time, further from the cause.
  //
  // ATOMIC MOVE RATHER THAN CLEANUP-ON-ERROR, chosen for two reasons that
  // cleanup cannot cover. A `catch` only runs for a thrown error, so a Ctrl-C or
  // a killed process still strands the half-written tree; staging strands a
  // dot-prefixed directory nobody will mistake for their project. And cleanup
  // means deleting a path the user named — `plan.dir` may be an existing empty
  // directory the caller allowed — so the failure path would be a recursive
  // delete of something this function did not create. Staging never has to
  // decide that question.
  //
  // The staging directory is a SIBLING of the destination, not `os.tmpdir()`:
  // `rename` is only atomic within one filesystem, and on macOS `/var/folders`
  // is routinely a different one, which would make the last step an EXDEV
  // failure at the end of a successful scaffold.
  const parent = path.dirname(plan.dir);
  await mkdir(parent, { recursive: true });
  const out = await mkdtemp(path.join(parent, '.create-kai-'));

  let previousKitSpec: string | undefined;
  try {
    await cp(templateDir, out, { recursive: true });

    // The dotfiles npm refuses to pack, back from the names they travelled
    // under. Best-effort per file: `.gitignore` is required of every starter and
    // `.npmrc` only exists in the standalone ones, so absent means nothing to do.
    // Before the patches, because a patch row names the REAL name — `.npmrc` is
    // one of the files `PATCHES` opens.
    for (const dotfile of STRIPPED_DOTFILES) {
      const travelling = path.join(out, travellingName(dotfile));
      if (existsSync(travelling)) await rename(travelling, path.join(out, dotfile));
    }

    // The named edits that turn a reviewed starter into the user's own project.
    // Each one throws if it stops matching, and the package build runs them
    // against the template so that throw happens here rather than in a user's
    // terminal.
    for (const patch of patchesFor(framework.templateDir)) {
      const file = path.join(out, patch.file);
      await writeFile(file, applyPatch(patch, await readFile(file, 'utf8'), plan.name), 'utf8');
    }

    // The one rewrite that turns a workspace member into a standalone consumer.
    const pkgPath = path.join(out, 'package.json');
    const rewritten = rewritePackageJson(await readFile(pkgPath, 'utf8'), {
      name: plan.name,
      kit: plan.kit,
      gatewayDeps: integration.deps.npm,
    });
    previousKitSpec = rewritten.previousKitSpec;
    await writeFile(pkgPath, stringifyPackageJson(rewritten.json), 'utf8');

    // Read BEFORE the gateway patches rewrite the call site: `goLiveThread` looks
    // for `toOpenAIMessages(...)`, which the mock-path starter carries only in the
    // comment above the mock call — and that comment is one of the things the
    // gateway patches replace. Reading after would throw on exactly the projects
    // that went live.
    const appSource = await readFile(path.join(out, framework.paths.app), 'utf8');
    const thread = goLiveThread(appSource, framework);

    const routeFiles = await writeGateway(plan, framework, integration, out, thread);

    await writeFile(
      path.join(out, 'kai.json'),
      stringifyKaiJson(buildKaiJson(plan, framework)),
      'utf8',
    );

    await writeFile(
      path.join(out, 'README.md'),
      plan.gatewayId === 'mock'
        ? renderMockReadme(plan, framework, thread, integration.docsSlug)
        : renderGatewayReadme(plan, framework, integration, routeFiles[0].path),
      'utf8',
    );
  } catch (error) {
    // The staging directory is this function's own, so removing it cannot touch
    // anything the caller had.
    await rm(out, { recursive: true, force: true });
    throw error;
  }

  await commit(out, plan.dir);

  return {
    dir: plan.dir,
    files: await listFiles(plan.dir),
    previousKitSpec,
    runNote: integration.runNote,
    docsSlug: integration.docsSlug,
  };
}

/**
 * Move the finished project onto the path the user named.
 *
 * `rename` is the atomic case and the one that normally runs. It cannot always
 * land on an EXISTING directory though — the caller permits an empty one, and
 * Windows refuses that rename where POSIX allows it — so the copy below is the
 * portability fallback, taken only for the errnos that mean exactly "rename
 * cannot land here". Anything else is a real failure and is rethrown rather than
 * quietly downgraded into a copy.
 */
async function commit(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST' && code !== 'ENOTEMPTY' && code !== 'EPERM' && code !== 'EXDEV') {
      throw error;
    }
  }
  await cp(from, to, { recursive: true });
  await rm(from, { recursive: true, force: true });
}

/**
 * The route, the go-live patches and the env file — everything that exists only
 * when a gateway was chosen.
 *
 * Lifted out of `generate()` when the staging directory went in, because the
 * function was one `try` block deep enough that the gateway branch inside it
 * read as nesting rather than as a stage. Nothing about it changed; `out` is the
 * staging directory rather than the user's, which is the entire difference.
 */
async function writeGateway(
  plan: ProjectPlan,
  framework: FrameworkDef,
  integration: Integration,
  out: string,
  thread: string,
): Promise<readonly EmittedFile[]> {
  // Everything before this point is identical for `mock` and for a real gateway,
  // which is the property that keeps the zero-config path a byte-for-byte copy
  // of a reviewed starter.
  const routeFiles = plan.gatewayId === 'mock' ? [] : emitRoute(integration, framework);
  if (plan.gatewayId !== 'mock') {
    if (routeFiles.length === 0) {
      // Refusing beats emitting. A project whose front end POSTs to `/api/chat`
      // with nothing serving that path installs, builds, and fails on the first
      // message with an HTML 404 parsed as SSE — which is the failure mode the
      // gateway prompt exists to avoid, arriving later and looking like a bug in
      // the kit.
      //
      // NAMING WHICH HALF IS MISSING, because the two are fixed in different
      // files by different people: a missing route host is a row in
      // `src/frameworks.ts`, a missing handler is an integration in the kit
      // catalog. `routeSymbolsProblem` already refuses the second at build time,
      // so reaching it here means the tables disagree.
      throw new Error(
        framework.route === null
          ? `create-kai: '${framework.id}' has no route destination, so gateway ` +
            `'${plan.gatewayId}' cannot be wired for it. Scaffold with --gateway none, or use a ` +
            'framework whose route host is declared (see `--list --json`).'
          : `create-kai: gateway '${plan.gatewayId}' declares no webRoute, so there is no handler ` +
            `to emit into ${framework.route.file}. It should not be in WIRED_GATEWAYS.`,
      );
    }

    for (const file of routeFiles) {
      const abs = path.join(out, file.path);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, file.contents, 'utf8');
    }

    for (const patch of gatewayPatchesFor(framework.templateDir)) {
      const file = path.join(out, patch.file);
      await writeFile(
        file,
        applyGatewayPatch(patch, await readFile(file, 'utf8'), {
          thread,
          routeFile: routeFiles[0].path,
          gatewayTitle: integration.title,
          model: clientModelFor(integration),
        }),
        'utf8',
      );
    }

    if (integration.envVars.length > 0) {
      await writeFile(
        path.join(out, framework.paths.env),
        renderEnvFile(integration.envVars, integration.runNote),
        'utf8',
      );
    }
  }

  // Handed back rather than kept: the README names the route file, and it is
  // written for the mock path too, so the caller owns it.
  return routeFiles;
}

/**
 * `.env.local`, with the declared variable names and a placeholder value.
 *
 * NAMES FROM THE CATALOG, never restated: `integration.envVars` is what the
 * emitted route reads, so a second list here would be a file naming a variable
 * nothing looks at, which fails as a blank reply rather than as an error.
 *
 * The value is a placeholder rather than empty on purpose. An empty assignment
 * loads as the empty string, so the route sends `Authorization: Bearer ` and the
 * provider answers 401 — legible, but only after a round trip. A value that is
 * obviously not a key is what a reader replaces without wondering whether it was
 * already set.
 */
export function renderEnvFile(envVars: readonly string[], runNote: string): string {
  return [
    `# ${runNote}`,
    `#`,
    `# Read by the chat route on the server. This file is gitignored — the key`,
    `# never reaches the browser and must never be committed.`,
    ``,
    ...envVars.map((name) => `${name}=replace-me`),
    ``,
  ].join('\n');
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

/**
 * The README for a project that WENT LIVE at scaffold time.
 *
 * The mock README's whole body is a go-live diff — the one expression a user
 * changes. That paste is already applied here, so repeating it would tell a
 * reader to make an edit their project has. What replaces it is the two things
 * they now have to do that the mock path never needed: put a key in the file,
 * and know where the route runs. `production` is stated because it is the one
 * property of the emitted route the user cannot see from the file: a Next route
 * handler ships, a Vite dev-server plugin does not.
 */
function renderGatewayReadme(
  plan: ProjectPlan,
  framework: FrameworkDef,
  integration: Integration,
  routeFile: string,
): string {
  const host = framework.route;
  return `# ${plan.name}

A chat app built with [\`@kitn.ai/ui\`](https://ui.kitn.ai), scaffolded by \`create-kai\`
and wired to ${integration.title}.

\`\`\`bash
npm install
npm run dev
\`\`\`

## Your key

${integration.runNote}

\`${framework.paths.env}\` was created with ${
    integration.envVars.length === 1 ? 'the variable' : 'the variables'
  } ${integration.envVars.map((v) => `\`${v}\``).join(', ')} set to a placeholder.
Replace ${integration.envVars.length === 1 ? 'it' : 'them'} with your own before \`npm run dev\`.
That file is gitignored, and only the server route reads it — the key never
reaches the browser.

## The route

\`${routeFile}\` holds the provider call. The front end in
\`${framework.paths.app}\` POSTs the thread to \`/api/chat\` and streams the
reply back through \`readOpenAIStream\`, the same parser the mock path used.

Runtime: ${host?.runtime ?? 'unknown'}.
${
  host?.production === false
    ? `
**Development only.** \`vite build\` emits static assets and no server, so a
deployed build has nothing behind \`/api/chat\`. To ship, deploy the handler in
\`${routeFile}\` to a real server — a Next route, a SvelteKit endpoint, a Worker,
Express — and point the fetch at it.
`
    : ''
}
\`kai.json\` records what was scaffolded, including where the route lives.

Docs: https://ui.kitn.ai/${integration.docsSlug}
`;
}

function renderMockReadme(
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
