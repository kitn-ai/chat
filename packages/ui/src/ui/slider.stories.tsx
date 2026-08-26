import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { fn } from 'storybook/test';
import { createSignal, createEffect } from 'solid-js';
import { Slider, type SliderProps } from './slider';
import { componentDescription } from '../stories/docs/element-controls';

const meta = {
  title: 'Components/Primitives/Slider',
  component: Slider,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: componentDescription([
        'A slider. A real `<input type="range">` behind `appearance: none` — never a `<div>` with a drag handler — so arrows, Home, End, PageUp/PageDown, touch dragging, form participation and the `slider` role all come from the browser and are correct by construction.',
        'What the component adds is the **filled track**. The kit paints the portion left of the thumb from a `--kai-range-fill` custom property, and the percentage is arithmetic over `min`, `max` and the current value — three things the component already has, so no caller ever computes it.',
        '`min` and `max` are required and have no defaults. A range with no bounds is a slider-shaped guess, and the guess belongs to whoever knows what the number means. Everything else the component does not own is forwarded to the input: `id`, `name`, `disabled`, `required`, `aria-*`, any `data-*` hook and the DOM events.',
      ]),
    },
  },
  argTypes: {
    min: { control: 'number', description: 'Lowest selectable value. Required.' },
    max: { control: 'number', description: 'Highest selectable value. Required.' },
    step: { control: 'number', description: 'Granularity. Omit for the native default of 1. The string `any` is also accepted and means continuous (see "Any range, any step").' },
    value: { control: 'number', description: 'Current value. Controlled — drive it from `onInput`.' },
    defaultValue: { control: 'number', description: 'Initial value when uncontrolled. Ignored once `value` is set.' },
    disabled: { control: 'boolean', description: 'Disable interaction. Dims the track and blocks the pointer.' },
    valueLabel: {
      control: 'boolean',
      description: 'Show the current value beside the track. `true` renders the raw number; pass a FUNCTION instead to render `60%`, `3 of 5`, a duration. Off by default. The readout is `aria-hidden`, so the value is announced once, by the input.',
    },
    name: { control: 'text', description: 'Form-control name. This is what a native form submits.' },
    class: { control: 'text', description: 'Extra classes, merged with the kit rule rather than replacing it.' },
    'aria-label': { control: 'text', description: 'Accessible name. A slider with no visible label needs one, or it announces as an unnamed control.' },
    onInput: { action: 'input', description: 'Fires per step while dragging. Read `e.currentTarget.valueAsNumber`.', table: { category: 'Events' } },
    onChange: { action: 'change', description: 'Fires on commit (pointer release). Read `e.currentTarget.valueAsNumber`.', table: { category: 'Events' } },
  },
  args: {
    min: 0,
    max: 100,
    step: 1,
    value: 40,
    defaultValue: undefined,
    disabled: false,
    valueLabel: true,
    name: 'temperature',
    class: '',
    // Every prop not owned by the component is forwarded, and `aria-label` is the one
    // a bare slider genuinely needs: the axe check flags an unnamed form control, and a
    // demo that ships the violation teaches the violation.
    'aria-label': 'Temperature',
    onInput: fn(),
    onChange: fn(),
  },
  // WHY THIS IS NOT `<Slider {...args} />`.
  //
  // `args` carries a `value`, which makes the component CONTROLLED — and a spread
  // alone gives it no writer, so dragging can never move the controlled value. The
  // native input's thumb still slides (the browser moves it), while everything derived
  // from `value` stays put. That is a story bug, not a component one, and it was
  // reported as "the track does not move with the circle".
  //
  // It is NOT an args-reactivity problem: `storybook-solidjs-vite` makes `context.args`
  // a Solid store, and an arg change from the Controls panel re-renders this in place.
  // Verified live. So the fix is to give the controlled value a writer, and to keep the
  // Controls panel wired to it in both directions.
  render: (args: SliderProps) => {
    const [v, setV] = createSignal(args.value ?? args.min);
    // Controls panel -> slider. Tracks `args.value` only, so a drag does not re-trigger it.
    createEffect(() => setV(args.value ?? args.min));
    return (
      <div style={{ 'max-width': '22rem' }}>
        <Slider
          {...args}
          value={v()}
          onInput={(e) => {
            setV(e.currentTarget.valueAsNumber);
            // Forward to the arg handler so the Actions panel still logs every step.
            (args.onInput as ((e: Event) => void) | undefined)?.(e);
          }}
        />
      </div>
    );
  },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * SolidJS stories can't auto-serialize a render function, so notable variations carry
 * a real, paste-ready snippet with its import line.
 */
const IMPORT = `import { Slider } from '@kitn.ai/ui/solid';`;
const src = (code: string) => ({
  parameters: { docs: { source: { code: `${IMPORT}\n\n${code}`, language: 'tsx' } } },
});

const row = { display: 'flex', 'align-items': 'center', gap: '0.75rem', 'max-width': '22rem' } as const;
const bubble = {
  'min-width': '2.25rem',
  'border-radius': '0.375rem',
  padding: '0.25rem 0.5rem',
  'text-align': 'center',
  'font-variant-numeric': 'tabular-nums',
  'font-size': '0.875rem',
} as const;

/** Every prop on a control panel. Drag the thumb and watch the fill follow it. */
export const Playground: Story = {};

/**
 * The fill is the component's job, not yours. Drive the value from a signal and the
 * track's filled portion follows without a line of arithmetic at the call site.
 */
