# `npx create-kai` scaffolder - design

Date: 2026-07-01. Revised 2026-08-07 (v2).
Status: DESIGN + RESEARCH ONLY (for human review). Nothing implemented.
Branch context: v1 was written on `feat/examples-rollout` (now merged; the kit is
published at 0.19.0). This is Phase 2 of the examples refresh (Phase 1 = the
per-framework starters that double as templates, now shipped).

## What changed in v2

Rob's review of v1 plus prior-art research on shadcn and TanStack moved five things:

1. **Layout comes first, not "chat type".** The real decision a builder makes is
   full-screen vs widget, then which features. The six archetypes are presets over
   that, not the primary axis.
2. **Features are a multi-select, not a fixed archetype list.** `agentic` and
   `workspace` differ only by which components compose. That is a checkbox list.
3. **A clone name means a real template.** No more mapping nine recognizable app
   names onto six generators that emit three distinct outputs.
4. **All eight starters are in scope, including SolidJS.** Solid is the authoring
   language of the kit; leaving it out was backwards. Next.js and TanStack Start are
   also real starters with a distinct (SSR) integration story.
5. **Staged v1 / v2 with a config contract written in v1.** `create-kai` scaffolds
   new projects; a later `add` command serves existing projects. The `kai.json` file
   written in v1 is what makes v2 cheap instead of a rewrite.
6. **The scaffolder offers to wire up the user's coding agent.** A prompt that writes
   project-scoped MCP config plus an `AGENTS.md` of the `kai-*` contract rules, so the
   harness they finish the app with already knows the kit. No prior art does this.
7. **The integration catalog needs OpenAI and Anthropic before this ships.** Neither
   exists today, and they are the two keys developers most often already hold.

## Summary

A `create-vite`-style interactive CLI, run with `npx create-kai`, that scaffolds a
runnable `@kitn.ai/ui` chat app. It asks where the chat lives (full-screen or
widget), which features it needs, and which framework, then optionally wires a model
gateway, writes the API key into the project's local env, and prints the run steps
so a fresh scaffold streams a reply on first `npm run dev` with zero extra wiring.

The name matches the `kai-` element prefix. It is a standalone npm package named
`create-kai` (so `npm create kai` and `npx create-kai` both resolve). It is NOT the
existing AI-harness `kai` MCP scaffolder (`kai-mcp` bin), and NOT a runtime dep of
consumer apps.

Its templates are the `examples/starters/*` trees (single source of truth). Its
gateway list, env vars, backend route templates, and per-feature surface code come
from `packages/ui/src/agent-tooling/` (the same catalogs the `kai` MCP uses), so the
two tools never diverge.

## Goals

- One command from nothing to a running, streaming chat app.
- Zero-config default: Enter through every prompt gives React + full-screen +
  conversation history + local mock (no key, no backend) that streams a canned reply
  immediately.
- Reuse `examples/starters/*` as templates and `src/agent-tooling/` as the
  gateway/feature source of truth. No second copy of either to keep in sync.
- When a gateway is chosen, wire it end to end (deps + backend route/proxy + env)
  and write the key so the app talks to a real model on first run.
- Safe by default with keys: never expose a secret to the browser bundle; keep it
  server-side (dev proxy or meta-framework route); gitignore the env file.
- Write a `kai.json` describing what was scaffolded, so a later `add` command can
  extend the project without re-deriving its shape.
- Offer to make the user's coding agent fluent in the kit (project-scoped MCP config
  + contract notes), since most people will finish the app with one.

## Non-goals

- Not the `kai` MCP (`npx @kitn.ai/ui mcp`). That teaches an AI harness to emit
  snippets into an existing project. `create-kai` creates a new project for a human.
- Not a runtime dependency. It runs once and leaves.
- Not a framework CLI replacement. It does not fork `create-vite`; where a
  meta-framework has its own generator (Next, TanStack Start) we compose on top of
  the pattern our starters already prove.
- v1 does not add to existing projects. That is v2 (`add`), and the design below
  keeps the door open for it rather than nailing it shut.
- v1 ships no app-clone templates. Under the clone rule (below), a clone name has to
  earn its place with a real template, and none is ported yet.

## Prior art (researched 2026-08-07)

### shadcn

The mature version of this problem. Commands: `init` (configures an EXISTING
project, or creates a new one with `--name`), `add` (components), `apply` (presets
into existing projects), `migrate`, `eject`, `search`/`list`, `docs`. Framework
awareness is explicit via `--template next|vite|start|react-router|laravel|astro`.

The load-bearing idea: **`components.json`**. `init` writes it; everything after
reads it. Adding to an existing project is only tractable because the tool owns a
config file describing the project, instead of re-inferring the project's shape on
every command. That file is why `add` can stay simple.

### TanStack

Their CLI does both, over one shared engine:

```bash
npx @tanstack/cli create my-app --add-ons clerk,drizzle
npx @tanstack/cli add clerk drizzle      # into an existing project
```

Same add-on system, two entry points. They also ship agent-facing JSON
introspection (`create --addon-details <id> --json`, `libraries --json`,
`search-docs --json`) so a coding agent can discover capabilities without scraping
help text. Worth noting: that is a thinner version of what our `kai` MCP already
does, which suggests the MCP is ahead of the field here and the human CLI is the
side that is missing.

