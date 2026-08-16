/**
 * The reuse boundary. Everything the CLI knows about gateways and renderable
 * surfaces comes from `packages/ui/src/agent-tooling/`, imported by relative
 * path and bundled at build time.
 *
 * WHY A RELATIVE SOURCE IMPORT AND NOT A PACKAGE IMPORT. `@kitn.ai/ui`'s exports
 * map does not expose `agent-tooling`, and it should not: the catalog is
 * dev-time tooling, not runtime API, and `create-kai` is deliberately not a
 * runtime dependency of anything. Bundling the source at build time gives the
 * CLI the real `Integration` objects (with `deps`, `keyExposure`, `envVars`,
 * `runNote`, `docsSlug`) and the real `chatRoutePreamble`, which a generated
 * `catalog.json` could not carry — a function does not survive JSON.
 *
 * This paragraph used to end "AND the real `renderSurface`", and that was never
 * true: nothing here imports it, and `generate()` throws on the `generated`
 * surface path rather than emit one. It matters which because `renderSurface`
 * lives in `mcp/tools/scaffold.ts`, the module the note below is about — so
 * wiring that path is a move-it-to-a-leaf job, not an import.
 *
 * The rule this file exists to enforce: if the CLI needs a dependency list, an
 * env var name, a route template or a mock implementation, it reads it from
 * here. It never restates one. A second copy of any of those has a build
 * failure as its failure mode, which is the specific bug the spec's own deps
 * table shipped before it was deleted.
 */
import {
  BASE_COMPONENT,
  getIntegration,
  listCapabilityGroups,
  listIntegrations,
} from '../../ui/src/agent-tooling/registry';
/**
 * The route-emission half of the boundary, from the kit's scaffold module.
 *
 * `chatRoutePreamble(fragment)` is what makes a bare `Integration.webRoute`
 * compilable — every fragment in the catalog calls `readChatRequest`, and three
 * also call `wireParts` / `wireText`. It is a FUNCTION rather than a constant
 * because the content helpers are injected only where a route calls them: an
 * unused declaration is a hard `--noUnusedLocals` error, so a flat preamble
 * would emit some routes that compile and some that do not.
 *
 * This package carried a hand-copied version of one of those declarations, plus
 * two guards to notice when it drifted. Both are gone — the copy because there
 * is now one source, and one of the guards with it (see `build-guards.ts` for
 * which survived and what it still catches).
 *
 * THE MODULE THIS COMES FROM IS THE POINT, not a detail of where a symbol
 * happens to sit. These three were briefly exported from
 * `mcp/tools/scaffold.ts`, which builds a zod schema at module scope; a module-
 * scope side effect is not tree-shakeable, so esbuild had to keep all 5,300
 * lines of that file and all of zod with it. `dist/index.js` went 203 kB ->
 * 904 kB — 505 kB of it zod this CLI never executes — and every `npx create-kai`
 * user downloaded it. `route-emit.ts` is a leaf whose only import is type-only.
 * Do not reach into `mcp/tools/scaffold` from this package for any reason;
 * `bundleGraphProblem` in `build-guards.ts` fails the build if something does.
 */
import {
  CLIENT_MODEL_IDS,
  chatRoutePreamble,
  defaultModelFor,
} from '../../ui/src/agent-tooling/route-emit';
import type { Integration } from '../../ui/src/agent-tooling/types';

export { BASE_COMPONENT, getIntegration, listIntegrations };
export { CLIENT_MODEL_IDS, chatRoutePreamble, defaultModelFor };
export type { Integration };

