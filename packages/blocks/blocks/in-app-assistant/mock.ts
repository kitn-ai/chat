// The scripted mock: a rich thread on first paint (reasoning + a settled
// search_docs call), so the block demos what the components render. No
// citations by design - this matches the in-app assistant template's
// capability set, which declares no sources strip. Leaf module by design -
// constants only - so the CDN-form generator can inline it. Swap
// createMockResponder for a fetch to your endpoint to go live.
export const MOCK_SCRIPT = [
  {
    reasoning: 'A question about the current page. Search the docs before answering from memory.',
    text: 'Checking the docs for that.',
    toolCalls: [{ name: 'search_docs', arguments: { query: 'deploy checklist' } }],
  },
  {
    text:
      'Found it: the deploy checklist wants a green canary before promoting. ' +
      "(Local mock, no provider contacted - the tool row above streamed through the kit's real parser.)",
  },
  {
    reasoning: 'Follow-up. Keep it short.',
    text: 'Anything else on this page? Swap the mock for your endpoint and this handler does not change shape.',
  },
];

/** Settled outputs the mock hands back, keyed by tool type. Annotated rather
 *  than inferred: the controller looks one up by the type the stream reports,
 *  which is a string, and an inferred object literal has no index signature to
 *  read it with. */
export const MOCK_TOOL_OUTPUTS: Record<string, Record<string, unknown>> = {
  search_docs: { matches: 3, top: 'Deploy checklist - promote only on a green canary.' },
};

export const SUGGESTIONS = ['Deploy payments to production', 'Check the canary status'];

/** One entry of the composer's `triggers` property. Named here because the
 *  controller carries the list as a State field and the generated react tree
 *  types that field. */
export interface ComposerTrigger {
  char: string;
  kind: string;
  items: { id: string; label: string; description?: string }[];
}

// Composer triggers (the in-app assistant template's set): slash commands and
// mention targets, inserted as atomic pills. Presentation vocabulary for the
// composer; a real backend expands the entities server-side.
export const TRIGGERS: ComposerTrigger[] = [
  {
    char: '/',
    kind: 'skill',
    items: [
      { id: 'summarize', label: 'summarize', description: 'Summarize the thread so far' },
      { id: 'explain', label: 'explain', description: 'Explain the current page' },
    ],
  },
  {
    char: '@',
    kind: 'agent',
    items: [
      { id: 'docs', label: 'docs', description: 'Search the documentation' },
      { id: 'support', label: 'support', description: 'Hand off to a person' },
    ],
  },
];
