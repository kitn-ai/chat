import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal, For } from 'solid-js';
import { fn } from 'storybook/test';
import { ToggleChip } from './toggle-chip';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/ToggleChip',
  component: ToggleChip,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'A small pill button for a two-state, chip-shaped toggle (`aria-pressed`). Controlled via `pressed`, or uncontrolled from `defaultPressed` — the same shape as `Switch`\'s `checked`/`defaultChecked`, renamed because a chip is a BUTTON (`aria-pressed`), not a switch/checkbox/radio.',
        'No `ChipGroup` wrapper exists: a row of chips is a plain `flex flex-wrap gap-1.5` div — there is no shared selection state or roving tabindex to own (unlike `RadioGroup`/`Segmented`, which genuinely have grouping logic). See "Row" below for that idiom.',
      ]),
    },
  },
  argTypes: {
    pressed: { control: 'boolean', description: 'Controlled pressed state. Drive it from `onChange`.' },
    defaultPressed: { control: 'boolean', description: 'Initial state when uncontrolled.' },
    disabled: { control: 'boolean', description: 'Disable interaction.' },
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'Pill size. `sm` (h-7, the default) is the common case; `md` (h-8) is for a row that wants more presence.',
      table: { defaultValue: { summary: 'sm' } },
    },
    children: { control: 'text', description: 'Chip label.' },
    onChange: {
      action: 'change',
      description: 'Fires with the next pressed state on toggle.',
      table: { category: 'Events' },
    },
  },
  args: { children: 'Images', onChange: fn() },
} satisfies Meta<typeof ToggleChip>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { ToggleChip } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Unpressed by default; click or press Space/Enter to toggle. */
export const Playground: Story = {};

/** Starts pressed via `defaultPressed`. */
export const Pressed: Story = { args: { defaultPressed: true } };

/** Non-interactive. */
export const Disabled: Story = { args: { disabled: true } };

/**
 * The common shape (`builder-panel.tsx`'s attachments accept editor): a row
 * of chips, each independently toggled — plain flex-wrap, no `ChipGroup`.
 * Also doubles as the size comparison the owner asked for: `sm` (the
 * default pill, h-7) is what a real chip row uses; `md` is shown once below
 * it at the same content so the proportions are easy to judge side by side.
 */
export const Row: Story = {
  name: 'In a chip row (+ size comparison)',
  render: () => {
    const labels = ['Images', 'PDFs', 'Documents', 'Spreadsheets', 'Audio', 'Video'];
    const [pressedSm, setPressedSm] = createSignal(new Set(['Images', 'PDFs']));
    const toggleSm = (label: string): void => {
      const next = new Set(pressedSm());
      if (next.has(label)) next.delete(label);
      else next.add(label);
      setPressedSm(next);
    };
    return (
      <div class="flex flex-col gap-4">
        <div>
          <p class="mb-1.5 text-xs font-medium text-muted-foreground">sm (default pill)</p>
          <div class="flex flex-wrap gap-1.5">
            <For each={labels}>
              {(label) => (
                <ToggleChip pressed={pressedSm().has(label)} onChange={() => toggleSm(label)}>
                  {label}
                </ToggleChip>
              )}
            </For>
          </div>
        </div>
        <div>
          <p class="mb-1.5 text-xs font-medium text-muted-foreground">md (larger)</p>
          <div class="flex flex-wrap gap-1.5">
            <For each={labels}>{(label) => <ToggleChip size="md">{label}</ToggleChip>}</For>
          </div>
        </div>
      </div>
    );
  },
  ...src(`<div class="flex flex-wrap gap-1.5">
  <ToggleChip pressed={imagesOn()} onChange={setImagesOn}>Images</ToggleChip>
  <ToggleChip pressed={pdfsOn()} onChange={setPdfsOn}>PDFs</ToggleChip>
</div>`),
};
