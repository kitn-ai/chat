// Sample data for <kai-form> non-scalar props. One file per element;
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob, so
// adding an element never touches a shared file.
//
// `sample`  = default non-scalar prop data (the playground + bare examples use it)
// `named`   = alternate sets a focused <Example data="…"> can opt into
//
// kai-form has TWO non-scalar props:
//   `data`       – FormDefinition: a JSON Schema object + x-kai-* UI hints
//   `resolution` – CardResolution: set to render the chromed read-only summary
//
// The default `sample` is the "Feedback" story: a rating, textarea, enum radio,
// and boolean switch with a secondary Skip action — a realistic worked example.

const FEEDBACK_DATA = {
  type: 'object',
  title: 'How did we do?',
  description: 'Two quick questions.',
  required: ['rating', 'contactOk'],
  'x-kai-order': ['rating', 'comments', 'plan', 'contactOk'],
  'x-kai-submitLabel': 'Send feedback',
  'x-kai-actions': [{ id: 'skip', label: 'Skip', variant: 'ghost' }],
  properties: {
    rating: {
      type: 'integer',
      title: 'Overall rating',
      minimum: 1,
      maximum: 5,
      'x-kai-widget': 'rating',
    },
    comments: {
      type: 'string',
      title: 'Comments',
      maxLength: 500,
      'x-kai-widget': 'textarea',
      'x-kai-placeholder': "What worked, what didn't…",
    },
    plan: {
      type: 'string',
      title: 'Your plan',
      enum: ['free', 'pro', 'team'],
      default: 'free',
    },
    contactOk: {
      type: 'boolean',
      title: 'OK to contact me about this',
      default: false,
    },
  },
};

// "Every widget" — one form that exercises the full widget mapping table.
const ALL_WIDGETS_DATA = {
  type: 'object',
  title: 'Every widget',
  'x-kai-submitLabel': 'Submit all',
  properties: {
    name: { type: 'string', title: 'Name' },
    bio: { type: 'string', title: 'Bio', maxLength: 300 },
    email: { type: 'string', title: 'Email', format: 'email' },
    website: { type: 'string', title: 'Website', format: 'uri' },
    birthday: { type: 'string', title: 'Birthday', format: 'date' },
    secret: { type: 'string', title: 'Password', 'x-kai-widget': 'password' },
    size: { type: 'string', title: 'Size', enum: ['S', 'M', 'L'] },
    country: { type: 'string', title: 'Country', enum: ['US', 'UK', 'DE', 'FR', 'JP'] },
    age: { type: 'integer', title: 'Age', minimum: 0, maximum: 120 },
    volume: { type: 'integer', title: 'Volume', minimum: 0, maximum: 11, 'x-kai-widget': 'slider' },
    stars: { type: 'integer', title: 'Stars', minimum: 1, maximum: 5, 'x-kai-widget': 'rating' },
    notify: { type: 'boolean', title: 'Email me updates' },
    agree: { type: 'boolean', title: 'I agree', 'x-kai-widget': 'checkbox' },
    tags: { type: 'array', title: 'Tags', items: { type: 'string' } },
    topics: { type: 'array', title: 'Topics', items: { enum: ['news', 'sports', 'tech'] } },
    contacts: {
      type: 'array',
      title: 'Contacts',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', title: 'Label' },
          phone: { type: 'string', title: 'Phone' },
        },
      },
    },
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street' },
        city: { type: 'string', title: 'City' },
      },
    },
  },
};

// "Validation" — required fields + min/max + format constraints.
// Try submitting empty to see inline errors, then fill in valid values.
const VALIDATION_DATA = {
  type: 'object',
  title: 'Create account',
  required: ['username', 'email', 'age'],
  properties: {
    username: { type: 'string', title: 'Username', minLength: 3, maxLength: 12 },
    email: { type: 'string', title: 'Email', format: 'email' },
    age: { type: 'integer', title: 'Age', minimum: 13, maximum: 120 },
  },
};

// "Resolved" — the form after a valid submission; read-only <dl> summary.
const RESOLVED_FORM_DATA = {
  type: 'object',
  title: 'Book a demo',
  'x-kai-order': ['name', 'optIn'],
  properties: {
    name: { type: 'string', title: 'Full name' },
    optIn: { type: 'boolean', title: 'Email me' },
  },
};

// "Invalid envelope" — a non-object schema triggers the inline error state.
const INVALID_DATA = {
  type: 'array',
};

export default {
  sample: { data: FEEDBACK_DATA },
  named: {
    allWidgets: { data: ALL_WIDGETS_DATA },
    validation: { data: VALIDATION_DATA },
    resolved: {
      data: RESOLVED_FORM_DATA,
      resolution: { kind: 'submit', data: { name: 'Jane Cooper', optIn: true } },
    },
    invalidEnvelope: { data: INVALID_DATA },
  },
};
