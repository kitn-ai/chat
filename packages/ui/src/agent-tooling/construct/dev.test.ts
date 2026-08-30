import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, readFileSync as readF, writeFileSync as writeF, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { workDirFor, installKey, regenerate, regenTurn, handleConstructPut, shapeConstructGetResponse, createEventHub, serveBuilderAsset, listenLoopbackOnly, resolveBuilderPageDir, probePort, handleCreate, starterFor, previewFields, waitUntilListening, announceBoot } from './dev';
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

  it('shapeConstructGetResponse: a valid on-disk construct is returned byte-identical, no problems field', () => {
    const shaped = shapeConstructGetResponse(goodRaw) as Record<string, unknown>;
    expect(shaped).toEqual(goodRaw);
    expect('problems' in shaped).toBe(false);
  });

  it('shapeConstructGetResponse: an invalid on-disk construct (external hand-edit mid-write) carries the raw JSON PLUS problems', () => {
    const bad = { ...goodRaw, layout: 'sidebar' }; // not one of the schema's layout enum values
    const shaped = shapeConstructGetResponse(bad) as { layout: string; problems: Array<{ path: string }> };
    expect(shaped.layout).toBe('sidebar'); // the raw file content is preserved, not discarded
    expect(shaped.problems.length).toBeGreaterThan(0);
    expect(shaped.problems.some((p) => p.path === 'layout')).toBe(true);
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

  it('event hub broadcasts a payload when one is given, and the payload-free events keep their exact `data: {}` frame', () => {
    const hub = createEventHub();
    const frames: string[] = [];
    hub.attach({
      writeHead: () => {},
      write: (chunk: string) => { frames.push(chunk); return true; },
      on: () => {},
    } as never);
    hub.broadcast('construct');
    hub.broadcast('preview', { previewUrl: 'http://localhost:4401/' });
    // 'construct' predates payloads and the page's listener ignores its data —
    // pinned so adding the payload arg cannot quietly change that frame.
    expect(frames).toContain('event: construct\ndata: {}\n\n');
    expect(frames).toContain('event: preview\ndata: {"previewUrl":"http://localhost:4401/"}\n\n');
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

// ── create → respond → boot in the background (owner-found, 2026-08-30) ──────
// The defect: POST /api/create did the whole boot (npm install + spawning
// Vite) INSIDE the request, so the page showed nothing for ~28s warm and
// minutes cold. These pin the two halves of the fix — the request stops at
// "the file is on disk", and the boot announces itself over SSE afterwards.
describe('POST /api/create responds before the boot (B-22 background boot)', () => {
  it('handleCreate writes the construct file and returns it — no boot involved', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-create-'));
    const out = handleCreate({ templateId: 'scratch', name: 'acme-support' }, dir);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.target).toBe(join(dir, 'acme-support.construct.json'));
    expect(JSON.parse(readF(out.target, 'utf8'))).toEqual({
      name: 'acme-support',
      layout: 'fullscreen',
      provider: { mode: 'mock' },
    });
    expect(readdirSync(dir)).toEqual(['acme-support.construct.json']); // atomic tmp renamed away
  });

  it('handleCreate REJECTS an invalid name and writes NOTHING — same validate-then-write contract as handleConstructPut', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-create-'));
    const out = handleCreate({ templateId: 'scratch', name: 'NoHyphenHere' }, dir);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'name')).toBe(true);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('handleCreate writes pretty JSON with a trailing newline, like every other write doorway', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-create-'));
    const out = handleCreate({ templateId: 'scratch', name: 'acme-support' }, dir);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const text = readF(out.target, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "layout"');
  });

  it('starterFor picks the VARIANT starter when one is named, and the family starter otherwise', () => {
    const base = starterFor({ templateId: 'workspace', name: 'acme-support' }) as Record<string, unknown>;
    const variant = starterFor({ templateId: 'workspace', variantId: 'appPreview', name: 'acme-support' }) as Record<string, unknown>;
    expect(base.name).toBe('acme-support');
    expect(variant.name).toBe('acme-support');
    // The two Workspace variants are genuinely different starting points
    // (builder-workspace-variants.tsx), so the variant must not collapse back
    // onto the family starter.
    expect(variant).not.toEqual(base);
  });

  it('previewFields: the pending/ready/error states are three distinguishable answers, one derivation for /api/state and /api/create', () => {
    expect(previewFields({ status: 'starting' })).toEqual({
      previewUrl: undefined,
      previewPending: true,
      previewError: undefined,
    });
    expect(previewFields({ status: 'ready', url: 'http://localhost:4401/' })).toEqual({
      previewUrl: 'http://localhost:4401/',
      previewPending: false,
      previewError: undefined,
    });
    expect(previewFields({ status: 'error', message: 'npm install exited 1' })).toEqual({
      previewUrl: undefined,
      previewPending: false,
      previewError: 'npm install exited 1',
    });
    // 'idle' is "no construct yet" — not pending, so the page does not sit on
    // a placeholder waiting for an announcement that will never come.
    expect(previewFields({ status: 'idle' }).previewPending).toBe(false);
  });

  it('the create RESPONSE SHAPE is the construct plus previewPending — no previewUrl, because nothing is listening yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-create-'));
    const out = handleCreate({ templateId: 'scratch', name: 'acme-support' }, dir);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const body = { construct: out.construct, ...previewFields({ status: 'starting' }) };
    // JSON.stringify drops the undefined keys, which is the shape the page reads.
    expect(JSON.parse(JSON.stringify(body))).toEqual({
      construct: { name: 'acme-support', layout: 'fullscreen', provider: { mode: 'mock' } },
      previewPending: true,
    });
  });

  it('announceBoot broadcasts `preview` with the url once the boot resolves', async () => {
    const events: Array<{ event: string; data: unknown }> = [];
    const state = await announceBoot(
      async () => 'http://localhost:4401/',
      { broadcast: (event, data) => events.push({ event, data }) },
      { log: () => {}, error: () => {} },
    );
    expect(events).toEqual([{ event: 'preview', data: { previewUrl: 'http://localhost:4401/' } }]);
    expect(state).toEqual({ status: 'ready', url: 'http://localhost:4401/' });
  });

  it('announceBoot reports a FAILED boot loudly — an SSE `preview-error` plus the terminal, never a silent hang', async () => {
    const events: Array<{ event: string; data: unknown }> = [];
    const errors: string[] = [];
    const state = await announceBoot(
      async () => {
        throw new Error('npm install exited 1');
      },
      { broadcast: (event, data) => events.push({ event, data }) },
      { log: () => {}, error: (s: string) => errors.push(s) },
    );
    expect(events).toEqual([{ event: 'preview-error', data: { message: 'npm install exited 1' } }]);
    expect(state).toEqual({ status: 'error', message: 'npm install exited 1' });
    expect(errors.some((e) => e.includes('npm install exited 1'))).toBe(true);
  });

  it('announceBoot never throws at its caller — it runs detached, so a rejection has nowhere to go', async () => {
    await expect(
      announceBoot(
        () => Promise.reject(new Error('boom')),
        { broadcast: () => {} },
        { log: () => {}, error: () => {} },
      ),
    ).resolves.toEqual({ status: 'error', message: 'boom' });
  });
});

