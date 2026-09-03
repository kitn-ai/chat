import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, readFileSync as readF, writeFileSync as writeF, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { workDirFor, installKey, regenerate, regenTurn, handleConstructPut, shapeConstructGetResponse, createEventHub, serveBuilderAsset, listenLoopbackOnly, resolveBuilderPageDir, listenWithPortFallback, portInUseNotice, probePort, handleCreate, starterFor, previewFields, waitUntilListening, announceBoot, listConstructs, resolveConstructArg, handleOpen, crossOriginProblem } from './dev';
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

  // Security (pre-merge review, 2026-08-31): loopback binding does not stop a
  // hostile WEB PAGE — POST /api/create is a no-preflight simple request any
  // origin can fire, and each call writes a file and spawns npm + Vite. The
  // browser's unforgeable Origin header is the discriminator.
  describe('crossOriginProblem — the drive-by-POST guard on every state-changing route', () => {
    it('rejects a cross-origin request (Origin present and foreign)', () => {
      const out = crossOriginProblem({ origin: 'https://evil.example', host: 'localhost:4400' });
      expect(out).toContain('cross-origin request rejected');
      expect(out).toContain('https://evil.example');
    });

    it('rejects `Origin: null` (sandboxed iframes) — present-and-foreign, not absent', () => {
      expect(crossOriginProblem({ origin: 'null', host: 'localhost:4400' })).toContain('rejected');
    });

    it('allows the builder page\'s own same-origin fetches (Origin matches the request Host)', () => {
      expect(crossOriginProblem({ origin: 'http://localhost:4400', host: 'localhost:4400' })).toBeUndefined();
      expect(crossOriginProblem({ origin: 'http://127.0.0.1:4401', host: '127.0.0.1:4401' })).toBeUndefined();
    });

    it('allows an ABSENT Origin — curl and same-origin non-CORS requests send none', () => {
      expect(crossOriginProblem({ host: 'localhost:4400' })).toBeUndefined();
      expect(crossOriginProblem({})).toBeUndefined();
    });

    it('a foreign origin on the same PORT is still foreign (scheme/host must match, not just the port)', () => {
      expect(crossOriginProblem({ origin: 'http://evil.example:4400', host: 'localhost:4400' })).toContain('rejected');
      expect(crossOriginProblem({ origin: 'https://localhost:4400', host: 'localhost:4400' })).toContain('rejected');
    });
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

// ── the home-screen entry flow (owner ask, 2026-08-31) ───────────────────────
// Constructs live at the project ROOT (handleCreate writes
// `<cwd>/<name>.construct.json`; `.kai/` holds generated workdirs), so that
// is what the scan reads.
describe('listConstructs — the home screen scan', () => {
  const write = (dir: string, file: string, body: unknown) =>
    writeF(join(dir, file), typeof body === 'string' ? body : JSON.stringify(body));

  it('lists every *.construct.json newest-first with name, template label and mtime; other files are ignored', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-scan-'));
    write(dir, 'acme-support.construct.json', { name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } });
    write(dir, 'acme-desk.construct.json', { name: 'acme-desk', layout: 'fullscreen', provider: { mode: 'mock' } });
    write(dir, 'notes.json', { irrelevant: true });
    write(dir, 'README.md', 'not json at all');
    // Force a stable mtime ordering (same-second writes tie otherwise).
    const past = new Date(Date.now() - 60_000);
    utimesSync(join(dir, 'acme-desk.construct.json'), past, past);

    const rows = listConstructs(dir);
    expect(rows.map((r) => r.file)).toEqual(['acme-support.construct.json', 'acme-desk.construct.json']);
    expect(rows[0]).toMatchObject({ name: 'acme-support', valid: true, templateId: 'widget' });
    expect(typeof rows[0].updatedAt).toBe('string');
    expect(rows[0].templateName).toBeTruthy(); // the human label rides along for the card
  });

  it('an invalid or non-JSON construct file is LISTED and marked, never silently dropped', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-scan-'));
    write(dir, 'broken.construct.json', '{not json');
    write(dir, 'rejected.construct.json', { name: 'rejected', layout: 'sideways', provider: { mode: 'mock' } });
    const rows = listConstructs(dir);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.valid).toBe(false);
      expect(row.templateId).toBeUndefined();
    }
    expect(rows.map((r) => r.name).sort()).toEqual(['broken', 'rejected']); // basename-derived identity
  });

  it('an empty or unreadable directory is an empty list (phase start), not a throw', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-scan-'));
    expect(listConstructs(dir)).toEqual([]);
    expect(listConstructs(join(dir, 'does-not-exist'))).toEqual([]);
  });
});

