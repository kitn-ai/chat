// Two ways the recorder could write a file that LIES about the run it came from.
// Both were live defects; both cost real money to find.
//
// 1. TRUNCATION. `recordFixture` is called from a `finally`, so it also runs when
//    the upstream read threw. The error frame the `catch` emits goes to
//    `res.write` and never reaches the capture buffer, so what lands on disk is a
//    short, well-formed, unmarked SSE file — a clean stream that ended early.
//    That is strictly worse than no file at all: a missing fixture replays as
//    `skip`, which the matrix runner deliberately reports as a MISSING
//    measurement, while a truncated one replays as a real stream and can go GREEN
//    if the partial content happens to satisfy the assertion. It also reads
//    downstream as zero reasoning tokens and as a smaller cost, because the usage
//    frame is the LAST thing in a stream.
//
// 2. SURVIVORS. The recorder wrote round-N without clearing the scenario
//    directory, so a run that settled in two rounds left the previous run's
//    round-3 in place. Two of those shipped (e352545): they inflated the sweep's
//    documented cost by $0.002437 and a future third round would have replayed a
//    stream recorded against a conversation that no longer existed.
//
// These assert the FILESYSTEM outcome rather than any internal predicate, so they
// keep their meaning if the terminator check is later rewritten. No key, no
// network, no server: `recordFixture` is called directly against a temp dir.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixturePath, recordFixture, scenarioSlug } from './openrouter-proxy';
import type { ProxyEnv } from './openrouter-proxy';

/** The frame every clean recording ends with. Duplicated from the proxy on
 *  purpose: a test that imports the terminator it is checking cannot notice the
 *  terminator being changed to something the provider never sends. Verified
 *  against every recording in fixtures/live — 136 of 136, across all three
 *  dialects (OpenAI-compat, the Anthropic Skin, DeepSeek) — end with it. */
const DONE = 'data: [DONE]\n\n';

/** A realistic OpenAI-compat stream: some deltas, the usage frame that carries
 *  cost and reasoning tokens, then the terminator. */
const COMPLETE =
  'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n' +
  'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
  'data: {"usage":{"completion_tokens":2,"cost":0.00042}}\n\n' +
  DONE;

/** The SAME stream as it looks when the socket dies after the second delta: a
 *  prefix of a real recording, well-formed, no terminator, and crucially no
 *  usage frame — so it reads as zero cost and zero reasoning tokens. */
const TRUNCATED = COMPLETE.slice(0, COMPLETE.indexOf('data: {"usage"'));

let root: string;

const env = (over: Partial<ProxyEnv> = {}): ProxyEnv => ({
  key: '',
  backend: 'openrouter',
  model: '~deepseek/deepseek-v4-flash-latest',
  wire: 'openai',
  reasoningEffort: 'medium',
  maxTokens: 900,
  fixtureDir: root,
  record: true,
  ...over,
});

/** Where a recording for this scenario lands. */
const dirFor = (scenario: string) =>
  join(root, 'live', 'deepseek-deepseek-v4-flash-latest', scenarioSlug(scenario));

const listing = async (scenario: string) => {
  const dir = dirFor(scenario);
  return existsSync(dir) ? (await readdir(dir)).sort() : [];
};

const record = (scenario: string, round: number, sse: string) =>
  recordFixture(env(), scenario, round, Buffer.from(sse));

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'spike-record-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('a complete capture is still recorded', () => {
  // The other half of the guard. A check that refuses everything is exactly as
  // useless as one that refuses nothing, and it would silently empty the whole
  // fixture tree on the next sweep.
  it('writes round-N.sse with the captured bytes byte for byte', async () => {
    await record('S01-plain-text', 1, COMPLETE);

    const file = join(dirFor('S01-plain-text'), 'round-1.sse');
    expect(existsSync(file)).toBe(true);
    expect(await readFile(file, 'utf8')).toBe(COMPLETE);
  });

  it('records every round of a multi-round scenario', async () => {
    for (const round of [1, 2, 3]) await record('S04-multi-round', round, COMPLETE);

    expect(await listing('S04-multi-round')).toEqual([
      'round-1.sse',
      'round-2.sse',
      'round-3.sse',
    ]);
  });

  it('tolerates trailing whitespace after the terminator', async () => {
    await record('S01-plain-text', 1, `${COMPLETE}\n`);

    expect(existsSync(join(dirFor('S01-plain-text'), 'round-1.sse'))).toBe(true);
  });
});

