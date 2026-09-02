import { z } from 'zod';
import themeCss from '../../../theme.css?raw';
import type { Tool } from './types';

/**
 * theme — produce a `--kai-*` CSS token override block from a brand color or
 * description.
 *
 * WHICH tokens get branded is a curated product call (see BRAND_TOKENS below).
 * Their NAMES are not: every one is resolved against theme.css, whose text is
 * inlined above, so a name this tool emits is a name theme.css declares.
 *
 * That import is the whole fix and the reason it is an import rather than a
 * `readFile`. This module ships inside dist/mcp.es.js, an SSR bundle a consumer
 * runs from bin/mcp.js in their node_modules — a runtime read of a repo-root
 * path resolves to nothing there, and the src/ and dist/ depths differ anyway.
 * `?raw` bakes the bytes in at build time from the SAME theme.css that
 * package.json `files` ships (and `exports` publishes as "./theme.css"), so the
 * tarball's tool and the tarball's stylesheet cannot disagree by construction,
 * and there is no runtime I/O at all.
 *
 * Before this, the names were five string literals and a docblock claiming they
 * had been "verified against repo-root theme.css" — nothing read that file, so
 * renaming a token left the tool emitting the dead name, its test green, and an
 * agent pasting CSS that themes nothing.
 */

// ─── token names, read out of theme.css ──────────────────────────────────────

/**
 * Every `--kai-*` knob theme.css declares. Anchored on `var(` because that is
 * the only place a knob is really wired up — each kit token is written
 * `--color-x: var(--kai-color-x, <default>)`. Prose in the file mentions
 * wildcards like `--kai-color-*`, which a bare `--kai-` scan would pick up as
 * fictional token names.
 */
function declaredKaiTokens(css: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const m of css.matchAll(/var\(\s*(--kai-[a-zA-Z0-9-]+)\s*[,)]/g)) names.add(m[1]);
  return names;
}

const DECLARED_TOKENS = declaredKaiTokens(themeCss);

/**
 * Resolve one `--kai-color-<suffix>` against theme.css, or fail naming it.
 *
 * Refusing is deliberate — emitting a token nothing reads is the whole defect
 * this file exists to prevent — but it happens on the HANDLER path, not at
 * module load. `server.ts` imports all four tools statically at top level, so a
 * module-scope throw here took `reference`, `scaffold` and `debug` down with it;
 * measured against an installed tarball, `initialize` never returned and the
 * server exited before answering anything. Nothing was bought for that: the
 * guard in theme.test.ts calls `theme.handler(...)` directly, so it goes red on
 * exactly the same rename with exactly the same message either way. Handler
 * scope is pure isolation — `theme` alone reports the error, its three
 * neighbours keep working.
 */
function colorToken(suffix: string): string {
  const name = `--kai-color-${suffix}`;
  if (!DECLARED_TOKENS.has(name)) {
    throw new Error(
      `[kai mcp: theme] theme.css declares no \`${name}\`. The tool brands that token, ` +
        `so emitting it would hand the caller CSS that themes nothing. Either the token was ` +
        `renamed in packages/ui/theme.css (update the BRAND_TOKENS suffix in ` +
        `mcp/mcp/tools/theme.ts to match) or it was removed (drop the entry). ` +
        `Known --kai-color-* names: ${[...DECLARED_TOKENS].filter((n) => n.startsWith('--kai-color-')).sort().join(', ')}`,
    );
  }
  return name;
}

interface TokenSet {
  primary: string;
  primaryFg: string;
  ring: string;
  accent: string;
  accentFg: string;
}

interface BrandToken {
  /** Which computed value from a TokenSet fills this token. */
  key: keyof TokenSet;
  /** `--kai-color-<suffix>`, checked against theme.css. */
  suffix: string;
  /** One-line explanation, rendered in the "Tokens emitted" list. */
  purpose: string;
}

/**
 * The tokens a brand override needs, in emit order. This LIST is the curated
 * part — it is a judgement about what rebranding means, not a fact theme.css can
 * be asked for. It declares far more knobs than this (the error in colorToken
 * prints the current set); dumping all of them would be a worse answer than
 * picking the ones that carry a brand. The `suffix` of each is what gets checked.
 */
