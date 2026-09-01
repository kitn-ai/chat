// Sample data for <kai-reasoning>. One file per element;
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob, so
// adding an element never touches a shared file.
//
// `sample`  = default data shown by the playground + bare examples
// `named`   = alternate sets a focused <Example data="…"> can opt into
//
// kai-reasoning has no non-scalar props. However `text` is a scalar string that
// needs a realistic multi-sentence value so the playground renders something
// meaningful rather than an empty block. We seed it here following the same
// pattern as kai-code-block.

const SAMPLE_TEXT =
  'First I parse the request to understand what the user needs. ' +
  'Then I identify any ambiguities and resolve them against context from earlier in the conversation. ' +
  'Next I plan the steps: break the task into sub-goals, estimate complexity, and order them by dependency. ' +
  'Finally I draft a response, verify it against the original intent, and trim anything redundant before replying.';

const LONG_TEXT =
  '**Step 1 — Understand the request.**\n' +
  'The user asked for a refactor of the authentication module. ' +
  'Key constraints: keep the public API surface identical, add unit tests, and do not introduce new dependencies.\n\n' +
  '**Step 2 — Analyse the current code.**\n' +
  'The module has three concerns tangled together: token generation, storage, and validation. ' +
  'Separating these into their own functions will make each testable in isolation.\n\n' +
  '**Step 3 — Draft the refactor.**\n' +
  '`generateToken(payload)` → pure function, no side effects.\n' +
  '`storeToken(token, store)` → accepts an injected store interface.\n' +
  '`validateToken(token, secret)` → returns a typed result object.\n\n' +
  '**Step 4 — Verify the plan.**\n' +
  'All existing callers use the top-level `auth()` wrapper, so the internal split is non-breaking. Ready to proceed.';

export default {
  sample: {
    text: SAMPLE_TEXT,
  },
  named: {
    markdown: {
      text: LONG_TEXT,
    },
  },
};