describe('resolveConstructArg — `kai dev --builder <name>` direct open', () => {
  it('a real path wins as-is; a bare name resolves to <cwd>/<name>.construct.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-arg-'));
    writeF(join(dir, 'acme-support.construct.json'), JSON.stringify({}));
    expect(resolveConstructArg('acme-support.construct.json', dir)).toEqual({
      ok: true,
      abs: join(dir, 'acme-support.construct.json'),
    });
    expect(resolveConstructArg('acme-support', dir)).toEqual({
      ok: true,
      abs: join(dir, 'acme-support.construct.json'),
    });
  });

  it('an unknown name fails loudly LISTING what exists — never a bare ENOENT', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-arg-'));
    writeF(join(dir, 'acme-support.construct.json'), JSON.stringify({}));
    writeF(join(dir, 'acme-desk.construct.json'), JSON.stringify({}));
    const out = resolveConstructArg('acme-shop', dir);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toContain('no construct named "acme-shop"');
    expect(out.message).toContain('acme-support');
    expect(out.message).toContain('acme-desk');
    expect(out.message).toContain('kai dev --builder');
  });

  it('an unknown name in an EMPTY directory says so instead of listing nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-arg-'));
    const out = resolveConstructArg('anything', dir);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toContain('no *.construct.json files exist');
  });
});

describe('handleOpen — POST /api/open opens by basename only', () => {
  const goodRaw = { name: 'demo-widget', layout: 'widget', provider: { mode: 'mock' } };

  it('opens a listed construct and returns the RAW file content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-open-'));
    writeF(join(dir, 'demo-widget.construct.json'), JSON.stringify(goodRaw));
    const out = handleOpen({ file: 'demo-widget.construct.json' }, dir);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.abs).toBe(join(dir, 'demo-widget.construct.json'));
      expect(out.construct).toEqual(goodRaw);
    }
  });

  it('a path with separators or traversal is inexpressible — rejected before any fs access', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-open-'));
    for (const file of ['../evil.construct.json', 'sub/dir.construct.json', '/etc/passwd', 'x.json', 42, undefined]) {
      const out = handleOpen({ file }, dir);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.status).toBe(422);
    }
  });

  it('a missing file 404s naming the file (stale list), an invalid one 422s with its own problems', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-open-'));
    const missing = handleOpen({ file: 'gone.construct.json' }, dir);
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.status).toBe(404);
      expect(missing.problems[0].message).toContain('gone.construct.json');
    }
    writeF(join(dir, 'bad.construct.json'), JSON.stringify({ ...goodRaw, layout: 'sideways' }));
    const invalid = handleOpen({ file: 'bad.construct.json' }, dir);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.status).toBe(422);
      expect(invalid.problems.some((p) => p.path === 'layout')).toBe(true);
    }
  });
});

describe('handleCreate refuses to overwrite an existing construct (multi-construct directories)', () => {
  it('a second create with the same name is a pathed rejection naming the file, and the file is untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kai-create-'));
    const first = handleCreate({ templateId: 'scratch', name: 'acme-support' }, dir);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const before = readF(first.target, 'utf8');
    const second = handleCreate({ templateId: 'assistant', name: 'acme-support' }, dir);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.problems[0].path).toBe('name');
      expect(second.problems[0].message).toContain('acme-support.construct.json');
      expect(second.problems[0].message).toContain('already exists');
    }
    expect(readF(first.target, 'utf8')).toBe(before);
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

