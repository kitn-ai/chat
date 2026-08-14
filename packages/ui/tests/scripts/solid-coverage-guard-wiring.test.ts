/**
 * GUARD — `verify-solid-coverage` still DETECTS, and CI still runs it.
 *
 * The guard itself fails the build when a registered element has no writable SolidJS
 * equivalent, or when a public component ships no public `<Name>Props` type. Solid is
 * the authored layer here, so an element whose Solid surface is unreachable is a hole
 * in the source of truth, not a Solid-only inconvenience.
 *
 * WHY IT NEEDS THIS. Every verdict comes out of the TypeScript checker resolving real
 * symbols: JSX tag to declaring module, module export to public entry, public entry
 * intersected with the runtime keys of the BUILT bundle. If any of that resolution
 * quietly stops working — a moved directory, a changed tsconfig, an entry that no
 * longer re-exports — the counts move but the shape of the output does not, and
 * "80/80 elements have a writable SolidJS equivalent" prints either way. A resolver
 * that resolves nothing reports total coverage of nothing.
 *
 * Each case below runs the script as a subprocess, with NO `--self-test` flag, against
 * a synthesized package with real .tsx facades, a real src/solid.ts and real built
 * entries.
 *
 * Watched failing: making `isPublic` always true turns the GAP cases red; dropping
 * `--self-test` from the npm script or the step from CI turns the wiring cases red.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/verify-solid-coverage.mjs';
const NPM_SCRIPT = 'verify:solid-coverage';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/** Same crude job extraction as tests/scripts/silent-drop-guard-wiring.test.ts. */
function jobBlock(yaml: string, job: string): string {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}[A-Za-z0-9_-]+:/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

const TSCONFIG = {
  compilerOptions: {
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'preserve',
    skipLibCheck: true,
    noEmit: true,
    allowJs: true,
  },
  include: ['src'],
};

/** A throwaway package the guard can be pointed at with `--package-root`. */
function fixtureRoot(over: Record<string, string | null> = {}): string {
  const files: Record<string, string | null> = {
    'tsconfig.json': JSON.stringify(TSCONFIG, null, 2),
    'src/components/foo.tsx':
      'export type FooProps = { a?: string };\nexport function Foo(props: FooProps) { return <div>{props.a}</div>; }\n',
    'src/elements/define.tsx':
      'export function defineWebComponent(tag: string, props: unknown, render: unknown) { return { tag, props, render }; }\n',
    'src/elements/x.tsx':
      "import { defineWebComponent } from './define';\nimport { Foo } from '../components/foo';\ndefineWebComponent('kai-x', {}, () => <Foo a=\"hi\" />);\n",
    'src/elements/element-meta.json': JSON.stringify([{ tag: 'kai-x', displayName: 'X' }], null, 2),
    'src/index.ts': 'export const version = "1";\n',
    'src/solid.ts':
      "export * from './index';\nexport { Foo } from './components/foo';\nexport type { FooProps } from './components/foo';\n",
    'dist/solid.server.js': 'export const version = "1";\nexport const Foo = () => null;\n',
    'dist/index.server.js': 'export const version = "1";\n',
    ...over,
  };
  const root = mkdtempSync(join(tmpdir(), 'solid-coverage-guard-'));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

function runGuard(args: string[]): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', [resolve(pkgRoot, SCRIPT), ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('the solid-coverage guard detects, and CI runs it', () => {
  it('ships the guard', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the check`, () => {
    const cmd = pkg.scripts[NPM_SCRIPT];
    expect(cmd, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      cmd,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. Every verdict here depends on the TS checker ` +
        `resolving symbols; a resolver that resolves nothing reports total coverage of nothing, and ` +
        `prints the same success line either way.`,
    ).toContain('--self-test');
    expect(cmd, `\`${NPM_SCRIPT}\` no longer runs the check itself`).toContain(SCRIPT);
  });

  it('is invoked by the REQUIRED `test` job in CI', () => {
    const block = jobBlock(readFileSync(WORKFLOW, 'utf-8'), 'test');
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(block, 'the `test` job no longer runs the unit project either — read this guard').toContain(
      '--project=unit',
    );
    expect(
      block,
      `the \`test\` job does not run \`${NPM_SCRIPT}\`. Nothing else checks that a registered element ` +
        `is writable in the authored layer.`,
    ).toContain(NPM_SCRIPT);
  });

  it('passes on a synthesized package whose element renders a public component', () => {
    const { code, output } = runGuard(['--package-root', fixtureRoot()]);
    expect(code, `the guard failed a package with nothing wrong with it: ${output}`).toBe(0);
    expect(output).toContain('1/1 elements have a writable SolidJS equivalent');
  });

  it('fires when the element renders a component ./solid does not export', () => {
    const root = fixtureRoot({
      'src/solid.ts': "export * from './index';\n",
      'dist/solid.server.js': 'export const version = "1";\n',
    });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on an element with no Solid surface`).not.toBe(0);
    expect(output).toContain('no writable SolidJS equivalent');
    expect(output, 'the unreachable symbol is not named').toContain('Foo');
  });

  it('fires when a source export does not survive the build', () => {
    // The runtime cross-check against the BUILT entry is the load-bearing half:
    // src/solid.ts looks perfect here and the export is still not public.
    const root = fixtureRoot({ 'dist/solid.server.js': 'export const version = "1";\n' });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on an export missing from the built entry`).not.toBe(0);
    expect(output).toContain('no writable SolidJS equivalent');
  });

  it('fires when "." exports something ./solid does not', () => {
    const root = fixtureRoot({
      'dist/index.server.js': 'export const version = "1";\nexport const OnlyInRoot = () => null;\n',
    });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on a broken superset relation`).not.toBe(0);
    expect(output).toContain('MISSING from ./solid');
    expect(output).toContain('OnlyInRoot');
  });

  it('fires when a public component ships no <Name>Props type', () => {
    const root = fixtureRoot({
      'src/components/foo.tsx': 'export function Foo(props: { a?: string }) { return <div>{props.a}</div>; }\n',
      'src/solid.ts': "export * from './index';\nexport { Foo } from './components/foo';\n",
    });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on a component with no props type`).not.toBe(0);
    expect(output).toContain('ship no public <Name>Props type');
  });

  it('treats an empty element catalog as a failure, not 0/0 success', () => {
    // Every row is derived from the catalog, so an empty one produced no rows, no
    // gaps, and a cheerful "0/0 elements have a writable SolidJS equivalent".
    const root = fixtureRoot({ 'src/elements/element-meta.json': '[]' });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, 'an empty catalog exited 0, reporting coverage of nothing').not.toBe(0);
    expect(output).toContain('EMPTY CATALOG');
  });
});
