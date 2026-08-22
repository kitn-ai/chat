/**
 * The console's client for the run board's API — which lives on the OTHER
 * origin (http://localhost:5183).
 *
 * The console reads the same feed the board page reads, so the in-thread
 * checklist and the framed board are two renderings of ONE state rather than
 * two simulations that agree by luck.
 */
import { useEffect, useState } from 'react';
import type { RunState, StartRunInput } from '../shared/run';

/** Origin #2. Also the value pinned as `<Remote provider-origin>`. */
export const BOARD_ORIGIN = 'http://localhost:5183';

/** The provider page `<kai-remote>` frames. Must be on `BOARD_ORIGIN`. */
export const BOARD_CARD_SRC = `${BOARD_ORIGIN}/`;

async function post(path: string, body?: unknown): Promise<RunState | null> {
  try {
    const response = await fetch(`${BOARD_ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) throw new Error(`run board answered ${response.status}`);
    return (await response.json()) as RunState;
  } catch (error) {
    // The board being down must not take the console with it: the caller shows
    // the failure in the thread and the operator can retry.
    console.error('[run-board]', error);
    return null;
  }
}

export function startRun(input: StartRunInput): Promise<RunState | null> {
  return post('/api/run/start', input);
}

export function rollbackRun(): Promise<RunState | null> {
  return post('/api/run/rollback');
}

export function resetRun(): Promise<RunState | null> {
  return post('/api/run/reset');
}

/**
 * Subscribe to the run feed.
 *
 * `EventSource` reconnects on its own, which is what we want across a board
 * server restart; the state is re-sent in full on every connect.
 */
export function useRunState(): { run: RunState | null; connected: boolean } {
  const [run, setRun] = useState<RunState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const feed = new EventSource(`${BOARD_ORIGIN}/api/run/stream`);
    const onMessage = (event: MessageEvent<string>): void => {
      setConnected(true);
      try {
        setRun(JSON.parse(event.data) as RunState);
      } catch {
        console.warn('[run-board] unreadable frame on the run feed');
      }
    };
    feed.addEventListener('message', onMessage);
    feed.addEventListener('open', () => setConnected(true));
    feed.addEventListener('error', () => setConnected(false));
    return () => feed.close();
  }, []);

  return { run, connected };
}