const BRAND_TOKENS: readonly BrandToken[] = [
  { key: 'primary', suffix: 'primary', purpose: 'primary brand color' },
  {
    key: 'primaryFg',
    suffix: 'primary-foreground',
    purpose: 'AA-contrast foreground on primary (auto-selected black/white)',
  },
  { key: 'ring', suffix: 'ring', purpose: 'keyboard focus ring' },
  { key: 'accent', suffix: 'accent', purpose: 'tinted accent surface' },
  { key: 'accentFg', suffix: 'accent-foreground', purpose: 'text on accent surface' },
];

interface EmittedTokens {
  readonly tokens: readonly { key: keyof TokenSet; name: string; purpose: string }[];
  /** Value-column offset, derived so the block stays aligned when a name changes length. */
  readonly valueColumn: number;
}

let memo: EmittedTokens | undefined;

/**
 * BRAND_TOKENS with each name resolved against theme.css, memoized.
 *
 * Called from the handler, so the resolution failure lands on the one tool that
 * cannot do its job (see colorToken). Only a SUCCESSFUL resolution is cached —
 * a failing one re-throws per call, which is what keeps the error the same on
 * the second request as on the first.
 */
function emittedTokens(): EmittedTokens {
  if (!memo) {
    const tokens = BRAND_TOKENS.map((t) => ({
      key: t.key,
      name: colorToken(t.suffix),
      purpose: t.purpose,
    }));
    memo = { tokens, valueColumn: Math.max(...tokens.map((t) => t.name.length + 1)) + 2 };
  }
  return memo;
}

// ─── hex color utilities (no deps) ──────────────────────────────────────────

