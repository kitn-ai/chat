import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  classifyKit,
  distExportTargets,
  distProblem,
  isSourceCheckout,
  localKitStartDir,
  resolveKitPackageRoot,
  unbuiltMessage,
} from './local-kit';

// packages/ui, two levels up from this file.
const PKG_ROOT = resolve(import.meta.dirname, '../..');

function write(path: string, body: string, mtimeSeconds?: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  if (mtimeSeconds !== undefined) utimesSync(path, mtimeSeconds, mtimeSeconds);
}

/** Every file the checkout markers and the dist checks look for, with an
 *  exports map small enough to read. `OLD`/`NEW` keep the staleness axis
 *  explicit instead of racing the clock. */
const OLD = 1_700_000_000;
const NEW = 1_700_000_100;

function synthCheckout(opts: { built?: boolean; sourceMtime?: number } = {}): string {
  const workspace = mkdtempSync(join(tmpdir(), 'kai-checkout-'));
  write(join(workspace, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  const pkgRoot = join(workspace, 'packages', 'ui');
  write(
    join(pkgRoot, 'package.json'),
    JSON.stringify({ name: '@kitn.ai/ui', version: '9.9.9', exports: { '.': { default: './dist/index.js' } } }),
    OLD,
  );
  write(join(pkgRoot, 'src', 'agent-tooling', 'construct', 'cli.ts'), '// the CLI source', opts.sourceMtime ?? OLD);
  if (opts.built !== false) write(join(pkgRoot, 'dist', 'index.js'), 'export const x = 1;\n', OLD + 50);
  return pkgRoot;
}

/** What an installed package looks like: `node_modules/@kitn.ai/ui`, dist and
 *  bin present, no .ts under src/agent-tooling. */
function synthInstall(opts: { consumerIsAPnpmWorkspace?: boolean } = {}): string {
  const consumer = mkdtempSync(join(tmpdir(), 'kai-consumer-'));
  write(join(consumer, 'package.json'), JSON.stringify({ name: 'some-app' }));
  if (opts.consumerIsAPnpmWorkspace) write(join(consumer, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
  const pkgRoot = join(consumer, 'node_modules', '@kitn.ai', 'ui');
  write(
    join(pkgRoot, 'package.json'),
    JSON.stringify({ name: '@kitn.ai/ui', version: '0.30.0', exports: { '.': { default: './dist/index.js' } } }),
  );
  write(join(pkgRoot, 'dist', 'index.js'), 'export const x = 1;\n');
  // The two src json files the published tarball really does carry — proof
  // that "src/ exists" is not what the detection keys on.
  write(join(pkgRoot, 'src', 'elements', 'element-meta.json'), '{}');
  write(join(pkgRoot, 'src', 'elements', 'icon-names.json'), '[]');
  return pkgRoot;
}

describe('resolveKitPackageRoot', () => {
  it('finds the package root by NAME, from any depth below it', () => {
    const pkgRoot = synthCheckout();
    for (const start of [pkgRoot, join(pkgRoot, 'dist'), join(pkgRoot, 'src', 'agent-tooling', 'construct')]) {
      const out = resolveKitPackageRoot(start);
      expect('dir' in out && out.dir, start).toBe(pkgRoot);
    }
  });

  it('walks past a package.json belonging to something else', () => {
    const pkgRoot = synthCheckout();
    // Rollup can split this module into dist/assets/ — a directory that in a
    // real install sits under a package.json that is NOT the kit's.
    write(join(pkgRoot, 'dist', 'assets', 'package.json'), JSON.stringify({ name: 'not-the-kit' }));
    const out = resolveKitPackageRoot(join(pkgRoot, 'dist', 'assets'));
    expect('dir' in out && out.dir).toBe(pkgRoot);
  });

  it('reports what it tried when there is no kit above the start', () => {
    const out = resolveKitPackageRoot(mkdtempSync(join(tmpdir(), 'kai-nothing-')));
    expect('tried' in out && out.tried.length).toBeGreaterThan(0);
  });

  it('finds THIS checkout from where the module really lives', () => {
    const out = resolveKitPackageRoot(localKitStartDir());
    expect('dir' in out && out.dir).toBe(PKG_ROOT);
  });
});

describe('isSourceCheckout — the marker that must be true in a checkout and false in an install', () => {
  it('true for a checkout', () => {
    expect(isSourceCheckout(synthCheckout())).toBe(true);
  });

  it('true for THIS repo', () => {
    expect(isSourceCheckout(PKG_ROOT)).toBe(true);
  });

  it('false for an installed package', () => {
    expect(isSourceCheckout(synthInstall())).toBe(false);
  });

  it('false for an installed package inside a consumer that is ITSELF a pnpm workspace', () => {
    // The workspace manifest sits above node_modules/, never inside it — the
    // failure this case exists to rule out is a consumer monorepo being
    // mistaken for the kit's own checkout.
    expect(isSourceCheckout(synthInstall({ consumerIsAPnpmWorkspace: true }))).toBe(false);
  });

  it('false for a hand-extracted tarball that happens to sit two levels under a workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'kai-extracted-'));
    write(join(workspace, 'pnpm-workspace.yaml'), 'packages: []\n');
    const pkgRoot = join(workspace, 'vendor', 'ui');
    write(join(pkgRoot, 'package.json'), JSON.stringify({ name: '@kitn.ai/ui', version: '0.30.0' }));
    write(join(pkgRoot, 'dist', 'index.js'), '');
    expect(isSourceCheckout(pkgRoot)).toBe(false);
  });
});

describe('classifyKit', () => {
  it('a checkout with a built dist defaults to the LOCAL build', () => {
    const pkgRoot = synthCheckout();
    expect(classifyKit(undefined, pkgRoot)).toEqual({ kind: 'checkout', pkgRoot });
  });

  it('an installed package keeps the PUBLISHED spec', () => {
    const out = classifyKit(undefined, synthInstall());
    expect(out.kind).toBe('published');
  });

  it('--ui wins in a checkout', () => {
    expect(classifyKit('file:/tmp/x.tgz', synthCheckout())).toEqual({ kind: 'explicit', uiSpec: 'file:/tmp/x.tgz' });
  });

  it('--ui wins in an install', () => {
    expect(classifyKit('^0.29.0', synthInstall())).toEqual({ kind: 'explicit', uiSpec: '^0.29.0' });
  });

  it('--ui wins even when the checkout has no build at all', () => {
    // The override must not be gated on the thing it exists to replace.
    const pkgRoot = synthCheckout({ built: false });
    expect(classifyKit('0.29.0', pkgRoot)).toEqual({ kind: 'explicit', uiSpec: '0.29.0' });
  });

  it('nowhere near a kit package: published, never a crash', () => {
    expect(classifyKit(undefined, mkdtempSync(join(tmpdir(), 'kai-nothing-'))).kind).toBe('published');
  });

  it('an unbuilt checkout is FATAL, not a fallback to the version that crashes', () => {
    const pkgRoot = synthCheckout({ built: false });
    const out = classifyKit(undefined, pkgRoot);
    expect(out.kind).toBe('unbuilt');
    if (out.kind !== 'unbuilt') throw new Error('unreachable');
    expect(unbuiltMessage(out)).toContain('nx build ui');
    expect(unbuiltMessage(out)).toContain('--ui');
  });

  it('a checkout whose SOURCE is newer than its build is stale, and says which file', () => {
    const pkgRoot = synthCheckout({ sourceMtime: NEW });
    const out = classifyKit(undefined, pkgRoot);
    expect(out.kind).toBe('unbuilt');
    if (out.kind !== 'unbuilt') throw new Error('unreachable');
    expect(out.problem).toContain('cli.ts');
    expect(out.problem).toContain('stale');
  });

  it('a newer TEST or STORY file is not staleness — neither changes what the kit exports', () => {
    const pkgRoot = synthCheckout();
    write(join(pkgRoot, 'src', 'components', 'thing.test.tsx'), '// test', NEW);
    write(join(pkgRoot, 'src', 'components', 'thing.stories.tsx'), '// story', NEW);
    expect(classifyKit(undefined, pkgRoot).kind).toBe('checkout');
  });

  it('a newer build-GENERATED json under src/ is not staleness (postbuild writes those)', () => {
    const pkgRoot = synthCheckout();
    write(join(pkgRoot, 'src', 'elements', 'element-meta.json'), '{}', NEW);
    write(join(pkgRoot, 'src', 'agent-tooling', 'construct', 'construct.v1.schema.json'), '{}', NEW);
    write(join(pkgRoot, 'src', 'elements', 'compiled.css'), '.a{}', NEW);
    expect(classifyKit(undefined, pkgRoot).kind).toBe('checkout');
  });
});

describe('distProblem', () => {
  it('null for a built checkout', () => {
    expect(distProblem(synthCheckout())).toBeNull();
  });

  it('names the missing entry points when the exports map points at files that are not there', () => {
    const pkgRoot = synthCheckout();
    write(
      join(pkgRoot, 'package.json'),
      JSON.stringify({
        name: '@kitn.ai/ui',
        version: '9.9.9',
        exports: { '.': { default: './dist/index.js' }, './wire': { default: './dist/wire.js' } },
      }),
      OLD,
    );
    expect(distProblem(pkgRoot)).toContain('./dist/wire.js');
  });

  it('THIS repo declares its entry points and they resolve (or the build is genuinely absent)', () => {
    const problem = distProblem(PKG_ROOT);
    // A checkout mid-edit is legitimately stale; what must never happen is a
    // MISSING-entry-point report against a real build.
    expect(problem === null || /stale|never been built/.test(problem)).toBe(true);
  });
});

describe('distExportTargets — derived from the manifest, never a typed list', () => {
  it('collects every concrete ./dist target across condition nesting, and skips wildcards', () => {
    const targets = distExportTargets({
      exports: {
        '.': { types: './dist/index.d.ts', node: './dist/index.server.js', default: './dist/index.js' },
        './elements/*': { default: './dist/elements/*.js' },
        './theme.css': './theme.css',
      },
    });
    expect(new Set(targets)).toEqual(new Set(['./dist/index.d.ts', './dist/index.server.js', './dist/index.js']));
  });

  it('is empty, not a throw, for a manifest with no exports', () => {
    expect(distExportTargets({})).toEqual([]);
    expect(distExportTargets(null)).toEqual([]);
  });
});

// Windows structural fix (verifier-found, 2026-08-31): since Node's
// CVE-2024-27980 hardening, spawning a .cmd/.bat without `shell: true` throws
// EINVAL — on the child's 'error' event, not 'exit' — so every npm spawn in
// the construct CLI resolves its invocation here. No Windows box runs this
// suite; both branches are graded structurally via the platform parameter.
describe('npmInvocation — how npm is spawned per platform', () => {
  it('win32 gets npm.cmd with shell: true; everything else plain npm without a shell', async () => {
    const { npmInvocation } = await import('./local-kit');
    expect(npmInvocation('win32')).toEqual({ command: 'npm.cmd', shell: true });
    expect(npmInvocation('darwin')).toEqual({ command: 'npm', shell: false });
    expect(npmInvocation('linux')).toEqual({ command: 'npm', shell: false });
  });

  it('npmArgs quotes whitespace-bearing arguments only when a shell is in play', async () => {
    const { npmArgs } = await import('./local-kit');
    const args = ['pack', '--pack-destination', 'C:\\Users\\Some Name\\stage'];
    expect(npmArgs(args, true)).toEqual(['pack', '--pack-destination', '"C:\\Users\\Some Name\\stage"']);
    expect(npmArgs(args, false)).toBe(args); // untouched, same reference — no accidental rewriting off-shell
  });
});
