import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { onMount, onCleanup, createSignal } from 'solid-js';
// Import the two facade modules DIRECTLY, the way nav.stories.tsx imports './nav'.
// NOT './register': that entry registers through an SSR-gated DYNAMIC import, so the
// tags are defined a microtask AFTER the module finishes importing — the story then
// renders before the upgrade, an array prop assigned in the meantime is only a plain
// data property, and the upgrade replaces it with the declared default. That is what
// made this story render an empty group.
import './checkbox';
import './checkbox-group';
import './radio-group';
import './slider';
import './select';
import { attachKaiActions } from '../stories/docs/story-actions';

// Wire a kai-* element's declared CustomEvents to the Actions panel from a `ref`.
const withActions = (e: Element) => onMount(() => onCleanup(attachKaiActions(e as HTMLElement)));

declare module 'solid-js' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-checkbox': JSX.HTMLAttributes<HTMLElement> & {
        checked?: boolean; 'default-checked'?: boolean; indeterminate?: boolean;
        disabled?: boolean; required?: boolean; label?: string; name?: string; value?: string;
      };
      'kai-checkbox-group': JSX.HTMLAttributes<HTMLElement> & {
        value?: string; name?: string; disabled?: boolean; label?: string;
      };
      'kai-radio-group': JSX.HTMLAttributes<HTMLElement> & {
        value?: string; name?: string; disabled?: boolean; label?: string;
      };
      'kai-slider': JSX.HTMLAttributes<HTMLElement> & {
        min?: number | string; max?: number | string; step?: number | string;
        value?: number | string; disabled?: boolean; label?: string; name?: string;
        'value-label'?: boolean;
      };
      'kai-select': JSX.HTMLAttributes<HTMLElement> & {
        value?: string; placeholder?: string; multiple?: boolean; invalid?: boolean;
        disabled?: boolean; required?: boolean; label?: string; name?: string;
      };
    }
  }
}

