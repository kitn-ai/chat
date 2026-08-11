import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { type JSX } from 'solid-js';
import { Bot, Terminal } from 'lucide-solid';
import { Pane } from './pane';
import { componentDescription } from '../stories/docs/element-controls';

// --- Story helpers -------------------------------------------------------

/** A round agent avatar used as the header `leading` glyph. */
const Avatar = (props: { children: JSX.Element }) => (
  <span class="flex size-6 items-center justify-center rounded-md bg-surface-strong text-foreground">
    {props.children}
  </span>
);

/** A few lines of body content so the scroll region has something to scroll. */
const Body = () => (
  <div class="space-y-2 p-3 text-sm text-muted-foreground">
    <p class="text-foreground">Planning the refactor.</p>
    <p>Read <code class="rounded bg-surface-strong px-1 text-foreground">src/ui/pane.tsx</code> and the surrounding primitives.</p>
    <p>Mapped the header, body, and footer regions.</p>
    <p>Wiring the window controls to their callbacks…</p>
    <p>Verifying the scroll plumbing holds at a bounded height.</p>
    <p>Checking the focused + maximized states read in dark mode.</p>
  </div>
);

/** A pinned footer composer, to show the body scrolls above a fixed row. */
const Composer = () => (
  <div class="flex items-center gap-2 p-2">
    <input
      type="text"
      placeholder="Reply to the agent…"
      class="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
    <button type="button" class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
      Send
    </button>
  </div>
);

const meta = {
  title: 'Components/Elements/Pane',
  component: Pane,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'A framed panel for a multi-agent workspace: a header (leading glyph + title/subtitle + tone-colored status dot + actions + window controls), a scrolling body, and an optional pinned footer (a composer). The "pane frame" every agent tile otherwise re-hand-rolls. Maximize/restore and close are built in; split and dock appear only when you pass `onSplit` / `onDock`. `focused` rings the active pane; `maximized` swaps the maximize glyph for restore. Give the pane a bounded height for the body scroll to engage.',
      ]),
    },
  },
  argTypes: {
    leading: { control: false, description: 'A glyph/avatar before the title.' },
    title: { control: 'text', description: 'The pane title (the agent/window name).' },
    subtitle: { control: 'text', description: 'A role/label under the title.' },
    status: { control: false, description: 'Tone-colored status dot: working | idle | done | error | blocked (+ optional label, pulse).' },
    actions: { control: false, description: 'Extra header controls, before the window controls.' },
    footer: { control: false, description: 'A pinned row below the body (e.g. a composer).' },
    focused: { control: 'boolean', description: 'Ring/border the active pane.' },
    maximized: { control: 'boolean', description: 'Show restore instead of maximize.' },
    children: { control: false, description: 'The pane body (scrolls).' },
    class: { control: 'text', description: 'Extra classes for the outer frame.' },
  },
  render: (args) => (
    <div class="h-80 max-w-md">
      <Pane
        {...args}
        leading={<Avatar><Bot class="size-4" aria-hidden="true" /></Avatar>}
        status={{ tone: 'working', label: 'Working', pulse: true }}
        footer={<Composer />}
        onMaximize={() => {}}
        onClose={() => {}}
      >
        <Body />
      </Pane>
    </div>
  ),
} satisfies Meta<typeof Pane>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Pane } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** The default pane: header with a leading avatar, a working status, window
 *  controls, a scrolling body, and a footer composer. */
export const Default: Story = {
  render: () => (
    <div class="h-80 max-w-md">
      <Pane
        title="Refactor agent"
        subtitle="claude-sonnet"
        leading={<Avatar><Bot class="size-4" aria-hidden="true" /></Avatar>}
        status={{ tone: 'working', label: 'Working', pulse: true }}
        footer={<Composer />}
        onMaximize={() => {}}
        onClose={() => {}}
      >
        <Body />
      </Pane>
    </div>
  ),
  ...src(`<Pane
  title="Refactor agent"
  subtitle="claude-sonnet"
  leading={<Bot class="size-4" />}
  status={{ tone: 'working', label: 'Working', pulse: true }}
  footer={<Composer />}
  onMaximize={() => toggleMaximize()}
  onClose={() => closePane()}
>
  {/* body content — scrolls inside the pane */}
</Pane>`),
};

/** `focused` rings the frame to mark the active pane. Optional split + dock
 *  controls appear because `onSplit` / `onDock` are passed. */