export const Controlled: Story = {
  name: 'Controlled, with a readout',
  render: () => {
    const [v, setV] = createSignal(35);
    return (
      <div style={row}>
        <Slider min={0} max={100} step={1} value={v()} onInput={(e) => setV(e.currentTarget.valueAsNumber)} />
        <output style={bubble}>{v()}</output>
      </div>
    );
  },
  ...src(`const [v, setV] = createSignal(35);

<Slider min={0} max={100} step={1} value={v()} onInput={(e) => setV(e.currentTarget.valueAsNumber)} />
<output>{v()}</output>`),
};

/**
 * `min` and `max` are the units, not decoration. The same component covers a 0..1
 * temperature at `step={0.05}`, a 1..8 count, and a continuous range at `step="any"`.
 */
export const Ranges: Story = {
  name: 'Any range, any step',
  render: () => {
    const [temp, setTemp] = createSignal(0.7);
    const [n, setN] = createSignal(4);
    const [free, setFree] = createSignal(50);
    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1rem' }}>
        <div style={row}>
          <Slider min={0} max={1} step={0.05} value={temp()} onInput={(e) => setTemp(e.currentTarget.valueAsNumber)} />
          <output style={bubble}>{temp().toFixed(2)}</output>
        </div>
        <div style={row}>
          <Slider min={1} max={8} step={1} value={n()} onInput={(e) => setN(e.currentTarget.valueAsNumber)} />
          <output style={bubble}>{n()}</output>
        </div>
        <div style={row}>
          <Slider min={0} max={100} step="any" value={free()} onInput={(e) => setFree(e.currentTarget.valueAsNumber)} />
          <output style={bubble}>{free().toFixed(1)}</output>
        </div>
      </div>
    );
  },
  ...src(`<Slider min={0} max={1} step={0.05} value={temp()} onInput={…} />
<Slider min={1} max={8} step={1} value={n()} onInput={…} />
<Slider min={0} max={100} step="any" value={free()} onInput={…} />`),
};

/**
 * Uncontrolled: seed with `defaultValue` and let the input hold its own state. The fill
 * still tracks the thumb, because the component listens to the native input event
 * rather than requiring you to hand the value back.
 */
export const Uncontrolled: Story = {
  render: () => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1rem', 'max-width': '22rem' }}>
      <Slider min={0} max={100} defaultValue={20} />
      <Slider min={0} max={100} defaultValue={80} />
      {/* No value at all: HTML's own rule puts the thumb at the midpoint. */}
      <Slider min={0} max={100} />
    </div>
  ),
  ...src(`<Slider min={0} max={100} defaultValue={20} />
<Slider min={0} max={100} />   {/* no value: the thumb sits at the midpoint */}`),
};

/**
 * The readout. `valueLabel` is off by default, so a bare `Slider` is still a bare
 * `<input>`; turn it on for the number, or hand it a function when the number is not
 * the thing to show. A percentage, a count and a duration are all the same slider.
 */
export const ValueLabel: Story = {
  name: 'With a value readout',
  render: () => {
    const [pct, setPct] = createSignal(60);
    const [n, setN] = createSignal(3);
    const [secs, setSecs] = createSignal(90);
    return (
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1rem', 'max-width': '22rem' }}>
        <Slider min={0} max={100} value={pct()} valueLabel onInput={(e) => setPct(e.currentTarget.valueAsNumber)} aria-label="Plain number" />
        <Slider min={0} max={100} value={pct()} valueLabel={(v) => `${v}%`} onInput={(e) => setPct(e.currentTarget.valueAsNumber)} aria-label="Percentage" />
        <Slider min={1} max={5} value={n()} valueLabel={(v) => `${v} of 5`} onInput={(e) => setN(e.currentTarget.valueAsNumber)} aria-label="Count" />
        <Slider
          min={0}
          max={600}
          step={15}
          value={secs()}
          valueLabel={(v) => `${Math.floor(v / 60)}m ${String(v % 60).padStart(2, '0')}s`}
          onInput={(e) => setSecs(e.currentTarget.valueAsNumber)}
          aria-label="Duration"
        />
      </div>
    );
  },
  ...src(`<Slider min={0} max={100} value={pct()} valueLabel onInput={…} />
<Slider min={0} max={100} value={pct()} valueLabel={(v) => \`\${v}%\`} onInput={…} />
<Slider min={1} max={5} value={n()} valueLabel={(v) => \`\${v} of 5\`} onInput={…} />`),
};

/** Disabled. The native attribute does the work: no pointer, no tab stop, no keyboard. */
export const Disabled: Story = {
  render: () => (
    <div style={{ 'max-width': '22rem' }}>
      <Slider min={0} max={100} value={60} disabled />
    </div>
  ),
  ...src(`<Slider min={0} max={100} value={60} disabled />`),
};

/**
 * Give it a `name` and a native `<form>` submits it with no JavaScript at all — the
 * part a hand-rolled slider silently loses.
 */
export const InAForm: Story = {
  name: 'Native form participation',
  render: () => {
    const [submitted, setSubmitted] = createSignal('—');
    return (
      <form
        style={{ display: 'flex', 'flex-direction': 'column', gap: '0.75rem', 'align-items': 'flex-start', 'max-width': '22rem' }}
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(String(new FormData(e.currentTarget).get('temperature')));
        }}
      >
        <Slider name="temperature" min={0} max={100} defaultValue={30} aria-label="Temperature" />
        <button type="submit">Submit</button>
        <code style={{ 'font-size': '12px' }}>temperature = {submitted()}</code>
      </form>
    );
  },
  ...src(`<form onSubmit={(e) => { e.preventDefault(); console.log(new FormData(e.currentTarget).get('temperature')); }}>
  <Slider name="temperature" min={0} max={100} defaultValue={30} aria-label="Temperature" />
  <button type="submit">Submit</button>
</form>`),
};
