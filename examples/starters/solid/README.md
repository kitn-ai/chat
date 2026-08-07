# @kitn.ai/ui — SolidJS Primitives Example

A standalone **SolidJS + Vite** app that composes `@kitn.ai/ui` primitives
into a working chat UI — the same composable layer used inside the kit's own
Storybook stories.

## What it shows

- `ChatConfig` wrapping the whole tree (prose size, theming context)
- `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle` sidebar layout
- `ConversationList` with grouped conversations + active-highlight
- `ChatContainer` / `ChatContainerContent` / `ChatContainerScrollAnchor` for the scrollable thread
- `Message` / `MessageContent` (with `markdown` prop — renders markdown + code blocks)
- `MessageActions` (copy, thumbs up/down, refresh — hover-reveal)
- `PromptInput` / `PromptInputTextarea` / `PromptInputActions` for the text input
- `PromptSuggestion` quick-fill chips
- `ScrollButton` scroll-to-bottom affordance
- Word-by-word streamed reply simulation via `setInterval`

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
npm run dev     # http://localhost:5173
npm run build   # production build → dist/
```

Requires Node 18+.
