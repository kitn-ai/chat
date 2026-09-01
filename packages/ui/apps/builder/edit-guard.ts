/**
 * The staleness guard behind App.tsx's onEdit (F2, final-review fix wave):
 * extracted to a small pure(-ish) async function so the request-id check is
 * testable without Solid signals, a debounce timer, or a real fetch — App.tsx
 * wires the returned outcome to setProblems/setServerError, this module owns
 * only "did a newer edit supersede me".
 *
 * A stale response — one whose POST started before a LATER submit() call —
 * resolves to `undefined` no matter what it resolved or rejected with, so an
 * out-of-order network response can never overwrite a newer edit's problems
 * or clobber the server-error banner state with information about a request
 * nothing cares about anymore.
 */
import type { Construct, ConstructProblem } from '../../src/agent-tooling/construct/schema';

export interface EditOutcome {
  problems: readonly ConstructProblem[];
  serverError: string | undefined;
}

/** `post` is injectable so tests can resolve two calls out of order without
 *  touching `fetch` or timers. */
export function createEditGuard(
  post: (next: Construct) => Promise<Response>,
): (next: Construct) => Promise<EditOutcome | undefined> {
  let latest = 0;
  return async function submit(next: Construct): Promise<EditOutcome | undefined> {
    const id = ++latest;
    try {
      const res = await post(next);
      if (id !== latest) return undefined; // a newer submit() started — drop
      if (res.status === 422) {
        const body = await res.json();
        return { problems: (body.problems as ConstructProblem[] | undefined) ?? [], serverError: undefined };
      }
      if (!res.ok) throw new Error(`POST /api/construct → ${res.status}`);
      return { problems: [], serverError: undefined };
    } catch {
      if (id !== latest) return undefined; // superseded before the failure surfaced
      return { problems: [], serverError: 'save failed' };
    }
  };
}
