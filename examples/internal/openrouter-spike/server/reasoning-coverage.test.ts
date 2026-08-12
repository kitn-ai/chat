// The reasoning-coverage guard, run on every `pnpm test`.
//
// WHY THE VITEST SUITE AND NOT THE MATRIX RUNNER
//
// The bug this guards against hid INSIDE a conformance sweep — `haiku-oai`
// recorded zero reasoning across all 13 scenarios and the results doc published
// that silence as a provider limit. A check that only runs during a sweep runs
// only when somebody spends money on a sweep, with a key, on a machine that has
// one. The fixtures are committed, so the evidence lives in the repo
// permanently; the check should therefore run wherever the repo runs, offline,
// on every push. `harness/run-matrix.mjs` calls the SAME audit at the end of a
// sweep, so a live run fails at the moment of recording rather than at the next
// CI run — but this is the copy that cannot be skipped.
//
// It reads nothing but committed fixtures: no key, no network, no browser.
//
// The red cases below are not hypotheticals dressed up as tests. Each one stages
// a real recorded column into a temp directory and breaks it in the exact shape
// the failure takes in the wild, then asserts the verdict. Every branch of the
// guard — both wires, both directions of the capability declaration, the
// missing-measurement case and the undeclared-column case — has a watched red
// here, plus the truncated-recording case that would otherwise masquerade as
// one. The OpenAI branch's red also exists for free in git history at `ff355fa`
// (`node harness/reasoning-coverage.mjs <extracted fixtures>` fails naming
// `haiku-oai`); that is reproduced here from committed data so it survives a
// shallow clone.
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { fixtureSlug, resolveWire } from './openrouter-proxy';
import { MODELS } from '../harness/models.mjs';
import type { MatrixModel } from '../harness/models.mjs';
import {
  auditReasoningCoverage,
  fixtureDirFor,
  formatCoverageReport,
  readRound,
  usageFieldFor,
} from '../harness/reasoning-coverage.mjs';

const SPIKE_ROOT = resolve(import.meta.dirname, '..');
const FIXTURES = join(SPIKE_ROOT, 'fixtures');

/** Every `.sse` under a directory. */
function sseUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.sse')) out.push(path);
    }
  };
  walk(dir);
  return out;
}

/** Every RECORDED round, so a test can assert the guard read all of them rather
 *  than trusting a number it produced itself.
 *
 *  `live/` only. The canned streams under `canned/` and `canned-anthropic/` are
 *  generated, not recorded, and carry no usage frame by design. */
const recordedRounds = (root: string): string[] => sseUnder(join(root, 'live'));

/** Copy the named fixture columns into a scratch tree so a red case can break
 *  them. The committed fixtures are never touched. */
function stage(...columns: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'kai-reasoning-'));
  for (const column of columns) {
    cpSync(join(FIXTURES, 'live', column), join(root, 'live', column), { recursive: true });
  }
  return root;
}

/** Rewrite every staged `.sse` under a column. */
function rewrite(root: string, column: string, edit: (sse: string) => string): void {
  const columnRoot = join(root, 'live', column);
  for (const scenario of readdirSync(columnRoot)) {
    const scenarioRoot = join(columnRoot, scenario);
    for (const round of readdirSync(scenarioRoot)) {
      const path = join(scenarioRoot, round);
      if (!statSync(path).isFile()) continue;
      writeFileSync(path, edit(readFileSync(path, 'utf8')));
    }
  }
}

const entry = (key: string): MatrixModel => {
  const found = MODELS.find((m) => m.key === key);
  if (!found) throw new Error(`no matrix column ${key}`);
  return found;
};

describe('the matrix catalog declares what the guard needs', () => {
  it('declares a reasoning capability for every column, with no default', () => {
    // The whole point of the declaration: a new column cannot join the matrix
    // and quietly opt out of the check by omitting a field.
    for (const m of MODELS) {
      expect(typeof m.reasons, `${m.key} must declare reasons: true|false`).toBe('boolean');
    }
  });

  it('declares a wire the proxy actually resolves to', () => {
    // Pins the declaration against the server's own rule instead of restating
    // it. A typo'd wire falls through `resolveWire` to the model-derived default
    // and stops matching what it claims.
    for (const m of MODELS) {
      expect(resolveWire(m.wire, m.model), m.key).toBe(m.wire);
    }
  });

  it('agrees with the proxy about where each column records', () => {
    // `fixtureDirFor` is a second copy of `fixtureSlug`, because the guard runs
    // under bare node and the proxy is TypeScript. This is what stops the copy
    // drifting: the guard would otherwise look for fixtures in a directory the
    // recorder never writes to, and read every column as unrecorded.
    for (const m of MODELS) {
      expect(fixtureDirFor(m.model, m.wire), m.key).toBe(fixtureSlug(m.model, m.wire));
    }
  });

  it('gives every column its own port and key', () => {
    expect(new Set(MODELS.map((m) => m.port)).size).toBe(MODELS.length);
    expect(new Set(MODELS.map((m) => m.key)).size).toBe(MODELS.length);
  });
});

