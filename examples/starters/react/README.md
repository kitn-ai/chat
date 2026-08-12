# React example — chat workspace, composed by hand

A small chat **workspace assembled from `@kitn.ai/ui`'s individual elements** —
a `<Conversations>` sidebar, a thread of `<Message>` elements, and a
`<PromptInput>` composer — wired together with plain React state. The point is to
show **how the pieces fit together**, not to drop in one batteries-included
`<kai-chat>`/`<kai-workspace>` tag. This is the reference every other framework
example copies.

It runs with **no backend**: replies stream in from the kit's own mock responder,
`createMockResponder()` from `@kitn.ai/ui/state` (wired up in `src/chat-data.ts`),
so there's no API key and nothing to host. The mock yields SSE frames that
`readOpenAIStream` parses exactly as it parses a real provider's, so the preview
runs the real streaming path — and swapping `mockResponse(text)` for a real
`fetch` (Anthropic, OpenAI, your own endpoint) is the only change you make.

Nothing here can be mistaken for a real turn: the stream opens with a `: kai-mock`
SSE comment, every frame carries a `_kai_mock` field, `model` reports as
`kai-mock`, and usage is all zeros.

## How it works

- `src/main.tsx` registers the `kai-*` custom elements
  (`import '@kitn.ai/ui/elements'`) and loads the plain `--color-*` tokens
  (`import '@kitn.ai/ui/theme.tokens.css'`) used by the surrounding shell.
- `src/App.tsx` composes three elements by hand:
  - `<Conversations>` — the sidebar list, fed a `conversations` array; emits
    `onConversationSelect` / `onNewChat`.
  - `<Message>` × N — the thread, one element per message, mapped from state.
  - `<PromptInput>` — the composer at the bottom; `onSubmit` appends the user's
    message and streams the reply.
- `useKaiChat` owns the message array + streaming (`append`, `setMessages`,
  `streamAssistant`, `loading`); everything else (active conversation, theme) is
  plain React `useState`.
- A light/dark toggle (top-right) drives each element's `theme` prop and a
  `.dark` class on the shell, so the kit's `--color-*` tokens flip for your own
  chrome too.

The example consumes the kit from this monorepo via `workspace:*`, so it always
builds against the local `@kitn.ai/ui` source.

## Run it

From the repo root, build the kit once so its `dist/` exists (the example imports
the compiled `@kitn.ai/ui/elements` + `@kitn.ai/ui/theme.tokens.css`), then start
the example:

```bash
pnpm exec nx build ui
pnpm --filter @kitn.ai/ui-example-react dev
```

Open the URL Vite prints (default <http://localhost:5173>).

## Build / typecheck

```bash
pnpm --filter @kitn.ai/ui-example-react typecheck
pnpm --filter @kitn.ai/ui-example-react build
```
