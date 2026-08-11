import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Kbd } from './kbd';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/Kbd',
  component: Kbd,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'A keyboard-shortcut display. `keys` is a `+`-joined spec (`Mod+Shift+K`); each token maps to a platform glyph (`Mod` → ⌘ on mac else Ctrl, `Shift` → ⇧, `ArrowUp` → ↑, `Enter` → ⏎) and renders as an inset cap. `platform` forces `mac`/`other` or `auto`-sniffs the OS. Display only; it does not bind keys. Omit `keys` to render your own content.',
      ]),
    },
  },
  argTypes: {
    keys: {
      control: 'text',
      description: 'Shortcut spec, tokens joined by `+`.',
    },
    platform: {
      control: 'select',
      options: ['auto', 'mac', 'other'],
      description: 'Glyph platform. `auto` sniffs the OS.',
      table: { defaultValue: { summary: 'auto' } },
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'Cap size.',
      table: { defaultValue: { summary: 'md' } },
    },
  },
  args: {
    keys: 'Mod+K',
    platform: 'mac',
    size: 'md',
  },
  render: (args) => <Kbd {...args} />,
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Kbd } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Interactive playground: type a `+`-joined spec and pick a platform. */
export const Playground: Story = {
  ...src(`<Kbd keys="Mod+K" platform="mac" />`),
};

/** Mac glyphs vs the cross-platform Ctrl set, same spec. */
export const Platforms: Story = {
  render: () => (
    <div class="flex items-center gap-5 text-sm text-foreground">
      <span class="flex items-center gap-2">mac <Kbd keys="Mod+Shift+K" platform="mac" /></span>
      <span class="flex items-center gap-2">other <Kbd keys="Mod+Shift+K" platform="other" /></span>
    </div>
  ),
  ...src(`<Kbd keys="Mod+Shift+K" platform="mac" />
<Kbd keys="Mod+Shift+K" platform="other" />`),
};

/** Modifiers, arrows, and named keys mapped to their glyphs. */
export const Glyphs: Story = {
  render: () => (
    <div class="flex flex-wrap items-center gap-3">
      <Kbd keys="Mod+K" platform="mac" />
      <Kbd keys="Mod+Shift+ArrowUp" platform="mac" />
      <Kbd keys="Alt+Enter" platform="mac" />
      <Kbd keys="Ctrl+Esc" platform="other" />
      <Kbd keys="Shift+Space" platform="mac" />
    </div>
  ),
  ...src(`<Kbd keys="Mod+K" platform="mac" />
<Kbd keys="Mod+Shift+ArrowUp" platform="mac" />
<Kbd keys="Alt+Enter" platform="mac" />
<Kbd keys="Ctrl+Esc" platform="other" />
<Kbd keys="Shift+Space" platform="mac" />`),
};

/** Both cap sizes for comparison. */
export const Sizes: Story = {
  render: () => (
    <div class="flex items-center gap-5">
      <Kbd keys="Mod+K" platform="mac" size="sm" />
      <Kbd keys="Mod+K" platform="mac" size="md" />
    </div>
  ),
  ...src(`<Kbd keys="Mod+K" platform="mac" size="sm" />
<Kbd keys="Mod+K" platform="mac" size="md" />`),
};

/** Omit `keys` to render custom content verbatim inside the cap row. */
export const CustomContent: Story = {
  render: () => (
    <Kbd>
      <span class="inline-flex h-6 items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-medium text-muted-foreground">
        Esc
      </span>
    </Kbd>
  ),
  ...src(`<Kbd>
  <span class="...">Esc</span>
</Kbd>`),
};

/** Inline next to a label, the usual menu / command-row pattern. */
export const Inline: Story = {
  render: () => (
    <div class="flex items-center gap-2 text-sm text-foreground">
      <span>Command palette</span>
      <Kbd keys="Mod+K" platform="mac" class="ml-auto" />
    </div>
  ),
  ...src(`<div class="flex items-center gap-2 text-sm">
  <span>Command palette</span>
  <Kbd keys="Mod+K" platform="mac" />
</div>`),
};
