import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { fn } from 'storybook/test';
import { createSignal } from 'solid-js';
import { CheckboxGroup, type CheckboxGroupProps } from './checkbox-group';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/CheckboxGroup',
  component: CheckboxGroup,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        '`CheckboxGroup` is the kit\'s "pick any number" control: a bordered, divided list of rows over real `<input type="checkbox">`s. It is `RadioGroup`\'s sibling and takes the same shapes, so switching a field between "one of" and "any of" is a one word change.',
        'Every row is a `<label>` wrapping its box, so the whole row is a click target and the row text IS the accessible name, with no ARIA involved. Give the group a `name` and a native `<form>` submits the selection under one key: `new FormData(form).getAll(name)` reads it back with no JavaScript of yours in the path.',
        'Unlike `RadioGroup`, `name` has no default. A radio set needs a shared name for the browser to make it exclusive; checkboxes are independent controls and need nothing. Generating one here would submit the selection under a random key, which is worse than submitting nothing.',
        'Rows can carry a second line via `description`, or you can replace the label column entirely with the presentation slot and keep the control, the row chrome and the group semantics.',
        'No validation is applied. "At least one" is your application\'s rule, and so is a cap on how many may be picked.',
      ]),
    },
  },
  argTypes: {
    options: { control: 'object', description: 'The choices, in order. Each is `{ value, label, description?, disabled? }`. Rendered in full, never truncated or de-duplicated.' },
    value: { control: 'object', description: 'The selected values, as an array. Each option is checked when its `value` is in here, matched by identity.' },
    name: { control: 'text', description: 'Shared form-control name. No default: without one the group renders and behaves correctly but submits nothing.' },
    label: { control: 'text', description: 'Accessible name for the group (`aria-label` on the `group`). Prefer `aria-labelledby` pointing at visible text when you have some.' },
    disabled: { control: 'boolean', description: 'Disable every row. Individual rows can be disabled on the option.' },
    itemClass: { control: 'text', description: 'Extra classes for each row.' },
    onChange: { action: 'change', description: 'Fires with the next selection, the option that moved, and whether it went on or off.', table: { category: 'Events' } },
    onOptionBlur: { action: 'blur', description: 'Fires when a box loses focus. The commit point for a form field.', table: { category: 'Events' } },
  },
  args: {
    label: 'Environments',
    value: ['prod'],
    options: [
      { value: 'prod', label: 'Production' },
      { value: 'staging', label: 'Staging' },
      { value: 'local', label: 'Local' },
    ],
    disabled: false,
    onChange: fn(),
    onOptionBlur: fn(),
  },
  render: (args: CheckboxGroupProps<string>) => <CheckboxGroup {...args} />,
} satisfies Meta<typeof CheckboxGroup<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * SolidJS stories can't auto-serialize a render function, so notable variations carry
 * a real, paste-ready snippet with its import line.
 */
const IMPORT = `import { CheckboxGroup } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Every prop on a control panel. Edit `options` and `value` to see the group rebuild. */
export const Playground: Story = {};

/**
 * The normal way to use it: hold the array yourself and replace it from `onChange`.
 * The group keeps no state, so what you see is always what your state says.
 */
export const Controlled: Story = {
  render: () => {
    const [envs, setEnvs] = createSignal<string[]>(['prod']);
    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.75rem' }}>
        <CheckboxGroup
          label="Environments"
          options={[
            { value: 'prod', label: 'Production' },
            { value: 'staging', label: 'Staging' },
            { value: 'local', label: 'Local' },
          ]}
          value={envs()}
          onChange={setEnvs}
        />
        <code style={{ 'font-size': '12px' }}>value = [{envs().map((v) => `"${v}"`).join(', ')}]</code>
      </div>
    );
  },
  ...src(`const [envs, setEnvs] = createSignal<string[]>(['prod']);

<CheckboxGroup
  label="Environments"
  options={[
    { value: 'prod', label: 'Production' },
    { value: 'staging', label: 'Staging' },
    { value: 'local', label: 'Local' },
  ]}
  value={envs()}
  onChange={setEnvs}
/>`),
};

/**
 * A second line per row. The description sits under the label in the same column, and
 * the box moves to the top of the row so it stays beside the first line.
 */
export const WithDescriptions: Story = {
  name: 'Rows with descriptions',
  render: () => {
    const [on, setOn] = createSignal<string[]>(['search']);
    return (
      <CheckboxGroup
        label="Tools"
        options={[
          { value: 'search', label: 'Web search', description: 'Look things up before answering.' },
          { value: 'code', label: 'Code interpreter', description: 'Run Python in a sandbox.' },
          { value: 'files', label: 'File retrieval', description: 'Read the files attached to this thread.' },
        ]}
        value={on()}
        onChange={setOn}
      />
    );
  },
  ...src(`<CheckboxGroup
  label="Tools"
  options={[
    { value: 'search', label: 'Web search', description: 'Look things up before answering.' },
    { value: 'code', label: 'Code interpreter', description: 'Run Python in a sandbox.' },
  ]}
  value={on()}
  onChange={setOn}