const meta = { title: 'Labs/Foundations/Form Controls', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj;

// Hand-written HTML for the "Show code" panel, so consumers see real kai-* markup
// (scalars as attributes, arrays as JS properties) instead of generated Solid JSX.
const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

const OPTIONS = [
  { value: 'blocking', label: 'Blocking', description: 'Pages the on-call immediately.' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'cosmetic', label: 'Cosmetic' },
];

/** `<kai-checkbox>` in every state. `checked` is settable and reflected to the attribute. */
export const Checkboxes: Story = {
  render: () => (
    <div class="flex items-center gap-6">
      <label class="inline-flex cursor-pointer items-center gap-2.5">
        <kai-checkbox label="Unchecked" ref={withActions} /> <span>Unchecked</span>
      </label>
      <label class="inline-flex cursor-pointer items-center gap-2.5">
        <kai-checkbox default-checked label="Checked" ref={withActions} /> <span>Checked</span>
      </label>
      <label class="inline-flex cursor-pointer items-center gap-2.5">
        <kai-checkbox indeterminate label="Mixed" ref={withActions} /> <span>Mixed</span>
      </label>
      <label class="inline-flex items-center gap-2.5 opacity-100">
        <kai-checkbox disabled default-checked label="Locked" /> <span>Locked</span>
      </label>
    </div>
  ),
  parameters: src(`<kai-checkbox label="Stream responses"></kai-checkbox>
<kai-checkbox default-checked label="Stream responses"></kai-checkbox>
<kai-checkbox indeterminate label="Some tools enabled"></kai-checkbox>
<kai-checkbox disabled default-checked label="Locked"></kai-checkbox>

<script type="module">
  import '@kitn.ai/ui/elements';
  const box = document.querySelector('kai-checkbox');
  box.addEventListener('kai-change', (e) => console.log(e.detail.checked));
  box.checked = true;   // drive it
  box.toggle();         // flip it (fires kai-change)
</script>`),
};

/** Driving `<kai-checkbox>` from the host: read `el.checked`, write it, listen for `kai-change`. */
export const CheckboxState: Story = {
  name: 'Checkbox — host state',
  render: () => {
    const [seen, setSeen] = createSignal('—');
    let box!: HTMLElement & { checked: boolean; toggle: () => void };
    return (
      <div class="flex items-center gap-4">
        <kai-checkbox
          label="Save transcripts"
          ref={(el: HTMLElement) => {
            box = el as typeof box;
            withActions(el);
            el.addEventListener('kai-change', (e) => setSeen(String((e as CustomEvent).detail.checked)));
          }}
        />
        <button type="button" class="rounded-md border border-border px-2 py-1 text-sm" onClick={() => box.toggle()}>
          toggle()
        </button>
        <code class="text-xs">last kai-change: {seen()}</code>
      </div>
    );
  },
  parameters: src(`<kai-checkbox label="Save transcripts"></kai-checkbox>
<script type="module">
  const box = document.querySelector('kai-checkbox');
  box.addEventListener('kai-change', (e) => console.log(e.detail.checked));
  box.toggle();
</script>`),
};

const ENVIRONMENTS = [
  { value: 'prod', label: 'Production', description: 'Pages the on-call immediately.' },
  { value: 'staging', label: 'Staging' },
  { value: 'dev', label: 'Development' },
];

/**
 * `<kai-checkbox-group>` — the "pick any number" sibling of `<kai-radio-group>`, same
 * options shape and same row chrome. `options` is an ARRAY, so it is set as a JS
 * property, never an attribute. Scalars (`value`, `label`, `name`, `disabled`) are
 * attributes.
 */
export const CheckboxGroup: Story = {
  render: () => {
    // Array props are assigned from `onMount` with a VARIABLE ref, not from a ref
    // callback: the callback runs before the element is in the document, and the
    // assignment does not survive.
    let el!: HTMLElement & { options?: readonly unknown[]; values: string[] };
    onMount(() => {
      el.options = ENVIRONMENTS;
      el.values = ['prod', 'dev'];
      withActions(el);
    });
    return (
      <div class="max-w-md">
        <kai-checkbox-group ref={el} label="Environments" />
      </div>
    );
  },
  parameters: src(`<kai-checkbox-group label="Environments" name="env"></kai-checkbox-group>

<script type="module">
  import '@kitn.ai/ui/elements';
  const group = document.querySelector('kai-checkbox-group');
  // ARRAY prop — a JS property, never an attribute.
  group.options = [
    { value: 'prod', label: 'Production', description: 'Pages the on-call immediately.' },
    { value: 'staging', label: 'Staging' },
    { value: 'dev', label: 'Development' },
  ];
  group.addEventListener('kai-change', (e) => console.log(e.detail.values));
  group.values = ['prod', 'dev'];   // drive the whole selection (no kai-change)
</script>`),
};

/**
 * Reading and writing the whole selection from the host through `el.values`, and the
 * group disabled. `el.value` is the FIRST selected option; `values` is the rest, the
 * same pair `<kai-select multiple>` exposes.
 */
export const CheckboxGroupState: Story = {
  name: 'Checkbox group — host state',
  render: () => {
    const [seen, setSeen] = createSignal('none yet');
    let group!: HTMLElement & { options?: readonly unknown[]; values: string[] };
    let locked!: HTMLElement & { options?: readonly unknown[]; values: string[] };
    onMount(() => {
      group.options = ENVIRONMENTS;
      locked.options = ENVIRONMENTS;
      locked.values = ['prod'];
      withActions(group);
      group.addEventListener('kai-change', (e) => setSeen(JSON.stringify((e as CustomEvent).detail.values)));
    });
    return (
      <div class="flex max-w-md flex-col gap-3">
        <kai-checkbox-group ref={group} label="Environments" name="env" />
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-md border border-border px-2 py-1 text-sm"
            onClick={() => { group.values = ['staging', 'dev']; }}
          >
            el.values = ["staging","dev"]
          </button>
          <code class="text-xs">last kai-change: {seen()}</code>
        </div>
        <kai-checkbox-group ref={locked} disabled label="Environments, locked" />
      </div>
    );
  },
  parameters: src(`const group = document.querySelector('kai-checkbox-group');
group.options = [...];
group.values = ['staging', 'dev'];        // drive it (no kai-change)
group.addEventListener('kai-change', (e) => console.log(e.detail.values));`),
};

/**
 * `<kai-radio-group>` — `options` is an ARRAY, so it is set as a JS property, never an
 * attribute. Scalars (`value`, `label`, `disabled`) are attributes.
 */
export const RadioGroup: Story = {
  render: () => {
    // Array props are assigned from `onMount` with a VARIABLE ref, not from a ref
    // callback: the callback runs before the element is in the document, and the
    // assignment does not survive. This is the shape `nav.stories.tsx` uses for
    // `kai-nav`'s `items`, for the same reason.
    let el!: HTMLElement & { options?: readonly unknown[] };
    onMount(() => { el.options = OPTIONS; });
    return (
      <div class="max-w-md">
        <kai-radio-group ref={el} value="degraded" label="Severity" />
      </div>
    );
  },
  parameters: src(`<kai-radio-group value="degraded" label="Severity"></kai-radio-group>

<script type="module">
  import '@kitn.ai/ui/elements';
  const group = document.querySelector('kai-radio-group');
  // ARRAY prop — a JS property, never an attribute.
  group.options = [
    { value: 'blocking', label: 'Blocking', description: 'Pages the on-call immediately.' },
    { value: 'degraded', label: 'Degraded' },
    { value: 'cosmetic', label: 'Cosmetic' },
  ];
  group.addEventListener('kai-change', (e) => console.log(e.detail.value));
  group.value = 'cosmetic';   // drive it
</script>`),
};

/** Reading and writing the selection from the host, and the whole group disabled. */
export const RadioGroupState: Story = {
  name: 'Radio group — host state',
  render: () => {
    const [seen, setSeen] = createSignal('none yet');
    let group!: HTMLElement & { value: string; options?: readonly unknown[] };
    let locked!: HTMLElement & { options?: readonly unknown[] };
    onMount(() => {
      group.options = OPTIONS;
      locked.options = OPTIONS;
      withActions(group);
      group.addEventListener('kai-change', (e) => setSeen(String((e as CustomEvent).detail.value)));
    });
    return (
      <div class="flex max-w-md flex-col gap-3">
        <kai-radio-group ref={group} value="degraded" label="Severity" />
        <div class="flex items-center gap-3">
          <button type="button" class="rounded-md border border-border px-2 py-1 text-sm" onClick={() => { group.value = 'cosmetic'; }}>
            el.value = "cosmetic"
          </button>
          <code class="text-xs">last kai-change: {seen()}</code>
        </div>
        <kai-radio-group ref={locked} disabled value="degraded" label="Severity, locked" />
      </div>
    );
  },
  parameters: src(`const group = document.querySelector('kai-radio-group');
group.options = [...];
group.value = 'cosmetic';                 // drive it (no kai-change)
group.addEventListener('kai-change', (e) => console.log(e.detail.value));`),
};

const MODELS = [
  { value: 'opus', label: 'Claude Opus' },
  { value: 'sonnet', label: 'Claude Sonnet' },
  { value: 'haiku', label: 'Claude Haiku' },
  { value: 'legacy', label: 'Legacy (retired)', disabled: true },
];

/**
 * `<kai-slider>` — every scalar is an attribute. `min` and `max` have no defaults on
 * the primitive; the element falls back to the native range defaults (0..100) so an
 * author who wrote neither attribute gets exactly what a bare `<input type="range">`
 * would give them.
 */
export const Sliders: Story = {
  render: () => (
    <div class="flex max-w-sm flex-col gap-4">
      <kai-slider min={0} max={100} step={1} value={40} label="Temperature" ref={withActions} />
      <kai-slider min={0} max={1} step={0.05} value={0.7} label="Top P" ref={withActions} />
      <kai-slider min={0} max={100} value={60} disabled label="Locked" />
    </div>
  ),
  parameters: src(`<kai-slider min="0" max="100" step="1" value="40" label="Temperature"></kai-slider>
<kai-slider min="0" max="1" step="0.05" value="0.7" label="Top P"></kai-slider>
<kai-slider min="0" max="100" value="60" disabled label="Locked"></kai-slider>

<script type="module">
  import '@kitn.ai/ui/elements';
  const slider = document.querySelector('kai-slider');
  slider.addEventListener('kai-input', (e) => console.log('dragging', e.detail.value));
  slider.addEventListener('kai-change', (e) => console.log('committed', e.detail.value));
  slider.value = 70;   // drive it (no event — the host already knows)
</script>`),
};

/**
 * The readout. `value-label` is a bare ATTRIBUTE for the plain number; for anything
 * else, assign a formatter to the `valueLabel` PROPERTY, because a function cannot
 * survive an attribute. It is `aria-hidden`, so the slider announces its value once.
 */
export const SliderValueLabel: Story = {
  name: 'Slider — value readout',
  render: () => {
    let pct!: HTMLElement & { valueLabel: (v: number) => string };
    let dur!: HTMLElement & { valueLabel: (v: number) => string };
    onMount(() => {
      pct.valueLabel = (v) => `${v}%`;
      dur.valueLabel = (v) => `${Math.floor(v / 60)}m ${String(v % 60).padStart(2, '0')}s`;
    });
    return (
      <div class="flex max-w-sm flex-col gap-4">
        <kai-slider min={0} max={100} value={40} value-label label="Plain number" />
        <kai-slider ref={pct} min={0} max={100} value={60} label="Percentage" />
        <kai-slider ref={dur} min={0} max={600} step={15} value={90} label="Duration" />
      </div>
    );
  },
  parameters: src(`<kai-slider min="0" max="100" value="40" value-label label="Temperature"></kai-slider>

<script type="module">
  import '@kitn.ai/ui/elements';
  // A FUNCTION is not a scalar, so the formatter is a property, never an attribute.
  const slider = document.querySelectorAll('kai-slider')[1];
  slider.valueLabel = (v) => v + '%';
</script>`),
};

/** Driving `<kai-slider>` from the host: read `el.value`, write it, watch both events. */
export const SliderState: Story = {
  name: 'Slider — host state',
  render: () => {
    const [live, setLive] = createSignal('—');
    const [done, setDone] = createSignal('—');
    let el!: HTMLElement & { value: number };
    return (
      <div class="flex max-w-sm flex-col gap-3">
        <kai-slider
          min={0}
          max={100}
          step={5}
          value={25}
          label="Sampling budget"
          ref={(node: HTMLElement) => {
            el = node as typeof el;
            withActions(node);
            node.addEventListener('kai-input', (e) => setLive(String((e as CustomEvent).detail.value)));
            node.addEventListener('kai-change', (e) => setDone(String((e as CustomEvent).detail.value)));
          }}
        />
        <div class="flex items-center gap-3">
          <button type="button" class="rounded-md border border-border px-2 py-1 text-sm" onClick={() => { el.value = 75; }}>
            el.value = 75
          </button>
          <code class="text-xs">kai-input: {live()} · kai-change: {done()}</code>
        </div>
      </div>
    );
  },
  parameters: src(`const slider = document.querySelector('kai-slider');
slider.value = 75;                        // drive it (no event)
slider.addEventListener('kai-input', (e) => console.log(e.detail.value));
slider.addEventListener('kai-change', (e) => console.log(e.detail.value));`),
};

/**
 * `<kai-select>` — `options` is an ARRAY, so it is set as a JS property, never an
 * attribute. Scalars (`value`, `placeholder`, `disabled`, `invalid`) are attributes.
 * The closed control is the kit's; the open dropdown stays the platform's.
 */
export const Select: Story = {
  render: () => {
    // Array props are assigned from `onMount` with a VARIABLE ref, not from a ref
    // callback: the callback runs before the element is in the document, and the
    // assignment does not survive.
    let chosen!: HTMLElement & { options?: readonly unknown[] };
    let empty!: HTMLElement & { options?: readonly unknown[] };
    let bad!: HTMLElement & { options?: readonly unknown[] };
    let off!: HTMLElement & { options?: readonly unknown[] };
    onMount(() => {
      for (const el of [chosen, empty, bad, off]) el.options = MODELS;
    });
    return (
      <div class="flex max-w-sm flex-col gap-3">
        <kai-select ref={chosen} value="sonnet" label="Model" />
        <kai-select ref={empty} placeholder="Choose a model…" label="Model, nothing chosen" />
        <kai-select ref={bad} value="opus" invalid label="Model, invalid" />
        <kai-select ref={off} value="opus" disabled label="Model, locked" />
      </div>
    );
  },
  parameters: src(`<kai-select value="sonnet" label="Model"></kai-select>
<kai-select placeholder="Choose a model…" label="Model"></kai-select>

<script type="module">
  import '@kitn.ai/ui/elements';
  const select = document.querySelector('kai-select');
  // ARRAY prop — a JS property, never an attribute.
  select.options = [
    { value: 'opus', label: 'Claude Opus' },
    { value: 'sonnet', label: 'Claude Sonnet' },
    { value: 'legacy', label: 'Legacy (retired)', disabled: true },
  ];
  select.addEventListener('kai-change', (e) => console.log(e.detail.value, e.detail.values));
  select.value = 'haiku';   // drive it (no kai-change — the host already knows)
</script>`),
};

/**
 * `multiple` renders the platform list box and no chevron. Read the whole selection
 * from `el.values` (or `e.detail.values`) — `value` alone would be a silent drop.
 */
export const SelectMultiple: Story = {
  name: 'Select — multiple',
  render: () => {
    const [seen, setSeen] = createSignal('—');
    let el!: HTMLElement & { options?: readonly unknown[]; values: string[] };
    onMount(() => {
      el.options = MODELS;
      withActions(el);
      el.addEventListener('kai-change', (e) => setSeen(JSON.stringify((e as CustomEvent).detail.values)));
    });
    return (
      <div class="flex max-w-sm flex-col gap-3">
        <kai-select ref={el} multiple label="Models" />
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-md border border-border px-2 py-1 text-sm"
            onClick={() => { el.values = ['opus', 'haiku']; }}
          >
            el.values = ["opus","haiku"]
          </button>
          <code class="text-xs">kai-change: {seen()}</code>
        </div>
      </div>
    );
  },
  parameters: src(`<kai-select multiple label="Models"></kai-select>

<script type="module">
  const select = document.querySelector('kai-select');
  select.options = [...];
  select.values = ['opus', 'haiku'];   // drive the whole selection
  select.addEventListener('kai-change', (e) => console.log(e.detail.values));
</script>`),
};
