import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import './editable-label';

// Declare the custom element tag for SolidJS JSX.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-editable-label': JSX.HTMLAttributes<HTMLElement> & {
        value?: string;
        editing?: boolean;
        placeholder?: string;
        disabled?: boolean;
        theme?: string;
      };
    }
  }
}

const meta: Meta = {
  title: 'Labs/Foundations/EditableLabel',
};
export default meta;

const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

const frameStyle = {
  display: 'flex',
  'flex-direction': 'column',
  gap: '1rem',
  'align-items': 'flex-start',
  padding: '1rem',
} as const;

/** Double-click to rename. Enter or blur commits; Esc reverts. */
export const Default: StoryObj = {
  render: () => (
    <div style={frameStyle}>
      <kai-editable-label value="Project Alpha"></kai-editable-label>
      <kai-editable-label value="Double-click to rename"></kai-editable-label>
    </div>
  ),
  parameters: src(`<kai-editable-label value="Project Alpha"></kai-editable-label>
<script type="module">
  import '@kitn.ai/ui/elements';
  const label = document.querySelector('kai-editable-label');
  label.addEventListener('kai-rename', (e) => console.log('renamed', e.detail.value));
  label.addEventListener('kai-cancel', () => console.log('cancelled'));
  // label.edit();   // open the field programmatically
  // label.commit(); // commit the current text
  // label.cancel(); // discard and restore
</script>`),
};

/** Opens in edit mode via the `editing` attribute. */
export const StartEditing: StoryObj = {
  render: () => (
    <div style={frameStyle}>
      <kai-editable-label value="Rename me" editing></kai-editable-label>
    </div>
  ),
  parameters: src(`<kai-editable-label value="Rename me" editing></kai-editable-label>`),
};

/** Disabled never enters edit mode. */
export const Disabled: StoryObj = {
  render: () => (
    <div style={frameStyle}>
      <kai-editable-label value="Locked name" disabled></kai-editable-label>
    </div>
  ),
  parameters: src(`<kai-editable-label value="Locked name" disabled></kai-editable-label>`),
};
