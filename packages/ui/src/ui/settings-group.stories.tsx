import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { Monitor, Sun, Moon } from 'lucide-solid';
import { SettingsGroup, SettingItem, type SettingsGroupProps } from './settings-group';
import { Segmented } from './segmented';
import { Switch } from './switch';
import { Select } from './select';
import { componentDescription } from '../stories/docs/element-controls';

// The building blocks in isolation — no modal/page host. A `SettingsGroup` is a
// titled, bordered card that stacks `SettingItem` rows with hairline dividers;
// each row pairs a label/description with an optional control (`Switch`,
// `Segmented`, `Select`, or nothing). The composed settings SCREEN that assembles
// these into a two-pane modal/page lives in `Labs/Settings`.

/** The kit's `Select`. This used to be a hand-styled native `<select>` with a note
 *  saying a real build would swap in a menu trigger; the kit owns a select now, so the
 *  row shows the real control instead of a stand-in. `containerClass` narrows it,
 *  because a settings row's control is not full width. */
function LanguageSelect() {
  return (
    <Select
      aria-label="Language"
      value="auto"
      containerClass="w-44"
      options={[
        { value: 'auto', label: 'Auto Detect' },
        { value: 'en', label: 'English' },
        { value: 'es', label: 'Español' },
        { value: 'de', label: 'Deutsch' },
        { value: 'ja', label: '日本語' },
      ]}
    />
  );
}

const meta = {
  title: 'Components/Primitives/Settings Group',
  component: SettingsGroup,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    // Panel scope (`parameters.controls`, not `parameters.docs.controls` — the
    // latter filters only the autodocs table). `children` is the row stack, which
    // the story supplies; a control for it would be inert.
    controls: { include: ['heading', 'description', 'class'] },
    docs: {
      controls: { exclude: ['use:eventListener', 'children'] },
      description: componentDescription([
        'The uniform settings building blocks: `SettingsGroup` (a titled, bordered card) stacks `SettingItem` rows with hairline dividers, and each row pairs a label/description with an optional control (`Switch`, `Segmented`, `Select`, or none).',
        'These are the primitives. The composed settings SCREEN — the two-pane category rail + groups assembled into a modal or full page — lives in `Labs/Settings`.',
        'The controls drive the group chrome (`heading`, `description`, `class`). The rows are `SettingItem`s you compose as children; the Playground fixes one representative set so the chrome is what changes.',
      ]),
    },
  },
  argTypes: {
    heading: { control: 'text', description: 'Small section heading shown above the card.' },
    description: { control: 'text', description: 'Optional muted description under the heading. Clear it to drop the line.' },
    children: { control: false, description: 'The stacked `SettingItem` rows.' },
    class: { control: 'text', description: 'Extra classes for the section wrapper.' },
  },
  args: {
    heading: 'General',
    description: 'How the app looks and behaves for you.',
    class: '',
  },
} satisfies Meta<typeof SettingsGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

const DEFAULT_SNIPPET = `import { createSignal } from 'solid-js';
import { Monitor, Sun, Moon } from 'lucide-solid';
import { SettingsGroup, SettingItem, Segmented, Select, Switch } from '@kitn.ai/ui/solid';

function Example() {
  const [appearance, setAppearance] = createSignal('system');

  return (
    <SettingsGroup heading="General" description="How the app looks and behaves for you.">
      {/* control: Switch */}
      <SettingItem
        label="Reduce motion"
        description="Minimize non-essential animations and transitions."
        control={<Switch defaultChecked={false} label="Reduce motion" />}
      />
      {/* control: Segmented */}
      <SettingItem
        label="Appearance"
        description="Match your system theme or pin a mode."
        control={
          <Segmented
            value={appearance()}
            onChange={setAppearance}
            options={[
              { value: 'system', label: 'System', icon: <Monitor size={14} /> },
              { value: 'light', label: 'Light', icon: <Sun size={14} /> },
              { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
            ]}
          />
        }
      />
      {/* control: Select */}
      <SettingItem
        label="Language"
        description="The interface language."
        control={
          <Select
            aria-label="Language"
            value="auto"
            containerClass="w-44"
            options={[
              { value: 'auto', label: 'Auto Detect' },
              { value: 'en', label: 'English' },
              { value: 'es', label: 'Español' },
            ]}
          />
        }
      />
      {/* no control — a plain label/description row */}
      <SettingItem
        label="Version"
        description="You're on the latest build."
      />
    </SettingsGroup>
  );
}`;