describe('a taken builder port fails helpfully, not with an EADDRINUSE stack (owner-hit)', () => {
  it('steps to the next free port, says which and why, and reports the port it ACTUALLY bound', async () => {
    const squatter = createServer();
    const builder = createServer();
    try {
      await new Promise<void>((r) => squatter.listen(0, '127.0.0.1', r));
      const addr = squatter.address();
      const taken = typeof addr === 'object' && addr !== null ? addr.port : 0;

      const errors: string[] = [];
      const bound = await listenWithPortFallback(builder, taken, { log: () => {}, error: (s: string) => errors.push(s) });

      expect(bound).toBe(taken + 1);
      const boundAddr = builder.address();
      expect(typeof boundAddr === 'object' && boundAddr !== null ? boundAddr.port : 0).toBe(taken + 1);
      // Still loopback-only after the retry — the fallback goes THROUGH
      // listenLoopbackOnly, it does not reimplement the bind.
      expect(typeof boundAddr === 'object' && boundAddr !== null ? boundAddr.address : '').toBe('127.0.0.1');
      // Actionable: the busy port, the likely cause, and the command that names it.
      expect(errors[0]).toBe(portInUseNotice(taken, taken + 1));
      expect(errors[0]).toContain('another `kai dev --builder`');
      expect(errors[0]).toContain(`lsof -nP -iTCP:${taken}`);
    } finally {
      squatter.close();
      builder.close();
    }
  });

  it('steps off a port held on the OTHER loopback family too — binding 127.0.0.1 would have succeeded (found in the real run)', async () => {
    // Vite binds [::1] and nothing on 127.0.0.1. An EADDRINUSE-only fallback
    // therefore binds happily on top of a live preview server, and which one
    // `localhost` reaches is down to DNS ordering.
    const squatter = createServer();
    const builder = createServer();
    try {
      await new Promise<void>((r, j) => { squatter.once('error', j); squatter.listen(0, '::1', r); });
      const addr = squatter.address();
      const taken = typeof addr === 'object' && addr !== null ? addr.port : 0;

      const errors: string[] = [];
      const bound = await listenWithPortFallback(builder, taken, { log: () => {}, error: (s: string) => errors.push(s) });
      expect(bound).not.toBe(taken);
      expect(errors[0]).toContain(`port ${taken} is already in use`);
    } finally {
      squatter.close();
      builder.close();
    }
  });

  it('gives up with a readable message rather than an errno once every attempt is taken', async () => {
    const squatter = createServer();
    const builder = createServer();
    try {
      await new Promise<void>((r) => squatter.listen(0, '127.0.0.1', r));
      const addr = squatter.address();
      const taken = typeof addr === 'object' && addr !== null ? addr.port : 0;
      await expect(
        listenWithPortFallback(builder, taken, { log: () => {}, error: () => {} }, { attempts: 1 }),
      ).rejects.toThrow(/is in use[\s\S]*lsof/);
    } finally {
      squatter.close();
      builder.close();
    }
  });

  it('binds first time when the port is free, with no notice printed', async () => {
    const builder = createServer();
    try {
      const errors: string[] = [];
      const bound = await listenWithPortFallback(builder, 0, { log: () => {}, error: (s: string) => errors.push(s) });
      expect(errors).toEqual([]);
      // Port 0 means "any": the resolved value is the port really bound, not
      // the 0 we asked for — the caller derives the preview port from it.
      const addr = builder.address();
      expect(bound).toBe(typeof addr === 'object' && addr !== null ? addr.port : -1);
      expect(bound).toBeGreaterThan(0);
    } finally {
      builder.close();
    }
  });
});

// ── the blocks gallery route (Task 5.1) ─────────────────────────────────────

import { handleGalleryRequest, isBlockName, blockFromRegistryItem, galleryPreviewHtml, storeZip, type GalleryDirs } from './dev';
import { BLOCK_FORMS } from '@kitn.ai/blocks/forms';

const ITEM = {
  name: 'demo-block',
  title: 'Demo block',
  description: 'A demo.',
  type: 'registry:block' as const,
  files: [
    {
      path: 'demo-block.html',
      type: 'registry:page' as const,
      content:
        '<!doctype html>\n<html><head><link rel="stylesheet" href="./demo-block.css" /></head>' +
        '<body><kai-panel></kai-panel><script type="module" src="./demo-block.js"></script></body></html>',
    },
    { path: 'demo-block.js', type: 'registry:file' as const, content: "import '@kitn.ai/ui/autoloader';\nconsole.log('hi');" },
    { path: 'demo-block.css', type: 'registry:file' as const, content: 'body { margin: 0; }' },
  ],
};

