import { beforeAll, describe, expect, it } from 'vitest';
import { chatRoutePreamble } from '../../src/agent-tooling/route-emit';
import { scaffold } from '../../src/agent-tooling/mcp/tools/scaffold';

describe('chatRoutePreamble: the route survives a bare GET (F-10)', () => {
  const decl = chatRoutePreamble('const x = readChatRequest(request);').decl.join('\n');

  it('readChatRequest refuses non-POST with a 405-class error', () => {
    expect(decl).toMatch(/method\s*!==\s*'POST'/);
    expect(decl).toMatch(/405/);
  });
  it('readChatRequest maps an unparseable body to a 400-class error, not a thrown SyntaxError', () => {
    expect(decl).toMatch(/try\s*\{[\s\S]*request\.json\(\)[\s\S]*\}\s*catch/);
    expect(decl).toMatch(/400/);
  });
  it('readChatRequest refuses a body without a messages array (400)', () => {
    expect(decl).toMatch(/Array\.isArray[\s\S]*messages/);
  });
  it('exposes toChatErrorResponse so every fragment maps the error to a Response', () => {
    expect(decl).toMatch(/function toChatErrorResponse/);
  });
});

/**
 * The Vite dev-server bridge, which is the surface F-10 was MEASURED on.
 *
 * The 405 guard above is emitted into every route, but the middleware builds the
 * `Request` it hands `chatHandler` itself — so if it hard-codes the method, a bare
 * `GET /api/chat` arrives as a POST with an empty body and comes back 400 "not
 * valid JSON". The guard compiles, ships and can never run: measured 400, not 405,
 * on all 27 Vite cells. These read the emitted TEXT because that is the only thing
 * a consumer pastes; `verify-scaffold-compiles.mjs` carries the same assertion over
 * every cell.
 */
describe('the emitted Vite middleware bridges the REAL request (F-10, review Important 1/2)', () => {
  // Scoped to the `vite-chat-api.ts` chunk, NOT to the whole scaffold text: the
  // block also contains the handler, the front end and a page of prose, any of
  // which can satisfy a loose `console.error(` match and turn these green while
  // the middleware itself is unchanged.
  let middleware = '';

  beforeAll(async () => {
    const out = await scaffold.handler({
      useCase: 'drop-in-chat',
      integration: 'openai',
      placement: 'full-page',
      framework: 'react',
    });
    const block = (out.content as { type: string; text: string }[])[0].text;
    expect(block).toMatch(/Vite dev-server middleware/);
    const start = block.indexOf('vite-chat-api.ts');
    const end = block.indexOf('vite.config.ts', start + 1);
    expect(start, 'no vite-chat-api.ts chunk in the emitted block').toBeGreaterThan(-1);
    expect(end, 'no vite.config.ts chunk after it').toBeGreaterThan(start);
    middleware = block.slice(start, end);
    expect(middleware).toMatch(/chatHandler\(/);
  });

  it('does not hard-code POST when building the Request', () => {
    expect(middleware).not.toMatch(/method:\s*'POST'/);
  });

  it('forwards req.method through the bridge, so a bare GET reaches the 405 guard', () => {
    expect(middleware, 'the middleware never reads the incoming method').toMatch(/req\.method/);
    const init = /new Request\(([\s\S]*?)\n\s*\);/.exec(middleware)?.[1] ?? '';
    // Either `method,` (shorthand off the local) or `method: <expr naming method>`.
    expect(init, 'the Request the middleware builds does not carry a forwarded method').toMatch(
      /\bmethod\s*(?:,|:\s*(?!['"`])[^,\n]*\bmethod\b)/,
    );
  });

  it('does not hand a body to a method that cannot carry one', () => {
    // `new Request(url, { method: 'GET', body })` THROWS in undici — passing the
    // real method through without this turns a 405 into a 500.
    expect(middleware).toMatch(/'GET'|'HEAD'|hasBody/);
  });

  it('binds and logs the caught error instead of laundering it into eight generic words', () => {
    expect(middleware).toMatch(/catch\s*\(\s*[A-Za-z_$][\w$]*\s*\)/);
    expect(middleware).toMatch(/console\.error\(/);
  });
});
