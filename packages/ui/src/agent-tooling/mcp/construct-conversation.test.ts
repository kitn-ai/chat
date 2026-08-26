import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { constructTool } from './tools/construct';
import { validateConstruct } from '../construct/schema';
import { generateProject } from '../construct/codegen';

const text = (r: { content: { type: string; text?: string }[] }) =>
  r.content.map((c) => c.text ?? '').join('\n');

// The spec's e2e: a scripted agent session builds the owner's four-sentence
// widget, every turn validated, and the RESULT RUNS — the "runs" half is
// verify:construct, which compiles this exact fixture (owner-widget) as a
// named cell; this test pins that the conversation PRODUCES that fixture.
describe('four-sentence conversational construction', () => {
  const finalConstruct = {
    $schema: 'https://ui.kitn.ai/schemas/construct/v1.json',
    name: 'acme-support',
    layout: 'widget',
    provider: { mode: 'mock' },
    capabilities: {
      attachments: { accept: ['image/*', 'application/pdf'] },
      history: { persistence: 'local' },
      starters: ["Where's my order?", 'Request a refund'],
    },
  };

  it('every turn of the scripted session is accepted; a hostile turn is not', async () => {
    // Turn 1: intent only — starter comes back, widget implied.
    const t1 = await constructTool.handler({ intent: 'a support widget for our site' });
    expect(text(t1)).toContain('"layout": "widget"');

    // Turns 2-4: the agent grows the SAME file, full construct each turn.
    const turns = [
      { ...finalConstruct, capabilities: { attachments: finalConstruct.capabilities.attachments } },
      { ...finalConstruct, capabilities: { attachments: finalConstruct.capabilities.attachments, history: finalConstruct.capabilities.history } },
      finalConstruct,
    ];
    for (const construct of turns) {
      expect(text(await constructTool.handler({ construct }))).toContain('VALID');
    }

    // A turn-40-style bad edit bounces: the spine has no wiring to break, and
    // logic is not vocabulary.
    const bad = await constructTool.handler({
      construct: { ...finalConstruct, onMessage: "fetch('https://evil.example')" },
    });
    expect(text(bad)).toContain('REJECTED');
    expect(text(bad)).toContain('onMessage');
  });

  it('the conversation result IS the checked-in gate fixture', () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(__dirname, '../construct/fixtures/owner-widget.construct.json'),
        'utf8',
      ),
    );
    expect(fixture).toEqual(finalConstruct);
  });

  it('and it generates the full wiring', () => {
    const out = validateConstruct(finalConstruct);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const app = generateProject(out.construct).find((f) => f.path === 'src/App.tsx')!.code;
    // NOTE (deviation from brief): the brief's literal marker list was
    // ['readAsDataURL', 'localStorage', 'PromptSuggestion', '<Dock']. Codegen
    // (Tasks 12/13, closed) deliberately does NOT hand-roll readAsDataURL —
    // ChatThread/DefaultPromptInput already own the whole attach round-trip,
    // and codegen.test.ts:355 pins `app).not.toContain('readAsDataURL')` as
    // the intended behavior. Likewise starters wire through ChatThread's own
    // `suggestions` prop, never a `PromptSuggestion` component/string. Markers
    // below assert the real wiring signals instead: `attach={true}` for the
    // attachments round-trip and `suggestions={` for starters.
    for (const marker of ['attach={true}', 'localStorage', 'suggestions={', '<Dock']) {
      expect(app).toContain(marker);
    }
  });
});
