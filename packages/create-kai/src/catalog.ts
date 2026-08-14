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
 * `runNote`, `docsSlug`) AND the real `renderSurface`, which a generated
 * `catalog.json` could not carry — a function does not survive JSON.
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
import type { Integration } from '../../ui/src/agent-tooling/types';

export { BASE_COMPONENT, getIntegration, listIntegrations };
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
 *   · its `webRoute` calls none of the kit's content helpers (`wireParts` /
 *     `wireText`), which `anthropic`, `mastra` and `vercel-ai-sdk` all do. Those
 *     three need a SECOND injected preamble that this CLI does not carry — see
 *     `routeSymbolsProblem`, which fails the build rather than letting one
 *     through.
 *
 * WIDENING IS NOT ONE AXIS. A gateway is wirable only in a (gateway, framework)
 * CELL: the integration has to have a route, and the framework has to declare
 * somewhere to put it. `wirableGateway` below is that check, and it is why
 * flipping an id into this set is necessary but not sufficient.
 */
export const WIRED_GATEWAYS: ReadonlySet<string> = new Set(['mock', 'openrouter']);

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
 * This function stays flat because `WIRED_GATEWAYS` is `{ mock }` in this slice:
 * grouping a list where ten of eleven entries are not selectable would add
 * headings to a menu with one live item. Switching to `listGatewayGroups()` is
 * the natural companion to widening `WIRED_GATEWAYS`, not a separate task.
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
