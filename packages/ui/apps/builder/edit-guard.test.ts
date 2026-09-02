/**
 * Pins F2 (final-review fix wave): createEditGuard drops a response that
 * arrives after a newer submit() call already started, so an out-of-order
 * network resolution can never overwrite newer problems or clobber the
 * server-error state with a stale request's outcome.
 */
import { describe, expect, it } from 'vitest';
import { createEditGuard } from './edit-guard';
import type { Construct } from '../../mcp/construct/schema';

const construct = (name: string): Construct =>
  ({ name, layout: 'fullscreen', provider: { mode: 'mock' } }) as Construct;

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

describe('createEditGuard (F2)', () => {
  it('resolves two POSTs out of order: problems reflect the LATER submit, the earlier (now-stale) one is dropped', async () => {
    let resolveFirst!: (r: Response) => void;
    let resolveSecond!: (r: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const secondResponse = new Promise<Response>((resolve) => { resolveSecond = resolve; });
    let calls = 0;
    const submit = createEditGuard(() => (++calls === 1 ? firstResponse : secondResponse));

    // Both edits start before either resolves — a burst past the debounce.
    const firstStarted = submit(construct('a'));
    const secondStarted = submit(construct('b'));

    // Resolve OUT OF ORDER: the LATER submit's response arrives first, the
    // EARLIER (now-stale) one arrives after, carrying a DIFFERENT problems
    // set that must never surface.
    resolveSecond(jsonResponse(422, { problems: [{ path: 'name', message: 'second' }] }));
    const secondOutcome = await secondStarted;
    resolveFirst(jsonResponse(422, { problems: [{ path: 'name', message: 'first-STALE' }] }));
    const firstOutcome = await firstStarted;

    expect(secondOutcome).toEqual({ problems: [{ path: 'name', message: 'second' }], serverError: undefined });
    expect(firstOutcome).toBeUndefined();
  });

  it('a stale request that fails after being superseded does not surface "save failed" (serverError untouched)', async () => {
    let rejectFirst!: (e: Error) => void;
    let resolveSecond!: (r: Response) => void;
    const firstResponse = new Promise<Response>((_resolve, reject) => { rejectFirst = reject; });
    const secondResponse = new Promise<Response>((resolve) => { resolveSecond = resolve; });
    let calls = 0;
    const submit = createEditGuard(() => (++calls === 1 ? firstResponse : secondResponse));

    const firstStarted = submit(construct('a'));
    const secondStarted = submit(construct('b'));

    resolveSecond(jsonResponse(200, {}));
    const secondOutcome = await secondStarted;
    rejectFirst(new Error('network down'));
    const firstOutcome = await firstStarted;

    expect(secondOutcome).toEqual({ problems: [], serverError: undefined });
    expect(firstOutcome).toBeUndefined(); // the stale failure never reaches serverError
  });

  it('a single request still round-trips normally: valid write clears problems, 422 reports them, a hard failure reports save failed', async () => {
    const ok = createEditGuard(async () => jsonResponse(200, { ok: true }));
    await expect(ok(construct('a'))).resolves.toEqual({ problems: [], serverError: undefined });

    const rejected = createEditGuard(async () => jsonResponse(422, { problems: [{ path: 'name', message: 'bad' }] }));
    await expect(rejected(construct('a'))).resolves.toEqual({
      problems: [{ path: 'name', message: 'bad' }],
      serverError: undefined,
    });

    const failed = createEditGuard(async () => jsonResponse(500, {}));
    await expect(failed(construct('a'))).resolves.toEqual({ problems: [], serverError: 'save failed' });

    const down = createEditGuard(async () => { throw new Error('ECONNREFUSED'); });
    await expect(down(construct('a'))).resolves.toEqual({ problems: [], serverError: 'save failed' });
  });
});
