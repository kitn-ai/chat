import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { action } from 'storybook/actions';
import { ChoiceCard, type ChoiceCardData, type ChoiceOption } from './choice-card';
import { componentDescription } from '../stories/docs/element-controls';
import type { CardEvent, CardHost, CardContext, CardResolution } from '../primitives/card-contract';

const ctx: CardContext = { theme: { mode: 'light' }, locale: 'en' };

/**
 * The story args. `ChoiceCardData` is a single opaque object on the component,
 * which makes a lousy control — so the payload is FLATTENED here (`prompt`,
 * `options`, `submitLabel`, `allowOther*`, `dismissible`) and recomposed in
 * `render`. Every control below therefore changes what you see.
 */
interface ChoiceArgs {
  heading?: string;
  cardId: string;
  prompt?: string;
  options: ChoiceOption[];
  submitLabel?: string;
  dismissible?: boolean;
  allowOther?: boolean;
  allowOtherLabel?: string;
  allowOtherPlaceholder?: string;
  disabled?: boolean;
  defaultValue?: string;
  resolution?: CardResolution;
}

const toData = (a: ChoiceArgs): ChoiceCardData => ({
  prompt: a.prompt,
  options: a.options,
  submitLabel: a.submitLabel,
  dismissible: a.dismissible,
  allowOther: a.allowOther
    ? { label: a.allowOtherLabel, placeholder: a.allowOtherPlaceholder }
    : undefined,
});

/** Renders the Solid <ChoiceCard> with a capturing `host`. Every emitted
 *  `CardEvent` is both shown in the inline log AND routed to the Actions panel
 *  (keyed by the event's `kind`, e.g. `card:action`); `onValueChange` fires on
 *  each selection change, before the terminal submit. */
