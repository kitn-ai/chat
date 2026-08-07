// Browser-side transport. Talks ONLY to the local dev proxy: no provider SDK,
// no API key, no openrouter.ai host anywhere in this file (or in any file the
// client bundle reaches).
import { sseJson } from './sse-frames';
import type { ModelStreamChunk, WireMessage } from './model-stream';
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
  messages: WireMessage[];
  tools?: ToolSpec[];
  cardMode: CardMode;
  signal?: AbortSignal;
}

/** POST one turn and return its chunks as an async iterable. */
export async function openChatStream(req: ChatStreamRequest): Promise<AsyncIterable<ModelStreamChunk>> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: req.messages, tools: req.tools, cardMode: req.cardMode }),
    signal: req.signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res
      .json()
      .then((j: { error?: { message?: string } }) => j?.error?.message)
      .catch(() => undefined);
    throw new Error(detail ?? `Chat request failed: HTTP ${res.status}`);
  }

  return sseJson<ModelStreamChunk>(res.body);
}
