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
  const files: GeneratedFile[] = [
    { path: 'package.json', code: emitPackageJson(construct, uiSpec) },
    { path: 'tsconfig.json', code: emitTsconfig() },
    { path: 'vite.config.ts', code: emitViteDev() },
    { path: 'vite.config.lib.ts', code: emitViteLib(construct) },
    { path: 'index.html', code: emitIndexHtml(construct) },
    { path: 'src/element.tsx', code: emitElement(construct) },
    { path: 'src/App.tsx', code: emitApp(construct) },
  ];
  if (construct.cards) files.push({ path: 'src/cards.ts', code: emitCardsRegistry(construct.cards) });
  return files;
}

// ── cards ────────────────────────────────────────────────────────────────
// Named generative-UI card definitions the model can emit as tool calls.
// Registration only — the projection into provider tool definitions is the
// kit's OWN `cardTools`/`toOpenAITools`/`toAnthropicTools` (@kitn.ai/ui/schemas,
// src/schemas/tool-defs.ts), never a second one authored here.

/** `src/cards.ts` — the construct's card registry, verbatim from the
 *  construct. Each schema is `JSON.stringify(schema, null, 2)`'d and reindented
 *  under its key — deterministic because the construct's own key order (and
 *  each schema's own JSON key order) is preserved; nothing here re-sorts. */
function emitCardsRegistry(cards: NonNullable<Construct['cards']>): string {
  const entries = cards
    .map((card) => `  ${card.name}: ${JSON.stringify(card.schema, null, 2).split('\n').join('\n  ')},`)
    .join('\n');
  return `// src/cards.ts — the construct's card registry, verbatim from the construct.
// Tool definitions for YOUR backend derive from this same object via
// @kitn.ai/ui/schemas (cardTools / toOpenAITools / toAnthropicTools) — one
// projection, shared with the kit.
export const cards = {
${entries}
} as const;
`;
}

/** `, BUILTIN_CARD_COMPONENTS` spliced onto the `@kitn.ai/ui/solid` named-import
 *  list at the top of App.tsx (below) when cards are declared — the built-in
 *  `.form` renderer every declared card routes to. Empty otherwise. */
function emitCardComponentImport(c: Construct): string {
  return c.cards ? ', BUILTIN_CARD_COMPONENTS' : '';
}

/** The `import`s cards need in App.tsx: the registry itself, `BUILTIN_CARD_COMPONENTS`
 *  (@kitn.ai/ui/solid re-exports it from the root entry) so every declared card can
 *  route to the kit's own schema-driven form renderer, `cardFromToolCall` (turns a
 *  settled tool-call ToolPart into a renderable `card` MessagePart — see
 *  emitApplyCardTools) and, for an endpoint construct, the wire-matching tool
 *  projection for the fetch body. Empty when the construct declares no cards at all
 *  (format rule: undeclared -> no affordance, no import).
 *
 *  RULING (supervisor, this task): v1 renders EVERY declared card as the kit's own
 *  `form` card (`BUILTIN_CARD_COMPONENTS.form`, components/form.tsx) — it walks a
 *  JSON-Schema-shaped `data` into real input fields and honors `x-kai-format`/
 *  `x-kai-mask`/`x-kai-mask-guide` hints itself (field-mask.ts); no engine work is
 *  needed for masks specifically. This is deliberately NOT the same precedent as
 *  examples/apps/ops-console/shared/cards.ts's `createCardRegistry` (which maps
 *  several DISTINCT built-in kinds — confirm/form/choice/tasks — onto an app's own
 *  tool names): a construct's `cards` field carries only a `schema`, no `kind`, so
 *  there is no vocabulary yet to route on. Adding a `kind`/`type` field to pick
 *  confirm/choice/tasks is explicitly deferred to vocabulary-on-evidence, not done
 *  here — every construct card is a form until a later task adds that field. */
