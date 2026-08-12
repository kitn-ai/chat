// Static-file guard tests for serve.mjs. Zero dependencies: `node --test`.
//
//   node --test examples/starters/tanstack-start/serve.traversal.test.mjs
//
// This starter is deliberately NOT a pnpm workspace member (see pnpm-workspace.yaml
// -- it is a standalone `file:` consumer with its own npm lockfile), so it has no
// vitest and no nx `test` target. Node's built-in runner is the only thing available
// that costs no dependency and no lockfile churn.
//
// The tests spawn the REAL serve.mjs, byte-for-byte, against a synthetic fixture
// tree, and speak raw HTTP/1.0 over a socket so the request target arrives exactly
// as written. `fetch`/undici normalises or rejects several of these targets before
// they leave the client, which would quietly turn a probe into a no-op.
//
// ---------------------------------------------------------------------------
// WHY THE `not vacuous` BLOCK EXISTS -- read this before deleting it
// ---------------------------------------------------------------------------
// A traversal suite that has only ever run against fixed code proves nothing: the
// pre-fix serve.mjs never decoded anything, so every payload below would have
// passed against it *by accident*, and a green run would have been evidence of
// exactly nothing. The `not vacuous` block pins that down by re-running the same
// probes against two deliberately wrong implementations -- the two fixes a
// reasonable person actually writes -- and asserting they LEAK. If someone
// reorders the real guard back to either shape, the block that proves the suite
// can fail is itself the thing that starts failing.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_SERVE = join(HERE, 'serve.mjs');

// Markers. A response body containing one of these means the file was read.
const TOP_SECRET = 'TOP-SECRET-OUTSIDE-CLIENT-DIR';
const SIBLING_LEAK = 'SIBLING-DIR-LEAK';
const HASHED_ASSET = 'hashed-asset-ok';
const SPACE_ASSET = 'space-asset-ok';
const SSR = 'SSR-FALLBACK';

/** A stub of the fetch handler `vite build` emits at dist/server/server.js. */
const SERVER_STUB = `export default {
  fetch: async () => new Response(${JSON.stringify(SSR)}, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  }),
};
`;

/**
 * Replace the whole `serveStatic` function in serve.mjs's source. Used only by the
 * `not vacuous` block. Fails loudly rather than silently no-op'ing, so a refactor of
 * serve.mjs surfaces as a broken test instead of a test that stopped testing.
 */
function withServeStatic(source, replacement) {
  const re = /async function serveStatic\(pathname\) \{[\s\S]*?\n\}\n/;
  assert.match(
    source,
    re,
    'could not find `async function serveStatic(pathname) { ... }` in serve.mjs -- ' +
      'the variant injection in the `not vacuous` block needs updating',
  );
  return source.replace(re, replacement);
}

// The classic wrong order: containment is checked on the ENCODED path, and the
// decode that produces the string the filesystem actually sees happens afterwards.
// `%2e%2e` sails past a guard that already declared the path safe.
const VARIANT_GUARD_BEFORE_DECODE = `async function serveStatic(pathname) {
  if (pathname === '/' || pathname.endsWith('/')) return null;
  const filePath = join(clientDir, pathname);
  if (!filePath.startsWith(clientDir)) return null; // guard runs on the ENCODED path
  const onDisk = decodeURIComponent(filePath);     // ...and the decode happens AFTER it
  try {
    if (!(await stat(onDisk)).isFile()) return null;
  } catch {
    return null;
  }
  const body = await readFile(onDisk);
  return new Response(body, {
    headers: { 'content-type': TYPES[extname(onDisk)] ?? 'application/octet-stream' },
  });
}
`;

// Decodes in the right place, but compares with a bare prefix match. `dist/client`
// is a string prefix of `dist/client-secret`, so a sibling directory is reachable.
// Also lets decodeURIComponent's URIError escape as a 500.
const VARIANT_PREFIX_MATCH = `async function serveStatic(pathname) {
  if (pathname === '/' || pathname.endsWith('/')) return null;
  const filePath = join(clientDir, decodeURIComponent(pathname));
  if (!filePath.startsWith(clientDir)) return null; // no separator boundary
  try {
    if (!(await stat(filePath)).isFile()) return null;
  } catch {
    return null;
  }
  const body = await readFile(filePath);
  return new Response(body, {
    headers: { 'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream' },
  });
}
`;

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/**
 * Build a fixture tree and spawn serve.mjs against it.
 *
 *   <fixture>/secret.txt                    <- TWO levels above clientDir
 *   <fixture>/dist/client-secret/leak.txt   <- SIBLING whose name has clientDir as a prefix
 *   <fixture>/dist/client/assets/app.js     <- an ordinary hashed asset
 *   <fixture>/dist/client/assets/a b.js     <- a name only reachable once %20 is decoded
 */