/>`),
};

/**
 * Give the group a `name` and it is a real form control. No `onChange`, no state, no
 * JavaScript of yours in the path: the browser collects the selection and `FormData`
 * hands it back. This is the part a hand-built control silently loses.
 */
export const InAForm: Story = {
  name: 'Native form participation',
  render: () => {
    const [submitted, setSubmitted] = createSignal<string[]>([]);
    return (
      <form
        style={{ display: 'flex', 'flex-direction': 'column', gap: '0.75rem', 'align-items': 'flex-start' }}
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(new FormData(e.currentTarget).getAll('env') as string[]);
        }}
      >
        <CheckboxGroup
          label="Environments"
          name="env"
          options={[
            { value: 'prod', label: 'Production' },
            { value: 'staging', label: 'Staging' },
            { value: 'local', label: 'Local' },
          ]}
        />
        <button type="submit">Submit</button>
        <code style={{ 'font-size': '12px' }}>env = [{submitted().map((v) => `"${v}"`).join(', ')}]</code>
      </form>
    );
  },
  ...src(`<form onSubmit={(e) => { e.preventDefault(); console.log(new FormData(e.currentTarget).getAll('env')); }}>
  <CheckboxGroup name="env" label="Environments" options={ENVS} />
  <button type="submit">Submit</button>
</form>`),
};

/**
 * Point the group at text already on the page instead of naming it twice. `aria-labelledby`
 * is forwarded like any other attribute, and it beats `label` because a sighted user can
 * read a heading and cannot read an `aria-label`.
 */
export const WithVisibleLabel: Story = {
  name: 'Named by visible text',
  render: () => {
    const [on, setOn] = createSignal<string[]>([]);
    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.5rem' }}>
        <span id="notify-heading" style={{ 'font-size': '14px', 'font-weight': 500 }}>Notify me about</span>
        <CheckboxGroup
          aria-labelledby="notify-heading"
          options={[
            { value: 'replies', label: 'Replies' },
            { value: 'mentions', label: 'Mentions' },
            { value: 'digest', label: 'Weekly digest' },
          ]}
          value={on()}
          onChange={setOn}
        />
      </div>
    );
  },
  ...src(`<span id="notify-heading" class="text-sm font-medium">Notify me about</span>
<CheckboxGroup aria-labelledby="notify-heading" options={OPTIONS} value={on()} onChange={setOn} />`),
};

/**
 * Disabled both ways: the whole group, or one row on its own option. Either way it is
 * the native attribute doing the work, so there is no pointer and no tab stop.
 */
export const Disabled: Story = {
  render: () => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1rem' }}>
      <CheckboxGroup
        label="Everything off"
        disabled
        value={['prod']}
        options={[{ value: 'prod', label: 'Production' }, { value: 'staging', label: 'Staging' }]}
      />
      <CheckboxGroup
        label="One row off"
        value={['prod']}
        options={[
          { value: 'prod', label: 'Production' },
          { value: 'staging', label: 'Staging', disabled: true, description: 'Not provisioned for this project.' },
        ]}
      />
    </div>
  ),
  ...src(`<CheckboxGroup disabled options={OPTIONS} />

<CheckboxGroup options={[
  { value: 'prod', label: 'Production' },
  { value: 'staging', label: 'Staging', disabled: true },
]} />`),
};

/**
 * The presentation slot replaces the label column with whatever you return, so a row can
 * carry media, a badge or a price. The control, the row chrome and the group semantics
 * stay ours, which is what keeps this from becoming a second checkbox component.
 */
export const PresentationSlot: Story = {
  name: 'Custom row content',
  render: () => {
    const [on, setOn] = createSignal<string[]>(['sonnet']);
    const PRICE: Record<string, string> = { opus: '$15/M', sonnet: '$3/M', haiku: '$0.80/M' };
    return (
      <CheckboxGroup
        label="Models to compare"
        value={on()}
        onChange={setOn}
        options={[
          { value: 'opus', label: 'Claude Opus' },
          { value: 'sonnet', label: 'Claude Sonnet' },
          { value: 'haiku', label: 'Claude Haiku' },
        ]}
      >
        {(opt, state) => (
          <span style={{ display: 'flex', flex: '1', 'align-items': 'center', 'justify-content': 'space-between', gap: '1rem' }}>
            <span>{opt.label}</span>
            <span style={{ 'font-size': '12px', opacity: state.checked ? 1 : 0.6 }}>{PRICE[opt.value]}</span>
          </span>
        )}
      </CheckboxGroup>
    );
  },
  ...src(`<CheckboxGroup label="Models to compare" options={MODELS} value={on()} onChange={setOn}>
  {(opt, state) => (
    <span class="flex flex-1 items-center justify-between gap-4">
      <span>{opt.label}</span>
      <span class="text-xs">{PRICE[opt.value]}</span>
    </span>
  )}
</CheckboxGroup>`),
};
