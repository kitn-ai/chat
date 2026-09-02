/** The theme studio's token catalog, kept apart from ThemeStudio.tsx so a test can
 *  import it without dragging in the icon plugin and the kit bundle.
 *
 *  Two things live here and they are deliberately different in kind:
 *
 *  - WHICH tokens the editor exposes, with a label and a hint each (GROUPS,
 *    TEXT_RUNGS, EXTRA_TOKENS). That is curated: the grouping and the wording are
 *    a product call, so it is a hand-written list.
 *  - WHAT each token defaults to. That is NOT curated: it is a fact theme.css
 *    already states, so it is parsed out of the file (`parseKitDefaults`) rather
 *    than retyped. Before this the studio carried its own light/dark literals
 *    and they had drifted -- `--kai-color-input` was still the old border value
 *    long after theme.css lifted it to a 3:1 control boundary.
 *
 *  The list is guarded: packages/ui/tests/styles/theme-studio-coverage.test.ts
 *  derives every `--kai-*` name theme.css declares and fails if one is missing
 *  here, so adding a token to the kit without a knob in the editor is a red CI.
 */

/** One editable color: the full `--kai-*` name plus the inspector's label/hint. */
export type TokenDef = { token: string; label: string; hint: string };
export type Group = { name: string; tokens: TokenDef[] };

export const GROUPS: Group[] = [
  {
    name: 'Surfaces',
    tokens: [
      { token: '--kai-color-background', label: 'Background', hint: 'App / chat surface' },
      { token: '--kai-color-foreground', label: 'Foreground', hint: 'Default text' },
      { token: '--kai-color-card', label: 'Card', hint: 'Bubbles, panels, cards' },
      { token: '--kai-color-card-foreground', label: 'Card text', hint: 'Text on cards' },
      { token: '--kai-color-popover', label: 'Popover', hint: 'Menus & popovers' },
      { token: '--kai-color-popover-foreground', label: 'Popover text', hint: 'Text in popovers' },
      { token: '--kai-color-sidebar', label: 'Sidebar', hint: 'Conversation sidebar' },
      { token: '--kai-color-surface', label: 'Surface', hint: 'Composer, chips, card headers' },
      { token: '--kai-color-surface-strong', label: 'Surface strong', hint: 'Raised / hover step of surface' },
      { token: '--kai-color-surface-sunken', label: 'Surface sunken', hint: 'Wells, recessed below surface' },
    ],
  },
  {
    name: 'Brand & actions',
    tokens: [
      { token: '--kai-color-primary', label: 'Primary', hint: 'Buttons, accents, send' },
      { token: '--kai-color-primary-foreground', label: 'On primary', hint: 'Text on primary' },
      { token: '--kai-color-ring', label: 'Focus ring', hint: 'Keyboard-focus outline' },
      { token: '--kai-color-accent', label: 'Accent', hint: 'Hover / accent surface' },
      { token: '--kai-color-accent-foreground', label: 'On accent', hint: 'Text on accent' },
      { token: '--kai-color-secondary', label: 'Secondary', hint: 'Secondary surface' },
      { token: '--kai-color-secondary-foreground', label: 'On secondary', hint: 'Text on secondary' },
    ],
  },
  {
    name: 'Muted text',
    tokens: [
      { token: '--kai-color-muted', label: 'Muted', hint: 'Subtle fills' },
      { token: '--kai-color-muted-foreground', label: 'Muted text', hint: 'Secondary text' },
    ],
  },
  {
    name: 'Inputs & borders',
    tokens: [
      { token: '--kai-color-border', label: 'Border', hint: 'Dividers & card outlines' },
      { token: '--kai-color-input', label: 'Input', hint: 'Control edge: inputs, selects, checks' },
    ],
  },
  {
    name: 'Status',
    tokens: [
      { token: '--kai-color-destructive', label: 'Destructive', hint: 'Danger / delete' },
      { token: '--kai-color-destructive-foreground', label: 'On destructive', hint: 'Text on danger' },
      { token: '--kai-color-destructive-soft', label: 'Destructive soft', hint: 'Tinted danger callout' },
      { token: '--kai-color-success', label: 'Success', hint: 'Done / confirmed' },
      { token: '--kai-color-success-foreground', label: 'On success', hint: 'Text on success' },
      { token: '--kai-color-success-soft', label: 'Success soft', hint: 'Tinted success callout' },
      { token: '--kai-color-warning', label: 'Warning', hint: 'Caution / unsendable' },
      { token: '--kai-color-warning-foreground', label: 'On warning', hint: 'Text on warning' },
      { token: '--kai-color-warning-soft', label: 'Warning soft', hint: 'Tinted warning callout' },
      { token: '--kai-color-info', label: 'Info', hint: 'Informational toasts' },
      { token: '--kai-color-info-foreground', label: 'On info', hint: 'Text on info' },
      { token: '--kai-color-info-soft', label: 'Info soft', hint: 'Tinted info callout' },
    ],
  },
  {
    name: 'Interaction',
    tokens: [
      { token: '--kai-color-hover', label: 'Hover', hint: 'Row / control hover fill' },
      { token: '--kai-color-selected', label: 'Selected', hint: 'Selected row fill' },
      { token: '--kai-color-unread', label: 'Unread', hint: 'Unread dot & badge' },
      { token: '--kai-color-highlight', label: 'Highlight', hint: 'Marked keywords (composer highlights)' },
      { token: '--kai-color-selection', label: 'Selection', hint: 'Selected-text background' },
      { token: '--kai-color-selection-foreground', label: 'On selection', hint: 'Selected-text colour' },
    ],
  },
  {
    name: 'Code & tools',
    tokens: [
      { token: '--kai-color-code-foreground', label: 'Code', hint: 'Inline code accent' },
      { token: '--kai-color-tool-blue', label: 'Tool blue', hint: 'Tool / status chip' },
      { token: '--kai-color-tool-amber', label: 'Tool amber', hint: 'Tool / status chip' },
      { token: '--kai-color-tool-green', label: 'Tool green', hint: 'Tool / status chip' },
      { token: '--kai-color-tool-red', label: 'Tool red', hint: 'Tool / status chip' },
    ],
  },
  {
    name: 'Scrollbar',
    tokens: [
      { token: '--kai-color-scrollbar-thumb', label: 'Scrollbar', hint: 'Scrollbar thumb' },
      { token: '--kai-color-scrollbar-thumb-hover', label: 'Scrollbar hover', hint: 'Thumb on hover' },
    ],
  },
];

