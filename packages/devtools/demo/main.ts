// The demo page: three scenarios that each produce a distinguishable panel row.
//
// Nothing here is a test double for the PANEL -- the panel attaches to the real
// hook and reads real events produced by the real wire adapter. The only thing
// faked is the transport, which is the one part the kit deliberately does not
// own.
import '@kitn.ai/ui/elements';
import { createMockResponder } from '@kitn.ai/ui/state';
import { readOpenAIStream } from '@kitn.ai/ui/wire';
import type { AssistantStreamSink } from '@kitn.ai/ui/wire';

// ORDERING, AND IT IS NOT INCIDENTAL. `@kitn.ai/ui/elements` is SSR-import-safe,
// which it achieves by gating registration behind a browser check and a DYNAMIC
// import of register-impl -- and register-impl is where the kit installs its
// hook. So the hook appears one microtask-chain LATER than the import statement
// above, and anything evaluated in the same tick finds no hook at all.
//
// On a real page this does not arise: the panel is a CDN script tag, usually in
// the footer, arriving long after kit init. Here both live in one module graph,
// so the demo waits for a kit element to be defined -- precisely the point at
// which register-impl has finished.
await customElements.whenDefined('kai-chat');

// The built panel entry, i.e. what a CDN would serve. Importing it registers
// <kai-devtools> and, when the hook says it is recording, self-mounts one.
//
// NO SHIM. The hook this attaches to is the one the kit installed, and the
// events it shows come from `@kitn.ai/ui/wire` -- a different bundle, with its
// own copy of the emitter module. They reach each other because that emitter's
// state lives on a realm-global rather than in module scope. This page is the
// end-to-end proof of that chain.
await import('../dist/kai-devtools.es.js');

const out = document.getElementById('out') as HTMLPreElement;
const log = (line: string) => {
  out.textContent = `${line}\n${out.textContent ?? ''}`;
};

/** A sink that discards everything. The demo is about the DIAGNOSTICS, not
 *  about rendering a thread, so the parts go nowhere. */
const sink = (): AssistantStreamSink => ({
  appendText: () => undefined,
  appendReasoning: () => undefined,
  upsertTool: () => undefined,
  addSource: () => undefined,
});

const mockResponse = createMockResponder();

/** SCENARIO 1 — a healthy stream. Frames arrive, chunks come out, a text part
 *  is produced, the turn closes with a finish reason. */
async function healthy(): Promise<void> {
  const turn = await readOpenAIStream(mockResponse('Tell me about the wire adapter.'), sink());
  log(`healthy    → chunks ${turn.chunks}, parts ${turn.parts.length}, finish ${turn.finishReason}`);
}

/** SCENARIO 2 — the wrong dialect. An Anthropic-shaped body fed to the OpenAI
 *  reader: the frames parse as JSON and carry nothing this reader reads, which
 *  is the failure that used to be completely silent. */
async function wrongDialect(): Promise<void> {
  const body = [
    'data: {"type":"message_start","message":{"id":"msg_1","model":"anthropic/claude-haiku-4.5","usage":{"input_tokens":9}}}',
    '',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    '',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello from the wrong dialect."}}',
    '',
    'data: {"type":"content_block_stop","index":0}',
    '',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
    '',
    'data: [DONE]',
    '',
    '',
  ].join('\n');
  const turn = await readOpenAIStream(new Response(body), sink());
  log(`dialect    → chunks ${turn.chunks}, parts ${turn.parts.length}, error ${turn.error?.code}`);
}

/** SCENARIO 3 — a non-ok response. `wire.failed` carries the status and the
 *  provider's error CODE; the body text never travels. */
async function failed(): Promise<void> {
  const body = JSON.stringify({
    error: { code: 'invalid_api_key', message: 'sk-live-REDACTED is not a valid key' },
  });
  try {
    await readOpenAIStream(
      new Response(body, { status: 401, statusText: 'Unauthorized' }),
      sink(),
    );
  } catch (e) {
    log(`401        → ${(e as Error).name}: HTTP ${(e as { status?: number }).status}`);
  }
}

const wire = (id: string, fn: () => Promise<void>) => {
  document.getElementById(id)!.addEventListener('click', () => {
    void fn().catch((e) => log(`unexpected → ${String(e)}`));
  });
};

wire('healthy', healthy);
wire('dialect', wrongDialect);
wire('failed', failed);

const hook = (window as unknown as { __KAI_DEVTOOLS_HOOK__?: { version: number; recording?: boolean } })
  .__KAI_DEVTOOLS_HOOK__;
log(hook ? `hook v${hook.version}, recording=${hook.recording}` : 'no hook found');
