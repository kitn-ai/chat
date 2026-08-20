import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './server';

/**
 * This package's package.json, read off disk by path — deliberately NOT through the
 * `@kitn.ai/ui/package.json` specifier the code under test uses, so the two sides are
 * independent reads rather than one read compared with itself.
 */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8')) as {
  name?: string;
  version?: string;
};

describe('createServer', () => {
  it('registers exactly the four tools (helper)', () => {
    const tools = createServer().__listToolsForTest();
    expect(tools.sort()).toEqual(['component_reference', 'debug', 'scaffold', 'theme']);
  });

  // ── serverInfo ──────────────────────────────────────────────────────────────
  //
  // The version the harness is told on `initialize`. It sat hand-typed at 0.15.0
  // while the kit shipped ten minors past it, and nothing here noticed, because
  // nothing here looked. Both tests below have to fail for that to come back: the
  // first catches a literal that has drifted, the second catches one typed while it
  // is still correct — which is the state every stale literal starts in.

  it("reports THIS package's name and version on initialize", async () => {
    // Anchor first: prove the file this test read is ours and carries a real
    // version, so the comparison below cannot be undefined === undefined.
    expect(pkg.name).toBe('@kitn.ai/ui');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);

    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    // What a harness actually reads back: the serverInfo off the initialize result.
    expect(client.getServerVersion()).toMatchObject({
      name: pkg.name,
      version: pkg.version,
    });

    await client.close();
    await server.close();
  });

  it('derives that version instead of holding a literal in the source', () => {
    // Comments stripped first: the note in server.ts quotes the 0.15.0 literal this
    // replaced, and a record of the bug must not read as the bug.
    const source = readFileSync(join(packageRoot, 'src/agent-tooling/mcp/server.ts'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const literals = source.match(/['"`]\d+\.\d+\.\d+[^'"`]*['"`]/g) ?? [];
    expect(
      literals,
      `server.ts must not carry a version literal — read it from package.json instead. ` +
        `Found: ${literals.join(', ')}`,
    ).toEqual([]);
  });

  it('lists the four tools end-to-end over an in-memory transport', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'component_reference',
      'debug',
      'scaffold',
      'theme',
    ]);
    // Every tool must advertise a JSON Schema object (protocol requirement).
    for (const t of tools) {
      expect(t.inputSchema).toMatchObject({ type: 'object' });
    }

    await client.close();
    await server.close();
  });

  it('dispatches a tool call to its handler', async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({ name: 'component_reference', arguments: {} });
    // component_reference with no args returns the list of all kai-* elements
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/kai-chat/);

    await client.close();
    await server.close();
  });

  // ── argument validation at dispatch ─────────────────────────────────────────
  //
  // Every tool advertises `additionalProperties: false` and a `required` list over
  // the protocol, and the dispatch handler used to enforce neither: it handed
  // `request.params.arguments` straight to the handler. The observed failure
  // (candidate A, twice reproduced — see the ladder spec and the W1 harness
  // report): component_reference called with { element: "kai-chat" } instead of
  // { name: "kai-chat" } silently returned the full 80+-element index with
  // isError unset, which reads as a successful answer to the question asked.
  // These tests pin the loud version, uniformly across all four tools, from the
  // ONE validation path in validate-args.ts.

  async function connectedClient() {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const close = async () => {
      await client.close();
      await server.close();
    };
    return { client, close };
  }

  function firstText(result: unknown): string {
    const { content } = result as { content: { type: string; text: string }[] };
    return content[0].text;
  }

  it('rejects an unknown argument key instead of silently answering a different question', async () => {
    const { client, close } = await connectedClient();

    const result = await client.callTool({
      name: 'component_reference',
      arguments: { element: 'kai-chat' },
    });

    expect(result.isError).toBe(true);
    const text = firstText(result);
    // The error teaches: names the wrong key, suggests the right one, and shows
    // the expected arguments — not just "invalid".
    expect(text).toMatch(/unknown argument "element"/i);
    expect(text).toMatch(/did you mean "name"/i);
    expect(text).toMatch(/component_reference/);
    // And it must NOT be the silent index the bug returned.
    expect(text).not.toMatch(/AI\/UI elements \(\d+ total\)/);

    await close();
  });

  it('suggests the near-miss spelling for a typoed key', async () => {
    const { client, close } = await connectedClient();

    const result = await client.callTool({
      name: 'scaffold',
      arguments: { framwork: 'react', integration: 'mock', placement: 'full-page' },
    });

    expect(result.isError).toBe(true);
    const text = firstText(result);
    expect(text).toMatch(/unknown argument "framwork"/i);
    expect(text).toMatch(/did you mean "framework"/i);

    await close();
  });

  it('rejects missing required keys, naming each one', async () => {
    const { client, close } = await connectedClient();

    const result = await client.callTool({ name: 'scaffold', arguments: { useCase: 'drop-in-chat' } });

    expect(result.isError).toBe(true);
    const text = firstText(result);
    for (const key of ['integration', 'placement', 'framework']) {
      expect(text).toMatch(new RegExp(`missing required argument "${key}"`, 'i'));
    }

    await close();
  });

  it('validates every tool through the same path (unknown key errors on all four)', async () => {
    const { client, close } = await connectedClient();

    for (const name of ['component_reference', 'scaffold', 'theme', 'debug']) {
      const result = await client.callTool({
        name,
        ...(name === 'scaffold'
          ? { arguments: { integration: 'mock', placement: 'full-page', framework: 'html', bogus: 1 } }
          : { arguments: { bogus: 1 } }),
      });
      expect(result.isError, `${name} should reject an unknown key`).toBe(true);
      expect(firstText(result)).toMatch(/unknown argument "bogus"/i);
    }

    await close();
  });

  it('still answers a correct call after validation is in place', async () => {
    const { client, close } = await connectedClient();

    const result = await client.callTool({
      name: 'component_reference',
      arguments: { name: 'kai-chat' },
    });
    expect(result.isError).toBeFalsy();
    expect(firstText(result)).toMatch(/<kai-chat>/);

    await close();
  });
});