describe('an error-only capture is not a recording of the scenario', () => {
  /** What the route emits when the provider refused the request outright: one
   *  in-band error frame and a clean terminator. Well formed, complete, and
   *  evidence of nothing. This exact shape is what the AI Gateway's free-tier
   *  rate limit produced. */
  const ERROR_ONLY =
    'data: {"error":{"message":"Free tier requests on this model are rate-limited."}}\n\n' + DONE;

  it('does not write round-N.sse, even though the stream terminated cleanly', async () => {
    await record('S03-single-tool', 1, ERROR_ONLY);

    expect(existsSync(join(dirFor('S03-single-tool'), 'round-1.sse'))).toBe(false);
    expect(await listing('S03-single-tool')).toEqual(['round-1.sse.error']);
  });

  it('does NOT clear the rounds an earlier run recorded', async () => {
    // The one that cost real evidence: a refused round 1 emptied the directory
    // on its way to writing nothing, so two good tool rounds from the previous
    // attempt went with it.
    for (const round of [1, 2]) await record('S04-multi-round', round, COMPLETE);

    await record('S04-multi-round', 1, ERROR_ONLY);

    expect(await listing('S04-multi-round')).toEqual([
      'round-1.sse',
      'round-1.sse.error',
      'round-2.sse',
    ]);
    expect(await readFile(join(dirFor('S04-multi-round'), 'round-1.sse'), 'utf8')).toBe(COMPLETE);
  });

  it('KEEPS a stream that produced content and then failed', async () => {
    // The other half. S16 exists to cover a provider dying mid-stream, and that
    // recording is real: the distinction is "nothing but an error", not "an
    // error appears".
    const FAILED_MIDWAY =
      'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n' +
      'data: {"error":{"message":"upstream died"}}\n\n' +
      DONE;

    await record('S16-mid-stream-error', 1, FAILED_MIDWAY);

    expect(await listing('S16-mid-stream-error')).toEqual(['round-1.sse']);
  });
});

describe('a truncated capture cannot masquerade as a complete recording', () => {
  it('does not write round-N.sse when the terminator is missing', async () => {
    await record('S03-single-tool', 1, TRUNCATED);

    expect(existsSync(join(dirFor('S03-single-tool'), 'round-1.sse'))).toBe(false);
  });

  it('leaves nothing the replay path can resolve, so the cell reads as skip', async () => {
    // The distinction the matrix runner draws: a missing fixture is a MISSING
    // measurement (`skip`), a present one is a real stream that can go green.
    // This is the assertion that connects the guard to that behaviour.
    await record('S03-single-tool', 1, TRUNCATED);

    const replayTarget = fixturePath(root, 'live/deepseek-deepseek-v4-flash-latest/S03-single-tool', 1);
    expect(replayTarget).not.toBeNull();
    expect(existsSync(replayTarget!)).toBe(false);
  });

  it('keeps the partial bytes for diagnosis, under a name replay cannot reach', async () => {
    await record('S03-single-tool', 1, TRUNCATED);

    const files = await listing('S03-single-tool');
    expect(files).toEqual(['round-1.sse.partial']);
    // fixturePath only ever builds `round-N.sse`, so no round number can name it.
    expect(files.every((f) => !f.endsWith('.sse'))).toBe(true);
    expect(await readFile(join(dirFor('S03-single-tool'), 'round-1.sse.partial'), 'utf8')).toBe(
      TRUNCATED,
    );
  });

  it('refuses an empty capture', async () => {
    // What an upstream that died before its first byte produces.
    await record('S03-single-tool', 1, '');

    expect(existsSync(join(dirFor('S03-single-tool'), 'round-1.sse'))).toBe(false);
  });

  it('refuses a truncated LATER round without disturbing the good earlier ones', async () => {
    await record('S04-multi-round', 1, COMPLETE);
    await record('S04-multi-round', 2, COMPLETE);
    await record('S04-multi-round', 3, TRUNCATED);

    expect(await listing('S04-multi-round')).toEqual([
      'round-1.sse',
      'round-2.sse',
      'round-3.sse.partial',
    ]);
  });
});

