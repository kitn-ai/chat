import { describe, it, expect } from 'vitest';
import { integrations, archetypes, getIntegration, getArchetype, listIntegrations, listArchetypes } from './registry';
import { IntegrationSchema, ArchetypeSchema } from './types';

// --- Integrations ---

it('has the launch integrations', () => {
  const ids = integrations.map((i) => i.id);
  for (const id of ['openrouter', 'vercel-ai-sdk', 'langgraph', 'cloudflare', 'ollama', 'mastra', 'pi', 'pydantic-ai', 'mock'])
    expect(ids).toContain(id);
});

it('has exactly 9 integrations (8 real + mock)', () => {
  expect(integrations).toHaveLength(9);
});

it('includes the zero-config mock integration', () => {
  const m = getIntegration('mock');
  expect(m).toBeDefined();
  expect(m?.category).toBe('mock');
  expect(m?.envVars).toEqual([]);
  // mock ships no backend route — the front-end streams locally
  expect(Object.keys(m!.routeTemplates).length).toBe(0);
});

it('every integration validates against IntegrationSchema', () => {
  for (const i of integrations) {
    expect(IntegrationSchema.safeParse(i).success).toBe(true);
  }
});

it('every real (non-mock) integration ships a route some framework can host', () => {
  for (const i of integrations.filter((i) => i.id !== 'mock')) {
    const routes = Object.keys(i.routeTemplates).length + (i.webRoute ? 1 : 0);
    expect(routes, `${i.id}: no route template and no webRoute`).toBeGreaterThan(0);
  }
});

/**
 * The portable handler is what stops a framework being handed another
 * framework's route. It has to BE portable: a `chatHandler(request)` the
 * scaffolder can wrap, with no framework's own export in it.
 */
it('every webRoute declares a chatHandler and nothing framework-specific', () => {
  for (const i of integrations.filter((i) => i.webRoute)) {
    expect(i.webRoute, `${i.id}`).toMatch(/async function chatHandler\(request: Request\): Promise<Response>/);
    // `export async function POST` / `export default {` belong to a framework's
    // route declaration, which the scaffolder appends per framework.
    expect(i.webRoute, `${i.id}: exports a framework's route from the portable body`).not.toMatch(
      /export (async function (POST|GET)|default)/,
    );
  }
});

it('getIntegration looks up by id', () => {
  expect(getIntegration('ollama')?.language).toBe('ts');
});

it('getIntegration returns undefined for unknown id', () => {
  expect(getIntegration('not-a-real-id')).toBeUndefined();
});

it('listIntegrations returns all integrations', () => {
  expect(listIntegrations()).toEqual(integrations);
});

// --- streamMapping copy ---
//
// These strings are the only streaming instruction a scaffolding agent reads, so
// a stale one ships a hand-rolled reader into a consumer's app. Six of them used
// to promise a "kai-chat SSE reader" that did not exist under any name. It does
// now: readOpenAIStream from '@kitn.ai/ui/wire'.

it('no streamMapping claims a reader that does not exist', () => {
  for (const integration of integrations) {
    expect(
      integration.streamMapping,
      `${integration.id} still refers to a nameless built-in reader`,
    ).not.toMatch(/kai-chat's (SSE )?reader|Streaming-recipe reader|kai-chat SSE reader/i);
  }
});

it('every streamMapping names the adapter that parses the stream', () => {
  for (const integration of integrations) {
    expect(
      integration.streamMapping,
      `${integration.id} describes a stream but does not say what parses it`,
    ).toMatch(/readOpenAIStream/);
  }
});

// --- Archetypes ---

it('archetypes array is non-empty', () => {
  expect(archetypes.length).toBeGreaterThan(0);
});

it('every archetype validates against ArchetypeSchema', () => {
  for (const a of archetypes) {
    const result = ArchetypeSchema.safeParse(a);
    expect(result.success).toBe(true);
  }
});

it('getArchetype looks up by id', () => {
  expect(getArchetype('drop-in-chat')?.title).toBe('Drop-in chat');
});

it('getArchetype returns undefined for unknown id', () => {
  expect(getArchetype('not-a-real-archetype')).toBeUndefined();
});

it('listArchetypes returns all archetypes', () => {
  expect(listArchetypes()).toEqual(archetypes);
});