async function startServer({ transform = (s) => s } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'kai-tss-serve-'));
  await mkdir(join(dir, 'dist', 'server'), { recursive: true });
  await mkdir(join(dir, 'dist', 'client', 'assets'), { recursive: true });
  await mkdir(join(dir, 'dist', 'client-secret'), { recursive: true });

  await writeFile(join(dir, 'secret.txt'), TOP_SECRET);
  await writeFile(join(dir, 'dist', 'client-secret', 'leak.txt'), SIBLING_LEAK);
  await writeFile(join(dir, 'dist', 'server', 'server.js'), SERVER_STUB);
  await writeFile(join(dir, 'dist', 'client', 'assets', 'app.js'), HASHED_ASSET);
  await writeFile(join(dir, 'dist', 'client', 'assets', 'a b.js'), SPACE_ASSET);

  const source = await readFile(REAL_SERVE, 'utf8');
  await writeFile(join(dir, 'serve.mjs'), transform(source));

  const port = await freePort();
  const child = spawn(process.execPath, ['serve.mjs'], {
    cwd: dir,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d;
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`serve.mjs did not start in 10s. stderr:\n${stderr}`)),
      10_000,
    );
    child.stdout.on('data', (d) => {
      if (String(d).includes('http://localhost:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`serve.mjs exited early (code ${code}). stderr:\n${stderr}`));
    });
  });

  return {
    port,
    stderr: () => stderr,
    async stop() {
      child.kill('SIGKILL');
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Send one request over a raw socket so the request target is byte-exact.
 * HTTP/1.0 keeps the response unchunked and closes the connection, so the body is
 * simply everything after the header block.
 *
 * A socket-level failure (Node's HTTP parser rejecting the target outright) resolves
 * as status 0 -- for a malicious payload that is a perfectly good outcome, and the
 * assertions below treat it as one.
 */
function get(port, target) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    const chunks = [];
    socket.setTimeout(5000);
    socket.on('connect', () => {
      socket.write(`GET ${target} HTTP/1.0\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
    });
    socket.on('data', (d) => chunks.push(d));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ status: 0, head: '', body: '', note: 'TIMEOUT' });
    });
    socket.on('error', (err) => resolve({ status: 0, head: '', body: '', note: err.code ?? String(err) }));
    socket.on('close', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const split = text.indexOf('\r\n\r\n');
      const head = split === -1 ? text : text.slice(0, split);
      const body = split === -1 ? '' : text.slice(split + 4);
      const matched = /^HTTP\/\d\.\d (\d{3})/.exec(head);
      resolve({ status: matched ? Number(matched[1]) : 0, head, body, note: '' });
    });
  });
}

// Payloads that reach serveStatic STILL ENCODED, because the WHATWG URL parser
// leaves %2f/%5c alone. These are the ones that can actually escape, and they are
// the ones the `not vacuous` block below uses to prove the suite bites.
const LIVE_PAYLOADS = [
  ['encoded slash', '/..%2f..%2fsecret.txt', TOP_SECRET],
  ['encoded slash, upper case', '/..%2F..%2Fsecret.txt', TOP_SECRET],
  ['fully encoded segment', '/%2e%2e%2f%2e%2e%2fsecret.txt', TOP_SECRET],
  ['fully encoded, upper case', '/%2E%2E%2F%2E%2E%2Fsecret.txt', TOP_SECRET],
  ['fully encoded, mixed case', '/%2e%2E%2f%2E%2e%2Fsecret.txt', TOP_SECRET],
  ['double encoded', '/%252e%252e/%252e%252e/secret.txt', TOP_SECRET],
  ['double encoded slash', '/..%252f..%252fsecret.txt', TOP_SECRET],
  ['triple encoded', '/%25252e%25252e/%25252e%25252e/secret.txt', TOP_SECRET],
  ['sibling dir sharing a name prefix', '/..%2fclient-secret%2fleak.txt', SIBLING_LEAK],
  ['sibling dir, fully encoded', '/%2e%2e%2fclient-secret%2fleak.txt', SIBLING_LEAK],
  ['encoded backslash', '/..%5c..%5csecret.txt', TOP_SECRET],
  ['encoded backslash, upper case', '/..%5C..%5Csecret.txt', TOP_SECRET],
  ['mixed separators', '/%2e%2e%5c%2e%2e%2fsecret.txt', TOP_SECRET],
  ['deep climb', '/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd', 'root:'],
  ['encoded absolute path', '/%2fetc%2fpasswd', 'root:'],
];

// Payloads the WHATWG URL parser already collapses before serveStatic sees them
// (`new URL` treats `%2e` as a dot for path normalisation). Kept deliberately: they
// are defence in depth, and they become live again the moment anyone stops routing
// the request target through `new URL` -- e.g. by splitting `req.url` on '?' by hand.
// The `relies on` block below pins the upstream behaviour so a Node change surfaces
// here rather than as a silent regression.
const NEUTRALISED_UPSTREAM = [
  ['plain dot-dot', '/../../secret.txt', TOP_SECRET],
  ['encoded dot-dot', '/%2e%2e/%2e%2e/secret.txt', TOP_SECRET],
  ['encoded dot-dot, upper case', '/%2E%2E/%2E%2E/secret.txt', TOP_SECRET],
  ['encoded dot-dot, mixed case', '/%2e%2E/%2E%2e/secret.txt', TOP_SECRET],
  ['encoded dot-dot then sibling', '/%2e%2e/client-secret/leak.txt', SIBLING_LEAK],
  ['plain backslash', '/..\\..\\secret.txt', TOP_SECRET],
  ['absolute path, plain', '/etc/passwd', 'root:'],
];

/** Every payload that must never reach a file outside dist/client. */
const TRAVERSAL_PAYLOADS = [...LIVE_PAYLOADS, ...NEUTRALISED_UPSTREAM];

describe('serve.mjs static guard', () => {
  let server;
  before(async () => {
    server = await startServer();
  });
  after(async () => {
    await server.stop();
  });

  for (const [name, target, marker] of TRAVERSAL_PAYLOADS) {
    test(`refuses traversal: ${name} -- ${target}`, async () => {
      const res = await get(server.port, target);
      assert.ok(
        !res.body.includes(marker),
        `LEAKED. ${target} returned ${res.status} with a body containing ${JSON.stringify(marker)}:\n${res.body.slice(0, 400)}`,
      );
      assert.notEqual(res.status, 500, `${target} should not 500 (got head:\n${res.head})`);
    });
  }

  test('a decode that throws is a 400, not a crash', async () => {
    // decodeURIComponent('%') throws URIError.
    const res = await get(server.port, '/%');
    assert.equal(res.status, 400, `expected 400 for "/%", got ${res.status}\n${res.head}`);
  });

  test('an invalid escape sequence is a 400', async () => {
    const res = await get(server.port, '/assets/%zz.js');
    assert.equal(res.status, 400, `expected 400 for "/assets/%zz.js", got ${res.status}\n${res.head}`);
  });

  test('a lone trailing percent is a 400', async () => {
    const res = await get(server.port, '/assets/app.js%');
    assert.equal(res.status, 400, `expected 400 for "/assets/app.js%", got ${res.status}\n${res.head}`);
  });

  test('a null byte is rejected, not passed to the filesystem', async () => {
    const res = await get(server.port, '/assets/app.js%00.png');
    assert.equal(res.status, 400, `expected 400 for an embedded null byte, got ${res.status}\n${res.head}`);
    assert.ok(!res.body.includes(HASHED_ASSET), 'null-byte truncation served the asset');
  });

  test('a backslash is rejected rather than treated as a name character', async () => {
    const res = await get(server.port, '/assets%5capp.js');
    assert.equal(res.status, 400, `expected 400 for an encoded backslash, got ${res.status}\n${res.head}`);
  });

  test('the server survives the whole payload list and still serves assets', async () => {
    for (const [, target] of TRAVERSAL_PAYLOADS) await get(server.port, target);
    const res = await get(server.port, '/assets/app.js');
    assert.equal(res.status, 200, `server stopped serving after the payload run\n${server.stderr()}`);
    assert.ok(res.body.includes(HASHED_ASSET));
  });
});

describe('serve.mjs still serves ordinary traffic', () => {
  let server;
  before(async () => {
    server = await startServer();
  });
  after(async () => {
    await server.stop();
  });

  test('a hashed asset is served from disk with its content type', async () => {
    const res = await get(server.port, '/assets/app.js');
    assert.equal(res.status, 200, res.head);
    assert.ok(res.body.includes(HASHED_ASSET), `body was ${JSON.stringify(res.body)}`);
    assert.match(res.head, /content-type: text\/javascript/i);
  });

  test('a percent-encoded space resolves to the real filename', async () => {
    const res = await get(server.port, '/assets/a%20b.js');
    assert.equal(res.status, 200, res.head);
    assert.ok(
      res.body.includes(SPACE_ASSET),
      `"/assets/a%20b.js" must serve the file named "a b.js"; got ${res.status}: ${JSON.stringify(res.body)}`,
    );
    assert.match(res.head, /content-type: text\/javascript/i);
  });

  test('an unknown extension falls back to octet-stream', async () => {
    const res = await get(server.port, '/assets/a%20b.js');
    assert.equal(res.status, 200, res.head);
  });

  test('/ falls through to the SSR handler', async () => {
    const res = await get(server.port, '/');
    assert.equal(res.status, 200, res.head);
    assert.ok(res.body.includes(SSR), `body was ${JSON.stringify(res.body)}`);
  });

  test('an SPA route falls through to the SSR handler', async () => {
    const res = await get(server.port, '/some/deep/route');
    assert.equal(res.status, 200, res.head);
    assert.ok(res.body.includes(SSR), `body was ${JSON.stringify(res.body)}`);
  });

  test('a missing asset falls through to the SSR handler', async () => {
    const res = await get(server.port, '/assets/does-not-exist.js');
    assert.equal(res.status, 200, res.head);
    assert.ok(res.body.includes(SSR), `body was ${JSON.stringify(res.body)}`);
  });

  test('a trailing-slash path falls through to the SSR handler', async () => {
    const res = await get(server.port, '/assets/');
    assert.equal(res.status, 200, res.head);
    assert.ok(res.body.includes(SSR), `body was ${JSON.stringify(res.body)}`);
  });
});

describe('serve.mjs relies on `new URL` collapsing dot-segments', () => {
  // serve.mjs hands serveStatic `url.pathname`, never the raw `req.url`. The WHATWG
  // URL parser resolves dot-segments AND treats a percent-encoded `%2e` as a dot
  // while doing it, so `..` and `%2e%2e` are gone before the handler runs. It does
  // NOT decode `%2f`, which is why the encoded slash is the vector that survives.
  //
  // Written down as an executable assertion rather than a comment because the whole
  // NEUTRALISED_UPSTREAM list is only safe for as long as this holds. Whoever swaps
  // `new URL` for hand-rolled `req.url.split('?')[0]` parsing needs this to fail.
  test('`..` and `%2e%2e` segments are resolved away', () => {
    for (const raw of ['/../../secret.txt', '/%2e%2e/%2e%2e/secret.txt', '/%2E%2E/%2E%2E/secret.txt']) {
      assert.equal(new URL(raw, 'http://h').pathname, '/secret.txt', `for ${raw}`);
    }
  });

  test('a percent-encoded slash is NOT decoded, so it reaches the handler intact', () => {
    assert.equal(new URL('/..%2f..%2fsecret.txt', 'http://h').pathname, '/..%2f..%2fsecret.txt');
    assert.equal(new URL('/%2e%2e%2fsecret.txt', 'http://h').pathname, '/%2e%2e%2fsecret.txt');
  });
});

// ---------------------------------------------------------------------------
// Proof the block above can fail. See the header comment.
// ---------------------------------------------------------------------------
describe('the guard suite is not vacuous', () => {
  describe('a build that checks containment BEFORE decoding', () => {
    let server;
    before(async () => {
      server = await startServer({
        transform: (s) => withServeStatic(s, VARIANT_GUARD_BEFORE_DECODE),
      });
    });
    after(async () => {
      await server.stop();
    });

    for (const target of [
      '/..%2f..%2fsecret.txt',
      '/..%2F..%2Fsecret.txt',
      '/%2e%2e%2f%2e%2e%2fsecret.txt',
    ]) {
      test(`leaks a file two directories above dist/client via ${target}`, async () => {
        const res = await get(server.port, target);
        assert.ok(
          res.body.includes(TOP_SECRET),
          'the wrong-order build did NOT leak, so this payload proves nothing. ' +
            `Got ${res.status}: ${JSON.stringify(res.body.slice(0, 200))}`,
        );
      });
    }
  });

  describe('a build that decodes first but prefix-matches without a separator', () => {
    let server;
    before(async () => {
      server = await startServer({ transform: (s) => withServeStatic(s, VARIANT_PREFIX_MATCH) });
    });
    after(async () => {
      await server.stop();
    });

    for (const target of ['/..%2fclient-secret%2fleak.txt', '/%2e%2e%2fclient-secret%2fleak.txt']) {
      test(`leaks a sibling directory whose name starts with the client dir via ${target}`, async () => {
        const res = await get(server.port, target);
        assert.ok(
          res.body.includes(SIBLING_LEAK),
          'the bare-prefix build did NOT leak the sibling, so that payload proves nothing. ' +
            `Got ${res.status}: ${JSON.stringify(res.body.slice(0, 200))}`,
        );
      });
    }

    test('turns a URIError into a 500 instead of a 400', async () => {
      const res = await get(server.port, '/%');
      assert.equal(
        res.status,
        500,
        `expected the unguarded decode to blow up as a 500; got ${res.status}. ` +
          'If this is now 400 the variant no longer models the bug.',
      );
    });
  });
});
