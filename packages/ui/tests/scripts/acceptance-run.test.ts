import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { listScenarios } from '../../mcp/catalog/scenarios';
import { EXECUTION_PATHS, OPENROUTER_ALLOWED, decideRoute, isOpenRouterAllowed, looksAnthropic, routeModel } from '../../scripts/lib/run-routing.mjs';
import { verifyHandover } from '../../scripts/lib/handover.mjs';

const PKG = join(__dirname, '..', '..');
const RUNNER = join(PKG, 'scripts/acceptance-run.mjs');

const fresh = () => mkdtempSync(join(tmpdir(), 'accept-run-'));

/** Run the CLI, returning { code, out } instead of throwing, so refusals are inspectable. */
function cli(args: string[]): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync('node', [RUNNER, ...args], { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

// ---------------------------------------------------------------------------

describe('the two-path router', () => {
  // THE HEADLINE RULE, over every spelling of "Anthropic" that occurs in the
  // wild. A substring match on "anthropic/" misses two of these four and a
  // substring match on "claude" over-matches, so the table is the check.
  const anthropicSpellings = [
    'anthropic/claude-sonnet-4',
    'claude-opus-5',
    'openrouter/anthropic/claude-3.7',
    'us.anthropic.claude-opus-4',
    '~anthropic/claude-haiku-4',
  ];

  it.each(anthropicSpellings)('REFUSES %s on the openrouter path, naming the rule', (model) => {
    const d = routeModel({ model, path: 'openrouter' });
    expect(d.ok).toBe(false);
    if (d.ok) throw new Error('unreachable: the assertion above already failed');
    expect(d.rule).toBe('anthropic-never-openrouter');
    expect(d.error).toContain('REFUSED rather than rerouted');
    // The refusal must NOT carry a path: a refusal that still answers "which
    // path" is a reroute wearing a warning label.
    expect((d as { path?: string }).path).toBeUndefined();
  });

  it.each(anthropicSpellings)('routes %s to claude-code, and records whether anyone typed it', (model) => {
    expect(routeModel({ model, path: 'claude-code' })).toMatchObject({ ok: true, path: 'claude-code', pathSource: 'explicit' });
    expect(routeModel({ model })).toMatchObject({ ok: true, path: 'claude-code', pathSource: 'inferred' });
  });

  it('carries only the models the owner named on the metered path', () => {
    const named = OPENROUTER_ALLOWED[0];
    expect(routeModel({ model: named, path: 'openrouter' })).toMatchObject({ ok: true, path: 'openrouter', pathSource: 'explicit' });
    expect(routeModel({ model: named })).toMatchObject({ ok: true, path: 'openrouter', pathSource: 'inferred' });
    // The `~` price prefix is not part of the identity.
    expect(isOpenRouterAllowed(named.replace(/^~/, ''))).toBe(true);
  });

  it('refuses everything with no path of its own, rather than picking one', () => {
    expect(routeModel({ model: OPENROUTER_ALLOWED[0], path: 'claude-code' })).toMatchObject({ rule: 'non-anthropic-never-claude-code' });
    expect(routeModel({ model: 'meta/llama-4', path: 'openrouter' })).toMatchObject({ rule: 'openrouter-not-owner-named' });
    expect(routeModel({ model: 'meta/llama-4' })).toMatchObject({ rule: 'no-path-for-model' });
    expect(routeModel({})).toMatchObject({ rule: 'model-required' });
    expect(routeModel({ model: 'claude-opus-5', path: 'bedrock' })).toMatchObject({ rule: 'unknown-path' });
  });

  // NON-VACUITY for looksAnthropic: it must say NO to things, or the rule above
  // would be "refuse everything", which passes every refusal assertion.
  it('does not call every model Anthropic', () => {
    for (const model of ['meta/llama-4', 'openai/gpt-5', OPENROUTER_ALLOWED[0], 'mistral-large', 'claudia/model']) {
      expect(looksAnthropic(model), `${model} misclassified as Anthropic`).toBe(false);
    }
  });

  it('exposes exactly two paths', () => {
    expect([...EXECUTION_PATHS].sort()).toEqual(['claude-code', 'openrouter']);
  });

  // H4 — the allow-list is a spending authorisation, and tsc cannot protect it:
  // `scripts/` is in no tsconfig program and `checkJs` is off, so a planted
  // `push` produced zero type errors and routed an unauthorised model to the
  // metered path. Freezing turns that into a TypeError at the push.
  it('freezes both lists, so nothing can widen the metered path at runtime', () => {
    expect(Object.isFrozen(OPENROUTER_ALLOWED)).toBe(true);
    expect(Object.isFrozen(EXECUTION_PATHS)).toBe(true);
    expect(() => (OPENROUTER_ALLOWED as unknown as string[]).push('openai/gpt-5')).toThrow(TypeError);
    // And the push really did not take: the model still has no path.
    expect(routeModel({ model: 'openai/gpt-5', path: 'openrouter' })).toMatchObject({ rule: 'openrouter-not-owner-named' });
  });

  // The two structural properties an adversarial review identified as the reason
  // 45 attack inputs could not reach the metered path. Both are easy to destroy
  // by "tidying", so both are pinned.
  it('requires allow-list membership for the metered path, so an identity miss cannot cause spend', () => {
    // BOTH segments homoglyphed — Cyrillic а in "anthropic" AND Cyrillic с in
    // "claude". Homoglyphing only one is not enough, which is itself worth
    // knowing: the segment rule catches `аnthropic/claude-…` on the `claude-`
    // half alone.
    expect(looksAnthropic('аnthropic/claude-sonnet-4')).toBe(true);

    const homoglyph = 'аnthropic/сlaude-sonnet-4';
    expect(looksAnthropic(homoglyph), 'the fixture no longer defeats the identity check').toBe(false);

    // …and it STILL cannot reach the metered path, because that path requires
    // allow-list membership on top of the identity check. This is the property
    // that makes an identity miss cost an over-refusal rather than an invoice.
    expect(routeModel({ model: homoglyph, path: 'openrouter' }).ok).toBe(false);
    expect(routeModel({ model: homoglyph }).ok).toBe(false);
  });

  // R4 — the ORDER of the two checks is a safety property, and against the real
  // allow-list it is unobservable: no Anthropic model sits on it, so hoisting an
  // allow-list success branch above the Anthropic refusal left the suite green.
  //
  // Pinned through `decideRoute`, a pure predicate over the two booleans. It has
  // NO access to the allow-list, so unlike an `allowed` parameter on
  // `routeModel` this seam cannot open spend even in principle.
  it('refuses an Anthropic model on the metered path EVEN IF it is allow-listed', () => {
    const d = decideRoute({ anthropic: true, allowed: true, path: 'openrouter', id: 'claude-opus-5' });
    expect(d.ok).toBe(false);
    expect(d.rule).toBe('anthropic-never-openrouter');

    // With no path given it must still infer the SUBSCRIPTION, not the metered
    // path it is now nominally allowed on.
    expect(decideRoute({ anthropic: true, allowed: true })).toMatchObject({ ok: true, path: 'claude-code' });
  });

  it('requires allow-list membership for the metered path, so an identity miss cannot cause spend', () => {
    // The second structural property, stated over the booleans: not-Anthropic
    // and not-allowed has NO path at all.
    expect(decideRoute({ anthropic: false, allowed: false, path: 'openrouter' }).ok).toBe(false);
    expect(decideRoute({ anthropic: false, allowed: false }).ok).toBe(false);
    expect(decideRoute({ anthropic: false, allowed: true, path: 'openrouter' }).ok).toBe(true);

    // …and end to end: both segments homoglyphed defeats the identity check and
    // still cannot reach the metered path.
    expect(looksAnthropic('аnthropic/claude-sonnet-4')).toBe(true); // one segment is not enough
    const homoglyph = 'аnthropic/сlaude-sonnet-4';
    expect(looksAnthropic(homoglyph), 'the fixture no longer defeats the identity check').toBe(false);
    expect(routeModel({ model: homoglyph, path: 'openrouter' }).ok).toBe(false);
    expect(routeModel({ model: homoglyph }).ok).toBe(false);
  });

  it('exposes no way to widen the allow-list through the routing entry point', () => {
    // `routeModel` takes model and path, and nothing else. A third argument that
    // could supply an allow-list would be a widening seam on a spend control.
    expect(routeModel.length).toBeLessThanOrEqual(1);
    expect(isOpenRouterAllowed.length).toBe(1);
    expect(routeModel({ model: 'meta/llama-4', path: 'openrouter', allowed: ['meta/llama-4'] } as never).ok).toBe(false);
  });

  it('records a canonical model alongside the raw one, so spellings do not fragment a comparison', () => {
    const spellings = ['claude-opus-5', 'Claude-Opus-5', '  claude-opus-5  '];
    const canonical = spellings.map((m) => {
      const d = routeModel({ model: m, path: 'claude-code' });
      if (!d.ok) throw new Error(`unexpected refusal for ${m}`);
      return d.modelCanonical;
    });
    expect(new Set(canonical).size).toBe(1);
    expect(canonical[0]).toBe('claude-opus-5');
  });
});

describe('the runner refuses before it creates anything', () => {
  it('a rule violation leaves the runs directory untouched', () => {
    const runs = fresh();
    const r = cli(['--scenario', 'S6', '--model', 'claude-opus-5', '--path', 'openrouter', '--tier', 't', '--runs-dir', runs]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('anthropic-never-openrouter');
    // A refusal that costs a directory teaches operators to work around it.
    expect(readdirSync(runs)).toEqual([]);
  });

  // I9 — the parser took any next token as a value, so `--tier --runs-dir <dir>`
  // ledgered `tier: "--runs-dir"` and swallowed the directory. Every field here
  // is compared across runs, so a swallowed argument is a corrupt measurement.
  it('refuses a flag whose value is the next flag, instead of ledgering it', () => {
    const runs = fresh();
    const r = cli(['--scenario', 'S6', '--model', 'claude-opus-5', '--tier', '--runs-dir', runs]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('--tier was given no value');
    expect(readdirSync(runs)).toEqual([]);
  });

  it('refuses a trailing flag with no value at all', () => {
    const r = cli(['--scenario', 'S6', '--model', 'claude-opus-5', '--tier', 'x', '--runs-dir']);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('--runs-dir was given no value');
  });

  it('its own positive controls all fire', () => {
    const out = execFileSync('node', [RUNNER, '--self-test'], { encoding: 'utf8' });
    expect(out).toContain('every planted fault detected');
    expect(out).not.toContain('✗');
  });
});

describe('the run ledger', () => {
  let runs: string;
  let runDir: string;
  let info: Record<string, unknown>;

  beforeAll(() => {
    runs = fresh();
    const r = cli(['--scenario', 'S6', '--model', 'claude-opus-5', '--tier', 'frontier', '--effort', 'high', '--runs-dir', runs]);
    expect(r.code, r.out).toBe(0);
    runDir = join(runs, readdirSync(runs)[0]);
    info = JSON.parse(readFileSync(join(runDir, 'run-info.json'), 'utf8'));
  });

  it('records everything a later comparison needs, INCLUDING which path ran', () => {
    expect(info).toMatchObject({
      scenarioId: 'S6',
      model: 'claude-opus-5',
      tier: 'frontier',
      effort: 'high',
      executionPath: 'claude-code',
      pathSource: 'inferred',
      status: 'prepared',
    });
    expect(String(info.date)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The PACK's version, which is what a comparison has to hold constant.
    const packed = JSON.parse(readFileSync(join(runDir, 'pack', 'judge', 'catalog.json'), 'utf8'));
    expect(info.kitVersion).toBe(packed.kitVersion);
    expect(String(info.handoverDigest)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('hands over agent/ only, and puts it outside the runs directory', () => {
    const handover = String(info.handoverDir);
    expect(existsSync(handover)).toBe(true);

    // Outside, so `..` from the handover reaches no judge material and no
    // sibling run. This is the property `<run>/agent` could never have.
    expect(relative(runs, handover).startsWith('..')).toBe(true);

    const under = (root: string): string[] => {
      const out: string[] = [];
      const walk = (d: string, prefix: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const rel = prefix ? `${prefix}/${e.name}` : e.name;
          if (e.isDirectory()) walk(join(d, e.name), rel);
          else out.push(rel);
        }
      };
      walk(root, '');
      return out.sort();
    };

    expect(under(handover)).toEqual(under(join(runDir, 'pack', 'agent')));
    expect(under(handover).some((f) => /judge/i.test(f))).toBe(false);
    expect(existsSync(join(handover, 'PACK.md'))).toBe(false);

    // POSITIVE CONTROL: the judge material really does exist one level up in the
    // pack, so "no judge file in the handover" is a fact about the copy and not
    // about a pack that never had one.
    expect(existsSync(join(runDir, 'pack', 'judge', 'JUDGE.md'))).toBe(true);
  });

  it('no scoring line from ANY scenario survives into the handover', () => {
    const handover = String(info.handoverDir);
    const all = readdirSync(handover, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => readFileSync(join(e.parentPath ?? handover, e.name), 'utf8'))
      .join('\n');
    for (const s of listScenarios()) {
      for (const line of s.scoring) expect(all.includes(line), `${s.id} scoring line reached the agent: ${line}`).toBe(false);
    }
    // NON-VACUITY: the same lines ARE present in the judge material, so the scan
    // is looking at text that could have contained them.
    const judge = readFileSync(join(runDir, 'pack', 'judge', 'JUDGE.md'), 'utf8');
    const s6 = listScenarios().find((s) => s.id === 'S6')!;
    expect(judge).toContain(s6.scoring[0]);
  });
});

describe('handover hygiene', () => {
  // I6 — "`..` reaches no answer key" was a property of the TMPDIR default, not
  // of the check: only a handover INSIDE runsDir was refused, so a sibling
  // directory with run material two levels up was accepted.
  it('refuses a handover with run material anywhere above it, not just inside runs-dir', () => {
    const base = fresh();
    const runs = join(base, 'runs');
    const handover = join(base, 'handovers', 'S6');
    const source = join(base, 'src');
    mkdirSync(runs, { recursive: true });
    mkdirSync(handover, { recursive: true });
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'README.md'), '# pack\n');
    writeFileSync(join(handover, 'README.md'), '# pack\n');

    // Clean while the ancestor holds nothing of ours…
    expect(verifyHandover({ handoverDir: handover, sourceDir: source, runsDir: runs, scoringLines: [] }).ok).toBe(true);

    // …and refused once it does. `base` is an ancestor of the handover and is
    // NOT inside runsDir, which is the case the first version waved through.
    writeFileSync(join(base, 'PACK.md'), '# pack root\n');
    const r = verifyHandover({ handoverDir: handover, sourceDir: source, runsDir: runs, scoringLines: [] });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('an ancestor of the handover');
  });

  // R5 — the first version of this test could not fail: it passed an explicit
  // --handover (so `ownsHandover` is false and the prune is skipped BY DESIGN)
  // and asserted `after <= before` over a shared TMPDIR, which is true
  // unconditionally. It is now driven through the DEFAULT handover, and asserts
  // the exact directory the ledger names is gone.
  it.each([
    ['a transport with no runAgent export', 'export const nothing = 1;\n', 'transport-invalid'],
    ['a transport that throws', 'export async function runAgent() { throw new Error("no key"); }\n', 'transport-failed'],
  ])('removes the handover it created when the run fails: %s', (_label, moduleSource, expectedStatus) => {
    const runs = fresh();
    const mod = join(fresh(), 'transport.mjs');
    writeFileSync(mod, moduleSource);

    const r = cli(['--scenario', 'S7', '--model', 'claude-opus-5', '--tier', 't', '--runs-dir', runs, '--exec', mod]);
    expect(r.code).not.toBe(0);

    const info = JSON.parse(readFileSync(join(runs, readdirSync(runs)[0], 'run-info.json'), 'utf8'));
    expect(info.status).toBe(expectedStatus);
    // The specific directory, not a count over a shared TMPDIR.
    expect(String(info.handoverDir)).toContain('kai-handover-');
    expect(existsSync(info.handoverDir), `${info.handoverDir} survived a failed run`).toBe(false);
    // …and the ledger says it was removed on purpose, so it does not merely
    // point at a directory that is mysteriously gone.
    expect(info.handoverPruned).toBe(true);
  });

  it('keeps the handover when the run SUCCEEDS, because the agent still has to read it', () => {
    const runs = fresh();
    const r = cli(['--scenario', 'S7', '--model', 'claude-opus-5', '--tier', 't', '--runs-dir', runs]);
    expect(r.code, r.out).toBe(0);
    const info = JSON.parse(readFileSync(join(runs, readdirSync(runs)[0], 'run-info.json'), 'utf8'));
    expect(existsSync(info.handoverDir)).toBe(true);
    expect(info.handoverPruned).toBeUndefined();
  });

  it('prunes handovers no ledger references, and keeps the ones that are referenced', () => {
    const runs = fresh();
    const r = cli(['--scenario', 'S7', '--model', 'claude-opus-5', '--tier', 't', '--runs-dir', runs]);
    expect(r.code, r.out).toBe(0);
    const info = JSON.parse(readFileSync(join(runs, readdirSync(runs)[0], 'run-info.json'), 'utf8'));
    expect(existsSync(info.handoverDir)).toBe(true);

    // An orphan with our prefix, referenced by nothing.
    const orphan = mkdtempSync(join(tmpdir(), 'kai-handover-orphan-'));
    writeFileSync(join(orphan, 'README.md'), 'debris\n');

    const p = cli(['--prune-handovers', runs]);
    expect(p.code, p.out).toBe(0);
    expect(existsSync(orphan), 'the orphan survived the sweep').toBe(false);
    expect(existsSync(info.handoverDir), 'a referenced handover was destroyed').toBe(true);
  });
});

describe('the transport seam', () => {
  it('is given the handover and the output directory, and nothing that locates the answer key', () => {
    const runs = fresh();
    const mod = join(fresh(), 'fake-transport.mjs');
    const captured = join(fresh(), 'request.json');
    writeFileSync(
      mod,
      `import { writeFileSync } from 'node:fs';
export async function runAgent(request) {
  writeFileSync(${JSON.stringify(captured)}, JSON.stringify(request, null, 2));
  return { files: [{ name: 'main.ts', text: 'export const x = 1;\\n' }], transcript: 'did the thing', meta: { tokens: 42 } };
}
`,
    );
    const r = cli(['--scenario', 'S7', '--model', 'claude-opus-5', '--tier', 'frontier', '--runs-dir', runs, '--exec', mod]);
    expect(r.code, r.out).toBe(0);

    const request = JSON.parse(readFileSync(captured, 'utf8')) as Record<string, string>;
    expect(Object.keys(request).sort()).toEqual(
      ['effort', 'executionPath', 'handoverDir', 'model', 'outputDir', 'runId', 'scenarioId'].sort(),
    );
    // A transport cannot leak the answer key by accident because it is never
    // told where the answer key is.
    const values = JSON.stringify(request);
    expect(values).not.toContain('judge');
    expect(values).not.toContain('/pack');

    const runDir = join(runs, readdirSync(runs)[0]);
    const info = JSON.parse(readFileSync(join(runDir, 'run-info.json'), 'utf8'));
    expect(info.status).toBe('ran');
    expect(readFileSync(join(runDir, 'output', 'main.ts'), 'utf8')).toContain('export const x');
    expect(readFileSync(join(runDir, 'output', 'TRANSCRIPT.md'), 'utf8')).toBe('did the thing');
  });

  it('records a thrown transport as failed rather than leaving the run looking prepared', () => {
    const runs = fresh();
    const mod = join(fresh(), 'throwing-transport.mjs');
    writeFileSync(mod, 'export async function runAgent() { throw new Error("no key configured"); }\n');
    const r = cli(['--scenario', 'S7', '--model', 'claude-opus-5', '--tier', 'frontier', '--runs-dir', runs, '--exec', mod]);
    expect(r.code).not.toBe(0);
    const runDir = join(runs, readdirSync(runs)[0]);
    const info = JSON.parse(readFileSync(join(runDir, 'run-info.json'), 'utf8'));
    expect(info.status).toBe('transport-failed');
    expect(String(info.transport.error)).toContain('no key configured');
  });
});
