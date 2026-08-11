import { z } from 'zod';

export const Category = z.enum(['provider', 'gateway', 'framework', 'harness', 'mock']);
export const Language = z.enum(['ts', 'python']);
export const StreamFormat = z.enum(['openai-sse', 'ai-sdk', 'native']);
/**
 * The scaffold's target.
 *
 * Two of these are NOT web-component consumers, and the difference is load-bearing:
 *   - `angular` consumes `kai-*` like vue/svelte/html, but needs
 *     `CUSTOM_ELEMENTS_SCHEMA` and binds arrays/objects with `[prop]="…"`.
 *   - `solid` consumes the SolidJS components DIRECTLY from the `@kitn.ai/ui`
 *     root entry. The kit is authored in Solid, so routing a Solid consumer
 *     through the custom-element facade would ship the Solid runtime twice and
 *     cross a reactive-context boundary for nothing.
 */
export const Framework = z.enum(['html', 'react', 'next', 'vue', 'svelte', 'angular', 'solid', 'fastapi', 'express', 'worker', 'tanstack-start']);
export const Placement = z.enum(['side', 'full-page', 'docked-widget', 'inline']);

export const IntegrationSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: Category,
  language: Language,
  streamFormat: StreamFormat,
  envVars: z.array(z.string()).default([]),
  routeTemplates: z.record(z.string(), z.string()), // keyed by Framework value → code string
  /**
   * The backend as ONE web-standard handler, `(Request) => Response`, written as
   * a complete `async function chatHandler(request: Request)` declaration.
   *
   * WHY THIS EXISTS. `routeTemplates` is keyed by framework, and in practice
   * every TS integration only ever filled in `next`. Everything else fell
   * through to it, so a svelte scaffold emitted a Next.js `export async function
   * POST(req)` — which TYPECHECKS under SvelteKit and then throws
   * `req.json is not a function` on the first submit, because SvelteKit calls
   * `POST(event)`. vue and html got the same snippet with nowhere to put it.
   *
   * The handler BODY is portable; only the few lines that declare the route
   * differ per framework. So integrations write the body once here and the
   * scaffolder wraps it (see `WEB_ROUTE_ADAPTERS` in mcp/tools/scaffold.ts).
   * `routeTemplates` stays for routes that genuinely cannot be expressed this
   * way: a Worker using an `env` binding, an Express `(req, res)` bridge, a
   * FastAPI service.
   *
   * An exact `routeTemplates[framework]` still wins over this.
   */
  webRoute: z.string().optional(),
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
