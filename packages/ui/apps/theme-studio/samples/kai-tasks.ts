// Sample data for <kai-tasks> non-scalar props. One file per element;
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob, so
// adding an element never touches a shared file.
//
// `sample`  = default non-scalar prop data (the playground + bare examples use it)
// `named`   = alternate sets a focused <Example data="…"> can opt into

// Default playground sample — a realistic plan-approval list with select-all and
// a couple of pre-checked rows.
const PLAN_DATA = {
  mode: 'select',
  selectAll: true,
  confirmLabel: 'Run selected',
  tasks: [
    { id: 'lint', label: 'Run linter', checked: true },
    { id: 'test', label: 'Run unit tests', checked: true },
    { id: 'build', label: 'Build production bundle' },
    { id: 'deploy', label: 'Deploy to staging', description: 'Reversible; staging only' },
  ],
};

// Require at least one — confirm stays disabled until a row is checked.
const REQUIRE_ONE_DATA = {
  confirmLabel: 'Apply',
  allowEmpty: false,
  tasks: [
    { id: 'cache', label: 'Clear the CDN cache' },
    { id: 'reindex', label: 'Rebuild the search index' },
    { id: 'restart', label: 'Restart the workers' },
  ],
};

// Bounded — min/max keeps confirm gated until 1–2 rows are picked.
const BOUNDED_DATA = {
  confirmLabel: 'Request review',
  min: 1,
  max: 2,
  tasks: [
    { id: 'ana', label: 'Ana' },
    { id: 'ben', label: 'Ben' },
    { id: 'cat', label: 'Cat' },
    { id: 'dan', label: 'Dan' },
  ],
};

// Rows with secondary descriptions (linked via aria-describedby).
const WITH_DESCRIPTIONS_DATA = {
  selectAll: true,
  confirmLabel: 'Run cleanup',
  tasks: [
    { id: 'tmp', label: 'Delete temp files', description: 'Frees ~2.1 GB; safe to remove' },
    { id: 'logs', label: 'Rotate logs', description: 'Archives logs older than 30 days' },
    { id: 'orphans', label: 'Prune orphaned blobs', description: 'Unreferenced uploads only' },
  ],
};

// Error state — empty tasks array triggers the inline kai-card error + emits an 'error' CardEvent.
const ERROR_DATA = {
  tasks: [],
};

// Resolved — read-only state after user confirmed.
const RESOLVED_DATA = {
  confirmLabel: 'Export',
  tasks: [
    { id: 'sum', label: 'Executive summary' },
    { id: 'data', label: 'Raw data' },
    { id: 'charts', label: 'Charts' },
  ],
};

export default {
  sample: { data: PLAN_DATA },
  named: {
    requireOne: { data: REQUIRE_ONE_DATA },
    bounded: { data: BOUNDED_DATA },
    withDescriptions: { data: WITH_DESCRIPTIONS_DATA },
    resolved: {
      data: RESOLVED_DATA,
      resolution: { kind: 'submit', data: { selected: ['sum', 'charts'] } },
    },
    error: { data: ERROR_DATA },
  },
};
