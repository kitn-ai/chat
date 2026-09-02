/** Theme studio — a full theme editor for the kit's public `--kai-*` tokens.
 *
 *  How it works: every kit color is a CSS custom property the consumer can
 *  override. The studio writes the active palette as inline `--kai-color-*` /
 *  `--kai-radius` properties on a single canvas wrapper; custom properties
 *  inherit through the Shadow DOM, so every `kai-*` element inside the canvas
 *  reskins at once — the exact mechanism you'd ship in a stylesheet.
 *
 *  Light and dark are edited independently (each canvas host runs at the studio's
 *  own mode, not the page's), and Copy CSS exports the paste-ready `:root` +
 *  `.dark` blocks. Bounded to real tokens — colors, radius, the type scale and
 *  the font/tracking/shadow knobs — so it never promises theming the kit can't
 *  actually do. The type-size rungs earned their place when theme.css re-pointed
 *  Tailwind's `text-xs`/`text-sm`/`text-base`/`text-lg` at `--kai-text-*`: before
 *  that a size slider would have moved a small minority of the kit's call sites.
 *
 *  The token list lives in theme-tokens.ts (guarded against theme.css by
 *  packages/ui/tests/styles/theme-studio-coverage.test.ts). The DEFAULTS are not
 *  typed here at all: theme.css is imported raw and parsed, so the editor's
 *  "Default" theme is the kit's, byte for byte, and cannot drift from it.
 *
 *  This file is a standalone APP (apps/theme-studio/, built by
 *  KAI_BUILD=theme-studio in config/vite/page.ts into dist/theme-studio and
 *  served by the
 *  construct dev server at /theme-studio/), and is ALSO what the docs site's
 *  /theme/editor page renders (apps/docs re-exports it). It must never be
 *  imported from any component/elements/react entry point — it is a dev tool,
 *  not part of the shipped web-component bundles.
 *
 *  EMBED MODE: loaded with ?embed=1 (or inside an iframe), the studio posts its
 *  theme to the parent window — see the contract at `themePayload` below.
 */
import { createSignal, createEffect, onMount, onCleanup, For, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { loadKit } from './kit';
// NOT lucide-solid: its published dist builds icon DOM templates at module
// scope with client-only solid-js/web APIs, which crashes astro dev's
// server-side module evaluation of this file (docs /theme/editor) even under
// client:only. See the WHY NOT note in ./icons.
import {
  IconCheck,
  IconCopy,
  IconImport,
  IconReset,
  IconChevron,
  IconCode,
  IconSave,
  IconClose,
} from './icons';
import { THEME_PRESETS, SHADCN_TO_KAI } from './theme-presets';
import { sampleFor } from './sample-data';
import kitCss from '../../theme.css?raw';
import { GROUPS, ALL_TOKENS, TEXT_RUNGS, parseKitDefaults, remValue, type TextRung } from '../../src/themes/theme-tokens';

// The showroom writes ONE kai-* tag directly in Solid JSX (<kai-chat> below);
// every other element mounts via document.createElement in mountSample. Solid's
// JSX namespace knows no custom elements and element-types.d.ts augments
// REACT's JSX, not Solid's, so declare the tag here the way the stories do
// (chat-slots.stories.tsx uses the identical type, which keeps the interface
// merge legal when both files share a program). It must live IN this module,
// not a sibling .d.ts: a build that compiles the studio without the stories —
// the dts pass behind verify:dts:consumer — only sees augmentations in files
// its program actually imports.
declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-chat': JSX.HTMLAttributes<HTMLElement>;
    }
  }
}

/** Mount a kai-* element into `container`, seeded from the docs sample-data registry
 *  (the same verified data the component pages use) so the showroom shows real,
 *  correct components reskinned by the active theme. */
function mountSample(container: HTMLElement, tag: string, mode: string): HTMLElement {
  const sample = sampleFor(tag);
  const node = document.createElement(tag) as HTMLElement & Record<string, unknown>;
  node.style.display = 'block';
  node.setAttribute('theme', mode);
  if (typeof sample.html === 'string') node.innerHTML = sample.html as string;
  container.replaceChildren(node);
  if (typeof customElements !== 'undefined') customElements.upgrade(node);
  for (const [k, v] of Object.entries(sample)) {
    if (k === 'html' || k === 'previewHeight') continue;
    (node as Record<string, unknown>)[k] = v;
  }
  return node;
}

/** Showroom items: real kit elements seeded from sample data, grouped by tab. */
type Slot = { tag: string; label: string; note?: string; h?: string };
const CARD_SLOTS: Slot[] = [
  { tag: 'kai-confirm', label: 'Confirm', note: 'Approve / decline — primary + secondary' },
  { tag: 'kai-choice', label: 'Choice', note: 'Pick one — accent marks the pick' },
  { tag: 'kai-tasks', label: 'Tasks', note: 'Selectable plan — checkboxes + confirm' },
  { tag: 'kai-form', label: 'Form', note: 'Inputs, selects, submit' },
  { tag: 'kai-link-preview', label: 'Link preview', note: 'Surface + muted text' },
];
const COMPONENT_SLOTS: Slot[] = [
  { tag: 'kai-model-switcher', label: 'Model switcher' },
  { tag: 'kai-context', label: 'Context meter' },
  { tag: 'kai-tool', label: 'Tool call', note: 'Tool hues' },
  { tag: 'kai-reasoning', label: 'Reasoning' },
  { tag: 'kai-chain-of-thought', label: 'Chain of thought' },
  { tag: 'kai-code-block', label: 'Code block', note: 'Code font + accent' },
  { tag: 'kai-loader', label: 'Loader', note: 'Primary' },
  { tag: 'kai-feedback-bar', label: 'Feedback bar' },
  { tag: 'kai-prompt-input', label: 'Composer', note: 'Base font + input' },
  { tag: 'kai-conversations', label: 'Conversations', h: '15rem' },
  { tag: 'kai-file-tree', label: 'File tree', h: '15rem' },
  { tag: 'kai-attachments', label: 'Attachments' },
];

/** Shared modal: centered panel + backdrop, portaled to <body> so the editor's
 *  overflow can't clip it. Escape/backdrop close is wired by the caller. */
function Modal(props: { title: string; onClose: () => void; wide?: boolean; children: JSX.Element }) {
  return (
    <Portal>
      <div class="fixed inset-0 z-[300] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" onClick={props.onClose} aria-hidden="true" />
        <div class="relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl" classList={{ 'max-w-3xl': props.wide, 'max-w-lg': !props.wide }}>
          <div class="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 class="text-sm font-bold text-ink">{props.title}</h2>
            <button type="button" onClick={props.onClose} aria-label="Close" class="flex size-7 cursor-pointer appearance-none items-center justify-center rounded-md border-0 bg-transparent text-ink-3 transition-colors hover:bg-ink/5 hover:text-ink"><IconClose class="size-4" /></button>
          </div>
          <div class="min-h-0 flex-1 overflow-auto p-4">{props.children}</div>
        </div>
      </div>
    </Portal>
  );
}

type Palette = Record<string, string>;

/** Every token's light/dark default, read out of the kit's own theme.css. */
const KIT_DEFAULTS = parseKitDefaults(kitCss);
const kitDefault = (token: string, mode: 'light' | 'dark'): string => {
  const d = KIT_DEFAULTS.get(token);
  if (!d) throw new Error(`theme.css declares no ${token}; the theme editor lists a knob that would theme nothing.`);
  return d[mode];
};
const DEFAULT_RADIUS = remValue(kitDefault('--kai-radius', 'light')); // rem

/** A rung's default rem, from theme.css. */
const rungDef = (r: TextRung): number => remValue(kitDefault(r.token, 'light'));
const TEXT_STEP = 0.0625; // rem — 1px at a 16px root
type TextScale = Record<string, number>;
const seedText = (): TextScale => Object.fromEntries(TEXT_RUNGS.map((r) => [r.token, rungDef(r)]));
/** Fill any rung a saved/imported scale is missing (older presets, partial paste). */
const fillText = (t: TextScale | undefined): TextScale => ({ ...seedText(), ...(t ?? {}) });
/** rem → px at the 16px root, for the readout beside each slider. */
const remPx = (rem: number) => `${Math.round(rem * 16 * 100) / 100}px`;

/** Resolve any CSS color (hex, hsl, oklch, named…) to #rrggbb for a native color
 *  input. Uses a canvas so CSS Color 4 formats like oklch convert to real sRGB
 *  bytes — getComputedStyle returns oklch unconverted in some engines. */
