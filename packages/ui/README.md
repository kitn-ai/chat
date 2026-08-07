# @kitn.ai/ui

Framework-agnostic web components for building AI chat interfaces — message threads, prompt inputs, streaming responses, markdown + code rendering, reasoning/tool panels, attachments, and a conversation sidebar. Drop them into any app: React, Vue, Angular, Svelte, or plain HTML.

It can be consumed two ways:

1. **As framework-agnostic web components** *(primary)* — drop `<kai-chat>`, `<kai-conversations>`, and `<kai-prompt-input>` into any project (React, Vue, Angular, Svelte, plain HTML). Each is fully style-isolated via Shadow DOM, and the rendering runtime is bundled in, so the host needs nothing.
2. **As native SolidJS components** — the kit is authored in SolidJS, so SolidJS apps can import the components directly for full compositional control. (This is a convenience for SolidJS users, not a requirement — the web components work everywhere.)

## Highlights

- **~50 composable components** across three layers: headless primitives → accessible UI primitives (built in-house, WCAG 2.1 AA — no third-party UI dependency) → AI feature components.
- **Shadow-DOM web components** — zero CSS conflicts in any host. The host's styles can't leak in; the kit's Tailwind can't leak out.
- **Load it your way** — register every element in one import, cherry-pick per-element with a bundler, or drop in a CDN autoloader that loads each on demand. Syntax highlighting loads lazily, per language, only when you render code.
- **Tailwind v4** design tokens — rebrand by overriding `--color-*` custom properties.

## Install

```bash
npm install @kitn.ai/ui
```

SolidJS consumers also need `solid-js` (a peer dependency):

```bash
npm install solid-js
```

## Quick start

### Option A — Web components (any framework / plain HTML)

Build the bundle, then import it as a side-effect (it registers the custom elements):

```bash
npm run build   # emits dist/kai.es.js
```

```html
<body style="height: 100vh; margin: 0;">
  <kai-chat style="display:block; height:100%;"></kai-chat>

  <script type="module">
    import '@kitn.ai/ui/elements';

    // Registration is async (SSR-safe) — wait for the element to be defined
    // before setting properties, or the upgrade clobbers them.
    await customElements.whenDefined('kai-chat');

    const chat = document.querySelector('kai-chat');

    // Rich data is set as JS properties (not HTML attributes). A message's
    // content is an ordered `parts` array.
    chat.messages = [
      { id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Hello! How can I help?' }] },
    ];

    // Events are non-bubbling kai-* CustomEvents dispatched on the element
    chat.addEventListener('kai-submit', (e) => {
      console.log('user sent:', e.detail.value);
    });
  </script>
</body>
```

The element bundle is **ES-module only** and loads via `<script type="module">` in every modern browser. See **[docs/web-components.md](docs/web-components.md)** for the full element API (every property, event, and the `ChatMessage` schema).

#### Or load from a CDN (no build, no npm)

