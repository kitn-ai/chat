# `npx create-kai` scaffolder - design

Date: 2026-07-01
Status: DESIGN + RESEARCH ONLY (for human review). Nothing implemented.
Branch context: `feat/examples-rollout`. This is Phase 2 of the examples refresh
(Phase 1 = per-framework starters that double as templates; see
`docs/superpowers/HANDOFF-examples-refresh.md`).

## Summary

A `create-vite`-style interactive CLI, run with `npx create-kai`, that scaffolds a
runnable `@kitn.ai/ui` chat app. It goes past framework selection: it asks what
KIND of chat you are building, optionally wires a model gateway, writes the API key
into the project's local env, and prints the run steps so a fresh scaffold streams
a reply on first `npm run dev` with zero extra wiring.

The name matches the `kai-` element prefix. It is a standalone npm package named
`create-kai` (so `npm create kai` and `npx create-kai` both resolve). It is NOT the
existing AI-harness `kai` MCP scaffolder (`kai-mcp` bin), and NOT a runtime dep of
consumer apps.

Its templates are the `examples/*` starters (single source of truth). Its gateway
list, env vars, backend route templates, and per-archetype surface code come from
`packages/ui/src/agent-tooling/` (the same catalogs the `kai` MCP uses), so the two
tools never diverge.

## Goals

- One command from nothing to a running, streaming chat app.
- Zero-config default: Enter through every prompt gives React + composed workspace
  + local mock (no key, no backend) that streams a canned reply immediately.
- Reuse `examples/*` as templates and `src/agent-tooling/` as the gateway/archetype
  source of truth. No second copy of either to keep in sync.
- When a gateway is chosen, wire it end to end (deps + backend route/proxy + env)
  and write the key so the app talks to a real model on first run.
- Safe by default with keys: never expose a secret to the browser bundle; keep it
  server-side (dev proxy or meta-framework route); gitignore the env file.

## Non-goals

- Not the `kai` MCP (`npx @kitn.ai/ui mcp`). That teaches an AI harness to emit
  snippets into an existing project. `create-kai` creates a new project for a human.
- Not a runtime dependency. It runs once and leaves.
- Not a framework CLI replacement. It does not fork `create-vite`; where a
  meta-framework has its own generator (Next, TanStack Start) we compose on top of
  the pattern our `examples/*` already prove.
- v1 is not a pixel clone of ChatGPT / Perplexity / Claude Code / v0. Those live as
  SolidJS Storybook gallery pieces (`Labs/Apps`), not per-framework runnable apps.
  They inform the archetype LABELS, not a per-clone template matrix (see Risks).

## Research grounding (what exists today)

### The example templates

`examples/react/` is the polished flagship: a mini chat workspace COMPOSED BY HAND
(not the batteries-included `<kai-chat>` tag). Structure:

- `package.json` - `@kitn.ai/ui: "workspace:*"`, React 19, Vite 6, TS. Name
  `@kitn.ai/ui-example-react`, `private: true`.
- `index.html`, `vite.config.ts` (plain `@vitejs/plugin-react`, no aliases),
  `tsconfig.*`, `.gitignore`.
- `src/main.tsx` - registers elements (`import '@kitn.ai/ui/elements'`) + tokens
  (`import '@kitn.ai/ui/theme.tokens.css'`), then renders `<App/>`.
- `src/App.tsx` - composes `<Resizable>`/`<ResizableItem>` + `Sidebar` +
  `ThreadView` + `Composer` + `ThemeToggle`; `useKaiChat` owns messages/streaming.
- `src/components/*` (Sidebar, ThreadView, Composer, ThemeToggle, icons),
  `src/hooks/*` (useConversations, voice), `src/index.css` (111 lines, the shell
  chrome themed off `--color-*`), `src/chat-data.ts`.
- `src/chat-data.ts` - self-contained sample data + `streamFakeReply`, a local
  token-by-token fake responder. NO backend, NO key. This IS the default "mock".

So each example is highly self-contained. The framework-specific parts are the
project skeleton (build config, tsconfig, `main.*`, the component/hook files, the
framework idiom for setting `kai-*` array props + listening for `kai-submit`). The
shared, parameterizable parts are `chat-data.ts` (the sample data + the responder,
which the gateway step replaces) and `index.css` (shell theme, mostly reusable).

Coverage today: `examples/react/` is refreshed to the composed pattern.
`examples/vue/` still uses the older `kai-workspace` drop-in shape (rollout
pending). `examples/{angular,solid,nextjs,tanstack-start,composable,vanilla,widget}`
exist at various fidelities. Only React is the finished composed reference.

### The gateway + archetype catalogs (`src/agent-tooling/`)