describe('the thinking-token field is wire-aware', () => {
  // The trap inside the trap. The two dialects do not share a spelling, and a
  // guard keyed only on the OpenAI one reads zero for the entire Anthropic-wire
  // column — whose thinking has worked the whole time — and reports a WIRE
  // difference as a model failure.
  it('reads the OpenAI wire out of completion_tokens_details.reasoning_tokens', () => {
    expect(usageFieldFor('openai')).toEqual({
      container: 'completion_tokens_details',
      field: 'reasoning_tokens',
    });
  });

  it('reads the Anthropic wire out of output_tokens_details.thinking_tokens', () => {
    expect(usageFieldFor('anthropic')).toEqual({
      container: 'output_tokens_details',
      field: 'thinking_tokens',
    });
  });

  it('throws on a dialect it does not know rather than reporting zero', () => {
    // A third wire must be a hard failure. Returning nothing for a question it
    // cannot answer is how every column would silently read as never thinking.
    for (const wire of ['gemini', '', undefined, null, 'OpenAI']) {
      expect(() => usageFieldFor(wire), String(wire)).toThrow(/unknown wire/);
    }
  });

  it('finds nothing when the OpenAI spelling is used on an Anthropic recording', () => {
    // The counter-factual, measured rather than asserted: this is exactly what a
    // single-field guard would have seen, in both the pre-fix and post-fix
    // fixture sets, and it is a healthy column.
    const path = join(FIXTURES, 'live', fixtureDirFor(entry('haiku').model, 'anthropic'), 'S02-reasoning', 'round-1.sse');
    const sse = readFileSync(path, 'utf8');
    expect(readRound(sse, 'anthropic').reasoningTokens).toBeGreaterThan(0);
    expect(readRound(sse, 'openai').reasoningTokens).toBeNull();
  });

  it('tells "usage said zero" apart from "usage never said"', () => {
    const usage = (details: string) =>
      `data: {"choices":[],"usage":{"completion_tokens":10,${details}}}\ndata: [DONE]\n`;
    expect(readRound(usage('"completion_tokens_details":{"reasoning_tokens":0}'), 'openai')).toMatchObject({
      usageFrames: 1,
      reasoningTokens: 0,
    });
    expect(readRound(usage('"completion_tokens_details":{}'), 'openai')).toMatchObject({
      usageFrames: 1,
      reasoningTokens: null,
    });
    expect(readRound('data: {"choices":[]}\ndata: [DONE]\n', 'openai')).toMatchObject({
      usageFrames: 0,
      reasoningTokens: null,
    });
  });
});

describe('a recording that did not finish', () => {
  // `recordFixture` writes from a `finally` block, so a stream that dies
  // mid-flight lands on disk anyway — short, well-formed, and carrying no marker
  // that anything went wrong. The error frame emitted on the catch path never
  // enters the capture buffer.
  it('is recognisable: every committed round ends with data: [DONE]', () => {
    // The premise the truncation check rests on, measured rather than assumed,
    // across all three dialects the spike records (OpenAI, DeepSeek, and the
    // Anthropic Skin, which closes message_stop / event: data / data: [DONE]).
    const rounds = recordedRounds(FIXTURES);
    expect(rounds.length).toBeGreaterThan(0);
    const unterminated = rounds.filter(
      (p) => !readRound(readFileSync(p, 'utf8'), p.includes('-anthropic-wire') ? 'anthropic' : 'openai').terminated,
    );
    expect(unterminated).toEqual([]);
  });

  it('is reported as TRUNCATED, not as a model that did not think', () => {
    // The wrong-diagnosis shape this exists to stop: usage is the LAST thing in
    // a stream, so a stream cut at token 40 has no usage block at all and would
    // otherwise read as "declared reasoning-capable, produced nothing" — a
    // true-looking red pointing at the provider or the request shape when the
    // real cause was a connection that died.
    const column = fixtureDirFor(entry('gpt').model, 'openai');
    const root = stage(column);
    rewrite(root, column, (sse) => {
      const lines = sse.split('\n');
      return lines.slice(0, Math.max(1, Math.floor(lines.length / 2))).join('\n');
    });

    const [failed] = auditReasoningCoverage(root, [entry('gpt')]).failures;
    expect(failed?.verdict).toBe('truncated');
    expect(failed?.reason).toMatch(/do not end with "data: \[DONE\]"/);
    expect(failed?.reason).toMatch(/Re-record them/);
    // and specifically NOT the reasoning diagnosis, which would send a reader
    // hunting a thinking budget that was never the problem
    expect(failed?.reason).not.toMatch(/ZERO thinking tokens/);
    expect(failed?.reasoningTokens).toBe(0);
  });

  it('outranks the missing-usage verdict, because truncation is the cause', () => {
    const column = fixtureDirFor(entry('gpt').model, 'openai');
    const root = stage(column);
    // Cut only the terminator: the usage frame goes with it, exactly as it would
    // in a real mid-flight death.
    rewrite(root, column, (sse) => sse.replace(/data: \[DONE\]\s*$/, ''));

    const [failed] = auditReasoningCoverage(root, [entry('gpt')]).failures;
    expect(failed?.verdict).toBe('truncated');
  });
});

