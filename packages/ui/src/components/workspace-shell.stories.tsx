import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createEffect, createSignal } from 'solid-js';
import { WorkspaceShell, type WorkspaceShellController, type WorkspaceShellProps } from './workspace-shell';
import { componentDescription } from '../stories/docs/element-controls';

// Components/Elements: the chat-agnostic workspace layout shell (SolidJS layer).
// The B4 real-browser probes (packages/ui/scripts/probe-workspace-shell-*.mjs)
// drive the <kai-workspace> facade over this same component; these stories are
// the human-viewable copies of those probe scenes.

const box = (label: string, extra: Record<string, string> = {}) => (
  <div style={{ padding: '0.75rem', font: '13px system-ui', color: 'var(--color-foreground)', height: '100%', ...extra }}>
    {label}
  </div>
);

const meta = {
  title: 'Components/Elements/WorkspaceShell',
  component: WorkspaceShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    // This list gates BOTH the interactive Controls panel and the autodocs
    // ArgsTable -- a row missing here does not render on the Docs page even
    // when `docs.controls.exclude` below does not name it (verified live on
    // pane-group.stories.tsx) -- so the two event callbacks live here too,
    // alongside the props the Playground actually wires up.
    controls: {
      include: [
        'defaultStartCollapsed', 'defaultEndCollapsed',
        'startWidth', 'startMinWidth', 'startMaxWidth',
        'endWidth', 'endMinWidth', 'endMaxWidth',
        'collapseBelow', 'drawerBelow', 'compact', 'class',
        'onAsideToggle', 'onAsideResize',
      ],
    },
    docs: {
      // The five region props take JSX, so a control panel row for them
      // would do nothing. They stay documented (argTypes below) with
      // `control: false` rather than being hidden. Everything excluded here
      // is inferred from the props interface but is not something the
      // Playground wires up, so a row for it would be inert.
      controls: { exclude: ['controllerRef', 'startCollapsed', 'endCollapsed'] },
      description: componentDescription([
        'The chat-agnostic workspace layout shell: five regions (header, start aside, main, end aside, footer) with drag handles between the columns, per-aside collapse, a collapse-below-width breakpoint, and a mobile drawer mode.',
        'It knows nothing about chat. A file tree in `start` is as valid as a conversation rail. Each region renders only when you pass content for it.',
        'The Playground drives the asides in CONTROLLED mode so the collapse toggles track the panel; in your own app you can omit `startCollapsed` / `endCollapsed` and let the shell own the state from `defaultStartCollapsed` / `defaultEndCollapsed`.',
      ]),
    },
  },
  argTypes: {
    header: { control: false, description: 'Header band content. The region renders only when provided.' },
    start: { control: false, description: 'Start aside content (rail, nav, file tree).' },
    end: { control: false, description: 'End aside content (inspector, notes, preview).' },
    footer: { control: false, description: 'Footer band content.' },
    children: { control: false, description: 'Main region content. Always rendered.' },
    defaultStartCollapsed: {
      control: 'boolean',
      description: 'Start aside collapsed. (Read once at mount for an uncontrolled shell; the Playground maps it onto the controlled prop so the toggle is live.)',
      table: { defaultValue: { summary: 'false' } },
    },
    defaultEndCollapsed: {
      control: 'boolean',
      description: 'End aside collapsed. (Same mapping as `defaultStartCollapsed` in the Playground.)',
      table: { defaultValue: { summary: 'false' } },
    },
    startWidth: { control: { type: 'range', min: 120, max: 520, step: 10 }, description: 'Start aside width in px.', table: { defaultValue: { summary: '280' } } },
    startMinWidth: { control: 'number', description: 'Start aside minimum width in px during resize.', table: { defaultValue: { summary: '200' } } },
    startMaxWidth: { control: 'number', description: 'Start aside maximum width in px during resize.', table: { defaultValue: { summary: '480' } } },
    endWidth: { control: { type: 'range', min: 120, max: 520, step: 10 }, description: 'End aside width in px.', table: { defaultValue: { summary: '320' } } },
    endMinWidth: { control: 'number', description: 'End aside minimum width in px during resize.', table: { defaultValue: { summary: '200' } } },
    endMaxWidth: { control: 'number', description: 'End aside maximum width in px during resize.', table: { defaultValue: { summary: '480' } } },
    collapseBelow: { control: 'number', description: 'Auto-collapse both asides below this shell width in px. Omit to disable.' },
    drawerBelow: { control: 'number', description: 'Below this shell width in px an expanded aside renders as an overlay drawer. Omit to disable.' },
    compact: { control: 'boolean', description: 'Density hint, reflected as `data-compact` on the root for your CSS and slotted content.' },
    onAsideToggle: { action: 'aside-toggle', description: 'An aside collapsed or expanded (method, breakpoint, or drawer Escape).', table: { category: 'Events' } },
    onAsideResize: { action: 'aside-resize', description: 'An aside was resized, width in px.', table: { category: 'Events' } },
    class: { control: 'text', description: 'Extra classes for the shell root.' },
  },
  args: {
    defaultStartCollapsed: false,
    defaultEndCollapsed: false,
    startWidth: 280,
    endWidth: 320,
    compact: false,
  },
} satisfies Meta<typeof WorkspaceShell>;
export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { WorkspaceShell } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/**
 * Every region filled, with the widths and the collapse state on the controls.
 * Drag the handles between the columns, or use the buttons in `main` to toggle
 * an aside; both stay in step with the panel.
 */
