/**
 * Records the bytes the APP sends to OpenRouter, without touching the app.
 *
 * The browser posts `{messages, intent, params}` to `/api/chat`; the tool
 * definitions are added server-side in `proxyOpenRouter`, so a capture taken in
 * the browser cannot see them at all — it is the wrong layer, and reading the
 * projection out of the registry instead would be inference, not bytes.
 *
 * Loaded with `NODE_OPTIONS=--import` into the dev server process, this patches
 * `globalThis.fetch` and appends every openrouter.ai request body to a JSONL
 * file. The Authorization header is NEVER recorded.
 */
import fs from 'node:fs';

const OUT = process.env.T9_UPSTREAM_LOG;
const real = globalThis.fetch;

globalThis.fetch = async function (input, init) {
  try {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));
    if (OUT && url.includes('openrouter.ai')) {
      const body = init?.body;
      fs.appendFileSync(
        OUT,
        JSON.stringify({
          at: new Date().toISOString(),
          url,
          method: init?.method ?? 'GET',
          headerNames: Object.keys(init?.headers ?? {}),
          bodyBytes: typeof body === 'string' ? body.length : null,
          body: typeof body === 'string' ? body : null,
        }) + '\n',
      );
    }
  } catch {
    // A capture must never be able to break the request it is watching.
  }
  return real.call(this, input, init);
};
