# @kitn.ai/ui — SolidJS example

A standalone **SolidJS + Vite** chat app, composed by hand from `@kitn.ai/ui`.

## What makes this one different

The React, Vue, Svelte, Angular and vanilla starters consume the `kai-*` **web
components** — one custom element per region. This one imports the **SolidJS
components directly** from `@kitn.ai/ui/solid`, because Solid is the kit's
authored layer. No shadow DOM, no custom-element registration, no
property-vs-attribute question.

The practical difference is the thread. The others get it from a single
`<kai-thread>` tag; here it is spelled out — `<ChatContainer>` for the scroll box
and stick-to-bottom, a `<Message>` per turn, and `<MessageBody>` to walk that
turn's ordered `parts`. If you want to see what the coarse elements are doing
inside, read `components/ThreadView.tsx`.

**Import from `@kitn.ai/ui/solid`, never from `@kitn.ai/ui`.** `/solid` is a
compiler-guaranteed strict superset — the full Solid catalog lives off the root
entry so the React/Vue/Svelte/vanilla majority don't pay for components they
cannot render. The root specifier is banned in Solid starters by
`packages/ui/scripts/verify-starters.mjs`, and it fails the build rather than
warning, because the wrong entry compiles fine right up until it doesn't.

## Layout

```
src/
  App.tsx                    the shell: theme, sidebar collapse, send + regenerate
  chat-data.ts               seed conversations, threads, the mock responder
  lib/
    chat.ts                  createChat  — the message array + streaming
    conversations.ts         createConversations — the conversation stash
    types.ts                 Theme
  components/
    Sidebar.tsx              <ConversationList>
    ThreadView.tsx           <ChatContainer> + <Message>/<MessageBody>
    Composer.tsx             <PromptInput> + suggestions
    ThemeToggle.tsx          light/dark switch
    icons/index.tsx          the four glyphs, hand-rolled
```

`lib/` rather than React's `hooks/`, and `createX` rather than `useX`: these run
once and return accessors, so calling them hooks would name a React lifecycle
Solid does not have. Same shape as the Svelte starter's `lib/`.

## The reply is a mock, and it is on the real path

`createMockResponder()` yields canned SSE frames in the OpenAI chat-completions
shape, and `readOpenAIStream` parses them exactly as it parses a real provider's.
So the no-backend preview runs the kit's **real** streaming path — the SSE
reader, the part folding, all of it. Going live changes one expression in
`App.tsx`, not the handler:

```diff
- await readOpenAIStream(mockResponse(text), stream);
+ const res = await fetch('/api/chat', {
+   method: 'POST',
+   headers: { 'content-type': 'application/json' },
+   body: JSON.stringify({ messages: toOpenAIMessages(chat.messages()) }),
+ });
+ await readOpenAIStream(res, stream);
```

Nothing here can be mistaken for a real turn: the stream opens with a
`: kai-mock` SSE comment, every frame carries `_kai_mock`, `model` reports as
`kai-mock` (no provider serves that), and usage is all zeros.

## What it shows

- `ChatConfig` wrapping the tree (prose size, highlighting, portal mount)
- `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle` sidebar layout
- `ConversationList` with grouped conversations + active highlight
- `ChatContainer` / `ChatContainerContent` / `ChatContainerScrollAnchor`
- `Message` / `MessageBody` walking a message's ordered `parts` — text as
  markdown + code blocks, reasoning as a collapsible block, tool calls as a panel
- `MessageBody`'s built-in action row (copy, thumbs up/down, regenerate)
- `PromptInput` / `PromptInputTextarea` / `PromptInputActions`, `PromptSuggestion`
- `ScrollButton` scroll-to-bottom
- Streaming folded in by `@kitn.ai/ui/state`'s `createAssistantStream`
- The message list keyed by `message.id`, so a tool or reasoning panel opened
  mid-stream survives the next delta instead of being torn down with its row

## Tailwind v4 + theme setup (the key part)

`@kitn.ai/ui` components use Tailwind v4 utility classes and `--color-*` design
tokens, so a consuming app must do three things:

### 1. Vite plugin

```ts
// vite.config.ts
import tailwindcss from "@tailwindcss/vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin(), tailwindcss()],
});
```

### 2. CSS entry point

```css
/* src/styles.css */
@import "tailwindcss";
@import "@kitn.ai/ui/theme.css";       /* design tokens: --color-background, --color-muted, … */
@source "../node_modules/@kitn.ai/ui"; /* tell Tailwind to scan kit source for class names */
```

The `@source` line is critical: without it Tailwind v4 only scans `src/` and
strips every kit utility class as unused, leaving components unstyled.

Dark mode rides on the same tokens. `theme.css` declares every `--color-*` twice
and flips the set under a `.dark` ancestor
(`@custom-variant dark (&:is(.dark *))`), so the one class `App.tsx` toggles
themes the kit's components and your own chrome together.

### 3. Install devDependencies

```
@tailwindcss/vite  tailwindcss  vite-plugin-solid
```

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc against the kit's shipped types
npm run build      # typecheck, then production build → dist/
```

`build` runs `tsc` first. This starter imports the SolidJS components directly
rather than the `kai-*` elements, so that pass is the only thing checking those
imports against the shipped types — Vite strips types without looking at them.

Requires Node 18+.
