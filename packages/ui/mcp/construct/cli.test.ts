import { describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  readFileSync,
  mkdirSync,
  utimesSync,
  renameSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  runCli,
  homeRecentConversationWarning,
  parseDevArgs,
  workSurfaceProjectionNotice,
  splitWithoutWorkSurfaceNotice,
} from './cli';
import { distFingerprint } from './local-kit';
import { validateConstruct } from './schema';

const good = { name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } };

/**
 * Passed by every eject test that is about eject's OUTPUT rather than about
 * which kit gets installed.
 *
 * Since 2026-08-30 an omitted `--ui` means "decide" — and inside this
 * checkout that decision is `pack this build`, which needs a current dist/
 * and is fatal without one (local-kit.ts). A test of file writing that goes
 * red because the tree has not been rebuilt is a test measuring the wrong
 * thing; `--ui` pins the axis these tests do not care about. The decision
 * itself is graded in local-kit.test.ts against synthetic checkout and
 * install trees, where both directions are reachable on any machine.
 */
const PINNED_UI = 'file:./kitn.ai-ui-0.0.0-test.tgz';

// packages/ui, two levels up from this file.
const PKG_ROOT = resolve(import.meta.dirname, '../..');
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
 * Cached under a gitignored dir inside packages/ui, keyed by version AND
 * dist/'s content fingerprint — `local-kit.ts`'s `distFingerprint`, imported
 * rather than re-implemented, because since 2026-08-30 the CLI itself packs
 * and content-keys this checkout's build the same way and for the same
 * reason. Two copies of that rule with nothing relating them is exactly how
 * one of them goes quietly wrong. Repeat runs with an
 * unchanged build don't re-pack, but a rebuilt dist/ with the same version
 * (the normal mid-branch case) does. When dist/ is missing, fails loudly
 * with the exact fix — same convention as the MCP manifest tests' "Missing
 * build artifact" — never a silent skip.
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
  const fingerprint = distFingerprint(distDir);
  const tarballPath = join(PACK_CACHE_DIR, `kitn.ai-ui-${pkg.version}-${fingerprint}.tgz`);
  if (!existsSync(tarballPath)) {
    mkdirSync(PACK_CACHE_DIR, { recursive: true });
    // `npm pack` names its own output (kitn.ai-ui-<version>.tgz — the scoped
    // package's plain convention, no room for our fingerprint suffix), so
    // pack under that name and rename into our content-keyed filename
    // afterward, rather than trying to steer npm's naming.
    execFileSync('npm', ['pack', '--silent', '--pack-destination', PACK_CACHE_DIR], { cwd: PKG_ROOT });
    const packedName = join(PACK_CACHE_DIR, `kitn.ai-ui-${pkg.version}.tgz`);
    renameSync(packedName, tarballPath);
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
    expect(await runCli(['eject', tmpConstruct(good), out, '--ui', PINNED_UI], io)).toBe(0);
    expect(existsSync(join(out, 'src/App.tsx'))).toBe(true);
    expect(readFileSync(join(out, 'package.json'), 'utf8')).toContain('"acme-support"');
  });

  it('eject: missing outDir prints usage and exits 2 — not a silent 1', async () => {
    const { io, lines } = collect();
    const code = await runCli(['eject', tmpConstruct(good)], io);
    expect(code).toBe(2);
    expect(lines.join('\n')).toMatch(/usage/i);
  });

  it('eject: re-ejecting over CHANGED files says so before the success line; a byte-identical re-eject stays quiet', async () => {
    const out = mkdtempSync(join(tmpdir(), 'kai-eject-'));
    const path = tmpConstruct(good);
    const first = collect();
    expect(await runCli(['eject', path, out, '--ui', PINNED_UI], first.io)).toBe(0);

    // Byte-identical re-eject: writeProject skips every file (no mtime bump —
    // a rewritten vite.config.ts restarts a running preview server), so
    // nothing was really overwritten and the notice would be a false alarm.
    const identical = collect();
    expect(await runCli(['eject', path, out, '--ui', PINNED_UI], identical.io)).toBe(0);
    expect(identical.lines.some((l) => /overwriting \d+ existing file/i.test(l))).toBe(false);

    // Hand-edit one generated file, re-eject: THAT is a real clobber of the
    // caller's edit, and the loud notice lands before the success line.
    writeFileSync(join(out, 'src/App.tsx'), '// hand-edited\n');
    const second = collect();
    expect(await runCli(['eject', path, out, '--ui', PINNED_UI], second.io)).toBe(0);
    const overwriteIdx = second.lines.findIndex((l) => /overwriting 1 existing file/i.test(l));
    const ejectedIdx = second.lines.findIndex((l) => /^ejected/.test(l));
    expect(overwriteIdx).toBeGreaterThanOrEqual(0);
    expect(ejectedIdx).toBeGreaterThan(overwriteIdx);
  });

  it('eject: an unparseable accent prints the contrast NOTICE before the success line', async () => {
    const out = mkdtempSync(join(tmpdir(), 'kai-eject-'));
    const { io, lines } = collect();
    const construct = { ...good, theme: { accent: 'var(--brand)', mode: 'system' } };
    expect(await runCli(['eject', tmpConstruct(construct), out, '--ui', PINNED_UI], io)).toBe(0);
    const noticeIdx = lines.findIndex((l) => /not parseable for contrast/.test(l));
    const ejectedIdx = lines.findIndex((l) => /^ejected/.test(l));
    expect(noticeIdx).toBeGreaterThanOrEqual(0);
    expect(ejectedIdx).toBeGreaterThan(noticeIdx);
  });

  it('eject: --ui <spec> flows into the emitted package.json dependency, same parse as dev/compile', async () => {
    const out = mkdtempSync(join(tmpdir(), 'kai-eject-ui-'));
    const { io } = collect();
    const spec = PINNED_UI;
    expect(await runCli(['eject', tmpConstruct(good), out, '--ui', spec], io)).toBe(0);
    expect(readFileSync(join(out, 'package.json'), 'utf8')).toContain(spec);
  });

  it('unknown subcommand: exit 2 with usage', async () => {
    const { io, lines } = collect();
    expect(await runCli(['frobnicate'], io)).toBe(2);
    expect(lines.join('\n')).toMatch(/usage/i);
  });

  it('distFingerprint (the pack-cache key): changes when dist/ content changes, independent of any version string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-fingerprint-'));
    writeFileSync(join(dir, 'index.js'), 'export const x = 1;');
    const before = distFingerprint(dir);

    // The normal mid-branch case a version-only key would miss: dist/
    // rebuilt (same file, new content) with nothing about "version" in
    // sight — release-please only bumps package.json at merge. Force the
    // mtime forward too so this can't pass by an unlucky same-mtime write.
    writeFileSync(join(dir, 'index.js'), 'export const x = 2;');
    const future = new Date(Date.now() + 5000);
    utimesSync(join(dir, 'index.js'), future, future);

    const after = distFingerprint(dir);
    expect(after).not.toBe(before);
  });

  it('validate: warns (non-fatal, exit 0) when home.recentConversation is set without capabilities.conversations (H-3)', async () => {
    const { io, lines } = collect();
    const construct = { ...good, home: { recentConversation: true } };
    const code = await runCli(['validate', tmpConstruct(construct)], io);
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('warning:');
    expect(lines.join('\n')).toContain('home.recentConversation');
  });

  it('validate: no warning when home.recentConversation pairs with capabilities.conversations', async () => {
    const { io, lines } = collect();
    const construct = {
      ...good,
      capabilities: { conversations: true, history: { persistence: 'local' } },
      home: { recentConversation: true },
    };
    const code = await runCli(['validate', tmpConstruct(construct)], io);
    expect(code).toBe(0);
    expect(lines.join('\n')).not.toContain('warning:');
  });

  it('validate: no warning when home has no recentConversation at all', async () => {
    const { io, lines } = collect();
    const construct = { ...good, home: {} };
    const code = await runCli(['validate', tmpConstruct(construct)], io);
    expect(code).toBe(0);
    expect(lines.join('\n')).not.toContain('warning:');
  });

  it('homeRecentConversationWarning: unit-level parity with the CLI wiring above', () => {
    const withoutConversations = validateConstruct({ ...good, home: { recentConversation: true } });
    if (!withoutConversations.ok) throw new Error('expected valid construct');
    expect(homeRecentConversationWarning(withoutConversations.construct)).toContain('warning:');

    const withConversations = validateConstruct({
      ...good,
      capabilities: { conversations: true, history: { persistence: 'local' } },
      home: { recentConversation: true },
    });
    if (!withConversations.ok) throw new Error('expected valid construct');
    expect(homeRecentConversationWarning(withConversations.construct)).toBeNull();

    const noHome = validateConstruct(good);
    if (!noHome.ok) throw new Error('expected valid construct');
    expect(homeRecentConversationWarning(noHome.construct)).toBeNull();
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

describe('kai dev --builder flag parse (B-22/B-23)', () => {
  it('plain dev: path positional, no builder', () => {
    expect(parseDevArgs(['demo.construct.json'])).toEqual({ uiSpec: undefined, builder: false, path: 'demo.construct.json' });
  });
  it('--builder with no path is legal (the Start screen), with a path goes straight to the panel', () => {
    expect(parseDevArgs(['--builder'])).toEqual({ uiSpec: undefined, builder: true, path: undefined });
    expect(parseDevArgs(['--builder', 'demo.construct.json'])).toEqual({ uiSpec: undefined, builder: true, path: 'demo.construct.json' });
    expect(parseDevArgs(['demo.construct.json', '--builder'])).toEqual({ uiSpec: undefined, builder: true, path: 'demo.construct.json' });
  });
  it('--ui composes with --builder, same parse dev/compile already use', () => {
    expect(parseDevArgs(['--builder', '--ui', 'file:/x.tgz', 'demo.construct.json'])).toEqual({ uiSpec: 'file:/x.tgz', builder: true, path: 'demo.construct.json' });
  });
});

describe('work-surface notices (decide loudly)', () => {
  it('states that projection wins when a workSurface is declared', () => {
    const c = validateConstruct({
      name: 'build-workspace', layout: 'split', provider: { mode: 'mock' },
      workSurface: { kind: 'artifact', url: '/work-surface.html' },
    });
    if (!c.ok) throw new Error('fixture invalid');
    expect(workSurfaceProjectionNotice(c.construct)).toContain('slot name="pane"');
    expect(splitWithoutWorkSurfaceNotice(c.construct)).toBeNull();
  });

  it('states that a bare split has no pane until something is projected', () => {
    const c = validateConstruct({ name: 'bare-split', layout: 'split', provider: { mode: 'mock' } });
    if (!c.ok) throw new Error('fixture invalid');
    expect(splitWithoutWorkSurfaceNotice(c.construct)).toContain('stays hidden');
    expect(workSurfaceProjectionNotice(c.construct)).toBeNull();
  });

  it('says nothing on a layout that has no pane at all', () => {
    const c = validateConstruct({ name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } });
    if (!c.ok) throw new Error('fixture invalid');
    expect(workSurfaceProjectionNotice(c.construct)).toBeNull();
    expect(splitWithoutWorkSurfaceNotice(c.construct)).toBeNull();
  });
});

// Pre-merge review, 2026-08-31: packLocalKit's cache keeps ONE tarball per
// checkout and evicts the rest on every dist/ rebuild, so an ejected project
// pinning the cache's absolute path hits ENOENT on its first install after a
// rebuild. Eject vendors a copy and depends on it relatively instead.
describe('vendorLocalKit — ejected projects own their kit tarball', () => {
  it('copies the tarball into <outDir>/vendor and returns a RELATIVE file: spec, so evicting the shared cache cannot orphan the project', async () => {
    const { vendorLocalKit } = await import('./cli');
    const { rmSync } = await import('node:fs');
    const cache = mkdtempSync(join(tmpdir(), 'kai-cache-'));
    const out = mkdtempSync(join(tmpdir(), 'kai-vendor-'));
    const tarball = join(cache, 'kitn.ai-ui-0.0.0-cafebabe.tgz');
    writeFileSync(tarball, 'tarball-bytes');

    const { io, lines } = collect();
    const spec = vendorLocalKit(tarball, out, io);

    expect(spec).toBe('file:vendor/kitn.ai-ui-0.0.0-cafebabe.tgz'); // relative — never the cache's absolute path
    expect(readFileSync(join(out, 'vendor', 'kitn.ai-ui-0.0.0-cafebabe.tgz'), 'utf8')).toBe('tarball-bytes');
    expect(lines.join('\n')).toContain('vendored');

    // The eviction that used to orphan the project: the shared cache copy is
    // gone, the vendored copy still resolves from inside the project.
    rmSync(tarball, { force: true });
    expect(existsSync(join(out, 'vendor', 'kitn.ai-ui-0.0.0-cafebabe.tgz'))).toBe(true);
  });
});
