import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { action } from 'storybook/actions';
import { TasksCard, type TasksCardData, type TasksTask } from './tasks-card';
import { componentDescription } from '../stories/docs/element-controls';
import type { CardEvent, CardHost, CardContext, CardResolution } from '../primitives/card-contract';

const ctx: CardContext = { theme: { mode: 'light' }, locale: 'en' };

/**
 * The story args. `TasksCardData` is a single opaque object on the component,
 * which makes a lousy control — so the payload is FLATTENED here (`mode`,
 * `tasks`, `selectAll`, the `min`/`max` gate, …) and recomposed in `render`, so
 * every control below changes what you see.
 */
interface TasksArgs {
  heading?: string;
  cardId: string;
  mode?: 'select' | 'progress';
  listHeading?: string;
  tasks: TasksTask[];
  selectAll?: boolean;
  confirmLabel?: string;
  allowEmpty?: boolean;
  min?: number;
  max?: number;
  dismissible?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  resolution?: CardResolution;
}

const toData = (a: TasksArgs): TasksCardData => ({
  mode: a.mode,
  heading: a.listHeading,
  tasks: a.tasks,
  selectAll: a.selectAll,
  confirmLabel: a.confirmLabel,
  allowEmpty: a.allowEmpty,
  min: a.min,
  max: a.max,
  dismissible: a.dismissible,
});

/** Renders the Solid <TasksCard> with a capturing `host`. Every emitted
 *  `CardEvent` is shown in the inline log AND routed to the Actions panel
 *  (keyed by `kind`, e.g. `card:submit`); `onValueChange` fires on every
 *  selection change (distinct from the terminal submit). */
