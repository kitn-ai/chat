import { z } from 'zod';

export const Category = z.enum(['provider', 'gateway', 'framework', 'harness', 'mock']);
export const Language = z.enum(['ts', 'python']);
export const StreamFormat = z.enum(['openai-sse', 'ai-sdk', 'native']);
export const Framework = z.enum(['html', 'react', 'next', 'vue', 'svelte', 'fastapi', 'express', 'worker', 'tanstack-start']);
export const Placement = z.enum(['side', 'full-page', 'docked-widget', 'inline']);

export const IntegrationSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: Category,
  language: Language,
  streamFormat: StreamFormat,
  envVars: z.array(z.string()).default([]),
  routeTemplates: z.record(z.string(), z.string()), // keyed by Framework value → code string
  streamMapping: z.string(),                        // prose: how the stream maps to messages
  runNote: z.string(),
  docsSlug: z.string(),
  /**
   * The request-body fields this integration's ROUTE reads off the client and
   * forwards upstream. Anything not listed is owned by the route or by the agent
   * behind it.
   *
   * The scaffolder emits an editable const for a field only when it appears
   * here, and that is the whole point: `model` used to be emitted whenever a
   * route template contained the substring 'model', which is true of any
   * template that so much as writes `model: 'llama3.2'`, so four integrations
   * shipped an editable const their route threw away. The mirror-image bug is a
   * `tools` array that never gets sent, which leaves kai-tool a panel no code
   * path can populate.
   *
   * Empty by default, so a new integration emits nothing until its route really
   * does forward the field.
   */
  forwardsFromClient: z.array(z.enum(['model', 'tools'])).default([]),
});
export type Integration = z.infer<typeof IntegrationSchema>;

export const ArchetypeSchema = z.object({
  id: z.string(),
  title: z.string(),
  components: z.array(z.string()),     // kai-* tags, e.g. ['kai-chat', 'kai-sources']
  defaultPlacement: Placement,
  docsSlug: z.string(),
});
export type Archetype = z.infer<typeof ArchetypeSchema>;
