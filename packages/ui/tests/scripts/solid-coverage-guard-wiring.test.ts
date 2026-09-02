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
import { requiredGateBlock } from './lib/required-gate-block';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/verify-solid-coverage.mjs';
const NPM_SCRIPT = 'verify:solid-coverage';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

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
    const block = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));
    // Two vacuity guards, and they answer different questions now that the gate
    // is a GRAPH. The empty check catches a renamed root job; the `--project=unit`
    // canary catches a graph that stopped reaching the leg that runs the suite,
    // which is what a dropped `needs:` edge looks like from in here.
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(
      block,
      'the required gate graph no longer runs the unit project either -- read this guard',
    ).toContain('--project=unit');
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

  // The `solid-coverage: equivalent` directive — the reviewed facade-site
  // declaration for elements whose Solid twin shares the contract but not the
  // render path (kai-view/View). Two subprocess cases: the directive works when
  // it names a PUBLIC component, and it is not an exemption when it does not.
  const SLOT_ONLY_META = JSON.stringify(
    [{ tag: 'kai-x', displayName: 'X' }, { tag: 'kai-y', displayName: 'Y' }],
    null,
    2,
  );

  it('accepts a slot-only element whose facade declares a PUBLIC solid equivalent', () => {
    const root = fixtureRoot({
      'src/elements/y.tsx':
        "import { defineWebComponent } from './define';\n// solid-coverage: equivalent Foo -- same contract, different mechanism\ndefineWebComponent('kai-y', {}, () => <div><slot /></div>);\n",
      'src/elements/element-meta.json': SLOT_ONLY_META,
    });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard failed a package whose directive names a public component: ${output}`).toBe(0);
    expect(output).toContain('2/2 elements have a writable SolidJS equivalent');
    expect(output, 'the DECLARED verdict is not counted').toContain('DECLARED 1');
  });

  it('fires when the declared equivalent is not on the public ./solid surface', () => {
    const root = fixtureRoot({
      'src/elements/y.tsx':
        "import { defineWebComponent } from './define';\n// solid-coverage: equivalent Bar -- wishful thinking\ndefineWebComponent('kai-y', {}, () => <div><slot /></div>);\n",
      'src/elements/element-meta.json': SLOT_ONLY_META,
    });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on a directive naming a non-public component`).not.toBe(0);
    expect(output).toContain('SOLID-EQUIVALENT NOT PUBLIC');
    expect(output, 'the element must stay a GAP').toContain('no writable SolidJS equivalent');
  });

  it('fires when a directive sits on an element that is not a TOTAL gap', () => {
    const root = fixtureRoot({
      'src/elements/x.tsx':
        "import { defineWebComponent } from './define';\nimport { Foo } from '../components/foo';\n// solid-coverage: equivalent Foo -- dead weight\ndefineWebComponent('kai-x', {}, () => <Foo a=\"hi\" />);\n",
    });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on a stale directive`).not.toBe(0);
    expect(output).toContain('SOLID-EQUIVALENT STALE');
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