function Demo(props: { args: TasksArgs }) {
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
      <TasksCard
        host={host}
        data={toData(props.args)}
        heading={props.args.heading}
        cardId={props.args.cardId}
        disabled={props.args.disabled}
        readonly={props.args.readonly}
        resolution={props.args.resolution}
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

const PLAN_TASKS: TasksTask[] = [
  { id: 'lint', label: 'Run linter', checked: true },
  { id: 'test', label: 'Run unit tests', checked: true },
  { id: 'build', label: 'Build production bundle' },
  { id: 'deploy', label: 'Deploy to staging', description: 'Reversible; staging only' },
];

const REVIEWER_TASKS: TasksTask[] = [
  { id: 'ana', label: 'Ana' },
  { id: 'ben', label: 'Ben' },
  { id: 'cat', label: 'Cat' },
];

const ONBOARDING_TASKS: TasksTask[] = [
  { id: 'role', label: 'Customize the assistant to your role', description: 'Tone, defaults, and the projects you work in.', checked: true },
  { id: 'connect', label: 'Connect a data source', description: 'Drive, a repo, or an internal wiki.' },
  { id: 'invite', label: 'Invite a teammate', description: 'Shared threads need at least two people.' },
];

const meta = {
  title: 'Components/Elements/TasksCard',
  component: TasksCard,
  tags: ['autodocs'],
  render: (args: TasksArgs) => <Demo args={args} />,
  parameters: {
    layout: 'padded',
    // The component's real props are inferred by docgen too, but this story drives
    // the card through the flattened args above -- `data`/`host`/`class` etc. are
    // composed in `render` and moving them would do nothing. Hide the dead controls
    // rather than ship a panel where half the rows are inert.
    controls: { exclude: ['data', 'host', 'hostElement', 'class', 'controllerRef', 'value', 'defaultValue'] },
    docs: {
      description: componentDescription([
        'The SolidJS layer behind `<kai-tasks>`: a checklist card the assistant can put up for plan approval or multi-select. Pass a `host` (a `CardHost`) to receive emitted `CardEvent`s directly, or wrap in a `CardProvider`. Toggling rows is local; only confirm emits `submit` with `{ selected }` in input order.',
        'The controls flatten `TasksCardData` — switch `mode` to `progress` for the onboarding look, edit the `tasks` JSON, or set `min`/`max` to gate the confirm button.',
      ]),
    },
  },
  argTypes: {
    heading: { control: 'text', description: 'Card chrome title.' },
    mode: {
      control: 'select',
      options: ['select', 'progress'],
      description:
        '`select` = checkbox rows + a confirm button that emits `submit`. `progress` = the onboarding look: a `done / total` count, circular indicators, and no confirm button (checking a row IS the action).',
      table: { defaultValue: { summary: 'select' } },
    },
    listHeading: {
      control: 'text',
      description: 'The list\'s own heading (`data.heading`), shown beside the `done / total` count in `progress` mode.',
    },
    tasks: {
      control: 'object',
      description: 'The rows. Each: `{ id, label, description?, checked?, disabled? }`.',
    },
    selectAll: { control: 'boolean', description: 'Show the select-all / clear toggle above the list.' },
    confirmLabel: {
      control: 'text',
      description: 'Label on the confirm button. Ignored in `progress` mode.',
      table: { defaultValue: { summary: 'Confirm' } },
    },
    allowEmpty: { control: 'boolean', description: 'Let confirm fire with nothing selected.' },
    min: { control: { type: 'number', min: 0, max: 10 }, description: 'Fewest selections the confirm button will accept.' },
    max: { control: { type: 'number', min: 0, max: 10 }, description: 'Most selections allowed; rows past it are blocked.' },
    dismissible: { control: 'boolean', description: 'Show the close affordance that emits `dismiss`.' },
    disabled: { control: 'boolean', description: 'Freeze the whole list + Confirm.' },
    readonly: {
      control: 'boolean',
      description: 'Display-only: keeps the content, drops the interactive affordances and a11y exposure.',
    },
    resolution: {
      control: 'object',
      description: 'Set to render the read-only summary, e.g. `{ kind: "submit", data: { selected: ["lint"] } }`.',
    },
    cardId: { control: 'text', description: 'Correlates every emitted CardEvent.' },
    onValueChange: {
      control: false,
      description: 'Fires on every selection change, before submit.',
      table: { category: 'Events' },
    },
  },
  args: {
    heading: 'Approve the plan steps',
    cardId: 'card-plan',
    mode: 'select',
    tasks: PLAN_TASKS,
    selectAll: true,
    confirmLabel: 'Run selected',
    allowEmpty: false,
    dismissible: false,
    disabled: false,
    readonly: false,
  },
} satisfies Meta<TasksArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { TasksCard, type TasksCardData } from '@kitn.ai/ui';
import type { CardHost } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Every control live: flip `mode` to `progress`, set `max` to 2 and watch the
 *  third pick get blocked, or paste another row into `tasks`. */
export const Playground: Story = {
  ...src(`const data: TasksCardData = {
  selectAll: true,
  confirmLabel: 'Run selected',
  tasks: [
    { id: 'lint', label: 'Run linter', checked: true },
    { id: 'test', label: 'Run unit tests', checked: true },
    { id: 'build', label: 'Build production bundle' },
    { id: 'deploy', label: 'Deploy to staging', description: 'Reversible; staging only' },
  ],
};

// Toggling rows is local; only confirm emits \`submit\` with the checked ids
// in input order. A CardHost receives those events directly.
const host: CardHost = {
  context: () => ({ theme: { mode: 'light' }, locale: 'en' }),
  emit: (e) => {
    // { kind: 'submit', cardId, data: { selected: string[] } }
    if (e.kind === 'submit') console.log('run', e.data);
  },
};

<TasksCard
  host={host}
  data={data}
  heading="Approve the plan steps"
  cardId="card-plan"
  onValueChange={({ value }) => console.log('selection', value)}
/>`),
};

export const SelectAPlan: Story = {
  args: { heading: 'Approve the plan steps', cardId: 'card-plan', tasks: PLAN_TASKS },
  ...src(`<TasksCard host={host} data={data} heading="Approve the plan steps" cardId="card-plan" />`),
};

export const Bounded: Story = {
  args: {
    heading: 'Pick up to 2 reviewers',
    cardId: 'card-bounded',
    tasks: REVIEWER_TASKS,
    selectAll: false,
    confirmLabel: 'Request review',
    min: 1,
    max: 2,
  },
  ...src(`// \`min\`/\`max\` gate the confirm button; rows past \`max\` are blocked.
const data: TasksCardData = {
  confirmLabel: 'Request review',
  min: 1,
  max: 2,
  tasks: [
    { id: 'ana', label: 'Ana' },
    { id: 'ben', label: 'Ben' },
    { id: 'cat', label: 'Cat' },
  ],
};

<TasksCard host={host} data={data} heading="Pick up to 2 reviewers" cardId="card-bounded" />`),
};

/** `mode: 'progress'` — the onboarding-checklist look. A `done / total` count in
 *  the header, circular indicators, and no confirm button: checking a row IS the
 *  action, so `onValueChange` is the signal. */
export const Progress: Story = {
  args: {
    heading: undefined,
    cardId: 'card-onboarding',
    mode: 'progress',
    listHeading: 'Get started',
    tasks: ONBOARDING_TASKS,
    selectAll: false,
  },
  ...src(`const data: TasksCardData = {
  mode: 'progress',
  heading: 'Get started',
  tasks: [
    { id: 'role', label: 'Customize the assistant to your role', description: 'Tone, defaults, and the projects you work in.', checked: true },
    { id: 'connect', label: 'Connect a data source', description: 'Drive, a repo, or an internal wiki.' },
    { id: 'invite', label: 'Invite a teammate', description: 'Shared threads need at least two people.' },
  ],
};

<TasksCard host={host} data={data} cardId="card-onboarding" onValueChange={({ value }) => console.log(value)} />`),
};
