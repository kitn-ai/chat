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

export const MOCK_TOOL_OUTPUTS = {
  read_document: { pages: 14, headline: 'Revenue up 12% QoQ; retention flat.' },
};

export const SUGGESTIONS = ['Summarize a document', 'Draft the Q3 board update', 'Compare two options'];

// The model switcher recipe's data. Both entries are the same scripted mock
// (the honest option: no provider is contacted either way); a real backend
// reads the selected id off the submit handler and routes accordingly.
export const MODELS = [
  { id: 'kai-mock', name: 'Mock Standard', description: 'The scripted local responder' },
  { id: 'kai-mock-thinking', name: 'Mock Thinking', description: 'Same script, same mock' },
];
