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
  reasoningEffort: string;
  maxTokens: number;
  /** Whether the SERVER has a key. The key itself never crosses this boundary. */
  hasKey: boolean;
}

export async function fetchSpikeConfig(): Promise<SpikeConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`Config request failed: HTTP ${res.status}`);
  return (await res.json()) as SpikeConfig;
}

export interface ChatStreamRequest {
  messages: OpenAIWireMessage[];
  tools?: ToolSpec[];
  cardMode: CardMode;
  signal?: AbortSignal;
}

/** POST one turn and hand back the Response. A non-ok response is NOT unwrapped
 *  here: readOpenAIStream turns it into a WireError carrying the provider's own
 *  error body, which is strictly more information than a bare Error. */
export function openChatStream(req: ChatStreamRequest): Promise<Response> {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: req.messages, tools: req.tools, cardMode: req.cardMode }),
    signal: req.signal,
  });
}
