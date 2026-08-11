import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { createSignal } from 'solid-js';
import { Monitor, Sun, Moon } from 'lucide-solid';
import { SettingsGroup, SettingItem } from './settings-group';
import { Segmented } from './segmented';
import { Switch } from './switch';
import { componentDescription } from '../stories/docs/element-controls';

// The building blocks in isolation — no modal/page host. A `SettingsGroup` is a
// titled, bordered card that stacks `SettingItem` rows with hairline dividers;
// each row pairs a label/description with an optional control (`Switch`,
// `Segmented`, a select, or nothing). The composed settings SCREEN that assembles
// these into a two-pane modal/page lives in `Labs/Settings`.

/** A styled native `<select>` — a token-styled control standing in for a future
 *  kai-menu trigger, plenty for the primitive demo. */
function LanguageSelect() {
  return (
    <select aria-label="Language" class="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <option>Auto Detect</option>
      <option>English</option>
      <option>Español</option>
      <option>Deutsch</option>
      <option>日本語</option>
    </select>
  );
}

const meta = {
  title: 'Components/Primitives/Settings Group',
  component: SettingsGroup,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      controls: { exclude: ['use:eventListener'] },
      description: componentDescription([
        'The uniform settings building blocks: `SettingsGroup` (a titled, bordered card) stacks `SettingItem` rows with hairline dividers, and each row pairs a label/description with an optional control (`Switch`, `Segmented`, a select, or none).',
        'These are the primitives. The composed settings SCREEN — the two-pane category rail + groups assembled into a modal or full page — lives in `Labs/Settings`.',
      ]),
    },
  },
} satisfies Meta<typeof SettingsGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

const DEFAULT_SNIPPET = `import { createSignal } from 'solid-js';
import { Monitor, Sun, Moon } from 'lucide-solid';
import { SettingsGroup, SettingItem, Segmented, Switch } from '@kitn.ai/ui/solid';

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
      {/* control: select */}
      <SettingItem
        label="Language"
        description="The interface language."
        control={
          <select aria-label="Language" class="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground">
            <option>Auto Detect</option>
            <option>English</option>
            <option>Español</option>
          </select>
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
 * One `SettingsGroup` (heading + description) stacking `SettingItem` rows, each
 * with a different control so the API is clear: a `Switch`, a `Segmented` (wired
 * to a local signal), a `<select>`, and a plain label/description row (no control).
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
