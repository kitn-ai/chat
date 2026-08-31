# Code tab — the graceful empty state, captured live

2026-08-30. Owner-reported defect: `chrome.codeView` without a `codeUrl` was a
hard schema rejection, so the panel's Code-view switch could not be turned on,
and neither Workspace starter shipped it — the Preview|Code toggle appeared
nowhere.

Captured from the **real CLI**, not Storybook and not a test harness:
`node packages/ui/bin/mcp.js dev --builder` (no `--ui`) in a scratch dir outside
the repo, which packs and installs this checkout's own `dist`
(`kitn.ai-ui-0.30.0-28ab0a075f8f6b7c.tgz`). The construct was created through
the actual flow: Workspace → **App preview with device toggles** → name
`code-tab-demo`.

| File | What it shows |
| --- | --- |
| `code-tab-empty-state.png` | The whole builder. Preview\|Code toggle present out of the box; Code tab selected; the empty state in the pane. |
| `code-tab-empty-state-pane.png` | The pane alone, at review size — the copy is legible. |
| `preview-tab-placeholder.png` | The paired negative: switch back to Preview and the shipped placeholder page frames again. The empty state belongs to the Code branch only. |
| `panel-code-view-switch.png` | The Work surface panel section: **Code view ON**, with both hints rewritten for the one-way coupling. |
| `panel-code-view-switch-full.png` | The same, in context. |

Asserted alongside the shots, in the same run:

- `data-kai-work-surface-tab` = `code`, one `[data-kai-work-surface-code-empty]`
  node, and **zero iframes inside the surface** — nothing is being fetched, so
  there is no 404 path to hit.
- The empty-state text reads: *"Nothing to read yet / This tab frames the source
  behind the preview. Nothing has been pointed at it, so there is nothing to
  show. / Point `workSurface.codeUrl` at the file you want read here, and it
  loads in place of this message."*
- Switching back to Preview restores exactly one iframe.
- The panel switch toggles **both ways** — OFF (`aria-checked=false`, the app's
  Pane-kind group disappears) and back ON (`true`, it returns) — with **no
  validation problem on screen** and no trace of the old
  `"chrome.codeView" requires a codeUrl` message anywhere in the document. That
  round trip is the reported defect, failing before and passing here.
- No page errors and no console errors in either run.

Not changed, and not a regression: the read-only address bar keeps showing the
PREVIEW url while the Code tab is selected. `urlLabel` has never been scoped to
the tab, and the surface this is modeled on behaves the same way.
