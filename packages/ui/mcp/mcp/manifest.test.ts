/**
 * manifest.test.ts — that the MCP reads THIS package's Custom Elements Manifest.
 *
 * This is a test about a verification bug, so it is worth saying what it is for.
 * `resolveManifestPath()` used to walk up ten parent directories and take the first
 * `dist/custom-elements.json` it found. From an agent git worktree that climbed out
 * of the worktree and bound to the primary checkout's copy — six weeks stale, 78
 * tags, no `cardSchemas` — and the consequence was NOT an error. It was sixteen of
 * seventeen tests in reference.test.ts PASSING against a tree nobody was working in.
 *
 * A test that reads whatever artifact it can find proves nothing about the tree it
 * is running on, so the assertions below are chosen to be ones a walk-up cannot
 * satisfy:
 *
 *   • the DECOY test puts a manifest exactly where the old loop would have found it
 *     and requires a throw. Old code returns the decoy; there is no way to pass it
 *     by searching.
 *   • the IMPOSTOR test puts a manifest at the right depth under the wrong package
 *     and requires a throw — "found a file" and "found the right file" are different
 *     facts, and only an identity check separates them.
 *   • the live test pins the real answer INSIDE this package, proving its own anchor
 *     first so the comparison is not two copies of the same arithmetic.
 *
 * They also fail on an unbuilt tree, on purpose. That is the point: the old code
 * succeeded there, which is the one outcome that must never happen again.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveManifestPath } from './manifest';

/**
 * This package's root, derived independently of the code under test and then PROVEN
 * rather than assumed. If the `package.json` here is not ours the anchor assertion
 * below fails first, so a comparison against it always means something.
 */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Build `<tmp>/<...segments>` and write `content` there, creating parents. */
function writeAt(root: string, relative: string, content: string): string {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

/** A scratch tree, cleaned up whether the body throws or not. */
function inTempTree(body: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'kai-manifest-'));
  try {
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const MANIFEST_JSON = JSON.stringify({ modules: [] });

describe('resolveManifestPath — the manifest is addressed, not searched for', () => {
  it('is anchored to a directory that really is the @kitn.ai/ui package root', () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8')) as {
      name?: string;
    };
    expect(pkg.name, 'this test file is not three levels below the package root').toBe(
      '@kitn.ai/ui',
    );
  });

  // ── THE REGRESSION TEST ────────────────────────────────────────────────────
  // The decoy sits where the old ten-deep loop would have found it: above the
  // package, with nothing in between. Old code returns it. There is no ordering,
  // depth limit or marker that lets a walk-up return a throw instead, which is why
  // this is the test that pins the fix rather than describing it.
  it('THROWS rather than binding to a manifest above the package root', () => {
    inTempTree((root) => {
      // The neighbour's artifact — the primary checkout, in the real defect.
      writeAt(root, join('dist', 'custom-elements.json'), MANIFEST_JSON);

      // Our package, correctly shaped, simply not built.
      writeAt(root, join('pkg', 'package.json'), JSON.stringify({ name: '@kitn.ai/ui' }));
      const origin = join(root, 'pkg', 'src', 'agent-tooling', 'mcp');
      mkdirSync(origin, { recursive: true });

      const expected = join(root, 'pkg', 'dist', 'custom-elements.json');
      const decoy = join(root, 'dist', 'custom-elements.json');

      expect(() => resolveManifestPath(origin)).toThrowError(
        new RegExp(`Missing build artifact: ${escapeRegExp(expected)}`),
      );
      // And it names the path it wanted, not merely "not found somewhere".
      let message = '';
      try {
        resolveManifestPath(origin);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(expected);
      expect(message, 'must not point anyone at the neighbouring artifact').not.toContain(decoy);
      expect(message, 'must say how to fix it').toMatch(/nx build ui|build:api/);
    });
  });

  // ── "FOUND A FILE" IS NOT "FOUND THE RIGHT FILE" ───────────────────────────
  // Right depth, real manifest on disk, wrong package. Existence alone would accept
  // this; only reading the package.json identity rejects it.
  it('THROWS when the derived root is some other package, even with a manifest present', () => {
    inTempTree((root) => {
      writeAt(root, join('other', 'package.json'), JSON.stringify({ name: 'not-our-package' }));
      writeAt(root, join('other', 'dist', 'custom-elements.json'), MANIFEST_JSON);
      const origin = join(root, 'other', 'src', 'agent-tooling', 'mcp');
      mkdirSync(origin, { recursive: true });

      expect(() => resolveManifestPath(origin)).toThrowError(
        /is not the @kitn\.ai\/ui package root/,
      );
    });
  });

  it('THROWS naming the derived root when there is no package.json at all', () => {
    inTempTree((root) => {
      const origin = join(root, 'nowhere', 'src', 'agent-tooling', 'mcp');
      mkdirSync(origin, { recursive: true });
      expect(() => resolveManifestPath(origin)).toThrowError(
        new RegExp(escapeRegExp(join(root, 'nowhere'))),
      );
    });
  });

  // The positive control. Without this the three throws above would also pass if
  // resolveManifestPath threw unconditionally.
  it('resolves the manifest of a correctly shaped package at the exact expected path', () => {
    inTempTree((root) => {
      writeAt(root, join('pkg', 'package.json'), JSON.stringify({ name: '@kitn.ai/ui' }));
      const manifest = writeAt(root, join('pkg', 'dist', 'custom-elements.json'), MANIFEST_JSON);
      const origin = join(root, 'pkg', 'src', 'agent-tooling', 'mcp');
      mkdirSync(origin, { recursive: true });

      expect(resolveManifestPath(origin)).toBe(manifest);
    });
  });

  // The bundled bin: dist/mcp.es.js and dist/custom-elements.json are siblings. A
  // sibling is unambiguous by construction, so it wins before any derivation.
  it('prefers a sibling manifest, the bundled-bin layout', () => {
    inTempTree((root) => {
      const sibling = writeAt(root, join('pkg', 'dist', 'custom-elements.json'), MANIFEST_JSON);
      expect(resolveManifestPath(join(root, 'pkg', 'dist'))).toBe(sibling);
    });
  });
});

describe('resolveManifestPath — the live tree', () => {
  // The structural claim, and the one that cannot be wrong: whatever this run read,
  // it came from inside this package. No artifact belonging to another checkout can
  // satisfy it, regardless of what is on disk anywhere else.
  //
  // It also throws on an unbuilt tree instead of quietly reading a neighbour's copy,
  // which is the behaviour the whole file exists to guarantee.
  it('reads this package own dist/, and fails loudly when it has not been built', () => {
    expect(resolveManifestPath()).toBe(join(packageRoot, 'dist', 'custom-elements.json'));
  });
});

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