`registry.ts` exports `listIntegrations()` and `listArchetypes()`. Each integration
is a Zod-typed `Integration` (`types.ts`): `id`, `title`, `category`
(`provider|gateway|framework|harness|mock`), `language` (`ts|python`),
`streamFormat`, `envVars: string[]`, `routeTemplates` (keyed by framework value ->
code string), `streamMapping`, `runNote`, `docsSlug`. Nine integrations ship today
(openrouter, vercel-ai-sdk, langgraph, cloudflare, ollama, mastra, pi, pydantic-ai,
mock). Six archetypes ship (`archetypes.ts`): drop-in-chat, support-widget,
knowledge-base (RAG), agentic, workspace, voice - each a `components: kai-*[]` list
+ a `defaultPlacement`.

`mcp/tools/scaffold.ts` already renders framework + archetype + integration into a
runnable front-end App file. It has renderers for `html`, `react`, `next`, `vue`,
`svelte`, `tanstack-start` (NO angular, NO solid). It special-cases `mock` to stream
client-side (the same idea as `streamFakeReply`), and emits the OpenAI-format SSE
reader loop for real gateways. `create-kai` reuses this exact code to generate the
non-default chat types and the gateway wiring.

### The existing bin

`packages/ui/package.json` ships one bin: `"kai-mcp": "./bin/mcp.js"`. A second bin
on the same package would NOT give the `npm create` UX: `npm create kai` and
`npx create-kai` resolve a package literally NAMED `create-kai`. So `create-kai`
must be its own package (see Package / bin structure).

## The interactive flow

Modeled on `create-vite` (project name -> framework -> variant -> next steps).
Every prompt has a default; pressing Enter through all of them yields a running
local chat. A positional arg sets the target dir (`npx create-kai my-app`); flags
allow a fully non-interactive run for CI (`--framework react --type workspace
--gateway none --yes`).

### 1. Project name

Prompt: `Project name:` (default `kai-app`, or the positional arg). Validates it is
an empty or non-existent dir; offers to clear a non-empty target.

### 2. Framework

Prompt: `Which framework?`

- React (default)
- Vue
- Svelte
- Angular
- HTML (plain, Vite)

Additional (available because templates + renderers exist, shown under a "more"
group or via flag): Next.js, TanStack Start, SolidJS. The framework choice gates the
chat-type and gateway options (see Coverage matrix and Gateway wiring).

### 3. Chat type ("what kind of chat are you building")

Prompt: `What kind of chat?` A small curated list, each mapping to a maintained
template or an archetype the renderer already produces. Recognizable app names are
DESCRIPTIONS, not separate templates.

| Type (id) | What it is | Backed by |
|---|---|---|
| Composed workspace (`workspace`) DEFAULT | Sidebar of conversations + a message thread + composer, wired by hand. ChatGPT / Claude-style app shell. | Hand-authored `examples/<fw>` (copy verbatim) |
| Drop-in chat (`drop-in`) | One full-page `<kai-chat>`. Smallest surface. | `archetypes: drop-in-chat` via `scaffold.ts` |
| Support widget (`widget`) | Floating bottom-right chat bubble. | `archetypes: support-widget` |
| Answer engine (`answers`) | Chat + sources + inline citations. Perplexity-style. | `archetypes: knowledge-base` |
| Agentic assistant (`agentic`) | Chat + tool panels + reasoning disclosure. | `archetypes: agentic` |
| Builder workspace (`builder`) | Chat + live artifact/preview split. v0 / Lovable-style. | `archetypes: workspace` |
| Voice assistant (`voice`) | Chat + voice input/output. | `archetypes: voice` |

The default `workspace` type is the flagship composed example. The other six come
from `scaffold.ts` render output, so adding a new archetype to the catalog adds a
new chat type for free.

### 4. Gateway (model/backend, frontend-side)

Prompt: `Wire a model gateway?` Sourced from `listIntegrations()`, ordered by
frontend relevance, with a synthesized "None" at the top that maps to the `mock`
integration.

- None - local mock, no key, no backend (default). Ships `streamFakeReply`.
- OpenRouter
- Vercel AI SDK (AI Gateway)
- Ollama (local models)
- Cloudflare AI (Workers AI)
- LangGraph
- Mastra
- Pydantic AI (Python backend)
- Pi (local coding-agent bridge)

Branch:

- None -> nothing to prompt; keep the mock responder. This is the zero-config win.
- A gateway WITHOUT a key (Ollama, Pi) -> no key prompt; print its `runNote`
  (e.g. `ollama serve`, or "Pi must be on PATH").