function galleryFixture(): { dirs: GalleryDirs; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'kai-gallery-'));
  // The layout the walk finds in a real package: <root>/dist/blocks + <root>/dist/gallery.
  const blocksDir = join(root, 'dist', 'blocks');
  const pageDir = join(root, 'dist', 'gallery');
  mkdirSync(join(blocksDir, 'r'), { recursive: true });
  mkdirSync(join(pageDir, 'assets'), { recursive: true });
  writeF(join(blocksDir, 'registry.json'), JSON.stringify({ items: [{ name: 'demo-block' }] }));
  writeF(join(blocksDir, 'r', 'demo-block.json'), JSON.stringify(ITEM));
  writeF(join(blocksDir, 'r', 'demo-block.cdn.html'), '<!doctype html><html><body>cdn form</body></html>');
  writeF(join(pageDir, 'index.html'), '<!doctype html><html><body>gallery shell</body></html>');
  writeF(join(pageDir, 'assets', 'app.js'), 'console.log("app");');
  writeF(join(root, 'dist', 'kai.es.js'), 'export {};');
  return { dirs: { pageDir, blocksDir, version: '9.9.9' }, root };
}

describe('the gallery route table', () => {
  it('block names are lowercase-hyphenated only — separators, dots and traversal are inexpressible', () => {
    expect(isBlockName('support-widget')).toBe(true);
    expect(isBlockName('a1')).toBe(true);
    for (const bad of ['', '..', 'a..b', 'A-Widget', 'a_b', 'a.b', 'a/b', '-a', 'a-']) {
      expect(isBlockName(bad), bad).toBe(false);
    }
  });

  it('owns /gallery and /kit only — every other URL falls through to the builder page', () => {
    const { dirs } = galleryFixture();
    expect(handleGalleryRequest('/', dirs)).toBeUndefined();
    expect(handleGalleryRequest('/api/state', dirs)).toBeUndefined();
    expect(handleGalleryRequest('/galleryish', dirs)).toBeUndefined();
  });

  it('/gallery redirects to /gallery/ and the shell + assets serve from the page dir', () => {
    const { dirs } = galleryFixture();
    expect(handleGalleryRequest('/gallery', dirs)).toEqual({ kind: 'redirect', location: '/gallery/' });
    const shell = handleGalleryRequest('/gallery/', dirs);
    expect(shell?.kind === 'file' && String(shell.body)).toContain('gallery shell');
    const js = handleGalleryRequest('/gallery/assets/app.js', dirs);
    expect(js?.kind === 'file' && js.type).toContain('text/javascript');
    // SPA fallback: an unknown path under /gallery/ serves the shell.
    const fallback = handleGalleryRequest('/gallery/some/route', dirs);
    expect(fallback?.kind === 'file' && String(fallback.body)).toContain('gallery shell');
  });

  it('serves the registry index and the per-block item JSON (the public integration surface)', () => {
    const { dirs } = galleryFixture();
    const index = handleGalleryRequest('/gallery/api/registry.json', dirs);
    expect(index?.kind === 'file' && index.type).toBe('application/json');
    const item = handleGalleryRequest('/gallery/api/r/demo-block.json', dirs);
    expect(item?.kind === 'file' && JSON.parse(String(item.body)).name).toBe('demo-block');
    expect(handleGalleryRequest('/gallery/api/r/nope.json', dirs)).toMatchObject({ kind: 'missing' });
  });

  it('serves the CDN form as text/plain — data for the copy/download affordance, never a second live document', () => {
    const { dirs } = galleryFixture();
    const cdn = handleGalleryRequest('/gallery/api/r/demo-block.cdn.html', dirs);
    expect(cdn?.kind === 'file' && cdn.type).toContain('text/plain');
    expect(cdn?.kind === 'file' && String(cdn.body)).toContain('cdn form');
  });

  it('GET /gallery/api/form/<block>/<form> serves every delivery form through the ONE shared renderer', () => {
    const { dirs } = galleryFixture();
    const filesOf = (form: string): { path: string; content: string }[] => {
      const out = handleGalleryRequest(`/gallery/api/form/demo-block/${form}`, dirs);
      expect(out?.kind === 'file' && out.type, form).toBe('application/json');
      return out?.kind === 'file' ? (JSON.parse(String(out.body)) as { files: { path: string; content: string }[] }).files : [];
    };
    // Neither html NOR react is asserted here: this fixture is an UNCONVERTED
    // block (an authored <script type="module"> and an imperative
    // demo-block.js), and both forms refuse one now. Their refusal has its own
    // case below; the positive assertions come back with the converted
    // fixture.
    // cdn — one self-contained file with imports pinned to the served version.
    // The expected URL is DERIVED from the fixture's version, never a literal
    // pin: lint:cdn-pins scans every @kitn.ai/ui@<semver> literal in the tree
    // and would (rightly) flag a hand-typed one here as a live unwired pin.
    const cdn = filesOf('cdn');
    expect(cdn.map((f) => f.path)).toEqual(['demo-block.html']);
    expect(cdn[0].content).toContain(`https://cdn.jsdelivr.net/npm/@kitn.ai/ui@${dirs.version}/dist/`);
  });

  it('an unconverted block gets a loud refusal from the html AND react forms, not a 404', () => {
    const { dirs } = galleryFixture();
    // One `try` in dev.ts dispatches every form, so both refusals arrive the
    // same way and this is one case rather than two.
    for (const form of ['html', 'react']) {
      const out = handleGalleryRequest(`/gallery/api/form/demo-block/${form}`, dirs);
      expect(out?.kind, form).toBe('file');
      expect(out?.kind === 'file' && out.status, form).toBe(500);
      const body = String(out?.kind === 'file' ? out.body : '');
      // The refusal names the block and says what is wrong with it in words.
      // This fixture's page still carries its own <script type="module">, which
      // is the FIRST thing the authored grammar refuses, so that is the reason
      // it reports; the message points at the controller file as the fix.
      expect(body, form).toContain(`the ${form} form of "demo-block" cannot be rendered`);
      expect(body, form).toContain('the entry script is GENERATED');
      expect(body, form).toContain('controller.ts');
    }
  });

  it('unknown forms and blocks on the form/zip routes answer missing — the form list derived, never restated', () => {
    const { dirs } = galleryFixture();
    const badForm = handleGalleryRequest('/gallery/api/form/demo-block/vue', dirs);
    expect(badForm?.kind === 'missing' && badForm.message).toContain(BLOCK_FORMS.map((f) => f.id).join(', '));
    expect(handleGalleryRequest('/gallery/api/form/nope/html', dirs)).toMatchObject({ kind: 'missing' });
    expect(handleGalleryRequest('/gallery/api/zip/demo-block/vue', dirs)).toMatchObject({ kind: 'missing' });
    expect(handleGalleryRequest('/gallery/api/form/..%2Fx/html', dirs)).toMatchObject({ kind: 'missing' });
  });

  it('GET /gallery/api/zip/<block>/<form> is the SAME rendered files as a store-only zip download', () => {
    const { dirs } = galleryFixture();
    // `cdn`, not `html`, only while this fixture is UNCONVERTED: the html and
    // react forms both refuse an unconverted block now, and this case is about
    // the zip being the form route's own bytes rather than about which form.
    // It goes back to html with the converted fixture.
    const form = handleGalleryRequest('/gallery/api/form/demo-block/cdn', dirs);
    const files = form?.kind === 'file' ? (JSON.parse(String(form.body)) as { files: { path: string; content: string }[] }).files : [];
    const zip = handleGalleryRequest('/gallery/api/zip/demo-block/cdn', dirs);
    expect(zip?.kind === 'file' && zip.type).toBe('application/zip');
    expect(zip?.kind === 'file' && zip.download).toBe('demo-block-cdn.zip');
    const body = zip?.kind === 'file' ? (zip.body as Buffer) : Buffer.alloc(0);
    // Byte-equal to the form route's files, by construction: same renderer,
    // and store-only means each file's exact bytes appear in the archive.
    expect(body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    for (const file of files) {
      expect(body.includes(Buffer.from(file.content, 'utf8')), file.path).toBe(true);
      expect(body.includes(Buffer.from(file.path, 'utf8')), file.path).toBe(true);
    }
    // EOCD entry count equals the form's file count.
    const eocd = body.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(body.readUInt16LE(eocd + 10)).toBe(files.length);
  });

  it('the live preview is the item JSON rendered through the ONE CDN-form serializer against /kit/', () => {
    const { dirs } = galleryFixture();
    const preview = handleGalleryRequest('/gallery/preview/demo-block/', dirs);
    expect(preview?.kind === 'file' && preview.type).toContain('text/html');
    const html = preview?.kind === 'file' ? String(preview.body) : '';
    expect(html).toContain("'/kit/elements/autoloader.js'");
    expect(html).toContain('inlined from ./demo-block.css');
    expect(html).not.toContain('src="./demo-block.js"');
  });

  it('/kit/* maps onto the package dist root, and traversal in a block name cannot escape', () => {
    const { dirs } = galleryFixture();
    const kit = handleGalleryRequest('/kit/kai.es.js', dirs);
    expect(kit?.kind === 'file' && kit.type).toContain('text/javascript');
    // The sandboxed preview iframe has an opaque origin, so kit imports are
    // CORS fetches: /kit/* carries the header (matching the CDN it stands in
    // for), and the API routes deliberately do NOT.
    expect(kit?.kind === 'file' && kit.cors).toBe(true);
    const api = handleGalleryRequest('/gallery/api/registry.json', dirs);
    expect(api?.kind === 'file' && api.cors).toBeUndefined();
    expect(handleGalleryRequest('/kit/../package.json', dirs)).toMatchObject({ kind: 'missing' });
    expect(handleGalleryRequest('/gallery/api/r/..%2F..%2Fsecret.json', dirs)).toMatchObject({ kind: 'missing' });
    expect(handleGalleryRequest('/gallery/preview/../x/', dirs)).toMatchObject({ kind: 'missing' });
  });

  it('missing build artifacts answer with rebuild instructions, not a crash', () => {
    const { dirs } = galleryFixture();
    const noBlocks = handleGalleryRequest('/gallery/api/registry.json', { ...dirs, blocksDir: undefined });
    expect(noBlocks?.kind === 'missing' && noBlocks.message).toContain('dist/blocks is missing');
    const noPage = handleGalleryRequest('/gallery/', { ...dirs, pageDir: undefined });
    expect(noPage?.kind === 'missing' && noPage.message).toContain('dist/gallery is missing');
  });
});

describe('storeZip', () => {
  // A minimal independent reader: walk the central directory the way any
  // unzip does and extract each entry through its local header, so the test
  // proves the container parses rather than pattern-matching our own writer.
  function readZip(zip: Buffer): { name: string; data: Buffer }[] {
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(eocd).toBeGreaterThanOrEqual(0);
    const count = zip.readUInt16LE(eocd + 10);
    let at = zip.readUInt32LE(eocd + 16); // central directory offset
    const out: { name: string; data: Buffer }[] = [];
    for (let i = 0; i < count; i++) {
      expect(zip.readUInt32LE(at)).toBe(0x02014b50);
      const nameLen = zip.readUInt16LE(at + 28);
      const extraLen = zip.readUInt16LE(at + 30);
      const commentLen = zip.readUInt16LE(at + 32);
      const localAt = zip.readUInt32LE(at + 42);
      const name = zip.subarray(at + 46, at + 46 + nameLen).toString('utf8');
      expect(zip.readUInt32LE(localAt)).toBe(0x04034b50);
      const size = zip.readUInt32LE(localAt + 22);
      const lNameLen = zip.readUInt16LE(localAt + 26);
      const lExtraLen = zip.readUInt16LE(localAt + 28);
      const dataAt = localAt + 30 + lNameLen + lExtraLen;
      expect(zip.readUInt16LE(localAt + 8)).toBe(0); // method: store
      out.push({ name, data: zip.subarray(dataAt, dataAt + size) });
      at += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  it('emits a parseable store-only archive whose entries are byte-equal to the input files', () => {
    const files = [
      { path: 'a/deep/file.html', content: '<p>hello</p>', target: 'a/deep/file.html' },
      { path: 'b.js', content: "console.log('x');\n", target: 'b.js' },
    ];
    const entries = readZip(storeZip(files));
    expect(entries.map((e) => e.name)).toEqual(files.map((f) => f.path));
    for (const [i, entry] of entries.entries()) {
      expect(entry.data.equals(Buffer.from(files[i].content, 'utf8'))).toBe(true);
    }
  });

  it('is deterministic — the same files always produce the same bytes', () => {
    const files = [{ path: 'x.css', content: 'body{}', target: 'x.css' }];
    expect(storeZip(files).equals(storeZip(files))).toBe(true);
  });
});

describe('the gallery preview serializer seam', () => {
  it('blockFromRegistryItem reconstructs the Block shape the generator takes (manifest without content, files as a map)', () => {
    const block = blockFromRegistryItem(ITEM);
    expect(block.name).toBe('demo-block');
    expect(block.manifest.files.map((f) => Object.keys(f).sort())).toEqual([
      ['path', 'type'],
      ['path', 'type'],
      ['path', 'type'],
    ]);
    expect(block.files.get('demo-block.css')).toBe('body { margin: 0; }');
  });

  it('galleryPreviewHtml reports unreadable item JSON as errors, never a throw', () => {
    const out = galleryPreviewHtml('not json', '1.0.0');
    expect(out.html).toBeUndefined();
    expect(out.errors[0]).toContain('item JSON unreadable');
  });
});
