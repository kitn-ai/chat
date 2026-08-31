// Sample data for <kai-confirm> non-scalar props. One file per element;
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob, so
// adding an element never touches a shared file.
//
// `sample`  = default non-scalar prop data (the playground + bare examples use it)
// `named`   = alternate sets a focused <Example data="…"> can opt into
//
// kai-confirm has TWO non-scalar props:
//   `data`       – ConfirmCardData: body, tone, actions[], dismissible?
//   `resolution` – CardResolution: set to render the chromed read-only view
//
// The default `sample` shows the canonical two-action approval (warning tone).
// Named sets cover destructive, multi-action choice, dismissible, resolved, and error.

const APPROVE_DATA = {
  body: 'This will apply 3 pending migrations to production. This cannot be undone.',
  tone: 'warning',
  actions: [
    { id: 'approve', label: 'Run migration', style: 'primary', default: true },
    { id: 'reject', label: 'Cancel' },
  ],
};

const DESTRUCTIVE_DATA = {
  body: 'Permanently delete 12 files from the workspace? This cannot be undone.',
  tone: 'danger',
  actions: [
    { id: 'delete', label: 'Delete files', style: 'destructive', default: true },
    { id: 'cancel', label: 'Keep them' },
  ],
};

const CHOICES_DATA = {
  heading: 'Where should I deploy?',
  body: 'Pick a target environment for this build.',
  actions: [
    { id: 'staging', label: 'Staging', default: true },
    { id: 'preview', label: 'Preview' },
    { id: 'prod', label: 'Production', style: 'primary' },
  ],
};

const DISMISSIBLE_DATA = {
  body: 'Send the drafted email to the customer?',
  dismissible: true,
  actions: [
    { id: 'send', label: 'Send', style: 'primary', default: true },
    { id: 'edit', label: 'Edit first' },
  ],
};

const RESOLVED_DATA = {
  body: 'Apply 3 pending migrations to production?',
  tone: 'warning',
  actions: [
    { id: 'approve', label: 'Run migration', style: 'primary' },
    { id: 'reject', label: 'Cancel' },
  ],
};

const ERROR_DATA = {
  actions: [],
};

export default {
  sample: {
    data: APPROVE_DATA,
  },
  named: {
    destructive: {
      data: DESTRUCTIVE_DATA,
    },
    choiceSet: {
      data: CHOICES_DATA,
    },
    dismissible: {
      data: DISMISSIBLE_DATA,
    },
    resolved: {
      data: RESOLVED_DATA,
      resolution: { kind: 'action', action: 'approve' },
    },
    errorState: {
      data: ERROR_DATA,
    },
  },
};