describe('waitUntilListening (the preview url is announced only when Vite is really up)', () => {
  it('polls until the port answers, then resolves ok', async () => {
    let attempts = 0;
    const out = await waitUntilListening(async () => ++attempts >= 3, { sleep: async () => {}, intervalMs: 0 });
    expect(out).toEqual({ ok: true });
    expect(attempts).toBe(3);
  });

  it('gives up with a reason rather than hanging forever', async () => {
    let clock = 0;
    const out = await waitUntilListening(async () => false, {
      timeoutMs: 1_000,
      intervalMs: 250,
      sleep: async () => { clock += 250; },
      now: () => clock,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('did not start');
  });

  it('a DEAD preview server is reported as itself, immediately, not as a timeout minutes later', async () => {
    let dead: string | undefined;
    const out = await waitUntilListening(
      async () => {
        dead = 'the preview server exited with code 1 before it started listening';
        return false;
      },
      { sleep: async () => {}, abort: () => dead, intervalMs: 0 },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('exited with code 1');
  });
});

describe('probePort asks the same question the browser will (found in the real run)', () => {
  it('is UP when the server binds IPv6 loopback only — Vite 6 does exactly this', async () => {
    const server = createServer();
    try {
      await new Promise<void>((r, j) => { server.once('error', j); server.listen(0, '::1', r); });
      const addr = server.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      // The url the builder announces is http://localhost:<port>/, which the
      // browser resolves under either family. An IPv4-only probe waits out the
      // whole timeout here and then reports a RUNNING server as failed to start.
      expect(await probePort(port)).toBe(true);
    } finally {
      server.close();
    }
  });

  it('is UP when the server binds IPv4 loopback only', async () => {
    const server = createServer();
    try {
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      const addr = server.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      expect(await probePort(port)).toBe(true);
    } finally {
      server.close();
    }
  });

  it('is DOWN when nothing is listening', async () => {
    const server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
    await new Promise<void>((r) => server.close(() => r()));
    expect(await probePort(port)).toBe(false);
  });
});
