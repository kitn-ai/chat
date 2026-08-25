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
  // A demo host page, not the emitted widget: purely so a first-time preview
  // isn't a mystery blank tab with one small launcher in the corner. Outside
  // the custom element entirely (a sibling in <body>), inline-styled, and
  // worded so nobody mistakes it for the construct's own output. Keyed off
  // `layout` so a future non-widget layout (Task 12) isn't told the widget is
  // "in the corner" when it isn't one.
  const hint =
    c.layout === 'widget'
      ? `\n    <p style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); margin: 0; color: #94a3b8; font: 14px system-ui, sans-serif; text-align: center; max-width: 28rem; padding: 0 1rem;">This blank page stands in for your site. The chat widget is in the bottom-right corner.</p>`
      : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${c.name} — construct preview</title>
  </head>
  <body style="margin: 0;">${hint}
    <${c.name}></${c.name}>
    <script type="module" src="/src/element.tsx"></script>
  </body>
</html>
`;
}

function emitElement(c: Construct): string {
  const accent = c.theme?.accent;
  // The accent has to land on the HOST element, not anywhere inside this
  // shadow root. The kit's --color-primary token is resolved ONCE, by a rule
  // scoped to `:root, :host` (`@layer theme { :root, :host { --color-primary:
  // var(--kai-color-primary, <fallback>) } }`) — so --kai-color-primary has to
  // be set AT the host for that rule to see it; a descendant inside the
  // shadow tree can set --kai-color-primary on itself all day and it will
  // never flow back up into a value the :host rule already resolved. This is
  // why the theme accent rendered nowhere in the T5 demo despite being
  // "wired": the previous version set it on a div INSIDE App's own render.
  //
  // `ctx.element` (the facade's second argument) IS the host, so this sets it
  // from the one place inside the shadow root that has a handle to it.
  // `style.setProperty` is also the safe way to carry the accent, distinct
  // from string-interpolating it into CSS text: a custom property's value is
  // an opaque token substituted via var(), so it can never break out into a
  // new declaration or rule the way raw CSS/JS text interpolation could.
  const facade = accent
    ? `(_props, ctx) => {
  ctx.element.style.setProperty('--kai-color-primary', ${JSON.stringify(accent)});
  return <App />;
}`
    : `() => <App />`;
  return `import { defineWebComponent } from '@kitn.ai/ui/define';
import { App } from './App';

// The one facade. Interior stays pure Solid (no nested element registrations);
// the kit CSS is injected into the shadow root by defineWebComponent itself.
defineWebComponent('${c.name}', { theme: '${themeMode(c)}' as 'light' | 'dark' | 'auto' }, ${facade});
`;
}

// ── App interior ─────────────────────────────────────────────────────────────
// The chat spine is IMPLIED: thread + input + streaming are always emitted and
// wired; the construct declares deviations and additions only. Seams below are
// where later tasks splice capability code; each is a pure string join, so the
// determinism test keeps holding.

function emitApp(c: Construct): string {
  return `import { createSignal } from 'solid-js';
import {
  Button,
  Dock,
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
  Thread,
  createKaiChat,
} from '@kitn.ai/ui/solid';
${emitProviderImports(c)}

${emitProviderSetup(c)}

// The kit's own Thread composable owns the whole message list: scroll
// container, per-role bubble alignment/gap/padding, markdown, and the
// scroll-to-bottom button. Hand-rolling that list here is exactly the class
// of bug this seam exists to avoid (T5 demo: bare Message rows with no
// padding, no gap, both roles left-aligned).
//
// Thread's user bubble has no primary-color prop, so the accent brand color
// is routed onto it through the \`part="bubble content"\` hook
// Message/MessageContent already expose for out-of-tree styling — scoped to
// the user role via Message's own \`data-role\` attribute. This is the
// documented styling seam (see message.tsx), not a reach into an
// implementation detail.
function Panel() {
  return (
    <div style={{ height: '100%', display: 'flex', 'flex-direction': 'column' }}>
      <style>{'[data-role="user"] [part="bubble content"] { background: var(--color-primary); color: var(--color-primary-foreground); }'}</style>
      <div style={{ flex: '1 1 auto', 'min-height': '0' }}>
        <Thread messages={chat.messages()} loading={chat.loading()} />
      </div>
      <PromptInput
        value={inputValue()}
        onValueChange={setInputValue}
        isLoading={chat.loading()}
        onSubmit={submit}
      >
        <PromptInputTextarea placeholder="Ask anything" />
        <PromptInputActions>
          <Button variant="default" size="sm" disabled={!inputValue().trim() || chat.loading()} onClick={submit}>
            Send
          </Button>
        </PromptInputActions>
      </PromptInput>
    </div>
  );
}

export function App() {
  return (
${emitLayoutOpen(c)}      <Panel />
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
  // Widget: the kit's Dock (launcher + panel + focus contract). No theming
  // wrapper needed here — the accent lands on the HOST element from
  // element.tsx's facade (see emitElement), which reaches both the launcher
  // (a DOM sibling of this panel content, outside Dock's own `children`) and
  // everything below via normal custom-property inheritance from :host down
  // through the whole shadow tree. More layouts in Task 12.
  return `    <Dock label="${c.name}">\n`;
}

function emitLayoutClose(c: Construct): string {
  return `    </Dock>\n`;
}

// ── writing ──────────────────────────────────────────────────────────────────

const MANIFEST = '.kai-manifest.json';

/**
 * Write files; prune anything the PREVIOUS generation wrote that this one
 * didn't. Returns the paths that already existed on disk before this write
 * (i.e. were overwritten) — callers that decide loudly (the CLI's `eject`)
 * use it to say so instead of silently clobbering a file the caller may have
 * hand-edited.
 */
export function writeProject(files: GeneratedFile[], dir: string): string[] {
  const manifestPath = join(dir, MANIFEST);
  const previous: string[] = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as string[])
    : [];
  const current = new Set(files.map((f) => f.path));
  for (const stale of previous) {
    if (!current.has(stale)) rmSync(join(dir, stale), { force: true });
  }
  const overwritten: string[] = [];
  for (const f of files) {
    const abs = join(dir, f.path);
    if (existsSync(abs)) overwritten.push(f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.code);
  }
  writeFileSync(manifestPath, `${JSON.stringify([...current].sort(), null, 2)}\n`);
  return overwritten;
}
