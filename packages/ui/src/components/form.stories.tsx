import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { action } from 'storybook/actions';
import { Form, type FormDefinition, type FormField } from './form';
import { componentDescription } from '../stories/docs/element-controls';
import type { CardEvent, CardHost, CardContext, CardResolution } from '../primitives/card-contract';

const ctx: CardContext = { theme: { mode: 'light' }, locale: 'en' };

/**
 * The story args. A form card's payload IS a JSON Schema, so the interesting
 * knobs (`title`, `description`, `x-kai-submitLabel`, …) sit at the root of that
 * object rather than on the component. They are FLATTENED here and recomposed in
 * `render`, so every control below changes what you see — `description` in
 * particular, since it is the one place the card shell's body scale renders.
 */
interface FormArgs {
  heading?: string;
  cardId: string;
  title?: string;
  description?: string;
  properties: Record<string, FormField>;
  required?: string[];
  submitLabel?: string;
  dismissible?: boolean;
  inlineMax?: number;
  disabled?: boolean;
  resolution?: CardResolution;
}

const toData = (a: FormArgs): FormDefinition => ({
  type: 'object',
  title: a.title,
  description: a.description,
  required: a.required,
  properties: a.properties,
  'x-kai-submitLabel': a.submitLabel,
  'x-kai-dismissible': a.dismissible,
  'x-kai-inlineMax': a.inlineMax,
});

/** Renders the Solid <Form> with a capturing `host`. Every emitted `CardEvent`
 *  is both shown in the inline log AND routed to the Actions panel (keyed by the
 *  event's `kind`, e.g. `card:submit`); `onValuesChange` fires on every keystroke
 *  (distinct from the terminal submit). */
