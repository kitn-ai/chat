import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { LabVisualizer } from './lab-visualizer';
import { LAB_STATES, type LabParams, type LabState } from './lab-choreography';
import type { LabLook } from './lab-shaders';

// --- AUDIO VISUALIZER LAB -------------------------------------------------
//
// Four experimental looks from the aurora prototyping sessions, each running
// through the same ShaderCanvas the shipped variants use. None of these are
// component variants yet; this lab is where they live, get tuned, and earn
// promotion. The full-control playground they were born in is
// `examples/internal/aurora-playground`.
//
// The `state` control plays the agent-state choreography: the orbs sit nearly
// empty at `idle`, beat an ember while `connecting`, materialize smoke for
// `listening`, fire fractal lightning while `thinking`, and hand themselves
// to the voice loop while `speaking`.

interface LabArgs extends Partial<LabParams> {
  look: LabLook;
  state: LabState;
  color: string;
  size: number;
}

const PARAM_KEYS: (keyof LabParams)[] = [
  'baseR', 'ampIdle', 'ampVoice', 'radVoice', 'sigma', 'gain', 'f1', 'f2', 's1', 's2',
  'envSpd', 'sepSpd', 'whiteLo', 'whiteHi', 'bloomMul', 'bloomGain', 'delta', 'off',
  'wWidth', 'wMin', 'fillGain', 'edgeGain', 'flut', 'twistSpd', 'warpAmp', 'lens',
  'spec', 'tint', 'vSpeed', 'presence', 'gather', 'core', 'neural',
  'boltJag', 'boltWidth', 'boltRate',
];

function pickParams(args: LabArgs): Partial<LabParams> {
  const out: Partial<LabParams> = {};
  for (const key of PARAM_KEYS) {
    const value = args[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

const range = (min: number, max: number, step: number) => ({
  control: { type: 'range' as const, min, max, step },
});

const meta = {
  title: 'Labs/Audio Visualizers',
  render: (args: LabArgs) => (
    <LabVisualizer
      look={args.look}
      state={args.state}
      color={args.color}
      size={args.size}
      params={pickParams(args)}
    />
  ),
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Experimental visualizer looks on the shipped ShaderCanvas. ' +
          'Pick a state to run the agent choreography; tune the rest live.',
      },
    },
  },
  argTypes: {
    look: { table: { disable: true } },
    state: { control: 'select', options: LAB_STATES },
    color: { control: 'color' },
    size: range(160, 560, 20),
    baseR: range(0.02, 0.5, 0.005),
    sigma: range(0.006, 0.06, 0.001),
    gain: range(0.1, 2.5, 0.01),
    delta: range(0, 1.5, 0.01),
    off: range(0, 0.06, 0.001),
    f1: range(2, 10, 1),
    f2: range(4, 20, 0.25),
    s1: range(0, 3, 0.05),
    s2: range(0, 3, 0.05),
    wWidth: range(0.01, 0.09, 0.001),
    wMin: range(0.001, 0.02, 0.001),
    fillGain: range(0, 1, 0.01),
    edgeGain: range(0, 1.5, 0.01),
    twistSpd: range(0, 8, 0.05),
    vSpeed: range(0, 4, 0.05),
    warpAmp: range(0, 2, 0.05),
    lens: range(0, 1, 0.01),
    spec: range(0, 1, 0.01),
    tint: range(0, 1, 0.01),
    presence: range(0, 1, 0.01),
    gather: range(-1, 1, 0.02),
    neural: range(0, 1, 0.01),
    boltJag: range(0, 2.5, 0.05),
    boltWidth: range(0.3, 4, 0.05),
    boltRate: range(0.1, 2, 0.05),
  },
} satisfies Meta<LabArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

// Every story below renders through `meta`'s shared `render`, driven entirely
// by `args` -- there is no honest "Show code" snippet to write, because
// `LabVisualizer` is an internal Labs prototype (this folder, not exported
// from `src/index.ts` or `src/solid.ts`) with no consumer-facing API yet. A
// loud comment beats a silent exemption from the lint:story-conventions
// guard, which otherwise reads a missing snippet as an oversight.
const NO_CONSUMER_API = '// Internal Labs experiment -- no consumer-facing API yet. See this folder\'s LabVisualizer.';

export const SmokeOrb: Story = {
  args: { look: 'orb', state: 'thinking', color: '#1fd5f9', size: 320 },
  parameters: {
    controls: {
      include: ['state', 'color', 'size', 'baseR', 'fillGain', 'warpAmp', 'twistSpd',
        'vSpeed', 'tint', 'lens', 'presence', 'gather', 'neural',
        'boltJag', 'boltWidth', 'boltRate'],
    },
    docs: {
      source: { code: NO_CONSUMER_API, language: 'tsx' },
      description: {
        story:
          'Luminous smoke sealed in a stationary glass vessel. The smoke is the presence: ' +
          'it settles at idle, materializes for listening, takes on the accent color and ' +
          'fires lightning while thinking, and shreds with the voice while speaking. ' +
          'The vessel itself never changes size.',
      },
    },
  },
};

export const StormyPlanet: Story = {
  args: { look: 'planet', state: 'speaking', color: '#1fd5f9', size: 320 },
  parameters: {
    controls: {
      include: ['state', 'color', 'size', 'baseR', 'fillGain', 'warpAmp', 'twistSpd',
        'vSpeed', 'lens', 'presence', 'neural', 'boltJag', 'boltWidth', 'boltRate'],
    },
    docs: {
      source: { code: NO_CONSUMER_API, language: 'tsx' },
      description: {
        story:
          'Dense churning cloud cover on the same stationary vessel. Same choreography as ' +
          'the smoke orb with a heavier, planetary character.',
      },
    },
  },
};

export const Braid: Story = {
  args: { look: 'braid', state: 'manual', color: '#1fd5f9', size: 320 },
  parameters: {
    controls: {
      include: ['state', 'color', 'size', 'baseR', 'sigma', 'gain',
        'delta', 'off', 'f1', 'f2', 's1', 's2', 'vSpeed'],
    },
    docs: {
      source: { code: NO_CONSUMER_API, language: 'tsx' },
      description: {
        story:
          'Three woven strands sharing one wave family. Crossings brighten but are ' +
          'soft-compressed so the weave stays readable. While thinking it braids ' +
          'tighter and finer.',
      },
    },
  },
};

export const Ribbon: Story = {
  args: { look: 'ribbon', state: 'manual', color: '#1fd5f9', size: 320 },
  parameters: {
    controls: {
      include: ['state', 'color', 'size', 'baseR', 'wWidth', 'wMin',
        'fillGain', 'edgeGain', 'twistSpd', 'vSpeed'],
    },
    docs: {
      source: { code: NO_CONSUMER_API, language: 'tsx' },
      description: {
        story:
          'A single ribbon whose width pinches to zero at traveling twist points: wide ' +
          'sheer folds between pinches, dense edge-on lines at them, flapping like a flag.',
      },
    },
  },
};
