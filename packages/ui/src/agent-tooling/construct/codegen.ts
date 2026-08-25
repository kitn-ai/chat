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

// ── accent contrast (codegen-time, static) ─────────────────────────────────
// A light accent (e.g. yellow) paired with the kit's default near-white
// foreground is unreadable, so the construct's accent needs a matching
// --kai-color-primary-foreground computed at generation time (the accent is
// static per construct — no reason to compute this at runtime for every
// browser that can't do it natively). Parses only the numeric CSS color forms
// (#rgb/#rrggbb/#rrggbbaa, rgb()/rgba(), hsl()/hsla()) — named colors, var(),
// and anything else exotic are NOT guessed at; see resolveContrastForeground.

/** sRGB channel (0-255) -> linear-light value, per the WCAG relative
 *  luminance formula. */
function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [r1, g1, b1] =
    hue < 60 ? [chroma, x, 0]
    : hue < 120 ? [x, chroma, 0]
    : hue < 180 ? [0, chroma, x]
    : hue < 240 ? [0, x, chroma]
    : hue < 300 ? [x, 0, chroma]
    : [chroma, 0, x];
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

/** Parse the numeric CSS color forms only. Returns null for anything this
 *  can't resolve to concrete RGB without guessing (named colors, var(),
 *  color-mix(), oklch(), etc.) — the caller must decide loudly rather than
 *  silently picking a default for those. */
function parseAccentRgb(accent: string): [number, number, number] | null {
  const s = accent.trim();
  const hex3 = /^#([0-9a-fA-F]{3})$/.exec(s);
  if (hex3) {
    const [r, g, b] = hex3[1].split('').map((ch) => parseInt(ch + ch, 16));
    return [r, g, b];
  }
  const hex6 = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(s);
  if (hex6) {
    const hex = hex6[1];
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const rgbFn = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(s);
  if (rgbFn) {
    const [r, g, b] = [rgbFn[1], rgbFn[2], rgbFn[3]].map(Number);
    return [r, g, b].every((v) => v >= 0 && v <= 255) ? [r, g, b] : null;
  }
  const hslFn = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*[\d.]+\s*)?\)$/.exec(s);
  if (hslFn) {
    return hslToRgb(Number(hslFn[1]), Number(hslFn[2]) / 100, Number(hslFn[3]) / 100);
  }
  return null;
}

/**
 * The paired --kai-color-primary-foreground for a parseable accent, or null
 * when the accent can't be resolved to concrete RGB without guessing.
 *
 * Threshold: white when it sits closer to white than to black on the WCAG
 * relative-luminance scale (L <= 0.5), else black — equivalently "contrast
 * against white (1 - L) >= contrast against black (L)". This is a deliberately
 * simpler comparison than the full WCAG *contrast-ratio* formula (which adds
 * a 0.05 offset to both sides): the ratio formula's asymmetric offset flips
 * the choice for at least one real accent this codegen ships in its own demo
 * fixture (#e91e63, L≈0.1915 — contrast-ratio picks black at 4.83:1 over
 * white's 4.35:1, but a straight luminance-distance comparison, and every
 * reference brand palette pairing that color with white text, picks white).
 * Verified by direct computation, not assumed — see the "accent contrast"
 * describe block in codegen.test.ts for the worked numbers.
 */
export function resolveContrastForeground(accent: string): '#000000' | '#ffffff' | null {
  const rgb = parseAccentRgb(accent);
  if (!rgb) return null;
  const luminance = relativeLuminance(...rgb);
  return luminance <= 0.5 ? '#ffffff' : '#000000';
}

/**
 * Neutralize characters that could break out of a comment before embedding
 * untrusted text in one. Two contexts reuse this: the CLI/dev notice line
 * (plain terminal text — newlines just garble it) and the CSS NOTICE comment
 * emitted into element.tsx, where the two-character close-comment sequence in
 * the accent would otherwise end the comment early and let the rest of the
 * accent's text land as live CSS inside the generated stylesheet.
 */
