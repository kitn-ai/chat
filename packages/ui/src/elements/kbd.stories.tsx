import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import './kbd';

// Declare the custom element tag for SolidJS JSX.
declare module '@solidjs/web' { // V2-PORT: the JSX namespace moved
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'kai-kbd': JSX.HTMLAttributes<HTMLElement> & { keys?: string; platform?: string; size?: string; theme?: string };
    }
  }
}

const meta: Meta = {
  title: 'Labs/Foundations/Kbd',
};
export default meta;

const src = (code: string) => ({ docs: { source: { language: 'html', code } } });

export const States: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: '1.5rem', 'align-items': 'center', 'flex-wrap': 'wrap', padding: '1rem' }}>
      <kai-kbd keys="Mod+K" platform="mac"></kai-kbd>
      <kai-kbd keys="Mod+Shift+ArrowUp" platform="mac"></kai-kbd>
      <kai-kbd keys="Ctrl+Esc" platform="other"></kai-kbd>
      <kai-kbd keys="Alt+Enter" platform="mac"></kai-kbd>
      <kai-kbd keys="Mod+K" platform="mac" size="sm"></kai-kbd>
      <kai-kbd>Esc</kai-kbd>
    </div>
  ),
  parameters: src(`<!-- All scalar props: set as plain attributes. Display only; does not bind keys. -->
<kai-kbd keys="Mod+K" platform="mac"></kai-kbd>
<kai-kbd keys="Mod+Shift+ArrowUp" platform="mac"></kai-kbd>
<kai-kbd keys="Ctrl+Esc" platform="other"></kai-kbd>
<kai-kbd keys="Alt+Enter" platform="mac"></kai-kbd>
<kai-kbd keys="Mod+K" platform="mac" size="sm"></kai-kbd>
<!-- Omit keys to render your own content -->
<kai-kbd>Esc</kai-kbd>`),
};
