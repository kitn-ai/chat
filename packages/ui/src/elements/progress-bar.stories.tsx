import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import type { JSX } from '@solidjs/web';
import './progress-bar';

// Declare the custom element tag for SolidJS JSX.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-progress-bar': JSX.HTMLAttributes<HTMLElement> & {
        value?: number | string;
        max?: number | string;
        label?: string;
        tone?: string;
        theme?: string;
      };
    }
  }
}

const meta: Meta = {
  title: 'Labs/Foundations/Progress Bar',
};
export default meta;

// Hand-written HTML for the "Show code" panel (real consumer markup, not JSX).
const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

const col: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  gap: '1rem',
  'max-width': '360px',
  padding: '1rem',
};

export const Values: StoryObj = {
  render: () => (
    <div style={col}>
      <kai-progress-bar value={30}></kai-progress-bar>
      <kai-progress-bar value={66}></kai-progress-bar>
      <kai-progress-bar value={100}></kai-progress-bar>
    </div>
  ),
  parameters: src(`<kai-progress-bar value="30"></kai-progress-bar>
<kai-progress-bar value="66"></kai-progress-bar>
<kai-progress-bar value="100"></kai-progress-bar>`),
};

export const WithLabel: StoryObj = {
  render: () => (
    <div style={col}>
      <kai-progress-bar value={3} max={5} label="Setup"></kai-progress-bar>
    </div>
  ),
  parameters: src(`<!-- max defaults to 100; here it counts to 5. -->
<kai-progress-bar value="3" max="5" label="Setup"></kai-progress-bar>`),
};

export const Tones: StoryObj = {
  render: () => (
    <div style={col}>
      <kai-progress-bar value={60} label="primary" tone="primary"></kai-progress-bar>
      <kai-progress-bar value={60} label="success" tone="success"></kai-progress-bar>
      <kai-progress-bar value={60} label="warning" tone="warning"></kai-progress-bar>
      <kai-progress-bar value={60} label="error" tone="error"></kai-progress-bar>
      <kai-progress-bar value={60} label="info" tone="info"></kai-progress-bar>
    </div>
  ),
  parameters: src(`<kai-progress-bar value="60" tone="primary"></kai-progress-bar>
<kai-progress-bar value="60" tone="success"></kai-progress-bar>
<kai-progress-bar value="60" tone="warning"></kai-progress-bar>
<kai-progress-bar value="60" tone="error"></kai-progress-bar>
<kai-progress-bar value="60" tone="info"></kai-progress-bar>`),
};