function emitCardsImport(c: Construct): string {
  if (!c.cards) return '';
  const toolsImport =
    c.provider.mode === 'endpoint' ? (c.provider.wire === 'openai' ? ', toOpenAITools' : ', toAnthropicTools') : '';
  return `import { cards } from './cards';
// Generative-UI cards, v1: every declared card renders as the kit's own
// schema-driven FORM (BUILTIN_CARD_COMPONENTS.form, components/form.tsx) — it
// walks the card's JSON Schema into real input fields, honoring
// x-kai-format/x-kai-mask/x-kai-mask-guide hints itself. ChatThread's own
// MessageBody already matches \`part.type === 'card'\` in its part rendering and
// draws it with the kit's own \`CardRenderer\` (components/card-renderer.tsx),
// which picks the component from \`cardTypes\` (below) by envelope.type — so
// there is nothing to hand-compose beyond that one map. Turning a model's tool
// call into that renderable part is \`cardFromToolCall\` (the inverse of
// \`cardTools\`), applied once per settled turn below; its data is then replaced
// with the DECLARED card schema (not the model's call arguments) — the fields
// on screen are the construct's own vocabulary, not whatever shape a model
// happened to send.
import { cardFromToolCall${toolsImport} } from '@kitn.ai/ui/schemas';

// Every declared card name routes to the SAME form renderer — cardFromToolCall
// makes envelope.type equal the card's own name (kai_refund_approval ->
// 'refund_approval'), and CardRenderer resolves a type's component from this
// map.
//
// Deliberately NOT also wiring ChatThread's \`cardSchemas\` prop to this
// registry below. That prop validates envelope.data AGAINST the named schema,
// and this card's data IS \`cards[name]\` itself (see emitApplyCardTools) — the
// construct's declared field schema, not values shaped like it. Wiring it as
// its own validator asks "does this FormDefinition itself have an \`amount\`
// key" and a well-formed FormDefinition never does, so every card would
// render the HARD validation-failure fallback instead of the form (caught
// live: eject + kai dev showed exactly that "(root).amount: required"
// failure before this comment existed). The construct's own schema.ts
// already checks \`cards\` structurally at validate time; there is nothing
// left for a second, self-referential check here to catch.
const cardTypes = Object.fromEntries(Object.keys(cards).map((name) => [name, BUILTIN_CARD_COMPONENTS.form] as const));`;
}

/** `cardTypes={cardTypes}` on ChatThread — which component draws each
 *  declared card name (see emitCardsImport for why `cardSchemas` is
 *  deliberately NOT also registered). The host to emit card events off is
 *  already supplied by the ChatThread/kai-chat path (F-26); nothing else to
 *  thread through here. */
function emitCardTypesProp(c: Construct): string {
  return c.cards ? ' cardTypes={cardTypes}' : '';
}

/** Settle a turn's tool calls into cards, called once after the read
 *  resolves and before `stream.done()`/`stream.abort()`. `AssistantStream`
 *  has no getter of its own, so the just-written parts are read back off
 *  `chat.messages()` by the stream's own id — the same pattern the kit's own
 *  `cardFromToolCall` doc comment (schemas/from-tool-call.ts) shows for a
 *  tool loop. A `kai_`-prefixed call becomes a card; anything else is the
 *  construct's own tool and is left as a plain `tool` part.
 *
 *  `cardFromToolCall` supplies the envelope's `type`/`id` (and the reuse — no
 *  second `kai_` parser here); its `data` is then REPLACED with the card's own
 *  DECLARED schema off the registry (`cards[card.type]`), not the model's call
 *  arguments — the form renders the construct author's fields, matching the
 *  supervisor ruling that every declared card is a schema-driven form in v1.
 *  The `card.type in cards` guard only fires for a `kai_` call this construct
 *  never declared (an off-vocabulary call slipping through); it is silently
 *  dropped rather than rendered, matching cardFromToolCall's own "not every
 *  kai_ call is renderable" boundary (see its module header). */
function emitApplyCardTools(c: Construct): string {
  if (!c.cards) return '';
  return `
  for (const part of chat.messages().find((m) => m.id === stream.id)?.parts ?? []) {
    if (part.type !== 'tool' || part.tool.state !== 'input-available') continue;
    const card = cardFromToolCall(part.tool.type, part.tool.input, { id: part.tool.toolCallId ?? crypto.randomUUID() });
    if (card && card.type in cards) stream.addCard({ ...card, data: cards[card.type as keyof typeof cards] });
  }`;
}

