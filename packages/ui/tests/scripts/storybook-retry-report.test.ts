import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Typed by inference from the .mjs itself — tsconfig.tests.json sets allowJs, so
// these three arrive with real signatures rather than as `any`. This line carried a
// `@ts-expect-error` for "plain .mjs build script, no type declarations" until
// 2026-08-12; with allowJs the directive suppresses nothing and TS2578s.
import { describeAttempt, readReport, stderrHead } from '../../scripts/run-storybook-tests.mjs';

/**
 * The retry wrapper around the storybook browser suite reports OBSERVATIONS and
 * never names a cause.
 *
 * It used to retry every non-zero exit under "likely a chromium crash, not a test
 * failure" — a sentence it never checked against anything. A `vitest.config.ts`
 * syntax error was observed being retried three times wearing it, which is the
 * failure most likely to be waved through: sub-sharding exists to work around a
 * real chromium leak, so that banner is exactly what reviewers have been trained
 * to ignore.
 *
 * These tests exist because "add the likely cause here, it'd be more useful" is a
 * well-meaning edit that review waves through. The same property is asserted for
 * another diagnostic in `src/wire/openai-fixtures.test.ts`, where the adapter is
 * forbidden from blaming a token limit it was never told about.
 */

/** Vocabulary that names or ranks a cause rather than reporting an observation. */
const CAUSE_LANGUAGE = [
  'likely', 'probably', 'presumably', 'perhaps', 'maybe',
  'seems', 'appears to', 'suggests', 'suspect', 'must be',
  'chromium crash', 'browser crash', 'not a test failure', 'flake', 'flaky',
];

function namesACause(text: string): string[] {
  const lower = text.toLowerCase();
  return CAUSE_LANGUAGE.filter((w) => lower.includes(w));
}

const base = {
  label: '1/20',
  attempt: 1,
  attempts: 3,
  status: 1,
  signal: null,
  spawnError: undefined,
  stderr: '',
  report: { state: 'none' },
  config: { state: 'ok', file: 'vitest.config.ts' },
};

describe('storybook retry diagnostic', () => {
  it('names no cause when the suite ran and tests failed', () => {
    const { text } = describeAttempt({
      ...base,
      report: { state: 'ran', total: 42, failed: 3 },
    });
    expect(namesACause(text)).toEqual([]);
    expect(text).toContain('42 test result(s), 3 failed');
  });

  it('names no cause when nothing ran and the config parses', () => {
    const { text } = describeAttempt(base);
    expect(namesACause(text)).toEqual([]);
    expect(text).toContain('vitest recorded no test results');
  });

  it('says "unknown" outright rather than picking a cause it did not check', () => {
    const { text, deterministic } = describeAttempt(base);
    expect(text).toContain('unknown');
    expect(deterministic).toBe(false);
  });

  it('reports the exit status, and that no signal was involved', () => {
    const { text } = describeAttempt({ ...base, status: 1 });
    expect(text).toContain('process exited 1, not terminated by a signal');
  });

  it('reports a signal death as a signal death, from the signal itself', () => {
    const { text } = describeAttempt({ ...base, status: null, signal: 'SIGKILL' });
    expect(text).toContain('terminated by signal SIGKILL');
    expect(namesACause(text)).toEqual([]);
  });

  it('quotes the head of stderr verbatim instead of interpreting it', () => {
    const { text } = describeAttempt({
      ...base,
      stderr: 'Error: Build failed with 1 error:\nvitest.config.ts:8:2: ERROR: Unexpected "}"\n',
    });
    expect(text).toContain('Error: Build failed with 1 error:');
    expect(text).toContain('vitest.config.ts:8:2: ERROR: Unexpected "}"');
  });

  it('states a config parse failure as a checked fact, and marks it deterministic', () => {
    const { text, deterministic } = describeAttempt({
      ...base,
      config: { state: 'broken', file: 'vitest.config.ts', message: 'Unexpected "}" (vitest.config.ts:8:2)' },
    });
    // The one claim it may make about the future, because a parse was actually run.
    expect(deterministic).toBe(true);
    expect(text).toContain('vitest.config.ts does not parse');
    expect(text).toContain('cannot change between attempts');
    expect(namesACause(text)).toEqual([]);
  });

  it('never marks a non-config failure deterministic, so retry stays on for the crash', () => {
    for (const report of [{ state: 'none' }, { state: 'ran', total: 9, failed: 9 }]) {
      for (const signal of [null, 'SIGKILL']) {
        const { deterministic } = describeAttempt({ ...base, signal, status: signal ? null : 1, report });
        expect(deterministic).toBe(false);
      }
    }
  });

  it('admits when a check could not be run instead of assuming it passed', () => {
    const { text, deterministic } = describeAttempt({
      ...base,
      config: { state: 'unchecked', reason: 'esbuild not resolvable from this script' },
    });
    expect(text).toContain('config not checked');
    expect(deterministic).toBe(false);
    expect(namesACause(text)).toEqual([]);
  });
});

describe('the observations the diagnostic is built from', () => {
  it('reads "no results" from a missing report file rather than inferring it', () => {
    expect(readReport(resolve(__dirname, 'does-not-exist.json'))).toEqual({ state: 'none' });
  });

  it('strips ANSI and blank lines so the quoted head is readable', () => {
    expect(stderrHead('[31mboom[39m\n\n  second  \n', 5)).toEqual(['boom', '  second']);
  });

  it('caps the quoted head instead of dumping the whole log', () => {
    const many = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    expect(stderrHead(many, 5)).toHaveLength(5);
  });
});

describe('the shipped script', () => {
  const src = readFileSync(resolve(__dirname, '../../scripts/run-storybook-tests.mjs'), 'utf8');

  // Comments are stripped: the header deliberately quotes the old banner to record
  // why this guard exists. The rule is about what the script PRINTS.
  const code = src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');

  it('prints no cause-naming language anywhere', () => {
    expect(namesACause(code)).toEqual([]);
  });

  it('still sub-shards — the wrapper exists for a measured harness leak', () => {
    expect(code).toContain('--shard=');
    expect(code).toContain('STORYBOOK_SUBSHARD_TOTAL');
  });
});
