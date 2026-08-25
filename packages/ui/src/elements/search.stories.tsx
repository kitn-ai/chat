import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import './search';

// Declare the custom element tag for SolidJS JSX.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-search': JSX.HTMLAttributes<HTMLElement> & {
        value?: string;
        placeholder?: string;
        icon?: string;
        debounce?: number;
        loading?: boolean;
        shortcut?: string;
        theme?: string;
      };
    }
  }
}

const meta: Meta = {
  title: 'Labs/Foundations/Search',
};
export default meta;

const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

const frameStyle = {
  display: 'flex',
  'flex-direction': 'column',
  gap: '1.5rem',
  'max-width': '24rem',
  padding: '1rem',
} as const;

/** The default field: leading search icon, `Search…` placeholder, debounced. */
export const Default: StoryObj = {
  render: () => (
    <div style={frameStyle}>
      <kai-search></kai-search>
    </div>
  ),
  parameters: src(`<!-- Debounced kai-search; listen on the element. -->
<kai-search></kai-search>
<script type="module">
  import '@kitn.ai/ui/elements';
  const s = document.querySelector('kai-search');
  s.addEventListener('kai-search', (e) => console.log('filter', e.detail.value));
  s.addEventListener('kai-submit', (e) => console.log('submit', e.detail.value));
</script>`),
};

/** A shortcut hint (kai-kbd) shows while the field is empty. */
export const WithShortcut: StoryObj = {
  render: () => (
    <div style={frameStyle}>
      <kai-search placeholder="Search docs" shortcut="Mod+K"></kai-search>
    </div>
  ),
  parameters: src(`<kai-search placeholder="Search docs" shortcut="Mod+K"></kai-search>`),
};

/** Loading swaps the leading icon for a spinner. */
export const Loading: StoryObj = {
  render: () => (
    <div style={frameStyle}>
      <kai-search placeholder="Searching…" loading></kai-search>
    </div>
  ),
  parameters: src(`<kai-search placeholder="Searching…" loading></kai-search>`),
};

/** Controlled: seed `value`; the clear (×) button appears once there's a query. */
export const Controlled: StoryObj = {
  render: () => (
    <div style={frameStyle}>
      <kai-search value="annual report" placeholder="Search files"></kai-search>
    </div>
  ),
  parameters: src(`<kai-search value="annual report" placeholder="Search files"></kai-search>
<script type="module">
  const s = document.querySelector('kai-search');
  s.value = 'annual report'; // drive it; read s.value for live state
</script>`),
};
