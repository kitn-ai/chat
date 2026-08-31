# app-header — the story's header beside the emitted app's, after the promotion

Owner report (2026-08-30): *"the workspace is missing the proper header. please
refer to the workspace in the story."*

Before this round the emitted Workspace rendered its header chrome into
`ChatThread`'s own header row — so it sat inside the chat rail's width — and,
because that row was hand-rolled a second time in codegen, it had drifted off
the approved design in three more ways at once: a text **Theme** button instead
of the icon toggle, **no search at all**, and a **bare avatar** with no menu.
See `../2026-08-30-void-dies/b-workspace-app-preview-variant.png` for that state.

Fixed by PROMOTION, the same move `WorkSurface` got the same week: the story's
`AppHeader` is now `packages/ui/src/components/app-header.tsx`, the story renders
it, and codegen composes it for `layout: 'split'`. One arrangement, two call
sites — they cannot drift again.

## How these were captured

- **Story** — Storybook on `localhost:6006`, `Labs/Builder/Workspace`, the
  `[data-kai-app-header]` element screenshotted directly.
- **Emitted** — the real CLI, from a scratch directory OUTSIDE the repo, with no
  `--ui` flag (it resolves this checkout's own build on its own):

  ```
  cd <scratch>
  node /Users/home/Projects/kitn-ai/kitn-chat/packages/ui/bin/mcp.js dev --builder
  ```

  then Workspace → **App preview with device toggles** → named `acme-workspace`,
  and the preview's own `[data-kai-app-header]` screenshotted through the
  builder's preview frame.

| file | what it shows |
|---|---|
| `a-story-app-header.png` | The STORY's header (light). Title left; search · theme toggle │ Share · Deploy │ avatar+chevron. |
| `a-story-full.png` | The whole story frame for context. |
| `b-emitted-app-header.png` | The EMITTED app's header, dark (this construct's `theme.mode`). Same arrangement, same components — it IS the same component. |
| `c-emitted-app-header-light.png` | The same header after clicking its theme toggle in the live app — the directly comparable shot against `a-story-app-header.png`, and proof the toggle is a mechanism rather than a label. |
| `b-emitted-builder-full.png` | The builder: panel left, and the strip spanning the whole preview frame ABOVE the split (chat rail + work surface below it), not inside the rail. |
| `d-emitted-search-opens-the-palette.png` | The search affordance opening the construct's real command palette. Menu-honesty: search is emitted only where `shell.commandPalette` puts a palette behind it. |

## Two defects the live run caught that no test had

Both were found by looking at the running app, not by a green suite, and both
now have a test:

1. **The strip rendered transparent.** The story's copy leaned on its preview
   frame for a background; above the split, outside `WorkspaceShell` (which
   paints `bg-background` itself), there was nothing under it, so dark-theme
   foreground text landed on the page's white. The component now paints its own
   `bg-background`.
2. **The theme toggle drew the wrong icon.** A construct declares its mode
   through `defineWebComponent`'s prop DEFAULT, so a dark element can carry no
   `theme` ATTRIBUTE at all — `getAttribute('theme')` returned `null` on a dark
   app and the toggle offered "switch to dark". The emitted resolver now reads
   the host PROPERTY first, then the attribute, then `matchMedia`.
