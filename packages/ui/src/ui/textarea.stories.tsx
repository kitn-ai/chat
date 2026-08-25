import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import type { JSX } from '@solidjs/web';
import { fn } from 'storybook/test';
import { Textarea, type TextareaProps } from './textarea';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'The transparent, borderless `<textarea>` behind `PromptInput`: it auto-grows up to `maxHeight` (px), then scrolls. Drop it in a framed container that owns the border and focus ring. Set `autoResize={false}` for a fixed height.',
      ]),
    },
  },
  argTypes: {
    placeholder: { control: 'text', description: 'Placeholder text.' },
    maxHeight: { control: 'number', description: 'Max height (px) before the field scrolls instead of growing.' },
    autoResize: { control: 'boolean', description: 'Grow with content. Default true.' },
    class: { control: 'text', description: 'Extra classes.' },
    onInput: {
      action: 'input',
      description: 'Fires on every keystroke; read `event.currentTarget.value`.',
      table: { category: 'Events' },
    },
    onChange: {
      action: 'change',
      description: 'Fires on blur/commit, like a native textarea.',
      table: { category: 'Events' },
    },
  },
  args: {
    placeholder: 'Ask anything… (Shift+Enter for a newline)',
    maxHeight: 200,
    onInput: fn(),
    onChange: fn(),
  },
  render: (args) => (
    <Frame>
      <Textarea {...args} class="focus-visible:ring-0" />
    </Frame>
  ),
} satisfies Meta<typeof Textarea>;

/**
 * The composed input frame, mirroring how `PromptInput` wraps the textarea: the
 * FRAME owns the boundary + focus ring (`focus-within`), and the transparent
 * textarea inside has its own ring neutralized so there's no nested box.
 */
function Frame(props: { children: JSX.Element }) {
  return (
    <div class="w-96 cursor-text rounded-xl border border-border bg-muted/40 p-3 shadow-xs transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
      {props.children}
    </div>
  );
}

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Textarea } from '@kitn.ai/ui';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Type several lines: the field grows until `maxHeight`, then scrolls. Focus the field: the ring is on the frame, not a nested box. */
export const Playground: Story = {
  ...src(`{/* The frame owns the focus ring; the textarea's own ring is neutralized. */}
<div class="cursor-text rounded-xl border bg-muted/40 p-3 focus-within:ring-2 focus-within:ring-ring">
  <Textarea
    placeholder="Ask anything…"
    maxHeight={200}
    class="focus-visible:ring-0"
    onInput={(e) => setValue(e.currentTarget.value)}
  />
</div>`),
};

/** A fixed-height field (auto-resize disabled). */
export const FixedHeight: Story = {
  render: (args: TextareaProps) => (
    <Frame>
      <Textarea
        autoResize={false}
        rows={4}
        placeholder="Fixed at 4 rows…"
        class="focus-visible:ring-0"
        onInput={args.onInput}
        onChange={args.onChange}
      />
    </Frame>
  ),
  ...src(`<div class="cursor-text rounded-xl border bg-muted/40 p-3 focus-within:ring-2 focus-within:ring-ring">
  <Textarea autoResize={false} rows={4} placeholder="Fixed at 4 rows…" class="focus-visible:ring-0" />
</div>`),
};
