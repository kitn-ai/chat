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
 * v1's first slice is the zero-config path, so that is `mock` alone. Everything
 * else in the catalog is still OFFERED in `--list` output but is not presented
 * as a choice, because a prompt that accepts a gateway and then does not wire it
 * is worse than one that says it is not ready: the user finds out at
 * `npm run dev`, with a project that looks complete.
 *
 * Widening this set is the whole of "add a gateway" — the wiring reads
 * `envVars` / `deps` / `keyExposure` / `webRoute` off the integration itself.
 */
export const WIRED_GATEWAYS: ReadonlySet<string> = new Set(['mock']);

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
 * NOT GROUPED, and that is a deliberate omission rather than an oversight. The
 * spec asks for three groups, with the third being "exactly the set that needs
 * an out-of-band process" (Ollama, LangGraph, Mastra, Pydantic AI, Pi). No field
 * on `Integration` declares that, and every derivation that reproduces the
 * spec's five-and-five split today does so by accident:
 *   · `category` cuts across it — `provider` holds both OpenAI (key) and Ollama
 *     (a local server), `framework` holds both Vercel AI SDK (key) and LangGraph.
 *   · `deps.npm` non-empty catches LangGraph and Mastra but also catches
 *     Vercel AI SDK, which needs the `ai` package and no separate process.
 *   · `envVars` non-empty puts LangGraph and Pydantic AI (both `OPENAI_API_KEY`)
 *     in the key group and Ollama in neither.
 * Only `runNote` says it, in prose no code should parse. So the grouping waits
 * on a declared field — see the report accompanying this slice — and the prompt
 * shows each gateway's own `runNote` instead of a group it inferred.
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