- A gateway WITH a key -> prompt for each `envVars` entry, e.g.
  `Paste your OPENROUTER_API_KEY (leave blank to fill in later):`. Multi-var
  gateways (Cloudflare: `CF_ACCOUNT_ID`, `CF_API_TOKEN`) prompt each in turn. Input
  is masked, never echoed, never logged. Blank leaves a commented placeholder.
- Before writing a keyed gateway into a pure-SPA framework (React/Vue/Svelte/
  Angular/HTML), show the security note (below) and confirm the safe path.

### 5. Install now?

Prompt: `Install dependencies now?` (Y/n). Detects the package manager from the
invoker (`npm_config_user_agent`): npm/pnpm/yarn/bun. On yes, runs install with a
spinner.

### 6. Finish - next steps

Prints a `create-vite`-style block:

```
Done. Next steps:

  cd my-app
  npm install        # (skipped if already installed)
  npm run dev

Gateway: OpenRouter. Key written to .env.local (gitignored - do not commit).
Docs: https://ui.kitn.ai/integrations/connect-any-model
```

For no-key gateways it prints the `runNote` (start Ollama / Pi first). For None it
just prints the run steps and a "swap the mock responder when ready" pointer.

## Template system

Two axes: framework (a directory) x chat type (a surface). The on-disk template
count stays equal to the number of frameworks, NOT framework x type x gateway - the
type and gateway are applied by generation and patching, not by storing a template
per combination. This is the core maintainability decision.

### Layers

1. Project skeleton (per framework). Copied from `examples/<framework>`: build
   config, `index.html`, `tsconfig.*`, `main.*`, `index.css`, `.gitignore`, the
   framework's `vite.config`. This is the single source of truth for how a consumer
   wires `kai-*` in that framework, and it is CI-built (drift is caught).

2. Chat surface (per type).
   - `workspace` (default): the hand-authored `App` + `components/` + `hooks/` +
     `chat-data.ts` from `examples/<framework>`, copied verbatim. This is the rich
     composed reference; it exists only where a finished example exists.
   - all other types: generated by `scaffold.ts`'s renderer for that framework +
     archetype. The renderer already emits an idiomatic `App`/entry file wired to
     the messages contract and the SSE reader.

3. Gateway wiring (per gateway). A patch over the skeleton + surface (deps, backend
   route or dev proxy, env). See next section.

### Copy + patch, not string templating

On copy, the CLI rewrites the skeleton so it is a standalone published-package
consumer, not a monorepo member:

- `package.json`: set `name` to the project name, drop `private`/monorepo bits,
  replace `"@kitn.ai/ui": "workspace:*"` with the published range (the CLI's own
  version pins a matching `@kitn.ai/ui` range, e.g. `^0.18.2`), add any gateway
  deps.
- Rename example-specific ids; strip repo-internal comments that reference
  `nx build ui` / `workspace:*`.

Everything else is a straight file copy; no per-file token substitution beyond the
`package.json` rewrite and the gateway patch. Keeping the emitted project
byte-identical to the reviewed `examples/*` (minus the package.json rewrite) is what
prevents drift.

### Bundling the templates

`create-kai` bundles the template files it needs into its own published tarball
(via its `files` field), so `npx create-kai` works without cloning the monorepo and
pins template + kit versions together. A build step in `packages/create-kai/` copies
the relevant `examples/*` trees and a generated `catalog.json` (from
`src/agent-tooling/registry.ts`) into the package before publish.

### Coverage matrix (v1 honesty)

A (framework x type) cell is available only if a generator exists for it:

| Framework | `workspace` (hand-authored) | archetype types (via scaffold.ts) |
|---|---|---|
| React | yes (flagship) | yes |
| Vue | after Phase-1 rollout | yes |
| Svelte | after rollout | yes |
| HTML | n/a (drop-in is the point) | yes |
| Next.js | after rollout | yes |
| TanStack Start | after rollout | yes |
| Angular | example skeleton only | no renderer yet |
| SolidJS | example skeleton only | no renderer yet |

Recommended v1: ship React composed-workspace + all archetype types for the
renderer frameworks, with gateway = None or one proven gateway. Expand as Phase-1
lands each framework's composed example, and add angular/solid renderers to
`scaffold.ts` (which also improves the MCP). The CLI enumerates only cells that
resolve, so it never offers a combination it cannot emit.

## Gateway wiring

For each keyed gateway, a pure-SPA framework (no server) needs the secret kept
server-side. The CLI's default is a Vite dev-server proxy: a small
`configureServer` plugin (or `server.proxy` entry) that reads the UNPREFIXED key via
`loadEnv` at dev time and proxies `/api/chat` to the upstream. The browser calls
`/api/chat`; the key never enters the client bundle. For meta-frameworks
(Next/TanStack), the CLI writes the integration's native server route
(`routeTemplates.next` etc.) instead of a proxy. Ollama/Pi/None need no proxy.

