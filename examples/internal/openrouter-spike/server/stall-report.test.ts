// The stall report's DEFENSIVE paths, run offline on every `pnpm test`.
//
// The two dist branches are watched through the real harness (a forced stall,
// with and without a `dist/` touch landing inside the wait). These are the ones
// that cannot be provoked that way: the page being dead, and each probe throwing.
//
// They matter more than they look. This code only ever runs at the moment
// something has ALREADY gone wrong, so every probe in it is reaching for state
// that may not exist. A diagnostic that throws while explaining a failure
// replaces the real error with its own — the operator loses the actual failure
// and gets a stack trace from the thing that was supposed to help.
//
// A `Page` here is a hand-built stub rather than a real browser: the point is
// what happens when these calls FAIL, and a real page cannot be made to fail on
// demand in the ways that matter.
import { describe, expect, it } from 'vitest';
import type { Page } from '@playwright/test';
import { stallReport } from '../harness/stall-report';

/** The three things `stallReport` touches, each independently breakable. */
function fakePage(opts: {
  closed?: boolean;
  phase?: string | (() => never);
  config?: number | (() => never);
}): Page {
  return {
    isClosed: () => opts.closed ?? false,
    evaluate: async () => {
      if (typeof opts.phase === 'function') opts.phase();
      return opts.phase ?? '(none)';
    },
    request: {
      get: async () => {
        if (typeof opts.config === 'function') opts.config();
        return { status: () => opts.config ?? 200 };
      },
    },
  } as unknown as Page;
}

describe('stallReport', () => {
  it('reports the phase the DOM actually reached', async () => {
    // The observation that separates "the turn never started" from "the turn
    // already finished" — identical from a timeout, opposite meanings.
    const out = await stallReport(fakePage({ phase: 'done' }), 'html[data-kai-phase="running"]');
    expect(out).toContain('stalled waiting for: html[data-kai-phase="running"]');
    expect(out).toContain('phase:     done');
    expect(out).toContain('/api/config: HTTP 200');
  });

  it('stops after reporting a closed page instead of probing a dead context', async () => {
    const out = await stallReport(fakePage({ closed: true }), 'anything');
    expect(out).toContain('page:      CLOSED');
    expect(out).toContain('no further observations possible');
    // Probing a closed page would throw inside the reporter, which is the one
    // thing it must never do.
    expect(out).not.toContain('phase:');
    expect(out).not.toContain('/api/config');
  });

  it('survives an unreadable DOM', async () => {
    const out = await stallReport(
      fakePage({
        phase: () => {
          throw new Error('Execution context was destroyed');
        },
      }),
      'sel',
    );
    expect(out).toContain('phase:     unreadable (Execution context was destroyed)');
    // and keeps going — one dead probe must not cost the others
    expect(out).toContain('/api/config: HTTP 200');
  });

  it('survives a dev server that has stopped answering', async () => {
    const out = await stallReport(
      fakePage({
        config: () => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:5184');
        },
      }),
      'sel',
    );
    expect(out).toContain('/api/config: no answer (connect ECONNREFUSED 127.0.0.1:5184)');
    expect(out).toContain('phase:'); // the earlier probe still reported
  });

  it('never names a cause', async () => {
    // The design constraint, asserted rather than trusted to review. This
    // signature has at least four unrelated causes, so a report that named one
    // would be confidently wrong most of the time — which is worse than silence,
    // because it sends the reader somewhere specific.
    const out = await stallReport(fakePage({ phase: 'running' }), 'sel');
    expect(out).toContain('OBSERVATIONS, not a diagnosis');
    for (const verdict of ['because', 'caused by', 'the cause', 'due to']) {
      expect(out.toLowerCase(), `the report must not assert a cause ("${verdict}")`).not.toContain(
        verdict,
      );
    }
  });
});