function Demo(props: { args: FormArgs }) {
  const [log, setLog] = createSignal<CardEvent[]>([]);
  const host: CardHost = {
    context: () => ctx,
    emit: (e) => {
      action(`card:${e.kind}`)(e);
      setLog((p) => [...p, e]);
    },
  };
  return (
    <div style={{ 'max-width': '460px', display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
      <Form
        host={host}
        data={toData(props.args)}
        cardId={props.args.cardId}
        heading={props.args.heading}
        resolution={props.args.resolution}
        disabled={props.args.disabled}
        onValuesChange={action('onValuesChange')}
      />
      <pre
        style={{
          margin: 0,
          'max-height': '180px',
          overflow: 'auto',
          background: 'var(--color-muted, #f4f4f5)',
          'border-radius': '8px',
          padding: '8px',
          'font-size': '12px',
        }}
      >
        {log().length === 0 ? '// emitted CardEvents appear here' : JSON.stringify(log(), null, 2)}
      </pre>
    </div>
  );
}

// A ticket form wide enough to see every widget class the schema subset maps to:
// text, textarea, radio (enum ≤ inlineMax), select (enum >), email, a masked
// string, number, slider, rating, date, checkbox-group, taglist and a switch.
const TICKET_FIELDS: Record<string, FormField> = {
  summary: {
    type: 'string',
    title: 'Summary',
    description: 'One line. The on-call reads this first.',
    'x-kai-placeholder': 'Streaming stops after the first chunk',
  },
  details: {
    type: 'string',
    title: 'What happened',
    maxLength: 2000,
    'x-kai-widget': 'textarea',
    'x-kai-placeholder': 'Steps, expected vs actual, anything in the console.',
  },
  severity: {
    type: 'string',
    title: 'Severity',
    description: 'Blocking pages the on-call immediately.',
    enum: ['Blocking', 'Degraded', 'Cosmetic'],
    default: 'Degraded',
  },
  area: {
    type: 'string',
    title: 'Area',
    enum: ['Streaming', 'Attachments', 'Auth', 'Billing', 'Docs', 'SDK'],
  },
  replyTo: {
    type: 'string',
    title: 'Reply-to',
    format: 'email',
    'x-kai-placeholder': 'you@company.com',
  },
  changeId: {
    type: 'string',
    title: 'Related change',
    'x-kai-format': 'custom',
    'x-kai-mask': 'CHG-####',
  },
  affected: { type: 'integer', title: 'Users affected', minimum: 0, maximum: 5000, default: 12 },
  reproducibility: {
    type: 'number',
    title: 'How often it reproduces',
    minimum: 0,
    maximum: 100,
    default: 60,
    'x-kai-widget': 'slider',
    'x-kai-step': 10,
  },
  impact: {
    type: 'integer',
    title: 'Impact on your work',
    minimum: 1,
    maximum: 5,
    default: 3,
    'x-kai-widget': 'rating',
  },
  firstSeen: { type: 'string', title: 'First seen', format: 'date' },
  environments: { type: 'array', title: 'Environments', items: { enum: ['Production', 'Staging', 'Local'] } },
  tags: { type: 'array', title: 'Tags', items: { type: 'string' } },
  notify: { type: 'boolean', title: 'Email me on every update', default: true },
};

const MIGRATION_FIELDS: Record<string, FormField> = {
  window: {
    type: 'string',
    title: 'Window',
    enum: ['Tonight 02:00 UTC', 'Saturday 02:00 UTC', 'Next maintenance window'],
    default: 'Saturday 02:00 UTC',
  },
  notes: {
    type: 'string',
    title: 'Notes for the runbook',
    maxLength: 500,
    'x-kai-widget': 'textarea',
    'x-kai-placeholder': 'Anything the operator should check first.',
  },
  dryRun: {
    type: 'boolean',
    title: 'Dry run first',
    description: 'Reports the plan without touching the table.',
    default: true,
  },
};

// A description long enough to wrap over several lines — the card shell's
// description is the only multi-line run in the chrome.
const LONG_DESCRIPTION =
  'The rebuild locks writes on the conversations table for the whole window, so pick a slot when the workspace is quiet. Anything queued while the lock is held is retried afterwards, in order, and nothing is dropped — but the assistant will look unresponsive to anyone typing during it.';

const meta = {
  title: 'Components/Elements/Form',
  component: Form,
  tags: ['autodocs'],
  render: (args: FormArgs) => <Demo args={args} />,
  parameters: {
    layout: 'padded',
    // The component's real props are inferred by docgen too, but this story drives
    // the card through the flattened args above -- `data`/`host`/`class` etc. are
    // composed in `render` and moving them would do nothing. Hide the dead controls
    // rather than ship a panel where half the rows are inert.
    controls: { exclude: ['data', 'host', 'hostElement', 'class', 'controllerRef', 'values', 'defaultValues'] },
    docs: {
      description: componentDescription([
        'The SolidJS layer behind `<kai-form>`: a JSON-Schema definition rendered into themed, accessible widgets inside `Card` chrome. Pass a `host` (a `CardHost`) to receive emitted `CardEvent`s directly, or wrap in a `CardProvider`. Typing is local and reported through `onValuesChange`; only a valid submit emits `submit` with the coerced object.',
        "The definition's `title` and `description` become the card heading and its description — the form card is the one built-in card that fills both.",
        'The controls flatten the definition root. Edit `properties` as JSON to add or retype a field; stretch `description` to watch the shell wrap it.',
      ]),
    },
  },
  argTypes: {
    heading: {
      control: 'text',
      description: 'Card chrome title. Overrides the definition\'s own `title` when set.',
    },
    title: { control: 'text', description: "The definition's title — the card heading when `heading` is unset." },
    description: {
      control: 'text',
      description: 'Rendered under the heading at the body scale. The one place the card shell wraps prose.',
    },
    properties: {
      control: 'object',
      description:
        'The JSON Schema field map. Type/format/enum picks the widget; `x-kai-widget` overrides it (`textarea`, `slider`, `rating`, `radio`, `select`, `checkbox`, `password`, `switch`).',
    },
    required: { control: 'object', description: 'Field keys that must be filled. Required fields sort first and get a `*`.' },
    submitLabel: {
      control: 'text',
      description: 'Label on the submit button (`x-kai-submitLabel`).',
      table: { defaultValue: { summary: 'Submit' } },
    },
    dismissible: { control: 'boolean', description: 'Show the Dismiss button that emits `dismiss` and collapses to a re-openable stub.' },
    inlineMax: {
      control: { type: 'number', min: 1, max: 10 },
      description: 'Enum size at or below which a field renders as inline radios instead of a select.',
      table: { defaultValue: { summary: '4' } },
    },
    disabled: { control: 'boolean', description: 'Disable every field and the submit button.' },
    resolution: {
      control: 'object',
      description: 'Set to render the read-only summary instead of the inputs, e.g. `{ kind: "submit", data: { … } }`.',
    },
    cardId: { control: 'text', description: 'Correlates every emitted CardEvent.' },
    onValuesChange: {
      control: false,
      description: 'Fires on input with the coerced values + validity, before submit.',
      table: { category: 'Events' },
    },
  },
  args: {
    cardId: 'card-ticket',
    title: 'Open a support ticket',
    description: 'Goes straight to the on-call engineer.',
    properties: TICKET_FIELDS,
    required: ['summary', 'severity', 'replyTo'],
    submitLabel: 'File ticket',
    dismissible: true,
    inlineMax: 4,
    disabled: false,
  },
} satisfies Meta<FormArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Form, type FormDefinition } from '@kitn.ai/ui';
import type { CardHost } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Every control live. Stretch `description` to see the shell wrap it, drop
 *  `inlineMax` to 2 to push `severity` from radios into a select, or paste a new
 *  field into `properties`. */
export const Playground: Story = {
  ...src(`// \`title\` + \`description\` fill the card chrome; each property picks its own
// widget from type/format/enum unless \`x-kai-widget\` overrides it.
const data: FormDefinition = {
  type: 'object',
  title: 'Open a support ticket',
  description: 'Goes straight to the on-call engineer.',
  required: ['summary', 'severity', 'replyTo'],
  'x-kai-submitLabel': 'File ticket',
  'x-kai-dismissible': true,
  properties: {
    summary: { type: 'string', title: 'Summary', description: 'One line. The on-call reads this first.' },
    details: { type: 'string', title: 'What happened', maxLength: 2000, 'x-kai-widget': 'textarea' },
    severity: { type: 'string', title: 'Severity', enum: ['Blocking', 'Degraded', 'Cosmetic'], default: 'Degraded' },
    area: { type: 'string', title: 'Area', enum: ['Streaming', 'Attachments', 'Auth', 'Billing', 'Docs', 'SDK'] },
    replyTo: { type: 'string', title: 'Reply-to', format: 'email' },
    changeId: { type: 'string', title: 'Related change', 'x-kai-format': 'custom', 'x-kai-mask': 'CHG-####' },
    // …number, slider, rating, date, checkbox-group, taglist, switch
  },
};

const host: CardHost = {
  context: () => ({ theme: { mode: 'light' }, locale: 'en' }),
  emit: (e) => {
    // { kind: 'submit', cardId, data: { …coerced values } }
    if (e.kind === 'submit') console.log('ticket', e.data);
  },
};

<Form host={host} data={data} cardId="card-ticket" onValuesChange={({ valid }) => console.log(valid)} />`),
};

export const SupportTicket: Story = {
  args: { cardId: 'card-ticket', properties: TICKET_FIELDS },
  ...src(`<Form host={host} data={data} cardId="card-ticket" />`),
};

export const LongDescription: Story = {
  args: {
    cardId: 'card-migration',
    title: 'Schedule the index rebuild',
    description: LONG_DESCRIPTION,
    properties: MIGRATION_FIELDS,
    required: ['window'],
    submitLabel: 'Schedule it',
    dismissible: false,
  },
  ...src(`// A description long enough to wrap: the card shell renders it at the body
// scale under the heading, and it is the one multi-line run in the chrome.
const data: FormDefinition = {
  type: 'object',
  title: 'Schedule the index rebuild',
  description:
    'The rebuild locks writes on the conversations table for the whole window, so pick a slot when the workspace is quiet. …',
  required: ['window'],
  'x-kai-submitLabel': 'Schedule it',
  properties: {
    window: { type: 'string', title: 'Window', enum: ['Tonight 02:00 UTC', 'Saturday 02:00 UTC', 'Next maintenance window'] },
    notes: { type: 'string', title: 'Notes for the runbook', maxLength: 500, 'x-kai-widget': 'textarea' },
    dryRun: { type: 'boolean', title: 'Dry run first', default: true },
  },
};

<Form host={host} data={data} cardId="card-migration" />`),
};

/** Resolved state. `resolution` stays a control — clear it to get the live form
 *  back, or edit `data` to change what the summary rows report. */
export const Submitted: Story = {
  args: {
    cardId: 'card-migration-done',
    title: 'Schedule the index rebuild',
    description: LONG_DESCRIPTION,
    properties: MIGRATION_FIELDS,
    required: ['window'],
    submitLabel: 'Schedule it',
    dismissible: false,
    resolution: {
      kind: 'submit',
      data: { window: 'Saturday 02:00 UTC', notes: 'Snapshot the table first.', dryRun: true },
      at: '2026-08-25T09:14:00Z',
    },
  },
  ...src(`// A resolved card renders the read-only summary instead of the inputs. The
// host stamps the resolution once it has accepted the submit.
<Form
  host={host}
  data={data}
  cardId="card-migration-done"
  resolution={{
    kind: 'submit',
    data: { window: 'Saturday 02:00 UTC', notes: 'Snapshot the table first.', dryRun: true },
    at: '2026-08-25T09:14:00Z',
  }}
/>`),
};
