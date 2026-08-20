import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { WorkspaceShell, type WorkspaceShellController } from './workspace-shell';

// Components/Elements: the chat-agnostic workspace layout shell (SolidJS layer).
// The B4 real-browser probes (packages/ui/scripts/probe-workspace-shell-*.mjs)
// drive the <kai-workspace> facade over this same component; these stories are
// the human-viewable copies of those probe scenes.

const meta = {
  title: 'Components/Elements/WorkspaceShell',
  component: WorkspaceShell,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof WorkspaceShell>;
export default meta;
type Story = StoryObj<typeof meta>;

const box = (label: string, extra: Record<string, string> = {}) => (
  <div style={{ padding: '0.75rem', font: '13px system-ui', color: 'var(--color-foreground)', height: '100%', ...extra }}>
    {label}
  </div>
);

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
};