function commentSafe(text: string): string {
  return text.replace(/[\r\n]/g, ' ').replace(/\*\//g, '* /');
}

const CONTRAST_COLOR_SUPPORTS = '@supports (color: contrast-color(red))';

/**
 * One line for whichever host decides loudly about generation-time notices
 * (the CLI today; `dev`'s watch loop reuses it on every regen). Null when
 * there's nothing to say — no accent, or the accent parsed fine.
 */
export function accentContrastNotice(construct: Construct): string | null {
  const accent = construct.theme?.accent;
  if (!accent || resolveContrastForeground(accent) !== null) return null;
  return `accent '${commentSafe(accent)}' not parseable for contrast; foreground left at theme default in browsers without CSS contrast-color() support`;
}

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
  if (!accent) {
    return `import { defineWebComponent } from '@kitn.ai/ui/define';
import { App } from './App';

// The one facade. Interior stays pure Solid (no nested element registrations);
// the kit CSS is injected into the shadow root by defineWebComponent itself.
defineWebComponent('${c.name}', { theme: '${themeMode(c)}' as 'light' | 'dark' | 'auto' }, () => <App />);
`;
  }

  // The accent has to land on the HOST element, not anywhere inside this
  // shadow root. The kit's --color-primary token is resolved ONCE, by a rule
  // scoped to `:root, :host` (`@layer theme { :root, :host { --color-primary:
  // var(--kai-color-primary, <fallback>) } }`) — so --kai-color-primary has to
  // be set AT the host for that rule to see it; a descendant inside the
  // shadow tree can set --kai-color-primary on itself all day and it will
  // never flow back up into a value the :host rule already resolved. This is
  // why the theme accent rendered nowhere in the T5 demo despite being
  // "wired": an earlier version set it on a div INSIDE App's own render.
  //
  // `ctx.element` (the facade's second argument) IS the host, so this sets it
  // from the one place inside the shadow root that has a handle to it.
  // `style.setProperty` is also the safe way to carry the accent, distinct
  // from string-interpolating it into CSS text: a custom property's value is
  // an opaque token substituted via var(), so it can never break out into a
  // new declaration or rule the way raw CSS/JS text interpolation could.
  //
  // The PAIRED --kai-color-primary-foreground is a separate concern: a light
  // accent (yellow) next to the kit's default near-white foreground is
  // unreadable. That pairing DOES need to live in a CSS block rather than a
  // second setProperty call, because it has two layers that must be able to
  // override each other in order: (1) a black/white value computed HERE, at
  // generation time (the accent is static per construct), as the floor for
  // browsers without CSS contrast-color() (Baseline Newly Available April
  // 2026 — Chrome/Edge 147, Firefox 146, Safari 26; Widely Available is not
  // until ~2028, and this widget embeds in arbitrary sites), and (2) inside
  // `@supports (color: contrast-color(red))`, the NATIVE answer
  // (contrast-color(var(--kai-color-primary))), which wins where supported —
  // including for an accent this codegen couldn't parse. An inline
  // `style.setProperty` always beats a stylesheet rule (short of
  // `!important`), so achieving "the native answer wins where present" needs
  // both layers to be plain `:host {}` declarations in one stylesheet, base
  // rule first, @supports override after — ordinary cascade order, no
  // `!important` required.
  const foreground = resolveContrastForeground(accent);
  const foregroundCss =
    foreground !== null
      ? `:host { --kai-color-primary-foreground: ${foreground}; }\n`
      : // Not guessed at: an unparseable accent (var(), a named color, a
        // color-mix()/oklch() call, …) leaves NO base declaration, so the
        // kit's own theme default stands — except in a browser new enough to
        // resolve contrast-color() itself, where the @supports block below
        // still gets it right natively.
        `/* NOTICE: accent '${commentSafe(accent)}' not parseable for contrast at generation time; the paired foreground falls back to the theme default in browsers without CSS contrast-color() support. */\n`;
  const styleText =
    foregroundCss + `${CONTRAST_COLOR_SUPPORTS} {\n  :host { --kai-color-primary-foreground: contrast-color(var(--kai-color-primary)); }\n}`;

  const facade = `(_props, ctx) => {
  ctx.element.style.setProperty('--kai-color-primary', ${JSON.stringify(accent)});
  return (
    <>
      <style>{${JSON.stringify(styleText)}}</style>
      <App />
    </>
  );
}`;
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
  return `import { ChatThread, Dock, createKaiChat } from '@kitn.ai/ui/solid';
import type { AttachmentData } from '@kitn.ai/ui/solid';
${emitProviderImports(c)}

${emitProviderSetup(c)}

// ChatThread is the kit's own MOST-INTEGRATED chat surface — the same
// composition <kai-chat>'s facade renders (src/elements/chat.tsx). It owns
// the message list, the composer (padding, focus ring, the send button) and
// their layout AS ONE UNIT, so nothing here re-derives spacing, alignment or
// focus styling by hand: every prior version of this file that hand-composed
// Thread + PromptInput + Button was restating layout the kit already owns,
// and every visual defect the owner hit (flush composer, a clipped focus
// ring) traced back to that restatement. Composing ChatThread directly
// leaves NOTHING here to restate it with.
//
// Capability gating (format rule: an undeclared capability's affordance must
// be OFF). The construct schema carries NO capability vocabulary yet (lands
// Task 9) — every affordance below is gated to "off" unconditionally, not
// per-construct, until there's a field to gate ON.
//   - webSearch / voice: real ChatThreadProps booleans, default OFF when
//     omitted — set to \`false\` explicitly rather than left implicit, so the
//     gating decision is visible in the emitted source, not just inferred
//     from an absent prop.
//   - suggestions / models: omitted (undefined), same effect — no starter
//     prompts, no model switcher.
//   - attachments (the paperclip): NOT gateable from here. ChatThread has no
//     \`attach\` passthrough — unlike webSearch/voice, its internal composer
//     always wires a live onAttachmentsChange handler to DefaultPromptInput
//     (chat-thread.tsx's own attachment-tracking signal needs one
//     unconditionally), so the paperclip shows regardless of what this file
//     passes or omits. The disabling prop DOES exist one layer down
//     (DefaultPromptInputProps.attach, also on the standalone kai-prompt-input
//     /kai-default-input elements) but ChatThread never forwards it — a real
//     kit gap, escalated rather than routed around by hand-composing a
//     replacement composer (the exact pattern the previous round stopped).
export function App() {
  return (
${emitLayoutOpen(c)}      <ChatThread messages={chat.messages()} loading={chat.loading()} placeholder="Ask anything" onSubmit={submit} webSearch={false} voice={false} />
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
  // ChatThread owns its own composer draft (uncontrolled — no `value` prop
  // passed below) and clears it after submit itself; `onSubmit` hands back
  // the value directly, so there's no PromptInput-specific signal-reading
  // workaround to carry here any more.
  return `// Provider seam: mock — keyless, streams locally, announces itself once.
// Swap for provider.mode "endpoint" in the construct and re-run kai dev; the
// generated fetch keeps this exact shape (the seam is the point).
const respond = createMockResponder();
const chat = createKaiChat();

async function submit(detail: { value: string; attachments: AttachmentData[] }) {
  if (!detail.value.trim() || chat.loading()) return;
  chat.append({ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: detail.value }] });
  const stream = chat.streamAssistant();
  await readOpenAIStream(respond(detail.value), stream);
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