The element bundle is a self-contained ES module — load it directly from [jsDelivr](https://www.jsdelivr.com/package/npm/@kitn.ai/ui) or [unpkg](https://unpkg.com/browse/@kitn.ai/ui/), no install or bundler required:

```html
<script type="module">
  import 'https://cdn.jsdelivr.net/npm/@kitn.ai/ui/dist/kai.es.js';
  // …or unpkg: import 'https://unpkg.com/@kitn.ai/ui/dist/kai.es.js';
</script>

<kai-chat></kai-chat>
```

The URLs above track the **latest** release — handy for trying things out. **For production, pin an exact version** (e.g. `@kitn.ai/ui@0.16.0/dist/kai.es.js`): pinned URLs are immutable and cached far more aggressively, and — since this package is pre-1.0 — pinning shields you from breaking changes in a future minor release. SolidJS and the kit's CSS are bundled in, and the lazy code-highlighting chunks load from the same CDN on demand. To override design tokens, also include `theme.css`:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@kitn.ai/ui/theme.css">
```

### Option B — SolidJS components

```tsx
import {
  ChatConfig, ChatContainer, ChatContainerContent,
  Message, MessageContent,
  PromptInput, PromptInputTextarea, PromptInputActions,
} from '@kitn.ai/ui';
import '@kitn.ai/ui/theme.css';

function App() {
  const [input, setInput] = createSignal('');
  return (
    <ChatConfig proseSize="sm">
      <ChatContainer class="h-full">
        <ChatContainerContent class="space-y-4 p-4">
          <Message>
            <MessageContent markdown>{`## Hi\n\nAsk me anything.`}</MessageContent>
          </Message>
        </ChatContainerContent>
      </ChatContainer>
      <PromptInput value={input()} onValueChange={setInput} onSubmit={() => setInput('')}>
        <PromptInputTextarea placeholder="Ask anything..." />
        <PromptInputActions>{/* your buttons */}</PromptInputActions>
      </PromptInput>
    </ChatConfig>
  );
}
```

The SolidJS entry (`.`) ships compiled — your bundler tree-shakes it to just the components you import.

## Integrations

The components are deliberately **transport-agnostic**: `<kai-chat>` just renders the `messages` array you give it and emits a `submit` event when the user sends. You own the request, the streaming, and any extras like text-to-speech. The patterns below use the web component, but the same wiring applies to the SolidJS API.

### Streaming responses from OpenRouter

[OpenRouter](https://openrouter.ai) exposes an OpenAI-compatible streaming API (Server-Sent Events). On `submit`, append the user message + an empty assistant message, then grow the assistant message as tokens arrive.

> **Security:** never ship your API key to the browser. In production, point `fetch` at your own backend endpoint that proxies to OpenRouter and injects the key. The parsing below is identical either way.

```html
<kai-chat id="chat" style="display:block; height:100vh;"></kai-chat>

<script type="module">
  import '@kitn.ai/ui/elements';

  // Registration is async (SSR-safe) — wait for the element before using it.
  await customElements.whenDefined('kai-chat');

  const chat = document.getElementById('chat');
  chat.messages = [];

  chat.addEventListener('kai-submit', async (e) => {
    const text = e.detail.value.trim();
    if (!text) return;

    // 1. Show the user message immediately
    const history = [...chat.messages,
      { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }];
    chat.messages = history;
    chat.value = '';        // clear the input
    chat.loading = true;

    // 2. Add an empty assistant message we'll stream into
    const assistantId = crypto.randomUUID();
    chat.messages = [...history, { id: assistantId, role: 'assistant', parts: [] }];

    // Fold each delta onto the message's TRAILING text part, opening a new one
    // when the last part is not text. Do NOT replace `parts` wholesale: that
    // drops any reasoning/tool/card parts already on the message.
    // `@kitn.ai/ui/state` exports this same function as `appendTextPart`.
    const appendText = (parts, delta) => {
      const last = parts[parts.length - 1];
      return last?.type === 'text'
        ? [...parts.slice(0, -1), { ...last, text: last.text + delta }]
        : [...parts, { type: 'text', text: delta }];
    };

    try {
      // In production, replace this URL with your own proxy endpoint.
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`, // server-side in production!
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4',
          stream: true,
          // The wire format is a flat string; flatten the text parts for it.
          messages: history.map((m) => ({
            role: m.role,
            content: m.parts.map((p) => (p.type === 'text' ? p.text : '')).join(''),
          })),
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by newlines; each data line is JSON
        const lines = buffer.split('\n');
        buffer = lines.pop();               // keep the partial last line
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith('data:')) continue;  // skip ": keep-alive" comments
          const payload = s.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
            if (!delta) continue;
            // Replace the assistant message with a NEW object so the row re-renders
            chat.messages = chat.messages.map((m) =>
              m.id === assistantId ? { ...m, parts: appendText(m.parts, delta) } : m
            );
          } catch { /* ignore non-JSON keep-alive lines */ }
        }
      }
    } catch (err) {
      chat.messages = chat.messages.map((m) =>
        m.id === assistantId ? { ...m, parts: appendText(m.parts, '⚠️ ' + err.message) } : m
      );
    } finally {
      chat.loading = false;
    }
  });
</script>
```

Key point: reassign `chat.messages` with a **new array containing a new object** for the streaming message on each chunk — that's what triggers the re-render. Mutating the existing object in place won't update the view.

### Text-to-speech (TTS)

#### Option 1 — Browser-native (zero dependencies)

The Web Speech API speaks text with no network call. Speak each assistant reply once it finishes streaming — call `speak(answer)` right before `chat.loading = false` in the example above:

```js
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = 1;
  speechSynthesis.cancel();   // stop anything already playing
  speechSynthesis.speak(utter);
}
```

To speak *as it streams*, flush complete sentences instead of waiting for the end:

```js
let spokenUpTo = 0;
function speakIncremental(fullText) {
  const lastBreak = fullText.lastIndexOf('. ', fullText.length);
  if (lastBreak > spokenUpTo) {
    speak(fullText.slice(spokenUpTo, lastBreak + 1));
    spokenUpTo = lastBreak + 1;
  }
}
// call speakIncremental(answer) inside the streaming loop
```

#### Option 2 — Cloud TTS (OpenAI, ElevenLabs, …)

For higher-quality voices, have your backend call a TTS API and return audio, then play it. Keep the provider key on the server.

```js
async function speakCloud(text) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: 'alloy' }),
  });
  const audio = new Audio(URL.createObjectURL(await res.blob()));
  audio.play();
}
```

```js
// Example backend (Node) — /api/tts proxying OpenAI's speech endpoint
// const r = await openai.audio.speech.create({ model: 'gpt-4o-mini-tts', voice, input: text });
// res.setHeader('Content-Type', 'audio/mpeg');
// Readable.fromWeb(r.body).pipe(res);
```

You can trigger either option from the streaming completion (auto-read replies) or from a button you render alongside each message.

> **Speech-to-text** (the other direction) is already built in — the kit ships a `VoiceInput` component for capturing microphone input. See Storybook (`npm run dev`).

## State helpers & hooks

`@kitn.ai/ui/state` ships immutable helpers (`appendMessage`, `upsertMessage`, `updateMessage`, `removeMessage`, `appendText`, `textMessage`), the part-level folds they build on (`appendTextPart`, `appendReasoningPart`, `upsertToolPart`), and a streaming handle (`createAssistantStream`) so you don't hand-roll array mutations. React apps get `useKaiChat` (from `@kitn.ai/ui/react`); SolidJS apps get `createKaiChat` (from `@kitn.ai/ui`). Both return a `bind` object to spread directly onto the element:

```tsx
import { Chat, useKaiChat } from '@kitn.ai/ui/react';
import { createAssistantStream } from '@kitn.ai/ui/state';

function App() {
  const chat = useKaiChat({
    async onSubmit({ value }) {
      chat.append({ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: value }] });
      const s = chat.streamAssistant();
      for await (const part of backend(value)) s.appendText(part);
      s.done();
    },
  });
  return <Chat {...chat.bind} />;
}
```

Each hook instance owns its own message list — instantiate multiple times for multiple independent chats on one page. Full API: [ui.kitn.ai/guides/state-and-hooks/](https://ui.kitn.ai/guides/state-and-hooks/).

## Code highlighting (optional, on-demand)

Syntax highlighting uses [Shiki](https://shiki.style) and is wired to be as light as possible:

- Nothing loads until a fenced code block actually renders.
- Only the core, the **JavaScript regex engine (no WASM)**, the one theme, and the one language grammar needed are fetched — each a small lazy chunk.
- Default languages: `javascript`/`js`, `typescript`/`ts`, `tsx`, `json`, `bash`/`sh`. Add more or turn it off:

```js
import { configureCodeHighlighting } from '@kitn.ai/ui/elements'; // or '@kitn.ai/ui'

configureCodeHighlighting({
  languages: { python: () => import('@shikijs/langs/python') },
});

// or disable entirely — no Shiki ever loads:
configureCodeHighlighting({ enabled: false });
```

Per element: `<kai-chat codeHighlight={false}>` renders code as plain text.

## Theming

Visual appearance is driven by `--color-*` CSS custom properties in `theme.css`. Because inherited CSS pierces the Shadow DOM boundary, overriding tokens on `:root` rebrands the components — even the web-component ones:

```css
:root {
  --color-background: #0f0f0f;
  --color-primary: #7c3aed;
  --color-muted: #1e1e1e;
}
```

For SolidJS usage, import `@kitn.ai/ui/theme.css` once. For web components the kit's CSS is injected into each shadow root automatically; only `theme.css` (design tokens) is optional to include.

## For AI agents / LLMs

The package ships [llmstxt.org](https://llmstxt.org)-style files so coding agents (Claude Code, Copilot, Cursor, Codex) can wire up the components correctly:

- **[`llms.txt`](./llms.txt)** — dense orientation: install, the property-vs-attribute rule, the two-layer architecture, theming, and framework wiring.
- **[`llms-full.txt`](./llms-full.txt)** — the above plus a generated props/events reference for every `kitn-*` element, a streaming recipe, and a build runbook.

Both are auto-generated from `dist/custom-elements.json` during `npm run build` (so they never drift) and are published in the npm package — find them at `node_modules/@kitn.ai/ui/llms.txt` after install.

> **#1 thing agents get wrong:** array/object data (`messages`, `models`, `context`, …) must be set as **JS properties**, not HTML attributes. Only scalars (`placeholder`, `loading`, `theme`) work as attributes.

## Development

```bash
npm install          # install dependencies
npm run dev          # Storybook dev server at http://localhost:6006 (component playground)
npm test             # run the test suite (Vitest: jsdom unit tests + Storybook browser tests)
npm run build        # build the web-component bundle into dist/
npm run build-storybook   # static Storybook build
```

Storybook is the primary way to explore and develop components in isolation.

### Testing the consumer experience (Claude Code)

`npm test` covers the kit's internals. To test what a **consumer of the published package** experiences — building real chat apps across every framework (React, Next.js, Vue, Svelte, HTML, TanStack Start), archetype, integration, and backend, against a *local* build of the package — this repo ships a project-local [Claude Code](https://code.claude.com) skill that auto-loads when you open Claude Code anywhere in the repo (no setup):

- Run **`/consumer-regression`** — modes: `smoke` (one parallel pass, report only) and `regression` (the full build → triage → fix → re-verify loop). It fans out parallel agents and varies model tiers to measure how cheap a model can drive the tooling.
- Source + full methodology: **[`.claude/skills/consumer-regression/SKILL.md`](.claude/skills/consumer-regression/SKILL.md)** (and `recipes.md` beside it). The agents it deploys live in [`.claude/agents/`](.claude/agents/) (`consumer-probe`, `regression-triage`).

This catches packaging / exports / SSR / scaffold-output bugs that the unit suite can't. See [`.claude/README.md`](.claude/README.md) for the full index of project-local Claude Code tooling.

### Project structure

```
src/
  primitives/    Headless logic hooks + ChatConfig + on-demand highlighter
  ui/            Accessible UI primitives (Button, Dropdown, Tooltip, HoverCard, … built in-house, no third-party UI deps)
  components/    AI feature components (Message, PromptInput, Markdown, Tool, …)
  elements/      Web-component facades + defineKitnElement wrapper + Vite lib entry
  stories/       Composed example stories (full chat app, layouts)
theme.css        Design tokens (--color-*), animations, markdown styles
docs/
  web-components.md   Full web-component API reference
```

The web-component layer wraps a few coarse facades over the SolidJS components; the SolidJS API stays the source of truth and is unchanged by it.

## Examples

A set of runnable examples and a hosted component playground are included in the repo. See [`examples/README.md`](examples/README.md) for full details.

### Composable showcase

The composable showcase demonstrates every individual element in one page. Build the package first, then serve from the repo root:

```bash
npm run build     # produces dist/kai.es.js
npm run examples  # static server at http://localhost:8000
```

Then open: **http://localhost:8000/examples/composable/index.html**

### Storybook

Storybook is the primary component playground for development:

```bash
npm run dev    # dev server at http://localhost:6006
```

The published docs are deployed to GitHub Pages:
**https://ui.kitn.ai/**

### Framework example apps

The `examples/react`, `examples/solid`, `examples/angular`, and `examples/vue` directories are full Vite apps — install their dependencies and run the local dev server:

```bash
cd examples/react && npm install && npm run dev
# or
cd examples/solid && npm install && npm run dev
# or
cd examples/angular && npm install && npm run dev
# or
cd examples/vue && npm install && npm run dev
```

- `examples/react` — uses the generated React wrappers from `@kitn.ai/ui/react`
- `examples/solid` — uses the raw SolidJS component API
- `examples/angular` — uses the web components natively via Angular's `[prop]` / `(event)` bindings with `CUSTOM_ELEMENTS_SCHEMA` (no wrappers needed)
- `examples/vue` — uses the web components natively via Vue's `:prop.prop` modifier and `@event` bindings; `isCustomElement` in `vite.config.ts` prevents Vue treating `kitn-*` tags as Vue components

### Docs and reference

- **[docs/web-components.md](docs/web-components.md)** — full element API: every property, event, and the `ChatMessage` schema.
- **[llms.txt](llms.txt)** / **[llms-full.txt](llms-full.txt)** — dense machine-readable references for AI coding agents.

## Loading

Three ways to load the elements — register all (the simple default), cherry-pick per-element, or a CDN autoloader:

| How you load | What it does |
|---|---|
| `import '@kitn.ai/ui/elements'` | registers every element — the simple default |
| `import '@kitn.ai/ui/elements/chat'` | one element, bundler tree-shakes |
| `import '@kitn.ai/ui/autoloader'` (opt-in **DOM autoloader**) | loads each element's module **on demand** as `<kai-*>` appears |

The autoloader watches the DOM (initial scan + `MutationObserver`) and dynamically imports only the
elements actually present — so a page with just `<kai-chat>` never downloads the others. It's additive:
the register-all bundle stays the default. (Direct per-element imports and the autoloader are client-side;
SSR apps use the register-all `@kitn.ai/ui/elements` or render client-only.)

Code highlighting (Shiki) is always lazy — loaded per-language on first code block, with no WASM, and never
at all if you don't render code. The build is ES-module only (a UMD/IIFE build can't code-split).
