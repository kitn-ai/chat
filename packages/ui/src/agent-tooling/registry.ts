import type { Integration, Archetype } from './types';
import openai from './integrations/openai';
import anthropic from './integrations/anthropic';
import openrouter from './integrations/openrouter';
import vercelAiSdk from './integrations/vercel-ai-sdk';
import langgraph from './integrations/langgraph';
import cloudflare from './integrations/cloudflare';
import ollama from './integrations/ollama';
import mastra from './integrations/mastra';
import pi from './integrations/pi';
import pydanticAi from './integrations/pydantic-ai';
import mock from './integrations/mock';
import { archetypes as _archetypes } from './archetypes';

// The surface axis for the scaffolder's gate, derived from the presets above.
// Re-exported here because `scripts/verify-scaffold-compiles.mjs` bundles this
// module for its axes and must not reach past the registry for one of them.
export {
  BASE_COMPONENT,
  listCapabilityGroups,
  listSurfaceProbes,
  type CapabilityGroup,
  type SurfaceProbe,
} from './archetypes';

// Order is the order a scaffolding agent reads them in. `openai` and `anthropic`
// lead because they are the two keys a developer is most likely to already hold.
export const integrations: Integration[] = [
  openai,
  anthropic,
  openrouter,
  vercelAiSdk,
  langgraph,
  cloudflare,
  ollama,
  mastra,
  pi,
  pydanticAi,
  mock,
];

export const archetypes: Archetype[] = _archetypes;

export function getIntegration(id: string): Integration | undefined {
  return integrations.find((i) => i.id === id);
}

export function getArchetype(id: string): Archetype | undefined {
  return archetypes.find((a) => a.id === id);
}

export function listIntegrations(): Integration[] {
  return integrations;
}

/** One heading in `create-kai`'s gateway prompt. */
export interface GatewayGroup {
  id: 'no-backend' | 'bring-a-key' | 'bring-a-server';
  title: string;
  integrations: Integration[];
}

/**
 * The gateway prompt's three groups, DERIVED — the thing the spec described and
 * the catalog could not answer.
 *
 * It is here, and not in the CLI, for the reason `deps` is not in the spec's
 * prose: a grouping maintained next to the menu that renders it is a second copy
 * of the catalog, and it goes stale the first time an integration lands. Adding
 * one now moves these groups by itself, because the only inputs are declared
 * fields.
 *
 * THE ORDER OF THE TESTS IS THE DESIGN, not an implementation detail:
 *
 *   1. No route at all -> **No backend**. Exactly `mock` today, and derived from
 *      the absence rather than from `id === 'mock'` or `category === 'mock'`: a
 *      second no-backend entry (a canned transcript player, say) should land in
 *      this group without editing this function.
 *   2. `outOfBand !== 'none'` -> **Bring a server or runtime**, and this is
 *      checked BEFORE the key test on purpose. `pydantic-ai` needs both a python
 *      runtime and OPENAI_API_KEY; the groups are not disjoint in reality, so
 *      something has to win, and the prerequisite does — a key is useless until
 *      the service it authenticates is running. The prompt still asks for the
 *      key afterwards; only the HEADING is decided here.
 *   3. Everything else -> **Bring a key**.
 *
 * WHERE THIS DIVERGES FROM THE SPEC, ON PURPOSE. The spec's third group reads
 * "Ollama, LangGraph, Mastra, Pydantic AI, Pi". `langgraph` comes out of this
 * function in **Bring a key** instead, because its emitted route compiles the
 * graph in process and asks for nothing but `OPENAI_API_KEY` — see the comment on
 * its `outOfBand`. The spec sentence was written before the field existed and is
 * wrong about that one entry; this is the derivation, so this is the answer.
 */
export function listGatewayGroups(): GatewayGroup[] {
  const hasRoute = (i: Integration) =>
    i.webRoute !== undefined || Object.keys(i.routeTemplates).length > 0;

  const groups: GatewayGroup[] = [
    { id: 'no-backend', title: 'No backend', integrations: [] },
    { id: 'bring-a-key', title: 'Bring a key', integrations: [] },
    { id: 'bring-a-server', title: 'Bring a server or runtime', integrations: [] },
  ];
  const into = (id: GatewayGroup['id']) => groups.find((g) => g.id === id)!;

  for (const integration of integrations) {
    if (!hasRoute(integration)) into('no-backend').integrations.push(integration);
    else if (integration.outOfBand !== 'none') into('bring-a-server').integrations.push(integration);
    else into('bring-a-key').integrations.push(integration);
  }
  return groups;
}

export function listArchetypes(): Archetype[] {
  return archetypes;
}
