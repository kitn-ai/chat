import type { Integration } from '../types';

/**
 * mock: the zero-config first-win.
 *
 * No provider, no API key, no `/api` route, no network. The scaffolder
 * special-cases `integration === 'mock'` and emits a front-end whose `onSubmit`
 * calls `createMockResponder()` from `@kitn.ai/ui/state` where a real
 * integration calls `fetch('/api/chat', …)`. That is the ONLY difference between
 * the two emitted handlers. Everything after that expression is already the real
 * path: `readOpenAIStream` parses the frames, `createAssistantStream` folds them
 * onto the message parts, and the try/catch/finally and abort handling are
 * byte-identical. The zero-config preview therefore exercises the kit's own SSE
 * reader rather than a hand-rolled fold that merely resembles it.
 *
 * WHY OPENAI-SHAPED FRAMES. The mock stands in for the consumer's ROUTE, not for
 * a provider. Every other integration in this catalog re-frames its provider to
 * the OpenAI chat-completions shape server-side before the browser sees it
 * (`anthropic`'s route converts the Messages dialect frame by frame, `pi`'s
 * bridge converts Pi's stdout JSON, `vercel-ai-sdk` wraps `result.textStream`),
 * which is why `readOpenAIStream` is the only reader the scaffolder emits.
 * Matching that shape is what keeps "swap the mock for a real backend" a
 * one-expression change instead of a rewrite of the submit handler.
 *
 * WHY YOU CAN ALWAYS TELL. Sharing a real provider's frame shape means shape
 * alone no longer marks the reply as fake, so the tells are explicit: the stream
 * opens with a `: kai-mock` SSE comment, every frame carries a `_kai_mock` field
 * naming the function that produced it, `model` reports as `kai-mock` (no
 * provider serves that, so an echoed mock frame is rejected upstream rather than
 * quietly believed), and usage is all zeros. `src/state/mock.ts` records why each
 * tell sits at a different altitude; do not remove one without reading it.
 *
 * This lets `scaffold(useCase, integration: 'mock', framework: 'react')` run with
 * zero config so a developer sees a live, streaming chat before wiring a model.
 * Swap `integration` for a real provider (openai, anthropic, openrouter, ollama,
 * …) when ready.
 *
 * THE ROUTE IS OPTIONAL, AND IT EXISTS ANYWAY (rung-2 finding G-04, recurring
 * since rung 1). Two clean-room builders in a row were told "replies come from a
 * local dev endpoint that streams a mocked response" and had to hand-invent the
 * server side, because this was the one integration whose block (2) held prose
 * where every other integration ships code. So `webRoute` below is the mock's
 * server half: the SAME `createMockResponder()` frames, written to the wire by a
 * portable `chatHandler(Request) => Response` that the scaffolder wraps with the
 * identical per-framework adapters a real integration gets (Vite dev middleware
 * for the SPA frameworks, POST exports for next/svelte/tanstack, the
 * Express/Worker/Angular hosts). Nothing about the emitted app REQUIRES it — the
 * front end streams locally and never fetches — which the emitted block states,
 * along with the one-expression swap that points onSubmit at it.
 *
 * `routeTemplates` stays empty: the handler is web-standard, so there is no
 * framework whose declaration it cannot be wrapped in. `category: 'mock'` keeps
 * it out of the real provider/gateway/framework/harness catalogs.
 */
