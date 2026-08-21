# Design: rung 4 — the Lovable-style builder, a pure coverage rung

Date: 2026-08-20
Status: approved in brainstorming (owner), not implemented.
Parent: `2026-08-18-iteration-ladder-design.md` (the ladder). Predecessors: rungs 1–3 (#291–#300) and the workspace re-cast (#301–#303).

## The convergence question, answered

Rung 4's app is itself a builder UI, and the compile-to-WC builder idea (no spec exists; sketch in the owner's memory) needs a front end. The owner ruled: **rung 4 stays a pure component-coverage rung.** The builder front end gets its own later brainstorm → spec, informed by what rung 4 finds. Rationale: a rung's job is measurement, and mixing in front-end exploration for an undesigned product makes every friction ambiguous — kit gap or builder-design problem? Artifacts and the preview panel are exactly the surfaces a builder would lean on hardest, so a clean rung de-risks the builder anyway; convergence happens through the findings, not a shared spec.

## What the inventory corrected

The ladder row says rung 4 exercises "artifacts, preview panel" — the two families nothing has driven. Half right:

- **The artifact family is substantially built.** `kai-artifact` (`src/elements/artifact.tsx` over `src/components/artifact.tsx`) is a finished viewer: sandboxed preview iframe + Code tab (file-tree + code block), nav toolbar with editable path field, PDF path, maximize protocol with `kai-resizable` (`kai-maximize-intent`/`kai-maximize-state`), a card type (`ArtifactCardEnvelope`), a JSON schema that deliberately excludes `sandbox`, a scaffolder archetype (`artifact-split`), docs pages and Labs stories. Zero TODOs.
- **What is undriven is the composition.** No app in `examples/apps/` touches `kai-artifact`. The scaffolder's `artifact-split` output is a placeholder `https://example.com` iframe with no message→artifact bridge. The surface recipe (`agent-tooling/catalog/surfaces.ts`) self-documents that no single story composes all four ingredients. The `patterns/artifact-from-message.mdx` flow — assistant reply opens an artifact — is described and never built.
- **There is no preview-panel component, and that is by design.** "Preview panel" means the composition: `kai-artifact` inside a `kai-resizable` split (or `kai-workspace` end aside), with the maximize protocol wired.
- **Artifacts reach the thread one way:** a tool call producing a `card` part (`schemas/tool-defs.ts` → `ArtifactCardEnvelope`). There is no artifact `MessagePart` variant; `wire/encode.ts` never encodes card parts (annotated silent-drop). This is the settled cards-from-tools decision, not a gap.

So rung 4 is the composition rung: it drives the seam the docs describe and nothing exercises — tool call → artifact card → live split-panel preview.

## Decisions

