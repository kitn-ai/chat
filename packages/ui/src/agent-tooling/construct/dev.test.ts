import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, readFileSync as readF, writeFileSync as writeF, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { workDirFor, installKey, regenerate, regenTurn, handleConstructPut, createEventHub, serveBuilderAsset, listenLoopbackOnly, resolveBuilderPageDir } from './dev';
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
    if (out.ok) expect(out.construct.name).toBe('demo-widget');
  });

  it('regenTurn logs the accent-contrast notice on a regen whose accent is unparseable', () => {
    const logs: string[] = [];
    const io = { log: (s: string) => logs.push(s), error: () => {} };
    const raw = {
      name: 'demo-widget', layout: 'widget', provider: { mode: 'mock' },
      theme: { accent: 'var(--brand)', mode: 'system' },
    };
    regenTurn(() => raw, { write: () => {} }, '/tmp/somewhere', {}, io);
    expect(logs.some((l) => l.includes('not parseable for contrast'))).toBe(true);
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

describe('kai dev --builder internals (B-22)', () => {
  const goodRaw = { name: 'demo-widget', layout: 'widget', provider: { mode: 'mock' } };

  it('handleConstructPut: a rejection reports pathed problems and NEVER writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-builder-'));
    const abs = join(dir, 'demo.construct.json');
    writeF(abs, JSON.stringify(goodRaw));
    const before = readF(abs, 'utf8');
    const out = handleConstructPut({ ...goodRaw, layout: 'sidebar' }, abs);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'layout')).toBe(true);
    expect(readF(abs, 'utf8')).toBe(before);
  });

  it('handleConstructPut: a valid body is written atomically — pretty JSON + trailing newline, RAW body preserved (no zod defaults injected), no tmp litter', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-builder-'));
    const abs = join(dir, 'demo.construct.json');
    writeF(abs, '{}');
    // theme WITHOUT mode: zod's .default('system') must NOT leak into the file.
    const body = { ...goodRaw, theme: { accent: '#e91e63' } };
    const out = handleConstructPut(body, abs);
    expect(out.ok).toBe(true);
    const onDisk = JSON.parse(readF(abs, 'utf8')) as Record<string, unknown>;
    expect((onDisk.theme as Record<string, unknown>).mode).toBeUndefined();
    expect(readF(abs, 'utf8').endsWith('\n')).toBe(true);
    expect(readdirSync(dir)).toEqual(['demo.construct.json']); // tmp renamed away
  });

  it('event hub broadcasts to attached responses as SSE frames', () => {
    const hub = createEventHub();
    const frames: string[] = [];
    hub.attach({
      writeHead: () => {},
      write: (chunk: string) => { frames.push(chunk); return true; },
      on: () => {},
    } as never);
    hub.broadcast('construct');
    expect(frames.some((f) => f.includes('event: construct'))).toBe(true);
  });

  it('serveBuilderAsset refuses path traversal out of the page dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-page-'));
    writeF(join(dir, 'index.html'), '<!doctype html>');
    expect(serveBuilderAsset('/', dir)?.file.endsWith('index.html')).toBe(true);
    expect(serveBuilderAsset('/../../../etc/passwd', dir)).toBeUndefined();
    expect(serveBuilderAsset('/%2e%2e/%2e%2e/etc/passwd', dir)).toBeUndefined();
  });

  it('resolveBuilderPageDir finds dist/builder-page from a chunk-split layout (e.g. dist/assets/dev-*.js)', () => {
    // Mirrors the real Vite output that broke this (2026-08-28 IVP): dev.ts
    // is reached via a dynamic import() from cli.ts, so Rollup splits it
    // into its own chunk under dist/assets/, one level BELOW dist/builder-page.
    const dist = mkdtempSync(join(tmpdir(), 'kai-dist-'));
    mkdirSync(join(dist, 'assets'), { recursive: true });
    mkdirSync(join(dist, 'builder-page'), { recursive: true });
    writeF(join(dist, 'builder-page', 'index.html'), '<!doctype html>');
    const out = resolveBuilderPageDir(join(dist, 'assets'));
    expect('dir' in out && out.dir).toBe(join(dist, 'builder-page'));
  });

  it('resolveBuilderPageDir also finds it when NOT chunk-split (chunk beside builder-page)', () => {
    const dist = mkdtempSync(join(tmpdir(), 'kai-dist-'));
    mkdirSync(join(dist, 'builder-page'), { recursive: true });
    writeF(join(dist, 'builder-page', 'index.html'), '<!doctype html>');
    const out = resolveBuilderPageDir(dist);
    expect('dir' in out && out.dir).toBe(join(dist, 'builder-page'));
  });

  it('resolveBuilderPageDir reports every path it tried when the artifact is genuinely missing', () => {
    const dist = mkdtempSync(join(tmpdir(), 'kai-dist-'));
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeF(join(dist, 'package.json'), '{}'); // package root — bounds the climb
    const out = resolveBuilderPageDir(join(dist, 'assets'));
    expect('tried' in out).toBe(true);
    if ('tried' in out) {
      expect(out.tried).toEqual([join(dist, 'assets', 'builder-page'), join(dist, 'builder-page')]);
    }
  });

  it('listenLoopbackOnly binds 127.0.0.1, never the unspecified address', async () => {
    const server = createServer();
    try {
      await new Promise<void>((resolveP) => listenLoopbackOnly(server, 0, resolveP));
      const addr = server.address();
      expect(typeof addr === 'object' && addr !== null ? addr.address : addr).toBe('127.0.0.1');
    } finally {
      server.close();
    }
  });
});