The front-end App for a keyed gateway is the `scaffold.ts` non-mock render (POST
`/api/chat`, read OpenAI-format SSE into the assistant message). For None it is the
mock render / the example's `streamFakeReply`.

| Gateway (id) | Frontend deps added | Backend added | Env var(s) | Server needed | Browser key safe |
|---|---|---|---|---|---|
| None / mock (`mock`) | none | none (client-side responder) | none | no | n/a (no key) |
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
  secret key in a static build." The CLI defaults to the safe path and offers to
  skip the key entirely.
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
- `bin`: `{ "create-kai": "./dist/index.js" }`. This is a SECOND, separate bin from
  the existing `kai-mcp` (which stays on `@kitn.ai/ui`). They do not share a package.
- Runtime: bundle to a single zero-dep file (esbuild/tsup) so npx cold-start is
  fast, matching create-vite. Prompts via `@clack/prompts` (polished, create-vite-
  like) or `prompts` (create-vite's own), + `picocolors`; both dev-deps, bundled in.
- Reuse of `src/agent-tooling/`: at BUILD time, generate `catalog.json` (integrations
  + archetypes, from `registry.ts`) and copy the needed `examples/*` trees into the
  package. The CLI reads the bundled catalog + templates at runtime. This keeps the
  gateway/archetype list in ONE place (the catalog) while avoiding a runtime
  dependency on `@kitn.ai/ui`. When an integration or archetype is added to the
  catalog, a rebuild picks it up for both the MCP and the CLI.
- Reuse the `scaffold.ts` renderers by importing them (build-time) or by extracting
  the pure render functions into a small shared module both the MCP and the CLI
  import. Preferred: extract `renderSurface(archetype, integration, framework)` into
  a framework-agnostic module under `src/agent-tooling/` so neither tool owns a copy.
- Versioning: `create-kai` pins the `@kitn.ai/ui` range it scaffolds. Release via the
  same conventional-commits / release-please pipeline; keep the two package versions
  loosely coupled through that pin.

## Verification

- A CLI smoke test that scaffolds each available (framework x type x {None, one
  keyed gateway}) cell into a temp dir and runs `install` + `build`, reusing the
  `/consumer-regression` harness and its `consumer-probe` agents. This is the drift
  guard: templates come from `examples/*`, examples are CI-built, and the smoke test
  proves the emitted project (post package.json rewrite + gateway patch) still
  builds.
- Golden-file tests on the emitted `.env.local`, `.gitignore` patch, and
  `package.json` rewrite (no secret leaked into client-exposed vars; key file
  gitignored).

## Open questions / risks

- Template drift. Mitigated by sourcing templates from CI-built `examples/*` and the
  scaffold smoke test. Risk remains if an example uses `workspace:*`-only APIs not in
  the published package; the smoke test builds against the real tarball to catch it.
- Extend `IntegrationSchema`. The catalog lacks an explicit install-deps list and a
  `frontendSafe`/`needsProxy` flag. Recommend adding both so the CLI (and the MCP)
  wire deps and the proxy decision deterministically instead of parsing prose. This
  is a small, backward-compatible schema addition.
- Matrix size. framework (up to 8) x type (7) x gateway (9) is large in theory. The
  layered design keeps ON-DISK templates = frameworks only; types and gateways are
  generated/patched. The real cost is the test matrix, bounded by sampling (each
  framework x a couple of types x {None, one keyed gateway}).
- App-clone fidelity. ChatGPT/Perplexity/Claude Code/v0/Lovable/Codex/T3 are
  SolidJS `Labs/Apps` Storybook pieces, not per-framework apps. Promoting any to a
  first-class template is a per-clone, per-framework porting cost. v1 maps their
  recognizable NAMES onto the seven archetype-backed types (labels/descriptions),
  and defers true clone templates. Revisit once the archetype set proves out.
- SPA production keys. The dev proxy makes `npm run dev` safe, but `vite build` is
  static and has no server. The finish message and docs must be explicit that
  production needs the user's own proxy/route. Consider offering "scaffold a minimal
  serverless proxy (Cloudflare Worker / Vercel function)" as a later option so the
  production path is also turnkey.
- Angular / Solid archetypes. No `scaffold.ts` renderer exists for them, so only the
  composed-workspace (skeleton) path is available. Adding renderers benefits both the
  CLI and the MCP; until then, gate those cells off.
- Gateway availability by framework. A keyed gateway in a SPA depends on the dev
  proxy; in a Python-backend gateway (Pydantic AI) the "backend" is a separate
  process the CLI can scaffold but not run inline. The prompt should filter or
  annotate gateways that need an out-of-band process.