/** The endpoint fetch body's `tools` field — the projected tool defs for
 *  every declared card, matching the construct's own wire. No cards, no
 *  field: the format rule (undeclared capability's affordance is OFF) holds
 *  for tools the same way it holds for suggestions/attach/reasoning above. */
function emitToolsField(c: Construct): string {
  if (!c.cards || c.provider.mode !== 'endpoint') return '';
  const toolsFn = c.provider.wire === 'openai' ? 'toOpenAITools' : 'toAnthropicTools';
  return `, tools: ${toolsFn}(cards)`;
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
  return `${emitSolidJsImport(c)}import { ChatThread, Dock, createKaiChat${emitCardComponentImport(c)} } from '@kitn.ai/ui/solid';
import type { AttachmentData${emitHistoryTypeImport(c)} } from '@kitn.ai/ui/solid';
${emitProviderImports(c)}
${emitCardsImport(c)}

${emitProviderSetup(c)}
${emitHistorySetup(c)}

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
// be OFF). The construct schema carries ONE capability field so far
// (capabilities.starters, Task 8) — every other affordance below is gated to
// "off" unconditionally, not per-construct, until there's a field to gate ON.
//   - webSearch / voice: real ChatThreadProps booleans, default OFF when
//     omitted — set to \`false\` explicitly rather than left implicit, so the
//     gating decision is visible in the emitted source, not just inferred
//     from an absent prop.
//   - suggestions: ChatThread ALREADY owns starter prompts end to end — its
//     own \`suggestions\` prop renders the chips, hides them once
//     \`messages\` is non-empty, and (default \`suggestionMode="submit"\`)
//     calls \`onSubmit\` with the clicked text exactly like a typed submit.
//     So capabilities.starters threads straight into that prop; there is
//     nothing to hand-compose. Omitted (undefined) when no starters are
//     declared, same off-by-default effect as the booleans above.
//   - models: omitted (undefined) — no model switcher; no capabilities field yet.
//   - attachments (the paperclip): gated via ChatThread's \`attach\`/\`accept\`
//     props (kit gap closed — ChatThread forwards both to DefaultPromptInput,
//     mirroring webSearch/voice). ChatThread ALREADY owns the whole
//     round-trip end to end — the paperclip button, staged previews, staging
//     each file as a data URI (never a blob object URL; see
//     AttachmentData.url's doc in components/attachment-types.ts), and
//     handing the staged list back via onSubmit's \`attachments\` — and its
//     Message component ALREADY groups consecutive file parts into one
//     attachment row (message.tsx). So there is nothing to hand-compose
//     here, same lesson as suggestions above: hand-rolling a second picker or
//     a second file-part renderer would restate what ChatThread/Message
//     already own. capabilities.attachments threads straight into
//     attach/accept; the only App.tsx-owned piece is folding the picked
//     attachments into the outgoing message's parts at the submit site
//     (see emitProviderSetup) since createKaiChat's own append/streamAssistant
//     ops don't do that folding themselves.
//   - reasoning: gated via ChatThread's own \`reasoning\` prop (kit gap closed
//     — ChatThread forwards it to every MessageBody as \`reasoningMode\`,
//     mirroring attach/accept). \`'full'\` is both the schema default and
//     ChatThread's own default, so it and an absent field emit no prop at
//     all — the SAME off-by-default convention as every other capability
//     here, just anchored on the medium's existing default instead of an
//     "off" value, since a reasoning disclosure is normal chat behavior, not
//     an opt-in affordance like the paperclip or a starter chip.
export function App() {
  return (
${emitLayoutOpen(c)}      <ChatThread messages={chat.messages()} loading={chat.loading()} placeholder="Ask anything" onSubmit={submit} webSearch={false} voice={false}${emitAttachProps(c)}${emitStartersProp(c)}${emitReasoningProp(c)}${emitCardTypesProp(c)} />
${emitLayoutClose(c)}  );
}
`;
}

