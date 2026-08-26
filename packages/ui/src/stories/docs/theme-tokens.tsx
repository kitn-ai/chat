import { createSignal, For, onMount, type JSX } from 'solid-js';
import type { Palette } from './theme-editor/theme-css';

// Docs-only helpers (not part of the kit's public API). They auto-discover the
// kit's design tokens straight from the loaded CSS, so the reference + editor
// can never drift from theme.css as tokens are added or changed.

type ColorToken = { name: string; light: string; dark: string };
type RadiusToken = { name: string; value: string };
type TextToken = { name: string; size: string; lineHeight: string };

export const PURPOSE: Record<string, string> = {
  '--color-background': 'App / page background',
  '--color-foreground': 'Default text',
  '--color-card': 'Card surface',
  '--color-card-foreground': 'Text on cards',
  '--color-popover': 'Popover / menu surface',
  '--color-popover-foreground': 'Text in popovers',
  '--color-primary': 'Primary action background',
  '--color-primary-foreground': 'Text on primary',
  '--color-secondary': 'Secondary surface',
  '--color-secondary-foreground': 'Text on secondary',
  '--color-muted': 'Muted surface (subtle fills)',
  '--color-muted-foreground': 'Muted / secondary text',
  '--color-accent': 'Accent / hover surface',
  '--color-accent-foreground': 'Text on accent',
  '--color-destructive': 'Destructive / danger',
  '--color-destructive-foreground': 'Text on destructive',
  '--color-border': 'Decorative borders / dividers',
  '--color-input': 'Form-control boundary (≥ 3:1, WCAG 1.4.11)',
  '--color-ring': 'Focus ring',
  '--color-sidebar': 'Sidebar background',
  '--color-code-foreground': 'Inline code text / accent',
  '--color-surface': 'Raised surface (panels)',
  '--color-surface-strong': 'Stronger raised surface',
  '--color-surface-sunken': 'Recessed / inset surface',
  '--color-tool-blue': 'Tool-call accent: running / info',
  '--color-tool-green': 'Tool-call accent: success',
  '--color-tool-amber': 'Tool-call accent: pending / warning',
  '--color-tool-red': 'Tool-call accent: error',
  '--color-scrollbar-thumb': 'Custom scrollbar thumb',
  '--color-scrollbar-thumb-hover': 'Scrollbar thumb (hover)',
  '--text-body': 'Body copy',
  '--text-title': 'Headings / titles',
  '--text-caption': 'Captions / supporting text',
  '--text-meta': 'Meta / labels (smallest)',
};

/** Raw walk of loaded stylesheets → light/dark custom-property maps (colors + radius).
 *  Recurses into grouping rules (@layer, @media, @supports) because Tailwind v4
 *  emits the `:root` theme tokens inside an `@layer`, which a flat walk would miss. */
function collectTokens(): { light: Record<string, string>; dark: Record<string, string> } {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const r = rule as CSSStyleRule;
      if (r.selectorText && r.style) {
        const isRoot = /(^|,)\s*:root\b/.test(r.selectorText);
        const isDark = /(^|,)\s*\.dark\b/.test(r.selectorText);
        if (isRoot || isDark) {
          for (const prop of Array.from(r.style)) {
            if (!prop.startsWith('--color-') && !prop.startsWith('--radius')) continue;
            const val = r.style.getPropertyValue(prop).trim();
            if (isRoot) light[prop] = val;
            if (isDark) dark[prop] = val;
          }
        }
      }
      // Grouping rules (@layer/@media/@supports) carry nested rules: recurse.
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested) visit(nested);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // cross-origin sheet
    }
  }
  return { light, dark };
}

