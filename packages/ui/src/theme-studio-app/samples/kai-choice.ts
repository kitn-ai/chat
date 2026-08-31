// Sample data for <kai-choice> non-scalar props. One file per element;
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob, so
// adding an element never touches a shared file.
//
// `sample`  = default non-scalar prop data (the playground + bare examples use it)
// `named`   = alternate sets a focused <Example data="…"> can opt into
//
// `data` is the CardEnvelope.data — the full ChoiceCardData shape.
// `resolution` (when present) puts the card in its read-only resolved state.

// Default playground sample — a realistic pricing-plan picker with a
// `recommended` pill, trailing `meta` prices, and a disabled legacy row.
const PLANS_DATA = {
  prompt: 'Which plan fits your team?',
  options: [
    { id: 'free', label: 'Free', description: 'For trying things out', meta: '$0' },
    {
      id: 'pro',
      label: 'Pro',
      description: 'For growing teams',
      meta: '$12/seat',
      recommended: true,
      payload: { plan: 'pro' },
    },
    { id: 'enterprise', label: 'Enterprise', description: 'SSO, audit log, SLA', meta: 'Contact us' },
    { id: 'legacy', label: 'Legacy', description: 'No longer available', disabled: true },
  ],
};

// Rows with leading images and a custom submitLabel.
const TEMPLATES_DATA = {
  prompt: 'Pick a workspace template.',
  submitLabel: 'Create workspace',
  options: [
    {
      id: 'blank',
      label: 'Blank',
      description: 'Start from scratch',
      media: { image: 'https://placehold.co/80x80/png?text=Blank', imageAlt: 'A blank canvas' },
    },
    {
      id: 'kanban',
      label: 'Kanban',
      description: 'Board with columns',
      recommended: true,
      media: { image: 'https://placehold.co/80x80/png?text=Kanban', imageAlt: 'A kanban board' },
      payload: { template: 'kanban' },
    },
    {
      id: 'docs',
      label: 'Docs',
      description: 'Wiki-style pages',
      media: { image: 'https://placehold.co/80x80/png?text=Docs', imageAlt: 'A document page' },
    },
  ],
};

// Quick replies with the allowOther free-text escape hatch.
const QUICK_REPLIES_DATA = {
  prompt: 'How did this answer land?',
  options: [
    { id: 'great', label: 'That solved it', payload: { sentiment: 'positive' } },
    { id: 'partly', label: 'Partly — needs more', payload: { sentiment: 'neutral' } },
    { id: 'no', label: 'Not what I meant', payload: { sentiment: 'negative' } },
  ],
  allowOther: { label: 'Something else…', placeholder: 'Tell me what you expected' },
};

// Resolved read-only state — the user already chose "Pro".
const RESOLVED_PLAN_DATA = {
  prompt: 'Which plan?',
  options: [
    { id: 'free', label: 'Free', meta: '$0' },
    { id: 'pro', label: 'Pro', meta: '$20/mo' },
  ],
};

// Error state — empty options array triggers the inline error.
const ERROR_DATA = {
  options: [],
};

export default {
  sample: { data: PLANS_DATA },
  named: {
    templates: { data: TEMPLATES_DATA },
    quickReplies: { data: QUICK_REPLIES_DATA },
    resolved: {
      data: RESOLVED_PLAN_DATA,
      resolution: { kind: 'action', action: 'pro' },
    },
    error: { data: ERROR_DATA },
  },
};
