// Browser-side transport. Talks ONLY to the local dev proxy: no provider SDK, no
// key, and no provider host anywhere in this file (or in any file the client
// bundle reaches). transport.test.ts asserts that by reading this source back.
//
// This used to parse SSE itself. It does not any more: the proxy forwards raw
// upstream SSE and `readOpenAIStream` from @kitn.ai/ui/wire parses it. Handing
// back the Response is the whole job.
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';
import type { ToolSpec } from './tools';

export type CardMode = 'tool' | 'structured';

export interface SpikeConfig {
  model: string;
  /** Filesystem-safe form of `model`, used as the fixture directory name. */
  modelSlug: string;
  reasoningEffort: string;
  maxTokens: number;
  /** Whether the SERVER has a key. The key itself never crosses this boundary. */
  hasKey: boolean;
  /** Whether harness-tagged live turns are being captured to fixtures. */
  recording: boolean;
}

export async function fetchSpikeConfig(): Promise<SpikeConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`Config request failed: HTTP ${res.status}`);
  return (await res.json()) as SpikeConfig;
}

/** Conformance-harness metadata. Purely a RECORDING label: the proxy uses it to
 *  decide where to write the raw upstream SSE, and nothing else. It never
 *  influences what is sent to the model. */
export interface HarnessTag {
  scenario: string;
  round: number;
}

/** Ask the proxy to REPLAY a captured/canned stream instead of calling the
 *  provider. In replay the proxy never reads the key and never opens a socket,
 *  which is what lets the un-promptable scenarios (parallel calls, malformed
 *  arguments, a mid-stream provider error) run deterministically and for free. */
export interface ReplayRequest {
  /** Directory under `fixtures/`, e.g. `canned/S05-parallel-tools`. */
  dir: string;
  round: number;
  /** Per-SSE-frame delay, so a test can interact with a half-written stream. */
  delayMs?: number;
}

export interface ChatStreamRequest {
  messages: OpenAIWireMessage[];
  tools?: ToolSpec[];
  cardMode: CardMode;
  signal?: AbortSignal;
  harness?: HarnessTag;
  replay?: ReplayRequest;
}

/** POST one turn and hand back the Response. A non-ok response is NOT unwrapped
 *  here: readOpenAIStream turns it into a WireError carrying the provider's own
 *  error body, which is strictly more information than a bare Error. */
export function openChatStream(req: ChatStreamRequest): Promise<Response> {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: req.messages,
      tools: req.tools,
      cardMode: req.cardMode,
      harness: req.harness,
      replay: req.replay,
    }),
    signal: req.signal,
  });
}