// The kit's radius tokens (Tailwind v4 also emits a default --radius-* scale, so
// these are listed explicitly rather than discovered).
const KIT_RADII = ['--radius', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl'];

/** Reference data for the token table. The kit's complete token set is the
 *  curated PURPOSE map (colors + typography) + KIT_RADII, reading VALUES live
 *  via getComputedStyle. This lists every kit token (not just the ones with a
 *  `.dark` override) and never picks up Tailwind's default-theme tokens. Dark
 *  values come from a throwaway `.dark` probe; a token with no `.dark` override
 *  inherits its `:root` value (shown identically in both columns). */
function discover(): { colors: ColorToken[]; radii: RadiusToken[]; texts: TextToken[] } {
  const rootCS = getComputedStyle(document.documentElement);
  const probe = document.createElement('div');
  probe.className = 'dark';
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const darkCS = getComputedStyle(probe);
  const get = (cs: CSSStyleDeclaration, n: string) => cs.getPropertyValue(n).trim();

  const names = Object.keys(PURPOSE);
  const colors = names
    .filter((n) => n.startsWith('--color-'))
    .map((name) => ({ name, light: get(rootCS, name), dark: get(darkCS, name) || get(rootCS, name) }));
  const texts = names
    .filter((n) => n.startsWith('--text-'))
    .map((name) => ({ name, size: get(rootCS, name), lineHeight: get(rootCS, `${name}--line-height`) || '-' }));
  const radii = KIT_RADII.map((name) => ({ name, value: get(rootCS, name) })).filter((r) => r.value);

  probe.remove();
  return { colors, radii, texts };
}

/** Light/dark palettes for the theme editor: light = colors + --radius, dark = colors.
 *  The token set is keyed off the `.dark` overrides: that's what defines a kit token
 *  and excludes Tailwind's default palette (which has no `.dark` entry). Light values
 *  come from `:root`, falling back to the dark value if a token only exists in dark. */
export function discoverPalettes(): { light: Palette; dark: Palette } {
  const { light, dark } = collectTokens();
  const names = Object.keys(dark).filter((n) => n.startsWith('--color-')).sort();
  const lightPalette: Palette = { '--radius': light['--radius'] ?? '0.6rem' };
  const darkPalette: Palette = {};
  for (const name of names) {
    lightPalette[name] = light[name] || dark[name];
    darkPalette[name] = dark[name];
  }
  return {
    light: lightPalette,
    dark: darkPalette,
  };
}

/** Resolve any CSS color string (e.g. hsl(...)) to #rrggbb for a color input. */
export function toHex(css: string): string {
  const el = document.createElement('div');
  el.style.color = css;
  el.style.display = 'none';
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color;
  el.remove();
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m) return '#000000';
  return '#' + m.slice(0, 3).map((x) => Math.round(+x).toString(16).padStart(2, '0')).join('');
}

const cellHead: JSX.CSSProperties = { 'text-align': 'left', padding: '8px 12px', 'border-bottom': '1px solid var(--color-border)', 'font-weight': '600', 'font-size': '15px' };
const cell: JSX.CSSProperties = { padding: '8px 12px', 'border-bottom': '1px solid var(--color-border)', 'vertical-align': 'middle', 'font-size': '15px' };
// Value text (hex / size / line-height): readable, not the browser's tiny <small>.
const valueText: JSX.CSSProperties = { 'font-size': '13px', color: 'var(--color-muted-foreground)' };

function Swatch(props: { color: string }) {
  return (
    <span
      style={{
        display: 'inline-block', width: '1.15rem', height: '1.15rem', 'border-radius': '4px',
        background: props.color, border: '1px solid var(--color-border)', 'vertical-align': 'middle',
        'margin-right': '.4rem',
      }}
    />
  );
}

const sectionHead: JSX.CSSProperties = {
  margin: '1.75rem 0 .6rem', 'font-size': '13px', 'font-weight': '700',
  'letter-spacing': '.04em', 'text-transform': 'uppercase', color: 'var(--color-muted-foreground)',
};

