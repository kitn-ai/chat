import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runCli } from './cli';

const good = { name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } };

// npm's currently-published @kitn.ai/ui lacks ./define (that export lands
// with this branch); the local tarball is the one build with it available.
const UI_TARBALL = resolve(
  import.meta.dirname,
  '../../../../../.superpowers/sdd/2026-08-25-construct-engine/t5-evidence/kitn.ai-ui-0.26.0.tgz',
);

function tmpConstruct(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'kai-cli-'));
  const p = join(dir, 'app.construct.json');
  writeFileSync(p, JSON.stringify(body, null, 2));
  return p;
}

function collect() {
  const lines: string[] = [];
  return { io: { log: (s: string) => lines.push(s), error: (s: string) => lines.push(s) }, lines };
}

describe('kai CLI', () => {
  it('validate: exit 0 and says valid for a good construct', async () => {
    const { io, lines } = collect();
    expect(await runCli(['validate', tmpConstruct(good)], io)).toBe(0);
    expect(lines.join('\n')).toMatch(/valid/i);
  });

  it('validate: exit 1 with each problem PATH and reason for a bad one', async () => {
    const { io, lines } = collect();
    const code = await runCli(['validate', tmpConstruct({ ...good, layout: 'popup' })], io);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('layout');
  });

  it('validate: unparseable JSON is a loud, pathed failure — not a stack trace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-cli-'));
    const p = join(dir, 'broken.json');
    writeFileSync(p, '{ not json');
    const { io, lines } = collect();
    expect(await runCli(['validate', p], io)).toBe(1);
    expect(lines.join('\n')).toContain(p);
  });

  it('eject: writes the generated project and names the dir', async () => {
    const out = mkdtempSync(join(tmpdir(), 'kai-eject-'));
    const { io } = collect();
    expect(await runCli(['eject', tmpConstruct(good), out], io)).toBe(0);
    expect(existsSync(join(out, 'src/App.tsx'))).toBe(true);
    expect(readFileSync(join(out, 'package.json'), 'utf8')).toContain('"acme-support"');
  });

  it('eject: missing outDir prints usage and exits 2 — not a silent 1', async () => {
    const { io, lines } = collect();
    const code = await runCli(['eject', tmpConstruct(good)], io);
    expect(code).toBe(2);
    expect(lines.join('\n')).toMatch(/usage/i);
  });

  it('eject: re-ejecting over existing files says so before the success line', async () => {
    const out = mkdtempSync(join(tmpdir(), 'kai-eject-'));
    const path = tmpConstruct(good);
    const first = collect();
    expect(await runCli(['eject', path, out], first.io)).toBe(0);

    const second = collect();
    expect(await runCli(['eject', path, out], second.io)).toBe(0);
    const overwriteIdx = second.lines.findIndex((l) => /overwriting \d+ existing file/i.test(l));
    const ejectedIdx = second.lines.findIndex((l) => /^ejected/.test(l));
    expect(overwriteIdx).toBeGreaterThanOrEqual(0);
    expect(ejectedIdx).toBeGreaterThan(overwriteIdx);
  });

  it('eject: an unparseable accent prints the contrast NOTICE before the success line', async () => {
    const out = mkdtempSync(join(tmpdir(), 'kai-eject-'));
    const { io, lines } = collect();
    const construct = { ...good, theme: { accent: 'var(--brand)', mode: 'system' } };
    expect(await runCli(['eject', tmpConstruct(construct), out], io)).toBe(0);
    const noticeIdx = lines.findIndex((l) => /not parseable for contrast/.test(l));
    const ejectedIdx = lines.findIndex((l) => /^ejected/.test(l));
    expect(noticeIdx).toBeGreaterThanOrEqual(0);
    expect(ejectedIdx).toBeGreaterThan(noticeIdx);
  });

  it('unknown subcommand: exit 2 with usage', async () => {
    const { io, lines } = collect();
    expect(await runCli(['frobnicate'], io)).toBe(2);
    expect(lines.join('\n')).toMatch(/usage/i);
  });

  it('compile: missing path prints usage and exits 2', async () => {
    const { io, lines } = collect();
    const code = await runCli(['compile'], io);
    expect(code).toBe(2);
    expect(lines.join('\n')).toMatch(/usage/i);
  });

  // Real `npm install` + `vite build` — kept in the unit suite (not
  // it.skipIf(CI)) since it's the only place this path is exercised short of
  // Task 15's fixture-compiling gate; if CI time proves painful, revisit.
  it(
    'compile: produces one self-registering js + d.ts + the source beside it',
    async () => {
      const out = mkdtempSync(join(tmpdir(), 'kai-compile-'));
      const { io } = collect();
      // Pin --ui to the local tarball: npm's currently-published @kitn.ai/ui
      // doesn't ship ./define yet, so a bare `npm install` in the generated
      // workdir would resolve a version this repo's own codegen can't build
      // against. Task 15's fixture-compiling gate exercises the real default.
      const code = await runCli(['compile', tmpConstruct(good), out, '--ui', `file:${UI_TARBALL}`], io);
      expect(code).toBe(0);
      const js = readFileSync(join(out, 'acme-support.js'), 'utf8');
      expect(js).toContain('acme-support'); // the tag registered by the inlined defineWebComponent
      expect(existsSync(join(out, 'acme-support.d.ts'))).toBe(true);
      expect(existsSync(join(out, 'source', 'src', 'App.tsx'))).toBe(true);
    },
    240_000,
  );
});