- **The app generates small self-contained web pages** (single-file HTML/CSS/JS). Closest to the Lovable/Claude-Artifacts flow; exercises code files + iframe preview + iterate-on-it hardest.
- **React wrappers** (`@kitn.ai/ui/react`), second React rung: a builder shell has real layout/state where React pays for itself, and it deepens the one surface vanilla cannot reach, now over untouched families.
- **Single project, one thread.** No project list, no persistence. The rung exists for artifacts + the preview panel; everything else is chrome. (Persistence was rung 3's coverage.)
- **Card opens split panel.** Each generated page arrives as an artifact card in the message; it renders in-thread AND auto-pins into the right-hand split panel. Both halves of the seam get driven: the card envelope path and the resizable/maximize composition.
- **Client-side blob URLs, no file-serving backend.** `kai-artifact`'s preview iframe needs a URL — inline `file.code` feeds only the Code tab (`resolveFileUrl`, `components/artifact.tsx`). The component explicitly treats `data:`/`blob:` src as legitimate and ships `displayUrl` to show a clean address instead. The app mints a `blob:` URL from the entry HTML and sets `src` + `displayUrl` (e.g. `preview--myapp.local`). A backend serving generated files at real URLs is more Lovable-authentic but adds server state to a coverage rung for zero new component coverage.
- **Template: the Lovable Labs story** (`src/elements/lovable.stories.tsx`), owner-designated. The story hand-builds its browser chrome and fakes the running app; the rung app replaces that chrome with the real `kai-artifact` (which brings its own toolbar, path field, Preview|Code toggle, file tree and code block) and renders real generated pages.

## The shell

- **Top bar:** brand + app name; a Publish button as chrome only (non-functional — publishing is an application/policy decision, out of scope).
- **Left column (~400px):** the single thread — messages, in-thread artifact cards, `kai-tasks` if the model plans — with `kai-prompt-input` pinned at the bottom.
- **Right panel:** a `kai-resizable` split hosting `kai-artifact`. The maximize protocol gets wired (`kai-maximize-change` → `kai-resizable.maximizedIndex` — the exact edge the surface recipe documents). The Lovable device toggle (desktop/tablet/mobile) is consumer chrome constraining the artifact container's width — the kit has no device toggle and should not grow one for this.
- **Checkpoints:** each generated envelope gets a version row (vN badge + Restore, per the template) that swaps the panel back to an earlier version. Consumer-side; the kit has no version switcher and this rung does not add one.

## Data flow

Composer submit → the app's backend route (the scaffolder-emitted route family, as in prior rungs) → OpenRouter, real model, owner credential protocol. The client parses with `readModelStream` from `@kitn.ai/ui/wire` — never a hand-rolled SSE reader. The request carries the kit's artifact tool definition (`schemas/tool-defs.ts`); the system prompt instructs the model to deliver each page as a tool call with `files[]` carrying inline code. The tool call lands as a `card` part with an `ArtifactCardEnvelope`; the app renders the card in-thread, mints the blob URL, and pins the artifact into the split panel. Iterating in the thread yields new envelopes and new checkpoints.

Everything the model produces is untrusted: the envelope is validated by the artifact schema, the iframe keeps the default sandbox (no `allow-same-origin`), and every navigable URL goes through the existing guards. No new policy is authored.

## Method (ladder discipline, unchanged)

- Front-door-first: the app code is written by a clean-room agent with the kai MCP + published docs, against the packed tarball, outside this repo's context (contamination control per the ladder spec). `verify:fresh` gates the pack. Clean-room harness per the rung-1 plan § "The MCP-only rebuild" + all amendments (scoped umask; mirrored dir for keyless probing).
- README records full build provenance — the entire conversation verbatim plus the generated brief (owner policy).
- Repo plumbing (CI wiring, workspace, verification) stays insider. Plain branch off main, delegated implementation, independent verification, owner's live eyeball on the UI before merge.
- Done when: the app runs against a real provider, is checked in, and builds in CI. Rung-1 candidate G: re-measure baseline failure classes newly exercisable at this rung.

## Expected finding classes (going in)

- The scaffolder `artifact-split` placeholder: no message→artifact bridge exists in any emitted code — the front-door agent will hit this wall first.
- The blob-URL + `displayUrl` recipe: possibly undocumented on the consumer surface (`component_reference` / docs).
- The card-opens-panel flow (`artifact-from-message` pattern) as teachable-through-the-front-door, or not.
- Whatever the maximize wiring and the device-width container do to `kai-artifact` under a real consumer layout.

These are hypotheses to check against what the front-door agent actually stumbles on, not a to-do list to pre-fix.

## Explicitly not doing

- No compile-to-WC builder front-end exploration (owner ruling above).
- No multi-project workspace, no persistence, no functional Publish/deploy.
- No new kit components: no `kai-preview-panel`, no device toggle, no version switcher. If the rung proves one is needed, that is a finding to bring back, not a build to slip in.
- No artifact `MessagePart` variant, no wire changes — cards-from-tools is settled.
- No mocked streams: real provider for the app; CI builds the app but never calls a live model.