### What we take from both

- Nobody serious picks create-new OR add-to-existing. They ship both over one
  generator, arrived at over several versions.
- The thing that makes add-to-existing safe is a config file the tool owns, not
  cleverness about the user's project.
- Therefore: build create-new first, but write the config file from day one.

## Research grounding (what exists today)

### The starter templates

After the Phase-1 reorg the starters live at `examples/starters/<framework>/`. There
are eight, in three tiers with genuinely different provenance:

| Tier | Starters | What they are | Kit dep |
|---|---|---|---|
| **Composed workspace** | react, vue, svelte, vanilla, angular | The Phase-1 hand-composed mini-workspace: conversations sidebar + message thread + composer, wired by hand over the `kai-*` elements. Each has `chat-data.ts` (sample data + `streamFakeReply`) and a `components/` split. | `workspace:*` |
| **Solid-native** | solid | 358-line single-file `App.tsx` composing the SolidJS components DIRECTLY (`ChatContainer`, `Message`, `PromptInput`, `ConversationList`, `ResizablePanelGroup`) rather than the `kai-*` web components. Uses `lucide-solid`. | `workspace:*` |
| **SSR consumer apps** | nextjs, tanstack-start | Real published-package consumer apps from the consumer-hardening campaign. Next: `app/layout.tsx` + `app/page.tsx` + `app/InteractiveIsland.tsx` (the client-island pattern). TanStack: `src/router.tsx` + `src/routes/`. | `file:../../..` (deliberately tarball-style, to test the consumer path) |

The React starter is the flagship: `src/App.tsx` composes `<Resizable>` +
`Sidebar` + `ThreadView` + `Composer` + `ThemeToggle`, with `useKaiChat` owning
messages/streaming, plus `src/components/*`, `src/hooks/*`, `src/index.css`,
`src/chat-data.ts`.

**Solid is a first-class case, not an afterthought.** Solid consumers import the
components directly from `@kitn.ai/ui` instead of registering web components. That is
the most native integration path in the whole matrix, and the starter proves it
builds. It needs its own surface renderer rather than reusing a `kai-*` one.

The framework-specific parts are the project skeleton (build config, tsconfig,
`main.*`, the component files, the idiom for setting `kai-*` array props and
listening for `kai-submit`). The shared, parameterizable parts are `chat-data.ts`
(sample data + responder, which the gateway step replaces) and `index.css`.

### The feature + gateway catalogs (`src/agent-tooling/`)

`registry.ts` exports `listIntegrations()` and `listArchetypes()`. Each integration
is a Zod-typed `Integration` (`types.ts`): `id`, `title`, `category`
(`provider|gateway|framework|harness|mock`), `language` (`ts|python`),
`streamFormat`, `envVars: string[]`, `routeTemplates` (keyed by framework value ->
code string), `streamMapping`, `runNote`, `docsSlug`. Nine integrations ship today
(openrouter, vercel-ai-sdk, langgraph, cloudflare, ollama, mastra, pi, pydantic-ai,
mock).

**Six** archetypes ship in `archetypes.ts` (v1 of this spec said seven; that was
wrong, and it double-counted the hand-authored workspace):

| id | components | defaultPlacement |
|---|---|---|
| `drop-in-chat` | `kai-chat` | full-page |
| `support-widget` | `kai-chat` | docked-widget |
| `knowledge-base` | `kai-chat`, `kai-sources` | full-page |
| `agentic` | `kai-chat`, `kai-tool`, `kai-reasoning` | side |
| `workspace` | `kai-chat`, `kai-artifact`, `kai-resizable` | side |
| `voice` | `kai-chat`, `kai-voice-input` | full-page |

Read that table as a components list plus a placement, and the v2 flow falls out of
it: **placement is the layout question, and `components` is the feature multi-select.**
The archetypes are six useful points in that space, not the space itself.

`mcp/tools/scaffold.ts` renders framework + archetype + integration into a runnable
front-end App file. Renderers exist for `html`, `react`, `next`, `vue`, `svelte`,
`tanstack-start`. **No angular renderer, no solid renderer.** It special-cases `mock`
to stream client-side (the same idea as `streamFakeReply`) and emits the OpenAI-format
SSE reader loop for real gateways. `create-kai` reuses this exact code.

### The existing bin

`packages/ui/package.json` ships one bin: `"kai-mcp": "./bin/mcp.js"`. A second bin
on the same package would NOT give the `npm create` UX: `npm create kai` and
`npx create-kai` resolve a package literally NAMED `create-kai`. So `create-kai`
must be its own package (see Package / bin structure). The v2 `add` command has no
such constraint and can live on `@kitn.ai/ui` alongside the MCP.

## The interactive flow

Modeled on `create-vite`, but the second question is layout, not framework variant.
Every prompt has a default; pressing Enter through all of them yields a running local
chat. A positional arg sets the target dir (`npx create-kai my-app`); flags allow a
fully non-interactive run for CI (`--framework react --layout full --features
conversations --gateway none --yes`).

