/**
 * What a second emitter needs in order to write a chat route to a real file.
 *
 * Three facts live here, and they are the three a consumer that writes handlers
 * to disk cannot do without: `chatRoutePreamble` (what goes above a bare
 * `Integration.webRoute` so it compiles), and `CLIENT_MODEL_IDS` +
 * `defaultModelFor` (whether the front end sends a model, and which id is valid
 * for the host its route POSTs to). The `kai` MCP's own emitter in
 * `mcp/tools/scaffold.ts` imports them from here, so there is one code path and
 * the two emitters cannot disagree.
 *
 * WHY THIS IS ITS OWN MODULE, AND WHY IT MUST STAY A LEAF. These three were
 * exported from `mcp/tools/scaffold.ts`, which is ~5,300 lines and builds a zod
 * schema at MODULE SCOPE (`scaffold.inputSchema = z.object({…})`). A side effect
 * at module scope is not tree-shakeable, so a bundler asked for
 * `chatRoutePreamble` alone had to keep the whole file and all of zod with it.
 * Measured on `create-kai`, whose CLI is one bundled zero-dependency file:
 * **203 kB -> 904 kB**, of which 505 kB was zod the CLI never executes, on every
 * `npx create-kai`. It also pulled 5,300 lines of kit source into `create-kai`'s
 * `tsc` program under `--noUnusedLocals`, a flag the kit's own typecheck does not
 * run, which forced an unrelated deletion in the kit to keep the CLI green.
 *
 * So the rule for this file is a rule about its IMPORTS, not its size: nothing
 * here may import a module that reaches zod, the registry, or the integration
 * catalog. `import type` is fine — it erases. Today that means exactly one
 * import, and it is type-only. `create-kai`'s build guard
 * (`bundleGraphProblem` in its `src/build-guards.ts`) fails the CLI build if zod
 * ever reappears in the bundle, which is the check that turns this paragraph
 * into something that can go red.
 *
 * NOT RE-EXPORTED from `mcp/tools/scaffold.ts`, deliberately. A second import
 * path for the same symbol is how the fat one gets picked again.
 */
import type { Integration } from './types';

// ── SCAF-8: per-integration default model ids ─────────────────────────────────

/**
 * Default model id per integration whose route forwards one.
 *
 * THE ID IS HOST-SPECIFIC, and there is no such thing as a safe generic one.
 * This used to fall through to `'openai/gpt-4o-mini'` for anything unlisted, on
 * the reasoning that "a route that forwards the client's model is by definition
 * pointed at an OpenAI-compatible endpoint". That was false twice over the
 * moment a first-party provider landed: `openai/gpt-4o-mini` is an OPENROUTER
 * slug — api.openai.com 404s the prefixed form, and api.anthropic.com rejects it
 * outright — so a scaffold generated for the provider it names could not run
 * against it.
 *
 * tsc cannot see any of this; every one of those strings compiles. The guard is
 * `scaffold.test.ts` → "the emitted model id is valid for the host its route
 * POSTs to", which reads the id out of the EMITTED scaffold and the host out of
 * the route source, so a new integration cannot reintroduce a wrong one.
 *
 * EXPORTED because a route is only half of the fact. `openrouter`'s handler puts
 * the client's `model` straight into its upstream payload, so a front end that
 * posts `{ messages }` alone sends no model, OpenRouter answers 400, and nothing
 * in a build or a typecheck can see it. Any second emitter of these routes needs
 * the same table; `defaultModelFor` below is the accessor, and the raw table is
 * exported alongside it so a consumer can also check it for drift at ITS build
 * time rather than discovering a missing row when a user types.
 */
export const CLIENT_MODEL_IDS: Record<string, string> = {
  // Vendor-prefixed `vendor/model`: OpenRouter's own id space, and the ONLY one
  // of the three where the prefix belongs.
  openrouter: 'openai/gpt-4o-mini',
  // No vendor prefix. This is what the route already pinned, so moving the knob
  // to the client changes the wire not at all.
  openai: 'gpt-4o-mini',
  // Anthropic's id space. Matches what the route pinned; 'claude-sonnet-5' and
  // 'claude-haiku-4-5' are the cheaper swaps (see this integration's runNote).
  anthropic: 'claude-opus-5',
};

/**
 * The default model id for an integration whose ROUTE reads the client's `model`
 * field, and undefined for every other one.
 *
 * This used to be a substring test (`routeSrc.includes('model')`), which is true
 * of any template that so much as writes `model: 'llama3.2'`. That emitted an
 * editable `const model` into ollama, langgraph, vercel-ai-sdk and cloudflare
 * scaffolds whose routes pin their own model and never read the field, so
 * changing it did nothing, and cloudflare's default was not even a valid Workers
 * AI id. `forwardsFromClient` states the fact instead of guessing at it.
 *
 * Exported for the same reason as `CLIENT_MODEL_IDS`: a second emitter of these
 * routes has to answer "does this front end send a model, and which" the same
 * way, and both halves of that answer live here.
 */