/** capabilities.attachments -> ChatThread's own \`attach\`/\`accept\` props.
 *  Undeclared keeps the explicit off-by-default gating (\`attach={false}\`,
 *  matching webSearch/voice above). Declared flips \`attach={true}\` and
 *  threads the accept list through — construct-authored/untrusted like
 *  \`starters\`/\`theme.accent\`/\`provider.url\`, so JSON.stringify'd into a
 *  real JS string-literal expression rather than a raw JSX attribute
 *  string (JSX attribute strings don't interpret escapes the way JS string
 *  literals do, so a raw \`accept="..."\` would be a breakout surface for a
 *  hostile media-type entry containing a \`"\`). */
function emitAttachProps(c: Construct): string {
  const attachments = c.capabilities?.attachments;
  if (!attachments) return ' attach={false}';
  return ` attach={true} accept={${JSON.stringify(attachments.accept.join(','))}}`;
}

/** capabilities.starters -> ChatThread's own \`suggestions\` prop. Starter
 *  strings are construct-authored (untrusted the same way theme.accent and
 *  provider.url are) — JSON.stringify produces a real JS array-of-string-
 *  literals expression, the same safe-interpolation convention used for the
 *  accent (element.tsx) and the endpoint url (fetch() above): no quote,
 *  backslash or line-separator payload can break out of it. Omitted
 *  entirely (not even the prop) when no starters are declared, matching the
 *  off-by-default gating for every other capability. */
function emitStartersProp(c: Construct): string {
  const starters = c.capabilities?.starters;
  if (!starters || starters.length === 0) return '';
  return ` suggestions={${JSON.stringify(starters)}}`;
}

/** capabilities.reasoning -> ChatThread's own `reasoning` prop. `'full'`
 *  and absent are the SAME thing (the schema default, matching ChatThread's
 *  own default) so both emit nothing at all — the off-by-default gating
 *  convention every other capability in this file follows: only a value that
 *  DEVIATES from the medium's default costs a byte in the emitted source.
 *  `'compact'`/`'off'` are plain string literals, not JSON.stringify'd like
 *  starters/accept/url — the schema already constrains this to one of three
 *  fixed enum members (schema.ts), so unlike those fields there is no
 *  construct-authored free text here to escape. */
function emitReasoningProp(c: Construct): string {
  const reasoning = c.capabilities?.reasoning;
  if (!reasoning || reasoning === 'full') return '';
  return ` reasoning="${reasoning}"`;
}

/** capabilities.history -> whether the App module needs `createEffect`
 *  (both persisted variants react to `chat.messages()` changing; `none`/
 *  absent needs no extra Solid import at all, matching the off-by-default
 *  gating everywhere else in this file). */
function emitSolidJsImport(c: Construct): string {
  const history = c.capabilities?.history;
  if (!history || history.persistence === 'none') return '';
  return `import { createEffect } from 'solid-js';\n`;
}

/** capabilities.history -> whether the AttachmentData type import also needs
 *  ChatMessage (only the persisted variants read/write full ChatMessage[]
 *  arrays). */
function emitHistoryTypeImport(c: Construct): string {
  const history = c.capabilities?.history;
  if (!history || history.persistence === 'none') return '';
  // The enclosing statement is already `import type { ... }` (AttachmentData),
  // so this must NOT repeat the `type` modifier inside the braces — `import
  // type { AttachmentData, type ChatMessage }` is a TS syntax error.
  return ', ChatMessage';
}

