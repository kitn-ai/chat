import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { theme } from './tools/theme';

/**
 * Tests for the `theme` MCP tool.
 * The handler returns { content: [{ type: 'text', text }] }; we read
 * out.content[0].text — matching the MCP CallToolResult contract and
 * the sibling scaffold.test.ts / reference.test.ts pattern.
 */
describe('theme', () => {
  it('emits kai- token overrides for a brand color', async () => {
    const out = await theme.handler({ brand: '#7c3aed' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/--kai-/);
    expect(text).toMatch(/:root|data-theme/);
  });

  it('emits a :root block containing --kai-color-primary with the brand color', async () => {
    const out = await theme.handler({ brand: '#7c3aed' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Real token names from theme.css — must appear verbatim
    expect(text).toContain('--kai-color-primary');
    expect(text).toContain('--kai-color-primary-foreground');
    expect(text).toContain('--kai-color-ring');
    // :root block present
    expect(text).toContain(':root');
    // The brand color value appears
    expect(text).toMatch(/#7c3aed|7c3aed/i);
  });

  it('mode:both also emits a .dark block', async () => {
    const out = await theme.handler({ brand: '#7c3aed', mode: 'both' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain(':root');
    expect(text).toContain('.dark');
    // Dark block has --kai-color-primary too
    expect(text).toMatch(/\.dark\s*\{[^}]*--kai-color-primary/s);
  });

  it('mode:dark emits a .dark block (no :root override)', async () => {
    const out = await theme.handler({ brand: '#06b6d4', mode: 'dark' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('.dark');
    expect(text).toContain('--kai-color-primary');
    // :root must NOT appear in the CSS block for mode:'dark'
    // (the CSS block is between the first ```css and the closing ```)
    const cssMatch = text.match(/```css\n([\s\S]*?)\n```/);
    expect(cssMatch).not.toBeNull();
    expect(cssMatch![1]).not.toContain(':root');
  });

  it('description-only call still yields a valid --kai- token block', async () => {
    const out = await theme.handler({ description: 'a professional blue SaaS product' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/--kai-/);
    expect(text).toContain('--kai-color-primary');
    expect(text).toContain(':root');
  });

  it('no input defaults gracefully and still produces a token block', async () => {
    const out = await theme.handler({});
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/--kai-/);
    expect(text).toContain('--kai-color-primary');
  });

  it('includes an apply note and link to the theme editor', async () => {
    const out = await theme.handler({ brand: '#e11d48' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Apply instructions present
    expect(text).toMatch(/paste|stylesheet|apply|global/i);
    // Theme editor link present
    expect(text).toMatch(/theme.*editor|editor.*theme|\/theme\/editor/i);
  });

  it('foreground is white (#ffffff) for a dark brand and black (#000000) for a light brand', async () => {
    // #7c3aed is dark (low luminance) → white foreground
    const darkOut = await theme.handler({ brand: '#7c3aed' });
    const darkText = (darkOut.content as { type: string; text: string }[])[0].text;
    expect(darkText).toMatch(/--kai-color-primary-foreground:\s*#(?:fff(?:fff)?|ffffff)/i);

    // #fde68a is very light (high luminance) → black foreground
    const lightOut = await theme.handler({ brand: '#fde68a' });
    const lightText = (lightOut.content as { type: string; text: string }[])[0].text;
    expect(lightText).toMatch(/--kai-color-primary-foreground:\s*#(?:000(?:000)?|000000)/i);
  });

  it('accent tokens are also emitted (--kai-color-accent / --kai-color-accent-foreground)', async () => {
    const out = await theme.handler({ brand: '#10b981' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('--kai-color-accent');
    expect(text).toContain('--kai-color-accent-foreground');
  });

  it('dark accent-foreground is white (#ffffff) on the near-black dark accent surface', async () => {
    // #7c3aed → dark accent surface is darken(r,g,b, 0.75) ≈ near-black
    // contrast-correct fg for near-black is white
    const out = await theme.handler({ brand: '#7c3aed', mode: 'both' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    // Extract the .dark block from the CSS output
    const darkBlockMatch = text.match(/\.dark\s*\{([^}]*)\}/s);
    expect(darkBlockMatch).not.toBeNull();
    const darkBlock = darkBlockMatch![1];
    expect(darkBlock).toMatch(/--kai-color-accent-foreground:\s*#ffffff/i);
  });

  it('invalid brand hex emits a Note about failing to parse and the default used', async () => {
    const out = await theme.handler({ brand: 'not-a-color' });
    const text = (out.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/Note.*could not parse|could not parse/i);
    expect(text).toMatch(/default/i);
  });
});

/**
 * THE GUARD. Everything above asserts the tool's SHAPE against literals; none of
 * it can see the tool naming a token theme.css does not declare, which is what
 * shipped: five `--kai-color-*` literals under a docblock claiming they were
 * "verified against repo-root theme.css", with nothing in the file reading it.
 *
 * This reads theme.css off disk — independently of the `?raw` import the tool
 * uses — and cross-checks every token the tool's OUTPUT mentions, CSS block and
 * prose alike. It goes red on a rename in either direction: theme.css moving out
 * from under a hardcoded literal, or a literal creeping back in.
 */
describe('theme token names agree with theme.css', () => {
  // src/agent-tooling/mcp/ -> packages/ui/ (same walk as manifest.test.ts).
  const THEME_CSS_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'theme.css',
  );
  const themeCss = readFileSync(THEME_CSS_PATH, 'utf8');

  /** Knobs theme.css really declares — anchored on `var(`, the only place one is wired up. */
  const declared = new Set(
    [...themeCss.matchAll(/var\(\s*(--kai-[a-zA-Z0-9-]+)\s*[,)]/g)].map((m) => m[1]),
  );

  /** Every concrete `--kai-*` name the tool's output mentions. */
  function tokensIn(text: string): string[] {
    // Drop wildcard forms first (`--kai-*`, `--kai-color-*`): they are prose about
    // the family, not names, and a plain scan would read them as fictional tokens.
    const concrete = text.replace(/--kai-[a-zA-Z0-9-]*\*/g, '');
    return [...new Set([...concrete.matchAll(/--kai-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/g)].map((m) => m[0]))];
  }

  it('theme.css parses to a non-empty set of --kai-* knobs', () => {
    // A zero-match parse would make every assertion below vacuously true.
    expect(declared.size).toBeGreaterThan(0);
    expect([...declared].filter((n) => n.startsWith('--kai-color-')).length).toBeGreaterThan(0);
  });

  it('every --kai-* token the tool emits is declared in theme.css', async () => {
    const out = await theme.handler({ brand: '#7c3aed', mode: 'both' });
    const text = (out.content as { type: string; text: string }[])[0].text;

    const emitted = tokensIn(text);
    // Zero emitted tokens is a hard failure, not a pass: this tool's whole job is
    // to name tokens, so an empty scan means the check stopped checking.
    expect(emitted.length).toBeGreaterThan(0);

    const dead = emitted.filter((t) => !declared.has(t));
    expect(
      dead,
      `the theme tool emits ${dead.length} token name(s) that ${THEME_CSS_PATH} does not declare: ` +
        `${dead.join(', ')}. Pasting that CSS themes nothing. Read the name from theme.css ` +
        `instead of restating it.`,
    ).toEqual([]);
  });

  it('the CSS block and the prose list name the same tokens', async () => {
    const out = await theme.handler({ brand: '#10b981' });
    const text = (out.content as { type: string; text: string }[])[0].text;

    const css = text.match(/```css\n([\s\S]*?)\n```/)?.[1] ?? '';
    const prose = text.split('**Tokens emitted**')[1]?.split('###')[0] ?? '';
    expect(css).not.toBe('');
    expect(prose).not.toBe('');

    expect(tokensIn(prose).sort()).toEqual(tokensIn(css).sort());
  });
});
