import { z } from 'zod';
import { Scenario, type TScenario } from './catalog-types';

/**
 * The acceptance deck, spec §6. Normative: written BEFORE the catalog so the
 * catalog is built toward a measurement. The harness gives an agent the catalog
 * and NO kit source; whatever it cannot build names what the catalog is missing.
 */
export const scenarios: TScenario[] = [
  {
    id: 'S1',
    prompt:
      'I already have <kai-chat> in my React app. Add a conversations sidebar and let assistant replies open artifacts in a side panel.',
    needs: ['composition validity', 'wiring topology', 'invariant:reactivity-two-halves'],
    depth: 'surface recipe applied to an existing tree',
    scoring: [
      'emitted code compiles under the react consumer tsc project',
      'kai-conversations and kai-artifact register and render',
      'kai-conversation-select wiring updates kai-chat.messages with a new array AND new changed-item objects',
    ],
  },
  {
    id: 'S2',
    prompt:
      'Add an AI chat to this Vue app. Messages stream from our existing /api/chat endpoint that speaks OpenAI SSE.',
    needs: ['ingredient contracts', 'invariant:kit-parses-consumer-fetches', 'backend: consumer-owned endpoint'],
    depth: 'greenfield, contract',
    scoring: [
      'imports readOpenAIStream from @kitn.ai/ui/wire; no hand-rolled SSE reader anywhere in the output',
      'streams correctly against a mock OpenAI-SSE wire fixture',
      'compiles under the vue consumer path',
    ],
  },
  {
    id: 'S3',
    prompt: 'Give the prompt input slash-commands and voice, like your command palette demo.',
    needs: ['ingredient configuration space', 'function-valued property contract (transcribe)'],
    depth: 'capability',
    scoring: [
      'transcribe is set as a function-valued JS property, not an attribute',
      'the slash-command trigger is wired per the ingredient contract',
    ],
  },
  {
    id: 'S4',
    prompt: 'Build me a Perplexity-style research UI: sources, reasoning panel, follow-up suggestions.',
    needs: ['surface recipes'],
    depth: 'whole surface; expected to fail hardest first',
    scoring: ['human eyeball against the perplexity Labs/App story', 'compiles and registers'],
  },
  {
    id: 'S5',
    prompt:
      "I'm on WordPress. No build step. Give me a script tag for a support chat widget that talks to my service at https://example.com/chat.",
    needs: ['delivery target: script-tag', 'invariant:upgrade-race', 'widget recipe', 'backend: consumer-owned endpoint'],
    depth: 'platform embed',
    scoring: [
      'script-tag only, no bundler assumed',
      'the output acknowledges the upgrade race per the open invariant (props set after registration, or the documented gate)',
      'human eyeball in a plain HTML page',
    ],
  },
  {
    id: 'S6',
    prompt: 'Add a spreadsheet-grid message type showing live cell edits.',
    needs: ['the honesty bound: refuse what is not composable from these parts'],
    depth: 'refusal',
    scoring: [
      'the agent refuses loudly, naming that no such element exists, instead of inventing <kai-datagrid>',
      'no fabricated tag appears in the output',
    ],
  },
  {
    id: 'S7',
    prompt: 'My messages render but nothing updates while streaming.',
    needs: ['invariant diagnosis fields'],
    depth: 'debugging',
    scoring: [
      'the answer identifies the reactivity-two-halves cause: same array reference, or same item object identity',
      'the fix it proposes matches the invariant statement',
    ],
  },
];

export function listScenarios(): TScenario[] {
  return z.array(Scenario).parse(scenarios);
}
