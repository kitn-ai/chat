import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import type { JSX } from 'solid-js';
import { Captions, type CaptionSegment, type CaptionsProps } from './captions';
import { componentDescription } from '../stories/docs/element-controls';

// Live closed-captioning: the text shown WHILE someone (the user or the
// agent) is speaking, distinct from a scrollback transcript. See
// captions.tsx's own doc comment for the full contract (segments, presence-
// gated appear/fade, speaker labeling, interim/final styling, motion-reduce
// support). Toggle Storybook's dark-mode control (toolbar) to see each
// variant against both themes — none of these are theme-specific stories.
const meta = {
  title: 'Components/Elements/Captions',
  component: Captions,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'A live closed-captioning line, driven by `segments` (oldest first — the last entry is the current line). Empty/undefined segments, or a current segment with empty/whitespace text, render nothing.',
        '`variant` picks the chrome: `lower-third` (a broadcast-style semi-opaque bar), `floating` (a card that floats above a visualizer), `minimal` (bare text, no chrome — the default), or `stacked` (the last two lines of history fade in behind the current line).',
        'Speaker-aware via a small "You"/"Assistant" label and `data-speaker` — never a color swap, since accent stays reserved for the voice visualizer. Interim (`final: false`) text renders a shade lighter than a finalized line, so a caption visibly settles once committed.',
      ]),
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['lower-third', 'floating', 'minimal', 'stacked'],
      description: 'Visual treatment.',
      table: { defaultValue: { summary: 'minimal' } },
    },
    segments: { control: false, description: 'Caption lines, oldest first. The last entry is the current line.' },
  },
  args: {
    variant: 'minimal',
    segments: [{ speaker: 'assistant', text: 'Three meetings today — standup at 10, a design review at 1, and a 1:1 at 4.' }],
  },
} satisfies Meta<typeof Captions>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Captions } from '@kitn.ai/ui/solid';`;

// A realistic alternating exchange, reused across the variant stories so the
// only thing changing story-to-story is the chrome.
const CONVERSATION: CaptionSegment[] = [
  { speaker: 'user', text: "What's on my calendar today?" },
  { speaker: 'assistant', text: 'Three meetings — standup at 10, a design review at 1, and a 1:1 at 4.' },
  { speaker: 'user', text: 'Can you move the design review to tomorrow?' },
];

function stage(el: () => JSX.Element) {
  return (
    <div class="flex min-h-40 flex-col items-center justify-center gap-6 rounded-lg border border-dashed border-border bg-background p-8">
      {el()}
    </div>
  );
}

export const LowerThird: Story = {
  name: 'Lower third',
  args: { variant: 'lower-third', segments: CONVERSATION },
  render: (args: CaptionsProps) => stage(() => <Captions {...args} class="max-w-2xl" />),
  parameters: {
    docs: {
      source: {
        code: `${IMPORT}\n\n<Captions variant="lower-third" segments={[{ speaker: 'assistant', text: '...' }]} />`,
        language: 'tsx',
      },
    },
  },
};

export const Floating: Story = {
  args: { variant: 'floating', segments: CONVERSATION },
  render: (args: CaptionsProps) => stage(() => <Captions {...args} />),
  parameters: {
    docs: {
      source: {
        code: `${IMPORT}\n\n<Captions variant="floating" segments={[{ speaker: 'assistant', text: '...' }]} />`,
        language: 'tsx',
      },
    },
  },
};

export const Minimal: Story = {
  args: { variant: 'minimal', segments: CONVERSATION },
  render: (args: CaptionsProps) => stage(() => <Captions {...args} />),
  parameters: {
    docs: {
      source: {
        code: `${IMPORT}\n\n<Captions variant="minimal" segments={[{ speaker: 'assistant', text: '...' }]} />`,
        language: 'tsx',
      },
    },
  },
};

export const Stacked: Story = {
  args: { variant: 'stacked', segments: CONVERSATION },
  render: (args: CaptionsProps) => stage(() => <Captions {...args} />),
  parameters: {
    docs: {
      source: {
        code: `${IMPORT}\n\n<Captions variant="stacked" segments={[/* 2-3 lines, oldest first */]} />`,
        language: 'tsx',
      },
    },
  },
};

export const Interim: Story = {
  name: 'Interim (not yet final)',
  args: {
    variant: 'lower-third',
    segments: [{ speaker: 'user', text: "What's on my calendar to—", final: false }],
  },
  render: (args: CaptionsProps) => stage(() => <Captions {...args} class="max-w-2xl" />),
  parameters: {
    docs: {
      description: {
        story: 'A caption still forming — `final: false` renders a shade lighter than a committed line, so the switch to full contrast reads as the moment ASR/the model settles on the text.',
      },
      source: {
        code: `${IMPORT}\n\n<Captions segments={[{ speaker: 'user', text: "What's on my calendar to—", final: false }]} />`,
        language: 'tsx',
      },
    },
  },
};

export const Empty: Story = {
  args: { variant: 'minimal', segments: [] },
  render: (args: CaptionsProps) => stage(() => <Captions {...args} />),
  parameters: {
    docs: {
      description: { story: 'Empty segments render nothing — no chrome, no placeholder, no reserved space.' },
      source: { code: `${IMPORT}\n\n<Captions segments={[]} />  {/* renders nothing */}`, language: 'tsx' },
    },
  },
};
