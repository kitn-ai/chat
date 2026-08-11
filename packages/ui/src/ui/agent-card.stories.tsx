import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { AgentCard } from './agent-card';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Elements/Agent Card',
  component: AgentCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'The compact representation of one agent in a focus + periphery multi-agent workspace. The agents you are not focused on collapse to these glanceable cards, laid out as a narrow rail or a wide list.',
        'Deliberately minimal: the agent name, a tone-colored status dot (`working` blue, `idle` muted, `done` green, `error` red, `blocked` amber), a `needsAttention` "Needs you" pill with a glowing amber edge for attention routing, and a trailing "..." overflow button (`onMenu`) for per-agent actions. Clicking the card promotes the agent to focus.',
      ]),
    },
  },
  argTypes: {
    name: { control: 'text', description: 'The agent name. The primary label.' },
    needsAttention: { control: 'boolean', description: 'Raise the "Needs you" pill + glowing edge.' },
    active: { control: 'boolean', description: 'Selected / focused state.' },
    status: { control: 'object', description: '{ tone, label?, pulse? } status dot config.' },
  },
  args: {
    name: 'Planner',
    needsAttention: false,
    active: false,
    status: { tone: 'working', label: 'Working', pulse: true },
  },
  render: (args) => (
    <div class="w-80">
      <AgentCard {...args} onMenu={() => {}} />
    </div>
  ),
} satisfies Meta<typeof AgentCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { AgentCard } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: edit the name, toggle `active` / `needsAttention`, change
 *  the status object, and click the trailing "..." button. */
export const Playground: Story = {
  ...src(`<AgentCard
  name="Planner"
  status={{ tone: 'working', label: 'Working', pulse: true }}
  onMenu={(e) => openMenu(e)}
/>`),
};

/** Every status tone, so the hue mapping reads at a glance: `working` blue (pulsing),
 *  `idle` muted, `done` green, `error` red, `blocked` amber. */
export const Tones: Story = {
  render: () => (
    <div class="flex w-96 flex-col gap-2">
      <AgentCard name="Planner" status={{ tone: 'working', label: 'Working', pulse: true }} onMenu={() => {}} />
      <AgentCard name="Researcher" status={{ tone: 'idle', label: 'Idle' }} onMenu={() => {}} />
      <AgentCard name="Builder" status={{ tone: 'done', label: 'Done' }} onMenu={() => {}} />
      <AgentCard name="Runner" status={{ tone: 'error', label: 'Failed' }} onMenu={() => {}} />
      <AgentCard name="Reviewer" status={{ tone: 'blocked', label: 'Blocked' }} onMenu={() => {}} />
    </div>
  ),
  ...src(`<div class="flex w-96 flex-col gap-2">
  <AgentCard name="Planner" status={{ tone: 'working', label: 'Working', pulse: true }} onMenu={openMenu} />
  <AgentCard name="Researcher" status={{ tone: 'idle', label: 'Idle' }} onMenu={openMenu} />
  <AgentCard name="Builder" status={{ tone: 'done', label: 'Done' }} onMenu={openMenu} />
  <AgentCard name="Runner" status={{ tone: 'error', label: 'Failed' }} onMenu={openMenu} />
  <AgentCard name="Reviewer" status={{ tone: 'blocked', label: 'Blocked' }} onMenu={openMenu} />
</div>`),
};

/** `needsAttention` raises an amber "Needs you" pill and a glowing amber ring so the
 *  card jumps out of the periphery - the attention-routing signal. */
export const NeedsAttention: Story = {
  args: {
    name: 'Reviewer',
    status: { tone: 'blocked', label: 'Blocked' },
    needsAttention: true,
  },
  ...src(`<AgentCard
  name="Reviewer"
  status={{ tone: 'blocked', label: 'Blocked' }}
  needsAttention
  onMenu={(e) => openMenu(e)}
/>`),
};

/** The selected / focused card. A highlighted border and surface mark the agent the
 *  user is currently focused on. */
export const Active: Story = {
  args: {
    name: 'Orchestrator',
    status: { tone: 'working', label: 'Working', pulse: true },
    active: true,
  },
  ...src(`<AgentCard
  name="Orchestrator"
  status={{ tone: 'working', label: 'Working', pulse: true }}
  active
  onMenu={(e) => openMenu(e)}
/>`),
};

/** Six agents in varied states so the attention hierarchy reads at a glance: a working
 *  agent pulsing, an idle one, a finished one, an errored one, one that `needsAttention`,
 *  and one `active` (focused). Each carries a trailing "..." menu. */
export const Stack: Story = {
  render: () => (
    <div class="flex w-96 flex-col gap-2">
      <AgentCard name="Planner" status={{ tone: 'working', label: 'Working', pulse: true }} onMenu={() => {}} />
      <AgentCard name="Researcher" status={{ tone: 'idle', label: 'Idle' }} onMenu={() => {}} />
      <AgentCard name="Builder" status={{ tone: 'done', label: 'Done' }} onMenu={() => {}} />
      <AgentCard name="Runner" status={{ tone: 'error', label: 'Failed' }} onMenu={() => {}} />
      <AgentCard name="Reviewer" status={{ tone: 'blocked', label: 'Blocked' }} needsAttention onMenu={() => {}} />
      <AgentCard name="Orchestrator" status={{ tone: 'working', label: 'Working', pulse: true }} active onMenu={() => {}} />
    </div>
  ),
  ...src(`<div class="flex w-96 flex-col gap-2">
  <AgentCard name="Planner" status={{ tone: 'working', label: 'Working', pulse: true }} onMenu={openMenu} />
  <AgentCard name="Researcher" status={{ tone: 'idle', label: 'Idle' }} onMenu={openMenu} />
  <AgentCard name="Builder" status={{ tone: 'done', label: 'Done' }} onMenu={openMenu} />
  <AgentCard name="Runner" status={{ tone: 'error', label: 'Failed' }} onMenu={openMenu} />
  <AgentCard name="Reviewer" status={{ tone: 'blocked', label: 'Blocked' }} needsAttention onMenu={openMenu} />
  <AgentCard name="Orchestrator" status={{ tone: 'working', label: 'Working', pulse: true }} active onMenu={openMenu} />
</div>`),
};

/** As a narrow side RAIL. The name truncates so the same card fits a tight column. */
export const Rail: Story = {
  render: () => (
    <div class="flex w-60 flex-col gap-2 rounded-xl border border-border bg-surface-sunken p-2">
      <AgentCard name="Planner" status={{ tone: 'working', pulse: true }} onMenu={() => {}} />
      <AgentCard name="Builder" status={{ tone: 'done' }} onMenu={() => {}} />
      <AgentCard name="Reviewer" status={{ tone: 'blocked' }} needsAttention onMenu={() => {}} />
    </div>
  ),
  ...src(`<div class="flex w-60 flex-col gap-2">
  <AgentCard name="Planner" status={{ tone: 'working', pulse: true }} onMenu={openMenu} />
  <AgentCard name="Builder" status={{ tone: 'done' }} onMenu={openMenu} />
  <AgentCard name="Reviewer" status={{ tone: 'blocked' }} needsAttention onMenu={openMenu} />
</div>`),
};