describe('the committed fixtures', () => {
  const report = auditReasoningCoverage(FIXTURES, MODELS);

  it('were actually read — every recorded round, not a subset', () => {
    // "No fixtures matched the glob" and "no reasoning in the fixtures" are
    // different failures that produce the same number. This is the cheap
    // difference between a measurement and an accident.
    const onDisk = recordedRounds(FIXTURES);
    expect(onDisk.length).toBeGreaterThan(0);
    expect(report.roundsRead).toBe(onDisk.length);
  });

  it('cover every declared column', () => {
    expect(report.columns.map((c) => c.key)).toEqual(MODELS.map((m) => m.key));
  });

  it('are read from live/ only, never from the canned streams', () => {
    // `fixtures/live/**` and `fixtures/canned*/**` have DIFFERENT invariants. The
    // canned streams are hand-generated by `harness/make-canned-fixtures.mjs` for
    // behaviours no prompt can provoke, and they carry NO usage frame by design.
    // A glob over `fixtures/` therefore weighs every canned stream against the
    // recorded usage frames and screams truncation at a set that was never
    // recorded: the same defect class this guard exists for, one directory over.
    // Both sides of that comparison are counted off disk below, never written
    // down, which is why deleting a recording cannot make this go quietly stale.
    const live = recordedRounds(FIXTURES).length;
    const everything = sseUnder(FIXTURES).length;
    expect(everything, 'the canned streams exist and are not recordings').toBeGreaterThan(live);
    expect(report.roundsRead).toBe(live);
    // and the canned ones would indeed fail the recorded-stream invariants, which
    // is precisely why they must never be in scope
    const canned = sseUnder(join(FIXTURES, 'canned'));
    expect(canned.length).toBeGreaterThan(0);
    expect(canned.every((p) => readRound(readFileSync(p, 'utf8'), 'openai').usageFrames === 0)).toBe(true);
  });

  it('yield at least one usage frame per recorded round', () => {
    // Derived, never hardcoded. Two of the five columns record 27 rounds rather
    // than 28 — ministral settles S04 in two rounds — and a constant would flag
    // published, known-correct behaviour as a defect.
    //
    // Nor is the ratio fixed: the Anthropic wire reports usage TWICE per round
    // (a preliminary `message_start` and the final `message_delta`), so
    // `usageFrames === roundsRead` holds on the OpenAI wire and is 2x here. The
    // wire-independent claim is that no round is missing one — which is what
    // catches a truncated file, since it loses its usage frame while the file
    // itself remains on disk.
    for (const c of report.columns) {
      expect(c.usageFrames, c.key).toBeGreaterThanOrEqual(c.roundsRead);
    }
  });

  it('record reasoning for every column declared reasoning-capable', () => {
    // THE assertion. `haiku-oai` failed this for a whole sweep and it was
    // published as a provider limit.
    expect(report.failures.map((c) => `${c.key}: ${c.reason}`), formatCoverageReport(report)).toEqual([]);
  });

  // Per column, so a failure names the column without a reader parsing an
  // aggregate. A column with nothing recorded SKIPS with the directory named —
  // a missing measurement, not a pass, the same line the harness draws between
  // `skip` and `FAIL`.
  for (const m of MODELS) {
    it(`${m.key} — declared ${m.reasons ? 'reasoning-capable' : 'non-reasoning'}`, (ctx) => {
      const column = report.columns.find((c) => c.key === m.key);
      if (!column) throw new Error(`no column report for ${m.key}`);
      if (column.verdict === 'unrecorded') ctx.skip(`${m.key}: ${column.reason}`);
      expect(column.roundsRead).toBeGreaterThan(0);
      expect(`${column.verdict}: ${column.reason}`).toMatch(/^ok:/);
      if (m.reasons) expect(column.reasoningTokens).toBeGreaterThan(0);
      else expect(column.reasoningTokens).toBe(0);
    });
  }
});