```
1. Project name
2. Framework
3. Layout            full-screen | widget
   ├─ full-screen -> 3a. Features (multi-select)
   └─ widget      -> 3b. Style: floating bubble (FAB) | docked side panel
4. Gateway
5. Teach your coding agent?   (writes .mcp.json / AGENTS.md into the project)
6. Install now?
7. Next steps
```

### 1. Project name

Prompt: `Project name:` (default `kai-app`, or the positional arg). Validates it is
an empty or non-existent dir; offers to clear a non-empty target.

### 2. Framework

Prompt: `Which framework?`

- React (default)
- Vue
- Svelte
- SolidJS
- Angular
- HTML (plain, Vite)

Meta-frameworks (own group, they scaffold an SSR app rather than a SPA):

- Next.js
- TanStack Start

All eight have a starter. What varies is which layouts and features each can emit
(see Coverage matrix), and the CLI only offers cells it can actually produce.

### 3. Layout

Prompt: `Where does the chat live?`

- **Full-screen app** (default) - the chat IS the page.
- **Embedded widget** - the chat sits on top of an existing page.

This is the question a builder actually starts from, and it determines the shell,
the CSS, and whether a launcher is generated. It was previously buried inside each
archetype as `defaultPlacement`.

### 3a. Features (full-screen only, multi-select)

Prompt: `Which features?` Space to toggle, Enter to accept. Defaults marked.

| Feature (id) | Adds | Components |
|---|---|---|
| Conversation history (`conversations`) DEFAULT | Sidebar of past chats, new-chat, switching | `kai-conversations`, `kai-resizable` |
| Sources and citations (`sources`) | Inline citations + a sources panel (RAG / answer-engine shape) | `kai-sources` |
| Tools and reasoning (`agentic`) | Tool-call panels + reasoning disclosure | `kai-tool`, `kai-reasoning` |
| Artifacts and preview (`artifacts`) | Split view with a live artifact/preview pane | `kai-artifact`, `kai-resizable` |
| Voice (`voice`) | Mic input, optional speech output | `kai-voice-input` |
| Attachments (`attachments`) | File upload + attachment chips | `kai-file-upload`, `kai-attachments` |

Selecting nothing yields the bare full-page chat (equivalent to the old
`drop-in-chat` archetype). Selecting `conversations` yields the composed workspace,
which is the default and the flagship.

**Why multi-select beats a fixed type list.** `agentic` and `workspace` differ by
exactly which components get composed. As checkboxes, any combination is reachable
(sources + voice + attachments is a perfectly reasonable app and no archetype
offers it). As a fixed list, the CLI can only ever emit the six someone thought of.
The archetypes remain useful as **presets** and stay in the catalog; the CLI may
offer them as named shortcuts that pre-tick boxes, but the boxes are the truth.

### 3b. Widget style (widget only)

Prompt: `Widget style?`

- **Floating bubble (FAB)** (default) - bottom-right launcher, opens a panel.
- **Docked side panel** - a drawer pinned to one edge.

Features are not offered for widgets in v1: the widget surface is deliberately
minimal (the `support-widget` archetype is `kai-chat` alone). Voice is the one
plausible v1.1 addition.

### 4. Gateway

Prompt: `Wire a model gateway?` Sourced from `listIntegrations()`, ordered by
frontend relevance, with a synthesized "None" at the top that maps to the `mock`
integration.

The nine that ship today:

- None - local mock, no key, no backend (default). Ships `streamFakeReply`.
- OpenRouter
- Vercel AI SDK (AI Gateway)
- Ollama (local models)
- Cloudflare AI (Workers AI)
- LangGraph
- Mastra
- Pydantic AI (Python backend)
- Pi (local coding-agent bridge)

**Gap: there is no direct OpenAI integration and no direct Anthropic integration.**
The catalog covers aggregators (OpenRouter), SDK layers (Vercel AI SDK), orchestration
frameworks (LangGraph, Mastra, Pydantic AI), a local runner (Ollama), a
platform (Cloudflare) and a harness bridge (Pi). It does not cover "I have an OpenAI
key" or "I have an Anthropic key", which are the two most common starting points a
developer actually arrives with.

