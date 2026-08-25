import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import './input';

// Declare the custom element tag for SolidJS JSX.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-input': JSX.HTMLAttributes<HTMLElement> & {
        type?: string;
        value?: string;
        placeholder?: string;
        label?: string;
        hint?: string;
        error?: string;
        size?: string;
        disabled?: boolean;
        readonly?: boolean;
        required?: boolean;
        invalid?: boolean;
        name?: string;
        theme?: string;
      };
    }
  }
}

const meta: Meta = {
  title: 'Labs/Foundations/Input',
};
export default meta;

const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

/** All scalar props are plain attributes. Listen for `kai-input` (per keystroke)
 *  and `kai-change` (commit); drive/read the value with the `value` property. */
export const Default: StoryObj = {
  render: () => (
    <div style={{ 'max-width': '24rem', padding: '1rem' }}>
      <kai-input label="Workspace name" placeholder="Acme Inc."></kai-input>
    </div>
  ),
  parameters: src(`<kai-input label="Workspace name" placeholder="Acme Inc."></kai-input>
<script type="module">
  import '@kitn.ai/ui/elements';
  const field = document.querySelector('kai-input');
  field.addEventListener('kai-input', (e) => console.log(e.detail.value));
  field.addEventListener('kai-change', (e) => save(e.detail.value));
</script>`),
};

/** A labelled field with helper text below it. */
export const WithLabelAndHint: StoryObj = {
  render: () => (
    <div style={{ 'max-width': '24rem', padding: '1rem' }}>
      <kai-input label="Workspace name" hint="Shown to everyone you invite." placeholder="Acme Inc."></kai-input>
    </div>
  ),
  parameters: src(`<kai-input
  label="Workspace name"
  hint="Shown to everyone you invite."
  placeholder="Acme Inc."
></kai-input>`),
};

/** The invalid state: a destructive border with the error text linked for a11y. */
export const Error: StoryObj = {
  render: () => (
    <div style={{ 'max-width': '24rem', padding: '1rem' }}>
      <kai-input label="Workspace name" value="a" error="Use at least 3 characters."></kai-input>
    </div>
  ),
  parameters: src(`<kai-input
  label="Workspace name"
  value="a"
  error="Use at least 3 characters."
></kai-input>`),
};

/** Both densities, side by side. */
export const Sizes: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.75rem', 'max-width': '24rem', padding: '1rem' }}>
      <kai-input size="sm" label="Small" placeholder="Compact density"></kai-input>
      <kai-input size="md" label="Medium" placeholder="Default density"></kai-input>
    </div>
  ),
  parameters: src(`<kai-input size="sm" label="Small" placeholder="Compact density"></kai-input>
<kai-input size="md" label="Medium" placeholder="Default density"></kai-input>`),
};

/** Affixes: a leading icon and a trailing inline button, both wrapped by the field
 *  border. Slot content lights up the affix row only when filled. */
export const WithAffixes: StoryObj = {
  render: () => (
    <div style={{ 'max-width': '24rem', padding: '1rem' }}>
      <kai-input label="Find a project" placeholder="Search projects">
        <svg
          slot="leading"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <button slot="trailing" type="button" style={{ font: 'inherit', color: 'var(--color-primary)', cursor: 'pointer' }}>
          Go
        </button>
      </kai-input>
    </div>
  ),
  parameters: src(`<kai-input label="Find a project" placeholder="Search projects">
  <svg slot="leading" viewBox="0 0 24 24" width="16" height="16"><!-- search icon --></svg>
  <button slot="trailing" type="button">Go</button>
</kai-input>`),
};
