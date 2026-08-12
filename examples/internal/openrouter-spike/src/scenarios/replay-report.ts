// Reading what the SERVER saw happen to a replayed stream.
//
// Every other assertion in this harness looks at the rendered DOM, and that rule
// is load-bearing (see HARNESS.md, "The assertion rule"). This is the documented
// exception, for the one fact the DOM provably cannot express: whether the
// in-flight FETCH was aborted.
//
// The distinction the DOM cannot draw: `AssistantStream.abort` makes the fold
// ignore later deltas, so a cancel that never reaches `fetch` looks IDENTICAL on
// screen — the text stops either way — while the socket stays open and the
// remaining bytes keep arriving. A cancel assertion that only watches text is
// therefore unable to fail for the reason it exists. The server is the peer
// whose socket the abort closes, so it is the only party that can tell "the
// client went away" from "the stream ran out".
//
// This is not a back door around the assertion rule. The rendered claims stay
// exactly where they were, in the scenario; this adds the one claim they cannot
// make, and it is measured on the server's own clock rather than on the
// renderer's, which is why it does not inherit the flakiness of the character
// budget it replaces.
//
// No `@playwright/test` VALUE is imported: everything goes through `page.request`,
// so this module stays importable from the browser bundle like its siblings.
import type { Page } from '@playwright/test';
import { ScenarioAssertionError } from './types';

/** One replayed stream, as the proxy saw it. Mirrors `ReplayObservation` in
 *  `server/openrouter-proxy.ts`; restated rather than imported because that
 *  module is Node-only (`node:fs`, `vite`) and these modules load in the
 *  browser. `replay-abort.test.ts` pins the two together. */
export interface ReplayObservation {
  id: number;
  dir: string;
  round: number;
  framesTotal: number;
  framesWritten: number;
  clientAborted: boolean;
  finished: boolean;
}

async function fetchReplays(page: Page): Promise<ReplayObservation[]> {
  const res = await page.request.get('/api/replay-report');
  if (!res.ok()) {
    throw new ScenarioAssertionError(
      `/api/replay-report answered HTTP ${res.status()}. The dev proxy publishes it (see ` +
        '`openrouterProxy`); a 404 means the server under test predates the cancel ledger.',
    );
  }
  const body = (await res.json()) as { replays?: ReplayObservation[] };
  return body.replays ?? [];
}

/**
 * Pin the replay that is on the wire RIGHT NOW, before doing anything to it.
 *
 * Identifying the stream up front is what stops a later replay — a second tool
 * round, the next scenario sharing this dev server — being read as the one under
 * test. It also ARMS the measurement: if nothing is streaming there is nothing
 * to cancel, and this says so instead of quietly reporting on whatever it found.
 */
export async function pinStreamingReplay(page: Page): Promise<ReplayObservation> {
  const inflight = (await fetchReplays(page)).filter((r) => !r.finished);
  if (inflight.length === 0) {
    throw new ScenarioAssertionError(
      'no replay was still streaming when the interruption was due, so this run cannot say ' +
        'anything about cancelling one. The fixture finished before the scenario got to it — ' +
        "raise the scenario's replayDelayMs.",
    );
  }
  // The newest, in the vanishingly unlikely event of an overlap.
  return inflight[inflight.length - 1]!;
}

/**
 * Wait for a pinned replay to STOP, then report how it stopped.
 *
 * Waiting for `finished` is the half that makes this honest. Mid-flight, an
 * aborted stream and a healthy one are indistinguishable — both have written
 * fewer frames than they will — so a reading taken at the moment of the click
 * would be a coin flip dressed up as a measurement. A stream that was not
 * aborted keeps writing to its last frame, which takes as long as it takes; the
 * timeout has to clear that, not the click.
 */
export async function awaitReplayOutcome(
  page: Page,
  pinned: ReplayObservation,
  timeout = 30_000,
): Promise<ReplayObservation> {
  const deadline = Date.now() + timeout;
  let last = pinned;
  for (;;) {
    const found = (await fetchReplays(page)).find((r) => r.id === pinned.id);
    if (!found) {
      throw new ScenarioAssertionError(
        `the replay this scenario pinned (#${pinned.id}, ${pinned.dir} round ${pinned.round}) is no ` +
          'longer in the report. It was evicted from the log, so nothing can be concluded from it.',
      );
    }
    last = found;
    if (found.finished) return found;
    if (Date.now() > deadline) {
      throw new ScenarioAssertionError(
        `the replay of ${last.dir} round ${last.round} was still writing frames ${timeout}ms after ` +
          `the interruption (${last.framesWritten}/${last.framesTotal} sent). Neither aborted nor ` +
          'finished, so this run proves nothing either way.',
      );
    }
    await page.waitForTimeout(100);
  }
}

/**
 * Assert the client actually HUNG UP on a replayed stream.
 *
 * This is the check a DOM-only cancel assertion cannot make. It fails when the
 * server was allowed to write every frame — the exact signature of a cancel that
 * settles the message but never aborts the fetch, which renders identically and
 * leaks a live request.
 */
export async function seesFetchAborted(
  page: Page,
  pinned: ReplayObservation,
  because: string,
): Promise<ReplayObservation> {
  const outcome = await awaitReplayOutcome(page, pinned);
  if (!outcome.clientAborted) {
    throw new ScenarioAssertionError(
      `the in-flight fetch was NOT aborted — ${because}.\n` +
        `  The server replayed ${outcome.dir} round ${outcome.round} to the END: all ` +
        `${outcome.framesTotal} frames written, client never hung up.\n` +
        '  Cancelling settled the MESSAGE without cancelling the REQUEST, so the bytes kept ' +
        'arriving and were merely ignored. On screen that is indistinguishable from a working ' +
        'cancel; on the wire it is a leaked request.',
    );
  }
  return outcome;
}