/** capabilities.history -> the persistence block spliced after
 *  createKaiChat/submit (emitProviderSetup). `none`/absent emits nothing at
 *  all — the format rule (undeclared capability's affordance is OFF).
 *
 *  `local`: keyed by the construct's own tag (one thread per construct, no
 *  cross-construct collision) — restoring on mount MUST hand createKaiChat's
 *  setMessages a NEW array reference (the kit's reactivity contract; see
 *  CLAUDE.md), which the updater-returns-parsed-array form does for free. A
 *  parsed value that is well-formed JSON but the WRONG SHAPE (an object, a
 *  number, ...) is just as dangerous as a storage exception — handing it to
 *  `chat.setMessages` would crash ChatThread's render — so it gets the same
 *  `Array.isArray` gate as the endpoint variant below, not just a try/catch
 *  around the parse.
 *  localStorage access is wrapped: it can throw in private mode or over
 *  quota, and a corrupt/foreign value under the key must not white-screen —
 *  neither failure is guessed at silently, both fall back to running
 *  in-memory (decide loudly: see the comment emitted alongside).
 *  Retention/eviction (how much, how long) is deliberately absent — an
 *  application-layer decision (component-scope-boundary), not this
 *  construct's to make.
 *
 *  `endpoint`: the CONSUMER's own thread route — GET on mount (kit parses
 *  the response as ChatMessage[]; a non-OK response, a rejected fetch, or a
 *  non-array body all fall back to an empty thread rather than throwing or
 *  crashing render — matching the shape-check discipline above), PUT on
 *  every change. Both fetches are wrapped (try/catch around the GET chain,
 *  `.catch` on the PUT) and decide loudly on failure (`console.error`) —
 *  mirroring the adjacent provider-endpoint fetch's own try/catch +
 *  `stream.abort` pattern, not a silent swallow. The `hydrated` flag guards
 *  against the mount-load's own setMessages call immediately re-triggering a
 *  PUT that writes back exactly what was just read — but a FAILED GET must
 *  still flip it, in `finally`: a transient GET failure (offline/CORS/DNS)
 *  degrading to "start fresh, keep saving" is the recoverable failure mode;
 *  leaving `hydrated` false forever would permanently disable every future
 *  PUT for the tab's life over one blip. No retry/backoff — that belongs to
 *  the app, not this construct (component-scope-boundary). url is
 *  construct-authored/untrusted like theme.accent and provider.url, so it is
 *  JSON.stringify'd at both fetch call sites — never string-concatenated
 *  (see the endpoint-provider comment on this same class of bug). */
function emitHistorySetup(c: Construct): string {
  const history = c.capabilities?.history;
  if (!history || history.persistence === 'none') return '';

  if (history.persistence === 'local') {
    const key = JSON.stringify(`kai:${c.name}:thread`);
    return `
// History: persisted locally in this browser, keyed by the element tag. What to
// retain and for how long is an app decision — clear the key to reset.
const THREAD_KEY = ${key};
try {
  const saved = localStorage.getItem(THREAD_KEY);
  if (saved) {
    const parsed: unknown = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      chat.setMessages(() => parsed as ChatMessage[]);
    } else {
      console.warn(\`[\${THREAD_KEY}] stored history was not an array; ignoring and starting fresh\`);
    }
  }
} catch { /* storage unavailable or corrupt: run in-memory */ }
createEffect(() => {
  try {
    localStorage.setItem(THREAD_KEY, JSON.stringify(chat.messages()));
  } catch { /* storage unavailable: run in-memory */ }
});
`;
  }

  const url = JSON.stringify(history.url);
  return `
// History: persisted to your endpoint (GET on mount, PUT on every change) —
// the kit PARSES, this app FETCHES; your route owns the storage and what to
// retain and for how long. \`hydrated\` guards the mount-load from immediately
// PUTting back what it just loaded, but still flips on a FAILED load — one
// offline/CORS/DNS blip degrades to "start fresh, keep saving", not
// "never save again".
let hydrated = false;
(async () => {
  try {
    const r = await fetch(${url});
    const saved: unknown = r.ok ? await r.json() : [];
    if (Array.isArray(saved)) {
      chat.setMessages(() => saved as ChatMessage[]);
    } else {
      console.warn('history endpoint returned a non-array body; ignoring and starting fresh');
    }
  } catch (err) {
    console.error('history endpoint GET failed; starting fresh (will keep saving)', err);
  } finally {
    hydrated = true;
  }
})();
createEffect(() => {
  const snapshot = chat.messages();
  if (!hydrated) return;
  fetch(${url}, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(snapshot),
  }).catch((err) => {
    console.error('history endpoint PUT failed; this change was not persisted', err);
  });
});
`;
}

function emitProviderImports(c: Construct): string {
  if (c.provider.mode === 'mock') {
    return `import { createMockResponder } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';`;
  }
  const read = c.provider.wire === 'openai' ? 'readOpenAIStream' : 'readAnthropicStream';
  const encode = c.provider.wire === 'openai' ? 'toOpenAIMessages' : 'toAnthropicMessages';
  return `import { ${read}, ${encode} } from '@kitn.ai/ui/wire';`;
}