/**
 * The gateways this CLI can wire end to end today.
 *
 * Everything else in the catalog is still OFFERED in `--list` output but is not
 * presented as a choice, because a prompt that accepts a gateway and then does
 * not wire it is worse than one that says it is not ready: the user finds out at
 * `npm run dev`, with a project that looks complete.
 *
 * `openrouter` IS THE SECOND ENTRY, and it was picked over the other five keyed
 * integrations for reasons that are properties of the catalog rather than
 * preferences:
 *
 *   · `deps.npm` is EMPTY. Its route is global `fetch` and imports no SDK, so
 *     nothing about it depends on a provider package resolving.
 *   · `streamFormat` is `openai-sse` and the handler forwards `upstream.body`
 *     unchanged, so the front end needs no re-mapping — `readOpenAIStream`
 *     already parses exactly what comes back.
 *   · its `webRoute` calls none of the kit's content helpers, so it was the one
 *     keyed route that needed only the always-injected half of the preamble —
 *     which mattered while that half was hand-copied here, and no longer does.
 *
 * `anthropic` IS THE THIRD, and it was blocked by exactly that: its route calls
 * `wireParts` / `wireText` to re-map attachments, and the declarations for those
 * were private to the kit. `chatRoutePreamble` now returns them for the routes
 * that call them, so the block is gone. Two facts made it cheap rather than
 * merely possible, and both are worth stating because neither is guessable from
 * the integration's fields:
 *
 *   · Its route RE-FRAMES to OpenAI SSE before returning (`reframeToOpenAISse`),
 *     so the emitted front end reads it with `readOpenAIStream` unchanged —
 *     despite `streamFormat: 'native'`. See `BROWSER_WIRE`.
 *   · It takes OpenAI-shaped messages in and maps them server-side, so the front
 *     end still sends `toOpenAIMessages(...)`. Nothing in the go-live patch
 *     changes.
 *
 * `vercel-ai-sdk` is NOT here despite also being unblocked by the preamble
 * export: its route returns an AI-SDK stream, which `readOpenAIStream` cannot
 * read, so it needs a reader axis in the go-live patch first. `BROWSER_WIRE`
 * refuses it rather than leaving that to be discovered.
 *
 * WIDENING IS NOT ONE AXIS. A gateway is wirable only in a (gateway, framework)
 * CELL: the integration has to have a route, and the framework has to declare
 * somewhere to put it. `wirableGateway` below is that check, and it is why
 * flipping an id into this set is necessary but not sufficient.
 */
export const WIRED_GATEWAYS: ReadonlySet<string> = new Set(['mock', 'openrouter', 'anthropic']);

/**
 * What each wired gateway's route hands the BROWSER.
 *
 * NOT `integration.streamFormat`, and the difference is the whole point of the
 * table. That field describes what the PROVIDER emits; this describes what comes
 * back out of the route, after any re-framing it does. `anthropic` is the case
 * that separates them — `streamFormat: 'native'`, but its route converts every
 * frame to OpenAI form on the way out, so the browser sees `openai-sse`.
 *
 * It is a declaration because it cannot be derived: nothing on `Integration`
 * records what the route RETURNS. Getting it wrong is silent — `readOpenAIStream`
 * yields nothing on a dialect it cannot parse — so `routeWireProblem` requires an
 * entry for every wired gateway rather than defaulting one.
 */
export const BROWSER_WIRE: Readonly<Record<string, string>> = {
  // Thin proxy: OpenRouter is OpenAI-compatible and the route pipes
  // `upstream.body` through untouched.
  openrouter: 'openai-sse',
  // `streamFormat: 'native'`, but the route re-frames content_block_delta ->
  // delta.content, thinking_delta -> delta.reasoning, tool_use -> delta.tool_calls
  // before returning. So the browser gets OpenAI SSE.
  anthropic: 'openai-sse',
};

/**
 * The stream dialect the emitted front end can actually read.
 *
 * `GATEWAY_PATCHES` writes `readOpenAIStream`, so this is a fact about the
 * go-live patch, not about any provider. Widening it means giving that patch a
 * reader axis — which is the work `vercel-ai-sdk` is waiting on.
 */
export const EMITTED_READER_FORMAT = 'openai-sse';

/**
 * Why this (gateway, framework) pair cannot be scaffolded, or `null` when it can.
 *
 * Returns a MESSAGE rather than a boolean for the reason the build guards do:
 * the two failures below are fixed in different files by different people, and
 * "not supported" would send both of them to the wrong one.
 */
export function wirableGateway(
  gatewayId: string,
  framework: { id: string; route: unknown | null },
): string | null {
  if (gatewayId === 'mock') return null;
  if (!WIRED_GATEWAYS.has(gatewayId)) {
    return (
      `gateway '${gatewayId}' is in the kit catalog but is not wired by this release yet. ` +
      `Available: ${[...WIRED_GATEWAYS].map((g) => (g === 'mock' ? 'none' : g)).join(', ')}`
    );
  }
  if (framework.route === null) {
    return (
      `'${framework.id}' has no route destination yet, so gateway '${gatewayId}' cannot be wired ` +
      "for it. A keyed gateway needs a server route, and where that goes differs per framework. " +
      'Run `--list --json` to see which frameworks declare one.'
    );
  }
  return null;
}

