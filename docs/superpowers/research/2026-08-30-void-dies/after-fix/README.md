# after-fix — a no-flag `kai dev --builder`, over the repo's own bin

Captured 2026-08-30 from a scratch directory OUTSIDE the repo, driving the real
CLI with **no `--ui` flag**:

```
cd <scratch>
node /Users/home/Projects/kitn-ai/kitn-chat/packages/ui/bin/mcp.js dev --builder
```

which announced, before anything was generated:

```
using this checkout's own @kitn.ai/ui build — …/packages/ui/dist packed to
…/packages/ui/.kai-local-kit/kitn.ai-ui-0.30.0-9c8a4d666c687bd0.tgz.
Generated projects install THAT, not the published version. Pass --ui <spec> to override.
```

The emitted `.kai/acme-workspace/package.json` carries that tarball path rather
than `^0.30.0`, so the preview boots against the checkout's own `WorkSurface`
instead of dying on `does not provide an export named 'WorkSurface'`. A second
run reported `cached at` rather than `packed to` — the content-keyed cache
holding, so the preview does not reinstall on every start.

| file | what it shows |
|---|---|
| `a-builder-full.png` | The whole builder: panel on the left with a titled **WORK SURFACE** section, live preview beside it. |
| `a-panel-work-surface-and-hints.png` | The panel alone, scrolled to the work-surface section, hints under Header actions and Code URL. |
| `a-work-surface-section-closeup.png` | (a) The section heading reads **WORK SURFACE**, not the raw id `WORKSURFACE`; the design's own labels (Pane kind, Preview URL, Device toggle, URL bar, Open in new tab, Expand, Code view); the Code URL hint explains why Code view is off. |
| `b-workspace-pane-renders.png` | (b) The pane renders — chat rail left, work surface filling the main region with the placeholder page inside it. No empty column. |
| `c-widget-panel-hints.png` | (c) A non-Workspace template (Support widget) — its panel, with three hints. |
| `c-widget-capabilities-off-with-hint.png` | (c, close up) **Reasoning open** is deliberately OFF and says so underneath: "Off by owner ruling (2026-08-26): the thinking panel starts closed and opens on click." A control that is off can explain itself. |
