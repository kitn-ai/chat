// Sample data for <kai-tool> non-scalar props. One file per element;
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob, so
// adding an element never touches a shared file.
//
// `sample`  = default non-scalar prop data (the playground + bare examples use it)
// `named`   = alternate sets a focused <Example data="…"> can opt into
//
// kai-tool has ONE non-scalar prop: `tool` (a ToolPart object).
// The default sample is a completed database_query call so the playground
// renders a meaningful inspector out of the box.

// A completed tool call — input and output both available.
const COMPLETED_TOOL = {
  type: 'database_query',
  state: 'output-available',
  input: { table: 'users', limit: 10 },
  output: { rows: 10, ms: 42 },
};

// A tool call still awaiting output — only the input is known.
const RUNNING_TOOL = {
  type: 'search',
  state: 'input-available',
  input: { query: 'kitn docs' },
};

// A tool call that ended with an error.
const ERROR_TOOL = {
  type: 'send_email',
  state: 'output-error',
  input: { to: 'team@example.com', subject: 'Weekly digest' },
  errorText: 'SMTP connection refused — check your mail server config.',
};

// Input is still streaming in (agent is building the arguments).
const STREAMING_TOOL = {
  type: 'code_interpreter',
  state: 'input-streaming',
  input: { language: 'python' },
};

export default {
  sample: { tool: COMPLETED_TOOL },
  named: {
    running: { tool: RUNNING_TOOL },
    error: { tool: ERROR_TOOL },
    streaming: { tool: STREAMING_TOOL },
  },
};
