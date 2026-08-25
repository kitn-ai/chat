/**
 * construct → generated Solid mini-project. THE single generation path:
 * kai dev, kai compile and kai eject all call generateProject — the preview IS
 * the artifact (owner-picked option B; no interpreter to drift).
 *
 * Quality bar: the output is the EJECT artifact. Deterministic (no dates, no
 * randomness, object keys emitted in fixed order), idiomatic, readable.
 * Interior is pure Solid composing @kitn.ai/ui/solid; provider glue imports
 * @kitn.ai/ui/state + /wire (never a hand-rolled SSE reader); the one
 * defineWebComponent facade carries the tag, theme default and slots.
 * Styling: kit components + inline styles only — defineWebComponent injects
 * the compiled kit CSS into the shadow root, so the generated project needs no
 * Tailwind, no CSS build, nothing.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Construct } from './schema';

export interface GeneratedFile {
  path: string;
  code: string;
}

export interface GenerateOptions {
  /** Dependency spec for @kitn.ai/ui in the generated package.json.
   *  Default: `^<this package's version>` (self-name resolution, mcp/server.ts pattern).
   *  The gates pass a local tarball path here. */
  uiSpec?: string;
}

function kitVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require('@kitn.ai/ui/package.json') as { version: string };
  return pkg.version;
}

const themeMode = (c: Construct): 'light' | 'dark' | 'auto' =>
  c.theme?.mode === 'light' ? 'light' : c.theme?.mode === 'dark' ? 'dark' : 'auto';

export function generateProject(construct: Construct, opts: GenerateOptions = {}): GeneratedFile[] {
  const uiSpec = opts.uiSpec ?? `^${kitVersion()}`;
  return [
    { path: 'package.json', code: emitPackageJson(construct, uiSpec) },
    { path: 'tsconfig.json', code: emitTsconfig() },
    { path: 'vite.config.ts', code: emitViteDev() },
    { path: 'vite.config.lib.ts', code: emitViteLib(construct) },
    { path: 'index.html', code: emitIndexHtml(construct) },
    { path: 'src/element.tsx', code: emitElement(construct) },
    { path: 'src/App.tsx', code: emitApp(construct) },
  ];
}

function emitPackageJson(c: Construct, uiSpec: string): string {
  return `${JSON.stringify(
    {
      name: c.name,
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build --config vite.config.lib.ts',
        typecheck: 'tsc --noEmit',
      },
      dependencies: {
        '@kitn.ai/ui': uiSpec,
        'solid-js': '^1.9.0',
      },
      devDependencies: {
        typescript: '^5.6.0',
        vite: '^6.0.0',
        'vite-plugin-solid': '^2.11.0',
      },
    },
    null,
    2,
  )}\n`;
}

function emitTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'preserve',
        jsxImportSource: 'solid-js',
        strict: true,
        noUnusedLocals: true,
        skipLibCheck: true,
        types: ['vite/client'],
      },
      include: ['src'],
    },
    null,
    2,
  )}\n`;
}

function emitViteDev(): string {
  return `import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({ plugins: [solid()] });
`;
}

function emitViteLib(c: Construct): string {
  return `import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// kai compile: ONE self-registering .js. Everything is inlined (no externals):
// the consumer installs nothing but this output.
export default defineConfig({
  plugins: [solid()],
  build: {
    lib: { entry: 'src/element.tsx', formats: ['es'], fileName: () => '${c.name}.js' },
  },
});
`;
}

function emitIndexHtml(c: Construct): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${c.name} — construct preview</title>
  </head>
  <body>
    <${c.name}></${c.name}>
    <script type="module" src="/src/element.tsx"></script>
  </body>
</html>
`;
}

function emitElement(c: Construct): string {
  return `import { defineWebComponent } from '@kitn.ai/ui/define';
import { App } from './App';

// The one facade. Interior stays pure Solid (no nested element registrations);
// the kit CSS is injected into the shadow root by defineWebComponent itself.
defineWebComponent('${c.name}', { theme: '${themeMode(c)}' as 'light' | 'dark' | 'auto' }, () => <App />);
`;
}