export const ALL_TOKENS: TokenDef[] = GROUPS.flatMap((g) => g.tokens);

/** The kit's semantic type scale. Every rung is a `--kai-text-*` token that
 *  theme.css resolves through (and that Tailwind's own text-xs/sm/base/lg are
 *  re-pointed at), so setting one here moves the whole kit, not one component.
 *  `body` is the medium rung the ladder hangs off -- labelled as such so nobody
 *  has to infer which one is the default. The default rem comes from theme.css
 *  (see `textRungDefault`); only the slider bounds are chosen here. */
export type TextRung = { token: string; label: string; hint: string; min: number; max: number };
export const TEXT_RUNGS: TextRung[] = [
  { token: '--kai-text-micro', label: 'Micro', hint: 'Badges, pills, eyebrows', min: 0.5, max: 1 },
  { token: '--kai-text-caption', label: 'Caption', hint: 'Sub-counts, xs code', min: 0.5, max: 1.125 },
  { token: '--kai-text-meta', label: 'Meta', hint: 'Controls, toggles, switchers', min: 0.5, max: 1.25 },
  { token: '--kai-text-compact', label: 'Compact', hint: 'Dense chrome & code', min: 0.5625, max: 1.3125 },
  { token: '--kai-text-body', label: 'Body (default)', hint: 'Primary reading text', min: 0.625, max: 1.375 },
  { token: '--kai-text-title', label: 'Title', hint: 'Emphasis & headers', min: 0.75, max: 1.625 },
  { token: '--kai-text-lg', label: 'Large', hint: 'Section headings, lg prose', min: 0.875, max: 2 },
];

