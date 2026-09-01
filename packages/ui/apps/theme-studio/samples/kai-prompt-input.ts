// Sample data for <kai-prompt-input> non-scalar props.
//
// `suggestions`, `triggers`, and `attachments` are
// scalar:false — they must be seeded here so the Playground and Examples
// render meaningful content instead of an empty composer.
//
// `sample`  = default non-scalar prop data shown by the playground + bare examples
// `named`   = alternate sets referenced by <Example data="…">

function imgData(fill: string, glyph: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="12" fill="${fill}"/><text x="48" y="60" font-size="42" text-anchor="middle" fill="white">${glyph}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const DEFAULT_SUGGESTIONS = [
  'Summarize this thread',
  'Draft a reply',
  'Explain like I am five',
];

const SAMPLE_ATTACHMENTS = [
  { id: 'a1', type: 'file', filename: 'architecture.png', mediaType: 'image/png', url: imgData('#7c3aed', '◆') },
  { id: 'a2', type: 'file', filename: 'spec.pdf', mediaType: 'application/pdf' },
];

// Rich entity triggers: `/` → skills, `@` → agents + plugins (one sectioned menu).
const ENTITY_TRIGGERS = [
  {
    char: '/',
    kind: 'skill',
    items: [
      { id: 'summarize', label: 'Summarize', description: 'Summarize the thread', promptText: 'Summarize the thread.' },
      { id: 'translate', label: 'Translate', description: 'Translate to English', promptText: 'Translate to English.' },
      { id: 'rewrite', label: 'Rewrite', description: 'Rewrite for clarity', promptText: 'Rewrite this for clarity.' },
    ],
  },
  {
    char: '@',
    kind: 'agent',
    items: [
      { id: 'documents', label: 'Documents', kind: 'plugin', group: 'Plugins', icon: imgData('#2563eb', 'D'), description: 'Create and edit documents', data: { plugin: 'documents' } },
      { id: 'code-reviewer', label: 'Code Reviewer', group: 'Agents', description: 'Reviews diffs for bugs', promptText: 'Hand this to the Code Reviewer agent.' },
      { id: 'researcher', label: 'Researcher', group: 'Agents', description: 'Deep multi-source research' },
    ],
  },
];

// A ComposerDoc seed: text interleaved with atomic entity pills.
const PREFILLED_DOC = [
  { type: 'text', text: 'Review ' },
  { type: 'entity', entity: { kind: 'skill', id: 'summarize', label: 'Summarize', promptText: 'Summarize the thread.' } },
  { type: 'text', text: ' then ask ' },
  { type: 'entity', entity: { kind: 'agent', id: 'code-reviewer', label: 'Code Reviewer' } },
  { type: 'text', text: ' to use ' },
  { type: 'entity', entity: { kind: 'plugin', id: 'documents', label: 'Documents', icon: imgData('#2563eb', 'D'), data: { plugin: 'documents' } } },
  { type: 'text', text: '.' },
];

export default {
  // Default playground sample: suggestions only (most common starting point)
  sample: {
    suggestions: DEFAULT_SUGGESTIONS,
  },
  named: {
    // Starter suggestions only — fills the chip row above the input
    withSuggestions: {
      suggestions: DEFAULT_SUGGESTIONS,
    },
    // Pre-populated attachments seeded via the attachments property
    withAttachments: {
      attachments: SAMPLE_ATTACHMENTS,
      suggestions: DEFAULT_SUGGESTIONS,
    },
    // Loading / streaming state with stoppable stop button
    loading: {
      suggestions: DEFAULT_SUGGESTIONS,
    },
    // Entity pills — type `/` for a skill or `@` for an agent/plugin
    withEntityPills: {
      triggers: ENTITY_TRIGGERS,
    },
    // Pre-populated pills seeded via `value` as a ComposerDoc
    prefilledDoc: {
      triggers: ENTITY_TRIGGERS,
      value: PREFILLED_DOC,
    },
  },
};