describe('watched reds', () => {
  it('fails a reasoning-capable OpenAI-wire column that recorded nothing', () => {
    // The historical bug, reproduced from committed data. `ff355fa` holds the
    // real pre-fix recordings and this is the shape they have: 28 rounds, HTTP
    // 200 throughout, `reasoning_tokens` zero in every one.
    const column = fixtureDirFor(entry('haiku-oai').model, 'openai');
    const root = stage(column);
    rewrite(root, column, (sse) => sse.replace(/"reasoning_tokens":\d+/g, '"reasoning_tokens":0'));

    const report = auditReasoningCoverage(root, [entry('haiku-oai')]);
    const [failed] = report.failures;

    expect(report.roundsRead).toBeGreaterThan(0);
    expect(failed?.key).toBe('haiku-oai');
    expect(failed?.verdict).toBe('silent');
    expect(failed?.reason).toMatch(/ZERO thinking tokens/);
    // and it says WHICH scenarios, which is what a reader needs to act on
    expect(failed?.reason).toContain('S02-reasoning');
    expect(failed?.scenarios.length).toBeGreaterThan(1);
  });

  it('fails a reasoning-capable Anthropic-wire column that recorded nothing', () => {
    // The Anthropic branch has no historical zero — its thinking has always
    // worked — so its red has to be staged. An unwatched branch is an unproven
    // branch, and half this guard would otherwise ship unexercised.
    const column = fixtureDirFor(entry('haiku').model, 'anthropic');
    const root = stage(column);
    rewrite(root, column, (sse) => sse.replace(/"thinking_tokens":\d+/g, '"thinking_tokens":0'));

    const [failed] = auditReasoningCoverage(root, [entry('haiku')]).failures;
    expect(failed?.key).toBe('haiku');
    expect(failed?.verdict).toBe('silent');
    expect(failed?.reason).toMatch(/ZERO thinking tokens/);
  });

  it('reports a renamed usage field as a dialect change, not as a silent model', () => {
    // The distinction that keeps the guard honest when a provider moves the
    // field: "we could not read it" must never be filed as "it did not think".
    const column = fixtureDirFor(entry('haiku').model, 'anthropic');
    const root = stage(column);
    rewrite(root, column, (sse) => sse.replace(/"output_tokens_details"/g, '"thinking_token_details"'));

    const [failed] = auditReasoningCoverage(root, [entry('haiku')]).failures;
    expect(failed?.verdict).toBe('wrong-field');
    expect(failed?.reason).toMatch(/usage\.output_tokens_details\.thinking_tokens/);
  });

  it('fails a column whose recordings carry no usage at all', () => {
    const column = fixtureDirFor(entry('gpt').model, 'openai');
    const root = stage(column);
    rewrite(root, column, (sse) => sse.replace(/"usage"/g, '"billing"'));

    const [failed] = auditReasoningCoverage(root, [entry('gpt')]).failures;
    expect(failed?.verdict).toBe('unreadable');
    expect(failed?.reason).toMatch(/no usage frame at all/);
  });

  it('fails an undeclared column instead of skipping it', () => {
    // A new model added to the matrix with no `reasons` is the exact way a
    // column would otherwise opt out of coverage in silence.
    const bogus = { key: 'gemini', model: 'google/gemini-3-flash', wire: 'openai', port: 5185 };
    const [failed] = auditReasoningCoverage(FIXTURES, [bogus]).failures;

    expect(failed?.key).toBe('gemini');
    expect(failed?.verdict).toBe('undeclared');
    expect(failed?.reason).toMatch(/`reasons` must be declared true or false/);
  });

  it('fails a column declaring a wire nobody speaks', () => {
    const bogus = { key: 'vertex', model: 'google/gemini-3-flash', wire: 'vertex', port: 5186, reasons: true };
    const [failed] = auditReasoningCoverage(FIXTURES, [bogus]).failures;
    expect(failed?.verdict).toBe('undeclared');
    expect(failed?.reason).toMatch(/`wire` must be 'openai' or 'anthropic'/);
  });

  it('fails a `reasons: false` column that thinks anyway', () => {
    // The declaration is held to account in both directions. A wrong `false` is
    // how a real regression hides behind an exemption.
    const mislabelled = { ...entry('gpt'), reasons: false };
    const [failed] = auditReasoningCoverage(FIXTURES, [mislabelled]).failures;
    expect(failed?.verdict).toBe('mislabelled');
    expect(failed?.reason).toMatch(/declared reasons: false but recorded up to \d+ thinking tokens/);
  });

  it('calls a column with no recordings MISSING, not passing and not failing', () => {
    const never = { key: 'unrecorded', model: 'someone/never-run', wire: 'openai', port: 5199, reasons: true };
    const report = auditReasoningCoverage(FIXTURES, [never]);

    expect(report.failures).toEqual([]);
    expect(report.missing.map((c) => c.key)).toEqual(['unrecorded']);
    expect(report.columns[0]?.verdict).toBe('unrecorded');
    expect(report.columns[0]?.reason).toMatch(/MISSING measurement, not a pass/);
  });
});
