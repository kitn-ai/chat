import { describe, expect, it } from 'vitest';
import { constructTool } from './tools/construct';
import { createServer } from './server';
import { buildableTemplates } from '../construct/templates';

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

describe('starter templates come from the registry (B-17c)', () => {
  it('a clearly implied intent returns THAT template starter, stated', async () => {
    const r = await constructTool.handler({ intent: 'a research tool with cited sources' });
    const out = text(r);
    expect(out).toContain('"layout": "fullscreen"');
    expect(out).toContain('"strip": true'); // research's defining fact rides along
    expect(out).toMatch(/template: research/i); // stated, not asked
    expect(out).not.toMatch(/which template/i);
  });

  it('an unclear intent lists the buildable templates and asks which', async () => {
    const r = await constructTool.handler({ intent: 'something for my site' });
    const out = text(r);
    for (const t of buildableTemplates()) {
      expect(out).toContain(t.id);
      expect(out).toContain(t.description);
    }
    expect(out).toMatch(/which template/i);
    expect(out).not.toContain('voice'); // menu-honesty: story-only never offered
  });

  it('the starter is the registry object with only the name swapped (never a mutated registry)', async () => {
    const before = JSON.stringify(buildableTemplates().find((t) => t.id === 'widget')!.starter);
    const r = await constructTool.handler({ intent: 'an embedded support widget' });
    const out = text(r);
    expect(out).toContain('"name": "my-chat"');
    expect(out).toContain('"title": "Support"'); // widget starter chrome rides along
    expect(JSON.stringify(buildableTemplates().find((t) => t.id === 'widget')!.starter)).toBe(before);
  });

  it('intent patterns are word-boundary anchored, not unanchored substrings (regression: "resources" ≠ "sources", "japanese" ≠ "pane")', async () => {
    const resources = text(
      await constructTool.handler({ intent: 'a tool to manage company resources' }),
    );
    expect(resources).toMatch(/which template/i);
    expect(resources).not.toMatch(/template: research/i);

    const japanese = text(await constructTool.handler({ intent: 'a japanese language tutor' }));
    expect(japanese).toMatch(/which template/i);
    expect(japanese).not.toMatch(/template: workspace/i);
  });
});
