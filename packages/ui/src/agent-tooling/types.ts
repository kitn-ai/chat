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
  /**
   * The tool-definition envelope this integration's ROUTE expects to find in the
   * `tools` array the client POSTs. Required exactly when `forwardsFromClient`
   * includes `'tools'`, and meaningless otherwise.
   *
   * WHY THIS IS DECLARED AND NOT DERIVED. It used to be looked up from
   * `streamFormat`, and that is a category error: `streamFormat` describes the
   * shape of the RESPONSE stream, while the tool envelope is a REQUEST concern.
   * The two only appeared to agree because every integration that forwarded
   * tools happened to be `openai-sse`. `anthropic` is where the conflation
   * becomes visible — it is `streamFormat: 'native'`, which says nothing about
   * request shape, and the old table mapped `native` to null.
   *
   * And keying on the integration's PROVIDER would be wrong too, which is the
   * part worth reading the route before assuming: `anthropic`'s handler converts
   * the array itself (`toAnthropicTools` reads `raw.function.name` /
   * `.function.parameters`), so it wants `'openai'` here. Handing it Anthropic's
   * own `{ name, input_schema }` shape would yield tools with a blank name. Only
   * the route knows what it accepts, so only the integration can state it — the
   * same reason `forwardsFromClient` lives here rather than being sniffed out of
   * the route source.
   *
   * Optional in the type, mandatory in practice: the refinement below rejects an
   * integration that forwards tools without one. There is deliberately no
   * default — a default is how a tools array with no card in it ships silently.
   */
  clientToolFormat: z.enum(['openai', 'anthropic', 'jsonschema']).optional(),
}).superRefine((integration, ctx) => {
  // Enforced against the real catalog by `registry.test.ts`, which parses every
  // integration through this schema. A new host that forwards tools therefore
  // cannot reach the scaffolder undeclared: it fails at the catalog boundary,
  // before any emit path has to decide what to do about it.
  if (integration.forwardsFromClient.includes('tools') && integration.clientToolFormat === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['clientToolFormat'],
      message:
        `integration '${integration.id}' forwards a 'tools' array but declares no clientToolFormat. ` +
        `State the envelope its route expects: 'openai' ({ type: 'function', function: { parameters } }), ` +
        `'anthropic' ({ name, input_schema }), or 'jsonschema' ({ name, description, schema }). ` +
        `Read the route's own handler to decide — a route that CONVERTS the array server-side wants the ` +
        `shape it converts FROM, not its own provider's.`,
    });
  }
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