function emitProviderSetup(c: Construct): string {
  // ChatThread owns its own composer draft (uncontrolled — no `value` prop
  // passed below) and clears it after submit itself; `onSubmit` hands back
  // the value directly, so there's no PromptInput-specific signal-reading
  // workaround to carry here any more.
  if (c.provider.mode === 'mock') {
    const cardsNote = c.cards
      ? `
// Cards demo keylessly: createMockResponder() can already SCRIPT a tool call
// (\`replies: [{ toolCalls: [...] }]\`, F-35), so a scripted turn calling
// \`kai_<card name>\` renders exactly like a live model's would, below.`
      : '';
    return `// Provider seam: mock — keyless, streams locally, announces itself once.
// Swap for provider.mode "endpoint" in the construct and re-run kai dev; the
// generated fetch keeps this exact shape (the seam is the point).${cardsNote}
const respond = createMockResponder();
const chat = createKaiChat();

async function submit(detail: { value: string; attachments: AttachmentData[] }) {
  if (!detail.value.trim() || chat.loading()) return;
  chat.append({
    id: crypto.randomUUID(),
    role: 'user',
    parts: [
      { type: 'text', text: detail.value },
      ...detail.attachments.map((attachment) => ({ type: 'file' as const, attachment })),
    ],
  });
  const stream = chat.streamAssistant();
  try {
    await readOpenAIStream(respond(detail.value), stream);${emitApplyCardTools(c)}
    stream.done();
  } catch (err) {
    stream.abort(err instanceof Error ? err.message : String(err));
  }
}`;
  }

  const { url, wire } = c.provider;
  const read = wire === 'openai' ? 'readOpenAIStream' : 'readAnthropicStream';
  const encode = wire === 'openai' ? 'toOpenAIMessages' : 'toAnthropicMessages';
  // provider.url is an UNCONSTRAINED z.string() (schema.ts). It is NEVER
  // embedded in this comment — a `//` line comment is ended by a raw
  // U+2028/U+2029 line separator (a valid JS line terminator that
  // commentSafe's \r\n strip does not catch), so a url containing one of
  // those code points could close the comment early and let the rest of the
  // url execute as JS. commentSafe is a comment-escaping tool and this is a
  // hand-rolled-escaping trap for untrusted input by construction, so the
  // fix is to never hand-roll it here: the url appears ONLY on the fetch()
  // line below, via JSON.stringify, which is a real JS string literal (not a
  // comment) and immune to this class of bug.
  return `// Provider seam: YOUR endpoint (${wire} wire, see the fetch call below
// for the URL). The kit PARSES, this component FETCHES — no key, no
// provider SDK, no client in here. Your route holds the key and re-frames to
// the provider; the kai MCP scaffold tool emits one for your framework.
const chat = createKaiChat();

async function submit(detail: { value: string; attachments: AttachmentData[] }) {
  if (!detail.value.trim() || chat.loading()) return;
  chat.append({
    id: crypto.randomUUID(),
    role: 'user',
    parts: [
      { type: 'text', text: detail.value },
      ...detail.attachments.map((attachment) => ({ type: 'file' as const, attachment })),
    ],
  });
  const stream = chat.streamAssistant();
  try {
    const response = await fetch(${JSON.stringify(url)}, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: ${encode}(chat.messages())${emitToolsField(c)} }),
    });
    if (!response.ok) throw new Error(\`endpoint responded \${response.status}\`);
    await ${read}(response, stream);${emitApplyCardTools(c)}
    stream.done();
  } catch (err) {
    stream.abort(err instanceof Error ? err.message : String(err));
  }
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

// ── kai compile: the d.ts alongside the single .js ─────────────────────────

/** The declaration file `kai compile` writes beside the emitted .js — just
 *  enough for a consumer's TS to know the tag and its one settable prop. */
export function emitTypes(c: Construct): string {
  return `declare global {
  interface HTMLElementTagNameMap {
    '${c.name}': HTMLElement & { theme: 'light' | 'dark' | 'auto' };
  }
}
export {};
`;
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
