import { describe, expect, it } from 'vitest';
import { chatRoutePreamble } from '../../src/agent-tooling/route-emit';

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
