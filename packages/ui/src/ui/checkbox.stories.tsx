import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { fn } from 'storybook/test';
import { createSignal, For } from 'solid-js';
import { Checkbox, type CheckboxProps } from './checkbox';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'A checkbox. A real `<input type="checkbox">` behind `appearance: none` — never a `<div>` wearing `role="checkbox"` — so keyboard operation (Space), the focus ring, form participation and screen-reader announcement come from the browser and are correct by construction.',
        'Everything the component does not own is forwarded to the input: `id`, `name`, `value`, `required`, `checked`, `disabled`, `aria-*`, any `data-*` hook, and the DOM events. The one thing it adds is `indeterminate`, which has no HTML attribute and otherwise needs a `ref`.',
        'No validation is applied. `required` reaches the native attribute and stops there — whether an unticked box is an error is your application\'s rule, not the kit\'s.',
      ]),
    },
  },
  argTypes: {
    checked: { control: 'boolean', description: 'Checked state. Controlled — drive it from `onChange`.' },
    indeterminate: {
      control: 'boolean',
      description: 'The mixed state, for a parent box whose children are partly ticked. A DOM property with no attribute, so it can only be set from JS.',
    },
    disabled: { control: 'boolean', description: 'Disable interaction. Dims the box and blocks the pointer.' },
    required: { control: 'boolean', description: 'Sets the native `required` attribute. Adds no validation of its own.' },
    name: { control: 'text', description: 'Form-control name. With `value`, this is what a native form submits.' },
    value: { control: 'text', description: 'Submitted value when checked. Defaults to `on`.' },
    class: { control: 'text', description: 'Extra classes, merged with the kit rule rather than replacing it.' },
    onChange: { action: 'change', description: 'Native change event. Read `e.currentTarget.checked`.', table: { category: 'Events' } },
  },
  args: {
    checked: false,
    indeterminate: false,
    disabled: false,
    required: false,
    name: 'notify',
    value: 'on',
    onChange: fn(),
  },
  render: (args: CheckboxProps) => <Checkbox {...args} />,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * SolidJS stories can't auto-serialize a render function, so notable variations carry
 * a real, paste-ready snippet with its import line.
 */
const IMPORT = `import { Checkbox } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

/** Every prop on a control panel. Toggle `checked`, `indeterminate` and `disabled` here. */
export const Playground: Story = {};

/**
 * The three states side by side. Mixed fills the box like checked does and draws a bar
 * instead of a tick, so "some" is never mistaken for "none".
 */
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '2rem', 'align-items': 'center' }}>
      <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center' }}>
        <Checkbox /> <span>Unchecked</span>
      </label>
      <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center' }}>
        <Checkbox checked /> <span>Checked</span>
      </label>
      <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center' }}>
        <Checkbox indeterminate /> <span>Mixed</span>
      </label>
    </div>
  ),
  ...src(`<Checkbox />
<Checkbox checked />
<Checkbox indeterminate />`),
};

/** Disabled in both states. The native attribute does the work — no pointer, no tab stop. */
export const Disabled: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '2rem', 'align-items': 'center' }}>
      <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center' }}>
        <Checkbox disabled /> <span>Off, locked</span>
      </label>
      <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center' }}>
        <Checkbox disabled checked /> <span>On, locked</span>
      </label>
    </div>
  ),
  ...src(`<Checkbox disabled />
<Checkbox disabled checked />`),
};

/**
 * Wrap the control in a `<label>` and the whole row becomes the click target — the
 * cheapest accessible name you can give a checkbox, and it costs no ARIA.
 */
export const WithLabel: Story = {
  name: 'In a label row',
  render: () => {
    const [on, setOn] = createSignal(true);
    return (
      <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center', cursor: 'pointer' }}>
        <Checkbox checked={on()} onChange={(e) => setOn(e.currentTarget.checked)} />
        <span>Stream responses as they generate</span>
      </label>
    );
  },
  ...src(`const [on, setOn] = createSignal(true);

<label class="inline-flex cursor-pointer items-center gap-2.5">
  <Checkbox checked={on()} onChange={(e) => setOn(e.currentTarget.checked)} />
  <span>Stream responses as they generate</span>
</label>`),
};

/**
 * What `indeterminate` is FOR: a parent that is neither all-on nor all-off. The mixed
 * state is visual plus an accessibility hint — the input still reports `checked: false`
 * and submits accordingly, so drive the children from your own state, not from the box.
 */
export const ParentAndChildren: Story = {
  name: 'Parent with mixed state',
  render: () => {
    const TOOLS = ['Web search', 'Code interpreter', 'File retrieval'];
    const [on, setOn] = createSignal<string[]>(['Code interpreter']);
    const all = () => on().length === TOOLS.length;
    const some = () => on().length > 0 && !all();
    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.5rem' }}>
        <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center', cursor: 'pointer', 'font-weight': 500 }}>
          <Checkbox
            checked={all()}
            indeterminate={some()}
            aria-checked={some() ? 'mixed' : all()}
            onChange={(e) => setOn(e.currentTarget.checked ? [...TOOLS] : [])}
          />
          <span>Enable all tools</span>
        </label>
        <For each={TOOLS}>
          {(tool) => (
            <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center', cursor: 'pointer', 'padding-left': '1.75rem' }}>
              <Checkbox
                checked={on().includes(tool)}
                onChange={(e) => setOn(e.currentTarget.checked ? [...on(), tool] : on().filter((t) => t !== tool))}
              />
              <span>{tool}</span>
            </label>
          )}
        </For>
      </div>
    );
  },
  ...src(`const all = () => on().length === TOOLS.length;
const some = () => on().length > 0 && !all();

<Checkbox
  checked={all()}
  indeterminate={some()}
  aria-checked={some() ? 'mixed' : all()}
  onChange={(e) => setOn(e.currentTarget.checked ? [...TOOLS] : [])}
/>`),
};

/**
 * Give the boxes a `name` and a `value` and a native `<form>` submits them with no
 * JavaScript at all — the part a hand-rolled control silently loses.
 */
export const InAForm: Story = {
  name: 'Native form participation',
  render: () => {
    const [submitted, setSubmitted] = createSignal<string[]>([]);
    return (
      <form
        style={{ display: 'flex', 'flex-direction': 'column', gap: '0.5rem', 'align-items': 'flex-start' }}
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(new FormData(e.currentTarget).getAll('env') as string[]);
        }}
      >
        <For each={['Production', 'Staging', 'Local']}>
          {(env) => (
            <label style={{ display: 'inline-flex', gap: '0.625rem', 'align-items': 'center', cursor: 'pointer' }}>
              <Checkbox name="env" value={env.toLowerCase()} /> <span>{env}</span>
            </label>
          )}
        </For>
        <button type="submit" style={{ 'margin-top': '0.5rem' }}>Submit</button>
        <code style={{ 'font-size': '12px' }}>env = [{submitted().map((v) => `"${v}"`).join(', ')}]</code>
      </form>
    );
  },
  ...src(`<form onSubmit={(e) => { e.preventDefault(); console.log(new FormData(e.currentTarget).getAll('env')); }}>
  <Checkbox name="env" value="production" />
  <Checkbox name="env" value="staging" />
  <Checkbox name="env" value="local" />
  <button type="submit">Submit</button>
</form>`),
};