export const Playground: Story = {
  // Storybook's story-level `render` does not infer its parameter here (the meta-level
  // one does), so the props interface is named explicitly rather than left implicitly any.
  render: (args: Partial<WorkspaceShellProps>) => {
    // Storybook's Solid renderer runs a story body ONCE and `args` is a store, so
    // a controlled prop read straight out of `args` would snapshot its first value
    // and the control would look dead. Seed signals and sync them in an effect.
    const [startCollapsed, setStartCollapsed] = createSignal(args.defaultStartCollapsed ?? false);
    const [endCollapsed, setEndCollapsed] = createSignal(args.defaultEndCollapsed ?? false);
    createEffect(() => setStartCollapsed(args.defaultStartCollapsed ?? false));
    createEffect(() => setEndCollapsed(args.defaultEndCollapsed ?? false));
    return (
      <div style={{ height: '600px' }}>
        <WorkspaceShell
          {...args}
          header={box('header: app bar')}
          start={box('start: rail / nav / file tree')}
          end={box('end: inspector / notes')}
          footer={box('footer: status bar')}
          startCollapsed={startCollapsed()}
          endCollapsed={endCollapsed()}
          onAsideToggle={(d) => {
            (d.side === 'start' ? setStartCollapsed : setEndCollapsed)(d.collapsed);
            args.onAsideToggle?.(d);
          }}
        >
          <div style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem', font: '13px system-ui' }}>
            <button onClick={() => setStartCollapsed((v) => !v)}>toggle start</button>
            <button onClick={() => setEndCollapsed((v) => !v)}>toggle end</button>
          </div>
        </WorkspaceShell>
      </div>
    );
  },
  ...src(`const [startCollapsed, setStartCollapsed] = createSignal(false);
const [endCollapsed, setEndCollapsed] = createSignal(false);

<WorkspaceShell
  header={<AppBar />}
  start={<FileTree />}
  end={<Inspector />}
  footer={<StatusBar />}
  startCollapsed={startCollapsed()}
  endCollapsed={endCollapsed()}
  onAsideToggle={(d) => (d.side === 'start' ? setStartCollapsed : setEndCollapsed)(d.collapsed)}
>
  <Main />
</WorkspaceShell>`),
};

export const FiveRegions: Story = {
  render: () => (
    <div style={{ height: '600px' }}>
      <WorkspaceShell
        header={box('header: app bar')}
        start={box('start: rail / nav / file tree')}
        end={box('end: inspector / notes')}
        footer={box('footer: status bar')}
      >
        {box('main: the app')}
      </WorkspaceShell>
    </div>
  ),
  ...src(`<WorkspaceShell
  header={<AppBar />}
  start={<FileTree />}
  end={<Inspector />}
  footer={<StatusBar />}
>
  <Main />
</WorkspaceShell>`),
};

export const CollapseAndDrawer: Story = {
  render: () => {
    let api!: WorkspaceShellController;
    const [last, setLast] = createSignal('none yet');
    return (
      <div style={{ height: '600px' }}>
        <WorkspaceShell
          start={box('start aside')}
          end={box('end aside')}
          collapseBelow={720}
          drawerBelow={560}
          controllerRef={(c) => (api = c)}
          onAsideToggle={(d) => setLast(`${d.side}: ${d.collapsed ? 'collapsed' : 'expanded'}`)}
        >
          <div style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem', 'flex-direction': 'column', 'align-items': 'flex-start' }}>
            <button onClick={() => api.toggleAside('start')}>toggle start</button>
            <button onClick={() => api.toggleAside('end')}>toggle end</button>
            <span style={{ font: '12px system-ui', color: 'var(--color-muted-foreground)' }}>
              last toggle {last()}. Narrow the viewport under 720px to auto-collapse, under 560px for drawer mode.
            </span>
          </div>
        </WorkspaceShell>
      </div>
    );
  },
  ...src(`let api: WorkspaceShellController;

<WorkspaceShell
  start={<StartAside />}
  end={<EndAside />}
  collapseBelow={720}
  drawerBelow={560}
  controllerRef={(c) => (api = c)}
  onAsideToggle={(d) => console.log(d.side, d.collapsed)}
>
  <button onClick={() => api.toggleAside('start')}>toggle start</button>
</WorkspaceShell>`),
};