export function defaultModelFor(integration: Integration): string | undefined {
  if (!integration.forwardsFromClient.includes('model')) return undefined;
  const id = CLIENT_MODEL_IDS[integration.id];
  // No fallback, deliberately — the old `?? 'openai/gpt-4o-mini'` is what let a
  // first-party provider inherit an OpenRouter slug and emit a scaffold that
  // 404s on its own host. A model id is a per-host fact; an integration that
  // forwards one has to say which.
  if (id === undefined) {
    throw new Error(
      `Integration '${integration.id}' forwards the client's 'model' but has no CLIENT_MODEL_IDS entry, so the ` +
        `scaffold would emit a model id that is not valid for the host its route POSTs to. Add one in ` +
        `agent-tooling/route-emit.ts.`,
    );
  }
  return id;
}

/**
 * The request body, declared once per route file.
 *
 * `await request.json()` is `unknown` — it is whatever the client sent — so
 * destructuring it directly is TS2339 on EVERY field. That is not pedantry: it
 * is a hard `npm run build` failure the moment a Node-typed project compiles the
 * route, where `Request` comes from undici (`json(): Promise<unknown>`) rather
 * than from the DOM lib (`json(): Promise<any>`). A stock Vite app does exactly
 * that — `tsc -b` walks vite.config.ts → vite-chat-api.ts → src/server/chat.ts
 * with `lib` and no DOM — so the route ran fine and the build did not.
 *
 * `messages` is typed as the kit's OWN encoder output rather than restated
 * structurally, which keeps the two halves of the scaffold pinned to one type:
 * the front end sends `toOpenAIMessages(thread)`, and this is what that returns.
 * The import is type-only and erases at build time, so the route ships no
 * runtime dependency on the kit.
 */
const CHAT_REQUEST_BODY_IMPORT = `import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';`;
const CHAT_REQUEST_BODY_DECL = [
  `/**`,
  ` * What the front end POSTs. \`request.json()\` is \`unknown\` (it is whatever the`,
  ` * client sent), so the body is narrowed once here instead of at every use —`,
  ` * without it this route does not compile under a server tsconfig. Widen it as`,
  ` * you add fields of your own.`,
  ` */`,
  `type ChatRequestBody = {`,
  `  messages: OpenAIWireMessage[];`,
  `  model?: string;`,
  `  tools?: unknown[];`,
  `};`,
  ``,
  `/** Narrow the JSON body once, at the edge. */`,
  `async function readChatRequest(request: Request): Promise<ChatRequestBody> {`,
  `  return (await request.json()) as ChatRequestBody;`,
  `}`,
];

/**
 * Attachments, on the way IN.
 *
 * A user turn's `content` is a plain string until it carries a file, at which
 * point `toOpenAIMessages` emits the ARRAY form. Every route that re-maps
 * messages into some other SDK's shape has to handle both, and the three that do
 * (anthropic, mastra, vercel-ai-sdk) were each written when only the string form
 * existed — so each one would have quietly dropped the attachment while still
 * compiling, which is the same defect the encoder was just fixed for.
 *
 * These two helpers are the shared half of that: flattening the wire shape is
 * identical everywhere, while the target shape is not, so each route maps
 * `WirePart[]` into its own SDK itself rather than inheriting a lowest common
 * denominator.
 *
 * Only injected into routes that actually call them — the eight pass-through
 * integrations forward `messages` untouched and need none of this, and an unused
 * declaration is a hard error under the gate's `--noUnusedLocals`.
 */
