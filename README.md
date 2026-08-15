# AI/UI

**The web UI layer for AI apps. Works anywhere you can put HTML.**

Threads, workspaces, artifacts, tool and reasoning panels, generative UI, voice. React, Vue, Svelte, Angular, Solid, no framework at all, or a CMS or storefront where a script tag is the only way in. One implementation, not one port per framework.

Your CSS can't break them and theirs can't leak into your app: they're web components, each rendering in its own Shadow DOM. The trade is that you can't reach in and restyle arbitrary internals, so theming runs on `--kai-*` custom properties, which cross the boundary by design. It's also what lets the same tags run through a bundler in an app and load straight from a CDN in a plain `<script>` tag on a page with no build step to hook into. The usual objections to web components are [answered below](#the-web-component-objections). Authored in SolidJS; you never have to know that to use one.

[Docs](https://ui.kitn.ai) · [Storybook](https://ui.kitn.ai/storybook/) · [npm](https://www.npmjs.com/package/@kitn.ai/ui) · [Security policy](SECURITY.md)

## Quickstart

```bash
npm create kai@latest
```

It asks for a framework, a layout and a backend, then writes a project that runs. Press Enter through every prompt and you get React, full screen, and the kit's own mock: a real streaming turn on the first `npm run dev`, with no API key and nothing to host.

`npx create-kai@latest --list` prints the frameworks, layouts and gateways it can scaffold today. Read that rather than a list written here; the roster moves.

## Add it to an app you already have

```bash
npm install @kitn.ai/ui
```

### Drop in, or compose

One tag gets you a working chat:

```html
<kai-chat></kai-chat>
```

You are not stuck with its layout. `<kai-chat>` is one preset over pieces you can use directly, `<kai-workspace>` is another, and the pieces go well past chat. Arrange your own:

```html
<kai-resizable>
  <kai-resizable-item size="280px">
    <kai-conversations></kai-conversations>
  </kai-resizable-item>
  <kai-resizable-item>
    <kai-thread></kai-thread>
    <kai-prompt-input></kai-prompt-input>
  </kai-resizable-item>
</kai-resizable>
```

That is what every starter in [`examples/starters`](examples/starters) is, once per framework. Feed `messages` in, listen for `kai-submit`, and it's a chat app. The wiring: [Compose a message thread](https://ui.kitn.ai/guides/compose-message-thread/).

### Wrapper or tag

Rendering goes three ways, and they are not symmetric.

| Framework | How you render |
| --- | --- |
| React, Next.js, TanStack Start | Typed wrappers from `@kitn.ai/ui/react` (`<Thread>`, `<PromptInput>`, `<Conversations>`), or the raw tags. The wrappers are the default and are generated from the same build as the elements, so events arrive as React props (`onSubmit` for `kai-submit`) and each one registers its own element on mount. |
| Vue, Svelte, Angular, plain HTML | The tags, after `import '@kitn.ai/ui/elements'`. These set DOM properties and listen for DOM events natively, so there's no wrapper layer to add. Vue needs `isCustomElement` in its vite config and Angular needs `CUSTOM_ELEMENTS_SCHEMA`; Svelte and HTML need nothing. |
| SolidJS | Genuinely different. `@kitn.ai/ui/solid` hands you the SolidJS components themselves, with no custom elements in the picture. Solid is the layer everything else is built from. |

Wiring an element by hand, in any framework:

```html
<script type="module">
  import '@kitn.ai/ui/elements';

  // Registration is async (that's what keeps the import SSR-safe), so wait for
  // the element before setting properties or the upgrade clobbers them.
  await customElements.whenDefined('kai-thread');

  // A message's content is an ordered `parts` array.
  document.querySelector('kai-thread').messages = [
    { id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Ask me anything.' }] },
  ];
</script>
```

The same thing per framework: [Getting started](https://ui.kitn.ai/guides/getting-started/).

### The rest of the entry points

| Import | What it gives you |
| --- | --- |
| `@kitn.ai/ui/state` | Pure folds over `ChatMessage[]`: `createAssistantStream`, `appendTextPart`, `upsertToolPart`. No I/O. |
| `@kitn.ai/ui/wire` | Provider SSE in, message parts out: `readOpenAIStream`, `readAnthropicStream`, `toOpenAIMessages`. |
| `@kitn.ai/ui/theme.css` | Tailwind v4 token source for your own markup (`theme.tokens.css` is the plain-CSS build). Retheming the elements needs no import: set `--kai-color-*` on `:root`. |

Also shipped: `@kitn.ai/ui/elements/<name>` for one element at a time, `@kitn.ai/ui/autoloader` to load each on demand on a static or CDN-served page with no bundler, `@kitn.ai/ui/schemas` for the generative-UI card schemas, and `@kitn.ai/ui/provider` for cards served from another origin. The authoritative list is the `exports` map in [`packages/ui/package.json`](packages/ui/package.json).

The kit parses, your app fetches. There's no HTTP client, no key handling and no provider SDK in here: `wire` reads a stream you opened, which is why your keys never have to come near it.

## The web-component objections

They're fair, and mostly historic. Where they still bite, this kit answers them:

- **React interop.** `@kitn.ai/ui/react` is generated from the same build that generates the elements, so props are typed and events are React props. No `ref` plumbing to set an array.
- **SSR.** Registration is client-only by construction, and the React wrappers register in an effect. CI renders every server entry in a DOM-free Node process on each run (`verify:ssr`), and the Next.js and TanStack Start starters are server-rendered.
- **Types.** The React wrappers are generated, not hand-maintained, and a custom-elements manifest ships for editor tag completion.
- **Styling.** Shadow DOM keeps your CSS out, so theming runs through custom properties rather than selectors, and elements expose CSS `part`s for the pieces worth reaching.

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

Four tools: `component_reference` (the real API for any `kai-*` element, generated from the build), `scaffold` (a working chat surface wired to your framework and backend), `theme` (brand it from a color or a description), `debug` (the classic mistakes). It runs locally and makes no network calls. Config for other harnesses: [For AI agents](https://ui.kitn.ai/guides/for-ai-agents/).

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

`pnpm example:react` and its siblings need `packages/ui/dist/`, which is gitignored, so run `pnpm build:ui` first.

[`CLAUDE.md`](CLAUDE.md) is where the expensive knowledge lives: what a fresh clone needs before the test suite means anything, which caches lie, and which orderings are load-bearing. Read it before your first change.

## License

MIT. See [`LICENSE`](LICENSE).
