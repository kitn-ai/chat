# CLAUDE.md

Guidance for working **in this repo** with Claude Code. Consumer-facing usage lives in [README.md](README.md); the public docs are at <https://ui.kitn.ai>; the Claude Code tooling index is [`.claude/README.md`](.claude/README.md).

## What this is

`@kitn.ai/ui` — framework-agnostic, Shadow-DOM **web components** for building AI chat UIs (message threads, prompt input, streaming, markdown/code, reasoning + tool panels, attachments, generative-UI cards, artifacts). **Authored in SolidJS**, consumed from React / Vue / Svelte / Angular / plain HTML. Published to npm. The repo also ships the **`kai` MCP** (`packages/ui/src/agent-tooling/`) — a dev-time scaffolder that makes AI coding harnesses fluent at building with the library (`npx @kitn.ai/ui mcp`; tools: `scaffold` · `component_reference` · `theme` · `debug`).

## Architecture — two layers, Solid is the source of truth

- `packages/ui/src/primitives/` headless logic hooks + `ChatConfig` + on-demand highlighter · `packages/ui/src/ui/` in-house accessible UI primitives (no third-party UI deps) · `packages/ui/src/components/` the SolidJS AI feature components.
- `packages/ui/src/elements/` wraps coarse **`kai-*` web-component facades** over those via `defineWebComponent`; the elements bundle registers them (client-only — `register.ts` → `register-impl.ts`). `packages/ui/frameworks/react/` holds generated typed React wrappers (`@kitn.ai/ui/react`, exports `Chat`, `Message`, …).
- `packages/ui/src/state/` (`@kitn.ai/ui/state`) I/O-free pure folds over `ChatMessage[]`: `createAssistantStream`, `appendTextPart`/`appendReasoningPart`/`upsertToolPart` · `packages/ui/src/wire/` (`@kitn.ai/ui/wire`) the **model-stream adapter**: `readOpenAIStream` / `readAnthropicStream` / `readModelStream` parse provider SSE onto those parts, `toOpenAIMessages` / `toAnthropicMessages` encode the thread back. **The kit PARSES, the consumer FETCHES**, so there is no client, no key handling and no provider SDK below `wire/`. Never hand-roll an SSE reader in a doc, example or scaffold: import this one.
- `packages/ui/src/agent-tooling/` the `kai` MCP server + the integration/archetype catalogs — independent of the components.

## The `kai-` contract — do NOT get this wrong (it's what consumers hit)

- Elements are prefixed **`kai-`** (`<kai-chat>`). NEVER `kitn-` (a legacy prefix; the register-all bundle is `dist/kai.es.js`).
- **Array/object props** (`messages`, `suggestions`, `models`, …) are set as **JS properties**, never HTML attributes; only scalars (`placeholder`, `loading`, `theme`) work as attributes.
- Events are **non-bubbling `kai-*` CustomEvents** — listen on the element itself. Submit = **`kai-submit`**, read `event.detail.value`.
- Streaming needs a **new array/object reference per chunk** — mutating in place does not re-render.

## Build / test / dev

Run all commands from the **repo root** (pnpm + NX workspace):

```bash
pnpm install
pnpm dev             # Storybook (6006) + docs site (4321) together via nx run-many -t dev
nx build ui          # vite lib builds into packages/ui/dist/ (or pnpm build for all)
nx typecheck ui      # 4 tsc passes: Solid src + react wrappers + react tests + the Node MCP
pnpm --filter @kitn.ai/ui exec vitest run --project=unit  # jsdom unit suite; bare pnpm test / nx test ui also runs the flaky storybook browser project
pnpm --filter @kitn.ai/ui run verify:scaffold  # compiles the MCP scaffolder's EMITTED code with tsc --strict (needs a build first)
```

- **Gotcha:** after `nx build ui` / `build:api`, run `git checkout -- packages/ui/src/components/component-meta.json` — it churns with TS-type-expansion noise and is NOT used at runtime.
- `packages/ui/dist/` is a gitignored build artifact; `prepublishOnly` rebuilds it. The package ships **compiled** entry points (`.`, `./react`, `./elements`) — don't reintroduce raw-source exports.

## Testing the CONSUMER experience (not just internals)

`pnpm --filter @kitn.ai/ui exec vitest run --project=unit` is internal. To test what a consumer of the **published package** hits — packaging, exports, SSR, scaffold output, across every framework/integration — use the project skill **`/consumer-regression`** (`smoke` = one parallel pass + report; `regression` = the full build → triage → fix → re-verify loop). Unit tests catch none of those. See [`.claude/README.md`](.claude/README.md).

Two cheap guards cover the same ground in the required CI job, and both are worth running locally before you push:

- `pnpm --filter @kitn.ai/ui run verify:consumer` packs the build, installs it into a throwaway app, bundles it with Vite 8 / Rolldown, and asserts every `kai-*` registration survives a real consumer bundler.
- `pnpm --filter @kitn.ai/ui run verify:scaffold` generates 270 scaffolder outputs (6 archetypes × 9 integrations × 5 TS frameworks) and compiles them with `tsc --strict --noUnusedLocals`, resolving `@kitn.ai/ui` through the shipped exports map, then structurally checks the 54 `html` ones tsc cannot see. Emitted code lives in string literals, so `scaffold.test.ts` can assert its wording but never its types. Run this after touching `agent-tooling/mcp/tools/scaffold.ts` or any integration route template. Needs `nx build ui` first.

## Conventions

- **Copy/voice:** sound like a sharp human engineer, not AI-generated — follow `apps/docs/STYLE.md`. Web-components-FIRST framing; no emoji.
- **Versioning:** conventional commits drive **release-please** — never hand-edit the `package.json` version. Pre-1.0, so `feat!`/breaking = a minor bump.
- **Behaviors are prop/JSON-driven**, never CSS-manipulated or shadow-pierced.
- Known consumer-packaging issues + their fixes: [`docs/package-consumer-issues.md`](docs/package-consumer-issues.md).

## Map

pnpm + NX workspace. `packages/ui/` (the kit: `src/` — `primitives` · `ui` · `components` · `state` · `wire` · `elements` · `agent-tooling` — plus `frameworks/react/` wrappers, Storybook, `theme.css` / `theme.tokens.css`, the `kai` MCP) · `apps/docs/` (public Astro Starlight docs → ui.kitn.ai) · `examples/*` (at repo root, deferred) · `packages/ui/dist/` (built, gitignored).