const CONTENT_PARTS_DECL = [
  `/** Where an attachment's bytes are: inline base64, or an address the PROVIDER`,
  ` *  fetches. Never both. */`,
  `type WireFileSource = { type: 'data'; data: string } | { type: 'url'; url: string };`,
  ``,
  `/** One piece of a turn, with the string and array content forms flattened into`,
  ` *  a single shape. */`,
  `type WirePart =`,
  `  | { kind: 'text'; text: string }`,
  `  | { kind: 'file'; mediaType: string; filename?: string; source: WireFileSource };`,
  ``,
  `const DATA_URI = /^data:([^;,]+);base64,([\\s\\S]*)$/;`,
  ``,
  `/**`,
  ` * Flatten a wire message's content into parts.`,
  ` *`,
  ` * An image sent by URL has no media type here — \`image_url\` carries only the`,
  ` * address — so it reports the top-level segment \`'image'\`, which is all a URL`,
  ` * source needs. Only images can reach that branch: the kit refuses to encode a`,
  ` * remote PDF rather than guess at one.`,
  ` */`,
  `function wireParts(content: OpenAIWireMessage['content']): WirePart[] {`,
  `  if (content == null) return [];`,
  `  if (typeof content === 'string') return content === '' ? [] : [{ kind: 'text', text: content }];`,
  `  return content.map((part): WirePart => {`,
  `    if (part.type === 'text') return { kind: 'text', text: part.text };`,
  `    if (part.type === 'image_url') {`,
  `      const asData = DATA_URI.exec(part.image_url.url);`,
  `      return asData`,
  `        ? { kind: 'file', mediaType: asData[1], source: { type: 'data', data: asData[2] } }`,
  `        : { kind: 'file', mediaType: 'image', source: { type: 'url', url: part.image_url.url } };`,
  `    }`,
  `    const asData = DATA_URI.exec(part.file.file_data);`,
  `    if (!asData) {`,
  `      // LOUD on purpose. \`file_data\` is a data URI on this wire; anything else`,
  `      // cannot be turned into bytes without fetching it, and forwarding a turn`,
  `      // with the attachment quietly missing is the bug this whole path exists`,
  `      // to prevent.`,
  `      throw new Error(`,
  `        'Unsupported file content part: file_data must be a data: URI of the form data:<media type>;base64,<data>.',`,
  `      );`,
  `    }`,
  `    return {`,
  `      kind: 'file',`,
  `      mediaType: asData[1],`,
  `      filename: part.file.filename,`,
  `      source: { type: 'data', data: asData[2] },`,
  `    };`,
  `  });`,
  `}`,
  ``,
  `/** Just the text of a turn. System, assistant and tool messages are text-only`,
  ` *  on this wire, so this collapses the array form for them. */`,
  `function wireText(content: OpenAIWireMessage['content']): string {`,
  `  return wireParts(content)`,
  `    .map((p) => (p.kind === 'text' ? p.text : ''))`,
  `    .join('');`,
  `}`,
];

/**
 * What a bare `Integration.webRoute` needs above it before it will compile.
 *
 * WHY THIS IS A FUNCTION AND NOT TWO EXPORTED CONSTANTS. `webRoute` reads like a
 * self-contained handler and is not one: every fragment in the catalog calls
 * `readChatRequest`, and three of them (anthropic, mastra, vercel-ai-sdk) also
 * call `wireParts` / `wireText` and annotate with `WirePart`. Measured over the
 * catalog, a bare fragment under `tsc --strict` is TS2304 on five distinct names.
 * A consumer handed `CHAT_REQUEST_BODY_DECL` alone would therefore emit five
 * routes that compile and three that do not, and would find out only for the
 * ones it happened to wire first. Asking the question the caller actually has —
 * "what goes above THIS fragment" — is the shape that cannot be answered
 * half-right, so that is what is exported.
 *
 * `symbols` is DERIVED from `decl` rather than listed beside it, so a rename
 * inside either declaration block moves it and a consumer's drift guard grades
 * the real text.
 */
export interface ChatRoutePreamble {
  /** import lines the declarations need, emitted at the top of the route file */
  readonly imports: readonly string[];
  /** the declaration lines, emitted immediately above the handler */
  readonly decl: readonly string[];
  /** every symbol `decl` declares, read back out of `decl` */
  readonly symbols: readonly string[];
}

/** A top-level declaration in a preamble block. Indented lines are bodies. */
const PREAMBLE_DECLARATION = /^(?:export\s+)?(?:async\s+)?(?:function|type|interface|const|class)\s+([A-Za-z_$][\w$]*)/;

/**
 * The preamble a given handler fragment needs.
 *
 * Used by the MCP below to build its own route blocks, and exported for
 * `create-kai`, which writes the same handler to a real file that has to
 * compile. One code path, so the two cannot disagree about what a route needs.
 */
export function chatRoutePreamble(fragment: string): ChatRoutePreamble {
  // The content helpers ride along only where the route calls them; see
  // CONTENT_PARTS_DECL for why an unconditional injection would not compile.
  //
  // KNOWN GAP, live but not yet reachable: this tests for a CALL, so a fragment
  // that only annotates with `WirePart` / `WireFileSource` and never calls
  // either helper would be told it needs nothing and would not compile. No
  // catalog route is shaped that way today — vercel-ai-sdk is the only one that
  // names the type, and it calls `wireParts` two lines later — so widening the
  // test would change no emitted byte, and that is exactly why it is left alone
  // here rather than fixed blind. `scaffold.test.ts` → "webRoute has no symbol
  // its own preamble fails to declare" is the check that turns this from a
  // comment into a failing build the day an integration lands in that shape.
  const decl = /\bwire(?:Parts|Text)\s*\(/.test(fragment)
    ? [...CHAT_REQUEST_BODY_DECL, ``, ...CONTENT_PARTS_DECL]
    : [...CHAT_REQUEST_BODY_DECL];
  return {
    imports: [CHAT_REQUEST_BODY_IMPORT],
    decl,
    symbols: decl.flatMap((line) => PREAMBLE_DECLARATION.exec(line)?.[1] ?? []),
  };
}