/** Auto-generated reference of every overridable token (light + dark values). */
export function TokenTable() {
  const [data, setData] = createSignal<{ colors: ColorToken[]; radii: RadiusToken[]; texts: TextToken[] }>({ colors: [], radii: [], texts: [] });
  onMount(() => setData(discover()));
  return (
    <div style={{ padding: '64px 20px', width: '100%' }}>
      <style>{`.kit-token-link{color:#006DEB;text-decoration:underline}.kit-token-link:hover{text-decoration:none}html.dark .kit-token-link,.dark .kit-token-link{color:#4ea3ff}`}</style>
      <div style={{ 'font-family': '"Nunito Sans", ui-sans-serif, system-ui, sans-serif', 'font-size': '15px', color: 'var(--color-foreground)', 'max-width': '1000px', margin: '0 auto' }}>
      <h1 style={{ 'font-size': '32px', 'font-weight': '700', margin: '0 0 12px', color: 'var(--color-foreground)' }}>Token Reference</h1>
      <p style={{ margin: '0 0 .5rem', 'font-size': '16px', 'line-height': '1.6' }}>
        Every value the kit renders comes from a CSS custom property. These are the design tokens.
        Override any of them on <code>:root</code> (or any scoped parent) to rebrand the whole kit;
        because they're plain CSS variables they cascade through the Shadow DOM into every
        <code> kai-*</code> element. The table below is generated live from the loaded
        <code> theme.css</code>, so it always lists the complete, current set.
      </p>
      <p style={{ margin: '0 0 .5rem', 'font-size': '16px', 'line-height': '1.6', color: 'var(--color-muted-foreground)' }}>
        Want to design a palette visually and copy the CSS out? Use the{' '}
        <a href="https://ui.kitn.ai/theme/editor" target="_blank" rel="noreferrer" class="kit-token-link">
          theme editor at ui.kitn.ai/theme/editor
        </a>.
      </p>

      <h2 style={sectionHead}>Colors</h2>
      <table style={{ width: '100%', 'border-collapse': 'collapse' }}>
        <thead>
          <tr><th style={cellHead}>Token</th><th style={cellHead}>Purpose</th><th style={cellHead}>Light</th><th style={cellHead}>Dark</th></tr>
        </thead>
        <tbody>
          <For each={data().colors}>
            {(t) => (
              <tr>
                <td style={cell}><code>{t.name}</code></td>
                <td style={{ ...cell, color: 'var(--color-muted-foreground)' }}>{PURPOSE[t.name] || ''}</td>
                <td style={cell}><Swatch color={t.light} /><span style={valueText}>{t.light}</span></td>
                <td style={cell}><Swatch color={t.dark} /><span style={valueText}>{t.dark}</span></td>
              </tr>
            )}
          </For>
        </tbody>
      </table>

      <h2 style={sectionHead}>Typography</h2>
      <table style={{ width: '100%', 'border-collapse': 'collapse' }}>
        <thead>
          <tr><th style={cellHead}>Token</th><th style={cellHead}>Purpose</th><th style={cellHead}>Size</th><th style={cellHead}>Line height</th></tr>
        </thead>
        <tbody>
          <For each={data().texts}>
            {(t) => (
              <tr>
                <td style={cell}><code>{t.name}</code></td>
                <td style={{ ...cell, color: 'var(--color-muted-foreground)' }}>{PURPOSE[t.name] || ''}</td>
                <td style={cell}><span style={{ 'font-size': t.size }}>Aa</span> <span style={valueText}>{t.size}</span></td>
                <td style={cell}><span style={valueText}>{t.lineHeight}</span></td>
              </tr>
            )}
          </For>
        </tbody>
      </table>

      <h2 style={sectionHead}>Radius</h2>
      <table style={{ width: '100%', 'border-collapse': 'collapse' }}>
        <thead>
          <tr><th style={cellHead}>Token</th><th style={cellHead}>Purpose</th><th style={cellHead}>Value</th></tr>
        </thead>
        <tbody>
          <For each={data().radii}>
            {(t) => (
              <tr>
                <td style={cell}><code>{t.name}</code></td>
                <td style={{ ...cell, color: 'var(--color-muted-foreground)' }}>Corner radius</td>
                <td style={cell}>
                  <span style={{ display: 'inline-block', width: '1.6rem', height: '1.1rem', background: 'var(--color-muted)', border: '1px solid var(--color-border)', 'border-top-left-radius': t.value, 'border-bottom-left-radius': t.value, 'vertical-align': 'middle', 'margin-right': '.4rem' }} />
                  <span style={valueText}>{t.value}</span>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>

      <p style={{ 'margin-top': '1rem', color: 'var(--color-muted-foreground)', 'font-size': '13px' }}>
        Generated from the loaded CSS, so it always reflects the current tokens in <code>theme.css</code>.
      </p>
      </div>
    </div>
  );
}