let _cv: HTMLCanvasElement | undefined;
function toHex(css: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(css)) return css.toLowerCase();
  _cv ??= document.createElement('canvas');
  _cv.width = _cv.height = 1;
  const ctx = _cv.getContext('2d');
  if (!ctx) return '#000000';
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000000';
  ctx.fillStyle = css; // invalid input is ignored → stays #000000
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** A global palette nudge: hue is a degree offset, saturation/lightness are
 *  multipliers. Identity (no change) is { h: 0, s: 1, l: 1 }. */
type Hsl = { h: number; s: number; l: number };
const HSL_IDENTITY: Hsl = { h: 0, s: 1, l: 1 };
const isIdentity = (a: Hsl) => a.h === 0 && a.s === 1 && a.l === 1;

/** #rrggbb → [hue 0–360, sat 0–1, light 0–1]. */
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = h * 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

/** Apply the HSL nudge to one hex color. */
function shiftHsl(hex: string, a: Hsl): string {
  const px = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : toHex(hex);
  const [h, s, l] = hexToHsl(px);
  return hslToHex(h + a.h, s * a.s, l * a.l);
}

/** Apply the nudge across a whole palette (no-op at identity, so colors round-trip
 *  losslessly when the adjustment is unused). */
function shiftPalette(p: Palette, a: Hsl): Palette {
  if (isIdentity(a)) return p;
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, shiftHsl(v, a)]));
}

/** Any CSS color expression → #rrggbb. Plain colors go through the canvas; a
 *  color-mix() (or anything else the canvas parser can't take) is evaluated by
 *  the browser through a hidden probe element's background-color. */