describe('round 1 clears the scenario directory', () => {
  it('leaves no round-3 behind when a re-run settles in two rounds', async () => {
    // Exactly the shape that shipped: a three-round recording, then a two-round
    // re-run against a different thread over the top of it.
    for (const round of [1, 2, 3]) await record('S12-citations', round, COMPLETE);
    expect(await listing('S12-citations')).toHaveLength(3);

    for (const round of [1, 2]) await record('S12-citations', round, COMPLETE);

    expect(await listing('S12-citations')).toEqual(['round-1.sse', 'round-2.sse']);
  });

  it('clears a stale .partial too, so a fixed re-run leaves no trace of the failure', async () => {
    await record('S03-single-tool', 1, TRUNCATED);
    expect(await listing('S03-single-tool')).toEqual(['round-1.sse.partial']);

    await record('S03-single-tool', 1, COMPLETE);

    expect(await listing('S03-single-tool')).toEqual(['round-1.sse']);
  });

  it('clears only THIS scenario, not its siblings', async () => {
    await record('S01-plain-text', 1, COMPLETE);
    await record('S03-single-tool', 1, COMPLETE);

    await record('S01-plain-text', 1, COMPLETE);

    expect(await listing('S03-single-tool')).toEqual(['round-1.sse']);
  });

  it('clears only THIS configuration, not the same scenario on the other wire', async () => {
    // The two wires record mutually unparseable SSE into sibling directories.
    // Re-recording one must not empty the other.
    const anthropic = env({ model: 'anthropic/claude-haiku-4.5', wire: 'anthropic' });
    await recordFixture(anthropic, 'S12-citations', 1, Buffer.from(COMPLETE));
    await record('S12-citations', 1, COMPLETE);

    const other = join(root, 'live', 'anthropic-claude-haiku-4.5-anthropic-wire', 'S12-citations');
    expect(await readdir(other)).toEqual(['round-1.sse']);
  });
});

describe('scenarioSlug', () => {
  // This matters MORE now than it did before: the round-1 clear deletes a
  // directory recursively, and that directory's last segment comes from the
  // request body. `..` survives a naive character-class filter intact, because
  // dots are legal in a scenario name — and `live/<model>/..` is `live/`.
  it('cannot produce a path separator or a traversal segment', () => {
    for (const evil of ['..', '../..', 'a/../../b', '....//....']) {
      const slug = scenarioSlug(evil);
      expect(slug, evil).not.toContain('/');
      expect(slug, evil).not.toContain('..');
    }
  });

  it('preserves the case of the real scenario ids, or every recording moves', () => {
    expect(scenarioSlug('S12-citations')).toBe('S12-citations');
    expect(scenarioSlug('S05-parallel-tools')).toBe('S05-parallel-tools');
  });

  it('never writes outside the scenario directory it was handed', async () => {
    const decoy = join(root, 'live', 'deepseek-deepseek-v4-flash-latest', 'S01-plain-text');
    await record('S01-plain-text', 1, COMPLETE);
    await writeFile(join(decoy, 'keep-me.txt'), 'not a fixture');

    await recordFixture(env(), '..', 1, Buffer.from(COMPLETE));

    // The sibling scenario is untouched: the traversal never resolved to `live/`.
    expect(existsSync(join(decoy, 'keep-me.txt'))).toBe(true);
    expect(existsSync(join(decoy, 'round-1.sse'))).toBe(true);
  });
});
