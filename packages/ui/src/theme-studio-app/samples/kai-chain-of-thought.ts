// Sample data for <kai-chain-of-thought>.
//
// `steps` is the only prop and it is scalar:false (a JS property array),
// so all sample data lives here.
//
// `sample`  = default steps shown by the Playground + bare <Example> calls.
// `named`   = alternate step sets referenced by <Example data="…">.

// Default playground sample — a three-step reasoning trace matching the
// Storybook Default story, with the last step having no expandable detail.
const DEFAULT_STEPS = [
  { label: 'Understand the request', content: 'The user wants a composable set of web components.' },
  { label: 'Design the API', content: 'Route 1: variant + flags + events; rich data via properties.' },
  { label: 'Build & verify' },
];

// A longer agent-plan trace — five steps covering a realistic code-review flow.
const AGENT_PLAN_STEPS = [
  { label: 'Read the diff', content: 'Fetched the latest pull request diff from GitHub — 14 files changed, +312 / −87 lines.' },
  { label: 'Identify affected areas', content: 'Changes touch the auth middleware, the user profile API, and three React components.' },
  { label: 'Check for regressions', content: 'Running the test suite against the changed modules — 48 tests pass, 0 fail.' },
  { label: 'Review security implications', content: 'The new session token rotation logic looks correct; no CSRF surface added.' },
  { label: 'Write summary' },
];

// A short two-step trace — both steps have expandable detail.
const SHORT_STEPS = [
  { label: 'Parse the query', content: 'Tokenised the natural-language query and matched it against the schema.' },
  { label: 'Generate SQL', content: 'SELECT id, name, created_at FROM users WHERE active = true ORDER BY created_at DESC LIMIT 20;' },
];

export default {
  sample: { steps: DEFAULT_STEPS },
  named: {
    agentPlan: { steps: AGENT_PLAN_STEPS },
    short: { steps: SHORT_STEPS },
  },
};