const mock: Integration = {
  id: 'mock',
  title: 'Mock (local preview)',
  category: 'mock',
  language: 'ts',
  streamFormat: 'native',
  envVars: [],
  routeTemplates: {},
  webRoute: `import { createMockResponder } from '@kitn.ai/ui/state';

// The kit's own mock responder — no provider, no key, no upstream. MODULE
// scope, not per-request: the responder owns the cursor into its canned
// replies, so rebuilding it per turn would answer with the first one forever.
const mockResponse = createMockResponder();

async function chatHandler(request: Request): Promise<Response> {
  // The responder cycles its replies whatever you send, so the prompt is a
  // courtesy — but the body is still read exactly the way a real route reads
  // it, so swapping this handler for a provider's changes nothing upstream of
  // this file.
  let chatBody: ChatRequestBody;
  try {
    chatBody = await readChatRequest(request);
  } catch (error) {
    return toChatErrorResponse(error);
  }
  const { messages } = chatBody;
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = last && typeof last.content === 'string' ? last.content : '';

  // createMockResponder() yields COMPLETE OpenAI chat-completions SSE frames —
  // the same strings the front end's local preview streams — so this route only
  // writes them out verbatim. No framing is built here; the browser parses them
  // with readOpenAIStream from @kitn.ai/ui/wire, exactly as it would a real
  // route's response. Every frame is marked as a mock (a ': kai-mock' banner, a
  // _kai_mock field, model 'kai-mock', zero usage).
  const encoder = new TextEncoder();
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const frame of mockResponse(prompt)) {
        // The browser hangs up when the user asks a new question mid-answer;
        // stop producing frames rather than writing into a cancelled stream.
        if (!open) return;
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
    cancel() {
      open = false;
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform stops a proxy buffering the stream into one blob.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // A proxy in front of a preview build would otherwise buffer the whole
      // stream and the reply would land all at once instead of streaming.
      'X-Accel-Buffering': 'no',
    },
  });
}`,
  streamMapping:
    "No backend and no provider, but a real wire. createMockResponder() from @kitn.ai/ui/state yields canned SSE frames and the scaffold reads them with readOpenAIStream from @kitn.ai/ui/wire, on the same code path a real route's response takes: same reader, same part folding, same abort handling. The frames carry the OpenAI chat-completions shape because the mock stands in for your /api/chat ROUTE, not for a provider (every other integration here re-frames its provider to that shape server-side), so going live replaces ONE expression: mockResponse(value) becomes the awaited response from your own chat route, and nothing else in the handler changes. Nothing here can be mistaken for a real turn: the stream opens with a ': kai-mock' SSE comment, every frame carries a _kai_mock field naming createMockResponder, model reports as 'kai-mock' (no provider serves it), and usage is all zeros. Block (2) serves the same frames over HTTP as an OPTIONAL route, so the /api/chat seam can be stood up before any provider exists.",
  runNote:
    'No backend or API key needed: the reply is generated in the browser and parsed by the same reader a real route feeds. Run the front-end as-is; swap `integration` for a real provider (openai, anthropic, openrouter, ollama) when ready, and the emitted handler differs by one expression. Block (2) is the OPTIONAL server half: the same mock frames served over HTTP, for standing up the /api/chat seam before any provider exists.',
  docsSlug: 'integrations/mock',
  // Nothing: the front end makes no HTTP request at all, and the optional route
  // reads only `messages` — and only as a courtesy prompt the responder is free
  // to ignore. There is no model to pick and no tools array anything would run.
  forwardsFromClient: [],
  // Nothing to install: the route's one import is the kit itself, which every
  // scaffold already depends on (registry.test.ts pins deps.npm to the route's
  // imports minus @kitn.ai/ui).
  deps: { npm: [], pip: [] },
  // The other 'frontend-safe' entry. The route now exists (G-04) but changes
  // nothing here: it holds no credential, sends no auth header and reaches no
  // upstream, so there is still nothing a public bundle could give away. The
  // schema's own refinement re-checks that claim against the route source.
  keyExposure: 'frontend-safe',
  // Nothing to supply out of band: no upstream, no process, no runtime. The
  // route is optional — the emitted app streams locally without it — which is
  // what keeps mock in the "No backend" group of create-kai's gateway prompt
  // (listGatewayGroups derives that from frontend-safe + outOfBand 'none', not
  // from the absence of a route, precisely because this route is one nobody
  // NEEDS).
  outOfBand: 'none',
};

export default mock;
