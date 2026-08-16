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
});
