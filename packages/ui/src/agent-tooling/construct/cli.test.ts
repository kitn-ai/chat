import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runCli } from './cli';

const good = { name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } };

// packages/ui, three levels up from this file.
const PKG_ROOT = resolve(import.meta.dirname, '../../..');
// Gitignored (`.kai-test-cache/` — see .gitignore), derived, never committed.
const PACK_CACHE_DIR = join(PKG_ROOT, '.kai-test-cache');

/**
 * The tarball `compile`'s integration test installs against, packed from
 * THIS checkout's own built dist/ — never a hand-placed evidence file (that
 * would be gitignored and red on any fresh clone/CI, the repo's most
 * expensive repeat trap). npm's currently-published @kitn.ai/ui doesn't ship
 * ./define yet, so a bare `npm install` would resolve a version this
 * branch's own codegen can't build against; packing the local build is the
 * honest way to get a spec that has it.
 *
 * Cached by version under a gitignored dir inside packages/ui so repeat runs
 * (and both `compile` tests, if a second one lands) don't re-pack. When
 * dist/ is missing, fails loudly with the exact fix — same convention as
 * the MCP manifest tests' "Missing build artifact" — never a silent skip.
 */
function packedUiTarball(): string {
  const distDir = join(PKG_ROOT, 'dist');
  if (!existsSync(distDir)) {
    throw new Error(
      `Missing build artifact: ${distDir}\n` +
        `The 'kai compile' integration test packs @kitn.ai/ui from this checkout's ` +
        `own dist/ (npm's published version doesn't ship ./define yet). Run ` +
        `\`nx build ui\` (or \`npm run build:api\` in packages/ui) and try again.`,
    );
  }
  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as { version: string };
  const tarballPath = join(PACK_CACHE_DIR, `kitn.ai-ui-${pkg.version}.tgz`);
  if (!existsSync(tarballPath)) {
    mkdirSync(PACK_CACHE_DIR, { recursive: true });
    execFileSync('npm', ['pack', '--silent', '--pack-destination', PACK_CACHE_DIR], { cwd: PKG_ROOT });
  }
  return tarballPath;
}

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
      // Pin --ui to a tarball packed from this checkout's own build: npm's
      // currently-published @kitn.ai/ui doesn't ship ./define yet, so a bare
      // `npm install` in the generated workdir would resolve a version this
      // repo's own codegen can't build against. Task 15's fixture-compiling
      // gate exercises the real default.
      const code = await runCli(['compile', tmpConstruct(good), out, '--ui', `file:${packedUiTarball()}`], io);
      expect(code).toBe(0);
      const js = readFileSync(join(out, 'acme-support.js'), 'utf8');
      expect(js).toContain('acme-support'); // the tag registered by the inlined defineWebComponent
      expect(existsSync(join(out, 'acme-support.d.ts'))).toBe(true);
      expect(existsSync(join(out, 'source', 'src', 'App.tsx'))).toBe(true);
    },
    240_000,
  );
});