export const Focused: Story = {
  render: () => (
    <div class="h-80 max-w-md">
      <Pane
        title="Reviewer agent"
        subtitle="Reviewing the diff"
        leading={<Avatar><Bot class="size-4" aria-hidden="true" /></Avatar>}
        status={{ tone: 'working', label: 'Working', pulse: true }}
        focused
        footer={<Composer />}
        onMaximize={() => {}}
        onClose={() => {}}
        onSplit={() => {}}
        onDock={() => {}}
      >
        <Body />
      </Pane>
    </div>
  ),
  ...src(`<Pane
  title="Reviewer agent"
  subtitle="Reviewing the diff"
  leading={<Bot class="size-4" />}
  status={{ tone: 'working', label: 'Working', pulse: true }}
  focused
  footer={<Composer />}
  onMaximize={() => toggleMaximize()}
  onClose={() => closePane()}
  onSplit={() => splitPane()}   // adds the split control
  onDock={() => dockPane()}     // adds the dock control
>
  {/* body content */}
</Pane>`),
};

/** All five status tones, side by side. Each maps to a semantic/tool color token
 *  so it reads in light AND dark: working → blue, idle → muted, done → green,
 *  error → red, blocked → amber. */
export const StatusTones: Story = {
  name: 'Status Tones',
  render: () => (
    <div class="grid h-80 grid-cols-2 gap-4 lg:grid-cols-4">
      <Pane
        title="Builder"
        subtitle="Compiling"
        leading={<Avatar><Terminal class="size-4" aria-hidden="true" /></Avatar>}
        status={{ tone: 'working', label: 'Working', pulse: true }}
        onMaximize={() => {}}
        onClose={() => {}}
      >
        <Body />
      </Pane>
      <Pane
        title="Reviewer"
        subtitle="Waiting on input"
        leading={<Avatar><Bot class="size-4" aria-hidden="true" /></Avatar>}
        status={{ tone: 'blocked', label: 'Blocked' }}
        onMaximize={() => {}}
        onClose={() => {}}
      >
        <Body />
      </Pane>
      <Pane
        title="Tester"
        subtitle="All checks passed"
        leading={<Avatar><Bot class="size-4" aria-hidden="true" /></Avatar>}
        status={{ tone: 'done', label: 'Done' }}
        onMaximize={() => {}}
        onClose={() => {}}
      >
        <Body />
      </Pane>
      <Pane
        title="Deployer"
        subtitle="Build failed"
        leading={<Avatar><Bot class="size-4" aria-hidden="true" /></Avatar>}
        status={{ tone: 'error', label: 'Error' }}
        onMaximize={() => {}}
        onClose={() => {}}
      >
        <Body />
      </Pane>
    </div>
  ),
  ...src(`// tone maps to a semantic/tool color token (light + dark):
//   working → blue · idle → muted · done → green · error → red · blocked → amber
<Pane title="Builder"  status={{ tone: 'working', label: 'Working', pulse: true }} … />
<Pane title="Reviewer" status={{ tone: 'blocked', label: 'Blocked' }} … />
<Pane title="Tester"   status={{ tone: 'done',    label: 'Done' }} … />
<Pane title="Deployer" status={{ tone: 'error',   label: 'Error' }} … />
<Pane title="Idle"     status={{ tone: 'idle',    label: 'Idle' }} … />`),
};

/** `maximized` swaps the maximize glyph for restore — the state a workspace sets
 *  on the one pane it has blown up to fill the view. */
export const Maximized: Story = {
  render: () => (
    <div class="h-96 max-w-2xl">
      <Pane
        title="Refactor agent"
        subtitle="claude-sonnet"
        leading={<Avatar><Bot class="size-4" aria-hidden="true" /></Avatar>}
        status={{ tone: 'done', label: 'Done' }}
        maximized
        focused
        footer={<Composer />}
        onMaximize={() => {}}
        onClose={() => {}}
      >
        <Body />
      </Pane>
    </div>
  ),
  ...src(`<Pane
  title="Refactor agent"
  subtitle="claude-sonnet"
  leading={<Bot class="size-4" />}
  status={{ tone: 'done', label: 'Done' }}
  maximized   // shows the restore glyph instead of maximize
  focused
  footer={<Composer />}
  onMaximize={() => toggleMaximize()}
  onClose={() => closePane()}
>
  {/* body content */}
</Pane>`),
};
