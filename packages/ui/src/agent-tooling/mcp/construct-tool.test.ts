import { describe, expect, it } from 'vitest';
import { constructTool } from './tools/construct';
import { createServer } from './server';

const text = (r: { content: { type: string; text?: string }[] }) =>
  r.content.map((c) => c.text ?? '').join('\n');

describe('the construct MCP tool', () => {
  it('is registered on the server', () => {
    expect(createServer().__listToolsForTest()).toContain('construct');
  });

  it('intent alone returns a starter construct and only real-choice questions', async () => {
    const r = await constructTool.handler({
      intent: 'a support widget for our order page',
    });
    const out = text(r);
    expect(out).toContain('"layout": "widget"'); // implied by "widget" — stated, not asked
    expect(out).toContain('"mode": "mock"');
    expect(out).toContain('https://ui.kitn.ai/schemas/construct/v1.json');
    expect(out).not.toMatch(/which layout/i);
  });

  it('a bad turn is rejected with paths and reasons, not an error', async () => {
    const r = await constructTool.handler({
      construct: { name: 'acme-support', layout: 'popup', provider: { mode: 'mock' } },
    });
    expect(r.isError).not.toBe(true);
    const out = text(r);
    expect(out).toContain('REJECTED');
    expect(out).toContain('layout');
    expect(out).toMatch(/previous good construct/i);
  });

  it('a valid turn echoes the construct and the kai dev command', async () => {
    const r = await constructTool.handler({
      construct: { name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } },
    });
    const out = text(r);
    expect(out).toContain('VALID');
    expect(out).toContain('kai dev');
  });

  it('endpoint constructs get pointed at the scaffold tool for the route', async () => {
    const r = await constructTool.handler({
      construct: {
        name: 'acme-support',
        layout: 'widget',
        provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
      },
    });
    expect(text(r)).toContain('scaffold');
  });
});
