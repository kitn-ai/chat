// The scripted mock: a rich first conversation (reasoning, a settled tool
// call, citations), so the block demos what the components render, not two
// plain text bubbles. Leaf module by design - constants only - so the CDN-form
// generator can inline it. Swap createMockResponder for a fetch to your
// endpoint to go live.
export const MOCK_SCRIPT = [
  {
    reasoning:
      'Summarizing means reading first. Fetch the document, then compress - numbers before narrative.',
    text: 'Reading q3-metrics.pdf now.',
    toolCalls: [{ name: 'read_document', arguments: { name: 'q3-metrics.pdf' } }],
  },
  {
    reasoning:
      'The numbers agree across sections. Cite where each claim comes from so the strip below is real.',
    text:
      'Summary: revenue up 12% QoQ, retention flat, both launches on schedule. ' +
      "(I'm a local mock - no provider was contacted - but these citations render through the exact path a real model's take.)",
    sources: [
      {
        url: 'https://ui.kitn.ai/guides/state-and-hooks/',
        title: 'State and hooks - AI/UI docs',
        snippet: 'A message is an ordered list of parts: text, reasoning, tool, card, source, file.',
      },
      {
        url: 'https://ui.kitn.ai/guides/recipes/wire-adapter/',
        title: 'The wire adapter - AI/UI docs',
      },
    ],
  },
  {
    text: 'Anything else? Still the mock: swap the provider seam for your endpoint and this handler keeps its exact shape.',
  },
];

/** Settled outputs the mock hands back, keyed by tool type. Annotated rather
 *  than inferred: the controller looks one up by the type the stream reports,
 *  which is a string, and an inferred object literal has no index signature to
 *  read it with. */
export const MOCK_TOOL_OUTPUTS: Record<string, Record<string, unknown>> = {
  read_document: { pages: 14, headline: 'Revenue up 12% QoQ; retention flat.' },
};

export const SUGGESTIONS = ['Summarize a document', 'Draft the Q3 board update', 'Compare two options'];

/** One entry of the model switcher's `models` property. Named here because
 *  the controller carries the list as a State field and the generated react
 *  tree types that field. */
export interface ModelOption {
  id: string;
  name: string;
  description?: string;
}

// The model switcher recipe's data. Both entries are the same scripted mock
// (the honest option: no provider is contacted either way); a real backend
// reads the selected id off the submit handler and routes accordingly.
export const MODELS: ModelOption[] = [
  { id: 'kai-mock', name: 'Mock Standard', description: 'The scripted local responder' },
  { id: 'kai-mock-thinking', name: 'Mock Thinking', description: 'Same script, same mock' },
];
