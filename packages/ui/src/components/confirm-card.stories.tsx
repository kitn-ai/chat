import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { action } from 'storybook/actions';
import { ConfirmCard, type ConfirmCardData, type ConfirmAction, type ConfirmTone } from './confirm-card';
import { componentDescription } from '../stories/docs/element-controls';
import type { CardEvent, CardHost, CardContext, CardResolution } from '../primitives/card-contract';

const ctx: CardContext = { theme: { mode: 'light' }, locale: 'en' };

/**
 * The story args. `ConfirmCardData` is a single opaque object on the component,
 * which makes a lousy control — so the payload is FLATTENED here (`body`, `tone`,
 * `actions`, `dismissible`) and recomposed in `render`, so every control below
 * changes what you see.
 */
interface ConfirmArgs {
  heading?: string;
  cardId: string;
  body?: string;
  tone?: ConfirmTone;
  actions: ConfirmAction[];
  dismissible?: boolean;
  autofocus?: boolean;
  resolution?: CardResolution;
}

const toData = (a: ConfirmArgs): ConfirmCardData => ({
  body: a.body,
  tone: a.tone,
  actions: a.actions,
  dismissible: a.dismissible,
});

/** Renders the Solid <ConfirmCard> with a capturing `host`. Every emitted
 *  `CardEvent` is both shown in the inline log AND routed to the Actions panel
 *  (keyed by the event's `kind`, e.g. `card:action`, `card:dismiss`). */
function Demo(props: { args: ConfirmArgs }) {
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
      <ConfirmCard
        host={host}
        data={toData(props.args)}
        heading={props.args.heading}
        cardId={props.args.cardId}
        autofocus={props.args.autofocus}
        resolution={props.args.resolution}
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

const APPROVE_ACTIONS: ConfirmAction[] = [
  { id: 'approve', label: 'Run migration', style: 'primary', default: true },
  { id: 'reject', label: 'Cancel' },
];

const DESTRUCTIVE_ACTIONS: ConfirmAction[] = [
  { id: 'delete', label: 'Delete files', style: 'destructive', default: true },
  { id: 'cancel', label: 'Keep them' },
];

const meta = {
  title: 'Components/Elements/ConfirmCard',
  component: ConfirmCard,
  tags: ['autodocs'],
  render: (args: ConfirmArgs) => <Demo args={args} />,
  parameters: {
    layout: 'padded',
    // The component's real props are inferred by docgen too, but this story drives
    // the card through the flattened args above -- `data`/`host`/`class` etc. are
    // composed in `render` and moving them would do nothing. Hide the dead controls
    // rather than ship a panel where half the rows are inert.
    controls: { exclude: ['data', 'host', 'hostElement', 'class', 'controllerRef'] },
    docs: {
      description: componentDescription([
        'The SolidJS layer behind `<kai-confirm>`. Pass a `host` (a `CardHost`) to receive the emitted `CardEvent`s directly (the native-host path), or wrap in a `CardProvider`. Activating an action emits the `action` verb and resolves the card.',
        'The controls flatten `ConfirmCardData` — switch `tone`, rewrite `body`, or edit the `actions` JSON — and the card re-renders from them.',
      ]),
    },
  },
  argTypes: {
    heading: { control: 'text', description: 'Card chrome title — the question being asked.' },
    body: { control: 'text', description: 'The consequence, spelled out under the heading.' },
    tone: {
      control: 'select',
      options: ['default', 'warning', 'danger'],
      description: 'Severity hue on the card chrome.',
      table: { defaultValue: { summary: 'default' } },
    },
    actions: {
      control: 'object',
      description:
        '1–4 buttons. Each: `{ id, label, style?: "primary" | "default" | "destructive", default?, payload? }`. `default` is the one `autofocus` and the `confirm()` method target.',
    },
    dismissible: { control: 'boolean', description: 'Show the close affordance that emits `dismiss`.' },
    autofocus: {
      control: 'boolean',
      description: 'Focus the default action on mount. Off by default — no focus-stealing mid-stream.',
    },
    resolution: {
      control: 'object',
      description: 'Set to render the read-only resolved view, e.g. `{ kind: "action", action: "approve" }`.',
    },
    cardId: { control: 'text', description: 'Correlates every emitted CardEvent.' },
  },
  args: {
    heading: 'Run database migration?',
    cardId: 'card-approve',
    body: 'This will apply 3 pending migrations to production. This cannot be undone.',
    tone: 'warning',
    actions: APPROVE_ACTIONS,
    dismissible: false,
    autofocus: false,
  },
} satisfies Meta<ConfirmArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { ConfirmCard, type ConfirmCardData } from '@kitn.ai/ui';
import type { CardHost } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Every control live: switch `tone`, rewrite the `body`, or edit the `actions`
 *  JSON to add a third button. */
export const Playground: Story = {
  ...src(`const data: ConfirmCardData = {
  body: 'This will apply 3 pending migrations to production. This cannot be undone.',
  tone: 'warning',
  actions: [
    { id: 'approve', label: 'Run migration', style: 'primary', default: true },
    { id: 'reject', label: 'Cancel' },
  ],
};

// A CardHost receives the emitted CardEvents directly (the native-host path).
const host: CardHost = {
  context: () => ({ theme: { mode: 'light' }, locale: 'en' }),
  emit: (e) => {
    // { kind: 'action', cardId, action: 'approve' | 'reject', payload? }
    if (e.kind === 'action') console.log('chose', e.action);
  },
};

<ConfirmCard host={host} data={data} heading="Run database migration?" cardId="card-approve" />`),
};

export const ApproveReject: Story = {
  args: { heading: 'Run database migration?', cardId: 'card-approve', actions: APPROVE_ACTIONS },
  ...src(`<ConfirmCard host={host} data={data} heading="Run database migration?" cardId="card-approve" />`),
};

export const Destructive: Story = {
  args: {
    heading: 'Delete files?',
    cardId: 'card-delete',
    body: 'Permanently delete 12 files? This cannot be undone.',
    tone: 'danger',
    actions: DESTRUCTIVE_ACTIONS,
  },
  ...src(`const data: ConfirmCardData = {
  body: 'Permanently delete 12 files? This cannot be undone.',
  tone: 'danger',
  actions: [
    { id: 'delete', label: 'Delete files', style: 'destructive', default: true },
    { id: 'cancel', label: 'Keep them' },
  ],
};

<ConfirmCard host={host} data={data} heading="Delete files?" cardId="card-delete" />`),
};

/** Resolved state. `resolution` stays a control — clear it to get the live
 *  buttons back, or point `action` at the other id. */
export const Approved: Story = {
  args: {
    heading: 'Run database migration?',
    cardId: 'card-approve-done',
    actions: APPROVE_ACTIONS,
    resolution: { kind: 'action', action: 'approve', at: '2026-08-25T09:14:00Z' },
  },
  ...src(`// Once the host stamps a resolution the card shows the chosen action read-only,
// so the same approval cannot double-fire.
<ConfirmCard
  host={host}
  data={data}
  heading="Run database migration?"
  cardId="card-approve-done"
  resolution={{ kind: 'action', action: 'approve', at: '2026-08-25T09:14:00Z' }}
/>`),
};
