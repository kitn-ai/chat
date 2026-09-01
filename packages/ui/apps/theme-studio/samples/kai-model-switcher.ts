// Sample data for <kai-model-switcher>.
//
// `models` is scalar:false — a JS property (array) that must be seeded here so
// the Playground and Examples display a real picker instead of a blank trigger.
// `currentModel` is scalar:true (attribute), so it lives in config={} not here.
//
// `sample`  = default models shown by the playground + bare examples
// `named`   = alternate model sets referenced by <Example data="…">

export default {
  sample: {
    models: [
      { id: 'claude-opus', name: 'Claude Opus', provider: 'Anthropic' },
      { id: 'claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic' },
      { id: 'claude-haiku', name: 'Claude Haiku', provider: 'Anthropic' },
    ],
  },
  named: {
    multiProvider: {
      models: [
        { id: 'claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic' },
        { id: 'claude-haiku', name: 'Claude Haiku', provider: 'Anthropic' },
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
        { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'OpenAI' },
      ],
    },
    preselected: {
      models: [
        { id: 'claude-opus', name: 'Claude Opus', provider: 'Anthropic' },
        { id: 'claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic' },
        { id: 'claude-haiku', name: 'Claude Haiku', provider: 'Anthropic' },
      ],
    },
  },
};
