import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { workDirFor, installKey, regenerate, regenTurn } from './dev';
import { generateProject, type GeneratedFile } from './codegen';
import { validateConstruct } from './schema';

const construct = (name: string) => {
  const out = validateConstruct({ name, layout: 'widget', provider: { mode: 'mock' } });
  if (!out.ok) throw new Error('fixture invalid');
  return out.construct;
};

describe('kai dev internals', () => {
  it('workdir is .kai/<name> under the given root', () => {
    expect(workDirFor('demo-widget', '/repo')).toBe(join('/repo', '.kai', 'demo-widget'));
  });

  it('installKey changes only when the emitted package.json changes', () => {
    const a = generateProject(construct('demo-widget'));
    const b = generateProject(construct('demo-widget'));
    expect(installKey(a)).toBe(installKey(b));
    const c: GeneratedFile[] = a.map((f) =>
      f.path === 'package.json' ? { ...f, code: f.code.replace('"vite": "^6.0.0"', '"vite": "^7.0.0"') } : f,
    );
    expect(installKey(c)).not.toBe(installKey(a));
  });

  it('regenerate refuses an invalid construct and reports problems without writing', () => {
    const written: string[] = [];
    const out = regenerate(
      { name: 'demo-widget', layout: 'sidebar', provider: { mode: 'mock' } },
      { write: (files, dir) => written.push(dir) },
      '/tmp/nowhere',
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'layout')).toBe(true);
    expect(written).toEqual([]);
  });

  it('regenerate writes on a valid construct', () => {
    const written: string[] = [];
    const out = regenerate(
      { name: 'demo-widget', layout: 'widget', provider: { mode: 'mock' } },
      { write: (files, dir) => written.push(dir) },
      '/tmp/somewhere',
    );
    expect(out.ok).toBe(true);
    expect(written).toEqual(['/tmp/somewhere']);
  });

  it('regenTurn survives a throw from the writer, reports it, and the loop stays alive for the next edit', () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const io = { log: (s: string) => logs.push(s), error: (s: string) => errors.push(s) };
    const raw = { name: 'demo-widget', layout: 'widget', provider: { mode: 'mock' } };

    // Turn 1: the sink (standing in for writeProject's real fs writes) throws
    // — e.g. permissions, disk full, a template bug. regenTurn must not throw:
    // this same body runs inside an fs.watch listener, where an uncaught
    // throw is an uncaught exception that kills the whole `kai dev` process.
    expect(() =>
      regenTurn(
        () => raw,
        {
          write: () => {
            throw new Error('EACCES: permission denied');
          },
        },
        '/tmp/somewhere',
        {},
        io,
      ),
    ).not.toThrow();
    expect(errors.some((e) => e.includes('EACCES: permission denied') && e.includes('last good preview stays up'))).toBe(
      true,
    );

    // Turn 2: a subsequent valid edit with a working writer still regenerates
    // — the throw above did not wedge the loop.
    const written: string[] = [];
    regenTurn(() => raw, { write: (_files, dir) => written.push(dir) }, '/tmp/somewhere', {}, io);
    expect(written).toEqual(['/tmp/somewhere']);
    expect(logs.some((l) => l.includes('regenerated'))).toBe(true);
  });

  it('regenTurn survives readRaw throwing (e.g. invalid JSON mid-write) the same way', () => {
    const errors: string[] = [];
    const io = { log: () => {}, error: (s: string) => errors.push(s) };
    expect(() =>
      regenTurn(
        () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
        { write: () => {} },
        '/tmp/somewhere',
        {},
        io,
      ),
    ).not.toThrow();
    expect(errors.some((e) => e.includes('Unexpected end of JSON input'))).toBe(true);
  });
});
