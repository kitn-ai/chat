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

export function listArchetypes(): Archetype[] {
  return archetypes;
}