let _probe: HTMLElement | undefined;
function cssToHex(expr: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(expr)) return expr.toLowerCase();
  if (!/color-mix\(|var\(/.test(expr)) return toHex(expr);
  if (!_probe) {
    _probe = document.createElement('div');
    _probe.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;visibility:hidden';
    document.body.appendChild(_probe);
  }
  _probe.style.backgroundColor = '';
  _probe.style.backgroundColor = expr;
  return toHex(getComputedStyle(_probe).backgroundColor);
}

/** The full palette for one mode as hex, from the kit's defaults with `overrides`
 *  (raw CSS values, e.g. a preset's oklch strings) laid over them. The derived
 *  tokens — surface, the soft status tints, hover, selected — default in
 *  theme.css to a color-mix over OTHER tokens, so their `var(--color-x)`
 *  references are substituted from this same palette first: a preset's surface
 *  then follows the preset's muted/background, exactly as it does in the kit. */
function resolvePalette(mode: 'light' | 'dark', overrides: Palette = {}): Palette {
  const out: Palette = {};
  const inFlight = new Set<string>();
  const resolve = (token: string): string => {
    if (out[token]) return out[token];
    if (overrides[token]) return (out[token] = cssToHex(overrides[token]));
    if (inFlight.has(token)) return '#000000'; // a cycle would be a theme.css bug
    inFlight.add(token);
    const expr = kitDefault(token, mode).replace(/var\(\s*--color-([a-z0-9-]+)\s*\)/g, (_, name: string) => resolve(`--kai-color-${name}`));
    out[token] = cssToHex(expr);
    inFlight.delete(token);
    return out[token];
  };
  for (const t of ALL_TOKENS) resolve(t.token);
  return out;
}

/** All selectable themes: the kit default + the ported tweakcn presets. */
const ALL_THEME_NAMES = ['Default', ...THEME_PRESETS.map((t) => t.name)];

/** A few representative swatches for a theme's dropdown row (light palette). */
function themeDots(name: string): string[] {
  const t = THEME_PRESETS.find((x) => x.name === name);
  if (!t) return ['#18181b', '#f4f4f5', '#e5e7eb', '#ffffff', '#3f3f46']; // Default
  return [t.light.primary, t.light.accent, t.light.secondary, t.light.background, t.light.foreground].map(toHex);
}

/** Curated font choices for the Typography section. value = the full CSS stack
 *  (empty = the kit default). Google-hosted families load on demand for preview. */
const BODY_FONTS: { label: string; value: string }[] = [
  { label: 'System default', value: '' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Geist', value: 'Geist, sans-serif' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'Open Sans', value: '"Open Sans", sans-serif' },
  { label: 'Lato', value: 'Lato, sans-serif' },
  { label: 'Poppins', value: 'Poppins, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, sans-serif' },
  { label: 'Nunito', value: 'Nunito, sans-serif' },
  { label: 'Work Sans', value: '"Work Sans", sans-serif' },
  { label: 'Space Grotesk', value: '"Space Grotesk", sans-serif' },
  { label: 'DM Sans', value: '"DM Sans", sans-serif' },
  { label: 'Merriweather (serif)', value: 'Merriweather, serif' },
  { label: 'Lora (serif)', value: 'Lora, serif' },
  { label: 'Playfair Display (serif)', value: '"Playfair Display", serif' },
  { label: 'Libre Baskerville (serif)', value: '"Libre Baskerville", serif' },
  { label: 'Source Serif 4 (serif)', value: '"Source Serif 4", serif' },
  { label: 'Architects Daughter (hand)', value: '"Architects Daughter", cursive' },
];
const CODE_FONTS: { label: string; value: string }[] = [
  { label: 'System mono', value: '' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Fira Code', value: '"Fira Code", monospace' },
  { label: 'IBM Plex Mono', value: '"IBM Plex Mono", monospace' },
  { label: 'Source Code Pro', value: '"Source Code Pro", monospace' },
  { label: 'Space Mono', value: '"Space Mono", monospace' },
  { label: 'Geist Mono', value: '"Geist Mono", monospace' },
];

/** Load a font family from Google Fonts on demand so the preview shows the real
 *  typeface (the kit token only SELECTS the family — production embeds it itself). */
function ensureFont(stack: string) {
  if (!stack) return;
  const first = stack.split(',')[0].trim().replace(/["']/g, '');
  if (!first || /^(ui-|system-ui|-apple|sans-serif|serif|monospace|cursive|Arial|Helvetica|Georgia|Times|Menlo|Consolas|Courier|Monaco)/i.test(first)) return;
  const id = 'kai-gf-' + first.replace(/\s+/g, '-').toLowerCase();
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(first)}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

/** Match a font stack to a curated option value by first-family name (so a theme's
 *  full stack selects the right dropdown entry); '' if none match. */
function matchFont(stack: string | undefined, list: { value: string }[]): string {
  if (!stack) return '';
  const first = stack.split(',')[0].trim().replace(/["']/g, '').toLowerCase();
  const hit = list.find((o) => o.value.split(',')[0].trim().replace(/["']/g, '').toLowerCase() === first);
  return hit ? hit.value : '';
}

const SEED_MESSAGES = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Can I match the chat to my brand?' }] },
  {
    id: 'm2',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: 'Every color is a `--kai-color-*` token, so a handful of overrides reskins the whole UI. Set `--kai-color-primary` for your accent and `--kai-color-ring` for the focus outline, then drag the radius. Watch it all reskin live.',
      },
    ],
    actions: ['copy', 'like'],
  },
];

const REPLY =
  'Drop these tokens on `:root` to rebrand every `kai-*` element, or scope them to one wrapper to theme a single section. Same block, light and dark — `:root` for light, `.dark` for the dark overrides.';

let uid = 0;
const nextId = () => `s${++uid}`;

// ── Embed mode (builder iframe) ──────────────────────────────────────────────
// Active when loaded with ?embed=1 or inside an iframe. The studio then posts
// to its parent window, targeted at the page's OWN origin (never '*') — the
// builder serves the studio and hosts the iframe from the same server, so
// same-origin holds; a cross-origin host simply receives nothing.
//
// studio → host: { type: 'kai-theme-change', ...ThemePayload }  after a REAL
//                user edit — never on seeding (write-free open: the host
//                debounce-writes every change frame to disk, so a seed echo
//                would overwrite the construct's saved theme with a full
//                resolved palette carrying zero edits)
// studio → host: { type: 'kai-theme-apply',  ...ThemePayload }  Apply button
// studio → host: { type: 'kai-theme-close' }                    Close button
// host → studio: { type: 'kai-theme-init', theme: ThemePayload } seeds state
//                (handled whenever it arrives — the listener attaches on mount)
//
// The canonical `theme` shape in every direction is the FLAT ThemePayload
// (theme-payload.ts — the one type both sides import; the builder folds the
// construct file's nested `theme.tokens` flat before posting init).
// applyHostTheme below additionally tolerates the nested construct shape and
// a bare `accent`, defensively, so a stale host can't silently seed nothing.
import { type ThemePayload } from '../../src/themes/theme-payload';
export type { ThemePayload };
/** What a host may put in kai-theme-init's `theme`: canonically a flat
 *  ThemePayload; tolerated, the construct file's own nested shape. */
type HostInitTheme = Partial<ThemePayload> & { tokens?: Partial<ThemePayload>; accent?: string };
const isEmbedded = (): boolean =>
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).has('embed') || window.parent !== window);

/** Rail layout: `?embed=1` EXACTLY — not the inside-an-iframe heuristic above
 *  (Storybook/docs iframes must keep the full showroom). With the flag, the
 *  studio hides its own showroom and renders as a narrow control rail: the
 *  builder puts the user's REAL preview beside it, so the showroom would be a
 *  fake app next to the actual one. Without the flag the layout is untouched. */
const isRail = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('embed');

interface ThemeExtras { radius: number; fontBase: string; fontCode: string; tracking: number; shadow: string; text: TextScale }

/** Build paste-ready CSS: full light set on :root (+ radius/type scale/font/
 *  tracking/shadow), dark set on .dark. */
function buildCss(light: Palette, dark: Palette, x: ThemeExtras): string {
  const rootExtra = [
    `  --kai-radius: ${x.radius}rem;`,
    ...TEXT_RUNGS.map((r) => `  ${r.token}: ${x.text[r.token] ?? rungDef(r)}rem;`),
    x.fontBase ? `  --kai-font-base: ${x.fontBase};` : '',
    x.fontCode ? `  --kai-font-code: ${x.fontCode};` : '',
    x.tracking ? `  --kai-tracking: ${x.tracking}em;` : '',
    x.shadow ? `  --kai-shadow-color: ${x.shadow};` : '',
  ].filter(Boolean).join('\n');
  const body = (p: Palette, extra = ''): string =>
    [...ALL_TOKENS.map((t) => `  ${t.token}: ${p[t.token]};`), extra].filter(Boolean).join('\n');
  return `:root {\n${body(light, rootExtra)}\n}\n\n.dark {\n${body(dark)}\n}`;
}

/** Tolerant parse of pasted CSS: pull --kai-* declarations from the :root block
 *  (light) and the .dark block (dark). Unknown tokens are ignored. */
function parseCss(css: string): { light: Palette; dark: Palette; radius?: number; text: TextScale } | null {
  const grab = (selector: string): Palette => {
    const re = new RegExp(`${selector}\\s*\\{([^}]*)\\}`);
    const block = css.match(re)?.[1] ?? '';
    const out: Palette = {};
    for (const m of block.matchAll(/(--kai-color-[a-z-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    return out;
  };
  const light = grab(':root');
  const dark = grab('\\.dark');
  const anyText = /--kai-text-[a-z-]+\s*:\s*[\d.]+rem/.test(css);
  if (!Object.keys(light).length && !Object.keys(dark).length && !anyText) return null;
  const radiusMatch = css.match(/--kai-radius\s*:\s*([\d.]+)rem/);
  // Type scale: rem only, and only rungs the kit actually has.
  const text: TextScale = {};
  for (const m of css.matchAll(/(--kai-text-[a-z-]+)\s*:\s*([\d.]+)rem/g)) {
    if (TEXT_RUNGS.some((r) => r.token === m[1])) text[m[1]] = parseFloat(m[2]);
  }
  return { light, dark, radius: radiusMatch ? parseFloat(radiusMatch[1]) : undefined, text };
}

export default function ThemeStudio() {
  let chatHost: (HTMLElement & Record<string, unknown>) | undefined;
  let canvasEl: HTMLDivElement | undefined;
  let streamTimer: number | undefined;
  // Showroom slots: { container, tag } captured during render, mounted after loadKit.
  const slots: { el: HTMLElement; tag: string }[] = [];
  const registerSlot = (el: HTMLElement | undefined, tag: string) => { if (el) slots.push({ el, tag }); };

  const [ready, setReady] = createSignal(false);
  const [mode, setMode] = createSignal<'light' | 'dark'>('light');
  const [light, setLight] = createSignal<Palette>({});
  const [dark, setDark] = createSignal<Palette>({});
  const [radius, setRadius] = createSignal(DEFAULT_RADIUS);
  const [fontBase, setFontBase] = createSignal('');
  const [fontCode, setFontCode] = createSignal('');
  const [tracking, setTracking] = createSignal(0); // em
  const [textScale, setTextScale] = createSignal<TextScale>(seedText()); // --kai-text-* rungs, rem
  const [shadowColor, setShadowColor] = createSignal('#000000');
  // Global HSL nudge — layered non-destructively over the edited palette.
  const [hsl, setHsl] = createSignal<Hsl>({ ...HSL_IDENTITY });
  const [preset, setPreset] = createSignal('Default');
  // Custom presets the user saves (persisted to localStorage).
  type SavedPreset = { name: string; light: Palette; dark: Palette; radius: number; fontBase: string; fontCode: string; tracking: number; shadow: string; text?: TextScale };
  const PRESET_KEY = 'kai-theme-studio-presets';
  const [saved, setSaved] = createSignal<SavedPreset[]>([]);
  const persistSaved = (list: SavedPreset[]) => { setSaved(list); try { localStorage.setItem(PRESET_KEY, JSON.stringify(list)); } catch { /* storage blocked */ } };
  const [canvasTab, setCanvasTab] = createSignal<'chat' | 'cards' | 'components'>('chat');
  const [inspectorTab, setInspectorTab] = createSignal<'colors' | 'typography' | 'other'>('colors');
  const [copied, setCopied] = createSignal(false);
  const [codeOpen, setCodeOpen] = createSignal(false);
  const [importOpen, setImportOpen] = createSignal(false);
  const [saveOpen, setSaveOpen] = createSignal(false);
  const [saveName, setSaveName] = createSignal('');
  const [saveError, setSaveError] = createSignal('');
  const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null); // saved-theme name pending delete
  const [importText, setImportText] = createSignal('');
  const [importError, setImportError] = createSignal('');
  const [themeOpen, setThemeOpen] = createSignal(false);
  const [themeSearch, setThemeSearch] = createSignal('');
  let themeMenu: HTMLDivElement | undefined;
  const filteredThemes = () => ALL_THEME_NAMES.filter((n) => n.toLowerCase().includes(themeSearch().toLowerCase()));
  // Accordion: open the two most-used groups by default, collapse the rest.
  const [openGroups, setOpenGroups] = createSignal<Record<string, boolean>>(
    Object.fromEntries(GROUPS.map((g, i) => [g.name, i < 2])),
  );
  const toggleGroup = (name: string) => setOpenGroups((o) => ({ ...o, [name]: !o[name] }));

  const active = () => (mode() === 'light' ? light() : dark());
  const extras = (): ThemeExtras => ({ radius: radius(), fontBase: fontBase(), fontCode: fontCode(), tracking: tracking(), shadow: shadowColor(), text: textScale() });
  // The palette as the canvas/export actually see it: base colors + the HSL nudge.
  const effLight = () => shiftPalette(light(), hsl());
  const effDark = () => shiftPalette(dark(), hsl());
  const effActive = () => (mode() === 'light' ? effLight() : effDark());
  const hslActive = () => !isIdentity(hsl());

  // ── Embed mode: payload + messaging (contract documented above) ────────────
  const embed = isEmbedded();
  const rail = isRail();
  // Rail mode streams changes only AFTER the host's kai-theme-init has seeded
  // state: before that the studio holds the kit DEFAULT palette, and streaming
  // it would overwrite the construct's real theme in the ~300ms before init
  // lands. The builder posts init on iframe load, so this gate opens at once;
  // a rail host that never seeds gets no stream (its side of the contract).
  // Non-rail embeds keep the original stream-from-ready behavior.
  const [seeded, setSeeded] = createSignal(!rail);
  const themePayload = (): ThemePayload => {
    const rootExtras: Record<string, string> = {};
    const scale = textScale();
    for (const r of TEXT_RUNGS) rootExtras[r.token] = `${scale[r.token] ?? rungDef(r)}rem`;
    if (tracking()) rootExtras['--kai-tracking'] = `${tracking()}em`;
    rootExtras['--kai-shadow-color'] = shadowColor();
    const fonts: Record<string, string> = {};
    if (fontBase()) fonts['--kai-font-base'] = fontBase();
    if (fontCode()) fonts['--kai-font-code'] = fontCode();
    return {
      light: { ...effLight(), ...rootExtras },
      dark: { ...effDark() },
      radius: `${radius()}rem`,
      ...(Object.keys(fonts).length ? { fonts } : {}),
    };
  };
  const postToHost = (type: 'kai-theme-change' | 'kai-theme-apply'): void => {
    window.parent.postMessage({ type, ...themePayload() }, window.location.origin);
  };
  const postClose = (): void => {
    window.parent.postMessage({ type: 'kai-theme-close' }, window.location.origin);
  };
  // Write-free open: a change frame means "the USER edited something", so the
  // effect below must not fire for the seeding itself — setSeeded(true) is a
  // dependency write, and before this gate existed opening the takeover posted
  // one full resolved palette with zero edits, which the host debounce-wrote
  // over the construct's saved theme. `seedSnapshot` is the payload exactly as
  // seeded; the stream opens the first time the payload differs from it.
  // Non-rail embeds that never receive an init keep the original
  // stream-from-ready behavior (seedSnapshot stays undefined, so the first
  // run counts as the edit).
  let applyingInit = false;
  let seedSnapshot: string | undefined;
  let editedSinceSeed = false;
  if (embed) {
    createEffect(() => {
      const payload = themePayload(); // read first so every knob is tracked
      if (!ready() || !seeded() || applyingInit) return;
      if (!editedSinceSeed) {
        if (JSON.stringify(payload) === seedSnapshot) return; // the seed itself, not an edit
        editedSinceSeed = true;
      }
      window.parent.postMessage({ type: 'kai-theme-change', ...payload }, window.location.origin);
    });
  }
  /** Seed state from a host's kai-theme-init. Colors flow through
   *  resolvePalette so anything the host does not name gets the kit default —
   *  the same path a saved preset takes. */
  const applyHostTheme = (raw: HostInitTheme): void => {
    applyingInit = true; // a re-init must not stream its own setters as edits
    // Canonical init is the FLAT ThemePayload; a host still posting the
    // construct's nested shape ({ tokens: {…}, accent }) is folded flat here
    // rather than silently seeding kit defaults over a saved theme.
    const t: Partial<ThemePayload> =
      raw.light || raw.dark || raw.radius || raw.fonts ? raw
      : raw.tokens && (raw.tokens.light || raw.tokens.dark || raw.tokens.radius || raw.tokens.fonts) ? raw.tokens
      : raw.accent ? { light: { '--kai-color-primary': raw.accent } }
      : {};
    setHsl({ ...HSL_IDENTITY });
    const colors = (rec: Record<string, string> | undefined): Palette =>
      Object.fromEntries(Object.entries(rec ?? {}).filter(([k]) => k.startsWith('--kai-color-')));
    setLight(resolvePalette('light', colors(t.light)));
    setDark(resolvePalette('dark', colors(t.dark)));
    const text: TextScale = {};
    for (const r of TEXT_RUNGS) {
      const m = t.light?.[r.token]?.match(/^([\d.]+)rem$/);
      if (m) text[r.token] = parseFloat(m[1]);
    }
    setTextScale(fillText(Object.keys(text).length ? text : undefined));
    const rm = t.radius?.match(/^([\d.]+)rem$/);
    setRadius(rm ? parseFloat(rm[1]) : DEFAULT_RADIUS);
    const tr = t.light?.['--kai-tracking']?.match(/^(-?[\d.]+)em$/);
    setTracking(tr ? parseFloat(tr[1]) : 0);
    const sh = t.light?.['--kai-shadow-color'];
    setShadowColor(sh ? toHex(sh) : '#000000');
    setFontBase(t.fonts?.['--kai-font-base'] ?? '');
    setFontCode(t.fonts?.['--kai-font-code'] ?? '');
    ensureFont(fontBase());
    ensureFont(fontCode());
    setPreset('Custom');
    seedSnapshot = JSON.stringify(themePayload()); // the state a change frame must DIFFER from
    editedSinceSeed = false;
    applyingInit = false;
    setSeeded(true); // host state is in — the rail's change stream may open (on the first real edit)
  };

  // Apply the active palette + radius onto the canvas wrapper. Custom properties
  // inherit through every kai-* shadow root inside, so the whole canvas reskins.
  createEffect(() => {
    if (!canvasEl || !Object.keys(active()).length) return;
    const p = effActive();
    for (const t of ALL_TOKENS) canvasEl.style.setProperty(t.token, p[t.token]);
    canvasEl.style.setProperty('--kai-radius', `${radius()}rem`);
    canvasEl.style.background = p['--kai-color-background'];
    // Typography + shadow tokens.
    const setOrClear = (name: string, val: string) => val ? canvasEl!.style.setProperty(name, val) : canvasEl!.style.removeProperty(name);
    setOrClear('--kai-font-base', fontBase());
    setOrClear('--kai-font-code', fontCode());
    canvasEl.style.setProperty('--kai-tracking', `${tracking()}em`);
    const scale = textScale();
    for (const r of TEXT_RUNGS) canvasEl.style.setProperty(r.token, `${scale[r.token] ?? rungDef(r)}rem`);
    canvasEl.style.setProperty('--kai-shadow-color', shadowColor());
    ensureFont(fontBase());
    ensureFont(fontCode());
    // Keep every kai-* in the canvas on the studio's mode (independent of the page
    // theme) — covers the chat plus all showroom elements, however many.
    canvasEl.querySelectorAll('*').forEach((el) => {
      if (el.tagName.toLowerCase().startsWith('kai-')) el.setAttribute('theme', mode());
    });
  });

  const setColor = (token: string, hex: string) => {
    (mode() === 'light' ? setLight : setDark)((v) => ({ ...v, [token]: hex }));
    setPreset('Custom');
  };

  const loadTheme = (name: string) => {
    setHsl({ ...HSL_IDENTITY }); // a fresh theme starts from an un-nudged palette
    // A user-saved preset stores full palettes + extras — apply directly.
    const s = saved().find((x) => x.name === name);
    if (s) {
      // Tokens the kit grew after the preset was saved get their derived default.
      setLight(resolvePalette('light', s.light)); setDark(resolvePalette('dark', s.dark)); setRadius(s.radius);
      setFontBase(s.fontBase); setFontCode(s.fontCode); setTracking(s.tracking); setShadowColor(s.shadow);
      setTextScale(fillText(s.text));
      ensureFont(s.fontBase); ensureFont(s.fontCode);
      setPreset(name);
      return;
    }
    const lo: Palette = {};
    const dk: Palette = {};
    setTextScale(seedText()); // no built-in preset ships a type scale — back to the kit ladder
    const t = THEME_PRESETS.find((x) => x.name === name);
    if (t) {
      for (const [k, tok] of Object.entries(SHADCN_TO_KAI)) {
        if (t.light[k]) lo[tok] = t.light[k];
        if (t.dark[k]) dk[tok] = t.dark[k];
      }
      // The kit has a code-foreground token tweakcn doesn't — derive it from the
      // theme's ring so inline code stays on-brand.
      if (t.light.ring) lo['--kai-color-code-foreground'] = t.light.ring;
      if (t.dark.ring) dk['--kai-color-code-foreground'] = t.dark.ring;
      setRadius(t.radius);
      setFontBase(matchFont(t.fontBase, BODY_FONTS) || t.fontBase || '');
      setFontCode(matchFont(t.fontCode, CODE_FONTS) || t.fontCode || '');
      setTracking(t.tracking ? (parseFloat(t.tracking) || 0) : 0);
      setShadowColor(t.shadow ? toHex(t.shadow) : '#000000');
    } else {
      setRadius(DEFAULT_RADIUS);
      setFontBase('');
      setFontCode('');
      setTracking(0);
      setShadowColor('#000000');
    }
    // Everything the preset doesn't name — and every derived token — comes from
    // theme.css, computed over the preset's own colors.
    setLight(resolvePalette('light', lo));
    setDark(resolvePalette('dark', dk));
    setPreset(name);
  };

  const reset = () => loadTheme('Default');

  const openSave = () => {
    setSaveName(preset() === 'Custom' || saved().some((s) => s.name === preset()) ? (preset() === 'Custom' ? '' : preset()) : '');
    setSaveError('');
    setSaveOpen(true);
  };
  const commitSave = () => {
    const name = saveName().trim();
    if (!name) { setSaveError('Give the theme a name.'); return; }
    const p: SavedPreset = { name, light: effLight(), dark: effDark(), radius: radius(), fontBase: fontBase(), fontCode: fontCode(), tracking: tracking(), shadow: shadowColor(), text: textScale() };
    persistSaved([...saved().filter((x) => x.name !== name), p]);
    setPreset(name);
    setSaveOpen(false);
  };
  const deleteSaved = (name: string) => persistSaved(saved().filter((x) => x.name !== name));

  /** Swatch dots for a row — handles saved presets (full palette) + built-ins. */
  const dotsFor = (name: string): string[] => {
    const s = saved().find((x) => x.name === name);
    if (s) return ['--kai-color-primary', '--kai-color-accent', '--kai-color-secondary', '--kai-color-background', '--kai-color-foreground'].map((k) => s.light[k] || '#888888');
    return themeDots(name);
  };

  const copyCss = async () => {
    try {
      await navigator.clipboard.writeText(buildCss(effLight(), effDark(), extras()));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  const applyImport = () => {
    const parsed = parseCss(importText());
    if (!parsed) {
      setImportError('No --kai-color-* or --kai-text-* tokens found. Paste a :root / .dark block.');
      return;
    }
    setLight((v) => ({ ...v, ...parsed.light }));
    setDark((v) => ({ ...v, ...parsed.dark }));
    if (parsed.radius !== undefined) setRadius(parsed.radius);
    if (Object.keys(parsed.text).length) setTextScale((v) => ({ ...v, ...parsed.text }));
    setPreset('Custom');
    setImportOpen(false);
    setImportText('');
    setImportError('');
  };

  // Canned streaming reply so the previewed chat feels live.
  const onSubmit = (e: Event) => {
    const text = (e as CustomEvent).detail?.value?.trim();
    if (!text || !chatHost) return;
    const aId = nextId();
    chatHost.messages = [
      ...((chatHost.messages as unknown[]) ?? []),
      { id: nextId(), role: 'user', parts: [{ type: 'text', text }] },
      { id: aId, role: 'assistant', parts: [] },
    ];
    chatHost.loading = true;
    const words = REPLY.split(/(\s+)/);
    let i = 0;
    const tick = () => {
      i += 2;
      const partial = words.slice(0, i).join('');
      const done = i >= words.length;
      chatHost!.messages = ((chatHost!.messages as { id: string }[]) ?? []).map((m) =>
        m.id === aId ? { ...m, parts: [{ type: 'text', text: partial }], ...(done ? { actions: ['copy', 'like'] } : {}) } : m,
      );
      if (!done) streamTimer = window.setTimeout(tick, 38);
      else chatHost!.loading = false;
    };
    clearTimeout(streamTimer);
    streamTimer = window.setTimeout(tick, 240);
  };

  onMount(async () => {
    try { setSaved(JSON.parse(localStorage.getItem(PRESET_KEY) || '[]')); } catch { /* ignore */ }
    loadTheme('Default');
    const onDocDown = (e: PointerEvent) => {
      if (themeOpen() && themeMenu && !themeMenu.contains(e.target as Node)) setThemeOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmDelete()) setConfirmDelete(null);
      else if (saveOpen()) setSaveOpen(false);
      else if (codeOpen()) setCodeOpen(false);
      else if (importOpen()) setImportOpen(false);
      else if (themeOpen()) setThemeOpen(false);
    };
    // Captured at setup: a teardown path must never resolve a DOM global bare
    // (see tests/components/teardown-without-dom-globals.test.tsx). For the
    // window, capture the FUNCTION, not just the view: `window === globalThis`,
    // and teardown deletes the `removeEventListener` key off that very object,
    // so `win.removeEventListener` at cleanup is undefined. The document is a
    // real object with its own prototype chain, so `doc` needs no such pin.
    const doc = document;
    const win = window;
    const unlisten = win.removeEventListener.bind(win);
    doc.addEventListener('pointerdown', onDocDown);
    doc.addEventListener('keydown', onKey);
    // Embed: accept a late-arriving kai-theme-init from the host. Origin-checked
    // against our own origin — the builder serves studio and host page from the
    // same server. Attached from mount, so init can land any time after load.
    const onHostMessage = (e: MessageEvent): void => {
      if (e.origin !== win.location.origin) return;
      const d = e.data as { type?: unknown; theme?: unknown } | null;
      if (!d || d.type !== 'kai-theme-init' || typeof d.theme !== 'object' || d.theme === null) return;
      applyHostTheme(d.theme as HostInitTheme);
    };
    if (embed) win.addEventListener('message', onHostMessage);
    onCleanup(() => {
      doc.removeEventListener('pointerdown', onDocDown);
      doc.removeEventListener('keydown', onKey);
      if (embed) unlisten('message', onHostMessage);
    });
    // Rail mode renders no showroom: nothing to mount, no element bundle to
    // load — the rail is tokens/tabs/presets only.
    if (rail) {
      setReady(true);
      onCleanup(() => clearTimeout(streamTimer));
      return;
    }
    await loadKit();
    if (chatHost) {
      customElements.upgrade(chatHost);
      chatHost.messages = SEED_MESSAGES;
      chatHost.chatTitle = 'Brand assistant';
      chatHost.placeholder = 'Ask how theming works…';
      chatHost.suggestions = ['Which tokens matter most?', 'Does this hold in dark mode?'];
      chatHost.models = [
        { id: 'sonnet', name: 'Claude Sonnet', provider: 'Anthropic' },
        { id: 'opus', name: 'Claude Opus', provider: 'Anthropic' },
      ];
      chatHost.currentModel = 'sonnet';
      chatHost.context = { usedTokens: 18500, maxTokens: 200000 };
      chatHost.addEventListener('kai-submit', onSubmit);
    }
    // Mount the showroom (cards + components) from verified sample data.
    for (const s of slots) {
      try { mountSample(s.el, s.tag, mode()); } catch { /* skip a misbehaving element */ }
    }
    setReady(true);
    onCleanup(() => {
      clearTimeout(streamTimer);
      chatHost?.removeEventListener('kai-submit', onSubmit);
    });
  });

  const swatch = 'h-7 w-7 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0';

  /** A labeled slider paired with a number field for exact entry. The slider
   *  tracks live while dragging; the field commits on change/Enter (clamped). */
  const SliderRow = (props: { label: string; value: number; min: number; max: number; step: number; unit?: string; onInput: (n: number) => void }) => {
    const clamp = (n: number) => Math.min(props.max, Math.max(props.min, n));
    return (
      <div class="flex items-center gap-2.5 text-sm">
        <span class="w-[4.5rem] shrink-0 text-ink-2">{props.label}</span>
        <input
          type="range" min={props.min} max={props.max} step={props.step} value={props.value}
          onInput={(e) => props.onInput(parseFloat(e.currentTarget.value))}
          class="min-w-0 flex-1" style={{ 'accent-color': 'var(--kai-ink-3)' }} aria-label={props.label}
        />
        <input
          type="number" min={props.min} max={props.max} step={props.step} value={props.value}
          onChange={(e) => {
            const n = parseFloat(e.currentTarget.value);
            if (Number.isNaN(n)) { e.currentTarget.value = String(props.value); return; }
            props.onInput(clamp(n));
          }}
          class="w-16 shrink-0 rounded-md border border-line bg-surface px-1.5 py-1 text-right text-xs tabular-nums text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={`${props.label} value`}
        />
        <span class="w-7 shrink-0 text-xs text-ink-3">{props.unit ?? ''}</span>
      </div>
    );
  };

  /** One type-size rung. Two lines rather than SliderRow's one, because these
   *  labels are words ("Body (default)") not one-word knob names, and the row
   *  carries a px readout beside the rem — a type scale is the one place the
   *  computed pixel size is what you're actually judging. */
  const RungRow = (props: { r: TextRung }) => {
    const val = () => textScale()[props.r.token] ?? rungDef(props.r);
    const set = (n: number) => {
      const v = Math.min(props.r.max, Math.max(props.r.min, n));
      setTextScale((t) => ({ ...t, [props.r.token]: v }));
      setPreset('Custom');
    };
    return (
      <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between gap-2">
          <span class="shrink-0 text-sm font-medium text-ink">{props.r.label}</span>
          <span class="truncate text-[11px] text-ink/55">{props.r.hint}</span>
        </div>
        <div class="flex items-center gap-2.5">
          <input
            type="range" min={props.r.min} max={props.r.max} step={TEXT_STEP} value={val()}
            onInput={(e) => set(parseFloat(e.currentTarget.value))}
            class="min-w-0 flex-1" style={{ 'accent-color': 'var(--kai-ink-3)' }} aria-label={`${props.r.label} size`}
          />
          <input
            type="number" min={props.r.min} max={props.r.max} step={TEXT_STEP} value={val()}
            onChange={(e) => {
              const n = parseFloat(e.currentTarget.value);
              if (Number.isNaN(n)) { e.currentTarget.value = String(val()); return; }
              set(n);
            }}
            class="w-16 shrink-0 rounded-md border border-line bg-surface px-1.5 py-1 text-right text-xs tabular-nums text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label={`${props.r.label} size in rem`}
          />
          <span class="w-[4.5rem] shrink-0 text-right text-xs tabular-nums text-ink-3">rem · {remPx(val())}</span>
        </div>
      </div>
    );
  };

  const textIsDefault = () => TEXT_RUNGS.every((r) => (textScale()[r.token] ?? rungDef(r)) === rungDef(r));

  /** One showroom item: a labeled, bordered slot the element mounts into. */
  const ShowSlot = (props: { s: Slot }) => (
    <div class="flex flex-col gap-1.5 rounded-xl border p-3" style={{ 'border-color': 'var(--kai-color-border)' }}>
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-xs font-semibold" style={{ color: 'var(--kai-color-foreground)' }}>{props.s.label}</span>
        <Show when={props.s.note}><span class="text-[11px]" style={{ color: 'var(--kai-color-muted-foreground)' }}>{props.s.note}</span></Show>
      </div>
      <div ref={(el) => registerSlot(el, props.s.tag)} style={props.s.h ? { height: props.s.h, overflow: 'auto' } : undefined} />
    </div>
  );

  return (
    <div
      class="theme-studio-root not-content flex flex-col overflow-hidden border-line bg-surface"
      classList={{
        'my-4 rounded-xl border lg:h-[82vh] lg:min-h-[660px]': !rail,
        // Rail: the iframe IS the frame — fill it, no chrome of our own.
        'h-dvh': rail,
      }}
    >
      {/* Full-width toolbar: theme selector (left) · mode + actions (right).
          In the rail (~400px) the row wraps rather than clipping. */}
      <div class="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5" classList={{ 'flex-wrap': rail }}>
        {/* Theme selector — searchable dropdown of the kit default + tweakcn presets */}
        <div ref={themeMenu} class="relative">
          <button
            type="button"
            onClick={() => setThemeOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={themeOpen()}
            class="flex w-[260px] max-w-[60vw] items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink transition-colors hover:bg-ink/5"
          >
            <span class="flex items-center gap-0.5">
              <For each={dotsFor(preset())}>{(c) => <span class="size-2.5 rounded-full ring-1 ring-black/10" style={{ background: c }} />}</For>
            </span>
            <span class="truncate font-medium">{preset()}</span>
            <IconChevron class="ml-auto h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform" classList={{ 'rotate-90': themeOpen() }} />
          </button>
          <Show when={themeOpen()}>
            <div class="absolute left-0 top-full z-50 mt-1 w-[300px] max-w-[80vw] overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
              <div class="border-b border-line p-2">
                <input
                  value={themeSearch()}
                  onInput={(e) => setThemeSearch(e.currentTarget.value)}
                  placeholder="Search themes…"
                  class="w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
                />
              </div>
              <div class="max-h-[60vh] overflow-auto">
                <Show when={saved().filter((s) => s.name.toLowerCase().includes(themeSearch().toLowerCase())).length}>
                  <div class="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink/45">Your themes</div>
                  <For each={saved().filter((s) => s.name.toLowerCase().includes(themeSearch().toLowerCase()))}>
                    {(s) => (
                      <div class="group flex w-full items-center gap-2 px-2.5 py-1.5 text-sm transition-colors hover:bg-ink/5" classList={{ 'bg-ink/[0.07] font-semibold text-ink': preset() === s.name, 'text-ink-2': preset() !== s.name }}>
                        <button type="button" onClick={() => { loadTheme(s.name); setThemeOpen(false); setThemeSearch(''); }} class="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <span class="flex items-center gap-0.5">
                            <For each={dotsFor(s.name)}>{(c) => <span class="size-2.5 rounded-full ring-1 ring-black/10" style={{ background: c }} />}</For>
                          </span>
                          <span class="truncate">{s.name}</span>
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(s.name)} aria-label={`Delete ${s.name}`} class="shrink-0 rounded p-0.5 text-ink-3 transition-colors hover:bg-ink/10 hover:text-ink"><IconClose class="size-3.5" /></button>
                      </div>
                    )}
                  </For>
                  <div class="mx-2.5 my-1 border-t border-line/60" />
                </Show>
                <For each={filteredThemes()}>
                  {(name) => (
                    <button
                      type="button"
                      onClick={() => { loadTheme(name); setThemeOpen(false); setThemeSearch(''); }}
                      class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-ink/5"
                      classList={{ 'bg-ink/[0.07] font-semibold text-ink': preset() === name, 'text-ink-2': preset() !== name }}
                    >
                      <span class="flex items-center gap-0.5">
                        <For each={dotsFor(name)}>{(c) => <span class="size-2.5 rounded-full ring-1 ring-black/10" style={{ background: c }} />}</For>
                      </span>
                      <span class="truncate">{name}</span>
                    </button>
                  )}
                </For>
                <Show when={!filteredThemes().length && !saved().filter((s) => s.name.toLowerCase().includes(themeSearch().toLowerCase())).length}>
                  <div class="px-2.5 py-3 text-center text-xs text-ink/55">No themes match.</div>
                </Show>
              </div>
            </div>
          </Show>
        </div>

        {/* Mode + actions */}
        <div class="flex items-center gap-1.5" classList={{ 'flex-wrap justify-end': rail }}>
          <div class="inline-flex overflow-hidden rounded-md border border-line text-xs">
            <button type="button" class="px-2.5 py-1 transition-colors" classList={{ 'bg-ink text-bg': mode() ==='light', 'text-ink-2': mode() !== 'light' }} onClick={() => setMode('light')}>Light</button>
            <button type="button" class="px-2.5 py-1 transition-colors" classList={{ 'bg-ink text-bg': mode() ==='dark', 'text-ink-2': mode() !== 'dark' }} onClick={() => setMode('dark')}>Dark</button>
          </div>
          <button type="button" onClick={() => setImportOpen(true)} class="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 transition-colors hover:bg-ink/5"><IconImport class="h-3.5 w-3.5" /><span class="hidden sm:inline">Import</span></button>
          <button type="button" onClick={reset} class="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 transition-colors hover:bg-ink/5"><IconReset class="h-3.5 w-3.5" /><span class="hidden sm:inline">Reset</span></button>
          <button type="button" onClick={openSave} class="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 transition-colors hover:bg-ink/5"><IconSave class="h-3.5 w-3.5" /><span class="hidden sm:inline">Save</span></button>
          <button type="button" onClick={() => setCodeOpen(true)} class="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-ink/5"><IconCode class="h-3.5 w-3.5" />Code</button>
          <Show when={embed}>
            {/* Semantics are visible in the labels (owner ruling): Apply = keep
                what the live stream wrote (kai-theme-apply → the host's Done);
                Cancel = kai-theme-close → the host restores its snapshot. */}
            <button type="button" onClick={() => postToHost('kai-theme-apply')} class="flex items-center gap-1.5 rounded-md bg-ink px-2.5 py-1 text-xs font-semibold text-bg transition-opacity hover:opacity-90"><IconCheck class="h-3.5 w-3.5" />Apply</button>
            <button type="button" onClick={postClose} class="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"><IconClose class="h-3.5 w-3.5" />Cancel</button>
          </Show>
        </div>
      </div>

      {/* Body: inspector · canvas */}
      <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Inspector — Colors / Typography / Other tabs. In rail mode there is
            no canvas beside it, so it takes the whole width and height. */}
        <div
          class="flex w-full flex-col overflow-auto"
          classList={{
            'shrink-0 border-b border-line lg:w-[380px] lg:border-b-0 lg:border-r': !rail,
            'min-h-0 flex-1': rail,
          }}
        >
          <div class="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-surface px-3 py-2">
            <For each={[['colors', 'Colors'], ['typography', 'Typography'], ['other', 'Other']] as const}>
              {([id, label]) => (
                <button type="button" onClick={() => setInspectorTab(id)} class="rounded-md px-2.5 py-1 text-sm transition-colors" classList={{ 'bg-ink/[0.07] font-semibold text-ink': inspectorTab() === id, 'text-ink-3 hover:text-ink': inspectorTab() !== id }}>{label}</button>
              )}
            </For>
          </div>

          <Show when={inspectorTab() === 'colors'}>
          <Show when={hslActive()}>
            <p class="border-b border-line/60 px-3 py-2 text-xs text-ink/55">A global HSL adjustment is active — swatches show base colors. Reset it in <span class="font-medium text-ink-2">Other</span> to edit them directly.</p>
          </Show>
          <For each={GROUPS}>
            {(group) => (
              <div class="border-b border-line/60 last:border-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.name)}
                  aria-expanded={openGroups()[group.name]}
                  class="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-ink/[0.03]"
                >
                  <IconChevron class="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform" classList={{ 'rotate-90': openGroups()[group.name] }} />
                  <span class="text-xs font-semibold uppercase tracking-wide text-ink-2">{group.name}</span>
                  <span class="ml-auto flex items-center gap-1">
                    <For each={group.tokens.slice(0, 5)}>
                      {(t) => <span class="size-3 rounded-full ring-1 ring-black/10" style={{ background: active()[t.token] ?? 'transparent' }} />}
                    </For>
                  </span>
                </button>
                <Show when={openGroups()[group.name]}>
                  <div class="flex flex-col gap-2 px-3 pb-3 pt-0.5">
                    <For each={group.tokens}>
                      {(t) => (
                        <label class="flex items-center gap-2.5">
                          <input
                            type="color"
                            value={cssToHex(active()[t.token] ?? '#000000')}
                            onInput={(e) => setColor(t.token, e.currentTarget.value)}
                            aria-label={t.label}
                            class={swatch}
                          />
                          <span class="flex min-w-0 flex-col leading-tight">
                            <span class="truncate text-sm font-medium text-ink">{t.label}</span>
                            <span class="truncate text-xs text-ink/55">{t.hint}</span>
                          </span>
                        </label>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
          </Show>

          {/* Typography tab */}
          <Show when={inspectorTab() === 'typography'}>
          <div class="px-3 py-3">
            <label class="mb-2.5 flex flex-col gap-1">
              <span class="text-sm font-medium text-ink">Body font</span>
              <select
                value={fontBase()}
                onChange={(e) => { setFontBase(e.currentTarget.value); ensureFont(e.currentTarget.value); setPreset('Custom'); }}
                class="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
              >
                <For each={BODY_FONTS}>{(f) => <option value={f.value}>{f.label}</option>}</For>
                <Show when={fontBase() && !BODY_FONTS.some((f) => f.value === fontBase())}>
                  <option value={fontBase()}>{fontBase().split(',')[0].replace(/["']/g, '')} (theme)</option>
                </Show>
              </select>
            </label>
            <label class="mb-2.5 flex flex-col gap-1">
              <span class="text-sm font-medium text-ink">Code font</span>
              <select
                value={fontCode()}
                onChange={(e) => { setFontCode(e.currentTarget.value); ensureFont(e.currentTarget.value); setPreset('Custom'); }}
                class="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
              >
                <For each={CODE_FONTS}>{(f) => <option value={f.value}>{f.label}</option>}</For>
                <Show when={fontCode() && !CODE_FONTS.some((f) => f.value === fontCode())}>
                  <option value={fontCode()}>{fontCode().split(',')[0].replace(/["']/g, '')} (theme)</option>
                </Show>
              </select>
            </label>
            <SliderRow label="Tracking" value={tracking()} min={-0.05} max={0.2} step={0.005} unit="em" onInput={(n) => { setTracking(n); setPreset('Custom'); }} />
          </div>
          <div class="border-t border-line/60 px-3 py-3">
            <div class="mb-1 flex items-center justify-between gap-2">
              <span class="text-xs font-semibold uppercase tracking-wide text-ink-2">Type size</span>
              <Show when={!textIsDefault()}>
                <button type="button" onClick={() => { setTextScale(seedText()); setPreset('Custom'); }} class="rounded px-1.5 py-0.5 text-[11px] text-ink-3 transition-colors hover:bg-ink/5 hover:text-ink">Reset</button>
              </Show>
            </div>
            <p class="mb-3 text-xs text-ink/55">One semantic scale for the whole kit — each rung is a <span class="font-mono text-ink-2">--kai-text-*</span> token, so moving it moves every component that sits on that rung. Body is the medium rung the rest step off.</p>
            <div class="flex flex-col gap-3">
              <For each={TEXT_RUNGS}>{(r) => <RungRow r={r} />}</For>
            </div>
          </div>
          </Show>

          {/* Other tab — HSL adjustment + shape + shadow */}
          <Show when={inspectorTab() === 'other'}>
          <div class="px-3 py-3">
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="text-xs font-semibold uppercase tracking-wide text-ink-2">HSL adjustment</span>
              <Show when={hslActive()}>
                <button type="button" onClick={() => { setHsl({ ...HSL_IDENTITY }); setPreset('Custom'); }} class="rounded px-1.5 py-0.5 text-[11px] text-ink-3 transition-colors hover:bg-ink/5 hover:text-ink">Reset</button>
              </Show>
            </div>
            <p class="mb-2.5 text-xs text-ink/55">Nudge the whole palette at once. Layered over your colors — reset to leave them untouched.</p>
            <div class="flex flex-col gap-2.5">
              <SliderRow label="Hue" value={hsl().h} min={-180} max={180} step={1} unit="deg" onInput={(n) => { setHsl((a) => ({ ...a, h: n })); setPreset('Custom'); }} />
              <SliderRow label="Saturation" value={hsl().s} min={0} max={2} step={0.05} unit="x" onInput={(n) => { setHsl((a) => ({ ...a, s: n })); setPreset('Custom'); }} />
              <SliderRow label="Lightness" value={hsl().l} min={0} max={2} step={0.05} unit="x" onInput={(n) => { setHsl((a) => ({ ...a, l: n })); setPreset('Custom'); }} />
            </div>
          </div>
          <div class="border-t border-line/60 px-3 py-3">
            <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-2">Shape</div>
            <SliderRow label="Radius" value={radius()} min={0} max={1.4} step={0.05} unit="rem" onInput={(n) => { setRadius(n); setPreset('Custom'); }} />
          </div>
          <div class="border-t border-line/60 px-3 py-3">
            <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-2">Shadow</div>
            <label class="flex items-center gap-2.5">
              <input type="color" value={shadowColor()} onInput={(e) => { setShadowColor(e.currentTarget.value); setPreset('Custom'); }} class={swatch} aria-label="Shadow color" />
              <span class="flex min-w-0 flex-col leading-tight">
                <span class="truncate text-sm font-medium text-ink">Shadow color</span>
                <span class="truncate text-xs text-ink/55">Elevation tint — cards, popovers</span>
              </span>
            </label>
          </div>
          </Show>
        </div>

        {/* Canvas — the showroom. Hidden entirely in rail mode: the builder
            puts the user's REAL app preview beside the rail instead, so the
            token-application effect above no-ops (canvasEl stays unset) and
            the theme travels only through the postMessage stream. */}
        <Show when={!rail}>
        <div ref={canvasEl} classList={{ dark: mode() === 'dark' }} class="relative min-w-0 flex-1 overflow-auto">
          <Show when={!ready()}>
            <div class="absolute inset-0 z-20 grid place-items-center text-sm text-ink/55">Loading preview…</div>
          </Show>

          {/* Tab bar — themed, sticky. Each tab demonstrates a different slice of
              the tokens so a developer can see where they apply. */}
          <div class="sticky top-0 z-10 flex items-center gap-1 border-b px-4 py-2" style={{ 'border-color': 'var(--kai-color-border)', background: 'var(--kai-color-background)' }}>
            <For each={[['chat', 'Chat'], ['cards', 'Cards'], ['components', 'Components']] as const}>
              {([id, label]) => (
                <button
                  type="button"
                  onClick={() => setCanvasTab(id)}
                  class="rounded-md px-3 py-1 text-sm transition-colors"
                  style={canvasTab() === id
                    ? { background: 'color-mix(in oklab, var(--kai-color-foreground) 9%, transparent)', color: 'var(--kai-color-foreground)', 'font-weight': '600' }
                    : { color: 'var(--kai-color-muted-foreground)' }}
                >
                  {label}
                </button>
              )}
            </For>
          </div>

          <div class="mx-auto max-w-4xl p-4">
            {/* Chat — a full working example */}
            <div classList={{ hidden: canvasTab() !== 'chat' }}>
              <p class="mb-2 text-xs" style={{ color: 'var(--kai-color-muted-foreground)' }}>A full chat — messages, model switcher, context meter, suggestions, the composer, and the base font.</p>
              <div class="h-[460px] overflow-hidden rounded-xl border" style={{ 'border-color': 'var(--kai-color-border)' }}>
                <kai-chat ref={(el: HTMLElement) => (chatHost = el as never)} style={{ display: 'block', height: '100%' }} />
              </div>
            </div>

            {/* Cards — generative-UI surfaces, from real sample data */}
            <div classList={{ hidden: canvasTab() !== 'cards' }}>
              <p class="mb-3 text-xs" style={{ color: 'var(--kai-color-muted-foreground)' }}>Generative-UI cards — surfaces + elevation, primary / secondary / destructive buttons, accents, and inputs.</p>
              <div class="grid gap-4 lg:grid-cols-2">
                <For each={CARD_SLOTS}>{(s) => <ShowSlot s={s} />}</For>
              </div>
            </div>

            {/* Components — a cross-section of the kit portfolio */}
            <div classList={{ hidden: canvasTab() !== 'components' }} class="flex flex-col gap-4">
              <p class="text-xs" style={{ color: 'var(--kai-color-muted-foreground)' }}>A cross-section of the kit — see your colors, fonts, and shadow across the components you'll actually ship.</p>
              <div class="grid gap-3 sm:grid-cols-2">
                <For each={COMPONENT_SLOTS}>{(s) => <ShowSlot s={s} />}</For>
              </div>
              {/* Coverage strip — tokens not surfaced at rest, reading the live vars.
                  Status badges are solid + soft pairs (bg-success / bg-success-soft
                  with text-success); the interaction row is hover / selected /
                  unread; the surface row is the three surface steps over the
                  card. `data-token` names the token each chip paints with. */}
              <div class="flex flex-col gap-2 rounded-xl border p-3" style={{ 'border-color': 'var(--kai-color-border)', color: 'var(--kai-color-foreground)' }}>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="mr-1 text-xs" style={{ color: 'var(--kai-color-muted-foreground)' }}>Status:</span>
                  <For each={['success', 'warning', 'info', 'destructive'] as const}>
                    {(k) => (
                      <>
                        <span data-token={`--kai-color-${k}`} class="rounded-md px-2.5 py-1 text-xs font-medium capitalize" style={{ background: `var(--kai-color-${k})`, color: `var(--kai-color-${k}-foreground)` }}>{k}</span>
                        <span data-token={`--kai-color-${k}-soft`} class="rounded-md px-2.5 py-1 text-xs font-medium capitalize" style={{ background: `var(--kai-color-${k}-soft)`, color: `var(--kai-color-${k})` }}>{k} soft</span>
                      </>
                    )}
                  </For>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="mr-1 text-xs" style={{ color: 'var(--kai-color-muted-foreground)' }}>Interaction:</span>
                  <span data-token="--kai-color-hover" class="rounded-md px-2.5 py-1 text-xs" style={{ background: 'var(--kai-color-hover)' }}>Hover</span>
                  <span data-token="--kai-color-selected" class="rounded-md px-2.5 py-1 text-xs" style={{ background: 'var(--kai-color-selected)' }}>Selected</span>
                  <span class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs" style={{ background: 'var(--kai-color-card)', border: '1px solid var(--kai-color-border)' }}>
                    Unread <span data-token="--kai-color-unread" class="size-2 rounded-full" style={{ background: 'var(--kai-color-unread)' }} />
                  </span>
                  <span class="rounded-md px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--kai-color-secondary)', color: 'var(--kai-color-secondary-foreground)' }}>Secondary</span>
                  <span class="rounded-md px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--kai-color-popover)', color: 'var(--kai-color-popover-foreground)', border: '1px solid var(--kai-color-border)' }}>Popover</span>
                  <code class="rounded px-1.5 py-0.5 text-xs" style={{ color: 'var(--kai-color-code-foreground)', background: 'color-mix(in oklab, var(--kai-color-code-foreground) 15%, transparent)' }}>inline code</code>
                  <span class="ml-1 flex items-center gap-1">
                    <span class="h-3.5 w-3.5 rounded-full" style={{ background: 'var(--kai-color-tool-blue)' }} />
                    <span class="h-3.5 w-3.5 rounded-full" style={{ background: 'var(--kai-color-tool-amber)' }} />
                    <span class="h-3.5 w-3.5 rounded-full" style={{ background: 'var(--kai-color-tool-green)' }} />
                    <span class="h-3.5 w-3.5 rounded-full" style={{ background: 'var(--kai-color-tool-red)' }} />
                  </span>
                </div>
                <div class="flex flex-wrap items-center gap-2 rounded-lg p-2" style={{ background: 'var(--kai-color-card)', border: '1px solid var(--kai-color-border)' }}>
                  <span class="mr-1 text-xs" style={{ color: 'var(--kai-color-muted-foreground)' }}>Surfaces on card:</span>
                  <span data-token="--kai-color-surface" class="rounded-md px-2.5 py-1 text-xs" style={{ background: 'var(--kai-color-surface)' }}>Surface</span>
                  <span data-token="--kai-color-surface-strong" class="rounded-md px-2.5 py-1 text-xs" style={{ background: 'var(--kai-color-surface-strong)' }}>Strong</span>
                  <span data-token="--kai-color-surface-sunken" class="rounded-md px-2.5 py-1 text-xs" style={{ background: 'var(--kai-color-surface-sunken)' }}>Sunken</span>
                  <span class="rounded-md px-2.5 py-1 text-xs" style={{ background: 'var(--kai-color-card)', border: '1px solid var(--kai-color-input)' }}>Input edge</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        </Show>
      </div>

      <Show when={codeOpen()}>
        <Modal title="Theme CSS" wide onClose={() => setCodeOpen(false)}>
          <p class="mb-3 text-xs text-ink-2">Drop this on <code class="rounded bg-ink/5 px-1">:root</code> to rebrand every <code class="rounded bg-ink/5 px-1">kai-*</code> element; the <code class="rounded bg-ink/5 px-1">.dark</code> block holds the dark overrides.</p>
          <div class="relative">
            <button type="button" onClick={copyCss} class="absolute right-2 top-2 flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-ink/5">{copied() ? <IconCheck class="h-3.5 w-3.5" /> : <IconCopy class="h-3.5 w-3.5" />}{copied() ? 'Copied' : 'Copy'}</button>
            <pre class="max-h-[62vh] overflow-auto rounded-lg border border-line bg-surface-2 p-3 pr-20 font-mono text-xs leading-relaxed text-ink"><code>{buildCss(effLight(), effDark(), extras())}</code></pre>
          </div>
        </Modal>
      </Show>

      <Show when={importOpen()}>
        <Modal title="Import theme" onClose={() => { setImportOpen(false); setImportError(''); }}>
          <p class="mb-2 text-xs text-ink-2">Paste a <code class="rounded bg-ink/5 px-1">:root</code> / <code class="rounded bg-ink/5 px-1">.dark</code> block of <code class="rounded bg-ink/5 px-1">--kai-color-*</code> tokens. Any CSS color works, including one with alpha.</p>
          <textarea
            value={importText()}
            onInput={(e) => setImportText(e.currentTarget.value)}
            placeholder={':root {\n  --kai-color-primary: #7c3aed;\n}\n.dark {\n  --kai-color-primary: #a78bfa;\n}'}
            class="h-48 w-full resize-none rounded-md border border-line bg-surface p-2 font-mono text-xs text-ink"
          />
          <Show when={importError()}><p class="mt-1 text-xs text-red-500">{importError()}</p></Show>
          <div class="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { setImportOpen(false); setImportError(''); }} class="rounded-md border border-line px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-ink/5">Cancel</button>
            <button type="button" onClick={applyImport} class="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-bg transition-opacity hover:opacity-90">Apply</button>
          </div>
        </Modal>
      </Show>

      <Show when={saveOpen()}>
        <Modal title="Save theme" onClose={() => setSaveOpen(false)}>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink">Theme name</span>
            <input
              autofocus
              value={saveName()}
              onInput={(e) => { setSaveName(e.currentTarget.value); setSaveError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') commitSave(); }}
              placeholder="e.g. Acme brand"
              class="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <Show when={saveName().trim() && saved().some((s) => s.name === saveName().trim())}>
            <p class="mt-1.5 text-xs text-ink-3">A saved theme named “{saveName().trim()}” will be overwritten.</p>
          </Show>
          <Show when={saveError()}><p class="mt-1.5 text-xs text-red-500">{saveError()}</p></Show>
          <p class="mt-2 text-xs text-ink-3">Stored in your browser (localStorage), so it sticks around on this device.</p>
          <div class="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setSaveOpen(false)} class="rounded-md border border-line px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-ink/5">Cancel</button>
            <button type="button" onClick={commitSave} class="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-bg transition-opacity hover:opacity-90">Save theme</button>
          </div>
        </Modal>
      </Show>

      <Show when={confirmDelete()}>
        {(name) => (
          <Modal title="Delete theme" onClose={() => setConfirmDelete(null)}>
            <p class="text-sm text-ink-2">Delete the saved theme <strong class="text-ink">“{name()}”</strong>? This can't be undone.</p>
            <div class="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} class="rounded-md border border-line px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-ink/5">Cancel</button>
              <button type="button" onClick={() => { deleteSaved(name()); setConfirmDelete(null); }} class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90">Delete</button>
            </div>
          </Modal>
        )}
      </Show>
    </div>
  );
}
