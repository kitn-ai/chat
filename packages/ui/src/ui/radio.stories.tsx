import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { fn } from 'storybook/test';
import { createSignal } from 'solid-js';
import { Radio, RadioGroup, type RadioGroupProps } from './radio';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/Radio',
  component: RadioGroup,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        '`RadioGroup` is the kit\'s "pick exactly one" control: a bordered, divided list of rows over real `<input type="radio">`s that share a `name`. `Radio` is the single control, for when you are laying the group out yourself.',
        'The shared `name` is what makes the set ONE control to the browser: one tab stop, arrow keys to move between members, mutual exclusion, form participation, and "2 of 3" from a screen reader. None of that is code in this kit, which is the point — a hand-rolled `<div role="radio">` has to reimplement all of it and usually loses some.',
        'Each row is a `<label>`, so the whole row is a click target. Rows can carry a second line via `description`, or you can replace the label column entirely with the presentation slot and keep the control and the group semantics.',
        'No validation is applied: `required` reaches the native attribute and stops there.',
      ]),
    },
  },
  argTypes: {
    options: { control: 'object', description: 'The choices, in order. Each is `{ value, label, description?, disabled? }`.' },
    value: { control: 'text', description: 'The selected value, matched against each option by identity.' },
    name: { control: 'text', description: 'Shared form-control name. Defaults to a generated id so the group is exclusive even when nothing is submitted.' },
    label: { control: 'text', description: 'Accessible name for the group (`aria-label` on the `radiogroup`).' },
    disabled: { control: 'boolean', description: 'Disable every row. Individual rows can be disabled on the option.' },
    itemClass: { control: 'text', description: 'Extra classes for each row.' },
    onChange: { action: 'change', description: 'Fires with the selected value and the option that carried it.', table: { category: 'Events' } },
    onOptionBlur: { action: 'blur', description: 'Fires when a radio loses focus — the commit point for a form field.', table: { category: 'Events' } },
  },
  args: {
    label: 'Severity',
    value: 'degraded',
    options: [
      { value: 'blocking', label: 'Blocking' },
      { value: 'degraded', label: 'Degraded' },
      { value: 'cosmetic', label: 'Cosmetic' },
    ],
    disabled: false,
    onChange: fn(),
    onOptionBlur: fn(),
  },
  render: (args: RadioGroupProps<string>) => <RadioGroup {...args} />,
} satisfies Meta<typeof RadioGroup<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

const IMPORT = `import { Radio, RadioGroup } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Every prop on a control panel. Edit `options` to see the group rebuild. */
export const Playground: Story = {};

/** Controlled: hold the value yourself and set it from `onChange`. */
export const Controlled: Story = {
  render: () => {
    const [model, setModel] = createSignal('balanced');
    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.75rem', 'max-width': '26rem' }}>
        <RadioGroup
          label="Response style"
          value={model()}
          onChange={setModel}
          options={[
            { value: 'fast', label: 'Fast' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'thorough', label: 'Thorough' },
          ]}
        />
        <code style={{ 'font-size': '12px' }}>value = "{model()}"</code>
      </div>
    );
  },
  ...src(`const [model, setModel] = createSignal('balanced');

<RadioGroup
  label="Response style"
  value={model()}
  onChange={setModel}
  options={[
    { value: 'fast', label: 'Fast' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'thorough', label: 'Thorough' },
  ]}
/>`),
};

/** A second line per row, for choices that need a sentence of explanation. */
export const WithDescriptions: Story = {
  name: 'Rows with descriptions',
  render: () => (
    <div style={{ 'max-width': '30rem' }}>
      <RadioGroup
        label="Where transcripts are kept"
        value="workspace"
        options={[
          { value: 'device', label: 'This device only', description: 'Nothing leaves the browser. Clearing site data clears the history.' },
          { value: 'workspace', label: 'Workspace', description: 'Everyone on the workspace can open the thread.' },
          { value: 'none', label: 'Do not keep transcripts', description: 'Messages are dropped when the tab closes.' },
        ]}
      />
    </div>
  ),
  ...src(`<RadioGroup
  label="Where transcripts are kept"
  value="workspace"
  options={[
    { value: 'device', label: 'This device only', description: 'Nothing leaves the browser.' },
    { value: 'workspace', label: 'Workspace', description: 'Everyone on the workspace can open the thread.' },
    { value: 'none', label: 'Do not keep transcripts', description: 'Messages are dropped when the tab closes.' },
  ]}
