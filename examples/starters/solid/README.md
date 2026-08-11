# @kitn.ai/ui — SolidJS Primitives Example

A standalone **SolidJS + Vite** app that composes `@kitn.ai/ui` primitives
into a working chat UI — the same composable layer used inside the kit's own
Storybook stories.

## What it shows

- `ChatConfig` wrapping the whole tree (prose size, theming context)
- `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle` sidebar layout
- `ConversationList` with grouped conversations + active-highlight
- `ChatContainer` / `ChatContainerContent` / `ChatContainerScrollAnchor` for the scrollable thread
- `Message` / `MessageBody` — walks a message's ordered `parts` and renders each kind in place: text as markdown + code blocks, reasoning as a collapsible block, tool calls as a panel
- `MessageBody`'s built-in action row (copy, thumbs up/down, regenerate — hover-reveal)
- `PromptInput` / `PromptInputTextarea` / `PromptInputActions` for the text input
- `PromptSuggestion` quick-fill chips
- `ScrollButton` scroll-to-bottom affordance
- A simulated model turn streamed as ordered parts — reasoning, then a tool call
  as it settles, then the answer — folded in with `appendReasoningPart` /
  `upsertToolPart` / `appendTextPart` from `@kitn.ai/ui/state`
- The message list keyed by `message.id`, so a tool or reasoning panel opened
  mid-stream survives the next delta instead of being torn down with its row

## Tailwind v4 + theme setup (the key part)

Because `@kitn.ai/ui` components use Tailwind v4 utility classes and
`--color-*` design tokens, a consuming app must do three things:

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

The `@source` line is critical: without it Tailwind v4 only scans `src/`
and strips every kit utility class as unused, leaving components unstyled.

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
