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

/**
 * Whether this integration's SECRET may sit in the browser bundle.
 *
 * Read `'needs-proxy'` as "a server hop is mandatory" and `'frontend-safe'` as
 * "the browser may call the upstream itself". This is the flag `create-kai`
 * consults before it decides where a key goes, so getting it wrong in the
 * permissive direction writes an API key into client code. There is deliberately
 * no default and no boolean: the refinement below REJECTS an integration that
 * declares neither, because "absent" must never read as "safe".
 *
 * `'needs-proxy'` covers two cases, and the second is easy to miss:
 *   1. a secret. The route holds a key, so a static bundle cannot.
 *   2. a server-only CAPABILITY. `pi` spawns a local process; no key is involved
 *      and a browser still cannot do it.
 *
 * `'frontend-safe'` is the narrow claim: nothing secret AND no server-only
 * capability. Two integrations qualify, and both were read off their routes —
 * `ollama` fetches `localhost:11434` with no auth header at all, and `mock`
 * ships no route to reach.
 *
 * Do not infer this from the provider's name. A provider with a CORS-friendly
 * public endpoint and one that requires a proxy look identical from outside; only
 * the route says which it is. That is the same lesson `forwardsFromClient` and
 * `clientToolFormat` were each added to record.
 */
export const KeyExposure = z.enum(['frontend-safe', 'needs-proxy']);

/**
 * The packages an app must install BEYOND `@kitn.ai/ui` to run this
 * integration's route.
 *
 * Derived once, here, from the route's own import statements, so the CLI never
 * has to re-parse route source to find them. Today this fact only exists as prose
 * in `runNote`, which no installer can read.
 *
 * The rule, enforced by `registry.test.ts`: `npm` is exactly the set of
 * bare-module specifiers imported by the TS route sources, normalised to package
 * names (`@langchain/core/tools` counts as `@langchain/core`), minus `node:`
 * builtins and minus `@kitn.ai/ui` itself, which every scaffold already depends
 * on. `pip` is a superset of the python route's imports, because a Python app
 * also needs its ASGI server (`uvicorn`), which nothing imports.
 *
 * Type-only packages (`@types/*`) are not listed: nothing imports them, so the
 * rule cannot see them, and the frameworks that need them already carry them.
 */
export const DepsSchema = z.object({
  npm: z.array(z.string()).default([]),
  pip: z.array(z.string()).default([]),
});

/**
 * An env var name that holds a secret rather than an address.
 *
 * Anchored at the END, which is the whole precision of it: `CF_API_TOKEN` and
 * `AI_GATEWAY_API_KEY` match, while `CF_ACCOUNT_ID` and `MASTRA_URL` do not.
 * `MASTRA_URL` is the case that stops this being a proxy for "declares any env
 * var at all" — a base URL is not a credential.
 *
 * This is a SAFETY NET over the declaration, never its source. Three integrations
 * (`langgraph`, `vercel-ai-sdk`, `pydantic-ai`) hold a key their route source
 * never names, because the SDK reads the env var itself; their `envVars` is what
 * catches them here, and nothing but the author reading the route would have.
 */
const SECRET_ENV_VAR = /(?:KEY|TOKEN|SECRET|PASSWORD)$/;

/**
 * A credential written into a request from route source. The second alternative
 * is Anthropic's spelling, which is not an `Authorization` header at all.
 */
const AUTH_HEADER = /Authorization\s*:|['"]x-api-key['"]\s*:/i;

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
  /** See {@link DepsSchema}. Empty is a real answer: a fetch-only route needs nothing. */
  deps: DepsSchema.default({ npm: [], pip: [] }),
  /**
   * See {@link KeyExposure}. Optional in the TYPE only so the refinement below
   * owns the error message — Zod skips refinements when the base object already
   * failed, so a plain required field would report "Invalid input" and this is
   * the one field where the reader needs to be told what is at stake.
   */
  keyExposure: KeyExposure.optional(),
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

  // ---- keyExposure ----
  //
  // Two checks, and the split matters. The first refuses SILENCE. The second
  // refuses a specific LIE, and only ever in the dangerous direction: it can
  // turn a 'frontend-safe' claim into an error, never the reverse. Declaring
  // 'needs-proxy' where a proxy was not strictly required costs a server hop;
  // declaring 'frontend-safe' where it was required costs the key.

  if (integration.keyExposure === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['keyExposure'],
      message:
        `integration '${integration.id}' declares no keyExposure. State whether its SECRET may reach the ` +
        `browser bundle: 'needs-proxy' (a key, or a server-only capability such as spawning a process, so ` +
        `the CLI must keep it behind a server) or 'frontend-safe' (nothing secret and nothing server-only, ` +
        `so the browser may call the upstream directly). Read the route to decide, not the provider's name: ` +
        `a public CORS-friendly endpoint and one that requires a proxy are indistinguishable from outside. ` +
        `There is no default on purpose — a missing flag read as "safe" is how an API key ships in client code.`,
    });
  }

  if (integration.keyExposure === 'frontend-safe') {
    const secrets = integration.envVars.filter((name) => SECRET_ENV_VAR.test(name));
    if (secrets.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['keyExposure'],
        message:
          `integration '${integration.id}' claims keyExposure 'frontend-safe' but declares the secret env ` +
          `var(s) ${secrets.join(', ')}. A frontend bundle is public, so that combination puts a key in ` +
          `client code. Use 'needs-proxy'.`,
      });
    }

    const routeSources = [
      ...Object.values(integration.routeTemplates),
      ...(integration.webRoute ? [integration.webRoute] : []),
    ];
    if (routeSources.some((code) => AUTH_HEADER.test(code))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['keyExposure'],
        message:
          `integration '${integration.id}' claims keyExposure 'frontend-safe' but its route sends an ` +
          `authorization header, so it holds a credential a browser bundle must not. Use 'needs-proxy'.`,
      });
    }
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