/>`),
};

/** One unavailable row, and the whole group locked. Both come from the native attribute. */
export const DisabledStates: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '1.5rem', 'flex-wrap': 'wrap' }}>
      <div style={{ 'min-width': '15rem' }}>
        <RadioGroup
          label="Plan"
          value="team"
          options={[
            { value: 'free', label: 'Free' },
            { value: 'team', label: 'Team' },
            { value: 'enterprise', label: 'Enterprise', disabled: true },
          ]}
        />
      </div>
      <div style={{ 'min-width': '15rem' }}>
        <RadioGroup
          label="Plan, locked"
          value="team"
          disabled
          options={[
            { value: 'free', label: 'Free' },
            { value: 'team', label: 'Team' },
          ]}
        />
      </div>
    </div>
  ),
  ...src(`<RadioGroup label="Plan" value="team" options={[
  { value: 'free', label: 'Free' },
  { value: 'team', label: 'Team' },
  { value: 'enterprise', label: 'Enterprise', disabled: true },
]} />

<RadioGroup label="Plan, locked" value="team" disabled options={[…]} />`),
};

/**
 * The presentation slot. Return whatever the row should show and the control, the row
 * chrome and the group semantics stay ours — this is how a pricing row, a model card or
 * a row with media gets built without a second radio component existing.
 */
export const PresentationSlot: Story = {
  name: 'Custom row content',
  render: () => {
    const [plan, setPlan] = createSignal('team');
    return (
      <div style={{ 'max-width': '30rem' }}>
        <RadioGroup
          label="Plan"
          value={plan()}
          onChange={setPlan}
          options={[
            { value: 'free', label: 'Free' },
            { value: 'team', label: 'Team' },
            { value: 'enterprise', label: 'Enterprise' },
          ]}
        >
          {(opt, state) => (
            <span style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', width: '100%', gap: '1rem' }}>
              <span>{opt.label}</span>
              <span style={{ 'font-size': '12px', opacity: state.checked ? 1 : 0.6, 'font-variant-numeric': 'tabular-nums' }}>
                {opt.value === 'free' ? '$0' : opt.value === 'team' ? '$25 / seat' : "Let's talk"}
              </span>
            </span>
          )}
        </RadioGroup>
      </div>
    );
  },
  ...src(`<RadioGroup label="Plan" value={plan()} onChange={setPlan} options={PLANS}>
  {(opt, state) => (
    <span class="flex w-full items-center justify-between gap-4">
      <span>{opt.label}</span>
      <span class="text-xs tabular-nums" classList={{ 'opacity-60': !state.checked }}>{PRICE[opt.value]}</span>
    </span>
  )}
</RadioGroup>`),
};

/**
 * The bare control, for a layout the group does not cover. Give every member the same
 * `name` — that is the whole contract, and forgetting it is what turns one control into
 * three independent ones that all look right.
 */
export const BareRadio: Story = {
  name: 'Radio on its own',
  render: () => (
    <div style={{ display: 'flex', gap: '1.5rem', 'align-items': 'center' }}>
      <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center', cursor: 'pointer' }}>
        <Radio name="voice" value="alloy" checked /> <span>Alloy</span>
      </label>
      <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center', cursor: 'pointer' }}>
        <Radio name="voice" value="echo" /> <span>Echo</span>
      </label>
      <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center', cursor: 'pointer' }}>
        <Radio name="voice" value="fable" disabled /> <span>Fable</span>
      </label>
    </div>
  ),
  ...src(`<label class="inline-flex cursor-pointer items-center gap-2.5">
  <Radio name="voice" value="alloy" checked />
  <span>Alloy</span>
</label>
<label class="inline-flex cursor-pointer items-center gap-2.5">
  <Radio name="voice" value="echo" />
  <span>Echo</span>
</label>`),
};