// ── App interior ─────────────────────────────────────────────────────────────
// The chat spine is IMPLIED: thread + input + streaming are always emitted and
// wired; the construct declares deviations and additions only. Seams below are
// where later tasks splice capability code; each is a pure string join, so the
// determinism test keeps holding.

function emitApp(c: Construct): string {
  const accent = c.theme?.accent;
  const rootStyle = [
    `height: '100%'`, `display: 'flex'`, `'flex-direction': 'column'`,
    ...(accent ? [`'--kai-color-primary': '${accent}'`] : []),
  ].join(', ');
  return `import { For, Show, createSignal } from 'solid-js';
import {
  ChatContainer,
  ChatContainerContent,
  ChatContainerScrollAnchor,
  Dock,
  Message,
  MessageContent,
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
  ScrollButton,
  createKaiChat,
} from '@kitn.ai/ui/solid';
import type { MessagePart } from '@kitn.ai/ui/solid';
${emitProviderImports(c)}

${emitProviderSetup(c)}

function Thread() {
  return (
    <div style={{ ${rootStyle} }}>
      <ChatContainer style={{ flex: '1 1 auto', 'min-height': '0' }}>
        <ChatContainerContent>
          <For each={chat.messages()}>
            {(message) => (
              <Message role={message.role}>
                <For each={message.parts}>
                  {(part) => (
                    <Show when={part.type === 'text' ? part : false}>
                      {(text) => <MessageContent markdown={message.role === 'assistant'}>{text().text}</MessageContent>}
                    </Show>
                  )}
                </For>
              </Message>
            )}
          </For>
          <ChatContainerScrollAnchor />
        </ChatContainerContent>
        <ScrollButton />
      </ChatContainer>
      <PromptInput
        value={inputValue()}
        onValueChange={setInputValue}
        isLoading={chat.loading()}
        onSubmit={submit}
      >
        <PromptInputTextarea placeholder="Ask anything" />
        <PromptInputActions />
      </PromptInput>
    </div>
  );
}

export function App() {
  return (
${emitLayoutOpen(c)}      <Thread />
${emitLayoutClose(c)}  );
}
`;
}

function emitProviderImports(c: Construct): string {
  // Grows in Task 7 (endpoint). Mock: state responder + the shared wire reader.
  return `import { createMockResponder } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';`;
}

function emitProviderSetup(c: Construct): string {
  // PromptInput is uncontrolled by default and its onSubmit fires with no
  // payload, so the value has to be read from the same signal that controls
  // the textarea rather than off the submit callback.
  return `// Provider seam: mock — keyless, streams locally, announces itself once.
// Swap for provider.mode "endpoint" in the construct and re-run kai dev; the
// generated fetch keeps this exact shape (the seam is the point).
const respond = createMockResponder();
const [inputValue, setInputValue] = createSignal('');
const chat = createKaiChat();

async function submit() {
  const value = inputValue().trim();
  if (!value || chat.loading()) return;
  setInputValue('');
  chat.append({ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: value }] });
  const stream = chat.streamAssistant();
  await readOpenAIStream(respond(value), stream);
  stream.done();
}`;
}

function emitLayoutOpen(c: Construct): string {
  // Widget: the kit's Dock (launcher + panel + focus contract). More layouts in Task 12.
  return `    <Dock label="${c.name}">\n`;
}

function emitLayoutClose(c: Construct): string {
  return `    </Dock>\n`;
}

// ── writing ──────────────────────────────────────────────────────────────────

const MANIFEST = '.kai-manifest.json';

/** Write files; prune anything the PREVIOUS generation wrote that this one didn't. */
export function writeProject(files: GeneratedFile[], dir: string): void {
  const manifestPath = join(dir, MANIFEST);
  const previous: string[] = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as string[])
    : [];
  const current = new Set(files.map((f) => f.path));
  for (const stale of previous) {
    if (!current.has(stale)) rmSync(join(dir, stale), { force: true });
  }
  for (const f of files) {
    const abs = join(dir, f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.code);
  }
  writeFileSync(manifestPath, `${JSON.stringify([...current].sort(), null, 2)}\n`);
}
