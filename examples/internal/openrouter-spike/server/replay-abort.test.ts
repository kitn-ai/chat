// The cancel ledger: can the server tell an ABORTED fetch from a completed one?
//
// S17 clicks Stop and asserts, from the DOM, that the answer stops growing short
// of its closing sentence. Both facts are real and neither one distinguishes the
// working implementation from the broken one: `AssistantStream.abort` makes the
// fold ignore later deltas, so a cancel that never reaches `fetch` looks exactly
// the same on screen while the socket stays open and the bytes keep arriving.
//
// The proxy is the peer whose socket the abort closes, so it is the only party
// that can draw that line. These tests drive the frame writer with a fake socket
// and require it to draw it. No key, no network, no browser, no dev server.
import { describe, expect, it } from 'vitest';
import {
  createReplayLog,
  splitReplayFrames,
  streamReplayFrames,
  type FrameSink,
  type ReplayObservation,
} from './openrouter-proxy';

/** A `ServerResponse` stand-in whose socket this test controls. `hangUp()` is
 *  the client aborting the fetch. */
function fakeSocket() {
  const written: string[] = [];
  let onClose: (() => void) | null = null;
  let ended = false;
  const sink: FrameSink = {
    write: (chunk) => written.push(chunk),
    end: () => {
      ended = true;
      // Node fires `close` after `end()` too. Included deliberately: a ledger
      // that treated ANY close as an abort would call every completed stream
      // cancelled, which is the false-positive twin of the bug under test.
      onClose?.();
    },
    on: (_event, listener) => {
      onClose = listener;
    },
  };
  return {
    sink,
    written,
    get ended() {
      return ended;
    },
    hangUp: () => onClose?.(),
  };
}

const FRAMES = ['data: 1\n\n', 'data: 2\n\n', 'data: 3\n\n', 'data: 4\n\n', 'data: [DONE]\n\n'];

function openEntry(total = FRAMES.length): ReplayObservation {
  return createReplayLog().open('canned/S17-cancel', 1, total);
}

describe('streamReplayFrames', () => {
  it('reports a stream nobody interrupted as NOT aborted', async () => {
    const socket = fakeSocket();
    const entry = openEntry();

    await streamReplayFrames(socket.sink, FRAMES, 0, entry);

    expect(socket.written).toEqual(FRAMES);
    expect(entry.framesWritten).toBe(FRAMES.length);
    expect(entry.finished).toBe(true);
    // The half that matters: `end()` fires `close`, and that must not read as a
    // cancel. If it did, S17 would pass against a build that never aborts.
    expect(entry.clientAborted).toBe(false);
  });

  it('reports a client that hangs up mid-stream as ABORTED, and stops writing', async () => {
    const socket = fakeSocket();
    const entry = openEntry();

    // Hang up after the 2nd frame, the way a real abort lands between frames.
    const delayMs = 5;
    const streaming = streamReplayFrames(socket.sink, FRAMES, delayMs, entry);
    await new Promise((r) => setTimeout(r, delayMs * 2 + 2));
    socket.hangUp();
    await streaming;

    expect(entry.clientAborted).toBe(true);
    expect(entry.framesWritten).toBeLessThan(FRAMES.length);
    expect(socket.written.length).toBe(entry.framesWritten);
    expect(entry.finished).toBe(true);
  });

  it('does not count a hang-up that arrives after the last frame', async () => {
    const socket = fakeSocket();
    const entry = openEntry();

    await streamReplayFrames(socket.sink, FRAMES, 0, entry);
    socket.hangUp(); // the client going away once the stream is already over

    expect(entry.clientAborted).toBe(false);
  });
});

describe('splitReplayFrames', () => {
  it('re-emits the file byte for byte', () => {
    const sse = FRAMES.join('');
    expect(splitReplayFrames(sse).join('')).toBe(sse);
  });

  it('counts a well-formed capture as exactly its frames', () => {
    // `framesTotal` is the denominator `clientAborted` is decided against, so an
    // off-by-one here would make every COMPLETED stream report as aborted.
    //
    // Pinned because it is easy to get backwards: JS `String.split` emits NO
    // trailing empty segment for a zero-width match at the end of a string,
    // even though the file does end in `\n\n`. Python's `re.split` does emit
    // one, which is how this was miscounted once while being checked in the
    // wrong language.
    const sse = FRAMES.join('');
    expect(sse.endsWith('\n\n')).toBe(true);
    expect(sse.split(/(?<=\n\n)/)).not.toContain('');
    expect(splitReplayFrames(sse).length).toBe(FRAMES.length);
  });

  it('skips an empty segment rather than truncating the stream at it', () => {
    // Defensive: a malformed capture must not inflate `framesTotal` (every
    // completed stream would then read as aborted) and must not cut the replay
    // short either, which is what the loop this replaced would have done.
    const withEmpty = ['data: 1\n\n', '', 'data: 2\n\n'];
    expect(splitReplayFrames(withEmpty.join(''))).toEqual(['data: 1\n\n', 'data: 2\n\n']);
  });
});

describe('createReplayLog', () => {
  it('gives every replay a distinct id, so a caller can pin the one it means', () => {
    const log = createReplayLog();
    const a = log.open('canned/S17-cancel', 1, 3);
    const b = log.open('canned/S17-cancel', 2, 3);
    expect(a.id).not.toBe(b.id);
    expect(log.entries().map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it('hands out copies, so a poller cannot watch an entry mutate under it', () => {
    const log = createReplayLog();
    const live = log.open('canned/S17-cancel', 1, 3);
    const snapshot = log.entries()[0]!;
    live.framesWritten = 2;
    live.finished = true;
    expect(snapshot.framesWritten).toBe(0);
    expect(snapshot.finished).toBe(false);
    expect(log.entries()[0]!.framesWritten).toBe(2);
  });

  it('stays bounded across a long matrix run', () => {
    const log = createReplayLog();
    for (let i = 0; i < 200; i++) log.open('canned/S01-plain-text', 1, 1);
    expect(log.entries().length).toBeLessThanOrEqual(64);
    // And it keeps the NEWEST, which is the one a running scenario asks about.
    expect(log.entries().at(-1)!.id).toBe(200);
  });
});