/** The `mock` integration — the zero-config default. Present in every build. */
export function mockIntegration(): Integration {
  const mock = getIntegration('mock');
  if (!mock) {
    // Unreachable through the registry, and a hard failure rather than a
    // fallback on purpose: a CLI that quietly scaffolded *something* when its
    // default gateway went missing is how a broken scaffold looks fine.
    throw new Error('create-kai: the `mock` integration is missing from the kit catalog');
  }
  return mock;
}

/**
 * The `kai-*` components `renderSurface` actually branches on, DERIVED from the
 * preset catalog rather than restated here.
 *
 * `listCapabilityGroups()` is the archetype catalog's own answer to "which
 * components are a capability", so this set moves when the renderers gain one
 * and cannot drift from them by being edited separately. That matters because
 * the failure it prevents is silent: `renderSurface` takes any components list,
 * and a component it has no branch for is not an error — it is simply not
 * rendered. A feature wired to such a component would emit a project that
 * compiles, runs, and does not have the feature.
 */
export function rendererComponents(): ReadonlySet<string> {
  const known = new Set<string>([BASE_COMPONENT]);
  for (const group of listCapabilityGroups()) {
    for (const component of group.components) known.add(component);
  }
  return known;
}

/** A gateway as the CLI presents it: the catalog entry plus whether it is wired. */
export interface GatewayChoice {
  integration: Integration;
  wired: boolean;
}

/**
 * Gateways in prompt order: "None" (the `mock` integration) first, then the
 * registry's own order, which already leads with the two keys a developer is
 * most likely to already hold.
 *
 * STILL NOT GROUPED HERE, but the reason has changed and the blocker is gone.
 *
 * This function used to carry a paragraph explaining that the spec's three-way
 * grouping could not be derived: no field on `Integration` declared "needs an
 * out-of-band process", and `category` / `deps` / `envVars` each cut across the
 * split. That is fixed upstream — `Integration.outOfBand` now declares it, with
 * a schema refinement that refuses an entry declaring nothing and refuses a
 * false `'none'`, and `listGatewayGroups()` in the kit registry returns the three
 * headings ready to render.
 *
 * ONE CORRECTION worth carrying forward: the spec's third group listed LangGraph,
 * and that was wrong. Its emitted route compiles the graph in process
 * (`createReactAgent` over a `new ChatOpenAI(...)`) and its `runNote` asks for a
 * key and nothing else, so `listGatewayGroups()` files it under "Bring a key".
 *
 * SO WHY IS IT STILL FLAT. This paragraph used to answer "because
 * `WIRED_GATEWAYS` is `{ mock }` in this slice", and called switching to
 * `listGatewayGroups()` the natural companion to widening that set. #225 widened
 * it and the switch did not follow, so read the reason below and not that
 * prediction: the premise expired, and what replaces it is weaker.
 *
 * The menu is never the whole catalog. `index.ts` offers only the gateways that
 * pass `wirableGateway` for the CHOSEN framework, so it shows the wired set
 * intersected with the frameworks that declare a route host — and where that
 * leaves `mock` alone the CLI answers without prompting at all. Every gateway
 * that does reach the menu today falls under two of the three headings:
 * "No backend" for `mock`, "Bring a key" for the rest, nothing wired needing a
 * server or a runtime. Two headings over a list that fits on one screen is not
 * worth the vertical space.
 *
 * That is a judgement about a short menu, not a blocker, and it expires the
 * first time a `bring-a-server` gateway is wired — reach for
 * `listGatewayGroups()` then rather than growing a third heading by hand.
 */
export function listGateways(): GatewayChoice[] {
  const all = listIntegrations();
  const mock = all.filter((i) => i.id === 'mock');
  const rest = all.filter((i) => i.id !== 'mock');
  return [...mock, ...rest].map((integration) => ({
    integration,
    wired: WIRED_GATEWAYS.has(integration.id),
  }));
}