const STACKED_SNIPPET = `import { SettingsGroup, SettingItem, Switch } from '@kitn.ai/ui/solid';

function Example() {
  return (
    <div class="flex flex-col gap-8">
      <SettingsGroup heading="General" description="How the app looks and behaves for you.">
        <SettingItem
          label="Reduce motion"
          description="Minimize non-essential animations and transitions."
          control={<Switch defaultChecked={false} label="Reduce motion" />}
        />
      </SettingsGroup>

      <SettingsGroup heading="Permissions" description="What the agent may do without asking first.">
        <SettingItem
          label="Default permissions"
          description="Ask before running commands or editing files."
          control={<Switch defaultChecked={true} label="Default permissions" />}
        />
        <SettingItem
          label="Full access"
          description="Skip all confirmation prompts. Use with caution."
          control={<Switch defaultChecked={false} label="Full access" />}
        />
      </SettingsGroup>
    </div>
  );
}`;

/**
 * The group chrome on the controls: edit `heading`, `description` or `class` and
 * the card follows. The rows are held constant so the chrome is what you see move.
 */
export const Playground: Story = {
  // Story-level `render` does not infer its parameter here, so name the props type.
  render: (args: Partial<SettingsGroupProps>) => (
    <div class="max-w-2xl p-6">
      <SettingsGroup heading={args.heading ?? 'General'} description={args.description} class={args.class}>
        <SettingItem
          label="Reduce motion"
          description="Minimize non-essential animations and transitions."
          control={<Switch defaultChecked={false} label="Reduce motion" />}
        />
        <SettingItem
          label="Language"
          description="The interface language."
          control={<LanguageSelect />}
        />
        <SettingItem label="Version" description="You're on the latest build." />
      </SettingsGroup>
    </div>
  ),
  parameters: {
    docs: { source: { language: 'tsx', code: DEFAULT_SNIPPET } },
  },
};

/**
 * One `SettingsGroup` (heading + description) stacking `SettingItem` rows, each
 * with a different control so the API is clear: a `Switch`, a `Segmented` (wired
 * to a local signal), a `Select`, and a plain label/description row (no control).
 */
export const Default: Story = {
  render: () => {
    const [appearance, setAppearance] = createSignal('system');
    return (
      <div class="max-w-2xl p-6">
        <SettingsGroup heading="General" description="How the app looks and behaves for you.">
          <SettingItem
            label="Reduce motion"
            description="Minimize non-essential animations and transitions."
            control={<Switch defaultChecked={false} label="Reduce motion" />}
          />
          <SettingItem
            label="Appearance"
            description="Match your system theme or pin a mode."
            control={
              <Segmented
                value={appearance()}
                onChange={setAppearance}
                options={[
                  { value: 'system', label: 'System', icon: <Monitor size={14} /> },
                  { value: 'light', label: 'Light', icon: <Sun size={14} /> },
                  { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
                ]}
              />
            }
          />
          <SettingItem
            label="Language"
            description="The interface language."
            control={<LanguageSelect />}
          />
          <SettingItem
            label="Version"
            description="You're on the latest build."
          />
        </SettingsGroup>
      </div>
    );
  },
  parameters: {
    docs: { source: { language: 'tsx', code: DEFAULT_SNIPPET } },
  },
};

/**
 * Two stacked `SettingsGroup`s, showing how sections are grouped: each card carries
 * its own heading/description and its own rows.
 */
export const Stacked: Story = {
  render: () => (
    <div class="flex max-w-2xl flex-col gap-8 p-6">
      <SettingsGroup heading="General" description="How the app looks and behaves for you.">
        <SettingItem
          label="Reduce motion"
          description="Minimize non-essential animations and transitions."
          control={<Switch defaultChecked={false} label="Reduce motion" />}
        />
      </SettingsGroup>

      <SettingsGroup heading="Permissions" description="What the agent may do without asking first.">
        <SettingItem
          label="Default permissions"
          description="Ask before running commands or editing files."
          control={<Switch defaultChecked={true} label="Default permissions" />}
        />
        <SettingItem
          label="Full access"
          description="Skip all confirmation prompts. Use with caution."
          control={<Switch defaultChecked={false} label="Full access" />}
        />
      </SettingsGroup>
    </div>
  ),
  parameters: {
    docs: { source: { language: 'tsx', code: STACKED_SNIPPET } },
  },
};