This is a real hole and it predates the CLI: the `kai` MCP has the same gap today.
Both integrations are cheap, because the wiring is the shape the catalog is already
built for: a single `envVars` entry (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`), a
`routeTemplates` entry per framework, and an SSE `streamMapping`. OpenAI's format is
already the one `scaffold.ts` emits a reader for; Anthropic's SSE needs its own
`streamMapping` (`content_block_delta` rather than `choices[].delta`).

Recommend adding both to `src/agent-tooling/integrations/` BEFORE the CLI ships, so
the gateway list matches what people expect on first run. Ordered list after that:

```
None (mock)  ·  OpenAI  ·  Anthropic  ·  OpenRouter  ·  Vercel AI SDK  ·  Ollama
             ·  Cloudflare AI  ·  LangGraph  ·  Mastra  ·  Pydantic AI  ·  Pi
```

Grouping matters more than count once the list passes ten. Suggest three groups in
the prompt: **No backend** (None), **Bring a key** (OpenAI, Anthropic, OpenRouter,
Vercel, Cloudflare), **Bring a server or runtime** (Ollama, LangGraph, Mastra,
Pydantic AI, Pi). The third group is exactly the set that needs an out-of-band
process, which the prompt should annotate rather than hide.

Branch:

- None -> nothing to prompt; keep the mock responder. This is the zero-config win.
- A gateway WITHOUT a key (Ollama, Pi) -> no key prompt; print its `runNote`
  (e.g. `ollama serve`, or "Pi must be on PATH").
- A gateway WITH a key -> prompt for each `envVars` entry, e.g.
  `Paste your OPENROUTER_API_KEY (leave blank to fill in later):`. Multi-var
  gateways (Cloudflare: `CF_ACCOUNT_ID`, `CF_API_TOKEN`) prompt each in turn. Input
  is masked, never echoed, never logged. Blank leaves a commented placeholder.
- Before writing a keyed gateway into a pure-SPA framework (React/Vue/Svelte/Solid/
  Angular/HTML), show the security note (below) and confirm the safe path.

### 5. Teach your coding agent (the `kai` MCP + harness config)

Prompt: `Set up your AI coding agent to build with kai?` (Y/n, default yes).

Most people scaffolding this will build the rest of the app with a coding agent. The
kit already ships the `kai` MCP (`npx @kitn.ai/ui mcp`: `scaffold`,
`component_reference`, `theme`, `debug`) precisely so a harness is fluent in the
`kai-*` contract. Today wiring it up is a manual step buried in
`apps/docs/src/content/docs/guides/for-ai-agents.mdx`. The scaffolder is the moment
the user is most likely to say yes, and it already knows the framework, features and
gateway to record.

On yes, write PROJECT-SCOPED config into the new project:

| Harness | File written | Shape |
|---|---|---|
| Claude Code | `.mcp.json` | `{ "mcpServers": { "kai": { "command": "npx", "args": ["-y", "@kitn.ai/ui", "mcp"] } } }` |
| Pi | `.mcp.json` (same shape; Pi also reads `~/.pi/agent/mcp.json`) | same |
| Codex | `.codex/config.toml` MCP block | equivalent stdio server entry |
| Copilot / VS Code | `.vscode/mcp.json` | VS Code MCP shape |
| Cursor | `.cursor/mcp.json` | same `mcpServers` shape |
| OpenCode | `opencode.json` MCP block | same stdio server |

Plus an `AGENTS.md` (and a `CLAUDE.md` pointer to it) carrying the handful of
contract rules that agents reliably get wrong, which are already written down in this
repo's own `CLAUDE.md`:

- Elements are prefixed `kai-`, never `kitn-`.
- Array/object props (`messages`, `suggestions`, `models`) are set as JS
  PROPERTIES, never HTML attributes; only scalars work as attributes.
- Events are non-bubbling `kai-*` CustomEvents; listen on the element itself.
  Submit is `kai-submit`, read `event.detail.value`.
- Streaming needs a NEW array/object reference per chunk; mutating in place does not
  re-render.
- Non-React frameworks must set boolean flags as truthy properties, and should gate
  on `customElements.whenDefined` because registration is async.

**Rules for this step**, because a scaffolder writing agent config is easy to get
wrong:

- **Project scope only.** Never write to `~/.claude.json`, `~/.pi/agent/mcp.json`, or
  any other user-global config. The scaffolder created one directory; it gets to
  write inside that directory and nowhere else.
- **Detect, offer, confirm.** Detect likely harnesses from what is on PATH or already
  in the parent project, present them pre-ticked, and let the user untick. Default to
  the multi-harness `.mcp.json` when detection finds nothing, since Claude Code,
  Cursor, Pi and OpenCode all read that shape.
- **No install, no auth, no network.** Writing a JSON file that points at
  `npx @kitn.ai/ui mcp` is the whole job. The harness installs the server on first
  use. The CLI must not run `claude mcp add` or any other harness mutation.
- **`--no-agent` flag** and a skip in CI.

This is the piece of the design with no equivalent in the prior art. TanStack ships
`--json` introspection so agents can discover their CLI; shadcn ships an agent skill
file in-repo (`skills/shadcn/cli.md`). Neither offers to wire the agent into the
project it just scaffolded. Given that this kit's whole premise is being built WITH
coding agents, doing that in the one command is a real differentiator and costs a few
JSON writes.

### 6. Install now?

Prompt: `Install dependencies now?` (Y/n). Detects the package manager from the
invoker (`npm_config_user_agent`): npm/pnpm/yarn/bun. On yes, runs install with a
spinner.

### 7. Finish - next steps

Prints a `create-vite`-style block:

```
Done. Next steps:

  cd my-app
  npm install        # (skipped if already installed)
  npm run dev

Gateway: OpenRouter. Key written to .env.local (gitignored - do not commit).
Agent:   kai MCP wired in .mcp.json + contract notes in AGENTS.md.
Docs: https://ui.kitn.ai/integrations/connect-any-model
```

For no-key gateways it prints the `runNote` (start Ollama / Pi first). For None it
prints the run steps and a "swap the mock responder when ready" pointer.

## The mock responder (decide before building)

The zero-config default is the difference between a scaffolder that feels alive and
one that dumps files, so it needs a real decision rather than an implementation
detail.

All five composed-workspace starters already carry a `streamFakeReply` in their own
`chat-data.ts`, and `scaffold.ts` has its own client-side mock render. That is two
implementations plus five copies. **Standardize one**: a small
`createMockResponder({ delayMs, chunkSize, replies })` shipped from
`@kitn.ai/ui/state` (which already exports `createAssistantStream`, used by the
vanilla starter). Every starter and every scaffold render imports it.

Requirements: token-by-token streaming with a plausible cadence, a fresh
array/object reference per chunk (the kit's re-render contract), a handful of canned
replies that make the seeded conversation coherent, and an obvious single-function
seam to replace with a real fetch. It must have zero deps and never touch the
network.

This also removes a class of drift where a starter's mock and the scaffolder's mock
diverge in behaviour and a consumer sees different streaming in the two paths.

## The clone rule

**A recognizable app name appears in the CLI only if it maps to a real, maintained
template that produces a genuinely distinct app.** Rob's call, and it is the right
one.

v1 of this spec proposed labelling the six archetypes with clone names. Checking that
mapping against the actual `Labs/Apps` gallery kills the idea:

| Clone | Would map to |
|---|---|
| ChatGPT | `drop-in-chat` |
| Perplexity, Perplexity Pro | `knowledge-base` |
| Codex | `agentic` |
| Claude Code, v0, Lovable, T3 Code, AMUX | `workspace` |
| (none) | `support-widget`, `voice` |

Nine names collapse onto four generators, five of them onto `workspace` alone, and
two archetypes have no clone at all. Offering "Claude Code-style / v0-style /
Lovable-style / T3-style" when all four emit identical output is the kind of thing a
developer notices immediately, and it costs trust in the tool.

So: **v1 ships no clone names.** The feature multi-select describes what you get in
plain terms. Later, if a clone is worth porting as a real per-framework template, it
earns its name at that point. The `Labs/Apps` gallery becomes the template roadmap
rather than a label source.

Worth noting for that roadmap: the two archetypes with no clone (`support-widget`,
`voice`) are arguably the most common commercial asks. The gallery skews toward
dev-tool clones, which is a fact about the gallery, not about the archetypes.

## The `kai.json` contract (written in v1, read in v2)

`create-kai` writes a `kai.json` at the project root describing what it scaffolded.
Nothing reads it in v1. It exists so that v2's `add` never has to infer a project's
shape, which is the single thing that makes shadcn's `add` tractable.

```jsonc
{
  "$schema": "https://ui.kitn.ai/schema/kai.json",
  "version": 1,
  "framework": "react",          // react|vue|svelte|solid|angular|html|nextjs|tanstack-start
  "kit": "^0.19.0",              // the @kitn.ai/ui range this project was scaffolded against
  "layout": "full-screen",       // full-screen|widget
  "widgetStyle": null,           // fab|side, when layout=widget
  "features": ["conversations"], // the multi-select result
  "gateway": "none",             // integration id
  "registration": "elements",    // "elements" (kai-* web components) | "solid" (direct imports)
  "paths": {
    "entry": "src/main.tsx",
    "app": "src/App.tsx",
    "components": "src/components",
    "css": "src/index.css",
    "env": ".env.local"
  },
  "theme": { "tokens": "@kitn.ai/ui/theme.tokens.css", "default": "dark" }
}
```

`registration` is the field that earns its keep: it is `"solid"` for the Solid
starter (direct component imports) and `"elements"` everywhere else (`kai-*` web
components). Any future codegen has to branch on it, and inferring it after the fact
means parsing the entry file.

Cost in v1: roughly thirty lines to write the file and a JSON schema to publish.
That is the whole reason v2 is a feature rather than a rewrite.

## Template system

Two axes: framework (a directory) x surface (layout + features). The on-disk
template count stays equal to the number of frameworks, NOT framework x layout x
features x gateway. Surface and gateway are applied by generation and patching. This
is the core maintainability decision and it survives from v1 unchanged.

### Layers

1. **Project skeleton** (per framework). Copied from `examples/starters/<framework>`:
   build config, `index.html`, `tsconfig.*`, `main.*`, `index.css`, `.gitignore`, the
   framework's `vite.config`. Single source of truth for how a consumer wires the kit
   in that framework, and CI-built (drift is caught).

2. **Chat surface** (per layout + features).
   - `full-screen` + `conversations` (the default): the hand-authored `App` +
     `components/` + `hooks/` + `chat-data.ts` from the starter, copied verbatim.
     This is the rich composed reference; it exists only where a composed starter
     exists.
   - every other combination: generated by `scaffold.ts`'s renderer for that
     framework, with the feature set resolved to a components list. The renderer
     already emits an idiomatic entry file wired to the messages contract and the SSE
     reader.

3. **Gateway wiring** (per gateway). A patch over skeleton + surface (deps, backend
   route or dev proxy, env).

4. **`kai.json`** describing the result.

### Copy + patch, not string templating

On copy, the CLI rewrites the skeleton so it is a standalone published-package
consumer, not a monorepo member:

- `package.json`: set `name` to the project name, drop `private`/monorepo bits,
  replace `"@kitn.ai/ui": "workspace:*"` (or `"file:../../.."` for the SSR starters)
  with the published range (the CLI's own version pins a matching `@kitn.ai/ui`
  range, e.g. `^0.19.0`), add any gateway deps.
- Rename example-specific ids; strip repo-internal comments that reference
  `nx build ui` / `workspace:*`.

Everything else is a straight file copy. Keeping the emitted project byte-identical
to the reviewed starter (minus the package.json rewrite and gateway patch) is what
prevents drift.

Note the SSR starters use `file:../../..` rather than `workspace:*`, so the rewrite
has two input shapes to handle, not one.

### Bundling the templates

`create-kai` bundles the template files it needs into its own published tarball (via
its `files` field), so `npx create-kai` works without cloning the monorepo and pins
template + kit versions together. A build step in `packages/create-kai/` copies the
relevant `examples/starters/*` trees and a generated `catalog.json` (from
`src/agent-tooling/registry.ts`) into the package before publish.

### Coverage matrix (v2, honest)

Which cells can actually be emitted today:

| Framework | Composed workspace template | `scaffold.ts` renderer | Registration | Notes |
|---|---|---|---|---|
| React | yes (flagship) | yes | elements | Reference implementation |
| Vue | yes | yes | elements | |
| Svelte | yes | yes | elements | |
| Vanilla / HTML | yes | yes (`html`) | elements | Imperative DOM over raw `kai-*` |
| Angular | yes (Angular 22, zoneless) | **no renderer** | elements | Composed template only until a renderer exists. Needs Node >= 22.22.3 |
| SolidJS | single-file, Solid-native | **no renderer** | **solid** | Direct component imports, not `kai-*`. Needs its own renderer |
| Next.js | no (SSR consumer app) | yes (`next`) | elements | Client-island pattern; native route for gateways |
| TanStack Start | no (SSR consumer app) | yes (`tanstack-start`) | elements | Native route for gateways |

Two real gaps, both of which also improve the MCP if closed:

- **Angular and Solid have no `scaffold.ts` renderer.** Until they do, those
  frameworks offer only the composed-workspace path, and the feature multi-select is
  limited to what the hand-authored template already includes.
- **Next.js and TanStack Start have no composed-workspace template.** They have
  renderers, so feature combinations work, but the flagship hand-composed shell does
  not exist for them.

The CLI enumerates only cells that resolve, so it never offers a combination it
cannot emit.

## Staging

### v0 - catalog prerequisites (before the CLI)

Small, independently useful, and they improve the `kai` MCP on their own:

- Add `openai` and `anthropic` integrations to `src/agent-tooling/integrations/`.
- Extend `IntegrationSchema` with an explicit deps list and a
  `frontendSafe`/`needsProxy` flag.
- Extract `renderSurface({ framework, components, integration })` so the MCP and the
  CLI share one renderer, keyed on a components list rather than an archetype id.
- Standardize the mock responder in `@kitn.ai/ui/state`.

### v1 - `create-kai` (new projects)

- The flow above, all eight frameworks, gated by the coverage matrix.
- Gateway None + the keyed gateways enabled by v0 (OpenAI, Anthropic, OpenRouter).
- The coding-agent step: project-scoped `.mcp.json` + `AGENTS.md`.
- `kai.json` written but unread.
- Smoke test across a sampled matrix.

Explicitly out: clone templates, `add`, Angular/Solid renderers.

### v2 - `add` (existing projects)

`npx @kitn.ai/ui add <feature>` on the existing `@kitn.ai/ui` package, alongside the
`kai-mcp` bin. No new package needed, and it mirrors what the MCP already does for
agents.

- Reads `kai.json` when present. When absent (a project that never ran
  `create-kai`), runs a short `init` that detects framework / entry / css paths,
  confirms them with the user, and writes `kai.json`. Detection is one-time and
  confirmable, never per-command inference.
- Adds a feature to an existing app: installs deps, emits the component code via the
  shared renderer, patches the entry file's registration, updates `kai.json`.
- Closes the gap where an AI harness can add kai to an existing app (via the MCP)
  but a human at a terminal cannot.

### Why not both at once

shadcn and TanStack both arrived at the two-command shape over several versions.
Add-to-existing is where every ugly edge case lives: unusual tsconfig, no Tailwind,
monorepos, an entry file that does not match any known shape. Building it alongside
v1 doubles the surface while the template system is still settling.

## Gateway wiring

For each keyed gateway, a pure-SPA framework (no server) needs the secret kept
server-side. The CLI's default is a Vite dev-server proxy: a small `configureServer`
plugin (or `server.proxy` entry) that reads the UNPREFIXED key via `loadEnv` at dev
time and proxies `/api/chat` to the upstream. The browser calls `/api/chat`; the key
never enters the client bundle. For meta-frameworks (Next/TanStack), the CLI writes
the integration's native server route (`routeTemplates.next` etc.) instead of a
proxy. Ollama/Pi/None need no proxy.

The front-end surface for a keyed gateway is the `scaffold.ts` non-mock render (POST
`/api/chat`, read OpenAI-format SSE into the assistant message). For None it is the
mock render / the standardized mock responder.

| Gateway (id) | Frontend deps added | Backend added | Env var(s) | Server needed | Browser key safe |
|---|---|---|---|---|---|
| None / mock (`mock`) | none | none (client-side responder) | none | no | n/a (no key) |
| OpenAI (`openai`) **TO ADD** | none (fetch) | dev proxy (SPA) or native route | `OPENAI_API_KEY` | yes | NO - needs proxy |
| Anthropic (`anthropic`) **TO ADD** | none (fetch) | dev proxy (SPA) or native route | `ANTHROPIC_API_KEY` | yes | NO - needs proxy |
| OpenRouter (`openrouter`) | none (fetch) | dev proxy (SPA) or `routeTemplates.next` | `OPENROUTER_API_KEY` | yes | NO - needs proxy |
| Vercel AI SDK (`vercel-ai-sdk`) | `ai` (+ a provider pkg) | route / proxy | `AI_GATEWAY_API_KEY` | yes | NO - needs proxy |
| Ollama (`ollama`) | none | optional proxy, or direct + `OLLAMA_ORIGINS` | none | local | YES (local, no key) |
| Cloudflare AI (`cloudflare`) | none (fetch) | route / proxy, or a Worker | `CF_ACCOUNT_ID`, `CF_API_TOKEN` | yes | NO - needs proxy |
| LangGraph (`langgraph`) | `@langchain/langgraph`, `@langchain/openai`, `@langchain/core` | Node route | `OPENAI_API_KEY` | yes (Node) | NO - needs proxy |
| Mastra (`mastra`) | `@mastra/client-js` | route calling a Mastra server | `MASTRA_URL` | yes (Mastra server) | URL, not a secret |
| Pydantic AI (`pydantic-ai`) | pip: `pydantic-ai fastapi uvicorn` | FastAPI app (separate process) | `OPENAI_API_KEY` | yes (Python) | NO - needs proxy |
| Pi (`pi`) | none (spawns `pi`) | local stdio bridge (Node) | none | yes (local bridge) | n/a - sandbox before exposing |

Notes: env var names and route templates come verbatim from each integration in
`src/agent-tooling/integrations/*`. Two fields the catalog does NOT yet carry are
needed for deterministic wiring and should be added to `IntegrationSchema` (see Open
questions): an explicit deps list (`{ npm?: string[]; pip?: string[] }`) and a
`frontendSafe` / `needsProxy` flag. Today deps are only described in prose in
`runNote`/route templates.

## API key + `.env` handling + security

- Write keys to `.env.local` (Vite and Next both read it; both gitignore it by
  convention). The CLI ensures `.env.local` and `.env*.local` are in `.gitignore`,
  appending if missing. It never writes to `.env` (which some setups commit).
- Use the UNPREFIXED name (`OPENROUTER_API_KEY`, not `VITE_...` / `NEXT_PUBLIC_...`).
  Vite only exposes `VITE_`-prefixed vars to client code; Next only `NEXT_PUBLIC_`.
  The unprefixed key stays server-side, read by the dev proxy or the route handler.
  The CLI NEVER prefixes a secret key for the browser.
- Never echo the key to stdout, never log it, never commit it. Masked prompt input.
  Blank input writes a commented placeholder (`# OPENROUTER_API_KEY=` + a one-line
  pointer) so the user can fill it in later.
- Security note shown before writing any keyed gateway into a SPA framework:
  "A frontend bundle is public. A key placed in client code is readable by anyone.
  This scaffold keeps your key server-side via a dev proxy, so it is safe in
  `npm run dev`. `vite build` produces a static site with no server: for production,
  put the key behind your own server route or a serverless proxy. Never ship a
  secret key in a static build." The CLI defaults to the safe path and offers to skip
  the key entirely.
- Browser-direct is offered ONLY for gateways with no secret: Ollama (local, with
  `OLLAMA_ORIGINS` guidance) and None. Everything with a secret key is proxied.
- Pi runs with full user permissions; its wiring prints the "sandbox before exposing
  to a public endpoint" warning from the integration `runNote`.

## Run / build UX

- After scaffolding, print the next-steps block (cd, install if skipped, dev).
- Optional auto-install (prompt 5), package-manager-aware.
- Optional auto-run: a final `Start the dev server now?` (default no in CI, offered
  interactively). On yes, spawn `npm run dev` and hand over.
- Always include the gateway line (which key file, gitignored) and the relevant
  `docsSlug` link (`https://ui.kitn.ai/<docsSlug>`) from the chosen integration.

## Package / bin structure

- A new standalone package `create-kai` (unscoped), so `npm create kai` /
  `npx create-kai` resolve. Developed as a workspace package `packages/create-kai/`
  in this monorepo; published separately from `@kitn.ai/ui`.
- `bin`: `{ "create-kai": "./dist/index.js" }`. Separate from the existing `kai-mcp`
  (which stays on `@kitn.ai/ui`). The v2 `add` command goes on `@kitn.ai/ui`, not
  here, since it does not need the `npm create` resolution trick.
- Runtime: bundle to a single zero-dep file (esbuild/tsup) so npx cold-start is fast,
  matching create-vite. Prompts via `@clack/prompts` (polished, create-vite-like) or
  `prompts` (create-vite's own), + `picocolors`; both dev-deps, bundled in.
- Reuse of `src/agent-tooling/`: at BUILD time, generate `catalog.json` (integrations
  + archetypes, from `registry.ts`) and copy the needed `examples/starters/*` trees
  into the package. The CLI reads the bundled catalog + templates at runtime. Keeps
  the gateway/feature list in ONE place while avoiding a runtime dependency on
  `@kitn.ai/ui`.
- Reuse the `scaffold.ts` renderers by extracting the pure render functions into a
  small shared module both the MCP and the CLI import. Preferred:
  `renderSurface({ framework, components, integration })` under `src/agent-tooling/`
  so neither tool owns a copy. Note the signature takes a COMPONENTS LIST, not an
  archetype id, which is what makes the feature multi-select possible.
- Consider TanStack-style `--json` introspection (`--list-features --json`) so coding
  agents can discover the CLI's capabilities. Cheap to add, and it keeps the human CLI
  and the MCP telling the same story.
- Versioning: `create-kai` pins the `@kitn.ai/ui` range it scaffolds. Release via the
  same conventional-commits / release-please pipeline; keep the two package versions
  loosely coupled through that pin.

## Verification

- A CLI smoke test that scaffolds each available (framework x surface x {None, one
  keyed gateway}) cell into a temp dir and runs `install` + `build`, reusing the
  `/consumer-regression` harness and its `consumer-probe` agents. This is the drift
  guard: templates come from `examples/starters/*`, starters are CI-built, and the
  smoke test proves the emitted project (post package.json rewrite + gateway patch)
  still builds.
- Golden-file tests on the emitted `.env.local`, `.gitignore` patch, `package.json`
  rewrite, and `kai.json` (no secret leaked into client-exposed vars; key file
  gitignored; `kai.json` validates against its schema).
- At least one emitted project per registration mode (`elements` and `solid`), since
  they exercise different import paths.

## Open questions / risks

- **Feature combinations are not all tested.** Multi-select means the CLI can emit
  combinations nobody has looked at (sources + artifacts + voice in Angular). The
  renderer composes them mechanically, but "compiles" is not "looks right". Mitigate
  by sampling combinations in the smoke test and by keeping the composed-workspace
  default on a hand-reviewed path.
- **Angular and Solid renderers.** No `scaffold.ts` renderer exists for either, so
  those frameworks are limited to the composed template. Adding renderers benefits
  the MCP too. Solid's is the more interesting one because it emits direct component
  imports rather than `kai-*` elements (the `registration: "solid"` branch).
- **No composed workspace for Next/TanStack.** They have renderers but no
  hand-composed shell, so the flagship experience is missing on exactly the two
  frameworks most likely to be used in production. Worth considering as the first
  post-v1 template work.
- **Template drift.** Mitigated by sourcing templates from CI-built starters and the
  smoke test. Risk remains if a starter uses `workspace:*`-only APIs not in the
  published package; the smoke test builds against the real tarball to catch it.
- **Extend `IntegrationSchema`.** The catalog lacks an explicit install-deps list and
  a `frontendSafe`/`needsProxy` flag. Recommend adding both so the CLI (and the MCP)
  wire deps and the proxy decision deterministically instead of parsing prose. Small,
  backward-compatible addition.
- **Matrix size.** framework (8) x features (2^6) x gateway (9) is enormous in
  theory. On-disk templates stay at 8; everything else is generated. The real cost is
  the test matrix, bounded by sampling.
- **SPA production keys.** The dev proxy makes `npm run dev` safe, but `vite build`
  is static and has no server. The finish message and docs must be explicit that
  production needs the user's own proxy/route. Consider offering "scaffold a minimal
  serverless proxy (Cloudflare Worker / Vercel function)" as a later option so the
  production path is also turnkey.
- **Gateway availability by framework.** A keyed gateway in a SPA depends on the dev
  proxy; in a Python-backend gateway (Pydantic AI) the "backend" is a separate
  process the CLI can scaffold but not run inline. The prompt should filter or
  annotate gateways that need an out-of-band process.
- **Harness config formats drift.** MCP config shapes differ per harness and change
  between versions. Writing six formats means six things to keep current. Mitigate by
  making `.mcp.json` (the shape Claude Code, Cursor, Pi and OpenCode share) the
  default and treating the rest as best-effort, and by keeping the written config to
  the smallest possible stdio entry so there is less to break.
- **Agent config is a trust surface.** A CLI that writes files telling a coding agent
  what to do deserves care: project scope only, contents shown or summarized before
  writing, and nothing that grants the agent capability beyond reading our docs. The
  `AGENTS.md` content should stay factual contract notes, not instructions that
  steer the agent's behaviour generally.
- **`kai.json` naming and schema stability.** Once published it is a public contract.
  Worth a look at whether it should live at the root (shadcn's `components.json`
  precedent) or under a config dir, and whether the schema URL should be versioned
  per kit minor.
