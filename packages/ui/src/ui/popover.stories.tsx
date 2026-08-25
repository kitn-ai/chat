import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { fn } from 'storybook/test';
import { createSignal, Show, For } from 'solid-js';
import { Popover, type PopoverProps } from './popover';
import { Switch } from './switch';
import { Button } from './button';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/Popover',
  component: Popover,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'A `trigger` that toggles a floating `role="dialog"` panel of arbitrary `children` (toggles, rows, nested groups). Use `Dropdown` instead for a plain list of commands.',
        'Uncontrolled by default; pass `open` + `onOpenChange` to control it. Escape or an outside click closes.',
      ]),
    },
  },
  argTypes: {
    placement: {
      control: 'select',
      options: ['bottom-start', 'bottom', 'bottom-end', 'top-start', 'top', 'top-end', 'left', 'right'],
      description: 'Floating placement relative to the trigger.',
      table: { defaultValue: { summary: 'bottom-start' } },
    },
    gutter: { control: 'number', description: 'Gap in px between trigger and panel.', table: { defaultValue: { summary: '6' } } },
    open: { control: 'boolean', description: 'Controlled open state. Omit for click-to-toggle.' },
    onOpenChange: {
      action: 'openChange',
      description: 'Fires with the next open state whenever the popover opens or closes.',
      table: { category: 'Events' },
    },
  },
  args: { placement: 'bottom-start', onOpenChange: fn() },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * SolidJS stories can't auto-serialize a render function (the panel shows `{}`),
 * so attach a real, paste-ready snippet with its imports. `imports` defaults to
 * the common set; richer stories pass their own. `language: 'tsx'` labels SolidJS.
 */
const IMPORT = `import { Popover, Button } from '@kitn.ai/ui/solid';`;
const src = (code: string, imports = IMPORT) => ({
  parameters: { docs: { source: { code: `${imports}\n\n${code}`, language: 'tsx' } } },
});

const LEGACY = ['GPT-4o', 'GPT-4.1', 'GPT-4o mini'];
const row = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted';

/** A model menu rebuilt from the primitive: a flagship row, an expandable group,
 *  and a Switch, the kind of card a plain menu can't hold. */
export const ModelMenu: Story = {
  render: (args: Partial<PopoverProps>) => {
    const [legacyOpen, setLegacyOpen] = createSignal(false);
    return (
      <Popover {...args} trigger={<Button variant="ghost" size="sm">GPT-5.5 ▾</Button>}>
        <div style={{ width: '15rem' }}>
          <button type="button" class={row}>
            <span style={{ 'font-weight': 600 }}>GPT-5.5</span>
            <span class="text-caption text-muted-foreground">Flagship</span>
          </button>
          <button type="button" class={row} aria-expanded={legacyOpen() ? 'true' : 'false'} onClick={() => setLegacyOpen(!legacyOpen())}>
            Legacy models {legacyOpen() ? '▴' : '▾'}
          </button>
          <Show when={legacyOpen()}>
            <For each={LEGACY}>{(m) => <button type="button" class={row} style={{ 'padding-left': '1.75rem' }}>{m}</button>}</For>
          </Show>
          <div style={{ height: '1px', margin: '4px 0', background: 'var(--color-border)' }} />
          <div class={row} style={{ 'justify-content': 'space-between' }}>
            <span>Temporary chat</span>
            <Switch label="Temporary chat" />
          </div>
        </div>
      </Popover>
    );
  },
  ...src(
    `function ModelMenu() {
  const [legacyOpen, setLegacyOpen] = createSignal(false);
  const legacy = ['GPT-4o', 'GPT-4.1', 'GPT-4o mini'];
  const row = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted';
  return (
    <Popover trigger={<Button variant="ghost" size="sm">GPT-5.5 ▾</Button>}>
      <div style={{ width: '15rem' }}>
        <button type="button" class={row}>
          <span style={{ 'font-weight': 600 }}>GPT-5.5</span>
          <span class="text-caption text-muted-foreground">Flagship</span>
        </button>
        <button type="button" class={row} aria-expanded={legacyOpen() ? 'true' : 'false'} onClick={() => setLegacyOpen(!legacyOpen())}>
          Legacy models {legacyOpen() ? '▴' : '▾'}
        </button>
        <Show when={legacyOpen()}>
          <For each={legacy}>{(m) => <button type="button" class={row} style={{ 'padding-left': '1.75rem' }}>{m}</button>}</For>
        </Show>
        <div style={{ height: '1px', margin: '4px 0', background: 'var(--color-border)' }} />
        <div class={row} style={{ 'justify-content': 'space-between' }}>
          <span>Temporary chat</span>
          <Switch label="Temporary chat" />
        </div>
      </div>
    </Popover>
  );
}`,
    `import { createSignal, Show, For } from 'solid-js';\nimport { Popover, Switch, Button } from '@kitn.ai/ui/solid';`,
  ),
};

/** Minimal: a trigger and a small card. */
export const Basic: Story = {
  render: (args: Partial<PopoverProps>) => (
    <Popover {...args} trigger={<Button size="sm">Open</Button>}>
      <div style={{ width: '12rem', padding: '0.5rem' }} class="text-sm text-foreground">
        Any content goes here; this is a <code>role="dialog"</code> panel.
      </div>
    </Popover>
  ),
  ...src(`<Popover trigger={<Button size="sm">Open</Button>}>
  <div style={{ width: '12rem', padding: '0.5rem' }} class="text-sm text-foreground">
    Any content goes here; this is a <code>role="dialog"</code> panel.
  </div>
</Popover>`),
};