/** Parse #rgb or #rrggbb → { r, g, b } 0-255. Returns null on failure. */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const s = hex.trim().replace(/^#/, '');
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16);
    const g = parseInt(s[1] + s[1], 16);
    const b = parseInt(s[2] + s[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  if (s.length === 6) {
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Relative luminance (WCAG 2.1) — used for AA contrast check.
 * Returns 0 (black) to 1 (white).
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** White or black for maximum contrast against the brand color. */
function foreground(r: number, g: number, b: number): '#ffffff' | '#000000' {
  const lum = relativeLuminance(r, g, b);
  // Contrast against white = (1 + 0.05) / (lum + 0.05)
  // Contrast against black = (lum + 0.05) / (0 + 0.05)
  const contrastWhite = 1.05 / (lum + 0.05);
  const contrastBlack = (lum + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? '#ffffff' : '#000000';
}

/** Lighten a color by a ratio 0-1 (moves toward white). */
function lighten(r: number, g: number, b: number, ratio: number): string {
  return toHex(
    r + (255 - r) * ratio,
    g + (255 - g) * ratio,
    b + (255 - b) * ratio,
  );
}

/** Darken a color by a ratio 0-1 (moves toward black). */
function darken(r: number, g: number, b: number, ratio: number): string {
  return toHex(r * (1 - ratio), g * (1 - ratio), b * (1 - ratio));
}

/** Produce a tinted accent surface (very light tint of the brand color). */
function accentSurface(r: number, g: number, b: number): string {
  return lighten(r, g, b, 0.88);
}

/** Dark-mode variant: lighten the brand so it reads well on dark backgrounds. */
function darkModeBrand(r: number, g: number, b: number): string {
  const lum = relativeLuminance(r, g, b);
  // If brand is already light enough for dark bg, keep it; otherwise lighten.
  if (lum > 0.25) return toHex(r, g, b);
  return lighten(r, g, b, 0.35);
}

/** Dark-mode accent surface: subtle dark tint of brand. */
function darkAccentSurface(r: number, g: number, b: number): string {
  return darken(r, g, b, 0.75);
}

// ─── keyword → hex fallback map ──────────────────────────────────────────────

const KEYWORD_COLORS: Record<string, string> = {
  blue:    '#3b82f6',
  navy:    '#1e3a8a',
  sky:     '#0ea5e9',
  cyan:    '#06b6d4',
  teal:    '#14b8a6',
  green:   '#22c55e',
  emerald: '#10b981',
  lime:    '#84cc16',
  yellow:  '#eab308',
  amber:   '#f59e0b',
  orange:  '#f97316',
  red:     '#ef4444',
  rose:    '#f43f5e',
  pink:    '#ec4899',
  purple:  '#a855f7',
  violet:  '#7c3aed',
  indigo:  '#6366f1',
  slate:   '#64748b',
  gray:    '#6b7280',
  zinc:    '#71717a',
  neutral: '#737373',
  stone:   '#78716c',
  white:   '#f8fafc',
  black:   '#0f172a',
};

const DEFAULT_BRAND = '#6366f1'; // indigo — kit's own brand feel

/**
 * Resolve a brand hex from input.
 * Returns { hex, note } where note explains the assumption if we guessed.
 */
function resolveBrand(
  brand?: string,
  description?: string,
): { hex: string; r: number; g: number; b: number; note: string } {
  // 1. Explicit hex
  if (brand) {
    const parsed = parseHex(brand);
    if (parsed) {
      return { hex: brand.startsWith('#') ? brand : `#${brand}`, ...parsed, note: '' };
    }
    // brand provided but unparseable — fall through with a note
    const fallback = parseHex(DEFAULT_BRAND)!;
    return {
      hex: DEFAULT_BRAND,
      ...fallback,
      note: `Could not parse \`${brand}\` as a hex color — defaulted to **${DEFAULT_BRAND}** (indigo). Pass a valid \`#rgb\` or \`#rrggbb\` value to use your color.`,
    };
  }

  // 2. Description → keyword match
  if (description) {
    const lower = description.toLowerCase();
    for (const [keyword, hex] of Object.entries(KEYWORD_COLORS)) {
      if (lower.includes(keyword)) {
        const parsed = parseHex(hex)!;
        return {
          hex,
          ...parsed,
          note: `No brand color provided — inferred **${hex}** (${keyword}) from description. Override with \`brand: '#rrggbb'\` to use an exact color.`,
        };
      }
    }
    // Description present but no keyword matched → tasteful default
    const parsed = parseHex(DEFAULT_BRAND)!;
    return {
      hex: DEFAULT_BRAND,
      ...parsed,
      note: `No recognizable color keyword in description — defaulted to **${DEFAULT_BRAND}** (indigo). Override with \`brand: '#rrggbb'\` for an exact color.`,
    };
  }

  // 3. Nothing provided → kit brand default
  const parsed = parseHex(DEFAULT_BRAND)!;
  return {
    hex: DEFAULT_BRAND,
    ...parsed,
    note: `No brand color or description provided — defaulted to **${DEFAULT_BRAND}** (indigo, the kit's own brand). Pass \`brand: '#rrggbb'\` to use your color.`,
  };
}

// ─── CSS block builders ───────────────────────────────────────────────────────

function buildTokenSet(r: number, g: number, b: number): TokenSet {
  const primary = toHex(r, g, b);
  const primaryFg = foreground(r, g, b);
  const accent = accentSurface(r, g, b);
  // foreground on the very-light accent surface
  const accentFgColor = foreground(
    ...([accent]
      .map((h) => parseHex(h)!)
      .flatMap((c) => [c.r, c.g, c.b]) as [number, number, number]),
  );
  return {
    primary,
    primaryFg,
    ring: primary,
    accent,
    accentFg: accentFgColor,
  };
}

function buildDarkTokenSet(r: number, g: number, b: number): TokenSet {
  const darkBrand = darkModeBrand(r, g, b);
  const parsed = parseHex(darkBrand)!;
  const primary = darkBrand;
  const primaryFg = foreground(parsed.r, parsed.g, parsed.b);
  const accent = darkAccentSurface(r, g, b);
  const accentFgParsed = parseHex(accent)!;
  return {
    primary,
    primaryFg,
    ring: darkBrand,
    accent,
    accentFg: foreground(accentFgParsed.r, accentFgParsed.g, accentFgParsed.b),
  };
}

function cssBlock(selector: string, values: TokenSet, emitted: EmittedTokens): string {
  return [
    `${selector} {`,
    ...emitted.tokens.map(
      (t) => `  ${`${t.name}:`.padEnd(emitted.valueColumn)}${values[t.key]};`,
    ),
    `}`,
  ].join('\n');
}

// ─── Tool definition ─────────────────────────────────────────────────────────

export const theme: Tool = {
  name: 'theme',
  description:
    'Generate a --kai-* CSS token override block from a brand color or description. ' +
    'Paste the block into your global stylesheet to brand every kai-* element in one shot.',

  inputSchema: z.object({
    brand: z
      .string()
      .optional()
      .describe('Brand color as #rgb or #rrggbb hex (e.g. "#7c3aed")'),
    description: z
      .string()
      .optional()
      .describe(
        'Natural-language description of your product (used to infer a color when `brand` is omitted)',
      ),
    mode: z
      .enum(['light', 'dark', 'both'])
      .optional()
      .describe(
        '"light" → :root only (default); "dark" → .dark only; "both" → :root + .dark',
      ),
  }),

  handler: async (args) => {
    const {
      brand,
      description,
      mode = 'light',
    } = args as { brand?: string; description?: string; mode?: 'light' | 'dark' | 'both' };

    // Resolve the token names against theme.css FIRST, so a name it no longer
    // declares fails this call and nothing else (see emittedTokens/colorToken).
    const emitted = emittedTokens();

    const { hex, r, g, b, note } = resolveBrand(brand, description);

    const lightTokens = buildTokenSet(r, g, b);
    const darkTokens = buildDarkTokenSet(r, g, b);

    // Which blocks to emit
    const blocks: string[] = [];
    if (mode === 'light' || mode === 'both') {
      blocks.push(cssBlock(':root', lightTokens, emitted));
    }
    if (mode === 'dark' || mode === 'both') {
      blocks.push(cssBlock('.dark', darkTokens, emitted));
    }

    const cssOutput = blocks.join('\n\n');

    const noteLabel = note.startsWith('Could not parse') ? 'Note' : 'Assumption';
    const noteSection = note ? `\n> **${noteLabel}:** ${note}\n` : '';

    // Same list, same source, so the prose can't describe a different set of
    // tokens than the CSS block above it.
    const tokenList = emitted.tokens.map((t) => `- \`${t.name}\` — ${t.purpose}`).join('\n');
    const firstToken = emitted.tokens[0].name;

    const text = `\
## AI/UI theme override — \`${hex}\`
${noteSection}
Paste this block into your **global stylesheet** (before the \`@import\` of \`@kitn.ai/ui\` or after — order doesn't matter since \`--kai-*\` tokens are resolved at runtime via \`var()\` fallbacks). For \`mode:'dark'\` overrides, the \`.dark\` class must be on a parent element (e.g. \`<html class="dark">\`) for them to take effect.

\`\`\`css
${cssOutput}
\`\`\`

### How it works

The \`--kai-color-*\` tokens pierce the Shadow DOM via CSS custom-property inheritance. Every \`kai-*\` element reads them through a \`var(${firstToken}, <default>)\` fallback chain defined in \`theme.css\`. Setting them on \`:root\` (or a wrapper element) is enough to rebrand everything globally.

**Tokens emitted** (names read from \`theme.css\`):
${tokenList}

### Apply to a subtree only

\`\`\`css
/* scope to a specific container instead of :root */
.my-chat-widget {
${blocks[0]
    ?.split('\n')
    .slice(1, -1)
    .map((l) => '  ' + l)
    .join('\n')}
}
\`\`\`

### Fine-tune the full palette

The theme editor lets you tweak every token interactively and copy the result:

**→ [Open Theme Editor](https://ui.kitn.ai/theme/editor/)**

For the complete token list see the [theming guide](https://ui.kitn.ai/guides/theming/) and the source \`theme.css\` in the package root.
`;

    return { content: [{ type: 'text', text }] };
  },
};