function Demo(props: { args: ChoiceArgs }) {
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
      <ChoiceCard
        host={host}
        data={toData(props.args)}
        cardId={props.args.cardId}
        heading={props.args.heading}
        resolution={props.args.resolution}
        disabled={props.args.disabled}
        defaultValue={props.args.defaultValue}
        onValueChange={action('onValueChange')}
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

// The full row vocabulary in one card: description, trailing `meta`, the
// "Recommended" pill, and a row that is present but not selectable.
const PLAN_OPTIONS: ChoiceOption[] = [
  { id: 'free', label: 'Free', description: '7-day history, one workspace.', meta: '$0' },
  {
    id: 'team',
    label: 'Team',
    description: 'Unlimited history, SSO, 10 seats included.',
    meta: '$24/seat',
    recommended: true,
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    description: 'Audit log export, data residency, custom retention.',
    meta: 'Talk to sales',
  },
  {
    id: 'legacy',
    label: 'Legacy Pro',
    description: 'No longer sold. Existing subscriptions keep running.',
    meta: 'Retired',
    disabled: true,
  },
];

// Icon badges instead of trailing meta — the compact end of the row.
const REGION_OPTIONS: ChoiceOption[] = [
  { id: 'us-east-1', label: 'us-east-1', description: 'N. Virginia — closest to your API.', media: { icon: 'US' }, recommended: true },
  { id: 'eu-west-1', label: 'eu-west-1', description: 'Ireland — adds ~90ms.', media: { icon: 'EU' } },
  { id: 'ap-southeast-2', label: 'ap-southeast-2', description: 'Sydney — adds ~210ms.', media: { icon: 'AP' } },
];

const meta = {
  title: 'Components/Elements/ChoiceCard',
  component: ChoiceCard,
  tags: ['autodocs'],
  render: (args: ChoiceArgs) => <Demo args={args} />,
  parameters: {
    layout: 'padded',
    // The component's real props are inferred by docgen too, but this story drives
    // the card through the flattened args above -- `data`/`host`/`class` etc. are
    // composed in `render` and moving them would do nothing. Hide the dead controls
    // rather than ship a panel where half the rows are inert.
    controls: { exclude: ['data', 'host', 'hostElement', 'class', 'controllerRef', 'value'] },
    docs: {
      description: componentDescription([
        'The SolidJS layer behind `<kai-choice>`: pick one of N rich options (plans, regions, quick replies) inside `Card` chrome. Pass a `host` (a `CardHost`) to receive emitted `CardEvent`s directly, or wrap in a `CardProvider`.',
        'The rows are a WAI-ARIA radiogroup with roving tabindex. Clicking a row selects it locally and reports through `onValueChange`; only **Submit** emits `action` with the chosen option id and resolves the card, so the same pick cannot double-fire. `allowOther` appends a free-text row that submits as `__other__`.',
        'The controls flatten `ChoiceCardData` — edit `options` as JSON, or flip `allowOther` / `disabled` / `dismissible` — and the card re-renders from them.',
      ]),
    },
  },
  argTypes: {
    heading: { control: 'text', description: 'Card chrome title, above the prompt.' },
    prompt: { control: 'text', description: 'The question, rendered above the option list.' },
    options: {
      control: 'object',
      description:
        'The rows. Each: `{ id, label, description?, meta?, media?, recommended?, disabled? }`. `recommended` renders the small uppercase pill.',
    },
    submitLabel: {
      control: 'text',
      description: 'Label on the submit button.',
      table: { defaultValue: { summary: 'Submit' } },
    },
    dismissible: { control: 'boolean', description: 'Show the close affordance that emits `dismiss`.' },
    allowOther: { control: 'boolean', description: 'Append a free-text "Other…" row that submits as `__other__`.' },
    allowOtherLabel: { control: 'text', description: 'Label for the "Other…" row. Only read when `allowOther` is on.' },
    allowOtherPlaceholder: { control: 'text', description: 'Placeholder for the revealed free-text input.' },
    disabled: { control: 'boolean', description: 'Freeze the radiogroup + Submit (e.g. while the agent is busy).' },
    defaultValue: { control: 'text', description: 'Option id pre-selected on mount (uncontrolled seed).' },
    resolution: {
      control: 'object',
      description:
        'Set to render the read-only resolved view instead of the list, e.g. `{ kind: "action", action: "team" }`.',
    },
    cardId: { control: 'text', description: 'Correlates every emitted CardEvent.' },
    onValueChange: { control: false, description: 'Fires on each selection change, before submit.', table: { category: 'Events' } },
  },
  args: {
    heading: 'Pick a plan',
    cardId: 'card-plan',
    prompt: 'Three of your workspaces are over the free retention limit. Pick a plan and I will apply it.',
    options: PLAN_OPTIONS,
    submitLabel: 'Apply plan',
    dismissible: true,
    allowOther: false,
    allowOtherLabel: 'Something else…',
    allowOtherPlaceholder: 'Tell me what you need',
    disabled: false,
  },
} satisfies Meta<ChoiceArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { ChoiceCard, type ChoiceCardData } from '@kitn.ai/ui';
import type { CardHost } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Every control live: edit the options JSON, flip `allowOther`, freeze it with
 *  `disabled`, or set a `resolution` to jump to the resolved view. */
export const Playground: Story = {
  ...src(`const data: ChoiceCardData = {
  prompt: 'Three of your workspaces are over the free retention limit. Pick a plan and I will apply it.',
  submitLabel: 'Apply plan',
  dismissible: true,
  options: [
    { id: 'free', label: 'Free', description: '7-day history, one workspace.', meta: '$0' },
    { id: 'team', label: 'Team', description: 'Unlimited history, SSO, 10 seats included.', meta: '$24/seat', recommended: true },
    { id: 'enterprise', label: 'Enterprise', description: 'Audit log export, data residency, custom retention.', meta: 'Talk to sales' },
    { id: 'legacy', label: 'Legacy Pro', description: 'No longer sold.', meta: 'Retired', disabled: true },
  ],
};

// A CardHost receives the emitted CardEvents directly (the native-host path).
const host: CardHost = {
  context: () => ({ theme: { mode: 'light' }, locale: 'en' }),
  emit: (e) => {
    // { kind: 'action', cardId, action: 'team', payload? }
    if (e.kind === 'action') console.log('chose', e.action);
  },
};

<ChoiceCard host={host} data={data} heading="Pick a plan" cardId="card-plan" />`),
};

export const PickAPlan: Story = {
  args: { heading: 'Pick a plan', cardId: 'card-plan', options: PLAN_OPTIONS },
  ...src(`<ChoiceCard host={host} data={data} heading="Pick a plan" cardId="card-plan" />`),
};

export const WithOther: Story = {
  args: {
    heading: 'Choose a region',
    cardId: 'card-region',
    prompt: 'Where should the new index live?',
    options: REGION_OPTIONS,
    submitLabel: 'Create index',
    dismissible: false,
    allowOther: true,
    allowOtherLabel: 'Somewhere else…',
    allowOtherPlaceholder: 'Region code, e.g. sa-east-1',
  },
  ...src(`// \`allowOther\` appends a selectable "Other…" row; picking it reveals an inline
// input and Submit emits \`action: '__other__'\` with \`{ text }\`.
const data: ChoiceCardData = {
  prompt: 'Where should the new index live?',
  submitLabel: 'Create index',
  allowOther: { label: 'Somewhere else…', placeholder: 'Region code, e.g. sa-east-1' },
  options: [
    { id: 'us-east-1', label: 'us-east-1', description: 'N. Virginia — closest to your API.', media: { icon: 'US' }, recommended: true },
    { id: 'eu-west-1', label: 'eu-west-1', description: 'Ireland — adds ~90ms.', media: { icon: 'EU' } },
    { id: 'ap-southeast-2', label: 'ap-southeast-2', description: 'Sydney — adds ~210ms.', media: { icon: 'AP' } },
  ],
};

<ChoiceCard host={host} data={data} heading="Choose a region" cardId="card-region" />`),
};

export const Busy: Story = {
  args: {
    heading: 'Choose a region',
    cardId: 'card-region-busy',
    prompt: 'Where should the new index live?',
    options: REGION_OPTIONS,
    submitLabel: 'Create index',
    dismissible: false,
    disabled: true,
  },
  ...src(`// \`disabled\` while the agent is still working: the radiogroup and Submit are
// both inert, and the rows dim rather than disappear.
<ChoiceCard host={host} data={data} heading="Choose a region" cardId="card-region-busy" disabled />`),
};

/** Resolved state. `resolution` is still a control — clear it to go back to the
 *  live list, or point `action` at another option id. */
export const Chosen: Story = {
  args: {
    heading: 'Pick a plan',
    cardId: 'card-plan-chosen',
    options: PLAN_OPTIONS,
    resolution: { kind: 'action', action: 'team', at: '2026-08-25T09:14:00Z' },
  },
  ...src(`// Once the host stamps a resolution the card renders the pick read-only, so
// the same choice cannot be submitted twice.
<ChoiceCard
  host={host}
  data={data}
  heading="Pick a plan"
  cardId="card-plan-chosen"
  resolution={{ kind: 'action', action: 'team', at: '2026-08-25T09:14:00Z' }}
/>`),
};
