// Spike scaffolding: ids, the scenario rail, and the composer suggestions.
// There is no canned responder here: every reply comes from a real model.

export function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2);
}

export interface Scenario {
  id: string;
  title: string;
  prompt: string;
  /** Which component the result is meant to land in. */
  targets: string;
  scope: { type: 'collection' };
  messageCount: number;
  lastMessageAt: string;
  updatedAt: string;
}

const now = new Date().toISOString();
const scenario = (id: string, title: string, prompt: string, targets: string): Scenario => ({
  id,
  title,
  prompt,
  targets,
  scope: { type: 'collection' },
  messageCount: 0,
  lastMessageAt: now,
  updatedAt: now,
});

/** Each scenario is a one-click prompt aimed at a different kit component. */
export const SCENARIOS: Scenario[] = [
  scenario('weather', '1 · Tool panel', "What's the weather in Paris?", 'kai-tool'),
  scenario('docs', '2 · Sources row', 'How does theming work in @kitn.ai/ui? Cite your sources.', 'kai-sources'),
  scenario('confirm', '3 · Confirm card', 'Redeploy the staging environment for me.', 'kai-cards'),
  scenario(
    'combo',
    '4 · All three',
    'Check the weather in Tokyo, look up how streaming works, then offer to publish a summary.',
    'kai-tool + kai-sources + kai-cards',
  ),
  scenario('plain', '5 · No tools', 'In two sentences, what is a web component?', 'plain text + reasoning'),
];

export const SUGGESTIONS = SCENARIOS.slice(0, 3).map((s) => s.prompt);
