# AI/UI

Web components for building AI chat interfaces: message threads, prompt input, streaming responses, markdown and code, reasoning and tool panels, attachments, generative-UI cards, artifacts.

Drop `<kai-chat>` into React, Vue, Svelte, Angular, SolidJS or plain HTML. Every element is style-isolated in Shadow DOM, so the host page's CSS can't leak in and the kit's can't leak out. It's authored in SolidJS, and you never have to know that to use one.

[Docs](https://ui.kitn.ai) · [Storybook](https://ui.kitn.ai/storybook/) · [npm](https://www.npmjs.com/package/@kitn.ai/ui) · [Security policy](SECURITY.md)

## Quickstart

```bash
npm create kai@latest
```

It asks for a framework, a layout and a backend, then writes a project that runs. Press Enter through every prompt and you get React, full screen, and the kit's own mock: a real streaming turn on the first `npm run dev`, with no API key and nothing to host.

```bash
npx create-kai@latest --list
```

That prints the frameworks, layouts and gateways it can scaffold today. Read it rather than a list written here; the roster moves.

## Add it to an app you already have

```bash
npm install @kitn.ai/ui
```

```html
<kai-chat style="display:block; height:100%"></kai-chat>

<script type="module">
  import '@kitn.ai/ui/elements';

  // Registration is async (that's what keeps the import SSR-safe), so wait for
  // the element before setting properties or the upgrade clobbers them.
  await customElements.whenDefined('kai-chat');

  const chat = document.querySelector('kai-chat');

  // A message's content is an ordered `parts` array.
  chat.messages = [
    { id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Ask me anything.' }] },
  ];

  chat.addEventListener('kai-submit', (event) => {
    console.log('user sent:', event.detail.value);
  });
</script>
```

The same thing per framework: [Getting started](https://ui.kitn.ai/guides/getting-started/).

### Entry points

| Import | What it gives you |
| --- | --- |
| `@kitn.ai/ui/elements` | Registers every `kai-*` element. The one import most apps need. |
| `@kitn.ai/ui/elements/<name>` | One element at a time, so a bundler ships only what you use. |
| `@kitn.ai/ui/autoloader` | Loads each element on demand as its tag shows up. No bundler. |
| `@kitn.ai/ui/react` | Generated typed React wrappers (`Chat`, `Message`, and the rest). |
| `@kitn.ai/ui/solid` | The complete SolidJS component surface. |
| `@kitn.ai/ui` | The SolidJS layer: headless primitives, `ChatConfig`, the core components. |
| `@kitn.ai/ui/state` | Pure folds over `ChatMessage[]`: `createAssistantStream`, `appendTextPart`, `upsertToolPart`. No I/O. |
| `@kitn.ai/ui/wire` | Provider SSE in, message parts out: `readOpenAIStream`, `readAnthropicStream`, `toOpenAIMessages`. |
| `@kitn.ai/ui/schemas` | JSON Schemas for the generative-UI cards, projectable to a provider tool definition. |
| `@kitn.ai/ui/provider` | The iframe-side bridge for rendering cards served from another origin. |
| `@kitn.ai/ui/theme.css` | Design tokens. Rebrand by overriding `--color-*`. |

The authoritative list is the `exports` map in [`packages/ui/package.json`](packages/ui/package.json).

The kit parses, your app fetches. There's no HTTP client, no key handling and no provider SDK in here: `wire` reads a stream you opened, which is why your keys never have to come near it.

## Three things every consumer hits

- **Arrays and objects are set in JavaScript, not as HTML attributes.** `messages`, `suggestions`, `models` and the rest are assigned as properties. Only scalars (`placeholder`, `loading`, `theme`) work as attributes.
- **Events are non-bubbling `kai-*` CustomEvents.** Listen on the element itself, never a parent. Submit is `kai-submit` and the text is `event.detail.value`.
- **Streaming needs a new array reference per chunk.** Mutating the existing one in place renders nothing.

Every property, event and method for every element: [`docs/web-components.md`](docs/web-components.md).

## The kai MCP

The package ships a stdio MCP server, so an AI coding harness can build with this library instead of guessing at it:

```bash
claude mcp add kai -- npx -y @kitn.ai/ui mcp
```

Four tools: `component_reference` (the real API for any `kai-*` element, generated from the build), `scaffold` (a working chat surface wired to your framework and backend), `theme` (brand it from a color or a description), `debug` (the classic mistakes). It runs locally, holds no state and makes no network calls.

Config for other harnesses: [For AI agents](https://ui.kitn.ai/guides/for-ai-agents/). It isn't `create-kai`: the MCP teaches a harness, `create-kai` writes you a project.

## Status

Pre-1.0. Releases are cut by release-please from conventional commits with `bump-minor-pre-major` set, so **a breaking change lands in a minor**, not a major. Pin an exact version if that matters to you, and read the changelog before raising one.

Found a vulnerability? [`SECURITY.md`](SECURITY.md) has the private channel and what's in scope. Don't use the issue tracker for it.

## Working in this repo

pnpm + NX workspace, Node 22+.

- [`packages/ui`](packages/ui): the published kit (`@kitn.ai/ui`), its Storybook, and the `kai` MCP.
- [`packages/create-kai`](packages/create-kai): the `npm create kai` scaffolder.
- [`apps/docs`](apps/docs): the Astro Starlight site behind ui.kitn.ai, consuming the kit via `workspace:*`.
- [`examples`](examples): a hand-composed starter per framework, plus static demos. `create-kai` copies its templates from `examples/starters`.

```bash
pnpm install
pnpm dev          # Storybook (6006) and the docs site (4321) together
pnpm build        # every workspace, ui before docs
pnpm test         # every workspace's tests
pnpm typecheck
```

`pnpm build:ui` alone is enough to run a starter: `pnpm example:react` and its siblings need `packages/ui/dist/`, which is gitignored.

[`CLAUDE.md`](CLAUDE.md) is where the expensive knowledge lives: what a fresh clone needs before the test suite means anything, which caches lie, and which orderings are load-bearing. [`examples/README.md`](examples/README.md) covers running the starters and [`packages/ui/README.md`](packages/ui/README.md) the kit itself.

## License

MIT. See [`LICENSE`](LICENSE).