/** The non-color, non-scale knobs the editor exposes on the Typography / Other
 *  tabs. `--kai-font-base` and `--kai-tracking` are declared in the kit's
 *  element stylesheet rather than theme.css; the rest resolve through theme.css. */
export const EXTRA_TOKENS = [
  '--kai-radius',
  '--kai-font-base',
  '--kai-font-code',
  '--kai-tracking',
  '--kai-shadow-color',
] as const;

/** Every `--kai-*` token the editor can edit, export and import. */
export function studioTokens(): ReadonlySet<string> {
  return new Set([
    ...ALL_TOKENS.map((t) => t.token),
    ...TEXT_RUNGS.map((r) => r.token),
    ...EXTRA_TOKENS,
  ]);
}

// ─── theme.css, read rather than retyped ─────────────────────────────────────

/** Light and dark defaults for one token, as the raw CSS text theme.css wrote
 *  (`hsl(...)`, `color-mix(...)`, `0.6rem`, a font stack). A token declared once
 *  outside any mode block (`--kai-font-code`, `--kai-shadow-color`) carries the
 *  same value in both. */
export type KitDefault = { light: string; dark: string };

/** Every `--kai-*` name theme.css declares, anchored on `var(` the same way the
 *  MCP theme tool reads it (mcp/mcp/tools/theme.ts): that is the
 *  only place a knob is wired up, and prose in the file mentions wildcards a bare
 *  `--kai-` scan would take for token names. */
export function declaredKitTokens(css: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const m of css.matchAll(/var\(\s*(--kai-[a-zA-Z0-9-]+)\s*[,)]/g)) names.add(m[1]);
  return names;
}

/** Parse `var(--kai-x, <default>)` out of theme.css, per mode. The `.dark { }`
 *  block is the dark scope; everything else is light. Defaults are read with a
 *  paren-balanced scan because a color-mix default nests its own parentheses
 *  and a font stack carries commas. Throws on a token declared with no fallback
 *  -- the editor would have nothing to seed and a silent blank is worse. */
export function parseKitDefaults(css: string): ReadonlyMap<string, KitDefault> {
  const darkStart = css.search(/^\.dark\s*\{/m);
  let darkEnd = -1;
  if (darkStart !== -1) {
    darkEnd = css.indexOf('\n}', darkStart);
    if (darkEnd === -1) darkEnd = css.length;
  }
  const light = new Map<string, string>();
  const dark = new Map<string, string>();
  const re = /var\(\s*(--kai-[a-zA-Z0-9-]+)\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let i = re.lastIndex;
    let depth = 1;
    while (i < css.length && depth > 0) {
      const c = css[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      if (depth > 0) i++;
    }
    const value = css.slice(re.lastIndex, i).trim();
    const inDark = darkStart !== -1 && m.index > darkStart && m.index < darkEnd;
    const bucket = inDark ? dark : light;
    if (!bucket.has(m[1])) bucket.set(m[1], value);
  }
  const out = new Map<string, KitDefault>();
  for (const name of declaredKitTokens(css)) {
    const l = light.get(name);
    const d = dark.get(name);
    if (l === undefined && d === undefined) {
      throw new Error(`theme.css declares ${name} with no fallback value; the theme editor cannot seed it.`);
    }
    out.set(name, { light: l ?? d!, dark: d ?? l! });
  }
  return out;
}

/** `0.8125rem` -> 0.8125. The type scale and radius are rem values in theme.css. */
export function remValue(css: string): number {
  const m = css.match(/^([\d.]+)rem$/);
  if (!m) throw new Error(`Expected a rem value, got "${css}"`);
  return parseFloat(m[1]);
}
